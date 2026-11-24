// 1.5.5 不变式的随机编辑测试（阶段 2 验收）：每次编辑后重新解析受影响的块，
// 然后检查：① parse(serialize(doc)) 和 doc 结构相同；② 没动过的块（连同它们之间的空行）逐字节不变
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { blockChildren, isBlankParagraph, makeLeaf, type MdNode } from "../src/model.ts";
import { parse } from "../src/parse.ts";
import { applyReplacement, reconcile, sameStructure } from "../src/reconcile.ts";
import { serialize, serializeRange } from "../src/serialize.ts";
import { corpusCases } from "./corpus.ts";
import { collectTargets, insertAt, nodeAt, replaceAt, textOf, withAttrs, withText, type Path } from "./edits.ts";

const documents = corpusCases().filter((testCase) => testCase.name.startsWith("documents/"));
const specExamples = corpusCases().filter((testCase) => !testCase.name.startsWith("documents/"));

// 插入的文字故意带上各种 Markdown 记号，编辑后常常改变块的结构
const PIECES = ["a", "字", " ", "*", "**", "_", "`", "```", "#", "# ", "- ", "1. ", "> ", "|", "[", "]", "(", ")", "!", "$", "$$", "=", "===", "---", "~", "<", "<div>", ":", "\n", "\t", "[^1]", "[TOC]", "\\"];

const editArbitrary = fc.record({
  kind: fc.constantFrom("type", "type", "type", "delete", "remove", "insert", "split", "heading", "task", "info", "align"),
  target: fc.nat(),
  position: fc.nat(),
  length: fc.integer({ min: 0, max: 6 }),
  pieces: fc.array(fc.constantFrom(...PIECES), { minLength: 1, maxLength: 4 }),
  value: fc.nat(),
});

type Edit = fc.Arbitrary<typeof editArbitrary extends fc.Arbitrary<infer T> ? T : never> extends fc.Arbitrary<infer U> ? U : never;

function pick<T>(items: T[], index: number): T | undefined {
  return items.length ? items[index % items.length] : undefined;
}

/** 执行一次编辑，返回新文档和改动所在的顶层块范围；没有可编辑的目标时返回 null */
function applyEdit(doc: MdNode, edit: Edit): { doc: MdNode; from: number; to: number } | null {
  const targets = collectTargets(doc);
  const topRange = (path: Path, inserted = 0) => ({ from: path[0], to: path[0] + 1 + inserted });
  switch (edit.kind) {
    case "type":
    case "delete": {
      const path = pick(targets.leaves, edit.target);
      if (!path) return null;
      const node = nodeAt(doc, path);
      const text = textOf(node);
      const at = edit.position % (text.length + 1);
      const next =
        edit.kind === "type"
          ? text.slice(0, at) + edit.pieces.join("") + text.slice(at)
          : text.slice(0, at) + text.slice(Math.min(text.length, at + edit.length + 1));
      return { doc: replaceAt(doc, path, (old) => [withText(old, next)]), ...topRange(path) };
    }
    case "remove": {
      const path = pick(targets.removable, edit.target);
      if (!path) return null;
      return { doc: replaceAt(doc, path, () => []), from: path[0], to: path.length === 1 ? path[0] : path[0] + 1 };
    }
    case "insert": {
      const container = pick(targets.flows, edit.target);
      if (!container) return null;
      const size = blockChildren(nodeAt(doc, container)).length;
      const index = edit.position % (size + 1);
      const paragraph = makeLeaf("paragraph", { indent: "" }, edit.pieces.join("").replace(/\n/g, " ") || "新段落");
      const nextDoc = insertAt(doc, container, index, [paragraph]);
      return container.length === 0 ? { doc: nextDoc, from: index, to: index + 1 } : { doc: nextDoc, ...topRange(container) };
    }
    case "split": {
      const path = targets.leaves.filter((candidate) => nodeAt(doc, candidate).type === "paragraph")[edit.target % Math.max(1, targets.leaves.length)];
      if (!path) return null;
      const node = nodeAt(doc, path);
      const text = textOf(node);
      const at = edit.position % (text.length + 1);
      const second = makeLeaf("paragraph", { indent: "" }, text.slice(at).replace(/^\n/, ""));
      return { doc: replaceAt(doc, path, (old) => [withText(old, text.slice(0, at)), second]), ...topRange(path, path.length === 1 ? 1 : 0) };
    }
    case "heading": {
      const path = pick(targets.headings, edit.target);
      if (!path) return null;
      return { doc: replaceAt(doc, path, (old) => [withAttrs(old, { level: 1 + (edit.value % 6) })]), ...topRange(path) };
    }
    case "task": {
      const path = pick(targets.listItems, edit.target);
      if (!path) return null;
      const states = [null, false, true];
      return { doc: replaceAt(doc, path, (old) => [withAttrs(old, { checked: states[edit.value % 3] })]), ...topRange(path) };
    }
    case "info": {
      const path = pick(targets.codeBlocks, edit.target);
      if (!path) return null;
      const infos = ["", "js", "python", "mermaid", "math", "ts title=\"x\""];
      return { doc: replaceAt(doc, path, (old) => [withAttrs(old, { info: infos[edit.value % infos.length] })]), ...topRange(path) };
    }
    case "align": {
      const path = pick(targets.tables, edit.target);
      if (!path) return null;
      const table = nodeAt(doc, path);
      const align = [...((table.attrs?.align as unknown[]) ?? [])];
      if (!align.length) return null;
      const choices = [null, "left", "center", "right"];
      align[edit.position % align.length] = choices[edit.value % 4];
      return { doc: replaceAt(doc, path, (old) => [withAttrs(old, { align })]), ...topRange(path) };
    }
    default:
      return null;
  }
}

/** 每个顶层块之前（含块前空行）的输出长度，以及每个块自己（不含块前空行）的长度 */
function layout(doc: MdNode): { prefix: number[]; own: number[]; text: string } {
  const blocks = blockChildren(doc);
  const prefix = [doc.attrs?.bom ? 1 : 0];
  const own: number[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    prefix.push(prefix[i] + serializeRange(doc, i, i + 1).length);
    own.push(serializeRange(doc, i, i + 1, false).length);
  }
  return { prefix, own, text: serialize(doc) };
}

function runEdits(source: string, edits: Edit[]): void {
  let doc = parse(source);
  expect(serialize(doc)).toBe(source);
  for (const edit of edits) {
    const before = layout(doc);
    const oldBlocks = blockChildren(doc);
    const result = applyEdit(doc, edit);
    if (!result) continue;
    doc = result.doc;
    const replacement = reconcile(doc, Math.min(result.from, result.to), Math.max(result.from, result.to));
    if (replacement) doc = applyReplacement(doc, replacement);

    const text = serialize(doc);
    // ① 结构和重新解析的结果一致
    const reparsed = parse(text);
    expect(sameStructure(doc, reparsed), `不变式：${JSON.stringify(edit)}\n${text}`).toBe(true);

    // ② 前后没动过的顶层块（同一个对象）逐字节不变：前面的连同块前空行，后面的不含第一个块前空行
    const newBlocks = blockChildren(doc);
    let head = 0;
    while (head < oldBlocks.length && head < newBlocks.length && oldBlocks[head] === newBlocks[head]) head += 1;
    let tail = 0;
    while (
      tail < oldBlocks.length - head &&
      tail < newBlocks.length - head &&
      oldBlocks[oldBlocks.length - 1 - tail] === newBlocks[newBlocks.length - 1 - tail]
    ) {
      tail += 1;
    }
    expect(text.slice(0, before.prefix[head])).toBe(before.text.slice(0, before.prefix[head]));
    // 后面保留的块里第一个不是空段落的（空段落不输出）
    let first = oldBlocks.length - tail;
    while (first < oldBlocks.length && isBlankParagraph(oldBlocks[first])) first += 1;
    if (first < oldBlocks.length) {
      const suffixStart = before.prefix[first + 1] - before.own[first];
      const suffix = before.text.slice(suffixStart);
      expect(text.endsWith(suffix), `后面没动过的块：${JSON.stringify(edit)}`).toBe(true);
    }
  }
}

describe("不变式：随机编辑后结构和重新解析一致，没改的块逐字节不变", () => {
  it("真实文档", () => {
    fc.assert(
      fc.property(fc.constantFrom(...documents), fc.array(editArbitrary, { minLength: 1, maxLength: 8 }), (testCase, edits) => {
        runEdits(testCase.source, edits);
      }),
      { numRuns: Number(process.env.FUZZ_RUNS ?? 400) },
    );
  }, 600_000);

  it("规范里的例子", () => {
    fc.assert(
      fc.property(fc.constantFrom(...specExamples), fc.array(editArbitrary, { minLength: 1, maxLength: 5 }), (testCase, edits) => {
        runEdits(testCase.source, edits);
      }),
      { numRuns: Number(process.env.FUZZ_RUNS ?? 1500) },
    );
  }, 600_000);
});

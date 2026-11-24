// 随机编辑（不变式，1.5.5 节）：在真实的文档上随机放光标、随机按键、执行命令，每一步之后
// 1. 不抛异常；2. 光标挪开、对齐一次以后，文档和它序列化出来的 Markdown 重新解析的结构相同；
// 3. 改了原文的步骤都有撤销记录；一步步撤销，每撤一步回到那一步之前的原文，逐字节不变，撤销到底回到打开时的原文；
// 4. 再一步步重做，每一步回到那一步之后的原文（E-6）。
// 种子固定，失败时能重现；MARKO_FUZZ_SEED、MARKO_FUZZ_STEPS 可以换种子、加步数
import { parse, sameStructure } from "@marko/markdown";
import type { Editor } from "@tiptap/core";
import { closeHistory, undoDepth } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkoEditor, getMarkdown, getMarkdownWithSelection, setMarkdown } from "../src/index.ts";
import { RECONCILE } from "../src/plugins/meta.ts";
import { toModel } from "../src/state.ts";
import { repo } from "./helpers.ts";

const SEED = Number(process.env.MARKO_FUZZ_SEED ?? 20261124);
const STEPS = Number(process.env.MARKO_FUZZ_STEPS ?? 120);

/** 可重现的伪随机数（mulberry32） */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const CHARACTERS = ["a", "中", " ", "*", "_", "`", "#", "-", ">", "[", "]", "(", ")", "!", "|", "$", "~", "=", "1", ".", ":", "\\", "<", "&"];
const KEYS: Array<[string, KeyboardEventInit]> = [
  ["Enter", {}],
  ["Enter", { shiftKey: true }],
  ["Enter", { ctrlKey: true }],
  ["Backspace", {}],
  ["Delete", {}],
  ["Tab", {}],
  ["Tab", { shiftKey: true }],
  ["ArrowLeft", {}],
  ["ArrowRight", {}],
];
const COMMANDS = ["bold", "italic", "inlineCode", "heading2", "paragraph", "blockquote", "bulletList", "orderedList", "toggleTask", "codeBlock", "hr", "clearFormat", "moveLineUp", "moveLineDown", "deleteLine", "duplicateLine", "insertParagraphBelow", "indentLines", "outdentLines"];

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

function typeChar(char: string): void {
  const view = editor.view;
  const { from, to } = view.state.selection;
  const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, char, () => view.state.tr.insertText(char, from, to)));
  if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
}

function pressKey(key: string, init: KeyboardEventInit): void {
  const view = editor.view;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  const handled = view.someProp("handleKeyDown", (handler) => handler(view, event));
  // 编辑器不处理时浏览器的默认行为：文本块里删一个字符
  if (handled || (key !== "Backspace" && key !== "Delete")) return;
  const { $head, empty } = view.state.selection;
  if (!empty) {
    view.dispatch(view.state.tr.deleteSelection());
    return;
  }
  if (key === "Backspace" && $head.parentOffset > 0) view.dispatch(view.state.tr.delete($head.pos - 1, $head.pos));
  if (key === "Delete" && $head.parentOffset < $head.parent.content.size) view.dispatch(view.state.tr.delete($head.pos, $head.pos + 1));
}

/** 随机放光标（或选区）：文档里的文本位置 */
function placeSelection(next: () => number): void {
  const doc = editor.state.doc;
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) for (let offset = 0; offset <= node.content.size; offset += 1) positions.push(pos + 1 + offset);
    return !node.isTextblock;
  });
  if (!positions.length) return;
  const anchor = positions[Math.floor(next() * positions.length)];
  const head = next() < 0.2 ? positions[Math.floor(next() * positions.length)] : anchor;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(doc, anchor, head)));
}

/** 随机做一件事，返回做了什么 */
function act(next: () => number): string {
  const roll = next();
  if (roll < 0.45) {
    const char = CHARACTERS[Math.floor(next() * CHARACTERS.length)];
    typeChar(char);
    return `输入 ${JSON.stringify(char)}`;
  }
  if (roll < 0.8) {
    const [key, init] = KEYS[Math.floor(next() * KEYS.length)];
    pressKey(key, init);
    return `按键 ${key}${init.shiftKey ? "+Shift" : ""}${init.ctrlKey ? "+Ctrl" : ""}`;
  }
  const command = COMMANDS[Math.floor(next() * COMMANDS.length)];
  (editor.commands as unknown as Record<string, () => boolean>)[command]();
  return `命令 ${command}`;
}

/** 光标挪到开头（同按 Ctrl+Home）、强制对齐一次，然后文档要和它的 Markdown 一致 */
function checkInvariant(context: string): void {
  const before = getMarkdown(editor);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atStart(editor.state.doc)).setMeta(RECONCILE, true));
  const markdown = getMarkdown(editor);
  // 对齐只改结构，不改原文
  if (markdown !== before) throw new Error(`对齐改了原文：${context}\n${difference(before, markdown)}`);
  const fresh = parse(markdown, { syntax: editor.storage.marko.syntax });
  if (!sameStructure(toModel(editor.state.doc), fresh)) throw new Error(`结构和重新解析的不一样：${context}\n${markdown.slice(0, 400)}`);
}

/** 两段原文第一处不同的地方，前后各带一点上下文 */
function difference(expected: string, actual: string): string {
  let at = 0;
  while (at < expected.length && expected[at] === actual[at]) at += 1;
  const around = (value: string) => JSON.stringify(value.slice(Math.max(0, at - 60), at + 60));
  return `第一处不同在 ${at}：\n应该是 ${around(expected)}\n实际是 ${around(actual)}`;
}

const DOCUMENTS = ["sample-document.md", "nested-structures.md", "edge-cases.md", "table-heavy.md", "math-heavy.md"];

describe("随机编辑", () => {
  for (const [index, name] of DOCUMENTS.entries()) {
    it(`${name}：每一步之后文档和 Markdown 一致；一步步撤销、重做回到每一步前后的原文`, () => {
      const source = readFileSync(join(repo, "test", "corpus", "documents", name), "utf8");
      editor = createMarkoEditor();
      setMarkdown(editor, source);
      const next = random(SEED + index);
      const log: string[] = [];
      // 每个撤销记录：那一步之前、之后的原文，那一步做了什么
      const events: Array<{ before: string; after: string; action: string }> = [];
      for (let step = 0; step < STEPS; step += 1) {
        const before = getMarkdown(editor);
        const depth = undoDepth(editor.state);
        // 每一步单独一个撤销记录（真实输入隔得久、位置不相邻时也是这样分的）
        editor.view.dispatch(closeHistory(editor.state.tr));
        placeSelection(next);
        const text = getMarkdownWithSelection(editor);
        let action: string;
        try {
          action = `${step} ${act(next)}`;
        } catch (error) {
          throw new Error(`第 ${step} 步出错（前几步：${log.slice(-3).join("；")}）：${(error as Error).message}
选区 ${text.anchor}～${text.head}，原文开头 ${JSON.stringify(text.value.slice(0, 200))}`);
        }
        log.push(action);
        checkInvariant(log.slice(-5).join("；"));
        // 新的撤销记录：个数变了（超出上限时 ProseMirror 一次丢掉最早的一批，个数反而变少）
        const now = undoDepth(editor.state);
        if (now !== depth) {
          events.push({ before, after: getMarkdown(editor), action });
          if (events.length > now) events.splice(0, events.length - now);
        } else if (getMarkdown(editor) !== before) {
          throw new Error(`这一步改了原文，但没有撤销记录：${action}`);
        }
      }
      for (let event = events.length - 1; event >= 0; event -= 1) {
        editor.commands.undo();
        const restored = getMarkdown(editor);
        if (restored !== events[event].before) {
          throw new Error(`撤销「${events[event].action}」以后不是那一步之前的原文。${difference(events[event].before, restored)}`);
        }
      }
      // 最早的记录没被丢掉时，撤销到底就是打开时的原文
      if (events.length === 0 || events[0].action.startsWith("0 ")) expect(getMarkdown(editor)).toBe(source);
      expect(editor.can().undo()).toBe(false);
      for (const event of events) {
        editor.commands.redo();
        const redone = getMarkdown(editor);
        if (redone !== event.after) throw new Error(`重做「${event.action}」以后不是那一步之后的原文。${difference(event.after, redone)}`);
      }
    });
  }
});

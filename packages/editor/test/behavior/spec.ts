// 行为规格（test/behavior/*.md）的解析，格式见 test/behavior/README.md。
// 旧代码用的 test/behavior/legacy/spec.mjs 阶段 7 随旧代码删除，这里是新编辑器用的一份
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CURSOR = "‸";
const SELECTION_START = "⟦";
const SELECTION_END = "⟧";
const CARRIAGE_RETURN = "␍";

/** 带选区的源码：anchor 是 ⟦（或光标）的位置，head 是 ⟧ 的位置；反向选区 head < anchor */
export interface MarkedText {
  value: string;
  anchor: number;
  head: number;
}

export type Operation =
  | { kind: "key"; key: string }
  | { kind: "input"; text: string }
  | { kind: "command"; name: string; args: unknown[] }
  | { kind: "paste"; text?: string; html?: string; plain?: boolean };

export interface Spec {
  file: string;
  line: number;
  /** 功能编号，如 E-5 */
  id: string;
  title: string;
  before: MarkedText;
  after: MarkedText;
  /** 「操作：」后面的原文 */
  raw: string;
  op: Operation;
  /** 操作后面括号里的说明，如「Markdown 缩进宽度 4」「源码模式」 */
  note: string | null;
}

/** 去掉光标、选区标记，␍ 换回回车符 */
export function parseMarkedText(marked: string): MarkedText {
  let value = "";
  let cursor: number | null = null;
  let start: number | null = null;
  let end: number | null = null;
  for (const character of marked) {
    if (character === CURSOR) {
      if (cursor !== null) throw new Error("光标标记 ‸ 出现了不止一次");
      cursor = value.length;
    } else if (character === SELECTION_START) {
      if (start !== null) throw new Error("选区标记 ⟦ 出现了不止一次");
      start = value.length;
    } else if (character === SELECTION_END) {
      if (end !== null) throw new Error("选区标记 ⟧ 出现了不止一次");
      end = value.length;
    } else if (character === CARRIAGE_RETURN) {
      value += "\r";
    } else {
      value += character;
    }
  }
  if (cursor !== null) {
    if (start !== null || end !== null) throw new Error("光标 ‸ 和选区 ⟦⟧ 不能同时出现");
    return { value, anchor: cursor, head: cursor };
  }
  if (start === null || end === null) throw new Error("缺少光标 ‸ 或成对的选区标记 ⟦⟧");
  return { value, anchor: start, head: end };
}

/** parseMarkedText 的反向，失败时打印用 */
export function markText({ value, anchor, head }: MarkedText): string {
  let marked: string;
  if (anchor === head) {
    marked = value.slice(0, anchor) + CURSOR + value.slice(anchor);
  } else {
    const first = Math.min(anchor, head);
    const second = Math.max(anchor, head);
    const forward = anchor < head;
    marked =
      value.slice(0, first) +
      (forward ? SELECTION_START : SELECTION_END) +
      value.slice(first, second) +
      (forward ? SELECTION_END : SELECTION_START) +
      value.slice(second);
  }
  return marked.replace(/\r/g, CARRIAGE_RETURN);
}

/** 「`Enter`（说明）」「输入 "…"」「命令 name(参数)（说明）」「粘贴，text = "…"，html = "…"」 */
export function parseOperation(raw: string): { op: Operation; note: string | null } {
  let body = raw.trim();
  let note: string | null = null;
  const noteMatch = /（([^（）]*)）$/.exec(body);
  if (noteMatch && !body.startsWith("粘贴")) {
    note = noteMatch[1];
    body = body.slice(0, noteMatch.index).trim();
  }
  const key = /^(`+) ?(.+?) ?\1$/.exec(body);
  if (key) return { op: { kind: "key", key: key[2] }, note };
  if (body.startsWith("输入 ")) return { op: { kind: "input", text: JSON.parse(body.slice(3)) as string }, note };
  const command = /^命令 ([A-Za-z0-9]+)(?:\((.*)\))?$/.exec(body);
  if (command) {
    const args = command[2] === undefined || command[2] === "" ? [] : (JSON.parse(`[${command[2]}]`) as unknown[]);
    return { op: { kind: "command", name: command[1], args }, note };
  }
  if (body.startsWith("粘贴")) {
    const op: Operation = { kind: "paste", plain: body.startsWith("粘贴为纯文本") };
    for (const match of body.matchAll(/(text|html) = ("(?:[^"\\]|\\.)*")/g)) op[match[1] as "text" | "html"] = JSON.parse(match[2]) as string;
    return { op, note };
  }
  throw new Error(`看不懂的操作：${raw}`);
}

/** 解析一个规格文件 */
export function parseSpecFile(text: string, file: string): Spec[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const specs: Spec[] = [];
  let current: { line: number; id: string; title: string; before?: string; after?: string; raw?: string } | null = null;
  const finish = () => {
    if (!current) return;
    if (current.before === undefined || current.after === undefined || current.raw === undefined) {
      throw new Error(`${file}:${current.line} 规格缺少 before、after 或「操作：」`);
    }
    const { op, note } = parseOperation(current.raw);
    specs.push({
      file,
      line: current.line,
      id: current.id,
      title: current.title,
      before: parseMarkedText(current.before),
      after: parseMarkedText(current.after),
      raw: current.raw,
      op,
      note,
    });
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = /^(`{3,})(before|after)$/.exec(line);
    if (fence) {
      if (!current) throw new Error(`${file}:${index + 1} 代码块不在任何一条规格里`);
      const content: string[] = [];
      let closed = false;
      for (index += 1; index < lines.length; index += 1) {
        if (lines[index] === fence[1]) {
          closed = true;
          break;
        }
        content.push(lines[index]);
      }
      if (!closed) throw new Error(`${file}:${index + 1} ${fence[2]} 代码块没有结束`);
      current[fence[2] as "before" | "after"] = content.join("\n");
      continue;
    }
    if (line.startsWith("### ")) {
      finish();
      const heading = /^([A-Z]-\d+)\s+(.*)$/.exec(line.slice(4).trim());
      if (!heading) throw new Error(`${file}:${index + 1} 规格标题要以功能编号开头`);
      current = { line: index + 1, id: heading[1], title: heading[2] };
      continue;
    }
    if (current && line.startsWith("操作：")) current.raw = line.slice("操作：".length).trim();
  }
  finish();
  return specs;
}

/** test/behavior/ 下所有的规格 */
export function loadSpecs(directory: string): Spec[] {
  return readdirSync(directory)
    .filter((name) => /^[A-Z]\.md$/.test(name))
    .sort()
    .flatMap((name) => parseSpecFile(readFileSync(join(directory, name), "utf8"), name));
}

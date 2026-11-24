// 代码块、公式块、HTML 块（B-6、B-7、B-12）：内容按原样编辑，回车、退格只在边界上有特殊行为。
// 块的范围、内容、有没有结尾围栏都从文档树和序列化的位置表上取
import type { SourceResult, SourceSnapshot } from "../source.ts";
import { blockType, type CursorContext } from "./context.ts";
import { columnAfter, cursorAt, lineAt, quotePrefix, selectionRange } from "./text.ts";

export type RawKind = "code" | "math" | "html";

export interface RawBlock {
  kind: RawKind;
  /** 开头那一行的行首（含容器前缀） */
  blockStart: number;
  /** 最后一行（结尾围栏或最后一行内容）的行尾 */
  blockEnd: number;
  contentStart: number;
  contentEnd: number;
  content: string;
  lineCount: number;
  empty: boolean;
  closed: boolean;
  /** 没闭合时要补的结尾那一行（容器前缀、围栏缩进和围栏）；HTML 没有 */
  closingText: string | null;
  /** 只有一行内容时去掉围栏后的那一行（开头那一行的容器前缀 + 内容） */
  unwrappedContent: string;
  unwrappedCursorOffset: number;
}

const HTML_ROOT_TAGS =
  "!DOCTYPE|div|p|h[1-6]|table|figure|details|left|right|center|footer|header|nav|ol|ul|article|address|dl|applet|map|aside|audio|bdo|blockquote|form|select|dialog|picture|embed|object|iframe|main|pre|section|svg|textarea|video|template|head|canvas|base|datalist|meta|script|style|noscript|title|menu|hr";
const HTML_ROOT_TAG = new RegExp(`^\\s*<(${HTML_ROOT_TAGS})(?:(/)|>|\\s|$)`, "i");
const VOID_HTML_ROOTS = new Set(["br", "hr", "embed"]);

/** HTML 块是不是写完整了（Typora：根元素有结束标签、注释有 `-->` 等） */
export function isClosedHtml(value: string): boolean {
  const trimmed = value.trimStart();
  if (/^<!--/.test(trimmed)) return /-->/.test(trimmed);
  if (/^<\?/.test(trimmed)) return /\?>/.test(trimmed);
  if (/^<!\[CDATA\[/.test(trimmed)) return /\]\]>/.test(trimmed);
  if (/^<![A-Z]/.test(trimmed) && !/^<!DOCTYPE/i.test(trimmed)) return />/.test(trimmed);
  const root = HTML_ROOT_TAG.exec(trimmed);
  if (!root) return true;
  const tag = root[1].toLowerCase();
  if (tag === "!doctype") return />/.test(trimmed);
  if (root[2] || VOID_HTML_ROOTS.has(tag)) return true;
  const tagPattern = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*(/?)>`, "gi");
  let depth = 0;
  let found = false;
  for (const match of trimmed.matchAll(tagPattern)) {
    found = true;
    if (match[1]) depth -= 1;
    else if (!match[2]) depth += 1;
  }
  return found && depth <= 0;
}

/** 光标所在的代码块、公式块、HTML 块 */
export function rawBlockAt(source: SourceSnapshot, context: CursorContext): RawBlock | null {
  const type = blockType(context);
  const block = context.block;
  if (!block?.range || !block.leaf) return null;
  let kind: RawKind;
  if (type === "codeBlock" || type === "diagram") kind = "code";
  else if (type === "mathBlock") kind = "math";
  else if (type === "htmlBlock") kind = "html";
  else return null;
  if (kind === "code" && block.node.attrs.indented) return null;
  const { text } = source;
  const { node, range, leaf } = block;
  const content = node.textContent;
  const lines = leaf.lines;
  const last = lines.length - 1;
  const blockStart = lineAt(text, range.start).start;
  const contentStart = leaf.starts[0];
  const contentEnd = leaf.starts[last] + lines[last].length;
  // 开头那一行从行首到块本身的部分：引用前缀、列表符号
  const inlinePrefix = text.slice(blockStart, range.start);
  if (kind === "html") {
    return {
      kind,
      blockStart,
      blockEnd: range.end,
      contentStart,
      contentEnd,
      content,
      lineCount: Math.max(1, lines.length),
      empty: content === "",
      closed: isClosedHtml(content),
      closingText: null,
      unwrappedContent: text.slice(blockStart, range.end),
      unwrappedCursorOffset: contentStart - blockStart,
    };
  }
  const indent = String(node.attrs.indent ?? "");
  let marker: string;
  let closed: boolean;
  if (kind === "code") {
    marker = String(node.attrs.fence ?? "```") || "```";
    closed = node.attrs.closing !== null;
  } else {
    marker = String(node.attrs.open ?? "$$").trim().startsWith("\\[") ? "\\]" : "$$";
    closed = node.attrs.close !== null;
  }
  // 续行的前缀：引用前缀照抄，列表符号换成同样宽的空格
  const quote = quotePrefix(inlinePrefix);
  const quoteRaw = quote?.raw ?? "";
  const quoteColumn = quote?.contentColumn ?? 0;
  const listWidth = columnAfter(inlinePrefix.slice(quoteRaw.length), quoteColumn) - quoteColumn;
  return {
    kind,
    blockStart,
    blockEnd: range.end,
    contentStart,
    contentEnd,
    content,
    lineCount: Math.max(1, lines.length),
    empty: content === "",
    closed,
    closingText: quoteRaw + " ".repeat(listWidth) + indent + marker,
    unwrappedContent: inlinePrefix + (lines[0] ?? ""),
    unwrappedCursorOffset: inlinePrefix.length,
  };
}

/** 选区在块的内容里 */
function insideContent(source: SourceSnapshot, raw: RawBlock): boolean {
  const { from, to } = selectionRange(source);
  return from >= raw.contentStart && to <= raw.contentEnd && source.head >= raw.contentStart && source.head <= raw.contentEnd;
}

export interface EnterModifiers {
  shift?: boolean;
  /** Ctrl（macOS 上是 Cmd） */
  primary?: boolean;
  alt?: boolean;
}

/**
 * 内容末尾的回车：代码块 Ctrl+回车、公式块 Ctrl+回车（不带 Shift）、HTML 块写完整时回车或任何时候 Ctrl+回车，
 * 跳出这一块（没闭合的先补上结尾）
 */
export function rawBlockEnter(source: SourceSnapshot, raw: RawBlock, modifiers: EnterModifiers): SourceResult | null {
  if (!insideContent(source, raw) || source.head !== raw.contentEnd) return null;
  const primary = Boolean(modifiers.primary);
  if (raw.kind === "code") {
    if (!primary || source.anchor !== source.head) return null;
  } else if (raw.kind === "math") {
    if (modifiers.shift || !primary) return null;
  } else if (!primary && (modifiers.shift || !raw.closed)) {
    return null;
  }
  return exitRawBlock(source, raw);
}

function exitRawBlock(source: SourceSnapshot, raw: RawBlock): SourceResult {
  let text = source.text;
  let blockEnd = raw.blockEnd;
  if (!raw.closed && raw.closingText !== null) {
    const insertion = /(?:\r\n|\n)$/.test(text.slice(raw.blockStart, blockEnd)) ? raw.closingText : `${source.eol}${raw.closingText}`;
    text = text.slice(0, blockEnd) + insertion + text.slice(blockEnd);
    blockEnd += insertion.length;
  }
  const suffix = text.slice(blockEnd);
  const next = suffix.search(/\S/);
  if (next >= 0) return cursorAt(text, blockEnd + next);
  const breaks = suffix.match(/\r\n|\n/g)?.length ?? 0;
  if (breaks < 2) text += source.eol.repeat(2 - breaks);
  return cursorAt(text, text.length);
}

/**
 * 内容开头的退格、结尾的删除：空块整块删掉；只有一行的代码块退格变回正文；其余情况什么也不做（返回 "consume"）
 */
export function rawBlockBoundaryDelete(source: SourceSnapshot, raw: RawBlock, direction: "backward" | "forward"): SourceResult | "consume" | null {
  if (!insideContent(source, raw) || source.anchor !== source.head) return null;
  const atStart = source.head === raw.contentStart;
  const atEnd = source.head === raw.contentEnd;
  if (direction === "backward" && !atStart) return null;
  if (direction === "forward" && !atEnd) return null;
  const replace = (replacement: string, cursor: number): SourceResult =>
    cursorAt(source.text.slice(0, raw.blockStart) + replacement + source.text.slice(raw.blockEnd), raw.blockStart + cursor);
  if (raw.kind === "code") {
    if (raw.empty) return replace("", 0);
    if (direction === "backward" && raw.lineCount === 1) return replace(raw.unwrappedContent, raw.unwrappedCursorOffset);
    return "consume";
  }
  if (raw.kind === "math") return raw.empty ? replace("", 0) : "consume";
  return "consume";
}

// 退格、删除（E-3、E-5、B-8）：文本块开头退格去掉块标记（标题的 `#`、引用的 `>`、列表符号先反缩进再去掉）、
// 两块之间的空行一次删掉、分隔线后面退格删掉分隔线。行为按源码定义（test/behavior/E.md、B.md），结构从文档树上取
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorSettings } from "../settings.ts";
import type { SourceResult, SourceSnapshot } from "../source.ts";
import { toModel } from "../state.ts";
import { blockType, inside, nearest, type CursorContext } from "./context.ts";
import { orderedStartAt, renumberListAt } from "./lists.ts";
import { removeAutoPairOnBackspace } from "./input.ts";
import { rawBlockAt, rawBlockBoundaryDelete } from "./raw.ts";
import { fromTextState, textState } from "./run.ts";
import { collapsed, cursorAt, lineAt, normalizeNumber, quotePrefix } from "./text.ts";

type Result = SourceResult | "consume" | null;

interface Env {
  source: SourceSnapshot;
  context: CursorContext;
  settings: EditorSettings;
  state: EditorState;
}

/** 光标所在文本块在第几行（源码偏移 offset 所在的行） */
function blockLineIndex(env: Env, offset: number): number {
  const starts = env.context.block?.leaf?.starts ?? [];
  let index = 0;
  for (let i = 0; i < starts.length; i += 1) if (starts[i] <= offset) index = i;
  return index;
}

/** 光标在列表项第一行（写符号的那一行）的文本块里 */
function onItemMarkerLine(env: Env): boolean {
  const { context, source } = env;
  const block = context.block;
  const item = nearest(context, "listItem");
  if (!block?.range || !item?.range) return false;
  return blockLineIndex(env, source.head) === 0 && lineAt(source.text, item.range.start).start === lineAt(source.text, block.range.start).start;
}

/** 这一行（不含换行）和整行范围 */
function currentLine(env: Env): { start: number; end: number; text: string } {
  const range = lineAt(env.source.text, env.source.head);
  return { start: range.start, end: range.end, text: env.source.text.slice(range.start, range.end) };
}

function replaceLine(env: Env, line: { start: number; end: number }, replacement: string, cursor: number): SourceResult {
  const { text } = env.source;
  return cursorAt(text.slice(0, line.start) + replacement + text.slice(line.end), cursor);
}

// ---------------------------------------------------------------------------
// 列表项：内容开头退格先反缩进一级，最外层时去掉符号

function lineNumberAt(text: string, offset: number): number {
  let count = 0;
  for (let index = text.indexOf("\n"); index >= 0 && index < offset; index = text.indexOf("\n", index + 1)) count += 1;
  return count;
}

/** 去掉一级缩进：Tab 去一个，空格按缩进宽度（2 或 4） */
function singleIndentRemoval(indent: string, indentSize: number): number {
  return indent.startsWith("\t") ? 1 : Math.min(indentSize === 4 ? 4 : 2, indent.length);
}

function outdentList(env: Env): Result {
  const { source, settings } = env;
  if (!collapsed(source) || source.head <= 0 || !onItemMarkerLine(env)) return null;
  const line = currentLine(env);
  const quote = quotePrefix(line.text);
  const quoteRaw = quote?.raw ?? "";
  const rest = line.text.slice(quoteRaw.length);
  const match = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(rest);
  if (!match) return null;
  const contentStart = line.start + quoteRaw.length + match[0].length;
  if (source.head !== contentStart) return null;
  const { text } = source;
  const number = /^(\d+)([.)])$/.exec(match[2]);
  if (quote) {
    const normalized = quote.normalized;
    if (match[1]) {
      const removed = singleIndentRemoval(match[1], settings.indentSize);
      const nextLine = normalized + line.text.slice(quoteRaw.length + removed);
      let value = text.slice(0, line.start) + nextLine + text.slice(line.end);
      let cursor = line.start + normalized.length + (match[0].length - removed);
      if (number) {
        const lineIndex = lineNumberAt(value, line.start);
        value = renumberListAt(value, lineIndex);
        const renumbered = lineAt(value, line.start);
        const marker = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(value.slice(renumbered.start, renumbered.end).slice(quotePrefix(value.slice(renumbered.start, renumbered.end))?.raw.length ?? 0));
        if (marker) cursor = renumbered.start + (quotePrefix(value.slice(renumbered.start, renumbered.end))?.raw.length ?? 0) + marker[0].length;
      }
      return cursorAt(value, cursor);
    }
    let value = text.slice(0, line.start) + normalized + line.text.slice(quoteRaw.length + match[0].length) + text.slice(line.end);
    if (number) value = renumberQuoted(value, lineNumberAt(value, line.start) + 1, normalized, match[1], normalizeNumber(number[1]), number[2]);
    return cursorAt(value, line.start + normalized.length);
  }
  if (!match[1]) {
    let value = text.slice(0, line.start) + line.text.slice(match[0].length) + text.slice(line.end);
    if (number) value = renumberPlain(value, lineNumberAt(value, line.start) + 1, match[1], normalizeNumber(number[1]), number[2]);
    return cursorAt(value, line.start);
  }
  const removed = singleIndentRemoval(match[1], settings.indentSize);
  let value = text.slice(0, line.start) + line.text.slice(removed) + text.slice(line.end);
  let cursor = source.head - removed;
  if (number) {
    const lineIndex = lineNumberAt(value, line.start);
    const base = orderedStartAt(text, lineIndex);
    value = renumberListAt(value, lineIndex, base ?? undefined);
    const renumbered = lineAt(value, line.start);
    const marker = /^(\s*)(\d+[.)]\s+(?:\[[ xX]\]\s+)?)/.exec(value.slice(renumbered.start, renumbered.end));
    if (marker) cursor = renumbered.start + marker[0].length;
  }
  return cursorAt(value, cursor);
}

/** 有序列表从 startLine 行起重新编号（同一层同一个分隔符的项） */
function renumberPlain(text: string, startLine: number, indent: string, startNumber: string, delimiter: string): string {
  return renumberFrom(text, startLine, "", /^(\s*)(\d+)([.)])(\s+)/, indent, startNumber, delimiter);
}

function renumberQuoted(text: string, startLine: number, quote: string, indent: string, startNumber: string, delimiter: string): string {
  const leading = /^\s*/.exec(quote)?.[0] ?? "";
  const depth = quote.match(/>/g)?.length ?? 0;
  const pattern = new RegExp(`^${leading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${Array.from({ length: depth }, () => ">[ \\t]?").join("")}(\\s*)(\\d+)([.)])(\\s+)`);
  return renumberFrom(text, startLine, quote, pattern, indent, startNumber, delimiter);
}

function renumberFrom(text: string, startLine: number, quote: string, pattern: RegExp, indent: string, startNumber: string, delimiter: string): string {
  const lines = text.split("\n");
  let next = startNumber;
  const deeper = (lineIndent: string) => lineIndent.startsWith(indent) && lineIndent.length > indent.length;
  for (let index = startLine; index < lines.length; index += 1) {
    const line = lines[index];
    const match = pattern.exec(line);
    if (!match) {
      if (!line.trim()) continue;
      const content = quote ? (line.startsWith(quote) ? line.slice(quote.length) : null) : line;
      if (content !== null && (!content.trim() || deeper(/^\s*/.exec(content)?.[0] ?? ""))) continue;
      break;
    }
    if (match[1] !== indent || match[3] !== delimiter) {
      if (deeper(match[1])) continue;
      break;
    }
    lines[index] = `${quote}${indent}${next}${delimiter}${match[4]}${line.slice(match[0].length)}`;
    next = increment(next);
  }
  return lines.join("\n");
}

function increment(value: string): string {
  const digits = normalizeNumber(value).split("");
  let carry = 1;
  for (let index = digits.length - 1; index >= 0 && carry > 0; index -= 1) {
    const next = digits[index].charCodeAt(0) - 48 + carry;
    digits[index] = String(next % 10);
    carry = next >= 10 ? 1 : 0;
  }
  if (carry > 0) digits.unshift("1");
  return digits.join("");
}

// ---------------------------------------------------------------------------
// 文本块开头退格去掉块标记

function unwrapFrontMatter(env: Env): Result {
  const { source, context } = env;
  if (blockType(context) !== "frontMatter" || !context.block?.leaf || !context.block.range) return null;
  const { leaf, range } = context.block;
  if (source.head !== leaf.starts[0]) return null;
  const { text } = source;
  const last = leaf.lines.length - 1;
  const contentEnd = leaf.starts[last] + leaf.lines[last].length;
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const content = text.slice(leaf.starts[0], contentEnd);
  // 结尾那一行（`---`、`...`）连同它前面的换行去掉，后面的换行留着
  const closingLine = lineAt(text, range.end);
  return cursorAt(bom + content + text.slice(closingLine.end), bom.length);
}

function unwrapHeading(env: Env): Result {
  const { source, context } = env;
  const block = context.block;
  if (blockType(context) !== "heading" || !block?.range || !block.leaf) return null;
  const { text } = source;
  const contentStart = block.leaf.starts[0];
  const contentEnd = contentStart + block.node.textContent.length;
  if (block.node.attrs.setext) {
    // Setext：在标题文字开头、或下划线上面那一行的开头退格，去掉下划线那一行
    const lastStart = block.leaf.starts[block.leaf.starts.length - 1];
    if (source.head !== contentStart && source.head !== lastStart) return null;
    const underline = lineAt(text, block.range.end);
    return cursorAt(text.slice(0, lineAt(text, contentEnd).end) + text.slice(underline.end), source.head);
  }
  if (source.head !== contentStart) return null;
  const titleLine = lineAt(text, block.range.start);
  const quote = quotePrefix(text.slice(titleLine.start, contentStart));
  const afterQuote = text.slice(titleLine.start + (quote?.raw.length ?? 0), contentStart);
  const indent = /^[ \t]{0,3}/.exec(afterQuote)?.[0] ?? "";
  const plainPrefix = (quote?.normalized ?? "") + indent;
  const replacement = plainPrefix + text.slice(contentStart, contentEnd);
  return cursorAt(text.slice(0, titleLine.start) + replacement + text.slice(titleLine.end), titleLine.start + plainPrefix.length);
}

/** 段落里正在输入的 Setext 下划线（还没转换）：在它开头退格去掉这一行 */
function unwrapTypedUnderline(env: Env): Result {
  const { source, context } = env;
  if (blockType(context) !== "paragraph" || blockLineIndex(env, source.head) === 0) return null;
  const line = currentLine(env);
  const quote = quotePrefix(line.text);
  const content = line.text.slice(quote?.raw.length ?? 0);
  if (!/^ {0,3}(?:={2,}|-{2,})[ \t]*$/.test(content)) return null;
  if (source.head !== line.start && source.head !== line.start + (quote?.raw.length ?? 0)) return null;
  const previous = lineAt(source.text, line.start - 1);
  return cursorAt(source.text.slice(0, previous.end) + source.text.slice(line.end), previous.end);
}

function unwrapMarkerLine(env: Env, type: "definitionDescription" | "footnoteDefinition", pattern: RegExp): Result {
  const { source, context } = env;
  const container = nearest(context, type);
  if (!container?.range) return null;
  const line = currentLine(env);
  if (lineAt(source.text, container.range.start).start !== line.start) return null;
  const quote = quotePrefix(line.text);
  const quoteRaw = quote?.raw ?? "";
  const marker = pattern.exec(line.text.slice(quoteRaw.length));
  if (!marker) return null;
  const markerEnd = quoteRaw.length + marker[0].length;
  if (source.head !== line.start + markerEnd) return null;
  const prefix = (quote?.normalized ?? "") + marker[1];
  return replaceLine(env, line, prefix + line.text.slice(markerEnd), line.start + prefix.length);
}

function unwrapContinuation(env: Env, types: string[], pattern: RegExp): Result {
  const { source, context } = env;
  const container = nearest(context, ...types);
  if (!container?.range) return null;
  const line = currentLine(env);
  // 容器的第一行不是续行
  if (lineAt(source.text, container.range.start).start === line.start) return null;
  const quote = quotePrefix(line.text);
  const quoteRaw = quote?.raw ?? "";
  const continuation = pattern.exec(line.text.slice(quoteRaw.length));
  if (!continuation) return null;
  const contentStart = line.start + quoteRaw.length + continuation[1].length;
  if (source.head !== contentStart) return null;
  const prefix = quote?.normalized ?? "";
  return replaceLine(env, line, prefix + line.text.slice(quoteRaw.length + continuation[1].length), line.start + prefix.length);
}

function unwrapQuote(env: Env): Result {
  const { source, context } = env;
  if (!inside(context, "blockquote", "alert")) return null;
  const line = currentLine(env);
  const quote = /^(\s*)((?:>\s*)+)/.exec(line.text);
  if (!quote) return null;
  if (source.head !== line.start + quote[0].length) return null;
  const markers = quote[2].match(/>\s*/g) ?? [];
  const replacement = markers.length > 1 ? `${quote[1]}${"> ".repeat(markers.length - 1)}` : quote[1];
  return replaceLine(env, line, replacement + line.text.slice(quote[0].length), line.start + replacement.length);
}

function unwrapBlock(env: Env): Result {
  if (!collapsed(env.source)) return null;
  const frontMatter = unwrapFrontMatter(env);
  if (frontMatter) return frontMatter;
  if (inRaw(env)) return null;
  return (
    unwrapHeading(env) ??
    unwrapTypedUnderline(env) ??
    unwrapMarkerLine(env, "definitionDescription", /^([ \t]{0,3}):(?:[ \t]+|$)/) ??
    unwrapMarkerLine(env, "footnoteDefinition", /^([ \t]{0,3})\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/) ??
    unwrapContinuation(env, ["definitionDescription"], /^((?:[ \t]{2,}|\t))(.*)$/) ??
    unwrapContinuation(env, ["footnoteDefinition"], /^((?: {4,}| {0,3}\t))(.*)$/) ??
    unwrapContinuation(env, ["listItem"], /^((?:[ \t]{2,}|\t))(.*)$/) ??
    unwrapQuote(env)
  );
}

function inRaw(env: Env): boolean {
  const type = blockType(env.context);
  return type !== null && ["codeBlock", "diagram", "mathBlock", "htmlBlock", "frontMatter"].includes(type);
}

// ---------------------------------------------------------------------------
// 两块之间的空行：一次删掉，右边那块的标记也去掉（向前删时）

const MERGE_LEFT = new Set(["paragraph", "heading", "blockquote", "bulletList", "orderedList"]);

/** 顶层块：光标所在的顶层块和它的前后兄弟 */
function topLevel(env: Env): { index: number; node: PMNode } | null {
  const { $head } = env.state.selection;
  if ($head.depth < 1) return null;
  return { index: $head.index(0), node: $head.node(1) };
}

function mergeBoundary(env: Env, direction: "backward" | "forward"): Result {
  const { source, state } = env;
  if (!collapsed(source)) return null;
  const { text } = source;
  const cursor = source.head;
  const gapMatch = direction === "backward" ? /[ \t]*(?:\r?\n[ \t]*){2,}$/.exec(text.slice(0, cursor)) : /^[ \t]*(?:\r?\n[ \t]*){2,}/.exec(text.slice(cursor));
  if (!gapMatch) return null;
  const gap = direction === "backward" ? { from: cursor - gapMatch[0].length, to: cursor } : { from: cursor, to: cursor + gapMatch[0].length };
  const top = topLevel(env);
  if (!top) return null;
  const doc = state.doc;
  // 左右两块：向后删时光标在右边那块的开头，向前删时在左边那块的末尾
  const leftIndex = direction === "backward" ? top.index - 1 : top.index;
  const rightIndex = leftIndex + 1;
  if (leftIndex < 0 || rightIndex >= doc.childCount) return null;
  const left = doc.child(leftIndex);
  const right = doc.child(rightIndex);
  const map = source.map.map;
  const leftModel = map.ranges.get(toModelOf(left));
  const rightModel = map.ranges.get(toModelOf(right));
  if (!leftModel || !rightModel || rightModel.start !== gap.to || leftModel.end > gap.from + gapMatch[0].length) return null;
  if (!MERGE_LEFT.has(left.type.name)) return null;
  let markerLength: number | null;
  if (direction === "backward") markerLength = right.type.name === "paragraph" ? 0 : null;
  else markerLength = forwardMarkerLength(text.slice(rightModel.start, rightModel.end), right);
  if (markerLength === null) return null;
  if (direction === "backward" && left.type.name === "heading" && left.attrs.setext) {
    // Setext 标题：右边的文字接到标题文字后面
    const heading = /^([\s\S]+)(\r?\n)([ \t]{0,3}(?:={2,}|-{2,})[ \t]*)$/.exec(text.slice(leftModel.start, gap.from));
    if (heading) {
      const rightSource = text.slice(gap.to + markerLength, rightModel.end);
      const trailing = /\r?\n$/.exec(rightSource)?.[0] ?? "";
      const rightContent = trailing ? rightSource.slice(0, -trailing.length) : rightSource;
      const merged = `${heading[1]}${rightContent}${heading[2]}${heading[3]}${trailing}`;
      return cursorAt(text.slice(0, leftModel.start) + merged + text.slice(rightModel.end), leftModel.start + heading[1].length);
    }
  }
  return cursorAt(text.slice(0, gap.from) + text.slice(gap.to + markerLength), gap.from);
}

function forwardMarkerLength(raw: string, node: PMNode): number | null {
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  switch (node.type.name) {
    case "paragraph":
      return 0;
    case "heading":
      return /^[ \t]{0,3}#{1,6}[ \t]+/.exec(firstLine)?.[0].length ?? null;
    case "blockquote":
      return /^[ \t]{0,3}(?:>[ \t]?)+/.exec(firstLine)?.[0].length ?? null;
    case "bulletList":
    case "orderedList":
      return (/^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\][ \t]+/.exec(firstLine) ?? /^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+/.exec(firstLine))?.[0].length ?? null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 分隔线后面退格

function backspaceAfterRule(env: Env): Result {
  const { source, state } = env;
  if (!collapsed(source)) return null;
  const { text, eol } = source;
  const cursor = source.head;
  const top = topLevel(env);
  if (!top || top.node.type.name !== "paragraph" || state.selection.$head.parentOffset !== 0 || state.selection.$head.depth !== 1) return null;
  if (lineAt(text, cursor).start !== cursor || !text.slice(cursor, lineAt(text, cursor).end).trim()) return null;
  // 前一个顶层块是分隔线，中间只有空白
  let index = top.index - 1;
  const map = source.map.map;
  while (index >= 0 && !map.ranges.get(toModelOf(state.doc.child(index)))) index -= 1;
  if (index < 0) return null;
  const rule = state.doc.child(index);
  const ruleRange = map.ranges.get(toModelOf(rule));
  if (rule.type.name !== "horizontalRule" || !ruleRange || text.slice(ruleRange.end, cursor).trim()) return null;
  const ruleLine = lineAt(text, ruleRange.start);
  // 分隔线前面最近的有内容的行
  let previousEnd = -1;
  for (let offset = ruleLine.start - 1; offset >= 0; ) {
    const line = lineAt(text, offset);
    if (text.slice(line.start, line.end).trim()) {
      previousEnd = line.end;
      break;
    }
    offset = line.start - 1;
  }
  if (previousEnd < 0) return cursorAt(text.slice(cursor), 0);
  const lineBreak = text.slice(ruleLine.end, ruleLine.end + 2) === "\r\n" ? "\r\n" : text[ruleLine.end] === "\n" ? "\n" : eol;
  const separator = lineBreak + lineBreak;
  return cursorAt(text.slice(0, previousEnd) + separator + text.slice(cursor), previousEnd + separator.length);
}

// ---------------------------------------------------------------------------

function toModelOf(node: PMNode) {
  return toModel(node);
}

export function backspaceResult(state: EditorState, source: SourceSnapshot, context: CursorContext, settings: EditorSettings): Result {
  const env: Env = { source, context, settings, state };
  const rule = backspaceAfterRule(env);
  if (rule) return rule;
  const raw = rawBlockAt(source, context);
  if (raw) {
    const result = rawBlockBoundaryDelete(source, raw, "backward");
    if (result) return result;
  }
  const result = outdentList(env) ?? unwrapBlock(env) ?? mergeBoundary(env, "backward");
  if (result) return result;
  // E-9：在一对自动配对的符号中间退格，两个一起删
  return settings.autoPair ? fromTextState(removeAutoPairOnBackspace(textState(source))) : null;
}

export function deleteResult(state: EditorState, source: SourceSnapshot, context: CursorContext, settings: EditorSettings): Result {
  const env: Env = { source, context, settings, state };
  const raw = rawBlockAt(source, context);
  if (raw) {
    const result = rawBlockBoundaryDelete(source, raw, "forward");
    if (result) return result;
  }
  return mergeBoundary(env, "forward");
}

// 输入时的转换（E-4）和自动配对（E-9）：行首输入 `>`、`*`、`1.` 后的空格规范成 Typora 的写法，
// 输入 `---` 后的空格变成分隔线；输入左半边补右半边，在一对中间退格两个一起删。
// 代码移植自旧版 src/utils/editorCommands.ts（test/behavior/E.md 的基准，逐字节一致）；
// 一行在不在代码块里改用文档树给的范围（inlineLayout.ts）
/* eslint-disable */
import { insideFencedBlock } from "./inlineLayout.ts";

function isInsideMarkdownRawBlock(_value: string, lineStart: number): boolean {
  return insideFencedBlock(lineStart);
}

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface TextEditResult extends TextState {}

export function normalizeSelection(state: TextState): TextState {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd));
  const selectionEnd = Math.max(0, Math.max(state.selectionStart, state.selectionEnd));
  return {
    value: state.value,
    selectionStart,
    selectionEnd,
  };
}

export function wrapMarkdownSelection(
  state: TextState,
  before: string,
  after: string,
  placeholder = "",
): TextEditResult {
  const normalized = normalizeSelection(state);
  if (before === "`" && after === "`") {
    return wrapMarkdownCodeSpanSelection(normalized, placeholder);
  }

  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd) || placeholder;
  if (
    selected
    && selected !== placeholder
    && selected.startsWith(before)
    && selected.endsWith(after)
    && selected.length >= before.length + after.length
  ) {
    const unwrapped = selected.slice(before.length, selected.length - after.length);
    const value = [
      normalized.value.slice(0, normalized.selectionStart),
      unwrapped,
      normalized.value.slice(normalized.selectionEnd),
    ].join("");
    return {
      value,
      selectionStart: normalized.selectionStart,
      selectionEnd: normalized.selectionStart + unwrapped.length,
    };
  }

  if (selected && selected !== placeholder) {
    const wrapperStart = normalized.selectionStart - before.length;
    const wrapperEnd = normalized.selectionEnd + after.length;
    if (
      wrapperStart >= 0
      && normalized.value.slice(wrapperStart, normalized.selectionStart) === before
      && normalized.value.slice(normalized.selectionEnd, wrapperEnd) === after
    ) {
      const value = [
        normalized.value.slice(0, wrapperStart),
        selected,
        normalized.value.slice(wrapperEnd),
      ].join("");
      return {
        value,
        selectionStart: wrapperStart,
        selectionEnd: wrapperStart + selected.length,
      };
    }
  }

  const value = [
    normalized.value.slice(0, normalized.selectionStart),
    before,
    selected,
    after,
    normalized.value.slice(normalized.selectionEnd),
  ].join("");
  const selectionStart = normalized.selectionStart + before.length;
  const selectionEnd = selectionStart + selected.length;
  return { value, selectionStart, selectionEnd };
}

function wrapMarkdownCodeSpanSelection(state: TextState, placeholder = ""): TextEditResult {
  const selected = state.value.slice(state.selectionStart, state.selectionEnd) || placeholder;
  if (selected && selected !== placeholder) {
    const wrapper = readCodeSpanWrapperAroundSelection(state);
    if (wrapper) {
      const value = `${state.value.slice(0, wrapper.start)}${selected}${state.value.slice(wrapper.end)}`;
      return {
        value,
        selectionStart: wrapper.start,
        selectionEnd: wrapper.start + selected.length,
      };
    }

    const selectedCodeSpan = readSelectedCodeSpan(selected);
    if (selectedCodeSpan) {
      const value = `${state.value.slice(0, state.selectionStart)}${selectedCodeSpan}${state.value.slice(state.selectionEnd)}`;
      return {
        value,
        selectionStart: state.selectionStart,
        selectionEnd: state.selectionStart + selectedCodeSpan.length,
      };
    }
  }

  const marker = getCodeSpanMarker(selected);
  const needsPadding = marker.length > 1 && (/^`|`$/.test(selected));
  const leadingPadding = needsPadding ? " " : "";
  const trailingPadding = needsPadding ? " " : "";
  const value = [
    state.value.slice(0, state.selectionStart),
    marker,
    leadingPadding,
    selected,
    trailingPadding,
    marker,
    state.value.slice(state.selectionEnd),
  ].join("");
  const selectionStart = state.selectionStart + marker.length + leadingPadding.length;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

function readSelectedCodeSpan(value: string): string | null {
  const opening = value.match(/^(`+)/)?.[1];
  if (!opening || !value.endsWith(opening) || value.length < opening.length * 2) return null;

  const inner = value.slice(opening.length, value.length - opening.length);
  if (inner.startsWith(" ") && inner.endsWith(" ") && inner.trim()) {
    return inner.slice(1, -1);
  }
  return inner;
}

function readCodeSpanWrapperAroundSelection(state: TextState): { start: number; end: number } | null {
  const leftPadding = state.value[state.selectionStart - 1] === " " ? 1 : 0;
  const rightPadding = state.value[state.selectionEnd] === " " ? 1 : 0;
  const leftRunEnd = state.selectionStart - leftPadding;
  const leftRun = countBacktickRunBefore(state.value, leftRunEnd);
  if (leftRun === 0) return null;

  const rightRunStart = state.selectionEnd + rightPadding;
  const rightRun = countBacktickRunAfter(state.value, rightRunStart);
  if (rightRun !== leftRun) return null;

  return {
    start: leftRunEnd - leftRun,
    end: rightRunStart + rightRun,
  };
}

function countBacktickRunBefore(value: string, end: number): number {
  let count = 0;
  for (let index = end - 1; index >= 0 && value[index] === "`"; index -= 1) {
    count += 1;
  }
  return count;
}

function countBacktickRunAfter(value: string, start: number): number {
  let count = 0;
  for (let index = start; index < value.length && value[index] === "`"; index += 1) {
    count += 1;
  }
  return count;
}

export function insertMarkdownAtSelection(state: TextState, text: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const normalizedText = normalizeGeneratedLineBreaks(text, getPreferredLineBreak(normalized.value));
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${normalizedText}${normalized.value.slice(normalized.selectionEnd)}`;
  const cursor = normalized.selectionStart + normalizedText.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function applyMarkdownSpaceShortcut(state: TextState, indentSize = 2): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  if (isInsideMarkdownRawBlock(normalized.value, lineStart)) return null;

  const beforeCursor = normalized.value.slice(lineStart, normalized.selectionStart);
  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd === -1 ? normalized.value.length : lineEnd;
  const afterCursor = normalized.value.slice(normalized.selectionStart, normalizedLineEnd);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const lines = normalized.value.split("\n");
  const lineIndex = findLineIndex(lines, lineStart);
  const quotedShortcut = getQuotedMarkdownSpaceShortcut(
    beforeCursor,
    afterCursor,
    lineBreak,
    lines,
    lineIndex,
    indentSize,
  );
  if (quotedShortcut) {
    const value = `${normalized.value.slice(0, lineStart)}${quotedShortcut}${normalized.value.slice(normalized.selectionStart)}`;
    const cursor = lineStart + quotedShortcut.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const indent = beforeCursor.match(/^\s*/)?.[0] ?? "";
  const marker = beforeCursor.slice(indent.length);
  const nestedBulletShortcut = getNestedBulletSpaceShortcut(
    beforeCursor,
    afterCursor,
    lines,
    lineIndex,
    "",
    indentSize,
  );
  if (nestedBulletShortcut) {
    const value = `${normalized.value.slice(0, lineStart)}${nestedBulletShortcut}${normalized.value.slice(normalized.selectionStart)}`;
    const cursor = lineStart + nestedBulletShortcut.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }
  const replacement = normalizeGeneratedLineBreaks(getMarkdownSpaceShortcutReplacement(marker), lineBreak);

  if (!replacement) return null;
  if (isMarkdownListSpaceShortcutMarker(marker) && !isMarkdownListMarkerIndentAllowed(lines, lineIndex, "", indent)) return null;
  if (replacement.endsWith("\n") && afterCursor.trim()) return null;

  const nextLineStart = `${indent}${replacement}`;
  const value = `${normalized.value.slice(0, lineStart)}${nextLineStart}${normalized.value.slice(normalized.selectionStart)}`;
  const cursor = lineStart + nextLineStart.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function applyMarkdownTextInputShortcut(
  state: TextState,
  text: string,
  indentSize = 2,
): TextEditResult | null {
  let current = state;
  let segmentStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== " ") continue;
    const beforeSpace = text.slice(segmentStart, index);
    const stateBeforeSpace = beforeSpace
      ? insertMarkdownAtSelection(current, beforeSpace)
      : current;
    const shortcut = applyMarkdownSpaceShortcut(stateBeforeSpace, indentSize);
    if (shortcut) {
      const remaining = text.slice(index + 1);
      return remaining
        ? insertMarkdownAtSelection(shortcut, remaining)
        : shortcut;
    }
    current = insertMarkdownAtSelection(stateBeforeSpace, " ");
    segmentStart = index + 1;
  }
  return null;
}

export function applyMarkdownSpaceShortcutAfterInput(
  state: TextState,
  indentSize = 2,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (
    normalized.selectionStart !== normalized.selectionEnd
    || normalized.selectionStart === 0
    || normalized.value[normalized.selectionStart - 1] !== " "
  ) return null;
  const cursor = normalized.selectionStart - 1;
  return applyMarkdownSpaceShortcut({
    value: normalized.value.slice(0, cursor) + normalized.value.slice(cursor + 1),
    selectionStart: cursor,
    selectionEnd: cursor,
  }, indentSize);
}

function getQuotedMarkdownSpaceShortcut(
  beforeCursor: string,
  afterCursor: string,
  lineBreak: "\n" | "\r\n",
  lines: string[],
  lineIndex: number,
  indentSize: number,
): string {
  const quote = parseQuotePrefix(beforeCursor);
  if (!quote) return "";
  const content = beforeCursor.slice(quote.rawLength);
  if (!content && beforeCursor !== quote.normalized) {
    return quote.normalized;
  }
  const indent = content.match(/^\s*/)?.[0] ?? "";
  const marker = content.slice(indent.length);
  const nestedBulletShortcut = getNestedBulletSpaceShortcut(
    content,
    afterCursor,
    lines,
    lineIndex,
    quote.normalized,
    indentSize,
  );
  if (nestedBulletShortcut) return nestedBulletShortcut;
  const replacement = normalizeGeneratedLineBreaks(getMarkdownSpaceShortcutReplacement(marker), lineBreak);
  if (isMarkdownListSpaceShortcutMarker(marker) && !isMarkdownListMarkerIndentAllowed(lines, lineIndex, quote.normalized, indent)) {
    return "";
  }
  if (replacement.endsWith("\n") && afterCursor.trim()) return "";
  return replacement ? `${quote.normalized}${indent}${replacement}` : "";
}

function getNestedBulletSpaceShortcut(
  beforeCursor: string,
  afterCursor: string,
  lines: string[],
  lineIndex: number,
  quotePrefix: string,
  indentSize: number,
): string {
  if (afterCursor.trim() || lineIndex <= 0) return "";
  const shortcut = beforeCursor.match(/^([ \t]*)([-+*])[ \t]+([-+*])$/);
  if (!shortcut) return "";

  const previous = getListContinuationLineContext(lines[lineIndex - 1] ?? "");
  if (previous.quotePrefix !== quotePrefix) return "";
  const previousBody = splitCarriageReturnEnding(previous.content).body;
  const previousList = previousBody.match(/^([ \t]*)([-+*])[ \t]+(?:\[[ xX]\][ \t]+)?(.+)$/);
  if (
    !previousList
    || getIndentWidth(previousList[1]) !== getIndentWidth(shortcut[1])
    || !previousList[3].trim()
  ) return "";

  const normalizedIndentSize = indentSize === 4 ? 4 : 2;
  return `${quotePrefix}${shortcut[1]}${" ".repeat(normalizedIndentSize)}${shortcut[3]} `;
}

function getMarkdownSpaceShortcutReplacement(marker: string): string {
  if (/^#{1,6}$/.test(marker)) {
    return `${marker} `;
  }
  if (marker === "*") {
    return "* ";
  }
  if (marker === "-" || marker === "+") {
    return "- ";
  }
  if (/^\d+[.)]$/.test(marker)) {
    return `${marker} `;
  }
  if (marker === ">") {
    return "> ";
  }
  if (/^(---|\+\+\+|\*\*\*|___)$/.test(marker)) {
    return `${marker}\n`;
  }
  if (/^\[[ xX]?]$/.test(marker)) {
    return marker.toLowerCase() === "[x]" ? "- [x] " : "- [ ] ";
  }

  const taskMatch = marker.match(/^((?:[-*+]|\d+[.)])\s+)\[([ xX]?)]$/);
  if (taskMatch) {
    return `${taskMatch[1]}[${taskMatch[2]?.toLowerCase() === "x" ? "x" : " "}] `;
  }

  return "";
}

function isMarkdownListSpaceShortcutMarker(marker: string): boolean {
  return (
    marker === "-"
    || marker === "*"
    || marker === "+"
    || /^\d+[.)]$/.test(marker)
    || /^\[[ xX]?]$/.test(marker)
    || /^((?:[-*+]|\d+[.)])\s+)\[([ xX]?)]$/.test(marker)
  );
}

export function applyAutoPair(state: TextState, key: string): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const pairs = getAutoPairs();
  const closingChars = new Set(Object.values(pairs));
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd);
  if (!selected && closingChars.has(key) && normalized.value[normalized.selectionStart] === key) {
    const cursor = normalized.selectionStart + key.length;
    return { value: normalized.value, selectionStart: cursor, selectionEnd: cursor };
  }

  const selectedOnlyPairs = getSelectedOnlyAutoPairs();
  if (selected && selectedOnlyPairs[key]) {
    return wrapMarkdownSelection(normalized, key, selectedOnlyPairs[key]);
  }

  if (key === "$" && !selected) return null;

  const close = pairs[key];
  if (!close) return null;
  if (key === "`" && !selected && normalized.value[normalized.selectionStart - 1] === "`") return null;
  if (key === "'" && shouldInsertPlainApostrophe(normalized)) return null;
  return wrapMarkdownSelection(normalized, key, close);
}

export function removeAutoPairOnBackspace(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd || normalized.selectionStart <= 0) return null;

  const pairs = getAutoPairs();
  const before = normalized.value[normalized.selectionStart - 1];
  const after = normalized.value[normalized.selectionStart];
  if (!before || pairs[before] !== after) return null;

  const value = `${normalized.value.slice(0, normalized.selectionStart - 1)}${normalized.value.slice(normalized.selectionStart + 1)}`;
  const cursor = normalized.selectionStart - 1;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function getAutoPairs(): Record<string, string> {
  return {
    "(": ")",
    "[": "]",
    "{": "}",
    "\"": "\"",
    "'": "'",
    "`": "`",
    "$": "$",
    "（": "）",
    "【": "】",
    "《": "》",
    "「": "」",
    "『": "』",
    "“": "”",
    "‘": "’",
  };
}

function getSelectedOnlyAutoPairs(): Record<string, string> {
  return {
    "*": "*",
    "_": "_",
    "~": "~",
  };
}

function getCodeSpanMarker(content: string): string {
  const longest = content.match(/`+/g)?.reduce((length, run) => Math.max(length, run.length), 0) ?? 0;
  return "`".repeat(Math.max(1, longest + 1));
}

function isInsideMarkdownList(
  lines: string[],
  lineIndex: number,
  quotePrefix: string,
  continuationIndent: string,
): boolean {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const context = getListContinuationLineContext(lines[index] ?? "");
    if (context.quotePrefix !== quotePrefix) {
      if (context.content.trim()) return false;
      continue;
    }

    const { body } = splitCarriageReturnEnding(context.content);
    if (!body.trim()) continue;

    const list = body.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/);
    if (list) {
      if (!isMarkdownListMarkerIndentAllowed(lines, index, quotePrefix, list[1])) return false;
      if (getIndentWidth(list[1]) <= getIndentWidth(continuationIndent)) return true;
      continue;
    }

    if (/^(?:[ \t]{2,}|\t)/.test(body)) {
      continue;
    }

    return false;
  }

  return false;
}

function isMarkdownListMarkerIndentAllowed(
  lines: string[],
  lineIndex: number,
  quotePrefix: string,
  indent: string,
): boolean {
  return getIndentWidth(indent) < 4 || isInsideMarkdownList(lines, lineIndex, quotePrefix, indent);
}

function getListContinuationLineContext(line: string): { quotePrefix: string; rawQuoteLength: number; content: string } {
  const quote = parseQuotePrefix(line);
  return {
    quotePrefix: quote?.normalized ?? "",
    rawQuoteLength: quote?.rawLength ?? 0,
    content: quote ? line.slice(quote.rawLength) : line,
  };
}

function parseQuotePrefix(line: string): {
  rawLength: number;
  normalized: string;
  depth: number;
  contentColumn: number;
} | null {
  const quote = readMarkdownBlockquotePrefix(line);
  if (!quote) return null;
  const leading = quote.raw.match(/^[ \t]*/)?.[0] ?? "";
  return {
    rawLength: quote.raw.length,
    normalized: `${leading}${"> ".repeat(quote.depth)}`,
    depth: quote.depth,
    contentColumn: quote.contentColumn,
  };
}

function shouldInsertPlainApostrophe(state: TextState): boolean {
  if (state.selectionStart !== state.selectionEnd) return false;
  const before = state.value[state.selectionStart - 1] ?? "";
  const after = state.value[state.selectionStart] ?? "";
  return isWordCharacter(before) || isWordCharacter(after);
}

function isWordCharacter(value: string): boolean {
  return /[\p{L}\p{N}_]/u.test(value);
}

function findLineIndex(lines: string[], cursor: number): number {
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = offset + lines[index].length;
    if (cursor <= lineEnd || index === lines.length - 1) return index;
    offset = lineEnd + 1;
  }
  return Math.max(0, lines.length - 1);
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeGeneratedLineBreaks(value: string, lineBreak: "\n" | "\r\n"): string {
  return value.replace(/\r\n|\r|\n/g, lineBreak);
}

function splitCarriageReturnEnding(line: string): { body: string; ending: "" | "\r" } {
  return line.endsWith("\r")
    ? { body: line.slice(0, -1), ending: "\r" }
    : { body: line, ending: "" };
}

function getIndentWidth(value: string): number {
  return getMarkdownIndentWidth(value);
}



export interface MarkdownBlockquotePrefix {
  raw: string;
  depth: number;
  contentColumn: number;
}

export function getMarkdownIndentWidth(value: string): number {
  return getMarkdownColumnAfter(value);
}

export function getMarkdownColumnAfter(value: string, startColumn = 0): number {
  let column = Math.max(0, Math.trunc(startColumn));
  for (const character of value) {
    column += character === "\t" ? 4 - (column % 4) : 1;
  }
  return column;
}

export function readMarkdownBlockquotePrefix(
  line: string,
  maximumDepth: number | null = null,
): MarkdownBlockquotePrefix | null {
  let cursor = 0;
  let depth = 0;
  let column = 0;
  while (maximumDepth === null || depth < maximumDepth) {
    const marker = line.slice(cursor).match(/^([ \t]*)>/);
    if (!marker) break;
    const leadingColumn = getMarkdownColumnAfter(marker[1] ?? "", column);
    if (leadingColumn - column > 3) break;
    cursor += marker[0].length;
    column = leadingColumn + 1;
    if (line[cursor] === " " || line[cursor] === "\t") {
      column = getMarkdownColumnAfter(line[cursor], column);
      cursor += 1;
    }
    depth += 1;
  }
  return depth > 0
    ? { raw: line.slice(0, cursor), depth, contentColumn: column }
    : null;
}

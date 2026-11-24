// 行和块的操作（E-7、E-8）：选中、删除当前词、句、行、段；复制、删除当前行；上移、下移（排版视图里按块：
// 列表项按项、其他按整块，Front Matter 里按 YAML 行；源码模式里按行）。
// 代码移植自旧版 src/utils/editorCommands.ts（test/behavior/E.md 的基准，逐字节一致）；
// 旧版用整篇分块和 CodeMirror 的 Markdown 解析找块和列表项，这里换成文档树给的范围（inlineLayout.ts）
/* eslint-disable */
import { currentInlineLayout, insideFencedBlock } from "./inlineLayout.ts";

function isInsideMarkdownRawBlock(_value: string, lineStart: number): boolean {
  return insideFencedBlock(lineStart);
}

interface LayoutBlock {
  start: number;
  end: number;
  type: string;
}

function splitMarkdownBlocks(_value: string): LayoutBlock[] {
  return currentInlineLayout().blocks;
}

function findMarkdownBlockIndexAt(blocks: LayoutBlock[], position: number): number {
  for (let index = 0; index < blocks.length; index += 1) {
    const nextStart = blocks[index + 1]?.start ?? Number.POSITIVE_INFINITY;
    if (position >= blocks[index].start && position < nextStart) return index;
  }
  return blocks.length - 1;
}

function getMarkdownBlockContentEnd(block: LayoutBlock): number {
  return block.end;
}

/** 列表项上移、下移：和同一个列表里相邻的项交换，有序列表重新编号 */
function moveMarkdownListItems(state: TextState, direction: "up" | "down"): TextEditResult | null {
  const items = currentInlineLayout().listItems.map((item) => ({ from: item.start, to: item.end, list: item.list }));
  if (items.length === 0) return null;
  const endProbe = state.selectionEnd > state.selectionStart ? state.selectionEnd - 1 : state.selectionEnd;
  const innermost = (position: number) =>
    items.filter((item) => position >= item.from && position <= item.to).sort((left, right) => left.to - left.from - (right.to - right.from))[0] ?? null;
  const first = innermost(state.selectionStart);
  const last = innermost(endProbe);
  if (!first || !last || first.list !== last.list) return null;
  const siblings = items.filter((item) => item.list === first.list).sort((left, right) => left.from - right.from);
  const firstIndex = siblings.indexOf(first);
  const lastIndex = siblings.indexOf(last);
  if (firstIndex < 0 || lastIndex < firstIndex) return null;
  if (direction === "up" && firstIndex === 0) return null;
  if (direction === "down" && lastIndex >= siblings.length - 1) return null;
  const listEnd = siblings[siblings.length - 1].to;
  const groupStart = siblings[firstIndex].from;
  const groupEnd = siblings[lastIndex + 1]?.from ?? getLineEndOffset(state.value, listEnd);
  const baseStartNumber = getOrderedListStartNumberAtLine(state.value, findLineIndex(state.value.split("\n"), groupStart));
  const moved =
    direction === "up"
      ? swapMarkdownRangeWithPrevious(state, siblings[firstIndex - 1].from, siblings[firstIndex - 1].to, groupStart, siblings[lastIndex].to, groupEnd)
      : swapMarkdownRangeWithNext(
          state,
          groupStart,
          siblings[lastIndex].to,
          groupEnd,
          siblings[lastIndex + 1].to,
          siblings[lastIndex + 2]?.from ?? getLineEndOffset(state.value, listEnd),
        );
  const insertionLine = findLineIndex(moved.value.split("\n"), Math.min(moved.selectionStart, moved.selectionEnd));
  return renumberMovedMarkdownSelection(moved, insertionLine, baseStartNumber ?? undefined);
}

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface TextEditResult extends TextState {}

interface MarkdownFrontMatterRange {
  contentStart: number;
  contentEnd: number;
  closingContentEnd: number;
  closingEnd: number;
}

export function normalizeSelection(state: TextState): TextState {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd));
  const selectionEnd = Math.max(0, Math.max(state.selectionStart, state.selectionEnd));
  return {
    value: state.value,
    selectionStart,
    selectionEnd,
  };
}

export function selectCurrentLine(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  const range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);
  const selectionStart = getChunkStartOffset(chunks, range.start);
  const selectionEnd = getChunkContentEndOffset(chunks, range.end);
  return { value: normalized.value, selectionStart, selectionEnd };
}

export function selectCurrentParagraph(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  let range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);

  while (range.start > 0 && !isBlankLineChunk(chunks[range.start - 1])) {
    range = { ...range, start: range.start - 1 };
  }
  while (range.end + 1 < chunks.length && !isBlankLineChunk(chunks[range.end + 1])) {
    range = { ...range, end: range.end + 1 };
  }

  const selectionStart = getChunkStartOffset(chunks, range.start);
  const selectionEnd = getChunkContentEndOffset(chunks, range.end);
  return { value: normalized.value, selectionStart, selectionEnd };
}

export function selectCurrentWord(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getWordRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return {
    value: normalized.value,
    selectionStart: range.start,
    selectionEnd: range.end,
  };
}

export function selectCurrentSentence(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getSentenceRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return {
    value: normalized.value,
    selectionStart: range.start,
    selectionEnd: range.end,
  };
}

export function deleteCurrentWord(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getWordRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return deleteTextRange(normalized, range);
}

export function deleteCurrentSentence(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getSentenceRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return deleteTextRange(normalized, range);
}

export function deleteCurrentParagraph(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = selectCurrentParagraph(normalized);
  return deleteTextRange(normalized, {
    start: range.selectionStart,
    end: range.selectionEnd,
  });
}

function deleteTextRange(state: TextState, range: IndexRange): TextEditResult {
  const value = `${state.value.slice(0, range.start)}${state.value.slice(range.end)}`;
  return {
    value,
    selectionStart: range.start,
    selectionEnd: range.start,
  };
}

function getWordRange(value: string, selectionStart: number, selectionEnd: number): IndexRange {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(0, Math.max(selectionStart, selectionEnd));
  if (start !== end) {
    return { start, end };
  }

  if (!value) {
    return { start: 0, end: 0 };
  }

  const cursor = Math.max(0, Math.min(start, value.length));
  const right = value.codePointAt(cursor);
  const leftStart = cursor > 0 ? previousCodePointStart(value, cursor) : 0;
  const left = cursor > 0 ? value.codePointAt(leftStart) : undefined;
  const target = right !== undefined && isMarkdownWordCodePoint(right)
    ? right
    : left !== undefined && isMarkdownWordCodePoint(left)
      ? left
      : undefined;

  if (target === undefined) {
    return { start: cursor, end: cursor };
  }

  let rangeStart = right !== undefined && isMarkdownWordCodePoint(right) ? cursor : leftStart;
  let rangeEnd = rangeStart + codePointLength(value.codePointAt(rangeStart) ?? target);

  while (rangeStart > 0) {
    const previousStart = previousCodePointStart(value, rangeStart);
    const codePoint = value.codePointAt(previousStart);
    if (codePoint === undefined || !isMarkdownWordCodePoint(codePoint)) break;
    rangeStart = previousStart;
  }

  while (rangeEnd < value.length) {
    const codePoint = value.codePointAt(rangeEnd);
    if (codePoint === undefined || !isMarkdownWordCodePoint(codePoint)) break;
    rangeEnd += codePointLength(codePoint);
  }

  return { start: rangeStart, end: rangeEnd };
}

function getSentenceRange(value: string, selectionStart: number, selectionEnd: number): IndexRange {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(0, Math.max(selectionStart, selectionEnd));
  if (start !== end) {
    return { start, end };
  }

  if (!value) {
    return { start: 0, end: 0 };
  }

  const cursor = Math.max(0, Math.min(start, value.length));
  const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const rawLineEnd = value.indexOf("\n", cursor);
  const lineEnd = rawLineEnd >= 0 ? rawLineEnd : value.length;
  const bodyEnd = value[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;

  let rangeStart = lineStart;
  for (let index = Math.min(cursor - 1, bodyEnd - 1); index >= lineStart; index -= 1) {
    if (!isSentenceTerminator(value[index])) continue;
    rangeStart = index + 1;
    while (rangeStart < bodyEnd && /\s/.test(value[rangeStart])) rangeStart += 1;
    break;
  }

  let rangeEnd = bodyEnd;
  for (let index = Math.max(cursor, lineStart); index < bodyEnd; index += 1) {
    if (!isSentenceTerminator(value[index])) continue;
    rangeEnd = index + 1;
    while (rangeEnd < bodyEnd && isClosingSentencePunctuation(value[rangeEnd])) rangeEnd += 1;
    break;
  }

  while (rangeStart < rangeEnd && /\s/.test(value[rangeStart])) rangeStart += 1;
  return { start: rangeStart, end: rangeEnd };
}

function isSentenceTerminator(value: string): boolean {
  return /[.!?。！？]/.test(value);
}

function isClosingSentencePunctuation(value: string): boolean {
  return /["')\]}”’」』）】》]/.test(value);
}

function previousCodePointStart(value: string, index: number): number {
  const previous = Math.max(0, index - 1);
  const code = value.charCodeAt(previous);
  if (previous > 0 && code >= 0xdc00 && code <= 0xdfff) {
    return previous - 1;
  }
  return previous;
}

function codePointLength(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1;
}

function isMarkdownWordCodePoint(codePoint: number): boolean {
  return codePoint === 95 || /[\p{L}\p{N}]/u.test(String.fromCodePoint(codePoint));
}

export function duplicateMarkdownLines(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  const range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);
  const selectionStart = getChunkStartOffset(chunks, range.start);
  const selectionEnd = getChunkContentEndOffset(chunks, range.end);
  const spanEnd = getChunkEndOffset(chunks, range.end);
  const selected = chunks.slice(range.start, range.end + 1).join("");
  const needsLeadingBreak = spanEnd === normalized.value.length && !selected.endsWith("\n");
  const leadingBreak = needsLeadingBreak ? getPreferredLineBreak(normalized.value) : "";
  const insertion = `${leadingBreak}${selected}`;
  const value = `${normalized.value.slice(0, spanEnd)}${insertion}${normalized.value.slice(spanEnd)}`;
  const duplicatedStart = spanEnd + leadingBreak.length;
  const baseStartNumber = getOrderedListStartNumberAtLine(normalized.value, range.start);
  const renumberedValue = renumberOrderedListBlockAtLine(
    value,
    findLineIndex(value.split("\n"), duplicatedStart),
    baseStartNumber ?? undefined,
  );
  return {
    value: renumberedValue,
    selectionStart: duplicatedStart + (normalized.selectionStart - selectionStart),
    selectionEnd: duplicatedStart + (normalized.selectionEnd - selectionStart),
  };
}

export function deleteMarkdownLines(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  const range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);
  const deleteStart = getChunkStartOffset(chunks, range.start);
  const deleteEnd = getChunkEndOffset(chunks, range.end);
  const value = `${normalized.value.slice(0, deleteStart)}${normalized.value.slice(deleteEnd)}`;
  const cursor = Math.min(deleteStart, value.length);
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function moveMarkdownLines(state: TextState, direction: "up" | "down"): TextEditResult {
  return moveTextLines(state, direction, true);
}

function moveTextLines(
  state: TextState,
  direction: "up" | "down",
  renumberOrderedLists: boolean,
): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  const range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);
  const baseStartNumber = renumberOrderedLists
    ? getOrderedListStartNumberAtLine(normalized.value, range.start)
    : null;

  if (direction === "up") {
    if (range.start === 0) return normalized;
    const previousLength = chunks[range.start - 1].length;
    const moved = chunks.splice(range.start, range.end - range.start + 1);
    if (!hasTrailingLineBreak(moved[moved.length - 1]) && hasTrailingLineBreak(chunks[range.start - 1])) {
      const lineBreak = getTrailingLineBreak(chunks[range.start - 1]);
      chunks[range.start - 1] = chunks[range.start - 1].slice(0, -lineBreak.length);
      moved[moved.length - 1] = `${moved[moved.length - 1]}${lineBreak}`;
    }
    chunks.splice(range.start - 1, 0, ...moved);
    const result = {
      value: chunks.join(""),
      selectionStart: Math.max(0, normalized.selectionStart - previousLength),
      selectionEnd: Math.max(0, normalized.selectionEnd - previousLength),
    };
    return renumberOrderedLists
      ? renumberMovedMarkdownSelection(result, range.start - 1, baseStartNumber ?? undefined)
      : result;
  }

  if (range.end >= chunks.length - 1) return normalized;
  let nextLength = chunks[range.end + 1].length;
  const moved = chunks.splice(range.start, range.end - range.start + 1);
  if (hasTrailingLineBreak(moved[moved.length - 1]) && !hasTrailingLineBreak(chunks[range.start])) {
    const lineBreak = getTrailingLineBreak(moved[moved.length - 1]);
    moved[moved.length - 1] = moved[moved.length - 1].slice(0, -lineBreak.length);
    chunks[range.start] = `${chunks[range.start]}${lineBreak}`;
    nextLength += lineBreak.length;
  }
  chunks.splice(range.start + 1, 0, ...moved);
  const result = {
    value: chunks.join(""),
    selectionStart: normalized.selectionStart + nextLength,
    selectionEnd: normalized.selectionEnd + nextLength,
  };
  return renumberOrderedLists
    ? renumberMovedMarkdownSelection(result, range.start + 1, baseStartNumber ?? undefined)
    : result;
}

export function moveMarkdownBlocks(state: TextState, direction: "up" | "down"): TextEditResult {
  const normalized = normalizeSelection(state);
  const frontMatterMove = moveMarkdownFrontMatterLines(normalized, direction);
  if (frontMatterMove) return frontMatterMove;

  const listItemMove = moveMarkdownListItems(normalized, direction);
  if (listItemMove) return listItemMove;

  const blocks = splitMarkdownBlocks(normalized.value);
  if (blocks.length < 2) return normalized;
  const selectionStart = findMarkdownBlockIndexAt(blocks, normalized.selectionStart);
  const selectionEndProbe = normalized.selectionEnd > normalized.selectionStart
    ? normalized.selectionEnd - 1
    : normalized.selectionEnd;
  const selectionEnd = findMarkdownBlockIndexAt(blocks, selectionEndProbe);
  if (selectionStart < 0 || selectionEnd < selectionStart) return normalized;

  const groupStart = blocks[selectionStart].start;
  const groupEnd = blocks[selectionEnd + 1]?.start ?? normalized.value.length;
  if (direction === "up") {
    if (selectionStart === 0) return normalized;
    if (blocks[selectionStart - 1].type === "frontmatter") return normalized;
    return swapMarkdownRangeWithPrevious(
      normalized,
      blocks[selectionStart - 1].start,
      getMarkdownBlockContentEnd(blocks[selectionStart - 1]),
      groupStart,
      getMarkdownBlockContentEnd(blocks[selectionEnd]),
      groupEnd,
    );
  }

  if (selectionEnd >= blocks.length - 1) return normalized;
  const nextEnd = blocks[selectionEnd + 2]?.start ?? normalized.value.length;
  return swapMarkdownRangeWithNext(
    normalized,
    groupStart,
    getMarkdownBlockContentEnd(blocks[selectionEnd]),
    groupEnd,
    getMarkdownBlockContentEnd(blocks[selectionEnd + 1]),
    nextEnd,
  );
}

function moveMarkdownFrontMatterLines(
  state: TextState,
  direction: "up" | "down",
): TextEditResult | null {
  const frontMatter = findMarkdownFrontMatterRange(state.value);
  if (!frontMatter || state.selectionStart >= frontMatter.closingEnd) return null;
  if (state.selectionEnd > frontMatter.closingEnd) return state;

  const chunks = collectLineChunks(state.value);
  const range = getSelectedLineIndexes(chunks, state.selectionStart, state.selectionEnd);
  const firstContentLine = getChunkIndexAtOffset(chunks, frontMatter.contentStart);
  const closingLine = getChunkIndexAtOffset(chunks, frontMatter.contentEnd);
  if (range.start < firstContentLine || range.end >= closingLine) return state;
  if (direction === "up" && range.start === firstContentLine) return state;
  if (direction === "down" && range.end === closingLine - 1) return state;
  return moveTextLines(state, direction, false);
}

function renumberMovedMarkdownSelection(
  state: TextEditResult,
  lineIndex: number,
  startNumber?: string,
): TextEditResult {
  const value = renumberOrderedListBlockAtLine(state.value, lineIndex, startNumber);
  if (value === state.value) return state;
  return {
    value,
    selectionStart: mapOffsetAcrossLineRewrite(state.value, value, state.selectionStart),
    selectionEnd: mapOffsetAcrossLineRewrite(state.value, value, state.selectionEnd),
  };
}

function mapOffsetAcrossLineRewrite(before: string, after: string, offset: number): number {
  const beforeChunks = collectLineChunks(before);
  const afterChunks = collectLineChunks(after);
  const lineIndex = getChunkIndexAtOffset(beforeChunks, Math.max(0, Math.min(offset, before.length)));
  const beforeStart = getChunkStartOffset(beforeChunks, lineIndex);
  const afterStart = getChunkStartOffset(afterChunks, Math.min(lineIndex, afterChunks.length - 1));
  const beforeLine = stripLineBreak(beforeChunks[lineIndex] ?? "");
  const afterLine = stripLineBreak(afterChunks[lineIndex] ?? "");
  const column = Math.max(0, offset - beforeStart);

  if (column > beforeLine.length) {
    return afterStart + afterLine.length + Math.min(
      column - beforeLine.length,
      (afterChunks[lineIndex] ?? "").length - afterLine.length,
    );
  }

  let commonPrefix = 0;
  while (
    commonPrefix < beforeLine.length
    && commonPrefix < afterLine.length
    && beforeLine[commonPrefix] === afterLine[commonPrefix]
  ) {
    commonPrefix += 1;
  }
  let commonSuffix = 0;
  while (
    commonSuffix < beforeLine.length - commonPrefix
    && commonSuffix < afterLine.length - commonPrefix
    && beforeLine[beforeLine.length - commonSuffix - 1] === afterLine[afterLine.length - commonSuffix - 1]
  ) {
    commonSuffix += 1;
  }

  const mappedColumn = column <= commonPrefix
    ? column
    : column >= beforeLine.length - commonSuffix
      ? afterLine.length - (beforeLine.length - column)
      : Math.min(afterLine.length - commonSuffix, commonPrefix + column - commonPrefix);
  return afterStart + Math.max(0, mappedColumn);
}

function getLineEndOffset(value: string, position: number): number {
  const newline = value.indexOf("\n", Math.max(0, position));
  return newline < 0 ? value.length : newline + 1;
}

function swapMarkdownRangeWithPrevious(
  state: TextState,
  previousStart: number,
  previousEnd: number,
  groupStart: number,
  groupContentEnd: number,
  groupEnd: number,
): TextEditResult {
  const previous = state.value.slice(previousStart, previousEnd);
  const between = state.value.slice(previousEnd, groupStart);
  const selected = state.value.slice(groupStart, groupContentEnd);
  const after = state.value.slice(groupContentEnd, groupEnd);
  const value = `${state.value.slice(0, previousStart)}${selected}${between}${previous}${after}${state.value.slice(groupEnd)}`;
  return {
    value,
    selectionStart: state.selectionStart - previous.length - between.length,
    selectionEnd: state.selectionEnd - previous.length - between.length,
  };
}

function swapMarkdownRangeWithNext(
  state: TextState,
  groupStart: number,
  groupContentEnd: number,
  groupEnd: number,
  nextContentEnd: number,
  nextEnd: number,
): TextEditResult {
  const selected = state.value.slice(groupStart, groupContentEnd);
  const between = state.value.slice(groupContentEnd, groupEnd);
  const next = state.value.slice(groupEnd, nextContentEnd);
  const after = state.value.slice(nextContentEnd, nextEnd);
  const value = `${state.value.slice(0, groupStart)}${next}${between}${selected}${after}${state.value.slice(nextEnd)}`;
  return {
    value,
    selectionStart: state.selectionStart + next.length + between.length,
    selectionEnd: state.selectionEnd + next.length + between.length,
  };
}

function findMarkdownFrontMatterRange(value: string): MarkdownFrontMatterRange | null {
  const chunks = collectLineChunks(value);
  const opening = stripLineBreak(chunks[0] ?? "");
  if (!isYamlFrontMatterOpening(opening) || !hasTrailingLineBreak(chunks[0] ?? "")) return null;

  const contentStart = (chunks[0] ?? "").length;
  let offset = contentStart;
  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? "";
    const line = stripLineBreak(chunk);
    if (isYamlFrontMatterClosing(line)) {
      return {
        contentStart,
        contentEnd: offset,
        closingContentEnd: offset + line.length,
        closingEnd: offset + chunk.length,
      };
    }
    offset += chunk.length;
  }
  return null;
}

interface IndexRange {
  start: number;
  end: number;
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

function getOrderedListStartNumberAtLine(value: string, lineIndex: number): string | null {
  const lines = value.split("\n");
  if (!isListBlockLineForRenumber(lines[lineIndex] ?? "")) return null;

  let start = lineIndex;
  let end = lineIndex;
  while (start > 0 && isListBlockLineForRenumber(lines[start - 1])) start -= 1;
  while (end + 1 < lines.length && isListBlockLineForRenumber(lines[end + 1])) end += 1;

  let baseWidth = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    const match = lines[index].match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (match) {
      baseWidth = Math.min(baseWidth, getIndentWidth(match[1]));
    }
  }
  if (!Number.isFinite(baseWidth)) return null;

  for (let index = start; index <= end; index += 1) {
    const ordered = lines[index].match(/^(\s*)(\d+)[.)]\s+/);
    if (ordered && getIndentWidth(ordered[1]) === baseWidth) {
      return normalizeOrderedListNumber(ordered[2]);
    }
  }

  return null;
}

function isListBlockLineForRenumber(line: string): boolean {
  return Boolean(line.trim()) && (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line) || /^\s{2,}\S/.test(line));
}

function collectLineChunks(value: string): string[] {
  if (!value) return [""];

  const chunks: string[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\n") continue;
    chunks.push(value.slice(start, index + 1));
    start = index + 1;
  }
  if (start < value.length) {
    chunks.push(value.slice(start));
  }
  return chunks.length > 0 ? chunks : [""];
}

function getSelectedLineIndexes(
  chunks: string[],
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(0, Math.max(selectionStart, selectionEnd));
  const endCursor = end > start ? end - 1 : end;
  return {
    start: getChunkIndexAtOffset(chunks, start),
    end: getChunkIndexAtOffset(chunks, endCursor),
  };
}

function getChunkIndexAtOffset(chunks: string[], offset: number): number {
  let cursor = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const next = cursor + chunks[index].length;
    if (offset < next || index === chunks.length - 1) return index;
    cursor = next;
  }
  return Math.max(0, chunks.length - 1);
}

function getChunkStartOffset(chunks: string[], lineIndex: number): number {
  return chunks.slice(0, lineIndex).join("").length;
}

function getChunkEndOffset(chunks: string[], lineIndex: number): number {
  return chunks.slice(0, lineIndex + 1).join("").length;
}

function getChunkContentEndOffset(chunks: string[], lineIndex: number): number {
  const end = getChunkEndOffset(chunks, lineIndex);
  const chunk = chunks[lineIndex] ?? "";
  return chunk.endsWith("\n") ? end - (chunk.endsWith("\r\n") ? 2 : 1) : end;
}

function isBlankLineChunk(chunk: string): boolean {
  return chunk.replace(/\r?\n$/, "").trim() === "";
}

function hasTrailingLineBreak(chunk: string): boolean {
  return /\r?\n$/.test(chunk);
}

function getTrailingLineBreak(chunk: string): "\n" | "\r\n" {
  return chunk.endsWith("\r\n") ? "\r\n" : "\n";
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

function getIndentWidth(value: string): number {
  return getMarkdownIndentWidth(value);
}

function stripLineBreak(value: string): string {
  return value.replace(/\r?\n$/, "");
}



interface OrderedListFrame {
  width: number;
  delimiter: string;
  next: string;
}

interface QuotePrefixInfo {
  raw: string;
  key: string;
  leading: string;
  depth: number;
}

interface ListLineContext {
  prefix: string;
  content: string;
  key: string;
}

export function renumberOrderedListBlockAtLine(
  value: string,
  touchedLineIndex: number,
  baseStartNumber?: string,
): string {
  const lines = value.split("\n");
  const range = findListBlockRange(lines, touchedLineIndex);
  if (!range) return value;

  const baseWidth = getListBlockBaseWidth(lines, range.start, range.end, range.key);
  const frames: OrderedListFrame[] = [];

  for (let index = range.start; index <= range.end; index += 1) {
    const context = getListLineContext(lines[index]);
    if (context.key !== range.key) continue;

    const ordered = context.content.match(/^(\s*)(\d+)([.)])(\s+)/);
    if (ordered) {
      const width = getIndentWidth(ordered[1]);
      while (frames.length > 0 && frames[frames.length - 1].width > width) {
        frames.pop();
      }
      if (
        frames.length === 0
        || frames[frames.length - 1].width !== width
        || frames[frames.length - 1].delimiter !== ordered[3]
      ) {
        while (frames.length > 0 && frames[frames.length - 1].width >= width) {
          frames.pop();
        }
        frames.push({
          width,
          delimiter: ordered[3],
          next: width === baseWidth
            ? normalizeOrderedListNumber(baseStartNumber ?? ordered[2])
            : "1",
        });
      }

      const frame = frames[frames.length - 1];
      lines[index] = `${context.prefix}${ordered[1]}${frame.next}${ordered[3]}${ordered[4]}${context.content.slice(ordered[0].length)}`;
      frame.next = incrementOrderedListNumber(frame.next);
      continue;
    }

    const unordered = context.content.match(/^(\s*)[-*+]\s+/);
    if (unordered) {
      const width = getIndentWidth(unordered[1]);
      while (frames.length > 0 && frames[frames.length - 1].width >= width) {
        frames.pop();
      }
      continue;
    }

    if (!context.content.trim()) {
      frames.length = 0;
      continue;
    }

    const width = getIndentWidth(context.content.match(/^\s*/)?.[0] ?? "");
    while (frames.length > 0 && frames[frames.length - 1].width >= width) {
      frames.pop();
    }
  }

  return lines.join("\n");
}

function findListBlockRange(lines: string[], touchedLineIndex: number): { start: number; end: number; key: string } | null {
  const key = getListLineContext(lines[touchedLineIndex] ?? "").key;
  if (!isListBlockLineAt(lines, touchedLineIndex, key)) return null;

  let start = touchedLineIndex;
  let end = touchedLineIndex;
  while (start > 0 && isListBlockLineAt(lines, start - 1, key)) start -= 1;
  while (end + 1 < lines.length && isListBlockLineAt(lines, end + 1, key)) end += 1;
  return { start, end, key };
}

function isListBlockLineAt(lines: string[], lineIndex: number, key: string): boolean {
  const line = lines[lineIndex] ?? "";
  const context = getListLineContext(line);
  if (context.key !== key || !context.content.trim()) return false;

  const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
  if (marker) {
    return isListMarkerIndentAllowedAt(lines, lineIndex, key, marker[1]);
  }

  const continuation = context.content.match(/^([ \t]{2,}|\t)\S/);
  return Boolean(continuation && hasParentListMarkerBefore(lines, lineIndex, key, continuation[1]));
}

function getListBlockBaseWidth(lines: string[], start: number, end: number, key: string): number {
  let width = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    const context = getListLineContext(lines[index]);
    if (context.key !== key) continue;
    const match = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (match && isListMarkerIndentAllowedAt(lines, index, key, match[1])) {
      width = Math.min(width, getIndentWidth(match[1]));
    }
  }
  return Number.isFinite(width) ? width : 0;
}

function isListMarkerIndentAllowedAt(lines: string[], lineIndex: number, key: string, indent: string): boolean {
  return getIndentWidth(indent) < 4 || hasParentListMarkerBefore(lines, lineIndex, key, indent);
}

function hasParentListMarkerBefore(lines: string[], lineIndex: number, key: string, indent: string): boolean {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const context = getListLineContext(lines[index] ?? "");
    if (context.key !== key) {
      if (context.content.trim()) return false;
      continue;
    }

    const body = context.content.replace(/\r$/, "");
    if (!body.trim()) continue;

    const marker = body.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (marker) {
      if (!isListMarkerIndentAllowedAt(lines, index, key, marker[1])) return false;
      if (getIndentWidth(marker[1]) <= getIndentWidth(indent)) return true;
      continue;
    }

    if (/^(?:[ \t]{2,}|\t)/.test(body)) {
      continue;
    }

    return false;
  }

  return false;
}

function getListLineContext(line: string): ListLineContext {
  const quote = getQuotePrefixInfo(line);
  if (!quote) {
    return { prefix: "", content: line, key: "plain" };
  }

  return {
    prefix: quote.raw,
    content: line.slice(quote.raw.length),
    key: quote.key,
  };
}

function getQuotePrefixInfo(line: string): QuotePrefixInfo | null {
  const quote = readMarkdownBlockquotePrefix(line);
  if (!quote) return null;
  return {
    raw: quote.raw,
    key: `quote:${quote.depth}`,
    leading: quote.raw.match(/^[ \t]*/)?.[0] ?? "",
    depth: quote.depth,
  };
}



const DECIMAL_INTEGER_PATTERN = /^\d+$/;

export function normalizeOrderedListNumber(value: string): string {
  if (!DECIMAL_INTEGER_PATTERN.test(value)) return value;
  const normalized = value.replace(/^0+(?=\d)/, "");
  return normalized || "0";
}

export function incrementOrderedListNumber(value: string): string {
  const normalized = normalizeOrderedListNumber(value);
  if (!DECIMAL_INTEGER_PATTERN.test(normalized)) return value;

  const digits = normalized.split("");
  let carry = 1;
  for (let index = digits.length - 1; index >= 0 && carry > 0; index -= 1) {
    const next = (digits[index]?.charCodeAt(0) ?? 48) - 48 + carry;
    digits[index] = String(next % 10);
    carry = next >= 10 ? 1 : 0;
  }
  if (carry > 0) digits.unshift("1");
  return digits.join("");
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



export function isYamlFrontMatterOpening(line: string): boolean {
  return /^\uFEFF?---[ \t]*\r?$/.test(line);
}

export function isYamlFrontMatterClosing(line: string): boolean {
  return /^(?:---|\.\.\.)[ \t]*\r?$/.test(line);
}

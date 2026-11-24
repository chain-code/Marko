// Tab、Shift+Tab（E-5、B-4）和「缩进」「反缩进」Ctrl+]、Ctrl+[（B-4）：列表项连同子项缩进一层、反缩进一层（有序列表重新编号），
// 引用里反缩进去掉一层 `>`，Front Matter 里插入缩进，别处插入制表符。
// 代码移植自旧版 src/utils/editorBlocks.ts 的 applyContextualMarkdownTab、indentSelection（tests/editorBlocks.test.ts 的基准）；
// 旧版逐行扫描找 Front Matter 和代码、公式、HTML 块，这里换成文档树给的范围（inlineLayout.ts）。
// 代码块等是 CodeMirror（NodeView），里面的 Tab 由 CodeMirror 处理，到不了这里
/* eslint-disable */
import { currentInlineLayout } from "./inlineLayout.ts";

/** Front Matter 的内容：开头那一行之后、结尾那一行之前（文档树里的 Front Matter 块） */
function getFrontMatterContentRange(lines: LineInfo[]): { start: number; end: number } | null {
  const block = currentInlineLayout().blocks.find((item) => item.type === "frontmatter");
  if (!block || block.start !== 0 || !lines[0]) return null;
  let closing = 0;
  while (closing + 1 < lines.length && lines[closing + 1].start < block.end) closing += 1;
  if (closing === 0) return null;
  return { start: lines[0].end, end: lines[closing].start };
}

/** 这一行所在的代码、公式、HTML 块（开头那一行也算）最后一行的行号；不在这类块里时为 null */
function getContainingRawBlockEndLine(lines: LineInfo[], lineIndex: number): number | null {
  const line = lines[lineIndex];
  if (!line) return null;
  for (const block of currentInlineLayout().fenced) {
    if (line.start < block.start || line.start > block.end) continue;
    let end = lineIndex;
    while (end + 1 < lines.length && lines[end + 1].start <= block.end) end += 1;
    return end;
  }
  return null;
}

interface LineInfo {
  text: string;
  start: number;
  end: number;
}

export function isMarkdownHorizontalRuleLine(value: string): boolean {
  const line = value.replace(/\r?\n$/, "");
  return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line);
}

function isIndentedCodeLine(line: string): boolean {
  return isMarkdownCodeIndented(line);
}

function isPlainRawHtmlBlock(value: string): boolean {
  return /^<\/?(address|article|aside|audio|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul|video)(?=[\s>/])/i.test(value);
}

function isRawHtmlBlockStart(value: string): boolean {
  return /^<!--/.test(value)
    || /^<\?/.test(value)
    || /^<![A-Z]/.test(value)
    || /^<!\[CDATA\[/.test(value)
    || /^<(script|pre|style|textarea)(?=[\s>/])/i.test(value)
    || isPlainRawHtmlBlock(value);
}

function getRawFenceLineContext(
  line: string,
  maximumQuoteDepth: number | null = null,
): {
  content: string;
  contentColumn: number;
  key: string;
} {
  const quote = readMarkdownBlockquotePrefix(line, maximumQuoteDepth);
  return quote
    ? {
      content: line.slice(quote.raw.length),
      contentColumn: quote.contentColumn,
      key: `quote:${quote.depth}`,
    }
    : { content: line, contentColumn: 0, key: "plain" };
}

function findMarkdownListEndLine(lines: LineInfo[], startIndex: number): number | null {
  const startContext = getMarkdownListLineContext(lines[startIndex]?.text ?? "");
  const key = startContext.key;
  if (!isMarkdownListMarkerLineAt(lines[startIndex]?.text ?? "", key)) return null;

  let endLine = startIndex;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const context = getMarkdownListLineContext(lines[index].text);
    if (context.key !== key) {
      const previous = getMarkdownListLineContext(lines[index - 1]?.text ?? "");
      if (
        key !== "plain"
        && context.key === "plain"
        && previous.content.trim()
        && isMarkdownListLazyContinuation(lines, index, key)
      ) {
        endLine = index;
        continue;
      }
      break;
    }

    if (isMarkdownHorizontalRuleLine(context.content)) break;

    if (isMarkdownListMarkerContent(context.content)) {
      endLine = index;
      continue;
    }

    if (!context.content.trim()) {
      if (!hasFollowingMarkdownListLine(lines, index + 1, key)) {
        break;
      }
      endLine = index;
      continue;
    }

    if (isMarkdownListContinuationContent(context.content)) {
      endLine = index;
      continue;
    }

    const previous = getMarkdownListLineContext(lines[index - 1]?.text ?? "");
    if (
      previous.content.trim()
      && isMarkdownListLazyContinuation(lines, index, key)
    ) {
      endLine = index;
      continue;
    }

    break;
  }

  return endLine;
}

function isMarkdownListLazyContinuation(
  lines: LineInfo[],
  index: number,
  key: string,
): boolean {
  const context = getMarkdownListLineContext(lines[index]?.text ?? "");
  if (!context.content.trim()) return false;
  if (context.key !== key && !(key !== "plain" && context.key === "plain")) return false;
  if (isMarkdownListMarkerContent(context.content)) return false;
  return !isMarkdownListInterruptingContent(lines, index, context.key);
}

function isMarkdownListInterruptingContent(
  lines: LineInfo[],
  index: number,
  key: string,
): boolean {
  const content = getMarkdownListLineContext(lines[index]?.text ?? "").content.replace(/^ {0,3}/, "");
  if (readDollarMathBlockOpening(content)) return true;
  if (
    /^(?:#{1,6}(?:[ \t]+|$)|>|(?:`{3,}|~{3,})(?:[^\r\n]*)$|\\\[[ \t]*$)/.test(content)
  ) {
    return true;
  }
  if (isMarkdownHorizontalRuleLine(content)) return true;
  if (/^(?:\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|\[[^\]\n]+]:[ \t]*\S|[ \t]{0,3}:(?:[ \t]+|$))/.test(content)) {
    return true;
  }
  if (isRawHtmlBlockStart(content)) return true;

  const next = getMarkdownListLineContext(lines[index + 1]?.text ?? "");
  return next.key === key && isTableRow(content) && isTableSeparator(next.content);
}

function isMarkdownListMarkerLineAt(line: string, key: string): boolean {
  const context = getMarkdownListLineContext(line);
  return context.key === key && isMarkdownListMarkerContent(context.content);
}

function isMarkdownListMarkerContent(content: string): boolean {
  return /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/.test(content);
}

function isMarkdownListContinuationContent(content: string): boolean {
  return /^(?:[ \t]{2,}|\t)/.test(content);
}

function hasFollowingMarkdownListLine(lines: LineInfo[], startIndex: number, key: string): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getMarkdownListLineContext(lines[index].text);
    if (context.key !== key) return false;
    if (!context.content.trim()) continue;
    return isMarkdownListMarkerContent(context.content) || isMarkdownListContinuationContent(context.content);
  }
  return false;
}

function getMarkdownListLineContext(line: string): { content: string; key: string } {
  return getRawFenceLineContext(line);
}

function isTableRow(line: string): boolean {
  return countUnescapedPipes(line.trim()) > 0;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  let content = line.trim();
  if (content.startsWith("|")) {
    content = content.slice(1);
  }
  if (content.endsWith("|") && !isEscapedAt(content, content.length - 1)) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscapedAt(content, index)) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += content[index];
  }
  cells.push(current.trim());
  return cells;
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function countUnescapedPipes(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "|" && !isEscapedAt(value, index)) {
      count += 1;
    }
  }
  return count;
}

export function indentSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
  indentSize = 2,
): { value: string; selectionStart: number; selectionEnd: number } {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEnd = selectionEnd === selectionStart
    ? value.indexOf("\n", selectionEnd)
    : value.indexOf("\n", selectionEnd - 1);
  const normalizedLineEnd = lineEnd === -1 ? value.length : lineEnd;

  return indentLineRange(
    value,
    lineStart,
    normalizedLineEnd,
    selectionStart,
    selectionEnd,
    outdent,
    indentSize,
  );
}

export function isMarkdownListItemAtOffset(value: string, offset: number): boolean {
  const position = Math.max(0, Math.min(offset, value.length));
  const lineInfos = collectLines(value);
  const lineIndex = getLineIndexAtOffset(value, position);
  const line = lineInfos[lineIndex];
  if (!line) return false;

  const lines = lineInfos.map((item) => item.text);
  const context = getListLineContext(line.text);
  const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
  return Boolean(
    marker
    && isListMarkerIndentAllowedAt(lines, lineIndex, context.key, marker[1]),
  );
}

export function applyContextualMarkdownTab(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
  indentSize = 2,
  codeIndentSize = 4,
): { value: string; selectionStart: number; selectionEnd: number } {
  const normalizedIndentSize = indentSize === 4 ? 4 : 2;
  const normalizedCodeIndentSize = normalizeCodeIndentSize(codeIndentSize);
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const lineInfos = collectLines(value);
  const frontMatter = getFrontMatterContentRange(lineInfos);

  if (
    frontMatter
    && start >= frontMatter.start
    && (start === end ? start < frontMatter.end : end <= frontMatter.end)
  ) {
    if (outdent) return { value, selectionStart: start, selectionEnd: end };

    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const linePrefix = value.slice(lineStart, start);
    const insertion = /^[ \t]*$/.test(linePrefix)
      ? " ".repeat(normalizedIndentSize)
      : "\t";
    return replaceTextSelection(value, start, end, insertion);
  }

  if (start !== end) {
    const startLine = getLineIndexAtOffset(value, start);
    const endLine = getLineIndexAtOffset(value, Math.max(start, end - 1));
    if (
      isRawBlockLineRange(lineInfos, startLine, endLine)
      || isIndentedCodeLineRange(lineInfos, startLine, endLine)
    ) {
      return indentSelection(value, start, end, outdent, normalizedCodeIndentSize);
    }
    if (isMarkdownListLineRange(lineInfos, startLine, endLine)) {
      return indentSelection(value, start, end, outdent, normalizedIndentSize);
    }
    if (outdent) {
      return outdentMarkdownQuoteRange(value, start, end, lineInfos)
        ?? indentSelection(value, start, end, true, normalizedIndentSize);
    }
    return replaceTextSelection(value, start, end, "\t");
  }

  const lineIndex = getLineIndexAtOffset(value, start);
  const line = lineInfos[lineIndex];
  const isListLine = isMarkdownListItemAtOffset(value, start);
  const isCodeLine = Boolean(
    line
    && !isListLine
    && (isLineInsideRawBlock(lineInfos, lineIndex) || isIndentedCodeLine(line.text)),
  );
  if (line && !isCodeLine) {
    const lines = lineInfos.map((item) => item.text);
    const context = getListLineContext(line.text);
    const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (marker && isListMarkerIndentAllowedAt(lines, lineIndex, context.key, marker[1])) {
      const currentIndentWidth = getIndentWidth(marker[1]);
      if (outdent) {
        if (currentIndentWidth === 0) {
          return unwrapRootMarkdownListItem(value, start, line, context);
        }
      } else if (!hasPreviousListSibling(lines, lineIndex, context, currentIndentWidth)) {
        return insertTabAtCursor(value, start);
      }

      const subtreeEndLine = findListSubtreeEndLine(lines, lineIndex, context, currentIndentWidth);
      const subtreeEnd = lineInfos[subtreeEndLine].start + lineInfos[subtreeEndLine].text.length;
      return indentLineRange(
        value,
        line.start,
        subtreeEnd,
        start,
        end,
        outdent,
        normalizedIndentSize,
      );
    }
  }

  if (isCodeLine && line) {
    if (!outdent) return insertTabAtCursor(value, start);
    return indentLineRange(
      value,
      line.start,
      line.start + line.text.length,
      start,
      end,
      true,
      normalizedCodeIndentSize,
    );
  }

  if (outdent) {
    const quoteResult = outdentMarkdownQuoteRange(value, start, end, lineInfos);
    if (quoteResult) return quoteResult;
  }

  if (!outdent) {
    return insertTabAtCursor(value, start);
  }

  const removable = getRemovableIndentBeforeCursor(value, start, normalizedIndentSize);
  if (removable === 0) return unchangedTextEdit(value, start);
  return {
    value: value.slice(0, start - removable) + value.slice(start),
    selectionStart: start - removable,
    selectionEnd: start - removable,
  };
}

function replaceTextSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  replacement: string,
): { value: string; selectionStart: number; selectionEnd: number } {
  const cursor = selectionStart + replacement.length;
  return {
    value: value.slice(0, selectionStart) + replacement + value.slice(selectionEnd),
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

function isRawBlockLineRange(lines: LineInfo[], startLine: number, endLine: number): boolean {
  if (startLine > endLine || !lines[startLine]) return false;
  const rawBlockEnd = getContainingRawBlockEndLine(lines, startLine);
  return rawBlockEnd !== null && endLine <= rawBlockEnd;
}

function isLineInsideRawBlock(lines: LineInfo[], lineIndex: number): boolean {
  return getContainingRawBlockEndLine(lines, lineIndex) !== null;
}

function isIndentedCodeLineRange(lines: LineInfo[], startLine: number, endLine: number): boolean {
  let hasContent = false;
  for (let index = startLine; index <= endLine; index += 1) {
    const text = lines[index]?.text ?? "";
    if (!text.trim()) continue;
    hasContent = true;
    if (!isIndentedCodeLine(text)) return false;
  }
  return hasContent;
}

function isMarkdownListLineRange(lines: LineInfo[], startLine: number, endLine: number): boolean {
  for (let index = startLine; index >= 0; index -= 1) {
    const listEnd = findMarkdownListEndLine(lines, index);
    if (listEnd !== null && listEnd >= endLine) return true;
  }
  return false;
}

function unwrapRootMarkdownListItem(
  value: string,
  cursor: number,
  line: LineInfo,
  context: ListLineContext,
): { value: string; selectionStart: number; selectionEnd: number } {
  const marker = context.content.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/);
  if (!marker) return unchangedTextEdit(value, cursor);
  const start = line.start + context.prefix.length;
  const end = start + marker[0].length;
  const nextValue = value.slice(0, start) + value.slice(end);
  const nextCursor = cursor <= end ? start : cursor - marker[0].length;
  return { value: nextValue, selectionStart: nextCursor, selectionEnd: nextCursor };
}

interface TextReplacement {
  start: number;
  end: number;
  text: string;
}

function outdentMarkdownQuoteRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  lines: LineInfo[],
): { value: string; selectionStart: number; selectionEnd: number } | null {
  if (lines.length === 0) return null;
  const firstSelectedLine = getLineIndexAtOffset(value, selectionStart);
  const lastSelectedLine = getLineIndexAtOffset(value, Math.max(selectionStart, selectionEnd - 1));
  let firstQuoteLine = -1;
  let lastQuoteLine = -1;

  for (let index = firstSelectedLine; index <= lastSelectedLine; index += 1) {
    if (!getQuotePrefixInfo(lines[index]?.text ?? "")) continue;
    if (firstQuoteLine < 0) firstQuoteLine = index;
    lastQuoteLine = index;
  }
  if (firstQuoteLine < 0 || lastQuoteLine < 0) return null;

  const targetDepth = getQuotePrefixInfo(lines[firstQuoteLine].text)?.depth ?? 0;
  if (targetDepth === 0) return null;

  while (firstQuoteLine > 0) {
    const previous = getQuotePrefixInfo(lines[firstQuoteLine - 1].text);
    if (!previous || previous.depth < targetDepth || isBlankQuoteLine(lines[firstQuoteLine - 1].text, previous)) break;
    firstQuoteLine -= 1;
  }
  while (lastQuoteLine + 1 < lines.length) {
    const next = getQuotePrefixInfo(lines[lastQuoteLine + 1].text);
    if (!next || next.depth < targetDepth || isBlankQuoteLine(lines[lastQuoteLine + 1].text, next)) break;
    lastQuoteLine += 1;
  }

  let editStartLine = firstQuoteLine;
  let editEndLine = lastQuoteLine;
  if (hasQuoteBoundaryBefore(lines, firstQuoteLine, targetDepth)) editStartLine -= 1;
  if (hasQuoteBoundaryAfter(lines, lastQuoteLine, targetDepth)) editEndLine += 1;

  const replacements: TextReplacement[] = [];
  for (let index = editStartLine; index <= editEndLine; index += 1) {
    const line = lines[index];
    const quote = getQuotePrefixInfo(line?.text ?? "");
    if (!line || !quote || quote.depth < targetDepth) continue;
    const content = line.text.slice(quote.raw.length);
    const nextPrefix = quote.depth === 1
      ? quote.leading
      : quote.leading + "> ".repeat(quote.depth - 1);
    replacements.push({
      start: line.start,
      end: line.start + quote.raw.length,
      text: content ? nextPrefix : nextPrefix.trimEnd(),
    });
  }
  if (replacements.length === 0) return null;

  const nextSelectionStart = mapOffsetThroughReplacements(selectionStart, replacements);
  const nextSelectionEnd = mapOffsetThroughReplacements(selectionEnd, replacements);
  let nextValue = value;
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index];
    nextValue = nextValue.slice(0, replacement.start)
      + replacement.text
      + nextValue.slice(replacement.end);
  }
  return {
    value: nextValue,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  };
}

function isBlankQuoteLine(line: string, quote: QuotePrefixInfo): boolean {
  return !line.slice(quote.raw.length).trim();
}

function hasQuoteBoundaryBefore(lines: LineInfo[], lineIndex: number, depth: number): boolean {
  if (lineIndex < 2) return false;
  const boundary = getQuotePrefixInfo(lines[lineIndex - 1].text);
  const content = getQuotePrefixInfo(lines[lineIndex - 2].text);
  return Boolean(
    boundary
    && boundary.depth >= depth
    && isBlankQuoteLine(lines[lineIndex - 1].text, boundary)
    && content
    && content.depth >= depth
    && !isBlankQuoteLine(lines[lineIndex - 2].text, content),
  );
}

function hasQuoteBoundaryAfter(lines: LineInfo[], lineIndex: number, depth: number): boolean {
  if (lineIndex + 2 >= lines.length) return false;
  const boundary = getQuotePrefixInfo(lines[lineIndex + 1].text);
  const content = getQuotePrefixInfo(lines[lineIndex + 2].text);
  return Boolean(
    boundary
    && boundary.depth >= depth
    && isBlankQuoteLine(lines[lineIndex + 1].text, boundary)
    && content
    && content.depth >= depth
    && !isBlankQuoteLine(lines[lineIndex + 2].text, content),
  );
}

function mapOffsetThroughReplacements(offset: number, replacements: TextReplacement[]): number {
  let delta = 0;
  for (const replacement of replacements) {
    if (offset < replacement.start) break;
    if (offset <= replacement.end) {
      return replacement.start + delta + Math.min(replacement.text.length, offset - replacement.start);
    }
    delta += replacement.text.length - (replacement.end - replacement.start);
  }
  return offset + delta;
}

function insertTabAtCursor(
  value: string,
  cursor: number,
): { value: string; selectionStart: number; selectionEnd: number } {
  return {
    value: `${value.slice(0, cursor)}\t${value.slice(cursor)}`,
    selectionStart: cursor + 1,
    selectionEnd: cursor + 1,
  };
}

function indentLineRange(
  value: string,
  lineStart: number,
  normalizedLineEnd: number,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
  indentSize: number,
): { value: string; selectionStart: number; selectionEnd: number } {
  const normalizedIndentSize = normalizeLineIndentSize(indentSize);
  const firstLineIndex = getLineIndexAtOffset(value, lineStart);
  const before = value.slice(0, lineStart);
  const selected = value.slice(lineStart, normalizedLineEnd);
  const after = value.slice(normalizedLineEnd);
  const lines = selected.split("\n");
  const transforms: IndentLineTransform[] = [];

  const nextLines = lines.map((line) => {
    const changeColumn = getIndentChangeColumn(line);
    if (outdent) {
      const prefix = line.slice(0, changeColumn);
      const rest = line.slice(changeColumn);
      const nextRest = rest.startsWith("\t")
        ? rest.slice(1)
        : rest.slice(Math.min(rest.match(/^ */)?.[0].length ?? 0, normalizedIndentSize));
      const removed = rest.length - nextRest.length;
      const nextLine = `${prefix}${nextRest}`;
      transforms.push({
        oldLength: line.length,
        newLength: nextLine.length,
        changeColumn,
        removed,
        inserted: 0,
      });
      return nextLine;
    }

    const indent = " ".repeat(normalizedIndentSize);
    const nextLine = `${line.slice(0, changeColumn)}${indent}${line.slice(changeColumn)}`;
    transforms.push({
      oldLength: line.length,
      newLength: nextLine.length,
      changeColumn,
      removed: 0,
      inserted: normalizedIndentSize,
    });
    return nextLine;
  });

  const nextValue = `${before}${nextLines.join("\n")}${after}`;
  const nextSelectionStart = lineStart + mapIndentOffset(selectionStart - lineStart, transforms);
  const nextSelectionEnd = lineStart + mapIndentOffset(selectionEnd - lineStart, transforms);
  const renumberedValue = renumberOrderedListBlockAtLine(nextValue, firstLineIndex);

  return {
    value: renumberedValue,
    selectionStart: mapOffsetAfterRenumber(nextValue, renumberedValue, nextSelectionStart),
    selectionEnd: mapOffsetAfterRenumber(nextValue, renumberedValue, nextSelectionEnd),
  };
}

function normalizeLineIndentSize(value: number): number {
  return Number.isInteger(value) && value >= 2 && value <= 5 ? value : 2;
}

function normalizeCodeIndentSize(value: number): number {
  return Number.isInteger(value) && value >= 2 && value <= 5 ? value : 4;
}

function hasPreviousListSibling(
  lines: string[],
  lineIndex: number,
  currentContext: ListLineContext,
  currentIndentWidth: number,
): boolean {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const context = getListLineContext(lines[index] ?? "");
    if (!context.content.trim()) continue;

    if (context.key === currentContext.key) {
      const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
      if (marker && isListMarkerIndentAllowedAt(lines, index, currentContext.key, marker[1])) {
        const width = getIndentWidth(marker[1]);
        if (width === currentIndentWidth) return true;
        if (width < currentIndentWidth) return false;
        continue;
      }
    }

    const relativeContent = getContentRelativeToListQuote(lines[index] ?? "", currentContext);
    if (relativeContent && getIndentWidth(relativeContent.match(/^\s*/)?.[0] ?? "") > currentIndentWidth) {
      continue;
    }
    return false;
  }

  return false;
}

function findListSubtreeEndLine(
  lines: string[],
  lineIndex: number,
  currentContext: ListLineContext,
  currentIndentWidth: number,
): number {
  let end = lineIndex;
  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const context = getListLineContext(lines[index] ?? "");
    if (!context.content.trim()) continue;

    if (context.key === currentContext.key) {
      const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
      if (marker && isListMarkerIndentAllowedAt(lines, index, currentContext.key, marker[1])) {
        if (getIndentWidth(marker[1]) <= currentIndentWidth) break;
        end = index;
        continue;
      }
    }

    const relativeContent = getContentRelativeToListQuote(lines[index] ?? "", currentContext);
    if (relativeContent && getIndentWidth(relativeContent.match(/^\s*/)?.[0] ?? "") > currentIndentWidth) {
      end = index;
      continue;
    }
    break;
  }

  return end;
}

function getContentRelativeToListQuote(line: string, currentContext: ListLineContext): string | null {
  if (currentContext.key === "plain") return line;
  if (line.startsWith(currentContext.prefix)) return line.slice(currentContext.prefix.length);
  const context = getListLineContext(line);
  return context.key === currentContext.key ? context.content : null;
}

function getRemovableIndentBeforeCursor(value: string, cursor: number, indentSize: number): number {
  if (cursor <= 0) return 0;
  if (value[cursor - 1] === "\t") return 1;

  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  let removable = 0;
  for (let index = cursor - 1; index >= lineStart && removable < indentSize; index -= 1) {
    if (value[index] !== " ") break;
    removable += 1;
  }
  return removable;
}

function unchangedTextEdit(
  value: string,
  cursor: number,
): { value: string; selectionStart: number; selectionEnd: number } {
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

interface OrderedListFrame {
  width: number;
  delimiter: string;
  next: string;
}

interface IndentLineTransform {
  oldLength: number;
  newLength: number;
  changeColumn: number;
  removed: number;
  inserted: number;
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

function getIndentChangeColumn(line: string): number {
  return getQuotePrefixInfo(line)?.raw.length ?? 0;
}

function mapIndentOffset(offset: number, transforms: IndentLineTransform[]): number {
  const oldLength = getTransformedSelectionLength(transforms, "oldLength");
  const newLength = getTransformedSelectionLength(transforms, "newLength");
  if (offset > oldLength) return offset + (newLength - oldLength);

  let oldLineStart = 0;
  let newLineStart = 0;
  for (let index = 0; index < transforms.length; index += 1) {
    const transform = transforms[index];
    const oldLineEnd = oldLineStart + transform.oldLength;
    if (offset <= oldLineEnd || index === transforms.length - 1) {
      const column = Math.max(0, Math.min(transform.oldLength, offset - oldLineStart));
      return newLineStart + mapIndentColumn(column, transform);
    }
    oldLineStart = oldLineEnd + 1;
    newLineStart += transform.newLength + 1;
  }

  return Math.max(0, offset + (newLength - oldLength));
}

function getTransformedSelectionLength(
  transforms: IndentLineTransform[],
  key: "oldLength" | "newLength",
): number {
  return transforms.reduce((length, transform, index) => (
    length + transform[key] + (index > 0 ? 1 : 0)
  ), 0);
}

function mapIndentColumn(column: number, transform: IndentLineTransform): number {
  const { changeColumn, removed, inserted } = transform;
  if (removed > 0) {
    if (column <= changeColumn) return column;
    if (column <= changeColumn + removed) return changeColumn;
    return column - removed;
  }
  return column + (column >= changeColumn ? inserted : 0);
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

function mapOffsetAfterRenumber(before: string, after: string, offset: number): number {
  if (before === after) return offset;

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const position = getLineColumnAtOffset(beforeLines, offset);
  const beforeLine = beforeLines[position.line] ?? "";
  const afterLine = afterLines[position.line] ?? "";
  let column = position.column;
  const beforeMarker = getOrderedMarkerLength(beforeLine);
  const afterMarker = getOrderedMarkerLength(afterLine);
  if (beforeMarker !== null && afterMarker !== null && column >= beforeMarker) {
    column += afterMarker - beforeMarker;
  }

  return getLineStartOffset(afterLines, position.line) + Math.min(column, afterLine.length);
}

function getOrderedMarkerLength(line: string): number | null {
  const context = getListLineContext(line);
  const marker = context.content.match(/^(\s*)(\d+)([.)])(\s+)/);
  return marker ? context.prefix.length + marker[0].length : null;
}

function getLineColumnAtOffset(lines: string[], offset: number): { line: number; column: number } {
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = cursor + lines[index].length;
    if (offset <= lineEnd || index === lines.length - 1) {
      return { line: index, column: Math.max(0, offset - cursor) };
    }
    cursor = lineEnd + 1;
  }
  return { line: Math.max(0, lines.length - 1), column: 0 };
}

function getLineStartOffset(lines: string[], lineIndex: number): number {
  return lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0);
}

function getLineIndexAtOffset(value: string, offset: number): number {
  return value.slice(0, offset).split("\n").length - 1;
}

function getIndentWidth(value: string): number {
  return getMarkdownIndentWidth(value);
}

function collectLines(markdown: string): LineInfo[] {
  const lines: LineInfo[] = [];
  const matcher = /.*(?:\r?\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(markdown)) && match[0] !== "") {
    lines.push({
      text: match[0].replace(/\r?\n$/, ""),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return lines;
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

export function getLeadingMarkdownIndent(value: string): string {
  return value.match(/^[ \t]*/)?.[0] ?? "";
}

export function isMarkdownCodeIndented(value: string, startColumn = 0): boolean {
  const indent = getLeadingMarkdownIndent(value);
  return getMarkdownColumnAfter(indent, startColumn) - startColumn >= 4;
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



export interface DollarMathBlockOpening {
  indent: string;
  tag: string | null;
}

export function readDollarMathBlockOpening(
  line: string,
  maximumIndentLength: number | null = 3,
  startColumn = 0,
): DollarMathBlockOpening | null {
  const match = line.match(/^([ \t]*)\$\$[ \t]*(?:\{([^\r\n]+)\})?$/);
  if (
    !match
    || (
      maximumIndentLength !== null
      && getMarkdownColumnAfter(match[1], startColumn) - startColumn > maximumIndentLength
    )
  ) {
    return null;
  }
  return { indent: match[1], tag: match[2] ?? null };
}

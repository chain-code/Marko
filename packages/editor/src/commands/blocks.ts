// 块命令（B-1～B-14、D-4）：正文、标题级别、引用、列表、任务、代码块、公式块、分隔线、目录、Callout、脚注、
// 定义列表、图表模板，以及代码围栏的默认语言（B-6）。
// 代码移植自旧版 src/utils/editorCommands.ts 及其辅助模块（test/behavior/B.md 的基准，逐字节一致）；
// 旧版用整篇扫描判断一行在不在代码块里，这里换成文档树给的范围（inlineLayout.ts）
/* eslint-disable */
import { insideFencedBlock } from "./inlineLayout.ts";
import { DEFAULT_TEXTS, type EditorTexts } from "../texts.ts";

function isInsideMarkdownRawBlock(_value: string, lineStart: number): boolean {
  return insideFencedBlock(lineStart);
}

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface TextEditResult extends TextState {}

export interface LineRange {
  value: string;
  start: number;
  end: number;
  lineStart: number;
  normalizedEnd: number;
}

interface SetextHeadingRange {
  headingStart: number;
  headingEnd: number;
  underlineStart: number;
  underlineEnd: number;
  title: string;
  titleStart: number;
  quotePrefix: string;
}

interface LineTransform {
  oldLength: number;
  newLength: number;
  oldContentStart: number;
  newContentStart: number;
  contentLength: number;
}

interface SetextLineContext {
  content: string;
  quotePrefix: string;
  rawQuoteLength: number;
}

interface DefinitionListMarkerLine {
  quotePrefix: string;
  indent: string;
  content: string;
  markerEnd: number;
}

type MarkdownCalloutKind = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";

const markdownCalloutKinds = new Set<MarkdownCalloutKind>([
  "NOTE",
  "TIP",
  "IMPORTANT",
  "WARNING",
  "CAUTION",
]);

const mermaidTemplateSource = (texts: EditorTexts) => `flowchart LR\n  A[${texts.diagramStart}] --> B[${texts.diagramEnd}]`;

const flowchartTemplateSource = (texts: EditorTexts) => `st=>start: ${texts.diagramStart}\ne=>end: ${texts.diagramEnd}\nst->e`;

const sequenceTemplateSource = [
  "Alice->Bob: Hello Bob, how are you?",
  "Note right of Bob: Bob thinks",
  "Bob-->Alice: I am good thanks!",
].join("\n");

export function normalizeSelection(state: TextState): TextState {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd));
  const selectionEnd = Math.max(0, Math.max(state.selectionStart, state.selectionEnd));
  return {
    value: state.value,
    selectionStart,
    selectionEnd,
  };
}

export function insertMarkdownAtSelection(state: TextState, text: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const normalizedText = normalizeGeneratedLineBreaks(text, getPreferredLineBreak(normalized.value));
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${normalizedText}${normalized.value.slice(normalized.selectionEnd)}`;
  const cursor = normalized.selectionStart + normalizedText.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function formatMarkdownCodeBlock(
  state: TextState,
  language = "",
  placeholder = "",
): TextEditResult {
  const normalized = normalizeSelection(state);
  const unwrapped = unwrapRawFenceBlock(normalized, "code");
  if (unwrapped) return unwrapped;

  const lineBreak = getPreferredLineBreak(normalized.value);
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd) || placeholder;
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const leadingBreak = before && !before.endsWith("\n") ? lineBreak : "";
  const closingBreak = !after || !startsWithLineBreak(after) ? lineBreak : "";
  const fence = getCodeFenceMarker(selected);
  const prefix = `${leadingBreak}${fence}${language}${lineBreak}`;
  const suffix = `${lineBreak}${fence}${closingBreak}`;
  const value = `${before}${prefix}${selected}${suffix}${after}`;
  const selectionStart = before.length + prefix.length;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

export function applyDefaultCodeLanguageOnFenceKey(
  state: TextState,
  key: string,
  language: string,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (
    normalized.selectionStart !== normalized.selectionEnd
    || (key !== "`" && key !== "~")
  ) {
    return null;
  }

  const info = normalizeCodeFenceInfoString(language, "```");
  if (!info) return null;

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  if (isInsideMarkdownRawBlock(normalized.value, lineStart)) return null;
  const beforeCursor = normalized.value.slice(lineStart, normalized.selectionStart);
  if (!beforeCursor.endsWith(key.repeat(2))) return null;
  const lines = normalized.value.split("\n");
  const lineIndex = findLineIndex(lines, lineStart);
  lines[lineIndex] = beforeCursor + key;
  const opening = getRawFenceOpeningAtLine(lines, lineIndex);
  if (
    !opening
    || opening.fence.kind !== "code"
    || opening.fence.marker[0] !== key
    || opening.fence.marker.length !== 3
  ) return null;

  const physicalLineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const lineEnd = physicalLineEnd < 0 ? normalized.value.length : physicalLineEnd;
  const contentEnd = normalized.value[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
  const afterCursor = normalized.value.slice(normalized.selectionStart, contentEnd);
  if (afterCursor) return null;

  const insertion = `${key}${info}`;
  const value = [
    normalized.value.slice(0, normalized.selectionStart),
    insertion,
    normalized.value.slice(normalized.selectionStart),
  ].join("");
  const selectionStart = normalized.selectionStart + 1;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + info.length,
  };
}

export function insertMarkdownDiagramTemplate(
  state: TextState,
  language: "mermaid" | "flowchart" | "sequence",
  texts: EditorTexts = DEFAULT_TEXTS,
): TextEditResult {
  const lineBreak = getPreferredLineBreak(state.value);
  const source = normalizeGeneratedLineBreaks(
    language === "mermaid"
      ? mermaidTemplateSource(texts)
      : language === "flowchart"
        ? flowchartTemplateSource(texts)
        : sequenceTemplateSource,
    lineBreak,
  );
  return formatMarkdownCodeBlock(state, language, source);
}

export function formatMarkdownMathBlock(
  state: TextState,
  placeholder = "a^2 + b^2 = c^2",
): TextEditResult {
  const normalized = normalizeSelection(state);
  const unwrapped = unwrapRawFenceBlock(normalized, "math");
  if (unwrapped) return unwrapped;

  const lineBreak = getPreferredLineBreak(normalized.value);
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd) || placeholder;
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const leadingBreak = before && !before.endsWith("\n") ? lineBreak : "";
  const closingBreak = !after || !startsWithLineBreak(after) ? lineBreak : "";
  const prefix = `${leadingBreak}$$${lineBreak}`;
  const suffix = `${lineBreak}$$${closingBreak}`;
  const value = `${before}${prefix}${selected}${suffix}${after}`;
  const selectionStart = before.length + prefix.length;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

function unwrapRawFenceBlock(state: TextState, kind: "code" | "math"): TextEditResult | null {
  const range = findClosedRawFenceBlock(state.value, state.selectionStart, state.selectionEnd, kind);
  if (!range) return null;

  let value = "";
  let cursor = 0;
  for (const edit of range.unwrapEdits) {
    value += state.value.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  value += state.value.slice(cursor);
  return {
    value,
    selectionStart: mapOffsetAfterRawFenceUnwrap(state.selectionStart, range.unwrapEdits),
    selectionEnd: mapOffsetAfterRawFenceUnwrap(state.selectionEnd, range.unwrapEdits),
  };
}

function mapOffsetAfterRawFenceUnwrap(
  offset: number,
  edits: RawFenceUnwrapEdit[],
): number {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.start) return offset + delta;
    if (offset <= edit.end) return edit.start + delta + edit.text.length;
    delta += edit.text.length - (edit.end - edit.start);
  }
  return offset + delta;
}

export function prefixMarkdownLines(state: TextState, prefix: string): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  const lines = selected.split("\n");
  const nextSelected = lines
    .map((line) => (line.trim() ? `${prefix}${line}` : line))
    .join("\n");
  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.start + prefix.length,
    selectionEnd: range.end + (nextSelected.length - selected.length),
  };
}

export function prefixNumberedMarkdownLines(state: TextState): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  let orderedIndex = 1;
  const nextSelected = selected
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      const numbered = `${orderedIndex}. ${line}`;
      orderedIndex += 1;
      return numbered;
    })
    .join("\n");
  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.start + 3,
    selectionEnd: range.end + (nextSelected.length - selected.length),
  };
}

export type MarkdownLineFormat = "blockquote" | "bullet" | "ordered" | "task" | "definition";

export function formatMarkdownLines(state: TextState, format: MarkdownLineFormat): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  const lines = selected.split("\n");
  const contentLines = lines.filter((line) => line.trim());
  const shouldRemove = contentLines.length > 0 && contentLines.every((line) => hasLineFormat(line, format));
  const shouldFormatBlankLine = lines.length === 1 && isBlankLineFormattingTarget(lines[0] ?? "");
  let orderedIndex = 1;
  const transforms: LineTransform[] = [];

  const nextSelected = lines
    .map((line) => {
      if (!line.trim() && !shouldFormatBlankLine) {
        transforms.push(createLineTransform(line.length, line.length, 0, 0, 0));
        return line;
      }
      if (format === "blockquote") {
        const result = formatBlockquoteLine(line, shouldRemove, shouldFormatBlankLine);
        transforms.push(result.transform);
        return result.line;
      }

      const stripped = stripLineForListFormatting(line);
      if (shouldRemove) {
        const nextLine = `${stripped.indent}${stripped.content}`;
        transforms.push(createLineTransform(
          line.length,
          nextLine.length,
          stripped.contentStart,
          stripped.indent.length,
          stripped.content.length,
        ));
        return nextLine;
      }

      switch (format) {
        case "bullet": {
          const marker = "- ";
          const nextLine = `${stripped.indent}${marker}${stripped.content}`;
          transforms.push(createLineTransform(
            line.length,
            nextLine.length,
            stripped.contentStart,
            stripped.indent.length + marker.length,
            stripped.content.length,
          ));
          return nextLine;
        }
        case "ordered": {
          const marker = `${orderedIndex}. `;
          const next = `${stripped.indent}${marker}${stripped.content}`;
          transforms.push(createLineTransform(
            line.length,
            next.length,
            stripped.contentStart,
            stripped.indent.length + marker.length,
            stripped.content.length,
          ));
          orderedIndex += 1;
          return next;
        }
        case "task": {
          const marker = `- [${stripped.taskChecked ? "x" : " "}] `;
          const nextLine = `${stripped.indent}${marker}${stripped.content}`;
          transforms.push(createLineTransform(
            line.length,
            nextLine.length,
            stripped.contentStart,
            stripped.indent.length + marker.length,
            stripped.content.length,
          ));
          return nextLine;
        }
        case "definition": {
          const marker = ": ";
          const nextLine = `${stripped.indent}${marker}${stripped.content}`;
          transforms.push(createLineTransform(
            line.length,
            nextLine.length,
            stripped.contentStart,
            stripped.indent.length + marker.length,
            stripped.content.length,
          ));
          return nextLine;
        }
        default:
          transforms.push(createLineTransform(line.length, line.length, 0, 0, line.length));
          return line;
      }
    })
    .join("\n");

  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + mapTransformedLineOffset(range.start - range.lineStart, transforms),
    selectionEnd: range.lineStart + mapTransformedLineOffset(range.end - range.lineStart, transforms),
  };
}

function formatBlockquoteLine(
  line: string,
  shouldRemove: boolean,
  formatBlankLine: boolean,
): { line: string; transform: LineTransform } {
  if (shouldRemove) {
    const leading = line.match(/^\s*/)?.[0] ?? "";
    const quote = line.slice(leading.length).match(/^>\s?/)?.[0] ?? "";
    const nextLine = removeSingleBlockquoteMarker(line);
    return {
      line: nextLine,
      transform: createLineTransform(
        line.length,
        nextLine.length,
        leading.length + quote.length,
        leading.length,
        Math.max(0, line.length - leading.length - quote.length),
      ),
    };
  }

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const nextLine = addBlockquoteMarker(line);
  const markerLength = formatBlankLine && !line.trim() ? nextLine.length - indent.length : 2;
  return {
    line: nextLine,
    transform: createLineTransform(
      line.length,
      nextLine.length,
      indent.length,
      indent.length + markerLength,
      Math.max(0, line.length - indent.length),
    ),
  };
}

export function setHeadingLevel(state: TextState, level: 1 | 2 | 3 | 4 | 5 | 6): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const setext = findSetextHeadingRange(range.value, range.lineStart, range.normalizedEnd);
  if (setext) {
    const prefix = `${"#".repeat(level)} `;
    const replacement = `${setext.quotePrefix}${prefix}${setext.title}`;
    const value = `${range.value.slice(0, setext.headingStart)}${replacement}${sliceAfterRemovedLinePreservingBreak(range.value, setext.underlineEnd)}`;
    const cursor = setext.headingStart + setext.quotePrefix.length + prefix.length;
    return {
      value,
      selectionStart: cursor,
      selectionEnd: cursor + setext.title.length,
    };
  }

  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  const prefix = `${"#".repeat(level)} `;
  const lines = selected.split("\n");
  const shouldFormatBlankLine = lines.length === 1 && isBlankHeadingTarget(lines[0] ?? "");
  const transforms: LineTransform[] = [];
  const nextSelected = lines
    .map((line) => {
      const result = formatHeadingLine(line, prefix, shouldFormatBlankLine);
      transforms.push(result.transform);
      return result.line;
    })
    .join("\n");
  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + mapTransformedLineOffset(range.start - range.lineStart, transforms),
    selectionEnd: range.lineStart + mapTransformedLineOffset(range.end - range.lineStart, transforms),
  };
}

export function adjustHeadingLevel(state: TextState, direction: "increase" | "decrease"): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const level = getHeadingLevelAtRange(range.value, range.lineStart, range.normalizedEnd);
  if (direction === "increase") {
    const nextLevel = (level === 0 ? 6 : Math.max(1, level - 1)) as 1 | 2 | 3 | 4 | 5 | 6;
    return setHeadingLevel(state, nextLevel);
  }

  if (level === 0) {
    return normalizeSelection(state);
  }
  if (level === 1) {
    return setParagraphText(state);
  }
  const nextLevel = Math.min(6, level + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  return setHeadingLevel(state, nextLevel);
}

function getHeadingLevelAtRange(value: string, lineStart: number, lineEnd: number): number {
  const setext = findSetextHeadingRange(value, lineStart, lineEnd);
  if (setext) {
    const underline = value.slice(setext.underlineStart, setext.underlineEnd);
    const content = getSetextLineContext(underline).content.trim();
    return content.startsWith("=") ? 1 : 2;
  }

  const line = value.slice(lineStart, lineEnd);
  const context = getSetextLineContext(line);
  const match = context.content.match(/^\s{0,3}(#{1,6})\s+/);
  return match ? match[1].length : 0;
}

function formatHeadingLine(line: string, prefix: string, formatBlankLine = false): { line: string; transform: LineTransform } {
  const { body: lineBody, ending } = splitCarriageReturnEnding(line);
  const quote = parseQuotePrefix(lineBody);
  if (quote) {
    const rest = lineBody.slice(quote.rawLength);
    const innerIndent = rest.match(/^\s*/)?.[0] ?? "";
    const contentStart = quote.rawLength + innerIndent.length;
    const rawContent = rest.slice(innerIndent.length);
    const heading = rawContent.match(/^#{1,6}\s+(.+)$/);
    const content = heading ? stripAtxClosingMarker(heading[1]) : rawContent;
    if (!content.trim()) {
      if (formatBlankLine) {
        const nextLine = `${quote.normalized}${prefix}${ending}`;
        return {
          line: nextLine,
          transform: createLineTransform(line.length, nextLine.length, quote.rawLength, nextLine.length, 0),
        };
      }
      const nextLine = `${quote.normalized}${ending}`;
      return {
        line: nextLine,
        transform: createLineTransform(line.length, nextLine.length, quote.rawLength, nextLine.length, 0),
      };
    }

    const oldContentStart = heading
      ? contentStart + (heading[0].length - heading[1].length)
      : contentStart;
    const nextLine = `${quote.normalized}${prefix}${content}${ending}`;
    return {
      line: nextLine,
      transform: createLineTransform(
        line.length,
        nextLine.length,
        oldContentStart,
        quote.normalized.length + prefix.length,
        content.length + ending.length,
      ),
    };
  }

  const heading = lineBody.match(/^\s{0,3}#{1,6}\s+(.+)$/);
  const content = heading ? stripAtxClosingMarker(heading[1]) : lineBody.trimStart();
  if (!content.trim()) {
    if (formatBlankLine) {
      const nextLine = `${prefix}${ending}`;
      return {
        line: nextLine,
        transform: createLineTransform(line.length, nextLine.length, 0, nextLine.length, 0),
      };
    }
    const nextLine = `${content}${ending}`;
    return {
      line: nextLine,
      transform: createLineTransform(line.length, nextLine.length, 0, 0, nextLine.length),
    };
  }

  const oldContentStart = heading
    ? lineBody.indexOf(heading[1])
    : lineBody.length - lineBody.trimStart().length;
  const nextLine = `${prefix}${content}${ending}`;
  return {
    line: nextLine,
    transform: createLineTransform(line.length, nextLine.length, oldContentStart, prefix.length, content.length + ending.length),
  };
}

function createLineTransform(
  oldLength: number,
  newLength: number,
  oldContentStart: number,
  newContentStart: number,
  contentLength: number,
): LineTransform {
  return { oldLength, newLength, oldContentStart, newContentStart, contentLength };
}

function mapTransformedLineOffset(offset: number, transforms: LineTransform[]): number {
  const oldLength = getLineTransformsLength(transforms, "oldLength");
  const newLength = getLineTransformsLength(transforms, "newLength");
  if (offset > oldLength) return offset + (newLength - oldLength);

  let oldLineStart = 0;
  let newLineStart = 0;
  for (let index = 0; index < transforms.length; index += 1) {
    const transform = transforms[index];
    const oldLineEnd = oldLineStart + transform.oldLength;
    if (offset <= oldLineEnd || index === transforms.length - 1) {
      const column = Math.max(0, Math.min(transform.oldLength, offset - oldLineStart));
      return newLineStart + mapTransformedLineColumn(column, transform);
    }
    oldLineStart = oldLineEnd + 1;
    newLineStart += transform.newLength + 1;
  }

  return Math.max(0, offset + (newLength - oldLength));
}

function getLineTransformsLength(transforms: LineTransform[], key: "oldLength" | "newLength"): number {
  return transforms.reduce((length, transform, index) => (
    length + transform[key] + (index > 0 ? 1 : 0)
  ), 0);
}

function mapTransformedLineColumn(column: number, transform: LineTransform): number {
  if (column <= transform.oldContentStart) return transform.newContentStart;
  const contentColumn = Math.min(transform.contentLength, column - transform.oldContentStart);
  return transform.newContentStart + contentColumn;
}

export function setParagraphText(state: TextState): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const setext = findSetextHeadingRange(range.value, range.lineStart, range.normalizedEnd);
  if (setext) {
    const value = `${range.value.slice(0, setext.headingStart)}${setext.title}${sliceAfterRemovedLinePreservingBreak(range.value, setext.underlineEnd)}`;
    const cursor = setext.headingStart + Math.min(setext.title.length, Math.max(0, range.start - setext.titleStart));
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  const transforms: LineTransform[] = [];
  const nextSelected = selected
    .split("\n")
    .map((line) => {
      const stripped = stripBlockMarkers(line);
      const nextLine = `${stripped.indent}${stripped.content}`;
      transforms.push(createLineTransform(
        line.length,
        nextLine.length,
        stripped.contentStart,
        stripped.indent.length,
        stripped.content.length,
      ));
      return nextLine;
    })
    .join("\n");
  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + mapTransformedLineOffset(range.start - range.lineStart, transforms),
    selectionEnd: range.lineStart + mapTransformedLineOffset(range.end - range.lineStart, transforms),
  };
}

export function toggleTaskAtSelection(state: TextState): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const line = range.value.slice(range.lineStart, range.normalizedEnd);
  if (line.includes("\n")) {
    const transforms: LineTransform[] = [];
    const nextLine = line
      .split("\n")
      .map((part) => {
        if (!part.trim()) {
          transforms.push(createLineTransform(part.length, part.length, 0, 0, part.length));
          return part;
        }
        const toggled = toggleTaskMarkerInLine(part);
        if (toggled) {
          transforms.push(createLineTransform(part.length, toggled.length, 0, 0, part.length));
          return toggled;
        }
        const added = addTaskMarkerToLineWithTransform(part);
        transforms.push(added.transform);
        return added.line;
      })
      .join("\n");
    const value = `${range.value.slice(0, range.lineStart)}${nextLine}${range.value.slice(range.normalizedEnd)}`;
    const coversWholeLineRange = range.start === range.lineStart && range.end === range.normalizedEnd;
    if (coversWholeLineRange) {
      return {
        value,
        selectionStart: range.lineStart,
        selectionEnd: range.lineStart + nextLine.length,
      };
    }
    return {
      value,
      selectionStart: range.lineStart + mapTransformedLineOffset(range.start - range.lineStart, transforms),
      selectionEnd: range.lineStart + mapTransformedLineOffset(range.end - range.lineStart, transforms),
    };
  }

  const nextLine = toggleTaskMarkerInLine(line);
  if (nextLine) {
    const value = `${range.value.slice(0, range.lineStart)}${nextLine}${range.value.slice(range.normalizedEnd)}`;
    return { value, selectionStart: range.start, selectionEnd: range.end };
  }

  const added = addTaskMarkerToLineWithTransform(line);
  const value = `${range.value.slice(0, range.lineStart)}${added.line}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + mapTransformedLineColumn(range.start - range.lineStart, added.transform),
    selectionEnd: range.lineStart + mapTransformedLineColumn(range.end - range.lineStart, added.transform),
  };
}

/**
 * 「段落 → 任务状态 → 标记为已完成、未完成」（B-5，同 Typora）：选区所在各行里的任务项，方括号里改成 `x` 或空格；
 * 已经是这个状态的不动，不是任务项的行不动。一项都没改时返回 null
 */
export function setTaskStateAtSelection(state: TextState, done: boolean): TextEditResult | null {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  let changed = false;
  const lines = range.value
    .slice(range.lineStart, range.normalizedEnd)
    .split("\n")
    .map((line) => {
      const { body, ending } = splitCarriageReturnEnding(line);
      const task = body.match(/^((?:\s*>[ \t]?)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](.*)$/);
      if (!task || (task[2] !== " ") === done) return line;
      changed = true;
      return `${task[1]}[${done ? "x" : " "}]${task[3]}${ending}`;
    });
  if (!changed) return null;
  // 只换了方括号里的一个字，长度不变，选区照旧
  const value = `${range.value.slice(0, range.lineStart)}${lines.join("\n")}${range.value.slice(range.normalizedEnd)}`;
  return { value, selectionStart: state.selectionStart, selectionEnd: state.selectionEnd };
}

function toggleTaskMarkerInLine(line: string): string | null {
  const { body, ending } = splitCarriageReturnEnding(line);
  const task = body.match(/^((?:\s*>[ \t]?)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](.*)$/);
  if (!task) return null;

  const checked = task[2].toLowerCase() === "x";
  return `${task[1]}[${checked ? " " : "x"}]${task[3]}${ending}`;
}

function addTaskMarkerToLineWithTransform(line: string): { line: string; transform: LineTransform } {
  const { body, ending } = splitCarriageReturnEnding(line);
  const quote = parseQuotePrefix(body);
  if (quote) {
    const rest = body.slice(quote.rawLength);
    const list = rest.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/);
    if (list) {
      const nextLine = `${quote.normalized}${list[1]}${list[2]} [ ] ${list[4]}${ending}`;
      return {
        line: nextLine,
        transform: createLineTransform(
          line.length,
          nextLine.length,
          quote.rawLength + list[1].length + list[2].length + list[3].length,
          quote.normalized.length + list[1].length + list[2].length + " [ ] ".length,
          list[4].length + ending.length,
        ),
      };
    }
    const indent = rest.match(/^\s*/)?.[0] ?? "";
    const content = rest.slice(indent.length);
    const nextLine = `${quote.normalized}${indent}- [ ] ${content}${ending}`;
    return {
      line: nextLine,
      transform: createLineTransform(
        line.length,
        nextLine.length,
        quote.rawLength + indent.length,
        quote.normalized.length + indent.length + "- [ ] ".length,
        content.length + ending.length,
      ),
    };
  }

  const list = body.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/);
  if (list) {
    const nextLine = `${list[1]}${list[2]} [ ] ${list[4]}${ending}`;
    return {
      line: nextLine,
      transform: createLineTransform(
        line.length,
        nextLine.length,
        list[1].length + list[2].length + list[3].length,
        list[1].length + list[2].length + " [ ] ".length,
        list[4].length + ending.length,
      ),
    };
  }

  const indent = body.match(/^\s*/)?.[0] ?? "";
  const content = body.slice(indent.length);
  const nextLine = `${indent}- [ ] ${content}${ending}`;
  return {
    line: nextLine,
    transform: createLineTransform(
      line.length,
      nextLine.length,
      indent.length,
      indent.length + "- [ ] ".length,
      content.length + ending.length,
    ),
  };
}

export function insertMarkdownCalloutTemplate(state: TextState, kind?: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const calloutKind = normalizeMarkdownCalloutKind(kind);
  const chunks = collectLineChunks(normalized.value);
  const selectedLines = getSelectedLineIndexes(
    chunks,
    normalized.selectionStart,
    normalized.selectionEnd,
  );
  const existing = findMarkdownCalloutBlock(chunks, selectedLines.start, selectedLines.end);

  if (existing) {
    return existing.kind === calloutKind
      ? unwrapMarkdownCallout(normalized, chunks, existing)
      : replaceMarkdownCalloutKind(normalized, chunks, existing, calloutKind);
  }

  return wrapMarkdownLinesAsCallout(normalized, chunks, selectedLines, calloutKind);
}

function normalizeMarkdownCalloutKind(kind?: string): MarkdownCalloutKind {
  const normalized = kind?.trim().toUpperCase() as MarkdownCalloutKind | undefined;
  return normalized && markdownCalloutKinds.has(normalized) ? normalized : "NOTE";
}

interface MarkdownCalloutHeader {
  kind: MarkdownCalloutKind;
  kindStart: number;
  kindEnd: number;
  quoteDepth: number;
  quotePrefix: string;
}

interface MarkdownCalloutBlock extends MarkdownCalloutHeader {
  headerIndex: number;
  endIndex: number;
}

interface TextRemoval {
  start: number;
  end: number;
}

interface TextInsertion {
  offset: number;
  text: string;
  priority: number;
}

function findMarkdownCalloutBlock(
  chunks: string[],
  selectionStartLine: number,
  selectionEndLine: number,
): MarkdownCalloutBlock | null {
  for (let headerIndex = selectionStartLine; headerIndex >= 0; headerIndex -= 1) {
    const header = parseMarkdownCalloutHeader(chunks[headerIndex] ?? "");
    if (!header) continue;
    const endIndex = findMarkdownCalloutEnd(chunks, headerIndex, header.quoteDepth);
    if (selectionStartLine >= headerIndex && selectionEndLine <= endIndex) {
      return { ...header, headerIndex, endIndex };
    }
  }
  return null;
}

function parseMarkdownCalloutHeader(chunk: string): MarkdownCalloutHeader | null {
  const body = stripLineBreak(chunk);
  const quote = parseQuotePrefix(body);
  if (!quote) return null;
  const content = body.slice(quote.rawLength);
  const match = content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i);
  if (!match || match.index === undefined) return null;
  const markerStart = quote.rawLength + match.index;
  const kindStart = markerStart + match[0].indexOf(match[1]);
  return {
    kind: match[1].toUpperCase() as MarkdownCalloutKind,
    kindStart,
    kindEnd: kindStart + match[1].length,
    quoteDepth: countMarkdownQuoteDepth(body),
    quotePrefix: body.slice(0, quote.rawLength),
  };
}

function findMarkdownCalloutEnd(chunks: string[], headerIndex: number, quoteDepth: number): number {
  let endIndex = headerIndex;
  for (let index = headerIndex + 1; index < chunks.length; index += 1) {
    const body = stripLineBreak(chunks[index] ?? "");
    if (countMarkdownQuoteDepth(body) < quoteDepth) break;
    const nextHeader = parseMarkdownCalloutHeader(chunks[index] ?? "");
    if (nextHeader && nextHeader.quoteDepth === quoteDepth) break;
    endIndex = index;
  }
  return endIndex;
}

function replaceMarkdownCalloutKind(
  state: TextState,
  chunks: string[],
  block: MarkdownCalloutBlock,
  kind: MarkdownCalloutKind,
): TextEditResult {
  const headerStart = getChunkStartOffset(chunks, block.headerIndex);
  const kindStart = headerStart + block.kindStart;
  const kindEnd = headerStart + block.kindEnd;
  const value = `${state.value.slice(0, kindStart)}${kind}${state.value.slice(kindEnd)}`;
  return {
    value,
    selectionStart: mapOffsetAfterTextReplacement(state.selectionStart, kindStart, kindEnd, kind.length),
    selectionEnd: mapOffsetAfterTextReplacement(state.selectionEnd, kindStart, kindEnd, kind.length),
  };
}

function unwrapMarkdownCallout(
  state: TextState,
  chunks: string[],
  block: MarkdownCalloutBlock,
): TextEditResult {
  const removals: TextRemoval[] = [];
  const headerStart = getChunkStartOffset(chunks, block.headerIndex);
  removals.push({ start: headerStart, end: getChunkEndOffset(chunks, block.headerIndex) });

  for (let index = block.headerIndex + 1; index <= block.endIndex; index += 1) {
    const chunkStart = getChunkStartOffset(chunks, index);
    const quoteMarker = getMarkdownQuoteMarkerRange(stripLineBreak(chunks[index] ?? ""), block.quoteDepth);
    if (quoteMarker) {
      removals.push({
        start: chunkStart + quoteMarker.start,
        end: chunkStart + quoteMarker.end,
      });
    }
  }

  return applyTextRemovals(state, removals);
}

function wrapMarkdownLinesAsCallout(
  state: TextState,
  chunks: string[],
  selectedLines: { start: number; end: number },
  kind: MarkdownCalloutKind,
): TextEditResult {
  const selectedBodies = chunks
    .slice(selectedLines.start, selectedLines.end + 1)
    .map(stripLineBreak);
  const nonBlankBodies = selectedBodies.filter((line) => line.trim());
  const allQuoted = nonBlankBodies.length > 0
    && nonBlankBodies.every((line) => Boolean(parseQuotePrefix(line)));
  const firstBody = selectedBodies[0] ?? "";
  const firstQuotedBody = allQuoted
    ? nonBlankBodies.find((line) => Boolean(parseQuotePrefix(line))) ?? ""
    : "";
  const firstQuote = firstQuotedBody ? parseQuotePrefix(firstQuotedBody) : null;
  const leading = firstBody.match(/^[ \t]*/)?.[0] ?? "";
  const headerPrefix = firstQuote
    ? firstQuotedBody.slice(0, firstQuote.rawLength)
    : `${leading}> `;
  const lineBreak = getPreferredLineBreak(state.value);
  const rangeStart = getChunkStartOffset(chunks, selectedLines.start);
  const insertions: TextInsertion[] = [{
    offset: rangeStart,
    text: `${headerPrefix}[!${kind}]${lineBreak}`,
    priority: 0,
  }];

  if (allQuoted) {
    for (let index = selectedLines.start; index <= selectedLines.end; index += 1) {
      const body = stripLineBreak(chunks[index] ?? "");
      if (!body.trim()) {
        insertions.push({
          offset: getChunkStartOffset(chunks, index),
          text: headerPrefix.trimEnd(),
          priority: 1,
        });
      }
    }
  } else {
    for (let index = selectedLines.start; index <= selectedLines.end; index += 1) {
      const body = stripLineBreak(chunks[index] ?? "");
      const indent = body.match(/^[ \t]*/)?.[0] ?? "";
      insertions.push({
        offset: getChunkStartOffset(chunks, index) + indent.length,
        text: "> ",
        priority: 1,
      });
    }
  }

  return applyTextInsertions(state, insertions);
}

function countMarkdownQuoteDepth(line: string): number {
  const quote = parseQuotePrefix(line);
  return quote ? (quote.normalized.match(/>/g) ?? []).length : 0;
}

function getMarkdownQuoteMarkerRange(
  line: string,
  depth: number,
): { start: number; end: number } | null {
  let cursor = line.match(/^[ \t]*/)?.[0].length ?? 0;
  for (let currentDepth = 1; currentDepth <= depth; currentDepth += 1) {
    if (line[cursor] !== ">") return null;
    const start = cursor;
    cursor += 1;
    if (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    if (currentDepth === depth) return { start, end: cursor };
  }
  return null;
}

function applyTextRemovals(state: TextState, removals: TextRemoval[]): TextEditResult {
  const ordered = [...removals].sort((left, right) => left.start - right.start);
  let cursor = 0;
  let value = "";
  for (const removal of ordered) {
    value += state.value.slice(cursor, removal.start);
    cursor = removal.end;
  }
  value += state.value.slice(cursor);
  return {
    value,
    selectionStart: mapOffsetAfterTextRemovals(state.selectionStart, ordered),
    selectionEnd: mapOffsetAfterTextRemovals(state.selectionEnd, ordered),
  };
}

function mapOffsetAfterTextRemovals(offset: number, removals: TextRemoval[]): number {
  let removed = 0;
  for (const removal of removals) {
    if (offset <= removal.start) break;
    if (offset < removal.end) return removal.start - removed;
    removed += removal.end - removal.start;
  }
  return offset - removed;
}

function applyTextInsertions(state: TextState, insertions: TextInsertion[]): TextEditResult {
  const ordered = [...insertions].sort(
    (left, right) => left.offset - right.offset || left.priority - right.priority,
  );
  let value = state.value;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const insertion = ordered[index];
    value = `${value.slice(0, insertion.offset)}${insertion.text}${value.slice(insertion.offset)}`;
  }
  return {
    value,
    selectionStart: mapOffsetAfterTextInsertions(state.selectionStart, ordered),
    selectionEnd: mapOffsetAfterTextInsertions(state.selectionEnd, ordered),
  };
}

function mapOffsetAfterTextInsertions(offset: number, insertions: TextInsertion[]): number {
  return offset + insertions.reduce(
    (added, insertion) => added + (insertion.offset <= offset ? insertion.text.length : 0),
    0,
  );
}

function mapOffsetAfterTextReplacement(
  offset: number,
  start: number,
  end: number,
  replacementLength: number,
): number {
  if (offset <= start) return offset;
  if (offset >= end) return offset + replacementLength - (end - start);
  return start + Math.min(offset - start, replacementLength);
}

export function insertMarkdownHorizontalRule(state: TextState): TextEditResult {
  return insertStandaloneMarkdownBlock(state, "---");
}

export function insertMarkdownTocTemplate(state: TextState): TextEditResult {
  return insertStandaloneMarkdownBlock(state, "[TOC]");
}

export function insertMarkdownFootnoteTemplate(state: TextState, texts: EditorTexts = DEFAULT_TEXTS): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd);
  const noteContent = selected || texts.footnote;
  const id = getNextFootnoteId(normalized.value);
  const reference = `[^${id}]`;
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const body = `${before}${reference}${after}`;
  const appendBreak = getFootnoteAppendBreak(body, lineBreak);
  const definitionPrefix = `[^${id}]: `;
  const value = `${body}${appendBreak}${definitionPrefix}${noteContent}`;
  const selectionStart = body.length + appendBreak.length + definitionPrefix.length;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + noteContent.length,
  };
}

function insertStandaloneMarkdownBlock(state: TextState, block: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const leadingBreak = before
    ? before.endsWith(`${lineBreak}${lineBreak}`) || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? lineBreak
        : `${lineBreak}${lineBreak}`
    : "";
  const trailingBreak = after
    ? startsWithLineBreak(after)
      ? lineBreak
      : `${lineBreak}${lineBreak}`
    : lineBreak;
  const inserted = `${leadingBreak}${block}${trailingBreak}`;
  const value = `${before}${inserted}${after}`;
  const cursor = before.length + leadingBreak.length + block.length + lineBreak.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function getNextFootnoteId(value: string): number {
  const used = new Set<number>();
  const pattern = /\[\^([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)](?::)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const numeric = Number(match[1]);
    if (Number.isInteger(numeric) && numeric > 0) {
      used.add(numeric);
    }
  }

  let next = 1;
  while (used.has(next)) next += 1;
  return next;
}

function getFootnoteAppendBreak(value: string, lineBreak: "\n" | "\r\n"): string {
  if (!value) return "";
  if (value.endsWith(`${lineBreak}${lineBreak}`) || value.endsWith("\n\n")) return "";
  if (value.endsWith("\n")) return lineBreak;
  return `${lineBreak}${lineBreak}`;
}

export function getLineRange(value: string, selectionStart: number, selectionEnd: number): LineRange {
  let start = Math.max(0, Math.min(selectionStart, selectionEnd));
  let end = Math.max(0, Math.max(selectionStart, selectionEnd));
  if (start === end && start > 0 && start === value.length && value.endsWith("\n")) {
    start -= 1;
    end -= 1;
  }
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const normalizedEnd = lineEnd === -1 ? value.length : lineEnd;
  return { value, start, end, lineStart, normalizedEnd };
}

function findSetextHeadingRange(value: string, lineStart: number, lineEnd: number): SetextHeadingRange | null {
  const line = value.slice(lineStart, lineEnd);
  const context = getSetextLineContext(line);
  if (isSetextUnderline(context.content)) {
    const previousEnd = lineStart > 0 ? lineStart - 1 : -1;
    if (previousEnd < 0) return null;
    const previousStart = value.lastIndexOf("\n", previousEnd - 1) + 1;
    const titleLine = value.slice(previousStart, previousEnd);
    const title = getSetextHeadingTitle(titleLine, previousStart);
    if (!title || title.quotePrefix !== context.quotePrefix) return null;
    return {
      headingStart: previousStart,
      headingEnd: previousEnd,
      underlineStart: lineStart,
      underlineEnd: lineEnd,
      title: title.value,
      titleStart: title.start,
      quotePrefix: title.quotePrefix,
    };
  }

  const title = getSetextHeadingTitle(line, lineStart);
  if (!title) return null;
  const nextStart = lineEnd + 1;
  if (nextStart > value.length) return null;
  const nextEnd = value.indexOf("\n", nextStart);
  const underlineEnd = nextEnd === -1 ? value.length : nextEnd;
  const underline = value.slice(nextStart, underlineEnd);
  const underlineContext = getSetextLineContext(underline);
  if (underlineContext.quotePrefix !== title.quotePrefix || !isSetextUnderline(underlineContext.content)) return null;

  return {
    headingStart: lineStart,
    headingEnd: lineEnd,
    underlineStart: nextStart,
    underlineEnd,
    title: title.value,
    titleStart: title.start,
    quotePrefix: title.quotePrefix,
  };
}

function getSetextHeadingTitle(line: string, lineStart: number): { value: string; start: number; quotePrefix: string } | null {
  const context = getSetextLineContext(line);
  if (!isSetextHeadingTitle(context.content)) return null;

  const leading = context.content.match(/^\s*/)?.[0] ?? "";
  return {
    value: context.content.trim(),
    start: lineStart + context.rawQuoteLength + leading.length,
    quotePrefix: context.quotePrefix,
  };
}

function getSetextLineContext(line: string): SetextLineContext {
  const quote = parseQuotePrefix(line);
  return {
    content: quote ? line.slice(quote.rawLength) : line,
    quotePrefix: quote?.normalized ?? "",
    rawQuoteLength: quote?.rawLength ?? 0,
  };
}

function isSetextUnderline(line: string): boolean {
  return /^\s{0,3}(={2,}|-{2,})\s*$/.test(line);
}

function isSetextHeadingTitle(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed)
    && !/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|\|)/.test(trimmed)
    && !/^\[[^\]]+]:/.test(trimmed);
}

function getCodeFenceMarker(content: string): string {
  const longest = content.match(/`+/g)?.reduce((length, run) => Math.max(length, run.length), 0) ?? 0;
  return "`".repeat(Math.max(3, longest + 1));
}

function matchDefinitionListMarkerLine(line: string): DefinitionListMarkerLine | null {
  const quote = parseQuotePrefix(line);
  const content = quote ? line.slice(quote.rawLength) : line;
  const marker = content.match(/^([ \t]{0,3}):(?:[ \t]+|$)/);
  if (!marker) return null;

  return {
    quotePrefix: quote?.normalized ?? "",
    indent: marker[1],
    content: line.slice((quote?.rawLength ?? 0) + marker[0].length),
    markerEnd: (quote?.rawLength ?? 0) + marker[0].length,
  };
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

function findLineIndex(lines: string[], cursor: number): number {
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = offset + lines[index].length;
    if (cursor <= lineEnd || index === lines.length - 1) return index;
    offset = lineEnd + 1;
  }
  return Math.max(0, lines.length - 1);
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

function hasTrailingLineBreak(chunk: string): boolean {
  return /\r?\n$/.test(chunk);
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

function startsWithLineBreak(value: string): boolean {
  return value.startsWith("\n") || value.startsWith("\r");
}

function sliceAfterRemovedLinePreservingBreak(value: string, end: number): string {
  return value[end] === "\n" && value[end - 1] === "\r" ? `\r${value.slice(end)}` : value.slice(end);
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

type RawFenceState =
  | { kind: "code"; marker: string; quoteDepth: number; listContinuationWidth: number }
  | { kind: "math"; marker: "$$" | "\\["; quoteDepth: number; listContinuationWidth: number };

interface RawFenceUnwrapEdit {
  start: number;
  end: number;
  text: string;
}

interface RawFenceBlockRange {
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
  unwrapEdits: RawFenceUnwrapEdit[];
}

interface RawFenceLine {
  quotePrefix: string;
  quoteDepth: number;
  content: string;
  contentColumn: number;
  trimmed: string;
}

interface RawFenceContent {
  content: string;
  contentColumn: number;
}

interface RawFenceOpening {
  context: RawFenceLine;
  fence: RawFenceState;
  openingContent: string;
  listMarkerPrefix: string;
}

function getRawFenceOpeningAtLine(
  lines: string[],
  lineIndex: number,
): RawFenceOpening | null {
  const line = (lines[lineIndex] ?? "").replace(/\r$/, "");
  const context = getRawFenceLine(line);
  const baseWidth = getEnclosingMarkdownListContinuationWidth(
    lines,
    lineIndex,
    line,
    context,
  );
  if (baseWidth !== null) {
    const stripped = stripMarkdownIndentColumns(
      context.content,
      baseWidth,
      context.contentColumn,
    );
    if (stripped) {
      const adjusted: RawFenceLine = {
        ...context,
        content: stripped.content,
        contentColumn: context.contentColumn + baseWidth,
        trimmed: stripped.content.trim(),
      };
      const nested = getRawFenceOpen(adjusted);
      if (nested) {
        const container = stripMarkdownListContainerMarkers(
          adjusted.content,
          adjusted.contentColumn,
        );
        return {
          context,
          fence: {
            ...nested,
            listContinuationWidth: baseWidth + nested.listContinuationWidth,
          },
          openingContent: container.content,
          listMarkerPrefix: container.prefixLength > 0
            ? context.quotePrefix
              + context.content.slice(0, stripped.prefixLength)
              + adjusted.content.slice(0, container.prefixLength)
            : "",
        };
      }
    }
  }

  const direct = getRawFenceOpen(context);
  if (!direct) return null;
  const container = stripMarkdownListContainerMarkers(
    context.content,
    context.contentColumn,
  );
  return {
    context,
    fence: direct,
    openingContent: container.content,
    listMarkerPrefix: container.prefixLength > 0
      ? context.quotePrefix + context.content.slice(0, container.prefixLength)
      : "",
  };
}

function getEnclosingMarkdownListContinuationWidth(
  lines: string[],
  lineIndex: number,
  line: string,
  context: RawFenceLine,
): number | null {
  const quote = parseQuotePrefix(line);
  const quotePrefix = quote?.normalized ?? "";
  const currentIndent = getLeadingMarkdownIndent(context.content);
  if (!isInsideMarkdownList(lines, lineIndex, quotePrefix, currentIndent)) {
    return null;
  }

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previousLine = (lines[index] ?? "").replace(/\r$/, "");
    const previous = getRawFenceLine(previousLine);
    if (previous.quoteDepth !== context.quoteDepth) {
      if (previousLine.trim()) return null;
      continue;
    }
    if (!previous.content.trim()) continue;

    const container = stripMarkdownListContainerMarkers(
      previous.content,
      previous.contentColumn,
    );
    if (container.prefixLength > 0) {
      return stripMarkdownIndentColumns(
        context.content,
        container.continuationIndentWidth,
        context.contentColumn,
      )
        ? container.continuationIndentWidth
        : null;
    }
    if (/^[ \t]+/.test(previous.content)) continue;
    return null;
  }
  return null;
}

function findClosedRawFenceBlock(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  kind: "code" | "math",
): RawFenceBlockRange | null {
  const chunks = collectLineChunks(value);
  const lines = chunks.map((chunk) => stripLineBreak(chunk));
  let active: (RawFenceState & { openLine: number }) | null = null;
  const targetStart = Math.max(0, Math.min(selectionStart, selectionEnd));
  const targetEnd = Math.max(0, Math.max(selectionStart, selectionEnd));

  for (let index = 0; index < chunks.length; index += 1) {
    const line = lines[index] ?? "";
    let context = getRawFenceLine(line, active?.quoteDepth ?? null);
    if (active) {
      const continuation = getRawFenceContinuationContent(context, active);
      if (continuation && isRawFenceClose(context, active)) {
        const openStart = getChunkStartOffset(chunks, active.openLine);
        const closeEnd = getChunkEndOffset(chunks, index);
        const collapsedAfterClosingLine = targetStart === targetEnd && targetStart === closeEnd && hasTrailingLineBreak(chunks[index] ?? "");
        if (active.kind === kind && targetStart >= openStart && targetEnd <= closeEnd && !collapsedAfterClosingLine) {
          const openEnd = getChunkEndOffset(chunks, active.openLine);
          const closeStart = getChunkStartOffset(chunks, index);
          return {
            openStart,
            openEnd,
            closeStart,
            closeEnd,
            unwrapEdits: getRawFenceUnwrapEdits(
              chunks,
              active.openLine,
              index,
              active,
              openStart,
              openEnd,
              closeStart,
              closeEnd,
            ),
          };
        }
        active = null;
      }
      if (continuation) continue;
      active = null;
      context = getRawFenceLine(line);
    }

    const opening = getRawFenceOpeningAtLine(lines, index);
    if (opening) {
      active = { ...opening.fence, openLine: index };
    }
  }

  return null;
}

function getRawFenceUnwrapEdits(
  chunks: string[],
  openLine: number,
  closeLine: number,
  fence: RawFenceState,
  openStart: number,
  openEnd: number,
  closeStart: number,
  closeEnd: number,
): RawFenceUnwrapEdit[] {
  const lines = chunks.map((chunk) => stripLineBreak(chunk));
  const opening = getRawFenceOpeningAtLine(lines, openLine);
  const openingText = opening?.listMarkerPrefix ?? "";
  const edits: RawFenceUnwrapEdit[] = [
    { start: openStart, end: openEnd, text: openingText },
  ];

  if (openingText && closeLine > openLine + 1) {
    const firstLine = openLine + 1;
    const firstStart = getChunkStartOffset(chunks, firstLine);
    const first = getRawFenceLine(
      stripLineBreak(chunks[firstLine] ?? ""),
      fence.quoteDepth,
    );
    const stripped = stripMarkdownIndentColumns(
      first.content,
      fence.listContinuationWidth,
      first.contentColumn,
    );
    if (stripped) {
      const remaining = first.content.slice(stripped.prefixLength);
      const synthetic = stripped.content.slice(
        0,
        Math.max(0, stripped.content.length - remaining.length),
      );
      edits.push({
        start: firstStart,
        end: firstStart + first.quotePrefix.length + stripped.prefixLength,
        text: synthetic,
      });
    }
  }

  edits.push({ start: closeStart, end: closeEnd, text: "" });
  return edits;
}

function getRawFenceOpen(line: RawFenceLine): RawFenceState | null {
  const container = stripMarkdownListContainerMarkers(line.content, line.contentColumn);
  const content = container.content;
  const contentColumn = line.contentColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(content, contentColumn)) return null;
  const indent = getLeadingMarkdownIndent(content);
  const semantic = content.slice(indent.length);
  const code = semantic.match(/^(`{3,}|~{3,})([^\r\n]*)$/);
  if (code && !(code[1][0] === "`" && code[2].includes("`"))) {
    return {
      kind: "code",
      marker: code[1],
      quoteDepth: line.quoteDepth,
      listContinuationWidth: container.continuationIndentWidth,
    };
  }
  if (readDollarMathBlockOpening(content, 3, contentColumn)) {
    return {
      kind: "math",
      marker: "$$",
      quoteDepth: line.quoteDepth,
      listContinuationWidth: container.continuationIndentWidth,
    };
  }
  if (/^\\\[\s*$/.test(semantic)) {
    return {
      kind: "math",
      marker: "\\[",
      quoteDepth: line.quoteDepth,
      listContinuationWidth: container.continuationIndentWidth,
    };
  }
  return null;
}

function stripLineBreak(value: string): string {
  return value.replace(/\r?\n$/, "");
}

function getRawFenceLine(
  line: string,
  maximumQuoteDepth: number | null = null,
): RawFenceLine {
  const quote = readMarkdownBlockquotePrefix(line, maximumQuoteDepth);
  const content = quote ? line.slice(quote.raw.length) : line;
  return {
    quotePrefix: quote?.raw ?? "",
    quoteDepth: quote?.depth ?? 0,
    content,
    contentColumn: quote?.contentColumn ?? 0,
    trimmed: content.trim(),
  };
}

function getRawFenceContinuationContent(
  line: RawFenceLine,
  fence: RawFenceState,
): RawFenceContent | null {
  if (line.quoteDepth !== fence.quoteDepth) return null;
  if (fence.listContinuationWidth === 0 || !line.content.trim()) {
    return { content: line.content, contentColumn: line.contentColumn };
  }
  const stripped = stripMarkdownIndentColumns(
    line.content,
    fence.listContinuationWidth,
    line.contentColumn,
  );
  return stripped
    ? {
      content: stripped.content,
      contentColumn: line.contentColumn + fence.listContinuationWidth,
    }
    : null;
}

function isRawFenceClose(line: RawFenceLine, fence: RawFenceState): boolean {
  const continuation = getRawFenceContinuationContent(line, fence);
  if (!continuation) return false;
  const { content, contentColumn } = continuation;
  if (isMarkdownCodeIndented(content, contentColumn)) return false;
  const indent = getLeadingMarkdownIndent(content);
  const semantic = content.slice(indent.length);

  if (fence.kind === "math") {
    return fence.marker === "$$"
      ? isDollarMathBlockClosing(content, 3, contentColumn)
      : /^\\\]\s*$/.test(semantic);
  }

  const closing = semantic.match(/^(`{3,}|~{3,})[ \t]*$/);
  return Boolean(closing && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length);
}

function hasLineFormat(line: string, format: MarkdownLineFormat): boolean {
  switch (format) {
    case "blockquote":
      return /^\s*>\s?/.test(line);
    case "bullet":
      return stripLineForListFormatting(line).marker === "bullet";
    case "ordered":
      return stripLineForListFormatting(line).marker === "ordered";
    case "task":
      return stripLineForListFormatting(line).marker === "task";
    case "definition":
      return Boolean(matchDefinitionListMarkerLine(line));
    default:
      return false;
  }
}

function isBlankLineFormattingTarget(line: string): boolean {
  const quote = parseQuotePrefix(line);
  return quote ? !line.slice(quote.rawLength).trim() : !line.trim();
}

function isBlankHeadingTarget(line: string): boolean {
  return isBlankLineFormattingTarget(line);
}

function addBlockquoteMarker(line: string): string {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  return `${indent}> ${line.slice(indent.length)}`;
}

function removeSingleBlockquoteMarker(line: string): string {
  return line.replace(/^(\s*)>\s?/, "$1");
}

function stripLineForListFormatting(
  line: string,
): { indent: string; content: string; contentStart: number; marker: MarkdownLineFormat | ""; taskChecked: boolean } {
  const { body, ending } = splitCarriageReturnEnding(line);
  const quote = parseQuotePrefix(body);
  const baseIndent = body.match(/^\s*/)?.[0] ?? "";
  const indent = quote?.normalized ?? baseIndent;
  const rest = quote ? body.slice(quote.rawLength) : body.slice(baseIndent.length);
  const innerIndent = rest.match(/^\s*/)?.[0] ?? "";
  const listIndent = quote ? innerIndent : baseIndent;
  let content = rest.slice(innerIndent.length);
  let contentStart = (quote?.rawLength ?? baseIndent.length) + innerIndent.length;
  let marker: MarkdownLineFormat | "" = "";
  let taskChecked = false;
  const heading = content.match(/^#{1,6}\s+(.+)$/);
  if (heading) {
    contentStart += heading[0].length - heading[1].length;
    content = stripAtxClosingMarker(heading[1]);
  }

  const footnoteDefinition = content.match(/^\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/);
  if (footnoteDefinition) {
    contentStart += footnoteDefinition[0].length;
    content = content.slice(footnoteDefinition[0].length);
  }

  const definitionMarker = content.match(/^:(?:[ \t]+|$)/);
  if (definitionMarker) {
    contentStart += definitionMarker[0].length;
    content = content.slice(definitionMarker[0].length);
  }

  const canUseListMarker = getIndentWidth(listIndent) < 4;
  const task = canUseListMarker ? content.match(/^[-*+]\s+\[([ xX])\]\s+/) : null;
  const orderedTask = canUseListMarker ? content.match(/^\d+[.)]\s+\[([ xX])\]\s+/) : null;
  if (orderedTask) {
    marker = "task";
    taskChecked = orderedTask[1].toLowerCase() === "x";
    contentStart += orderedTask[0].length;
    content = content.slice(orderedTask[0].length);
    return { indent: `${indent}${innerIndent}`, content: `${content}${ending}`, contentStart, marker, taskChecked };
  }

  if (task) {
    marker = "task";
    taskChecked = task[1].toLowerCase() === "x";
    contentStart += task[0].length;
    content = content.slice(task[0].length);
    return { indent: `${indent}${innerIndent}`, content: `${content}${ending}`, contentStart, marker, taskChecked };
  }

  const bullet = canUseListMarker ? content.match(/^[-*+]\s+/) : null;
  if (bullet) {
    marker = "bullet";
    contentStart += bullet[0].length;
    content = content.slice(bullet[0].length);
    return { indent: `${indent}${innerIndent}`, content: `${content}${ending}`, contentStart, marker, taskChecked };
  }

  const ordered = canUseListMarker ? content.match(/^\d+[.)]\s+/) : null;
  if (ordered) {
    marker = "ordered";
    contentStart += ordered[0].length;
    content = content.slice(ordered[0].length);
  }

  return { indent: `${indent}${innerIndent}`, content: `${content}${ending}`, contentStart, marker, taskChecked };
}

function stripBlockMarkers(line: string): { indent: string; content: string; contentStart: number } {
  const { body, ending } = splitCarriageReturnEnding(line);
  const indent = body.match(/^\s*/)?.[0] ?? "";
  let content = body.slice(indent.length);
  let contentStart = indent.length;

  let changed = true;
  while (changed) {
    const before = content;
    const heading = content.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      contentStart += heading[0].length - heading[1].length;
      content = stripAtxClosingMarker(heading[1]);
    } else {
      const marker = [
        /^>\s?/,
        /^[ \t]{0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/,
        /^[ \t]{0,3}:(?:[ \t]+|$)/,
        ...(getIndentWidth(indent) < 4
          ? [
            /^(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/,
            /^[-*+]\s+/,
            /^\d+[.)]\s+/,
          ]
          : []),
      ]
        .map((pattern) => content.match(pattern)?.[0] ?? "")
        .find(Boolean);
      if (marker) {
        contentStart += marker.length;
        content = content.slice(marker.length);
      }
    }
    changed = before !== content;
  }

  return { indent, content: `${content}${ending}`, contentStart };
}

function stripAtxClosingMarker(value: string): string {
  return value.replace(/\s+#+\s*$/, "").trim();
}



export function normalizeCodeFenceInfoString(value: string, marker = ""): string {
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  return marker.startsWith("`") ? normalized.replace(/`+/g, "") : normalized;
}



export interface MarkdownBlockquotePrefix {
  raw: string;
  depth: number;
  contentColumn: number;
}

export interface MarkdownListContainer {
  content: string;
  prefixLength: number;
  continuationIndentWidth: number;
  codeIndented: boolean;
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

export function stripMarkdownListContainerMarkers(
  value: string,
  startColumn = 0,
): MarkdownListContainer {
  let content = value;
  let prefixLength = 0;
  const initialColumn = Math.max(0, Math.trunc(startColumn));
  let column = initialColumn;
  for (let depth = 0; depth < 16; depth += 1) {
    const marker = content.match(/^([ \t]*)(?:[-+*]|\d{1,9}[.)])([ \t]+)/);
    if (!marker) break;
    const leadingColumn = getMarkdownColumnAfter(marker[1] ?? "", column);
    if (leadingColumn - column > 3) break;
    const markerTextLength = marker[0].length - (marker[1]?.length ?? 0) - (marker[2]?.length ?? 0);
    const markerEndColumn = leadingColumn + markerTextLength;
    const contentColumn = getMarkdownColumnAfter(marker[2] ?? "", markerEndColumn);
    if (contentColumn - markerEndColumn > 4) {
      return {
        content,
        prefixLength,
        continuationIndentWidth: column - initialColumn,
        codeIndented: true,
      };
    }
    content = content.slice(marker[0].length);
    prefixLength += marker[0].length;
    column = contentColumn;
  }
  return {
    content,
    prefixLength,
    continuationIndentWidth: column - initialColumn,
    codeIndented: false,
  };
}

export function stripMarkdownIndentColumns(
  value: string,
  width: number,
  startColumn = 0,
): { content: string; prefixLength: number } | null {
  const initialColumn = Math.max(0, Math.trunc(startColumn));
  const targetColumn = initialColumn + Math.max(0, Math.trunc(width));
  let column = initialColumn;
  let cursor = 0;
  while (cursor < value.length && column < targetColumn) {
    const character = value[cursor];
    if (character !== " " && character !== "\t") return null;
    const nextColumn = getMarkdownColumnAfter(character, column);
    cursor += 1;
    if (nextColumn > targetColumn) {
      return {
        content: `${" ".repeat(nextColumn - targetColumn)}${value.slice(cursor)}`,
        prefixLength: cursor,
      };
    }
    column = nextColumn;
  }
  if (column < targetColumn) return null;
  return { content: value.slice(cursor), prefixLength: cursor };
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

export function isDollarMathBlockClosing(
  line: string,
  maximumIndentLength: number | null = 3,
  startColumn = 0,
): boolean {
  return readDollarMathBlockOpening(line, maximumIndentLength, startColumn) !== null;
}

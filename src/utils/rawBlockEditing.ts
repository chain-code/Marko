import { splitMarkdownBlocks, type MarkdownBlock } from "./editorBlocks";
import { getContinuousPreviewBlocks } from "./continuousEditor";
import {
  isDollarMathBlockClosing,
  readDollarMathBlockOpening,
} from "./mathSyntax";
import {
  getLeadingMarkdownIndent,
  isMarkdownCodeIndented,
  readMarkdownBlockquotePrefix,
  stripMarkdownIndentColumns,
  stripMarkdownListContainerMarkers,
} from "./markdownIndent";

export type RawBlockKind = "code" | "math" | "html";
export type RawBlockDeleteDirection = "backward" | "forward";
export type RawBlockEditAction = "exit" | "unwrap" | "delete" | "consume";

export interface RawBlockTextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  selectionHead?: number;
}

export interface RawBlockEnterModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export interface RawBlockSelection {
  kind: RawBlockKind;
  blockStart: number;
  blockEnd: number;
  contentStart: number;
  contentEnd: number;
  selectionStart: number;
  selectionEnd: number;
  selectionHead: number;
  insideContent: boolean;
  lineBreak: "\n" | "\r\n";
  content: string;
  sourceContent: string;
  unwrappedContent: string;
  contentLineCount: number;
  empty: boolean;
  closed: boolean;
  closingText: string | null;
  unwrappedCursorOffset: number;
}

export interface RawBlockEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  selectionHead: number;
  kind: RawBlockKind;
  action: RawBlockEditAction;
}

interface SourceLine {
  text: string;
  start: number;
  contentEnd: number;
  end: number;
}

interface LineContext {
  prefix: string;
  key: string;
  content: string;
  contentColumn: number;
}

interface ParsedRawBlock {
  kind: RawBlockKind;
  blockStart: number;
  blockEnd: number;
  contentStart: number;
  contentEnd: number;
  lineBreak: "\n" | "\r\n";
  content: string;
  sourceContent: string;
  unwrappedContent: string;
  contentLineCount: number;
  empty: boolean;
  closed: boolean;
  closingText: string | null;
  unwrappedCursorOffset: number;
}

interface FenceOpening {
  kind: "code" | "math";
  marker: string;
  indent: string;
  quoteDepth: number;
  key: string;
  quotePrefix: string;
  listContinuationWidth: number;
  inlinePrefix: string;
}

interface FenceContinuation {
  content: string;
  contentColumn: number;
  prefixLength: number;
}

interface ParsedFenceCandidate extends ParsedRawBlock {
  endLineIndex: number;
}

const htmlBlockTagPattern = "address|article|aside|audio|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|pre|script|search|section|style|summary|table|tbody|td|textarea|tfoot|th|thead|title|tr|track|ul|video";
const htmlRootTagPattern = "!DOCTYPE|div|p|h[1-6]|table|figure|details|left|right|center|footer|header|nav|ol|ul|article|address|dl|applet|map|aside|audio|bdo|blockquote|form|select|dialog|picture|embed|object|iframe|main|pre|section|svg|textarea|video|template|head|canvas|base|datalist|meta|script|style|noscript|title|menu|hr";
const htmlRootTag = new RegExp(`^\\s*<(${htmlRootTagPattern})(?:(/)|>|\\s|$)`, "i");
const typoraVoidHtmlRoots = new Set(["br", "hr", "embed"]);

export function escapeRawBlockContentAsPre(content: string): string {
  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return `<pre>${escaped}</pre>`;
}

export function getRawBlockSelection(state: RawBlockTextState): RawBlockSelection | null {
  const normalized = normalizeState(state);
  const lineBreak = getPreferredLineBreak(normalized.value);

  for (const block of getRawBlockCandidates(normalized.value)) {
    if (normalized.selectionStart < block.start || normalized.selectionEnd > block.end) continue;
    const parsed = parseRawBlock(
      normalized.value,
      block,
      lineBreak,
      normalized.selectionStart,
      normalized.selectionEnd,
    );
    if (!parsed) continue;

    const insideContent = normalized.selectionStart >= parsed.contentStart
      && normalized.selectionEnd <= parsed.contentEnd
      && normalized.selectionHead >= parsed.contentStart
      && normalized.selectionHead <= parsed.contentEnd;
    return {
      ...parsed,
      selectionStart: normalized.selectionStart,
      selectionEnd: normalized.selectionEnd,
      selectionHead: normalized.selectionHead,
      insideContent,
    };
  }

  return null;
}

function getRawBlockCandidates(value: string): MarkdownBlock[] {
  const candidates = new Map<string, MarkdownBlock>();
  for (const block of splitMarkdownBlocks(value)) {
    candidates.set(block.start + ":" + block.end, block);
  }
  for (const preview of getContinuousPreviewBlocks(value)) {
    if (!["code", "diagram", "math", "html"].includes(preview.kind)) continue;
    const type = preview.kind === "diagram" ? "code" : preview.kind;
    const key = preview.from + ":" + preview.to;
    if (!candidates.has(key)) {
      candidates.set(key, {
        index: candidates.size,
        raw: preview.source,
        start: preview.from,
        end: preview.to,
        type,
      });
    }
  }
  return [...candidates.values()].sort((left, right) => (
    (left.end - left.start) - (right.end - right.start)
    || left.start - right.start
  ));
}

export function handleRawBlockEnter(
  state: RawBlockTextState,
  modifiers: RawBlockEnterModifiers = {},
): RawBlockEditResult | null {
  const raw = getRawBlockSelection(state);
  if (!raw || !raw.insideContent || raw.selectionHead !== raw.contentEnd) return null;

  const modifiedEnter = Boolean(modifiers.ctrlKey || modifiers.metaKey);
  if (raw.kind === "code") {
    if (!modifiedEnter || raw.selectionStart !== raw.selectionEnd) return null;
    return exitRawBlock(state.value, raw);
  }

  if (raw.kind === "math") {
    if (modifiers.shiftKey || !modifiedEnter) return null;
    return exitRawBlock(state.value, raw);
  }

  if (!modifiedEnter && (modifiers.shiftKey || !raw.closed)) return null;
  return exitRawBlock(state.value, raw);
}

export function handleRawBlockBoundaryDelete(
  state: RawBlockTextState,
  direction: RawBlockDeleteDirection,
): RawBlockEditResult | null {
  const raw = getRawBlockSelection(state);
  if (
    !raw
    || !raw.insideContent
    || raw.selectionStart !== raw.selectionEnd
    || raw.selectionHead !== raw.selectionStart
  ) {
    return null;
  }

  const atStart = raw.selectionHead === raw.contentStart;
  const atEnd = raw.selectionHead === raw.contentEnd;
  if (direction === "backward" && !atStart) return null;
  if (direction === "forward" && !atEnd) return null;

  if (raw.kind === "code") {
    if (raw.empty) return replaceRawBlock(state.value, raw, "", "delete", 0);
    if (direction === "backward" && raw.contentLineCount === 1) {
      return replaceRawBlock(
        state.value,
        raw,
        raw.unwrappedContent,
        "unwrap",
        raw.unwrappedCursorOffset,
      );
    }
    return unchangedRawBlock(state.value, raw);
  }

  if (raw.kind === "math") {
    return raw.empty
      ? replaceRawBlock(state.value, raw, "", "delete", 0)
      : unchangedRawBlock(state.value, raw);
  }

  return unchangedRawBlock(state.value, raw);
}

function parseRawBlock(
  value: string,
  block: MarkdownBlock,
  lineBreak: "\n" | "\r\n",
  selectionStart: number,
  selectionEnd: number,
): ParsedRawBlock | null {
  const lines = collectSourceLines(block.raw, block.start);
  if (!lines.length) return null;

  for (let openingIndex = 0; openingIndex < lines.length; openingIndex += 1) {
    const candidate = parseFenceBlock(value, lines, lineBreak, openingIndex);
    if (!candidate) continue;
    if (
      selectionStart >= candidate.blockStart
      && selectionEnd <= candidate.blockEnd
    ) {
      const { endLineIndex: _endLineIndex, ...parsed } = candidate;
      return parsed;
    }
    openingIndex = Math.max(openingIndex, candidate.endLineIndex);
  }

  const html = parseHtmlBlock(value, block, lines, lineBreak);
  return html
    && selectionStart >= html.blockStart
    && selectionEnd <= html.blockEnd
    ? html
    : null;
}

function parseFenceBlock(
  value: string,
  lines: SourceLine[],
  lineBreak: "\n" | "\r\n",
  openingIndex: number,
): ParsedFenceCandidate | null {
  const opening = getFenceOpening(lines, openingIndex);
  if (!opening) return null;

  let closingIndex = -1;
  let endLineIndex = lines.length - 1;
  let closingContinuation: FenceContinuation | null = null;
  const contentLines: Array<{ line: SourceLine; continuation: FenceContinuation }> = [];

  for (let index = openingIndex + 1; index < lines.length; index += 1) {
    const continuation = getFenceContinuation(lines[index].text, opening);
    if (!continuation) {
      endLineIndex = index - 1;
      break;
    }
    const content = continuation.content;
    const codeIndented = isMarkdownCodeIndented(content, continuation.contentColumn);
    const contentIndent = getLeadingMarkdownIndent(content);
    const semantic = content.slice(contentIndent.length);
    if (!codeIndented && opening.kind === "code") {
      const closing = semantic.match(/^(`{3,}|~{3,})[ \t]*$/);
      if (
        closing
        && closing[1][0] === opening.marker[0]
        && closing[1].length >= opening.marker.length
      ) {
        closingIndex = index;
        endLineIndex = index;
        closingContinuation = continuation;
        break;
      }
    } else if (
      !codeIndented
      && opening.marker === "$$"
      && isDollarMathBlockClosing(content, 3, continuation.contentColumn)
    ) {
      closingIndex = index;
      endLineIndex = index;
      closingContinuation = continuation;
      break;
    } else if (
      !codeIndented
      && opening.marker === "\\["
      && /^\\\]\s*$/.test(semantic)
    ) {
      closingIndex = index;
      endLineIndex = index;
      closingContinuation = continuation;
      break;
    }
    contentLines.push({ line: lines[index], continuation });
  }

  const closed = closingIndex >= 0;
  const firstContentLine = contentLines[0];
  const lastContentLine = contentLines.at(-1);
  const emptyBoundary = closed
    ? lines[closingIndex].start + (closingContinuation?.prefixLength ?? 0)
    : lines[endLineIndex]?.contentEnd ?? lines[openingIndex].contentEnd;
  const contentStart = firstContentLine
    ? firstContentLine.line.start + firstContentLine.continuation.prefixLength
    : emptyBoundary;
  const contentEnd = lastContentLine?.line.contentEnd ?? contentStart;
  const sourceContent = firstContentLine && lastContentLine
    ? value.slice(firstContentLine.line.start, lastContentLine.line.contentEnd)
    : "";
  const content = contentLines
    .map(({ continuation }) => continuation.content)
    .join(lineBreak);
  const unwrappedContent = contentLines
    .map(({ line, continuation }, index) => (
      index === 0
        ? opening.inlinePrefix + continuation.content
        : line.text
    ))
    .join(lineBreak);
  const closingMarker = opening.kind === "code"
    ? opening.marker
    : opening.marker === "$$" ? "$$" : "\\]";

  return {
    kind: opening.kind,
    blockStart: lines[openingIndex].start,
    blockEnd: closed
      ? lines[closingIndex].contentEnd
      : lines[endLineIndex]?.contentEnd ?? lines[openingIndex].contentEnd,
    contentStart,
    contentEnd,
    lineBreak,
    content,
    sourceContent,
    unwrappedContent,
    contentLineCount: Math.max(1, contentLines.length),
    empty: content === "",
    closed,
    closingText: opening.quotePrefix
      + " ".repeat(opening.listContinuationWidth)
      + opening.indent
      + closingMarker,
    unwrappedCursorOffset: firstContentLine ? opening.inlinePrefix.length : 0,
    endLineIndex,
  };
}

function getFenceOpening(lines: SourceLine[], lineIndex: number): FenceOpening | null {
  const context = getLineContext(lines[lineIndex].text);
  const enclosingWidth = getEnclosingListContinuationWidth(lines, lineIndex, context);
  if (enclosingWidth !== null) {
    const stripped = stripMarkdownIndentColumns(
      context.content,
      enclosingWidth,
      context.contentColumn,
    );
    if (stripped) {
      const nested = readFenceOpening(
        context,
        stripped.content,
        context.contentColumn + enclosingWidth,
        enclosingWidth,
        stripped.prefixLength,
      );
      if (nested) return nested;
    }
  }

  return readFenceOpening(context, context.content, context.contentColumn, 0, 0);
}

function readFenceOpening(
  context: LineContext,
  content: string,
  contentColumn: number,
  baseContinuationWidth: number,
  basePrefixLength: number,
): FenceOpening | null {
  const container = stripMarkdownListContainerMarkers(content, contentColumn);
  const openingContentColumn = contentColumn + container.continuationIndentWidth;
  if (
    container.codeIndented
    || isMarkdownCodeIndented(container.content, openingContentColumn)
  ) return null;

  const indent = getLeadingMarkdownIndent(container.content);
  const semantic = container.content.slice(indent.length);
  const code = semantic.match(/^(`{3,}|~{3,})([^\r\n]*)$/);
  if (code?.[1][0] === "`" && code[2].includes("`")) return null;
  const dollarMath = readDollarMathBlockOpening(container.content, 3, openingContentColumn);
  const bracketMath = semantic.match(/^(\\\[)\s*$/);
  if (!code && !dollarMath && !bracketMath) return null;

  const quoteDepth = readMarkdownBlockquotePrefix(context.prefix)?.depth ?? 0;
  const prefixLength = basePrefixLength + container.prefixLength;
  return {
    kind: code ? "code" : "math",
    marker: code?.[1] ?? (dollarMath ? "$$" : bracketMath?.[1] ?? ""),
    indent: dollarMath?.indent ?? indent,
    quoteDepth,
    key: context.key,
    quotePrefix: context.prefix,
    listContinuationWidth: baseContinuationWidth + container.continuationIndentWidth,
    inlinePrefix: context.prefix + context.content.slice(0, prefixLength),
  };
}

function getEnclosingListContinuationWidth(
  lines: SourceLine[],
  lineIndex: number,
  context: LineContext,
): number | null {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previous = getLineContext(lines[index].text);
    if (previous.key !== context.key) {
      if (previous.content.trim()) return null;
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

function getFenceContinuation(
  line: string,
  opening: FenceOpening,
): FenceContinuation | null {
  const context = getLineContext(line, opening.quoteDepth);
  if (context.key !== opening.key) return null;
  if (opening.listContinuationWidth === 0) {
    return {
      content: context.content,
      contentColumn: context.contentColumn,
      prefixLength: context.prefix.length,
    };
  }
  if (!context.content.trim()) {
    return {
      content: "",
      contentColumn: context.contentColumn + opening.listContinuationWidth,
      prefixLength: context.prefix.length + context.content.length,
    };
  }
  const stripped = stripMarkdownIndentColumns(
    context.content,
    opening.listContinuationWidth,
    context.contentColumn,
  );
  return stripped
    ? {
      content: stripped.content,
      contentColumn: context.contentColumn + opening.listContinuationWidth,
      prefixLength: context.prefix.length + stripped.prefixLength,
    }
    : null;
}

function parseHtmlBlock(
  value: string,
  block: MarkdownBlock,
  lines: SourceLine[],
  lineBreak: "\n" | "\r\n",
): ParsedRawBlock | null {
  const quoteDepth = readMarkdownBlockquotePrefix(lines[0].text)?.depth ?? 0;
  const first = getLineContext(lines[0].text, quoteDepth);
  if (!isRawHtmlStart(first.content)) return null;

  const rawContent = lines
    .map((line) => getLineContext(line.text, quoteDepth).content)
    .join(lineBreak);
  const closed = isClosedHtmlBlock(rawContent);
  const hasSyntheticTrailingLine = closed
    && lines.length > 1
    && lines.at(-1)?.text === ""
    && lines.at(-1)?.start === block.end;
  const contentLines = hasSyntheticTrailingLine ? lines.slice(0, -1) : lines;
  const last = contentLines.at(-1) ?? lines[0];
  const content = contentLines
    .map((line) => getLineContext(line.text, quoteDepth).content)
    .join(lineBreak);
  return {
    kind: "html",
    blockStart: block.start,
    blockEnd: last.contentEnd,
    contentStart: lines[0].start + first.prefix.length,
    contentEnd: last.contentEnd,
    lineBreak,
    content,
    sourceContent: value.slice(lines[0].start, last.contentEnd),
    unwrappedContent: value.slice(lines[0].start, last.contentEnd),
    contentLineCount: Math.max(1, contentLines.length),
    empty: content === "",
    closed,
    closingText: null,
    unwrappedCursorOffset: first.prefix.length,
  };
}

function exitRawBlock(value: string, raw: RawBlockSelection): RawBlockEditResult {
  let nextValue = value;
  let blockEnd = raw.blockEnd;

  if (!raw.closed && raw.closingText) {
    const beforeClosing = nextValue.slice(raw.blockStart, blockEnd);
    const insertion = endsWithLineBreak(beforeClosing)
      ? raw.closingText
      : `${raw.lineBreak}${raw.closingText}`;
    nextValue = `${nextValue.slice(0, blockEnd)}${insertion}${nextValue.slice(blockEnd)}`;
    blockEnd += insertion.length;
  }

  const suffix = nextValue.slice(blockEnd);
  const nextContent = suffix.search(/\S/);
  if (nextContent >= 0) {
    return collapsedResult(nextValue, blockEnd + nextContent, raw.kind, "exit");
  }

  const lineBreakCount = suffix.match(/\r\n|\n/g)?.length ?? 0;
  if (lineBreakCount < 2) {
    nextValue += raw.lineBreak.repeat(2 - lineBreakCount);
  }
  return collapsedResult(nextValue, nextValue.length, raw.kind, "exit");
}

function replaceRawBlock(
  value: string,
  raw: RawBlockSelection,
  replacement: string,
  action: "unwrap" | "delete",
  cursorOffset: number,
): RawBlockEditResult {
  const nextValue = `${value.slice(0, raw.blockStart)}${replacement}${value.slice(raw.blockEnd)}`;
  return collapsedResult(nextValue, raw.blockStart + cursorOffset, raw.kind, action);
}

function unchangedRawBlock(value: string, raw: RawBlockSelection): RawBlockEditResult {
  return {
    value,
    selectionStart: raw.selectionStart,
    selectionEnd: raw.selectionEnd,
    selectionHead: raw.selectionHead,
    kind: raw.kind,
    action: "consume",
  };
}

function collapsedResult(
  value: string,
  cursor: number,
  kind: RawBlockKind,
  action: Exclude<RawBlockEditAction, "consume">,
): RawBlockEditResult {
  return {
    value,
    selectionStart: cursor,
    selectionEnd: cursor,
    selectionHead: cursor,
    kind,
    action,
  };
}

function normalizeState(state: RawBlockTextState): Required<RawBlockTextState> {
  const first = clampOffset(state.selectionStart, state.value.length);
  const second = clampOffset(state.selectionEnd, state.value.length);
  return {
    value: state.value,
    selectionStart: Math.min(first, second),
    selectionEnd: Math.max(first, second),
    selectionHead: clampOffset(state.selectionHead ?? state.selectionEnd, state.value.length),
  };
}

function clampOffset(value: number, length: number): number {
  return Math.max(0, Math.min(Number.isFinite(value) ? value : 0, length));
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.match(/\r\n|\n/)?.[0] === "\r\n" ? "\r\n" : "\n";
}

function endsWithLineBreak(value: string): boolean {
  return /(?:\r\n|\n)$/.test(value);
}

function collectSourceLines(value: string, baseOffset: number): SourceLine[] {
  const lines: SourceLine[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const newline = value.indexOf("\n", cursor);
    if (newline < 0) {
      lines.push({
        text: value.slice(cursor),
        start: baseOffset + cursor,
        contentEnd: baseOffset + value.length,
        end: baseOffset + value.length,
      });
      cursor = value.length;
      break;
    }

    const contentEnd = newline > cursor && value[newline - 1] === "\r" ? newline - 1 : newline;
    lines.push({
      text: value.slice(cursor, contentEnd),
      start: baseOffset + cursor,
      contentEnd: baseOffset + contentEnd,
      end: baseOffset + newline + 1,
    });
    cursor = newline + 1;
  }

  if (value.length === 0 || endsWithLineBreak(value)) {
    lines.push({
      text: "",
      start: baseOffset + value.length,
      contentEnd: baseOffset + value.length,
      end: baseOffset + value.length,
    });
  }
  return lines;
}

function getLineContext(
  line: string,
  maximumQuoteDepth: number | null = null,
): LineContext {
  const quote = readMarkdownBlockquotePrefix(line, maximumQuoteDepth);
  if (!quote) return { prefix: "", key: "plain", content: line, contentColumn: 0 };
  return {
    prefix: quote.raw,
    key: `quote:${quote.depth}`,
    content: line.slice(quote.raw.length),
    contentColumn: quote.contentColumn,
  };
}

function isRawHtmlStart(value: string): boolean {
  if (isMarkdownCodeIndented(value)) return false;
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("<")) return false;
  return /^<!--/.test(trimmed)
    || /^<\?/.test(trimmed)
    || /^<![A-Z]/.test(trimmed)
    || /^<!\[CDATA\[/.test(trimmed)
    || new RegExp(`^</?(${htmlBlockTagPattern})(?=[\\s>/])`, "i").test(trimmed);
}

function isClosedHtmlBlock(value: string): boolean {
  const trimmed = value.trimStart();
  if (/^<!--/.test(trimmed)) return /-->/.test(trimmed);
  if (/^<\?/.test(trimmed)) return /\?>/.test(trimmed);
  if (/^<!\[CDATA\[/.test(trimmed)) return /\]\]>/.test(trimmed);
  if (/^<![A-Z]/.test(trimmed) && !/^<!DOCTYPE/i.test(trimmed)) return />/.test(trimmed);

  const root = trimmed.match(htmlRootTag);
  if (!root) return true;
  const tag = root[1].toLowerCase();
  if (tag === "!doctype") return />/.test(trimmed);
  if (root[2] || typoraVoidHtmlRoots.has(tag)) return true;

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

import {
  getMarkdownColumnAfter,
  getMarkdownIndentWidth,
  isMarkdownCodeIndented,
  readMarkdownBlockquotePrefix,
} from "./markdownIndent";

export interface InlineDollarMathMatch {
  start: number;
  end: number;
  raw: string;
  formula: string;
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

interface InlineMathContainer {
  quoteDepth: number;
  listIndent: number | null;
}

export function readInlineDollarMath(source: string, start: number): InlineDollarMathMatch | null {
  if (
    source[start] !== "$"
    || source[start - 1] === "$"
    || source[start + 1] === "$"
    || isEscapedAt(source, start)
  ) {
    return null;
  }

  const formulaStart = start + 1;
  if (/\s/.test(source[formulaStart] ?? "")) return null;

  const container = getInlineMathContainer(source, start);
  const formulaParts: string[] = [];
  let segmentStart = formulaStart;
  let cursor = formulaStart;
  while (cursor < source.length) {
    const character = source[cursor];
    if (character === "\r" || character === "\n") {
      const breakLength = character === "\r" && source[cursor + 1] === "\n" ? 2 : 1;
      const contentStart = getSoftInlineMathContinuation(source, cursor, breakLength, container);
      if (contentStart === null) return null;
      formulaParts.push(source.slice(segmentStart, cursor), source.slice(cursor, cursor + breakLength));
      cursor = contentStart;
      segmentStart = contentStart;
      continue;
    }
    if (character !== "$" || isEscapedAt(source, cursor)) {
      cursor += 1;
      continue;
    }
    if (/\s/.test(source[cursor - 1] ?? "") || /\d/.test(source[cursor + 1] ?? "")) {
      return null;
    }
    const end = cursor + 1;
    return {
      start,
      end,
      raw: source.slice(start, end),
      formula: formulaParts.join("") + source.slice(segmentStart, cursor),
    };
  }
  return null;
}

function getSoftInlineMathContinuation(
  source: string,
  start: number,
  length: number,
  container: InlineMathContainer,
): number | null {
  let trailingSpaces = 0;
  for (let cursor = start - 1; cursor >= 0 && source[cursor] === " "; cursor -= 1) {
    trailingSpaces += 1;
  }
  if (trailingSpaces >= 2) return null;
  const previous = start - trailingSpaces - 1;
  if (source[previous] === "\\" && !isEscapedAt(source, previous)) return null;

  const nextStart = start + length;
  if (nextStart >= source.length || source[nextStart] === "\r" || source[nextStart] === "\n") {
    return null;
  }
  const nextBreak = source.indexOf("\n", nextStart);
  const nextEnd = nextBreak < 0 ? source.length : nextBreak;
  const nextLine = source.slice(nextStart, nextEnd).replace(/\r$/, "");
  if (!nextLine.trim()) return null;

  const quoteEnd = stripQuotePrefix(nextLine, container.quoteDepth);
  if (quoteEnd === null) return null;
  const contentOffset = stripListContinuationIndent(nextLine, quoteEnd, container.listIndent);
  const content = nextLine.slice(contentOffset);
  if (!content.trim() || isMarkdownCodeIndented(content)) return null;
  if (
    readDollarMathBlockOpening(content)
    || /^[ \t]{0,3}(?:#{1,6}(?:[ \t]+|$)|>|`{3,}|~{3,}|(?:[-+*]|\d+[.)])[ \t]+|\\\[[ \t]*$)/.test(content)
  ) {
    return null;
  }
  return nextStart + contentOffset;
}

function getInlineMathContainer(source: string, start: number): InlineMathContainer {
  const lineStart = Math.max(0, source.lastIndexOf("\n", start - 1) + 1);
  const before = source.slice(lineStart, start);
  const quote = readMarkdownBlockquotePrefix(before);
  const cursor = quote?.raw.length ?? 0;
  const quoteDepth = quote?.depth ?? 0;
  const list = before.slice(cursor).match(/^([ \t]*)(?:[-+*]|\d+[.)])[ \t]{1,4}/)?.[0];
  return {
    quoteDepth,
    listIndent: list && getMarkdownIndentWidth(list.match(/^[ \t]*/)?.[0] ?? "") <= 3
      ? getMarkdownIndentWidth(list)
      : null,
  };
}

function stripQuotePrefix(line: string, depth: number): number | null {
  if (depth === 0) return 0;
  const quote = readMarkdownBlockquotePrefix(line, depth);
  if (!quote) return 0;
  return quote.depth === depth ? quote.raw.length : null;
}

function stripListContinuationIndent(line: string, start: number, width: number | null): number {
  if (width === null) return start;
  let cursor = start;
  let consumed = 0;
  while (cursor < line.length && (line[cursor] === " " || line[cursor] === "\t") && consumed < width) {
    consumed += line[cursor] === "\t" ? 4 - (consumed % 4) : 1;
    cursor += 1;
  }
  return consumed >= width ? cursor : start;
}

function isEscapedAt(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

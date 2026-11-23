export interface CjkUnderscoreEmphasisSyntax {
  kind: "emphasis" | "strong";
  start: number;
  end: number;
  contentStart: number;
  contentEnd: number;
  markerLength: 1 | 2;
}

export interface HighlightSyntax {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
}

export type StrikethroughSyntax = HighlightSyntax;

export interface InlineStyleProtectedRange {
  from: number;
  to: number;
}

export function readCjkUnderscoreEmphasis(
  source: string,
  start: number,
  limit = source.length,
): CjkUnderscoreEmphasisSyntax | null {
  if (start < 0 || start >= limit || source[start] !== "_" || isEscapedAt(source, start)) {
    return null;
  }
  if (source[start - 1] === "_") return null;
  if (isAsciiWordCharacter(source[start - 1])) return null;

  const markerLength: 1 | 2 = source[start + 1] === "_" ? 2 : 1;
  if (source[start + markerLength] === "_") return null;
  const contentStart = start + markerLength;
  if (contentStart >= limit || isMarkdownWhitespace(source[contentStart])) return null;

  let cursor = contentStart;
  while (cursor < limit) {
    const close = source.indexOf("_", cursor);
    if (close < 0 || close >= limit) return null;
    if (isEscapedAt(source, close)) {
      cursor = close + 1;
      continue;
    }

    let runLength = 1;
    while (close + runLength < limit && source[close + runLength] === "_") {
      runLength += 1;
    }
    if (runLength !== markerLength || isMarkdownWhitespace(source[close - 1])) {
      cursor = close + runLength;
      continue;
    }

    const afterClose = source[close + markerLength];
    if (isAsciiWordCharacter(afterClose)) {
      cursor = close + markerLength;
      continue;
    }
    if (!isCjkCharacter(source[start - 1]) && !isCjkCharacter(afterClose)) {
      return null;
    }

    return {
      kind: markerLength === 2 ? "strong" : "emphasis",
      start,
      end: close + markerLength,
      contentStart,
      contentEnd: close,
      markerLength,
    };
  }

  return null;
}

export function collectCjkUnderscoreEmphasis(
  source: string,
): CjkUnderscoreEmphasisSyntax[] {
  const result: CjkUnderscoreEmphasisSyntax[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const syntax = readCjkUnderscoreEmphasis(source, index);
    if (!syntax) continue;
    result.push(syntax);
    index = syntax.end - 1;
  }
  return result;
}

export function collectHighlightSyntax(
  source: string,
  offset = 0,
  protectedRanges: readonly InlineStyleProtectedRange[] = [],
): HighlightSyntax[] {
  return collectPairedInlineStyleSyntax(source, "=", offset, protectedRanges);
}

export function collectStrikethroughSyntax(
  source: string,
  offset = 0,
  protectedRanges: readonly InlineStyleProtectedRange[] = [],
): StrikethroughSyntax[] {
  return collectPairedInlineStyleSyntax(source, "~", offset, protectedRanges);
}

interface InlineStyleDelimiter {
  from: number;
  to: number;
}

function collectPairedInlineStyleSyntax(
  source: string,
  marker: "=" | "~",
  offset: number,
  protectedRanges: readonly InlineStyleProtectedRange[],
): HighlightSyntax[] {
  const openers: InlineStyleDelimiter[] = [];
  const result: HighlightSyntax[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const runStart = source.indexOf(marker, cursor);
    if (runStart < 0) break;
    let runEnd = runStart + 1;
    while (source[runEnd] === marker) runEnd += 1;
    cursor = runEnd;

    const delimiterStart = isEscapedAt(source, runStart) ? runStart + 1 : runStart;
    const pairCount = Math.floor((runEnd - delimiterStart) / 2);
    if (pairCount === 0) continue;
    if (protectedRanges.some((range) => rangesIntersect(
      offset + delimiterStart,
      offset + runEnd,
      range.from,
      range.to,
    ))) {
      continue;
    }

    const { canOpen, canClose } = getDelimiterFlanking(source, delimiterStart, runEnd);
    const closeCount = canClose ? Math.min(pairCount, openers.length) : 0;
    for (let index = 0; index < closeCount; index += 1) {
      const opener = openers.pop();
      if (!opener) break;
      const closerFrom = delimiterStart + index * 2;
      result.push({
        from: offset + opener.from,
        to: offset + closerFrom + 2,
        contentFrom: offset + opener.to,
        contentTo: offset + closerFrom,
      });
    }

    if (!canOpen) continue;
    const openCount = pairCount - closeCount;
    const firstOpener = runEnd - openCount * 2;
    for (let index = 0; index < openCount; index += 1) {
      const from = firstOpener + index * 2;
      openers.push({ from, to: from + 2 });
    }
  }

  return result
    .filter((syntax) => syntax.contentTo > syntax.contentFrom)
    .sort((left, right) => left.from - right.from || right.to - left.to);
}

function getDelimiterFlanking(
  source: string,
  runStart: number,
  runEnd: number,
): { canOpen: boolean; canClose: boolean } {
  const previous = source[runStart - 1];
  const next = source[runEnd];
  const previousWhitespace = isMarkdownWhitespace(previous);
  const nextWhitespace = isMarkdownWhitespace(next);
  const previousPunctuation = isMarkdownPunctuation(previous);
  const nextPunctuation = isMarkdownPunctuation(next);
  return {
    canOpen: !nextWhitespace && (!nextPunctuation || previousWhitespace || previousPunctuation),
    canClose: !previousWhitespace && (!previousPunctuation || nextWhitespace || nextPunctuation),
  };
}

function isCjkCharacter(character: string | undefined): boolean {
  return character !== undefined
    && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character);
}

function isAsciiWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_]/.test(character);
}

function isMarkdownWhitespace(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character);
}

function isMarkdownPunctuation(character: string | undefined): boolean {
  return character !== undefined && /[\p{P}\p{S}]/u.test(character);
}

function isEscapedAt(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function rangesIntersect(from: number, to: number, otherFrom: number, otherTo: number): boolean {
  return from < otherTo && to > otherFrom;
}

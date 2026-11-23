import MarkdownIt from "markdown-it";
import { getEmojiShortcodeMatches } from "./markdown";

export type RenderedSourceSyntax = "markdown" | "markdown-visible" | "html";

interface SourceTextProjection {
  text: string;
  boundaries: number[];
}

interface TextAlignment {
  source: number;
  rendered: number;
}

interface GraphemeSegment {
  index: number;
  segment: string;
}

interface GraphemeSegmenter {
  segment: (value: string) => Iterable<GraphemeSegment>;
}

type GraphemeSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => GraphemeSegmenter;

const htmlEntityUtils = new MarkdownIt("zero").utils;
const combiningMarkPattern = /^\p{Mark}$/u;
let cachedSegmenterConstructor: GraphemeSegmenterConstructor | undefined;
let cachedSegmenter: GraphemeSegmenter | null = null;

export function mapRenderedTextOffsetToSource(
  source: string,
  renderedText: string,
  renderedOffset: number,
  syntax: RenderedSourceSyntax = "markdown",
  emojiEnabled = true,
): number {
  const boundaries = mapRenderedTextBoundariesToSource(
    source,
    renderedText,
    syntax,
    emojiEnabled,
  );
  return boundaries[clamp(renderedOffset, 0, renderedText.length)] ?? source.length;
}

export function mapRenderedTextBoundariesToSource(
  source: string,
  renderedText: string,
  syntax: RenderedSourceSyntax = "markdown",
  emojiEnabled = true,
): number[] {
  const projection = syntax === "html"
    ? projectHtmlVisibleText(source)
    : syntax === "markdown-visible"
      ? projectMarkdownVisibleText(source, emojiEnabled)
      : createIdentityProjection(source);
  if (projection.text.length === 0) {
    return Array.from({ length: renderedText.length + 1 }, () => 0);
  }
  return alignTextBoundaries(projection.text, renderedText).map(
    (projectedOffset) => projection.boundaries[projectedOffset] ?? source.length,
  );
}

export function getGraphemeBoundaries(value: string): number[] {
  const boundaries = [0];
  if (!value) return boundaries;

  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    for (const part of segmenter.segment(value)) {
      const start = clamp(part.index, 0, value.length);
      const end = clamp(start + part.segment.length, start, value.length);
      if (start > (boundaries.at(-1) ?? 0)) boundaries.push(start);
      if (end > (boundaries.at(-1) ?? 0)) boundaries.push(end);
    }
  } else {
    return getCodePointGraphemeBoundaries(value);
  }

  if ((boundaries.at(-1) ?? 0) < value.length) boundaries.push(value.length);
  return boundaries;
}

export function snapTextOffsetToGraphemeBoundary(value: string, offset: number): number {
  const target = clamp(offset, 0, value.length);
  const boundaries = getGraphemeBoundaries(value);
  let previous = boundaries[0] ?? 0;
  for (const boundary of boundaries) {
    if (boundary < target) {
      previous = boundary;
      continue;
    }
    return target - previous < boundary - target ? previous : boundary;
  }
  return value.length;
}

export function mapUnwrappedTextOffsetToSource(
  source: string,
  unwrappedText: string,
  unwrappedOffset: number,
): number {
  if (!source || !unwrappedText) return 0;
  const target = clamp(unwrappedOffset, 0, unwrappedText.length);
  const projection = projectLineSuffixText(source, unwrappedText);
  if (projection) return projection.boundaries[target] ?? source.length;
  return mapAlignedTextBoundary(source, unwrappedText, target);
}

function projectLineSuffixText(
  source: string,
  unwrappedText: string,
): SourceTextProjection | null {
  const sourceLines = collectProjectionLines(source);
  const unwrappedLines = collectProjectionLines(unwrappedText);
  if (sourceLines.length !== unwrappedLines.length) return null;

  const boundaries: number[] = [];
  let sourceCursor = 0;
  let unwrappedCursor = 0;
  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index]!;
    const unwrappedLine = unwrappedLines[index]!;
    if (!sourceLine.content.endsWith(unwrappedLine.content)) return null;

    const prefixLength = sourceLine.content.length - unwrappedLine.content.length;
    boundaries[unwrappedCursor] = sourceCursor + prefixLength;
    for (let offset = 0; offset < unwrappedLine.content.length; offset += 1) {
      boundaries[unwrappedCursor + offset + 1] = sourceCursor + prefixLength + offset + 1;
    }
    unwrappedCursor += unwrappedLine.content.length;

    if (unwrappedLine.ending) {
      for (let offset = 0; offset < unwrappedLine.ending.length; offset += 1) {
        boundaries[unwrappedCursor + offset + 1] = sourceCursor
          + sourceLine.content.length
          + Math.round(
            (sourceLine.ending.length * (offset + 1)) / unwrappedLine.ending.length,
          );
      }
      unwrappedCursor += unwrappedLine.ending.length;
    }
    sourceCursor += sourceLine.content.length + sourceLine.ending.length;
  }
  return { text: unwrappedText, boundaries };
}

function collectProjectionLines(value: string): Array<{ content: string; ending: string }> {
  const lines: Array<{ content: string; ending: string }> = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (!match[0] && match.index === value.length) break;
    lines.push({ content: match[1] ?? "", ending: match[2] ?? "" });
    if (!match[2]) break;
  }
  return lines;
}
function projectMarkdownVisibleText(source: string, emojiEnabled: boolean): SourceTextProjection {
  let text = "";
  const boundaries: number[] = [];
  const emojiByStart = new Map(
    (emojiEnabled ? getEmojiShortcodeMatches(source) : []).map((match) => [match.start, match]),
  );
  let cursor = 0;

  const append = (value: string, sourceFrom: number, sourceTo: number, atomic = false) => {
    if (!value) return;
    if (boundaries.length === 0) boundaries.push(sourceFrom);
    const sourceLength = sourceTo - sourceFrom;
    for (let index = 0; index < value.length; index += 1) {
      text += value[index];
      boundaries.push(atomic
        ? (index === value.length - 1 ? sourceTo : sourceFrom)
        : sourceFrom + Math.round((sourceLength * (index + 1)) / value.length));
    }
  };

  while (cursor < source.length) {
    const entity = !isEscapedAt(source, cursor)
      ? source.slice(cursor).match(/^&(?:#[xX][\dA-Fa-f]+|#\d+|[A-Za-z][\w]+);/)
      : null;
    if (entity) {
      const raw = entity[0];
      const decoded = htmlEntityUtils.unescapeAll(raw);
      append(decoded, cursor, cursor + raw.length, decoded !== raw);
      cursor += raw.length;
      continue;
    }

    const emoji = emojiByStart.get(cursor);
    if (emoji) {
      append(emoji.value, emoji.start, emoji.end, true);
      cursor = emoji.end;
      continue;
    }

    append(source[cursor] ?? "", cursor, cursor + 1);
    cursor += 1;
  }

  return { text, boundaries };
}

function isEscapedAt(source: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function createIdentityProjection(source: string): SourceTextProjection {
  return {
    text: source,
    boundaries: Array.from({ length: source.length + 1 }, (_, index) => index),
  };
}

function projectHtmlVisibleText(source: string): SourceTextProjection {
  let text = "";
  const boundaries: number[] = [];
  let cursor = 0;
  let visibleStart = 0;

  const appendVisibleRange = (from: number, to: number) => {
    let rangeCursor = from;
    while (rangeCursor < to) {
      const entity = source.slice(rangeCursor, to).match(/^&(?:#[xX][\dA-Fa-f]+|#\d+|[A-Za-z][\w]+);/);
      if (entity) {
        const raw = entity[0];
        const decoded = htmlEntityUtils.unescapeAll(raw);
        appendProjectedText(decoded, rangeCursor, rangeCursor + raw.length);
        rangeCursor += raw.length;
        continue;
      }
      appendProjectedText(source[rangeCursor] ?? "", rangeCursor, rangeCursor + 1);
      rangeCursor += 1;
    }
  };

  const appendProjectedText = (value: string, sourceFrom: number, sourceTo: number) => {
    if (!value) return;
    if (boundaries.length === 0) boundaries.push(sourceFrom);
    else if (sourceFrom > (boundaries.at(-1) ?? sourceFrom)) boundaries[boundaries.length - 1] = sourceFrom;
    const sourceLength = sourceTo - sourceFrom;
    for (let index = 0; index < value.length; index += 1) {
      text += value[index];
      boundaries.push(sourceFrom + Math.round((sourceLength * (index + 1)) / value.length));
    }
  };

  while (cursor < source.length) {
    if (source[cursor] !== "<") {
      cursor += 1;
      continue;
    }
    const tagEnd = findHtmlTagEnd(source, cursor);
    if (tagEnd === null) {
      cursor += 1;
      continue;
    }
    appendVisibleRange(visibleStart, cursor);
    cursor = tagEnd;
    visibleStart = cursor;
  }
  appendVisibleRange(visibleStart, source.length);

  return { text, boundaries };
}

function findHtmlTagEnd(source: string, from: number): number | null {
  if (source.startsWith("<!--", from)) {
    const commentEnd = source.indexOf("-->", from + 4);
    return commentEnd < 0 ? null : commentEnd + 3;
  }
  if (!/^<\/?[A-Za-z][\w:-]*(?:\s|\/?>)/.test(source.slice(from))) return null;
  let quote = "";
  for (let index = from + 1; index < source.length; index += 1) {
    const character = source[index] ?? "";
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index + 1;
  }
  return null;
}

function mapAlignedTextBoundary(source: string, rendered: string, target: number): number {
  return alignTextBoundaries(source, rendered)[clamp(target, 0, rendered.length)] ?? source.length;
}

function alignTextBoundaries(source: string, rendered: string): number[] {
  const boundaries = new Array<number>(rendered.length + 1);
  if (rendered.length === 0) return [0];
  let sourceCursor = 0;
  let renderedCursor = 0;

  const fillExactRange = (
    sourceFrom: number,
    renderedFrom: number,
    renderedTo: number,
  ) => {
    for (let offset = renderedFrom; offset <= renderedTo; offset += 1) {
      if (boundaries[offset] === undefined) {
        boundaries[offset] = sourceFrom + (offset - renderedFrom);
      }
    }
  };

  const fillInterpolatedRange = (
    sourceFrom: number,
    sourceTo: number,
    renderedFrom: number,
    renderedTo: number,
  ) => {
    if (renderedTo <= renderedFrom) return;
    for (let offset = renderedFrom; offset <= renderedTo; offset += 1) {
      if (boundaries[offset] !== undefined) continue;
      const ratio = (offset - renderedFrom) / (renderedTo - renderedFrom);
      boundaries[offset] = sourceFrom + Math.round((sourceTo - sourceFrom) * ratio);
    }
  };

  while (sourceCursor < source.length || renderedCursor < rendered.length) {
    if (source[sourceCursor] === rendered[renderedCursor]) {
      const sourceStart = sourceCursor;
      const renderedStart = renderedCursor;
      while (
        sourceCursor < source.length
        && renderedCursor < rendered.length
        && source[sourceCursor] === rendered[renderedCursor]
      ) {
        sourceCursor += 1;
        renderedCursor += 1;
      }
      fillExactRange(sourceStart, renderedStart, renderedCursor);
      continue;
    }

    const alignment = findNextTextAlignment(source, rendered, sourceCursor, renderedCursor);
    const sourceEnd = alignment?.source ?? source.length;
    const renderedEnd = alignment?.rendered ?? rendered.length;
    fillInterpolatedRange(sourceCursor, sourceEnd, renderedCursor, renderedEnd);
    sourceCursor = sourceEnd;
    renderedCursor = renderedEnd;
  }

  let previous = 0;
  for (let offset = 0; offset < boundaries.length; offset += 1) {
    if (boundaries[offset] === undefined) boundaries[offset] = previous;
    else previous = boundaries[offset]!;
  }
  return boundaries;
}

function getCodePointGraphemeBoundaries(value: string): number[] {
  const boundaries = [0];
  let offset = 0;
  let joinsNext = false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    const extendsPrevious = offset > 0 && (
      joinsNext
      || codePoint === 0x200d
      || combiningMarkPattern.test(character)
      || isVariationSelector(codePoint)
      || isEmojiModifier(codePoint)
    );
    offset += character.length;
    if (extendsPrevious) boundaries[boundaries.length - 1] = offset;
    else boundaries.push(offset);
    joinsNext = codePoint === 0x200d;
  }
  return boundaries;
}

function isVariationSelector(codePoint: number): boolean {
  return (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  );
}

function isEmojiModifier(codePoint: number): boolean {
  return codePoint >= 0x1f3fb && codePoint <= 0x1f3ff;
}

function getGraphemeSegmenter(): GraphemeSegmenter | null {
  const constructor = (
    Intl as typeof Intl & { Segmenter?: GraphemeSegmenterConstructor }
  ).Segmenter;
  if (constructor !== cachedSegmenterConstructor) {
    cachedSegmenterConstructor = constructor;
    cachedSegmenter = constructor
      ? new constructor(undefined, { granularity: "grapheme" })
      : null;
  }
  return cachedSegmenter;
}

function findNextTextAlignment(
  source: string,
  rendered: string,
  sourceFrom: number,
  renderedFrom: number,
): TextAlignment | null {
  let best: (TextAlignment & { common: number; distance: number }) | null = null;

  for (let sourceIndex = sourceFrom; sourceIndex < source.length; sourceIndex += 1) {
    let renderedIndex = rendered.indexOf(source[sourceIndex] ?? "", renderedFrom);
    while (renderedIndex >= 0) {
      if (sourceIndex !== sourceFrom || renderedIndex !== renderedFrom) {
        let common = 0;
        while (
          sourceIndex + common < source.length
          && renderedIndex + common < rendered.length
          && source[sourceIndex + common] === rendered[renderedIndex + common]
        ) {
          common += 1;
        }
        const distance = (sourceIndex - sourceFrom) + (renderedIndex - renderedFrom);
        if (
          !best
          || distance < best.distance
          || (distance === best.distance && common > best.common)
        ) {
          best = { source: sourceIndex, rendered: renderedIndex, common, distance };
        }
      }
      renderedIndex = rendered.indexOf(source[sourceIndex] ?? "", renderedIndex + 1);
    }
  }

  return best ? { source: best.source, rendered: best.rendered } : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

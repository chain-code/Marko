import {
  readMarkdownInlineLink,
  readMarkdownReferenceLink,
  readMarkdownShortcutReferenceLink,
} from "./markdownLinks";
import { readInlineDollarMath } from "./mathSyntax";

export interface InlineMarkdownSyntax {
  type: "link" | "image";
  start: number;
  end: number;
  raw: string;
  label: string;
}

export interface InlineMathSyntax {
  type: "math";
  start: number;
  end: number;
  raw: string;
  formula: string;
}

export interface InlineMathCollectionOptions {
  includeLinkLabels?: boolean;
}

export interface FootnoteReferenceSyntax {
  type: "footnote";
  start: number;
  end: number;
  raw: string;
  id: string;
  inline?: boolean;
}

export interface InlineHtmlSyntax {
  type: "html";
  start: number;
  end: number;
  raw: string;
}

interface InlineHtmlToken {
  kind: "open" | "close" | "standalone";
  name: string;
  start: number;
  end: number;
}

const HTML_VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function collectInlineMarkdownSyntax(source: string): InlineMarkdownSyntax[] {
  const protectedRanges = [
    ...collectCodeSpanRanges(source),
    ...collectInlineHtmlMarkupRanges(source),
  ];
  const syntax: InlineMarkdownSyntax[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const open = source.indexOf("[", cursor);
    if (open < 0) break;
    if (isEscapedAt(source, open) || isInsideRange(open, open + 1, protectedRanges)) {
      cursor = open + 1;
      continue;
    }
    const link = readMarkdownInlineLink(source, open)
      ?? readMarkdownReferenceLink(source, open)
      ?? readMarkdownShortcutReferenceLink(source, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    syntax.push(toInlineSyntax(source, link));
    if (link.imageStart === null) {
      syntax.push(...collectLinkedImages(source, link.labelStart, link.labelEnd, protectedRanges));
    }
    cursor = link.end;
  }

  return syntax;
}

export function collectInlineMathSyntax(
  source: string,
  options: InlineMathCollectionOptions = {},
): InlineMathSyntax[] {
  const protectedRanges = collectProtectedInlineRanges(source, false, options.includeLinkLabels);
  const result: InlineMathSyntax[] = [];
  let lineStart = 0;

  while (lineStart <= source.length) {
    const lineEnd = source.indexOf("\n", lineStart);
    const end = lineEnd < 0 ? source.length : lineEnd;
    const line = source.slice(lineStart, end).replace(/\r$/, "");
    collectParenthesizedMath(line, lineStart, protectedRanges, result);
    if (lineEnd < 0) break;
    lineStart = lineEnd + 1;
  }
  collectDollarMath(source, 0, protectedRanges, result);

  return result.sort((left, right) => left.start - right.start || left.end - right.end);
}

export function collectFootnoteReferenceSyntax(source: string): FootnoteReferenceSyntax[] {
  const protectedRanges = collectProtectedInlineRanges(source, true);
  const result: FootnoteReferenceSyntax[] = [];
  const pattern = /\[\^([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source))) {
    const start = match.index;
    const end = start + match[0].length;
    if (isEscapedAt(source, start) || isInsideRange(start, end, protectedRanges)) continue;
    const lineStart = Math.max(0, source.lastIndexOf("\n", start - 1) + 1);
    const before = source.slice(lineStart, start);
    if (isFootnoteDefinitionLabel(before, source[end])) continue;
    result.push({
      type: "footnote",
      start,
      end,
      raw: match[0],
      id: match[1],
    });
  }

  let cursor = 0;
  while (cursor < source.length - 2) {
    const open = source.indexOf("^[", cursor);
    if (open < 0) break;
    if (isEscapedAt(source, open) || isInsideRange(open, open + 2, protectedRanges)) {
      cursor = open + 2;
      continue;
    }

    const close = findInlineFootnoteClose(source, open + 2);
    if (close < 0) {
      cursor = open + 2;
      continue;
    }

    const end = close + 1;
    if (!isInsideRange(open, end, protectedRanges)) {
      result.push({
        type: "footnote",
        start: open,
        end,
        raw: source.slice(open, end),
        id: source.slice(open + 2, close),
        inline: true,
      });
    }
    cursor = end;
  }

  return result.sort((left, right) => left.start - right.start || left.end - right.end);
}

function isFootnoteDefinitionLabel(before: string, nextCharacter: string | undefined): boolean {
  if (nextCharacter !== ":") return false;
  let content = before.replace(/^(?: {0,3}>[ \t]?)+/, "");
  for (let depth = 0; depth < 16; depth += 1) {
    const marker = content.match(/^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]{1,4}/);
    if (!marker) break;
    content = content.slice(marker[0].length);
  }
  return /^[ \t]{0,3}$/.test(content);
}

function findInlineFootnoteClose(source: string, from: number): number {
  let depth = 1;
  for (let index = from; index < source.length; index += 1) {
    if (isEscapedAt(source, index)) continue;
    if (source[index] === "[") {
      depth += 1;
    } else if (source[index] === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function collectInlineHtmlSyntax(source: string): InlineHtmlSyntax[] {
  const protectedRanges = collectCodeSpanRanges(source);
  const candidates: Array<{ start: number; end: number }> = [];
  collectInlineHtmlFromSource(source, protectedRanges, candidates);

  candidates.sort((left, right) => left.start - right.start || right.end - left.end);
  const outermost: Array<{ start: number; end: number }> = [];
  let coveredUntil = -1;
  for (const candidate of candidates) {
    if (candidate.end <= coveredUntil) continue;
    outermost.push(candidate);
    coveredUntil = candidate.end;
  }

  return outermost.map(({ start, end }) => ({
    type: "html",
    start,
    end,
    raw: source.slice(start, end),
  }));
}

export function collectInlineHtmlMarkupRanges(source: string): Array<{ start: number; end: number }> {
  const protectedRanges = collectCodeSpanRanges(source);
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (isEscapedAt(source, start) || isInsideRange(start, start + 1, protectedRanges)) {
      cursor = start + 1;
      continue;
    }

    const token = readInlineHtmlToken(source, start, source.length);
    if (!token) {
      cursor = start + 1;
      continue;
    }

    ranges.push({ start: token.start, end: token.end });
    cursor = token.end;
  }

  return ranges;
}

function collectInlineHtmlFromSource(
  source: string,
  protectedRanges: Array<{ start: number; end: number }>,
  candidates: Array<{ start: number; end: number }>,
) {
  const openTags: InlineHtmlToken[] = [];
  let cursor = 0;
  let previousTokenEnd = 0;

  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (/\r?\n[ \t]*\r?\n/.test(source.slice(previousTokenEnd, start))) {
      openTags.length = 0;
    }
    if (isEscapedAt(source, start) || isInsideRange(start, start + 1, protectedRanges)) {
      cursor = start + 1;
      continue;
    }

    const token = readInlineHtmlToken(source, start, source.length);
    if (!token) {
      cursor = start + 1;
      continue;
    }

    if (token.kind === "standalone") {
      candidates.push({ start: token.start, end: token.end });
      if (token.name === "") protectedRanges.push({ start: token.start, end: token.end });
    } else if (token.kind === "open") {
      openTags.push(token);
    } else {
      const openIndex = findLastOpenTagIndex(openTags, token.name);
      if (openIndex >= 0) {
        candidates.push({ start: openTags[openIndex].start, end: token.end });
        openTags.splice(openIndex);
      }
    }
    previousTokenEnd = token.end;
    cursor = token.end;
  }
}

function readInlineHtmlToken(source: string, start: number, maximumEnd: number): InlineHtmlToken | null {
  const specialEnd = readInlineHtmlSpecialTokenEnd(source, start, source.length);
  if (specialEnd !== null) {
    return { kind: "standalone", name: "", start, end: specialEnd };
  }

  const paragraphBreak = source.slice(start, maximumEnd).match(/\r?\n[ \t]*\r?\n/);
  const tokenEnd = paragraphBreak?.index === undefined
    ? maximumEnd
    : start + paragraphBreak.index;

  let cursor = start + 1;
  let closing = false;
  if (source[cursor] === "/") {
    closing = true;
    cursor += 1;
  }
  if (!isAsciiLetter(source[cursor])) return null;

  const nameStart = cursor;
  cursor += 1;
  while (cursor < tokenEnd && isHtmlTagNameCharacter(source[cursor])) cursor += 1;
  const name = source.slice(nameStart, cursor).toLowerCase();

  if (closing) {
    while (cursor < tokenEnd && isInlineHtmlWhitespace(source[cursor])) cursor += 1;
    if (source[cursor] !== ">") return null;
    return { kind: "close", name, start, end: cursor + 1 };
  }

  while (cursor < tokenEnd) {
    if (source[cursor] === ">") {
      return {
        kind: HTML_VOID_TAGS.has(name) ? "standalone" : "open",
        name,
        start,
        end: cursor + 1,
      };
    }
    if (source[cursor] === "/" && source[cursor + 1] === ">") {
      return { kind: "standalone", name, start, end: cursor + 2 };
    }
    if (!isInlineHtmlWhitespace(source[cursor])) return null;

    while (cursor < tokenEnd && isInlineHtmlWhitespace(source[cursor])) cursor += 1;
    if (source[cursor] === ">") continue;
    if (source[cursor] === "/" && source[cursor + 1] === ">") continue;
    if (!isHtmlAttributeNameStart(source[cursor])) return null;

    cursor += 1;
    while (cursor < tokenEnd && isHtmlAttributeNameCharacter(source[cursor])) cursor += 1;
    const attributeEnd = cursor;
    while (cursor < tokenEnd && isInlineHtmlWhitespace(source[cursor])) cursor += 1;
    if (source[cursor] !== "=") {
      cursor = attributeEnd;
      continue;
    }

    cursor += 1;
    while (cursor < tokenEnd && isInlineHtmlWhitespace(source[cursor])) cursor += 1;
    const quote = source[cursor];
    if (quote === "\"" || quote === "'") {
      const valueEnd = source.indexOf(quote, cursor + 1);
      if (valueEnd < 0 || valueEnd >= tokenEnd) return null;
      cursor = valueEnd + 1;
      continue;
    }
    if (!isHtmlUnquotedAttributeValueCharacter(source[cursor])) return null;
    while (
      cursor < tokenEnd
      && isHtmlUnquotedAttributeValueCharacter(source[cursor])
      && !(source[cursor] === "/" && source[cursor + 1] === ">")
    ) cursor += 1;
  }

  return null;
}

function findLastOpenTagIndex(openTags: InlineHtmlToken[], name: string): number {
  for (let index = openTags.length - 1; index >= 0; index -= 1) {
    if (openTags[index].name === name) return index;
  }
  return -1;
}

function readInlineHtmlSpecialTokenEnd(source: string, start: number, lineEnd: number): number | null {
  const fragment = source.slice(start, lineEnd);
  const comment = fragment.match(/^(?:<!---?>|<!--(?:[^-]|-[^-]|--[^>])*-->)/)?.[0];
  if (comment) return start + comment.length;

  if (fragment.startsWith("<![CDATA[")) {
    const close = source.indexOf("]]>", start + 9);
    return close >= 0 && close < lineEnd ? close + 3 : null;
  }
  if (fragment.startsWith("<?")) {
    const close = source.indexOf("?>", start + 2);
    return close >= 0 && close < lineEnd ? close + 2 : null;
  }
  if (fragment.length >= 3 && fragment[1] === "!" && isAsciiLetter(fragment[2])) {
    const close = source.indexOf(">", start + 3);
    return close >= 0 && close < lineEnd ? close + 1 : null;
  }
  return null;
}

function isAsciiLetter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z]/.test(character);
}

function isHtmlTagNameCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9-]/.test(character);
}

function isHtmlAttributeNameStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_:]/.test(character);
}

function isHtmlAttributeNameCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9:._-]/.test(character);
}

function isInlineHtmlWhitespace(character: string | undefined): boolean {
  return character === " "
    || character === "\t"
    || character === "\r"
    || character === "\n"
    || character === "\f"
    || character === "\v";
}

function isHtmlUnquotedAttributeValueCharacter(character: string | undefined): boolean {
  return character !== undefined
    && character.charCodeAt(0) > 0x20
    && character !== "\""
    && character !== "'"
    && character !== "="
    && character !== "<"
    && character !== ">"
    && character !== "`";
}

function collectParenthesizedMath(
  line: string,
  offset: number,
  protectedRanges: Array<{ start: number; end: number }>,
  result: InlineMathSyntax[],
) {
  let cursor = 0;
  while (cursor < line.length - 3) {
    const open = line.indexOf("\\(", cursor);
    if (open < 0) break;
    if (isEscapedAt(line, open)) {
      cursor = open + 2;
      continue;
    }

    let close = line.indexOf("\\)", open + 2);
    while (close >= 0 && isEscapedAt(line, close)) {
      close = line.indexOf("\\)", close + 2);
    }
    if (close < 0) break;

    const start = offset + open;
    const end = offset + close + 2;
    const formula = line.slice(open + 2, close).trim();
    if (formula && !isInsideRange(start, end, protectedRanges)) {
      result.push({ type: "math", start, end, raw: line.slice(open, close + 2), formula });
    }
    cursor = close + 2;
  }
}

function collectDollarMath(
  line: string,
  offset: number,
  protectedRanges: Array<{ start: number; end: number }>,
  result: InlineMathSyntax[],
) {
  let cursor = 0;
  while (cursor < line.length - 2) {
    const open = line.indexOf("$", cursor);
    if (open < 0) break;
    const match = readInlineDollarMath(line, open);
    if (!match) {
      cursor = open + 1;
      continue;
    }

    const start = offset + match.start;
    const end = offset + match.end;
    if (!isInsideRange(start, end, protectedRanges)) {
      result.push({ type: "math", start, end, raw: match.raw, formula: match.formula });
    }
    cursor = match.end;
  }
}

function collectProtectedInlineRanges(
  source: string,
  keepFootnotes = false,
  includeLinkLabels = false,
): Array<{ start: number; end: number }> {
  const ranges = collectCodeSpanRanges(source);
  for (const syntax of collectInlineMarkdownSyntax(source)) {
    if (
      keepFootnotes
      && syntax.type === "link"
      && (syntax.raw.startsWith("[^") || source[syntax.start - 1] === "^")
    ) {
      continue;
    }
    if (includeLinkLabels && syntax.type === "link") {
      ranges.push(...collectMarkdownLinkNonLabelRanges(source, syntax));
      continue;
    }
    ranges.push({ start: syntax.start, end: syntax.end });
  }
  ranges.push(...collectInlineHtmlMarkupRanges(source));

  const htmlCodePattern = /<(pre|code|kbd|samp|script|style|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlCodePattern.exec(source))) {
    ranges.push({ start: htmlMatch.index, end: htmlMatch.index + htmlMatch[0].length });
  }
  return ranges;
}

function collectMarkdownLinkNonLabelRanges(
  source: string,
  syntax: InlineMarkdownSyntax,
): Array<{ start: number; end: number }> {
  const open = syntax.type === "image" ? syntax.start + 1 : syntax.start;
  const link = readMarkdownInlineLink(source, open)
    ?? readMarkdownReferenceLink(source, open)
    ?? readMarkdownShortcutReferenceLink(source, open);
  if (!link || syntax.type === "image") {
    return [{ start: syntax.start, end: syntax.end }];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  if (syntax.start < link.labelStart) {
    ranges.push({ start: syntax.start, end: link.labelStart });
  }
  if (link.labelEnd < syntax.end) {
    ranges.push({ start: link.labelEnd, end: syntax.end });
  }
  return ranges;
}

function collectCodeSpanRanges(source: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("`", cursor);
    if (open < 0) break;
    if (isEscapedAt(source, open)) {
      cursor = open + 1;
      continue;
    }
    let markerLength = 1;
    while (source[open + markerLength] === "`") markerLength += 1;
    const close = findClosingCodeSpan(source, open + markerLength, markerLength);
    if (close < 0) {
      cursor = open + markerLength;
      continue;
    }
    ranges.push({ start: open, end: close + markerLength });
    cursor = close + markerLength;
  }
  return ranges;
}

function findClosingCodeSpan(source: string, from: number, markerLength: number): number {
  let cursor = from;
  while (cursor < source.length) {
    const markerStart = source.indexOf("`", cursor);
    if (markerStart < 0) return -1;
    let length = 1;
    while (source[markerStart + length] === "`") length += 1;
    if (length === markerLength) return markerStart;
    cursor = markerStart + length;
  }
  return -1;
}

function isInsideRange(from: number, to: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => from < range.end && to > range.start);
}

function isEscapedAt(source: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function collectLinkedImages(
  source: string,
  start: number,
  end: number,
  protectedRanges: Array<{ start: number; end: number }>,
): InlineMarkdownSyntax[] {
  const images: InlineMarkdownSyntax[] = [];
  let cursor = start;
  while (cursor < end) {
    const open = source.indexOf("[", cursor);
    if (open < 0 || open >= end) break;
    if (isEscapedAt(source, open) || isInsideRange(open, open + 1, protectedRanges)) {
      cursor = open + 1;
      continue;
    }
    const image = readMarkdownInlineLink(source, open)
      ?? readMarkdownReferenceLink(source, open)
      ?? readMarkdownShortcutReferenceLink(source, open);
    if (!image || image.imageStart === null || image.end > end) {
      cursor = open + 1;
      continue;
    }
    images.push(toInlineSyntax(source, image));
    cursor = image.end;
  }
  return images;
}

function toInlineSyntax(
  source: string,
  link: ReturnType<typeof readMarkdownInlineLink> & {},
): InlineMarkdownSyntax {
  const start = link.imageStart ?? link.start;
  return {
    type: link.imageStart === null ? "link" : "image",
    start,
    end: link.end,
    raw: source.slice(start, link.end),
    label: link.label,
  };
}

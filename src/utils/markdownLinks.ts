import { isMarkdownPathLike } from "./markdownFiles";
import { getPreviewLinkAction } from "./previewLinks";

export interface MarkdownLinkRange {
  start: number;
  end: number;
  labelStart: number;
  labelEnd: number;
  destinationStart: number | null;
  destinationEnd: number | null;
  referenceLabel: string | null;
  imageStart: number | null;
  label: string;
}

export interface MarkdownLinkAtCursor {
  start: number;
  end: number;
  href: string;
  label: string;
  image: boolean;
}

export function replaceMarkdownLinkSyntax(
  value: string,
  replacement: (link: MarkdownLinkRange) => string,
): string {
  let result = "";
  let cursor = 0;

  while (cursor < value.length) {
    const open = value.indexOf("[", cursor);
    if (open < 0) {
      result += value.slice(cursor);
      break;
    }

    const link = readMarkdownInlineLink(value, open) ?? readMarkdownReferenceLink(value, open);
    if (!link) {
      result += value.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    result += value.slice(cursor, link.imageStart ?? link.start);
    result += replacement(link);
    cursor = link.end;
  }

  return result;
}

export function readMarkdownInlineLink(value: string, openBracket: number): MarkdownLinkRange | null {
  const closeBracket = findMarkdownLinkLabelEnd(value, openBracket + 1);
  if (closeBracket < 0 || value[closeBracket + 1] !== "(") return null;

  const end = findMarkdownLinkDestinationEnd(value, closeBracket + 2);
  if (end < 0) return null;

  return {
    start: openBracket,
    end,
    labelStart: openBracket + 1,
    labelEnd: closeBracket,
    destinationStart: closeBracket + 2,
    destinationEnd: end - 1,
    referenceLabel: null,
    imageStart: value[openBracket - 1] === "!" ? openBracket - 1 : null,
    label: value.slice(openBracket + 1, closeBracket),
  };
}

export function readMarkdownReferenceLink(value: string, openBracket: number): MarkdownLinkRange | null {
  const closeBracket = findMarkdownLinkLabelEnd(value, openBracket + 1);
  if (closeBracket < 0 || value[closeBracket + 1] !== "[") return null;

  const closeReference = findMarkdownLinkLabelEnd(value, closeBracket + 2);
  if (closeReference < 0) return null;

  return {
    start: openBracket,
    end: closeReference + 1,
    labelStart: openBracket + 1,
    labelEnd: closeBracket,
    destinationStart: null,
    destinationEnd: null,
    referenceLabel: value.slice(closeBracket + 2, closeReference),
    imageStart: value[openBracket - 1] === "!" ? openBracket - 1 : null,
    label: value.slice(openBracket + 1, closeBracket),
  };
}

export function readMarkdownShortcutReferenceLink(value: string, openBracket: number): MarkdownLinkRange | null {
  const closeBracket = findMarkdownLinkLabelEnd(value, openBracket + 1);
  if (closeBracket < 0) return null;
  const next = value[closeBracket + 1];
  if (next === "(" || next === "[" || next === ":") return null;

  return {
    start: openBracket,
    end: closeBracket + 1,
    labelStart: openBracket + 1,
    labelEnd: closeBracket,
    destinationStart: null,
    destinationEnd: null,
    referenceLabel: value.slice(openBracket + 1, closeBracket),
    imageStart: value[openBracket - 1] === "!" ? openBracket - 1 : null,
    label: value.slice(openBracket + 1, closeBracket),
  };
}

export function findMarkdownLinkAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownLinkAtCursor | null {
  const normalizedStart = Math.max(0, Math.min(selectionStart, selectionEnd));
  const normalizedEnd = Math.max(0, Math.max(selectionStart, selectionEnd));

  for (const link of collectMarkdownLinks(value)) {
    const linkStart = link.imageStart ?? link.start;
    if (!isSelectionInsideRange(normalizedStart, normalizedEnd, linkStart, link.end)) {
      continue;
    }

    const href = getMarkdownLinkHref(value, link);
    if (!href) {
      continue;
    }

    return {
      start: linkStart,
      end: link.end,
      href,
      label: link.label,
      image: link.imageStart !== null,
    };
  }

  return findBareLinkAtCursor(value, normalizedStart, normalizedEnd);
}

function collectMarkdownLinks(value: string): MarkdownLinkRange[] {
  const links: MarkdownLinkRange[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const open = value.indexOf("[", cursor);
    if (open < 0) break;

    const link = readMarkdownInlineLink(value, open)
      ?? readMarkdownReferenceLink(value, open)
      ?? readMarkdownShortcutReferenceLink(value, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    links.push(link);
    cursor = link.end;
  }
  return links;
}

function getMarkdownLinkHref(value: string, link: MarkdownLinkRange): string | null {
  if (link.destinationStart !== null && link.destinationEnd !== null) {
    return parseMarkdownLinkDestination(value.slice(link.destinationStart, link.destinationEnd));
  }

  const referenceLabel = link.referenceLabel || link.label;
  return findMarkdownReferenceHref(value, referenceLabel);
}

function parseMarkdownLinkDestination(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("<")) {
    const close = findUnescapedCharacter(trimmed, ">", 1);
    if (close < 0) return null;
    return trimmed.slice(1, close).trim() || null;
  }

  const split = findMarkdownDestinationTitleStart(trimmed);
  const href = split < 0 ? trimmed : trimmed.slice(0, split).trim();
  return href || null;
}

function findMarkdownReferenceHref(value: string, label: string): string | null {
  const normalizedLabel = normalizeReferenceLabel(label);
  if (!normalizedLabel) return null;

  const lines = value.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^[ \t]{0,3}\[([^\]\n]+)]:[ \t]*(.+?)\s*$/);
    if (!match || match[1].startsWith("^")) continue;
    if (normalizeReferenceLabel(match[1]) !== normalizedLabel) continue;
    return parseMarkdownLinkDestination(match[2]);
  }

  return null;
}

function findMarkdownDestinationTitleStart(value: string): number {
  let depth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (isEscapedAt(value, index)) continue;
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && /\s/.test(char)) {
      return index;
    }
  }
  return -1;
}

function findUnescapedCharacter(value: string, character: string, start: number): number {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === character && !isEscapedAt(value, index)) {
      return index;
    }
  }
  return -1;
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function isSelectionInsideRange(selectionStart: number, selectionEnd: number, rangeStart: number, rangeEnd: number): boolean {
  if (selectionStart === selectionEnd) {
    return selectionStart >= rangeStart && selectionStart <= rangeEnd;
  }
  return selectionStart >= rangeStart && selectionEnd <= rangeEnd;
}

function findBareLinkAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): MarkdownLinkAtCursor | null {
  if (selectionStart < 0 || selectionEnd > value.length) return null;

  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", selectionEnd);
  const lineEnd = nextLineBreak < 0 ? value.length : nextLineBreak;
  if (selectionEnd > lineEnd) return null;

  const line = value.slice(lineStart, lineEnd);
  const candidates = [
    ...collectAngleBareLinks(line, lineStart),
    ...collectPlainBareLinks(line, lineStart),
  ].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return right.end - left.end;
  });

  for (const candidate of candidates) {
    if (isSelectionInsideRange(selectionStart, selectionEnd, candidate.start, candidate.end)) {
      return candidate;
    }
  }

  return null;
}

function collectAngleBareLinks(line: string, lineOffset: number): MarkdownLinkAtCursor[] {
  const links: MarkdownLinkAtCursor[] = [];
  const angleLinkPattern = /<([^<>\s]+)>/g;
  for (const match of line.matchAll(angleLinkPattern)) {
    const href = match[1];
    if (!isSupportedBareHref(href)) continue;

    const start = lineOffset + (match.index ?? 0);
    links.push({
      start,
      end: start + match[0].length,
      href,
      label: href,
      image: false,
    });
  }

  return links;
}

function collectPlainBareLinks(line: string, lineOffset: number): MarkdownLinkAtCursor[] {
  const links: MarkdownLinkAtCursor[] = [];
  const tokenPattern = /[^\s<>"'`]+/g;
  for (const match of line.matchAll(tokenPattern)) {
    const token = match[0];
    const tokenStart = lineOffset + (match.index ?? 0);
    for (const startInToken of findBareHrefStarts(token)) {
      const raw = trimTrailingBareLinkPunctuation(token.slice(startInToken));
      if (!raw || !isSupportedBareHref(raw)) continue;

      links.push({
        start: tokenStart + startInToken,
        end: tokenStart + startInToken + raw.length,
        href: raw,
        label: raw,
        image: false,
      });
    }
  }

  return links;
}

function findBareHrefStarts(token: string): number[] {
  const starts = new Set<number>();
  collectPatternStarts(token, /[a-z][a-z0-9+.-]*:\/\//gi, starts);
  collectPatternStarts(token, /mailto:/gi, starts);
  collectPatternStarts(token, /\/\/(?=[^/\\])/g, starts, (index) => token[index - 1] !== ":");
  collectPatternStarts(token, /[A-Za-z]:(?:[\\/]|%5[cC]|%2[fF])/g, starts);
  collectPatternStarts(token, /\\\\(?=[^\\/])/g, starts);
  collectPatternStarts(token, /%5[cC]%5[cC](?=[^\\/])/g, starts);
  collectRelativeMarkdownPathStarts(token, starts);
  return [...starts].sort((left, right) => left - right);
}

function collectPatternStarts(
  value: string,
  pattern: RegExp,
  starts: Set<number>,
  include: (index: number) => boolean = () => true,
): void {
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (include(index)) starts.add(index);
  }
}

function collectRelativeMarkdownPathStarts(token: string, starts: Set<number>): void {
  for (let index = 0; index < token.length; index += 1) {
    if (!isRelativeMarkdownPathPrefix(token, index)) continue;
    const raw = trimTrailingBareLinkPunctuation(token.slice(index));
    if (isRelativeMarkdownHref(raw)) starts.add(index);
  }
}

function isRelativeMarkdownPathPrefix(token: string, index: number): boolean {
  const rest = token.slice(index);
  if (/^(?:\.{1,2}[\\/]|\/)/.test(rest)) return true;
  return /^[A-Za-z0-9_.-]+[\\/]/.test(rest);
}

function isSupportedBareHref(href: string): boolean {
  const action = getPreviewLinkAction(href);
  if (action === "blocked" || action === "none" || action === "anchor") return false;
  if (action === "external" || action === "local") return true;
  return isRelativeMarkdownHref(href);
}

function isRelativeMarkdownHref(href: string): boolean {
  if (getPreviewLinkAction(href) !== "relative") return false;
  const plainPath = stripBareHrefMetadata(href).replace(/\\/g, "/");
  return /^(?:\.{1,2}\/|\/|[A-Za-z0-9_.-]+\/)/.test(plainPath) && isMarkdownPathLike(plainPath);
}

function stripBareHrefMetadata(href: string): string {
  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const metadataIndexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  const end = metadataIndexes.length > 0 ? Math.min(...metadataIndexes) : href.length;
  return href.slice(0, end);
}

function trimTrailingBareLinkPunctuation(value: string): string {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (".,;:!?。，；：！？".includes(char)) {
      end -= 1;
      continue;
    }
    if (char === ")" && hasMoreClosingCharacters(value.slice(0, end), "(", ")")) {
      end -= 1;
      continue;
    }
    if (char === "]" && hasMoreClosingCharacters(value.slice(0, end), "[", "]")) {
      end -= 1;
      continue;
    }
    if (char === "}" && hasMoreClosingCharacters(value.slice(0, end), "{", "}")) {
      end -= 1;
      continue;
    }
    break;
  }

  return value.slice(0, end);
}

function hasMoreClosingCharacters(value: string, open: string, close: string): boolean {
  let openings = 0;
  let closings = 0;
  for (const char of value) {
    if (char === open) openings += 1;
    if (char === close) closings += 1;
  }
  return closings > openings;
}

function findMarkdownLinkLabelEnd(value: string, start: number): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (isEscapedAt(value, index)) continue;
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function findMarkdownLinkDestinationEnd(value: string, start: number): number {
  let depth = 0;
  let inAngle = false;
  let quote: "\"" | "'" | null = null;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (isEscapedAt(value, index)) continue;

    if (inAngle) {
      if (char === ">") inAngle = false;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === "<") {
      inAngle = true;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      if (depth === 0) return index + 1;
      depth -= 1;
    }
  }

  return -1;
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

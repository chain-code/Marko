export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regularExpression?: boolean;
}

export interface FindMatch {
  index: number;
  length: number;
  line: number;
  column: number;
  preview: string;
  text: string;
  groups: string[];
  namedGroups: Record<string, string>;
}

export interface ReplaceMatchResult {
  value: string;
  matches: FindMatch[];
  activeIndex: number;
}

const wordCharacterClass = "\\p{L}\\p{N}\\p{M}_";

export function findMatches(source: string, query: string, options: FindOptions): FindMatch[] {
  if (!query) return [];

  const flags = options.caseSensitive ? "g" : "gi";
  const sourcePattern = options.regularExpression ? query : escapeRegExp(query);
  const pattern = options.wholeWord
    ? `(?<![${wordCharacterClass}])(?:${sourcePattern})(?![${wordCharacterClass}])`
    : sourcePattern;
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, `${flags}u`);
  } catch {
    return [];
  }
  const matches: FindMatch[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source))) {
    matches.push(createFindMatch(source, match));
    if (match[0].length === 0) {
      regex.lastIndex = advanceUnicodeStringIndex(source, regex.lastIndex);
    }
  }

  return matches;
}

function advanceUnicodeStringIndex(source: string, index: number): number {
  if (index >= source.length) return index + 1;
  const first = source.charCodeAt(index);
  if (first < 0xD800 || first > 0xDBFF || index + 1 >= source.length) return index + 1;
  const second = source.charCodeAt(index + 1);
  return second >= 0xDC00 && second <= 0xDFFF ? index + 2 : index + 1;
}

export function findNextMatchIndex(matches: FindMatch[], cursor: number, direction: 1 | -1): number {
  if (matches.length === 0) return -1;

  if (direction > 0) {
    const next = matches.findIndex((match) => match.index >= cursor);
    return next >= 0 ? next : 0;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (matches[index].index < cursor) return index;
  }
  return matches.length - 1;
}

export function findInitialMatchIndex(matches: FindMatch[], selectionStart: number, selectionEnd: number): number {
  if (matches.length === 0) return -1;

  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(0, Math.max(selectionStart, selectionEnd));
  if (end > start) {
    const exact = matches.findIndex((match) => match.index === start && match.index + match.length === end);
    if (exact >= 0) return exact;

    const overlapping = matches.findIndex((match) => match.index < end && match.index + match.length > start);
    if (overlapping >= 0) return overlapping;
  }

  const next = matches.findIndex((match) => match.index >= end);
  return next >= 0 ? next : 0;
}

export function resolveFindActiveIndex(
  matches: FindMatch[],
  selectionStart: number,
  selectionEnd: number,
  previousActiveIndex: number,
  reanchorFromSelection = false,
): number {
  if (matches.length === 0) return -1;
  if (!reanchorFromSelection && previousActiveIndex >= 0 && previousActiveIndex < matches.length) {
    return previousActiveIndex;
  }
  return findInitialMatchIndex(matches, selectionStart, selectionEnd);
}

export function replaceMatch(source: string, match: FindMatch, replacement: string): string {
  return `${source.slice(0, match.index)}${replacement}${source.slice(match.index + match.length)}`;
}

export function replaceMatchAndFindNext(
  source: string,
  match: FindMatch,
  replacement: string,
  query: string,
  options: FindOptions,
): ReplaceMatchResult {
  const resolvedReplacement = options.regularExpression
    ? expandRegexReplacement(replacement, match, source)
    : replacement;
  const value = replaceMatch(source, match, resolvedReplacement);
  const matches = findMatches(value, query, options);
  const activeIndex = findNextMatchIndex(matches, match.index + resolvedReplacement.length, 1);
  return { value, matches, activeIndex };
}

export function replaceAllMatches(
  source: string,
  matches: FindMatch[],
  replacement: string,
  regularExpression = false,
): string {
  if (matches.length === 0) return source;

  let cursor = 0;
  const parts: string[] = [];
  for (const match of matches) {
    parts.push(
      source.slice(cursor, match.index),
      regularExpression ? expandRegexReplacement(replacement, match, source) : replacement,
    );
    cursor = match.index + match.length;
  }
  parts.push(source.slice(cursor));
  return parts.join("");
}

export function getFindQueryFromSelection(selectedText: string, currentQuery: string): string {
  if (!selectedText || /\r?\n/.test(selectedText)) return currentQuery;
  return selectedText;
}

function createFindMatch(source: string, match: RegExpExecArray): FindMatch {
  const index = match.index;
  const length = match[0].length;
  const before = source.slice(0, index);
  const line = before.split(/\r?\n/).length;
  const lineStart = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r")) + 1;
  const lineEnd = source.indexOf("\n", index);
  const rawLine = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd).trim();
  return {
    index,
    length,
    line,
    column: index - lineStart + 1,
    preview: rawLine.length > 120 ? `${rawLine.slice(0, 117)}...` : rawLine,
    text: match[0],
    groups: match.slice(1).map((value) => value ?? ""),
    namedGroups: { ...(match.groups ?? {}) },
  };
}

function expandRegexReplacement(replacement: string, match: FindMatch, source: string): string {
  return replacement.replace(/\$(\$|&|`|'|<[^>]+>|\d{1,2})/g, (token, reference: string) => {
    if (reference === "$") return "$";
    if (reference === "&") return match.text;
    if (reference === "`") return source.slice(0, match.index);
    if (reference === "'") return source.slice(match.index + match.length);
    if (reference.startsWith("<")) {
      const name = reference.slice(1, -1);
      return Object.prototype.hasOwnProperty.call(match.namedGroups, name) ? match.namedGroups[name] : token;
    }

    const groupIndex = Number(reference);
    if (groupIndex > 0 && groupIndex <= match.groups.length) {
      return match.groups[groupIndex - 1];
    }
    if (reference.length === 2) {
      const firstGroup = Number(reference[0]);
      if (firstGroup > 0 && firstGroup <= match.groups.length) {
        return `${match.groups[firstGroup - 1]}${reference[1]}`;
      }
    }
    return token;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

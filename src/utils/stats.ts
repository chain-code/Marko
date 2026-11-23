import type { DocumentStats, SelectionStats } from "@/types";
import { splitMarkdownBlocks } from "./editorBlocks";
import { replaceMarkdownLinkSyntax } from "./markdownLinks";
import { getPreviewLinkAction } from "./previewLinks";
import {
  isDollarMathBlockClosing,
  readDollarMathBlockOpening,
} from "./mathSyntax";
import { getYamlFrontMatterRange } from "./frontMatterSyntax";

export interface CursorPosition {
  line: number;
  column: number;
}

interface QuotePrefixInfo {
  rawLength: number;
  normalized: string;
}

type RawBlockOpening =
  | { kind: "code"; marker: string; quotePrefix: string; content: string }
  | { kind: "math"; marker: "$$" | "\\["; quotePrefix: string; content: string };

export interface WordCountDetailItem {
  label: string;
  value: string;
  unit: string;
}

export interface WordCountDetails {
  document: WordCountDetailItem[];
  selection: WordCountDetailItem[];
  position: WordCountDetailItem[];
}

export function calculateDocumentStats(markdown: string, readingSpeed = 350): DocumentStats {
  const plain = stripMarkdown(markdown);
  const chars = plain.replace(/\s/g, "").length;
  const englishWords = plain.match(/[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*/g)?.length ?? 0;
  const chineseChars = plain.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const paragraphs = countRenderedParagraphs(markdown);
  const words = englishWords + chineseChars;

  return {
    chars,
    words,
    paragraphs,
    readingMinutes: Math.max(1, Math.ceil(words / normalizeReadingSpeed(readingSpeed))),
  };
}

function normalizeReadingSpeed(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 350;
}

export function formatWordCountDetails(documentStats: DocumentStats, selectionStats: SelectionStats): WordCountDetails {
  return {
    document: [
      { label: "词数", value: formatStatNumber(documentStats.words), unit: "词" },
      { label: "字符", value: formatStatNumber(documentStats.chars), unit: "字符" },
      { label: "段落", value: formatStatNumber(documentStats.paragraphs), unit: "段" },
      { label: "阅读时间", value: formatStatNumber(documentStats.readingMinutes), unit: "分钟" },
    ],
    selection: [
      { label: "选区词数", value: formatStatNumber(selectionStats.words), unit: "词" },
      { label: "选区字符", value: formatStatNumber(selectionStats.chars), unit: "字符" },
      { label: "选区行数", value: formatStatNumber(selectionStats.lines), unit: "行" },
    ],
    position: [
      { label: "光标行", value: formatStatNumber(selectionStats.cursorLine), unit: "行" },
      { label: "光标列", value: formatStatNumber(selectionStats.cursorColumn), unit: "列" },
    ],
  };
}

function formatStatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.max(0, Math.trunc(value)).toLocaleString("zh-CN");
}

function countRenderedParagraphs(markdown: string): number {
  return splitMarkdownBlocks(stripYamlFrontMatter(markdown))
    .filter((block) => stripMarkdown(block.raw).trim()).length;
}

export function calculateSelectionStats(
  text: string,
  source = text,
  cursor = text.length,
  selectionStart = Math.max(0, cursor - text.length),
  selectionEnd = cursor,
): SelectionStats {
  const position = calculateCursorPosition(source, cursor);
  const normalizedSelectionStart = Math.max(0, Math.min(selectionStart, selectionEnd, source.length));
  const normalizedSelectionEnd = Math.max(0, Math.min(Math.max(selectionStart, selectionEnd), source.length));

  if (!text) {
    return {
      selectedText: "",
      selectionStart: normalizedSelectionStart,
      selectionEnd: normalizedSelectionEnd,
      chars: 0,
      words: 0,
      lines: 0,
      cursorLine: position.line,
      cursorColumn: position.column,
    };
  }

  const plain = stripMarkdown(text);
  const chars = plain.replace(/\s/g, "").length;
  const englishWords = plain.match(/[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*/g)?.length ?? 0;
  const chineseChars = plain.match(/[\u4e00-\u9fff]/g)?.length ?? 0;

  return {
    selectedText: text,
    selectionStart: normalizedSelectionStart,
    selectionEnd: normalizedSelectionEnd,
    chars,
    words: englishWords + chineseChars,
    lines: text.split(/\r?\n/).length,
    cursorLine: position.line,
    cursorColumn: position.column,
  };
}

export function calculateCursorPosition(source: string, cursor: number): CursorPosition {
  const safeCursor = Math.max(0, Math.min(cursor, source.length));
  const before = source.slice(0, safeCursor);
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: [...(lines.at(-1) ?? "")].length + 1,
  };
}

function stripMarkdown(markdown: string): string {
  const protectedCode = protectMarkdownCode(normalizeQuotedRawBlocks(stripYamlFrontMatter(markdown)));
  const visibleMarkdown = stripHiddenRawHtml(protectedCode.value);
  const withoutDefinitions = stripDefinitionListMarkers(stripMarkdownDefinitions(visibleMarkdown))
    .replace(/(^|\n)[ \t]{0,3}\$\$[ \t]*(?:\{[^\r\n]+\})?\r?\n([\s\S]*?)(?:\r?\n)?[ \t]{0,3}\$\$[ \t]*(?:\{[^\r\n]+\})?(?=\r?\n|$)/g, "$1 $2 ")
    .replace(/(^|\n)[ \t]{0,3}\\\[\s*\n?([\s\S]*?)\n?[ \t]{0,3}\\\](?=\n|$)/g, "$1 $2 ")
    .replace(/(^|[^\\])\\\(([^\n]+?)\\\)/g, "$1 $2 ")
    .replace(/(^|[^\\$])\$([^\n$]+?)\$(?!\$)/g, "$1 $2 ");
  const escapedMarkdown = protectMarkdownEscapes(withoutDefinitions);
  const withLinkLabels = replaceMarkdownLinkSyntax(
    escapedMarkdown.value,
    (link) => (link.imageStart === null ? link.label : " "),
  );
  const protectedAutolinks = protectRenderedAutolinks(withLinkLabels);

  const stripped = restoreProtectedSegments(
    decodeHtmlEntities(
      stripMarkdownTables(protectedAutolinks.value)
        .replace(/<[^>\n]+>/g, " "),
    ),
    protectedCode.segments,
  )
    .replace(/[#>*_~`=[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return restoreProtectedAutolinks(
    restoreMarkdownEscapes(stripped, escapedMarkdown.segments),
    protectedAutolinks.segments,
  );
}

function stripHiddenRawHtml(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title|template)\b[\s\S]*?<\/\1>/gi, " ");
}

function stripMarkdownDefinitions(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isFootnoteDefinitionLine(line)) {
      output.push("");
      let requiresIndentedContinuation = false;
      while (index + 1 < lines.length) {
        const next = lines[index + 1];
        if (!next.trim()) {
          if (hasFollowingFootnoteIndentedContinuationLine(lines, index + 2)) {
            output.push("");
            requiresIndentedContinuation = true;
            index += 1;
            continue;
          }
          break;
        }

        if (isFootnoteIndentedContinuationLine(next)) {
          output.push("");
          requiresIndentedContinuation = false;
          index += 1;
          continue;
        }

        if (!requiresIndentedContinuation && isFootnoteParagraphContinuationLine(next)) {
          output.push("");
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }

    if (isLinkReferenceDefinitionLine(line)) {
      output.push("");
      if (index + 1 < lines.length && isReferenceTitleContinuationLine(lines[index + 1])) {
        output.push("");
        index += 1;
      }
      continue;
    }

    if (isAbbreviationDefinitionLine(line)) {
      output.push("");
      continue;
    }

    output.push(line);
  }

  return output.join("\n");
}

function stripDefinitionListMarkers(markdown: string): string {
  const lines = markdown.split("\n");
  return lines
    .map((line, index) => {
      if (!isDefinitionListMarkerLine(lines, index)) return line;
      const context = getDefinitionListLineContext(line);
      return `${context.prefix}${context.content.replace(/^[ \t]{0,3}:(?:[ \t]+|$)/, "")}`;
    })
    .join("\n");
}

function isDefinitionListMarkerLine(lines: string[], index: number): boolean {
  const context = getDefinitionListLineContext(lines[index] ?? "");
  if (!/^[ \t]{0,3}:(?:[ \t]+|$)/.test(context.content)) return false;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previous = getDefinitionListLineContext(lines[cursor]);
    if (previous.key !== context.key || !previous.content.trim()) return false;
    if (/^[ \t]{0,3}:(?:[ \t]+|$)/.test(previous.content)) continue;
    return isDefinitionListTermLine(previous.content);
  }
  return false;
}

function getDefinitionListLineContext(line: string): { prefix: string; content: string; key: string } {
  const quote = parseQuotePrefix(line);
  if (!quote) return { prefix: "", content: line, key: "plain" };
  return {
    prefix: line.slice(0, quote.rawLength),
    content: line.slice(quote.rawLength),
    key: quote.normalized,
  };
}

function isDefinitionListTermLine(line: string): boolean {
  if (!line.trim()) return false;
  if (/^(?: {4,}|\t)/.test(line)) return false;
  return !/^[ \t]{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|(?:-{3,}|\+{3,}|\*{3,}|_{3,})\s*$|\[[^\]\n]+]:\s*\S|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|`{3,}|~{3,}|<)/.test(line);
}

function isFootnoteDefinitionLine(line: string): boolean {
  return /^ {0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:/.test(line);
}

function isLinkReferenceDefinitionLine(line: string): boolean {
  return /^ {0,3}\[[^\]\n]+]:\s*\S/.test(line);
}

function isAbbreviationDefinitionLine(line: string): boolean {
  return /^ {0,3}\*\[[^\]\n]+]:\s*\S/.test(getBlockquoteContent(line));
}

function getBlockquoteContent(line: string): string {
  const quote = parseQuotePrefix(line);
  return quote ? line.slice(quote.rawLength) : line;
}

function isReferenceTitleContinuationLine(line: string): boolean {
  return /^[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$/.test(line);
}

function hasFollowingFootnoteIndentedContinuationLine(lines: string[], startIndex: number): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    return isFootnoteIndentedContinuationLine(lines[index]);
  }
  return false;
}

function isFootnoteIndentedContinuationLine(line: string): boolean {
  return /^(?: {4,}| {0,3}\t)/.test(line);
}

function isFootnoteParagraphContinuationLine(line: string): boolean {
  if (!line.trim()) return false;
  if (isFootnoteIndentedContinuationLine(line)) return true;
  return !isFootnoteInterruptingBlockLine(line.replace(/^ {0,3}/, ""));
}

function isFootnoteInterruptingBlockLine(content: string): boolean {
  return Boolean(readDollarMathBlockOpening(content))
    || /^(?:#{1,6}\s|(?:[-*+]|\d+[.)])\s+|>\s?|`{3,}|~{3,}|\\\[\s*$|(?:-{3,}|\+{3,}|\*{3,}|_{3,})\s*$|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|\[[^\]\n]+]:\s*\S|<!--|<\/?[A-Za-z][^>\n]*>)/.test(content);
}

function isRenderedAutolink(href: string): boolean {
  const action = getPreviewLinkAction(href);
  return action === "external" || action === "local";
}

function protectRenderedAutolinks(markdown: string): { value: string; segments: string[] } {
  const segments: string[] = [];
  const value = markdown.replace(/<([^<>\s]+)>/g, (match, href: string) => {
    if (!isRenderedAutolink(href)) return " ";
    const placeholder = createAutolinkPlaceholder(segments.length);
    segments.push(href);
    return placeholder;
  });
  return { value, segments };
}

function createAutolinkPlaceholder(index: number): string {
  return `MARKOAUTOLINK${index}TOKEN`;
}

function restoreProtectedAutolinks(markdown: string, segments: string[]): string {
  return markdown.replace(/MARKOAUTOLINK(\d+)TOKEN/g, (match, index: string) => segments[Number(index)] ?? match);
}

function protectMarkdownEscapes(value: string): { value: string; segments: string[] } {
  const segments: string[] = [];
  return {
    value: value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, (_match, char: string) => {
      const token = `MARKOESCAPED${segments.length}TOKEN`;
      segments.push(char);
      return token;
    }),
    segments,
  };
}

function restoreMarkdownEscapes(value: string, segments: string[]): string {
  return value.replace(/MARKOESCAPED(\d+)TOKEN/g, (match, index: string) => segments[Number(index)] ?? match);
}

function normalizeQuotedRawBlocks(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const opening = getQuotedRawBlockOpening(lines[index]);
    if (!opening) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    output.push(opening.content);
    index += 1;

    while (index < lines.length) {
      const content = stripMatchingQuotePrefix(lines[index], opening.quotePrefix);
      output.push(content);
      index += 1;
      if (isRawBlockClose(content, opening)) break;
    }
  }

  return output.join("\n");
}

function getQuotedRawBlockOpening(line: string): RawBlockOpening | null {
  const quote = parseQuotePrefix(line);
  if (!quote) return null;

  const content = line.slice(quote.rawLength);
  const code = content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (code) {
    return { kind: "code", marker: code[1], quotePrefix: quote.normalized, content };
  }

  if (readDollarMathBlockOpening(content)) {
    return { kind: "math", marker: "$$", quotePrefix: quote.normalized, content };
  }
  if (/^\s*\\\[\s*$/.test(content)) {
    return { kind: "math", marker: "\\[", quotePrefix: quote.normalized, content };
  }

  return null;
}

function stripMatchingQuotePrefix(line: string, quotePrefix: string): string {
  const quote = parseQuotePrefix(line);
  return quote?.normalized === quotePrefix ? line.slice(quote.rawLength) : line;
}

function isRawBlockClose(content: string, opening: RawBlockOpening): boolean {
  const trimmed = content.trim();
  if (opening.kind === "math") {
    return opening.marker === "$$" ? isDollarMathBlockClosing(content) : trimmed === "\\]";
  }

  const closing = trimmed.match(/^(`{3,}|~{3,})$/);
  return Boolean(closing && closing[1][0] === opening.marker[0] && closing[1].length >= opening.marker.length);
}

function stripYamlFrontMatter(markdown: string): string {
  const range = getYamlFrontMatterRange(markdown);
  return range ? markdown.slice(range.end) : markdown;
}

function protectMarkdownCode(markdown: string): { value: string; segments: string[] } {
  const fenced = protectFencedCodeBlocks(markdown);
  const indented = protectIndentedCodeBlocks(fenced.value, fenced.segments);
  return {
    value: protectCodeSpans(indented.value, indented.segments),
    segments: indented.segments,
  };
}

function protectFencedCodeBlocks(markdown: string): { value: string; segments: string[] } {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  const segments: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const opening = lines[index].match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (!opening) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const marker = opening[1];
    const markerChar = marker[0];
    const markerLength = marker.length;
    const content: string[] = [];
    index += 1;

    while (index < lines.length) {
      const closing = lines[index].match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);
      if (closing && closing[1][0] === markerChar && closing[1].length >= markerLength) {
        index += 1;
        break;
      }
      content.push(lines[index]);
      index += 1;
    }

    output.push(createProtectedPlaceholder(segments.length));
    segments.push(content.join("\n"));
  }

  return { value: output.join("\n"), segments };
}

function protectIndentedCodeBlocks(markdown: string, segments: string[]): { value: string; segments: string[] } {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const context = getIndentedCodeLineContext(lines[index]);
    if (!context) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const content: string[] = [];
    while (index < lines.length) {
      const nextContext = getIndentedCodeLineContext(lines[index]);
      if (nextContext?.key === context.key) {
        content.push(nextContext.content);
        index += 1;
        continue;
      }
      if (content.length > 0 && isBlankLineInQuoteContext(lines[index], context.key)) {
        content.push("");
        index += 1;
        continue;
      }
      break;
    }

    output.push(createProtectedPlaceholder(segments.length));
    segments.push(content.join("\n"));
  }

  return { value: output.join("\n"), segments };
}

function getIndentedCodeLineContext(line: string): { key: string; content: string } | null {
  const quote = parseQuotePrefix(line);
  const content = quote ? line.slice(quote.rawLength) : line;
  if (!isIndentedCodeLine(content)) return null;

  return {
    key: quote?.normalized ?? "plain",
    content: stripIndentedCodePrefix(content),
  };
}

function isBlankLineInQuoteContext(line: string, key: string): boolean {
  const quote = parseQuotePrefix(line);
  const content = quote ? line.slice(quote.rawLength) : line;
  return (quote?.normalized ?? "plain") === key && !content.trim();
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}|\t)/.test(line);
}

function stripIndentedCodePrefix(line: string): string {
  return line.startsWith("\t") ? line.slice(1) : line.slice(4);
}

function protectCodeSpans(markdown: string, segments: string[]): string {
  return markdown.replace(/(`+)([^\n`]+?)\1/g, (_match, _marker: string, content: string) => {
    const placeholder = createProtectedPlaceholder(segments.length);
    segments.push(content);
    return placeholder;
  });
}

function createProtectedPlaceholder(index: number): string {
  return `@@MARKO_CODE_${index}@@`;
}

function restoreProtectedSegments(markdown: string, segments: string[]): string {
  return markdown.replace(/@@MARKO_CODE_(\d+)@@/g, (match, index: string) => segments[Number(index)] ?? match);
}

function stripMarkdownTables(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const context = getMarkdownTableLineContext(lines[index]);
    const nextContext = getMarkdownTableLineContext(lines[index + 1] ?? "");
    if (
      index + 1 < lines.length
      && isMarkdownTableRowContent(context.content)
      && nextContext.prefix === context.prefix
      && isMarkdownTableSeparatorContent(nextContext.content)
    ) {
      const tableRows = [context.content];
      index += 2;

      while (index < lines.length) {
        const rowContext = getMarkdownTableLineContext(lines[index]);
        if (rowContext.prefix !== context.prefix || !isMarkdownTableRowContent(rowContext.content)) break;
        tableRows.push(rowContext.content);
        index += 1;
      }

      output.push(tableRows.map((line) => splitMarkdownTableRow(line).join(" ")).join("\n"));
      continue;
    }

    output.push(lines[index]);
    index += 1;
  }

  return output.join("\n");
}

function isMarkdownTableRowContent(content: string): boolean {
  return countUnescapedPipes(content) > 0;
}

function isMarkdownTableSeparatorContent(content: string): boolean {
  const cells = splitMarkdownTableRow(content);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

function splitMarkdownTableRow(line: string): string[] {
  let content = getMarkdownTableLineContext(line).content.trim();
  if (content.startsWith("|")) {
    content = content.slice(1);
  }
  if (hasTrailingUnescapedPipe(content)) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === "|" && !isEscapedAt(content, index)) {
      cells.push(cell.trim().replace(/\\\|/g, "|"));
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim().replace(/\\\|/g, "|"));
  return cells;
}

function getMarkdownTableLineContext(line: string): { content: string; prefix: string } {
  const quote = parseQuotePrefix(line);
  return {
    content: quote ? line.slice(quote.rawLength) : line,
    prefix: quote?.normalized ?? "",
  };
}

function hasTrailingUnescapedPipe(value: string): boolean {
  const index = value.length - 1;
  return index >= 0 && value[index] === "|" && !isEscapedAt(value, index);
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

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      return decodeCodePoint(Number.parseInt(normalized.slice(2), 16), match);
    }
    if (normalized.startsWith("#")) {
      return decodeCodePoint(Number.parseInt(normalized.slice(1), 10), match);
    }

    const named: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'",
      nbsp: " ",
    };
    return named[normalized] ?? match;
  });
}

function decodeCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isFinite(codePoint)) return fallback;

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function parseQuotePrefix(line: string): QuotePrefixInfo | null {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  let cursor = leading.length;
  let normalized = leading;
  let count = 0;

  while (line[cursor] === ">") {
    normalized += "> ";
    cursor += 1;
    if (line[cursor] === " " || line[cursor] === "\t") {
      cursor += 1;
    }
    count += 1;
  }

  return count > 0 ? { rawLength: cursor, normalized } : null;
}

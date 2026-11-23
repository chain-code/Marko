import { markdownLanguage } from "@codemirror/lang-markdown";
import MarkdownIt from "markdown-it";
import { splitMarkdownBlocks } from "./editorBlocks";
import {
  isDollarMathBlockClosing,
  readDollarMathBlockOpening,
} from "./mathSyntax";

export interface ReferenceDefinitionSourceValue {
  from: number;
  to: number;
  raw: string;
  value: string;
}

export interface ReferenceDefinitionLabel extends ReferenceDefinitionSourceValue {
  normalized: string;
}

export interface ReferenceDefinitionSemantics {
  from: number;
  to: number;
  raw: string;
  label: ReferenceDefinitionLabel;
  url: ReferenceDefinitionSourceValue;
  title: ReferenceDefinitionSourceValue | null;
}

interface SourceLine {
  text: string;
  start: number;
  end: number;
  lineBreak: string;
}

interface ContainedLine {
  content: string;
  contentStart: number;
  quoteKey: string;
  containerIndent: number;
}

interface LiteralFence {
  from: number;
  marker: string;
  quoteKey: string;
  containerIndent: number;
}

interface ParsedDefinition {
  definition: ReferenceDefinitionSemantics;
  endLineIndex: number;
}

const referenceParser = new MarkdownIt();
const LITERAL_BLOCK_TYPES = new Set(["code", "html", "frontmatter", "math"]);
const CODE_MIRROR_LITERAL_NODES = new Set(["FencedCode", "CodeBlock", "IndentedCode", "HTMLBlock"]);

/**
 * 按 Markdown 标签匹配规则折叠空白并统一大小写。
 */
export function normalizeMarkdownReferenceLabel(label: string): string {
  return referenceParser.utils.normalizeReference(label);
}

/**
 * 收集文档中普通链接引用定义的字段值与精确源码范围。
 */
export function collectReferenceDefinitionSemantics(
  source: string,
): ReferenceDefinitionSemantics[] {
  const lines = collectSourceLines(source);
  const literalRanges = collectLiteralRanges(source, lines);
  const definitions: ReferenceDefinitionSemantics[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isInsideRanges(line.start, literalRanges)) continue;

    const parsed = parseDefinition(source, lines, index, literalRanges);
    if (!parsed) continue;
    definitions.push(parsed.definition);
    index = parsed.endLineIndex;
  }

  return definitions;
}

function parseDefinition(
  source: string,
  lines: SourceLine[],
  lineIndex: number,
  literalRanges: Array<{ from: number; to: number }>,
): ParsedDefinition | null {
  const line = lines[lineIndex];
  const contained = readContainedLine(line);
  const content = contained.content;
  let cursor = skipLimitedIndent(content, 0, 3);
  if (content[cursor] !== "[") return null;

  const labelOpen = cursor;
  const labelClose = findReferenceLabelEnd(content, labelOpen + 1);
  if (labelClose < 0 || content[labelClose + 1] !== ":") return null;

  const rawLabel = content.slice(labelOpen + 1, labelClose);
  const normalizedLabel = normalizeMarkdownReferenceLabel(rawLabel);
  if (!normalizedLabel || rawLabel.length > 999 || rawLabel.startsWith("^")) return null;

  cursor = skipWhitespace(content, labelClose + 2);
  const destinationStart = cursor;
  const destination = referenceParser.helpers.parseLinkDestination(content, cursor, content.length);
  if (!destination.ok) return null;

  const destinationEnd = destination.pos;
  const separatedTitleStart = skipWhitespace(content, destinationEnd);
  let title: ReferenceDefinitionSourceValue | null = null;
  let endLineIndex = lineIndex;

  if (separatedTitleStart < content.length) {
    if (separatedTitleStart === destinationEnd) return null;
    title = parseTitleField(content, contained.contentStart, separatedTitleStart);
    if (!title) return null;
  } else {
    const nextLine = lines[lineIndex + 1];
    if (nextLine && !isInsideRanges(nextLine.start, literalRanges)) {
      const continuation = readDefinitionContinuation(nextLine, contained);
      if (continuation) {
        const titleStart = skipWhitespace(continuation.content, 0);
        const nextTitle = parseTitleField(
          continuation.content,
          continuation.contentStart,
          titleStart,
        );
        if (nextTitle) {
          title = nextTitle;
          endLineIndex = lineIndex + 1;
        }
      }
    }
  }

  const labelFrom = contained.contentStart + labelOpen + 1;
  const labelTo = contained.contentStart + labelClose;
  const angleDestination = content[destinationStart] === "<";
  const urlFrom = contained.contentStart + destinationStart + (angleDestination ? 1 : 0);
  const urlTo = contained.contentStart + destinationEnd - (angleDestination ? 1 : 0);
  const endLine = lines[endLineIndex] ?? line;
  const to = endLine.end - endLine.lineBreak.length;

  return {
    definition: {
      from: line.start,
      to,
      raw: source.slice(line.start, to),
      label: {
        from: labelFrom,
        to: labelTo,
        raw: source.slice(labelFrom, labelTo),
        value: rawLabel,
        normalized: normalizedLabel,
      },
      url: {
        from: urlFrom,
        to: urlTo,
        raw: source.slice(urlFrom, urlTo),
        value: destination.str,
      },
      title,
    },
    endLineIndex,
  };
}

function parseTitleField(
  content: string,
  contentStart: number,
  titleStart: number,
): ReferenceDefinitionSourceValue | null {
  if (titleStart >= content.length) return null;
  const parsed = referenceParser.helpers.parseLinkTitle(content, titleStart, content.length);
  if (!parsed.ok || !onlyWhitespace(content, parsed.pos)) return null;

  const from = contentStart + titleStart + 1;
  const to = contentStart + parsed.pos - 1;
  return {
    from,
    to,
    raw: content.slice(titleStart + 1, parsed.pos - 1),
    value: parsed.str,
  };
}

function collectSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const matcher = /.*(?:\r\n|\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(source)) && match[0] !== "") {
    const lineBreak = match[0].match(/(?:\r\n|\n)$/)?.[0] ?? "";
    lines.push({
      text: lineBreak ? match[0].slice(0, -lineBreak.length) : match[0],
      start: match.index,
      end: match.index + match[0].length,
      lineBreak,
    });
  }
  return lines;
}

function readContainedLine(line: SourceLine): ContainedLine {
  const quote = readQuoteContext(line.text);
  let content = quote.content;
  let contentStart = line.start + quote.consumed;
  let containerIndent = 0;

  for (let depth = 0; depth < 16; depth += 1) {
    const marker = content.match(/^([ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]{1,4})(.*)$/);
    if (!marker) break;
    containerIndent += getIndentWidth(marker[1]);
    contentStart += marker[1].length;
    content = marker[2];
  }

  return {
    content,
    contentStart,
    quoteKey: quote.key,
    containerIndent,
  };
}

function readDefinitionContinuation(
  line: SourceLine,
  definition: ContainedLine,
): ContainedLine | null {
  const quote = readQuoteContext(line.text);
  if (quote.key !== definition.quoteKey) return null;
  const removed = removeIndentWidth(quote.content, definition.containerIndent);
  return {
    content: quote.content.slice(removed),
    contentStart: line.start + quote.consumed + removed,
    quoteKey: quote.key,
    containerIndent: definition.containerIndent,
  };
}

function readQuoteContext(line: string): {
  content: string;
  consumed: number;
  key: string;
} {
  const match = line.match(/^( {0,3}(?:>[ \t]?)+)/);
  if (!match) return { content: line, consumed: 0, key: "plain" };
  const leading = match[1].match(/^\s*/)?.[0].length ?? 0;
  const depth = match[1].match(/>/g)?.length ?? 0;
  return {
    content: line.slice(match[1].length),
    consumed: match[1].length,
    key: `quote:${leading}:${depth}`,
  };
}

function collectLiteralRanges(
  source: string,
  lines: SourceLine[],
): Array<{ from: number; to: number }> {
  const ranges = splitMarkdownBlocks(source)
    .filter((block) => LITERAL_BLOCK_TYPES.has(block.type))
    .map((block) => ({ from: block.start, to: block.end }));

  markdownLanguage.parser.parse(source).iterate({
    enter(node) {
      if (CODE_MIRROR_LITERAL_NODES.has(node.name)) {
        ranges.push({ from: node.from, to: node.to });
      }
    },
  });

  ranges.push(...collectContainedFenceRanges(lines));
  return mergeRanges(ranges);
}

function collectContainedFenceRanges(lines: SourceLine[]): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let fence: LiteralFence | null = null;

  for (const line of lines) {
    if (fence) {
      const continuation = readFenceContinuation(line, fence);
      if (!continuation) {
        ranges.push({ from: fence.from, to: line.start });
        fence = null;
      } else if (isFenceClose(continuation.content, fence.marker)) {
        ranges.push({ from: fence.from, to: line.end });
        fence = null;
        continue;
      } else {
        continue;
      }
    }

    const contained = readContainedLine(line);
    const marker = readFenceOpen(contained.content);
    if (!marker) continue;
    fence = {
      from: line.start,
      marker,
      quoteKey: contained.quoteKey,
      containerIndent: contained.containerIndent,
    };
  }

  if (fence) {
    ranges.push({ from: fence.from, to: lines.at(-1)?.end ?? fence.from });
  }
  return ranges;
}

function readFenceContinuation(line: SourceLine, fence: LiteralFence): ContainedLine | null {
  const quote = readQuoteContext(line.text);
  if (quote.key !== fence.quoteKey) return null;
  const removed = removeIndentWidth(quote.content, fence.containerIndent);
  return {
    content: quote.content.slice(removed),
    contentStart: line.start + quote.consumed + removed,
    quoteKey: quote.key,
    containerIndent: fence.containerIndent,
  };
}

function readFenceOpen(content: string): string | null {
  const code = content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (code) return code[1];
  if (readDollarMathBlockOpening(content)) return "$$";
  if (/^[ \t]{0,3}\\\[[ \t]*$/.test(content)) return "\\[";
  return null;
}

function isFenceClose(content: string, marker: string): boolean {
  if (marker === "$$") return isDollarMathBlockClosing(content);
  if (marker === "\\[") return /^[ \t]{0,3}\\\][ \t]*$/.test(content);
  const character = marker[0];
  const run = content.match(new RegExp(`^[ \\t]{0,3}(${escapeRegExp(character)}+)`));
  return Boolean(run && run[1].length >= marker.length);
}

function findReferenceLabelEnd(content: string, start: number): number {
  for (let index = start; index < content.length; index += 1) {
    if (content[index] === "\\") {
      index += 1;
      continue;
    }
    if (content[index] === "[") return -1;
    if (content[index] === "]") return index;
  }
  return -1;
}

function skipLimitedIndent(content: string, start: number, maximum: number): number {
  let index = start;
  let width = 0;
  while (index < content.length && width < maximum) {
    if (content[index] === " ") {
      width += 1;
      index += 1;
      continue;
    }
    if (content[index] === "\t") {
      if (width + 4 > maximum) break;
      width += 4;
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function skipWhitespace(content: string, start: number): number {
  let index = start;
  while (index < content.length && /[ \t]/.test(content[index])) index += 1;
  return index;
}

function onlyWhitespace(content: string, start: number): boolean {
  return /^[ \t]*$/.test(content.slice(start));
}

function removeIndentWidth(value: string, width: number): number {
  let removedWidth = 0;
  let index = 0;
  while (index < value.length && removedWidth < width) {
    if (value[index] === " ") {
      removedWidth += 1;
      index += 1;
      continue;
    }
    if (value[index] === "\t") {
      removedWidth += 4 - (removedWidth % 4);
      index += 1;
      continue;
    }
    break;
  }
  return index;
}

function getIndentWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    width += character === "\t" ? 4 - (width % 4) : 1;
  }
  return width;
}

function isInsideRanges(position: number, ranges: Array<{ from: number; to: number }>): boolean {
  return ranges.some((range) => position >= range.from && position < range.to);
}

function mergeRanges(
  ranges: Array<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  const sorted = ranges
    .filter((range) => range.to > range.from)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const merged: Array<{ from: number; to: number }> = [];

  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.from > previous.to) {
      merged.push({ ...range });
      continue;
    }
    previous.to = Math.max(previous.to, range.to);
  }
  return merged;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

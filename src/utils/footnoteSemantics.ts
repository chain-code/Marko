import { splitMarkdownBlocks, type MarkdownBlock } from "./editorBlocks";
import { collectFootnoteReferenceSyntax } from "./inlineSyntax";
import { readDollarMathBlockOpening } from "./mathSyntax";

export interface FootnoteReferenceLocation {
  from: number;
  to: number;
  occurrence: number;
  number: number;
}

export interface FootnoteDefinitionSourceRange {
  from: number;
  to: number;
  raw: string;
}

export interface FootnoteDefinitionSemantics {
  id: string;
  from: number;
  to: number;
  raw: string;
  markdown: string;
  label: FootnoteDefinitionSourceRange;
  content: FootnoteDefinitionSourceRange;
  number: number | null;
  references: FootnoteReferenceLocation[];
}

export interface FootnoteReferenceSemantics {
  id: string;
  from: number;
  to: number;
  raw: string;
  inline: boolean;
  markdown: string;
  number: number;
  occurrence: number;
  missing: boolean;
  definition: FootnoteDefinitionSemantics | null;
}

export interface FootnoteDocumentSemantics {
  references: FootnoteReferenceSemantics[];
  definitions: FootnoteDefinitionSemantics[];
}

export interface MissingFootnoteDefinitionEdit {
  from: number;
  to: number;
  insert: string;
  cursor: number;
}

interface SourceLine {
  text: string;
  start: number;
  end: number;
  lineBreak: string;
}

interface DefinitionStart {
  id: string;
  idOffset: number;
  contentOffset: number;
  firstContent: string;
  quoteKey: string;
  containerIndent: number;
}

interface FootnoteLabelRange {
  id: string;
  from: number;
  to: number;
}

const LITERAL_BLOCK_TYPES = new Set(["code", "html", "frontmatter", "math"]);
const RENDER_FOOTNOTE_LABEL_PREFIX = "marko-footnote-";

/**
 * 收集整篇文档的脚注编号、定义及双向定位信息。
 * 普通脚注按不区分大小写的标签共享编号，内联脚注各自占用一个编号。
 */
export function collectFootnoteSemantics(source: string): FootnoteDocumentSemantics {
  const blocks = splitMarkdownBlocks(source);
  const definitions = collectDefinitions(source, blocks);
  const firstDefinitionById = new Map<string, FootnoteDefinitionSemantics>();
  for (const definition of definitions) {
    const canonicalId = canonicalFootnoteId(definition.id);
    if (!firstDefinitionById.has(canonicalId)) {
      firstDefinitionById.set(canonicalId, definition);
    }
  }

  const literalRanges = blocks
    .filter((block) => LITERAL_BLOCK_TYPES.has(block.type))
    .map((block) => ({ from: block.start, to: block.end }));
  const numbers = new Map<string, number>();
  const occurrences = new Map<string, number>();
  const firstReferenceIdByKey = new Map<string, string>();
  const references: FootnoteReferenceSemantics[] = [];

  for (const syntax of collectFootnoteReferenceSyntax(source)) {
    if (literalRanges.some((range) => syntax.start >= range.from && syntax.end <= range.to)) continue;

    const inline = syntax.inline === true;
    const canonicalId = inline ? "" : canonicalFootnoteId(syntax.id);
    const key = inline ? "inline:" + syntax.start : "label:" + canonicalId;
    if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
    const number = numbers.get(key) ?? 1;
    const occurrence = inline ? 1 : (occurrences.get(canonicalId) ?? 0) + 1;
    if (!inline) occurrences.set(canonicalId, occurrence);

    const definition = inline ? null : firstDefinitionById.get(canonicalId) ?? null;
    if (!inline && !firstReferenceIdByKey.has(canonicalId)) {
      firstReferenceIdByKey.set(canonicalId, syntax.id);
    }
    const displayId = inline
      ? syntax.id
      : definition?.id ?? firstReferenceIdByKey.get(canonicalId) ?? syntax.id;
    const reference: FootnoteReferenceSemantics = {
      id: displayId,
      from: syntax.start,
      to: syntax.end,
      raw: syntax.raw,
      inline,
      markdown: inline ? syntax.id : definition?.markdown ?? "",
      number,
      occurrence,
      missing: !inline && !definition,
      definition,
    };
    references.push(reference);

    if (definition) {
      definition.number ??= number;
      definition.references.push({
        from: reference.from,
        to: reference.to,
        occurrence,
        number,
      });
    }
  }

  return { references, definitions };
}

/**
 * 为尚未定义的普通脚注生成文档末尾追加编辑。
 * 返回的光标位于定义标记后的正文输入位置。
 */
export function createMissingFootnoteDefinitionEdit(
  source: string,
  id: string,
): MissingFootnoteDefinitionEdit | null {
  if (!id.trim() || /[\]\r\n]/.test(id)) {
    throw new TypeError("脚注标签不能为空，也不能包含换行或右方括号");
  }
  const canonicalId = canonicalFootnoteId(id);
  if (collectFootnoteSemantics(source).definitions.some((definition) => (
    canonicalFootnoteId(definition.id) === canonicalId
  ))) {
    return null;
  }

  const lineBreak = source.includes("\r\n") ? "\r\n" : "\n";
  const trailingBreakCount = countTrailingLineBreaks(source);
  const separator = source.length === 0
    ? ""
    : lineBreak.repeat(Math.max(0, 2 - trailingBreakCount));
  const insert = `${separator}[^${id}]: `;

  return {
    from: source.length,
    to: source.length,
    insert,
    cursor: source.length + insert.length,
  };
}

/**
 * 仅规范化 Markdown 解析器会消费的脚注标签，保留代码、HTML 等字面量内容。
 */
export function normalizeFootnoteLabelsForRender(source: string): string {
  const blocks = splitMarkdownBlocks(source);
  const literalRanges = blocks
    .filter((block) => LITERAL_BLOCK_TYPES.has(block.type))
    .map((block) => ({ from: block.start, to: block.end }));
  const definitionRanges = collectDefinitionLabelRanges(source, blocks);
  const definedIds = new Set(definitionRanges.map((range) => canonicalFootnoteId(range.id)));
  const replacements: FootnoteLabelRange[] = [...definitionRanges];

  for (const syntax of collectFootnoteReferenceSyntax(source)) {
    if (syntax.inline) continue;
    if (literalRanges.some((range) => syntax.start >= range.from && syntax.end <= range.to)) continue;
    if (!definedIds.has(canonicalFootnoteId(syntax.id))) continue;
    replacements.push({
      id: syntax.id,
      from: syntax.start + 2,
      to: syntax.end - 1,
    });
  }

  return replacements
    .sort((left, right) => right.from - left.from || right.to - left.to)
    .reduce((value, range) => (
      value.slice(0, range.from) + encodeFootnoteLabelForRender(range.id) + value.slice(range.to)
    ), source);
}

export function decodeFootnoteLabelForRender(id: string): string {
  if (!id.startsWith(RENDER_FOOTNOTE_LABEL_PREFIX)) return id;
  const encoded = id.slice(RENDER_FOOTNOTE_LABEL_PREFIX.length);
  if (!encoded || encoded.length % 4 !== 0 || !/^[0-9a-f]+$/i.test(encoded)) return id;

  let label = "";
  for (let index = 0; index < encoded.length; index += 4) {
    label += String.fromCharCode(Number.parseInt(encoded.slice(index, index + 4), 16));
  }
  return label;
}

function collectDefinitionLabelRanges(
  source: string,
  blocks: MarkdownBlock[],
): FootnoteLabelRange[] {
  const ranges: FootnoteLabelRange[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    if (LITERAL_BLOCK_TYPES.has(block.type)) continue;
    const lines = collectSourceLines(block.raw, block.start);
    for (let index = 0; index < lines.length; index += 1) {
      const start = readDefinitionStart(lines[index]?.text ?? "");
      if (!start) continue;
      const canonicalId = canonicalFootnoteId(start.id);
      if (!seen.has(canonicalId)) {
        seen.add(canonicalId);
        ranges.push({
          id: start.id,
          from: lines[index].start + start.idOffset,
          to: lines[index].start + start.idOffset + start.id.length,
        });
      }
      index = findDefinitionEndLine(lines, index, start);
    }
  }
  return ranges;
}

function canonicalFootnoteId(id: string): string {
  return id.trim().toLowerCase();
}

function encodeFootnoteLabelForRender(id: string): string {
  const canonicalId = canonicalFootnoteId(id);
  let encoded = RENDER_FOOTNOTE_LABEL_PREFIX;
  for (let index = 0; index < canonicalId.length; index += 1) {
    encoded += canonicalId.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return encoded;
}

function collectDefinitions(
  source: string,
  blocks: MarkdownBlock[],
): FootnoteDefinitionSemantics[] {
  const definitions: FootnoteDefinitionSemantics[] = [];

  for (const block of blocks) {
    if (LITERAL_BLOCK_TYPES.has(block.type)) continue;
    const lines = collectSourceLines(block.raw, block.start);

    for (let index = 0; index < lines.length; index += 1) {
      const start = readDefinitionStart(lines[index]?.text ?? "");
      if (!start) continue;

      const endIndex = findDefinitionEndLine(lines, index, start);
      const from = lines[index].start;
      const endLine = lines[endIndex] ?? lines[index];
      const to = endLine.end - endLine.lineBreak.length;
      const labelFrom = lines[index].start + start.idOffset;
      const contentFrom = lines[index].start + start.contentOffset;
      const contentTo = Math.max(contentFrom, to);
      definitions.push({
        id: start.id,
        from,
        to,
        raw: source.slice(from, to),
        markdown: readDefinitionMarkdown(lines, index, endIndex, start),
        label: {
          from: labelFrom,
          to: labelFrom + start.id.length,
          raw: source.slice(labelFrom, labelFrom + start.id.length),
        },
        content: {
          from: contentFrom,
          to: contentTo,
          raw: source.slice(contentFrom, contentTo),
        },
        number: null,
        references: [],
      });
      index = endIndex;
    }
  }

  return definitions.sort((left, right) => left.from - right.from || left.to - right.to);
}

function collectSourceLines(value: string, offset: number): SourceLine[] {
  const lines: SourceLine[] = [];
  const matcher = /.*(?:\r\n|\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value)) && match[0] !== "") {
    const lineBreak = match[0].match(/(?:\r\n|\n)$/)?.[0] ?? "";
    lines.push({
      text: lineBreak ? match[0].slice(0, -lineBreak.length) : match[0],
      start: offset + match.index,
      end: offset + match.index + match[0].length,
      lineBreak,
    });
  }
  return lines;
}

function readDefinitionStart(line: string): DefinitionStart | null {
  const context = readQuoteContext(line);
  let content = context.content;
  let contentOffset = context.contentOffset;
  let containerIndent = 0;

  for (let depth = 0; depth < 16; depth += 1) {
    const marker = content.match(/^([ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]{1,4})(.*)$/);
    if (!marker) break;
    containerIndent += getIndentWidth(marker[1]);
    contentOffset += marker[1].length;
    content = marker[2];
  }

  const definition = content.match(/^([ \t]{0,3}\[\^)([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)]:[ \t]*(.*)$/);
  if (!definition) return null;
  return {
    id: definition[2],
    idOffset: contentOffset + definition[1].length,
    contentOffset: contentOffset + definition[0].length - definition[3].length,
    firstContent: definition[3],
    quoteKey: context.key,
    containerIndent,
  };
}

function findDefinitionEndLine(
  lines: SourceLine[],
  startIndex: number,
  definition: DefinitionStart,
): number {
  let endIndex = startIndex;
  let requiresIndentedContinuation = false;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const content = normalizeDefinitionContinuation(lines[index].text, definition);
    if (content === null) break;

    if (!content.trim()) {
      if (hasFollowingIndentedContinuation(lines, index + 1, definition)) {
        endIndex = index;
        requiresIndentedContinuation = true;
        continue;
      }
      break;
    }

    if (isIndentedFootnoteContinuation(content)) {
      endIndex = index;
      requiresIndentedContinuation = false;
      continue;
    }

    if (!requiresIndentedContinuation && !isFootnoteInterruptingLine(content.replace(/^ {0,3}/, ""))) {
      endIndex = index;
      continue;
    }

    break;
  }

  return endIndex;
}

function hasFollowingIndentedContinuation(
  lines: SourceLine[],
  startIndex: number,
  definition: DefinitionStart,
): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const content = normalizeDefinitionContinuation(lines[index].text, definition);
    if (content === null) return false;
    if (!content.trim()) continue;
    return isIndentedFootnoteContinuation(content);
  }
  return false;
}

function readDefinitionMarkdown(
  lines: SourceLine[],
  startIndex: number,
  endIndex: number,
  definition: DefinitionStart,
): string {
  let markdown = definition.firstContent;
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const previousLineBreak = lines[index - 1]?.lineBreak ?? "\n";
    const content = normalizeDefinitionContinuation(lines[index].text, definition) ?? "";
    markdown += previousLineBreak + removeFootnoteContinuationIndent(content);
  }
  return markdown;
}

function normalizeDefinitionContinuation(
  line: string,
  definition: DefinitionStart,
): string | null {
  const context = readQuoteContext(line);
  if (context.key !== definition.quoteKey) return null;
  return removeIndentWidth(context.content, definition.containerIndent);
}

function readQuoteContext(line: string): { content: string; key: string; contentOffset: number } {
  const match = line.match(/^( {0,3}(?:>[ \t]?)+)/);
  if (!match) return { content: line, key: "plain", contentOffset: 0 };
  const leading = match[1].match(/^\s*/)?.[0].length ?? 0;
  const depth = match[1].match(/>/g)?.length ?? 0;
  return {
    content: line.slice(match[1].length),
    key: "quote:" + leading + ":" + depth,
    contentOffset: match[1].length,
  };
}

function removeIndentWidth(value: string, width: number): string {
  let removed = 0;
  let index = 0;
  while (index < value.length && removed < width) {
    if (value[index] === " ") {
      removed += 1;
      index += 1;
      continue;
    }
    if (value[index] === "\t") {
      removed += 4 - (removed % 4);
      index += 1;
      continue;
    }
    break;
  }
  return value.slice(index);
}

function removeFootnoteContinuationIndent(value: string): string {
  if (value.startsWith("\t")) return value.slice(1);
  return value.startsWith("    ") ? value.slice(4) : value;
}

function getIndentWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    width += character === "\t" ? 4 - (width % 4) : 1;
  }
  return width;
}

function isIndentedFootnoteContinuation(value: string): boolean {
  return /^(?: {4,}| {0,3}\t)/.test(value);
}

function isFootnoteInterruptingLine(value: string): boolean {
  return isHorizontalRule(value)
    || Boolean(readDollarMathBlockOpening(value))
    || /^(?:#{1,6}\s|(?:[-*+]|\d+[.)])\s+|>\s?|`{3,}|~{3,}|\\\[\s*$|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|\[[^\]\n]+]:\s*\S|<!--|<\/?[A-Za-z][^>\n]*>)/.test(value);
}

function isHorizontalRule(value: string): boolean {
  return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,}|(?:\+[ \t]*){3,})$/.test(value);
}

function countTrailingLineBreaks(source: string): number {
  const trailing = source.match(/(?:(?:\r\n)|\n)+$/)?.[0] ?? "";
  return trailing.match(/\r\n|\n/g)?.length ?? 0;
}

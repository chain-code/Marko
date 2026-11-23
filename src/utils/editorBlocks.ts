import { isMarkdownTocLine } from "./tocSyntax";
import {
  getYamlFrontMatterRange,
  isYamlFrontMatterClosing,
  isYamlFrontMatterOpening,
} from "./frontMatterSyntax";
import {
  getLeadingMarkdownIndent,
  getMarkdownIndentWidth,
  isMarkdownCodeIndented,
  readMarkdownBlockquotePrefix,
  stripMarkdownIndentColumns,
  stripMarkdownListContainerMarkers,
} from "./markdownIndent";
import {
  isDollarMathBlockClosing,
  readDollarMathBlockOpening,
} from "./mathSyntax";
import {
  incrementOrderedListNumber,
  normalizeOrderedListNumber,
} from "./orderedListNumber";

export interface MarkdownBlock {
  index: number;
  raw: string;
  start: number;
  end: number;
  type: string;
}

export interface MarkdownBlockBoundaryTextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export type MarkdownBlockBoundaryDirection = "backward" | "forward";

interface LineInfo {
  text: string;
  start: number;
  end: number;
}

export function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  if (!markdown) {
    return [{ index: 0, raw: "", start: 0, end: 0, type: "paragraph" }];
  }

  const lines = collectLines(markdown);
  const blocks: MarkdownBlock[] = [];
  let blockStart = 0;
  let lineCursor = 0;
  const frontMatterEnd = getFrontMatterEndOffset(lines);

  if (frontMatterEnd > 0) {
    blocks.push({
      index: blocks.length,
      raw: markdown.slice(0, frontMatterEnd),
      start: 0,
      end: frontMatterEnd,
      type: "frontmatter",
    });
    blockStart = frontMatterEnd;
    while (lineCursor < lines.length && lines[lineCursor].end <= blockStart) {
      lineCursor += 1;
    }
  }

  for (let index = lineCursor; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.text.trim();
    const rawFence = getRawFence(line.text);
    const rawHtmlBlock = getRawHtmlBlock(line.text);

    if (isMarkdownAtxHeadingLine(line.text)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      blocks.push({
        index: blocks.length,
        raw: markdown.slice(line.start, line.end),
        start: line.start,
        end: line.end,
        type: "heading",
      });
      blockStart = line.end;
      continue;
    }

    if (isTableStartLine(lines, index)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const tableEndLine = findTableEndLine(lines, index);
      const tableEnd = lines[tableEndLine]?.end ?? line.end;
      blocks.push({
        index: blocks.length,
        raw: markdown.slice(line.start, tableEnd),
        start: line.start,
        end: tableEnd,
        type: "table",
      });
      blockStart = tableEnd;
      index = tableEndLine;
      continue;
    }

    if (isFootnoteDefinitionLine(line.text)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const footnoteEndLine = findFootnoteDefinitionEndLine(lines, index);
      const footnoteEnd = lines[footnoteEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, footnoteEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: footnoteEnd,
        type: "footnote",
      });
      blockStart = footnoteEnd;
      index = footnoteEndLine;
      continue;
    }

    if (isLinkReferenceDefinitionLine(line.text)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const referenceEndLine = findReferenceDefinitionEndLine(lines, index);
      const referenceEnd = lines[referenceEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, referenceEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: referenceEnd,
        type: "reference",
      });
      blockStart = referenceEnd;
      index = referenceEndLine;
      continue;
    }

    if (
      isIndentedCodeLine(line.text)
      && canStartIndentedCodeBlock(markdown, lines, index, blockStart)
    ) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const codeEndLine = findIndentedCodeEndLine(lines, index);
      const codeEnd = lines[codeEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, codeEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: codeEnd,
        type: "code",
      });
      blockStart = codeEnd;
      index = codeEndLine;
      continue;
    }

    if (rawFence) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const fenceEndLine = findRawFenceEndLine(lines, index, rawFence);
      const fenceEnd = lines[fenceEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, fenceEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: fenceEnd,
        type: detectBlockType(raw, line.start === 0),
      });
      blockStart = fenceEnd;
      index = fenceEndLine;
      continue;
    }

    if (rawHtmlBlock) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const htmlEndLine = findRawHtmlBlockEndLine(lines, index, rawHtmlBlock);
      const htmlEnd = lines[htmlEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, htmlEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: htmlEnd,
        type: detectBlockType(raw, line.start === 0),
      });
      blockStart = htmlEnd;
      index = htmlEndLine;
      continue;
    }

    if (isMarkdownTocLine(line.text)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      blocks.push({
        index: blocks.length,
        raw: markdown.slice(line.start, line.end),
        start: line.start,
        end: line.end,
        type: "toc",
      });
      blockStart = line.end;
      continue;
    }

    const setextStartLine = getSetextHeadingStartLine(lines, index, blockStart);
    if (setextStartLine !== null) {
      const setextStart = lines[setextStartLine].start;
      if (setextStart > blockStart) {
        const raw = markdown.slice(blockStart, setextStart);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: setextStart,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      blocks.push({
        index: blocks.length,
        raw: markdown.slice(setextStart, line.end),
        start: setextStart,
        end: line.end,
        type: "heading",
      });
      blockStart = line.end;
      continue;
    }

    if (isMarkdownHorizontalRuleLine(line.text)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      blocks.push({
        index: blocks.length,
        raw: markdown.slice(line.start, line.end),
        start: line.start,
        end: line.end,
        type: "rule",
      });
      blockStart = line.end;
      continue;
    }

    const definitionEndLine = findDefinitionListEndLine(lines, index);
    if (definitionEndLine !== null) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const definitionEnd = lines[definitionEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, definitionEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: definitionEnd,
        type: "definition",
      });
      blockStart = definitionEnd;
      index = definitionEndLine;
      continue;
    }

    const listEndLine = findMarkdownListEndLine(lines, index);
    if (listEndLine !== null) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const listEnd = lines[listEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, listEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: listEnd,
        type: detectBlockType(raw, line.start === 0),
      });
      blockStart = listEnd;
      index = listEndLine;
      continue;
    }

    if (trimmed === "") {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        blocks.push({
          index: blocks.length,
          raw,
          start: blockStart,
          end: line.start,
          type: detectBlockType(raw, blockStart === 0),
        });
      }
      blockStart = line.end;
    }
  }

  if (blockStart <= markdown.length) {
    const raw = markdown.slice(blockStart);
    if (raw.length > 0 || blocks.length === 0) {
      blocks.push({
        index: blocks.length,
        raw,
        start: blockStart,
        end: markdown.length,
        type: detectBlockType(raw, blockStart === 0),
      });
    }
  }

  return blocks;
}

function getFrontMatterEndOffset(lines: LineInfo[]): number {
  if (!isYamlFrontMatterOpening(lines[0]?.text ?? "")) return -1;

  for (let index = 1; index < lines.length; index += 1) {
    if (isYamlFrontMatterClosing(lines[index].text)) {
      return lines[index].end;
    }
  }

  return -1;
}

export function replaceBlock(markdown: string, block: MarkdownBlock, value: string): string {
  return `${markdown.slice(0, block.start)}${value}${markdown.slice(block.end)}`;
}

export function mergeVisibleMarkdownBlockBoundary(
  state: MarkdownBlockBoundaryTextState,
  direction: MarkdownBlockBoundaryDirection,
): MarkdownBlockBoundaryTextState | null {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd, state.value.length));
  const selectionEnd = Math.max(0, Math.min(Math.max(state.selectionStart, state.selectionEnd), state.value.length));
  if (selectionStart !== selectionEnd) return null;

  const gap = direction === "backward"
    ? findBackwardMarkdownBlockGap(state.value, selectionStart)
    : findForwardMarkdownBlockGap(state.value, selectionStart);
  if (!gap) return null;

  const blocks = splitMarkdownBlocks(state.value);
  const left = blocks.find((block) => gap.from > block.start && gap.from <= block.end);
  const right = blocks.find((block) => gap.to >= block.start && gap.to < block.end);
  if (!left || !right || left.index === right.index || right.start !== gap.to) return null;
  if (!["paragraph", "heading", "quote", "list", "task"].includes(left.type)) return null;
  const rightMarkerLength = direction === "forward"
    ? getForwardBoundaryMarkerLength(state.value.slice(right.start, right.end), right.type)
    : right.type === "paragraph" ? 0 : null;
  if (rightMarkerLength === null) return null;

  if (direction === "backward" && left.type === "heading") {
    const setextResult = mergeAfterSetextHeading(
      state.value,
      left,
      right,
      gap,
      rightMarkerLength,
    );
    if (setextResult) return setextResult;
  }

  return {
    value: `${state.value.slice(0, gap.from)}${state.value.slice(gap.to + rightMarkerLength)}`,
    selectionStart: gap.from,
    selectionEnd: gap.from,
  };
}

function mergeAfterSetextHeading(
  value: string,
  left: MarkdownBlock,
  right: MarkdownBlock,
  gap: { from: number; to: number },
  rightMarkerLength: number,
): MarkdownBlockBoundaryTextState | null {
  const heading = value.slice(left.start, gap.from).match(
    /^([\s\S]+)(\r?\n)([ \t]{0,3}(?:={2,}|-{2,})[ \t]*)$/,
  );
  if (!heading) return null;

  const rightSource = value.slice(gap.to + rightMarkerLength, right.end);
  const trailingLineBreak = rightSource.match(/\r?\n$/)?.[0] ?? "";
  const rightContent = trailingLineBreak
    ? rightSource.slice(0, -trailingLineBreak.length)
    : rightSource;
  const mergedHeading = `${heading[1]}${rightContent}${heading[2]}${heading[3]}${trailingLineBreak}`;
  const selection = left.start + heading[1].length;
  return {
    value: `${value.slice(0, left.start)}${mergedHeading}${value.slice(right.end)}`,
    selectionStart: selection,
    selectionEnd: selection,
  };
}

function getForwardBoundaryMarkerLength(raw: string, type: string): number | null {
  if (type === "paragraph") return 0;
  const firstLine = raw.split(/\r?\n/, 1)[0] ?? "";
  if (type === "heading") {
    return firstLine.match(/^[ \t]{0,3}#{1,6}[ \t]+/)?.[0].length ?? null;
  }
  if (type === "quote") {
    return firstLine.match(/^[ \t]{0,3}(?:>[ \t]?)+/)?.[0].length ?? null;
  }
  if (type === "task") {
    return firstLine.match(/^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\][ \t]+/)?.[0].length ?? null;
  }
  if (type === "list") {
    return firstLine.match(/^[ \t]{0,3}(?:[-*+]|\d+[.)])[ \t]+/)?.[0].length ?? null;
  }
  return null;
}

function findBackwardMarkdownBlockGap(
  value: string,
  cursor: number,
): { from: number; to: number } | null {
  const match = value.slice(0, cursor).match(/[ \t]*(?:\r?\n[ \t]*){2,}$/);
  if (!match) return null;
  return { from: cursor - match[0].length, to: cursor };
}

function findForwardMarkdownBlockGap(
  value: string,
  cursor: number,
): { from: number; to: number } | null {
  const match = value.slice(cursor).match(/^[ \t]*(?:\r?\n[ \t]*){2,}/);
  if (!match) return null;
  return { from: cursor, to: cursor + match[0].length };
}

export function detectBlockType(raw: string, atDocumentStart = false): string {
  if (isIndentedCodeBlock(raw)) return "code";
  if (isMarkdownTocLine(raw)) return "toc";

  const trimmed = raw.trimStart();
  if (atDocumentStart && getYamlFrontMatterRange(raw)) return "frontmatter";
  if (/^#{1,6}\s/.test(trimmed)) return "heading";
  if (isSetextHeadingBlock(trimmed)) return "heading";
  if (isMarkdownFencedMathBlock(raw)) return "math";
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  if (getCodeFenceOpeningMarker(firstLine)) return "code";
  if (readDollarMathBlockOpening(firstLine)) return "math";
  if (/^\\\[\s*(?:[\r\n]|$)/.test(trimmed)) return "math";
  if (isFootnoteDefinitionLine(firstLine)) return "footnote";
  if (/^>\s?/.test(trimmed)) return "quote";
  if (isRawHtmlBlockStart(trimmed)) return "html";
  if (/^\[[^\]\n]+]:\s*\S/.test(trimmed)) return "reference";
  if (/^\*\[[^\]\n]+]:\s*\S/.test(trimmed)) return "abbreviation";
  if (isDefinitionListBlock(trimmed)) return "definition";
  if (isMarkdownHorizontalRuleLine(raw)) return "rule";
  if (/^(?:[-*+]|\d+[.)])\s+\[[ xX]]\s/.test(trimmed)) return "task";
  if (/^[-*+]\s+/.test(trimmed)) return "list";
  if (/^\d+[.)]\s+/.test(trimmed)) return "list";
  if (isTableBlock(trimmed)) return "table";
  return "paragraph";
}

function isMarkdownAtxHeadingLine(line: string): boolean {
  const match = line.match(/^([ \t]*)(?:#{1,6})(?:[ \t]+|$)/);
  return Boolean(match && getIndentWidth(match[1]) < 4);
}

export function isMarkdownFencedMathBlock(value: string): boolean {
  const lines = value.split(/\r?\n/);
  const openingContext = getRawFenceLineContext(lines[0] ?? "");
  const container = stripMarkdownListContainerMarkers(
    openingContext.content,
    openingContext.contentColumn,
  );
  const openingContentColumn = openingContext.contentColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(container.content, openingContentColumn)) {
    return false;
  }
  const openingIndent = getLeadingMarkdownIndent(container.content);
  const opening = container.content.slice(openingIndent.length).match(/^(`{3,}|~{3,})([^\r\n]*)$/);
  if (!opening || opening[2].trim().toLowerCase() !== "math") return false;
  if (opening[1][0] === "`" && opening[2].includes("`")) return false;

  for (let index = 1; index < lines.length; index += 1) {
    const continuation = getRawFenceContinuationLine(
      lines[index] ?? "",
      openingContext.key,
      container.continuationIndentWidth,
    );
    if (!continuation) return false;
    const indent = getLeadingMarkdownIndent(continuation.content);
    if (isMarkdownCodeIndented(continuation.content, continuation.contentColumn)) continue;
    const closing = continuation.content.slice(indent.length).match(/^(`{3,}|~{3,})[ \t]*$/)?.[1];
    if (
      closing
      && closing[0] === opening[1][0]
      && closing.length >= opening[1].length
    ) {
      return true;
    }
  }
  return false;
}

export function isMarkdownHorizontalRuleLine(value: string): boolean {
  const line = value.replace(/\r?\n$/, "");
  return /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(line);
}

function isIndentedCodeBlock(value: string): boolean {
  const firstContentLine = value.split(/\r?\n/).find((line) => line.trim());
  return Boolean(firstContentLine && isMarkdownCodeIndented(firstContentLine));
}

function isIndentedCodeLine(line: string): boolean {
  return isMarkdownCodeIndented(line);
}

function canStartIndentedCodeBlock(
  markdown: string,
  lines: LineInfo[],
  lineIndex: number,
  blockStart: number,
): boolean {
  const line = lines[lineIndex];
  if (!line || line.start <= blockStart) return true;

  const pending = markdown.slice(blockStart, line.start);
  if (!pending.trim()) return true;
  const pendingType = detectBlockType(pending, blockStart === 0);
  if (pendingType !== "paragraph" && pendingType !== "quote") return true;

  const previous = getRawFenceLineContext(lines[lineIndex - 1]?.text ?? "").content;
  return /^(?:[ \t]{0,3})#{1,6}(?:[ \t]+|$)/.test(previous)
    || isMarkdownHorizontalRuleLine(previous);
}

function isFootnoteDefinitionLine(line: string): boolean {
  const context = getListLineContext(line);
  if (/^(?: {4,}|\t)/.test(context.content)) return false;
  let content = context.content;
  for (let depth = 0; depth < 16; depth += 1) {
    const marker = content.match(/^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]{1,4}/);
    if (!marker) break;
    content = content.slice(marker[0].length);
  }
  return /^[ \t]{0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:/.test(content);
}

function findFootnoteDefinitionEndLine(lines: LineInfo[], startIndex: number): number {
  let endLine = startIndex;
  let requiresIndentedContinuation = false;
  const definitionQuoteKey = getListLineContext(lines[startIndex]?.text ?? "").key;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].text;
    const context = getListLineContext(line);
    if (context.key !== definitionQuoteKey) break;
    if (!context.content.trim()) {
      if (hasFollowingFootnoteIndentedContinuationLine(lines, index + 1, definitionQuoteKey)) {
        endLine = index;
        requiresIndentedContinuation = true;
        continue;
      }
      break;
    }

    if (isFootnoteIndentedContinuationLine(line, definitionQuoteKey)) {
      endLine = index;
      requiresIndentedContinuation = false;
      continue;
    }

    if (!requiresIndentedContinuation && isFootnoteParagraphContinuationLine(line, definitionQuoteKey)) {
      endLine = index;
      continue;
    }

    break;
  }

  return endLine;
}

function hasFollowingFootnoteIndentedContinuationLine(
  lines: LineInfo[],
  startIndex: number,
  quoteKey: string,
): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getListLineContext(lines[index].text);
    if (!context.content.trim()) continue;
    return isFootnoteIndentedContinuationLine(lines[index].text, quoteKey);
  }
  return false;
}

function isFootnoteIndentedContinuationLine(line: string, quoteKey: string): boolean {
  const context = getListLineContext(line);
  return context.key === quoteKey && /^(?: {4,}| {0,3}\t)/.test(context.content);
}

function isFootnoteParagraphContinuationLine(line: string, quoteKey: string): boolean {
  const context = getListLineContext(line);
  if (context.key !== quoteKey || !context.content.trim()) return false;
  if (isFootnoteIndentedContinuationLine(line, quoteKey)) return true;
  return !isFootnoteInterruptingBlockLine(context.content.replace(/^ {0,3}/, ""));
}

function isFootnoteInterruptingBlockLine(content: string): boolean {
  return isMarkdownHorizontalRuleLine(content)
    || Boolean(readDollarMathBlockOpening(content))
    || /^(?:#{1,6}\s|(?:[-*+]|\d+[.)])\s+|>\s?|`{3,}|~{3,}|\\\[\s*$|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|\[[^\]\n]+]:\s*\S|<!--|<\/?[A-Za-z][^>\n]*>)/.test(content);
}

function isLinkReferenceDefinitionLine(line: string): boolean {
  return /^ {0,3}\[[^\]\n]+]:\s*\S/.test(line);
}

function findReferenceDefinitionEndLine(lines: LineInfo[], startIndex: number): number {
  let endLine = startIndex;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (index === startIndex + 1 && isReferenceTitleContinuationLine(lines[index].text)) {
      endLine = index;
      continue;
    }

    break;
  }

  return endLine;
}

function isReferenceTitleContinuationLine(line: string): boolean {
  return /^[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$/.test(line);
}

function findIndentedCodeEndLine(lines: LineInfo[], startIndex: number): number {
  let lastCodeLine = startIndex;
  let index = startIndex + 1;

  while (index < lines.length) {
    if (isIndentedCodeLine(lines[index].text)) {
      lastCodeLine = index;
      index += 1;
      continue;
    }

    if (!lines[index].text.trim() && hasFollowingIndentedCodeLine(lines, index + 1)) {
      index += 1;
      continue;
    }

    break;
  }

  return lastCodeLine;
}

function hasFollowingIndentedCodeLine(lines: LineInfo[], startIndex: number): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!lines[index].text.trim()) continue;
    return isIndentedCodeLine(lines[index].text);
  }
  return false;
}

type RawFence =
  | { kind: "code"; marker: string; key: string; listIndentWidth: number }
  | { kind: "math"; marker: "$$" | "\\["; key: string; listIndentWidth: number };

type RawHtmlBlock =
  | { kind: "untilBlank"; key: string }
  | { kind: "untilClose"; key: string; closePattern: RegExp };

function getRawFence(line: string): RawFence | null {
  const context = getRawFenceLineContext(line);
  const container = stripMarkdownListContainerMarkers(context.content, context.contentColumn);
  const contentColumn = context.contentColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(container.content, contentColumn)) return null;
  const codeMarker = getCodeFenceOpeningMarker(container.content, contentColumn);
  if (codeMarker) {
    return {
      kind: "code",
      marker: codeMarker,
      key: context.key,
      listIndentWidth: container.continuationIndentWidth,
    };
  }
  if (readDollarMathBlockOpening(container.content, 3, contentColumn)) {
    return {
      kind: "math",
      marker: "$$",
      key: context.key,
      listIndentWidth: container.continuationIndentWidth,
    };
  }
  const indent = getLeadingMarkdownIndent(container.content);
  if (/^\\\[\s*$/.test(container.content.slice(indent.length))) {
    return {
      kind: "math",
      marker: "\\[",
      key: context.key,
      listIndentWidth: container.continuationIndentWidth,
    };
  }
  return null;
}

function getCodeFenceOpeningMarker(line: string, startColumn = 0): string | null {
  const indent = getLeadingMarkdownIndent(line);
  if (isMarkdownCodeIndented(line, startColumn)) return null;
  const opening = line.slice(indent.length).match(/^(`{3,}|~{3,})([^\r\n]*)$/);
  if (!opening) return null;
  if (opening[1][0] === "`" && opening[2].includes("`")) return null;
  return opening[1];
}

function findRawFenceEndLine(lines: LineInfo[], startIndex: number, fence: RawFence): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const continuation = getRawFenceContinuationLine(
      lines[index].text,
      fence.key,
      fence.listIndentWidth,
    );
    if (!continuation) {
      if (fence.kind === "code" || fence.listIndentWidth > 0) return index - 1;
      continue;
    }
    const indent = getLeadingMarkdownIndent(continuation.content);
    if (isMarkdownCodeIndented(continuation.content, continuation.contentColumn)) continue;
    const semantic = continuation.content.slice(indent.length);

    if (
      fence.kind === "math"
      && fence.marker === "$$"
      && isDollarMathBlockClosing(continuation.content, 3, continuation.contentColumn)
    ) return index;
    if (fence.kind === "math" && fence.marker === "\\[" && /^\\\]\s*$/.test(semantic)) return index;
    if (fence.kind === "code") {
      const closing = semantic.match(/^(`{3,}|~{3,})[ \t]*$/);
      if (closing && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length) {
        return index;
      }
    }
  }
  return lines.length - 1;
}

function getRawHtmlBlock(line: string): RawHtmlBlock | null {
  const context = getRawFenceLineContext(line);
  const content = context.content;
  if (isMarkdownCodeIndented(content)) return null;
  const trimmedLine = content.trimStart();
  if (!trimmedLine.startsWith("<")) return null;

  if (/^<!--/.test(trimmedLine)) return { kind: "untilClose", key: context.key, closePattern: /-->/ };
  if (/^<\?/.test(trimmedLine)) return { kind: "untilClose", key: context.key, closePattern: /\?>/ };
  if (/^<![A-Z]/.test(trimmedLine)) return { kind: "untilClose", key: context.key, closePattern: />/ };
  if (/^<!\[CDATA\[/.test(trimmedLine)) return { kind: "untilClose", key: context.key, closePattern: /\]\]>/ };

  const rawTag = trimmedLine.match(/^<(script|pre|style|textarea)(?=[\s>/])/i);
  if (rawTag) {
    return {
      kind: "untilClose",
      key: context.key,
      closePattern: new RegExp(`</${rawTag[1]}\\s*>`, "i"),
    };
  }

  if (isPlainRawHtmlBlock(trimmedLine)) {
    return { kind: "untilBlank", key: context.key };
  }

  return null;
}

function findRawHtmlBlockEndLine(lines: LineInfo[], startIndex: number, block: RawHtmlBlock): number {
  const quoteDepth = block.key.startsWith("quote:")
    ? Number.parseInt(block.key.slice("quote:".length), 10)
    : 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getRawFenceLineContext(lines[index].text, quoteDepth);
    if (context.key !== block.key) return Math.max(startIndex, index - 1);

    if (block.kind === "untilBlank") {
      if (index > startIndex && !context.content.trim()) return index - 1;
      continue;
    }

    if (block.closePattern.test(context.content)) return index;
  }

  return lines.length - 1;
}

function isPlainRawHtmlBlock(value: string): boolean {
  return /^<\/?(address|article|aside|audio|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul|video)(?=[\s>/])/i.test(value);
}

function isRawHtmlBlockStart(value: string): boolean {
  return /^<!--/.test(value)
    || /^<\?/.test(value)
    || /^<![A-Z]/.test(value)
    || /^<!\[CDATA\[/.test(value)
    || /^<(script|pre|style|textarea)(?=[\s>/])/i.test(value)
    || isPlainRawHtmlBlock(value);
}

function getRawFenceLineContext(
  line: string,
  maximumQuoteDepth: number | null = null,
): {
  content: string;
  contentColumn: number;
  key: string;
} {
  const quote = readMarkdownBlockquotePrefix(line, maximumQuoteDepth);
  return quote
    ? {
      content: line.slice(quote.raw.length),
      contentColumn: quote.contentColumn,
      key: `quote:${quote.depth}`,
    }
    : { content: line, contentColumn: 0, key: "plain" };
}

function getRawFenceContinuationLine(
  line: string,
  key: string,
  listIndentWidth: number,
): { content: string; contentColumn: number } | null {
  if (key === "plain" && listIndentWidth === 0) {
    return { content: line, contentColumn: 0 };
  }
  const quoteDepth = key.startsWith("quote:")
    ? Number.parseInt(key.slice("quote:".length), 10)
    : 0;
  const context = getRawFenceLineContext(line, quoteDepth);
  if (context.key !== key) return null;
  if (listIndentWidth === 0 || !context.content.trim()) {
    return { content: context.content, contentColumn: context.contentColumn };
  }
  const stripped = stripMarkdownIndentColumns(
    context.content,
    listIndentWidth,
    context.contentColumn,
  );
  return stripped
    ? {
      content: stripped.content,
      contentColumn: context.contentColumn + listIndentWidth,
    }
    : null;
}

function getSetextHeadingStartLine(
  lines: LineInfo[],
  underlineIndex: number,
  blockStart: number,
): number | null {
  const underline = lines[underlineIndex]?.text ?? "";
  if (!isSetextUnderlineLine(underline)) return null;

  let startIndex = underlineIndex - 1;
  while (
    startIndex >= 0
    && lines[startIndex].start >= blockStart
    && isSetextHeadingTextLine(lines[startIndex].text)
  ) {
    startIndex -= 1;
  }

  const headingStartIndex = startIndex + 1;
  return headingStartIndex < underlineIndex ? headingStartIndex : null;
}

function isSetextHeadingBlock(value: string): boolean {
  const lines = value.replace(/\r?\n$/, "").split(/\r?\n/);
  if (lines.length < 2) return false;
  const underline = lines[lines.length - 1] ?? "";
  return isSetextUnderlineLine(underline)
    && lines.slice(0, -1).every(isSetextHeadingTextLine);
}

function isSetextUnderlineLine(value: string): boolean {
  return /^[ \t]{0,3}(?:={2,}|-{2,})[ \t]*$/.test(value);
}

function isSetextHeadingTextLine(value: string): boolean {
  const title = value.trim();
  return Boolean(title)
    && !/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|\|)/.test(title)
    && !/^\[[^\]]+]:/.test(title);
}

function isTableBlock(value: string): boolean {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  return lines.length >= 2 && isTableStartLine(
    lines.map((text) => ({ text, start: 0, end: text.length })),
    0,
  );
}

function isTableStartLine(lines: LineInfo[], index: number): boolean {
  const header = lines[index]?.text ?? "";
  const separator = lines[index + 1]?.text ?? "";
  if (isIndentedCodeLine(header) || isIndentedCodeLine(separator)) return false;
  if (!isTableRow(header) || !isTableSeparator(separator)) return false;
  return splitTableRow(header).length === splitTableRow(separator).length;
}

function findTableEndLine(lines: LineInfo[], startIndex: number): number {
  let endLine = startIndex + 1;
  for (let index = startIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].text.trim() || !isTableRow(lines[index].text)) break;
    endLine = index;
  }
  return endLine;
}

function isDefinitionListBlock(value: string): boolean {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return false;

  for (let index = 1; index < lines.length; index += 1) {
    if (!/^[ \t]{0,3}:(?:[ \t]+|$)/.test(lines[index])) continue;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (/^[ \t]{0,3}:(?:[ \t]+|$)/.test(lines[cursor])) continue;
      return isDefinitionTermLine(lines[cursor]);
    }
  }

  return false;
}

function findDefinitionListEndLine(lines: LineInfo[], startIndex: number): number | null {
  const startContext = getDefinitionListLineContext(lines[startIndex]?.text ?? "");
  const key = startContext.key;
  if (!isDefinitionListEntryStart(lines, startIndex, key)) return null;

  let index = startIndex;
  let endLine = startIndex;

  while (index < lines.length) {
    if (!isDefinitionListEntryStart(lines, index, key)) break;

    while (index < lines.length && isDefinitionListTermLineAt(lines[index].text, key)) {
      endLine = index;
      index += 1;
    }

    while (index < lines.length) {
      if (!isDefinitionListMarkerLineAt(lines[index]?.text ?? "", key)) break;
      endLine = index;
      index += 1;

      while (index < lines.length) {
        const context = getDefinitionListLineContext(lines[index]?.text ?? "");
        if (context.key !== key) return endLine;
        if (isDefinitionListMarkerLineAt(lines[index].text, key)) break;
        if (isDefinitionListEntryStart(lines, index, key)) break;
        if (!context.content.trim()) {
          if (!hasFollowingDefinitionListBlockContinuationLine(lines, index + 1, key)) return endLine;
          endLine = index;
          index += 1;
          continue;
        }
        if (!isDefinitionListContinuationLineAt(lines[index].text, key)) return endLine;
        endLine = index;
        index += 1;
      }
    }
  }

  return endLine;
}

function findMarkdownListEndLine(lines: LineInfo[], startIndex: number): number | null {
  const startContext = getMarkdownListLineContext(lines[startIndex]?.text ?? "");
  const key = startContext.key;
  if (!isMarkdownListMarkerLineAt(lines[startIndex]?.text ?? "", key)) return null;

  let endLine = startIndex;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const context = getMarkdownListLineContext(lines[index].text);
    if (context.key !== key) {
      const previous = getMarkdownListLineContext(lines[index - 1]?.text ?? "");
      if (
        key !== "plain"
        && context.key === "plain"
        && previous.content.trim()
        && isMarkdownListLazyContinuation(lines, index, key)
      ) {
        endLine = index;
        continue;
      }
      break;
    }

    if (isMarkdownHorizontalRuleLine(context.content)) break;

    if (isMarkdownListMarkerContent(context.content)) {
      endLine = index;
      continue;
    }

    if (!context.content.trim()) {
      if (!hasFollowingMarkdownListLine(lines, index + 1, key)) {
        break;
      }
      endLine = index;
      continue;
    }

    if (isMarkdownListContinuationContent(context.content)) {
      endLine = index;
      continue;
    }

    const previous = getMarkdownListLineContext(lines[index - 1]?.text ?? "");
    if (
      previous.content.trim()
      && isMarkdownListLazyContinuation(lines, index, key)
    ) {
      endLine = index;
      continue;
    }

    break;
  }

  return endLine;
}

function isMarkdownListLazyContinuation(
  lines: LineInfo[],
  index: number,
  key: string,
): boolean {
  const context = getMarkdownListLineContext(lines[index]?.text ?? "");
  if (!context.content.trim()) return false;
  if (context.key !== key && !(key !== "plain" && context.key === "plain")) return false;
  if (isMarkdownListMarkerContent(context.content)) return false;
  return !isMarkdownListInterruptingContent(lines, index, context.key);
}

function isMarkdownListInterruptingContent(
  lines: LineInfo[],
  index: number,
  key: string,
): boolean {
  const content = getMarkdownListLineContext(lines[index]?.text ?? "").content.replace(/^ {0,3}/, "");
  if (readDollarMathBlockOpening(content)) return true;
  if (
    /^(?:#{1,6}(?:[ \t]+|$)|>|(?:`{3,}|~{3,})(?:[^\r\n]*)$|\\\[[ \t]*$)/.test(content)
  ) {
    return true;
  }
  if (isMarkdownHorizontalRuleLine(content)) return true;
  if (/^(?:\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|\[[^\]\n]+]:[ \t]*\S|[ \t]{0,3}:(?:[ \t]+|$))/.test(content)) {
    return true;
  }
  if (isRawHtmlBlockStart(content)) return true;

  const next = getMarkdownListLineContext(lines[index + 1]?.text ?? "");
  return next.key === key && isTableRow(content) && isTableSeparator(next.content);
}

function isDefinitionListEntryStart(lines: LineInfo[], startIndex: number, key: string): boolean {
  let index = startIndex;
  while (index < lines.length && isDefinitionListTermLineAt(lines[index].text, key)) {
    index += 1;
  }
  return index > startIndex && isDefinitionListMarkerLineAt(lines[index]?.text ?? "", key);
}

function isDefinitionListTermLineAt(line: string, key: string): boolean {
  const context = getDefinitionListLineContext(line);
  return context.key === key && isDefinitionTermLine(context.content);
}

function isDefinitionListMarkerLineAt(line: string, key: string): boolean {
  const context = getDefinitionListLineContext(line);
  return context.key === key && /^[ \t]{0,3}:(?:[ \t]+|$)/.test(context.content);
}

function isDefinitionListContinuationLineAt(line: string, key: string): boolean {
  const context = getDefinitionListLineContext(line);
  return context.key === key && /^(?:[ \t]{2,}|\t)/.test(context.content);
}

function hasFollowingDefinitionListBlockContinuationLine(lines: LineInfo[], startIndex: number, key: string): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getDefinitionListLineContext(lines[index].text);
    if (context.key !== key) return false;
    if (!context.content.trim()) continue;
    return /^(?:[ \t]{4,}|\t)/.test(context.content);
  }
  return false;
}

function getDefinitionListLineContext(line: string): { content: string; key: string } {
  return getRawFenceLineContext(line);
}

function isDefinitionTermLine(line: string): boolean {
  if (!line.trim()) return false;
  if (/^(?: {4,}|\t)/.test(line)) return false;
  if (/^[ \t]{0,3}:(?:[ \t]+|$)/.test(line)) return false;
  return !/^[ \t]{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|(?:-{3,}|\+{3,}|\*{3,}|_{3,})\s*$|\[[^\]\n]+]:\s*\S|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|`{3,}|~{3,}|<|\|)/.test(line);
}

function isMarkdownListMarkerLineAt(line: string, key: string): boolean {
  const context = getMarkdownListLineContext(line);
  return context.key === key && isMarkdownListMarkerContent(context.content);
}

function isMarkdownListMarkerContent(content: string): boolean {
  return /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/.test(content);
}

function isMarkdownListContinuationContent(content: string): boolean {
  return /^(?:[ \t]{2,}|\t)/.test(content);
}

function hasFollowingMarkdownListLine(lines: LineInfo[], startIndex: number, key: string): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getMarkdownListLineContext(lines[index].text);
    if (context.key !== key) return false;
    if (!context.content.trim()) continue;
    return isMarkdownListMarkerContent(context.content) || isMarkdownListContinuationContent(context.content);
  }
  return false;
}

function getMarkdownListLineContext(line: string): { content: string; key: string } {
  return getRawFenceLineContext(line);
}

function isTableRow(line: string): boolean {
  return countUnescapedPipes(line.trim()) > 0;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  let content = line.trim();
  if (content.startsWith("|")) {
    content = content.slice(1);
  }
  if (content.endsWith("|") && !isEscapedAt(content, content.length - 1)) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscapedAt(content, index)) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += content[index];
  }
  cells.push(current.trim());
  return cells;
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
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

export function indentSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
  indentSize = 2,
): { value: string; selectionStart: number; selectionEnd: number } {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEnd = selectionEnd === selectionStart
    ? value.indexOf("\n", selectionEnd)
    : value.indexOf("\n", selectionEnd - 1);
  const normalizedLineEnd = lineEnd === -1 ? value.length : lineEnd;

  return indentLineRange(
    value,
    lineStart,
    normalizedLineEnd,
    selectionStart,
    selectionEnd,
    outdent,
    indentSize,
  );
}

export function isMarkdownListItemAtOffset(value: string, offset: number): boolean {
  const position = Math.max(0, Math.min(offset, value.length));
  const lineInfos = collectLines(value);
  const lineIndex = getLineIndexAtOffset(value, position);
  const line = lineInfos[lineIndex];
  if (!line) return false;

  const lines = lineInfos.map((item) => item.text);
  const context = getListLineContext(line.text);
  const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
  return Boolean(
    marker
    && isListMarkerIndentAllowedAt(lines, lineIndex, context.key, marker[1]),
  );
}


export function applyContextualMarkdownTab(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
  indentSize = 2,
  codeIndentSize = 4,
): { value: string; selectionStart: number; selectionEnd: number } {
  const normalizedIndentSize = indentSize === 4 ? 4 : 2;
  const normalizedCodeIndentSize = normalizeCodeIndentSize(codeIndentSize);
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const lineInfos = collectLines(value);
  const frontMatter = getFrontMatterContentRange(lineInfos);

  if (
    frontMatter
    && start >= frontMatter.start
    && (start === end ? start < frontMatter.end : end <= frontMatter.end)
  ) {
    if (outdent) return { value, selectionStart: start, selectionEnd: end };

    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const linePrefix = value.slice(lineStart, start);
    const insertion = /^[ \t]*$/.test(linePrefix)
      ? " ".repeat(normalizedIndentSize)
      : "\t";
    return replaceTextSelection(value, start, end, insertion);
  }

  if (start !== end) {
    const startLine = getLineIndexAtOffset(value, start);
    const endLine = getLineIndexAtOffset(value, Math.max(start, end - 1));
    if (
      isRawBlockLineRange(lineInfos, startLine, endLine)
      || isIndentedCodeLineRange(lineInfos, startLine, endLine)
    ) {
      return indentSelection(value, start, end, outdent, normalizedCodeIndentSize);
    }
    if (isMarkdownListLineRange(lineInfos, startLine, endLine)) {
      return indentSelection(value, start, end, outdent, normalizedIndentSize);
    }
    if (outdent) {
      return outdentMarkdownQuoteRange(value, start, end, lineInfos)
        ?? indentSelection(value, start, end, true, normalizedIndentSize);
    }
    return replaceTextSelection(value, start, end, "\t");
  }

  const lineIndex = getLineIndexAtOffset(value, start);
  const line = lineInfos[lineIndex];
  const isListLine = isMarkdownListItemAtOffset(value, start);
  const isCodeLine = Boolean(
    line
    && !isListLine
    && (isLineInsideRawBlock(lineInfos, lineIndex) || isIndentedCodeLine(line.text)),
  );
  if (line && !isCodeLine) {
    const lines = lineInfos.map((item) => item.text);
    const context = getListLineContext(line.text);
    const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (marker && isListMarkerIndentAllowedAt(lines, lineIndex, context.key, marker[1])) {
      const currentIndentWidth = getIndentWidth(marker[1]);
      if (outdent) {
        if (currentIndentWidth === 0) {
          return unwrapRootMarkdownListItem(value, start, line, context);
        }
      } else if (!hasPreviousListSibling(lines, lineIndex, context, currentIndentWidth)) {
        return insertTabAtCursor(value, start);
      }

      const subtreeEndLine = findListSubtreeEndLine(lines, lineIndex, context, currentIndentWidth);
      const subtreeEnd = lineInfos[subtreeEndLine].start + lineInfos[subtreeEndLine].text.length;
      return indentLineRange(
        value,
        line.start,
        subtreeEnd,
        start,
        end,
        outdent,
        normalizedIndentSize,
      );
    }
  }

  if (isCodeLine && line) {
    if (!outdent) return insertTabAtCursor(value, start);
    return indentLineRange(
      value,
      line.start,
      line.start + line.text.length,
      start,
      end,
      true,
      normalizedCodeIndentSize,
    );
  }

  if (outdent) {
    const quoteResult = outdentMarkdownQuoteRange(value, start, end, lineInfos);
    if (quoteResult) return quoteResult;
  }

  if (!outdent) {
    return insertTabAtCursor(value, start);
  }

  const removable = getRemovableIndentBeforeCursor(value, start, normalizedIndentSize);
  if (removable === 0) return unchangedTextEdit(value, start);
  return {
    value: value.slice(0, start - removable) + value.slice(start),
    selectionStart: start - removable,
    selectionEnd: start - removable,
  };
}

function getFrontMatterContentRange(lines: LineInfo[]): { start: number; end: number } | null {
  if (!isYamlFrontMatterOpening(lines[0]?.text ?? "")) return null;
  const closing = lines.findIndex((line, index) => index > 0 && isYamlFrontMatterClosing(line.text));
  if (closing < 0) return null;
  return { start: lines[0].end, end: lines[closing].start };
}

function replaceTextSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  replacement: string,
): { value: string; selectionStart: number; selectionEnd: number } {
  const cursor = selectionStart + replacement.length;
  return {
    value: value.slice(0, selectionStart) + replacement + value.slice(selectionEnd),
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

function isRawBlockLineRange(lines: LineInfo[], startLine: number, endLine: number): boolean {
  if (startLine > endLine || !lines[startLine]) return false;
  const rawBlockEnd = getContainingRawBlockEndLine(lines, startLine);
  return rawBlockEnd !== null && endLine <= rawBlockEnd;
}

function isLineInsideRawBlock(lines: LineInfo[], lineIndex: number): boolean {
  return getContainingRawBlockEndLine(lines, lineIndex) !== null;
}

function getContainingRawBlockEndLine(lines: LineInfo[], lineIndex: number): number | null {
  for (let index = 0; index <= lineIndex; index += 1) {
    const fence = getRawFence(lines[index]?.text ?? "");
    if (fence) {
      const end = findRawFenceEndLine(lines, index, fence);
      if (lineIndex <= end) return end;
      index = end;
      continue;
    }

    const html = getRawHtmlBlock(lines[index]?.text ?? "");
    if (!html) continue;
    const end = findRawHtmlBlockEndLine(lines, index, html);
    if (lineIndex <= end) return end;
    index = end;
  }
  return null;
}
function isIndentedCodeLineRange(lines: LineInfo[], startLine: number, endLine: number): boolean {
  let hasContent = false;
  for (let index = startLine; index <= endLine; index += 1) {
    const text = lines[index]?.text ?? "";
    if (!text.trim()) continue;
    hasContent = true;
    if (!isIndentedCodeLine(text)) return false;
  }
  return hasContent;
}

function isMarkdownListLineRange(lines: LineInfo[], startLine: number, endLine: number): boolean {
  for (let index = startLine; index >= 0; index -= 1) {
    const listEnd = findMarkdownListEndLine(lines, index);
    if (listEnd !== null && listEnd >= endLine) return true;
  }
  return false;
}

function unwrapRootMarkdownListItem(
  value: string,
  cursor: number,
  line: LineInfo,
  context: ListLineContext,
): { value: string; selectionStart: number; selectionEnd: number } {
  const marker = context.content.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/);
  if (!marker) return unchangedTextEdit(value, cursor);
  const start = line.start + context.prefix.length;
  const end = start + marker[0].length;
  const nextValue = value.slice(0, start) + value.slice(end);
  const nextCursor = cursor <= end ? start : cursor - marker[0].length;
  return { value: nextValue, selectionStart: nextCursor, selectionEnd: nextCursor };
}

interface TextReplacement {
  start: number;
  end: number;
  text: string;
}

function outdentMarkdownQuoteRange(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  lines: LineInfo[],
): { value: string; selectionStart: number; selectionEnd: number } | null {
  if (lines.length === 0) return null;
  const firstSelectedLine = getLineIndexAtOffset(value, selectionStart);
  const lastSelectedLine = getLineIndexAtOffset(value, Math.max(selectionStart, selectionEnd - 1));
  let firstQuoteLine = -1;
  let lastQuoteLine = -1;

  for (let index = firstSelectedLine; index <= lastSelectedLine; index += 1) {
    if (!getQuotePrefixInfo(lines[index]?.text ?? "")) continue;
    if (firstQuoteLine < 0) firstQuoteLine = index;
    lastQuoteLine = index;
  }
  if (firstQuoteLine < 0 || lastQuoteLine < 0) return null;

  const targetDepth = getQuotePrefixInfo(lines[firstQuoteLine].text)?.depth ?? 0;
  if (targetDepth === 0) return null;

  while (firstQuoteLine > 0) {
    const previous = getQuotePrefixInfo(lines[firstQuoteLine - 1].text);
    if (!previous || previous.depth < targetDepth || isBlankQuoteLine(lines[firstQuoteLine - 1].text, previous)) break;
    firstQuoteLine -= 1;
  }
  while (lastQuoteLine + 1 < lines.length) {
    const next = getQuotePrefixInfo(lines[lastQuoteLine + 1].text);
    if (!next || next.depth < targetDepth || isBlankQuoteLine(lines[lastQuoteLine + 1].text, next)) break;
    lastQuoteLine += 1;
  }

  let editStartLine = firstQuoteLine;
  let editEndLine = lastQuoteLine;
  if (hasQuoteBoundaryBefore(lines, firstQuoteLine, targetDepth)) editStartLine -= 1;
  if (hasQuoteBoundaryAfter(lines, lastQuoteLine, targetDepth)) editEndLine += 1;

  const replacements: TextReplacement[] = [];
  for (let index = editStartLine; index <= editEndLine; index += 1) {
    const line = lines[index];
    const quote = getQuotePrefixInfo(line?.text ?? "");
    if (!line || !quote || quote.depth < targetDepth) continue;
    const content = line.text.slice(quote.raw.length);
    const nextPrefix = quote.depth === 1
      ? quote.leading
      : quote.leading + "> ".repeat(quote.depth - 1);
    replacements.push({
      start: line.start,
      end: line.start + quote.raw.length,
      text: content ? nextPrefix : nextPrefix.trimEnd(),
    });
  }
  if (replacements.length === 0) return null;

  const nextSelectionStart = mapOffsetThroughReplacements(selectionStart, replacements);
  const nextSelectionEnd = mapOffsetThroughReplacements(selectionEnd, replacements);
  let nextValue = value;
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index];
    nextValue = nextValue.slice(0, replacement.start)
      + replacement.text
      + nextValue.slice(replacement.end);
  }
  return {
    value: nextValue,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  };
}

function isBlankQuoteLine(line: string, quote: QuotePrefixInfo): boolean {
  return !line.slice(quote.raw.length).trim();
}

function hasQuoteBoundaryBefore(lines: LineInfo[], lineIndex: number, depth: number): boolean {
  if (lineIndex < 2) return false;
  const boundary = getQuotePrefixInfo(lines[lineIndex - 1].text);
  const content = getQuotePrefixInfo(lines[lineIndex - 2].text);
  return Boolean(
    boundary
    && boundary.depth >= depth
    && isBlankQuoteLine(lines[lineIndex - 1].text, boundary)
    && content
    && content.depth >= depth
    && !isBlankQuoteLine(lines[lineIndex - 2].text, content),
  );
}

function hasQuoteBoundaryAfter(lines: LineInfo[], lineIndex: number, depth: number): boolean {
  if (lineIndex + 2 >= lines.length) return false;
  const boundary = getQuotePrefixInfo(lines[lineIndex + 1].text);
  const content = getQuotePrefixInfo(lines[lineIndex + 2].text);
  return Boolean(
    boundary
    && boundary.depth >= depth
    && isBlankQuoteLine(lines[lineIndex + 1].text, boundary)
    && content
    && content.depth >= depth
    && !isBlankQuoteLine(lines[lineIndex + 2].text, content),
  );
}

function mapOffsetThroughReplacements(offset: number, replacements: TextReplacement[]): number {
  let delta = 0;
  for (const replacement of replacements) {
    if (offset < replacement.start) break;
    if (offset <= replacement.end) {
      return replacement.start + delta + Math.min(replacement.text.length, offset - replacement.start);
    }
    delta += replacement.text.length - (replacement.end - replacement.start);
  }
  return offset + delta;
}

function insertTabAtCursor(
  value: string,
  cursor: number,
): { value: string; selectionStart: number; selectionEnd: number } {
  return {
    value: `${value.slice(0, cursor)}\t${value.slice(cursor)}`,
    selectionStart: cursor + 1,
    selectionEnd: cursor + 1,
  };
}

function indentLineRange(
  value: string,
  lineStart: number,
  normalizedLineEnd: number,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
  indentSize: number,
): { value: string; selectionStart: number; selectionEnd: number } {
  const normalizedIndentSize = normalizeLineIndentSize(indentSize);
  const firstLineIndex = getLineIndexAtOffset(value, lineStart);
  const before = value.slice(0, lineStart);
  const selected = value.slice(lineStart, normalizedLineEnd);
  const after = value.slice(normalizedLineEnd);
  const lines = selected.split("\n");
  const transforms: IndentLineTransform[] = [];

  const nextLines = lines.map((line) => {
    const changeColumn = getIndentChangeColumn(line);
    if (outdent) {
      const prefix = line.slice(0, changeColumn);
      const rest = line.slice(changeColumn);
      const nextRest = rest.startsWith("\t")
        ? rest.slice(1)
        : rest.slice(Math.min(rest.match(/^ */)?.[0].length ?? 0, normalizedIndentSize));
      const removed = rest.length - nextRest.length;
      const nextLine = `${prefix}${nextRest}`;
      transforms.push({
        oldLength: line.length,
        newLength: nextLine.length,
        changeColumn,
        removed,
        inserted: 0,
      });
      return nextLine;
    }

    const indent = " ".repeat(normalizedIndentSize);
    const nextLine = `${line.slice(0, changeColumn)}${indent}${line.slice(changeColumn)}`;
    transforms.push({
      oldLength: line.length,
      newLength: nextLine.length,
      changeColumn,
      removed: 0,
      inserted: normalizedIndentSize,
    });
    return nextLine;
  });

  const nextValue = `${before}${nextLines.join("\n")}${after}`;
  const nextSelectionStart = lineStart + mapIndentOffset(selectionStart - lineStart, transforms);
  const nextSelectionEnd = lineStart + mapIndentOffset(selectionEnd - lineStart, transforms);
  const renumberedValue = renumberOrderedListBlockAtLine(nextValue, firstLineIndex);

  return {
    value: renumberedValue,
    selectionStart: mapOffsetAfterRenumber(nextValue, renumberedValue, nextSelectionStart),
    selectionEnd: mapOffsetAfterRenumber(nextValue, renumberedValue, nextSelectionEnd),
  };
}

function normalizeLineIndentSize(value: number): number {
  return Number.isInteger(value) && value >= 2 && value <= 5 ? value : 2;
}

function normalizeCodeIndentSize(value: number): number {
  return Number.isInteger(value) && value >= 2 && value <= 5 ? value : 4;
}

function hasPreviousListSibling(
  lines: string[],
  lineIndex: number,
  currentContext: ListLineContext,
  currentIndentWidth: number,
): boolean {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const context = getListLineContext(lines[index] ?? "");
    if (!context.content.trim()) continue;

    if (context.key === currentContext.key) {
      const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
      if (marker && isListMarkerIndentAllowedAt(lines, index, currentContext.key, marker[1])) {
        const width = getIndentWidth(marker[1]);
        if (width === currentIndentWidth) return true;
        if (width < currentIndentWidth) return false;
        continue;
      }
    }

    const relativeContent = getContentRelativeToListQuote(lines[index] ?? "", currentContext);
    if (relativeContent && getIndentWidth(relativeContent.match(/^\s*/)?.[0] ?? "") > currentIndentWidth) {
      continue;
    }
    return false;
  }

  return false;
}


function findListSubtreeEndLine(
  lines: string[],
  lineIndex: number,
  currentContext: ListLineContext,
  currentIndentWidth: number,
): number {
  let end = lineIndex;
  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const context = getListLineContext(lines[index] ?? "");
    if (!context.content.trim()) continue;

    if (context.key === currentContext.key) {
      const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
      if (marker && isListMarkerIndentAllowedAt(lines, index, currentContext.key, marker[1])) {
        if (getIndentWidth(marker[1]) <= currentIndentWidth) break;
        end = index;
        continue;
      }
    }

    const relativeContent = getContentRelativeToListQuote(lines[index] ?? "", currentContext);
    if (relativeContent && getIndentWidth(relativeContent.match(/^\s*/)?.[0] ?? "") > currentIndentWidth) {
      end = index;
      continue;
    }
    break;
  }

  return end;
}

function getContentRelativeToListQuote(line: string, currentContext: ListLineContext): string | null {
  if (currentContext.key === "plain") return line;
  if (line.startsWith(currentContext.prefix)) return line.slice(currentContext.prefix.length);
  const context = getListLineContext(line);
  return context.key === currentContext.key ? context.content : null;
}

function getRemovableIndentBeforeCursor(value: string, cursor: number, indentSize: number): number {
  if (cursor <= 0) return 0;
  if (value[cursor - 1] === "\t") return 1;

  const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
  let removable = 0;
  for (let index = cursor - 1; index >= lineStart && removable < indentSize; index -= 1) {
    if (value[index] !== " ") break;
    removable += 1;
  }
  return removable;
}

function unchangedTextEdit(
  value: string,
  cursor: number,
): { value: string; selectionStart: number; selectionEnd: number } {
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

interface OrderedListFrame {
  width: number;
  delimiter: string;
  next: string;
}

interface IndentLineTransform {
  oldLength: number;
  newLength: number;
  changeColumn: number;
  removed: number;
  inserted: number;
}

interface QuotePrefixInfo {
  raw: string;
  key: string;
  leading: string;
  depth: number;
}

interface ListLineContext {
  prefix: string;
  content: string;
  key: string;
}

export function renumberOrderedListBlockAtLine(
  value: string,
  touchedLineIndex: number,
  baseStartNumber?: string,
): string {
  const lines = value.split("\n");
  const range = findListBlockRange(lines, touchedLineIndex);
  if (!range) return value;

  const baseWidth = getListBlockBaseWidth(lines, range.start, range.end, range.key);
  const frames: OrderedListFrame[] = [];

  for (let index = range.start; index <= range.end; index += 1) {
    const context = getListLineContext(lines[index]);
    if (context.key !== range.key) continue;

    const ordered = context.content.match(/^(\s*)(\d+)([.)])(\s+)/);
    if (ordered) {
      const width = getIndentWidth(ordered[1]);
      while (frames.length > 0 && frames[frames.length - 1].width > width) {
        frames.pop();
      }
      if (
        frames.length === 0
        || frames[frames.length - 1].width !== width
        || frames[frames.length - 1].delimiter !== ordered[3]
      ) {
        while (frames.length > 0 && frames[frames.length - 1].width >= width) {
          frames.pop();
        }
        frames.push({
          width,
          delimiter: ordered[3],
          next: width === baseWidth
            ? normalizeOrderedListNumber(baseStartNumber ?? ordered[2])
            : "1",
        });
      }

      const frame = frames[frames.length - 1];
      lines[index] = `${context.prefix}${ordered[1]}${frame.next}${ordered[3]}${ordered[4]}${context.content.slice(ordered[0].length)}`;
      frame.next = incrementOrderedListNumber(frame.next);
      continue;
    }

    const unordered = context.content.match(/^(\s*)[-*+]\s+/);
    if (unordered) {
      const width = getIndentWidth(unordered[1]);
      while (frames.length > 0 && frames[frames.length - 1].width >= width) {
        frames.pop();
      }
      continue;
    }

    if (!context.content.trim()) {
      frames.length = 0;
      continue;
    }

    const width = getIndentWidth(context.content.match(/^\s*/)?.[0] ?? "");
    while (frames.length > 0 && frames[frames.length - 1].width >= width) {
      frames.pop();
    }
  }

  return lines.join("\n");
}

function findListBlockRange(lines: string[], touchedLineIndex: number): { start: number; end: number; key: string } | null {
  const key = getListLineContext(lines[touchedLineIndex] ?? "").key;
  if (!isListBlockLineAt(lines, touchedLineIndex, key)) return null;

  let start = touchedLineIndex;
  let end = touchedLineIndex;
  while (start > 0 && isListBlockLineAt(lines, start - 1, key)) start -= 1;
  while (end + 1 < lines.length && isListBlockLineAt(lines, end + 1, key)) end += 1;
  return { start, end, key };
}

function isListBlockLineAt(lines: string[], lineIndex: number, key: string): boolean {
  const line = lines[lineIndex] ?? "";
  const context = getListLineContext(line);
  if (context.key !== key || !context.content.trim()) return false;

  const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
  if (marker) {
    return isListMarkerIndentAllowedAt(lines, lineIndex, key, marker[1]);
  }

  const continuation = context.content.match(/^([ \t]{2,}|\t)\S/);
  return Boolean(continuation && hasParentListMarkerBefore(lines, lineIndex, key, continuation[1]));
}

function getListBlockBaseWidth(lines: string[], start: number, end: number, key: string): number {
  let width = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    const context = getListLineContext(lines[index]);
    if (context.key !== key) continue;
    const match = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (match && isListMarkerIndentAllowedAt(lines, index, key, match[1])) {
      width = Math.min(width, getIndentWidth(match[1]));
    }
  }
  return Number.isFinite(width) ? width : 0;
}

function isListMarkerIndentAllowedAt(lines: string[], lineIndex: number, key: string, indent: string): boolean {
  return getIndentWidth(indent) < 4 || hasParentListMarkerBefore(lines, lineIndex, key, indent);
}

function hasParentListMarkerBefore(lines: string[], lineIndex: number, key: string, indent: string): boolean {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const context = getListLineContext(lines[index] ?? "");
    if (context.key !== key) {
      if (context.content.trim()) return false;
      continue;
    }

    const body = context.content.replace(/\r$/, "");
    if (!body.trim()) continue;

    const marker = body.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (marker) {
      if (!isListMarkerIndentAllowedAt(lines, index, key, marker[1])) return false;
      if (getIndentWidth(marker[1]) <= getIndentWidth(indent)) return true;
      continue;
    }

    if (/^(?:[ \t]{2,}|\t)/.test(body)) {
      continue;
    }

    return false;
  }

  return false;
}

function isDeeperIndent(indent: string, parentIndent: string): boolean {
  return getIndentWidth(indent) > getIndentWidth(parentIndent);
}

function getIndentChangeColumn(line: string): number {
  return getQuotePrefixInfo(line)?.raw.length ?? 0;
}

function mapIndentOffset(offset: number, transforms: IndentLineTransform[]): number {
  const oldLength = getTransformedSelectionLength(transforms, "oldLength");
  const newLength = getTransformedSelectionLength(transforms, "newLength");
  if (offset > oldLength) return offset + (newLength - oldLength);

  let oldLineStart = 0;
  let newLineStart = 0;
  for (let index = 0; index < transforms.length; index += 1) {
    const transform = transforms[index];
    const oldLineEnd = oldLineStart + transform.oldLength;
    if (offset <= oldLineEnd || index === transforms.length - 1) {
      const column = Math.max(0, Math.min(transform.oldLength, offset - oldLineStart));
      return newLineStart + mapIndentColumn(column, transform);
    }
    oldLineStart = oldLineEnd + 1;
    newLineStart += transform.newLength + 1;
  }

  return Math.max(0, offset + (newLength - oldLength));
}

function getTransformedSelectionLength(
  transforms: IndentLineTransform[],
  key: "oldLength" | "newLength",
): number {
  return transforms.reduce((length, transform, index) => (
    length + transform[key] + (index > 0 ? 1 : 0)
  ), 0);
}

function mapIndentColumn(column: number, transform: IndentLineTransform): number {
  const { changeColumn, removed, inserted } = transform;
  if (removed > 0) {
    if (column <= changeColumn) return column;
    if (column <= changeColumn + removed) return changeColumn;
    return column - removed;
  }
  return column + (column >= changeColumn ? inserted : 0);
}

function getListLineContext(line: string): ListLineContext {
  const quote = getQuotePrefixInfo(line);
  if (!quote) {
    return { prefix: "", content: line, key: "plain" };
  }

  return {
    prefix: quote.raw,
    content: line.slice(quote.raw.length),
    key: quote.key,
  };
}

function getQuotePrefixInfo(line: string): QuotePrefixInfo | null {
  const quote = readMarkdownBlockquotePrefix(line);
  if (!quote) return null;
  return {
    raw: quote.raw,
    key: `quote:${quote.depth}`,
    leading: quote.raw.match(/^[ \t]*/)?.[0] ?? "",
    depth: quote.depth,
  };
}

function mapOffsetAfterRenumber(before: string, after: string, offset: number): number {
  if (before === after) return offset;

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const position = getLineColumnAtOffset(beforeLines, offset);
  const beforeLine = beforeLines[position.line] ?? "";
  const afterLine = afterLines[position.line] ?? "";
  let column = position.column;
  const beforeMarker = getOrderedMarkerLength(beforeLine);
  const afterMarker = getOrderedMarkerLength(afterLine);
  if (beforeMarker !== null && afterMarker !== null && column >= beforeMarker) {
    column += afterMarker - beforeMarker;
  }

  return getLineStartOffset(afterLines, position.line) + Math.min(column, afterLine.length);
}

function getOrderedMarkerLength(line: string): number | null {
  const context = getListLineContext(line);
  const marker = context.content.match(/^(\s*)(\d+)([.)])(\s+)/);
  return marker ? context.prefix.length + marker[0].length : null;
}

function getLineColumnAtOffset(lines: string[], offset: number): { line: number; column: number } {
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = cursor + lines[index].length;
    if (offset <= lineEnd || index === lines.length - 1) {
      return { line: index, column: Math.max(0, offset - cursor) };
    }
    cursor = lineEnd + 1;
  }
  return { line: Math.max(0, lines.length - 1), column: 0 };
}

function getLineStartOffset(lines: string[], lineIndex: number): number {
  return lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0);
}

function getLineIndexAtOffset(value: string, offset: number): number {
  return value.slice(0, offset).split("\n").length - 1;
}

function getIndentWidth(value: string): number {
  return getMarkdownIndentWidth(value);
}

function collectLines(markdown: string): LineInfo[] {
  const lines: LineInfo[] = [];
  const matcher = /.*(?:\r?\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(markdown)) && match[0] !== "") {
    lines.push({
      text: match[0].replace(/\r?\n$/, ""),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return lines;
}

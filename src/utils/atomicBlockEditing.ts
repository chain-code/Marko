import {
  isMarkdownHorizontalRuleLine,
  splitMarkdownBlocks,
  type MarkdownBlock,
} from "./editorBlocks";
import type { TextEditResult, TextState } from "./editorCommands";
import { isMarkdownTocLine } from "./tocSyntax";

export type AtomicMarkdownBlockKind = "horizontal-rule" | "toc";
export type AtomicMarkdownBlockDirection = "backward" | "forward";

export interface AtomicMarkdownBlockRange {
  kind: AtomicMarkdownBlockKind;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  lineBreak: "" | "\n" | "\r\n";
}

interface SourceLine {
  text: string;
  start: number;
  contentEnd: number;
  end: number;
  lineBreak: "" | "\n" | "\r\n";
}

const protectedBlockTypes = new Set(["code", "math", "html", "frontmatter"]);

export function collectAtomicMarkdownBlocks(value: string): AtomicMarkdownBlockRange[] {
  const lines = collectSourceLines(value);
  const blocks = splitMarkdownBlocks(value);
  const atomicBlocks: AtomicMarkdownBlockRange[] = [];

  for (const line of lines) {
    const kind = getAtomicBlockKind(line, blocks);
    if (!kind) continue;
    atomicBlocks.push({
      kind,
      from: line.start,
      to: line.end,
      contentFrom: line.start,
      contentTo: line.contentEnd,
      lineBreak: line.lineBreak,
    });
  }

  return atomicBlocks;
}

export function findAtomicMarkdownBlockAt(
  value: string,
  position: number,
): AtomicMarkdownBlockRange | null {
  if (position < 0 || position > value.length) return null;
  return collectAtomicMarkdownBlocks(value).find((block) => (
    position >= block.contentFrom && position <= block.contentTo
  )) ?? null;
}

export function findAdjacentAtomicMarkdownBlock(
  value: string,
  position: number,
  direction: AtomicMarkdownBlockDirection,
): AtomicMarkdownBlockRange | null {
  if (position < 0 || position > value.length) return null;
  const blocks = collectAtomicMarkdownBlocks(value);

  if (direction === "backward") {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index];
      if (block.to > position) continue;
      if (isMarkdownWhitespace(value.slice(block.to, position))) return block;
      return null;
    }
    return null;
  }

  for (const block of blocks) {
    if (block.from < position) continue;
    if (isMarkdownWhitespace(value.slice(position, block.from))) return block;
    return null;
  }
  return null;
}

export function deleteSelectedAtomicMarkdownBlock(state: TextState): TextEditResult | null {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd, state.value.length));
  const selectionEnd = Math.max(0, Math.min(Math.max(state.selectionStart, state.selectionEnd), state.value.length));
  if (selectionStart === selectionEnd) return null;

  const block = collectAtomicMarkdownBlocks(state.value).find((candidate) => (
    (selectionStart === candidate.contentFrom && selectionEnd === candidate.contentTo)
    || (selectionStart === candidate.from && selectionEnd === candidate.to)
  ));
  if (!block) return null;

  return {
    value: `${state.value.slice(0, block.contentFrom)}${state.value.slice(block.contentTo)}`,
    selectionStart: block.contentFrom,
    selectionEnd: block.contentFrom,
  };
}

export function handleBackspaceAfterHorizontalRule(state: TextState): TextEditResult | null {
  const cursor = Math.max(0, Math.min(state.selectionStart, state.value.length));
  if (state.selectionStart !== state.selectionEnd) return null;

  const lines = collectSourceLines(state.value);
  const currentLine = lines.find((line) => line.start === cursor);
  if (!currentLine || !currentLine.text.trim()) return null;

  const currentBlock = splitMarkdownBlocks(state.value).find((block) => (
    block.start === cursor && cursor < block.end
  ));
  if (!currentBlock || currentBlock.type !== "paragraph") return null;
  if (findAtomicMarkdownBlockAt(state.value, cursor)) return null;

  const horizontalRule = findAdjacentAtomicMarkdownBlock(state.value, cursor, "backward");
  if (!horizontalRule || horizontalRule.kind !== "horizontal-rule") return null;

  const previousContentLine = findPreviousContentLine(lines, horizontalRule.from);
  if (!previousContentLine) {
    return {
      value: state.value.slice(cursor),
      selectionStart: 0,
      selectionEnd: 0,
    };
  }

  const lineBreak = horizontalRule.lineBreak || getPreferredLineBreak(state.value);
  const replacementStart = previousContentLine.contentEnd;
  const separator = `${lineBreak}${lineBreak}`;
  return {
    value: `${state.value.slice(0, replacementStart)}${separator}${state.value.slice(cursor)}`,
    selectionStart: replacementStart + separator.length,
    selectionEnd: replacementStart + separator.length,
  };
}

function getAtomicBlockKind(
  line: SourceLine,
  blocks: MarkdownBlock[],
): AtomicMarkdownBlockKind | null {
  if (isMarkdownHorizontalRuleLine(line.text)) {
    const parsedRule = blocks.some((block) => (
      block.type === "rule" && block.start === line.start && block.end === line.end
    ));
    return parsedRule ? "horizontal-rule" : null;
  }

  if (!isMarkdownTocLine(line.text)) return null;
  const containingBlock = blocks.find((block) => (
    line.start >= block.start && line.contentEnd <= block.end
  ));
  return containingBlock && protectedBlockTypes.has(containingBlock.type) ? null : "toc";
}

function collectSourceLines(value: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const matcher = /.*(?:\r?\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(value)) && match[0] !== "") {
    const raw = match[0];
    const lineBreak = raw.endsWith("\r\n") ? "\r\n" : raw.endsWith("\n") ? "\n" : "";
    const text = lineBreak ? raw.slice(0, -lineBreak.length) : raw;
    lines.push({
      text,
      start: match.index,
      contentEnd: match.index + text.length,
      end: match.index + raw.length,
      lineBreak,
    });
  }

  return lines;
}

function findPreviousContentLine(lines: SourceLine[], before: number): SourceLine | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.start >= before) continue;
    if (line.text.trim()) return line;
  }
  return null;
}

function isMarkdownWhitespace(value: string): boolean {
  return /^[ \t\r\n]*$/.test(value);
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

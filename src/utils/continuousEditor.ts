import { splitMarkdownBlocks, type MarkdownBlock } from "./editorBlocks";
import { collectInlineMarkdownSyntax } from "./inlineSyntax";

export const continuousHistoryGroupDelay = 3000;

export type ContinuousMarkdownLineKind =
  | "blank"
  | "paragraph"
  | "heading"
  | "blockquote"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "code"
  | "code-fence"
  | "math"
  | "math-fence"
  | "table"
  | "horizontal-rule"
  | "frontmatter";

export interface ContinuousMarkdownLinePresentation {
  from: number;
  to: number;
  kind: ContinuousMarkdownLineKind;
  level: number | null;
  active: boolean;
  className: string;
  hiddenMarker: { from: number; to: number } | null;
}

export interface EmojiCompletionRange {
  query: string;
  from: number;
  to: number;
}

export interface ContinuousTextChange {
  from: number;
  to: number;
  insert: string;
}

export type ContinuousPreviewBlockKind = "image" | "table" | "math" | "code" | "diagram" | "toc" | "callout";

export type ContinuousDiagramLanguage = "mermaid" | "flowchart";

export interface ContinuousPreviewBlock {
  from: number;
  to: number;
  source: string;
  kind: ContinuousPreviewBlockKind;
}

export interface ContinuousEditorViewState {
  anchor: number;
  head: number;
  scrollTop: number;
}

export function getContinuousTextChange(before: string, after: string): ContinuousTextChange | null {
  if (before === after) return null;

  let prefixLength = 0;
  const sharedLength = Math.min(before.length, after.length);
  while (prefixLength < sharedLength && before[prefixLength] === after[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const remainingBefore = before.length - prefixLength;
  const remainingAfter = after.length - prefixLength;
  while (
    suffixLength < remainingBefore
    && suffixLength < remainingAfter
    && before[before.length - suffixLength - 1] === after[after.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  return {
    from: prefixLength,
    to: before.length - suffixLength,
    insert: after.slice(prefixLength, after.length - suffixLength),
  };
}

export function normalizeContinuousEditorViewState(
  state: ContinuousEditorViewState,
  documentLength: number,
): ContinuousEditorViewState {
  const safeLength = Number.isFinite(documentLength) ? Math.max(0, Math.trunc(documentLength)) : 0;
  return {
    anchor: clampOffset(state.anchor, safeLength),
    head: clampOffset(state.head, safeLength),
    scrollTop: Number.isFinite(state.scrollTop) ? Math.max(0, state.scrollTop) : 0,
  };
}

export function getContinuousPreviewBlocks(
  markdown: string,
  blocks = splitMarkdownBlocks(markdown),
): ContinuousPreviewBlock[] {
  return blocks.flatMap((block) => {
    const kind = getPreviewBlockKind(block.type, block.raw);
    return kind
      ? [{ from: block.start, to: block.end, source: block.raw, kind }]
      : [];
  });
}

export function getContinuousMarkdownLinePresentations(
  markdown: string,
  selectionHead: number,
  focusMode = false,
  blocks = splitMarkdownBlocks(markdown),
): ContinuousMarkdownLinePresentation[] {
  const lines = markdown.split("\n");
  const tableLines = collectTableLineIndexes(lines);
  const safeHead = clampOffset(selectionHead, markdown.length);
  const result: ContinuousMarkdownLinePresentation[] = [];
  let offset = 0;
  let codeFence: { marker: string } | null = null;
  let mathFence: "$$" | "\\[" | null = null;
  let inFrontmatter = lines.length > 1 && normalizeLine(lines[0]).replace(/^\uFEFF/, "").trim() === "---";

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = normalizeLine(rawLine);
    const from = offset;
    const to = from + line.length;
    const active = safeHead >= from && safeHead <= to;
    const metadata = classifyLine(line, index, inFrontmatter, codeFence, mathFence, tableLines);
    const classes = [`cm-${metadata.kind}`];
    if (metadata.level !== null) classes.push(`cm-heading-${metadata.level}`);
    if (active) classes.push("cm-active-markdown-line");
    if (focusMode && !active && metadata.kind !== "blank") classes.push("cm-focus-muted");

    result.push({
      from,
      to,
      kind: metadata.kind,
      level: metadata.level,
      active,
      className: classes.join(" "),
      hiddenMarker: active ? null : getHiddenMarker(line, from, metadata.kind, metadata.markerEnd),
    });

    if (inFrontmatter && index > 0 && line.trim() === "---") {
      inFrontmatter = false;
    } else if (!inFrontmatter && metadata.kind === "code-fence") {
      const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1] ?? "";
      codeFence = codeFence ? null : { marker };
    } else if (!inFrontmatter && metadata.kind === "math-fence") {
      mathFence = mathFence ? null : (line.trim() === "$$" ? "$$" : "\\[");
    }

    offset += rawLine.length + 1;
  }

  markBlockGapLines(result, blocks);
  return result;
}

function markBlockGapLines(lines: ContinuousMarkdownLinePresentation[], blocks: MarkdownBlock[]): void {
  let runStart = -1;

  const flushRun = (runEnd: number) => {
    const currentRunStart = runStart;
    runStart = -1;
    if (currentRunStart < 0) return;

    const beforeIndex = findNonBlankLine(lines, currentRunStart - 1, -1);
    const afterIndex = findNonBlankLine(lines, runEnd, 1);
    if (beforeIndex < 0 || afterIndex < 0) return;

    const beforeLine = lines[beforeIndex]!;
    const afterLine = lines[afterIndex]!;
    const beforeBlock = findBlockAtOffset(blocks, beforeLine.from);
    const afterBlock = findBlockAtOffset(blocks, afterLine.from);
    if (!beforeBlock || !afterBlock) return;

    if (beforeBlock.index === afterBlock.index) return;

    const className = beforeLine.kind === "heading" || afterLine.kind === "heading"
      ? "cm-heading-gap"
      : "cm-block-gap";
    for (let index = currentRunStart; index < runEnd; index += 1) {
      lines[index]!.className += ` ${className}`;
      if (className === "cm-block-gap" && index > currentRunStart) {
        lines[index]!.className += " cm-block-gap-extra";
      }
    }
  };

  for (let index = 0; index <= lines.length; index += 1) {
    if (index < lines.length && lines[index]!.kind === "blank") {
      if (runStart < 0) runStart = index;
      continue;
    }
    flushRun(index);
  }
}

function findNonBlankLine(
  lines: ContinuousMarkdownLinePresentation[],
  start: number,
  direction: -1 | 1,
): number {
  for (let index = start; index >= 0 && index < lines.length; index += direction) {
    if (lines[index]!.kind !== "blank") return index;
  }
  return -1;
}

function findBlockAtOffset(blocks: MarkdownBlock[], offset: number): MarkdownBlock | null {
  return blocks.find((block) => offset >= block.start && offset < block.end) ?? null;
}

export function getEmojiCompletionRange(
  markdown: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): EmojiCompletionRange | null {
  const start = clampOffset(selectionStart, markdown.length);
  const end = clampOffset(selectionEnd, markdown.length);
  if (start !== end) return null;

  const before = markdown.slice(0, start);
  const match = before.match(/:([a-z0-9_+-]{1,20})$/i);
  if (!match) return null;
  return {
    query: match[1],
    from: start - match[0].length,
    to: start,
  };
}

function classifyLine(
  line: string,
  index: number,
  inFrontmatter: boolean,
  codeFence: { marker: string } | null,
  mathFence: "$$" | "\\[" | null,
  tableLines: Set<number>,
): { kind: ContinuousMarkdownLineKind; level: number | null; markerEnd: number | null } {
  const trimmed = line.trim();
  if (inFrontmatter) {
    const delimiter = index === 0 ? trimmed.replace(/^\uFEFF/, "") : trimmed;
    return { kind: "frontmatter", level: null, markerEnd: delimiter === "---" ? line.length : null };
  }

  if (codeFence) {
    const closing = trimmed.match(/^(`{3,}|~{3,})$/)?.[1];
    const isClosing = Boolean(closing && closing[0] === codeFence.marker[0] && closing.length >= codeFence.marker.length);
    return { kind: isClosing ? "code-fence" : "code", level: null, markerEnd: isClosing ? line.length : null };
  }

  if (mathFence) {
    const isClosing = mathFence === "$$" ? trimmed === "$$" : trimmed === "\\]";
    return { kind: isClosing ? "math-fence" : "math", level: null, markerEnd: isClosing ? line.length : null };
  }

  const codeOpening = line.match(/^\s*(`{3,}|~{3,})/);
  if (codeOpening) {
    return { kind: "code-fence", level: null, markerEnd: line.length };
  }
  if (trimmed === "$$" || trimmed === "\\[") {
    return { kind: "math-fence", level: null, markerEnd: line.length };
  }

  const heading = line.match(/^(\s{0,3})(#{1,6})(?:\s+|$)/);
  if (heading) {
    return { kind: "heading", level: heading[2].length, markerEnd: heading[0].length };
  }
  const quote = line.match(/^\s{0,3}(?:>\s?)+/);
  if (quote) {
    return { kind: "blockquote", level: null, markerEnd: quote[0].length };
  }
  if (/^\s*[-+*]\s+\[[ xX]\]\s+/.test(line)) {
    return { kind: "task-list", level: null, markerEnd: null };
  }
  if (/^\s*[-+*]\s+/.test(line)) {
    return { kind: "bullet-list", level: null, markerEnd: null };
  }
  if (/^\s*\d+[.)]\s+/.test(line)) {
    return { kind: "ordered-list", level: null, markerEnd: null };
  }
  if (tableLines.has(index)) {
    return { kind: "table", level: null, markerEnd: null };
  }
  if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    return { kind: "horizontal-rule", level: null, markerEnd: line.length };
  }
  if (!trimmed) {
    return { kind: "blank", level: null, markerEnd: null };
  }
  return { kind: "paragraph", level: null, markerEnd: null };
}

function getHiddenMarker(
  line: string,
  lineOffset: number,
  kind: ContinuousMarkdownLineKind,
  markerEnd: number | null,
): { from: number; to: number } | null {
  if (markerEnd === null || markerEnd <= 0) return null;
  if (!["heading", "blockquote", "code-fence", "math-fence", "horizontal-rule", "frontmatter"].includes(kind)) {
    return null;
  }
  return {
    from: lineOffset,
    to: lineOffset + Math.min(markerEnd, line.length),
  };
}

function collectTableLineIndexes(lines: string[]): Set<number> {
  const indexes = new Set<number>();
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!hasTableCells(lines[index]) || !isTableSeparator(lines[index + 1])) continue;
    indexes.add(index);
    indexes.add(index + 1);
    for (let row = index + 2; row < lines.length && hasTableCells(lines[row]); row += 1) {
      indexes.add(row);
    }
  }
  return indexes;
}

function hasTableCells(line: string): boolean {
  return /(^|[^\\])\|/.test(normalizeLine(line));
}

function isTableSeparator(line: string): boolean {
  const cells = normalizeLine(line).trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function normalizeLine(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.trunc(offset), length));
}

function getPreviewBlockKind(blockType: string, source: string): ContinuousPreviewBlockKind | null {
  if (blockType === "table") return "table";
  if (blockType === "math") return "math";
  if (blockType === "code") {
    if (getContinuousDiagramLanguage(source)) return "diagram";
    return "code";
  }

  const trimmed = source.trim();
  if (/^\[TOC\]$/i.test(trimmed)) return "toc";
  if (/^>\s*\[![A-Z]+\](?:\s|$)/i.test(trimmed)) return "callout";

  const inlineSyntax = collectInlineMarkdownSyntax(trimmed);
  const standaloneImage = inlineSyntax.find((item) => (
    item.type === "image" && item.start === 0 && item.end === trimmed.length
  ));
  return standaloneImage ? "image" : null;
}

export function getContinuousDiagramLanguage(source: string): ContinuousDiagramLanguage | null {
  const match = source.trimStart().match(/^(?:`{3,}|~{3,})([^\r\n]*)/);
  const language = match?.[1].trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (language === "mermaid" || language === "mmd") return "mermaid";
  if (language === "flowchart" || language === "flow") return "flowchart";
  return null;
}

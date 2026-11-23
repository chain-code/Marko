import { markdownLanguage } from "@codemirror/lang-markdown";
import {
  isMarkdownFencedMathBlock,
  isMarkdownHorizontalRuleLine,
  splitMarkdownBlocks,
  type MarkdownBlock,
} from "./editorBlocks";
import { collectInlineMarkdownSyntax, collectInlineMathSyntax } from "./inlineSyntax";
import {
  isDollarMathBlockClosing,
  readDollarMathBlockOpening,
} from "./mathSyntax";
import {
  isYamlFrontMatterClosing,
  isYamlFrontMatterOpening,
} from "./frontMatterSyntax";
import {
  getLeadingMarkdownIndent,
  getMarkdownIndentWidth,
  isMarkdownCodeIndented,
  readMarkdownContainerPrefix,
  readMarkdownBlockquotePrefix,
  stripMarkdownIndentColumns,
  stripMarkdownListContainerMarkers,
} from "./markdownIndent";
import { isMarkdownTocLine } from "./tocSyntax";

export const continuousHistoryGroupDelay = 3000;

const continuousBulletMarkers = ["•", "◦", "▪"] as const;
const inlineMathEscapeProtectedBlockTypes = new Set(["code", "math", "html", "frontmatter"]);

export function getContinuousBulletMarker(depth: number): string {
  const normalizedDepth = Number.isFinite(depth) ? Math.max(0, Math.trunc(depth)) : 0;
  return continuousBulletMarkers[Math.min(normalizedDepth, continuousBulletMarkers.length - 1)];
}

export type ContinuousMarkdownLineKind =
  | "blank"
  | "paragraph"
  | "heading"
  | "setext-marker"
  | "blockquote"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "code"
  | "code-fence"
  | "math"
  | "math-fence"
  | "html"
  | "table"
  | "horizontal-rule"
  | "footnote-definition"
  | "frontmatter";
export type ContinuousMarkdownAlertKind =
  | "note"
  | "tip"
  | "important"
  | "warning"
  | "caution";

export interface ContinuousMarkdownAlertPresentation {
  kind: ContinuousMarkdownAlertKind;
  role: "title" | "body";
  first: boolean;
  last: boolean;
  marker: { from: number; to: number } | null;
  kindRange: { from: number; to: number } | null;
}


export interface ContinuousMarkdownLinePresentation {
  from: number;
  to: number;
  kind: ContinuousMarkdownLineKind;
  level: number | null;
  quoteDepth: number;
  quotePrefixEnd: number | null;
  listDepth: number | null;
  bulletDepth: number | null;
  listKind: "bullet-list" | "ordered-list" | null;
  active: boolean;
  className: string;
  hiddenMarker: { from: number; to: number } | null;
  innerMarkers: Array<{ from: number; to: number }>;
  trailingMarker: { from: number; to: number } | null;
  listThematicBreak: { from: number; to: number } | null;
  alert: ContinuousMarkdownAlertPresentation | null;
}

export type ContinuousMarkdownSyntaxTree = ReturnType<typeof markdownLanguage.parser.parse>;

interface ContinuousSyntaxLineMetadata {
  headingLevel: number | null;
  headingMarkers: Array<{ from: number; to: number }>;
  setextHeadingFirst: boolean;
  setextHeadingLast: boolean;
  setextHeadingLine: boolean;
  setextMarker: boolean;
  quoteDepth: number;
  listDepth: number | null;
  bulletDepth: number | null;
  listKind: "bullet-list" | "ordered-list" | null;
  topLevelListStart: boolean;
  listThematicBreak: { from: number; to: number } | null;
  table: boolean;
  indentedCode: boolean;
}

interface ContinuousMarkdownLineMetadata {
  kind: ContinuousMarkdownLineKind;
  level: number | null;
  markerEnd: number | null;
}

interface BlockquotePrefix {
  depth: number;
  end: number;
  contentColumn: number;
}
interface ContinuousAlertLineMetadata {
  kind: ContinuousMarkdownAlertKind;
  role: "title" | "body";
  first: boolean;
  last: boolean;
  markerFrom: number | null;
  markerTo: number | null;
  kindFrom: number | null;
  kindTo: number | null;
}

interface ContinuousRawBlockLineMetadata {
  kind: "code" | "math" | "html";
  first: boolean;
  last: boolean;
  active: boolean;
  fenced: boolean;
  firstContent: boolean;
  lastContent: boolean;
  emptyContent: boolean;
}


interface CodeFenceState {
  marker: string;
  quoteDepth: number;
  kind: "code" | "math";
  listIndentWidth: number;
}

interface MathFenceState {
  marker: "$$" | "\\[";
  quoteDepth: number;
  listIndentWidth: number;
}

export interface EmojiCompletionRange {
  query: string;
  from: number;
  to: number;
}

export interface InlineMathEscapeResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface ContinuousTextChange {
  from: number;
  to: number;
  insert: string;
}

export type ContinuousPreviewBlockKind = "image" | "table" | "math" | "code" | "diagram" | "toc" | "html" | "definition";

export type ContinuousDiagramLanguage = "mermaid" | "flowchart" | "sequence";

export interface ContinuousPreviewBlock {
  from: number;
  to: number;
  source: string;
  kind: ContinuousPreviewBlockKind;
  quoteDepth?: number;
  listDepth?: number | null;
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
  tree: ContinuousMarkdownSyntaxTree = markdownLanguage.parser.parse(markdown),
): ContinuousPreviewBlock[] {
  const topLevelBlocks: ContinuousPreviewBlock[] = [];
  const nestedPreviewProtectedBlocks = blocks.filter((block) => (
    block.type === "footnote" || block.type === "frontmatter"
  ));
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const kind = getPreviewBlockKind(block.type, block.raw);
    if (!kind) continue;

    topLevelBlocks.push({
      from: block.start,
      to: block.end,
      source: block.raw,
      kind,
    });
  }
  const nestedBlocks = [
    ...collectNestedSyntaxPreviewBlocks(markdown, tree),
    ...collectNestedMathPreviewBlocks(markdown, tree),
  ].filter((block) => !nestedPreviewProtectedBlocks.some((protectedBlock) => (
    block.from >= protectedBlock.start && block.to <= protectedBlock.end
  )));

  return mergeContinuousPreviewBlocks([
    ...topLevelBlocks,
    ...nestedBlocks,
  ]);
}

export function getContinuousAtxHeadingContentRange(
  markdown: string,
  selectionHead: number,
  tree: ContinuousMarkdownSyntaxTree = markdownLanguage.parser.parse(markdown),
): { from: number; to: number } | null {
  const safeHead = clampOffset(selectionHead, markdown.length);
  let result: { from: number; to: number } | null = null;

  tree.iterate({
    enter(node) {
      if (result || !/^ATXHeading[1-6]$/.test(node.name)) return;
      if (safeHead < node.from || safeHead > node.to) return false;

      const markers = getExpandedAtxHeadingMarkers(markdown, node.node);
      const opening = markers[0];
      if (!opening) return false;
      const closing = markers.length > 1 ? markers[markers.length - 1]! : null;
      result = {
        from: opening.to,
        to: Math.max(opening.to, closing?.from ?? node.to),
      };
      return false;
    },
  });

  return result;
}

export function getContinuousMarkdownLinePresentations(
  markdown: string,
  selectionHead: number,
  focusMode = false,
  blocks = splitMarkdownBlocks(markdown),
  revealActiveLine = true,
  tree: ContinuousMarkdownSyntaxTree = markdownLanguage.parser.parse(markdown),
  previewBlocks = getContinuousPreviewBlocks(markdown, blocks, tree),
): ContinuousMarkdownLinePresentation[] {
  const lines = markdown.split("\n");
  const tableLines = collectTableLineIndexes(lines);
  const syntaxLines = collectContinuousSyntaxLines(markdown, lines, tree);
  syntaxLines.forEach((metadata, index) => {
    if (metadata.table) tableLines.add(index);
  });
  const footnoteLines = collectFootnoteDefinitionLines(blocks);
  const frontmatterLineRoles = collectFrontmatterLineRoles(lines);
  const alertLines = collectContinuousAlertLines(lines);
  const safeHead = clampOffset(selectionHead, markdown.length);
  const rawBlockLines = collectContinuousRawBlockLines(
    previewBlocks,
    safeHead,
    revealActiveLine,
  );
  const fencedMathOpenings = collectFencedMathOpeningOffsets(markdown, blocks, tree);
  const result: ContinuousMarkdownLinePresentation[] = [];
  let offset = 0;
  let codeFence: CodeFenceState | null = null;
  let mathFence: MathFenceState | null = null;
  let inFrontmatter = frontmatterLineRoles.size > 0;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = normalizeLine(rawLine);
    const from = offset;
    const to = from + line.length;
    const active = revealActiveLine && safeHead >= from && safeHead <= to;
    const syntaxLine = syntaxLines[index] ?? createContinuousSyntaxLineMetadata();
    const footnoteLine = footnoteLines.get(from);
    const alertLine = alertLines.get(index) ?? null;
    const rawBlockLine = rawBlockLines.get(from) ?? null;
    const fenceQuoteDepth: number | null = codeFence?.quoteDepth ?? mathFence?.quoteDepth ?? null;
    const containerPrefix: ReturnType<typeof readMarkdownContainerPrefix> | null = inFrontmatter
      ? null
      : readMarkdownContainerPrefix(line, 0, fenceQuoteDepth);
    const explicitQuoteDepth: number = containerPrefix?.quoteDepth ?? 0;
    const quotePrefixEnd = getLeadingContainerQuotePrefixEnd(containerPrefix);
    const nestedQuoteMarkers = getNestedContainerQuoteMarkers(containerPrefix, from);
    let quoteDepth: number = inFrontmatter
      ? 0
      : Math.max(explicitQuoteDepth, syntaxLine.quoteDepth);
    const semanticLine = containerPrefix
      ? stripContainerQuoteMarkers(line, containerPrefix)
      : line;
    const semanticColumn = 0;
    const leavesQuotedFence = !inFrontmatter
      && fenceQuoteDepth !== null
      && fenceQuoteDepth > 0
      && explicitQuoteDepth < fenceQuoteDepth;
    if (leavesQuotedFence) {
      quoteDepth = explicitQuoteDepth;
      codeFence = null;
      mathFence = null;
    }
    const activeFence = codeFence ?? mathFence;
    const listContinuation = activeFence?.listIndentWidth
      ? stripMarkdownIndentColumns(
        semanticLine,
        activeFence.listIndentWidth,
        semanticColumn,
      )
      : { content: semanticLine, prefixLength: 0 };
    if (
      activeFence?.listIndentWidth
      && semanticLine.trim()
      && !listContinuation
    ) {
      codeFence = null;
      mathFence = null;
    }
    const classifiedLine = listContinuation?.content ?? semanticLine;
    const classifiedColumn = 0;
    const setextLine = !inFrontmatter && syntaxLine.setextMarker
      ? { kind: "setext-marker" as const, level: null, markerEnd: semanticLine.length }
      : null;
    const baseMetadata = inFrontmatter
      ? classifyLine(line, index, true, codeFence, mathFence, false, 0, 0, tableLines)
      : setextLine
        ?? footnoteLine
        ?? (rawBlockLine?.kind === "html"
          ? { kind: "html" as const, level: null, markerEnd: null }
          : null)
        ?? (syntaxLine.indentedCode
          ? { kind: "code" as const, level: null, markerEnd: null }
          : classifyLine(
        classifiedLine,
        index,
        false,
        codeFence,
        mathFence,
        fencedMathOpenings.has(from),
        quoteDepth,
        classifiedColumn,
        tableLines,
      ));
    const headingMetadata = inFrontmatter || syntaxLine.headingLevel === null
      ? baseMetadata
      : {
        ...baseMetadata,
        kind: ["paragraph", "blockquote"].includes(baseMetadata.kind)
          ? "heading" as const
          : baseMetadata.kind,
        level: syntaxLine.headingLevel,
      };
    const metadata = applyBlockquoteSemantics(headingMetadata, quoteDepth);
    const classes = [`cm-${metadata.kind}`];
    if (syntaxLine.listThematicBreak) classes.push("cm-list-thematic-break");
    if (metadata.level !== null) {
      if (metadata.kind !== "heading") classes.push("cm-heading");
      classes.push(`cm-heading-${metadata.level}`);
    }
    if (syntaxLine.setextHeadingLine) {
      classes.push("cm-setext-heading-line");
      if (syntaxLine.setextHeadingFirst) classes.push("cm-setext-heading-first");
      if (syntaxLine.setextHeadingLast) classes.push("cm-setext-heading-last");
    }
    if (syntaxLine.listDepth !== null) {
      const listDepthClass = `cm-list-depth-${syntaxLine.listDepth}`;
      if (["paragraph", "blockquote", "heading"].includes(metadata.kind)) {
        classes.push("cm-list-continuation", listDepthClass);
      } else if (rawBlockLine) {
        classes.push("cm-list-raw-block", listDepthClass);
      }
    }
    if (quoteDepth > 0) {
      if (metadata.kind !== "blockquote") classes.push("cm-blockquote");
      classes.push(`cm-blockquote-depth-${quoteDepth}`);
      if (!semanticLine.trim()) classes.push("cm-blockquote-gap");
    }
    if (syntaxLine.listDepth !== null && !semanticLine.trim()) {
      classes.push("cm-list-gap");
    }
    if (alertLine) {
      classes.push(
        "cm-alert",
        `cm-alert-${alertLine.kind}`,
        `cm-alert-${alertLine.role}`,
      );
      if (alertLine.first) classes.push("cm-alert-first");
      if (alertLine.last) classes.push("cm-alert-last");
    }
    if (rawBlockLine) {
      classes.push("cm-raw-block", `cm-raw-block-${rawBlockLine.kind}`);
      if (rawBlockLine.first) classes.push("cm-raw-block-first");
      if (rawBlockLine.last) classes.push("cm-raw-block-last");
      if (rawBlockLine.active) classes.push("cm-active-raw-block");
      if (rawBlockLine.active && rawBlockLine.fenced) {
        classes.push("cm-active-raw-fenced-block");
        if (["code-fence", "math-fence"].includes(metadata.kind)) {
          classes.push("cm-active-raw-fence-hidden");
        }
        if (rawBlockLine.firstContent) classes.push("cm-active-raw-content-first");
        if (rawBlockLine.lastContent) classes.push("cm-active-raw-content-last");
        if (rawBlockLine.emptyContent && rawBlockLine.last) {
          classes.push("cm-active-raw-empty-input");
        }
      } else if (rawBlockLine.active && metadata.kind === "math-fence") {
        classes.push("cm-active-delimited-math-fence");
      }
    }
    const frontmatterRole = frontmatterLineRoles.get(index);
    if (frontmatterRole) classes.push(`cm-frontmatter-${frontmatterRole}`);
    if (footnoteLine?.first) classes.push("cm-footnote-definition-first");
    if (active) classes.push("cm-active-markdown-line");
    if (focusMode && !active && metadata.kind !== "blank") classes.push("cm-focus-muted");
    const isAtxHeading = syntaxLine.headingMarkers.length > 0;
    const keepsActiveAtxMarkersHidden = active && isAtxHeading;
    const keepsContainerSyntaxHidden = !active || keepsActiveAtxMarkersHidden;

    result.push({
      from,
      to,
      kind: metadata.kind,
      level: metadata.level,
      quoteDepth,
      quotePrefixEnd,
      listDepth: inFrontmatter ? null : syntaxLine.listDepth,
      bulletDepth: inFrontmatter ? null : syntaxLine.bulletDepth,
      listKind: inFrontmatter ? null : syntaxLine.listKind,
      active,
      className: classes.join(" "),
      hiddenMarker: rawBlockLine?.active
        && rawBlockLine.fenced
        && ["code-fence", "math-fence"].includes(metadata.kind)
        ? getHiddenMarker(
          line,
          from,
          metadata.kind,
          line.length,
          quotePrefixEnd,
        )
        : rawBlockLine?.active
          && !rawBlockLine.fenced
          && metadata.kind === "math-fence"
          ? null
          : active && !keepsActiveAtxMarkersHidden
            ? null
            : getHiddenMarker(
              line,
              from,
              metadata.kind,
              ["code-fence", "math-fence"].includes(metadata.kind) ? line.length : metadata.markerEnd,
              quotePrefixEnd,
            ),
      innerMarkers: inFrontmatter || metadata.kind === "heading"
        ? []
        : [
          ...(keepsContainerSyntaxHidden ? syntaxLine.headingMarkers : []),
          ...(keepsContainerSyntaxHidden ? nestedQuoteMarkers : []),
        ],
      trailingMarker: active && !keepsActiveAtxMarkersHidden
        ? null
        : getTrailingMarker(line, from, metadata.kind, quotePrefixEnd),
      listThematicBreak: inFrontmatter ? null : syntaxLine.listThematicBreak,
      alert: alertLine
        ? {
          kind: alertLine.kind,
          role: alertLine.role,
          first: alertLine.first,
          last: alertLine.last,
          marker: alertLine.markerFrom === null || alertLine.markerTo === null
            ? null
            : { from: from + alertLine.markerFrom, to: from + alertLine.markerTo },
          kindRange: alertLine.kindFrom === null || alertLine.kindTo === null
            ? null
            : { from: from + alertLine.kindFrom, to: from + alertLine.kindTo },
        }
        : null,
    });

    if (
      syntaxLine.topLevelListStart
      && result.slice(0, index).every((item) => item.kind === "blank")
    ) {
      result[index]!.className += " cm-document-first-list";
    } else if (
      syntaxLine.topLevelListStart
      && index > 0
      && !isContainerGapLine(result[index - 1]!)
      && result[index - 1]!.kind !== "heading"
      && result[index - 1]!.kind !== "setext-marker"
      && result[index - 1]!.quoteDepth === quoteDepth
    ) {
      result[index]!.className += " cm-list-block-margin-before";
    }

    const codeOpening = getContinuousCodeFenceOpening(semanticLine, semanticColumn);
    if (inFrontmatter && index > 0 && isYamlFrontMatterClosing(line)) {
      inFrontmatter = false;
    } else if (
      !inFrontmatter
      && codeFence
      && metadata.kind === (codeFence.kind === "math" ? "math-fence" : "code-fence")
    ) {
      codeFence = null;
    } else if (!inFrontmatter && !codeFence && codeOpening) {
      codeFence = {
        kind: fencedMathOpenings.has(from) ? "math" : "code",
        marker: codeOpening.marker,
        quoteDepth,
        listIndentWidth: codeOpening.listIndentWidth,
      };
    } else if (!inFrontmatter && metadata.kind === "math-fence") {
      const mathOpening = getContainerMathFence(semanticLine, semanticColumn);
      mathFence = mathFence
        ? null
        : {
          marker: mathOpening?.marker === "$$" ? "$$" : "\\[",
          quoteDepth,
          listIndentWidth: mathOpening?.listIndentWidth ?? 0,
        };
    }

    offset += rawLine.length + 1;
  }

  markBlockquoteBoundaries(result);
  markBlockGapLines(result, blocks);
  markDocumentBoundaries(result);
  return result;
}

function markDocumentBoundaries(lines: ContinuousMarkdownLinePresentation[]): void {
  const visibleLines = lines.filter((line) => line.kind !== "blank" && line.kind !== "setext-marker");
  const first = visibleLines[0];
  const last = visibleLines.at(-1);
  if (first) first.className += " cm-document-first-block";
  if (last) last.className += " cm-document-last-block";
}

function isContinuousAlertTitle(line: string): boolean {
  return /^([ \t]*)\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i.test(line);
}

function collectContinuousAlertLines(lines: string[]): Map<number, ContinuousAlertLineMetadata> {
  const result = new Map<number, ContinuousAlertLineMetadata>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeLine(lines[index] ?? "");
    const prefix = getBlockquotePrefix(line);
    if (!prefix) continue;

    const semanticLine = line.slice(prefix.end);
    const title = semanticLine.match(/^([ \t]*)\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i);
    if (!title) continue;

    const kind = title[2].toLowerCase() as ContinuousMarkdownAlertKind;
    const baseDepth = prefix.depth;
    let last = index;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = normalizeLine(lines[cursor] ?? "");
      const nextPrefix = getBlockquotePrefix(nextLine);
      if (!nextPrefix || nextPrefix.depth < baseDepth) break;
      const startsSiblingAlert = nextPrefix.depth === baseDepth
        && isContinuousAlertTitle(nextLine.slice(nextPrefix.end));
      if (startsSiblingAlert) break;
      last = cursor;
    }

    const kindFrom = prefix.end + title[1].length + 2;
    for (let cursor = index; cursor <= last; cursor += 1) {
      const isTitle = cursor === index;
      result.set(cursor, {
        kind,
        role: isTitle ? "title" : "body",
        first: isTitle,
        last: cursor === last,
        markerFrom: isTitle ? 0 : null,
        markerTo: isTitle ? line.length : null,
        kindFrom: isTitle ? kindFrom : null,
        kindTo: isTitle ? kindFrom + title[2].length : null,
      });
    }
    index = last;
  }

  return result;
}

function collectContinuousRawBlockLines(
  blocks: ContinuousPreviewBlock[],
  selectionHead: number,
  revealActiveLine: boolean,
): Map<number, ContinuousRawBlockLineMetadata> {
  const result = new Map<number, ContinuousRawBlockLineMetadata>();

  for (const block of blocks) {
    if (!["code", "diagram", "math", "html"].includes(block.kind)) continue;
    const kind: ContinuousRawBlockLineMetadata["kind"] = block.kind === "math"
      ? "math"
      : block.kind === "html"
        ? "html"
        : "code";
    const source = block.source;
    const lineSource = source.replace(/(?:\r\n|\r|\n)+$/, "");
    const sourceLines = lineSource.split("\n");
    const firstLine = normalizeLine(sourceLines[0] ?? "");
    const firstPrefix = readMarkdownContainerPrefix(firstLine);
    const firstSemanticLine = stripContainerQuoteMarkers(firstLine, firstPrefix);
    const opening = getContinuousCodeFenceOpening(firstSemanticLine);
    const lastLine = normalizeLine(sourceLines.at(-1) ?? "");
    const lastPrefix = readMarkdownContainerPrefix(
      lastLine,
      0,
      firstPrefix.quoteDepth,
    );
    const lastSemanticLine = stripContainerQuoteMarkers(lastLine, lastPrefix);
    const lastContinuation = opening?.listIndentWidth
      ? stripMarkdownIndentColumns(
        lastSemanticLine,
        opening.listIndentWidth,
        0,
      )?.content ?? ""
      : lastSemanticLine;
    const closing = lastContinuation.trim().match(/^(\x60{3,}|~{3,})$/)?.[1] ?? "";
    const fenced = Boolean(
      opening
      && closing
      && closing[0] === opening.marker[0]
      && closing.length >= opening.marker.length,
    );
    const active = revealActiveLine
      && selectionHead >= block.from
      && selectionHead < block.to;
    const starts = [block.from];
    let cursor = lineSource.indexOf("\n");
    while (cursor >= 0 && cursor + 1 < lineSource.length) {
      starts.push(block.from + cursor + 1);
      cursor = lineSource.indexOf("\n", cursor + 1);
    }
    const emptyContent = fenced && starts.length === 2;
    starts.forEach((from, index) => {
      result.set(from, {
        kind,
        first: index === 0,
        last: index === starts.length - 1,
        active,
        fenced,
        firstContent: fenced && starts.length > 2 && index === 1,
        lastContent: fenced && starts.length > 2 && index === starts.length - 2,
        emptyContent,
      });
    });
  }

  return result;
}

function collectFencedMathOpeningOffsets(
  markdown: string,
  blocks: MarkdownBlock[],
  tree: ContinuousMarkdownSyntaxTree,
): Set<number> {
  const result = new Set<number>();
  blocks.forEach((block) => {
    if (isMarkdownFencedMathBlock(normalizeContinuousListFenceSource(block.raw))) result.add(block.start);
  });
  tree.iterate({
    enter(node) {
      if (node.name !== "FencedCode") return;
      const range = expandSyntaxRangeToLines(markdown, node.from, node.to);
      const source = normalizeContinuousListFenceSource(
        markdown.slice(range.from, range.to),
      );
      if (isMarkdownFencedMathBlock(source)) result.add(range.from);
      return false;
    },
  });
  return result;
}

function markBlockquoteBoundaries(lines: ContinuousMarkdownLinePresentation[]): void {
  lines.forEach((line, index) => {
    if (line.quoteDepth <= 0) return;

    const previous = lines[index - 1];
    const next = lines[index + 1];
    const previousDepth = previous?.quoteDepth ?? 0;
    const nextDepth = next?.quoteDepth ?? 0;
    if (previousDepth < line.quoteDepth) {
      line.className += " cm-blockquote-first";
      if (previous && !isContainerGapLine(previous)) {
        line.className += " cm-blockquote-margin-before";
      }
    }
    if (nextDepth < line.quoteDepth) {
      line.className += " cm-blockquote-last";
      if (next && !isContainerGapLine(next)) {
        line.className += " cm-blockquote-margin-after";
      }
    }
  });
}

function isContainerGapLine(line: ContinuousMarkdownLinePresentation): boolean {
  return line.kind === "blank"
    || line.className.includes("cm-block-gap")
    || line.className.includes("cm-blockquote-gap")
    || line.className.includes("cm-list-gap");
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

    if (
      beforeBlock.index === afterBlock.index
      && !isCompactListTransition(beforeLine, afterLine)
    ) return;

    const className = beforeLine.kind === "heading"
      || beforeLine.kind === "setext-marker"
      || afterLine.kind === "heading"
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

function isCompactListTransition(
  before: ContinuousMarkdownLinePresentation,
  after: ContinuousMarkdownLinePresentation,
): boolean {
  const listKinds: ContinuousMarkdownLineKind[] = [
    'bullet-list',
    'ordered-list',
    'task-list',
  ];
  return listKinds.includes(before.kind)
    && listKinds.includes(after.kind)
    && before.quoteDepth === after.quoteDepth
    && (
      before.kind !== after.kind
      || before.listKind !== after.listKind
    );
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

function collectContinuousSyntaxLines(
  markdown: string,
  lines: string[],
  tree: ContinuousMarkdownSyntaxTree,
): ContinuousSyntaxLineMetadata[] {
  const lineStarts = getLineStartOffsets(lines);
  const result = lines.map(() => createContinuousSyntaxLineMetadata());

  tree.iterate({
    enter(node) {
      if (node.name === "Blockquote") {
        const depth = countSyntaxAncestors(node.node, new Set(["Blockquote"]));
        forEachLineInRange(lineStarts, markdown.length, node.from, node.to, (index) => {
          result[index]!.quoteDepth = Math.max(result[index]!.quoteDepth, depth);
        });
        return;
      }

      if (node.name === "BulletList" || node.name === "OrderedList") {
        const depth = countSyntaxAncestors(node.node, new Set(["BulletList", "OrderedList"])) - 1;
        const bulletDepth = node.name === "BulletList"
          ? countSyntaxAncestors(node.node, new Set(["BulletList"])) - 1
          : null;
        const listKind = node.name === "BulletList" ? "bullet-list" : "ordered-list";
        if (depth === 0) {
          const startIndex = findLineIndexAtOffset(lineStarts, markdown.length, node.from);
          result[startIndex]!.topLevelListStart = true;
        }
        forEachLineInRange(lineStarts, markdown.length, node.from, node.to, (index) => {
          if (result[index]!.listDepth !== null && result[index]!.listDepth! > depth) return;
          result[index]!.listDepth = depth;
          if (bulletDepth !== null) {
            result[index]!.bulletDepth = Math.max(result[index]!.bulletDepth ?? -1, bulletDepth);
          }
          result[index]!.listKind = listKind;
        });
        return;
      }

      if (
        node.name === "HorizontalRule"
        && countSyntaxAncestors(node.node, new Set(["BulletList", "OrderedList"])) > 0
      ) {
        const index = findLineIndexAtOffset(lineStarts, markdown.length, node.from);
        result[index]!.listThematicBreak = { from: node.from, to: node.to };
        return;
      }

      if (node.name === "IndentedCode" || node.name === "CodeBlock") {
        forEachLineInRange(lineStarts, markdown.length, node.from, node.to, (index) => {
          result[index]!.indentedCode = true;
        });
        return false;
      }

      if (node.name === "Table") {
        forEachLineInRange(lineStarts, markdown.length, node.from, node.to, (index) => {
          result[index]!.table = true;
        });
        return;
      }

      const atx = node.name.match(/^ATXHeading([1-6])$/);
      if (atx) {
        const index = findLineIndexAtOffset(lineStarts, markdown.length, node.from);
        result[index]!.headingLevel = Number(atx[1]);
        result[index]!.headingMarkers.push(
          ...getExpandedAtxHeadingMarkers(markdown, node.node),
        );
        return;
      }

      const setext = node.name.match(/^SetextHeading([12])$/);
      if (!setext) return;
      const marker = getImmediateSyntaxChildren(node.node, "HeaderMark")[0];
      if (!marker) return;
      if (!/^(?:={2,}|-{2,})$/.test(markdown.slice(marker.from, marker.to).trim())) return;
      const level = Number(setext[1]);
      const firstLine = findLineIndexAtOffset(lineStarts, markdown.length, node.from);
      const markerLine = findLineIndexAtOffset(lineStarts, markdown.length, marker.from);
      for (let index = firstLine; index < markerLine; index += 1) {
        result[index]!.headingLevel = level;
        result[index]!.setextHeadingLine = true;
        result[index]!.setextHeadingFirst = index === firstLine;
        result[index]!.setextHeadingLast = index === markerLine - 1;
      }
      result[markerLine]!.setextMarker = true;
    },
  });

  return result;
}

function createContinuousSyntaxLineMetadata(): ContinuousSyntaxLineMetadata {
  return {
    headingLevel: null,
    headingMarkers: [],
    setextMarker: false,
    quoteDepth: 0,
    setextHeadingFirst: false,
    setextHeadingLast: false,
    setextHeadingLine: false,
    listDepth: null,
    bulletDepth: null,
    listKind: null,
    topLevelListStart: false,
    listThematicBreak: null,
    table: false,
    indentedCode: false,
  };
}

function countSyntaxAncestors(
  node: { name: string; parent: { name: string; parent: unknown } | null },
  names: Set<string>,
): number {
  let depth = 0;
  let current: { name: string; parent: unknown } | null = node;
  while (current) {
    if (names.has(current.name)) depth += 1;
    current = current.parent as { name: string; parent: unknown } | null;
  }
  return depth;
}

function getImmediateSyntaxChildren(
  node: { firstChild: unknown },
  name: string,
): Array<{ name: string; from: number; to: number; nextSibling: unknown }> {
  const result: Array<{ name: string; from: number; to: number; nextSibling: unknown }> = [];
  let child = node.firstChild as {
    name: string;
    from: number;
    to: number;
    nextSibling: unknown;
  } | null;
  while (child) {
    if (child.name === name) result.push(child);
    child = child.nextSibling as typeof child;
  }
  return result;
}

function getExpandedAtxHeadingMarkers(
  markdown: string,
  node: { firstChild: unknown },
): Array<{ from: number; to: number }> {
  const markers = getImmediateSyntaxChildren(node, "HeaderMark");
  const closing = markers.length > 1 ? markers[markers.length - 1]! : null;
  const hiddenMarkers = closing
    && markdown.slice(markers[0]!.to, closing.from).trim().length === 0
    ? markers.slice(0, 1)
    : markers;
  return hiddenMarkers.map((marker, index) => {
    if (index === 0) {
      let to = marker.to;
      while (to < markdown.length && /[ \t]/.test(markdown[to] ?? "")) to += 1;
      return { from: marker.from, to };
    }
    let from = marker.from;
    while (from > 0 && /[ \t]/.test(markdown[from - 1] ?? "")) from -= 1;
    return { from, to: marker.to };
  });
}

function getLineStartOffsets(lines: string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
}

function findLineIndexAtOffset(lineStarts: number[], documentLength: number, offset: number): number {
  const target = Math.max(0, Math.min(offset, Math.max(0, documentLength - 1)));
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle]! <= target) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, high);
}

function forEachLineInRange(
  lineStarts: number[],
  documentLength: number,
  from: number,
  to: number,
  callback: (index: number) => void,
): void {
  if (to <= from || lineStarts.length === 0) return;
  const first = findLineIndexAtOffset(lineStarts, documentLength, from);
  const last = findLineIndexAtOffset(lineStarts, documentLength, to - 1);
  for (let index = first; index <= last; index += 1) callback(index);
}

function collectNestedSyntaxPreviewBlocks(
  markdown: string,
  tree: ContinuousMarkdownSyntaxTree,
): ContinuousPreviewBlock[] {
  const result: ContinuousPreviewBlock[] = [];
  tree.iterate({
    enter(node) {
      let blockType: string | null = null;
      if (node.name === "Table") blockType = "table";
      else if (["FencedCode", "IndentedCode", "CodeBlock"].includes(node.name)) blockType = "code";
      else if (node.name === "HTMLBlock") blockType = "html";
      if (!blockType) return;

      const range = expandSyntaxRangeToLines(markdown, node.from, node.to);
      const source = markdown.slice(range.from, range.to);
      const listCount = countSyntaxAncestors(
        node.node,
        new Set(["BulletList", "OrderedList"]),
      );
      const insideList = listCount > 0;
      const kind = getPreviewBlockKind(
        blockType,
        source,
        node.name === "FencedCode",
        insideList,
      );
      if (kind) {
        result.push({
          ...range,
          source,
          kind,
          quoteDepth: countSyntaxAncestors(node.node, new Set(["Blockquote"])),
          listDepth: listCount > 0 ? listCount - 1 : null,
        });
      }
      return false;
    },
  });
  return result;
}

function collectNestedMathPreviewBlocks(
  markdown: string,
  tree: ContinuousMarkdownSyntaxTree,
): ContinuousPreviewBlock[] {
  const lines = markdown.split("\n");
  const lineStarts = getLineStartOffsets(lines);
  const syntaxLines = collectContinuousSyntaxLines(markdown, lines, tree);
  const protectedRanges: Array<{ from: number; to: number }> = [];
  tree.iterate({
    enter(node) {
      if (["FencedCode", "IndentedCode", "CodeBlock", "HTMLBlock"].includes(node.name)) {
        protectedRanges.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
  });

  const result: ContinuousPreviewBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const from = lineStarts[index] ?? 0;
    if (protectedRanges.some((range) => from >= range.from && from < range.to)) continue;
    const opening = getContainerMathFence(normalizeLine(lines[index] ?? ""));
    if (!opening || opening.marker === "\\]") continue;

    for (let closingIndex = index + 1; closingIndex < lines.length; closingIndex += 1) {
      const closing = getContainerMathFence(normalizeLine(lines[closingIndex] ?? ""));
      if (!closing || closing.key !== opening.key) continue;
      if (
        (opening.marker === "$$" && closing.marker !== "$$")
        || (opening.marker === "\\[" && closing.marker !== "\\]")
      ) {
        continue;
      }
      const range = {
        from,
        to: (lineStarts[closingIndex] ?? 0) + normalizeLine(lines[closingIndex] ?? "").length,
      };
      result.push({
        ...range,
        source: markdown.slice(range.from, range.to),
        kind: "math",
        quoteDepth: syntaxLines[index]?.quoteDepth ?? 0,
        listDepth: syntaxLines[index]?.listDepth ?? null,
      });
      index = closingIndex;
      break;
    }
  }
  return result;
}

function getContainerMathFence(
  line: string,
  startColumn = 0,
): {
  marker: "$$" | "\\[" | "\\]";
  key: string;
  tag: string | null;
  listIndentWidth: number;
} | null {
  const prefix = readMarkdownContainerPrefix(line, startColumn);
  if (
    prefix.codeIndented
    || isMarkdownCodeIndented(prefix.content, prefix.contentColumn)
  ) return null;
  const dollar = readDollarMathBlockOpening(prefix.content, 3, prefix.contentColumn);
  const indent = getLeadingMarkdownIndent(prefix.content);
  const semantic = prefix.content.slice(indent.length);
  const bracket = semantic.match(/^(\\\[|\\\])[ \t]*$/);
  if (!dollar && !bracket) return null;
  const marker = dollar ? "$$" : bracket![1] as "\\[" | "\\]";
  const listContainer = stripMarkdownListContainerMarkers(
    stripContainerQuoteMarkers(line, prefix),
    startColumn,
  );
  return {
    marker,
    key: `quote:${prefix.quoteDepth}`,
    tag: dollar?.tag ?? null,
    listIndentWidth: listContainer.continuationIndentWidth,
  };
}

function expandSyntaxRangeToLines(
  markdown: string,
  from: number,
  to: number,
): { from: number; to: number } {
  const lineFrom = markdown.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const finalOffset = Math.max(lineFrom, to - 1);
  const nextBreak = markdown.indexOf("\n", finalOffset);
  return {
    from: lineFrom,
    to: nextBreak < 0 ? markdown.length : nextBreak,
  };
}

function mergeContinuousPreviewBlocks(
  blocks: ContinuousPreviewBlock[],
): ContinuousPreviewBlock[] {
  const result: ContinuousPreviewBlock[] = [];
  const sorted = [...blocks]
    .filter((block) => block.to > block.from)
    .sort((left, right) => left.from - right.from || right.to - left.to);

  for (const block of sorted) {
    const container = result.find((current) => block.from >= current.from && block.to <= current.to);
    if (container) {
      if (container.kind === block.kind) {
        container.quoteDepth = Math.max(container.quoteDepth ?? 0, block.quoteDepth ?? 0);
        const currentListDepth = container.listDepth ?? -1;
        const blockListDepth = block.listDepth ?? -1;
        container.listDepth = Math.max(currentListDepth, blockListDepth);
        if (container.listDepth < 0) container.listDepth = null;
      }
      continue;
    }
    if (result.some((current) => rangesOverlap(block.from, block.to, current.from, current.to))) continue;
    result.push(block);
  }
  return result;
}

function rangesOverlap(from: number, to: number, otherFrom: number, otherTo: number): boolean {
  return from < otherTo && to > otherFrom;
}

function collectFrontmatterLineRoles(lines: string[]): Map<number, "delimiter" | "content" | "content-first" | "content-last" | "content-only"> {
  const roles = new Map<number, "delimiter" | "content" | "content-first" | "content-last" | "content-only">();
  if (!isYamlFrontMatterOpening(normalizeLine(lines[0] ?? ""))) return roles;

  const closingIndex = lines.findIndex((line, index) => (
    index > 0 && isYamlFrontMatterClosing(normalizeLine(line))
  ));
  if (closingIndex < 0) return roles;

  roles.set(0, "delimiter");
  roles.set(closingIndex, "delimiter");
  for (let index = 1; index < closingIndex; index += 1) {
    if (index === 1 && index === closingIndex - 1) {
      roles.set(index, "content-only");
      continue;
    }
    if (index === 1) {
      roles.set(index, "content-first");
      continue;
    }
    if (index === closingIndex - 1) {
      roles.set(index, "content-last");
      continue;
    }
    roles.set(index, "content");
  }
  return roles;
}

function collectFootnoteDefinitionLines(
  blocks: MarkdownBlock[],
): Map<number, { kind: ContinuousMarkdownLineKind; level: null; markerEnd: null; first: boolean }> {
  const result = new Map<number, {
    kind: ContinuousMarkdownLineKind;
    level: null;
    markerEnd: null;
    first: boolean;
  }>();

  for (const block of blocks) {
    if (block.type !== "footnote") continue;
    let offset = block.start;
    block.raw.split("\n").forEach((rawLine, index) => {
      if (offset >= block.end) return;
      result.set(offset, {
        kind: "footnote-definition",
        level: null,
        markerEnd: null,
        first: index === 0,
      });
      offset += rawLine.length + 1;
    });
  }
  return result;
}

function isSetextHeadingText(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed)
    && !/^(?:#{1,6}(?:\s|$)|>|[-*+]\s|\d+[.)]\s|`{3,}|~{3,}|\|)/.test(trimmed)
    && !/^\[[^\]]+]:/.test(trimmed);
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
  const match = before.match(/:([a-z0-9_+-]{1,40})$/i);
  if (!match) return null;
  const from = start - match[0].length;
  if (isEscapedMarkdownCharacter(markdown, from)) return null;
  return {
    query: match[1],
    from,
    to: start,
  };
}

export function openInlineMathOnEscape(
  markdown: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): InlineMathEscapeResult | null {
  const start = clampOffset(selectionStart, markdown.length);
  const end = clampOffset(selectionEnd, markdown.length);
  if (start !== end || start === 0) return null;

  const marker = start - 1;
  if (
    markdown[marker] !== "$"
    || markdown[marker - 1] === "$"
    || markdown[start] === "$"
    || isEscapedMarkdownCharacter(markdown, marker)
  ) {
    return null;
  }
  const block = splitMarkdownBlocks(markdown)
    .find((candidate) => marker >= candidate.start && marker < candidate.end);
  if (
    (block && inlineMathEscapeProtectedBlockTypes.has(block.type))
    || isInsideMarkdownCodeSpan(markdown, marker)
  ) {
    return null;
  }
  if (collectInlineMathSyntax(markdown).some((math) => math.end === start && math.raw.endsWith("$"))) {
    return null;
  }

  return {
    value: `${markdown.slice(0, start)}$${markdown.slice(start)}`,
    selectionStart: start,
    selectionEnd: start,
  };
}

function isInsideMarkdownCodeSpan(markdown: string, index: number): boolean {
  let node = markdownLanguage.parser.parse(markdown).resolveInner(index, 1);
  while (true) {
    if (node.name === "InlineCode") return true;
    const parent = node.parent;
    if (!parent) return false;
    node = parent;
  }
}

function isEscapedMarkdownCharacter(markdown: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && markdown[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function getContinuousCodeFenceOpening(
  line: string,
  startColumn = 0,
): { marker: string; info: string; listIndentWidth: number } | null {
  const container = stripMarkdownListContainerMarkers(line, startColumn);
  const contentColumn = startColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(container.content, contentColumn)) return null;
  const indent = getLeadingMarkdownIndent(container.content);
  const opening = container.content.slice(indent.length).match(/^(`{3,}|~{3,})([^\r\n]*)$/);
  if (!opening || (opening[1][0] === "`" && opening[2].includes("`"))) return null;
  return {
    marker: opening[1],
    info: opening[2],
    listIndentWidth: container.continuationIndentWidth,
  };
}

function classifyLine(
  line: string,
  index: number,
  inFrontmatter: boolean,
  codeFence: CodeFenceState | null,
  mathFence: MathFenceState | null,
  fencedMathOpening: boolean,
  quoteDepth: number,
  contentColumn: number,
  tableLines: Set<number>,
): ContinuousMarkdownLineMetadata {
  const trimmed = line.trim();
  if (inFrontmatter) {
    const delimiter = index === 0 ? trimmed.replace(/^\uFEFF/, "") : trimmed;
    const isDelimiter = index === 0
      ? isYamlFrontMatterOpening(delimiter)
      : isYamlFrontMatterClosing(delimiter);
    return { kind: "frontmatter", level: null, markerEnd: isDelimiter ? line.length : null };
  }

  if (codeFence) {
    const closing = trimmed.match(/^(`{3,}|~{3,})$/)?.[1];
    const isClosing = quoteDepth === codeFence.quoteDepth
      && !isMarkdownCodeIndented(line, contentColumn)
      && Boolean(closing && closing[0] === codeFence.marker[0] && closing.length >= codeFence.marker.length);
    return {
      kind: isClosing
        ? (codeFence.kind === "math" ? "math-fence" : "code-fence")
        : codeFence.kind,
      level: null,
      markerEnd: isClosing ? line.length : null,
    };
  }

  if (mathFence) {
    const isClosing = quoteDepth === mathFence.quoteDepth
      && (
        mathFence.marker === "$$"
          ? isDollarMathBlockClosing(line, 3, contentColumn)
          : !isMarkdownCodeIndented(line, contentColumn) && trimmed === "\\]"
      );
    return { kind: isClosing ? "math-fence" : "math", level: null, markerEnd: isClosing ? line.length : null };
  }

  const codeOpening = getContinuousCodeFenceOpening(line, contentColumn);
  if (codeOpening) {
    return {
      kind: fencedMathOpening ? "math-fence" : "code-fence",
      level: null,
      markerEnd: line.length,
    };
  }
  const mathOpening = getContainerMathFence(line, contentColumn);
  if (mathOpening && mathOpening.marker !== "\\]") {
    return { kind: "math-fence", level: null, markerEnd: line.length };
  }

  const heading = line.match(/^(\s{0,3})(#{1,6})(?:\s+|$)/);
  if (heading) {
    return { kind: "heading", level: heading[2].length, markerEnd: heading[0].length };
  }
  if (isMarkdownHorizontalRuleLine(line)) {
    return { kind: "horizontal-rule", level: null, markerEnd: line.length };
  }
  if (/^\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\]\s+/.test(line)) {
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
  if (!trimmed) {
    return { kind: "blank", level: null, markerEnd: null };
  }
  return { kind: "paragraph", level: null, markerEnd: null };
}

function getLineBlockquotePrefix(
  line: string,
  inFrontmatter: boolean,
  codeFence: CodeFenceState | null,
  mathFence: MathFenceState | null,
): BlockquotePrefix | null {
  if (inFrontmatter) return null;
  const fenceQuoteDepth = codeFence?.quoteDepth ?? mathFence?.quoteDepth ?? null;
  if (fenceQuoteDepth === 0) return null;
  return getBlockquotePrefix(line, fenceQuoteDepth);
}

function getBlockquotePrefix(line: string, maxDepth: number | null = null): BlockquotePrefix | null {
  const quote = readMarkdownBlockquotePrefix(line, maxDepth);
  return quote
    ? { depth: quote.depth, end: quote.raw.length, contentColumn: quote.contentColumn }
    : null;
}

function stripContainerQuoteMarkers(
  line: string,
  prefix: ReturnType<typeof readMarkdownContainerPrefix>,
): string {
  let output = "";
  let cursor = 0;
  for (const marker of prefix.markers) {
    if (marker.kind !== "blockquote") continue;
    output += line.slice(cursor, marker.markerFrom);
    cursor = marker.markerTo;
  }
  return output + line.slice(cursor);
}

function getLeadingContainerQuotePrefixEnd(
  prefix: ReturnType<typeof readMarkdownContainerPrefix> | null,
): number | null {
  let end: number | null = null;
  for (const marker of prefix?.markers ?? []) {
    if (marker.kind !== "blockquote") break;
    end = marker.to;
  }
  return end;
}

function getNestedContainerQuoteMarkers(
  prefix: ReturnType<typeof readMarkdownContainerPrefix> | null,
  lineOffset: number,
): Array<{ from: number; to: number }> {
  const result: Array<{ from: number; to: number }> = [];
  let afterListMarker = false;
  for (const marker of prefix?.markers ?? []) {
    if (marker.kind !== "blockquote") {
      afterListMarker = true;
      continue;
    }
    if (!afterListMarker) continue;
    result.push({
      from: lineOffset + marker.markerFrom,
      to: lineOffset + marker.markerTo,
    });
  }
  return result;
}

function applyBlockquoteSemantics(
  metadata: ContinuousMarkdownLineMetadata,
  quoteDepth: number,
): ContinuousMarkdownLineMetadata {
  if (quoteDepth <= 0 || !["blank", "paragraph"].includes(metadata.kind)) return metadata;
  return { ...metadata, kind: "blockquote" };
}

function getHiddenMarker(
  line: string,
  lineOffset: number,
  kind: ContinuousMarkdownLineKind,
  markerEnd: number | null,
  quotePrefixEnd: number | null,
): { from: number; to: number } | null {
  const prefixEnd = quotePrefixEnd ?? 0;
  const hidesSemanticMarker = [
    "heading",
    "setext-marker",
    "blockquote",
    "code-fence",
    "math-fence",
    "horizontal-rule",
    "frontmatter",
  ].includes(kind);
  const hiddenEnd = hidesSemanticMarker && markerEnd !== null && markerEnd > 0
    ? prefixEnd + markerEnd
    : prefixEnd;
  if (hiddenEnd <= 0) return null;
  return {
    from: lineOffset,
    to: lineOffset + Math.min(hiddenEnd, line.length),
  };
}

function getTrailingMarker(
  line: string,
  lineOffset: number,
  kind: ContinuousMarkdownLineKind,
  quotePrefixEnd: number | null,
): { from: number; to: number } | null {
  if (kind !== "heading") return null;
  const contentFrom = quotePrefixEnd ?? 0;
  const content = line.slice(contentFrom);
  const opening = content.match(/^\s{0,3}#{1,6}/);
  if (!opening) return null;
  const trailing = content.slice(opening[0].length).match(/[ \t]+#+[ \t]*$/);
  if (!trailing || trailing.index === undefined) return null;
  const visibleContent = content.slice(
    opening[0].length,
    opening[0].length + trailing.index,
  );
  if (!visibleContent.trim()) return null;
  return {
    from: lineOffset + contentFrom + opening[0].length + trailing.index,
    to: lineOffset + line.length,
  };
}

function collectTableLineIndexes(lines: string[]): Set<number> {
  const indexes = new Set<number>();
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerCells = splitTableCells(lines[index]);
    const separatorCells = splitTableCells(lines[index + 1]);
    if (
      !hasTableCells(lines[index])
      || !isTableSeparator(lines[index + 1])
      || headerCells.length !== separatorCells.length
    ) continue;
    indexes.add(index);
    indexes.add(index + 1);
    for (let row = index + 2; row < lines.length && hasTableCells(lines[row]); row += 1) {
      indexes.add(row);
    }
  }
  return indexes;
}

function hasTableCells(line: string): boolean {
  return /(^|[^\\])\|/.test(getTableSemanticLine(line));
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((cell) => /^\s*:?-+:?\s*$/.test(cell));
}

function splitTableCells(line: string): string[] {
  let content = getTableSemanticLine(line).trim();
  if (content.startsWith("|")) content = content.slice(1);
  if (content.endsWith("|") && !isEscapedTablePipe(content, content.length - 1)) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let cell = "";
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscapedTablePipe(content, index)) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += content[index];
  }
  cells.push(cell);
  return cells;
}

function isEscapedTablePipe(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function getTableSemanticLine(line: string): string {
  const normalized = normalizeLine(line);
  const prefix = readMarkdownContainerPrefix(normalized);
  return prefix.codeIndented
    || isMarkdownCodeIndented(prefix.content, prefix.contentColumn)
    ? ""
    : prefix.content;
}

function normalizeLine(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.trunc(offset), length));
}

function getPreviewBlockKind(
  blockType: string,
  source: string,
  allowDiagram = !isIndentedCodePreviewSource(source),
  listContinuation = false,
): ContinuousPreviewBlockKind | null {
  if (blockType === "table") return "table";
  if (blockType === "math") return "math";
  if (blockType === "definition") return "definition";
  if (blockType === "html") {
    return /^<!--marko-image-[\w-]+-->$/.test(source.trim()) ? null : "html";
  }
  if (blockType === "code") {
    const semanticSource = listContinuation
      ? normalizeContinuousListFenceSource(source)
      : source;
    if (isMarkdownFencedMathBlock(semanticSource)) return "math";
    if (allowDiagram && getContinuousDiagramLanguage(semanticSource)) return "diagram";
    return "code";
  }
  if (isMarkdownTocLine(source)) return "toc";

  const trimmed = source.trim();

  const inlineSyntax = collectInlineMarkdownSyntax(trimmed);
  const standaloneImage = inlineSyntax.find((item) => (
    item.type === "image" && item.start === 0 && item.end === trimmed.length
  ));
  if (standaloneImage) return "image";

  const standaloneLink = inlineSyntax.find((item) => (
    item.type === "link" && item.start === 0 && item.end === trimmed.length
  ));
  const linkedImage = inlineSyntax.find((item) => (
    item.type === "image"
    && standaloneLink
    && standaloneLink.label.trim() === item.raw
  ));
  return linkedImage ? "image" : null;
}

function normalizeContinuousListFenceSource(source: string): string {
  const lineBreak = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const firstLineIndex = lines.findIndex((line) => line.trim());
  if (firstLineIndex < 0) return source;

  const firstLine = lines[firstLineIndex]!;
  const firstPrefix = readMarkdownContainerPrefix(firstLine);
  const firstSemantic = stripContainerQuoteMarkers(firstLine, firstPrefix);
  const firstList = stripMarkdownListContainerMarkers(firstSemantic);
  const width = firstList.continuationIndentWidth
    || getMarkdownIndentWidth(getLeadingMarkdownIndent(firstSemantic));
  if (width === 0) return source;

  return lines.map((line, index) => {
    if (!line.trim()) return "";
    const prefix = readMarkdownContainerPrefix(
      line,
      0,
      firstPrefix.quoteDepth,
    );
    const semantic = stripContainerQuoteMarkers(line, prefix);
    if (index === firstLineIndex && firstList.continuationIndentWidth > 0) {
      return firstList.content;
    }
    return stripMarkdownIndentColumns(semantic, width)?.content ?? semantic;
  }).join(lineBreak);
}
function isIndentedCodePreviewSource(source: string): boolean {
  const firstContentLine = source.split(/\r?\n/).find((line) => line.trim());
  if (!firstContentLine) return false;
  const prefix = readMarkdownContainerPrefix(firstContentLine);
  return prefix.codeIndented || isMarkdownCodeIndented(
    prefix.content,
    prefix.contentColumn,
  );
}

export function getContinuousDiagramLanguage(source: string): ContinuousDiagramLanguage | null {
  const firstLine = normalizeLine(source.split("\n", 1)[0] ?? "");
  const prefix = readMarkdownContainerPrefix(firstLine);
  if (
    prefix.codeIndented
    || isMarkdownCodeIndented(prefix.content, prefix.contentColumn)
  ) return null;
  const semanticLine = prefix.content.trimStart();
  const match = semanticLine.match(/^(?:`{3,}|~{3,})([^\r\n]*)/);
  const language = match?.[1].trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (language === "mermaid" || language === "mmd") return "mermaid";
  if (language === "flowchart" || language === "flow") return "flowchart";
  if (language === "sequence") return "sequence";
  return null;
}

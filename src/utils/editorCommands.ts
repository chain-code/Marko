import { renumberOrderedListBlockAtLine, splitMarkdownBlocks } from "./editorBlocks";
import { markdownLanguage } from "@codemirror/lang-markdown";
import {
  incrementOrderedListNumber,
  normalizeOrderedListNumber,
} from "./orderedListNumber";
import MarkdownIt from "markdown-it";
import { renderMarkdown, renderMarkdownInlineSource } from "./markdown";
import {
  findMarkdownLinkAtCursor,
  parseMarkdownLinkDestination,
  readMarkdownInlineLink,
  readMarkdownReferenceLink,
  readMarkdownShortcutReferenceLink,
  replaceMarkdownLinkSyntax,
} from "./markdownLinks";
import { getPreviewLinkAction } from "./previewLinks";
import { defaultEditorSettings } from "./editorSettings";
import { collectMathDocumentItems } from "./mathRendering";
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
  readMarkdownBlockquotePrefix,
  stripMarkdownIndentColumns,
  stripMarkdownListContainerMarkers,
} from "./markdownIndent";
import { collectInlineHtmlSyntax } from "./inlineSyntax";
import { collectHighlightSyntax } from "./inlineStyleSyntax";
import { normalizeCodeFenceInfoString } from "./codeFenceLanguage";
import {
  collectReferenceDefinitionSemantics,
  normalizeMarkdownReferenceLabel,
  type ReferenceDefinitionSemantics,
} from "./referenceDefinitionSemantics";
import type { EditorSettings } from "@/types";

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface MarkdownEnterModifiers {
  primary?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export interface TextEditResult extends TextState {}

export interface SelectAllTarget {
  sourceModeRequired: boolean;
  selectionStart: number;
  selectionEnd: number;
}

export interface LineRange {
  value: string;
  start: number;
  end: number;
  lineStart: number;
  normalizedEnd: number;
}

interface SetextHeadingRange {
  headingStart: number;
  headingEnd: number;
  underlineStart: number;
  underlineEnd: number;
  title: string;
  titleStart: number;
  quotePrefix: string;
}

interface LineTransform {
  oldLength: number;
  newLength: number;
  oldContentStart: number;
  newContentStart: number;
  contentLength: number;
}

export interface PasteMarkdownPayload {
  text?: string;
  html?: string;
}

export interface MarkdownSelectionProjectionOptions {
  preserveInlineSemantics?: boolean;
  includeHtml?: boolean;
  includeMarks?: boolean;
  includeHighlight?: boolean;
  includeSuperscript?: boolean;
  includeSubscript?: boolean;
}

export interface MarkdownSelectionProjection {
  source: string;
  markdown: string;
  plainText: string;
}

interface MarkdownSelectionSemanticScope {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  open: string;
  close: string;
}

type MarkdownSelectionSyntaxNode = ReturnType<typeof markdownLanguage.parser.parse>["topNode"];

interface QuotedListMatch {
  quotePrefix: string;
  rawQuoteLength: number;
  listIndent: string;
  marker: string;
  taskMarker: string;
  markerEnd: number;
  content: string;
}

interface MarkdownImageMatch {
  start: number;
  end: number;
  alt: string;
  source: string;
  title: string;
}


interface SetextLineContext {
  content: string;
  quotePrefix: string;
  rawQuoteLength: number;
}

interface PastedInlineSemanticStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mark?: boolean;
  underline?: boolean;
  sub?: boolean;
  sup?: boolean;
}

interface MarkdownFrontMatterRange {
  contentStart: number;
  contentEnd: number;
  closingContentEnd: number;
  closingEnd: number;
}

interface MarkdownAtxHeadingPattern {
  lineStart: number;
  lineEnd: number;
  contentStart: number;
  contentEnd: number;
  opening: string;
  closing: string;
  plainPrefix: string;
  quotePrefix: string;
}

interface MarkdownSetextHeadingPattern {
  headingStart: number;
  headingEnd: number;
  contentStart: number;
  contentEnd: number;
  titlePrefix: string;
  titleSuffix: string;
  underline: string;
  quotePrefix: string;
}

interface MarkdownContainerParagraphPattern {
  contentStart: number;
  contentEnd: number;
  separator: string;
  continuation: string;
}

interface PastedDefinitionListEntry {
  term: string;
  definitions: string[];
}

interface DefinitionListMarkerLine {
  quotePrefix: string;
  indent: string;
  content: string;
  markerEnd: number;
}

interface DefinitionListContinuationLine {
  quotePrefix: string;
  rawQuoteLength: number;
  indent: string;
  content: string;
}

interface ListContinuationLine {
  quotePrefix: string;
  rawQuoteLength: number;
  indent: string;
  content: string;
}

export const tableTemplate = "\n| 列 1 | 列 2 | 列 3 |\n| --- | :---: | --- |\n| 内容 | 内容 | 内容 |\n";
type MarkdownCalloutKind = "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | "CAUTION";
const markdownCalloutKinds = new Set<MarkdownCalloutKind>([
  "NOTE",
  "TIP",
  "IMPORTANT",
  "WARNING",
  "CAUTION",
]);
export const calloutTemplate = createMarkdownCalloutTemplate("NOTE");
const footnotePlaceholder = "脚注内容";
const mermaidTemplateSource = "flowchart LR\n  A[开始] --> B[结束]";
const flowchartTemplateSource = "st=>start: 开始\ne=>end: 结束\nst->e";
const sequenceTemplateSource = [
  "Alice->Bob: Hello Bob, how are you?",
  "Note right of Bob: Bob thinks",
  "Bob-->Alice: I am good thanks!",
].join("\n");
const markdownHtmlEntityUtils = new MarkdownIt("zero").utils;
const plainTextMarkdownSettings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: {
    ...defaultEditorSettings.extensions,
    marks: true,
  },
};
const clearFormatMarkdownSettings: EditorSettings = {
  ...plainTextMarkdownSettings,
  smartPunctuation: false,
  smartQuotes: false,
  smartDashes: false,
};

export function normalizeSelection(state: TextState): TextState {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd));
  const selectionEnd = Math.max(0, Math.max(state.selectionStart, state.selectionEnd));
  return {
    value: state.value,
    selectionStart,
    selectionEnd,
  };
}

export function getSelectAllTarget(sourceMode: boolean, documentLength: number, activeTextLength: number): SelectAllTarget {
  const selectionEnd = Math.max(0, sourceMode ? activeTextLength : documentLength);
  return {
    sourceModeRequired: !sourceMode,
    selectionStart: 0,
    selectionEnd,
  };
}

export function getSelectedMarkdownSource(
  sourceMode: boolean,
  documentValue: string,
  activeValue: string,
  activeStart: number,
  selectionStart: number,
  selectionEnd: number,
): string {
  const normalizedStart = Math.max(0, Math.min(selectionStart, selectionEnd));
  const normalizedEnd = Math.max(0, Math.max(selectionStart, selectionEnd));
  if (sourceMode) {
    return documentValue.slice(
      Math.min(normalizedStart, documentValue.length),
      Math.min(normalizedEnd, documentValue.length),
    );
  }

  const documentStart = Math.max(0, Math.min(activeStart + normalizedStart, documentValue.length));
  const documentEnd = Math.max(0, Math.min(activeStart + normalizedEnd, documentValue.length));
  const fromDocument = documentValue.slice(documentStart, documentEnd);
  return fromDocument || activeValue.slice(Math.min(normalizedStart, activeValue.length), Math.min(normalizedEnd, activeValue.length));
}

export function getSelectedMarkdownHtml(
  sourceMode: boolean,
  documentValue: string,
  activeValue: string,
  activeStart: number,
  selectionStart: number,
  selectionEnd: number,
  settings: EditorSettings,
  basePath?: string,
): string {
  const markdownSource = getSelectedMarkdownSource(
    sourceMode,
    documentValue,
    activeValue,
    activeStart,
    selectionStart,
    selectionEnd,
  );
  return renderMarkdown(markdownSource, {
    settings,
    documentSource: documentValue,
    basePath,
  }).trim();
}

export function getPlainTextFromMarkdownSelection(markdown: string): string {
  const source = normalizeTablesForPlainTextRender(markdown);
  const html = renderMarkdown(source, {
    settings: plainTextMarkdownSettings,
    documentSource: source,
  });
  return getVisibleTextFromMarkdownHtml(html, {
    blockLayout: true,
    includeComments: false,
  });
}

export function projectMarkdownSelectionSemantics(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  options: MarkdownSelectionProjectionOptions = {},
): MarkdownSelectionProjection {
  const start = clampMarkdownSelectionOffset(Math.min(selectionStart, selectionEnd), source.length);
  const end = clampMarkdownSelectionOffset(Math.max(selectionStart, selectionEnd), source.length);
  const selectedSource = source.slice(start, end);
  let markdown = selectedSource;

  if (selectedSource && options.preserveInlineSemantics !== false) {
    const scopes = collectMarkdownSelectionSemanticScopes(source, start, end, options);
    markdown = [
      ...scopes.map((scope) => scope.open),
      selectedSource,
      ...[...scopes].reverse().map((scope) => scope.close),
    ].join("");
  }

  return {
    source: selectedSource,
    markdown,
    plainText: getPlainTextFromMarkdownSelection(markdown),
  };
}

function collectMarkdownSelectionSemanticScopes(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  options: MarkdownSelectionProjectionOptions,
): MarkdownSelectionSemanticScope[] {
  const scopes: MarkdownSelectionSemanticScope[] = [];
  const literalBlockRanges: Array<{ from: number; to: number }> = [];
  const definitions = new Map<string, ReferenceDefinitionSemantics>();
  for (const definition of collectReferenceDefinitionSemantics(source)) {
    if (!definitions.has(definition.label.normalized)) {
      definitions.set(definition.label.normalized, definition);
    }
  }

  markdownLanguage.parser.parse(source).iterate({
    enter(cursor) {
      if (["FencedCode", "CodeBlock", "IndentedCode", "HTMLBlock"].includes(cursor.name)) {
        literalBlockRanges.push({ from: cursor.from, to: cursor.to });
        return false;
      }
      const scope = getParsedMarkdownSelectionSemanticScope(
        source,
        cursor.node,
        definitions,
        options,
      );
      if (scope && selectionInsideSemanticScope(selectionStart, selectionEnd, scope)) {
        scopes.push(scope);
      }
      return undefined;
    },
  });

  if (options.includeHighlight ?? options.includeMarks ?? true) {
    for (const highlight of collectHighlightSyntax(source)) {
      if (markdownSelectionRangeIntersects(
        highlight.from,
        highlight.to,
        literalBlockRanges,
      )) {
        continue;
      }
      const scope: MarkdownSelectionSemanticScope = {
        from: highlight.from,
        to: highlight.to,
        contentFrom: highlight.contentFrom,
        contentTo: highlight.contentTo,
        open: source.slice(highlight.from, highlight.contentFrom),
        close: source.slice(highlight.contentTo, highlight.to),
      };
      if (selectionInsideSemanticScope(selectionStart, selectionEnd, scope)) {
        scopes.push(scope);
      }
    }
  }

  if (options.includeHtml !== false) {
    for (const html of collectInlineHtmlSyntax(source)) {
      if (markdownSelectionRangeIntersects(html.start, html.end, literalBlockRanges)) {
        continue;
      }
      const scope = getHtmlMarkdownSelectionSemanticScope(source, html.start, html.end);
      if (scope && selectionInsideSemanticScope(selectionStart, selectionEnd, scope)) {
        scopes.push(scope);
      }
    }
  }

  const unique = new Map<string, MarkdownSelectionSemanticScope>();
  for (const scope of scopes) {
    const key = [scope.from, scope.to, scope.contentFrom, scope.contentTo].join(":");
    if (!unique.has(key)) unique.set(key, scope);
  }
  return [...unique.values()].sort((left, right) => (
    left.from - right.from || right.to - left.to
  ));
}

function getParsedMarkdownSelectionSemanticScope(
  source: string,
  node: MarkdownSelectionSyntaxNode,
  definitions: ReadonlyMap<string, ReferenceDefinitionSemantics>,
  options: MarkdownSelectionProjectionOptions,
): MarkdownSelectionSemanticScope | null {
  if (node.name === "Link") {
    return getLinkMarkdownSelectionSemanticScope(source, node, definitions);
  }

  const markerName = {
    StrongEmphasis: "EmphasisMark",
    Emphasis: "EmphasisMark",
    Strikethrough: "StrikethroughMark",
    InlineCode: "CodeMark",
    Subscript: "SubscriptMark",
    Superscript: "SuperscriptMark",
  }[node.name];
  if (!markerName) return null;
  if (
    node.name === "Subscript"
    && !(options.includeSubscript ?? options.includeMarks ?? true)
  ) return null;
  if (
    node.name === "Superscript"
    && !(options.includeSuperscript ?? options.includeMarks ?? true)
  ) return null;

  const markers = getMarkdownSelectionSyntaxChildren(node)
    .filter((child) => child.name === markerName);
  if (markers.length < 2) return null;
  const first = markers[0]!;
  const last = markers.at(-1)!;
  return {
    from: node.from,
    to: node.to,
    contentFrom: first.to,
    contentTo: last.from,
    open: source.slice(node.from, first.to),
    close: source.slice(last.from, node.to),
  };
}

function getLinkMarkdownSelectionSemanticScope(
  source: string,
  node: MarkdownSelectionSyntaxNode,
  definitions: ReadonlyMap<string, ReferenceDefinitionSemantics>,
): MarkdownSelectionSemanticScope | null {
  const link = readMarkdownInlineLink(source, node.from)
    ?? readMarkdownReferenceLink(source, node.from)
    ?? readMarkdownShortcutReferenceLink(source, node.from);
  if (!link || link.end !== node.to || link.imageStart !== null) return null;

  let close = source.slice(link.labelEnd, link.end);
  if (link.destinationStart === null) {
    const referenceLabel = link.referenceLabel || link.label;
    const definition = definitions.get(normalizeMarkdownReferenceLabel(referenceLabel));
    if (!definition) return null;
    const destination = formatProjectedLinkDestination(definition.url.value);
    if (!destination) return null;
    close = "](" + destination + formatProjectedLinkTitle(definition.title?.value ?? "") + ")";
  }
  return {
    from: node.from,
    to: node.to,
    contentFrom: link.labelStart,
    contentTo: link.labelEnd,
    open: source.slice(node.from, link.labelStart),
    close,
  };
}

function getHtmlMarkdownSelectionSemanticScope(
  source: string,
  from: number,
  to: number,
): MarkdownSelectionSemanticScope | null {
  const raw = source.slice(from, to);
  const opening = raw.match(/^<[A-Za-z][\w:-]*(?:\s[^<>]*?)?>/);
  const closing = raw.match(/<\/[A-Za-z][\w:-]*\s*>$/);
  if (!opening || !closing) return null;
  const contentFrom = from + opening[0].length;
  const contentTo = to - closing[0].length;
  if (contentTo <= contentFrom) return null;
  return {
    from,
    to,
    contentFrom,
    contentTo,
    open: opening[0],
    close: closing[0],
  };
}

function getMarkdownSelectionSyntaxChildren(
  node: MarkdownSelectionSyntaxNode,
): MarkdownSelectionSyntaxNode[] {
  const children: MarkdownSelectionSyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }
  return children;
}

function selectionInsideSemanticScope(
  selectionStart: number,
  selectionEnd: number,
  scope: MarkdownSelectionSemanticScope,
): boolean {
  return selectionEnd > selectionStart
    && selectionStart >= scope.contentFrom
    && selectionEnd <= scope.contentTo;
}

function formatProjectedLinkDestination(value: string): string {
  const destination = value.trim();
  if (!destination) return "";
  return /[\s()]/.test(destination)
    ? "<" + destination.replace(/>/g, "%3E") + ">"
    : destination;
}

function formatProjectedLinkTitle(value: string): string {
  const title = value.trim();
  return title
    ? " \"" + title.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\""
    : "";
}

function clampMarkdownSelectionOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.trunc(value), length));
}

function markdownSelectionRangeIntersects(
  from: number,
  to: number,
  ranges: ReadonlyArray<{ from: number; to: number }>,
): boolean {
  return ranges.some((range) => from < range.to && to > range.from);
}

export function wrapMarkdownSelection(
  state: TextState,
  before: string,
  after: string,
  placeholder = "",
): TextEditResult {
  const normalized = normalizeSelection(state);
  if (before === "`" && after === "`") {
    return wrapMarkdownCodeSpanSelection(normalized, placeholder);
  }

  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd) || placeholder;
  if (
    selected
    && selected !== placeholder
    && selected.startsWith(before)
    && selected.endsWith(after)
    && selected.length >= before.length + after.length
  ) {
    const unwrapped = selected.slice(before.length, selected.length - after.length);
    const value = [
      normalized.value.slice(0, normalized.selectionStart),
      unwrapped,
      normalized.value.slice(normalized.selectionEnd),
    ].join("");
    return {
      value,
      selectionStart: normalized.selectionStart,
      selectionEnd: normalized.selectionStart + unwrapped.length,
    };
  }

  if (selected && selected !== placeholder) {
    const wrapperStart = normalized.selectionStart - before.length;
    const wrapperEnd = normalized.selectionEnd + after.length;
    if (
      wrapperStart >= 0
      && normalized.value.slice(wrapperStart, normalized.selectionStart) === before
      && normalized.value.slice(normalized.selectionEnd, wrapperEnd) === after
    ) {
      const value = [
        normalized.value.slice(0, wrapperStart),
        selected,
        normalized.value.slice(wrapperEnd),
      ].join("");
      return {
        value,
        selectionStart: wrapperStart,
        selectionEnd: wrapperStart + selected.length,
      };
    }
  }

  const value = [
    normalized.value.slice(0, normalized.selectionStart),
    before,
    selected,
    after,
    normalized.value.slice(normalized.selectionEnd),
  ].join("");
  const selectionStart = normalized.selectionStart + before.length;
  const selectionEnd = selectionStart + selected.length;
  return { value, selectionStart, selectionEnd };
}

interface MarkdownInlineStylePair {
  opening: string;
  closing: string;
}

interface MarkdownInlineStyleDefinition {
  kind: "delimiter" | "underline" | "code";
  preferred: MarkdownInlineStylePair;
  aliases: MarkdownInlineStylePair[];
}

interface MarkdownInlineStyleRange extends IndexRange {
  contentStart: number;
  contentEnd: number;
  opening: string;
  closing: string;
  kind: MarkdownInlineStyleDefinition["kind"];
}

interface MarkdownInlineStyleParseResult {
  ranges: MarkdownInlineStyleRange[];
  ambiguous: IndexRange[];
}

interface MarkdownInlineStyleEdit extends IndexRange {
  text: string;
}

export function toggleMarkdownInlineStyle(
  state: TextState,
  before: string,
  after: string,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const definition = getMarkdownInlineStyleDefinition(before, after);
  if (!definition) return null;

  const parseSpans = collectMarkdownInlineStyleParseSpans(normalized.value);
  const parsed = collectMarkdownInlineStyleRanges(normalized.value, definition, parseSpans);
  if (normalized.selectionStart === normalized.selectionEnd) {
    return toggleMarkdownInlineStyleAtCursor(normalized, definition, parsed, parseSpans);
  }

  const rawSegments = getMarkdownInlineStyleSelectionSegments(normalized);
  if (!rawSegments?.length) return null;
  const segments = rawSegments
    .map((segment) => normalizeMarkdownInlineStyleSegment(segment, parsed.ranges, normalized.value))
    .filter((segment) => segment.start < segment.end);
  if (!segments.length) return null;

  if (segments.length === 1) {
    const containing = parsed.ranges.filter((range) => selectionIsInsideInlineStyleRange(
      normalized.selectionStart,
      normalized.selectionEnd,
      range,
    ));
    if (containing.length > 1) return null;
    if (containing.length === 1) {
      return removeMarkdownInlineStyleFromSelection(normalized, definition, containing[0], parseSpans);
    }
  }

  return applyMarkdownInlineStyleToSegments(normalized, definition, parsed, segments, parseSpans);
}

function getMarkdownInlineStyleDefinition(
  before: string,
  after: string,
): MarkdownInlineStyleDefinition | null {
  if ((before === "**" && after === "**") || (before === "__" && after === "__")) {
    return {
      kind: "delimiter",
      preferred: { opening: before, closing: after },
      aliases: [
        { opening: "**", closing: "**" },
        { opening: "__", closing: "__" },
      ],
    };
  }
  if ((before === "*" && after === "*") || (before === "_" && after === "_")) {
    return {
      kind: "delimiter",
      preferred: { opening: before, closing: after },
      aliases: [
        { opening: "*", closing: "*" },
        { opening: "_", closing: "_" },
      ],
    };
  }
  if (before === "<u>" && after === "</u>") {
    return {
      kind: "underline",
      preferred: { opening: before, closing: after },
      aliases: [{ opening: before, closing: after }],
    };
  }
  if ([
    ["<strong>", "</strong>"],
    ["<b>", "</b>"],
    ["<em>", "</em>"],
    ["<i>", "</i>"],
    ["<del>", "</del>"],
    ["<s>", "</s>"],
    ["<strike>", "</strike>"],
    ["<mark>", "</mark>"],
    ["<ins>", "</ins>"],
    ["<sub>", "</sub>"],
    ["<sup>", "</sup>"],
  ].some(([opening, closing]) => before === opening && after === closing)) {
    return {
      kind: "underline",
      preferred: { opening: before, closing: after },
      aliases: [{ opening: before, closing: after }],
    };
  }
  if (before === "`" && after === "`") {
    return {
      kind: "code",
      preferred: { opening: before, closing: after },
      aliases: [{ opening: before, closing: after }],
    };
  }
  if (
    (before === "~~" && after === "~~")
    || (before === "==" && after === "==")
    || (before === "^" && after === "^")
    || (before === "~" && after === "~")
  ) {
    return {
      kind: "delimiter",
      preferred: { opening: before, closing: after },
      aliases: [{ opening: before, closing: after }],
    };
  }
  return null;
}

function toggleMarkdownInlineStyleAtCursor(
  state: TextState,
  definition: MarkdownInlineStyleDefinition,
  parsed: MarkdownInlineStyleParseResult,
  parseSpans: IndexRange[],
): TextEditResult | null {
  const cursor = state.selectionStart;
  const allStyles = collectAllMarkdownInlineStyleRanges(state.value, parseSpans);
  if (inlineStyleOffsetIsInsideMarker(cursor, allStyles)) return null;
  if (
    definition.kind !== "code"
    && allStyles.some((range) => range.kind === "code" && cursor > range.start && cursor < range.end)
  ) return null;
  const restored = restoreMarkdownInlineStyleBoundary(state, definition);
  if (restored) return restored;
  if (!markdownInlineStyleCursorIsSafe(state.value, cursor, parseSpans)) return null;
  if (parsed.ambiguous.some((range) => cursor >= range.start && cursor <= range.end)) return null;

  const containing = parsed.ranges.filter((range) => cursor >= range.contentStart && cursor <= range.contentEnd);
  if (containing.length > 1) return null;
  if (containing.length === 1) {
    const range = containing[0];
    if (cursor === range.contentStart) {
      return { value: state.value, selectionStart: range.start, selectionEnd: range.start };
    }
    if (cursor === range.contentEnd) {
      return { value: state.value, selectionStart: range.end, selectionEnd: range.end };
    }
    if (markdownInlineStyleBoundaryIsComplex(state.value, cursor, range, parseSpans)) return null;

    const left = state.value.slice(range.contentStart, cursor);
    const right = state.value.slice(cursor, range.contentEnd);
    if (definition.kind === "code" && (left.endsWith("`") || right.startsWith("`"))) return null;
    const leftWrapped = wrapMarkdownInlineStyleContent(left, definition, range.opening, range.closing);
    const rightWrapped = wrapMarkdownInlineStyleContent(right, definition, range.opening, range.closing);
    const replacement = `${leftWrapped}${rightWrapped}`;
    const value = `${state.value.slice(0, range.start)}${replacement}${state.value.slice(range.end)}`;
    const nextCursor = range.start + leftWrapped.length;
    return { value, selectionStart: nextCursor, selectionEnd: nextCursor };
  }

  const entering = parsed.ranges.find((range) => range.start === cursor || range.end === cursor);
  if (entering) {
    const nextCursor = entering.start === cursor ? entering.contentStart : entering.contentEnd;
    return { value: state.value, selectionStart: nextCursor, selectionEnd: nextCursor };
  }
  const opening = definition.preferred.opening;
  const closing = definition.preferred.closing;
  const value = `${state.value.slice(0, cursor)}${opening}${closing}${state.value.slice(cursor)}`;
  const nextCursor = cursor + opening.length;
  return { value, selectionStart: nextCursor, selectionEnd: nextCursor };
}

function restoreMarkdownInlineStyleBoundary(
  state: TextState,
  definition: MarkdownInlineStyleDefinition,
): TextEditResult | null {
  const cursor = state.selectionStart;
  if (definition.kind === "code") {
    const leftLength = countBacktickRunBefore(state.value, cursor);
    const rightLength = countBacktickRunAfter(state.value, cursor);
    if (leftLength === 0 || leftLength !== rightLength) return null;
    const value = `${state.value.slice(0, cursor - leftLength)}${state.value.slice(cursor + rightLength)}`;
    const nextCursor = cursor - leftLength;
    return { value, selectionStart: nextCursor, selectionEnd: nextCursor };
  }

  for (const pair of definition.aliases) {
    const boundaries = [
      { left: pair.opening, right: pair.closing },
      { left: pair.closing, right: pair.opening },
    ];
    for (const boundary of boundaries) {
      const boundaryStart = cursor - boundary.left.length;
      if (boundaryStart < 0) continue;
      if (state.value.slice(boundaryStart, cursor) !== boundary.left) continue;
      if (state.value.slice(cursor, cursor + boundary.right.length) !== boundary.right) continue;
      if (isEscapedAt(state.value, boundaryStart) || isEscapedAt(state.value, cursor)) continue;
      const value = `${state.value.slice(0, boundaryStart)}${state.value.slice(cursor + boundary.right.length)}`;
      return { value, selectionStart: boundaryStart, selectionEnd: boundaryStart };
    }
  }
  return null;
}

function removeMarkdownInlineStyleFromSelection(
  state: TextState,
  definition: MarkdownInlineStyleDefinition,
  range: MarkdownInlineStyleRange,
  parseSpans: IndexRange[],
): TextEditResult | null {
  const selectionStart = state.selectionStart <= range.contentStart ? range.contentStart : state.selectionStart;
  const selectionEnd = state.selectionEnd >= range.contentEnd ? range.contentEnd : state.selectionEnd;
  if (selectionStart >= selectionEnd) return null;
  if (
    markdownInlineStyleBoundaryIsComplex(state.value, selectionStart, range, parseSpans)
    || markdownInlineStyleBoundaryIsComplex(state.value, selectionEnd, range, parseSpans)
  ) return null;

  const left = state.value.slice(range.contentStart, selectionStart);
  const selected = state.value.slice(selectionStart, selectionEnd);
  const right = state.value.slice(selectionEnd, range.contentEnd);
  const leftWrapped = wrapMarkdownInlineStyleContent(left, definition, range.opening, range.closing);
  const rightWrapped = wrapMarkdownInlineStyleContent(right, definition, range.opening, range.closing);
  const replacement = `${leftWrapped}${selected}${rightWrapped}`;
  const value = `${state.value.slice(0, range.start)}${replacement}${state.value.slice(range.end)}`;
  const nextSelectionStart = range.start + leftWrapped.length;
  return {
    value,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionStart + selected.length,
  };
}

function applyMarkdownInlineStyleToSegments(
  state: TextState,
  definition: MarkdownInlineStyleDefinition,
  parsed: MarkdownInlineStyleParseResult,
  segments: IndexRange[],
  parseSpans: IndexRange[],
): TextEditResult | null {
  const edits: MarkdownInlineStyleEdit[] = [];
  const allStyles = collectAllMarkdownInlineStyleRanges(state.value, parseSpans);

  for (const segment of segments) {
    if (definition.kind !== "code" && /\r?\n\s*\r?\n/.test(state.value.slice(segment.start, segment.end))) {
      return null;
    }
    if (
      definition.kind !== "code"
      && allStyles.some((range) => (
        range.kind === "code"
        && rangesOverlap(segment.start, segment.end, range.start, range.end)
        && !(segment.start <= range.start && segment.end >= range.end)
      ))
    ) return null;
    const alreadyFormatted = parsed.ranges.filter((range) => (
      segment.start >= range.contentStart && segment.end <= range.contentEnd
    ));
    if (alreadyFormatted.length > 1) return null;
    if (alreadyFormatted.length === 1) continue;

    const affected = collectTouchingMarkdownInlineStyleRanges(segment, parsed.ranges);
    if (markdownInlineStyleRangesOverlap(affected)) return null;
    const groupStart = affected.reduce((start, range) => Math.min(start, range.contentStart), segment.start);
    const groupEnd = affected.reduce((end, range) => Math.max(end, range.contentEnd), segment.end);
    const sourceStart = affected.reduce((start, range) => Math.min(start, range.start), segment.start);
    const sourceEnd = affected.reduce((end, range) => Math.max(end, range.end), segment.end);
    if (
      definition.kind !== "code"
      && parsed.ambiguous.some((range) => rangesOverlap(range.start, range.end, sourceStart, sourceEnd))
    ) {
      return null;
    }
    if (
      inlineStyleOffsetIsInsideMarker(groupStart, allStyles)
      || inlineStyleOffsetIsInsideMarker(groupEnd, allStyles)
    ) return null;

    for (const range of affected) {
      edits.push({ start: range.start, end: range.contentStart, text: "" });
      edits.push({ start: range.contentEnd, end: range.end, text: "" });
    }
    const content = removeMarkdownInlineStyleWrappers(
      state.value,
      groupStart,
      groupEnd,
      affected,
    );
    if (markdownInlineStyleContentIsUnsupported(content, definition)) return null;
    const applicationPair = getMarkdownInlineStyleApplicationPair(
      state.value,
      groupStart,
      groupEnd,
      content,
      definition,
      affected,
    );
    if (!applicationPair) return null;
    const wrapper = getMarkdownInlineStyleWrapper(
      content,
      definition,
      applicationPair.opening,
      applicationPair.closing,
    );
    edits.push({ start: groupStart, end: groupStart, text: wrapper.opening });
    edits.push({ start: groupEnd, end: groupEnd, text: wrapper.closing });
  }

  const compacted = compactMarkdownInlineStyleEdits(edits);
  if (!compacted) return null;
  const value = applyMarkdownInlineStyleEdits(state.value, compacted);
  const selectionStart = mapMarkdownInlineStyleOffset(segments[0].start, "right", compacted);
  const selectionEnd = mapMarkdownInlineStyleOffset(segments[segments.length - 1].end, "left", compacted);
  return { value, selectionStart, selectionEnd };
}

function collectTouchingMarkdownInlineStyleRanges(
  segment: IndexRange,
  ranges: MarkdownInlineStyleRange[],
): MarkdownInlineStyleRange[] {
  let start = segment.start;
  let end = segment.end;
  const affected: MarkdownInlineStyleRange[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const range of ranges) {
      if (affected.includes(range)) continue;
      if (range.end < start || range.start > end) continue;
      affected.push(range);
      start = Math.min(start, range.start);
      end = Math.max(end, range.end);
      changed = true;
    }
  }
  return affected.sort((left, right) => left.start - right.start);
}

function removeMarkdownInlineStyleWrappers(
  value: string,
  start: number,
  end: number,
  ranges: MarkdownInlineStyleRange[],
): string {
  const removals = ranges
    .flatMap((range) => [
      { start: range.start, end: range.contentStart },
      { start: range.contentEnd, end: range.end },
    ])
    .filter((range) => range.start >= start && range.end <= end)
    .sort((left, right) => right.start - left.start);
  let content = value.slice(start, end);
  for (const range of removals) {
    const relativeStart = range.start - start;
    const relativeEnd = range.end - start;
    content = `${content.slice(0, relativeStart)}${content.slice(relativeEnd)}`;
  }
  return content;
}

function getMarkdownInlineStyleWrapper(
  content: string,
  definition: MarkdownInlineStyleDefinition,
  opening = definition.preferred.opening,
  closing = definition.preferred.closing,
): MarkdownInlineStylePair {
  if (definition.kind !== "code") return { opening, closing };
  const marker = opening === closing && /^`+$/.test(opening)
    && !content.includes(opening)
    ? opening
    : getCodeSpanMarker(content);
  const needsPadding = marker.length > 1 && (/^`|`$/.test(content));
  const padding = needsPadding ? " " : "";
  return {
    opening: `${marker}${padding}`,
    closing: `${padding}${marker}`,
  };
}

function getMarkdownInlineStyleApplicationPair(
  value: string,
  start: number,
  end: number,
  content: string,
  definition: MarkdownInlineStyleDefinition,
  removedRanges: MarkdownInlineStyleRange[],
): MarkdownInlineStylePair | null {
  if (definition.kind === "code") {
    const leftBacktick = value[start - 1] === "`"
      && !inlineStyleOffsetWillBeRemoved(start - 1, removedRanges);
    const rightBacktick = value[end] === "`"
      && !inlineStyleOffsetWillBeRemoved(end, removedRanges);
    return leftBacktick || rightBacktick ? null : definition.preferred;
  }
  if (definition.kind === "underline") return definition.preferred;

  const preferredCharacter = definition.preferred.opening[0];
  const collision = content.startsWith(preferredCharacter)
    || content.endsWith(preferredCharacter)
    || (value[start - 1] === preferredCharacter && !inlineStyleOffsetWillBeRemoved(start - 1, removedRanges))
    || (value[end] === preferredCharacter && !inlineStyleOffsetWillBeRemoved(end, removedRanges));
  if (!collision) return definition.preferred;

  const alternative = definition.aliases.find((pair) => pair.opening[0] !== preferredCharacter);
  if (!alternative) return null;
  const alternativeCharacter = alternative.opening[0];
  return content.startsWith(alternativeCharacter)
    || content.endsWith(alternativeCharacter)
    || (value[start - 1] === alternativeCharacter && !inlineStyleOffsetWillBeRemoved(start - 1, removedRanges))
    || (value[end] === alternativeCharacter && !inlineStyleOffsetWillBeRemoved(end, removedRanges))
    ? null
    : alternative;
}

function inlineStyleOffsetWillBeRemoved(
  offset: number,
  ranges: MarkdownInlineStyleRange[],
): boolean {
  return ranges.some((range) => (
    (offset >= range.start && offset < range.contentStart)
    || (offset >= range.contentEnd && offset < range.end)
  ));
}

function wrapMarkdownInlineStyleContent(
  content: string,
  definition: MarkdownInlineStyleDefinition,
  opening = definition.preferred.opening,
  closing = definition.preferred.closing,
): string {
  if (!content) return "";
  const leading = content.match(/^[ \t\r\n]+/)?.[0] ?? "";
  const trailing = content.slice(leading.length).match(/[ \t\r\n]+$/)?.[0] ?? "";
  const core = content.slice(leading.length, content.length - trailing.length);
  if (!core) return content;
  if (definition.kind !== "code") {
    return `${leading}${opening}${core}${closing}${trailing}`;
  }
  const wrapper = getMarkdownInlineStyleWrapper(core, definition, opening, closing);
  return `${leading}${wrapper.opening}${core}${wrapper.closing}${trailing}`;
}

function normalizeMarkdownInlineStyleSegment(
  segment: IndexRange,
  ranges: MarkdownInlineStyleRange[],
  value: string,
): IndexRange {
  let start = segment.start;
  let end = segment.end;
  for (const range of ranges) {
    if (start >= range.start && start < range.contentStart) start = range.contentStart;
    if (start > range.contentEnd && start < range.end) start = range.contentEnd;
    if (end > range.start && end < range.contentStart) end = range.contentStart;
    if (end > range.contentEnd && end <= range.end) end = range.contentEnd;
  }
  while (start < end && isInlineStyleEdgeWhitespace(value[start])) start += 1;
  while (end > start && isInlineStyleEdgeWhitespace(value[end - 1])) end -= 1;
  return { start, end };
}

function isInlineStyleEdgeWhitespace(character: string | undefined): boolean {
  return character === " " || character === "\t" || character === "\r" || character === "\n";
}

function selectionIsInsideInlineStyleRange(
  selectionStart: number,
  selectionEnd: number,
  range: MarkdownInlineStyleRange,
): boolean {
  return selectionStart >= range.start
    && selectionEnd <= range.end
    && selectionStart < range.contentEnd
    && selectionEnd > range.contentStart;
}

function markdownInlineStyleBoundaryIsComplex(
  value: string,
  boundary: number,
  target: MarkdownInlineStyleRange,
  parseSpans: IndexRange[],
): boolean {
  const ranges = collectAllMarkdownInlineStyleRanges(value, parseSpans);
  for (const range of ranges) {
    if (range.start === target.start && range.end === target.end) continue;
    const targetContainsRange = range.start >= target.contentStart && range.end <= target.contentEnd;
    if (targetContainsRange && boundary > range.start && boundary < range.end) return true;
    const rangeContainsTarget = target.start >= range.contentStart && target.end <= range.contentEnd;
    if (!targetContainsRange && !rangeContainsTarget && rangesOverlap(
      range.start,
      range.end,
      target.start,
      target.end,
    )) return true;
  }
  return false;
}

function collectAllMarkdownInlineStyleRanges(value: string, parseSpans: IndexRange[]): MarkdownInlineStyleRange[] {
  const pairs: MarkdownInlineStylePair[] = [
    { opening: "**", closing: "**" },
    { opening: "*", closing: "*" },
    { opening: "~~", closing: "~~" },
    { opening: "==", closing: "==" },
    { opening: "^", closing: "^" },
    { opening: "~", closing: "~" },
    { opening: "<u>", closing: "</u>" },
    { opening: "<strong>", closing: "</strong>" },
    { opening: "<b>", closing: "</b>" },
    { opening: "<em>", closing: "</em>" },
    { opening: "<i>", closing: "</i>" },
    { opening: "<del>", closing: "</del>" },
    { opening: "<s>", closing: "</s>" },
    { opening: "<strike>", closing: "</strike>" },
    { opening: "<mark>", closing: "</mark>" },
    { opening: "<ins>", closing: "</ins>" },
    { opening: "<sub>", closing: "</sub>" },
    { opening: "<sup>", closing: "</sup>" },
    { opening: "`", closing: "`" },
  ];
  const ranges = pairs.flatMap((pair) => {
    const definition = getMarkdownInlineStyleDefinition(pair.opening, pair.closing);
    return definition ? collectMarkdownInlineStyleRanges(value, definition, parseSpans).ranges : [];
  });
  const unique = new Map<string, MarkdownInlineStyleRange>();
  for (const range of ranges) unique.set(`${range.start}:${range.end}:${range.kind}`, range);
  return [...unique.values()].sort((left, right) => left.start - right.start || right.end - left.end);
}

function collectMarkdownInlineStyleRanges(
  value: string,
  definition: MarkdownInlineStyleDefinition,
  parseSpans: IndexRange[],
): MarkdownInlineStyleParseResult {
  if (definition.kind === "code") return collectMarkdownCodeStyleRanges(value, parseSpans);
  const codeRanges = collectMarkdownCodeStyleRanges(value, parseSpans).ranges;
  const ranges: MarkdownInlineStyleRange[] = [];
  const ambiguous: IndexRange[] = [];
  for (const span of parseSpans) {
    for (const pair of definition.aliases) {
      const parsed = definition.kind === "underline"
        ? collectMarkdownHtmlStyleRanges(value, span, pair, codeRanges)
        : collectMarkdownDelimiterStyleRanges(value, span, pair, codeRanges);
      ranges.push(...parsed.ranges);
      ambiguous.push(...parsed.ambiguous);
    }
  }
  return {
    ranges: ranges.sort((left, right) => left.start - right.start || right.end - left.end),
    ambiguous,
  };
}

function collectMarkdownCodeStyleRanges(
  value: string,
  parseSpans: IndexRange[],
): MarkdownInlineStyleParseResult {
  const ranges: MarkdownInlineStyleRange[] = [];
  const ambiguous: IndexRange[] = [];
  for (const span of parseSpans) {
    let cursor = span.start;
    while (cursor < span.end) {
      if (value[cursor] !== "`" || isEscapedAt(value, cursor)) {
        cursor += 1;
        continue;
      }
      const openingStart = cursor;
      const markerLength = countBacktickRunAfter(value, cursor);
      const marker = "`".repeat(markerLength);
      cursor += markerLength;
      let closingStart = -1;
      while (cursor < span.end) {
        const next = value.indexOf("`", cursor);
        if (next < 0 || next >= span.end) break;
        const runLength = countBacktickRunAfter(value, next);
        if (!isEscapedAt(value, next) && runLength === markerLength) {
          closingStart = next;
          break;
        }
        cursor = next + runLength;
      }
      if (closingStart < 0) {
        ambiguous.push({ start: openingStart, end: openingStart + markerLength });
        cursor = openingStart + markerLength;
        continue;
      }
      const rawContentStart = openingStart + markerLength;
      const rawContentEnd = closingStart;
      const rawContent = value.slice(rawContentStart, rawContentEnd);
      const hasSemanticPadding = rawContent.startsWith(" ")
        && rawContent.endsWith(" ")
        && Boolean(rawContent.trim());
      ranges.push({
        start: openingStart,
        end: closingStart + markerLength,
        contentStart: rawContentStart + (hasSemanticPadding ? 1 : 0),
        contentEnd: rawContentEnd - (hasSemanticPadding ? 1 : 0),
        opening: marker,
        closing: marker,
        kind: "code",
      });
      cursor = closingStart + markerLength;
    }
  }
  return { ranges, ambiguous };
}

function collectMarkdownHtmlStyleRanges(
  value: string,
  span: IndexRange,
  pair: MarkdownInlineStylePair,
  protectedRanges: MarkdownInlineStyleRange[],
): MarkdownInlineStyleParseResult {
  const ranges: MarkdownInlineStyleRange[] = [];
  const ambiguous: IndexRange[] = [];
  const stack: number[] = [];
  let cursor = span.start;
  while (cursor < span.end) {
    const opening = value.indexOf(pair.opening, cursor);
    const closing = value.indexOf(pair.closing, cursor);
    const next = opening < 0 ? closing : closing < 0 ? opening : Math.min(opening, closing);
    if (next < 0 || next >= span.end) break;
    const token = next === closing ? pair.closing : pair.opening;
    const tokenEnd = next + token.length;
    if (isEscapedAt(value, next) || rangesIntersectInlineStyle(next, tokenEnd, protectedRanges)) {
      cursor = tokenEnd;
      continue;
    }
    if (token === pair.opening) {
      stack.push(next);
    } else {
      const start = stack.pop();
      if (start === undefined) {
        ambiguous.push({ start: next, end: tokenEnd });
      } else if (stack.length > 0) {
        ambiguous.push({ start, end: tokenEnd });
      } else {
        ranges.push({
          start,
          end: tokenEnd,
          contentStart: start + pair.opening.length,
          contentEnd: next,
          opening: pair.opening,
          closing: pair.closing,
          kind: "underline",
        });
      }
    }
    cursor = tokenEnd;
  }
  for (const start of stack) ambiguous.push({ start, end: start + pair.opening.length });
  return { ranges, ambiguous };
}

function collectMarkdownDelimiterStyleRanges(
  value: string,
  span: IndexRange,
  pair: MarkdownInlineStylePair,
  protectedRanges: MarkdownInlineStyleRange[],
): MarkdownInlineStyleParseResult {
  const ranges: MarkdownInlineStyleRange[] = [];
  const ambiguous: IndexRange[] = [];
  const marker = pair.opening;
  let opener: number | null = null;
  let cursor = span.start;
  while (cursor < span.end) {
    const next = value.indexOf(marker[0], cursor);
    if (next < 0 || next >= span.end) break;
    const runLength = countRepeatedCharacterRun(value, next, marker[0]);
    const tokenEnd = next + runLength;
    if (isEscapedAt(value, next) || rangesIntersectInlineStyle(next, tokenEnd, protectedRanges)) {
      cursor = tokenEnd;
      continue;
    }
    if (runLength !== marker.length) {
      if (markdownDelimiterRunIsAmbiguous(marker, runLength)) ambiguous.push({ start: next, end: tokenEnd });
      cursor = tokenEnd;
      continue;
    }

    const flanking = getMarkdownDelimiterFlanking(value, next, tokenEnd, marker);
    if (!flanking.canOpen && !flanking.canClose) {
      cursor = tokenEnd;
      continue;
    }
    if (opener !== null && flanking.canClose) {
      if (next > opener + marker.length) {
        const content = value.slice(opener + marker.length, next);
        if ((marker === "^" || marker === "~") && hasUnescapedInlineStyleWhitespace(content)) {
          ambiguous.push({ start: opener, end: tokenEnd });
        } else {
          ranges.push({
            start: opener,
            end: tokenEnd,
            contentStart: opener + marker.length,
            contentEnd: next,
            opening: marker,
            closing: marker,
            kind: "delimiter",
          });
        }
      } else {
        ambiguous.push({ start: opener, end: tokenEnd });
      }
      opener = null;
    } else if (flanking.canOpen && opener === null) {
      opener = next;
    } else {
      ambiguous.push({ start: next, end: tokenEnd });
    }
    cursor = tokenEnd;
  }
  if (opener !== null) ambiguous.push({ start: opener, end: opener + marker.length });
  return { ranges, ambiguous };
}

function getMarkdownDelimiterFlanking(
  value: string,
  start: number,
  end: number,
  marker: string,
): { canOpen: boolean; canClose: boolean } {
  const previous = start > 0 ? value[start - 1] : undefined;
  const next = end < value.length ? value[end] : undefined;
  const previousWhitespace = previous === undefined || /\s/u.test(previous);
  const nextWhitespace = next === undefined || /\s/u.test(next);
  if (marker[0] !== "*" && marker[0] !== "_") {
    return { canOpen: !nextWhitespace, canClose: !previousWhitespace };
  }

  const previousPunctuation = previous !== undefined && /[\p{P}\p{S}]/u.test(previous);
  const nextPunctuation = next !== undefined && /[\p{P}\p{S}]/u.test(next);
  const leftFlanking = !nextWhitespace && (!nextPunctuation || previousWhitespace || previousPunctuation);
  const rightFlanking = !previousWhitespace && (!previousPunctuation || nextWhitespace || nextPunctuation);
  if (marker[0] === "_") {
    return {
      canOpen: leftFlanking && (!rightFlanking || previousPunctuation),
      canClose: rightFlanking && (!leftFlanking || nextPunctuation),
    };
  }
  return { canOpen: leftFlanking, canClose: rightFlanking };
}

function markdownDelimiterRunIsAmbiguous(marker: string, runLength: number): boolean {
  if ((marker === "*" || marker === "_") && runLength === 2) return false;
  if ((marker === "**" || marker === "__") && runLength === 1) return false;
  if (marker === "~" && runLength === 2) return false;
  if (marker === "~~" && runLength === 1) return false;
  return runLength >= marker.length;
}

function countRepeatedCharacterRun(value: string, start: number, character: string): number {
  let count = 0;
  while (start + count < value.length && value[start + count] === character) count += 1;
  return count;
}

function markdownInlineStyleContentIsUnsupported(
  content: string,
  definition: MarkdownInlineStyleDefinition,
): boolean {
  const marker = definition.preferred.opening;
  return (marker === "^" || marker === "~") && hasUnescapedInlineStyleWhitespace(content);
}

function hasUnescapedInlineStyleWhitespace(value: string): boolean {
  return /(^|[^\\])(?:\\\\)*\s/u.test(value);
}

function rangesIntersectInlineStyle(
  start: number,
  end: number,
  ranges: MarkdownInlineStyleRange[],
): boolean {
  return ranges.some((range) => rangesOverlap(start, end, range.start, range.end));
}

function markdownInlineStyleRangesOverlap(ranges: MarkdownInlineStyleRange[]): boolean {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  return sorted.some((range, index) => index > 0 && range.start < sorted[index - 1].end);
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function inlineStyleOffsetIsInsideMarker(offset: number, ranges: MarkdownInlineStyleRange[]): boolean {
  return ranges.some((range) => (
    (offset > range.start && offset < range.contentStart)
    || (offset > range.contentEnd && offset < range.end)
  ));
}

function collectMarkdownInlineStyleParseSpans(value: string): IndexRange[] {
  const spans: IndexRange[] = [];
  for (const block of splitMarkdownBlocks(value)) {
    const ranges = getMarkdownBlockInlineContentRanges(value, block.start, block.end, block.type);
    if (ranges) spans.push(...ranges);
  }
  return spans.filter((range) => range.start < range.end);
}

function getMarkdownInlineStyleSelectionSegments(state: TextState): IndexRange[] | null {
  const segments: IndexRange[] = [];
  for (const block of splitMarkdownBlocks(state.value)) {
    if (block.end <= state.selectionStart || block.start >= state.selectionEnd) continue;
    const ranges = getMarkdownBlockInlineContentRanges(state.value, block.start, block.end, block.type);
    if (!ranges) return null;
    for (const range of ranges) {
      const start = Math.max(range.start, state.selectionStart);
      const end = Math.min(range.end, state.selectionEnd);
      if (start < end) segments.push({ start, end });
    }
  }
  return segments.sort((left, right) => left.start - right.start);
}

function getMarkdownBlockInlineContentRanges(
  value: string,
  blockStart: number,
  blockEnd: number,
  blockType: string,
): IndexRange[] | null {
  if (["code", "math", "frontmatter", "html", "rule", "reference", "abbreviation"].includes(blockType)) {
    return null;
  }
  if (blockType === "paragraph") {
    const end = trimMarkdownInlineBlockEnd(value, blockStart, blockEnd);
    return end > blockStart ? [{ start: blockStart, end }] : [];
  }

  const lines = collectMarkdownInlineBlockLines(value, blockStart, blockEnd);
  if (blockType === "heading") {
    const first = lines[0];
    if (!first) return [];
    const prefix = first.text.match(/^[ \t]{0,3}#{1,6}(?:[ \t]+|$)/)?.[0] ?? "";
    if (prefix) {
      const closing = first.text.slice(prefix.length).match(/[ \t]+#+[ \t]*$/)?.[0] ?? "";
      return [{ start: first.start + prefix.length, end: first.end - closing.length }];
    }
    const setextUnderline = lines.at(-1)?.text.match(/^[ \t]{0,3}(?:={2,}|-{2,})[ \t]*$/);
    if (!setextUnderline) return [{ start: first.start, end: first.end }];
    return lines.slice(0, -1).flatMap((line) => (
      line.text.trim() ? [{ start: line.start, end: line.end }] : []
    ));
  }
  if (blockType === "table") {
    return lines.flatMap((line) => getMarkdownTableInlineContentRanges(value, line.start, line.end));
  }

  return lines.flatMap((line) => {
    if (!line.text.trim()) return [];
    let contentStart = 0;
    const quote = line.text.match(/^(?:[ \t]{0,3}>[ \t]?)+/)?.[0] ?? "";
    contentStart += quote.length;
    const remainder = line.text.slice(contentStart);
    const blockMarker = remainder.match(/^[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|:[ \t]+|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*\]:[ \t]*)/)?.[0]
      ?? remainder.match(/^[ \t]+/)?.[0]
      ?? "";
    contentStart += blockMarker.length;
    const content = line.text.slice(contentStart);
    const headingPrefix = content.match(/^#{1,6}(?:[ \t]+|$)/)?.[0] ?? "";
    contentStart += headingPrefix.length;
    const closing = line.text.slice(contentStart).match(/[ \t]+#+[ \t]*$/)?.[0] ?? "";
    const start = line.start + contentStart;
    const end = line.end - closing.length;
    return start < end ? [{ start, end }] : [];
  });
}

function collectMarkdownInlineBlockLines(
  value: string,
  start: number,
  end: number,
): Array<{ start: number; end: number; text: string }> {
  const lines: Array<{ start: number; end: number; text: string }> = [];
  let cursor = start;
  while (cursor < end) {
    const lineBreak = value.indexOf("\n", cursor);
    const rawEnd = lineBreak < 0 || lineBreak >= end ? end : lineBreak;
    const contentEnd = rawEnd > cursor && value[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
    lines.push({ start: cursor, end: contentEnd, text: value.slice(cursor, contentEnd) });
    if (lineBreak < 0 || lineBreak >= end) break;
    cursor = lineBreak + 1;
  }
  return lines;
}

function getMarkdownTableInlineContentRanges(value: string, start: number, end: number): IndexRange[] {
  const line = value.slice(start, end);
  const cells: IndexRange[] = [];
  let cellStart = 0;
  for (let index = 0; index <= line.length; index += 1) {
    if (index < line.length && (line[index] !== "|" || isEscapedAt(line, index))) continue;
    let contentStart = cellStart;
    let contentEnd = index;
    while (contentStart < contentEnd && /[ \t]/.test(line[contentStart])) contentStart += 1;
    while (contentEnd > contentStart && /[ \t]/.test(line[contentEnd - 1])) contentEnd -= 1;
    const content = line.slice(contentStart, contentEnd);
    if (content && !/^:?-+:?$/.test(content)) {
      cells.push({ start: start + contentStart, end: start + contentEnd });
    }
    cellStart = index + 1;
  }
  return cells;
}

function trimMarkdownInlineBlockEnd(value: string, start: number, end: number): number {
  let nextEnd = end;
  while (nextEnd > start && (value[nextEnd - 1] === "\n" || value[nextEnd - 1] === "\r")) nextEnd -= 1;
  return nextEnd;
}

function markdownInlineStyleCursorIsSafe(value: string, cursor: number, parseSpans: IndexRange[]): boolean {
  if (!value) return true;
  if (parseSpans.some((span) => cursor >= span.start && cursor <= span.end)) return true;
  const block = splitMarkdownBlocks(value).find((item) => cursor >= item.start && cursor <= item.end);
  return !block || !["code", "math", "frontmatter", "html", "rule", "reference", "abbreviation"].includes(block.type);
}

function compactMarkdownInlineStyleEdits(edits: MarkdownInlineStyleEdit[]): MarkdownInlineStyleEdit[] | null {
  const unique = new Map<string, MarkdownInlineStyleEdit>();
  for (const edit of edits) unique.set(`${edit.start}:${edit.end}:${edit.text}`, edit);
  const compacted = [...unique.values()];
  const removals = compacted
    .filter((edit) => edit.start < edit.end)
    .sort((left, right) => left.start - right.start);
  if (removals.some((edit, index) => index > 0 && edit.start < removals[index - 1].end)) return null;
  return compacted;
}

function applyMarkdownInlineStyleEdits(value: string, edits: MarkdownInlineStyleEdit[]): string {
  const sorted = [...edits].sort((left, right) => (
    right.start - left.start
    || Number(left.start === left.end) - Number(right.start === right.end)
    || right.end - left.end
  ));
  let result = value;
  for (const edit of sorted) {
    result = `${result.slice(0, edit.start)}${edit.text}${result.slice(edit.end)}`;
  }
  return result;
}

function mapMarkdownInlineStyleOffset(
  offset: number,
  affinity: "left" | "right",
  edits: MarkdownInlineStyleEdit[],
): number {
  let delta = 0;
  const sorted = [...edits].sort((left, right) => left.start - right.start || left.end - right.end);
  for (const edit of sorted) {
    if (edit.start === edit.end) {
      if (edit.start < offset || (edit.start === offset && affinity === "right")) delta += edit.text.length;
      continue;
    }
    if (edit.end <= offset) {
      delta += edit.text.length - (edit.end - edit.start);
    } else if (edit.start < offset) {
      return edit.start + delta + (affinity === "right" ? edit.text.length : 0);
    }
  }
  return offset + delta;
}

export function wrapHtmlCommentSelection(
  state: TextState,
  placeholder = "注释文本",
): TextEditResult {
  return wrapMarkdownSelection(state, "<!-- ", " -->", placeholder);
}

function wrapMarkdownCodeSpanSelection(state: TextState, placeholder = ""): TextEditResult {
  const selected = state.value.slice(state.selectionStart, state.selectionEnd) || placeholder;
  if (selected && selected !== placeholder) {
    const wrapper = readCodeSpanWrapperAroundSelection(state);
    if (wrapper) {
      const value = `${state.value.slice(0, wrapper.start)}${selected}${state.value.slice(wrapper.end)}`;
      return {
        value,
        selectionStart: wrapper.start,
        selectionEnd: wrapper.start + selected.length,
      };
    }

    const selectedCodeSpan = readSelectedCodeSpan(selected);
    if (selectedCodeSpan) {
      const value = `${state.value.slice(0, state.selectionStart)}${selectedCodeSpan}${state.value.slice(state.selectionEnd)}`;
      return {
        value,
        selectionStart: state.selectionStart,
        selectionEnd: state.selectionStart + selectedCodeSpan.length,
      };
    }
  }

  const marker = getCodeSpanMarker(selected);
  const needsPadding = marker.length > 1 && (/^`|`$/.test(selected));
  const leadingPadding = needsPadding ? " " : "";
  const trailingPadding = needsPadding ? " " : "";
  const value = [
    state.value.slice(0, state.selectionStart),
    marker,
    leadingPadding,
    selected,
    trailingPadding,
    marker,
    state.value.slice(state.selectionEnd),
  ].join("");
  const selectionStart = state.selectionStart + marker.length + leadingPadding.length;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

function readSelectedCodeSpan(value: string): string | null {
  const opening = value.match(/^(`+)/)?.[1];
  if (!opening || !value.endsWith(opening) || value.length < opening.length * 2) return null;

  const inner = value.slice(opening.length, value.length - opening.length);
  if (inner.startsWith(" ") && inner.endsWith(" ") && inner.trim()) {
    return inner.slice(1, -1);
  }
  return inner;
}

function readCodeSpanWrapperAroundSelection(state: TextState): { start: number; end: number } | null {
  const leftPadding = state.value[state.selectionStart - 1] === " " ? 1 : 0;
  const rightPadding = state.value[state.selectionEnd] === " " ? 1 : 0;
  const leftRunEnd = state.selectionStart - leftPadding;
  const leftRun = countBacktickRunBefore(state.value, leftRunEnd);
  if (leftRun === 0) return null;

  const rightRunStart = state.selectionEnd + rightPadding;
  const rightRun = countBacktickRunAfter(state.value, rightRunStart);
  if (rightRun !== leftRun) return null;

  return {
    start: leftRunEnd - leftRun,
    end: rightRunStart + rightRun,
  };
}

function countBacktickRunBefore(value: string, end: number): number {
  let count = 0;
  for (let index = end - 1; index >= 0 && value[index] === "`"; index -= 1) {
    count += 1;
  }
  return count;
}

function countBacktickRunAfter(value: string, start: number): number {
  let count = 0;
  for (let index = start; index < value.length && value[index] === "`"; index += 1) {
    count += 1;
  }
  return count;
}

export function insertMarkdownAtSelection(state: TextState, text: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const normalizedText = normalizeGeneratedLineBreaks(text, getPreferredLineBreak(normalized.value));
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${normalizedText}${normalized.value.slice(normalized.selectionEnd)}`;
  const cursor = normalized.selectionStart + normalizedText.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function pastePlainMarkdownText(state: TextState, text: string): TextEditResult {
  return insertMarkdownAtSelection(state, text);
}

function insertMarkdownBlockAtSelection(state: TextState, block: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const normalizedBlock = normalizeGeneratedLineBreaks(block, lineBreak);
  const leadingBreak = before && !before.endsWith("\n") ? lineBreak : "";
  const trailingBreak = after && !startsWithLineBreak(after) ? lineBreak : "";
  const value = `${before}${leadingBreak}${normalizedBlock}${trailingBreak}${after}`;
  const cursor = before.length + leadingBreak.length + normalizedBlock.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function insertMarkdownSoftBreak(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  if (isInsideMarkdownRawBlock(normalized.value, lineStart)) {
    return insertMarkdownAtSelection(normalized, lineBreak);
  }

  const continuation = getSoftBreakContinuation(
    normalized.value,
    lineStart,
    normalized.value.slice(lineStart, normalized.selectionStart),
  );
  return insertMarkdownAtSelection(normalized, `  ${lineBreak}${continuation}`);
}

export function pasteMarkdownContent(state: TextState, payload: PasteMarkdownPayload): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (
    payload.text
    && normalized.selectionStart !== normalized.selectionEnd
    && isLikelyUrl(payload.text.trim())
  ) {
    const linkedSelection = pasteMarkdownText(normalized, payload.text);
    if (linkedSelection) return linkedSelection;
  }

  const richMarkdown = payload.html ? buildMarkdownFromHtml(payload.html) : null;
  if (richMarkdown) {
    return payload.html && isInlineRichHtmlForMarkdown(payload.html)
      ? insertMarkdownAtSelection(normalized, richMarkdown)
      : insertMarkdownBlockAtSelection(normalized, richMarkdown);
  }

  const table = payload.html ? buildMarkdownTableFromHtml(payload.html) : null;
  if (table) {
    return insertMarkdownBlockAtSelection(normalized, table);
  }

  return payload.text ? pasteMarkdownText(normalized, payload.text) : null;
}

export function pasteMarkdownText(state: TextState, text: string): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = buildMarkdownTableFromTabularText(text);
  if (table) {
    return insertMarkdownBlockAtSelection(normalized, table);
  }

  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd);
  const pasted = text.trim();
  if (!selected || !isLikelyUrl(pasted)) return null;

  if (isLikelyUrl(selected.trim())) {
    const value = `${normalized.value.slice(0, normalized.selectionStart)}${pasted}${normalized.value.slice(normalized.selectionEnd)}`;
    return {
      value,
      selectionStart: normalized.selectionStart,
      selectionEnd: normalized.selectionStart + pasted.length,
    };
  }

  const automaticLink = selected.match(/^<([^>\s]+)>$/);
  if (automaticLink && isLikelyUrl(automaticLink[1])) {
    const link = `<${pasted}>`;
    const value = `${normalized.value.slice(0, normalized.selectionStart)}${link}${normalized.value.slice(normalized.selectionEnd)}`;
    return {
      value,
      selectionStart: normalized.selectionStart,
      selectionEnd: normalized.selectionStart + link.length,
    };
  }

  const existingLink = findSelectedMarkdownLink(normalized, selected);
  if (existingLink) {
    const link = `[${existingLink.label}](${formatMarkdownLinkDestination(pasted)})`;
    const value = `${normalized.value.slice(0, existingLink.start)}${link}${normalized.value.slice(existingLink.end)}`;
    return {
      value,
      selectionStart: existingLink.start,
      selectionEnd: existingLink.start + link.length,
    };
  }

  const link = `[${selected}](${formatMarkdownLinkDestination(pasted)})`;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${link}${normalized.value.slice(normalized.selectionEnd)}`;
  return {
    value,
    selectionStart: normalized.selectionStart,
    selectionEnd: normalized.selectionStart + link.length,
  };
}

export function insertMarkdownLinkSelection(
  state: TextState,
  placeholder = "链接文本",
  destination = "https://example.com",
): TextEditResult {
  const normalized = normalizeSelection(state);
  const existing = findInlineLinkAroundSelection(normalized);
  if (existing) {
    return {
      value: normalized.value,
      selectionStart: existing.destinationStart,
      selectionEnd: existing.destinationEnd,
    };
  }

  const image = findMarkdownImageAroundSelection(normalized);
  if (image) {
    const imageMarkdown = normalized.value.slice(image.start, image.end);
    const link = `[${imageMarkdown}](${destination})`;
    const value = `${normalized.value.slice(0, image.start)}${link}${normalized.value.slice(image.end)}`;
    const destinationStart = image.start + `[${imageMarkdown}](`.length;
    return {
      value,
      selectionStart: destinationStart,
      selectionEnd: destinationStart + destination.length,
    };
  }

  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd) || placeholder;
  const label = formatMarkdownLinkLabel(selected);
  const link = `[${label}](${destination})`;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${link}${normalized.value.slice(normalized.selectionEnd)}`;
  const destinationStart = normalized.selectionStart + `[${label}](`.length;
  return {
    value,
    selectionStart: destinationStart,
    selectionEnd: destinationStart + destination.length,
  };
}

export function insertMarkdownImageSelection(
  state: TextState,
  placeholder = "图片描述",
  destination = "image-path",
): TextEditResult {
  const normalized = normalizeSelection(state);
  const existing = findInlineImageAroundSelection(normalized);
  if (existing) {
    return {
      value: normalized.value,
      selectionStart: existing.destinationStart,
      selectionEnd: existing.destinationEnd,
    };
  }

  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd) || placeholder;
  const alt = formatMarkdownLinkLabel(selected);
  const image = `![${alt}](${destination})`;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${image}${normalized.value.slice(normalized.selectionEnd)}`;
  const destinationStart = normalized.selectionStart + `![${alt}](`.length;
  return {
    value,
    selectionStart: destinationStart,
    selectionEnd: destinationStart + destination.length,
  };
}

function findSelectedMarkdownLink(state: TextState, selected: string): { start: number; end: number; label: string } | null {
  let cursor = 0;
  while (cursor < state.value.length) {
    const open = state.value.indexOf("[", cursor);
    if (open < 0) break;
    const link = readMarkdownInlineLink(state.value, open) ?? readMarkdownReferenceLink(state.value, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    if (
      (state.selectionStart === link.start && state.selectionEnd === link.end)
      || (link.imageStart !== null && state.selectionStart === link.imageStart && state.selectionEnd === link.end)
      || (state.selectionStart === link.labelStart && state.selectionEnd === link.labelEnd)
    ) {
      return { start: link.start, end: link.end, label: link.label };
    }
    cursor = link.end;
  }

  return null;
}

function findInlineImageAroundSelection(state: TextState): { destinationStart: number; destinationEnd: number } | null {
  let cursor = 0;
  while (cursor < state.value.length) {
    const open = state.value.indexOf("[", cursor);
    if (open < 0) break;
    const link = readMarkdownInlineLink(state.value, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    if (
      link.imageStart !== null
      && state.selectionStart >= link.imageStart
      && state.selectionEnd <= link.end
    ) {
      return {
        destinationStart: link.labelEnd + 2,
        destinationEnd: link.end - 1,
      };
    }
    cursor = link.end;
  }

  return null;
}

function findInlineLinkAroundSelection(state: TextState): { destinationStart: number; destinationEnd: number } | null {
  let cursor = 0;
  while (cursor < state.value.length) {
    const open = state.value.indexOf("[", cursor);
    if (open < 0) break;
    const link = readMarkdownInlineLink(state.value, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    if (
      link.imageStart === null
      && state.selectionStart >= link.start
      && state.selectionEnd <= link.end
    ) {
      return {
        destinationStart: link.labelEnd + 2,
        destinationEnd: link.end - 1,
      };
    }
    cursor = link.end;
  }

  return null;
}

function findMarkdownImageAroundSelection(state: TextState): { start: number; end: number } | null {
  let cursor = 0;
  while (cursor < state.value.length) {
    const open = state.value.indexOf("[", cursor);
    if (open < 0) break;
    const link = readMarkdownInlineLink(state.value, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    if (
      link.imageStart !== null
      && state.selectionStart >= link.imageStart
      && state.selectionEnd <= link.end
    ) {
      return { start: link.imageStart, end: link.end };
    }
    cursor = link.end;
  }

  return null;
}

export function formatMarkdownCodeBlock(
  state: TextState,
  language = "",
  placeholder = "",
): TextEditResult {
  const normalized = normalizeSelection(state);
  const unwrapped = unwrapRawFenceBlock(normalized, "code");
  if (unwrapped) return unwrapped;

  const lineBreak = getPreferredLineBreak(normalized.value);
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd) || placeholder;
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const leadingBreak = before && !before.endsWith("\n") ? lineBreak : "";
  const closingBreak = !after || !startsWithLineBreak(after) ? lineBreak : "";
  const fence = getCodeFenceMarker(selected);
  const prefix = `${leadingBreak}${fence}${language}${lineBreak}`;
  const suffix = `${lineBreak}${fence}${closingBreak}`;
  const value = `${before}${prefix}${selected}${suffix}${after}`;
  const selectionStart = before.length + prefix.length;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

export function applyDefaultCodeLanguageOnFenceKey(
  state: TextState,
  key: string,
  language: string,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (
    normalized.selectionStart !== normalized.selectionEnd
    || (key !== "`" && key !== "~")
  ) {
    return null;
  }

  const info = normalizeCodeFenceInfoString(language, "```");
  if (!info) return null;

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  if (isInsideMarkdownRawBlock(normalized.value, lineStart)) return null;
  const beforeCursor = normalized.value.slice(lineStart, normalized.selectionStart);
  if (!beforeCursor.endsWith(key.repeat(2))) return null;
  const lines = normalized.value.split("\n");
  const lineIndex = findLineIndex(lines, lineStart);
  lines[lineIndex] = beforeCursor + key;
  const opening = getRawFenceOpeningAtLine(lines, lineIndex);
  if (
    !opening
    || opening.fence.kind !== "code"
    || opening.fence.marker[0] !== key
    || opening.fence.marker.length !== 3
  ) return null;

  const physicalLineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const lineEnd = physicalLineEnd < 0 ? normalized.value.length : physicalLineEnd;
  const contentEnd = normalized.value[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
  const afterCursor = normalized.value.slice(normalized.selectionStart, contentEnd);
  if (afterCursor) return null;

  const insertion = `${key}${info}`;
  const value = [
    normalized.value.slice(0, normalized.selectionStart),
    insertion,
    normalized.value.slice(normalized.selectionStart),
  ].join("");
  const selectionStart = normalized.selectionStart + 1;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + info.length,
  };
}

export function insertMarkdownDiagramTemplate(
  state: TextState,
  language: "mermaid" | "flowchart" | "sequence",
): TextEditResult {
  const lineBreak = getPreferredLineBreak(state.value);
  const source = normalizeGeneratedLineBreaks(
    language === "mermaid"
      ? mermaidTemplateSource
      : language === "flowchart"
        ? flowchartTemplateSource
        : sequenceTemplateSource,
    lineBreak,
  );
  return formatMarkdownCodeBlock(state, language, source);
}

export function formatMarkdownMathBlock(
  state: TextState,
  placeholder = "a^2 + b^2 = c^2",
): TextEditResult {
  const normalized = normalizeSelection(state);
  const unwrapped = unwrapRawFenceBlock(normalized, "math");
  if (unwrapped) return unwrapped;

  const lineBreak = getPreferredLineBreak(normalized.value);
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd) || placeholder;
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const leadingBreak = before && !before.endsWith("\n") ? lineBreak : "";
  const closingBreak = !after || !startsWithLineBreak(after) ? lineBreak : "";
  const prefix = `${leadingBreak}$$${lineBreak}`;
  const suffix = `${lineBreak}$$${closingBreak}`;
  const value = `${before}${prefix}${selected}${suffix}${after}`;
  const selectionStart = before.length + prefix.length;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + selected.length,
  };
}

function unwrapRawFenceBlock(state: TextState, kind: "code" | "math"): TextEditResult | null {
  const range = findClosedRawFenceBlock(state.value, state.selectionStart, state.selectionEnd, kind);
  if (!range) return null;

  let value = "";
  let cursor = 0;
  for (const edit of range.unwrapEdits) {
    value += state.value.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  value += state.value.slice(cursor);
  return {
    value,
    selectionStart: mapOffsetAfterRawFenceUnwrap(state.selectionStart, range.unwrapEdits),
    selectionEnd: mapOffsetAfterRawFenceUnwrap(state.selectionEnd, range.unwrapEdits),
  };
}

function mapOffsetAfterRawFenceUnwrap(
  offset: number,
  edits: RawFenceUnwrapEdit[],
): number {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.start) return offset + delta;
    if (offset <= edit.end) return edit.start + delta + edit.text.length;
    delta += edit.text.length - (edit.end - edit.start);
  }
  return offset + delta;
}

export function selectCurrentLine(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  const range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);
  const selectionStart = getChunkStartOffset(chunks, range.start);
  const selectionEnd = getChunkContentEndOffset(chunks, range.end);
  return { value: normalized.value, selectionStart, selectionEnd };
}

export function selectCurrentParagraph(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  let range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);

  while (range.start > 0 && !isBlankLineChunk(chunks[range.start - 1])) {
    range = { ...range, start: range.start - 1 };
  }
  while (range.end + 1 < chunks.length && !isBlankLineChunk(chunks[range.end + 1])) {
    range = { ...range, end: range.end + 1 };
  }

  const selectionStart = getChunkStartOffset(chunks, range.start);
  const selectionEnd = getChunkContentEndOffset(chunks, range.end);
  return { value: normalized.value, selectionStart, selectionEnd };
}

export function selectCurrentWord(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getWordRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return {
    value: normalized.value,
    selectionStart: range.start,
    selectionEnd: range.end,
  };
}

export function selectCurrentSentence(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getSentenceRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return {
    value: normalized.value,
    selectionStart: range.start,
    selectionEnd: range.end,
  };
}

export function deleteCurrentWord(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getWordRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return deleteTextRange(normalized, range);
}

export function deleteCurrentSentence(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getSentenceRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return deleteTextRange(normalized, range);
}

export function deleteCurrentParagraph(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = selectCurrentParagraph(normalized);
  return deleteTextRange(normalized, {
    start: range.selectionStart,
    end: range.selectionEnd,
  });
}

export function deleteCurrentStyleScope(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = selectCurrentStyleScope(normalized);
  return deleteTextRange(normalized, {
    start: range.selectionStart,
    end: range.selectionEnd,
  });
}

function deleteTextRange(state: TextState, range: IndexRange): TextEditResult {
  const value = `${state.value.slice(0, range.start)}${state.value.slice(range.end)}`;
  return {
    value,
    selectionStart: range.start,
    selectionEnd: range.start,
  };
}

export function selectCurrentStyleScope(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const tableCell = getCurrentTableCellRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (tableCell) {
    return { value: normalized.value, selectionStart: tableCell.start, selectionEnd: tableCell.end };
  }

  const inlineStyle = getCurrentInlineStyleRange(normalized);
  if (inlineStyle) {
    return { value: normalized.value, selectionStart: inlineStyle.start, selectionEnd: inlineStyle.end };
  }

  return selectCurrentWord(normalized);
}

function getCurrentInlineStyleRange(state: TextState): IndexRange | null {
  const codeSpan = readCodeSpanWrapperAroundSelection(state);
  if (codeSpan) {
    return {
      start: state.selectionStart,
      end: state.selectionEnd,
    };
  }

  const link = findInlineLinkAroundSelection(state);
  if (link && state.selectionStart >= link.destinationStart && state.selectionEnd <= link.destinationEnd) {
    return {
      start: link.destinationStart,
      end: link.destinationEnd,
    };
  }

  const image = findInlineImageAroundSelection(state);
  if (image && state.selectionStart >= image.destinationStart && state.selectionEnd <= image.destinationEnd) {
    return {
      start: image.destinationStart,
      end: image.destinationEnd,
    };
  }

  return findDelimitedInlineStyleRange(state.value, state.selectionStart, state.selectionEnd);
}

function findDelimitedInlineStyleRange(value: string, selectionStart: number, selectionEnd: number): IndexRange | null {
  const delimiters = ["**", "__", "~~", "==", "<u>", "^", "~", "*", "_"];
  for (const delimiter of delimiters) {
    const range = findDelimitedRange(value, selectionStart, selectionEnd, delimiter, getClosingInlineDelimiter(delimiter));
    if (range) return range;
  }
  return null;
}

function getClosingInlineDelimiter(opening: string): string {
  return opening === "<u>" ? "</u>" : opening;
}

function findDelimitedRange(value: string, selectionStart: number, selectionEnd: number, opening: string, closing: string): IndexRange | null {
  const cursor = Math.max(0, Math.min(selectionStart, selectionEnd));
  for (let start = value.lastIndexOf(opening, cursor); start >= 0; start = value.lastIndexOf(opening, start - 1)) {
    if (start > 0 && value[start - 1] === "\\") continue;
    const contentStart = start + opening.length;
    const end = value.indexOf(closing, Math.max(contentStart, Math.max(selectionStart, selectionEnd)));
    if (end < 0) continue;
    if (end < selectionEnd) continue;
    if (end === contentStart) continue;
    if (isInlineDelimiterBoundarySafe(value, start, end, opening, closing)) {
      return { start: contentStart, end };
    }
  }
  return null;
}

function isInlineDelimiterBoundarySafe(value: string, start: number, end: number, opening: string, closing: string): boolean {
  if ((opening === "*" || opening === "_") && value.slice(start, start + 2) === opening.repeat(2)) return false;
  if ((closing === "*" || closing === "_") && value.slice(end, end + 2) === closing.repeat(2)) return false;
  return true;
}

function getWordRange(value: string, selectionStart: number, selectionEnd: number): IndexRange {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(0, Math.max(selectionStart, selectionEnd));
  if (start !== end) {
    return { start, end };
  }

  if (!value) {
    return { start: 0, end: 0 };
  }

  const cursor = Math.max(0, Math.min(start, value.length));
  const right = value.codePointAt(cursor);
  const leftStart = cursor > 0 ? previousCodePointStart(value, cursor) : 0;
  const left = cursor > 0 ? value.codePointAt(leftStart) : undefined;
  const target = right !== undefined && isMarkdownWordCodePoint(right)
    ? right
    : left !== undefined && isMarkdownWordCodePoint(left)
      ? left
      : undefined;

  if (target === undefined) {
    return { start: cursor, end: cursor };
  }

  let rangeStart = right !== undefined && isMarkdownWordCodePoint(right) ? cursor : leftStart;
  let rangeEnd = rangeStart + codePointLength(value.codePointAt(rangeStart) ?? target);

  while (rangeStart > 0) {
    const previousStart = previousCodePointStart(value, rangeStart);
    const codePoint = value.codePointAt(previousStart);
    if (codePoint === undefined || !isMarkdownWordCodePoint(codePoint)) break;
    rangeStart = previousStart;
  }

  while (rangeEnd < value.length) {
    const codePoint = value.codePointAt(rangeEnd);
    if (codePoint === undefined || !isMarkdownWordCodePoint(codePoint)) break;
    rangeEnd += codePointLength(codePoint);
  }

  return { start: rangeStart, end: rangeEnd };
}

function getSentenceRange(value: string, selectionStart: number, selectionEnd: number): IndexRange {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(0, Math.max(selectionStart, selectionEnd));
  if (start !== end) {
    return { start, end };
  }

  if (!value) {
    return { start: 0, end: 0 };
  }

  const cursor = Math.max(0, Math.min(start, value.length));
  const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const rawLineEnd = value.indexOf("\n", cursor);
  const lineEnd = rawLineEnd >= 0 ? rawLineEnd : value.length;
  const bodyEnd = value[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;

  let rangeStart = lineStart;
  for (let index = Math.min(cursor - 1, bodyEnd - 1); index >= lineStart; index -= 1) {
    if (!isSentenceTerminator(value[index])) continue;
    rangeStart = index + 1;
    while (rangeStart < bodyEnd && /\s/.test(value[rangeStart])) rangeStart += 1;
    break;
  }

  let rangeEnd = bodyEnd;
  for (let index = Math.max(cursor, lineStart); index < bodyEnd; index += 1) {
    if (!isSentenceTerminator(value[index])) continue;
    rangeEnd = index + 1;
    while (rangeEnd < bodyEnd && isClosingSentencePunctuation(value[rangeEnd])) rangeEnd += 1;
    break;
  }

  while (rangeStart < rangeEnd && /\s/.test(value[rangeStart])) rangeStart += 1;
  return { start: rangeStart, end: rangeEnd };
}

function isSentenceTerminator(value: string): boolean {
  return /[.!?。！？]/.test(value);
}

function isClosingSentencePunctuation(value: string): boolean {
  return /["')\]}”’」』）】》]/.test(value);
}

function previousCodePointStart(value: string, index: number): number {
  const previous = Math.max(0, index - 1);
  const code = value.charCodeAt(previous);
  if (previous > 0 && code >= 0xdc00 && code <= 0xdfff) {
    return previous - 1;
  }
  return previous;
}

function codePointLength(codePoint: number): number {
  return codePoint > 0xffff ? 2 : 1;
}

function isMarkdownWordCodePoint(codePoint: number): boolean {
  return codePoint === 95 || /[\p{L}\p{N}]/u.test(String.fromCodePoint(codePoint));
}

export function duplicateMarkdownLines(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  const range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);
  const selectionStart = getChunkStartOffset(chunks, range.start);
  const selectionEnd = getChunkContentEndOffset(chunks, range.end);
  const spanEnd = getChunkEndOffset(chunks, range.end);
  const selected = chunks.slice(range.start, range.end + 1).join("");
  const needsLeadingBreak = spanEnd === normalized.value.length && !selected.endsWith("\n");
  const leadingBreak = needsLeadingBreak ? getPreferredLineBreak(normalized.value) : "";
  const insertion = `${leadingBreak}${selected}`;
  const value = `${normalized.value.slice(0, spanEnd)}${insertion}${normalized.value.slice(spanEnd)}`;
  const duplicatedStart = spanEnd + leadingBreak.length;
  const baseStartNumber = getOrderedListStartNumberAtLine(normalized.value, range.start);
  const renumberedValue = renumberOrderedListBlockAtLine(
    value,
    findLineIndex(value.split("\n"), duplicatedStart),
    baseStartNumber ?? undefined,
  );
  return {
    value: renumberedValue,
    selectionStart: duplicatedStart + (normalized.selectionStart - selectionStart),
    selectionEnd: duplicatedStart + (normalized.selectionEnd - selectionStart),
  };
}

export function deleteMarkdownLines(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  const range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);
  const deleteStart = getChunkStartOffset(chunks, range.start);
  const deleteEnd = getChunkEndOffset(chunks, range.end);
  const value = `${normalized.value.slice(0, deleteStart)}${normalized.value.slice(deleteEnd)}`;
  const cursor = Math.min(deleteStart, value.length);
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function moveMarkdownLines(state: TextState, direction: "up" | "down"): TextEditResult {
  return moveTextLines(state, direction, true);
}

function moveTextLines(
  state: TextState,
  direction: "up" | "down",
  renumberOrderedLists: boolean,
): TextEditResult {
  const normalized = normalizeSelection(state);
  const chunks = collectLineChunks(normalized.value);
  const range = getSelectedLineIndexes(chunks, normalized.selectionStart, normalized.selectionEnd);
  const baseStartNumber = renumberOrderedLists
    ? getOrderedListStartNumberAtLine(normalized.value, range.start)
    : null;

  if (direction === "up") {
    if (range.start === 0) return normalized;
    const previousLength = chunks[range.start - 1].length;
    const moved = chunks.splice(range.start, range.end - range.start + 1);
    if (!hasTrailingLineBreak(moved[moved.length - 1]) && hasTrailingLineBreak(chunks[range.start - 1])) {
      const lineBreak = getTrailingLineBreak(chunks[range.start - 1]);
      chunks[range.start - 1] = chunks[range.start - 1].slice(0, -lineBreak.length);
      moved[moved.length - 1] = `${moved[moved.length - 1]}${lineBreak}`;
    }
    chunks.splice(range.start - 1, 0, ...moved);
    const result = {
      value: chunks.join(""),
      selectionStart: Math.max(0, normalized.selectionStart - previousLength),
      selectionEnd: Math.max(0, normalized.selectionEnd - previousLength),
    };
    return renumberOrderedLists
      ? renumberMovedMarkdownSelection(result, range.start - 1, baseStartNumber ?? undefined)
      : result;
  }

  if (range.end >= chunks.length - 1) return normalized;
  let nextLength = chunks[range.end + 1].length;
  const moved = chunks.splice(range.start, range.end - range.start + 1);
  if (hasTrailingLineBreak(moved[moved.length - 1]) && !hasTrailingLineBreak(chunks[range.start])) {
    const lineBreak = getTrailingLineBreak(moved[moved.length - 1]);
    moved[moved.length - 1] = moved[moved.length - 1].slice(0, -lineBreak.length);
    chunks[range.start] = `${chunks[range.start]}${lineBreak}`;
    nextLength += lineBreak.length;
  }
  chunks.splice(range.start + 1, 0, ...moved);
  const result = {
    value: chunks.join(""),
    selectionStart: normalized.selectionStart + nextLength,
    selectionEnd: normalized.selectionEnd + nextLength,
  };
  return renumberOrderedLists
    ? renumberMovedMarkdownSelection(result, range.start + 1, baseStartNumber ?? undefined)
    : result;
}

export function moveMarkdownBlocks(state: TextState, direction: "up" | "down"): TextEditResult {
  const normalized = normalizeSelection(state);
  const frontMatterMove = moveMarkdownFrontMatterLines(normalized, direction);
  if (frontMatterMove) return frontMatterMove;

  const listItemMove = moveMarkdownListItems(normalized, direction);
  if (listItemMove) return listItemMove;

  const blocks = splitMarkdownBlocks(normalized.value);
  if (blocks.length < 2) return normalized;
  const selectionStart = findMarkdownBlockIndexAt(blocks, normalized.selectionStart);
  const selectionEndProbe = normalized.selectionEnd > normalized.selectionStart
    ? normalized.selectionEnd - 1
    : normalized.selectionEnd;
  const selectionEnd = findMarkdownBlockIndexAt(blocks, selectionEndProbe);
  if (selectionStart < 0 || selectionEnd < selectionStart) return normalized;

  const groupStart = blocks[selectionStart].start;
  const groupEnd = blocks[selectionEnd + 1]?.start ?? normalized.value.length;
  if (direction === "up") {
    if (selectionStart === 0) return normalized;
    if (blocks[selectionStart - 1].type === "frontmatter") return normalized;
    return swapMarkdownRangeWithPrevious(
      normalized,
      blocks[selectionStart - 1].start,
      getMarkdownBlockContentEnd(blocks[selectionStart - 1]),
      groupStart,
      getMarkdownBlockContentEnd(blocks[selectionEnd]),
      groupEnd,
    );
  }

  if (selectionEnd >= blocks.length - 1) return normalized;
  const nextEnd = blocks[selectionEnd + 2]?.start ?? normalized.value.length;
  return swapMarkdownRangeWithNext(
    normalized,
    groupStart,
    getMarkdownBlockContentEnd(blocks[selectionEnd]),
    groupEnd,
    getMarkdownBlockContentEnd(blocks[selectionEnd + 1]),
    nextEnd,
  );
}

function moveMarkdownFrontMatterLines(
  state: TextState,
  direction: "up" | "down",
): TextEditResult | null {
  const frontMatter = findMarkdownFrontMatterRange(state.value);
  if (!frontMatter || state.selectionStart >= frontMatter.closingEnd) return null;
  if (state.selectionEnd > frontMatter.closingEnd) return state;

  const chunks = collectLineChunks(state.value);
  const range = getSelectedLineIndexes(chunks, state.selectionStart, state.selectionEnd);
  const firstContentLine = getChunkIndexAtOffset(chunks, frontMatter.contentStart);
  const closingLine = getChunkIndexAtOffset(chunks, frontMatter.contentEnd);
  if (range.start < firstContentLine || range.end >= closingLine) return state;
  if (direction === "up" && range.start === firstContentLine) return state;
  if (direction === "down" && range.end === closingLine - 1) return state;
  return moveTextLines(state, direction, false);
}

function moveMarkdownListItems(
  state: TextState,
  direction: "up" | "down",
): TextEditResult | null {
  const items: MarkdownSelectionSyntaxNode[] = [];
  markdownLanguage.parser.parse(state.value).iterate({
    enter(cursor) {
      if (cursor.name === "ListItem") items.push(cursor.node);
    },
  });
  if (items.length === 0) return null;

  const endProbe = state.selectionEnd > state.selectionStart
    ? state.selectionEnd - 1
    : state.selectionEnd;
  const first = findInnermostListItem(items, state.selectionStart);
  const last = findInnermostListItem(items, endProbe);
  if (!first || !last || !sameMarkdownSyntaxNode(first.parent, last.parent)) return null;
  const parent = first.parent;
  if (!parent) return null;
  const siblings: MarkdownSelectionSyntaxNode[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.name === "ListItem") siblings.push(child);
  }
  const firstIndex = siblings.findIndex((item) => sameMarkdownSyntaxNode(item, first));
  const lastIndex = siblings.findIndex((item) => sameMarkdownSyntaxNode(item, last));
  if (firstIndex < 0 || lastIndex < firstIndex) return null;
  if (direction === "up" && firstIndex === 0) return null;
  if (direction === "down" && lastIndex >= siblings.length - 1) return null;

  const groupStart = siblings[firstIndex].from;
  const groupEnd = siblings[lastIndex + 1]?.from ?? getLineEndOffset(state.value, parent.to);
  const baseStartNumber = getOrderedListStartNumberAtLine(
    state.value,
    findLineIndex(state.value.split("\n"), groupStart),
  );
  const moved = direction === "up"
    ? swapMarkdownRangeWithPrevious(
      state,
      siblings[firstIndex - 1].from,
      siblings[firstIndex - 1].to,
      groupStart,
      siblings[lastIndex].to,
      groupEnd,
    )
    : swapMarkdownRangeWithNext(
      state,
      groupStart,
      siblings[lastIndex].to,
      groupEnd,
      siblings[lastIndex + 1].to,
      siblings[lastIndex + 2]?.from ?? getLineEndOffset(state.value, parent.to),
    );
  const insertionLine = findLineIndex(
    moved.value.split("\n"),
    Math.min(moved.selectionStart, moved.selectionEnd),
  );
  return renumberMovedMarkdownSelection(
    moved,
    insertionLine,
    baseStartNumber ?? undefined,
  );
}

function renumberMovedMarkdownSelection(
  state: TextEditResult,
  lineIndex: number,
  startNumber?: string,
): TextEditResult {
  const value = renumberOrderedListBlockAtLine(state.value, lineIndex, startNumber);
  if (value === state.value) return state;
  return {
    value,
    selectionStart: mapOffsetAcrossLineRewrite(state.value, value, state.selectionStart),
    selectionEnd: mapOffsetAcrossLineRewrite(state.value, value, state.selectionEnd),
  };
}

function mapOffsetAcrossLineRewrite(before: string, after: string, offset: number): number {
  const beforeChunks = collectLineChunks(before);
  const afterChunks = collectLineChunks(after);
  const lineIndex = getChunkIndexAtOffset(beforeChunks, Math.max(0, Math.min(offset, before.length)));
  const beforeStart = getChunkStartOffset(beforeChunks, lineIndex);
  const afterStart = getChunkStartOffset(afterChunks, Math.min(lineIndex, afterChunks.length - 1));
  const beforeLine = stripLineBreak(beforeChunks[lineIndex] ?? "");
  const afterLine = stripLineBreak(afterChunks[lineIndex] ?? "");
  const column = Math.max(0, offset - beforeStart);

  if (column > beforeLine.length) {
    return afterStart + afterLine.length + Math.min(
      column - beforeLine.length,
      (afterChunks[lineIndex] ?? "").length - afterLine.length,
    );
  }

  let commonPrefix = 0;
  while (
    commonPrefix < beforeLine.length
    && commonPrefix < afterLine.length
    && beforeLine[commonPrefix] === afterLine[commonPrefix]
  ) {
    commonPrefix += 1;
  }
  let commonSuffix = 0;
  while (
    commonSuffix < beforeLine.length - commonPrefix
    && commonSuffix < afterLine.length - commonPrefix
    && beforeLine[beforeLine.length - commonSuffix - 1] === afterLine[afterLine.length - commonSuffix - 1]
  ) {
    commonSuffix += 1;
  }

  const mappedColumn = column <= commonPrefix
    ? column
    : column >= beforeLine.length - commonSuffix
      ? afterLine.length - (beforeLine.length - column)
      : Math.min(afterLine.length - commonSuffix, commonPrefix + column - commonPrefix);
  return afterStart + Math.max(0, mappedColumn);
}

function findInnermostListItem(
  items: MarkdownSelectionSyntaxNode[],
  position: number,
): MarkdownSelectionSyntaxNode | null {
  return items
    .filter((item) => position >= item.from && position <= item.to)
    .sort((left, right) => (left.to - left.from) - (right.to - right.from))[0]
    ?? null;
}

function sameMarkdownSyntaxNode(
  left: MarkdownSelectionSyntaxNode | null,
  right: MarkdownSelectionSyntaxNode | null,
): boolean {
  return Boolean(
    left
    && right
    && left.name === right.name
    && left.from === right.from
    && left.to === right.to,
  );
}

function findMarkdownBlockIndexAt(
  blocks: ReturnType<typeof splitMarkdownBlocks>,
  position: number,
): number {
  for (let index = 0; index < blocks.length; index += 1) {
    const nextStart = blocks[index + 1]?.start ?? Number.POSITIVE_INFINITY;
    if (position >= blocks[index].start && position < nextStart) return index;
  }
  return blocks.length - 1;
}

function getMarkdownBlockContentEnd(
  block: ReturnType<typeof splitMarkdownBlocks>[number],
): number {
  const trailingLineBreak = block.raw.match(/(?:\r\n|\n)$/)?.[0].length ?? 0;
  return block.end - trailingLineBreak;
}

function getLineEndOffset(value: string, position: number): number {
  const newline = value.indexOf("\n", Math.max(0, position));
  return newline < 0 ? value.length : newline + 1;
}

function swapMarkdownRangeWithPrevious(
  state: TextState,
  previousStart: number,
  previousEnd: number,
  groupStart: number,
  groupContentEnd: number,
  groupEnd: number,
): TextEditResult {
  const previous = state.value.slice(previousStart, previousEnd);
  const between = state.value.slice(previousEnd, groupStart);
  const selected = state.value.slice(groupStart, groupContentEnd);
  const after = state.value.slice(groupContentEnd, groupEnd);
  const value = `${state.value.slice(0, previousStart)}${selected}${between}${previous}${after}${state.value.slice(groupEnd)}`;
  return {
    value,
    selectionStart: state.selectionStart - previous.length - between.length,
    selectionEnd: state.selectionEnd - previous.length - between.length,
  };
}

function swapMarkdownRangeWithNext(
  state: TextState,
  groupStart: number,
  groupContentEnd: number,
  groupEnd: number,
  nextContentEnd: number,
  nextEnd: number,
): TextEditResult {
  const selected = state.value.slice(groupStart, groupContentEnd);
  const between = state.value.slice(groupContentEnd, groupEnd);
  const next = state.value.slice(groupEnd, nextContentEnd);
  const after = state.value.slice(nextContentEnd, nextEnd);
  const value = `${state.value.slice(0, groupStart)}${next}${between}${selected}${after}${state.value.slice(nextEnd)}`;
  return {
    value,
    selectionStart: state.selectionStart + next.length + between.length,
    selectionEnd: state.selectionEnd + next.length + between.length,
  };
}

export function prefixMarkdownLines(state: TextState, prefix: string): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  const lines = selected.split("\n");
  const nextSelected = lines
    .map((line) => (line.trim() ? `${prefix}${line}` : line))
    .join("\n");
  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.start + prefix.length,
    selectionEnd: range.end + (nextSelected.length - selected.length),
  };
}

export function prefixNumberedMarkdownLines(state: TextState): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  let orderedIndex = 1;
  const nextSelected = selected
    .split("\n")
    .map((line) => {
      if (!line.trim()) return line;
      const numbered = `${orderedIndex}. ${line}`;
      orderedIndex += 1;
      return numbered;
    })
    .join("\n");
  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.start + 3,
    selectionEnd: range.end + (nextSelected.length - selected.length),
  };
}

export type MarkdownLineFormat = "blockquote" | "bullet" | "ordered" | "task" | "definition";
export type MarkdownTableRowPosition = "above" | "below";
export type MarkdownTableColumnPosition = "left" | "right";
export type MarkdownTableRowMoveDirection = "up" | "down";
export type MarkdownTableColumnMoveDirection = "left" | "right";
export type MarkdownTableCellDirection = "next" | "previous";
export type MarkdownTableSelectionKind = "cell" | "row" | "column" | "table";

export interface TableRowFormat {
  leadingPipe: boolean;
  trailingPipe: boolean;
}

export function formatMarkdownLines(state: TextState, format: MarkdownLineFormat): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  const lines = selected.split("\n");
  const contentLines = lines.filter((line) => line.trim());
  const shouldRemove = contentLines.length > 0 && contentLines.every((line) => hasLineFormat(line, format));
  const shouldFormatBlankLine = lines.length === 1 && isBlankLineFormattingTarget(lines[0] ?? "");
  let orderedIndex = 1;
  const transforms: LineTransform[] = [];

  const nextSelected = lines
    .map((line) => {
      if (!line.trim() && !shouldFormatBlankLine) {
        transforms.push(createLineTransform(line.length, line.length, 0, 0, 0));
        return line;
      }
      if (format === "blockquote") {
        const result = formatBlockquoteLine(line, shouldRemove, shouldFormatBlankLine);
        transforms.push(result.transform);
        return result.line;
      }

      const stripped = stripLineForListFormatting(line);
      if (shouldRemove) {
        const nextLine = `${stripped.indent}${stripped.content}`;
        transforms.push(createLineTransform(
          line.length,
          nextLine.length,
          stripped.contentStart,
          stripped.indent.length,
          stripped.content.length,
        ));
        return nextLine;
      }

      switch (format) {
        case "bullet": {
          const marker = "- ";
          const nextLine = `${stripped.indent}${marker}${stripped.content}`;
          transforms.push(createLineTransform(
            line.length,
            nextLine.length,
            stripped.contentStart,
            stripped.indent.length + marker.length,
            stripped.content.length,
          ));
          return nextLine;
        }
        case "ordered": {
          const marker = `${orderedIndex}. `;
          const next = `${stripped.indent}${marker}${stripped.content}`;
          transforms.push(createLineTransform(
            line.length,
            next.length,
            stripped.contentStart,
            stripped.indent.length + marker.length,
            stripped.content.length,
          ));
          orderedIndex += 1;
          return next;
        }
        case "task": {
          const marker = `- [${stripped.taskChecked ? "x" : " "}] `;
          const nextLine = `${stripped.indent}${marker}${stripped.content}`;
          transforms.push(createLineTransform(
            line.length,
            nextLine.length,
            stripped.contentStart,
            stripped.indent.length + marker.length,
            stripped.content.length,
          ));
          return nextLine;
        }
        case "definition": {
          const marker = ": ";
          const nextLine = `${stripped.indent}${marker}${stripped.content}`;
          transforms.push(createLineTransform(
            line.length,
            nextLine.length,
            stripped.contentStart,
            stripped.indent.length + marker.length,
            stripped.content.length,
          ));
          return nextLine;
        }
        default:
          transforms.push(createLineTransform(line.length, line.length, 0, 0, line.length));
          return line;
      }
    })
    .join("\n");

  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + mapTransformedLineOffset(range.start - range.lineStart, transforms),
    selectionEnd: range.lineStart + mapTransformedLineOffset(range.end - range.lineStart, transforms),
  };
}

function formatBlockquoteLine(
  line: string,
  shouldRemove: boolean,
  formatBlankLine: boolean,
): { line: string; transform: LineTransform } {
  if (shouldRemove) {
    const leading = line.match(/^\s*/)?.[0] ?? "";
    const quote = line.slice(leading.length).match(/^>\s?/)?.[0] ?? "";
    const nextLine = removeSingleBlockquoteMarker(line);
    return {
      line: nextLine,
      transform: createLineTransform(
        line.length,
        nextLine.length,
        leading.length + quote.length,
        leading.length,
        Math.max(0, line.length - leading.length - quote.length),
      ),
    };
  }

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const nextLine = addBlockquoteMarker(line);
  const markerLength = formatBlankLine && !line.trim() ? nextLine.length - indent.length : 2;
  return {
    line: nextLine,
    transform: createLineTransform(
      line.length,
      nextLine.length,
      indent.length,
      indent.length + markerLength,
      Math.max(0, line.length - indent.length),
    ),
  };
}

export function setHeadingLevel(state: TextState, level: 1 | 2 | 3 | 4 | 5 | 6): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const setext = findSetextHeadingRange(range.value, range.lineStart, range.normalizedEnd);
  if (setext) {
    const prefix = `${"#".repeat(level)} `;
    const replacement = `${setext.quotePrefix}${prefix}${setext.title}`;
    const value = `${range.value.slice(0, setext.headingStart)}${replacement}${sliceAfterRemovedLinePreservingBreak(range.value, setext.underlineEnd)}`;
    const cursor = setext.headingStart + setext.quotePrefix.length + prefix.length;
    return {
      value,
      selectionStart: cursor,
      selectionEnd: cursor + setext.title.length,
    };
  }

  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  const prefix = `${"#".repeat(level)} `;
  const lines = selected.split("\n");
  const shouldFormatBlankLine = lines.length === 1 && isBlankHeadingTarget(lines[0] ?? "");
  const transforms: LineTransform[] = [];
  const nextSelected = lines
    .map((line) => {
      const result = formatHeadingLine(line, prefix, shouldFormatBlankLine);
      transforms.push(result.transform);
      return result.line;
    })
    .join("\n");
  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + mapTransformedLineOffset(range.start - range.lineStart, transforms),
    selectionEnd: range.lineStart + mapTransformedLineOffset(range.end - range.lineStart, transforms),
  };
}

export function adjustHeadingLevel(state: TextState, direction: "increase" | "decrease"): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const level = getHeadingLevelAtRange(range.value, range.lineStart, range.normalizedEnd);
  if (direction === "increase") {
    const nextLevel = (level === 0 ? 6 : Math.max(1, level - 1)) as 1 | 2 | 3 | 4 | 5 | 6;
    return setHeadingLevel(state, nextLevel);
  }

  if (level === 0) {
    return normalizeSelection(state);
  }
  if (level === 1) {
    return setParagraphText(state);
  }
  const nextLevel = Math.min(6, level + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  return setHeadingLevel(state, nextLevel);
}

function getHeadingLevelAtRange(value: string, lineStart: number, lineEnd: number): number {
  const setext = findSetextHeadingRange(value, lineStart, lineEnd);
  if (setext) {
    const underline = value.slice(setext.underlineStart, setext.underlineEnd);
    const content = getSetextLineContext(underline).content.trim();
    return content.startsWith("=") ? 1 : 2;
  }

  const line = value.slice(lineStart, lineEnd);
  const context = getSetextLineContext(line);
  const match = context.content.match(/^\s{0,3}(#{1,6})\s+/);
  return match ? match[1].length : 0;
}

function formatHeadingLine(line: string, prefix: string, formatBlankLine = false): { line: string; transform: LineTransform } {
  const { body: lineBody, ending } = splitCarriageReturnEnding(line);
  const quote = parseQuotePrefix(lineBody);
  if (quote) {
    const rest = lineBody.slice(quote.rawLength);
    const innerIndent = rest.match(/^\s*/)?.[0] ?? "";
    const contentStart = quote.rawLength + innerIndent.length;
    const rawContent = rest.slice(innerIndent.length);
    const heading = rawContent.match(/^#{1,6}\s+(.+)$/);
    const content = heading ? stripAtxClosingMarker(heading[1]) : rawContent;
    if (!content.trim()) {
      if (formatBlankLine) {
        const nextLine = `${quote.normalized}${prefix}${ending}`;
        return {
          line: nextLine,
          transform: createLineTransform(line.length, nextLine.length, quote.rawLength, nextLine.length, 0),
        };
      }
      const nextLine = `${quote.normalized}${ending}`;
      return {
        line: nextLine,
        transform: createLineTransform(line.length, nextLine.length, quote.rawLength, nextLine.length, 0),
      };
    }

    const oldContentStart = heading
      ? contentStart + (heading[0].length - heading[1].length)
      : contentStart;
    const nextLine = `${quote.normalized}${prefix}${content}${ending}`;
    return {
      line: nextLine,
      transform: createLineTransform(
        line.length,
        nextLine.length,
        oldContentStart,
        quote.normalized.length + prefix.length,
        content.length + ending.length,
      ),
    };
  }

  const heading = lineBody.match(/^\s{0,3}#{1,6}\s+(.+)$/);
  const content = heading ? stripAtxClosingMarker(heading[1]) : lineBody.trimStart();
  if (!content.trim()) {
    if (formatBlankLine) {
      const nextLine = `${prefix}${ending}`;
      return {
        line: nextLine,
        transform: createLineTransform(line.length, nextLine.length, 0, nextLine.length, 0),
      };
    }
    const nextLine = `${content}${ending}`;
    return {
      line: nextLine,
      transform: createLineTransform(line.length, nextLine.length, 0, 0, nextLine.length),
    };
  }

  const oldContentStart = heading
    ? lineBody.indexOf(heading[1])
    : lineBody.length - lineBody.trimStart().length;
  const nextLine = `${prefix}${content}${ending}`;
  return {
    line: nextLine,
    transform: createLineTransform(line.length, nextLine.length, oldContentStart, prefix.length, content.length + ending.length),
  };
}

function createLineTransform(
  oldLength: number,
  newLength: number,
  oldContentStart: number,
  newContentStart: number,
  contentLength: number,
): LineTransform {
  return { oldLength, newLength, oldContentStart, newContentStart, contentLength };
}

function mapTransformedLineOffset(offset: number, transforms: LineTransform[]): number {
  const oldLength = getLineTransformsLength(transforms, "oldLength");
  const newLength = getLineTransformsLength(transforms, "newLength");
  if (offset > oldLength) return offset + (newLength - oldLength);

  let oldLineStart = 0;
  let newLineStart = 0;
  for (let index = 0; index < transforms.length; index += 1) {
    const transform = transforms[index];
    const oldLineEnd = oldLineStart + transform.oldLength;
    if (offset <= oldLineEnd || index === transforms.length - 1) {
      const column = Math.max(0, Math.min(transform.oldLength, offset - oldLineStart));
      return newLineStart + mapTransformedLineColumn(column, transform);
    }
    oldLineStart = oldLineEnd + 1;
    newLineStart += transform.newLength + 1;
  }

  return Math.max(0, offset + (newLength - oldLength));
}

function getLineTransformsLength(transforms: LineTransform[], key: "oldLength" | "newLength"): number {
  return transforms.reduce((length, transform, index) => (
    length + transform[key] + (index > 0 ? 1 : 0)
  ), 0);
}

function mapTransformedLineColumn(column: number, transform: LineTransform): number {
  if (column <= transform.oldContentStart) return transform.newContentStart;
  const contentColumn = Math.min(transform.contentLength, column - transform.oldContentStart);
  return transform.newContentStart + contentColumn;
}

export function setParagraphText(state: TextState): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const setext = findSetextHeadingRange(range.value, range.lineStart, range.normalizedEnd);
  if (setext) {
    const value = `${range.value.slice(0, setext.headingStart)}${setext.title}${sliceAfterRemovedLinePreservingBreak(range.value, setext.underlineEnd)}`;
    const cursor = setext.headingStart + Math.min(setext.title.length, Math.max(0, range.start - setext.titleStart));
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const selected = range.value.slice(range.lineStart, range.normalizedEnd);
  const transforms: LineTransform[] = [];
  const nextSelected = selected
    .split("\n")
    .map((line) => {
      const stripped = stripBlockMarkers(line);
      const nextLine = `${stripped.indent}${stripped.content}`;
      transforms.push(createLineTransform(
        line.length,
        nextLine.length,
        stripped.contentStart,
        stripped.indent.length,
        stripped.content.length,
      ));
      return nextLine;
    })
    .join("\n");
  const value = `${range.value.slice(0, range.lineStart)}${nextSelected}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + mapTransformedLineOffset(range.start - range.lineStart, transforms),
    selectionEnd: range.lineStart + mapTransformedLineOffset(range.end - range.lineStart, transforms),
  };
}

export function clearMarkdownFormatting(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) {
    const structured = clearStructuredMarkdownSelection(normalized);
    const selected = structured.value.slice(structured.selectionStart, structured.selectionEnd);
    const range = getLineRange(structured.value, structured.selectionStart, structured.selectionEnd);
    const coversLineRange = structured.selectionStart === range.lineStart && structured.selectionEnd === range.normalizedEnd;
    const plainSource = selected.includes("\n") || coversLineRange
      ? selected
        .split("\n")
        .map((line) => stripBlockFormatting(line))
        .join("\n")
      : selected;
    const plain = restorePreferredLineBreaks(
      stripInlineFormatting(plainSource),
      selected,
    );
    const value = `${structured.value.slice(0, structured.selectionStart)}${plain}${structured.value.slice(structured.selectionEnd)}`;
    return {
      value,
      selectionStart: structured.selectionStart,
      selectionEnd: structured.selectionStart + plain.length,
    };
  }

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  const setext = findSetextHeadingRange(range.value, range.lineStart, range.normalizedEnd);
  if (setext) {
    const plain = stripInlineFormatting(setext.title);
    const value = `${range.value.slice(0, setext.headingStart)}${plain}${sliceAfterRemovedLinePreservingBreak(range.value, setext.underlineEnd)}`;
    const rawOffset = Math.max(0, normalized.selectionStart - setext.titleStart);
    const cursor = setext.headingStart + mapStrippedInlineOffset(setext.title, plain, rawOffset);
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const line = range.value.slice(range.lineStart, range.normalizedEnd);
  const column = normalized.selectionStart - range.lineStart;
  const formatted = stripLineFormattingWithMap(line, column);
  const value = `${range.value.slice(0, range.lineStart)}${formatted.line}${range.value.slice(range.normalizedEnd)}`;
  const cursor = range.lineStart + formatted.cursor;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function clearStructuredMarkdownSelection(state: TextState): TextState {
  let current = state;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const styleEdit = clearOneMarkdownInlineStyle(current);
    if (styleEdit) {
      current = styleEdit;
      continue;
    }
    const linkEdit = clearOneMarkdownLink(current);
    if (linkEdit) {
      current = linkEdit;
      continue;
    }
    break;
  }
  return current;
}

function clearOneMarkdownInlineStyle(state: TextState): TextState | null {
  const parseSpans = collectMarkdownInlineStyleParseSpans(state.value);
  const ranges = collectAllMarkdownInlineStyleRanges(state.value, parseSpans)
    .filter((range) => rangesOverlap(
      state.selectionStart,
      state.selectionEnd,
      range.contentStart,
      range.contentEnd,
    ))
    .filter((range) => !(
      state.selectionStart <= range.start
      && state.selectionEnd >= range.end
    ))
    .sort((left, right) => (
      (left.contentEnd - left.contentStart) - (right.contentEnd - right.contentStart)
    ));

  for (const range of ranges) {
    const selectionStart = Math.max(state.selectionStart, range.contentStart);
    const selectionEnd = Math.min(state.selectionEnd, range.contentEnd);
    if (selectionStart >= selectionEnd) continue;
    const definition: MarkdownInlineStyleDefinition = {
      kind: range.kind,
      preferred: { opening: range.opening, closing: range.closing },
      aliases: [{ opening: range.opening, closing: range.closing }],
    };
    const result = removeMarkdownInlineStyleFromSelection(
      {
        value: state.value,
        selectionStart,
        selectionEnd,
      },
      definition,
      range,
      parseSpans,
    );
    if (result) {
      return preserveSelectionAfterSubEdit(state, result, selectionStart, selectionEnd);
    }
  }
  return null;
}

type ClearableMarkdownLink = NonNullable<ReturnType<typeof readMarkdownInlineLink>>;

function clearOneMarkdownLink(state: TextState): TextState | null {
  const links = collectClearableMarkdownLinks(state.value)
    .filter((link) => rangesOverlap(
      state.selectionStart,
      state.selectionEnd,
      link.labelStart,
      link.labelEnd,
    ))
    .filter((link) => !(
      state.selectionStart <= link.start
      && state.selectionEnd >= link.end
    ))
    .sort((left, right) => (left.end - left.start) - (right.end - right.start));

  for (const link of links) {
    const selectionStart = Math.max(state.selectionStart, link.labelStart);
    const selectionEnd = Math.min(state.selectionEnd, link.labelEnd);
    if (selectionStart >= selectionEnd) continue;
    const parsed = findMarkdownLinkAtCursor(
      state.value,
      selectionStart,
      selectionEnd,
      false,
    );
    if (!parsed || parsed.image || parsed.start !== link.start || parsed.end !== link.end) {
      continue;
    }

    const prefix = state.value.slice(link.start, link.labelStart);
    const suffix = state.value.slice(link.labelEnd, link.end);
    const left = state.value.slice(link.labelStart, selectionStart);
    const selected = state.value.slice(selectionStart, selectionEnd);
    const right = state.value.slice(selectionEnd, link.labelEnd);
    const leftLink = wrapMarkdownLinkLabel(left, prefix, suffix);
    const rightLink = wrapMarkdownLinkLabel(right, prefix, suffix);
    const replacement = `${leftLink}${selected}${rightLink}`;
    const value = `${state.value.slice(0, link.start)}${replacement}${state.value.slice(link.end)}`;
    const result = {
      value,
      selectionStart: link.start + leftLink.length,
      selectionEnd: link.start + leftLink.length + selected.length,
    };
    return preserveSelectionAfterSubEdit(state, result, selectionStart, selectionEnd);
  }
  return null;
}

function collectClearableMarkdownLinks(value: string): ClearableMarkdownLink[] {
  const links: ClearableMarkdownLink[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const open = value.indexOf("[", cursor);
    if (open < 0) break;
    const link = readMarkdownInlineLink(value, open) ?? readMarkdownReferenceLink(value, open);
    if (link) {
      if (link.imageStart === null) links.push(link);
      cursor = Math.max(open + 1, link.end);
    } else {
      cursor = open + 1;
    }
  }
  return links;
}

function wrapMarkdownLinkLabel(content: string, prefix: string, suffix: string): string {
  if (!content) return "";
  const leading = content.match(/^[ \t\r\n]+/)?.[0] ?? "";
  const trailing = content.slice(leading.length).match(/[ \t\r\n]+$/)?.[0] ?? "";
  const core = content.slice(leading.length, content.length - trailing.length);
  return core ? `${leading}${prefix}${core}${suffix}${trailing}` : content;
}

function preserveSelectionAfterSubEdit(
  state: TextState,
  result: TextEditResult,
  editedSelectionStart: number,
  editedSelectionEnd: number,
): TextState {
  const edit = findSingleTextReplacement(state.value, result.value);
  const map = (offset: number) => mapOffsetAfterTextReplacement(
    offset,
    edit.start,
    edit.end,
    edit.replacementLength,
  );
  return {
    value: result.value,
    selectionStart: state.selectionStart === editedSelectionStart
      ? result.selectionStart
      : map(state.selectionStart),
    selectionEnd: state.selectionEnd === editedSelectionEnd
      ? result.selectionEnd
      : map(state.selectionEnd),
  };
}

function findSingleTextReplacement(
  before: string,
  after: string,
): { start: number; end: number; replacementLength: number } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }
  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > start
    && afterEnd > start
    && before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return {
    start,
    end: beforeEnd,
    replacementLength: afterEnd - start,
  };
}

interface CompactNestedBulletList {
  indent: string;
  marker: string;
  taskMarker: string;
  content: string;
  depth: number;
}

function getCompactNestedBulletList(line: string): CompactNestedBulletList | null {
  const indent = line.match(/^[ \t]*/)?.[0] ?? "";
  const markers: string[] = [];
  let cursor = indent.length;

  while (cursor < line.length) {
    const marker = line.slice(cursor).match(/^([-*+])[ \t]+/);
    if (!marker) break;
    markers.push(marker[1]);
    cursor += marker[0].length;
  }
  if (markers.length < 2) return null;

  const task = line.slice(cursor).match(/^(\[[ xX]\])[ \t]+/);
  if (task) cursor += task[0].length;
  return {
    indent,
    marker: markers.at(-1) ?? "*",
    taskMarker: task ? "[ ] " : "",
    content: line.slice(cursor),
    depth: markers.length - 1,
  };
}

export function continueMarkdownList(state: TextState, indentSize = 2): TextEditResult | null {
  const normalized = normalizeEmptyMarkdownListCursor(state, "plain");
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd === -1 ? normalized.value.length : lineEnd;
  const line = normalized.value.slice(lineStart, normalized.selectionStart);
  const afterCursor = normalized.value.slice(normalized.selectionStart, normalizedLineEnd);
  const compact = getCompactNestedBulletList(line);
  if (compact) {
    const lines = normalized.value.split("\n");
    const lineIndex = findLineIndex(lines, lineStart);
    if (!isMarkdownListMarkerIndentAllowed(lines, lineIndex, "", compact.indent)) return null;
    const normalizedIndentSize = indentSize === 4 ? 4 : 2;
    const continuationIndent = compact.indent
      + " ".repeat(normalizedIndentSize * compact.depth);
    if (!compact.content.trim() && !afterCursor.trim()) {
      const value = `${normalized.value.slice(0, lineStart)}${continuationIndent}${normalized.value.slice(normalized.selectionStart)}`;
      const cursor = lineStart + continuationIndent.length;
      return { value, selectionStart: cursor, selectionEnd: cursor };
    }
    return insertMarkdownAtSelection(
      normalized,
      `${lineBreak}${continuationIndent}${compact.marker} ${compact.taskMarker}`,
    );
  }
  const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
  if (!match) return null;
  const lines = normalized.value.split("\n");
  const lineIndex = findLineIndex(lines, lineStart);
  if (!isMarkdownListMarkerIndentAllowed(lines, lineIndex, "", match[1])) return null;

  const content = line.slice(match[0].length);
  if (!content.trim() && !afterCursor.trim()) {
    let value = `${normalized.value.slice(0, lineStart)}${match[1]}${normalized.value.slice(normalized.selectionStart)}`;
    const number = match[2].match(/^(\d+)([.)])$/);
    if (number) {
      const startLine = findLineIndex(value.split("\n"), lineStart) + 1;
      value = renumberOrderedListLines(value, startLine, match[1], normalizeOrderedListNumber(number[1]), number[2]);
    }
    const cursor = lineStart + match[1].length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  let marker = match[2];
  const number = marker.match(/^(\d+)([.)])$/);
  const taskMarker = match[3] ? "[ ] " : "";
  if (number) {
    marker = `${incrementOrderedListNumber(normalizeOrderedListNumber(number[1]))}${number[2]}`;
    const insertion = `${lineBreak}${match[1]}${marker} ${taskMarker}`;
    const value = `${normalized.value.slice(0, normalized.selectionStart)}${insertion}${normalized.value.slice(normalized.selectionEnd)}`;
    const cursor = normalized.selectionStart + insertion.length;
    return {
      value: renumberOrderedListLines(
        value,
        findLineIndex(value.split("\n"), cursor) + 1,
        match[1],
        incrementOrderedListNumber(incrementOrderedListNumber(normalizeOrderedListNumber(number[1]))),
        number[2],
      ),
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  return insertMarkdownAtSelection(normalized, `${lineBreak}${match[1]}${marker} ${taskMarker}`);
}

export function continueMarkdownBlock(state: TextState, indentSize = 2): TextEditResult | null {
  let normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) {
    const spansLines = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd).includes("\n");
    const blocks = splitMarkdownBlocks(normalized.value);
    const startBlock = blocks.find((block) => (
      normalized.selectionStart >= block.start && normalized.selectionStart < block.end
    ));
    const endOffset = Math.max(normalized.selectionStart, normalized.selectionEnd - 1);
    const endBlock = blocks.find((block) => endOffset >= block.start && endOffset < block.end);
    if (!startBlock || startBlock !== endBlock) return null;
    if (spansLines && !["list", "task", "quote"].includes(startBlock.type)) return null;

    normalized = {
      value: `${normalized.value.slice(0, normalized.selectionStart)}${normalized.value.slice(normalized.selectionEnd)}`,
      selectionStart: normalized.selectionStart,
      selectionEnd: normalized.selectionStart,
    };
  }
  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  if (isInsideMarkdownRawBlock(normalized.value, lineStart)) {
    return null;
  }

  const rawFence = completeMarkdownRawFenceAtCursor(normalized);
  if (rawFence.matched) return rawFence.edit;

  return (
    completeMarkdownFrontMatter(normalized)
    ?? continueMarkdownQuotedList(normalized, indentSize)
    ?? continueMarkdownList(normalized, indentSize)
    ?? continueMarkdownListContinuation(normalized)
    ?? continueMarkdownDefinitionList(normalized)
    ?? continueMarkdownFootnoteDefinition(normalized)
    ?? continueEmptyHeading(normalized)
    ?? completeMarkdownTableShortcut(normalized)
    ?? continueMarkdownTableRow(normalized)
    ?? continueMarkdownBlockquote(normalized)
    ?? completeMarkdownHorizontalRule(normalized)
  );
}

function completeMarkdownFrontMatter(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const bomLength = normalized.value.startsWith("\uFEFF") ? 1 : 0;
  if (normalized.selectionStart !== bomLength + 3) return null;
  if (normalized.value.slice(bomLength, normalized.selectionStart) !== "---") return null;

  const lineBreak = getPreferredLineBreak(normalized.value);
  const suffix = normalized.value.slice(normalized.selectionStart);
  if (suffix && !suffix.startsWith("\n") && !suffix.startsWith("\r\n")) return null;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${lineBreak}${lineBreak}---${suffix}`;
  const cursor = normalized.selectionStart + lineBreak.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function editMarkdownFrontMatterOnEnter(
  state: TextState,
  modifiers: MarkdownEnterModifiers = {},
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const frontMatter = findMarkdownFrontMatterRange(normalized.value);
  if (!frontMatter) return null;

  const lineBreak = getPreferredLineBreak(normalized.value);
  const logicalContentEnd = frontMatter.contentEnd - lineBreak.length;
  if (
    logicalContentEnd < frontMatter.contentStart
    || normalized.selectionStart < frontMatter.contentStart
    || normalized.selectionEnd > logicalContentEnd
  ) {
    return null;
  }

  const hasSelection = normalized.selectionStart !== normalized.selectionEnd;
  const canExit = !modifiers.primary && !modifiers.shift && !modifiers.alt;
  const hasTrailingEmptyLine = normalized.value
    .slice(frontMatter.contentStart, frontMatter.contentEnd)
    .endsWith(`${lineBreak}${lineBreak}`);
  if (
    !hasSelection
    && canExit
    && normalized.selectionStart === logicalContentEnd
    && hasTrailingEmptyLine
  ) {
    if (frontMatter.closingEnd > frontMatter.closingContentEnd) {
      const afterClosingBreak = normalized.value.slice(frontMatter.closingEnd);
      if (!afterClosingBreak || afterClosingBreak.startsWith(lineBreak)) {
        return {
          value: normalized.value,
          selectionStart: frontMatter.closingEnd,
          selectionEnd: frontMatter.closingEnd,
        };
      }
      const value = `${normalized.value.slice(0, frontMatter.closingEnd)}${lineBreak}${afterClosingBreak}`;
      return { value, selectionStart: frontMatter.closingEnd, selectionEnd: frontMatter.closingEnd };
    }

    const value = `${normalized.value.slice(0, frontMatter.closingContentEnd)}${lineBreak}${normalized.value.slice(frontMatter.closingContentEnd)}`;
    const cursor = frontMatter.closingContentEnd + lineBreak.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  return insertMarkdownAtSelection(normalized, lineBreak);
}

export function splitMarkdownParagraphOnEnter(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  if (isInsideMarkdownRawBlock(normalized.value, lineStart)) return null;
  const blocks = splitMarkdownBlocks(normalized.value);
  const startBlock = blocks.find((block) => (
    normalized.selectionStart >= block.start
    && normalized.selectionStart <= block.end
  ));
  const endBlock = blocks.find((block) => (
    normalized.selectionEnd >= block.start
    && normalized.selectionEnd <= block.end
  ));
  if (!startBlock || startBlock !== endBlock) return null;
  if (["heading", "quote"].includes(startBlock.type)) {
    const heading = splitMarkdownHeadingPatternOnEnter(normalized);
    if (heading) return heading;
  }
  if (startBlock.type !== "paragraph") {
    return null;
  }

  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd < 0 ? normalized.value.length : lineEnd;
  const line = normalized.value.slice(lineStart, normalizedLineEnd);
  if (/^\s{0,3}(?:>|[-+*]\s|\d+[.)]\s|\[[^\]]+]:|\[\^[^\]]+]:)/.test(line)) return null;

  const lineBreak = getPreferredLineBreak(normalized.value);
  return insertMarkdownAtSelection(normalized, `${lineBreak}${lineBreak}`);
}

export function splitMarkdownContainerParagraphOnPrimaryEnter(
  state: TextState,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.value.slice(normalized.selectionStart, normalized.selectionEnd).includes("\n")) {
    return null;
  }

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  if (isInsideMarkdownRawBlock(normalized.value, lineStart)) return null;

  const pattern = getMarkdownContainerParagraphPattern(normalized);
  if (
    !pattern
    || normalized.selectionStart < pattern.contentStart
    || normalized.selectionEnd > pattern.contentEnd
  ) {
    return null;
  }

  const insertion = `${pattern.separator}${pattern.continuation}`;
  const value = [
    normalized.value.slice(0, normalized.selectionStart),
    insertion,
    normalized.value.slice(normalized.selectionEnd),
  ].join("");
  const cursor = normalized.selectionStart + insertion.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function applyMarkdownSpaceShortcut(state: TextState, indentSize = 2): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  if (isInsideMarkdownRawBlock(normalized.value, lineStart)) return null;

  const beforeCursor = normalized.value.slice(lineStart, normalized.selectionStart);
  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd === -1 ? normalized.value.length : lineEnd;
  const afterCursor = normalized.value.slice(normalized.selectionStart, normalizedLineEnd);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const lines = normalized.value.split("\n");
  const lineIndex = findLineIndex(lines, lineStart);
  const quotedShortcut = getQuotedMarkdownSpaceShortcut(
    beforeCursor,
    afterCursor,
    lineBreak,
    lines,
    lineIndex,
    indentSize,
  );
  if (quotedShortcut) {
    const value = `${normalized.value.slice(0, lineStart)}${quotedShortcut}${normalized.value.slice(normalized.selectionStart)}`;
    const cursor = lineStart + quotedShortcut.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const indent = beforeCursor.match(/^\s*/)?.[0] ?? "";
  const marker = beforeCursor.slice(indent.length);
  const nestedBulletShortcut = getNestedBulletSpaceShortcut(
    beforeCursor,
    afterCursor,
    lines,
    lineIndex,
    "",
    indentSize,
  );
  if (nestedBulletShortcut) {
    const value = `${normalized.value.slice(0, lineStart)}${nestedBulletShortcut}${normalized.value.slice(normalized.selectionStart)}`;
    const cursor = lineStart + nestedBulletShortcut.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }
  const replacement = normalizeGeneratedLineBreaks(getMarkdownSpaceShortcutReplacement(marker), lineBreak);

  if (!replacement) return null;
  if (isMarkdownListSpaceShortcutMarker(marker) && !isMarkdownListMarkerIndentAllowed(lines, lineIndex, "", indent)) return null;
  if (replacement.endsWith("\n") && afterCursor.trim()) return null;

  const nextLineStart = `${indent}${replacement}`;
  const value = `${normalized.value.slice(0, lineStart)}${nextLineStart}${normalized.value.slice(normalized.selectionStart)}`;
  const cursor = lineStart + nextLineStart.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function applyMarkdownTextInputShortcut(
  state: TextState,
  text: string,
  indentSize = 2,
): TextEditResult | null {
  let current = state;
  let segmentStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== " ") continue;
    const beforeSpace = text.slice(segmentStart, index);
    const stateBeforeSpace = beforeSpace
      ? insertMarkdownAtSelection(current, beforeSpace)
      : current;
    const shortcut = applyMarkdownSpaceShortcut(stateBeforeSpace, indentSize);
    if (shortcut) {
      const remaining = text.slice(index + 1);
      return remaining
        ? insertMarkdownAtSelection(shortcut, remaining)
        : shortcut;
    }
    current = insertMarkdownAtSelection(stateBeforeSpace, " ");
    segmentStart = index + 1;
  }
  return null;
}

export function applyMarkdownSpaceShortcutAfterInput(
  state: TextState,
  indentSize = 2,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (
    normalized.selectionStart !== normalized.selectionEnd
    || normalized.selectionStart === 0
    || normalized.value[normalized.selectionStart - 1] !== " "
  ) return null;
  const cursor = normalized.selectionStart - 1;
  return applyMarkdownSpaceShortcut({
    value: normalized.value.slice(0, cursor) + normalized.value.slice(cursor + 1),
    selectionStart: cursor,
    selectionEnd: cursor,
  }, indentSize);
}

function getQuotedMarkdownSpaceShortcut(
  beforeCursor: string,
  afterCursor: string,
  lineBreak: "\n" | "\r\n",
  lines: string[],
  lineIndex: number,
  indentSize: number,
): string {
  const quote = parseQuotePrefix(beforeCursor);
  if (!quote) return "";
  const content = beforeCursor.slice(quote.rawLength);
  if (!content && beforeCursor !== quote.normalized) {
    return quote.normalized;
  }
  const indent = content.match(/^\s*/)?.[0] ?? "";
  const marker = content.slice(indent.length);
  const nestedBulletShortcut = getNestedBulletSpaceShortcut(
    content,
    afterCursor,
    lines,
    lineIndex,
    quote.normalized,
    indentSize,
  );
  if (nestedBulletShortcut) return nestedBulletShortcut;
  const replacement = normalizeGeneratedLineBreaks(getMarkdownSpaceShortcutReplacement(marker), lineBreak);
  if (isMarkdownListSpaceShortcutMarker(marker) && !isMarkdownListMarkerIndentAllowed(lines, lineIndex, quote.normalized, indent)) {
    return "";
  }
  if (replacement.endsWith("\n") && afterCursor.trim()) return "";
  return replacement ? `${quote.normalized}${indent}${replacement}` : "";
}

function getNestedBulletSpaceShortcut(
  beforeCursor: string,
  afterCursor: string,
  lines: string[],
  lineIndex: number,
  quotePrefix: string,
  indentSize: number,
): string {
  if (afterCursor.trim() || lineIndex <= 0) return "";
  const shortcut = beforeCursor.match(/^([ \t]*)([-+*])[ \t]+([-+*])$/);
  if (!shortcut) return "";

  const previous = getListContinuationLineContext(lines[lineIndex - 1] ?? "");
  if (previous.quotePrefix !== quotePrefix) return "";
  const previousBody = splitCarriageReturnEnding(previous.content).body;
  const previousList = previousBody.match(/^([ \t]*)([-+*])[ \t]+(?:\[[ xX]\][ \t]+)?(.+)$/);
  if (
    !previousList
    || getIndentWidth(previousList[1]) !== getIndentWidth(shortcut[1])
    || !previousList[3].trim()
  ) return "";

  const normalizedIndentSize = indentSize === 4 ? 4 : 2;
  return `${quotePrefix}${shortcut[1]}${" ".repeat(normalizedIndentSize)}${shortcut[3]} `;
}

function getMarkdownSpaceShortcutReplacement(marker: string): string {
  if (/^#{1,6}$/.test(marker)) {
    return `${marker} `;
  }
  if (marker === "*") {
    return "* ";
  }
  if (marker === "-" || marker === "+") {
    return "- ";
  }
  if (/^\d+[.)]$/.test(marker)) {
    return `${marker} `;
  }
  if (marker === ">") {
    return "> ";
  }
  if (/^(---|\+\+\+|\*\*\*|___)$/.test(marker)) {
    return `${marker}\n`;
  }
  if (/^\[[ xX]?]$/.test(marker)) {
    return marker.toLowerCase() === "[x]" ? "- [x] " : "- [ ] ";
  }

  const taskMatch = marker.match(/^((?:[-*+]|\d+[.)])\s+)\[([ xX]?)]$/);
  if (taskMatch) {
    return `${taskMatch[1]}[${taskMatch[2]?.toLowerCase() === "x" ? "x" : " "}] `;
  }

  return "";
}

function isMarkdownListSpaceShortcutMarker(marker: string): boolean {
  return (
    marker === "-"
    || marker === "*"
    || marker === "+"
    || /^\d+[.)]$/.test(marker)
    || /^\[[ xX]?]$/.test(marker)
    || /^((?:[-*+]|\d+[.)])\s+)\[([ xX]?)]$/.test(marker)
  );
}

export function toggleTaskAtSelection(state: TextState): TextEditResult {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const line = range.value.slice(range.lineStart, range.normalizedEnd);
  if (line.includes("\n")) {
    const transforms: LineTransform[] = [];
    const nextLine = line
      .split("\n")
      .map((part) => {
        if (!part.trim()) {
          transforms.push(createLineTransform(part.length, part.length, 0, 0, part.length));
          return part;
        }
        const toggled = toggleTaskMarkerInLine(part);
        if (toggled) {
          transforms.push(createLineTransform(part.length, toggled.length, 0, 0, part.length));
          return toggled;
        }
        const added = addTaskMarkerToLineWithTransform(part);
        transforms.push(added.transform);
        return added.line;
      })
      .join("\n");
    const value = `${range.value.slice(0, range.lineStart)}${nextLine}${range.value.slice(range.normalizedEnd)}`;
    const coversWholeLineRange = range.start === range.lineStart && range.end === range.normalizedEnd;
    if (coversWholeLineRange) {
      return {
        value,
        selectionStart: range.lineStart,
        selectionEnd: range.lineStart + nextLine.length,
      };
    }
    return {
      value,
      selectionStart: range.lineStart + mapTransformedLineOffset(range.start - range.lineStart, transforms),
      selectionEnd: range.lineStart + mapTransformedLineOffset(range.end - range.lineStart, transforms),
    };
  }

  const nextLine = toggleTaskMarkerInLine(line);
  if (nextLine) {
    const value = `${range.value.slice(0, range.lineStart)}${nextLine}${range.value.slice(range.normalizedEnd)}`;
    return { value, selectionStart: range.start, selectionEnd: range.end };
  }

  const added = addTaskMarkerToLineWithTransform(line);
  const value = `${range.value.slice(0, range.lineStart)}${added.line}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + mapTransformedLineColumn(range.start - range.lineStart, added.transform),
    selectionEnd: range.lineStart + mapTransformedLineColumn(range.end - range.lineStart, added.transform),
  };
}

export function toggleMarkdownTaskByOrder(value: string, order: number): string {
  let seen = -1;
  const taskLinePattern = /^((?:\s*>[ \t]?)*\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]/;
  return value
    .split("\n")
    .map((line) => {
      if (!taskLinePattern.test(line)) return line;
      seen += 1;
      if (seen !== order) return line;
      return line.replace(/\[[ xX]\]/, (match) => (match.toLowerCase() === "[x]" ? "[ ]" : "[x]"));
    })
    .join("\n");
}

function toggleTaskMarkerInLine(line: string): string | null {
  const { body, ending } = splitCarriageReturnEnding(line);
  const task = body.match(/^((?:\s*>[ \t]?)*\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](.*)$/);
  if (!task) return null;

  const checked = task[2].toLowerCase() === "x";
  return `${task[1]}[${checked ? " " : "x"}]${task[3]}${ending}`;
}

function addTaskMarkerToLine(line: string): string {
  return addTaskMarkerToLineWithTransform(line).line;
}

function addTaskMarkerToLineWithTransform(line: string): { line: string; transform: LineTransform } {
  const { body, ending } = splitCarriageReturnEnding(line);
  const quote = parseQuotePrefix(body);
  if (quote) {
    const rest = body.slice(quote.rawLength);
    const list = rest.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/);
    if (list) {
      const nextLine = `${quote.normalized}${list[1]}${list[2]} [ ] ${list[4]}${ending}`;
      return {
        line: nextLine,
        transform: createLineTransform(
          line.length,
          nextLine.length,
          quote.rawLength + list[1].length + list[2].length + list[3].length,
          quote.normalized.length + list[1].length + list[2].length + " [ ] ".length,
          list[4].length + ending.length,
        ),
      };
    }
    const indent = rest.match(/^\s*/)?.[0] ?? "";
    const content = rest.slice(indent.length);
    const nextLine = `${quote.normalized}${indent}- [ ] ${content}${ending}`;
    return {
      line: nextLine,
      transform: createLineTransform(
        line.length,
        nextLine.length,
        quote.rawLength + indent.length,
        quote.normalized.length + indent.length + "- [ ] ".length,
        content.length + ending.length,
      ),
    };
  }

  const list = body.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/);
  if (list) {
    const nextLine = `${list[1]}${list[2]} [ ] ${list[4]}${ending}`;
    return {
      line: nextLine,
      transform: createLineTransform(
        line.length,
        nextLine.length,
        list[1].length + list[2].length + list[3].length,
        list[1].length + list[2].length + " [ ] ".length,
        list[4].length + ending.length,
      ),
    };
  }

  const indent = body.match(/^\s*/)?.[0] ?? "";
  const content = body.slice(indent.length);
  const nextLine = `${indent}- [ ] ${content}${ending}`;
  return {
    line: nextLine,
    transform: createLineTransform(
      line.length,
      nextLine.length,
      indent.length,
      indent.length + "- [ ] ".length,
      content.length + ending.length,
    ),
  };
}

export function applyAutoPair(state: TextState, key: string): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const pairs = getAutoPairs();
  const closingChars = new Set(Object.values(pairs));
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd);
  if (!selected && closingChars.has(key) && normalized.value[normalized.selectionStart] === key) {
    const cursor = normalized.selectionStart + key.length;
    return { value: normalized.value, selectionStart: cursor, selectionEnd: cursor };
  }

  const selectedOnlyPairs = getSelectedOnlyAutoPairs();
  if (selected && selectedOnlyPairs[key]) {
    return wrapMarkdownSelection(normalized, key, selectedOnlyPairs[key]);
  }

  if (key === "$" && !selected) return null;

  const close = pairs[key];
  if (!close) return null;
  if (key === "`" && !selected && normalized.value[normalized.selectionStart - 1] === "`") return null;
  if (key === "'" && shouldInsertPlainApostrophe(normalized)) return null;
  return wrapMarkdownSelection(normalized, key, close);
}

export function removeAutoPairOnBackspace(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd || normalized.selectionStart <= 0) return null;

  const pairs = getAutoPairs();
  const before = normalized.value[normalized.selectionStart - 1];
  const after = normalized.value[normalized.selectionStart];
  if (!before || pairs[before] !== after) return null;

  const value = `${normalized.value.slice(0, normalized.selectionStart - 1)}${normalized.value.slice(normalized.selectionStart + 1)}`;
  const cursor = normalized.selectionStart - 1;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function getAutoPairs(): Record<string, string> {
  return {
    "(": ")",
    "[": "]",
    "{": "}",
    "\"": "\"",
    "'": "'",
    "`": "`",
    "$": "$",
    "（": "）",
    "【": "】",
    "《": "》",
    "「": "」",
    "『": "』",
    "“": "”",
    "‘": "’",
  };
}

function getSelectedOnlyAutoPairs(): Record<string, string> {
  return {
    "*": "*",
    "_": "_",
    "~": "~",
  };
}

export function outdentMarkdownListOnBackspace(state: TextState, indentSize = 2): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd || normalized.selectionStart <= 0) return null;

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (isInsideMarkdownRawBlock(normalized.value, range.lineStart)) return null;

  const line = range.value.slice(range.lineStart, range.normalizedEnd);
  const quotedResult = outdentQuotedMarkdownListOnBackspace(normalized, range, line, indentSize);
  if (quotedResult) return quotedResult;

  const match = line.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
  if (!match) return null;
  const lines = range.value.split("\n");
  const lineIndex = findLineIndex(lines, range.lineStart);
  if (!isMarkdownListMarkerIndentAllowed(lines, lineIndex, "", match[1])) return null;

  const contentStart = range.lineStart + match[0].length;
  if (normalized.selectionStart !== contentStart) return null;

  if (!match[1]) {
    let value = `${range.value.slice(0, range.lineStart)}${line.slice(match[0].length)}${range.value.slice(range.normalizedEnd)}`;
    const number = match[2].match(/^(\d+)([.)])$/);
    if (number) {
      const startLine = findLineIndex(value.split("\n"), range.lineStart) + 1;
      value = renumberOrderedListLines(value, startLine, match[1], normalizeOrderedListNumber(number[1]), number[2]);
    }
    return { value, selectionStart: range.lineStart, selectionEnd: range.lineStart };
  }

  const removed = getSingleIndentRemoval(match[1], indentSize);
  let value = `${range.value.slice(0, range.lineStart)}${line.slice(removed)}${range.value.slice(range.normalizedEnd)}`;
  let cursor = normalized.selectionStart - removed;
  const number = match[2].match(/^(\d+)([.)])$/);
  if (number) {
    const lineIndex = findLineIndex(value.split("\n"), range.lineStart);
    const baseStartNumber = getOrderedListStartNumberAtLine(normalized.value, lineIndex);
    value = renumberOrderedListBlockAtLine(value, lineIndex, baseStartNumber ?? undefined);
    const lines = value.split("\n");
    const marker = lines[lineIndex]?.match(/^(\s*)(\d+[.)]\s+(?:\[[ xX]\]\s+)?)/);
    if (marker) {
      cursor = getLineStartOffset(lines, lineIndex) + marker[0].length;
    }
  }
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function outdentQuotedMarkdownListOnBackspace(
  state: TextState,
  range: LineRange,
  line: string,
  indentSize: number,
): TextEditResult | null {
  const quoted = matchQuotedList(line);
  if (!quoted) return null;
  const lines = state.value.split("\n");
  const lineIndex = findLineIndex(lines, range.lineStart);
  if (!isMarkdownListMarkerIndentAllowed(lines, lineIndex, quoted.quotePrefix, quoted.listIndent)) return null;

  const contentStart = range.lineStart + quoted.markerEnd;
  if (state.selectionStart !== contentStart) return null;

  if (quoted.listIndent) {
    const removed = getSingleIndentRemoval(quoted.listIndent, indentSize);
    const nextLine = `${quoted.quotePrefix}${line.slice(quoted.rawQuoteLength + removed)}`;
    let value = `${range.value.slice(0, range.lineStart)}${nextLine}${range.value.slice(range.normalizedEnd)}`;
    let cursor = range.lineStart + `${quoted.quotePrefix}${line.slice(quoted.rawQuoteLength + removed, quoted.markerEnd)}`.length;
    const number = quoted.marker.match(/^(\d+)([.)])$/);
    if (number) {
      const lineIndex = findLineIndex(value.split("\n"), range.lineStart);
      value = renumberOrderedListBlockAtLine(value, lineIndex);
      const lines = value.split("\n");
      const renumbered = matchQuotedList(lines[lineIndex] ?? "");
      if (renumbered) {
        cursor = getLineStartOffset(lines, lineIndex) + renumbered.markerEnd;
      }
    }
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  let value = `${range.value.slice(0, range.lineStart)}${quoted.quotePrefix}${line.slice(quoted.markerEnd)}${range.value.slice(range.normalizedEnd)}`;
  const number = quoted.marker.match(/^(\d+)([.)])$/);
  if (number) {
    const startLine = findLineIndex(value.split("\n"), range.lineStart) + 1;
    value = renumberQuotedOrderedListLines(value, startLine, quoted.quotePrefix, quoted.listIndent, normalizeOrderedListNumber(number[1]), number[2]);
  }

  const cursor = range.lineStart + quoted.quotePrefix.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function unwrapMarkdownBlockOnBackspace(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;

  const frontMatter = unwrapMarkdownFrontMatterOnBackspace(normalized);
  if (frontMatter) return frontMatter;

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (isInsideMarkdownRawBlock(normalized.value, range.lineStart)) return null;

  const line = range.value.slice(range.lineStart, range.normalizedEnd);
  const heading = getMarkdownAtxHeadingPattern(range.value, normalized.selectionStart);
  if (heading && normalized.selectionStart === heading.contentStart) {
    const content = range.value.slice(heading.contentStart, heading.contentEnd);
    const replacement = `${heading.plainPrefix}${content}`;
    const value = `${range.value.slice(0, heading.lineStart)}${replacement}${range.value.slice(heading.lineEnd)}`;
    const cursor = heading.lineStart + heading.plainPrefix.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const setext = getMarkdownSetextHeadingPattern(range.value, normalized.selectionStart);
  const legacySetext = findSetextHeadingRange(range.value, range.lineStart, range.normalizedEnd);
  if (
    setext
    && (
      normalized.selectionStart === setext.contentStart
      || normalized.selectionStart === legacySetext?.underlineStart
    )
  ) {
    const titleEnd = setext.contentEnd + setext.titleSuffix.length;
    const value = `${range.value.slice(0, titleEnd)}${sliceAfterRemovedLinePreservingBreak(range.value, setext.headingEnd)}`;
    const cursor = normalized.selectionStart === setext.contentStart ? setext.contentStart : titleEnd;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const definitionMarker = matchDefinitionListMarkerLine(line);
  if (definitionMarker) {
    const contentStart = range.lineStart + definitionMarker.markerEnd;
    if (normalized.selectionStart !== contentStart) return null;

    const replacement = `${definitionMarker.quotePrefix}${definitionMarker.indent}${line.slice(definitionMarker.markerEnd)}`;
    const value = `${range.value.slice(0, range.lineStart)}${replacement}${range.value.slice(range.normalizedEnd)}`;
    const cursor = range.lineStart + definitionMarker.quotePrefix.length + definitionMarker.indent.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const footnote = matchFootnoteDefinitionLine(line);
  if (footnote) {
    const contentStart = range.lineStart + footnote.markerEnd;
    if (normalized.selectionStart !== contentStart) return null;

    const replacement = `${footnote.quotePrefix}${footnote.indent}${line.slice(footnote.markerEnd)}`;
    const value = `${range.value.slice(0, range.lineStart)}${replacement}${range.value.slice(range.normalizedEnd)}`;
    const cursor = range.lineStart + footnote.quotePrefix.length + footnote.indent.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const lines = normalized.value.split("\n");
  const lineIndex = findLineIndex(lines, range.lineStart);
  const definitionContinuation = matchDefinitionListContinuationLine(line);
  if (definitionContinuation && isInsideDefinitionList(lines, lineIndex, definitionContinuation.quotePrefix)) {
    const contentStart = range.lineStart + definitionContinuation.rawQuoteLength + definitionContinuation.indent.length;
    if (normalized.selectionStart !== contentStart) return null;

    const replacement = `${definitionContinuation.quotePrefix}${line.slice(definitionContinuation.rawQuoteLength + definitionContinuation.indent.length)}`;
    const value = `${range.value.slice(0, range.lineStart)}${replacement}${range.value.slice(range.normalizedEnd)}`;
    const cursor = range.lineStart + definitionContinuation.quotePrefix.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const footnoteContinuation = matchFootnoteContinuationLine(line);
  if (footnoteContinuation && isInsideFootnoteDefinition(lines, lineIndex, footnoteContinuation.quotePrefix)) {
    const contentStart = range.lineStart + footnoteContinuation.rawQuoteLength + footnoteContinuation.indent.length;
    if (normalized.selectionStart !== contentStart) return null;

    const replacement = `${footnoteContinuation.quotePrefix}${line.slice(footnoteContinuation.rawQuoteLength + footnoteContinuation.indent.length)}`;
    const value = `${range.value.slice(0, range.lineStart)}${replacement}${range.value.slice(range.normalizedEnd)}`;
    const cursor = range.lineStart + footnoteContinuation.quotePrefix.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const listContinuation = matchListContinuationLine(line);
  if (listContinuation && isInsideMarkdownList(lines, lineIndex, listContinuation.quotePrefix, listContinuation.indent)) {
    const contentStart = range.lineStart + listContinuation.rawQuoteLength + listContinuation.indent.length;
    if (normalized.selectionStart !== contentStart) return null;

    const replacement = `${listContinuation.quotePrefix}${line.slice(listContinuation.rawQuoteLength + listContinuation.indent.length)}`;
    const value = `${range.value.slice(0, range.lineStart)}${replacement}${range.value.slice(range.normalizedEnd)}`;
    const cursor = range.lineStart + listContinuation.quotePrefix.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const quote = line.match(/^(\s*)((?:>\s*)+)/);
  if (!quote) return null;

  const contentStart = range.lineStart + quote[0].length;
  if (normalized.selectionStart !== contentStart) return null;

  const markers = quote[2].match(/>\s*/g) ?? [];
  const replacement = markers.length > 1 ? `${quote[1]}${"> ".repeat(markers.length - 1)}` : quote[1];
  const nextLine = `${replacement}${line.slice(quote[0].length)}`;
  const value = `${range.value.slice(0, range.lineStart)}${nextLine}${range.value.slice(range.normalizedEnd)}`;
  const cursor = range.lineStart + replacement.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function editMarkdownTable(state: TextState, kind: "row" | "column"): TextEditResult {
  return kind === "row"
    ? insertMarkdownTableRow(state, "below")
    : insertMarkdownTableColumn(state, "right");
}

export function insertMarkdownTableTemplate(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const normalizedTemplate = normalizeGeneratedLineBreaks(tableTemplate, lineBreak);
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${normalizedTemplate}${normalized.value.slice(normalized.selectionEnd)}`;
  const firstHeader = "列 1";
  const headerOffset = normalizedTemplate.indexOf(firstHeader);
  const selectionStart = normalized.selectionStart + (headerOffset >= 0 ? headerOffset : normalizedTemplate.length);
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + (headerOffset >= 0 ? firstHeader.length : 0),
  };
}

export function insertMarkdownCalloutTemplate(state: TextState, kind?: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const calloutKind = normalizeMarkdownCalloutKind(kind);
  const chunks = collectLineChunks(normalized.value);
  const selectedLines = getSelectedLineIndexes(
    chunks,
    normalized.selectionStart,
    normalized.selectionEnd,
  );
  const existing = findMarkdownCalloutBlock(chunks, selectedLines.start, selectedLines.end);

  if (existing) {
    return existing.kind === calloutKind
      ? unwrapMarkdownCallout(normalized, chunks, existing)
      : replaceMarkdownCalloutKind(normalized, chunks, existing, calloutKind);
  }

  return wrapMarkdownLinesAsCallout(normalized, chunks, selectedLines, calloutKind);
}

function createMarkdownCalloutTemplate(kind: MarkdownCalloutKind): string {
  return `\n> [!${kind}]\n> \n`;
}

function normalizeMarkdownCalloutKind(kind?: string): MarkdownCalloutKind {
  const normalized = kind?.trim().toUpperCase() as MarkdownCalloutKind | undefined;
  return normalized && markdownCalloutKinds.has(normalized) ? normalized : "NOTE";
}

interface MarkdownCalloutHeader {
  kind: MarkdownCalloutKind;
  kindStart: number;
  kindEnd: number;
  quoteDepth: number;
  quotePrefix: string;
}

interface MarkdownCalloutBlock extends MarkdownCalloutHeader {
  headerIndex: number;
  endIndex: number;
}

interface TextRemoval {
  start: number;
  end: number;
}

interface TextInsertion {
  offset: number;
  text: string;
  priority: number;
}

function findMarkdownCalloutBlock(
  chunks: string[],
  selectionStartLine: number,
  selectionEndLine: number,
): MarkdownCalloutBlock | null {
  for (let headerIndex = selectionStartLine; headerIndex >= 0; headerIndex -= 1) {
    const header = parseMarkdownCalloutHeader(chunks[headerIndex] ?? "");
    if (!header) continue;
    const endIndex = findMarkdownCalloutEnd(chunks, headerIndex, header.quoteDepth);
    if (selectionStartLine >= headerIndex && selectionEndLine <= endIndex) {
      return { ...header, headerIndex, endIndex };
    }
  }
  return null;
}

function parseMarkdownCalloutHeader(chunk: string): MarkdownCalloutHeader | null {
  const body = stripLineBreak(chunk);
  const quote = parseQuotePrefix(body);
  if (!quote) return null;
  const content = body.slice(quote.rawLength);
  const match = content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i);
  if (!match || match.index === undefined) return null;
  const markerStart = quote.rawLength + match.index;
  const kindStart = markerStart + match[0].indexOf(match[1]);
  return {
    kind: match[1].toUpperCase() as MarkdownCalloutKind,
    kindStart,
    kindEnd: kindStart + match[1].length,
    quoteDepth: countMarkdownQuoteDepth(body),
    quotePrefix: body.slice(0, quote.rawLength),
  };
}

function findMarkdownCalloutEnd(chunks: string[], headerIndex: number, quoteDepth: number): number {
  let endIndex = headerIndex;
  for (let index = headerIndex + 1; index < chunks.length; index += 1) {
    const body = stripLineBreak(chunks[index] ?? "");
    if (countMarkdownQuoteDepth(body) < quoteDepth) break;
    const nextHeader = parseMarkdownCalloutHeader(chunks[index] ?? "");
    if (nextHeader && nextHeader.quoteDepth === quoteDepth) break;
    endIndex = index;
  }
  return endIndex;
}

function replaceMarkdownCalloutKind(
  state: TextState,
  chunks: string[],
  block: MarkdownCalloutBlock,
  kind: MarkdownCalloutKind,
): TextEditResult {
  const headerStart = getChunkStartOffset(chunks, block.headerIndex);
  const kindStart = headerStart + block.kindStart;
  const kindEnd = headerStart + block.kindEnd;
  const value = `${state.value.slice(0, kindStart)}${kind}${state.value.slice(kindEnd)}`;
  return {
    value,
    selectionStart: mapOffsetAfterTextReplacement(state.selectionStart, kindStart, kindEnd, kind.length),
    selectionEnd: mapOffsetAfterTextReplacement(state.selectionEnd, kindStart, kindEnd, kind.length),
  };
}

function unwrapMarkdownCallout(
  state: TextState,
  chunks: string[],
  block: MarkdownCalloutBlock,
): TextEditResult {
  const removals: TextRemoval[] = [];
  const headerStart = getChunkStartOffset(chunks, block.headerIndex);
  removals.push({ start: headerStart, end: getChunkEndOffset(chunks, block.headerIndex) });

  for (let index = block.headerIndex + 1; index <= block.endIndex; index += 1) {
    const chunkStart = getChunkStartOffset(chunks, index);
    const quoteMarker = getMarkdownQuoteMarkerRange(stripLineBreak(chunks[index] ?? ""), block.quoteDepth);
    if (quoteMarker) {
      removals.push({
        start: chunkStart + quoteMarker.start,
        end: chunkStart + quoteMarker.end,
      });
    }
  }

  return applyTextRemovals(state, removals);
}

function wrapMarkdownLinesAsCallout(
  state: TextState,
  chunks: string[],
  selectedLines: { start: number; end: number },
  kind: MarkdownCalloutKind,
): TextEditResult {
  const selectedBodies = chunks
    .slice(selectedLines.start, selectedLines.end + 1)
    .map(stripLineBreak);
  const nonBlankBodies = selectedBodies.filter((line) => line.trim());
  const allQuoted = nonBlankBodies.length > 0
    && nonBlankBodies.every((line) => Boolean(parseQuotePrefix(line)));
  const firstBody = selectedBodies[0] ?? "";
  const firstQuotedBody = allQuoted
    ? nonBlankBodies.find((line) => Boolean(parseQuotePrefix(line))) ?? ""
    : "";
  const firstQuote = firstQuotedBody ? parseQuotePrefix(firstQuotedBody) : null;
  const leading = firstBody.match(/^[ \t]*/)?.[0] ?? "";
  const headerPrefix = firstQuote
    ? firstQuotedBody.slice(0, firstQuote.rawLength)
    : `${leading}> `;
  const lineBreak = getPreferredLineBreak(state.value);
  const rangeStart = getChunkStartOffset(chunks, selectedLines.start);
  const insertions: TextInsertion[] = [{
    offset: rangeStart,
    text: `${headerPrefix}[!${kind}]${lineBreak}`,
    priority: 0,
  }];

  if (allQuoted) {
    for (let index = selectedLines.start; index <= selectedLines.end; index += 1) {
      const body = stripLineBreak(chunks[index] ?? "");
      if (!body.trim()) {
        insertions.push({
          offset: getChunkStartOffset(chunks, index),
          text: headerPrefix.trimEnd(),
          priority: 1,
        });
      }
    }
  } else {
    for (let index = selectedLines.start; index <= selectedLines.end; index += 1) {
      const body = stripLineBreak(chunks[index] ?? "");
      const indent = body.match(/^[ \t]*/)?.[0] ?? "";
      insertions.push({
        offset: getChunkStartOffset(chunks, index) + indent.length,
        text: "> ",
        priority: 1,
      });
    }
  }

  return applyTextInsertions(state, insertions);
}

function countMarkdownQuoteDepth(line: string): number {
  const quote = parseQuotePrefix(line);
  return quote ? (quote.normalized.match(/>/g) ?? []).length : 0;
}

function getMarkdownQuoteMarkerRange(
  line: string,
  depth: number,
): { start: number; end: number } | null {
  let cursor = line.match(/^[ \t]*/)?.[0].length ?? 0;
  for (let currentDepth = 1; currentDepth <= depth; currentDepth += 1) {
    if (line[cursor] !== ">") return null;
    const start = cursor;
    cursor += 1;
    if (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    if (currentDepth === depth) return { start, end: cursor };
  }
  return null;
}

function applyTextRemovals(state: TextState, removals: TextRemoval[]): TextEditResult {
  const ordered = [...removals].sort((left, right) => left.start - right.start);
  let cursor = 0;
  let value = "";
  for (const removal of ordered) {
    value += state.value.slice(cursor, removal.start);
    cursor = removal.end;
  }
  value += state.value.slice(cursor);
  return {
    value,
    selectionStart: mapOffsetAfterTextRemovals(state.selectionStart, ordered),
    selectionEnd: mapOffsetAfterTextRemovals(state.selectionEnd, ordered),
  };
}

function mapOffsetAfterTextRemovals(offset: number, removals: TextRemoval[]): number {
  let removed = 0;
  for (const removal of removals) {
    if (offset <= removal.start) break;
    if (offset < removal.end) return removal.start - removed;
    removed += removal.end - removal.start;
  }
  return offset - removed;
}

function applyTextInsertions(state: TextState, insertions: TextInsertion[]): TextEditResult {
  const ordered = [...insertions].sort(
    (left, right) => left.offset - right.offset || left.priority - right.priority,
  );
  let value = state.value;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const insertion = ordered[index];
    value = `${value.slice(0, insertion.offset)}${insertion.text}${value.slice(insertion.offset)}`;
  }
  return {
    value,
    selectionStart: mapOffsetAfterTextInsertions(state.selectionStart, ordered),
    selectionEnd: mapOffsetAfterTextInsertions(state.selectionEnd, ordered),
  };
}

function mapOffsetAfterTextInsertions(offset: number, insertions: TextInsertion[]): number {
  return offset + insertions.reduce(
    (added, insertion) => added + (insertion.offset <= offset ? insertion.text.length : 0),
    0,
  );
}

function mapOffsetAfterTextReplacement(
  offset: number,
  start: number,
  end: number,
  replacementLength: number,
): number {
  if (offset <= start) return offset;
  if (offset >= end) return offset + replacementLength - (end - start);
  return start + Math.min(offset - start, replacementLength);
}

export function insertMarkdownHorizontalRule(state: TextState): TextEditResult {
  return insertStandaloneMarkdownBlock(state, "---");
}

export function insertMarkdownTocTemplate(state: TextState): TextEditResult {
  return insertStandaloneMarkdownBlock(state, "[TOC]");
}

export function insertMarkdownFootnoteTemplate(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd);
  const noteContent = selected || footnotePlaceholder;
  const id = getNextFootnoteId(normalized.value);
  const reference = `[^${id}]`;
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const body = `${before}${reference}${after}`;
  const appendBreak = getFootnoteAppendBreak(body, lineBreak);
  const definitionPrefix = `[^${id}]: `;
  const value = `${body}${appendBreak}${definitionPrefix}${noteContent}`;
  const selectionStart = body.length + appendBreak.length + definitionPrefix.length;
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + noteContent.length,
  };
}

function insertStandaloneMarkdownBlock(state: TextState, block: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const leadingBreak = before
    ? before.endsWith(`${lineBreak}${lineBreak}`) || before.endsWith("\n\n")
      ? ""
      : before.endsWith("\n")
        ? lineBreak
        : `${lineBreak}${lineBreak}`
    : "";
  const trailingBreak = after
    ? startsWithLineBreak(after)
      ? lineBreak
      : `${lineBreak}${lineBreak}`
    : lineBreak;
  const inserted = `${leadingBreak}${block}${trailingBreak}`;
  const value = `${before}${inserted}${after}`;
  const cursor = before.length + leadingBreak.length + block.length + lineBreak.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function getNextFootnoteId(value: string): number {
  const used = new Set<number>();
  const pattern = /\[\^([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)](?::)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const numeric = Number(match[1]);
    if (Number.isInteger(numeric) && numeric > 0) {
      used.add(numeric);
    }
  }

  let next = 1;
  while (used.has(next)) next += 1;
  return next;
}

function getFootnoteAppendBreak(value: string, lineBreak: "\n" | "\r\n"): string {
  if (!value) return "";
  if (value.endsWith(`${lineBreak}${lineBreak}`) || value.endsWith("\n\n")) return "";
  if (value.endsWith("\n")) return lineBreak;
  return `${lineBreak}${lineBreak}`;
}

export function insertMarkdownTableRow(
  state: TextState,
  position: MarkdownTableRowPosition,
  content = "内容",
): TextEditResult {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) {
    return insertMarkdownTableTemplate(normalized);
  }

  const lines = normalized.value.split("\n");
  const columns = splitTableRow(lines[table.start]).length;
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const rowRange = getSelectedTableBodyRowRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const columnIndex = columnRange.start;
  const rawInsertAt = rowRange
    ? position === "above" ? rowRange.start : rowRange.end + 1
    : position === "above" ? table.lineIndex : table.lineIndex + 1;
  const insertAt = Math.min(table.end + 1, Math.max(table.separator + 1, rawInsertAt));
  insertLinePreservingBreak(
    normalized.value,
    lines,
    insertAt,
    `${table.prefix}${buildTableRow(Array.from({ length: columns }, () => content), table.rowFormat)}`,
  );
  const value = lines.join("\n");
  const cellRange = getTableCellContentRange(lines[insertAt] ?? "", columnIndex, getLineStartOffset(lines, insertAt), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function insertMarkdownTableColumn(
  state: TextState,
  position: MarkdownTableColumnPosition,
): TextEditResult {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) {
    return insertMarkdownTableTemplate(normalized);
  }

  const lines = normalized.value.split("\n");
  const headerCells = splitTableRow(lines[table.start]);
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const insertAt = position === "left" ? columnRange.start : columnRange.end + 1;

  for (let index = table.start; index <= table.end; index += 1) {
    const cells = splitTableRow(lines[index]);
    padTableCells(cells, headerCells.length, index === table.separator ? "---" : "");
    cells.splice(insertAt, 0, index === table.start ? "新列" : index === table.separator ? "---" : "内容");
    lines[index] = withExistingLineEnding(lines[index], `${table.prefix}${buildTableRow(cells, table.rowFormat)}`);
  }

  const value = lines.join("\n");
  const targetLine = table.lineIndex === table.separator ? table.start : table.lineIndex;
  const cellRange = getTableCellContentRange(lines[targetLine] ?? "", insertAt, getLineStartOffset(lines, targetLine), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function deleteMarkdownTablePart(state: TextState, kind: "row" | "column"): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const columnIndex = columnRange.start;
  if (kind === "row") {
    const rowRange = getSelectedTableBodyRowRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
    if (!rowRange) return null;
    if (table.end - table.start <= 1) return null;

    lines.splice(rowRange.start, rowRange.end - rowRange.start + 1);
    const nextLine = Math.min(rowRange.start, lines.length - 1);
    const targetLine = nextLine === table.separator ? table.start : nextLine;
    const value = lines.join("\n");
    const cellRange = getTableCellContentRange(lines[targetLine] ?? "", columnIndex, getLineStartOffset(lines, targetLine), table.rowFormat);
    return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
  }

  const headerCells = splitTableRow(lines[table.start]);
  const deleteCount = columnRange.end - columnRange.start + 1;
  if (headerCells.length <= 1 || deleteCount >= headerCells.length || columnIndex < 0 || columnIndex >= headerCells.length) return null;

  for (let index = table.start; index <= table.end; index += 1) {
    const cells = splitTableRow(lines[index]);
    padTableCells(cells, headerCells.length, index === table.separator ? "---" : "");
    cells.splice(columnRange.start, deleteCount);
    lines[index] = withExistingLineEnding(lines[index], `${table.prefix}${buildTableRow(cells, table.rowFormat)}`);
  }

  const value = lines.join("\n");
  const targetLine = table.lineIndex === table.separator ? table.start : table.lineIndex;
  const targetColumn = Math.min(columnIndex, Math.max(0, splitTableRow(lines[table.start]).length - 1));
  const cellRange = getTableCellContentRange(lines[targetLine] ?? "", targetColumn, getLineStartOffset(lines, targetLine), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function moveMarkdownTableRow(
  state: TextState,
  direction: MarkdownTableRowMoveDirection,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const rowRange = getSelectedTableBodyRowRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  if (!rowRange) return null;

  const targetIndex = direction === "up" ? rowRange.start - 1 : rowRange.end + 1;
  if (targetIndex <= table.separator || targetIndex > table.end) return null;

  const lineEndings = lines.map((line) => splitCarriageReturnEnding(line).ending);
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const columnIndex = columnRange.start;
  if (direction === "up") {
    const previous = lines[targetIndex];
    const moved = lines.splice(rowRange.start, rowRange.end - rowRange.start + 1);
    lines.splice(targetIndex, 1, ...moved, previous);
  } else {
    const next = lines[targetIndex];
    const moved = lines.splice(rowRange.start, rowRange.end - rowRange.start + 1);
    lines.splice(rowRange.start, 1, next, ...moved);
  }
  restoreLineEndingsByIndex(lines, lineEndings);

  const value = lines.join("\n");
  const nextLine = direction === "up" ? rowRange.start - 1 : rowRange.start + 1;
  const cellRange = getTableCellContentRange(lines[nextLine] ?? "", columnIndex, getLineStartOffset(lines, nextLine), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function moveMarkdownTableColumn(
  state: TextState,
  direction: MarkdownTableColumnMoveDirection,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const headerCells = splitTableRow(lines[table.start]);
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const moveCount = columnRange.end - columnRange.start + 1;
  const targetStart = direction === "left" ? columnRange.start - 1 : columnRange.end + 1;
  if (targetStart < 0 || targetStart >= headerCells.length) return null;

  for (let index = table.start; index <= table.end; index += 1) {
    const cells = splitTableRow(lines[index]);
    padTableCells(cells, headerCells.length, index === table.separator ? "---" : "");
    if (direction === "left") {
      const previous = cells[columnRange.start - 1];
      const moved = cells.splice(columnRange.start, moveCount);
      cells.splice(columnRange.start - 1, 1, ...moved, previous);
    } else {
      const next = cells[columnRange.end + 1];
      const moved = cells.splice(columnRange.start, moveCount);
      cells.splice(columnRange.start, 1, next, ...moved);
    }
    lines[index] = withExistingLineEnding(lines[index], `${table.prefix}${buildTableRow(cells, table.rowFormat)}`);
  }

  const value = lines.join("\n");
  const targetLine = table.lineIndex === table.separator ? table.start : table.lineIndex;
  const targetColumn = direction === "left" ? columnRange.start - 1 : columnRange.start + 1;
  const cellRange = getTableCellContentRange(lines[targetLine] ?? "", targetColumn, getLineStartOffset(lines, targetLine), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function selectMarkdownTablePart(state: TextState, kind: MarkdownTableSelectionKind): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  if (kind === "table") {
    return {
      value: normalized.value,
      selectionStart: getLineStartOffset(lines, table.start),
      selectionEnd: getLineContentEndOffset(lines, table.end),
    };
  }

  if (kind === "cell") {
    const cell = getCurrentTableCellRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
    return cell ? { value: normalized.value, selectionStart: cell.start, selectionEnd: cell.end } : null;
  }

  if (kind === "row") {
    const rowRange = getSelectedTableRowRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
    return {
      value: normalized.value,
      selectionStart: getLineStartOffset(lines, rowRange.start),
      selectionEnd: getLineContentEndOffset(lines, rowRange.end),
    };
  }

  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const firstCell = getTableCellContentRange(lines[table.start] ?? "", columnRange.start, getLineStartOffset(lines, table.start), table.rowFormat);
  const lastCell = getTableCellContentRange(lines[table.end] ?? "", columnRange.end, getLineStartOffset(lines, table.end), table.rowFormat);
  return {
    value: normalized.value,
    selectionStart: firstCell.start,
    selectionEnd: lastCell.end,
  };
}

export function deleteMarkdownTable(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const deleteStart = getLineStartOffset(lines, table.start);
  const deleteEnd = getTableEndOffset(lines, table);
  const value = `${normalized.value.slice(0, deleteStart)}${normalized.value.slice(deleteEnd)}`;
  const cursor = Math.min(deleteStart, value.length);
  return {
    value,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

export function alignMarkdownTable(state: TextState, align: "left" | "center" | "right"): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const cells = splitTableRow(lines[table.separator]);
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const headerCells = splitTableRow(lines[table.start]);
  padTableCells(cells, headerCells.length, "---");
  const marker = align === "left" ? ":---" : align === "right" ? "---:" : ":---:";
  for (let column = columnRange.start; column <= columnRange.end; column += 1) {
    cells[column] = marker;
  }
  lines[table.separator] = withExistingLineEnding(lines[table.separator], `${table.prefix}${buildTableRow(cells, table.rowFormat)}`);
  return { value: lines.join("\n"), selectionStart: normalized.selectionStart, selectionEnd: normalized.selectionEnd };
}

function padTableCells(cells: string[], length: number, filler: string): void {
  while (cells.length < length) {
    cells.push(filler);
  }
}

function stripTablePipesForPlainText(line: string): string {
  const context = getTableLineContext(line);
  if (!isTableRowContent(context.content)) return line;
  const cells = splitTableRow(line);
  return `${context.prefix}${cells.map(formatPlainTextTableCell).join(" | ")}`;
}

function isPlainTextTableSeparatorLine(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  const context = getTableLineContext(line);
  if (!isTableSeparatorContent(context.content)) return false;

  const previous = lines[index - 1];
  const next = lines[index + 1];
  return isPlainTextTableContentLine(previous) || isPlainTextTableContentLine(next);
}

function isPlainTextTableContentLine(line: string | undefined): boolean {
  if (line === undefined) return false;
  const context = getTableLineContext(line);
  return isTableRowContent(context.content) && !isTableSeparatorContent(context.content);
}

function formatPlainTextTableCell(cell: string): string {
  return cell.replace(/\\\|/g, "|");
}

function restoreLineEndingsByIndex(lines: string[], endings: Array<"" | "\r">): void {
  for (let index = 0; index < lines.length; index += 1) {
    const { body } = splitCarriageReturnEnding(lines[index] ?? "");
    lines[index] = `${body}${endings[index] ?? ""}`;
  }
}

export function navigateMarkdownTableCell(
  state: TextState,
  direction: MarkdownTableCellDirection,
): TextEditResult | null {
  const table = findTableRange(state.value, state.selectionStart);
  if (!table) return null;

  const lines = state.value.split("\n");
  const headerCells = splitTableRow(lines[table.start]);
  const columnIndex = getActiveTableColumnIndex(lines, table, state.selectionStart);
  const target = findNavigableTableCell(lines, table, columnIndex, direction);
  if (!target) return normalizeSelection(state);

  const nextLines = [...lines];
  let targetLine = target.line;
  if (target.addRow) {
    targetLine = table.end + 1;
    insertLinePreservingBreak(
      state.value,
      nextLines,
      targetLine,
      `${table.prefix}${buildTableRow(Array.from({ length: headerCells.length }, () => ""), table.rowFormat)}`,
    );
  } else if (targetLine !== table.separator) {
    const cells = splitTableRow(nextLines[targetLine] ?? "");
    if (cells.length < headerCells.length) {
      nextLines[targetLine] = withExistingLineEnding(nextLines[targetLine], `${table.prefix}${buildTableRow([
        ...cells,
        ...Array.from({ length: headerCells.length - cells.length }, () => ""),
      ], table.rowFormat)}`);
    }
  }

  const value = nextLines.join("\n");
  const cellRange = getTableCellContentRange(nextLines[targetLine] ?? "", target.column, getLineStartOffset(nextLines, targetLine), table.rowFormat);
  return {
    value,
    selectionStart: cellRange.start,
    selectionEnd: cellRange.end,
  };
}

export function setImageWidthInLine(state: TextState, width: string): TextEditResult | null {
  const range = getLineRange(state.value, state.selectionStart, state.selectionEnd);
  const line = range.value.slice(range.lineStart, range.normalizedEnd);
  const size = normalizeImageWidth(width);
  const selectionStart = range.start - range.lineStart;
  const selectionEnd = range.end - range.lineStart;
  const selectedHtmlImage = findHtmlImageInLine(line, selectionStart, selectionEnd, false);
  if (selectedHtmlImage) return setHtmlImageWidthInLine(range, line, selectedHtmlImage, size);

  const image = findMarkdownImageInLine(
    line,
    selectionStart,
    selectionEnd,
    false,
  );
  if (image) return setMarkdownImageWidthInLine(range, line, image, size);

  const htmlImage = findHtmlImageInLine(line, selectionStart, selectionEnd);
  if (htmlImage) return setHtmlImageWidthInLine(range, line, htmlImage, size);

  const fallbackImage = findMarkdownImageInLine(line, selectionStart, selectionEnd);
  if (!fallbackImage) return null;

  return setMarkdownImageWidthInLine(range, line, fallbackImage, size);
}

function setHtmlImageWidthInLine(
  range: LineRange,
  line: string,
  image: { start: number; end: number; tag: string },
  size: string,
): TextEditResult {
  const nextTag = setHtmlImageWidth(image.tag, size);
  const nextLine = `${line.slice(0, image.start)}${nextTag}${line.slice(image.end)}`;
  const value = `${range.value.slice(0, range.lineStart)}${nextLine}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + image.start,
    selectionEnd: range.lineStart + image.start + nextTag.length,
  };
}

function setMarkdownImageWidthInLine(
  range: LineRange,
  line: string,
  image: MarkdownImageMatch,
  size: string,
): TextEditResult {
  const titleAttribute = image.title ? ` title="${escapeAttribute(image.title)}"` : "";
  const nextTag = `<img src="${escapeAttribute(image.source)}" alt="${escapeAttribute(image.alt)}" width="${escapeAttribute(size)}"${titleAttribute}>`;
  const nextLine = `${line.slice(0, image.start)}${nextTag}${line.slice(image.end)}`;
  const value = `${range.value.slice(0, range.lineStart)}${nextLine}${range.value.slice(range.normalizedEnd)}`;
  return {
    value,
    selectionStart: range.lineStart + image.start,
    selectionEnd: range.lineStart + image.start + nextTag.length,
  };
}

function findHtmlImageInLine(
  line: string,
  selectionStart: number,
  selectionEnd: number,
  fallback = true,
): { start: number; end: number; tag: string } | null {
  const images: Array<{ start: number; end: number; tag: string }> = [];
  const matcher = /<img\b[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(line))) {
    images.push({
      start: match.index,
      end: match.index + match[0].length,
      tag: match[0],
    });
  }

  if (images.length === 0) return null;

  const selected = images.find((image) => (
    selectionStart === selectionEnd
      ? selectionStart >= image.start && selectionStart <= image.end
      : selectionStart < image.end && selectionEnd > image.start
  ));
  return selected ?? (fallback ? images[0] : null);
}

function findMarkdownImageInLine(
  line: string,
  selectionStart: number,
  selectionEnd: number,
  fallback = true,
): MarkdownImageMatch | null {
  const images: MarkdownImageMatch[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const open = line.indexOf("[", cursor);
    if (open < 0) break;

    const link = readMarkdownInlineLink(line, open);
    if (!link || link.imageStart === null) {
      cursor = open + 1;
      continue;
    }

    const parsed = parseMarkdownImageDestination(line, link);
    if (parsed) {
      images.push(parsed);
    }
    cursor = link.end;
  }

  if (images.length === 0) return null;

  const selected = images.find((image) => (
    selectionStart === selectionEnd
      ? selectionStart >= image.start && selectionStart <= image.end
      : selectionStart < image.end && selectionEnd > image.start
  ));
  return selected ?? (fallback ? images[0] : null);
}

function parseMarkdownImageDestination(
  line: string,
  link: {
    start: number;
    end: number;
    labelStart: number;
    labelEnd: number;
    imageStart: number | null;
    label: string;
  },
): MarkdownImageMatch | null {
  if (link.imageStart === null) return null;
  const body = line.slice(link.labelEnd + 2, link.end - 1).trim();
  const destination = parseMarkdownLinkDestination(body);
  if (!destination?.href) return null;

  return {
    start: link.imageStart,
    end: link.end,
    alt: link.label,
    source: destination.href,
    title: destination.title ?? "",
  };
}

function continueMarkdownQuotedList(state: TextState, indentSize: number): TextEditResult | null {
  const normalized = normalizeEmptyMarkdownListCursor(state, "quoted");
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd === -1 ? normalized.value.length : lineEnd;
  const line = normalized.value.slice(lineStart, normalized.selectionStart);
  const afterCursor = normalized.value.slice(normalized.selectionStart, normalizedLineEnd);
  const quote = parseQuotePrefix(line);
  const compact = quote
    ? getCompactNestedBulletList(line.slice(quote.rawLength))
    : null;
  if (quote && compact) {
    const lines = normalized.value.split("\n");
    const lineIndex = findLineIndex(lines, lineStart);
    if (!isMarkdownListMarkerIndentAllowed(
      lines,
      lineIndex,
      quote.normalized,
      compact.indent,
    )) return null;
    const normalizedIndentSize = indentSize === 4 ? 4 : 2;
    const continuationIndent = compact.indent
      + " ".repeat(normalizedIndentSize * compact.depth);
    if (!compact.content.trim() && !afterCursor.trim()) {
      const replacement = `${quote.normalized}${continuationIndent}`;
      const value = `${normalized.value.slice(0, lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
      const cursor = lineStart + replacement.length;
      return { value, selectionStart: cursor, selectionEnd: cursor };
    }
    return insertMarkdownAtSelection(
      normalized,
      `${lineBreak}${quote.normalized}${continuationIndent}${compact.marker} ${compact.taskMarker}`,
    );
  }
  const quoted = matchQuotedList(line);
  if (!quoted) return null;
  const lines = normalized.value.split("\n");
  const lineIndex = findLineIndex(lines, lineStart);
  if (!isMarkdownListMarkerIndentAllowed(lines, lineIndex, quoted.quotePrefix, quoted.listIndent)) return null;

  if (!quoted.content.trim() && !afterCursor.trim()) {
    const replacement = `${quoted.quotePrefix}${quoted.listIndent}`;
    let value = `${normalized.value.slice(0, lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
    const number = quoted.marker.match(/^(\d+)([.)])$/);
    if (number) {
      const startLine = findLineIndex(value.split("\n"), lineStart) + 1;
      value = renumberQuotedOrderedListLines(value, startLine, quoted.quotePrefix, quoted.listIndent, normalizeOrderedListNumber(number[1]), number[2]);
    }
    const cursor = lineStart + replacement.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  const number = quoted.marker.match(/^(\d+)([.)])$/);
  if (number) {
    const nextMarker = `${incrementOrderedListNumber(normalizeOrderedListNumber(number[1]))}${number[2]}`;
    const insertion = `${lineBreak}${quoted.quotePrefix}${quoted.listIndent}${nextMarker} ${quoted.taskMarker}`;
    const value = `${normalized.value.slice(0, normalized.selectionStart)}${insertion}${normalized.value.slice(normalized.selectionEnd)}`;
    const cursor = normalized.selectionStart + insertion.length;
    return {
      value: renumberQuotedOrderedListLines(
        value,
        findLineIndex(value.split("\n"), cursor) + 1,
        quoted.quotePrefix,
        quoted.listIndent,
        incrementOrderedListNumber(incrementOrderedListNumber(normalizeOrderedListNumber(number[1]))),
        number[2],
      ),
      selectionStart: cursor,
      selectionEnd: cursor,
    };
  }

  return insertMarkdownAtSelection(normalized, `${lineBreak}${quoted.quotePrefix}${quoted.listIndent}${quoted.marker} ${quoted.taskMarker}`);
}

function normalizeEmptyMarkdownListCursor(
  state: TextState,
  mode: "plain" | "quoted",
): TextState {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return normalized;

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  const nextLineBreak = normalized.value.indexOf("\n", normalized.selectionStart);
  const rawLineEnd = nextLineBreak === -1 ? normalized.value.length : nextLineBreak;
  const lineEnd = rawLineEnd > lineStart && normalized.value[rawLineEnd - 1] === "\r"
    ? rawLineEnd - 1
    : rawLineEnd;
  const line = normalized.value.slice(lineStart, lineEnd);

  let markerStart = -1;
  let markerEnd = -1;
  if (mode === "quoted") {
    const quoted = matchQuotedList(line);
    if (!quoted || quoted.content.trim()) return normalized;
    markerStart = lineStart + quoted.rawQuoteLength + quoted.listIndent.length;
    markerEnd = lineStart + quoted.markerEnd;
  } else {
    const list = line.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?$/);
    if (!list) return normalized;
    markerStart = lineStart + list[1].length;
    markerEnd = lineEnd;
  }

  if (normalized.selectionStart < markerStart || normalized.selectionStart > markerEnd) {
    return normalized;
  }
  return { ...normalized, selectionStart: lineEnd, selectionEnd: lineEnd };
}

function continueMarkdownDefinitionList(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const lines = normalized.value.split("\n");
  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd === -1 ? normalized.value.length : lineEnd;
  const lineIndex = findLineIndex(lines, lineStart);
  const line = normalized.value.slice(lineStart, normalized.selectionStart);
  const afterCursor = normalized.value.slice(normalized.selectionStart, normalizedLineEnd);
  const marker = matchDefinitionListMarkerLine(line);
  if (marker) {
    if (!marker.content.trim() && !afterCursor.trim()) {
      const replacement = `${marker.quotePrefix}${marker.indent}`;
      const value = `${normalized.value.slice(0, lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
      const cursor = lineStart + replacement.length;
      return { value, selectionStart: cursor, selectionEnd: cursor };
    }

    return insertMarkdownAtSelection(normalized, `${lineBreak}${marker.quotePrefix}${marker.indent}: `);
  }

  const continuation = matchDefinitionListContinuationLine(line);
  if (!continuation || !isInsideDefinitionList(lines, lineIndex, continuation.quotePrefix)) {
    return null;
  }

  if (!continuation.content.trim() && !afterCursor.trim()) {
    const replacement = continuation.quotePrefix;
    const value = `${normalized.value.slice(0, lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
    const cursor = lineStart + replacement.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  return insertMarkdownAtSelection(normalized, `${lineBreak}${continuation.quotePrefix}${continuation.indent}`);
}

function continueMarkdownListContinuation(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const lines = normalized.value.split("\n");
  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd === -1 ? normalized.value.length : lineEnd;
  const lineIndex = findLineIndex(lines, lineStart);
  const line = normalized.value.slice(lineStart, normalized.selectionStart);
  const afterCursor = normalized.value.slice(normalized.selectionStart, normalizedLineEnd);
  const continuation = matchListContinuationLine(line);
  if (!continuation || !isInsideMarkdownList(lines, lineIndex, continuation.quotePrefix, continuation.indent)) {
    return null;
  }

  if (!continuation.content.trim() && !afterCursor.trim()) {
    const replacement = continuation.quotePrefix;
    const value = `${normalized.value.slice(0, lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
    const cursor = lineStart + replacement.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  return insertMarkdownAtSelection(normalized, `${lineBreak}${continuation.quotePrefix}${continuation.indent}`);
}

function continueMarkdownFootnoteDefinition(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const lines = normalized.value.split("\n");
  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd === -1 ? normalized.value.length : lineEnd;
  const lineIndex = findLineIndex(lines, lineStart);
  const line = normalized.value.slice(lineStart, normalized.selectionStart);
  const afterCursor = normalized.value.slice(normalized.selectionStart, normalizedLineEnd);
  const definition = matchFootnoteDefinitionLine(line);
  if (definition) {
    return insertMarkdownAtSelection(normalized, `${lineBreak}${definition.quotePrefix}    `);
  }

  const continuation = matchFootnoteContinuationLine(line);
  if (!continuation || !isInsideFootnoteDefinition(lines, lineIndex, continuation.quotePrefix)) {
    return null;
  }

  if (!continuation.content.trim() && !afterCursor.trim()) {
    const replacement = continuation.quotePrefix;
    const value = `${normalized.value.slice(0, lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
    const cursor = lineStart + replacement.length;
    return { value, selectionStart: cursor, selectionEnd: cursor };
  }

  return insertMarkdownAtSelection(normalized, `${lineBreak}${continuation.quotePrefix}${continuation.indent}`);
}

function continueMarkdownBlockquote(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const lineStart = normalized.value.lastIndexOf("\n", normalized.selectionStart - 1) + 1;
  const lineEnd = normalized.value.indexOf("\n", normalized.selectionStart);
  const normalizedLineEnd = lineEnd === -1 ? normalized.value.length : lineEnd;
  const line = normalized.value.slice(lineStart, normalized.selectionStart);
  const afterCursor = normalized.value.slice(normalized.selectionStart, normalizedLineEnd);
  if (!readMarkdownBlockquotePrefix(line)) return null;
  const match = line.match(/^(\s*)((?:>\s*)+)(.*)$/);
  if (!match) return null;
  const fenceLine = getRawFenceLine(line);
  const rawFence = getRawFenceOpen(fenceLine);
  if (
    rawFence
    && hasFollowingRawFenceClosing(
      normalized.value.slice(normalized.selectionStart),
      rawFence,
    )
  ) return null;

  const content = match[3];
  if (!content.trim() && !afterCursor.trim()) {
    const markers = match[2].match(/>\s*/g) ?? [];
    if (markers.length > 1) {
      const replacement = normalizeQuotePrefix(`${match[1]}${markers.slice(0, -1).join("")}`);
      const value = `${normalized.value.slice(0, lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
      const cursor = lineStart + replacement.length;
      return { value, selectionStart: cursor, selectionEnd: cursor };
    }

    const value = `${normalized.value.slice(0, lineStart)}${normalized.value.slice(normalized.selectionStart)}`;
    return { value, selectionStart: lineStart, selectionEnd: lineStart };
  }

  const marker = normalizeQuotePrefix(`${match[1]}${match[2]}`);
  return insertMarkdownAtSelection(normalized, `${lineBreak}${marker}`);
}

function continueEmptyHeading(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  const beforeCursor = normalized.value.slice(range.lineStart, normalized.selectionStart);
  const afterCursor = normalized.value.slice(normalized.selectionStart, range.normalizedEnd);
  const quote = parseQuotePrefix(beforeCursor);
  if (quote) {
    const content = beforeCursor.slice(quote.rawLength);
    const quotedHeading = content.match(/^(\s{0,3})#{1,6}\s*$/);
    if (quotedHeading && !afterCursor.trim()) {
      const replacement = `${quote.normalized}${quotedHeading[1]}`;
      const value = `${normalized.value.slice(0, range.lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
      const cursor = range.lineStart + replacement.length;
      return { value, selectionStart: cursor, selectionEnd: cursor };
    }
  }

  const match = beforeCursor.match(/^(\s{0,3})#{1,6}\s*$/);
  if (!match || afterCursor.trim()) return null;

  const value = `${normalized.value.slice(0, range.lineStart)}${match[1]}${normalized.value.slice(normalized.selectionStart)}`;
  const cursor = range.lineStart + match[1].length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function completeMarkdownHorizontalRule(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (normalized.value.slice(normalized.selectionStart, range.normalizedEnd).trim()) return null;

  const line = normalized.value.slice(range.lineStart, normalized.selectionStart);
  if (!/^\s{0,3}(---|\+\+\+|\*\*\*|___)$/.test(line)) return null;

  return insertMarkdownAtSelection(normalized, lineBreak);
}

function completeMarkdownTableShortcut(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (normalized.value.slice(normalized.selectionStart, range.normalizedEnd).trim()) return null;

  const line = normalized.value.slice(range.lineStart, normalized.selectionStart);
  const quote = parseQuotePrefix(line);
  const prefix = quote?.normalized ?? "";
  const content = quote ? line.slice(quote.rawLength) : line;
  const contentIndent = content.match(/^[ \t]*/)?.[0] ?? "";
  if (getIndentWidth(contentIndent) >= 4) return null;
  if (!isTableShortcutLine(content) || isTableSeparatorContent(content)) return null;
  if (findTableRange(normalized.value, normalized.selectionStart)) return null;

  const cells = splitTableRow(content);
  const trimmedContent = content.trim();
  const isExplicitSingleColumn = cells.length === 1
    && trimmedContent.startsWith("|")
    && trimmedContent.endsWith("|")
    && !isEscapedAt(trimmedContent, trimmedContent.length - 1);
  if ((cells.length < 2 && !isExplicitSingleColumn) || cells.every((cell) => !cell.trim())) return null;

  const header = `${prefix}${buildTableRow(cells)}`;
  const separator = `${prefix}${buildTableRow(cells.map(() => "---"))}`;
  const body = `${prefix}${buildTableRow(cells.map(() => ""))}`;
  const replacement = `${header}${lineBreak}${separator}${lineBreak}${body}`;
  const value = `${normalized.value.slice(0, range.lineStart)}${replacement}${normalized.value.slice(normalized.selectionStart)}`;
  const cursor = range.lineStart + header.length + lineBreak.length + separator.length + lineBreak.length + prefix.length + 2;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function continueMarkdownTableRow(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;

  const table = findTableRange(normalized.value, normalized.selectionStart);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const columnIndex = getActiveTableColumnIndex(lines, table, normalized.selectionStart);
  const columns = splitTableRow(lines[table.start]).length;
  const insertAt = table.lineIndex <= table.separator ? table.separator + 1 : table.lineIndex + 1;
  const nextLines = [...lines];
  insertLinePreservingBreak(
    normalized.value,
    nextLines,
    insertAt,
    `${table.prefix}${buildTableRow(Array.from({ length: columns }, () => ""), table.rowFormat)}`,
  );

  const value = nextLines.join("\n");
  const cellRange = getTableCellContentRange(nextLines[insertAt] ?? "", columnIndex, getLineStartOffset(nextLines, insertAt), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

interface MarkdownRawFenceCompletion {
  matched: boolean;
  edit: TextEditResult | null;
}

function completeMarkdownRawFenceAtCursor(
  state: TextState,
): MarkdownRawFenceCompletion {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) {
    return { matched: false, edit: null };
  }

  const range = getLineRange(
    normalized.value,
    normalized.selectionStart,
    normalized.selectionEnd,
  );
  if (normalized.value.slice(normalized.selectionStart, range.normalizedEnd).trim()) {
    return { matched: false, edit: null };
  }

  const line = normalized.value.slice(range.lineStart, normalized.selectionStart);
  const lines = normalized.value.split("\n");
  const lineIndex = findLineIndex(lines, range.lineStart);
  lines[lineIndex] = line;
  const opening = getRawFenceOpeningAtLine(lines, lineIndex);
  if (!opening) return { matched: false, edit: null };
  const { fence } = opening;

  const afterCursor = normalized.value.slice(normalized.selectionStart);
  if (hasFollowingRawFenceClosing(afterCursor, fence)) {
    return { matched: true, edit: null };
  }

  const quote = parseQuotePrefix(line);
  const openingIndent = getLeadingMarkdownIndent(opening.openingContent);
  const continuationPrefix = (quote?.normalized ?? "")
    + " ".repeat(fence.listContinuationWidth)
    + openingIndent;
  const bodyPrefix = fence.quoteDepth > 0 || fence.listContinuationWidth > 0
    ? continuationPrefix
    : "";
  const closingMarker = fence.kind === "code"
    ? fence.marker[0].repeat(fence.marker.length)
    : fence.marker === "$$"
      ? "$$"
      : "\\]";
  const lineBreak = getPreferredLineBreak(normalized.value);
  const insertion = lineBreak
    + bodyPrefix
    + lineBreak
    + continuationPrefix
    + closingMarker;
  const value = normalized.value.slice(0, normalized.selectionStart)
    + insertion
    + afterCursor;
  const cursor = normalized.selectionStart + lineBreak.length + bodyPrefix.length;
  return {
    matched: true,
    edit: { value, selectionStart: cursor, selectionEnd: cursor },
  };
}
function continueMarkdownCodeFence(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (normalized.value.slice(normalized.selectionStart, range.normalizedEnd).trim()) return null;

  const line = normalized.value.slice(range.lineStart, normalized.selectionStart);
  const quote = parseQuotePrefix(line);
  const content = quote ? line.slice(quote.rawLength) : line;
  const match = content.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  if (match[2][0] === "`" && match[3].includes("`")) return null;
  if (isMarkdownCodeIndented(content, quote?.contentColumn ?? 0)) return null;
  if (hasUnclosedCodeFenceBefore(normalized.value, range.lineStart, match[2][0])) return null;

  const linePrefix = `${quote?.normalized ?? ""}${match[1]}`;
  const closingFence = `${linePrefix}${match[2][0].repeat(match[2].length)}`;
  const afterCursor = normalized.value.slice(normalized.selectionStart);
  if (hasFollowingRawFenceClosing(afterCursor, {
    kind: "code",
    marker: match[2],
    quoteDepth: quote?.depth ?? 0,
    listContinuationWidth: 0,
  })) return null;

  const insertion = quote ? `${lineBreak}${linePrefix}${lineBreak}${closingFence}` : `${lineBreak}${lineBreak}${closingFence}`;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${insertion}${afterCursor}`;
  const cursor = normalized.selectionStart + lineBreak.length + (quote ? linePrefix.length : 0);
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function continueMarkdownMathFence(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (normalized.value.slice(normalized.selectionStart, range.normalizedEnd).trim()) return null;

  const line = normalized.value.slice(range.lineStart, normalized.selectionStart);
  const quote = parseQuotePrefix(line);
  const content = quote ? line.slice(quote.rawLength) : line;
  const opening = readDollarMathBlockOpening(content, 3, quote?.contentColumn ?? 0);
  if (!opening) return null;
  if (hasUnclosedMathFenceBefore(normalized.value, range.lineStart)) return null;

  const linePrefix = `${quote?.normalized ?? ""}${opening.indent}`;
  const closingFence = `${linePrefix}$$`;
  const afterCursor = normalized.value.slice(normalized.selectionStart);
  if (hasFollowingRawFenceClosing(afterCursor, {
    kind: "math",
    marker: "$$",
    quoteDepth: quote?.depth ?? 0,
    listContinuationWidth: 0,
  })) return null;

  const insertion = quote ? `${lineBreak}${linePrefix}${lineBreak}${closingFence}` : `${lineBreak}${lineBreak}${closingFence}`;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${insertion}${afterCursor}`;
  const cursor = normalized.selectionStart + lineBreak.length + (quote ? linePrefix.length : 0);
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function hasFollowingRawFenceClosing(
  afterCursor: string,
  fence: RawFenceState,
): boolean {
  const chunks = collectLineChunks(afterCursor);
  const currentLineRemainder = chunks[0] ?? "";
  if (
    !hasTrailingLineBreak(currentLineRemainder)
    || stripLineBreak(currentLineRemainder).trim()
  ) return false;

  for (const chunk of chunks.slice(1)) {
    const line = stripLineBreak(chunk);
    if (!line.trim()) continue;
    const context = getRawFenceLine(line, fence.quoteDepth);
    if (!getRawFenceContinuationContent(context, fence)) return false;
    if (isRawFenceClose(context, fence)) return true;
  }
  return false;
}

function continueMarkdownBracketMathFence(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (normalized.selectionStart !== normalized.selectionEnd) return null;
  const lineBreak = getPreferredLineBreak(normalized.value);

  const range = getLineRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (normalized.value.slice(normalized.selectionStart, range.normalizedEnd).trim()) return null;

  const line = normalized.value.slice(range.lineStart, normalized.selectionStart);
  const quote = parseQuotePrefix(line);
  const content = quote ? line.slice(quote.rawLength) : line;
  const match = content.match(/^(\s*)\\\[\s*$/);
  if (!match) return null;
  if (isMarkdownCodeIndented(content, quote?.contentColumn ?? 0)) return null;
  if (hasUnclosedBracketMathFenceBefore(normalized.value, range.lineStart)) return null;

  const linePrefix = `${quote?.normalized ?? ""}${match[1]}`;
  const closingFence = `${linePrefix}\\]`;
  const afterCursor = normalized.value.slice(normalized.selectionStart);
  if (hasFollowingRawFenceClosing(afterCursor, {
    kind: "math",
    marker: "\\[",
    quoteDepth: quote?.depth ?? 0,
    listContinuationWidth: 0,
  })) return null;

  const insertion = quote ? `${lineBreak}${linePrefix}${lineBreak}${closingFence}` : `${lineBreak}${lineBreak}${closingFence}`;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${insertion}${afterCursor}`;
  const cursor = normalized.selectionStart + lineBreak.length + (quote ? linePrefix.length : 0);
  return { value, selectionStart: cursor, selectionEnd: cursor };
}


function findMarkdownFrontMatterRange(value: string): MarkdownFrontMatterRange | null {
  const chunks = collectLineChunks(value);
  const opening = stripLineBreak(chunks[0] ?? "");
  if (!isYamlFrontMatterOpening(opening) || !hasTrailingLineBreak(chunks[0] ?? "")) return null;

  const contentStart = (chunks[0] ?? "").length;
  let offset = contentStart;
  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index] ?? "";
    const line = stripLineBreak(chunk);
    if (isYamlFrontMatterClosing(line)) {
      return {
        contentStart,
        contentEnd: offset,
        closingContentEnd: offset + line.length,
        closingEnd: offset + chunk.length,
      };
    }
    offset += chunk.length;
  }
  return null;
}

function unwrapMarkdownFrontMatterOnBackspace(state: TextState): TextEditResult | null {
  const frontMatter = findMarkdownFrontMatterRange(state.value);
  if (!frontMatter || state.selectionStart !== frontMatter.contentStart) return null;

  const lineBreak = getPreferredLineBreak(state.value);
  let content = state.value.slice(frontMatter.contentStart, frontMatter.contentEnd);
  if (content.endsWith(lineBreak)) {
    content = content.slice(0, -lineBreak.length);
  }
  const bom = state.value.startsWith("\uFEFF") ? "\uFEFF" : "";
  const value = bom + content + state.value.slice(frontMatter.closingContentEnd);
  const cursor = bom.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function splitMarkdownHeadingPatternOnEnter(state: TextState): TextEditResult | null {
  const atx = getMarkdownAtxHeadingPattern(state.value, state.selectionStart);
  if (
    atx
    && state.selectionStart >= atx.contentStart
    && state.selectionEnd <= atx.contentEnd
  ) {
    return splitMarkdownAtxHeadingPattern(state, atx);
  }

  const setext = getMarkdownSetextHeadingPattern(state.value, state.selectionStart);
  if (
    setext
    && state.selectionStart >= setext.contentStart
    && state.selectionEnd <= setext.contentEnd
  ) {
    return splitMarkdownSetextHeadingPattern(state, setext);
  }
  return null;
}

function splitMarkdownAtxHeadingPattern(
  state: TextState,
  heading: MarkdownAtxHeadingPattern,
): TextEditResult {
  const lineBreak = getPreferredLineBreak(state.value);
  const left = state.value.slice(heading.contentStart, state.selectionStart);
  const right = state.value.slice(state.selectionEnd, heading.contentEnd);
  const content = left + right;
  const splitOffset = left.length;
  const separator = getMarkdownContainerParagraphSeparator(heading.quotePrefix, lineBreak);
  const emptyLine = heading.quotePrefix ? heading.quotePrefix.trimEnd() : "";
  const emptyContinuation = heading.quotePrefix;
  const currentHeading = heading.opening + content + heading.closing;
  let replacement: string;
  let cursor: number;

  if (splitOffset === 0) {
    replacement = emptyLine + separator + currentHeading;
    cursor = heading.lineStart + emptyLine.length;
  } else if (splitOffset === content.length) {
    replacement = currentHeading + separator + emptyContinuation;
    cursor = heading.lineStart + replacement.length;
  } else {
    const first = heading.opening + left + heading.closing;
    const second = heading.opening + right + heading.closing;
    replacement = first + separator + second;
    cursor = heading.lineStart + first.length + separator.length + heading.opening.length;
  }

  const value = state.value.slice(0, heading.lineStart)
    + replacement
    + state.value.slice(heading.lineEnd);
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function splitMarkdownSetextHeadingPattern(
  state: TextState,
  heading: MarkdownSetextHeadingPattern,
): TextEditResult {
  const lineBreak = getPreferredLineBreak(state.value);
  const left = state.value.slice(heading.contentStart, state.selectionStart);
  const right = state.value.slice(state.selectionEnd, heading.contentEnd);
  const content = left + right;
  const splitOffset = left.length;
  const separator = getMarkdownContainerParagraphSeparator(heading.quotePrefix, lineBreak);
  const emptyLine = heading.quotePrefix ? heading.quotePrefix.trimEnd() : "";
  const emptyContinuation = heading.quotePrefix;
  const buildHeading = (title: string) => (
    heading.titlePrefix + title + heading.titleSuffix + lineBreak + heading.underline
  );
  const currentHeading = buildHeading(content);
  let replacement: string;
  let cursor: number;

  if (splitOffset === 0) {
    replacement = emptyLine + separator + currentHeading;
    cursor = heading.headingStart + emptyLine.length;
  } else if (splitOffset === content.length) {
    replacement = currentHeading + separator + emptyContinuation;
    cursor = heading.headingStart + replacement.length;
  } else {
    const first = buildHeading(left);
    const second = buildHeading(right);
    replacement = first + separator + second;
    cursor = heading.headingStart
      + first.length
      + separator.length
      + heading.titlePrefix.length;
  }

  const value = state.value.slice(0, heading.headingStart)
    + replacement
    + state.value.slice(heading.headingEnd);
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

function getMarkdownAtxHeadingPattern(
  value: string,
  offset: number,
): MarkdownAtxHeadingPattern | null {
  const lineStart = value.lastIndexOf("\n", Math.max(0, offset) - 1) + 1;
  const nextLineBreak = value.indexOf("\n", offset);
  const rawLineEnd = nextLineBreak < 0 ? value.length : nextLineBreak;
  const lineEnd = rawLineEnd > lineStart && value[rawLineEnd - 1] === "\r"
    ? rawLineEnd - 1
    : rawLineEnd;
  const line = value.slice(lineStart, lineEnd);
  const quote = parseQuotePrefix(line);
  const quoteLength = quote?.rawLength ?? 0;
  const rest = line.slice(quoteLength);
  const opening = rest.match(/^([ \t]{0,3})(#{1,6})([ \t]+|$)/);
  if (!opening) return null;

  const openingEnd = quoteLength + opening[0].length;
  const body = line.slice(openingEnd);
  const closingHashes = body.match(/^(.*?)([ \t]+#+[ \t]*)$/)
    ?? body.match(/^()(#+[ \t]*)$/);
  const trailingSpace = closingHashes ? null : body.match(/[ \t]+$/);
  const contentLength = closingHashes
    ? (closingHashes[1] ?? "").length
    : body.length - (trailingSpace?.[0].length ?? 0);
  const contentStart = lineStart + openingEnd;
  const contentEnd = contentStart + contentLength;

  return {
    lineStart,
    lineEnd,
    contentStart,
    contentEnd,
    opening: line.slice(0, openingEnd),
    closing: line.slice(openingEnd + contentLength),
    plainPrefix: (quote?.normalized ?? "") + opening[1],
    quotePrefix: quote?.normalized ?? "",
  };
}

function getMarkdownSetextHeadingPattern(
  value: string,
  offset: number,
): MarkdownSetextHeadingPattern | null {
  const lineStart = value.lastIndexOf("\n", Math.max(0, offset) - 1) + 1;
  const nextLineBreak = value.indexOf("\n", offset);
  const rawLineEnd = nextLineBreak < 0 ? value.length : nextLineBreak;
  const setext = findSetextHeadingRange(value, lineStart, rawLineEnd);
  if (!setext) return null;

  const titleEnd = trimCarriageReturnBeforeLineBreak(value, setext.headingEnd);
  const underlineEnd = trimCarriageReturnBeforeLineBreak(value, setext.underlineEnd);
  const titleLine = value.slice(setext.headingStart, titleEnd);
  const context = getSetextLineContext(titleLine);
  const body = titleLine.slice(context.rawQuoteLength);
  const leading = body.match(/^[ \t]*/)?.[0] ?? "";
  const trailing = body.match(/[ \t]*$/)?.[0] ?? "";
  const contentStart = setext.headingStart + context.rawQuoteLength + leading.length;
  const contentEnd = titleEnd - trailing.length;

  return {
    headingStart: setext.headingStart,
    headingEnd: underlineEnd,
    contentStart,
    contentEnd,
    titlePrefix: titleLine.slice(0, context.rawQuoteLength + leading.length),
    titleSuffix: titleLine.slice(contentEnd - setext.headingStart),
    underline: value.slice(setext.underlineStart, underlineEnd),
    quotePrefix: context.quotePrefix,
  };
}

function getMarkdownContainerParagraphPattern(
  state: TextState,
): MarkdownContainerParagraphPattern | null {
  const lineBreak = getPreferredLineBreak(state.value);
  const lineStart = state.value.lastIndexOf("\n", state.selectionStart - 1) + 1;
  const nextLineBreak = state.value.indexOf("\n", state.selectionEnd);
  const rawLineEnd = nextLineBreak < 0 ? state.value.length : nextLineBreak;
  const lineEnd = rawLineEnd > lineStart && state.value[rawLineEnd - 1] === "\r"
    ? rawLineEnd - 1
    : rawLineEnd;
  const line = state.value.slice(lineStart, lineEnd);
  const quote = parseQuotePrefix(line);
  const quoteLength = quote?.rawLength ?? 0;
  const rest = line.slice(quoteLength);
  const list = rest.match(/^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/);
  const separator = getMarkdownContainerParagraphSeparator(quote?.normalized ?? "", lineBreak);

  if (list) {
    const lines = state.value.split("\n");
    const lineIndex = findLineIndex(lines, lineStart);
    if (!isMarkdownListMarkerIndentAllowed(lines, lineIndex, quote?.normalized ?? "", list[1])) {
      return null;
    }
    const markerWidth = list[2].length + list[3].length + (list[4]?.length ?? 0);
    return {
      contentStart: lineStart + quoteLength + list[0].length,
      contentEnd: lineEnd,
      separator,
      continuation: (quote?.normalized ?? "") + list[1] + " ".repeat(markerWidth),
    };
  }

  if (!quote) return null;
  return {
    contentStart: lineStart + quote.rawLength,
    contentEnd: lineEnd,
    separator,
    continuation: quote.normalized,
  };
}

function getMarkdownContainerParagraphSeparator(
  quotePrefix: string,
  lineBreak: "\n" | "\r\n",
): string {
  return quotePrefix
    ? lineBreak + quotePrefix.trimEnd() + lineBreak
    : lineBreak + lineBreak;
}

export function getLineRange(value: string, selectionStart: number, selectionEnd: number): LineRange {
  let start = Math.max(0, Math.min(selectionStart, selectionEnd));
  let end = Math.max(0, Math.max(selectionStart, selectionEnd));
  if (start === end && start > 0 && start === value.length && value.endsWith("\n")) {
    start -= 1;
    end -= 1;
  }
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const normalizedEnd = lineEnd === -1 ? value.length : lineEnd;
  return { value, start, end, lineStart, normalizedEnd };
}

function findSetextHeadingRange(value: string, lineStart: number, lineEnd: number): SetextHeadingRange | null {
  const line = value.slice(lineStart, lineEnd);
  const context = getSetextLineContext(line);
  if (isSetextUnderline(context.content)) {
    const previousEnd = lineStart > 0 ? lineStart - 1 : -1;
    if (previousEnd < 0) return null;
    const previousStart = value.lastIndexOf("\n", previousEnd - 1) + 1;
    const titleLine = value.slice(previousStart, previousEnd);
    const title = getSetextHeadingTitle(titleLine, previousStart);
    if (!title || title.quotePrefix !== context.quotePrefix) return null;
    return {
      headingStart: previousStart,
      headingEnd: previousEnd,
      underlineStart: lineStart,
      underlineEnd: lineEnd,
      title: title.value,
      titleStart: title.start,
      quotePrefix: title.quotePrefix,
    };
  }

  const title = getSetextHeadingTitle(line, lineStart);
  if (!title) return null;
  const nextStart = lineEnd + 1;
  if (nextStart > value.length) return null;
  const nextEnd = value.indexOf("\n", nextStart);
  const underlineEnd = nextEnd === -1 ? value.length : nextEnd;
  const underline = value.slice(nextStart, underlineEnd);
  const underlineContext = getSetextLineContext(underline);
  if (underlineContext.quotePrefix !== title.quotePrefix || !isSetextUnderline(underlineContext.content)) return null;

  return {
    headingStart: lineStart,
    headingEnd: lineEnd,
    underlineStart: nextStart,
    underlineEnd,
    title: title.value,
    titleStart: title.start,
    quotePrefix: title.quotePrefix,
  };
}

function getSetextHeadingTitle(line: string, lineStart: number): { value: string; start: number; quotePrefix: string } | null {
  const context = getSetextLineContext(line);
  if (!isSetextHeadingTitle(context.content)) return null;

  const leading = context.content.match(/^\s*/)?.[0] ?? "";
  return {
    value: context.content.trim(),
    start: lineStart + context.rawQuoteLength + leading.length,
    quotePrefix: context.quotePrefix,
  };
}

function getSetextLineContext(line: string): SetextLineContext {
  const quote = parseQuotePrefix(line);
  return {
    content: quote ? line.slice(quote.rawLength) : line,
    quotePrefix: quote?.normalized ?? "",
    rawQuoteLength: quote?.rawLength ?? 0,
  };
}

function isSetextUnderline(line: string): boolean {
  return /^\s{0,3}(={2,}|-{2,})\s*$/.test(line);
}

function isSetextHeadingTitle(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed)
    && !/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|\|)/.test(trimmed)
    && !/^\[[^\]]+]:/.test(trimmed);
}

export function splitTableRow(row: string): string[] {
  let content = getTableLineContext(row).content.trim();
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

export function buildTableRow(cells: string[], format: TableRowFormat = { leadingPipe: true, trailingPipe: true }): string {
  const tableSafeFormat = cells.length <= 1 && !format.leadingPipe && !format.trailingPipe
    ? { leadingPipe: false, trailingPipe: true }
    : format;
  const body = cells.join(" | ");
  if (tableSafeFormat.leadingPipe && tableSafeFormat.trailingPipe) return `| ${body} |`;
  if (tableSafeFormat.leadingPipe) return `| ${body}`;
  if (tableSafeFormat.trailingPipe) return `${body} |`;
  return body;
}

function buildMarkdownTableFromTabularText(text: string): string | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const delimiter = getPastedTableDelimiter(normalized);
  if (!delimiter) return null;

  const rows = parseDelimitedTableRows(normalized, delimiter)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => row.map(normalizePastedTableCell));
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || columnCount < 2) return null;

  const paddedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ""),
  ]);
  const header = paddedRows[0];
  const body = paddedRows.slice(1);
  return [
    buildTableRow(header),
    buildTableRow(Array.from({ length: columnCount }, () => "---")),
    ...body.map((row) => buildTableRow(row)),
  ].join("\n");
}

function getPastedTableDelimiter(text: string): "\t" | "," | null {
  if (text.includes("\t")) return "\t";
  if (!text.includes(",") || !text.includes("\n")) return null;

  const rows = parseDelimitedTableRows(text, ",").filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return null;
  return rows.every((row) => row.length >= 2) ? "," : null;
}

function parseDelimitedTableRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuote = false;
  let atCellStart = true;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuote) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuote = false;
          atCellStart = false;
        }
        continue;
      }
      cell += char;
      continue;
    }

    if (atCellStart && char === "\"") {
      inQuote = true;
      atCellStart = false;
      continue;
    }

    if (char === delimiter) {
      row.push(cell);
      cell = "";
      atCellStart = true;
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atCellStart = true;
      continue;
    }

    cell += char;
    if (!/\s/.test(char)) {
      atCellStart = false;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function buildMarkdownFromHtml(html: string): string | null {
  if (!isRichHtmlForMarkdown(html)) return null;
  const fragment = extractHtmlFragment(html);
  const domMarkdown = buildMarkdownFromDom(fragment);
  const markdown = domMarkdown || buildMarkdownFromHtmlFallback(fragment);
  const normalized = normalizePastedMarkdownBlock(markdown ?? "");
  return normalized || null;
}

export function convertRichHtmlToMarkdown(html: string): string | null {
  return buildMarkdownFromHtml(html);
}
function isRichHtmlForMarkdown(html: string): boolean {
  return /<(h[1-6]|p|div|br|a|strong|b|em|i|ul|ol|li|dl|dt|dd|blockquote|pre|code|kbd|samp|var|img|figure|figcaption|hr|table|del|s|strike|mark|u|ins|sub|sup|span|font)\b/i.test(html);
}

function isInlineRichHtmlForMarkdown(html: string): boolean {
  const fragment = extractHtmlFragment(html);
  return !/<(?:address|article|aside|blockquote|body|div|dl|dt|dd|figure|figcaption|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|ul)\b/i.test(fragment);
}

function extractHtmlFragment(html: string): string {
  const fragment = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
  if (fragment) return fragment[1];
  return html;
}

function buildMarkdownFromDom(html: string): string | null {
  const Parser = (globalThis as {
    DOMParser?: new () => { parseFromString(source: string, type: string): any };
  }).DOMParser;
  if (!Parser) return null;

  const document = new Parser().parseFromString(html, "text/html");
  const root = document.body ?? document;
  return renderDomBlockChildren(root);
}

function renderDomBlockChildren(node: any): string {
  return normalizePastedMarkdownBlock(
    (Array.from(node.childNodes ?? []) as any[])
      .map((child) => renderDomBlock(child, 0))
      .filter(Boolean)
      .join("\n\n"),
  );
}

function renderDomBlock(node: any, depth: number): string {
  if (node.nodeType === 3) {
    return normalizeInlineMarkdown(String(node.textContent ?? ""));
  }
  if (node.nodeType !== 1) return "";

  const tag = String(node.tagName ?? "").toLowerCase();
  if (["script", "style", "meta", "link", "title"].includes(tag)) return "";

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    const text = normalizeInlineMarkdown(renderDomInlineChildren(node));
    return text ? `${"#".repeat(level)} ${text}` : "";
  }

  if (tag === "ul" || tag === "ol") {
    return renderDomList(node, tag === "ol", depth);
  }

  if (tag === "dl") {
    return renderDomDefinitionList(node, depth);
  }

  if (tag === "blockquote") {
    return prefixMarkdownQuote(renderDomBlockChildren(node));
  }

  if (tag === "pre") {
    return renderCodeFence(getDomCodeText(node), getDomCodeLanguage(node));
  }

  if (tag === "hr") {
    return "---";
  }

  if (tag === "table") {
    return buildMarkdownTableFromParsedRows(parseDomTableElement(node)) ?? "";
  }

  if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "figure" || tag === "figcaption" || tag === "main" || tag === "body" || tag === "dt" || tag === "dd") {
    return renderDomBlockChildrenOrInline(node, depth);
  }

  if (tag === "br") {
    return "";
  }

  return normalizeInlineMarkdown(renderDomInline(node));
}

function renderDomBlockChildrenOrInline(node: any, depth: number): string {
  const children = Array.from(node.childNodes ?? []) as any[];
  const hasBlockChild = children.some((child) => (
    child.nodeType === 1
    && isPastedHtmlBlockTag(String(child.tagName ?? ""))
  ));
  if (hasBlockChild) {
    return normalizePastedMarkdownBlock(
      children
        .map((child) => renderDomBlock(child, depth))
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  return normalizeInlineMarkdownPreservingBreaks(renderDomInlineChildren(node));
}

function isPastedHtmlBlockTag(tag: string): boolean {
  return /^(h[1-6]|ul|ol|dl|dt|dd|blockquote|pre|hr|table|p|div|section|article|figure|figcaption)$/i.test(tag);
}

function renderDomList(list: any, ordered: boolean, depth: number): string {
  const items = (Array.from(list.children ?? []) as any[])
    .filter((child) => String(child.tagName ?? "").toLowerCase() === "li");
  const reversed = ordered && isDomReversedList(list);
  let number = getPositiveHtmlInteger(list.getAttribute?.("start")) ?? (reversed ? items.length : 1);

  return items
    .map((item) => {
      if (ordered) {
        number = getPositiveHtmlInteger(item.getAttribute?.("value")) ?? number;
      }
      const marker = ordered ? `${number}.` : "-";
      if (ordered) number += reversed ? -1 : 1;
      return renderDomListItem(item, marker, depth);
    })
    .filter(Boolean)
    .join("\n");
}

function renderDomListItem(item: any, marker: string, depth: number): string {
  const nested: string[] = [];
  const inlineParts: string[] = [];
  const contentBlocks: string[] = [];
  const nestedCheckbox = item.querySelector?.("input[type='checkbox']");
  let taskMarker = nestedCheckbox
    ? (isDomCheckedInput(nestedCheckbox) ? "[x] " : "[ ] ")
    : "";
  const flushInlineParts = () => {
    const content = normalizeInlineMarkdown(inlineParts.join(""));
    inlineParts.length = 0;
    if (content) contentBlocks.push(content);
  };

  for (const child of Array.from(item.childNodes ?? []) as any[]) {
    const tag = child.nodeType === 1 ? String(child.tagName ?? "").toLowerCase() : "";
    if (!taskMarker && isDomCheckboxInput(child)) {
      taskMarker = isDomCheckedInput(child) ? "[x] " : "[ ] ";
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      flushInlineParts();
      nested.push(renderDomList(child, tag === "ol", depth + 1));
      continue;
    }
    if (["p", "div"].includes(tag)) {
      flushInlineParts();
      const content = renderDomBlockChildrenOrInline(child, depth);
      if (content) contentBlocks.push(content);
      continue;
    }
    if (isPastedHtmlBlockTag(tag)) {
      flushInlineParts();
      const content = renderDomBlock(child, depth);
      if (content) contentBlocks.push(content);
      continue;
    }
    inlineParts.push(renderDomInline(child));
  }
  flushInlineParts();

  return renderMarkdownListItem(marker, taskMarker, contentBlocks, nested, depth);
}

function renderMarkdownListItem(
  marker: string,
  taskMarker: string,
  contentBlocks: string[],
  nested: string[],
  depth: number,
): string {
  const prefix = `${"  ".repeat(depth)}${marker} ${taskMarker}`;
  const continuationIndent = " ".repeat(prefix.length);
  const blocks = contentBlocks.map(normalizePastedMarkdownBlock).filter(Boolean);
  const firstBlock = blocks[0] ?? "";
  const firstLines = firstBlock.split("\n");
  const head = firstBlock
    ? [
      `${prefix}${firstLines[0]}`.trimEnd(),
      ...firstLines.slice(1).map((line) => `${continuationIndent}${line}`.trimEnd()),
    ].join("\n")
    : prefix.trimEnd();

  return [
    head,
    ...blocks.slice(1).map((block) => `\n${indentPastedMarkdownBlock(block, continuationIndent)}`),
    ...nested.filter(Boolean),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderDomDefinitionList(list: any, depth: number): string {
  const entries: PastedDefinitionListEntry[] = [];
  let active: PastedDefinitionListEntry | null = null;

  for (const child of Array.from(list.children ?? list.childNodes ?? []) as any[]) {
    const tag = child.nodeType === 1 ? String(child.tagName ?? "").toLowerCase() : "";
    if (tag === "dt") {
      const term = renderDomBlockChildrenOrInline(child, depth);
      active = { term, definitions: [] };
      entries.push(active);
      continue;
    }

    if (tag === "dd") {
      const definition = renderDomBlockChildrenOrInline(child, depth + 1);
      if (!active) {
        active = { term: "", definitions: [] };
        entries.push(active);
      }
      if (definition) active.definitions.push(definition);
    }
  }

  return renderDefinitionListEntries(entries, depth);
}

function renderDefinitionListEntries(entries: PastedDefinitionListEntry[], depth: number): string {
  return entries
    .map((entry) => {
      const term = normalizePastedMarkdownBlock(entry.term);
      const definitions = entry.definitions
        .map((definition) => normalizePastedMarkdownBlock(definition))
        .filter(Boolean);

      if (!term) {
        return definitions
          .map((definition) => renderMarkdownListItem("-", "", [definition], [], depth + 1))
          .join("\n");
      }

      return [
        renderDefinitionListTerm(term, depth),
        ...definitions.map((definition) => renderDefinitionListDefinition(definition, depth)),
      ].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function renderDefinitionListTerm(term: string, depth: number): string {
  const indent = "  ".repeat(depth);
  return term
    .split("\n")
    .map((line) => `${indent}${line}`.trimEnd())
    .join("\n");
}

function renderDefinitionListDefinition(definition: string, depth: number): string {
  const indent = "  ".repeat(depth);
  const lines = definition.split("\n");
  const firstLine = lines[0] ?? "";
  const continuationIndent = `${indent}    `;

  return [
    `${indent}: ${firstLine}`.trimEnd(),
    ...lines.slice(1).map((line) => (line ? `${continuationIndent}${line}`.trimEnd() : "")),
  ].join("\n");
}

function indentPastedMarkdownBlock(block: string, indent: string): string {
  return block
    .split("\n")
    .map((line) => (line ? `${indent}${line}` : line))
    .join("\n");
}

function renderDomInlineChildren(node: any): string {
  return (Array.from(node.childNodes ?? []) as any[])
    .map((child) => renderDomInline(child))
    .join("");
}

function applyPastedInlineStyles(
  markdown: string,
  style: string,
  semantic: PastedInlineSemanticStyle = {},
): string {
  const normalizedStyle = style.trim();
  if (!normalizedStyle) return markdown;

  let next = markdown;
  if (!semantic.bold && isBoldCssStyle(normalizedStyle)) next = `**${next}**`;
  if (!semantic.italic && hasCssKeyword(normalizedStyle, "font-style", ["italic", "oblique"])) next = `*${next}*`;
  if (!semantic.strike && hasCssDecoration(normalizedStyle, "line-through")) next = `~~${next}~~`;
  if (!semantic.underline && hasCssDecoration(normalizedStyle, "underline")) next = `<u>${next}</u>`;
  if (!semantic.mark && hasHighlightCssStyle(normalizedStyle)) next = `==${next}==`;

  const verticalAlign = getCssDeclaration(normalizedStyle, "vertical-align");
  if (!semantic.sup && /^super\b/i.test(verticalAlign)) return `^${next}^`;
  if (!semantic.sub && /^sub\b/i.test(verticalAlign)) return `~${next}~`;
  return next;
}

function isBoldCssStyle(style: string): boolean {
  const fontWeight = getCssDeclaration(style, "font-weight").toLowerCase();
  if (!fontWeight) return false;
  if (/\b(bold|bolder)\b/.test(fontWeight)) return true;
  const numeric = Number.parseInt(fontWeight, 10);
  return Number.isFinite(numeric) && numeric >= 600;
}

function hasCssDecoration(style: string, keyword: string): boolean {
  const value = style.toLowerCase();
  return !/\bnone\b/.test(value) && value.includes(keyword);
}

function hasHighlightCssStyle(style: string): boolean {
  const value = [
    getCssDeclaration(style, "background"),
    getCssDeclaration(style, "background-color"),
    getCssDeclaration(style, "mso-highlight"),
  ].join(" ").trim().toLowerCase();
  return Boolean(value) && !/\b(none|transparent|initial|inherit|unset)\b/.test(value);
}

function hasCssKeyword(style: string, property: string, keywords: string[]): boolean {
  const value = getCssDeclaration(style, property).toLowerCase();
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(value));
}

function getCssDeclaration(style: string, property: string): string {
  const target = property.toLowerCase();
  return style
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf(":");
      return separator >= 0
        ? { name: part.slice(0, separator).trim().toLowerCase(), value: part.slice(separator + 1).trim() }
        : null;
    })
    .find((part) => part?.name === target)?.value ?? "";
}

function renderDomInline(node: any): string {
  if (node.nodeType === 3) {
    return normalizeHtmlText(String(node.textContent ?? ""));
  }
  if (node.nodeType !== 1) return "";

  if (node.getAttribute?.("data-marko-syntax-preview") === "true") return "";
  if (node.hasAttribute?.("data-marko-inline-source")) {
    return normalizeHtmlText(String(node.textContent ?? ""));
  }
  if (node.hasAttribute?.("data-marko-inline-markdown")) {
    return String(node.getAttribute?.("data-marko-inline-markdown") ?? "");
  }

  const tag = String(node.tagName ?? "").toLowerCase();
  if (["script", "style", "meta", "link", "title"].includes(tag)) return "";
  if (tag === "br") return "  \n";
  if (tag === "img") {
    return renderPastedMarkdownImage(
      node.getAttribute?.("src") ?? "",
      node.getAttribute?.("alt") ?? "",
      node.getAttribute?.("title") ?? "",
      node.getAttribute?.("width") ?? "",
      node.getAttribute?.("height") ?? "",
      node.getAttribute?.("style") ?? "",
    );
  }

  const content = normalizeInlineMarkdown(renderDomInlineChildren(node));
  if (!content) return "";
  const style = String(node.getAttribute?.("style") ?? "");
  const styled = (markdown: string, semantic: PastedInlineSemanticStyle = {}) => (
    applyPastedInlineStyles(markdown, style, semantic)
  );

  switch (tag) {
    case "strong":
    case "b":
      return styled(`**${content}**`, { bold: true });
    case "em":
    case "i":
      return styled(`*${content}*`, { italic: true });
    case "code":
    case "kbd":
    case "samp":
      return formatInlineCode(content);
    case "var":
      return styled(`*${content}*`, { italic: true });
    case "del":
    case "s":
    case "strike":
      return styled(`~~${content}~~`, { strike: true });
    case "mark":
      return styled(`==${content}==`, { mark: true });
    case "u":
    case "ins":
      return styled(`<u>${content}</u>`, { underline: true });
    case "sub":
      return styled(`~${content}~`, { sub: true });
    case "sup":
      return styled(`^${content}^`, { sup: true });
    case "a": {
      const href = String(node.getAttribute?.("href") ?? "").trim();
      const title = String(node.getAttribute?.("title") ?? "");
      return styled(formatPastedMarkdownLink(content, href, title));
    }
    default:
      return styled(content);
  }
}

function parseDomTableElement(table: any): ParsedTableRow[] {
  return expandSpannedTableRows(
    (Array.from(table.querySelectorAll?.("tr") ?? []) as any[])
      .map((row) => parseDomTableCells(row)),
  );
}

function buildMarkdownFromHtmlFallback(html: string): string | null {
  const protectedMarkdown: string[] = [];
  const protectMarkdown = (markdown: string) => {
    const token = `@@MARKO_PASTED_MD_${protectedMarkdown.length}@@`;
    protectedMarkdown.push(markdown);
    return token;
  };
  let next = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");

  next = next.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (_match, preAttrs: string, code: string) => `\n\n${protectMarkdown(renderCodeFence(htmlToCodeText(code), getHtmlCodeLanguage(code, preAttrs)))}\n\n`);
  next = next.replace(/<table\b[\s\S]*?<\/table>/gi, (table: string) => `\n\n${protectMarkdown(buildMarkdownTableFromHtmlFallback(table) ?? htmlToPlainText(table))}\n\n`);
  next = next.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => protectMarkdown(renderPastedMarkdownImage(
    getHtmlAttribute(attrs, "src"),
    getHtmlAttribute(attrs, "alt"),
    getHtmlAttribute(attrs, "title"),
    getHtmlAttribute(attrs, "width"),
    getHtmlAttribute(attrs, "height"),
    getHtmlAttribute(attrs, "style"),
  )));
  next = next.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs: string, body: string) => {
    const label = normalizeInlineMarkdown(htmlToPlainText(convertInlineHtmlFallback(body)));
    const href = getHtmlAttribute(attrs, "href");
    const restoredLabel = restoreProtectedPastedMarkdown(label, protectedMarkdown);
    return protectMarkdown(formatPastedMarkdownLink(restoredLabel || href, href, getHtmlAttribute(attrs, "title")));
  });
  next = convertInlineHtmlFallback(next);
  next = next.replace(/<u>([\s\S]*?)<\/u>/gi, (_match, body: string) => protectMarkdown(`<u>${body}</u>`));
  next = next.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, body: string) => `\n\n${"#".repeat(Number(level))} ${normalizeInlineMarkdown(htmlToPlainText(body))}\n\n`);
  next = replaceHtmlBlockquotesFallback(next);
  next = replaceHtmlDefinitionListsFallback(next);
  next = replaceHtmlListsFallback(next);
  next = next
    .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
    .replace(/<figcaption\b[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<\/(?:p|div|section|article|figure|figcaption|main)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  return normalizePastedMarkdownBlock(decodeHtmlEntities(restoreProtectedPastedMarkdown(next, protectedMarkdown)));
}

function restoreProtectedPastedMarkdown(value: string, segments: string[]): string {
  let next = value;
  for (let pass = 0; pass <= segments.length; pass += 1) {
    const before = next;
    segments.forEach((segment, index) => {
      next = next.split(`@@MARKO_PASTED_MD_${index}@@`).join(segment);
    });
    if (next === before) break;
  }
  return next;
}

function convertInlineHtmlFallback(html: string): string {
  let next = html;
  let changed = true;
  while (changed) {
    const before = next;
    next = convertInlineHtmlFallbackPass(next);
    changed = before !== next;
  }
  return next;
}

function convertInlineHtmlFallbackPass(html: string): string {
  return html
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => `**${formatInlineHtmlFallbackBody(body)}**`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => `*${formatInlineHtmlFallbackBody(body)}*`)
    .replace(/<(code|kbd|samp)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => formatInlineCode(htmlToPlainText(body)))
    .replace(/<var\b[^>]*>([\s\S]*?)<\/var>/gi, (_match, body: string) => `*${formatInlineHtmlFallbackBody(body)}*`)
    .replace(/<(del|s|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => `~~${formatInlineHtmlFallbackBody(body)}~~`)
    .replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, (_match, body: string) => `==${formatInlineHtmlFallbackBody(body)}==`)
    .replace(/<(u|ins)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => `<u>${formatInlineHtmlFallbackBody(body)}</u>`)
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_match, body: string) => `~${formatInlineHtmlFallbackBody(body)}~`)
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_match, body: string) => `^${formatInlineHtmlFallbackBody(body)}^`)
    .replace(/<(span|font)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, attrs: string, body: string) => {
      const content = formatInlineHtmlFallbackBody(body);
      return applyPastedInlineStyles(content, getHtmlAttribute(attrs, "style"));
    });
}

function formatInlineHtmlFallbackBody(body: string): string {
  return normalizeInlineMarkdown(htmlToPlainText(convertInlineHtmlFallback(body)));
}

function replaceHtmlBlockquotesFallback(html: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < html.length) {
    const match = findNextHtmlBlockquoteStart(html, cursor);
    if (!match) {
      result += html.slice(cursor);
      break;
    }

    result += html.slice(cursor, match.index);
    const end = findMatchingHtmlBlockquoteEnd(html, match.index);
    if (!end) {
      result += match.raw;
      cursor = match.index + match.raw.length;
      continue;
    }

    const body = html.slice(match.index + match.raw.length, end.contentEnd);
    const content = buildMarkdownFromHtmlFallback(body) ?? htmlToPlainText(body);
    result += `\n\n${prefixMarkdownQuote(normalizePastedMarkdownBlock(content))}\n\n`;
    cursor = end.end;
  }

  return result;
}

function findNextHtmlBlockquoteStart(html: string, cursor: number): { index: number; raw: string } | null {
  const blockquotePattern = /<blockquote\b[^>]*>/gi;
  blockquotePattern.lastIndex = cursor;
  const match = blockquotePattern.exec(html);
  if (!match) return null;
  return { index: match.index, raw: match[0] };
}

function findMatchingHtmlBlockquoteEnd(html: string, startIndex: number): { contentEnd: number; end: number } | null {
  const tokenPattern = /<\/?blockquote\b[^>]*>/gi;
  tokenPattern.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        return { contentEnd: match.index, end: match.index + match[0].length };
      }
      continue;
    }

    depth += 1;
  }

  return null;
}

function replaceHtmlDefinitionListsFallback(html: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < html.length) {
    const match = findNextHtmlDefinitionListStart(html, cursor);
    if (!match) {
      result += html.slice(cursor);
      break;
    }

    result += html.slice(cursor, match.index);
    const end = findMatchingHtmlDefinitionListEnd(html, match.index);
    if (!end) {
      result += match.raw;
      cursor = match.index + match.raw.length;
      continue;
    }

    result += `\n\n${renderHtmlDefinitionListFallback(html.slice(match.index + match.raw.length, end.contentEnd), 0)}\n\n`;
    cursor = end.end;
  }

  return result;
}

function renderHtmlDefinitionListFallback(body: string, depth: number): string {
  return renderDefinitionListEntries(parseHtmlDefinitionListEntries(body), depth);
}

function parseHtmlDefinitionListEntries(body: string): PastedDefinitionListEntry[] {
  const entries: PastedDefinitionListEntry[] = [];
  const termPattern = /<(dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let active: PastedDefinitionListEntry | null = null;
  let match: RegExpExecArray | null;

  while ((match = termPattern.exec(body))) {
    const tag = match[1].toLowerCase();
    const content = getHtmlDefinitionContentBlocks(match[2]).join("\n\n");
    if (tag === "dt") {
      active = { term: content, definitions: [] };
      entries.push(active);
      continue;
    }

    if (!active) {
      active = { term: "", definitions: [] };
      entries.push(active);
    }
    if (content) active.definitions.push(content);
  }

  return entries;
}

function getHtmlDefinitionContentBlocks(html: string): string[] {
  const blockText = replaceHtmlListsFallback(convertInlineHtmlFallback(html))
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<(p|div|section|article)\b[^>]*>/gi, "\n\n")
    .replace(/<\/(p|div|section|article)>/gi, "\n\n")
    .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(blockText)
    .split(/\n[ \t]*\n+/)
    .map(normalizePastedMarkdownBlock)
    .filter(Boolean);
}

function findNextHtmlDefinitionListStart(html: string, cursor: number): { index: number; raw: string } | null {
  const listPattern = /<dl\b[^>]*>/gi;
  listPattern.lastIndex = cursor;
  const match = listPattern.exec(html);
  if (!match) return null;
  return { index: match.index, raw: match[0] };
}

function findMatchingHtmlDefinitionListEnd(html: string, startIndex: number): { contentEnd: number; end: number } | null {
  const tokenPattern = /<\/?dl\b[^>]*>/gi;
  tokenPattern.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        return { contentEnd: match.index, end: match.index + match[0].length };
      }
      continue;
    }

    depth += 1;
  }

  return null;
}

function replaceHtmlListsFallback(html: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < html.length) {
    const match = findNextHtmlListStart(html, cursor);
    if (!match) {
      result += html.slice(cursor);
      break;
    }

    result += html.slice(cursor, match.index);
    const end = findMatchingHtmlListEnd(html, match.index);
    if (!end) {
      result += match.raw;
      cursor = match.index + match.raw.length;
      continue;
    }

    const body = html.slice(match.index + match.raw.length, end.contentEnd);
    result += `\n\n${renderHtmlListFallback(
      body,
      match.tag === "ol",
      getHtmlListStart(match.attrs),
      hasHtmlBooleanAttribute(match.attrs, "reversed"),
      0,
    )}\n\n`;
    cursor = end.end;
  }

  return result;
}

function renderHtmlListFallback(
  body: string,
  ordered: boolean,
  start: number | null = null,
  reversed = false,
  depth = 0,
): string {
  const items = parseHtmlListItems(body);
  let number = start ?? (ordered && reversed ? items.length : 1);
  return items
    .map((item) => {
      if (ordered) {
        number = getPositiveHtmlInteger(getHtmlAttribute(item.attrs, "value")) ?? number;
      }
      const marker = ordered ? `${number}.` : "-";
      if (ordered) number += reversed ? -1 : 1;
      return renderHtmlListItemFallback(item.body, marker, depth);
    })
    .filter(Boolean)
    .join("\n");
}

function renderHtmlListItemFallback(body: string, marker: string, depth: number): string {
  const extracted = extractNestedHtmlListsFallback(body, depth + 1);
  const task = extractHtmlTaskMarker(extracted.content);
  const contentBlocks = getHtmlListItemContentBlocks(task.html);
  return renderMarkdownListItem(marker, task.marker, contentBlocks, extracted.lists, depth);
}

function extractHtmlTaskMarker(html: string): { html: string; marker: string } {
  const checkbox = html.match(/<input\b([^>]*)>/i);
  if (!checkbox || !/\btype\s*=\s*("checkbox"|'checkbox'|checkbox)/i.test(checkbox[1])) {
    return { html, marker: "" };
  }

  const marker = /\bchecked(?:\s*=\s*(?:"checked"|'checked'|checked|""|''))?\b/i.test(checkbox[1]) ? "[x] " : "[ ] ";
  const nextHtml = `${html.slice(0, checkbox.index)}${html.slice((checkbox.index ?? 0) + checkbox[0].length)}`;
  return { html: nextHtml, marker };
}

function extractNestedHtmlListsFallback(body: string, depth: number): { content: string; lists: string[] } {
  let content = "";
  const lists: string[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const match = findNextHtmlListStart(body, cursor);
    if (!match) {
      content += body.slice(cursor);
      break;
    }

    content += body.slice(cursor, match.index);
    const end = findMatchingHtmlListEnd(body, match.index);
    if (!end) {
      content += match.raw;
      cursor = match.index + match.raw.length;
      continue;
    }

    const listBody = body.slice(match.index + match.raw.length, end.contentEnd);
    lists.push(renderHtmlListFallback(
      listBody,
      match.tag === "ol",
      getHtmlListStart(match.attrs),
      hasHtmlBooleanAttribute(match.attrs, "reversed"),
      depth,
    ));
    cursor = end.end;
  }

  return { content, lists: lists.filter(Boolean) };
}

function getHtmlListItemContentBlocks(html: string): string[] {
  const blockText = html
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<(p|div|section|article)\b[^>]*>/gi, "\n\n")
    .replace(/<\/(p|div|section|article)>/gi, "\n\n")
    .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(blockText)
    .split(/\n[ \t]*\n+/)
    .map(normalizePastedMarkdownBlock)
    .filter(Boolean);
}

function parseHtmlListItems(body: string): Array<{ attrs: string; body: string }> {
  const items: Array<{ attrs: string; body: string }> = [];
  const itemPattern = /<li\b([^>]*)>/gi;
  let cursor = 0;

  while (cursor < body.length) {
    itemPattern.lastIndex = cursor;
    const match = itemPattern.exec(body);
    if (!match) break;

    const contentStart = match.index + match[0].length;
    const end = findHtmlListItemEnd(body, contentStart);
    items.push({
      attrs: match[1] ?? "",
      body: body.slice(contentStart, end.contentEnd),
    });
    cursor = end.end;
  }

  return items;
}

function findHtmlListItemEnd(body: string, start: number): { contentEnd: number; end: number } {
  const tokenPattern = /<\/?(ul|ol|li)\b[^>]*>/gi;
  tokenPattern.lastIndex = start;
  let nestedListDepth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(body))) {
    const tag = match[1].toLowerCase();
    const closing = /^<\//.test(match[0]);
    if (tag === "ul" || tag === "ol") {
      nestedListDepth += closing ? -1 : 1;
      nestedListDepth = Math.max(0, nestedListDepth);
      continue;
    }

    if (tag === "li" && closing && nestedListDepth === 0) {
      return { contentEnd: match.index, end: match.index + match[0].length };
    }
  }

  return { contentEnd: body.length, end: body.length };
}

function findNextHtmlListStart(html: string, cursor: number): { index: number; raw: string; tag: string; attrs: string } | null {
  const listPattern = /<(ul|ol)\b([^>]*)>/gi;
  listPattern.lastIndex = cursor;
  const match = listPattern.exec(html);
  if (!match) return null;
  return {
    index: match.index,
    raw: match[0],
    tag: match[1].toLowerCase(),
    attrs: match[2] ?? "",
  };
}

function findMatchingHtmlListEnd(html: string, startIndex: number): { contentEnd: number; end: number } | null {
  const tokenPattern = /<\/?(ul|ol)\b[^>]*>/gi;
  tokenPattern.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        return { contentEnd: match.index, end: match.index + match[0].length };
      }
      continue;
    }

    depth += 1;
  }

  return null;
}

function getHtmlListStart(attrs: string): number | null {
  return getPositiveHtmlInteger(getHtmlAttribute(attrs, "start"));
}

function hasHtmlBooleanAttribute(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?:\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+))?(?=\\s|$)`, "i").test(attrs);
}

function getPositiveHtmlInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function isDomReversedList(list: any): boolean {
  return Boolean(list.reversed || list.hasAttribute?.("reversed"));
}

function isDomCheckboxInput(node: any): boolean {
  if (node?.nodeType !== 1 || String(node.tagName ?? "").toLowerCase() !== "input") return false;
  return String(node.getAttribute?.("type") ?? node.type ?? "").toLowerCase() === "checkbox";
}

function isDomCheckedInput(node: any): boolean {
  return Boolean(node.checked || node.hasAttribute?.("checked"));
}

function getDomCodeLanguage(node: any): string {
  const code = node.querySelector?.("code") ?? node;
  const attrLanguage = code.getAttribute?.("data-language") || code.getAttribute?.("lang");
  const classLanguage = getCodeLanguageFromClassName(String(code.getAttribute?.("class") ?? code.className ?? ""));
  const preLanguage = node === code
    ? ""
    : node.getAttribute?.("data-language") || node.getAttribute?.("lang") || getCodeLanguageFromClassName(String(node.getAttribute?.("class") ?? node.className ?? ""));
  return normalizePastedCodeLanguage(attrLanguage || classLanguage || preLanguage);
}

function getDomCodeText(node: any): string {
  const code = node.querySelector?.("code") ?? node;
  const html = code.innerHTML ?? node.innerHTML;
  if (html !== undefined && html !== null) return htmlToCodeText(String(html));
  return String(code.textContent ?? node.textContent ?? "");
}

function getHtmlCodeLanguage(html: string, preAttrs = ""): string {
  const code = html.match(/<code\b([^>]*)>/i);
  const attrs = code?.[1] ?? "";
  return normalizePastedCodeLanguage(
    getHtmlAttribute(attrs, "data-language")
    || getHtmlAttribute(attrs, "lang")
    || getCodeLanguageFromClassName(getHtmlAttribute(attrs, "class"))
    || getHtmlAttribute(preAttrs, "data-language")
    || getHtmlAttribute(preAttrs, "lang")
    || getCodeLanguageFromClassName(getHtmlAttribute(preAttrs, "class")),
  );
}

function getCodeLanguageFromClassName(className: string): string {
  const token = className
    .split(/\s+/)
    .find((item) => /^(?:language|lang)-[A-Za-z0-9_+.-]+$/i.test(item));
  return token?.replace(/^(?:language|lang)-/i, "") ?? "";
}

function normalizePastedCodeLanguage(language: unknown): string {
  const value = String(language ?? "").trim().replace(/^\.*/, "");
  return /^[A-Za-z0-9_+.-]+$/.test(value) ? value : "";
}

function htmlToCodeText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
}

function renderCodeFence(code: string, language = ""): string {
  const content = decodeHtmlEntities(code).replace(/^\n+|\n+$/g, "");
  const fence = getCodeFenceMarker(content);
  return `${fence}${language}\n${content}\n${fence}`;
}

function getCodeFenceMarker(content: string): string {
  const longest = content.match(/`+/g)?.reduce((length, run) => Math.max(length, run.length), 0) ?? 0;
  return "`".repeat(Math.max(3, longest + 1));
}

function getCodeSpanMarker(content: string): string {
  const longest = content.match(/`+/g)?.reduce((length, run) => Math.max(length, run.length), 0) ?? 0;
  return "`".repeat(Math.max(1, longest + 1));
}

function renderMarkdownImage(source: string, alt: string, title: string): string {
  const src = source.trim();
  if (!src) return "";
  if (!isSafePastedImageSource(src)) return normalizeInlineMarkdown(alt);
  const titlePart = title.trim() ? ` "${title.trim().replace(/"/g, "\\\"")}"` : "";
  return `![${formatMarkdownImageAlt(alt)}](${formatMarkdownLinkDestination(src)}${titlePart})`;
}

function formatMarkdownImageAlt(alt: string): string {
  return alt
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function renderPastedMarkdownImage(
  source: string,
  alt: string,
  title: string,
  width = "",
  height = "",
  style = "",
): string {
  const src = decodeHtmlEntities(source.trim());
  if (!src) return "";
  if (!isSafePastedImageSource(src)) return normalizeInlineMarkdown(alt);

  const dimensions = getPastedImageDimensions(width, height, style);
  if (!dimensions.width && !dimensions.height) {
    return renderMarkdownImage(src, alt, title);
  }

  const attrs = [
    `src="${escapeAttribute(src)}"`,
    `alt="${escapeAttribute(alt.trim())}"`,
  ];
  if (dimensions.width) attrs.push(`width="${escapeAttribute(dimensions.width)}"`);
  if (dimensions.height) attrs.push(`height="${escapeAttribute(dimensions.height)}"`);
  if (title.trim()) attrs.push(`title="${escapeAttribute(title.trim())}"`);
  return `<img ${attrs.join(" ")}>`;
}

function getPastedImageDimensions(width: string, height: string, style: string): { width: string; height: string } {
  return {
    width: normalizePastedImageDimension(width) || normalizePastedImageDimension(getCssDeclaration(style, "width")),
    height: normalizePastedImageDimension(height) || normalizePastedImageDimension(getCssDeclaration(style, "height")),
  };
}

function normalizePastedImageDimension(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^auto$/i.test(trimmed)) return "";
  return /^\d+(?:\.\d+)?(?:px|em|rem|%|vw|vh|vmin|vmax)?$/i.test(trimmed) ? trimmed : "";
}

function formatPastedMarkdownLink(label: string, href: string, title = ""): string {
  const text = label.trim();
  const destination = href.trim();
  if (!destination || getPreviewLinkAction(destination) === "blocked") return text;
  if (isPastedHtmlImageMarkup(text)) {
    return renderPastedHtmlImageLink(text, destination, title);
  }
  const linkLabel = text || destination;
  const formattedLabel = isPastedMarkdownImageMarkup(linkLabel)
    ? linkLabel
    : formatMarkdownLinkLabel(linkLabel);
  return `[${formattedLabel}](${formatMarkdownLinkDestination(destination)}${formatMarkdownLinkTitle(title)})`;
}

function isPastedHtmlImageMarkup(value: string): boolean {
  return /^<img\b[^>]*>$/i.test(value.trim());
}

function isPastedMarkdownImageMarkup(value: string): boolean {
  const trimmed = value.trim();
  const link = readMarkdownInlineLink(trimmed, 1);
  return Boolean(link && link.imageStart === 0 && link.end === trimmed.length);
}

function renderPastedHtmlImageLink(image: string, href: string, title: string): string {
  const attrs = [`href="${escapeAttribute(decodeHtmlEntities(href.trim()))}"`];
  if (title.trim()) attrs.push(`title="${escapeAttribute(title.trim())}"`);
  return `<a ${attrs.join(" ")}>${image.trim()}</a>`;
}

function formatMarkdownLinkLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function formatMarkdownLinkTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "";
  return ` "${trimmed.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function isSafePastedImageSource(source: string): boolean {
  const decoded = decodeHtmlEntities(source.trim());
  if (!decoded) return false;
  if (/^data:/i.test(decoded)) return /^data:image\//i.test(decoded);
  return getPreviewLinkAction(decoded) !== "blocked";
}

function prefixMarkdownQuote(markdown: string): string {
  return normalizePastedMarkdownBlock(markdown)
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function formatInlineCode(value: string): string {
  const code = value.replace(/\s+/g, " ").trim();
  return code.includes("`") ? `\`\` ${code} \`\`` : `\`${code}\``;
}

function formatMarkdownLinkDestination(value: string): string {
  const decoded = decodeHtmlEntities(value.trim());
  return /[\s()]/.test(decoded) ? `<${decoded.replace(/>/g, "%3E")}>` : decoded;
}

function normalizeHtmlText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ");
}

function normalizeInlineMarkdown(value: string): string {
  return value.replace(/[ \t\r\n]+/g, " ").trim();
}

function normalizeInlineMarkdownPreservingBreaks(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeInlineMarkdown(line))
    .join("  \n")
    .trim();
}

function normalizePastedMarkdownBlock(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(trimPastedLineEnd)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimPastedLineEnd(line: string): string {
  return line.endsWith("  ") ? `${line.trimEnd()}  ` : line.replace(/[ \t]+$/g, "");
}

function getHtmlAttribute(attrs: string, name: string): string {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  const match = attrs.match(pattern);
  if (!match) return "";
  return decodeHtmlEntities(match[1].replace(/^["']|["']$/g, ""));
}

function buildMarkdownTableFromHtml(html: string): string | null {
  if (!/<table[\s>]/i.test(html)) return null;
  return buildMarkdownTableFromDom(html) ?? buildMarkdownTableFromHtmlFallback(html);
}

function buildMarkdownTableFromDom(html: string): string | null {
  const Parser = (globalThis as {
    DOMParser?: new () => { parseFromString(source: string, type: string): any };
  }).DOMParser;
  if (!Parser) return null;

  const document = new Parser().parseFromString(html, "text/html");
  const table = document.querySelector?.("table");
  if (!table) return null;

  const rows = Array.from(table.querySelectorAll?.("tr") ?? []) as any[];
  const parsed = expandSpannedTableRows(rows.map((row) => parseDomTableCells(row)));
  return buildMarkdownTableFromParsedRows(parsed);
}

function buildMarkdownTableFromHtmlFallback(html: string): string | null {
  const table = html.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  if (!table) return null;

  return buildMarkdownTableFromParsedRows(expandSpannedTableRows(
    Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (match) => parseHtmlTableCells(match[1])),
  ));
}

type TableAlignment = "" | "left" | "center" | "right";

interface ParsedTableRow {
  cells: string[];
  alignments: TableAlignment[];
}

interface ParsedTableCell {
  text: string;
  alignment: TableAlignment;
  colspan: number;
  rowspan: number;
}

function parseDomTableCells(row: any): ParsedTableCell[] {
  const cells: ParsedTableCell[] = [];
  for (const cell of Array.from(row.querySelectorAll?.("th,td") ?? []) as any[]) {
    cells.push({
      text: getDomTableCellText(cell),
      alignment: getDomTableCellAlignment(cell),
      colspan: getTableCellSpan(cell.getAttribute?.("colspan") ?? cell.colSpan),
      rowspan: getTableCellSpan(cell.getAttribute?.("rowspan") ?? cell.rowSpan),
    });
  }
  return cells;
}

function getDomTableCellText(cell: any): string {
  const html = cell.innerHTML;
  const text = html === undefined || html === null
    ? String(cell.textContent ?? "")
    : htmlToPlainText(String(html));
  return normalizePastedTableCell(text);
}

function parseHtmlTableCells(rowHtml: string): ParsedTableCell[] {
  const cells: ParsedTableCell[] = [];
  const cellPattern = /<t([hd])\b([^>]*)>([\s\S]*?)<\/t\1>/gi;
  let cellMatch: RegExpExecArray | null;
  while ((cellMatch = cellPattern.exec(rowHtml))) {
    const attrs = cellMatch[2];
    cells.push({
      text: normalizePastedTableCell(htmlToPlainText(cellMatch[3])),
      alignment: getHtmlTableCellAlignment(attrs),
      colspan: getTableCellSpan(attrs.match(/\bcolspan\s*=\s*["']?(\d+)/i)?.[1]),
      rowspan: getTableCellSpan(attrs.match(/\browspan\s*=\s*["']?(\d+)/i)?.[1]),
    });
  }
  return cells;
}

function expandSpannedTableRows(rows: ParsedTableCell[][]): ParsedTableRow[] {
  const expanded: ParsedTableRow[] = [];
  const rowspans: Array<{ remaining: number; alignment: TableAlignment } | undefined> = [];

  for (const row of rows) {
    const cells: string[] = [];
    const alignments: TableAlignment[] = [];
    let column = 0;

    const consumeRowspans = () => {
      while (rowspans[column]?.remaining) {
        const span = rowspans[column];
        cells.push("");
        alignments.push(span?.alignment ?? "");
        if (span) {
          span.remaining -= 1;
          if (span.remaining <= 0) rowspans[column] = undefined;
        }
        column += 1;
      }
    };

    for (const cell of row) {
      consumeRowspans();
      const colspan = Math.max(1, cell.colspan);
      for (let offset = 0; offset < colspan; offset += 1) {
        cells.push(offset === 0 ? cell.text : "");
        alignments.push(offset === 0 ? cell.alignment : "");
        if (cell.rowspan > 1) {
          rowspans[column + offset] = {
            remaining: cell.rowspan - 1,
            alignment: offset === 0 ? cell.alignment : "",
          };
        }
      }
      column += colspan;
    }
    consumeRowspans();
    if (cells.length > 0) expanded.push({ cells, alignments });
  }

  return expanded;
}

function buildMarkdownTableFromParsedRows(rows: ParsedTableRow[]): string | null {
  const columnCount = Math.max(0, ...rows.map((row) => row.cells.length));
  if (rows.length === 0 || columnCount < 1) return null;

  const paddedRows = rows.map((row) => ({
    cells: [
      ...row.cells,
      ...Array.from({ length: columnCount - row.cells.length }, () => ""),
    ],
    alignments: [
      ...row.alignments,
      ...Array.from({ length: columnCount - row.alignments.length }, () => "" as TableAlignment),
    ],
  }));
  const alignments = Array.from({ length: columnCount }, (_item, index) => (
    paddedRows.find((row) => row.alignments[index])?.alignments[index] ?? ""
  ));

  return [
    buildTableRow(paddedRows[0].cells),
    buildTableRow(alignments.map(formatTableSeparatorCell)),
    ...paddedRows.slice(1).map((row) => buildTableRow(row.cells)),
  ].join("\n");
}

function getTableCellSpan(value: unknown): number {
  const span = Number(value);
  return Number.isFinite(span) && span > 1 ? Math.floor(span) : 1;
}

function getDomTableCellAlignment(cell: any): TableAlignment {
  const attr = cell.getAttribute?.("align");
  const style = cell.getAttribute?.("style");
  const textAlign = cell.style?.textAlign;
  return normalizeTableAlignment(String(attr || textAlign || style || ""));
}

function getHtmlTableCellAlignment(attrs: string): TableAlignment {
  const align = attrs.match(/\balign\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "";
  const styleAlign = attrs.match(/text-align\s*:\s*([^;"']+)/i)?.[1] ?? "";
  return normalizeTableAlignment(align || styleAlign);
}

function normalizeTableAlignment(value: string): TableAlignment {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("center")) return "center";
  if (normalized.includes("right")) return "right";
  if (normalized.includes("left")) return "left";
  return "";
}

function formatTableSeparatorCell(alignment: TableAlignment): string {
  switch (alignment) {
    case "left":
      return ":---";
    case "center":
      return ":---:";
    case "right":
      return "---:";
    default:
      return "---";
  }
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|li|tr)>/gi, " ")
    .replace(/<[^>]+>/g, ""));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizePastedTableCell(value: string): string {
  return value
    .trim()
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ");
}

function normalizeImageWidth(width: string): string {
  const trimmed = width.trim();
  return /^\d+$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

function normalizeQuotePrefix(value: string): string {
  return value.endsWith(" ") ? value : `${value} `;
}

function matchQuotedList(line: string): QuotedListMatch | null {
  const quote = parseQuotePrefix(line);
  if (!quote) return null;

  const rest = line.slice(quote.rawLength);
  const list = rest.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
  if (!list) return null;

  const markerEnd = quote.rawLength + list[0].length;
  return {
    quotePrefix: quote.normalized,
    rawQuoteLength: quote.rawLength,
    listIndent: list[1],
    marker: list[2],
    taskMarker: list[3] ? "[ ] " : "",
    markerEnd,
    content: line.slice(markerEnd),
  };
}

function matchDefinitionListMarkerLine(line: string): DefinitionListMarkerLine | null {
  const quote = parseQuotePrefix(line);
  const content = quote ? line.slice(quote.rawLength) : line;
  const marker = content.match(/^([ \t]{0,3}):(?:[ \t]+|$)/);
  if (!marker) return null;

  return {
    quotePrefix: quote?.normalized ?? "",
    indent: marker[1],
    content: line.slice((quote?.rawLength ?? 0) + marker[0].length),
    markerEnd: (quote?.rawLength ?? 0) + marker[0].length,
  };
}

function matchDefinitionListContinuationLine(line: string): DefinitionListContinuationLine | null {
  const context = getDefinitionListLineContext(line);
  const continuation = context.content.match(/^((?:[ \t]{2,}|\t))(.*)$/);
  if (!continuation) return null;

  return {
    quotePrefix: context.quotePrefix,
    rawQuoteLength: context.rawQuoteLength,
    indent: continuation[1],
    content: continuation[2],
  };
}

function matchListContinuationLine(line: string): ListContinuationLine | null {
  const context = getListContinuationLineContext(line);
  const continuation = context.content.match(/^((?:[ \t]{2,}|\t))(.*)$/);
  if (!continuation) return null;

  return {
    quotePrefix: context.quotePrefix,
    rawQuoteLength: context.rawQuoteLength,
    indent: continuation[1],
    content: continuation[2],
  };
}

function isInsideMarkdownList(
  lines: string[],
  lineIndex: number,
  quotePrefix: string,
  continuationIndent: string,
): boolean {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const context = getListContinuationLineContext(lines[index] ?? "");
    if (context.quotePrefix !== quotePrefix) {
      if (context.content.trim()) return false;
      continue;
    }

    const { body } = splitCarriageReturnEnding(context.content);
    if (!body.trim()) continue;

    const list = body.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/);
    if (list) {
      if (!isMarkdownListMarkerIndentAllowed(lines, index, quotePrefix, list[1])) return false;
      if (getIndentWidth(list[1]) <= getIndentWidth(continuationIndent)) return true;
      continue;
    }

    if (/^(?:[ \t]{2,}|\t)/.test(body)) {
      continue;
    }

    return false;
  }

  return false;
}

function isMarkdownListMarkerIndentAllowed(
  lines: string[],
  lineIndex: number,
  quotePrefix: string,
  indent: string,
): boolean {
  return getIndentWidth(indent) < 4 || isInsideMarkdownList(lines, lineIndex, quotePrefix, indent);
}

function getListContinuationLineContext(line: string): { quotePrefix: string; rawQuoteLength: number; content: string } {
  const quote = parseQuotePrefix(line);
  return {
    quotePrefix: quote?.normalized ?? "",
    rawQuoteLength: quote?.rawLength ?? 0,
    content: quote ? line.slice(quote.rawLength) : line,
  };
}

function isInsideDefinitionList(lines: string[], lineIndex: number, quotePrefix: string): boolean {
  for (let start = lineIndex - 1; start >= 0; start -= 1) {
    const context = getDefinitionListLineContext(lines[start] ?? "");
    if (context.quotePrefix !== quotePrefix) {
      continue;
    }
    if (isDefinitionListMarkerContent(context.content)) {
      return definitionListContainsLine(lines, start, lineIndex, quotePrefix);
    }
  }
  return false;
}

function definitionListContainsLine(
  lines: string[],
  markerIndex: number,
  targetIndex: number,
  quotePrefix: string,
): boolean {
  if (!hasDefinitionListTermBeforeMarker(lines, markerIndex, quotePrefix)) {
    return false;
  }

  let requiresBlockContinuation = false;

  for (let index = markerIndex + 1; index <= targetIndex; index += 1) {
    const context = getDefinitionListLineContext(lines[index] ?? "");
    if (context.quotePrefix !== quotePrefix) return false;
    if (isDefinitionListMarkerContent(context.content)) {
      requiresBlockContinuation = false;
      continue;
    }
    if (isDefinitionListContinuationContent(context.content)) {
      if (requiresBlockContinuation && !isDefinitionListBlockContinuationContent(context.content)) {
        return false;
      }
      requiresBlockContinuation = false;
      continue;
    }
    if (!context.content.trim()) {
      if (!hasFollowingDefinitionListBlockContinuation(lines, index + 1, targetIndex, quotePrefix)) {
        return false;
      }
      requiresBlockContinuation = true;
      continue;
    }
    return false;
  }

  return true;
}

function hasDefinitionListTermBeforeMarker(lines: string[], markerIndex: number, quotePrefix: string): boolean {
  for (let index = markerIndex - 1; index >= 0; index -= 1) {
    const context = getDefinitionListLineContext(lines[index] ?? "");
    if (context.quotePrefix !== quotePrefix) return false;
    if (isDefinitionListMarkerContent(context.content)) continue;
    return isDefinitionListTermContent(context.content);
  }
  return false;
}

function hasFollowingDefinitionListBlockContinuation(
  lines: string[],
  startIndex: number,
  endIndex: number,
  quotePrefix: string,
): boolean {
  for (let index = startIndex; index <= endIndex; index += 1) {
    const context = getDefinitionListLineContext(lines[index] ?? "");
    if (context.quotePrefix !== quotePrefix) return false;
    if (!context.content.trim()) continue;
    return isDefinitionListBlockContinuationContent(context.content);
  }
  return false;
}

function getDefinitionListLineContext(line: string): { quotePrefix: string; rawQuoteLength: number; content: string } {
  const quote = parseQuotePrefix(line);
  return {
    quotePrefix: quote?.normalized ?? "",
    rawQuoteLength: quote?.rawLength ?? 0,
    content: quote ? line.slice(quote.rawLength) : line,
  };
}

function isDefinitionListMarkerContent(content: string): boolean {
  return /^[ \t]{0,3}:(?:[ \t]+|$)/.test(content);
}

function isDefinitionListContinuationContent(content: string): boolean {
  return /^(?:[ \t]{2,}|\t)/.test(content);
}

function isDefinitionListBlockContinuationContent(content: string): boolean {
  return /^(?: {4,}|\t)/.test(content);
}

function isDefinitionListTermContent(content: string): boolean {
  if (!content.trim()) return false;
  if (/^(?: {4,}|\t)/.test(content)) return false;
  if (isDefinitionListMarkerContent(content)) return false;
  return !/^[ \t]{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|(?:-{3,}|\+{3,}|\*{3,}|_{3,})\s*$|\[[^\]\n]+]:\s*\S|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|`{3,}|~{3,}|<|\|)/.test(content);
}

function matchFootnoteDefinitionLine(line: string): { quotePrefix: string; indent: string; markerEnd: number } | null {
  const context = getFootnoteLineContext(line);
  const match = context.content.match(/^([ \t]{0,3})\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/);
  return match
    ? { quotePrefix: context.quotePrefix, indent: match[1], markerEnd: context.rawQuoteLength + match[0].length }
    : null;
}

function matchFootnoteContinuationLine(line: string): { quotePrefix: string; rawQuoteLength: number; indent: string; content: string } | null {
  const context = getFootnoteLineContext(line);
  const continuation = context.content.match(/^((?: {4,}| {0,3}\t))(.*)$/);
  if (!continuation) return null;

  return {
    quotePrefix: context.quotePrefix,
    rawQuoteLength: context.rawQuoteLength,
    indent: continuation[1],
    content: continuation[2],
  };
}

function isInsideFootnoteDefinition(lines: string[], lineIndex: number, quotePrefix: string): boolean {
  for (let start = lineIndex - 1; start >= 0; start -= 1) {
    const context = getFootnoteLineContext(lines[start] ?? "");
    if (context.quotePrefix !== quotePrefix) {
      continue;
    }
    if (isFootnoteDefinitionContent(context.content)) {
      return footnoteDefinitionContainsLine(lines, start, lineIndex, quotePrefix);
    }
  }
  return false;
}

function footnoteDefinitionContainsLine(
  lines: string[],
  startIndex: number,
  targetIndex: number,
  quotePrefix: string,
): boolean {
  let requiresIndentedContinuation = false;

  for (let index = startIndex + 1; index <= targetIndex; index += 1) {
    const context = getFootnoteLineContext(lines[index] ?? "");
    if (context.quotePrefix !== quotePrefix) return false;
    if (isFootnoteIndentedContinuationContent(context.content)) {
      requiresIndentedContinuation = false;
      continue;
    }
    if (!context.content.trim()) {
      if (!hasFollowingFootnoteIndentedContinuation(lines, index + 1, targetIndex, quotePrefix)) return false;
      requiresIndentedContinuation = true;
      continue;
    }
    if (!requiresIndentedContinuation && isFootnoteParagraphContinuationContent(context.content)) {
      continue;
    }
    return false;
  }

  return true;
}

function hasFollowingFootnoteIndentedContinuation(
  lines: string[],
  startIndex: number,
  endIndex: number,
  quotePrefix: string,
): boolean {
  for (let index = startIndex; index <= endIndex; index += 1) {
    const context = getFootnoteLineContext(lines[index] ?? "");
    if (context.quotePrefix !== quotePrefix) return false;
    if (!context.content.trim()) continue;
    return isFootnoteIndentedContinuationContent(context.content);
  }
  return false;
}

function getFootnoteLineContext(line: string): { quotePrefix: string; rawQuoteLength: number; content: string } {
  const quote = parseQuotePrefix(line);
  return {
    quotePrefix: quote?.normalized ?? "",
    rawQuoteLength: quote?.rawLength ?? 0,
    content: quote ? line.slice(quote.rawLength) : line,
  };
}

function isFootnoteDefinitionContent(content: string): boolean {
  return /^[ \t]{0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:/.test(content);
}

function isFootnoteIndentedContinuationContent(content: string): boolean {
  return /^(?: {4,}| {0,3}\t)/.test(content);
}

function isFootnoteParagraphContinuationContent(content: string): boolean {
  if (!content.trim()) return false;
  if (isFootnoteIndentedContinuationContent(content)) return true;
  return !isFootnoteInterruptingBlockContent(content.replace(/^ {0,3}/, ""));
}

function isFootnoteInterruptingBlockContent(content: string): boolean {
  return Boolean(readDollarMathBlockOpening(content))
    || /^(?:#{1,6}\s|(?:[-*+]|\d+[.)])\s+|>\s?|`{3,}|~{3,}|\\\[\s*$|(?:-{3,}|\+{3,}|\*{3,}|_{3,})\s*$|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|\[[^\]\n]+]:\s*\S|<!--|<\/?[A-Za-z][^>\n]*>)/.test(content);
}


function parseQuotePrefix(line: string): {
  rawLength: number;
  normalized: string;
  depth: number;
  contentColumn: number;
} | null {
  const quote = readMarkdownBlockquotePrefix(line);
  if (!quote) return null;
  const leading = quote.raw.match(/^[ \t]*/)?.[0] ?? "";
  return {
    rawLength: quote.raw.length,
    normalized: `${leading}${"> ".repeat(quote.depth)}`,
    depth: quote.depth,
    contentColumn: quote.contentColumn,
  };
}

function getSoftBreakContinuation(value: string, lineStart: number, beforeCursor: string): string {
  const lines = value.split("\n");
  const lineIndex = findLineIndex(lines, lineStart);
  const quote = parseQuotePrefix(beforeCursor);
  if (quote) {
    const list = beforeCursor.slice(quote.rawLength).match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
    if (list && isMarkdownListMarkerIndentAllowed(lines, lineIndex, quote.normalized, list[1])) {
      return `${quote.normalized}${list[1]}${" ".repeat(list[2].length + 1 + (list[3]?.length ?? 0))}`;
    }
    const definition = matchDefinitionListMarkerLine(beforeCursor);
    if (definition) {
      return `${definition.quotePrefix}${definition.indent}  `;
    }
    const footnote = matchFootnoteDefinitionLine(beforeCursor);
    if (footnote) {
      return `${footnote.quotePrefix}    `;
    }
    const continuation = getSoftBreakBlockContinuation(value, lineStart, beforeCursor);
    if (continuation) return continuation;
    return quote.normalized;
  }

  const list = beforeCursor.match(/^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/);
  if (list && isMarkdownListMarkerIndentAllowed(lines, lineIndex, "", list[1])) {
    return `${list[1]}${" ".repeat(list[2].length + 1 + (list[3]?.length ?? 0))}`;
  }

  const definition = matchDefinitionListMarkerLine(beforeCursor);
  if (definition) {
    return `${definition.indent}  `;
  }
  const footnote = matchFootnoteDefinitionLine(beforeCursor);
  if (footnote) {
    return "    ";
  }
  const continuation = getSoftBreakBlockContinuation(value, lineStart, beforeCursor);
  if (continuation) return continuation;

  return "";
}

function getSoftBreakBlockContinuation(value: string, lineStart: number, beforeCursor: string): string {
  const lines = value.split("\n");
  const lineIndex = findLineIndex(lines, lineStart);
  const list = matchListContinuationLine(beforeCursor);
  if (list && isInsideMarkdownList(lines, lineIndex, list.quotePrefix, list.indent)) {
    return `${list.quotePrefix}${list.indent}`;
  }

  const definition = matchDefinitionListContinuationLine(beforeCursor);
  if (definition && isInsideDefinitionList(lines, lineIndex, definition.quotePrefix)) {
    return `${definition.quotePrefix}${definition.indent}`;
  }

  const footnote = matchFootnoteContinuationLine(beforeCursor);
  if (footnote && isInsideFootnoteDefinition(lines, lineIndex, footnote.quotePrefix)) {
    return `${footnote.quotePrefix}${footnote.indent}`;
  }

  return "";
}

function getSingleIndentRemoval(indent: string, indentSize = 2): number {
  const normalizedIndentSize = indentSize === 4 ? 4 : 2;
  return indent.startsWith("\t") ? 1 : Math.min(normalizedIndentSize, indent.length);
}

function shouldInsertPlainApostrophe(state: TextState): boolean {
  if (state.selectionStart !== state.selectionEnd) return false;
  const before = state.value[state.selectionStart - 1] ?? "";
  const after = state.value[state.selectionStart] ?? "";
  return isWordCharacter(before) || isWordCharacter(after);
}

function isWordCharacter(value: string): boolean {
  return /[\p{L}\p{N}_]/u.test(value);
}

function setHtmlImageWidth(tag: string, width: string): string {
  if (/\swidth\s*=/i.test(tag)) {
    return tag.replace(/\swidth\s*=\s*(".*?"|'.*?'|[^\s>]+)/i, ` width="${escapeAttribute(width)}"`);
  }

  const end = tag.match(/\s*\/?>$/)?.[0] ?? ">";
  const body = tag.slice(0, tag.length - end.length).trimEnd();
  const closing = end.includes("/") ? " />" : ">";
  return `${body} width="${escapeAttribute(width)}"${closing}`;
}

interface TableRange {
  start: number;
  end: number;
  separator: number;
  lineIndex: number;
  prefix: string;
  rowFormat: TableRowFormat;
}

interface TableCellTarget {
  line: number;
  column: number;
  addRow?: boolean;
}

interface TextRange {
  start: number;
  end: number;
}

interface IndexRange {
  start: number;
  end: number;
}

function findTableRangeForSelection(value: string, selectionStart: number, selectionEnd: number): TableRange | null {
  const tableAtStart = findTableRange(value, selectionStart);
  if (tableAtStart) return tableAtStart;

  if (selectionEnd === selectionStart) return null;
  return findTableRange(value, Math.max(selectionStart, selectionEnd - 1));
}

function getCurrentTableCellRange(value: string, selectionStart: number, selectionEnd: number): TextRange | null {
  const table = findTableRangeForSelection(value, selectionStart, selectionEnd);
  if (!table || table.lineIndex === table.separator) return null;

  const lines = value.split("\n");
  const line = lines[table.lineIndex] ?? "";
  if (!line.trim()) return null;

  const lineStart = getLineStartOffset(lines, table.lineIndex);
  const column = getActiveTableColumnIndex(lines, table, selectionStart);
  return getTableCellContentRange(line, column, lineStart, table.rowFormat);
}

function getSelectedTableBodyRowRange(
  lines: string[],
  table: TableRange,
  selectionStart: number,
  selectionEnd: number,
): IndexRange | null {
  const lineRange = getSelectedLineIndexRange(lines, selectionStart, selectionEnd);
  const start = Math.max(lineRange.start, table.separator + 1);
  const end = Math.min(lineRange.end, table.end);
  return start <= end ? { start, end } : null;
}

function getSelectedTableRowRange(
  lines: string[],
  table: TableRange,
  selectionStart: number,
  selectionEnd: number,
): IndexRange {
  const lineRange = getSelectedLineIndexRange(lines, selectionStart, selectionEnd);
  return {
    start: Math.max(lineRange.start, table.start),
    end: Math.min(lineRange.end, table.end),
  };
}

function getSelectedTableColumnRange(
  lines: string[],
  table: TableRange,
  selectionStart: number,
  selectionEnd: number,
): IndexRange {
  const headerCells = splitTableRow(lines[table.start] ?? "");
  const lastColumn = Math.max(0, headerCells.length - 1);
  const endOffset = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
  const startColumn = getTableColumnAtOffset(lines, table, selectionStart);
  const endColumn = getTableColumnAtOffset(lines, table, endOffset);

  return {
    start: Math.min(startColumn, endColumn, lastColumn),
    end: Math.min(Math.max(startColumn, endColumn), lastColumn),
  };
}

function getSelectedLineIndexRange(lines: string[], selectionStart: number, selectionEnd: number): IndexRange {
  const endOffset = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
  return {
    start: findLineIndex(lines, selectionStart),
    end: findLineIndex(lines, Math.max(selectionStart, endOffset)),
  };
}

function getTableColumnAtOffset(lines: string[], table: TableRange, offset: number): number {
  const headerCells = splitTableRow(lines[table.start] ?? "");
  const lastColumn = Math.max(0, headerCells.length - 1);
  const lineIndex = findLineIndex(lines, offset);
  if (lineIndex < table.start) return 0;
  if (lineIndex > table.end) return lastColumn;

  const line = lines[lineIndex] ?? "";
  const context = getTableLineContext(line);
  if (context.prefix !== table.prefix || !isTableRowContent(context.content)) {
    return lineIndex <= table.start ? 0 : lastColumn;
  }

  return Math.min(getTableColumnIndex(line, getCursorColumn(lines, offset), table.rowFormat), lastColumn);
}

function getTableEndOffset(lines: string[], table: TableRange): number {
  return table.end + 1 < lines.length
    ? getLineStartOffset(lines, table.end + 1)
    : getLineStartOffset(lines, table.end) + (lines[table.end]?.length ?? 0);
}

function getLineContentEndOffset(lines: string[], lineIndex: number): number {
  const line = lines[lineIndex] ?? "";
  const contentLength = line.endsWith("\r") ? line.length - 1 : line.length;
  return getLineStartOffset(lines, lineIndex) + contentLength;
}

function findTableRange(value: string, cursor: number): TableRange | null {
  const lines = value.split("\n");
  const lineIndex = findLineIndex(lines, cursor);
  const context = getTableLineContext(lines[lineIndex] ?? "");
  if (!isTableRowContent(context.content)) return null;

  let rangeStart = lineIndex;
  let rangeEnd = lineIndex;
  while (rangeStart > 0 && isTableLineInContext(lines[rangeStart - 1], context.prefix)) rangeStart -= 1;
  while (rangeEnd + 1 < lines.length && isTableLineInContext(lines[rangeEnd + 1], context.prefix)) rangeEnd += 1;

  for (let separator = rangeStart + 1; separator <= rangeEnd; separator += 1) {
    if (!isTableSeparatorContent(getTableLineContext(lines[separator]).content)) continue;

    const start = separator - 1;
    if (lineIndex < start || lineIndex > rangeEnd) continue;
      return {
        start,
        end: rangeEnd,
        separator,
        lineIndex,
        prefix: context.prefix,
        rowFormat: getTableRowFormat(getTableLineContext(lines[start] ?? "").content),
      };
  }

  return null;
}

function isTableLineInContext(line: string, prefix: string): boolean {
  const context = getTableLineContext(line);
  return context.prefix === prefix && isTableRowContent(context.content);
}

function getTableRowFormat(content: string): TableRowFormat {
  return {
    leadingPipe: /^\s*\|/.test(content),
    trailingPipe: hasTrailingTablePipe(content),
  };
}

function findLineIndex(lines: string[], cursor: number): number {
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = offset + lines[index].length;
    if (cursor <= lineEnd || index === lines.length - 1) return index;
    offset = lineEnd + 1;
  }
  return Math.max(0, lines.length - 1);
}

function getOrderedListStartNumberAtLine(value: string, lineIndex: number): string | null {
  const lines = value.split("\n");
  if (!isListBlockLineForRenumber(lines[lineIndex] ?? "")) return null;

  let start = lineIndex;
  let end = lineIndex;
  while (start > 0 && isListBlockLineForRenumber(lines[start - 1])) start -= 1;
  while (end + 1 < lines.length && isListBlockLineForRenumber(lines[end + 1])) end += 1;

  let baseWidth = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    const match = lines[index].match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (match) {
      baseWidth = Math.min(baseWidth, getIndentWidth(match[1]));
    }
  }
  if (!Number.isFinite(baseWidth)) return null;

  for (let index = start; index <= end; index += 1) {
    const ordered = lines[index].match(/^(\s*)(\d+)[.)]\s+/);
    if (ordered && getIndentWidth(ordered[1]) === baseWidth) {
      return normalizeOrderedListNumber(ordered[2]);
    }
  }

  return null;
}

function isListBlockLineForRenumber(line: string): boolean {
  return Boolean(line.trim()) && (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line) || /^\s{2,}\S/.test(line));
}

function renumberOrderedListLines(
  value: string,
  startLine: number,
  indent: string,
  startNumber: string,
  delimiter: string,
): string {
  const lines = value.split("\n");
  let nextNumber = startNumber;

  for (let index = startLine; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(\d+)([.)])(\s+)/);
    if (!match) {
      if (!lines[index].trim() || isNestedListContinuation(lines[index], indent)) continue;
      break;
    }

    if (match[1] !== indent || match[3] !== delimiter) {
      if (isDeeperIndent(match[1], indent)) continue;
      break;
    }

    lines[index] = `${indent}${nextNumber}${delimiter}${match[4]}${lines[index].slice(match[0].length)}`;
    nextNumber = incrementOrderedListNumber(nextNumber);
  }

  return lines.join("\n");
}

function renumberQuotedOrderedListLines(
  value: string,
  startLine: number,
  quotePrefix: string,
  indent: string,
  startNumber: string,
  delimiter: string,
): string {
  const lines = value.split("\n");
  let nextNumber = startNumber;
  const markerPattern = new RegExp(`^${quotePrefixPattern(quotePrefix)}(\\s*)(\\d+)([.)])(\\s+)`);

  for (let index = startLine; index < lines.length; index += 1) {
    const match = lines[index].match(markerPattern);
    if (!match) {
      if (!lines[index].trim() || isQuotedNestedListContinuation(lines[index], quotePrefix, indent)) continue;
      break;
    }

    if (match[1] !== indent || match[3] !== delimiter) {
      if (isDeeperIndent(match[1], indent)) continue;
      break;
    }

    lines[index] = `${quotePrefix}${indent}${nextNumber}${delimiter}${match[4]}${lines[index].slice(match[0].length)}`;
    nextNumber = incrementOrderedListNumber(nextNumber);
  }

  return lines.join("\n");
}

function quotePrefixPattern(quotePrefix: string): string {
  const leading = quotePrefix.match(/^\s*/)?.[0] ?? "";
  const quoteCount = quotePrefix.match(/>/g)?.length ?? 0;
  return `${escapeRegExp(leading)}${Array.from({ length: quoteCount }, () => ">[ \\t]?").join("")}`;
}

function collectLineChunks(value: string): string[] {
  if (!value) return [""];

  const chunks: string[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\n") continue;
    chunks.push(value.slice(start, index + 1));
    start = index + 1;
  }
  if (start < value.length) {
    chunks.push(value.slice(start));
  }
  return chunks.length > 0 ? chunks : [""];
}

function getSelectedLineIndexes(
  chunks: string[],
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd));
  const end = Math.max(0, Math.max(selectionStart, selectionEnd));
  const endCursor = end > start ? end - 1 : end;
  return {
    start: getChunkIndexAtOffset(chunks, start),
    end: getChunkIndexAtOffset(chunks, endCursor),
  };
}

function getChunkIndexAtOffset(chunks: string[], offset: number): number {
  let cursor = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const next = cursor + chunks[index].length;
    if (offset < next || index === chunks.length - 1) return index;
    cursor = next;
  }
  return Math.max(0, chunks.length - 1);
}

function getChunkStartOffset(chunks: string[], lineIndex: number): number {
  return chunks.slice(0, lineIndex).join("").length;
}

function getChunkEndOffset(chunks: string[], lineIndex: number): number {
  return chunks.slice(0, lineIndex + 1).join("").length;
}

function getChunkContentEndOffset(chunks: string[], lineIndex: number): number {
  const end = getChunkEndOffset(chunks, lineIndex);
  const chunk = chunks[lineIndex] ?? "";
  return chunk.endsWith("\n") ? end - (chunk.endsWith("\r\n") ? 2 : 1) : end;
}

function isBlankLineChunk(chunk: string): boolean {
  return chunk.replace(/\r?\n$/, "").trim() === "";
}

function hasTrailingLineBreak(chunk: string): boolean {
  return /\r?\n$/.test(chunk);
}

function getTrailingLineBreak(chunk: string): "\n" | "\r\n" {
  return chunk.endsWith("\r\n") ? "\r\n" : "\n";
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

function startsWithLineBreak(value: string): boolean {
  return value.startsWith("\n") || value.startsWith("\r");
}

function sliceAfterRemovedLinePreservingBreak(value: string, end: number): string {
  return value[end] === "\n" && value[end - 1] === "\r" ? `\r${value.slice(end)}` : value.slice(end);
}

function trimCarriageReturnBeforeLineBreak(value: string, end: number): number {
  return value[end] === "\n" && value[end - 1] === "\r" ? end - 1 : end;
}

function normalizeGeneratedLineBreaks(value: string, lineBreak: "\n" | "\r\n"): string {
  return value.replace(/\r\n|\r|\n/g, lineBreak);
}

function insertLinePreservingBreak(
  value: string,
  lines: string[],
  insertAt: number,
  line: string,
): void {
  let nextLine = line;
  if (getPreferredLineBreak(value) === "\r\n") {
    if (insertAt > 0 && lines[insertAt - 1] && !lines[insertAt - 1].endsWith("\r")) {
      lines[insertAt - 1] = `${lines[insertAt - 1]}\r`;
    }
    if (insertAt < lines.length) {
      nextLine = `${line}\r`;
    }
  }
  lines.splice(insertAt, 0, nextLine);
}

function withExistingLineEnding(existingLine: string | undefined, line: string): string {
  return existingLine?.endsWith("\r") ? `${line}\r` : line;
}

function splitCarriageReturnEnding(line: string): { body: string; ending: "" | "\r" } {
  return line.endsWith("\r")
    ? { body: line.slice(0, -1), ending: "\r" }
    : { body: line, ending: "" };
}

function getLineStartOffset(lines: string[], lineIndex: number): number {
  return lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0);
}

function isNestedListContinuation(line: string, indent: string): boolean {
  const lineIndent = line.match(/^\s*/)?.[0] ?? "";
  return isDeeperIndent(lineIndent, indent);
}

function isQuotedNestedListContinuation(line: string, quotePrefix: string, indent: string): boolean {
  if (!line.startsWith(quotePrefix)) return false;
  const content = line.slice(quotePrefix.length);
  if (!content.trim()) return true;
  const lineIndent = content.match(/^\s*/)?.[0] ?? "";
  return isDeeperIndent(lineIndent, indent);
}

function isDeeperIndent(lineIndent: string, baseIndent: string): boolean {
  if (!lineIndent.startsWith(baseIndent)) return false;
  return getIndentWidth(lineIndent) > getIndentWidth(baseIndent);
}

function getIndentWidth(value: string): number {
  return getMarkdownIndentWidth(value);
}

type RawFenceState =
  | { kind: "code"; marker: string; quoteDepth: number; listContinuationWidth: number }
  | { kind: "math"; marker: "$$" | "\\["; quoteDepth: number; listContinuationWidth: number };

interface RawFenceUnwrapEdit {
  start: number;
  end: number;
  text: string;
}

interface RawFenceBlockRange {
  openStart: number;
  openEnd: number;
  closeStart: number;
  closeEnd: number;
  unwrapEdits: RawFenceUnwrapEdit[];
}

type RawHtmlState =
  | { kind: "untilBlank"; quotePrefix: string }
  | { kind: "untilClose"; quotePrefix: string; closePattern: RegExp };

interface RawFenceLine {
  quotePrefix: string;
  quoteDepth: number;
  content: string;
  contentColumn: number;
  trimmed: string;
}

interface RawFenceContent {
  content: string;
  contentColumn: number;
}
interface RawFenceOpening {
  context: RawFenceLine;
  fence: RawFenceState;
  openingContent: string;
  listMarkerPrefix: string;
}

function getRawFenceOpeningAtLine(
  lines: string[],
  lineIndex: number,
): RawFenceOpening | null {
  const line = (lines[lineIndex] ?? "").replace(/\r$/, "");
  const context = getRawFenceLine(line);
  const baseWidth = getEnclosingMarkdownListContinuationWidth(
    lines,
    lineIndex,
    line,
    context,
  );
  if (baseWidth !== null) {
    const stripped = stripMarkdownIndentColumns(
      context.content,
      baseWidth,
      context.contentColumn,
    );
    if (stripped) {
      const adjusted: RawFenceLine = {
        ...context,
        content: stripped.content,
        contentColumn: context.contentColumn + baseWidth,
        trimmed: stripped.content.trim(),
      };
      const nested = getRawFenceOpen(adjusted);
      if (nested) {
        const container = stripMarkdownListContainerMarkers(
          adjusted.content,
          adjusted.contentColumn,
        );
        return {
          context,
          fence: {
            ...nested,
            listContinuationWidth: baseWidth + nested.listContinuationWidth,
          },
          openingContent: container.content,
          listMarkerPrefix: container.prefixLength > 0
            ? context.quotePrefix
              + context.content.slice(0, stripped.prefixLength)
              + adjusted.content.slice(0, container.prefixLength)
            : "",
        };
      }
    }
  }

  const direct = getRawFenceOpen(context);
  if (!direct) return null;
  const container = stripMarkdownListContainerMarkers(
    context.content,
    context.contentColumn,
  );
  return {
    context,
    fence: direct,
    openingContent: container.content,
    listMarkerPrefix: container.prefixLength > 0
      ? context.quotePrefix + context.content.slice(0, container.prefixLength)
      : "",
  };
}

function getEnclosingMarkdownListContinuationWidth(
  lines: string[],
  lineIndex: number,
  line: string,
  context: RawFenceLine,
): number | null {
  const quote = parseQuotePrefix(line);
  const quotePrefix = quote?.normalized ?? "";
  const currentIndent = getLeadingMarkdownIndent(context.content);
  if (!isInsideMarkdownList(lines, lineIndex, quotePrefix, currentIndent)) {
    return null;
  }

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previousLine = (lines[index] ?? "").replace(/\r$/, "");
    const previous = getRawFenceLine(previousLine);
    if (previous.quoteDepth !== context.quoteDepth) {
      if (previousLine.trim()) return null;
      continue;
    }
    if (!previous.content.trim()) continue;

    const container = stripMarkdownListContainerMarkers(
      previous.content,
      previous.contentColumn,
    );
    if (container.prefixLength > 0) {
      return stripMarkdownIndentColumns(
        context.content,
        container.continuationIndentWidth,
        context.contentColumn,
      )
        ? container.continuationIndentWidth
        : null;
    }
    if (/^[ \t]+/.test(previous.content)) continue;
    return null;
  }
  return null;
}

function hasUnclosedCodeFenceBefore(value: string, lineStart: number, fenceChar: string): boolean {
  const fence = getActiveRawFenceAtLine(value, lineStart);
  return fence?.kind === "code" && fence.marker[0] === fenceChar;
}

function hasUnclosedMathFenceBefore(value: string, lineStart: number): boolean {
  const fence = getActiveRawFenceAtLine(value, lineStart);
  return fence?.kind === "math" && fence.marker === "$$";
}

function hasUnclosedBracketMathFenceBefore(value: string, lineStart: number): boolean {
  const fence = getActiveRawFenceAtLine(value, lineStart);
  return fence?.kind === "math" && fence.marker === "\\[";
}

function getActiveRawFenceAtLine(value: string, lineStart: number): RawFenceState | null {
  const fence = getUnclosedRawFenceBefore(value, lineStart);
  if (!fence) return null;
  const lineEnd = value.indexOf("\n", lineStart);
  const currentLine = value
    .slice(lineStart, lineEnd < 0 ? value.length : lineEnd)
    .replace(/\r$/, "");
  const context = getRawFenceLine(currentLine, fence.quoteDepth);
  return getRawFenceContinuationContent(context, fence) ? fence : null;
}

function isInsideMarkdownRawFence(value: string, lineStart: number): boolean {
  return getActiveRawFenceAtLine(value, lineStart) !== null;
}

function isInsideMarkdownRawBlock(value: string, lineStart: number): boolean {
  const frontMatter = findMarkdownFrontMatterRange(value);
  return isInsideMarkdownRawFence(value, lineStart)
    || getUnclosedRawHtmlBlockBefore(value, lineStart) !== null
    || Boolean(
      frontMatter && lineStart >= frontMatter.contentStart && lineStart < frontMatter.closingEnd,
    );
}

function findClosedRawFenceBlock(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  kind: "code" | "math",
): RawFenceBlockRange | null {
  const chunks = collectLineChunks(value);
  const lines = chunks.map((chunk) => stripLineBreak(chunk));
  let active: (RawFenceState & { openLine: number }) | null = null;
  const targetStart = Math.max(0, Math.min(selectionStart, selectionEnd));
  const targetEnd = Math.max(0, Math.max(selectionStart, selectionEnd));

  for (let index = 0; index < chunks.length; index += 1) {
    const line = lines[index] ?? "";
    let context = getRawFenceLine(line, active?.quoteDepth ?? null);
    if (active) {
      const continuation = getRawFenceContinuationContent(context, active);
      if (continuation && isRawFenceClose(context, active)) {
        const openStart = getChunkStartOffset(chunks, active.openLine);
        const closeEnd = getChunkEndOffset(chunks, index);
        const collapsedAfterClosingLine = targetStart === targetEnd && targetStart === closeEnd && hasTrailingLineBreak(chunks[index] ?? "");
        if (active.kind === kind && targetStart >= openStart && targetEnd <= closeEnd && !collapsedAfterClosingLine) {
          const openEnd = getChunkEndOffset(chunks, active.openLine);
          const closeStart = getChunkStartOffset(chunks, index);
          return {
            openStart,
            openEnd,
            closeStart,
            closeEnd,
            unwrapEdits: getRawFenceUnwrapEdits(
              chunks,
              active.openLine,
              index,
              active,
              openStart,
              openEnd,
              closeStart,
              closeEnd,
            ),
          };
        }
        active = null;
      }
      if (continuation) continue;
      active = null;
      context = getRawFenceLine(line);
    }

    const opening = getRawFenceOpeningAtLine(lines, index);
    if (opening) {
      active = { ...opening.fence, openLine: index };
    }
  }

  return null;
}

function getRawFenceUnwrapEdits(
  chunks: string[],
  openLine: number,
  closeLine: number,
  fence: RawFenceState,
  openStart: number,
  openEnd: number,
  closeStart: number,
  closeEnd: number,
): RawFenceUnwrapEdit[] {
  const lines = chunks.map((chunk) => stripLineBreak(chunk));
  const opening = getRawFenceOpeningAtLine(lines, openLine);
  const openingText = opening?.listMarkerPrefix ?? "";
  const edits: RawFenceUnwrapEdit[] = [
    { start: openStart, end: openEnd, text: openingText },
  ];

  if (openingText && closeLine > openLine + 1) {
    const firstLine = openLine + 1;
    const firstStart = getChunkStartOffset(chunks, firstLine);
    const first = getRawFenceLine(
      stripLineBreak(chunks[firstLine] ?? ""),
      fence.quoteDepth,
    );
    const stripped = stripMarkdownIndentColumns(
      first.content,
      fence.listContinuationWidth,
      first.contentColumn,
    );
    if (stripped) {
      const remaining = first.content.slice(stripped.prefixLength);
      const synthetic = stripped.content.slice(
        0,
        Math.max(0, stripped.content.length - remaining.length),
      );
      edits.push({
        start: firstStart,
        end: firstStart + first.quotePrefix.length + stripped.prefixLength,
        text: synthetic,
      });
    }
  }

  edits.push({ start: closeStart, end: closeEnd, text: "" });
  return edits;
}
function getRawFenceOpen(line: RawFenceLine): RawFenceState | null {
  const container = stripMarkdownListContainerMarkers(line.content, line.contentColumn);
  const content = container.content;
  const contentColumn = line.contentColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(content, contentColumn)) return null;
  const indent = getLeadingMarkdownIndent(content);
  const semantic = content.slice(indent.length);
  const code = semantic.match(/^(`{3,}|~{3,})([^\r\n]*)$/);
  if (code && !(code[1][0] === "`" && code[2].includes("`"))) {
    return {
      kind: "code",
      marker: code[1],
      quoteDepth: line.quoteDepth,
      listContinuationWidth: container.continuationIndentWidth,
    };
  }
  if (readDollarMathBlockOpening(content, 3, contentColumn)) {
    return {
      kind: "math",
      marker: "$$",
      quoteDepth: line.quoteDepth,
      listContinuationWidth: container.continuationIndentWidth,
    };
  }
  if (/^\\\[\s*$/.test(semantic)) {
    return {
      kind: "math",
      marker: "\\[",
      quoteDepth: line.quoteDepth,
      listContinuationWidth: container.continuationIndentWidth,
    };
  }
  return null;
}

function stripLineBreak(value: string): string {
  return value.replace(/\r?\n$/, "");
}

function getUnclosedRawFenceBefore(value: string, lineStart: number): RawFenceState | null {
  const beforeLine = value.slice(0, lineStart).replace(/\r?\n$/, "");
  const lines = beforeLine ? beforeLine.split(/\r?\n/) : [];
  let active: RawFenceState | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    let context = getRawFenceLine(line, active?.quoteDepth ?? null);
    if (active) {
      const continuation = getRawFenceContinuationContent(context, active);
      if (continuation) {
        if (isRawFenceClose(context, active)) active = null;
        continue;
      }
      active = null;
      context = getRawFenceLine(line);
    }
    active = getRawFenceOpeningAtLine(lines, index)?.fence ?? null;
  }

  return active;
}

function getRawFenceLine(
  line: string,
  maximumQuoteDepth: number | null = null,
): RawFenceLine {
  const quote = readMarkdownBlockquotePrefix(line, maximumQuoteDepth);
  const content = quote ? line.slice(quote.raw.length) : line;
  return {
    quotePrefix: quote?.raw ?? "",
    quoteDepth: quote?.depth ?? 0,
    content,
    contentColumn: quote?.contentColumn ?? 0,
    trimmed: content.trim(),
  };
}

function getRawFenceContinuationContent(
  line: RawFenceLine,
  fence: RawFenceState,
): RawFenceContent | null {
  if (line.quoteDepth !== fence.quoteDepth) return null;
  if (fence.listContinuationWidth === 0 || !line.content.trim()) {
    return { content: line.content, contentColumn: line.contentColumn };
  }
  const stripped = stripMarkdownIndentColumns(
    line.content,
    fence.listContinuationWidth,
    line.contentColumn,
  );
  return stripped
    ? {
      content: stripped.content,
      contentColumn: line.contentColumn + fence.listContinuationWidth,
    }
    : null;
}

function isRawFenceClose(line: RawFenceLine, fence: RawFenceState): boolean {
  const continuation = getRawFenceContinuationContent(line, fence);
  if (!continuation) return false;
  const { content, contentColumn } = continuation;
  if (isMarkdownCodeIndented(content, contentColumn)) return false;
  const indent = getLeadingMarkdownIndent(content);
  const semantic = content.slice(indent.length);

  if (fence.kind === "math") {
    return fence.marker === "$$"
      ? isDollarMathBlockClosing(content, 3, contentColumn)
      : /^\\\]\s*$/.test(semantic);
  }

  const closing = semantic.match(/^(`{3,}|~{3,})[ \t]*$/);
  return Boolean(closing && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length);
}

function getUnclosedRawHtmlBlockBefore(value: string, lineStart: number): RawHtmlState | null {
  const beforeLine = value.slice(0, lineStart).replace(/\r?\n$/, "");
  const lines = beforeLine ? beforeLine.split(/\r?\n/) : [];
  let active: RawHtmlState | null = null;

  for (const line of lines) {
    const activeQuoteDepth = active
      ? readMarkdownBlockquotePrefix(active.quotePrefix)?.depth ?? 0
      : null;
    const context = getRawFenceLine(line, activeQuoteDepth);
    if (active) {
      if (context.quoteDepth !== activeQuoteDepth) {
        active = null;
      } else {
        if (isRawHtmlBlockClose(context, active)) {
          active = null;
        }
        continue;
      }
    }

    const opening = getRawHtmlBlockOpen(context);
    if (opening && !isRawHtmlBlockClose(context, opening)) {
      active = opening;
    }
  }

  return active;
}

function getRawHtmlBlockOpen(line: RawFenceLine): RawHtmlState | null {
  if (!/^[ \t]{0,3}</.test(line.content)) return null;
  const content = line.content.trimStart();

  if (/^<!--/.test(content)) return { kind: "untilClose", quotePrefix: line.quotePrefix, closePattern: /-->/ };
  if (/^<\?/.test(content)) return { kind: "untilClose", quotePrefix: line.quotePrefix, closePattern: /\?>/ };
  if (/^<![A-Z]/.test(content)) return { kind: "untilClose", quotePrefix: line.quotePrefix, closePattern: />/ };
  if (/^<!\[CDATA\[/.test(content)) return { kind: "untilClose", quotePrefix: line.quotePrefix, closePattern: /\]\]>/ };

  const rawTag = content.match(/^<(script|pre|style|textarea)(?=[\s>/])/i);
  if (rawTag) {
    return {
      kind: "untilClose",
      quotePrefix: line.quotePrefix,
      closePattern: new RegExp(`</${rawTag[1]}\\s*>`, "i"),
    };
  }

  if (/^<\/?(address|article|aside|audio|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul|video)(?=[\s>/])/i.test(content)) {
    return { kind: "untilBlank", quotePrefix: line.quotePrefix };
  }

  return null;
}

function isRawHtmlBlockClose(line: RawFenceLine, block: RawHtmlState): boolean {
  if (block.kind === "untilBlank") return !line.content.trim();
  return block.closePattern.test(line.content);
}

function getCursorColumn(lines: string[], cursor: number): number {
  const lineIndex = findLineIndex(lines, cursor);
  return cursor - getLineStartOffset(lines, lineIndex);
}

function getTableColumnIndex(line: string, cursorColumn: number, format?: TableRowFormat): number {
  const context = getTableLineContext(line);
  const contentColumn = Math.max(0, cursorColumn - context.rawPrefixLength);
  const beforeCursor = context.content.slice(0, contentColumn);
  const pipeCount = countUnescapedPipes(beforeCursor);
  const leadingPipe = format?.leadingPipe ?? /^\s*\|/.test(context.content);
  if (leadingPipe) {
    return Math.max(0, pipeCount - 1);
  }
  return Math.max(0, pipeCount);
}

function getActiveTableColumnIndex(lines: string[], table: TableRange, cursor: number): number {
  const headerCells = splitTableRow(lines[table.start]);
  const line = lines[table.lineIndex] ?? lines[table.start];
  const rawIndex = getTableColumnIndex(line, getCursorColumn(lines, cursor), table.rowFormat);
  return Math.min(Math.max(0, rawIndex), Math.max(0, headerCells.length - 1));
}

function findNavigableTableCell(
  lines: string[],
  table: TableRange,
  columnIndex: number,
  direction: MarkdownTableCellDirection,
): TableCellTarget | null {
  const columnCount = splitTableRow(lines[table.start]).length;
  const lastColumn = Math.max(0, columnCount - 1);
  const column = Math.min(Math.max(0, columnIndex), lastColumn);

  if (direction === "previous") {
    if (table.lineIndex === table.separator) {
      return { line: table.start, column: lastColumn };
    }
    if (column > 0) {
      return { line: table.lineIndex, column: column - 1 };
    }

    const previousLine = findPreviousEditableTableLine(table, table.lineIndex);
    return previousLine === null ? null : { line: previousLine, column: lastColumn };
  }

  if (table.lineIndex === table.separator) {
    const nextLine = findNextEditableTableLine(table, table.lineIndex);
    return nextLine === null ? { line: table.end + 1, column: 0, addRow: true } : { line: nextLine, column: 0 };
  }
  if (column < lastColumn) {
    return { line: table.lineIndex, column: column + 1 };
  }

  const nextLine = findNextEditableTableLine(table, table.lineIndex);
  return nextLine === null ? { line: table.end + 1, column: 0, addRow: true } : { line: nextLine, column: 0 };
}

function findNextEditableTableLine(table: TableRange, lineIndex: number): number | null {
  for (let index = lineIndex + 1; index <= table.end; index += 1) {
    if (index !== table.separator) return index;
  }
  return null;
}

function findPreviousEditableTableLine(table: TableRange, lineIndex: number): number | null {
  for (let index = lineIndex - 1; index >= table.start; index -= 1) {
    if (index !== table.separator) return index;
  }
  return null;
}

function getTableCellContentRange(line: string, columnIndex: number, lineStart: number, format?: TableRowFormat): TextRange {
  const context = getTableLineContext(line);
  const content = context.content;
  const pipes: number[] = [];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscapedAt(content, index)) {
      pipes.push(index);
    }
  }

  if (pipes.length < 1) {
    return { start: lineStart, end: lineStart };
  }

  const leadingPipe = format?.leadingPipe ?? /^\s*\|/.test(content);
  const trailingPipe = format?.trailingPipe ?? hasTrailingTablePipe(content);
  const cellCount = format
    ? getFormattedTableCellCount(pipes.length, leadingPipe, trailingPipe)
    : splitTableRow(line).length;
  const cellIndex = Math.min(Math.max(0, columnIndex), Math.max(0, cellCount - 1));
  const rawStart = leadingPipe
    ? (pipes[cellIndex] ?? -1) + 1
    : cellIndex === 0
      ? 0
      : (pipes[cellIndex - 1] ?? -1) + 1;
  const rawEnd = leadingPipe
    ? (pipes[cellIndex + 1] ?? line.length)
    : (pipes[cellIndex] ?? content.length);
  const boundedEnd = trailingPipe || rawEnd < content.length ? rawEnd : content.length;
  let start = rawStart;
  let end = boundedEnd;
  while (start < end && /\s/.test(content[start])) start += 1;
  while (end > start && /\s/.test(content[end - 1])) end -= 1;
  if (start === end) {
    const cursor = rawStart < boundedEnd && /\s/.test(content[rawStart]) ? rawStart + 1 : rawStart;
    return {
      start: lineStart + context.rawPrefixLength + cursor,
      end: lineStart + context.rawPrefixLength + cursor,
    };
  }
  return {
    start: lineStart + context.rawPrefixLength + start,
    end: lineStart + context.rawPrefixLength + end,
  };
}

function getFormattedTableCellCount(pipeCount: number, leadingPipe: boolean, trailingPipe: boolean): number {
  if (leadingPipe && trailingPipe) return Math.max(1, pipeCount - 1);
  if (leadingPipe || trailingPipe) return Math.max(1, pipeCount);
  return Math.max(1, pipeCount + 1);
}

function isTableShortcutLine(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed) && countUnescapedPipes(trimmed) > 0;
}

function isTableRow(line: string): boolean {
  return isTableRowContent(getTableLineContext(line).content);
}

function isTableSeparator(line: string): boolean {
  return isTableSeparatorContent(getTableLineContext(line).content);
}

function isTableRowContent(content: string): boolean {
  const indent = content.match(/^[ \t]*/)?.[0] ?? "";
  if (getIndentWidth(indent) >= 4) return false;
  return isTableShortcutLine(content);
}

function isTableSeparatorContent(content: string): boolean {
  const cells = splitTableRow(content);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function getTableLineContext(line: string): { content: string; prefix: string; rawPrefixLength: number } {
  const quote = parseQuotePrefix(line);
  return {
    content: quote ? line.slice(quote.rawLength) : line,
    prefix: quote?.normalized ?? "",
    rawPrefixLength: quote?.rawLength ?? 0,
  };
}

function hasTrailingTablePipe(line: string): boolean {
  const trimmedEnd = line.search(/\s*$/);
  const index = (trimmedEnd === -1 ? line.length : trimmedEnd) - 1;
  return index >= 0 && line[index] === "|" && !isEscapedAt(line, index);
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

function stripInlineFormatting(value: string): string {
  const { body, ending } = splitCarriageReturnEnding(value);
  const math = protectMarkdownMathForPlainText(body);
  const withoutLinks = replaceMarkdownLinkSyntax(math.value, (link) => link.label);
  const html = renderMarkdownInlineSource(withoutLinks, {
    settings: clearFormatMarkdownSettings,
    documentSource: body,
  });
  return math.restore(getVisibleTextFromMarkdownHtml(html, {
    blockLayout: false,
    includeComments: true,
  })) + ending;
}

function stripLineFormattingWithMap(line: string, column: number): { line: string; cursor: number } {
  const stripped = stripBlockMarkers(line);
  const plainContent = stripInlineFormatting(stripped.content);
  const nextLine = `${stripped.indent}${plainContent}`;
  const safeColumn = Math.max(0, Math.min(column, line.length));
  if (safeColumn <= stripped.contentStart) {
    return { line: nextLine, cursor: stripped.indent.length };
  }

  const contentColumn = Math.max(0, Math.min(stripped.content.length, safeColumn - stripped.contentStart));
  const mappedContentColumn = mapStrippedInlineOffset(stripped.content, plainContent, contentColumn);
  return {
    line: nextLine,
    cursor: stripped.indent.length + mappedContentColumn,
  };
}

function mapStrippedInlineOffset(source: string, stripped: string, offset: number): number {
  const safeOffset = Math.max(0, Math.min(offset, source.length));
  let strippedCursor = 0;
  for (let index = 0; index < source.length && index < safeOffset; index += 1) {
    if (strippedCursor >= stripped.length) break;
    if (source[index] === stripped[strippedCursor]) {
      strippedCursor += 1;
    }
  }
  return strippedCursor;
}

function protectMarkdownMathForPlainText(source: string): {
  value: string;
  restore: (value: string) => string;
} {
  const segments: string[] = [];
  let value = source;
  const items = collectMathDocumentItems(source)
    .sort((left, right) => right.from - left.from || right.to - left.to);

  for (const item of items) {
    const token = `\uE100${segments.length}\uE101`;
    segments.push(item.formula);
    value = `${value.slice(0, item.from)}${token}${value.slice(item.to)}`;
  }

  return {
    value,
    restore: (plain) => plain.replace(
      /\uE100(\d+)\uE101/g,
      (_match, index: string) => segments[Number(index)] ?? "",
    ),
  };
}

function restorePreferredLineBreaks(value: string, source: string): string {
  return source.includes("\r\n")
    ? value.replace(/\r?\n/g, "\r\n")
    : value.replace(/\r\n/g, "\n");
}

function normalizeTablesForPlainTextRender(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const context = getTableLineContext(line);
    const nextContext = getTableLineContext(lines[index + 1] ?? "");
    const startsTable = isTableRowContent(context.content)
      && context.prefix === nextContext.prefix
      && isTableSeparatorContent(nextContext.content);
    if (startsTable && output.length > 0 && output.at(-1)?.trim()) {
      output.push(context.prefix.trimEnd());
    }
    output.push(line);
  }

  return output.join("\n");
}

interface MarkdownHtmlPlainTextOptions {
  blockLayout: boolean;
  includeComments: boolean;
}

interface PlainTextHtmlTag {
  end: number;
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attributes: ReadonlyMap<string, string>;
}

const hiddenPlainTextHtmlTags = new Set([
  "head",
  "script",
  "style",
  "template",
  "title",
]);
const plainTextBlockEndTags = new Set([
  "dd",
  "div",
  "dt",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "p",
  "pre",
  "tr",
]);

function getVisibleTextFromMarkdownHtml(
  html: string,
  options: MarkdownHtmlPlainTextOptions,
): string {
  const codeSegments: string[] = [];
  const hiddenTags: string[] = [];
  const suppressedTags: string[] = [];
  let output = "";
  let cursor = 0;
  let codeDepth = 0;
  let tableCellIndex = 0;
  let mathContainerDepth = 0;
  let mathFormulaFound = false;
  let trimTaskText = false;

  const append = (value: string) => {
    if (!value) return;
    if (codeDepth > 0) {
      const token = `\uE200${codeSegments.length}\uE201`;
      codeSegments.push(value);
      output += token;
      return;
    }
    output += value;
  };
  const ensureLineBreaks = (count: number) => {
    const existing = output.match(/\n*$/)?.[0].length ?? 0;
    if (existing < count) output += "\n".repeat(count - existing);
  };

  while (cursor < html.length) {
    if (html.startsWith("<!--", cursor)) {
      const close = html.indexOf("-->", cursor + 4);
      const end = close < 0 ? html.length : close + 3;
      if (
        options.includeComments
        && hiddenTags.length === 0
        && suppressedTags.length === 0
        && mathContainerDepth === 0
      ) {
        append(html.slice(cursor + 4, close < 0 ? html.length : close).trim());
      }
      cursor = end;
      continue;
    }

    if (html[cursor] !== "<") {
      const nextTag = html.indexOf("<", cursor);
      const end = nextTag < 0 ? html.length : nextTag;
      if (hiddenTags.length === 0 && suppressedTags.length === 0 && mathContainerDepth === 0) {
        let text = markdownHtmlEntityUtils.unescapeAll(html.slice(cursor, end));
        if (trimTaskText) {
          text = text.replace(/^ /, "");
          trimTaskText = false;
        }
        if (!(
          options.blockLayout
          && codeDepth === 0
          && /^[\t\r\n ]+$/.test(text)
          && /[\r\n]/.test(text)
        )) {
          append(text);
        }
      }
      cursor = end;
      continue;
    }

    const tag = readPlainTextHtmlTag(html, cursor);
    if (!tag) {
      if (hiddenTags.length === 0 && suppressedTags.length === 0 && mathContainerDepth === 0) {
        append("<");
      }
      cursor += 1;
      continue;
    }
    cursor = tag.end;
    if (!tag.name) continue;

    if (hiddenTags.length > 0) {
      if (tag.closing && tag.name === hiddenTags.at(-1)) {
        hiddenTags.pop();
      } else if (!tag.closing && hiddenPlainTextHtmlTags.has(tag.name) && !tag.selfClosing) {
        hiddenTags.push(tag.name);
      }
      continue;
    }

    if (suppressedTags.length > 0) {
      if (tag.closing && tag.name === suppressedTags.at(-1)) {
        suppressedTags.pop();
      }
      continue;
    }

    if (mathContainerDepth > 0) {
      if (
        !tag.closing
        && !mathFormulaFound
        && tag.attributes.get("data-mml-node") === "math"
      ) {
        const formula = tag.attributes.get("data-latex");
        if (formula !== undefined) {
          append(markdownHtmlEntityUtils.unescapeAll(formula));
          mathFormulaFound = true;
        }
      }
      if (!tag.closing && tag.name === "mjx-container" && !tag.selfClosing) {
        mathContainerDepth += 1;
      } else if (tag.closing && tag.name === "mjx-container") {
        mathContainerDepth = Math.max(0, mathContainerDepth - 1);
        if (mathContainerDepth === 0) mathFormulaFound = false;
      }
      continue;
    }

    if (!tag.closing && tag.name === "mjx-container" && !tag.selfClosing) {
      mathContainerDepth = 1;
      mathFormulaFound = false;
      continue;
    }

    if (!tag.closing && hiddenPlainTextHtmlTags.has(tag.name) && !tag.selfClosing) {
      hiddenTags.push(tag.name);
      continue;
    }

    if (
      !tag.closing
      && tag.name === "a"
      && hasHtmlClass(tag.attributes, "footnote-backref")
      && !tag.selfClosing
    ) {
      suppressedTags.push(tag.name);
      continue;
    }

    if (!tag.closing) {
      if ((tag.name === "code" || tag.name === "pre") && !tag.selfClosing) {
        codeDepth += 1;
      } else if (tag.name === "br") {
        append(options.blockLayout ? "\n" : " ");
      } else if (tag.name === "hr") {
        if (hasHtmlClass(tag.attributes, "footnotes-sep")) {
          if (options.blockLayout) ensureLineBreaks(1);
        } else {
          if (options.blockLayout && output) ensureLineBreaks(2);
          append("---");
          if (options.blockLayout) ensureLineBreaks(1);
        }
      } else if (tag.name === "tr" && options.blockLayout) {
        if (output && !output.endsWith("\n")) ensureLineBreaks(1);
        tableCellIndex = 0;
      } else if ((tag.name === "th" || tag.name === "td") && options.blockLayout) {
        if (tableCellIndex > 0) append(" | ");
        tableCellIndex += 1;
      } else if (tag.name === "img") {
        const alt = tag.attributes.get("alt");
        if (alt) append(markdownHtmlEntityUtils.unescapeAll(alt));
      } else if (
        tag.name === "input"
        && hasHtmlClass(tag.attributes, "task-list-item-checkbox")
      ) {
        trimTaskText = true;
      }
      continue;
    }

    if (tag.name === "code" || tag.name === "pre") {
      codeDepth = Math.max(0, codeDepth - 1);
    }
    if (options.blockLayout && plainTextBlockEndTags.has(tag.name)) {
      ensureLineBreaks(1);
    }
  }

  let plain = output;
  if (options.blockLayout) {
    plain = plain
      .replace(/\r\n?/g, "\n")
      .replace(/[\t ]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\n+|\n+$/g, "");
  }
  return plain.replace(
    /\uE200(\d+)\uE201/g,
    (_match, index: string) => codeSegments[Number(index)] ?? "",
  );
}

function hasHtmlClass(attributes: ReadonlyMap<string, string>, name: string): boolean {
  return (attributes.get("class") ?? "").split(/\s+/).includes(name);
}

function readPlainTextHtmlTag(source: string, start: number): PlainTextHtmlTag | null {
  if (source[start] !== "<") return null;
  if (source.startsWith("<!", start) || source.startsWith("<?", start)) {
    const end = findPlainTextHtmlTagEnd(source, start + 2);
    return end === null
      ? null
      : { end, name: "", closing: false, selfClosing: true, attributes: new Map() };
  }

  let cursor = start + 1;
  let closing = false;
  if (source[cursor] === "/") {
    closing = true;
    cursor += 1;
  }
  if (!/[A-Za-z]/.test(source[cursor] ?? "")) return null;
  const nameStart = cursor;
  while (/[A-Za-z0-9:-]/.test(source[cursor] ?? "")) cursor += 1;
  const name = source.slice(nameStart, cursor).toLowerCase();
  const attributesStart = cursor;
  const end = findPlainTextHtmlTagEnd(source, cursor);
  if (end === null) return null;
  let beforeClose = end - 2;
  while (beforeClose >= attributesStart && /\s/.test(source[beforeClose] ?? "")) beforeClose -= 1;
  const selfClosing = source[beforeClose] === "/";
  return {
    end,
    name,
    closing,
    selfClosing,
    attributes: closing
      ? new Map()
      : readPlainTextHtmlAttributes(source, attributesStart, end - 1),
  };
}

function findPlainTextHtmlTagEnd(source: string, start: number): number | null {
  let quote = "";
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor] ?? "";
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === ">") {
      return cursor + 1;
    }
  }
  return null;
}

function readPlainTextHtmlAttributes(
  source: string,
  start: number,
  end: number,
): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  let cursor = start;

  while (cursor < end) {
    while (cursor < end && (/[\s/]/.test(source[cursor] ?? ""))) cursor += 1;
    const nameStart = cursor;
    while (cursor < end && !/[\s=/>]/.test(source[cursor] ?? "")) cursor += 1;
    if (cursor === nameStart) {
      cursor += 1;
      continue;
    }
    const name = source.slice(nameStart, cursor).toLowerCase();
    while (cursor < end && /\s/.test(source[cursor] ?? "")) cursor += 1;
    let value = "";
    if (source[cursor] === "=") {
      cursor += 1;
      while (cursor < end && /\s/.test(source[cursor] ?? "")) cursor += 1;
      const quote = source[cursor] === "\"" || source[cursor] === "'"
        ? source[cursor]
        : "";
      if (quote) {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < end && source[cursor] !== quote) cursor += 1;
        value = source.slice(valueStart, cursor);
        if (source[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < end && !/[\s>]/.test(source[cursor] ?? "")) cursor += 1;
        value = source.slice(valueStart, cursor);
      }
    }
    attributes.set(name, value);
  }

  return attributes;
}

function stripBlockFormatting(value: string): string {
  const { body, ending } = splitCarriageReturnEnding(value);
  let next = body;
  let changed = true;

  while (changed) {
    const before = next;
    const heading = next.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) {
      next = stripAtxClosingMarker(heading[1]);
    } else {
      next = next
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s{0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/, "")
        .replace(/^\s{0,3}:(?:[ \t]+|$)/, "");
      next = stripListBlockFormattingMarker(next);
    }
    changed = before !== next;
  }

  return `${next}${ending}`;
}

function stripListBlockFormattingMarker(value: string): string {
  const marker = value.match(/^([ \t]*)(?:(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/);
  if (!marker || getIndentWidth(marker[1]) >= 4) return value;
  return value.slice(marker[0].length);
}

function hasLineFormat(line: string, format: MarkdownLineFormat): boolean {
  switch (format) {
    case "blockquote":
      return /^\s*>\s?/.test(line);
    case "bullet":
      return stripLineForListFormatting(line).marker === "bullet";
    case "ordered":
      return stripLineForListFormatting(line).marker === "ordered";
    case "task":
      return stripLineForListFormatting(line).marker === "task";
    case "definition":
      return Boolean(matchDefinitionListMarkerLine(line));
    default:
      return false;
  }
}

function isBlankLineFormattingTarget(line: string): boolean {
  const quote = parseQuotePrefix(line);
  return quote ? !line.slice(quote.rawLength).trim() : !line.trim();
}

function isBlankHeadingTarget(line: string): boolean {
  return isBlankLineFormattingTarget(line);
}

function addBlockquoteMarker(line: string): string {
  const indent = line.match(/^\s*/)?.[0] ?? "";
  return `${indent}> ${line.slice(indent.length)}`;
}

function removeSingleBlockquoteMarker(line: string): string {
  return line.replace(/^(\s*)>\s?/, "$1");
}

function stripLineForListFormatting(
  line: string,
): { indent: string; content: string; contentStart: number; marker: MarkdownLineFormat | ""; taskChecked: boolean } {
  const { body, ending } = splitCarriageReturnEnding(line);
  const quote = parseQuotePrefix(body);
  const baseIndent = body.match(/^\s*/)?.[0] ?? "";
  const indent = quote?.normalized ?? baseIndent;
  const rest = quote ? body.slice(quote.rawLength) : body.slice(baseIndent.length);
  const innerIndent = rest.match(/^\s*/)?.[0] ?? "";
  const listIndent = quote ? innerIndent : baseIndent;
  let content = rest.slice(innerIndent.length);
  let contentStart = (quote?.rawLength ?? baseIndent.length) + innerIndent.length;
  let marker: MarkdownLineFormat | "" = "";
  let taskChecked = false;
  const heading = content.match(/^#{1,6}\s+(.+)$/);
  if (heading) {
    contentStart += heading[0].length - heading[1].length;
    content = stripAtxClosingMarker(heading[1]);
  }

  const footnoteDefinition = content.match(/^\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/);
  if (footnoteDefinition) {
    contentStart += footnoteDefinition[0].length;
    content = content.slice(footnoteDefinition[0].length);
  }

  const definitionMarker = content.match(/^:(?:[ \t]+|$)/);
  if (definitionMarker) {
    contentStart += definitionMarker[0].length;
    content = content.slice(definitionMarker[0].length);
  }

  const canUseListMarker = getIndentWidth(listIndent) < 4;
  const task = canUseListMarker ? content.match(/^[-*+]\s+\[([ xX])\]\s+/) : null;
  const orderedTask = canUseListMarker ? content.match(/^\d+[.)]\s+\[([ xX])\]\s+/) : null;
  if (orderedTask) {
    marker = "task";
    taskChecked = orderedTask[1].toLowerCase() === "x";
    contentStart += orderedTask[0].length;
    content = content.slice(orderedTask[0].length);
    return { indent: `${indent}${innerIndent}`, content: `${content}${ending}`, contentStart, marker, taskChecked };
  }

  if (task) {
    marker = "task";
    taskChecked = task[1].toLowerCase() === "x";
    contentStart += task[0].length;
    content = content.slice(task[0].length);
    return { indent: `${indent}${innerIndent}`, content: `${content}${ending}`, contentStart, marker, taskChecked };
  }

  const bullet = canUseListMarker ? content.match(/^[-*+]\s+/) : null;
  if (bullet) {
    marker = "bullet";
    contentStart += bullet[0].length;
    content = content.slice(bullet[0].length);
    return { indent: `${indent}${innerIndent}`, content: `${content}${ending}`, contentStart, marker, taskChecked };
  }

  const ordered = canUseListMarker ? content.match(/^\d+[.)]\s+/) : null;
  if (ordered) {
    marker = "ordered";
    contentStart += ordered[0].length;
    content = content.slice(ordered[0].length);
  }

  return { indent: `${indent}${innerIndent}`, content: `${content}${ending}`, contentStart, marker, taskChecked };
}

function stripBlockMarkers(line: string): { indent: string; content: string; contentStart: number } {
  const { body, ending } = splitCarriageReturnEnding(line);
  const indent = body.match(/^\s*/)?.[0] ?? "";
  let content = body.slice(indent.length);
  let contentStart = indent.length;

  let changed = true;
  while (changed) {
    const before = content;
    const heading = content.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      contentStart += heading[0].length - heading[1].length;
      content = stripAtxClosingMarker(heading[1]);
    } else {
      const marker = [
        /^>\s?/,
        /^[ \t]{0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/,
        /^[ \t]{0,3}:(?:[ \t]+|$)/,
        ...(getIndentWidth(indent) < 4
          ? [
            /^(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/,
            /^[-*+]\s+/,
            /^\d+[.)]\s+/,
          ]
          : []),
      ]
        .map((pattern) => content.match(pattern)?.[0] ?? "")
        .find(Boolean);
      if (marker) {
        contentStart += marker.length;
        content = content.slice(marker.length);
      }
    }
    changed = before !== content;
  }

  return { indent, content: `${content}${ending}`, contentStart };
}

function stripAtxClosingMarker(value: string): string {
  return value.replace(/\s+#+\s*$/, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isLikelyUrl(value: string): boolean {
  const action = getPreviewLinkAction(value);
  if (action === "external") return !/[\s<>]/.test(value);
  if (action === "local") return !/[\r\n<>]/.test(value);
  return false;
}

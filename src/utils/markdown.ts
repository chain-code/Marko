import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import fullEmojiDefinitions from "markdown-it-emoji/lib/data/full.mjs";
import hljs from "highlight.js";
import type { EditorSettings, OutlineItem } from "@/types";
import {
  renderMathJaxFragments,
  type MathRenderFragment,
} from "./mathRendering";
import {
  decodeFootnoteLabelForRender,
  normalizeFootnoteLabelsForRender,
} from "./footnoteSemantics";
import { collectFootnoteReferenceSyntax } from "./inlineSyntax";
import { readCjkUnderscoreEmphasis } from "./inlineStyleSyntax";
import {
  isUnwrappedMarkdownLinkDestinationWithSpaces,
  parseMarkdownLinkDestination,
  readMarkdownInlineLink,
  replaceMarkdownLinkSyntax,
} from "./markdownLinks";
import {
  isDollarMathBlockClosing,
  readDollarMathBlockOpening,
  readInlineDollarMath,
} from "./mathSyntax";
import { getYamlFrontMatterRange } from "./frontMatterSyntax";
import {
  getLeadingMarkdownIndent,
  getMarkdownColumnAfter,
  getMarkdownIndentWidth,
  isMarkdownCodeIndented,
  readMarkdownBlockquotePrefix,
  stripMarkdownIndentColumns,
  stripMarkdownListContainerMarkers,
} from "./markdownIndent";
import {
  isHighlightExtensionEnabled,
  isSubscriptExtensionEnabled,
  isSuperscriptExtensionEnabled,
} from "./editorSettings";
import { getPreviewLinkAction, isExternalPreviewHref } from "./previewLinks";
import { isMarkdownTocLine } from "./tocSyntax";

export interface RenderOptions {
  basePath?: string;
  documentSource?: string;
  sourceOffset?: number;
  outline?: OutlineItem[];
  settings: EditorSettings;
  assetResolver?: (path: string) => string;
  typoraRootUrl?: string;
  preserveSourceTokens?: boolean;
  omitFrontMatter?: boolean;
  extendedOrderedListMarkers?: Map<number, ExtendedOrderedListMarker[]>;
}

interface ExtendedOrderedListMarker {
  value: string;
  punctuation: "." | ")";
  extended: boolean;
}

export interface RenderedMarkdownTableCells {
  headers: string[];
  rows: string[][];
}

const emojiDefinitionsModule = fullEmojiDefinitions as unknown as {
  default?: Readonly<Record<string, string>>;
};
const normalizedEmojiDefinitions = emojiDefinitionsModule.default ?? fullEmojiDefinitions;
const emojiMap: Readonly<Record<string, string>> = {
  ...normalizedEmojiDefinitions,
  check: "✅",
  note: "📝",
};

export type MarkdownAlertKind = "note" | "tip" | "important" | "warning" | "caution";

export interface MarkdownAlertPresentation {
  kind: MarkdownAlertKind;
  label: string;
  iconPath: string;
}

const alertLabels: Record<MarkdownAlertKind, string> = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

const alertIconPaths: Record<MarkdownAlertKind, string> = {
  note: "M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0Zm-.75 7h1.5v5h-1.5V7ZM8 3.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
  tip: "M8 0a5 5 0 0 0-3 9v2h6V9A5 5 0 0 0 8 0ZM6 13h4v2H6v-2Z",
  important: "M8 0l8 8-8 8-8-8 8-8Zm-.75 4v6h1.5V4h-1.5ZM8 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  warning: "M8 0l8 15H0L8 0Zm-.75 5v5h1.5V5h-1.5ZM8 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  caution: "M5 0h6l5 5v6l-5 5H5l-5-5V5l5-5Zm2.25 4v6h1.5V4h-1.5ZM8 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
};

export function getMarkdownAlertPresentation(kind: string): MarkdownAlertPresentation | null {
  const normalized = kind.toLowerCase() as MarkdownAlertKind;
  if (!alertLabels[normalized]) return null;
  return {
    kind: normalized,
    label: alertLabels[normalized],
    iconPath: alertIconPaths[normalized],
  };
}
const markdownRenderers = new Map<string, MarkdownIt>();
const markdownLiteralBlockParser = new MarkdownIt({ html: true });
const markdownEntityUtils = new MarkdownIt("zero").utils;
const smartPunctuationRenderers = new Map<string, MarkdownIt>();
const typoraBareEmailTlds = new Set([
  "com", "co", "net", "org", "edu", "io", "tv", "fm", "me", "info",
  "cc", "ca", "de", "cn", "ru", "us", "jp", "au", "cz",
]);

export interface SmartPunctuationOptions {
  quotes?: boolean;
  dashes?: boolean;
}

export interface MarkdownAutoLinkMatch {
  start: number;
  end: number;
  textStart: number;
  textEnd: number;
  text: string;
  href: string;
}

export interface EmojiShortcodeMatch {
  start: number;
  end: number;
  source: string;
  value: string;
}

export function renderMarkdown(source: string, options: RenderOptions): string {
  const parts = splitFrontMatter(source);
  const renderOptions: RenderOptions = {
    ...options,
    documentSource: options.documentSource ?? source,
    typoraRootUrl: options.typoraRootUrl ?? getTyporaRootUrl(options.documentSource ?? source),
  };
  if (options.settings.extensions.footnote && isFootnoteDefinitionBlock(parts.body)) {
    return `<div class="footnote-definition-block">${escapeHtml(parts.body.trim())}</div>`;
  }

  const normalizedBody = normalizeContainedDefinitionsForRender(parts.body, options.settings.extensions.footnote);
  const footnoteBody = options.settings.extensions.footnote
    ? appendReferencedFootnotes(normalizedBody, options.documentSource ?? source)
    : normalizedBody;
  const referenceBody = appendReferencedLinkDefinitions(footnoteBody, options.documentSource ?? source);
  const canonicalBody = options.settings.extensions.footnote
    ? normalizeFootnoteLabelsForRender(referenceBody)
    : referenceBody;
  const body = prepareMarkdown(canonicalBody, renderOptions);
  const renderedBody = getMarkdownRenderer(options.settings).render(body, renderOptions);

  if (!parts.frontMatter || options.omitFrontMatter) {
    return renderedBody;
  }

  return [
    `<pre class="frontmatter-block"><code>${escapeHtml(getFrontMatterContent(parts.frontMatter))}</code></pre>`,
    renderedBody,
  ].join("\n");
}

export function renderMarkdownTableCells(
  source: string,
  options: RenderOptions,
  sourceOffset?: number,
): RenderedMarkdownTableCells {
  const renderOptions = normalizeRenderOptions(source, { ...options, sourceOffset });
  const renderer = getMarkdownRenderer(options.settings);
  const local = parseLocalMarkdownTable(source, renderOptions, renderer);
  if (!local) return { headers: [], rows: [] };

  const analysis = analyzeMarkdownDocument(renderOptions, renderer);
  const documentTable = analysis
    ? findDocumentTableTokenRows(
      analysis.tokens,
      renderOptions.documentSource ?? source,
      source,
      sourceOffset,
    )
    : null;
  if (documentTable) {
    copyTableFootnoteMetadata(local.rows, documentTable);
  }

  return renderMarkdownTableTokenRows(
    local.rows,
    renderer,
    analysis?.env.footnotes
      ? { ...local.env, footnotes: analysis.env.footnotes }
      : local.env,
  );
}

export function renderMarkdownInline(source: string, options: RenderOptions): string {
  const renderOptions = normalizeRenderOptions(source, options);
  const renderer = getMarkdownRenderer(options.settings);
  const tableSource = "| " + escapeMarkdownTableCellSource(source || " ") + " |\n| --- |";
  const local = parseLocalMarkdownTable(tableSource, renderOptions, renderer);
  const tokens = local?.rows.headers[0];
  if (!local || !tokens) return escapeHtml(source);

  const analysis = analyzeMarkdownDocument(renderOptions, renderer);
  const hasVerifiedDocumentRange = isVerifiedDocumentSourceRange(source, renderOptions);
  if (hasVerifiedDocumentRange && analysis?.env.footnotes?.refs) {
    applyDocumentFootnoteIdsByLabel(tokens, analysis.env.footnotes.refs);
  }
  if (hasVerifiedDocumentRange && analysis) {
    applyDocumentInlineFootnoteIdsByOffset(tokens, source, renderOptions, analysis);
  }
  const env = hasVerifiedDocumentRange && analysis?.env.footnotes
    ? { ...local.env, footnotes: analysis.env.footnotes }
    : local.env;
  return renderer.renderer.renderInline(tokens, renderer.options, env);
}

export function renderMarkdownInlineSource(source: string, options: RenderOptions): string {
  const renderOptions = normalizeRenderOptions(source, options);
  const renderer = getMarkdownRenderer(options.settings);
  const analysis = analyzeMarkdownDocument(renderOptions, renderer);
  const env: MarkdownRendererEnvironment = analysis?.env
    ? { ...renderOptions, ...analysis.env }
    : renderOptions;
  const inline = renderer.parseInline(source, env)[0];
  return renderer.renderer.renderInline(inline?.children ?? [], renderer.options, env);
}

function normalizeRenderOptions(source: string, options: RenderOptions): RenderOptions {
  const documentSource = options.documentSource ?? source;
  return {
    ...options,
    documentSource,
    typoraRootUrl: options.typoraRootUrl ?? getTyporaRootUrl(documentSource),
  };
}

export function createOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const seen = new Map<string, number>();
  const definedFootnoteLabels = collectDefinedFootnoteLabels(markdown);
  const parsedHeadingLines = collectParsedHeadingLines(markdown);
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;
  const frontMatter = getYamlFrontMatterRange(markdown);
  const frontMatterClosingLine = frontMatter
    ? markdown.slice(0, frontMatter.closingStart).split(/\r?\n/).length - 1
    : -1;
  const lines = markdown.split(/\r?\n/);

  const addItem = (rawTitle: string, level: number, line: number) => {
    const title = stripInlineMarkdown(rawTitle, definedFootnoteLabels);
    const baseId = slugifyHeading(title);
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    items.push({
      id: count === 0 ? baseId : `${baseId}-${count}`,
      title,
      level,
      line,
    });
  };

  lines.forEach((line, index) => {
    const context = getOutlineLineContext(line);
    if (index <= frontMatterClosingLine) return;

    if (activeFence) {
      const continuation = getOutlineFenceContinuationLine(line, activeFence);
      if (continuation) {
        if (isOutlineFenceClose(continuation.content, activeFence, continuation.contentColumn)) {
          activeFence = null;
        }
        return;
      }
      activeFence = null;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
        return;
      }
      activeHtmlBlock = null;
    }

    if (isIndentedCodeLine(context.content) && !parsedHeadingLines.has(index)) return;

    const fence = getOutlineFenceOpen(context.content, context.contentColumn);
    if (fence) {
      activeFence = { ...fence, quoteKey: context.quoteKey };
      return;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      return;
    }

    const setext = context.trimmed.match(/^(={2,}|-{2,})\s*$/);
    if (setext && index > 0) {
      const heading = collectSetextOutlineHeading(lines, index, context.quoteKey);
      if (heading) {
        addItem(heading.title, setext[1][0] === "=" ? 1 : 2, heading.line);
      }
      return;
    }

    const heading = getOutlineAtxHeading(context.content)
      ?? (parsedHeadingLines.has(index)
        ? getOutlineAtxHeading(context.content.trimStart())
        : null);
    if (!heading) return;
    if (!parsedHeadingLines.has(index) && !hasExtendedOrderedListMarker(context.content)) return;

    addItem(heading.title, heading.level, index + 1);
  });

  return items;
}

function getOutlineAtxHeading(content: string): { title: string; level: number } | null {
  let remaining = content;

  // 列表项可以嵌套在同一行，逐层移除列表标记后再识别标题。
  for (let depth = 0; depth < 16; depth += 1) {
    const marker = remaining.match(/^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]{1,4}(?![ \t])/);
    if (!marker) break;
    remaining = remaining.slice(marker[0].length);
  }

  const match = remaining.match(/^[ \t]{0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/);
  if (!match) return null;
  return {
    title: stripAtxClosingMarker(match[2]),
    level: match[1].length,
  };
}

function hasExtendedOrderedListMarker(content: string): boolean {
  let remaining = content;
  for (let depth = 0; depth < 16; depth += 1) {
    const marker = remaining.match(
      /^[ \t]{0,3}([-+*]|(\d+)[.)])[ \t]{1,4}(?![ \t])/
    );
    if (!marker) return false;
    if ((marker[2]?.length ?? 0) >= 10) return true;
    remaining = remaining.slice(marker[0].length);
  }
  return false;
}

function collectParsedHeadingLines(source: string): ReadonlySet<number> {
  const lines = new Set<number>();
  for (const token of markdownLiteralBlockParser.parse(source, {})) {
    if (token.type !== "heading_open" || !token.map) continue;
    for (let index = token.map[0]; index < token.map[1]; index += 1) {
      lines.add(index);
    }
  }
  return lines;
}

function collectSetextOutlineHeading(
  lines: string[],
  underlineIndex: number,
  quoteKey: string,
): { title: string; line: number } | null {
  const titleLines: string[] = [];
  let firstLineIndex = underlineIndex;

  for (let index = underlineIndex - 1; index >= 0; index -= 1) {
    const context = getOutlineLineContext(lines[index] ?? "");
    const title = stripOutlineListMarkers(context.trimmed);
    if (
      context.quoteKey !== quoteKey
      || isIndentedCodeLine(context.content)
      || !isSetextHeadingText(title)
      || getOutlineFenceOpen(context.content)
      || getOutlineHtmlBlockOpen(context.content, context.quoteKey)
    ) {
      break;
    }

    titleLines.unshift(title);
    firstLineIndex = index;
  }

  return titleLines.length > 0
    ? { title: titleLines.join(" "), line: firstLineIndex + 1 }
    : null;
}

function stripOutlineListMarkers(value: string): string {
  let remaining = value;
  for (let depth = 0; depth < 16; depth += 1) {
    const marker = remaining.match(/^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]{1,4}(?![ \t])/);
    if (!marker) break;
    remaining = remaining.slice(marker[0].length);
  }
  return remaining.trim();
}

export function getEmojiSuggestions(query: string): Array<{ code: string; value: string }> {
  const normalized = query.toLowerCase();
  return Object.entries(emojiMap)
    .filter(([code]) => code.startsWith(normalized))
    .slice(0, 8)
    .map(([code, value]) => ({ code, value }));
}

export function getEmojiShortcodeMatches(source: string): EmojiShortcodeMatch[] {
  const matches: EmojiShortcodeMatch[] = [];
  for (const match of source.matchAll(/:([a-z0-9_+-]+):/g)) {
    const value = emojiMap[match[1]];
    if (!value) continue;
    const start = match.index ?? 0;
    if (isEscapedAt(source, start)) continue;
    matches.push({
      start,
      end: start + match[0].length,
      source: match[0],
      value,
    });
  }
  return matches;
}

export function replaceEmojiShortcodes(source: string): string {
  const matches = getEmojiShortcodeMatches(source);
  if (matches.length === 0) return source;
  let cursor = 0;
  let result = "";
  for (const match of matches) {
    result += source.slice(cursor, match.start) + match.value;
    cursor = match.end;
  }
  return result + source.slice(cursor);
}

export function getMarkdownAutoLinkMatches(source: string): MarkdownAutoLinkMatch[] {
  const angleMatches = collectTyporaAngleAutoLinks(source);
  const bareMatches = collectTyporaBareAutoLinks(source)
    .filter((match) => !angleMatches.some((angle) => (
      match.start < angle.end && match.end > angle.start
    )));
  return [...angleMatches, ...bareMatches]
    .sort((left, right) => left.start - right.start || right.end - left.end);
}

function collectTyporaBareAutoLinks(source: string): MarkdownAutoLinkMatch[] {
  const result: MarkdownAutoLinkMatch[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const match = readTyporaBareAutoLinkAt(source, index);
    if (!match) continue;
    result.push(match);
    index = match.end - 1;
  }
  return result;
}

function readTyporaBareAutoLinkAt(
  source: string,
  start: number,
): MarkdownAutoLinkMatch | null {
  if (hasTyporaBareAutoLinkWordPrefix(source, start)) return null;
  const tail = source.slice(start);
  const candidate = tail.match(
    /^(?:https?:\/\/[^\s<>"'，。；：！？、（）【】《》“”‘’]+|www\.[^\s<>"'，。；：！？、（）【】《》“”‘’]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i,
  )?.[0];
  if (!candidate) return null;
  const raw = trimTyporaBareAutoLinkCjkSuffix(candidate);
  const text = trimTyporaBareAutoLinkMarkdownClosure(
    source,
    start,
    trimTyporaBareAutoLink(raw),
  );
  const href = getTyporaAutoLinkHref(text);
  if (!text || !href || !isTyporaBareAutoLink(text)) return null;
  return {
    start,
    end: start + text.length,
    textStart: start,
    textEnd: start + text.length,
    text,
    href,
  };
}

function hasTyporaBareAutoLinkWordPrefix(source: string, start: number): boolean {
  const previous = source[start - 1] ?? "";
  if (/[A-Za-z0-9]/.test(previous)) return true;
  if (previous !== "_") return false;

  let delimiterStart = start - 1;
  while (delimiterStart > 0 && source[delimiterStart - 1] === "_") {
    delimiterStart -= 1;
  }
  return /[A-Za-z0-9_]/.test(source[delimiterStart - 1] ?? "");
}

function trimTyporaBareAutoLinkCjkSuffix(value: string): string {
  if (!/^(?:https?:\/\/|www\.)/i.test(value)) return value;
  const boundary = value.search(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u,
  );
  return boundary < 0 ? value : value.slice(0, boundary);
}

function trimTyporaBareAutoLink(value: string): string {
  let result = value.replace(/[.,;:!?]+$/g, "");
  const pairs: Array<[string, string]> = [["(", ")"], ["[", "]"], ["{", "}"]];
  for (const [opening, closing] of pairs) {
    while (
      result.endsWith(closing)
      && countCharacter(result, closing) > countCharacter(result, opening)
    ) {
      result = result.slice(0, -1);
    }
  }
  return result;
}

function trimTyporaBareAutoLinkMarkdownClosure(
  source: string,
  start: number,
  value: string,
): string {
  const marker = source[start - 1] ?? "";
  if (!["*", "_", "~", "="].includes(marker)) return value;

  let openingLength = 0;
  for (let index = start - 1; index >= 0 && source[index] === marker; index -= 1) {
    openingLength += 1;
  }
  const closing = marker.repeat(openingLength);
  return openingLength > 0 && value.endsWith(closing)
    ? value.slice(0, -closing.length)
    : value;
}

function countCharacter(value: string, character: string): number {
  let count = 0;
  for (const current of value) {
    if (current === character) count += 1;
  }
  return count;
}

function isTyporaBareAutoLink(value: string): boolean {
  const text = value.trim();
  return /^https?:\/\/[^\s<>]+$/i.test(text)
    || /^www\.[^\s<>]+$/i.test(text)
    || isTyporaBareEmail(text);
}

function isTyporaBareEmail(value: string): boolean {
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(value)) return false;
  const domain = value.slice(value.lastIndexOf("@") + 1).toLowerCase();
  const labels = domain.split(".").filter(Boolean);
  return labels.length > 1 && labels.slice(1).some((label) => typoraBareEmailTlds.has(label));
}

function collectTyporaAngleAutoLinks(source: string): MarkdownAutoLinkMatch[] {
  const result: MarkdownAutoLinkMatch[] = [];
  for (const match of source.matchAll(/<([^<>\s]+)>/g)) {
    const text = match[1] ?? "";
    const href = getTyporaAutoLinkHref(text);
    if (!href) continue;
    const start = match.index ?? 0;
    result.push({
      start,
      end: start + match[0].length,
      textStart: start + 1,
      textEnd: start + 1 + text.length,
      text,
      href,
    });
  }
  return result;
}

function getTyporaAutoLinkHref(value: string): string | null {
  const text = value.trim();
  if (!text || getPreviewLinkAction(text) === "blocked") return null;
  if (/^www\.[^\s<>]+$/i.test(text)) return `http://${text}`;
  if (/^[^\s<>@]+@[^\s<>@]+$/.test(text)) return `mailto:${text}`;
  if (/^[^\s<>:]+:[^\s<>]+$/.test(text)) return text;
  return null;
}

export function renderSmartPunctuationText(
  source: string,
  options: SmartPunctuationOptions = {},
): string {
  const quotes = options.quotes ?? true;
  const dashes = options.dashes ?? true;
  if (!quotes && !dashes) return source;
  const key = `${Number(quotes)}${Number(dashes)}`;
  let renderer = smartPunctuationRenderers.get(key);
  if (!renderer) {
    renderer = new MarkdownIt("zero", { typographer: true })
      .enable(["replacements", "smartquotes"]);
    configureTyporaSmartPunctuation(renderer, quotes, dashes);
    smartPunctuationRenderers.set(key, renderer);
  }
  const inline = renderer.parseInline(source, {})[0];
  return inline?.children?.map((token) => token.content).join("") ?? source;
}

function configureTyporaSmartPunctuation(
  renderer: MarkdownIt,
  quotes: boolean,
  dashes: boolean,
) {
  if (dashes) {
    renderer.core.ruler.at("replacements", applyTyporaSmartDashes);
  } else {
    renderer.disable("replacements");
  }
  if (!quotes) renderer.disable("smartquotes");
}

function applyTyporaSmartDashes(state: any) {
  if (!state.md.options.typographer) return;
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    let autoLinkDepth = 0;
    for (const token of block.children) {
      if (token.type === "link_open" && token.info === "auto") {
        autoLinkDepth += 1;
        continue;
      }
      if (token.type === "link_close" && token.info === "auto") {
        autoLinkDepth = Math.max(0, autoLinkDepth - 1);
        continue;
      }
      if (token.type === "text" && autoLinkDepth === 0) {
        token.content = replaceTyporaSmartDashes(token.content);
      }
    }
  }
}

function replaceTyporaSmartDashes(source: string): string {
  let result = "";
  for (let index = 0; index < source.length;) {
    if (source.startsWith("---", index) && source[index + 3] !== "-") {
      result += "\u2014";
      index += 3;
      continue;
    }
    if (source.startsWith("--", index)) {
      result += "\u2013";
      index += 2;
      continue;
    }
    if (source.startsWith("...", index)) {
      result += "\u2026";
      index += 3;
      continue;
    }
    result += source[index];
    index += 1;
  }
  return result;
}

type OutlineFence =
  | { kind: "code"; marker: string; listIndentWidth: number; quoteKey?: string }
  | { kind: "math"; marker: "$$" | "\\["; listIndentWidth: number; quoteKey?: string };

type OutlineHtmlBlock =
  | { kind: "untilBlank"; quoteKey: string }
  | { kind: "untilClose"; quoteKey: string; closePattern: RegExp };

interface OutlineLineContext {
  content: string;
  contentColumn: number;
  trimmed: string;
  quoteKey: string;
  prefix: string;
}

interface DefinitionListEntry {
  terms: string[];
  definitions: DefinitionListDefinition[];
}

interface DefinitionListDefinition {
  lines: string[];
  loose: boolean;
}

export interface MarkdownAbbreviation {
  label: string;
  title: string;
}

export interface MarkdownAbbreviationDefinition extends MarkdownAbbreviation {
  from: number;
  to: number;
}

export interface MarkdownAbbreviationMatch extends MarkdownAbbreviation {
  start: number;
  end: number;
}

function getOutlineLineContext(line: string): OutlineLineContext {
  const quote = readMarkdownBlockquotePrefix(line);
  const content = quote ? line.slice(quote.raw.length) : line;
  return {
    content,
    contentColumn: quote?.contentColumn ?? 0,
    trimmed: content.trim(),
    quoteKey: quote ? `quote:${quote.depth}` : "plain",
    prefix: quote?.raw ?? "",
  };
}

function getOutlineFenceOpen(content: string, startColumn = 0): OutlineFence | null {
  const container = stripMarkdownListContainerMarkers(content, startColumn);
  const contentColumn = startColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(container.content, contentColumn)) return null;
  const indent = getLeadingMarkdownIndent(container.content);
  const semantic = container.content.slice(indent.length);
  const code = semantic.match(/^(`{3,}|~{3,})/);
  if (code) {
    return {
      kind: "code",
      marker: code[1],
      listIndentWidth: container.continuationIndentWidth,
    };
  }
  if (readDollarMathBlockOpening(container.content, 3, contentColumn)) {
    return {
      kind: "math",
      marker: "$$",
      listIndentWidth: container.continuationIndentWidth,
    };
  }
  if (/^\\\[\s*$/.test(semantic)) {
    return {
      kind: "math",
      marker: "\\[",
      listIndentWidth: container.continuationIndentWidth,
    };
  }
  return null;
}

function isOutlineFenceClose(
  content: string,
  fence: OutlineFence,
  startColumn = 0,
): boolean {
  if (isMarkdownCodeIndented(content, startColumn)) return false;
  const indent = getLeadingMarkdownIndent(content);
  const semantic = content.slice(indent.length);
  if (fence.kind === "math") {
    return fence.marker === "$$"
      ? isDollarMathBlockClosing(content, 3, startColumn)
      : /^\\\]\s*$/.test(semantic);
  }

  const closing = semantic.match(/^(`{3,}|~{3,})[ \t]*$/);
  return Boolean(closing && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length);
}

function getOutlineFenceContinuationLine(
  line: string,
  fence: OutlineFence,
): { content: string; contentColumn: number } | null {
  const quoteKey = fence.quoteKey ?? "plain";
  if (quoteKey === "plain" && fence.listIndentWidth === 0) {
    return { content: line, contentColumn: 0 };
  }
  const context = getOutlineLineContext(line);
  if (context.quoteKey !== quoteKey) return null;
  if (fence.listIndentWidth === 0 || !context.content.trim()) {
    return { content: context.content, contentColumn: context.contentColumn };
  }
  const stripped = stripMarkdownIndentColumns(
    context.content,
    fence.listIndentWidth,
    context.contentColumn,
  );
  return stripped
    ? {
      content: stripped.content,
      contentColumn: context.contentColumn + fence.listIndentWidth,
    }
    : null;
}

function getOutlineHtmlBlockOpen(content: string, quoteKey: string): OutlineHtmlBlock | null {
  if (isMarkdownCodeIndented(content)) return null;
  const line = content.trimStart();
  if (!line.startsWith("<")) return null;

  if (/^<!--/.test(line)) return { kind: "untilClose", quoteKey, closePattern: /-->/ };
  if (/^<\?/.test(line)) return { kind: "untilClose", quoteKey, closePattern: /\?>/ };
  if (/^<![A-Z]/.test(line)) return { kind: "untilClose", quoteKey, closePattern: />/ };
  if (/^<!\[CDATA\[/.test(line)) return { kind: "untilClose", quoteKey, closePattern: /\]\]>/ };

  const rawTag = line.match(/^<(script|pre|style|textarea)(?=[\s>/])/i);
  if (rawTag) {
    return {
      kind: "untilClose",
      quoteKey,
      closePattern: new RegExp(`</${rawTag[1]}\\s*>`, "i"),
    };
  }

  if (/^<\/?(address|article|aside|audio|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul|video)(?=[\s>/])/i.test(line)) {
    return { kind: "untilBlank", quoteKey };
  }

  return null;
}

function isOutlineHtmlBlockClose(content: string, block: OutlineHtmlBlock): boolean {
  if (block.kind === "untilBlank") return !content.trim();
  return block.closePattern.test(content);
}

function prepareMarkdown(source: string, options: RenderOptions): string {
  let next = source;
  const protectedHtml: string[] = [];
  const protectHtml = (html: string) => {
    const token = `@@MARKO_HTML_${protectedHtml.length}@@`;
    protectedHtml.push(html);
    return token;
  };

  // 先把 Mermaid shortcode 转成围栏，后续扩展就会把它当作代码块保护起来。
  if (options.settings.extensions.mermaid) {
    next = replaceMermaidShortcodesOutsideLiteralBlocks(next);
  }
  if (options.settings.extensions.alerts) {
    next = renderAlerts(next, options, protectHtml);
  }
  if (options.settings.extensions.toc) {
    next = renderTocOutsideLiteralBlocks(next, options.outline ?? [], protectHtml);
  }
  if (!options.settings.extensions.footnote) {
    next = escapeFootnoteSyntax(next);
  }
  next = renderAbbreviations(next, options, protectHtml);
  next = renderDefinitionLists(next, options, protectHtml);
  if (!options.settings.extensions.html) {
    next = escapeDisabledRawHtml(next);
  }
  next = restoreProtectedHtml(next, protectedHtml);
  if (options.settings.extensions.math) {
    next = renderMath(next, options);
  } else {
    next = preserveMathDelimiters(next);
  }
  const normalizedLists = normalizeExtendedOrderedListMarkers(next);
  options.extendedOrderedListMarkers = normalizedLists.markers;
  return normalizedLists.source;
}

function createMarkdownRenderer(settings: EditorSettings): MarkdownIt {
  const smartQuotes = settings.smartQuotes;
  const smartDashes = settings.smartDashes;
  const renderer = new MarkdownIt({
    html: true,
    linkify: settings.extensions.autoLinks,
    typographer: smartQuotes || smartDashes,
    breaks: settings.preserveSingleLineBreaks,
    highlight(code, language) {
      const normalized = language?.trim().toLowerCase();
      if (normalized && hljs.getLanguage(normalized)) {
        const highlighted = hljs.highlight(code, {
          language: normalized,
          ignoreIllegals: true,
        }).value;
        return `<pre><code class="hljs language-${escapeHtml(normalized)}">${highlighted}</code></pre>`;
      }

      return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
    },
  })
    .use(markdownTyporaBlockSyntaxPlugin)
    .use(anchor, {
      slugify: slugifyHeading,
      getTokensText: getMarkdownHeadingText,
      permalink: false,
    })
    .use(taskLists, {
      enabled: true,
      label: true,
    })
    .use(markdownCjkUnderscoreEmphasisPlugin)
    .use(markdownTyporaSpaceDestinationPlugin)
    .use(markdownTyporaAutolinkPlugin, settings.extensions.autoLinks)
    .use(markdownInlineTextPlugin, settings.extensions.emoji)
    .use(markdownSourcePreservationPlugin);

  configureTyporaSmartPunctuation(renderer, smartQuotes, smartDashes);

  renderer.disable("linkify");
  if (!settings.extensions.autoLinks) {
    renderer.disable("autolink");
  }

  const defaultTableOpenRenderer = renderer.renderer.rules.table_open
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  const defaultTableCloseRenderer = renderer.renderer.rules.table_close
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  renderer.renderer.rules.table_open = (tokens, index, options, env, self) => (
    `<figure class="table-figure">${defaultTableOpenRenderer(tokens, index, options, env, self)}`
  );
  renderer.renderer.rules.table_close = (tokens, index, options, env, self) => (
    `${defaultTableCloseRenderer(tokens, index, options, env, self)}</figure>`
  );

  if (settings.extensions.footnote) {
    renderer.use(footnote);
    const defaultFootnoteRefRenderer = renderer.renderer.rules.footnote_ref;
    if (defaultFootnoteRefRenderer) {
      renderer.renderer.rules.footnote_ref = (tokens, index, options, env: RenderOptions & {
        footnotes?: { list?: Array<{ content?: string }> };
      }, self) => {
        const token = tokens[index];
        const visibleNumber = Number(token.meta?.id) + 1;
        const rendered = defaultFootnoteRefRenderer(tokens, index, options, env, self)
          .replace(/>\[[^\]]+]([^<]*)<\/a>/, `>[${visibleNumber}]$1</a>`);
        const label = typeof token.meta?.label === "string" ? token.meta.label : "";
        const inlineContent = env.footnotes?.list?.[Number(token.meta?.id)]?.content ?? "";
        const summary = label
          ? getMarkdownFootnoteSummary(
            env.documentSource ?? "",
            decodeFootnoteLabelForRender(label),
          )
          : summarizeMarkdownFootnoteContent(inlineContent);
        return summary
          ? rendered.replace("<a ", `<a title="${escapeAttribute(summary)}" `)
          : rendered;
      };
    }
  }

  if (isHighlightExtensionEnabled(settings.extensions)) renderer.use(mark);
  if (isSubscriptExtensionEnabled(settings.extensions)) renderer.use(sub);
  if (isSuperscriptExtensionEnabled(settings.extensions)) renderer.use(sup);

  const defaultValidateLink = renderer.validateLink.bind(renderer);
  renderer.validateLink = (url) => {
    const action = getPreviewLinkAction(url);
    if (action === "blocked") {
      return /^data:image\/(?:gif|png|jpeg|webp);/i.test(url) && defaultValidateLink(url);
    }
    return action === "local" ? true : defaultValidateLink(url);
  };

  const defaultLinkOpenRenderer = renderer.renderer.rules.link_open
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const href = token.attrGet("href");
    if ((env as RenderOptions).preserveSourceTokens && token.info === "auto") {
      const labelToken = tokens[index + 1];
      const visibleSource = typeof labelToken?.meta?.markoSource === "string"
        ? labelToken.meta.markoSource
        : labelToken?.content ?? "";
      const markdownSource = token.markup === "autolink" ? `<${visibleSource}>` : visibleSource;
      token.attrSet("data-marko-inline-type", "link");
      token.attrSet("data-marko-inline-markdown", markdownSource);
      token.attrSet("data-marko-source-token", "link");
    }
    if (isExternalPreviewHref(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpenRenderer(tokens, index, options, env, self);
  };

  const defaultImageRenderer = renderer.renderer.rules.image
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  renderer.renderer.rules.image = (tokens, index, options, env: RenderOptions, self) => {
    const token = tokens[index];
    const source = token.attrGet("src");
    if (source) {
      token.attrSet("src", resolveAssetSource(source, env));
    }
    if (token.attrIndex("referrerpolicy") < 0) {
      token.attrSet("referrerpolicy", "no-referrer");
    }
    token.attrJoin("loading", "lazy");
    return defaultImageRenderer(tokens, index, options, env, self);
  };

  const defaultHtmlInlineRenderer = renderer.renderer.rules.html_inline
    ?? ((tokens, index) => tokens[index].content);
  renderer.renderer.rules.html_inline = (tokens, index, options, env: RenderOptions, self) => {
    return renderHtmlTokenWithResolvedAssets(tokens, index, options, env, self, defaultHtmlInlineRenderer);
  };

  const defaultHtmlBlockRenderer = renderer.renderer.rules.html_block
    ?? ((tokens, index) => tokens[index].content);
  renderer.renderer.rules.html_block = (tokens, index, options, env: RenderOptions, self) => {
    return renderHtmlTokenWithResolvedAssets(tokens, index, options, env, self, defaultHtmlBlockRenderer);
  };

  const defaultFenceRenderer = renderer.renderer.rules.fence
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  renderer.renderer.rules.fence = (tokens, index, options, env: RenderOptions, self) => {
    const token = tokens[index];
    const language = getFenceLanguage(token.info);

    if (env.settings.extensions.mermaid && (language === "mermaid" || language === "mmd")) {
      return renderDiagramBlock("mermaid-diagram", "Mermaid", `<div class="mermaid" data-diagram-source="${escapeAttribute(token.content)}">${escapeHtml(token.content)}</div>`, token.content);
    }

    if (env.settings.extensions.flowchart && (language === "flowchart" || language === "flow")) {
      return renderDiagramBlock("flowchart-diagram", "Flowchart", `<div class="flowchart-render" data-diagram-source="${escapeAttribute(token.content)}"></div>`, token.content);
    }

    if (env.settings.extensions.sequence && language === "sequence") {
      const fallback = `<pre class="sequence-fallback"><code>${escapeHtml(token.content.trimEnd())}</code></pre>`;
      return renderDiagramBlock("sequence-diagram", "Sequence", `<div class="sequence-render" data-diagram-source="${escapeAttribute(token.content)}">${fallback}</div>`, token.content);
    }

    const rendered = defaultFenceRenderer(tokens, index, options, env, self);
    return env.settings.codeLineNumbers ? addFenceLineNumbers(rendered, token.content) : rendered;
  };

  return renderer;
}

function markdownTyporaBlockSyntaxPlugin(renderer: MarkdownIt) {
  renderer.core.ruler.after("block", "marko_typora_extended_ordered_markers", (state) => {
    const markers = (state.env as RenderOptions).extendedOrderedListMarkers;
    if (!markers?.size) return;
    const usedByLine = new Map<number, number>();
    for (const token of state.tokens) {
      if (token.type !== "ordered_list_open" || !token.map) continue;
      const line = token.map[0];
      const used = usedByLine.get(line) ?? 0;
      const marker = markers.get(line)?.[used];
      usedByLine.set(line, used + 1);
      if (!marker?.extended) continue;
      token.attrSet("start", marker.value);
      token.attrJoin("class", "marko-extended-ordered-list");
      token.attrSet("data-marko-start", marker.value);
      token.attrSet("data-marko-punctuation", marker.punctuation);
    }
  });

  renderer.core.ruler.after("marko_typora_extended_ordered_markers", "marko_typora_setext_minimum", (state) => {
    const lines = state.src.split("\n");
    for (let index = 0; index + 2 < state.tokens.length; index += 1) {
      const opening = state.tokens[index];
      const inline = state.tokens[index + 1];
      const closing = state.tokens[index + 2];
      if (
        opening.type !== "heading_open"
        || inline.type !== "inline"
        || closing.type !== "heading_close"
        || (opening.markup !== "=" && opening.markup !== "-")
      ) continue;

      const markerLineIndex = opening.map?.[1];
      if (markerLineIndex === undefined) continue;
      const markerLine = (lines[markerLineIndex - 1] ?? "").replace(/\r$/, "");
      const markerContent = stripMarkdownListContainerMarkers(
        getOutlineLineContext(markerLine).content,
      ).content.trim();
      if (markerContent !== opening.markup) continue;

      const marker = opening.markup;
      opening.type = "paragraph_open";
      opening.tag = "p";
      opening.markup = "";
      inline.content = `${inline.content}\n${marker}`;
      closing.type = "paragraph_close";
      closing.tag = "p";
      closing.markup = "";
    }
  });
}

function normalizeExtendedOrderedListMarkers(source: string): {
  source: string;
  markers: Map<number, ExtendedOrderedListMarker[]>;
} {
  const protectedLines = getProtectedMarkdownLineIndexes(source);
  const markers = new Map<number, ExtendedOrderedListMarker[]>();
  const lines = source.split("\n");
  const normalized = lines.map((line, lineIndex) => {
    if (protectedLines.has(lineIndex)) return line;
    const context = getOutlineLineContext(line);
    const prefixLength = line.length - context.content.length;
    let remaining = context.content;
    let output = line.slice(0, prefixLength);

    for (let depth = 0; depth < 16; depth += 1) {
      const marker = remaining.match(
        /^([ \t]{0,3})([-+*]|(\d+)([.)]))([ \t]{1,4})(?![ \t])/
      );
      if (!marker) break;
      const digits = marker[3];
      if (digits) {
        const punctuation = marker[4] as "." | ")";
        const extended = digits.length >= 10;
        const values = markers.get(lineIndex) ?? [];
        values.push({ value: digits, punctuation, extended });
        markers.set(lineIndex, values);
        output += `${marker[1]}${extended ? "1" : digits}${punctuation}${marker[5]}`;
      } else {
        output += marker[0];
      }
      remaining = remaining.slice(marker[0].length);
    }

    return output + remaining;
  });

  return { source: normalized.join("\n"), markers };
}

function renderHtmlTokenWithResolvedAssets(
  tokens: any[],
  index: number,
  options: unknown,
  env: RenderOptions,
  self: unknown,
  render: (tokens: any[], index: number, options: any, env: RenderOptions, self: any) => string,
): string {
  const token = tokens[index];
  const original = token.content;
  token.content = normalizeSelfClosingMediaHtml(
    resolveRawHtmlLinks(resolveRawHtmlAssetSources(original, env)),
  );
  const rendered = render(tokens, index, options, env, self);
  token.content = original;
  return rendered;
}

function normalizeSelfClosingMediaHtml(html: string): string {
  return html.replace(
    /<(video|audio|iframe)\b([^<>]*?)\s*\/>/gi,
    (_match, rawName: string, attributes: string) => {
      const name = rawName.toLowerCase();
      return `<${name}${attributes}></${name}>`;
    },
  );
}

function getMarkdownRenderer(settings: EditorSettings): MarkdownIt {
  const key = [
    isHighlightExtensionEnabled(settings.extensions),
    isSuperscriptExtensionEnabled(settings.extensions),
    isSubscriptExtensionEnabled(settings.extensions),
    settings.extensions.footnote,
    settings.extensions.emoji,
    settings.extensions.autoLinks,
    settings.smartQuotes,
    settings.smartDashes,
    settings.preserveSingleLineBreaks,
  ].map(Number).join("");
  const cached = markdownRenderers.get(key);
  if (cached) return cached;
  const renderer = createMarkdownRenderer(settings);
  markdownRenderers.set(key, renderer);
  return renderer;
}

interface MarkdownFootnoteState {
  refs?: Record<string, number>;
  list?: Array<{
    label?: string;
    content?: string;
    count?: number;
    tokens?: any[];
  }>;
}

interface MarkdownRendererEnvironment extends RenderOptions {
  references?: Record<string, unknown>;
  footnotes?: MarkdownFootnoteState;
}

interface MarkdownTableTokenRows {
  headers: any[][];
  rows: any[][][];
}

interface ParsedMarkdownTable {
  rows: MarkdownTableTokenRows;
  env: MarkdownRendererEnvironment;
}

interface MarkdownDocumentAnalysis {
  tokens: any[];
  env: MarkdownRendererEnvironment;
  footnoteReferences: MarkdownDocumentFootnoteReference[];
}

interface MarkdownDocumentFootnoteReference {
  from: number;
  to: number;
  id: number;
  subId: number;
}

function parseLocalMarkdownTable(
  source: string,
  options: RenderOptions,
  renderer: MarkdownIt,
): ParsedMarkdownTable | null {
  const footnoteBody = options.settings.extensions.footnote
    ? appendReferencedFootnotes(source, options.documentSource ?? source)
    : source;
  const referenceBody = appendReferencedLinkDefinitions(
    footnoteBody,
    options.documentSource ?? source,
  );
  const canonicalBody = options.settings.extensions.footnote
    ? normalizeFootnoteLabelsForRender(referenceBody)
    : referenceBody;
  const body = prepareMarkdown(canonicalBody, options);
  const env: MarkdownRendererEnvironment = { ...options };
  const tokens = renderer.parse(body, env);
  const rows = collectMarkdownTableTokenRows(tokens, 0);
  return rows ? { rows, env } : null;
}

function analyzeMarkdownDocument(
  options: RenderOptions,
  renderer: MarkdownIt,
): MarkdownDocumentAnalysis | null {
  const documentSource = options.documentSource ?? "";
  if (!documentSource) return null;
  const { frontMatter, body } = splitFrontMatter(documentSource);
  const positionSource = options.settings.extensions.math
    ? maskMarkdownMathForAnalysis(body)
    : body;
  let source = options.settings.extensions.footnote
    ? normalizeFootnoteLabelsForRender(body)
    : body;
  if (options.settings.extensions.math) {
    source = maskMarkdownMathForAnalysis(source);
  }
  const env: MarkdownRendererEnvironment = { ...options };
  const tokens = renderer.parse(source, env);
  return {
    tokens,
    env,
    footnoteReferences: collectParsedDocumentFootnoteReferences(
      positionSource,
      frontMatter.length,
      tokens,
      env,
    ),
  };
}

function collectParsedDocumentFootnoteReferences(
  source: string,
  sourceOffset: number,
  tokens: any[],
  env: MarkdownRendererEnvironment,
): MarkdownDocumentFootnoteReference[] {
  const candidates = collectFootnoteReferenceSyntax(
    maskLiteralMarkdownBlocksForFootnoteAnalysis(source, tokens),
  );
  const parsedTokens = collectParsedFootnoteReferenceTokens(tokens);
  const references: MarkdownDocumentFootnoteReference[] = [];
  let candidateIndex = 0;

  for (const token of parsedTokens) {
    const matchIndex = candidates.findIndex((candidate, index) => (
      index >= candidateIndex && footnoteReferenceMatchesToken(candidate, token, env)
    ));
    if (matchIndex < 0) continue;
    const candidate = candidates[matchIndex];
    if (!candidate) continue;
    references.push({
      from: sourceOffset + candidate.start,
      to: sourceOffset + candidate.end,
      id: Number(token.meta?.id),
      subId: Number(token.meta?.subId ?? 0),
    });
    candidateIndex = matchIndex + 1;
  }

  return references;
}

function collectParsedFootnoteReferenceTokens(tokens: any[]): any[] {
  const references: any[] = [];
  for (const token of tokens) {
    if (token.type === "footnote_block_open") break;
    if (token.type === "footnote_ref") references.push(token);
    if (Array.isArray(token.children)) {
      references.push(...token.children.filter((child: any) => child.type === "footnote_ref"));
    }
  }
  return references;
}

function footnoteReferenceMatchesToken(
  candidate: ReturnType<typeof collectFootnoteReferenceSyntax>[number],
  token: any,
  env: MarkdownRendererEnvironment,
): boolean {
  const label = typeof token.meta?.label === "string"
    ? decodeFootnoteLabelForRender(token.meta.label).trim().toLowerCase()
    : "";
  if (label) return !candidate.inline && candidate.id.trim().toLowerCase() === label;
  if (!candidate.inline) return false;
  return env.footnotes?.list?.[Number(token.meta?.id)]?.content === candidate.id;
}

function maskLiteralMarkdownBlocksForFootnoteAnalysis(source: string, tokens: any[]): string {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") lineStarts.push(index + 1);
  }
  const characters = source.split("");
  for (const token of tokens) {
    if (!["fence", "code_block", "html_block"].includes(token.type) || !token.map) continue;
    const [startLine, endLine] = token.map as [number, number];
    const from = lineStarts[startLine] ?? source.length;
    const to = lineStarts[endLine] ?? source.length;
    for (let index = from; index < to; index += 1) {
      if (characters[index] !== "\r" && characters[index] !== "\n") characters[index] = " ";
    }
  }
  return characters.join("");
}

function findDocumentTableTokenRows(
  tokens: any[],
  documentSource: string,
  tableSource: string,
  sourceOffset?: number,
): MarkdownTableTokenRows | null {
  const { frontMatter, body } = splitFrontMatter(documentSource);
  let absoluteOffset = sourceOffset;
  if (
    absoluteOffset === undefined
    || absoluteOffset < 0
    || documentSource.slice(absoluteOffset, absoluteOffset + tableSource.length) !== tableSource
  ) {
    absoluteOffset = documentSource.indexOf(tableSource);
  }
  if (absoluteOffset < frontMatter.length) return null;

  const bodyOffset = absoluteOffset - frontMatter.length;
  const targetLine = countMarkdownLineBreaks(body.slice(0, bodyOffset));
  const tableOrdinal = findMarkdownTableOrdinalAtLine(tokens, targetLine);
  return tableOrdinal < 0 ? null : collectMarkdownTableTokenRows(tokens, tableOrdinal);
}

function findMarkdownTableOrdinalAtLine(tokens: any[], targetLine: number): number {
  let ordinal = -1;
  for (const token of tokens) {
    if (token.type !== "table_open") continue;
    ordinal += 1;
    const map = token.map as [number, number] | null;
    if (map && targetLine >= map[0] && targetLine < map[1]) return ordinal;
  }
  return -1;
}

function collectMarkdownTableTokenRows(
  tokens: any[],
  targetOrdinal: number,
): MarkdownTableTokenRows | null {
  let ordinal = -1;
  let insideTarget = false;
  let currentRow: any[][] | null = null;
  let currentCell: any[] | null = null;
  let currentRowIsHeader = false;
  const headers: any[][] = [];
  const rows: any[][][] = [];

  for (const token of tokens) {
    if (token.type === "table_open") {
      ordinal += 1;
      insideTarget = ordinal === targetOrdinal;
      continue;
    }
    if (!insideTarget) continue;
    if (token.type === "table_close") break;

    if (token.type === "tr_open") {
      currentRow = [];
      currentRowIsHeader = false;
      continue;
    }
    if (token.type === "th_open" || token.type === "td_open") {
      currentCell = [];
      if (token.type === "th_open") currentRowIsHeader = true;
      continue;
    }
    if (token.type === "inline" && currentCell) {
      currentCell.push(...(token.children ?? []));
      continue;
    }
    if (token.type === "th_close" || token.type === "td_close") {
      currentRow?.push(currentCell ?? []);
      currentCell = null;
      continue;
    }
    if (token.type === "tr_close" && currentRow) {
      if (currentRowIsHeader) headers.push(...currentRow);
      else rows.push(currentRow);
      currentRow = null;
    }
  }

  return headers.length > 0 ? { headers, rows } : null;
}

function copyTableFootnoteMetadata(
  local: MarkdownTableTokenRows,
  document: MarkdownTableTokenRows,
) {
  const localCells = [...local.headers, ...local.rows.flat()];
  const documentCells = [...document.headers, ...document.rows.flat()];
  for (let index = 0; index < localCells.length; index += 1) {
    copyFootnoteMetadata(localCells[index], documentCells[index] ?? []);
  }
}

function copyFootnoteMetadata(localTokens: any[], documentTokens: any[]) {
  const localRefs = localTokens.filter((token) => token.type === "footnote_ref");
  const documentRefs = documentTokens.filter((token) => token.type === "footnote_ref");
  let documentIndex = 0;

  for (const local of localRefs) {
    const localLabel = typeof local.meta?.label === "string" ? local.meta.label : "";
    let matchIndex = documentRefs.findIndex((token, index) => (
      index >= documentIndex
      && (localLabel
        ? token.meta?.label === localLabel
        : typeof token.meta?.label !== "string")
    ));
    if (matchIndex < 0) matchIndex = documentIndex;
    const documentToken = documentRefs[matchIndex];
    if (!documentToken) continue;
    local.meta = { ...local.meta, ...documentToken.meta };
    documentIndex = matchIndex + 1;
  }
}

function applyDocumentFootnoteIdsByLabel(
  tokens: any[],
  refs: Record<string, number>,
) {
  for (const token of tokens) {
    if (token.type !== "footnote_ref" || typeof token.meta?.label !== "string") continue;
    const id = refs[":" + token.meta.label];
    if (!Number.isInteger(id) || id < 0) continue;
    token.meta = { ...token.meta, id, subId: 0 };
  }
}

function applyDocumentInlineFootnoteIdsByOffset(
  tokens: any[],
  source: string,
  options: RenderOptions & { documentSource: string; sourceOffset: number },
  analysis: MarkdownDocumentAnalysis,
) {
  const localReferences = collectFootnoteReferenceSyntax(source)
    .filter((reference) => reference.inline);
  if (localReferences.length === 0) return;

  let localIndex = 0;
  for (const token of tokens) {
    if (token.type !== "footnote_ref" || typeof token.meta?.label === "string") continue;
    const local = localReferences[localIndex];
    localIndex += 1;
    if (!local) continue;

    const from = options.sourceOffset + local.start;
    const to = options.sourceOffset + local.end;
    const reference = analysis.footnoteReferences.find((candidate) => (
      candidate.from === from
      && candidate.to === to
    ));
    if (!reference) continue;
    token.meta = { ...token.meta, id: reference.id, subId: reference.subId };
  }
}

function isVerifiedDocumentSourceRange(source: string, options: RenderOptions): options is RenderOptions & {
  documentSource: string;
  sourceOffset: number;
} {
  const { documentSource, sourceOffset } = options;
  return typeof documentSource === "string"
    && typeof sourceOffset === "number"
    && Number.isInteger(sourceOffset)
    && sourceOffset >= 0
    && documentSource.slice(sourceOffset, sourceOffset + source.length) === source;
}

function renderMarkdownTableTokenRows(
  rows: MarkdownTableTokenRows,
  renderer: MarkdownIt,
  env: MarkdownRendererEnvironment,
): RenderedMarkdownTableCells {
  const render = (tokens: any[]) => (
    renderer.renderer.renderInline(tokens, renderer.options, env)
  );
  return {
    headers: rows.headers.map(render),
    rows: rows.rows.map((row) => row.map(render)),
  };
}

function escapeMarkdownTableCellSource(source: string): string {
  const value = source.replace(/\r?\n/g, "<br>");
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "|" && !isEscapedAt(value, index)) output += "\\";
    output += value[index];
  }
  return output;
}

function maskMarkdownMathForAnalysis(source: string): string {
  let masked = maskQuotedMathBlocksForAnalysis(source);
  masked = masked.replace(
    /(^|\n)( {0,3})\$\$[ \t]*(?:\{[^\r\n]+\})?\r?\n([\s\S]*?)(?:\r?\n)? {0,3}\$\$[ \t]*(?:\{[^\r\n]+\})?(?=\r?\n|$)/g,
    maskNonLineBreakCharacters,
  );
  masked = masked.replace(
    /(^|\n)( {0,3})\\\[\s*\n?([\s\S]*?)\n? {0,3}\\\](?=\n|$)/g,
    maskNonLineBreakCharacters,
  );
  masked = masked.replace(
    /(^|[^\\])\\\(([^\n]+?)\\\)/g,
    (match, lead: string) => lead + maskNonLineBreakCharacters(match.slice(lead.length)),
  );

  const characters = masked.split("");
  let cursor = 0;
  while (cursor < masked.length) {
    const open = masked.indexOf("$", cursor);
    if (open < 0) break;
    const match = readInlineDollarMath(masked, open);
    if (!match) {
      cursor = open + 1;
      continue;
    }
    for (let index = match.start; index < match.end; index += 1) {
      if (characters[index] !== "\r" && characters[index] !== "\n") characters[index] = " ";
    }
    cursor = match.end;
  }
  return characters.join("");
}

function maskQuotedMathBlocksForAnalysis(source: string): string {
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const opening = getQuotedMathFenceOpen(lines[index]);
    if (!opening) continue;

    let closingIndex = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const context = getQuotedMathLineContext(lines[cursor]);
      if (!context || context.key !== opening.key) break;
      if (isQuotedMathFenceClose(context, opening)) {
        closingIndex = cursor;
        break;
      }
    }
    if (closingIndex < 0) continue;
    for (let cursor = index; cursor <= closingIndex; cursor += 1) {
      lines[cursor] = maskNonLineBreakCharacters(lines[cursor]);
    }
    index = closingIndex;
  }
  return lines.join("\n");
}

function maskNonLineBreakCharacters(value: string): string {
  return value.replace(/[^\r\n]/g, " ");
}

function countMarkdownLineBreaks(source: string): number {
  return source.match(/\n/g)?.length ?? 0;
}

function markdownCjkUnderscoreEmphasisPlugin(renderer: MarkdownIt) {
  renderer.inline.ruler.before("emphasis", "marko_cjk_underscore_emphasis", (state, silent) => {
    const syntax = readCjkUnderscoreEmphasis(state.src, state.pos, state.posMax);
    if (!syntax) return false;
    if (silent) {
      state.pos = syntax.end;
      return true;
    }

    const max = state.posMax;
    const type = syntax.kind === "strong" ? "strong" : "em";
    const open = state.push(`${type}_open`, type, 1);
    open.markup = "_".repeat(syntax.markerLength);
    state.pos = syntax.contentStart;
    state.posMax = syntax.contentEnd;
    state.md.inline.tokenize(state);
    const close = state.push(`${type}_close`, type, -1);
    close.markup = open.markup;
    state.pos = syntax.end;
    state.posMax = max;
    return true;
  });
}

function markdownTyporaSpaceDestinationPlugin(renderer: MarkdownIt) {
  renderer.inline.ruler.before("link", "marko_typora_space_destination", (state, silent) => {
    const image = state.src[state.pos] === "!" && state.src[state.pos + 1] === "[";
    if (!image && state.src[state.pos] !== "[") return false;
    const openBracket = image ? state.pos + 1 : state.pos;
    const link = readMarkdownInlineLink(state.src, openBracket);
    if (!link || link.end > state.posMax) return false;
    if (image ? link.imageStart !== state.pos : link.imageStart !== null) return false;
    if (!isUnwrappedMarkdownLinkDestinationWithSpaces(state.src, link)) return false;

    const labelEnd = state.md.helpers.parseLinkLabel(
      state,
      image ? state.pos + 1 : state.pos,
      !image,
    );
    if (labelEnd !== link.labelEnd) return false;
    if (link.destinationStart === null || link.destinationEnd === null) return false;
    const destination = parseMarkdownLinkDestination(
      state.src.slice(link.destinationStart, link.destinationEnd),
    );
    if (!destination) return false;
    const href = state.md.normalizeLink(state.md.utils.unescapeAll(destination.href));
    if (!state.md.validateLink(href)) return false;
    const title = destination.title === null
      ? ""
      : state.md.utils.unescapeAll(destination.title);
    if (silent) {
      state.pos = link.end;
      return true;
    }

    if (image) {
      const content = state.src.slice(link.labelStart, link.labelEnd);
      const children: any[] = [];
      state.md.inline.parse(content, state.md, state.env, children);
      const token = state.push("image", "img", 0);
      token.attrs = [["src", href], ["alt", ""]];
      token.children = children;
      token.content = content;
      if (title) token.attrSet("title", title);
    } else {
      const max = state.posMax;
      state.pos = link.labelStart;
      state.posMax = link.labelEnd;
      const open = state.push("link_open", "a", 1);
      open.attrSet("href", href);
      if (title) open.attrSet("title", title);
      (state as any).linkLevel += 1;
      state.md.inline.tokenize(state);
      (state as any).linkLevel -= 1;
      state.push("link_close", "a", -1);
      state.posMax = max;
    }

    state.pos = link.end;
    return true;
  });
}

function markdownTyporaAutolinkPlugin(renderer: MarkdownIt, enabled: boolean) {
  renderer.core.ruler.after("inline", "marko_typora_bare_autolink", (state) => {
    if (!enabled) return;
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      const children: any[] = [];
      let linkDepth = 0;
      for (const token of block.children) {
        if (token.type === "link_open") {
          linkDepth += 1;
          children.push(token);
          continue;
        }
        if (token.type === "link_close") {
          linkDepth = Math.max(0, linkDepth - 1);
          children.push(token);
          continue;
        }
        if (token.type !== "text" || linkDepth > 0) {
          children.push(token);
          continue;
        }
        children.push(...createTyporaBareAutoLinkTokens(state, token));
      }
      block.children = children;
    }
  });
  if (!enabled) return;
  renderer.inline.ruler.before("autolink", "marko_typora_autolink", (state, silent) => {
    if (state.src[state.pos] !== "<") return false;
    const match = state.src.slice(state.pos).match(/^<([^<>\s]+)>/);
    if (!match) return false;
    const text = match[1] ?? "";
    const rawHref = getTyporaAutoLinkHref(text);
    if (!rawHref) return false;
    const href = state.md.normalizeLink(rawHref);
    if (!state.md.validateLink(href)) return false;
    if (silent) return true;

    const open = state.push("link_open", "a", 1);
    open.attrSet("href", href);
    open.markup = "autolink";
    open.info = "auto";
    const label = state.push("text", "", 0);
    label.content = text;
    label.meta = { ...(label.meta ?? {}), markoSource: text };
    const close = state.push("link_close", "a", -1);
    close.markup = "autolink";
    close.info = "auto";
    state.pos += match[0].length;
    return true;
  });
}

function createTyporaBareAutoLinkTokens(state: any, token: any): any[] {
  const matches = collectTyporaBareAutoLinks(token.content);
  if (matches.length === 0) return [token];
  const result: any[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      const text = new state.Token("text", "", 0);
      text.content = token.content.slice(cursor, match.start);
      result.push(text);
    }
    const href = state.md.normalizeLink(match.href);
    if (!state.md.validateLink(href)) {
      const text = new state.Token("text", "", 0);
      text.content = token.content.slice(match.start, match.end);
      result.push(text);
      cursor = match.end;
      continue;
    }
    const open = new state.Token("link_open", "a", 1);
    open.attrSet("href", href);
    open.markup = "linkify";
    open.info = "auto";
    result.push(open);
    const label = new state.Token("text", "", 0);
    label.content = match.text;
    label.meta = { markoSource: match.text };
    result.push(label);
    const close = new state.Token("link_close", "a", -1);
    close.markup = "linkify";
    close.info = "auto";
    result.push(close);
    cursor = match.end;
  }
  if (cursor < token.content.length) {
    const text = new state.Token("text", "", 0);
    text.content = token.content.slice(cursor);
    result.push(text);
  }
  return result;
}

function markdownInlineTextPlugin(renderer: MarkdownIt, emojiEnabled: boolean) {
  if (emojiEnabled) {
    renderer.inline.ruler.before("escape", "marko_escaped_emoji_colon", (state, silent) => {
      if (state.src[state.pos] !== "\\" || state.src[state.pos + 1] !== ":") return false;
      if (!silent) {
        const token = state.push("marko_escaped_emoji_colon", "", 0);
        token.content = ":";
        token.meta = { markoSource: "\\:" };
      }
      state.pos += 2;
      return true;
    });
    renderer.renderer.rules.marko_escaped_emoji_colon = (
      tokens,
      index,
      _options,
      env: RenderOptions,
    ) => {
      if (!env.preserveSourceTokens) return ":";
      return [
        `<span data-marko-inline-markdown="${escapeAttribute("\\:")}"`,
        ' data-marko-source-token="text">:</span>',
      ].join("");
    };
  }
  renderer.core.ruler.after("marko_typora_bare_autolink", "marko_inline_text", (state) => {
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      let autoLinkDepth = 0;
      let mathContext: { tag: string; depth: number } | null = null;
      const children: any[] = [];

      for (const token of block.children) {
        if (token.type === "html_inline") {
          mathContext = updateProtectedMathContext(token.content, mathContext);
          children.push(token);
          continue;
        }
        if (mathContext) {
          if (token.type === "text") token.type = "html_inline";
          children.push(token);
          continue;
        }
        if (token.type === "text") {
          token.meta = {
            ...(token.meta ?? {}),
            markoSource: typeof token.meta?.markoSource === "string"
              ? token.meta.markoSource
              : token.content,
          };
        }
        if (token.type === "link_open" && token.info === "auto") {
          autoLinkDepth += 1;
          children.push(token);
          continue;
        }
        if (token.type === "link_close" && token.info === "auto") {
          autoLinkDepth = Math.max(0, autoLinkDepth - 1);
          children.push(token);
          continue;
        }
        if (
          emojiEnabled
          && token.type === "text"
          && autoLinkDepth === 0
        ) {
          if ((state.env as RenderOptions).preserveSourceTokens) {
            children.push(...createSourcePreservingEmojiTokens(state, token));
            continue;
          }
          token.content = replaceEmojiShortcodes(token.content);
        }
        children.push(token);
      }
      block.children = children;
    }
  });
}

function createSourcePreservingEmojiTokens(state: any, token: any): any[] {
  const source = token.content as string;
  const matches = getEmojiShortcodeMatches(source);
  if (matches.length === 0) return [token];

  const result: any[] = [];
  let cursor = 0;
  const createToken = (type: "text" | "html_inline", content: string, markdownSource = content) => {
    const child = new state.Token(type, type === "text" ? token.tag : "", type === "text" ? token.nesting : 0);
    Object.assign(child, token, {
      type,
      tag: type === "text" ? token.tag : "",
      nesting: type === "text" ? token.nesting : 0,
      content,
      meta: type === "text" ? { ...(token.meta ?? {}), markoSource: markdownSource } : null,
    });
    return child;
  };

  for (const match of matches) {
    if (match.start > cursor) {
      const text = source.slice(cursor, match.start);
      result.push(createToken("text", text));
    }
    result.push(createToken(
      "html_inline",
      [
        `<span data-marko-inline-markdown="${escapeAttribute(match.source)}"`,
        ' data-marko-source-token="text">',
        escapeHtml(match.value),
        "</span>",
      ].join(""),
      match.source,
    ));
    cursor = match.end;
  }
  if (cursor < source.length) {
    const text = source.slice(cursor);
    result.push(createToken("text", text));
  }
  return result;
}

function markdownSourcePreservationPlugin(renderer: MarkdownIt) {
  renderer.core.ruler.after("smartquotes", "marko_source_preservation", (state) => {
    if (!(state.env as RenderOptions).preserveSourceTokens) return;
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      for (const token of block.children) {
        const source = typeof token.meta?.markoSource === "string" ? token.meta.markoSource : "";
        if (token.type !== "text" || !source || source === token.content) continue;
        token.type = "html_inline";
        token.content = renderSourcePreservingText(source, token.content);
      }
    }
  });
}

function renderSourcePreservingText(source: string, rendered: string): string {
  const replacements = collectSourceTextReplacements(source, rendered);
  if (replacements.length === 0) return escapeHtml(rendered);
  let renderedCursor = 0;
  const output: string[] = [];
  for (const replacement of replacements) {
    output.push(escapeHtml(rendered.slice(renderedCursor, replacement.renderedStart)));
    output.push([
      `<span data-marko-inline-markdown="${escapeAttribute(source.slice(replacement.sourceStart, replacement.sourceEnd))}"`,
      ' data-marko-source-token="text">',
      escapeHtml(rendered.slice(replacement.renderedStart, replacement.renderedEnd)),
      "</span>",
    ].join(""));
    renderedCursor = replacement.renderedEnd;
  }
  output.push(escapeHtml(rendered.slice(renderedCursor)));
  return output.join("");
}

interface SourceTextReplacement {
  sourceStart: number;
  sourceEnd: number;
  renderedStart: number;
  renderedEnd: number;
}

function collectSourceTextReplacements(source: string, rendered: string): SourceTextReplacement[] {
  if (source === rendered) return [];
  const replacements: SourceTextReplacement[] = [];
  let sourceIndex = 0;
  let renderedIndex = 0;
  while (sourceIndex < source.length || renderedIndex < rendered.length) {
    if (source[sourceIndex] === rendered[renderedIndex]) {
      sourceIndex += 1;
      renderedIndex += 1;
      continue;
    }
    const alignment = findSourceTextAlignment(source, rendered, sourceIndex, renderedIndex);
    const sourceEnd = alignment?.source ?? source.length;
    const renderedEnd = alignment?.rendered ?? rendered.length;
    replacements.push({
      sourceStart: sourceIndex,
      sourceEnd,
      renderedStart: renderedIndex,
      renderedEnd,
    });
    sourceIndex = sourceEnd;
    renderedIndex = renderedEnd;
  }
  return replacements;
}

function findSourceTextAlignment(
  source: string,
  rendered: string,
  sourceIndex: number,
  renderedIndex: number,
): { source: number; rendered: number } | null {
  const sourceLimit = Math.min(source.length, sourceIndex + 24);
  const renderedLimit = Math.min(rendered.length, renderedIndex + 24);
  let best: { source: number; rendered: number; common: number; distance: number } | null = null;
  for (let nextSource = sourceIndex + 1; nextSource <= sourceLimit; nextSource += 1) {
    for (let nextRendered = renderedIndex + 1; nextRendered <= renderedLimit; nextRendered += 1) {
      let common = 0;
      while (
        nextSource + common < source.length
        && nextRendered + common < rendered.length
        && source[nextSource + common] === rendered[nextRendered + common]
      ) {
        common += 1;
      }
      const reachesEnd = nextSource === source.length && nextRendered === rendered.length;
      if (common === 0 && !reachesEnd) continue;
      const distance = nextSource - sourceIndex + nextRendered - renderedIndex;
      if (!best || distance < best.distance || (distance === best.distance && common > best.common)) {
        best = { source: nextSource, rendered: nextRendered, common, distance };
      }
    }
  }
  return best ? { source: best.source, rendered: best.rendered } : null;
}

function updateProtectedMathContext(
  html: string,
  context: { tag: string; depth: number } | null,
): { tag: string; depth: number } | null {
  const tagPattern = /<(\/)?([A-Za-z][\w:-]*)(?:\s[^<>]*?)?(\/)?\s*>/g;
  for (const match of html.matchAll(tagPattern)) {
    const closing = Boolean(match[1]);
    const tag = match[2].toLowerCase();
    const selfClosing = Boolean(match[3]);

    if (!context) {
      if (!closing && !selfClosing && /\bclass\s*=\s*["'][^"']*\bmath-(?:inline|block)\b/i.test(match[0])) {
        context = { tag, depth: 1 };
      }
      continue;
    }
    if (tag !== context.tag) continue;
    if (closing) context.depth -= 1;
    else if (!selfClosing) context.depth += 1;
    if (context.depth === 0) context = null;
  }
  return context;
}

function addFenceLineNumbers(rendered: string, content: string): string {
  const normalized = content.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const count = Math.max(1, normalized.split("\n").length);
  const lineNumbers = Array.from({ length: count }, (_item, index) => index + 1).join("\n");
  if (/<pre\s+class="/.test(rendered)) {
    return rendered.replace(
      /<pre\s+class="([^"]*)"/,
      `<pre class="$1 code-with-line-numbers" data-line-numbers="${escapeAttribute(lineNumbers)}"`,
    );
  }
  return rendered.replace(
    /<pre(?=[\s>])/,
    `<pre class="code-with-line-numbers" data-line-numbers="${escapeAttribute(lineNumbers)}"`,
  );
}

function renderMath(source: string, options: RenderOptions): string {
  const protectedParts: string[] = [];
  const fragments: MathRenderFragment[] = [];
  const addMath = (formula: string, display: boolean) => {
    const token = "@@MARKO_MATH_" + fragments.length + "@@";
    fragments.push({ formula: formula.trim(), display });
    return token;
  };
  const protect = (value: string) => {
    const token = `@@MARKO_PROTECTED_${protectedParts.length}@@`;
    protectedParts.push(value);
    return token;
  };

  const normalizedSource = normalizeGitLabMathFences(source);
  let next = protectIndentedCodeBlocks(protectFencedMarkdownBlocks(normalizedSource, protect), protect)
    .replace(/(`+)([^`\n]|`(?!`))*?\1/g, (match) => protect(match));

  next = protectHtmlCodeLikeBlocks(next, protect);
  next = protectRawHtmlMarkup(next, protect);
  next = protectMarkdownReferenceDefinitions(next, protect);
  next = protectMarkdownLinkMathTargets(next, protect);

  next = renderListMathBlocks(next, addMath);
  next = renderQuotedMathBlocks(next, addMath);

  next = next.replace(/(^|\n)( {0,3})\$\$[ \t]*(?:\{[^\r\n]+\})?\r?\n([\s\S]*?)(?:\r?\n)? {0,3}\$\$[ \t]*(?:\{[^\r\n]+\})?(?=\r?\n|$)/g, (_match, lead: string, indent: string, formula: string) => {
    return `${lead}${indent}<div class="math-block">${addMath(normalizeIndentedMathBlockFormula(formula, indent), true)}</div>`;
  });

  next = next.replace(/(^|\n)( {0,3})\\\[\s*\n?([\s\S]*?)\n? {0,3}\\\](?=\n|$)/g, (_match, lead: string, indent: string, formula: string) => {
    return `${lead}${indent}<div class="math-block">${addMath(normalizeIndentedMathBlockFormula(formula, indent), true)}</div>`;
  });

  next = next.replace(/(^|[^\\])\\\(([^\n]+?)\\\)/g, (_match, lead: string, formula: string) => {
    const normalized = formula.trim();
    if (!normalized) return `${lead}\\(${formula}\\)`;
    return `${lead}<span class="math-inline">${addMath(normalized, false)}</span>`;
  });

  next = renderInlineDollarMath(next, addMath);
  next = renderMathPlaceholders(next, fragments, source, options);

  return protectedParts.reduceRight(
    (value, part, index) => value.replace(`@@MARKO_PROTECTED_${index}@@`, () => part),
    next,
  );
}

function normalizeIndentedMathBlockFormula(formula: string, indent: string): string {
  const indentWidth = getIndentWidth(indent);
  if (indentWidth === 0) return formula;
  return formula.split(/\r?\n/)
    .map((line) => removeIndentWidth(line, indentWidth))
    .join("\n");
}

function renderInlineDollarMath(
  source: string,
  addMath: (formula: string, display: boolean) => string,
): string {
  const output: string[] = [];
  let copiedUntil = 0;
  let cursor = 0;

  while (cursor < source.length) {
    const open = source.indexOf("$", cursor);
    if (open < 0) break;
    const match = readInlineDollarMath(source, open);
    if (!match) {
      cursor = open + 1;
      continue;
    }

    output.push(source.slice(copiedUntil, match.start));
    output.push(`<span class="math-inline">${addMath(match.formula, false)}</span>`);
    copiedUntil = match.end;
    cursor = match.end;
  }

  if (output.length === 0) return source;
  output.push(source.slice(copiedUntil));
  return output.join("");
}

function renderMathPlaceholders(
  source: string,
  fragments: readonly MathRenderFragment[],
  originalSource: string,
  options: RenderOptions,
): string {
  const orderedIndexes = Array.from(source.matchAll(/@@MARKO_MATH_(\d+)@@/g))
    .map((match) => Number(match[1]));
  const orderedFragments = orderedIndexes.map((index) => fragments[index]!);
  const rendered = renderMathJaxFragments(orderedFragments, {
    documentSource: options.documentSource ?? originalSource,
    source: originalSource,
    sourceOffset: options.sourceOffset,
    autoNumbering: options.settings.autoNumberingForMath,
  });
  const byIndex = new Map<number, string>();
  orderedIndexes.forEach((fragmentIndex, index) => {
    byIndex.set(fragmentIndex, rendered[index] ?? "");
  });
  return source.replace(
    /@@MARKO_MATH_(\d+)@@/g,
    (_match, index: string) => byIndex.get(Number(index)) ?? "",
  );
}

function protectHtmlCodeLikeBlocks(source: string, protect: (value: string) => string): string {
  return source.replace(
    /<(pre|code|kbd|samp|script|style|textarea)\b[\s\S]*?<\/\1>/gi,
    (match) => protect(match),
  );
}

function protectRawHtmlMarkup(source: string, protect: (value: string) => string): string {
  let result = "";
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) {
      result += source.slice(cursor);
      break;
    }

    const end = findRawHtmlMarkupEnd(source, start);
    if (end < 0) {
      result += source.slice(cursor, start + 1);
      cursor = start + 1;
      continue;
    }

    result += source.slice(cursor, start);
    result += protect(source.slice(start, end));
    cursor = end;
  }

  return result;
}

function findRawHtmlMarkupEnd(source: string, start: number): number {
  if (source.startsWith("<!--", start)) {
    const end = source.indexOf("-->", start + 4);
    return end < 0 ? -1 : end + 3;
  }
  if (source.startsWith("<![CDATA[", start)) {
    const end = source.indexOf("]]>", start + 9);
    return end < 0 ? -1 : end + 3;
  }
  if (source.startsWith("<?", start)) {
    const end = source.indexOf("?>", start + 2);
    return end < 0 ? -1 : end + 2;
  }

  let cursor = start + 1;
  if (source[cursor] === "!") {
    return findHtmlTagClosingBracket(source, cursor + 1);
  }

  const closing = source[cursor] === "/";
  if (closing) cursor += 1;
  if (!/[A-Za-z]/.test(source[cursor] ?? "")) return -1;

  cursor += 1;
  while (/[A-Za-z0-9:-]/.test(source[cursor] ?? "")) cursor += 1;

  const boundary = source[cursor];
  if (closing) {
    if (boundary === ">") return cursor + 1;
    if (!/[ \t\r\n]/.test(boundary ?? "")) return -1;
    while (/[ \t\r\n]/.test(source[cursor] ?? "")) cursor += 1;
    return source[cursor] === ">" ? cursor + 1 : -1;
  }

  if (boundary === ">") return cursor + 1;
  if (boundary === "/") {
    cursor += 1;
    while (/[ \t\r\n]/.test(source[cursor] ?? "")) cursor += 1;
    return source[cursor] === ">" ? cursor + 1 : -1;
  }
  if (!/[ \t\r\n]/.test(boundary ?? "")) return -1;
  return findHtmlTagClosingBracket(source, cursor);
}

function findHtmlTagClosingBracket(source: string, start: number): number {
  let quote: "\"" | "'" | null = null;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index + 1;
  }

  return -1;
}

function protectMarkdownReferenceDefinitions(
  source: string,
  protect: (value: string) => string,
): string {
  const lines = source.split("\n");
  let mayHaveContinuationTitle = false;

  return lines.map((line) => {
    const cleanLine = stripCarriageReturn(line);
    const context = getOutlineLineContext(cleanLine);

    if (mayHaveContinuationTitle && isReferenceTitleContinuationLine(context.content)) {
      mayHaveContinuationTitle = false;
      return protect(line);
    }

    mayHaveContinuationTitle = false;
    if (!isMarkdownLinkReferenceDefinitionLine(context.content)) return line;
    mayHaveContinuationTitle = true;
    return protect(line);
  }).join("\n");
}

function protectMarkdownLinkMathTargets(
  source: string,
  protect: (value: string) => string,
): string {
  return replaceMarkdownLinkSyntax(source, (link) => {
    const linkStart = link.imageStart ?? link.start;
    if (link.imageStart !== null) {
      return protect(source.slice(linkStart, link.end));
    }

    if (link.destinationStart !== null && link.destinationEnd !== null) {
      return [
        source.slice(linkStart, link.destinationStart),
        protect(source.slice(link.destinationStart, link.destinationEnd)),
        source.slice(link.destinationEnd, link.end),
      ].join("");
    }

    return [
      source.slice(linkStart, link.labelEnd + 1),
      protect(source.slice(link.labelEnd + 1, link.end)),
    ].join("");
  });
}

type QuotedMathFence =
  | { marker: "$$"; prefix: string; key: string }
  | { marker: "\\["; prefix: string; key: string };

interface QuotedMathLineContext {
  prefix: string;
  content: string;
  contentColumn: number;
  trimmed: string;
  key: string;
}

interface ListMathFence {
  marker: "$$" | "\\[";
  prefix: string;
  quoteKey: string;
  listIndentWidth: number;
  contentIndentWidth: number;
}

function renderListMathBlocks(
  source: string,
  addMath: (formula: string, display: boolean) => string,
): string {
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = getListMathFenceOpen(stripCarriageReturn(lines[index] ?? ""));
    if (!opening) {
      output.push(lines[index] ?? "");
      continue;
    }

    const formulaLines: string[] = [];
    let closingIndex = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = stripCarriageReturn(lines[cursor] ?? "");
      const context = getOutlineLineContext(line);
      const fence: OutlineFence = {
        kind: "math",
        marker: opening.marker,
        listIndentWidth: opening.listIndentWidth,
        quoteKey: opening.quoteKey,
      };
      const continuation = getOutlineFenceContinuationLine(line, fence);
      if (!continuation) break;
      if (isOutlineFenceClose(continuation.content, fence, continuation.contentColumn)) {
        closingIndex = cursor;
        break;
      }
      formulaLines.push(
        stripMarkdownIndentColumns(
          context.content,
          opening.contentIndentWidth,
          context.contentColumn,
        )?.content ?? continuation.content,
      );
    }

    if (closingIndex < 0) {
      output.push(lines[index] ?? "");
      continue;
    }

    output.push(`${opening.prefix}<div class="math-block">${addMath(formulaLines.join("\n"), true)}</div>`);
    index = closingIndex;
  }

  return output.join("\n");
}

function getListMathFenceOpen(line: string): ListMathFence | null {
  const context = getOutlineLineContext(line);
  const container = stripMarkdownListContainerMarkers(context.content, context.contentColumn);
  if (container.prefixLength === 0 || container.codeIndented) return null;
  const contentColumn = context.contentColumn + container.continuationIndentWidth;
  if (isMarkdownCodeIndented(container.content, contentColumn)) return null;
  const dollar = readDollarMathBlockOpening(container.content, 3, contentColumn);
  const indent = getLeadingMarkdownIndent(container.content);
  const semantic = container.content.slice(indent.length);
  const bracket = /^\\\[\s*$/.test(semantic);
  if (!dollar && !bracket) return null;
  const prefixLength = context.prefix.length + container.prefixLength + indent.length;
  const fenceIndentWidth = getMarkdownColumnAfter(indent, contentColumn) - contentColumn;
  return {
    marker: dollar ? "$$" : "\\[",
    prefix: line.slice(0, prefixLength),
    quoteKey: context.quoteKey,
    listIndentWidth: container.continuationIndentWidth,
    contentIndentWidth: container.continuationIndentWidth + fenceIndentWidth,
  };
}

function renderQuotedMathBlocks(
  source: string,
  addMath: (formula: string, display: boolean) => string,
): string {
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = getQuotedMathFenceOpen(lines[index]);
    if (!opening) {
      output.push(lines[index]);
      continue;
    }

    const formulaLines: string[] = [];
    let closingIndex = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const context = getQuotedMathLineContext(lines[cursor]);
      if (!context || context.key !== opening.key) break;
      if (isQuotedMathFenceClose(context, opening)) {
        closingIndex = cursor;
        break;
      }
      formulaLines.push(context.content);
    }

    if (closingIndex < 0) {
      output.push(lines[index]);
      continue;
    }

    output.push(`${opening.prefix}<div class="math-block">${addMath(formulaLines.join("\n"), true)}</div>`);
    index = closingIndex;
  }

  return output.join("\n");
}

function getQuotedMathFenceOpen(line: string): QuotedMathFence | null {
  const context = getQuotedMathLineContext(line);
  if (!context) return null;
  if (readDollarMathBlockOpening(context.content, 3, context.contentColumn)) {
    return { marker: "$$", prefix: context.prefix, key: context.key };
  }
  if (/^\\\[\s*$/.test(context.trimmed)) {
    return { marker: "\\[", prefix: context.prefix, key: context.key };
  }
  return null;
}

function isQuotedMathFenceClose(context: QuotedMathLineContext, fence: QuotedMathFence): boolean {
  return fence.marker === "$$"
    ? isDollarMathBlockClosing(context.content, 3, context.contentColumn)
    : /^\\\]\s*$/.test(context.trimmed);
}

function getQuotedMathLineContext(line: string): QuotedMathLineContext | null {
  const quote = readMarkdownBlockquotePrefix(line);
  if (!quote) return null;
  const content = line.slice(quote.raw.length);
  return {
    prefix: quote.raw,
    content,
    contentColumn: quote.contentColumn,
    trimmed: content.trim(),
    key: `quote:${quote.depth}`,
  };
}

function preserveMathDelimiters(source: string): string {
  const protectedParts: string[] = [];
  const protect = (value: string) => {
    const token = `@@MARKO_PROTECTED_${protectedParts.length}@@`;
    protectedParts.push(value);
    return token;
  };

  const next = protectIndentedCodeBlocks(protectFencedMarkdownBlocks(source, protect), protect)
    .replace(/(`+)([^`\n]|`(?!`))*?\1/g, (match) => protect(match))
    .replace(/(^|\n)( {0,3})\\\[([\s\S]*?)\\\](?=\n|$)/g, (_match, lead: string, indent: string, formula: string) => (
      `${lead}${indent}&#92;[${formula}&#92;]`
    ))
    .replace(/(^|[^\\])\\\(([^\n]+?)\\\)/g, (_match, lead: string, formula: string) => (
      `${lead}&#92;(${formula}&#92;)`
    ));

  return protectedParts.reduceRight(
    (value, part, index) => value.replace(`@@MARKO_PROTECTED_${index}@@`, () => part),
    next,
  );
}

function normalizeGitLabMathFences(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const openingLine = stripCarriageReturn(lines[index]);
    const opening = getProtectedFenceOpen(openingLine);
    if (!opening || opening.info.trim().toLowerCase() !== "math") {
      output.push(lines[index]);
      continue;
    }

    let closingIndex = -1;
    let closingMarker = "";
    const activeFence: OutlineFence = {
      kind: "code",
      marker: opening.marker,
      listIndentWidth: opening.listIndentWidth,
      quoteKey: opening.quoteKey,
    };
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = stripCarriageReturn(lines[cursor]);
      const continuation = getOutlineFenceContinuationLine(line, activeFence);
      if (!continuation) break;
      const closing = getProtectedFenceClosingMarker(
        continuation.content,
        continuation.contentColumn,
      );
      if (
        closing
        && closing[0] === opening.marker[0]
        && closing.length >= opening.marker.length
      ) {
        closingIndex = cursor;
        closingMarker = closing;
        break;
      }
    }
    if (closingIndex < 0) {
      output.push(lines[index]);
      continue;
    }

    output.push(replaceGitLabMathFenceLine(lines[index], opening.marker, false));
    output.push(...lines.slice(index + 1, closingIndex));
    output.push(replaceGitLabMathFenceLine(lines[closingIndex], closingMarker, true));
    index = closingIndex;
  }

  return output.join("\n");
}

function replaceGitLabMathFenceLine(
  line: string,
  marker: string,
  closing: boolean,
): string {
  const cleanLine = stripCarriageReturn(line);
  const markerIndex = closing
    ? cleanLine.lastIndexOf(marker)
    : cleanLine.indexOf(marker);
  if (markerIndex < 0) return line;
  return cleanLine.slice(0, markerIndex) + "$$" + (line.endsWith("\r") ? "\r" : "");
}

function protectFencedMarkdownBlocks(source: string, protect: (value: string) => string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const openingLine = stripCarriageReturn(lines[index]);
    const opening = getProtectedFenceOpen(openingLine);
    if (!opening) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const marker = opening.marker;
    const markerChar = marker[0];
    const markerLength = marker.length;
    const block = [lines[index]];
    index += 1;

    const activeFence: OutlineFence = {
      kind: "code",
      marker,
      listIndentWidth: opening.listIndentWidth,
      quoteKey: opening.quoteKey,
    };
    while (index < lines.length) {
      const line = stripCarriageReturn(lines[index]);
      const continuation = getOutlineFenceContinuationLine(line, activeFence);
      if (!continuation) break;
      block.push(lines[index]);
      index += 1;
      const closing = getProtectedFenceClosingMarker(
        continuation.content,
        continuation.contentColumn,
      );
      if (closing && closing[0] === markerChar && closing.length >= markerLength) {
        break;
      }
    }

    output.push(protect(block.join("\n")));
  }

  return output.join("\n");
}

function protectIndentedCodeBlocks(source: string, protect: (value: string) => string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const openingLine = stripCarriageReturn(lines[index]);
    const openingContext = getOutlineLineContext(openingLine);
    const mathFence = getOutlineFenceOpen(openingContext.content, openingContext.contentColumn);
    const mathClosing = mathFence?.kind === "math"
      ? findProtectedMathFenceClose(lines, index + 1, openingContext.quoteKey, mathFence)
      : -1;
    if (mathClosing >= 0) {
      output.push(...lines.slice(index, mathClosing + 1));
      index = mathClosing + 1;
      continue;
    }

    const key = getIndentedCodeLineKey(lines[index]);
    if (!key) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const block: string[] = [];
    while (
      index < lines.length
      && (getIndentedCodeLineKey(lines[index]) === key || (block.length > 0 && isBlankLineInQuoteContext(lines[index], key)))
    ) {
      block.push(lines[index]);
      index += 1;
    }
    output.push(protect(block.join("\n")));
  }

  return output.join("\n");
}

function findProtectedMathFenceClose(
  lines: readonly string[],
  startIndex: number,
  quoteKey: string,
  fence: OutlineFence,
): number {
  const activeFence = { ...fence, quoteKey };
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = stripCarriageReturn(lines[index]);
    const continuation = getOutlineFenceContinuationLine(line, activeFence);
    if (!continuation) return -1;
    if (isOutlineFenceClose(continuation.content, activeFence, continuation.contentColumn)) {
      return index;
    }
  }
  return -1;
}

function isIndentedCodeLine(line: string): boolean {
  return isMarkdownCodeIndented(line);
}

function getIndentedCodeLineKey(line: string): string | null {
  const context = getOutlineLineContext(line);
  const container = stripMarkdownListContainerMarkers(context.content, context.contentColumn);
  const contentColumn = context.contentColumn + container.continuationIndentWidth;
  if (
    container.codeIndented
    || (
      container.prefixLength > 0
      && isMarkdownCodeIndented(container.content, contentColumn)
    )
  ) return context.quoteKey;
  return isMarkdownCodeIndented(context.content, context.contentColumn)
    ? context.quoteKey
    : null;
}

function isBlankLineInQuoteContext(line: string, key: string): boolean {
  const context = getOutlineLineContext(line);
  return context.quoteKey === key && !context.content.trim();
}

function getProtectedFenceOpen(
  line: string,
): { marker: string; quoteKey: string; info: string; listIndentWidth: number } | null {
  const context = getOutlineLineContext(line);
  const container = stripMarkdownListContainerMarkers(context.content, context.contentColumn);
  const contentColumn = context.contentColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(container.content, contentColumn)) return null;
  const indent = getLeadingMarkdownIndent(container.content);
  const opening = container.content.slice(indent.length).match(/^(`{3,}|~{3,})([^\r\n]*)$/);
  if (!opening || (opening[1][0] === "`" && opening[2].includes("`"))) return null;
  return {
    marker: opening[1],
    quoteKey: context.quoteKey,
    info: opening[2],
    listIndentWidth: container.continuationIndentWidth,
  };
}

function getProtectedFenceClosingMarker(content: string, contentColumn: number): string | null {
  if (isMarkdownCodeIndented(content, contentColumn)) return null;
  const indent = getLeadingMarkdownIndent(content);
  const closing = content.slice(indent.length).match(/^(`{3,}|~{3,})[ \t]*$/);
  return closing?.[1] ?? null;
}

function stripCarriageReturn(value: string): string {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}


function escapeFootnoteSyntax(source: string): string {
  const protectedLines = getProtectedMarkdownLineIndexes(source);
  const inlineCodeRanges = collectInlineCodeRanges(source, protectedLines);
  const htmlMarkupRanges = collectRawHtmlMarkupRanges(source);
  let offset = 0;
  return source.split("\n").map((line, index) => {
    const lineStart = offset;
    offset += line.length + 1;
    if (protectedLines.has(index)) return line;
    return line.replace(
      /(^|[^\\])\[\^([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)]/g,
      (match, lead: string, id: string, matchOffset: number) => {
        const referenceOffset = lineStart + matchOffset + lead.length;
        if (
          isOffsetInsideRange(referenceOffset, inlineCodeRanges)
          || isOffsetInsideRange(referenceOffset, htmlMarkupRanges)
        ) return match;
        return `${lead}\\[\\^${id}]`;
      },
    );
  }).join("\n");
}

function renderTocOutsideLiteralBlocks(
  source: string,
  outline: OutlineItem[],
  protectHtml: (html: string) => string,
): string {
  const protectedLines = getProtectedMarkdownLineIndexes(source);
  const inlineCodeLines = getInlineCodeLineIndexes(source, protectedLines);
  return source
    .split("\n")
    .map((line, index) => {
      if (
        protectedLines.has(index)
        || inlineCodeLines.has(index)
        || !isMarkdownTocLine(line)
      ) return line;
      const carriageReturn = line.endsWith("\r") ? "\r" : "";
      return `${protectHtml(renderToc(outline))}${carriageReturn}`;
    })
    .join("\n");
}

function getProtectedMarkdownLineIndexes(source: string): Set<number> {
  const lines = new Set<number>();
  for (const token of markdownLiteralBlockParser.parse(source, {})) {
    if (!token.map || !["fence", "code_block", "html_block"].includes(token.type)) continue;
    for (let index = token.map[0]; index < token.map[1]; index += 1) {
      lines.add(index);
    }
  }
  return lines;
}

interface MarkdownTextRange {
  from: number;
  to: number;
}

function collectRawHtmlMarkupRanges(source: string): MarkdownTextRange[] {
  const ranges: MarkdownTextRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;

    const end = findRawHtmlMarkupEnd(source, start);
    if (end < 0) {
      cursor = start + 1;
      continue;
    }

    ranges.push({ from: start, to: end });
    cursor = end;
  }

  return ranges;
}

function collectInlineCodeRanges(
  source: string,
  protectedLines: ReadonlySet<number>,
): MarkdownTextRange[] {
  const lineStarts = collectLineStarts(source);
  const ranges: MarkdownTextRange[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const open = source.indexOf(String.fromCharCode(96), cursor);
    if (open < 0) break;
    const openLine = getLineIndexAtOffset(lineStarts, open);
    if (protectedLines.has(openLine) || isEscapedBacktick(source, open)) {
      cursor = open + 1;
      continue;
    }

    let markerLength = 1;
    while (source[open + markerLength] === String.fromCharCode(96)) markerLength += 1;
    let candidate = open + markerLength;
    let closed = false;

    while (candidate < source.length) {
      const close = source.indexOf(String.fromCharCode(96), candidate);
      if (close < 0) break;
      const closeLine = getLineIndexAtOffset(lineStarts, close);
      if (protectedLines.has(closeLine)) break;
      let closeLength = 1;
      while (source[close + closeLength] === String.fromCharCode(96)) closeLength += 1;
      if (
        closeLength === markerLength
        && !isEscapedBacktick(source, close)
      ) {
        const end = close + closeLength;
        if (!hasProtectedLineBetween(lineStarts, open, end, protectedLines)) {
          ranges.push({ from: open, to: end });
          cursor = end;
          closed = true;
        }
        break;
      }
      candidate = close + closeLength;
    }

    if (!closed) cursor = open + markerLength;
  }

  return ranges;
}

function getInlineCodeLineIndexes(
  source: string,
  protectedLines: ReadonlySet<number>,
): Set<number> {
  const lineStarts = collectLineStarts(source);
  const indexes = new Set<number>();
  for (const range of collectInlineCodeRanges(source, protectedLines)) {
    const first = getLineIndexAtOffset(lineStarts, range.from);
    const last = getLineIndexAtOffset(lineStarts, Math.max(range.from, range.to - 1));
    for (let index = first; index <= last; index += 1) indexes.add(index);
  }
  return indexes;
}

function collectLineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function getLineIndexAtOffset(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, high);
}

function hasProtectedLineBetween(
  starts: number[],
  from: number,
  to: number,
  protectedLines: ReadonlySet<number>,
): boolean {
  const first = getLineIndexAtOffset(starts, from);
  const last = getLineIndexAtOffset(starts, Math.max(from, to - 1));
  for (let index = first; index <= last; index += 1) {
    if (protectedLines.has(index)) return true;
  }
  return false;
}

function isOffsetInsideRange(offset: number, ranges: ReadonlyArray<MarkdownTextRange>): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to);
}

function isEscapedBacktick(source: string, offset: number): boolean {
  let backslashes = 0;
  for (let index = offset - 1; index >= 0 && source.charCodeAt(index) === 92; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function replaceMermaidShortcodesOutsideLiteralBlocks(source: string): string {
  const lines = source.split(`\n`);
  const protectedLines = getProtectedMarkdownLineIndexes(source);
  const openingPattern = /^ {0,3}\{\{<\s*mermaid(?:\s+[^>]*)?>\}\}[ \t]*\r?$/i;
  const closingPattern = /^ {0,3}\{\{<\s*\/mermaid\s*>\}\}[ \t]*\r?$/i;
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (protectedLines.has(index) || !openingPattern.test(lines[index] ?? ``)) {
      output.push(lines[index] ?? ``);
      index += 1;
      continue;
    }

    let closingIndex = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      // 不跨越已有的字面量块，避免把代码块中的结束标记误当作 shortcode 结束。
      if (protectedLines.has(cursor)) {
        closingIndex = -1;
        break;
      }
      if (closingPattern.test(lines[cursor] ?? ``)) {
        closingIndex = cursor;
        break;
      }
    }

    if (closingIndex < 0) {
      output.push(lines[index] ?? ``);
      index += 1;
      continue;
    }

    const diagram = lines
      .slice(index + 1, closingIndex)
      .map(stripCarriageReturn)
      .join(`\n`)
      .trim();
    output.push(`\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`);
    index = closingIndex + 1;
  }

  return output.join(`\n`);
}

function protectInlineCodeSpans(source: string, protect: (segment: string) => string): string {
  let output = "";
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("`", cursor);
    if (open < 0) {
      output += source.slice(cursor);
      break;
    }
    output += source.slice(cursor, open);
    let markerLength = 1;
    while (source[open + markerLength] === "`") markerLength += 1;
    let close = open + markerLength;
    let closeStart = -1;
    while (close < source.length) {
      const candidate = source.indexOf("`", close);
      if (candidate < 0) break;
      let length = 1;
      while (source[candidate + length] === "`") length += 1;
      if (length === markerLength) {
        closeStart = candidate;
        break;
      }
      close = candidate + length;
    }
    if (closeStart < 0) {
      output += source.slice(open);
      break;
    }
    const end = closeStart + markerLength;
    output += protect(source.slice(open, end));
    cursor = end;
  }
  return output;
}

function renderAlerts(source: string, options: RenderOptions, protectHtml: (html: string) => string): string {
  const lines = source.split(/\r?\n/);
  const protectedLines = getProtectedMarkdownLineIndexes(source);
  const rendered: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (protectedLines.has(index)) {
      rendered.push(lines[index]);
      index += 1;
      continue;
    }
    const marker = lines[index].match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)]\s*$/i);
    if (!marker) {
      rendered.push(lines[index]);
      index += 1;
      continue;
    }

    const kind = marker[1].toLowerCase() as MarkdownAlertKind;
    const body: string[] = [];
    index += 1;
    while (index < lines.length && /^>\s?/.test(lines[index])) {
      body.push(lines[index].replace(/^>\s?/, ""));
      index += 1;
    }

    const preparedBody = prepareMarkdown(body.join("\n"), options);
    const html = getMarkdownRenderer(options.settings).render(preparedBody, options);
    rendered.push(protectHtml(
      `<div class="md-alert md-alert-${kind}">${renderAlertTitle(kind)}${html}</div>`,
    ));
  }

  return rendered.join("\n");
}

function renderAlertTitle(kind: MarkdownAlertKind): string {
  return [
    `<p class="md-alert-title md-alert-text md-alert-text-${kind}">`,
    `<svg class="md-alert-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">`,
    `<path d="${alertIconPaths[kind]}"></path>`,
    "</svg>",
    `<span class="md-alert-text-container">${alertLabels[kind]}</span>`,
    "</p>",
  ].join("");
}

function restoreProtectedHtml(source: string, protectedHtml: string[]): string {
  let next = source;
  let changed = true;

  while (changed) {
    changed = false;
    protectedHtml.forEach((html, index) => {
      const token = `@@MARKO_HTML_${index}@@`;
      if (!next.includes(token)) return;
      next = next.split(token).join(html);
      changed = true;
    });
  }

  return next;
}

function renderToc(outline: OutlineItem[]): string {
  if (outline.length === 0) {
    return `<div class="toc-inline toc-empty">暂无目录</div>`;
  }

  const items = outline
    .map((item) => {
      const level = Math.max(1, Math.min(6, item.level));
      return `<li class="toc-inline-item lv-${level}"><a href="#${escapeAttribute(item.id)}">${escapeHtml(item.title)}</a></li>`;
    })
    .join("");

  return `<nav class="toc-inline"><ul>${items}</ul></nav>`;
}

function renderAbbreviations(
  source: string,
  options: RenderOptions,
  protectHtml: (html: string) => string,
): string {
  const abbreviations = collectMarkdownAbbreviations(options.documentSource ?? source);
  if (abbreviations.length === 0) return source;
  const referenceLabels = collectReferenceDefinitionLabels(options.documentSource ?? source);

  const lines = source.split("\n");
  const rendered: string[] = [];
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (const line of lines) {
    const cleanLine = stripCarriageReturn(line);
    const carriageReturn = cleanLine.length === line.length ? "" : "\r";
    const context = getOutlineLineContext(cleanLine);

    if (activeFence) {
      rendered.push(line);
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      rendered.push(line);
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      rendered.push(line);
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      rendered.push(line);
      continue;
    }

    if (isMarkdownAbbreviationDefinitionLine(context.content)) {
      rendered.push(`${context.prefix}${carriageReturn}`);
      continue;
    }

    if (isMarkdownLinkReferenceDefinitionLine(context.content)) {
      rendered.push(line);
      continue;
    }

    rendered.push(`${context.prefix}${renderAbbreviationsInLine(context.content, abbreviations, protectHtml, referenceLabels)}${carriageReturn}`);
  }

  return rendered.join("\n");
}

function collectReferenceDefinitionLabels(source: string): Set<string> {
  const labels = new Set<string>();
  const lines = source.split(/\r?\n/);
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (const line of lines) {
    const context = getOutlineLineContext(line);

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    if (isIndentedCodeLine(context.content)) continue;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      continue;
    }

    const match = context.content.match(/^[ \t]{0,3}\[([^\]\n]+)]:[ \t]*\S/);
    if (!match || match[1].startsWith("^")) continue;
    labels.add(normalizeReferenceLabel(match[1]));
  }

  return labels;
}

export function collectMarkdownAbbreviationDefinitions(source: string): MarkdownAbbreviationDefinition[] {
  const definitions: MarkdownAbbreviationDefinition[] = [];
  const lines = source.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;
  const frontMatter = getYamlFrontMatterRange(source);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const cleanLine = stripCarriageReturn(rawLine);
    const context = getOutlineLineContext(cleanLine);

    if (frontMatter && lineOffsets[index] < frontMatter.end) continue;

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    if (isIndentedCodeLine(context.content)) continue;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      continue;
    }

    const match = context.content.match(/^[ \t]{0,3}\*\[([^\]\n]+)]:[ \t]*(.+?)\s*$/);
    if (!match) continue;
    const label = match[1].trim();
    const title = match[2].trim();
    if (!label || !title) continue;
    definitions.push({
      label,
      title,
      from: lineOffsets[index],
      to: lineOffsets[index] + rawLine.length,
    });
  }

  return definitions;
}

export function collectMarkdownAbbreviations(
  source: string,
  definitions = collectMarkdownAbbreviationDefinitions(source),
): MarkdownAbbreviation[] {
  const seen = new Map<string, MarkdownAbbreviation>();
  for (const definition of definitions) {
    seen.set(definition.label, { label: definition.label, title: definition.title });
  }

  return Array.from(seen.values()).sort((left, right) => right.label.length - left.label.length);
}

export function getMarkdownAbbreviationMatches(
  source: string,
  abbreviations: readonly MarkdownAbbreviation[],
): MarkdownAbbreviationMatch[] {
  const matches: MarkdownAbbreviationMatch[] = [];

  for (const abbreviation of abbreviations) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(abbreviation.label)})(?=$|[^\\p{L}\\p{N}_])`, "gu");
    for (const match of source.matchAll(pattern)) {
      const lead = match[1] ?? "";
      const start = (match.index ?? 0) + lead.length;
      matches.push({
        label: abbreviation.label,
        title: abbreviation.title,
        start,
        end: start + abbreviation.label.length,
      });
    }
  }

  return matches.sort((left, right) => left.start - right.start || right.end - left.end);
}

function isMarkdownAbbreviationDefinitionLine(line: string): boolean {
  return /^[ \t]{0,3}\*\[[^\]\n]+]:[ \t]*\S/.test(line);
}

function isMarkdownLinkReferenceDefinitionLine(line: string): boolean {
  return /^[ \t]{0,3}\[[^\]\n]+]:[ \t]*\S/.test(line)
    && !/^[ \t]{0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:/.test(line);
}

function renderAbbreviationsInLine(
  line: string,
  abbreviations: MarkdownAbbreviation[],
  protectHtml: (html: string) => string,
  referenceLabels: Set<string>,
): string {
  const protectedLine = protectInlineAbbreviationSkips(line, referenceLabels);
  let next = protectedLine.value;

  for (const abbreviation of abbreviations) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(abbreviation.label)})(?=$|[^\\p{L}\\p{N}_])`, "gu");
    next = next.replace(pattern, (_match, lead: string, label: string) => (
      `${lead}${protectHtml(`<abbr title="${escapeAttribute(abbreviation.title)}">${escapeHtml(label)}</abbr>`)}`
    ));
  }

  return restoreProtectedInlineAbbreviationSkips(next, protectedLine.segments);
}

function protectInlineAbbreviationSkips(value: string, referenceLabels: Set<string>): { value: string; segments: string[] } {
  const segments: string[] = [];
  const protect = (segment: string) => {
    const token = `@@MARKO_ABBR_SKIP_${segments.length}@@`;
    segments.push(segment);
    return token;
  };

  const inlineProtected = value
      .replace(/(`+)([^`\n]|`(?!`))*?\1/g, (match) => protect(match))
      .replace(/<[^>\n]+>/g, (match) => protect(match));
  const shortcutProtected = protectShortcutReferenceLinks(inlineProtected, protect, referenceLabels);

  return {
    value: protectMarkdownLinkTargets(shortcutProtected, protect, referenceLabels),
    segments,
  };
}

function protectMarkdownLinkTargets(
  value: string,
  protect: (segment: string) => string,
  referenceLabels: Set<string>,
): string {
  return replaceMarkdownLinkSyntax(value, (link) => {
    if (link.imageStart !== null) {
      return protect(value.slice(link.imageStart, link.end));
    }

    const label = value.slice(link.start, link.labelEnd + 1);
    const rawTarget = value.slice(link.labelEnd + 1, link.end);
    const target = rawTarget === "[]" && referenceLabels.has(normalizeReferenceLabel(link.label))
      ? `[${link.label}]`
      : rawTarget;
    return `${label}${protect(target)}`;
  });
}

function protectShortcutReferenceLinks(
  value: string,
  protect: (segment: string) => string,
  referenceLabels: Set<string>,
): string {
  let result = "";
  let cursor = 0;

  while (cursor < value.length) {
    const open = value.indexOf("[", cursor);
    if (open < 0) {
      result += value.slice(cursor);
      break;
    }

    const close = findReferenceLabelEnd(value, open + 1);
    if (close < 0) {
      result += value.slice(cursor);
      break;
    }

    const next = value[close + 1];
    const label = value.slice(open + 1, close);
    const imageStart = value[open - 1] === "!" ? open - 1 : null;
    const normalized = normalizeReferenceLabel(label);
    if ((next === "(" || next === "[") || !referenceLabels.has(normalized)) {
      result += value.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    const start = imageStart ?? open;
    result += value.slice(cursor, start);
    if (imageStart !== null) {
      result += protect(value.slice(imageStart, close + 1));
    } else {
      result += `${value.slice(open, close + 1)}${protect(`[${label}]`)}`;
    }
    cursor = close + 1;
  }

  return result;
}

function restoreProtectedInlineAbbreviationSkips(value: string, segments: string[]): string {
  return value.replace(/@@MARKO_ABBR_SKIP_(\d+)@@/g, (match, index: string) => segments[Number(index)] ?? match);
}

function renderDefinitionLists(
  source: string,
  options: RenderOptions,
  protectHtml: (html: string) => string,
): string {
  const lines = source.split("\n");
  const rendered: string[] = [];
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;
  let index = 0;

  while (index < lines.length) {
    const cleanLine = stripCarriageReturn(lines[index]);
    const carriageReturn = cleanLine.length === lines[index].length ? "" : "\r";
    const context = getOutlineLineContext(cleanLine);

    if (activeFence) {
      rendered.push(lines[index]);
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      index += 1;
      continue;
    }

    if (activeHtmlBlock) {
      rendered.push(lines[index]);
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      index += 1;
      continue;
    }

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      rendered.push(lines[index]);
      index += 1;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      rendered.push(lines[index]);
      index += 1;
      continue;
    }

    const definitionList = readDefinitionList(lines, index);
    if (!definitionList) {
      rendered.push(lines[index]);
      index += 1;
      continue;
    }

    const html = renderDefinitionListHtml(definitionList.entries, options);
    const prefixedHtml = definitionList.prefix ? html.replace(/\n/g, `\n${definitionList.prefix}`) : html;
    rendered.push(`${definitionList.prefix}${protectHtml(prefixedHtml)}${carriageReturn}`);
    index = definitionList.nextIndex;
  }

  return rendered.join("\n");
}

function readDefinitionList(
  lines: string[],
  startIndex: number,
): { entries: DefinitionListEntry[]; nextIndex: number; prefix: string } | null {
  const firstContext = getDefinitionLineContext(lines[startIndex] ?? "");
  const quoteKey = firstContext.quoteKey;
  const prefix = firstContext.prefix;
  const entries: DefinitionListEntry[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const termStart = index;
    const terms: string[] = [];

    while (index < lines.length && isDefinitionTermLine(lines[index], quoteKey)) {
      terms.push(getDefinitionLineContext(lines[index]).content.trim());
      index += 1;
      if (index >= lines.length || isDefinitionMarkerLine(lines[index], quoteKey)) break;
    }

    if (terms.length === 0 || !isDefinitionMarkerLine(lines[index] ?? "", quoteKey)) {
      return entries.length > 0 ? { entries, nextIndex: termStart, prefix } : null;
    }

    const definitions: DefinitionListDefinition[] = [];
    while (index < lines.length) {
      const marker = readDefinitionMarkerFromLine(lines[index], quoteKey);
      if (!marker) break;
      const definitionLines = [marker.content.trim()];
      let loose = false;
      index += 1;

      while (index < lines.length) {
        const continuation = getDefinitionLineContext(lines[index]);
        if (continuation.quoteKey !== quoteKey) break;
        if (!continuation.content.trim()) {
          if (!hasFollowingDefinitionBlockContinuationLine(lines, index + 1, quoteKey)) break;
          definitionLines.push("");
          loose = true;
          index += 1;
          continue;
        }
        if (isDefinitionMarkerLine(lines[index], quoteKey)) break;
        if (isDefinitionEntryStart(lines, index, quoteKey)) break;
        if (!isDefinitionContinuationLine(lines[index], quoteKey)) break;
        definitionLines.push(stripDefinitionContinuationIndent(lines[index], quoteKey));
        index += 1;
      }

      definitions.push({ lines: definitionLines, loose });
    }

    entries.push({ terms, definitions });

    if (!isDefinitionEntryStart(lines, index, quoteKey)) {
      break;
    }
  }

  return entries.length > 0 ? { entries, nextIndex: index, prefix } : null;
}

function getDefinitionLineContext(line: string): OutlineLineContext {
  return getOutlineLineContext(stripCarriageReturn(line));
}

function isDefinitionEntryStart(lines: string[], index: number, quoteKey: string): boolean {
  if (!isDefinitionTermLine(lines[index] ?? "", quoteKey)) return false;
  let cursor = index;
  while (cursor < lines.length && isDefinitionTermLine(lines[cursor], quoteKey)) {
    cursor += 1;
  }
  return isDefinitionMarkerLine(lines[cursor] ?? "", quoteKey);
}

function isDefinitionTermLine(line: string, quoteKey: string): boolean {
  const context = getDefinitionLineContext(line);
  if (context.quoteKey !== quoteKey) return false;
  if (!context.trimmed) return false;
  if (isIndentedCodeLine(context.content)) return false;
  if (readDefinitionMarker(context.content)) return false;
  if (getOutlineFenceOpen(context.content)) return false;
  if (getOutlineHtmlBlockOpen(context.content, context.quoteKey)) return false;
  if (/^[ \t]{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|(?:-{3,}|\+{3,}|\*{3,}|_{3,})\s*$|\[[^\]\n]+]:\s*\S|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|\|)/.test(context.content)) {
    return false;
  }
  return true;
}

function isDefinitionMarkerLine(line: string, quoteKey: string): boolean {
  return readDefinitionMarkerFromLine(line, quoteKey) !== null;
}

function readDefinitionMarkerFromLine(line: string, quoteKey: string): { content: string } | null {
  const context = getDefinitionLineContext(line);
  if (context.quoteKey !== quoteKey) return null;
  return readDefinitionMarker(context.content);
}

function readDefinitionMarker(line: string): { content: string } | null {
  const match = line.match(/^[ \t]{0,3}:(?:[ \t]+(.*)|$)/);
  return match ? { content: match[1] ?? "" } : null;
}

function isDefinitionContinuationLine(line: string, quoteKey: string): boolean {
  const context = getDefinitionLineContext(line);
  return context.quoteKey === quoteKey && /^(?:[ \t]{2,}|\t)/.test(context.content);
}

function hasFollowingDefinitionBlockContinuationLine(lines: string[], startIndex: number, quoteKey: string): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getDefinitionLineContext(lines[index]);
    if (context.quoteKey !== quoteKey) return false;
    if (!context.content.trim()) continue;
    return isDefinitionBlockContinuationLine(lines[index], quoteKey);
  }
  return false;
}

function isDefinitionBlockContinuationLine(line: string, quoteKey: string): boolean {
  const context = getDefinitionLineContext(line);
  return context.quoteKey === quoteKey && /^(?:[ \t]{4,}|\t)/.test(context.content);
}

function stripDefinitionContinuationIndent(line: string, quoteKey: string): string {
  const context = getDefinitionLineContext(line);
  if (context.quoteKey !== quoteKey) return "";
  return context.content.replace(/^(?: {2,4}|\t)/, "").trimEnd();
}

function renderDefinitionListHtml(entries: DefinitionListEntry[], options: RenderOptions): string {
  const items = entries.flatMap((entry) => [
    ...entry.terms.map((term) => `<dt>${renderDefinitionInlineMarkdown(term, options)}</dt>`),
    ...entry.definitions.map((definition) => `<dd>${renderDefinitionMarkdown(definition, options)}</dd>`),
  ]);
  return `<dl class="definition-list">${items.join("")}</dl>`;
}

function renderDefinitionMarkdown(definition: DefinitionListDefinition, options: RenderOptions): string {
  const source = definition.loose
    ? definition.lines.join("\n").trim()
    : definition.lines.join(" ").trim();
  if (!definition.loose && !isDefinitionBlockMarkdown(source)) {
    return renderDefinitionInlineMarkdown(source, options);
  }

  const prepared = options.settings.extensions.html ? source : escapeDisabledRawHtml(source);
  return getMarkdownRenderer(options.settings).render(prepared, options).trim();
}

function renderDefinitionInlineMarkdown(value: string, options: RenderOptions): string {
  const source = options.settings.extensions.html ? value : escapeDisabledRawHtml(value);
  return getMarkdownRenderer(options.settings).renderInline(source, options);
}

function isDefinitionBlockMarkdown(value: string): boolean {
  return value.split(/\r?\n/).some((line) => Boolean(readDollarMathBlockOpening(line)))
    || /(^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s+|\d+[.)]\s+|>\s?|`{3,}|~{3,}|\\\[\s*$|(?:-{3,}|\+{3,}|\*{3,}|_{3,})\s*$|\|)/.test(value);
}

function renderDiagramBlock(className: string, title: string, diagramHtml: string, source: string): string {
  const sourceCode = escapeHtml(source.trimEnd());
  const rows = Math.min(18, Math.max(5, sourceCode.split("\n").length + 1));
  return [
    `<div class="diagram-box ${className}">`,
    diagramHtml,
    `<div class="diagram-source-panel" aria-label="${escapeAttribute(title)} 底层数据">`,
    `<div class="diagram-source-title">${escapeHtml(title)} 底层数据</div>`,
    `<textarea class="diagram-source-editor" spellcheck="false" rows="${rows}">${sourceCode}</textarea>`,
    "</div>",
    "</div>\n",
  ].join("");
}

function splitFrontMatter(source: string): { frontMatter: string; body: string } {
  const range = getYamlFrontMatterRange(source);
  if (!range) {
    return { frontMatter: "", body: source };
  }

  return {
    frontMatter: source.slice(0, range.end),
    body: source.slice(range.end),
  };
}

function getFrontMatterContent(frontMatter: string): string {
  const range = getYamlFrontMatterRange(frontMatter);
  if (!range) return frontMatter;
  return frontMatter
    .slice(range.contentStart, range.contentEnd)
    .replace(/\r?\n$/, "");
}

function getTyporaRootUrl(source: string): string {
  const { frontMatter } = splitFrontMatter(source);
  if (!frontMatter) return "";
  for (const line of frontMatter.split(/\r?\n/).slice(1, -1)) {
    const match = line.match(/^\s*typora-root-url\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    return parseFrontMatterScalar(match[1] ?? "");
  }
  return "";
}

function parseFrontMatterScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}

function normalizeContainedDefinitionsForRender(source: string, includeFootnotes: boolean): string {
  const lineBreak = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const protectedLines = getProtectedMarkdownLineIndexes(source);
  const definitions: string[] = [];
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (protectedLines.has(index)) continue;

    const definition = normalizeContainedDefinitionStart(lines[index] ?? "");
    if (definition.quoteKey === "plain" && definition.containerIndent === 0) {
      continue;
    }

    const footnote = includeFootnotes
      ? definition.content.match(/^[ \t]{0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:/)
      : null;
    const reference = definition.content.match(/^[ \t]{0,3}\[([^\]\n]+)]:[ \t]*\S/);
    if (!footnote && (!reference || reference[1].startsWith("^"))) continue;

    const collected = [definition.content];
    lines[index] = "";
    changed = true;

    if (footnote) {
      let requiresIndentedContinuation = false;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (protectedLines.has(cursor)) break;
        const continuation = normalizeContainedDefinitionContinuation(lines[cursor] ?? "", definition);
        if (continuation === null) break;

        if (!continuation.trim()) {
          if (hasFollowingContainedFootnoteContinuation(lines, cursor + 1, definition)) {
            collected.push(continuation);
            lines[cursor] = "";
            requiresIndentedContinuation = true;
            continue;
          }
          break;
        }

        if (isFootnoteIndentedContinuationLine(continuation)) {
          collected.push(continuation);
          lines[cursor] = "";
          requiresIndentedContinuation = false;
          continue;
        }

        if (!requiresIndentedContinuation && isFootnoteParagraphContinuationLine(continuation)) {
          collected.push(continuation);
          lines[cursor] = "";
          continue;
        }

        break;
      }
    } else {
      const titleIndex = index + 1;
      if (!protectedLines.has(titleIndex)) {
        const continuation = normalizeContainedDefinitionContinuation(lines[titleIndex] ?? "", definition);
        if (continuation !== null && isReferenceTitleContinuationLine(continuation)) {
          collected.push(continuation);
          lines[titleIndex] = "";
        }
      }
    }

    definitions.push(collected.join(lineBreak).trimEnd());
  }

  if (!changed) return source;
  const body = lines.join(lineBreak).trimEnd();
  const normalizedDefinitions = definitions
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  return [body, normalizedDefinitions.join(lineBreak + lineBreak)]
    .filter(Boolean)
    .join(lineBreak + lineBreak);
}

function appendReferencedFootnotes(source: string, documentSource: string): string {
  const seen = new Set<string>();
  const ids = Array.from(source.matchAll(/\[\^([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)]/g))
    .map((match) => match[1])
    .filter((value) => {
      const canonicalId = normalizeFootnoteLookupLabel(value);
      if (seen.has(canonicalId)) return false;
      seen.add(canonicalId);
      return true;
    });

  if (ids.length === 0) {
    return source;
  }

  const definitions = ids
    .filter((id) => !hasFootnoteDefinition(source, id))
    .map((id) => findFootnoteDefinition(documentSource, id))
    .filter(Boolean);

  if (definitions.length === 0) {
    return source;
  }

  return `${source.trimEnd()}\n\n${definitions.join("\n\n")}`;
}

function appendReferencedLinkDefinitions(source: string, documentSource: string): string {
  const labels = collectReferenceLinkLabels(source)
    .filter((label, index, values) => values.indexOf(label) === index)
    .filter((label) => !hasReferenceDefinition(source, label));

  if (labels.length === 0) {
    return source;
  }

  const definitions = labels
    .map((label) => findReferenceDefinition(documentSource, label))
    .filter(Boolean);

  if (definitions.length === 0) {
    return source;
  }

  return `${source.trimEnd()}\n\n${definitions.join("\n\n")}`;
}

function collectReferenceLinkLabels(source: string): string[] {
  const labels: string[] = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "[" || isEscapedAt(source, index)) continue;

    const closeLabel = findReferenceLabelEnd(source, index + 1);
    if (closeLabel < 0) continue;

    const label = source.slice(index + 1, closeLabel);
    if (!isReferenceLinkLabel(label)) {
      index = closeLabel;
      continue;
    }

    const next = source[closeLabel + 1];
    if (next === "(") {
      index = closeLabel;
      continue;
    }

    if (next === "[") {
      const closeReference = findReferenceLabelEnd(source, closeLabel + 2);
      if (closeReference < 0) {
        index = closeLabel;
        continue;
      }

      const referenceLabel = source.slice(closeLabel + 2, closeReference);
      if (referenceLabel.trim()) {
        labels.push(normalizeReferenceLabel(referenceLabel));
      } else {
        labels.push(normalizeReferenceLabel(label));
      }
      index = closeReference;
      continue;
    }

    labels.push(normalizeReferenceLabel(label));
    index = closeLabel;
  }

  return labels;
}

function findReferenceDefinition(source: string, label: string): string {
  const normalizedLabel = normalizeReferenceLabel(label);
  const lines = source.split(/\r?\n/);
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const context = getOutlineLineContext(lines[index]);

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    if (isIndentedCodeLine(context.content)) continue;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      continue;
    }

    const definition = normalizeContainedDefinitionStart(lines[index]);
    const match = definition.content.match(/^[ \t]{0,3}\[([^\]\n]+)]:[ \t]*\S/);
    if (!match || match[1].startsWith("^")) continue;
    if (normalizeReferenceLabel(match[1]) !== normalizedLabel) continue;

    const collected = [definition.content];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const continuation = normalizeContainedDefinitionContinuation(lines[cursor], definition);
      if (cursor === index + 1 && continuation !== null && isReferenceTitleContinuationLine(continuation)) {
        collected.push(continuation);
        continue;
      }
      break;
    }
    return collected.join("\n").trimEnd();
  }

  return "";
}

function isReferenceTitleContinuationLine(line: string): boolean {
  return /^[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$/.test(line);
}

function hasReferenceDefinition(source: string, label: string): boolean {
  return Boolean(findReferenceDefinition(source, label));
}

function isReferenceLinkLabel(label: string): boolean {
  const trimmed = label.trim();
  return Boolean(trimmed) && !trimmed.startsWith("^");
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function findReferenceLabelEnd(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (isEscapedAt(source, index)) continue;
    if (source[index] === "[") {
      depth += 1;
      continue;
    }
    if (source[index] === "]") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function findFootnoteDefinition(source: string, id: string): string {
  const lines = source.split(/\r?\n/);
  const start = findFootnoteDefinitionLineIndex(lines, normalizeFootnoteLookupLabel(id));
  if (start < 0) return "";

  const definition = normalizeContainedDefinitionStart(lines[start]);
  const collected = [definition.content];
  let requiresIndentedContinuation = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = normalizeContainedDefinitionContinuation(lines[index], definition);
    if (line === null) break;
    if (!line.trim()) {
      if (hasFollowingContainedFootnoteContinuation(lines, index + 1, definition)) {
        collected.push(line);
        requiresIndentedContinuation = true;
        continue;
      }
      break;
    }

    if (isFootnoteIndentedContinuationLine(line)) {
      collected.push(line);
      requiresIndentedContinuation = false;
      continue;
    }

    if (!requiresIndentedContinuation && isFootnoteParagraphContinuationLine(line)) {
      collected.push(line);
      continue;
    }

    break;
  }

  return collected.join("\n").trimEnd();
}

export function getMarkdownFootnoteSummary(source: string, id: string): string {
  const definition = findFootnoteDefinition(source, id);
  if (!definition) return "";
  const lines = definition.split(/\r?\n/);
  const firstLine = getDefinitionLineContext(lines.shift() ?? "").content;
  const first = firstLine.replace(/^\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/, "");
  const content = [first, ...lines.map((line) => (
    getDefinitionLineContext(line).content.replace(/^(?: {1,4}|\t)/, "")
  ))]
    .join(" ");
  return summarizeMarkdownFootnoteContent(content);
}

function summarizeMarkdownFootnoteContent(content: string): string {
  return stripInlineMarkdown(content.replace(/\s+/g, " ")).trim();
}

function hasFootnoteDefinition(source: string, id: string): boolean {
  return Boolean(findFootnoteDefinition(source, id));
}

export function hasMarkdownFootnoteDefinition(source: string, id: string): boolean {
  return hasFootnoteDefinition(source, id);
}

function findFootnoteDefinitionLineIndex(lines: string[], canonicalId: string): number {
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const context = getOutlineLineContext(lines[index]);

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    if (isIndentedCodeLine(context.content)) continue;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      continue;
    }

    const definition = normalizeContainedDefinitionStart(lines[index]).content.match(
      /^[ \t]{0,3}\[\^([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)]:/,
    );
    if (definition && normalizeFootnoteLookupLabel(definition[1]) === canonicalId) return index;
  }

  return -1;
}

function normalizeFootnoteLookupLabel(id: string): string {
  return id.trim().toLowerCase();
}

interface ContainedDefinitionStart {
  content: string;
  quoteKey: string;
  containerIndent: number;
}

function normalizeContainedDefinitionStart(line: string): ContainedDefinitionStart {
  const context = getDefinitionLineContext(line);
  let content = context.content;
  let containerIndent = 0;
  const prefixes: string[] = [];

  for (let depth = 0; depth < 16; depth += 1) {
    const marker = content.match(/^([ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]{1,4})(.*)$/);
    if (!marker) break;
    prefixes.push(marker[1]);
    content = marker[2];
  }

  if (!/^[ \t]{0,3}(?:\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]|\[(?!\^)[^\]\n]+]):/.test(content)) {
    return { content: context.content, quoteKey: context.quoteKey, containerIndent: 0 };
  }
  containerIndent = prefixes.reduce((width, prefix) => width + getIndentWidth(prefix), 0);
  return { content, quoteKey: context.quoteKey, containerIndent };
}

function normalizeContainedDefinitionContinuation(
  line: string,
  definition: ContainedDefinitionStart,
): string | null {
  const context = getDefinitionLineContext(line);
  if (context.quoteKey !== definition.quoteKey) return null;
  return removeIndentWidth(context.content, definition.containerIndent);
}

function hasFollowingContainedFootnoteContinuation(
  lines: string[],
  startIndex: number,
  definition: ContainedDefinitionStart,
): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const content = normalizeContainedDefinitionContinuation(lines[index], definition);
    if (content === null) return false;
    if (!content.trim()) continue;
    return /^(?: {4,}|\t)/.test(content);
  }
  return false;
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

function getIndentWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    width += character === "\t" ? 4 - (width % 4) : 1;
  }
  return width;
}

function isFootnoteDefinitionBlock(source: string): boolean {
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const firstContent = lines.findIndex((line) => getDefinitionLineContext(line).content.trim());
  const firstContext = getDefinitionLineContext(lines[firstContent] ?? "");
  if (firstContent < 0 || !/^\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:/.test(firstContext.content)) {
    return false;
  }

  const definitionQuoteKey = firstContext.quoteKey;
  let requiresIndentedContinuation = false;
  for (let index = firstContent + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const context = getDefinitionLineContext(line);
    if (!context.content.trim()) {
      if (hasFollowingFootnoteIndentedContinuationLine(lines, index + 1, definitionQuoteKey)) {
        requiresIndentedContinuation = true;
        continue;
      }
      return lines.slice(index + 1).every((rest) => !getDefinitionLineContext(rest).content.trim());
    }

    if (isFootnoteIndentedContinuationLine(line, definitionQuoteKey)) {
      requiresIndentedContinuation = false;
      continue;
    }

    if (!requiresIndentedContinuation && isFootnoteParagraphContinuationLine(line, definitionQuoteKey)) {
      continue;
    }

    return false;
  }

  return true;
}

function hasFollowingFootnoteIndentedContinuationLine(lines: string[], startIndex: number, quoteKey?: string): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!getDefinitionLineContext(lines[index]).content.trim()) continue;
    return isFootnoteIndentedContinuationLine(lines[index], quoteKey);
  }
  return false;
}

function isFootnoteIndentedContinuationLine(line: string, quoteKey?: string): boolean {
  const context = getDefinitionLineContext(line);
  if (quoteKey && context.quoteKey !== quoteKey) return false;
  return /^(?: {4,}|\t)/.test(context.content);
}

function isFootnoteParagraphContinuationLine(line: string, quoteKey?: string): boolean {
  const context = getDefinitionLineContext(line);
  if (!context.content.trim() || (quoteKey && context.quoteKey !== quoteKey)) return false;
  if (isFootnoteIndentedContinuationLine(line, quoteKey)) return true;
  return !isFootnoteInterruptingBlockLine(context.content.replace(/^ {0,3}/, ""));
}

function isFootnoteInterruptingBlockLine(content: string): boolean {
  return Boolean(readDollarMathBlockOpening(content))
    || /^(?:#{1,6}\s|(?:[-*+]|\d+[.)])\s+|>\s?|`{3,}|~{3,}|\\\[\s*$|(?:-{3,}|\+{3,}|\*{3,}|_{3,})\s*$|\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:|\[[^\]\n]+]:\s*\S|<!--|<\/?[A-Za-z][^>\n]*>)/.test(content);
}

type MarkdownAssetKind = "image" | "media";

function resolveAssetSource(
  source: string,
  options: RenderOptions,
  kind: MarkdownAssetKind = "image",
): string {
  const normalized = applyTyporaRootUrl(source.trim(), options.typoraRootUrl);
  if (!isSafeAssetSource(normalized, kind)) {
    return "";
  }

  if (isPassthroughAssetSource(normalized)) {
    return normalized;
  }

  const resolved = resolvePathLike(normalized, options.basePath);
  return options.assetResolver?.(resolved) ?? resolved;
}

function applyTyporaRootUrl(source: string, rootUrl?: string): string {
  if (!rootUrl || !source.startsWith("/") || source.startsWith("//")) return source;
  return `${rootUrl.replace(/[\\/]+$/, "")}/${source.replace(/^\/+/, "")}`;
}

function isSafeAssetSource(source: string, kind: MarkdownAssetKind): boolean {
  if (!source) return false;
  if (/^data:/i.test(source)) {
    return kind === "image"
      ? /^data:image\/(?:gif|png|jpeg|webp);/i.test(source)
      : /^data:(?:audio|video)\//i.test(source);
  }
  return getPreviewLinkAction(source) !== "blocked";
}

function isPassthroughAssetSource(source: string): boolean {
  if (/^data:/i.test(source)) return true;
  if (/^(https?:|blob:|#|file:)/i.test(source) || source.startsWith("//")) return true;
  return !isWindowsAbsolutePath(source) && /^[a-z][a-z0-9+.-]*:/i.test(source);
}

function resolveRawHtmlAssetSources(html: string, options: RenderOptions): string {
  return html.replace(/<(img|video|audio|source|track)\b[^>]*>/gi, (tag, rawName: string) => {
    const name = rawName.toLowerCase();
    if (name === "img") return resolveRawHtmlAssetAttribute(tag, "src", options, "image");
    if (name === "source" || name === "audio" || name === "track") {
      return resolveRawHtmlAssetAttribute(tag, "src", options, "media");
    }
    return resolveRawHtmlAssetAttribute(
      resolveRawHtmlAssetAttribute(tag, "src", options, "media"),
      "poster",
      options,
      "image",
    );
  });
}

function resolveRawHtmlAssetAttribute(
  tag: string,
  name: string,
  options: RenderOptions,
  kind: MarkdownAssetKind,
): string {
  const pattern = new RegExp(
    `(\\s${escapeRegExp(name)}\\s*=\\s*)(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`,
    "i",
  );
  return tag.replace(pattern, (
    _match,
    prefix: string,
    doubleQuoted: string | undefined,
    singleQuoted: string | undefined,
    bare: string | undefined,
  ) => {
    const source = decodeHtmlAttribute(doubleQuoted ?? singleQuoted ?? bare ?? "");
    const quote = singleQuoted === undefined ? "\"" : "'";
    return `${prefix}${quote}${escapeAttribute(resolveAssetSource(source, options, kind))}${quote}`;
  });
}

function resolveRawHtmlLinks(html: string): string {
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = getHtmlAttributeValue(tag, "href");
    if (getPreviewLinkAction(href) !== "external") {
      return tag;
    }

    return setHtmlAttribute(
      setHtmlAttribute(tag, "target", "_blank"),
      "rel",
      "noopener noreferrer",
    );
  });
}

function getHtmlAttributeValue(tag: string, name: string): string | null {
  const attributeValuePattern = "(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>`]+))";
  const pattern = new RegExp(
    `\\s${escapeRegExp(name)}\\s*=\\s*${attributeValuePattern}`,
    "i",
  );
  const match = tag.match(pattern);
  if (!match) return null;
  return decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "");
}

function setHtmlAttribute(tag: string, name: string, value: string): string {
  const escapedName = escapeRegExp(name);
  const attributeValuePattern = "(?:\"[^\"]*\"|'[^']*'|[^\\s\"'=<>`]+)";
  const pattern = new RegExp(
    `(\\s${escapedName}\\s*=\\s*)${attributeValuePattern}`,
    "i",
  );
  const replacement = `$1"${escapeAttribute(value)}"`;
  if (pattern.test(tag)) {
    return tag.replace(pattern, replacement);
  }

  const closing = tag.match(/\s*\/?>$/)?.[0] ?? ">";
  return `${tag.slice(0, tag.length - closing.length)} ${name}="${escapeAttribute(value)}"${closing}`;
}

function resolvePathLike(source: string, basePath?: string): string {
  const normalizedSource = normalizePathSeparators(source);
  if (!basePath || isAbsolutePath(normalizedSource)) {
    return normalizedSource;
  }

  const normalizedBase = basePath.replace(/\\/g, "/");
  const rootPrefix = normalizedBase.startsWith("//")
    ? "//"
    : normalizedBase.startsWith("/")
      ? "/"
      : "";
  const baseDir = normalizedBase.includes("/")
    ? normalizedBase.slice(0, normalizedBase.lastIndexOf("/"))
    : "";
  const stack = `${baseDir}/${normalizedSource}`.split("/");
  const result: string[] = [];

  for (const part of stack) {
    if (!part || part === ".") continue;
    if (part === "..") {
      result.pop();
      continue;
    }
    result.push(part);
  }

  if (/^[A-Za-z]:$/.test(result[0])) {
    return `${result[0]}/${result.slice(1).join("/")}`;
  }

  return `${rootPrefix}${result.join("/")}`;
}

function isAbsolutePath(source: string): boolean {
  return isWindowsAbsolutePath(source) || source.startsWith("/") || /^\\\\[^\\]/.test(source);
}

function isWindowsAbsolutePath(source: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(source) || /^[A-Za-z]:%5[cC]/.test(source);
}

function normalizePathSeparators(source: string): string {
  return decodePathLikeSource(source).replace(/%5[cC]/g, "/").replace(/\\/g, "/");
}

function decodePathLikeSource(source: string): string {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}

function getFenceLanguage(info: string): string {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function isSetextHeadingText(value: string): boolean {
  return Boolean(value)
    && !/^(?:=+|-+)$/.test(value)
    && !/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|\|)/.test(value)
    && !/^\[[^\]]+]:/.test(value);
}

function stripInlineMarkdown(value: string, definedFootnoteLabels?: ReadonlySet<string>): string {
  const escaped = protectMarkdownEscapes(value);
  const stripped = replaceMarkdownLinkSyntax(escaped.value, (link) => link.label)
    .replace(/(`+)([\s\S]*?)\1/g, (_match, _marker: string, content: string) => stripCodeSpanPadding(content))
    .replace(/<([^<>\s]+)>/g, (_match, href: string) => (
      isRenderedAutolink(href) ? href : ""
    ))
    .replace(/<[^>\n]+>/g, "")
    .replace(/(\*\*|__)([\s\S]*?)\1/g, "$2")
    .replace(/(\*|_)([^*_]+?)\1/g, "$2")
    .replace(/~~([\s\S]*?)~~/g, "$1")
    .replace(/==([\s\S]*?)==/g, "$1")
    .replace(/\^([^^]+)\^/g, "$1")
    .replace(/~([^~]+)~/g, "$1")
    .replace(/\[\^([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)]/g, (match, label: string) => (
      definedFootnoteLabels?.has(label) ? String() : match
    ))
    .trim();
  return restoreMarkdownEscapes(markdownEntityUtils.unescapeAll(stripped), escaped.segments);
}

function collectDefinedFootnoteLabels(source: string): ReadonlySet<string> {
  const labels = new Set<string>();
  for (const match of source.matchAll(/\[\^([^\]\r\n]*[^\]\s\r\n][^\]\r\n]*)]/g)) {
    const label = match[1];
    if (label && hasFootnoteDefinition(source, label)) {
      labels.add(label);
    }
  }
  return labels;
}

function getMarkdownHeadingText(tokens: any[]): string {
  return tokens.map((token) => {
    switch (token.type) {
      case 'text':
      case 'text_special':
      case 'code_inline':
        return token.content ?? '';
      case 'image':
        return getMarkdownHeadingText(token.children ?? []);
      case 'softbreak':
      case 'hardbreak':
        return ' ';
      case 'footnote_ref':
        return '';
      default:
        return '';
    }
  }).join('');
}

function stripCodeSpanPadding(content: string): string {
  if (content.startsWith(" ") && content.endsWith(" ") && content.trim()) {
    return content.slice(1, -1);
  }
  return content;
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

function isRenderedAutolink(href: string): boolean {
  const action = getPreviewLinkAction(href);
  return action === "external" || action === "local";
}

function stripAtxClosingMarker(value: string): string {
  return value.replace(/\s+#+\s*$/, "").trim();
}

function slugifyHeading(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=[\]{}\\|;:'",.<>/?]/g, "")
    .replace(/\s+/g, "-");
  return slug || "heading";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeDisabledRawHtml(value: string): string {
  const lines = value.split("\n");
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  return lines
    .map((line) => {
      const cleanLine = stripCarriageReturn(line);
      const carriageReturn = cleanLine.length === line.length ? "" : "\r";
      const context = getOutlineLineContext(cleanLine);

      if (activeHtmlBlock && context.quoteKey !== activeHtmlBlock.quoteKey) {
        activeHtmlBlock = null;
      }

      if (activeHtmlBlock) {
        const escaped = `${context.prefix}${escapeDisabledRawHtmlBlockContent(context.content)}${carriageReturn}`;
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
        return escaped;
      }

      const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
      if (!htmlBlock) {
        return `${escapeDisabledRawHtmlInlineContent(cleanLine)}${carriageReturn}`;
      }

      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      return `${context.prefix}${escapeDisabledRawHtmlBlockContent(context.content)}${carriageReturn}`;
    })
    .join("\n");
}

function escapeDisabledRawHtmlInlineContent(value: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf("<", cursor);
    if (start < 0) {
      result += escapeHtml(value.slice(cursor));
      break;
    }

    result += escapeHtml(value.slice(cursor, start));
    const end = findRawHtmlMarkupEnd(value, start);
    if (end < 0) {
      result += "&lt;";
      cursor = start + 1;
      continue;
    }

    result += escapeDisabledRawHtmlBlockContent(value.slice(start, end));
    cursor = end;
  }

  return result;
}

function escapeDisabledRawHtmlBlockContent(value: string): string {
  return restoreDisabledMarkdownSyntaxTokens(
    escapeHtml(maskDisabledMarkdownSyntax(value)),
  );
}

function maskDisabledMarkdownSyntax(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+\-.!|$~=^:>@]/g, (char) => (
    `@@MARKO_MD_${char.charCodeAt(0)}@@`
  ));
}

function restoreDisabledMarkdownSyntaxTokens(value: string): string {
  return value.replace(/@@MARKO_MD_(\d+)@@/g, (_match, code: string) => `&#${code};`);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, "&#10;");
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

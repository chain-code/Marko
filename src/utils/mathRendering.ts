import { mathjax } from "@mathjax/src/cjs/mathjax.js";
import { liteAdaptor } from "@mathjax/src/cjs/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/cjs/handlers/html.js";
import { TeX } from "@mathjax/src/cjs/input/tex.js";
import "@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/cjs/input/tex/configmacros/ConfigMacrosConfiguration.js";
import "@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/cjs/input/tex/noerrors/NoErrorsConfiguration.js";
import "@mathjax/src/cjs/input/tex/noundefined/NoUndefinedConfiguration.js";
import "@mathjax/src/cjs/input/tex/textmacros/TextMacrosConfiguration.js";
import { SVG } from "@mathjax/src/cjs/output/svg.js";
import { collectInlineMathSyntax } from "./inlineSyntax";
import {
  isDollarMathBlockClosing,
  readDollarMathBlockOpening,
} from "./mathSyntax";
import { getYamlFrontMatterRange } from "./frontMatterSyntax";
import {
  getLeadingMarkdownIndent,
  getMarkdownIndentWidth,
  isMarkdownCodeIndented,
  readMarkdownBlockquotePrefix,
  stripMarkdownIndentColumns,
  stripMarkdownListContainerMarkers,
} from "./markdownIndent";
import type { MathAutoNumbering } from "../types";

export interface MathRenderFragment {
  formula: string;
  display: boolean;
}

interface MathDocumentItem extends MathRenderFragment {
  from: number;
  to: number;
}

interface MathDocumentContext {
  items: MathDocumentItem[];
  html: string[];
}

interface MathBatchRenderResult {
  html: string[];
  beforeCounters: number[];
  allLabels: Record<string, unknown>;
}

interface MathDocumentCacheEntry extends MathBatchRenderResult {
  fragments: MathRenderFragment[];
  autoNumbering: MathAutoNumbering;
}

interface MathSourceLine {
  start: number;
  end: number;
  endWithBreak: number;
  text: string;
}

interface MathBlockFence {
  marker: "$$" | "\\[" | "\\]";
  key: string;
  prefix: string;
  tag: string | null;
  listIndentWidth: number;
}

interface CodeFence {
  marker: string;
  quoteKey: string;
  prefix: string;
  math: boolean;
  listIndentWidth: number;
}

interface CodeFenceEnd {
  closingIndex: number;
  endIndex: number;
}

interface SourceRange {
  from: number;
  to: number;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

export const MATH_DOCUMENT_CACHE_LIMIT = 6;

const contextCache = new Map<string, MathDocumentCacheEntry>();

const mathDocumentStatePattern = /\\(?:begin|end|label|tag|notag|nonumber|newcommand|renewcommand|providecommand|def|gdef|xdef|edef|let|DeclareMathOperator|require)\b/;
const mathGlobalDefinitionPattern = /\\(?:newcommand|renewcommand|providecommand|def|gdef|xdef|edef|let|DeclareMathOperator|require)\b/;
let fullBatchRenderCount = 0;
let incrementalFragmentRenderCount = 0;

export function renderMathJaxFragments(
  fragments: readonly MathRenderFragment[],
  options: {
    documentSource: string;
    source: string;
    sourceOffset?: number;
    autoNumbering: MathAutoNumbering;
  },
): string[] {
  if (fragments.length === 0) return [];
  const context = getMathDocumentContext(options.documentSource, options.autoNumbering);
  const offset = resolveSourceOffset(options.documentSource, options.source, options.sourceOffset);
  const candidates = offset === null
    ? context.items.map((_item, index) => index)
    : context.items.flatMap((item, index) => (
      item.from >= offset && item.to <= offset + options.source.length ? [index] : []
    ));
  const matched = matchFragmentIndexes(fragments, candidates, context.items);
  if (matched) return matched.map((index) => context.html[index] ?? "");
  return renderMathJaxBatch(fragments, options.autoNumbering);
}

export function collectMathDocumentItems(source: string): MathDocumentItem[] {
  const lines = collectSourceLines(source);
  const items: MathDocumentItem[] = [];
  const protectedRanges: SourceRange[] = [];
  const frontMatter = getYamlFrontMatterRange(source);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (index === 0 && frontMatter) {
      let endIndex = index;
      while (endIndex + 1 < lines.length && lines[endIndex + 1]!.start < frontMatter.end) {
        endIndex += 1;
      }
      protectedRanges.push({ from: frontMatter.start, to: frontMatter.end });
      index = endIndex;
      continue;
    }

    const containerContext = getContainerLineContext(line.text);
    const listContainer = stripMarkdownListContainerMarkers(
      containerContext.content,
      containerContext.contentColumn,
    );
    const listContentColumn = containerContext.contentColumn + listContainer.continuationIndentWidth;
    if (
      listContainer.codeIndented
      || (
        listContainer.prefixLength > 0
        && isMarkdownCodeIndented(listContainer.content, listContentColumn)
      )
    ) {
      protectedRanges.push(toLineRange(lines, index, index));
      continue;
    }

    const codeFence = getCodeFenceOpen(line.text);
    if (codeFence) {
      const fenceEnd = findCodeFenceClosing(lines, index + 1, codeFence);
      const range = toLineRange(lines, index, fenceEnd.endIndex);
      protectedRanges.push(range);
      if (codeFence.math && fenceEnd.closingIndex >= 0) {
        const formula = readCodeFenceFormula(lines, index, fenceEnd.closingIndex, codeFence);
        if (formula) items.push({ ...range, formula, display: true });
      }
      index = fenceEnd.endIndex;
      continue;
    }

    const codeLikeHtml = getCodeLikeHtmlBlockOpen(line.text);
    if (codeLikeHtml) {
      const closing = findCodeLikeHtmlBlockClosing(lines, index, codeLikeHtml);
      const endIndex = closing < 0 ? lines.length - 1 : closing;
      protectedRanges.push(toLineRange(lines, index, endIndex));
      index = endIndex;
      continue;
    }

    const indentedCodeKey = getIndentedCodeLineKey(line.text);
    if (indentedCodeKey) {
      const closing = findIndentedCodeEnd(lines, index, indentedCodeKey);
      protectedRanges.push(toLineRange(lines, index, closing));
      index = closing;
      continue;
    }

    const opening = getMathBlockFence(line.text);
    if (!opening || opening.marker === "\\]") continue;
    const closing = findMathBlockClosing(lines, index + 1, opening);
    if (closing < 0) continue;
    const formula = readMathBlockFormula(lines, index, closing, opening);
    const range = toLineRange(lines, index, closing);
    protectedRanges.push(range);
    if (formula) items.push({ ...range, formula, display: true });
    index = closing;
  }

  for (const math of collectInlineMathSyntax(source, { includeLinkLabels: true })) {
    if (protectedRanges.some((range) => math.start < range.to && math.end > range.from)) continue;
    const formula = math.formula.trim();
    if (formula) items.push({ from: math.start, to: math.end, formula, display: false });
  }

  return items.sort((left, right) => left.from - right.from || left.to - right.to);
}

export function clearMathRenderingCache(): void {
  contextCache.clear();
  fullBatchRenderCount = 0;
  incrementalFragmentRenderCount = 0;
}

export function getMathRenderingDiagnostics(): { fullBatchRenderCount: number; incrementalFragmentRenderCount: number } {
  return { fullBatchRenderCount, incrementalFragmentRenderCount };
}

export function getMathRenderingCacheSize(): number {
  return contextCache.size;
}

function getMathDocumentContext(
  documentSource: string,
  autoNumbering: MathAutoNumbering,
): MathDocumentContext {
  const items = collectMathDocumentItems(documentSource);
  const key = createMathDocumentCacheKey(items, autoNumbering);
  const cached = contextCache.get(key);
  if (cached) {
    contextCache.delete(key);
    contextCache.set(key, cached);
    return { items, html: cached.html };
  }

  const reusable = findIncrementalMathContext(items, autoNumbering);
  const rendered = reusable
    ? renderIncrementalMathBatch(items, autoNumbering, reusable.entry)
    : renderMathJaxBatchWithContext(items, autoNumbering);
  contextCache.set(key, {
    ...rendered,
    fragments: items.map(({ formula, display }) => ({ formula, display })),
    autoNumbering,
  });
  if (contextCache.size > MATH_DOCUMENT_CACHE_LIMIT) {
    const oldest = contextCache.keys().next().value;
    if (oldest !== undefined) contextCache.delete(oldest);
  }
  return { items, html: rendered.html };
}

function renderMathJaxBatch(
  fragments: readonly MathRenderFragment[],
  autoNumbering: MathAutoNumbering,
): string[] {
  return renderMathJaxBatchWithContext(fragments, autoNumbering).html;
}

function renderMathJaxBatchWithContext(
  fragments: readonly MathRenderFragment[],
  autoNumbering: MathAutoNumbering,
): MathBatchRenderResult {
  fullBatchRenderCount += 1;
  const tex = new TeX({
    packages: ["base", "ams", "newcommand", "textmacros", "noerrors", "noundefined", "configmacros"],
    tags: autoNumbering || "none",
  });
  const svg = new SVG({
    fontCache: "local",
    linebreaks: { inline: false },
  });
  const document = mathjax.document("", { InputJax: tex, OutputJax: svg });
  const tags = tex.parseOptions.tags as unknown as {
    counter: number;
    allLabels: Record<string, unknown>;
  };
  const beforeCounters: number[] = [];
  const ownedLabels: string[][] = [];
  const html = fragments.map((fragment) => {
    beforeCounters.push(tags.counter);
    const labelsBefore = new Set(Object.keys(tags.allLabels));
    const rendered = convertMath(document, fragment);
    ownedLabels.push(Object.keys(tags.allLabels).filter((label) => !labelsBefore.has(label)));
    return rendered;
  });
  const allLabels = { ...tags.allLabels };

  fragments.forEach((fragment, index) => {
    if (!/\\(?:eq)?ref\s*\{/.test(fragment.formula)) return;
    tex.reset(beforeCounters[index]);
    const seededLabels = { ...allLabels };
    for (const label of ownedLabels[index] ?? []) delete seededLabels[label];
    (tex.parseOptions.tags as unknown as { allLabels: Record<string, unknown> }).allLabels = seededLabels;
    html[index] = convertMath(document, fragment);
  });
  return { html, beforeCounters, allLabels };
}

function createMathDocumentCacheKey(
  fragments: readonly MathRenderFragment[],
  autoNumbering: MathAutoNumbering,
): string {
  return JSON.stringify([
    autoNumbering || "none",
    fragments.map((fragment) => [fragment.display, fragment.formula]),
  ]);
}

function findIncrementalMathContext(
  fragments: readonly MathRenderFragment[],
  autoNumbering: MathAutoNumbering,
): { key: string; entry: MathDocumentCacheEntry } | null {
  const entries = Array.from(contextCache.entries()).reverse();
  for (const [key, entry] of entries) {
    if (entry.autoNumbering !== autoNumbering) continue;
    if (entry.fragments.length !== fragments.length) continue;
    if (entry.fragments.some((fragment) => mathGlobalDefinitionPattern.test(fragment.formula))) continue;
    if (fragments.some((fragment) => mathGlobalDefinitionPattern.test(fragment.formula))) continue;

    let changed = 0;
    let compatible = true;
    for (let index = 0; index < fragments.length; index += 1) {
      const previous = entry.fragments[index]!;
      const current = fragments[index]!;
      if (previous.display !== current.display) {
        compatible = false;
        break;
      }
      if (previous.formula !== current.formula) {
        if (mathDocumentStatePattern.test(previous.formula) || mathDocumentStatePattern.test(current.formula)) {
          compatible = false;
          break;
        }
        changed += 1;
      }
    }
    if (compatible && changed > 0 && changed <= 8) return { key, entry };
  }
  return null;
}

function renderIncrementalMathBatch(
  fragments: readonly MathRenderFragment[],
  autoNumbering: MathAutoNumbering,
  previous: MathDocumentCacheEntry,
): MathBatchRenderResult {
  const html = previous.html.slice();
  fragments.forEach((fragment, index) => {
    if (fragment.formula === previous.fragments[index]?.formula) return;
    html[index] = renderMathJaxFragmentAtPosition(
      fragment,
      autoNumbering,
      previous.beforeCounters[index] ?? 0,
      previous.allLabels,
    );
  });
  return {
    html,
    beforeCounters: previous.beforeCounters.slice(),
    allLabels: { ...previous.allLabels },
  };
}

function renderMathJaxFragmentAtPosition(
  fragment: MathRenderFragment,
  autoNumbering: MathAutoNumbering,
  counter: number,
  allLabels: Record<string, unknown>,
): string {
  incrementalFragmentRenderCount += 1;
  const tex = new TeX({
    packages: ["base", "ams", "newcommand", "textmacros", "noerrors", "noundefined", "configmacros"],
    tags: autoNumbering || "none",
  });
  const svg = new SVG({
    fontCache: "local",
    linebreaks: { inline: false },
  });
  const document = mathjax.document("", { InputJax: tex, OutputJax: svg });
  tex.reset(counter);
  (tex.parseOptions.tags as unknown as { allLabels: Record<string, unknown> }).allLabels = { ...allLabels };
  return convertMath(document, fragment);
}

function convertMath(
  document: ReturnType<typeof mathjax.document>,
  fragment: MathRenderFragment,
): string {
  try {
    const node = document.convert(fragment.formula, { display: fragment.display });
    return adaptor.outerHTML(node as never);
  } catch {
    const fallback = document.convert("", { display: fragment.display });
    return adaptor.outerHTML(fallback as never);
  }
}

function collectSourceLines(source: string): MathSourceLine[] {
  const lines: MathSourceLine[] = [];
  let start = 0;
  while (start < source.length) {
    let end = start;
    while (end < source.length && source[end] !== "\n" && source[end] !== "\r") end += 1;
    let endWithBreak = end;
    if (source[endWithBreak] === "\r") endWithBreak += 1;
    if (source[endWithBreak] === "\n") endWithBreak += 1;
    lines.push({ start, end, endWithBreak, text: source.slice(start, end) });
    start = endWithBreak;
  }
  if (source.length === 0 || /(?:\r\n|\r|\n)$/.test(source)) {
    lines.push({ start: source.length, end: source.length, endWithBreak: source.length, text: "" });
  }
  return lines;
}

function getCodeFenceOpen(line: string): CodeFence | null {
  const context = getContainerLineContext(line);
  const container = stripMarkdownListContainerMarkers(context.content, context.contentColumn);
  const contentColumn = context.contentColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(container.content, contentColumn)) return null;
  const indent = getLeadingMarkdownIndent(container.content);
  const match = container.content.slice(indent.length).match(/^(`{3,}|~{3,})([^\r\n]*)$/);
  if (!match || (match[1]![0] === "`" && match[2]!.includes("`"))) return null;
  return {
    marker: match[1]!,
    quoteKey: context.quoteKey,
    prefix: line.slice(
      0,
      context.prefixLength + container.prefixLength + indent.length,
    ),
    math: match[2]!.trim().toLowerCase() === "math",
    listIndentWidth: container.continuationIndentWidth,
  };
}

function findCodeFenceClosing(
  lines: readonly MathSourceLine[],
  startIndex: number,
  fence: CodeFence,
): CodeFenceEnd {
  for (let index = startIndex; index < lines.length; index += 1) {
    const content = getFenceContinuationContent(
      lines[index]!.text,
      fence.quoteKey,
      fence.listIndentWidth,
    );
    if (content === null) return { closingIndex: -1, endIndex: index - 1 };
    const indent = getLeadingMarkdownIndent(content);
    if (getMarkdownIndentWidth(indent) > 3) continue;
    const closing = content.slice(indent.length).match(/^(`{3,}|~{3,})[ \t]*$/)?.[1];
    if (closing?.[0] === fence.marker[0] && closing.length >= fence.marker.length) {
      return { closingIndex: index, endIndex: index };
    }
  }
  return { closingIndex: -1, endIndex: lines.length - 1 };
}

function readCodeFenceFormula(
  lines: readonly MathSourceLine[],
  openingIndex: number,
  closingIndex: number,
  opening: CodeFence,
): string {
  return lines.slice(openingIndex + 1, closingIndex)
    .map((line) => (
      line.text.startsWith(opening.prefix)
        ? line.text.slice(opening.prefix.length)
        : stripFlexibleContainerPrefix(line.text, opening.prefix)
    ))
    .join("\n")
    .trim();
}

function getCodeLikeHtmlBlockOpen(line: string): RegExp | null {
  const content = getContainerLineContext(line).content.trimStart();
  const match = content.match(/^<(pre|code|kbd|samp|script|style|textarea)(?=[\s>])/i);
  return match ? new RegExp(`</${escapeRegExp(match[1]!)}\\s*>`, "i") : null;
}

function findCodeLikeHtmlBlockClosing(
  lines: readonly MathSourceLine[],
  startIndex: number,
  closing: RegExp,
): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (closing.test(lines[index]!.text)) return index;
  }
  return -1;
}

function getIndentedCodeLineKey(line: string): string | null {
  const context = getContainerLineContext(line);
  return isMarkdownCodeIndented(context.content, context.contentColumn) ? context.quoteKey : null;
}

function findIndentedCodeEnd(
  lines: readonly MathSourceLine[],
  startIndex: number,
  key: string,
): number {
  let last = startIndex;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const context = getContainerLineContext(lines[index]!.text);
    if (getIndentedCodeLineKey(lines[index]!.text) === key) {
      last = index;
      continue;
    }
    if (context.quoteKey === key && !context.content.trim()) {
      last = index;
      continue;
    }
    break;
  }
  return last;
}

function getMathBlockFence(line: string): MathBlockFence | null {
  const context = getContainerLineContext(line);
  const container = stripMarkdownListContainerMarkers(context.content, context.contentColumn);
  const contentColumn = context.contentColumn + container.continuationIndentWidth;
  if (container.codeIndented || isMarkdownCodeIndented(container.content, contentColumn)) return null;
  const dollar = readDollarMathBlockOpening(container.content, 3, contentColumn);
  const bracket = container.content.match(/^([ \t]*)(\\\[|\\\])[ \t]*$/);
  if ((!dollar && !bracket) || (bracket && isMarkdownCodeIndented(container.content, contentColumn))) return null;
  const indent = dollar?.indent ?? bracket?.[1] ?? "";
  return {
    marker: dollar ? "$$" : bracket![2] as "\\[" | "\\]",
    key: context.quoteKey,
    prefix: line.slice(0, context.prefixLength + container.prefixLength + indent.length),
    tag: dollar?.tag ?? null,
    listIndentWidth: container.continuationIndentWidth,
  };
}

function findMathBlockClosing(
  lines: readonly MathSourceLine[],
  startIndex: number,
  opening: MathBlockFence,
): number {
  const expected = opening.marker === "$$" ? "$$" : "\\]";
  for (let index = startIndex; index < lines.length; index += 1) {
    if (opening.listIndentWidth > 0) {
      const context = getContainerLineContext(lines[index]!.text);
      const content = getFenceContinuationContent(
        lines[index]!.text,
        opening.key,
        opening.listIndentWidth,
      );
      if (content === null) return -1;
      const contentColumn = context.contentColumn + opening.listIndentWidth;
      if (
        (expected === "$$" && isDollarMathBlockClosing(content, 3, contentColumn))
        || (
          expected === "\\]"
          && !isMarkdownCodeIndented(content, contentColumn)
          && /^\\\][ \t]*$/.test(content.slice(getLeadingMarkdownIndent(content).length))
        )
      ) return index;
      continue;
    }

    const closing = getMathBlockFence(lines[index]!.text);
    if (closing?.key === opening.key && closing.marker === expected) return index;
  }
  return -1;
}

function readMathBlockFormula(
  lines: readonly MathSourceLine[],
  openingIndex: number,
  closingIndex: number,
  opening: MathBlockFence,
): string {
  return lines.slice(openingIndex + 1, closingIndex)
    .map((line) => (
      line.text.startsWith(opening.prefix)
        ? line.text.slice(opening.prefix.length)
        : stripFlexibleContainerPrefix(line.text, opening.prefix)
    ))
    .join("\n")
    .trim();
}

function toLineRange(
  lines: readonly MathSourceLine[],
  startIndex: number,
  endIndex: number,
): SourceRange {
  return {
    from: lines[startIndex]?.start ?? 0,
    to: lines[endIndex]?.end ?? lines[startIndex]?.end ?? 0,
  };
}

function getContainerLineContext(line: string): {
  content: string;
  contentColumn: number;
  prefixLength: number;
  quoteKey: string;
} {
  const quote = readMarkdownBlockquotePrefix(line);
  if (!quote) return { content: line, contentColumn: 0, prefixLength: 0, quoteKey: "plain" };
  return {
    content: line.slice(quote.raw.length),
    contentColumn: quote.contentColumn,
    prefixLength: quote.raw.length,
    quoteKey: `quote:${quote.depth}`,
  };
}

function getFenceContinuationContent(
  line: string,
  quoteKey: string,
  listIndentWidth: number,
): string | null {
  if (quoteKey === "plain" && listIndentWidth === 0) return line;
  const context = getContainerLineContext(line);
  if (context.quoteKey !== quoteKey) return null;
  if (listIndentWidth === 0 || !context.content.trim()) return context.content;
  return stripMarkdownIndentColumns(
    context.content,
    listIndentWidth,
    context.contentColumn,
  )?.content ?? null;
}

function stripFlexibleContainerPrefix(line: string, prefix: string): string {
  let cursor = 0;
  const quoteDepth = (prefix.match(/>/g) ?? []).length;
  if (quoteDepth > 0) {
    cursor += line.slice(cursor).match(/^ {0,3}/)?.[0].length ?? 0;
    for (let depth = 0; depth < quoteDepth && line[cursor] === ">"; depth += 1) {
      cursor += 1;
      if (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
    }
  }
  const remainingIndent = quoteDepth > 0
    ? prefix.slice(prefix.lastIndexOf(">") + 1)
    : prefix;
  let removedWidth = 0;
  const targetWidth = getMarkdownIndentWidth(remainingIndent);
  while (cursor < line.length && removedWidth < targetWidth) {
    if (line[cursor] === " ") removedWidth += 1;
    else if (line[cursor] === "\t") removedWidth += 4 - (removedWidth % 4);
    else break;
    cursor += 1;
  }
  return line.slice(cursor);
}


function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveSourceOffset(
  documentSource: string,
  source: string,
  sourceOffset: number | undefined,
): number | null {
  if (
    sourceOffset !== undefined
    && sourceOffset >= 0
    && documentSource.slice(sourceOffset, sourceOffset + source.length) === source
  ) {
    return sourceOffset;
  }
  if (source === documentSource) return 0;
  const located = documentSource.indexOf(source);
  return located >= 0 ? located : null;
}

function matchFragmentIndexes(
  fragments: readonly MathRenderFragment[],
  candidates: readonly number[],
  items: readonly MathDocumentItem[],
): number[] | null {
  const result: number[] = [];
  let cursor = 0;
  for (const fragment of fragments) {
    let matched = -1;
    for (; cursor < candidates.length; cursor += 1) {
      const candidate = candidates[cursor]!;
      const item = items[candidate];
      if (item?.display === fragment.display && item.formula === fragment.formula) {
        matched = candidate;
        cursor += 1;
        break;
      }
    }
    if (matched < 0) return null;
    result.push(matched);
  }
  return result;
}

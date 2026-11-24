// 清除格式和样式范围（I-7）、链接和图片（I-2、M-2）、图片宽度（M-5）、HTML 注释：
// 代码移植自旧版 src/utils/editorCommands.ts 及 markdownLinks.ts（test/behavior/I.md、M.md 的基准，逐字节一致）。
// 旧版用 markdown-it 渲染再取文字、用整篇分块和 CodeMirror 的 Markdown 解析找链接和代码；
// 这里换成 @marko/markdown 的行内片段和文档树给的范围（inlineLayout.ts），只有一套解析（0.2 节第 2 条）
/* eslint-disable */
import { collectReferences, inlineFragments, nodeText, normalizeLabel, unescapeMarkdown, type Fragment } from "@marko/markdown";
import { toModel } from "../state.ts";
import { currentInlineLayout, insideFencedBlock, type InlineLayout } from "./inlineLayout.ts";
import { DEFAULT_TEXTS } from "../texts.ts";

function collectMarkdownInlineStyleParseSpans(_value: string): IndexRange[] {
  return currentInlineLayout().spans;
}

function getMarkdownInlineStyleSelectionSegments(state: TextState): IndexRange[] | null {
  const layout = currentInlineLayout();
  for (const block of layout.raw) if (block.start < state.selectionEnd && block.end > state.selectionStart) return null;
  const segments: IndexRange[] = [];
  for (const range of layout.spans) {
    const start = Math.max(range.start, state.selectionStart);
    const end = Math.min(range.end, state.selectionEnd);
    if (start < end) segments.push({ start, end });
  }
  return segments.sort((left, right) => left.start - right.start);
}

function markdownInlineStyleCursorIsSafe(value: string, cursor: number, parseSpans: IndexRange[]): boolean {
  if (!value) return true;
  if (parseSpans.some((span) => cursor >= span.start && cursor <= span.end)) return true;
  return !currentInlineLayout().raw.some((block) => cursor >= block.start && cursor <= block.end);
}

function isInsideMarkdownRawBlock(_value: string, lineStart: number): boolean {
  return insideFencedBlock(lineStart);
}

function splitMarkdownBlocks(_value: string): Array<{ start: number; end: number; type: string }> {
  return currentInlineLayout().blocks;
}

// ---------------------------------------------------------------------------
// 行内片段（源码偏移）：链接、图片、行内代码和 HTML 的位置，链接引用定义

interface InlineIndex {
  /** `Link:起点:终点`、`Image:起点:终点` */
  links: Set<string>;
  /** 行内代码、行内 HTML 的范围 */
  literals: IndexRange[];
  /** 链接引用定义：规范化的标签 → 地址 */
  references: Map<string, string>;
}

const indexes = new WeakMap<InlineLayout, InlineIndex>();

function inlineIndex(): InlineIndex {
  const layout = currentInlineLayout();
  const cached = indexes.get(layout);
  if (cached) return cached;
  const model = toModel(layout.doc);
  const definitions = collectReferences(model);
  const references = new Map<string, string>();
  for (const [key, info] of definitions) references.set(key, unescapeMarkdown(info.url ?? ""));
  const isDefined = (label: string) => definitions.has(normalizeLabel(label));
  const index: InlineIndex = { links: new Set(), literals: [], references };
  const { map } = layout.source.map;
  layout.doc.descendants((node) => {
    if (!node.isTextblock || node.type.spec.code) return true;
    const leaf = map.byNode.get(toModel(node));
    if (!leaf) return false;
    const text = nodeText(toModel(node));
    // 文本块里的偏移 → 源码偏移（按行）
    const toSource = (offset: number) => {
      let remaining = offset;
      for (let line = 0; line < leaf.lines.length; line += 1) {
        if (remaining <= leaf.lines[line].length || line === leaf.lines.length - 1) return leaf.starts[line] + Math.min(remaining, leaf.lines[line].length);
        remaining -= leaf.lines[line].length + 1;
      }
      return leaf.starts[0];
    };
    const visit = (fragments: Fragment[]) => {
      for (const fragment of fragments) {
        const from = toSource(fragment.from);
        const to = toSource(fragment.to);
        if (fragment.type === "link") index.links.add(`Link:${from}:${to}`);
        if (fragment.type === "image") index.links.add(`Image:${from}:${to}`);
        if (fragment.type === "code" || fragment.type === "html" || fragment.type === "comment") index.literals.push({ start: from, end: to });
        visit(fragment.children);
      }
    };
    visit(inlineFragments(text, undefined, isDefined));
    return false;
  });
  indexes.set(layout, index);
  return index;
}

function collectParsedMarkdownLinkRanges(_value: string): Set<string> {
  return inlineIndex().links;
}

function collectMarkdownLiteralRanges(_value: string): Array<{ start: number; end: number }> {
  const layout = currentInlineLayout();
  return [...layout.fenced.map((block) => ({ start: block.start, end: block.end })), ...inlineIndex().literals];
}

/** 代替旧版的 markdown-it：解开转义和实体、规范化引用标签、读文档里的链接引用定义 */
const markdownReferenceParser = {
  utils: { unescapeAll: unescapeMarkdown, normalizeReference: normalizeLabel },
  parse(_value: string, env: { references?: Record<string, { href?: unknown }> }) {
    env.references = Object.fromEntries([...inlineIndex().references].map(([key, href]) => [key, { href }]));
  },
};

// ---------------------------------------------------------------------------
// 清除格式：一段行内原文 → 显示出来的文字（旧版是 markdown-it 渲染成 HTML 再取文字）

/** 不能当链接的协议：清除格式时照原样留着 `<…>`（同旧版和 Typora） */
const UNSAFE_SCHEME = /^(?:javascript|vbscript|data):/i;

function visibleText(text: string, from: number, to: number, fragments: Fragment[]): string {
  let result = "";
  let cursor = from;
  for (const fragment of fragments) {
    if (fragment.to <= from || fragment.from >= to) continue;
    result += literalText(text.slice(cursor, fragment.from));
    cursor = fragment.to;
    const content = fragment.content;
    switch (fragment.type) {
      case "code": {
        const raw = content ? text.slice(content.from, content.to).replace(/\r?\n/g, " ") : "";
        result += raw.length >= 2 && raw.startsWith(" ") && raw.endsWith(" ") && raw.trim() ? raw.slice(1, -1) : raw;
        break;
      }
      case "math":
        result += content ? text.slice(content.from, content.to) : "";
        break;
      case "image":
        if (content) result += visibleText(text, content.from, content.to, fragment.children);
        break;
      case "autolink":
      case "url": {
        const url = text.slice(fragment.url?.from ?? fragment.from, fragment.url?.to ?? fragment.to);
        result += UNSAFE_SCHEME.test(url) ? text.slice(fragment.from, fragment.to) : url;
        break;
      }
      case "html":
        // 换行标签当一个空格，其余标签去掉、留下里面的文字
        if (/^<br\s*\/?>$/i.test(text.slice(fragment.from, fragment.to))) result += " ";
        break;
      case "comment":
        result += text.slice(fragment.from, fragment.to).replace(/^<!--/, "").replace(/-->$/, "").trim();
        break;
      case "entity":
        result += unescapeMarkdown(text.slice(fragment.from, fragment.to));
        break;
      case "escape":
        result += content ? text.slice(content.from, content.to) : "";
        break;
      case "hardBreak":
        result += text.slice(fragment.from, fragment.to).includes("\n") ? "\n" : "";
        break;
      case "footnoteReference":
      case "emoji":
        result += text.slice(fragment.from, fragment.to);
        break;
      default:
        result += content ? visibleText(text, content.from, content.to, fragment.children) : "";
    }
  }
  return result + literalText(text.slice(cursor, to));
}

/** 不是片段的文字：`<C:/路径>` 这样的本地地址（Typora 当链接）去掉尖括号 */
function literalText(value: string): string {
  return value.replace(/<([A-Za-z]:[\\/][^<>\s]*)>/g, "$1");
}

/** 清除格式时认所有的行内语法（同旧版：高亮、上下标这些开关关着也去掉标记） */
const ALL_INLINE = { highlight: true, superscript: true, subscript: true, math: true, emoji: true, html: true, footnotes: true, autolink: true };

/** 公式块、代码块的围栏行（选区跨过它们时只留里面的内容） */
const FENCE_LINE = /^[ \t]*(?:\$\$(?:[ \t]*\{[^}\r\n]*\})?|\\\[|\\\]|`{3,}[^`\r\n]*|~{3,}[^\r\n]*)[ \t]*$/;

/** 去掉围栏行（连同它后面的换行） */
function withoutFenceLines(body: string): string {
  if (!body.includes("\n")) return body;
  const lines = body.split("\n");
  const kept = lines.filter((line) => !FENCE_LINE.test(line.replace(/\r$/, "")));
  return kept.join("\n");
}

function stripInlineFormatting(value: string): string {
  const { body, ending } = splitCarriageReturnEnding(value);
  const unfenced = withoutFenceLines(body);
  // 公式先保护起来（里面的方括号不是链接）
  const formulas: string[] = [];
  const mathFragments = inlineFragments(unfenced, ALL_INLINE).filter((fragment) => fragment.type === "math");
  let masked = unfenced;
  for (const fragment of [...mathFragments].sort((left, right) => right.from - left.from)) {
    const token = "" + formulas.length + "";
    formulas.push(fragment.content ? unfenced.slice(fragment.content.from, fragment.content.to) : "");
    masked = masked.slice(0, fragment.from) + token + masked.slice(fragment.to);
  }
  const withoutLinks = replaceMarkdownLinkSyntax(masked, (link) => link.label);
  // 链接已经换成文字了：剩下的方括号都是普通文字（引用标签一律当作没定义）
  const plain = visibleText(withoutLinks, 0, withoutLinks.length, inlineFragments(withoutLinks, { ...ALL_INLINE, math: false }, () => false));
  return plain.replace(/(\d+)/g, (_token, index) => formulas[Number(index)] ?? "") + ending;
}

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface TextEditResult extends TextState {}

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

export function normalizeSelection(state: TextState): TextState {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd));
  const selectionEnd = Math.max(0, Math.max(state.selectionStart, state.selectionEnd));
  return {
    value: state.value,
    selectionStart,
    selectionEnd,
  };
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

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function wrapHtmlCommentSelection(
  state: TextState,
  placeholder = DEFAULT_TEXTS.commentText,
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

export function insertMarkdownLinkSelection(
  state: TextState,
  placeholder = DEFAULT_TEXTS.linkText,
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
  placeholder = DEFAULT_TEXTS.imageAlt,
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

export function selectCurrentWord(state: TextState): TextEditResult {
  const normalized = normalizeSelection(state);
  const range = getWordRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  return {
    value: normalized.value,
    selectionStart: range.start,
    selectionEnd: range.end,
  };
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

export interface TableRowFormat {
  leadingPipe: boolean;
  trailingPipe: boolean;
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

function getCodeSpanMarker(content: string): string {
  const longest = content.match(/`+/g)?.reduce((length, run) => Math.max(length, run.length), 0) ?? 0;
  return "`".repeat(Math.max(1, longest + 1));
}

function formatMarkdownLinkLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function normalizeImageWidth(width: string): string {
  const trimmed = width.trim();
  return /^\d+$/.test(trimmed) ? `${trimmed}px` : trimmed;
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

function sliceAfterRemovedLinePreservingBreak(value: string, end: number): string {
  return value[end] === "\n" && value[end - 1] === "\r" ? `\r${value.slice(end)}` : value.slice(end);
}

function splitCarriageReturnEnding(line: string): { body: string; ending: "" | "\r" } {
  return line.endsWith("\r")
    ? { body: line.slice(0, -1), ending: "\r" }
    : { body: line, ending: "" };
}

function getLineStartOffset(lines: string[], lineIndex: number): number {
  return lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0);
}

function getIndentWidth(value: string): number {
  return getMarkdownIndentWidth(value);
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

function countUnescapedPipes(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "|" && !isEscapedAt(value, index)) {
      count += 1;
    }
  }
  return count;
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

function restorePreferredLineBreaks(value: string, source: string): string {
  return source.includes("\r\n")
    ? value.replace(/\r?\n/g, "\r\n")
    : value.replace(/\r\n/g, "\n");
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

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}



export interface MarkdownLinkRange {
  start: number;
  end: number;
  labelStart: number;
  labelEnd: number;
  destinationStart: number | null;
  destinationEnd: number | null;
  referenceLabel: string | null;
  imageStart: number | null;
  label: string;
}

export interface MarkdownLinkDestination {
  href: string;
  title: string | null;
  angleWrapped: boolean;
}

export interface MarkdownLinkAtCursor {
  start: number;
  end: number;
  href: string;
  label: string;
  image: boolean;
}

export function replaceMarkdownLinkSyntax(
  value: string,
  replacement: (link: MarkdownLinkRange) => string,
): string {
  let result = "";
  let cursor = 0;

  while (cursor < value.length) {
    const open = value.indexOf("[", cursor);
    if (open < 0) {
      result += value.slice(cursor);
      break;
    }

    if (isEscapedAt(value, open)) {
      result += value.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    const link = readMarkdownInlineLink(value, open) ?? readMarkdownReferenceLink(value, open);
    if (!link) {
      result += value.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    result += value.slice(cursor, link.imageStart ?? link.start);
    result += replacement(link);
    cursor = link.end;
  }

  return result;
}

export function readMarkdownInlineLink(value: string, openBracket: number): MarkdownLinkRange | null {
  const closeBracket = findMarkdownLinkLabelEnd(value, openBracket + 1);
  if (closeBracket < 0 || value[closeBracket + 1] !== "(") return null;

  const end = findMarkdownLinkDestinationEnd(value, closeBracket + 2);
  if (end < 0) return null;

  return {
    start: openBracket,
    end,
    labelStart: openBracket + 1,
    labelEnd: closeBracket,
    destinationStart: closeBracket + 2,
    destinationEnd: end - 1,
    referenceLabel: null,
    imageStart: value[openBracket - 1] === "!" && !isEscapedAt(value, openBracket - 1)
      ? openBracket - 1
      : null,
    label: value.slice(openBracket + 1, closeBracket),
  };
}

export function readMarkdownReferenceLink(value: string, openBracket: number): MarkdownLinkRange | null {
  const closeBracket = findMarkdownLinkLabelEnd(value, openBracket + 1);
  if (closeBracket < 0 || value[closeBracket + 1] !== "[") return null;

  const closeReference = findMarkdownLinkLabelEnd(value, closeBracket + 2);
  if (closeReference < 0) return null;

  return {
    start: openBracket,
    end: closeReference + 1,
    labelStart: openBracket + 1,
    labelEnd: closeBracket,
    destinationStart: null,
    destinationEnd: null,
    referenceLabel: value.slice(closeBracket + 2, closeReference),
    imageStart: value[openBracket - 1] === "!" && !isEscapedAt(value, openBracket - 1)
      ? openBracket - 1
      : null,
    label: value.slice(openBracket + 1, closeBracket),
  };
}

export function readMarkdownShortcutReferenceLink(value: string, openBracket: number): MarkdownLinkRange | null {
  const closeBracket = findMarkdownLinkLabelEnd(value, openBracket + 1);
  if (closeBracket < 0) return null;
  const next = value[closeBracket + 1];
  if (next === "(" || next === "[" || next === ":") return null;

  return {
    start: openBracket,
    end: closeBracket + 1,
    labelStart: openBracket + 1,
    labelEnd: closeBracket,
    destinationStart: null,
    destinationEnd: null,
    referenceLabel: value.slice(openBracket + 1, closeBracket),
    imageStart: value[openBracket - 1] === "!" && !isEscapedAt(value, openBracket - 1)
      ? openBracket - 1
      : null,
    label: value.slice(openBracket + 1, closeBracket),
  };
}

export function findMarkdownLinkAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  includeBareLinks = true,
): MarkdownLinkAtCursor | null {
  const normalizedStart = Math.max(0, Math.min(selectionStart, selectionEnd));
  const normalizedEnd = Math.max(0, Math.max(selectionStart, selectionEnd));
  const parsedLinks = collectParsedMarkdownLinkRanges(value);

  for (const link of collectMarkdownLinks(value)) {
    const linkStart = link.imageStart ?? link.start;
    const kind = link.imageStart === null ? "Link" : "Image";
    const parsedFullLink = parsedLinks.has(`${kind}:${linkStart}:${link.end}`);
    const parsedLabel = parsedLinks.has(
      `${kind}:${linkStart}:${link.labelEnd + 1}`,
    );
    if (
      !parsedFullLink
      && !(parsedLabel && isUnwrappedMarkdownLinkDestinationWithSpaces(value, link))
    ) {
      continue;
    }
    if (!isSelectionInsideRange(normalizedStart, normalizedEnd, linkStart, link.end)) {
      continue;
    }

    const href = getMarkdownLinkHref(value, link);
    if (!href) {
      continue;
    }

    return {
      start: linkStart,
      end: link.end,
      href,
      label: link.label,
      image: link.imageStart !== null,
    };
  }

  return includeBareLinks
    ? findBareLinkAtCursor(
      value,
      normalizedStart,
      normalizedEnd,
      collectMarkdownLiteralRanges(value),
    )
    : null;
}

function collectMarkdownLinks(value: string): MarkdownLinkRange[] {
  const links: MarkdownLinkRange[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const open = value.indexOf("[", cursor);
    if (open < 0) break;
    if (isEscapedAt(value, open)) {
      cursor = open + 1;
      continue;
    }

    const link = readMarkdownInlineLink(value, open)
      ?? readMarkdownReferenceLink(value, open)
      ?? readMarkdownShortcutReferenceLink(value, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    links.push(link);
    cursor = link.end;
  }
  return links;
}

function getMarkdownLinkHref(value: string, link: MarkdownLinkRange): string | null {
  if (link.destinationStart !== null && link.destinationEnd !== null) {
    const destination = parseMarkdownLinkDestination(
      value.slice(link.destinationStart, link.destinationEnd),
    );
    const href = destination
      ? markdownReferenceParser.utils.unescapeAll(destination.href)
      : "";
    return href && getPreviewLinkAction(href) !== "blocked"
      ? href
      : null;
  }

  const referenceLabel = link.referenceLabel || link.label;
  return findMarkdownReferenceHref(value, referenceLabel);
}

export function parseMarkdownLinkDestination(body: string): MarkdownLinkDestination | null {
  const trimmed = body.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("<")) {
    const close = findUnescapedCharacter(trimmed, ">", 1);
    if (close < 0) return null;
    const href = trimmed.slice(1, close).trim();
    if (!href) return null;
    const remainder = trimmed.slice(close + 1).trim();
    if (!remainder) return { href, title: null, angleWrapped: true };
    const title = readTrailingMarkdownDestinationTitle(remainder);
    if (!title || title.start !== 0) return null;
    return { href, title: title.value, angleWrapped: true };
  }

  const trailingTitle = readTrailingMarkdownDestinationTitle(trimmed);
  const title = trailingTitle && trailingTitle.start > 0 ? trailingTitle : null;
  const href = (title ? trimmed.slice(0, title.start) : trimmed).trim();
  return href
    ? { href, title: title?.value ?? null, angleWrapped: false }
    : null;
}

export function isUnwrappedMarkdownLinkDestinationWithSpaces(
  value: string,
  link: MarkdownLinkRange,
): boolean {
  if (link.destinationStart === null || link.destinationEnd === null) return false;
  const destination = parseMarkdownLinkDestination(
    value.slice(link.destinationStart, link.destinationEnd),
  );
  return Boolean(
    destination
    && !destination.angleWrapped
    && /[ \t]/.test(destination.href),
  );
}

function findMarkdownReferenceHref(value: string, label: string): string | null {
  const normalizedLabel = markdownReferenceParser.utils.normalizeReference(label);
  if (!normalizedLabel) return null;

  const env: { references?: Record<string, { href?: unknown }> } = {};
  markdownReferenceParser.parse(value, env);
  const href = env.references?.[normalizedLabel]?.href;
  return typeof href === "string" && href ? href : null;
}

function readTrailingMarkdownDestinationTitle(
  value: string,
): { start: number; value: string } | null {
  const close = value[value.length - 1];
  if (close === "\"" || close === "'") {
    for (let index = value.length - 2; index >= 0; index -= 1) {
      if (value[index] !== close || isEscapedAt(value, index)) continue;
      if (index > 0 && !/\s/.test(value[index - 1] ?? "")) return null;
      return {
        start: index,
        value: value.slice(index + 1, -1),
      };
    }
    return null;
  }

  if (close === ")") {
    let depth = 1;
    for (let index = value.length - 2; index >= 0; index -= 1) {
      if (isEscapedAt(value, index)) continue;
      if (value[index] === ")") {
        depth += 1;
        continue;
      }
      if (value[index] !== "(") continue;
      depth -= 1;
      if (depth > 0) continue;
      if (index > 0 && !/\s/.test(value[index - 1] ?? "")) return null;
      return {
        start: index,
        value: value.slice(index + 1, -1),
      };
    }
  }

  return null;
}

function findUnescapedCharacter(value: string, character: string, start: number): number {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] === character && !isEscapedAt(value, index)) {
      return index;
    }
  }
  return -1;
}

function isSelectionInsideRange(selectionStart: number, selectionEnd: number, rangeStart: number, rangeEnd: number): boolean {
  if (selectionStart === selectionEnd) {
    return selectionStart >= rangeStart && selectionStart <= rangeEnd;
  }
  return selectionStart >= rangeStart && selectionEnd <= rangeEnd;
}

function findBareLinkAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  protectedRanges: Array<{ start: number; end: number }>,
): MarkdownLinkAtCursor | null {
  if (selectionStart < 0 || selectionEnd > value.length) return null;

  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const nextLineBreak = value.indexOf("\n", selectionEnd);
  const lineEnd = nextLineBreak < 0 ? value.length : nextLineBreak;
  if (selectionEnd > lineEnd) return null;

  const line = value.slice(lineStart, lineEnd);
  const candidates = [
    ...collectAngleBareLinks(line, lineStart),
    ...collectPlainBareLinks(line, lineStart),
  ].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return right.end - left.end;
  });

  for (const candidate of candidates) {
    if (protectedRanges.some((range) => (
      candidate.start < range.end && candidate.end > range.start
    ))) {
      continue;
    }
    if (isSelectionInsideRange(selectionStart, selectionEnd, candidate.start, candidate.end)) {
      return candidate;
    }
  }

  return null;
}

function collectAngleBareLinks(line: string, lineOffset: number): MarkdownLinkAtCursor[] {
  const links: MarkdownLinkAtCursor[] = [];
  const angleLinkPattern = /<([^<>\s]+)>/g;
  for (const match of line.matchAll(angleLinkPattern)) {
    const href = match[1];
    if (!isSupportedBareHref(href)) continue;

    const start = lineOffset + (match.index ?? 0);
    links.push({
      start,
      end: start + match[0].length,
      href,
      label: href,
      image: false,
    });
  }

  return links;
}

function collectPlainBareLinks(line: string, lineOffset: number): MarkdownLinkAtCursor[] {
  const links: MarkdownLinkAtCursor[] = [];
  const tokenPattern = /[^\s<>"'`]+/g;
  for (const match of line.matchAll(tokenPattern)) {
    const token = match[0];
    const tokenStart = lineOffset + (match.index ?? 0);
    for (const startInToken of findBareHrefStarts(token)) {
      const raw = trimTrailingBareLinkPunctuation(token.slice(startInToken));
      if (!raw || !isSupportedBareHref(raw)) continue;

      links.push({
        start: tokenStart + startInToken,
        end: tokenStart + startInToken + raw.length,
        href: raw,
        label: raw,
        image: false,
      });
    }
  }

  return links;
}

function findBareHrefStarts(token: string): number[] {
  const starts = new Set<number>();
  collectPatternStarts(token, /[a-z][a-z0-9+.-]*:\/\//gi, starts);
  collectPatternStarts(token, /mailto:/gi, starts);
  collectPatternStarts(token, /\/\/(?=[^/\\])/g, starts, (index) => token[index - 1] !== ":");
  collectPatternStarts(token, /[A-Za-z]:(?:[\\/]|%5[cC]|%2[fF])/g, starts);
  collectPatternStarts(token, /\\\\(?=[^\\/])/g, starts);
  collectPatternStarts(token, /%5[cC]%5[cC](?=[^\\/])/g, starts);
  collectRelativeMarkdownPathStarts(token, starts);
  return [...starts].sort((left, right) => left - right);
}

function collectPatternStarts(
  value: string,
  pattern: RegExp,
  starts: Set<number>,
  include: (index: number) => boolean = () => true,
): void {
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (include(index)) starts.add(index);
  }
}

function collectRelativeMarkdownPathStarts(token: string, starts: Set<number>): void {
  for (let index = 0; index < token.length; index += 1) {
    if (!isRelativeMarkdownPathPrefix(token, index)) continue;
    const raw = trimTrailingBareLinkPunctuation(token.slice(index));
    if (isRelativeMarkdownHref(raw)) starts.add(index);
  }
}

function isRelativeMarkdownPathPrefix(token: string, index: number): boolean {
  const rest = token.slice(index);
  if (/^(?:\.{1,2}[\\/]|\/)/.test(rest)) return true;
  return /^[A-Za-z0-9_.-]+[\\/]/.test(rest);
}

function isSupportedBareHref(href: string): boolean {
  const action = getPreviewLinkAction(href);
  if (action === "blocked" || action === "none" || action === "anchor") return false;
  if (action === "external" || action === "local") return true;
  return isRelativeMarkdownHref(href);
}

function isRelativeMarkdownHref(href: string): boolean {
  if (getPreviewLinkAction(href) !== "relative") return false;
  const plainPath = stripBareHrefMetadata(href).replace(/\\/g, "/");
  return /^(?:\.{1,2}\/|\/|[A-Za-z0-9_.-]+\/)/.test(plainPath) && isMarkdownPathLike(plainPath);
}

function stripBareHrefMetadata(href: string): string {
  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const metadataIndexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  const end = metadataIndexes.length > 0 ? Math.min(...metadataIndexes) : href.length;
  return href.slice(0, end);
}

function trimTrailingBareLinkPunctuation(value: string): string {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (".,;:!?。，；：！？".includes(char)) {
      end -= 1;
      continue;
    }
    if (char === ")" && hasMoreClosingCharacters(value.slice(0, end), "(", ")")) {
      end -= 1;
      continue;
    }
    if (char === "]" && hasMoreClosingCharacters(value.slice(0, end), "[", "]")) {
      end -= 1;
      continue;
    }
    if (char === "}" && hasMoreClosingCharacters(value.slice(0, end), "{", "}")) {
      end -= 1;
      continue;
    }
    break;
  }

  return value.slice(0, end);
}

function hasMoreClosingCharacters(value: string, open: string, close: string): boolean {
  let openings = 0;
  let closings = 0;
  for (const char of value) {
    if (char === open) openings += 1;
    if (char === close) closings += 1;
  }
  return closings > openings;
}

function findMarkdownLinkLabelEnd(value: string, start: number): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (isEscapedAt(value, index)) continue;
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function findMarkdownLinkDestinationEnd(value: string, start: number): number {
  let depth = 0;
  let inAngle = false;
  let quote: "\"" | "'" | null = null;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (isEscapedAt(value, index)) continue;

    if (inAngle) {
      if (char === ">") inAngle = false;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === "<") {
      inAngle = true;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      if (depth === 0) return index + 1;
      depth -= 1;
    }
  }

  return -1;
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}



export interface MarkdownBlockquotePrefix {
  raw: string;
  depth: number;
  contentColumn: number;
}

export function getMarkdownIndentWidth(value: string): number {
  return getMarkdownColumnAfter(value);
}

export function getMarkdownColumnAfter(value: string, startColumn = 0): number {
  let column = Math.max(0, Math.trunc(startColumn));
  for (const character of value) {
    column += character === "\t" ? 4 - (column % 4) : 1;
  }
  return column;
}

export function readMarkdownBlockquotePrefix(
  line: string,
  maximumDepth: number | null = null,
): MarkdownBlockquotePrefix | null {
  let cursor = 0;
  let depth = 0;
  let column = 0;
  while (maximumDepth === null || depth < maximumDepth) {
    const marker = line.slice(cursor).match(/^([ \t]*)>/);
    if (!marker) break;
    const leadingColumn = getMarkdownColumnAfter(marker[1] ?? "", column);
    if (leadingColumn - column > 3) break;
    cursor += marker[0].length;
    column = leadingColumn + 1;
    if (line[cursor] === " " || line[cursor] === "\t") {
      column = getMarkdownColumnAfter(line[cursor], column);
      cursor += 1;
    }
    depth += 1;
  }
  return depth > 0
    ? { raw: line.slice(0, cursor), depth, contentColumn: column }
    : null;
}



export type PreviewLinkAction = "none" | "anchor" | "relative" | "local" | "external" | "blocked";

const blockedProtocols = new Set(["javascript:", "vbscript:", "data:"]);

export function getPreviewLinkAction(rawHref: string | null | undefined): PreviewLinkAction {
  const href = rawHref?.trim() ?? "";
  if (!href) return "none";
  if (href.startsWith("#")) return "anchor";
  if (href.startsWith("//")) return "external";
  if (isWindowsAbsoluteHref(href) || isWindowsUncHref(href)) return "local";

  const protocol = href.match(/^([a-z][a-z0-9+.-]*:)/i)?.[1].toLowerCase();
  if (!protocol) return "relative";
  if (protocol === "file:") return "local";
  if (blockedProtocols.has(protocol)) return "blocked";
  return "external";
}

function isWindowsAbsoluteHref(href: string): boolean {
  return /^[A-Za-z]:(?:[\\/]|%5[cC]|\/)/.test(href);
}

function isWindowsUncHref(href: string): boolean {
  return /^(?:\\\\|%5[cC]%5[cC])[^\\/]/.test(href);
}



export const markdownFileExtensions = [
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mkdn",
  "mdwn",
  "mdtxt",
  "mdtext",
  "rmd",
] as const;

const markdownExtensionPattern = new RegExp(
  `\\.(${markdownFileExtensions.join("|")})$`,
  "i",
);

export function isMarkdownPathLike(path: string): boolean {
  return markdownExtensionPattern.test(path);
}

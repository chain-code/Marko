// 行内样式（I-1、I-4）：加粗、斜体、删除线、下划线、行内代码、高亮、上下标的切换和包裹。
// 代码移植自旧版 src/utils/editorCommands.ts（test/behavior/I.md 的基准，逐字节一致）；
// 旧版靠整篇分块（splitMarkdownBlocks）判断哪些地方是行内内容，这里换成文档树给的范围（inlineLayout.ts）
/* eslint-disable */
import { currentInlineLayout } from "./inlineLayout.ts";

function collectMarkdownInlineStyleParseSpans(_value: string): IndexRange[] {
  return currentInlineLayout().spans;
}

/** 选区和各个文本块内容范围的交集；选区碰到代码块这类不能放行内样式的块时返回 null */
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

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface TextEditResult extends TextState {}

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

function getCodeSpanMarker(content: string): string {
  const longest = content.match(/`+/g)?.reduce((length, run) => Math.max(length, run.length), 0) ?? 0;
  return "`".repeat(Math.max(1, longest + 1));
}

interface IndexRange {
  start: number;
  end: number;
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

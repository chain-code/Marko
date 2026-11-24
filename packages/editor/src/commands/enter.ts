// 回车（E-5）：续写列表符号、退出空的列表项、引用里换行、补全代码块和公式块的结尾围栏、把表头行变成表格……
// 行为按 Markdown 源码定义（test/behavior/E.md），结构判断用文档树：光标在不在列表项、脚注、定义说明、
// 表格、代码块里看节点类型；这一行的前缀（引用的 `>`、列表符号）从源码里读
import type { EditorSettings } from "../settings.ts";
import type { SourceResult, SourceSnapshot } from "../source.ts";
import { blockType, inside, nearest, type BlockInfo, type CursorContext } from "./context.ts";
import { rawBlockAt, rawBlockEnter, type EnterModifiers } from "./raw.ts";
import { afterOnLine, collapsed, columnAfter, cursorAt, incrementNumber, indentWidth, insertAtSelection, lineAt, normalizeNumber, normalizeQuote, quotePrefix, selectionRange } from "./text.ts";

export type { EnterModifiers } from "./raw.ts";

/** 回车时要知道的结构（都从文档树上取） */
interface EnterEnv {
  source: SourceSnapshot;
  context: CursorContext;
  settings: EditorSettings;
}

/** 光标这一行在文本块里是第几行 */
function lineIndexInBlock(block: BlockInfo, offset: number): number {
  const starts = block.leaf?.starts ?? [];
  let index = 0;
  for (let i = 0; i < starts.length; i += 1) if (starts[i] <= offset) index = i;
  return index;
}

/** 光标所在的文本块是列表项的第一块、光标在它的第一行（写列表符号的那一行） */
function onListMarkerLine(env: EnterEnv, offset: number): boolean {
  const block = env.context.block;
  if (!block) return false;
  const item = nearest(env.context, "listItem");
  if (!item) return false;
  // 文本块要在这个列表项（或它里面的紧凑嵌套列表项）的第一行上
  return lineIndexInBlock(block, offset) === 0 && firstLineOfItem(env, item, block);
}

/** 文本块的第一行就是列表项（以及外层各个以它开头的列表项）的第一行 */
function firstLineOfItem(env: EnterEnv, item: BlockInfo, block: BlockInfo): boolean {
  return item.range !== null && block.range !== null && lineAt(env.source.text, item.range.start).start === lineAt(env.source.text, block.range.start).start;
}

// ---------------------------------------------------------------------------
// 列表

interface CompactNested {
  indent: string;
  marker: string;
  taskMarker: string;
  content: string;
  depth: number;
}

/** `* * 文字` 这种一行里写了几层列表符号的（Typora 输入嵌套列表的写法） */
function compactNestedBullets(line: string): CompactNested | null {
  const indent = /^[ \t]*/.exec(line)?.[0] ?? "";
  const markers: string[] = [];
  let cursor = indent.length;
  while (cursor < line.length) {
    const marker = /^([-*+])[ \t]+/.exec(line.slice(cursor));
    if (!marker) break;
    markers.push(marker[1]);
    cursor += marker[0].length;
  }
  if (markers.length < 2) return null;
  const task = /^(\[[ xX]\])[ \t]+/.exec(line.slice(cursor));
  if (task) cursor += task[0].length;
  return { indent, marker: markers[markers.length - 1] ?? "*", taskMarker: task ? "[ ] " : "", content: line.slice(cursor), depth: markers.length - 1 };
}

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/;

/** 空列表项上光标在符号里或符号前：当成在行尾 */
function normalizeEmptyItemCursor(env: EnterEnv, mode: "plain" | "quoted"): SourceSnapshot {
  const { source } = env;
  if (!collapsed(source)) return source;
  const line = lineAt(source.text, source.head);
  const text = source.text.slice(line.start, line.end);
  let markerStart: number;
  if (mode === "quoted") {
    const quote = quotePrefix(text);
    if (!quote) return source;
    const list = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(text.slice(quote.raw.length));
    if (!list || text.slice(quote.raw.length + list[0].length).trim()) return source;
    markerStart = line.start + quote.raw.length + list[1].length;
  } else {
    const list = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?$/.exec(text);
    if (!list) return source;
    markerStart = line.start + list[1].length;
  }
  if (source.head < markerStart || source.head > line.end) return source;
  return { ...source, anchor: line.end, head: line.end };
}

/** 有序列表从 startLine 行起重新编号（同一层、同一个分隔符的项；更深的项和续行跳过） */
function renumberLines(text: string, startLine: number, quote: string | null, indent: string, startNumber: string, delimiter: string): string {
  const lines = text.split("\n");
  let next = startNumber;
  const quotePattern = quote === null ? "" : quotePrefixPattern(quote);
  const marker = new RegExp(`^${quotePattern}(\\s*)(\\d+)([.)])(\\s+)`);
  for (let index = startLine; index < lines.length; index += 1) {
    const line = lines[index];
    const match = marker.exec(line);
    if (!match) {
      if (!line.trim()) continue;
      if (quote === null ? isDeeper(leadingOf(line), indent) : quotedDeeper(line, quote, indent)) continue;
      break;
    }
    if (match[1] !== indent || match[3] !== delimiter) {
      if (isDeeper(match[1], indent)) continue;
      break;
    }
    lines[index] = `${quote ?? ""}${indent}${next}${delimiter}${match[4]}${line.slice(match[0].length)}`;
    next = incrementNumber(next);
  }
  return lines.join("\n");
}

function leadingOf(line: string): string {
  return /^\s*/.exec(line)?.[0] ?? "";
}

function isDeeper(lineIndent: string, baseIndent: string): boolean {
  return lineIndent.startsWith(baseIndent) && indentWidth(lineIndent) > indentWidth(baseIndent);
}

function quotedDeeper(line: string, quote: string, indent: string): boolean {
  if (!line.startsWith(quote)) return false;
  const content = line.slice(quote.length);
  if (!content.trim()) return true;
  return isDeeper(leadingOf(content), indent);
}

function quotePrefixPattern(quote: string): string {
  const leading = /^\s*/.exec(quote)?.[0] ?? "";
  const depth = quote.match(/>/g)?.length ?? 0;
  return `${leading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${Array.from({ length: depth }, () => ">[ \\t]?").join("")}`;
}

function lineNumberAt(text: string, offset: number): number {
  let count = 0;
  for (let index = text.indexOf("\n"); index >= 0 && index < offset; index = text.indexOf("\n", index + 1)) count += 1;
  return count;
}

/** 列表项（不在引用里）：续写同样的符号；空项退出并保留这一层的缩进 */
function continueList(env: EnterEnv): SourceResult | null {
  if (!onListMarkerLine(env, env.source.head) || inside(env.context, "blockquote", "alert")) return null;
  const source = normalizeEmptyItemCursor(env, "plain");
  if (!collapsed(source)) return null;
  const { text, eol } = source;
  const line = lineAt(text, source.head);
  const before = text.slice(line.start, source.head);
  const after = text.slice(source.head, line.end);
  const compact = compactNestedBullets(before);
  if (compact) {
    const continuation = compact.indent + " ".repeat((env.settings.indentSize === 4 ? 4 : 2) * compact.depth);
    if (!compact.content.trim() && !after.trim()) {
      return cursorAt(text.slice(0, line.start) + continuation + text.slice(source.head), line.start + continuation.length);
    }
    return insertAtSelection(source, `${eol}${continuation}${compact.marker} ${compact.taskMarker}`);
  }
  const match = LIST_LINE.exec(before);
  if (!match) return null;
  const content = before.slice(match[0].length);
  const number = /^(\d+)([.)])$/.exec(match[2]);
  if (!content.trim() && !after.trim()) {
    let value = text.slice(0, line.start) + match[1] + text.slice(source.head);
    if (number) value = renumberLines(value, lineNumberAt(value, line.start) + 1, null, match[1], normalizeNumber(number[1]), number[2]);
    return cursorAt(value, line.start + match[1].length);
  }
  const task = match[3] ? "[ ] " : "";
  if (number) {
    const marker = `${incrementNumber(normalizeNumber(number[1]))}${number[2]}`;
    const inserted = insertAtSelection(source, `${eol}${match[1]}${marker} ${task}`);
    const value = renumberLines(inserted.text, lineNumberAt(inserted.text, inserted.head) + 1, null, match[1], incrementNumber(incrementNumber(normalizeNumber(number[1]))), number[2]);
    return cursorAt(value, inserted.head);
  }
  return insertAtSelection(source, `${eol}${match[1]}${match[2]} ${task}`);
}

/** 引用里的列表项 */
function continueQuotedList(env: EnterEnv): SourceResult | null {
  if (!onListMarkerLine(env, env.source.head) || !inside(env.context, "blockquote", "alert")) return null;
  const source = normalizeEmptyItemCursor(env, "quoted");
  if (!collapsed(source)) return null;
  const { text, eol } = source;
  const line = lineAt(text, source.head);
  const before = text.slice(line.start, source.head);
  const after = text.slice(source.head, line.end);
  const quote = quotePrefix(before);
  if (!quote) return null;
  const compact = compactNestedBullets(before.slice(quote.raw.length));
  if (compact) {
    const continuation = compact.indent + " ".repeat((env.settings.indentSize === 4 ? 4 : 2) * compact.depth);
    if (!compact.content.trim() && !after.trim()) {
      const replacement = `${quote.normalized}${continuation}`;
      return cursorAt(text.slice(0, line.start) + replacement + text.slice(source.head), line.start + replacement.length);
    }
    return insertAtSelection(source, `${eol}${quote.normalized}${continuation}${compact.marker} ${compact.taskMarker}`);
  }
  const list = LIST_LINE.exec(before.slice(quote.raw.length));
  if (!list) return null;
  const listIndent = list[1];
  const marker = list[2];
  const task = list[3] ? "[ ] " : "";
  const content = before.slice(quote.raw.length + list[0].length);
  const number = /^(\d+)([.)])$/.exec(marker);
  if (!content.trim() && !after.trim()) {
    const replacement = `${quote.normalized}${listIndent}`;
    let value = text.slice(0, line.start) + replacement + text.slice(source.head);
    if (number) value = renumberLines(value, lineNumberAt(value, line.start) + 1, quote.normalized, listIndent, normalizeNumber(number[1]), number[2]);
    return cursorAt(value, line.start + replacement.length);
  }
  if (number) {
    const next = `${incrementNumber(normalizeNumber(number[1]))}${number[2]}`;
    const inserted = insertAtSelection(source, `${eol}${quote.normalized}${listIndent}${next} ${task}`);
    const value = renumberLines(
      inserted.text,
      lineNumberAt(inserted.text, inserted.head) + 1,
      quote.normalized,
      listIndent,
      incrementNumber(incrementNumber(normalizeNumber(number[1]))),
      number[2],
    );
    return cursorAt(value, inserted.head);
  }
  return insertAtSelection(source, `${eol}${quote.normalized}${listIndent}${marker} ${task}`);
}

/** 行首的引用前缀拆出来：规范写法、原文长度、后面的内容 */
function splitQuote(line: string): { quote: string; rawLength: number; content: string } {
  const quote = quotePrefix(line);
  return { quote: quote?.normalized ?? "", rawLength: quote?.raw.length ?? 0, content: quote ? line.slice(quote.raw.length) : line };
}

/** 列表项的续行（不是第一行）：续写同样的缩进；空的续行退出到列表外 */
function continueListContinuation(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  if (!collapsed(source) || !inside(context, "listItem") || onListMarkerLine(env, source.head)) return null;
  // 定义说明、脚注定义在列表项里时按它们自己的规则
  const container = nearest(context, "listItem", "footnoteDefinition", "definitionDescription");
  if (container?.node.type.name !== "listItem") return null;
  return continueIndentedLine(source, /^((?:[ \t]{2,}|\t))(.*)$/);
}

/** 续行：这一行容器前缀后面是缩进 + 内容；回车续写同样的缩进，空行回车退出（只留引用前缀） */
function continueIndentedLine(source: SourceSnapshot, pattern: RegExp): SourceResult | null {
  const { text, eol } = source;
  const line = lineAt(text, source.head);
  const before = text.slice(line.start, source.head);
  const after = text.slice(source.head, line.end);
  const parts = splitQuote(before);
  const match = pattern.exec(parts.content);
  if (!match) return null;
  if (!match[2].trim() && !after.trim()) {
    return cursorAt(text.slice(0, line.start) + parts.quote + text.slice(source.head), line.start + parts.quote.length);
  }
  return insertAtSelection(source, `${eol}${parts.quote}${match[1]}`);
}

// ---------------------------------------------------------------------------
// 定义列表、脚注定义

function continueDefinition(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  if (!collapsed(source)) return null;
  const description = nearest(context, "definitionDescription");
  if (!description) return null;
  const { text, eol } = source;
  const line = lineAt(text, source.head);
  const before = text.slice(line.start, source.head);
  const after = text.slice(source.head, line.end);
  const parts = splitQuote(before);
  const marker = /^([ \t]{0,3}):(?:[ \t]+|$)/.exec(parts.content);
  if (marker && description.range && lineAt(text, description.range.start).start === line.start) {
    if (!parts.content.slice(marker[0].length).trim() && !after.trim()) {
      const replacement = `${parts.quote}${marker[1]}`;
      return cursorAt(text.slice(0, line.start) + replacement + text.slice(source.head), line.start + replacement.length);
    }
    return insertAtSelection(source, `${eol}${parts.quote}${marker[1]}: `);
  }
  return continueIndentedLine(source, /^((?:[ \t]{2,}|\t))(.*)$/);
}

function continueFootnote(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  if (!collapsed(source)) return null;
  const footnote = nearest(context, "footnoteDefinition");
  if (!footnote?.range) return null;
  const { text, eol } = source;
  const line = lineAt(text, source.head);
  const before = text.slice(line.start, source.head);
  const parts = splitQuote(before);
  // 定义的第一行：续行缩进 4 个空格
  if (lineAt(text, footnote.range.start).start === line.start && /^[ \t]{0,3}\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/.test(parts.content)) {
    return insertAtSelection(source, `${eol}${parts.quote}    `);
  }
  return continueIndentedLine(source, /^((?: {4,}| {0,3}\t))(.*)$/);
}

// ---------------------------------------------------------------------------
// 引用、标题、分隔线、Front Matter

function continueBlockquote(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  // 引用里的标题按标题拆（splitHeading）
  if (!collapsed(source) || !inside(context, "blockquote", "alert") || blockType(context) !== "paragraph") return null;
  const { text, eol } = source;
  const line = lineAt(text, source.head);
  const before = text.slice(line.start, source.head);
  const after = text.slice(source.head, line.end);
  if (!quotePrefix(before)) return null;
  const match = /^(\s*)((?:>\s*)+)(.*)$/.exec(before);
  if (!match) return null;
  if (!match[3].trim() && !after.trim()) {
    const markers = match[2].match(/>\s*/g) ?? [];
    if (markers.length > 1) {
      const replacement = normalizeQuote(`${match[1]}${markers.slice(0, -1).join("")}`);
      return cursorAt(text.slice(0, line.start) + replacement + text.slice(source.head), line.start + replacement.length);
    }
    return cursorAt(text.slice(0, line.start) + text.slice(source.head), line.start);
  }
  return insertAtSelection(source, `${eol}${normalizeQuote(`${match[1]}${match[2]}`)}`);
}

/** 空标题上回车：变回正文（保留缩进） */
function exitEmptyHeading(env: EnterEnv): SourceResult | null {
  const { source } = env;
  if (!collapsed(source) || blockType(env.context) !== "heading") return null;
  const { text } = source;
  const line = lineAt(text, source.head);
  const before = text.slice(line.start, source.head);
  const after = text.slice(source.head, line.end);
  if (after.trim()) return null;
  const quote = quotePrefix(before);
  if (quote) {
    const heading = /^(\s{0,3})#{1,6}\s*$/.exec(before.slice(quote.raw.length));
    if (heading) {
      const replacement = `${quote.normalized}${heading[1]}`;
      return cursorAt(text.slice(0, line.start) + replacement + text.slice(source.head), line.start + replacement.length);
    }
  }
  const heading = /^(\s{0,3})#{1,6}\s*$/.exec(before);
  if (!heading) return null;
  return cursorAt(text.slice(0, line.start) + heading[1] + text.slice(source.head), line.start + heading[1].length);
}

/** 段落里正在输入的 `---`、`***`、`___`、`+++`：回车后变成分隔线，光标到下一行 */
function completeHorizontalRule(env: EnterEnv): SourceResult | null {
  const { source } = env;
  if (!collapsed(source) || blockType(env.context) !== "paragraph") return null;
  if (afterOnLine(source.text, source.head).trim()) return null;
  const line = lineAt(source.text, source.head);
  if (!/^\s{0,3}(---|\+\+\+|\*\*\*|___)$/.test(source.text.slice(line.start, source.head))) return null;
  return insertAtSelection(source, source.eol);
}

/** 文档第一行正在输入的 `---`：回车后变成 Front Matter */
function completeFrontMatter(env: EnterEnv): SourceResult | null {
  const { source } = env;
  if (!collapsed(source)) return null;
  const bom = source.text.startsWith("\uFEFF") ? 1 : 0;
  if (source.head !== bom + 3 || source.text.slice(bom, source.head) !== "---") return null;
  const suffix = source.text.slice(source.head);
  if (suffix && !suffix.startsWith("\n") && !suffix.startsWith("\r\n")) return null;
  const value = `${source.text.slice(0, source.head)}${source.eol}${source.eol}---${suffix}`;
  return cursorAt(value, source.head + source.eol.length);
}

// ---------------------------------------------------------------------------
// 代码块、公式块的围栏

/** 光标在围栏开头那一行的末尾（段落里正在输入的 ```` ```ts ````、`$$`，或解析出来的空的没闭合代码块）：补上结尾 */
function completeFence(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  if (!collapsed(source)) return null;
  const type = blockType(context);
  const { text, eol } = source;
  const line = lineAt(text, source.head);
  if (text.slice(source.head, line.end).trim()) return null;
  const before = text.slice(line.start, source.head);
  let closing: string;
  let fenceIndent: string;
  if (type === "codeBlock" || type === "diagram") {
    const block = context.block;
    if (!block?.range || block.node.attrs.closing !== null || block.node.attrs.indented || block.node.textContent !== "") return null;
    // 光标要在开头那一行上
    if (lineAt(text, block.range.start).start !== line.start) return null;
    const fence = String(block.node.attrs.fence ?? "```");
    closing = fence[0].repeat(fence.length);
    fenceIndent = String(block.node.attrs.indent ?? "");
  } else if (type === "paragraph") {
    const parts = splitQuote(before);
    const code = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(parts.content);
    const dollar = /^([ \t]*)\$\$[ \t]*(?:\{([^\r\n]+)\})?$/.exec(parts.content);
    const bracket = /^(\s*)\\\[\s*$/.exec(parts.content);
    if (code) {
      if (code[2][0] === "`" && code[3].includes("`")) return null;
      closing = code[2][0].repeat(code[2].length);
      fenceIndent = code[1];
    } else if (dollar) {
      closing = "$$";
      fenceIndent = dollar[1];
    } else if (bracket) {
      closing = "\\]";
      fenceIndent = bracket[1];
    } else {
      return null;
    }
    // 围栏缩进到 4 列以上是缩进代码（列从引用前缀之后算，Tab 按绝对列对齐）
    const column = quotePrefix(before)?.contentColumn ?? 0;
    if (columnAfter(fenceIndent, column) - column >= 4) return null;
    // 后面已经有能闭合它的行：Lezer 已经认成代码块了，这里只处理段落
  } else {
    return null;
  }
  // 续行的前缀：引用前缀（规范写法）+ 列表内容的缩进 + 围栏的缩进
  const parts = splitQuote(before);
  const quote = quotePrefix(before);
  const afterQuote = parts.content;
  const listMarkers = /^(?:[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)*/.exec(afterQuote)?.[0] ?? "";
  const listWidth = listMarkers ? indentWidth(listMarkers) : 0;
  const continuation = parts.quote + " ".repeat(listWidth) + (listMarkers ? leadingOf(afterQuote.slice(listMarkers.length)) : fenceIndent);
  const body = quote || listWidth > 0 ? continuation : "";
  const insertion = eol + body + eol + continuation + closing;
  const value = text.slice(0, source.head) + insertion + text.slice(source.head);
  return cursorAt(value, source.head + eol.length + body.length);
}

// ---------------------------------------------------------------------------
// 表格

function splitPipes(content: string): string[] {
  let body = content.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !escapedAt(body, body.length - 1)) body = body.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === "|" && !escapedAt(body, index)) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += body[index];
  }
  cells.push(current.trim());
  return cells;
}

function escapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) count += 1;
  return count % 2 === 1;
}

function tableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/** 段落里的 `| 列 | 列 |` 一行：回车后补上分隔行和一行空的表体，光标在第一格 */
function completeTableShortcut(env: EnterEnv): SourceResult | null {
  const { source } = env;
  if (!collapsed(source) || blockType(env.context) !== "paragraph") return null;
  const { text, eol } = source;
  const line = lineAt(text, source.head);
  if (text.slice(source.head, line.end).trim()) return null;
  const before = text.slice(line.start, source.head);
  const quote = quotePrefix(before);
  const prefix = quote?.normalized ?? "";
  const content = quote ? before.slice(quote.raw.length) : before;
  if (indentWidth(leadingOf(content)) >= 4) return null;
  const trimmed = content.trim();
  if (!trimmed || ![...trimmed].some((char, index) => char === "|" && !escapedAt(trimmed, index))) return null;
  const cells = splitPipes(content);
  if (cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell))) return null;
  const single = cells.length === 1 && trimmed.startsWith("|") && trimmed.endsWith("|") && !escapedAt(trimmed, trimmed.length - 1);
  if ((cells.length < 2 && !single) || cells.every((cell) => !cell.trim())) return null;
  const header = `${prefix}${tableRow(cells)}`;
  const separator = `${prefix}${tableRow(cells.map(() => "---"))}`;
  const body = `${prefix}${tableRow(cells.map(() => ""))}`;
  const replacement = `${header}${eol}${separator}${eol}${body}`;
  const cursor = line.start + header.length + eol.length + separator.length + eol.length + prefix.length + 2;
  return cursorAt(text.slice(0, line.start) + replacement + text.slice(source.head), cursor);
}

/** 按表头行的竖线写法拼一行（只有一格又没有两头竖线时补上结尾竖线，否则认不出是表格） */
export function buildTableRow(cells: string[], format: { leadingPipe: boolean; trailingPipe: boolean }): string {
  const safe = cells.length <= 1 && !format.leadingPipe && !format.trailingPipe ? { leadingPipe: false, trailingPipe: true } : format;
  const body = cells.join(" | ");
  if (safe.leadingPipe && safe.trailingPipe) return `| ${body} |`;
  if (safe.leadingPipe) return `| ${body}`;
  if (safe.trailingPipe) return `${body} |`;
  return body;
}

/** 表格里回车：在这一行下面插一行空行（在表头里时插在分隔行下面），光标在同一列 */
function continueTableRow(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  const type = blockType(context);
  if (!collapsed(source) || (type !== "tableHeader" && type !== "tableCell")) return null;
  const table = nearest(context, "table");
  const row = nearest(context, "tableRow");
  if (!table?.range || !row?.range || !context.block) return null;
  const { text, eol } = source;
  const header = table.node.firstChild;
  if (!header) return null;
  let rowIndex = 0;
  let column = 0;
  table.node.forEach((child, offset, index) => {
    if (table.pos + 1 + offset === row.pos) rowIndex = index;
  });
  row.node.forEach((_cell, offset, index) => {
    if (row.pos + 1 + offset === context.block?.pos) column = index;
  });
  const headerLine = lineAt(text, table.range.start);
  const prefix = text.slice(headerLine.start, table.range.start);
  const headerText = text.slice(table.range.start, headerLine.end);
  const format = { leadingPipe: /^\s*\|/.test(headerText), trailingPipe: /\|\s*$/.test(headerText) && !escapedAt(headerText.trimEnd(), headerText.trimEnd().length - 1) };
  const columns = header.childCount;
  const insertAt = rowIndex === 0 ? lineAt(text, headerLine.next).end : lineAt(text, row.range.start).end;
  const rowText = buildTableRow(Array.from({ length: columns }, () => ""), format);
  const cells = splitPipesWithPositions(rowText);
  // 解析时这一行比表头短的格补在行尾
  const cell = column < cells.length ? cells[column] : rowText.length;
  const insertion = `${eol}${prefix}${rowText}`;
  return cursorAt(text.slice(0, insertAt) + insertion + text.slice(insertAt), insertAt + eol.length + prefix.length + cell);
}

/** 一行表格里每格内容的起点（空格子在竖线后的空格之后），同 @marko/markdown 的解析 */
function splitPipesWithPositions(row: string): number[] {
  const pipes: number[] = [];
  for (let i = 0; i < row.length; i += 1) {
    if (row[i] === "\\") i += 1;
    else if (row[i] === "|") pipes.push(i);
  }
  const contentStart = /^[ \t]*/.exec(row)?.[0].length ?? 0;
  const contentEnd = row.replace(/[ \t]+$/, "").length;
  const leading = pipes.length > 0 && pipes[0] === contentStart;
  const trailing = pipes.length > 0 && pipes[pipes.length - 1] === contentEnd - 1 && contentEnd - 1 > (leading ? pipes[0] : -1);
  const bounds = [leading ? pipes[0] : contentStart - 1];
  for (const pipe of pipes) if (pipe !== bounds[0] && !(trailing && pipe === contentEnd - 1)) bounds.push(pipe);
  bounds.push(trailing ? contentEnd - 1 : contentEnd);
  const starts: number[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    const start = bounds[i] + 1;
    let from = start;
    let to = bounds[i + 1];
    while (from < to && /[ \t]/.test(row[from])) from += 1;
    while (to > from && /[ \t]/.test(row[to - 1])) to -= 1;
    if (from === to && from > start) from = Math.min(start + 1, bounds[i + 1]);
    starts.push(from);
  }
  return starts;
}

// ---------------------------------------------------------------------------
// 段落、标题拆成两块

/** 正文拆段：插入一个空行（Typora 的段落） */
function splitParagraph(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  const type = blockType(context);
  if (!context.sameBlock) return null;
  if (type === "heading") return splitHeading(env);
  if (type !== "paragraph") return null;
  if (inside(context, "blockquote", "alert")) {
    // 引用里的标题行（旧行为：只拆标题）
    return null;
  }
  if (inside(context, "listItem", "footnoteDefinition", "definitionDescription", "definitionList", "table")) return null;
  const { from } = selectionRange(source);
  const line = lineAt(source.text, from);
  const text = source.text.slice(line.start, Math.max(line.end, from));
  if (/^\s{0,3}(?:>|[-+*]\s|\d+[.)]\s|\[[^\]]+]:|\[\^[^\]]+]:)/.test(text)) return null;
  return insertAtSelection(source, `${source.eol}${source.eol}`);
}

/** 拆标题：两段都是同样写法的标题；在开头拆时上面空出一个空段落，在末尾拆时下面开一个正文段落 */
function splitHeading(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  const block = context.block;
  if (!block?.range || !block.leaf) return null;
  const { text, eol } = source;
  const { from, to } = selectionRange(source);
  const contentStart = block.leaf.starts[0];
  const contentEnd = contentStart + block.node.textContent.length;
  if (from < contentStart || to > contentEnd) return null;
  const lineStart = lineAt(text, block.range.start).start;
  const quote = quotePrefix(text.slice(lineStart, contentStart));
  const quoteText = quote?.normalized ?? "";
  const separator = quoteText ? eol + quoteText.trimEnd() + eol : eol + eol;
  const emptyLine = quoteText ? quoteText.trimEnd() : "";
  const left = text.slice(contentStart, from);
  const right = text.slice(to, contentEnd);
  const content = left + right;
  if (block.node.attrs.setext && Number(block.node.attrs.level) <= 2) {
    // Setext：标题行（可能在引用里）+ 下划线
    const headingEnd = block.range.end;
    const titleLineEnd = lineAt(text, contentEnd).end;
    const titlePrefix = text.slice(lineStart, contentStart);
    const titleSuffix = text.slice(contentEnd, titleLineEnd);
    const underline = text.slice(lineAt(text, headingEnd).start, headingEnd);
    const build = (title: string) => titlePrefix + title + titleSuffix + eol + underline;
    let replacement: string;
    let cursor: number;
    if (left.length === 0) {
      replacement = emptyLine + separator + build(content);
      cursor = lineStart + emptyLine.length;
    } else if (left.length === content.length) {
      replacement = build(content) + separator + quoteText;
      cursor = lineStart + replacement.length;
    } else {
      const first = build(left);
      replacement = first + separator + build(right);
      cursor = lineStart + first.length + separator.length + titlePrefix.length;
    }
    return cursorAt(text.slice(0, lineStart) + replacement + text.slice(headingEnd), cursor);
  }
  const lineEnd = lineAt(text, contentEnd).end;
  const opening = text.slice(lineStart, contentStart);
  const closing = text.slice(contentEnd, lineEnd);
  const current = opening + content + closing;
  let replacement: string;
  let cursor: number;
  if (left.length === 0) {
    replacement = emptyLine + separator + current;
    cursor = lineStart + emptyLine.length;
  } else if (left.length === content.length) {
    replacement = current + separator + quoteText;
    cursor = lineStart + replacement.length;
  } else {
    const first = opening + left + closing;
    replacement = first + separator + opening + right + closing;
    cursor = lineStart + first.length + separator.length + opening.length;
  }
  return cursorAt(text.slice(0, lineStart) + replacement + text.slice(lineEnd), cursor);
}

// ---------------------------------------------------------------------------

/** 有选区时先删掉选区（只在同一个文本块、或同一个列表 / 引用里时） */
function deleteSelectionFirst(env: EnterEnv): EnterEnv | null {
  const { source, context } = env;
  if (collapsed(source)) return env;
  const { from, to } = selectionRange(source);
  if (!context.sameBlock) {
    // 跨行的选区只在同一个列表、引用里时先删
    const container = nearest(context, "bulletList", "orderedList", "blockquote");
    if (!container?.range || from < container.range.start || to > container.range.end) return null;
  }
  const text = source.text.slice(0, from) + source.text.slice(to);
  return { ...env, source: { ...source, text, anchor: from, head: from } };
}

/** 缩进代码里回车：下一行写同样的前缀和缩进（缩进代码的末尾不能有空行，按源码改） */
function indentedCodeNewline(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  const block = context.block;
  if (block?.node.type.name !== "codeBlock" || !block.node.attrs.indented || !block.leaf) return null;
  const line = lineAt(source.text, source.head);
  const start = block.leaf.starts[lineIndexInBlock(block, source.head)] ?? line.start;
  return insertAtSelection(source, source.eol + source.text.slice(line.start, Math.max(line.start, start)));
}

/** 普通的回车 */
function plainEnter(env: EnterEnv): SourceResult | null {
  const indented = indentedCodeNewline(env);
  if (indented) return indented;
  const next = deleteSelectionFirst(env);
  if (!next) return null;
  const deleted = next !== env;
  const chain = [
    completeFence,
    completeFrontMatter,
    continueQuotedList,
    continueList,
    continueListContinuation,
    continueDefinition,
    continueFootnote,
    exitEmptyHeading,
    completeTableShortcut,
    continueTableRow,
    continueBlockquote,
    completeHorizontalRule,
  ];
  for (const step of chain) {
    const result = step(next);
    if (result) return result;
  }
  // 拆段不先删选区（选区换成空行）
  return splitParagraph(deleted ? env : next);
}

/**
 * 回车的处理顺序同旧版：代码块等的边界 → Front Matter → Ctrl+回车在容器里拆段 → Shift+回车软换行 → 普通回车。
 * 返回 null 时按默认处理（插入换行）
 */
export function enterResult(source: SourceSnapshot, context: CursorContext, settings: EditorSettings, modifiers: EnterModifiers): SourceResult | null {
  const env: EnterEnv = { source, context, settings };
  const raw = rawBlockAt(source, context);
  if (raw && !modifiers.alt) {
    const result = rawBlockEnter(source, raw, modifiers);
    if (result) return result;
  }
  const frontMatter = frontMatterEnter(env, modifiers);
  if (frontMatter) return frontMatter;
  if (modifiers.primary && !modifiers.shift && !modifiers.alt) {
    const result = splitContainerParagraph(env);
    if (result) return result;
  }
  if (modifiers.shift) return softBreak(env);
  if (modifiers.primary || modifiers.alt) return null;
  return plainEnter(env);
}

// ---------------------------------------------------------------------------
// Front Matter 里的回车

function frontMatterEnter(env: EnterEnv, modifiers: EnterModifiers): SourceResult | null {
  const { source, context } = env;
  if (blockType(context) !== "frontMatter" || !context.block?.leaf || !context.block.range) return null;
  const { text, eol } = source;
  const { leaf, range } = context.block;
  const lines = leaf.lines;
  const last = lines.length - 1;
  const contentStart = leaf.starts[0];
  const logicalEnd = leaf.starts[last] + lines[last].length;
  const { from, to } = selectionRange(source);
  if (logicalEnd < contentStart || from < contentStart || to > logicalEnd) return null;
  const canExit = !modifiers.primary && !modifiers.shift && !modifiers.alt;
  const trailingEmpty = lines.length >= 2 && lines[last] === "";
  if (collapsed(source) && canExit && source.head === logicalEnd && trailingEmpty) {
    const closingContentEnd = range.end;
    const closingEnd = text.startsWith(eol, closingContentEnd) ? closingContentEnd + eol.length : text.startsWith("\n", closingContentEnd) ? closingContentEnd + 1 : closingContentEnd;
    if (closingEnd > closingContentEnd) {
      const afterBreak = text.slice(closingEnd);
      if (!afterBreak || afterBreak.startsWith(eol)) return cursorAt(text, closingEnd);
      return cursorAt(text.slice(0, closingEnd) + eol + afterBreak, closingEnd);
    }
    return cursorAt(text.slice(0, closingContentEnd) + eol + text.slice(closingContentEnd), closingContentEnd + eol.length);
  }
  return insertAtSelection(source, eol);
}

// ---------------------------------------------------------------------------
// Ctrl+回车：在列表项、引用里另起一段（不新建列表项）

function splitContainerParagraph(env: EnterEnv): SourceResult | null {
  const { source, context } = env;
  const { from, to } = selectionRange(source);
  if (source.text.slice(from, to).includes("\n")) return null;
  const type = blockType(context);
  if (type !== "paragraph" && type !== "heading") return null;
  const { text, eol } = source;
  const line = lineAt(text, from);
  const lineText = text.slice(line.start, line.end);
  const quote = quotePrefix(lineText);
  const quoteLength = quote?.raw.length ?? 0;
  const quoteText = quote?.normalized ?? "";
  const separator = quoteText ? eol + quoteText.trimEnd() + eol : eol + eol;
  const list = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/.exec(lineText.slice(quoteLength));
  let contentStart: number;
  let continuation: string;
  if (list && onListMarkerLine(env, from)) {
    const markerWidth = list[2].length + list[3].length + (list[4]?.length ?? 0);
    contentStart = line.start + quoteLength + list[0].length;
    continuation = quoteText + list[1] + " ".repeat(markerWidth);
  } else if (quote && inside(context, "blockquote", "alert")) {
    contentStart = line.start + quote.raw.length;
    continuation = quoteText;
  } else {
    return null;
  }
  if (from < contentStart || to > line.end) return null;
  const insertion = separator + continuation;
  return cursorAt(text.slice(0, from) + insertion + text.slice(to), from + insertion.length);
}

// ---------------------------------------------------------------------------
// Shift+回车：硬换行（行尾两个空格），下一行续写容器的缩进

function softBreak(env: EnterEnv): SourceResult {
  const { source, context } = env;
  const { eol } = source;
  if (blockType(context) !== null && ["codeBlock", "diagram", "mathBlock", "htmlBlock", "frontMatter"].includes(blockType(context) ?? "")) {
    return insertAtSelection(source, eol);
  }
  const { from } = selectionRange(source);
  const line = lineAt(source.text, from);
  const before = source.text.slice(line.start, from);
  return insertAtSelection(source, `  ${eol}${softBreakContinuation(env, before, from)}`);
}

function softBreakContinuation(env: EnterEnv, before: string, offset: number): string {
  const { context } = env;
  const quote = quotePrefix(before);
  const rest = quote ? before.slice(quote.raw.length) : before;
  const quoteText = quote?.normalized ?? "";
  const list = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(rest);
  if (list && onListMarkerLine(env, offset)) return `${quoteText}${list[1]}${" ".repeat(list[2].length + 1 + (list[3]?.length ?? 0))}`;
  const definition = /^([ \t]{0,3}):(?:[ \t]+|$)/.exec(rest);
  if (definition && inside(context, "definitionDescription")) return `${quoteText}${definition[1]}  `;
  if (/^([ \t]{0,3})\[\^[^\]\r\n]*[^\]\s\r\n][^\]\r\n]*]:[ \t]*/.test(rest) && inside(context, "footnoteDefinition")) return `${quoteText}    `;
  // 续行：列表项、定义说明、脚注定义里沿用这一行的缩进
  const continuation = /^((?:[ \t]{2,}|\t))(.*)$/.exec(rest);
  if (continuation && inside(context, "listItem", "definitionDescription")) return `${quoteText}${continuation[1]}`;
  const footnote = /^((?: {4,}| {0,3}\t))(.*)$/.exec(rest);
  if (footnote && inside(context, "footnoteDefinition")) return `${quoteText}${footnote[1]}`;
  return quoteText;
}

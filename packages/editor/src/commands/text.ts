// 按源码改动的命令共用的小工具：行、引用前缀、缩进列数、有序列表序号、在选区处插入

/** 命令看到的源码（source.ts 的 readSource 给出）：整篇和选区（anchor、head 是源码偏移） */
export interface SourceState {
  text: string;
  anchor: number;
  head: number;
  /** 新写的行用的换行符（文档的） */
  eol: string;
}

/** 命令的结果：改好的整篇源码和新选区（source.ts 的 applySource 应用） */
export interface SourceResult {
  text: string;
  anchor: number;
  head: number;
  /** 行内改动（行内样式、链接、自动配对……）：只改一个文本块里一行的文字时直接改，不重新解析整块 */
  inline?: boolean;
}

/** 选区的两端，前小后大 */
export function selectionRange(state: SourceState): { from: number; to: number } {
  return { from: Math.min(state.anchor, state.head), to: Math.max(state.anchor, state.head) };
}

/** 光标收成一点 */
export function collapsed(state: SourceState): boolean {
  return state.anchor === state.head;
}

export function cursorAt(text: string, offset: number): SourceResult {
  return { text, anchor: offset, head: offset };
}

/** offset 所在的行：start 到 end（不含换行符，CRLF 的 \r 也不含），next 是下一行的开头 */
export interface LineRange {
  start: number;
  end: number;
  next: number;
}

/** offset 所在行的开头（offset 为 0 时 lastIndexOf 会匹配到下标 0 的换行，要单独处理） */
export function lineStartOf(text: string, offset: number): number {
  return offset <= 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1;
}

export function lineAt(text: string, offset: number): LineRange {
  const start = lineStartOf(text, offset);
  const newline = text.indexOf("\n", offset);
  const rawEnd = newline < 0 ? text.length : newline;
  const end = rawEnd > start && text[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
  return { start, end, next: newline < 0 ? text.length : newline + 1 };
}

/** 分隔线的写法（三个以上同样的 -、*、_，中间可以有空格） */
export const THEMATIC_BREAK = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;

/**
 * 源码里的一行去掉引用、有序列表的标记以后像分隔线；无序列表的标记留着一起看（嵌套列表 `* * *` 是分隔线，E-4）。
 * 缩进只认分隔线本身允许的三个空格以内：制表符、四个空格起是缩进代码或段落的续行
 */
export function looksLikeThematicBreak(line: string): boolean {
  return THEMATIC_BREAK.test(line.replace(/\r$/, "").replace(/^(?: {0,3}(?:>|\d{1,9}[.)])[ \t]?)*/, ""));
}

/** 行首到 offset（含 \r 时不含） */
export function beforeOnLine(text: string, offset: number): string {
  return text.slice(lineAt(text, offset).start, offset);
}

/** offset 到行尾 */
export function afterOnLine(text: string, offset: number): string {
  return text.slice(offset, Math.max(offset, lineAt(text, offset).end));
}

/** 把 \n、\r\n、\r 都换成 eol */
export function normalizeBreaks(text: string, eol: string): string {
  return text.replace(/\r\n|\r|\n/g, eol);
}

/** 用 text 替换选区，光标放在插入的文字后面 */
export function insertAtSelection(state: SourceState, insert: string): SourceResult {
  const { from, to } = selectionRange(state);
  const value = normalizeBreaks(insert, state.eol);
  return cursorAt(state.text.slice(0, from) + value + state.text.slice(to), from + value.length);
}

/** 替换 [from, to)，光标放在 cursor（替换后的偏移） */
export function replaceRange(text: string, from: number, to: number, insert: string, cursor = from + insert.length): SourceResult {
  return cursorAt(text.slice(0, from) + insert + text.slice(to), cursor);
}

// ---------------------------------------------------------------------------
// 缩进和引用前缀

/** 从 startColumn 列开始写 value 之后到了第几列（Tab 按 4 列对齐） */
export function columnAfter(value: string, startColumn = 0): number {
  let column = Math.max(0, Math.trunc(startColumn));
  for (const character of value) column += character === "\t" ? 4 - (column % 4) : 1;
  return column;
}

export function indentWidth(value: string): number {
  return columnAfter(value);
}

export function leadingIndent(value: string): string {
  return /^[ \t]*/.exec(value)?.[0] ?? "";
}

export interface QuotePrefix {
  /** 行首这段引用前缀的原文 */
  raw: string;
  /** 规范写法：开头的空白加上每层一个 `> ` */
  normalized: string;
  depth: number;
  /** 前缀之后内容的列 */
  contentColumn: number;
}

/** 行首的引用前缀（`>` 前最多 3 列空白，`>` 后面可以有一个空白）；maximumDepth 限制最多读几层 */
export function quotePrefix(line: string, maximumDepth: number | null = null): QuotePrefix | null {
  let cursor = 0;
  let depth = 0;
  let column = 0;
  while (maximumDepth === null || depth < maximumDepth) {
    const marker = /^([ \t]*)>/.exec(line.slice(cursor));
    if (!marker) break;
    const leadingColumn = columnAfter(marker[1] ?? "", column);
    if (leadingColumn - column > 3) break;
    cursor += marker[0].length;
    column = leadingColumn + 1;
    if (line[cursor] === " " || line[cursor] === "\t") {
      column = columnAfter(line[cursor], column);
      cursor += 1;
    }
    depth += 1;
  }
  if (!depth) return null;
  const raw = line.slice(0, cursor);
  return { raw, normalized: `${leadingIndent(raw)}${"> ".repeat(depth)}`, depth, contentColumn: column };
}

/** 规范的引用前缀以空格结尾 */
export function normalizeQuote(value: string): string {
  return value.endsWith(" ") ? value : `${value} `;
}

// ---------------------------------------------------------------------------
// 有序列表的序号（任意位数）

const DECIMAL = /^\d+$/;

/** 去掉前导 0 */
export function normalizeNumber(value: string): string {
  if (!DECIMAL.test(value)) return value;
  return value.replace(/^0+(?=\d)/, "") || "0";
}

/** 序号加一（按十进制字符串算，不受位数限制） */
export function incrementNumber(value: string): string {
  const normalized = normalizeNumber(value);
  if (!DECIMAL.test(normalized)) return value;
  const digits = normalized.split("");
  let carry = 1;
  for (let index = digits.length - 1; index >= 0 && carry > 0; index -= 1) {
    const next = digits[index].charCodeAt(0) - 48 + carry;
    digits[index] = String(next % 10);
    carry = next >= 10 ? 1 : 0;
  }
  if (carry > 0) digits.unshift("1");
  return digits.join("");
}

/** 序号减一，到 0 为止 */
export function decrementNumber(value: string): string {
  const normalized = normalizeNumber(value);
  if (!DECIMAL.test(normalized) || normalized === "0") return normalized;
  const digits = normalized.split("");
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    if (digits[index] !== "0") {
      digits[index] = String(digits[index].charCodeAt(0) - 49);
      break;
    }
    digits[index] = "9";
  }
  return normalizeNumber(digits.join(""));
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

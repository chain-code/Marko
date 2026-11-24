// 文档模型 → 源码（1.5.4 节）：没改过的块照抄原文；改过的块按写法属性重新生成，块里没改的行沿用原来的前缀；
// 新建的块用默认写法
import { countColumns } from "./lines.ts";
import {
  blockChildren,
  DESCRIPTION_PREFIX,
  FOOTNOTE_PREFIX,
  getOrigin,
  isBlankParagraph,
  isContainer,
  leafSignature,
  nodeText,
  type MdNode,
  type Origin,
  QUOTE_PREFIX,
  type TableAlign,
} from "./model.ts";
import type { TableRowSyntax } from "./parse.ts";

export interface SerializeOptions {
  /** 保存时末尾补一个换行（S-3） */
  finalNewline?: boolean;
  /** 开头写不写 BOM：默认按文档的 bom 属性（文件内容）。编辑器内部的源码不带它（BOM 不是能编辑的内容） */
  bom?: boolean;
  /** 每个叶子块（含表格单元格）每行内容在输出里的起点（positions.ts 用） */
  onLeaf?: (node: MdNode, lineStarts: number[]) => void;
  /**
   * 这些空段落照常输出（一个空行）。空段落平时不输出；编辑器里光标在空段落上时，
   * 要它有个位置（行为规格的比对、切换源码模式）
   */
  keepBlank?: ReadonlySet<MdNode>;
  /** 每个输出了的块：块前空行的起点、块的起点和终点（editor 包按源码改动时用） */
  onBlock?: (node: MdNode, gapStart: number, start: number, end: number) => void;
  /** 容器里子块每行的规范前缀（续行的写法；editor 包判断空行属于哪个容器用） */
  onContainer?: (node: MdNode, innerPrefix: string, contentStart: number) => void;
}

interface Ctx {
  /** 续行的前缀（所有外层容器的规范写法拼起来），也用来比对出身 */
  prefix: string;
  eol: string;
  /** 在紧凑列表的列表项里：子块之间尽量不空行，否则列表会变松散 */
  tight?: boolean;
}

class Writer {
  private readonly parts: string[] = [];
  readonly options: SerializeOptions;
  length = 0;
  /**
   * 刚写过一个光标占位空段落（Origin.placeholder）：它的 before 是后面紧接着那段块前空行（或容器结尾）的开头，
   * 那段要去掉这部分（它已经写过了）；占位段落里已经输入了内容时（filled），后面那段块前空行按新的块重新生成
   */
  private carved: { text: string; filled: boolean } | null = null;

  constructor(options: SerializeOptions) {
    this.options = options;
  }

  write(text: string): void {
    if (!text) return;
    this.carved = null;
    this.parts.push(text);
    this.length += text.length;
  }

  /** 块前空行、容器结尾的原文；regenerate 给出重新生成的块前空行（容器结尾没有） */
  gap(text: string, regenerate?: () => string): void {
    const carved = this.carved;
    // 空的容器结尾不算：占位段落后面那段空白在更外层
    if (!carved || (!text && !regenerate)) {
      this.write(text);
      return;
    }
    this.carved = null;
    if (!text.startsWith(carved.text)) this.write(text);
    else if (carved.filled && regenerate) this.write(regenerate());
    else this.write(text.slice(carved.text.length));
  }

  carve(text: string, filled: boolean): void {
    this.carved = { text, filled };
  }

  toString(): string {
    return this.parts.join("");
  }
}

function attr<T>(node: MdNode, name: string, fallback: T): T {
  const value = node.attrs?.[name];
  return value === undefined || value === null ? fallback : (value as T);
}

function blankPrefix(prefix: string): string {
  return prefix.replace(/[ \t]+$/, "");
}

/** 出身能不能直接用：同一个容器语境 */
function originFits(origin: Origin | undefined, ctx: Ctx): origin is Origin {
  return origin !== undefined && origin.ctx === ctx.prefix;
}

export function serialize(doc: MdNode, options: SerializeOptions = {}): string {
  const writer = new Writer(options);
  const origin = getOrigin(doc);
  const ctx: Ctx = { prefix: "", eol: attr(doc, "eol", "\n") };
  const bom = options.bom ?? attr(doc, "bom", false);
  if (bom) writer.write("\uFEFF");
  if (origin && blanksOnly(doc)) {
    // \u53EA\u6709\u7A7A\u6BB5\u843D\u7684\u6587\u6863\uFF08\u7A7A\u6587\u4EF6\u3001\u53EA\u6709\u7A7A\u884C\uFF09\uFF1A\u5149\u6807\u5728\u672B\u5C3E
    writer.gap(origin.tail ?? "");
    placeBlanks(writer, doc);
  } else {
    writeChildren(writer, doc, ctx, "");
    writer.gap(origin?.tail ?? "");
  }
  let text = writer.toString();
  if (options.finalNewline && text.length > (bom ? 1 : 0) && !/[\r\n]$/.test(text)) text += ctx.eol;
  return text;
}

/**
 * 序列化文档里第 from 到 to（不含）个顶层块（reconcile.ts 用），连同第一个块前面的空行；
 * 和整篇序列化时这一段的输出完全相同。tail：到了文档末尾时接着写文档末尾的空行（同一个 writer 里写：
 * 最后一块是光标占位段落时，它的块前空行是从这段空行里切出来的，分开拼就多了一遍）
 */
export function serializeRange(doc: MdNode, from: number, to: number, includeFirstGap = true, tail?: string): string {
  const writer = new Writer({});
  const ctx: Ctx = { prefix: "", eol: attr(doc, "eol", "\n") };
  writeChildren(writer, doc, ctx, "", from, to, includeFirstGap);
  if (tail !== undefined) writer.gap(tail);
  return writer.toString();
}

// ---------------------------------------------------------------------------

/** 不空行也能接在段落后面的块（能打断段落的） */
function interruptsParagraph(node: MdNode): boolean {
  switch (node.type) {
    case "heading":
      return !attr(node, "setext", false);
    case "codeBlock":
      return !attr(node, "indented", false);
    case "diagram":
    case "mathBlock":
    case "blockquote":
    case "alert":
    case "bulletList":
    case "horizontalRule":
      return true;
    case "orderedList":
      return attr(node, "start", 1) === 1;
    default:
      return false;
  }
}

/** 紧凑列表项里两个子块之间能不能只换行不空行 */
function canTouch(previous: MdNode, next: MdNode): boolean {
  switch (previous.type) {
    // 以段落结尾的块：后面的块要能打断段落，否则会被当成懒惰续行
    case "paragraph":
    case "blockquote":
    case "alert":
      return interruptsParagraph(next);
    case "heading":
    case "diagram":
    case "mathBlock":
    case "horizontalRule":
      return true;
    case "codeBlock":
      return !attr(previous, "indented", false) || next.type !== "paragraph";
    default:
      return false;
  }
}

function separator(parent: MdNode, ctx: Ctx, previous: MdNode, next: MdNode): string {
  const { eol, prefix } = ctx;
  const blank = eol + blankPrefix(prefix) + eol + prefix;
  switch (parent.type) {
    case "bulletList":
    case "orderedList":
      return attr(parent, "tight", true) ? eol + prefix : blank;
    case "definitionList":
      return eol + prefix;
    default:
      return ctx.tight && canTouch(previous, next) ? eol + prefix : blank;
  }
}

/** 不输出的空段落（keepBlank 里的除外） */
function skipped(writer: Writer, node: MdNode): boolean {
  return isBlankParagraph(node) && !writer.options.keepBlank?.has(node);
}

function writeChildren(writer: Writer, parent: MdNode, ctx: Ctx, firstGap: string, from = 0, to = Infinity, includeFirstGap = true): void {
  const items = blockChildren(parent);
  // 没有出身的节点后面那个兄弟一定重新生成块前空行
  const idOf = (node: MdNode | undefined): number | undefined => (node ? getOrigin(node)?.id : 0);
  let previous: MdNode | undefined;
  for (let i = from - 1; i >= 0 && !previous; i -= 1) if (!skipped(writer, items[i])) previous = items[i];
  let previousId: number | undefined = previous ? idOf(previous) : 0;
  let lastIndex = items.length - 1;
  while (lastIndex >= 0 && skipped(writer, items[lastIndex])) lastIndex -= 1;
  let first = true;
  for (let index = from; index < Math.min(items.length, to); index += 1) {
    const child = items[index];
    if (skipped(writer, child)) continue;
    const origin = getOrigin(child);
    const regenerate = (after: MdNode | undefined) => () => (after ? separator(parent, ctx, after, child) : firstGap);
    // 光标占位空段落：还空着时写在它在源码里的位置；输入了内容就是新段落，块前空行重新生成
    const placeholder = origin?.placeholder === true && origin.prevId === previousId;
    const blank = isBlankParagraph(child);
    let gap: string;
    if (placeholder && blank) gap = origin.before;
    else if (!placeholder && originFits(origin, ctx) && origin.prevId === previousId) gap = origin.before;
    else gap = regenerate(previous)();
    const gapStart = writer.length;
    if (includeFirstGap || !first) writer.gap(gap, regenerate(previous));
    const start = writer.length;
    writeNode(writer, child, ctx, parent, index, index === lastIndex);
    writer.options.onBlock?.(child, gapStart, start, writer.length);
    previous = child;
    if (placeholder) writer.carve(origin.before, !blank);
    // 占位段落不算「前一个兄弟」：后面的块还认原来那个，块前空行照旧
    else previousId = idOf(child);
    first = false;
  }
}

function writeNode(writer: Writer, node: MdNode, ctx: Ctx, parent: MdNode, index: number, isLast: boolean): void {
  if (isContainer(node.type)) {
    writeContainer(writer, node, ctx, parent, index);
    return;
  }
  const origin = getOrigin(node);
  if (originFits(origin, ctx) && origin.src !== undefined && (!origin.stale || origin.sig === leafSignature(node))) {
    const start = writer.length;
    writer.write(origin.src);
    // 没有内容行的代码块（只有围栏）：内容的位置在开头那一行的末尾
    const offsets = origin.lineOffsets?.length ? origin.lineOffsets : [origin.lineOffsets ? firstLineEnd(origin.src) : 0];
    writer.options.onLeaf?.(node, offsets.map((offset) => start + offset));
    return;
  }
  writeLeaf(writer, node, ctx, isLast);
}

// ---------------------------------------------------------------------------
// 叶子块

function firstLineEnd(text: string): number {
  const match = /\r\n|\r|\n/.exec(text);
  return match ? match.index : text.length;
}

/**
 * 改过的叶子块每一行的前缀：和原来相同的开头几行、结尾几行沿用原来的前缀，其余用规范前缀。
 * defaults[i] 是第 i 行的规范前缀
 */
function linePrefixes(origin: Origin | undefined, ctx: Ctx, lines: string[], defaults: string[]): string[] {
  const result = defaults.slice();
  if (!originFits(origin, ctx) || !origin.lines?.length) return result;
  const old = origin.lines;
  let head = 0;
  while (head < old.length && head < lines.length && old[head].text === lines[head]) {
    result[head] = old[head].prefix;
    head += 1;
  }
  let tail = 0;
  while (tail < old.length - head && tail < lines.length - head && old[old.length - 1 - tail].text === lines[lines.length - 1 - tail]) {
    result[lines.length - 1 - tail] = old[old.length - 1 - tail].prefix;
    tail += 1;
  }
  // 中间改过的行数没变时（在行内改字），逐行沿用原来的前缀；
  // 但前缀以 `>` 结尾（没有空格）而这一行以空白开头时不行：那个空白会被当成前缀的一部分
  if (old.length - head - tail === lines.length - head - tail) {
    for (let i = head; i < lines.length - tail; i += 1) {
      const prefix = old[i].prefix;
      if (/[^ \t]$/.test(prefix) && /^[ \t]/.test(lines[i])) continue;
      result[i] = prefix;
    }
  }
  return result;
}

function defaultPrefix(ctx: Ctx, line: string, extra = ""): string {
  return line === "" ? blankPrefix(ctx.prefix) : ctx.prefix + extra;
}

/** 段落类：第一行接在块前原文后面，后面各行带前缀 */
/** 像 Setext 下划线的 `===` 行：在容器里只能写成懒惰续行才还是段落（懒惰续行不能当下划线） */
const EQUALS_LINE = /^ {0,3}=+[ \t]*$/;

function writeTextLines(writer: Writer, node: MdNode, ctx: Ctx, lead: string, text: string, starts: number[]): void {
  const origin = getOrigin(node);
  const lines = text.split("\n");
  const defaults = lines.map((line) => (node.type === "paragraph" && EQUALS_LINE.test(line) ? "" : defaultPrefix(ctx, line)));
  const prefixes = linePrefixes(origin, ctx, lines, defaults);
  writer.write(lead);
  starts.push(writer.length);
  writer.write(lines[0]);
  for (let i = 1; i < lines.length; i += 1) {
    writer.write(ctx.eol);
    writer.write(prefixes[i]);
    starts.push(writer.length);
    writer.write(lines[i]);
  }
}

/** 代码类的内容行：每行都另起一行，带前缀和围栏的缩进 */
function writeContentLines(writer: Writer, node: MdNode, ctx: Ctx, text: string, extraIndent: string, starts: number[]): void {
  if (text === "") return;
  const origin = getOrigin(node);
  const lines = text.split("\n");
  const prefixes = linePrefixes(origin, ctx, lines, lines.map((line) => defaultPrefix(ctx, line, extraIndent)));
  for (let i = 0; i < lines.length; i += 1) {
    writer.write(ctx.eol);
    writer.write(prefixes[i]);
    starts.push(writer.length);
    writer.write(lines[i]);
  }
}

/** 围栏要比内容里任何一行开头的同种字符更长，否则会被提前闭合 */
function safeFence(fence: string, text: string): string {
  const char = fence[0];
  let longest = 0;
  // 只有「围栏字符 + 空白」的行才会闭合围栏（结尾围栏不能带信息串）
  const pattern = char === "`" ? /^ {0,3}(`{3,})[ \t]*$/gm : /^ {0,3}(~{3,})[ \t]*$/gm;
  for (const match of text.matchAll(pattern)) longest = Math.max(longest, match[1].length);
  return longest >= fence.length ? char.repeat(longest + 1) : fence;
}

function spacesFor(indent: string): string {
  return " ".repeat(countColumns(indent, 0, indent.length));
}

function writeLeaf(writer: Writer, node: MdNode, ctx: Ctx, isLast: boolean): void {
  const text = nodeText(node);
  const starts: number[] = [];
  const indent = attr(node, "indent", "");
  switch (node.type) {
    case "paragraph":
    case "referenceDefinition":
    case "abbreviationDefinition":
    case "definitionTerm":
    case "htmlBlock":
    case "tableHeader":
    case "tableCell":
      writeTextLines(writer, node, ctx, indent, text, starts);
      break;
    case "heading":
      writeHeading(writer, node, ctx, text, starts);
      break;
    case "codeBlock":
    case "diagram":
      if (attr(node, "indented", false)) writeIndentedCode(writer, node, ctx, text, starts);
      else writeFencedCode(writer, node, ctx, text, isLast, starts);
      break;
    case "mathBlock": {
      const open = attr(node, "open", "$$");
      writer.write(indent + open);
      writeContentLines(writer, node, ctx, text, spacesFor(indent), starts);
      const close = attr<string | null>(node, "close", null);
      if (close !== null) writer.write(ctx.eol + ctx.prefix + close);
      else if (!keepsUnclosed(node, ctx, isLast)) writer.write(ctx.eol + ctx.prefix + indent + (open.startsWith("\\[") ? "\\]" : "$$"));
      break;
    }
    case "frontMatter":
      writer.write(attr(node, "open", "---"));
      writeContentLines(writer, node, ctx, text, "", starts);
      writer.write(ctx.eol + attr(node, "close", "---"));
      break;
    case "toc":
      writer.write(indent + attr(node, "markup", "[TOC]"));
      break;
    case "horizontalRule":
      writer.write(indent + attr(node, "markup", "---"));
      break;
    default:
      throw new Error(`不认识的叶子块：${node.type}`);
  }
  if (!starts.length) starts.push(writer.length);
  writer.options.onLeaf?.(node, starts);
}

function writeHeading(writer: Writer, node: MdNode, ctx: Ctx, text: string, starts: number[]): void {
  const level = Math.min(6, Math.max(1, attr(node, "level", 1)));
  const indent = attr(node, "indent", "");
  if (attr(node, "setext", false) && level <= 2) {
    writeTextLines(writer, node, ctx, indent, text, starts);
    const underline = attr(node, "underline", "");
    const char = level === 1 ? "=" : "-";
    const fits = underline.trim().length > 0 && underline.trim()[0] === char;
    writer.write(ctx.eol + ctx.prefix + (fits ? underline : char.repeat(3)));
    return;
  }
  const line = text.replace(/\n/g, " ");
  let openSpacing = attr(node, "openSpacing", "");
  if (line && !openSpacing) openSpacing = " ";
  let closing = attr(node, "setext", false) ? "" : attr(node, "closing", "");
  if (line && closing && !/^[ \t]/.test(closing)) closing = " " + closing;
  writer.write(indent + "#".repeat(level) + openSpacing);
  starts.push(writer.length);
  writer.write(line + closing);
}

function writeFencedCode(writer: Writer, node: MdNode, ctx: Ctx, text: string, isLast: boolean, starts: number[]): void {
  const origin = getOrigin(node);
  const indent = attr(node, "indent", "");
  const info = attr(node, "info", "");
  const requested = attr(node, "fence", "```") || "```";
  const fence = safeFence(requested, text);
  const extra = originFits(origin, ctx) ? origin.extra : undefined;
  const sameOpening = extra && extra.fence === fence && extra.info === info && typeof extra.openLine === "string";
  writer.write(indent + (sameOpening ? (extra.openLine as string) : fence + info));
  writeContentLines(writer, node, ctx, text, spacesFor(indent), starts);
  const closing = attr<string | null>(node, "closing", null);
  if (closing !== null && fence === requested) writer.write(ctx.eol + ctx.prefix + closing);
  else if (closing !== null || !keepsUnclosed(node, ctx, isLast)) writer.write(ctx.eol + ctx.prefix + indent + fence);
}

/**
 * 原文里没有结尾围栏的块（到容器结束为止）：还是容器里最后一块时照旧不写结尾；
 * 新建的块（没有出身）、后面有了别的块时补上结尾，免得把后面的内容吞进去
 */
function keepsUnclosed(node: MdNode, ctx: Ctx, isLast: boolean): boolean {
  return isLast && originFits(getOrigin(node), ctx);
}

function writeIndentedCode(writer: Writer, node: MdNode, ctx: Ctx, text: string, starts: number[]): void {
  const origin = getOrigin(node);
  const lines = text.split("\n");
  const prefixes = linePrefixes(origin, ctx, lines, lines.map((line) => defaultPrefix(ctx, line, "    ")));
  const codeIndent = originFits(origin, ctx) && origin.lines?.[0]?.text === lines[0] ? String(origin.extra?.codeIndent ?? "    ") : "    ";
  writer.write(codeIndent);
  starts.push(writer.length);
  writer.write(lines[0]);
  for (let i = 1; i < lines.length; i += 1) {
    writer.write(ctx.eol);
    writer.write(prefixes[i]);
    starts.push(writer.length);
    writer.write(lines[i]);
  }
}

// ---------------------------------------------------------------------------
// 容器

/** 容器里只有空段落：解析时给空容器（`> `、`- `）放的占位段落，可能光标在里面 */
function blanksOnly(node: MdNode): boolean {
  const children = blockChildren(node);
  return children.length > 0 && children.every(isBlankParagraph);
}

/** 容器照原样写完以后，里面要输出的空段落（光标所在的）就在容器末尾：只记位置，不写东西 */
function placeBlanks(writer: Writer, node: MdNode): void {
  for (const child of blockChildren(node)) {
    if (!writer.options.keepBlank?.has(child)) continue;
    writer.options.onBlock?.(child, writer.length, writer.length, writer.length);
    writer.options.onLeaf?.(child, [writer.length]);
  }
}

function writeContainer(writer: Writer, node: MdNode, ctx: Ctx, parent: MdNode, index: number): void {
  const origin = getOrigin(node);
  const fits = originFits(origin, ctx);
  // 解析时是空的容器（tail 是它的全部原文，如 `> `）里有了内容：这段原文不再写，否则内容后面又跟一遍 `> `
  const tail = fits && (!origin.bodyTail || blanksOnly(node)) ? (origin.tail ?? "") : "";
  const extra = fits ? origin.extra : undefined;
  // 解析出来的空容器：照原文写，空段落不改变它的写法（光标占位段落在里面时除外：它写在自己的位置上）
  const empty = fits && blanksOnly(node) && !blockChildren(node).some((child) => getOrigin(child)?.placeholder && writer.options.keepBlank?.has(child));
  switch (node.type) {
    case "blockquote": {
      const inner = { ...ctx, prefix: ctx.prefix + QUOTE_PREFIX, tight: false };
      writer.options.onContainer?.(node, inner.prefix, writer.length);
      if (empty) {
        writer.gap(tail);
        placeBlanks(writer, node);
        return;
      }
      if (!blockChildren(node).some((child) => !skipped(writer, child)) && !fits) writer.write(">");
      writeChildren(writer, node, inner, QUOTE_PREFIX);
      writer.gap(tail);
      return;
    }
    case "alert": {
      const inner = { ...ctx, prefix: ctx.prefix + QUOTE_PREFIX, tight: false };
      const kind = attr(node, "kind", "note");
      const marker = attr(node, "marker", "");
      const markerFits = marker.toLowerCase() === `[!${kind}]`;
      if (extra && extra.marker === marker && markerFits) writer.write(String(extra.head));
      else writer.write(QUOTE_PREFIX + (markerFits ? marker : `[!${kind.toUpperCase()}]`));
      writer.options.onContainer?.(node, inner.prefix, writer.length);
      if (empty) {
        writer.gap(tail);
        placeBlanks(writer, node);
        return;
      }
      writeChildren(writer, node, inner, ctx.eol + inner.prefix);
      writer.gap(tail);
      return;
    }
    case "bulletList":
    case "orderedList":
      writeChildren(writer, node, ctx, "");
      writer.gap(tail);
      return;
    case "listItem":
      writeListItem(writer, node, ctx, parent, index, extra, tail, empty);
      return;
    case "footnoteDefinition": {
      const label = attr(node, "label", "");
      const spacing = attr<string>(node, "spacing", " ");
      const head = extra && typeof extra.head === "string" && extra.head.endsWith(`[^${label}]:${spacing}`) ? extra.head : `[^${label}]:${spacing}`;
      writer.write(head);
      writer.options.onContainer?.(node, ctx.prefix + FOOTNOTE_PREFIX, writer.length);
      if (empty) {
        writer.gap(tail);
        placeBlanks(writer, node);
        return;
      }
      // 冒号后面没有空白时内容从下一行开始
      const inner = { ...ctx, prefix: ctx.prefix + FOOTNOTE_PREFIX, tight: false };
      writeChildren(writer, node, inner, spacing === "" ? ctx.eol + inner.prefix : "");
      writer.gap(tail);
      return;
    }
    case "definitionList":
      writeChildren(writer, node, ctx, "");
      writer.gap(tail);
      return;
    case "definitionDescription": {
      // 冒号后面没有空白只在内容从下一行开始时成立（光标所在的空段落不是内容：空的说明照原来的写法）
      const first = blockChildren(node).find((child) => !isBlankParagraph(child));
      const firstBefore = first ? (getOrigin(first)?.before ?? "") : "";
      let spacing = attr<string | null>(node, "spacing", null) ?? " ";
      if (spacing === "" && first && !/^[^\S\r\n]*[\r\n]/.test(firstBefore)) spacing = " ";
      const head = `${attr(node, "indent", "")}:${spacing}`;
      writer.write(extra && extra.head === head ? String(extra.head) : head);
      writer.options.onContainer?.(node, ctx.prefix + DESCRIPTION_PREFIX, writer.length);
      if (empty) {
        writer.gap(tail);
        placeBlanks(writer, node);
        return;
      }
      writeChildren(writer, node, { ...ctx, prefix: ctx.prefix + DESCRIPTION_PREFIX, tight: false }, "");
      writer.gap(tail);
      return;
    }
    case "table":
      writeTable(writer, node, ctx, origin);
      return;
    case "doc":
      writeChildren(writer, node, ctx, "");
      writer.gap(tail);
      return;
    default:
      throw new Error(`不认识的容器：${node.type}`);
  }
}

/** 列表项内容的缩进列数：内容在第一行时到内容起点，否则符号后加一列（CommonMark） */
function contentIndentOf(head: string, hasFirstLineContent: boolean): number {
  const width = countColumns(head, 0, head.length);
  return hasFirstLineContent ? width : countColumns(head.replace(/[ \t]+$/, ""), 0, head.replace(/[ \t]+$/, "").length) + 1;
}

function markerFor(list: MdNode, index: number): string {
  if (list.type === "orderedList") {
    const items = blockChildren(list);
    // 新项接在前一项的序号后面
    let number = attr(list, "start", 1) + index;
    for (let i = index - 1; i >= 0; i -= 1) {
      const marker = items[i].attrs?.marker;
      if (typeof marker === "string" && /^\d+/.test(marker)) {
        number = Number.parseInt(marker, 10) + (index - i);
        break;
      }
    }
    return `${number}${attr(list, "delimiter", ".")}`;
  }
  return attr(list, "bullet", "-");
}

function writeListItem(
  writer: Writer,
  node: MdNode,
  ctx: Ctx,
  parent: MdNode,
  index: number,
  extra: Record<string, unknown> | undefined,
  tail: string,
  empty: boolean,
): void {
  const children = blockChildren(node);
  const indent = attr(node, "indent", "");
  const marker = attr<string | null>(node, "marker", null) ?? markerFor(parent, index);
  const checked = attr<boolean | null>(node, "checked", null);
  // spacing 为空表示符号单独占一行，内容从下一行开始（CommonMark 的「以空行开头的列表项」）
  const spacingAttr = attr<string | null>(node, "spacing", null);
  const nextLine = !empty && children.length > 0 && spacingAttr === "" && checked === null;
  const spacing =
    spacingAttr === null ? (children.length || checked !== null ? " " : "") : spacingAttr === "" && checked !== null ? " " : spacingAttr;
  const task = extra?.task as { checkChar: string; taskSpacing: string } | null | undefined;
  let taskText = "";
  if (checked !== null) {
    const originalChar = task?.checkChar;
    const char = originalChar !== undefined && (originalChar !== " ") === checked ? originalChar : checked ? "x" : " ";
    taskText = `[${char}]${task?.taskSpacing ?? " "}`;
  }
  const head = indent + marker + spacing + taskText;
  const markerHead = indent + marker + spacing;
  const contentIndent =
    extra && extra.head === head && typeof extra.contentIndent === "number" ? extra.contentIndent : contentIndentOf(markerHead, !nextLine);
  const inner: Ctx = { ...ctx, prefix: ctx.prefix + " ".repeat(contentIndent), tight: attr(parent, "tight", true) };
  writer.write(head);
  writer.options.onContainer?.(node, inner.prefix, writer.length);
  if (empty) {
    writer.gap(tail);
    placeBlanks(writer, node);
    return;
  }
  writeChildren(writer, node, inner, nextLine ? ctx.eol + inner.prefix : "");
  writer.gap(tail);
}

// 表格：没改过的行照抄；改过的行按表头行的写法重写；对齐和列数没变时分隔行照抄（T-7）

function alignCell(align: TableAlign): string {
  if (align === "center") return ":---:";
  if (align === "left") return ":---";
  if (align === "right") return "---:";
  return "---";
}

interface RowStyle {
  leadingPipe: boolean;
  trailingPipe: boolean;
}

/** 按表头行的写法拼一行：竖线两边各一个空格；只有一列时两头都要竖线，否则认不出是表格 */
function joinRow(cells: string[], style: RowStyle): { line: string; starts: number[] } {
  const lead = style.leadingPipe || cells.length <= 1;
  const trail = style.trailingPipe || cells.length <= 1;
  let line = lead ? "| " : "";
  const starts: number[] = [];
  cells.forEach((cell, i) => {
    if (i > 0) line += " | ";
    starts.push(line.length);
    line += cell;
  });
  if (trail) line += " |";
  return { line, starts };
}

function writeTable(writer: Writer, node: MdNode, ctx: Ctx, origin: Origin | undefined): void {
  const fits = originFits(origin, ctx);
  const rows = blockChildren(node);
  const align = attr<TableAlign[]>(node, "align", []);
  const style = (fits ? (origin.extra?.style as RowStyle | null) : null) ?? { leadingPipe: true, trailingPipe: true };
  const columns = Math.max(align.length, blockChildren(rows[0] ?? { type: "tableRow" }).length, 1);
  const delimiter = fits ? (origin.extra?.delimiter as { before: string; src: string; align: TableAlign[] } | null) : null;
  rows.forEach((row, rowIndex) => {
    const rowOrigin = getOrigin(row);
    const rowFits = originFits(rowOrigin, ctx);
    const gapStart = writer.length;
    if (rowIndex > 0) writer.write(rowFits ? rowOrigin.before : ctx.eol + ctx.prefix);
    const start = writer.length;
    writeRow(writer, row, rowFits ? rowOrigin : undefined, style);
    writer.options.onBlock?.(row, gapStart, start, writer.length);
    if (rowIndex === 0) {
      const sameDelimiter =
        delimiter && delimiter.align.length === columns && delimiter.align.every((value, i) => (align[i] ?? null) === value);
      if (sameDelimiter) writer.write(delimiter.before + delimiter.src);
      else {
        const cells = Array.from({ length: columns }, (_, i) => alignCell(align[i] ?? null));
        writer.write(ctx.eol + ctx.prefix + joinRow(cells, style).line);
      }
    }
  });
}

function writeRow(writer: Writer, row: MdNode, origin: Origin | undefined, style: RowStyle): void {
  const cells = blockChildren(row);
  const start = writer.length;
  if (origin && !origin.stale && origin.src !== undefined) {
    writer.write(origin.src);
    const syntax = origin.extra?.cells as TableRowSyntax["cells"] | undefined;
    // 原文里没有的格（这一行比表头短，解析时补的）落在行尾
    const end = start + origin.src.length;
    cells.forEach((cell, i) => {
      const cellStart = syntax?.[i] ? start + syntax[i].from : end;
      writer.options.onBlock?.(cell, cellStart, cellStart, syntax?.[i] ? start + syntax[i].to : end);
      writer.options.onLeaf?.(cell, [cellStart]);
    });
    return;
  }
  // 单元格里不能直接换行（T-2）
  const texts = cells.map((cell) => nodeText(cell).replace(/\n/g, "<br>"));
  const joined = joinRow(texts, style);
  writer.write(joined.line);
  cells.forEach((cell, i) => {
    const cellStart = start + joined.starts[i];
    writer.options.onBlock?.(cell, cellStart, cellStart, cellStart + texts[i].length);
    writer.options.onLeaf?.(cell, [cellStart]);
  });
}

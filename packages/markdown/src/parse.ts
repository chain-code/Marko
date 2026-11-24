// 源码 → 语法树 → 文档模型（1.5.1 节）。每个块登记出身：原文、块前的空行、所在容器（model.ts）
import type { SyntaxNode, Tree } from "@lezer/common";
import { countColumns, dominantEol, findColumn, LineIndex, normalizeLoneCarriageReturns } from "./lines.ts";
import {
  createOrigin,
  DESCRIPTION_PREFIX,
  FOOTNOTE_PREFIX,
  getOrigin,
  isBlankParagraph,
  leafSignature,
  makeContainer,
  makeLeaf,
  QUOTE_PREFIX,
  setOrigin,
  type BlockType,
  type DiagramKind,
  type LineOrigin,
  type MdNode,
  type TableAlign,
} from "./model.ts";
import {
  isDefinitionTermLine,
  isFrontMatterClosing,
  isFrontMatterOpening,
  isTocMarker,
  readAbbreviationDefinition,
  readAlertMarker,
  readDefinitionMarker,
  stripIndent,
} from "./syntax/blocks.ts";
import { blockParser, recordLineBases, resolveSyntax, type LineBases, type SyntaxOptions } from "./syntax/index.ts";
import { withMathScan } from "./syntax/math.ts";

export interface ParseOptions {
  syntax?: Partial<SyntaxOptions>;
  /** 开头的 `---` 是否可以是 Front Matter；重新解析文档中间的一段时要关掉（reconcile.ts） */
  frontMatter?: boolean;
  /** 原文里没有换行时（新文档、只有一行）文档用的换行符（E-1：S-3「默认换行符」）；有换行时用出现最多的那种 */
  eol?: "\n" | "\r\n";
}

const BLOCK_NODES = new Set([
  "Paragraph",
  "Task",
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
  "SetextHeading1",
  "SetextHeading2",
  "FencedCode",
  "CodeBlock",
  "MathBlock",
  "HTMLBlock",
  "CommentBlock",
  "ProcessingInstructionBlock",
  "LinkReference",
  "HorizontalRule",
  "Table",
  "Blockquote",
  "BulletList",
  "OrderedList",
  "ListItem",
  "FootnoteDefinition",
]);

/** 一次解析的输入：被解析的文字，以及它到整篇原文的换算（定义列表的说明是单独解析的一段） */
class Source {
  readonly text: string;
  readonly bases: LineBases;
  /** text 里的偏移 → 整篇原文里的偏移 */
  readonly toDoc: (offset: number) => number;
  readonly lines: LineIndex;

  constructor(text: string, bases: LineBases, toDoc: (offset: number) => number) {
    this.text = text;
    this.bases = bases;
    this.toDoc = toDoc;
    this.lines = new LineIndex(text);
  }

  /** 第 line 行在 depth 层容器里的内容起点（没记录时取更外一层的） */
  base(line: number, depth: number): number {
    const start = this.lines.start(line);
    const entry = this.bases.get(start);
    if (!entry) return start;
    let best = -1;
    let value = 0;
    for (const [recorded, base] of entry) {
      if (recorded <= depth && recorded > best) {
        best = recorded;
        value = base;
      }
    }
    // Lezer 把行尾的 "\r" 当空白，起点可能越过它；不能超过这一行内容的结尾
    return best < 0 ? start : Math.min(start + value, this.lines.end(line));
  }

  /** 第 line 行是否读到了 depth 层（懒惰续行读不到） */
  reaches(line: number, depth: number): boolean {
    if (depth === 0) return true;
    const entry = this.bases.get(this.lines.start(line));
    if (!entry) return false;
    for (const recorded of entry.keys()) if (recorded >= depth) return true;
    return false;
  }

  slice(from: number, to: number): string {
    return this.text.slice(from, to);
  }
}

interface Build {
  source: Source;
  /** 整篇原文（不含 BOM） */
  doc: string;
  docLines: LineIndex;
  syntax: SyntaxOptions;
}

/** 转换出来的一个块：模型节点和它在被解析文字里的范围 */
interface Built {
  node: MdNode;
  start: number;
  end: number;
}

interface LineSpan {
  line: number;
  /** 这一行内容的起止（被解析文字里的偏移） */
  from: number;
  to: number;
}

function docSlice(build: Build, from: number, to: number): string {
  return build.doc.slice(build.source.toDoc(from), build.source.toDoc(to));
}

/** 这一行从整篇原文的行首到 offset 的原文（容器前缀等） */
function docPrefix(build: Build, offset: number): string {
  const docOffset = build.source.toDoc(offset);
  const lineStart = build.docLines.start(build.docLines.lineOf(docOffset));
  return build.doc.slice(lineStart, docOffset);
}

function lastLineOf(source: Source, node: SyntaxNode): number {
  return source.lines.lineOf(Math.max(node.from, node.to - 1));
}

function children(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function blockChildren(node: SyntaxNode): SyntaxNode[] {
  return children(node).filter((child) => BLOCK_NODES.has(child.name));
}

function childrenNamed(node: SyntaxNode, name: string): SyntaxNode[] {
  return children(node).filter((child) => child.name === name);
}

/** 叶子块：文字由各行内容拼成，出身里记下原文和每行的前缀 */
function leaf(
  build: Build,
  type: BlockType,
  attrs: object,
  spans: LineSpan[],
  start: number,
  end: number,
  ctx: string,
  extra?: Record<string, unknown>,
): Built {
  const { source } = build;
  const text = spans.map((span) => source.slice(span.from, span.to)).join("\n");
  const node = makeLeaf(type, attrs, text);
  // 每一行（含第一行）的前缀和内容；第一行的前缀对段落没用（在块前原文和缩进里），对代码块的内容行有用
  const lines: LineOrigin[] = spans.map((span) => ({
    prefix: docPrefix(build, span.from),
    text: source.slice(span.from, span.to),
  }));
  const docStart = source.toDoc(start);
  const origin = createOrigin({
    prevId: 0,
    ctx,
    before: "",
    src: docSlice(build, start, end),
    sig: leafSignature(node),
    lines,
    lineOffsets: spans.map((span) => source.toDoc(span.from) - docStart),
    extra,
  });
  setOrigin(node, origin);
  return { node, start, end };
}

/** 这些容器至少要有一个子块（编辑器的 schema 要求，光标也要有地方放）；空的时候放一个空段落，序列化时不输出 */
const NEEDS_CONTENT = new Set<BlockType>(["listItem", "blockquote", "alert", "footnoteDefinition", "definitionDescription"]);

function container(build: Build, type: BlockType, attrs: object, items: Built[], start: number, end: number, contentStart: number, ctx: string, extra?: Record<string, unknown>): Built {
  const children = items.map((item) => item.node);
  if (!children.length && NEEDS_CONTENT.has(type)) children.push(makeLeaf("paragraph", { indent: "" }, ""));
  const node = makeContainer(type, attrs, children);
  const tail = assignGaps(build, items, contentStart, end);
  setOrigin(node, createOrigin({ prevId: 0, ctx, before: "", tail, extra, ...(items.length ? {} : { bodyTail: true }) }));
  return { node, start, end };
}

/** 依次填好每个子块的块前原文和前一个兄弟；返回最后一个子块之后到容器结束的原文 */
function assignGaps(build: Build, items: Built[], contentStart: number, contentEnd: number): string {
  let previousEnd = contentStart;
  let previousId = 0;
  for (const item of items) {
    // 空段落不输出，不占位置
    if (isBlankParagraph(item.node)) continue;
    const origin = getOrigin(item.node);
    if (!origin) throw new Error(`节点没有出身：${item.node.type}`);
    origin.before = docSlice(build, previousEnd, item.start);
    origin.prevId = previousId;
    previousEnd = item.end;
    previousId = origin.id;
  }
  return docSlice(build, previousEnd, Math.max(previousEnd, contentEnd));
}

// ---------------------------------------------------------------------------
// 叶子块

function paragraphSpans(source: Source, node: SyntaxNode, depth: number, firstFrom = node.from): LineSpan[] {
  const first = source.lines.lineOf(node.from);
  const last = lastLineOf(source, node);
  const spans: LineSpan[] = [{ line: first, from: firstFrom, to: source.lines.end(first) }];
  for (let line = first + 1; line <= last; line += 1) {
    spans.push({ line, from: source.base(line, depth), to: source.lines.end(line) });
  }
  return spans;
}

function convertParagraph(build: Build, node: SyntaxNode, depth: number, ctx: string): Built[] {
  const { source } = build;
  const spans = paragraphSpans(source, node, depth);
  const start = source.base(spans[0].line, depth);
  const indent = source.slice(start, node.from);

  if (build.syntax.toc && spans.length === 1 && isTocMarker(source.slice(start, spans[0].to))) {
    return [leaf(build, "toc", { indent, markup: source.slice(node.from, spans[0].to) }, [], start, spans[0].to, ctx)];
  }

  // 开头几行是缩写定义时各自成块，剩下的仍是段落
  const result: Built[] = [];
  let index = 0;
  while (index < spans.length) {
    const span = spans[index];
    const lineFrom = index === 0 ? start : span.from;
    if (!readAbbreviationDefinition(source.slice(lineFrom, span.to))) break;
    const textFrom = lineFrom + leadingSpace(source.slice(lineFrom, span.to));
    result.push(
      leaf(
        build,
        "abbreviationDefinition",
        { indent: source.slice(lineFrom, textFrom) },
        [{ line: span.line, from: textFrom, to: span.to }],
        lineFrom,
        span.to,
        ctx,
      ),
    );
    index += 1;
  }
  if (index === 0) {
    result.push(leaf(build, "paragraph", { indent }, spans, start, spans[spans.length - 1].to, ctx));
  } else if (index < spans.length) {
    result.push(paragraphFromLines(build, spans.slice(index), ctx));
  }
  return result;
}

function leadingSpace(text: string): number {
  return /^[ \t]*/.exec(text)![0].length;
}

/** 从一组续行（from 是这一行的容器起点）建段落：第一行的行首空白记成缩进 */
function paragraphFromLines(build: Build, spans: LineSpan[], ctx: string): Built {
  const { source } = build;
  const start = spans[0].from;
  const textFrom = start + leadingSpace(source.slice(start, spans[0].to));
  const lines = [{ ...spans[0], from: textFrom }, ...spans.slice(1)];
  return leaf(build, "paragraph", { indent: source.slice(start, textFrom) }, lines, start, spans[spans.length - 1].to, ctx);
}

function convertAtxHeading(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const line = source.lines.lineOf(node.from);
  const start = source.base(line, depth);
  const lineEnd = source.lines.end(line);
  const marks = childrenNamed(node, "HeaderMark");
  const open = marks[0];
  const openSpacing = /^[ \t]*/.exec(source.slice(open.to, lineEnd))![0];
  const contentFrom = open.to + openSpacing.length;
  const closingMark = marks.length > 1 ? marks[marks.length - 1] : null;
  let contentTo = closingMark && closingMark.from >= contentFrom ? closingMark.from : lineEnd;
  while (contentTo > contentFrom && /[ \t]/.test(source.text[contentTo - 1])) contentTo -= 1;
  return leaf(
    build,
    "heading",
    {
      level: Number(node.name.slice(-1)),
      setext: false,
      indent: source.slice(start, node.from),
      openSpacing,
      closing: source.slice(contentTo, lineEnd),
      underline: "",
    },
    [{ line, from: contentFrom, to: contentTo }],
    start,
    lineEnd,
    ctx,
  );
}

function convertSetextHeading(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const spans = paragraphSpans(source, node, depth);
  const underline = spans.pop()!;
  const start = source.base(spans[0].line, depth);
  return leaf(
    build,
    "heading",
    {
      level: node.name === "SetextHeading1" ? 1 : 2,
      setext: true,
      indent: source.slice(start, node.from),
      openSpacing: "",
      closing: "",
      underline: source.slice(underline.from, underline.to),
    },
    spans,
    start,
    underline.to,
    ctx,
  );
}

const DIAGRAM_LANGUAGES: Record<string, { kind: DiagramKind; option: keyof SyntaxOptions }> = {
  mermaid: { kind: "mermaid", option: "mermaid" },
  flow: { kind: "flowchart", option: "flowchart" },
  sequence: { kind: "sequence", option: "sequence" },
};

/** 围栏代码块和公式块的内容行：去掉容器前缀，再去掉至多与开头围栏相同列数的缩进（CommonMark） */
function fencedContent(build: Build, depth: number, firstLine: number, lastLine: number, fenceIndent: number): LineSpan[] {
  const { source } = build;
  const spans: LineSpan[] = [];
  for (let line = firstLine; line <= lastLine; line += 1) {
    const from = source.base(line, depth);
    const to = source.lines.end(line);
    const stripped = stripIndent(source.slice(from, to), fenceIndent);
    spans.push({ line, from: from + stripped.removed, to });
  }
  return spans;
}

function indentColumns(source: Source, line: number, from: number, to: number): number {
  const lineStart = source.lines.start(line);
  const text = source.text;
  const startColumn = countColumns(text, lineStart, from);
  return countColumns(text, from, to, startColumn) - startColumn;
}

function convertFencedCode(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const first = source.lines.lineOf(node.from);
  const last = lastLineOf(source, node);
  const start = source.base(first, depth);
  const marks = childrenNamed(node, "CodeMark");
  const open = marks[0];
  const closeMark = marks.length > 1 ? marks[marks.length - 1] : null;
  const closeLine = closeMark ? source.lines.lineOf(closeMark.from) : null;
  const openLineEnd = source.lines.end(first);
  const fence = source.slice(open.from, open.to);
  const info = source.slice(open.to, openLineEnd).trim();
  const indent = source.slice(start, node.from);
  const spans = fencedContent(build, depth, first + 1, closeLine === null ? last : closeLine - 1, indentColumns(source, first, start, node.from));
  const closing = closeLine === null ? null : source.slice(source.base(closeLine, depth), source.lines.end(closeLine));
  const language = info.split(/\s+/)[0].toLowerCase();
  const diagram = DIAGRAM_LANGUAGES[language];
  const attrs = { indented: false, indent, fence, info, closing };
  const extra = { openLine: source.slice(node.from, openLineEnd), fence, info };
  return diagram && build.syntax[diagram.option]
    ? leaf(build, "diagram", { ...attrs, kind: diagram.kind }, spans, start, source.lines.end(last), ctx, extra)
    : leaf(build, "codeBlock", attrs, spans, start, source.lines.end(last), ctx, extra);
}

function convertIndentedCode(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const first = source.lines.lineOf(node.from);
  const last = lastLineOf(source, node);
  const start = source.base(first, depth);
  const spans: LineSpan[] = [];
  for (let line = first; line <= last; line += 1) {
    const lineStart = source.lines.start(line);
    const lineEnd = source.lines.end(line);
    const base = line === first ? start : source.base(line, depth);
    const lineText = source.slice(lineStart, lineEnd);
    const codeFrom = Math.min(lineStart + findColumn(lineText, countColumns(lineText, 0, base - lineStart) + 4), lineEnd);
    spans.push({ line, from: codeFrom, to: lineEnd });
  }
  return leaf(
    build,
    "codeBlock",
    { indented: true, indent: "", fence: "", info: "", closing: null },
    spans,
    start,
    source.lines.end(last),
    ctx,
    { codeIndent: source.slice(start, spans[0].from) },
  );
}

function convertMathBlock(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const first = source.lines.lineOf(node.from);
  const last = lastLineOf(source, node);
  const start = source.base(first, depth);
  const marks = childrenNamed(node, "MathMark");
  const closeMark = marks.length > 1 ? marks[marks.length - 1] : null;
  const closeLine = closeMark ? source.lines.lineOf(closeMark.from) : null;
  const indent = source.slice(start, node.from);
  const spans = fencedContent(build, depth, first + 1, closeLine === null ? last : closeLine - 1, indentColumns(source, first, start, node.from));
  return leaf(
    build,
    "mathBlock",
    {
      indent,
      open: source.slice(node.from, source.lines.end(first)),
      close: closeLine === null ? null : source.slice(source.base(closeLine, depth), source.lines.end(closeLine)),
    },
    spans,
    start,
    source.lines.end(last),
    ctx,
  );
}

function convertLines(build: Build, type: BlockType, node: SyntaxNode, depth: number, ctx: string, attrs: object = {}): Built {
  const { source } = build;
  const spans = paragraphSpans(source, node, depth);
  const start = source.base(spans[0].line, depth);
  return leaf(build, type, { indent: source.slice(start, node.from), ...attrs }, spans, start, spans[spans.length - 1].to, ctx);
}

function convertHorizontalRule(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const line = source.lines.lineOf(node.from);
  const start = source.base(line, depth);
  const end = source.lines.end(line);
  return leaf(build, "horizontalRule", { indent: source.slice(start, node.from), markup: source.slice(node.from, end) }, [], start, end, ctx);
}

// ---------------------------------------------------------------------------
// 表格（T-7）：行是重写的单位；分隔行不是节点，记在表格的出身里

export interface TableRowSyntax {
  leadingPipe: boolean;
  trailingPipe: boolean;
  /** 每个单元格的内容（去掉两头空白）在行里的起止 */
  cells: Array<{ from: number; to: number }>;
}

/** 按没转义的 `|` 拆分一行（GFM：代码里的 `|` 也要转义） */
export function splitTableRow(row: string): TableRowSyntax {
  const pipes: number[] = [];
  for (let i = 0; i < row.length; i += 1) {
    const code = row.charCodeAt(i);
    if (code === 92) i += 1;
    else if (code === 124) pipes.push(i);
  }
  const contentStart = /^[ \t]*/.exec(row)![0].length;
  const contentEnd = row.replace(/[ \t]+$/, "").length;
  const leadingPipe = pipes.length > 0 && pipes[0] === contentStart;
  const trailingPipe = pipes.length > 0 && pipes[pipes.length - 1] === contentEnd - 1 && contentEnd - 1 > (leadingPipe ? pipes[0] : -1);
  const bounds: number[] = [leadingPipe ? pipes[0] : contentStart - 1];
  for (const pipe of pipes) if (pipe !== bounds[0] && !(trailingPipe && pipe === contentEnd - 1)) bounds.push(pipe);
  bounds.push(trailingPipe ? contentEnd - 1 : contentEnd);
  const cells: Array<{ from: number; to: number }> = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) {
    const start = bounds[i] + 1;
    let from = start;
    let to = bounds[i + 1];
    while (from < to && /[ \t]/.test(row[from])) from += 1;
    while (to > from && /[ \t]/.test(row[to - 1])) to -= 1;
    // 空格子的位置在竖线后面那个空格之后（同 Typora：`|  |` 里光标在两个空格中间）
    if (from === to && from > start) from = to = Math.min(start + 1, bounds[i + 1]);
    cells.push({ from, to });
  }
  return { leadingPipe, trailingPipe, cells };
}

export function readTableAlignments(row: string): TableAlign[] {
  const syntax = splitTableRow(row);
  return syntax.cells.map(({ from, to }) => {
    const cell = row.slice(from, to);
    const left = cell.startsWith(":");
    const right = cell.endsWith(":") && cell.length > 1;
    if (left && right) return "center";
    if (left) return "left";
    if (right) return "right";
    return null;
  });
}

function convertTable(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const first = source.lines.lineOf(node.from);
  const last = lastLineOf(source, node);
  const start = source.base(first, depth);
  const rows: Built[] = [];
  let delimiter: { before: string; src: string; align: TableAlign[] } | null = null;
  let headerStyle: TableRowSyntax | null = null;
  let previousEnd = start;
  let previousId = 0;
  for (let line = first; line <= last; line += 1) {
    const rowStart = line === first ? start : source.base(line, depth);
    const rowEnd = source.lines.end(line);
    const rowText = source.slice(rowStart, rowEnd);
    if (line === first + 1) {
      delimiter = { before: docSlice(build, previousEnd, rowStart), src: docSlice(build, rowStart, rowEnd), align: readTableAlignments(rowText) };
      previousEnd = rowEnd;
      continue;
    }
    const syntax = splitTableRow(rowText);
    if (line === first) headerStyle = syntax;
    const cellType: BlockType = line === first ? "tableHeader" : "tableCell";
    // 每行的格数同表头（GFM：少的按空格补，多的不显示）：编辑器的表格（prosemirror-tables）要求方方正正。
    // 原文在行的出身里，行没改过就照抄，补出来、截掉的格不影响无损
    const width = headerStyle?.cells.length ?? syntax.cells.length;
    const cells = Array.from({ length: width }, (_, index) => {
      const cell = syntax.cells[index];
      return makeLeaf(cellType, {}, cell ? rowText.slice(cell.from, cell.to) : "");
    });
    const row = makeContainer("tableRow", {}, cells);
    const origin = createOrigin({
      prevId: previousId,
      ctx,
      before: docSlice(build, previousEnd, rowStart),
      src: docSlice(build, rowStart, rowEnd),
      extra: { cells: syntax.cells },
    });
    setOrigin(row, origin);
    rows.push({ node: row, start: rowStart, end: rowEnd });
    previousEnd = rowEnd;
    previousId = origin.id;
  }
  const align = delimiter?.align ?? [];
  const table = makeContainer("table", { align }, rows.map((row) => row.node));
  setOrigin(
    table,
    createOrigin({
      prevId: 0,
      ctx,
      before: "",
      tail: "",
      extra: { delimiter, style: headerStyle ? { leadingPipe: headerStyle.leadingPipe, trailingPipe: headerStyle.trailingPipe } : null },
    }),
  );
  return { node: table, start, end: source.lines.end(last) };
}

// ---------------------------------------------------------------------------
// 容器

function convertBlockquote(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const first = source.lines.lineOf(node.from);
  const start = source.base(first, depth);
  const end = source.lines.end(lastLineOf(source, node));
  const quoteDepth = depth + 1;
  const innerCtx = ctx + QUOTE_PREFIX;
  const syntaxChildren = blockChildren(node);
  const head = syntaxChildren[0];

  if (build.syntax.callout && head && head.name === "Paragraph") {
    const spans = paragraphSpans(source, head, quoteDepth);
    const kind = readAlertMarker(source.slice(spans[0].from, spans[0].to));
    if (kind) {
      const titleEnd = spans[0].to;
      const items: Built[] = [];
      if (spans.length > 1) items.push(paragraphFromLines(build, spans.slice(1), innerCtx));
      items.push(...convertChildren(build, syntaxChildren.slice(1), quoteDepth, innerCtx, source.lines.lineOf(end)));
      const marker = source.slice(spans[0].from, titleEnd).trim();
      return container(build, "alert", { kind, marker }, items, start, end, titleEnd, ctx, {
        head: docSlice(build, start, titleEnd),
        marker,
      });
    }
  }

  const items = convertChildren(build, syntaxChildren, quoteDepth, innerCtx, source.lines.lineOf(end));
  return container(build, "blockquote", {}, items, start, end, start, ctx);
}

/** 列表项内容的缩进列数（同 Lezer 的 getListIndent） */
function listContentIndent(source: Source, line: number, itemStart: number, markEnd: number, contentStart: number): number {
  const lineStart = source.lines.start(line);
  const text = source.text;
  const startColumn = countColumns(text, lineStart, itemStart);
  const markEndColumn = countColumns(text, itemStart, markEnd, startColumn);
  const restBlank = source.slice(markEnd, source.lines.end(line)).trim() === "";
  if (restBlank) return markEndColumn + 1 - startColumn;
  return countColumns(text, itemStart, contentStart, startColumn) - startColumn;
}

function convertListItem(build: Build, node: SyntaxNode, listDepth: number, ctx: string): Built {
  const { source } = build;
  const itemDepth = listDepth + 1;
  const first = source.lines.lineOf(node.from);
  const start = node.from;
  const end = source.lines.end(lastLineOf(source, node));
  const mark = childrenNamed(node, "ListMark")[0];
  const contentStart = Math.max(mark.to, source.base(first, itemDepth));
  const contentIndent = listContentIndent(source, first, start, mark.to, contentStart);
  const innerCtx = ctx + " ".repeat(contentIndent);
  const syntaxChildren = blockChildren(node);
  let checked: boolean | null = null;
  let headEnd = contentStart;
  let task: { checkChar: string; taskSpacing: string } | null = null;
  const items: Built[] = [];
  let rest = syntaxChildren;

  if (syntaxChildren[0]?.name === "Task") {
    const taskNode = syntaxChildren[0];
    const marker = childrenNamed(taskNode, "TaskMarker")[0];
    const lineEnd = source.lines.end(first);
    const spacing = /^[ \t]*/.exec(source.slice(marker.to, lineEnd))![0];
    const checkChar = source.slice(marker.from + 1, marker.from + 2);
    checked = checkChar !== " ";
    task = { checkChar, taskSpacing: spacing };
    headEnd = marker.to + spacing.length;
    const spans = paragraphSpans(source, taskNode, itemDepth, headEnd);
    items.push(leaf(build, "paragraph", { indent: "" }, spans, headEnd, spans[spans.length - 1].to, innerCtx));
    rest = syntaxChildren.slice(1);
  }
  items.push(...convertChildren(build, rest, itemDepth, innerCtx, source.lines.lineOf(end)));
  return container(
    build,
    "listItem",
    {
      indent: source.slice(start, mark.from),
      marker: source.slice(mark.from, mark.to),
      spacing: source.slice(mark.to, contentStart),
      checked,
    },
    items,
    start,
    end,
    headEnd,
    ctx,
    { contentIndent, task, head: docSlice(build, start, headEnd) },
  );
}

function blankBetween(before: string): boolean {
  return (before.match(/\n/g)?.length ?? 0) >= 2;
}

function convertList(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const listDepth = depth + 1;
  const syntaxItems = childrenNamed(node, "ListItem");
  const items = syntaxItems.map((item) => convertListItem(build, item, listDepth, ctx));
  const start = items[0].start;
  const end = items[items.length - 1].end;
  const firstMarker = String(items[0].node.attrs?.marker ?? "-");
  const ordered = node.name === "OrderedList";
  const attrs = ordered
    ? { start: Number.parseInt(firstMarker, 10), delimiter: firstMarker.slice(-1), tight: true }
    : { bullet: firstMarker, tight: true };
  // container 填好列表项之间的空行，之后才能判断松紧
  const built = container(build, ordered ? "orderedList" : "bulletList", attrs, items, start, end, start, ctx);
  // 松散：项之间有空行，或某一项里两个子块之间有空行（CommonMark）
  let loose = false;
  for (const [index, item] of items.entries()) {
    const origin = getOrigin(item.node)!;
    if (index > 0 && blankBetween(origin.before)) loose = true;
    for (const [childIndex, child] of (item.node.content ?? []).entries()) {
      if (childIndex === 0 || child.type === "text") continue;
      const childOrigin = getOrigin(child);
      if (childOrigin && blankBetween(childOrigin.before)) loose = true;
    }
  }
  built.node.attrs!.tight = !loose;
  return built;
}

function convertFootnoteDefinition(build: Build, node: SyntaxNode, depth: number, ctx: string): Built {
  const { source } = build;
  const footnoteDepth = depth + 1;
  const first = source.lines.lineOf(node.from);
  const start = source.base(first, depth);
  const end = source.lines.end(lastLineOf(source, node));
  const mark = childrenNamed(node, "FootnoteMark")[0];
  const label = childrenNamed(mark, "FootnoteLabel")[0];
  const contentStart = Math.max(mark.to, source.base(first, footnoteDepth));
  const innerCtx = ctx + FOOTNOTE_PREFIX;
  const items = convertChildren(build, blockChildren(node), footnoteDepth, innerCtx, source.lines.lineOf(end));
  return container(
    build,
    "footnoteDefinition",
    { label: source.slice(label.from, label.to), spacing: source.slice(mark.to, contentStart) },
    items,
    start,
    end,
    contentStart,
    ctx,
    { head: docSlice(build, start, contentStart), indent: source.slice(start, node.from) },
  );
}

// ---------------------------------------------------------------------------
// 定义列表（B-14）：Lezer 里是段落（加上后面缩进的块），按行认出词条和说明，说明的内容单独解析

interface DefinitionLine {
  line: number;
  /** 相对容器的这一行内容 */
  text: string;
  from: number;
}

function tryDefinitionList(
  build: Build,
  siblings: SyntaxNode[],
  index: number,
  depth: number,
  ctx: string,
  containerLastLine: number,
): { built: Built[]; next: number } | null {
  const { source } = build;
  const paragraph = siblings[index];
  if (paragraph.name !== "Paragraph") return null;
  const first = source.lines.lineOf(paragraph.from);
  const paragraphLast = lastLineOf(source, paragraph);
  const lineAt = (line: number): DefinitionLine | null => {
    if (line > containerLastLine || line >= source.lines.count) return null;
    const from = source.base(line, depth);
    const text = source.slice(from, source.lines.end(line));
    if (text.trim() && !source.reaches(line, depth)) return null;
    return { line, text, from };
  };
  // 第一个说明行之前必须都是词条行
  let markerLine = -1;
  for (let line = first; line <= paragraphLast; line += 1) {
    const current = lineAt(line);
    if (!current) return null;
    if (line > first && readDefinitionMarker(current.text) !== null) {
      markerLine = line;
      break;
    }
    if (!isDefinitionTermLine(current.text)) return null;
  }
  if (markerLine < 0) return null;

  const isMarker = (line: number) => {
    const current = lineAt(line);
    return current !== null && readDefinitionMarker(current.text) !== null;
  };
  const isTerm = (line: number) => {
    const current = lineAt(line);
    return current !== null && isDefinitionTermLine(current.text);
  };
  const isEntryStart = (line: number) => {
    if (!isTerm(line)) return false;
    let cursor = line;
    while (isTerm(cursor)) cursor += 1;
    return isMarker(cursor);
  };
  const isBlank = (line: number) => {
    const current = lineAt(line);
    return current !== null && current.text.trim() === "";
  };
  const indentOf = (line: number) => /^[ \t]*/.exec(lineAt(line)?.text ?? "")![0];
  const isLineContinuation = (line: number) => /^(?:[ \t]{2,}|\t)/.test(lineAt(line)?.text ?? "") && !isMarker(line);
  const isBlockContinuation = (line: number) => /^(?: {4,}|\t| {1,3}\t)/.test(indentOf(line));

  interface Entry {
    terms: number[];
    descriptions: number[][];
  }
  const entries: Entry[] = [];
  let line = first;
  while (line <= containerLastLine) {
    const terms: number[] = [];
    while (isTerm(line) && !isMarker(line)) {
      terms.push(line);
      line += 1;
    }
    if (!terms.length || !isMarker(line)) {
      line = terms[0] ?? line;
      break;
    }
    const descriptions: number[][] = [];
    while (isMarker(line)) {
      const lines = [line];
      line += 1;
      while (lineAt(line)) {
        if (isBlank(line)) {
          let next = line;
          while (isBlank(next)) next += 1;
          if (!lineAt(next) || !isBlockContinuation(next)) break;
          for (; line < next; line += 1) lines.push(line);
          continue;
        }
        if (isMarker(line) || isEntryStart(line) || !isLineContinuation(line)) break;
        lines.push(line);
        line += 1;
      }
      descriptions.push(lines);
    }
    entries.push({ terms, descriptions });
    if (!isEntryStart(line)) break;
  }
  if (!entries.length) return null;

  // 区域要落在块的边界上。只盖住了这个段落时，段落剩下的行（不缩进、又不是词条的行）拆成后面的一个段落（同旧实现）；
  // 盖住的最后一个块是别的块（如懒惰续行的列表）时，把它整个并进最后一个说明
  let regionEnd = line;
  let next = index;
  while (next < siblings.length && source.lines.lineOf(siblings[next].from) < regionEnd) next += 1;
  const lastCovered = lastLineOf(source, siblings[next - 1]);
  let rest: Built | null = null;
  if (lastCovered >= regionEnd && next - 1 === index) {
    const spans = paragraphSpans(source, paragraph, depth).filter((span) => span.line >= regionEnd);
    rest = paragraphFromLines(build, spans, ctx);
  } else if (lastCovered >= regionEnd) {
    const lastDescription = entries[entries.length - 1].descriptions.at(-1)!;
    for (let extra = regionEnd; extra <= lastCovered; extra += 1) lastDescription.push(extra);
    regionEnd = lastCovered + 1;
  }

  const start = source.base(first, depth);
  const items: Built[] = [];
  for (const entry of entries) {
    for (const termLine of entry.terms) {
      const current = lineAt(termLine)!;
      const indent = /^[ \t]*/.exec(current.text)![0];
      const to = source.lines.end(termLine);
      items.push(
        leaf(build, "definitionTerm", { indent }, [{ line: termLine, from: current.from + indent.length, to }], current.from, to, ctx),
      );
    }
    for (const lines of entry.descriptions) items.push(convertDescription(build, lines, depth, ctx));
  }
  const end = source.lines.end(regionEnd - 1);
  const built = [container(build, "definitionList", {}, items, start, end, start, ctx)];
  if (rest) built.push(rest);
  return { built, next };
}

function convertDescription(build: Build, lines: number[], depth: number, ctx: string): Built {
  const { source } = build;
  const first = lines[0];
  const start = source.base(first, depth);
  const firstText = source.slice(start, source.lines.end(first));
  const markerLength = readDefinitionMarker(firstText)!;
  const marker = firstText.slice(0, markerLength);
  const colon = marker.indexOf(":");
  // 说明的内容：第一行去掉 `: `，后面各行去掉至多 4 列缩进
  const contentFroms = lines.map((line, index) => {
    if (index === 0) return start + markerLength;
    const from = source.base(line, depth);
    return from + stripIndent(source.slice(from, source.lines.end(line)), 4).removed;
  });
  const subText = lines.map((line, index) => source.slice(contentFroms[index], source.lines.end(line))).join("\n");
  const subLineStarts: number[] = [];
  let offset = 0;
  for (const [index, line] of lines.entries()) {
    subLineStarts.push(offset);
    offset += source.lines.end(line) - contentFroms[index] + 1;
  }
  const toDoc = (subOffset: number) => {
    let low = 0;
    let high = subLineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (subLineStarts[middle] <= subOffset) low = middle;
      else high = middle - 1;
    }
    return source.toDoc(contentFroms[low] + (subOffset - subLineStarts[low]));
  };
  const innerCtx = ctx + DESCRIPTION_PREFIX;
  const parsed = recordLineBases(() => withMathScan(subText, () => blockParser(build.syntax).parse(subText)));
  const subSource = new Source(subText, parsed.bases, toDoc);
  const subBuild: Build = { ...build, source: subSource };
  const items = convertChildren(subBuild, blockChildren(parsed.result.topNode), 0, innerCtx, subSource.lines.count - 1);
  const end = source.lines.end(lines[lines.length - 1]);
  // 子块的块前原文按说明内容的坐标算，容器本身按外层坐标算
  const children = items.map((item) => item.node);
  if (!children.length) children.push(makeLeaf("paragraph", { indent: "" }, ""));
  const node = makeContainer("definitionDescription", { indent: marker.slice(0, colon), spacing: marker.slice(colon + 1) }, children);
  const tail = assignGaps(subBuild, items, 0, subText.length);
  setOrigin(
    node,
    createOrigin({ prevId: 0, ctx, before: "", tail, extra: { head: docSlice(build, start, start + markerLength) } }),
  );
  return { node, start, end };
}

// ---------------------------------------------------------------------------

function convertBlock(build: Build, node: SyntaxNode, depth: number, ctx: string): Built[] {
  switch (node.name) {
    case "Paragraph":
    case "Task":
      return convertParagraph(build, node, depth, ctx);
    case "ATXHeading1":
    case "ATXHeading2":
    case "ATXHeading3":
    case "ATXHeading4":
    case "ATXHeading5":
    case "ATXHeading6":
      return [convertAtxHeading(build, node, depth, ctx)];
    case "SetextHeading1":
    case "SetextHeading2":
      return [convertSetextHeading(build, node, depth, ctx)];
    case "FencedCode":
      return [convertFencedCode(build, node, depth, ctx)];
    case "CodeBlock":
      return [convertIndentedCode(build, node, depth, ctx)];
    case "MathBlock":
      return [convertMathBlock(build, node, depth, ctx)];
    case "HTMLBlock":
    case "ProcessingInstructionBlock":
      return [convertLines(build, "htmlBlock", node, depth, ctx, { comment: false })];
    case "CommentBlock":
      return [convertLines(build, "htmlBlock", node, depth, ctx, { comment: true })];
    case "LinkReference":
      return [convertLines(build, "referenceDefinition", node, depth, ctx)];
    case "HorizontalRule":
      return [convertHorizontalRule(build, node, depth, ctx)];
    case "Table":
      return [convertTable(build, node, depth, ctx)];
    case "Blockquote":
      return [convertBlockquote(build, node, depth, ctx)];
    case "BulletList":
    case "OrderedList":
      return [convertList(build, node, depth, ctx)];
    case "FootnoteDefinition":
      return [convertFootnoteDefinition(build, node, depth, ctx)];
    default:
      throw new Error(`没处理的块：${node.name}`);
  }
}

function isSetext(node: SyntaxNode | undefined): node is SyntaxNode {
  return node !== undefined && (node.name === "SetextHeading1" || node.name === "SetextHeading2");
}

/** Setext 下划线的字符数（去掉空白） */
function underlineLength(build: Build, node: SyntaxNode): number {
  const mark = childrenNamed(node, "HeaderMark").at(-1);
  return mark ? build.source.slice(mark.from, mark.to).trim().length : 0;
}

/**
 * Typora 的 Setext 下划线至少两个字符（Typora 1.14.15 实测）：只有一个 `=`、`-` 的那行是段落的续行，
 * 后面紧挨着的段落、Setext 标题也接着并进来；最后并进来的是合规的 Setext 标题时整段是标题
 */
function tryShortSetext(build: Build, nodes: SyntaxNode[], index: number, depth: number, ctx: string): { built: Built; next: number } | null {
  const { source } = build;
  const first = nodes[index];
  if (!isSetext(first) || underlineLength(build, first) !== 1) return null;
  const spans = paragraphSpans(source, first, depth);
  let next = index + 1;
  let heading: SyntaxNode | null = null;
  for (;;) {
    const candidate = nodes[next];
    const lastLine = spans[spans.length - 1].line;
    if (!candidate || (candidate.name !== "Paragraph" && !isSetext(candidate))) break;
    if (source.lines.lineOf(candidate.from) !== lastLine + 1) break;
    const more = paragraphSpans(source, candidate, depth);
    more[0] = { ...more[0], from: source.base(more[0].line, depth) };
    spans.push(...more);
    next += 1;
    if (isSetext(candidate) && underlineLength(build, candidate) >= 2) {
      heading = candidate;
      break;
    }
    if (candidate.name === "Paragraph") break;
  }
  const start = source.base(spans[0].line, depth);
  const indent = source.slice(start, first.from);
  if (!heading) return { built: leaf(build, "paragraph", { indent }, spans, start, spans[spans.length - 1].to, ctx), next };
  const underline = spans.pop()!;
  return {
    built: leaf(
      build,
      "heading",
      {
        level: heading.name === "SetextHeading1" ? 1 : 2,
        setext: true,
        indent,
        openSpacing: "",
        closing: "",
        underline: source.slice(underline.from, underline.to),
      },
      spans,
      start,
      underline.to,
      ctx,
    ),
    next,
  };
}

function convertChildren(build: Build, nodes: SyntaxNode[], depth: number, ctx: string, containerLastLine: number): Built[] {
  const items: Built[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const definitionList = tryDefinitionList(build, nodes, index, depth, ctx, containerLastLine);
    if (definitionList) {
      items.push(...definitionList.built);
      index = definitionList.next - 1;
      continue;
    }
    const shortSetext = tryShortSetext(build, nodes, index, depth, ctx);
    if (shortSetext) {
      items.push(shortSetext.built);
      index = shortSetext.next - 1;
      continue;
    }
    items.push(...convertBlock(build, nodes[index], depth, ctx));
  }
  return items;
}

/** 文档开头的 Front Matter（B-9）：第一行 `---`，到下一个 `---` 或 `...` 为止；没有结尾就不算 */
function readFrontMatter(lines: LineIndex): { closeLine: number } | null {
  if (!isFrontMatterOpening(lines.line(0))) return null;
  for (let line = 1; line < lines.count; line += 1) {
    if (isFrontMatterClosing(lines.line(line))) return { closeLine: line };
  }
  return null;
}

export function parse(source: string, options: ParseOptions = {}): MdNode {
  const syntax = resolveSyntax(options.syntax);
  const bom = source.charCodeAt(0) === 0xfeff;
  const body = bom ? source.slice(1) : source;
  const text = normalizeLoneCarriageReturns(body);
  const lines = new LineIndex(text);
  const frontMatter = options.frontMatter === false ? null : readFrontMatter(lines);
  // Front Matter 那几行换成等长的空白再交给 Lezer：偏移不变，Lezer 只当是开头的空行
  const frontMatterEnd = frontMatter ? lines.end(frontMatter.closeLine) : 0;
  const parseText = frontMatter ? text.slice(0, frontMatterEnd).replace(/[^\r\n]/g, " ") + text.slice(frontMatterEnd) : text;
  let tree: Tree | null = null;
  let bases: LineBases = new Map();
  if (parseText.trim()) {
    const parsed = recordLineBases(() => withMathScan(parseText, () => blockParser(syntax).parse(parseText)));
    tree = parsed.result;
    bases = parsed.bases;
  }
  // 单独的 \r 换成了 \n，两边的换行位置一一对应，原文的行表直接用解析用的
  const build: Build = { source: new Source(text, bases, (offset) => offset), doc: body, docLines: lines, syntax };
  const items: Built[] = [];
  if (frontMatter) {
    const spans: LineSpan[] = [];
    for (let line = 1; line < frontMatter.closeLine; line += 1) spans.push({ line, from: lines.start(line), to: lines.end(line) });
    items.push(
      leaf(
        build,
        "frontMatter",
        { open: lines.line(0), close: lines.line(frontMatter.closeLine) },
        spans,
        0,
        lines.end(frontMatter.closeLine),
        "",
      ),
    );
  }
  if (tree) items.push(...convertChildren(build, blockChildren(tree.topNode), 0, "", lines.count - 1));
  const doc = makeContainer("doc", { eol: dominantEol(body) ?? options.eol ?? "\n", bom }, items.map((item) => item.node));
  const tail = assignGaps(build, items, 0, text.length);
  setOrigin(doc, createOrigin({ prevId: 0, ctx: "", before: "", tail }));
  return doc;
}

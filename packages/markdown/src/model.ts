// 文档模型（1.5.2 节）：和 ProseMirror 的 JSON 同形（type、attrs、content、text），编辑器可以直接 Node.fromJSON。
// 文本块的内容是这一块的行内 Markdown 原文，软换行是 "\n"，容器前缀不在文字里。
// 原始片段、块前的空行等「出身」信息不放进 attrs（ProseMirror 拆分、复制节点时会照抄 attrs），
// 而是按节点对象登记在 origins 里，见本文件后半部分

export type AlertKind = "note" | "tip" | "important" | "warning" | "caution";
export type DiagramKind = "mermaid" | "flowchart" | "sequence";
export type TableAlign = "left" | "center" | "right" | null;

export interface DocAttrs {
  /** 改过的块用的换行符：文件里出现最多的那种（E-1） */
  eol: "\n" | "\r\n" | "\r";
  bom: boolean;
}

export interface ParagraphAttrs {
  /** 第一行行首的缩进（容器前缀之后） */
  indent: string;
}

export interface HeadingAttrs {
  level: number;
  setext: boolean;
  indent: string;
  /** ATX：`#` 后面的空白 */
  openSpacing: string;
  /** ATX：文字后面的部分（空白和结尾的 `#`） */
  closing: string;
  /** Setext：下划线这一行（容器前缀之后的全部） */
  underline: string;
}

export interface ListAttrs {
  tight: boolean;
}

export interface BulletListAttrs extends ListAttrs {
  bullet: string;
}

export interface OrderedListAttrs extends ListAttrs {
  start: number;
  delimiter: string;
}

export interface ListItemAttrs {
  indent: string;
  /** 列表符号的原文，如 `-`、`1.`、`10)`；null 时按列表的写法生成 */
  marker: string | null;
  /** 符号后面的空白 */
  spacing: string;
  /** null：不是任务；false：未完成；true：已完成 */
  checked: boolean | null;
}

export interface CodeBlockAttrs {
  indented: boolean;
  indent: string;
  /** 围栏字符，如 ```、~~~~ */
  fence: string;
  /** 信息串（去掉两头空白） */
  info: string;
  /** 结尾围栏这一行（容器前缀之后的全部）；null 表示没有结尾围栏 */
  closing: string | null;
}

export interface DiagramAttrs extends CodeBlockAttrs {
  kind: DiagramKind;
}

export interface MathBlockAttrs {
  indent: string;
  /** 开头围栏这一行：`$$`、`$$ {标签}`、`\[` */
  open: string;
  /** 结尾围栏这一行；null 表示没有 */
  close: string | null;
}

export interface HtmlBlockAttrs {
  indent: string;
  comment: boolean;
}

export interface FrontMatterAttrs {
  open: string;
  close: string;
}

export interface MarkupAttrs {
  indent: string;
  markup: string;
}

export interface AlertAttrs {
  kind: AlertKind;
  /** 标题行里 `[!NOTE]` 这部分的原文 */
  marker: string;
}

export interface TableAttrs {
  indent: string;
  align: TableAlign[];
}

export interface FootnoteDefinitionAttrs {
  label: string;
  spacing: string;
}

export interface DefinitionDescriptionAttrs {
  indent: string;
  spacing: string;
}

/** 文本块：内容是行内原文 */
export const TEXTBLOCK_TYPES = ["paragraph", "heading", "tableHeader", "tableCell", "definitionTerm"] as const;
/** 内容是纯文本的块 */
export const CODE_TYPES = [
  "codeBlock",
  "diagram",
  "mathBlock",
  "htmlBlock",
  "frontMatter",
  "referenceDefinition",
  "abbreviationDefinition",
] as const;
/** 没有内容的块 */
export const ATOM_TYPES = ["toc", "horizontalRule"] as const;
/** 容器 */
export const CONTAINER_TYPES = [
  "doc",
  "blockquote",
  "alert",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "footnoteDefinition",
  "definitionList",
  "definitionDescription",
] as const;

export type TextblockType = (typeof TEXTBLOCK_TYPES)[number];
export type CodeType = (typeof CODE_TYPES)[number];
export type AtomType = (typeof ATOM_TYPES)[number];
export type ContainerType = (typeof CONTAINER_TYPES)[number];
export type BlockType = TextblockType | CodeType | AtomType | ContainerType;

export interface MdText {
  type: "text";
  text: string;
}

export interface MdNode {
  type: BlockType;
  attrs?: Record<string, unknown>;
  content?: Array<MdNode | MdText>;
}

/** 容器前缀的规范写法：引用、脚注定义、定义说明各自加一层（列表项按内容缩进的列数） */
export const QUOTE_PREFIX = "> ";
export const FOOTNOTE_PREFIX = "    ";
export const DESCRIPTION_PREFIX = "    ";

const textblockTypes = new Set<string>(TEXTBLOCK_TYPES);
const codeTypes = new Set<string>(CODE_TYPES);
const atomTypes = new Set<string>(ATOM_TYPES);

export function isTextblock(type: string): type is TextblockType {
  return textblockTypes.has(type);
}

export function isCode(type: string): type is CodeType {
  return codeTypes.has(type);
}

export function isAtom(type: string): type is AtomType {
  return atomTypes.has(type);
}

/** 文本块、纯文本块：内容是一段文字 */
export function isLeaf(type: string): boolean {
  return textblockTypes.has(type) || codeTypes.has(type) || atomTypes.has(type);
}

export function isContainer(type: string): type is ContainerType {
  return !isLeaf(type);
}

/** 叶子块的文字（文本块是行内原文，纯文本块是代码、公式等） */
export function nodeText(node: MdNode): string {
  if (!node.content) return "";
  let text = "";
  for (const child of node.content) if (child.type === "text") text += (child as MdText).text;
  return text;
}

/**
 * 空段落（编辑器里回车后还没输入的，或空容器里占位的）在 Markdown 里写不出来：
 * 序列化时当它不存在，结构比较时也不算它，所以编辑器可以暂时留着它
 */
export function isBlankParagraph(node: MdNode): boolean {
  return node.type === "paragraph" && nodeText(node).trim() === "";
}

/** 容器的子块 */
export function blockChildren(node: MdNode): MdNode[] {
  return (node.content ?? []).filter((child): child is MdNode => child.type !== "text");
}

export function textContent(text: string): MdText[] | undefined {
  return text ? [{ type: "text", text }] : undefined;
}

export function makeLeaf(type: BlockType, attrs: object, text: string): MdNode {
  const node: MdNode = { type, attrs: { ...attrs } };
  const content = textContent(text);
  if (content) node.content = content;
  return node;
}

export function makeContainer(type: BlockType, attrs: object, children: MdNode[]): MdNode {
  return { type, attrs: { ...attrs }, content: children };
}

// ---------------------------------------------------------------------------
// 出身（origin）：节点是从哪段原文解析出来的。序列化时，没改过的节点照抄原文（1.5.4 节）。
// 按节点对象登记：ProseMirror 的节点不可变，没改过的节点在事务前后是同一个对象；
// 编辑器把模型节点换成 ProseMirror 节点时用 setOrigin 把出身转过去

export interface LineOrigin {
  /** 这一行内容前面的原文（容器前缀、代码块的缩进等） */
  prefix: string;
  /** 这一行的内容 */
  text: string;
}

export interface Origin {
  /** 解析时分配，节点改了内容后沿用（inheritOrigin），用来认出「前一个兄弟还是原来那个」 */
  readonly id: number;
  /** 前一个兄弟的 id；0 表示是第一个子块 */
  prevId: number;
  /** 解析时所在容器的前缀（规范写法），换了容器的节点不能照抄原文 */
  ctx: string;
  /** 和前一个兄弟（或容器开头）之间的原文：换行、空行、这一行的容器前缀 */
  before: string;
  /** 叶子块：节点的原文（第一行从容器前缀之后开始，后面各行带前缀） */
  src?: string;
  /** 叶子块：解析时的内容签名，内容和写法没变时还可以照抄 src */
  sig?: string;
  /** 叶子块：每行的前缀和内容，改过的块里没改的行沿用前缀 */
  lines?: LineOrigin[];
  /** 叶子块：每行内容在 src 里的起点（位置换算用） */
  lineOffsets?: number[];
  /** 容器：最后一个子块之后到容器结束的原文（如引用末尾的 `>` 空行） */
  tail?: string;
  /** 容器：解析时一个子块都没有，tail 是它的全部原文（如只有 `> ` 的引用）；里面有了内容以后这段原文不再写 */
  bodyTail?: boolean;
  /** 各种块的额外原文：代码块的开头围栏行、列表项的任务框写法、表格的分隔行等 */
  extra?: Record<string, unknown>;
  /**
   * 光标占位：编辑器按源码改完以后光标落在空行上（这一行不属于任何块），在那里放的空段落。
   * before 是从前一个兄弟（或容器开头）到光标的原文，它是后面那段块前空行（或容器结尾）的开头；
   * 序列化见 serialize.ts 的 writeChildren
   */
  placeholder?: boolean;
  /** 继承来的出身：内容可能已经改了，只沿用前缀、块前空行 */
  readonly stale: boolean;
}

const origins = new WeakMap<object, Origin>();
let nextOriginId = 1;

export function createOrigin(fields: Omit<Origin, "id" | "stale">): Origin {
  return { ...fields, id: nextOriginId++, stale: false };
}

/** 光标占位空段落的出身（见 Origin.placeholder）；prevId 是前一个兄弟的 id，第一个子块时为 0 */
export function placeholderOrigin(prevId: number, before: string): Origin {
  return createOrigin({ prevId, ctx: "", before, src: "", placeholder: true });
}

export function getOrigin(node: object): Origin | undefined {
  return origins.get(node);
}

export function setOrigin(node: object, origin: Origin | undefined): void {
  if (origin) origins.set(node, origin);
  else origins.delete(node);
}

/** 节点改了以后，新节点沿用旧节点的出身（同一个 id，标成 stale） */
export function inheritOrigin(newNode: object, oldNode: object): void {
  const origin = origins.get(oldNode);
  if (!origin || newNode === oldNode) return;
  origins.set(newNode, { ...origin, stale: true });
}

/** 叶子块的签名：类型、写法和文字 */
export function leafSignature(node: MdNode): string {
  return JSON.stringify([node.type, node.attrs ?? {}, nodeText(node)]);
}

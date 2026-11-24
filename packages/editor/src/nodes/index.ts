// 文档的节点（1.5.2 节）：名字和属性同 @marko/markdown 的文档模型，模型可以直接当 ProseMirror 的 JSON 用。
// 没有 mark：行内的 Markdown 原文就是文本块里的文字，排版靠装饰（1.6 节、E-2）。
// 写法属性里「没指定」的（编辑器新建的节点）是 null，序列化时按默认写法生成（1.5.4 节）。
// DOM 照 1.11 节：普通的 HTML 元素，类名同 Typora 导出的 HTML，主题两边通用
import { Node, type Attribute } from "@tiptap/core";
import { Table as TiptapTable, TableCell as TiptapTableCell, TableHeader as TiptapTableHeader, TableRow as TiptapTableRow } from "@tiptap/extension-table";

type AttributeSpecs = Record<string, Attribute>;

/** 属性都不自动写到 DOM 上（renderHTML 里需要的自己写） */
function attributes(defaults: Record<string, unknown>): AttributeSpecs {
  return Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name, { default: value, rendered: false }]));
}

const Doc = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
  addAttributes: () => attributes({ eol: "\n", bom: false }),
});

const Text = Node.create({
  name: "text",
  group: "inline",
});

const Paragraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "text*",
  marks: "",
  whitespace: "pre",
  addAttributes: () => attributes({ indent: null }),
  parseHTML: () => [{ tag: "p" }],
  renderHTML: () => ["p", 0],
});

const Heading = Node.create({
  name: "heading",
  group: "block",
  content: "text*",
  marks: "",
  whitespace: "pre",
  defining: true,
  addAttributes: () => attributes({ level: 1, setext: false, indent: null, openSpacing: null, closing: null, underline: null }),
  parseHTML: () => [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
  renderHTML: ({ node }) => [`h${Math.min(6, Math.max(1, Number(node.attrs.level) || 1))}`, 0],
});

const Blockquote = Node.create({
  name: "blockquote",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: () => ["blockquote", 0],
});

const ALERT_KINDS = new Set(["note", "tip", "important", "warning", "caution"]);

const Alert = Node.create({
  name: "alert",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => attributes({ kind: "note", marker: null }),
  parseHTML: () => [{ tag: "div.md-alert" }],
  renderHTML: ({ node }) => {
    const kind = ALERT_KINDS.has(String(node.attrs.kind)) ? String(node.attrs.kind) : "note";
    return ["div", { class: `md-alert md-alert-${kind} ${kind}` }, 0];
  },
});

const BulletList = Node.create({
  name: "bulletList",
  group: "block",
  content: "listItem+",
  addAttributes: () => attributes({ bullet: null, tight: true }),
  parseHTML: () => [{ tag: "ul" }],
  renderHTML: () => ["ul", 0],
});

const OrderedList = Node.create({
  name: "orderedList",
  group: "block",
  content: "listItem+",
  addAttributes: () => attributes({ start: 1, delimiter: null, tight: true }),
  parseHTML: () => [{ tag: "ol" }],
  renderHTML: ({ node }) => {
    const start = Number(node.attrs.start);
    return ["ol", Number.isSafeInteger(start) && start !== 1 ? { start: String(start) } : {}, 0];
  },
});

const ListItem = Node.create({
  name: "listItem",
  content: "block+",
  defining: true,
  addAttributes: () => attributes({ indent: null, marker: null, spacing: null, checked: null }),
  parseHTML: () => [{ tag: "li" }],
  renderHTML: ({ node }) => {
    const checked = node.attrs.checked;
    if (checked === null || checked === undefined) return ["li", 0];
    return ["li", { class: `md-task-list-item task-list-item task-list-${checked ? "done" : "not-done"}`, "data-checked": String(Boolean(checked)) }, 0];
  },
});

/** 内容是纯文本的块：代码、公式、HTML、Front Matter、链接引用定义、缩写定义 */
function codeNode(name: string, defaults: Record<string, unknown>, className: string) {
  return Node.create({
    name,
    group: "block",
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    whitespace: "pre",
    addAttributes: () => attributes(defaults),
    parseHTML: () => [{ tag: `pre.${className}`, preserveWhitespace: "full" }],
    renderHTML: () => ["pre", { class: className }, ["code", 0]],
  });
}

const CodeBlock = codeNode("codeBlock", { indented: false, indent: null, fence: null, info: "", closing: null }, "md-fences");
const Diagram = codeNode("diagram", { indented: false, indent: null, fence: null, info: "mermaid", closing: null, kind: "mermaid" }, "md-diagram");
const MathBlock = codeNode("mathBlock", { indent: null, open: null, close: null }, "md-math-block");
const HtmlBlock = codeNode("htmlBlock", { indent: null, comment: false }, "md-html-block");
const FrontMatter = codeNode("frontMatter", { open: null, close: null }, "md-meta-block");
const ReferenceDefinition = codeNode("referenceDefinition", { indent: null }, "md-def-link");
const AbbreviationDefinition = codeNode("abbreviationDefinition", { indent: null }, "md-def-abbr");

const Toc = Node.create({
  name: "toc",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes: () => attributes({ indent: null, markup: null }),
  parseHTML: () => [{ tag: "div.md-toc" }],
  renderHTML: () => ["div", { class: "md-toc" }],
});

const HorizontalRule = Node.create({
  name: "horizontalRule",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes: () => attributes({ indent: null, markup: null }),
  parseHTML: () => [{ tag: "hr" }],
  renderHTML: () => ["hr"],
});

const FootnoteDefinition = Node.create({
  name: "footnoteDefinition",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => attributes({ label: "", spacing: null }),
  parseHTML: () => [{ tag: "div.md-def-footnote" }],
  renderHTML: ({ node }) => ["div", { class: "md-def-footnote", "data-label": String(node.attrs.label ?? "") }, 0],
});

const DefinitionList = Node.create({
  name: "definitionList",
  group: "block",
  content: "(definitionTerm | definitionDescription)+",
  parseHTML: () => [{ tag: "dl" }],
  renderHTML: () => ["dl", { class: "definition-list" }, 0],
});

const DefinitionTerm = Node.create({
  name: "definitionTerm",
  content: "text*",
  marks: "",
  whitespace: "pre",
  addAttributes: () => attributes({ indent: null }),
  parseHTML: () => [{ tag: "dt" }],
  renderHTML: () => ["dt", 0],
});

const DefinitionDescription = Node.create({
  name: "definitionDescription",
  content: "block+",
  defining: true,
  addAttributes: () => attributes({ indent: null, spacing: null }),
  parseHTML: () => [{ tag: "dd" }],
  renderHTML: () => ["dd", 0],
});

/**
 * 表格：用 @tiptap/extension-table（prosemirror-tables）的节点，行列命令、Tab 跳格、单元格选区是现成的（T 章）。
 * 单元格的内容改成行内原文；对齐写在表格上（每列一个，同 Markdown 的分隔行）；Markdown 的表格没有列宽，不开拖动
 */
const Table = TiptapTable.extend({
  // 表格里面（行与行、格与格之间）不放 gapcursor：在那里输入会多出一行、一列；表格前后照常可以放
  allowGapCursor: false,
  addAttributes: () => attributes({ align: [] }),
  renderHTML: () => ["figure", { class: "table-figure" }, ["table", ["tbody", 0]]],
}).configure({ resizable: false, renderWrapper: false, View: null });

const TableRow = TiptapTableRow.extend({
  allowGapCursor: false,
  renderHTML: () => ["tr", 0],
});

/** prosemirror-tables 要求单元格有这三个属性；Markdown 的表格没有合并单元格，序列化时不看它们 */
const CELL_ATTRIBUTES = { colspan: 1, rowspan: 1, colwidth: null };

const TableHeader = TiptapTableHeader.extend({
  content: "text*",
  marks: "",
  whitespace: "pre",
  addAttributes: () => attributes(CELL_ATTRIBUTES),
  renderHTML: () => ["th", 0],
});

const TableCell = TiptapTableCell.extend({
  content: "text*",
  marks: "",
  whitespace: "pre",
  addAttributes: () => attributes(CELL_ATTRIBUTES),
  renderHTML: () => ["td", 0],
});

/** 文档用到的全部节点 */
export const markdownNodes = [
  Doc,
  Text,
  Paragraph,
  Heading,
  Blockquote,
  Alert,
  BulletList,
  OrderedList,
  ListItem,
  CodeBlock,
  Diagram,
  MathBlock,
  HtmlBlock,
  FrontMatter,
  ReferenceDefinition,
  AbbreviationDefinition,
  Toc,
  HorizontalRule,
  FootnoteDefinition,
  DefinitionList,
  DefinitionTerm,
  DefinitionDescription,
  Table,
  TableRow,
  TableHeader,
  TableCell,
];

/** 只在序列化时用、ProseMirror 里不存的单元格属性 */
export const EDITOR_ONLY_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  tableHeader: Object.keys(CELL_ATTRIBUTES),
  tableCell: Object.keys(CELL_ATTRIBUTES),
};

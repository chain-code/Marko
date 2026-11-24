// 行内命令要知道的结构：源码里哪些范围是行内内容（文本块每行的内容），哪些是代码、公式这类原样的块。
// 从文档树和序列化的位置表上取（不在源码上另外分块，0.2 节第 2 条）；命令执行期间放在 current 里，
// 给移植过来的旧代码用（它们按整篇源码 + 选区工作，参数里没有文档）
import type { Node as PMNode } from "@tiptap/pm/model";
import type { SourceSnapshot } from "../source.ts";
import { toModel } from "../state.ts";

export interface IndexRange {
  start: number;
  end: number;
}

export interface InlineLayout {
  /** 行内内容的范围，按源码顺序：顶层段落是整段，容器里的文本块按行，标题是标题文字，表格是每格 */
  spans: IndexRange[];
  /** 代码块、公式块、HTML 块、Front Matter、链接引用定义、缩写定义、分隔线、目录的范围 */
  raw: IndexRange[];
  /** 代码块、公式块、HTML 块、Front Matter：start 是开头那一行的行首，end 是最后一行的行尾 */
  fenced: IndexRange[];
  /** 顶层块：类型名同旧版（frontmatter 等）、范围（不含块后的换行） */
  blocks: Array<IndexRange & { type: string }>;
  /** 列表项：范围和所在列表的编号（同一个列表的项编号相同） */
  listItems: Array<IndexRange & { list: number }>;
  /** 算出这张表的文档和源码（行内片段等用到时再算，format.ts） */
  doc: PMNode;
  source: SourceSnapshot;
}

const FENCED = new Set(["codeBlock", "diagram", "mathBlock", "htmlBlock", "frontMatter"]);

const RAW = new Set(["codeBlock", "diagram", "mathBlock", "htmlBlock", "frontMatter", "referenceDefinition", "abbreviationDefinition", "horizontalRule", "toc"]);

export function buildInlineLayout(doc: PMNode, source: SourceSnapshot): InlineLayout {
  const { map } = source.map;
  const spans: IndexRange[] = [];
  const raw: IndexRange[] = [];
  const fenced: IndexRange[] = [];
  const blocks: InlineLayout["blocks"] = [];
  const listItems: InlineLayout["listItems"] = [];
  doc.forEach((child) => {
    const range = map.ranges.get(toModel(child));
    if (range) blocks.push({ start: range.start, end: range.end, type: child.type.name === "frontMatter" ? "frontmatter" : child.type.name });
  });
  const lists = new Map<PMNode, number>();
  doc.descendants((node, _pos, parent) => {
    const model = toModel(node);
    if (node.type.name === "listItem" && parent) {
      const range = map.ranges.get(model);
      if (!lists.has(parent)) lists.set(parent, lists.size);
      if (range) listItems.push({ start: range.start, end: range.end, list: lists.get(parent) ?? 0 });
    }
    if (RAW.has(node.type.name)) {
      const range = map.ranges.get(model);
      if (range) raw.push({ start: range.start, end: range.end });
      if (range && FENCED.has(node.type.name)) {
        const lineStart = range.start > 0 ? source.text.lastIndexOf("\n", range.start - 1) + 1 : 0;
        fenced.push({ start: lineStart, end: range.end });
      }
      return false;
    }
    if (!node.isTextblock) return true;
    const leaf = map.byNode.get(model);
    if (!leaf) return false;
    const lines = leaf.lines.map((line, index) => ({ start: leaf.starts[index], end: leaf.starts[index] + line.length }));
    if (node.type.name === "paragraph" && parent?.type.name === "doc") {
      // 顶层段落：整段一个范围（同旧版）
      const end = lines[lines.length - 1].end;
      if (end > lines[0].start) spans.push({ start: lines[0].start, end });
    } else {
      for (const line of lines) if (line.end > line.start && source.text.slice(line.start, line.end).trim()) spans.push(line);
    }
    return false;
  });
  spans.sort((left, right) => left.start - right.start);
  return { spans, raw, fenced, blocks, listItems, doc, source };
}

/** 这一行（行首 lineStart）在代码块、公式块、HTML 块、Front Matter 里面（开头那一行不算） */
export function insideFencedBlock(lineStart: number): boolean {
  return currentInlineLayout().fenced.some((block) => lineStart > block.start && lineStart <= block.end);
}

let current: InlineLayout | null = null;

export function currentInlineLayout(): InlineLayout {
  if (!current) throw new Error("行内命令要在 withInlineLayout 里执行");
  return current;
}

export function withInlineLayout<T>(layout: InlineLayout, run: () => T): T {
  const previous = current;
  current = layout;
  try {
    return run();
  } finally {
    current = previous;
  }
}

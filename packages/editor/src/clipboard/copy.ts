// 复制、剪切（C-1、C-2）：选区的 Markdown 源码、渲染后的 HTML、去掉标记的纯文本。
// 选区只盖住片段的一部分时补全成对的标记（选中粗体里的几个字，复制出来还是粗体）
import {
  blockChildren,
  inlineFragments,
  isLeaf,
  isTextblock,
  nodeText,
  parse,
  plainText,
  walkFragments,
  type Fragment,
  type MdNode,
  type SyntaxOptions,
} from "@marko/markdown";
import { renderHtml } from "@marko/render";
import { Fragment as PMFragment } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { EditorHost } from "../host.ts";
import type { EditorSettings } from "../settings.ts";
import { INLINE_TEXTBLOCKS } from "../plugins/inlineSyntax.ts";
import { serializeDoc } from "../state.ts";

/**
 * 一个文本块里 [from, to) 的原文，选区切开的片段补上标记：整个在某个片段的内容里时两头都补，
 * 只盖住开头或结尾时补另一头。切到原子片段（图片、公式……）的一部分时整个带上
 */
export function completeInline(text: string, from: number, to: number, fragments: Fragment[]): string {
  let start = from;
  let end = to;
  // 原子片段、标记切开了：扩到整个片段、整个标记
  walkFragments(fragments, (fragment) => {
    if (fragment.atomic) {
      if (start > fragment.from && start < fragment.to) start = fragment.from;
      if (end > fragment.from && end < fragment.to) end = fragment.to;
    }
    for (const mark of fragment.marks) {
      if (start > mark.from && start < mark.to) start = mark.from;
      if (end > mark.from && end < mark.to) end = mark.to;
    }
  });
  let prefix = "";
  let suffix = "";
  walkFragments(fragments, (fragment) => {
    const content = fragment.content;
    if (!content || fragment.atomic || fragment.marks.length < 2) return;
    const open = text.slice(fragment.marks[0].from, fragment.marks[0].to);
    const close = text.slice(fragment.marks[fragment.marks.length - 1].from, fragment.marks[fragment.marks.length - 1].to);
    const startsInside = start >= content.from && start <= content.to && start > fragment.from;
    const endsInside = end >= content.from && end <= content.to && end < fragment.to;
    // 外层的标记包在外面：先遇到的是外层
    if (startsInside) prefix += open;
    if (endsInside) suffix = close + suffix;
  });
  return prefix + text.slice(start, end) + suffix;
}

/** 选区里的内容做成一篇文档：外面各层容器照原样套上（列表、引用里选了一段，复制出来还在列表、引用里） */
function selectionDoc(state: EditorState) {
  const { $from, $to } = state.selection;
  const depth = $from.sharedDepth($to.pos);
  let content = state.doc.slice($from.pos, $to.pos).content;
  // slice 的内容在两端共同的那一层里
  for (let level = depth; level > 0; level -= 1) content = PMFragment.from($from.node(level).copy(content));
  return state.doc.copy(content);
}

/** 选区的 Markdown 源码（C-1、C-2「复制为 Markdown」） */
export function selectedMarkdown(state: EditorState, syntax: SyntaxOptions): string {
  const { selection } = state;
  if (selection.empty) return "";
  if (selection instanceof CellSelection) return cellsMarkdown(selection);
  const { $from, $to } = selection;
  // 在一个文本块里：行内原文，补全切开的片段
  if ($from.sameParent($to) && $from.parent.isTextblock) {
    const text = $from.parent.textContent;
    if (!INLINE_TEXTBLOCKS.has($from.parent.type.name)) return text.slice($from.parentOffset, $to.parentOffset);
    return completeInline(text, $from.parentOffset, $to.parentOffset, inlineFragments(text, syntax));
  }
  return serializeDoc(selectionDoc(state), { bom: false }).replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, "");
}

/** 选中的单元格做成一张 Markdown 表格（第一行当表头） */
function cellsMarkdown(selection: CellSelection): string {
  const rows = new Map<number, string[]>();
  selection.forEachCell((cell, pos) => {
    const row = selection.$anchorCell.doc.resolve(pos).index(-1);
    const cells = rows.get(row) ?? [];
    cells.push(cell.textContent);
    rows.set(row, cells);
  });
  const lines = [...rows.values()];
  if (!lines.length) return "";
  const width = Math.max(...lines.map((line) => line.length));
  const format = (cells: string[]) => `| ${[...cells, ...Array<string>(width - cells.length).fill("")].join(" | ")} |`;
  return [format(lines[0]), `| ${Array<string>(width).fill("---").join(" | ")} |`, ...lines.slice(1).map(format)].join("\n");
}

/** 一篇文档去掉标记的文字（C-1 不复制源码时的纯文本、C-2「复制为纯文本」）：块之间换行，表格的格子之间用制表符 */
export function documentPlainText(doc: MdNode, syntax: SyntaxOptions): string {
  const lines: string[] = [];
  const visit = (node: MdNode) => {
    if (node.type === "table") {
      for (const row of blockChildren(node)) {
        lines.push(blockChildren(row).map((cell) => plainText(nodeText(cell), inlineFragments(nodeText(cell), syntax))).join("\t"));
      }
      return;
    }
    if (isTextblock(node.type)) {
      const text = nodeText(node);
      lines.push(plainText(text, inlineFragments(text, syntax)));
      return;
    }
    if (isLeaf(node.type)) {
      // 代码、公式、HTML 照原样；分隔线、目录这类没有文字
      const text = nodeText(node);
      if (text) lines.push(text);
      return;
    }
    for (const child of blockChildren(node)) visit(child);
  };
  visit(doc);
  return lines.join("\n");
}

export interface ClipboardContent {
  markdown: string;
  html: string;
  text: string;
}

/** 选区放进剪贴板的几种格式；HTML 按编辑器的设置渲染，同导出（通用规则 2） */
export function selectionClipboard(state: EditorState, syntax: SyntaxOptions, host: EditorHost, settings?: Partial<EditorSettings>): ClipboardContent {
  const markdown = selectedMarkdown(state, syntax);
  const model = parse(markdown, { syntax });
  return {
    markdown,
    html: renderHtml(model, {
      syntax,
      resolveUrl: (url, kind) => host.resolveUrl(url, kind),
      preserveLineBreaks: settings?.preserveSingleLineBreaks,
      smartQuotes: settings?.smartQuotes,
      smartDashes: settings?.smartDashes,
      mathNumbering: settings?.mathNumbering,
      codeLineNumbers: settings?.codeLineNumbers,
    }),
    text: documentPlainText(model, syntax),
  };
}

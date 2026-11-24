// 命令要知道的结构：光标在哪个文本块里、外面套着哪些容器。结构只从文档树上取（Lezer 解析的结果），
// 不在源码上另外判断（0.2 节第 2 条）；源码只用来读这一行的前缀、算改动
import type { BlockRange, LeafPosition } from "@marko/markdown";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { SourceSnapshot } from "../source.ts";
import { toModel } from "../state.ts";

export interface BlockInfo {
  node: PMNode;
  /** 节点前面的位置 */
  pos: number;
  /** 这一块在源码里的范围（没输出时为 null） */
  range: BlockRange | null;
  /** 文本块每行内容在源码里的起点 */
  leaf: LeafPosition | null;
}

export interface CursorContext {
  /** 选区头所在的文本块；不在文本块里时为 null */
  block: BlockInfo | null;
  /** 外层的块，从外到内（不含 doc 和文本块本身） */
  ancestors: BlockInfo[];
  /** 选区两端在同一个文本块里 */
  sameBlock: boolean;
}

export function blockInfo(source: SourceSnapshot, node: PMNode, pos: number): BlockInfo {
  const model = toModel(node);
  return { node, pos, range: source.map.map.ranges.get(model) ?? null, leaf: source.map.map.byNode.get(model) ?? null };
}

function textblockOf($pos: ResolvedPos): { node: PMNode; pos: number; depth: number } | null {
  if ($pos.parent.isTextblock) return { node: $pos.parent, pos: $pos.before(), depth: $pos.depth };
  return null;
}

export function cursorContext(state: EditorState, source: SourceSnapshot): CursorContext {
  const { $head, $anchor } = state.selection;
  const head = textblockOf($head);
  const anchor = textblockOf($anchor);
  const ancestors: BlockInfo[] = [];
  const depth = head ? head.depth - 1 : $head.depth;
  for (let d = 1; d <= depth; d += 1) ancestors.push(blockInfo(source, $head.node(d), $head.before(d)));
  return {
    block: head ? blockInfo(source, head.node, head.pos) : null,
    ancestors,
    sameBlock: Boolean(head && anchor && head.pos === anchor.pos),
  };
}

/** 最近的一层类型是 types 之一的外层块 */
export function nearest(context: CursorContext, ...types: string[]): BlockInfo | null {
  for (let index = context.ancestors.length - 1; index >= 0; index -= 1) {
    if (types.includes(context.ancestors[index].node.type.name)) return context.ancestors[index];
  }
  return null;
}

export function inside(context: CursorContext, ...types: string[]): boolean {
  return nearest(context, ...types) !== null;
}

/** 光标所在文本块的类型 */
export function blockType(context: CursorContext): string | null {
  return context.block?.node.type.name ?? null;
}

/** 内容是纯文本、按原样编辑的块（代码、公式、HTML、Front Matter） */
export const RAW_TYPES = new Set(["codeBlock", "diagram", "mathBlock", "htmlBlock", "frontMatter"]);

export function inRawBlock(context: CursorContext): boolean {
  const type = blockType(context);
  return type !== null && RAW_TYPES.has(type);
}

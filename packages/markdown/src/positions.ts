// 文档位置 ↔ 源码偏移（1.5.6 节）：源码模式切换、查找、外部修改的合并、状态栏的行列、跳到搜索结果都用它
import { blockChildren, isLeaf, nodeText, type MdNode } from "./model.ts";
import { serialize, type SerializeOptions } from "./serialize.ts";

export interface LeafPosition {
  node: MdNode;
  /** 从文档开始的下标路径（每层是子块的序号） */
  path: number[];
  /** 文字每一行的内容在源码里的起点 */
  starts: number[];
  /** 文字的各行 */
  lines: string[];
}

export interface SourceMap {
  /** 序列化出来的源码 */
  text: string;
  /** 所有叶子块（含表格单元格），按源码顺序 */
  leaves: LeafPosition[];
  byNode: Map<MdNode, LeafPosition>;
  /** 每个输出了的块（含容器）：块前空行的起点、块的起点和终点 */
  ranges: Map<MdNode, BlockRange>;
  /** 容器里子块每行的规范前缀、内容的起点（容器开头的符号之后） */
  inner: Map<MdNode, { prefix: string; contentStart: number }>;
}

export interface BlockRange {
  gapStart: number;
  start: number;
  end: number;
}

/** 序列化，同时记下每个叶子块每行内容在源码里的位置 */
export function buildSourceMap(doc: MdNode, options: Omit<SerializeOptions, "onLeaf"> = {}): SourceMap {
  const paths = new Map<MdNode, number[]>();
  const walk = (node: MdNode, path: number[]) => {
    paths.set(node, path);
    if (isLeaf(node.type)) return;
    blockChildren(node).forEach((child, index) => walk(child, [...path, index]));
  };
  walk(doc, []);
  const leaves: LeafPosition[] = [];
  const byNode = new Map<MdNode, LeafPosition>();
  const ranges = new Map<MdNode, BlockRange>();
  const inner = new Map<MdNode, { prefix: string; contentStart: number }>();
  const text = serialize(doc, {
    ...options,
    onBlock(node, gapStart, start, end) {
      ranges.set(node, { gapStart, start, end });
    },
    onContainer(node, prefix, contentStart) {
      inner.set(node, { prefix, contentStart });
    },
    onLeaf(node, starts) {
      const position = { node, path: paths.get(node) ?? [], starts, lines: nodeText(node).split("\n") };
      leaves.push(position);
      byNode.set(node, position);
    },
  });
  leaves.sort((left, right) => left.starts[0] - right.starts[0]);
  return { text, leaves, byNode, ranges, inner };
}

/** 叶子块文字里的偏移 → 源码偏移 */
export function sourceOffset(map: SourceMap, node: MdNode, textOffset: number): number | null {
  const position = map.byNode.get(node);
  if (!position) return null;
  let remaining = Math.max(0, textOffset);
  for (let line = 0; line < position.lines.length; line += 1) {
    const length = position.lines[line].length;
    if (remaining <= length || line === position.lines.length - 1) return position.starts[line] + Math.min(remaining, length);
    remaining -= length + 1;
  }
  return position.starts[0];
}

/** 源码偏移 → 所在（或最近的前一个）叶子块和块内文字偏移 */
export function locateSource(map: SourceMap, offset: number): { node: MdNode; path: number[]; textOffset: number } | null {
  let found: LeafPosition | null = null;
  for (const leaf of map.leaves) {
    if (leaf.starts[0] > offset) break;
    found = leaf;
  }
  if (!found) found = map.leaves[0] ?? null;
  if (!found) return null;
  let textOffset = 0;
  for (let line = 0; line < found.lines.length; line += 1) {
    const start = found.starts[line];
    const length = found.lines[line].length;
    if (offset < start) break;
    if (offset <= start + length || line === found.lines.length - 1) {
      return { node: found.node, path: found.path, textOffset: textOffset + Math.min(Math.max(0, offset - start), length) };
    }
    textOffset += length + 1;
  }
  return { node: found.node, path: found.path, textOffset: Math.min(textOffset, nodeText(found.node).length) };
}

/** 源码偏移 → 从 1 开始的行和列（V-4 状态栏；"\r\n"、"\r"、"\n" 都算换行） */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  const safe = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < safe; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 10 || (code === 13 && text.charCodeAt(i + 1) !== 10)) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: safe - lineStart + 1 };
}

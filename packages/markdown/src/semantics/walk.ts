// 遍历文档里的块，带上路径
import { blockChildren, isLeaf, isTextblock, nodeText, type MdNode } from "../model.ts";

export interface Visit {
  node: MdNode;
  path: number[];
  parent: MdNode | null;
}

export function walkBlocks(doc: MdNode, visit: (entry: Visit) => void): void {
  const walk = (node: MdNode, path: number[], parent: MdNode | null) => {
    visit({ node, path, parent });
    if (isLeaf(node.type)) return;
    blockChildren(node).forEach((child, index) => walk(child, [...path, index], node));
  };
  walk(doc, [], null);
}

/** 所有文本块（段落、标题、单元格、词条），按文档顺序 */
export function textblocks(doc: MdNode): Array<{ node: MdNode; path: number[]; text: string }> {
  const result: Array<{ node: MdNode; path: number[]; text: string }> = [];
  walkBlocks(doc, ({ node, path }) => {
    if (isTextblock(node.type)) result.push({ node, path, text: nodeText(node) });
  });
  return result;
}

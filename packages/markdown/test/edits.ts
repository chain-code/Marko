// 测试用的不可变编辑：改动路径上的祖先都换成新对象并沿用出身（编辑器的事务后也要这样做，见阶段 4）
import {
  blockChildren,
  inheritOrigin,
  isCode,
  isLeaf,
  isTextblock,
  makeLeaf,
  nodeText,
  type MdNode,
} from "../src/model.ts";

export type Path = number[];

export function nodeAt(doc: MdNode, path: Path): MdNode {
  let node = doc;
  for (const index of path) node = blockChildren(node)[index];
  return node;
}

/** 把 path 处的节点换成 replace 的结果（可以是多个节点，或空数组表示删除） */
export function replaceAt(doc: MdNode, path: Path, replace: (node: MdNode) => MdNode[]): MdNode {
  if (path.length === 0) throw new Error("不能替换文档本身");
  const [index, ...rest] = path;
  const children = blockChildren(doc);
  const replaced = rest.length === 0 ? replace(children[index]) : [replaceAt(children[index], rest, replace)];
  const copy: MdNode = { ...doc, content: [...children.slice(0, index), ...replaced, ...children.slice(index + 1)] };
  inheritOrigin(copy, doc);
  return copy;
}

/** 在 path 所指的容器里第 index 个位置插入节点 */
export function insertAt(doc: MdNode, containerPath: Path, index: number, nodes: MdNode[]): MdNode {
  const edit = (container: MdNode): MdNode => {
    const children = blockChildren(container);
    const copy: MdNode = { ...container, content: [...children.slice(0, index), ...nodes, ...children.slice(index)] };
    inheritOrigin(copy, container);
    return copy;
  };
  if (containerPath.length === 0) return edit(doc);
  return replaceAt(doc, containerPath, (container) => [edit(container)]);
}

/** 改叶子块的文字：新节点沿用出身（内容变了，标成 stale） */
export function withText(node: MdNode, text: string): MdNode {
  const next = makeLeaf(node.type, node.attrs ?? {}, text);
  inheritOrigin(next, node);
  return next;
}

export function withAttrs(node: MdNode, attrs: Record<string, unknown>): MdNode {
  const next: MdNode = { ...node, attrs: { ...node.attrs, ...attrs } };
  inheritOrigin(next, node);
  return next;
}

export interface Targets {
  /** 文本块和纯文本块 */
  leaves: Path[];
  /** 可以插入段落的容器（文档、引用、列表项……） */
  flows: Path[];
  /** 可以删掉的块（删了以后容器仍然合法） */
  removable: Path[];
  headings: Path[];
  listItems: Path[];
  tables: Path[];
  codeBlocks: Path[];
}

const FLOW_CONTAINERS = new Set(["doc", "blockquote", "alert", "listItem", "footnoteDefinition", "definitionDescription"]);

export function collectTargets(doc: MdNode): Targets {
  const targets: Targets = { leaves: [], flows: [], removable: [], headings: [], listItems: [], tables: [], codeBlocks: [] };
  const walk = (node: MdNode, path: Path, parent: MdNode | null) => {
    if (FLOW_CONTAINERS.has(node.type)) targets.flows.push(path);
    if (isTextblock(node.type) || isCode(node.type)) targets.leaves.push(path);
    if (node.type === "heading") targets.headings.push(path);
    if (node.type === "listItem") targets.listItems.push(path);
    if (node.type === "table") targets.tables.push(path);
    if (node.type === "codeBlock" && !node.attrs?.indented) targets.codeBlocks.push(path);
    if (parent && path.length) {
      const siblings = blockChildren(parent).length;
      const removableHere =
        (FLOW_CONTAINERS.has(parent.type) && node.type !== "frontMatter") ||
        ((parent.type === "bulletList" || parent.type === "orderedList") && siblings > 1) ||
        (parent.type === "table" && path[path.length - 1] > 0);
      if (removableHere) targets.removable.push(path);
    }
    if (isLeaf(node.type)) return;
    blockChildren(node).forEach((child, index) => walk(child, [...path, index], node));
  };
  walk(doc, [], null);
  return targets;
}

export function textOf(node: MdNode): string {
  return nodeText(node);
}

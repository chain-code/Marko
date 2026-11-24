// 文档模型 ↔ ProseMirror 文档；选区 ↔ 源码偏移（1.5.4、1.5.6 节）。
// 出身（origin）按节点对象登记：模型变成 ProseMirror 节点时转到新对象上；ProseMirror 节点变回模型时再转回去。
// 没改过的节点在事务前后是同一个对象，所以 ProseMirror → 模型按节点对象缓存，整篇序列化时没改的子树原样复用
import {
  blockChildren,
  buildSourceMap,
  getOrigin,
  isBlankParagraph,
  locateSource,
  makeContainer,
  makeLeaf,
  parse,
  serialize,
  setOrigin,
  sourceOffset,
  type MdNode,
  type Origin,
  type ParseOptions,
  type SerializeOptions,
  type SourceMap,
} from "@marko/markdown";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import type { Transform } from "@tiptap/pm/transform";
import { EDITOR_ONLY_ATTRIBUTES } from "./nodes/index.ts";

/** ProseMirror 里的块，内容是一段文字（文本块和纯文本块） */
function hasText(node: PMNode): boolean {
  return node.isTextblock;
}

/** 模型的子块和 ProseMirror 节点的子块一一对应：把出身转过去 */
function transferOrigins(model: MdNode, node: PMNode): void {
  setOrigin(node, getOrigin(model));
  if (hasText(node) || node.isAtom) return;
  const children = blockChildren(model);
  node.forEach((child, _offset, index) => {
    const source = children[index];
    if (source) transferOrigins(source, child);
  });
}

/** 空文档、空容器里放一个空段落（ProseMirror 的内容表达式要求至少一块；空段落不序列化） */
function withPlaceholders(model: MdNode): MdNode {
  if (model.type !== "doc" || blockChildren(model).length) return model;
  const doc = makeContainer("doc", model.attrs ?? {}, [makeLeaf("paragraph", { indent: "" }, "")]);
  setOrigin(doc, getOrigin(model));
  return doc;
}

/** 模型 → ProseMirror 文档（节点名、属性同模型，可以直接当 JSON 用） */
export function toProseMirror(schema: Schema, model: MdNode): PMNode {
  const source = withPlaceholders(model);
  const node = schema.nodeFromJSON(source);
  transferOrigins(source, node);
  return node;
}

/** Markdown 源码 → ProseMirror 文档 */
export function parseToProseMirror(schema: Schema, markdown: string, options: ParseOptions = {}): PMNode {
  return toProseMirror(schema, parse(markdown, options));
}

const models = new WeakMap<PMNode, MdNode>();

/**
 * ProseMirror 节点 → 模型；同一个节点对象返回同一个模型对象，出身跟着节点走（命中缓存时只同步这个节点自己的出身）。
 * 节点转过以后又带上了出身（对齐插件的 appendTransaction 给新节点带出身，在别的插件的 apply 之后），
 * 要 forgetModel 它和它外面的各层，不然缓存的容器模型里还是没有出身的子节点
 */
export function toModel(node: PMNode): MdNode {
  const cached = models.get(node);
  if (cached) {
    setOrigin(cached, getOrigin(node));
    return cached;
  }
  const attrs: Record<string, unknown> = { ...node.attrs };
  for (const name of EDITOR_ONLY_ATTRIBUTES[node.type.name] ?? []) delete attrs[name];
  const type = node.type.name as MdNode["type"];
  let model: MdNode;
  if (hasText(node)) model = makeLeaf(type, attrs, node.textContent);
  else if (node.isAtom || node.isLeaf) model = { type, attrs };
  else {
    const children: MdNode[] = [];
    node.forEach((child) => children.push(toModel(child)));
    model = makeContainer(type, attrs, children);
  }
  setOrigin(model, getOrigin(node));
  models.set(node, model);
  return model;
}

/**
 * 给文档里已有的块换出身（@marko/markdown 的 Replacement.next：对齐后保留下来的块接上新的前一个兄弟）。
 * 出身对象是旧文档共用的（撤销靠它恢复原文，E-6），不能就地改：把这个块换成内容相同的新节点
 * （只换外壳，里面的位置照常映射，NodeView 照常复用），新节点带新出身
 */
export function renewOrigin(tr: Transform, pos: number, origin: Origin): void {
  const node = tr.doc.nodeAt(pos);
  if (!node) return;
  tr.setNodeMarkup(pos, undefined, node.attrs, node.marks);
  const renewed = tr.doc.nodeAt(pos);
  if (renewed) setOrigin(renewed, origin);
}

/** 丢掉节点的模型缓存（它下面的节点出身变了，见 toModel） */
export function forgetModel(node: PMNode): void {
  models.delete(node);
}

/** ProseMirror 文档 → Markdown 源码 */
export function serializeDoc(doc: PMNode, options: SerializeOptions = {}): string {
  return serialize(toModel(doc), options);
}

// ---------------------------------------------------------------------------
// 选区 ↔ 源码偏移

export interface DocSourceMap {
  map: SourceMap;
  /** 每个文本块的模型 → 它在 ProseMirror 文档里的位置（节点前面） */
  positions: Map<MdNode, number>;
  /** 按位置排好的文本块：模型和 ProseMirror 位置 */
  blocks: Array<{ model: MdNode; pos: number; node: PMNode }>;
}

export interface DocSourceMapOptions extends Omit<SerializeOptions, "onLeaf" | "keepBlank"> {
  /** 哪些空段落照常输出（一个空行）：光标在空段落里时，源码里得有它的位置 */
  keepBlank?: (pos: number, node: PMNode) => boolean;
}

/** 选区两端所在的空段落照常输出 */
export function keepBlankAt(...positions: number[]): (pos: number, node: PMNode) => boolean {
  return (pos, node) => positions.some((at) => at > pos && at < pos + node.nodeSize);
}

/** 整篇序列化并记下每个文本块的位置 */
export function buildDocSourceMap(doc: PMNode, options: DocSourceMapOptions = {}): DocSourceMap {
  const model = toModel(doc);
  const positions = new Map<MdNode, number>();
  const blocks: DocSourceMap["blocks"] = [];
  const keepBlank = new Set<MdNode>();
  const { keepBlank: keep, ...serializeOptions } = options;
  doc.descendants((node, pos) => {
    if (!hasText(node)) return true;
    const nodeModel = toModel(node);
    positions.set(nodeModel, pos);
    blocks.push({ model: nodeModel, pos, node });
    if (keep && isBlankParagraph(nodeModel) && keep(pos, node)) keepBlank.add(nodeModel);
    return false;
  });
  // 编辑器内部的源码不带 BOM：命令、源码模式看到的第一行从内容开始（审查 #2、#6）；保存时 serializeDoc 按文档的 bom 属性写回
  return { map: buildSourceMap(model, { ...serializeOptions, keepBlank, bom: false }), positions, blocks };
}

/** 文档位置 → 源码偏移；不在文本块里（如节点选区的边界）时取最近的文本块的开头或结尾 */
export function positionToOffset(source: DocSourceMap, pos: number): number {
  let best: { model: MdNode; pos: number; node: PMNode } | null = null;
  for (const block of source.blocks) {
    const start = block.pos + 1;
    const end = block.pos + block.node.nodeSize - 1;
    if (pos >= start && pos <= end) {
      const offset = sourceOffset(source.map, block.model, pos - start);
      if (offset !== null) return offset;
    }
    if (block.pos < pos && source.map.byNode.has(block.model)) best = block;
  }
  if (best) {
    const offset = sourceOffset(source.map, best.model, best.node.content.size);
    if (offset !== null) return offset;
  }
  return 0;
}

/** 源码偏移 → 文档位置（落在所在或最近的前一个文本块里） */
export function offsetToPosition(source: DocSourceMap, offset: number): number {
  const located = locateSource(source.map, offset);
  if (!located) return 1;
  const pos = source.positions.get(located.node);
  return pos === undefined ? 1 : pos + 1 + located.textOffset;
}

// 每次改动后让文档和 Markdown 的理解保持一致（1.5.4、1.5.5 节）：
// 1. 文档节点（每次都是新对象）沿用旧文档的出身，文末空行（tail）就在它上面；
// 2. 新出现的节点按位置映射找到旧文档里对应的节点，同类型就沿用它的出身（标成 stale，只用来保留块前空行和没改的行的前缀）；
// 3. 改动涉及的顶层块交给 @marko/markdown 的 reconcile 重新解析，结构变了就换成解析的结果，选区按源码偏移换回去。
//    例：段落开头输入「# 」变成标题；段落下一行输入「===」变成 Setext 标题。
// 输入法组合期间不做（E-12），组合结束后由 composition 插件补一次（meta RECONCILE）
import { getOrigin, inheritOrigin, reconcile, setOrigin, type MdNode, type ParseOptions } from "@marko/markdown";
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { CellSelection } from "@tiptap/pm/tables";
import { placeSelection, selectionOffsets } from "../source.ts";
import { buildDocSourceMap, forgetModel, keepBlankAt, renewOrigin, toModel, toProseMirror } from "../state.ts";
import { HistoryDocs, restoreOrigins } from "./historyOrigins.ts";
import { RECONCILE, SKIP_RECONCILE } from "./meta.ts";

export const reconcileKey = new PluginKey("markoReconcile");

export { RECONCILE, SKIP_RECONCILE } from "./meta.ts";

export interface ReconcileOptions {
  /** 解析选项（S-8 的语法开关） */
  parse: () => ParseOptions;
  /**
   * 文档里这个文本块正在输入、还不能转换（E-4：「```」「$$」「---」这类要按回车才转换），返回 true 时不替换它
   */
  defer?: (state: EditorState, replaced: { from: number; to: number }, fresh: MdNode[]) => boolean;
}

/** 新文档里每个顶层块的起点 */
function topLevelStarts(doc: PMNode): number[] {
  const starts: number[] = [];
  doc.forEach((_child, offset) => starts.push(offset));
  return starts;
}

/**
 * 新出现的节点沿用旧文档里同一位置的同类节点的出身。别的插件在 apply 里可能已经把这些节点转成过模型（toModel），
 * 带上出身的节点和它外面的各层丢掉模型缓存
 */
function inheritOrigins(oldDoc: PMNode, doc: PMNode, mapping: Mapping): void {
  const back = mapping.invert();
  const visit = (node: PMNode, pos: number): boolean => {
    let changed = false;
    node.forEach((child, offset) => {
      const childPos = pos + offset;
      if (getOrigin(child)) return;
      const oldPos = back.map(childPos, 1);
      const old = oldPos >= 0 && oldPos < oldDoc.content.size ? oldDoc.nodeAt(oldPos) : null;
      let childChanged = false;
      if (old && old.type === child.type && getOrigin(old)) {
        inheritOrigin(child, old);
        childChanged = true;
      }
      if (!child.isTextblock && !child.isAtom && visit(child, childPos + 1)) childChanged = true;
      if (childChanged) {
        forgetModel(child);
        changed = true;
      }
    });
    return changed;
  };
  if (visit(doc, 0)) forgetModel(doc);
}

/** 文档范围 [from, to] 涉及的顶层块 */
function topLevelRange(doc: PMNode, range: PendingComposition): { from: number; to: number } {
  const starts = topLevelStarts(doc);
  let from = 0;
  while (from + 1 < starts.length && starts[from + 1] <= range.from) from += 1;
  let to = from + 1;
  while (to < starts.length && starts[to] < range.to) to += 1;
  return { from, to };
}

/** 改动涉及的顶层块：[from, to) */
function changedRange(doc: PMNode, transactions: readonly Transaction[]): { from: number; to: number } | null {
  let start = Infinity;
  let end = -Infinity;
  transactions.forEach((tr, index) => {
    // 每一步改动的区间映射到最后的文档上：先过这个事务后面的步骤，再过后面的事务
    const later = new Mapping();
    for (const next of transactions.slice(index + 1)) later.appendMapping(next.mapping);
    tr.mapping.maps.forEach((map, step) => {
      const rest = tr.mapping.slice(step + 1);
      map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
        start = Math.min(start, later.map(rest.map(newStart, -1), -1));
        end = Math.max(end, later.map(rest.map(newEnd, 1), 1));
      });
    });
  });
  if (start === Infinity) return null;
  const starts = topLevelStarts(doc);
  let from = 0;
  while (from + 1 < starts.length && starts[from + 1] <= start) from += 1;
  let to = from + 1;
  while (to < starts.length && starts[to] < end) to += 1;
  return { from, to };
}

export function reconcileTransaction(state: EditorState, range: { from: number; to: number }, options: ReconcileOptions): Transaction | null {
  const doc = state.doc;
  const model = toModel(doc);
  const replacement = reconcile(model, range.from, range.to, options.parse());
  if (!replacement) return null;
  if (options.defer?.(state, replacement, replacement.blocks)) return null;
  const starts = topLevelStarts(doc);
  const from = starts[replacement.from] ?? doc.content.size;
  const to = replacement.to < starts.length ? starts[replacement.to] : doc.content.size;
  const { anchor, head } = state.selection;
  // 选区在被替换的块里时按源码偏移换回去；在别处时 ProseMirror 映射过来的就对
  const inside = [anchor, head].some((pos) => pos >= from && pos <= to);
  const before = inside ? buildDocSourceMap(doc, { keepBlank: keepBlankAt(anchor, head) }) : null;
  const blocks = replacement.blocks.map((block) => toProseMirror(state.schema, block));
  const tr = state.tr.replaceWith(from, to, blocks);
  if (replacement.next) renewOrigin(tr, tr.mapping.map(starts[replacement.next.index]), replacement.next.origin);
  const origin = getOrigin(doc);
  // 出身对象是旧文档共用的（撤销还要用），换文末空行时复制一份
  setOrigin(tr.doc, origin && replacement.tail !== undefined ? { ...origin, tail: replacement.tail } : origin);
  // 选区按源码偏移换回去；落在空行上时放光标占位段落（同按源码改动的命令，source.ts）
  if (before) {
    const offsets = selectionOffsets(state.selection, before);
    placeSelection(tr, state.schema, offsets.anchor, offsets.head, { cells: state.selection instanceof CellSelection });
  }
  tr.setMeta(SKIP_RECONCILE, true);
  return tr;
}

/** 输入法组合期间改过的范围（文档位置），组合结束后只对齐这一段（E-12）；对齐过了清掉 */
interface PendingComposition {
  from: number;
  to: number;
}

export function reconcilePlugin(options: ReconcileOptions): Plugin<PendingComposition | null> {
  const history = new HistoryDocs();
  return new Plugin<PendingComposition | null>({
    key: reconcileKey,
    state: {
      init: () => null,
      apply(tr, pending) {
        if (tr.getMeta(reconcileKey) === "done") return null;
        let next = pending && tr.docChanged ? { from: tr.mapping.map(pending.from, -1), to: tr.mapping.map(pending.to, 1) } : pending;
        if (tr.docChanged && tr.getMeta("composition") !== undefined) {
          tr.mapping.maps.forEach((map, index) => {
            const rest = tr.mapping.slice(index + 1);
            map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
              const from = rest.map(newStart, -1);
              const to = rest.map(newEnd, 1);
              next = next ? { from: Math.min(next.from, from), to: Math.max(next.to, to) } : { from, to };
            });
          });
        }
        return next;
      },
    },
    appendTransaction(transactions, oldState, newState) {
      // 撤销、重做：文档和记下的那个结构相同时出身照抄，原文逐字节回到原来的样子（E-6）
      let restored = false;
      if (transactions[0].getMeta("appendedTransaction") === undefined) {
        const expected = history.track(transactions[0], oldState, newState);
        if (expected && expected !== newState.doc && expected.eq(newState.doc)) {
          restoreOrigins(expected, newState.doc);
          restored = true;
        }
      } else {
        history.align(newState);
      }
      const forced = transactions.some((tr) => tr.getMeta(RECONCILE));
      const changed = transactions.some((tr) => tr.docChanged);
      if (!changed && !forced) return null;
      if (changed && !restored) {
        // 文档节点每次都是新对象：出身原样带过去
        if (!getOrigin(newState.doc)) setOrigin(newState.doc, getOrigin(oldState.doc));
        const mapping = new Mapping();
        for (const tr of transactions) mapping.appendMapping(tr.mapping);
        inheritOrigins(oldState.doc, newState.doc, mapping);
      }
      if (transactions.every((tr) => tr.getMeta(SKIP_RECONCILE) || !tr.docChanged) && !forced) return null;
      // 输入法组合期间不重新解析
      if (transactions.some((tr) => tr.getMeta("composition") !== undefined) && !forced) return null;
      // 组合结束后补一次（RECONCILE）：只对齐组合期间改过的顶层块；不知道改了哪里时整篇
      const pending = reconcileKey.getState(newState) as PendingComposition | null;
      const range = forced ? (pending ? topLevelRange(newState.doc, pending) : { from: 0, to: newState.doc.childCount }) : changedRange(newState.doc, transactions);
      if (!range) return null;
      const tr = reconcileTransaction(newState, range, options);
      // 对齐过了（或者没有要改的），清掉记下的组合范围
      if (forced && pending) return (tr ?? newState.tr).setMeta(SKIP_RECONCILE, true).setMeta(reconcileKey, "done");
      return tr;
    },
  });
}

/** Tiptap 扩展：解析选项由编辑器给 */
export const Reconcile = Extension.create<ReconcileOptions>({
  name: "markoReconcile",
  addOptions: () => ({ parse: () => ({}) }),
  addProseMirrorPlugins() {
    return [reconcilePlugin(this.options)];
  },
});

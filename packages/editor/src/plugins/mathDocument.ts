// D-2：公式编号和整篇范围内的引用（\label、\eqref、\ref）。开了编号（S-8「公式自动编号」）或文档里有引用时，
// 整篇按文档顺序渲染一遍（@marko/render 的 renderMathDocument，同导出），每个公式用它的结果；否则各画各的
// （renderMath，按源码缓存）。整篇渲染慢，停止输入一会儿再做；结果变了让行内装饰、公式块重画。
// 结果按节点对象记：块改了以后在重新算出来之前先各画各的
import { mathOccurrencesOf, loadMathFonts, renderMathDocument, type MathResult } from "@marko/render";
import type { MdNode } from "@marko/markdown";
import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { toModel } from "../state.ts";
import { REDRAW_BLOCKS, REFRESH_INLINE } from "./meta.ts";

interface MathDocumentState {
  results: WeakMap<PMNode, Map<number, MathResult>> | null;
  version: number;
  /** 公式块上的装饰（spec 带版本号）：结果变了 NodeView 收到 update 重画 */
  decorations: DecorationSet;
}

export const mathDocumentKey = new PluginKey<MathDocumentState>("markoMathDocument");

/** 公式在整篇渲染里的结果（node 是公式块，或行内公式所在的文本块；offset 是行内公式在块里的位置，公式块是 0） */
export function documentMathResult(state: EditorState, node: PMNode, offset: number): MathResult | undefined {
  return mathDocumentKey.getState(state)?.results?.get(node)?.get(offset);
}

/** 用到整篇范围的引用的公式 */
const CROSS_REFERENCE = /\\(?:eq)?ref\s*\{|\\label\s*\{/;

/** 停止输入多久以后整篇重新渲染 */
const DELAY_MS = 250;

function blockDecorations(doc: PMNode, version: number): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "mathBlock" || node.type.name === "codeBlock") {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, {}, { mathVersion: version }));
      return false;
    }
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

/** 上次整篇渲染：公式（TeX、是不是块）的列表和按文档顺序的结果 */
interface LastRender {
  key: string;
  results: MathResult[];
}

interface RenderUpdate {
  results: WeakMap<PMNode, Map<number, MathResult>>;
  /** 只是把上次的结果对回换了对象的块（这些块）；没有时是重新渲染了，整篇重画 */
  remapped?: Set<PMNode>;
}

/** 整篇渲染；不需要时（没开编号也没有引用）返回 null，不用改时返回 undefined */
async function renderDocument(editor: Editor, last: LastRender): Promise<RenderUpdate | null | undefined> {
  const doc = editor.state.doc;
  const numbering = editor.storage.marko.settings.mathNumbering;
  // 不编号时只有引用（\label、\ref、\eqref）才要整篇渲染：先粗看一遍文字，没有就不用解析整篇（X-3）
  if (numbering === "none") {
    let found = false;
    doc.descendants((node) => {
      if (found) return false;
      if (node.isTextblock) {
        if (CROSS_REFERENCE.test(node.textContent)) found = true;
        return false;
      }
      return true;
    });
    if (!found) {
      if (last.key === "") return undefined;
      last.key = "";
      last.results = [];
      return null;
    }
  }
  const occurrences = mathOccurrencesOf(toModel(doc), { syntax: editor.storage.marko.syntax, mathNumbering: numbering });
  const needed = occurrences.length > 0 && (numbering !== "none" || occurrences.some((occurrence) => CROSS_REFERENCE.test(occurrence.item.tex)));
  const key = needed ? `${numbering}\u0000${JSON.stringify(occurrences.map((occurrence) => [occurrence.item.tex, occurrence.item.display]))}` : "";
  if (!needed) {
    if (last.key === "") return undefined;
    last.key = "";
    last.results = [];
    return null;
  }
  // 公式都没变：结果还是上次的，只是所在的块可能换了对象（改了块里别的字，审查 #10），按顺序对回去
  const remap = key === last.key;
  let results = last.results;
  if (!remap) {
    const items = occurrences.map((occurrence) => occurrence.item);
    results = renderMathDocument(items, numbering);
    if (results.some((result) => result.pending)) {
      await loadMathFonts(items);
      results = renderMathDocument(items, numbering);
    }
    last.key = key;
    last.results = results;
  }
  // 模型节点 → 文档节点（同一个文档对象上转出来的模型）
  const byModel = new Map<MdNode, PMNode>();
  doc.descendants((node) => {
    byModel.set(toModel(node), node);
    return !node.isTextblock;
  });
  const map = new WeakMap<PMNode, Map<number, MathResult>>();
  occurrences.forEach((occurrence, index) => {
    const node = byModel.get(occurrence.node);
    if (!node) return;
    let byOffset = map.get(node);
    if (!byOffset) map.set(node, (byOffset = new Map()));
    byOffset.set(occurrence.offset, results[index]);
  });
  if (!remap) return { results: map };
  // 对得上的块不用动；有换了对象的块时只重画它们
  const current = mathDocumentKey.getState(editor.state)?.results;
  const remapped = new Set<PMNode>();
  occurrences.forEach((occurrence, index) => {
    const node = byModel.get(occurrence.node);
    if (node && current?.get(node)?.get(occurrence.offset) !== results[index]) remapped.add(node);
  });
  return remapped.size ? { results: map, remapped } : undefined;
}

export const MathDocument = Extension.create({
  name: "markoMathDocument",
  // 要排在行内装饰前面：同一个事务里行内装饰读到的是新结果
  priority: 1100,
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<MathDocumentState>({
        key: mathDocumentKey,
        state: {
          init: (_config, state) => ({ results: null, version: 0, decorations: blockDecorations(state.doc, 0) }),
          apply(tr, value, _old, state) {
            const update = tr.getMeta(mathDocumentKey) as { results: MathDocumentState["results"] } | undefined;
            if (update) {
              const version = value.version + 1;
              return { results: update.results, version, decorations: blockDecorations(state.doc, version) };
            }
            if (!tr.docChanged) return value;
            // 只跟着映射（每次输入都走一遍全文太慢，X-3）；新出现的公式块等整篇重新渲染完、版本号变了再一起加上
            return { ...value, decorations: value.decorations.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => mathDocumentKey.getState(state)?.decorations,
        },
        view: () => {
          const last: LastRender = { key: "", results: [] };
          let timer: ReturnType<typeof setTimeout> | null = null;
          let numbering = editor.storage.marko.settings.mathNumbering;
          const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              timer = null;
              void renderDocument(editor, last).then((update) => {
                if (update === undefined || editor.isDestroyed) return;
                const tr = editor.state.tr.setMeta(mathDocumentKey, { results: update?.results ?? null }).setMeta("addToHistory", false);
                if (update?.remapped) {
                  // 只重画对回了结果的块
                  const positions: number[] = [];
                  editor.state.doc.descendants((node, pos) => {
                    if (update.remapped?.has(node)) positions.push(pos);
                    return !node.isTextblock;
                  });
                  tr.setMeta(REDRAW_BLOCKS, positions);
                } else {
                  tr.setMeta(REFRESH_INLINE, true);
                }
                editor.view.dispatch(tr);
              });
            }, DELAY_MS);
          };
          schedule();
          return {
            update(view, previous) {
              const nextNumbering = editor.storage.marko.settings.mathNumbering;
              if (!view.state.doc.eq(previous.doc) || nextNumbering !== numbering) {
                numbering = nextNumbering;
                schedule();
              }
            },
            destroy() {
              if (timer) clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});

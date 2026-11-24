// 光标所在的块：类名同 Typora（md-focus 是光标所在的那一块，md-focus-container 是它外面的列表、引用……）。
// 专注模式（V-1）的样式靠它；公式块、HTML 块、图表靠它知道光标进来了没有（装饰的 spec.focus，nodeViews/codeMirror.ts）
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const focusKey = new PluginKey<DecorationSet>("markoFocus");

function focusDecorations(state: EditorState): DecorationSet {
  const { selection } = state;
  const decorations: Decoration[] = [];
  if (selection instanceof NodeSelection) {
    decorations.push(Decoration.node(selection.from, selection.to, { class: "md-focus" }, { focus: true }));
  }
  const $head = selection.$head;
  // 选区（节点选区时是它前面的位置）所在的各层：最里面的块是 md-focus，外面的是 md-focus-container
  for (let depth = $head.depth; depth > 0; depth -= 1) {
    const node = $head.node(depth);
    const pos = $head.before(depth);
    const leaf = depth === $head.depth && !(selection instanceof NodeSelection);
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: leaf ? "md-focus" : "md-focus-container" }, { focus: leaf }));
  }
  return DecorationSet.create(state.doc, decorations);
}

export const FocusedBlock = Extension.create({
  name: "markoFocusedBlock",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: focusKey,
        state: {
          init: (_config, state) => focusDecorations(state),
          apply: (tr, value, _old, state) => (tr.docChanged || tr.selectionSet ? focusDecorations(state) : value),
        },
        props: {
          decorations: (state) => focusKey.getState(state),
        },
      }),
    ];
  },
});

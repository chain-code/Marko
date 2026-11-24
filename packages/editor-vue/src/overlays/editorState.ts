// 浮在编辑区上的界面（代码块的语言、表格工具条）共用：跟着编辑器的事务、滚动刷新；按块的 DOM 算位置
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { onBeforeUnmount, ref, watch, type Ref } from "vue";

/** 编辑器每次事务（文档、选区变了）加一：计算属性依赖它就跟着更新 */
export function useEditorVersion(editor: Readonly<Ref<Editor | null>>, container: Readonly<Ref<HTMLElement | null>>): Ref<number> {
  const version = ref(0);
  const bump = () => {
    version.value += 1;
  };
  let current: Editor | null = null;
  const detach = () => {
    current?.off("transaction", bump);
    current?.off("focus", bump);
    current?.off("blur", bump);
    current = null;
  };
  watch(
    editor,
    (next) => {
      detach();
      if (!next) return;
      current = next;
      next.on("transaction", bump);
      next.on("focus", bump);
      next.on("blur", bump);
      bump();
    },
    { immediate: true },
  );
  // 滚动、窗口大小变了：位置要重算
  watch(
    container,
    (element, _old, onCleanup) => {
      if (!element) return;
      element.addEventListener("scroll", bump, { passive: true });
      window.addEventListener("resize", bump);
      onCleanup(() => {
        element.removeEventListener("scroll", bump);
        window.removeEventListener("resize", bump);
      });
    },
    { immediate: true },
  );
  onBeforeUnmount(detach);
  return version;
}

/** 选区所在的、类型是 types 之一的最近的块 */
export function enclosingBlock(editor: Editor, types: ReadonlySet<string>): { node: PMNode; pos: number } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (types.has(node.type.name)) return { node, pos: $from.before(depth) };
  }
  // 节点选区（整块选中）：选中的就是
  const selected = (editor.state.selection as { node?: PMNode }).node;
  if (selected && types.has(selected.type.name)) return { node: selected, pos: editor.state.selection.from };
  return null;
}

/** 块在容器里的位置（容器的滚动也算上），用来放浮在它上面的界面 */
export function blockBox(editor: Editor, pos: number, container: HTMLElement): { top: number; left: number; width: number; bottom: number } | null {
  const dom = editor.view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return null;
  const rect = dom.getBoundingClientRect();
  const base = container.getBoundingClientRect();
  return {
    top: rect.top - base.top + container.scrollTop,
    bottom: rect.bottom - base.top + container.scrollTop,
    left: rect.left - base.left + container.scrollLeft,
    width: rect.width,
  };
}

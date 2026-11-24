// 视图（V 章）和跳转（N-3、N-4）：
// - 专注模式（V-1，F8）：只有光标所在的块正常显示，其他变淡（类名同 Typora：#write.on-focus-mode，块上的 md-focus 由 focus.ts 给）；
// - 打字机模式（V-2，F9）：输入、移动光标时滚动，让光标所在的行保持在窗口的垂直中间（S-6「打字机模式保持居中」）；
// - Ctrl+J 把选区滚到窗口中间（N-3）；Ctrl+Shift+O 打开光标所在的链接（N-4），`#标题` 跳到本文档的这个标题
import { collectOutline } from "@marko/markdown";
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { toModel } from "../state.ts";

/** 编辑区外面最近的能滚动的元素（没有时是整个页面） */
/** 往上找第一个能滚动的容器（编辑区自己滚，或者整页滚） */
export function scrollParent(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** 把选区的头滚到窗口（或滚动容器）的垂直中间 */
export function centerSelection(view: EditorView): void {
  const container = scrollParent(view.dom as HTMLElement);
  let coords: { top: number; bottom: number };
  try {
    coords = view.coordsAtPos(view.state.selection.head);
  } catch {
    return;
  }
  const isPage = container === document.scrollingElement || container === document.documentElement;
  const rect = isPage ? { top: 0, height: window.innerHeight } : container.getBoundingClientRect();
  const delta = (coords.top + coords.bottom) / 2 - (rect.top + rect.height / 2);
  if (Math.abs(delta) > 1) container.scrollBy({ top: delta });
}

/** 跳到锚点（解码后的）相同的标题（B-2 的锚点规则）：光标放到标题开头、滚到看得见。没有这个标题时返回 false */
export function jumpToAnchor(editor: Editor, id: string): boolean {
  const outline = collectOutline(toModel(editor.state.doc), { syntax: editor.storage.marko.syntax });
  const index = outline.findIndex((item) => item.id === id);
  if (index < 0) return false;
  let seen = 0;
  let target: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (target !== null) return false;
    if (node.type.name === "heading" && seen++ === index) target = pos + 1;
    return !node.isTextblock;
  });
  if (target === null) return false;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target)).scrollIntoView());
  editor.view.focus();
  return true;
}

/** N-4：打开链接。`#标题` 跳到本文档里锚点相同的标题，别的交给宿主 */
export function openLink(editor: Editor, url: string): void {
  if (url.startsWith("#")) {
    // 不合法的百分号转义（`#100%`）照原样比
    let id = url.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // 保留原样
    }
    if (jumpToAnchor(editor, id)) return;
  }
  editor.storage.marko.host.openLink(url);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    markoViewModes: {
      /** V-1 专注模式 */
      toggleFocusMode: () => ReturnType;
      /** V-2 打字机模式 */
      toggleTypewriterMode: () => ReturnType;
    };
  }
}

/** 编辑区的类名跟着模式走 */
function applyModes(editor: Editor): void {
  const dom = editor.view.dom as HTMLElement;
  dom.classList.toggle("on-focus-mode", editor.storage.marko.focusMode);
  dom.classList.toggle("on-typewriter-mode", editor.storage.marko.typewriterMode);
}

export const ViewModes = Extension.create({
  name: "markoViewModes",
  addCommands() {
    return {
      toggleFocusMode:
        () =>
        ({ editor }) => {
          editor.storage.marko.focusMode = !editor.storage.marko.focusMode;
          applyModes(editor);
          return true;
        },
      toggleTypewriterMode:
        () =>
        ({ editor }) => {
          editor.storage.marko.typewriterMode = !editor.storage.marko.typewriterMode;
          applyModes(editor);
          if (editor.storage.marko.typewriterMode) centerSelection(editor.view);
          return true;
        },
    };
  },
  addKeyboardShortcuts() {
    // F8、F9、Mod+Shift+O（专注、打字机模式，打开链接）在 plugins/commandKeys.ts（可以改，S-12）
    return {
      "Mod-j": () => {
        centerSelection(this.editor.view);
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    let mouseDown = false;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousedown: () => {
              mouseDown = true;
              window.addEventListener("mouseup", () => (mouseDown = false), { once: true });
              return false;
            },
          },
        },
        view: () => ({
          update(view, previous) {
            // 打字机模式：输入、键盘移动光标后把这一行滚到中间（用鼠标点、拖选时不滚，免得页面跳）
            if (!editor.storage.marko.typewriterMode || !editor.storage.marko.settings.typewriterCenter || mouseDown) return;
            if (view.state.selection.eq(previous.selection) && view.state.doc.eq(previous.doc)) return;
            if (!view.hasFocus()) return;
            requestAnimationFrame(() => {
              if (!view.isDestroyed) centerSelection(view);
            });
          },
        }),
      }),
    ];
  },
  onCreate() {
    applyModes(this.editor);
  },
});

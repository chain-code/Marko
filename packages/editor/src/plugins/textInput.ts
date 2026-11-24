// 直接输入的收尾（E 章）：Chromium 在空段落（只有 ProseMirror 的占位 <br>）里插字时，偶尔把字插在 <br> 前面、
// 光标留在原地（字的前面）；ProseMirror 按 DOM 里的选区算，接着输入的字就跑到了前面（快速输入 `$abc` 成了 `abc$`）。
// 打字时光标不会留在刚插进去的字前面：在光标处插入、读回来的选区还在插入点上时，放到插入的字后面。
// 优先级最低：别的输入处理（自动配对、行首写法……）都没接手时才轮到这里
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Transaction } from "@tiptap/pm/state";

export const textInputKey = new PluginKey("markoTextInput");

/** 处理 handleTextInput：要修正时派发修正过的默认事务、返回 true */
export function keepCursorAfterInput(view: EditorView, from: number, to: number, text: string, deflt: () => Transaction): boolean {
  const { selection } = view.state;
  if (view.composing || !text || from !== to || !(selection instanceof TextSelection) || !selection.empty || selection.from !== from) return false;
  const tr = deflt();
  if (!tr.selection.empty || tr.selection.from !== from) return false;
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + text.length)));
  return true;
}

export const TextInput = Extension.create({
  name: "markoTextInput",
  priority: 1,
  addProseMirrorPlugins() {
    return [new Plugin({ key: textInputKey, props: { handleTextInput: keepCursorAfterInput } })];
  },
});

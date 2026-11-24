// 剪贴板（C 章）：复制、剪切放三种格式（纯文本、HTML、编辑器自己认的 Markdown 原文）；
// 粘贴时有编辑器自己的格式就原样插入 Markdown，否则交给 pasteContent（HTML 转 Markdown、表格数据……，C-3）；
// Ctrl+Shift+V 粘贴为纯文本（C-4）。CodeMirror 里的复制粘贴由 CodeMirror 自己处理
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { CellSelection, deleteCellSelection } from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import { pasteIntoCells } from "../commands/cells.ts";
import { replacingSelection, runSourceCommand } from "../commands/run.ts";
import { cursorAt, selectionRange } from "../commands/text.ts";
import { insertImageFiles, mediaKindOf } from "../plugins/placeholders.ts";
import { selectionClipboard } from "./copy.ts";

export { completeInline, documentPlainText, selectedMarkdown, selectionClipboard, type ClipboardContent } from "./copy.ts";

/** 剪贴板里编辑器自己的格式：选区的 Markdown 原文（在编辑器里复制粘贴不经过 HTML，一字不差） */
export const MARKDOWN_MIME = "text/x-marko-markdown";

export const clipboardKey = new PluginKey<{ plainNext: boolean }>("markoClipboard");

function copy(editor: Editor, view: EditorView, event: ClipboardEvent, cut: boolean): boolean {
  const data = event.clipboardData;
  const { state } = view;
  if (!data || state.selection.empty) return false;
  const content = selectionClipboard(state, editor.storage.marko.syntax, editor.storage.marko.host, editor.storage.marko.settings);
  data.clearData();
  // S-5「默认复制 Markdown 源码」：纯文本是源码还是去掉标记的文字
  data.setData("text/plain", editor.storage.marko.settings.copyMarkdownSource ? content.markdown : content.text);
  data.setData("text/html", content.html);
  data.setData(MARKDOWN_MIME, content.markdown);
  event.preventDefault();
  if (cut && view.editable) {
    if (state.selection instanceof CellSelection) deleteCellSelection(state, view.dispatch);
    // 剪掉的同删除（全选是整篇；到了表格、代码块内容边上的连同标记，审查 #7）
    else runSourceCommand(editor, replacingSelection(({ source }) => {
      const { from, to } = selectionRange(source);
      return from === to ? null : cursorAt(source.text.slice(0, from) + source.text.slice(to), from);
    }));
  }
  return true;
}

export const MarkoClipboard = Extension.create({
  name: "markoClipboard",
  addKeyboardShortcuts() {
    return {
      // C-4：接下来的这次粘贴只要纯文本（按键本身交给浏览器，它会触发粘贴）
      "Mod-Shift-v": () => {
        this.editor.view.dispatch(this.editor.state.tr.setMeta(clipboardKey, { plainNext: true }));
        return false;
      },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin<{ plainNext: boolean }>({
        key: clipboardKey,
        state: {
          init: () => ({ plainNext: false }),
          apply: (tr, value) => (tr.getMeta(clipboardKey) as { plainNext: boolean } | undefined) ?? value,
        },
        props: {
          handleDOMEvents: {
            copy: (view, event) => copy(editor, view, event, false),
            cut: (view, event) => copy(editor, view, event, true),
          },
          handlePaste(view, event) {
            const data = event.clipboardData;
            if (!data || !view.editable) return false;
            const plain = clipboardKey.getState(view.state)?.plainNext ?? false;
            if (plain) view.dispatch(view.state.tr.setMeta(clipboardKey, { plainNext: false }));
            const text = data.getData("text/plain");
            const markdown = data.getData(MARKDOWN_MIME);
            const html = data.getData("text/html");
            // M-2：剪贴板里只有图片（截图）时插入图片；从网页复制的图片有 HTML，按 HTML 转（地址是网址）
            const images = Array.from(data.files ?? []).filter((file) => mediaKindOf(file.type) !== null);
            if (images.length && !html && !plain) {
              void insertImageFiles(editor, images);
              return true;
            }
            // T-2、T-6：单元格里粘贴
            if (pasteIntoCells(editor, markdown ? { text: markdown } : { text, html }, plain)) return true;
            if (plain) return text ? editor.commands.pastePlainText(text) : false;
            // 从编辑器里复制的：原样插入 Markdown
            if (markdown) return editor.commands.pastePlainText(markdown);
            if (!text && !html) return false;
            return editor.commands.pasteContent({ text, html });
          },
        },
      }),
    ];
  },
});

// E-12：输入法。组合期间片段不展开也不收起（inlineSyntax.ts）、不做自动转换和自动配对（commands/extension.ts）、
// 不重新解析（reconcile.ts 记下改动的范围）。组合结束、上屏以后：
// 1. 上屏的是一个能自动配对的符号（中文输入法打出的「（」「《」「“」……）时按直接输入的处理，补上右半边；
// 2. 对齐一次（RECONCILE）：组合期间改过的块按 Markdown 重新解析，行内装饰跟着重画
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { applyAutoPair } from "../commands/input.ts";
import { fromTextState, runSourceCommand } from "../commands/run.ts";
import { selectionRange } from "../commands/text.ts";
import { INLINE_TEXTBLOCKS } from "./inlineSyntax.ts";
import { RECONCILE } from "./meta.ts";

/** ProseMirror 在 compositionend 之后约 20 毫秒才收尾（读最后的 DOM 变化），等它做完 */
const AFTER_COMPOSITION_MS = 30;

function finishComposition(editor: Editor, committed: string): void {
  if (editor.isDestroyed || editor.view.composing) return;
  const { selection } = editor.state;
  const inline = selection instanceof TextSelection && INLINE_TEXTBLOCKS.has(selection.$head.parent.type.name);
  if (committed && inline && editor.storage.marko.settings.autoPair && [...committed].length === 1) {
    runSourceCommand(editor, ({ source }) => {
      const { from, to } = selectionRange(source);
      if (from !== to || source.text.slice(from - committed.length, from) !== committed) return null;
      // 当成还没输入这个符号，按直接输入算一遍
      const start = from - committed.length;
      const result = applyAutoPair({ value: source.text.slice(0, start) + source.text.slice(from), selectionStart: start, selectionEnd: start }, committed);
      const edit = fromTextState(result);
      return edit && edit.text !== source.text ? { ...edit, inline: true } : null;
    });
  }
  editor.view.dispatch(editor.state.tr.setMeta(RECONCILE, true).setMeta("addToHistory", false));
}

export const Composition = Extension.create({
  name: "markoComposition",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            compositionend(_view, event) {
              const committed = event.data ?? "";
              setTimeout(() => finishComposition(editor, committed), AFTER_COMPOSITION_MS);
              return false;
            },
          },
        },
      }),
    ];
  },
});

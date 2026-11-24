// 直接输入的收尾：读回来的选区停在刚插入的字前面时（Chromium 在空段落里偶尔这样），光标放到字后面
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkoEditor, getMarkdown, setMarkdown } from "../src/index.ts";
import { keepCursorAfterInput } from "../src/plugins/textInput.ts";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

/** 光标放在第二段（空段落）里 */
function emptyParagraph(): number {
  editor = createMarkoEditor({});
  setMarkdown(editor, "x\n\n");
  editor.commands.focus("end");
  editor.commands.enter();
  const { from } = editor.state.selection;
  expect(editor.state.selection.$from.parent.content.size).toBe(0);
  return from;
}

describe("直接输入的收尾", () => {
  it("在光标处插入、读回的选区还在插入点上：光标放到插入的字后面，接着输入的字在后面", () => {
    const at = emptyParagraph();
    // 模拟 Chromium：字插进去了，DOM 里的光标留在原地
    const deflt = () => {
      const tr = editor.state.tr.insertText("$", at, at);
      return tr.setSelection(TextSelection.create(tr.doc, at));
    };
    expect(keepCursorAfterInput(editor.view, at, at, "$", deflt)).toBe(true);
    expect(editor.state.selection.from).toBe(at + 1);
    editor.view.dispatch(editor.state.tr.insertText("m"));
    expect(getMarkdown(editor)).toBe("x\n\n$m");
  });

  it("正常的输入（选区在字后面）、换掉选区、输入法组合时不管", () => {
    const at = emptyParagraph();
    const normal = () => editor.state.tr.insertText("a", at, at);
    expect(keepCursorAfterInput(editor.view, at, at, "a", normal)).toBe(false);
    // 换掉的不是光标处（自动更正这类）
    expect(keepCursorAfterInput(editor.view, at - 1, at, "a", normal)).toBe(false);
    expect(keepCursorAfterInput(editor.view, at, at, "", normal)).toBe(false);
  });
});

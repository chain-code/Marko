// E-6 撤销与重做：撤销回到改之前的原文、重做回到改之后的原文，逐字节不变（块前空行、文末空行都算）。
// 改动边上的块撤销时是重新拼出来的新节点，出身靠 plugins/historyOrigins.ts 恢复；对齐后保留下来的块换出身时换成新节点
// （state.ts 的 renewOrigin），不就地改旧文档还在用的出身
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkoEditor, getMarkdown, setMarkdown } from "../src/index.ts";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

function open(markdown: string, cursorBefore: string): void {
  editor = createMarkoEditor();
  const offset = markdown.indexOf(cursorBefore);
  setMarkdown(editor, markdown, { anchor: offset, head: offset });
}

function press(key: string): void {
  const view = editor.view;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  view.someProp("handleKeyDown", (handler) => handler(view, event));
}

/** 改一下：撤销回到原文，重做回到改后的样子，再撤销又回到原文 */
function roundTrip(source: string, edit: () => void): string {
  edit();
  const edited = getMarkdown(editor);
  expect(edited).not.toBe(source);
  editor.commands.undo();
  expect(getMarkdown(editor)).toBe(source);
  editor.commands.redo();
  expect(getMarkdown(editor)).toBe(edited);
  editor.commands.undo();
  expect(getMarkdown(editor)).toBe(source);
  return edited;
}

describe("E-6 撤销与重做逐字节回到原文", () => {
  it("改了块的类型：后面的块前空行（多个空行）不变", () => {
    open("A\n\n\n\nB", "A");
    expect(roundTrip("A\n\n\n\nB", () => editor.commands.heading1())).toBe("# A\n\n\n\nB");
  });

  it("块开头退格合并到上一块：后面的块前空行不变", () => {
    open("A\n\nB\n\n\n\nC", "B");
    expect(roundTrip("A\n\nB\n\n\n\nC", () => press("Backspace"))).toBe("AB\n\n\n\nC");
  });

  it("文末回车再撤销：文末没有多出空行", () => {
    const source = "end";
    open(source, "");
    editor.commands.setTextSelection(4);
    roundTrip(source, () => {
      press("Enter");
      const view = editor.view;
      view.dispatch(view.state.tr.insertText("x"));
    });
  });

  it("在下方插入段落并输入：撤销回到原文", () => {
    open("A\n\n\nB", "A");
    roundTrip("A\n\n\nB", () => {
      editor.commands.insertParagraphBelow();
      const view = editor.view;
      view.dispatch(view.state.tr.insertText("x"));
    });
  });

  it("跨块选中后输入：两头的块撤销时重新拼出来，块前空行、列表符号后的空格照旧", () => {
    const source = "- a\n-   b\n\n\n> q\n\n   c";
    open(source, "a");
    const from = editor.state.selection.from;
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    expect(text).toContain("q");
    let qPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.isTextblock && node.textContent === "q") qPos = pos + 1;
    });
    editor.commands.setTextSelection({ from, to: qPos });
    roundTrip(source, () => {
      const view = editor.view;
      view.dispatch(view.state.tr.insertText("z"));
    });
  });
});

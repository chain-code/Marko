// 开头带 BOM 的文件（F-6 编码）：BOM 不是能编辑的内容。命令、源码模式看到的源码不带它，保存（getMarkdown）时带上；
// 对外的偏移（setMarkdown 的选区、getMarkdownWithSelection）按带 BOM 的原文算。代码审查 #2、#6 的回归测试
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkoEditor, getMarkdown, getMarkdownWithSelection, setMarkdown, sourceModeOf, toggleSourceMode } from "../src/index.ts";

const BOM = "﻿";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
  document.body.innerHTML = "";
});

function open(markdown: string, offset: number): void {
  // 源码模式要放在编辑区的位置上：编辑区得有父元素
  const host = document.createElement("div");
  const element = document.createElement("div");
  host.append(element);
  document.body.append(host);
  editor = createMarkoEditor({ element });
  setMarkdown(editor, markdown, { anchor: offset, head: offset });
}

function type(text: string): void {
  const view = editor.view;
  for (const char of text) {
    const { from, to } = view.state.selection;
    const deflt = () => view.state.tr.insertText(char, from, to);
    const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, char, deflt));
    if (!handled) view.dispatch(deflt());
  }
}

function press(key: string): void {
  const view = editor.view;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  const handled = view.someProp("handleKeyDown", (handler) => handler(view, event));
  if (!handled && key === "Backspace") {
    const { $head } = view.state.selection;
    if ($head.parentOffset > 0) view.dispatch(view.state.tr.delete($head.pos - 1, $head.pos));
  }
}

const SOURCE = "# Hello\n\nBody";

/** 同一个操作：带 BOM 的文件上的结果是不带 BOM 时的结果前面加上 BOM，偏移多 1 */
function sameAsWithoutBom(action: () => void, cursor = SOURCE.indexOf("Hello"), source = SOURCE): void {
  open(source, cursor);
  const loaded = getMarkdownWithSelection(editor);
  action();
  const plain = getMarkdownWithSelection(editor);
  editor.destroy();
  open(BOM + source, cursor + 1);
  // 光标进不了块标记时落在内容开头：和不带 BOM 时落在同一个地方
  expect(getMarkdownWithSelection(editor)).toEqual({ value: BOM + loaded.value, anchor: loaded.anchor + 1, head: loaded.head + 1 });
  expect(action).not.toThrow();
  const withBom = getMarkdownWithSelection(editor);
  expect(withBom).toEqual({ value: BOM + plain.value, anchor: plain.anchor + 1, head: plain.head + 1 });
  expect(getMarkdown(editor).startsWith(BOM)).toBe(true);
}

describe("BOM 文件第一行上的命令和按键", () => {
  it("标题级别", () => sameAsWithoutBom(() => editor.commands.heading2()));
  it("标题开头退格", () => sameAsWithoutBom(() => press("Backspace")));
  it("删除行", () => sameAsWithoutBom(() => editor.commands.deleteLine()));
  it("上方插入段落并输入", () => sameAsWithoutBom(() => (editor.commands.insertParagraphAbove(), type("x"))));
  it("引用", () => sameAsWithoutBom(() => editor.commands.blockquote()));
  it("无序列表", () => sameAsWithoutBom(() => editor.commands.bulletList()));
  it("标题内容开头输入", () => sameAsWithoutBom(() => type("x# "), 0));
  it("文件开头的段落里输入「# 」变成标题", () => sameAsWithoutBom(() => type("# "), 0, "Hello\n\nBody"));
});

describe("BOM 文件的源码模式", () => {
  it("源码里没有 BOM；在开头、末尾输入都写进文档，切回来、保存时 BOM 还在", () => {
    open(BOM + SOURCE, 1);
    expect(toggleSourceMode(editor)).toBe(true);
    const code = sourceModeOf(editor)!.code;
    expect(code.state.doc.toString()).toBe(SOURCE);
    code.dispatch({ changes: { from: 0, insert: "x" }, selection: { anchor: 1 } });
    expect(getMarkdown(editor)).toBe(`${BOM}x${SOURCE}`);
    code.dispatch({ changes: { from: code.state.doc.length, insert: "!" } });
    expect(getMarkdown(editor)).toBe(`${BOM}x${SOURCE}!`);
    expect(toggleSourceMode(editor)).toBe(false);
    expect(getMarkdown(editor)).toBe(`${BOM}x${SOURCE}!`);
  });
});

describe("selectSource（W-5 点全局搜索的结果）", () => {
  it("按带 BOM 的原文偏移选中；第二行的匹配", async () => {
    const { selectSource } = await import("../src/index.ts");
    const source = `${BOM}# Title\n\nsome apple here\n`;
    open(source, 0);
    const from = source.indexOf("apple");
    selectSource(editor, from, from + "apple".length);
    const { from: start, to: end } = editor.state.selection;
    expect(editor.state.doc.textBetween(start, end)).toBe("apple");
    expect(getMarkdownWithSelection(editor)).toMatchObject({ anchor: from, head: from + 5 });
    // 换文件后的选区不进撤销历史，文档不变
    expect(getMarkdown(editor)).toBe(source);
  });
});

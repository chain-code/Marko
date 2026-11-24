// 一个字一个字输入（同行为规格的「输入」，test/behavior/runner.ts）以后的原文：转换（E-4）和容器（B-3、B-4、B-13）。
// 代码审查找到的问题的回归测试
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkoEditor, getMarkdown, getMarkdownWithSelection, setMarkdown } from "../src/index.ts";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

function open(markdown: string, offset = markdown.length): void {
  editor = createMarkoEditor();
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
  view.someProp("handleKeyDown", (handler) => handler(view, event));
}

describe("B-3 空的引用里输入", () => {
  it("空文档输入「> hello」", () => {
    open("");
    type("> hello");
    expect(getMarkdown(editor)).toBe("> hello");
  });

  it("嵌套引用「> > nested」", () => {
    open("");
    type("> > nested");
    expect(getMarkdown(editor)).toBe("> > nested");
  });

  it("列表项里「> q」", () => {
    open("");
    type("- a");
    press("Enter");
    type("> q");
    expect(getMarkdown(editor)).toBe("- a\n- > q");
  });

  it("打开只有「> 」的文件，在里面输入", () => {
    for (const source of ["> ", ">"]) {
      open(source);
      type("hi");
      expect(getMarkdown(editor), JSON.stringify(source)).toBe("> hi");
    }
  });
});

describe("E-4 嵌套列表的写法不会变成分隔线", () => {
  it("「* * * *」", () => {
    open("");
    type("* * * *");
    expect(getMarkdown(editor)).toBe("* * * *");
  });

  it("「- - - - - x」", () => {
    open("");
    type("- - - - - x");
    expect(getMarkdown(editor)).toBe("- - - - - x");
  });
});

describe("B-13 Callout 标记", () => {
  it("自动配对开着时输入「> [!NOTE]」：右括号跳过配对出来的那个", () => {
    open("");
    type("> [!NOTE]");
    const { value, anchor } = getMarkdownWithSelection(editor);
    expect(value).toBe("> [!NOTE]");
    expect(anchor).toBe(value.length);
  });
});

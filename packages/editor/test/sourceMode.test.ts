// E-11 源码模式：CodeMirror 里输入什么，文档（保存的原文）就是什么，不能被「规范化」改写；
// 按源码改动的命令（粘贴等）也一样。代码审查 #3 的回归测试
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createMarkoEditor, getMarkdown, setMarkdown, sourceModeOf, toggleSourceMode } from "../src/index.ts";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
  document.body.innerHTML = "";
});

function open(markdown: string, offset = markdown.length): void {
  // 源码模式要放在编辑区的位置上：编辑区得有父元素
  const host = document.createElement("div");
  const element = document.createElement("div");
  host.append(element);
  document.body.append(host);
  editor = createMarkoEditor({ element });
  setMarkdown(editor, markdown, { anchor: offset, head: offset });
}

/** 源码模式里一个字一个字地输入（在 at 处，默认末尾） */
function typeInSource(text: string, at?: number): void {
  const code = sourceModeOf(editor)!.code;
  let position = at ?? code.state.doc.length;
  for (const char of text) {
    code.dispatch({ changes: { from: position, insert: char }, selection: { anchor: position + 1 } });
    position += 1;
  }
}

describe("源码模式里的输入原样保留", () => {
  const cases: Array<[string, string]> = [
    ["> quote\n", ">"],
    ["> quote\n", "> "],
    ["> quote\n", "> x"],
    ["Term\n", ":"],
    ["", "\n\n"],
    ["abc\n", "\n"],
    ["- a\n", "-"],
    ["- a\n", "  "],
    ["1. a\n", "2."],
    ["# H\n", "\n"],
    ["", "> quote\n>"],
  ];
  for (const [initial, typed] of cases) {
    it(`${JSON.stringify(initial)} 后面输入 ${JSON.stringify(typed)}`, () => {
      open(initial);
      toggleSourceMode(editor);
      typeInSource(typed);
      const code = sourceModeOf(editor)!.code;
      expect(code.state.doc.toString()).toBe(initial + typed);
      expect(getMarkdown(editor)).toBe(initial + typed);
    });
  }

  it("表格前面有几个空行：删表格里的一个字，空行不变", () => {
    const source = "deep\n\n\n| a | b |\n| - | - |\n| 1 | 2 |";
    open(source, 0);
    toggleSourceMode(editor);
    const code = sourceModeOf(editor)!.code;
    const at = source.indexOf("1 |");
    code.dispatch({ changes: { from: at, to: at + 1 }, selection: { anchor: at } });
    const expected = source.slice(0, at) + source.slice(at + 1);
    expect(code.state.doc.toString()).toBe(expected);
    expect(getMarkdown(editor)).toBe(expected);
  });
});

describe("按源码改动的命令", () => {
  it("引用后面的空行上粘贴「>」：后面的段落不会被拉进引用", () => {
    const source = "> quote\n\nafter";
    open(source, "> quote\n".length);
    editor.commands.insertText(">");
    expect(getMarkdown(editor)).toBe("> quote\n>\nafter");
  });
});

describe("N-1 源码模式里查找", () => {
  it("边输入边跳到光标之后最近的匹配；第 N 个，共 M 个；替换全部", async () => {
    const { findStatusOf } = await import("../src/index.ts");
    open("one two one two", 4);
    toggleSourceMode(editor);
    const code = sourceModeOf(editor)!.code;
    editor.commands.setFind({ search: "one" });
    expect(editor.commands.findNearest()).toBe(true);
    expect(code.state.selection.main.from).toBe(8);
    expect(findStatusOf(editor)).toEqual({ current: 2, total: 2, invalid: false });
    editor.commands.findNext();
    expect(code.state.selection.main.from).toBe(0);
    editor.commands.setFind({ search: "two", replace: "2" });
    editor.commands.replaceAll();
    expect(getMarkdown(editor)).toBe("one 2 one 2");
  });
});

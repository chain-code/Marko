// 不在行为规格里的新命令（规格是从旧代码提取的）
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { browserHost, createMarkoEditor, getMarkdown, getMarkdownWithSelection, LAST_CODE_LANGUAGE, selectSource, setMarkdown, setSettings } from "../src/index.ts";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

function open(markdown: string, cursorBefore: string): void {
  editor = createMarkoEditor();
  const offset = markdown.indexOf(cursorBefore);
  setMarkdown(editor, markdown, { anchor: offset, head: offset });
}

function typeText(text: string): void {
  const view = editor.view;
  for (const char of text) {
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, char, () => view.state.tr.insertText(char, from, to)));
    if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
  }
}

describe("B-17 插入段落", () => {
  it("下方：光标放到后面的空行上，空着离开时源码不变；输入了内容就是新段落", () => {
    open("A\n\nB", "A");
    expect(editor.commands.insertParagraphBelow()).toBe(true);
    const { value, anchor } = getMarkdownWithSelection(editor);
    expect(value).toBe("A\n\nB");
    expect(anchor).toBe(2);
    typeText("x");
    expect(getMarkdown(editor)).toBe("A\n\nx\n\nB");
  });

  it("上方：前面没有空行时补一个换行；在文档开头", () => {
    open("# H\nP", "P");
    editor.commands.insertParagraphAbove();
    typeText("x");
    expect(getMarkdown(editor)).toBe("# H\n\nx\n\nP");
    open("P", "P");
    editor.commands.insertParagraphAbove();
    typeText("y");
    expect(getMarkdown(editor)).toBe("y\n\nP");
  });

  it("列表、引用里：以最外层的块为准", () => {
    open("- a\n- b\n\nend", "b");
    editor.commands.insertParagraphBelow();
    typeText("x");
    expect(getMarkdown(editor)).toBe("- a\n- b\n\nx\n\nend");
  });

  it("文档末尾的块下方", () => {
    open("A", "A");
    editor.commands.insertParagraphBelow();
    typeText("z");
    expect(getMarkdown(editor)).toBe("A\n\nz");
  });
});

describe("段落、格式菜单的快捷键", () => {
  function press(key: string, init: KeyboardEventInit): boolean {
    const view = editor.view;
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    // 浏览器给的 keyCode（ProseMirror 按它认 Shift 加字母、符号的快捷键）
    const codes: Record<string, number> = { Q: 81, X: 88, "}": 221 };
    Object.defineProperty(event, "keyCode", { value: codes[key] ?? 0 });
    return Boolean(view.someProp("handleKeyDown", (handler) => handler(view, event)));
  }

  it("Ctrl+Shift+Q 引用、Ctrl+Shift+] 无序列表、Ctrl+Shift+X 任务列表", () => {
    open("text", "text");
    expect(press("Q", { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(getMarkdown(editor)).toBe("> text");
    open("text", "text");
    expect(press("}", { ctrlKey: true, shiftKey: true, code: "BracketRight" })).toBe(true);
    expect(getMarkdown(editor)).toBe("- text");
    open("text", "text");
    expect(press("X", { ctrlKey: true, shiftKey: true })).toBe(true);
    expect(getMarkdown(editor)).toBe("- [ ] text");
  });
});

describe("I-3 行内公式", () => {
  it("有选区时包成 $…$，再按一次去掉；没有选区时插入一对 $", () => {
    open("a x+y b", "x+y");
    editor.commands.setTextSelection({ from: 3, to: 6 });
    editor.commands.inlineMath();
    expect(getMarkdown(editor)).toBe("a $x+y$ b");
    editor.commands.inlineMath();
    expect(getMarkdown(editor)).toBe("a x+y b");
  });
});

describe("T-1 插入表格", () => {
  it("列数 × 行数（含表头），插在当前块后面，选中第一个表头", () => {
    open("text", "text");
    editor.commands.insertTableOfSize(3, 2);
    const { value, anchor, head } = getMarkdownWithSelection(editor);
    expect(value).toBe("text\n\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |");
    expect(value.slice(anchor, head)).toBe("列 1");
  });

  it("空段落里换掉它", () => {
    open("a\n\n\n\nb", "\n\nb");
    editor.commands.insertTableOfSize(2, 3);
    expect(getMarkdown(editor)).toBe("a\n\n| 列 1 | 列 2 |\n| --- | --- |\n|  |  |\n|  |  |\n\nb");
  });
});

describe("光标落在容器前缀里（审查 #5）", () => {
  const source = "> - a\n>   - b\n\nend";
  const lineStart = source.indexOf(">   - b");

  it("行首（`>` 前面，如源码模式里按 Home 再切回来）：落到这一行内容的开头，不放占位段落", () => {
    open(source, "");
    setMarkdown(editor, source, { anchor: lineStart, head: lineStart });
    expect(getMarkdownWithSelection(editor)).toEqual({ value: source, anchor: source.indexOf("b"), head: source.indexOf("b") });
  });

  it("粘贴、加粗不会插进前缀里", () => {
    open(source, "");
    setMarkdown(editor, source, { anchor: lineStart, head: lineStart });
    editor.commands.pasteContent({ text: "hello", html: "" });
    expect(getMarkdown(editor)).toBe("> - a\n>   - hellob\n\nend");
    setMarkdown(editor, source, { anchor: lineStart, head: lineStart });
    editor.commands.bold();
    expect(getMarkdown(editor).split("\n")[1]).toBe(">   - ****b");
  });
});

describe("E-8 删除行", () => {
  it("光标在文末空行后面的空行上（文末空行不属于任何块）：删掉这一行不出错", () => {
    open("\n\n", "");
    editor.commands.setTextSelection(1);
    expect(getMarkdownWithSelection(editor)).toEqual({ value: "\n\n", anchor: 2, head: 2 });
    expect(() => editor.commands.deleteLine()).not.toThrow();
    expect(getMarkdown(editor)).toBe("\n");
  });
});

describe("S-7 默认代码语言选「最近使用」（旧版库的 __LAST）", () => {
  it("新代码块用光标最后待过的代码块的语言；还没待过时不指定", () => {
    const source = "intro\n\n```python\nprint(1)\n```\n\nend";
    open(source, "intro");
    setSettings(editor, { defaultCodeLanguage: LAST_CODE_LANGUAGE, defaultCodeLanguageApplyTo: "menu" });
    // 还没进过代码块：不指定语言（不会把 __LAST 写进去）
    editor.commands.codeBlock();
    expect(getMarkdown(editor)).not.toContain("__LAST");
    // 光标进 python 代码块，再回到「end」那一段插入代码块
    open(source, "intro");
    setSettings(editor, { defaultCodeLanguage: LAST_CODE_LANGUAGE, defaultCodeLanguageApplyTo: "menu" });
    selectSource(editor, source.indexOf("print"));
    expect(editor.storage.marko.lastCodeLanguage).toBe("python");
    selectSource(editor, source.length);
    editor.commands.codeBlock();
    expect(getMarkdown(editor)).toBe("intro\n\n```python\nprint(1)\n```\n\nend\n```python\n\n```\n");
  });
});

describe("E-1 新文档用设置里的默认换行符", () => {
  it("CRLF：新段落之间是 CRLF；打开有换行的文件时沿用文件的", () => {
    editor = createMarkoEditor({ settings: { defaultEol: "\r\n" } });
    setMarkdown(editor, "A", { anchor: 1, head: 1 });
    editor.commands.insertParagraphBelow();
    typeText("x");
    expect(getMarkdown(editor)).toBe("A\r\n\r\nx");
    setMarkdown(editor, "B\n\nC");
    expect(editor.state.doc.attrs.eol).toBe("\n");
  });
});

describe("段落 → YAML Front Matter", () => {
  it("文档开头插入，选中标题；已经有了就选中里面的内容；换行符同文档", () => {
    open("# Doc\r\n\r\nbody", "body");
    editor.commands.frontMatter();
    const inserted = getMarkdownWithSelection(editor);
    expect(inserted.value).toMatch(/^---\r\ntitle: 新文档\r\ndate: \d{4}-\d{2}-\d{2}\r\n---\r\n\r\n# Doc\r\n\r\nbody$/);
    expect(inserted.value.slice(inserted.anchor, inserted.head)).toBe("新文档");
    editor.commands.frontMatter();
    const again = getMarkdownWithSelection(editor);
    expect(again.value).toBe(inserted.value);
    expect(again.value.slice(again.anchor, again.head)).toMatch(/^title: 新文档\r\ndate: [\d-]+$/);
  });
});

describe("K-2、L-2 编辑器的文字由宿主传入", () => {
  it("宿主给了文字时命令插进去的占位用它的；没给的那几条用中文", () => {
    const texts = { tableColumn: (n: number) => `Column ${n}`, tableCell: "Cell", linkText: "link text", footnote: "Footnote" };
    editor = createMarkoEditor({ host: { ...browserHost, texts } });
    setMarkdown(editor, "", { anchor: 0, head: 0 });
    editor.commands.insertTableOfSize(2, 2);
    const table = getMarkdownWithSelection(editor);
    expect(table.value).toBe("| Column 1 | Column 2 |\n| --- | --- |\n|  |  |");
    expect(table.value.slice(table.anchor, table.head)).toBe("Column 1");

    setMarkdown(editor, "x", { anchor: 1, head: 1 });
    editor.commands.link();
    expect(getMarkdown(editor)).toBe("x[link text](https://example.com)");
    setMarkdown(editor, "y", { anchor: 1, head: 1 });
    editor.commands.footnote();
    expect(getMarkdown(editor)).toContain("[^1]: Footnote");
    // 没给的：图片描述用中文
    setMarkdown(editor, "z", { anchor: 1, head: 1 });
    editor.commands.image();
    expect(getMarkdown(editor)).toContain("![图片描述]");
  });
});

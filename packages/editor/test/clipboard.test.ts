// C-1、C-2：复制出来的 Markdown（补全切开的片段）、纯文本、HTML
import { inlineFragments, parse, resolveSyntax } from "@marko/markdown";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";
import { completeInline, documentPlainText, selectedMarkdown, selectionClipboard } from "../src/clipboard/index.ts";
import { browserHost } from "../src/host.ts";
import { createMarkoEditor, setMarkdown } from "../src/index.ts";

const syntax = resolveSyntax({});

function complete(text: string, selected: string): string {
  const from = text.indexOf(selected);
  return completeInline(text, from, from + selected.length, inlineFragments(text, syntax));
}

describe("C-1 选区切开的片段补全标记", () => {
  it("整个在片段的内容里：两头都补", () => {
    expect(complete("a **bold** b", "ol")).toBe("**ol**");
    expect(complete("a **x *em* y** b", "m")).toBe("***m***");
    expect(complete("see [the docs](https://e.com) now", "the")).toBe("[the](https://e.com)");
    expect(complete("run `npm test` now", "npm")).toBe("`npm`");
  });

  it("只盖住开头或结尾：补另一头", () => {
    expect(complete("a **bold** b", "a **bo")).toBe("a **bo**");
    expect(complete("a **bold** b", "ld** b")).toBe("**ld** b");
  });

  it("切到原子片段、标记：扩到整个", () => {
    expect(complete("x $a+b$ y", "a+")).toBe("$a+b$");
    expect(complete("a **bold** b", "*bold")).toBe("**bold**");
  });

  it("没切开片段：原样", () => {
    expect(complete("a **bold** b", "a **bold** b")).toBe("a **bold** b");
    expect(complete("plain text", "ain te")).toBe("ain te");
  });
});

describe("纯文本", () => {
  it("块之间换行，去掉标记，表格的格子之间是制表符", () => {
    const model = parse("# Title\n\nsome **bold** [link](u)\n\n- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n```\ncode\n```", { syntax });
    expect(documentPlainText(model, syntax)).toBe("Title\nsome bold link\none\ntwo\na\tb\n1\t2\ncode");
  });
});

describe("选区的 Markdown", () => {
  let editor: Editor;
  afterEach(() => editor?.destroy());

  function select(markdown: string, from: string, to: string): void {
    editor = createMarkoEditor();
    const start = markdown.indexOf(from);
    const end = markdown.indexOf(to) + to.length;
    setMarkdown(editor, markdown, { anchor: start, head: end });
  }

  it("跨块的选区：外面的容器照原样套上", () => {
    select("- one\n- two\n- three", "ne", "tw");
    expect(selectedMarkdown(editor.state, syntax)).toBe("- ne\n- tw");
  });

  it("整块选中：逐字节同原文", () => {
    select("para *one*\n\n> quote\n> more\n\nend", "para", "more");
    expect(selectedMarkdown(editor.state, syntax)).toBe("para *one*\n\n> quote\n> more");
  });

  it("剪贴板的三种格式", () => {
    select("a **bold** b", "ol", "ol");
    const content = selectionClipboard(editor.state, syntax, browserHost);
    expect(content.markdown).toBe("**ol**");
    expect(content.text).toBe("ol");
    expect(content.html).toContain("<strong>ol</strong>");
  });

  it("整篇选中（含分隔线）：同原文", () => {
    editor = createMarkoEditor();
    setMarkdown(editor, "a\n\n---\n\nb");
    const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, editor.state.doc.content.size - 1));
    editor.view.dispatch(tr);
    expect(selectedMarkdown(editor.state, syntax)).toBe("a\n\n---\n\nb");
  });
});

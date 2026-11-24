// S-5「Shift+Tab 自动缩进」（E-5）：开着时代码块里按 Shift+Tab 按语言的规则重新缩进选中的行（同旧版）；关着时照常反缩进。
// 看的是代码块（CodeMirror）里的内容：改动同步回编辑器要代码块有焦点，jsdom 里没有真正的焦点（同步那一段由交互测试管）
import { syntaxTree } from "@codemirror/language";
import { EditorView as CodeView, runScopeHandlers } from "@codemirror/view";
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkoEditor, setMarkdown, setSettings } from "../src/index.ts";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

async function codeBlock(markdown: string): Promise<CodeView> {
  editor = createMarkoEditor();
  document.body.append(editor.view.dom);
  setMarkdown(editor, markdown);
  const element = editor.view.dom.querySelector<HTMLElement>(".cm-editor");
  const view = element ? CodeView.findFromDOM(element) : null;
  if (!view) throw new Error("没有代码块");
  // 语言是异步加载的：等语法树出来
  await vi.waitFor(() => expect(syntaxTree(view.state).length).toBeGreaterThan(0), { timeout: 5_000 });
  return view;
}

function shiftTab(view: CodeView): boolean {
  // 真实使用时代码块有焦点，编辑器的选区跟着在代码块里：这里手动放进去
  editor.commands.setTextSelection({ from: 2, to: 2 + view.state.doc.length });
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
  return runScopeHandlers(view, new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }), "editor");
}

describe("S-5 Shift+Tab 自动缩进", () => {
  it("开着：按语言的规则缩进好（缩进宽度按「代码缩进宽度」）", async () => {
    const view = await codeBlock("```js\nfunction f() {\nreturn 1;\n}\n```\n");
    setSettings(editor, { shiftTabAutoIndent: true });
    expect(shiftTab(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("function f() {\n    return 1;\n}");
  });

  it("关着（默认）：反缩进", async () => {
    const view = await codeBlock("```js\nfunction f() {\n        return 1;\n}\n```\n");
    expect(shiftTab(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("function f() {\n    return 1;\n}");
  });
});

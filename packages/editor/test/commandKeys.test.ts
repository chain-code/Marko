// S-12：命令的快捷键可以由宿主改（settings.keyBindings）；null 表示编辑器不处理（交给宿主的菜单）
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { COMMAND_KEYS, createMarkoEditor, getMarkdown, setMarkdown, setSettings } from "../src/index.ts";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

function press(key: string, init: KeyboardEventInit, keyCode = 0): boolean {
  const view = editor.view;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, "keyCode", { value: keyCode });
  return Boolean(view.someProp("handleKeyDown", (handler) => handler(view, event)));
}

function openSelected(markdown: string): void {
  editor = createMarkoEditor();
  setMarkdown(editor, markdown, { anchor: 0, head: markdown.length });
}

describe("S-12 命令的快捷键", () => {
  it("默认：Ctrl+B 加粗（同 Typora）", () => {
    expect(COMMAND_KEYS.bold).toBe("Mod-b");
    openSelected("word");
    expect(press("b", { ctrlKey: true })).toBe(true);
    expect(getMarkdown(editor)).toBe("**word**");
  });

  it("改成 Ctrl+Alt+B 以后原来的 Ctrl+B 不再加粗；null 的不处理（交给宿主）", () => {
    openSelected("word");
    setSettings(editor, { keyBindings: { bold: "Mod-Alt-b", toggleSourceMode: null } });
    expect(press("b", { ctrlKey: true })).toBe(false);
    expect(getMarkdown(editor)).toBe("word");
    expect(press("b", { ctrlKey: true, altKey: true })).toBe(true);
    expect(getMarkdown(editor)).toBe("**word**");
    expect(press("/", { ctrlKey: true })).toBe(false);
  });

  it("默认没有快捷键的编辑器命令也可以给一个（高亮）", () => {
    openSelected("word");
    setSettings(editor, { keyBindings: { highlight: "Mod-Shift-h" } });
    expect(press("H", { ctrlKey: true, shiftKey: true }, 72)).toBe(true);
    expect(getMarkdown(editor)).toBe("==word==");
  });
});

// S-12：编辑器自己处理的命令快捷键（加粗、标题、切换源码模式……）。默认表和「现在绑的键」在 keyBindings.ts；
// 宿主可以改（settings.keyBindings：命令 → 键，null 表示编辑器不处理这个命令的快捷键——桌面应用把视图模式这几个交给菜单，
// 菜单和设置是同一份状态）。编辑器只用的键（Tab、回车、Alt+↑ 移动行、Mod+L 选中行……）不在这里，固定不变
import { Extension, type Editor } from "@tiptap/core";
import { keydownHandler } from "@tiptap/pm/keymap";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { COMMAND_KEYS, commandKey } from "../keyBindings.ts";
import type { EditorSettings } from "../settings.ts";
import { toggleSourceMode } from "../sourceMode/index.ts";
import { linkAt } from "./inlineSyntax.ts";
import { openLink } from "./viewModes.ts";

function runCommand(editor: Editor, name: string): boolean {
  switch (name) {
    case "toggleSourceMode":
      toggleSourceMode(editor);
      return true;
    case "openLink": {
      const url = linkAt(editor.state, editor.state.selection.head, editor.storage.marko.host);
      if (!url) return false;
      openLink(editor, url);
      return true;
    }
    default: {
      const command = (editor.commands as unknown as Record<string, (() => boolean) | undefined>)[name];
      return command ? command() : false;
    }
  }
}

/** 按现在的设置算出来的「键 → 命令」（设置换了对象就重算） */
const handlers = new WeakMap<EditorSettings, (view: EditorView, event: KeyboardEvent) => boolean>();

function handlerFor(editor: Editor): (view: EditorView, event: KeyboardEvent) => boolean {
  const settings = editor.storage.marko.settings;
  let handler = handlers.get(settings);
  if (!handler) {
    const bindings: Record<string, () => boolean> = {};
    // 默认表里的和宿主另外给的（高亮、上标这些默认没有快捷键的编辑器命令）
    const names = new Set([...Object.keys(COMMAND_KEYS), ...Object.keys(settings.keyBindings ?? {})]);
    for (const name of names) {
      const key = commandKey(settings, name);
      if (key) bindings[key] = () => runCommand(editor, name);
    }
    handler = keydownHandler(bindings);
    handlers.set(settings, handler);
  }
  return handler;
}

export const CommandKeys = Extension.create({
  name: "markoCommandKeys",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [new Plugin({ key: new PluginKey("markoCommandKeys"), props: { handleKeyDown: (view, event) => handlerFor(editor)(view, event) } })];
  },
});

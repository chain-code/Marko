// S-12：编辑器自己处理的命令快捷键的默认表，和「这个命令现在绑的键」（宿主在 settings.keyBindings 里改：命令 → 键，null 是不处理）。
// 只有数据和查表，处理按键的插件在 plugins/commandKeys.ts；源码模式的 CodeMirror 也按这里绑切换的键
import type { EditorSettings } from "./settings.ts";

/** 命令 → 默认的键（ProseMirror、CodeMirror 的写法：Mod 在 macOS 上是 Cmd，别处是 Ctrl） */
export const COMMAND_KEYS: Readonly<Record<string, string>> = {
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  strike: "Alt-Shift-5",
  inlineCode: "Mod-Shift-`",
  paragraph: "Mod-0",
  heading1: "Mod-1",
  heading2: "Mod-2",
  heading3: "Mod-3",
  heading4: "Mod-4",
  heading5: "Mod-5",
  heading6: "Mod-6",
  increaseHeading: "Mod-=",
  decreaseHeading: "Mod--",
  link: "Mod-k",
  clearFormat: "Mod-\\",
  indentLines: "Mod-]",
  outdentLines: "Mod-[",
  blockquote: "Mod-Shift-q",
  bulletList: "Mod-Shift-]",
  orderedList: "Mod-Shift-[",
  taskList: "Mod-Shift-x",
  codeBlock: "Mod-Shift-k",
  mathBlock: "Mod-Shift-m",
  image: "Mod-Shift-i",
  comment: "Mod-Shift-/",
  // E-11、V-1、V-2、N-4
  toggleSourceMode: "Mod-/",
  toggleFocusMode: "F8",
  toggleTypewriterMode: "F9",
  openLink: "Mod-Shift-o",
};

/** 这个命令现在绑的键：宿主改过的用改过的（null 是不处理），否则用默认的 */
export function commandKey(settings: EditorSettings, name: string): string | null {
  const overrides = settings.keyBindings ?? {};
  return Object.hasOwn(overrides, name) ? (overrides[name] ?? null) : (COMMAND_KEYS[name] ?? null);
}

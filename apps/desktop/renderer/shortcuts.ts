// S-12：快捷键在界面上怎么写、按下的键怎么录成快捷键、怎么交给编辑器。快捷键存的是 Electron 的写法（菜单直接用），
// 编辑器要 ProseMirror 的写法（Mod-Shift-k）
import { normalizeShortcut, SHORTCUTS, shortcutOf } from "@marko/shared";

export function isMacPlatform(userAgent = navigator.userAgent): boolean {
  return /mac/i.test(userAgent);
}

/** 按键的 code → Electron 写法里键的名字（字母、数字、F 键另外算） */
const CODE_KEYS: Record<string, string> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  Space: "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
};

type KeyLike = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/**
 * 按下的键 → Electron 写法的快捷键（按 code 认键，和键盘布局、Option 打出来的字无关）。
 * 只按了修饰键、不带 Ctrl/Cmd/Alt 的字母数字符号（会挡住输入）、Windows 上的 Win 键组合：返回 null
 */
export function acceleratorFromEvent(event: KeyLike, mac: boolean): string | null {
  const { code } = event;
  const key = /^Key[A-Z]$/.test(code)
    ? code.slice(3)
    : /^Digit[0-9]$/.test(code)
      ? code.slice(5)
      : /^F([1-9]|1[0-9]|2[0-4])$/.test(code)
        ? code
        : CODE_KEYS[code];
  if (!key) return null;
  const parts: string[] = [];
  if (mac) {
    if (event.metaKey) parts.push("CmdOrCtrl");
    if (event.ctrlKey) parts.push("Ctrl");
  } else {
    // Windows 键、Super 键的组合系统在用
    if (event.metaKey) return null;
    if (event.ctrlKey) parts.push("CmdOrCtrl");
  }
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  const functionKey = /^F\d+$/.test(key);
  if (!functionKey && !parts.some((part) => part !== "Shift")) return null;
  return [...parts, key].join("+");
}

const MAC_MODIFIERS: Array<[string, string]> = [
  ["Ctrl", "⌃"],
  ["Alt", "⌥"],
  ["Shift", "⇧"],
  ["Cmd", "⌘"],
];

const MAC_KEYS: Record<string, string> = { Up: "↑", Down: "↓", Left: "←", Right: "→", Enter: "↩", Backspace: "⌫", Delete: "⌦", Tab: "⇥" };

/** 界面上显示的快捷键：Windows、Linux「Ctrl+Shift+K」（同菜单）；macOS「⇧⌘K」 */
export function displayShortcut(shortcut: string, mac: boolean): string {
  if (!shortcut) return "";
  const parts = normalizeShortcut(shortcut, mac).split("+");
  const key = parts.pop() ?? "";
  if (!mac) return [...parts, key].join("+");
  return MAC_MODIFIERS.filter(([name]) => parts.includes(name)).map(([, symbol]) => symbol).join("") + (MAC_KEYS[key] ?? key);
}

const EDITOR_KEYS: Record<string, string> = { Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight" };

/** Electron 写法 → ProseMirror 写法：CmdOrCtrl+Shift+K → Mod-Shift-k；没有快捷键是 null */
export function editorKeyOf(shortcut: string): string | null {
  if (!shortcut) return null;
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  const modifiers = parts.map((part) => {
    if (part === "CmdOrCtrl" || part === "CommandOrControl") return "Mod";
    if (part === "Cmd" || part === "Command") return "Meta";
    if (part === "Option") return "Alt";
    return part;
  });
  const name = key.length === 1 ? key.toLowerCase() : (EDITOR_KEYS[key] ?? key);
  return [...modifiers, name].join("-");
}

/** 编辑器命令里交给菜单的：源码、专注、打字机模式（应用的状态，存在设置里）、打开链接（本地文件按 F-3 打开） */
const MENU_OWNED = ["toggleSourceMode", "toggleFocusMode", "toggleTypewriterMode", "openLink"];

/**
 * 交给编辑器的快捷键（组件的 keyBindings）：菜单里对应编辑器命令的，按现在的设置给（编辑区里由编辑器处理，和菜单显示的一样）；
 * 交给菜单的那几个是 null（编辑器不处理，按键走菜单）
 */
export function editorKeyBindings(bindings: Readonly<Record<string, string>>, mac: boolean): Record<string, string | null> {
  const result: Record<string, string | null> = Object.fromEntries(MENU_OWNED.map((name) => [name, null]));
  for (const entry of SHORTCUTS) {
    if (entry.editor) result[entry.editor] = editorKeyOf(shortcutOf(entry, bindings, mac));
  }
  return result;
}

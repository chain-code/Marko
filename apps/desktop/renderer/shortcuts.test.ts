// S-12：录快捷键、显示快捷键、交给编辑器的写法
import { describe, expect, it } from "vitest";
import { SHORTCUTS } from "@marko/shared";
import { DEFAULT_LOCALE, LOCALES } from "../locales/index.ts";
import { setLocale, tryT } from "./i18n.ts";
import { acceleratorFromEvent, displayShortcut, editorKeyBindings, editorKeyOf } from "./shortcuts.ts";

const press = (code: string, modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}) => ({
  code,
  ctrlKey: !!modifiers.ctrl,
  altKey: !!modifiers.alt,
  shiftKey: !!modifiers.shift,
  metaKey: !!modifiers.meta,
});

describe("S-12 快捷键", () => {
  it("录快捷键：按 code 认键；要带 Ctrl/Cmd/Alt（F 键可以不带）；只按修饰键、Win 键组合不算", () => {
    expect(acceleratorFromEvent(press("KeyB", { ctrl: true, alt: true }), false)).toBe("CmdOrCtrl+Alt+B");
    expect(acceleratorFromEvent(press("Digit1", { ctrl: true, shift: true }), false)).toBe("CmdOrCtrl+Shift+1");
    expect(acceleratorFromEvent(press("Backslash", { ctrl: true }), false)).toBe("CmdOrCtrl+\\");
    expect(acceleratorFromEvent(press("F8"), false)).toBe("F8");
    expect(acceleratorFromEvent(press("ArrowUp", { alt: true }), false)).toBe("Alt+Up");
    expect(acceleratorFromEvent(press("KeyB"), false)).toBeNull();
    expect(acceleratorFromEvent(press("KeyB", { shift: true }), false)).toBeNull();
    expect(acceleratorFromEvent(press("ControlLeft", { ctrl: true }), false)).toBeNull();
    expect(acceleratorFromEvent(press("KeyB", { meta: true }), false)).toBeNull();
    // macOS：Cmd 是 CmdOrCtrl，Control 另算
    expect(acceleratorFromEvent(press("KeyB", { meta: true }), true)).toBe("CmdOrCtrl+B");
    expect(acceleratorFromEvent(press("KeyB", { ctrl: true, meta: true }), true)).toBe("CmdOrCtrl+Ctrl+B");
  });

  it("显示：Windows、Linux 同菜单；macOS 用符号", () => {
    expect(displayShortcut("CmdOrCtrl+Shift+K", false)).toBe("Ctrl+Shift+K");
    expect(displayShortcut("CmdOrCtrl+Shift+K", true)).toBe("⇧⌘K");
    expect(displayShortcut("Alt+Up", true)).toBe("⌥↑");
    expect(displayShortcut("", false)).toBe("");
  });

  it("交给编辑器：换成 ProseMirror 的写法；视图模式、打开链接交给菜单", () => {
    expect(editorKeyOf("CmdOrCtrl+Shift+K")).toBe("Mod-Shift-k");
    expect(editorKeyOf("CmdOrCtrl+\\")).toBe("Mod-\\");
    expect(editorKeyOf("Alt+Up")).toBe("Alt-ArrowUp");
    expect(editorKeyOf("")).toBeNull();
    const defaults = editorKeyBindings({}, false);
    expect(defaults.bold).toBe("Mod-b");
    expect(defaults.heading1).toBe("Mod-1");
    expect(defaults.highlight).toBeNull();
    expect(defaults.toggleSourceMode).toBeNull();
    expect(defaults.toggleFocusMode).toBeNull();
    const changed = editorKeyBindings({ bold: "CmdOrCtrl+Alt+B", italic: "", highlight: "CmdOrCtrl+Shift+H" }, false);
    expect(changed.bold).toBe("Mod-Alt-b");
    expect(changed.italic).toBeNull();
    expect(changed.highlight).toBe("Mod-Shift-h");
  });
});

describe("S-12 快捷键表的文字", () => {
  it("每一项在每种语言里都有菜单的文字", () => {
    for (const code of Object.keys(LOCALES)) {
      setLocale(code);
      for (const item of SHORTCUTS) expect(tryT(item.label, { manager: "x" }), `${code} ${item.id}`).not.toBeNull();
    }
    setLocale(DEFAULT_LOCALE);
  });
});

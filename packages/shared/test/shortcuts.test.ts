// S-12：快捷键表——编号不重复；默认的快捷键在每个平台上互不冲突、不占编辑器保留的键；比较时写法统一
import { describe, expect, it } from "vitest";
import { normalizeShortcut, RESERVED_SHORTCUTS, SHORTCUTS, shortcutConflict, shortcutOf } from "../src/shortcuts.ts";

describe("S-12 快捷键表", () => {
  it("编号不重复", () => {
    const ids = SHORTCUTS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("默认的快捷键在 Windows/Linux、macOS 上都互不冲突，也不占编辑器保留的键", () => {
    for (const mac of [false, true]) {
      const seen = new Map<string, string>();
      for (const item of SHORTCUTS) {
        const key = normalizeShortcut(shortcutOf(item, {}, mac), mac);
        if (!key) continue;
        expect(seen.get(key), `${mac ? "mac" : "win"} ${key}：${item.id} 和 ${seen.get(key)}`).toBeUndefined();
        seen.set(key, item.id);
        const taken = RESERVED_SHORTCUTS.filter((reserved) => reserved.owner !== item.id).map((reserved) => normalizeShortcut(reserved.key, mac));
        expect(taken, item.id).not.toContain(key);
      }
    }
  });

  it("统一写法：CmdOrCtrl 按平台换、修饰键排好顺序、字母大写", () => {
    expect(normalizeShortcut("Shift+CmdOrCtrl+k", false)).toBe("Ctrl+Shift+K");
    expect(normalizeShortcut("Shift+CmdOrCtrl+k", true)).toBe("Cmd+Shift+K");
    expect(normalizeShortcut("Option+Command+F", true)).toBe("Cmd+Alt+F");
    expect(normalizeShortcut("Ctrl+Y", false)).toBe(normalizeShortcut("CmdOrCtrl+Y", false));
    expect(normalizeShortcut("", false)).toBe("");
  });

  it("改过的用改过的（\"\" 是不要快捷键）；不能改的照旧；撞了能查出来", () => {
    const bold = SHORTCUTS.find((item) => item.id === "bold")!;
    const undo = SHORTCUTS.find((item) => item.id === "editor.undo")!;
    expect(shortcutOf(bold, {}, false)).toBe("CmdOrCtrl+B");
    expect(shortcutOf(bold, { bold: "CmdOrCtrl+Alt+B" }, false)).toBe("CmdOrCtrl+Alt+B");
    expect(shortcutOf(bold, { bold: "" }, false)).toBe("");
    expect(shortcutOf(undo, { "editor.undo": "F5" }, false)).toBe("CmdOrCtrl+Z");
    expect(shortcutConflict("Ctrl+I", "bold", {}, false)).toMatchObject({ id: "italic" });
    expect(shortcutConflict("CmdOrCtrl+L", "bold", {}, false)).toBe("reserved");
    expect(shortcutConflict("CmdOrCtrl+Alt+B", "bold", {}, false)).toBeNull();
    // 给了别的命令以后，原来那个键空出来了
    expect(shortcutConflict("CmdOrCtrl+B", "italic", { bold: "CmdOrCtrl+Alt+B" }, false)).toBeNull();
  });
});

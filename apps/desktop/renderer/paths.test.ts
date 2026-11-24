// 渲染进程的路径计算和宿主的地址换算
import { describe, expect, it, vi } from "vitest";
import type { MarkoApi } from "@marko/shared";
import { createHost } from "./host.ts";
import { basename, dirname, isAbsolute, join } from "./paths.ts";

describe("路径", () => {
  it("Windows 和 POSIX 的目录、文件名、拼接（. 和 ..）", () => {
    expect(dirname(String.raw`C:\docs\a.md`)).toBe(String.raw`C:\docs`);
    expect(dirname(String.raw`C:\a.md`)).toBe("C:\\");
    expect(dirname("/home/u/a.md")).toBe("/home/u");
    expect(dirname("/a.md")).toBe("/");
    expect(basename(String.raw`C:\docs\a.md`)).toBe("a.md");
    expect(join(String.raw`C:\docs\notes`, "../img/a.png")).toBe(String.raw`C:\docs\img\a.png`);
    expect(join("/home/u/notes", "./img/b.png")).toBe("/home/u/notes/img/b.png");
    expect(isAbsolute(String.raw`D:\x.png`)).toBe(true);
    expect(isAbsolute("img/x.png")).toBe(false);
  });
});

describe("宿主（K-2 的桌面实现）", () => {
  const api = { shell: { openExternal: vi.fn(async () => ({ ok: true, value: undefined })) } } as unknown as MarkoApi;

  it("相对地址按文档所在目录换成 marko-asset://；网址、data:、锚点原样", () => {
    const host = createHost(api, { documentPath: () => String.raw`C:\docs\note.md`, openLocal: vi.fn(), reportError: vi.fn(), saveFirst: async () => null, insertAction: () => "assets", diagramTheme: () => "light" });
    expect(host.resolveUrl?.("img/a%20b.png", "image")).toBe("marko-asset://local/C:/docs/img/a%20b.png");
    expect(host.resolveUrl?.("https://e.com/a.png", "image")).toBe("https://e.com/a.png");
    expect(host.resolveUrl?.("data:image/png;base64,xx", "image")).toBe("data:image/png;base64,xx");
    expect(host.resolveUrl?.("#top", "link")).toBe("#top");
    // 链接原样：打开时（openLink）按文档的位置解析，还要 #标题（N-4）
    expect(host.resolveUrl?.("../other/x.md#part", "link")).toBe("../other/x.md#part");
    expect(host.resolveUrl?.(String.raw`D:\pics\c.png`, "image")).toBe("marko-asset://local/D:/pics/c.png");
  });

  it("新文档（没有路径）：相对地址原样", () => {
    const host = createHost(api, { documentPath: () => null, openLocal: vi.fn(), reportError: vi.fn(), saveFirst: async () => null, insertAction: () => "assets", diagramTheme: () => "light" });
    expect(host.resolveUrl?.("img/a.png", "image")).toBe("img/a.png");
  });

  it("链接：网址交给系统浏览器；本地文件按文档目录打开；别的协议报错", () => {
    const openLocal = vi.fn();
    const reportError = vi.fn();
    const host = createHost(api, { documentPath: () => "/home/u/note.md", openLocal, reportError, saveFirst: async () => null, insertAction: () => "assets", diagramTheme: () => "light" });
    host.openLink?.("https://example.com");
    expect(api.shell.openExternal).toHaveBeenCalledWith("https://example.com");
    host.openLink?.("other.md#part");
    expect(openLocal).toHaveBeenCalledWith("/home/u/other.md", "part");
    // 标题解码；没有 # 时不给
    host.openLink?.("../a%20b/x.md#%E7%AC%AC%E4%BA%8C%E8%8A%82");
    expect(openLocal).toHaveBeenLastCalledWith("/home/a b/x.md", "第二节");
    host.openLink?.("/abs/y.md");
    expect(openLocal).toHaveBeenLastCalledWith("/abs/y.md", undefined);
    host.openLink?.("javascript:alert(1)");
    expect(reportError).toHaveBeenCalled();
  });
});

describe("O-1 导出时的图片地址", () => {
  it("本地路径（相对文档所在目录）换成 file:// 绝对地址；网址、data: 原样", async () => {
    const { exportImageUrl, fileUrl } = await import("./paths.ts");
    expect(fileUrl(String.raw`C:\docs\a b\图.png`)).toBe("file:///C:/docs/a%20b/%E5%9B%BE.png");
    expect(fileUrl("/home/u/x.png")).toBe("file:///home/u/x.png");
    expect(exportImageUrl("assets/a%20b.png", String.raw`C:\docs\note.md`)).toBe("file:///C:/docs/assets/a%20b.png");
    expect(exportImageUrl("https://e.com/x.png", null)).toBe("https://e.com/x.png");
    expect(exportImageUrl("data:image/png;base64,AA", null)).toBe("data:image/png;base64,AA");
    expect(exportImageUrl("rel.png", null)).toBe("rel.png");
  });
});

describe("W-6 相对路径", () => {
  it("目录到文件的相对路径；Windows 不分大小写；不同盘是 null", async () => {
    const { relativePath } = await import("./paths.ts");
    expect(relativePath(String.raw`C:\work\notes`, String.raw`C:\Work\notes\a\b.md`)).toBe("a/b.md");
    expect(relativePath(String.raw`C:\work\notes\x`, String.raw`C:\work\other\b.md`)).toBe("../../other/b.md");
    expect(relativePath("/home/u/docs", "/home/u/img/a.png")).toBe("../img/a.png");
    expect(relativePath(String.raw`C:\a`, String.raw`D:\b.md`)).toBeNull();
  });
});

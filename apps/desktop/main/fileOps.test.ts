// 文件操作（F-13、W-6）：新建、改名，不覆盖已有的
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFolder, createMarkdownFile, renamedPath, renameFile } from "./fileOps.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marko-ops-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("F-13、W-6 文件操作", () => {
  it("新建 Markdown 文件：没写扩展名时加 .md；已经有了不覆盖", async () => {
    expect(await createMarkdownFile(root, "笔记")).toBe(join(root, "笔记.md"));
    expect(await createMarkdownFile(root, "readme.markdown")).toBe(join(root, "readme.markdown"));
    writeFileSync(join(root, "a.md"), "keep");
    await expect(createMarkdownFile(root, "a.md")).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("keep");
    expect(await createFolder(root, "子目录")).toBe(join(root, "子目录"));
    await expect(createFolder(root, "子目录")).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("改名：只给文件名时扩展名不变；目标已存在时不覆盖；只改大小写可以", async () => {
    const from = join(root, "old.md");
    writeFileSync(from, "x");
    expect(renamedPath(from, "new")).toBe(join(root, "new.md"));
    expect(renamedPath(from, "new.markdown")).toBe(join(root, "new.markdown"));
    writeFileSync(join(root, "taken.md"), "other");
    await expect(renameFile(from, join(root, "taken.md"))).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(join(root, "taken.md"), "utf8")).toBe("other");
    await renameFile(from, join(root, "Old.md"));
    expect(existsSync(join(root, "Old.md"))).toBe(true);
    await renameFile(join(root, "Old.md"), join(root, "new.md"));
    expect(readFileSync(join(root, "new.md"), "utf8")).toBe("x");
  });
});

describe("F-15 拖到窗口上的路径", () => {
  it("分成文件夹和 Markdown 文件；别的文件、不存在的不管", async () => {
    const { classifyDropped } = await import("./fileOps.ts");
    writeFileSync(join(root, "a.md"), "# A");
    writeFileSync(join(root, "B.MARKDOWN"), "# B");
    writeFileSync(join(root, "c.png"), "png");
    const folder = await createFolder(root, "notes");
    const result = await classifyDropped([join(root, "a.md"), folder, join(root, "c.png"), join(root, "B.MARKDOWN"), join(root, "missing.md")], [".md", ".markdown"]);
    expect(result).toEqual({ folders: [folder], documents: [join(root, "a.md"), join(root, "B.MARKDOWN")] });
  });
});

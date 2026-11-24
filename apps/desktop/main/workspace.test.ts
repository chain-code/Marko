// 工作区的文件树（W-2）
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listWorkspace } from "./workspace.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marko-ws-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("W-2 文件树", () => {
  it("文件夹在前，按名称的自然顺序；只列 Markdown 文件；以 . 开头的、依赖目录不列", async () => {
    for (const name of ["10.md", "2.md", "b.markdown", "notes.txt", ".hidden.md"]) writeFileSync(join(root, name), "");
    mkdirSync(join(root, "第二章"));
    writeFileSync(join(root, "第二章", "x.md"), "");
    mkdirSync(join(root, "a-folder"));
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".git", "y.md"), "");
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "node_modules", "z.md"), "");
    const workspace = await listWorkspace(root);
    expect(workspace.truncated).toBe(false);
    // 文件夹之间按系统语言的顺序（中文、英文谁在前看系统），这里只看文件夹在前
    const kinds = workspace.entries.map((entry) => entry.kind);
    expect(kinds).toEqual(["folder", "folder", "file", "file", "file"]);
    expect(workspace.entries.slice(0, 2).map((entry) => entry.name).sort()).toEqual(["a-folder", "第二章"]);
    expect(workspace.entries.slice(2).map((entry) => entry.name)).toEqual(["2.md", "10.md", "b.markdown"]);
    const chapter = workspace.entries.find((entry) => entry.name === "第二章");
    expect(chapter?.children?.map((entry) => entry.name)).toEqual(["x.md"]);
    expect(workspace.entries.find((entry) => entry.name === "a-folder")?.children).toEqual([]);
  });
});

// F-14：命令行、系统交过来的文件
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filesIn } from "./argv.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-argv-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("F-14 交过来的文件", () => {
  it("相对路径按启动时的目录；file:// 地址（Linux 的 %U）也认，空格、中文转义过的照样；选项、不存在的、文件夹不算", () => {
    const plain = join(dir, "a.md");
    const spaced = join(dir, "我的 笔记.md");
    writeFileSync(plain, "a");
    writeFileSync(spaced, "b");
    mkdirSync(join(dir, "folder"));
    const argv = ["--inspect", "a.md", pathToFileURL(spaced).href, "missing.md", "folder", "", "file://%%bad"];
    expect(filesIn(argv, dir)).toEqual([plain, spaced]);
  });
});

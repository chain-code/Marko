// 全局搜索（W-5）：片段、偏移的换算，真的调 ripgrep 搜一个临时目录
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebContents } from "electron";
import { EVENTS, type SearchDone, type SearchFileResult, type SearchRequest } from "@marko/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIMIT, matchOf, previewOf, startSearch } from "./search.ts";

describe("片段", () => {
  it("去掉行尾换行和行首空白，范围跟着挪", () => {
    expect(previewOf("   foo bar\r\n", [[7, 10]])).toEqual({ preview: "foo bar", ranges: [[4, 7]] });
  });

  it("太长时截取第一个匹配附近，前后加省略号", () => {
    const line = `${"a".repeat(300)}MATCH${"b".repeat(300)}`;
    const { preview, ranges } = previewOf(line, [[300, 305]]);
    expect(preview.startsWith("…")).toBe(true);
    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBe(162);
    expect(preview.slice(ranges[0][0], ranges[0][1])).toBe("MATCH");
  });

  it("ripgrep 的字节偏移换成字符偏移（中文）", () => {
    const match = matchOf({
      path: { text: "x.md" },
      lines: { text: "  中文 apple 测试\r\n" },
      line_number: 3,
      submatches: [{ start: 9, end: 14 }],
    });
    expect(match).toMatchObject({ line: 3, column: 5, length: 5, preview: "中文 apple 测试" });
    expect(match.preview.slice(match.ranges[0][0], match.ranges[0][1])).toBe("apple");
  });
});

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marko-search-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

let nextContents = 1;

/** 假的窗口：记下推过来的结果，搜完时 finished 兑现 */
function search(request: Omit<SearchRequest, "id" | "root">): Promise<{ done: SearchDone; files: SearchFileResult[] }> {
  return new Promise((resolve) => {
    const files: SearchFileResult[] = [];
    const contents = {
      id: nextContents++,
      isDestroyed: () => false,
      once: () => contents,
      send(channel: string, payload: unknown) {
        if (channel === EVENTS.searchResults) files.push(...(payload as { files: SearchFileResult[] }).files);
        if (channel === EVENTS.searchDone) resolve({ done: payload as SearchDone, files });
      },
    };
    startSearch(contents as unknown as WebContents, { id: 7, root, ...request });
  });
}

describe("调 ripgrep", () => {
  it("只搜文件树里列的 Markdown 文件；区分大小写、全词；BOM 去掉了", async () => {
    mkdirSync(join(root, "sub"));
    mkdirSync(join(root, "node_modules"));
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, "a.md"), "﻿apple pie\nno\nApple tree\n");
    writeFileSync(join(root, "sub", "b.MARKDOWN"), "pineapple\n");
    writeFileSync(join(root, "node_modules", "c.md"), "apple\n");
    writeFileSync(join(root, ".git", "d.md"), "apple\n");
    writeFileSync(join(root, "e.txt"), "apple\n");

    const all = await search({ query: "apple", caseSensitive: false, wholeWord: false, regexp: false });
    expect(all.done).toEqual({ id: 7, truncated: false });
    const byName = Object.fromEntries(all.files.map((file) => [file.path.slice(root.length + 1), file.matches.map((match) => [match.line, match.column])]));
    expect(byName).toEqual({ "a.md": [[1, 0], [3, 0]], [join("sub", "b.MARKDOWN")]: [[1, 4]] });

    const exact = await search({ query: "apple", caseSensitive: true, wholeWord: true, regexp: false });
    expect(exact.files.map((file) => file.matches.map((match) => match.line))).toEqual([[1]]);
  });

  it("正则：分组、写错了的报出来", async () => {
    writeFileSync(join(root, "a.md"), "x=1, y=2\n");
    const found = await search({ query: "(\\w)=(\\d)", caseSensitive: false, wholeWord: false, regexp: true });
    expect(found.files[0].matches[0].ranges).toEqual([
      [0, 3],
      [5, 8],
    ]);
    const broken = await search({ query: "(", caseSensitive: false, wholeWord: false, regexp: true });
    expect(broken.done.error).toBeTruthy();
    expect(broken.files).toEqual([]);
  });

  it(`匹配太多时只列前 ${LIMIT} 处`, async () => {
    for (let index = 0; index < 12; index += 1) writeFileSync(join(root, `${index}.md`), "hit\n".repeat(200));
    const { done, files } = await search({ query: "hit", caseSensitive: false, wholeWord: false, regexp: false });
    expect(done.truncated).toBe(true);
    expect(files.reduce((sum, file) => sum + file.matches.length, 0)).toBe(LIMIT);
  });
});

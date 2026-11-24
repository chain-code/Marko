// 快速打开（F-4）的排序
import { describe, expect, it } from "vitest";
import { hitSegments, QUICK_OPEN_LIMIT, quickOpenCandidates, quickOpenItems } from "./quickOpen.ts";

const files = [
  { path: "/w/notes/readme.md", name: "readme.md", directory: "notes" },
  { path: "/w/README.md", name: "README.md", directory: "" },
  { path: "/w/daily/2026-11-24.md", name: "2026-11-24.md", directory: "daily" },
  { path: "/w/reading-list.md", name: "reading-list.md", directory: "" },
];

describe("F-4 快速打开", () => {
  it("模糊匹配：连续命中的靠前；目录名也能匹配；命中的字分到名字和目录里", () => {
    const candidates = quickOpenCandidates(files, []);
    const items = quickOpenItems(candidates, "readme");
    expect(items.map((item) => item.path).slice(0, 2).sort()).toEqual(["/w/README.md", "/w/notes/readme.md"]);
    expect(items[0].nameHits).toEqual([0, 1, 2, 3, 4, 5]);
    const byDirectory = quickOpenItems(candidates, "daily 24");
    expect(byDirectory[0].path).toBe("/w/daily/2026-11-24.md");
    expect(byDirectory[0].directoryHits).toEqual([0, 1, 2, 3, 4]);
  });

  it("分数一样时最近打开过的在前；没输入时最近打开过的在前，其余按名称", () => {
    const recent = [{ path: "/w/notes/readme.md", openedAt: 2 }];
    const candidates = quickOpenCandidates(files, recent);
    expect(quickOpenItems(candidates, "readme")[0].path).toBe("/w/notes/readme.md");
    expect(quickOpenItems(candidates, "").map((item) => item.path)).toEqual([
      "/w/notes/readme.md",
      "/w/daily/2026-11-24.md",
      "/w/reading-list.md",
      "/w/README.md",
    ]);
  });

  it("没有工作区时从最近文件里找；最多列 30 个", () => {
    const recent = Array.from({ length: 40 }, (_, index) => ({ path: `/r/${index}/note.md`, openedAt: index }));
    const candidates = quickOpenCandidates(null, recent);
    expect(candidates[0]).toMatchObject({ name: "note.md", directory: "/r/0", recent: 0 });
    expect(quickOpenItems(candidates, "note")).toHaveLength(QUICK_OPEN_LIMIT);
    expect(quickOpenItems(candidates, "")).toHaveLength(QUICK_OPEN_LIMIT);
  });

  it("命中的字分段高亮", () => {
    expect(hitSegments("readme", [0, 1, 4])).toEqual([
      { text: "re", hit: true },
      { text: "ad", hit: false },
      { text: "m", hit: true },
      { text: "e", hit: false },
    ]);
  });
});

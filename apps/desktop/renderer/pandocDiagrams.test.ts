// O-4：交给 Pandoc 的 Markdown 里图表换成图片
import { describe, expect, it, vi } from "vitest";
import { parse } from "@marko/markdown";
import { replaceDiagrams } from "./pandocDiagrams.ts";

describe("O-4 图表先画成图片", () => {
  it("图表块（含列表、引用里的）换成引用图片，带显示宽度；别的代码块、画不出来的图表不动", async () => {
    const source = [
      "# 标题",
      "",
      "```mermaid",
      "graph TD",
      "  A-->B",
      "```",
      "",
      "```js",
      "const a = 1;",
      "```",
      "",
      "> ```sequence",
      "> A->B: hi",
      "> ```",
      "",
      "- 项",
      "",
      "  ```flow",
      "  st=>start: 开始",
      "  ```",
      "",
      "```mermaid",
      "坏的",
      "```",
      "",
      "结尾",
      "",
    ].join("\n");
    const render = vi.fn(async (kind: string, code: string) => (code === "坏的" ? { error: "语法错误" } : { svg: `<svg data-kind="${kind}"></svg>` }));
    const size = vi.fn(() => ({ width: 120.4, height: 80.6 }));
    const { markdown, diagrams } = await replaceDiagrams(parse(source), { render, size }, "t0k");
    expect(render.mock.calls).toEqual([
      ["mermaid", "graph TD\n  A-->B"],
      ["sequence", "A->B: hi"],
      ["flowchart", "st=>start: 开始"],
      ["mermaid", "坏的"],
    ]);
    expect(diagrams).toEqual([
      { name: "marko-diagram-t0k-1.png", svg: '<svg data-kind="mermaid"></svg>', width: 120, height: 81 },
      { name: "marko-diagram-t0k-2.png", svg: '<svg data-kind="sequence"></svg>', width: 120, height: 81 },
      { name: "marko-diagram-t0k-3.png", svg: '<svg data-kind="flowchart"></svg>', width: 120, height: 81 },
    ]);
    expect(markdown.split("\n")).toEqual([
      "# 标题",
      "",
      "![](marko-diagram-t0k-1.png){width=120px}",
      "",
      "```js",
      "const a = 1;",
      "```",
      "",
      "> ![](marko-diagram-t0k-2.png){width=120px}",
      "",
      "- 项",
      "",
      "  ![](marko-diagram-t0k-3.png){width=120px}",
      "",
      "```mermaid",
      "坏的",
      "```",
      "",
      "结尾",
      "",
    ]);
  });
});

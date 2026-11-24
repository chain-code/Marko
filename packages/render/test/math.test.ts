// D-1 公式的字体：MathJax 4 把不常用的字符放在按需加载的文件里（mathFonts.ts）
import { parse } from "@marko/markdown";
import { describe, expect, it } from "vitest";
import { exportDocument } from "../src/exportDocument.ts";
import { loadMathFonts, renderMath, renderMathDocument } from "../src/math.ts";

// 都落在按需加载的字体文件里：双线体、花体、哥特体、手写体、无衬线、等宽、符号
const DYNAMIC = ["\\mathbb{R}", "\\mathcal{L}", "\\mathfrak{g}", "\\mathscr{F}", "\\mathsf{A}", "\\mathtt{x}", "\\checkmark", "\\heartsuit", "\\ell", "\\text{★}"];

describe("D-1 按需加载的字体", () => {
  it("字体还没加载时同步渲染标成 pending，不进缓存；加载以后单个公式和整篇都能渲染", async () => {
    const before = renderMath("\\mathbb{Z}", false);
    expect(before.pending).toBe(true);
    await loadMathFonts(DYNAMIC.map((tex) => ({ tex, display: false })));
    for (const tex of DYNAMIC) {
      const result = renderMath(tex, false);
      expect(result.pending, tex).toBeFalsy();
      expect(result.error, tex).toBeNull();
      expect(result.html, tex).toContain("<mjx-container");
    }
    // ℤ 和 ℝ 在同一个文件里：加载过以后，之前 pending 的公式重新渲染就好了（pending 的结果没缓存）
    expect(renderMath("\\mathbb{Z}", false).html).toContain('data-c="2124"');
    // 整篇渲染每次新建 MathJax 实例，已经加载过的字体也要装上
    const document = renderMathDocument(DYNAMIC.map((tex) => ({ tex, display: true })));
    expect(document.filter((result) => result.pending || result.error)).toEqual([]);
  });

  it("导出时先把公式要用的字体加载好", async () => {
    const html = await exportDocument(parse("$\\mathfrak{su}(2)$ 和\n\n$$\n\\mathscr{H} \\tag{★}\n$$"), { title: "t" });
    expect(html).not.toContain("md-math-error");
    expect(html.match(/<mjx-container/g)).toHaveLength(2);
  });
});

describe("D-1 宏定义不串到别的公式", () => {
  const glyphs = (html: string) => (html.match(/data-c="([0-9A-F]+)"/g) ?? []).map((match) => String.fromCodePoint(Number.parseInt(match.slice(8, -1), 16))).join("");

  it("单个公式里的 \\def 不留给之后的公式，结果只取决于公式自己（缓存才可信）", () => {
    renderMath(String.raw`\def\zzfoo{a}`, false);
    const first = renderMath(String.raw`\zzfoo`, false);
    renderMath(String.raw`\def\zzfoo{b}`, false);
    const second = renderMath(String.raw`\zzfoo`, false);
    // 没定义的控制序列按 noundefined 包的办法照原样显示成红字
    expect(glyphs(first.html)).toContain("zzfoo");
    expect(second.html).toBe(first.html);
  });

  it("整篇渲染时按文档顺序生效（前面定义、后面用）", () => {
    const [, used] = renderMathDocument([
      { tex: String.raw`\def\zzbar{q}`, display: true },
      { tex: String.raw`\zzbar`, display: true },
    ]);
    expect(glyphs(used.html)).not.toContain("zzbar");
    expect(used.html).toContain('data-c="1D45E"');
  });
});

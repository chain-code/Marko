import { describe, expect, it } from "vitest";
import { sanitizeMarkdownHtml } from "@/utils/sanitizeMarkdownHtml";

function sanitizeToFragment(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = sanitizeMarkdownHtml(html);
  return template.content;
}

describe("sanitizeMarkdownHtml local resource URLs", () => {
  it("keeps strict Windows absolute paths without allowing lookalike protocols", () => {
    const fragment = sanitizeToFragment([
      '<img id="slash" src="C:/docs/assets/image.png">',
      '<img id="backslash" src="D:\\docs\\assets\\image.png">',
      '<img id="encoded" src="E:%5Cdocs%5Cassets%5Cimage.png">',
      '<img id="lookalike" src="C:javascript:alert(1)">',
      '<img id="script" src="javascript:alert(1)">',
    ].join(""));

    expect(fragment.querySelector("#slash")?.getAttribute("src")).toBe("C:/docs/assets/image.png");
    expect(fragment.querySelector("#backslash")?.getAttribute("src")).toBe("D:\\docs\\assets\\image.png");
    expect(fragment.querySelector("#encoded")?.getAttribute("src")).toBe("E:%5Cdocs%5Cassets%5Cimage.png");
    expect(fragment.querySelector("#lookalike")?.hasAttribute("src")).toBe(false);
    expect(fragment.querySelector("#script")?.hasAttribute("src")).toBe(false);
  });

  it("preserves MathJax SVG containers and safe equation references", () => {
    const fragment = sanitizeToFragment([
      '<mjx-container class="MathJax" jax="SVG" display="true" overflow="overflow">',
      '<svg viewBox="0 0 10 10" role="img" xmlns="http://www.w3.org/2000/svg">',
      '<defs><path id="glyph" d="M0 0L10 10"></path></defs>',
      '<g data-mml-node="math" data-latex="x"><use data-c="78" xlink:href="#glyph"></use></g>',
      '<a href="#mjx-eqn%3Atest"><rect width="10" height="10"></rect></a>',
      '</svg>',
      '<mjx-break size="3"></mjx-break>',
      '</mjx-container>',
    ].join(""));

    const container = fragment.querySelector("mjx-container.MathJax");
    expect(container?.getAttribute("jax")).toBe("SVG");
    expect(container?.getAttribute("display")).toBe("true");
    expect(container?.querySelector("svg defs path#glyph")).not.toBeNull();
    const use = container?.querySelector("use");
    expect(use?.getAttribute("xlink:href") ?? use?.getAttribute("href"))
      .toBe("#glyph");
    expect(container?.querySelector("a")?.getAttribute("href")).toBe("#mjx-eqn%3Atest");
    expect(container?.querySelector("mjx-break")?.getAttribute("size")).toBe("3");
  });
});

// 1.5.3 行内片段：编辑器的装饰和渲染共用。期望从 tests/inlineSyntax.test.ts、tests/mathSyntax.test.ts、
// tests/markdown.test.ts 的行内公式用例迁来
import { describe, expect, it } from "vitest";
import { fragmentsAt, inlineFragments, type Fragment } from "../src/inline.ts";
import { plainText } from "../src/semantics/text.ts";

function brief(text: string, fragments: Fragment[]): unknown[] {
  return fragments.map((fragment) => ({
    type: fragment.type,
    raw: text.slice(fragment.from, fragment.to),
    ...(fragment.content ? { content: text.slice(fragment.content.from, fragment.content.to) } : {}),
    ...(fragment.url ? { url: text.slice(fragment.url.from, fragment.url.to) } : {}),
    ...(fragment.children.length ? { children: brief(text, fragment.children) } : {}),
  }));
}

const parts = (text: string, syntax?: Parameters<typeof inlineFragments>[1]) => brief(text, inlineFragments(text, syntax));

describe("行内片段", () => {
  it("强调、行内代码、删除线、嵌套", () => {
    expect(parts("**bold *em*** `code` ~~del~~")).toEqual([
      { type: "strong", raw: "**bold *em***", content: "bold *em*", children: [{ type: "emphasis", raw: "*em*", content: "em" }] },
      { type: "code", raw: "`code`", content: "code" },
      { type: "strikethrough", raw: "~~del~~", content: "del" },
    ]);
  });

  it("I-1 中日韩文字旁边的强调同 Typora：紧挨着中文也能开、闭；英文词中间的下划线仍不是", () => {
    expect(parts("中文*斜体*紧挨着")).toEqual([{ type: "emphasis", raw: "*斜体*", content: "斜体" }]);
    expect(parts("中_em_文 中__strong__文")).toEqual([
      { type: "emphasis", raw: "_em_", content: "em" },
      { type: "strong", raw: "__strong__", content: "strong" },
    ]);
    // CommonMark 里 `**` 前面是汉字、后面是引号时开不了强调，Typora 可以（本机 1.14.15 实测）
    expect(parts('紧挨着中文标点**"引号"**。')).toEqual([{ type: "strong", raw: '**"引号"**', content: '"引号"' }]);
    expect(parts("snake_case_word a__b__c")).toEqual([]);
  });

  it("I-5 emoji 的 shortcode 可以带 + -（:+1:、:-1:）", () => {
    expect(parts(":+1: :-1: :smile:").map((part) => (part as { raw: string }).raw)).toEqual([":+1:", ":-1:", ":smile:"]);
  });

  it("链接、图片、自动链接、裸网址；链接文字里的片段", () => {
    expect(parts('[a **b**](http://x "T") ![alt](p.png) <https://a.b> www.example.com')).toEqual([
      { type: "link", raw: '[a **b**](http://x "T")', content: "a **b**", url: "http://x", children: [{ type: "strong", raw: "**b**", content: "b" }] },
      { type: "image", raw: "![alt](p.png)", content: "alt", url: "p.png" },
      { type: "autolink", raw: "<https://a.b>", content: "https://a.b", url: "https://a.b" },
      { type: "url", raw: "www.example.com", content: "www.example.com", url: "www.example.com" },
    ]);
    expect(parts("www.example.com", { autolink: false })).toEqual([]);
  });

  it("原子片段：公式、脚注引用、emoji、行内 HTML、实体", () => {
    const text = "$x^2$ [^1] :smile: <kbd>K</kbd> &amp;";
    const fragments = inlineFragments(text);
    expect(fragments.map((fragment) => [fragment.type, fragment.atomic])).toEqual([
      ["math", true],
      ["footnoteReference", true],
      ["emoji", true],
      ["html", true],
      ["html", true],
      ["entity", true],
    ]);
  });

  it("高亮、上标、下标默认关闭（S-8），打开后才是片段", () => {
    expect(parts("==hi== ^sup^ ~sub~")).toEqual([]);
    expect(parts("==hi== ^sup^ ~sub~", { highlight: true, superscript: true, subscript: true }).map((part) => (part as { type: string }).type)).toEqual([
      "highlight",
      "superscript",
      "subscript",
    ]);
  });
});

describe("I-3 行内公式", () => {
  it("$5 and $10 这样的价钱不是公式；$x=\\$5$ 里的 \\$ 是普通字符", () => {
    const text = "Price $5 and $10 or $5 and$10.\nMath $5$ and $x + y$ and escaped dollar $x=\\$5$.";
    expect(inlineFragments(text).filter((fragment) => fragment.type === "math").map((fragment) => text.slice(fragment.from, fragment.to))).toEqual([
      "$5$",
      "$x + y$",
      "$x=\\$5$",
    ]);
  });

  it("\\(…\\) 也是行内公式；\\$ 是转义", () => {
    expect(parts("Inline \\(a+b\\). \\$ not math")).toEqual([
      { type: "math", raw: "\\(a+b\\)", content: "a+b" },
      { type: "escape", raw: "\\$", content: "$" },
    ]);
  });

  it("$ 后面是空白、$$ 不是行内公式；关掉公式时都是普通文字", () => {
    expect(parts("$ x$ $$y$$")).toEqual([]);
    expect(parts("$x$", { math: false })).toEqual([]);
  });

  it("代码里的 $ 不是公式", () => {
    expect(parts("`$x$`")).toEqual([{ type: "code", raw: "`$x$`", content: "$x$" }]);
  });

  it("可以跨软换行，不能跨硬换行", () => {
    expect(parts("$a\nb$")).toEqual([{ type: "math", raw: "$a\nb$", content: "a\nb" }]);
    expect(parts("$a  \nb$").map((part) => (part as { type: string }).type)).not.toContain("math");
  });
});

describe("E-2 光标所在的各层片段", () => {
  it("从外到内；紧挨着边界也算", () => {
    const text = "**a [b](u)**";
    const fragments = inlineFragments(text);
    expect(fragmentsAt(fragments, 5).map((fragment) => fragment.type)).toEqual(["strong", "link"]);
    expect(fragmentsAt(fragments, 0).map((fragment) => fragment.type)).toEqual(["strong"]);
    expect(fragmentsAt(fragments, text.length).map((fragment) => fragment.type)).toEqual(["strong"]);
  });
});

describe("显示文字", () => {
  it("去掉标记，解开转义、实体；行内代码两头的空格各去一个", () => {
    const text = "**a** \\* &lt; `` `x` `` [l](u) ![i](p) <https://h> $m$";
    expect(plainText(text, inlineFragments(text))).toBe("a * < `x` l i https://h m");
    expect(plainText(text, inlineFragments(text), { images: "none" })).toBe("a * < `x` l  https://h m");
  });
});

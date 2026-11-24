// B-2 锚点、W-4 大纲。期望从 tests/markdown.test.ts 的 createOutline 用例迁来；锚点规则按 Typora 1.14.15 的源码
// （resources/appsrc/window/frame.js 的 titleToAnchor、fetchAnchorList），和旧实现不同的三处见各用例的注释
import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.ts";
import { buildSourceMap } from "../src/positions.ts";
import { assignAnchors, collectOutline, headingAnchor } from "../src/semantics/outline.ts";

function outline(source: string) {
  const doc = parse(source);
  return collectOutline(doc, { map: buildSourceMap(doc) });
}

const titles = (source: string) => outline(source).map((item) => item.title);

describe("B-2 锚点：Typora 的 titleToAnchor", () => {
  it("转小写，每个空白、连字符各变成一个 -，不合并", () => {
    expect(headingAnchor("Hello  World")).toBe("hello--world");
    expect(headingAnchor("a-b c")).toBe("a-b-c");
    expect(headingAnchor("  Trim  ")).toBe("trim");
  });

  it("长破折号算三个 -，短破折号算两个", () => {
    expect(headingAnchor("a—b")).toBe("a---b");
    expect(headingAnchor("a–b")).toBe("a--b");
  });

  it("去掉 Unicode 标点和 + =（含下划线、中文标点），保留 $ ^ ` | ~ < > 和 emoji", () => {
    // 空白先变成 -，再去掉 + = !，所以是两个 -
    expect(headingAnchor("C++ = v2!")).toBe("c--v2");
    expect(headingAnchor("snake_case")).toBe("snakecase");
    expect(headingAnchor("你好，世界。")).toBe("你好世界");
    expect(headingAnchor("$x^2$ `code` a|b ~c <d>")).toBe("$x^2$-`code`-a|b-~c-<d>");
    expect(headingAnchor("🎉 发布")).toBe("🎉-发布");
  });

  it("重名的第 n 个加 -n（Typora 从 -2 开始；旧实现是 -1）", () => {
    expect(assignAnchors(["Same", "same", "SAME", "Other"])).toEqual(["same", "same-2", "same-3", "other"]);
  });

  it("和文档里的 <a name> 重名时也编号；叫 write 的改成 write-1；没有文字的标题没有 id", () => {
    expect(assignAnchors(["Intro"], ["intro"])).toEqual(["intro-2"]);
    expect(assignAnchors(["Write", "Write"])).toEqual(["write-1", "write-2"]);
    expect(assignAnchors(["", "***"])).toEqual(["", ""]);
  });
});

describe("W-4 大纲：哪些是标题", () => {
  it("代码块、Front Matter 里的不算", () => {
    expect(titles("---\ntitle: # no\n---\n\n# Real\n\n```md\n# Hidden\n```\n\n## Child")).toEqual(["Real", "Child"]);
  });

  it("列表项里缩进 5 格是缩进代码，不是围栏", () => {
    const source = [
      "-     ~~~md",
      "      # Hidden in indented code",
      "      ~~~",
      "> -     ~~~md",
      ">       ## Hidden in quoted indented code",
      ">       ~~~",
      "# Visible",
    ].join("\n");
    expect(titles(source)).toEqual(["Visible"]);
  });

  it("带 BOM 的 Front Matter", () => {
    expect(titles("\uFEFF---\ntitle: # Hidden\n---\n\n# Real")).toEqual(["Real"]);
  });

  it("缩进代码块、公式块里的不算", () => {
    expect(titles(["    # Hidden", "    Hidden Setext", "    ---", "", "# Visible"].join("\n"))).toEqual(["Visible"]);
    expect(titles(["# Real", "", "$$", "# Hidden", "x = y", "$$", "", "\\[", "## Also Hidden", "\\]", "", "## Child"].join("\n"))).toEqual([
      "Real",
      "Child",
    ]);
  });

  it("HTML 块里的不算（CommonMark 的结束条件）", () => {
    const source = [
      "<div>",
      "# Hidden",
      "</div>",
      "# Still hidden",
      "",
      "# Visible",
      "<script>",
      "# Script hidden",
      "</script>",
      "## After script",
      "<!--",
      "### Comment hidden",
      "-->",
      "### After comment",
    ].join("\n");
    expect(titles(source)).toEqual(["Visible", "After script", "After comment"]);
    expect(titles(["> <section>", "> # Hidden", "> </section>", "> # Still hidden", ">", "> # Quoted visible"].join("\n"))).toEqual([
      "Quoted visible",
    ]);
    expect(titles(["<textarea>", "# Hidden", "", "Hidden Setext", "---", "</textarea>", "# Visible"].join("\n"))).toEqual(["Visible"]);
  });

  it("Setext 标题：多行用空格连起来，行号是第一行", () => {
    const items = outline(["Title *One*", "===", "", "Subtitle [Link](https://example.com)", "---", "", "---", "", "# ATX"].join("\n"));
    expect(items.map((item) => [item.title, item.level, item.line])).toEqual([
      ["Title One", 1, 1],
      ["Subtitle Link", 2, 4],
      ["ATX", 1, 9],
    ]);
    const multiline = outline(["First *line*", "Second [line](https://example.com)", "---", "", "> Quoted first", "> quoted second", "> ==="].join("\n"));
    expect(multiline.map((item) => [item.title, item.level, item.line])).toEqual([
      ["First line Second line", 2, 1],
      ["Quoted first quoted second", 1, 5],
    ]);
  });

  it("引用、列表里的标题也算", () => {
    const quoted = outline(["> # Quoted **Head**", "> text", "> > ## Nested [Link](https://example.com)", "# Plain"].join("\n"));
    expect(quoted.map((item) => [item.title, item.level, item.line])).toEqual([
      ["Quoted Head", 1, 1],
      ["Nested Link", 2, 3],
      ["Plain", 1, 4],
    ]);
    const setext = outline(["> Quoted *Setext*", "> ---", "", "> ```md", "> # Hidden", "> ```", "", "> # Visible"].join("\n"));
    expect(setext.map((item) => [item.title, item.level, item.line])).toEqual([
      ["Quoted Setext", 2, 1],
      ["Visible", 1, 8],
    ]);
    const lists = outline(
      [
        "- # Root",
        "  - ## Nested",
        "1. ### Ordered",
        "",
        "> - #### Quoted list",
        "",
        "```md",
        "- # Hidden",
        "```",
        "-     # Indented code",
      ].join("\n"),
    );
    expect(lists.map((item) => [item.title, item.level, item.line, item.id])).toEqual([
      ["Root", 1, 1, "root"],
      ["Nested", 2, 2, "nested"],
      ["Ordered", 3, 3, "ordered"],
      ["Quoted list", 4, 5, "quoted-list"],
    ]);
  });

  it("〔和旧实现不同〕10 位数字的有序列表符号按 CommonMark 不是列表项，后面的 # 也就不是标题", () => {
    expect(titles("1234567890. # Large ordered")).toEqual([]);
    expect(titles("123456789. # Nine digits")).toEqual(["Nine digits"]);
  });
});

describe("W-4 大纲：标题文字", () => {
  it("去掉引用链接、图片、HTML 的标记，留下显示的文字（图片留替代文字）", () => {
    const source = [
      "# Title [Ref][id] ![Logo][logo] <small>raw</small>",
      "",
      "![Alt](logo.png) [Inline](https://example.com)",
      "---",
      "",
      "[id]: https://example.com",
      "[logo]: logo.png",
    ].join("\n");
    expect(titles(source)).toEqual(["Title Ref Logo raw", "Alt Inline"]);
  });

  it("〔和旧实现不同〕标签没有定义的引用式链接按 CommonMark 是普通文字，方括号留着", () => {
    expect(titles("# Title [Ref][id] ![Logo][logo]")).toEqual(["Title [Ref][id] ![Logo][logo]"]);
  });

  it("复杂的链接写法：链接文字里没有定义的 [v2] 是普通文字，外层照样是链接", () => {
    const items = outline(["# [API [v2]](<https://example.com/a(b)> \"Docs\")", "", "![Logo [dark]][logo-ref]", "---", "", "[logo-ref]: logo.png"].join("\n"));
    expect(items.map((item) => [item.title, item.id])).toEqual([
      ["API [v2]", "api-v2"],
      ["Logo [dark]", "logo-dark"],
    ]);
  });

  it("自动链接留下网址", () => {
    expect(outline("# Visit <https://example.com/docs>").map((item) => [item.title, item.id])).toEqual([
      ["Visit https://example.com/docs", "visit-httpsexamplecomdocs"],
    ]);
    expect(outline(["# Open <obsidian://open?vault=docs>", "## File <file:///C:/docs/a.md>"].join("\n")).map((item) => [item.title, item.id])).toEqual([
      ["Open obsidian://open?vault=docs", "open-obsidianopenvaultdocs"],
      ["File file:///C:/docs/a.md", "file-filecdocsamd"],
    ]);
  });

  it("行内代码去掉反引号标记，两头各去一个空格", () => {
    expect(titles("# ``npm `test` command``")).toEqual(["npm `test` command"]);
    // 〔和旧实现不同〕Typora 的规则保留反引号（它是符号，不是标点），旧实现得到 cmd
    expect(outline("# `` `cmd` ``").map((item) => [item.title, item.id])).toEqual([["`cmd`", "`cmd`"]]);
  });

  it("标点照原样，结尾的 # 序列不算标题文字", () => {
    expect(titles(["# C# Guide = v2", "", "## ==Marked== H~2~O x^2^", "", "# C#", "", "## Title###", "", "### Title ###"].join("\n"))).toEqual([
      "C# Guide = v2",
      "==Marked== H~2~O x^2^",
      "C#",
      "Title###",
      "Title",
    ]);
    // 高亮、上下标打开时去掉标记
    const doc = parse("## ==Marked== H~2~O x^2^", { syntax: { highlight: true, subscript: true, superscript: true } });
    expect(collectOutline(doc, { syntax: { highlight: true, subscript: true, superscript: true } })[0].title).toBe("Marked H2O x2");
  });

  it("反斜杠转义解开", () => {
    expect(outline("# \\*Literal\\* \\[brackets\\] C\\#").map((item) => [item.title, item.id])).toEqual([
      ["*Literal* [brackets] C#", "literal-brackets-c"],
    ]);
  });

  it("实体解码后再算锚点", () => {
    // 〔和旧实现不同〕< > 是数学符号，Typora 保留，旧实现得到 att-api
    expect(outline(["# AT&amp;T &lt;API&gt;", "", "## Escaped \\&amp; literal"].join("\n")).map((item) => [item.title, item.id])).toEqual([
      ["AT&T <API>", "att-<api>"],
      ["Escaped &amp; literal", "escaped-amp-literal"],
    ]);
  });

  it("引用里和正文里同名的标题按文档顺序编号", () => {
    expect(outline("> # Same\n\n# Same").map((item) => item.id)).toEqual(["same", "same-2"]);
  });
});

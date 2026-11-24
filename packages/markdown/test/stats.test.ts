// V-4 字数统计。期望从 tests/stats.test.ts 迁来；和旧实现不同的地方见注释
import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.ts";
import { lineColumn } from "../src/positions.ts";
import { documentStats, markdownStats, textStats } from "../src/semantics/stats.ts";

const stats = (source: string, readingSpeed?: number) => documentStats(parse(source), { readingSpeed });

describe("V-4 词数和字符数", () => {
  it("英文按单词，每个汉字算一个词；字符不算空白", () => {
    expect(textStats("one two\n中文")).toEqual({ words: 4, chars: 8 });
    expect(textStats("e-mail it's C# C++")).toEqual({ words: 4, chars: 15 });
  });

  it("去掉 Markdown 标记再数", () => {
    expect(stats("# 标题\n\n**bold** [link](https://example.com)")).toMatchObject({ paragraphs: 2, words: 4, chars: 10 });
  });

  it("转义的标点按显示出来的字符算", () => {
    expect(stats("\\*literal\\* \\[brackets\\] C\\# C\\+\\+")).toMatchObject({ paragraphs: 1, words: 4, chars: "*literal*[brackets]C#C++".length });
  });

  it("复杂的链接只算文字；图片不算", () => {
    const source = ['[API [v2]](<https://example.com/a(b)> "Docs") and ![Logo [dark]][logo-ref]', "", "[logo-ref]: assets/logo.png"].join("\n");
    // 〔和旧实现不同〕没有定义的 [v2] 按 CommonMark 显示方括号，算字符（旧实现去掉了，可它的大纲又保留，前后不一致）
    expect(stats(source)).toMatchObject({ paragraphs: 1, words: 3, chars: "API[v2]and".length });
  });

  it("引用定义（连同下一行的标题）、缩写定义不算", () => {
    expect(stats(["Read [Docs][docs].", "", "   [docs]: https://example.com/docs", '"Docs title"', "", "    code after definition"].join("\n"))).toMatchObject({
      paragraphs: 2,
      words: 5,
      chars: "ReadDocs.codeafterdefinition".length,
    });
    expect(stats(["Use HTML here.", "", "*[HTML]: Hyper Text Markup Language"].join("\n"))).toMatchObject({ paragraphs: 1, words: 3, chars: "UseHTMLhere.".length });
  });

  it("〔和旧实现不同〕引用里和段落连着写的缩写定义：段落里非开头的行不是定义（同链接引用定义），照常计数", () => {
    // 旧实现按行认定义，这里按块：定义要单独成块或在段落开头
    expect(stats(["> Use HTML here.", ">", "> *[HTML]: Hyper Text Markup Language"].join("\n"))).toMatchObject({ paragraphs: 1, words: 3 });
  });

  it("自动链接留网址；行内 HTML 只算标签之间的文字", () => {
    expect(stats("Open <obsidian://open?vault=docs> and <file:///C:/docs/a.md> but <span>raw</span>.")).toMatchObject({
      words: 13,
      chars: "Openobsidian://open?vault=docsandfile:///C:/docs/a.mdbutraw.".length,
      paragraphs: 1,
    });
  });

  it("代码块的内容算，围栏不算；有空行的代码块、公式块算一段", () => {
    expect(stats(["# <span>Title</span>", "", "Read [docs][d] and <https://example.com>.", "", "[d]: https://example.com/docs", "", "~~~", "hidden words", "~~~"].join("\n"))).toMatchObject({
      words: 9,
      chars: "TitleReaddocsandhttps://example.com.hiddenwords".length,
      paragraphs: 3,
    });
    expect(stats(["# Title", "", "```", "alpha", "", "beta", "```", "", "After"].join("\n"))).toMatchObject({ words: 4, paragraphs: 3 });
    expect(stats(["    alpha", "", "    beta"].join("\n"))).toMatchObject({ words: 2, chars: 9, paragraphs: 1 });
    expect(stats(["$$", "a=b", "", "c=d", "$$"].join("\n"))).toMatchObject({ words: 4, paragraphs: 1 });
    expect(stats("```ts\nalpha beta\n```")).toMatchObject({ words: 2, chars: 9, paragraphs: 1 });
  });

  it("〔和旧实现不同〕公式里的 = 算字符（旧实现去高亮标记时把它也去掉了）", () => {
    expect(stats(["Formula $x+y$ and \\(a+b\\).", "", "$$", "c=d", "$$", "", "\\[", "e=f", "\\]"].join("\n"))).toMatchObject({
      words: 10,
      chars: "Formulax+yanda+b.c=de=f".length,
      paragraphs: 3,
    });
    expect(stats(["$$", "a=b", "", "c=d", "$$"].join("\n")).chars).toBe("a=bc=d".length);
  });

  it("引用里的代码、公式、缩进代码按内容算", () => {
    expect(stats(["> ```ts", "> alpha beta", "> ```"].join("\n"))).toMatchObject({ words: 2, chars: 9, paragraphs: 1 });
    expect(stats(["> $$", "> x+y", "> $$"].join("\n"))).toMatchObject({ words: 2, chars: 3, paragraphs: 1 });
    // 〔和旧实现不同〕代码里的字原样算：not_math 是一个词，下划线算字符（旧实现在代码里也去掉了下划线）
    expect(stats([">     $not_math$", ">", ">     beta"].join("\n"))).toMatchObject({ words: 2, chars: "$not_math$beta".length, paragraphs: 1 });
    expect(stats(["  $$", "  x+y", "  $$", "", "    $not_math$"].join("\n"))).toMatchObject({ words: 3, chars: "x+y$not_math$".length, paragraphs: 2 });
  });

  it("Front Matter 不算，只认开头的；分隔线不算", () => {
    expect(stats("---\ntitle: Draft\n---\n\nalpha beta")).toMatchObject({ words: 2, paragraphs: 1 });
    expect(stats("\uFEFF---\ntitle: Draft\n---\n\nalpha beta")).toMatchObject({ words: 2, paragraphs: 1 });
    expect(stats("alpha\n\n---\n\nbeta\n\n---\n\ngamma")).toMatchObject({ words: 3, paragraphs: 3 });
    expect(stats("---\r\ntitle: Draft\r\n...\r\n\r\nalpha beta")).toMatchObject({ words: 2, paragraphs: 1 });
    for (const source of ["---\n...\n\nalpha", "---  \r\n--- \t\r\n\r\nalpha"]) expect(stats(source)).toMatchObject({ chars: 5, paragraphs: 1 });
  });

  it("带标签的公式围栏和普通的一样", () => {
    expect(stats("$$ {chapter 1}\nx = 1\n$$ {chapter end}\n\nafter")).toEqual(stats("$$\nx = 1\n$$\n\nafter"));
  });

  it("表格只算单元格文字，整个表格算一段", () => {
    expect(stats(["| Name | Age |", "| --- | ---: |", "| Ada | 36 |", "| Bob | 41 |"].join("\n"))).toMatchObject({ words: 6, chars: 17, paragraphs: 1 });
    expect(stats(["> | Name | Age |", "> | --- | ---: |", "> | Ada | 36 |"].join("\n"))).toMatchObject({ words: 4, chars: 12, paragraphs: 1 });
  });

  it("定义列表不算冒号，整个列表算一段", () => {
    expect(stats(["Term **one**", ": Definition with [link](https://example.com)", ": Second `code`", "", ":not a definition marker"].join("\n"))).toMatchObject({
      words: 11,
      chars: "TermoneDefinitionwithlinkSecondcode:notadefinitionmarker".length,
      paragraphs: 2,
    });
    expect(stats(["Term", ": First paragraph", "", "    Second paragraph", "", "Next paragraph"].join("\n"))).toMatchObject({ words: 7, paragraphs: 2 });
    expect(stats(["> Term", "> : Definition", "> : Second item"].join("\n"))).toMatchObject({ words: 4, paragraphs: 1 });
    expect(stats(["> Term", "> : First paragraph", ">", ">     Second paragraph"].join("\n"))).toMatchObject({ words: 5, paragraphs: 1 });
  });

  it("实体解码后再数", () => {
    expect(stats("Tom &amp; Jerry &lt;3&nbsp;times")).toMatchObject({ words: 4, chars: "Tom&Jerry<3times".length });
  });

  it("注释、script、style 块不算", () => {
    const source = ["Visible", "", "<!--", "hidden comment words", "-->", "", "<script>", "hidden script words", "</script>", "# After script", "", "<style>", ".hidden { color: red; }", "</style>", "", "After"].join("\n");
    expect(stats(source)).toMatchObject({ words: 4, chars: "VisibleAfterscriptAfter".length, paragraphs: 3 });
  });
});

describe("V-4 阅读时间、选区、光标位置", () => {
  it("按阅读速度算，至少 1 分钟", () => {
    const source = Array.from({ length: 241 }, () => "word").join(" ");
    expect(stats(source, 120).readingMinutes).toBe(3);
    expect(stats(source, 382).readingMinutes).toBe(1);
    expect(stats("").readingMinutes).toBe(1);
  });

  it("选区：按 Markdown 解析后数，另给行数", () => {
    expect(markdownStats("**bold** [docs](https://example.com) $x+y$")).toMatchObject({ words: 4, chars: "bolddocsx+y".length, lines: 1 });
    expect(markdownStats("two\n中")).toMatchObject({ words: 2, chars: 4, lines: 2 });
  });

  it("光标的行列从 1 开始；三种换行符都算", () => {
    expect(lineColumn("alpha\n中文", 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumn("alpha\n中文", 7)).toEqual({ line: 2, column: 2 });
    expect(lineColumn("alpha\n中文", 99)).toEqual({ line: 2, column: 3 });
    expect(lineColumn("a\r\nb\rc", 5)).toEqual({ line: 3, column: 1 });
  });
});

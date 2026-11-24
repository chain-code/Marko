// B-11 脚注、B-15 链接引用定义、B-16 缩写、B-9 Front Matter 的语义。期望从 tests/markdown.test.ts、
// tests/footnoteSemantics.test.ts、tests/referenceDefinitionSemantics.test.ts 等迁来
import { describe, expect, it } from "vitest";
import { inlineFragments } from "../src/inline.ts";
import { blockChildren, nodeText } from "../src/model.ts";
import { parse } from "../src/parse.ts";
import { collectAbbreviations, findAbbreviations } from "../src/semantics/abbreviations.ts";
import { collectFootnotes, footnoteSummary } from "../src/semantics/footnotes.ts";
import { readFrontMatter } from "../src/semantics/frontMatter.ts";
import { collectReferences, parseReferenceDefinition, referenceChecker, resolveReference } from "../src/semantics/references.ts";

describe("B-11 脚注", () => {
  it("按在文中第一次出现的顺序编号；同一个脚注多处引用时编号相同，回链各一个", () => {
    const doc = parse(["B[^b] A[^a] B again[^b].", "", "[^a]: A note.", "[^b]: B note."].join("\n"));
    const footnotes = collectFootnotes(doc);
    expect(footnotes.references.map((ref) => [ref.label, ref.number, ref.occurrence])).toEqual([
      ["b", 1, 1],
      ["a", 2, 1],
      ["b", 1, 2],
    ]);
    expect(footnotes.ordered.map((definition) => [definition.label, definition.number, definition.references])).toEqual([
      ["b", 1, 2],
      ["a", 2, 1],
    ]);
  });

  it("标签不分大小写、可以有空格和中文；CRLF、引用和列表里的定义都认", () => {
    const source = ["First[^中文 Note] and again[^中文 note].", "", "> - [^中文 nOtE]: Detail **bold**.", ">       Continued line."].join("\r\n");
    const doc = parse(source);
    const footnotes = collectFootnotes(doc);
    expect(footnotes.references.map((ref) => ref.number)).toEqual([1, 1]);
    expect(footnotes.definitions.size).toBe(1);
    expect(footnoteSummary(footnotes.ordered[0].node)).toBe("Detail bold. Continued line.");
  });

  it("带空格的标签和长得像内部前缀的标签各是各的", () => {
    const reserved = "marko-footnote-006d00790020006e006f00740065";
    const doc = parse([`First[^my note] Second[^${reserved}]`, "", "[^my note]: Spaced body", `[^${reserved}]: Reserved body`].join("\n"));
    expect(collectFootnotes(doc).ordered.map((definition) => [definition.number, footnoteSummary(definition.node)])).toEqual([
      [1, "Spaced body"],
      [2, "Reserved body"],
    ]);
  });

  it("代码、HTML 里的不是引用；HTML 块里的不是定义", () => {
    const source = [
      'Visible[^real note] `[^code note]` <span title="[^attr note]">text</span>',
      "",
      "<div>",
      "Block[^html note]",
      "[^html note]: hidden body",
      "</div>",
      "",
      "[^real note]: visible body",
    ].join("\n");
    const footnotes = collectFootnotes(parse(source));
    expect(footnotes.references.map((ref) => ref.label)).toEqual(["real note"]);
    expect([...footnotes.definitions.keys()]).toEqual(["REAL NOTE"]);
  });

  it("没有定义的引用编号为 null（按文字显示）；文档开头就是定义也行", () => {
    expect(collectFootnotes(parse("Missing[^My Missing Note].")).references.map((ref) => [ref.label, ref.number])).toEqual([["My Missing Note", null]]);
    const doc = parse("[^1]: detail\n\nText with note[^1].");
    expect(collectFootnotes(doc).references[0].number).toBe(1);
  });

  it("摘要：多段内容用空格连起来，去掉引用标记和续行缩进", () => {
    const doc = parse(["Text[^n].", "", "[^n]: First line", "    > quoted **bold**", "", "    Second paragraph."].join("\n"));
    expect(footnoteSummary(collectFootnotes(doc).ordered[0].node)).toBe("First line quoted bold Second paragraph.");
    const quoted = parse(["Text[^q].", "", "[^q]: Lead", "", "    > Nested quote", "    > continued"].join("\n"));
    expect(footnoteSummary(collectFootnotes(quoted).ordered[0].node)).toBe("Lead Nested quote continued");
  });

  it("S-8 关掉脚注时没有引用", () => {
    expect(collectFootnotes(parse("Text[^1].\n\n[^1]: x", { syntax: { footnotes: false } }), { footnotes: false }).references).toEqual([]);
  });
});

describe("B-15 链接引用定义", () => {
  it("读出标签、地址、标题；尖括号地址、转义、实体", () => {
    expect(parseReferenceDefinition('[Foo]: /url "title"')).toEqual({ label: "Foo", url: "/url", title: "title" });
    expect(parseReferenceDefinition("[x]: <https://example.com/with space> 'single quotes'")).toEqual({
      label: "x",
      url: "https://example.com/with space",
      title: "single quotes",
    });
    expect(parseReferenceDefinition("[y]: /a\\_b (paren &amp; title)")).toEqual({ label: "y", url: "/a_b", title: "paren & title" });
    expect(parseReferenceDefinition("not a definition")).toBeNull();
  });

  it("整篇范围内解析：定义在后面、缩进 1～3 格、在引用和列表里都行；同名的只认第一个；标签不分大小写", () => {
    const source = [
      "Read [Docs][docs], [Quoted], [Listed][] and [missing].",
      "",
      "   [docs]: https://example.com/docs",
      "\"Docs title\"",
      "",
      "> [quoted]: /quoted",
      "",
      "- [LISTED]: /listed",
      "",
      "[DOCS]: /ignored",
    ].join("\n");
    const doc = parse(source);
    const references = collectReferences(doc);
    expect([...references.values()].map((definition) => [definition.label, definition.url, definition.title])).toEqual([
      ["docs", "https://example.com/docs", "Docs title"],
      ["quoted", "/quoted", null],
      ["LISTED", "/listed", null],
    ]);
    const paragraph = blockChildren(doc)[0];
    const text = nodeText(paragraph);
    const links = inlineFragments(text, undefined, referenceChecker(references)).filter((fragment) => fragment.type === "link");
    expect(links.map((link) => resolveReference(text, link, references)?.url)).toEqual(["https://example.com/docs", "/quoted", "/listed"]);
  });

  it("代码块、HTML 块里的不是定义", () => {
    const references = collectReferences(parse("<div>\n[x]: /in-html\n</div>\n\n```\n[y]: /in-code\n```\n\n[z]: /real"));
    expect([...references.keys()]).toEqual(["Z"]);
  });
});

describe("B-16 缩写", () => {
  it("整词出现的地方，在引用里定义也行；代码、网址、链接地址里不标", () => {
    const doc = parse(["Use HTML and `HTML` in [HTML docs](https://example.com/HTML) or https://HTML.example.com, not XHTML.", "", "> *[HTML]: Hyper Text Markup Language"].join("\n"));
    const abbreviations = collectAbbreviations(doc);
    expect([...abbreviations.values()].map((definition) => [definition.label, definition.title])).toEqual([["HTML", "Hyper Text Markup Language"]]);
    const text = nodeText(blockChildren(doc)[0]);
    const matches = findAbbreviations(text, inlineFragments(text), abbreviations);
    // 第二个在链接文字里（链接文字照常标）
    expect(matches.map((match) => text.slice(match.from, match.to) + "@" + match.from)).toEqual(["HTML@4", "HTML@24"]);
  });

  it("同名的只认第一个；代码块里的定义不算", () => {
    const abbreviations = collectAbbreviations(parse("*[A]: First\n*[A]: Second\n\n```\n*[B]: Code\n```"));
    expect([...abbreviations.values()].map((definition) => definition.title)).toEqual(["First"]);
  });
});

describe("B-9 Front Matter 的内容", () => {
  it("读出 typora-root-url；YAML 写错时给出错误", () => {
    expect(readFrontMatter(parse("---\ntypora-root-url: ../assets\ntitle: x\n---\n\nbody"))).toMatchObject({ rootUrl: "../assets", error: null });
    expect(readFrontMatter(parse("---\ntitle: [unclosed\n---\n"))?.error).toBeTruthy();
    expect(readFrontMatter(parse("no front matter"))).toBeNull();
  });
});

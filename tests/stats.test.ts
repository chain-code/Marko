import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCursorPosition,
  calculateDocumentStats,
  calculateSelectionStats,
  formatWordCountDetails,
} from "../src/utils/stats";

test("calculateCursorPosition reports one-based line and column", () => {
  assert.deepEqual(calculateCursorPosition("alpha\n中文", 0), { line: 1, column: 1 });
  assert.deepEqual(calculateCursorPosition("alpha\n中文", 7), { line: 2, column: 2 });
  assert.deepEqual(calculateCursorPosition("alpha\n中文", 99), { line: 2, column: 3 });
});

test("calculateSelectionStats keeps selection counts and document cursor position", () => {
  const source = "one two\n中文";
  const stats = calculateSelectionStats("two\n中", source, source.length);

  assert.equal(stats.words, 2);
  assert.equal(stats.chars, 4);
  assert.equal(stats.lines, 2);
  assert.equal(stats.selectedText, "two\n中");
  assert.equal(stats.selectionStart, source.length - "two\n中".length);
  assert.equal(stats.selectionEnd, source.length);
  assert.equal(stats.cursorLine, 2);
  assert.equal(stats.cursorColumn, 3);
});

test("calculateSelectionStats strips markdown wrappers before counting", () => {
  const selected = "**bold** [docs](https://example.com) $x+y$";
  const stats = calculateSelectionStats(selected, selected, selected.length);

  assert.equal(stats.words, 4);
  assert.equal(stats.chars, "bolddocsx+y".length);
  assert.equal(stats.lines, 1);
});

test("formatWordCountDetails returns Typora-style document and selection rows", () => {
  const details = formatWordCountDetails(
    { words: 1234, chars: 4321, paragraphs: 12, readingMinutes: 4 },
    {
      selectedText: "alpha\nbeta",
      selectionStart: 0,
      selectionEnd: 10,
      chars: 9,
      words: 2,
      lines: 2,
      cursorLine: 8,
      cursorColumn: 6,
    },
  );

  assert.deepEqual(details.document, [
    { label: "词数", value: "1,234", unit: "词" },
    { label: "字符", value: "4,321", unit: "字符" },
    { label: "段落", value: "12", unit: "段" },
    { label: "阅读时间", value: "4", unit: "分钟" },
  ]);
  assert.deepEqual(details.selection, [
    { label: "选区词数", value: "2", unit: "词" },
    { label: "选区字符", value: "9", unit: "字符" },
    { label: "选区行数", value: "2", unit: "行" },
  ]);
  assert.deepEqual(details.position, [
    { label: "光标行", value: "8", unit: "行" },
    { label: "光标列", value: "6", unit: "列" },
  ]);
});

test("calculateDocumentStats strips markdown wrappers before counting", () => {
  const stats = calculateDocumentStats("# 标题\n\n**bold** [link](https://example.com)");

  assert.equal(stats.paragraphs, 2);
  assert.equal(stats.words, 4);
  assert.equal(stats.chars, 10);
});

test("calculateDocumentStats uses the configured reading speed", () => {
  const source = Array.from({ length: 241 }, () => "word").join(" ");
  assert.equal(calculateDocumentStats(source, 120).readingMinutes, 3);
  assert.equal(calculateDocumentStats(source, 382).readingMinutes, 1);
});

test("calculateDocumentStats counts escaped markdown punctuation as visible text like Typora", () => {
  const source = "\\*literal\\* \\[brackets\\] C\\# C\\+\\+";
  const stats = calculateDocumentStats(source);
  const selection = calculateSelectionStats(source, source, source.length);
  const visible = "*literal*[brackets]C#C++";

  assert.equal(stats.paragraphs, 1);
  assert.equal(stats.words, 4);
  assert.equal(stats.chars, visible.length);
  assert.equal(selection.words, 4);
  assert.equal(selection.chars, visible.length);
});

test("calculateDocumentStats strips complex link syntax like Typora", () => {
  const stats = calculateDocumentStats([
    "[API [v2]](<https://example.com/a(b)> \"Docs\") and ![Logo [dark]][logo-ref]",
    "",
    "[logo-ref]: assets/logo.png",
  ].join("\n"));

  assert.equal(stats.paragraphs, 1);
  assert.equal(stats.words, 3);
  assert.equal(stats.chars, "APIv2and".length);
});

test("calculateDocumentStats strips reference definition titles like Typora", () => {
  const stats = calculateDocumentStats([
    "Read [Docs][docs].",
    "",
    "   [docs]: https://example.com/docs",
    "\"Docs title\"",
    "",
    "    code after definition",
  ].join("\n"));

  assert.equal(stats.paragraphs, 2);
  assert.equal(stats.words, 5);
  assert.equal(stats.chars, "ReadDocs.codeafterdefinition".length);
});

test("calculateDocumentStats strips abbreviation definitions like Typora", () => {
  const stats = calculateDocumentStats([
    "Use HTML here.",
    "",
    "*[HTML]: Hyper Text Markup Language",
  ].join("\n"));

  assert.equal(stats.paragraphs, 1);
  assert.equal(stats.words, 3);
  assert.equal(stats.chars, "UseHTMLhere.".length);
});

test("calculateDocumentStats strips quoted abbreviation definitions like Typora", () => {
  const stats = calculateDocumentStats([
    "> Use HTML here.",
    "> *[HTML]: Hyper Text Markup Language",
  ].join("\n"));

  assert.equal(stats.paragraphs, 1);
  assert.equal(stats.words, 3);
  assert.equal(stats.chars, "UseHTMLhere.".length);
});

test("calculateDocumentStats keeps custom and local autolink text like Typora", () => {
  const stats = calculateDocumentStats(
    "Open <obsidian://open?vault=docs> and <file:///C:/docs/a.md> but <span>raw</span>.",
  );

  assert.equal(stats.words, 13);
  assert.equal(stats.chars, "Openobsidian://open?vault=docsandfile:///C:/docs/a.mdbutraw.".length);
  assert.equal(stats.paragraphs, 1);
});

test("calculateDocumentStats strips hidden markdown syntax while counting fenced code text", () => {
  const stats = calculateDocumentStats([
    "# <span>Title</span>",
    "",
    "Read [docs][d] and <https://example.com>.",
    "",
    "[d]: https://example.com/docs",
    "",
    "~~~",
    "hidden words",
    "~~~",
  ].join("\n"));

  assert.equal(stats.words, 9);
  assert.equal(stats.chars, "TitleReaddocsandhttps://example.com.hiddenwords".length);
  assert.equal(stats.paragraphs, 3);
});

test("calculateDocumentStats strips math delimiters before counting", () => {
  const stats = calculateDocumentStats([
    "Formula $x+y$ and \\(a+b\\).",
    "",
    "$$",
    "c=d",
    "$$",
    "",
    "\\[",
    "e=f",
    "\\]",
  ].join("\n"));

  assert.equal(stats.words, 10);
  assert.equal(stats.chars, "Formulax+yanda+b.cdef".length);
  assert.equal(stats.paragraphs, 3);
});

test("calculateDocumentStats handles lightly indented math and indented code like rendered text", () => {
  const stats = calculateDocumentStats([
    "  $$",
    "  x+y",
    "  $$",
    "",
    "    $not_math$",
  ].join("\n"));

  assert.equal(stats.words, 4);
  assert.equal(stats.chars, "x+y$notmath$".length);
  assert.equal(stats.paragraphs, 2);
});

test("calculateDocumentStats counts quoted indented code like rendered code", () => {
  const stats = calculateDocumentStats([
    ">     $not_math$",
    ">",
    ">     beta",
  ].join("\n"));

  assert.equal(stats.words, 3);
  assert.equal(stats.chars, "$notmath$beta".length);
  assert.equal(stats.paragraphs, 1);
});

test("calculateDocumentStats only strips yaml front matter at the document start", () => {
  const withFrontMatter = calculateDocumentStats("---\ntitle: Draft\n---\n\nalpha beta");
  assert.equal(withFrontMatter.words, 2);
  assert.equal(withFrontMatter.paragraphs, 1);

  const withBomFrontMatter = calculateDocumentStats("\uFEFF---\ntitle: Draft\n---\n\nalpha beta");
  assert.equal(withBomFrontMatter.words, 2);
  assert.equal(withBomFrontMatter.paragraphs, 1);

  const withRules = calculateDocumentStats("alpha\n\n---\n\nbeta\n\n---\n\ngamma");
  assert.equal(withRules.words, 3);
  assert.equal(withRules.paragraphs, 3);
});

test("calculateDocumentStats supports YAML explicit end and tagged math fences", () => {
  const explicit = calculateDocumentStats("---\r\ntitle: Draft\r\n...\r\n\r\nalpha beta");
  assert.equal(explicit.words, 2);
  assert.equal(explicit.paragraphs, 1);

  const bare = calculateDocumentStats("$$\nx = 1\n$$\n\nafter");
  const tagged = calculateDocumentStats("$$ {chapter 1}\nx = 1\n$$ {chapter end}\n\nafter");
  assert.deepEqual(tagged, bare);
});

test("calculateDocumentStats strips empty and whitespace-delimited front matter", () => {
  for (const source of ["---\n...\n\nalpha", "---  \r\n--- \t\r\n\r\nalpha"]) {
    const stats = calculateDocumentStats(source);
    assert.equal(stats.chars, 5);
    assert.equal(stats.paragraphs, 1);
  }
});

test("calculateDocumentStats counts fenced code contents without fence markers", () => {
  const stats = calculateDocumentStats([
    "```ts",
    "alpha beta",
    "```",
  ].join("\n"));

  assert.equal(stats.words, 2);
  assert.equal(stats.chars, "alphabeta".length);
  assert.equal(stats.paragraphs, 1);
});

test("calculateDocumentStats keeps raw blocks with internal blank lines as one rendered block", () => {
  const fenced = calculateDocumentStats([
    "# Title",
    "",
    "```",
    "alpha",
    "",
    "beta",
    "```",
    "",
    "After",
  ].join("\n"));

  assert.equal(fenced.words, 4);
  assert.equal(fenced.chars, "TitlealphabetaAfter".length);
  assert.equal(fenced.paragraphs, 3);

  const indented = calculateDocumentStats([
    "    alpha",
    "",
    "    beta",
  ].join("\n"));

  assert.equal(indented.words, 2);
  assert.equal(indented.chars, "alphabeta".length);
  assert.equal(indented.paragraphs, 1);

  const math = calculateDocumentStats([
    "$$",
    "a=b",
    "",
    "c=d",
    "$$",
  ].join("\n"));

  assert.equal(math.words, 4);
  assert.equal(math.chars, "abcd".length);
  assert.equal(math.paragraphs, 1);
});

test("calculateDocumentStats counts quoted raw fence contents like Typora", () => {
  const code = calculateDocumentStats([
    "> ```ts",
    "> alpha beta",
    "> ```",
  ].join("\n"));

  assert.equal(code.words, 2);
  assert.equal(code.chars, "alphabeta".length);
  assert.equal(code.paragraphs, 1);

  const math = calculateDocumentStats([
    "> $$",
    "> x+y",
    "> $$",
  ].join("\n"));

  assert.equal(math.words, 2);
  assert.equal(math.chars, "x+y".length);
  assert.equal(math.paragraphs, 1);
});

test("calculateDocumentStats counts rendered table cells without separators", () => {
  const stats = calculateDocumentStats([
    "| Name | Age |",
    "| --- | ---: |",
    "| Ada | 36 |",
    "| Bob | 41 |",
  ].join("\n"));

  assert.equal(stats.words, 6);
  assert.equal(stats.chars, "NameAgeAda36Bob41".length);
  assert.equal(stats.paragraphs, 1);

  const quoted = calculateDocumentStats([
    "> | Name | Age |",
    "> | --- | ---: |",
    "> | Ada | 36 |",
  ].join("\n"));

  assert.equal(quoted.words, 4);
  assert.equal(quoted.chars, "NameAgeAda36".length);
  assert.equal(quoted.paragraphs, 1);
});

test("calculateDocumentStats counts definition lists without marker colons like Typora", () => {
  const stats = calculateDocumentStats([
    "Term **one**",
    ": Definition with [link](https://example.com)",
    ": Second `code`",
    "",
    ":not a definition marker",
  ].join("\n"));

  assert.equal(stats.words, 11);
  assert.equal(stats.chars, "TermoneDefinitionwithlinkSecondcode:notadefinitionmarker".length);
  assert.equal(stats.paragraphs, 2);
});

test("calculateDocumentStats keeps loose definition lists as one rendered block like Typora", () => {
  const stats = calculateDocumentStats([
    "Term",
    ": First paragraph",
    "",
    "    Second paragraph",
    "",
    "Next paragraph",
  ].join("\n"));

  assert.equal(stats.words, 7);
  assert.equal(stats.chars, "TermFirstparagraphSecondparagraphNextparagraph".length);
  assert.equal(stats.paragraphs, 2);
});

test("calculateDocumentStats counts quoted definition lists without marker colons like Typora", () => {
  const stats = calculateDocumentStats([
    "> Term",
    "> : Definition",
    "> : Second item",
  ].join("\n"));

  assert.equal(stats.words, 4);
  assert.equal(stats.chars, "TermDefinitionSeconditem".length);
  assert.equal(stats.paragraphs, 1);
});

test("calculateDocumentStats counts quoted loose definition lists like Typora", () => {
  const stats = calculateDocumentStats([
    "> Term",
    "> : First paragraph",
    ">",
    ">     Second paragraph",
  ].join("\n"));

  assert.equal(stats.words, 5);
  assert.equal(stats.chars, "TermFirstparagraphSecondparagraph".length);
  assert.equal(stats.paragraphs, 1);
});

test("calculateDocumentStats decodes html entities like rendered text", () => {
  const stats = calculateDocumentStats("Tom &amp; Jerry &lt;3&nbsp;times");

  assert.equal(stats.words, 4);
  assert.equal(stats.chars, "Tom&Jerry<3times".length);
});

test("calculateDocumentStats ignores hidden raw HTML blocks like Typora", () => {
  const stats = calculateDocumentStats([
    "Visible",
    "",
    "<!--",
    "hidden comment words",
    "-->",
    "",
    "<script>",
    "hidden script words",
    "</script>",
    "# After script",
    "",
    "<style>",
    ".hidden { color: red; }",
    "</style>",
    "",
    "After",
  ].join("\n"));

  assert.equal(stats.words, 4);
  assert.equal(stats.chars, "VisibleAfterscriptAfter".length);
  assert.equal(stats.paragraphs, 3);
});

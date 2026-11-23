import test from "node:test";
import assert from "node:assert/strict";
import {
  applyContextualMarkdownTab,
  detectBlockType,
  indentSelection,
  isMarkdownHorizontalRuleLine,
  renumberOrderedListBlockAtLine,
  splitMarkdownBlocks,
} from "../src/utils/editorBlocks";

test("splitMarkdownBlocks recognizes Setext headings as heading blocks", () => {
  const blocks = splitMarkdownBlocks("Title\n---\n\nParagraph");

  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].type, "paragraph");
});

test("splitMarkdownBlocks 将无空行相邻的 ATX 标题拆成独立块", () => {
  const source = "Before\r\n## Heading\r\nAfter";
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "heading", "paragraph"]);
  assert.deepEqual(blocks.map((block) => block.raw), ["Before\r\n", "## Heading\r\n", "After"]);
  for (const block of blocks) {
    assert.equal(source.slice(block.start, block.end), block.raw);
  }

  assert.deepEqual(
    splitMarkdownBlocks(String.fromCharCode(9) + "# Hidden\n# Visible").map((block) => block.type),
    ["code", "heading"],
  );
});

test("Setext underlines require at least two marker characters", () => {
  for (const underline of ["==", "--", "====", "----"]) {
    assert.equal(detectBlockType("Title\n" + underline), "heading", underline);
  }

  for (const underline of ["=", "-"]) {
    const source = "Title\n" + underline + "\nBody";
    assert.equal(detectBlockType("Title\n" + underline), "paragraph", underline);
    assert.deepEqual(splitMarkdownBlocks(source).map((block) => block.type), ["paragraph"], underline);
  }
});

test("table separator cells accept one or more hyphens", () => {
  const source = "| A | B |\n| - | :-: |\n| 1 | 2 |";
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["table"]);
  assert.equal(detectBlockType(source), "table");
});

test("splitMarkdownBlocks 将每种独立目录标记拆成 TOC 块", () => {
  const source = [
    "Before",
    "{:toc}",
    "[[_TOC_]]",
    "{: toc depth=3 }",
    "After",
  ].join("\n");
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), [
    "paragraph",
    "toc",
    "toc",
    "toc",
    "paragraph",
  ]);
  assert.deepEqual(blocks.slice(1, 4).map((block) => block.raw), [
    "{:toc}\n",
    "[[_TOC_]]\n",
    "{: toc depth=3 }\n",
  ]);
  assert.equal(detectBlockType("  {: toc min-level=2 }\r\n"), "toc");
  assert.equal(detectBlockType("    {:toc}"), "code");
});

test("splitMarkdownBlocks keeps multiline Setext text in one heading block", () => {
  const source = "First line\nSecond line\n---\n\nParagraph";
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph"]);
  assert.equal(blocks[0]?.raw, "First line\nSecond line\n---\n");
  assert.equal(detectBlockType("First line\nSecond line\n---\n"), "heading");
});

test("splitMarkdownBlocks preserves CRLF offsets for multiline Setext headings", () => {
  const source = "Intro\r\n\r\nFirst line\r\nSecond line\r\n===\r\nAfter";
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "heading", "paragraph"]);
  assert.equal(blocks[1]?.raw, "First line\r\nSecond line\r\n===\r\n");
  assert.equal(source.slice(blocks[1]?.start, blocks[1]?.end), blocks[1]?.raw);
  assert.equal(detectBlockType("First line\r\nSecond line\r\n===\r\n"), "heading");
  assert.equal(detectBlockType("First line\r\nSecond line\r\n    ==="), "paragraph");
});

test("horizontal rules accept CommonMark marker spacing and one to three leading spaces", () => {
  const markers = [
    "---",
    "----",
    "***",
    "* * *",
    "___",
    "_ _ _",
    " ---",
    "  * * *",
    "   _ _ _   ",
  ];

  for (const marker of markers) {
    assert.equal(isMarkdownHorizontalRuleLine(marker), true, marker);
    assert.equal(detectBlockType(marker + "\n"), "rule", marker);

    const source = marker + "\nAfter";
    const blocks = splitMarkdownBlocks(source);
    assert.deepEqual(blocks.map((block) => block.type), ["rule", "paragraph"], marker);
    assert.equal(source.slice(blocks[0].start, blocks[0].end), marker + "\n", marker);
  }

  for (const marker of ["--", "**", "__", "++", "+++", "+ + +", "- * -", "    ---", "\t***", "---x"]) {
    assert.equal(isMarkdownHorizontalRuleLine(marker), false, marker);
  }

  assert.equal(detectBlockType("+++\n"), "paragraph");
  assert.equal(detectBlockType("+ + +\n"), "list");
});

test("hyphen Setext underlines keep precedence over horizontal rules", () => {
  for (const underline of ["---", "----", "   ----"]) {
    const blocks = splitMarkdownBlocks("Title\n" + underline + "\nAfter");
    assert.deepEqual(blocks.map((block) => block.type), ["heading", "paragraph"], underline);
    assert.equal(blocks[0].raw, "Title\n" + underline + "\n", underline);
  }

  const spaced = splitMarkdownBlocks("Title\n- - -\nAfter");
  assert.deepEqual(spaced.map((block) => block.type), ["paragraph", "rule", "paragraph"]);
});

test("a thematic break takes precedence over a matching list marker", () => {
  const blocks = splitMarkdownBlocks("- item\n* * *\nAfter");

  assert.deepEqual(blocks.map((block) => block.type), ["list", "rule", "paragraph"]);
  assert.equal(blocks[0].raw, "- item\n");
  assert.equal(blocks[1].raw, "* * *\n");
});

test("splitMarkdownBlocks recognizes tables without outer pipes like Typora", () => {
  const blocks = splitMarkdownBlocks("Name | Age\n--- | ---\nAda | 36\n\nParagraph");

  assert.equal(blocks[0].type, "table");
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(detectBlockType("Name | Age\n--- | ---"), "table");
  assert.equal(detectBlockType("Name \\| Age\n--- | ---"), "paragraph");
});

test("splitMarkdownBlocks recognizes a valid single-column table", () => {
  const blocks = splitMarkdownBlocks("| H |\n| --- |\n| x |");

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.type, "table");
});

test("splitMarkdownBlocks separates tables directly following paragraphs like Typora", () => {
  const source = "Before\n| Name | Status |\n| --- | --- |\n| Ada | Ready |\nAfter";
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "table", "paragraph"]);
  assert.equal(blocks[0].raw, "Before\n");
  assert.equal(blocks[1].raw, "| Name | Status |\n| --- | --- |\n| Ada | Ready |\n");
  assert.equal(blocks[2].raw, "After");
});

test("splitMarkdownBlocks recognizes ordered task list items", () => {
  const blocks = splitMarkdownBlocks("1. [ ] first\n2. [x] done\n\nParagraph");

  assert.equal(blocks[0].type, "task");
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(detectBlockType("1. [x] done"), "task");
});

test("splitMarkdownBlocks keeps loose Markdown lists together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "- First",
    "",
    "  Continued paragraph",
    "",
    "- Second",
    "  1. Nested",
    "",
    "     Nested continuation",
    "",
    "After",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["list", "paragraph"]);
  assert.equal(
    blocks[0].raw,
    "- First\n\n  Continued paragraph\n\n- Second\n  1. Nested\n\n     Nested continuation\n",
  );
  assert.equal(blocks[1].raw, "After");
});

test("splitMarkdownBlocks keeps GFM lazy list continuation in one block", () => {
  const source = "- item\ncontinued\nmore\n\nParagraph";
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["list", "paragraph"]);
  assert.equal(blocks[0]?.raw, "- item\ncontinued\nmore\n");
});

test("splitMarkdownBlocks accepts arbitrary-length ordered list markers like Typora", () => {
  assert.equal(detectBlockType("123456789. valid"), "list");
  assert.equal(detectBlockType("1234567890. list"), "list");
  assert.equal(detectBlockType("123456789. [ ] valid task"), "task");
  assert.equal(detectBlockType("1234567890. [ ] task"), "task");
});

test("splitMarkdownBlocks keeps quote-lazy list continuation in one block", () => {
  const source = "> - item\ncontinued\nmore\n\nParagraph";
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["quote", "paragraph"]);
  assert.equal(blocks[0]?.raw, "> - item\ncontinued\nmore\n");
});

test("splitMarkdownBlocks stops lazy lists before interrupting blocks", () => {
  const interruptingBlocks = [
    "# Heading",
    "> quote",
    "```js\ncode\n```",
    "---",
    "| A | B |\n| --- | --- |\n| 1 | 2 |",
    "<section>HTML</section>",
  ];

  for (const interrupting of interruptingBlocks) {
    const source = `- item\n${interrupting}`;
    const blocks = splitMarkdownBlocks(source);
    assert.equal(blocks[0]?.raw.trimEnd(), "- item", interrupting);
    assert.ok(blocks.length > 1, interrupting);
  }
});

test("splitMarkdownBlocks preserves CRLF offsets for lazy list continuation", () => {
  const source = "Intro\r\n\r\n- item\r\ncontinued\r\n\r\nAfter";
  const blocks = splitMarkdownBlocks(source);

  assert.equal(blocks[1]?.raw, "- item\r\ncontinued\r\n");
  assert.equal(source.slice(blocks[1]?.start, blocks[1]?.end), blocks[1]?.raw);
});

test("splitMarkdownBlocks keeps quoted loose Markdown lists together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "> - First",
    ">",
    ">   Continued paragraph",
    "> - Second",
    "",
    "After",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["quote", "paragraph"]);
  assert.equal(blocks[0].raw, "> - First\n>\n>   Continued paragraph\n> - Second\n");
});

test("splitMarkdownBlocks does not treat detached indented text as a list", () => {
  const blocks = splitMarkdownBlocks([
    "Paragraph",
    "",
    "  detached text",
    "",
    "- List",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "paragraph", "list"]);
  assert.equal(blocks[1].raw, "  detached text\n");
});

test("splitMarkdownBlocks recognizes definition lists like Typora", () => {
  const blocks = splitMarkdownBlocks("Term\n: Definition\n: Second\n\n:not a definition");

  assert.equal(blocks[0].type, "definition");
  assert.equal(blocks[0].raw, "Term\n: Definition\n: Second\n");
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(detectBlockType("Term\n: Definition"), "definition");
  assert.equal(detectBlockType("Term\n:not a definition"), "paragraph");
});

test("splitMarkdownBlocks keeps loose definition list items together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "Term",
    ": First paragraph",
    "",
    "    Second paragraph",
    "",
    "Next paragraph",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["definition", "paragraph"]);
  assert.equal(blocks[0].raw, "Term\n: First paragraph\n\n    Second paragraph\n");
  assert.equal(blocks[1].raw, "Next paragraph");
});

test("splitMarkdownBlocks keeps quoted loose definition lists together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "> Term",
    "> : First paragraph",
    ">",
    ">     Second paragraph",
    "",
    "After",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["definition", "paragraph"]);
  assert.equal(blocks[0].raw, "> Term\n> : First paragraph\n>\n>     Second paragraph\n");
});

test("splitMarkdownBlocks recognizes abbreviation definitions like Typora", () => {
  const blocks = splitMarkdownBlocks("Use HTML\n\n*[HTML]: Hyper Text Markup Language");

  assert.equal(blocks[0].type, "paragraph");
  assert.equal(blocks[1].type, "abbreviation");
  assert.equal(detectBlockType("*[HTML]: Hyper Text Markup Language"), "abbreviation");
});

test("splitMarkdownBlocks treats code and math fences as standalone blocks without blank lines", () => {
  const blocks = splitMarkdownBlocks([
    "Intro",
    "```ts",
    "const x = 1;",
    "```",
    "$$",
    "x+y",
    "$$",
    "\\[",
    "a=b",
    "\\]",
    "# Next",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "code", "math", "math", "heading"]);
  assert.equal(blocks[1].raw, "```ts\nconst x = 1;\n```\n");
  assert.equal(blocks[2].raw, "$$\nx+y\n$$\n");
  assert.equal(blocks[3].raw, "\\[\na=b\n\\]\n");
  assert.equal(detectBlockType("$$\nx+y\n$$"), "math");
  assert.equal(detectBlockType("\\[\na=b\n\\]"), "math");
});

test("splitMarkdownBlocks recognizes Typora tagged dollar math openings", () => {
  const source = "Before\n$$ {chapter 1}\nx+y\n$$ {chapter end}\nAfter";
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "math", "paragraph"]);
  assert.equal(blocks[1].raw, "$$ {chapter 1}\nx+y\n$$ {chapter end}\n");
  for (const tag of ["{ }", "{{nested}}", "{a}{b}"]) {
    assert.equal(detectBlockType(`$$ ${tag}\nx+y\n$$`), "math", tag);
  }
});

test("tagged dollar math keeps invalid Typora fence forms as paragraphs", () => {
  for (const opening of ["$$ {}", "$$ {tag", "$$ {tag} ", "$$ {tag} trailing", "$$ tag"]) {
    assert.equal(detectBlockType(`${opening}\nx+y\n$$`), "paragraph", opening);
  }
});

test("splitMarkdownBlocks treats closed GitLab math fences as math blocks", () => {
  const source = [
    "Before",
    "```math",
    "x^2 + y^2",
    "```",
    "After",
  ].join("\n");
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "math", "paragraph"]);
  assert.equal(detectBlockType("```math\nx\n```"), "math");
  assert.equal(detectBlockType("```mathematica\nx\n```"), "code");
  assert.equal(detectBlockType("```math\nx"), "code");
});

test("splitMarkdownBlocks treats indented code as code blocks", () => {
  const blocks = splitMarkdownBlocks([
    "    # Hidden",
    "    Hidden Setext",
    "    ---",
    "",
    "# Visible",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["code", "heading"]);
  assert.equal(detectBlockType("    # Hidden\n    ---"), "code");
});

test("splitMarkdownBlocks does not let indented code interrupt a paragraph", () => {
  for (const indent of ["    ", "\t"]) {
    const source = `paragraph\n${indent}code\nnext`;
    const blocks = splitMarkdownBlocks(source);

    assert.deepEqual(blocks.map((block) => block.type), ["paragraph"], indent);
    assert.equal(blocks[0].raw, source, indent);
  }

  assert.deepEqual(
    splitMarkdownBlocks("paragraph\n\n    code").map((block) => block.type),
    ["paragraph", "code"],
  );
});

test("splitMarkdownBlocks prioritizes indented code over table-shaped lines", () => {
  for (const indent of ["    ", "\t"]) {
    const source = `${indent}| A | B |\n${indent}| --- | --- |`;
    const blocks = splitMarkdownBlocks(source);

    assert.deepEqual(blocks.map((block) => block.type), ["code"], indent);
    assert.equal(blocks[0].raw, source, indent);
  }
});

test("splitMarkdownBlocks keeps blank lines inside indented code blocks like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "    alpha",
    "",
    "    beta",
    "",
    "# Visible",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["code", "heading"]);
  assert.equal(blocks[0].raw, "    alpha\n\n    beta\n");
});

test("splitMarkdownBlocks keeps fence-like markers inside raw fences", () => {
  const blocks = splitMarkdownBlocks("```md\n$$\n# Hidden\n```\n# Visible");

  assert.deepEqual(blocks.map((block) => block.type), ["code", "heading"]);
  assert.equal(blocks[0].raw, "```md\n$$\n# Hidden\n```\n");
});

test("splitMarkdownBlocks rejects backtick fence info containing a backtick", () => {
  const fence = "`".repeat(3);
  const invalidOpening = `${fence}type\`script`;
  const closedSource = `${invalidOpening}\ncode\n${fence}`;

  assert.deepEqual(
    splitMarkdownBlocks(closedSource).map((block) => block.type),
    ["paragraph", "code"],
  );
  assert.equal(detectBlockType(`${invalidOpening}\ncode`), "paragraph");

  const tildeSource = `~~~type\`script\ncode\n~~~`;
  assert.deepEqual(
    splitMarkdownBlocks(tildeSource).map((block) => block.type),
    ["code"],
  );
  assert.equal(detectBlockType(tildeSource), "code");
});

test("splitMarkdownBlocks keeps raw HTML blocks together like Typora", () => {
  const blocks = splitMarkdownBlocks([
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
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["html", "heading", "html", "heading", "html", "heading"]);
  assert.equal(blocks[0].raw, "<div>\n# Hidden\n</div>\n# Still hidden\n");
  assert.equal(blocks[2].raw, "<script>\n# Script hidden\n</script>\n");
  assert.equal(blocks[4].raw, "<!--\n### Comment hidden\n-->\n");
});

test("原始 HTML 块中的引用和列表标记保持字面内容", () => {
  const plain = [
    "<div>",
    "> literal",
    "* item",
    "</div>",
  ].join("\n");
  assert.deepEqual(splitMarkdownBlocks(plain).map((block) => block.type), ["html"]);
  assert.equal(splitMarkdownBlocks(plain)[0]?.raw, plain);

  const quoted = [
    "> <div>",
    "> > literal",
    "> * item",
    "> </div>",
  ].join("\r\n");
  assert.deepEqual(splitMarkdownBlocks(quoted).map((block) => block.type), ["quote"]);
  assert.equal(splitMarkdownBlocks(quoted)[0]?.raw, quoted);
});

test("plain HTML containers end at the first blank line like Typora and CommonMark", () => {
  for (const tag of ["details", "div", "section", "article", "blockquote"]) {
    const source = `<${tag}>\ncontent before blank\n\nMarkdown body\n</${tag}>`;
    const blocks = splitMarkdownBlocks(source);

    assert.deepEqual(
      blocks.map((block) => block.type),
      ["html", "paragraph", "html"],
      tag,
    );
    assert.equal(blocks[0]?.raw, `<${tag}>\ncontent before blank\n`, tag);
    assert.equal(blocks[1]?.raw, "Markdown body\n", tag);
    assert.equal(blocks[2]?.raw, `</${tag}>`, tag);
  }
});

test("quoted and listed HTML containers preserve their outer Markdown container", () => {
  const quoted = splitMarkdownBlocks([
    "> <details>",
    "> <summary>Summary</summary>",
    ">",
    "> Body",
    "> </details>",
  ].join("\n"));
  assert.deepEqual(quoted.map((block) => block.type), ["quote", "quote", "quote"]);

  const listed = splitMarkdownBlocks([
    "- item",
    "",
    "  <details>",
    "  <summary>Summary</summary>",
    "",
    "  Body",
    "  </details>",
  ].join("\n"));
  assert.deepEqual(listed.map((block) => block.type), ["list"]);
});

test("explicitly closed raw HTML forms keep internal blank lines", () => {
  const cases = [
    "<!-- first\n\nsecond -->",
    "<![CDATA[first\n\nsecond]]>",
    "<pre>\nfirst\n\nsecond\n</pre>",
    "<script>\nfirst\n\nsecond\n</script>",
    "<style>\nfirst\n\nsecond\n</style>",
    "<textarea>\nfirst\n\nsecond\n</textarea>",
  ];

  for (const source of cases) {
    const blocks = splitMarkdownBlocks(source);
    assert.deepEqual(blocks.map((block) => block.type), ["html"], source);
    assert.equal(blocks[0]?.raw, source, source);
  }
});

test("splitMarkdownBlocks keeps blank lines and Markdown markers inside textarea HTML", () => {
  const source = [
    "<textarea>",
    "First line",
    "",
    "Second line",
    "---",
    "</textarea>",
    "# Visible",
  ].join("\n");
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["html", "heading"]);
  assert.equal(blocks[0]?.raw, "<textarea>\nFirst line\n\nSecond line\n---\n</textarea>\n");
});

test("splitMarkdownBlocks keeps multiline video and audio embeds together", () => {
  const source = [
    '<video controls poster="cover.jpg">',
    '  <source src="demo.mp4" type="video/mp4">',
    "  回退文本",
    "</video>",
    "",
    '<audio controls src="demo.mp3"></audio>',
  ].join("\n");
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["html", "html"]);
  assert.match(blocks[0]?.raw ?? "", /<source src="demo\.mp4"/);
});

test("splitMarkdownBlocks treats quoted raw fences as standalone blocks", () => {
  const blocks = splitMarkdownBlocks([
    "> ```md",
    "> # Hidden",
    "> ```",
    "# Visible",
    "> $$",
    "> x+y",
    "> $$",
    "\\[",
    "a=b",
    "\\]",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["quote", "heading", "quote", "math"]);
  assert.equal(blocks[0].raw, "> ```md\n> # Hidden\n> ```\n");
  assert.equal(blocks[2].raw, "> $$\n> x+y\n> $$\n");
});

test("splitMarkdownBlocks does not treat heavily indented quoted fences as raw fences", () => {
  const blocks = splitMarkdownBlocks([
    ">     ```",
    ">     # code",
    "",
    "# Visible",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["quote", "heading"]);
  assert.equal(blocks[0].raw, ">     ```\n>     # code\n");
});

test("splitMarkdownBlocks keeps multi-paragraph footnotes together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "Intro[^note]",
    "",
    "[^note]: First paragraph",
    "",
    "    Continued paragraph",
    "",
    "Next paragraph",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "footnote", "paragraph"]);
  assert.equal(blocks[1].raw, "[^note]: First paragraph\n\n    Continued paragraph\n");
  assert.equal(detectBlockType("[^note]: First paragraph"), "footnote");
});

test("splitMarkdownBlocks keeps plain footnote continuation lines together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "Intro[^note]",
    "",
    "[^note]: First paragraph",
    "continued text",
    "  more text",
    "",
    "Next paragraph",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "footnote", "paragraph"]);
  assert.equal(blocks[1].raw, "[^note]: First paragraph\ncontinued text\n  more text\n");
});

test("splitMarkdownBlocks keeps quoted footnote definitions together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "> Text[^note]",
    ">",
    "> [^note]: First paragraph",
    ">",
    ">     Continued paragraph",
    "> > Different quote depth",
    "",
    "After",
  ].join("\n"));

  const footnote = blocks.find((block) => block.type === "footnote");
  assert.ok(footnote);
  assert.equal(footnote.raw, "> [^note]: First paragraph\n>\n>     Continued paragraph\n");
  assert.doesNotMatch(footnote.raw, /Different quote depth/);
});

test("splitMarkdownBlocks limits blockquote prefixes to three leading spaces", () => {
  assert.deepEqual(
    splitMarkdownBlocks("   > [^n]: quote").map((block) => block.type),
    ["footnote"],
  );
  assert.deepEqual(
    splitMarkdownBlocks("    > [^n]: code").map((block) => block.type),
    ["code"],
  );
  assert.deepEqual(
    splitMarkdownBlocks("\t> [^n]: code").map((block) => block.type),
    ["code"],
  );
});

test("splitMarkdownBlocks stops footnotes before interrupting blocks like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "[^note]: First paragraph",
    "  # Outside heading",
    "",
    "[^next]: Next note",
    "- Outside list",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["footnote", "heading", "footnote", "list"]);
  assert.equal(blocks[0].raw, "[^note]: First paragraph\n");
  assert.equal(blocks[1].raw, "  # Outside heading\n");
  assert.equal(blocks[2].raw, "[^next]: Next note\n");
  assert.equal(blocks[3].raw, "- Outside list");
});

test("splitMarkdownBlocks recognizes spaced labels and interrupts on the next spaced definition", () => {
  const source = [
    "> - [^中文 note]: First",
    ">       continuation",
    "[^next note]: Second",
    "After",
  ].join("\r\n");
  const blocks = splitMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["footnote", "footnote"]);
  assert.equal(blocks[0]?.raw, "> - [^中文 note]: First\r\n>       continuation\r\n");
  assert.equal(blocks[1]?.raw, "[^next note]: Second\r\nAfter");
  assert.equal(detectBlockType("[^my note]: Detail"), "footnote");
});

test("splitMarkdownBlocks treats only lightly indented footnote definitions as footnotes", () => {
  const light = splitMarkdownBlocks([
    "Intro",
    "",
    "   [^note]: detail",
    "",
    "Next",
  ].join("\n"));

  assert.deepEqual(light.map((block) => block.type), ["paragraph", "footnote", "paragraph"]);
  assert.equal(light[1].raw, "   [^note]: detail\n");

  const code = splitMarkdownBlocks("    [^note]: code\n\n\t[^tab]: code");
  assert.deepEqual(code.map((block) => block.type), ["code"]);
  assert.equal(code[0].raw, "    [^note]: code\n\n\t[^tab]: code");
});

test("splitMarkdownBlocks keeps reference definitions with titles together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "Intro [docs][docs]",
    "",
    "[docs]: https://example.com",
    "    \"Docs title\"",
    "",
    "Next paragraph",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "reference", "paragraph"]);
  assert.equal(blocks[1].raw, "[docs]: https://example.com\n    \"Docs title\"\n");
  assert.equal(detectBlockType("[docs]: https://example.com"), "reference");
});

test("splitMarkdownBlocks keeps lightly indented reference titles together like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "Intro [docs][docs]",
    "",
    "[docs]: https://example.com",
    "  \"Docs title\"",
    "",
    "Next paragraph",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "reference", "paragraph"]);
  assert.equal(blocks[1].raw, "[docs]: https://example.com\n  \"Docs title\"\n");
});

test("splitMarkdownBlocks separates indented code after reference definitions like Typora", () => {
  const blocks = splitMarkdownBlocks([
    "Intro [docs][docs]",
    "",
    "[docs]: https://example.com",
    "    code after definition",
    "",
    "[guide]: https://example.com/guide",
    "",
    "    detached code",
  ].join("\n"));

  assert.deepEqual(blocks.map((block) => block.type), ["paragraph", "reference", "code", "reference", "code"]);
  assert.equal(blocks[1].raw, "[docs]: https://example.com\n");
  assert.equal(blocks[2].raw, "    code after definition\n");
  assert.equal(blocks[3].raw, "[guide]: https://example.com/guide\n");
  assert.equal(blocks[4].raw, "    detached code");
});

test("splitMarkdownBlocks treats only lightly indented reference definitions as references", () => {
  const light = splitMarkdownBlocks([
    "Intro [docs][docs]",
    "",
    "   [docs]: https://example.com",
    "",
    "Next",
  ].join("\n"));

  assert.deepEqual(light.map((block) => block.type), ["paragraph", "reference", "paragraph"]);
  assert.equal(light[1].raw, "   [docs]: https://example.com\n");

  const code = splitMarkdownBlocks("    [docs]: https://example.com\n\n\t[tab]: https://example.com");
  assert.deepEqual(code.map((block) => block.type), ["code"]);
  assert.equal(code[0].raw, "    [docs]: https://example.com\n\n\t[tab]: https://example.com");
});

test("detectBlockType only treats front matter as document-start metadata", () => {
  assert.equal(detectBlockType("---\ntitle: Doc\n---", true), "frontmatter");
  assert.equal(detectBlockType("---\nnot metadata", false), "paragraph");
  assert.deepEqual(
    splitMarkdownBlocks("Intro\n\n---\nnot metadata").map((block) => block.type),
    ["paragraph", "rule", "paragraph"],
  );
});

test("splitMarkdownBlocks separates document-start front matter without requiring a blank line", () => {
  const blocks = splitMarkdownBlocks("---\ntitle: Doc\n---\n# Heading");

  assert.deepEqual(blocks.map((block) => block.type), ["frontmatter", "heading"]);
  assert.equal(blocks[0].raw, "---\ntitle: Doc\n---\n");
  assert.equal(blocks[1].raw, "# Heading");
});

test("splitMarkdownBlocks treats UTF-8 BOM front matter as document metadata like Typora", () => {
  const blocks = splitMarkdownBlocks("\uFEFF---\ntitle: Doc\n---\n# Heading");

  assert.deepEqual(blocks.map((block) => block.type), ["frontmatter", "heading"]);
  assert.equal(blocks[0].raw, "\uFEFF---\ntitle: Doc\n---\n");
  assert.equal(detectBlockType("\uFEFF---\ntitle: Doc\n---", true), "frontmatter");
});

test("splitMarkdownBlocks accepts the YAML explicit end marker with LF and CRLF", () => {
  for (const lineBreak of ["\n", "\r\n"] as const) {
    const source = `\uFEFF---${lineBreak}title: Doc${lineBreak}...${lineBreak}# Heading`;
    const blocks = splitMarkdownBlocks(source);

    assert.deepEqual(blocks.map((block) => block.type), ["frontmatter", "heading"], lineBreak);
    assert.equal(blocks[0].raw, `\uFEFF---${lineBreak}title: Doc${lineBreak}...${lineBreak}`);
    assert.equal(detectBlockType(`---${lineBreak}title: Doc${lineBreak}...`, true), "frontmatter");
  }
});

test("indentSelection renumbers ordered list siblings after indenting an item", () => {
  const source = "1. one\n2. two\n3. three";
  const cursor = source.indexOf("two");
  const result = indentSelection(source, cursor, cursor, false);

  assert.deepEqual(result, {
    value: "1. one\n  1. two\n2. three",
    selectionStart: "1. one\n  1. ".length,
    selectionEnd: "1. one\n  1. ".length,
  });
});

test("indentSelection renumbers ordered list siblings after outdenting an item", () => {
  const source = "1. one\n  1. two\n2. three";
  const cursor = source.indexOf("two");
  const result = indentSelection(source, cursor, cursor, true);

  assert.deepEqual(result, {
    value: "1. one\n2. two\n3. three",
    selectionStart: "1. one\n2. ".length,
    selectionEnd: "1. one\n2. ".length,
  });
});

test("indentSelection preserves ordered list start while renumbering nested groups", () => {
  const source = "9. nine\n10. ten\n11. eleven";
  const cursor = source.indexOf("ten");
  const result = indentSelection(source, cursor, cursor, false);

  assert.deepEqual(result, {
    value: "9. nine\n  1. ten\n10. eleven",
    selectionStart: "9. nine\n  1. ".length,
    selectionEnd: "9. nine\n  1. ".length,
  });
});

test("indentSelection does not renumber four-space ordered code outside lists like Typora", () => {
  const source = "paragraph\n    3. code\n    10. code";
  const cursor = source.indexOf("3. code");
  const result = indentSelection(source, cursor, cursor, false);

  assert.deepEqual(result, {
    value: "paragraph\n      3. code\n    10. code",
    selectionStart: "paragraph\n      ".length,
    selectionEnd: "paragraph\n      ".length,
  });
});

test("indentSelection still renumbers four-space nested ordered lists inside parent lists", () => {
  const source = "- parent\n    3. child\n    4. next";
  const cursor = source.indexOf("next");
  const result = indentSelection(source, cursor, cursor, false);

  assert.deepEqual(result, {
    value: "- parent\n    1. child\n      1. next",
    selectionStart: "- parent\n    1. child\n      1. ".length,
    selectionEnd: "- parent\n    1. child\n      1. ".length,
  });
});

test("indentSelection indents quoted ordered list items inside the blockquote", () => {
  const source = "> 1. one\n> 2. two\n> 3. three";
  const cursor = source.indexOf("two");
  const result = indentSelection(source, cursor, cursor, false);

  assert.deepEqual(result, {
    value: "> 1. one\n>   1. two\n> 2. three",
    selectionStart: "> 1. one\n>   1. ".length,
    selectionEnd: "> 1. one\n>   1. ".length,
  });
});

test("indentSelection outdents quoted ordered list items and renumbers siblings", () => {
  const source = "> 1. one\n>   1. two\n> 2. three";
  const cursor = source.indexOf("two");
  const result = indentSelection(source, cursor, cursor, true);

  assert.deepEqual(result, {
    value: "> 1. one\n> 2. two\n> 3. three",
    selectionStart: "> 1. one\n> 2. ".length,
    selectionEnd: "> 1. one\n> 2. ".length,
  });
});

test("indentSelection maps the cursor after quoted ordered list renumbering changes width", () => {
  const source = "> 9. nine\n>   1. ten\n> 10. eleven";
  const cursor = source.indexOf("ten");
  const result = indentSelection(source, cursor, cursor, true);

  assert.deepEqual(result, {
    value: "> 9. nine\n> 10. ten\n> 11. eleven",
    selectionStart: "> 9. nine\n> 10. ".length,
    selectionEnd: "> 9. nine\n> 10. ".length,
  });
});

test("indentSelection keeps quoted task list markers inside the quote while indenting selections", () => {
  const source = "> - [ ] first\n> - [x] second";
  const result = indentSelection(source, 0, source.length, false);

  assert.deepEqual(result, {
    value: ">   - [ ] first\n>   - [x] second",
    selectionStart: 0,
    selectionEnd: ">   - [ ] first\n>   - [x] second".length,
  });
});

test("indentSelection keeps a line-start cursor collapsed before quoted list indentation", () => {
  const result = indentSelection("> - item", 0, 0, false);

  assert.deepEqual(result, {
    value: ">   - item",
    selectionStart: 0,
    selectionEnd: 0,
  });
});

test("indentSelection outdents quoted task list items inside the blockquote", () => {
  const source = ">   - [ ] task";
  const cursor = source.indexOf("task");
  const result = indentSelection(source, cursor, cursor, true);

  assert.deepEqual(result, {
    value: "> - [ ] task",
    selectionStart: "> - [ ] ".length,
    selectionEnd: "> - [ ] ".length,
  });
});

test("indentSelection supports Typora-style four-space indentation preference", () => {
  const indented = indentSelection("alpha\nbeta", 0, "alpha\nbeta".length, false, 4);
  assert.equal(indented.value, "    alpha\n    beta");
  assert.equal(indented.selectionStart, 4);
  assert.equal(indented.selectionEnd, "    alpha\n    beta".length);

  const outdented = indentSelection(indented.value, 0, indented.value.length, true, 4);
  assert.equal(outdented.value, "alpha\nbeta");
});

test("applyContextualMarkdownTab inserts and removes one indent layer at a collapsed cursor", () => {
  const inserted = applyContextualMarkdownTab("alpha", 2, 2, false, 4);
  assert.deepEqual(inserted, {
    value: "al\tpha",
    selectionStart: 3,
    selectionEnd: 3,
  });

  const outdented = applyContextualMarkdownTab(inserted.value, 3, 3, true, 4);
  assert.deepEqual(outdented, {
    value: "alpha",
    selectionStart: 2,
    selectionEnd: 2,
  });
});

test("applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts", () => {
  const fenced = "```md\n- code that resembles a list\n```";
  const fencedCursor = fenced.indexOf("code");
  const fencedResult = applyContextualMarkdownTab(fenced, fencedCursor, fencedCursor, false, 2, 4);
  assert.equal(fencedResult.value, "```md\n- \tcode that resembles a list\n```");
  assert.equal(fencedResult.selectionStart, fencedCursor + 1);

  const indentedRaw = "```md\n    code\n```";
  const indentedRawCursor = indentedRaw.indexOf("code") + 2;
  assert.deepEqual(
    applyContextualMarkdownTab(indentedRaw, indentedRawCursor, indentedRawCursor, true, 2, 4),
    {
      value: "```md\ncode\n```",
      selectionStart: indentedRawCursor - 4,
      selectionEnd: indentedRawCursor - 4,
    },
  );

  const noLeadingIndent = "```md\ncode  value\n```";
  const middleSpacesCursor = noLeadingIndent.indexOf("  ") + 2;
  assert.deepEqual(
    applyContextualMarkdownTab(noLeadingIndent, middleSpacesCursor, middleSpacesCursor, true, 2, 4),
    {
      value: noLeadingIndent,
      selectionStart: middleSpacesCursor,
      selectionEnd: middleSpacesCursor,
    },
  );

  const indented = "    const value = 1;";
  const indentedCursor = indented.indexOf("const");
  const indentedResult = applyContextualMarkdownTab(indented, indentedCursor, indentedCursor, true, 2, 4);
  assert.deepEqual(indentedResult, {
    value: "const value = 1;",
    selectionStart: 0,
    selectionEnd: 0,
  });
});

test("applyContextualMarkdownTab does not nest a list item without a previous sibling", () => {
  const root = applyContextualMarkdownTab("- first\n- second", 2, 2, false);
  assert.deepEqual(root, {
    value: "- \tfirst\n- second",
    selectionStart: 3,
    selectionEnd: 3,
  });

  const nested = "- parent\n  - first child";
  const cursor = nested.indexOf("first child");
  assert.deepEqual(applyContextualMarkdownTab(nested, cursor, cursor, false), {
    value: "- parent\n  - \tfirst child",
    selectionStart: cursor + 1,
    selectionEnd: cursor + 1,
  });
});

test("applyContextualMarkdownTab indents the current list item and its subtree", () => {
  const source = "- first\n- second\n  - child\n- third";
  const cursor = source.indexOf("second");
  const result = applyContextualMarkdownTab(source, cursor, cursor, false);

  assert.deepEqual(result, {
    value: "- first\n  - second\n    - child\n- third",
    selectionStart: "- first\n  - ".length,
    selectionEnd: "- first\n  - ".length,
  });
});

test("applyContextualMarkdownTab outdents the current list item and its subtree", () => {
  const source = "- parent\n  - child\n    1. grandchild\n  - sibling";
  const cursor = source.indexOf("child");
  const result = applyContextualMarkdownTab(source, cursor, cursor, true);

  assert.deepEqual(result, {
    value: "- parent\n- child\n  1. grandchild\n  - sibling",
    selectionStart: "- parent\n- ".length,
    selectionEnd: "- parent\n- ".length,
  });
});

test("applyContextualMarkdownTab outdents a valid third-level sibling by one list level", () => {
  const source = "- parent\n  - child\n    - first\n    - second";
  const cursor = source.indexOf("second");

  assert.deepEqual(applyContextualMarkdownTab(source, cursor, cursor, true), {
    value: "- parent\n  - child\n    - first\n  - second",
    selectionStart: "- parent\n  - child\n    - first\n  - ".length,
    selectionEnd: "- parent\n  - child\n    - first\n  - ".length,
  });
});

test("applyContextualMarkdownTab keeps standalone four-space marker text as indented code", () => {
  const source = "    - code";
  const cursor = source.indexOf("code");

  assert.deepEqual(applyContextualMarkdownTab(source, cursor, cursor, true, 2, 4), {
    value: "- code",
    selectionStart: 2,
    selectionEnd: 2,
  });
});

test("applyContextualMarkdownTab preserves CRLF while indenting a quoted list subtree", () => {
  const source = "> - first\r\n> - second\r\n>   - child";
  const cursor = source.indexOf("second");
  const result = applyContextualMarkdownTab(source, cursor, cursor, false);

  assert.deepEqual(result, {
    value: "> - first\r\n>   - second\r\n>     - child",
    selectionStart: "> - first\r\n>   - ".length,
    selectionEnd: "> - first\r\n>   - ".length,
  });
});

test("applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior", () => {
  const source = "---\nkey:\n---";

  assert.deepEqual(applyContextualMarkdownTab(source, 4, 4, false, 2, 4), {
    value: "---\n  key:\n---",
    selectionStart: 6,
    selectionEnd: 6,
  });
  assert.deepEqual(applyContextualMarkdownTab(source, 4, 4, false, 4, 2), {
    value: "---\n    key:\n---",
    selectionStart: 8,
    selectionEnd: 8,
  });
  assert.deepEqual(applyContextualMarkdownTab(source, 6, 6, false, 4, 2), {
    value: "---\nke\ty:\n---",
    selectionStart: 7,
    selectionEnd: 7,
  });
  assert.deepEqual(applyContextualMarkdownTab(source, 4, 8, true, 4, 2), {
    value: source,
    selectionStart: 4,
    selectionEnd: 8,
  });

  const closingStart = source.lastIndexOf("---");
  assert.deepEqual(
    applyContextualMarkdownTab(source, closingStart, closingStart, false, 4, 2),
    {
      value: "---\nkey:\n\t---",
      selectionStart: closingStart + 1,
      selectionEnd: closingStart + 1,
    },
  );
});

test("applyContextualMarkdownTab replaces ordinary selections with one literal tab", () => {
  const source = "alpha\r\nbeta";
  assert.deepEqual(applyContextualMarkdownTab(source, 0, source.length, false), {
    value: "\t",
    selectionStart: 1,
    selectionEnd: 1,
  });

  const partial = "abXX\nYYcd";
  assert.deepEqual(applyContextualMarkdownTab(partial, 2, 7, false), {
    value: "ab\tcd",
    selectionStart: 3,
    selectionEnd: 3,
  });
});

test("applyContextualMarkdownTab keeps list and indented-code selections on line indentation", () => {
  const list = "- one\n- two";
  assert.deepEqual(applyContextualMarkdownTab(list, 0, list.length, false, 4, 2), {
    value: "    - one\n    - two",
    selectionStart: 4,
    selectionEnd: "    - one\n    - two".length,
  });

  const code = "    alpha\n    beta";
  assert.deepEqual(applyContextualMarkdownTab(code, 0, code.length, false, 4, 2), {
    value: "      alpha\n      beta",
    selectionStart: 2,
    selectionEnd: "      alpha\n      beta".length,
  });
});

test("applyContextualMarkdownTab uses code indentation for fenced, math, and HTML selections", () => {
  const cases = [
    {
      source: "```js\nalpha\nbeta\n```",
      value: "```js\n  alpha\n  beta\n```",
    },
    {
      source: "$$\nalpha\nbeta\n$$",
      value: "$$\n  alpha\n  beta\n$$",
    },
    {
      source: "<div>\nalpha\nbeta\n</div>",
      value: "<div>\n  alpha\n  beta\n</div>",
    },
  ];

  for (const item of cases) {
    const selectionStart = item.source.indexOf("\n") + 1;
    const selectionEnd = item.source.lastIndexOf("\n");
    const result = applyContextualMarkdownTab(
      item.source,
      selectionStart,
      selectionEnd,
      false,
      4,
      2,
    );
    assert.deepEqual(result, {
      value: item.value,
      selectionStart: selectionStart + 2,
      selectionEnd: selectionEnd + 4,
    });
  }
});

test("applyContextualMarkdownTab preserves every supported code indentation width", () => {
  const source = "```js\nalpha\nbeta\n```";
  const selectionStart = source.indexOf("alpha");
  const selectionEnd = source.indexOf("beta") + "beta".length;

  for (const codeIndentSize of [2, 3, 4, 5]) {
    const result = applyContextualMarkdownTab(
      source,
      selectionStart,
      selectionEnd,
      false,
      2,
      codeIndentSize,
    );
    const indent = " ".repeat(codeIndentSize);
    assert.equal(result.value, `\`\`\`js\n${indent}alpha\n${indent}beta\n\`\`\``);
  }
});

test("applyContextualMarkdownTab removes one quote level and prioritizes list outdent", () => {
  assert.deepEqual(applyContextualMarkdownTab("> text", 2, 2, true), {
    value: "text",
    selectionStart: 0,
    selectionEnd: 0,
  });
  assert.deepEqual(applyContextualMarkdownTab("> > text", 4, 4, true), {
    value: "> text",
    selectionStart: 2,
    selectionEnd: 2,
  });
  assert.deepEqual(applyContextualMarkdownTab("- item", 2, 2, true), {
    value: "item",
    selectionStart: 0,
    selectionEnd: 0,
  });
  assert.deepEqual(applyContextualMarkdownTab("> - item", 4, 4, true), {
    value: "> item",
    selectionStart: 2,
    selectionEnd: 2,
  });
});

test("applyContextualMarkdownTab outdents only the selected quote paragraph", () => {
  const source = "> before\n>\n> selected\n>\n> after";
  const cursor = source.indexOf("selected") + 3;
  const value = "> before\n\nselected\n\n> after";
  const result = applyContextualMarkdownTab(source, cursor, cursor, true);

  assert.deepEqual(result, {
    value,
    selectionStart: value.indexOf("selected") + 3,
    selectionEnd: value.indexOf("selected") + 3,
  });
});

test("applyContextualMarkdownTab maps quote selections and preserves CRLF", () => {
  const source = "> alpha\r\n> beta";
  const expected = "alpha\r\nbeta";
  const selectionStart = source.indexOf("alpha") + 1;
  const selectionEnd = source.indexOf("beta") + 2;
  assert.deepEqual(
    applyContextualMarkdownTab(source, selectionStart, selectionEnd, true),
    {
      value: expected,
      selectionStart: expected.indexOf("alpha") + 1,
      selectionEnd: expected.indexOf("beta") + 2,
    },
  );

  assert.deepEqual(applyContextualMarkdownTab(source, 0, source.length, true), {
    value: expected,
    selectionStart: 0,
    selectionEnd: expected.length,
  });
});

test("ordered list editing accepts arbitrary-length marker digits", () => {
  const nineDigit = "1. parent\n123456789. child";
  const indented = applyContextualMarkdownTab(
    nineDigit,
    nineDigit.indexOf("child"),
    nineDigit.indexOf("child"),
    false,
  );
  assert.equal(indented.value, "1. parent\n  1. child");

  const outdented = applyContextualMarkdownTab(
    indented.value,
    indented.value.indexOf("child"),
    indented.value.indexOf("child"),
    true,
  );
  assert.equal(outdented.value, "1. parent\n2. child");

  const tenDigit = "1234567890. child";
  assert.deepEqual(
    applyContextualMarkdownTab(tenDigit, tenDigit.length, tenDigit.length, false),
    {
      value: `${tenDigit}\t`,
      selectionStart: tenDigit.length + 1,
      selectionEnd: tenDigit.length + 1,
    },
  );

  const indentedTenDigit = `  ${tenDigit}`;
  assert.deepEqual(
    applyContextualMarkdownTab(indentedTenDigit, 2, 2, true),
    {
      value: tenDigit,
      selectionStart: 0,
      selectionEnd: 0,
    },
  );
});

test("ordered list renumbering increments ten-digit list prefixes", () => {
  assert.equal(
    renumberOrderedListBlockAtLine("123456789. first\n5. second", 0),
    "123456789. first\n123456790. second",
  );
  assert.equal(
    renumberOrderedListBlockAtLine("1234567890. first\n5. second", 0),
    "1234567890. first\n1234567891. second",
  );
});

test("splitMarkdownBlocks rejects tables whose delimiter column count differs", () => {
  for (const source of [
    "A | B\n| --- | --- | --- |\ntext",
    "A | B | C\n| --- | --- |\ntext",
  ]) {
    assert.deepEqual(splitMarkdownBlocks(source).map((block) => block.type), ["paragraph"]);
    assert.equal(detectBlockType(source), "paragraph");
  }
});

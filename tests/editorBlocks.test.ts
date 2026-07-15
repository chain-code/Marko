import test from "node:test";
import assert from "node:assert/strict";
import { detectBlockType, indentSelection, splitMarkdownBlocks } from "../src/utils/editorBlocks";

test("splitMarkdownBlocks recognizes Setext headings as heading blocks", () => {
  const blocks = splitMarkdownBlocks("Title\n---\n\nParagraph");

  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[1].type, "paragraph");
});

test("splitMarkdownBlocks recognizes tables without outer pipes like Typora", () => {
  const blocks = splitMarkdownBlocks("Name | Age\n--- | ---\nAda | 36\n\nParagraph");

  assert.equal(blocks[0].type, "table");
  assert.equal(blocks[1].type, "paragraph");
  assert.equal(detectBlockType("Name | Age\n--- | ---"), "table");
  assert.equal(detectBlockType("Name \\| Age\n--- | ---"), "paragraph");
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
  assert.equal(splitMarkdownBlocks("Intro\n\n---\nnot metadata")[1].type, "paragraph");
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

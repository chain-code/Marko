import test from "node:test";
import assert from "node:assert/strict";
import { defaultEditorSettings } from "../src/utils/editorSettings";
import { renderMarkdown } from "../src/utils/markdown";

test("renderMarkdown recognizes empty YAML front matter without creating a horizontal rule", () => {
  const source = "---\n---\n# Title";
  const html = renderMarkdown(source, {
    settings: defaultEditorSettings,
    outline: [],
  });

  assert.match(html, /class="frontmatter-block"/);
  assert.match(html, /<h1[^>]*>Title<\/h1>/);
  assert.doesNotMatch(html, /<hr/);
  assert.doesNotMatch(html, /<code>---<\/code>/);
});

test("renderMarkdown recognizes the YAML explicit end marker with LF and CRLF", () => {
  for (const lineBreak of ["\n", "\r\n"] as const) {
    const source = `---${lineBreak}title: Explicit end${lineBreak}...${lineBreak}# Body`;
    const html = renderMarkdown(source, {
      settings: defaultEditorSettings,
      outline: [],
    });

    assert.match(html, /class="frontmatter-block"/);
    assert.match(html, /title: Explicit end/);
    assert.match(html, /<h1[^>]*>Body<\/h1>/);
    assert.doesNotMatch(html, /<code>[\s\S]*\.\.\.[\s\S]*<\/code>/);
  }
});

test("front matter delimiters must occupy their own unindented line", () => {
  const source = [
    "---",
    "title: Wait...",
    "description: |",
    "  ...",
    "  ---",
    "...   ",
    "# Body",
  ].join("\n");
  const html = renderMarkdown(source, {
    settings: defaultEditorSettings,
    outline: [],
  });

  assert.match(html, /class="frontmatter-block"/);
  assert.match(html, /title: Wait\.\.\./);
  assert.match(html, /  \.\.\./);
  assert.match(html, /  ---/);
  assert.match(html, /<h1[^>]*>Body<\/h1>/);
});

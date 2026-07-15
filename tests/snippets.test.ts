import test from "node:test";
import assert from "node:assert/strict";
import { buildFrontMatterSnippet, insertFrontMatterSnippet } from "../src/utils/snippets";

test("buildFrontMatterSnippet uses the provided local date", () => {
  assert.equal(
    buildFrontMatterSnippet(new Date(2026, 6, 10)),
    "---\ntitle: 新文档\ndate: 2026-07-10\n---\n\n",
  );
});

test("buildFrontMatterSnippet pads month and day like Typora front matter", () => {
  assert.equal(
    buildFrontMatterSnippet(new Date(2026, 0, 5)),
    "---\ntitle: 新文档\ndate: 2026-01-05\n---\n\n",
  );
});

test("insertFrontMatterSnippet inserts YAML front matter at the document start like Typora", () => {
  const result = insertFrontMatterSnippet("# Heading\n\nBody", new Date(2026, 6, 10));

  assert.equal(result.value, "---\ntitle: 新文档\ndate: 2026-07-10\n---\n\n# Heading\n\nBody");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "新文档");
});

test("insertFrontMatterSnippet preserves CRLF line endings like Typora", () => {
  const result = insertFrontMatterSnippet("# Heading\r\n\r\nBody", new Date(2026, 6, 10));

  assert.equal(result.value, "---\r\ntitle: 新文档\r\ndate: 2026-07-10\r\n---\r\n\r\n# Heading\r\n\r\nBody");
  assert.equal(result.value.replace(/\r\n/g, "").includes("\n"), false);
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "新文档");
});

test("insertFrontMatterSnippet selects existing YAML front matter instead of duplicating it", () => {
  const source = "---\ntitle: Existing\n---\n\n# Heading";
  const result = insertFrontMatterSnippet(source, new Date(2026, 6, 10));

  assert.equal(result.value, source);
  assert.equal(result.selectionStart, 0);
  assert.equal(result.selectionEnd, "---\ntitle: Existing\n---\n".length);
});

test("insertFrontMatterSnippet keeps UTF-8 BOM before YAML front matter like Typora", () => {
  const source = "\uFEFF# Heading";
  const result = insertFrontMatterSnippet(source, new Date(2026, 6, 10));

  assert.equal(result.value, "\uFEFF---\ntitle: 新文档\ndate: 2026-07-10\n---\n\n# Heading");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "新文档");
  assert.equal(result.selectionStart, "\uFEFF---\ntitle: ".length);
});

test("insertFrontMatterSnippet selects existing UTF-8 BOM YAML front matter", () => {
  const source = "\uFEFF---\ntitle: Existing\n---\n\n# Heading";
  const result = insertFrontMatterSnippet(source, new Date(2026, 6, 10));

  assert.equal(result.value, source);
  assert.equal(result.selectionStart, 0);
  assert.equal(result.selectionEnd, "\uFEFF---\ntitle: Existing\n---\n".length);
});

test("insertFrontMatterSnippet selects existing CRLF YAML front matter", () => {
  const source = "---\r\ntitle: Existing\r\n---\r\n\r\n# Heading";
  const result = insertFrontMatterSnippet(source, new Date(2026, 6, 10));

  assert.equal(result.value, source);
  assert.equal(result.selectionStart, 0);
  assert.equal(result.selectionEnd, "---\r\ntitle: Existing\r\n---\r\n".length);
});

import test from "node:test";
import assert from "node:assert/strict";
import { collectInlineMarkdownSyntax } from "../src/utils/inlineSyntax";

test("collectInlineMarkdownSyntax keeps rendered links editable as source", () => {
  const source = "Before [docs](https://example.com) and [guide][guide].";

  assert.deepEqual(collectInlineMarkdownSyntax(source), [
    {
      type: "link",
      start: 7,
      end: 34,
      raw: "[docs](https://example.com)",
      label: "docs",
    },
    {
      type: "link",
      start: 39,
      end: 53,
      raw: "[guide][guide]",
      label: "guide",
    },
  ]);
});

test("collectInlineMarkdownSyntax includes the image marker and destination", () => {
  const source = "![Marko](assets/icon.png \"icon\")";

  assert.deepEqual(collectInlineMarkdownSyntax(source), [
    {
      type: "image",
      start: 0,
      end: source.length,
      raw: source,
      label: "Marko",
    },
  ]);
});

test("collectInlineMarkdownSyntax exposes an image nested inside a link", () => {
  const source = "[![Preview](assets/preview.png)](https://example.com)";
  const syntax = collectInlineMarkdownSyntax(source);

  assert.deepEqual(syntax.map((item) => ({ type: item.type, raw: item.raw })), [
    { type: "link", raw: source },
    { type: "image", raw: "![Preview](assets/preview.png)" },
  ]);
});

test("collectInlineMarkdownSyntax ignores malformed syntax", () => {
  assert.deepEqual(collectInlineMarkdownSyntax("[missing](url and plain [text"), []);
});

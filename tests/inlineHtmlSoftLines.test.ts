import assert from "node:assert/strict";
import test from "node:test";
import {
  collectFootnoteReferenceSyntax,
  collectInlineHtmlMarkupRanges,
  collectInlineHtmlSyntax,
  collectInlineMarkdownSyntax,
  collectInlineMathSyntax,
} from "../src/utils/inlineSyntax";

test("collectInlineHtmlSyntax matches paired inline HTML across soft line breaks", () => {
  const html = [
    '<span class="outer">first line',
    "<strong>second line</strong>",
    "last line</span>",
  ].join("\n");
  const source = `before ${html} after`;

  assert.deepEqual(collectInlineHtmlSyntax(source), [{
    type: "html",
    start: "before ".length,
    end: "before ".length + html.length,
    raw: html,
  }]);
  assert.deepEqual(
    collectInlineHtmlMarkupRanges(source).map((range) => source.slice(range.start, range.end)),
    ['<span class="outer">', "<strong>", "</strong>", "</span>"],
  );
});

test("collectInlineHtmlSyntax does not pair inline tags across a blank line", () => {
  const source = "<span>first paragraph\n\nsecond paragraph</span>";

  assert.deepEqual(collectInlineHtmlSyntax(source), []);
});

test("collectInlineHtmlSyntax keeps multiline code spans protected while matching visible HTML", () => {
  const hidden = ["``code", "<span>hidden</span>", "``"].join("\n");
  const visible = ["<kbd>Ctrl", "+ Enter</kbd>"].join("\n");
  const source = `${hidden}\n${visible}`;

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [visible]);
});

test("collectInlineHtmlSyntax accepts a start tag split across soft lines", () => {
  const opening = [
    "<span",
    'class="note" title="$attr$ [^attr] [link](/attr.md)">',
  ].join("\n");
  const html = `${opening}text $body$ [^body] [body](/body.md)</span>`;
  const source = `before ${html} after`;

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [html]);
  assert.deepEqual(
    collectInlineHtmlMarkupRanges(source).map((range) => source.slice(range.start, range.end)),
    [opening, "</span>"],
  );
  assert.deepEqual(collectInlineMathSyntax(source).map((item) => item.raw), ["$body$"]);
  assert.deepEqual(collectFootnoteReferenceSyntax(source).map((item) => item.raw), ["[^body]"]);
  assert.deepEqual(
    collectInlineMarkdownSyntax(source).map((item) => item.raw),
    ["[^body]", "[body](/body.md)"],
  );
});

test("collectInlineHtmlSyntax rejects ordinary tags split across a blank line", () => {
  const source = [
    "before <span",
    "",
    'class="note">text</span> after',
  ].join("\n");

  assert.deepEqual(collectInlineHtmlSyntax(source), []);
  assert.deepEqual(
    collectInlineHtmlMarkupRanges(source).map((range) => source.slice(range.start, range.end)),
    ["</span>"],
  );
});

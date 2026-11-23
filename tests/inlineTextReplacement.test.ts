import assert from "node:assert/strict";
import test from "node:test";
import { collectInlineTextReplacementRanges } from "../src/utils/inlineTextReplacement";
import { renderSmartPunctuationText } from "../src/utils/markdown";

test("smart quotes pair across a soft line break and retain source offsets", () => {
  const source = 'He said "first line\nsecond line" after.';
  const rendered = renderSmartPunctuationText(source);
  const replacements = collectInlineTextReplacementRanges(source, rendered, 10);

  assert.equal(rendered, "He said \u201cfirst line\nsecond line\u201d after.");
  assert.deepEqual(replacements, [
    { from: 18, to: 19, source: '"', value: "\u201c" },
    { from: 41, to: 42, source: '"', value: "\u201d" },
  ]);
});

test("inline replacement alignment keeps dash and ellipsis ranges on their source lines", () => {
  const source = "first -- line\nsecond ... line";
  const rendered = renderSmartPunctuationText(source);

  assert.deepEqual(collectInlineTextReplacementRanges(source, rendered), [
    { from: 6, to: 8, source: "--", value: "\u2013" },
    { from: 21, to: 24, source: "...", value: "\u2026" },
  ]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEffectiveCssRule } from "./helpers/cssRules";

const source = readFileSync(
  resolve("src/components/ContinuousMarkdownEditor.vue"),
  "utf8",
);
const style = source.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? "";
const previewStyle = readFileSync(
  resolve("src/components/MarkdownPreview.vue"),
  "utf8",
).match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? "";
const richBlockStyle = readFileSync(
  resolve("src/components/RichMarkdownBlock.vue"),
  "utf8",
).match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? "";

test("标题分隔线保留字形安全距离", () => {
  const heading = getEffectiveCssRule(style, ":deep(.cm-heading)");
  assert.match(heading, /--heading-block-padding-bottom:\s*1rem;/);
  assert.match(heading, /--heading-rule-text-gap:\s*0\.125em;/);
  assert.match(
    heading,
    /--heading-rule-bottom-offset:\s*calc\(var\(--heading-block-padding-bottom\) - var\(--heading-rule-text-gap\)\);/,
  );
  assert.match(
    getEffectiveCssRule(
      style,
      ":deep(.cm-heading-1:not(.cm-setext-heading-line))::after",
    ),
    /bottom:\s*var\(--heading-rule-bottom-offset\);/,
  );

  for (const selector of [
    ":deep(.cm-heading.cm-spacing-collapse-after)",
    ":deep(.cm-heading.cm-blockquote-last)",
  ]) {
    const declarations = getEffectiveCssRule(style, selector);
    assert.match(declarations, /--heading-rule-bottom-offset:\s*0;/, selector);
    assert.match(
      declarations,
      /padding-bottom:\s*var\(--heading-block-padding-bottom\);/,
      selector,
    );
  }

  assert.match(
    getEffectiveCssRule(style, ":deep(.cm-heading.cm-setext-heading-last)"),
    /--heading-block-padding-bottom:\s*1rem;[\s\S]*padding-bottom:\s*var\(--heading-block-padding-bottom\);/,
  );
  for (const listClass of ["cm-bullet-list", "cm-ordered-list", "cm-task-list"]) {
    const declarations = getEffectiveCssRule(style, `:deep(.${listClass})`);
    assert.match(declarations, /--heading-block-padding-bottom:\s*0\.5rem;/, listClass);
    assert.match(
      declarations,
      /padding-bottom:\s*var\(--heading-block-padding-bottom\);/,
      listClass,
    );

    for (const edgeClass of ["cm-spacing-collapse-after", "cm-blockquote-last"]) {
      const selector = `:deep(.cm-heading.${listClass}.${edgeClass})`;
      const combined = getEffectiveCssRule(style, selector);
      assert.match(
        combined,
        /--heading-block-padding-bottom:\s*var\(--heading-rule-text-gap\);/,
        selector,
      );
      assert.match(combined, /--heading-rule-bottom-offset:\s*0;/, selector);
      assert.match(
        combined,
        /padding-bottom:\s*var\(--heading-block-padding-bottom\);/,
        selector,
      );
    }
  }
});

test("all rendered H1 and H2 paths keep the separator below the glyph box", () => {
  for (const [currentStyle, selectors] of [
    [
      style,
      [":deep(.cm-special-preview-html h1)", ":deep(.cm-special-preview-html h2)"],
    ],
    [
      previewStyle,
      [".markdown-inner :deep(h1)", ".markdown-inner :deep(h2)"],
    ],
    [
      richBlockStyle,
      [".rich-markdown-block :deep(h1)", ".rich-markdown-block :deep(h2)"],
    ],
  ] as const) {
    for (const selector of selectors) {
      const declarations = getEffectiveCssRule(currentStyle, selector);
      assert.match(declarations, /border-bottom:\s*1px solid var\(--markdown-heading-rule\);/);
      assert.match(declarations, /padding-bottom:\s*0\.125em;/);
    }
  }
});

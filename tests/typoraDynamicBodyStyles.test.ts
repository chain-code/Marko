import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "@vue/compiler-sfc";
import { getEffectiveCssRule } from "./helpers/cssRules";

const componentPath = resolve("src/components/ContinuousMarkdownEditor.vue");
const descriptor = parse(readFileSync(componentPath, "utf8"), {
  filename: componentPath,
}).descriptor;
const style = descriptor.styles
  .filter((item) => item.scoped)
  .map((item) => item.content)
  .join("\n");

test("continuous block previews collapse renderer trailing newlines", () => {
  assert.match(
    getEffectiveCssRule(style, ":deep(.cm-special-preview)"),
    /white-space:\s*normal;/,
  );
});

test("focused top-level h3 through h6 headings show Typora-style labels", () => {
  assert.match(
    getEffectiveCssRule(style, ":deep(.cm-heading)"),
    /position:\s*relative;/,
  );

  const commonSelector = ":deep(.cm-heading-3.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before";
  const commonRule = getEffectiveCssRule(style, commonSelector);
  assert.match(commonRule, /inset-inline-start:\s*-1\.5625rem;/);
  assert.match(commonRule, /border:\s*1px solid currentColor;/);
  assert.match(commonRule, /font-size:\s*9px;/);
  assert.match(commonRule, /top:\s*calc\(1rem \+ var\(--heading-focus-label-offset\)\);/);

  for (const level of [3, 4, 5, 6]) {
    const selector = `:deep(.cm-heading-${level}.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before`;
    assert.match(
      getEffectiveCssRule(style, selector),
      new RegExp(`content:\\s*["']h${level}["'];`),
    );
  }

  assert.match(
    getEffectiveCssRule(
      style,
      ":deep(.cm-heading.cm-active-markdown-line.cm-spacing-collapse-before)::before",
    ),
    /top:\s*var\(--heading-focus-label-offset\);/,
  );
});

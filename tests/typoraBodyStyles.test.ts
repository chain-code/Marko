import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getEffectiveCssRule,
  getEffectiveMediaCssRule,
} from "./helpers/cssRules";

interface BodyStyleFixture {
  name: string;
  root: string;
  content: string;
  style: string;
}

const fixtures: BodyStyleFixture[] = [
  {
    name: "MarkdownPreview",
    root: ".markdown",
    content: ".markdown-inner",
    style: readScopedStyle("src/components/MarkdownPreview.vue"),
  },
  {
    name: "RichMarkdownBlock",
    root: ".rich-markdown-block",
    content: ".rich-markdown-block",
    style: readScopedStyle("src/components/RichMarkdownBlock.vue"),
  },
];
const continuousStyle = readScopedStyle("src/components/ContinuousMarkdownEditor.vue");
const visualTableStyle = readScopedStyle("src/components/VisualTableEditor.vue");

test("CSS assertions use the final declaration for a repeated selector", () => {
  const effective = getEffectiveCssRule(
    ".fixture { margin: 1px; color: red; } .fixture { margin: 2px; }",
    ".fixture",
  );
  assert.match(effective, /margin:\s*2px;/);
  assert.doesNotMatch(effective, /margin:\s*1px;/);
  assert.match(effective, /color:\s*red;/);
});

test("media assertions exclude matching rules outside the media block", () => {
  const source = [
    "@media screen and (max-width: 48em) { .other { padding-left: 3.5em; } }",
    ".fixture { padding-left: 3.5em; }",
  ].join("\n");
  assert.throws(
    () => getEffectiveMediaCssRule(
      source,
      "screen and (max-width: 48em)",
      ".fixture",
    ),
    /Missing CSS rule/,
  );
});

test("Typora body typography stays aligned across rendered paths", () => {
  const headingSizes = ["2.25em", "1.75em", "1.5em", "1.25em"];

  for (const fixture of fixtures) {
    assert.match(rule(fixture.style, fixture.root), /line-height:\s*1\.6;/, fixture.name);
    const contentRule = rule(fixture.style, fixture.content);
    assert.match(contentRule, /word-break:\s*normal;/, fixture.name);
    assert.match(contentRule, /word-wrap:\s*break-word;/, fixture.name);

    headingSizes.forEach((fontSize, index) => {
      const headingRule = rule(fixture.style, `${fixture.content} :deep(h${index + 1})`);
      assert.match(headingRule, new RegExp(`font-size:\\s*${fontSize.replace(".", "\\.")};`), fixture.name);
      assert.doesNotMatch(headingRule, /padding-left|padding-inline-start/, fixture.name);
    });

    const compactHeadings = new RegExp(
      `${escapeRegExp(`${fixture.content} :deep(h5),`)}\\s*${escapeRegExp(`${fixture.content} :deep(h6)`)}\\s*\\{[^}]*font-size:\\s*1em;`,
    );
    assert.match(fixture.style, compactHeadings, fixture.name);
    const mutedHeading = new RegExp(
      `${escapeRegExp(`${fixture.content} :deep(h6)`)}\\s*\\{\\s*color:\\s*var\\(--markdown-muted\\);`,
    );
    assert.match(fixture.style, mutedHeading, fixture.name);
    const multilineHeadings = [
      fixture.content + " :deep(h1),",
      fixture.content + " :deep(h2),",
      fixture.content + " :deep(h3),",
      fixture.content + " :deep(h4),",
      fixture.content + " :deep(h5),",
      fixture.content + " :deep(h6)",
    ].map(escapeRegExp).join("\\s*");
    assert.match(
      fixture.style,
      new RegExp(multilineHeadings + "\\s*\\{[^}]*white-space:\\s*pre-wrap;"),
      fixture.name,
    );
    assert.doesNotMatch(rule(fixture.style, `${fixture.content} :deep(p)`), /padding-inline-start/, fixture.name);
  }
});

test("Typora block metrics stay aligned across rendered paths", () => {
  for (const fixture of fixtures) {
    const inlineCode = rule(fixture.style, `${fixture.content} :deep(code)`);
    assert.match(inlineCode, /border-radius:\s*3px;/, fixture.name);
    assert.match(inlineCode, /background:\s*#f3f4f4;/, fixture.name);
    assert.match(inlineCode, /font-size:\s*0\.9em;/, fixture.name);
    assert.match(inlineCode, /padding:\s*0 2px;/, fixture.name);

    const teletype = rule(fixture.style, fixture.content + " :deep(tt)");
    assert.match(teletype, /border:\s*1px solid #e7eaed;/, fixture.name);
    assert.match(teletype, /background:\s*#f3f4f4;/, fixture.name);
    assert.match(teletype, /font-size:\s*0\.9em;/, fixture.name);
    assert.match(teletype, /padding:\s*0 2px;/, fixture.name);
    assert.match(
      rule(fixture.style, fixture.content + " :deep(h1 tt)"),
      /font-size:\s*inherit;/,
      fixture.name,
    );

    const codeBlock = rule(fixture.style, `${fixture.content} :deep(pre)`);
    assert.match(codeBlock, /border-radius:\s*3px;/, fixture.name);
    assert.match(codeBlock, /margin:\s*15px 0;/, fixture.name);
    assert.match(codeBlock, /padding:\s*8px 4px 6px;/, fixture.name);

    const blockquote = rule(fixture.style, `${fixture.content} :deep(blockquote)`);
    assert.match(blockquote, /border-left:\s*4px solid var\(--markdown-border\);/, fixture.name);
    assert.match(blockquote, /background:\s*color-mix\(in srgb, var\(--panel-subtle\) 40%, var\(--panel\)\);/, fixture.name);
    assert.match(blockquote, /margin:\s*0\.8em 0;/, fixture.name);
    assert.match(blockquote, /padding:\s*0 15px;/, fixture.name);
    assert.match(
      rule(fixture.style, fixture.content + " :deep(blockquote blockquote)"),
      /padding-right:\s*0;/,
      fixture.name,
    );
    assert.match(
      rule(fixture.style, fixture.content + " :deep(li > :first-child)"),
      /margin-top:\s*0;/,
      fixture.name,
    );
    assert.match(
      rule(fixture.style, fixture.content + " :deep(li > figure:last-child)"),
      /margin-bottom:\s*0\.5rem;/,
      fixture.name,
    );
    assert.match(
      rule(fixture.style, fixture.content + " :deep(ul:first-child)"),
      /margin-top:\s*0;/,
      fixture.name,
    );
    assert.match(
      rule(fixture.style, fixture.content + " :deep(ul:last-child)"),
      /margin-bottom:\s*0;/,
      fixture.name,
    );
    assert.match(
      rule(
        fixture.style,
        fixture.content + ":not(.is-block-editor-child) :deep(> ul:first-child)",
      ),
      /margin-top:\s*0\.8em;/,
      fixture.name,
    );

    const horizontalRule = rule(fixture.style, `${fixture.content} :deep(hr)`);
    assert.match(horizontalRule, /height:\s*2px;/, fixture.name);
    assert.match(horizontalRule, /background:\s*var\(--markdown-horizontal-rule\);/, fixture.name);
    assert.match(horizontalRule, /margin:\s*16px 0;/, fixture.name);

    const table = rule(fixture.style, `${fixture.content} :deep(table)`);
    assert.match(table, /margin:\s*0\.8em 0;/, fixture.name);
    assert.match(table, /word-break:\s*initial;/, fixture.name);

    const tableHeader = rule(fixture.style, `${fixture.content} :deep(th)`);
    assert.match(tableHeader, /border-bottom:\s*0;/, fixture.name);
    assert.match(tableHeader, /padding:\s*6px 13px;/, fixture.name);

    const tableCell = rule(fixture.style, `${fixture.content} :deep(td)`);
    assert.match(tableCell, /border:\s*1px solid var\(--markdown-border\);/, fixture.name);
    assert.match(tableCell, /min-width:\s*32px;/, fixture.name);
    assert.match(tableCell, /padding:\s*6px 13px;/, fixture.name);
    assert.match(
      fixture.style,
      /:deep\(table tr:nth-child\(2n\)\),[\s\S]{0,100}:deep\(thead\)\s*\{\s*background:\s*#f8f8f8;/,
      fixture.name,
    );

    const unorderedTask = rule(fixture.style, `${fixture.content} :deep(ul > .task-list-item)`);
    assert.match(unorderedTask, /list-style:\s*none;/, fixture.name);
    assert.doesNotMatch(fixture.style, /:deep\(\.task-list-item\)\s*\{[^}]*list-style:\s*none;/, fixture.name);

    assert.match(
      rule(fixture.style, `${fixture.content} :deep(li)`),
      /position:\s*relative;/,
      fixture.name,
    );
    const taskCheckbox = rule(fixture.style, `${fixture.content} :deep(.task-list-item-checkbox)`);
    assert.match(taskCheckbox, /position:\s*absolute;/, fixture.name);
    assert.match(taskCheckbox, /top:\s*0;/, fixture.name);
    assert.match(taskCheckbox, /left:\s*0;/, fixture.name);
    assert.match(taskCheckbox, /width:\s*auto;/, fixture.name);
    assert.match(taskCheckbox, /height:\s*auto;/, fixture.name);
    assert.match(taskCheckbox, /margin-left:\s*-1\.3em;/, fixture.name);
    assert.match(taskCheckbox, /margin-top:\s*calc\(1em - 10px\);/, fixture.name);
    assert.match(taskCheckbox, /border:\s*none;/, fixture.name);
    assert.match(taskCheckbox, /cursor:\s*pointer;/, fixture.name);

    const image = rule(fixture.style, fixture.content + " :deep(img)");
    assert.doesNotMatch(image, /height:\s*auto;/, fixture.name);
    assert.match(
      rule(fixture.style, fixture.content + " :deep(img:not([height]))"),
      /height:\s*auto;/,
      fixture.name,
    );
  }

  assert.match(rule(visualTableStyle, "th, td"), /min-width:\s*32px;/);

  const continuousTeletype = rule(
    continuousStyle,
    ":deep(.cm-rendered-inline-html tt)",
  );
  assert.match(continuousTeletype, /border:\s*1px solid #e7eaed;/);
  assert.match(continuousTeletype, /background:\s*#f3f4f4;/);
  assert.match(continuousTeletype, /font-size:\s*0\.9em;/);
  assert.match(continuousTeletype, /padding:\s*0 2px;/);
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview-html h1 tt)"),
    /font-size:\s*inherit;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview li > figure:last-child)"),
    /margin-bottom:\s*0\.5rem;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview-html ul:first-child)"),
    /margin-top:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview-html ul:last-child)"),
    /margin-bottom:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview td)"),
    /min-width:\s*32px;/,
  );
  const continuousImage = rule(continuousStyle, ":deep(.cm-special-preview img)");
  assert.doesNotMatch(continuousImage, /height:\s*auto;/);
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview img:not([height]))"),
    /height:\s*auto;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview .toc-inline)"),
    /min-height:\s*3\.58rem;/,
  );
});

test("暗色主题 Front Matter 使用主题背景", () => {
  for (const fixture of fixtures) {
    const frontmatter = rule(fixture.style, `${fixture.content} :deep(.frontmatter-block)`);
    assert.match(frontmatter, /background:\s*#f7f7f7;/, fixture.name);
    assert.match(frontmatter, /min-height:\s*0\.8rem;/, fixture.name);
    assert.match(
      rule(fixture.style, fixture.content + " :deep(.toc-inline)"),
      /min-height:\s*3\.58rem;/,
      fixture.name,
    );

    const darkFrontmatter = rule(
      fixture.style,
      `:global([data-theme="dark"] ${fixture.content} .frontmatter-block)`,
    );
    assert.match(darkFrontmatter, /background:\s*var\(--panel-subtle\);/, fixture.name);
  }
});

test("连续正文路径使用同一套 Typora 排版指标", () => {
  assert.match(rule(continuousStyle, ":deep(.cm-scroller)"), /line-height:\s*1\.6;/);
  const line = rule(continuousStyle, ":deep(.cm-line)");
  assert.match(line, /min-height:\s*1\.6em;/);
  assert.match(line, /padding:\s*0;/);
  assert.doesNotMatch(line, /transition:/);
  const headingGap = rule(
    continuousStyle,
    ":deep(.cm-line.cm-heading-gap:not(.cm-active-markdown-line))",
  );
  assert.match(headingGap, /min-height:\s*1px;/);
  assert.match(headingGap, /height:\s*1px;/);
  assert.match(headingGap, /line-height:\s*1px;/);

  const headingSizes = ["2.25em", "1.75em", "1.5em", "1.25em"];
  headingSizes.forEach((fontSize, index) => {
    assert.match(
      rule(continuousStyle, `:deep(.cm-heading-${index + 1})`),
      new RegExp(`font-size:\\s*${fontSize.replace(".", "\\.")};`),
    );
  });
  assert.match(rule(continuousStyle, ":deep(.cm-heading-6)"), /color:\s*var\(--markdown-muted\);/);

  const inlineCode = rule(continuousStyle, ":deep(.cm-rendered-inline-code)");
  assert.match(inlineCode, /border-radius:\s*3px;/);
  assert.match(inlineCode, /background:\s*#f3f4f4;/);
  assert.match(inlineCode, /font-size:\s*0\.9em;/);
  assert.match(inlineCode, /padding:\s*0 2px;/);

  const quote = rule(continuousStyle, ":deep(.cm-blockquote)");
  assert.match(quote, /background-color:\s*color-mix\(in srgb, var\(--panel-subtle\) 40%, var\(--panel\)\);/);
  assert.match(quote, /background-image:\s*repeating-linear-gradient/);
  assert.match(quote, /padding-left:\s*var\(--blockquote-indent, 15px\);/);
  assert.match(quote, /padding-right:\s*0;/);

  const topLevelQuote = rule(continuousStyle, ":deep(.cm-blockquote-depth-1)");
  assert.match(topLevelQuote, /--container-content-end:\s*15px;/);
  assert.match(topLevelQuote, /padding-right:\s*15px;/);

  const headingRule = rule(
    continuousStyle,
    ":deep(.cm-heading-1:not(.cm-setext-heading-line))::after,\n:deep(.cm-heading-2:not(.cm-setext-heading-line))::after,\n:deep(.cm-setext-heading-last)::after",
  );
  assert.match(headingRule, /inset-inline-end:\s*var\(--container-content-end, 0\);/);

  assert.match(
    rule(continuousStyle, ":deep(.cm-heading + .cm-heading)"),
    /padding-top:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-heading + .cm-heading-gap + .cm-heading),\n:deep(.cm-setext-marker + .cm-heading-gap + .cm-heading)"),
    /padding-top:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-blockquote.cm-list-continuation)"),
    /padding-left:\s*calc\([\s\S]*var\(--blockquote-indent, 15px\)[\s\S]*var\(--list-continuation-indent, 30px\)[\s\S]*\);/,
  );
  const listRawBlock = rule(continuousStyle, ":deep(.cm-list-raw-block)");
  assert.match(listRawBlock, /box-sizing:\s*border-box;/);
  assert.match(listRawBlock, /width:\s*calc\(100% - var\(--raw-list-indent, 30px\)\);/);
  assert.match(listRawBlock, /margin-left:\s*var\(--raw-list-indent, 30px\);/);
  const listPreview = rule(continuousStyle, ":deep(.cm-preview-list-container)");
  assert.match(listPreview, /margin-left:\s*var\(--preview-list-indent, 30px\);/);
  const previewQuote = rule(continuousStyle, ":deep(.cm-preview-quote-container)");
  assert.match(previewQuote, /padding-left:\s*var\(--preview-quote-indent, 15px\);/);
  assert.match(previewQuote, /padding-right:\s*var\(--preview-quote-end, 0\);/);
  const htmlQuote = rule(continuousStyle, ":deep(.cm-special-preview-html blockquote)");
  assert.match(htmlQuote, /background:\s*color-mix\(in srgb, var\(--panel-subtle\) 40%, var\(--panel\)\);/);

  const codeSource = rule(continuousStyle, ":deep(.cm-code),\n:deep(.cm-code-fence)");
  assert.match(codeSource, /line-height:\s*1\.5;/);

  const mathSource = rule(continuousStyle, ":deep(.cm-math),\n:deep(.cm-math-fence)");
  assert.match(mathSource, /background-color:\s*var\(--panel-subtle\);/);
  assert.match(mathSource, /font-family:\s*"Lucida Console", Consolas, "Courier", monospace;/);
  assert.match(mathSource, /font-size:\s*1em;/);
  assert.match(mathSource, /line-height:\s*1\.6;/);
  assert.match(mathSource, /text-align:\s*left;/);
  assert.match(
    rule(continuousStyle, ":deep(.cm-raw-block-math)"),
    /--raw-block-border:\s*var\(--border\);/,
  );
  const activeCodeMathSource = rule(
    continuousStyle,
    ":deep(.cm-active-raw-block.cm-raw-block-code),\n:deep(.cm-active-raw-block.cm-raw-block-math)",
  );
  assert.match(activeCodeMathSource, /box-sizing:\s*border-box;/);
  assert.match(
    activeCodeMathSource,
    /padding-right:\s*calc\(var\(--container-content-end, 0px\) \+ 8px\);/,
  );
  assert.match(
    activeCodeMathSource,
    /padding-left:\s*calc\(var\(--blockquote-indent, 0px\) \+ 8px\);/,
  );

  const hiddenRawFence = rule(
    continuousStyle,
    ":deep(.cm-active-raw-fence-hidden:not(.cm-active-raw-empty-input))",
  );
  assert.match(hiddenRawFence, /height:\s*0;/);
  assert.match(hiddenRawFence, /min-height:\s*0;/);
  assert.match(hiddenRawFence, /padding-top:\s*0;/);
  assert.match(hiddenRawFence, /padding-bottom:\s*0;/);
  assert.match(hiddenRawFence, /box-shadow:\s*none;/);
  assert.match(
    rule(continuousStyle, ":deep(.cm-active-raw-content-first)"),
    /inset 0 1px var\(--raw-block-border\);[\s\S]*padding-top:\s*0\.28rem;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-active-raw-content-last)"),
    /inset 0 -1px var\(--raw-block-border\);[\s\S]*padding-bottom:\s*0\.28rem;/,
  );
  const activeLanguage = rule(
    continuousStyle,
    ":deep(.cm-active-code-language-widget .code-fence-language-selector)",
  );
  const activeCodeFirst = rule(
    continuousStyle,
    ":deep(.cm-raw-block-code.cm-active-raw-content-first)",
  );
  assert.match(activeCodeFirst, /padding-top:\s*8px;/);
  assert.match(activeCodeFirst, /line-height:\s*1\.5;/);
  const activeCodeLast = rule(
    continuousStyle,
    ":deep(.cm-raw-block-code.cm-active-raw-content-last)",
  );
  assert.match(activeCodeLast, /padding-bottom:\s*8px;/);
  assert.match(activeCodeLast, /line-height:\s*1\.5;/);
  const activeCodeEmpty = rule(
    continuousStyle,
    ":deep(.cm-raw-block-code.cm-active-raw-empty-input)",
  );
  assert.match(activeCodeEmpty, /min-height:\s*1\.5em;/);
  assert.match(activeCodeEmpty, /padding-top:\s*8px;[\s\S]*padding-bottom:\s*8px;/);
  assert.match(activeLanguage, /position:\s*absolute;/);
  assert.match(activeLanguage, /bottom:\s*4px;/);
  assert.doesNotMatch(activeLanguage, /(?:^|\s)top:/);

  const taskCheckbox = rule(continuousStyle, ":deep(.cm-rendered-task-marker input)");
  assert.match(taskCheckbox, /width:\s*auto;/);
  assert.match(taskCheckbox, /height:\s*auto;/);
  assert.match(taskCheckbox, /margin:\s*0;/);

  const frontmatter = rule(continuousStyle, ":deep(.cm-frontmatter)");
  assert.match(frontmatter, /font-size:\s*0\.85em;/);
  assert.match(frontmatter, /line-height:\s*1\.45;/);
  assert.match(rule(continuousStyle, ":deep(.cm-frontmatter-content-only)"), /padding-top:\s*1rem;[\s\S]*padding-bottom:\s*1rem;/);

  const horizontalRule = rule(
    continuousStyle,
    ":deep(.cm-horizontal-rule:not(.cm-active-markdown-line))",
  );
  assert.match(horizontalRule, /min-height:\s*34px;/);
  assert.match(horizontalRule, /height:\s*34px;/);
  assert.doesNotMatch(horizontalRule, /(?:^|\s)(?:border|background|padding):/);

  const horizontalRuleLine = rule(
    continuousStyle,
    ":deep(.cm-horizontal-rule:not(.cm-active-markdown-line):not(.cm-list-thematic-break))::after",
  );
  assert.match(horizontalRuleLine, /top:\s*16px;/);
  assert.match(horizontalRuleLine, /height:\s*2px;/);
  assert.match(horizontalRuleLine, /background:\s*var\(--markdown-horizontal-rule\);/);
  assert.match(horizontalRuleLine, /inset-inline-start:\s*var\(--container-content-start, 0\);/);

  const activeHorizontalRule = rule(
    continuousStyle,
    ":deep(.cm-horizontal-rule.cm-active-markdown-line)",
  );
  assert.match(activeHorizontalRule, /min-height:\s*1\.6em;/);
  assert.match(activeHorizontalRule, /height:\s*auto;/);
  assert.match(activeHorizontalRule, /overflow:\s*visible;/);
  assert.match(activeHorizontalRule, /line-height:\s*inherit;/);
  assert.doesNotMatch(activeHorizontalRule, /(?:^|\s)(?:border|background|padding):/);

  assert.match(rule(continuousStyle, ":deep(.cm-blockquote-margin-before)"), /margin-top:\s*0\.8em;/);
  assert.match(rule(continuousStyle, ":deep(.cm-blockquote-margin-after)"), /margin-bottom:\s*0\.8em;/);
  assert.match(
    rule(continuousStyle, ":deep(.cm-blockquote-gap:not(.cm-active-markdown-line))"),
    /height:\s*0\.8em;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-list-gap:not(.cm-active-markdown-line))"),
    /height:\s*0\.5rem;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-rendered-list-marker)"),
    /color:\s*var\(--markdown-text\);/,
  );
  assert.match(continuousStyle, /:deep\(\.cm-special-preview-html h1\),[\s\S]{0,360}white-space:\s*pre-wrap;/);
  assert.match(continuousStyle, /:deep\(\.cm-special-preview-html h1 code\),[\s\S]{0,360}font-size:\s*inherit;/);
  assert.match(
    rule(continuousStyle, ":deep(.cm-list-thematic-break:not(.cm-active-markdown-line))"),
    /height:\s*34px;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-list-thematic-break:not(.cm-horizontal-rule):not(.cm-active-markdown-line))"),
    /height:\s*18px;/,
  );
  assert.match(rule(continuousStyle, ":deep(.cm-rendered-list-thematic-break)"), /height:\s*2px;/);

  assert.match(
    continuousStyle,
    /:deep\(\.cm-special-preview \.md-alert > p:not\(\.md-alert-title\)\),[\s\S]{0,180}margin:\s*0\.8em 0;/,
  );
  assert.match(
    continuousStyle,
    /:deep\(\.cm-special-preview \.md-alert > ul\),[\s\S]{0,120}padding-left:\s*30px;/,
  );
});

test("Active math source and preview share one continuous container", () => {
  const delimitedSourceClosing = rule(
    continuousStyle,
    ":deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-raw-block-last.cm-active-raw-block:not(.cm-active-raw-fence-hidden))",
  );
  assert.match(delimitedSourceClosing, /border-radius:\s*0;/);
  assert.doesNotMatch(delimitedSourceClosing, /inset 0 -1px/);

  const fencedSourceClosing = rule(
    continuousStyle,
    ":deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-active-raw-content-last)",
  );
  assert.match(fencedSourceClosing, /border-radius:\s*0;/);
  assert.doesNotMatch(fencedSourceClosing, /inset 0 -1px/);

  const singleLineFencedSource = rule(
    continuousStyle,
    ":deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-active-raw-content-first.cm-active-raw-content-last)",
  );
  assert.match(singleLineFencedSource, /border-radius:\s*4px 4px 0 0;/);
  assert.match(singleLineFencedSource, /inset 0 1px var\(--raw-block-border\);/);
  assert.doesNotMatch(singleLineFencedSource, /inset 0 -1px/);

  const emptyFencedSource = rule(
    continuousStyle,
    ":deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-active-raw-empty-input)",
  );
  assert.match(emptyFencedSource, /border-radius:\s*4px 4px 0 0;/);
  assert.match(emptyFencedSource, /inset 0 1px var\(--raw-block-border\);/);
  assert.doesNotMatch(emptyFencedSource, /inset 0 -1px/);

  const preview = rule(continuousStyle, ":deep(.cm-active-math-preview)");
  assert.match(preview, /box-sizing:\s*border-box;/);
  assert.match(preview, /border:\s*1px solid var\(--border\);/);
  assert.match(preview, /border-top:\s*0;/);
  assert.match(preview, /border-radius:\s*0 0 4px 4px;/);
  assert.match(preview, /background:\s*var\(--panel\);/);
  assert.match(preview, /margin-top:\s*0;/);
  assert.match(preview, /margin-bottom:\s*0;/);
});

test("Adjacent rendered blocks collapse the smaller Typora edge spacing", () => {
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-before.cm-special-preview-code)"),
    /padding-top:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-after.cm-special-preview-code)"),
    /padding-bottom:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-before.cm-visual-table-widget .visual-table-editor)"),
    /padding-top:\s*1px;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-after.cm-visual-table-widget .visual-table-editor)"),
    /padding-bottom:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-before.cm-visual-table-widget .table-tools)"),
    /top:\s*1px;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-before.cm-special-preview-math .math-block)"),
    /margin-top:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-after.cm-special-preview-math .math-block)"),
    /margin-bottom:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-before.cm-special-preview-diagram .diagram-box)"),
    /margin-top:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-before.cm-special-preview-image)"),
    /margin-top:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-before.cm-special-preview-html .cm-html-spacing-boundary-before)"),
    /margin-top:\s*0(?:\s*!important)?;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-after.cm-special-preview-html .cm-html-spacing-boundary-after)"),
    /margin-bottom:\s*0(?:\s*!important)?;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-preview-collapse-after.cm-special-preview-toc .toc-inline)"),
    /padding-bottom:\s*0;/,
  );

  assert.doesNotMatch(
    continuousStyle,
    /\.cm-special-preview-code \.cm-code-language-mount/,
  );
});


test("Block gaps preserve zero-margin HTML and collapse owned or quoted spacing", () => {
  assert.match(
    rule(continuousStyle, ":deep(.cm-line.cm-block-gap:not(.cm-active-markdown-line))"),
    /height:\s*0\.8em;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-line.cm-spacing-collapsed-gap:not(.cm-active-markdown-line))"),
    /height:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-heading.cm-spacing-collapse-before)"),
    /padding-top:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-heading.cm-spacing-collapse-after)"),
    /padding-bottom:\s*var\(--heading-rule-text-gap\);/,
  );
  assert.doesNotMatch(
    continuousStyle,
    /cm-block-gap:not\(\.cm-active-markdown-line\):has\(\+ \.cm-special-preview\)\)/,
  );

  assert.match(
    rule(
      continuousStyle,
      ":deep(.cm-line.cm-blockquote-gap:not(.cm-active-markdown-line):has(+ .cm-horizontal-rule))",
    ),
    /height:\s*0;/,
  );
  assert.match(
    rule(
      continuousStyle,
      ":deep(.cm-horizontal-rule + .cm-line.cm-blockquote-gap:not(.cm-active-markdown-line))",
    ),
    /height:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-blockquote-margin-after:has(+ .cm-horizontal-rule))"),
    /margin-bottom:\s*0;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-horizontal-rule + .cm-blockquote-margin-before)"),
    /margin-top:\s*0;/,
  );
});
test("GitHub Alert title icons stay aligned across rendered paths", () => {
  const iconProperties = [
    "width: 1em;",
    "height: 1em;",
    "fill: currentColor;",
    "margin-right: 1ch;",
    "overflow: visible;",
    "position: relative;",
    "top: 0.125em;",
  ];

  for (const fixture of fixtures) {
    const title = rule(fixture.style, fixture.content + " :deep(.md-alert-title)");
    assert.ok(title.includes("font-size: 0.9rem;"), fixture.name);

    const icon = rule(
      fixture.style,
      fixture.content + " :deep(.md-alert-title .md-alert-icon)",
    );
    iconProperties.forEach((property) => assert.ok(icon.includes(property), fixture.name));
  }

  const continuousTitle = rule(
    continuousStyle,
    ":deep(.cm-special-preview .md-alert-title)",
  );
  assert.ok(continuousTitle.includes("font-size: 0.9rem;"));
  const continuousIcon = rule(
    continuousStyle,
    ":deep(.cm-special-preview .md-alert-title .md-alert-icon)",
  );
  iconProperties.forEach((property) => assert.ok(continuousIcon.includes(property)));
});

test("Rendered paths keep effective table, image and inline metrics aligned", () => {
  for (const fixture of fixtures) {
    const tableFigure = rule(fixture.style, `${fixture.content} :deep(figure.table-figure)`);
    assert.match(tableFigure, /margin:\s*1\.2em 0;/, fixture.name);

    const image = rule(fixture.style, `${fixture.content} :deep(img)`);
    assert.match(image, /border-radius:\s*0;/, fixture.name);

    const definitionTerm = rule(fixture.style, `${fixture.content} :deep(dt)`);
    assert.match(definitionTerm, /font-weight:\s*400;/, fixture.name);

    const abbreviation = rule(fixture.style, `${fixture.content} :deep(abbr[title])`);
    assert.match(abbreviation, /text-decoration:\s*underline dotted;/, fixture.name);
    assert.doesNotMatch(abbreviation, /text-underline-offset/, fixture.name);

    const numberedCode = rule(fixture.style, `${fixture.content} :deep(pre.code-with-line-numbers)`);
    assert.match(numberedCode, /display:\s*grid;/, fixture.name);
    assert.match(numberedCode, /grid-template-columns:\s*auto minmax\(0, 1fr\);/, fixture.name);
    assert.match(numberedCode, /column-gap:\s*0\.85rem;/, fixture.name);

    const codeBlock = rule(fixture.style, `${fixture.content} :deep(pre)`);
    assert.match(codeBlock, /line-height:\s*1\.5;/, fixture.name);
    const lineNumbers = rule(fixture.style, `${fixture.content} :deep(pre.code-with-line-numbers::before)`);
    assert.match(lineNumbers, /content:\s*attr\(data-line-numbers\);/, fixture.name);
    assert.match(lineNumbers, /line-height:\s*inherit;/, fixture.name);
    assert.match(lineNumbers, /padding-right:\s*0\.72rem;/, fixture.name);
  }

  const continuousTableFigure = rule(
    continuousStyle,
    ":deep(.cm-special-preview figure.table-figure)",
  );
  assert.match(continuousTableFigure, /margin:\s*1\.2em 0;/);
  assert.match(rule(continuousStyle, ":deep(.cm-rendered-inline-image img)"), /border-radius:\s*0;/);
  assert.match(rule(continuousStyle, ":deep(.cm-rendered-inline-html img)"), /border-radius:\s*0;/);
  assert.match(rule(continuousStyle, ":deep(.cm-special-preview img)"), /border-radius:\s*0;/);
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview-definition dt)"),
    /font-weight:\s*400;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-rendered-abbreviation)"),
    /text-decoration:\s*underline dotted;/,
  );

  const continuousNumberedCode = rule(
    continuousStyle,
    ":deep(.cm-special-preview pre.code-with-line-numbers)",
  );
  assert.match(continuousNumberedCode, /column-gap:\s*0\.85rem;/);
  const continuousCodeBlock = rule(continuousStyle, ":deep(.cm-special-preview pre)");
  assert.match(continuousCodeBlock, /line-height:\s*1\.5;/);
  assert.match(continuousCodeBlock, /padding:\s*8px 4px 6px;/);
  const continuousLineNumbers = rule(
    continuousStyle,
    ":deep(.cm-special-preview pre.code-with-line-numbers::before)",
  );
  assert.match(continuousLineNumbers, /line-height:\s*inherit;/);
  assert.match(continuousLineNumbers, /padding-right:\s*0\.72rem;/);

  const richDarkCode = rule(
    fixtures[1]!.style,
    ':global(:root[data-theme="dark"] .rich-markdown-block pre code)',
  );
  assert.match(richDarkCode, /border:\s*0;/);
  assert.match(richDarkCode, /background:\s*transparent;/);
});

test("Rendered paths keep generic figures, wrapped pre blocks and raw block spacing aligned", () => {
  for (const fixture of fixtures) {
    const figure = rule(fixture.style, `${fixture.content} :deep(figure:not(.table-figure))`);
    assert.match(figure, /overflow-x:\s*auto;/, fixture.name);
    assert.match(figure, /max-width:\s*calc\(100% \+ 16px\);/, fixture.name);
    assert.match(figure, /margin:\s*1\.2em 0;/, fixture.name);

    const wrappedPre = rule(fixture.style, `${fixture.content}.wrap-code-blocks :deep(pre)`);
    assert.match(wrappedPre, /overflow-wrap:\s*anywhere;/, fixture.name);
    assert.match(wrappedPre, /white-space:\s*pre-wrap;/, fixture.name);
  }

  const figure = rule(continuousStyle, ":deep(.cm-special-preview figure:not(.table-figure))");
  assert.match(figure, /overflow-x:\s*auto;/);
  assert.match(figure, /max-width:\s*calc\(100% \+ 16px\);/);
  assert.match(figure, /margin:\s*1\.2em 0;/);

  const wrappedPre = rule(continuousStyle, ".wrap-code-blocks :deep(.cm-special-preview pre)");
  assert.match(wrappedPre, /overflow-wrap:\s*anywhere;/);
  assert.match(wrappedPre, /white-space:\s*pre-wrap;/);


  assert.match(rule(continuousStyle, ":deep(.cm-special-preview pre)"), /margin:\s*0;/);
  const continuousCodePreview = rule(continuousStyle, ":deep(.cm-special-preview-code)");
  assert.match(continuousCodePreview, /padding-top:\s*15px;/);
  assert.match(continuousCodePreview, /padding-bottom:\s*15px;/);
  assert.match(continuousCodePreview, /white-space:\s*normal;/);
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview-html)"),
    /display:\s*flow-root;/,
  );
  assert.match(
    rule(continuousStyle, ":deep(.cm-special-preview-html pre)"),
    /margin:\s*15px 0;/,
  );
  assert.match(
    continuousStyle,
    /:deep\(\.cm-special-preview-html p\),[\s\S]{0,180}margin:\s*0\.8em 0;/,
  );
});

function readScopedStyle(path: string): string {
  const source = readFileSync(resolve(path), "utf8");
  const match = source.match(/<style scoped>([\s\S]*?)<\/style>/);
  assert.ok(match, `${path} should contain a scoped style block`);
  return match[1] ?? "";
}

function rule(source: string, selector: string): string {
  return getEffectiveCssRule(source, selector);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  alignMarkdownTable,
  adjustHeadingLevel,
  applyDefaultCodeLanguageOnFenceKey,
  applyMarkdownSpaceShortcut,
  applyAutoPair,
  editMarkdownFrontMatterOnEnter,
  clearMarkdownFormatting,
  continueMarkdownBlock,
  continueMarkdownList,
  deleteCurrentParagraph,
  deleteCurrentSentence,
  deleteCurrentStyleScope,
  deleteCurrentWord,
  deleteMarkdownTable,
  deleteMarkdownLines,
  deleteMarkdownTablePart,
  duplicateMarkdownLines,
  editMarkdownTable,
  formatMarkdownCodeBlock,
  formatMarkdownMathBlock,
  formatMarkdownLines,
  getSelectedMarkdownHtml,
  getSelectedMarkdownSource,
  getPlainTextFromMarkdownSelection,
  getSelectAllTarget,
  projectMarkdownSelectionSemantics,
  insertMarkdownCalloutTemplate,
  insertMarkdownDiagramTemplate,
  insertMarkdownFootnoteTemplate,
  insertMarkdownHorizontalRule,
  insertMarkdownImageSelection,
  insertMarkdownLinkSelection,
  insertMarkdownAtSelection,
  insertMarkdownSoftBreak,
  insertMarkdownTableTemplate,
  insertMarkdownTableColumn,
  insertMarkdownTableRow,
  insertMarkdownTocTemplate,
  moveMarkdownLines,
  moveMarkdownBlocks,
  moveMarkdownTableColumn,
  moveMarkdownTableRow,
  navigateMarkdownTableCell,
  outdentMarkdownListOnBackspace,
  pasteMarkdownContent,
  pasteMarkdownText,
  pastePlainMarkdownText,
  prefixNumberedMarkdownLines,
  prefixMarkdownLines,
  removeAutoPairOnBackspace,
  selectCurrentLine,
  selectCurrentParagraph,
  selectCurrentSentence,
  selectCurrentStyleScope,
  selectCurrentWord,
  selectMarkdownTablePart,
  setHeadingLevel,
  setImageWidthInLine,
  setParagraphText,
  splitMarkdownParagraphOnEnter,
  splitMarkdownContainerParagraphOnPrimaryEnter,
  splitTableRow,
  toggleMarkdownInlineStyle,
  toggleMarkdownTaskByOrder,
  toggleTaskAtSelection,
  unwrapMarkdownBlockOnBackspace,
  wrapHtmlCommentSelection,
  wrapMarkdownSelection,
} from "../src/utils/editorCommands";
import type { EditorSettings } from "../src/types";
import { defaultEditorSettings } from "../src/utils/editorSettings";

const defaultSettings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

function assertOnlyCrlfLineBreaks(value: string): void {
  assert.equal(value.replace(/\r\n/g, "").includes("\n"), false);
}

test("wrapMarkdownSelection wraps selection and keeps text selected", () => {
  const result = wrapMarkdownSelection(
    { value: "hello world", selectionStart: 6, selectionEnd: 11 },
    "**",
    "**",
  );

  assert.equal(result.value, "hello **world**");
  assert.equal(result.selectionStart, 8);
  assert.equal(result.selectionEnd, 13);
});

test("getSelectAllTarget selects the whole document like Typora", () => {
  assert.deepEqual(getSelectAllTarget(false, 18, 5), {
    sourceModeRequired: true,
    selectionStart: 0,
    selectionEnd: 18,
  });

  assert.deepEqual(getSelectAllTarget(true, 18, 18), {
    sourceModeRequired: false,
    selectionStart: 0,
    selectionEnd: 18,
  });
});

test("getSelectedMarkdownSource copies Markdown source from active selections", () => {
  const source = "# Title\n\nParagraph with **bold** text";
  const active = "Paragraph with **bold** text";
  const start = source.indexOf("Paragraph");

  assert.equal(
    getSelectedMarkdownSource(false, source, active, start, active.indexOf("**bold**"), active.indexOf(" text")),
    "**bold**",
  );
  assert.equal(
    getSelectedMarkdownSource(true, source, source, 0, source.indexOf("Paragraph"), source.length),
    "Paragraph with **bold** text",
  );
});

test("getSelectedMarkdownHtml copies rendered HTML from the selected Markdown like Typora", () => {
  const source = "# Title\n\nRead [docs][d] with **bold** and note[^1].\n\n[d]: https://example.com\n[^1]: detail";
  const active = "Read [docs][d] with **bold** and note[^1].";
  const start = source.indexOf("Read");
  const html = getSelectedMarkdownHtml(false, source, active, start, 0, active.length, defaultSettings);

  assert.match(html, /<p>Read <a href="https:\/\/example\.com"[^>]*>docs<\/a> with <strong>bold<\/strong> and note/);
  assert.match(html, /footnote-ref/);
  assert.match(html, /detail/);
  assert.doesNotMatch(html, /<h1/);
});

test("projectMarkdownSelectionSemantics keeps partial inline semantics self-contained", () => {
  const cases = [
    {
      source: "before **bold** after",
      selected: "bold",
      markdown: "**bold**",
    },
    {
      source: "before *italic* after",
      selected: "italic",
      markdown: "*italic*",
    },
    {
      source: "**outer *inner* tail**",
      selected: "inner",
      markdown: "***inner***",
    },
    {
      source: "before `code` after",
      selected: "code",
      markdown: "`code`",
    },
    {
      source: "before ==marked== after",
      selected: "marked",
      markdown: "==marked==",
    },
    {
      source: "before <u>under</u> after",
      selected: "under",
      markdown: "<u>under</u>",
    },
    {
      source: "before [docs](https://example.com) after",
      selected: "docs",
      markdown: "[docs](https://example.com)",
    },
  ];

  for (const current of cases) {
    const start = current.source.indexOf(current.selected);
    assert.deepEqual(
      projectMarkdownSelectionSemantics(
        current.source,
        start,
        start + current.selected.length,
      ),
      {
        source: current.selected,
        markdown: current.markdown,
        plainText: current.selected,
      },
    );
  }
});

test("projectMarkdownSelectionSemantics resolves partial reference labels and preserves source-mode text", () => {
  const source = "Read [docs][guide].\n\n[guide]: https://example.com \"Guide\"";
  const start = source.indexOf("docs");
  assert.equal(
    projectMarkdownSelectionSemantics(source, start, start + 4).markdown,
    "[docs](https://example.com \"Guide\")",
  );
  assert.deepEqual(
    projectMarkdownSelectionSemantics(source, start, start + 4, {
      preserveInlineSemantics: false,
    }),
    {
      source: "docs",
      markdown: "docs",
      plainText: "docs",
    },
  );
});

test("projectMarkdownSelectionSemantics leaves literal block selections unchanged", () => {
  const source = "~~~text\n==literal== <u>html</u>\n~~~";
  for (const selected of ["literal", "html"]) {
    const start = source.indexOf(selected);
    assert.equal(
      projectMarkdownSelectionSemantics(source, start, start + selected.length).markdown,
      selected,
    );
  }
});

test("projectMarkdownSelectionSemantics honors independent inline extension switches", () => {
  const cases = [
    { source: "==marked==", selected: "marked", option: "includeHighlight" as const },
    { source: "^raised^", selected: "raised", option: "includeSuperscript" as const },
    { source: "H~2~O", selected: "2", option: "includeSubscript" as const },
  ];

  for (const current of cases) {
    const start = current.source.indexOf(current.selected);
    const enabled = projectMarkdownSelectionSemantics(
      current.source,
      start,
      start + current.selected.length,
      { [current.option]: true },
    );
    const disabled = projectMarkdownSelectionSemantics(
      current.source,
      start,
      start + current.selected.length,
      { [current.option]: false },
    );
    assert.notEqual(enabled.markdown, current.selected, current.option);
    assert.equal(disabled.markdown, current.selected, current.option);
  }
});

test("getPlainTextFromMarkdownSelection copies readable text without Markdown syntax", () => {
  const markdown = [
    "# **Title**",
    "> [Docs](https://example.com) and `code`",
    "- [x] Task with ==mark==",
    "| Name | Age |",
    "| --- | ---: |",
    "| Ada | 36 |",
  ].join("\n");

  assert.equal(
    getPlainTextFromMarkdownSelection(markdown),
    "Title\nDocs and code\nTask with mark\nName | Age\nAda | 36",
  );
});

test("getPlainTextFromMarkdownSelection copies table rows as readable text like Typora", () => {
  const markdown = [
    "| **Name** | Note |",
    "| --- | :---: |",
    "| Ada | has `code` and A\\|B |",
    "",
    "---",
  ].join("\n");

  assert.equal(
    getPlainTextFromMarkdownSelection(markdown),
    "Name | Note\nAda | has code and A|B\n\n---",
  );
});

test("getPlainTextFromMarkdownSelection keeps escaped pipes inside quoted table cells", () => {
  const markdown = [
    "> | **Name** | Note |",
    "> | --- | --- |",
    "> | Ada | A\\|B |",
  ].join("\n");

  assert.equal(
    getPlainTextFromMarkdownSelection(markdown),
    "Name | Note\nAda | A|B",
  );
});

test("getPlainTextFromMarkdownSelection copies rendered inline semantics across lines", () => {
  const markdown = [
    "foo_bar_baz :smile: &copy; \\*literal\\*",
    "",
    "==highlight",
    "across lines==",
    "",
    "`code",
    "across lines`",
    "",
    "<u>HTML",
    "across lines</u>",
    "",
    "$$",
    "x_1 + y_2",
    "$$",
    "",
    "Use[^note].",
    "",
    "[^note]: detail",
  ].join("\n");

  assert.equal(
    getPlainTextFromMarkdownSelection(markdown),
    [
      "foo_bar_baz \u{1F604} © *literal*",
      "highlight",
      "across lines",
      "code across lines",
      "HTML",
      "across lines",
      "x_1 + y_2",
      "Use[1].",
      "detail",
    ].join("\n"),
  );
});

test("getPlainTextFromMarkdownSelection keeps fenced code contents literal", () => {
  const markdown = [
    "before",
    "",
    "```md",
    "  **literal** :smile: &copy;",
    "",
    "    kept",
    "```",
    "",
    "after",
  ].join("\n");

  assert.equal(
    getPlainTextFromMarkdownSelection(markdown),
    [
      "before",
      "  **literal** :smile: &copy;",
      "",
      "    kept",
      "",
      "after",
    ].join("\n"),
  );
});

test("wrapMarkdownSelection toggles matching inline wrappers off", () => {
  assert.deepEqual(
    wrapMarkdownSelection({ value: "hello **world**", selectionStart: 6, selectionEnd: 15 }, "**", "**"),
    { value: "hello world", selectionStart: 6, selectionEnd: 11 },
  );

  assert.deepEqual(
    wrapMarkdownSelection({ value: "`code`", selectionStart: 0, selectionEnd: 6 }, "`", "`"),
    { value: "code", selectionStart: 0, selectionEnd: 4 },
  );

  assert.deepEqual(
    wrapMarkdownSelection({ value: "", selectionStart: 0, selectionEnd: 0 }, "**", "**", "bold"),
    { value: "**bold**", selectionStart: 2, selectionEnd: 6 },
  );
});

test("wrapMarkdownSelection toggles wrappers around the selected text off", () => {
  assert.deepEqual(
    wrapMarkdownSelection({ value: "hello **world**", selectionStart: 8, selectionEnd: 13 }, "**", "**"),
    { value: "hello world", selectionStart: 6, selectionEnd: 11 },
  );

  assert.deepEqual(
    wrapMarkdownSelection({ value: "`code`", selectionStart: 1, selectionEnd: 5 }, "`", "`"),
    { value: "code", selectionStart: 0, selectionEnd: 4 },
  );

  assert.deepEqual(
    wrapMarkdownSelection({ value: "<u>text</u>", selectionStart: 3, selectionEnd: 7 }, "<u>", "</u>"),
    { value: "text", selectionStart: 0, selectionEnd: 4 },
  );
});

test("wrapMarkdownSelection uses longer code spans for selected backticks like Typora", () => {
  assert.deepEqual(
    wrapMarkdownSelection({ value: "run `cmd` now", selectionStart: 0, selectionEnd: "run `cmd`".length }, "`", "`"),
    { value: "`` run `cmd` `` now", selectionStart: 3, selectionEnd: 12 },
  );

  assert.deepEqual(
    wrapMarkdownSelection({ value: "a`b", selectionStart: 0, selectionEnd: 3 }, "`", "`"),
    { value: "``a`b``", selectionStart: 2, selectionEnd: 5 },
  );

  assert.deepEqual(
    wrapMarkdownSelection({ value: "``a`b``", selectionStart: 2, selectionEnd: 5 }, "`", "`"),
    { value: "a`b", selectionStart: 0, selectionEnd: 3 },
  );

  assert.deepEqual(
    wrapMarkdownSelection({ value: "`` `cmd` ``", selectionStart: 3, selectionEnd: 8 }, "`", "`"),
    { value: "`cmd`", selectionStart: 0, selectionEnd: 5 },
  );
});

test("toggleMarkdownInlineStyle applies every supported Typora inline style", () => {
  const styles = [
    ["**", "**"],
    ["*", "*"],
    ["~~", "~~"],
    ["==", "=="],
    ["^", "^"],
    ["~", "~"],
    ["<u>", "</u>"],
    ["`", "`"],
  ] as const;

  for (const [opening, closing] of styles) {
    const source = "before target after";
    const start = source.indexOf("target");
    const result = toggleMarkdownInlineStyle(
      { value: source, selectionStart: start, selectionEnd: start + "target".length },
      opening,
      closing,
    );
    const expected = `before ${opening}target${closing} after`;
    assert.deepEqual(result, {
      value: expected,
      selectionStart: expected.indexOf("target"),
      selectionEnd: expected.indexOf("target") + "target".length,
    });
  }
});

test("toggleMarkdownInlineStyle removes every supported inline style", () => {
  const styles = [
    ["**", "**"],
    ["*", "*"],
    ["~~", "~~"],
    ["==", "=="],
    ["^", "^"],
    ["~", "~"],
    ["<u>", "</u>"],
    ["`", "`"],
  ] as const;

  for (const [opening, closing] of styles) {
    const source = `${opening}target${closing}`;
    assert.deepEqual(
      toggleMarkdownInlineStyle({
        value: source,
        selectionStart: opening.length,
        selectionEnd: opening.length + "target".length,
      }, opening, closing),
      { value: "target", selectionStart: 0, selectionEnd: "target".length },
    );
  }
});

test("toggleMarkdownInlineStyle removes semantic bold and italic aliases", () => {
  const bold = "A __bold__ word";
  assert.deepEqual(
    toggleMarkdownInlineStyle({
      value: bold,
      selectionStart: bold.indexOf("bold"),
      selectionEnd: bold.indexOf("bold") + "bold".length,
    }, "**", "**"),
    { value: "A bold word", selectionStart: 2, selectionEnd: 6 },
  );

  const italic = "A _slanted_ word";
  assert.deepEqual(
    toggleMarkdownInlineStyle({
      value: italic,
      selectionStart: italic.indexOf("slanted"),
      selectionEnd: italic.indexOf("slanted") + "slanted".length,
    }, "*", "*"),
    { value: "A slanted word", selectionStart: 2, selectionEnd: 9 },
  );
});

test("toggleMarkdownInlineStyle removes only the selected part of a formatted range", () => {
  const source = "**left middle right**";
  const start = source.indexOf("middle");
  assert.deepEqual(
    toggleMarkdownInlineStyle({
      value: source,
      selectionStart: start,
      selectionEnd: start + "middle".length,
    }, "**", "**"),
    {
      value: "**left** middle **right**",
      selectionStart: "**left** ".length,
      selectionEnd: "**left** middle".length,
    },
  );

  assert.deepEqual(
    toggleMarkdownInlineStyle({
      value: source,
      selectionStart: 0,
      selectionEnd: source.length,
    }, "**", "**"),
    { value: "left middle right", selectionStart: 0, selectionEnd: "left middle right".length },
  );
});

test("toggleMarkdownInlineStyle merges partial and separate matching ranges", () => {
  const partial = "**ready** plain";
  const partialStart = partial.indexOf("ready");
  const partialResult = toggleMarkdownInlineStyle({
    value: partial,
    selectionStart: partialStart,
    selectionEnd: partial.length,
  }, "**", "**");
  assert.deepEqual(partialResult, {
    value: "**ready plain**",
    selectionStart: 2,
    selectionEnd: "**ready plain".length,
  });

  const islands = "start **middle** and **last**";
  const islandsResult = toggleMarkdownInlineStyle({
    value: islands,
    selectionStart: 0,
    selectionEnd: islands.length,
  }, "**", "**");
  assert.deepEqual(islandsResult, {
    value: "**start middle and last**",
    selectionStart: 2,
    selectionEnd: "**start middle and last".length,
  });
});

test("toggleMarkdownInlineStyle formats paragraphs and headings with separate wrappers", () => {
  const paragraphs = "first paragraph\n\nsecond paragraph";
  const result = toggleMarkdownInlineStyle({
    value: paragraphs,
    selectionStart: 0,
    selectionEnd: paragraphs.length,
  }, "**", "**");
  assert.deepEqual(result, {
    value: "**first paragraph**\n\n**second paragraph**",
    selectionStart: 2,
    selectionEnd: "**first paragraph**\n\n**second paragraph".length,
  });

  const heading = "# Title\r\n\r\nBody";
  const headingResult = toggleMarkdownInlineStyle({
    value: heading,
    selectionStart: 0,
    selectionEnd: heading.length,
  }, "==", "==");
  assert.deepEqual(headingResult, {
    value: "# ==Title==\r\n\r\n==Body==",
    selectionStart: "# ==".length,
    selectionEnd: "# ==Title==\r\n\r\n==Body".length,
  });
  assertOnlyCrlfLineBreaks(headingResult?.value ?? "");
});

test("toggleMarkdownInlineStyle formats table cells without wrapping table syntax", () => {
  const source = "| A | B |\n| --- | --- |\n| x | y |";
  const result = toggleMarkdownInlineStyle({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  }, "**", "**");

  assert.deepEqual(result, {
    value: "| **A** | **B** |\n| --- | --- |\n| **x** | **y** |",
    selectionStart: "| **".length,
    selectionEnd: "| **A** | **B** |\n| --- | --- |\n| **x** | **y".length,
  });
});

test("toggleMarkdownInlineStyle creates reversible empty typing ranges", () => {
  const styles = [
    ["**", "**"],
    ["*", "*"],
    ["~~", "~~"],
    ["==", "=="],
    ["^", "^"],
    ["~", "~"],
    ["<u>", "</u>"],
    ["`", "`"],
  ] as const;

  for (const [opening, closing] of styles) {
    const enabled = toggleMarkdownInlineStyle(
      { value: "ab", selectionStart: 1, selectionEnd: 1 },
      opening,
      closing,
    );
    assert.deepEqual(enabled, {
      value: `a${opening}${closing}b`,
      selectionStart: 1 + opening.length,
      selectionEnd: 1 + opening.length,
    });
    assert.deepEqual(
      enabled && toggleMarkdownInlineStyle(enabled, opening, closing),
      { value: "ab", selectionStart: 1, selectionEnd: 1 },
    );
  }
});

test("toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position", () => {
  const examples = [
    { source: "**abcd**", cursor: 4, opening: "**", closing: "**", split: "**ab****cd**", next: 6 },
    { source: "*abcd*", cursor: 3, opening: "*", closing: "*", split: "*ab**cd*", next: 4 },
    { source: "~~abcd~~", cursor: 4, opening: "~~", closing: "~~", split: "~~ab~~~~cd~~", next: 6 },
    { source: "==abcd==", cursor: 4, opening: "==", closing: "==", split: "==ab====cd==", next: 6 },
    { source: "^abcd^", cursor: 3, opening: "^", closing: "^", split: "^ab^^cd^", next: 4 },
    { source: "~abcd~", cursor: 3, opening: "~", closing: "~", split: "~ab~~cd~", next: 4 },
    { source: "<u>abcd</u>", cursor: 5, opening: "<u>", closing: "</u>", split: "<u>ab</u><u>cd</u>", next: 9 },
    { source: "`abcd`", cursor: 3, opening: "`", closing: "`", split: "`ab``cd`", next: 4 },
  ] as const;

  for (const example of examples) {
    const split = toggleMarkdownInlineStyle({
      value: example.source,
      selectionStart: example.cursor,
      selectionEnd: example.cursor,
    }, example.opening, example.closing);
    assert.deepEqual(split, {
      value: example.split,
      selectionStart: example.next,
      selectionEnd: example.next,
    });
    assert.deepEqual(
      split && toggleMarkdownInlineStyle(split, example.opening, example.closing),
      { value: example.source, selectionStart: example.cursor, selectionEnd: example.cursor },
    );
  }
});

test("toggleMarkdownInlineStyle moves across an existing style boundary reversibly", () => {
  const source = "**bold**";
  const outside = toggleMarkdownInlineStyle({
    value: source,
    selectionStart: 2,
    selectionEnd: 2,
  }, "**", "**");
  assert.deepEqual(outside, { value: source, selectionStart: 0, selectionEnd: 0 });
  assert.deepEqual(
    outside && toggleMarkdownInlineStyle(outside, "**", "**"),
    { value: source, selectionStart: 2, selectionEnd: 2 },
  );
});

test("toggleMarkdownInlineStyle chooses a safe code span marker for literal backticks", () => {
  const source = "a`b";
  assert.deepEqual(
    toggleMarkdownInlineStyle({
      value: source,
      selectionStart: 0,
      selectionEnd: source.length,
    }, "`", "`"),
    { value: "``a`b``", selectionStart: 2, selectionEnd: 5 },
  );

  assert.deepEqual(
    toggleMarkdownInlineStyle({ value: "`", selectionStart: 0, selectionEnd: 1 }, "`", "`"),
    { value: "`` ` ``", selectionStart: 3, selectionEnd: 4 },
  );
  assert.deepEqual(
    toggleMarkdownInlineStyle({ value: "`` ` ``", selectionStart: 3, selectionEnd: 4 }, "`", "`"),
    { value: "`", selectionStart: 0, selectionEnd: 1 },
  );
});

test("toggleMarkdownInlineStyle never edits through another style marker", () => {
  const source = "**bold**";
  assert.equal(
    toggleMarkdownInlineStyle({ value: source, selectionStart: 1, selectionEnd: 1 }, "*", "*"),
    null,
  );

  const identifier = "snake_case";
  assert.deepEqual(
    toggleMarkdownInlineStyle({ value: identifier, selectionStart: 0, selectionEnd: identifier.length }, "*", "*"),
    { value: "*snake_case*", selectionStart: 1, selectionEnd: 11 },
  );

  const code = "`code`";
  assert.equal(
    toggleMarkdownInlineStyle({ value: code, selectionStart: 1, selectionEnd: 5 }, "**", "**"),
    null,
  );
  assert.equal(
    toggleMarkdownInlineStyle({ value: code, selectionStart: 3, selectionEnd: 3 }, "**", "**"),
    null,
  );
  assert.deepEqual(
    toggleMarkdownInlineStyle({ value: code, selectionStart: 0, selectionEnd: code.length }, "**", "**"),
    { value: "**`code`**", selectionStart: 2, selectionEnd: 8 },
  );

  const bold = "**bold**";
  const italic = toggleMarkdownInlineStyle({ value: bold, selectionStart: 2, selectionEnd: 6 }, "*", "*");
  assert.deepEqual(italic, { value: "**_bold_**", selectionStart: 3, selectionEnd: 7 });
  assert.deepEqual(
    italic && toggleMarkdownInlineStyle(italic, "*", "*"),
    { value: bold, selectionStart: 2, selectionEnd: 6 },
  );

  const strike = "~~text~~";
  assert.equal(
    toggleMarkdownInlineStyle({ value: strike, selectionStart: 2, selectionEnd: 6 }, "~", "~"),
    null,
  );
});

test("toggleMarkdownInlineStyle rejects destructive or ambiguous ranges", () => {
  const nested = "**bold *italic* tail**";
  const italicStart = nested.indexOf("italic");
  assert.equal(
    toggleMarkdownInlineStyle({
      value: nested,
      selectionStart: italicStart,
      selectionEnd: italicStart + "italic".length,
    }, "**", "**"),
    null,
  );

  const unmatched = "**unclosed";
  assert.equal(
    toggleMarkdownInlineStyle({ value: unmatched, selectionStart: 0, selectionEnd: unmatched.length }, "**", "**"),
    null,
  );
  const codeBlock = "```md\nplain\n```";
  assert.equal(
    toggleMarkdownInlineStyle({ value: codeBlock, selectionStart: 6, selectionEnd: 11 }, "**", "**"),
    null,
  );
  assert.equal(
    toggleMarkdownInlineStyle({ value: "math", selectionStart: 0, selectionEnd: 4 }, "$", "$"),
    null,
  );
  assert.equal(
    toggleMarkdownInlineStyle({ value: "two words", selectionStart: 0, selectionEnd: "two words".length }, "^", "^"),
    null,
  );
  assert.deepEqual(
    toggleMarkdownInlineStyle({
      value: "two\\ words",
      selectionStart: 0,
      selectionEnd: "two\\ words".length,
    }, "^", "^"),
    { value: "^two\\ words^", selectionStart: 1, selectionEnd: "^two\\ words".length },
  );
});

test("wrapHtmlCommentSelection toggles Typora-style inline comments", () => {
  assert.deepEqual(
    wrapHtmlCommentSelection({ value: "keep note", selectionStart: 5, selectionEnd: 9 }),
    { value: "keep <!-- note -->", selectionStart: 10, selectionEnd: 14 },
  );

  assert.deepEqual(
    wrapHtmlCommentSelection({ value: "keep <!-- note -->", selectionStart: 10, selectionEnd: 14 }),
    { value: "keep note", selectionStart: 5, selectionEnd: 9 },
  );

  assert.deepEqual(
    wrapHtmlCommentSelection({ value: "", selectionStart: 0, selectionEnd: 0 }),
    { value: "<!-- 注释文本 -->", selectionStart: 5, selectionEnd: 9 },
  );
});

test("pasteMarkdownText turns a pasted URL over selected text into a link", () => {
  const result = pasteMarkdownText(
    { value: "read docs", selectionStart: 5, selectionEnd: 9 },
    "https://example.com/docs",
  );

  assert.deepEqual(result, {
    value: "read [docs](https://example.com/docs)",
    selectionStart: 5,
    selectionEnd: 37,
  });
  assert.equal(
    pasteMarkdownText({ value: "read docs", selectionStart: 5, selectionEnd: 9 }, "not a url"),
    null,
  );
});

test("insertMarkdownLinkSelection creates editable links like Typora", () => {
  assert.deepEqual(
    insertMarkdownLinkSelection({ value: "read docs", selectionStart: 5, selectionEnd: 9 }),
    {
      value: "read [docs](https://example.com)",
      selectionStart: "read [docs](".length,
      selectionEnd: "read [docs](https://example.com".length,
    },
  );

  assert.deepEqual(
    insertMarkdownLinkSelection({ value: "", selectionStart: 0, selectionEnd: 0 }),
    {
      value: "[链接文本](https://example.com)",
      selectionStart: "[链接文本](".length,
      selectionEnd: "[链接文本](https://example.com".length,
    },
  );

  assert.deepEqual(
    insertMarkdownLinkSelection({ value: "see API [v2]", selectionStart: "see ".length, selectionEnd: "see API [v2]".length }),
    {
      value: "see [API \\[v2\\]](https://example.com)",
      selectionStart: "see [API \\[v2\\]](".length,
      selectionEnd: "see [API \\[v2\\]](https://example.com".length,
    },
  );
});

test("insertMarkdownLinkSelection focuses existing inline link destinations like Typora", () => {
  const source = "read [docs](https://old.example/a(b) \"Docs\") now";
  const labelStart = source.indexOf("docs");
  assert.deepEqual(
    insertMarkdownLinkSelection({
      value: source,
      selectionStart: labelStart,
      selectionEnd: labelStart + "docs".length,
    }),
    {
      value: source,
      selectionStart: source.indexOf("https://old.example"),
      selectionEnd: source.indexOf(") now"),
    },
  );

  const image = "look ![logo](old.png)";
  const altStart = image.indexOf("logo");
  assert.deepEqual(
    insertMarkdownLinkSelection({
      value: image,
      selectionStart: altStart,
      selectionEnd: altStart + "logo".length,
    }),
    {
      value: "look [![logo](old.png)](https://example.com)",
      selectionStart: "look [![logo](old.png)](".length,
      selectionEnd: "look [![logo](old.png)](https://example.com".length,
    },
  );
});

test("insertMarkdownImageSelection creates editable images like Typora", () => {
  assert.deepEqual(
    insertMarkdownImageSelection({ value: "logo", selectionStart: 0, selectionEnd: 4 }),
    {
      value: "![logo](image-path)",
      selectionStart: "![logo](".length,
      selectionEnd: "![logo](image-path".length,
    },
  );

  assert.deepEqual(
    insertMarkdownImageSelection({ value: "", selectionStart: 0, selectionEnd: 0 }),
    {
      value: "![图片描述](image-path)",
      selectionStart: "![图片描述](".length,
      selectionEnd: "![图片描述](image-path".length,
    },
  );

  assert.deepEqual(
    insertMarkdownImageSelection({ value: "chart [wide]", selectionStart: 0, selectionEnd: "chart [wide]".length }),
    {
      value: "![chart \\[wide\\]](image-path)",
      selectionStart: "![chart \\[wide\\]](".length,
      selectionEnd: "![chart \\[wide\\]](image-path".length,
    },
  );
});

test("insertMarkdownImageSelection focuses existing image destinations like Typora", () => {
  const source = "look ![logo](assets/a(b).png \"Logo\") now";
  const altStart = source.indexOf("logo");
  assert.deepEqual(
    insertMarkdownImageSelection({
      value: source,
      selectionStart: altStart,
      selectionEnd: altStart + "logo".length,
    }),
    {
      value: source,
      selectionStart: source.indexOf("assets/a"),
      selectionEnd: source.indexOf(") now"),
    },
  );

  const link = "read [docs](https://example.com)";
  const labelStart = link.indexOf("docs");
  assert.deepEqual(
    insertMarkdownImageSelection({
      value: link,
      selectionStart: labelStart,
      selectionEnd: labelStart + "docs".length,
    }),
    {
      value: "read [![docs](image-path)](https://example.com)",
      selectionStart: "read [![docs](".length,
      selectionEnd: "read [![docs](image-path".length,
    },
  );
});

test("pasteMarkdownText links local and custom protocol destinations like Typora", () => {
  assert.deepEqual(
    pasteMarkdownText(
      { value: "open note", selectionStart: 5, selectionEnd: 9 },
      "file:///C:/docs/My%20Note.md",
    ),
    {
      value: "open [note](file:///C:/docs/My%20Note.md)",
      selectionStart: 5,
      selectionEnd: "open [note](file:///C:/docs/My%20Note.md)".length,
    },
  );

  assert.deepEqual(
    pasteMarkdownText(
      { value: "open note", selectionStart: 5, selectionEnd: 9 },
      "C:\\docs\\My Note.md",
    ),
    {
      value: "open [note](<C:\\docs\\My Note.md>)",
      selectionStart: 5,
      selectionEnd: "open [note](<C:\\docs\\My Note.md>)".length,
    },
  );

  assert.deepEqual(
    pasteMarkdownText(
      { value: "open vault", selectionStart: 5, selectionEnd: 10 },
      "obsidian://open?vault=docs",
    ),
    {
      value: "open [vault](obsidian://open?vault=docs)",
      selectionStart: 5,
      selectionEnd: "open [vault](obsidian://open?vault=docs)".length,
    },
  );

  assert.equal(
    pasteMarkdownText({ value: "bad link", selectionStart: 4, selectionEnd: 8 }, "javascript:alert(1)"),
    null,
  );
});

test("pasteMarkdownText updates an existing markdown link target", () => {
  const source = "read [docs](https://old.example)";
  const labelStart = source.indexOf("docs");
  const labelResult = pasteMarkdownText(
    { value: source, selectionStart: labelStart, selectionEnd: labelStart + "docs".length },
    "https://new.example",
  );

  assert.deepEqual(labelResult, {
    value: "read [docs](https://new.example)",
    selectionStart: "read ".length,
    selectionEnd: "read [docs](https://new.example)".length,
  });

  const linkStart = source.indexOf("[docs]");
  const wholeLinkResult = pasteMarkdownText(
    { value: source, selectionStart: linkStart, selectionEnd: source.length },
    "https://new.example",
  );

  assert.deepEqual(wholeLinkResult, {
    value: "read [docs](https://new.example)",
    selectionStart: "read ".length,
    selectionEnd: "read [docs](https://new.example)".length,
  });
});

test("pasteMarkdownText updates image targets when alt text is selected like Typora", () => {
  const inlineImage = "look ![logo](old.png) now";
  const inlineAltStart = inlineImage.indexOf("logo");
  assert.deepEqual(
    pasteMarkdownText(
      { value: inlineImage, selectionStart: inlineAltStart, selectionEnd: inlineAltStart + "logo".length },
      "https://cdn.example/logo.png",
    ),
    {
      value: "look ![logo](https://cdn.example/logo.png) now",
      selectionStart: "look !".length,
      selectionEnd: "look ![logo](https://cdn.example/logo.png)".length,
    },
  );

  const referenceImage = "look ![logo][old-ref] now";
  const referenceAltStart = referenceImage.indexOf("logo");
  assert.deepEqual(
    pasteMarkdownText(
      { value: referenceImage, selectionStart: referenceAltStart, selectionEnd: referenceAltStart + "logo".length },
      "C:\\assets\\logo 2.png",
    ),
    {
      value: "look ![logo](<C:\\assets\\logo 2.png>) now",
      selectionStart: "look !".length,
      selectionEnd: "look ![logo](<C:\\assets\\logo 2.png>)".length,
    },
  );
});

test("pasteMarkdownText wraps complex link destinations like Typora", () => {
  assert.deepEqual(
    pasteMarkdownText(
      { value: "read docs", selectionStart: 5, selectionEnd: 9 },
      "https://example.com/a(b)",
    ),
    {
      value: "read [docs](<https://example.com/a(b)>)",
      selectionStart: 5,
      selectionEnd: "read [docs](<https://example.com/a(b)>)".length,
    },
  );

  const source = "read [docs](https://old.example)";
  const labelStart = source.indexOf("docs");
  assert.deepEqual(
    pasteMarkdownText(
      { value: source, selectionStart: labelStart, selectionEnd: labelStart + "docs".length },
      "https://example.com/a(b)",
    ),
    {
      value: "read [docs](<https://example.com/a(b)>)",
      selectionStart: "read ".length,
      selectionEnd: "read [docs](<https://example.com/a(b)>)".length,
    },
  );
});

test("pasteMarkdownText updates links with parenthesized destinations like Typora", () => {
  const source = 'read [docs](<https://old.example/a(b)> "Old title") now';
  const labelStart = source.indexOf("docs");

  assert.deepEqual(
    pasteMarkdownText(
      { value: source, selectionStart: labelStart, selectionEnd: labelStart + "docs".length },
      "https://new.example/a(b)",
    ),
    {
      value: "read [docs](<https://new.example/a(b)>) now",
      selectionStart: "read ".length,
      selectionEnd: "read [docs](<https://new.example/a(b)>)".length,
    },
  );

  const image = "![logo](<assets/a(b).png>)";
  assert.deepEqual(
    pasteMarkdownText(
      { value: image, selectionStart: 0, selectionEnd: image.length },
      "https://cdn.example/a(b).png",
    ),
    {
      value: "![logo](<https://cdn.example/a(b).png>)",
      selectionStart: 1,
      selectionEnd: "![logo](<https://cdn.example/a(b).png>)".length,
    },
  );
});

test("pasteMarkdownText updates links with nested or escaped labels like Typora", () => {
  const nested = "read [API [v2] docs](https://old.example) now";
  const nestedLabelStart = nested.indexOf("API");
  const nestedLabelEnd = nested.indexOf("](https://old.example)");
  assert.deepEqual(
    pasteMarkdownText(
      { value: nested, selectionStart: nestedLabelStart, selectionEnd: nestedLabelEnd },
      "https://new.example",
    ),
    {
      value: "read [API [v2] docs](https://new.example) now",
      selectionStart: "read ".length,
      selectionEnd: "read [API [v2] docs](https://new.example)".length,
    },
  );

  const escaped = "see [API \\[v2\\] docs](https://old.example)";
  const escapedLinkStart = escaped.indexOf("[API");
  assert.deepEqual(
    pasteMarkdownText(
      { value: escaped, selectionStart: escapedLinkStart, selectionEnd: escaped.length },
      "https://new.example/a(b)",
    ),
    {
      value: "see [API \\[v2\\] docs](<https://new.example/a(b)>)",
      selectionStart: "see ".length,
      selectionEnd: "see [API \\[v2\\] docs](<https://new.example/a(b)>)".length,
    },
  );

  const image = "![chart [wide]](assets/chart.png)";
  const imageLabelStart = image.indexOf("chart");
  const imageLabelEnd = image.indexOf("](assets/chart.png)");
  assert.deepEqual(
    pasteMarkdownText(
      { value: image, selectionStart: imageLabelStart, selectionEnd: imageLabelEnd },
      "https://cdn.example/chart.png",
    ),
    {
      value: "![chart [wide]](https://cdn.example/chart.png)",
      selectionStart: 1,
      selectionEnd: "![chart [wide]](https://cdn.example/chart.png)".length,
    },
  );
});

test("pasteMarkdownText updates reference images with nested labels like Typora", () => {
  const reference = "read [API [v2]][docs]";
  const labelStart = reference.indexOf("API");
  const labelEnd = reference.indexOf("][docs]");
  assert.deepEqual(
    pasteMarkdownText(
      { value: reference, selectionStart: labelStart, selectionEnd: labelEnd },
      "https://new.example",
    ),
    {
      value: "read [API [v2]](https://new.example)",
      selectionStart: "read ".length,
      selectionEnd: "read [API [v2]](https://new.example)".length,
    },
  );

  const image = "![logo [dark]][logo-ref]";
  assert.deepEqual(
    pasteMarkdownText(
      { value: image, selectionStart: 0, selectionEnd: image.length },
      "https://cdn.example/logo.png",
    ),
    {
      value: "![logo [dark]](https://cdn.example/logo.png)",
      selectionStart: 1,
      selectionEnd: "![logo [dark]](https://cdn.example/logo.png)".length,
    },
  );
});

test("pasteMarkdownText updates reference links and replaces selected URLs", () => {
  const reference = "read [docs][d]";
  const labelStart = reference.indexOf("docs");
  assert.deepEqual(
    pasteMarkdownText(
      { value: reference, selectionStart: labelStart, selectionEnd: labelStart + "docs".length },
      "https://new.example",
    ),
    {
      value: "read [docs](https://new.example)",
      selectionStart: "read ".length,
      selectionEnd: "read [docs](https://new.example)".length,
    },
  );

  assert.deepEqual(
    pasteMarkdownText(
      { value: "go https://old.example now", selectionStart: 3, selectionEnd: "go https://old.example".length },
      "https://new.example",
    ),
    {
      value: "go https://new.example now",
      selectionStart: 3,
      selectionEnd: "go https://new.example".length,
    },
  );

  assert.deepEqual(
    pasteMarkdownText(
      { value: "go <https://old.example>", selectionStart: 3, selectionEnd: "go <https://old.example>".length },
      "https://new.example",
    ),
    {
      value: "go <https://new.example>",
      selectionStart: 3,
      selectionEnd: "go <https://new.example>".length,
    },
  );

  assert.deepEqual(
    pasteMarkdownText(
      { value: "go <obsidian://open?vault=old>", selectionStart: 3, selectionEnd: "go <obsidian://open?vault=old>".length },
      "file:///C:/docs/new.md",
    ),
    {
      value: "go <file:///C:/docs/new.md>",
      selectionStart: 3,
      selectionEnd: "go <file:///C:/docs/new.md>".length,
    },
  );
});

test("pasteMarkdownText converts tabular clipboard text into a Markdown table", () => {
  const result = pasteMarkdownText(
    { value: "before\nafter", selectionStart: "before".length, selectionEnd: "before".length },
    "Name\tAge\nAda\t36\nBob\t41",
  );

  assert.deepEqual(result, {
    value: "before\n| Name | Age |\n| --- | --- |\n| Ada | 36 |\n| Bob | 41 |\nafter",
    selectionStart: "before\n| Name | Age |\n| --- | --- |\n| Ada | 36 |\n| Bob | 41 |".length,
    selectionEnd: "before\n| Name | Age |\n| --- | --- |\n| Ada | 36 |\n| Bob | 41 |".length,
  });

  assert.equal(
    pasteMarkdownText({ value: "", selectionStart: 0, selectionEnd: 0 }, "plain\t"),
    null,
  );
});

test("pasteMarkdownText pads and escapes pasted table cells", () => {
  const result = pasteMarkdownText(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    "A\tB\tC\n1\t2\nx|y\t z  z \t3",
  );

  assert.deepEqual(result, {
    value: "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |  |\n| x\\|y | z z | 3 |",
    selectionStart: "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |  |\n| x\\|y | z z | 3 |".length,
    selectionEnd: "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |  |\n| x\\|y | z z | 3 |".length,
  });
});

test("pasteMarkdownText preserves quoted multiline table cells like Typora", () => {
  const result = pasteMarkdownText(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    'Name\tNotes\nAda\t"Line one\nLine ""two"""\nBob\t"keeps\tinside"',
  );

  const expected = [
    "| Name | Notes |",
    "| --- | --- |",
    "| Ada | Line one Line \"two\" |",
    "| Bob | keeps inside |",
  ].join("\n");
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownText converts multiline CSV clipboard text into a Markdown table", () => {
  const result = pasteMarkdownText(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    'Name,Notes\nAda,"Line one\nLine ""two"""\nBob,"keeps, comma"',
  );

  const expected = [
    "| Name | Notes |",
    "| --- | --- |",
    "| Ada | Line one Line \"two\" |",
    "| Bob | keeps, comma |",
  ].join("\n");
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });

  assert.equal(
    pasteMarkdownText({ value: "", selectionStart: 0, selectionEnd: 0 }, "Hello, world"),
    null,
  );
});

test("pasteMarkdownContent converts pasted HTML tables into Markdown tables", () => {
  const result = pasteMarkdownContent(
    { value: "before\nafter", selectionStart: "before".length, selectionEnd: "before".length },
    {
      html: [
        "<table>",
        "<tr><th>Name</th><th style=\"text-align: right\">Age</th><th align=\"center\">City</th></tr>",
        "<tr><td>Ada</td><td>36</td><td>London</td></tr>",
        "<tr><td>x|y&nbsp;</td><td colspan=\"2\">wide &amp; tall</td></tr>",
        "</table>",
      ].join(""),
      text: "Name\tAge\tCity\nAda\t36\tLondon",
    },
  );

  assert.deepEqual(result, {
    value: [
      "before",
      "| Name | Age | City |",
      "| --- | ---: | :---: |",
      "| Ada | 36 | London |",
      "| x\\|y | wide & tall |  |",
      "after",
    ].join("\n"),
    selectionStart: [
      "before",
      "| Name | Age | City |",
      "| --- | ---: | :---: |",
      "| Ada | 36 | London |",
      "| x\\|y | wide & tall |  |",
    ].join("\n").length,
    selectionEnd: [
      "before",
      "| Name | Age | City |",
      "| --- | ---: | :---: |",
      "| Ada | 36 | London |",
      "| x\\|y | wide & tall |  |",
    ].join("\n").length,
  });
});

test("pasteMarkdownContent converts single-column HTML tables through fallback and DOM paths", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const html = "<table><tr><th>标题</th></tr><tr><td>内容</td></tr></table>";
  const expected = "| 标题 |\n| --- |\n| 内容 |";

  try {
    globals.DOMParser = undefined;
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      { html, text: "标题\n内容" },
    );
    assert.deepEqual(fallbackResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });

    const createCell = (tagName: string, innerHTML: string) => ({
      nodeType: 1,
      tagName,
      innerHTML,
      textContent: innerHTML,
      style: {},
      getAttribute: () => "",
    });
    const rows = [
      { querySelectorAll: () => [createCell("TH", "标题")] },
      { querySelectorAll: () => [createCell("TD", "内容")] },
    ];
    const table = {
      nodeType: 1,
      tagName: "TABLE",
      childNodes: [],
      querySelectorAll: () => rows,
    };
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [table] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      { html },
    );
    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent expands rowspan HTML table cells like Typora", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<table>",
        "<tr><th>Group</th><th>Item</th></tr>",
        "<tr><td rowspan=\"2\">A</td><td>One</td></tr>",
        "<tr><td>Two</td></tr>",
        "<tr><td>B</td><td>Three</td></tr>",
        "</table>",
      ].join(""),
    },
  );

  const expected = [
    "| Group | Item |",
    "| --- | --- |",
    "| A | One |",
    "|  | Two |",
    "| B | Three |",
  ].join("\n");
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent keeps DOM table cell line breaks separated like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const createCell = (tagName: string, innerHTML: string) => ({
    nodeType: 1,
    tagName,
    innerHTML,
    textContent: innerHTML.replace(/<[^>]+>/g, ""),
    style: {},
    getAttribute: () => "",
    querySelectorAll: () => [],
  });
  const createRow = (cells: unknown[]) => ({
    nodeType: 1,
    tagName: "TR",
    querySelectorAll: () => cells,
  });

  try {
    const table = {
      nodeType: 1,
      tagName: "TABLE",
      querySelectorAll: () => [
        createRow([createCell("TH", "Name"), createCell("TH", "Notes")]),
        createRow([createCell("TD", "Ada"), createCell("TD", "Line one<br>Line two")]),
      ],
    };
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [table] } };
      }
    };

    const result = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: "<table><tr><th>Name</th><th>Notes</th></tr><tr><td>Ada</td><td>Line one<br>Line two</td></tr></table>",
      },
    );

    const expected = [
      "| Name | Notes |",
      "| --- | --- |",
      "| Ada | Line one Line two |",
    ].join("\n");

    assert.deepEqual(result, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent preserves surrounding blocks when HTML contains a table", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<p>Intro <strong>text</strong></p>",
        "<table>",
        "<tr><th>A</th><th style=\"text-align: right\">B</th></tr>",
        "<tr><td>1</td><td>2</td></tr>",
        "</table>",
        "<p>After</p>",
      ].join(""),
      text: "Intro text\nA\tB\n1\t2\nAfter",
    },
  );

  const expected = [
    "Intro **text**",
    "",
    "| A | B |",
    "| --- | ---: |",
    "| 1 | 2 |",
    "",
    "After",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent converts rich HTML fragments into Markdown", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<!--StartFragment-->",
        "<h2>Heading</h2>",
        "<p>Paragraph with <strong>bold</strong> <a href=\"https://example.com/a\">docs</a> and <code>code</code>.</p>",
        "<ul><li>First</li><li>Second <em>item</em></li></ul>",
        "<blockquote><p>Quote</p></blockquote>",
        "<p><img src=\"assets/logo.png\" alt=\"Logo\" title=\"Logo title\"></p>",
        "<!--EndFragment-->",
      ].join(""),
      text: "Heading\nParagraph with bold docs and code.\nFirst\nSecond item\nQuote",
    },
  );

  const expected = [
    "## Heading",
    "",
    "Paragraph with **bold** [docs](https://example.com/a) and `code`.",
    "",
    "- First",
    "- Second *item*",
    "",
    "> Quote",
    "",
    "![Logo](assets/logo.png \"Logo title\")",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent keeps inline rich HTML inside the current paragraph", () => {
  const source = "Before  after";
  const cursor = "Before ".length;
  const result = pasteMarkdownContent(
    { value: source, selectionStart: cursor, selectionEnd: cursor },
    {
      html: [
        "<!--StartFragment-->",
        "<strong>bold</strong> and <em>italic</em>",
        "<!--EndFragment-->",
      ].join(""),
      text: "bold and italic",
    },
  );
  const expected = "Before **bold** and *italic* after";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: "Before **bold** and *italic*".length,
    selectionEnd: "Before **bold** and *italic*".length,
  });

  assert.deepEqual(
    pasteMarkdownContent(
      { value: "Before old after", selectionStart: 7, selectionEnd: 10 },
      { html: "<code>x</code>", text: "x" },
    ),
    {
      value: "Before `x` after",
      selectionStart: "Before `x`".length,
      selectionEnd: "Before `x`".length,
    },
  );
});

test("pasteMarkdownContent preserves nested inline HTML formatting like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const html = [
    "<p>Nested <strong><em>both</em></strong>, ",
    "<del><em>gone</em></del>, ",
    "<mark><strong>mark</strong></mark>, ",
    '<span style="font-weight: 700"><em>style</em></span>.</p>',
  ].join("");
  const expected = "Nested ***both***, ~~*gone*~~, ==**mark**==, ***style***.";

  try {
    globals.DOMParser = undefined;
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      { html },
    );

    assert.deepEqual(fallbackResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });

    const text = (textContent: string) => ({ nodeType: 3, textContent });
    const element = (tagName: string, childNodes: unknown[] = [], attrs: Record<string, string> = {}) => ({
      nodeType: 1,
      tagName,
      childNodes,
      children: childNodes.filter((child: any) => child.nodeType === 1),
      getAttribute: (name: string) => attrs[name] ?? "",
    });
    const paragraphNode = element("P", [
      text("Nested "),
      element("STRONG", [element("EM", [text("both")])]),
      text(", "),
      element("DEL", [element("EM", [text("gone")])]),
      text(", "),
      element("MARK", [element("STRONG", [text("mark")])]),
      text(", "),
      element("SPAN", [element("EM", [text("style")])], { style: "font-weight: 700" }),
      text("."),
    ]);
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [paragraphNode] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      { html },
    );

    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent converts HTML keyboard and sample tags like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const html = "<p>Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy <var>x</var>, see <samp>ok</samp>, and <ins>insert</ins>.</p>";
  const expected = "Press `Ctrl`+`C` to copy *x*, see `ok`, and <u>insert</u>.";

  try {
    globals.DOMParser = undefined;
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      { html },
    );

    assert.deepEqual(fallbackResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });

    const text = (textContent: string) => ({ nodeType: 3, textContent });
    const element = (tagName: string, childNodes: unknown[] = []) => ({
      nodeType: 1,
      tagName,
      childNodes,
      children: childNodes.filter((child: any) => child.nodeType === 1),
      getAttribute: () => "",
    });
    const paragraphNode = element("P", [
      text("Press "),
      element("KBD", [text("Ctrl")]),
      text("+"),
      element("KBD", [text("C")]),
      text(" to copy "),
      element("VAR", [text("x")]),
      text(", see "),
      element("SAMP", [text("ok")]),
      text(", and "),
      element("INS", [text("insert")]),
      text("."),
    ]);
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [paragraphNode] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      { html },
    );

    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent preserves styled inline HTML like Typora", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        '<p><span style="font-weight: 700">bold</span> ',
        '<span style="font-style: italic">italic</span> ',
        '<span style="text-decoration: line-through">gone</span> ',
        '<span style="text-decoration-line: underline">under</span> ',
        '<span style="background-color: yellow">mark</span> ',
        '<span style="vertical-align: super">2</span> ',
        '<span style="vertical-align: sub">n</span></p>',
      ].join(""),
      text: "bold italic gone under mark 2 n",
    },
  );

  const expected = "**bold** *italic* ~~gone~~ <u>under</u> ==mark== ^2^ ~n~";
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent converts HTML definition lists into editable definition lists like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const expected = [
    "**Term**",
    ": First definition",
    ": Second *detail*",
    "",
    "    Extra",
    "Next",
    ": [Docs](https://example.com/docs)",
  ].join("\n");

  try {
    globals.DOMParser = undefined;
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: [
          "<dl>",
          "<dt><strong>Term</strong></dt>",
          "<dd>First definition</dd>",
          "<dd><p>Second <em>detail</em></p><p>Extra</p></dd>",
          "<dt>Next</dt>",
          '<dd><a href="https://example.com/docs">Docs</a></dd>',
          "</dl>",
        ].join(""),
      },
    );

    assert.deepEqual(fallbackResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });

    const text = (textContent: string) => ({ nodeType: 3, textContent });
    const element = (tagName: string, childNodes: unknown[] = [], attrs: Record<string, string> = {}) => ({
      nodeType: 1,
      tagName,
      childNodes,
      children: childNodes.filter((child: any) => child.nodeType === 1),
      getAttribute: (name: string) => attrs[name] ?? "",
    });
    const dl = element("DL", [
      element("DT", [element("STRONG", [text("Term")])]),
      element("DD", [text("First definition")]),
      element("DD", [
        element("P", [text("Second "), element("EM", [text("detail")])]),
        element("P", [text("Extra")]),
      ]),
      element("DT", [text("Next")]),
      element("DD", [element("A", [text("Docs")], { href: "https://example.com/docs" })]),
    ]);
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [dl] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: [
          "<dl>",
          "<dt><strong>Term</strong></dt>",
          "<dd>First definition</dd>",
          "<dd><p>Second <em>detail</em></p><p>Extra</p></dd>",
          "<dt>Next</dt>",
          '<dd><a href="https://example.com/docs">Docs</a></dd>',
          "</dl>",
        ].join(""),
      },
    );

    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent drops unsafe HTML link hrefs and keeps local links", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<p>",
        "<a href=\"javascript:alert(1)\">bad</a> ",
        "<a href=\"obsidian://open?vault=docs\">vault</a> ",
        "<a href=\"file:///C:/docs/a.md\">file</a>",
        "</p>",
      ].join(""),
      text: "bad vault file",
    },
  );

  const expected = "bad [vault](obsidian://open?vault=docs) [file](file:///C:/docs/a.md)";
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves HTML link titles like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const expected = '[docs](<https://example.com/a(b)> "Docs \\"API\\"")';

  try {
    globals.DOMParser = undefined;
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><a href="https://example.com/a(b)" title="Docs &quot;API&quot;">docs</a></p>',
      },
    );

    assert.deepEqual(fallbackResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });

    const linkNode = {
      nodeType: 1,
      tagName: "A",
      childNodes: [{ nodeType: 3, textContent: "docs" }],
      getAttribute: (name: string) => (
        name === "href"
          ? "https://example.com/a(b)"
          : name === "title"
            ? 'Docs "API"'
            : ""
      ),
    };
    const paragraphNode = {
      nodeType: 1,
      tagName: "P",
      childNodes: [linkNode],
    };
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [paragraphNode] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><a href="https://example.com/a(b)" title="Docs &quot;API&quot;">docs</a></p>',
      },
    );

    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent escapes bracketed HTML link labels like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const expected = "[API \\[v2\\]](https://example.com/docs)";

  try {
    globals.DOMParser = undefined;
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><a href="https://example.com/docs">API [v2]</a></p>',
      },
    );

    assert.deepEqual(fallbackResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });

    const linkNode = {
      nodeType: 1,
      tagName: "A",
      childNodes: [{ nodeType: 3, textContent: "API [v2]" }],
      getAttribute: (name: string) => (name === "href" ? "https://example.com/docs" : ""),
    };
    const paragraphNode = {
      nodeType: 1,
      tagName: "P",
      childNodes: [linkNode],
    };
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [paragraphNode] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><a href="https://example.com/docs">API [v2]</a></p>',
      },
    );

    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent drops unsafe HTML image sources and keeps local images", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        '<p><img src="javascript:alert(1)" alt="Bad">',
        '<img src="data:text/html,hi" alt="Text">',
        '<img src="file:///C:/docs/logo one.png" alt="Logo">',
        '<img src="data:image/png;base64,abc" alt="Inline"></p>',
      ].join(" "),
    },
  );

  const expected = "Bad Text ![Logo](<file:///C:/docs/logo one.png>) ![Inline](data:image/png;base64,abc)";
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves bracketed image alt text like Typora", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: '<p><img src="assets/chart.png" alt="Chart [wide]"></p>',
    },
  );

  const expected = "![Chart \\[wide\\]](assets/chart.png)";
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves pasted HTML image dimensions like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;

  try {
    globals.DOMParser = undefined;
    const fallbackExpected = '<img src="assets/logo.png" alt="Logo" width="320" height="180" title="Logo title">';
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><img src="assets/logo.png" alt="Logo" title="Logo title" width="320" height="180"></p>',
      },
    );

    assert.deepEqual(fallbackResult, {
      value: fallbackExpected,
      selectionStart: fallbackExpected.length,
      selectionEnd: fallbackExpected.length,
    });

    const domExpected = '<img src="assets/logo.png" alt="Logo" width="50%">';
    const imageNode = {
      nodeType: 1,
      tagName: "IMG",
      childNodes: [],
      getAttribute: (name: string) => (
        name === "src"
          ? "assets/logo.png"
          : name === "alt"
            ? "Logo"
            : name === "style"
              ? "width: 50%; height: auto"
              : ""
      ),
    };
    const paragraphNode = {
      nodeType: 1,
      tagName: "P",
      childNodes: [imageNode],
    };
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [paragraphNode] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><img src="assets/logo.png" alt="Logo" style="width: 50%; height: auto"></p>',
      },
    );

    assert.deepEqual(domResult, {
      value: domExpected,
      selectionStart: domExpected.length,
      selectionEnd: domExpected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent preserves linked HTML images like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const expected = "[![Preview](assets/photo.png)](https://example.com/full)";

  try {
    globals.DOMParser = undefined;
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><a href="https://example.com/full"><img src="assets/photo.png" alt="Preview"></a></p>',
      },
    );

    assert.deepEqual(fallbackResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });

    const imageNode = {
      nodeType: 1,
      tagName: "IMG",
      childNodes: [],
      getAttribute: (name: string) => (
        name === "src"
          ? "assets/photo.png"
          : name === "alt"
            ? "Preview"
            : ""
      ),
    };
    const linkNode = {
      nodeType: 1,
      tagName: "A",
      childNodes: [imageNode],
      getAttribute: (name: string) => (name === "href" ? "https://example.com/full" : ""),
    };
    const paragraphNode = {
      nodeType: 1,
      tagName: "P",
      childNodes: [linkNode],
    };
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [paragraphNode] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><a href="https://example.com/full"><img src="assets/photo.png" alt="Preview"></a></p>',
      },
    );

    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent preserves linked HTML image dimensions like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;

  try {
    globals.DOMParser = undefined;
    const fallbackExpected = '<a href="https://example.com/full" title="Open large"><img src="assets/photo.png" alt="Preview" width="320"></a>';
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><a href="https://example.com/full" title="Open large"><img src="assets/photo.png" alt="Preview" width="320"></a></p>',
      },
    );

    assert.deepEqual(fallbackResult, {
      value: fallbackExpected,
      selectionStart: fallbackExpected.length,
      selectionEnd: fallbackExpected.length,
    });

    const imageNode = {
      nodeType: 1,
      tagName: "IMG",
      childNodes: [],
      getAttribute: (name: string) => (
        name === "src"
          ? "assets/photo.png"
          : name === "alt"
            ? "Preview"
            : name === "style"
              ? "width: 50%; height: auto"
              : ""
      ),
    };
    const linkNode = {
      nodeType: 1,
      tagName: "A",
      childNodes: [imageNode],
      getAttribute: (name: string) => (name === "href" ? "https://example.com/full" : ""),
    };
    const paragraphNode = {
      nodeType: 1,
      tagName: "P",
      childNodes: [linkNode],
    };
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [paragraphNode] } };
      }
    };

    const domExpected = '<a href="https://example.com/full"><img src="assets/photo.png" alt="Preview" width="50%"></a>';
    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<p><a href="https://example.com/full"><img src="assets/photo.png" alt="Preview" style="width: 50%; height: auto"></a></p>',
      },
    );

    assert.deepEqual(domResult, {
      value: domExpected,
      selectionStart: domExpected.length,
      selectionEnd: domExpected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent separates HTML figure captions from images like Typora", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        '<figure><img src="assets/photo.png" alt="Photo">',
        "<figcaption><strong>Figure 1.</strong> Caption</figcaption></figure>",
      ].join(""),
      text: "Figure 1. Caption",
    },
  );

  const expected = [
    "![Photo](assets/photo.png)",
    "",
    "**Figure 1.** Caption",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves HTML paragraphs and line breaks", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: "<p>Line one<br>Line two</p><p>Next</p>",
      text: "Line one\nLine two\nNext",
    },
  );

  const expected = [
    "Line one  ",
    "Line two",
    "",
    "Next",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("insertMarkdownAtSelection preserves CRLF for generated toolbar snippets", () => {
  const result = insertMarkdownAtSelection({
    value: "before\r\nafter",
    selectionStart: "before".length,
    selectionEnd: "before".length,
  }, "\n---\n");

  assert.deepEqual(result, {
    value: "before\r\n---\r\n\r\nafter",
    selectionStart: "before\r\n---\r\n".length,
    selectionEnd: "before\r\n---\r\n".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("pastePlainMarkdownText inserts clipboard text without smart Markdown conversion like Typora", () => {
  assert.deepEqual(
    pastePlainMarkdownText(
      { value: "read docs", selectionStart: 5, selectionEnd: 9 },
      "https://example.com/docs",
    ),
    {
      value: "read https://example.com/docs",
      selectionStart: "read https://example.com/docs".length,
      selectionEnd: "read https://example.com/docs".length,
    },
  );

  assert.deepEqual(
    pastePlainMarkdownText(
      { value: "before\r\nafter", selectionStart: "before\r\n".length, selectionEnd: "before\r\n".length },
      "Name\tAge\nAda\t36",
    ),
    {
      value: "before\r\nName\tAge\r\nAda\t36after",
      selectionStart: "before\r\nName\tAge\r\nAda\t36".length,
      selectionEnd: "before\r\nName\tAge\r\nAda\t36".length,
    },
  );
});

test("pasteMarkdownContent preserves surrounding CRLF line endings for generated blocks", () => {
  const source = "Intro\r\nOutro";
  const result = pasteMarkdownContent(
    { value: source, selectionStart: "Intro\r\n".length, selectionEnd: "Intro\r\n".length },
    { html: "<p>Alpha</p><p>Beta</p>" },
  );
  const expected = "Intro\r\nAlpha\r\n\r\nBeta\r\nOutro";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: "Intro\r\nAlpha\r\n\r\nBeta".length,
    selectionEnd: "Intro\r\nAlpha\r\n\r\nBeta".length,
  });
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("pasteMarkdownContent preserves multi-paragraph HTML blockquotes like Typora", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<blockquote>",
        "<p>Quote <strong>one</strong></p>",
        "<p>Quote two</p>",
        "<ul><li>Point</li></ul>",
        "</blockquote>",
      ].join(""),
      text: "Quote one\nQuote two\nPoint",
    },
  );

  const expected = [
    "> Quote **one**",
    ">",
    "> Quote two",
    ">",
    "> - Point",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves nested HTML blockquotes like Typora", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const html = [
    "<blockquote>",
    "<p>Outer</p>",
    "<blockquote><p>Inner</p></blockquote>",
    "<p>After</p>",
    "</blockquote>",
  ].join("");
  const expected = [
    "> Outer",
    ">",
    "> > Inner",
    ">",
    "> After",
  ].join("\n");

  try {
    globals.DOMParser = undefined;
    const fallbackResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      { html },
    );

    assert.deepEqual(fallbackResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });

    const text = (textContent: string) => ({ nodeType: 3, textContent });
    const element = (tagName: string, childNodes: unknown[] = []) => ({
      nodeType: 1,
      tagName,
      childNodes,
      children: childNodes.filter((child: any) => child.nodeType === 1),
      getAttribute: () => "",
    });
    const blockquote = element("BLOCKQUOTE", [
      element("P", [text("Outer")]),
      element("BLOCKQUOTE", [element("P", [text("Inner")])]),
      element("P", [text("After")]),
    ]);
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [blockquote] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      { html },
    );

    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent preserves nested HTML list levels and ordered starts", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<ol start=\"3\">",
        "<li>Third<ul><li>Child</li><li><strong>Bold child</strong></li></ul></li>",
        "<li value=\"7\">Seventh<ol><li>Nested one</li><li value=\"5\">Nested five</li></ol></li>",
        "<li>Eighth</li>",
        "</ol>",
      ].join(""),
      text: "Third\nChild\nBold child\nSeventh\nNested one\nNested five\nEighth",
    },
  );

  const expected = [
    "3. Third",
    "  - Child",
    "  - **Bold child**",
    "7. Seventh",
    "  1. Nested one",
    "  5. Nested five",
    "8. Eighth",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves multi-paragraph HTML list items like Typora", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<ul>",
        "<li><p>First <strong>paragraph</strong></p><p>Second paragraph</p><ul><li>Child</li></ul></li>",
        "<li><input type=\"checkbox\" checked><p>Done</p><p>Task detail</p></li>",
        "</ul>",
        "<ol start=\"9\"><li><p>Ninth</p><p>Ordered detail</p></li></ol>",
      ].join(""),
      text: "First paragraph\nSecond paragraph\nChild\nDone\nTask detail\nNinth\nOrdered detail",
    },
  );

  const expected = [
    "- First **paragraph**",
    "",
    "  Second paragraph",
    "  - Child",
    "- [x] Done",
    "",
    "      Task detail",
    "",
    "9. Ninth",
    "",
    "   Ordered detail",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves reversed HTML ordered list numbering like Typora", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<ol reversed start=\"5\">",
        "<li>Five</li>",
        "<li>Four</li>",
        "<li value=\"2\">Two</li>",
        "<li>One</li>",
        "</ol>",
        "<ol reversed>",
        "<li>Second</li>",
        "<li>First</li>",
        "</ol>",
      ].join(""),
      text: "Five\nFour\nTwo\nOne\nSecond\nFirst",
    },
  );

  const expected = [
    "5. Five",
    "4. Four",
    "2. Two",
    "1. One",
    "",
    "2. Second",
    "1. First",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves HTML task list checkbox states", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: [
        "<ul>",
        "<li><input type=\"checkbox\" checked> Done</li>",
        "<li><input type=\"checkbox\"> Todo</li>",
        "</ul>",
        "<ol start=\"3\">",
        "<li><input type=\"checkbox\" checked=\"checked\"> Ordered done</li>",
        "</ol>",
      ].join(""),
      text: "Done\nTodo\nOrdered done",
    },
  );

  const expected = [
    "- [x] Done",
    "- [ ] Todo",
    "",
    "3. [x] Ordered done",
  ].join("\n");

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent uses a longer code fence when pasted code contains backticks", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: "<pre><code>alpha\n```\nbeta</code></pre>",
      text: "alpha\n```\nbeta",
    },
  );

  const expected = "````\nalpha\n```\nbeta\n````";
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
});

test("pasteMarkdownContent preserves pasted HTML code language like Typora", () => {
  const result = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: '<pre><code class="hljs language-js">const answer = 42;</code></pre>',
      text: "const answer = 42;",
    },
  );

  const expected = "```js\nconst answer = 42;\n```";
  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });

  const preClassResult = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: '<pre class="language-python"><code>print("hi")</code></pre>',
      text: 'print("hi")',
    },
  );
  const preClassExpected = '```python\nprint("hi")\n```';
  assert.deepEqual(preClassResult, {
    value: preClassExpected,
    selectionStart: preClassExpected.length,
    selectionEnd: preClassExpected.length,
  });
});

test("pasteMarkdownContent preserves HTML code line breaks like Typora", () => {
  const expected = "```js\nalpha\n  beta\n```";
  const fallbackResult = pasteMarkdownContent(
    { value: "", selectionStart: 0, selectionEnd: 0 },
    {
      html: '<pre><code class="language-js">alpha<br>&nbsp;&nbsp;beta</code></pre>',
      text: "alpha\n  beta",
    },
  );

  assert.deepEqual(fallbackResult, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });

  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  try {
    const codeNode = {
      nodeType: 1,
      tagName: "CODE",
      innerHTML: "alpha<br>&nbsp;&nbsp;beta",
      textContent: "alphabeta",
      className: "language-js",
      getAttribute: (name: string) => (name === "class" ? "language-js" : ""),
      querySelector: () => null,
    };
    const preNode = {
      nodeType: 1,
      tagName: "PRE",
      innerHTML: "<code>alpha<br>&nbsp;&nbsp;beta</code>",
      textContent: "alphabeta",
      className: "",
      childNodes: [codeNode],
      getAttribute: () => "",
      querySelector: (selector: string) => (selector === "code" ? codeNode : null),
    };
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [preNode] } };
      }
    };

    const domResult = pasteMarkdownContent(
      { value: "", selectionStart: 0, selectionEnd: 0 },
      {
        html: '<pre><code class="language-js">alpha<br>&nbsp;&nbsp;beta</code></pre>',
        text: "alpha\n  beta",
      },
    );

    assert.deepEqual(domResult, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("pasteMarkdownContent falls back to plain text paste handling", () => {
  assert.deepEqual(
    pasteMarkdownContent(
      { value: "read docs", selectionStart: 5, selectionEnd: 9 },
      { html: "<p>https://example.com/docs</p>", text: "https://example.com/docs" },
    ),
    {
      value: "read [docs](https://example.com/docs)",
      selectionStart: 5,
      selectionEnd: 37,
    },
  );
});

test("insertMarkdownSoftBreak inserts a Markdown hard line break", () => {
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "alpha", selectionStart: 5, selectionEnd: 5 }),
    { value: "alpha  \n", selectionStart: 8, selectionEnd: 8 },
  );
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "alpha beta", selectionStart: 5, selectionEnd: 10 }),
    { value: "alpha  \n", selectionStart: 8, selectionEnd: 8 },
  );
});

test("insertMarkdownSoftBreak keeps list and quote continuation indentation", () => {
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "- item", selectionStart: "- item".length, selectionEnd: "- item".length }),
    { value: "- item  \n  ", selectionStart: "- item  \n  ".length, selectionEnd: "- item  \n  ".length },
  );
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "1. item", selectionStart: "1. item".length, selectionEnd: "1. item".length }),
    { value: "1. item  \n   ", selectionStart: "1. item  \n   ".length, selectionEnd: "1. item  \n   ".length },
  );
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "- [ ] item", selectionStart: "- [ ] item".length, selectionEnd: "- [ ] item".length }),
    { value: "- [ ] item  \n      ", selectionStart: "- [ ] item  \n      ".length, selectionEnd: "- [ ] item  \n      ".length },
  );
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "> quote", selectionStart: "> quote".length, selectionEnd: "> quote".length }),
    { value: "> quote  \n> ", selectionStart: "> quote  \n> ".length, selectionEnd: "> quote  \n> ".length },
  );
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "> - item", selectionStart: "> - item".length, selectionEnd: "> - item".length }),
    { value: "> - item  \n>   ", selectionStart: "> - item  \n>   ".length, selectionEnd: "> - item  \n>   ".length },
  );

  const continuation = "- item\n  continuation";
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: continuation, selectionStart: continuation.length, selectionEnd: continuation.length }),
    {
      value: "- item\n  continuation  \n  ",
      selectionStart: "- item\n  continuation  \n  ".length,
      selectionEnd: "- item\n  continuation  \n  ".length,
    },
  );

  const quotedContinuation = "> - item\n>   continuation";
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: quotedContinuation, selectionStart: quotedContinuation.length, selectionEnd: quotedContinuation.length }),
    {
      value: "> - item\n>   continuation  \n>   ",
      selectionStart: "> - item\n>   continuation  \n>   ".length,
      selectionEnd: "> - item\n>   continuation  \n>   ".length,
    },
  );
});

test("insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora", () => {
  const indentedBullet = "paragraph\n    - item";
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: indentedBullet, selectionStart: indentedBullet.length, selectionEnd: indentedBullet.length }),
    { value: "paragraph\n    - item  \n", selectionStart: "paragraph\n    - item  \n".length, selectionEnd: "paragraph\n    - item  \n".length },
  );

  const nestedBullet = "- parent\n    - child";
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: nestedBullet, selectionStart: nestedBullet.length, selectionEnd: nestedBullet.length }),
    { value: "- parent\n    - child  \n      ", selectionStart: "- parent\n    - child  \n      ".length, selectionEnd: "- parent\n    - child  \n      ".length },
  );

  const quotedIndentedBullet = "> paragraph\n>     - item";
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: quotedIndentedBullet, selectionStart: quotedIndentedBullet.length, selectionEnd: quotedIndentedBullet.length }),
    { value: "> paragraph\n>     - item  \n> ", selectionStart: "> paragraph\n>     - item  \n> ".length, selectionEnd: "> paragraph\n>     - item  \n> ".length },
  );

  const quotedNestedBullet = "> - parent\n>     - child";
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: quotedNestedBullet, selectionStart: quotedNestedBullet.length, selectionEnd: quotedNestedBullet.length }),
    { value: "> - parent\n>     - child  \n>       ", selectionStart: "> - parent\n>     - child  \n>       ".length, selectionEnd: "> - parent\n>     - child  \n>       ".length },
  );
});

test("insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora", () => {
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "Term\n: Definition", selectionStart: "Term\n: Definition".length, selectionEnd: "Term\n: Definition".length }),
    { value: "Term\n: Definition  \n  ", selectionStart: "Term\n: Definition  \n  ".length, selectionEnd: "Term\n: Definition  \n  ".length },
  );

  const definitionContinuation = "Term\n: Definition\n    continuation";
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: definitionContinuation, selectionStart: definitionContinuation.length, selectionEnd: definitionContinuation.length }),
    { value: "Term\n: Definition\n    continuation  \n    ", selectionStart: "Term\n: Definition\n    continuation  \n    ".length, selectionEnd: "Term\n: Definition\n    continuation  \n    ".length },
  );

  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "> Term\n> : Definition", selectionStart: "> Term\n> : Definition".length, selectionEnd: "> Term\n> : Definition".length }),
    { value: "> Term\n> : Definition  \n>   ", selectionStart: "> Term\n> : Definition  \n>   ".length, selectionEnd: "> Term\n> : Definition  \n>   ".length },
  );

  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "[^1]: detail", selectionStart: "[^1]: detail".length, selectionEnd: "[^1]: detail".length }),
    { value: "[^1]: detail  \n    ", selectionStart: "[^1]: detail  \n    ".length, selectionEnd: "[^1]: detail  \n    ".length },
  );

  const footnoteContinuation = "[^1]: detail\n    continuation";
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: footnoteContinuation, selectionStart: footnoteContinuation.length, selectionEnd: footnoteContinuation.length }),
    { value: "[^1]: detail\n    continuation  \n    ", selectionStart: "[^1]: detail\n    continuation  \n    ".length, selectionEnd: "[^1]: detail\n    continuation  \n    ".length },
  );

  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "paragraph\n  code", selectionStart: "paragraph\n  code".length, selectionEnd: "paragraph\n  code".length }),
    { value: "paragraph\n  code  \n", selectionStart: "paragraph\n  code  \n".length, selectionEnd: "paragraph\n  code  \n".length },
  );
});

test("insertMarkdownSoftBreak inserts plain newlines inside raw fences", () => {
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "```ts\nconst x = 1", selectionStart: "```ts\nconst x = 1".length, selectionEnd: "```ts\nconst x = 1".length }),
    { value: "```ts\nconst x = 1\n", selectionStart: "```ts\nconst x = 1\n".length, selectionEnd: "```ts\nconst x = 1\n".length },
  );
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "$$\na+b", selectionStart: "$$\na+b".length, selectionEnd: "$$\na+b".length }),
    { value: "$$\na+b\n", selectionStart: "$$\na+b\n".length, selectionEnd: "$$\na+b\n".length },
  );
});

test("insertMarkdownSoftBreak inserts plain newlines inside raw HTML blocks like Typora", () => {
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "<div>\nalpha", selectionStart: "<div>\nalpha".length, selectionEnd: "<div>\nalpha".length }),
    { value: "<div>\nalpha\n", selectionStart: "<div>\nalpha\n".length, selectionEnd: "<div>\nalpha\n".length },
  );
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: "> <section>\n> alpha", selectionStart: "> <section>\n> alpha".length, selectionEnd: "> <section>\n> alpha".length }),
    { value: "> <section>\n> alpha\n", selectionStart: "> <section>\n> alpha\n".length, selectionEnd: "> <section>\n> alpha\n".length },
  );
});

test("insertMarkdownSoftBreak replaces raw block selections with plain line breaks", () => {
  const fenced = "```ts\nalpha beta\n```";
  const fencedStart = fenced.indexOf("beta");
  assert.deepEqual(
    insertMarkdownSoftBreak({
      value: fenced,
      selectionStart: fencedStart,
      selectionEnd: fencedStart + "beta".length,
    }),
    {
      value: "```ts\nalpha \n\n```",
      selectionStart: fencedStart + 1,
      selectionEnd: fencedStart + 1,
    },
  );

  const html = "<div>\r\nalpha beta\r\n</div>";
  const htmlStart = html.indexOf("beta");
  const result = insertMarkdownSoftBreak({
    value: html,
    selectionStart: htmlStart,
    selectionEnd: htmlStart + "beta".length,
  });
  assert.deepEqual(result, {
    value: "<div>\r\nalpha \r\n\r\n</div>",
    selectionStart: htmlStart + 2,
    selectionEnd: htmlStart + 2,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("insertMarkdownSoftBreak preserves CRLF line endings like Typora", () => {
  const source = "alpha\r\n- item";
  const result = insertMarkdownSoftBreak({ value: source, selectionStart: source.length, selectionEnd: source.length });
  const expected = "alpha\r\n- item  \r\n  ";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("formatMarkdownCodeBlock wraps selection or inserts an empty focused block", () => {
  const wrapped = formatMarkdownCodeBlock(
    { value: "before\nconst x = 1;\nafter", selectionStart: 7, selectionEnd: 19 },
    "ts",
  );

  assert.equal(wrapped.value, "before\n```ts\nconst x = 1;\n```\nafter");
  assert.equal(wrapped.selectionStart, 13);
  assert.equal(wrapped.selectionEnd, 25);

  const inserted = formatMarkdownCodeBlock({ value: "", selectionStart: 0, selectionEnd: 0 }, "ts");
  assert.equal(inserted.value, "```ts\n\n```\n");
  assert.equal(inserted.selectionStart, 6);
  assert.equal(inserted.selectionEnd, 6);

  const defaultInserted = formatMarkdownCodeBlock({ value: "", selectionStart: 0, selectionEnd: 0 });
  assert.match(defaultInserted.value, /^```\n/);
  assert.doesNotMatch(defaultInserted.value, /^```[A-Za-z]/);
  assert.equal(defaultInserted.value, "```\n\n```\n");
  assert.equal(defaultInserted.selectionStart, "```\n".length);
  assert.equal(defaultInserted.selectionEnd, "```\n".length);

  const nestedFence = "alpha\n```\nbeta";
  const nested = formatMarkdownCodeBlock(
    { value: nestedFence, selectionStart: 0, selectionEnd: nestedFence.length },
    "md",
  );
  assert.equal(nested.value, "````md\nalpha\n```\nbeta\n````\n");
  assert.equal(nested.selectionStart, "````md\n".length);
  assert.equal(nested.selectionEnd, "````md\nalpha\n```\nbeta".length);
});

test("applyDefaultCodeLanguageOnFenceKey inserts and selects a Typora-style default language", () => {
  assert.deepEqual(
    applyDefaultCodeLanguageOnFenceKey(
      { value: "``", selectionStart: 2, selectionEnd: 2 },
      "`",
      "typescript",
    ),
    {
      value: "```typescript",
      selectionStart: 3,
      selectionEnd: 13,
    },
  );

  assert.deepEqual(
    applyDefaultCodeLanguageOnFenceKey(
      { value: "> ~~\r\nnext", selectionStart: 4, selectionEnd: 4 },
      "~",
      "rust",
    ),
    {
      value: "> ~~~rust\r\nnext",
      selectionStart: 5,
      selectionEnd: 9,
    },
  );
});

test("applyDefaultCodeLanguageOnFenceKey does not consume an existing third fence marker", () => {
  const state = { value: "```", selectionStart: 2, selectionEnd: 2 };

  assert.equal(applyDefaultCodeLanguageOnFenceKey(state, "`", "go"), null);
  assert.equal(
    `${state.value.slice(0, state.selectionStart)}\`${state.value.slice(state.selectionEnd)}`,
    "````",
  );
});

test("applyDefaultCodeLanguageOnFenceKey ignores empty defaults and closing fences", () => {
  assert.equal(
    applyDefaultCodeLanguageOnFenceKey(
      { value: "``", selectionStart: 2, selectionEnd: 2 },
      "`",
      "",
    ),
    null,
  );
  const closing = "```js\ncode\n``";
  assert.equal(
    applyDefaultCodeLanguageOnFenceKey(
      { value: closing, selectionStart: closing.length, selectionEnd: closing.length },
      "`",
      "python",
    ),
    null,
  );
});

test("formatMarkdownCodeBlock preserves CRLF line endings in generated fences", () => {
  const source = "before\r\nconst x = 1;\r\nafter";
  const result = formatMarkdownCodeBlock(
    { value: source, selectionStart: "before\r\n".length, selectionEnd: "before\r\nconst x = 1;".length },
    "ts",
  );

  assert.equal(result.value, "before\r\n```ts\r\nconst x = 1;\r\n```\r\nafter");
  assert.equal(result.selectionStart, "before\r\n```ts\r\n".length);
  assert.equal(result.selectionEnd, "before\r\n```ts\r\nconst x = 1;".length);
  assertOnlyCrlfLineBreaks(result.value);
});

test("formatMarkdownCodeBlock toggles closed code fences back to text like Typora", () => {
  const source = "before\n```ts\nconst x = 1;\n```\nafter";
  const result = formatMarkdownCodeBlock({
    value: source,
    selectionStart: source.indexOf("x"),
    selectionEnd: source.indexOf("x"),
  });
  const expected = "before\nconst x = 1;\nafter";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.indexOf("x"),
    selectionEnd: expected.indexOf("x"),
  });

  const selectedFence = formatMarkdownCodeBlock({
    value: source,
    selectionStart: source.indexOf("```ts"),
    selectionEnd: source.lastIndexOf("```") + "```".length,
  });
  assert.deepEqual(selectedFence, {
    value: expected,
    selectionStart: "before\n".length,
    selectionEnd: "before\nconst x = 1;\n".length,
  });

  const crlf = "```ts\r\nconst x = 1;\r\n```\r\nafter";
  const crlfResult = formatMarkdownCodeBlock({
    value: crlf,
    selectionStart: crlf.indexOf("x"),
    selectionEnd: crlf.indexOf("x"),
  });
  assert.equal(crlfResult.value, "const x = 1;\r\nafter");
  assert.equal(crlfResult.selectionStart, "const x".length - 1);
  assertOnlyCrlfLineBreaks(crlfResult.value);

  assert.equal(
    formatMarkdownCodeBlock({
      value: source,
      selectionStart: source.indexOf("after"),
      selectionEnd: source.indexOf("after"),
    }).value,
    "before\n```ts\nconst x = 1;\n```\n```\n\n```\nafter",
  );
});

test("insertMarkdownDiagramTemplate inserts editable diagram fences", () => {
  const mermaid = insertMarkdownDiagramTemplate({ value: "Intro", selectionStart: "Intro".length, selectionEnd: "Intro".length }, "mermaid");
  assert.equal(mermaid.value, "Intro\n```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```\n");
  assert.equal(mermaid.value.slice(mermaid.selectionStart, mermaid.selectionEnd), "flowchart LR\n  A[开始] --> B[结束]");

  const flowchart = insertMarkdownDiagramTemplate({ value: "", selectionStart: 0, selectionEnd: 0 }, "flowchart");
  assert.equal(flowchart.value, "```flowchart\nst=>start: 开始\ne=>end: 结束\nst->e\n```\n");
  assert.equal(flowchart.value.slice(flowchart.selectionStart, flowchart.selectionEnd), "st=>start: 开始\ne=>end: 结束\nst->e");
});

test("insertMarkdownDiagramTemplate preserves CRLF line endings", () => {
  const result = insertMarkdownDiagramTemplate({ value: "Intro\r\nOutro", selectionStart: "Intro\r\n".length, selectionEnd: "Intro\r\n".length }, "mermaid");

  assert.equal(result.value, "Intro\r\n```mermaid\r\nflowchart LR\r\n  A[开始] --> B[结束]\r\n```\r\nOutro");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "flowchart LR\r\n  A[开始] --> B[结束]");
  assertOnlyCrlfLineBreaks(result.value);
});

test("formatMarkdownMathBlock wraps selection or inserts a formula placeholder", () => {
  const wrapped = formatMarkdownMathBlock(
    { value: "before\nx+y\nafter", selectionStart: 7, selectionEnd: 10 },
  );

  assert.equal(wrapped.value, "before\n$$\nx+y\n$$\nafter");
  assert.equal(wrapped.selectionStart, 10);
  assert.equal(wrapped.selectionEnd, 13);

  const inserted = formatMarkdownMathBlock({ value: "", selectionStart: 0, selectionEnd: 0 });
  assert.equal(inserted.value, "$$\na^2 + b^2 = c^2\n$$\n");
  assert.equal(inserted.selectionStart, 3);
  assert.equal(inserted.selectionEnd, 18);
});

test("formatMarkdownMathBlock preserves CRLF line endings in generated fences", () => {
  const result = formatMarkdownMathBlock({ value: "before\r\nafter", selectionStart: "before\r\n".length, selectionEnd: "before\r\nafter".length });

  assert.equal(result.value, "before\r\n$$\r\nafter\r\n$$\r\n");
  assert.equal(result.selectionStart, "before\r\n$$\r\n".length);
  assert.equal(result.selectionEnd, "before\r\n$$\r\nafter".length);
  assertOnlyCrlfLineBreaks(result.value);
});

test("formatMarkdownMathBlock toggles closed math fences back to text like Typora", () => {
  const source = "before\n$$\nx+y\n$$\nafter";
  const result = formatMarkdownMathBlock({
    value: source,
    selectionStart: source.indexOf("+"),
    selectionEnd: source.indexOf("+"),
  });
  const expected = "before\nx+y\nafter";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.indexOf("+"),
    selectionEnd: expected.indexOf("+"),
  });

  const bracket = "before\n\\[\nx+y\n\\]\nafter";
  const bracketResult = formatMarkdownMathBlock({
    value: bracket,
    selectionStart: bracket.indexOf("+"),
    selectionEnd: bracket.indexOf("+"),
  });
  assert.deepEqual(bracketResult, {
    value: expected,
    selectionStart: expected.indexOf("+"),
    selectionEnd: expected.indexOf("+"),
  });
});

test("setHeadingLevel replaces an existing heading marker", () => {
  const result = setHeadingLevel({ value: "## Title", selectionStart: 0, selectionEnd: 0 }, 1);

  assert.equal(result.value, "# Title");
  assert.equal(result.selectionStart, 2);
  assert.equal(
    setHeadingLevel({ value: "  Title", selectionStart: 2, selectionEnd: 2 }, 2).value,
    "## Title",
  );
  assert.equal(
    setHeadingLevel({ value: "  ### Title", selectionStart: 5, selectionEnd: 5 }, 1).value,
    "# Title",
  );
  assert.deepEqual(
    setHeadingLevel({ value: "", selectionStart: 0, selectionEnd: 0 }, 2),
    { value: "## ", selectionStart: "## ".length, selectionEnd: "## ".length },
  );
});

test("setHeadingLevel applies headings inside blockquotes like Typora", () => {
  assert.deepEqual(
    setHeadingLevel({ value: "> Quote", selectionStart: "> ".length, selectionEnd: "> Quote".length }, 1),
    { value: "> # Quote", selectionStart: "> # ".length, selectionEnd: "> # Quote".length },
  );
  assert.deepEqual(
    setHeadingLevel({ value: ">Quote", selectionStart: ">".length, selectionEnd: ">Quote".length }, 2),
    { value: "> ## Quote", selectionStart: "> ## ".length, selectionEnd: "> ## Quote".length },
  );
  assert.deepEqual(
    setHeadingLevel({
      value: "> ### Title ###",
      selectionStart: "> ### ".length,
      selectionEnd: "> ### Title".length,
    }, 2),
    { value: "> ## Title", selectionStart: "> ## ".length, selectionEnd: "> ## Title".length },
  );
  assert.deepEqual(
    setHeadingLevel({ value: "> ", selectionStart: "> ".length, selectionEnd: "> ".length }, 1),
    { value: "> # ", selectionStart: "> # ".length, selectionEnd: "> # ".length },
  );
});

test("setHeadingLevel converts Setext headings without leaving underline markers", () => {
  assert.deepEqual(
    setHeadingLevel({ value: "Title\n---\nbody", selectionStart: 0, selectionEnd: 0 }, 1),
    { value: "# Title\nbody", selectionStart: 2, selectionEnd: 7 },
  );

  assert.deepEqual(
    setHeadingLevel({
      value: "Title\n===",
      selectionStart: "Title\n".length,
      selectionEnd: "Title\n".length,
    }, 2),
    { value: "## Title", selectionStart: 3, selectionEnd: 8 },
  );

  assert.deepEqual(
    setHeadingLevel({ value: "> Quoted\n> ---\nbody", selectionStart: "> Qu".length, selectionEnd: "> Qu".length }, 2),
    { value: "> ## Quoted\nbody", selectionStart: "> ## ".length, selectionEnd: "> ## Quoted".length },
  );

  assert.deepEqual(
    setHeadingLevel({ value: ">> Nested\n>> ===", selectionStart: 0, selectionEnd: 0 }, 1),
    { value: "> > # Nested", selectionStart: "> > # ".length, selectionEnd: "> > # Nested".length },
  );
});

test("setHeadingLevel leaves single-character Setext markers in the paragraph", () => {
  for (const marker of ["=", "-"]) {
    const source = "Title\n" + marker + "\nbody";
    const result = setHeadingLevel({ value: source, selectionStart: 0, selectionEnd: 0 }, 1);
    assert.equal(result.value, "# Title\n" + marker + "\nbody", marker);
  }
});

test("setHeadingLevel preserves CRLF when converting Setext headings", () => {
  const source = "Title\r\n---\r\nbody";
  const result = setHeadingLevel({ value: source, selectionStart: 0, selectionEnd: 0 }, 1);

  assert.deepEqual(result, {
    value: "# Title\r\nbody",
    selectionStart: "# ".length,
    selectionEnd: "# Title".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("setHeadingLevel preserves CRLF when formatting ordinary lines", () => {
  const result = setHeadingLevel({
    value: "alpha\r\nbeta",
    selectionStart: "al".length,
    selectionEnd: "alpha\r\nbe".length,
  }, 2);

  assert.deepEqual(result, {
    value: "## alpha\r\n## beta",
    selectionStart: "## al".length,
    selectionEnd: "## alpha\r\n## be".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("adjustHeadingLevel increases and decreases heading levels like Typora", () => {
  assert.deepEqual(
    adjustHeadingLevel({ value: "### Title", selectionStart: 4, selectionEnd: 4 }, "increase"),
    { value: "## Title", selectionStart: 3, selectionEnd: 3 },
  );

  assert.deepEqual(
    adjustHeadingLevel({ value: "### Title", selectionStart: 4, selectionEnd: 4 }, "decrease"),
    { value: "#### Title", selectionStart: 5, selectionEnd: 5 },
  );

  assert.deepEqual(
    adjustHeadingLevel({ value: "# Title", selectionStart: 2, selectionEnd: 2 }, "decrease"),
    { value: "Title", selectionStart: 0, selectionEnd: 0 },
  );

  assert.deepEqual(
    adjustHeadingLevel({ value: "Title", selectionStart: 0, selectionEnd: 0 }, "increase"),
    { value: "###### Title", selectionStart: 7, selectionEnd: 7 },
  );

  assert.deepEqual(
    adjustHeadingLevel({ value: "Title", selectionStart: 0, selectionEnd: 0 }, "decrease"),
    { value: "Title", selectionStart: 0, selectionEnd: 0 },
  );
});

test("adjustHeadingLevel handles Setext and quoted headings like Typora", () => {
  assert.deepEqual(
    adjustHeadingLevel({ value: "Title\n---\nbody", selectionStart: 0, selectionEnd: 0 }, "increase"),
    { value: "# Title\nbody", selectionStart: 2, selectionEnd: 7 },
  );

  assert.deepEqual(
    adjustHeadingLevel({ value: "Title\n===\nbody", selectionStart: 0, selectionEnd: 0 }, "decrease"),
    { value: "Title\nbody", selectionStart: 0, selectionEnd: 0 },
  );

  assert.deepEqual(
    adjustHeadingLevel({ value: "> ### Quote", selectionStart: "> ### Q".length, selectionEnd: "> ### Q".length }, "increase"),
    { value: "> ## Quote", selectionStart: "> ## Q".length, selectionEnd: "> ## Q".length },
  );
});

test("setParagraphText removes heading markers", () => {
  const result = setParagraphText({ value: "### Title", selectionStart: 4, selectionEnd: 4 });

  assert.equal(result.value, "Title");
  assert.equal(result.selectionStart, 0);
  assert.equal(
    setParagraphText({ value: "### Title ###", selectionStart: 4, selectionEnd: 4 }).value,
    "Title",
  );
  assert.equal(
    setParagraphText({ value: "# C#", selectionStart: 2, selectionEnd: 2 }).value,
    "C#",
  );
});

test("setParagraphText removes ATX closing markers from multi-line selections", () => {
  const source = "### Title ###\n## C#";
  const result = setParagraphText({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.deepEqual(result, {
    value: "Title\nC#",
    selectionStart: 0,
    selectionEnd: "Title\nC#".length,
  });
});

test("setParagraphText converts Setext headings to plain text", () => {
  assert.deepEqual(
    setParagraphText({ value: "Title\n---\nbody", selectionStart: 2, selectionEnd: 2 }),
    { value: "Title\nbody", selectionStart: 2, selectionEnd: 2 },
  );

  assert.deepEqual(
    setParagraphText({
      value: "Title\n===",
      selectionStart: "Title\n==".length,
      selectionEnd: "Title\n==".length,
    }),
    { value: "Title", selectionStart: 5, selectionEnd: 5 },
  );

  assert.deepEqual(
    setParagraphText({ value: "> Title\n> ---\nbody", selectionStart: "> Ti".length, selectionEnd: "> Ti".length }),
    { value: "Title\nbody", selectionStart: "Ti".length, selectionEnd: "Ti".length },
  );
});

test("setParagraphText preserves CRLF when converting Setext headings", () => {
  const source = "Title\r\n---\r\nbody";
  const result = setParagraphText({ value: source, selectionStart: "Ti".length, selectionEnd: "Ti".length });

  assert.deepEqual(result, {
    value: "Title\r\nbody",
    selectionStart: "Ti".length,
    selectionEnd: "Ti".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("setParagraphText removes quote and list block markers", () => {
  assert.equal(
    setParagraphText({ value: "> Quote", selectionStart: 2, selectionEnd: 2 }).value,
    "Quote",
  );
  assert.equal(
    setParagraphText({ value: "- [x] Task", selectionStart: 6, selectionEnd: 6 }).value,
    "Task",
  );
  assert.equal(
    setParagraphText({ value: "1. Item", selectionStart: 3, selectionEnd: 3 }).value,
    "Item",
  );
  assert.equal(
    setParagraphText({ value: "1. [x] Task", selectionStart: "1. [x] ".length, selectionEnd: "1. [x] ".length }).value,
    "Task",
  );
  assert.equal(
    setParagraphText({ value: "> 1. [ ] Task", selectionStart: "> 1. [ ] ".length, selectionEnd: "> 1. [ ] ".length }).value,
    "Task",
  );
  assert.equal(
    setParagraphText({ value: ": Definition", selectionStart: ": ".length, selectionEnd: ": ".length }).value,
    "Definition",
  );
  assert.equal(
    setParagraphText({ value: "[^1]: detail", selectionStart: "[^1]: ".length, selectionEnd: "[^1]: ".length }).value,
    "detail",
  );
  assert.equal(
    setParagraphText({ value: "> [^1]: detail", selectionStart: "> [^1]: ".length, selectionEnd: "> [^1]: ".length }).value,
    "detail",
  );
  assert.equal(
    setParagraphText({
      value: "paragraph\n    - code",
      selectionStart: "paragraph\n    - ".length,
      selectionEnd: "paragraph\n    - ".length,
    }).value,
    "paragraph\n    - code",
  );
});

test("setParagraphText keeps the cursor with paragraph text like Typora", () => {
  assert.deepEqual(
    setParagraphText({
      value: "> - [x] alpha beta",
      selectionStart: "> - [x] alpha".length,
      selectionEnd: "> - [x] alpha".length,
    }),
    {
      value: "alpha beta",
      selectionStart: "alpha".length,
      selectionEnd: "alpha".length,
    },
  );

  const source = "> alpha\n> 1. [ ] beta";
  assert.deepEqual(
    setParagraphText({
      value: source,
      selectionStart: "> al".length,
      selectionEnd: source.indexOf("beta") + "be".length,
    }),
    {
      value: "alpha\nbeta",
      selectionStart: "al".length,
      selectionEnd: "alpha\nbe".length,
    },
  );
});

test("setParagraphText preserves CRLF when clearing ordinary block markers", () => {
  const result = setParagraphText({
    value: "> # alpha\r\n> - beta",
    selectionStart: "> # al".length,
    selectionEnd: "> # alpha\r\n> - be".length,
  });

  assert.deepEqual(result, {
    value: "alpha\r\nbeta",
    selectionStart: "al".length,
    selectionEnd: "alpha\r\nbe".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("prefixMarkdownLines applies blockquote to each selected non-empty line", () => {
  const result = prefixMarkdownLines(
    { value: "alpha\nbeta\n\nnext", selectionStart: 0, selectionEnd: 10 },
    "> ",
  );

  assert.equal(result.value, "> alpha\n> beta\n\nnext");
});

test("prefixMarkdownLines preserves CRLF line endings like Typora", () => {
  const result = prefixMarkdownLines(
    { value: "alpha\r\nbeta\r\n\r\nnext", selectionStart: 0, selectionEnd: "alpha\r\nbeta".length },
    "> ",
  );

  assert.deepEqual(result, {
    value: "> alpha\r\n> beta\r\n\r\nnext",
    selectionStart: 2,
    selectionEnd: "> alpha\r\n> beta".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("prefixNumberedMarkdownLines preserves CRLF and skips blank lines like Typora", () => {
  const result = prefixNumberedMarkdownLines({
    value: "alpha\r\n\r\nbeta",
    selectionStart: 0,
    selectionEnd: "alpha\r\n\r\nbeta".length,
  });

  assert.deepEqual(result, {
    value: "1. alpha\r\n\r\n2. beta",
    selectionStart: 3,
    selectionEnd: "1. alpha\r\n\r\n2. beta".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("selectCurrentLine expands the selection to full content lines", () => {
  assert.deepEqual(
    selectCurrentLine({ value: "alpha\nbeta\ngamma", selectionStart: 8, selectionEnd: 8 }),
    { value: "alpha\nbeta\ngamma", selectionStart: 6, selectionEnd: 10 },
  );

  assert.deepEqual(
    selectCurrentLine({ value: "alpha\nbeta\ngamma", selectionStart: 8, selectionEnd: 13 }),
    { value: "alpha\nbeta\ngamma", selectionStart: 6, selectionEnd: 16 },
  );
});

test("selectCurrentParagraph expands through adjacent non-empty lines", () => {
  assert.deepEqual(
    selectCurrentParagraph({ value: "one\n two\n\nthree", selectionStart: 5, selectionEnd: 5 }),
    { value: "one\n two\n\nthree", selectionStart: 0, selectionEnd: 8 },
  );
});

test("selectCurrentWord selects the word around the cursor like Typora", () => {
  assert.deepEqual(
    selectCurrentWord({ value: "alpha beta_gamma 中文42.", selectionStart: "alpha be".length, selectionEnd: "alpha be".length }),
    { value: "alpha beta_gamma 中文42.", selectionStart: "alpha ".length, selectionEnd: "alpha beta_gamma".length },
  );

  assert.deepEqual(
    selectCurrentWord({ value: "alpha beta", selectionStart: "alpha".length, selectionEnd: "alpha".length }),
    { value: "alpha beta", selectionStart: 0, selectionEnd: "alpha".length },
  );

  assert.deepEqual(
    selectCurrentWord({ value: "alpha beta", selectionStart: "alpha ".length, selectionEnd: "alpha ".length }),
    { value: "alpha beta", selectionStart: "alpha ".length, selectionEnd: "alpha beta".length },
  );
});

test("selectCurrentSentence selects the sentence around the cursor like Typora", () => {
  const source = "First sentence. Second sentence! 第三句？ Next";
  const secondStart = source.indexOf("Second");
  assert.deepEqual(
    selectCurrentSentence({ value: source, selectionStart: secondStart, selectionEnd: secondStart }),
    { value: source, selectionStart: secondStart, selectionEnd: source.indexOf("!") + 1 },
  );

  const chineseStart = source.indexOf("三");
  assert.equal(
    source.slice(
      selectCurrentSentence({ value: source, selectionStart: chineseStart, selectionEnd: chineseStart }).selectionStart,
      selectCurrentSentence({ value: source, selectionStart: chineseStart, selectionEnd: chineseStart }).selectionEnd,
    ),
    "第三句？",
  );

  assert.deepEqual(
    selectCurrentSentence({ value: source, selectionStart: 0, selectionEnd: 5 }),
    { value: source, selectionStart: 0, selectionEnd: 5 },
  );
});

test("deleteCurrentWord deletes selected text or the word around the cursor like Typora", () => {
  assert.deepEqual(
    deleteCurrentWord({ value: "alpha beta_gamma 中文42.", selectionStart: "alpha be".length, selectionEnd: "alpha be".length }),
    { value: "alpha  中文42.", selectionStart: "alpha ".length, selectionEnd: "alpha ".length },
  );

  assert.deepEqual(
    deleteCurrentWord({ value: "alpha beta", selectionStart: 0, selectionEnd: "alpha".length }),
    { value: " beta", selectionStart: 0, selectionEnd: 0 },
  );
});

test("deleteCurrentSentence deletes the sentence around the cursor like Typora", () => {
  const source = "First sentence. Second sentence! Third.";
  const cursor = source.indexOf("Second");
  assert.deepEqual(
    deleteCurrentSentence({ value: source, selectionStart: cursor, selectionEnd: cursor }),
    { value: "First sentence.  Third.", selectionStart: "First sentence. ".length, selectionEnd: "First sentence. ".length },
  );
});

test("deleteCurrentParagraph deletes the current paragraph like Typora", () => {
  const source = "Intro\n\nMiddle line one\nMiddle line two\n\nOutro";
  const cursor = source.indexOf("line two");
  assert.deepEqual(
    deleteCurrentParagraph({ value: source, selectionStart: cursor, selectionEnd: cursor }),
    { value: "Intro\n\n\n\nOutro", selectionStart: "Intro\n\n".length, selectionEnd: "Intro\n\n".length },
  );
});

test("deleteCurrentStyleScope deletes the current style range like Typora", () => {
  const source = "Keep **bold** text";
  const cursor = source.indexOf("ol");
  assert.deepEqual(
    deleteCurrentStyleScope({ value: source, selectionStart: cursor, selectionEnd: cursor }),
    { value: "Keep **** text", selectionStart: "Keep **".length, selectionEnd: "Keep **".length },
  );
});

test("selectCurrentStyleScope selects styled text or table cells like Typora", () => {
  const styled = "plain **bold text** and [docs](https://example.com)";
  assert.deepEqual(
    selectCurrentStyleScope({ value: styled, selectionStart: styled.indexOf("bold"), selectionEnd: styled.indexOf("bold") }),
    { value: styled, selectionStart: styled.indexOf("bold"), selectionEnd: styled.indexOf("** and") },
  );

  assert.deepEqual(
    selectCurrentStyleScope({ value: styled, selectionStart: styled.indexOf("https"), selectionEnd: styled.indexOf("https") }),
    { value: styled, selectionStart: styled.indexOf("https"), selectionEnd: styled.indexOf(")") },
  );

  const table = "| A | B |\n| --- | --- |\n| one | two |\n";
  assert.deepEqual(
    selectCurrentStyleScope({ value: table, selectionStart: table.indexOf("two"), selectionEnd: table.indexOf("two") }),
    { value: table, selectionStart: table.indexOf("two"), selectionEnd: table.indexOf("two") + 3 },
  );
});

test("duplicateMarkdownLines duplicates the current or selected lines below", () => {
  assert.deepEqual(
    duplicateMarkdownLines({ value: "alpha\nbeta", selectionStart: 7, selectionEnd: 7 }),
    { value: "alpha\nbeta\nbeta", selectionStart: 12, selectionEnd: 12 },
  );

  assert.equal(
    duplicateMarkdownLines({ value: "a\nb\nc", selectionStart: 0, selectionEnd: 3 }).value,
    "a\nb\na\nb\nc",
  );
});

test("duplicateMarkdownLines preserves CRLF line endings at the document end like Typora", () => {
  assert.deepEqual(
    duplicateMarkdownLines({ value: "alpha\r\nbeta", selectionStart: "alpha\r\nbe".length, selectionEnd: "alpha\r\nbe".length }),
    { value: "alpha\r\nbeta\r\nbeta", selectionStart: "alpha\r\nbeta\r\nbe".length, selectionEnd: "alpha\r\nbeta\r\nbe".length },
  );
});

test("deleteMarkdownLines deletes the current or selected lines", () => {
  assert.deepEqual(
    deleteMarkdownLines({ value: "alpha\nbeta\ngamma", selectionStart: "alpha\nbe".length, selectionEnd: "alpha\nbe".length }),
    { value: "alpha\ngamma", selectionStart: "alpha\n".length, selectionEnd: "alpha\n".length },
  );

  assert.deepEqual(
    deleteMarkdownLines({ value: "alpha\nbeta\ngamma", selectionStart: "al".length, selectionEnd: "alpha\nbeta".length }),
    { value: "gamma", selectionStart: 0, selectionEnd: 0 },
  );
});

test("deleteMarkdownLines preserves CRLF line endings", () => {
  const result = deleteMarkdownLines({
    value: "alpha\r\nbeta\r\ngamma",
    selectionStart: "alpha\r\nbe".length,
    selectionEnd: "alpha\r\nbe".length,
  });

  assert.deepEqual(result, {
    value: "alpha\r\ngamma",
    selectionStart: "alpha\r\n".length,
    selectionEnd: "alpha\r\n".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("duplicateMarkdownLines renumbers ordered list items like Typora", () => {
  const source = "1. one\n2. two\n3. three";
  const result = duplicateMarkdownLines({ value: source, selectionStart: source.indexOf("two"), selectionEnd: source.indexOf("two") });

  assert.equal(result.value, "1. one\n2. two\n3. two\n4. three");
  assert.equal(result.selectionStart, "1. one\n2. two\n3. ".length);
  assert.equal(result.selectionEnd, result.selectionStart);
});

test("duplicateMarkdownLines does not renumber four-space ordered code outside lists like Typora", () => {
  const source = "paragraph\n    3. code\n    10. code";
  const result = duplicateMarkdownLines({
    value: source,
    selectionStart: source.indexOf("3. code"),
    selectionEnd: source.indexOf("3. code"),
  });

  assert.equal(result.value, "paragraph\n    3. code\n    3. code\n    10. code");
  assert.equal(result.selectionStart, "paragraph\n    3. code\n    ".length);
  assert.equal(result.selectionEnd, result.selectionStart);
});

test("moveMarkdownLines moves current or selected lines up and down", () => {
  assert.deepEqual(
    moveMarkdownLines({ value: "a\nb\nc", selectionStart: 2, selectionEnd: 2 }, "up"),
    { value: "b\na\nc", selectionStart: 0, selectionEnd: 0 },
  );

  assert.deepEqual(
    moveMarkdownLines({ value: "a\nb\nc", selectionStart: 2, selectionEnd: 3 }, "down"),
    { value: "a\nc\nb", selectionStart: 4, selectionEnd: 5 },
  );

  assert.deepEqual(
    moveMarkdownLines({ value: "a\nb", selectionStart: 0, selectionEnd: 0 }, "up"),
    { value: "a\nb", selectionStart: 0, selectionEnd: 0 },
  );
});

test("moveMarkdownLines preserves CRLF line endings like Typora", () => {
  const up = moveMarkdownLines({ value: "a\r\nb\r\nc", selectionStart: "a\r\nb".length, selectionEnd: "a\r\nb".length }, "up");
  assert.deepEqual(up, {
    value: "b\r\na\r\nc",
    selectionStart: "b".length,
    selectionEnd: "b".length,
  });
  assertOnlyCrlfLineBreaks(up.value);

  const down = moveMarkdownLines({ value: "a\r\nb\r\nc", selectionStart: "a\r\nb".length, selectionEnd: "a\r\nb".length }, "down");
  assert.deepEqual(down, {
    value: "a\r\nc\r\nb",
    selectionStart: "a\r\nc\r\nb".length,
    selectionEnd: "a\r\nc\r\nb".length,
  });
  assertOnlyCrlfLineBreaks(down.value);
});

test("moveMarkdownBlocks moves complete rich-text paragraphs and syntax blocks", () => {
  const source = "First line\ncontinued\n\n## Second\n\nThird";
  const down = moveMarkdownBlocks({
    value: source,
    selectionStart: source.indexOf("continued"),
    selectionEnd: source.indexOf("continued"),
  }, "down");
  assert.equal(down.value, "## Second\n\nFirst line\ncontinued\n\nThird");
  assert.equal(down.value.slice(down.selectionStart).startsWith("continued"), true);

  const up = moveMarkdownBlocks(down, "up");
  assert.deepEqual(up, {
    value: source,
    selectionStart: source.indexOf("continued"),
    selectionEnd: source.indexOf("continued"),
  });
});

test("moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏", () => {
  const source = "---\r\ntitle: Marko\r\nauthor: chain-code\r\nversion: 1\r\n...\r\nBody";
  const authorStart = source.indexOf("author");
  const moved = moveMarkdownBlocks({
    value: source,
    selectionStart: authorStart,
    selectionEnd: authorStart + "author".length,
  }, "up");

  assert.equal(
    moved.value,
    "---\r\nauthor: chain-code\r\ntitle: Marko\r\nversion: 1\r\n...\r\nBody",
  );
  assert.equal(moved.value.slice(moved.selectionStart, moved.selectionEnd), "author");
  assertOnlyCrlfLineBreaks(moved.value);

  const scalarSource = "---\nnotes: |\n  9. nine\n  10. ten\n---\nBody";
  const scalarCursor = scalarSource.indexOf("10. ten");
  assert.equal(
    moveMarkdownBlocks({
      value: scalarSource,
      selectionStart: scalarCursor,
      selectionEnd: scalarCursor,
    }, "up").value,
    "---\nnotes: |\n  10. ten\n  9. nine\n---\nBody",
  );

  for (const boundary of [
    { cursor: source.indexOf("title"), direction: "up" as const },
    { cursor: source.indexOf("version"), direction: "down" as const },
    { cursor: 1, direction: "down" as const },
    { cursor: source.indexOf("...") + 1, direction: "up" as const },
    { cursor: source.indexOf("Body"), direction: "up" as const },
  ]) {
    assert.deepEqual(
      moveMarkdownBlocks({
        value: source,
        selectionStart: boundary.cursor,
        selectionEnd: boundary.cursor,
      }, boundary.direction),
      {
        value: source,
        selectionStart: boundary.cursor,
        selectionEnd: boundary.cursor,
      },
    );
  }
});

test("moveMarkdownBlocks 只移动无空行相邻的 ATX 标题", () => {
  const source = "Before\n# Heading\nAfter";
  const headingStart = source.indexOf("Heading");
  const moved = moveMarkdownBlocks({
    value: source,
    selectionStart: headingStart,
    selectionEnd: headingStart,
  }, "down");

  assert.equal(moved.value, "Before\nAfter\n# Heading");
  assert.equal(moved.value.slice(moved.selectionStart).startsWith("Heading"), true);
});

test("moveMarkdownBlocks moves and renumbers sibling list items", () => {
  const source = "1. one\n2. two\n3. three";
  const result = moveMarkdownBlocks({
    value: source,
    selectionStart: source.indexOf("two"),
    selectionEnd: source.indexOf("two"),
  }, "up");

  assert.equal(result.value, "1. two\n2. one\n3. three");
  assert.equal(result.value.slice(result.selectionStart).startsWith("two"), true);
});

test("moveMarkdownBlocks climbs out of a list at its boundary", () => {
  const source = "Before\n\n- one\n- two\n\nAfter";
  const result = moveMarkdownBlocks({
    value: source,
    selectionStart: source.indexOf("one"),
    selectionEnd: source.indexOf("one"),
  }, "up");

  assert.equal(result.value, "- one\n- two\n\nBefore\n\nAfter");
  assert.equal(result.value.slice(result.selectionStart).startsWith("one"), true);
});

test("moveMarkdownBlocks preserves CRLF block separators", () => {
  const source = "One\r\n\r\nTwo\r\n\r\nThree";
  const result = moveMarkdownBlocks({
    value: source,
    selectionStart: source.indexOf("Two"),
    selectionEnd: source.indexOf("Two"),
  }, "down");

  assert.equal(result.value, "One\r\n\r\nThree\r\n\r\nTwo");
});

test("moveMarkdownLines renumbers ordered list items like Typora", () => {
  const source = "1. one\n2. two\n3. three";
  assert.equal(
    moveMarkdownLines({ value: source, selectionStart: source.indexOf("two"), selectionEnd: source.indexOf("two") }, "down").value,
    "1. one\n2. three\n3. two",
  );
  assert.equal(
    moveMarkdownLines({ value: source, selectionStart: source.indexOf("two"), selectionEnd: source.indexOf("two") }, "up").value,
    "1. two\n2. one\n3. three",
  );

  const customStart = "9. nine\n10. ten\n11. eleven";
  assert.equal(
    moveMarkdownLines({ value: customStart, selectionStart: customStart.indexOf("ten"), selectionEnd: customStart.indexOf("ten") }, "up").value,
    "9. ten\n10. nine\n11. eleven",
  );
});

test("list moves preserve selections across ordered marker width changes", () => {
  const lineSource = "9. nine\n10. ten\n11. eleven";
  const lineStart = lineSource.indexOf("ten");
  const movedLine = moveMarkdownLines({
    value: lineSource,
    selectionStart: lineStart,
    selectionEnd: lineStart + "ten".length,
  }, "up");
  assert.equal(movedLine.value, "9. ten\n10. nine\n11. eleven");
  assert.equal(movedLine.value.slice(movedLine.selectionStart, movedLine.selectionEnd), "ten");

  const blockSource = "99. ninety-nine\r\n100. hundred\r\n101. next";
  const blockStart = blockSource.indexOf("hundred");
  const movedBlock = moveMarkdownBlocks({
    value: blockSource,
    selectionStart: blockStart,
    selectionEnd: blockStart + "hundred".length,
  }, "up");
  assert.equal(movedBlock.value, "99. hundred\r\n100. ninety-nine\r\n101. next");
  assert.equal(
    movedBlock.value.slice(movedBlock.selectionStart, movedBlock.selectionEnd),
    "hundred",
  );
  assertOnlyCrlfLineBreaks(movedBlock.value);
});

test("moveMarkdownLines does not renumber four-space ordered code outside lists like Typora", () => {
  const source = "paragraph\n    3. code\n    10. code";

  assert.equal(
    moveMarkdownLines({
      value: source,
      selectionStart: source.indexOf("10. code"),
      selectionEnd: source.indexOf("10. code"),
    }, "up").value,
    "paragraph\n    10. code\n    3. code",
  );
});

test("continueMarkdownList continues bullet, ordered, and task list markers", () => {
  assert.deepEqual(
    continueMarkdownList({ value: "- item", selectionStart: 6, selectionEnd: 6 }),
    { value: "- item\n- ", selectionStart: 9, selectionEnd: 9 },
  );
  assert.deepEqual(
    continueMarkdownList({ value: "9. item", selectionStart: 7, selectionEnd: 7 }),
    { value: "9. item\n10. ", selectionStart: 12, selectionEnd: 12 },
  );
  assert.deepEqual(
    continueMarkdownList({ value: "- [x] done", selectionStart: 10, selectionEnd: 10 }),
    { value: "- [x] done\n- [ ] ", selectionStart: 17, selectionEnd: 17 },
  );
});

test("ordered list commands support arbitrary-length marker digits", () => {
  const nineDigitItem = "123456789. item";
  const continued = {
    value: "123456789. item\n123456790. ",
    selectionStart: "123456789. item\n123456790. ".length,
    selectionEnd: "123456789. item\n123456790. ".length,
  };
  assert.deepEqual(
    continueMarkdownList({ value: nineDigitItem, selectionStart: nineDigitItem.length, selectionEnd: nineDigitItem.length }),
    continued,
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: nineDigitItem, selectionStart: nineDigitItem.length, selectionEnd: nineDigitItem.length }),
    continued,
  );

  const tenDigitItem = "1234567890. item";
  const tenDigitContinued = {
    value: "1234567890. item\n1234567891. ",
    selectionStart: "1234567890. item\n1234567891. ".length,
    selectionEnd: "1234567890. item\n1234567891. ".length,
  };
  assert.deepEqual(
    continueMarkdownList({ value: tenDigitItem, selectionStart: tenDigitItem.length, selectionEnd: tenDigitItem.length }),
    tenDigitContinued,
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: tenDigitItem, selectionStart: tenDigitItem.length, selectionEnd: tenDigitItem.length }),
    tenDigitContinued,
  );

  const nineDigitMarker = "123456789.";
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: nineDigitMarker, selectionStart: nineDigitMarker.length, selectionEnd: nineDigitMarker.length }),
    { value: `${nineDigitMarker} `, selectionStart: nineDigitMarker.length + 1, selectionEnd: nineDigitMarker.length + 1 },
  );
  const tenDigitMarker = "1234567890.";
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: tenDigitMarker, selectionStart: tenDigitMarker.length, selectionEnd: tenDigitMarker.length }),
    { value: tenDigitMarker + " ", selectionStart: tenDigitMarker.length + 1, selectionEnd: tenDigitMarker.length + 1 },
  );

  const nestedNineDigit = "  123456789. child";
  assert.deepEqual(
    outdentMarkdownListOnBackspace({
      value: nestedNineDigit,
      selectionStart: "  123456789. ".length,
      selectionEnd: "  123456789. ".length,
    }),
    { value: "123456789. child", selectionStart: "123456789. ".length, selectionEnd: "123456789. ".length },
  );
  const nestedTenDigit = "  1234567890. child";
  assert.deepEqual(
    outdentMarkdownListOnBackspace({
      value: nestedTenDigit,
      selectionStart: "  1234567890. ".length,
      selectionEnd: "  1234567890. ".length,
    }),
    { value: "1234567890. child", selectionStart: "1234567890. ".length, selectionEnd: "1234567890. ".length },
  );

  assert.deepEqual(
    insertMarkdownSoftBreak({ value: nineDigitItem, selectionStart: nineDigitItem.length, selectionEnd: nineDigitItem.length }),
    {
      value: `${nineDigitItem}  \n${" ".repeat(11)}`,
      selectionStart: `${nineDigitItem}  \n${" ".repeat(11)}`.length,
      selectionEnd: `${nineDigitItem}  \n${" ".repeat(11)}`.length,
    },
  );
  assert.deepEqual(
    insertMarkdownSoftBreak({ value: tenDigitItem, selectionStart: tenDigitItem.length, selectionEnd: tenDigitItem.length }),
    {
      value: `${tenDigitItem}  \n${" ".repeat(12)}`,
      selectionStart: `${tenDigitItem}  \n${" ".repeat(12)}`.length,
      selectionEnd: `${tenDigitItem}  \n${" ".repeat(12)}`.length,
    },
  );

  const carryItem = "999999999999999999999999999999. item";
  assert.equal(
    continueMarkdownList({ value: carryItem, selectionStart: carryItem.length, selectionEnd: carryItem.length })?.value,
    "999999999999999999999999999999. item\n1000000000000000000000000000000. ",
  );
});

test("task conversion and formatting recognize ten-digit ordered prefixes", () => {
  const nineDigitItem = "123456789. item";
  assert.equal(
    toggleTaskAtSelection({ value: nineDigitItem, selectionStart: nineDigitItem.length, selectionEnd: nineDigitItem.length }).value,
    "123456789. [ ] item",
  );

  const tenDigitItem = "1234567890. item";
  assert.equal(
    toggleTaskAtSelection({ value: tenDigitItem, selectionStart: tenDigitItem.length, selectionEnd: tenDigitItem.length }).value,
    "1234567890. [ ] item",
  );

  const nineDigitTasks = "123456789. [x] done\nplain";
  assert.equal(
    formatMarkdownLines({ value: nineDigitTasks, selectionStart: 0, selectionEnd: nineDigitTasks.length }, "task").value,
    "- [x] done\n- [ ] plain",
  );
  const tenDigitTasks = "1234567890. [x] done\nplain";
  assert.equal(
    formatMarkdownLines({ value: tenDigitTasks, selectionStart: 0, selectionEnd: tenDigitTasks.length }, "task").value,
    "- [x] done\n- [ ] plain",
  );

  const nineDigitFormatted = "123456789. **item**";
  assert.equal(
    clearMarkdownFormatting({ value: nineDigitFormatted, selectionStart: 0, selectionEnd: nineDigitFormatted.length }).value,
    "item",
  );
  const tenDigitFormatted = "1234567890. **item**";
  assert.equal(
    clearMarkdownFormatting({ value: tenDigitFormatted, selectionStart: 0, selectionEnd: tenDigitFormatted.length }).value,
    "item",
  );
});

test("continueMarkdownList renumbers following ordered list items", () => {
  const list = "1. one\n2. two\n3. three";
  const result = continueMarkdownList({
    value: list,
    selectionStart: "1. one".length,
    selectionEnd: "1. one".length,
  });

  assert.deepEqual(result, {
    value: "1. one\n2. \n3. two\n4. three",
    selectionStart: "1. one\n2. ".length,
    selectionEnd: "1. one\n2. ".length,
  });

  assert.deepEqual(
    continueMarkdownList({ value: "9. nine\n10. ten", selectionStart: "9. nine".length, selectionEnd: "9. nine".length }),
    { value: "9. nine\n10. \n11. ten", selectionStart: "9. nine\n10. ".length, selectionEnd: "9. nine\n10. ".length },
  );
});

test("continueMarkdownList preserves CRLF while renumbering like Typora", () => {
  const list = "1. one\r\n2. two\r\n3. three";
  const result = continueMarkdownList({
    value: list,
    selectionStart: "1. one".length,
    selectionEnd: "1. one".length,
  });
  const expected = "1. one\r\n2. \r\n3. two\r\n4. three";

  assert.ok(result);
  assert.deepEqual(result, {
    value: expected,
    selectionStart: "1. one\r\n2. ".length,
    selectionEnd: "1. one\r\n2. ".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("continueMarkdownList renumbers ordered lists across nested child items", () => {
  const list = "1. one\n   1. child\n2. two";
  const result = continueMarkdownList({
    value: list,
    selectionStart: "1. one".length,
    selectionEnd: "1. one".length,
  });

  assert.deepEqual(result, {
    value: "1. one\n2. \n   1. child\n3. two",
    selectionStart: "1. one\n2. ".length,
    selectionEnd: "1. one\n2. ".length,
  });
});

test("continueMarkdownList removes an empty list marker", () => {
  const result = continueMarkdownList({ value: "- ", selectionStart: 2, selectionEnd: 2 });

  assert.deepEqual(result, { value: "", selectionStart: 0, selectionEnd: 0 });
});

test("continueMarkdownList 保留 Typora 紧凑星号嵌套并续写最内层", () => {
  const second = "* one\n* * two";
  const secondContinued = second + "\n  * ";
  assert.deepEqual(
    continueMarkdownList({ value: second, selectionStart: second.length, selectionEnd: second.length }),
    {
      value: secondContinued,
      selectionStart: secondContinued.length,
      selectionEnd: secondContinued.length,
    },
  );

  const third = second + "\n  * * three";
  const thirdContinued = third + "\n    * ";
  assert.deepEqual(
    continueMarkdownList({ value: third, selectionStart: third.length, selectionEnd: third.length }),
    {
      value: thirdContinued,
      selectionStart: thirdContinued.length,
      selectionEnd: thirdContinued.length,
    },
  );
});

test("continueMarkdownList 的空二三级项一次退出并保留当前缩进", () => {
  const second = "* one\n* * ";
  assert.deepEqual(
    continueMarkdownList({ value: second, selectionStart: second.length, selectionEnd: second.length }),
    {
      value: "* one\n  ",
      selectionStart: "* one\n  ".length,
      selectionEnd: "* one\n  ".length,
    },
  );

  const third = "* one\n* * two\n  * * ";
  assert.deepEqual(
    continueMarkdownList({ value: third, selectionStart: third.length, selectionEnd: third.length }),
    {
      value: "* one\n* * two\n    ",
      selectionStart: "* one\n* * two\n    ".length,
      selectionEnd: "* one\n* * two\n    ".length,
    },
  );
});

test("continueMarkdownList 删除空嵌套标记并保留 Typora 缩进", () => {
  assert.deepEqual(
    continueMarkdownList({ value: "  - ", selectionStart: "  - ".length, selectionEnd: "  - ".length }),
    { value: "  ", selectionStart: 2, selectionEnd: 2 },
  );
  assert.deepEqual(
    continueMarkdownList({ value: "- parent\n\t- [x] ", selectionStart: "- parent\n\t- [x] ".length, selectionEnd: "- parent\n\t- [x] ".length }),
    { value: "- parent\n\t", selectionStart: "- parent\n\t".length, selectionEnd: "- parent\n\t".length },
  );
  assert.deepEqual(
    continueMarkdownList({ value: "1. parent\n    3. ", selectionStart: "1. parent\n    3. ".length, selectionEnd: "1. parent\n    3. ".length }),
    { value: "1. parent\n    ", selectionStart: "1. parent\n    ".length, selectionEnd: "1. parent\n    ".length },
  );

  const ordered = "9. nine\n  1. \n10. ten";
  assert.deepEqual(
    continueMarkdownList({ value: ordered, selectionStart: "9. nine\n  1. ".length, selectionEnd: "9. nine\n  1. ".length }),
    { value: "9. nine\n  \n10. ten", selectionStart: "9. nine\n  ".length, selectionEnd: "9. nine\n  ".length },
  );
});
test("list Enter and Backspace honor two- and four-space indentation settings", () => {
  const empty = "- parent\n    - ";
  assert.equal(
    continueMarkdownList({ value: empty, selectionStart: empty.length, selectionEnd: empty.length }, 2)?.value,
    "- parent\n    ",
  );
  assert.equal(
    continueMarkdownList({ value: empty, selectionStart: empty.length, selectionEnd: empty.length }, 4)?.value,
    "- parent\n    ",
  );

  const quotedEmpty = "> - parent\n>     - ";
  assert.equal(
    continueMarkdownBlock({
      value: quotedEmpty,
      selectionStart: quotedEmpty.length,
      selectionEnd: quotedEmpty.length,
    }, 4)?.value,
    "> - parent\n>     ",
  );

  const nested = "- parent\n    - child";
  assert.equal(
    outdentMarkdownListOnBackspace({
      value: nested,
      selectionStart: "- parent\n    - ".length,
      selectionEnd: "- parent\n    - ".length,
    }, 2)?.value,
    "- parent\n  - child",
  );
  assert.equal(
    outdentMarkdownListOnBackspace({
      value: nested,
      selectionStart: "- parent\n    - ".length,
      selectionEnd: "- parent\n    - ".length,
    }, 4)?.value,
    "- parent\n- child",
  );

  const quotedNested = "> - parent\n>     - child";
  assert.equal(
    outdentMarkdownListOnBackspace({
      value: quotedNested,
      selectionStart: "> - parent\n>     - ".length,
      selectionEnd: "> - parent\n>     - ".length,
    }, 4)?.value,
    "> - parent\n> - child",
  );
});

test("markdown list commands treat four-space list markers outside lists as code like Typora", () => {
  const indentedBullet = "paragraph\n    - item";
  assert.equal(
    continueMarkdownList({ value: indentedBullet, selectionStart: indentedBullet.length, selectionEnd: indentedBullet.length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: indentedBullet, selectionStart: indentedBullet.length, selectionEnd: indentedBullet.length }),
    null,
  );
  assert.equal(
    outdentMarkdownListOnBackspace({
      value: indentedBullet,
      selectionStart: "paragraph\n    - ".length,
      selectionEnd: "paragraph\n    - ".length,
    }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({
      value: "paragraph\n    -",
      selectionStart: "paragraph\n    -".length,
      selectionEnd: "paragraph\n    -".length,
    }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({
      value: "paragraph\n    1.",
      selectionStart: "paragraph\n    1.".length,
      selectionEnd: "paragraph\n    1.".length,
    }),
    null,
  );

  const quotedIndentedBullet = "> paragraph\n>     - item";
  assert.equal(
    applyMarkdownSpaceShortcut({
      value: "> paragraph\n>     -",
      selectionStart: "> paragraph\n>     -".length,
      selectionEnd: "> paragraph\n>     -".length,
    }),
    null,
  );
  assert.deepEqual(
    continueMarkdownBlock({
      value: quotedIndentedBullet,
      selectionStart: quotedIndentedBullet.length,
      selectionEnd: quotedIndentedBullet.length,
    }),
    { value: "> paragraph\n>     - item\n>     ", selectionStart: "> paragraph\n>     - item\n>     ".length, selectionEnd: "> paragraph\n>     - item\n>     ".length },
  );
  assert.equal(
    outdentMarkdownListOnBackspace({
      value: quotedIndentedBullet,
      selectionStart: "> paragraph\n>     - ".length,
      selectionEnd: "> paragraph\n>     - ".length,
    }),
    null,
  );
});

test("markdown list commands keep four-space nested list markers inside parent lists", () => {
  const nested = "- parent\n    - child";
  assert.deepEqual(
    continueMarkdownList({ value: nested, selectionStart: nested.length, selectionEnd: nested.length }),
    { value: "- parent\n    - child\n    - ", selectionStart: "- parent\n    - child\n    - ".length, selectionEnd: "- parent\n    - child\n    - ".length },
  );
  assert.deepEqual(
    outdentMarkdownListOnBackspace({
      value: nested,
      selectionStart: "- parent\n    - ".length,
      selectionEnd: "- parent\n    - ".length,
    }),
    { value: "- parent\n  - child", selectionStart: "- parent\n  - ".length, selectionEnd: "- parent\n  - ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({
      value: "- parent\n    -",
      selectionStart: "- parent\n    -".length,
      selectionEnd: "- parent\n    -".length,
    }),
    { value: "- parent\n    - ", selectionStart: "- parent\n    - ".length, selectionEnd: "- parent\n    - ".length },
  );

  const quotedNested = "> - parent\n>     - child";
  assert.deepEqual(
    continueMarkdownBlock({ value: quotedNested, selectionStart: quotedNested.length, selectionEnd: quotedNested.length }),
    { value: "> - parent\n>     - child\n>     - ", selectionStart: "> - parent\n>     - child\n>     - ".length, selectionEnd: "> - parent\n>     - child\n>     - ".length },
  );
  assert.deepEqual(
    outdentMarkdownListOnBackspace({
      value: quotedNested,
      selectionStart: "> - parent\n>     - ".length,
      selectionEnd: "> - parent\n>     - ".length,
    }),
    { value: "> - parent\n>   - child", selectionStart: "> - parent\n>   - ".length, selectionEnd: "> - parent\n>   - ".length },
  );
});

test("continueMarkdownList splits when the cursor is before item text", () => {
  assert.deepEqual(
    continueMarkdownList({ value: "- item", selectionStart: "- ".length, selectionEnd: "- ".length }),
    { value: "- \n- item", selectionStart: "- \n- ".length, selectionEnd: "- \n- ".length },
  );

  assert.deepEqual(
    continueMarkdownList({ value: "1. one\n2. two", selectionStart: "1. ".length, selectionEnd: "1. ".length }),
    { value: "1. \n2. one\n3. two", selectionStart: "1. \n2. ".length, selectionEnd: "1. \n2. ".length },
  );
});

test("continueMarkdownList renumbers after exiting an empty ordered list item", () => {
  const list = "1. one\n2. \n3. three";
  const lineStart = "1. one\n".length;
  const result = continueMarkdownList({
    value: list,
    selectionStart: lineStart + "2. ".length,
    selectionEnd: lineStart + "2. ".length,
  });

  assert.deepEqual(result, {
    value: "1. one\n\n2. three",
    selectionStart: lineStart,
    selectionEnd: lineStart,
  });
});

test("continueMarkdownList keeps nested children while renumbering after exiting an empty item", () => {
  const list = "1. one\n2. \n   1. child\n3. three";
  const lineStart = "1. one\n".length;
  const result = continueMarkdownList({
    value: list,
    selectionStart: lineStart + "2. ".length,
    selectionEnd: lineStart + "2. ".length,
  });

  assert.deepEqual(result, {
    value: "1. one\n\n   1. child\n2. three",
    selectionStart: lineStart,
    selectionEnd: lineStart,
  });
});

test("continueMarkdownBlock deletes same-item selections before continuing lists and quotes", () => {
  const continueSelection = (source: string) => {
    const selectionStart = source.indexOf("SELECT");
    return continueMarkdownBlock({
      value: source,
      selectionStart,
      selectionEnd: selectionStart + "SELECT ".length,
    });
  };
  const continueAcrossItems = (source: string) => {
    const selectionStart = source.indexOf("SELECT");
    const selectionEnd = source.indexOf("REMOVE") + "REMOVE ".length;
    return continueMarkdownBlock({ value: source, selectionStart, selectionEnd });
  };

  assert.equal(continueSelection("- before SELECT after")?.value, "- before \n- after");
  assert.equal(continueSelection("> before SELECT after")?.value, "> before \n> after");
  assert.equal(continueSelection("> - before SELECT after")?.value, "> - before \n> - after");
  assert.equal(continueSelection("- [x] before SELECT after")?.value, "- [x] before \n- [ ] after");
  assert.equal(
    continueSelection("3. before SELECT after\n4. tail")?.value,
    "3. before \n4. after\n5. tail",
  );

  assert.equal(
    continueAcrossItems("- first SELECT\n- REMOVE second\n- tail")?.value,
    "- first \n- second\n- tail",
  );
  assert.equal(
    continueAcrossItems("3. first SELECT\n4. REMOVE second\n5. tail")?.value,
    "3. first \n4. second\n5. tail",
  );
  assert.equal(
    continueAcrossItems("> - [x] first SELECT\n> - [ ] REMOVE second")?.value,
    "> - [x] first \n> - [ ] second",
  );

  const multiLine = "- first\n\n- second";
  assert.deepEqual(continueMarkdownBlock({
    value: multiLine,
    selectionStart: multiLine.indexOf("first"),
    selectionEnd: multiLine.indexOf("second") + "second".length,
  }), {
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
  });

  const independentBlocks = "- first\n\nparagraph\n\n- second";
  assert.equal(continueMarkdownBlock({
    value: independentBlocks,
    selectionStart: independentBlocks.indexOf("first"),
    selectionEnd: independentBlocks.indexOf("second") + "second".length,
  }), null);

  const fenced = "```md\n- before SELECT after\n```";
  const fencedStart = fenced.indexOf("SELECT");
  assert.equal(continueMarkdownBlock({
    value: fenced,
    selectionStart: fencedStart,
    selectionEnd: fencedStart + "SELECT ".length,
  }), null);
});

test("continueMarkdownBlock continues and exits blockquotes", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "> quote", selectionStart: 7, selectionEnd: 7 }),
    { value: "> quote\n> ", selectionStart: 10, selectionEnd: 10 },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "> ", selectionStart: 2, selectionEnd: 2 }),
    { value: "", selectionStart: 0, selectionEnd: 0 },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "> quote", selectionStart: "> ".length, selectionEnd: "> ".length }),
    { value: "> \n> quote", selectionStart: "> \n> ".length, selectionEnd: "> \n> ".length },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "> > ", selectionStart: "> > ".length, selectionEnd: "> > ".length }),
    { value: "> ", selectionStart: "> ".length, selectionEnd: "> ".length },
  );
});

test("continueMarkdownBlock continues lists inside blockquotes like Typora", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "> - item", selectionStart: "> - item".length, selectionEnd: "> - item".length }),
    { value: "> - item\n> - ", selectionStart: "> - item\n> - ".length, selectionEnd: "> - item\n> - ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: ">\t- item", selectionStart: ">\t- item".length, selectionEnd: ">\t- item".length }),
    { value: ">\t- item\n> - ", selectionStart: ">\t- item\n> - ".length, selectionEnd: ">\t- item\n> - ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "> - [x] done", selectionStart: "> - [x] done".length, selectionEnd: "> - [x] done".length }),
    { value: "> - [x] done\n> - [ ] ", selectionStart: "> - [x] done\n> - [ ] ".length, selectionEnd: "> - [x] done\n> - [ ] ".length },
  );
});

test("continueMarkdownBlock exits empty quoted list items and renumbers ordered siblings", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "> - ", selectionStart: "> - ".length, selectionEnd: "> - ".length }),
    { value: "> ", selectionStart: "> ".length, selectionEnd: "> ".length },
  );

  const source = "> 1. one\n> 2. \n> 3. three";
  const cursor = "> 1. one\n> 2. ".length;
  assert.deepEqual(
    continueMarkdownBlock({ value: source, selectionStart: cursor, selectionEnd: cursor }),
    { value: "> 1. one\n> \n> 2. three", selectionStart: "> 1. one\n> ".length, selectionEnd: "> 1. one\n> ".length },
  );

  const nested = "> 9. nine\n>   1. \n> 10. ten";
  const nestedCursor = "> 9. nine\n>   1. ".length;
  assert.deepEqual(
    continueMarkdownBlock({ value: nested, selectionStart: nestedCursor, selectionEnd: nestedCursor }),
    { value: "> 9. nine\n>   \n> 10. ten", selectionStart: "> 9. nine\n>   ".length, selectionEnd: "> 9. nine\n>   ".length },
  );
});

test("continueMarkdownBlock preserves CRLF in quoted ordered lists like Typora", () => {
  const source = "> 1. one\r\n> 2. two";
  const cursor = "> 1. one".length;
  const result = continueMarkdownBlock({ value: source, selectionStart: cursor, selectionEnd: cursor });
  const expected = "> 1. one\r\n> 2. \r\n> 3. two";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: "> 1. one\r\n> 2. ".length,
    selectionEnd: "> 1. one\r\n> 2. ".length,
  });
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("continueMarkdownBlock continues and exits list continuation lines like Typora", () => {
  const continuation = "- item\n  continuation";
  assert.deepEqual(
    continueMarkdownBlock({ value: continuation, selectionStart: continuation.length, selectionEnd: continuation.length }),
    {
      value: "- item\n  continuation\n  ",
      selectionStart: "- item\n  continuation\n  ".length,
      selectionEnd: "- item\n  continuation\n  ".length,
    },
  );

  const emptyContinuation = "- item\n  ";
  assert.deepEqual(
    continueMarkdownBlock({ value: emptyContinuation, selectionStart: emptyContinuation.length, selectionEnd: emptyContinuation.length }),
    { value: "- item\n", selectionStart: "- item\n".length, selectionEnd: "- item\n".length },
  );

  const nested = "- item\n  1. nested\n     continuation";
  assert.deepEqual(
    continueMarkdownBlock({ value: nested, selectionStart: nested.length, selectionEnd: nested.length }),
    {
      value: "- item\n  1. nested\n     continuation\n     ",
      selectionStart: "- item\n  1. nested\n     continuation\n     ".length,
      selectionEnd: "- item\n  1. nested\n     continuation\n     ".length,
    },
  );

  assert.equal(
    continueMarkdownBlock({ value: "paragraph\n  code", selectionStart: "paragraph\n  code".length, selectionEnd: "paragraph\n  code".length }),
    null,
  );
});

test("continueMarkdownBlock preserves CRLF in list continuation lines like Typora", () => {
  const source = "- item\r\n  continuation";
  const result = continueMarkdownBlock({ value: source, selectionStart: source.length, selectionEnd: source.length });
  const expected = "- item\r\n  continuation\r\n  ";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.length,
    selectionEnd: expected.length,
  });
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("continueMarkdownBlock continues quoted list continuation lines like Typora", () => {
  const continuation = "> - item\n>   continuation";
  assert.deepEqual(
    continueMarkdownBlock({ value: continuation, selectionStart: continuation.length, selectionEnd: continuation.length }),
    {
      value: "> - item\n>   continuation\n>   ",
      selectionStart: "> - item\n>   continuation\n>   ".length,
      selectionEnd: "> - item\n>   continuation\n>   ".length,
    },
  );

  const emptyContinuation = "> - item\n>   ";
  assert.deepEqual(
    continueMarkdownBlock({ value: emptyContinuation, selectionStart: emptyContinuation.length, selectionEnd: emptyContinuation.length }),
    { value: "> - item\n> ", selectionStart: "> - item\n> ".length, selectionEnd: "> - item\n> ".length },
  );
});

test("continueMarkdownBlock continues definition list markers like Typora", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "Term\n: Definition", selectionStart: "Term\n: Definition".length, selectionEnd: "Term\n: Definition".length }),
    { value: "Term\n: Definition\n: ", selectionStart: "Term\n: Definition\n: ".length, selectionEnd: "Term\n: Definition\n: ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "Term\n: Definition", selectionStart: "Term\n: ".length, selectionEnd: "Term\n: ".length }),
    { value: "Term\n: \n: Definition", selectionStart: "Term\n: \n: ".length, selectionEnd: "Term\n: \n: ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "Term\n: ", selectionStart: "Term\n: ".length, selectionEnd: "Term\n: ".length }),
    { value: "Term\n", selectionStart: "Term\n".length, selectionEnd: "Term\n".length },
  );

  assert.equal(
    continueMarkdownBlock({ value: ":not a definition", selectionStart: ":not a definition".length, selectionEnd: ":not a definition".length }),
    null,
  );
});

test("continueMarkdownBlock continues quoted definition list markers like Typora", () => {
  const quoted = "> Term\n> : Definition";
  assert.deepEqual(
    continueMarkdownBlock({ value: quoted, selectionStart: quoted.length, selectionEnd: quoted.length }),
    { value: "> Term\n> : Definition\n> : ", selectionStart: "> Term\n> : Definition\n> : ".length, selectionEnd: "> Term\n> : Definition\n> : ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "> Term\n> : ", selectionStart: "> Term\n> : ".length, selectionEnd: "> Term\n> : ".length }),
    { value: "> Term\n> ", selectionStart: "> Term\n> ".length, selectionEnd: "> Term\n> ".length },
  );
});

test("continueMarkdownBlock continues and exits definition continuation lines like Typora", () => {
  const definition = "Term\n: Definition\n  continuation";
  assert.deepEqual(
    continueMarkdownBlock({ value: definition, selectionStart: definition.length, selectionEnd: definition.length }),
    { value: "Term\n: Definition\n  continuation\n  ", selectionStart: "Term\n: Definition\n  continuation\n  ".length, selectionEnd: "Term\n: Definition\n  continuation\n  ".length },
  );

  const looseDefinition = "Term\n: Definition\n\n    continuation";
  assert.deepEqual(
    continueMarkdownBlock({ value: looseDefinition, selectionStart: looseDefinition.length, selectionEnd: looseDefinition.length }),
    { value: "Term\n: Definition\n\n    continuation\n    ", selectionStart: "Term\n: Definition\n\n    continuation\n    ".length, selectionEnd: "Term\n: Definition\n\n    continuation\n    ".length },
  );

  const emptyContinuation = "Term\n: Definition\n  ";
  assert.deepEqual(
    continueMarkdownBlock({ value: emptyContinuation, selectionStart: emptyContinuation.length, selectionEnd: emptyContinuation.length }),
    { value: "Term\n: Definition\n", selectionStart: "Term\n: Definition\n".length, selectionEnd: "Term\n: Definition\n".length },
  );

  assert.equal(
    continueMarkdownBlock({ value: "paragraph\n  code", selectionStart: "paragraph\n  code".length, selectionEnd: "paragraph\n  code".length }),
    null,
  );
});

test("continueMarkdownBlock continues quoted definition continuation lines like Typora", () => {
  const continuation = "> Term\n> : Definition\n>   more";
  assert.deepEqual(
    continueMarkdownBlock({ value: continuation, selectionStart: continuation.length, selectionEnd: continuation.length }),
    { value: "> Term\n> : Definition\n>   more\n>   ", selectionStart: "> Term\n> : Definition\n>   more\n>   ".length, selectionEnd: "> Term\n> : Definition\n>   more\n>   ".length },
  );

  const emptyContinuation = "> Term\n> : Definition\n>   ";
  assert.deepEqual(
    continueMarkdownBlock({ value: emptyContinuation, selectionStart: emptyContinuation.length, selectionEnd: emptyContinuation.length }),
    { value: "> Term\n> : Definition\n> ", selectionStart: "> Term\n> : Definition\n> ".length, selectionEnd: "> Term\n> : Definition\n> ".length },
  );
});

test("continueMarkdownBlock continues footnote definitions like Typora", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "[^1]: detail", selectionStart: "[^1]: detail".length, selectionEnd: "[^1]: detail".length }),
    { value: "[^1]: detail\n    ", selectionStart: "[^1]: detail\n    ".length, selectionEnd: "[^1]: detail\n    ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "[^1]: detail", selectionStart: "[^1]: ".length, selectionEnd: "[^1]: ".length }),
    { value: "[^1]: \n    detail", selectionStart: "[^1]: \n    ".length, selectionEnd: "[^1]: \n    ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "[^1]:", selectionStart: "[^1]:".length, selectionEnd: "[^1]:".length }),
    { value: "[^1]:\n    ", selectionStart: "[^1]:\n    ".length, selectionEnd: "[^1]:\n    ".length },
  );

  const spaced = "[^中文 note]: detail";
  assert.deepEqual(
    continueMarkdownBlock({ value: spaced, selectionStart: spaced.length, selectionEnd: spaced.length }),
    {
      value: "[^中文 note]: detail\n    ",
      selectionStart: "[^中文 note]: detail\n    ".length,
      selectionEnd: "[^中文 note]: detail\n    ".length,
    },
  );
});

test("continueMarkdownBlock continues and exits footnote continuation lines like Typora", () => {
  const footnote = "[^1]: detail\n    continuation";
  assert.deepEqual(
    continueMarkdownBlock({ value: footnote, selectionStart: footnote.length, selectionEnd: footnote.length }),
    { value: "[^1]: detail\n    continuation\n    ", selectionStart: "[^1]: detail\n    continuation\n    ".length, selectionEnd: "[^1]: detail\n    continuation\n    ".length },
  );

  const emptyContinuation = "[^1]: detail\n    ";
  assert.deepEqual(
    continueMarkdownBlock({ value: emptyContinuation, selectionStart: emptyContinuation.length, selectionEnd: emptyContinuation.length }),
    { value: "[^1]: detail\n", selectionStart: "[^1]: detail\n".length, selectionEnd: "[^1]: detail\n".length },
  );

  assert.equal(
    continueMarkdownBlock({ value: "paragraph\n    code", selectionStart: "paragraph\n    code".length, selectionEnd: "paragraph\n    code".length }),
    null,
  );
});

test("continueMarkdownBlock continues quoted footnote definitions like Typora", () => {
  const quoted = "> [^1]: detail";
  assert.deepEqual(
    continueMarkdownBlock({ value: quoted, selectionStart: quoted.length, selectionEnd: quoted.length }),
    { value: "> [^1]: detail\n>     ", selectionStart: "> [^1]: detail\n>     ".length, selectionEnd: "> [^1]: detail\n>     ".length },
  );

  const continuation = "> [^1]: detail\n>     more";
  assert.deepEqual(
    continueMarkdownBlock({ value: continuation, selectionStart: continuation.length, selectionEnd: continuation.length }),
    { value: "> [^1]: detail\n>     more\n>     ", selectionStart: "> [^1]: detail\n>     more\n>     ".length, selectionEnd: "> [^1]: detail\n>     more\n>     ".length },
  );

  const emptyContinuation = "> [^1]: detail\n>     ";
  assert.deepEqual(
    continueMarkdownBlock({ value: emptyContinuation, selectionStart: emptyContinuation.length, selectionEnd: emptyContinuation.length }),
    { value: "> [^1]: detail\n> ", selectionStart: "> [^1]: detail\n> ".length, selectionEnd: "> [^1]: detail\n> ".length },
  );
});

test("continueMarkdownBlock renumbers compact quoted ordered lists", () => {
  const source = ">1. one\n>2. two";
  const cursor = ">1. one".length;

  assert.deepEqual(
    continueMarkdownBlock({ value: source, selectionStart: cursor, selectionEnd: cursor }),
    { value: ">1. one\n> 2. \n> 3. two", selectionStart: ">1. one\n> 2. ".length, selectionEnd: ">1. one\n> 2. ".length },
  );

  const empty = ">1. one\n>2. \n>3. three";
  const emptyCursor = ">1. one\n>2. ".length;
  assert.deepEqual(
    continueMarkdownBlock({ value: empty, selectionStart: emptyCursor, selectionEnd: emptyCursor }),
    { value: ">1. one\n> \n> 2. three", selectionStart: ">1. one\n> ".length, selectionEnd: ">1. one\n> ".length },
  );
});

test("continueMarkdownBlock exits empty headings", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "# ", selectionStart: 2, selectionEnd: 2 }),
    { value: "", selectionStart: 0, selectionEnd: 0 },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "before\n  ###   \nafter", selectionStart: "before\n  ###   ".length, selectionEnd: "before\n  ###   ".length }),
    { value: "before\n  \nafter", selectionStart: "before\n  ".length, selectionEnd: "before\n  ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "> # ", selectionStart: "> # ".length, selectionEnd: "> # ".length }),
    { value: "> ", selectionStart: "> ".length, selectionEnd: "> ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "> > ###   ", selectionStart: "> > ###   ".length, selectionEnd: "> > ###   ".length }),
    { value: "> > ", selectionStart: "> > ".length, selectionEnd: "> > ".length },
  );
});

test("continueMarkdownBlock closes newly opened code fences", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "```ts", selectionStart: 5, selectionEnd: 5 }),
    { value: "```ts\n\n```", selectionStart: 6, selectionEnd: 6 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "> ```ts", selectionStart: "> ```ts".length, selectionEnd: "> ```ts".length }),
    { value: "> ```ts\n> \n> ```", selectionStart: "> ```ts\n> ".length, selectionEnd: "> ```ts\n> ".length },
  );

  const longerClosing = "````md\n`````";
  assert.equal(
    continueMarkdownBlock({
      value: longerClosing,
      selectionStart: "````md".length,
      selectionEnd: "````md".length,
    }),
    null,
  );

  const closed = "```ts\nconst x = 1;\n```";
  assert.equal(
    continueMarkdownBlock({ value: closed, selectionStart: closed.length, selectionEnd: closed.length }),
    null,
  );
});

test("continueMarkdownBlock preserves CRLF when closing code fences", () => {
  const source = "before\r\n```ts";
  const result = continueMarkdownBlock({ value: source, selectionStart: source.length, selectionEnd: source.length });
  const expected = "before\r\n```ts\r\n\r\n```";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: "before\r\n```ts\r\n".length,
    selectionEnd: "before\r\n```ts\r\n".length,
  });
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("continueMarkdownBlock does not apply markdown block rules inside raw fences", () => {
  assert.equal(
    continueMarkdownBlock({ value: "```md\n- item", selectionStart: "```md\n- item".length, selectionEnd: "```md\n- item".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "$$\n| A | B |", selectionStart: "$$\n| A | B |".length, selectionEnd: "$$\n| A | B |".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "\\[\n# title", selectionStart: "\\[\n# title".length, selectionEnd: "\\[\n# title".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "~~~\n---", selectionStart: "~~~\n---".length, selectionEnd: "~~~\n---".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "> ```md\n> - item", selectionStart: "> ```md\n> - item".length, selectionEnd: "> ```md\n> - item".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "> $$\n> | A | B |", selectionStart: "> $$\n> | A | B |".length, selectionEnd: "> $$\n> | A | B |".length }),
    null,
  );
});

test("markdown block shortcuts treat heavily indented fence markers as code text like Typora", () => {
  assert.equal(
    continueMarkdownBlock({ value: "    ```", selectionStart: "    ```".length, selectionEnd: "    ```".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "    ~~~", selectionStart: "    ~~~".length, selectionEnd: "    ~~~".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "    $$", selectionStart: "    $$".length, selectionEnd: "    $$".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "    \\[", selectionStart: "    \\[".length, selectionEnd: "    \\[".length }),
    null,
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: ">     $$", selectionStart: ">     $$".length, selectionEnd: ">     $$".length }),
    { value: ">     $$\n>     ", selectionStart: ">     $$\n>     ".length, selectionEnd: ">     $$\n>     ".length },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: ">     \\[", selectionStart: ">     \\[".length, selectionEnd: ">     \\[".length }),
    { value: ">     \\[\n>     ", selectionStart: ">     \\[\n>     ".length, selectionEnd: ">     \\[\n>     ".length },
  );

  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "    ```\n#", selectionStart: "    ```\n#".length, selectionEnd: "    ```\n#".length }),
    { value: "    ```\n# ", selectionStart: "    ```\n# ".length, selectionEnd: "    ```\n# ".length },
  );

  assert.deepEqual(
    continueMarkdownBlock({ value: "    ```\n- item", selectionStart: "    ```\n- item".length, selectionEnd: "    ```\n- item".length }),
    { value: "    ```\n- item\n- ", selectionStart: "    ```\n- item\n- ".length, selectionEnd: "    ```\n- item\n- ".length },
  );

  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: "    ```\n- item", selectionStart: "    ```\n- ".length, selectionEnd: "    ```\n- ".length }),
    { value: "    ```\nitem", selectionStart: "    ```\n".length, selectionEnd: "    ```\n".length },
  );

  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "    $$\n# title", selectionStart: "    $$\n# ".length, selectionEnd: "    $$\n# ".length }),
    { value: "    $$\ntitle", selectionStart: "    $$\n".length, selectionEnd: "    $$\n".length },
  );
});

test("continueMarkdownBlock does not apply markdown block rules inside raw HTML blocks like Typora", () => {
  assert.equal(
    continueMarkdownBlock({ value: "<div>\n- item", selectionStart: "<div>\n- item".length, selectionEnd: "<div>\n- item".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "<div>\n| A | B |", selectionStart: "<div>\n| A | B |".length, selectionEnd: "<div>\n| A | B |".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "> <section>\n> # title", selectionStart: "> <section>\n> # title".length, selectionEnd: "> <section>\n> # title".length }),
    null,
  );

  assert.equal(
    continueMarkdownBlock({ value: "<div>\n> literal\n* item", selectionStart: "<div>\n> literal\n* item".length, selectionEnd: "<div>\n> literal\n* item".length }),
    null,
  );
  assert.equal(
    continueMarkdownBlock({ value: "> <div>\r\n> > literal\r\n> * item", selectionStart: "> <div>\r\n> > literal\r\n> * item".length, selectionEnd: "> <div>\r\n> > literal\r\n> * item".length }),
    null,
  );
  const script = "<script>\n- hidden\n</script>\n- item";
  assert.deepEqual(
    continueMarkdownBlock({ value: script, selectionStart: script.length, selectionEnd: script.length }),
    { value: "<script>\n- hidden\n</script>\n- item\n- ", selectionStart: script.length + 3, selectionEnd: script.length + 3 },
  );
});

test("splitMarkdownParagraphOnEnter creates Typora-style paragraphs and preserves line endings", () => {
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({ value: "alpha beta", selectionStart: 5, selectionEnd: 5 }),
    { value: "alpha\n\n beta", selectionStart: 7, selectionEnd: 7 },
  );
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({ value: "alpha\r\nbeta", selectionStart: "alpha\r\nbe".length, selectionEnd: "alpha\r\nbe".length }),
    {
      value: "alpha\r\nbe\r\n\r\nta",
      selectionStart: "alpha\r\nbe\r\n\r\n".length,
      selectionEnd: "alpha\r\nbe\r\n\r\n".length,
    },
  );
  assert.equal(
    splitMarkdownParagraphOnEnter({ value: "```\ncode\n```", selectionStart: 6, selectionEnd: 6 }),
    null,
  );
});

test("splitMarkdownParagraphOnEnter keeps a heading intact when Enter is pressed before its text", () => {
  const source = "before\n\n# Title";
  const titleStart = source.indexOf("Title");
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({ value: source, selectionStart: titleStart, selectionEnd: titleStart }),
    {
      value: "before\n\n\n\n# Title",
      selectionStart: source.indexOf("#"),
      selectionEnd: source.indexOf("#"),
    },
  );

  const middle = "# Title";
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({ value: middle, selectionStart: 4, selectionEnd: 4 }),
    { value: "# Ti\n\n# tle", selectionStart: 8, selectionEnd: 8 },
  );
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({ value: middle, selectionStart: middle.length, selectionEnd: middle.length }),
    { value: "# Title\n\n", selectionStart: 9, selectionEnd: 9 },
  );
});

test("editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line", () => {
  const source = "---\ntitle: x\n\n---\nBody";
  const logicalEnd = source.indexOf("\n\n") + 1;
  assert.deepEqual(
    editMarkdownFrontMatterOnEnter({
      value: source,
      selectionStart: logicalEnd,
      selectionEnd: logicalEnd,
    }),
    {
      value: "---\ntitle: x\n\n---\n\nBody",
      selectionStart: "---\ntitle: x\n\n---\n".length,
      selectionEnd: "---\ntitle: x\n\n---\n".length,
    },
  );

  const endSource = "---\ntitle: x\n\n---";
  const endLogicalEnd = endSource.indexOf("\n\n") + 1;
  assert.deepEqual(
    editMarkdownFrontMatterOnEnter({
      value: endSource,
      selectionStart: endLogicalEnd,
      selectionEnd: endLogicalEnd,
    }),
    {
      value: endSource + "\n",
      selectionStart: endSource.length + 1,
      selectionEnd: endSource.length + 1,
    },
  );

  for (const modifiers of [{ primary: true }, { shift: true }, { alt: true }]) {
    const result = editMarkdownFrontMatterOnEnter({
      value: endSource,
      selectionStart: endLogicalEnd,
      selectionEnd: endLogicalEnd,
    }, modifiers);
    assert.deepEqual(result, {
      value: "---\ntitle: x\n\n\n---",
      selectionStart: endLogicalEnd + 1,
      selectionEnd: endLogicalEnd + 1,
    });
  }
});

test("editMarkdownFrontMatterOnEnter deletes selections first and preserves CRLF", () => {
  const source = "---\r\ntitle: remove\r\n\r\n---";
  const selectionStart = source.indexOf("remove");
  const selectionEnd = selectionStart + "remove".length;
  const selected = editMarkdownFrontMatterOnEnter({
    value: source,
    selectionStart,
    selectionEnd,
  });
  assert.deepEqual(selected, {
    value: "---\r\ntitle: \r\n\r\n\r\n---",
    selectionStart: selectionStart + 2,
    selectionEnd: selectionStart + 2,
  });
  assertOnlyCrlfLineBreaks(selected?.value ?? "");

  const exitSource = "---\r\ntitle: x\r\n\r\n---\r\nBody";
  const logicalEnd = exitSource.indexOf("\r\n\r\n") + 2;
  const exited = editMarkdownFrontMatterOnEnter({
    value: exitSource,
    selectionStart: logicalEnd,
    selectionEnd: logicalEnd,
  });
  assert.equal(exited?.value, "---\r\ntitle: x\r\n\r\n---\r\n\r\nBody");
  assert.equal(exited?.selectionStart, "---\r\ntitle: x\r\n\r\n---\r\n".length);
  assertOnlyCrlfLineBreaks(exited?.value ?? "");
});

test("Front Matter protects YAML shortcuts and unwraps only at the absolute content start", () => {
  const source = "---\n- item\n# title\n---\nBody";
  assert.equal(
    continueMarkdownBlock({
      value: source,
      selectionStart: source.indexOf("item") + "item".length,
      selectionEnd: source.indexOf("item") + "item".length,
    }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({
      value: source,
      selectionStart: source.indexOf("#") + 1,
      selectionEnd: source.indexOf("#") + 1,
    }),
    null,
  );
  assert.equal(
    outdentMarkdownListOnBackspace({
      value: source,
      selectionStart: source.indexOf("item"),
      selectionEnd: source.indexOf("item"),
    }),
    null,
  );
  assert.equal(
    unwrapMarkdownBlockOnBackspace({
      value: source,
      selectionStart: source.indexOf("title"),
      selectionEnd: source.indexOf("title"),
    }),
    null,
  );

  const unwrapped = unwrapMarkdownBlockOnBackspace({
    value: source,
    selectionStart: "---\n".length,
    selectionEnd: "---\n".length,
  });
  assert.deepEqual(unwrapped, {
    value: "- item\n# title\nBody",
    selectionStart: 0,
    selectionEnd: 0,
  });
});

test("splitMarkdownParagraphOnEnter copies complete ATX heading patterns", () => {
  const middle = "## AlphaBeta ##";
  const middleCursor = middle.indexOf("Beta");
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({
      value: middle,
      selectionStart: middleCursor,
      selectionEnd: middleCursor,
    }),
    {
      value: "## Alpha ##\n\n## Beta ##",
      selectionStart: "## Alpha ##\n\n## ".length,
      selectionEnd: "## Alpha ##\n\n## ".length,
    },
  );

  const start = "## Alpha ##";
  const startCursor = start.indexOf("Alpha");
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({ value: start, selectionStart: startCursor, selectionEnd: startCursor }),
    { value: "\n\n## Alpha ##", selectionStart: 0, selectionEnd: 0 },
  );
  const endCursor = start.indexOf(" ##");
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({ value: start, selectionStart: endCursor, selectionEnd: endCursor }),
    {
      value: "## Alpha ##\n\n",
      selectionStart: "## Alpha ##\n\n".length,
      selectionEnd: "## Alpha ##\n\n".length,
    },
  );

  const quoted = "> ## AlphaBeta ##";
  const quotedCursor = quoted.indexOf("Beta");
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({
      value: quoted,
      selectionStart: quotedCursor,
      selectionEnd: quotedCursor,
    }),
    {
      value: "> ## Alpha ##\n>\n> ## Beta ##",
      selectionStart: "> ## Alpha ##\n>\n> ## ".length,
      selectionEnd: "> ## Alpha ##\n>\n> ## ".length,
    },
  );
});

test("splitMarkdownParagraphOnEnter ignores heading syntax inside raw blocks", () => {
  const fenced = "```md\n## AlphaBeta ##\n```";
  const fencedCursor = fenced.indexOf("Beta");
  assert.equal(
    splitMarkdownParagraphOnEnter({
      value: fenced,
      selectionStart: fencedCursor,
      selectionEnd: fencedCursor,
    }),
    null,
  );

  const html = "<section>\n## AlphaBeta ##\n</section>";
  const htmlCursor = html.indexOf("Beta");
  assert.equal(
    splitMarkdownParagraphOnEnter({ value: html, selectionStart: htmlCursor, selectionEnd: htmlCursor }),
    null,
  );

  const frontMatter = "---\nAlphaBeta\n===\n---";
  const frontMatterCursor = frontMatter.indexOf("Beta");
  assert.equal(
    splitMarkdownParagraphOnEnter({
      value: frontMatter,
      selectionStart: frontMatterCursor,
      selectionEnd: frontMatterCursor,
    }),
    null,
  );
});

test("splitMarkdownParagraphOnEnter copies Setext patterns with quotes and CRLF", () => {
  const source = "AlphaBeta\n===";
  const cursor = source.indexOf("Beta");
  assert.deepEqual(
    splitMarkdownParagraphOnEnter({ value: source, selectionStart: cursor, selectionEnd: cursor }),
    {
      value: "Alpha\n===\n\nBeta\n===",
      selectionStart: "Alpha\n===\n\n".length,
      selectionEnd: "Alpha\n===\n\n".length,
    },
  );

  const quoted = "> AlphaBeta\r\n> ===";
  const quotedCursor = quoted.indexOf("Beta");
  const result = splitMarkdownParagraphOnEnter({
    value: quoted,
    selectionStart: quotedCursor,
    selectionEnd: quotedCursor,
  });
  assert.deepEqual(result, {
    value: "> Alpha\r\n> ===\r\n>\r\n> Beta\r\n> ===",
    selectionStart: "> Alpha\r\n> ===\r\n>\r\n> ".length,
    selectionEnd: "> Alpha\r\n> ===\r\n>\r\n> ".length,
  });
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("unwrapMarkdownBlockOnBackspace removes complete heading patterns", () => {
  const atx = "## Alpha ##";
  const atxCursor = atx.indexOf("Alpha");
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: atx, selectionStart: atxCursor, selectionEnd: atxCursor }),
    { value: "Alpha", selectionStart: 0, selectionEnd: 0 },
  );

  const setext = "Alpha\n===\nBody";
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: setext, selectionStart: 0, selectionEnd: 0 }),
    { value: "Alpha\nBody", selectionStart: 0, selectionEnd: 0 },
  );
  const prefixed = "before\nAlpha\n===\nBody";
  const contentStart = prefixed.indexOf("Alpha");
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({
      value: prefixed,
      selectionStart: contentStart,
      selectionEnd: contentStart,
    }),
    {
      value: "before\nAlpha\nBody",
      selectionStart: contentStart,
      selectionEnd: contentStart,
    },
  );
});

test("splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container", () => {
  const cases = [
    ["- AlphaBeta", "- Alpha\n\n  Beta", "- Alpha\n\n  ".length],
    ["12) AlphaBeta", "12) Alpha\n\n    Beta", "12) Alpha\n\n    ".length],
    ["- [x] AlphaBeta", "- [x] Alpha\n\n      Beta", "- [x] Alpha\n\n      ".length],
    ["> AlphaBeta", "> Alpha\n>\n> Beta", "> Alpha\n>\n> ".length],
    ["> - AlphaBeta", "> - Alpha\n>\n>   Beta", "> - Alpha\n>\n>   ".length],
  ] as const;
  for (const [source, value, selectionStart] of cases) {
    const cursor = source.indexOf("Beta");
    assert.deepEqual(
      splitMarkdownContainerParagraphOnPrimaryEnter({
        value: source,
        selectionStart: cursor,
        selectionEnd: cursor,
      }),
      { value, selectionStart, selectionEnd: selectionStart },
    );
  }

  assert.deepEqual(
    splitMarkdownContainerParagraphOnPrimaryEnter({
      value: "- ",
      selectionStart: 2,
      selectionEnd: 2,
    }),
    { value: "- \n\n  ", selectionStart: 6, selectionEnd: 6 },
  );
});

test("splitMarkdownContainerParagraphOnPrimaryEnter deletes selections and preserves CRLF", () => {
  const source = "> - AlphaREMOVE Beta";
  const selectionStart = source.indexOf("REMOVE");
  const selectionEnd = selectionStart + "REMOVE ".length;
  assert.deepEqual(
    splitMarkdownContainerParagraphOnPrimaryEnter({ value: source, selectionStart, selectionEnd }),
    {
      value: "> - Alpha\n>\n>   Beta",
      selectionStart: "> - Alpha\n>\n>   ".length,
      selectionEnd: "> - Alpha\n>\n>   ".length,
    },
  );

  const crlf = "1. AlphaBeta\r\n2. Tail";
  const cursor = crlf.indexOf("Beta");
  const result = splitMarkdownContainerParagraphOnPrimaryEnter({
    value: crlf,
    selectionStart: cursor,
    selectionEnd: cursor,
  });
  assert.equal(result?.value, "1. Alpha\r\n\r\n   Beta\r\n2. Tail");
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("continueMarkdownBlock closes newly opened math fences", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "$$", selectionStart: 2, selectionEnd: 2 }),
    { value: "$$\n\n$$", selectionStart: 3, selectionEnd: 3 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "> $$", selectionStart: "> $$".length, selectionEnd: "> $$".length }),
    { value: "> $$\n> \n> $$", selectionStart: "> $$\n> ".length, selectionEnd: "> $$\n> ".length },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "\\[", selectionStart: 2, selectionEnd: 2 }),
    { value: "\\[\n\n\\]", selectionStart: 3, selectionEnd: 3 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "> \\[", selectionStart: "> \\[".length, selectionEnd: "> \\[".length }),
    { value: "> \\[\n> \n> \\]", selectionStart: "> \\[\n> ".length, selectionEnd: "> \\[\n> ".length },
  );

  const closed = "$$\nx+y\n$$";
  assert.equal(
    continueMarkdownBlock({ value: closed, selectionStart: closed.length, selectionEnd: closed.length }),
    null,
  );
  const bracketClosed = "\\[\nx+y\n\\]";
  assert.equal(
    continueMarkdownBlock({ value: bracketClosed, selectionStart: bracketClosed.length, selectionEnd: bracketClosed.length }),
    null,
  );
});

test("continueMarkdownBlock preserves CRLF when closing math fences", () => {
  const source = "before\r\n$$";
  const result = continueMarkdownBlock({ value: source, selectionStart: source.length, selectionEnd: source.length });
  const expected = "before\r\n$$\r\n\r\n$$";

  assert.deepEqual(result, {
    value: expected,
    selectionStart: "before\r\n$$\r\n".length,
    selectionEnd: "before\r\n$$\r\n".length,
  });
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("continueMarkdownBlock turns a pipe header into a table", () => {
  const result = continueMarkdownBlock({ value: "| Name | Age |", selectionStart: 14, selectionEnd: 14 });

  assert.equal(result?.value, "| Name | Age |\n| --- | --- |\n|  |  |");
  assert.equal(result?.selectionStart, 31);

  const lightlyIndented = continueMarkdownBlock({ value: "   Name | Age", selectionStart: "   Name | Age".length, selectionEnd: "   Name | Age".length });
  assert.equal(lightlyIndented?.value, "| Name | Age |\n| --- | --- |\n|  |  |");

  const quoted = continueMarkdownBlock({ value: "> Name | Age", selectionStart: "> Name | Age".length, selectionEnd: "> Name | Age".length });
  assert.equal(quoted?.value, "> | Name | Age |\n> | --- | --- |\n> |  |  |");
  assert.equal(quoted?.selectionStart, "> | Name | Age |\n> | --- | --- |\n> | ".length);
  assert.equal(quoted?.selectionEnd, quoted?.selectionStart);
});

test("continueMarkdownBlock turns an explicit single-column pipe header into a table", () => {
  const source = "| 标题 |";
  const result = continueMarkdownBlock({
    value: source,
    selectionStart: source.length,
    selectionEnd: source.length,
  });

  assert.deepEqual(result, {
    value: "| 标题 |\n| --- |\n|  |",
    selectionStart: "| 标题 |\n| --- |\n| ".length,
    selectionEnd: "| 标题 |\n| --- |\n| ".length,
  });

  const ambiguous = "标题 |";
  assert.equal(
    continueMarkdownBlock({
      value: ambiguous,
      selectionStart: ambiguous.length,
      selectionEnd: ambiguous.length,
    }),
    null,
  );
});

test("continueMarkdownBlock treats four-space pipe lines as code instead of table shortcuts like Typora", () => {
  const indented = "paragraph\n    Name | Age";
  assert.equal(
    continueMarkdownBlock({ value: indented, selectionStart: indented.length, selectionEnd: indented.length }),
    null,
  );

  const quotedIndented = "> paragraph\n>     Name | Age";
  assert.deepEqual(
    continueMarkdownBlock({ value: quotedIndented, selectionStart: quotedIndented.length, selectionEnd: quotedIndented.length }),
    {
      value: "> paragraph\n>     Name | Age\n>     ",
      selectionStart: "> paragraph\n>     Name | Age\n>     ".length,
      selectionEnd: "> paragraph\n>     Name | Age\n>     ".length,
    },
  );
});

test("continueMarkdownBlock preserves CRLF when turning a pipe header into a table", () => {
  const source = "Intro\r\n| Name | Age |";
  const result = continueMarkdownBlock({ value: source, selectionStart: source.length, selectionEnd: source.length });
  const expected = "Intro\r\n| Name | Age |\r\n| --- | --- |\r\n|  |  |";

  assert.equal(result?.value, expected);
  assert.equal(result?.selectionStart, "Intro\r\n| Name | Age |\r\n| --- | --- |\r\n| ".length);
  assert.equal(result?.selectionEnd, result?.selectionStart);
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("continueMarkdownBlock normalizes a bare pipe header into a table", () => {
  const header = "Name | Age";
  const result = continueMarkdownBlock({ value: header, selectionStart: header.length, selectionEnd: header.length });

  assert.equal(result?.value, "| Name | Age |\n| --- | --- |\n|  |  |");
  assert.equal(result?.selectionStart, "| Name | Age |\n| --- | --- |\n| ".length);
  assert.equal(result?.selectionEnd, result?.selectionStart);
});

test("continueMarkdownBlock inserts a body row from an existing table header or separator", () => {
  const table = "| Name | Age |\n| --- | --- |\n| Ada | 36 |";
  const headerEnd = table.indexOf("| Name | Age |") + "| Name | Age |".length;
  const separatorEnd = table.indexOf("| --- | --- |") + "| --- | --- |".length;
  const headerResult = continueMarkdownBlock({
    value: table,
    selectionStart: headerEnd,
    selectionEnd: headerEnd,
  });

  assert.equal(
    headerResult?.value,
    "| Name | Age |\n| --- | --- |\n|  |  |\n| Ada | 36 |",
  );
  assert.equal(headerResult?.selectionStart, (headerResult?.value.indexOf("|  |  |") ?? -1) + 5);
  assert.equal(headerResult?.selectionEnd, headerResult?.selectionStart);

  const separatorResult = continueMarkdownBlock({
    value: table,
    selectionStart: separatorEnd,
    selectionEnd: separatorEnd,
  });
  assert.equal(
    separatorResult?.value,
    "| Name | Age |\n| --- | --- |\n|  |  |\n| Ada | 36 |",
  );
  assert.equal(separatorResult?.selectionStart, (separatorResult?.value.indexOf("|  |  |") ?? -1) + 5);
  assert.equal(separatorResult?.selectionEnd, separatorResult?.selectionStart);
});

test("continueMarkdownBlock creates the first body row for a header-only table", () => {
  const table = "| Name | Age |\n| --- | --- |";
  const result = continueMarkdownBlock({
    value: table,
    selectionStart: table.indexOf("Age"),
    selectionEnd: table.indexOf("Age"),
  });

  assert.equal(result?.value, "| Name | Age |\n| --- | --- |\n|  |  |");
  assert.equal(result?.selectionStart, (result?.value.lastIndexOf("|  |  |") ?? -1) + 5);
  assert.equal(result?.selectionEnd, result?.selectionStart);
});

test("continueMarkdownBlock inserts a table row below the current body row", () => {
  const table = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";
  const result = continueMarkdownBlock({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  });

  assert.equal(result?.value, "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n|  |  |  |\n| 4 | 5 | 6 |");
  const insertedRowStart = result?.value.indexOf("|  |  |  |") ?? -1;
  assert.equal(result?.selectionStart, insertedRowStart + 5);
  assert.equal(result?.selectionEnd, result?.selectionStart);

  const quotedTable = "> | A | B | C |\n> | --- | --- | --- |\n> | 1 | 2 | 3 |\n> | 4 | 5 | 6 |";
  const quoted = continueMarkdownBlock({
    value: quotedTable,
    selectionStart: quotedTable.indexOf("2"),
    selectionEnd: quotedTable.indexOf("2"),
  });
  assert.equal(quoted?.value, "> | A | B | C |\n> | --- | --- | --- |\n> | 1 | 2 | 3 |\n> |  |  |  |\n> | 4 | 5 | 6 |");
  assert.equal(quoted?.selectionStart, (quoted?.value.indexOf("> |  |  |  |") ?? -1) + "> |  | ".length);
  assert.equal(quoted?.selectionEnd, quoted?.selectionStart);
});

test("continueMarkdownBlock preserves CRLF when inserting a table row", () => {
  const table = "| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n| 3 | 4 |";
  const result = continueMarkdownBlock({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  });
  const expected = "| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n|  |  |\r\n| 3 | 4 |";

  assert.equal(result?.value, expected);
  assert.equal(result?.selectionStart, expected.indexOf("|  |  |") + 5);
  assert.equal(result?.selectionEnd, result?.selectionStart);
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("continueMarkdownBlock preserves tables without outer pipes", () => {
  const table = "A | B\n--- | ---\n1 | 2";
  const result = continueMarkdownBlock({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  });

  assert.equal(result?.value, "A | B\n--- | ---\n1 | 2\n | ");
  assert.equal(result?.selectionStart, (result?.value.lastIndexOf("\n | ") ?? -1) + "\n | ".length);
  assert.equal(result?.selectionEnd, result?.selectionStart);
});

test("continueMarkdownBlock appends a table row from the last body row", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const result = continueMarkdownBlock({
    value: table,
    selectionStart: table.length,
    selectionEnd: table.length,
  });

  assert.equal(result?.value, "| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |");
  const insertedRowStart = result?.value.lastIndexOf("|  |  |") ?? -1;
  assert.equal(result?.selectionStart, insertedRowStart + 5);
  assert.equal(result?.selectionEnd, result?.selectionStart);
});

test("continueMarkdownBlock creates Front Matter from a document-start dash marker", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "---", selectionStart: 3, selectionEnd: 3 }),
    { value: "---\n\n---", selectionStart: 4, selectionEnd: 4 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "\uFEFF---", selectionStart: 4, selectionEnd: 4 }),
    { value: "\uFEFF---\n\n---", selectionStart: 5, selectionEnd: 5 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "---\r\nBody", selectionStart: 3, selectionEnd: 3 }),
    { value: "---\r\n\r\n---\r\nBody", selectionStart: 5, selectionEnd: 5 },
  );
});

test("continueMarkdownBlock completes horizontal rule marker lines", () => {
  const dashed = "before\n---";
  assert.deepEqual(
    continueMarkdownBlock({ value: dashed, selectionStart: dashed.length, selectionEnd: dashed.length }),
    { value: `${dashed}\n`, selectionStart: dashed.length + 1, selectionEnd: dashed.length + 1 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "***", selectionStart: 3, selectionEnd: 3 }),
    { value: "***\n", selectionStart: 4, selectionEnd: 4 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "___", selectionStart: 3, selectionEnd: 3 }),
    { value: "___\n", selectionStart: 4, selectionEnd: 4 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "+++", selectionStart: 3, selectionEnd: 3 }),
    { value: "+++\n", selectionStart: 4, selectionEnd: 4 },
  );
  assert.equal(
    continueMarkdownBlock({ value: "--- trailing", selectionStart: 3, selectionEnd: 3 }),
    null,
  );
});

test("applyMarkdownSpaceShortcut normalizes Typora-style line markers", () => {
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "*", selectionStart: 1, selectionEnd: 1 }),
    { value: "* ", selectionStart: 2, selectionEnd: 2 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "  >", selectionStart: 3, selectionEnd: 3 }),
    { value: "  > ", selectionStart: 4, selectionEnd: 4 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "[]", selectionStart: 2, selectionEnd: 2 }),
    { value: "- [ ] ", selectionStart: 6, selectionEnd: 6 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "[x]", selectionStart: 3, selectionEnd: 3 }),
    { value: "- [x] ", selectionStart: 6, selectionEnd: 6 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "[ ]", selectionStart: 3, selectionEnd: 3 }),
    { value: "- [ ] ", selectionStart: 6, selectionEnd: 6 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "[X]", selectionStart: 3, selectionEnd: 3 }),
    { value: "- [x] ", selectionStart: 6, selectionEnd: 6 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "- [x]", selectionStart: 5, selectionEnd: 5 }),
    { value: "- [x] ", selectionStart: 6, selectionEnd: 6 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "1. [x]", selectionStart: "1. [x]".length, selectionEnd: "1. [x]".length }),
    { value: "1. [x] ", selectionStart: "1. [x] ".length, selectionEnd: "1. [x] ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "1) [X]", selectionStart: "1) [X]".length, selectionEnd: "1) [X]".length }),
    { value: "1) [x] ", selectionStart: "1) [x] ".length, selectionEnd: "1) [x] ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "---", selectionStart: 3, selectionEnd: 3 }),
    { value: "---\n", selectionStart: 4, selectionEnd: 4 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "***", selectionStart: 3, selectionEnd: 3 }),
    { value: "***\n", selectionStart: 4, selectionEnd: 4 },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "___", selectionStart: 3, selectionEnd: 3 }),
    { value: "___\n", selectionStart: 4, selectionEnd: 4 },
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "--- trailing", selectionStart: 3, selectionEnd: 3 }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "****", selectionStart: 4, selectionEnd: 4 }),
    null,
  );
});

test("applyMarkdownSpaceShortcut ignores markers inside raw fences", () => {
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "```md\n*", selectionStart: "```md\n*".length, selectionEnd: "```md\n*".length }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "$$\n#", selectionStart: "$$\n#".length, selectionEnd: "$$\n#".length }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "\\[\n#", selectionStart: "\\[\n#".length, selectionEnd: "\\[\n#".length }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "> ```md\n> #", selectionStart: "> ```md\n> #".length, selectionEnd: "> ```md\n> #".length }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "> $$\n> *", selectionStart: "> $$\n> *".length, selectionEnd: "> $$\n> *".length }),
    null,
  );
});

test("applyMarkdownSpaceShortcut ignores markers inside raw HTML blocks like Typora", () => {
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "<div>\n*", selectionStart: "<div>\n*".length, selectionEnd: "<div>\n*".length }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "<table>\n---", selectionStart: "<table>\n---".length, selectionEnd: "<table>\n---".length }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "> <div>\n> #", selectionStart: "> <div>\n> #".length, selectionEnd: "> <div>\n> #".length }),
    null,
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "<div>\n> literal\n*", selectionStart: "<div>\n> literal\n*".length, selectionEnd: "<div>\n> literal\n*".length }),
    null,
  );
});

test("applyMarkdownSpaceShortcut normalizes markers inside blockquotes", () => {
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "> *", selectionStart: "> *".length, selectionEnd: "> *".length }),
    { value: "> * ", selectionStart: "> * ".length, selectionEnd: "> * ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: ">>", selectionStart: ">>".length, selectionEnd: ">>".length }),
    { value: "> > ", selectionStart: "> > ".length, selectionEnd: "> > ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "> >", selectionStart: "> >".length, selectionEnd: "> >".length }),
    { value: "> > ", selectionStart: "> > ".length, selectionEnd: "> > ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: ">\t*", selectionStart: ">\t*".length, selectionEnd: ">\t*".length }),
    { value: "> * ", selectionStart: "> * ".length, selectionEnd: "> * ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "> []", selectionStart: "> []".length, selectionEnd: "> []".length }),
    { value: "> - [ ] ", selectionStart: "> - [ ] ".length, selectionEnd: "> - [ ] ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "> [x]", selectionStart: "> [x]".length, selectionEnd: "> [x]".length }),
    { value: "> - [x] ", selectionStart: "> - [x] ".length, selectionEnd: "> - [x] ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: ">   []", selectionStart: ">   []".length, selectionEnd: ">   []".length }),
    { value: ">   - [ ] ", selectionStart: ">   - [ ] ".length, selectionEnd: ">   - [ ] ".length },
  );
  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "> 1. [x]", selectionStart: "> 1. [x]".length, selectionEnd: "> 1. [x]".length }),
    { value: "> 1. [x] ", selectionStart: "> 1. [x] ".length, selectionEnd: "> 1. [x] ".length },
  );
  assert.equal(
    applyMarkdownSpaceShortcut({ value: "> --- trailing", selectionStart: "> ---".length, selectionEnd: "> ---".length }),
    null,
  );
});

test("applyMarkdownSpaceShortcut preserves CRLF for generated horizontal rules", () => {
  const plain = applyMarkdownSpaceShortcut({
    value: "before\r\n---",
    selectionStart: "before\r\n---".length,
    selectionEnd: "before\r\n---".length,
  });

  assert.deepEqual(plain, {
    value: "before\r\n---\r\n",
    selectionStart: "before\r\n---\r\n".length,
    selectionEnd: "before\r\n---\r\n".length,
  });
  assertOnlyCrlfLineBreaks(plain?.value ?? "");

  const quoted = applyMarkdownSpaceShortcut({
    value: "before\r\n> ---",
    selectionStart: "before\r\n> ---".length,
    selectionEnd: "before\r\n> ---".length,
  });
  assert.deepEqual(quoted, {
    value: "before\r\n> ---\r\n",
    selectionStart: "before\r\n> ---\r\n".length,
    selectionEnd: "before\r\n> ---\r\n".length,
  });
  assertOnlyCrlfLineBreaks(quoted?.value ?? "");

  assert.deepEqual(
    applyMarkdownSpaceShortcut({ value: "+++", selectionStart: 3, selectionEnd: 3 }),
    { value: "+++\n", selectionStart: 4, selectionEnd: 4 },
  );
});

test("toggleTaskAtSelection toggles existing tasks or creates a task item", () => {
  assert.equal(
    toggleTaskAtSelection({ value: "- [ ] item", selectionStart: 3, selectionEnd: 3 }).value,
    "- [x] item",
  );
  assert.equal(
    toggleTaskAtSelection({ value: "plain", selectionStart: 0, selectionEnd: 0 }).value,
    "- [ ] plain",
  );
  assert.equal(
    toggleTaskAtSelection({ value: "- item", selectionStart: 2, selectionEnd: 2 }).value,
    "- [ ] item",
  );
  assert.equal(
    toggleTaskAtSelection({ value: "1. item", selectionStart: 3, selectionEnd: 3 }).value,
    "1. [ ] item",
  );
  assert.equal(
    toggleTaskAtSelection({ value: "> - item", selectionStart: "> - ".length, selectionEnd: "> - ".length }).value,
    "> - [ ] item",
  );
  assert.equal(
    toggleTaskAtSelection({ value: "> note", selectionStart: "> ".length, selectionEnd: "> ".length }).value,
    "> - [ ] note",
  );
  assert.equal(
    toggleTaskAtSelection({ value: "plain [x] marker", selectionStart: 0, selectionEnd: 0 }).value,
    "- [ ] plain [x] marker",
  );
  assert.equal(
    toggleTaskAtSelection({ value: "- item [x] marker", selectionStart: 2, selectionEnd: 2 }).value,
    "- [ ] item [x] marker",
  );
});

test("toggleTaskAtSelection applies to selected lines like Typora", () => {
  const source = "- [ ] one\n- [x] two\nplain";
  const result = toggleTaskAtSelection({ value: source, selectionStart: 0, selectionEnd: source.length });
  assert.deepEqual(result, {
    value: "- [x] one\n- [ ] two\n- [ ] plain",
    selectionStart: 0,
    selectionEnd: "- [x] one\n- [ ] two\n- [ ] plain".length,
  });

  const quoted = "> note\n> - [ ] task\n\n1. item";
  assert.equal(
    toggleTaskAtSelection({ value: quoted, selectionStart: 0, selectionEnd: quoted.length }).value,
    "> - [ ] note\n> - [x] task\n\n1. [ ] item",
  );
});

test("toggleTaskAtSelection keeps the cursor with item text like Typora", () => {
  assert.deepEqual(
    toggleTaskAtSelection({
      value: "alpha beta",
      selectionStart: "alpha".length,
      selectionEnd: "alpha".length,
    }),
    {
      value: "- [ ] alpha beta",
      selectionStart: "- [ ] alpha".length,
      selectionEnd: "- [ ] alpha".length,
    },
  );

  assert.deepEqual(
    toggleTaskAtSelection({
      value: "- alpha beta",
      selectionStart: "- alpha".length,
      selectionEnd: "- alpha".length,
    }),
    {
      value: "- [ ] alpha beta",
      selectionStart: "- [ ] alpha".length,
      selectionEnd: "- [ ] alpha".length,
    },
  );

  assert.deepEqual(
    toggleTaskAtSelection({
      value: "1. alpha beta",
      selectionStart: "1. alpha".length,
      selectionEnd: "1. alpha".length,
    }),
    {
      value: "1. [ ] alpha beta",
      selectionStart: "1. [ ] alpha".length,
      selectionEnd: "1. [ ] alpha".length,
    },
  );

  assert.deepEqual(
    toggleTaskAtSelection({
      value: "> alpha beta",
      selectionStart: "> alpha".length,
      selectionEnd: "> alpha".length,
    }),
    {
      value: "> - [ ] alpha beta",
      selectionStart: "> - [ ] alpha".length,
      selectionEnd: "> - [ ] alpha".length,
    },
  );

  const source = "alpha\n> 1. beta";
  assert.deepEqual(
    toggleTaskAtSelection({
      value: source,
      selectionStart: "al".length,
      selectionEnd: source.indexOf("beta") + "be".length,
    }),
    {
      value: "- [ ] alpha\n> 1. [ ] beta",
      selectionStart: "- [ ] al".length,
      selectionEnd: "- [ ] alpha\n> 1. [ ] be".length,
    },
  );

  assert.deepEqual(
    toggleTaskAtSelection({
      value: "- [ ] alpha",
      selectionStart: "- [ ] al".length,
      selectionEnd: "- [ ] alpha".length,
    }),
    {
      value: "- [x] alpha",
      selectionStart: "- [x] al".length,
      selectionEnd: "- [x] alpha".length,
    },
  );
});

test("toggleTaskAtSelection preserves CRLF while toggling existing tasks", () => {
  const result = toggleTaskAtSelection({
    value: "- [ ] task\r\n- [x] done",
    selectionStart: "- [ ] ta".length,
    selectionEnd: "- [ ] ta".length,
  });

  assert.deepEqual(result, {
    value: "- [x] task\r\n- [x] done",
    selectionStart: "- [ ] ta".length,
    selectionEnd: "- [ ] ta".length,
  });
  assertOnlyCrlfLineBreaks(result.value);

  const added = toggleTaskAtSelection({
    value: "plain\r\n> quoted",
    selectionStart: "plain\r\n> qu".length,
    selectionEnd: "plain\r\n> qu".length,
  });
  assert.deepEqual(added, {
    value: "plain\r\n> - [ ] quoted",
    selectionStart: "plain\r\n> - [ ] qu".length,
    selectionEnd: "plain\r\n> - [ ] qu".length,
  });
  assertOnlyCrlfLineBreaks(added.value);
});

test("toggleMarkdownTaskByOrder toggles unordered and ordered task items", () => {
  const source = "- [ ] one\n1. [x] two\n- [ ] three";

  assert.equal(
    toggleMarkdownTaskByOrder(source, 1),
    "- [ ] one\n1. [ ] two\n- [ ] three",
  );
  assert.equal(
    toggleMarkdownTaskByOrder(source, 2),
    "- [ ] one\n1. [x] two\n- [x] three",
  );
});

test("toggleMarkdownTaskByOrder toggles tasks inside blockquotes", () => {
  const source = "> - [ ] quoted\n> > 1. [x] nested\n- [ ] plain";

  assert.equal(
    toggleMarkdownTaskByOrder(source, 0),
    "> - [x] quoted\n> > 1. [x] nested\n- [ ] plain",
  );
  assert.equal(
    toggleMarkdownTaskByOrder(source, 1),
    "> - [ ] quoted\n> > 1. [ ] nested\n- [ ] plain",
  );
});

test("formatMarkdownLines toggles blockquote without duplicating markers", () => {
  const quoted = formatMarkdownLines({ value: "alpha\nbeta", selectionStart: 0, selectionEnd: 10 }, "blockquote");
  assert.equal(quoted.value, "> alpha\n> beta");

  const plain = formatMarkdownLines({ value: quoted.value, selectionStart: 0, selectionEnd: quoted.value.length }, "blockquote");
  assert.equal(plain.value, "alpha\nbeta");

  assert.equal(
    formatMarkdownLines({ value: "- alpha", selectionStart: 0, selectionEnd: "- alpha".length }, "blockquote").value,
    "> - alpha",
  );
  assert.equal(
    formatMarkdownLines({ value: "> - alpha", selectionStart: 0, selectionEnd: "> - alpha".length }, "blockquote").value,
    "- alpha",
  );
  assert.deepEqual(
    formatMarkdownLines({ value: "", selectionStart: 0, selectionEnd: 0 }, "blockquote"),
    { value: "> ", selectionStart: "> ".length, selectionEnd: "> ".length },
  );
  assert.deepEqual(
    formatMarkdownLines({ value: "> ", selectionStart: "> ".length, selectionEnd: "> ".length }, "blockquote"),
    { value: "", selectionStart: 0, selectionEnd: 0 },
  );
});

test("formatMarkdownLines keeps the cursor with paragraph text like Typora", () => {
  assert.deepEqual(
    formatMarkdownLines({ value: "alpha beta", selectionStart: "alpha be".length, selectionEnd: "alpha be".length }, "bullet"),
    { value: "- alpha beta", selectionStart: "- alpha be".length, selectionEnd: "- alpha be".length },
  );

  assert.deepEqual(
    formatMarkdownLines({ value: "alpha beta", selectionStart: "alpha".length, selectionEnd: "alpha beta".length }, "blockquote"),
    { value: "> alpha beta", selectionStart: "> alpha".length, selectionEnd: "> alpha beta".length },
  );

  assert.deepEqual(
    formatMarkdownLines({ value: "- alpha beta", selectionStart: "- alpha".length, selectionEnd: "- alpha".length }, "ordered"),
    { value: "1. alpha beta", selectionStart: "1. alpha".length, selectionEnd: "1. alpha".length },
  );

  assert.deepEqual(
    formatMarkdownLines({ value: "- alpha beta", selectionStart: "- alpha".length, selectionEnd: "- alpha".length }, "bullet"),
    { value: "alpha beta", selectionStart: "alpha".length, selectionEnd: "alpha".length },
  );

  assert.deepEqual(
    formatMarkdownLines({ value: "> - alpha", selectionStart: "> - al".length, selectionEnd: "> - al".length }, "task"),
    { value: "> - [ ] alpha", selectionStart: "> - [ ] al".length, selectionEnd: "> - [ ] al".length },
  );
});

test("formatMarkdownLines converts between list types", () => {
  assert.equal(
    formatMarkdownLines({ value: "- alpha\n- beta", selectionStart: 0, selectionEnd: 14 }, "ordered").value,
    "1. alpha\n2. beta",
  );
  assert.equal(
    formatMarkdownLines({ value: "1. alpha\n2. beta", selectionStart: 0, selectionEnd: 17 }, "task").value,
    "- [ ] alpha\n- [ ] beta",
  );
  assert.equal(
    formatMarkdownLines({ value: "# Title", selectionStart: 0, selectionEnd: 7 }, "bullet").value,
    "- Title",
  );
  assert.equal(
    formatMarkdownLines({ value: "### Title ###", selectionStart: 0, selectionEnd: "### Title ###".length }, "bullet").value,
    "- Title",
  );
  assert.equal(
    formatMarkdownLines({ value: "# C#", selectionStart: 0, selectionEnd: "# C#".length }, "bullet").value,
    "- C#",
  );
  assert.equal(
    formatMarkdownLines({ value: "> alpha\n> beta", selectionStart: 0, selectionEnd: "> alpha\n> beta".length }, "bullet").value,
    "> - alpha\n> - beta",
  );
  assert.equal(
    formatMarkdownLines({ value: "> - alpha\n> - beta", selectionStart: 0, selectionEnd: "> - alpha\n> - beta".length }, "ordered").value,
    "> 1. alpha\n> 2. beta",
  );
  assert.equal(
    formatMarkdownLines({ value: ": Definition", selectionStart: 0, selectionEnd: ": Definition".length }, "bullet").value,
    "- Definition",
  );
  assert.equal(
    formatMarkdownLines({ value: "[^1]: detail", selectionStart: 0, selectionEnd: "[^1]: detail".length }, "task").value,
    "- [ ] detail",
  );
  assert.equal(
    formatMarkdownLines({ value: "Term\nDefinition", selectionStart: "Term\n".length, selectionEnd: "Term\nDefinition".length }, "definition").value,
    "Term\n: Definition",
  );
  assert.equal(
    formatMarkdownLines({ value: "> Term\n> Definition", selectionStart: "> Term\n".length, selectionEnd: "> Term\n> Definition".length }, "definition").value,
    "> Term\n> : Definition",
  );
  assert.deepEqual(
    formatMarkdownLines({ value: "", selectionStart: 0, selectionEnd: 0 }, "bullet"),
    { value: "- ", selectionStart: "- ".length, selectionEnd: "- ".length },
  );
  assert.deepEqual(
    formatMarkdownLines({ value: "", selectionStart: 0, selectionEnd: 0 }, "ordered"),
    { value: "1. ", selectionStart: "1. ".length, selectionEnd: "1. ".length },
  );
  assert.deepEqual(
    formatMarkdownLines({ value: "", selectionStart: 0, selectionEnd: 0 }, "task"),
    { value: "- [ ] ", selectionStart: "- [ ] ".length, selectionEnd: "- [ ] ".length },
  );
  assert.deepEqual(
    formatMarkdownLines({ value: "> ", selectionStart: "> ".length, selectionEnd: "> ".length }, "bullet"),
    { value: "> - ", selectionStart: "> - ".length, selectionEnd: "> - ".length },
  );
  assert.deepEqual(
    formatMarkdownLines({ value: "", selectionStart: 0, selectionEnd: 0 }, "definition"),
    { value: ": ", selectionStart: ": ".length, selectionEnd: ": ".length },
  );
});

test("formatMarkdownLines keeps checked tasks when applying task list to mixed lines", () => {
  assert.equal(
    formatMarkdownLines({
      value: "- [x] done\nplain",
      selectionStart: 0,
      selectionEnd: "- [x] done\nplain".length,
    }, "task").value,
    "- [x] done\n- [ ] plain",
  );

  assert.equal(
    formatMarkdownLines({
      value: "> 1. [X] quoted\n> plain",
      selectionStart: 0,
      selectionEnd: "> 1. [X] quoted\n> plain".length,
    }, "task").value,
    "> - [x] quoted\n> - [ ] plain",
  );
});

test("formatMarkdownLines toggles the same list type back to paragraph", () => {
  assert.equal(
    formatMarkdownLines({ value: "- alpha\n- beta", selectionStart: 0, selectionEnd: 14 }, "bullet").value,
    "alpha\nbeta",
  );
  assert.equal(
    formatMarkdownLines({ value: "1. alpha\n2. beta", selectionStart: 0, selectionEnd: "1. alpha\n2. beta".length }, "ordered").value,
    "alpha\nbeta",
  );
  assert.equal(
    formatMarkdownLines({ value: "- [x] done\n- [ ] todo", selectionStart: 0, selectionEnd: "- [x] done\n- [ ] todo".length }, "task").value,
    "done\ntodo",
  );
  assert.equal(
    formatMarkdownLines({ value: "> - alpha\n> - beta", selectionStart: 0, selectionEnd: "> - alpha\n> - beta".length }, "bullet").value,
    "> alpha\n> beta",
  );
  assert.equal(
    formatMarkdownLines({ value: "> - [x] done\n> - [ ] todo", selectionStart: 0, selectionEnd: "> - [x] done\n> - [ ] todo".length }, "task").value,
    "> done\n> todo",
  );
  assert.equal(
    formatMarkdownLines({ value: ": Definition\n: Second", selectionStart: 0, selectionEnd: ": Definition\n: Second".length }, "definition").value,
    "Definition\nSecond",
  );
  assert.equal(
    formatMarkdownLines({ value: "> : Definition", selectionStart: 0, selectionEnd: "> : Definition".length }, "definition").value,
    "> Definition",
  );
  assert.equal(
    formatMarkdownLines({ value: "    - code", selectionStart: 0, selectionEnd: "    - code".length }, "bullet").value,
    "    - - code",
  );
});

test("formatMarkdownLines preserves CRLF when toggling blockquote and list formats", () => {
  const quoted = formatMarkdownLines({
    value: "alpha\r\nbeta",
    selectionStart: "al".length,
    selectionEnd: "alpha\r\nbe".length,
  }, "blockquote");
  assert.deepEqual(quoted, {
    value: "> alpha\r\n> beta",
    selectionStart: "> al".length,
    selectionEnd: "> alpha\r\n> be".length,
  });
  assertOnlyCrlfLineBreaks(quoted.value);

  const ordered = formatMarkdownLines({
    value: "- alpha\r\n- beta",
    selectionStart: "- al".length,
    selectionEnd: "- alpha\r\n- be".length,
  }, "ordered");
  assert.deepEqual(ordered, {
    value: "1. alpha\r\n2. beta",
    selectionStart: "1. al".length,
    selectionEnd: "1. alpha\r\n2. be".length,
  });
  assertOnlyCrlfLineBreaks(ordered.value);

  const plain = formatMarkdownLines({
    value: "> - [x] done\r\n> - [ ] todo",
    selectionStart: 0,
    selectionEnd: "> - [x] done\r\n> - [ ] todo".length,
  }, "task");
  assert.equal(plain.value, "> done\r\n> todo");
  assertOnlyCrlfLineBreaks(plain.value);

  const definition = formatMarkdownLines({
    value: "Term\r\nDefinition",
    selectionStart: "Term\r\n".length,
    selectionEnd: "Term\r\nDefinition".length,
  }, "definition");
  assert.equal(definition.value, "Term\r\n: Definition");
  assert.equal(definition.selectionStart, "Term\r\n: ".length);
  assertOnlyCrlfLineBreaks(definition.value);
});

test("formatMarkdownLines strips CRLF heading markers when converting to lists", () => {
  const result = formatMarkdownLines({
    value: "# Alpha\r\n### Beta ###",
    selectionStart: 0,
    selectionEnd: "# Alpha\r\n### Beta ###".length,
  }, "bullet");

  assert.equal(result.value, "- Alpha\r\n- Beta");
  assertOnlyCrlfLineBreaks(result.value);
});

test("auto pair inserts pairs, skips existing closing char, and removes pairs on backspace", () => {
  assert.deepEqual(
    applyAutoPair({ value: "abc", selectionStart: 1, selectionEnd: 2 }, "("),
    { value: "a(b)c", selectionStart: 2, selectionEnd: 3 },
  );
  assert.deepEqual(
    applyAutoPair({ value: "()", selectionStart: 1, selectionEnd: 1 }, ")"),
    { value: "()", selectionStart: 2, selectionEnd: 2 },
  );
  assert.deepEqual(
    removeAutoPairOnBackspace({ value: "()", selectionStart: 1, selectionEnd: 1 }),
    { value: "", selectionStart: 0, selectionEnd: 0 },
  );
  assert.deepEqual(
    applyAutoPair({ value: "math", selectionStart: 0, selectionEnd: 4 }, "$"),
    { value: "$math$", selectionStart: 1, selectionEnd: 5 },
  );
  assert.equal(
    applyAutoPair({ value: "", selectionStart: 0, selectionEnd: 0 }, "$"),
    null,
  );
  assert.deepEqual(
    removeAutoPairOnBackspace({ value: "$$", selectionStart: 1, selectionEnd: 1 }),
    { value: "", selectionStart: 0, selectionEnd: 0 },
  );
});

test("auto pair supports full-width brackets and Chinese quotes like Typora", () => {
  assert.deepEqual(
    applyAutoPair({ value: "标题", selectionStart: 0, selectionEnd: 2 }, "《"),
    { value: "《标题》", selectionStart: 1, selectionEnd: 3 },
  );
  assert.deepEqual(
    applyAutoPair({ value: "中文", selectionStart: 0, selectionEnd: 0 }, "“"),
    { value: "“”中文", selectionStart: 1, selectionEnd: 1 },
  );
  assert.deepEqual(
    applyAutoPair({ value: "（）", selectionStart: 1, selectionEnd: 1 }, "）"),
    { value: "（）", selectionStart: 2, selectionEnd: 2 },
  );
  assert.deepEqual(
    removeAutoPairOnBackspace({ value: "「」", selectionStart: 1, selectionEnd: 1 }),
    { value: "", selectionStart: 0, selectionEnd: 0 },
  );
});

test("applyAutoPair leaves apostrophes inside words for contractions", () => {
  assert.equal(
    applyAutoPair({ value: "dont", selectionStart: 3, selectionEnd: 3 }, "'"),
    null,
  );
  assert.equal(
    applyAutoPair({ value: "James", selectionStart: 5, selectionEnd: 5 }, "'"),
    null,
  );
  assert.deepEqual(
    applyAutoPair({ value: "say ", selectionStart: 4, selectionEnd: 4 }, "'"),
    { value: "say ''", selectionStart: 5, selectionEnd: 5 },
  );
});

test("applyAutoPair wraps selected markdown markers without blocking list shortcuts", () => {
  assert.deepEqual(
    applyAutoPair({ value: "word", selectionStart: 0, selectionEnd: 4 }, "*"),
    { value: "*word*", selectionStart: 1, selectionEnd: 5 },
  );
  assert.deepEqual(
    applyAutoPair({ value: "word", selectionStart: 0, selectionEnd: 4 }, "_"),
    { value: "_word_", selectionStart: 1, selectionEnd: 5 },
  );
  assert.deepEqual(
    applyAutoPair({ value: "H2O", selectionStart: 1, selectionEnd: 2 }, "~"),
    { value: "H~2~O", selectionStart: 2, selectionEnd: 3 },
  );
  assert.equal(
    applyAutoPair({ value: "", selectionStart: 0, selectionEnd: 0 }, "*"),
    null,
  );
});

test("applyAutoPair lets code fence backticks continue after skipping the closing pair", () => {
  assert.deepEqual(
    applyAutoPair({ value: "", selectionStart: 0, selectionEnd: 0 }, "`"),
    { value: "``", selectionStart: 1, selectionEnd: 1 },
  );
  assert.deepEqual(
    applyAutoPair({ value: "``", selectionStart: 1, selectionEnd: 1 }, "`"),
    { value: "``", selectionStart: 2, selectionEnd: 2 },
  );
  assert.equal(
    applyAutoPair({ value: "``", selectionStart: 2, selectionEnd: 2 }, "`"),
    null,
  );
});

test("outdentMarkdownListOnBackspace lifts or unwraps list items like Typora", () => {
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: "  - child", selectionStart: "  - ".length, selectionEnd: "  - ".length }),
    { value: "- child", selectionStart: "- ".length, selectionEnd: "- ".length },
  );
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: "  2. child", selectionStart: "  2. ".length, selectionEnd: "  2. ".length }),
    { value: "2. child", selectionStart: "2. ".length, selectionEnd: "2. ".length },
  );
  const nestedOrdered = "9. nine\n  1. child\n10. ten";
  assert.deepEqual(
    outdentMarkdownListOnBackspace({
      value: nestedOrdered,
      selectionStart: "9. nine\n  1. ".length,
      selectionEnd: "9. nine\n  1. ".length,
    }),
    {
      value: "9. nine\n10. child\n11. ten",
      selectionStart: "9. nine\n10. ".length,
      selectionEnd: "9. nine\n10. ".length,
    },
  );
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: "- parent\n\t- [ ] task", selectionStart: "- parent\n\t- [ ] ".length, selectionEnd: "- parent\n\t- [ ] ".length }),
    { value: "- parent\n- [ ] task", selectionStart: "- parent\n- [ ] ".length, selectionEnd: "- parent\n- [ ] ".length },
  );
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: "- child", selectionStart: "- ".length, selectionEnd: "- ".length }),
    { value: "child", selectionStart: 0, selectionEnd: 0 },
  );
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: "1. child", selectionStart: "1. ".length, selectionEnd: "1. ".length }),
    { value: "child", selectionStart: 0, selectionEnd: 0 },
  );
  const ordered = "1. one\n2. two\n3. three";
  assert.deepEqual(
    outdentMarkdownListOnBackspace({
      value: ordered,
      selectionStart: "1. one\n2. ".length,
      selectionEnd: "1. one\n2. ".length,
    }),
    {
      value: "1. one\ntwo\n2. three",
      selectionStart: "1. one\n".length,
      selectionEnd: "1. one\n".length,
    },
  );
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: "- [ ] task", selectionStart: "- [ ] ".length, selectionEnd: "- [ ] ".length }),
    { value: "task", selectionStart: 0, selectionEnd: 0 },
  );
  assert.equal(
    outdentMarkdownListOnBackspace({ value: "  - child", selectionStart: "  - c".length, selectionEnd: "  - c".length }),
    null,
  );
});

test("outdentMarkdownListOnBackspace handles quoted list items like Typora", () => {
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: "> - child", selectionStart: "> - ".length, selectionEnd: "> - ".length }),
    { value: "> child", selectionStart: "> ".length, selectionEnd: "> ".length },
  );

  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: ">   - child", selectionStart: ">   - ".length, selectionEnd: ">   - ".length }),
    { value: "> - child", selectionStart: "> - ".length, selectionEnd: "> - ".length },
  );

  const ordered = "> 1. one\n> 2. two\n> 3. three";
  const cursor = "> 1. one\n> 2. ".length;
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: ordered, selectionStart: cursor, selectionEnd: cursor }),
    { value: "> 1. one\n> two\n> 2. three", selectionStart: "> 1. one\n> ".length, selectionEnd: "> 1. one\n> ".length },
  );

  const nestedOrdered = "> 9. nine\n>   1. child\n> 10. ten";
  const nestedCursor = "> 9. nine\n>   1. ".length;
  assert.deepEqual(
    outdentMarkdownListOnBackspace({ value: nestedOrdered, selectionStart: nestedCursor, selectionEnd: nestedCursor }),
    { value: "> 9. nine\n> 10. child\n> 11. ten", selectionStart: "> 9. nine\n> 10. ".length, selectionEnd: "> 9. nine\n> 10. ".length },
  );
});

test("backspace markdown block shortcuts ignore raw fence content", () => {
  assert.equal(
    outdentMarkdownListOnBackspace({ value: "```md\n- item", selectionStart: "```md\n- ".length, selectionEnd: "```md\n- ".length }),
    null,
  );
  assert.equal(
    unwrapMarkdownBlockOnBackspace({ value: "$$\n# title", selectionStart: "$$\n# ".length, selectionEnd: "$$\n# ".length }),
    null,
  );
  assert.equal(
    outdentMarkdownListOnBackspace({ value: "<div>\n- item", selectionStart: "<div>\n- ".length, selectionEnd: "<div>\n- ".length }),
    null,
  );
  assert.equal(
    unwrapMarkdownBlockOnBackspace({ value: "<section>\n# title", selectionStart: "<section>\n# ".length, selectionEnd: "<section>\n# ".length }),
    null,
  );
});

test("outdentMarkdownListOnBackspace preserves CRLF line endings like Typora", () => {
  const outdented = outdentMarkdownListOnBackspace({
    value: "parent\r\n  - child\r\nnext",
    selectionStart: "parent\r\n  - ".length,
    selectionEnd: "parent\r\n  - ".length,
  });
  assert.deepEqual(outdented, {
    value: "parent\r\n- child\r\nnext",
    selectionStart: "parent\r\n- ".length,
    selectionEnd: "parent\r\n- ".length,
  });
  assertOnlyCrlfLineBreaks(outdented?.value ?? "");

  const unwrapped = outdentMarkdownListOnBackspace({
    value: "parent\r\n> - child\r\nnext",
    selectionStart: "parent\r\n> - ".length,
    selectionEnd: "parent\r\n> - ".length,
  });
  assert.deepEqual(unwrapped, {
    value: "parent\r\n> child\r\nnext",
    selectionStart: "parent\r\n> ".length,
    selectionEnd: "parent\r\n> ".length,
  });
  assertOnlyCrlfLineBreaks(unwrapped?.value ?? "");
});

test("unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora", () => {
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "### Title", selectionStart: "### ".length, selectionEnd: "### ".length }),
    { value: "Title", selectionStart: 0, selectionEnd: 0 },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "  ## Title", selectionStart: "  ## ".length, selectionEnd: "  ## ".length }),
    { value: "  Title", selectionStart: 2, selectionEnd: 2 },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> Quote", selectionStart: "> ".length, selectionEnd: "> ".length }),
    { value: "Quote", selectionStart: 0, selectionEnd: 0 },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> > Quote", selectionStart: "> > ".length, selectionEnd: "> > ".length }),
    { value: "> Quote", selectionStart: "> ".length, selectionEnd: "> ".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> ### Title", selectionStart: "> ### ".length, selectionEnd: "> ### ".length }),
    { value: "> Title", selectionStart: "> ".length, selectionEnd: "> ".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: ">> ## Title", selectionStart: ">> ## ".length, selectionEnd: ">> ## ".length }),
    { value: "> > Title", selectionStart: "> > ".length, selectionEnd: "> > ".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "Title\n---\nbody", selectionStart: "Title\n".length, selectionEnd: "Title\n".length }),
    { value: "Title\nbody", selectionStart: "Title".length, selectionEnd: "Title".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> Title\n> ---\nbody", selectionStart: "> Title\n".length, selectionEnd: "> Title\n".length }),
    { value: "> Title\nbody", selectionStart: "> Title".length, selectionEnd: "> Title".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "Title\n===", selectionStart: "Title\n".length, selectionEnd: "Title\n".length }),
    { value: "Title", selectionStart: "Title".length, selectionEnd: "Title".length },
  );
  const crlfSetext = unwrapMarkdownBlockOnBackspace({ value: "Title\r\n---\r\nbody", selectionStart: "Title\r\n".length, selectionEnd: "Title\r\n".length });
  assert.deepEqual(crlfSetext, { value: "Title\r\nbody", selectionStart: "Title".length, selectionEnd: "Title".length });
  assertOnlyCrlfLineBreaks(crlfSetext?.value ?? "");
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: ": Definition", selectionStart: ": ".length, selectionEnd: ": ".length }),
    { value: "Definition", selectionStart: 0, selectionEnd: 0 },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "  : Definition", selectionStart: "  : ".length, selectionEnd: "  : ".length }),
    { value: "  Definition", selectionStart: 2, selectionEnd: 2 },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> : Definition", selectionStart: "> : ".length, selectionEnd: "> : ".length }),
    { value: "> Definition", selectionStart: "> ".length, selectionEnd: "> ".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "[^1]: detail", selectionStart: "[^1]: ".length, selectionEnd: "[^1]: ".length }),
    { value: "detail", selectionStart: 0, selectionEnd: 0 },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "   [^1]: detail", selectionStart: "   [^1]: ".length, selectionEnd: "   [^1]: ".length }),
    { value: "   detail", selectionStart: 3, selectionEnd: 3 },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> [^1]: detail", selectionStart: "> [^1]: ".length, selectionEnd: "> [^1]: ".length }),
    { value: "> detail", selectionStart: "> ".length, selectionEnd: "> ".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "Term\n: Definition\n  continuation", selectionStart: "Term\n: Definition\n  ".length, selectionEnd: "Term\n: Definition\n  ".length }),
    { value: "Term\n: Definition\ncontinuation", selectionStart: "Term\n: Definition\n".length, selectionEnd: "Term\n: Definition\n".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> Term\n> : Definition\n>   continuation", selectionStart: "> Term\n> : Definition\n>   ".length, selectionEnd: "> Term\n> : Definition\n>   ".length }),
    { value: "> Term\n> : Definition\n> continuation", selectionStart: "> Term\n> : Definition\n> ".length, selectionEnd: "> Term\n> : Definition\n> ".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "[^1]: detail\n    continuation", selectionStart: "[^1]: detail\n    ".length, selectionEnd: "[^1]: detail\n    ".length }),
    { value: "[^1]: detail\ncontinuation", selectionStart: "[^1]: detail\n".length, selectionEnd: "[^1]: detail\n".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> [^1]: detail\n>     continuation", selectionStart: "> [^1]: detail\n>     ".length, selectionEnd: "> [^1]: detail\n>     ".length }),
    { value: "> [^1]: detail\n> continuation", selectionStart: "> [^1]: detail\n> ".length, selectionEnd: "> [^1]: detail\n> ".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "- item\n  continuation", selectionStart: "- item\n  ".length, selectionEnd: "- item\n  ".length }),
    { value: "- item\ncontinuation", selectionStart: "- item\n".length, selectionEnd: "- item\n".length },
  );
  assert.deepEqual(
    unwrapMarkdownBlockOnBackspace({ value: "> - item\n>   continuation", selectionStart: "> - item\n>   ".length, selectionEnd: "> - item\n>   ".length }),
    { value: "> - item\n> continuation", selectionStart: "> - item\n> ".length, selectionEnd: "> - item\n> ".length },
  );
  assert.equal(
    unwrapMarkdownBlockOnBackspace({ value: "paragraph\n  code", selectionStart: "paragraph\n  ".length, selectionEnd: "paragraph\n  ".length }),
    null,
  );
  assert.equal(
    unwrapMarkdownBlockOnBackspace({ value: "### Title", selectionStart: "### T".length, selectionEnd: "### T".length }),
    null,
  );
});

test("unwrapMarkdownBlockOnBackspace preserves CRLF for block markers", () => {
  const heading = unwrapMarkdownBlockOnBackspace({
    value: "before\r\n### Title\r\nafter",
    selectionStart: "before\r\n### ".length,
    selectionEnd: "before\r\n### ".length,
  });
  assert.deepEqual(heading, {
    value: "before\r\nTitle\r\nafter",
    selectionStart: "before\r\n".length,
    selectionEnd: "before\r\n".length,
  });
  assertOnlyCrlfLineBreaks(heading?.value ?? "");

  const quote = unwrapMarkdownBlockOnBackspace({
    value: "before\r\n> Quote\r\nafter",
    selectionStart: "before\r\n> ".length,
    selectionEnd: "before\r\n> ".length,
  });
  assert.deepEqual(quote, {
    value: "before\r\nQuote\r\nafter",
    selectionStart: "before\r\n".length,
    selectionEnd: "before\r\n".length,
  });
  assertOnlyCrlfLineBreaks(quote?.value ?? "");

  const definition = unwrapMarkdownBlockOnBackspace({
    value: "Term\r\n: Definition\r\n  continuation",
    selectionStart: "Term\r\n: Definition\r\n  ".length,
    selectionEnd: "Term\r\n: Definition\r\n  ".length,
  });
  assert.deepEqual(definition, {
    value: "Term\r\n: Definition\r\ncontinuation",
    selectionStart: "Term\r\n: Definition\r\n".length,
    selectionEnd: "Term\r\n: Definition\r\n".length,
  });
  assertOnlyCrlfLineBreaks(definition?.value ?? "");

  const listContinuation = unwrapMarkdownBlockOnBackspace({
    value: "- item\r\n  continuation",
    selectionStart: "- item\r\n  ".length,
    selectionEnd: "- item\r\n  ".length,
  });
  assert.deepEqual(listContinuation, {
    value: "- item\r\ncontinuation",
    selectionStart: "- item\r\n".length,
    selectionEnd: "- item\r\n".length,
  });
  assertOnlyCrlfLineBreaks(listContinuation?.value ?? "");
});

test("editMarkdownTable adds rows and columns to the table under cursor", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const rowResult = editMarkdownTable({ value: table, selectionStart: table.length, selectionEnd: table.length }, "row");
  assert.equal(rowResult.value, "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 内容 | 内容 |");

  const columnResult = editMarkdownTable({ value: table, selectionStart: 2, selectionEnd: 2 }, "column");
  assert.equal(columnResult.value, "| A | 新列 | B |\n| --- | --- | --- |\n| 1 | 内容 | 2 |");
});

test("insertMarkdownTableTemplate selects the first header cell like Typora", () => {
  const result = insertMarkdownTableTemplate({ value: "Intro", selectionStart: "Intro".length, selectionEnd: "Intro".length });
  const expected = "Intro\n| 列 1 | 列 2 | 列 3 |\n| --- | :---: | --- |\n| 内容 | 内容 | 内容 |\n";

  assert.equal(result.value, expected);
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "列 1");
});

test("insertMarkdownCalloutTemplate converts the current paragraph like Typora", () => {
  const result = insertMarkdownCalloutTemplate({ value: "Intro", selectionStart: "Intro".length, selectionEnd: "Intro".length });
  const expected = "> [!NOTE]\n> Intro";

  assert.equal(result.value, expected);
  assert.equal(result.selectionStart, expected.length);
  assert.equal(result.selectionEnd, expected.length);
});

test("insertMarkdownCalloutTemplate preserves CRLF line endings", () => {
  const source = "Intro\r\n";
  const result = insertMarkdownCalloutTemplate({ value: source, selectionStart: source.length, selectionEnd: source.length });
  const expected = "> [!NOTE]\r\n> Intro\r\n";

  assert.equal(result.value, expected);
  assert.equal(result.selectionStart, expected.length);
  assert.equal(result.selectionEnd, expected.length);
  assertOnlyCrlfLineBreaks(result.value);
});

test("insertMarkdownHorizontalRule inserts a standalone rule block like Typora", () => {
  const result = insertMarkdownHorizontalRule({ value: "Intro", selectionStart: "Intro".length, selectionEnd: "Intro".length });

  assert.equal(result.value, "Intro\n\n---\n");
  assert.equal(result.selectionStart, result.value.length);
  assert.equal(result.selectionEnd, result.value.length);
});

test("insertMarkdownHorizontalRule avoids extra blank lines around existing blocks", () => {
  const source = "Intro\n\nOutro";
  const result = insertMarkdownHorizontalRule({
    value: source,
    selectionStart: "Intro\n\n".length,
    selectionEnd: "Intro\n\n".length,
  });

  assert.equal(result.value, "Intro\n\n---\n\nOutro");
  assert.equal(result.selectionStart, "Intro\n\n---\n".length);
  assert.equal(result.selectionEnd, result.selectionStart);
});

test("insertMarkdownHorizontalRule preserves CRLF line endings", () => {
  const result = insertMarkdownHorizontalRule({ value: "Intro\r\nOutro", selectionStart: "Intro\r\n".length, selectionEnd: "Intro\r\n".length });

  assert.equal(result.value, "Intro\r\n\r\n---\r\n\r\nOutro");
  assert.equal(result.selectionStart, "Intro\r\n\r\n---\r\n".length);
  assertOnlyCrlfLineBreaks(result.value);
});

test("insertMarkdownTocTemplate inserts a standalone TOC block like Typora", () => {
  const result = insertMarkdownTocTemplate({ value: "Intro", selectionStart: "Intro".length, selectionEnd: "Intro".length });

  assert.equal(result.value, "Intro\n\n[TOC]\n");
  assert.equal(result.selectionStart, result.value.length);
});

test("insertMarkdownTocTemplate preserves CRLF line endings", () => {
  const result = insertMarkdownTocTemplate({ value: "Intro\r\nOutro", selectionStart: "Intro\r\n".length, selectionEnd: "Intro\r\n".length });

  assert.equal(result.value, "Intro\r\n\r\n[TOC]\r\n\r\nOutro");
  assert.equal(result.selectionStart, "Intro\r\n\r\n[TOC]\r\n".length);
  assertOnlyCrlfLineBreaks(result.value);
});

test("insertMarkdownFootnoteTemplate inserts a reference and selects the definition body like Typora", () => {
  const result = insertMarkdownFootnoteTemplate({ value: "Text", selectionStart: "Text".length, selectionEnd: "Text".length });

  assert.equal(result.value, "Text[^1]\n\n[^1]: 脚注内容");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "脚注内容");
});

test("insertMarkdownFootnoteTemplate uses selected text as the footnote body", () => {
  const source = "Text note";
  const result = insertMarkdownFootnoteTemplate({
    value: source,
    selectionStart: source.indexOf("note"),
    selectionEnd: source.length,
  });

  assert.equal(result.value, "Text [^1]\n\n[^1]: note");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "note");
});

test("insertMarkdownFootnoteTemplate skips existing numeric footnote ids", () => {
  const source = "Text[^1]\n\n[^1]: old";
  const result = insertMarkdownFootnoteTemplate({ value: source, selectionStart: "Text".length, selectionEnd: "Text".length });

  assert.equal(result.value, "Text[^2][^1]\n\n[^1]: old\n\n[^2]: 脚注内容");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "脚注内容");
});

test("insertMarkdownFootnoteTemplate preserves CRLF line endings", () => {
  const source = "Intro\r\nOutro";
  const result = insertMarkdownFootnoteTemplate({
    value: source,
    selectionStart: "Intro".length,
    selectionEnd: "Intro".length,
  });

  assert.equal(result.value, "Intro[^1]\r\nOutro\r\n\r\n[^1]: 脚注内容");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "脚注内容");
  assertOnlyCrlfLineBreaks(result.value);
});

test("editMarkdownTable inserts a CRLF table template in CRLF documents", () => {
  const source = "Intro\r\n";
  const result = editMarkdownTable({ value: source, selectionStart: source.length, selectionEnd: source.length }, "row");
  const expected = "Intro\r\n\r\n| 列 1 | 列 2 | 列 3 |\r\n| --- | :---: | --- |\r\n| 内容 | 内容 | 内容 |\r\n";

  assert.equal(result.value, expected);
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "列 1");
  assertOnlyCrlfLineBreaks(result.value);
});

test("insertMarkdownTableRow inserts above or below the current row", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";
  const above = insertMarkdownTableRow({
    value: table,
    selectionStart: table.indexOf("4"),
    selectionEnd: table.indexOf("4"),
  }, "above");

  assert.equal(
    above.value,
    "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 内容 | 内容 |\n| 3 | 4 |",
  );
  assert.equal(above.selectionStart, above.value.indexOf("| 内容 | 内容 |") + "| 内容 | ".length);
  assert.equal(above.selectionEnd, above.selectionStart + "内容".length);

  assert.equal(
    insertMarkdownTableRow({
      value: table,
      selectionStart: table.indexOf("1"),
      selectionEnd: table.indexOf("1"),
    }, "below").value,
    "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 内容 | 内容 |\n| 3 | 4 |",
  );
});

test("insertMarkdownTableRow can create an empty row for the Typora table shortcut", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const result = insertMarkdownTableRow({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  }, "below", "");

  assert.equal(result.value, "| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |");
  assert.equal(result.selectionStart, result.selectionEnd);
});

test("insertMarkdownTableColumn inserts left or right of the current column", () => {
  const table = "| A | B | C |\n| --- | :---: | ---: |\n| 1 | 2 | 3 |";
  const left = insertMarkdownTableColumn({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "left");

  assert.equal(
    left.value,
    "| A | 新列 | B | C |\n| --- | --- | :---: | ---: |\n| 1 | 内容 | 2 | 3 |",
  );
  assert.equal(left.selectionStart, left.value.indexOf("新列"));
  assert.equal(left.selectionEnd, left.selectionStart + "新列".length);

  assert.equal(
    insertMarkdownTableColumn({
      value: table,
      selectionStart: table.indexOf("B"),
      selectionEnd: table.indexOf("B"),
    }, "right").value,
    "| A | B | 新列 | C |\n| --- | :---: | --- | ---: |\n| 1 | 2 | 内容 | 3 |",
  );
});

test("table row commands respect multi-row selections like Typora", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |";
  const selectedRows = {
    value: table,
    selectionStart: table.indexOf("1"),
    selectionEnd: table.indexOf("4") + 1,
  };

  const above = insertMarkdownTableRow(selectedRows, "above");
  assert.equal(
    above.value,
    "| A | B |\n| --- | --- |\n| 内容 | 内容 |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |",
  );
  assert.equal(above.selectionStart, above.value.indexOf("内容"));
  assert.equal(above.selectionEnd, above.selectionStart + "内容".length);

  const below = insertMarkdownTableRow(selectedRows, "below");
  assert.equal(
    below.value,
    "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 内容 | 内容 |\n| 5 | 6 |",
  );

  const deleted = deleteMarkdownTablePart(selectedRows, "row");
  assert.equal(deleted?.value, "| A | B |\n| --- | --- |\n| 5 | 6 |");
  assert.equal(deleted?.selectionStart, deleted?.value.indexOf("5"));
  assert.equal(deleted?.selectionEnd, (deleted?.value.indexOf("5") ?? 0) + 1);
});

test("table column commands respect multi-column selections like Typora", () => {
  const table = "| A | B | C | D |\n| --- | :---: | ---: | --- |\n| 1 | 2 | 3 | 4 |";
  const selectedColumns = {
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("C") + 1,
  };

  const left = insertMarkdownTableColumn(selectedColumns, "left");
  assert.equal(
    left.value,
    "| A | 新列 | B | C | D |\n| --- | --- | :---: | ---: | --- |\n| 1 | 内容 | 2 | 3 | 4 |",
  );
  assert.equal(left.selectionStart, left.value.indexOf("新列"));
  assert.equal(left.selectionEnd, left.selectionStart + "新列".length);

  const right = insertMarkdownTableColumn(selectedColumns, "right");
  assert.equal(
    right.value,
    "| A | B | C | 新列 | D |\n| --- | :---: | ---: | --- | --- |\n| 1 | 2 | 3 | 内容 | 4 |",
  );

  const aligned = alignMarkdownTable(selectedColumns, "center");
  assert.equal(aligned?.value, "| A | B | C | D |\n| --- | :---: | :---: | --- |\n| 1 | 2 | 3 | 4 |");

  const deleted = deleteMarkdownTablePart(selectedColumns, "column");
  assert.equal(deleted?.value, "| A | D |\n| --- | --- |\n| 1 | 4 |");
  assert.equal(deleted?.selectionStart, deleted?.value.indexOf("D"));
  assert.equal(deleted?.selectionEnd, (deleted?.value.indexOf("D") ?? 0) + 1);
});

test("alignMarkdownTable edits the current table column separator", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const result = alignMarkdownTable({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "center");

  assert.equal(result?.value, "| A | B |\n| --- | :---: |\n| 1 | 2 |");
});

test("table editing repairs short separator rows like Typora", () => {
  const table = "| A | B | C |\n| --- |\n| 1 | 2 | 3 |";

  const aligned = alignMarkdownTable({
    value: table,
    selectionStart: table.indexOf("C"),
    selectionEnd: table.indexOf("C"),
  }, "right");
  assert.equal(aligned?.value, "| A | B | C |\n| --- | --- | ---: |\n| 1 | 2 | 3 |");

  const inserted = insertMarkdownTableColumn({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "right");
  assert.equal(inserted.value, "| A | B | 新列 | C |\n| --- | --- | --- | --- |\n| 1 | 2 | 内容 | 3 |");

  const deleted = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "column");
  assert.equal(deleted?.value, "| A | C |\n| --- | --- |\n| 1 | 3 |");
});

test("navigateMarkdownTableCell moves across table cells like Typora tab navigation", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const nextInRow = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.indexOf("1"),
    selectionEnd: table.indexOf("1"),
  }, "next");

  assert.equal(nextInRow?.value, table);
  assert.equal(nextInRow?.selectionStart, table.indexOf("2"));
  assert.equal(nextInRow?.selectionEnd, table.indexOf("2") + 1);

  const nextBodyRow = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "next");

  assert.equal(nextBodyRow?.selectionStart, table.indexOf("1"));
  assert.equal(nextBodyRow?.selectionEnd, table.indexOf("1") + 1);

  const previousHeader = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.indexOf("1"),
    selectionEnd: table.indexOf("1"),
  }, "previous");

  assert.equal(previousHeader?.selectionStart, table.indexOf("B"));
  assert.equal(previousHeader?.selectionEnd, table.indexOf("B") + 1);

  const compact = "| A | B |\n| - | :-: |\n| 1 | 2 |";
  const compactNext = navigateMarkdownTableCell({
    value: compact,
    selectionStart: compact.indexOf("1"),
    selectionEnd: compact.indexOf("1"),
  }, "next");
  assert.equal(compactNext?.selectionStart, compact.indexOf("2"));
  assert.equal(compactNext?.selectionEnd, compact.indexOf("2") + 1);
});

test("navigateMarkdownTableCell appends a row from the last cell", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const result = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  }, "next");

  assert.equal(result?.value, "| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |");
  assert.equal(result?.selectionStart, result?.value.lastIndexOf("|  |  |") + 2);
  assert.equal(result?.selectionEnd, result?.selectionStart);

  const quotedTable = "> | A | B |\n> | --- | --- |\n> | 1 | 2 |";
  const quoted = navigateMarkdownTableCell({
    value: quotedTable,
    selectionStart: quotedTable.indexOf("2"),
    selectionEnd: quotedTable.indexOf("2"),
  }, "next");

  assert.equal(quoted?.value, "> | A | B |\n> | --- | --- |\n> | 1 | 2 |\n> |  |  |");
  assert.equal(quoted?.selectionStart, quoted?.value.lastIndexOf("> |  |  |") + "> | ".length);
  assert.equal(quoted?.selectionEnd, quoted?.selectionStart);
});

test("navigateMarkdownTableCell pads uneven body rows before selecting missing cells", () => {
  const table = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |";
  const result = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2") + 1,
  }, "next");

  assert.equal(result?.value, "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |  |");
  assert.equal(result?.selectionStart, result?.value.lastIndexOf("|  |") + 2);
  assert.equal(result?.selectionEnd, result?.selectionStart);
});

test("navigateMarkdownTableCell ignores escaped pipes when locating the active column", () => {
  const table = "| A | B |\n| --- | --- |\n| x\\|y | z |";
  const cursor = table.indexOf("y");
  const result = navigateMarkdownTableCell({
    value: table,
    selectionStart: cursor,
    selectionEnd: cursor,
  }, "next");

  assert.equal(result?.value, table);
  assert.equal(result?.selectionStart, table.indexOf("z"));
  assert.equal(result?.selectionEnd, table.indexOf("z") + 1);
});

test("navigateMarkdownTableCell supports tables without outer pipes", () => {
  const table = "A | B\n--- | ---\n1 | 2";
  const next = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.indexOf("1"),
    selectionEnd: table.indexOf("1"),
  }, "next");

  assert.equal(next?.value, table);
  assert.equal(next?.selectionStart, table.indexOf("2"));
  assert.equal(next?.selectionEnd, table.indexOf("2") + 1);

  const previous = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.indexOf("1"),
    selectionEnd: table.indexOf("1"),
  }, "previous");

  assert.equal(previous?.selectionStart, table.indexOf("B"));
  assert.equal(previous?.selectionEnd, table.indexOf("B") + 1);
});

test("table editing preserves tables without outer pipes like Typora", () => {
  const table = "A | B | C\n--- | :---: | ---:\n1 | 2 | 3";

  const row = insertMarkdownTableRow({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  }, "below");
  assert.equal(row.value, "A | B | C\n--- | :---: | ---:\n1 | 2 | 3\n内容 | 内容 | 内容");
  assert.equal(row.selectionStart, row.value.lastIndexOf("\n内容 | 内容 | 内容") + "\n内容 | ".length);
  assert.equal(row.selectionEnd, row.selectionStart + "内容".length);

  const column = insertMarkdownTableColumn({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "right");
  assert.equal(column.value, "A | B | 新列 | C\n--- | :---: | --- | ---:\n1 | 2 | 内容 | 3");
  assert.equal(column.selectionStart, column.value.indexOf("新列"));
  assert.equal(column.selectionEnd, column.selectionStart + "新列".length);

  const aligned = alignMarkdownTable({
    value: table,
    selectionStart: table.indexOf("C"),
    selectionEnd: table.indexOf("C"),
  }, "left");
  assert.equal(aligned?.value, "A | B | C\n--- | :---: | :---\n1 | 2 | 3");

  const deletedColumn = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "column");
  assert.equal(deletedColumn?.value, "A | C\n--- | ---:\n1 | 3");
  assert.equal(deletedColumn?.selectionStart, deletedColumn?.value.indexOf("C"));
  assert.equal(deletedColumn?.selectionEnd, (deletedColumn?.value.indexOf("C") ?? 0) + 1);

  const next = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.lastIndexOf("3"),
    selectionEnd: table.lastIndexOf("3"),
  }, "next");
  assert.equal(next?.value, "A | B | C\n--- | :---: | ---:\n1 | 2 | 3\n |  | ");
  assert.equal(next?.selectionStart, next?.value.lastIndexOf(" |  | ") + 1);
  assert.equal(next?.selectionEnd, next?.selectionStart);
});

test("table editing commands preserve CRLF line endings like Typora", () => {
  const table = "| A | B | C |\r\n| --- | :---: | ---: |\r\n| 1 | 2 | 3 |\r\n| 4 | 5 | 6 |";

  const row = insertMarkdownTableRow({
    value: table,
    selectionStart: table.indexOf("5"),
    selectionEnd: table.indexOf("5"),
  }, "above");
  assert.equal(
    row.value,
    "| A | B | C |\r\n| --- | :---: | ---: |\r\n| 1 | 2 | 3 |\r\n| 内容 | 内容 | 内容 |\r\n| 4 | 5 | 6 |",
  );
  assert.equal(row.selectionStart, row.value.indexOf("内容", row.value.indexOf("内容") + 1));
  assert.equal(row.selectionEnd, row.selectionStart + "内容".length);
  assertOnlyCrlfLineBreaks(row.value);

  const column = insertMarkdownTableColumn({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "right");
  assert.equal(
    column.value,
    "| A | B | 新列 | C |\r\n| --- | :---: | --- | ---: |\r\n| 1 | 2 | 内容 | 3 |\r\n| 4 | 5 | 内容 | 6 |",
  );
  assert.equal(column.selectionStart, column.value.indexOf("新列"));
  assert.equal(column.selectionEnd, column.selectionStart + "新列".length);
  assertOnlyCrlfLineBreaks(column.value);

  const aligned = alignMarkdownTable({
    value: table,
    selectionStart: table.indexOf("C"),
    selectionEnd: table.indexOf("C"),
  }, "left");
  assert.equal(aligned?.value, "| A | B | C |\r\n| --- | :---: | :--- |\r\n| 1 | 2 | 3 |\r\n| 4 | 5 | 6 |");
  assertOnlyCrlfLineBreaks(aligned?.value ?? "");

  const deletedColumn = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "column");
  assert.equal(deletedColumn?.value, "| A | C |\r\n| --- | ---: |\r\n| 1 | 3 |\r\n| 4 | 6 |");
  assert.equal(deletedColumn?.selectionStart, deletedColumn?.value.indexOf("C"));
  assert.equal(deletedColumn?.selectionEnd, (deletedColumn?.value.indexOf("C") ?? 0) + 1);
  assertOnlyCrlfLineBreaks(deletedColumn?.value ?? "");
});

test("navigateMarkdownTableCell preserves CRLF when padding and appending rows", () => {
  const uneven = "| A | B | C |\r\n| --- | --- | --- |\r\n| 1 | 2 |\r\n| 3 | 4 | 5 |";
  const padded = navigateMarkdownTableCell({
    value: uneven,
    selectionStart: uneven.indexOf("2"),
    selectionEnd: uneven.indexOf("2") + 1,
  }, "next");
  assert.equal(padded?.value, "| A | B | C |\r\n| --- | --- | --- |\r\n| 1 | 2 |  |\r\n| 3 | 4 | 5 |");
  assert.equal(padded?.selectionStart, padded?.value.indexOf("|  |") + 2);
  assert.equal(padded?.selectionEnd, padded?.selectionStart);
  assertOnlyCrlfLineBreaks(padded?.value ?? "");

  const table = "| A | B |\r\n| --- | --- |\r\n| 1 | 2 |";
  const appended = navigateMarkdownTableCell({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  }, "next");
  assert.equal(appended?.value, "| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n|  |  |");
  assert.equal(appended?.selectionStart, appended?.value.lastIndexOf("|  |  |") + 2);
  assert.equal(appended?.selectionEnd, appended?.selectionStart);
  assertOnlyCrlfLineBreaks(appended?.value ?? "");
});

test("deleteMarkdownTablePart deletes the current table row", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";
  const result = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  }, "row");

  assert.equal(result?.value, "| A | B |\n| --- | --- |\n| 3 | 4 |");
  assert.equal(result?.selectionStart, result?.value.indexOf("4"));
  assert.equal(result?.selectionEnd, (result?.value.indexOf("4") ?? 0) + 1);
});

test("deleteMarkdownTablePart does not delete table header or separator rows", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";

  assert.equal(
    deleteMarkdownTablePart({
      value: table,
      selectionStart: table.indexOf("A"),
      selectionEnd: table.indexOf("A"),
    }, "row"),
    null,
  );
  assert.equal(
    deleteMarkdownTablePart({
      value: table,
      selectionStart: table.indexOf("---"),
      selectionEnd: table.indexOf("---"),
    }, "row"),
    null,
  );
});

test("deleteMarkdownTablePart deletes the current table column", () => {
  const table = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |";
  const result = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "column");

  assert.equal(result?.value, "| A | C |\n| --- | --- |\n| 1 | 3 |");
  assert.equal(result?.selectionStart, result?.value.indexOf("C"));
  assert.equal(result?.selectionEnd, (result?.value.indexOf("C") ?? 0) + 1);
});

test("moveMarkdownTableRow moves body rows without crossing the separator", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |";
  const up = moveMarkdownTableRow({
    value: table,
    selectionStart: table.indexOf("4"),
    selectionEnd: table.indexOf("4"),
  }, "up");

  assert.equal(up?.value, "| A | B |\n| --- | --- |\n| 3 | 4 |\n| 1 | 2 |\n| 5 | 6 |");
  assert.equal(up?.selectionStart, up?.value.indexOf("4"));
  assert.equal(up?.selectionEnd, (up?.value.indexOf("4") ?? 0) + 1);
  assert.equal(
    moveMarkdownTableRow({
      value: table,
      selectionStart: table.indexOf("2"),
      selectionEnd: table.indexOf("2"),
    }, "up"),
    null,
  );

  const down = moveMarkdownTableRow({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  }, "down");
  assert.equal(down?.value, "| A | B |\n| --- | --- |\n| 3 | 4 |\n| 1 | 2 |\n| 5 | 6 |");
  assert.equal(down?.selectionStart, down?.value.indexOf("2"));
  assert.equal(down?.selectionEnd, (down?.value.indexOf("2") ?? 0) + 1);
});

test("moveMarkdownTableRow moves selected row blocks and preserves CRLF", () => {
  const table = "| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n| 3 | 4 |\r\n| 5 | 6 |";
  const start = table.indexOf("| 3");
  const end = table.indexOf("| 5");
  const result = moveMarkdownTableRow({
    value: table,
    selectionStart: start,
    selectionEnd: end,
  }, "down");

  assert.equal(result?.value, "| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n| 5 | 6 |\r\n| 3 | 4 |");
  assert.equal(result?.selectionStart, result?.value.indexOf("3"));
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("moveMarkdownTableColumn moves table columns and keeps alignment rows", () => {
  const table = "| A | B | C |\n| --- | :---: | ---: |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |";
  const left = moveMarkdownTableColumn({
    value: table,
    selectionStart: table.indexOf("C"),
    selectionEnd: table.indexOf("C"),
  }, "left");

  assert.equal(left?.value, "| A | C | B |\n| --- | ---: | :---: |\n| 1 | 3 | 2 |\n| 4 | 6 | 5 |");
  assert.equal(left?.selectionStart, left?.value.indexOf("C"));
  assert.equal(left?.selectionEnd, (left?.value.indexOf("C") ?? 0) + 1);
  assert.equal(
    moveMarkdownTableColumn({
      value: table,
      selectionStart: table.indexOf("A"),
      selectionEnd: table.indexOf("A"),
    }, "left"),
    null,
  );

  const right = moveMarkdownTableColumn({
    value: table,
    selectionStart: table.indexOf("A"),
    selectionEnd: table.indexOf("A"),
  }, "right");
  assert.equal(right?.value, "| B | A | C |\n| :---: | --- | ---: |\n| 2 | 1 | 3 |\n| 5 | 4 | 6 |");
  assert.equal(right?.selectionStart, right?.value.indexOf("A"));
});

test("moveMarkdownTableColumn moves selected column blocks in quoted CRLF tables", () => {
  const table = "> | A | B | C | D |\r\n> | --- | --- | --- | --- |\r\n> | 1 | 2 | 3 | 4 |";
  const result = moveMarkdownTableColumn({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("C") + 1,
  }, "right");

  assert.equal(result?.value, "> | A | D | B | C |\r\n> | --- | --- | --- | --- |\r\n> | 1 | 4 | 2 | 3 |");
  assert.equal(result?.selectionStart, result?.value.indexOf("B"));
  assertOnlyCrlfLineBreaks(result?.value ?? "");
});

test("selectMarkdownTablePart selects table cell, row, column, and table like Typora", () => {
  const table = "Intro\n| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\nOutro";
  const cursor = table.indexOf("5");

  const cell = selectMarkdownTablePart({ value: table, selectionStart: cursor, selectionEnd: cursor }, "cell");
  assert.equal(table.slice(cell?.selectionStart, cell?.selectionEnd), "5");

  const row = selectMarkdownTablePart({ value: table, selectionStart: cursor, selectionEnd: cursor }, "row");
  assert.equal(table.slice(row?.selectionStart, row?.selectionEnd), "| 4 | 5 | 6 |");

  const column = selectMarkdownTablePart({ value: table, selectionStart: table.indexOf("B"), selectionEnd: table.indexOf("6") + 1 }, "column");
  assert.equal(column?.selectionStart, table.indexOf("B"));
  assert.equal(column?.selectionEnd, table.indexOf("6") + 1);

  const whole = selectMarkdownTablePart({ value: table, selectionStart: cursor, selectionEnd: cursor }, "table");
  assert.equal(
    table.slice(whole?.selectionStart, whole?.selectionEnd),
    "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |",
  );
});

test("selectMarkdownTablePart preserves quoted and CRLF table ranges", () => {
  const table = "> | A | B |\r\n> | --- | --- |\r\n> | 1 | 2 |\r\n> | 3 | 4 |";
  const cursor = table.indexOf("4");
  const row = selectMarkdownTablePart({ value: table, selectionStart: cursor, selectionEnd: cursor }, "row");
  assert.equal(table.slice(row?.selectionStart, row?.selectionEnd), "> | 3 | 4 |");

  const whole = selectMarkdownTablePart({ value: table, selectionStart: cursor, selectionEnd: cursor }, "table");
  assert.equal(whole?.selectionStart, 0);
  assert.equal(whole?.selectionEnd, table.length);
});

test("deleteMarkdownTable removes the current table and keeps surrounding text", () => {
  const source = "Intro\n| A | B |\n| --- | --- |\n| 1 | 2 |\nOutro";
  const result = deleteMarkdownTable({
    value: source,
    selectionStart: source.indexOf("B"),
    selectionEnd: source.indexOf("B"),
  });

  assert.deepEqual(result, {
    value: "Intro\nOutro",
    selectionStart: "Intro\n".length,
    selectionEnd: "Intro\n".length,
  });
});

test("deleteMarkdownTable preserves CRLF and ignores non-table pipes", () => {
  const source = "Intro | text\r\n| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\nOutro";
  const result = deleteMarkdownTable({
    value: source,
    selectionStart: source.indexOf("B"),
    selectionEnd: source.indexOf("B"),
  });

  assert.deepEqual(result, {
    value: "Intro | text\r\nOutro",
    selectionStart: "Intro | text\r\n".length,
    selectionEnd: "Intro | text\r\n".length,
  });
  assertOnlyCrlfLineBreaks(result?.value ?? "");
  assert.equal(
    deleteMarkdownTable({ value: source, selectionStart: source.indexOf("Intro"), selectionEnd: source.indexOf("Intro") }),
    null,
  );
});

test("table editing keeps adjacent pipe paragraphs outside the table", () => {
  const source = "Intro | text\n| A | B |\n| --- | --- |\n| 1 | 2 |";
  const result = deleteMarkdownTablePart({
    value: source,
    selectionStart: source.indexOf("B"),
    selectionEnd: source.indexOf("B"),
  }, "column");

  assert.equal(result?.value, "Intro | text\n| A |\n| --- |\n| 1 |");
  assert.equal(result?.selectionStart, result?.value.indexOf("A"));
  assert.equal(result?.selectionEnd, (result?.value.indexOf("A") ?? 0) + 1);
  assert.equal(
    deleteMarkdownTablePart({
      value: source,
      selectionStart: source.indexOf("Intro"),
      selectionEnd: source.indexOf("Intro"),
    }, "column"),
    null,
  );
});

test("table editing ignores four-space pipe code blocks like Typora", () => {
  const code = "paragraph\n    A | B\n    --- | ---\n    1 | 2";
  assert.equal(
    navigateMarkdownTableCell({
      value: code,
      selectionStart: code.indexOf("1"),
      selectionEnd: code.indexOf("1"),
    }, "next"),
    null,
  );
  assert.equal(
    deleteMarkdownTablePart({
      value: code,
      selectionStart: code.indexOf("B"),
      selectionEnd: code.indexOf("B"),
    }, "column"),
    null,
  );
  assert.equal(
    alignMarkdownTable({
      value: code,
      selectionStart: code.indexOf("B"),
      selectionEnd: code.indexOf("B"),
    }, "right"),
    null,
  );

  const quotedCode = "> paragraph\n>     A | B\n>     --- | ---\n>     1 | 2";
  assert.equal(
    navigateMarkdownTableCell({
      value: quotedCode,
      selectionStart: quotedCode.indexOf("1"),
      selectionEnd: quotedCode.indexOf("1"),
    }, "next"),
    null,
  );
});

test("deleteMarkdownTablePart pads uneven rows before deleting a column", () => {
  const table = "| A | B | C |\n| --- | --- | --- |\n| 1 | 2 |";
  const result = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "column");

  assert.equal(result?.value, "| A | C |\n| --- | --- |\n| 1 |  |");
  assert.equal(result?.selectionStart, result?.value.indexOf("C"));
  assert.equal(result?.selectionEnd, (result?.value.indexOf("C") ?? 0) + 1);
});

test("table editing respects escaped pipe characters", () => {
  assert.deepEqual(splitTableRow("| A\\|B | C |"), ["A\\|B", "C"]);

  const table = "| A\\|B | C |\n| --- | --- |\n| x\\|y | z |";
  const deleted = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("C"),
    selectionEnd: table.indexOf("C"),
  }, "column");

  assert.equal(deleted?.value, "| A\\|B |\n| --- |\n| x\\|y |");
  const aligned = alignMarkdownTable({
    value: deleted?.value ?? "",
    selectionStart: deleted?.value.indexOf("A\\|B") ?? 0,
    selectionEnd: deleted?.value.indexOf("A\\|B") ?? 0,
  }, "right");
  assert.equal(aligned?.value, "| A\\|B |\n| ---: |\n| x\\|y |");
});

test("table editing preserves blockquote prefixes like Typora", () => {
  const table = "> | A | B | C |\n> | --- | :---: | ---: |\n> | 1 | 2 | 3 |\n> | 4 | 5 | 6 |";

  const row = insertMarkdownTableRow({
    value: table,
    selectionStart: table.indexOf("5"),
    selectionEnd: table.indexOf("5"),
  }, "above");
  assert.equal(
    row.value,
    "> | A | B | C |\n> | --- | :---: | ---: |\n> | 1 | 2 | 3 |\n> | 内容 | 内容 | 内容 |\n> | 4 | 5 | 6 |",
  );
  const firstInsertedCell = row.value.indexOf("内容 | 内容");
  assert.equal(row.selectionStart, row.value.indexOf("内容", firstInsertedCell + 1));
  assert.equal(row.selectionEnd, row.selectionStart + "内容".length);

  const column = insertMarkdownTableColumn({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "right");
  assert.equal(
    column.value,
    "> | A | B | 新列 | C |\n> | --- | :---: | --- | ---: |\n> | 1 | 2 | 内容 | 3 |\n> | 4 | 5 | 内容 | 6 |",
  );
  assert.equal(column.selectionStart, column.value.indexOf("新列"));
  assert.equal(column.selectionEnd, column.selectionStart + "新列".length);

  const aligned = alignMarkdownTable({
    value: table,
    selectionStart: table.indexOf("C"),
    selectionEnd: table.indexOf("C"),
  }, "left");
  assert.equal(aligned?.value, "> | A | B | C |\n> | --- | :---: | :--- |\n> | 1 | 2 | 3 |\n> | 4 | 5 | 6 |");

  const deletedRow = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("2"),
    selectionEnd: table.indexOf("2"),
  }, "row");
  assert.equal(deletedRow?.value, "> | A | B | C |\n> | --- | :---: | ---: |\n> | 4 | 5 | 6 |");
  assert.equal(deletedRow?.selectionStart, deletedRow?.value.indexOf("5"));
  assert.equal(deletedRow?.selectionEnd, (deletedRow?.value.indexOf("5") ?? 0) + 1);

  const deletedColumn = deleteMarkdownTablePart({
    value: table,
    selectionStart: table.indexOf("B"),
    selectionEnd: table.indexOf("B"),
  }, "column");
  assert.equal(deletedColumn?.value, "> | A | C |\n> | --- | ---: |\n> | 1 | 3 |\n> | 4 | 6 |");
  assert.equal(deletedColumn?.selectionStart, deletedColumn?.value.indexOf("C"));
  assert.equal(deletedColumn?.selectionEnd, (deletedColumn?.value.indexOf("C") ?? 0) + 1);
});

test("setImageWidthInLine converts markdown image to sized html image", () => {
  const result = setImageWidthInLine(
    { value: "![logo](assets/logo.png)", selectionStart: 0, selectionEnd: 0 },
    "480",
  );

  assert.equal(result?.value, '<img src="assets/logo.png" alt="logo" width="480px">');
});

test("setImageWidthInLine preserves markdown image title", () => {
  const result = setImageWidthInLine(
    { value: '![logo](<assets/logo large.png> "Logo title")', selectionStart: 0, selectionEnd: 0 },
    "480",
  );

  assert.equal(result?.value, '<img src="assets/logo large.png" alt="logo" width="480px" title="Logo title">');
});

test("setImageWidthInLine preserves an unwrapped image path with spaces", () => {
  const result = setImageWidthInLine(
    { value: '![logo](assets/my image.png "Image title")', selectionStart: 0, selectionEnd: 0 },
    "480",
  );

  assert.equal(
    result?.value,
    '<img src="assets/my image.png" alt="logo" width="480px" title="Image title">',
  );
});

test("setImageWidthInLine handles parenthesized image destinations like Typora", () => {
  const source = "before ![logo](assets/a(b).png) after";
  const result = setImageWidthInLine(
    { value: source, selectionStart: source.indexOf("a(b)"), selectionEnd: source.indexOf("a(b)") },
    "60%",
  );

  assert.equal(result?.value, 'before <img src="assets/a(b).png" alt="logo" width="60%"> after');
  assert.equal(result?.selectionStart, "before ".length);
  assert.equal(result?.selectionEnd, 'before <img src="assets/a(b).png" alt="logo" width="60%">'.length);
});

test("setImageWidthInLine updates the image under the cursor when a line has multiple images", () => {
  const source = '![one](one.png) and ![two](<assets/two(a).png> (Two title))';
  const result = setImageWidthInLine(
    { value: source, selectionStart: source.indexOf("two(a)"), selectionEnd: source.indexOf("two(a)") },
    "320",
  );

  assert.equal(
    result?.value,
    '![one](one.png) and <img src="assets/two(a).png" alt="two" width="320px" title="Two title">',
  );
});

test("setImageWidthInLine updates existing html image width", () => {
  assert.equal(
    setImageWidthInLine(
      { value: '<img src="assets/logo.png" alt="logo">', selectionStart: 5, selectionEnd: 5 },
      "60%",
    )?.value,
    '<img src="assets/logo.png" alt="logo" width="60%">',
  );

  assert.equal(
    setImageWidthInLine(
      { value: '<img src="assets/logo.png" width="320px" alt="logo" />', selectionStart: 5, selectionEnd: 5 },
      "480",
    )?.value,
    '<img src="assets/logo.png" width="480px" alt="logo" />',
  );
});

test("setImageWidthInLine updates the html image under the cursor like Typora", () => {
  const source = '<img src="one.png" width="120px"> and <img src="two.png" alt="two">';
  const cursor = source.indexOf("two.png");
  const result = setImageWidthInLine(
    { value: source, selectionStart: cursor, selectionEnd: cursor },
    "320",
  );

  assert.equal(
    result?.value,
    '<img src="one.png" width="120px"> and <img src="two.png" alt="two" width="320px">',
  );
  assert.equal(result?.selectionStart, source.indexOf('<img src="two.png"'));
  assert.equal(
    result?.selectionEnd,
    '<img src="one.png" width="120px"> and <img src="two.png" alt="two" width="320px">'.length,
  );
});

test("setImageWidthInLine does not edit an earlier html image when the cursor is on a markdown image", () => {
  const source = '<img src="one.png"> and ![two](two.png)';
  const cursor = source.indexOf("two.png");
  const result = setImageWidthInLine(
    { value: source, selectionStart: cursor, selectionEnd: cursor },
    "50%",
  );

  assert.equal(result?.value, '<img src="one.png"> and <img src="two.png" alt="two" width="50%">');
});

test("setImageWidthInLine escapes generated html image attributes", () => {
  const result = setImageWidthInLine(
    { value: '![a "logo"](assets/a&b.png)', selectionStart: 0, selectionEnd: 0 },
    '480"',
  );

  assert.equal(result?.value, '<img src="assets/a&amp;b.png" alt="a &quot;logo&quot;" width="480&quot;">');
});

test("clearMarkdownFormatting removes styles whose markers are outside the selection", () => {
  const cases = [
    ["before **left middle right** after", "**", "**"],
    ["before *left middle right* after", "*", "*"],
    ["before ==left middle right== after", "==", "=="],
    ["before <u>left middle right</u> after", "<u>", "</u>"],
    ["before <strong>left middle right</strong> after", "<strong>", "</strong>"],
    ["before `left middle right` after", "`", "`"],
  ] as const;

  for (const [source, opening, closing] of cases) {
    const selectionStart = source.indexOf("middle");
    const result = clearMarkdownFormatting({
      value: source,
      selectionStart,
      selectionEnd: selectionStart + "middle".length,
    });
    const expected = `before ${opening}left${closing} middle ${opening}right${closing} after`;
    assert.deepEqual(result, {
      value: expected,
      selectionStart: expected.indexOf("middle"),
      selectionEnd: expected.indexOf("middle") + "middle".length,
    });
  }
});

test("clearMarkdownFormatting removes only the selected portion of an inline link", () => {
  const target = "https://example.com";
  const source = `before [left middle right](${target}) after`;
  const selectionStart = source.indexOf("middle");
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart,
    selectionEnd: selectionStart + "middle".length,
  });
  const expected = `before [left](${target}) middle [right](${target}) after`;

  assert.deepEqual(result, {
    value: expected,
    selectionStart: expected.indexOf("middle"),
    selectionEnd: expected.indexOf("middle") + "middle".length,
  });
});

test("clearMarkdownFormatting preserves unresolved reference syntax as literal text", () => {
  const source = "before [left middle right][missing] after";
  const selectionStart = source.indexOf("middle");
  assert.deepEqual(clearMarkdownFormatting({
    value: source,
    selectionStart,
    selectionEnd: selectionStart + "middle".length,
  }), {
    value: source,
    selectionStart,
    selectionEnd: selectionStart + "middle".length,
  });
});

test("clearMarkdownFormatting removes inline wrappers from selection", () => {
  const source = "before **bold** and [link](https://example.com)";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 7,
    selectionEnd: source.length,
  });

  assert.equal(result.value, "before bold and link");
  assert.equal(result.selectionStart, 7);
  assert.equal(result.selectionEnd, 20);
});

test("clearMarkdownFormatting removes multi-backtick code spans", () => {
  const source = "before ``npm `test` command``";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: "before ".length,
    selectionEnd: source.length,
  });

  assert.equal(result.value, "before npm `test` command");
  assert.equal(result.selectionEnd, "before npm `test` command".length);
});

test("clearMarkdownFormatting removes padded code span markers like Typora", () => {
  const source = "`` `cmd` `` and ``a`b``";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.equal(result.value, "`cmd` and a`b");
  assert.equal(result.selectionEnd, "`cmd` and a`b".length);
});

test("clearMarkdownFormatting removes inline math wrappers like Typora", () => {
  const source = "before $a^2 + b^2$ and \\(c+d\\)";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: "before ".length,
    selectionEnd: source.length,
  });

  assert.equal(result.value, "before a^2 + b^2 and c+d");
  assert.equal(result.selectionEnd, result.value.length);

  assert.deepEqual(
    clearMarkdownFormatting({
      value: "calc $a^2 + b^2$",
      selectionStart: "calc $a^".length,
      selectionEnd: "calc $a^".length,
    }),
    {
      value: "calc a^2 + b^2",
      selectionStart: "calc a^".length,
      selectionEnd: "calc a^".length,
    },
  );
});

test("clearMarkdownFormatting removes reference and automatic link wrappers", () => {
  const source = "![Logo][logo] [docs][d] <https://example.com>";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.equal(result.value, "Logo docs https://example.com");
  assert.equal(result.selectionEnd, "Logo docs https://example.com".length);
});

test("clearMarkdownFormatting keeps custom and local autolink text like Typora", () => {
  const source = "<obsidian://open?vault=docs> <file:///C:/docs/a.md> <C:/docs/a.md> <javascript:alert(1)>";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.equal(
    result.value,
    "obsidian://open?vault=docs file:///C:/docs/a.md C:/docs/a.md <javascript:alert(1)>",
  );
  assert.equal(result.selectionEnd, result.value.length);
});

test("clearMarkdownFormatting removes inline HTML wrappers like Typora", () => {
  const source = '<strong>Bold</strong> <a href="https://example.com">Docs</a><br><code>x</code> <kbd>Ctrl</kbd> <samp>ok</samp> <var>n</var> <ins>new</ins> <span style="font-weight: 700"><em>plain</em></span> <font color="red">old</font> <!-- note --> <https://example.com>';
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.equal(result.value, "Bold Docs x Ctrl ok n new plain old note https://example.com");
  assert.equal(result.selectionStart, 0);
  assert.equal(result.selectionEnd, result.value.length);
});

test("clearMarkdownFormatting removes complex link wrappers like Typora", () => {
  const source = "**[API [v2]](<https://example.com/a(b)> \"Docs\")** and ![Logo [dark]][logo-ref]";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.equal(result.value, "API [v2] and Logo [dark]");
  assert.equal(result.selectionEnd, "API [v2] and Logo [dark]".length);
});

test("clearMarkdownFormatting removes one cross-line formatting range structurally", () => {
  const source = [
    "foo_bar_baz and **bold",
    "text** and ==mark",
    "text== plus `code",
    "span` and <u>HTML",
    "span</u>",
    "$$",
    "x_1 + y_2",
    "$$",
    "after",
  ].join("\r\n");
  const expected = [
    "foo_bar_baz and bold",
    "text and mark",
    "text plus code span and HTML",
    "span",
    "x_1 + y_2",
    "after",
  ].join("\r\n");
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.deepEqual(result, {
    value: expected,
    selectionStart: 0,
    selectionEnd: expected.length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("clearMarkdownFormatting removes block markers from full-line selections", () => {
  const source = "- **bold**\n> [link](https://example.com)\n1. [x] Task\n: Definition\n[^1]: detail";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.equal(result.value, "bold\nlink\nTask\nDefinition\ndetail");
  assert.equal(result.selectionStart, 0);
  assert.equal(result.selectionEnd, "bold\nlink\nTask\nDefinition\ndetail".length);

  const nested = "> # **Title**\n> - [x] ~~Task~~\n> : Definition";
  assert.equal(
    clearMarkdownFormatting({
      value: nested,
      selectionStart: 0,
      selectionEnd: nested.length,
    }).value,
    "Title\nTask\nDefinition",
  );
});

test("clearMarkdownFormatting preserves CRLF while removing block markers", () => {
  const source = "> # **Title**\r\n> - [x] ~~Task~~\r\n[^1]: [detail](https://example.com)";
  const result = clearMarkdownFormatting({
    value: source,
    selectionStart: 0,
    selectionEnd: source.length,
  });

  assert.deepEqual(result, {
    value: "Title\r\nTask\r\ndetail",
    selectionStart: 0,
    selectionEnd: "Title\r\nTask\r\ndetail".length,
  });
  assertOnlyCrlfLineBreaks(result.value);

  const currentLine = clearMarkdownFormatting({
    value: "before\r\n> ## **Title**\r\nafter",
    selectionStart: "before\r\n> ## **Ti".length,
    selectionEnd: "before\r\n> ## **Ti".length,
  });
  assert.deepEqual(currentLine, {
    value: "before\r\nTitle\r\nafter",
    selectionStart: "before\r\nTi".length,
    selectionEnd: "before\r\nTi".length,
  });
  assertOnlyCrlfLineBreaks(currentLine.value);
});

test("clearMarkdownFormatting removes block marker from current line", () => {
  const result = clearMarkdownFormatting({
    value: "## **Title**",
    selectionStart: 4,
    selectionEnd: 4,
  });

  assert.equal(result.value, "Title");
  assert.equal(
    clearMarkdownFormatting({
      value: "### Title ###",
      selectionStart: 4,
      selectionEnd: 4,
    }).value,
    "Title",
  );
  assert.equal(
    clearMarkdownFormatting({
      value: "# C#",
      selectionStart: 2,
      selectionEnd: 2,
    }).value,
    "C#",
  );
  assert.equal(
    clearMarkdownFormatting({
      value: "> # **Title**",
      selectionStart: "> # ".length,
      selectionEnd: "> # ".length,
    }).value,
    "Title",
  );
  assert.equal(
    clearMarkdownFormatting({
      value: ": **Definition**",
      selectionStart: ": ".length,
      selectionEnd: ": ".length,
    }).value,
    "Definition",
  );
  assert.equal(
    clearMarkdownFormatting({
      value: "[^1]: **detail**",
      selectionStart: "[^1]: ".length,
      selectionEnd: "[^1]: ".length,
    }).value,
    "detail",
  );
  assert.equal(
    clearMarkdownFormatting({
      value: "paragraph\n    - **code**",
      selectionStart: "paragraph\n    - ".length,
      selectionEnd: "paragraph\n    - ".length,
    }).value,
    "paragraph\n    - code",
  );
});

test("clearMarkdownFormatting keeps the cursor with visible text like Typora", () => {
  assert.deepEqual(
    clearMarkdownFormatting({
      value: "## **Title**",
      selectionStart: "## **Ti".length,
      selectionEnd: "## **Ti".length,
    }),
    {
      value: "Title",
      selectionStart: "Ti".length,
      selectionEnd: "Ti".length,
    },
  );

  assert.deepEqual(
    clearMarkdownFormatting({
      value: "> [Docs](https://example.com)",
      selectionStart: "> [Do".length,
      selectionEnd: "> [Do".length,
    }),
    {
      value: "Docs",
      selectionStart: "Do".length,
      selectionEnd: "Do".length,
    },
  );

  assert.deepEqual(
    clearMarkdownFormatting({
      value: "- `` `cmd` ``",
      selectionStart: "- `` `c".length,
      selectionEnd: "- `` `c".length,
    }),
    {
      value: "`cmd`",
      selectionStart: "`c".length,
      selectionEnd: "`c".length,
    },
  );
});

test("clearMarkdownFormatting converts Setext heading to plain text", () => {
  const result = clearMarkdownFormatting({
    value: "**Title**\n---\nbody",
    selectionStart: 2,
    selectionEnd: 2,
  });

  assert.deepEqual(result, {
    value: "Title\nbody",
    selectionStart: 0,
    selectionEnd: 0,
  });

  assert.deepEqual(
    clearMarkdownFormatting({
      value: "> **Title**\n> ---\nbody",
      selectionStart: "> **Ti".length,
      selectionEnd: "> **Ti".length,
    }),
    { value: "Title\nbody", selectionStart: "Ti".length, selectionEnd: "Ti".length },
  );
});

test("clearMarkdownFormatting preserves CRLF when converting Setext headings", () => {
  const result = clearMarkdownFormatting({
    value: "**Title**\r\n---\r\nbody",
    selectionStart: "**Ti".length,
    selectionEnd: "**Ti".length,
  });

  assert.deepEqual(result, {
    value: "Title\r\nbody",
    selectionStart: "Ti".length,
    selectionEnd: "Ti".length,
  });
  assertOnlyCrlfLineBreaks(result.value);
});

test("clearMarkdownFormatting keeps the cursor in Setext heading text like Typora", () => {
  assert.deepEqual(
    clearMarkdownFormatting({
      value: "**Title**\n---\nbody",
      selectionStart: "**Ti".length,
      selectionEnd: "**Ti".length,
    }),
    {
      value: "Title\nbody",
      selectionStart: "Ti".length,
      selectionEnd: "Ti".length,
    },
  );

  assert.deepEqual(
    clearMarkdownFormatting({
      value: "> [Docs](https://example.com)\n> ---\nbody",
      selectionStart: "> [Do".length,
      selectionEnd: "> [Do".length,
    }),
    {
      value: "Docs\nbody",
      selectionStart: "Do".length,
      selectionEnd: "Do".length,
    },
  );
});

test("toggleMarkdownInlineStyle formats every Setext heading line without changing its underline", () => {
  const source = "First line\nSecond line\n---";
  const secondStart = source.indexOf("Second");
  assert.deepEqual(toggleMarkdownInlineStyle({
    value: source,
    selectionStart: secondStart,
    selectionEnd: secondStart + "Second".length,
  }, "**", "**"), {
    value: "First line\n**Second** line\n---",
    selectionStart: secondStart + 2,
    selectionEnd: secondStart + 2 + "Second".length,
  });

  const across = toggleMarkdownInlineStyle({
    value: source,
    selectionStart: 0,
    selectionEnd: source.indexOf(" line\n---"),
  }, "*", "*");
  assert.equal(across?.value, "*First line*\n*Second* line\n---");
  assert.equal(across?.value.endsWith("\n---"), true);
});

test("insertMarkdownSoftBreak preserves container prefixes when replacing selections", () => {
  const cases = [
    ["- alpha beta", "beta", "- alpha   \n  "],
    ["- [ ] task beta", "beta", "- [ ] task   \n      "],
    ["> quote beta", "beta", "> quote   \n> "],
    ["> - item beta", "beta", "> - item   \n>   "],
  ] as const;

  for (const [source, selected, expected] of cases) {
    const start = source.indexOf(selected);
    const result = insertMarkdownSoftBreak({
      value: source,
      selectionStart: start,
      selectionEnd: start + selected.length,
    });
    assert.deepEqual(result, {
      value: expected,
      selectionStart: expected.length,
      selectionEnd: expected.length,
    });
  }
});

test("Front Matter editing supports the YAML explicit end marker with CRLF", () => {
  const source = "---\r\ntitle: x\r\n\r\n...\r\nAfter";
  const emptyLine = source.indexOf("\r\n\r\n") + 2;
  const exited = editMarkdownFrontMatterOnEnter({
    value: source,
    selectionStart: emptyLine,
    selectionEnd: emptyLine,
  });

  assert.deepEqual(exited, {
    value: "---\r\ntitle: x\r\n\r\n...\r\n\r\nAfter",
    selectionStart: source.indexOf("After"),
    selectionEnd: source.indexOf("After"),
  });

  const contentStart = "---\r\n".length;
  assert.deepEqual(unwrapMarkdownBlockOnBackspace({
    value: "---\r\ntitle: x\r\n...\r\nAfter",
    selectionStart: contentStart,
    selectionEnd: contentStart,
  }), {
    value: "title: x\r\nAfter",
    selectionStart: 0,
    selectionEnd: 0,
  });
});

test("tagged dollar math supports Enter and protects raw editing semantics", () => {
  assert.deepEqual(
    continueMarkdownBlock({ value: "$$ {chapter 1}", selectionStart: 14, selectionEnd: 14 }),
    { value: "$$ {chapter 1}\n\n$$", selectionStart: 15, selectionEnd: 15 },
  );
  assert.deepEqual(
    continueMarkdownBlock({ value: "> $$ {{quote}}", selectionStart: 14, selectionEnd: 14 }),
    { value: "> $$ {{quote}}\n> \n> $$", selectionStart: 17, selectionEnd: 17 },
  );
  const adjacentTagged = "$$ {one}\n$$ {two}";
  assert.equal(
    continueMarkdownBlock({ value: adjacentTagged, selectionStart: 8, selectionEnd: 8 }),
    null,
  );
  const adjacentInvalid = "$$ {one}\n$$ {two} ";
  assert.deepEqual(
    continueMarkdownBlock({ value: adjacentInvalid, selectionStart: 8, selectionEnd: 8 }),
    { value: "$$ {one}\n\n$$\n$$ {two} ", selectionStart: 9, selectionEnd: 9 },
  );
  const adjacentClosing = "$$ {one}\n$$";
  assert.equal(
    continueMarkdownBlock({ value: adjacentClosing, selectionStart: 8, selectionEnd: 8 }),
    null,
  );
  for (const source of [
    "$$ {one}\n   $$ {two}",
    ">$$ {one}\n>   $$ {two}",
    ">   $$ {one}\n>$$ {two}",
    ">$$ {one}\r\n>  $$ {two}",
    "> $$ {one}\n> \n> $$ {two}",
    "> $$ {one}\r\n> \r\n> $$ {two}",
    " > $$ {one}\n> $$ {two}",
  ]) {
    const cursor = source.search(/\r?\n/);
    assert.equal(
      continueMarkdownBlock({ value: source, selectionStart: cursor, selectionEnd: cursor }),
      null,
      source,
    );
  }
  const overIndentedClosing = "$$ {one}\r\n    $$ {two}";
  const overIndentedCursor = overIndentedClosing.indexOf("\r\n");
  const overIndentedResult = continueMarkdownBlock({
    value: overIndentedClosing,
    selectionStart: overIndentedCursor,
    selectionEnd: overIndentedCursor,
  });
  assert.ok(overIndentedResult);
  assertOnlyCrlfLineBreaks(overIndentedResult.value);
  const tabIndentedClosing = "$$ {one}\n\t$$ {two}";
  const tabIndentedCursor = tabIndentedClosing.indexOf("\n");
  assert.ok(continueMarkdownBlock({
    value: tabIndentedClosing,
    selectionStart: tabIndentedCursor,
    selectionEnd: tabIndentedCursor,
  }));
  const raw = "$$ {tag}\n- literal";
  assert.equal(continueMarkdownBlock({ value: raw, selectionStart: raw.length, selectionEnd: raw.length }), null);
  assert.equal(unwrapMarkdownBlockOnBackspace({
    value: "$$ {tag}\n# literal",
    selectionStart: "$$ {tag}\n# ".length,
    selectionEnd: "$$ {tag}\n# ".length,
  }), null);
});

test("tagged dollar math Enter preserves CRLF and rejects invalid openings", () => {
  const source = "Before\r\n$$ {tag}";
  const result = continueMarkdownBlock({
    value: source,
    selectionStart: source.length,
    selectionEnd: source.length,
  });
  assert.deepEqual(result, {
    value: "Before\r\n$$ {tag}\r\n\r\n$$",
    selectionStart: "Before\r\n$$ {tag}\r\n".length,
    selectionEnd: "Before\r\n$$ {tag}\r\n".length,
  });
  assertOnlyCrlfLineBreaks(result?.value ?? "");

  for (const opening of ["$$ {}", "$$ {tag", "$$ {tag} ", "$$ {tag} trailing"]) {
    assert.equal(continueMarkdownBlock({
      value: opening,
      selectionStart: opening.length,
      selectionEnd: opening.length,
    }), null, opening);
  }
});

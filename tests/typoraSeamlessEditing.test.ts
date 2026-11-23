import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { convertRichHtmlToMarkdown } from "../src/utils/editorCommands";

const editorSource = readFileSync(resolve("src/components/ContinuousMarkdownEditor.vue"), "utf8");
const markdownPreviewSource = readFileSync(resolve("src/components/MarkdownPreview.vue"), "utf8");
const richMarkdownBlockSource = readFileSync(resolve("src/components/RichMarkdownBlock.vue"), "utf8");
const tableEditorSource = readFileSync(resolve("src/components/VisualTableEditor.vue"), "utf8");
const tableCellEditorSource = readFileSync(resolve("src/components/TableCellInlineEditor.vue"), "utf8");
const globalStyleSource = readFileSync(resolve("src/assets/styles/global.css"), "utf8");

test("normal Markdown blocks remain rendered while they are edited inline", () => {
  assert.match(editorSource, /new EditorView\(\{/);
  assert.match(editorSource, /addInlinePreviewDecorations/);
  assert.match(editorSource, /Decoration\.replace\(\{\}\)\.range/);
  assert.doesNotMatch(editorSource, /<textarea/);
});

test("标题使用整行底部分隔线并保留内部行内样式", () => {
  assert.match(editorSource, /:deep\(\.cm-heading span:not\(\.cm-rendered-strikethrough\):not\(\.cm-rendered-link\)\)\s*\{\s*text-decoration:\s*none;/);
  assert.doesNotMatch(editorSource, /:deep\(\.cm-heading span:not\(\[class\*="cm-rendered-"\]\)\)/);
  assert.match(editorSource, /:deep\(\.cm-rendered-link\)\s*\{[\s\S]*?text-decoration:\s*underline;/);
  assert.match(editorSource, /:deep\(\.cm-rendered-strikethrough\)\s*\{\s*text-decoration:\s*line-through;/);
  assert.match(editorSource, /:deep\(\.cm-heading \.cm-rendered-inline-code\)\s*\{\s*font-size:\s*inherit;/);
  assert.match(editorSource, /:deep\(\.cm-heading\)\s*\{[\s\S]*?--heading-block-padding-bottom:\s*1rem;[\s\S]*?--heading-rule-text-gap:\s*0\.125em;[\s\S]*?--heading-rule-bottom-offset:\s*calc\(var\(--heading-block-padding-bottom\) - var\(--heading-rule-text-gap\)\);[\s\S]*?padding:\s*1rem 0 var\(--heading-block-padding-bottom\);/);
  assert.match(editorSource, /:deep\(\.cm-heading\.cm-setext-heading-line\)\s*\{[\s\S]*?padding-top:\s*0;[\s\S]*?padding-bottom:\s*0;/);
  assert.match(editorSource, /:deep\(\.cm-heading\.cm-setext-heading-first\)\s*\{\s*padding-top:\s*1rem;/);
  assert.match(editorSource, /:deep\(\.cm-heading\.cm-setext-heading-last\)\s*\{\s*--heading-block-padding-bottom:\s*1rem;[\s\S]*?padding-bottom:\s*var\(--heading-block-padding-bottom\);/);
  assert.match(editorSource, /:deep\(\.cm-heading \+ \.cm-heading-gap \+ \.cm-heading\),\s*:deep\(\.cm-setext-marker \+ \.cm-heading-gap \+ \.cm-heading\)\s*\{[\s\S]*?padding-top:\s*0;/);
  assert.doesNotMatch(editorSource, /:deep\(\.cm-heading-gap \+ \.cm-heading\)\s*\{/);
  assert.match(editorSource, /:deep\(\.cm-heading-1:not\(\.cm-setext-heading-line\)\)::after,\s*:deep\(\.cm-heading-2:not\(\.cm-setext-heading-line\)\)::after,\s*:deep\(\.cm-setext-heading-last\)::after\s*\{[\s\S]*?inset-inline:\s*0;[\s\S]*?inset-inline-start:\s*var\(--container-content-start, 0\);[\s\S]*?bottom:\s*var\(--heading-rule-bottom-offset\);[\s\S]*?border-bottom:\s*1px solid var\(--markdown-heading-rule\);[\s\S]*?pointer-events:\s*none;/);
  assert.match(editorSource, /styleVariables\.push\(`--container-content-start:calc\(\$\{contentOffsets\.join\(" \+ "\)\}\)`\);/);

  for (const [source, selector] of [
    [markdownPreviewSource, ".markdown-inner"],
    [richMarkdownBlockSource, ".rich-markdown-block"],
  ] as const) {
    assert.match(source, new RegExp(`${selector.replace(".", "\\.")} :deep\\(h1\\)\\s*\\{[\\s\\S]*?border-bottom:\\s*1px solid var\\(--markdown-heading-rule\\);`));
    assert.match(source, new RegExp(`${selector.replace(".", "\\.")} :deep\\(h2\\)\\s*\\{[\\s\\S]*?border-bottom:\\s*1px solid var\\(--markdown-heading-rule\\);`));
  }
});

test("标题分隔线比表格边框更浅且使用独立主题颜色", () => {
  assert.match(globalStyleSource, /:root\s*\{[\s\S]*?--border:\s*#d9dde3;[\s\S]*?--heading-rule:\s*#e8ebef;/);
  assert.match(globalStyleSource, /:root\[data-theme="dark"\]\s*\{[\s\S]*?--border:\s*#2b3038;[\s\S]*?--heading-rule:\s*#242930;/);
  assert.match(editorSource, /:deep\(\.cm-table\)\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--markdown-border\);/);
  assert.doesNotMatch(editorSource, /cm-heading-[12][\s\S]{0,160}border-bottom:\s*1px solid var\(--markdown-border\);/);
});

test("引用块使用更浅的面板背景", () => {
  const lightBackground = /background:\s*color-mix\(in srgb, var\(--panel-subtle\) 40%, var\(--panel\)\);/;
  assert.match(editorSource, /:deep\(\.cm-blockquote\)[\s\S]*?background-color:\s*color-mix\(in srgb, var\(--panel-subtle\) 40%, var\(--panel\)\);/);
  assert.match(editorSource, /:deep\(\.cm-special-preview-html blockquote\)[\s\S]*?background:\s*color-mix\(in srgb, var\(--panel-subtle\) 40%, var\(--panel\)\);/);
  assert.match(markdownPreviewSource, lightBackground);
  assert.match(richMarkdownBlockSource, lightBackground);
});

test("正文块使用 Typora 风格间距且无序列表符号按层级展示", () => {
  assert.match(editorSource, /:deep\(\.cm-line\.cm-block-gap:not\(\.cm-active-markdown-line\)\)\s*\{[\s\S]*?height:\s*0\.8em;[\s\S]*?padding-top:\s*0;[\s\S]*?padding-bottom:\s*0;/);
  assert.match(editorSource, /:deep\(\.cm-line\.cm-block-gap\.cm-block-gap-extra:not\(\.cm-active-markdown-line\)\)\s*\{[\s\S]*?height:\s*1px;/);
  assert.match(editorSource, /:deep\(\.cm-rendered-bullet-marker\)\s*\{\s*color:\s*transparent;\s*font-size:\s*0;\s*line-height:\s*0;\s*vertical-align:\s*middle;/);
  assert.match(editorSource, /:deep\(\.cm-bullet-list\),\s*:deep\(\.cm-ordered-list\),\s*:deep\(\.cm-task-list\)\s*\{\s*--heading-block-padding-bottom:\s*0\.5rem;[\s\S]*?padding-bottom:\s*var\(--heading-block-padding-bottom\);/);
  assert.match(editorSource, /:deep\(\.cm-list-block-margin-before\)\s*\{[\s\S]*?margin-top:\s*0\.8em;/);
  assert.match(editorSource, /function getMarkdownListContext[\s\S]*?node\.name === "BulletList"[\s\S]*?node\.name === "OrderedList"/);
  assert.match(editorSource, /:deep\(\.cm-rendered-bullet-marker\)\s*\{[\s\S]*?width:\s*var\(--list-marker-width\);[\s\S]*?padding-inline-start:\s*var\(--list-marker-offset\);/);
  assert.match(editorSource, /:deep\(\.cm-rendered-ordered-marker\)\s*\{[\s\S]*?width:\s*auto;[\s\S]*?min-width:\s*var\(--list-marker-width\);/);
  assert.doesNotMatch(editorSource, /cm-rendered-task-order|cm-rendered-task-marker\.has-order/);
  assert.match(markdownPreviewSource, /\.markdown-inner :deep\(ul > li\)::marker\s*\{[\s\S]*?font-size:\s*1\.2em;[\s\S]*?font-weight:\s*650;/);
  assert.match(richMarkdownBlockSource, /\.rich-markdown-block :deep\(ul > li\)::marker\s*\{[\s\S]*?font-size:\s*1\.2em;[\s\S]*?font-weight:\s*650;/);
  for (const [source, selector] of [
    [markdownPreviewSource, ".markdown-inner"],
    [richMarkdownBlockSource, ".rich-markdown-block"],
  ] as const) {
    const escaped = selector.replace(".", "\\.");
    assert.match(source, new RegExp(`${escaped} :deep\\(ul\\)\\s*\\{[\\s\\S]*?list-style-type:\\s*disc;`));
    assert.match(source, new RegExp(`${escaped} :deep\\(ul ul\\)\\s*\\{[\\s\\S]*?list-style-type:\\s*circle;`));
    assert.match(source, new RegExp(`${escaped} :deep\\(ul ul ul\\)\\s*\\{[\\s\\S]*?list-style-type:\\s*square;`));
  }
  assert.match(markdownPreviewSource, /\.markdown-inner :deep\(li\)\s*\{\s*margin:\s*0;/);
  assert.match(richMarkdownBlockSource, /\.rich-markdown-block :deep\(li\)\s*\{\s*margin:\s*0;/);
  assert.match(markdownPreviewSource, /\.markdown-inner :deep\(table\)\s*\{[\s\S]*?margin:\s*0\.8em 0;/);
  assert.match(tableEditorSource, /\.visual-table-editor\s*\{[\s\S]*?padding:\s*1\.2em 0;/);
});

test("editor preferences control default copy, indentation, emoji and code language behavior", () => {
  assert.match(editorSource, /props\.settings\.copyMarkdownAsPlainText/);
  assert.match(editorSource, /indentSelection\([\s\S]*props\.settings\.indentSize/);
  assert.match(editorSource, /props\.settings\.emojiAutocomplete === "escape"/);
  assert.match(editorSource, /formatMarkdownCodeBlock\([\s\S]*props\.settings\.defaultCodeLanguage/);
});

test("tables remain tables and expose direct cell and row-column controls", () => {
  assert.match(editorSource, /import VisualTableEditor/);
  assert.match(editorSource, /new VisualTableBlockWidget\(block, documentSource, spacing\)/);
  assert.match(editorSource, /function runActiveTableCommand[\s\S]*activeTableEditor\.runCommand\(command, payload\)/);
  assert.match(tableEditorSource, /import TableCellInlineEditor/);
  assert.equal((tableEditorSource.match(/<TableCellInlineEditor/g) ?? []).length, 2);
  assert.match(tableEditorSource, /<TableCellInlineEditor\s+v-if="isActiveCell\(0, column\)"/);
  assert.match(tableEditorSource, /<TableCellInlineEditor\s+v-if="isActiveCell\(rowIndex \+ 1, column\)"/);
  assert.equal((tableEditorSource.match(/class="cell-rendered"/g) ?? []).length, 2);
  assert.equal(
    (tableEditorSource.match(/:class="\{ 'is-editing-placeholder': isActiveCell\(/g) ?? []).length,
    2,
  );
  assert.equal(
    (tableEditorSource.match(/:aria-hidden="isActiveCell\(/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(tableEditorSource, /<textarea/);
  assert.match(tableCellEditorSource, /EditorView\.decorations\.compute\(/);
  assert.match(tableCellEditorSource, /emit\("history", event\.inputType === "historyUndo" \? "undo" : "redo"\)/);
  assert.equal(
    (tableEditorSource.match(/@history="emit\('command', \$event\)"/g) ?? []).length,
    2,
  );
  assert.match(tableEditorSource, /insertVisualTableRow|insertVisualTableColumn/);
  assert.match(tableEditorSource, /alignVisualTableColumn/);
  assert.match(tableEditorSource, /handleCellPaste/);
  assert.match(tableEditorSource, /v-if="focusedWithin" class="table-tools"/);
  assert.match(tableEditorSource, /class="table-more-menu"/);
  assert.doesNotMatch(tableEditorSource, /class="append-row"/);
  assert.match(tableCellEditorSource, /background:\s*transparent;/);
  assert.match(tableEditorSource, /handleCellMouseDown[\s\S]*shouldOpenPreviewLink\(event\)/);
  assert.doesNotMatch(tableEditorSource, /@mousedown\.capture="activateTable"/);
  assert.match(tableEditorSource, /@mousedown="handleTableOuterSurfaceMouseDown"/);
  assert.match(tableEditorSource, /target\?\.closest\("\.table-cell-inline-editor"\)\) return/);
  assert.match(
    tableEditorSource,
    /event\.preventDefault\(\);\s*const pointerPlacement = selectCell\(row, column, event\);\s*if \(event\.button === 0 && pointerPlacement\) \{\s*beginInactiveCellPointerSelection\(row, column, pointerPlacement\);/,
  );
  assert.match(tableEditorSource, /function getCellPointerPlacement[\s\S]*?getRenderedCellSourceOffset/);
  assert.match(tableEditorSource, /void focusCell\(row, column, false, false, pointerPlacement\)/);
  assert.match(tableEditorSource, /document\.addEventListener\("mousedown", handleDocumentMouseDown\)/);
  assert.match(tableEditorSource, /event\.key === "Escape"[\s\S]*?focusedWithin\.value = false/);
  assert.match(editorSource, /onOpenLink: \(href: string\) => emit\("openLinkHref", href\)/);
});

test("links and images reveal Markdown source before navigation like Typora", () => {
  assert.match(editorSource, /class RenderedMarkdownBlockWidget extends WidgetType/);
  assert.match(editorSource, /revealPreviewBlock\(view, this\.from\)/);
  assert.match(editorSource, /shouldOpenPreviewLink\(event\)/);
  assert.match(editorSource, /emit\("openLinkHref", anchor\.getAttribute\("href"\) \?\? ""\)/);
});

test("rich edits preserve untouched inline Markdown source", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const referenceLink = {
    nodeType: 1,
    tagName: "A",
    childNodes: [],
    hasAttribute: (name: string) => name === "data-marko-inline-markdown",
    getAttribute: (name: string) => name === "data-marko-inline-markdown" ? "[guide][docs]" : "",
  };

  try {
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [referenceLink] } };
      }
    };
    assert.equal(convertRichHtmlToMarkdown('<a href="https://example.com">guide</a>'), "[guide][docs]");
  } finally {
    globals.DOMParser = previousParser;
  }
});

test("special rendered blocks use modifier navigation for local anchors", () => {
  assert.match(editorSource, /shouldOpenPreviewLink\(event\)/);
  assert.match(editorSource, /anchor\.getAttribute\("href"\)/);
  assert.match(editorSource, /emit\("openLinkHref"/);
});

test("rich HTML edits are converted back to Markdown", () => {
  assert.equal(
    convertRichHtmlToMarkdown("<p>Hello <strong>Marko</strong> and <em>Typora</em>.</p>"),
    "Hello **Marko** and *Typora*.",
  );
});

test("rich task lists keep nested checkbox states after another inline element is edited", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previousParser = globals.DOMParser;
  const text = (value: string) => ({ nodeType: 3, textContent: value });
  const checkbox = {
    nodeType: 1,
    tagName: "INPUT",
    checked: true,
    childNodes: [],
    getAttribute: (name: string) => (name === "type" ? "checkbox" : ""),
    hasAttribute: () => false,
  };
  const paragraph = {
    nodeType: 1,
    tagName: "P",
    childNodes: [checkbox, text(" Done")],
  };
  const item = {
    nodeType: 1,
    tagName: "LI",
    childNodes: [paragraph],
    querySelector: () => checkbox,
  };
  const list = {
    nodeType: 1,
    tagName: "UL",
    childNodes: [item],
    children: [item],
  };

  try {
    globals.DOMParser = class {
      parseFromString() {
        return { body: { childNodes: [list] } };
      }
    };
    assert.equal(convertRichHtmlToMarkdown("<ul><li><p><input type='checkbox' checked> Done</p></li></ul>"), "- [x] Done");
  } finally {
    globals.DOMParser = previousParser;
  }
});

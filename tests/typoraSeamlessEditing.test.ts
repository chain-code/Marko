import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { convertRichHtmlToMarkdown } from "../src/utils/editorCommands";

const editorSource = readFileSync(resolve("src/components/ContinuousMarkdownEditor.vue"), "utf8");
const markdownPreviewSource = readFileSync(resolve("src/components/MarkdownPreview.vue"), "utf8");
const richMarkdownBlockSource = readFileSync(resolve("src/components/RichMarkdownBlock.vue"), "utf8");
const tableEditorSource = readFileSync(resolve("src/components/VisualTableEditor.vue"), "utf8");
const globalStyleSource = readFileSync(resolve("src/assets/styles/global.css"), "utf8");

test("normal Markdown blocks remain rendered while they are edited inline", () => {
  assert.match(editorSource, /new EditorView\(\{/);
  assert.match(editorSource, /addInlinePreviewDecorations/);
  assert.match(editorSource, /Decoration\.replace\(\{\}\)\.range/);
  assert.doesNotMatch(editorSource, /<textarea/);
});

test("标题使用整行底部分隔线而不是文字下划线", () => {
  assert.match(editorSource, /:deep\(\.cm-heading span\)\s*\{\s*text-decoration:\s*none;/);
  assert.match(editorSource, /:deep\(\.cm-heading-1\)::after,\s*:deep\(\.cm-heading-2\)::after\s*\{[\s\S]*?inset-inline:\s*0;[\s\S]*?bottom:\s*4px;[\s\S]*?border-bottom:\s*1px solid var\(--heading-rule\);[\s\S]*?pointer-events:\s*none;/);
  assert.match(editorSource, /:deep\(\.cm-heading-1\)::after\s*\{\s*bottom:\s*5px;/);

  for (const [source, selector] of [
    [markdownPreviewSource, ".markdown-inner"],
    [richMarkdownBlockSource, ".rich-markdown-block"],
  ] as const) {
    assert.match(source, new RegExp(`${selector.replace(".", "\\.")} :deep\\(h1\\)\\s*\\{[\\s\\S]*?border-bottom:\\s*1px solid var\\(--heading-rule\\);`));
    assert.match(source, new RegExp(`${selector.replace(".", "\\.")} :deep\\(h2\\)\\s*\\{[\\s\\S]*?border-bottom:\\s*1px solid var\\(--heading-rule\\);`));
  }
});

test("标题分隔线比表格边框更浅且使用独立主题颜色", () => {
  assert.match(globalStyleSource, /:root\s*\{[\s\S]*?--border:\s*#d9dde3;[\s\S]*?--heading-rule:\s*#e8ebef;/);
  assert.match(globalStyleSource, /:root\[data-theme="dark"\]\s*\{[\s\S]*?--border:\s*#2b3038;[\s\S]*?--heading-rule:\s*#242930;/);
  assert.match(editorSource, /:deep\(\.cm-table\)\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--border\);/);
  assert.doesNotMatch(editorSource, /cm-heading-[12][\s\S]{0,160}border-bottom:\s*1px solid var\(--border\);/);
});

test("引用块使用更浅的面板背景", () => {
  const lightBackground = /background:\s*color-mix\(in srgb, var\(--panel-subtle\) 40%, var\(--panel\)\);/;
  assert.match(editorSource, /:deep\(\.cm-blockquote\)[\s\S]*?background:\s*color-mix\(in srgb, var\(--panel-subtle\) 40%, var\(--panel\)\);/);
  assert.match(markdownPreviewSource, lightBackground);
  assert.match(richMarkdownBlockSource, lightBackground);
});

test("正文块使用 Typora 风格间距且无序列表圆点更醒目", () => {
  assert.match(editorSource, /:deep\(\.cm-line\.cm-block-gap:not\(\.cm-active-markdown-line\)\)\s*\{[\s\S]*?height:\s*0\.35em;[\s\S]*?padding-top:\s*0;[\s\S]*?padding-bottom:\s*0;/);
  assert.match(editorSource, /:deep\(\.cm-line\.cm-block-gap\.cm-block-gap-extra:not\(\.cm-active-markdown-line\)\)\s*\{[\s\S]*?height:\s*1px;/);
  assert.match(editorSource, /:deep\(\.cm-bullet-list \.cm-rendered-list-marker\)\s*\{[\s\S]*?font-size:\s*1\.2em;[\s\S]*?font-weight:\s*650;/);
  assert.match(markdownPreviewSource, /\.markdown-inner :deep\(ul > li\)::marker\s*\{[\s\S]*?font-size:\s*1\.2em;[\s\S]*?font-weight:\s*650;/);
  assert.match(richMarkdownBlockSource, /\.rich-markdown-block :deep\(ul > li\)::marker\s*\{[\s\S]*?font-size:\s*1\.2em;[\s\S]*?font-weight:\s*650;/);
  assert.match(markdownPreviewSource, /\.markdown-inner :deep\(li\)\s*\{\s*margin:\s*0;/);
  assert.match(richMarkdownBlockSource, /\.rich-markdown-block :deep\(li\)\s*\{\s*margin:\s*0;/);
  assert.match(markdownPreviewSource, /\.markdown-inner :deep\(table\)\s*\{[\s\S]*?margin:\s*0\.8em 0;/);
  assert.match(tableEditorSource, /\.visual-table-editor\s*\{[\s\S]*?padding:\s*0\.35rem 0;/);
});

test("editor preferences control default copy, indentation, emoji and code language behavior", () => {
  assert.match(editorSource, /props\.settings\.copyMarkdownAsPlainText/);
  assert.match(editorSource, /indentSelection\([\s\S]*props\.settings\.indentSize/);
  assert.match(editorSource, /props\.settings\.emojiAutocomplete === "escape"/);
  assert.match(editorSource, /formatMarkdownCodeBlock\([\s\S]*props\.settings\.defaultCodeLanguage/);
});

test("tables remain tables and expose direct cell and row-column controls", () => {
  assert.match(editorSource, /import VisualTableEditor/);
  assert.match(editorSource, /new VisualTableBlockWidget\(block, documentSource\)/);
  assert.match(editorSource, /function runActiveTableCommand[\s\S]*activeTableEditor\.runCommand\(command, payload\)/);
  assert.match(tableEditorSource, /<table>[\s\S]*<textarea[\s\S]*handleCellKeydown/);
  assert.match(tableEditorSource, /v-show="isActiveCell\(0, column\)"/);
  assert.match(tableEditorSource, /v-show="!isActiveCell\(rowIndex \+ 1, column\)"/);
  assert.doesNotMatch(tableEditorSource, /v-if="isActiveCell/);
  assert.match(tableEditorSource, /insertVisualTableRow|insertVisualTableColumn/);
  assert.match(tableEditorSource, /alignVisualTableColumn/);
  assert.match(tableEditorSource, /handleCellPaste/);
  assert.match(tableEditorSource, /v-if="focusedWithin" class="table-tools"/);
  assert.match(tableEditorSource, /class="table-more-menu"/);
  assert.doesNotMatch(tableEditorSource, /class="append-row"/);
  assert.match(tableEditorSource, /background: transparent;[\s\S]*box-shadow: none;/);
  assert.match(tableEditorSource, /handleCellMouseDown[\s\S]*shouldOpenPreviewLink\(event\)/);
  assert.match(tableEditorSource, /@mousedown\.capture="activateTable"/);
  assert.match(tableEditorSource, /target\?\.closest\("textarea"\)\) return/);
  assert.match(tableEditorSource, /event\.preventDefault\(\);\s*selectCell\(row, column\)/);
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

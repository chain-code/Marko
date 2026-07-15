import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");
const toolbarSource = readFileSync(resolve("src/components/AppToolbar.vue"), "utf8");
const continuousEditorSource = readFileSync(resolve("src/components/ContinuousMarkdownEditor.vue"), "utf8");
const sidebarSource = readFileSync(resolve("src/components/AppSidebar.vue"), "utf8");

test("AppToolbar keeps a Typora-style menu-only top bar", () => {
  assert.match(toolbarSource, /<header[^>]*class="app-toolbar"[\s\S]*<nav class="menu-bar"/);
  assert.doesNotMatch(toolbarSource, /quick-status|toolbar-spacer|dirty-dot|quick-toggle|zoom-label/);
  assert.match(
    toolbarSource,
    /label: "文件"[\s\S]*label: "编辑"[\s\S]*label: "段落"[\s\S]*label: "格式"[\s\S]*label: "视图"[\s\S]*label: "主题"[\s\S]*label: "帮助"/,
  );
});

test("App uses a Typora-style single editor surface without an extra document strip", () => {
  assert.doesNotMatch(appSource, /class="document-strip"/);
  assert.doesNotMatch(appSource, /\.document-strip|\.document-title|\.document-meta/);
  assert.match(appSource, /<section class="editor-pane">\s*<div class="editor-scroll">/);
  assert.match(appSource, /\.editor-pane \{[\s\S]*grid-template-rows: minmax\(0, 1fr\) auto;/);
});

test("Status bar exposes Typora-style word count entry points", () => {
  assert.match(appSource, /@show-word-count="openWordCountPanel"/);
  assert.match(appSource, /function openWordCountPanel\(\) \{[\s\S]*?wordCountVisible\.value = true;/);
  assert.match(appSource, /class="status-item"[\s\S]*?title="打开字数统计"[\s\S]*?@click="openWordCountPanel"/);
  assert.match(appSource, /class="status-icon"[\s\S]*?@click="patchSettings\(\{ sourceMode: !settings\.sourceMode \}\)"/);
});

test("source mode temporarily hides the sidebar and restores the stored sidebar preference", () => {
  assert.match(appSource, /:class="\{ 'no-sidebar': !sidebarVisible \|\| effectiveSettings\.focusMode \|\| effectiveSettings\.sourceMode \}"/);
  assert.match(appSource, /v-if="sidebarVisible && !effectiveSettings\.focusMode && !effectiveSettings\.sourceMode"/);
  assert.doesNotMatch(appSource, /watch\([^)]*sourceMode[\s\S]*sidebarVisible\.value = false/);
});

test("Continuous editor uses one CodeMirror document instead of framed block editors", () => {
  assert.match(appSource, /<ContinuousMarkdownEditor/);
  assert.match(continuousEditorSource, /new EditorView\(\{/);
  assert.match(continuousEditorSource, /EditorState\.create\(\{/);
  assert.doesNotMatch(continuousEditorSource, /<textarea/);
});
test("AppSidebar keeps the Typora-style three-mode left rail", () => {
  assert.match(sidebarSource, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(sidebarSource, /\{ key: "files", label: "文件"/);
  assert.match(sidebarSource, /\{ key: "outline", label: "大纲"/);
  assert.match(sidebarSource, /\{ key: "search", label: "搜索"/);
  assert.match(sidebarSource, /\.file-panel \{\s*grid-template-rows: minmax\(0, 1fr\) 30px;/);
});

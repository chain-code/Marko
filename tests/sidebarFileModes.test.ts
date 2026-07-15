import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sidebarSource = readFileSync(resolve("src/components/AppSidebar.vue"), "utf8");
const toolbarSource = readFileSync(resolve("src/components/AppToolbar.vue"), "utf8");
const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("View menu switches Typora-style file tree, file list, and outline panels", () => {
  assert.match(toolbarSource, /filePanelMode: FilePanelMode;/);
  assert.match(toolbarSource, /showFileView: \[mode: FilePanelMode\];/);
  assert.match(toolbarSource, /action\("文件树",\s*ListTree,\s*\(\) => emit\("showFileView", "tree"\),\s*"Ctrl\+Shift\+3"[\s\S]*props\.filePanelMode === "tree"\)/);
  assert.match(toolbarSource, /action\("文档列表",\s*List,\s*\(\) => emit\("showFileView", "list"\),\s*"Ctrl\+Shift\+2"[\s\S]*props\.filePanelMode === "list"\)/);
  assert.match(toolbarSource, /action\("大纲",\s*FileText,\s*\(\) => emit\("showSidebarTab", "outline"\),\s*"Ctrl\+Shift\+1"[\s\S]*props\.sidebarActiveTab === "outline"\)/);
  assert.match(appSource, /@show-file-view="showFileView"/);
  assert.match(appSource, /function showFileView\(mode: FilePanelMode\) \{\s*filePanelMode\.value = mode;\s*showSidebarTab\("files"\);\s*\}/);
});

test("AppSidebar file tab renders tree or list and switches them from the bottom toolbar", () => {
  assert.match(appSource, /:file-mode="filePanelMode"/);
  assert.match(sidebarSource, /fileMode: FilePanelMode;/);
  assert.match(sidebarSource, /v-if="fileMode === 'tree' && tree\.length > 0"/);
  assert.match(sidebarSource, /v-else-if="fileMode === 'list' && fileListEntries\.length > 0"/);
  assert.match(sidebarSource, /@click="\$emit\('openFile', file\.path\)"/);
  assert.match(sidebarSource, /createFileContextTarget\(file, 'list'\)/);
  assert.match(sidebarSource, /formatFileListPath\(file\.path\)/);
  assert.match(sidebarSource, /"update:fileMode": \[value: FilePanelMode\];/);
  assert.match(sidebarSource, /@click="\$emit\('update:fileMode', 'list'\)"/);
  assert.match(sidebarSource, /@click="\$emit\('update:fileMode', 'tree'\)"/);
  assert.match(sidebarSource, /<footer class="file-toolbar" aria-label="文件操作">/);
});

test("Locate current file always returns to the file tree view", () => {
  assert.match(appSource, /async function locateCurrentFileInTree\(\) \{\s*filePanelMode\.value = "tree";/);
  assert.match(appSource, /showSidebarTab\("files"\);\s*await nextTick\(\);\s*await sidebarRef\.value\?\.scrollCurrentFileIntoView\(\);/);
});

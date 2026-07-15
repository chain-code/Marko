import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("saving refreshes the current workspace file tree when the file belongs to it", () => {
  assert.match(appSource, /isPathInsideTreeRoot\(path, rootPath\.value\)/);
  assert.match(appSource, /await refreshWorkspaceFileTreeForPath\(currentFilePath\.value\);/);
  assert.match(appSource, /await refreshWorkspaceFileTreeForPath\(path\);/);
  assert.match(appSource, /const entries = await listMarkdownFolder\(workspacePath\);/);
  assert.match(appSource, /workspaceVersion === workspaceRequestId[\s\S]*requestId === workspaceRefreshRequestId/);
  assert.match(appSource, /fileTree\.value = entries;/);
});

test("save as prefers the current workspace when the document has no folder yet", () => {
  assert.match(appSource, /const content = prepareMarkdownForSave\(/);
  assert.match(appSource, /const path = await saveMarkdownAs\(content, getSaveDefaultDir\(\)\);/);
  assert.match(appSource, /return dirname\(currentFilePath\.value\) \|\| rootPath\.value;/);
});

test("exports use the current document file name as the default output name", () => {
  assert.match(appSource, /buildExportFileName\(currentFileName\.value, format\)/);
  assert.match(appSource, /link\.download = buildExportFileName\(currentFileName\.value, "html"\);/);
});

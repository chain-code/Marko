import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("native dropped folders are loaded as the workspace folder", () => {
  assert.match(appSource, /const folderPath = await findDroppedFolderPath\(paths\);/);
  assert.match(appSource, /await loadWorkspaceFolder\(folderPath, "已加载拖入的文件夹"\);/);
  assert.match(appSource, /showSidebarTab\("files"\);/);
});

test("findDroppedFolderPath asks the desktop backend before treating a path as a folder", () => {
  assert.match(appSource, /async function findDroppedFolderPath\(paths: string\[]\): Promise<string \| null>/);
  assert.match(appSource, /if \(await isDirectoryPath\(path\)\) \{/);
  assert.match(appSource, /return path;/);
});

test("native dropped markdown files can seed the workspace from their parent folder", () => {
  assert.match(appSource, /const opened = await openFileByPath\(markdownPath\);/);
  assert.match(appSource, /if \(opened && !rootPath\.value\) \{/);
  assert.match(appSource, /await loadWorkspaceFolder\(dirname\(markdownPath\), "已将拖入文件所在文件夹作为工作区打开"\);/);
});

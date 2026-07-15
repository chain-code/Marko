import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sidebarSource = readFileSync(resolve("src/components/AppSidebar.vue"), "utf8");
const treeNodeSource = readFileSync(resolve("src/components/FileTreeNode.vue"), "utf8");
const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("AppSidebar exposes a method for scrolling the current file into view", () => {
  assert.match(sidebarSource, /ref="sidebarRootRef"/);
  assert.match(sidebarSource, /scrollCurrentFileIntoView/);
  assert.match(sidebarSource, /querySelector<HTMLElement>\("\.tree-row\[aria-current='page'\], \.file-row\.active"\)/);
});

test("FileTreeNode marks the current file row for sidebar locating", () => {
  assert.match(treeNodeSource, /:aria-current="isCurrent \? 'page' : undefined"/);
  assert.match(treeNodeSource, /rowRef\.value\?\.scrollIntoView\(\{ block: "nearest" \}\)/);
});

test("sidebar file rows expose Typora-style context menu actions", () => {
  assert.match(sidebarSource, /nativeFileActions: boolean;/);
  assert.match(sidebarSource, /@context-file="openFileContextMenu"/);
  assert.match(sidebarSource, /@click="\$emit\('newWorkspaceFile', rootPath \|\| ''\)"/);
  assert.match(sidebarSource, /@click="runMoreAction\('newFolder'\)"/);
  assert.match(sidebarSource, /fileContextAction: \[action: SidebarFileContextAction, target: SidebarFileContextTarget\];/);
  assert.match(sidebarSource, /newWorkspaceFile: \[folderPath: string\];/);
  assert.match(sidebarSource, /newWorkspaceFolder: \[folderPath: string\];/);
  assert.match(sidebarSource, /buildSidebarFileContextMenuItems\(target, props\.nativeFileActions\)/);
  assert.match(treeNodeSource, /contextFile: \[target: SidebarFileContextTarget, event: MouseEvent \| KeyboardEvent\];/);
  assert.match(treeNodeSource, /@contextmenu\.prevent\.stop="handleContextMenu"/);
  assert.match(treeNodeSource, /role="treeitem"/);
  assert.match(treeNodeSource, /:aria-expanded="entry\.isDir \? open : undefined"/);
  assert.match(treeNodeSource, /@keydown="handleKeydown"/);
  assert.match(appSource, /@file-context-action="runSidebarFileContextAction"/);
  assert.match(appSource, /@new-workspace-file="createMarkdownFileInFolder"/);
  assert.match(appSource, /@new-workspace-folder="createFolderInWorkspace"/);
  assert.match(appSource, /createMarkdownFile\(folderPath, normalized\.fileName\)/);
  assert.match(appSource, /createFolder\(parentPath, normalized\.fileName\)/);
  assert.match(appSource, /case "refreshFolder":/);
  assert.match(appSource, /refreshWorkspaceFileTreeForPath\(path\)/);
  assert.match(appSource, /case "copyName":/);
  assert.match(appSource, /copyTextToClipboard\(target\.name \|\| basename\(target\.path\), "已复制名称", "没有可复制的名称"\)/);
  assert.match(appSource, /case "copyMarkdownLink":/);
  assert.match(appSource, /buildMarkdownFileLink\(\{/);
  assert.match(appSource, /currentPath: currentFilePath\.value \|\| undefined/);
  assert.match(appSource, /case "copyRelativePath":/);
  assert.match(appSource, /resolveDocumentRelativePath\(\{/);
  assert.match(appSource, /case "deletePath":/);
  assert.match(appSource, /requestConfirmation\(\{\s*title: `将\$\{kind\}移到回收站`/);
  assert.match(appSource, /message: `确定要将\$\{kind\}“\$\{target\.name\}”移到回收站吗？可以稍后从回收站恢复。`/);
  assert.match(appSource, /trashPath\(target\.path\)/);
  assert.match(appSource, /removeRecentPath\(target\.path, target\.isDir\)/);
  assert.match(appSource, /case "removeRecent":/);
  assert.match(appSource, /showToast\("已从最近文件移除", "success"\)/);
});

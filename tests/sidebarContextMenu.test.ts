import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSidebarFileContextMenuItems,
  clampSidebarContextMenuPosition,
} from "../src/utils/sidebarContextMenu";
import type { SidebarFileContextTarget } from "../src/types";

const fileTarget: SidebarFileContextTarget = {
  path: "C:/docs/note.md",
  name: "note.md",
  isDir: false,
  source: "tree",
};

const folderTarget: SidebarFileContextTarget = {
  path: "C:/docs",
  name: "docs",
  isDir: true,
  source: "tree",
};

const recentTarget: SidebarFileContextTarget = {
  ...fileTarget,
  source: "recent",
};

test("buildSidebarFileContextMenuItems exposes file actions used by Typora-style sidebars", () => {
  assert.deepEqual(
    buildSidebarFileContextMenuItems(fileTarget, true).map((item) => item.action),
    [
      "openFile",
      "renameFile",
      "copyName",
      "copyMarkdownLink",
      "copyRelativePath",
      "copyPath",
      "revealFile",
      "openContainingFolder",
      "deletePath",
    ],
  );
});

test("buildSidebarFileContextMenuItems exposes folder workspace and explorer actions", () => {
  assert.deepEqual(
    buildSidebarFileContextMenuItems(folderTarget, true).map((item) => item.action),
    [
      "newFileInFolder",
      "newFolderInFolder",
      "refreshFolder",
      "openAsWorkspace",
      "copyName",
      "copyRelativePath",
      "copyPath",
      "openFolderPath",
      "deletePath",
    ],
  );
});

test("buildSidebarFileContextMenuItems hides native-only actions outside the desktop runtime", () => {
  assert.deepEqual(
    buildSidebarFileContextMenuItems(fileTarget, false).map((item) => item.action),
    ["openFile", "copyName", "copyMarkdownLink", "copyRelativePath", "copyPath"],
  );
  assert.deepEqual(
    buildSidebarFileContextMenuItems(folderTarget, false).map((item) => item.action),
    ["copyName", "copyRelativePath", "copyPath"],
  );
});

test("buildSidebarFileContextMenuItems can remove files from the recent list without deleting them", () => {
  assert.deepEqual(
    buildSidebarFileContextMenuItems(recentTarget, false).map((item) => item.action),
    ["openFile", "copyName", "copyMarkdownLink", "copyRelativePath", "copyPath", "removeRecent"],
  );
});

test("clampSidebarContextMenuPosition keeps the menu inside the viewport", () => {
  assert.deepEqual(clampSidebarContextMenuPosition(390, 295, 400, 300, 5), { x: 174, y: 120 });
  assert.deepEqual(clampSidebarContextMenuPosition(-20, -10, 400, 300, 1), { x: 8, y: 8 });
});

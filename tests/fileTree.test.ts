import test from "node:test";
import assert from "node:assert/strict";
import {
  fileTreeEntryContainsPath,
  isPathInsideTreeRoot,
  isSameTreePath,
  normalizeTreePath,
} from "../src/utils/fileTree";
import type { FileEntry } from "../src/types";

const tree: FileEntry = {
  name: "docs",
  path: "C:\\workspace\\docs",
  isDir: true,
  children: [
    {
      name: "guide",
      path: "C:\\workspace\\docs\\guide",
      isDir: true,
      children: [
        {
          name: "intro.md",
          path: "C:\\workspace\\docs\\guide\\intro.md",
          isDir: false,
          children: [],
        },
      ],
    },
    {
      name: "notes.md",
      path: "C:\\workspace\\docs\\notes.md",
      isDir: false,
      children: [],
    },
  ],
};

test("normalizeTreePath compares Windows and slash paths consistently", () => {
  assert.equal(normalizeTreePath("C:\\workspace\\docs\\"), "C:/workspace/docs");
  assert.equal(isSameTreePath("C:\\workspace\\docs\\notes.md", "C:/workspace/docs/notes.md"), true);
  assert.equal(isSameTreePath("", "C:/workspace/docs/notes.md"), false);
});

test("fileTreeEntryContainsPath finds the current file inside nested folders", () => {
  assert.equal(fileTreeEntryContainsPath(tree, "C:/workspace/docs/guide/intro.md"), true);
  assert.equal(fileTreeEntryContainsPath(tree.children[0], "C:/workspace/docs/guide/intro.md"), true);
  assert.equal(fileTreeEntryContainsPath(tree.children[1], "C:/workspace/docs/guide/intro.md"), false);
});

test("isPathInsideTreeRoot only matches files inside the workspace root", () => {
  assert.equal(isPathInsideTreeRoot("C:/workspace/docs/guide/intro.md", "C:\\workspace\\docs"), true);
  assert.equal(isPathInsideTreeRoot("C:/workspace/docs", "C:/workspace/docs"), true);
  assert.equal(isPathInsideTreeRoot("C:/workspace/docs-old/intro.md", "C:/workspace/docs"), false);
  assert.equal(isPathInsideTreeRoot("", "C:/workspace/docs"), false);
});

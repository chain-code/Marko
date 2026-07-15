import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  clampEditorContextMenuPosition,
  editorContextMenuItems,
} from "../src/utils/editorContextMenu";

const editorSource = readFileSync(resolve("src/components/ContinuousMarkdownEditor.vue"), "utf8");

test("editorContextMenuItems expose Typora-style editor actions", () => {
  assert.deepEqual(
    editorContextMenuItems.map((item) => (item.type === "separator" ? "separator" : item.command)),
    [
      "undo",
      "redo",
      "separator",
      "cut",
      "copy",
      "paste",
      "pastePlainText",
      "separator",
      "copyMarkdown",
      "copyHtml",
      "copyPlainText",
      "separator",
      "selectAll",
      "link",
      "openLink",
      "separator",
      "bold",
      "italic",
      "inlineCode",
      "clearFormat",
    ],
  );
});

test("clampEditorContextMenuPosition keeps the menu inside the viewport", () => {
  assert.deepEqual(clampEditorContextMenuPosition(390, 295, 400, 300, 5), { x: 156, y: 120 });
  assert.deepEqual(clampEditorContextMenuPosition(-20, -10, 400, 300, 1), { x: 8, y: 8 });
});

test("Continuous editor wires the custom context menu to existing editor commands", () => {
  assert.match(editorSource, /contextmenu: openEditorContextMenu/);
  assert.match(editorSource, /editorContextMenuItems/);
  assert.match(editorSource, /runEditorContextMenuCommand\(item\.command\)/);
  assert.match(editorSource, /runCommand\(command\)/);
  assert.match(editorSource, /clampEditorContextMenuPosition/);
});

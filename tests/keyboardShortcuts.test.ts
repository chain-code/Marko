import test from "node:test";
import assert from "node:assert/strict";
import { resolveEditorShortcut } from "../src/utils/keyboardShortcuts";

test("resolveEditorShortcut maps Typora heading shortcuts", () => {
  assert.deepEqual(resolveEditorShortcut({ key: "0", ctrlKey: true }), {
    type: "command",
    command: "paragraph",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "1", ctrlKey: true }), {
    type: "command",
    command: "heading1",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "6", metaKey: true }), {
    type: "command",
    command: "heading6",
  });
});

test("resolveEditorShortcut maps editing and file shortcuts", () => {
  assert.deepEqual(resolveEditorShortcut({ key: "B", ctrlKey: true }), {
    type: "command",
    command: "bold",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "z", ctrlKey: true }), {
    type: "command",
    command: "undo",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "y", ctrlKey: true }), {
    type: "command",
    command: "redo",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "z", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "redo",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "a", ctrlKey: true }), {
    type: "command",
    command: "selectAll",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "s", ctrlKey: true, shiftKey: true }), {
    type: "saveAs",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "k", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "codeBlock",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "o", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "openLink",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "m", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "mathBlock",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "d", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "deleteWord",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "Backspace", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "deleteLine",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "Delete", metaKey: true, shiftKey: true }), {
    type: "command",
    command: "deleteLine",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "c", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "copyMarkdown",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "v", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "pastePlainText",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "l", ctrlKey: true }), {
    type: "command",
    command: "selectLine",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "d", ctrlKey: true }), {
    type: "command",
    command: "selectWord",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "e", ctrlKey: true }), {
    type: "command",
    command: "selectStyleScope",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "Home", ctrlKey: true }), {
    type: "command",
    command: "goToDocumentStart",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "End", metaKey: true }), {
    type: "command",
    command: "goToDocumentEnd",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "]", ctrlKey: true }), {
    type: "command",
    command: "indent",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "[", ctrlKey: true }), {
    type: "command",
    command: "outdent",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "ArrowUp", altKey: true }), {
    type: "command",
    command: "moveLineUp",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "ArrowRight", altKey: true }), {
    type: "command",
    command: "indent",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "ArrowLeft", altKey: true }), {
    type: "command",
    command: "outdent",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "i", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "image",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "=", ctrlKey: true }), {
    type: "command",
    command: "increaseHeading",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "-", metaKey: true }), {
    type: "command",
    command: "decreaseHeading",
  });
});

test("resolveEditorShortcut maps Typora block and inline formatting shortcuts", () => {
  assert.deepEqual(resolveEditorShortcut({ key: "q", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "blockquote",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "[", metaKey: true, shiftKey: true }), {
    type: "command",
    command: "orderedList",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "{", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "orderedList",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "]", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "bulletList",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "}", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "bulletList",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "x", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "taskList",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "/", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "comment",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "?", metaKey: true, shiftKey: true }), {
    type: "command",
    command: "comment",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "`", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "inlineCode",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "~", ctrlKey: true, shiftKey: true }), {
    type: "command",
    command: "inlineCode",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "5", altKey: true, shiftKey: true }), {
    type: "command",
    command: "strike",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "%", altKey: true, shiftKey: true }), {
    type: "command",
    command: "strike",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "\\", ctrlKey: true }), {
    type: "command",
    command: "clearFormat",
  });
  assert.deepEqual(resolveEditorShortcut({ key: "t", ctrlKey: true }), {
    type: "command",
    command: "table",
  });
});

test("resolveEditorShortcut ignores non-editor modifier combinations", () => {
  assert.equal(resolveEditorShortcut({ key: "1" }), null);
  assert.equal(resolveEditorShortcut({ key: "1", ctrlKey: true, altKey: true }), null);
  assert.equal(resolveEditorShortcut({ key: "y", ctrlKey: true, shiftKey: true }), null);
});

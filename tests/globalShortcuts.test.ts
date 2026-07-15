import test from "node:test";
import assert from "node:assert/strict";
import { resolveGlobalShortcut } from "../src/utils/globalShortcuts";

test("resolveGlobalShortcut maps file and search shortcuts", () => {
  assert.equal(resolveGlobalShortcut({ key: "n", ctrlKey: true }), "newFile");
  assert.equal(resolveGlobalShortcut({ key: "o", metaKey: true }), "openFile");
  assert.equal(resolveGlobalShortcut({ key: "w", ctrlKey: true }), "closeFile");
  assert.equal(resolveGlobalShortcut({ key: "r", metaKey: true }), "reloadFile");
  assert.equal(resolveGlobalShortcut({ key: "p", ctrlKey: true }), "quickOpen");
  assert.equal(resolveGlobalShortcut({ key: "p", altKey: true, shiftKey: true }), "print");
  assert.equal(resolveGlobalShortcut({ key: "f", ctrlKey: true }), "find");
  assert.equal(resolveGlobalShortcut({ key: "F3" }), "findNext");
  assert.equal(resolveGlobalShortcut({ key: "F3", shiftKey: true }), "findPrevious");
  assert.equal(resolveGlobalShortcut({ key: "g", ctrlKey: true }), "findNext");
  assert.equal(resolveGlobalShortcut({ key: "g", metaKey: true, shiftKey: true }), "findPrevious");
  assert.equal(resolveGlobalShortcut({ key: "f", ctrlKey: true, shiftKey: true }), "globalSearch");
  assert.equal(resolveGlobalShortcut({ key: "h", ctrlKey: true }), "replace");
  assert.equal(resolveGlobalShortcut({ key: "j", ctrlKey: true }), "jumpToSelection");
});

test("resolveGlobalShortcut maps view shortcuts", () => {
  assert.equal(resolveGlobalShortcut({ key: "=", ctrlKey: true }), null);
  assert.equal(resolveGlobalShortcut({ key: "+", ctrlKey: true }), null);
  assert.equal(resolveGlobalShortcut({ key: "=", ctrlKey: true, shiftKey: true }), "zoomIn");
  assert.equal(resolveGlobalShortcut({ key: "-", ctrlKey: true }), null);
  assert.equal(resolveGlobalShortcut({ key: "-", metaKey: true, shiftKey: true }), "zoomOut");
  assert.equal(resolveGlobalShortcut({ key: "0", ctrlKey: true }), null);
  assert.equal(resolveGlobalShortcut({ key: "0", ctrlKey: true, shiftKey: true }), "resetZoom");
  assert.equal(resolveGlobalShortcut({ key: "l", ctrlKey: true, shiftKey: true }), "toggleSidebar");
  assert.equal(resolveGlobalShortcut({ key: "1", ctrlKey: true, shiftKey: true }), "showOutline");
  assert.equal(resolveGlobalShortcut({ key: "2", ctrlKey: true, shiftKey: true }), "showFileList");
  assert.equal(resolveGlobalShortcut({ key: "3", ctrlKey: true, shiftKey: true }), "showFileTree");
  assert.equal(resolveGlobalShortcut({ key: "/", ctrlKey: true }), "toggleSource");
  assert.equal(resolveGlobalShortcut({ key: ",", ctrlKey: true }), "settings");
  assert.equal(resolveGlobalShortcut({ key: "F8" }), "toggleFocus");
  assert.equal(resolveGlobalShortcut({ key: "F9" }), "toggleTypewriter");
  assert.equal(resolveGlobalShortcut({ key: "F11" }), "fullscreen");
  assert.equal(resolveGlobalShortcut({ key: "F12" }), "openDevtools");
  assert.equal(resolveGlobalShortcut({ key: "i", ctrlKey: true, shiftKey: true }), "openDevtools");
});

test("resolveGlobalShortcut ignores unsupported modifier combinations", () => {
  assert.equal(resolveGlobalShortcut({ key: "p" }), null);
  assert.equal(resolveGlobalShortcut({ key: "p", ctrlKey: true, altKey: true }), null);
  assert.equal(resolveGlobalShortcut({ key: "x", ctrlKey: true }), null);
});

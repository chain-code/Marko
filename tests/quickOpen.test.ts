import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clampQuickOpenIndex, moveQuickOpenIndex } from "../src/utils/quickOpen";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("quick open index helpers clamp empty and out-of-range selections", () => {
  assert.equal(clampQuickOpenIndex(3, 0), 0);
  assert.equal(clampQuickOpenIndex(-1, 4), 0);
  assert.equal(clampQuickOpenIndex(7, 4), 3);
  assert.equal(clampQuickOpenIndex(2, 4), 2);
});

test("quick open index helpers wrap arrow-key movement", () => {
  assert.equal(moveQuickOpenIndex(0, 4, 1), 1);
  assert.equal(moveQuickOpenIndex(3, 4, 1), 0);
  assert.equal(moveQuickOpenIndex(0, 4, -1), 3);
  assert.equal(moveQuickOpenIndex(9, 4, 1), 0);
});

test("App quick open wires keyboard selection to the active result", () => {
  assert.match(appSource, /const quickActiveIndex = ref\(0\)/);
  assert.match(appSource, /const activeQuickFile = computed/);
  assert.match(appSource, /@quick-open="openQuickOpen"/);
  assert.match(appSource, /@mousedown\.self="closeQuickOpen\(\)"/);
  assert.match(appSource, /@keydown="handleQuickOpenKeydown"/);
  assert.match(appSource, /:class="\{ active: index === quickActiveIndex \}"/);
  assert.match(appSource, /@mouseenter="quickActiveIndex = index"/);
  assert.match(appSource, /openQuickResult\(activeQuickFile\.value\?\.path\)/);
  assert.match(appSource, /moveQuickOpenIndex\(quickActiveIndex\.value, filteredQuickFiles\.value\.length, delta\)/);
  assert.match(appSource, /scrollActiveQuickResultIntoView/);
});

test("App quick open restores editor focus when the panel closes", () => {
  assert.match(appSource, /function closeQuickOpen\(restoreEditorFocus = true\) \{/);
  assert.match(appSource, /quickOpenVisible\.value = false;/);
  assert.match(appSource, /quickQuery\.value = "";/);
  assert.match(appSource, /quickActiveIndex\.value = 0;/);
  assert.match(appSource, /if \(!restoreEditorFocus\) return;/);
  assert.match(appSource, /nextTick\(\(\) => \{\s*editorRef\.value\?\.focus\(\);\s*\}\);/);
  assert.match(appSource, /closeQuickOpen\(\);\s*void openFileByPath\(path\);/);
  assert.match(appSource, /case "Escape":[\s\S]*?closeQuickOpen\(\);/);
});

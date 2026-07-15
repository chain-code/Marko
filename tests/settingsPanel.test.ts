import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const settingsPanelSource = readFileSync(resolve("src/components/SettingsPanel.vue"), "utf8");
const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("SettingsPanel closes with Escape like a desktop preferences dialog", () => {
  assert.match(settingsPanelSource, /@keydown\.escape="\$emit\('close'\)"/);
  assert.match(settingsPanelSource, /ref="settingsPanelRef"/);
  assert.match(settingsPanelSource, /tabindex="-1"/);
  assert.match(settingsPanelSource, /settingsPanelRef\.value\?\.focus\(\)/);
});

test("App restores editor focus after closing settings", () => {
  assert.match(appSource, /@settings="openSettingsPanel"/);
  assert.match(appSource, /@close="closeSettingsPanel"/);
  assert.match(appSource, /case "settings":[\s\S]*?openSettingsPanel\(\);/);
  assert.match(appSource, /function openSettingsPanel\(\) \{[\s\S]*?settingsVisible\.value = true;\s*\}/);
  assert.match(appSource, /function closeSettingsPanel\(\) \{\s*settingsVisible\.value = false;\s*nextTick\(\(\) => \{\s*editorRef\.value\?\.focus\(\);\s*\}\);\s*\}/);
});

test("SettingsPanel follows Typora preference categories and exposes working options", () => {
  assert.match(settingsPanelSource, /key: "general", label: "通用"/);
  assert.match(settingsPanelSource, /key: "editor", label: "编辑器"/);
  assert.match(settingsPanelSource, /key: "markdown", label: "Markdown"/);
  assert.match(settingsPanelSource, /key: "image", label: "图像"/);
  assert.match(settingsPanelSource, /modelValue\.autoSave/);
  assert.match(settingsPanelSource, /modelValue\.saveOnFileSwitch/);
  assert.match(settingsPanelSource, /modelValue\.recoverUnsavedDrafts/);
  assert.match(settingsPanelSource, /modelValue\.recordRecentFiles/);
  assert.match(settingsPanelSource, /modelValue\.defaultLineEnding/);
  assert.match(settingsPanelSource, /modelValue\.indentSize/);
  assert.match(settingsPanelSource, /modelValue\.emojiAutocomplete/);
  assert.match(settingsPanelSource, /modelValue\.copyMarkdownAsPlainText/);
  assert.match(settingsPanelSource, /modelValue\.codeLineNumbers/);
  assert.match(settingsPanelSource, /modelValue\.codeWrap/);
  assert.match(settingsPanelSource, /modelValue\.defaultCodeLanguage/);
  assert.match(settingsPanelSource, /modelValue\.imageInsertAction/);
  assert.match(settingsPanelSource, /modelValue\.addDotSlashToRelativeImagePath/);
});

test("App wires automatic saving and save formatting into document navigation", () => {
  assert.match(appSource, /watch\([\s\S]*settings\.value\.autoSave[\s\S]*scheduleAutoSave\(\)/);
  assert.match(appSource, /function scheduleAutoSave\(\)[\s\S]*shouldAutoSaveDocument/);
  assert.match(appSource, /async function confirmDocumentChange\(switchingFile = false\)/);
  assert.match(appSource, /shouldSaveBeforeDocumentChange\(/);
  assert.match(appSource, /prepareMarkdownForSave\([\s\S]*settings\.value\.defaultLineEnding/);
  assert.match(appSource, /<footer v-if="settings\.showStatusBar" class="status-bar">/);
  assert.match(appSource, /prepareEditorSessionForRecovery\([\s\S]*settings\.value\.recoverUnsavedDrafts/);
  assert.match(appSource, /if \(!settings\.value\.recordRecentFiles\) return;/);
});

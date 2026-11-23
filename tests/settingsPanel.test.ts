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
  assert.match(settingsPanelSource, /modelValue\.codeIndentSize/);
  assert.match(settingsPanelSource, /modelValue\.shiftTabAutoIndent/);
  assert.match(settingsPanelSource, /modelValue\.emojiAutocomplete/);
  assert.match(settingsPanelSource, /modelValue\.copyMarkdownAsPlainText/);
  assert.match(settingsPanelSource, /modelValue\.smartQuotes/);
  assert.match(settingsPanelSource, /modelValue\.smartDashes/);
  assert.match(settingsPanelSource, /modelValue\.codeLineNumbers/);
  assert.match(settingsPanelSource, /modelValue\.codeWrap/);
  assert.match(settingsPanelSource, /modelValue\.defaultCodeLanguage/);
  assert.match(settingsPanelSource, /modelValue\.defaultCodeLanguageApplyTo/);
  assert.match(settingsPanelSource, /value="last">最近使用/);
  assert.match(settingsPanelSource, /value="markdown">通过 Markdown 输入/);
  assert.match(settingsPanelSource, /value="menu">通过菜单插入/);
  assert.match(settingsPanelSource, /value="both">两者/);
  assert.match(settingsPanelSource, /modelValue\.autoNumberingForMath/);
  assert.match(settingsPanelSource, /key: "highlight"/);
  assert.match(settingsPanelSource, /key: "superscript"/);
  assert.match(settingsPanelSource, /key: "subscript"/);
  assert.doesNotMatch(settingsPanelSource, /key: "marks"/);
  assert.match(settingsPanelSource, /value="none"/);
  assert.match(settingsPanelSource, /value="ams"/);
  assert.match(settingsPanelSource, /value="all"/);
  assert.match(settingsPanelSource, /updateMathAutoNumbering/);
  assert.doesNotMatch(settingsPanelSource, /KaTeX/);
  assert.match(settingsPanelSource, /modelValue\.imageInsertAction/);
  assert.match(settingsPanelSource, /modelValue\.addDotSlashToRelativeImagePath/);
});

test("SettingsPanel exposes independent Markdown and code indentation controls", () => {
  assert.match(settingsPanelSource, /<strong>Markdown 缩进宽度<\/strong>[\s\S]*?modelValue\.indentSize[\s\S]*?update\('indentSize'/);
  assert.match(settingsPanelSource, /<strong>代码缩进宽度<\/strong>[\s\S]*?modelValue\.codeIndentSize[\s\S]*?update\('codeIndentSize'/);
  assert.match(settingsPanelSource, /代码块、数学块和 HTML 块使用的空格数/);
  assert.match(settingsPanelSource, /<option :value="3">3 个空格<\/option>/);
  assert.match(settingsPanelSource, /<option :value="5">5 个空格<\/option>/);
  assert.match(settingsPanelSource, /<strong>Shift\+Tab 自动缩进<\/strong>[\s\S]*?modelValue\.shiftTabAutoIndent/);
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

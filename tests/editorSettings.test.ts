import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultEditorSettings,
  formatInsertedImageSource,
  parseEditorSettings,
  prepareMarkdownForSave,
  shouldAutoSaveDocument,
  shouldSaveDocumentBeforeSwitch,
} from "../src/utils/editorSettings";

test("parseEditorSettings fills Typora-style preferences for legacy settings", () => {
  const settings = parseEditorSettings(JSON.stringify({
    theme: "dark",
    fontSize: 18,
    extensions: { math: false },
  }));

  assert.equal(settings.theme, "dark");
  assert.equal(settings.fontSize, 18);
  assert.equal(settings.autoSave, defaultEditorSettings.autoSave);
  assert.equal(settings.saveOnFileSwitch, defaultEditorSettings.saveOnFileSwitch);
  assert.equal(settings.extensions.math, false);
  assert.equal(settings.extensions.autoLinks, true);
});

test("parseEditorSettings normalizes invalid persisted option values", () => {
  const settings = parseEditorSettings(JSON.stringify({
    defaultSidebarTab: "recent",
    defaultLineEnding: "invalid",
    indentSize: 8,
    defaultCodeLanguage: "  ts<script>  ",
    readingSpeed: 999,
    emojiAutocomplete: "sometimes",
    imageInsertAction: "elsewhere",
  }));

  assert.equal(settings.defaultSidebarTab, "files");
  assert.equal(settings.defaultLineEnding, "auto");
  assert.equal(settings.indentSize, 2);
  assert.equal(settings.defaultCodeLanguage, "tsscript");
  assert.equal(settings.readingSpeed, 240);
  assert.equal(settings.emojiAutocomplete, "automatic");
  assert.equal(settings.imageInsertAction, "assets");
  assert.deepEqual(parseEditorSettings("{bad json"), defaultEditorSettings);
});

test("parseEditorSettings preserves Typora-style autosave interval and search sidebar", () => {
  const settings = parseEditorSettings(JSON.stringify({
    autoSaveIntervalMinutes: 5,
    defaultSidebarTab: "search",
  }));

  assert.equal(settings.autoSaveIntervalMinutes, 5);
  assert.equal(settings.defaultSidebarTab, "search");
  assert.equal(parseEditorSettings(JSON.stringify({ autoSaveIntervalMinutes: 2 })).autoSaveIntervalMinutes, 3);
});

test("prepareMarkdownForSave applies line endings and one final newline", () => {
  assert.equal(prepareMarkdownForSave("a\r\nb\r\n", "lf", false), "a\nb\n");
  assert.equal(prepareMarkdownForSave("a\nb\n\n", "crlf", true), "a\r\nb\r\n");
  assert.equal(prepareMarkdownForSave("a\nb", "auto", false, "Win32"), "a\r\nb");
  assert.equal(prepareMarkdownForSave("a\r\nb", "auto", false, "Linux"), "a\nb");
});

test("auto save only writes dirty named desktop documents", () => {
  const enabled = { autoSave: true };
  assert.equal(shouldAutoSaveDocument(enabled, true, "C:/docs/a.md", true), true);
  assert.equal(shouldAutoSaveDocument(enabled, false, "C:/docs/a.md", true), false);
  assert.equal(shouldAutoSaveDocument(enabled, true, "", true), false);
  assert.equal(shouldAutoSaveDocument(enabled, true, "C:/docs/a.md", false), false);
  assert.equal(shouldAutoSaveDocument({ autoSave: false }, true, "C:/docs/a.md", true), false);
});

test("file switching saves when either switch-save or auto-save is enabled", () => {
  assert.equal(shouldSaveDocumentBeforeSwitch(
    { autoSave: false, saveOnFileSwitch: true },
    true,
    "C:/docs/a.md",
    true,
  ), true);
  assert.equal(shouldSaveDocumentBeforeSwitch(
    { autoSave: true, saveOnFileSwitch: false },
    true,
    "C:/docs/a.md",
    true,
  ), true);
  assert.equal(shouldSaveDocumentBeforeSwitch(
    { autoSave: false, saveOnFileSwitch: false },
    true,
    "C:/docs/a.md",
    true,
  ), false);
});

test("formatInsertedImageSource normalizes and escapes local image paths", () => {
  assert.equal(
    formatInsertedImageSource("assets\\示例 image#1.png", true),
    "assets/%E7%A4%BA%E4%BE%8B%20image%231.png",
  );
  assert.equal(formatInsertedImageSource("assets\\demo image.png", false), "assets/demo image.png");
  assert.equal(formatInsertedImageSource("assets/demo.png", false, true), "./assets/demo.png");
  assert.equal(formatInsertedImageSource("../assets/demo.png", false, true), "../assets/demo.png");
  assert.equal(formatInsertedImageSource("https://example.com/demo.png", false, true), "https://example.com/demo.png");
  assert.equal(formatInsertedImageSource("data:image/png;base64,abc", true), "data:image/png;base64,abc");
});

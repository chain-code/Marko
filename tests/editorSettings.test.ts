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
  assert.equal(settings.lineWidth, 860);
  assert.equal(settings.copyMarkdownAsPlainText, false);
  assert.equal(settings.autoSave, defaultEditorSettings.autoSave);
  assert.equal(settings.saveOnFileSwitch, defaultEditorSettings.saveOnFileSwitch);
  assert.equal(settings.indentSize, 2);
  assert.equal(settings.codeIndentSize, 4);
  assert.equal(settings.shiftTabAutoIndent, false);
  assert.equal(settings.defaultCodeLanguageApplyTo, "markdown");
  assert.equal(settings.extensions.math, false);
  assert.equal(settings.extensions.marks, false);
  assert.equal(settings.extensions.highlight, false);
  assert.equal(settings.extensions.superscript, false);
  assert.equal(settings.extensions.subscript, false);
  assert.equal(settings.extensions.autoLinks, true);
  assert.equal(settings.smartQuotes, true);
  assert.equal(settings.smartDashes, true);
});

test("parseEditorSettings preserves explicit line width, copy, and marks settings", () => {
  const settings = parseEditorSettings(JSON.stringify({
    lineWidth: 920,
    copyMarkdownAsPlainText: true,
    extensions: { marks: true },
  }));

  assert.equal(settings.lineWidth, 920);
  assert.equal(settings.copyMarkdownAsPlainText, true);
  assert.equal(settings.extensions.marks, false);
  assert.equal(settings.extensions.highlight, true);
  assert.equal(settings.extensions.superscript, true);
  assert.equal(settings.extensions.subscript, true);
});

test("parseEditorSettings keeps independent inline syntax and smart punctuation settings", () => {
  const settings = parseEditorSettings(JSON.stringify({
    smartPunctuation: false,
    smartQuotes: true,
    smartDashes: false,
    extensions: {
      marks: true,
      highlight: false,
      superscript: true,
      subscript: false,
    },
  }));

  assert.equal(settings.smartQuotes, true);
  assert.equal(settings.smartDashes, false);
  assert.equal(settings.extensions.highlight, false);
  assert.equal(settings.extensions.superscript, true);
  assert.equal(settings.extensions.subscript, false);
});

test("parseEditorSettings migrates the legacy smart punctuation switch", () => {
  const disabled = parseEditorSettings(JSON.stringify({ smartPunctuation: false }));
  assert.equal(disabled.smartQuotes, false);
  assert.equal(disabled.smartDashes, false);
});

test("parseEditorSettings normalizes invalid persisted option values", () => {
  const settings = parseEditorSettings(JSON.stringify({
    defaultSidebarTab: "recent",
    defaultLineEnding: "invalid",
    indentSize: 8,
    codeIndentSize: 8,
    shiftTabAutoIndent: "yes",
    defaultCodeLanguage: "  ts<script>  ",
    readingSpeed: 999,
    emojiAutocomplete: "sometimes",
    imageInsertAction: "elsewhere",
  }));

  assert.equal(settings.defaultSidebarTab, "files");
  assert.equal(settings.defaultLineEnding, "auto");
  assert.equal(settings.indentSize, 2);
  assert.equal(settings.codeIndentSize, 4);
  assert.equal(settings.shiftTabAutoIndent, false);
  assert.equal(settings.defaultCodeLanguage, "tsscript");
  assert.equal(settings.defaultCodeLanguageApplyTo, "menu");
  assert.equal(settings.readingSpeed, 240);
  assert.equal(settings.emojiAutocomplete, "automatic");
  assert.equal(settings.imageInsertAction, "assets");
  assert.deepEqual(parseEditorSettings("{bad json"), defaultEditorSettings);
});

test("parseEditorSettings normalizes code language mode and application channel", () => {
  const settings = parseEditorSettings(JSON.stringify({
    defaultCodeLanguage: "__LAST",
    defaultCodeLanguageApplyTo: "both",
  }));
  assert.equal(settings.defaultCodeLanguage, "__LAST");
  assert.equal(settings.defaultCodeLanguageApplyTo, "both");

  assert.equal(parseEditorSettings(JSON.stringify({
    defaultCodeLanguageApplyTo: 2,
  })).defaultCodeLanguageApplyTo, "menu");
  assert.equal(parseEditorSettings(JSON.stringify({
    defaultCodeLanguageApplyTo: "invalid",
  })).defaultCodeLanguageApplyTo, "markdown");
});

test("parseEditorSettings persists Markdown and code indentation independently", () => {
  const markdownFourCodeTwo = parseEditorSettings(JSON.stringify({
    indentSize: 4,
    codeIndentSize: 2,
  }));
  assert.equal(markdownFourCodeTwo.indentSize, 4);
  assert.equal(markdownFourCodeTwo.codeIndentSize, 2);

  const markdownTwoCodeFour = parseEditorSettings(JSON.stringify({
    indentSize: 2,
    codeIndentSize: 4,
  }));
  assert.equal(markdownTwoCodeFour.indentSize, 2);
  assert.equal(markdownTwoCodeFour.codeIndentSize, 4);

  for (const codeIndentSize of [2, 3, 4, 5]) {
    assert.equal(parseEditorSettings(JSON.stringify({ codeIndentSize })).codeIndentSize, codeIndentSize);
  }
  assert.equal(
    parseEditorSettings(JSON.stringify({ shiftTabAutoIndent: true })).shiftTabAutoIndent,
    true,
  );
});

test("parseEditorSettings normalizes all math auto-numbering modes", () => {
  assert.equal(defaultEditorSettings.autoNumberingForMath, false);
  assert.equal(parseEditorSettings(JSON.stringify({ autoNumberingForMath: false })).autoNumberingForMath, false);
  assert.equal(parseEditorSettings(JSON.stringify({ autoNumberingForMath: "ams" })).autoNumberingForMath, "ams");
  assert.equal(parseEditorSettings(JSON.stringify({ autoNumberingForMath: "all" })).autoNumberingForMath, "all");
  assert.equal(parseEditorSettings(JSON.stringify({ autoNumberingForMath: true })).autoNumberingForMath, "all");
  assert.equal(parseEditorSettings(JSON.stringify({ autoNumberingForMath: "invalid" })).autoNumberingForMath, false);
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
  assert.equal(
    formatInsertedImageSource("assets/a(b) 图.png", true),
    "assets/a%28b%29%20%E5%9B%BE.png",
  );
  assert.equal(formatInsertedImageSource("assets\\demo image.png", false), "assets/demo image.png");
  assert.equal(formatInsertedImageSource("assets/demo.png", false, true), "./assets/demo.png");
  assert.equal(formatInsertedImageSource("../assets/demo.png", false, true), "../assets/demo.png");
  assert.equal(formatInsertedImageSource("https://example.com/demo.png", false, true), "https://example.com/demo.png");
  assert.equal(formatInsertedImageSource("data:image/png;base64,abc", true), "data:image/png;base64,abc");
});

// 对外的设置（K-1，旧版库的 EditorSettings）的默认值和补全。默认值和旧版库相同；
// smartPunctuation、extensions.marks 是旧的总开关，单独的开关没给时跟着它们
import type { EditorSettings, MarkdownExtensionSettings } from "./types.ts";

export const defaultEditorSettings: EditorSettings = {
  theme: "solo",
  fontSize: 16,
  lineWidth: 860,
  zoom: 1,
  autoSave: true,
  autoSaveIntervalMinutes: 3,
  saveOnFileSwitch: true,
  recoverUnsavedDrafts: true,
  recordRecentFiles: true,
  showStatusBar: true,
  alwaysShowWordCount: true,
  defaultSidebarTab: "files",
  collapsibleOutline: true,
  readingSpeed: 240,
  defaultLineEnding: "auto",
  insertFinalNewline: false,
  spellcheck: true,
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  typewriterCenter: true,
  indentSize: 2,
  codeIndentSize: 4,
  shiftTabAutoIndent: false,
  autoPair: true,
  emojiAutocomplete: "automatic",
  copyMarkdownAsPlainText: false,
  preserveSingleLineBreaks: false,
  smartPunctuation: true,
  smartQuotes: true,
  smartDashes: true,
  autoNumberingForMath: false,
  codeLineNumbers: false,
  codeWrap: false,
  defaultCodeLanguage: "",
  defaultCodeLanguageApplyTo: "markdown",
  imageInsertAction: "assets",
  escapeImageUrls: true,
  addDotSlashToRelativeImagePath: false,
  uploadUrl: "",
  uploadToken: "",
  extensions: {
    html: true,
    toc: true,
    mermaid: true,
    flowchart: true,
    sequence: true,
    math: true,
    footnote: true,
    alerts: true,
    emoji: true,
    marks: false,
    highlight: false,
    superscript: false,
    subscript: false,
    autoLinks: true,
  },
};

/** 给的部分设置补上默认值；旧的总开关换算成单独的开关 */
export function resolveSettings(settings: Partial<EditorSettings> = {}): EditorSettings {
  const extensions: Partial<MarkdownExtensionSettings> = settings.extensions ?? {};
  const defaults = defaultEditorSettings;
  return {
    ...defaults,
    ...settings,
    smartQuotes: settings.smartQuotes ?? settings.smartPunctuation ?? defaults.smartQuotes,
    smartDashes: settings.smartDashes ?? settings.smartPunctuation ?? defaults.smartDashes,
    extensions: {
      ...defaults.extensions,
      ...extensions,
      marks: false,
      highlight: extensions.highlight ?? extensions.marks ?? defaults.extensions.highlight,
      superscript: extensions.superscript ?? extensions.marks ?? defaults.extensions.superscript,
      subscript: extensions.subscript ?? extensions.marks ?? defaults.extensions.subscript,
    },
  };
}

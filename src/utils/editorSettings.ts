import type {
  DefaultCodeLanguageApplyTo,
  EditorSettings,
  EmojiAutocompleteMode,
  ImageInsertAction,
  LineEnding,
  MarkdownExtensionSettings,
  MathAutoNumbering,
  SidebarTab,
} from "@/types";
import {
  normalizeDefaultCodeLanguage,
  normalizeDefaultCodeLanguageApplyTo,
} from "./codeLanguagePreference";

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

export function parseEditorSettings(raw: string | null): EditorSettings {
  if (!raw) return cloneDefaultEditorSettings();

  try {
    const parsed = JSON.parse(raw) as Partial<EditorSettings>;
    const parsedExtensions = parsed.extensions as Partial<EditorSettings["extensions"]> | undefined;
    const legacyMarks = typeof parsedExtensions?.marks === "boolean"
      ? parsedExtensions.marks
      : undefined;
    const legacySmartPunctuation = typeof parsed.smartPunctuation === "boolean"
      ? parsed.smartPunctuation
      : undefined;
    return {
      ...defaultEditorSettings,
      ...parsed,
      theme: parsed.theme === "dark" ? "dark" : "solo",
      defaultSidebarTab: normalizeSidebarTab(parsed.defaultSidebarTab),
      readingSpeed: normalizeReadingSpeed(parsed.readingSpeed),
      autoSaveIntervalMinutes: normalizeAutoSaveInterval(parsed.autoSaveIntervalMinutes),
      defaultLineEnding: normalizeLineEnding(parsed.defaultLineEnding),
      indentSize: normalizeIndentSize(parsed.indentSize),
      codeIndentSize: normalizeCodeIndentSize(parsed.codeIndentSize),
      shiftTabAutoIndent: parsed.shiftTabAutoIndent === true,
      defaultCodeLanguage: normalizeDefaultCodeLanguage(parsed.defaultCodeLanguage),
      defaultCodeLanguageApplyTo: getDefaultCodeLanguageApplyTo(parsed),
      emojiAutocomplete: normalizeEmojiAutocomplete(parsed.emojiAutocomplete),
      autoNumberingForMath: normalizeMathAutoNumbering(parsed.autoNumberingForMath),
      imageInsertAction: normalizeImageInsertAction(parsed.imageInsertAction),
      smartQuotes: typeof parsed.smartQuotes === "boolean"
        ? parsed.smartQuotes
        : legacySmartPunctuation ?? defaultEditorSettings.smartQuotes,
      smartDashes: typeof parsed.smartDashes === "boolean"
        ? parsed.smartDashes
        : legacySmartPunctuation ?? defaultEditorSettings.smartDashes,
      extensions: {
        ...defaultEditorSettings.extensions,
        ...parsedExtensions,
        marks: false,
        highlight: typeof parsedExtensions?.highlight === "boolean"
          ? parsedExtensions.highlight
          : legacyMarks ?? defaultEditorSettings.extensions.highlight,
        superscript: typeof parsedExtensions?.superscript === "boolean"
          ? parsedExtensions.superscript
          : legacyMarks ?? defaultEditorSettings.extensions.superscript,
        subscript: typeof parsedExtensions?.subscript === "boolean"
          ? parsedExtensions.subscript
          : legacyMarks ?? defaultEditorSettings.extensions.subscript,
      },
    };
  } catch {
    return cloneDefaultEditorSettings();
  }
}

type InlineMarkExtensionSettings = Pick<
  MarkdownExtensionSettings,
  "marks" | "highlight" | "superscript" | "subscript"
>;

export function isHighlightExtensionEnabled(settings: InlineMarkExtensionSettings): boolean {
  return settings.highlight || settings.marks;
}

export function isSuperscriptExtensionEnabled(settings: InlineMarkExtensionSettings): boolean {
  return settings.superscript || settings.marks;
}

export function isSubscriptExtensionEnabled(settings: InlineMarkExtensionSettings): boolean {
  return settings.subscript || settings.marks;
}

export function hasInlineMarkExtensions(settings: InlineMarkExtensionSettings): boolean {
  return isHighlightExtensionEnabled(settings)
    || isSuperscriptExtensionEnabled(settings)
    || isSubscriptExtensionEnabled(settings);
}

export function prepareMarkdownForSave(
  content: string,
  lineEnding: LineEnding,
  insertFinalNewline: boolean,
  platform = typeof navigator === "undefined" ? "" : navigator.platform,
): string {
  const normalized = content.replace(/\r\n?/g, "\n");
  const withFinalNewline = insertFinalNewline
    ? `${normalized.replace(/\n*$/, "")}\n`
    : normalized;
  const target = lineEnding === "auto"
    ? (/^win/i.test(platform) ? "crlf" : "lf")
    : lineEnding;
  return target === "crlf" ? withFinalNewline.replace(/\n/g, "\r\n") : withFinalNewline;
}

export function shouldAutoSaveDocument(
  settings: Pick<EditorSettings, "autoSave">,
  dirty: boolean,
  currentFilePath: string,
  desktopRuntime: boolean,
): boolean {
  return settings.autoSave && dirty && desktopRuntime && Boolean(currentFilePath.trim());
}

export function shouldSaveDocumentBeforeSwitch(
  settings: Pick<EditorSettings, "autoSave" | "saveOnFileSwitch">,
  dirty: boolean,
  currentFilePath: string,
  desktopRuntime: boolean,
): boolean {
  return dirty
    && desktopRuntime
    && Boolean(currentFilePath.trim())
    && (settings.autoSave || settings.saveOnFileSwitch);
}

export function formatInsertedImageSource(
  source: string,
  escapeUrl: boolean,
  addDotSlash = false,
): string {
  const normalized = source.replace(/\\/g, "/");
  const prefixed = addDotSlash && isPlainRelativeImagePath(normalized) ? `./${normalized}` : normalized;
  if (!escapeUrl || /^(?:data|blob):/i.test(prefixed)) return prefixed;
  try {
    return encodeURI(decodeURI(prefixed))
      .replace(/#/g, "%23")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
  } catch {
    return encodeURI(prefixed)
      .replace(/#/g, "%23")
      .replace(/\(/g, "%28")
      .replace(/\)/g, "%29");
  }
}

function isPlainRelativeImagePath(value: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/|\.\.\/|\.\/|[a-z]:\/)/i.test(value);
}

function cloneDefaultEditorSettings(): EditorSettings {
  return {
    ...defaultEditorSettings,
    extensions: { ...defaultEditorSettings.extensions },
  };
}

function normalizeSidebarTab(value: unknown): SidebarTab {
  return value === "outline" || value === "search" ? value : "files";
}

function normalizeLineEnding(value: unknown): LineEnding {
  return value === "lf" || value === "crlf" ? value : "auto";
}

function normalizeEmojiAutocomplete(value: unknown): EmojiAutocompleteMode {
  return value === "escape" || value === "off" ? value : "automatic";
}

function normalizeMathAutoNumbering(value: unknown): MathAutoNumbering {
  if (value === "ams") return "ams";
  if (value === true || value === "all") return "all";
  return false;
}

function normalizeImageInsertAction(value: unknown): ImageInsertAction {
  return value === "none" || value === "current" || value === "documentAssets" ? value : "assets";
}

function normalizeIndentSize(value: unknown): number {
  return value === 4 ? 4 : 2;
}

function normalizeCodeIndentSize(value: unknown): number {
  return value === 2 || value === 3 || value === 5 ? value : 4;
}

function normalizeReadingSpeed(value: unknown): number {
  return value === 120 || value === 382 ? value : 240;
}

function normalizeAutoSaveInterval(value: unknown): number {
  return value === 1 || value === 5 || value === 10 ? value : 3;
}

function getDefaultCodeLanguageApplyTo(
  parsed: Partial<EditorSettings>,
): DefaultCodeLanguageApplyTo {
  if (parsed.defaultCodeLanguageApplyTo !== undefined) {
    return normalizeDefaultCodeLanguageApplyTo(parsed.defaultCodeLanguageApplyTo);
  }
  return normalizeDefaultCodeLanguage(parsed.defaultCodeLanguage) ? "menu" : "markdown";
}

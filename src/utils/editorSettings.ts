import type {
  EditorSettings,
  EmojiAutocompleteMode,
  ImageInsertAction,
  LineEnding,
  SidebarTab,
} from "@/types";

export const defaultEditorSettings: EditorSettings = {
  theme: "solo",
  fontSize: 16,
  lineWidth: 820,
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
  autoPair: true,
  emojiAutocomplete: "automatic",
  copyMarkdownAsPlainText: true,
  preserveSingleLineBreaks: false,
  smartPunctuation: true,
  codeLineNumbers: false,
  codeWrap: false,
  defaultCodeLanguage: "",
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
    math: true,
    footnote: true,
    alerts: true,
    emoji: true,
    marks: true,
    autoLinks: true,
  },
};

export function parseEditorSettings(raw: string | null): EditorSettings {
  if (!raw) return cloneDefaultEditorSettings();

  try {
    const parsed = JSON.parse(raw) as Partial<EditorSettings>;
    return {
      ...defaultEditorSettings,
      ...parsed,
      theme: parsed.theme === "dark" ? "dark" : "solo",
      defaultSidebarTab: normalizeSidebarTab(parsed.defaultSidebarTab),
      readingSpeed: normalizeReadingSpeed(parsed.readingSpeed),
      autoSaveIntervalMinutes: normalizeAutoSaveInterval(parsed.autoSaveIntervalMinutes),
      defaultLineEnding: normalizeLineEnding(parsed.defaultLineEnding),
      indentSize: normalizeIndentSize(parsed.indentSize),
      defaultCodeLanguage: normalizeCodeLanguage(parsed.defaultCodeLanguage),
      emojiAutocomplete: normalizeEmojiAutocomplete(parsed.emojiAutocomplete),
      imageInsertAction: normalizeImageInsertAction(parsed.imageInsertAction),
      extensions: {
        ...defaultEditorSettings.extensions,
        ...parsed.extensions,
      },
    };
  } catch {
    return cloneDefaultEditorSettings();
  }
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
    return encodeURI(decodeURI(prefixed)).replace(/#/g, "%23");
  } catch {
    return encodeURI(prefixed).replace(/#/g, "%23");
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

function normalizeImageInsertAction(value: unknown): ImageInsertAction {
  return value === "none" || value === "current" || value === "documentAssets" ? value : "assets";
}

function normalizeIndentSize(value: unknown): number {
  return value === 4 ? 4 : 2;
}

function normalizeReadingSpeed(value: unknown): number {
  return value === 120 || value === 382 ? value : 240;
}

function normalizeAutoSaveInterval(value: unknown): number {
  return value === 1 || value === 5 || value === 10 ? value : 3;
}

function normalizeCodeLanguage(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/[^a-z0-9_+#.-]/gi, "").slice(0, 32) : "";
}

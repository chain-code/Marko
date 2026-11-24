// 偏好设置（S 章）的分节和设置项：对话框按这张表画表单。key 是 Settings 的字段名，扩展语法是 "extensions.<名字>"。
// 文字不写在这里（L-2）：节名是 settings.section.<id>，设置项是 settings.label.<key>，说明是 settings.hint.<key>（有这条才显示），
// 选项是 settings.option.<key>.<值>，或者 settings.format.<format>（{value} 换成值）
import { DEFAULT_SETTINGS, type ExtensionSettings, type Settings, type SettingsPatch } from "@marko/shared";
import { availableLocales } from "../../../locales/index.ts";
import { t, tryT } from "../../i18n.ts";
import { isMacPlatform } from "../../shortcuts.ts";

export type FieldKind = "switch" | "select" | "number" | "radio" | "text" | "multi" | "codeLanguage" | "token" | "theme" | "dictionary" | "shortcuts";

export type OptionValue = string | number | boolean;

/** 选项文字的写法：raw 是值本身（A4、Letter 这些）；别的是 settings.format.<名字> */
export type OptionFormat = "raw" | "minutes" | "spaces" | "wordsPerMinute";

export interface Field {
  key: string;
  kind: FieldKind;
  options?: OptionValue[];
  /** 不给时选项的文字是 settings.option.<key>.<值> */
  format?: OptionFormat;
  min?: number;
  max?: number;
  step?: number;
  /** 依赖别的设置才显示（如「跟随系统」打开时才选浅色、深色主题） */
  visible?: (settings: Settings) => boolean;
}

export interface Section {
  id: string;
  fields: Field[];
}

/** 拼写检查常用的语言（L-1） */
export const SPELLCHECK_LANGUAGES = ["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "pt-BR", "ru"];

const onOff = (key: string): Field => ({ key, kind: "switch" });

const EXTENSIONS: Array<keyof ExtensionSettings> = [
  "html",
  "toc",
  "mermaid",
  "flowchart",
  "sequence",
  "math",
  "footnote",
  "alerts",
  "emoji",
  "highlight",
  "superscript",
  "subscript",
  "autoLinks",
];

export const SECTIONS: Section[] = [
  {
    id: "appearance",
    fields: [
      // 主题的选项是内置的加上用户主题目录里的（A-3），由对话框按主题列表画
      { key: "theme", kind: "theme", visible: (settings) => !settings.followSystemTheme },
      onOff("followSystemTheme"),
      { key: "lightTheme", kind: "theme", visible: (settings) => settings.followSystemTheme },
      { key: "darkTheme", kind: "theme", visible: (settings) => settings.followSystemTheme },
      { key: "fontSize", kind: "number", min: 10, max: 40, step: 1 },
      { key: "lineWidth", kind: "number", min: 400, max: 4000, step: 20 },
    ],
  },
  {
    id: "save",
    fields: [
      onOff("autoSave"),
      { key: "autoSaveIntervalMinutes", kind: "select", options: [1, 3, 5, 10], format: "minutes", visible: (settings) => settings.autoSave },
      onOff("saveOnFileSwitch"),
      onOff("recoverUnsavedDrafts"),
      onOff("insertFinalNewline"),
      { key: "defaultLineEnding", kind: "select", options: ["auto", "lf", "crlf"] },
      { key: "startup", kind: "radio", options: ["restore", "blank"] },
    ],
  },
  {
    id: "sidebar",
    fields: [
      onOff("showStatusBar"),
      onOff("alwaysShowWordCount"),
      { key: "defaultSidebarTab", kind: "select", options: ["files", "outline", "search"] },
      onOff("collapsibleOutline"),
      onOff("recordRecentFiles"),
      { key: "readingSpeed", kind: "select", options: [120, 240, 382], format: "wordsPerMinute" },
    ],
  },
  {
    id: "input",
    fields: [
      { key: "indentSize", kind: "select", options: [2, 4], format: "spaces" },
      { key: "codeIndentSize", kind: "select", options: [2, 3, 4, 5], format: "spaces" },
      onOff("shiftTabAutoIndent"),
      onOff("autoPair"),
      { key: "emojiAutocomplete", kind: "select", options: ["automatic", "escape", "off"] },
      onOff("spellcheck"),
      onOff("copyMarkdownAsPlainText"),
    ],
  },
  {
    id: "editing",
    fields: [onOff("typewriterCenter"), onOff("smartQuotes"), onOff("smartDashes"), onOff("preserveSingleLineBreaks")],
  },
  {
    id: "code",
    fields: [
      { key: "defaultCodeLanguage", kind: "codeLanguage" },
      { key: "defaultCodeLanguageApplyTo", kind: "select", options: ["markdown", "menu", "both"] },
      onOff("codeLineNumbers"),
      onOff("codeWrap"),
    ],
  },
  {
    id: "markdown",
    fields: [...EXTENSIONS.map((name) => onOff(`extensions.${name}`)), { key: "autoNumberingForMath", kind: "select", options: [false, "ams", "all"] }],
  },
  {
    id: "images",
    fields: [
      { key: "imageInsertAction", kind: "select", options: ["none", "current", "assets", "documentAssets"] },
      onOff("escapeImageUrls"),
      onOff("addDotSlashToRelativeImagePath"),
      { key: "uploadMethod", kind: "select", options: ["none", "api", "command"] },
      { key: "uploadUrl", kind: "text", visible: (settings) => settings.uploadMethod === "api" },
      { key: "uploadToken", kind: "token", visible: (settings) => settings.uploadMethod === "api" },
      { key: "uploadCommand", kind: "text", visible: (settings) => settings.uploadMethod === "command" },
    ],
  },
  {
    id: "export",
    fields: [
      { key: "pdfPageSize", kind: "select", options: ["A4", "A3", "A5", "Letter", "Legal", "Tabloid"], format: "raw" },
      onOff("pdfLandscape"),
      { key: "pdfMargin", kind: "number", min: 0, max: 2, step: 0.1 },
      onOff("pdfHeaderFooter"),
      onOff("pdfPrintBackground"),
      onOff("pdfOutline"),
      { key: "exportImages", kind: "select", options: ["reference", "embed"] },
      { key: "pandocPath", kind: "text" },
      { key: "pandocArgs", kind: "text" },
      { key: "afterExport", kind: "select", options: ["none", "open", "reveal"] },
    ],
  },
  {
    id: "language",
    fields: [
      // L-2：有哪些语言看翻译文件（locales/*.json）；每种语言用它自己的名字
      { key: "language", kind: "select", options: availableLocales().map((locale) => locale.code) },
      { key: "spellcheckLanguages", kind: "multi", options: SPELLCHECK_LANGUAGES },
      // 不是设置项：拼写检查的词典里加过的词（主进程从 Electron 读）
      { key: "userDictionary", kind: "dictionary" },
    ],
  },
  {
    // S-12：整节是一张命令和快捷键的表（ShortcutsPanel）
    id: "shortcuts",
    fields: [{ key: "keyBindings", kind: "shortcuts" }],
  },
  {
    id: "update",
    fields: [onOff("autoCheckUpdates")],
  },
];

export function sectionLabel(section: Section): string {
  return tryT(`settings.section.${section.id}`) ?? section.id;
}

export function fieldLabel(field: Field): string {
  return tryT(`settings.label.${field.key}`) ?? field.key;
}

/** 设置项下面的说明；这种语言里没有写说明的不显示 */
export function fieldHint(field: Field): string | null {
  // 说明里提到的快捷键按平台写（「默认复制 Markdown 源码」）
  return tryT(`settings.hint.${field.key}`, { copy: isMacPlatform() ? "⌘C" : "Ctrl+C" });
}

export function optionLabel(field: Field, value: OptionValue): string {
  if (field.key === "language") return availableLocales().find((locale) => locale.code === value)?.name ?? String(value);
  if (field.format === "raw") return String(value);
  if (field.format) return t(`settings.format.${field.format}`, { value: String(value) });
  return tryT(`settings.option.${field.key}.${String(value)}`) ?? String(value);
}

/** 一项设置现在的值 */
export function valueOf(settings: Settings, key: string): unknown {
  if (key.startsWith("extensions.")) return settings.extensions[key.slice("extensions.".length) as keyof ExtensionSettings];
  return settings[key as keyof Settings];
}

/** 改一项设置要发给主进程的部分 */
export function patchOf(key: string, value: unknown): SettingsPatch {
  if (key.startsWith("extensions.")) return { extensions: { [key.slice("extensions.".length)]: value } } as SettingsPatch;
  return { [key]: value } as SettingsPatch;
}

/** 这一项和默认值不一样（界面上标出来，可以一键恢复） */
export function isModified(settings: Settings, key: string): boolean {
  return JSON.stringify(valueOf(settings, key)) !== JSON.stringify(valueOf(DEFAULT_SETTINGS, key));
}

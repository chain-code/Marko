// 偏好设置（S 章）的分节、分组和设置项：页面按这张表画（样子和分节同 Typora：文件、编辑器、图像、Markdown、导出、外观、通用，
// 再加 Marko 的快捷键）。key 是 Settings 的字段名，扩展语法是 "extensions.<名字>"；按钮的 key 是它做的事。
// 文字不写在这里（L-2）：节名 settings.section.<id>，组名 settings.group.<id>（组名后面的小字 settings.groupHint.<id>，有才显示），
// 设置项 settings.label.<key>，说明 settings.hint.<key>（有才显示），按钮 settings.button.<key>，单位 settings.unit.<key>，
// 选项 settings.option.<key>.<值>，或者 settings.format.<format>（{value} 换成值）
import { DEFAULT_SETTINGS, type ExtensionSettings, type Settings, type SettingsPatch } from "@marko/shared";
import { availableLocales } from "../../../locales/index.ts";
import { t, tryT } from "../../i18n.ts";
import { isMacPlatform } from "../../shortcuts.ts";

/** check 勾选框、select 下拉框、radio 单选（一行排开）、button 按钮；其余是 Marko 自己的几种 */
export type FieldKind = "check" | "select" | "number" | "radio" | "text" | "multi" | "codeLanguage" | "token" | "theme" | "dictionary" | "shortcuts" | "button";

export type OptionValue = string | number | boolean;

/** 选项文字的写法：raw 是值本身（A4、Letter、2、4 这些）；别的是 settings.format.<名字> */
export type OptionFormat = "raw" | "minutes" | "wordsPerMinute";

/** 偏好设置里的按钮做的事 */
export type SettingsAction = "clearRecent" | "exitFocusModes" | "openThemeFolder";

export interface Field {
  key: string;
  kind: FieldKind;
  options?: OptionValue[];
  /** 不给时选项的文字是 settings.option.<key>.<值> */
  format?: OptionFormat;
  min?: number;
  max?: number;
  step?: number;
  /** 下拉框、输入框前面写上名字（一组里有好几项时；组里只有它时组名就是名字，同 Typora） */
  labelled?: boolean;
  /** 依赖别的设置才显示（如「跟随系统」打开时才选浅色、深色主题） */
  visible?: (settings: Settings) => boolean;
}

export interface Group {
  id: string;
  /** 不显示组名（快捷键整节一张表） */
  untitled?: boolean;
  fields: Field[];
}

export interface Section {
  id: string;
  groups: Group[];
}

/** 拼写检查常用的语言（L-1） */
export const SPELLCHECK_LANGUAGES = ["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "pt-BR", "ru"];

const check = (key: string): Field => ({ key, kind: "check" });
const button = (key: SettingsAction): Field => ({ key, kind: "button" });

/** Markdown 扩展语法：前面七个按 Typora 的顺序，后面是 Marko 多的开关 */
const EXTENSIONS: Array<keyof ExtensionSettings> = [
  "autoLinks",
  "inlineMath",
  "subscript",
  "superscript",
  "highlight",
  "alerts",
  "mermaid",
  "flowchart",
  "sequence",
  "html",
  "toc",
  "footnote",
  "emoji",
];

export const SECTIONS: Section[] = [
  {
    id: "file",
    groups: [
      { id: "startup", fields: [{ key: "startup", kind: "select", options: ["blank", "restore"] }] },
      { id: "outline", fields: [check("collapsibleOutline")] },
      {
        id: "save",
        fields: [
          check("autoSave"),
          { key: "autoSaveIntervalMinutes", kind: "select", options: [1, 3, 5, 10], format: "minutes", labelled: true, visible: (settings) => settings.autoSave },
          check("saveOnFileSwitch"),
          check("recoverUnsavedDrafts"),
          check("insertFinalNewline"),
        ],
      },
      { id: "recent", fields: [check("recordRecentFiles"), button("clearRecent")] },
    ],
  },
  {
    id: "editor",
    groups: [
      { id: "indent", fields: [{ key: "indentSize", kind: "select", options: [2, 4], format: "raw" }] },
      { id: "pairs", fields: [check("autoPair")] },
      { id: "autocomplete", fields: [{ key: "emojiAutocomplete", kind: "select", options: ["automatic", "escape", "off"], labelled: true }] },
      { id: "copy", fields: [check("copyMarkdownAsPlainText")] },
      { id: "lineEnding", fields: [{ key: "defaultLineEnding", kind: "radio", options: ["lf", "crlf", "auto"] }] },
      {
        id: "spellcheck",
        fields: [check("spellcheck"), { key: "spellcheckLanguages", kind: "multi", options: SPELLCHECK_LANGUAGES, labelled: true }, { key: "userDictionary", kind: "dictionary" }],
      },
      { id: "typewriter", fields: [check("typewriterCenter"), button("exitFocusModes")] },
    ],
  },
  {
    id: "image",
    groups: [
      { id: "insert", fields: [{ key: "imageInsertAction", kind: "select", options: ["none", "current", "assets", "documentAssets"] }] },
      { id: "syntax", fields: [check("addDotSlashToRelativeImagePath"), check("escapeImageUrls")] },
      {
        id: "upload",
        fields: [
          { key: "uploadMethod", kind: "select", options: ["none", "api", "command"] },
          { key: "uploadUrl", kind: "text", labelled: true, visible: (settings) => settings.uploadMethod === "api" },
          { key: "uploadToken", kind: "token", labelled: true, visible: (settings) => settings.uploadMethod === "api" },
          { key: "uploadCommand", kind: "text", labelled: true, visible: (settings) => settings.uploadMethod === "command" },
        ],
      },
    ],
  },
  {
    id: "markdown",
    groups: [
      { id: "extensions", fields: EXTENSIONS.map((name) => check(`extensions.${name}`)) },
      { id: "punctuation", fields: [check("smartQuotes"), check("smartDashes")] },
      {
        id: "code",
        fields: [
          check("codeLineNumbers"),
          check("codeWrap"),
          check("shiftTabAutoIndent"),
          { key: "codeIndentSize", kind: "select", options: [2, 3, 4, 5], format: "raw", labelled: true },
          { key: "defaultCodeLanguage", kind: "codeLanguage", labelled: true },
          { key: "defaultCodeLanguageApplyTo", kind: "select", options: ["markdown", "menu", "both"], labelled: true },
        ],
      },
      { id: "math", fields: [check("extensions.math"), { key: "autoNumberingForMath", kind: "select", options: [false, "ams", "all"], labelled: true }] },
      { id: "whitespace", fields: [{ key: "preserveSingleLineBreaks", kind: "select", options: [true, false] }] },
    ],
  },
  {
    id: "export",
    groups: [
      { id: "pandoc", fields: [{ key: "pandocPath", kind: "text" }, { key: "pandocArgs", kind: "text", labelled: true }] },
      { id: "afterExport", fields: [{ key: "afterExport", kind: "select", options: ["none", "open", "reveal"] }] },
      {
        id: "pdf",
        fields: [
          { key: "pdfPageSize", kind: "select", options: ["A4", "A3", "A5", "Letter", "Legal", "Tabloid"], format: "raw", labelled: true },
          { key: "pdfMargin", kind: "number", min: 0, max: 2, step: 0.1, labelled: true },
          check("pdfLandscape"),
          check("pdfHeaderFooter"),
          check("pdfPrintBackground"),
          check("pdfOutline"),
        ],
      },
      { id: "html", fields: [{ key: "exportImages", kind: "select", options: ["reference", "embed"], labelled: true }] },
    ],
  },
  {
    id: "appearance",
    groups: [
      { id: "fontSize", fields: [{ key: "fontSize", kind: "number", min: 10, max: 40, step: 1 }] },
      { id: "lineWidth", fields: [{ key: "lineWidth", kind: "number", min: 400, max: 4000, step: 20 }] },
      { id: "statusBar", fields: [check("showStatusBar"), check("alwaysShowWordCount")] },
      { id: "wordCount", fields: [{ key: "readingSpeed", kind: "select", options: [120, 240, 382], format: "wordsPerMinute", labelled: true }] },
      {
        id: "theme",
        fields: [
          // 主题的选项是内置的加上用户主题目录里的（A-3），由页面按主题列表画
          { key: "theme", kind: "theme", labelled: true, visible: (settings) => !settings.followSystemTheme },
          check("followSystemTheme"),
          { key: "lightTheme", kind: "theme", labelled: true, visible: (settings) => settings.followSystemTheme },
          { key: "darkTheme", kind: "theme", labelled: true, visible: (settings) => settings.followSystemTheme },
          button("openThemeFolder"),
        ],
      },
      { id: "sidebar", fields: [{ key: "defaultSidebarTab", kind: "select", options: ["files", "outline", "search"], labelled: true }] },
    ],
  },
  {
    id: "general",
    groups: [
      // L-2：有哪些语言看翻译文件（locales/*.json）；每种语言用它自己的名字
      { id: "language", fields: [{ key: "language", kind: "select", options: availableLocales().map((locale) => locale.code) }] },
      { id: "update", fields: [check("autoCheckUpdates")] },
    ],
  },
  {
    // S-12：整节是一张命令和快捷键的表（ShortcutsPanel）
    id: "shortcuts",
    groups: [{ id: "shortcuts", untitled: true, fields: [{ key: "keyBindings", kind: "shortcuts" }] }],
  },
];

/** 所有的设置项（不分节） */
export function allFields(): Field[] {
  return SECTIONS.flatMap((section) => section.groups.flatMap((group) => group.fields));
}

export function sectionLabel(section: Section): string {
  return tryT(`settings.section.${section.id}`) ?? section.id;
}

export function groupLabel(group: Group): string {
  return tryT(`settings.group.${group.id}`) ?? group.id;
}

/** 组名后面的小字（「默认缩进　只对通过菜单栏或快捷键生成的引用和列表有效」）；没写的不显示 */
export function groupHint(group: Group): string | null {
  return tryT(`settings.groupHint.${group.id}`, { copy: isMacPlatform() ? "⌘C" : "Ctrl+C" });
}

export function fieldLabel(field: Field): string {
  if (field.kind === "button") return tryT(`settings.button.${field.key}`) ?? field.key;
  return tryT(`settings.label.${field.key}`) ?? field.key;
}

/** 设置项的说明（页面上是右边的「?」，鼠标移上去显示）；这种语言里没有写说明的不显示 */
export function fieldHint(field: Field): string | null {
  // 说明里提到的快捷键按平台写（「默认复制 Markdown 源码」）
  return tryT(`settings.hint.${field.key}`, { copy: isMacPlatform() ? "⌘C" : "Ctrl+C" });
}

/** 数字后面的单位（px）；没有的是 null */
export function fieldUnit(field: Field): string | null {
  return tryT(`settings.unit.${field.key}`);
}

export function optionLabel(field: Field, value: OptionValue): string {
  if (field.key === "language") return availableLocales().find((locale) => locale.code === value)?.name ?? String(value);
  if (field.format === "raw") return String(value);
  if (field.format) return t(`settings.format.${field.format}`, { value: String(value) });
  return tryT(`settings.option.${field.key}.${String(value)}`) ?? String(value);
}

/** 查找框（同 Typora）：节名、组名、设置项的名字和说明里有这段字（不分大小写） */
export function matches(text: string | null, query: string): boolean {
  return !!query && !!text && text.toLowerCase().includes(query.trim().toLowerCase());
}

export function fieldMatches(field: Field, query: string): boolean {
  return matches(fieldLabel(field), query) || matches(fieldHint(field), query);
}

export function groupMatches(group: Group, query: string): boolean {
  return (!group.untitled && (matches(groupLabel(group), query) || matches(groupHint(group), query))) || group.fields.some((field) => fieldMatches(field, query));
}

export function sectionMatches(section: Section, query: string): boolean {
  return matches(sectionLabel(section), query) || section.groups.some((group) => groupMatches(group, query));
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

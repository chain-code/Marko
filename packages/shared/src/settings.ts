// 设置（S 章、1.8 节）：保存在主进程（electron-store），所有窗口共用；改了广播 settings.changed。
// 每一项都有默认值：读到旧版本存的、缺了字段的设置时补上默认值（新加的设置不用迁移）。
// 编辑器相关的几项和编辑器库（@marko/editor-vue）的 EditorSettings 同名，应用界面按同名换算
import { z } from "zod";

const ExtensionsSchema = z.object({
  html: z.boolean().default(true),
  toc: z.boolean().default(true),
  mermaid: z.boolean().default(true),
  flowchart: z.boolean().default(true),
  sequence: z.boolean().default(true),
  math: z.boolean().default(true),
  // 行内公式 $…$（同 Typora 默认关）
  inlineMath: z.boolean().default(false),
  footnote: z.boolean().default(true),
  alerts: z.boolean().default(true),
  emoji: z.boolean().default(true),
  highlight: z.boolean().default(false),
  superscript: z.boolean().default(false),
  subscript: z.boolean().default(false),
  autoLinks: z.boolean().default(true),
});

export const SettingsSchema = z.object({
  // S-2 外观
  theme: z.string().min(1).default("solo"),
  followSystemTheme: z.boolean().default(false),
  lightTheme: z.string().min(1).default("solo"),
  darkTheme: z.string().min(1).default("dark"),
  fontSize: z.number().int().min(10).max(40).default(16),
  lineWidth: z.number().int().min(400).max(4000).default(860),
  zoom: z.number().min(0.5).max(3).default(1),
  // S-3 保存与恢复
  // 默认值同 Typora（偏好设置 → 文件）
  autoSave: z.boolean().default(false),
  autoSaveIntervalMinutes: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10)]).default(3),
  saveOnFileSwitch: z.boolean().default(false),
  recoverUnsavedDrafts: z.boolean().default(true),
  insertFinalNewline: z.boolean().default(false),
  defaultLineEnding: z.enum(["auto", "lf", "crlf"]).default("auto"),
  startup: z.enum(["restore", "blank"]).default("blank"),
  // S-4 侧栏与状态栏
  showStatusBar: z.boolean().default(true),
  alwaysShowWordCount: z.boolean().default(true),
  defaultSidebarTab: z.enum(["files", "outline", "search"]).default("outline"),
  collapsibleOutline: z.boolean().default(false),
  recordRecentFiles: z.boolean().default(true),
  // 同 Typora 默认每分钟 382 词
  readingSpeed: z.union([z.literal(120), z.literal(240), z.literal(382)]).default(382),
  // V-4：状态栏显示的统计（在字数统计里点那一行切换，同 Typora）
  wordCountMetric: z.enum(["words", "chars", "lines", "minutes"]).default("words"),
  // S-5 输入
  indentSize: z.union([z.literal(2), z.literal(4)]).default(2),
  codeIndentSize: z.number().int().min(2).max(5).default(4),
  shiftTabAutoIndent: z.boolean().default(false),
  autoPair: z.boolean().default(true),
  emojiAutocomplete: z.enum(["automatic", "escape", "off"]).default("automatic"),
  spellcheck: z.boolean().default(true),
  copyMarkdownAsPlainText: z.boolean().default(true),
  // S-6 编辑体验（专注、打字机模式在「显示」菜单里切换，也记下来）
  focusMode: z.boolean().default(false),
  typewriterMode: z.boolean().default(false),
  typewriterCenter: z.boolean().default(true),
  smartQuotes: z.boolean().default(false),
  smartDashes: z.boolean().default(false),
  preserveSingleLineBreaks: z.boolean().default(true),
  // S-7 代码块（默认语言："" 不指定，其余是语言名）
  defaultCodeLanguage: z.string().default(""),
  defaultCodeLanguageApplyTo: z.enum(["markdown", "menu", "both"]).default("markdown"),
  codeLineNumbers: z.boolean().default(false),
  codeWrap: z.boolean().default(true),
  // S-8 Markdown 扩展语法
  extensions: ExtensionsSchema.default(ExtensionsSchema.parse({})),
  autoNumberingForMath: z.union([z.literal(false), z.literal("ams"), z.literal("all")]).default(false),
  // S-9 图片与上传（Token 用 safeStorage 加密另存，不在这里）
  imageInsertAction: z.enum(["none", "current", "assets", "documentAssets"]).default("none"),
  escapeImageUrls: z.boolean().default(false),
  addDotSlashToRelativeImagePath: z.boolean().default(false),
  uploadMethod: z.enum(["none", "api", "command"]).default("none"),
  uploadUrl: z.string().default(""),
  uploadCommand: z.string().default(""),
  // S-11 导出（O-6）
  pdfPageSize: z.enum(["A4", "A3", "A5", "Letter", "Legal", "Tabloid"]).default("A4"),
  pdfLandscape: z.boolean().default(false),
  /** 页边距（英寸），四边一样 */
  pdfMargin: z.number().min(0).max(2).default(0.6),
  /** 页眉（文档标题）、页脚（页码） */
  pdfHeaderFooter: z.boolean().default(true),
  pdfPrintBackground: z.boolean().default(true),
  /** 按标题生成 PDF 书签 */
  pdfOutline: z.boolean().default(true),
  /** 导出 HTML 时图片：引用（相对导出位置的路径）、嵌入文件 */
  exportImages: z.enum(["reference", "embed"]).default("reference"),
  /** Pandoc 程序的路径（空：从 PATH 里找）、额外参数 */
  pandocPath: z.string().default(""),
  pandocArgs: z.string().default(""),
  /** 导出以后：不做什么、打开文件、打开所在文件夹 */
  afterExport: z.enum(["none", "open", "reveal"]).default("none"),
  // S-10 语言与拼写
  /** 界面语言（L-2）：有哪些语言由应用的翻译文件决定，这里只要求是个语言代码；没有这种翻译时用中文 */
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).default("zh-CN"),
  spellcheckLanguages: z.array(z.string().min(1)).default(["en-US"]),
  // S-12 快捷键：只存改过的（菜单命令 → Electron 写法的快捷键，"" 是不要快捷键）；默认的在 shortcuts.ts
  keyBindings: z.record(z.string().max(80), z.string().max(60)).default({}),
  // S-13 更新
  autoCheckUpdates: z.boolean().default(true),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type ExtensionSettings = Settings["extensions"];

/** 全部默认值 */
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

/** 改设置时给的部分（嵌套的 extensions 也可以只给几项） */
export type SettingsPatch = Partial<Omit<Settings, "extensions">> & { extensions?: Partial<ExtensionSettings> };

/**
 * 每个字段去掉默认值再变成可选。不能直接 .partial()：zod 4 会给可选字段里带默认值的补上默认值，
 * 解析 { fontSize: 20 } 得到的是全部设置，改一项就把别的都恢复成默认了
 */
function optionalFields(shape: Record<string, z.ZodType>): Record<string, z.ZodType> {
  return Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [key, (schema instanceof z.ZodDefault ? (schema.unwrap() as z.ZodType) : schema).optional()]),
  );
}

export const SettingsPatchSchema = z.object({
  ...optionalFields(SettingsSchema.shape),
  extensions: z.object(optionalFields(ExtensionsSchema.shape)).optional(),
}) as unknown as z.ZodType<SettingsPatch>;

/** 读到的设置（可能是旧版本存的、缺字段的、手改坏了的）：能用的留下，缺的、坏的用默认值 */
export function normalizeSettings(stored: unknown): Settings {
  const input = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(SettingsSchema.shape)) {
    const parsed = (schema as z.ZodType).safeParse(input[key]);
    result[key] = parsed.success ? parsed.data : DEFAULT_SETTINGS[key as keyof Settings];
  }
  return result as Settings;
}

/** 把部分设置合并进来（extensions 按项合并） */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  return normalizeSettings({ ...current, ...patch, extensions: { ...current.extensions, ...patch.extensions } });
}

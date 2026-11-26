// 对外的类型（K-1）：和旧版库导出的完全相同，按现在的写法引用的代码不用改。
// 编辑器内部的设置（@marko/editor 的 EditorSettings）由 settings.ts 从这里换算

export type ThemeName = "solo" | "dark";

export type LineEnding = "auto" | "lf" | "crlf";

export type EmojiAutocompleteMode = "automatic" | "escape" | "off";

export type DefaultCodeLanguageApplyTo = "markdown" | "menu" | "both";

export type ImageInsertAction = "none" | "current" | "assets" | "documentAssets";

export type LocalMediaKind = "image" | "video" | "audio";

export type MathAutoNumbering = false | "ams" | "all";

export type SidebarTab = "files" | "outline" | "search";

/** 大纲的一项：line 从 1 数起 */
export interface OutlineItem {
  id: string;
  title: string;
  level: number;
  line: number;
}

export interface MarkdownExtensionSettings {
  html: boolean;
  toc: boolean;
  mermaid: boolean;
  flowchart: boolean;
  sequence: boolean;
  math: boolean;
  footnote: boolean;
  alerts: boolean;
  emoji: boolean;
  /** 旧的总开关：同时打开高亮、上标、下标（单独的开关没给时） */
  marks: boolean;
  highlight: boolean;
  superscript: boolean;
  subscript: boolean;
  autoLinks: boolean;
}

export interface EditorSettings {
  theme: ThemeName;
  fontSize: number;
  lineWidth: number;
  zoom: number;
  autoSave: boolean;
  autoSaveIntervalMinutes: number;
  saveOnFileSwitch: boolean;
  recoverUnsavedDrafts: boolean;
  recordRecentFiles: boolean;
  showStatusBar: boolean;
  alwaysShowWordCount: boolean;
  defaultSidebarTab: SidebarTab;
  collapsibleOutline: boolean;
  readingSpeed: number;
  defaultLineEnding: LineEnding;
  insertFinalNewline: boolean;
  spellcheck: boolean;
  sourceMode: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  typewriterCenter: boolean;
  indentSize: number;
  codeIndentSize: number;
  shiftTabAutoIndent: boolean;
  autoPair: boolean;
  emojiAutocomplete: EmojiAutocompleteMode;
  copyMarkdownAsPlainText: boolean;
  preserveSingleLineBreaks: boolean;
  smartPunctuation: boolean;
  smartQuotes: boolean;
  smartDashes: boolean;
  /**
   * 命令的快捷键（命令名 → 键，写法同 ProseMirror：Mod-b、Mod-Shift-k；null 表示编辑器不处理，交给宿主的菜单）。
   * 不给的用默认的（同 Typora）
   */
  keyBindings?: Readonly<Record<string, string | null>>;
  autoNumberingForMath: MathAutoNumbering;
  codeLineNumbers: boolean;
  codeWrap: boolean;
  defaultCodeLanguage: string;
  defaultCodeLanguageApplyTo: DefaultCodeLanguageApplyTo;
  imageInsertAction: ImageInsertAction;
  escapeImageUrls: boolean;
  addDotSlashToRelativeImagePath: boolean;
  uploadUrl: string;
  uploadToken: string;
  extensions: MarkdownExtensionSettings;
}

export interface ImagePayload {
  name: string;
  dataUrl: string;
}

/** 编辑器要插入图片、音视频时发出的请求（imageData 事件）：宿主保存以后用 replaceImagePlaceholder 换上地址 */
export type ImageInsertRequest = (
  | ImagePayload
  | { name: string; file: File }
) & { placeholder?: string; kind?: LocalMediaKind; prefix?: string };

export interface MarkoMarkdownBodyHandle {
  /** 把 imageData 请求里的占位换成地址；source 为 null 表示不插入了。返回有没有找到这个占位 */
  replaceImagePlaceholder: (placeholder: string, source: string | null, alt?: string) => boolean;
  focus: () => void;
  refreshLayout: () => void;
}

/** 资源的种类（宿主解析地址时用） */
export type ResourceKind = "image" | "link" | "media";

/**
 * 外部能力（K-2，组件的 host 属性，可选）：结构同 @marko/editor 的 EditorHost。
 * 不给的那几项用默认的：链接、图片发事件（openAnchor、imageData）给宿主处理，图表只显示源码
 */
/**
 * 组件里的文字（K-2「界面文字」）：宿主按界面语言给（host.texts），不给、给了一部分时其余的用中文。
 * 前几项是命令插进文档里的占位（同 @marko/editor 的 EditorTexts）
 */
export interface MarkoEditorTexts {
  /** 新表格的表头：第 n 列（从 1 开始） */
  tableColumn: (n: number) => string;
  tableCell: string;
  newColumn: string;
  linkText: string;
  imageAlt: string;
  commentText: string;
  footnote: string;
  frontMatterTitle: string;
  diagramStart: string;
  diagramEnd: string;
  /** 粘贴、拖进来的媒体没有插入 */
  insertFailed: (kind: LocalMediaKind, name: string, reason: string) => string;
  diagramUnsupported: (kind: string) => string;
  /** 代码块语言输入框的提示 */
  codeLanguage: string;
  ok: string;
  cancel: string;
  /**
   * 表格工具条、插入表格的小窗口。
   * deleteRowShort、deleteColumnShort 是旧版工具条按钮上的字，工具条照 Typora 改成图标和「更多操作」以后不再用；对外接口不变（K-1），留着
   */
  table: {
    insert: string;
    columns: string;
    rows: string;
    more: string;
    alignLeft: string;
    alignCenter: string;
    alignRight: string;
    addRowAbove: string;
    addRowBelow: string;
    addColumnLeft: string;
    addColumnRight: string;
    deleteRow: string;
    deleteRowShort: string;
    deleteColumn: string;
    deleteColumnShort: string;
    moveRowUp: string;
    moveRowDown: string;
    moveColumnLeft: string;
    moveColumnRight: string;
    selectRow: string;
    selectColumn: string;
    selectTable: string;
    deleteTable: string;
  };
  /** 图片、图表查看器的按钮 */
  viewer: {
    zoomOut: string;
    zoomIn: string;
    actualSize: string;
  };
}

/** host.texts：每一项都可以不给；表格、查看器两组里也可以只给几条 */
export type MarkoEditorTextsInput = {
  [K in keyof MarkoEditorTexts]?: MarkoEditorTexts[K] extends (...args: never[]) => unknown
    ? MarkoEditorTexts[K]
    : MarkoEditorTexts[K] extends object
      ? Partial<MarkoEditorTexts[K]>
      : MarkoEditorTexts[K];
};

export interface MarkoEditorHost {
  /** 文档里写的地址（相对路径按文档所在的目录）→ 页面里能加载的地址 */
  resolveUrl(url: string, kind: ResourceKind): string;
  /** 打开链接 */
  openLink(url: string): void;
  /** 保存粘贴、拖进来的图片，返回写进 Markdown 的地址（可以连同替代文字）；null 表示不插入了 */
  saveImage(file: Blob, name: string): Promise<string | { url: string; alt?: string } | null>;
  /** 在隔离的沙箱里画图表，返回过滤过的 SVG */
  renderDiagram?(kind: string, source: string): Promise<{ svg: string } | { error: string }>;
  /** 提示用户出了问题 */
  reportError?(message: string): void;
  /** 组件里的文字（按界面语言）；读的时候现取，宿主可以给 getter，换语言后组件跟着变 */
  texts?: MarkoEditorTextsInput;
}

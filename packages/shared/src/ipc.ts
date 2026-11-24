// 主进程接口的通道名和 window.marko 的类型（1.9 节）。每个方法对应一个 ipcMain.handle 通道 `marko:<模块>.<动作>`；
// 参数用这里的 zod schema 校验，不过关直接拒绝。会失败的方法统一返回 Result：{ ok: true, value } 或 { ok: false, error }
import { z } from "zod";
import type { MarkoError } from "./errors.ts";
import type { Settings, SettingsPatch } from "./settings.ts";

/** 通道名：`marko:<模块>.<动作>` */
export function channel<Module extends string, Action extends string>(
  module: Module,
  action: Action,
): `marko:${Module}.${Action}` {
  return `marko:${module}.${action}`;
}

export const CHANNELS = {
  appVersion: channel("app", "version"),
  appPlatform: channel("app", "platform"),
  filePickAndOpen: channel("file", "pickAndOpen"),
  fileOpen: channel("file", "open"),
  fileOpenLink: channel("file", "openLink"),
  fileOpenDropped: channel("file", "openDropped"),
  workspaceOpenContaining: channel("workspace", "openContaining"),
  workspaceClose: channel("workspace", "close"),
  fileOpenHere: channel("file", "openHere"),
  fileRead: channel("file", "read"),
  fileSave: channel("file", "save"),
  fileSaveAs: channel("file", "saveAs"),
  windowSetDocumentState: channel("window", "setDocumentState"),
  windowNew: channel("window", "newWindow"),
  windowClose: channel("window", "close"),
  windowCancelClose: channel("window", "cancelClose"),
  windowInitialDocument: channel("window", "initialDocument"),
  windowInitialDraft: channel("window", "initialDraft"),
  windowInitialState: channel("window", "initialState"),
  windowSetLayout: channel("window", "setLayout"),
  draftSave: channel("draft", "save"),
  draftRemove: channel("draft", "remove"),
  settingsGet: channel("settings", "get"),
  settingsSet: channel("settings", "set"),
  recentList: channel("recent", "list"),
  recentRemove: channel("recent", "remove"),
  recentClear: channel("recent", "clear"),
  shellOpenExternal: channel("shell", "openExternal"),
  shellShowItemInFolder: channel("shell", "showItemInFolder"),
  shellOpenFolder: channel("shell", "openFolder"),
  shellCopyText: channel("shell", "copyText"),
  spellcheckWords: channel("spellcheck", "words"),
  spellcheckRemoveWord: channel("spellcheck", "removeWord"),
  menuPopup: channel("menu", "popup"),
  themesList: channel("themes", "list"),
  themesOpenFolder: channel("themes", "openFolder"),
  themesExportCss: channel("themes", "exportCss"),
  updateInstall: channel("update", "install"),
  fileCreate: channel("file", "create"),
  fileCreateFolder: channel("file", "createFolder"),
  fileRename: channel("file", "rename"),
  fileTrash: channel("file", "trash"),
  workspacePickAndOpen: channel("workspace", "pickAndOpen"),
  workspaceOpen: channel("workspace", "open"),
  workspaceList: channel("workspace", "list"),
  mediaPick: channel("media", "pick"),
  mediaSave: channel("media", "save"),
  mediaAllowDropped: channel("media", "allowDropped"),
  exportRun: channel("export", "run"),
  exportLast: channel("export", "last"),
  exportPrint: channel("export", "print"),
  importRun: channel("import", "run"),
  uploadSetToken: channel("upload", "setToken"),
  uploadHasToken: channel("upload", "hasToken"),
  searchStart: channel("search", "start"),
  searchCancel: channel("search", "cancel"),
} as const;

/** 主进程 → 渲染进程的事件（1.9 节的第二张表） */
export const EVENTS = {
  menuCommand: "marko:menu.command",
  closeRequested: "marko:window.closeRequested",
  openFile: "marko:open.file",
  settingsChanged: "marko:settings.changed",
  workspaceChanged: "marko:workspace.changed",
  searchResults: "marko:search.results",
  searchDone: "marko:search.done",
  fileChanged: "marko:file.changed",
  fileRenamed: "marko:file.renamed",
  themesChanged: "marko:themes.changed",
  updateStatus: "marko:update.status",
  jumpToAnchor: "marko:document.jumpToAnchor",
} as const;

export type Platform = "win32" | "darwin" | "linux";

export type Result<T> = { ok: true; value: T } | { ok: false; error: MarkoError };

// ---------------------------------------------------------------------------
// 文档（F 章）

/** 读进来的文档 */
export interface OpenedDocument {
  path: string;
  /** 解码后的文字。UTF-8 带 BOM 的文件，开头的 ﻿ 留在文字里（编辑器按它记下 BOM，保存时写回） */
  content: string;
  /** 文件的编码（F-18），保存时沿用 */
  encoding: string;
  /** 不是 UTF-8 的编码（UTF-16）开头有没有 BOM */
  bom: boolean;
  /** 磁盘上内容的指纹：保存前比对，不一样就是被别的程序改过（F-6） */
  hash: string;
  /** 识别不出编码，按 UTF-8 读的（F-18：状态栏提示，可以换编码重新打开） */
  uncertainEncoding?: boolean;
  /** N-4：从带 #标题 的本地链接打开的：载入后跳到这个标题（解码后的锚点） */
  anchor?: string;
}

/** 「以其他编码重新打开」的编码（F-18）：iconv-lite 的名字 */
export const REOPEN_ENCODINGS = ["utf-8", "utf-16le", "utf-16be", "gb18030", "big5", "shift_jis", "euc-jp", "euc-kr", "windows-1252", "iso-8859-1", "windows-1251", "koi8-r"] as const;

export interface SaveRequest {
  path: string;
  content: string;
  encoding: string;
  bom: boolean;
  /** 打开时（或上次保存时）磁盘上内容的指纹；null 表示不比对（冲突时选了覆盖） */
  expectedHash: string | null;
}

export interface SaveAsRequest {
  content: string;
  encoding: string;
  bom: boolean;
  /** 建议的文件名（新文档取第一个标题，F-7） */
  suggestedName: string;
  /** 默认目录：当前文件所在目录（没有时主进程用工作区目录、文档目录） */
  defaultPath: string | null;
}

export interface SavedFile {
  path: string;
  hash: string;
  /** 保存时改写了的地址（F-19：导入的图片复制到文档旁边以后，原样 → 相对路径）；渲染进程照着改编辑器里的内容 */
  replaced?: Array<{ from: string; to: string }>;
}

/**
 * file.open、file.openHere 的结果（F-3 选窗口的规则）：在这个窗口打开（带上内容）；在别的窗口里打开了、切过去了；
 * 这个窗口里本来就是这个文件（只有 openHere）
 */
export type OpenTarget = { target: "here"; document: OpenedDocument } | { target: "elsewhere" } | { target: "current" };

/** 窗口里的文档状态：标题栏（F-17）、选窗口的规则（F-3：没改过的空白新文档可以直接用） */
export interface DocumentState {
  path: string | null;
  title: string;
  edited: boolean;
  /** 没改过的空白新文档 */
  pristine: boolean;
  /** 磁盘上内容的指纹（打开、上次保存时的；新文档、文件被删了是 null）：主进程按它判断文件是不是被别的程序改了（F-12） */
  hash: string | null;
}

/**
 * 自动更新（R-4）告诉窗口的：下载好了（重启以更新）；手动检查的结果——有新版本（正在后台下载）、已经是最新的、出错了、这个版本不检查更新
 */
export interface UpdateStatus {
  kind: "downloaded" | "available" | "none" | "error" | "disabled";
  version: string;
  message?: string;
}

/** 主题（A-1、A-3）：内置的和用户主题目录里的；user.css 有没有（加在任何主题后面）；version 是主题文件变了几次 */
export interface ThemeInfo {
  /** 内置的是 solo、dark；用户主题是 user:<文件名> */
  id: string;
  name: string;
  builtIn: boolean;
}

export interface ThemeList {
  themes: ThemeInfo[];
  userCss: boolean;
  version: number;
}

/** 渲染进程给的右键菜单项（W-6）：主进程弹原生菜单，交回选了的 id */
export type PopupItem = { type?: "item"; id: string; label: string; enabled?: boolean } | { type: "separator" };

/** 窗口的侧栏（W-7）：显示与否、宽度、页签、文件的看法；会话恢复（F-16）时放回去，新窗口沿用上一次的 */
export interface WindowLayout {
  sidebarVisible: boolean;
  sidebarWidth: number;
  sidebarTab: "files" | "outline" | "search";
  fileView: "tree" | "list";
}

/** 新窗口开始时的状态（F-16 恢复的、从别的窗口开的）：工作区、侧栏 */
export interface WindowInitialState {
  workspace: string | null;
  layout: WindowLayout | null;
}

/** 打开的文件被别的程序改了（F-12） */
export interface FileChange {
  path: string;
  /** 文件被删除、改名了 */
  deleted: boolean;
  /** 磁盘上现在的指纹（删了是 null）：选「保留我的改动」时记下它，之后保存覆盖 */
  hash: string | null;
}

/** 草稿（F-9、1.8 节）：渲染进程停止输入 1 秒后发给主进程 */
export interface DraftSaveRequest {
  /** 这个窗口的草稿编号（渲染进程生成） */
  id: string;
  path: string | null;
  content: string;
  encoding: string;
  bom: boolean;
  /** 原文件打开、上次保存时的指纹：恢复时比对，看原文件这期间有没有被改过 */
  hash: string | null;
}

/** 异常退出以后再启动时恢复的草稿（F-9） */
export interface RecoveredDraft {
  id: string;
  path: string | null;
  content: string;
  encoding: string;
  bom: boolean;
  /** 磁盘上现在的版本（原文件还在时） */
  disk: OpenedDocument | null;
  /** 原文件在这期间被改过（和草稿记下的指纹不一样） */
  diskChanged: boolean;
  /** 导入（F-19）的新文档：同样作为没保存的内容放进新窗口，提示「已导入「<原文件名>」」 */
  importedFrom?: string;
}

/** 拖到窗口上的文件打开的结果（F-15）：文件夹作为工作区打开了；第一个文档按 F-3 打开在哪里 */
export interface DroppedResult {
  workspace: Workspace | null;
  document: OpenTarget | null;
}

/** 工作区里的一项（W-2）：文件夹（带子项）或 Markdown 文件 */
export interface WorkspaceEntry {
  name: string;
  path: string;
  kind: "folder" | "file";
  children?: WorkspaceEntry[];
}

export interface Workspace {
  root: string;
  entries: WorkspaceEntry[];
  /** 文件太多，只列了前面一部分 */
  truncated: boolean;
}

export interface RecentFile {
  path: string;
  /** 最后打开的时间（毫秒） */
  openedAt: number;
}

// ---------------------------------------------------------------------------
// 插入本地媒体（M-2、M-3、M-7）

export interface MediaSaveRequest {
  /** 文档的路径：复制到它旁边，地址相对它。新文档是 null：只有不用复制时（「无特殊操作」引用原文件）才行，否则先保存（M-3） */
  documentPath: string | null;
  /** 原文件（拖进来的、「插入本地图片...」选的） */
  sourcePath?: string;
  /** 没有原文件时（粘贴的图片）：内容 */
  data?: Uint8Array;
  /** 文件名（粘贴的图片按时间重新起名） */
  name: string;
}

export interface SavedMedia {
  /** 写进 Markdown 的地址（按 S-9 转义、加 ./；上传了是网址） */
  url: string;
}

// ---------------------------------------------------------------------------
// 导出、打印（O 章）、导入（F-19）

/** html：自包含的 HTML；htmlPlain：不含样式；pdf、png（长图）用 HTML 排版；其余由 Pandoc 从 Markdown 原文转换（O-4） */
export const EXPORT_FORMATS = ["html", "htmlPlain", "pdf", "png", "docx", "odt", "rtf", "epub", "latex", "rst", "mediawiki"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** 要用渲染好的 HTML 的格式；其余要 Markdown 原文 */
export function exportUsesHtml(format: ExportFormat): boolean {
  return format === "html" || format === "htmlPlain" || format === "pdf" || format === "png";
}

export interface ExportRequest {
  format: ExportFormat;
  /** 文档标题：建议的文件名、HTML 的 <title>、PDF 的页眉 */
  title: string;
  documentPath: string | null;
  /** 渲染好的 HTML（exportUsesHtml 的格式）：本地媒体是 file:// 绝对地址，主进程按导出的位置换成相对路径或嵌入 */
  html?: string;
  /** Markdown 原文（Pandoc 的格式）；图表已经换成了引用 images 里的图（O-4） */
  markdown?: string;
  /** O-4：图表的 SVG，Markdown 里按名字引用；主进程截成 PNG，放到 Pandoc 找得到的地方 */
  diagrams?: DiagramSvg[];
  /** 按上次的设置导出（O-7）：直接写到这里，不弹对话框 */
  path?: string;
}

/** O-4：要截成图片的图表（名字是 marko-diagram-<随机串>-<序号>.png；大小是显示的 CSS 像素） */
export interface DiagramSvg {
  name: string;
  svg: string;
  width: number;
  height: number;
}

export interface ExportResult {
  path: string;
}

/** 这个文档上次导出的格式和位置（O-7） */
export interface LastExport {
  format: ExportFormat;
  path: string;
}

// ---------------------------------------------------------------------------
// 全局搜索（W-5）：主进程调 ripgrep，结果按文件分批推送（search.results），搜完、出错、取消时推 search.done

export interface SearchRequest {
  /** 渲染进程给的编号：结果、结束事件带着它，新的搜索开始后旧编号的结果不再要 */
  id: number;
  /** 工作区目录 */
  root: string;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export interface SearchMatch {
  /** 行号（从 1 开始） */
  line: number;
  /** 第一个匹配在这一行里的位置（字符，从 0 开始）和长度：点结果时选中它 */
  column: number;
  length: number;
  /** 显示的片段：这一行（太长时截取匹配附近，前后加省略号） */
  preview: string;
  /** 片段里要高亮的范围（字符偏移） */
  ranges: Array<[number, number]>;
}

export interface SearchFileResult {
  path: string;
  matches: SearchMatch[];
  /** 这个文件匹配的行太多，只列了前面的（W-5：一个文件最多 200 行） */
  truncated?: boolean;
}

export interface SearchResults {
  id: number;
  files: SearchFileResult[];
}

export interface SearchDone {
  id: number;
  /** 匹配太多，后面的没有列（只列前面的） */
  truncated: boolean;
  /** 出错（如正则写错了）时的说明 */
  error?: string;
}

// ---------------------------------------------------------------------------
// 参数校验（主进程用）

const Path = z.string().min(1).max(32_767);
const Encoding = z.string().min(1).max(40);
const Hash = z.string().min(1).max(128);
/** 草稿编号：渲染进程用 crypto.randomUUID() 生成；限定字符，拼进文件名也安全 */
const DraftId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

export const SCHEMAS = {
  path: Path,
  encoding: Encoding,
  /** 拖到窗口上的文件（F-15）：最多 50 个 */
  droppedPaths: z.array(Path).min(1).max(50),
  save: z.object({ path: Path, content: z.string(), encoding: Encoding, bom: z.boolean(), expectedHash: z.string().nullable() }),
  saveAs: z.object({ content: z.string(), encoding: Encoding, bom: z.boolean(), suggestedName: z.string().max(255), defaultPath: Path.nullable() }),
  documentState: z.object({ path: Path.nullable(), title: z.string().max(1_000), edited: z.boolean(), pristine: z.boolean(), hash: Hash.nullable() }),
  draft: z.object({ id: DraftId, path: Path.nullable(), content: z.string(), encoding: Encoding, bom: z.boolean(), hash: Hash.nullable() }),
  draftId: DraftId,
  /** 草稿目录里 <id>.json 的内容（主进程写、启动时读回来校验） */
  draftMeta: z.object({ id: DraftId, path: Path.nullable(), encoding: Encoding, bom: z.boolean(), hash: Hash.nullable(), savedAt: z.number() }),
  url: z.string().url().max(8_192),
  search: z.object({
    id: z.number().int().nonnegative(),
    root: Path,
    query: z.string().min(1).max(1_000),
    caseSensitive: z.boolean(),
    wholeWord: z.boolean(),
    regexp: z.boolean(),
  }),
  searchId: z.number().int().nonnegative(),
  uploadToken: z.string().max(4_096).nullable(),
  exportRequest: z.object({
    format: z.enum(EXPORT_FORMATS),
    title: z.string().max(255),
    documentPath: Path.nullable(),
    html: z.string().optional(),
    markdown: z.string().optional(),
    diagrams: z
      .array(
        z.object({
          name: z.string().regex(/^marko-diagram-[\w-]{1,64}-\d{1,4}\.png$/),
          svg: z.string().max(10_000_000),
          width: z.number().int().min(1).max(8_000),
          height: z.number().int().min(1).max(8_000),
        }),
      )
      .max(1_000)
      .optional(),
    path: Path.optional(),
  }),
  printHtml: z.string(),
  popupItems: z
    .array(
      z.union([
        z.object({ type: z.literal("separator") }),
        z.object({ type: z.literal("item").optional(), id: z.string().min(1).max(100), label: z.string().min(1).max(200), enabled: z.boolean().optional() }),
      ]),
    )
    .max(60),
  /** 新建、改名时的名字：一个文件名，不能带路径 */
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((name) => !/[<>:"/\\|?*\u0000-\u001f]/.test(name) && name !== "." && name !== "..", "名字里不能有路径或特殊字符"),
  copyText: z.string().max(100_000),
  /** 主题目录里的样式文件名（A-3 导出时内嵌） */
  themeFile: z.string().min(1).max(255),
  /** 用户词典里的一个词（S-10） */
  dictionaryWord: z.string().min(1).max(200),
  layout: z.object({
    sidebarVisible: z.boolean(),
    sidebarWidth: z.number().int().min(120).max(1_000),
    sidebarTab: z.enum(["files", "outline", "search"]),
    fileView: z.enum(["tree", "list"]),
  }),
  anchor: z.string().max(1_000),
  mediaSave: z.object({
    documentPath: Path.nullable(),
    sourcePath: Path.optional(),
    data: z.instanceof(Uint8Array).optional(),
    name: z.string().min(1).max(255),
  }),
} as const;

// ---------------------------------------------------------------------------

/** 菜单命令（menu.command 事件的内容）：编辑器命令的名字，或应用自己的动作 */
export interface MenuCommand {
  id: string;
  /** 带参数的命令（如「打开最近」带路径） */
  argument?: string;
}

export interface MarkoEvents {
  [EVENTS.menuCommand]: MenuCommand;
  [EVENTS.closeRequested]: { reason: "close" | "quit" };
  [EVENTS.openFile]: OpenedDocument;
  [EVENTS.settingsChanged]: Settings;
  /** 工作区里有文件增删改（W-2）：重新列 */
  [EVENTS.workspaceChanged]: { root: string };
  [EVENTS.searchResults]: SearchResults;
  [EVENTS.searchDone]: SearchDone;
  [EVENTS.fileChanged]: FileChange;
  /** 打开着的文件在侧栏里被改名了（F-13）：窗口跟着编辑新路径 */
  [EVENTS.fileRenamed]: { from: string; to: string };
  /** 用户主题目录里的文件变了（A-3）：重新列、重新加载 */
  [EVENTS.themesChanged]: ThemeList;
  /** 自动更新（R-4） */
  [EVENTS.updateStatus]: UpdateStatus;
  /** N-4：本地链接指向这个窗口里的文档、带 #标题：跳过去（解码后的锚点） */
  [EVENTS.jumpToAnchor]: string;
}

/** 预加载脚本暴露给渲染进程的接口（window.marko） */
export interface MarkoApi {
  app: {
    version(): Promise<string>;
    platform(): Promise<Platform>;
  };
  file: {
    /** 选文件（F-3）；取消时 value 是 null */
    pickAndOpen(): Promise<Result<OpenTarget | null>>;
    /** 按 F-3 的规则打开这个文件（最近文件、快速打开、拖放） */
    open(path: string): Promise<Result<OpenTarget>>;
    /**
     * N-4：文档里的本地链接（绝对路径，anchor 是解码后的 #标题）。用户点的链接不受打开过的范围限制，但只认 Markdown 文件：
     * 按 F-3 打开（再跳到标题；就是这个窗口里的文档时返回 current，自己跳）。文件夹用系统的文件管理器打开；
     * 别的文件主进程先问一句，再用系统默认的程序打开——这两种、取消了都返回 null
     */
    openLink(path: string, anchor?: string): Promise<Result<OpenTarget | null>>;
    /** 拖到窗口上的文件（F-15）：文件夹作为工作区打开，Markdown 文件按 F-3 打开（路径由预加载脚本从系统给的文件取，网页伪造不了） */
    openDropped(files: File[]): Promise<Result<DroppedResult>>;
    /**
     * 在这个窗口里换成这个文件（侧栏的文件树、文件列表、搜索结果；F-8、F-10 的「在同一窗口里打开别的文件」）：
     * 已经在别的窗口里打开时切过去（elsewhere），这个窗口里就是它时是 current，否则读进来（here，由渲染进程先处理没保存的改动再换）
     */
    openHere(path: string): Promise<Result<OpenTarget>>;
    /** encoding：按这个编码读（F-18 以其他编码重新打开）；不给时识别 */
    read(path: string, encoding?: string): Promise<Result<OpenedDocument>>;
    save(request: SaveRequest): Promise<Result<SavedFile>>;
    /** 取消时 value 是 null */
    saveAs(request: SaveAsRequest): Promise<Result<SavedFile | null>>;
  };
  window: {
    setDocumentState(state: DocumentState): Promise<void>;
    newWindow(): Promise<void>;
    /** 未保存确认（F-10）通过了：关掉这个窗口 */
    close(): Promise<void>;
    /** 未保存确认里选了「取消」：不关（退出时整个退出也取消） */
    cancelClose(): Promise<void>;
    /** 新窗口要显示的文档（按 F-3 的规则在新窗口里打开的、命令行带的）；空白窗口是 null */
    initialDocument(): Promise<OpenedDocument | null>;
    /** 新窗口要恢复的草稿（F-9：异常退出以后再启动时按草稿开的窗口）；没有是 null */
    initialDraft(): Promise<RecoveredDraft | null>;
    /** 新窗口开始时的工作区、侧栏（F-16、W-7） */
    initialState(): Promise<WindowInitialState>;
    /** 侧栏变了（W-7）：主进程记下，下次启动恢复、新窗口沿用 */
    setLayout(layout: WindowLayout): Promise<void>;
  };
  draft: {
    /** 写草稿（F-9）；S-3「恢复未保存的草稿」关着时不调 */
    save(request: DraftSaveRequest): Promise<void>;
    /** 正常保存、选了「不保存」、换了文件以后删掉 */
    remove(id: string): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: SettingsPatch): Promise<Settings>;
  };
  recent: {
    list(): Promise<RecentFile[]>;
    remove(path: string): Promise<RecentFile[]>;
    clear(): Promise<void>;
  };
  shell: {
    openExternal(url: string): Promise<Result<void>>;
    showItemInFolder(path: string): Promise<void>;
    /** 在资源管理器（访达）里打开这个文件夹；给的是文件时打开它所在的文件夹（W-6、F-13） */
    openFolder(path: string): Promise<void>;
    /** 复制名称、路径、Markdown 链接（W-6） */
    copyText(text: string): Promise<void>;
  };
  menu: {
    /** 弹原生右键菜单（W-6），返回选了的 id；没选是 null */
    popup(items: PopupItem[]): Promise<string | null>;
  };
  update: {
    /** 重启以更新（R-4：新版本下载好以后） */
    install(): Promise<void>;
  };
  spellcheck: {
    /** 用户词典（S-10）：右键菜单里「加入词典」加进来的词 */
    words(): Promise<string[]>;
    /** 从用户词典里删掉；删掉了返回 true */
    removeWord(word: string): Promise<boolean>;
  };
  themes: {
    /** 内置主题和用户主题目录里的（A-3） */
    list(): Promise<ThemeList>;
    openFolder(): Promise<void>;
    /** 导出用的主题样式（A-3）：@import 展开、字体图片转成 data URI */
    exportCss(file: string): Promise<Result<string>>;
  };
  files: {
    /** 在文件夹里新建空的 Markdown 文件（W-6），返回路径 */
    create(directory: string, name: string): Promise<Result<string>>;
    createFolder(directory: string, name: string): Promise<Result<string>>;
    /** 改名（F-13：同一个文件夹里改名，打开着它的窗口跟着改路径，最近文件跟着改），返回新路径 */
    rename(path: string, name: string): Promise<Result<string>>;
    /** 移到回收站（W-6）；打开着的文件按 F-12「被删除」处理 */
    trash(path: string): Promise<Result<void>>;
  };
  workspace: {
    /** 选文件夹作为这个窗口的工作区（W-1）；取消时 value 是 null */
    pickAndOpen(): Promise<Result<Workspace | null>>;
    /** 打开这个文件夹作为工作区（恢复上次的、拖进来的、从别的窗口沿用的） */
    open(root: string): Promise<Result<Workspace>>;
    /** 重新列（收到 workspace.changed、手动刷新） */
    list(root: string): Promise<Result<Workspace>>;
    /** W-1「打开所在文件夹为工作区」：这个窗口打开的文件所在的文件夹（主进程按窗口记着的路径）；新文档是 null */
    openContaining(): Promise<Result<Workspace | null>>;
    /** W-1「关闭工作区文件夹」：不再监听，新窗口也不沿用 */
    close(): Promise<void>;
  };
  media: {
    /** 「插入本地图片...」选文件（图片、视频、音频）；取消时是空数组 */
    pick(): Promise<string[]>;
    /** 按 S-9「插入本地媒体时」复制（或上传，M-4），返回写进 Markdown 的地址 */
    save(request: MediaSaveRequest): Promise<Result<SavedMedia>>;
    /**
     * 拖进来、粘贴的文件在磁盘上的路径（预加载脚本里用 webUtils）；剪贴板里的截图这类没有路径，是空串。
     * 同时告诉主进程这是用户给的（X-1：save 的 sourcePath 只收选的、拖进来的、粘贴的）
     */
    pathOf(file: File): Promise<string>;
  };
  export: {
    /** 导出（O 章）：选位置（O-7 给了 path 时不选）、按格式写出；取消时 value 是 null */
    run(request: ExportRequest): Promise<Result<ExportResult | null>>;
    /** 这个文档上次导出的格式和位置（O-7）；没导出过是 null */
    last(documentPath: string): Promise<LastExport | null>;
    /** 打印（O-5）：渲染好的 HTML 在后台排版，弹系统的打印对话框 */
    print(html: string): Promise<Result<void>>;
  };
  import: {
    /** 导入（F-19）：选文件，Pandoc 转成 Markdown，在新窗口里作为新文档打开；取消时 value 是 false */
    run(): Promise<Result<boolean>>;
  };
  upload: {
    /** 上传 Token（M-4）：主进程加密保存；null、空串是清掉 */
    setToken(token: string | null): Promise<Result<void>>;
    /** 设置页只显示「已填」，拿不到明文 */
    hasToken(): Promise<boolean>;
  };
  search: {
    /** 开始搜（W-5），这个窗口上一次的搜索先停掉；结果经 search.results、search.done 事件推回来 */
    start(request: SearchRequest): Promise<Result<void>>;
    cancel(id: number): Promise<void>;
  };
  /** 订阅主进程的事件，返回取消订阅的函数 */
  on<Name extends keyof MarkoEvents>(event: Name, listener: (payload: MarkoEvents[Name]) => void): () => void;
}

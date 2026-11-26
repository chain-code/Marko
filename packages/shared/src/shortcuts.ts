// S-12：菜单命令和默认的快捷键（Electron 的写法：CmdOrCtrl 在 macOS 上是 Cmd，别处是 Ctrl）。
// 主进程的菜单、偏好设置的「快捷键」、编辑器自己处理的快捷键（editor）都按这张表；用户改过的存在设置的 keyBindings 里（命令 → 快捷键，"" 是不要快捷键）
export type ShortcutGroup = "file" | "edit" | "paragraph" | "format" | "view" | "help";

export interface ShortcutEntry {
  /** 命令（菜单发的 menu.command 的 id） */
  id: string;
  group: ShortcutGroup;
  /** 菜单里这一项的文字（翻译里的路径） */
  label: string;
  /** 跟在文字后面、不翻译的部分（「图表」子菜单里的 Mermaid 这些） */
  detail?: string;
  /** 默认快捷键；macOS 上不同时另写 mac */
  key?: string;
  mac?: string;
  /** 编辑器里对应的命令：编辑区里由编辑器直接处理这个键（不经过菜单），改了快捷键编辑器跟着改 */
  editor?: string;
  /** 不能改：撤销、剪切这类系统的，或者编辑器在这个键上做的不只是这个命令（Alt+↑ 移动行也移动表格的行……） */
  fixed?: true;
  /** 菜单里只显示、不注册成菜单的快捷键（Home、End 这些由编辑区、输入框自己处理的键，X-6） */
  displayOnly?: true;
}

const entry = (group: ShortcutGroup, id: string, label: string, options: Partial<ShortcutEntry> = {}): ShortcutEntry => ({ id, group, label, ...options });
const file = (id: string, label: string, options?: Partial<ShortcutEntry>) => entry("file", id, `menu.file.${label}`, options);
const edit = (id: string, label: string, options?: Partial<ShortcutEntry>) => entry("edit", id, `menu.edit.${label}`, options);
/** 段落、格式菜单的命令就是编辑器的命令（同名） */
const paragraph = (id: string, label: string, key?: string, options?: Partial<ShortcutEntry>) => entry("paragraph", id, `menu.paragraph.${label}`, { key, editor: id, ...options });
const format = (id: string, label: string, key?: string, options?: Partial<ShortcutEntry>) => entry("format", id, `menu.format.${label}`, { key, editor: id, ...options });
const view = (id: string, label: string, options?: Partial<ShortcutEntry>) => entry("view", id, `menu.view.${label}`, options);

export const SHORTCUTS: readonly ShortcutEntry[] = [
  // 文件（X-6：顺序、快捷键同 Typora 的菜单）
  file("file.new", "new", { key: "CmdOrCtrl+N" }),
  file("window.new", "newWindow", { key: "CmdOrCtrl+Shift+N" }),
  file("file.open", "open", { key: "CmdOrCtrl+O" }),
  file("workspace.open", "openFolder"),
  file("workspace.openContaining", "openFolderAsWorkspace"),
  file("workspace.refresh", "refreshWorkspace"),
  file("workspace.close", "closeWorkspace"),
  file("file.quickOpen", "quickOpen", { key: "CmdOrCtrl+P" }),
  file("file.showRecent", "showRecent"),
  // 同 Typora：「从磁盘重新加载」没有快捷键
  file("file.reload", "reload"),
  file("file.save", "save", { key: "CmdOrCtrl+S" }),
  file("file.saveAs", "saveAs", { key: "CmdOrCtrl+Shift+S" }),
  file("file.reveal", "reveal"),
  file("view.revealInTree", "revealInSidebar"),
  file("file.trash", "delete"),
  file("file.rename", "rename"),
  file("file.copyPath", "copyPath"),
  file("file.openFolder", "openContainingFolder"),
  file("file.import", "import"),
  file("export.previous", "exportPrevious", { key: "CmdOrCtrl+Shift+E" }),
  file("export.last", "exportOverwrite"),
  file("app.exportSettings", "exportSettings"),
  file("file.print", "print", { key: "Alt+Shift+P" }),
  entry("file", "app.preferences", "menu.app.preferences", { key: "CmdOrCtrl+," }),
  file("window.close", "close", { key: "CmdOrCtrl+W" }),
  file("app.quit", "quit", { key: "Ctrl+Q", mac: "Cmd+Q" }),

  // 编辑
  edit("editor.undo", "undo", { key: "CmdOrCtrl+Z", fixed: true }),
  edit("editor.redo", "redo", { key: "Ctrl+Y", mac: "Cmd+Shift+Z", fixed: true }),
  edit("edit.cut", "cut", { key: "CmdOrCtrl+X", fixed: true }),
  edit("edit.copy", "copy", { key: "CmdOrCtrl+C", fixed: true }),
  edit("edit.paste", "paste", { key: "CmdOrCtrl+V", fixed: true }),
  edit("edit.copyAsText", "copyAsText"),
  // 编辑器自己处理 Ctrl+Shift+C（C-2），焦点不在编辑区时走菜单
  edit("edit.copyAsMarkdown", "copyAsMarkdown", { key: "CmdOrCtrl+Shift+C", fixed: true }),
  edit("edit.copyAsHtml", "copyAsHtml"),
  edit("editor.pastePlainText", "pastePlainText", { key: "CmdOrCtrl+Shift+V", fixed: true }),
  edit("editor.selectAll", "selectAll", { key: "CmdOrCtrl+A", fixed: true }),
  edit("selectParagraph", "selectParagraph", { key: "CmdOrCtrl+Alt+P", editor: "selectParagraph" }),
  // 下面几个键编辑器自己在用（E-7），不能改
  edit("selectLine", "selectLine", { key: "CmdOrCtrl+L", fixed: true }),
  edit("selectStyleScope", "selectStyleScope", { key: "CmdOrCtrl+E", fixed: true }),
  edit("selectWord", "selectWord", { key: "CmdOrCtrl+D", fixed: true }),
  edit("edit.jumpTop", "jumpTop", { key: "Ctrl+Home", mac: "Cmd+Up", fixed: true, displayOnly: true }),
  edit("edit.jumpSelection", "jumpSelection", { key: "CmdOrCtrl+J", fixed: true }),
  edit("edit.jumpBottom", "jumpBottom", { key: "Ctrl+End", mac: "Cmd+Down", fixed: true, displayOnly: true }),
  edit("edit.lineStart", "lineStart", { key: "Home", mac: "Cmd+Left", fixed: true, displayOnly: true }),
  edit("edit.lineEnd", "lineEnd", { key: "End", mac: "Cmd+Right", fixed: true, displayOnly: true }),
  edit("edit.extendTop", "extendTop", { key: "Ctrl+Shift+Home", mac: "Cmd+Shift+Up", fixed: true, displayOnly: true }),
  edit("edit.extendBottom", "extendBottom", { key: "Ctrl+Shift+End", mac: "Cmd+Shift+Down", fixed: true, displayOnly: true }),
  edit("edit.extendLineStart", "extendLineStart", { key: "Shift+Home", mac: "Cmd+Shift+Left", fixed: true, displayOnly: true }),
  edit("edit.extendLineEnd", "extendLineEnd", { key: "Shift+End", mac: "Cmd+Shift+Right", fixed: true, displayOnly: true }),
  // 编辑器在 Alt+↑、Alt+↓ 上做的不只是这个（表格里移动行，T-3），固定
  edit("moveLineUp", "moveLineUp", { key: "Alt+Up", fixed: true }),
  edit("moveLineDown", "moveLineDown", { key: "Alt+Down", fixed: true }),
  edit("duplicateLine", "duplicateLine", { editor: "duplicateLine" }),
  edit("edit.delete", "delete"),
  edit("deleteParagraph", "deleteBlock", { key: "Shift+CmdOrCtrl+Alt+P", editor: "deleteParagraph" }),
  edit("deleteLine", "deleteLine", { key: "Shift+CmdOrCtrl+Alt+L", editor: "deleteLine" }),
  edit("deleteStyleScope", "deleteStyleScope", { key: "Shift+CmdOrCtrl+Alt+E", editor: "deleteStyleScope" }),
  edit("deleteWord", "deleteWord", { key: "CmdOrCtrl+Shift+D", fixed: true }),
  edit("find.open", "find", { key: "CmdOrCtrl+F" }),
  edit("find.next", "findNext", { key: "F3", mac: "Cmd+G" }),
  edit("find.previous", "findPrevious", { key: "Shift+F3", mac: "Cmd+Shift+G" }),
  // macOS 上 Cmd+H 是系统的「隐藏」：同 Typora 用 Cmd+Option+F
  edit("find.replace", "replace", { key: "CmdOrCtrl+H", mac: "Cmd+Alt+F" }),
  // 系统的表情面板：Windows 上 Win+. 是系统自己的键，菜单只显示
  edit("edit.emoji", "emoji", { key: "Super+.", mac: "Ctrl+Cmd+Space", fixed: true, displayOnly: true }),

  // 段落
  ...[1, 2, 3, 4, 5, 6].map((level) => paragraph(`heading${level}`, `heading${level}`, `CmdOrCtrl+${level}`)),
  paragraph("paragraph", "paragraph", "CmdOrCtrl+0"),
  paragraph("increaseHeading", "increaseHeading", "CmdOrCtrl+="),
  paragraph("decreaseHeading", "decreaseHeading", "CmdOrCtrl+-"),
  // Ctrl+T 由编辑器组件在捕获阶段拦下来弹小窗口（T-1）
  entry("paragraph", "table.insert", "menu.paragraph.insertTable", { key: "CmdOrCtrl+T", fixed: true }),
  paragraph("addTableRowAbove", "addRowAbove"),
  // 下面这几个键编辑器做的不只是表格的事（Ctrl+回车、Alt+←→ 移动列……），固定
  paragraph("addTableRowBelow", "addRowBelow", "CmdOrCtrl+Enter", { fixed: true, editor: undefined }),
  paragraph("addTableColumnLeft", "addColumnLeft"),
  paragraph("addTableColumnRight", "addColumnRight"),
  // 同 Typora：表格菜单里的上移、下移行不显示快捷键（Alt+↑、Alt+↓ 是「编辑 → 上移该行、下移该行」的）
  paragraph("moveTableRowUp", "moveRowUp"),
  paragraph("moveTableRowDown", "moveRowDown"),
  paragraph("moveTableColumnLeft", "moveColumnLeft", "Alt+Left", { fixed: true, editor: undefined }),
  paragraph("moveTableColumnRight", "moveColumnRight", "Alt+Right", { fixed: true, editor: undefined }),
  paragraph("deleteTableRow", "deleteRow", "CmdOrCtrl+Shift+Backspace", { fixed: true, editor: undefined }),
  paragraph("deleteTableColumn", "deleteColumn"),
  paragraph("deleteTable", "deleteTable"),
  paragraph("selectTableCell", "selectCell"),
  paragraph("selectTableRow", "selectRow"),
  paragraph("selectTableColumn", "selectColumn"),
  paragraph("selectTable", "selectTable"),
  paragraph("alignLeft", "alignLeft"),
  paragraph("alignCenter", "alignCenter"),
  paragraph("alignRight", "alignRight"),
  paragraph("mathBlock", "mathBlock", "CmdOrCtrl+Shift+M"),
  paragraph("codeBlock", "codeBlock", "CmdOrCtrl+Shift+K"),
  paragraph("blockquote", "blockquote", "CmdOrCtrl+Shift+Q"),
  paragraph("orderedList", "orderedList", "CmdOrCtrl+Shift+["),
  paragraph("bulletList", "bulletList", "CmdOrCtrl+Shift+]"),
  paragraph("taskList", "taskList", "CmdOrCtrl+Shift+X"),
  paragraph("toggleTask", "toggleTask"),
  paragraph("markTaskDone", "markTaskDone"),
  paragraph("markTaskUndone", "markTaskUndone"),
  paragraph("indentLines", "indent", "CmdOrCtrl+]"),
  paragraph("outdentLines", "outdent", "CmdOrCtrl+["),
  paragraph("definitionList", "definitionList"),
  paragraph("insertParagraphAbove", "insertParagraphAbove"),
  paragraph("insertParagraphBelow", "insertParagraphBelow"),
  paragraph("linkReference", "linkReference"),
  paragraph("footnote", "footnote"),
  paragraph("hr", "hr"),
  paragraph("toc", "toc"),
  paragraph("frontMatter", "frontMatter"),
  paragraph("mermaid", "diagram", undefined, { detail: "Mermaid" }),
  paragraph("flowchart", "diagram", undefined, { detail: "Flowchart" }),
  paragraph("sequence", "diagram", undefined, { detail: "Sequence" }),

  // 格式
  format("bold", "bold", "CmdOrCtrl+B"),
  format("italic", "italic", "CmdOrCtrl+I"),
  format("underline", "underline", "CmdOrCtrl+U"),
  format("inlineCode", "inlineCode", "CmdOrCtrl+Shift+`"),
  format("inlineMath", "inlineMath"),
  format("strike", "strike", "Alt+Shift+5"),
  format("highlight", "highlight"),
  format("superscript", "superscript"),
  format("subscript", "subscript"),
  // 同 Typora：注释没有快捷键
  format("comment", "comment"),
  format("link", "link", "CmdOrCtrl+K"),
  // 打开链接是应用的事（N-4：本地文件按 F-3 打开），编辑器不处理这个键；Ctrl+Shift+O 是 Marko 的
  format("editor.openLink", "openLink", "CmdOrCtrl+Shift+O", { editor: undefined }),
  format("editor.copyLink", "copyLink", undefined, { editor: undefined }),
  format("image", "insertImage", "CmdOrCtrl+Shift+I"),
  format("image.insertLocal", "insertLocalImage", undefined, { editor: undefined }),
  format("image.setWidth", "imageWidth", undefined, { editor: undefined }),
  format("clearFormat", "clearFormat", "CmdOrCtrl+\\"),

  // 视图。源码、专注、打字机模式是应用的状态（存在设置里）：都走菜单，编辑器不处理这几个键
  view("view.sidebar", "sidebar", { key: "CmdOrCtrl+Shift+L" }),
  view("view.outline", "outline", { key: "CmdOrCtrl+Shift+1" }),
  view("view.fileList", "fileList", { key: "CmdOrCtrl+Shift+2" }),
  view("view.fileTree", "fileTree", { key: "CmdOrCtrl+Shift+3" }),
  view("view.search", "search", { key: "CmdOrCtrl+Shift+F" }),
  view("view.sourceMode", "sourceMode", { key: "CmdOrCtrl+/" }),
  view("view.focusMode", "focusMode", { key: "F8" }),
  view("view.typewriterMode", "typewriterMode", { key: "F9" }),
  view("view.statusBar", "statusBar"),
  view("view.wordCount", "wordCount"),
  view("view.fullscreen", "fullscreen", { key: "F11", mac: "Ctrl+Cmd+F" }),
  view("view.alwaysOnTop", "alwaysOnTop"),
  // 同 Typora：实际大小是 Ctrl+Shift+9
  view("view.actualSize", "actualSize", { key: "CmdOrCtrl+Shift+9" }),
  view("view.zoomIn", "zoomIn", { key: "CmdOrCtrl+Shift+=" }),
  view("view.zoomOut", "zoomOut", { key: "CmdOrCtrl+Shift+-" }),
  // 同 Typora 用 Shift+F12：Electron 默认的 Ctrl+Shift+I 和「插入图片」撞了
  view("app.devTools", "devTools", { key: "Shift+F12" }),

  entry("help", "app.about", "menu.help.about"),
];

/**
 * 编辑器自己在用、不能给菜单命令的键（ProseMirror 里固定的：选中行、移动行、Tab……），Electron 的写法；
 * owner：这个键在编辑器里做的就是这个命令（Mod+G 是查找下一个），它自己用不算撞
 */
export const RESERVED_SHORTCUTS: ReadonlyArray<{ key: string; owner?: string }> = [
  { key: "CmdOrCtrl+L", owner: "selectLine" },
  { key: "CmdOrCtrl+D", owner: "selectWord" },
  { key: "CmdOrCtrl+Shift+D", owner: "deleteWord" },
  { key: "CmdOrCtrl+E", owner: "selectStyleScope" },
  { key: "CmdOrCtrl+J", owner: "edit.jumpSelection" },
  { key: "CmdOrCtrl+G", owner: "find.next" },
  { key: "CmdOrCtrl+Shift+G", owner: "find.previous" },
  { key: "CmdOrCtrl+Shift+C", owner: "edit.copyAsMarkdown" },
  { key: "CmdOrCtrl+Shift+Enter" },
  { key: "Alt+Enter" },
  { key: "Shift+Enter" },
  { key: "Tab" },
  { key: "Shift+Tab" },
];

const MODIFIER_ORDER = ["CmdOrCtrl", "Cmd", "Ctrl", "Alt", "Shift"];

/**
 * 同一个快捷键的统一写法（比较是不是撞了用）：按平台把 CmdOrCtrl 换成 Cmd 或 Ctrl、Command 换成 Cmd、Option 换成 Alt，
 * 修饰键排成固定的顺序，字母大写
 */
export function normalizeShortcut(shortcut: string, mac: boolean): string {
  if (!shortcut) return "";
  const parts = shortcut.split("+");
  // 键本身可以是「+」（CmdOrCtrl++ 这种写法不用；Electron 写 Plus）
  const key = parts.pop() ?? "";
  const modifiers = new Set(
    parts.map((part) => {
      const name = part.trim();
      if (name === "CmdOrCtrl" || name === "CommandOrControl") return mac ? "Cmd" : "Ctrl";
      if (name === "Command" || name === "Cmd" || name === "Meta" || name === "Super") return "Cmd";
      if (name === "Control" || name === "Ctrl") return "Ctrl";
      if (name === "Option" || name === "Alt" || name === "AltGr") return "Alt";
      return name;
    }),
  );
  const ordered = MODIFIER_ORDER.filter((name) => modifiers.has(name));
  return [...ordered, key.length === 1 ? key.toUpperCase() : key].join("+");
}

/** 这一项现在的快捷键（改过的用改过的；"" 是不要快捷键；不能改的用默认的） */
export function shortcutOf(item: ShortcutEntry, bindings: Readonly<Record<string, string>>, mac: boolean): string {
  if (!item.fixed && Object.hasOwn(bindings, item.id)) return bindings[item.id] ?? "";
  return (mac ? (item.mac ?? item.key) : item.key) ?? "";
}

export function shortcutEntry(id: string): ShortcutEntry | undefined {
  return SHORTCUTS.find((item) => item.id === id);
}

/** 用了这个快捷键的那一项（自己除外）；编辑器保留的键返回 "reserved" */
export function shortcutConflict(shortcut: string, exceptId: string, bindings: Readonly<Record<string, string>>, mac: boolean): ShortcutEntry | "reserved" | null {
  const wanted = normalizeShortcut(shortcut, mac);
  if (!wanted) return null;
  if (RESERVED_SHORTCUTS.some((reserved) => reserved.owner !== exceptId && normalizeShortcut(reserved.key, mac) === wanted)) return "reserved";
  return SHORTCUTS.find((item) => item.id !== exceptId && normalizeShortcut(shortcutOf(item, bindings, mac), mac) === wanted) ?? null;
}

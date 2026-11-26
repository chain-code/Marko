// 原生应用菜单（X-6：结构、文字、快捷键同 Typora 1.14.17 的 Windows 版）：菜单项发 menu.command 事件给当前窗口，
// 由渲染进程执行（编辑器命令或应用的动作）。撤销、全选、查找这些也发命令，不用 Electron 的 role：role 走的是网页自己的撤销、全选，不经过编辑器。
// 文字都经过 t（L-2）；快捷键按 S-12 的表（@marko/shared 的 SHORTCUTS），用户改过的（设置的 keyBindings）优先。
// 换了界面语言、改了快捷键、设置变了（勾选项）以后重建菜单
import { app, BrowserWindow, clipboard, Menu, type MenuItemConstructorOptions } from "electron";
import { EVENTS, REOPEN_ENCODINGS, shortcutEntry, shortcutOf, type MenuCommand, type Settings } from "@marko/shared";
import type { MessageKey } from "../locales/index.ts";
import { t } from "./i18n.ts";
import { clearRecentFiles, getSettings, recentFiles, setSettings } from "./store.ts";
import { createDocumentWindow } from "./windows.ts";
import { changeZoom, ZOOM_STEP } from "./zoom.ts";
import { openThemesFolder, themeList } from "./themes.ts";
import { checkForUpdatesNow } from "./updater.ts";

const isMac = process.platform === "darwin";

/** 这次建菜单用的快捷键设置（建菜单时读一次） */
let bindings: Readonly<Record<string, string>> = {};

/** 菜单命令现在的快捷键（S-12）；没有快捷键是 undefined */
function accelerator(id: string): string | undefined {
  const entry = shortcutEntry(id);
  return (entry && shortcutOf(entry, bindings, isMac)) || undefined;
}

/** 快捷键只显示、不注册成菜单的（Home、End 这些由编辑区、输入框自己处理，X-6） */
function registers(id: string): boolean {
  return !shortcutEntry(id)?.displayOnly;
}

/** 发给当前窗口（没有窗口时新开一个空白的再发） */
function send(command: MenuCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? createDocumentWindow();
  window.webContents.send(EVENTS.menuCommand, command);
}

/** 带参数的命令（导出的格式、警告框的种类……）没有快捷键 */
function commandItem(label: string, id: string, argument?: string): MenuItemConstructorOptions {
  const key = argument === undefined ? accelerator(id) : undefined;
  return {
    label,
    accelerator: key,
    ...(key && !registers(id) ? { registerAccelerator: false } : {}),
    click: () => send({ id, ...(argument !== undefined ? { argument } : {}) }),
  };
}

/** 文字是 key 这条消息的菜单项 */
function item(key: MessageKey, id: string, argument?: string): MenuItemConstructorOptions {
  return commandItem(t(key), id, argument);
}

/** 勾选项：勾不勾按设置，点了改设置（设置一变菜单就重建，X-6） */
function settingItem(key: MessageKey, setting: keyof Settings, id?: string): MenuItemConstructorOptions {
  const settings = getSettings();
  const shortcut = id ? accelerator(id) : undefined;
  return {
    label: t(key),
    type: "checkbox",
    checked: Boolean(settings[setting]),
    accelerator: shortcut,
    click: (menuItem) => setSettings({ [setting]: menuItem.checked } as Partial<Settings>),
  };
}

/**
 * 顶层菜单的文字：Windows、Linux 上带 Alt 的访问键（「文件(&F)」），macOS 上不带。
 * 「(&F)」这种写法新版 Chromium 整段不显示，只剩「文件」（Typora 用的旧版显示「文件(F)」）：括号和 & 中间加一个零宽空格，
 * 照样显示「文件(F)」，Alt+F 也照样能用
 */
function title(key: MessageKey, mnemonic: MessageKey): string {
  return isMac ? t(key) : t(mnemonic).replace(/\((&\w)\)/, "(\u200b$1)");
}

/**
 * 最近文件在菜单里的文字（同 Typora）：完整路径，长了只留前三段和后三段，中间写「…」
 * （C:\Users\name\…\docs\notes\a.md）
 */
export function recentLabel(path: string): string {
  const separator = path.includes("\\") ? "\\" : "/";
  const parts = path.split(separator);
  if (parts.length <= 7) return path;
  return [...parts.slice(0, 3), "…", ...parts.slice(-3)].join(separator);
}

function recentMenu(): MenuItemConstructorOptions[] {
  const recent = recentFiles();
  const entries: MenuItemConstructorOptions[] = recent.map((file) => commandItem(recentLabel(file.path), "file.openRecent", file.path));
  return [
    ...(entries.length ? entries : [{ label: t("menu.file.recentNone"), enabled: false }]),
    { type: "separator" },
    item("menu.file.showRecent", "file.showRecent"),
    {
      label: t("menu.file.clearRecent"),
      enabled: recent.length > 0,
      click: () => clearRecentFiles(),
    },
  ];
}

const separator: MenuItemConstructorOptions = { type: "separator" };

const HEADINGS = ["menu.paragraph.heading1", "menu.paragraph.heading2", "menu.paragraph.heading3", "menu.paragraph.heading4", "menu.paragraph.heading5", "menu.paragraph.heading6"] as const;

/** 「文件」菜单（F 章） */
function fileMenu(): MenuItemConstructorOptions {
  return {
    label: title("menu.file.title", "menu.file.menuBar"),
    submenu: [
      item("menu.file.new", "file.new"),
      { label: t("menu.file.newWindow"), accelerator: accelerator("window.new"), click: () => createDocumentWindow({ near: BrowserWindow.getFocusedWindow() }) },
      separator,
      item("menu.file.open", "file.open"),
      item("menu.file.openFolder", "workspace.open"),
      // W-1（Marko）
      {
        label: t("menu.file.workspace"),
        submenu: [
          item("menu.file.openFolderAsWorkspace", "workspace.openContaining"),
          item("menu.file.refreshWorkspace", "workspace.refresh"),
          item("menu.file.closeWorkspace", "workspace.close"),
        ],
      },
      separator,
      item("menu.file.quickOpen", "file.quickOpen"),
      { label: t("menu.file.recent"), submenu: recentMenu() },
      // F-18：换一种编码重新读这个文件
      {
        label: t("menu.file.reopenWithEncoding"),
        submenu: REOPEN_ENCODINGS.map((encoding) => item(`encodings.${encoding}`, "file.reopenWithEncoding", encoding)),
      },
      item("menu.file.reload", "file.reload"),
      separator,
      item("menu.file.save", "file.save"),
      item("menu.file.saveAs", "file.saveAs"),
      separator,
      item("menu.file.reveal", "file.reveal"),
      item("menu.file.revealInSidebar", "view.revealInTree"),
      item("menu.file.delete", "file.trash"),
      // F-13（Marko）
      {
        label: t("menu.file.operations"),
        submenu: [
          item("menu.file.rename", "file.rename"),
          item("menu.file.copyPath", "file.copyPath"),
          item("menu.file.openContainingFolder", "file.openFolder"),
        ],
      },
      separator,
      item("menu.file.import", "file.import"),
      exportMenu(),
      item("menu.file.print", "file.print"),
      ...(isMac ? [] : [separator, item("menu.app.preferences", "app.preferences")]),
      separator,
      { label: t("menu.file.close"), accelerator: accelerator("window.close"), click: () => BrowserWindow.getFocusedWindow()?.close() },
      ...(isMac ? [] : [{ role: "quit", label: t("menu.file.quit"), accelerator: accelerator("app.quit") } as MenuItemConstructorOptions]),
    ],
  };
}

/** 「导出」子菜单（O 章）：参数是导出的格式 */
function exportMenu(): MenuItemConstructorOptions {
  const format = (key: MessageKey, id: string) => item(key, "export", id);
  return {
    label: t("menu.file.export"),
    submenu: [
      format("menu.export.pdf", "pdf"),
      format("menu.export.html", "html"),
      format("menu.export.htmlPlain", "htmlPlain"),
      format("menu.export.png", "png"),
      separator,
      format("menu.export.docx", "docx"),
      format("menu.export.odt", "odt"),
      format("menu.export.rtf", "rtf"),
      format("menu.export.epub", "epub"),
      format("menu.export.latex", "latex"),
      format("menu.export.mediawiki", "mediawiki"),
      format("menu.export.rst", "rst"),
      separator,
      item("menu.file.exportPrevious", "export.previous"),
      item("menu.file.exportOverwrite", "export.last"),
      separator,
      item("menu.file.exportSettings", "app.exportSettings"),
    ],
  };
}

/** 「编辑」菜单（E 章、C 章、N 章） */
function editMenu(): MenuItemConstructorOptions {
  return {
    label: title("menu.edit.title", "menu.edit.menuBar"),
    submenu: [
      item("menu.edit.undo", "editor.undo"),
      item("menu.edit.redo", "editor.redo"),
      separator,
      { role: "cut", label: t("menu.edit.cut"), accelerator: accelerator("edit.cut") },
      { role: "copy", label: t("menu.edit.copy"), accelerator: accelerator("edit.copy") },
      { role: "paste", label: t("menu.edit.paste"), accelerator: accelerator("edit.paste") },
      separator,
      item("menu.edit.copyAsText", "edit.copyAsText"),
      item("menu.edit.copyAsMarkdown", "edit.copyAsMarkdown"),
      item("menu.edit.copyAsHtml", "edit.copyAsHtml"),
      separator,
      {
        label: t("menu.edit.pastePlainText"),
        accelerator: accelerator("editor.pastePlainText"),
        // Windows、Linux 上浏览器自己就按这个键粘贴纯文本（编辑器在粘贴时按纯文本处理，C-4）：快捷键只显示，不然会粘贴两次
        registerAccelerator: isMac,
        click: async () => send({ id: "editor.pastePlainText", argument: await clipboard.readText() }),
      },
      separator,
      {
        label: t("menu.edit.selection"),
        submenu: [
          item("menu.edit.selectAll", "editor.selectAll"),
          item("menu.edit.selectParagraph", "selectParagraph"),
          item("menu.edit.selectLine", "selectLine"),
          item("menu.edit.selectStyleScope", "selectStyleScope"),
          item("menu.edit.selectWord", "selectWord"),
          separator,
          item("menu.edit.jumpTop", "edit.jumpTop"),
          item("menu.edit.jumpSelection", "edit.jumpSelection"),
          item("menu.edit.jumpBottom", "edit.jumpBottom"),
          separator,
          item("menu.edit.lineStart", "edit.lineStart"),
          item("menu.edit.lineEnd", "edit.lineEnd"),
          separator,
          item("menu.edit.extendTop", "edit.extendTop"),
          item("menu.edit.extendBottom", "edit.extendBottom"),
          item("menu.edit.extendLineStart", "edit.extendLineStart"),
          item("menu.edit.extendLineEnd", "edit.extendLineEnd"),
        ],
      },
      item("menu.edit.moveLineUp", "moveLineUp"),
      item("menu.edit.moveLineDown", "moveLineDown"),
      item("menu.edit.duplicateLine", "duplicateLine"),
      separator,
      item("menu.edit.delete", "edit.delete"),
      {
        label: t("menu.edit.deleteRange"),
        submenu: [
          item("menu.edit.deleteBlock", "deleteParagraph"),
          item("menu.edit.deleteLine", "deleteLine"),
          item("menu.edit.deleteStyleScope", "deleteStyleScope"),
          item("menu.edit.deleteWord", "deleteWord"),
        ],
      },
      separator,
      // E-10：只改显示
      { label: t("menu.edit.smartPunctuation"), submenu: [settingItem("menu.edit.smartQuotes", "smartQuotes"), settingItem("menu.edit.smartDashes", "smartDashes")] },
      // S-6
      { label: t("menu.edit.whitespace"), submenu: [settingItem("menu.edit.preserveLineBreak", "preserveSingleLineBreaks")] },
      // L-1：同 S-5「拼写检查」
      settingItem("menu.edit.spellcheck", "spellcheck"),
      separator,
      {
        label: t("menu.edit.findAndReplace"),
        submenu: [
          item("menu.edit.find", "find.open"),
          // 查找栏开着时编辑器、查找栏自己处理这两个键（不会再走到菜单）；关着时打开查找栏
          item("menu.edit.findNext", "find.next"),
          item("menu.edit.findPrevious", "find.previous"),
          separator,
          item("menu.edit.replace", "find.replace"),
        ],
      },
      separator,
      // 系统的表情面板
      {
        label: t("menu.edit.emoji"),
        accelerator: accelerator("edit.emoji"),
        registerAccelerator: false,
        click: () => app.showEmojiPanel(),
      },
    ],
  };
}

/** 「段落」菜单（B 章、T 章）：命令的 id 就是编辑器命令的名字，渲染进程直接执行；快捷键编辑器自己也处理（处理了就不会再走菜单） */
function paragraphMenu(): MenuItemConstructorOptions {
  return {
    label: title("menu.paragraph.title", "menu.paragraph.menuBar"),
    submenu: [
      ...HEADINGS.map((key, index) => item(key, `heading${index + 1}`)),
      separator,
      item("menu.paragraph.paragraph", "paragraph"),
      separator,
      item("menu.paragraph.increaseHeading", "increaseHeading"),
      item("menu.paragraph.decreaseHeading", "decreaseHeading"),
      separator,
      {
        label: t("menu.paragraph.table"),
        submenu: [
          item("menu.paragraph.insertTable", "table.insert"),
          separator,
          item("menu.paragraph.addRowAbove", "addTableRowAbove"),
          item("menu.paragraph.addRowBelow", "addTableRowBelow"),
          separator,
          item("menu.paragraph.addColumnLeft", "addTableColumnLeft"),
          item("menu.paragraph.addColumnRight", "addTableColumnRight"),
          separator,
          item("menu.paragraph.moveRowUp", "moveTableRowUp"),
          item("menu.paragraph.moveRowDown", "moveTableRowDown"),
          item("menu.paragraph.moveColumnLeft", "moveTableColumnLeft"),
          item("menu.paragraph.moveColumnRight", "moveTableColumnRight"),
          separator,
          item("menu.paragraph.deleteRow", "deleteTableRow"),
          item("menu.paragraph.deleteColumn", "deleteTableColumn"),
          separator,
          item("menu.paragraph.deleteTable", "deleteTable"),
          // Marko
          separator,
          item("menu.paragraph.selectCell", "selectTableCell"),
          item("menu.paragraph.selectRow", "selectTableRow"),
          item("menu.paragraph.selectColumn", "selectTableColumn"),
          item("menu.paragraph.selectTable", "selectTable"),
          separator,
          item("menu.paragraph.alignLeft", "alignLeft"),
          item("menu.paragraph.alignCenter", "alignCenter"),
          item("menu.paragraph.alignRight", "alignRight"),
        ],
      },
      item("menu.paragraph.mathBlock", "mathBlock"),
      item("menu.paragraph.codeBlock", "codeBlock"),
      {
        label: t("menu.paragraph.callout"),
        // 警告框（B-13）：参数是 Markdown 里写的种类（> [!NOTE]）
        submenu: [
          item("menu.paragraph.calloutNote", "callout", "NOTE"),
          item("menu.paragraph.calloutTip", "callout", "TIP"),
          item("menu.paragraph.calloutImportant", "callout", "IMPORTANT"),
          item("menu.paragraph.calloutWarning", "callout", "WARNING"),
          item("menu.paragraph.calloutCaution", "callout", "CAUTION"),
        ],
      },
      separator,
      item("menu.paragraph.blockquote", "blockquote"),
      separator,
      item("menu.paragraph.orderedList", "orderedList"),
      item("menu.paragraph.bulletList", "bulletList"),
      item("menu.paragraph.taskList", "taskList"),
      {
        label: t("menu.paragraph.taskStatus"),
        submenu: [
          item("menu.paragraph.toggleTask", "toggleTask"),
          item("menu.paragraph.markTaskDone", "markTaskDone"),
          item("menu.paragraph.markTaskUndone", "markTaskUndone"),
        ],
      },
      {
        label: t("menu.paragraph.listIndent"),
        submenu: [item("menu.paragraph.indent", "indentLines"), item("menu.paragraph.outdent", "outdentLines")],
      },
      // Marko
      item("menu.paragraph.definitionList", "definitionList"),
      separator,
      item("menu.paragraph.insertParagraphAbove", "insertParagraphAbove"),
      item("menu.paragraph.insertParagraphBelow", "insertParagraphBelow"),
      separator,
      item("menu.paragraph.linkReference", "linkReference"),
      item("menu.paragraph.footnote", "footnote"),
      separator,
      item("menu.paragraph.hr", "hr"),
      item("menu.paragraph.toc", "toc"),
      item("menu.paragraph.frontMatter", "frontMatter"),
      // Marko：插入图表的示例（D-4）
      separator,
      {
        label: t("menu.paragraph.diagram"),
        submenu: [commandItem("Mermaid", "mermaid"), commandItem("Flowchart", "flowchart"), commandItem("Sequence", "sequence")],
      },
    ],
  };
}

/**
 * 编辑区的右键菜单（通用规则 6，同 Typora 的项和顺序）：剪切、复制、粘贴、删除；复制／粘贴为…；加粗、斜体、代码、超链接；
 * 引用、有序列表、无序列表、任务列表；段落（标题级别）；插入。Typora 的菜单是网页里画的，前三排是图标按钮，这里是原生菜单的一项一项
 */
export function editorContextItems(): MenuItemConstructorOptions[] {
  return [
    { role: "cut", label: t("menu.edit.cut"), accelerator: accelerator("edit.cut") },
    { role: "copy", label: t("menu.edit.copy"), accelerator: accelerator("edit.copy") },
    { role: "paste", label: t("menu.edit.paste"), accelerator: accelerator("edit.paste") },
    item("menu.edit.delete", "edit.delete"),
    {
      label: t("contextMenu.copyPasteAs"),
      submenu: [
        item("menu.edit.copyAsMarkdown", "edit.copyAsMarkdown"),
        item("menu.edit.copyAsHtml", "edit.copyAsHtml"),
        item("menu.edit.copyAsText", "edit.copyAsText"),
        separator,
        {
          label: t("menu.edit.pastePlainText"),
          accelerator: accelerator("editor.pastePlainText"),
          click: async () => send({ id: "editor.pastePlainText", argument: await clipboard.readText() }),
        },
      ],
    },
    separator,
    item("menu.format.bold", "bold"),
    item("menu.format.italic", "italic"),
    item("menu.format.inlineCode", "inlineCode"),
    item("menu.format.link", "link"),
    item("menu.paragraph.blockquote", "blockquote"),
    item("menu.paragraph.orderedList", "orderedList"),
    item("menu.paragraph.bulletList", "bulletList"),
    item("menu.paragraph.taskList", "taskList"),
    separator,
    {
      label: t("menu.paragraph.title"),
      submenu: [...HEADINGS.map((key, index) => item(key, `heading${index + 1}`)), separator, item("menu.paragraph.paragraph", "paragraph")],
    },
    {
      label: t("contextMenu.insert"),
      submenu: [
        commandItem(t("contextMenu.image"), "image"),
        separator,
        item("menu.paragraph.footnote", "footnote"),
        item("menu.paragraph.linkReference", "linkReference"),
        item("menu.paragraph.hr", "hr"),
        commandItem(t("contextMenu.table"), "table.insert"),
        item("menu.paragraph.codeBlock", "codeBlock"),
        item("menu.paragraph.mathBlock", "mathBlock"),
        item("menu.paragraph.toc", "toc"),
        item("menu.paragraph.frontMatter", "frontMatter"),
        separator,
        commandItem(t("contextMenu.paragraphAbove"), "insertParagraphAbove"),
        commandItem(t("contextMenu.paragraphBelow"), "insertParagraphBelow"),
      ],
    },
  ];
}

/** 「格式」菜单（I 章、M 章） */
function formatMenu(): MenuItemConstructorOptions {
  return {
    label: title("menu.format.title", "menu.format.menuBar"),
    submenu: [
      item("menu.format.bold", "bold"),
      item("menu.format.italic", "italic"),
      item("menu.format.underline", "underline"),
      item("menu.format.inlineCode", "inlineCode"),
      separator,
      item("menu.format.inlineMath", "inlineMath"),
      item("menu.format.strike", "strike"),
      item("menu.format.highlight", "highlight"),
      item("menu.format.superscript", "superscript"),
      item("menu.format.subscript", "subscript"),
      item("menu.format.comment", "comment"),
      separator,
      item("menu.format.link", "link"),
      {
        label: t("menu.format.linkActions"),
        submenu: [item("menu.format.openLink", "editor.openLink"), item("menu.format.copyLink", "editor.copyLink")],
      },
      {
        label: t("menu.format.image"),
        submenu: [
          item("menu.format.insertImage", "image"),
          item("menu.format.insertLocalImage", "image.insertLocal"),
          // Marko（M-5）
          separator,
          item("menu.format.imageWidth", "image.setWidth"),
        ],
      },
      separator,
      item("menu.format.clearFormat", "clearFormat"),
    ],
  };
}

/** 「视图」菜单（W 章、V 章） */
function viewMenu(): MenuItemConstructorOptions {
  return {
    label: title("menu.view.title", "menu.view.menuBar"),
    submenu: [
      item("menu.view.sidebar", "view.sidebar"),
      item("menu.view.outline", "view.outline"),
      item("menu.view.fileList", "view.fileList"),
      item("menu.view.fileTree", "view.fileTree"),
      item("menu.view.search", "view.search"),
      separator,
      item("menu.view.sourceMode", "view.sourceMode"),
      separator,
      settingItem("menu.view.focusMode", "focusMode", "view.focusMode"),
      settingItem("menu.view.typewriterMode", "typewriterMode", "view.typewriterMode"),
      separator,
      settingItem("menu.view.statusBar", "showStatusBar", "view.statusBar"),
      item("menu.view.wordCount", "view.wordCount"),
      separator,
      { role: "togglefullscreen", label: t("menu.view.fullscreen"), accelerator: accelerator("view.fullscreen") },
      // V-7：当前窗口保持在最上面（勾选状态跟着当前窗口）
      {
        label: t("menu.view.alwaysOnTop"),
        id: "alwaysOnTop",
        type: "checkbox",
        accelerator: accelerator("view.alwaysOnTop"),
        checked: BrowserWindow.getFocusedWindow()?.isAlwaysOnTop() ?? false,
        click: (menuItem, window) => (window instanceof BrowserWindow ? window : BrowserWindow.getFocusedWindow())?.setAlwaysOnTop(menuItem.checked),
      },
      separator,
      // V-5：所有窗口共用的缩放（主进程直接处理）
      { label: t("menu.view.actualSize"), accelerator: accelerator("view.actualSize"), click: () => changeZoom(null) },
      { label: t("menu.view.zoomIn"), accelerator: accelerator("view.zoomIn"), click: () => changeZoom(ZOOM_STEP) },
      { label: t("menu.view.zoomOut"), accelerator: accelerator("view.zoomOut"), click: () => changeZoom(-ZOOM_STEP) },
      separator,
      { role: "toggleDevTools", label: t("menu.view.devTools"), accelerator: accelerator("app.devTools") },
    ],
  };
}

/** 「主题」菜单（A-1、A-3、A-4）：内置的和用户主题目录里的，当前的打勾；选了以后所有窗口马上换 */
function themeMenu(): MenuItemConstructorOptions {
  const settings = getSettings();
  const { themes } = themeList();
  const choose = (id: string): MenuItemConstructorOptions => {
    const theme = themes.find((entry) => entry.id === id)!;
    return {
      label: theme.name,
      type: "radio",
      checked: !settings.followSystemTheme && settings.theme === id,
      click: () => setSettings({ theme: id, followSystemTheme: false }),
    };
  };
  const user = themes.filter((theme) => !theme.builtIn);
  return {
    label: title("menu.theme.title", "menu.theme.menuBar"),
    submenu: [
      ...themes.filter((theme) => theme.builtIn).map((theme) => choose(theme.id)),
      ...(user.length ? [separator, ...user.map((theme) => choose(theme.id))] : []),
      separator,
      {
        label: t("menu.theme.followSystem"),
        type: "checkbox",
        checked: settings.followSystemTheme,
        click: (menuItem) => setSettings({ followSystemTheme: menuItem.checked }),
      },
      { label: t("menu.theme.openFolder"), click: () => openThemesFolder() },
    ],
  };
}

function template(): MenuItemConstructorOptions[] {
  return [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              item("menu.app.about", "app.about"),
              { type: "separator" },
              item("menu.app.preferences", "app.preferences"),
              { type: "separator" },
              { role: "hide", label: t("menu.app.hide") },
              { role: "hideOthers", label: t("menu.app.hideOthers") },
              { role: "unhide", label: t("menu.app.unhide") },
              { type: "separator" },
              { role: "quit", label: t("menu.app.quit"), accelerator: accelerator("app.quit") },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    fileMenu(),
    editMenu(),
    paragraphMenu(),
    formatMenu(),
    viewMenu(),
    themeMenu(),
    {
      label: title("menu.help.title", "menu.help.menuBar"),
      submenu: [
        // R-4：手动检查更新（结果告诉当前窗口）
        { label: t("menu.help.checkUpdates"), click: () => checkForUpdatesNow() },
        ...(isMac ? [] : [item("menu.help.about", "app.about")]),
      ],
    },
  ];
}

export function rebuildMenu(): void {
  bindings = getSettings().keyBindings;
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template()));
  } catch (error) {
    // 用户改的快捷键 Electron 不认（不该出现：偏好设置里录的都是认得的）：用默认的建，菜单不能没有
    console.error("菜单用自定义快捷键建不出来，改用默认的", error);
    bindings = {};
    Menu.setApplicationMenu(Menu.buildFromTemplate(template()));
  }
}

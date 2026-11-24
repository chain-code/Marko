// 原生应用菜单（第 2 章各条）：菜单项发 menu.command 事件给当前窗口，由渲染进程执行（编辑器命令或应用的动作）。
// 撤销、全选、查找这些也发命令，不用 Electron 的 role：role 走的是网页自己的撤销、全选，不经过编辑器。
// 文字都经过 t（L-2）；快捷键按 S-12 的表（@marko/shared 的 SHORTCUTS），用户改过的（设置的 keyBindings）优先。
// 换了界面语言、改了快捷键以后重建菜单
import { basename } from "node:path";
import { app, BrowserWindow, clipboard, Menu, type MenuItemConstructorOptions } from "electron";
import { EVENTS, REOPEN_ENCODINGS, shortcutEntry, shortcutOf, type MenuCommand } from "@marko/shared";
import type { MessageKey } from "../locales/index.ts";
import { fileManagerName, t } from "./i18n.ts";
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

/** 发给当前窗口（没有窗口时新开一个空白的再发） */
function send(command: MenuCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? createDocumentWindow();
  window.webContents.send(EVENTS.menuCommand, command);
}

/** 带参数的命令（导出的格式、Callout 的种类……）没有快捷键 */
function commandItem(label: string, id: string, argument?: string): MenuItemConstructorOptions {
  return {
    label,
    accelerator: argument === undefined ? accelerator(id) : undefined,
    click: () => send({ id, ...(argument !== undefined ? { argument } : {}) }),
  };
}

/** 文字是 key 这条消息的菜单项 */
function item(key: MessageKey, id: string, argument?: string): MenuItemConstructorOptions {
  return commandItem(t(key), id, argument);
}

function recentMenu(): MenuItemConstructorOptions[] {
  const recent = recentFiles();
  const entries: MenuItemConstructorOptions[] = recent.map((file) => commandItem(basename(file.path), "file.openRecent", file.path));
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

/**
 * 「段落」菜单（B 章、T 章；同旧版的菜单）：命令的 id 就是编辑器命令的名字，渲染进程直接执行；
 * 快捷键编辑器自己也处理（处理了就不会再走菜单），这里显示出来、编辑器外按也能用（通用规则 6）
 */
function paragraphMenu(): MenuItemConstructorOptions {
  return {
    label: t("menu.paragraph.title"),
    submenu: [
      item("menu.paragraph.paragraph", "paragraph"),
      ...HEADINGS.map((key, index) => item(key, `heading${index + 1}`)),
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
          item("menu.paragraph.moveRowUp", "moveTableRowUp"),
          item("menu.paragraph.moveRowDown", "moveTableRowDown"),
          item("menu.paragraph.deleteRow", "deleteTableRow"),
          separator,
          item("menu.paragraph.addColumnLeft", "addTableColumnLeft"),
          item("menu.paragraph.addColumnRight", "addTableColumnRight"),
          item("menu.paragraph.moveColumnLeft", "moveTableColumnLeft"),
          item("menu.paragraph.moveColumnRight", "moveTableColumnRight"),
          item("menu.paragraph.deleteColumn", "deleteTableColumn"),
          separator,
          item("menu.paragraph.selectCell", "selectTableCell"),
          item("menu.paragraph.selectRow", "selectTableRow"),
          item("menu.paragraph.selectColumn", "selectTableColumn"),
          item("menu.paragraph.selectTable", "selectTable"),
          item("menu.paragraph.deleteTable", "deleteTable"),
          separator,
          item("menu.paragraph.alignLeft", "alignLeft"),
          item("menu.paragraph.alignCenter", "alignCenter"),
          item("menu.paragraph.alignRight", "alignRight"),
        ],
      },
      item("menu.paragraph.codeBlock", "codeBlock"),
      item("menu.paragraph.mathBlock", "mathBlock"),
      separator,
      item("menu.paragraph.blockquote", "blockquote"),
      item("menu.paragraph.orderedList", "orderedList"),
      item("menu.paragraph.bulletList", "bulletList"),
      item("menu.paragraph.taskList", "taskList"),
      item("menu.paragraph.definitionList", "definitionList"),
      item("menu.paragraph.toggleTask", "toggleTask"),
      item("menu.paragraph.indent", "indentLines"),
      item("menu.paragraph.outdent", "outdentLines"),
      separator,
      item("menu.paragraph.insertParagraphAbove", "insertParagraphAbove"),
      item("menu.paragraph.insertParagraphBelow", "insertParagraphBelow"),
      separator,
      item("menu.paragraph.footnote", "footnote"),
      item("menu.paragraph.hr", "hr"),
      item("menu.paragraph.toc", "toc"),
      item("menu.paragraph.frontMatter", "frontMatter"),
      {
        label: t("menu.paragraph.callout"),
        // Callout 的种类就是 Markdown 里写的关键字（> [!NOTE]），不翻译
        submenu: [
          commandItem("Note", "callout", "NOTE"),
          commandItem("Tip", "callout", "TIP"),
          commandItem("Important", "callout", "IMPORTANT"),
          commandItem("Warning", "callout", "WARNING"),
          commandItem("Caution", "callout", "CAUTION"),
        ],
      },
      separator,
      {
        label: t("menu.paragraph.diagram"),
        submenu: [commandItem("Mermaid", "mermaid"), commandItem("Flowchart", "flowchart"), commandItem("Sequence", "sequence")],
      },
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
    label: t("menu.theme.title"),
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
      separator,
      { label: t("menu.theme.openFolder"), click: () => openThemesFolder() },
    ],
  };
}

/** 「格式」菜单（I 章、M 章） */
function formatMenu(): MenuItemConstructorOptions {
  return {
    label: t("menu.format.title"),
    submenu: [
      item("menu.format.bold", "bold"),
      item("menu.format.italic", "italic"),
      item("menu.format.underline", "underline"),
      item("menu.format.strike", "strike"),
      item("menu.format.inlineCode", "inlineCode"),
      item("menu.format.inlineMath", "inlineMath"),
      separator,
      item("menu.format.link", "link"),
      item("menu.format.openLink", "editor.openLink"),
      {
        label: t("menu.format.image"),
        submenu: [
          item("menu.format.insertImage", "image"),
          item("menu.format.insertLocalImage", "image.insertLocal"),
          item("menu.format.imageWidth", "image.setWidth"),
        ],
      },
      separator,
      item("menu.format.highlight", "highlight"),
      item("menu.format.superscript", "superscript"),
      item("menu.format.subscript", "subscript"),
      item("menu.format.comment", "comment"),
      separator,
      item("menu.format.clearFormat", "clearFormat"),
    ],
  };
}

/** 「导出」子菜单（O 章）：参数是导出的格式 */
function exportMenu(): MenuItemConstructorOptions {
  const format = (key: MessageKey, id: string) => item(key, "export", id);
  return {
    label: t("menu.file.export"),
    submenu: [
      format("menu.export.html", "html"),
      format("menu.export.htmlPlain", "htmlPlain"),
      format("menu.export.pdf", "pdf"),
      format("menu.export.png", "png"),
      separator,
      format("menu.export.docx", "docx"),
      format("menu.export.odt", "odt"),
      format("menu.export.rtf", "rtf"),
      format("menu.export.epub", "epub"),
      format("menu.export.latex", "latex"),
      format("menu.export.rst", "rst"),
      format("menu.export.mediawiki", "mediawiki"),
      separator,
      item("menu.file.exportLast", "export.last"),
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
    {
      label: t("menu.file.title"),
      submenu: [
        item("menu.file.new", "file.new"),
        { label: t("menu.file.newWindow"), accelerator: accelerator("window.new"), click: () => createDocumentWindow({ near: BrowserWindow.getFocusedWindow() }) },
        { type: "separator" },
        item("menu.file.open", "file.open"),
        item("menu.file.openFolder", "workspace.open"),
        // W-1
        {
          label: t("menu.file.workspace"),
          submenu: [
            item("menu.file.openFolderAsWorkspace", "workspace.openContaining"),
            item("menu.file.refreshWorkspace", "workspace.refresh"),
            item("menu.file.closeWorkspace", "workspace.close"),
          ],
        },
        item("menu.file.quickOpen", "file.quickOpen"),
        { label: t("menu.file.recent"), submenu: recentMenu() },
        { type: "separator" },
        item("menu.file.save", "file.save"),
        item("menu.file.saveAs", "file.saveAs"),
        item("menu.file.reload", "file.reload"),
        // F-18：换一种编码重新读这个文件
        {
          label: t("menu.file.reopenWithEncoding"),
          submenu: REOPEN_ENCODINGS.map((encoding) => item(`encodings.${encoding}`, "file.reopenWithEncoding", encoding)),
        },
        {
          label: t("menu.file.operations"),
          submenu: [
            item("menu.file.rename", "file.rename"),
            item("menu.file.copyPath", "file.copyPath"),
            commandItem(t("menu.file.reveal", { manager: fileManagerName() }), "file.reveal"),
            item("menu.file.openContainingFolder", "file.openFolder"),
          ],
        },
        separator,
        item("menu.file.import", "file.import"),
        exportMenu(),
        item("menu.file.print", "file.print"),
        ...(isMac ? [] : [{ type: "separator" } as MenuItemConstructorOptions, item("menu.app.preferences", "app.preferences")]),
        { type: "separator" },
        { label: t("menu.file.close"), accelerator: accelerator("window.close"), click: () => BrowserWindow.getFocusedWindow()?.close() },
        ...(isMac ? [] : [{ role: "quit", label: t("menu.file.quit"), accelerator: accelerator("app.quit") } as MenuItemConstructorOptions]),
      ],
    },
    {
      label: t("menu.edit.title"),
      submenu: [
        item("menu.edit.undo", "editor.undo"),
        item("menu.edit.redo", "editor.redo"),
        { type: "separator" },
        { role: "cut", label: t("menu.edit.cut"), accelerator: accelerator("edit.cut") },
        { role: "copy", label: t("menu.edit.copy"), accelerator: accelerator("edit.copy") },
        { role: "paste", label: t("menu.edit.paste"), accelerator: accelerator("edit.paste") },
        {
          label: t("menu.edit.pastePlainText"),
          accelerator: accelerator("editor.pastePlainText"),
          // Windows、Linux 上浏览器自己就按这个键粘贴纯文本（编辑器在粘贴时按纯文本处理，C-4）：快捷键只显示，不然会粘贴两次
          registerAccelerator: isMac,
          click: async () => send({ id: "editor.pastePlainText", argument: await clipboard.readText() }),
        },
        { type: "separator" },
        item("menu.edit.selectAll", "editor.selectAll"),
        {
          label: t("menu.edit.spellcheck"),
          type: "checkbox",
          checked: getSettings().spellcheck,
          // 同 S-5「拼写检查」（L-1）
          click: (menuItem) => setSettings({ spellcheck: menuItem.checked }),
        },
        { type: "separator" },
        item("menu.edit.find", "find.open"),
        // 查找栏开着时编辑器、查找栏自己处理这两个键（不会再走到菜单）；关着时打开查找栏
        item("menu.edit.findNext", "find.next"),
        item("menu.edit.findPrevious", "find.previous"),
        item("menu.edit.replace", "find.replace"),
      ],
    },
    paragraphMenu(),
    formatMenu(),
    {
      label: t("menu.view.title"),
      submenu: [
        item("menu.view.sourceMode", "view.sourceMode"),
        item("menu.view.focusMode", "view.focusMode"),
        item("menu.view.typewriterMode", "view.typewriterMode"),
        { type: "separator" },
        item("menu.view.sidebar", "view.sidebar"),
        item("menu.view.outline", "view.outline"),
        item("menu.view.fileList", "view.fileList"),
        item("menu.view.fileTree", "view.fileTree"),
        item("menu.view.revealInTree", "view.revealInTree"),
        item("menu.view.search", "view.search"),
        { type: "separator" },
        item("menu.view.wordCount", "view.wordCount"),
        { type: "separator" },
        // V-5：所有窗口共用的缩放（主进程直接处理）
        { label: t("menu.view.actualSize"), accelerator: accelerator("view.actualSize"), click: () => changeZoom(null) },
        { label: t("menu.view.zoomIn"), accelerator: accelerator("view.zoomIn"), click: () => changeZoom(ZOOM_STEP) },
        { label: t("menu.view.zoomOut"), accelerator: accelerator("view.zoomOut"), click: () => changeZoom(-ZOOM_STEP) },
        { type: "separator" },
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
      ],
    },
    themeMenu(),
    {
      label: t("menu.help.title"),
      submenu: [
        ...(isMac ? [] : [item("menu.help.about", "app.about")]),
        // R-4：手动检查更新（结果告诉当前窗口）
        { label: t("menu.help.checkUpdates"), click: () => checkForUpdatesNow() },
        { type: "separator" },
        { role: "toggleDevTools", label: t("menu.help.devTools"), accelerator: accelerator("app.devTools") },
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

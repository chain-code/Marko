// 入口：单实例、app 生命周期、系统打开文件（命令行、second-instance、macOS 的 open-file）（F-14、F-16）
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, session } from "electron";
import { EVENTS, type Settings } from "@marko/shared";
import { openPath, registerIpc } from "./ipc.ts";
import { editorContextItems, rebuildMenu } from "./menu.ts";
import { setEditorContextItems } from "./contextMenu.ts";
import { watchAccentColor } from "./accent.ts";
import { setLocale } from "./i18n.ts";
import { cleanupImports } from "./imports.ts";
import { installPermissionHandlers } from "./permissions.ts";
import { handleAppProtocol, handleAssetProtocol, handleThemeProtocol, registerSchemes } from "./protocol.ts";
import { themesDirectory, watchThemes } from "./themes.ts";
import { scope } from "./scope.ts";
import { clearDrafts, recoverDrafts } from "./drafts.ts";
import { getSettings, onRecentChanged, onSettingsChanged, savedSession } from "./store.ts";
import { readDocument } from "./files.ts";
import { filesIn } from "./argv.ts";
import electronUpdater from "electron-updater";
import { createUpdateService, startUpdates, type UpdaterLike } from "./updater.ts";
import { closeAllWindowsThen, createDocumentWindow, deliverDocument, focusWindow, installQuitHandler, isQuitting } from "./windows.ts";

const rendererRoot = fileURLToPath(new URL("../renderer", import.meta.url));

registerSchemes();

/** 命令行里的文件（`marko 文件路径`，系统打开文件也是这样传进来的）：存在的普通文件 */

/** 打开系统给的文件（F-14）：按 F-3 的规则选窗口，用户的选择即范围（1.10 节） */
async function openFromSystem(paths: string[]): Promise<void> {
  for (const path of paths) {
    scope.allowFile(path);
    const sender = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
    const result = await openPath(sender, path);
    // 在已有的空白窗口里打开：放到最前面（应用在后台时双击文件要看得到）；已经打开了的 openPath 切过去了
    if (result.ok && result.value.target === "here" && sender) {
      deliverDocument(sender, result.value.document);
      focusWindow(sender);
    }
  }
}

/**
 * L-1：拼写检查开关；检查哪些语言按 S-10（Windows、Linux 用 Hunspell 词典，第一次用某种语言时下载；macOS 用系统的，不用设）
 */
function applySpellcheck(settings: Settings): void {
  const target = session.defaultSession;
  target.setSpellCheckerEnabled(settings.spellcheck);
  if (process.platform === "darwin") return;
  const available = new Set(target.availableSpellCheckerLanguages);
  const languages = settings.spellcheckLanguages.filter((language) => available.has(language));
  if (languages.length) target.setSpellCheckerLanguages(languages);
}

/**
 * F-16：按上次的会话开窗口——文档还在的打开它（不在的开空白窗口），工作区还在的放回去（用户上次打开过，放进范围）。
 * 返回开了几个窗口
 */
async function restoreSession(): Promise<number> {
  let previous: BrowserWindow | null = null;
  let count = 0;
  for (const entry of savedSession()) {
    let document = null;
    if (entry.path) {
      try {
        document = await readDocument(entry.path);
        scope.allowFile(entry.path);
      } catch {
        document = null;
      }
    }
    let workspace: string | null = null;
    if (entry.workspace && existsSync(entry.workspace) && statSync(entry.workspace).isDirectory()) {
      scope.allowDirectory(entry.workspace);
      workspace = entry.workspace;
    }
    previous = createDocumentWindow({ document, near: previous, workspace, layout: entry.layout });
    count += 1;
  }
  return count;
}

// 单实例：再次运行 marko 文件路径时交给已经在运行的这个（F-14）
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // macOS：拖到程序坞图标、「打开方式」
  const pendingFromMac: string[] = [];
  app.on("open-file", (event, path) => {
    event.preventDefault();
    if (app.isReady()) void openFromSystem([path]);
    else pendingFromMac.push(path);
  });

  app.on("second-instance", (_event, argv, workingDirectory) => {
    const paths = filesIn(argv.slice(1), workingDirectory);
    if (paths.length) void openFromSystem(paths);
    else {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        if (window.isMinimized()) window.restore();
        window.focus();
      } else createDocumentWindow();
    }
  });

  app.whenReady().then(async () => {
    installPermissionHandlers();
    installQuitHandler();
    handleAppProtocol(rendererRoot);
    handleAssetProtocol();
    // A-3：用户主题目录里的样式、字体；目录里的文件变了重建「主题」菜单
    handleThemeProtocol(themesDirectory);
    watchThemes(() => rebuildMenu());
    registerIpc();
    // L-2：界面语言跟着设置（菜单、对话框、错误提示）；换了以后重建菜单
    setLocale(getSettings().language);
    rebuildMenu();
    setEditorContextItems(editorContextItems);
    onRecentChanged(rebuildMenu);
    // B-5：任务的复选框跟着系统的强调色（同 Typora）
    watchAccentColor();
    // L-1：拼写检查开关、语言跟着设置；菜单里的勾跟着设置
    applySpellcheck(getSettings());
    onSettingsChanged((settings) => {
      applySpellcheck(settings);
      setLocale(settings.language);
      rebuildMenu();
    });
    // F-19：放了很久的导入目录清掉（不等它）
    void cleanupImports();
    // R-4：自动更新。只在安装好的版本里（开发时运行、设了 MARKO_NO_UPDATE 时不检查）
    const updater = app.isPackaged && !process.env.MARKO_NO_UPDATE ? (electronUpdater.autoUpdater as unknown as UpdaterLike) : null;
    startUpdates(
      createUpdateService(
        updater,
        app.getVersion(),
        (status) => {
          const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
          window?.webContents.send(EVENTS.updateStatus, status);
        },
        closeAllWindowsThen,
      ),
      getSettings().autoCheckUpdates,
    );
    // 上次异常退出留下的草稿（F-9）：每份开一个窗口恢复；S-3「恢复未保存的草稿」关着时删掉
    const drafts = getSettings().recoverUnsavedDrafts ? await recoverDrafts() : (await clearDrafts(), []);
    let previous: BrowserWindow | null = null;
    for (const draft of drafts) {
      if (draft.path) scope.allowFile(draft.path);
      previous = createDocumentWindow({ draft, near: previous });
    }
    // 第一次启动时带的文件在第一个窗口里打开。没带文件、也没有要恢复的草稿时，按 S-3「启动时」恢复上次的窗口（F-16），
    // 或者新建空白文档
    const paths = [...filesIn(process.argv.slice(app.isPackaged ? 1 : 2), process.cwd()), ...pendingFromMac];
    if (!drafts.length) {
      const restored = !paths.length && getSettings().startup === "restore" ? await restoreSession() : 0;
      if (!restored) createDocumentWindow();
    }
    if (paths.length) await openFromSystem(paths);
    // V-7：「窗口置顶」的勾跟着当前窗口
    app.on("browser-window-focus", (_event, window) => {
      const item = Menu.getApplicationMenu()?.getMenuItemById("alwaysOnTop");
      if (item) item.checked = window.isAlwaysOnTop();
    });
    // macOS：关掉最后一个窗口程序还在，点程序坞图标新开窗口（F-16）
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createDocumentWindow();
    });
  });

  // 关掉最后一个窗口：Windows、Linux 上退出（macOS 上程序留着）；退出、装更新时由 closeAllWindowsThen 接着做
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !isQuitting()) app.quit();
  });
}

// 注册 1.9 节的接口：参数用 shared 的 zod schema 校验，路径过 scope（1.10 节），出错统一返回 { code, message }
import { randomUUID } from "node:crypto";
import { rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { app, BrowserWindow, clipboard, dialog, ipcMain, net, session, shell, type IpcMainInvokeEvent } from "electron";
import {
  CHANNELS,
  EVENTS,
  SCHEMAS,
  SettingsPatchSchema,
  type MarkoError,
  type OpenTarget,
  type OpenedDocument,
  type Platform,
  type Result,
  type SavedFile,
  type SavedMedia,
  type ExportResult,
  exportUsesHtml,
  type MediaSaveRequest,
  type Settings,
  mediaKindOfPath,
  type Workspace,
  type DroppedResult,
} from "@marko/shared";
import { ConflictError, isKnownEncoding, readDocument, saveDocument } from "./files.ts";
import { isAllowedExternalUrl } from "./links.ts";
import { markdownPathOf, mediaFilters, pastedName, storeMedia } from "./media.ts";
import { popupMenu } from "./contextMenu.ts";
import { exportThemeCss, openThemesFolder, themeList } from "./themes.ts";
import { classifyDropped, createFolder, createMarkdownFile, renamedPath, renameFile } from "./fileOps.ts";
import { exportImage, exportPdf, exportWithPandoc, FORMAT_FILES, formatFileName, importFilters, importWithPandoc, localizeMedia, printHtml } from "./export.ts";
import { t } from "./i18n.ts";
import { uploadToApi, uploadWithCommand, type FetchLike } from "./upload.ts";
import { isMediaPath } from "./protocol.ts";
import { removeDraft, saveDraft } from "./drafts.ts";
import { applyRewrites, copyImportedMedia } from "./imports.ts";
import { installUpdate } from "./updater.ts";
import { cancelSearch, startSearch } from "./search.ts";
import { isMarkdownFile, listWorkspace, MARKDOWN_EXTENSIONS, scanWorkspace, stopWatchingWorkspace, watchWorkspace } from "./workspace.ts";
import { Scope, scope } from "./scope.ts";
import {
  addRecentFile,
  clearRecentFiles,
  getSettings,
  hasUploadToken,
  lastExport,
  recentFiles,
  rememberExport,
  removeRecentFile,
  renameRecentFile,
  setSettings,
  setUploadToken,
  uploadToken,
} from "./store.ts";
import {
  cancelClose,
  confirmClose,
  createDocumentWindow,
  documentStateOf,
  focusWindow,
  setDocumentState,
  initialStateOf,
  setKnownHash,
  setLayout,
  setWorkspace,
  takeInitialDocument,
  takeInitialDraft,
  windowShowing,
  workspaceOf,
} from "./windows.ts";

/** 打开对话框里能选的扩展名（F-3） */
function filters(): Electron.FileFilter[] {
  return [
    { name: t("dialog.markdownFiles"), extensions: MARKDOWN_EXTENSIONS.map((extension) => extension.slice(1)) },
    { name: t("dialog.textFiles"), extensions: ["txt"] },
    { name: t("dialog.allFiles"), extensions: ["*"] },
  ];
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

function fail(code: MarkoError["code"], message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

function errorOf(error: unknown): MarkoError {
  if (error instanceof ConflictError) return error.markoError;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT") return { code: "not_found", message: t("error.notFound") };
  if (code === "EACCES" || code === "EPERM") return { code: "io_error", message: t("error.noPermission") };
  if (code === "EISDIR") return { code: "io_error", message: t("error.isFolder") };
  if (code === "EEXIST") return { code: "io_error", message: t("error.exists") };
  return { code: "io_error", message: error instanceof Error ? error.message : String(error) };
}

// 每次现取：换了界面语言以后用新的文字
const invalid = () => fail("invalid_argument", t("error.invalidArgument"));
const outOfScope = () => fail("out_of_scope", t("error.outOfScope"));
/** X-1：插入媒体时可以复制、上传的原文件（用户选的、拖进来的、粘贴的）；只读，不进 scope（那边的可以写） */
const mediaSources = new Scope();

function windowOf(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

/**
 * F-3 选窗口：已经打开了的切过去；当前是没改过的空白新文档就在这里打开；否则新开一个窗口。
 * anchor（N-4 本地链接的 #标题）：打开以后跳过去；就是发起的这个窗口时返回 current，由它自己跳
 */
export async function openPath(sender: BrowserWindow | null, path: string, anchor?: string): Promise<Result<OpenTarget>> {
  const existing = windowShowing(path);
  if (existing && anchor !== undefined && existing === sender) return ok({ target: "current" });
  if (existing) {
    focusWindow(existing);
    if (anchor) existing.webContents.send(EVENTS.jumpToAnchor, anchor);
    return ok({ target: "elsewhere" });
  }
  let document: OpenedDocument;
  try {
    document = await readDocument(path);
  } catch (error) {
    return { ok: false, error: errorOf(error) };
  }
  if (anchor) document = { ...document, anchor };
  scope.allowFile(path);
  addRecentFile(path);
  const state = sender && !sender.isDestroyed() ? documentStateOf(sender) : null;
  if (sender && state?.pristine) return ok({ target: "here", document });
  createDocumentWindow({ document, near: sender });
  return ok({ target: "elsewhere" });
}

/** M-4：上传一张图片（粘贴的先写进临时文件，传完删掉） */
async function uploadImage(request: MediaSaveRequest, settings: Settings): Promise<string> {
  let file = request.sourcePath;
  let temporary: string | null = null;
  if (!file) {
    temporary = join(app.getPath("temp"), pastedName(request.name));
    await writeFile(temporary, request.data!);
    file = temporary;
  }
  try {
    if (settings.uploadMethod === "command") return await uploadWithCommand(file, settings.uploadCommand);
    return await uploadToApi(file, settings.uploadUrl, uploadToken(), net.fetch as unknown as FetchLike);
  } finally {
    if (temporary) await rm(temporary, { force: true });
  }
}

export function registerIpc(): void {
  // 最近文件是用户打开过的，在范围里（1.10 节）
  for (const item of recentFiles()) scope.allowFile(item.path);

  ipcMain.handle(CHANNELS.appVersion, () => app.getVersion());
  ipcMain.handle(CHANNELS.appPlatform, (): Platform => process.platform as Platform);

  ipcMain.handle(CHANNELS.filePickAndOpen, async (event): Promise<Result<OpenTarget | null>> => {
    const window = windowOf(event);
    const state = window ? documentStateOf(window) : null;
    const options = { properties: ["openFile" as const], filters: filters(), defaultPath: state?.path ? dirname(state.path) : undefined };
    const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return ok(null);
    const path = picked.filePaths[0];
    scope.allowFile(path);
    return openPath(window, path);
  });

  ipcMain.handle(CHANNELS.fileOpen, async (event, path: unknown) => {
    const parsed = SCHEMAS.path.safeParse(path);
    if (!parsed.success) return invalid();
    if (!scope.has(parsed.data)) return outOfScope();
    return openPath(windowOf(event), parsed.data);
  });

  // N-4：文档里的本地链接。用户点了才会来，不受打开过的范围限制，但只打开 Markdown 文件（读进来、进范围）——
  // 页面借它能读的只有 Markdown；文件夹交给文件管理器；别的文件在主进程里问过（页面绕不过去）再交给系统默认的程序
  ipcMain.handle(CHANNELS.fileOpenLink, async (event, path: unknown, anchor: unknown): Promise<Result<OpenTarget | null>> => {
    const parsed = SCHEMAS.path.safeParse(path);
    const fragment = anchor === undefined ? undefined : SCHEMAS.anchor.safeParse(anchor);
    if (!parsed.success || !isAbsolute(parsed.data) || (fragment && !fragment.success)) return invalid();
    const target = parsed.data;
    const window = windowOf(event);
    let isDirectory: boolean;
    try {
      isDirectory = (await stat(target)).isDirectory();
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
    if (isDirectory) {
      const failure = await shell.openPath(target);
      return failure ? fail("io_error", failure) : ok(null);
    }
    if (isMarkdownFile(target)) return openPath(window, target, fragment?.data ?? "");
    const options = {
      type: "question" as const,
      buttons: [t("link.openWithSystem"), t("common.cancel")],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: t("link.confirmSystem", { name: basename(target) }),
      detail: target,
    };
    const answer = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options);
    if (answer.response !== 0) return ok(null);
    const failure = await shell.openPath(target);
    return failure ? fail("io_error", failure) : ok(null);
  });

  // 侧栏里点文件：在这个窗口里换（F-8、F-10）；已经在别的窗口里打开时切过去
  ipcMain.handle(CHANNELS.fileOpenHere, async (event, path: unknown): Promise<Result<OpenTarget>> => {
    const parsed = SCHEMAS.path.safeParse(path);
    if (!parsed.success) return invalid();
    if (!scope.has(parsed.data)) return outOfScope();
    const sender = windowOf(event);
    const existing = windowShowing(parsed.data);
    if (existing && existing === sender) return ok({ target: "current" });
    if (existing) {
      focusWindow(existing);
      return ok({ target: "elsewhere" });
    }
    try {
      const document = await readDocument(parsed.data);
      scope.allowFile(parsed.data);
      addRecentFile(parsed.data);
      return ok({ target: "here", document });
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  ipcMain.handle(CHANNELS.fileRead, async (_event, path: unknown, encoding: unknown) => {
    const parsed = SCHEMAS.path.safeParse(path);
    if (!parsed.success) return invalid();
    if (!scope.has(parsed.data)) return outOfScope();
    // F-18：指定的编码要是认得的
    const forced = encoding === undefined ? undefined : SCHEMAS.encoding.safeParse(encoding);
    if (forced && (!forced.success || !isKnownEncoding(forced.data))) return invalid();
    try {
      return ok(await readDocument(parsed.data, forced?.data));
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  ipcMain.handle(CHANNELS.fileSave, async (event, request: unknown): Promise<Result<SavedFile>> => {
    const parsed = SCHEMAS.save.safeParse(request);
    if (!parsed.success) return invalid();
    if (!scope.has(parsed.data.path)) return outOfScope();
    try {
      // F-19：导入的图片复制到文档旁边，地址改成相对路径
      const replaced = await copyImportedMedia(parsed.data.content, parsed.data.path, getSettings());
      const saved = await saveDocument({ ...parsed.data, content: applyRewrites(parsed.data.content, replaced) });
      // 自己保存引起的文件变化不算外部修改（F-12）
      const window = windowOf(event);
      if (window) setKnownHash(window, saved.path, saved.hash);
      return ok(replaced.length ? { ...saved, replaced } : saved);
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  ipcMain.handle(CHANNELS.fileSaveAs, async (event, request: unknown): Promise<Result<SavedFile | null>> => {
    const parsed = SCHEMAS.saveAs.safeParse(request);
    if (!parsed.success) return invalid();
    const { suggestedName, defaultPath } = parsed.data;
    const window = windowOf(event);
    // 默认目录（F-7）：当前文件所在目录；新文档用工作区目录，没有工作区时用「文档」目录
    const directory = defaultPath ? dirname(defaultPath) : (workspaceOf(window) ?? (app.getPath("documents") || homedir()));
    const name = basename(suggestedName || t("app.untitledFile"));
    const options = { defaultPath: join(directory, name), filters: filters() };
    const picked = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return ok(null);
    try {
      const replaced = await copyImportedMedia(parsed.data.content, picked.filePath, getSettings());
      const saved = await saveDocument({ ...parsed.data, content: applyRewrites(parsed.data.content, replaced), path: picked.filePath, expectedHash: null });
      scope.allowFile(saved.path);
      addRecentFile(saved.path);
      if (window) setKnownHash(window, saved.path, saved.hash);
      return ok(replaced.length ? { ...saved, replaced } : saved);
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  // 路径只收范围里的（X-1）：主进程拿它恢复会话、「打开所在文件夹」，不能借它把别的路径放进范围
  ipcMain.handle(CHANNELS.windowSetDocumentState, (event, state: unknown) => {
    const parsed = SCHEMAS.documentState.safeParse(state);
    const window = windowOf(event);
    if (parsed.success && window && (!parsed.data.path || scope.has(parsed.data.path))) setDocumentState(window, parsed.data);
  });
  ipcMain.handle(CHANNELS.windowNew, (event) => {
    createDocumentWindow({ near: windowOf(event) });
  });
  ipcMain.handle(CHANNELS.windowClose, (event) => {
    const window = windowOf(event);
    if (window) confirmClose(window);
  });
  ipcMain.handle(CHANNELS.windowCancelClose, () => cancelClose());
  ipcMain.handle(CHANNELS.windowInitialDocument, (event) => {
    const window = windowOf(event);
    return window ? takeInitialDocument(window) : null;
  });
  ipcMain.handle(CHANNELS.windowInitialDraft, (event) => {
    const window = windowOf(event);
    return window ? takeInitialDraft(window) : null;
  });
  // F-16、W-7：新窗口开始时的工作区（会话恢复时主进程已经放进范围）、侧栏
  ipcMain.handle(CHANNELS.windowInitialState, (event) => {
    const window = windowOf(event);
    return window ? initialStateOf(window) : { workspace: null, layout: null };
  });
  ipcMain.handle(CHANNELS.windowSetLayout, (event, layout: unknown) => {
    const parsed = SCHEMAS.layout.safeParse(layout);
    const window = windowOf(event);
    if (parsed.success && window) setLayout(window, parsed.data);
  });

  // F-9：草稿。路径只收打开过的范围里的（恢复时要读它）
  ipcMain.handle(CHANNELS.draftSave, async (_event, request: unknown) => {
    const parsed = SCHEMAS.draft.safeParse(request);
    if (!parsed.success || (parsed.data.path && !scope.has(parsed.data.path))) return;
    try {
      await saveDraft(parsed.data);
    } catch {
      // 草稿写不了（磁盘满了这类）：不打断编辑
    }
  });
  ipcMain.handle(CHANNELS.draftRemove, async (_event, id: unknown) => {
    const parsed = SCHEMAS.draftId.safeParse(id);
    if (parsed.success) await removeDraft(parsed.data);
  });

  ipcMain.handle(CHANNELS.settingsGet, () => getSettings());
  ipcMain.handle(CHANNELS.settingsSet, (_event, patch: unknown) => {
    const parsed = SettingsPatchSchema.safeParse(patch);
    return parsed.success ? setSettings(parsed.data) : getSettings();
  });

  ipcMain.handle(CHANNELS.recentList, () => recentFiles());
  ipcMain.handle(CHANNELS.recentRemove, (_event, path: unknown) => {
    const parsed = SCHEMAS.path.safeParse(path);
    return parsed.success ? removeRecentFile(parsed.data) : recentFiles();
  });
  ipcMain.handle(CHANNELS.recentClear, () => clearRecentFiles());

  ipcMain.handle(CHANNELS.shellOpenExternal, async (_event, url: unknown) => {
    const parsed = SCHEMAS.url.safeParse(url);
    // 外部链接只允许 http、https、mailto（1.10 节）
    if (!parsed.success || !isAllowedExternalUrl(parsed.data)) return invalid();
    await shell.openExternal(parsed.data);
    return ok(undefined);
  });
  // W-1：工作区。打开以后整个目录在范围里（1.10 节），并开始监听（W-2）
  const openWorkspace = async (window: BrowserWindow | null, root: string): Promise<Result<Workspace>> => {
    try {
      const { workspace, skipped } = await scanWorkspace(root);
      scope.allowDirectory(root);
      if (window) {
        watchWorkspace(window, root, skipped);
        setWorkspace(window, root);
      }
      return ok(workspace);
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  };
  // F-15：拖到窗口上的文件。路径是预加载脚本用 webUtils 从系统给的文件取的（网页自己造的文件没有路径），按用户选的放进范围
  ipcMain.handle(CHANNELS.fileOpenDropped, async (event, paths: unknown): Promise<Result<DroppedResult>> => {
    const parsed = SCHEMAS.droppedPaths.safeParse(paths);
    if (!parsed.success) return invalid();
    const window = windowOf(event);
    const { folders, documents } = await classifyDropped(parsed.data, MARKDOWN_EXTENSIONS);
    let workspace: Workspace | null = null;
    if (folders[0]) {
      const opened = await openWorkspace(window, folders[0]);
      if (!opened.ok) return opened;
      workspace = opened.value;
    }
    let document: OpenTarget | null = null;
    for (const [index, path] of documents.entries()) {
      scope.allowFile(path);
      // 第一个按 F-3（空白窗口里直接打开）；后面的各开一个窗口
      const opened = await openPath(index === 0 ? window : null, path);
      if (index === 0) {
        if (!opened.ok) return opened;
        document = opened.value;
      }
    }
    return ok({ workspace, document });
  });
  // W-1「打开所在文件夹为工作区」：按这个窗口打开的文件（主进程记着的路径），不用渲染进程给路径
  ipcMain.handle(CHANNELS.workspaceOpenContaining, async (event): Promise<Result<Workspace | null>> => {
    const window = windowOf(event);
    const path = window ? documentStateOf(window)?.path : null;
    if (!window || !path) return ok(null);
    return openWorkspace(window, dirname(path));
  });
  // W-1「关闭工作区文件夹」
  ipcMain.handle(CHANNELS.workspaceClose, (event) => {
    const window = windowOf(event);
    if (!window) return;
    stopWatchingWorkspace(window);
    setWorkspace(window, null);
  });
  ipcMain.handle(CHANNELS.workspacePickAndOpen, async (event): Promise<Result<Workspace | null>> => {
    const window = windowOf(event);
    const options = { properties: ["openDirectory" as const] };
    const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return ok(null);
    return openWorkspace(window, picked.filePaths[0]);
  });
  ipcMain.handle(CHANNELS.workspaceOpen, async (event, root: unknown) => {
    const parsed = SCHEMAS.path.safeParse(root);
    if (!parsed.success) return invalid();
    if (!scope.has(parsed.data)) return outOfScope();
    return openWorkspace(windowOf(event), parsed.data);
  });

  // A-1、A-3：主题
  // R-4：新版本下载好了，用户点了「重启以更新」
  ipcMain.handle(CHANNELS.updateInstall, () => installUpdate());
  ipcMain.handle(CHANNELS.themesList, () => themeList());
  ipcMain.handle(CHANNELS.themesOpenFolder, () => openThemesFolder());
  ipcMain.handle(CHANNELS.themesExportCss, async (_event, file: unknown): Promise<Result<string>> => {
    const parsed = SCHEMAS.themeFile.safeParse(file);
    if (!parsed.success) return invalid();
    try {
      return ok(await exportThemeCss(parsed.data));
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  // W-6：右键菜单（渲染进程给菜单项）、复制、打开文件夹
  ipcMain.handle(CHANNELS.menuPopup, async (event, items: unknown) => {
    const parsed = SCHEMAS.popupItems.safeParse(items);
    const window = windowOf(event);
    return parsed.success && window ? popupMenu(window, parsed.data) : null;
  });
  // S-10：用户词典（拼写检查在默认的 session 上，L-1）
  ipcMain.handle(CHANNELS.spellcheckWords, async () => (await session.defaultSession.listWordsInSpellCheckerDictionary()).sort((left, right) => left.localeCompare(right)));
  ipcMain.handle(CHANNELS.spellcheckRemoveWord, (_event, word: unknown) => {
    const parsed = SCHEMAS.dictionaryWord.safeParse(word);
    return parsed.success ? session.defaultSession.removeWordFromSpellCheckerDictionary(parsed.data) : false;
  });
  ipcMain.handle(CHANNELS.shellCopyText, async (_event, text: unknown) => {
    const parsed = SCHEMAS.copyText.safeParse(text);
    if (parsed.success) await clipboard.writeText(parsed.data);
  });
  // 给的是文件夹就打开它；给的是文件就打开它所在的文件夹（文件在范围里就行，文件夹不一定在）
  ipcMain.handle(CHANNELS.shellOpenFolder, async (_event, path: unknown) => {
    const parsed = SCHEMAS.path.safeParse(path);
    if (!parsed.success || !scope.has(parsed.data)) return;
    const isFile = await stat(parsed.data).then((info) => info.isFile(), () => false);
    await shell.openPath(isFile ? dirname(parsed.data) : parsed.data);
  });

  // F-13、W-6：文件操作，只在打开过的范围里（工作区、打开的文件）
  ipcMain.handle(CHANNELS.fileCreate, async (_event, directory: unknown, name: unknown): Promise<Result<string>> => {
    const where = SCHEMAS.path.safeParse(directory);
    const called = SCHEMAS.fileName.safeParse(name);
    if (!where.success || !called.success) return invalid();
    if (!scope.has(where.data)) return outOfScope();
    try {
      return ok(await createMarkdownFile(where.data, called.data));
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });
  ipcMain.handle(CHANNELS.fileCreateFolder, async (_event, directory: unknown, name: unknown): Promise<Result<string>> => {
    const where = SCHEMAS.path.safeParse(directory);
    const called = SCHEMAS.fileName.safeParse(name);
    if (!where.success || !called.success) return invalid();
    if (!scope.has(where.data)) return outOfScope();
    try {
      return ok(await createFolder(where.data, called.data));
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });
  ipcMain.handle(CHANNELS.fileRename, async (_event, path: unknown, name: unknown): Promise<Result<string>> => {
    const from = SCHEMAS.path.safeParse(path);
    const called = SCHEMAS.fileName.safeParse(name);
    if (!from.success || !called.success) return invalid();
    if (!scope.has(from.data)) return outOfScope();
    const target = renamedPath(from.data, called.data);
    // 打开着它的窗口先记下新路径：文件变化的事件来时不当作被删除（F-12）
    const window = windowShowing(from.data);
    const state = window ? documentStateOf(window) : null;
    if (window && state) setKnownHash(window, target, state.hash ?? "");
    try {
      await renameFile(from.data, target);
    } catch (error) {
      if (window && state) setKnownHash(window, from.data, state.hash ?? "");
      return { ok: false, error: errorOf(error) };
    }
    scope.allowFile(target);
    renameRecentFile(from.data, target);
    if (window && !window.isDestroyed()) window.webContents.send(EVENTS.fileRenamed, { from: from.data, to: target });
    return ok(target);
  });
  ipcMain.handle(CHANNELS.fileTrash, async (_event, path: unknown): Promise<Result<void>> => {
    const parsed = SCHEMAS.path.safeParse(path);
    if (!parsed.success) return invalid();
    if (!scope.has(parsed.data)) return outOfScope();
    try {
      await shell.trashItem(parsed.data);
      return ok(undefined);
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  // M-2、M-3、M-7：插入本地媒体。文档要在范围里；原文件只收用户给的媒体文件（X-1）：对话框选的、
  // 拖进来和粘贴的（预加载脚本由 File 算出路径告诉这里，页面交不了路径字符串）
  ipcMain.handle(CHANNELS.mediaPick, async (event): Promise<string[]> => {
    const window = windowOf(event);
    const options = { properties: ["openFile" as const, "multiSelections" as const], filters: mediaFilters() };
    const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (picked.canceled) return [];
    for (const path of picked.filePaths) mediaSources.allowFile(path);
    return picked.filePaths;
  });
  ipcMain.handle(CHANNELS.mediaAllowDropped, (_event, path: unknown) => {
    const parsed = SCHEMAS.path.safeParse(path);
    if (parsed.success && isMediaPath(parsed.data)) mediaSources.allowFile(parsed.data);
  });
  ipcMain.handle(CHANNELS.mediaSave, async (_event, request: unknown): Promise<Result<SavedMedia>> => {
    const parsed = SCHEMAS.mediaSave.safeParse(request);
    if (!parsed.success || (!parsed.data.sourcePath && !parsed.data.data)) return invalid();
    if (parsed.data.documentPath && !scope.has(parsed.data.documentPath)) return outOfScope();
    if (parsed.data.sourcePath && !isMediaPath(parsed.data.sourcePath)) return invalid();
    if (parsed.data.sourcePath && !mediaSources.has(parsed.data.sourcePath)) return outOfScope();
    try {
      const settings = getSettings();
      // M-4：配了上传方式时图片先上传，用返回的网址（不再复制到文档旁边）
      if (settings.uploadMethod !== "none" && mediaKindOfPath(parsed.data.sourcePath ?? parsed.data.name) === "image") {
        return ok({ url: await uploadImage(parsed.data, settings) });
      }
      const stored = await storeMedia(parsed.data, settings);
      return ok({ url: markdownPathOf(parsed.data.documentPath, stored, settings) });
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });
  ipcMain.handle(CHANNELS.uploadSetToken, (_event, token: unknown): Result<void> => {
    const parsed = SCHEMAS.uploadToken.safeParse(token);
    if (!parsed.success) return invalid();
    try {
      setUploadToken(parsed.data);
      return ok(undefined);
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });
  ipcMain.handle(CHANNELS.uploadHasToken, () => hasUploadToken());

  // O 章：导出。直接写到给的位置（O-7）只认这个文档上次导出的位置，别的位置要用户在对话框里选
  ipcMain.handle(CHANNELS.exportRun, async (event, request: unknown): Promise<Result<ExportResult | null>> => {
    const parsed = SCHEMAS.exportRequest.safeParse(request);
    if (!parsed.success) return invalid();
    const { format, title, documentPath, html, markdown } = parsed.data;
    if (documentPath && !scope.has(documentPath)) return outOfScope();
    if (exportUsesHtml(format) ? html === undefined : markdown === undefined) return invalid();
    const previous = documentPath ? lastExport(documentPath) : null;
    let target = parsed.data.path;
    if (target && target !== previous?.path) return outOfScope();
    if (!target) {
      const window = windowOf(event);
      const file = { extension: FORMAT_FILES[format].extension, name: formatFileName(format) };
      const directory = previous ? dirname(previous.path) : documentPath ? dirname(documentPath) : app.getPath("documents") || homedir();
      const name = `${(title || t("app.untitled")).replace(/[<>:"/\\|?*]/g, "-")}.${file.extension}`;
      const options = { defaultPath: join(directory, name), filters: [{ name: file.name, extensions: [file.extension] }] };
      const picked = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
      if (picked.canceled || !picked.filePath) return ok(null);
      target = picked.filePath;
    }
    try {
      const settings = getSettings();
      if (format === "html" || format === "htmlPlain") await writeFile(target, await localizeMedia(html!, target, settings.exportImages === "embed"), "utf8");
      else if (format === "pdf") await exportPdf(html!, target, settings);
      else if (format === "png") await exportImage(html!, target);
      else await exportWithPandoc(markdown!, documentPath, format, target, settings, parsed.data.diagrams);
      if (documentPath) rememberExport(documentPath, { format, path: target });
      if (settings.afterExport === "open") void shell.openPath(target);
      else if (settings.afterExport === "reveal") shell.showItemInFolder(target);
      return ok({ path: target });
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });
  ipcMain.handle(CHANNELS.exportLast, (_event, documentPath: unknown) => {
    const parsed = SCHEMAS.path.safeParse(documentPath);
    return parsed.success && scope.has(parsed.data) ? lastExport(parsed.data) : null;
  });
  ipcMain.handle(CHANNELS.exportPrint, async (_event, html: unknown): Promise<Result<void>> => {
    const parsed = SCHEMAS.printHtml.safeParse(html);
    if (!parsed.success) return invalid();
    try {
      await printHtml(parsed.data, getSettings().pdfPrintBackground);
      return ok(undefined);
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  // F-19：导入。选的文件转成 Markdown，在新窗口里作为没保存的新文档打开
  ipcMain.handle(CHANNELS.importRun, async (event): Promise<Result<boolean>> => {
    const window = windowOf(event);
    const options = { properties: ["openFile" as const], filters: importFilters() };
    const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return ok(false);
    try {
      const content = await importWithPandoc(picked.filePaths[0], getSettings());
      createDocumentWindow({
        draft: { id: randomUUID(), path: null, content, encoding: "utf-8", bom: false, disk: null, diskChanged: false, importedFrom: basename(picked.filePaths[0]) },
        near: window,
      });
      return ok(true);
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  // W-5：全局搜索，只在打开过的工作区里搜
  ipcMain.handle(CHANNELS.searchStart, (event, request: unknown): Result<void> => {
    const parsed = SCHEMAS.search.safeParse(request);
    if (!parsed.success) return invalid();
    if (!scope.has(parsed.data.root)) return outOfScope();
    startSearch(event.sender, parsed.data);
    return ok(undefined);
  });
  ipcMain.handle(CHANNELS.searchCancel, (event, id: unknown) => {
    const parsed = SCHEMAS.searchId.safeParse(id);
    if (parsed.success) cancelSearch(event.sender, parsed.data);
  });
  ipcMain.handle(CHANNELS.workspaceList, async (_event, root: unknown) => {
    const parsed = SCHEMAS.path.safeParse(root);
    if (!parsed.success) return invalid();
    if (!scope.has(parsed.data)) return outOfScope();
    try {
      return ok(await listWorkspace(parsed.data));
    } catch (error) {
      return { ok: false, error: errorOf(error) };
    }
  });

  ipcMain.handle(CHANNELS.shellShowItemInFolder, (_event, path: unknown) => {
    const parsed = SCHEMAS.path.safeParse(path);
    if (parsed.success && scope.has(parsed.data)) shell.showItemInFolder(parsed.data);
  });
}

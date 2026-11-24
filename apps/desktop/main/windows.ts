// 窗口（F-1～F-3、F-10、F-16、F-17、1.10 节）：一个窗口一个文档；按 F-3 的规则选窗口；
// 关窗口、退出前先问渲染进程（F-10，渲染进程确认以后调 window.close，取消调 window.cancelClose）
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import windowStateKeeper from "electron-window-state";
import { EVENTS, type DocumentState, type OpenedDocument, type RecoveredDraft, type WindowInitialState, type WindowLayout } from "@marko/shared";
import { isAllowedExternalUrl } from "./links.ts";
import { getSettings, lastLayout, saveSession, setLastLayout, type SessionWindow } from "./store.ts";
import { APP_HOST, APP_SCHEME } from "./protocol.ts";
import { unwatchFile, watchFile } from "./watch.ts";
import { trackZoom } from "./zoom.ts";
import { installContextMenu } from "./contextMenu.ts";
import { t } from "./i18n.ts";

const preloadPath = fileURLToPath(new URL("../preload/index.cjs", import.meta.url));


interface WindowInfo {
  state: DocumentState;
  /** 新窗口要显示的文档（渲染进程加载完来取，取一次就清掉） */
  initial: OpenedDocument | null;
  /** 新窗口要恢复的草稿（F-9，同上） */
  draft: RecoveredDraft | null;
  /** 渲染进程确认过了，可以关 */
  allowClose: boolean;
  /** 渲染进程加载完了（来取过初始文档）：之后的文档用事件发过去 */
  ready: boolean;
  /** 工作区、侧栏（F-16 记进会话；新窗口开始时的放在 initialState 里） */
  workspace: string | null;
  layout: WindowLayout | null;
  initialState: WindowInitialState;
}

const windows = new Map<number, WindowInfo>();

/** 正在退出：每个窗口确认完关掉；有一个取消就不退出了（F-10） */
let quitting = false;

// ---------------------------------------------------------------------------
// 会话（F-16）：每个窗口的文档、工作区、侧栏随时记下（停 500ms 写一次）。只关掉其中一个窗口时会话里去掉它；
// 退出时、关掉最后一个窗口时留着（下次启动按它恢复）

let sessionTimer: ReturnType<typeof setTimeout> | null = null;

/** 按窗口登记的表算（closed 事件里窗口已经不在 BrowserWindow.getAllWindows() 里了），按开窗口的先后 */
function sessionWindows(): SessionWindow[] {
  return [...windows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, info]) => ({ path: info.state.path, workspace: info.workspace, layout: info.layout }));
}

function flushSession(): void {
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = null;
  saveSession(sessionWindows());
}

function scheduleSession(): void {
  if (quitting) return;
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(flushSession, 500);
}

/** 第一个窗口的位置和大小记在 electron-window-state 里（它也处理显示器变了、窗口跑到屏幕外的情况） */
let primaryState: windowStateKeeper.State | null = null;

/** 退出（或装更新）时所有窗口都关掉以后要做的 */
let whenAllClosed: (() => void) | null = null;

/** 还没确认过的窗口，按开的先后 */
function unconfirmedWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows()
    .filter((window) => !windows.get(window.id)?.allowClose)
    .sort((left, right) => left.id - right.id);
}

/**
 * F-10：退出时挨个窗口问——前一个关掉了（closed）再问下一个，问的那个放到最前面；哪个窗口选了取消就停下，
 * 后面的不问、不关。都关掉以后执行 done
 */
function closeAllThen(done: () => void): void {
  if (quitting) return;
  // 先记下所有窗口（关的时候一个个从会话里去掉就不对了）
  if (windows.size > 0) flushSession();
  quitting = true;
  whenAllClosed = done;
  askNext();
}

function askNext(): void {
  if (!quitting) return;
  const next = unconfirmedWindows()[0];
  if (next) {
    focusWindow(next);
    next.close();
    return;
  }
  // 确认过的还在关：等它的 closed
  if (windows.size > 0) return;
  const done = whenAllClosed;
  whenAllClosed = null;
  done?.();
}

/**
 * 退出（菜单、Cmd+Q、系统关机）先走 closeAllThen，都关掉了再退出——macOS 上也退（窗口都关了不等于退出了）。
 * 已经没有要问的窗口了（关掉最后一个窗口引起的退出）：直接退，会话在关它的时候记过了，不能用空的盖掉
 */
export function installQuitHandler(): void {
  app.on("before-quit", (event) => {
    if (!unconfirmedWindows().length && !quitting) return;
    if (quitting && windows.size === 0) return;
    event.preventDefault();
    closeAllThen(() => app.quit());
  });
}

/** R-4「重启以更新」：先挨个窗口确认、关掉（未保存的处理完），再交给安装程序——不能在确认框开着时被安装程序关掉 */
export function closeAllWindowsThen(done: () => void): void {
  closeAllThen(done);
}

/** 正在退出（挨个窗口确认中）：关掉最后一个窗口不再另外退出 */
export function isQuitting(): boolean {
  return quitting;
}

function keyOf(path: string): string {
  const absolute = resolve(path);
  return process.platform === "linux" ? absolute : absolute.toLowerCase();
}

/** 窗口标题：「● 文件名 - Marko」（F-17） */
function applyTitle(window: BrowserWindow, state: DocumentState): void {
  window.setTitle(`${state.edited ? "● " : ""}${state.title} - Marko`);
  if (process.platform === "darwin") {
    window.setDocumentEdited(state.edited);
    window.setRepresentedFilename(state.path ?? "");
  }
}

export interface WindowOptions {
  document?: OpenedDocument | null;
  draft?: RecoveredDraft | null;
  near?: BrowserWindow | null;
  /** 开始时的工作区、侧栏（F-16 恢复的；从别的窗口开的沿用它的） */
  workspace?: string | null;
  layout?: WindowLayout | null;
}

export function createDocumentWindow(options: WindowOptions = {}): BrowserWindow {
  const near = options.near && !options.near.isDestroyed() ? options.near.getBounds() : null;
  // 第一个窗口按上次的位置和大小（electron-window-state），之后的在当前窗口右下错开一点（F-2）
  const primary = !near && windows.size === 0 ? (primaryState = windowStateKeeper({ defaultWidth: 1360, defaultHeight: 880 })) : null;
  const window = new BrowserWindow({
    width: near?.width ?? primary?.width ?? 1360,
    height: near?.height ?? primary?.height ?? 880,
    ...(near ? { x: near.x + 28, y: near.y + 28 } : primary && primary.x !== undefined ? { x: primary.x, y: primary.y } : {}),
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "Marko",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      devTools: true,
    },
  });
  const document = options.document ?? null;
  const draft = options.draft ?? null;
  // 从别的窗口开的：沿用它的工作区（W-1）、侧栏的宽度和显示；都没有时侧栏用最近一次的（W-7）。
  // 页签按 S-4「默认侧栏」（W-7「打开时默认哪个按 S-4」）；恢复会话的（options.layout）照记下的
  const opener = options.near && !options.near.isDestroyed() ? windows.get(options.near.id) : undefined;
  const workspace = options.workspace !== undefined ? options.workspace : (opener?.workspace ?? null);
  const inherited = opener?.layout ?? lastLayout();
  const layout = options.layout !== undefined ? options.layout : inherited && { ...inherited, sidebarTab: getSettings().defaultSidebarTab };
  const path = document?.path ?? draft?.path ?? null;
  windows.set(window.id, {
    state: {
      path,
      title: path ? basename(path) : t("app.untitledFile"),
      edited: !!draft,
      pristine: !document && !draft,
      hash: document?.hash ?? draft?.disk?.hash ?? null,
    },
    initial: document,
    draft,
    allowClose: false,
    ready: false,
    workspace,
    layout,
    initialState: { workspace, layout },
  });
  watchDocument(window);
  primary?.manage(window);
  scheduleSession();
  window.once("ready-to-show", () => window.show());
  trackZoom(window);
  installContextMenu(window);

  // 一切新窗口都拦下；外部链接交给系统浏览器（N-4）
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  // 页面不跳走：除了重新加载自己
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });

  // F-10：先问渲染进程有没有没保存的
  window.on("close", (event) => {
    const info = windows.get(window.id);
    // 渲染进程还没加载完（没有用户的改动）、已经确认过：直接关
    if (!info || info.allowClose || !info.ready) return;
    event.preventDefault();
    window.webContents.send(EVENTS.closeRequested, { reason: quitting ? "quit" : "close" });
  });
  const id = window.id;
  window.on("closed", () => {
    // 关掉的是最后一个窗口（不是退出）：会话里留着它
    if (!quitting && windows.size === 1) flushSession();
    windows.delete(id);
    unwatchFile(id);
    if (windows.size > 0) scheduleSession();
    // 退出时：关掉一个再问下一个
    if (quitting) setImmediate(askNext);
  });
  // 渲染进程崩了：问不了，不能让窗口关不掉
  window.webContents.on("render-process-gone", () => {
    const info = windows.get(window.id);
    if (info) info.allowClose = true;
  });

  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer) void window.loadURL(devServer);
  else void window.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
  return window;
}

export function documentStateOf(window: BrowserWindow): DocumentState | null {
  return windows.get(window.id)?.state ?? null;
}

export function setDocumentState(window: BrowserWindow, state: DocumentState): void {
  const info = windows.get(window.id);
  if (!info) return;
  info.state = state;
  applyTitle(window, state);
  watchDocument(window);
  scheduleSession();
}

/** 这个窗口打开了工作区（W-1） */
/** root 是 null：关闭了工作区（W-1） */
export function setWorkspace(window: BrowserWindow, root: string | null): void {
  const info = windows.get(window.id);
  if (!info) return;
  info.workspace = root;
  scheduleSession();
}

/** 侧栏变了（W-7）：记进会话，也作为新窗口的默认 */
export function setLayout(window: BrowserWindow, layout: WindowLayout): void {
  const info = windows.get(window.id);
  if (!info) return;
  info.layout = layout;
  setLastLayout(layout);
  scheduleSession();
}

/** 新窗口开始时的工作区、侧栏 */
export function initialStateOf(window: BrowserWindow): WindowInitialState {
  return windows.get(window.id)?.initialState ?? { workspace: null, layout: null };
}

/** 这个窗口现在的工作区（从它开的新窗口沿用） */
export function workspaceOf(window: BrowserWindow | null): string | null {
  return window ? (windows.get(window.id)?.workspace ?? null) : null;
}

/** 盯着窗口打开的文件，被别的程序改了就告诉它（F-12） */
function watchDocument(window: BrowserWindow): void {
  const id = window.id;
  watchFile(id, windows.get(id)?.state.path ?? null, {
    current: () => windows.get(id)?.state ?? null,
    notify: (change) => {
      if (!window.isDestroyed()) window.webContents.send(EVENTS.fileChanged, change);
    },
  });
}

/**
 * 保存、另存以后磁盘上的指纹（F-12）：主进程先记下，文件变化的事件来时就知道是自己保存的。
 * 渲染进程拿到结果以后发来的文档状态也是这个指纹
 */
export function setKnownHash(window: BrowserWindow, path: string, hash: string): void {
  const info = windows.get(window.id);
  if (!info) return;
  info.state = { ...info.state, path, hash };
  watchDocument(window);
}

/**
 * 新窗口要恢复的草稿（F-9）：取一次就清掉。渲染进程先取它，没有再取初始文档；取过就算加载完了
 * （之后关窗口要先问——恢复出来的内容还没保存）
 */
export function takeInitialDraft(window: BrowserWindow): RecoveredDraft | null {
  const info = windows.get(window.id);
  if (!info) return null;
  const draft = info.draft;
  info.draft = null;
  info.ready = true;
  return draft;
}

export function takeInitialDocument(window: BrowserWindow): OpenedDocument | null {
  const info = windows.get(window.id);
  if (!info) return null;
  const document = info.initial;
  info.initial = null;
  info.ready = true;
  return document;
}

/** 在这个窗口里打开（F-3 选中了它）：渲染进程还没加载完时等它来取，否则发事件 */
export function deliverDocument(window: BrowserWindow, document: OpenedDocument): void {
  const info = windows.get(window.id);
  if (!info) return;
  info.state = { ...info.state, path: document.path, pristine: false, hash: document.hash };
  if (info.ready) window.webContents.send(EVENTS.openFile, document);
  else info.initial = document;
}

/** 渲染进程确认过了（F-10）：关掉 */
export function confirmClose(window: BrowserWindow): void {
  const info = windows.get(window.id);
  if (info) info.allowClose = true;
  window.close();
}

/** 未保存确认里选了取消：这个窗口不关，退出也取消（后面的窗口不再问）；已经关掉的从会话里去掉 */
export function cancelClose(): void {
  if (!quitting) return;
  quitting = false;
  whenAllClosed = null;
  scheduleSession();
}

/** 已经打开了这个文件的窗口 */
export function windowShowing(path: string): BrowserWindow | null {
  const key = keyOf(path);
  for (const window of BrowserWindow.getAllWindows()) {
    const state = windows.get(window.id)?.state;
    if (state?.path && keyOf(state.path) === key) return window;
  }
  return null;
}

export function focusWindow(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

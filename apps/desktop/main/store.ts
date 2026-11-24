// 设置、最近文件（1.8 节）：electron-store 存在 userData/config.json，所有窗口共用。
// 设置改了广播给每个窗口（settings.changed）；读到的旧设置按 shared 的 schema 补全
import { BrowserWindow, safeStorage } from "electron";
import Store from "electron-store";
import { applySettingsPatch, EVENTS, normalizeSettings, SCHEMAS, type LastExport, type RecentFile, type Settings, type SettingsPatch, type WindowLayout } from "@marko/shared";
import { t } from "./i18n.ts";

/** 最近文件最多记这么多（F-5） */
const RECENT_LIMIT = 20;

interface Schema {
  settings: unknown;
  recent: RecentFile[];
  /** 上传 Token 的密文（safeStorage 加密，base64；M-4、1.8 节） */
  uploadToken?: string;
  /** 每个文档上次导出的格式和位置（O-7），键是文档路径（不区分大小写的系统上是小写） */
  lastExports?: Record<string, LastExport>;
  /** 上次的窗口（F-16）：每个窗口的文档、工作区、侧栏 */
  session?: SessionWindow[];
  /** 最近一次的侧栏（W-7）：新窗口沿用 */
  lastLayout?: WindowLayout;
}

export interface SessionWindow {
  path: string | null;
  workspace: string | null;
  layout: WindowLayout | null;
}

let store: Store<Schema> | null = null;

const recentListeners = new Set<() => void>();

/** 最近文件变了（菜单「打开最近」跟着更新） */
export function onRecentChanged(listener: () => void): void {
  recentListeners.add(listener);
}

function setRecent(list: RecentFile[]): void {
  data().set("recent", list);
  for (const listener of recentListeners) listener();
}

/** app ready 以后才能建（要用 userData 目录） */
function data(): Store<Schema> {
  store ??= new Store<Schema>({ name: "config", defaults: { settings: {}, recent: [] } });
  return store;
}

export function getSettings(): Settings {
  return normalizeSettings(data().get("settings"));
}

const settingsListeners = new Set<(settings: Settings) => void>();

/** 设置变了（主进程里跟着变的：拼写检查的语言、菜单的勾） */
export function onSettingsChanged(listener: (settings: Settings) => void): void {
  settingsListeners.add(listener);
}

export function setSettings(patch: SettingsPatch): Settings {
  const next = applySettingsPatch(getSettings(), patch);
  data().set("settings", next);
  for (const listener of settingsListeners) listener(next);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(EVENTS.settingsChanged, next);
  }
  return next;
}

export function recentFiles(): RecentFile[] {
  const value = data().get("recent");
  return Array.isArray(value) ? value.filter((item) => item && typeof item.path === "string" && typeof item.openedAt === "number") : [];
}

/** 打开、另存以后记下（S-4「记录最近文件」关着时不记） */
export function addRecentFile(path: string): void {
  if (!getSettings().recordRecentFiles) return;
  const rest = recentFiles().filter((item) => item.path !== path);
  setRecent([{ path, openedAt: Date.now() }, ...rest].slice(0, RECENT_LIMIT));
}

/** 改名了（F-13）：最近文件里的路径跟着改 */
export function renameRecentFile(from: string, to: string): void {
  const list = recentFiles();
  if (list.some((item) => item.path === from)) setRecent(list.map((item) => (item.path === from ? { ...item, path: to } : item)));
}

export function removeRecentFile(path: string): RecentFile[] {
  const next = recentFiles().filter((item) => item.path !== path);
  setRecent(next);
  return next;
}

export function clearRecentFiles(): void {
  setRecent([]);
}

// ---------------------------------------------------------------------------
// 上传 Token（M-4、1.8 节）：用 safeStorage 加密后存；渲染进程只能设置、问有没有，拿不到明文

export function setUploadToken(token: string | null): void {
  const value = token?.trim();
  if (!value) {
    data().delete("uploadToken");
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error(t("error.encryptionUnavailable"));
  data().set("uploadToken", safeStorage.encryptString(value).toString("base64"));
}

export function hasUploadToken(): boolean {
  return typeof data().get("uploadToken") === "string";
}

/** 上传时用（主进程里）；解不开（换了系统账户这类）时当没有 */
export function uploadToken(): string | null {
  const stored = data().get("uploadToken");
  if (typeof stored !== "string") return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, "base64"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 上次导出（O-7）：记最近的 200 个文档

const EXPORTS_LIMIT = 200;

function exportKey(documentPath: string): string {
  return process.platform === "linux" ? documentPath : documentPath.toLowerCase();
}

export function lastExport(documentPath: string): LastExport | null {
  return data().get("lastExports")?.[exportKey(documentPath)] ?? null;
}

export function rememberExport(documentPath: string, last: LastExport): void {
  const key = exportKey(documentPath);
  const entries = Object.entries(data().get("lastExports") ?? {}).filter(([existing]) => existing !== key);
  data().set("lastExports", Object.fromEntries([[key, last], ...entries].slice(0, EXPORTS_LIMIT)));
}

// ---------------------------------------------------------------------------
// 会话（F-16）、侧栏（W-7）

/** 上次的窗口；读到坏的项跳过 */
export function savedSession(): SessionWindow[] {
  const value = data().get("session");
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SessionWindow =>
      !!item &&
      (item.path === null || typeof item.path === "string") &&
      (item.workspace === null || typeof item.workspace === "string") &&
      (item.layout === null || SCHEMAS.layout.safeParse(item.layout).success),
  );
}

export function saveSession(windows: SessionWindow[]): void {
  data().set("session", windows);
}

export function lastLayout(): WindowLayout | null {
  const parsed = SCHEMAS.layout.safeParse(data().get("lastLayout"));
  return parsed.success ? parsed.data : null;
}

export function setLastLayout(layout: WindowLayout): void {
  data().set("lastLayout", layout);
}

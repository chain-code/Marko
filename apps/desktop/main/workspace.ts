// 工作区（W 章）：列出文件夹和 Markdown 文件（文件夹在前、按名称的自然顺序；以 . 开头的不显示），
// 监听增删（W-2，@parcel/watcher），变了通知用这个工作区的窗口重新列
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { subscribe, type AsyncSubscription, type BackendType, type Event as WatcherEvent } from "@parcel/watcher";
import { BrowserWindow } from "electron";
import { EVENTS, type Workspace, type WorkspaceEntry } from "@marko/shared";

/** 工作区里算 Markdown 的扩展名（同打开对话框，F-3；全局搜索也只搜这些） */
export const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".mdown", ".mkd", ".mkdn", ".mdwn", ".mdtxt", ".mdtext", ".rmd"] as const;
const MARKDOWN = new Set<string>(MARKDOWN_EXTENSIONS);

export function isMarkdownFile(name: string): boolean {
  return MARKDOWN.has(extname(name).toLowerCase());
}

/** 最多列这么多项（文件夹和文件），超过的不列（truncated） */
const LIMIT = 20_000;

/** 不进去的文件夹：依赖目录里没有文档，文件又多（以 . 开头的本来就不显示） */
const SKIPPED_FOLDERS = new Set(["node_modules"]);

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** 列工作区；skipped 是没进去的目录（以 . 开头的、node_modules），监听时不看它们 */
export async function scanWorkspace(root: string): Promise<{ workspace: Workspace; skipped: string[] }> {
  let count = 0;
  let truncated = false;
  const skipped: string[] = [];
  const walk = async (directory: string, depth: number): Promise<WorkspaceEntry[]> => {
    if (depth > 32) return [];
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }
    const folders: WorkspaceEntry[] = [];
    const files: WorkspaceEntry[] = [];
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.name.startsWith(".") || (entry.isDirectory() && SKIPPED_FOLDERS.has(entry.name))) {
        if (entry.isDirectory()) skipped.push(path);
        continue;
      }
      if (count >= LIMIT) {
        truncated = true;
        break;
      }
      if (entry.isDirectory()) {
        count += 1;
        folders.push({ name: entry.name, path, kind: "folder", children: await walk(path, depth + 1) });
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        count += 1;
        files.push({ name: entry.name, path, kind: "file" });
      }
    }
    const byName = (left: WorkspaceEntry, right: WorkspaceEntry) => collator.compare(left.name, right.name);
    return [...folders.sort(byName), ...files.sort(byName)];
  };
  return { workspace: { root, entries: await walk(root, 0), truncated }, skipped };
}

export async function listWorkspace(root: string): Promise<Workspace> {
  return (await scanWorkspace(root)).workspace;
}

// ---------------------------------------------------------------------------
// 监听（@parcel/watcher，1.0 节）：每个工作区目录一个，没有窗口用它时退订。
// 只有增、删（改名是删加增）才重新列；文件内容变了文件树不变（保存时不用重新列）

interface Watched {
  /** 订阅是异步的；订阅不上（权限、网络盘）时是 null：不自动刷新，手动刷新照样能用 */
  subscription: Promise<AsyncSubscription | null>;
  windows: Set<number>;
  timer: ReturnType<typeof setTimeout> | null;
}

const watchers = new Map<string, Watched>();
const tracked = new WeakSet<BrowserWindow>();

/**
 * 各平台直接用系统的监听接口：不指定时它先找 watchman（Windows、Linux 上起一个进程去问），订阅是同步的，主进程一直等着——
 * 打开文件时侧栏跟着打开它所在的文件夹（W-1），每次都卡一下（本机 0.2 秒，CI 上更久）
 */
const BACKENDS: Partial<Record<NodeJS.Platform, BackendType>> = { win32: "windows", darwin: "fs-events", linux: "inotify" };

/** 以 . 开头的、依赖目录里的增删不管（文件树里本来就不列） */
const HIDDEN = /(^|[\\/])(\.[^\\/]+|node_modules)([\\/]|$)/;

function relevant(root: string, event: WatcherEvent): boolean {
  return event.type !== "update" && !HIDDEN.test(event.path.slice(root.length));
}

function notify(root: string): void {
  const entry = watchers.get(root);
  if (!entry) return;
  for (const window of BrowserWindow.getAllWindows()) {
    if (entry.windows.has(window.id) && !window.isDestroyed()) window.webContents.send(EVENTS.workspaceChanged, { root });
  }
}

/**
 * 这个窗口用 root 作为工作区（换了别的工作区的先退订）。skipped：列的时候跳过的目录（以 . 开头的、node_modules），
 * 交给监听器不看（Linux 上每个目录要占一个 inotify 监听）
 */
export function watchWorkspace(window: BrowserWindow, root: string, skipped: string[] = []): void {
  const id = window.id;
  unwatchWindow(id);
  let entry = watchers.get(root);
  if (!entry) {
    const created: Watched = { subscription: Promise.resolve(null), windows: new Set(), timer: null };
    created.subscription = subscribe(
      root,
      (error, events) => {
        if (error || !events.some((event) => relevant(root, event))) return;
        // 一次改很多文件（解压、git 切分支）时合成一次
        if (created.timer) clearTimeout(created.timer);
        created.timer = setTimeout(() => {
          created.timer = null;
          notify(root);
        }, 300);
      },
      { ignore: skipped, backend: BACKENDS[process.platform] },
    ).catch(() => null);
    watchers.set(root, created);
    entry = created;
  }
  entry.windows.add(id);
  if (!tracked.has(window)) {
    tracked.add(window);
    window.once("closed", () => unwatchWindow(id));
  }
}

/** W-1「关闭工作区文件夹」：这个窗口不再监听 */
export function stopWatchingWorkspace(window: BrowserWindow): void {
  unwatchWindow(window.id);
}

function unwatchWindow(id: number): void {
  for (const [root, entry] of watchers) {
    if (!entry.windows.delete(id) || entry.windows.size) continue;
    if (entry.timer) clearTimeout(entry.timer);
    void entry.subscription.then((subscription) => subscription?.unsubscribe());
    watchers.delete(root);
  }
}

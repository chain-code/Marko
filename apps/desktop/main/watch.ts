// 外部修改（F-12）：每个窗口盯着自己打开的文件。盯的是文件所在的目录（不递归，只看这个文件名）：别的程序常用
// 「写临时文件再改名」保存，直接盯文件会跟丢。有动静时读出来算指纹，和窗口记下的（打开、上次保存时的）比，
// 不一样才算外部修改——自己保存的不算（保存时主进程先记下新的指纹）。同一个变化只通知一次
import { realpathSync, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { FileChange } from "@marko/shared";
import { hashOf } from "./files.ts";

export interface WatchTarget {
  /** 窗口现在的文件和指纹 */
  current(): { path: string | null; hash: string | null } | null;
  notify(change: FileChange): void;
}

interface Watching {
  path: string;
  watcher: FSWatcher;
  timer: ReturnType<typeof setTimeout> | null;
  /** 已经通知过的磁盘状态（指纹，或者 DELETED） */
  notified: string | null;
}

const DELETED = "deleted";
/** 合并一次保存产生的几个事件（写临时文件、改名） */
const SETTLE = 150;

const watching = new Map<number, Watching>();

function sameName(left: string, right: string): boolean {
  return process.platform === "linux" ? left === right : left.toLowerCase() === right.toLowerCase();
}

/** 这个窗口现在打开的是 path（null：新文档，不盯） */
export function watchFile(id: number, path: string | null, target: WatchTarget): void {
  const existing = watching.get(id);
  if (existing && path && existing.path === path) return;
  unwatchFile(id);
  if (!path) return;
  // Windows 上目录要用完整的长路径：给 8.3 短路径（C:\Users\ABCDEF~1\...）时 libuv 的监听在第一个事件就断言失败，
  // 整个主进程退出。文件名也换成长名字（事件里给的是长名字）
  let directory: string;
  let name: string;
  try {
    directory = realpathSync.native(dirname(path));
  } catch {
    return;
  }
  try {
    name = basename(realpathSync.native(path));
  } catch {
    name = basename(path);
  }
  let watcher: FSWatcher;
  const entry: Watching = { path, watcher: null as unknown as FSWatcher, timer: null, notified: null };
  const check = async () => {
    entry.timer = null;
    const state = target.current();
    if (watching.get(id) !== entry || !state || state.path !== path) return;
    let disk: string;
    try {
      disk = hashOf(await readFile(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
      disk = DELETED;
    }
    // 和窗口里记下的一样：自己保存的、又改回去了
    if (disk === state.hash) {
      entry.notified = null;
      return;
    }
    if (disk === entry.notified) return;
    entry.notified = disk;
    target.notify({ path, deleted: disk === DELETED, hash: disk === DELETED ? null : disk });
  };
  try {
    watcher = watch(directory, { persistent: false }, (_event, changed) => {
      // 有的平台不给文件名：当成可能是它
      if (changed && !sameName(String(changed), name)) return;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => void check(), SETTLE);
    });
  } catch {
    // 目录不在了、没有权限：不盯
    return;
  }
  entry.watcher = watcher;
  watcher.on("error", () => unwatchFile(id));
  watching.set(id, entry);
}

export function unwatchFile(id: number): void {
  const entry = watching.get(id);
  if (!entry) return;
  watching.delete(id);
  if (entry.timer) clearTimeout(entry.timer);
  entry.watcher.close();
}

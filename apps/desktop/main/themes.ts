// 用户主题（A-3）：userData/themes 里的 *.css 出现在「主题」菜单里（不用重启）；user.css 加在任何主题后面。
// 盯着这个目录（不递归），文件增删改了重建菜单、通知窗口重新加载主题
import { mkdirSync, readdirSync, realpathSync, watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import postcss from "postcss";
import atImport from "postcss-import";
import postcssUrl from "postcss-url";
import { app, BrowserWindow, shell } from "electron";
import { EVENTS, type ThemeList } from "@marko/shared";
import { t } from "./i18n.ts";

/** 内置主题（A-1）的 id；名字跟着界面语言（themes.<id>） */
export const BUILT_IN_THEMES = ["solo", "dark"] as const;

/** 用户主题的 id：user:<文件名> */
export const USER_PREFIX = "user:";

let directory: string | null = null;

export function themesDirectory(): string {
  if (!directory) {
    directory = join(app.getPath("userData"), "themes");
    mkdirSync(directory, { recursive: true });
  }
  return directory;
}

/** 主题文件变一次加一（渲染进程拿它让浏览器重新取样式，不用缓存的） */
let version = 0;

export function themeList(): ThemeList {
  let files: string[] = [];
  try {
    files = readdirSync(themesDirectory()).filter((name) => name.toLowerCase().endsWith(".css"));
  } catch {
    files = [];
  }
  const userCss = files.some((name) => name.toLowerCase() === "user.css");
  const user = files
    .filter((name) => name.toLowerCase() !== "user.css")
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ id: `${USER_PREFIX}${name}`, name: name.replace(/\.css$/i, ""), builtIn: false }));
  const builtIn = BUILT_IN_THEMES.map((id) => ({ id, name: t(`themes.${id}`), builtIn: true }));
  return { themes: [...builtIn, ...user], userCss, version };
}

let watcher: FSWatcher | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 盯着主题目录：变了以后 onChange（重建菜单），再通知所有窗口 */
export function watchThemes(onChange: () => void): void {
  if (watcher) return;
  try {
    // 同 watch.ts：Windows 上要用完整的长路径
    watcher = watch(realpathSync.native(themesDirectory()), { persistent: false }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        version += 1;
        onChange();
        const list = themeList();
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send(EVENTS.themesChanged, list);
      }, 200);
    });
    watcher.on("error", () => {
      watcher?.close();
      watcher = null;
    });
  } catch {
    watcher = null;
  }
}

/**
 * 导出、打印用的主题样式（A-3）：主题文件 @import 的子样式表展开，按相对路径引用的字体、图片转成 data URI，
 * 导出的文件离开主题目录也是一样的样子。只给主题目录里的 .css
 */
export async function exportThemeCss(file: string, root = themesDirectory()): Promise<string> {
  const path = resolve(root, file);
  const inside = relative(root, path);
  if (!inside || inside.startsWith("..") || isAbsolute(inside) || extname(path).toLowerCase() !== ".css") throw new Error(`not a theme file: ${file}`);
  const css = await readFile(path, "utf8");
  const result = await postcss([atImport({ root }), postcssUrl({ url: "inline" })]).process(css, { from: path, to: path });
  return result.css;
}

export function openThemesFolder(): void {
  void shell.openPath(themesDirectory());
}

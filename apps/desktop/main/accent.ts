// 系统的强调色（B-5，同 Typora：任务的复选框跟着系统的强调色）。新版的 Chromium 不再把系统的强调色交给网页
// （accent-color: auto、AccentColor 都是固定的蓝色），主进程读出来，写进页面的 CSS 变量 --app-system-accent
import { BrowserWindow, systemPreferences } from "electron";

const supported = process.platform === "win32" || process.platform === "darwin";

/** 写进页面的样式；读不到（Linux、出错）时是 null，页面用浏览器默认的颜色 */
function accentCss(): string | null {
  if (!supported) return null;
  try {
    const color = systemPreferences.getAccentColor();
    return /^[0-9a-f]{8}$/i.test(color) ? `:root{--app-system-accent:#${color.slice(0, 6)}}` : null;
  } catch {
    return null;
  }
}

const inserted = new WeakMap<BrowserWindow, string>();

async function apply(window: BrowserWindow): Promise<void> {
  const css = accentCss();
  if (!css || window.isDestroyed()) return;
  const previous = inserted.get(window);
  if (previous) await window.webContents.removeInsertedCSS(previous).catch(() => undefined);
  inserted.set(window, await window.webContents.insertCSS(css));
}

/** 窗口加载完（含重新加载）时写进去 */
export function trackAccentColor(window: BrowserWindow): void {
  window.webContents.on("did-finish-load", () => void apply(window));
}

/** 系统的强调色变了（Windows）：所有窗口跟着换 */
export function watchAccentColor(): void {
  if (process.platform !== "win32") return;
  systemPreferences.on("accent-color-changed", () => {
    for (const window of BrowserWindow.getAllWindows()) void apply(window);
  });
}

// 缩放（V-5）：Electron 的页面缩放（侧栏、编辑区一起），所有窗口共用一个比例，存在设置里；每次 5%，75%～150%。
// Chromium 的缩放按源记（同一个 app:// 源的窗口本来就跟着变），新窗口加载完、改了设置时再设一次
import { BrowserWindow } from "electron";
import { getSettings, setSettings } from "./store.ts";

export const ZOOM_STEP = 0.05;
export const ZOOM_MIN = 0.75;
export const ZOOM_MAX = 1.5;

export function clampZoom(value: number): number {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 100) / 100;
}

export function applyZoom(window: BrowserWindow, zoom = getSettings().zoom): void {
  if (!window.isDestroyed()) window.webContents.setZoomFactor(clampZoom(zoom));
}

/** delta：放大、缩小多少；null 是实际大小 */
export function changeZoom(delta: number | null): void {
  const next = delta === null ? 1 : clampZoom(getSettings().zoom + delta);
  setSettings({ zoom: next });
  for (const window of BrowserWindow.getAllWindows()) applyZoom(window, next);
}

/** 新窗口：加载完按设置缩放；Ctrl+滚轮也按 5% 一步、所有窗口一起 */
export function trackZoom(window: BrowserWindow): void {
  window.webContents.on("did-finish-load", () => applyZoom(window));
  window.webContents.on("zoom-changed", (_event, direction) => changeZoom(direction === "in" ? ZOOM_STEP : -ZOOM_STEP));
}

// 权限（1.10 节）：Electron 默认把网页要的权限全部放行。应用页面和文档里嵌的网页（iframe）都不该拿到
// 摄像头、麦克风、定位、剪贴板读取、通知、MIDI 之类的权限，这里改成默认拒绝，只留下面列的几样
import { session, type Session } from "electron";
import { APP_HOST, APP_SCHEME } from "./protocol.ts";

const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** 来源（协议 + 主机）。Node 的 URL 不认识自定义协议，origin 会是 "null"，所以自己拼 */
function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

/** 这个来源能不能用这项权限 */
export function isPermissionAllowed(permission: string, requestingUrl: string): boolean {
  // 视频全屏：文档里的 <video>、嵌入的视频网站（iframe 的 allow 见 render/sanitize.ts）
  if (permission === "fullscreen") return true;
  // 应用页面自己往剪贴板写（复制为 Markdown、HTML，C-1、C-2）
  if (permission === "clipboard-sanitized-write") return originOf(requestingUrl) === APP_ORIGIN;
  return false;
}

export function installPermissionHandlers(target: Session = session.defaultSession): void {
  target.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(isPermissionAllowed(permission, details.requestingUrl ?? ""));
  });
  target.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => isPermissionAllowed(permission, requestingOrigin));
  // WebHID、WebUSB、Web Serial 之类的设备一律不给
  target.setDevicePermissionHandler(() => false);
}

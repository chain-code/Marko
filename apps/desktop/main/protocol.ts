// app:// 协议：加载应用页面并加上 CSP 响应头（1.10 节）。marko-asset://：文档里引用的本地图片、视频、音频（M-1、M-7），
// 只返回这几类文件，其他一律拒绝
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { ASSET_SCHEME } from "@marko/shared";

export const APP_SCHEME = "app";
export const APP_HOST = "marko";

/** 应用页面的 CSP（1.10 节）。上传、更新检查都由主进程发请求，渲染进程不需要联网 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // 用户主题（A-3）从 marko-theme: 加载样式、字体、图片
  "style-src 'self' 'unsafe-inline' marko-theme:",
  "img-src 'self' marko-asset: marko-theme: data: blob: https: http:",
  "media-src marko-asset: blob: https: http:",
  "font-src 'self' marko-theme: data:",
  "connect-src 'self' marko-theme:",
  "frame-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

/**
 * 图表沙箱页（1.2 节）的 CSP：只跑应用自己的脚本和样式，不能联网、不能嵌页面。
 * 末尾的 sandbox 指令兜底：就算被当成顶层页面打开，也是没有任何权限的不透明源
 */
export const SANDBOX_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `script-src ${APP_SCHEME}://${APP_HOST}`,
  `style-src ${APP_SCHEME}://${APP_HOST} 'unsafe-inline'`,
  "img-src data: blob:",
  "font-src data:",
  "base-uri 'none'",
  "form-action 'none'",
  "sandbox allow-scripts",
].join("; ");

/** 必须在 app ready 之前调用。 */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      // corsEnabled：图表沙箱是不透明源，加载 assets/ 下的模块脚本要走 CORS
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true, corsEnabled: true },
    },
    // stream：视频、音频拖动进度要按范围读
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
    // 用户主题（A-3）：字体跨源加载要 CORS；导出时渲染进程要读主题的 CSS（fetch）
    { scheme: THEME_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
}

/** app://marko/<路径> 里解码后的路径，不带开头的斜杠；主机名不对、编码坏了返回 null */
function appPath(requestUrl: string): string | null {
  const url = new URL(requestUrl);
  if (url.host !== APP_HOST) return null;
  try {
    return decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  } catch {
    return null;
  }
}

/** 把 app://marko/<路径> 映射到渲染进程的构建目录里的文件；越出目录的、就是目录本身的返回 null（404）。 */
export function resolveAppFile(rendererRoot: string, requestUrl: string): string | null {
  const relative = appPath(requestUrl);
  if (relative === null) return null;
  const root = normalize(rendererRoot);
  const file = normalize(join(root, relative));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) return null;
  return file;
}

/**
 * 文件相对构建目录的路径，统一成小写、正斜杠：按它决定响应头。
 * Windows、macOS 的文件名不分大小写，`Sandbox.html` 和 `sandbox.html` 是同一个文件，判断时不能按请求里的写法
 */
function servedPath(rendererRoot: string, file: string): string {
  return relative(normalize(rendererRoot), file).split(sep).join("/").toLowerCase();
}

/** app:// 响应要加的头；file 是 resolveAppFile 解析出的文件 */
export function appResponseHeaders(rendererRoot: string, file: string): Record<string, string> {
  const path = servedPath(rendererRoot, file);
  const headers: Record<string, string> = {
    // 只有应用主页面用应用的 CSP；别的页面（图表沙箱，以后再加的）一律用最严的那套
    "Content-Security-Policy": path === "index.html" ? CONTENT_SECURITY_POLICY : SANDBOX_CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
  };
  // 沙箱 iframe 的 Origin 是 null：构建出的脚本、样式对它放行（本来就是应用自带的公开代码），页面本身不放行
  if (path.startsWith("assets/")) headers["Access-Control-Allow-Origin"] = "null";
  return headers;
}

// 地址的写法在 shared 里（渲染进程拼地址也用它）
export { ASSET_SCHEME, assetUrl } from "@marko/shared";
import { mediaKindOfPath } from "@marko/shared";

/** marko-asset:// 只返回图片、视频、音频（扩展名表在 shared，1.10 节） */
export function isMediaPath(path: string): boolean {
  return mediaKindOfPath(path) !== null;
}


/** marko-asset://local/<路径> → 本地文件的绝对路径；不是这个形式、不是媒体文件返回 null */
export function assetPath(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${ASSET_SCHEME}:` || url.host !== "local") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  // Windows：/C:/a/b.png；别的系统：/home/a/b.png
  const withDrive = /^\/[a-zA-Z]:\//.test(decoded);
  // Windows 上必须带盘符（「/a.png」是当前盘的根目录，不算）
  if (process.platform === "win32" && !withDrive) return null;
  const path = withDrive ? decoded.slice(1) : decoded;
  if (!isAbsolute(path) || !isMediaPath(path)) return null;
  return normalize(path);
}

export function handleAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const path = assetPath(request.url);
    if (!path) return new Response("Forbidden", { status: 403 });
    try {
      // 交给 file: 处理：类型、按范围读（视频拖动）都是现成的
      return await net.fetch(pathToFileURL(path).toString(), { headers: request.headers });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

export function handleAppProtocol(rendererRoot: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppFile(rendererRoot, request.url);
    if (!file) return new Response("Not found", { status: 404 });
    let response: Response;
    try {
      response = await net.fetch(pathToFileURL(file).toString());
    } catch {
      // 文件不存在、是目录、读不了
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(appResponseHeaders(rendererRoot, file))) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  });
}

// ---------------------------------------------------------------------------
// 用户主题（A-3）：marko-theme://local/<主题目录里的相对路径>。只给主题目录里的样式、字体、图片：
// Typora 的主题按相对路径引用自己目录里的字体、子样式表，放在同一个地址下面就都能找到

export const THEME_SCHEME = "marko-theme";

const THEME_FILES = new Set(["css", "woff", "woff2", "ttf", "otf", "eot", "svg", "png", "jpg", "jpeg", "gif", "webp"]);

/** marko-theme://local/<相对路径> → 主题目录里的文件；跑出目录、不是这几种文件返回 null */
export function themeFilePath(directory: string, requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${THEME_SCHEME}:` || url.host !== "local") return null;
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }
  const file = resolve(directory, relativePath);
  const inside = relative(directory, file);
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) return null;
  if (!THEME_FILES.has(extname(file).slice(1).toLowerCase())) return null;
  return file;
}

export function handleThemeProtocol(directory: () => string): void {
  protocol.handle(THEME_SCHEME, async (request) => {
    const file = themeFilePath(directory(), request.url);
    if (!file) return new Response("Forbidden", { status: 403 });
    let response: Response;
    try {
      response = await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
    const headers = new Headers(response.headers);
    // 字体跨源（app: 页面加载 marko-theme: 的字体）要这个头
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "no-cache");
    return new Response(response.body, { status: response.status, headers });
  });
}

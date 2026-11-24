// HTML 转义；地址的安全检查（X-1：javascript: 等一律不给）

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => (char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : "&quot;"));
}

export function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/'/g, "&#39;");
}

/** 链接、图片地址允许的协议；没有协议的（相对路径、#锚点）都允许 */
const SAFE_SCHEME = /^(?:https?|mailto|marko-asset|file|data):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** data: 只给常见的位图（SVG 里可以带脚本，不给） */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);/i;

export function safeUrl(url: string, kind: "link" | "image" | "media" = "link"): string | null {
  // 控制字符、空白可以用来混淆协议（"java\nscript:"），去掉后再判断
  const compact = url.replace(/[\u0000- \u007f]+/g, "");
  if (!HAS_SCHEME.test(compact)) return url;
  if (!SAFE_SCHEME.test(compact)) return null;
  if (/^data:/i.test(compact)) return kind === "image" && SAFE_DATA_IMAGE.test(compact) ? url : null;
  return url;
}

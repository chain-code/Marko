// 渲染进程里的路径计算（没有 node:path）：Windows 的反斜杠、盘符和 POSIX 的都认

/** 用的哪种分隔符（路径里有反斜杠就按 Windows） */
function separatorOf(path: string): "\\" | "/" {
  return /\\/.test(path) || /^[a-zA-Z]:/.test(path) ? "\\" : "/";
}

export function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (index < 0) return "";
  // 根目录（「/」「C:\」）保留分隔符
  if (index === 0) return path.slice(0, 1);
  if (index === 2 && /^[a-zA-Z]:/.test(path)) return path.slice(0, 3);
  return path.slice(0, index);
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function isAbsolute(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

/** 目录 + 相对路径（处理 . 和 ..），用目录的分隔符 */
export function join(directory: string, relative: string): string {
  const separator = separatorOf(directory);
  const drive = /^[a-zA-Z]:/.exec(directory)?.[0] ?? "";
  const rooted = directory.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(directory);
  const parts = directory.slice(drive.length).split(/[\\/]+/).filter(Boolean);
  for (const part of relative.split(/[\\/]+/)) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `${drive}${rooted ? separator : ""}${parts.join(separator)}`;
}

/** 本地路径 → file:// 地址（每段按 URL 编码，盘符照写） */
export function fileUrl(path: string): string {
  const segments = path.replace(/\\/g, "/").split("/");
  const encoded = segments.map((segment, index) => (index === 0 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)));
  const joined = encoded.join("/");
  return `file://${joined.startsWith("/") ? "" : "/"}${joined}`;
}

/** 文档里写的图片地址 → 导出用的：网址、data: 原样；本地路径（相对文档所在目录）换成 file:// 绝对地址 */
export function exportImageUrl(url: string, documentPath: string | null): string {
  if (!url || url.startsWith("#") || url.startsWith("//")) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[a-zA-Z]:[\\/]/.test(url)) return url;
  let path = url.split(/[?#]/)[0];
  try {
    path = decodeURI(path);
  } catch {
    // 不合法的转义：照原样
  }
  if (isAbsolute(path)) return fileUrl(path);
  return documentPath ? fileUrl(join(dirname(documentPath), path)) : url;
}

/** from 目录到 to 的相对路径（用正斜杠；不在同一个盘上时是 null）。Windows、macOS 上不分大小写 */
export function relativePath(from: string, to: string): string | null {
  const split = (path: string) => path.split(/[\\/]+/).filter(Boolean);
  const fromParts = split(from);
  const toParts = split(to);
  const caseless = /^[a-zA-Z]:/.test(from) || /^[a-zA-Z]:/.test(to) || separatorOf(from) === "\\";
  const same = (left: string, right: string) => (caseless ? left.toLowerCase() === right.toLowerCase() : left === right);
  if (!fromParts.length || !toParts.length || !same(fromParts[0], toParts[0])) return null;
  let common = 0;
  while (common < fromParts.length && common < toParts.length && same(fromParts[common], toParts[common])) common += 1;
  return [...Array(fromParts.length - common).fill(".."), ...toParts.slice(common)].join("/");
}

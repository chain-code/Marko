// 插入本地媒体（M-2、M-3、M-7）：按 S-9「插入本地媒体时」把图片、视频、音频复制到文档旁边，返回写进 Markdown 的地址。
// 粘贴的图片没有原文件：按同样的位置存成文件（「无特殊操作」时存到 ./assets）。重名时加序号，不覆盖已有文件
import { constants } from "node:fs";
import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, sep } from "node:path";
import { MEDIA_EXTENSIONS, type MediaSaveRequest, type Settings } from "@marko/shared";
import { t } from "./i18n.ts";

/** 「插入本地图片...」能选的（同 marko-asset:// 能显示的媒体） */
export function mediaFilters(): Electron.FileFilter[] {
  return [
    { name: t("dialog.images"), extensions: [...MEDIA_EXTENSIONS.image] },
    { name: t("dialog.videos"), extensions: [...MEDIA_EXTENSIONS.video] },
    { name: t("dialog.audio"), extensions: [...MEDIA_EXTENSIONS.audio] },
  ];
}

type MediaSettings = Pick<Settings, "imageInsertAction" | "escapeImageUrls" | "addDotSlashToRelativeImagePath">;

/** 复制到哪个目录；null 表示不复制（「无特殊操作」，直接引用原文件） */
export function targetDirectory(documentPath: string, settings: MediaSettings, pasted: boolean): string | null {
  const directory = dirname(documentPath);
  switch (settings.imageInsertAction) {
    case "current":
      return directory;
    case "assets":
      return join(directory, "assets");
    case "documentAssets":
      return join(directory, `${basename(documentPath, extname(documentPath))}.assets`);
    default:
      // 粘贴的图片没有原文件可引用：存到 ./assets
      return pasted ? join(directory, "assets") : null;
  }
}

/** 文件名里不能有的字换掉 */
function safeName(name: string): string {
  const cleaned = basename(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim();
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "media";
}

/** 粘贴的图片按时间起名（同 Typora：image-年月日时分秒毫秒.png） */
export function pastedName(name: string, now = new Date()): string {
  const pad = (value: number, length = 2) => String(value).padStart(length, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
  const extension = extname(name).toLowerCase() || ".png";
  return `image-${stamp}${extension}`;
}

function sameDirectory(left: string, right: string): boolean {
  const normalize = (path: string) => (process.platform === "linux" ? path : path.toLowerCase()).replace(/[\\/]+$/, "");
  return normalize(left) === normalize(right);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** 目录里不重名的路径：name.png、name-1.png、name-2.png…… */
export async function uniquePath(directory: string, name: string): Promise<string> {
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let index = 0; ; index += 1) {
    const candidate = join(directory, index ? `${stem}-${index}${extension}` : name);
    if (!(await exists(candidate))) return candidate;
  }
}

/** 地址里会弄坏 Markdown 的字转义（S-9「自动转义图片 URL」）；中文等原样保留，方便阅读 */
function escapeUrl(url: string): string {
  // encodeURIComponent 不转括号，这里按字符码直接写（都是 ASCII）
  return url.replace(/[%\s#?()<>]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

/**
 * 写进 Markdown 的地址：在文档目录里面的写相对路径（S-9「相对路径添加 ./」），外面的写绝对路径；
 * 一律用正斜杠（反斜杠在 Markdown 里是转义符）
 */
export function markdownPathOf(documentPath: string | null, file: string, settings: MediaSettings): string {
  const fromDocument = documentPath ? relative(dirname(documentPath), file) : "";
  const inside = !!fromDocument && !fromDocument.startsWith("..") && !isAbsolute(fromDocument);
  let url = (inside ? fromDocument : file).split(sep).join("/");
  if (inside && settings.addDotSlashToRelativeImagePath) url = `./${url}`;
  return settings.escapeImageUrls ? escapeUrl(url) : url;
}

/** 保存（复制或写入）以后磁盘上的文件；不复制时是原文件 */
export async function storeMedia(request: MediaSaveRequest, settings: MediaSettings): Promise<string> {
  const pasted = !request.sourcePath;
  if (!request.documentPath) {
    // 新文档：只能引用原文件（渲染进程在要复制时先让用户保存，M-3）
    if (pasted || settings.imageInsertAction !== "none") throw new Error(t("error.documentNotSaved"));
    return request.sourcePath!;
  }
  const directory = targetDirectory(request.documentPath, settings, pasted);
  if (!directory) return request.sourcePath!;
  // 已经在要复制到的目录里了：直接用它，不再复制一份
  if (request.sourcePath && sameDirectory(dirname(request.sourcePath), directory)) return request.sourcePath;
  await mkdir(directory, { recursive: true });
  const target = await uniquePath(directory, pasted ? pastedName(request.name) : safeName(request.name));
  if (request.sourcePath) await copyFile(request.sourcePath, target, constants.COPYFILE_EXCL);
  else await writeFile(target, request.data!, { flag: "wx" });
  return target;
}

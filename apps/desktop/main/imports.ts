// F-19：导入的文档里的图片，Pandoc 先提取到 userData/imports/<编号>/ 下（文档还没有位置）。保存时复制到文档旁边：
// 按 M-3 的目录（S-9「插入本地媒体时」；「无特殊操作」时同粘贴的图片，放 ./assets），文档里的地址改成相对路径
import { constants } from "node:fs";
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { app } from "electron";
import type { Settings } from "@marko/shared";
import { markdownPathOf, targetDirectory, uniquePath } from "./media.ts";

export function importsDirectory(): string {
  return join(app.getPath("userData"), "imports");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 文字里指向导入目录的地址（原样，用来替换）：分隔符正斜杠、反斜杠都认，空格写成 %20 的也认；
 * 地址到空白、括号、引号、尖括号为止（Pandoc 提取出来的文件名里没有这些）
 */
export function importedReferences(content: string, root: string): string[] {
  const prefix = escapeRegExp(root.replace(/[\\/]+$/, ""))
    .replace(/\\\\|\//g, "[\\\\/]")
    .replace(/ /g, "(?: |%20)");
  const pattern = new RegExp(`${prefix}[\\\\/][^\\s)"'<>]+`, process.platform === "win32" ? "gi" : "g");
  return [...new Set(content.match(pattern) ?? [])];
}

function decodeReference(reference: string): string {
  try {
    return normalize(decodeURI(reference));
  } catch {
    return normalize(reference);
  }
}

/** X-1：地址规范化以后要还在导入目录里（文档里写 imports/../../x 不能把别的文件复制出来） */
function isInside(root: string, path: string): boolean {
  const rest = relative(resolve(root), resolve(path));
  return rest !== "" && !rest.startsWith("..") && !isAbsolute(rest);
}

export interface ImportRewrite {
  from: string;
  to: string;
}

/** 把文档引用的导入图片复制到文档旁边；返回要改写的地址（原样 → 新的相对路径） */
export async function copyImportedMedia(content: string, documentPath: string, settings: Settings, root = importsDirectory()): Promise<ImportRewrite[]> {
  const references = importedReferences(content, root);
  if (!references.length) return [];
  const directory = targetDirectory(documentPath, settings, true)!;
  const rewrites: ImportRewrite[] = [];
  const copied = new Map<string, string>();
  for (const reference of references) {
    const source = decodeReference(reference);
    if (!isInside(root, source)) continue;
    let url = copied.get(source);
    if (!url) {
      const exists = await stat(source).then((info) => info.isFile(), () => false);
      if (!exists) continue;
      await mkdir(directory, { recursive: true });
      const target = await uniquePath(directory, basename(source));
      await copyFile(source, target, constants.COPYFILE_EXCL);
      url = markdownPathOf(documentPath, target, settings);
      copied.set(source, url);
    }
    rewrites.push({ from: reference, to: url });
  }
  return rewrites;
}

export function applyRewrites(content: string, rewrites: readonly ImportRewrite[]): string {
  // 长的先换：一个地址是另一个的前缀时不会换错
  return [...rewrites].sort((left, right) => right.from.length - left.from.length).reduce((text, { from, to }) => text.split(from).join(to), content);
}

/** 启动时清掉放了很久的导入目录（导入的文档早就保存过、图片复制走了） */
export async function cleanupImports(maxAgeDays = 30, now = Date.now()): Promise<void> {
  const root = importsDirectory();
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name);
    const info = await stat(path).catch(() => null);
    if (info && now - info.mtimeMs > maxAgeDays * 24 * 60 * 60 * 1000) await rm(path, { recursive: true, force: true }).catch(() => undefined);
  }
}

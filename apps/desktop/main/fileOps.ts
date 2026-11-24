// 文件操作（F-13、W-6）：在文件夹里新建 Markdown 文件、文件夹，改名。都不覆盖已有的（已经有了报 EEXIST）
import { access, mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { t } from "./i18n.ts";

/**
 * 拖到窗口上的路径分一分（F-15）：文件夹（第一个作为工作区打开）、Markdown 文件（按 F-3 打开）；
 * 别的文件（图片这些由编辑区自己插入）、不存在的不管
 */
export async function classifyDropped(paths: readonly string[], markdownExtensions: readonly string[]): Promise<{ folders: string[]; documents: string[] }> {
  const folders: string[] = [];
  const documents: string[] = [];
  for (const path of paths) {
    const info = await stat(path).catch(() => null);
    if (!info) continue;
    if (info.isDirectory()) folders.push(path);
    else if (info.isFile() && markdownExtensions.includes(extname(path).toLowerCase())) documents.push(path);
  }
  return { folders, documents };
}

/** 新建空的 Markdown 文件：名字没写扩展名时加 .md */
export async function createMarkdownFile(directory: string, name: string): Promise<string> {
  const target = join(directory, extname(name) ? name : `${name}.md`);
  await writeFile(target, "", { flag: "wx" });
  return target;
}

export async function createFolder(directory: string, name: string): Promise<string> {
  const target = join(directory, name);
  await mkdir(target);
  return target;
}

/** 改名后的路径：同一个文件夹；新名字没写扩展名时沿用原来的（F-13「只改文件名，扩展名不变」） */
export function renamedPath(path: string, name: string): string {
  return join(dirname(path), extname(name) ? name : `${name}${extname(path)}`);
}

export async function renameFile(path: string, target: string): Promise<void> {
  // 不覆盖已有的文件（只改大小写时是同一个文件，可以）
  if (target.toLowerCase() !== path.toLowerCase()) {
    let exists = true;
    try {
      await access(target);
    } catch {
      exists = false;
    }
    if (exists) throw Object.assign(new Error(t("error.fileExists")), { code: "EEXIST" });
  }
  await rename(path, target);
}

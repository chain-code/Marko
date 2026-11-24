// 草稿（F-9、1.8 节）：每个窗口没保存的内容，渲染进程停止输入 1 秒后发过来，写到 userData/drafts/<id>.md 和 <id>.json
// （原路径、原文件的指纹、编码、时间）；正常保存、选「不保存」、换了文件以后删掉。
// 下次启动时还在的就是异常退出（崩溃、断电、系统重启）留下的：按它们开窗口恢复
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import writeFileAtomic from "write-file-atomic";
import { SCHEMAS, type DraftSaveRequest, type RecoveredDraft } from "@marko/shared";
import { readDocument } from "./files.ts";

type Meta = ReturnType<typeof SCHEMAS.draftMeta.parse>;

let directory: string | null = null;

/** 草稿目录（测试里换成临时目录） */
export function draftsDirectory(): string {
  directory ??= join(app.getPath("userData"), "drafts");
  return directory;
}

export function setDraftsDirectory(path: string): void {
  directory = path;
}

export async function saveDraft(request: DraftSaveRequest): Promise<void> {
  const root = draftsDirectory();
  await mkdir(root, { recursive: true });
  // 先写内容再写说明：恢复时只认两个都在的
  await writeFileAtomic(join(root, `${request.id}.md`), request.content, "utf8");
  const meta: Meta = { id: request.id, path: request.path, encoding: request.encoding, bom: request.bom, hash: request.hash, savedAt: Date.now() };
  await writeFileAtomic(join(root, `${request.id}.json`), JSON.stringify(meta), "utf8");
}

export async function removeDraft(id: string): Promise<void> {
  const root = draftsDirectory();
  await rm(join(root, `${id}.json`), { force: true });
  await rm(join(root, `${id}.md`), { force: true });
}

/** 启动时：上次异常退出留下的草稿，按保存的时间排；原文件还在的读出磁盘上现在的版本 */
export async function recoverDrafts(): Promise<RecoveredDraft[]> {
  const root = draftsDirectory();
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const drafts: Array<RecoveredDraft & { savedAt: number }> = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    let meta: Meta;
    let content: string;
    try {
      meta = SCHEMAS.draftMeta.parse(JSON.parse(await readFile(join(root, name), "utf8")));
      content = await readFile(join(root, `${meta.id}.md`), "utf8");
    } catch {
      // 说明坏了、内容不在：不是能恢复的草稿
      continue;
    }
    let disk = null;
    if (meta.path) {
      try {
        disk = await readDocument(meta.path, meta.encoding);
      } catch {
        disk = null;
      }
    }
    // 磁盘上的和草稿内容一样：没有要恢复的改动（保存成功了但没来得及删草稿）
    if (disk && disk.content === content) {
      await removeDraft(meta.id);
      continue;
    }
    drafts.push({
      id: meta.id,
      path: meta.path,
      content,
      encoding: meta.encoding,
      bom: meta.bom,
      disk,
      diskChanged: !!disk && meta.hash !== null && disk.hash !== meta.hash,
      savedAt: meta.savedAt,
    });
  }
  return drafts.sort((left, right) => left.savedAt - right.savedAt).map(({ savedAt: _savedAt, ...draft }) => draft);
}

/** 不恢复了（S-3「恢复未保存的草稿」关着）：上次留下的都删掉 */
export async function clearDrafts(): Promise<void> {
  await rm(draftsDirectory(), { recursive: true, force: true });
}

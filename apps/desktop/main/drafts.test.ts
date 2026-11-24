// 草稿（F-9）、外部修改（F-12）：在临时目录里真的写文件
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FileChange } from "@marko/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recoverDrafts, removeDraft, saveDraft, setDraftsDirectory } from "./drafts.ts";
import { hashOf } from "./files.ts";
import { unwatchFile, watchFile } from "./watch.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marko-drafts-"));
  setDraftsDirectory(join(root, "drafts"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("F-9 草稿", () => {
  it("写了的草稿启动时恢复：新文档的；原文件被改过的标出来；和磁盘上一样的不算（删掉）；删掉的不再恢复", async () => {
    const file = join(root, "a.md");
    writeFileSync(file, "original");
    const hash = hashOf(Buffer.from("original"));
    await saveDraft({ id: "draft-untitled", path: null, content: "# 新的", encoding: "utf-8", bom: false, hash: null });
    await saveDraft({ id: "draft-file-1", path: file, content: "edited", encoding: "utf-8", bom: false, hash });
    // 内容和恢复时磁盘上的一样：保存成功了但没来得及删草稿
    await saveDraft({ id: "draft-same-1", path: file, content: "changed on disk", encoding: "utf-8", bom: false, hash });
    writeFileSync(file, "changed on disk");

    const drafts = await recoverDrafts();
    expect(drafts.map((draft) => draft.id).sort()).toEqual(["draft-file-1", "draft-untitled"]);
    const edited = drafts.find((draft) => draft.id === "draft-file-1")!;
    expect(edited).toMatchObject({ path: file, content: "edited", diskChanged: true });
    expect(edited.disk?.content).toBe("changed on disk");
    expect(drafts.find((draft) => draft.id === "draft-untitled")).toMatchObject({ path: null, disk: null, diskChanged: false });

    await removeDraft("draft-file-1");
    expect((await recoverDrafts()).map((draft) => draft.id)).toEqual(["draft-untitled"]);
  });

  it("原文件不在了：照样恢复，没有磁盘上的版本", async () => {
    await saveDraft({ id: "draft-gone-1", path: join(root, "gone.md"), content: "text", encoding: "utf-8", bom: false, hash: "x" });
    const [draft] = await recoverDrafts();
    expect(draft).toMatchObject({ id: "draft-gone-1", disk: null, diskChanged: false });
  });
});

describe("F-12 外部修改", () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // 临时目录在这台机器上是 8.3 短路径（C:\Users\ABCDEF~1\...）：也是 libuv 监听短路径时断言失败、进程退出的回归测试
  it("别的程序改了、删了：通知；自己保存的（指纹和记下的一样）不通知；同一个变化只通知一次", async () => {
    const file = join(root, "doc.md");
    writeFileSync(file, "v1");
    const state = { path: file as string | null, hash: hashOf(Buffer.from("v1")) as string | null };
    const changes: FileChange[] = [];
    watchFile(1, file, { current: () => state, notify: (change) => changes.push(change) });
    try {
      // 自己保存：先记下新指纹再写
      state.hash = hashOf(Buffer.from("v2"));
      writeFileSync(file, "v2");
      await wait(500);
      expect(changes).toEqual([]);
      // 别的程序改了（两次写同样的内容只通知一次）
      writeFileSync(file, "v3");
      await wait(300);
      writeFileSync(file, "v3");
      await wait(500);
      expect(changes).toEqual([{ path: file, deleted: false, hash: hashOf(Buffer.from("v3")) }]);
      unlinkSync(file);
      await wait(500);
      expect(changes.at(-1)).toEqual({ path: file, deleted: true, hash: null });
    } finally {
      unwatchFile(1);
    }
  });
});

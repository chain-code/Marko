// 插入本地媒体（M-2、M-3、M-7）：复制到哪、重名、写进 Markdown 的地址
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { markdownPathOf, pastedName, storeMedia, targetDirectory, uniquePath } from "./media.ts";

let root: string;
let documentPath: string;

const settings = (action: "none" | "current" | "assets" | "documentAssets", extra: { escapeImageUrls?: boolean; addDotSlashToRelativeImagePath?: boolean } = {}) => ({
  imageInsertAction: action,
  escapeImageUrls: extra.escapeImageUrls ?? true,
  addDotSlashToRelativeImagePath: extra.addDotSlashToRelativeImagePath ?? false,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marko-media-"));
  documentPath = join(root, "notes", "周报.md");
  mkdirSync(join(root, "notes"));
  writeFileSync(documentPath, "# 周报\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("M-3 复制到哪里", () => {
  it("按设置：当前文件夹、./assets、./${filename}.assets；无特殊操作时不复制（粘贴的存到 ./assets）", () => {
    const directory = join(root, "notes");
    expect(targetDirectory(documentPath, settings("current"), false)).toBe(directory);
    expect(targetDirectory(documentPath, settings("assets"), false)).toBe(join(directory, "assets"));
    expect(targetDirectory(documentPath, settings("documentAssets"), false)).toBe(join(directory, "周报.assets"));
    expect(targetDirectory(documentPath, settings("none"), false)).toBeNull();
    expect(targetDirectory(documentPath, settings("none"), true)).toBe(join(directory, "assets"));
  });

  it("重名时加序号，不覆盖；粘贴的图片按时间起名", async () => {
    writeFileSync(join(root, "a.png"), "1");
    writeFileSync(join(root, "a-1.png"), "2");
    expect(await uniquePath(root, "a.png")).toBe(join(root, "a-2.png"));
    expect(pastedName("image.png", new Date(2026, 10, 24, 9, 5, 7, 42))).toBe("image-20261124090507042.png");
    expect(pastedName("clip", new Date(2026, 0, 2, 3, 4, 5, 6))).toBe("image-20260102030405006.png");
  });

  it("复制原文件；内容写成文件；已经在目标目录里的直接用", async () => {
    const source = join(root, "photo 1.png");
    writeFileSync(source, "png");
    const copied = await storeMedia({ documentPath, sourcePath: source, name: "photo 1.png" }, settings("assets"));
    expect(copied).toBe(join(root, "notes", "assets", "photo 1.png"));
    expect(readFileSync(copied, "utf8")).toBe("png");
    const again = await storeMedia({ documentPath, sourcePath: source, name: "photo 1.png" }, settings("assets"));
    expect(again).toBe(join(root, "notes", "assets", "photo 1-1.png"));
    // 已经在 ./assets 里了：不再复制
    expect(await storeMedia({ documentPath, sourcePath: copied, name: "photo 1.png" }, settings("assets"))).toBe(copied);

    const pasted = await storeMedia({ documentPath, data: new Uint8Array([1, 2, 3]), name: "image.png" }, settings("none"));
    expect(pasted.startsWith(join(root, "notes", "assets", "image-"))).toBe(true);
    expect([...readFileSync(pasted)]).toEqual([1, 2, 3]);
  });

  it("新文档：无特殊操作时引用原文件；要复制、粘贴的报错（渲染进程应该先让用户保存）", async () => {
    const source = join(root, "v.mp4");
    writeFileSync(source, "mp4");
    expect(await storeMedia({ documentPath: null, sourcePath: source, name: "v.mp4" }, settings("none"))).toBe(source);
    await expect(storeMedia({ documentPath: null, sourcePath: source, name: "v.mp4" }, settings("assets"))).rejects.toThrow("文档还没有保存");
    await expect(storeMedia({ documentPath: null, data: new Uint8Array([1]), name: "image.png" }, settings("none"))).rejects.toThrow();
    expect(existsSync(join(root, "assets"))).toBe(false);
  });
});

describe("M-2 写进 Markdown 的地址", () => {
  it("文档目录里的写相对路径（正斜杠，可加 ./），外面的写绝对路径；转义空格、括号、#，中文不转", () => {
    const inside = join(root, "notes", "assets", "图 (1).png");
    expect(markdownPathOf(documentPath, inside, settings("assets"))).toBe("assets/图%20%281%29.png");
    expect(markdownPathOf(documentPath, inside, settings("assets", { addDotSlashToRelativeImagePath: true, escapeImageUrls: false }))).toBe("./assets/图 (1).png");
    const outside = join(root, "other", "#1.png");
    expect(markdownPathOf(documentPath, outside, settings("none"))).toBe(`${outside.split("\\").join("/").replace("#", "%23")}`);
    expect(markdownPathOf(null, outside, settings("none", { escapeImageUrls: false }))).toBe(outside.split("\\").join("/"));
  });
});

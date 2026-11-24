// F-19：导入的图片保存时复制到文档旁边
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@marko/shared";
import { applyRewrites, copyImportedMedia, importedReferences } from "./imports.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-imports-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("F-19 导入的图片", () => {
  it("认出指向导入目录的地址：反斜杠、正斜杠、空格写成 %20 的；别的地址不管", () => {
    const root = String.raw`C:\Users\John Doe\AppData\Roaming\Marko\imports`;
    const first = String.raw`C:\Users\John Doe\AppData\Roaming\Marko\imports\abc/media/image1.png`;
    const second = "C:/Users/John%20Doe/AppData/Roaming/Marko/imports/abc/media/image2.jpeg";
    const content = `# T\n\n![](<${first}>)\n\n<img src="${second}" style="width:2in" />\n\n![](./other.png)\n\n![](<${first}>)\n`;
    expect(importedReferences(content, root)).toEqual([first, second]);
  });

  it("复制到文档旁边（「无特殊操作」时放 ./assets），地址换成相对路径（S-9 默认不加 ./）；同一张只复制一次", async () => {
    const root = join(dir, "userData", "imports");
    const media = join(root, "abc", "media");
    mkdirSync(media, { recursive: true });
    writeFileSync(join(media, "image1.png"), "png-1");
    const docs = join(dir, "docs");
    mkdirSync(docs);
    const documentPath = join(docs, "report.md");
    const reference = join(media, "image1.png");
    const content = `![](${reference})\n\n![again](${reference})\n`;
    const rewrites = await copyImportedMedia(content, documentPath, { ...DEFAULT_SETTINGS, imageInsertAction: "none" }, root);
    expect(rewrites).toEqual([{ from: reference, to: "assets/image1.png" }]);
    expect(readFileSync(join(docs, "assets", "image1.png"), "utf8")).toBe("png-1");
    expect(applyRewrites(content, rewrites)).toBe("![](assets/image1.png)\n\n![again](assets/image1.png)\n");
    // 已经有同名的文件：另起一个名字，不覆盖
    const again = await copyImportedMedia(content, documentPath, { ...DEFAULT_SETTINGS, imageInsertAction: "none" }, root);
    expect(again[0]?.to).toBe("assets/image1-1.png");
    // 引用的文件不在了：不改
    rmSync(reference);
    expect(await copyImportedMedia(content, documentPath, DEFAULT_SETTINGS, root)).toEqual([]);
    expect(existsSync(join(docs, "assets", "image1-1.png"))).toBe(true);
  });

  it("X-1：地址规范化以后跳出导入目录的不复制（文档里写 imports/../../x 拿不到别的文件）", async () => {
    const root = join(dir, "userData", "imports");
    mkdirSync(join(root, "abc"), { recursive: true });
    const secret = join(dir, "userData", "secret.png");
    writeFileSync(secret, "secret");
    const docs = join(dir, "docs");
    mkdirSync(docs);
    const documentPath = join(docs, "report.md");
    const escaping = [join(root, "abc") + "/../../secret.png", `${root}/..%2F..%2Fsecret.png`, `${root}/abc/../../secret.png`];
    const content = escaping.map((reference) => `![](${reference})`).join("\n\n");
    expect(importedReferences(content, root).length).toBeGreaterThan(0);
    expect(await copyImportedMedia(content, documentPath, DEFAULT_SETTINGS, root)).toEqual([]);
    expect(existsSync(join(docs, "assets"))).toBe(false);
  });
});

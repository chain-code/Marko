// 读写文档（E-1、F-6、F-18）：识别编码、BOM、原子写入、冲突检测
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import iconv from "iconv-lite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConflictError, detectEncoding, readDocument, saveDocument } from "./files.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-files-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("识别编码（F-18）", () => {
  it("UTF-8（带不带 BOM）、UTF-16、GB18030", () => {
    expect(detectEncoding(Buffer.from("# 标题\n正文", "utf8"))).toEqual({ encoding: "utf-8", bom: false });
    expect(detectEncoding(Buffer.from("﻿# a", "utf8"))).toEqual({ encoding: "utf-8", bom: true });
    expect(detectEncoding(iconv.encode("# a", "utf-16le", { addBOM: true }))).toEqual({ encoding: "utf-16le", bom: true });
    const gbk = iconv.encode("# 中文标题\n\n这是一段用来识别编码的中文正文，内容要稍微长一点才能认得准。", "gb18030");
    expect(detectEncoding(gbk).encoding).toBe("gb18030");
    // 不是 UTF-8，也猜不出（或者把握不大）：按 UTF-8，标出来
    expect(detectEncoding(Buffer.from([0xff, 0x00, 0x9f, 0x8f]))).toEqual({ encoding: "utf-8", bom: false, uncertain: true });
    expect(detectEncoding(Buffer.from([0xc3, 0x28]))).toEqual({ encoding: "utf-8", bom: false, uncertain: true });
  });

  it("以其他编码重新打开：按指定的编码读，这种编码的 BOM 照样认；识别不出的标出来", async () => {
    const gbk = join(dir, "gbk.md");
    writeFileSync(gbk, iconv.encode("# 中文", "gb18030"));
    expect(await readDocument(gbk, "gb18030")).toMatchObject({ content: "# 中文", encoding: "gb18030", bom: false });
    const utf16 = join(dir, "u16.md");
    writeFileSync(utf16, iconv.encode("# 乙", "utf-16le", { addBOM: true }));
    expect(await readDocument(utf16, "utf-16le")).toMatchObject({ content: "# 乙", bom: true });
    const binary = join(dir, "bin.md");
    writeFileSync(binary, Buffer.from([0xff, 0x00, 0x9f, 0x8f]));
    expect((await readDocument(binary)).uncertainEncoding).toBe(true);
    expect((await readDocument(utf16)).uncertainEncoding).toBeUndefined();
  });

  it("读进来：UTF-8 的 BOM 留在文字里，UTF-16 的去掉记在 bom 上；指纹是磁盘上的字节", async () => {
    const utf8 = join(dir, "a.md");
    writeFileSync(utf8, "﻿# a\r\n");
    const document = await readDocument(utf8);
    expect(document.content).toBe("﻿# a\r\n");
    expect(document.encoding).toBe("utf-8");
    const utf16 = join(dir, "b.md");
    writeFileSync(utf16, iconv.encode("# 乙", "utf-16le", { addBOM: true }));
    const second = await readDocument(utf16);
    expect(second).toMatchObject({ content: "# 乙", encoding: "utf-16le", bom: true });
  });
});

describe("保存（F-6）", () => {
  it("按原来的编码写回，逐字节不变；返回新的指纹", async () => {
    for (const [name, bytes] of [
      ["utf8.md", Buffer.from("﻿# a\r\nb", "utf8")],
      ["utf16.md", iconv.encode("# 乙\n", "utf-16le", { addBOM: true })],
      ["gbk.md", iconv.encode("# 中文标题\n\n这是一段用来识别编码的中文正文，内容要稍微长一点才能认得准。", "gb18030")],
    ] as const) {
      const path = join(dir, name);
      writeFileSync(path, bytes);
      const document = await readDocument(path);
      const saved = await saveDocument({ path, content: document.content, encoding: document.encoding, bom: document.bom, expectedHash: document.hash });
      expect(readFileSync(path).equals(bytes), name).toBe(true);
      expect(saved.hash).toBe(document.hash);
    }
  });

  it("磁盘上的内容和打开时的不一样：报冲突，不写；expectedHash 为 null（选了覆盖）时照写", async () => {
    const path = join(dir, "c.md");
    writeFileSync(path, "one");
    const document = await readDocument(path);
    writeFileSync(path, "changed elsewhere");
    await expect(saveDocument({ path, content: "mine", encoding: "utf-8", bom: false, expectedHash: document.hash })).rejects.toBeInstanceOf(ConflictError);
    expect(readFileSync(path, "utf8")).toBe("changed elsewhere");
    await saveDocument({ path, content: "mine", encoding: "utf-8", bom: false, expectedHash: null });
    expect(readFileSync(path, "utf8")).toBe("mine");
  });

  it("文件被删了：照写（新建）", async () => {
    const path = join(dir, "gone.md");
    await saveDocument({ path, content: "x", encoding: "utf-8", bom: false, expectedHash: "old" });
    expect(readFileSync(path, "utf8")).toBe("x");
  });
});

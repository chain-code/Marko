// 导出（O 章）、导入（F-19）：本地媒体换成相对路径或嵌入；Pandoc 的参数；运行外部程序
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportArgs, importArgs, localizeMedia, pdfOptions, runProgram, splitArgs } from "./export.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marko-export-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("O-1 HTML 里的本地媒体", () => {
  it("换成相对导出文件的路径；选了嵌入时换成 data: 地址；网址不动", async () => {
    mkdirSync(join(root, "doc", "assets"), { recursive: true });
    const image = join(root, "doc", "assets", "图 1.png");
    writeFileSync(image, Buffer.from([137, 80, 78, 71]));
    const url = pathToFileURL(image).href;
    const html = `<p><img src="${url}" alt="a"><img src="https://e.com/x.png"><video controls src="${url}"></video></p>`;
    const target = join(root, "out", "doc.html");
    const relative = await localizeMedia(html, target, false);
    expect(relative).toContain('src="../doc/assets/%E5%9B%BE%201.png"');
    expect(relative).toContain('src="https://e.com/x.png"');
    expect(relative).not.toContain("file://");
    const embedded = await localizeMedia(html, target, true);
    expect(embedded.match(/src="data:image\/png;base64,iVBORw=="/g)).toHaveLength(2);
    // 读不了的保留原样
    const missing = pathToFileURL(join(root, "missing.png")).href;
    expect(await localizeMedia(`<img src="${missing}">`, target, true)).toContain(missing);
  });
});

describe("Pandoc（O-4、F-19）", () => {
  it("额外参数按空格分，引号里的不分；导出、导入的参数", () => {
    expect(splitArgs(`--toc  --reference-doc="my template.docx" -V 'title=A B'`)).toEqual(["--toc", "--reference-doc=my template.docx", "-V", "title=A B"]);
    expect(splitArgs(`"--metadata=title:My Doc" --toc ""`)).toEqual(["--metadata=title:My Doc", "--toc", ""]);
    expect(splitArgs("   ")).toEqual([]);
    expect(exportArgs("docx", "in.md", "out.docx", "/docs", "--toc")).toEqual(["in.md", "-f", "markdown", "-t", "docx", "-s", "--resource-path", "/docs", "-o", "out.docx", "--toc"]);
    expect(exportArgs("latex", "in.md", "out.tex", "/docs", "")).toContain("latex");
    expect(() => exportArgs("html", "in.md", "out.html", "/docs", "")).toThrow();
    expect(importArgs("a.docx", "/media")).toEqual(["a.docx", "-t", "gfm", "--wrap=none", "--extract-media=/media"]);
  });

  it("运行外部程序：标准输出；出错时报最后几行；找不到程序时说怎么装 Pandoc", async () => {
    const script = join(root, "fake-pandoc.cjs");
    writeFileSync(script, "if (process.argv[2] === 'fail') { console.error('bad input'); process.exit(4); } process.stdout.write('# Converted\\n');");
    expect((await runProgram(process.execPath, [script, "ok"], root)).toString("utf8")).toBe("# Converted\n");
    await expect(runProgram(process.execPath, [script, "fail"], root)).rejects.toThrow("bad input");
    await expect(runProgram(join(root, "no-such-pandoc.exe"), [], root)).rejects.toThrow("没有找到 Pandoc");
  });
});

describe("O-2 PDF 选项", () => {
  it("页面、方向、边距、页眉页脚、背景、书签按设置", () => {
    const options = pdfOptions({ pdfPageSize: "Letter", pdfLandscape: true, pdfMargin: 0.4, pdfHeaderFooter: false, pdfPrintBackground: false, pdfOutline: true });
    expect(options).toMatchObject({
      pageSize: "Letter",
      landscape: true,
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      displayHeaderFooter: false,
      printBackground: false,
      generateDocumentOutline: true,
    });
    expect(options.footerTemplate).toContain("pageNumber");
  });
});

// 端到端（O 章、F-19）：导出 HTML（图片相对导出位置、图表是 SVG）、按上次的格式导出、PDF、长图；没装 Pandoc 时的提示。
// 打印（O-5）会弹系统的打印对话框，不在这里测
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-export-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menu(app: LaunchedApp, id: string, argument?: string): Promise<void> {
  await app.app.evaluate(
    ({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", command),
    argument === undefined ? { id } : { id, argument },
  );
}

/** 保存对话框换成直接返回 path（null：调到就算错，用来确认没弹对话框） */
async function saveDialogReturns(app: LaunchedApp, path: string | null): Promise<void> {
  await app.app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => {
      if (target === null) throw new Error("不该弹保存对话框");
      return { canceled: false, filePath: target };
    }) as typeof dialog.showSaveDialog;
  }, path);
}

async function setup(content = "# 报告\n\n![图](assets/pic.png)\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n正文 $x^2$\n"): Promise<{ app: LaunchedApp; file: string }> {
  mkdirSync(join(dir, "doc", "assets"), { recursive: true });
  mkdirSync(join(dir, "doc", "static", "img"), { recursive: true });
  mkdirSync(join(dir, "out"));
  writeFileSync(join(dir, "doc", "assets", "pic.png"), Buffer.from(PIXEL, "base64"));
  writeFileSync(join(dir, "doc", "static", "img", "root.png"), Buffer.from(PIXEL, "base64"));
  const file = join(dir, "doc", "report.md");
  writeFileSync(file, content);
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write h1");
  return { app: launched, file };
}

test("O-1、O-7：导出 HTML——图片相对导出位置，图表是 SVG，没有 file://；按上次的格式导出不再问位置", async () => {
  const { app } = await setup();
  const target = join(dir, "out", "report.html");
  await saveDialogReturns(app, target);
  await menu(app, "export", "html");
  await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true);
  const html = readFileSync(target, "utf8");
  expect(html).toContain("<title>report</title>");
  expect(html).toMatch(/<h1[^>]*>报告<\/h1>/);
  expect(html).toContain('src="../doc/assets/pic.png"');
  expect(html).toContain("<svg");
  expect(html).toContain("mjx-container");
  expect(html).not.toContain("file://");
  // 内置主题的字体嵌在文件里，没有应用自己的地址（拿到应用外面打开也是一样的字体）
  expect(html).toContain("data:font/woff2;base64,");
  expect(html).not.toContain("app://marko");

  rmSync(target);
  await saveDialogReturns(app, null);
  await menu(app, "export.last");
  await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true);
});

test("O-1：Front Matter 有 typora-root-url 时，导出的图片地址同编辑区，相对它", async () => {
  const { app } = await setup("---\ntypora-root-url: ./static\n---\n\n# 报告\n\n![图](/img/root.png)\n");
  const window = await app.app.firstWindow();
  await expect.poll(() => window.locator("#write img").first().evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1);
  const target = join(dir, "out", "root.html");
  await saveDialogReturns(app, target);
  await menu(app, "export", "html");
  await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true);
  expect(readFileSync(target, "utf8")).toContain('src="../doc/static/img/root.png"');
});

test("O-2、O-3：导出 PDF、长图", async () => {
  const { app } = await setup();
  const pdf = join(dir, "out", "report.pdf");
  await saveDialogReturns(app, pdf);
  await menu(app, "export", "pdf");
  await expect.poll(() => existsSync(pdf), { timeout: 30_000 }).toBe(true);
  expect(readFileSync(pdf).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  const png = join(dir, "out", "report.png");
  await saveDialogReturns(app, png);
  await menu(app, "export", "png");
  await expect.poll(() => existsSync(png), { timeout: 30_000 }).toBe(true);
  expect([...readFileSync(png).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

test("O-4、F-19：找不到 Pandoc 时导出 Word、导入都提示怎么安装", async () => {
  const { app } = await setup();
  const window = await app.app.firstWindow();
  await window.evaluate((path) => window.marko.settings.set({ pandocPath: path }), join(dir, "no-pandoc.exe"));
  await saveDialogReturns(app, join(dir, "out", "report.docx"));
  await menu(app, "export", "docx");
  await expect(window.locator(".el-message").last()).toContainText("没有找到 Pandoc");

  const source = join(dir, "in.docx");
  writeFileSync(source, "not really docx");
  await app.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, source);
  await menu(app, "file.import");
  await expect(window.locator(".el-message", { hasText: "导入失败" })).toContainText("没有找到 Pandoc");
});

test("O-4：交给 Pandoc 之前图表画成 PNG——Word 用的图片 Pandoc 找得到；LaTeX 的放在导出文件旁边", async () => {
  const { app } = await setup();
  const window = await app.app.firstWindow();
  // 假的 Pandoc：node 先加载这个脚本（NODE_OPTIONS 只给主进程起的子进程），它记下 Pandoc 收到的 Markdown、
  // 按 --resource-path 找引用的图片，把结果写到 -o 给的文件，然后退出（不去跑那个 .md）
  const fake = join(dir, "fake-pandoc.cjs");
  writeFileSync(
    fake,
    [
      'const fs = require("fs");',
      'const path = require("path");',
      "const args = process.argv.slice(2);",
      "const markdown = fs.readFileSync(process.argv[1], \"utf8\");",
      'const resources = args[args.indexOf("--resource-path") + 1].split(path.delimiter);',
      'const output = args[args.indexOf("-o") + 1];',
      "const images = [...markdown.matchAll(/!\\[\\]\\(([^)]+)\\)/g)].map((match) => {",
      "  const file = resources.map((root) => path.join(root, match[1])).find((candidate) => fs.existsSync(candidate));",
      '  return { name: match[1], head: file ? [...fs.readFileSync(file).subarray(0, 4)] : null };',
      "});",
      "fs.writeFileSync(output, JSON.stringify({ markdown, images }));",
      "process.exit(0);",
    ].join("\n"),
  );
  await window.evaluate((path) => window.marko.settings.set({ pandocPath: path }), process.execPath);
  await app.app.evaluate((_electron, script) => {
    process.env.NODE_OPTIONS = `--require ${script.replace(/\\/g, "/")}`;
  }, fake);

  const docx = join(dir, "out", "report.docx");
  await saveDialogReturns(app, docx);
  await menu(app, "export", "docx");
  await expect.poll(() => existsSync(docx), { timeout: 30_000 }).toBe(true);
  const word = JSON.parse(readFileSync(docx, "utf8")) as { markdown: string; images: Array<{ name: string; head: number[] | null }> };
  expect(word.markdown).not.toContain("```mermaid");
  expect(word.markdown).toMatch(/!\[\]\(marko-diagram-[\w-]+-1\.png\)\{width=\d+px\}/);
  expect(word.markdown).toContain("![图](assets/pic.png)");
  expect(word.images).toEqual([{ name: expect.stringMatching(/^marko-diagram-/), head: [0x89, 0x50, 0x4e, 0x47] }]);

  const latex = join(dir, "out", "report.tex");
  await saveDialogReturns(app, latex);
  await menu(app, "export", "latex");
  await expect.poll(() => existsSync(latex), { timeout: 30_000 }).toBe(true);
  const tex = JSON.parse(readFileSync(latex, "utf8")) as { markdown: string };
  expect(tex.markdown).toMatch(/!\[\]\(report\.assets\/diagram-1\.png\)\{width=\d+px\}/);
  expect([...readFileSync(join(dir, "out", "report.assets", "diagram-1.png")).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
});

test("F-19：导入的文档里的图片，保存时复制到文档旁边，地址改成相对路径", async () => {
  const { app } = await setup();
  const window = await app.app.firstWindow();
  // 假的 Pandoc：让 node 把要导入的「文档」当脚本跑——它照 Pandoc 的样子把图片提取到 --extract-media 给的目录，输出引用它的 Markdown
  await window.evaluate((path) => window.marko.settings.set({ pandocPath: path }), process.execPath);
  const source = join(dir, "in.docx");
  writeFileSync(
    source,
    [
      'const fs = require("fs");',
      'const path = require("path");',
      'const media = process.argv.find((arg) => arg.startsWith("--extract-media=")).slice("--extract-media=".length);',
      'fs.mkdirSync(path.join(media, "media"), { recursive: true });',
      'const image = path.join(media, "media", "image1.png");',
      `fs.writeFileSync(image, Buffer.from("${PIXEL}", "base64"));`,
      String.raw`process.stdout.write("# Imported\n\n![](" + image + ")\n");`,
    ].join("\n"),
  );
  await app.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, source);
  await menu(app, "file.import");
  await expect.poll(() => app.app.windows().length).toBe(2);
  const imported = app.app.windows().find((page) => page !== window)!;
  await imported.waitForSelector("#write h1");
  await expect(imported.locator("#write h1")).toHaveText("Imported");

  const target = join(dir, "saved", "imported.md");
  mkdirSync(join(dir, "saved"));
  await saveDialogReturns(app, target);
  await app.app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((item) => item.getTitle().includes("未命名"));
    window?.webContents.send("marko:menu.command", { id: "file.save" });
  });
  await expect.poll(() => existsSync(target)).toBe(true);
  expect(readFileSync(target, "utf8")).toBe("# Imported\n\n![](assets/image1.png)\n");
  expect(existsSync(join(dir, "saved", "assets", "image1.png"))).toBe(true);
  // 编辑器里也是改过的地址、算已保存（标题没有 ●）
  await expect.poll(() => app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((item) => item.getTitle()))).toContain("imported.md - Marko");
  await expect(imported.locator("#write img")).toHaveAttribute("src", /assets\/image1\.png/);
});

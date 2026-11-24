// 导出、打印（O 章）、导入（F-19）。HTML 由渲染进程按编辑区同一条管线渲染好交过来（通用规则 2）：
// - HTML：本地媒体的 file:// 地址换成相对导出位置的路径（O-6 选了嵌入时换成 data: 地址），写成文件；
// - PDF、长图、打印：在不显示的后台窗口里排版（导出的 HTML 有 CSP，不许页面脚本），printToPDF、capturePage、print；
// - Word 等：Pandoc 从 Markdown 原文转换（O-4）；导入同样用 Pandoc（F-19）
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import type { DiagramSvg, ExportFormat, Settings } from "@marko/shared";
import { t } from "./i18n.ts";
import { importsDirectory } from "./imports.ts";

/** 每种格式的扩展名、对话框里的名字 */
export const FORMAT_FILES: Record<ExportFormat, { extension: string; name: string }> = {
  html: { extension: "html", name: "HTML" },
  htmlPlain: { extension: "html", name: "HTML" },
  pdf: { extension: "pdf", name: "PDF" },
  png: { extension: "png", name: "PNG" },
  docx: { extension: "docx", name: "Word" },
  odt: { extension: "odt", name: "OpenDocument" },
  rtf: { extension: "rtf", name: "RTF" },
  epub: { extension: "epub", name: "EPUB" },
  latex: { extension: "tex", name: "LaTeX" },
  rst: { extension: "rst", name: "reStructuredText" },
  mediawiki: { extension: "wiki", name: "MediaWiki" },
};

/** 保存对话框里这种格式的名字 */
export function formatFileName(format: ExportFormat): string {
  return format === "png" ? t("dialog.pngImage") : FORMAT_FILES[format].name;
}

/** 导入（F-19）能选的 */
export function importFilters(): Electron.FileFilter[] {
  return [{ name: t("dialog.importFiles"), extensions: ["docx", "html", "htm", "epub", "tex", "latex", "odt", "rst"] }];
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  mov: "video/quicktime",
  m4v: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus",
};

/** 相对路径写进 HTML 属性：按 URL 转义（# 和 ? 也转，它们在路径里是普通字符） */
function urlPath(path: string): string {
  return encodeURI(path.split(sep).join("/")).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

/** 本地媒体的 file:// 地址 → 相对导出文件的路径；embed 时换成 data: 地址（读不了的保留原样） */
export async function localizeMedia(html: string, target: string, embed: boolean): Promise<string> {
  const pattern = /\b(src|poster)="(file:\/\/[^"]+)"/g;
  const replacements = new Map<string, string>();
  for (const match of html.matchAll(pattern)) {
    const url = match[2];
    if (replacements.has(url)) continue;
    let path: string;
    try {
      path = fileURLToPath(url.replace(/&amp;/g, "&"));
    } catch {
      continue;
    }
    if (!embed) {
      replacements.set(url, urlPath(relative(dirname(target), path)));
      continue;
    }
    try {
      const bytes = await readFile(path);
      const type = MIME[extname(path).slice(1).toLowerCase()] ?? "application/octet-stream";
      replacements.set(url, `data:${type};base64,${bytes.toString("base64")}`);
    } catch {
      // 读不了：留着原来的地址
    }
  }
  return html.replace(pattern, (whole, attribute: string, url: string) => (replacements.has(url) ? `${attribute}="${replacements.get(url)}"` : whole));
}

/**
 * 在不显示的窗口里打开导出的 HTML（写进临时文件，本地图片按 file:// 加载）：不能跳走、不能开新窗口；
 * 页面自己的脚本被导出 HTML 的 CSP 挡住，主进程量高度用的 executeJavaScript 不受影响
 */
async function withExportWindow<T>(html: string, run: (window: BrowserWindow) => Promise<T>): Promise<T> {
  const file = join(app.getPath("temp"), `marko-export-${randomUUID()}.html`);
  await writeFile(file, html, "utf8");
  const window = new BrowserWindow({
    show: false,
    width: 1100,
    height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false },
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    await window.loadFile(file);
    return await run(window);
  } finally {
    window.destroy();
    await rm(file, { force: true });
  }
}

type PdfSettings = Pick<Settings, "pdfPageSize" | "pdfLandscape" | "pdfMargin" | "pdfHeaderFooter" | "pdfPrintBackground" | "pdfOutline">;

/** O-2、O-6：页面大小、方向、边距、页眉（标题）页脚（页码）、背景、书签 */
export function pdfOptions(settings: PdfSettings): Electron.PrintToPDFOptions {
  const margin = settings.pdfMargin;
  const style = "font-size:9px;width:100%;text-align:center;color:#888;font-family:sans-serif";
  return {
    pageSize: settings.pdfPageSize,
    landscape: settings.pdfLandscape,
    margins: { top: margin, bottom: margin, left: margin, right: margin },
    printBackground: settings.pdfPrintBackground,
    displayHeaderFooter: settings.pdfHeaderFooter,
    headerTemplate: `<div style="${style}"><span class="title"></span></div>`,
    footerTemplate: `<div style="${style}"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    generateDocumentOutline: settings.pdfOutline,
  };
}

export async function exportPdf(html: string, target: string, settings: PdfSettings): Promise<void> {
  const data = await withExportWindow(html, (window) => window.webContents.printToPDF(pdfOptions(settings)));
  await writeFile(target, data);
}

/** 长图最高多少像素（再高显卡的纹理放不下） */
const IMAGE_LIMIT = 16_000;

export async function exportImage(html: string, target: string): Promise<void> {
  const png = await withExportWindow(html, async (window) => {
    // 先把窗口压矮再量：scrollHeight 不会比窗口矮，内容短时图片下面会多一大片空白
    window.setContentSize(1100, 100);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const height = Number(await window.webContents.executeJavaScript("Math.ceil(document.documentElement.scrollHeight)"));
    if (height > IMAGE_LIMIT) throw new Error(t("error.imageTooTall", { height }));
    window.setContentSize(1100, Math.max(height, 100));
    // 等改了大小以后重新排版、画出来
    await new Promise((resolve) => setTimeout(resolve, 300));
    return (await window.webContents.capturePage()).toPNG();
  });
  await writeFile(target, png);
}

/** O-5：打印排好版的结果（不是编辑界面），弹系统的打印对话框 */
export function printHtml(html: string, printBackground: boolean): Promise<void> {
  return withExportWindow(
    html,
    (window) =>
      new Promise<void>((resolve, reject) => {
        window.webContents.print({ printBackground }, (success, reason) => {
          if (success || reason === "cancelled") resolve();
          else reject(new Error(reason || t("error.printFailed")));
        });
      }),
  );
}

// ---------------------------------------------------------------------------
// Pandoc（O-4、F-19）

const pandocMissing = () => t("error.pandocMissing", { url: "https://pandoc.org/installing.html" });

/** 额外参数按空格分开；引号里的空格不分（同命令行：--reference-doc="my template.docx" 是一个参数），引号本身去掉 */
export function splitArgs(text: string): string[] {
  const args: string[] = [];
  let current = "";
  let started = false;
  let quote: string | null = null;
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) args.push(current);
      current = "";
      started = false;
    } else {
      current += char;
      started = true;
    }
  }
  if (started) args.push(current);
  return args;
}

const PANDOC_FORMATS: Partial<Record<ExportFormat, string>> = {
  docx: "docx",
  odt: "odt",
  rtf: "rtf",
  epub: "epub",
  latex: "latex",
  rst: "rst",
  mediawiki: "mediawiki",
};

/** O-4：导出用的参数（输入是临时的 .md 文件，图片相对文档所在目录） */
export function exportArgs(format: ExportFormat, input: string, target: string, resourceDirectory: string, extra: string): string[] {
  const to = PANDOC_FORMATS[format];
  if (!to) throw new Error(t("error.pandocFormat", { format }));
  return [input, "-f", "markdown", "-t", to, "-s", "--resource-path", resourceDirectory, "-o", target, ...splitArgs(extra)];
}

/** F-19：导入用的参数（转成 GitHub 风格的 Markdown，不折行；图片提取到 mediaDirectory） */
export function importArgs(source: string, mediaDirectory: string): string[] {
  return [source, "-t", "gfm", "--wrap=none", `--extract-media=${mediaDirectory}`];
}

/** 运行程序，返回标准输出；找不到程序时报怎么安装 Pandoc */
export function runProgram(program: string, args: string[], cwd: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, windowsHide: true });
    const output: Buffer[] = [];
    let errors = "";
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => (errors += chunk.toString("utf8")));
    child.on("error", (error: NodeJS.ErrnoException) => reject(error.code === "ENOENT" ? new Error(pandocMissing()) : error));
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(output));
      else reject(new Error(t("error.pandocFailed", { code: String(code), message: errors.trim().split(/\r?\n/).slice(-3).join(" ") })));
    });
  });
}

type PandocSettings = Pick<Settings, "pandocPath" | "pandocArgs">;

/**
 * O-4：图表的 SVG 截成 PNG（两倍大小，白底）。在不显示的窗口里打开只有这张图的页面：不跑脚本（javascript: false）、
 * CSP 不许加载任何外部资源、不能跳走。页面里画到画布上不行（Mermaid 的文字在 foreignObject 里，画布会被标成不能导出）
 */
async function captureDiagrams(diagrams: readonly DiagramSvg[]): Promise<Array<{ name: string; data: Buffer }>> {
  const scale = 2;
  const window = new BrowserWindow({
    show: false,
    useContentSize: true,
    width: 100,
    height: 100,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, spellcheck: false, backgroundThrottling: false },
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const file = join(app.getPath("temp"), `marko-diagram-${randomUUID()}.html`);
  const images: Array<{ name: string; data: Buffer }> = [];
  try {
    for (const diagram of diagrams) {
      const page = [
        "<!doctype html><html><head><meta charset=\"utf-8\">",
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:\">",
        `<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}body{zoom:${scale}}svg{display:block;width:${diagram.width}px;height:${diagram.height}px;max-width:none}</style>`,
        `</head><body>${diagram.svg}</body></html>`,
      ].join("");
      await writeFile(file, page, "utf8");
      window.setContentSize(Math.ceil(diagram.width * scale), Math.ceil(diagram.height * scale));
      await window.loadFile(file);
      // 等改了大小以后排版、画出来（放大用 CSS 的 zoom：页面缩放会按 file:// 记下来，影响导出 PDF 的窗口）
      await new Promise((resolve) => setTimeout(resolve, 150));
      images.push({ name: diagram.name, data: (await window.webContents.capturePage()).toPNG() });
    }
  } finally {
    window.destroy();
    await rm(file, { force: true });
  }
  return images;
}

/** O-4：这几种格式把图片放进文件里；别的（LaTeX、reStructuredText、MediaWiki）是文字，只写图片的路径 */
const EMBEDS_IMAGES = new Set<ExportFormat>(["docx", "odt", "rtf", "epub"]);

/**
 * O-4：Markdown 交给 Pandoc。图表画成的图片（images）：放进文件里的格式放在临时目录（Pandoc 按 --resource-path 找到），
 * 导完删掉；文字格式放到导出的文件旁边的「<文件名>.assets」里，Markdown 里的引用换成相对导出位置的路径
 */
export async function exportWithPandoc(
  markdown: string,
  documentPath: string | null,
  format: ExportFormat,
  target: string,
  settings: PandocSettings,
  diagrams: readonly DiagramSvg[] = [],
): Promise<void> {
  const images = diagrams.length ? await captureDiagrams(diagrams) : [];
  const work = await mkdtemp(join(app.getPath("temp"), "marko-export-"));
  const input = join(work, "document.md");
  const directory = documentPath ? dirname(documentPath) : app.getPath("documents");
  let text = markdown;
  const resources = [directory];
  try {
    if (images.length && EMBEDS_IMAGES.has(format)) {
      for (const image of images) await writeFile(join(work, basename(image.name)), image.data);
      resources.push(work);
    } else if (images.length) {
      const folder = `${basename(target, extname(target))}.assets`;
      await mkdir(join(dirname(target), folder), { recursive: true });
      for (const [index, image] of images.entries()) {
        const name = `diagram-${index + 1}.png`;
        await writeFile(join(dirname(target), folder, name), image.data);
        text = text.split(image.name).join(`${folder}/${name}`);
      }
      resources.push(dirname(target));
    }
    await writeFile(input, text, "utf8");
    await runProgram(settings.pandocPath.trim() || "pandoc", exportArgs(format, input, target, resources.join(delimiter), settings.pandocArgs), directory);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** F-19：转成 Markdown；文档里的图片提取到 userData/imports/<编号>/（新文档保存以后照样引用得到） */
export async function importWithPandoc(source: string, settings: PandocSettings): Promise<string> {
  const media = join(importsDirectory(), randomUUID());
  const output = await runProgram(settings.pandocPath.trim() || "pandoc", importArgs(source, media), dirname(source));
  return output.toString("utf8");
}

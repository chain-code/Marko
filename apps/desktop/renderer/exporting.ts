// 导出、打印（O 章）的渲染进程这边：按编辑区同一条管线（@marko/render 的 exportDocument，通用规则 2）渲染出自包含的 HTML，
// 交给主进程写文件、排版成 PDF、打印。本地图片先写成 file:// 绝对地址，主进程按导出的位置换成相对路径或嵌入
import { toModel, withRootUrl } from "@marko/editor";
import { readFrontMatter } from "@marko/markdown";
import { exportDocument } from "@marko/render";
import type { Settings } from "@marko/shared";
import base from "@marko/themes/base.css?inline";
import type { Editor } from "@tiptap/core";
import { renderDiagram } from "./diagrams.ts";
import { exportImageUrl } from "./paths.ts";
import { inlineFonts } from "./inlineFonts.ts";

export interface ExportHtmlOptions {
  title: string;
  documentPath: string | null;
  /** 当前主题的 CSS、是不是深色（A-1、A-3，appearance.ts 的 exportTheme） */
  css: string;
  dark: boolean;
  settings: Settings;
  /** O-1「HTML（不含样式）」 */
  plain: boolean;
}

export async function renderExportHtml(editor: Editor, options: ExportHtmlOptions): Promise<string> {
  const { css, dark } = options;
  const { settings } = options;
  const model = toModel(editor.state.doc);
  // 图片的相对路径同编辑区：Front Matter 有 typora-root-url 时相对它（M-1）
  const rootUrl = readFrontMatter(model)?.rootUrl ?? null;
  return exportDocument(model, {
    title: options.title,
    // 内置主题的字体嵌进去（O-1）：导出的文件拿到应用外面也是一样的字体
    css: options.plain ? "" : await inlineFonts(`${base}\n${css}`, document.baseURI),
    theme: dark ? "dark" : "light",
    noStyle: options.plain,
    renderDiagram: (kind, source, theme) => renderDiagram(kind, source, theme),
    resolveUrl: (url, kind) => (kind === "image" ? exportImageUrl(withRootUrl(url, rootUrl), options.documentPath) : url),
    syntax: editor.storage.marko.syntax,
    mathNumbering: settings.autoNumberingForMath === false ? "none" : settings.autoNumberingForMath,
    smartQuotes: settings.smartQuotes,
    smartDashes: settings.smartDashes,
    preserveLineBreaks: settings.preserveSingleLineBreaks,
    codeLineNumbers: settings.codeLineNumbers,
  });
}

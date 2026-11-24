// 自包含的 HTML（O-1）：内嵌主题 CSS，公式、图表是预渲染好的 SVG，不引用外网脚本。
// 导出 HTML、PDF、打印、导出图片都用它（1.7 节）
import { blockChildren, isLeaf, nodeText, type MdNode } from "@marko/markdown";
import { cleanDiagramSvg, type DiagramKind, type DiagramResult, type DiagramTheme } from "./diagrams.ts";
import { escapeHtml } from "./escape.ts";
import { loadLanguages } from "./highlight.ts";
import { diagramKey, mathItemsOf, renderHtml, type RenderOptions } from "./html.ts";
import { loadMathFonts, mathStyles } from "./math.ts";

export interface ExportOptions extends Omit<RenderOptions, "diagrams" | "diagramErrors"> {
  /** 文档标题（<title>） */
  title: string;
  /** 主题的 CSS：base.css 加上当前主题，由调用方读好（A-1、A-3）；noStyle（「HTML（不含样式）」）时不用 */
  css?: string;
  /** 深色主题时图表用深色配色（D-3） */
  theme?: DiagramTheme;
  /** 渲染图表；不给时图表按代码块输出 */
  renderDiagram?: (kind: DiagramKind, source: string, theme: DiagramTheme) => Promise<DiagramResult>;
  /** <html lang> */
  lang?: string;
}

/** 导出的文件里不需要任何脚本：只允许内嵌样式、图片、音视频和 https 的 iframe */
const EXPORT_CSP = "default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline'; font-src * data:; frame-src https:";

function collect(doc: MdNode, visit: (node: MdNode) => void): void {
  const walk = (node: MdNode) => {
    visit(node);
    if (!isLeaf(node.type)) for (const child of blockChildren(node)) walk(child);
  };
  walk(doc);
}

export async function exportDocument(doc: MdNode, options: ExportOptions): Promise<string> {
  const languages = new Set<string>();
  const diagramNodes: MdNode[] = [];
  collect(doc, (node) => {
    if (node.type === "codeBlock" && !node.attrs?.indented) {
      const language = String(node.attrs?.info ?? "").split(/\s+/)[0];
      if (language) languages.add(language);
    }
    if (node.type === "diagram") diagramNodes.push(node);
  });
  // 代码的语言、公式用到的字体都是按需加载的，先加载好再同步渲染
  await Promise.all([loadLanguages(languages), loadMathFonts(mathItemsOf(doc, options))]);

  const diagrams = new Map<string, string>();
  const diagramErrors = new Map<string, string>();
  // 「HTML（不含样式）」里图表是代码，不用画
  if (options.renderDiagram && !options.noStyle) {
    const theme = options.theme ?? "light";
    for (const node of diagramNodes) {
      const kind = String(node.attrs?.kind ?? "") as DiagramKind;
      const source = nodeText(node);
      const key = diagramKey(kind, source);
      if (diagrams.has(key) || diagramErrors.has(key)) continue;
      const result = await options.renderDiagram(kind, source, theme);
      // 不管调用方有没有过滤过，这里再过滤一遍（DiagramRenderer 给的已经过滤过，再来一遍也不变）
      const svg = result.svg === undefined ? null : cleanDiagramSvg(result.svg);
      if (svg !== null) diagrams.set(key, svg);
      else diagramErrors.set(key, result.error ?? "图表沙箱返回的不是 SVG");
    }
  }

  const body = renderHtml(doc, { ...options, diagrams, diagramErrors });
  // 公式的 SVG 要配 MathJax 的样式才排得对，「不含样式」时也带上
  const css = [options.noStyle ? "" : (options.css ?? ""), body.includes("<mjx-container") ? mathStyles() : ""].filter(Boolean).join("\n");
  const style = css ? `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>\n` : "";
  const themeClass = options.theme === "dark" ? ' class="dark"' : "";
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(options.lang ?? "zh-CN")}"${themeClass}>`,
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(options.title)}</title>`,
    `${style}</head>`,
    '<body class="typora-export">',
    `<div id="write">${body}</div>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

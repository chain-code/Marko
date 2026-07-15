import { renderMarkdown } from "./markdown";
import type { EditorSettings, OutlineItem } from "../types";

export interface BuildHtmlOptions {
  title: string;
  markdown: string;
  outline: OutlineItem[];
  settings: EditorSettings;
  basePath?: string;
}

export function buildExportHtml(options: BuildHtmlOptions): string {
  const html = renderMarkdown(options.markdown, {
    basePath: options.basePath,
    documentSource: options.markdown,
    outline: options.outline,
    settings: options.settings,
  });
  const runtimeScripts = buildExportRuntimeScripts(html, options.settings);

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(options.title || "Marko")}</title>`,
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.47/dist/katex.min.css">',
    "<style>",
    "body{margin:0;background:#fff;color:#24272d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;line-height:1.72;}",
    ".markdown{max-width:860px;margin:0 auto;padding:48px 32px 72px;}",
    "img{max-width:100%;height:auto;}pre{overflow:auto;padding:16px;background:#f6f8fa;border-radius:8px;}code{font-family:'JetBrains Mono',Consolas,monospace;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #d9dde3;padding:8px 12px;}blockquote{border-left:4px solid #d8e5ff;margin-left:0;padding-left:16px;color:#4b5563;}abbr[title]{cursor:help;text-decoration:underline dotted rgba(37,99,235,.55);text-underline-offset:.16rem;}dl{padding-left:8px;}dt{font-weight:650;}dd{border-left:2px solid #d8e5ff;margin:4px 0 10px 14px;padding-left:12px;}.math-block{overflow:auto;text-align:center;}.diagram-box{overflow:auto;border:1px solid #d9dde3;border-radius:8px;background:#fbfdff;margin:20px 0;padding:18px;}.diagram-source-panel{display:none;}.mermaid svg,.flowchart-render svg{display:block;max-width:100%;height:auto;margin:0 auto;}.diagram-error{color:#b91c1c;white-space:pre-wrap;}",
    "</style>",
    "</head>",
    "<body>",
    `<article class="markdown">${html}</article>`,
    ...runtimeScripts,
    "</body>",
    "</html>",
  ].join("\n");
}

function buildExportRuntimeScripts(html: string, settings: EditorSettings): string[] {
  const scripts: string[] = [];

  if (settings.extensions.mermaid && html.includes('class="mermaid"')) {
    scripts.push([
      '<script type="module">',
      'import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";',
      'mermaid.initialize({startOnLoad:false,securityLevel:"loose",theme:"base",flowchart:{htmlLabels:true}});',
      'for (const [index,node] of Array.from(document.querySelectorAll(".mermaid")).entries()) {',
      '  const source = node.dataset.diagramSource || node.textContent || "";',
      '  try {',
      '    const result = await mermaid.render(`marko-export-mermaid-${index}`, source);',
      '    node.innerHTML = result.svg;',
      '  } catch (error) {',
      '    node.classList.add("diagram-error");',
      '    node.textContent = String(error);',
      '  }',
      '}',
      "</script>",
    ].join("\n"));
  }

  if (settings.extensions.flowchart && html.includes('class="flowchart-render"')) {
    scripts.push(
      '<script src="https://cdn.jsdelivr.net/npm/flowchart.js@1.18.0/release/flowchart.min.js"></script>',
      [
        "<script>",
        'for (const node of Array.from(document.querySelectorAll(".flowchart-render"))) {',
        '  const source = node.dataset.diagramSource || "";',
        '  try {',
        '    flowchart.parse(source).drawSVG(node, {"line-width":2,"line-length":44,"text-margin":10,"font-size":14,"font-color":"#1f2937","line-color":"#5b6f91","element-color":"#93b5f6",fill:"#eff6ff"});',
        '  } catch (error) {',
        '    node.classList.add("diagram-error");',
        '    node.textContent = String(error);',
        '  }',
        '}',
        "</script>",
      ].join("\n"),
    );
  }

  return scripts;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

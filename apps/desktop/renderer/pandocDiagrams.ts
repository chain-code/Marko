// O-4：交给 Pandoc 之前，图表（Mermaid、流程图、时序图）先画好，Markdown 里换成引用一张图——导出的文档里是图，不是代码。
// 这里给出 SVG 和显示大小，主进程在后台窗口里截成 PNG（页面里画到画布上不行：Mermaid 的文字在 foreignObject 里，
// Chromium 会把画布标成不能导出）。图片的名字带随机串，不会和文档旁边的文件重名
import { nodeText, serialize, type MdNode } from "@marko/markdown";
import type { DiagramSvg } from "@marko/shared";

export interface DiagramTools {
  /** 画图表（同编辑区的沙箱，浅色：导出的文档是白底） */
  render(kind: string, source: string): Promise<{ svg: string } | { error: string }>;
  /** SVG 的显示大小（CSS 像素）；不是 SVG 时 null */
  size(svg: string): { width: number; height: number } | null;
}

/** 文档（模型）的 Markdown，图表块换成图片；画不出来的图表留着代码 */
export async function replaceDiagrams(model: MdNode, tools: DiagramTools, token: string): Promise<{ markdown: string; diagrams: DiagramSvg[] }> {
  const blocks: Array<{ node: MdNode; start: number; end: number }> = [];
  const markdown = serialize(model, {
    bom: false,
    onBlock(node, _gapStart, start, end) {
      if (node.type === "diagram") blocks.push({ node, start, end });
    },
  });
  const diagrams: DiagramSvg[] = [];
  let result = "";
  let last = 0;
  for (const block of blocks.sort((left, right) => left.start - right.start)) {
    const rendered = await tools.render(String(block.node.attrs?.kind ?? ""), nodeText(block.node));
    if (!("svg" in rendered)) continue;
    const size = tools.size(rendered.svg);
    if (!size) continue;
    const width = Math.max(1, Math.round(size.width));
    const height = Math.max(1, Math.round(size.height));
    const name = `marko-diagram-${token}-${diagrams.length + 1}.png`;
    diagrams.push({ name, svg: rendered.svg, width, height });
    // 图按两倍截（清楚），显示的宽度写在 Pandoc 的属性里，Word 里不会大一倍
    result += `${markdown.slice(last, block.start)}![](${name}){width=${width}px}`;
    last = block.end;
  }
  return { markdown: result + markdown.slice(last), diagrams };
}

/** SVG 元素的显示大小：width、height 是数字（可以带 px）时用它，不是时（Mermaid 的 100%）用 viewBox */
export function svgSize(svg: Element): { width: number; height: number } {
  const length = (value: string | null) => {
    const match = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/.exec(value ?? "");
    return match ? Number(match[1]) : 0;
  };
  const width = length(svg.getAttribute("width"));
  const height = length(svg.getAttribute("height"));
  if (width > 0 && height > 0) return { width, height };
  const box = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box[2]! > 0 && box[3]! > 0) return { width: box[2]!, height: box[3]! };
  return { width: 800, height: 600 };
}

/** 在页面里量（按 HTML 解析：沙箱过滤后的 SVG 不一定是严格的 XML） */
export function measureSvg(svg: string): { width: number; height: number } | null {
  const template = document.createElement("template");
  template.innerHTML = svg;
  const root = template.content.firstElementChild;
  return root && root.localName === "svg" ? svgSize(root) : null;
}

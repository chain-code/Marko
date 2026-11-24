// 库的入口（K-1，根目录的 vite.library.config.ts 从这里构建）：带上库的样式（排版、编辑样式、浅色主题），
// 登记默认的图表渲染（库自带的沙箱页）。应用（apps/desktop）直接用 index.ts，主题自己按设置加载，图表用自己的沙箱
import { DiagramRenderer, SandboxFrameChannel, type DiagramKind } from "@marko/render";
import { setDefaultDiagramRenderer, type DiagramTheme } from "./diagrams.ts";
import "./style.css";
import { DEFAULT_MARKO_TEXTS } from "./texts.ts";

export * from "./index.ts";

let renderer: Promise<DiagramRenderer> | null = null;

/**
 * 沙箱页（@marko/render 的图表沙箱，图表库全部内联成一个 HTML，构建时生成）用到时才加载。
 * 用 blob: 地址放进 sandbox="allow-scripts" 的 iframe：源是不透明的，读不到页面（1.2 节）。
 * 页面的 CSP 不许内联脚本时沙箱跑不起来，图表只显示源码
 */
function sandboxRenderer(): Promise<DiagramRenderer> {
  renderer ??= import("virtual:marko-diagram-sandbox").then(({ default: html }) => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    return new DiagramRenderer(new SandboxFrameChannel(url));
  });
  return renderer;
}

const KINDS = new Set<string>(["mermaid", "flowchart", "sequence"]);

setDefaultDiagramRenderer(async (kind: string, source: string, theme: DiagramTheme, unsupported = DEFAULT_MARKO_TEXTS.diagramUnsupported) => {
  if (!KINDS.has(kind)) return { error: unsupported(kind) };
  return (await sandboxRenderer()).render(kind as DiagramKind, source, theme);
});

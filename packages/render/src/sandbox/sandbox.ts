// 图表沙箱（1.2 节）：只在 sandbox="allow-scripts"、不带 allow-same-origin 的 iframe 里运行。
// 图表库（Mermaid、flowchart.js、js-sequence-diagrams 和它们依赖的 Raphael）只在这里加载。
// 加载完给父页面发 { type: "ready" }；父页面回一条 { type: "connect" }，带一个 MessagePort，之后请求
// { id, kind, source, theme } 和回复 { id, svg } / { id, error } 都走这个端口（diagrams.ts 的 SandboxFrameChannel）。
// 宿主会把 SVG 再过滤一遍
import { diagramId } from "../diagramStyle.ts";
import type { DiagramKind, DiagramRequest, DiagramResponse, DiagramTheme } from "../diagrams.ts";
import { randomHex } from "../random.ts";

// 画图要量文字，放在看不见但参与布局的位置
const stage = document.createElement("div");
stage.style.cssText = "position:absolute;left:-10000px;top:0;width:1200px";
document.body.append(stage);

// Mermaid 的 <style> 按 SVG 的 id 限定范围（diagramStyle.ts）：每个沙箱实例一个随机串，
// 沙箱重建后序号从头数，也不会和缓存里旧图的 id 撞上
const instance = randomHex(4);
let counter = 0;

const SEQUENCE_FONT = '"Andale Mono", Consolas, "Courier New", monospace';

const COLORS: Record<DiagramTheme, { text: string; line: string; fill: string; element: string }> = {
  light: { text: "#333333", line: "#5b6f91", fill: "#ffffff", element: "#5b6f91" },
  dark: { text: "#d8d8d8", line: "#9aa7bd", fill: "#2b2f36", element: "#9aa7bd" },
};

async function renderMermaid(source: string, theme: DiagramTheme): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: theme === "dark" ? "dark" : "default" });
  counter += 1;
  const { svg } = await mermaid.render(diagramId(instance, counter), source, stage);
  return svg;
}

async function renderFlowchart(source: string, theme: DiagramTheme): Promise<string> {
  const module = (await import("flowchart.js")) as { default?: FlowchartApi } & FlowchartApi;
  const flowchart = module.default ?? module;
  const colors = COLORS[theme];
  stage.innerHTML = "";
  flowchart.parse(source).drawSVG(stage, {
    "line-width": 2,
    "font-size": 14,
    "font-color": colors.text,
    "line-color": colors.line,
    "element-color": colors.element,
    fill: colors.fill,
    "yes-text": "yes",
    "no-text": "no",
  });
  const svg = stage.querySelector("svg");
  if (!svg) throw new Error("flowchart.js 没有画出图来");
  return svg.outerHTML;
}

/** js-sequence-diagrams 只有黑线白底一种配色；深色主题时换成 COLORS 里的颜色（同 flowchart.js 的配色） */
function recolorSequence(svg: SVGSVGElement, theme: DiagramTheme): void {
  if (theme === "light") return;
  const colors = COLORS[theme];
  const black = new Set(["#000", "#000000", "black"]);
  const white = new Set(["#fff", "#ffffff", "white"]);
  for (const element of svg.querySelectorAll<SVGElement>("*")) {
    for (const name of ["fill", "stroke"] as const) {
      const value = element.getAttribute(name)?.trim().toLowerCase() ?? "";
      if (black.has(value)) element.setAttribute(name, element.localName === "text" ? colors.text : colors.line);
      else if (white.has(value)) element.setAttribute(name, colors.fill);
    }
  }
}

async function renderSequence(source: string, theme: DiagramTheme): Promise<string> {
  // 这两个文件要经过 @marko/render/vite 的插件转换才能在浏览器里跑（grammar 的 CommonJS 尾巴、全局 Raphael）
  const [{ Diagram }, { RaphaelDrawer }] = await Promise.all([
    import("@hackmd/js-sequence-diagrams/dist/parser/diagram.js"),
    import("@hackmd/js-sequence-diagrams/dist/painter/drawer/RaphaelDrawer.js"),
  ]);
  stage.innerHTML = "";
  // 框的大小按这里量出的文字宽度定。默认字体是 "Andale Mono", monospace，Windows 上没有 Andale Mono，
  // 而 Electron 和浏览器对通用的 monospace 选的字体不同，导出的文件换个浏览器打开文字就出框；
  // 把各平台都有的等宽字体写在前面，量和显示用的是同一个。
  // 直接用 RaphaelDrawer：DiagramPainter.drawSvg 不把选项传下去
  new RaphaelDrawer(Diagram.parse(source), { "font-family": SEQUENCE_FONT }).draw(stage);
  const svg = stage.querySelector("svg");
  if (!svg) throw new Error("js-sequence-diagrams 没有画出图来");
  recolorSequence(svg, theme);
  return svg.outerHTML;
}

interface FlowchartApi {
  parse(source: string): { drawSVG(container: HTMLElement, options: Record<string, unknown>): void };
}

function render(request: DiagramRequest): Promise<string> {
  switch (request.kind) {
    case "mermaid":
      return renderMermaid(request.source, request.theme);
    case "flowchart":
      return renderFlowchart(request.source, request.theme);
    case "sequence":
      return renderSequence(request.source, request.theme);
    default:
      return Promise.reject(new Error(`不认识的图表：${String((request as { kind?: unknown }).kind)}`));
  }
}

const KINDS = new Set<DiagramKind>(["mermaid", "flowchart", "sequence"]);

function isRequest(data: unknown): data is DiagramRequest {
  const request = data as Partial<DiagramRequest> | null;
  return (
    typeof request?.id === "string" &&
    typeof request.source === "string" &&
    KINDS.has(request.kind as DiagramKind) &&
    (request.theme === "light" || request.theme === "dark")
  );
}

// 一次画一张：Mermaid 的渲染不能并发（宿主也是一次只发一个）
let queue: Promise<void> = Promise.resolve();
let port: MessagePort | null = null;

function handle(request: DiagramRequest, reply: MessagePort): void {
  queue = queue.then(async () => {
    let response: DiagramResponse;
    try {
      response = { id: request.id, svg: await render(request) };
    } catch (error) {
      response = { id: request.id, error: error instanceof Error ? error.message : String(error) };
    } finally {
      stage.innerHTML = "";
    }
    reply.postMessage(response);
  });
}

// 只认父页面发来的第一条 connect；直接 postMessage 到窗口上的请求一概不理
window.addEventListener("message", (event: MessageEvent) => {
  if (port || event.source !== window.parent) return;
  const connected = event.ports[0];
  if ((event.data as { type?: unknown } | null)?.type !== "connect" || !connected) return;
  port = connected;
  connected.onmessage = (message: MessageEvent) => {
    if (isRequest(message.data)) handle(message.data, connected);
  };
});

window.parent.postMessage({ type: "ready" }, "*");

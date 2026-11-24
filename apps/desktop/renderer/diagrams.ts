// 图表（D-3、D-4、1.2 节）：应用自己的沙箱页（renderer/sandbox.html，放进 sandbox="allow-scripts" 的 iframe，不透明源），
// 第一次画图时才建。编辑区、导出（O 章）共用这一个
import { DiagramRenderer, SandboxFrameChannel, type DiagramKind, type DiagramTheme } from "@marko/render";
import { t } from "./i18n.ts";

let renderer: DiagramRenderer | null = null;

const KINDS = new Set<string>(["mermaid", "flowchart", "sequence"]);

export async function renderDiagram(kind: string, source: string, theme: DiagramTheme): Promise<{ svg: string } | { error: string }> {
  if (!KINDS.has(kind)) return { error: t("diagram.unsupported", { kind }) };
  renderer ??= new DiagramRenderer(new SandboxFrameChannel(new URL("sandbox.html", location.href).href));
  const result = await renderer.render(kind as DiagramKind, source, theme);
  return result.svg !== undefined ? { svg: result.svg } : { error: result.error ?? t("diagram.failed") };
}

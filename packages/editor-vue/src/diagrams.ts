// 宿主没给画图表的能力（host.renderDiagram）时用的默认实现。库的入口（library.ts）登记一个：
// 在库自带的沙箱页里画（同旧版库，装上就能画图）；应用（apps/desktop）给自己的沙箱，不经过这里
export type DiagramTheme = "light" | "dark";

/** unsupported：不认识的图表种类时的提示（按界面语言） */
export type DefaultDiagramRenderer = (
  kind: string,
  source: string,
  theme: DiagramTheme,
  unsupported?: (kind: string) => string,
) => Promise<{ svg: string } | { error: string }>;

let fallback: DefaultDiagramRenderer | undefined;

/** 登记默认的图表渲染（库的入口调用） */
export function setDefaultDiagramRenderer(render: DefaultDiagramRenderer | undefined): void {
  fallback = render;
}

export function defaultDiagramRenderer(): DefaultDiagramRenderer | undefined {
  return fallback;
}

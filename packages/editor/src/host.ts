import type { EditorTexts } from "./texts.ts";
// 宿主接口（K-2）：编辑器需要的外部能力。桌面应用的实现在 apps/desktop/renderer/host.ts（调 window.marko）；
// 不传时用浏览器里的默认实现，编辑器可以单独在网页里用（1.1 节第 7 条）

export type ResourceKind = "image" | "link" | "media";

export interface EditorHost {
  /** 文档里写的地址（相对路径按文档所在的目录）→ 页面里能加载的地址 */
  resolveUrl(url: string, kind: ResourceKind): string;
  /** 打开链接（N-4：Ctrl+单击、Ctrl+Shift+O） */
  openLink(url: string): void;
  /**
   * 保存粘贴、拖进来的图片，返回写进 Markdown 的地址（M-2）；也可以连同替代文字一起给（不给时用文件名）。
   * 返回 null 表示不插入了（用户取消）：占位去掉，不报错
   */
  saveImage(file: Blob, name: string): Promise<string | { url: string; alt?: string } | null>;
  /** 画图表（D-3、D-4），在隔离的沙箱里画，返回过滤过的 SVG；不给时图表只显示源码 */
  renderDiagram?(kind: string, source: string): Promise<{ svg: string } | { error: string }>;
  /** 提示用户出了问题（图片没有插入……）；不给时写到控制台 */
  reportError?(message: string): void;
  /** 编辑器的文字（L-2：按界面语言）；不给、给了一部分时其余的用中文 */
  texts?: Partial<EditorTexts>;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 浏览器里的默认实现：地址原样用，链接在新标签页打开，图片转成 data: 地址 */
export const browserHost: EditorHost = {
  resolveUrl: (url) => url,
  openLink: (url) => {
    globalThis.open?.(url, "_blank", "noopener,noreferrer");
  },
  saveImage: (file) => readAsDataUrl(file),
  reportError: (message) => console.error(message),
};

// 编辑器自己的文字（K-2「界面文字」、L-2）：命令插进文档里的占位（表头、链接文本、脚注……）和给用户的提示。
// 宿主按界面语言通过 EditorHost.texts 传进来；不传、传了一部分时其余的用这里的中文（同旧版）
export type MediaTextKind = "image" | "video" | "audio";

export interface EditorTexts {
  /** 新表格的表头：第 n 列（从 1 开始）。「列 1」 */
  tableColumn: (n: number) => string;
  /** 新行、新列里的格子。「内容」 */
  tableCell: string;
  /** 新列的表头。「新列」 */
  newColumn: string;
  /** 插入链接时没有选文字。「链接文本」 */
  linkText: string;
  /** 插入图片时没有选文字。「图片描述」 */
  imageAlt: string;
  /** 插入注释时没有选文字。「注释文本」 */
  commentText: string;
  /** 新脚注的内容。「脚注内容」 */
  footnote: string;
  /** 新 Front Matter 的 title。「新文档」 */
  frontMatterTitle: string;
  /** 图表模板的两个节点。「开始」「结束」 */
  diagramStart: string;
  diagramEnd: string;
  /** 粘贴、拖进来的媒体没有插入（宿主保存失败） */
  insertFailed: (kind: MediaTextKind, name: string, reason: string) => string;
}

const KIND_NAMES: Record<MediaTextKind, string> = { image: "图片", video: "视频", audio: "音频" };

export const DEFAULT_TEXTS: EditorTexts = {
  tableColumn: (n) => `列 ${n}`,
  tableCell: "内容",
  newColumn: "新列",
  linkText: "链接文本",
  imageAlt: "图片描述",
  commentText: "注释文本",
  footnote: "脚注内容",
  frontMatterTitle: "新文档",
  diagramStart: "开始",
  diagramEnd: "结束",
  insertFailed: (kind, name, reason) => `${KIND_NAMES[kind]}「${name}」没有插入：${reason}`,
};

/** 宿主给的文字补上默认的 */
export function textsOf(host: { texts?: Partial<EditorTexts> } | undefined): EditorTexts {
  return host?.texts ? { ...DEFAULT_TEXTS, ...host.texts } : DEFAULT_TEXTS;
}

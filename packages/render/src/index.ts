// 文档模型 → HTML、HTML 过滤、公式、静态高亮、图表、自包含导出（1.3、1.7 节）

export { diagramKey, isMathFenceInfo, mathItemsOf, mathOccurrencesOf, renderHtml, type RenderOptions } from "./html.ts";
export { sanitizeHtml, sanitizeSvg } from "./sanitize.ts";
export { ALERT_ICONS, ALERT_TITLES } from "./alertIcons.ts";
export { loadMathFonts, mathStyles, renderMath, renderMathDocument, type MathItem, type MathNumbering, type MathResult } from "./math.ts";
export { codeHighlighter, findLanguage, highlightLines, loadLanguage, loadLanguages, loadedParser } from "./highlight.ts";
export { emojiFor, emojiShortcodes } from "./emoji.ts";
export { escapeAttribute, escapeHtml, safeUrl } from "./escape.ts";
export {
  cleanDiagramSvg,
  createSandboxFrame,
  DiagramRenderer,
  SandboxFrameChannel,
  type DiagramChannel,
  type DiagramKind,
  type DiagramRequest,
  type DiagramResponse,
  type DiagramResult,
  type DiagramTheme,
} from "./diagrams.ts";
export { exportDocument, type ExportOptions } from "./exportDocument.ts";

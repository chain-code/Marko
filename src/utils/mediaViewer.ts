export function clampViewerScale(value: number, minScale = 0.4, maxScale = 3): number {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.min(maxScale, Math.max(minScale, value));
  return Math.round(clamped * 100) / 100;
}

const viewerLockOwners = new Set<symbol>();

export function acquireViewerBodyLock(owner: symbol): void {
  if (viewerLockOwners.has(owner)) return;
  viewerLockOwners.add(owner);
  if (viewerLockOwners.size === 1 && typeof document !== "undefined") {
    document.body.classList.add("diagram-viewer-open");
  }
}

export function releaseViewerBodyLock(owner: symbol): void {
  if (!viewerLockOwners.delete(owner)) return;
  if (viewerLockOwners.size === 0 && typeof document !== "undefined") {
    document.body.classList.remove("diagram-viewer-open");
  }
}

export interface ViewerContentSizeInput {
  viewBoxWidth?: number | null;
  viewBoxHeight?: number | null;
  svgWidth?: string | number | null;
  svgHeight?: string | number | null;
  naturalWidth?: number | null;
  naturalHeight?: number | null;
  renderedWidth?: number | null;
  renderedHeight?: number | null;
}

export interface ViewerContentSize {
  width: number;
  height: number;
}

/** 解析 SVG 或图片尺寸属性，忽略百分比和非有限值。 */
export function parseViewerLength(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (!value) return 0;
  const match = value.trim().match(/^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/i);
  if (!match) return 0;
  const numericValue = Number(match[1]);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

/** 按 SVG viewBox、显式尺寸、图片自然尺寸、渲染尺寸顺序确定查看器基准尺寸。 */
export function getViewerContentSize(input: ViewerContentSizeInput): ViewerContentSize {
  const width = firstPositive(
    input.viewBoxWidth,
    parseViewerLength(input.svgWidth),
    input.naturalWidth,
    input.renderedWidth,
  );
  const height = firstPositive(
    input.viewBoxHeight,
    parseViewerLength(input.svgHeight),
    input.naturalHeight,
    input.renderedHeight,
  );
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

/** 生成缩放后的固定尺寸，避免查看器缩放时内容发生布局跳动。 */
export function getViewerContentStyle(
  size: ViewerContentSize,
  scale: number,
  minScale = 0.4,
  maxScale = 3,
): { width: string; height: string } {
  const safeScale = clampViewerScale(scale, minScale, maxScale);
  return {
    width: `${Math.max(1, Math.round(size.width * safeScale))}px`,
    height: `${Math.max(1, Math.round(size.height * safeScale))}px`,
  };
}

function firstPositive(...values: Array<number | null | undefined>): number {
  return values.find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ?? 0;
}

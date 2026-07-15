import type { OutlineItem } from "../types";
import { getLineEndOffset, getLineStartOffset } from "./textPosition";

export interface CollapsibleOutlineRow {
  item: OutlineItem;
  hasChildren: boolean;
  collapsed: boolean;
}

export function buildCollapsibleOutlineRows(
  items: OutlineItem[],
  collapsedIds: ReadonlySet<string>,
): CollapsibleOutlineRow[] {
  const rows: CollapsibleOutlineRow[] = [];
  const collapsedLevels: number[] = [];

  items.forEach((item, index) => {
    while (collapsedLevels.length > 0 && item.level <= collapsedLevels[collapsedLevels.length - 1]) {
      collapsedLevels.pop();
    }

    const hidden = collapsedLevels.length > 0;
    const hasChildren = (items[index + 1]?.level ?? 0) > item.level;
    const collapsed = hasChildren && collapsedIds.has(item.id);
    if (!hidden) {
      rows.push({ item, hasChildren, collapsed });
    }
    if (collapsed) {
      collapsedLevels.push(item.level);
    }
  });

  return rows;
}

export interface OutlineSelectionRange {
  start: number;
  end: number;
}

export function getActiveOutlineId(outline: OutlineItem[], cursorLine: number): string {
  let activeId = "";
  for (const item of outline) {
    if (item.line > cursorLine) break;
    activeId = item.id;
  }
  return activeId;
}

export function getOutlineSelectionRange(source: string, item: OutlineItem): OutlineSelectionRange {
  return {
    start: getLineStartOffset(source, item.line),
    end: getLineEndOffset(source, item.line),
  };
}

export function findOutlineItemByAnchor(outline: OutlineItem[], anchor: string): OutlineItem | null {
  const target = normalizeAnchor(anchor);
  if (!target) return null;

  return outline.find((item) => normalizeAnchor(item.id) === target) ?? null;
}

function normalizeAnchor(anchor: string): string {
  const trimmed = anchor.trim().replace(/^#/, "");
  if (!trimmed) return "";

  try {
    return decodeURIComponent(trimmed).toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

import type { SidebarTab } from "@/types";

export const sidebarWidthMin = 180;
export const sidebarWidthMax = 420;
export const sidebarWidthDefault = 260;

export interface SidebarViewState {
  sidebarVisible: boolean;
  focusMode: boolean;
  activeTab: SidebarTab;
}

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return sidebarWidthDefault;
  return Math.round(Math.min(sidebarWidthMax, Math.max(sidebarWidthMin, width)));
}

export function activateSidebarTab(state: SidebarViewState, activeTab: SidebarTab): SidebarViewState {
  return {
    sidebarVisible: true,
    focusMode: false,
    activeTab,
  };
}

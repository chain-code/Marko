import type { SidebarFileContextMenuItem, SidebarFileContextTarget } from "@/types";

export const sidebarContextMenuWidth = 218;
export const sidebarContextMenuPadding = 12;
export const sidebarContextMenuItemHeight = 32;

export function buildSidebarFileContextMenuItems(
  target: SidebarFileContextTarget,
  nativeFileActions: boolean,
): SidebarFileContextMenuItem[] {
  if (target.isDir) {
    return [
      ...(nativeFileActions ? [{ action: "newFileInFolder" as const, label: "新建 Markdown 文件..." }] : []),
      ...(nativeFileActions ? [{ action: "newFolderInFolder" as const, label: "新建文件夹..." }] : []),
      ...(nativeFileActions ? [{ action: "refreshFolder" as const, label: "刷新文件夹" }] : []),
      ...(nativeFileActions ? [{ action: "openAsWorkspace" as const, label: "作为工作区打开" }] : []),
      { action: "copyName", label: "复制名称" },
      { action: "copyRelativePath", label: "复制相对路径" },
      { action: "copyPath", label: "复制路径" },
      ...(nativeFileActions
        ? [
            { action: "openFolderPath" as const, label: "在资源管理器中打开" },
            { action: "deletePath" as const, label: "移到回收站..." },
          ]
        : []),
    ];
  }

  return [
    { action: "openFile", label: "打开" },
    ...(nativeFileActions ? [{ action: "renameFile" as const, label: "重命名..." }] : []),
    { action: "copyName", label: "复制名称" },
    { action: "copyMarkdownLink", label: "复制 Markdown 链接" },
    { action: "copyRelativePath", label: "复制相对路径" },
    { action: "copyPath", label: "复制路径" },
    ...(target.source === "recent" ? [{ action: "removeRecent" as const, label: "从最近文件移除" }] : []),
    ...(nativeFileActions
      ? [
          { action: "revealFile" as const, label: "在资源管理器中显示" },
          { action: "openContainingFolder" as const, label: "打开所在文件夹" },
          { action: "deletePath" as const, label: "移到回收站..." },
        ]
      : []),
  ];
}

export function clampSidebarContextMenuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  itemCount: number,
): { x: number; y: number } {
  const menuHeight = Math.max(1, itemCount) * sidebarContextMenuItemHeight + sidebarContextMenuPadding;
  return {
    x: Math.max(8, Math.min(x, viewportWidth - sidebarContextMenuWidth - 8)),
    y: Math.max(8, Math.min(y, viewportHeight - menuHeight - 8)),
  };
}

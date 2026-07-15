export type FileTreeKeyboardAction =
  | "previous"
  | "next"
  | "first"
  | "last"
  | "parent"
  | "child"
  | "expand"
  | "collapse"
  | "activate";

export interface FileTreeKeyboardState {
  isDirectory: boolean;
  expanded: boolean;
  hasChildren: boolean;
  hasParent: boolean;
}

export function resolveFileTreeKey(
  key: string,
  state: FileTreeKeyboardState,
): FileTreeKeyboardAction | null {
  if (key === "ArrowUp") return "previous";
  if (key === "ArrowDown") return "next";
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if (key === "Enter" || key === " ") return "activate";

  if (key === "ArrowRight" && state.isDirectory) {
    if (!state.expanded) return "expand";
    return state.hasChildren ? "child" : null;
  }

  if (key === "ArrowLeft") {
    if (state.isDirectory && state.expanded) return "collapse";
    return state.hasParent ? "parent" : null;
  }

  return null;
}

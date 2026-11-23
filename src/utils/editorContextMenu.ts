import type { EditorCommand } from "@/types";

export interface EditorContextMenuAction<TCommand extends string = EditorCommand> {
  type: "action";
  command: TCommand;
  label: string;
  shortcut?: string;
}

export interface EditorContextMenuSeparator {
  type: "separator";
}

export type EditorContextMenuItem<TCommand extends string = EditorCommand> =
  | EditorContextMenuAction<TCommand>
  | EditorContextMenuSeparator;

export type RawBlockContextMenuCommand =
  | "copyRawBlockContent"
  | "indentRawBlockSelection"
  | "indentRawBlockAll";

export type EditorContextMenuCommand = EditorCommand | RawBlockContextMenuCommand;

export const editorContextMenuWidth = 236;
export const editorContextMenuPadding = 12;
export const editorContextMenuItemHeight = 32;

export const editorContextMenuItems: EditorContextMenuItem[] = [
  { type: "action", command: "undo", label: "撤销", shortcut: "Ctrl+Z" },
  { type: "action", command: "redo", label: "重做", shortcut: "Ctrl+Y" },
  { type: "separator" },
  { type: "action", command: "cut", label: "剪切", shortcut: "Ctrl+X" },
  { type: "action", command: "copy", label: "复制", shortcut: "Ctrl+C" },
  { type: "action", command: "paste", label: "粘贴", shortcut: "Ctrl+V" },
  { type: "action", command: "pastePlainText", label: "粘贴为纯文本", shortcut: "Ctrl+Shift+V" },
  { type: "separator" },
  { type: "action", command: "copyMarkdown", label: "复制为 Markdown", shortcut: "Ctrl+Shift+C" },
  { type: "action", command: "copyHtml", label: "复制为 HTML" },
  { type: "action", command: "copyPlainText", label: "复制为纯文本" },
  { type: "separator" },
  { type: "action", command: "selectAll", label: "全选", shortcut: "Ctrl+A" },
  { type: "action", command: "link", label: "链接", shortcut: "Ctrl+K" },
  { type: "action", command: "openLink", label: "打开链接", shortcut: "Ctrl+Shift+O" },
  { type: "separator" },
  { type: "action", command: "bold", label: "加粗", shortcut: "Ctrl+B" },
  { type: "action", command: "italic", label: "斜体", shortcut: "Ctrl+I" },
  { type: "action", command: "inlineCode", label: "行内代码", shortcut: "Ctrl+Shift+`" },
  { type: "action", command: "clearFormat", label: "清除格式", shortcut: "Ctrl+\\" },
];

export const rawBlockContextMenuItems: EditorContextMenuItem<RawBlockContextMenuCommand>[] = [
  { type: "action", command: "copyRawBlockContent", label: "复制代码块内容" },
  { type: "action", command: "indentRawBlockSelection", label: "为选中内容调整缩进" },
  { type: "action", command: "indentRawBlockAll", label: "为整个代码块调整缩进" },
];

export function getEditorContextMenuItems(
  includeRawBlockTools: boolean,
): EditorContextMenuItem<EditorContextMenuCommand>[] {
  if (!includeRawBlockTools) return editorContextMenuItems;
  const insertionIndex = editorContextMenuItems.findIndex((item) => (
    item.type === "action" && item.command === "copyPlainText"
  )) + 1;
  return [
    ...editorContextMenuItems.slice(0, insertionIndex),
    ...rawBlockContextMenuItems,
    ...editorContextMenuItems.slice(insertionIndex),
  ];
}

export function isRawBlockContextMenuCommand(
  command: EditorContextMenuCommand,
): command is RawBlockContextMenuCommand {
  return command === "copyRawBlockContent"
    || command === "indentRawBlockSelection"
    || command === "indentRawBlockAll";
}

export function clampEditorContextMenuPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  itemCount: number,
): { x: number; y: number } {
  const menuHeight = Math.max(1, itemCount) * editorContextMenuItemHeight + editorContextMenuPadding;
  return {
    x: Math.max(8, Math.min(x, viewportWidth - editorContextMenuWidth - 8)),
    y: Math.max(8, Math.min(y, viewportHeight - menuHeight - 8)),
  };
}

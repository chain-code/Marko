import type { EditorCommand } from "@/types";

export type EditorShortcutAction =
  | { type: "command"; command: EditorCommand }
  | { type: "save" }
  | { type: "saveAs" }
  | { type: "open" };

export interface KeyboardShortcutState {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function resolveEditorShortcut(event: KeyboardShortcutState): EditorShortcutAction | null {
  const key = normalizeShortcutKey(event.key);

  if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
    switch (key) {
      case "5":
      case "%":
        return { type: "command", command: "strike" };
      default:
        return null;
    }
  }

  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    switch (key) {
      case "ArrowUp":
        return { type: "command", command: "moveLineUp" };
      case "ArrowDown":
        return { type: "command", command: "moveLineDown" };
      case "ArrowRight":
        return { type: "command", command: "indent" };
      case "ArrowLeft":
        return { type: "command", command: "outdent" };
      default:
        return null;
    }
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    switch (key) {
      case "Home":
        return { type: "command", command: "goToDocumentStart" };
      case "End":
        return { type: "command", command: "goToDocumentEnd" };
      default:
        break;
    }
  }

  if (event.altKey || (!event.ctrlKey && !event.metaKey)) return null;

  if (event.shiftKey) {
    switch (key) {
      case "s":
        return { type: "saveAs" };
      case "z":
        return { type: "command", command: "redo" };
      case "[":
      case "{":
        return { type: "command", command: "orderedList" };
      case "]":
      case "}":
        return { type: "command", command: "bulletList" };
      case "q":
        return { type: "command", command: "blockquote" };
      case "x":
        return { type: "command", command: "taskList" };
      case "d":
        return { type: "command", command: "deleteWord" };
      case "Backspace":
      case "Delete":
        return { type: "command", command: "deleteLine" };
      case "c":
        return { type: "command", command: "copyMarkdown" };
      case "v":
        return { type: "command", command: "pastePlainText" };
      case "k":
        return { type: "command", command: "codeBlock" };
      case "o":
        return { type: "command", command: "openLink" };
      case "m":
        return { type: "command", command: "mathBlock" };
      case "i":
        return { type: "command", command: "image" };
      case "/":
      case "?":
        return { type: "command", command: "comment" };
      case "`":
      case "~":
        return { type: "command", command: "inlineCode" };
      default:
        return null;
    }
  }

  switch (key) {
    case "z":
      return { type: "command", command: "undo" };
    case "y":
      return { type: "command", command: "redo" };
    case "s":
      return { type: "save" };
    case "o":
      return { type: "open" };
    case "a":
      return { type: "command", command: "selectAll" };
    case "b":
      return { type: "command", command: "bold" };
    case "i":
      return { type: "command", command: "italic" };
    case "u":
      return { type: "command", command: "underline" };
    case "k":
      return { type: "command", command: "link" };
    case "l":
      return { type: "command", command: "selectLine" };
    case "d":
      return { type: "command", command: "selectWord" };
    case "e":
      return { type: "command", command: "selectStyleScope" };
    case "]":
    case "}":
      return { type: "command", command: "indent" };
    case "[":
    case "{":
      return { type: "command", command: "outdent" };
    case "\\":
      return { type: "command", command: "clearFormat" };
    case "t":
      return { type: "command", command: "table" };
    case "=":
    case "+":
      return { type: "command", command: "increaseHeading" };
    case "-":
    case "_":
      return { type: "command", command: "decreaseHeading" };
    case "0":
      return { type: "command", command: "paragraph" };
    case "1":
      return { type: "command", command: "heading1" };
    case "2":
      return { type: "command", command: "heading2" };
    case "3":
      return { type: "command", command: "heading3" };
    case "4":
      return { type: "command", command: "heading4" };
    case "5":
      return { type: "command", command: "heading5" };
    case "6":
      return { type: "command", command: "heading6" };
    default:
      return null;
  }
}

function normalizeShortcutKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

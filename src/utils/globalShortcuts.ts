export type GlobalShortcutAction =
  | "newFile"
  | "openFile"
  | "closeFile"
  | "reloadFile"
  | "quickOpen"
  | "save"
  | "saveAs"
  | "find"
  | "findNext"
  | "findPrevious"
  | "jumpToSelection"
  | "globalSearch"
  | "replace"
  | "print"
  | "zoomIn"
  | "zoomOut"
  | "resetZoom"
  | "toggleSidebar"
  | "showOutline"
  | "showFileList"
  | "showFileTree"
  | "toggleSource"
  | "toggleFocus"
  | "toggleTypewriter"
  | "settings"
  | "fullscreen"
  | "openDevtools";

export interface GlobalShortcutState {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

export function resolveGlobalShortcut(event: GlobalShortcutState): GlobalShortcutAction | null {
  const key = normalizeShortcutKey(event.key);
  const commandKey = Boolean(event.ctrlKey || event.metaKey);

  if (event.altKey && event.shiftKey && !commandKey && key === "p") return "print";
  if (event.altKey) return null;

  if (!commandKey) {
    if (key === "F3") return event.shiftKey ? "findPrevious" : "findNext";
    if (!event.shiftKey) {
      switch (key) {
        case "F8":
          return "toggleFocus";
        case "F9":
          return "toggleTypewriter";
        case "F11":
          return "fullscreen";
        case "F12":
          return "openDevtools";
        default:
          break;
      }
    }
    return null;
  }

  if (event.shiftKey) {
    switch (key) {
      case "g":
        return "findPrevious";
      case "f":
        return "globalSearch";
      case "l":
        return "toggleSidebar";
      case "s":
        return "saveAs";
      case "p":
        return null;
      case "1":
        return "showOutline";
      case "2":
        return "showFileList";
      case "3":
        return "showFileTree";
      case "=":
      case "+":
        return "zoomIn";
      case "-":
      case "_":
        return "zoomOut";
      case "0":
        return "resetZoom";
      case "i":
        return "openDevtools";
      default:
        return null;
    }
  }

  switch (key) {
    case "n":
      return "newFile";
    case "o":
      return "openFile";
    case "w":
      return "closeFile";
    case "r":
      return "reloadFile";
    case "p":
      return "quickOpen";
    case "s":
      return "save";
    case "f":
      return "find";
    case "g":
      return "findNext";
    case "h":
      return "replace";
    case "j":
      return "jumpToSelection";
    case "/":
      return "toggleSource";
    case ",":
      return "settings";
    default:
      return null;
  }
}

function normalizeShortcutKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

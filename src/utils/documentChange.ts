import type { EditorSettings } from "../types";
import { shouldAutoSaveDocument, shouldSaveDocumentBeforeSwitch } from "./editorSettings";

export type UnsavedChangesDecision = "save" | "discard" | "cancel";

export function shouldSaveBeforeDocumentChange(
  settings: Pick<EditorSettings, "autoSave" | "saveOnFileSwitch">,
  dirty: boolean,
  currentFilePath: string,
  desktopRuntime: boolean,
  switchingFile: boolean,
): boolean {
  return shouldAutoSaveDocument(settings, dirty, currentFilePath, desktopRuntime)
    || (switchingFile && shouldSaveDocumentBeforeSwitch(
      settings,
      dirty,
      currentFilePath,
      desktopRuntime,
    ));
}

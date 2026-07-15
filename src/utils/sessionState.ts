export interface EditorSessionState {
  markdown: string;
  originalMarkdown: string;
  currentFilePath: string;
  currentFileName: string;
  rootPath: string;
  diskBaselineFingerprint?: string;
  forceDirty?: boolean;
}

export const untitledFileName = "未命名.md";

interface StoredEditorSessionState extends EditorSessionState {
  version: 1;
}

export function createUntitledEditorSession(rootPath = ""): EditorSessionState {
  return {
    markdown: "",
    originalMarkdown: "",
    currentFilePath: "",
    currentFileName: untitledFileName,
    rootPath,
  };
}

export function createLoadedEditorSession(content: string, path: string, fileName: string, rootPath = ""): EditorSessionState {
  const markdown = normalizeEditorMarkdown(content);
  return {
    markdown,
    originalMarkdown: markdown,
    currentFilePath: path,
    currentFileName: fileName || untitledFileName,
    rootPath,
    ...(path ? { diskBaselineFingerprint: fingerprintDiskContent(content) } : {}),
  };
}

export function serializeEditorSession(state: EditorSessionState): string {
  const payload: StoredEditorSessionState = {
    version: 1,
    markdown: state.markdown,
    originalMarkdown: state.originalMarkdown,
    currentFilePath: state.currentFilePath,
    currentFileName: state.currentFileName,
    rootPath: state.rootPath,
    diskBaselineFingerprint: typeof state.diskBaselineFingerprint === "string"
      ? state.diskBaselineFingerprint
      : undefined,
    forceDirty: state.forceDirty || undefined,
  };
  return JSON.stringify(payload);
}

export function prepareEditorSessionForRecovery(
  state: EditorSessionState,
  recoverUnsavedDrafts: boolean,
): EditorSessionState {
  if (recoverUnsavedDrafts || (!state.forceDirty && state.markdown === state.originalMarkdown)) return state;
  const cleanState = { ...state };
  delete cleanState.forceDirty;
  cleanState.markdown = state.originalMarkdown;
  return cleanState;
}

export function parseEditorSession(raw: string | null, fallback: EditorSessionState): EditorSessionState {
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredEditorSessionState>;
    if (parsed.version !== 1 || typeof parsed.markdown !== "string") {
      return fallback;
    }

    return {
      markdown: normalizeEditorMarkdown(removePendingImagePlaceholders(parsed.markdown)),
      originalMarkdown: normalizeEditorMarkdown(
        removePendingImagePlaceholders(
          typeof parsed.originalMarkdown === "string" ? parsed.originalMarkdown : parsed.markdown,
        ),
      ),
      currentFilePath: typeof parsed.currentFilePath === "string" ? parsed.currentFilePath : "",
      currentFileName: typeof parsed.currentFileName === "string" ? parsed.currentFileName : fallback.currentFileName,
      rootPath: typeof parsed.rootPath === "string" ? parsed.rootPath : "",
      ...(typeof parsed.diskBaselineFingerprint === "string"
        ? { diskBaselineFingerprint: parsed.diskBaselineFingerprint }
        : {}),
      ...(parsed.forceDirty === true ? { forceDirty: true } : {}),
    };
  } catch {
    return fallback;
  }
}

export function normalizeEditorMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}

export function removePendingImagePlaceholders(markdown: string): string {
  return markdown
    .replace(/\r?\n<!--marko-image-[a-z0-9-]+-->\r?\n/gi, "")
    .replace(/<!--marko-image-[a-z0-9-]+-->/gi, "");
}

export function fingerprintDiskContent(content: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${content.length.toString(36)}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
}

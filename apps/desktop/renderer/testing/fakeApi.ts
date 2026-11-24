// 测试用的 window.marko：文件在内存里，事件可以手动发。只在测试里用
import {
  applySettingsPatch,
  DEFAULT_SETTINGS,
  type DocumentState,
  type DraftSaveRequest,
  type MarkoApi,
  type MarkoEvents,
  type OpenedDocument,
  type RecentFile,
  type Result,
  type SavedFile,
  type Settings,
} from "@marko/shared";

export interface FakeApi extends MarkoApi {
  /** 磁盘上的文件（路径 → 内容） */
  disk: Map<string, string>;
  /** 每个文件的版本号：当作磁盘内容的指纹 */
  versions: Map<string, number>;
  states: DocumentState[];
  closed: number;
  cancelled: number;
  newWindows: number;
  /** 另存为对话框选的路径（null = 取消） */
  saveAsPath: string | null;
  /** 打开对话框选的路径（null = 取消） */
  pickPath: string | null;
  /** 已经在别的窗口里打开着的文件 */
  elsewhere: Set<string>;
  /** 写着的草稿（F-9） */
  drafts: Map<string, DraftSaveRequest>;
  /** 当前窗口是不是没改过的空白新文档（F-3 的规则） */
  emit<Name extends keyof MarkoEvents>(event: Name, payload: MarkoEvents[Name]): void;
  /** 别的程序改了文件（版本号变了） */
  touch(path: string, content: string): void;
}

export function createFakeApi(initial: Record<string, string> = {}): FakeApi {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  let settings: Settings = DEFAULT_SETTINGS;
  let recent: RecentFile[] = [];
  const api = {
    disk: new Map(Object.entries(initial)),
    versions: new Map(Object.keys(initial).map((path) => [path, 1])),
    states: [] as DocumentState[],
    closed: 0,
    cancelled: 0,
    newWindows: 0,
    saveAsPath: null as string | null,
    pickPath: null as string | null,
    elsewhere: new Set<string>(),
    drafts: new Map<string, DraftSaveRequest>(),
  } as FakeApi;

  const hashOf = (path: string) => `${path}#${api.versions.get(path) ?? 0}`;
  const read = (path: string): Result<OpenedDocument> => {
    const content = api.disk.get(path);
    if (content === undefined) return { ok: false, error: { code: "not_found", message: "文件不存在" } };
    return { ok: true, value: { path, content, encoding: "utf-8", bom: false, hash: hashOf(path) } };
  };
  const write = (path: string, content: string): SavedFile => {
    api.disk.set(path, content);
    api.versions.set(path, (api.versions.get(path) ?? 0) + 1);
    return { path, hash: hashOf(path) };
  };
  const pristine = () => api.states.at(-1)?.pristine ?? true;
  const open = (path: string) => {
    const result = read(path);
    if (!result.ok) return result;
    recent = [{ path, openedAt: Date.now() }, ...recent.filter((item) => item.path !== path)];
    if (pristine()) return { ok: true as const, value: { target: "here" as const, document: result.value } };
    api.newWindows += 1;
    return { ok: true as const, value: { target: "elsewhere" as const } };
  };

  Object.assign(api, {
    app: { version: async () => "2.0.0", platform: async () => "win32" },
    file: {
      pickAndOpen: async () => (api.pickPath ? open(api.pickPath) : { ok: true, value: null }),
      open: async (path: string) => open(path),
      openHere: async (path: string) => {
        if (api.elsewhere.has(path)) return { ok: true, value: { target: "elsewhere" } };
        if (api.states.at(-1)?.path === path) return { ok: true, value: { target: "current" } };
        const result = read(path);
        return result.ok ? { ok: true, value: { target: "here", document: result.value } } : result;
      },
      read: async (path: string) => read(path),
      save: async (request: { path: string; content: string; expectedHash: string | null }) => {
        if (request.expectedHash !== null && api.disk.has(request.path) && request.expectedHash !== hashOf(request.path)) {
          return { ok: false, error: { code: "conflict", message: "文件已被其他程序修改" } };
        }
        return { ok: true, value: write(request.path, request.content) };
      },
      saveAs: async (request: { content: string }) => (api.saveAsPath ? { ok: true, value: write(api.saveAsPath, request.content) } : { ok: true, value: null }),
    },
    window: {
      setDocumentState: async (state: DocumentState) => {
        api.states.push(state);
      },
      newWindow: async () => {
        api.newWindows += 1;
      },
      close: async () => {
        api.closed += 1;
      },
      cancelClose: async () => {
        api.cancelled += 1;
      },
      initialDocument: async () => null,
      initialDraft: async () => null,
    },
    draft: {
      save: async (request: DraftSaveRequest) => {
        api.drafts.set(request.id, request);
      },
      remove: async (id: string) => {
        api.drafts.delete(id);
      },
    },
    settings: {
      get: async () => settings,
      set: async (patch: Parameters<MarkoApi["settings"]["set"]>[0]) => {
        settings = applySettingsPatch(settings, patch);
        return settings;
      },
    },
    recent: {
      list: async () => recent,
      remove: async (path: string) => {
        recent = recent.filter((item) => item.path !== path);
        return recent;
      },
      clear: async () => {
        recent = [];
      },
    },
    shell: { openExternal: async () => ({ ok: true, value: undefined }), showItemInFolder: async () => {} },
    on(event: string, listener: (payload: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return () => listeners.get(event)?.delete(listener);
    },
    emit(event: string, payload: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
    touch(path: string, content: string) {
      write(path, content);
    },
  });
  return api;
}

// 预加载脚本：只暴露 window.marko（1.2、1.9 节），不暴露 ipcRenderer 本身。每个方法对应一个 ipcMain.handle 通道
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import { CHANNELS, EVENTS, type MarkoApi, type MarkoEvents } from "@marko/shared";

const KNOWN_EVENTS = new Set<string>(Object.values(EVENTS));

const api: MarkoApi = {
  app: {
    version: () => ipcRenderer.invoke(CHANNELS.appVersion),
    platform: () => ipcRenderer.invoke(CHANNELS.appPlatform),
  },
  file: {
    pickAndOpen: () => ipcRenderer.invoke(CHANNELS.filePickAndOpen),
    open: (path) => ipcRenderer.invoke(CHANNELS.fileOpen, path),
    openLink: (path, anchor) => ipcRenderer.invoke(CHANNELS.fileOpenLink, path, anchor),
    // F-15：路径从系统给的文件取（webUtils），网页自己造的文件取不到路径
    // 一个都没有路径（网页里的、浏览器拖来的虚拟文件）就不用问主进程了
    openDropped: (files) => {
      const paths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean).slice(0, 50);
      return paths.length ? ipcRenderer.invoke(CHANNELS.fileOpenDropped, paths) : Promise.resolve({ ok: true, value: { workspace: null, document: null } });
    },
    openHere: (path) => ipcRenderer.invoke(CHANNELS.fileOpenHere, path),
    read: (path, encoding) => ipcRenderer.invoke(CHANNELS.fileRead, path, encoding),
    save: (request) => ipcRenderer.invoke(CHANNELS.fileSave, request),
    saveAs: (request) => ipcRenderer.invoke(CHANNELS.fileSaveAs, request),
  },
  window: {
    setDocumentState: (state) => ipcRenderer.invoke(CHANNELS.windowSetDocumentState, state),
    newWindow: () => ipcRenderer.invoke(CHANNELS.windowNew),
    close: () => ipcRenderer.invoke(CHANNELS.windowClose),
    cancelClose: () => ipcRenderer.invoke(CHANNELS.windowCancelClose),
    initialDocument: () => ipcRenderer.invoke(CHANNELS.windowInitialDocument),
    initialDraft: () => ipcRenderer.invoke(CHANNELS.windowInitialDraft),
    initialState: () => ipcRenderer.invoke(CHANNELS.windowInitialState),
    setLayout: (layout) => ipcRenderer.invoke(CHANNELS.windowSetLayout, layout),
  },
  settings: {
    get: () => ipcRenderer.invoke(CHANNELS.settingsGet),
    set: (patch) => ipcRenderer.invoke(CHANNELS.settingsSet, patch),
  },
  recent: {
    list: () => ipcRenderer.invoke(CHANNELS.recentList),
    remove: (path) => ipcRenderer.invoke(CHANNELS.recentRemove, path),
    clear: () => ipcRenderer.invoke(CHANNELS.recentClear),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(CHANNELS.shellOpenExternal, url),
    showItemInFolder: (path) => ipcRenderer.invoke(CHANNELS.shellShowItemInFolder, path),
    openFolder: (path) => ipcRenderer.invoke(CHANNELS.shellOpenFolder, path),
    copyText: (text) => ipcRenderer.invoke(CHANNELS.shellCopyText, text),
  },
  menu: {
    popup: (items) => ipcRenderer.invoke(CHANNELS.menuPopup, items),
  },
  update: {
    install: () => ipcRenderer.invoke(CHANNELS.updateInstall),
  },
  spellcheck: {
    words: () => ipcRenderer.invoke(CHANNELS.spellcheckWords),
    removeWord: (word) => ipcRenderer.invoke(CHANNELS.spellcheckRemoveWord, word),
  },
  themes: {
    list: () => ipcRenderer.invoke(CHANNELS.themesList),
    openFolder: () => ipcRenderer.invoke(CHANNELS.themesOpenFolder),
    exportCss: (file) => ipcRenderer.invoke(CHANNELS.themesExportCss, file),
  },
  files: {
    create: (directory, name) => ipcRenderer.invoke(CHANNELS.fileCreate, directory, name),
    createFolder: (directory, name) => ipcRenderer.invoke(CHANNELS.fileCreateFolder, directory, name),
    rename: (path, name) => ipcRenderer.invoke(CHANNELS.fileRename, path, name),
    trash: (path) => ipcRenderer.invoke(CHANNELS.fileTrash, path),
  },
  workspace: {
    pickAndOpen: () => ipcRenderer.invoke(CHANNELS.workspacePickAndOpen),
    open: (root) => ipcRenderer.invoke(CHANNELS.workspaceOpen, root),
    list: (root) => ipcRenderer.invoke(CHANNELS.workspaceList, root),
    openContaining: () => ipcRenderer.invoke(CHANNELS.workspaceOpenContaining),
    close: () => ipcRenderer.invoke(CHANNELS.workspaceClose),
  },
  draft: {
    save: (request) => ipcRenderer.invoke(CHANNELS.draftSave, request),
    remove: (id) => ipcRenderer.invoke(CHANNELS.draftRemove, id),
  },
  media: {
    pick: () => ipcRenderer.invoke(CHANNELS.mediaPick),
    save: (request) => ipcRenderer.invoke(CHANNELS.mediaSave, request),
    // 拖进来、粘贴的文件的路径（File.path 在 Electron 32 去掉了）。路径在这里由 File 算出来再告诉主进程，
    // 页面只能交 File（拿不到任意路径的 File），交不了路径字符串（X-1）
    pathOf: async (file) => {
      const path = webUtils.getPathForFile(file);
      if (path) await ipcRenderer.invoke(CHANNELS.mediaAllowDropped, path);
      return path;
    },
  },
  export: {
    run: (request) => ipcRenderer.invoke(CHANNELS.exportRun, request),
    last: (documentPath) => ipcRenderer.invoke(CHANNELS.exportLast, documentPath),
    print: (html) => ipcRenderer.invoke(CHANNELS.exportPrint, html),
  },
  import: {
    run: () => ipcRenderer.invoke(CHANNELS.importRun),
  },
  upload: {
    setToken: (token) => ipcRenderer.invoke(CHANNELS.uploadSetToken, token),
    hasToken: () => ipcRenderer.invoke(CHANNELS.uploadHasToken),
  },
  search: {
    start: (request) => ipcRenderer.invoke(CHANNELS.searchStart, request),
    cancel: (id) => ipcRenderer.invoke(CHANNELS.searchCancel, id),
  },
  on(event, listener) {
    // 只转发已知的事件；回调拿不到 IpcRendererEvent（里面有 sender）
    if (!KNOWN_EVENTS.has(event)) return () => {};
    const wrapped = (_event: IpcRendererEvent, payload: MarkoEvents[typeof event]) => listener(payload);
    ipcRenderer.on(event, wrapped);
    return () => {
      ipcRenderer.removeListener(event, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("marko", api);

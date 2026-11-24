// 编辑器的宿主（K-2）的桌面实现：调 window.marko。
// - 文档里的相对地址按文档所在目录换成 marko-asset:// 地址（M-1），绝对的本地路径同样换；网址、data: 原样；
// - 链接：网址交给系统浏览器；本地的 Markdown 文件按 F-3 的规则打开（N-4）
import { assetUrl, type MarkoApi, type Settings } from "@marko/shared";
import type { MarkoEditorHost } from "@marko/editor-vue";
import { renderDiagram } from "./diagrams.ts";
import { basename, dirname, isAbsolute, join } from "./paths.ts";
import { editorTexts } from "./editorTexts.ts";
import { t } from "./i18n.ts";

/** 有协议的地址（http:、data:、marko-asset:……）、协议相对地址、页内锚点 */
function hasScheme(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[a-zA-Z]:[\\/]/.test(url);
}

/** 链接里 # 后面的标题（解码后的；不合法的百分号转义照原样）；没有时 undefined */
function anchorOf(url: string): string | undefined {
  const hash = url.indexOf("#");
  if (hash < 0 || hash === url.length - 1) return undefined;
  const id = url.slice(hash + 1);
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function decodePath(url: string): string {
  const path = url.split(/[?#]/)[0];
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

export interface HostOptions {
  /** 现在的文档路径（新文档是 null） */
  documentPath(): string | null;
  /** 新文档插入要复制的媒体前先保存（M-3）：返回保存后的路径，用户取消了是 null */
  saveFirst(): Promise<string | null>;
  /** S-9「插入本地媒体时」 */
  insertAction(): Settings["imageInsertAction"];
  /** 图表用浅色还是深色（D-3，跟着主题） */
  diagramTheme(): "light" | "dark";
  /** 文档里的本地链接（N-4）：绝对路径和解码后的 #标题 */
  openLocal(path: string, anchor?: string): void;
  reportError(message: string): void;
}

/** 保存本地媒体（M-2、M-3、M-7）：交给主进程复制、上传，返回写进 Markdown 的地址；null 表示不插入了 */
export interface MediaSaver {
  /** 粘贴、拖进来的文件：有磁盘上的路径时按路径复制，没有（截图）时把内容发过去 */
  saveFile(file: Blob, name: string): Promise<string | null>;
  /** 「插入本地图片...」选的文件 */
  savePath(path: string): Promise<string | null>;
}

export function createMediaSaver(api: MarkoApi, options: HostOptions): MediaSaver {
  /** 一次拖进来几个文件时只问一次保存 */
  let savingFirst: Promise<string | null> | null = null;

  async function documentFor(needsCopy: boolean): Promise<string | null | undefined> {
    const path = options.documentPath();
    if (path || !needsCopy) return path;
    savingFirst ??= options.saveFirst().finally(() => {
      savingFirst = null;
    });
    // undefined：要保存但用户取消了，不插入
    return (await savingFirst) ?? undefined;
  }

  async function save(request: { sourcePath?: string; data?: Uint8Array; name: string }): Promise<string | null> {
    const documentPath = await documentFor(!request.sourcePath || options.insertAction() !== "none");
    if (documentPath === undefined) return null;
    const result = await api.media.save({ documentPath, ...request });
    if (!result.ok) throw new Error(result.error.message);
    return result.value.url;
  }

  return {
    async saveFile(file, name) {
      const sourcePath = file instanceof File ? await api.media.pathOf(file) : "";
      if (sourcePath) return save({ sourcePath, name });
      return save({ data: new Uint8Array(await file.arrayBuffer()), name });
    },
    savePath: (path) => save({ sourcePath: path, name: basename(path) }),
  };
}

export function createHost(api: MarkoApi, options: HostOptions, media: MediaSaver = createMediaSaver(api, options)): Partial<MarkoEditorHost> {
  return {
    saveImage: (file, name) => media.saveFile(file, name),
    // 图表在应用自己的沙箱页里画（D-3、D-4）
    renderDiagram: (kind, source) => renderDiagram(kind, source, options.diagramTheme()),
    resolveUrl(url, kind) {
      // 链接原样（N-4：openLink 自己按文档的位置解析，还要 #标题）；图片、视频、音频换成能加载的地址
      if (kind === "link" || !url || url.startsWith("#") || url.startsWith("//") || hasScheme(url)) return url;
      const path = decodePath(url);
      if (isAbsolute(path)) return assetUrl(path);
      const documentPath = options.documentPath();
      // 新文档还没有目录：相对地址找不到
      if (!documentPath) return url;
      return assetUrl(join(dirname(documentPath), path));
    },
    openLink(url) {
      if (/^(https?:|mailto:)/i.test(url)) {
        void api.shell.openExternal(url);
        return;
      }
      if (hasScheme(url)) {
        options.reportError(t("link.unsupported", { url }));
        return;
      }
      const path = decodePath(url);
      const documentPath = options.documentPath();
      const target = isAbsolute(path) ? path : documentPath ? join(dirname(documentPath), path) : null;
      if (!target) {
        options.reportError(t("link.unsavedRelative"));
        return;
      }
      options.openLocal(target, anchorOf(url));
    },
    reportError: (message) => options.reportError(message),
    // K-2、L-2：编辑器的文字按界面语言（读的时候现取）
    get texts() {
      return editorTexts();
    },
  };
}

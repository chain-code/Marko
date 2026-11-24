// 本地媒体的地址（M-1、1.10 节）：marko-asset://local/<路径>，每段按 URL 编码，Windows 的盘符照写。
// 渲染进程按文档所在目录拼出绝对路径以后换成这种地址；主进程的协议处理（main/protocol.ts）只返回图片、视频、音频

export const ASSET_SCHEME = "marko-asset";

export function assetUrl(path: string): string {
  const segments = path.split(/[\\/]+/).map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ":"));
  return `${ASSET_SCHEME}://local/${segments.join("/").replace(/^\/+/, "")}`;
}

/** 能插入、能显示的本地媒体（M-1、M-2、M-7）：扩展名按种类。ogg 算音频（视频用 ogv） */
export const MEDIA_EXTENSIONS = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif", "ico"],
  video: ["mp4", "webm", "ogv", "mov", "m4v"],
  audio: ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"],
} as const;

export type LocalMediaKind = keyof typeof MEDIA_EXTENSIONS;

/** 按扩展名看是哪种媒体；不是图片、视频、音频时为 null */
export function mediaKindOfPath(path: string): LocalMediaKind | null {
  const extension = /\.([^.\\/]+)$/.exec(path)?.[1]?.toLowerCase();
  if (!extension) return null;
  for (const kind of Object.keys(MEDIA_EXTENSIONS) as LocalMediaKind[]) {
    if ((MEDIA_EXTENSIONS[kind] as readonly string[]).includes(extension)) return kind;
  }
  return null;
}

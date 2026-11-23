import type { LocalMediaKind } from "@/types";

export type { LocalMediaKind } from "@/types";

export const localImageExtensions = [
  "png", "jpg", "jpeg", "jfif", "svg", "gif", "bmp", "webp", "tif", "tiff", "avif",
] as const;

export const localVideoExtensions = [
  "mp4", "webm", "mkv", "flv", "avi", "mov", "wmv", "rm", "rmvb", "mpg", "mpeg",
  "mpv",
] as const;

export const localAudioExtensions = [
  "mp3", "vox", "wav", "wma", "m4a", "m4p", "ogg", "wave", "flac", "aac",
] as const;

const imageExtensionSet = new Set<string>(localImageExtensions);
const videoExtensionSet = new Set<string>(localVideoExtensions);
const audioExtensionSet = new Set<string>(localAudioExtensions);

export function getLocalMediaKind(name: string, mimeType = ""): LocalMediaKind | null {
  const extension = getFileExtension(name);
  if (imageExtensionSet.has(extension)) return "image";
  if (videoExtensionSet.has(extension)) return "video";
  if (audioExtensionSet.has(extension)) return "audio";

  const normalizedMime = mimeType.trim().toLowerCase();
  if (normalizedMime.startsWith("image/")) return "image";
  if (normalizedMime.startsWith("video/")) return "video";
  if (normalizedMime.startsWith("audio/")) return "audio";

  return null;
}

export function getLocalImageAlt(name: string): string {
  const fileName = getBaseName(name);
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return withoutExtension || "图片";
}

export function buildLocalMediaMarkup(
  kind: LocalMediaKind,
  source: string,
  name: string,
): string {
  if (kind === "image") {
    return `![${escapeMarkdownLabel(getLocalImageAlt(name))}](${source})`;
  }
  const tag = kind === "video" ? "video" : "audio";
  return `<${tag} src="${escapeHtmlAttribute(source)}" controls></${tag}>`;
}

function getFileExtension(name: string): string {
  const clean = name.split(/[?#]/, 1)[0] ?? "";
  const match = clean.match(/\.([^.\\/]+)$/);
  return match?.[1]?.toLowerCase() ?? "";
}

function getBaseName(name: string): string {
  const clean = name.split(/[?#]/, 1)[0] ?? "";
  const fileName = clean.replace(/\\/g, "/").split("/").at(-1) ?? "";
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

function escapeMarkdownLabel(value: string): string {
  return value
    .replace(/\\/g, "\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

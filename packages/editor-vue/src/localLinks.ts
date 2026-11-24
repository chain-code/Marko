// 本地 Markdown 链接（K-1：旧版库的写法，src/utils/previewLinks.ts 原样搬来）：链接是本地的 Markdown 文件时解析成路径，
// 组件发 openLink（同旧版的预览）；别的链接发 openAnchor
const markdownFileExtensions = [
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mkdn",
  "mdwn",
  "mdtxt",
  "mdtext",
  "rmd",
] as const;

const markdownExtensionPattern = new RegExp(
  `\\.(${markdownFileExtensions.join("|")})$`,
  "i",
);

export function isMarkdownPathLike(path: string): boolean {
  return markdownExtensionPattern.test(path);
}


export type PreviewLinkAction = "none" | "anchor" | "relative" | "local" | "external" | "blocked";

const blockedProtocols = new Set(["javascript:", "vbscript:", "data:"]);

export function shouldOpenPreviewLink(event: { ctrlKey?: boolean; metaKey?: boolean }): boolean {
  return Boolean(event.ctrlKey || event.metaKey);
}

export function getPreviewLinkAction(rawHref: string | null | undefined): PreviewLinkAction {
  const href = rawHref?.trim() ?? "";
  if (!href) return "none";
  if (href.startsWith("#")) return "anchor";
  if (href.startsWith("//")) return "external";
  if (isWindowsAbsoluteHref(href) || isWindowsUncHref(href)) return "local";

  const protocol = href.match(/^([a-z][a-z0-9+.-]*:)/i)?.[1].toLowerCase();
  if (!protocol) return "relative";
  if (protocol === "file:") return "local";
  if (blockedProtocols.has(protocol)) return "blocked";
  return "external";
}

export function isExternalPreviewHref(rawHref: string | null | undefined): boolean {
  return getPreviewLinkAction(rawHref) === "external";
}

export function resolveRelativeMarkdownHref(
  rawHref: string | null | undefined,
  basePath: string | undefined,
): string | null {
  if (getPreviewLinkAction(rawHref) !== "relative") return null;
  return resolveLocalMarkdownHref(rawHref, basePath);
}

export function resolveLocalMarkdownHref(
  rawHref: string | null | undefined,
  basePath?: string,
): string | null {
  const action = getPreviewLinkAction(rawHref);
  if (action !== "relative" && action !== "local") return null;

  const href = stripHrefMetadata(rawHref?.trim() ?? "");
  if (!isMarkdownPathLike(href)) return null;

  if (isFileHref(href)) {
    return normalizeLocalPath(decodeFileHref(href));
  }

  const decoded = decodeHrefPath(href);
  if (isAbsoluteLocalPath(decoded)) {
    return normalizeLocalPath(decoded);
  }

  if (!basePath) return null;

  const normalizedBase = basePath.replace(/\\/g, "/");
  const baseDir = normalizedBase.includes("/")
    ? normalizedBase.slice(0, normalizedBase.lastIndexOf("/"))
    : "";
  return normalizeLocalPath(`${baseDir}/${decoded}`);
}

export function getPreviewHrefAnchor(rawHref: string | null | undefined): string {
  const href = rawHref?.trim() ?? "";
  const hashIndex = href.indexOf("#");
  return hashIndex >= 0 && hashIndex < href.length - 1 ? href.slice(hashIndex) : "";
}

function stripHrefMetadata(href: string): string {
  const hashIndex = href.indexOf("#");
  const queryIndex = href.indexOf("?");
  const metadataIndexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  const end = metadataIndexes.length > 0 ? Math.min(...metadataIndexes) : href.length;
  return href.slice(0, end);
}

function decodeHrefPath(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function decodeFileHref(href: string): string {
  try {
    const url = new URL(href);
    const pathname = decodeHrefPath(url.pathname);
    if (url.hostname) return `//${url.hostname}${pathname}`;
    return pathname.replace(/^\/([A-Za-z]:\/)/, "$1");
  } catch {
    return decodeHrefPath(href.replace(/^file:\/\//i, ""));
  }
}

function normalizeLocalPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const drive = normalized.match(/^([A-Za-z]:)(?:\/|$)/);
  if (drive) {
    const rest = normalized.slice(drive[0].length);
    const suffix = normalizePathParts(rest.split("/"), false);
    return suffix ? `${drive[1]}/${suffix}` : `${drive[1]}/`;
  }

  if (normalized.startsWith("//")) {
    const parts = normalized.slice(2).split("/");
    const host = parts.shift() ?? "";
    return `//${host}/${normalizePathParts(parts, false)}`.replace(/\/$/, "");
  }

  return normalizePathParts(normalized.split("/"), normalized.startsWith("/"));
}

function normalizePathParts(parts: string[], absolute: boolean): string {
  const output: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      output.pop();
      continue;
    }
    output.push(part);
  }

  const normalized = output.join("/");
  return absolute ? `/${normalized}` : normalized;
}

function isFileHref(href: string): boolean {
  return /^file:/i.test(href);
}

function isWindowsAbsoluteHref(href: string): boolean {
  return /^[A-Za-z]:(?:[\\/]|%5[cC]|\/)/.test(href);
}

function isWindowsUncHref(href: string): boolean {
  return /^(?:\\\\|%5[cC]%5[cC])[^\\/]/.test(href);
}

function isAbsoluteLocalPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || /^\\\\[^\\]/.test(path);
}

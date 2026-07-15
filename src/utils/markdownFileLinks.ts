import { isMarkdownPathLike } from "./markdownFiles";

interface MarkdownFileLinkOptions {
  targetPath: string;
  targetName?: string;
  currentPath?: string;
  rootPath?: string;
}

interface ParsedLocalPath {
  root: string;
  parts: string[];
}

export function buildMarkdownFileLink(options: MarkdownFileLinkOptions): string {
  const labelSource = options.targetName?.trim() || basename(options.targetPath);
  const label = formatMarkdownLinkLabel(stripMarkdownExtension(labelSource));
  const href = formatMarkdownLinkDestination(resolveMarkdownFileLinkHref(options));
  return `[${label}](${href})`;
}

export function resolveMarkdownFileLinkHref({
  targetPath,
  currentPath,
  rootPath,
}: MarkdownFileLinkOptions): string {
  return resolveDocumentRelativePath({ targetPath, currentPath, rootPath });
}

export function resolveDocumentRelativePath({
  targetPath,
  currentPath,
  rootPath,
}: MarkdownFileLinkOptions): string {
  const normalizedTarget = normalizeLocalPath(targetPath);
  const baseDir = currentPath ? dirname(currentPath) : rootPath;
  if (!baseDir) return normalizedTarget;

  const relative = getRelativePath(baseDir, normalizedTarget);
  return relative || normalizedTarget;
}

function getRelativePath(fromDir: string, targetPath: string): string | null {
  const from = parseLocalPath(fromDir);
  const target = parseLocalPath(targetPath);
  if (!from.root || !target.root || from.root.toLowerCase() !== target.root.toLowerCase()) return null;

  let index = 0;
  while (
    index < from.parts.length
    && index < target.parts.length
    && from.parts[index].toLowerCase() === target.parts[index].toLowerCase()
  ) {
    index += 1;
  }

  const up = Array.from({ length: from.parts.length - index }, () => "..");
  const down = target.parts.slice(index);
  return [...up, ...down].join("/") || basename(targetPath);
}

function parseLocalPath(path: string): ParsedLocalPath {
  const normalized = normalizeSlashes(path);
  const drive = normalized.match(/^([A-Za-z]:)(?:\/|$)/);
  if (drive) {
    return {
      root: drive[1].toLowerCase(),
      parts: normalizePathParts(normalized.slice(drive[0].length).split("/"), false),
    };
  }

  if (normalized.startsWith("//")) {
    const parts = normalized.slice(2).split("/");
    const host = parts.shift() ?? "";
    const share = parts.shift() ?? "";
    return {
      root: `//${host.toLowerCase()}/${share.toLowerCase()}`,
      parts: normalizePathParts(parts, false),
    };
  }

  if (normalized.startsWith("/")) {
    return {
      root: "/",
      parts: normalizePathParts(normalized.slice(1).split("/"), false),
    };
  }

  return {
    root: "",
    parts: normalizePathParts(normalized.split("/"), true),
  };
}

function normalizeLocalPath(path: string): string {
  const normalized = normalizeSlashes(path);
  const drive = normalized.match(/^([A-Za-z]:)(?:\/|$)/);
  if (drive) {
    const suffix = normalizePathParts(normalized.slice(drive[0].length).split("/"), false).join("/");
    return suffix ? `${drive[1]}/${suffix}` : `${drive[1]}/`;
  }

  if (normalized.startsWith("//")) {
    const parts = normalized.slice(2).split("/");
    const host = parts.shift() ?? "";
    const share = parts.shift() ?? "";
    const suffix = normalizePathParts(parts, false).join("/");
    return `//${host}/${share}${suffix ? `/${suffix}` : ""}`;
  }

  if (normalized.startsWith("/")) {
    return `/${normalizePathParts(normalized.slice(1).split("/"), false).join("/")}`;
  }

  return normalizePathParts(normalized.split("/"), true).join("/");
}

function normalizePathParts(parts: string[], keepLeadingParents: boolean): string[] {
  const output: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (output.length > 0 && output[output.length - 1] !== "..") {
        output.pop();
      } else if (keepLeadingParents) {
        output.push(part);
      }
      continue;
    }
    output.push(part);
  }
  return output;
}

function formatMarkdownLinkLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function formatMarkdownLinkDestination(value: string): string {
  const destination = value.trim();
  return /[\s()]/.test(destination) ? `<${destination.replace(/>/g, "%3E")}>` : destination;
}

function stripMarkdownExtension(name: string): string {
  return isMarkdownPathLike(name) ? name.replace(/\.[^.]+$/, "") : name;
}

function basename(path: string): string {
  return normalizeSlashes(path).split("/").pop() || path;
}

function dirname(path: string): string {
  const normalized = normalizeSlashes(path);
  return normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
}

function normalizeSlashes(path: string): string {
  return path.trim().replace(/\\/g, "/");
}

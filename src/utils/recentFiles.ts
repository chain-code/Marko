import type { RecentFile } from "@/types";

export const recentFilesLimit = 20;

export function addRecentFileEntry(recentFiles: RecentFile[], path: string, openedAt = Date.now()): RecentFile[] {
  const normalizedPath = path.trim();
  if (!normalizedPath) return normalizeRecentFiles(recentFiles);

  const item: RecentFile = {
    path: normalizedPath,
    name: basename(normalizedPath),
    openedAt,
  };
  return [item, ...recentFiles.filter((recent) => recent.path !== normalizedPath)].slice(0, recentFilesLimit);
}

export function replaceRecentFileEntry(
  recentFiles: RecentFile[],
  oldPath: string,
  newPath: string,
  openedAt = Date.now(),
): RecentFile[] {
  const normalizedOldPath = oldPath.trim();
  const normalizedNewPath = newPath.trim();
  const withoutOldPath = recentFiles.filter(
    (recent) => recent.path !== normalizedOldPath && recent.path !== normalizedNewPath,
  );
  return addRecentFileEntry(withoutOldPath, normalizedNewPath, openedAt);
}

export function normalizeRecentFiles(value: unknown, limit = recentFilesLimit): RecentFile[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Partial<RecentFile> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      path: typeof item.path === "string" ? item.path : "",
      name: typeof item.name === "string" ? item.name : "",
      openedAt: typeof item.openedAt === "number" && Number.isFinite(item.openedAt) ? item.openedAt : 0,
    }))
    .filter((item) => item.path.trim())
    .map((item) => ({
      path: item.path.trim(),
      name: item.name.trim() || basename(item.path.trim()),
      openedAt: item.openedAt,
    }))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.path === item.path) === index)
    .slice(0, Math.max(0, Math.floor(limit)));
}

export function parseRecentFiles(raw: string | null): RecentFile[] {
  if (!raw) return [];

  try {
    return normalizeRecentFiles(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function serializeRecentFiles(recentFiles: RecentFile[]): string {
  return JSON.stringify(normalizeRecentFiles(recentFiles));
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

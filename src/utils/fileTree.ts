import type { FileEntry } from "@/types";

export function normalizeTreePath(path: string | null | undefined): string {
  return (path ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isSameTreePath(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeTreePath(left);
  const normalizedRight = normalizeTreePath(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function fileTreeEntryContainsPath(entry: FileEntry, targetPath: string | null | undefined): boolean {
  if (!targetPath) return false;
  if (isSameTreePath(entry.path, targetPath)) return true;
  if (!entry.isDir) return false;
  return entry.children.some((child) => fileTreeEntryContainsPath(child, targetPath));
}

export function isPathInsideTreeRoot(path: string | null | undefined, root: string | null | undefined): boolean {
  const normalizedPath = normalizeTreePath(path);
  const normalizedRoot = normalizeTreePath(root);
  return Boolean(
    normalizedPath &&
      normalizedRoot &&
      (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)),
  );
}

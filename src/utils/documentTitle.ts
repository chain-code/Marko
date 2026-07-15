export function formatDocumentTitle(fileName: string, dirty: boolean): string {
  const normalizedName = fileName.trim() || "未命名.md";
  return `${dirty ? "● " : ""}${normalizedName} - Marko`;
}

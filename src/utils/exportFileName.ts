import type { ExportFormat } from "@/types";

export function buildExportFileName(fileName: string, format: ExportFormat): string {
  const baseName = basename(fileName).replace(/\.[^.]+$/, "").trim() || "marko-export";
  return `${baseName}.${format}`;
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

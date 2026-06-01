import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { ExportFormat, FileEntry, SearchResult } from "@/types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

export function resolveLocalAsset(path: string): string {
  if (!isTauriRuntime() || /^(https?:|data:|blob:|#|mailto:)/i.test(path)) {
    return path;
  }
  return convertFileSrc(path);
}

export async function pickMarkdownFile(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  return invoke<string | null>("pick_markdown_file");
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  return invoke<string | null>("pick_folder");
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke("write_text_file", { path, content });
}

export async function saveMarkdownAs(content: string, defaultDir?: string): Promise<string | null> {
  if (!isTauriRuntime()) {
    downloadTextFile("untitled.md", content);
    return null;
  }
  return invoke<string | null>("save_markdown_as", {
    content,
    defaultDir: defaultDir || null,
  });
}

export async function listMarkdownFolder(root: string): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("list_markdown_folder", { root });
}

export async function searchMarkdownFiles(root: string, query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("search_markdown_files", { root, query });
}

export async function saveImageAsset(
  currentPath: string | null,
  name: string,
  dataUrl: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    return dataUrl;
  }

  return invoke<string>("save_data_url_asset", {
    currentPath,
    name,
    dataUrl,
  });
}

export async function copyImageFileAsset(currentPath: string | null, path: string): Promise<string> {
  if (!isTauriRuntime()) {
    return path;
  }

  return invoke<string>("copy_image_file_asset", {
    currentPath,
    path,
  });
}

export async function listenNativeFileDrops(
  handler: (paths: string[]) => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => {};
  }

  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop" && event.payload.paths.length > 0) {
      void handler(event.payload.paths);
    }
  });
}

export async function exportWithPandoc(
  markdown: string,
  currentPath: string | null,
  format: ExportFormat,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    if (format === "pdf") {
      window.print();
      return null;
    }
    downloadTextFile(`marko-export.${format === "docx" ? "md" : format}`, markdown);
    return null;
  }

  return invoke<string | null>("export_document_pandoc", {
    markdown,
    currentPath,
    format,
  });
}

export function openBrowserMarkdownFile(): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.mdown,text/markdown,text/plain";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({
        name: file.name,
        content: await file.text(),
      });
    });
    input.click();
  });
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

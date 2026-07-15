import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { ExportFormat, FileEntry, ImageInsertAction, SearchResult } from "@/types";
import { markdownFileAccept } from "@/utils/markdownFiles";

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

export async function pickImageFile(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  return invoke<string | null>("pick_image_file");
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function getStartupMarkdownFiles(): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  return invoke<string[]>("startup_markdown_files");
}

export async function writeTextFile(path: string, content: string, expectedContent: string): Promise<void> {
  await invoke("write_text_file", { path, content, expectedContent });
}

export async function isDirectoryPath(path: string): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  return invoke<boolean>("path_is_directory", { path });
}

export async function renameMarkdownFile(path: string, newName: string): Promise<string> {
  return invoke<string>("rename_markdown_file", { path, newName });
}

export async function createMarkdownFile(folderPath: string, fileName: string): Promise<string> {
  return invoke<string>("create_markdown_file", { folderPath, fileName });
}

export async function createFolder(parentPath: string, folderName: string): Promise<string> {
  return invoke<string>("create_folder", { parentPath, folderName });
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
  action: ImageInsertAction = "assets",
): Promise<string> {
  if (!isTauriRuntime()) {
    return dataUrl;
  }

  return invoke<string>("save_data_url_asset", {
    currentPath,
    name,
    dataUrl,
    action,
  });
}

export async function copyImageFileAsset(
  currentPath: string | null,
  path: string,
  action: ImageInsertAction = "assets",
): Promise<string> {
  if (!isTauriRuntime()) {
    return path;
  }

  return invoke<string>("copy_image_file_asset", {
    currentPath,
    path,
    action,
  });
}

export async function revealFileInFolder(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("reveal_file_in_folder", { path });
}

export async function openContainingFolder(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("open_containing_folder", { path });
}

export async function openFolderPath(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("open_folder_path", { path });
}

export async function trashPath(path: string): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("trash_path", { path });
}

export async function openDeveloperTools(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("open_devtools");
}

export async function listenWindowCloseRequested(
  handler: () => void | Promise<void>,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => {};

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    void handler();
  });
}

export async function destroyCurrentWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().destroy();
}

export async function toggleNativeFullscreen(): Promise<boolean> {
  if (!isTauriRuntime()) {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return false;
    }
    await document.documentElement.requestFullscreen();
    return true;
  }

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const currentWindow = getCurrentWindow();
  const next = !await currentWindow.isFullscreen();
  await currentWindow.setFullscreen(next);
  return next;
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
  defaultFileName?: string,
): Promise<string | null> {
  if (!isTauriRuntime()) {
    if (format === "pdf") {
      window.print();
      return null;
    }
    const fallbackName = defaultFileName || `marko-export.${format}`;
    downloadTextFile(format === "docx" ? fallbackName.replace(/\.docx$/i, ".md") : fallbackName, markdown);
    return null;
  }

  return invoke<string | null>("export_document_pandoc", {
    markdown,
    currentPath,
    format,
    defaultFileName: defaultFileName || null,
  });
}

export function openBrowserMarkdownFile(): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = markdownFileAccept;
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

export function openBrowserImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
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

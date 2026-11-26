// 侧栏的右键菜单（W-6）和「文件 → 文件操作」（F-13）：菜单项在这里定，主进程弹原生菜单（menu.popup），选了哪项在这里做
import type { MarkoApi, PopupItem } from "@marko/shared";
import { ElMessageBox } from "element-plus";
import type { MessageKey } from "../../locales/index.ts";
import { fileManagerName, t } from "../i18n.ts";
import { basename, dirname, relativePath } from "../paths.ts";

export interface FileEntry {
  kind: "file" | "folder";
  path: string;
}

export interface FileActionOptions {
  /** 当前文档的路径（新文档是 null） */
  documentPath(): string | null;
  /** 工作区目录（复制相对路径按它算） */
  workspaceRoot(): string | null;
  /** 在这个窗口里换成这个文件（侧栏点文件同样的规则） */
  openHere(path: string): Promise<unknown>;
  openWorkspace(root: string): Promise<void>;
  refreshWorkspace(): Promise<void>;
  /** 最近文件面板里才有「从最近文件移除」 */
  removeRecent?(path: string): Promise<void>;
  confirmTrash(name: string): Promise<boolean>;
  info(message: string): void;
  error(message: string): void;
}

/** 问一个名字（新建、改名）；取消是 null */
async function askName(title: string, initial: string): Promise<string | null> {
  try {
    const { value } = await ElMessageBox.prompt(t("files.name"), title, {
      confirmButtonText: t("common.ok"),
      cancelButtonText: t("common.cancel"),
      inputValue: initial,
      inputPattern: /^[^<>:"/\\|?*]+$/,
      inputErrorMessage: t("files.invalidName"),
    });
    return value.trim() || null;
  } catch {
    return null;
  }
}

export function useFileActions(api: MarkoApi, options: FileActionOptions) {
  /** 相对工作区（不在工作区里时相对当前文档所在目录）的路径 */
  function relativeOf(path: string): string {
    const root = options.workspaceRoot();
    const inRoot = root ? relativePath(root, path) : null;
    if (inRoot && !inRoot.startsWith("..")) return inRoot;
    const documentPath = options.documentPath();
    return (documentPath ? relativePath(dirname(documentPath), path) : null) ?? path;
  }

  /** 「复制 Markdown 链接」：[文件名](相对当前文档的路径)，空格这些转义 */
  function markdownLink(path: string): string {
    const documentPath = options.documentPath();
    const target = (documentPath ? relativePath(dirname(documentPath), path) : null) ?? path.replace(/\\/g, "/");
    const name = basename(path).replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
    return `[${name}](${encodeURI(target).replace(/\(/g, "%28").replace(/\)/g, "%29")})`;
  }

  function report(action: string, result: { ok: true } | { ok: false; error: { message: string } }): boolean {
    if (!result.ok) options.error(t("files.failed", { action, message: result.error.message }));
    return result.ok;
  }

  async function createFile(directory: string): Promise<void> {
    const name = await askName(t("files.newFile"), t("app.untitledFile"));
    if (!name) return;
    const result = await api.files.create(directory, name);
    if (report(t("files.create"), result) && result.ok) {
      await options.refreshWorkspace();
      await options.openHere(result.value);
    }
  }

  async function createFolder(directory: string): Promise<void> {
    const name = await askName(t("files.newFolder"), t("files.newFolder"));
    if (!name) return;
    const result = await api.files.createFolder(directory, name);
    if (report(t("files.newFolder"), result)) await options.refreshWorkspace();
  }

  /** F-13：只改文件名，扩展名不变（输入框里只给文件名） */
  async function rename(path: string): Promise<void> {
    const name = basename(path);
    const extension = /\.[^.]+$/.exec(name)?.[0] ?? "";
    const stem = await askName(t("files.rename"), extension ? name.slice(0, -extension.length) : name);
    if (!stem || stem + extension === name) return;
    const result = await api.files.rename(path, stem + extension);
    if (report(t("files.rename"), result)) await options.refreshWorkspace();
  }

  async function trash(path: string): Promise<void> {
    if (!(await options.confirmTrash(basename(path)))) return;
    if (report(t("files.trash"), await api.files.trash(path))) await options.refreshWorkspace();
  }

  /** done：复制好以后的提示（files.copied.<哪一种>） */
  async function copy(text: string, done: MessageKey): Promise<void> {
    await api.shell.copyText(text);
    options.info(t(done));
  }

  /** 侧栏里右键一项：弹菜单，做选了的那项 */
  async function showContextMenu(entry: FileEntry, origin: "tree" | "list" | "recent"): Promise<void> {
    const items: PopupItem[] =
      entry.kind === "folder"
        ? [
            { id: "newFile", label: t("files.newFileMenu") },
            { id: "newFolder", label: t("files.newFolderMenu") },
            { id: "refresh", label: t("files.refresh") },
            { id: "workspace", label: t("files.openAsWorkspace") },
            { type: "separator" },
            { id: "copyName", label: t("files.copyName") },
            { id: "copyRelative", label: t("files.copyRelativePath") },
            { id: "copyPath", label: t("files.copyPath") },
            { type: "separator" },
            { id: "openFolder", label: t("files.openIn", { manager: fileManagerName() }) },
            { type: "separator" },
            { id: "trash", label: t("files.trashMenu") },
          ]
        : [
            { id: "open", label: t("files.open") },
            { id: "rename", label: t("files.renameMenu") },
            { type: "separator" },
            { id: "copyName", label: t("files.copyName") },
            { id: "copyLink", label: t("files.copyMarkdownLink") },
            { id: "copyRelative", label: t("files.copyRelativePath") },
            { id: "copyPath", label: t("files.copyPath") },
            { type: "separator" },
            { id: "reveal", label: t("files.revealIn", { manager: fileManagerName() }) },
            { id: "openFolder", label: t("files.openContainingFolder") },
            { type: "separator" },
            { id: "trash", label: t("files.trashMenu") },
            ...(origin === "recent" ? [{ type: "separator" } as const, { id: "removeRecent", label: t("files.removeRecent") }] : []),
          ];
    const chosen = await api.menu.popup(items);
    const { path } = entry;
    switch (chosen) {
      case "newFile":
        return createFile(path);
      case "newFolder":
        return createFolder(path);
      case "refresh":
        return options.refreshWorkspace();
      case "workspace":
        return options.openWorkspace(path);
      case "copyName":
        return copy(basename(path), "files.copied.name");
      case "copyRelative":
        return copy(relativeOf(path), "files.copied.relativePath");
      case "copyPath":
        return copy(path, "files.copied.path");
      case "copyLink":
        return copy(markdownLink(path), "files.copied.markdownLink");
      case "openFolder":
        // 文件：打开它所在的文件夹（主进程按文件判断）
        return api.shell.openFolder(path);
      case "reveal":
        return api.shell.showItemInFolder(path);
      case "open":
        await options.openHere(path);
        return;
      case "rename":
        return rename(path);
      case "trash":
        return trash(path);
      case "removeRecent":
        return options.removeRecent?.(path);
      default:
        return;
    }
  }

  /** 「文件 → 文件操作」（F-13）、「文件 → 打开文件位置…」「删除…」（X-6）：对当前文档 */
  async function currentFileAction(action: "rename" | "copyPath" | "reveal" | "openFolder" | "trash"): Promise<void> {
    const path = options.documentPath();
    if (!path) {
      options.info(t("files.notSaved"));
      return;
    }
    if (action === "rename") return rename(path);
    if (action === "trash") return trash(path);
    if (action === "copyPath") return copy(path, "files.copied.filePath");
    if (action === "reveal") return api.shell.showItemInFolder(path);
    return api.shell.openFolder(path);
  }

  return { showContextMenu, currentFileAction, createFile };
}

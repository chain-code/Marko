// 工作区和侧栏数据（W 章）：这个窗口的工作区（文件夹），里面的文件树；主进程监听到增删改时重新列
import { EVENTS, type MarkoApi, type Workspace, type WorkspaceEntry } from "@marko/shared";
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import { t } from "../i18n.ts";

export interface WorkspaceFile {
  path: string;
  name: string;
  /** 所在目录相对工作区的路径（W-3 的文件列表显示） */
  directory: string;
}

function flatten(entries: WorkspaceEntry[], prefix: string, into: WorkspaceFile[]): void {
  for (const entry of entries) {
    if (entry.kind === "file") into.push({ path: entry.path, name: entry.name, directory: prefix });
    else flatten(entry.children ?? [], prefix ? `${prefix}/${entry.name}` : entry.name, into);
  }
}

/** 文件在这个文件夹里（含子文件夹；Windows、macOS 不分大小写，分隔符不管） */
function insideFolder(folder: string, path: string): boolean {
  const key = (value: string) => value.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
  return key(path).startsWith(`${key(folder)}/`);
}

export function useWorkspace(api: MarkoApi, report: (message: string) => void) {
  const workspace = shallowRef<Workspace | null>(null);
  /**
   * 工作区是跟着当前文件来的（同 Typora：没有主动打开文件夹时，侧栏显示当前文件所在的文件夹，打开别处的文件时跟着换）。
   * 主动打开文件夹（打开文件夹…、拖进文件夹、打开所在文件夹为工作区、恢复的会话）以后就不跟了
   */
  const followsDocument = ref(false);
  /** 用户关掉了工作区：这个文件不再自动打开它的文件夹，换了文件再跟 */
  let closedFor: string | null = null;

  /** 工作区里所有的 Markdown 文件（W-3、F-4） */
  const files = computed(() => {
    const result: WorkspaceFile[] = [];
    if (workspace.value) flatten(workspace.value.entries, "", result);
    return result;
  });

  async function pickAndOpen(): Promise<void> {
    const result = await api.workspace.pickAndOpen();
    if (!result.ok) report(t("sidebar.openFolderFailed", { message: result.error.message }));
    else if (result.value) {
      workspace.value = result.value;
      followsDocument.value = false;
    }
  }

  async function open(root: string): Promise<void> {
    const result = await api.workspace.open(root);
    if (result.ok) {
      workspace.value = result.value;
      followsDocument.value = false;
    } else report(t("sidebar.openFolderFailed", { message: result.error.message }));
  }

  /**
   * W-1（同 Typora）：没有主动打开的文件夹时，把当前文件所在的文件夹当工作区（主进程按它记着的文档路径打开，
   * 渲染进程不给路径）；换成不在这个文件夹（含子文件夹）里的文件时跟着换
   */
  async function followDocument(path: string | null): Promise<void> {
    if (!path || (workspace.value && !followsDocument.value) || closedFor === path) return;
    if (workspace.value && insideFolder(workspace.value.root, path)) return;
    const result = await api.workspace.openContaining();
    if (result.ok && result.value) {
      workspace.value = result.value;
      followsDocument.value = true;
    }
  }

  /** W-1「打开所在文件夹为工作区」：开好了返回 true（新文档没有所在的文件夹） */
  async function openContaining(): Promise<boolean> {
    const result = await api.workspace.openContaining();
    if (!result.ok) {
      report(t("sidebar.openFolderFailed", { message: result.error.message }));
      return false;
    }
    if (!result.value) return false;
    workspace.value = result.value;
    followsDocument.value = false;
    return true;
  }

  /** W-1「关闭工作区文件夹」：path 是现在的文件，不再自动打开它的文件夹 */
  async function close(path: string | null = null): Promise<void> {
    workspace.value = null;
    followsDocument.value = false;
    closedFor = path;
    await api.workspace.close();
  }

  async function refresh(): Promise<void> {
    const root = workspace.value?.root;
    if (!root) return;
    const result = await api.workspace.list(root);
    if (result.ok && workspace.value?.root === root) workspace.value = result.value;
  }

  const off = api.on(EVENTS.workspaceChanged, ({ root }) => {
    if (root === workspace.value?.root) void refresh();
  });
  onBeforeUnmount(off);

  return { workspace, files, followsDocument, pickAndOpen, open, refresh, openContaining, followDocument, close };
}

export type WorkspaceState = ReturnType<typeof useWorkspace>;

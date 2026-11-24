// 工作区和侧栏数据（W 章）：这个窗口的工作区（文件夹），里面的文件树；主进程监听到增删改时重新列
import { EVENTS, type MarkoApi, type Workspace, type WorkspaceEntry } from "@marko/shared";
import { computed, onBeforeUnmount, shallowRef } from "vue";
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

export function useWorkspace(api: MarkoApi, report: (message: string) => void) {
  const workspace = shallowRef<Workspace | null>(null);

  /** 工作区里所有的 Markdown 文件（W-3、F-4） */
  const files = computed(() => {
    const result: WorkspaceFile[] = [];
    if (workspace.value) flatten(workspace.value.entries, "", result);
    return result;
  });

  async function pickAndOpen(): Promise<void> {
    const result = await api.workspace.pickAndOpen();
    if (!result.ok) report(t("sidebar.openFolderFailed", { message: result.error.message }));
    else if (result.value) workspace.value = result.value;
  }

  async function open(root: string): Promise<void> {
    const result = await api.workspace.open(root);
    if (result.ok) workspace.value = result.value;
    else report(t("sidebar.openFolderFailed", { message: result.error.message }));
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
    return true;
  }

  /** W-1「关闭工作区文件夹」 */
  async function close(): Promise<void> {
    workspace.value = null;
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

  return { workspace, files, pickAndOpen, open, refresh, openContaining, close };
}

export type WorkspaceState = ReturnType<typeof useWorkspace>;

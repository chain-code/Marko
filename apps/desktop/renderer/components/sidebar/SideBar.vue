<template>
  <aside class="sidebar" data-testid="sidebar">
    <!-- 页签（同 Typora）：「文件」「大纲」；搜索时是「文件」「查找」，点「文件」回去 -->
    <div class="sidebar-tabs" role="tablist">
      <span class="sidebar-tab" :class="{ 'is-active': tab === 'files' }" role="tab" :aria-selected="tab === 'files'" data-tab="files" @click="emit('update:tab', 'files')">
        <span class="sidebar-tab-title">{{ t("sidebar.files") }}</span>
        <span class="sidebar-tab-border" />
      </span>
      <span v-if="tab !== 'search'" class="sidebar-tab" :class="{ 'is-active': tab === 'outline' }" role="tab" :aria-selected="tab === 'outline'" data-tab="outline" @click="emit('update:tab', 'outline')">
        <span class="sidebar-tab-title">{{ t("sidebar.outline") }}</span>
        <span class="sidebar-tab-border" />
      </span>
      <span v-else class="sidebar-tab is-active" role="tab" aria-selected="true" data-tab="search">
        <span class="sidebar-tab-title">{{ t("sidebar.searchTab") }}</span>
        <span class="sidebar-tab-border" />
      </span>
    </div>
    <div class="sidebar-content">
      <template v-if="tab === 'files'">
        <!-- 没有打开文件夹：同 Typora 空着，鼠标移到侧栏上才显示一行字（打开文件夹在「文件」菜单里） -->
        <div v-if="!workspace" class="sidebar-hint" data-testid="sidebar-empty">{{ t("sidebar.noFolder") }}</div>
        <FileTree
          v-else-if="fileView === 'tree'"
          ref="fileTree"
          class="sidebar-body"
          :root="workspace.root"
          :entries="workspace.entries"
          :current="currentPath"
          @open="(path) => emit('openFile', path)"
          @contextmenu="(entry) => emit('contextmenu', { kind: entry.kind, path: entry.path })"
        />
        <FileList
          v-else
          class="sidebar-body"
          :files="files"
          :current="currentPath"
          @open="(path) => emit('openFile', path)"
          @contextmenu="(path) => emit('contextmenu', { kind: 'file', path })"
        />
      </template>
      <OutlineTree v-else-if="tab === 'outline'" :items="outline" :current="currentHeading" :collapsible="collapsibleOutline" @select="(index) => emit('selectHeading', index)" />
      <SearchPanel
        v-else
        ref="searchPanel"
        :api="api"
        :root="workspace?.root ?? null"
        @open-file="(path) => emit('openFile', path)"
        @open-match="(path, match) => emit('openMatch', path, match)"
      />
    </div>
    <!-- 文件页签底下的工具栏（同 Typora）：新建文件、文件夹名（点开是操作菜单）、切换文档列表 / 文件树 -->
    <div v-if="tab === 'files' && workspace" class="sidebar-footer" data-testid="sidebar-footer">
      <ElTooltip :content="t('sidebar.newFile')" placement="top" :show-after="600">
        <span class="sidebar-footer-button" role="button" data-testid="sidebar-new-file" :aria-label="t('sidebar.newFile')" @click="emit('newFile', workspace.root)">
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 V10.5 M1.5 6 H10.5" /></svg>
        </span>
      </ElTooltip>
      <ElDropdown class="sidebar-footer-main" trigger="click" placement="top" @command="(command: string) => onFooterCommand(command)">
        <span class="sidebar-footer-label" role="button" :title="workspace.root" @contextmenu.prevent="emit('contextmenu', { kind: 'folder', path: workspace.root })">
          <span class="sidebar-footer-name">{{ rootName }}</span>
          <svg class="sidebar-footer-dots" viewBox="0 0 4 14" aria-hidden="true"><circle cx="2" cy="2.5" r="1.2" /><circle cx="2" cy="7" r="1.2" /><circle cx="2" cy="11.5" r="1.2" /></svg>
        </span>
        <template #dropdown>
          <ElDropdownMenu class="sidebar-files-menu">
            <ElDropdownItem disabled class="sidebar-menu-label">{{ t("sidebar.actions") }}</ElDropdownItem>
            <ElDropdownItem command="newFile">{{ t("sidebar.newFile") }}</ElDropdownItem>
            <ElDropdownItem command="search">{{ t("sidebar.search") }}</ElDropdownItem>
            <ElDropdownItem command="reveal">{{ t("files.openIn", { manager: fileManagerName() }) }}</ElDropdownItem>
            <ElDropdownItem command="openFolder">{{ t("common.openFolder") }}</ElDropdownItem>
            <ElDropdownItem command="refresh">{{ t("sidebar.refresh") }}</ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
      <ElTooltip :content="t('sidebar.switchView')" placement="top" :show-after="600">
        <span class="sidebar-footer-button" role="button" data-testid="sidebar-switch-view" :aria-label="t('sidebar.switchView')" @click="emit('update:fileView', fileView === 'tree' ? 'list' : 'tree')">
          <svg v-if="fileView === 'tree'" viewBox="0 0 14 12" aria-hidden="true"><path d="M1 2 H13 M1 6 H13 M1 10 H13" /></svg>
          <svg v-else viewBox="0 0 14 12" aria-hidden="true"><path d="M1 1.5 H6 M3 1.5 V10.5 H8 M3 6 H8" /></svg>
        </span>
      </ElTooltip>
    </div>
  </aside>
</template>

<script setup lang="ts">
// 侧栏（W-7，样子同 Typora）：页签「文件」（文档列表、文件树）、「大纲」；搜索时页签换成「文件」「查找」（W-5）
import type { MarkoApi, SearchMatch, Workspace } from "@marko/shared";
import type { OutlineItem } from "@marko/editor-vue";
import { computed, nextTick, ref } from "vue";
import type { FileEntry } from "../../composables/useFileActions.ts";
import type { WorkspaceFile } from "../../composables/useWorkspace.ts";
import { basename } from "../../paths.ts";
import FileList from "./FileList.vue";
import FileTree from "./FileTree.vue";
import OutlineTree from "./OutlineTree.vue";
import SearchPanel from "./SearchPanel.vue";
import { fileManagerName, t } from "../../i18n.ts";

export type SidebarTab = "files" | "outline" | "search";
export type FileView = "tree" | "list";

const props = defineProps<{
  api: MarkoApi;
  tab: SidebarTab;
  fileView: FileView;
  workspace: Workspace | null;
  files: WorkspaceFile[];
  currentPath: string | null;
  outline: OutlineItem[];
  currentHeading: number | null;
  collapsibleOutline: boolean;
}>();

const emit = defineEmits<{
  "update:tab": [tab: SidebarTab];
  "update:fileView": [view: FileView];
  openFolder: [];
  openFile: [path: string];
  openMatch: [path: string, match: SearchMatch];
  selectHeading: [index: number];
  /** 文件树、文件列表里右键（W-6） */
  contextmenu: [entry: FileEntry];
  /** 在这个文件夹里新建文件（W-6 的「新建 Markdown 文件...」） */
  newFile: [folder: string];
  revealFolder: [folder: string];
  refresh: [];
}>();

const rootName = computed(() => (props.workspace ? basename(props.workspace.root) || props.workspace.root : ""));

const searchPanel = ref<InstanceType<typeof SearchPanel> | null>(null);

/** Ctrl+Shift+F：切到搜索，焦点放进搜索框 */
async function focusSearch(): Promise<void> {
  if (props.tab !== "search") emit("update:tab", "search");
  await nextTick();
  searchPanel.value?.focus();
}

function onFooterCommand(command: string): void {
  const root = props.workspace?.root;
  if (!root) return;
  if (command === "newFile") emit("newFile", root);
  else if (command === "search") void focusSearch();
  else if (command === "reveal") emit("revealFolder", root);
  else if (command === "openFolder") emit("openFolder");
  else if (command === "refresh") emit("refresh");
}

/** W-2「在文件树中定位」：父组件先切到文件树，这里等它画出来再定位；不在工作区里返回 false */
const fileTree = ref<InstanceType<typeof FileTree> | null>(null);

async function revealInTree(path: string): Promise<boolean> {
  await nextTick();
  return (await fileTree.value?.reveal(path)) ?? false;
}

defineExpose({ focusSearch, revealInTree });
</script>

<style scoped>
/* 样子同 Typora 的侧栏：#fafafa 的底、14px 字；页签 84px 宽，选中的下面 4px 的线 */
.sidebar {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  border-right: 1px solid var(--app-sidebar-border, #e9e9e9);
  background: var(--app-sidebar, #fafafa);
  color: var(--md-text, #333);
  font-size: 14px;
  user-select: none;
}

.sidebar-tabs {
  display: flex;
  flex: none;
  justify-content: center;
  gap: 24px;
  height: 54px;
  padding-top: 16px;
  box-sizing: border-box;
}

.sidebar-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 84px;
  opacity: 0.8;
  cursor: default;
}

.sidebar-tab:hover,
.sidebar-tab.is-active {
  opacity: 1;
}

.sidebar-tab-title {
  padding-bottom: 0.4rem;
  line-height: 1.2rem;
}

.sidebar-tab.is-active .sidebar-tab-title {
  font-weight: 700;
}

.sidebar-tab-border {
  width: 100%;
  height: 0;
}

.sidebar-tab.is-active .sidebar-tab-border {
  height: 4px;
  background: currentColor;
}

.sidebar-content {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.sidebar-body {
  flex: 1;
  min-height: 0;
}

.sidebar-footer {
  display: flex;
  flex: none;
  align-items: center;
  height: 30px;
  border-top: 1px solid var(--app-sidebar-border, #e9e9e9);
  font-size: 12px;
}

.sidebar-footer-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  opacity: 0.75;
  cursor: pointer;
}

.sidebar-footer-button:hover {
  opacity: 1;
}

.sidebar-footer-button svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
}

.sidebar-footer-main {
  flex: 1;
  min-width: 0;
  color: inherit;
  font-size: 12px;
}

.sidebar-footer-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  cursor: pointer;
}

.sidebar-footer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-footer-dots {
  flex: none;
  width: 4px;
  height: 12px;
  fill: currentColor;
  opacity: 0.75;
}
</style>

<style>
/* 侧栏空着时的一行字（文件、文档列表、大纲、查找共用；同 Typora）：在中间偏上，鼠标移到侧栏上才淡入 */
.sidebar-hint {
  position: absolute;
  top: calc(50vh - 60px);
  left: 0;
  box-sizing: border-box;
  width: 100%;
  padding: 8px 0;
  font-size: 14px;
  text-align: center;
  opacity: 0;
  pointer-events: none;
}

.sidebar:hover .sidebar-hint,
.sidebar-hint.is-shown {
  opacity: 1;
  animation: sidebar-hint-in 0.5s;
}

@keyframes sidebar-hint-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>

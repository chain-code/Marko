<template>
  <aside class="sidebar" data-testid="sidebar">
    <ElTabs :model-value="tab" class="sidebar-tabs" stretch @update:model-value="(value: string | number) => emit('update:tab', value as SidebarTab)">
      <ElTabPane :label="t('sidebar.files')" name="files">
        <div class="sidebar-pane">
          <div v-if="workspace" class="sidebar-toolbar">
            <span class="sidebar-root" :title="workspace.root" @contextmenu.prevent="emit('contextmenu', { kind: 'folder', path: workspace.root })">{{ rootName }}</span>
            <ElRadioGroup :model-value="fileView" size="small" @update:model-value="(value: string | number | boolean | undefined) => emit('update:fileView', value as FileView)">
              <ElRadioButton value="tree">{{ t("sidebar.tree") }}</ElRadioButton>
              <ElRadioButton value="list">{{ t("sidebar.list") }}</ElRadioButton>
            </ElRadioGroup>
          </div>
          <div v-if="!workspace" class="sidebar-empty">
            <ElEmpty :description="t('sidebar.noFolder')" :image-size="60">
              <ElButton type="primary" size="small" @click="emit('openFolder')">{{ t("common.openFolder") }}</ElButton>
            </ElEmpty>
          </div>
          <FileTree
            v-else-if="fileView === 'tree'"
            ref="fileTree"
            class="sidebar-body"
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
        </div>
      </ElTabPane>
      <ElTabPane :label="t('sidebar.outline')" name="outline">
        <OutlineTree :items="outline" :current="currentHeading" :collapsible="collapsibleOutline" @select="(index) => emit('selectHeading', index)" />
      </ElTabPane>
      <ElTabPane :label="t('sidebar.search')" name="search">
        <SearchPanel
          ref="searchPanel"
          :api="api"
          :root="workspace?.root ?? null"
          @open-folder="emit('openFolder')"
          @open-match="(path, match) => emit('openMatch', path, match)"
        />
      </ElTabPane>
    </ElTabs>
  </aside>
</template>

<script setup lang="ts">
// 侧栏（W-7）：页签——文件（文件树、文件列表）、大纲、搜索
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
import { t } from "../../i18n.ts";

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
}>();

const rootName = computed(() => (props.workspace ? basename(props.workspace.root) || props.workspace.root : ""));

const searchPanel = ref<InstanceType<typeof SearchPanel> | null>(null);

/** Ctrl+Shift+F：切到搜索页签，焦点放进搜索框 */
async function focusSearch(): Promise<void> {
  if (props.tab !== "search") emit("update:tab", "search");
  await nextTick();
  searchPanel.value?.focus();
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
.sidebar {
  height: 100%;
  border-right: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.sidebar-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-tabs :deep(.el-tabs__header) {
  margin: 0;
}

.sidebar-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.sidebar-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.sidebar-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
}

.sidebar-root {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 树、列表的切换不换行（英文的字宽一些；文件夹名太长时缩的是它，L-2） */
.sidebar-toolbar .el-radio-group {
  flex: none;
  flex-wrap: nowrap;
}

.sidebar-body,
.sidebar-empty {
  flex: 1;
  min-height: 0;
}
</style>

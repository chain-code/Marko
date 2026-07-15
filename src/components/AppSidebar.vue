<template>
  <aside ref="sidebarRootRef" class="app-sidebar">
    <div class="sidebar-tabs" role="tablist" aria-label="侧栏视图">
      <button
        v-for="item in tabs"
        :id="`sidebar-tab-${item.key}`"
        :key="item.key"
        type="button"
        class="sidebar-tab"
        :class="{ active: activeTab === item.key }"
        :data-tab="item.key"
        role="tab"
        :aria-controls="`sidebar-panel-${item.key}`"
        :aria-selected="activeTab === item.key"
        :tabindex="activeTab === item.key ? 0 : -1"
        @click="selectTab(item.key, item.key === 'search')"
        @keydown="handleTabKeydown($event, item.key)"
      >
        <component :is="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </div>

    <section
      v-if="activeTab === 'files'"
      id="sidebar-panel-files"
      class="sidebar-panel file-panel"
      role="tabpanel"
      aria-labelledby="sidebar-tab-files"
    >
      <div class="panel-body">
        <div v-if="rootPath" class="workspace-label" :title="rootPath">
          <Folder />
          <span>{{ rootLabel }}</span>
        </div>

        <ul
          v-if="fileMode === 'tree' && tree.length > 0"
          class="tree-root"
          role="tree"
          :aria-label="`${rootLabel}文件树`"
        >
          <FileTreeNode
            v-for="(entry, index) in tree"
            :key="entry.path"
            :entry="entry"
            :current-path="currentPath"
            :depth="1"
            :initial-tabbable="index === 0 && !hasCurrentTreeEntry"
            @open-file="$emit('openFile', $event)"
            @context-file="openFileContextMenu"
          />
        </ul>

        <div v-else-if="fileMode === 'list' && fileListEntries.length > 0" class="file-list" role="list">
          <button
            v-for="file in fileListEntries"
            :key="file.path"
            type="button"
            class="file-row"
            :class="{ active: file.path === currentPath }"
            role="listitem"
            @click="$emit('openFile', file.path)"
            @contextmenu.prevent.stop="openFileContextMenu(createFileContextTarget(file, 'list'), $event)"
            @keydown="handleFileListKeydown($event, createFileContextTarget(file, 'list'))"
          >
            <FileText />
            <span class="file-row-text">
              <strong>{{ file.name }}</strong>
              <small>{{ formatFileListPath(file.path) }}</small>
            </span>
          </button>
        </div>

        <div v-else class="empty-state">
          <p>{{ rootPath ? "当前文件夹暂无 Markdown 文件" : "尚未打开文件夹" }}</p>
          <button type="button" @click="$emit('openFolder')">打开文件夹</button>
        </div>
      </div>

      <footer class="file-toolbar" aria-label="文件操作">
        <button
          type="button"
          class="sidebar-icon"
          title="新建文件"
          aria-label="新建文件"
          :disabled="!rootPath"
          @click="$emit('newWorkspaceFile', rootPath || '')"
        >
          <FilePlus />
        </button>
        <button type="button" class="sidebar-icon" title="打开文件夹" aria-label="打开文件夹" @click="$emit('openFolder')">
          <FolderOpen />
        </button>
        <div class="more-actions">
          <button
            type="button"
            class="sidebar-icon"
            title="更多文件操作"
            aria-label="更多文件操作"
            aria-haspopup="menu"
            :aria-expanded="moreMenuOpen"
            @click.stop="moreMenuOpen = !moreMenuOpen"
          >
            <Ellipsis />
          </button>
          <div v-if="moreMenuOpen" class="file-more-menu" role="menu" @click.stop>
            <button
              type="button"
              role="menuitem"
              :disabled="!rootPath"
              @click="runMoreAction('newFolder')"
            >
              <FolderPlus />
              <span>新建文件夹</span>
            </button>
            <button type="button" role="menuitem" @click="runMoreAction('quickOpen')">
              <Search />
              <span>快速打开</span>
            </button>
          </div>
        </div>
        <span class="toolbar-spacer" />
        <div class="view-toggle" aria-label="文件显示方式">
          <button
            type="button"
            class="sidebar-icon"
            :class="{ active: fileMode === 'list' }"
            title="文件列表"
            aria-label="文件列表"
            :aria-pressed="fileMode === 'list'"
            @click="$emit('update:fileMode', 'list')"
          >
            <List />
          </button>
          <button
            type="button"
            class="sidebar-icon"
            :class="{ active: fileMode === 'tree' }"
            title="文件树"
            aria-label="文件树"
            :aria-pressed="fileMode === 'tree'"
            @click="$emit('update:fileMode', 'tree')"
          >
            <ListTree />
          </button>
        </div>
      </footer>
    </section>

    <section
      v-else-if="activeTab === 'outline'"
      id="sidebar-panel-outline"
      class="sidebar-panel with-filter"
      role="tabpanel"
      aria-labelledby="sidebar-tab-outline"
    >
      <label class="filter-field">
        <Search />
        <input v-model="outlineFilter" type="search" placeholder="筛选大纲" aria-label="筛选大纲" />
      </label>

      <nav v-if="outlineRows.length > 0" class="outline-list" aria-label="文档大纲">
        <div
          v-for="row in outlineRows"
          :key="row.item.id"
          class="outline-row"
          :class="`lv-${row.item.level}`"
        >
          <button
            v-if="collapsibleOutline && !outlineFilter && row.hasChildren"
            type="button"
            class="outline-toggle"
            :title="row.collapsed ? '展开' : '折叠'"
            :aria-label="row.collapsed ? '展开' : '折叠'"
            :aria-expanded="!row.collapsed"
            @click="toggleOutline(row.item.id)"
          >
            <ChevronRight v-if="row.collapsed" />
            <ChevronDown v-else />
          </button>
          <span v-else class="outline-toggle-placeholder" />
          <a
            class="outline-link"
            :class="{ active: row.item.id === activeOutlineId }"
            :href="`#${row.item.id}`"
            :aria-current="row.item.id === activeOutlineId ? 'location' : undefined"
            @click.prevent="$emit('openOutlineItem', row.item)"
          >
            {{ row.item.title }}
          </a>
        </div>
      </nav>
      <p v-else class="empty-text">{{ outlineFilter ? "没有匹配的大纲标题" : "当前文档暂无可显示标题" }}</p>
    </section>

    <section
      v-else
      id="sidebar-panel-search"
      class="sidebar-panel search-panel"
      role="tabpanel"
      aria-labelledby="sidebar-tab-search"
    >
      <form class="sidebar-search-form" role="search" @submit.prevent="submitSidebarSearch">
        <Search />
        <input
          ref="searchInputRef"
          v-model="searchQueryModel"
          type="search"
          placeholder="搜索当前文件夹"
          aria-label="搜索当前文件夹"
          @keydown.down.prevent="focusSearchResult(0)"
        />
        <button
          v-if="searchQueryModel"
          type="button"
          class="clear-search"
          title="清空搜索"
          aria-label="清空搜索"
          @click="clearSidebarSearch"
        >
          <X />
        </button>
      </form>

      <div class="search-summary" aria-live="polite">
        <span v-if="searchPending">正在搜索...</span>
        <span v-else-if="searchQueryModel.trim()">{{ normalizedSearchResults.length }} 个结果</span>
        <span v-else>输入关键词后按 Enter 搜索</span>
      </div>

      <div v-if="normalizedSearchResults.length > 0" class="search-results" role="listbox" aria-label="搜索结果">
        <button
          v-for="(result, index) in normalizedSearchResults"
          :key="`${result.path}:${result.line}:${index}`"
          type="button"
          class="search-result"
          role="option"
          :title="result.path"
          @click="$emit('openSearchResult', result)"
          @keydown="handleSearchResultKeydown($event, index)"
        >
          <span class="search-result-heading">
            <strong>{{ searchResultName(result.path) }}</strong>
            <small>第 {{ result.line }} 行</small>
          </span>
          <span class="search-result-path">{{ formatSearchResultPath(result.path) }}</span>
          <span class="search-result-snippet">{{ result.snippet }}</span>
        </button>
      </div>
      <p v-else-if="searchQueryModel.trim() && !searchPending" class="empty-text">没有找到匹配内容</p>
    </section>

    <div
      v-if="contextMenu"
      class="sidebar-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      role="menu"
      @click.stop
      @contextmenu.prevent
      @keydown="handleContextMenuKeydown"
    >
      <button
        v-for="item in contextMenu.items"
        :key="item.action"
        type="button"
        class="context-menu-item"
        role="menuitem"
        @click="runFileContextAction(item.action)"
      >
        <component :is="contextActionIcon(item.action)" />
        <span>{{ item.label }}</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Ellipsis,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Link,
  List,
  ListTree,
  LocateFixed,
  PencilLine,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-vue-next";
import FileTreeNode from "@/components/FileTreeNode.vue";
import type {
  FileEntry,
  FilePanelMode,
  OutlineItem,
  SearchResult,
  SidebarFileContextAction,
  SidebarFileContextMenuItem,
  SidebarFileContextSource,
  SidebarFileContextTarget,
  SidebarTab,
} from "@/types";
import { buildCollapsibleOutlineRows } from "@/utils/outline";
import { isSameTreePath } from "@/utils/fileTree";
import {
  buildSidebarFileContextMenuItems,
  clampSidebarContextMenuPosition,
} from "@/utils/sidebarContextMenu";

interface SidebarContextMenuState {
  target: SidebarFileContextTarget;
  items: SidebarFileContextMenuItem[];
  x: number;
  y: number;
}

const props = defineProps<{
  activeTab: SidebarTab;
  fileMode: FilePanelMode;
  tree: FileEntry[];
  currentPath?: string;
  rootPath?: string;
  outline: OutlineItem[];
  activeOutlineId?: string;
  collapsibleOutline: boolean;
  nativeFileActions: boolean;
  searchQuery?: string;
  searchResults?: SearchResult[];
  searchPending?: boolean;
}>();

const emit = defineEmits<{
  "update:activeTab": [value: SidebarTab];
  "update:fileMode": [value: FilePanelMode];
  "update:searchQuery": [value: string];
  openFolder: [];
  newWorkspaceFile: [folderPath: string];
  newWorkspaceFolder: [folderPath: string];
  openFile: [path: string];
  openOutlineItem: [item: OutlineItem];
  quickOpen: [];
  submitSearch: [query: string];
  openSearchResult: [result: SearchResult];
  fileContextAction: [action: SidebarFileContextAction, target: SidebarFileContextTarget];
}>();

const activeTab = computed({
  get: () => props.activeTab,
  set: (value: SidebarTab) => emit("update:activeTab", value),
});
const searchQueryModel = computed({
  get: () => props.searchQuery ?? "",
  set: (value: string) => emit("update:searchQuery", value),
});
const outlineFilter = ref("");
const collapsedOutlineIds = ref<Set<string>>(new Set());
const sidebarRootRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const contextMenu = ref<SidebarContextMenuState | null>(null);
const moreMenuOpen = ref(false);
let contextMenuReturnFocus: HTMLElement | null = null;

const contextActionIcons: Record<SidebarFileContextAction, unknown> = {
  newFileInFolder: FilePlus,
  newFolderInFolder: FolderPlus,
  refreshFolder: RotateCcw,
  openFile: FileText,
  renameFile: PencilLine,
  copyName: Copy,
  copyMarkdownLink: Link,
  copyRelativePath: Copy,
  copyPath: Copy,
  revealFile: LocateFixed,
  openContainingFolder: FolderOpen,
  openFolderPath: FolderOpen,
  openAsWorkspace: ListTree,
  deletePath: Trash2,
  removeRecent: X,
};

const tabs = [
  { key: "files", label: "文件", icon: ListTree },
  { key: "outline", label: "大纲", icon: FileText },
  { key: "search", label: "搜索", icon: Search },
] as const;

const rootLabel = computed(() => {
  if (!props.rootPath) return "未选择";
  return props.rootPath.replace(/\\/g, "/").split("/").pop() || props.rootPath;
});
const fileListEntries = computed(() => flattenEntries(props.tree));
const hasCurrentTreeEntry = computed(() => fileListEntries.value.some((entry) => isSameTreePath(entry.path, props.currentPath)));
const normalizedSearchResults = computed(() => props.searchResults ?? []);
const filteredOutline = computed(() => {
  const keyword = outlineFilter.value.trim().toLowerCase();
  if (!keyword) return props.outline;
  return props.outline.filter((item) => item.title.toLowerCase().includes(keyword));
});
const outlineRows = computed(() => buildCollapsibleOutlineRows(
  filteredOutline.value,
  props.collapsibleOutline && !outlineFilter.value ? collapsedOutlineIds.value : new Set<string>(),
));

watch(() => props.activeTab, closeFloatingMenus);

onMounted(() => {
  window.addEventListener("click", closeFloatingMenus);
  window.addEventListener("keydown", handleGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("click", closeFloatingMenus);
  window.removeEventListener("keydown", handleGlobalKeydown);
});

function handleTabKeydown(event: KeyboardEvent, key: SidebarTab) {
  const index = tabs.findIndex((item) => item.key === key);
  let targetIndex = index;
  if (event.key === "ArrowLeft") targetIndex = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === "ArrowRight") targetIndex = (index + 1) % tabs.length;
  else if (event.key === "Home") targetIndex = 0;
  else if (event.key === "End") targetIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  const target = tabs[targetIndex];
  activeTab.value = target.key;
  nextTick(() => {
    sidebarRootRef.value?.querySelector<HTMLButtonElement>(`[role="tab"][data-tab="${target.key}"]`)?.focus();
  });
}

async function selectTab(tab: SidebarTab, focusPanel = false) {
  activeTab.value = tab;
  if (tab === "search" && focusPanel) {
    await nextTick();
    searchInputRef.value?.focus();
  }
}

function toggleOutline(id: string) {
  const next = new Set(collapsedOutlineIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsedOutlineIds.value = next;
}

function formatFileListPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedRoot = props.rootPath?.replace(/\\/g, "/");
  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)) {
    const relativePath = normalizedPath.slice(normalizedRoot.length + 1);
    const folder = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "";
    return folder || rootLabel.value;
  }
  return normalizedPath.includes("/") ? normalizedPath.slice(0, normalizedPath.lastIndexOf("/")) : rootLabel.value;
}

function flattenEntries(entries: FileEntry[]): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = [];
  for (const entry of entries) {
    if (entry.isDir) result.push(...flattenEntries(entry.children));
    else result.push({ name: entry.name, path: entry.path });
  }
  return result;
}

function createFileContextTarget(
  file: { name: string; path: string },
  source: SidebarFileContextSource,
): SidebarFileContextTarget {
  return { name: file.name, path: file.path, isDir: false, source };
}

function openFileContextMenu(target: SidebarFileContextTarget, event: MouseEvent | KeyboardEvent) {
  const items = buildSidebarFileContextMenuItems(target, props.nativeFileActions);
  if (items.length === 0) return;
  const trigger = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const keyboardTriggered = event instanceof KeyboardEvent;
  const rect = trigger?.getBoundingClientRect();
  const position = clampSidebarContextMenuPosition(
    keyboardTriggered ? (rect?.left ?? 0) + 12 : event.clientX,
    keyboardTriggered ? rect?.bottom ?? 0 : event.clientY,
    window.innerWidth,
    window.innerHeight,
    items.length,
  );
  contextMenuReturnFocus = trigger;
  contextMenu.value = { target, items, ...position };
  moreMenuOpen.value = false;
  nextTick(() => getContextMenuItems()[0]?.focus());
}

function handleFileListKeydown(event: KeyboardEvent, target: SidebarFileContextTarget) {
  if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
  event.preventDefault();
  event.stopPropagation();
  openFileContextMenu(target, event);
}

function getContextMenuItems(): HTMLButtonElement[] {
  return Array.from(
    sidebarRootRef.value?.querySelectorAll<HTMLButtonElement>(".sidebar-context-menu [role='menuitem']") ?? [],
  );
}

function handleContextMenuKeydown(event: KeyboardEvent) {
  const items = getContextMenuItems();
  if (items.length === 0) return;
  const index = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
  let targetIndex = index;
  if (event.key === "ArrowDown") targetIndex = (index + 1) % items.length;
  else if (event.key === "ArrowUp") targetIndex = (index - 1 + items.length) % items.length;
  else if (event.key === "Home") targetIndex = 0;
  else if (event.key === "End") targetIndex = items.length - 1;
  else if (event.key === "Escape") {
    event.preventDefault();
    closeContextMenu(true);
    return;
  } else return;
  event.preventDefault();
  items[targetIndex]?.focus();
}

function contextActionIcon(action: SidebarFileContextAction): unknown {
  return contextActionIcons[action];
}

function runFileContextAction(action: SidebarFileContextAction) {
  const target = contextMenu.value?.target;
  closeContextMenu(true);
  if (target) emit("fileContextAction", action, target);
}

function runMoreAction(action: "newFolder" | "quickOpen") {
  moreMenuOpen.value = false;
  if (action === "newFolder") emit("newWorkspaceFolder", props.rootPath || "");
  else emit("quickOpen");
}

function submitSidebarSearch() {
  emit("submitSearch", searchQueryModel.value.trim());
}

function clearSidebarSearch() {
  searchQueryModel.value = "";
  emit("submitSearch", "");
  nextTick(() => searchInputRef.value?.focus());
}

function searchResultName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || path;
}

function formatSearchResultPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedRoot = props.rootPath?.replace(/\\/g, "/");
  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizedPath;
}

function focusSearchResult(index: number) {
  const results = sidebarRootRef.value?.querySelectorAll<HTMLButtonElement>(".search-result");
  if (!results?.length) return;
  results[Math.max(0, Math.min(index, results.length - 1))]?.focus();
}

function handleSearchResultKeydown(event: KeyboardEvent, index: number) {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    focusSearchResult(index + 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (index === 0) searchInputRef.value?.focus();
    else focusSearchResult(index - 1);
  } else if (event.key === "Home") {
    event.preventDefault();
    focusSearchResult(0);
  } else if (event.key === "End") {
    event.preventDefault();
    focusSearchResult(normalizedSearchResults.value.length - 1);
  }
}

function closeFloatingMenus() {
  closeContextMenu(false);
  moreMenuOpen.value = false;
}

function closeContextMenu(restoreFocus: boolean) {
  const returnFocus = contextMenuReturnFocus;
  contextMenu.value = null;
  contextMenuReturnFocus = null;
  if (restoreFocus) nextTick(() => returnFocus?.focus());
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && contextMenu.value) {
    event.preventDefault();
    closeContextMenu(true);
  } else if (event.key === "Escape") closeFloatingMenus();
}

async function scrollCurrentFileIntoView() {
  await nextTick();
  const row = sidebarRootRef.value?.querySelector<HTMLElement>(".tree-row[aria-current='page'], .file-row.active");
  row?.scrollIntoView({ block: "nearest" });
}

function showFiles() {
  activeTab.value = "files";
}

function showOutline() {
  activeTab.value = "outline";
}

function showSearch() {
  activeTab.value = "search";
}

async function focusSearch() {
  showSearch();
  await nextTick();
  searchInputRef.value?.focus();
}

defineExpose({ scrollCurrentFileIntoView, showFiles, showOutline, showSearch, focusSearch });
</script>

<style scoped>
.app-sidebar {
  display: grid;
  grid-template-rows: 38px minmax(0, 1fr);
  width: var(--sidebar-width, 260px);
  min-width: var(--sidebar-width, 260px);
  height: 100%;
  background: var(--sidebar-bg);
  color: var(--text);
}

.sidebar-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
  background: var(--sidebar-header);
}

.sidebar-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.32rem;
  min-width: 0;
  height: 38px;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.76rem;
}

.sidebar-tab:hover,
.sidebar-tab.active {
  color: var(--text);
}

.sidebar-tab.active {
  border-bottom-color: var(--accent-strong);
  background: color-mix(in srgb, var(--panel) 72%, transparent);
}

.sidebar-tab:focus-visible,
.sidebar-icon:focus-visible,
.outline-link:focus-visible,
.search-result:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-strong) 65%, transparent);
  outline-offset: -2px;
}

.sidebar-tab svg,
.sidebar-icon svg {
  width: 14px;
  height: 14px;
}

.sidebar-panel {
  display: grid;
  min-height: 0;
}

.file-panel {
  grid-template-rows: minmax(0, 1fr) 30px;
}

.with-filter {
  grid-template-rows: 38px minmax(0, 1fr);
}

.search-panel {
  grid-template-rows: 42px 26px minmax(0, 1fr);
}

.panel-body,
.outline-list,
.file-list,
.search-results {
  min-height: 0;
  overflow: auto;
}

.panel-body {
  padding: 0.3rem 0.32rem;
}

.workspace-label {
  display: flex;
  align-items: center;
  gap: 0.38rem;
  min-height: 28px;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 650;
  padding: 0.2rem 0.38rem;
  text-transform: uppercase;
}

.workspace-label svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
}

.workspace-label span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-root {
  margin: 0;
  padding: 0;
}

.file-list {
  display: grid;
  align-content: start;
  gap: 1px;
}

.file-row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  min-height: 36px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  padding: 0.24rem 0.44rem;
  text-align: left;
}

.file-row:hover,
.file-row.active {
  background: var(--hover);
  color: var(--text);
}

.file-row svg {
  width: 14px;
  height: 14px;
  color: var(--muted);
}

.file-row-text,
.search-result-heading {
  display: grid;
  min-width: 0;
}

.file-row strong,
.file-row small,
.search-result span,
.search-result strong,
.search-result small {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-row strong {
  color: var(--text);
  font-size: 0.78rem;
  font-weight: 560;
}

.file-row small {
  color: var(--muted);
  font-size: 0.67rem;
}

.file-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1px;
  height: 30px;
  border-top: 1px solid var(--border);
  background: var(--sidebar-header);
  padding: 0 0.2rem;
}

.toolbar-spacer {
  flex: 1 1 auto;
}

.sidebar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.sidebar-icon:hover,
.sidebar-icon.active {
  background: var(--hover);
  color: var(--text);
}

.sidebar-icon:disabled {
  opacity: 0.38;
  cursor: not-allowed;
}

.view-toggle {
  display: inline-flex;
  align-items: center;
}

.more-actions {
  position: relative;
}

.file-more-menu {
  position: absolute;
  z-index: 76;
  bottom: 29px;
  left: 0;
  display: grid;
  width: 164px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.24rem;
}

.file-more-menu button {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 0.4rem;
  min-height: 30px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 0.76rem;
  padding: 0.28rem 0.42rem;
  text-align: left;
}

.file-more-menu button:hover {
  background: var(--hover);
}

.file-more-menu button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.file-more-menu svg {
  width: 14px;
  height: 14px;
}

.filter-field,
.sidebar-search-form {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.28rem;
  margin: 0.35rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel);
  color: var(--muted);
  padding: 0 0.42rem;
}

.filter-field svg,
.sidebar-search-form > svg {
  width: 14px;
  height: 14px;
}

.filter-field input,
.sidebar-search-form input {
  min-width: 0;
  height: 28px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 0.76rem;
}

.filter-field:focus-within,
.sidebar-search-form:focus-within {
  border-color: var(--border-strong);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-strong) 12%, transparent);
}

.outline-list {
  display: grid;
  align-content: start;
  gap: 1px;
  padding: 0.14rem 0.34rem 0.5rem;
}

.outline-row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: center;
  min-width: 0;
}

.outline-toggle,
.outline-toggle-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 27px;
}

.outline-toggle {
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.outline-toggle:hover {
  background: var(--hover);
  color: var(--text);
}

.outline-toggle svg {
  width: 13px;
  height: 13px;
}

.outline-link {
  overflow: hidden;
  border-radius: 4px;
  color: var(--text-main);
  font-size: 0.78rem;
  line-height: 1.35;
  padding: 0.3rem 0.42rem;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-link:hover,
.outline-link.active {
  background: var(--hover);
  color: var(--text);
}

.outline-link.active {
  box-shadow: inset 2px 0 0 var(--accent-strong);
  font-weight: 650;
}

.outline-row.lv-2 { padding-left: 0.46rem; }
.outline-row.lv-3 { padding-left: 0.92rem; }
.outline-row.lv-4,
.outline-row.lv-5,
.outline-row.lv-6 { padding-left: 1.38rem; }

.outline-row.lv-4 .outline-link,
.outline-row.lv-5 .outline-link,
.outline-row.lv-6 .outline-link { color: var(--muted); }

.clear-search {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.clear-search:hover {
  background: var(--hover);
  color: var(--text);
}

.clear-search svg {
  width: 13px;
  height: 13px;
}

.search-summary {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.68rem;
  padding: 0.12rem 0.7rem 0.28rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-results {
  display: grid;
  align-content: start;
  gap: 1px;
  padding: 0.1rem 0.34rem 0.5rem;
}

.search-result {
  display: grid;
  gap: 0.16rem;
  width: 100%;
  min-width: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  padding: 0.44rem 0.48rem;
  text-align: left;
}

.search-result:hover,
.search-result:focus {
  background: var(--hover);
}

.search-result-heading {
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.4rem;
}

.search-result-heading strong {
  color: var(--text);
  font-size: 0.76rem;
  font-weight: 620;
}

.search-result-heading small,
.search-result-path {
  color: var(--muted);
  font-size: 0.66rem;
}

.search-result-snippet {
  color: var(--text-main);
  font-size: 0.72rem;
}

.empty-state {
  display: grid;
  gap: 0.45rem;
  justify-items: start;
  color: var(--muted);
  font-size: 0.76rem;
  padding: 0.7rem 0.5rem;
}

.empty-state button {
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--panel);
  color: var(--text-main);
  cursor: pointer;
  font-size: 0.74rem;
  padding: 0.24rem 0.5rem;
}

.empty-state button:hover {
  background: var(--hover);
}

.empty-text {
  color: var(--muted);
  font-size: 0.76rem;
  padding: 0.65rem 0.7rem;
}

.sidebar-context-menu {
  position: fixed;
  z-index: 75;
  display: grid;
  width: 218px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.28rem;
}

.context-menu-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 0.46rem;
  min-height: 30px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0.3rem 0.46rem;
  text-align: left;
}

.context-menu-item:hover,
.context-menu-item:focus-visible {
  background: var(--hover);
  color: var(--text);
}

.context-menu-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-strong) 62%, transparent);
  outline-offset: -2px;
}

.context-menu-item svg {
  width: 15px;
  height: 15px;
  color: var(--muted);
}

.context-menu-item span {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .app-sidebar {
    width: min(var(--sidebar-width, 260px), 72vw);
    min-width: min(var(--sidebar-width, 260px), 72vw);
  }

  .sidebar-tab {
    gap: 0.2rem;
  }
}
</style>

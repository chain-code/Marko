<template>
  <aside class="app-sidebar">
    <div class="sidebar-tabs" role="tablist" aria-label="侧栏">
      <button
        v-for="item in tabs"
        :key="item.key"
        type="button"
        class="sidebar-tab"
        :class="{ active: activeTab === item.key }"
        @click="activeTab = item.key"
      >
        <component :is="item.icon" />
        <span>{{ item.label }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'files'" class="sidebar-panel">
      <header class="panel-header">
        <div class="panel-title">
          <span>文件</span>
          <strong :title="rootPath || rootLabel">{{ rootLabel }}</strong>
        </div>
        <div class="panel-actions">
          <button type="button" class="sidebar-icon" title="快速打开" @click="$emit('quickOpen')">
            <Search />
          </button>
          <button type="button" class="sidebar-icon" title="打开文件夹" @click="$emit('openFolder')">
            <FolderOpen />
          </button>
        </div>
      </header>

      <div class="view-tabs" role="tablist" aria-label="文件视图">
        <button
          type="button"
          class="view-tab"
          :class="{ active: fileView === 'tree' }"
          @click="fileView = 'tree'"
        >
          文件树
        </button>
        <button
          type="button"
          class="view-tab"
          :class="{ active: fileView === 'list' }"
          @click="fileView = 'list'"
        >
          文件列表
        </button>
      </div>

      <div class="panel-body">
        <ul v-if="fileView === 'tree' && tree.length > 0" class="tree-root">
          <FileTreeNode
            v-for="entry in tree"
            :key="entry.path"
            :entry="entry"
            :current-path="currentPath"
            @open-file="$emit('openFile', $event)"
          />
        </ul>

        <div v-else-if="fileView === 'list' && fileListEntries.length > 0" class="file-list">
          <button
            v-for="file in fileListEntries"
            :key="file.path"
            type="button"
            class="file-row"
            :class="{ active: file.path === currentPath }"
            @click="$emit('openFile', file.path)"
          >
            <FileText />
            <span>{{ file.name }}</span>
          </button>
        </div>

        <div v-else class="empty-state">
          <p>尚未打开文件夹</p>
          <button type="button" @click="$emit('openFolder')">打开文件夹</button>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab === 'outline'" class="sidebar-panel">
      <header class="panel-header">
        <div class="panel-title">
          <span>大纲</span>
          <strong>{{ outline.length }} 个标题</strong>
        </div>
      </header>

      <input v-model="outlineFilter" class="sidebar-field" placeholder="筛选标题" />

      <nav v-if="filteredOutline.length > 0" class="outline-list">
        <a
          v-for="item in filteredOutline"
          :key="item.id"
          class="outline-link"
          :class="`lv-${item.level}`"
          :href="`#${item.id}`"
        >
          {{ item.title }}
        </a>
      </nav>
      <p v-else class="empty-text">当前文档暂无可显示标题</p>
    </section>

    <section v-else-if="activeTab === 'search'" class="sidebar-panel">
      <header class="panel-header">
        <div class="panel-title">
          <span>搜索</span>
          <strong>当前文件夹</strong>
        </div>
      </header>

      <form class="search-form" @submit.prevent="$emit('search', searchDraft)">
        <input v-model="searchDraft" class="sidebar-field" placeholder="搜索 Markdown" />
        <button type="submit" class="sidebar-icon" title="搜索">
          <Search />
        </button>
      </form>

      <div class="search-results">
        <button
          v-for="result in searchResults"
          :key="`${result.path}:${result.line}`"
          type="button"
          class="search-result"
          @click="$emit('openFile', result.path)"
        >
          <span>{{ fileName(result.path) }}:{{ result.line }}</span>
          <small>{{ result.snippet }}</small>
        </button>
        <p v-if="searchResults.length === 0" class="empty-text">输入关键词后搜索当前文件夹</p>
      </div>
    </section>

    <section v-else class="sidebar-panel">
      <header class="panel-header">
        <div class="panel-title">
          <span>最近</span>
          <strong>{{ recentFiles.length }} 个文件</strong>
        </div>
      </header>

      <div class="file-list">
        <button
          v-for="item in recentFiles"
          :key="item.path"
          type="button"
          class="file-row recent"
          :class="{ active: item.path === currentPath }"
          @click="$emit('openFile', item.path)"
        >
          <FileText />
          <span>
            <strong>{{ item.name }}</strong>
            <small>{{ item.path }}</small>
          </span>
        </button>
        <p v-if="recentFiles.length === 0" class="empty-text">暂无最近打开文件</p>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Clock3, FileText, FolderOpen, ListTree, Search } from "lucide-vue-next";
import FileTreeNode from "@/components/FileTreeNode.vue";
import type { FileEntry, OutlineItem, RecentFile, SearchResult } from "@/types";

const props = defineProps<{
  tree: FileEntry[];
  currentPath?: string;
  rootPath?: string;
  outline: OutlineItem[];
  recentFiles: RecentFile[];
  searchResults: SearchResult[];
  searchQuery: string;
}>();

defineEmits<{
  openFolder: [];
  openFile: [path: string];
  quickOpen: [];
  search: [query: string];
}>();

const activeTab = ref<"files" | "outline" | "search" | "recent">("files");
const fileView = ref<"tree" | "list">("tree");
const searchDraft = ref(props.searchQuery);
const outlineFilter = ref("");

watch(
  () => props.searchQuery,
  (value) => {
    searchDraft.value = value;
  },
);

const tabs = [
  { key: "files", label: "文件", icon: ListTree },
  { key: "outline", label: "大纲", icon: FileText },
  { key: "search", label: "搜索", icon: Search },
  { key: "recent", label: "最近", icon: Clock3 },
] as const;

const rootLabel = computed(() => {
  if (!props.rootPath) return "未选择";
  return props.rootPath.replace(/\\/g, "/").split("/").pop() || props.rootPath;
});

const flatFiles = computed(() => flattenEntries(props.tree));

const fileListEntries = computed(() => {
  if (flatFiles.value.length > 0) return flatFiles.value;
  return props.recentFiles.map((item) => ({ name: item.name, path: item.path }));
});

const filteredOutline = computed(() => {
  const keyword = outlineFilter.value.trim().toLowerCase();
  if (!keyword) return props.outline;
  return props.outline.filter((item) => item.title.toLowerCase().includes(keyword));
});

function flattenEntries(entries: FileEntry[]): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = [];
  for (const entry of entries) {
    if (entry.isDir) {
      result.push(...flattenEntries(entry.children));
    } else {
      result.push({ name: entry.name, path: entry.path });
    }
  }
  return result;
}

function fileName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}
</script>

<style scoped>
.app-sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 274px;
  min-width: 274px;
  height: 100%;
  border-right: 1px solid var(--border);
  background: var(--sidebar-bg);
  color: var(--text);
}

.sidebar-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
  background: var(--sidebar-header);
}

.sidebar-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  min-width: 0;
  height: 36px;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.78rem;
}

.sidebar-tab:hover,
.sidebar-tab.active {
  color: var(--text);
}

.sidebar-tab.active {
  border-bottom-color: var(--accent-strong);
  background: var(--panel);
}

.sidebar-tab svg {
  width: 14px;
  height: 14px;
}

.sidebar-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  min-height: 44px;
  border-bottom: 1px solid var(--border);
  padding: 0.48rem 0.58rem 0.48rem 0.72rem;
}

.panel-title {
  display: grid;
  min-width: 0;
}

.panel-title span {
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 650;
}

.panel-title strong {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.7rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.16rem;
}

.sidebar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.sidebar-icon:hover {
  background: var(--hover);
  color: var(--text);
}

.sidebar-icon svg {
  width: 15px;
  height: 15px;
}

.view-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
}

.view-tab {
  height: 32px;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.76rem;
}

.view-tab:hover,
.view-tab.active {
  color: var(--text);
}

.view-tab.active {
  border-bottom-color: var(--accent-strong);
}

.panel-body,
.outline-list,
.search-results,
.file-list {
  min-height: 0;
  overflow: auto;
}

.panel-body {
  padding: 0.4rem 0.36rem;
}

.tree-root {
  margin: 0;
  padding: 0;
}

.file-list {
  display: grid;
  align-content: start;
  gap: 0.04rem;
  padding: 0.38rem 0.36rem;
}

.file-row {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 0.38rem;
  width: 100%;
  min-height: 28px;
  border-radius: 5px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  padding: 0.25rem 0.42rem;
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

.file-row span,
.file-row strong,
.file-row small {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-row.recent {
  align-items: start;
  min-height: 44px;
}

.file-row.recent span {
  display: grid;
}

.file-row.recent strong {
  color: inherit;
  font-size: 0.8rem;
  font-weight: 550;
}

.file-row.recent small {
  color: var(--muted);
  font-size: 0.68rem;
}

.sidebar-field {
  width: calc(100% - 0.72rem);
  height: 30px;
  margin: 0.38rem 0.36rem;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel);
  color: var(--text);
  font-size: 0.78rem;
  padding: 0 0.52rem;
}

.sidebar-field:focus {
  border-color: var(--border-strong);
  outline: none;
}

.outline-list {
  display: grid;
  align-content: start;
  gap: 0.04rem;
  padding: 0.25rem 0.36rem 0.5rem;
}

.outline-link {
  overflow: hidden;
  border-radius: 5px;
  color: var(--text-main);
  font-size: 0.78rem;
  line-height: 1.35;
  padding: 0.3rem 0.42rem;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-link:hover {
  background: var(--hover);
  color: var(--text);
}

.outline-link.lv-2 {
  padding-left: 0.9rem;
}

.outline-link.lv-3 {
  padding-left: 1.35rem;
}

.outline-link.lv-4,
.outline-link.lv-5,
.outline-link.lv-6 {
  padding-left: 1.78rem;
  color: var(--muted);
}

.search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.25rem;
  padding-right: 0.36rem;
}

.search-form .sidebar-field {
  width: 100%;
}

.search-results {
  display: grid;
  align-content: start;
  gap: 0.12rem;
  padding: 0.25rem 0.36rem 0.5rem;
}

.search-result {
  display: grid;
  gap: 0.12rem;
  width: 100%;
  border-radius: 5px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  padding: 0.38rem 0.42rem;
  text-align: left;
}

.search-result:hover {
  background: var(--hover);
}

.search-result span,
.search-result small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result span {
  color: var(--text);
  font-size: 0.78rem;
}

.search-result small {
  color: var(--muted);
  font-size: 0.7rem;
}

.empty-state {
  display: grid;
  gap: 0.45rem;
  justify-items: start;
  color: var(--muted);
  font-size: 0.78rem;
  padding: 0.55rem 0.42rem;
}

.empty-state button {
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--panel);
  color: var(--text-main);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.22rem 0.5rem;
}

.empty-state button:hover {
  background: var(--hover);
}

.empty-text {
  color: var(--muted);
  font-size: 0.78rem;
  padding: 0.55rem 0.42rem;
}

@media (max-width: 900px) {
  .app-sidebar {
    width: 214px;
    min-width: 214px;
  }

  .sidebar-tab {
    gap: 0;
  }

  .sidebar-tab span {
    display: none;
  }
}
</style>

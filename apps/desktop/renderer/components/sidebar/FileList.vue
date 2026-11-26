<template>
  <ElScrollbar class="file-list" data-testid="file-list">
    <div v-if="!files.length" class="sidebar-hint">{{ t("sidebar.noMarkdown") }}</div>
    <div
      v-for="file in files"
      :key="file.path"
      class="file-list-item"
      :class="{ current: file.path === current }"
      role="button"
      :title="file.path"
      @click="emit('open', file.path)"
      @contextmenu.prevent="emit('contextmenu', file.path)"
    >
      <!-- 文件名加粗、扩展名灰色（同 Typora 的文档列表） -->
      <span class="file-list-name"><span class="file-list-stem">{{ stemOf(file.name) }}</span><span class="file-list-ext">{{ extensionOf(file.name) }}</span></span>
      <span v-if="file.directory" class="file-list-directory">{{ file.directory }}</span>
    </div>
  </ElScrollbar>
</template>

<script setup lang="ts">
// 文档列表（W-3，样子同 Typora）：工作区里所有 Markdown 文件平铺，显示文件名和所在的相对目录
import type { WorkspaceFile } from "../../composables/useWorkspace.ts";
import { t } from "../../i18n.ts";

defineProps<{ files: WorkspaceFile[]; current: string | null }>();
const emit = defineEmits<{ open: [path: string]; contextmenu: [path: string] }>();

function stemOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}
</script>

<style scoped>
.file-list {
  height: 100%;
}

/* 每一项：上下 12px、左右 24px；当前的灰底（同 Typora） */
.file-list-item {
  display: flex;
  flex-direction: column;
  padding: 12px 8px 12px 24px;
  border-bottom: 1px solid var(--app-sidebar-border, #e9e9e9);
  color: var(--md-text, #333);
  font-size: 14px;
  line-height: 20px;
  cursor: pointer;
}

.file-list-item:hover {
  background: var(--app-item-hover, rgba(229, 229, 229, 0.59));
}

.file-list-item.current {
  background: var(--app-active-file, #eee);
}

.file-list-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-list-stem {
  font-weight: 700;
}

.file-list-ext {
  color: var(--app-file-ext, #c7c5c5);
}

.file-list-directory {
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  opacity: 0.9;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

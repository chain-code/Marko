<template>
  <ElScrollbar class="file-list" data-testid="file-list">
    <ElEmpty v-if="!files.length" :description="t('sidebar.noMarkdown')" :image-size="60" />
    <button
      v-for="file in files"
      :key="file.path"
      type="button"
      class="file-list-item"
      :class="{ current: file.path === current }"
      :title="file.path"
      @click="emit('open', file.path)"
      @contextmenu.prevent="emit('contextmenu', file.path)"
    >
      <span class="file-list-name">{{ file.name }}</span>
      <span v-if="file.directory" class="file-list-directory">{{ file.directory }}</span>
    </button>
  </ElScrollbar>
</template>

<script setup lang="ts">
// 文件列表（W-3）：工作区里所有 Markdown 文件平铺，显示文件名和所在的相对目录
import type { WorkspaceFile } from "../../composables/useWorkspace.ts";
import { t } from "../../i18n.ts";

defineProps<{ files: WorkspaceFile[]; current: string | null }>();
const emit = defineEmits<{ open: [path: string]; contextmenu: [path: string] }>();
</script>

<style scoped>
.file-list {
  height: 100%;
}

.file-list-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 6px 12px;
  border: 0;
  background: none;
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.file-list-item:hover {
  background: var(--el-fill-color-light);
}

.file-list-item.current {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.file-list-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-list-directory {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

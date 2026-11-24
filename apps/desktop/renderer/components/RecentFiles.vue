<template>
  <ElDialog
    :model-value="visible"
    class="marko-recent-files"
    :title="t('recent.title')"
    width="640px"
    top="10vh"
    @update:model-value="(value: boolean) => emit('update:visible', value)"
    @opened="focus"
  >
    <ElInput ref="input" v-model="filter" :placeholder="t('common.search')" clearable data-testid="recent-filter" />
    <ElScrollbar max-height="50vh" class="recent-list" data-testid="recent-list">
      <div v-for="file in filtered" :key="file.path" class="recent-item" @contextmenu.prevent="emit('contextmenu', file.path)">
        <button type="button" class="recent-main" :title="file.path" @click="open(file.path)">
          <span class="recent-name">{{ basename(file.path) }}</span>
          <span class="recent-directory">{{ dirname(file.path) }}</span>
        </button>
        <span class="recent-time">{{ timeOf(file.openedAt) }}</span>
        <ElButton link type="danger" size="small" :aria-label="t('recent.removeLabel', { name: basename(file.path) })" @click="remove(file.path)">{{ t("common.remove") }}</ElButton>
      </div>
      <ElEmpty v-if="!filtered.length" :description="filter ? t('common.notFound') : t('recent.empty')" :image-size="60" />
    </ElScrollbar>
  </ElDialog>
</template>

<script setup lang="ts">
// 最近文件面板（F-5）：「文件 → 打开最近 → 显示最近文件...」。可以搜索、打开（F-3 的窗口规则）、从列表里移除
import type { MarkoApi, RecentFile } from "@marko/shared";
import { computed, ref, watch } from "vue";
import { basename, dirname } from "../paths.ts";
import { t } from "../i18n.ts";

const props = defineProps<{ visible: boolean; api: MarkoApi }>();
const emit = defineEmits<{ "update:visible": [visible: boolean]; open: [path: string]; contextmenu: [path: string] }>();

const files = ref<RecentFile[]>([]);
const filter = ref("");
const input = ref<{ focus: () => void } | null>(null);

const filtered = computed(() => {
  const text = filter.value.trim().toLowerCase();
  return text ? files.value.filter((file) => file.path.toLowerCase().includes(text)) : files.value;
});

const format = new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" });

function timeOf(openedAt: number): string {
  return format.format(new Date(openedAt));
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    filter.value = "";
    files.value = await props.api.recent.list();
  },
  { immediate: true },
);

function focus(): void {
  input.value?.focus();
}

function open(path: string): void {
  emit("update:visible", false);
  emit("open", path);
}

async function remove(path: string): Promise<void> {
  files.value = await props.api.recent.remove(path);
}
</script>

<style>
.marko-recent-files .recent-list {
  margin-top: 8px;
}

.marko-recent-files .recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  border-radius: 4px;
}

.marko-recent-files .recent-item:hover {
  background: var(--el-fill-color-light);
}

.marko-recent-files .recent-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 4px 6px;
  border: 0;
  background: none;
  color: var(--el-text-color-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.marko-recent-files .recent-name,
.marko-recent-files .recent-directory {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.marko-recent-files .recent-directory,
.marko-recent-files .recent-time {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.marko-recent-files .recent-time {
  flex: none;
}
</style>

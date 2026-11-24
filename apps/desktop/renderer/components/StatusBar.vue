<template>
  <footer class="status-bar" data-testid="status-bar">
    <span class="status-path" :title="path ?? ''">{{ path ?? t("status.notSaved") }}</span>
    <!-- F-12：自动重新载入这类提示，停几秒 -->
    <span v-if="notice" class="status-notice" data-testid="status-notice" role="status">{{ notice }}</span>
    <!-- F-18：识别不出编码时提示；不是 UTF-8 时显示编码 -->
    <span v-if="uncertainEncoding" class="status-encoding is-warning" data-testid="status-encoding">{{ t("status.uncertainEncoding") }}</span>
    <span v-else-if="encoding !== 'utf-8'" class="status-encoding" data-testid="status-encoding">{{ encoding.toUpperCase() }}</span>
    <!-- V-3：点字数打开字数统计（V-4） -->
    <span v-if="showWordCount" class="status-words" data-testid="word-count" role="button" :title="t('wordCount.title')" @click="emit('openWordCount')">{{ words }}</span>
  </footer>
</template>

<script setup lang="ts">
// 状态栏（V-3）：左边是文件路径（新文档显示「尚未保存到磁盘」）；右边是字数，有选区时是选区的字数。
// 字数停止输入一会儿再算（大文档整篇统计要时间，X-3）
import { documentStats } from "@marko/markdown";
import { toModel } from "@marko/editor";
import type { Editor } from "@tiptap/core";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { t } from "../i18n.ts";
import { selectionStats } from "../selectionStats.ts";

/** content：文档的原文。打开别的文件时编辑器整个换掉（没有事务），靠它知道要重新算 */
const props = defineProps<{
  editor: Editor | null;
  path: string | null;
  content: string;
  encoding: string;
  uncertainEncoding: boolean;
  /** 状态栏上的提示（F-12），没有时 null */
  notice?: string | null;
  showWordCount: boolean;
}>();
const emit = defineEmits<{ openWordCount: [] }>();

/** 字数和是不是选区的（显示的文字跟着界面语言） */
const counted = ref<{ words: number; selected: boolean } | null>(null);
const words = computed(() => {
  if (!counted.value) return "";
  return t(counted.value.selected ? "status.selectedWords" : "status.words", { words: counted.value.words });
});
let timer: ReturnType<typeof setTimeout> | undefined;

function count(): void {
  const editor = props.editor;
  if (!editor) return;
  const selected = selectionStats(editor);
  if (selected) {
    counted.value = { words: selected.words, selected: true };
    return;
  }
  const stats = documentStats(toModel(editor.state.doc), { syntax: editor.storage.marko.syntax });
  counted.value = { words: stats.words, selected: false };
}

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(count, 200);
}

watch(
  () => props.editor,
  (editor, previous) => {
    previous?.off("update", schedule);
    previous?.off("selectionUpdate", schedule);
    editor?.on("update", schedule);
    editor?.on("selectionUpdate", schedule);
    count();
  },
  { immediate: true },
);

watch(() => props.content, schedule);

onBeforeUnmount(() => {
  clearTimeout(timer);
  props.editor?.off("update", schedule);
  props.editor?.off("selectionUpdate", schedule);
});
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: 26px;
  padding: 0 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  background: var(--el-bg-color);
  font-size: 12px;
}

.status-path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-encoding,
.status-words {
  flex: none;
}

.status-words {
  cursor: pointer;
}

.status-words:hover {
  color: var(--el-text-color-primary);
}

.status-encoding.is-warning {
  color: var(--el-color-warning);
}

.status-notice {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--el-color-primary);
}
</style>

<template>
  <footer class="status-bar" :class="{ 'is-source-mode': sourceMode }" data-testid="status-bar">
    <!-- V-3（同 Typora）：左边是显示／隐藏侧边栏（侧栏关着是圆圈，开着是「<」）、源代码模式的开关 -->
    <ElTooltip v-if="!sourceMode" :content="t('status.toggleSidebar')" placement="top" :show-after="600">
      <span class="status-button status-sidebar" role="button" data-testid="status-sidebar" :aria-label="t('status.toggleSidebar')" @click="emit('toggleSidebar')">
        <svg v-if="sidebarVisible" class="status-icon-chevron" viewBox="0 0 8 14" aria-hidden="true"><polyline points="6.5,1.5 1.5,7 6.5,12.5" /></svg>
        <svg v-else class="status-icon-radio" viewBox="0 0 14 14" aria-hidden="true"><circle class="ring" cx="7" cy="7" r="5.6" /><circle class="dot" cx="7" cy="7" r="2.8" /></svg>
      </span>
    </ElTooltip>
    <ElTooltip :content="sourceMode ? t('status.exitSourceMode') : t('status.enterSourceMode')" placement="top" :show-after="600" :disabled="sourceMode">
      <span class="status-button status-source" role="button" data-testid="status-source" :aria-label="sourceMode ? t('status.exitSourceMode') : t('status.enterSourceMode')" @click="emit('toggleSourceMode')">
        <svg class="status-icon-code" viewBox="0 0 16 14" aria-hidden="true"><polyline points="5,3 1.5,7 5,11" /><polyline points="11,3 14.5,7 11,11" /><line x1="9.5" y1="1.5" x2="6.5" y2="12.5" /></svg>
        <span v-if="sourceMode" class="status-source-label">{{ t("status.exitSourceMode") }}</span>
      </span>
    </ElTooltip>
    <!-- 文件路径（Marko 的，Typora 没有）：鼠标移到状态栏上时才显示，平时同 Typora -->
    <span class="status-path" :title="path ?? ''">{{ path ?? t("status.notSaved") }}</span>
    <!-- F-12：自动重新载入这类提示，停几秒 -->
    <span v-if="notice" class="status-notice" data-testid="status-notice" role="status">{{ notice }}</span>
    <!-- F-18：识别不出编码时提示；不是 UTF-8 时显示编码 -->
    <span v-if="uncertainEncoding" class="status-encoding is-warning" data-testid="status-encoding">{{ t("status.uncertainEncoding") }}</span>
    <span v-else-if="encoding !== 'utf-8'" class="status-encoding" data-testid="status-encoding">{{ encoding.toUpperCase() }}</span>
    <!-- V-3：字数（源代码模式下不显示，同 Typora）；点了打开字数统计（V-4） -->
    <ElTooltip v-if="showWordCount && !sourceMode" :content="t('wordCount.title')" placement="top" :show-after="600">
      <span class="status-words" data-testid="word-count" role="button" @click="emit('openWordCount')"><span class="status-words-label">{{ words }}</span><svg class="status-words-expand" viewBox="0 0 12 10" aria-hidden="true"><polyline points="3.5,1.5 1,5 3.5,8.5" /><polyline points="8.5,1.5 11,5 8.5,8.5" /></svg></span>
    </ElTooltip>
  </footer>
</template>

<script setup lang="ts">
// 状态栏（V-3，样子同 Typora）：左边是侧边栏、源代码模式两个按钮；右边是字数，有选区时是选区的字数。
// 字数停止输入一会儿再算（大文档整篇统计要时间，X-3）
import { wordCounts } from "@marko/markdown";
import { toModel } from "@marko/editor";
import type { Editor } from "@tiptap/core";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { t } from "../i18n.ts";
import { selectionCounts, wordCountLabel, type WordCountMetric } from "../wordCounts.ts";

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
  sidebarVisible: boolean;
  sourceMode: boolean;
  /** 显示哪一项统计（V-4：在字数统计里点那一行切换） */
  metric: WordCountMetric;
  readingSpeed: number;
}>();
const emit = defineEmits<{ openWordCount: []; toggleSidebar: []; toggleSourceMode: [] }>();

/** 整篇的统计和选区的（显示的文字跟着界面语言、显示的项跟着设置） */
const counted = ref<{ words: number; chars: number; lines: number; minutes: number; selection: { words: number; chars: number; lines: number } | null } | null>(null);
const words = computed(() => {
  const value = counted.value;
  if (!value) return "";
  const metric = props.metric;
  const selected = value.selection ? (metric === "minutes" ? Math.round(value.selection.words / props.readingSpeed) : value.selection[metric]) : null;
  return wordCountLabel(metric, value[metric], selected);
});
let timer: ReturnType<typeof setTimeout> | undefined;

function count(): void {
  const editor = props.editor;
  if (!editor) return;
  const counts = wordCounts(toModel(editor.state.doc), props.content, { readingSpeed: props.readingSpeed, syntax: editor.storage.marko.syntax });
  counted.value = { ...counts, selection: selectionCounts(editor) };
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

watch(() => [props.content, props.readingSpeed], schedule);

onBeforeUnmount(() => {
  clearTimeout(timer);
  props.editor?.off("update", schedule);
  props.editor?.off("selectionUpdate", schedule);
});
</script>

<style scoped>
/* 尺寸、颜色同 Typora 的状态栏（Github 主题：footer 用 Segoe UI 12px，上边框 #ddd） */
.status-bar {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 31px;
  padding: 0 4px 0 0;
  border-top: 1px solid var(--app-status-border, #ddd);
  background: var(--md-background, #fff);
  color: var(--md-text, #333);
  font: 12px "Segoe UI", Arial, sans-serif;
  user-select: none;
}

.status-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 30px;
  min-width: 30px;
  opacity: 0.75;
  cursor: pointer;
}

.status-button:hover {
  opacity: 1;
}

.status-button svg {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.status-sidebar:hover {
  color: #555;
}

.status-icon-radio {
  width: 13px;
  height: 13px;
  stroke-width: 1.3;
}

.status-icon-radio .dot {
  fill: currentColor;
  stroke: none;
  visibility: hidden;
}

.status-sidebar:hover .status-icon-radio .dot {
  visibility: visible;
}

.status-icon-chevron {
  width: 8px;
  height: 14px;
  stroke-width: 1.6;
}

.status-source {
  padding: 0 8px;
}

.status-icon-code {
  width: 15px;
  height: 14px;
  stroke-width: 1.3;
}

/* 源代码模式里：按钮灰底，后面写「退出源代码模式」（同 Typora） */
.is-source-mode .status-source {
  margin-left: -2px;
  padding-left: 10px;
  background: var(--app-status-hover, #eee);
  opacity: 1;
}

.status-source-label {
  margin-left: 4px;
}

.status-path {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: 8px;
  overflow: hidden;
  color: var(--md-muted, #777);
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
}

.status-bar:hover .status-path {
  opacity: 1;
}

.status-notice {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: 8px;
  overflow: hidden;
  color: var(--el-color-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-encoding {
  flex: none;
  margin-left: 8px;
}

.status-encoding.is-warning {
  color: var(--el-color-warning);
}

.status-words {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 30px;
  margin-left: auto;
  padding: 0 0 0 12px;
  opacity: 0.75;
  cursor: pointer;
}

.status-words:hover {
  background: var(--app-status-hover, #eee);
  opacity: 1;
}

/* 字数后面的小箭头：鼠标移到状态栏上时出现（同 Typora） */
.status-words-expand {
  width: 13px;
  height: 11px;
  margin: 0 4px 0 3px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.2;
  opacity: 0;
  transition: opacity 0.3s ease-in-out;
}

.status-bar:hover .status-words-expand {
  opacity: 1;
}
</style>

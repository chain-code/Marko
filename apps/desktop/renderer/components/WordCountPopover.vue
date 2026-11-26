<template>
  <div v-if="visible" ref="root" class="word-count-popover" data-testid="word-count-panel" role="dialog" :aria-label="t('wordCount.title')">
    <div class="word-count-title">{{ selection ? t("wordCount.total") : t("wordCount.title") }}</div>
    <div class="word-count-divider" />
    <!-- 点一行，状态栏就改显示这一项（同 Typora） -->
    <table class="word-count-all">
      <tbody>
        <tr v-for="row in rows" :key="row.metric" :class="{ active: row.metric === metric }" :data-metric="row.metric" @click="emit('update:metric', row.metric)">
          <td class="word-count-number">{{ row.value }}</td>
          <td>{{ row.unit }}</td>
        </tr>
      </tbody>
    </table>
    <template v-if="selection">
      <div class="word-count-title word-count-selection-title">{{ t("wordCount.selection") }}</div>
      <div class="word-count-divider" />
      <table>
        <tbody>
          <tr>
            <td class="word-count-number">{{ selection.words }}</td>
            <td>{{ t("wordCount.words") }}</td>
          </tr>
          <tr>
            <td class="word-count-number">{{ selection.chars }}</td>
            <td>{{ t("wordCount.chars") }}</td>
          </tr>
        </tbody>
      </table>
    </template>
    <!-- Marko 的（Typora 没有）：段落数、光标所在的行和列 -->
    <div class="word-count-divider" />
    <table>
      <tbody>
        <tr>
          <td class="word-count-number">{{ paragraphs }}</td>
          <td>{{ t("wordCount.paragraphs") }}</td>
        </tr>
        <tr>
          <td class="word-count-number">{{ t("wordCount.cursorValue", { line: cursor.line, column: cursor.column }) }}</td>
          <td>{{ t("wordCount.cursor") }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
// 字数统计（V-4，同 Typora）：状态栏右上方的小弹窗——阅读时间、行数、词数、字符数，有选区时加选中部分；点一行状态栏改显示它。
// 开着时跟着编辑更新（停下 200ms 再算）；点别处、按 Esc 关掉
import { getMarkdownWithSelection, toModel } from "@marko/editor";
import { documentStats, wordCounts } from "@marko/markdown";
import type { Editor } from "@tiptap/core";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { t } from "../i18n.ts";
import { selectionCounts, type WordCountMetric } from "../wordCounts.ts";

const props = defineProps<{ visible: boolean; editor: Editor | null; content: string; readingSpeed: number; metric: WordCountMetric }>();
const emit = defineEmits<{ "update:visible": [visible: boolean]; "update:metric": [metric: WordCountMetric] }>();

const counts = ref({ words: 0, chars: 0, lines: 1, minutes: 0 });
const paragraphs = ref(0);
const selection = ref<{ words: number; chars: number } | null>(null);
const cursor = ref({ line: 1, column: 1 });
const root = ref<HTMLElement | null>(null);

const rows = computed(() => [
  { metric: "minutes" as const, value: counts.value.minutes || t("wordCount.lessThanOne"), unit: t("wordCount.minutes") },
  { metric: "lines" as const, value: counts.value.lines, unit: t("wordCount.lines") },
  { metric: "words" as const, value: counts.value.words, unit: t("wordCount.words") },
  { metric: "chars" as const, value: counts.value.chars, unit: t("wordCount.chars") },
]);

function count(): void {
  const editor = props.editor;
  if (!editor || !props.visible) return;
  const syntax = editor.storage.marko.syntax;
  const doc = toModel(editor.state.doc);
  counts.value = wordCounts(doc, props.content, { readingSpeed: props.readingSpeed, syntax });
  paragraphs.value = documentStats(doc, { syntax }).paragraphs;
  const { value, head } = getMarkdownWithSelection(editor);
  const text = value.replace(/^﻿/, "");
  const shift = value.length - text.length;
  const before = text.slice(0, head - shift);
  cursor.value = { line: before.split("\n").length, column: head - shift - before.lastIndexOf("\n") };
  selection.value = selectionCounts(editor);
}

let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(count, 200);
}

/** 点到弹窗和状态栏的字数以外的地方：关掉（状态栏的字数自己负责开关） */
function onPointerDown(event: PointerEvent): void {
  const target = event.target as Element | null;
  if (root.value?.contains(target) || target?.closest('[data-testid="word-count"]')) return;
  emit("update:visible", false);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape") emit("update:visible", false);
}

watch(
  () => props.editor,
  (editor, previous) => {
    previous?.off("update", schedule);
    previous?.off("selectionUpdate", schedule);
    editor?.on("update", schedule);
    editor?.on("selectionUpdate", schedule);
  },
  { immediate: true },
);

watch(() => [props.content, props.readingSpeed], schedule);

watch(
  () => props.visible,
  async (visible) => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    if (!visible) return;
    count();
    await nextTick();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(timer);
  props.editor?.off("update", schedule);
  props.editor?.off("selectionUpdate", schedule);
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("keydown", onKeyDown, true);
});
</script>

<style scoped>
/* 样子同 Typora 状态栏上的字数统计（dropdown-menu）：白底、圆角、很淡的阴影，数字右对齐 */
.word-count-popover {
  position: absolute;
  right: 4px;
  bottom: 32px;
  z-index: 10;
  min-width: 160px;
  padding: 8px 0;
  border-radius: 4px;
  background: var(--app-panel, #fff);
  box-shadow:
    rgba(15, 15, 15, 0.03) 0 0 0 1px,
    rgba(15, 15, 15, 0.04) 0 3px 6px 0,
    rgba(15, 15, 15, 0.05) 0 9px 24px 0;
  color: var(--md-text, #333);
  font: 14px "Segoe UI", Arial, sans-serif;
  user-select: none;
}

.word-count-title {
  padding: 2px 20px;
  font-size: 13px;
  line-height: 1.6;
  opacity: 0.7;
}

.word-count-selection-title {
  margin-top: 16px;
}

.word-count-divider {
  height: 0;
  margin: 4px 0;
  border-top: 1px solid var(--app-status-border, #e5e5e5);
  opacity: 0.4;
}

table {
  width: 100%;
  border-collapse: collapse;
}

td {
  padding: 0;
  font-size: 13.5px;
  line-height: 1.8;
  text-align: left;
}

td.word-count-number {
  padding: 0 20px;
  text-align: right;
  white-space: nowrap;
}

.word-count-all tr {
  cursor: default;
}

.word-count-all tr:hover {
  background: var(--app-status-hover, #eee);
}
</style>

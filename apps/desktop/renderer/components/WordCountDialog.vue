<template>
  <ElDialog :model-value="visible" class="marko-word-count" :title="t('wordCount.title')" width="420px" @update:model-value="(value: boolean) => emit('update:visible', value)">
    <ElDescriptions :column="1" border size="small" data-testid="word-count-panel">
      <ElDescriptionsItem :label="t('wordCount.words')">{{ stats.words }}</ElDescriptionsItem>
      <ElDescriptionsItem :label="t('wordCount.characters')">{{ stats.chars }}</ElDescriptionsItem>
      <ElDescriptionsItem :label="t('wordCount.paragraphs')">{{ stats.paragraphs }}</ElDescriptionsItem>
      <ElDescriptionsItem :label="t('wordCount.readingTime')">{{ t("wordCount.readingValue", { minutes: stats.readingMinutes, speed: readingSpeed }) }}</ElDescriptionsItem>
      <ElDescriptionsItem v-if="selection" :label="t('wordCount.selection')">{{
        t("wordCount.selectionValue", { words: selection.words, chars: selection.chars, lines: selection.lines })
      }}</ElDescriptionsItem>
      <ElDescriptionsItem :label="t('wordCount.cursor')">{{ t("wordCount.cursorValue", { line: cursor.line, column: cursor.column }) }}</ElDescriptionsItem>
    </ElDescriptions>
  </ElDialog>
</template>

<script setup lang="ts">
// 字数统计（V-4）：整篇的词数、字符数、段落数、阅读时间（S-4「阅读速度」），选区的词数、字符数、行数，光标所在的行和列。
// 开着时跟着编辑更新（停下 200ms 再算）
import { getMarkdownWithSelection, toModel } from "@marko/editor";
import { documentStats, type DocumentStats } from "@marko/markdown";
import type { Editor } from "@tiptap/core";
import { onBeforeUnmount, ref, watch } from "vue";
import { t } from "../i18n.ts";
import { selectionStats } from "../selectionStats.ts";

const props = defineProps<{ visible: boolean; editor: Editor | null; readingSpeed: number }>();
const emit = defineEmits<{ "update:visible": [visible: boolean] }>();

const stats = ref<DocumentStats>({ words: 0, chars: 0, paragraphs: 0, readingMinutes: 0 });
const selection = ref<{ words: number; chars: number; lines: number } | null>(null);
const cursor = ref({ line: 1, column: 1 });

function count(): void {
  const editor = props.editor;
  if (!editor || !props.visible) return;
  stats.value = documentStats(toModel(editor.state.doc), { readingSpeed: props.readingSpeed, syntax: editor.storage.marko.syntax });
  const { value, anchor, head } = getMarkdownWithSelection(editor);
  const text = value.replace(/^﻿/, "");
  const shift = value.length - text.length;
  const before = text.slice(0, head - shift);
  const lastBreak = before.lastIndexOf("\n");
  cursor.value = { line: before.split("\n").length, column: head - shift - lastBreak };
  // 选区同整篇按显示出来的文字算（标记、链接地址不算）
  selection.value = selectionStats(editor);
}

let timer: ReturnType<typeof setTimeout> | undefined;
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
  },
  { immediate: true },
);

watch(
  () => props.visible,
  (visible) => {
    if (visible) count();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearTimeout(timer);
  props.editor?.off("update", schedule);
  props.editor?.off("selectionUpdate", schedule);
});
</script>

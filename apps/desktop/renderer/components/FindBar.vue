<template>
  <div v-show="visible" ref="root" class="find-bar" data-testid="find-bar" @keydown="onKeydown">
    <div class="find-row">
      <ElInput
        ref="searchInput"
        v-model="search"
        size="small"
        :placeholder="t('find.placeholder')"
        class="find-input"
        :class="{ invalid: status.invalid }"
        data-testid="find-input"
        @keydown.enter.exact.prevent="next"
        @keydown.enter.shift.exact.prevent="previous"
      />
      <ElTooltip :content="t('common.caseSensitive')" placement="top" :show-after="400">
        <ElButton size="small" :type="caseSensitive ? 'primary' : 'default'" text bg :aria-label="t('common.caseSensitive')" @click="caseSensitive = !caseSensitive">Aa</ElButton>
      </ElTooltip>
      <ElTooltip :content="t('common.wholeWord')" placement="top" :show-after="400">
        <ElButton size="small" :type="wholeWord ? 'primary' : 'default'" text bg :aria-label="t('common.wholeWord')" @click="wholeWord = !wholeWord">ab</ElButton>
      </ElTooltip>
      <ElTooltip :content="t('common.regex')" placement="top" :show-after="400">
        <ElButton size="small" :type="regexp ? 'primary' : 'default'" text bg :aria-label="t('common.regex')" @click="regexp = !regexp">.*</ElButton>
      </ElTooltip>
      <span class="find-status" data-testid="find-status">{{ statusText }}</span>
      <ElButton size="small" text :aria-label="t('find.previous')" @click="previous">↑</ElButton>
      <ElButton size="small" text :aria-label="t('find.next')" @click="next">↓</ElButton>
      <ElButton size="small" text :aria-label="t('common.close')" @click="close">✕</ElButton>
    </div>
    <div v-if="mode === 'replace'" class="find-row">
      <ElInput v-model="replace" size="small" :placeholder="t('find.replaceWith')" class="find-input" data-testid="replace-input" @keydown.enter.exact.prevent="replaceNext" />
      <ElButton size="small" data-testid="replace-next" @click="replaceNext">{{ t("find.replace") }}</ElButton>
      <ElButton size="small" data-testid="replace-all" @click="replaceAll">{{ t("find.replaceAll") }}</ElButton>
    </div>
  </div>
</template>

<script setup lang="ts">
// 查找、替换（N-1、N-2）。条件交给编辑器（排版视图是 prosemirror-search，源码模式是 @codemirror/search）：
// 所有匹配高亮，「第 N 个，共 M 个」；边输入边跳到光标之后最近的匹配（同旧版）；回车下一个、Shift+回车上一个，
// F3 / Ctrl+G、Shift+F3 / Ctrl+Shift+G 同；Esc 关闭。关掉时只是藏起来，查找的文字和开关留着，下次打开还在
import { findStatusOf, type FindStatus } from "@marko/editor";
import type { Editor } from "@tiptap/core";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { t } from "../i18n.ts";

const props = defineProps<{
  editor: Editor | null;
  visible: boolean;
  mode: "find" | "replace";
  /** 文档的原文：换了一篇（打开了别的文件，编辑器整个换掉、没有事务）时靠它刷新「共 M 个」 */
  content: string;
}>();
const emit = defineEmits<{ close: [] }>();

const search = ref("");
const replace = ref("");
const caseSensitive = ref(false);
const wholeWord = ref(false);
const regexp = ref(false);
const status = ref<FindStatus>({ current: 0, total: 0, invalid: false });
const searchInput = ref<{ focus: () => void; select: () => void } | null>(null);

const statusText = computed(() => {
  if (!search.value) return "";
  if (status.value.invalid) return t("common.badRegex");
  if (!status.value.total) return t("common.notFound");
  return status.value.current ? t("find.position", { current: status.value.current, total: status.value.total }) : t("find.count", { total: status.value.total });
});

/** 关着时编辑器里没有查找条件，这里马上返回「共 0 个」 */
function refreshStatus(): void {
  if (props.editor) status.value = findStatusOf(props.editor);
}

/** 把条件交给编辑器；nearest：跳到光标之后最近的匹配（改了查找文字、开关时；改替换文字时不跳） */
function apply(nearest: boolean): void {
  const editor = props.editor;
  if (!editor) return;
  editor.commands.setFind({
    search: search.value,
    caseSensitive: caseSensitive.value,
    wholeWord: wholeWord.value,
    regexp: regexp.value,
    replace: replace.value,
  });
  if (nearest && search.value) editor.commands.findNearest();
  refreshStatus();
}

watch([search, caseSensitive, wholeWord, regexp], () => {
  if (props.visible) apply(true);
});
watch(replace, () => {
  if (props.visible) apply(false);
});
watch(() => props.content, refreshStatus);

function next(): void {
  props.editor?.commands.findNext();
  refreshStatus();
}

function previous(): void {
  props.editor?.commands.findPrevious();
  refreshStatus();
}

function replaceNext(): void {
  props.editor?.commands.replaceNext();
  refreshStatus();
}

function replaceAll(): void {
  props.editor?.commands.replaceAll();
  refreshStatus();
}

function close(): void {
  // 去掉高亮
  props.editor?.commands.setFind({ search: "" });
  emit("close");
  // 马上把焦点还给编辑器（Tiptap 的 focus 命令要等下一帧：这之间按的键还落在藏起来的查找框里）
  props.editor?.view.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (!props.visible) return;
  const primary = event.ctrlKey || event.metaKey;
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  } else if (event.key === "F3" || (primary && !event.altKey && event.key.toLowerCase() === "g")) {
    event.preventDefault();
    if (event.shiftKey) previous();
    else next();
  }
}

/**
 * 打开（Ctrl+F、Ctrl+H、查找栏关着时按 F3）：text 是选中的文字（有的话换上它），条件交给编辑器、跳到最近的匹配，
 * 焦点放进查找框、框里的字全选
 */
function open(text?: string): void {
  if (text && text !== search.value) search.value = text;
  apply(true);
  void nextTick(() => {
    searchInput.value?.focus();
    searchInput.value?.select();
  });
}

watch(
  () => props.editor,
  (editor, previous) => {
    previous?.off("transaction", refreshStatus);
    editor?.on("transaction", refreshStatus);
  },
  { immediate: true },
);

onBeforeUnmount(() => props.editor?.off("transaction", refreshStatus));

const root = ref<HTMLElement | null>(null);

/** 焦点在查找栏里 */
function hasFocus(): boolean {
  return !!root.value?.contains(document.activeElement);
}

defineExpose({ open, next, previous, hasFocus });
</script>

<style scoped>
.find-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
}

.find-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.find-row .el-button + .el-button {
  margin-left: 0;
}

.find-input {
  width: 260px;
}

.find-input.invalid :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}

.find-status {
  min-width: 110px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>

<template>
  <div v-show="visible" ref="root" class="find-bar" :class="{ 'is-replace': mode === 'replace' }" data-testid="find-bar" @keydown="onKeydown">
    <!-- 左边一列：「查找 ▾」点了切到替换；替换时第一行的空着，第二行是「替换 ▴」，点了回到查找（同 Typora） -->
    <div class="find-labels">
      <div class="find-row">
        <span class="find-type find-type-search" role="button" data-testid="find-switch-replace" @click="emit('switchMode', 'replace')">{{ t("find.search") }}<span class="find-caret">▾</span></span>
      </div>
      <div v-if="mode === 'replace'" class="find-row">
        <span class="find-type" role="button" data-testid="find-switch-find" @click="emit('switchMode', 'find')">{{ t("find.replace") }}<span class="find-caret">▴</span></span>
      </div>
    </div>
    <div class="find-inputs">
      <div class="find-row">
        <input
          ref="searchInput"
          v-model="search"
          class="find-input find-search-input"
          :class="{ invalid: status.invalid }"
          :placeholder="t('find.placeholder')"
          spellcheck="false"
          autocomplete="off"
          data-testid="find-input"
          @keydown.enter.exact.prevent="next"
          @keydown.enter.shift.exact.prevent="previous"
        />
        <!-- 输入框里右边的三个开关（同 Typora：区分大小写、查找整个单词、正则表达式） -->
        <ElTooltip :content="t('common.caseSensitive')" placement="bottom" :show-after="600">
          <span class="find-option find-option-case" :class="{ active: caseSensitive }" role="button" :aria-pressed="caseSensitive" :aria-label="t('common.caseSensitive')" @click="caseSensitive = !caseSensitive">Aa</span>
        </ElTooltip>
        <ElTooltip :content="t('common.wholeWord')" placement="bottom" :show-after="600">
          <span class="find-option find-option-word" :class="{ active: wholeWord }" role="button" :aria-pressed="wholeWord" :aria-label="t('common.wholeWord')" @click="wholeWord = !wholeWord">
            <svg viewBox="0 0 20 14" aria-hidden="true"><path d="M3 9.5 h14 M3 9.5 v-3 M17 9.5 v-3" /><path d="M6.5 7.5 v-4 M9 7.5 v-4 M11.5 7.5 v-4 M14 7.5 v-4" /></svg>
          </span>
        </ElTooltip>
        <ElTooltip :content="t('common.regex')" placement="bottom" :show-after="600">
          <span class="find-option find-option-regex" :class="{ active: regexp }" role="button" :aria-pressed="regexp" :aria-label="t('common.regex')" @click="regexp = !regexp">(.*)</span>
        </ElTooltip>
      </div>
      <div v-if="mode === 'replace'" class="find-row">
        <input v-model="replace" class="find-input" :placeholder="t('find.replaceWith')" spellcheck="false" autocomplete="off" data-testid="replace-input" @keydown.enter.exact.prevent="replaceNext" />
      </div>
    </div>
    <div class="find-actions">
      <div class="find-row">
        <span class="find-button" role="button" :aria-label="t('find.previous')" @click="previous"><svg viewBox="0 0 12 8" aria-hidden="true"><polyline points="1.5,6.5 6,2 10.5,6.5" /></svg></span>
        <span class="find-button" role="button" :aria-label="t('find.next')" @click="next"><svg viewBox="0 0 12 8" aria-hidden="true"><polyline points="1.5,1.5 6,6 10.5,1.5" /></svg></span>
        <span class="find-status" data-testid="find-status">{{ statusText }}</span>
        <span class="find-close" role="button" :aria-label="t('common.close')" @click="close"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" /></svg></span>
      </div>
      <div v-if="mode === 'replace'" class="find-row">
        <span class="find-button find-text-button" role="button" data-testid="replace-all" @click="replaceAll">{{ t("find.replaceAllShort") }}</span>
        <span class="find-button find-text-button" role="button" data-testid="replace-next" @click="replaceNext">{{ t("find.replace") }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 查找、替换（N-1、N-2，样子同 Typora）。条件交给编辑器（排版视图是 prosemirror-search，源码模式是 @codemirror/search）：
// 所有匹配高亮，「N / M」；边输入边跳到光标之后最近的匹配（同旧版）；回车下一个、Shift+回车上一个，
// F3 / Ctrl+G、Shift+F3 / Ctrl+Shift+G 同；Esc 关闭。关掉时只是藏起来，查找的文字和开关留着，下次打开还在
import { findStatusOf, type FindStatus } from "@marko/editor";
import type { Editor } from "@tiptap/core";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { t } from "../i18n.ts";

const props = defineProps<{
  editor: Editor | null;
  visible: boolean;
  mode: "find" | "replace";
  /** 文档的原文：换了一篇（打开了别的文件，编辑器整个换掉、没有事务）时靠它刷新「N / M」 */
  content: string;
}>();
const emit = defineEmits<{ close: []; switchMode: [mode: "find" | "replace"] }>();

const search = ref("");
const replace = ref("");
const caseSensitive = ref(false);
const wholeWord = ref(false);
const regexp = ref(false);
const status = ref<FindStatus>({ current: 0, total: 0, invalid: false });
const searchInput = ref<HTMLInputElement | null>(null);

/** 同 Typora：「1 / 4」；没有匹配、正则写错时「无结果」；没写查找的字时空着 */
const statusText = computed(() => {
  if (!search.value) return "";
  if (status.value.invalid || !status.value.total) return t("find.noResult");
  return t("find.position", { current: status.value.current || 0, total: status.value.total });
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
/* 样子同 Typora 的查找栏：编辑区顶上铺满、下面一圈淡阴影，12px 字；查找一行、替换两行 */
.find-bar {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: flex-start;
  box-sizing: border-box;
  padding: 5px 8px 3px 16px;
  background: var(--md-background, #fff);
  box-shadow:
    0 1px 0 rgba(12, 13, 14, 0.1),
    0 1px 3px rgba(12, 13, 14, 0.1),
    0 4px 20px rgba(12, 13, 14, 0.035),
    0 1px 1px rgba(12, 13, 14, 0.025);
  color: var(--md-text, #333);
  font-family: var(--md-font, "Open Sans", sans-serif);
  font-size: 12px;
  user-select: none;
}

.find-row {
  position: relative;
  display: flex;
  align-items: center;
  height: 26px;
  padding: 2px;
}

.find-labels {
  flex: none;
  width: 76px;
}

.find-labels .find-row {
  justify-content: flex-end;
}

.find-type {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 5px;
  cursor: pointer;
}

.find-caret {
  margin-left: 4px;
  font-size: 10px;
}

/* 替换时第一行的「查找 ▾」藏起来（同 Typora） */
.is-replace .find-type-search {
  visibility: hidden;
}

.find-inputs {
  flex: 1;
  min-width: 0;
}

.find-input {
  box-sizing: border-box;
  width: 100%;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--app-find-border, #ccc);
  border-radius: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

.find-input:focus {
  border-color: #66afe9;
  box-shadow:
    inset 0 1px 1px rgba(0, 0, 0, 0.075),
    0 0 8px rgba(102, 175, 233, 0.6);
}

/* 给右边的三个开关留出地方 */
.find-search-input {
  padding-right: 92px;
}

.find-input.invalid {
  border-color: var(--el-color-danger);
}

.find-option {
  position: absolute;
  top: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 22px;
  height: 17px;
  padding: 0 2px;
  border: 1px solid var(--app-find-option-border, #ddd);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}

.find-option.active {
  background: var(--app-find-option-active, #ddd);
  color: #000;
}

.find-option svg {
  width: 18px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.2;
}

.find-option-regex {
  right: 6px;
}

.find-option-word {
  right: 33px;
}

.find-option-case {
  right: 60px;
}

.find-actions {
  flex: none;
}

.find-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 26px;
  min-width: 28px;
  padding: 0 8px;
  cursor: pointer;
}

.find-button:hover {
  box-shadow: inset 0 3px 5px rgba(0, 0, 0, 0.125);
}

.find-button svg {
  width: 12px;
  height: 8px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
}

.find-text-button {
  padding: 0 15px 0 5px;
}

.find-status {
  min-width: 80px;
  text-align: right;
}

.find-close {
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 2px 0 14px;
  opacity: 0.8;
  cursor: pointer;
}

.find-close svg {
  width: 10px;
  height: 10px;
  stroke: currentColor;
  stroke-width: 1.6;
}
</style>

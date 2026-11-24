<template>
  <div v-if="target" class="marko-code-language" :style="{ top: `${target.top + 4}px`, left: `${target.right - 4}px` }" @mousedown.stop>
    <ElSelectV2
      :model-value="target.language"
      :options="options"
      filterable
      allow-create
      size="small"
      :placeholder="placeholder"
      :teleported="false"
      class="marko-code-language-select"
      @update:model-value="choose"
    />
  </div>
</template>

<script setup lang="ts">
// B-6：光标在代码块里时，右上角显示语言；点开可以搜索、选最近用过的；改语言只改围栏后面信息串的第一个词
import { languages } from "@codemirror/language-data";
import type { Editor } from "@tiptap/core";
import { ElSelectV2 } from "element-plus";
import "element-plus/es/components/select-v2/style/css";
import { computed, ref, toRef } from "vue";
import { blockBox, enclosingBlock, useEditorVersion } from "./editorState.ts";

const props = defineProps<{ editor: Editor | null; container: HTMLElement | null; placeholder?: string }>();

const version = useEditorVersion(toRef(props, "editor"), toRef(props, "container"));

/** 图表、公式的围栏不是代码（D-3、B-7），不显示 */
const NOT_CODE = /^(?:mermaid|flow|flowchart|sequence|math|latex|tex)$/i;
const CODE_BLOCKS = new Set(["codeBlock"]);

const RECENT_KEY = "marko.recentCodeLanguages";
const recent = ref<string[]>(readRecent());

function readRecent(): string[] {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function remember(language: string): void {
  recent.value = [language, ...recent.value.filter((item) => item !== language)].slice(0, 8);
  try {
    globalThis.localStorage?.setItem(RECENT_KEY, JSON.stringify(recent.value));
  } catch {
    // 存不了（隐私模式）就只在这次里记
  }
}

const ALL = languages.map((language) => ({ label: language.name, value: language.name.toLowerCase() }));

/** 最近用过的放前面 */
const options = computed(() => {
  const head = recent.value.map((value) => ALL.find((item) => item.value === value) ?? { label: value, value });
  const rest = ALL.filter((item) => !recent.value.includes(item.value));
  return [...head, ...rest];
});

const target = computed(() => {
  void version.value;
  const editor = props.editor;
  const container = props.container;
  if (!editor || !container || !editor.isEditable) return null;
  const block = enclosingBlock(editor, CODE_BLOCKS);
  if (!block || block.node.attrs.indented) return null;
  const info = String(block.node.attrs.info ?? "");
  const language = info.trim().split(/\s+/)[0] ?? "";
  if (NOT_CODE.test(language)) return null;
  const box = blockBox(editor, block.pos, container);
  if (!box) return null;
  return { pos: block.pos, info, language, top: box.top, right: box.left + box.width };
});

function choose(value: string): void {
  const editor = props.editor;
  const current = target.value;
  if (!editor || !current) return;
  const language = String(value ?? "").trim();
  // 只换第一个词，后面的属性（`js {.class}`）照留
  const rest = current.info.trim().replace(/^\S*/, "");
  const info = `${language}${rest}`.trim();
  const node = editor.state.doc.nodeAt(current.pos);
  if (!node) return;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(current.pos, undefined, { ...node.attrs, info }));
  if (language) remember(language.toLowerCase());
  editor.commands.focus();
}
</script>

<style>
.marko-code-language {
  position: absolute;
  z-index: 3;
  transform: translateX(-100%);
  width: 140px;
}
</style>

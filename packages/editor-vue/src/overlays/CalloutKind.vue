<template>
  <ElDropdown
    class="marko-callout-kind"
    :virtual-ref="anchor ?? undefined"
    virtual-triggering
    trigger="click"
    placement="bottom-start"
    :teleported="true"
    @command="choose"
  >
    <span />
    <template #dropdown>
      <ElDropdownMenu data-testid="callout-kinds">
        <ElDropdownItem v-for="kind in KINDS" :key="kind" :command="kind" :class="{ 'is-current': kind === current }">
          <span class="md-alert-text" :class="`md-alert-text-${kind}`">
            <span class="marko-callout-icon" v-html="ALERT_ICONS[kind]" />
            {{ ALERT_TITLES[kind] }}
          </span>
        </ElDropdownItem>
      </ElDropdownMenu>
    </template>
  </ElDropdown>
</template>

<script setup lang="ts">
// B-13：单击 Callout 的标题弹出种类选择（Element Plus 的下拉菜单，贴着标题）；选了别的种类就换（光标放进这个 Callout 执行 callout 命令），
// 选的是现在的种类不动（命令遇到同一种会去掉 Callout）。
// 按下鼠标时把标题设成下拉菜单的触发元素（Element Plus 给它挂上单击的处理），松开后的单击打开菜单
import { ALERT_ICONS, ALERT_TITLES } from "@marko/render";
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { ElDropdown, ElDropdownItem, ElDropdownMenu } from "element-plus";
import "element-plus/es/components/dropdown/style/css";
import { ref, shallowRef, watch } from "vue";

const props = defineProps<{ editor: Editor | null; container: HTMLElement | null }>();

const KINDS = ["note", "tip", "important", "warning", "caution"] as const;

const anchor = shallowRef<HTMLElement | null>(null);
const current = ref<string>("");
/** 这个 Callout 在文档里的位置（选了以后放光标用） */
let alertPos: number | null = null;

function alertAt(editor: Editor, element: HTMLElement): { pos: number; kind: string } | null {
  const block = element.closest(".md-alert");
  if (!block) return null;
  let inside: number;
  try {
    inside = editor.view.posAtDOM(block, 0);
  } catch {
    return null;
  }
  const $pos = editor.state.doc.resolve(Math.min(inside, editor.state.doc.content.size));
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === "alert") return { pos: $pos.before(depth), kind: String(node.attrs.kind ?? "note") };
  }
  return null;
}

function onMouseDown(event: MouseEvent): void {
  const editor = props.editor;
  const title = (event.target as Element | null)?.closest?.(".md-alert-title") as HTMLElement | null;
  if (!editor || !title || !editor.isEditable || event.button !== 0) return;
  const found = alertAt(editor, title);
  if (!found) return;
  // 标题是装饰：不让编辑器把光标挪过去
  event.preventDefault();
  event.stopPropagation();
  alertPos = found.pos;
  current.value = found.kind;
  anchor.value = title;
}

function choose(kind: string): void {
  const editor = props.editor;
  const pos = alertPos;
  if (!editor || pos === null || kind === current.value) return;
  const node = editor.state.doc.nodeAt(pos);
  if (node?.type.name !== "alert") return;
  // 光标放进这个 Callout 的第一个文字块里，命令只换种类
  const selection = TextSelection.near(editor.state.doc.resolve(pos + 1));
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.chain().focus().callout(kind.toUpperCase()).run();
}

watch(
  () => props.container,
  (element, previous) => {
    previous?.removeEventListener("mousedown", onMouseDown, true);
    element?.addEventListener("mousedown", onMouseDown, true);
  },
  { immediate: true },
);
</script>

<style>
/* 触发元素是 Callout 的标题（virtual-ref），下拉菜单自己的那个不占地方 */
.marko-callout-kind.el-dropdown {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.marko-callout-icon svg {
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  fill: currentColor;
}

[data-testid="callout-kinds"] .is-current {
  font-weight: 600;
}
</style>

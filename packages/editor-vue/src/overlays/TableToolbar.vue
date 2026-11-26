<template>
  <div
    v-if="target"
    class="marko-table-toolbar"
    :style="{ top: `${target.top}px`, left: `${target.left}px`, width: `${target.width}px` }"
    @mousedown.prevent.stop
  >
    <ElTooltip v-for="item in ALIGNS" :key="item.align" :content="texts.table[item.label]" placement="bottom" :show-after="400" :teleported="false">
      <button
        type="button"
        class="marko-table-button marko-table-align"
        :class="{ 'is-active': target.align === item.align }"
        :aria-label="texts.table[item.label]"
        :aria-pressed="target.align === item.align"
        @click="run(item.command)"
      >
        <svg viewBox="0 0 12 12" aria-hidden="true"><path :d="item.icon" /></svg>
      </button>
    </ElTooltip>
    <ElDropdown class="marko-table-more-dropdown" trigger="click" placement="bottom-end" :teleported="false" @command="run" @visible-change="moreOpen = $event">
      <button type="button" class="marko-table-button marko-table-more" :class="{ 'is-open': moreOpen }" :aria-label="texts.table.more">
        <span class="marko-table-more-label">{{ texts.table.more }}</span>
        <svg class="marko-table-dots" viewBox="0 0 4 12" aria-hidden="true"><circle cx="2" cy="2" r="1.5" /><circle cx="2" cy="6.2" r="1.5" /><circle cx="2" cy="10.4" r="1.5" /></svg>
      </button>
      <template #dropdown>
        <ElDropdownMenu class="marko-table-menu">
          <ElDropdownItem v-for="item in MORE" :key="item.command" :command="item.command" :divided="item.divided">
            <span>{{ texts.table[item.label] }}</span>
            <span v-if="item.keys" class="marko-table-menu-keys">{{ item.keys[isMac ? 1 : 0] }}</span>
          </ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
    <ElTooltip :content="texts.table.deleteTable" placement="bottom" :show-after="400" :teleported="false">
      <button type="button" class="marko-table-button marko-table-delete" :aria-label="texts.table.deleteTable" @click="run('deleteTable')">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M0.6 2.6H11.4M4.4 2.4V1H7.6V2.4M1.9 3.4V10.2Q1.9 11.4 3.1 11.4H8.9Q10.1 11.4 10.1 10.2V3.4M4.9 4.6V9.6M7.1 4.6V9.6" /></svg>
      </button>
    </ElTooltip>
  </div>
</template>

<script setup lang="ts">
// T-4、T-5：光标在表格里时，表格上方显示工具条，样子同 Typora：左边是对齐（当前列的对齐按下），
// 右边是「更多操作」（插入、移动、删除行列……）和删除表格。命令都是 @marko/editor 的。
// 图标照 Typora 的样子手画（Element Plus 的图标里没有对齐、竖三点；Typora 的图标字体没有许可证，不能拿来用）
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { ElDropdown, ElDropdownItem, ElDropdownMenu, ElTooltip } from "element-plus";
import "element-plus/es/components/dropdown/style/css";
import "element-plus/es/components/tooltip/style/css";
import { computed, ref, toRef, watch } from "vue";
import { useTexts } from "../texts.ts";
import type { MarkoEditorTexts } from "../types.ts";
import { blockBox, enclosingBlock, useEditorVersion } from "./editorState.ts";

const props = defineProps<{ editor: Editor | null; container: HTMLElement | null }>();

const version = useEditorVersion(toRef(props, "editor"), toRef(props, "container"));

const texts = useTexts();

type TableText = keyof MarkoEditorTexts["table"];

/** 三条横线：左、右对齐中间那条短，居中三条一样长（同 Typora） */
const ALIGNS: Array<{ align: string; command: string; label: TableText; icon: string }> = [
  { align: "left", command: "alignLeft", label: "alignLeft", icon: "M0.7 2H11.3M0.7 6.2H7.1M0.7 10.4H11.3" },
  { align: "center", command: "alignCenter", label: "alignCenter", icon: "M0.7 2H11.3M0.7 6.2H11.3M0.7 10.4H11.3" },
  { align: "right", command: "alignRight", label: "alignRight", icon: "M0.7 2H11.3M4.9 6.2H11.3M0.7 10.4H11.3" },
];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * 「更多操作」的菜单，项和分组同 Typora；keys 是项后面写的快捷键（Windows、Linux 写法 / macOS 写法），这几个快捷键不能改（S-12）。
 * 选择行、列、表格是 Marko 多的，放在删除表格前面（Typora 那里是复制表格、格式化表格源码，没做）
 */
const MORE: Array<{ command: string; label: TableText; divided: boolean; keys?: [string, string] }> = [
  { command: "addTableRowAbove", label: "addRowAbove", divided: false },
  { command: "addTableRowBelow", label: "addRowBelow", divided: false, keys: ["Ctrl+Enter", "⌘↩"] },
  { command: "addTableColumnLeft", label: "addColumnLeft", divided: false },
  { command: "addTableColumnRight", label: "addColumnRight", divided: false },
  { command: "moveTableRowUp", label: "moveRowUp", divided: true, keys: ["Alt+↑", "⌥↑"] },
  { command: "moveTableRowDown", label: "moveRowDown", divided: false, keys: ["Alt+↓", "⌥↓"] },
  { command: "moveTableColumnLeft", label: "moveColumnLeft", divided: false, keys: ["Alt+←", "⌥←"] },
  { command: "moveTableColumnRight", label: "moveColumnRight", divided: false, keys: ["Alt+→", "⌥→"] },
  { command: "deleteTableRow", label: "deleteRow", divided: true, keys: ["Ctrl+Shift+⌫", "⇧⌘⌫"] },
  { command: "deleteTableColumn", label: "deleteColumn", divided: false },
  { command: "selectTableRow", label: "selectRow", divided: true },
  { command: "selectTableColumn", label: "selectColumn", divided: false },
  { command: "selectTable", label: "selectTable", divided: false },
  { command: "deleteTable", label: "deleteTable", divided: true },
];

const TABLES = new Set(["table"]);

/** 按钮高 22px，下沿离表格上边 1px（同 Typora）：落在表格上方的外边距里 */
const ABOVE_TABLE = 23;

/** 「更多操作」的菜单开着时，按钮上的字一直显示（同 Typora） */
const moreOpen = ref(false);

/** 选区所在的单元格是第几列，这一列的对齐（没写对齐是 null） */
function columnAlign(editor: Editor, table: PMNode): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== "tableRow") continue;
    const align = (table.attrs.align as Array<string | null> | null) ?? [];
    return align[$from.index(depth)] ?? null;
  }
  return null;
}

const target = computed(() => {
  void version.value;
  const editor = props.editor;
  const container = props.container;
  if (!editor || !container || !editor.isEditable) return null;
  const block = enclosingBlock(editor, TABLES);
  if (!block) return null;
  const box = blockBox(editor, block.pos, container);
  if (!box) return null;
  // 同 Typora：左边比表格多出 4px，右边多出 6px
  return { top: Math.max(0, box.top - ABOVE_TABLE), left: box.left - 4, width: box.width + 10, align: columnAlign(editor, block.node) };
});

// 工具条跟着表格没了（菜单里点了删除表格）时，菜单来不及报「关了」：这里复位，免得下次出来字一直显示
watch(
  () => target.value === null,
  (gone) => {
    if (gone) moreOpen.value = false;
  },
);

function run(command: string): void {
  const editor = props.editor;
  if (!editor) return;
  const commands = editor.commands as unknown as Record<string, () => boolean>;
  commands[command]?.();
  editor.commands.focus();
}
</script>

<style>
/*
 * 同 Typora：透明底、没有边框。只有按钮和「更多操作」（连同它的菜单）接鼠标，
 * 空白处的点击落到底下的文档上（工具条下沿压着上一个块 4px 左右）
 */
.marko-table-toolbar {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 22px;
  color: var(--md-text, #333);
  pointer-events: none;
}

.marko-table-button,
.marko-table-more-dropdown {
  pointer-events: auto;
}

/* 按钮 24×22、直角，图标 12px；鼠标移上去、按下时浅灰底加灰边框（白底上是 Typora 的 #adadad） */
.marko-table-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 24px;
  height: 22px;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.marko-table-button:hover,
.marko-table-button.is-active,
.marko-table-button.is-open {
  border-color: color-mix(in srgb, currentColor 40%, transparent);
  background: var(--app-item-hover, rgba(229, 229, 229, 0.59));
}

.marko-table-button.is-active {
  box-shadow: inset 0 3px 5px rgba(0, 0, 0, 0.125);
}

.marko-table-button svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
}

/* 三个对齐按钮挨着、边框叠 3px（同 Typora 的按钮组）；不传送的提示框会插在按钮中间，所以用 ~ 不用 + */
.marko-table-align ~ .marko-table-align {
  margin-left: -3px;
}

.marko-table-align:hover,
.marko-table-align.is-active {
  position: relative;
}

/* Element Plus 的下拉框自己带颜色，改回跟着工具条 */
.marko-table-more-dropdown {
  margin-left: auto;
  color: inherit;
}

/* 「更多操作」：没有边框，平时只有竖三点（连左边的空一共 24px），鼠标移上去、菜单开着时左边显出字 */
.marko-table-more.marko-table-button {
  width: auto;
  padding: 0 4px 0 8px;
  border: 0;
}

.marko-table-more-label {
  display: none;
  line-height: 1;
  white-space: nowrap;
}

.marko-table-more:hover .marko-table-more-label,
.marko-table-more.is-open .marko-table-more-label {
  display: inline;
}

.marko-table-more .marko-table-dots {
  width: 4px;
  margin-left: 8px;
  fill: currentColor;
  stroke: none;
}

.marko-table-delete svg {
  stroke-width: 1.2;
  stroke-linecap: butt;
}

/* 菜单项后面的快捷键靠右、浅色 */
.marko-table-menu .el-dropdown-menu__item {
  min-width: 180px;
}

.marko-table-menu-keys {
  margin-left: auto;
  padding-left: 24px;
  color: var(--el-text-color-secondary, #909399);
  font-size: 12px;
}
</style>

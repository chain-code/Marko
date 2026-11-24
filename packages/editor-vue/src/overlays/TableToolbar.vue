<template>
  <div
    v-if="target"
    class="marko-table-toolbar"
    :style="{ top: `${target.top}px`, left: `${target.left}px` }"
    @mousedown.prevent.stop
  >
    <template v-for="(group, index) in GROUPS" :key="index">
      <span v-if="index" class="marko-table-toolbar-divider" />
      <ElTooltip v-for="item in group" :key="item.command" :content="texts.table[item.label]" placement="top" :show-after="400" :teleported="false">
        <ElButton text size="small" :aria-label="texts.table[item.label]" @click="run(item.command)">{{ item.icon ?? (item.short ? texts.table[item.short] : "") }}</ElButton>
      </ElTooltip>
    </template>
    <ElDropdown trigger="click" :teleported="false" @command="run">
      <ElButton text size="small" :aria-label="texts.table.more">⋯</ElButton>
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem v-for="item in MORE" :key="item.command" :command="item.command" :divided="item.divided">{{ texts.table[item.label] }}</ElDropdownItem>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
  </div>
</template>

<script setup lang="ts">
// T-4、T-5：光标在表格里时，表格上方显示工具条：对齐、插入和删除行列、删除表格（命令都是 @marko/editor 的）
import type { Editor } from "@tiptap/core";
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu, ElTooltip } from "element-plus";
import "element-plus/es/components/button/style/css";
import "element-plus/es/components/dropdown/style/css";
import "element-plus/es/components/tooltip/style/css";
import { computed, toRef } from "vue";
import { useTexts } from "../texts.ts";
import type { MarkoEditorTexts } from "../types.ts";
import { blockBox, enclosingBlock, useEditorVersion } from "./editorState.ts";

const props = defineProps<{ editor: Editor | null; container: HTMLElement | null }>();

const version = useEditorVersion(toRef(props, "editor"), toRef(props, "container"));

const texts = useTexts();

type TableText = keyof MarkoEditorTexts["table"];

/** label：提示文字（texts.table 里的哪一条）；icon 是按钮上的符号，没有时按钮上写 short 那一条 */
const GROUPS: Array<Array<{ command: string; label: TableText; icon?: string; short?: TableText }>> = [
  [
    { command: "alignLeft", label: "alignLeft", icon: "⇤" },
    { command: "alignCenter", label: "alignCenter", icon: "↔" },
    { command: "alignRight", label: "alignRight", icon: "⇥" },
  ],
  [
    { command: "addTableRowAbove", label: "addRowAbove", icon: "↥" },
    { command: "addTableRowBelow", label: "addRowBelow", icon: "↧" },
    { command: "addTableColumnLeft", label: "addColumnLeft", icon: "⇠" },
    { command: "addTableColumnRight", label: "addColumnRight", icon: "⇢" },
  ],
  [
    { command: "deleteTableRow", label: "deleteRow", short: "deleteRowShort" },
    { command: "deleteTableColumn", label: "deleteColumn", short: "deleteColumnShort" },
  ],
];

const MORE: Array<{ command: string; label: TableText; divided: boolean }> = [
  { command: "moveTableRowUp", label: "moveRowUp", divided: false },
  { command: "moveTableRowDown", label: "moveRowDown", divided: false },
  { command: "moveTableColumnLeft", label: "moveColumnLeft", divided: false },
  { command: "moveTableColumnRight", label: "moveColumnRight", divided: false },
  { command: "selectTableRow", label: "selectRow", divided: true },
  { command: "selectTableColumn", label: "selectColumn", divided: false },
  { command: "selectTable", label: "selectTable", divided: false },
  { command: "deleteTable", label: "deleteTable", divided: true },
];

const TABLES = new Set(["table"]);

/**
 * 工具条的高度。同 Typora：放在表格上方的外边距里（1.2em），不挤开文档；下沿盖住表格上边 6px（表头单元格的内边距），
 * 默认字号下整个落在外边距里，不盖上一个块
 */
const HEIGHT = 24;
const OVER_TABLE = 6;

const target = computed(() => {
  void version.value;
  const editor = props.editor;
  const container = props.container;
  if (!editor || !container || !editor.isEditable) return null;
  const block = enclosingBlock(editor, TABLES);
  if (!block) return null;
  const box = blockBox(editor, block.pos, container);
  if (!box) return null;
  return { top: Math.max(0, box.top - HEIGHT + OVER_TABLE), left: box.left };
});

function run(command: string): void {
  const editor = props.editor;
  if (!editor) return;
  const commands = editor.commands as unknown as Record<string, () => boolean>;
  commands[command]?.();
  editor.commands.focus();
}
</script>

<style>
.marko-table-toolbar {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 1px;
  box-sizing: border-box;
  height: 24px;
  padding: 0 2px;
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 6px;
  background: var(--el-bg-color-overlay, #fff);
  box-shadow: var(--el-box-shadow-lighter, 0 2px 8px rgba(0, 0, 0, 0.08));
}

.marko-table-toolbar .el-button {
  height: 22px;
  padding: 0 6px;
}

.marko-table-toolbar .el-button + .el-button {
  margin-left: 0;
}

.marko-table-toolbar-divider {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--el-border-color, #dcdfe6);
}
</style>

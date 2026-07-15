<template>
  <div
    ref="rootRef"
    class="visual-table-editor"
    :class="{ active: focusedWithin }"
    tabindex="-1"
    @mousedown.capture="activateTable"
    @focusin="activateTable"
    @focusout="handleFocusOut"
  >
    <div v-if="focusedWithin" class="table-tools" role="toolbar" aria-label="表格工具">
      <span class="tool-group table-primary-tools">
        <button type="button" title="表格" @click="menuVisible = !menuVisible"><Table2 /></button>
        <button type="button" title="下方插入行" @click="insertRow('below')"><Rows3 /><Plus /></button>
        <button type="button" title="右侧插入列" @click="insertColumn('right')"><Columns3 /><Plus /></button>
        <button type="button" title="左对齐" :class="{ selected: activeAlignment === 'left' }" @click="alignColumn('left')"><AlignLeft /></button>
        <button type="button" title="居中对齐" :class="{ selected: activeAlignment === 'center' }" @click="alignColumn('center')"><AlignCenter /></button>
        <button type="button" title="右对齐" :class="{ selected: activeAlignment === 'right' }" @click="alignColumn('right')"><AlignRight /></button>
      </span>
      <span class="tool-group table-danger-tools">
        <button type="button" title="更多表格操作" @click="menuVisible = !menuVisible"><MoreVertical /></button>
        <button type="button" title="删除表格" @click="emit('delete')"><Trash2 /></button>
      </span>

      <div v-if="menuVisible" class="table-more-menu" role="menu" @click.stop>
        <button type="button" role="menuitem" @click="insertRow('above')">上方插入行</button>
        <button type="button" role="menuitem" @click="insertRow('below')">下方插入行</button>
        <button type="button" role="menuitem" @click="insertColumn('left')">左侧插入列</button>
        <button type="button" role="menuitem" @click="insertColumn('right')">右侧插入列</button>
        <span class="menu-separator" />
        <button type="button" role="menuitem" @click="moveRow('up')">上移当前行</button>
        <button type="button" role="menuitem" @click="moveRow('down')">下移当前行</button>
        <button type="button" role="menuitem" @click="moveColumn('left')">左移当前列</button>
        <button type="button" role="menuitem" @click="moveColumn('right')">右移当前列</button>
        <span class="menu-separator" />
        <button type="button" role="menuitem" :disabled="model.rows.length <= 1" @click="removeRow">删除当前行</button>
        <button type="button" role="menuitem" :disabled="model.headers.length <= 2" @click="removeColumn">删除当前列</button>
      </div>
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th
              v-for="(cell, column) in model.headers"
              :key="`header-${column}`"
              :style="{ textAlign: model.alignments[column] }"
              :class="{ 'table-part-selected': isSelectedPart(0, column) }"
              :aria-selected="isSelectedPart(0, column)"
              @mousedown="handleCellMouseDown(0, column, $event)"
              @click="handleCellClick(0, column, $event)"
            >
              <textarea
                v-show="isActiveCell(0, column)"
                :data-table-row="0"
                :data-table-column="column"
                :value="cell"
                rows="1"
                aria-label="表头单元格"
                @input="updateCell(0, column, $event)"
                @keydown="handleCellKeydown(0, column, $event)"
                @paste="handleCellPaste(0, column, $event)"
                @select="captureCellSelection(0, column, $event)"
                @blur="handleCellBlur(0, column, $event)"
              />
              <div v-show="!isActiveCell(0, column)" class="cell-rendered" v-html="renderCell(cell)" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in model.rows" :key="`row-${rowIndex}`">
            <td
              v-for="(cell, column) in row"
              :key="`cell-${rowIndex}-${column}`"
              :style="{ textAlign: model.alignments[column] }"
              :class="{ 'table-part-selected': isSelectedPart(rowIndex + 1, column) }"
              :aria-selected="isSelectedPart(rowIndex + 1, column)"
              @mousedown="handleCellMouseDown(rowIndex + 1, column, $event)"
              @click="handleCellClick(rowIndex + 1, column, $event)"
            >
              <textarea
                v-show="isActiveCell(rowIndex + 1, column)"
                :data-table-row="rowIndex + 1"
                :data-table-column="column"
                :value="cell"
                rows="1"
                aria-label="表格单元格"
                @input="updateCell(rowIndex + 1, column, $event)"
                @keydown="handleCellKeydown(rowIndex + 1, column, $event)"
                @paste="handleCellPaste(rowIndex + 1, column, $event)"
                @select="captureCellSelection(rowIndex + 1, column, $event)"
                @blur="handleCellBlur(rowIndex + 1, column, $event)"
              />
              <div v-show="!isActiveCell(rowIndex + 1, column)" class="cell-rendered" v-html="renderCell(cell)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Columns3,
  MoreVertical,
  Plus,
  Rows3,
  Table2,
  Trash2,
} from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { renderMarkdown } from "@/utils/markdown";
import {
  clearMarkdownFormatting,
  getPlainTextFromMarkdownSelection,
} from "@/utils/editorCommands";
import { findMarkdownLinkAtCursor } from "@/utils/markdownLinks";
import { shouldOpenPreviewLink } from "@/utils/previewLinks";
import { getKeyboardShortcutPlatform, resolveEditorShortcut } from "@/utils/keyboardShortcuts";
import {
  alignVisualTableColumn,
  deleteVisualTableColumn,
  deleteVisualTableRow,
  insertVisualTableColumn,
  insertVisualTableRow,
  moveVisualTableColumn,
  moveVisualTableRow,
  parseVisualTable,
  resizeVisualTable,
  serializeVisualTable,
  updateVisualTableCell,
  type TableAlignment,
  type VisualTableModel,
} from "@/utils/visualTable";
import type { EditorCommand, EditorSettings, OutlineItem } from "@/types";

type VisualTableCommandResult = "handled" | "unsupported";
type TableSelectionScope = "text" | "cell" | "row" | "column" | "table";

interface SavedCellSelection {
  row: number;
  column: number;
  start: number;
  end: number;
  scope: TableSelectionScope;
}

const props = defineProps<{
  source: string;
  documentSource: string;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
}>();

const emit = defineEmits<{
  update: [value: string, history: "input" | "command", inputGroup?: string];
  delete: [];
  focus: [];
  blur: [];
  command: [command: "undo" | "redo"];
  editorCommand: [command: EditorCommand];
  shortcut: [action: "save" | "saveAs" | "open"];
  selection: [text: string];
  openLink: [href: string];
  escape: [];
}>();

const rootRef = ref<HTMLElement | null>(null);
const focusedWithin = ref(false);
const menuVisible = ref(false);
const activeCell = ref({ row: 0, column: 0 });
const selectionScope = ref<TableSelectionScope>("text");
const savedSelection = ref<SavedCellSelection>({ row: 0, column: 0, start: 0, end: 0, scope: "text" });
let inputSession = 0;
let mounted = true;

const parsedModel = computed(() => parseVisualTable(props.source));
const model = computed(() => {
  const parsed = parsedModel.value ?? emptyTable();
  return parsed.rows.length > 0 ? parsed : resizeVisualTable(parsed, 1, parsed.headers.length);
});
const activeAlignment = computed(() => model.value.alignments[activeCell.value.column] ?? "left");

onMounted(() => {
  document.addEventListener("mousedown", handleDocumentMouseDown);
  document.addEventListener("focusin", handleDocumentFocusIn);
});

onBeforeUnmount(() => {
  mounted = false;
  document.removeEventListener("mousedown", handleDocumentMouseDown);
  document.removeEventListener("focusin", handleDocumentFocusIn);
});

watch(
  () => [model.value.rows.length, model.value.headers.length] as const,
  ([rowCount, columnCount]) => {
    const row = Math.max(0, Math.min(activeCell.value.row, rowCount));
    const column = Math.max(0, Math.min(activeCell.value.column, columnCount - 1));
    if (row === activeCell.value.row && column === activeCell.value.column) return;
    setActiveCell(row, column);
    if (focusedWithin.value) void focusCell(row, column);
  },
);

function handleCellMouseDown(row: number, column: number, event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("textarea")) return;
  const anchor = target?.closest<HTMLAnchorElement>("a[href]");
  if (anchor) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  selectCell(row, column);
}

function handleCellClick(row: number, column: number, event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return;
  event.preventDefault();
  event.stopPropagation();
  if (shouldOpenPreviewLink(event)) {
    emit("openLink", anchor.getAttribute("href") ?? "");
  } else {
    selectCell(row, column);
  }
}

function activateTable() {
  focusedWithin.value = true;
  emit("focus");
}

function handleDocumentMouseDown(event: MouseEvent) {
  const target = event.target;
  if (!focusedWithin.value || !(target instanceof Node) || rootRef.value?.contains(target)) return;
  if (isToolbarTarget(target)) return;
  deactivateTable();
}

function handleDocumentFocusIn(event: FocusEvent) {
  const target = event.target;
  if (!focusedWithin.value || !(target instanceof Node) || rootRef.value?.contains(target)) return;
  if (isToolbarTarget(target)) return;
  deactivateTable();
}

function selectCell(row: number, column: number) {
  setActiveCell(row, column);
  selectionScope.value = "text";
  focusedWithin.value = true;
  emit("selection", getCell(model.value, row, column));
  void focusCell(row, column, false);
}

function isActiveCell(row: number, column: number) {
  return focusedWithin.value && activeCell.value.row === row && activeCell.value.column === column;
}

function isSelectedPart(row: number, column: number): boolean {
  if (!focusedWithin.value) return false;
  if (selectionScope.value === "table") return true;
  if (selectionScope.value === "row") return row === activeCell.value.row;
  if (selectionScope.value === "column") return column === activeCell.value.column;
  if (selectionScope.value === "cell") {
    return row === activeCell.value.row && column === activeCell.value.column;
  }
  return false;
}

function setActiveCell(row: number, column: number) {
  if (activeCell.value.row !== row || activeCell.value.column !== column) inputSession += 1;
  activeCell.value = { row, column };
  const value = getCell(model.value, row, column);
  savedSelection.value = { row, column, start: value.length, end: value.length, scope: "text" };
}

function captureCellSelection(row: number, column: number, event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  const scope = selectionScope.value === "cell"
    && textarea.selectionStart === 0
    && textarea.selectionEnd === textarea.value.length
    ? "cell"
    : "text";
  selectionScope.value = scope;
  savedSelection.value = {
    row,
    column,
    start: textarea.selectionStart,
    end: textarea.selectionEnd,
    scope,
  };
  emit("selection", textarea.value.slice(textarea.selectionStart, textarea.selectionEnd));
}

function handleCellBlur(row: number, column: number, event: FocusEvent) {
  captureCellSelection(row, column, event);
  inputSession += 1;
}

function updateCell(row: number, column: number, event: Event) {
  const textarea = event.target as HTMLTextAreaElement;
  commit(updateVisualTableCell(model.value, row, column, textarea.value), "input", `${row}:${column}:${inputSession}`);
  resizeCell(textarea);
  captureCellSelection(row, column, event);
}

function handleCellKeydown(row: number, column: number, event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  captureCellSelection(row, column, event);
  const shortcut = resolveEditorShortcut(event, getKeyboardShortcutPlatform());
  if (shortcut) {
    event.preventDefault();
    if (shortcut.type === "command") {
      if (shortcut.command === "undo" || shortcut.command === "redo") {
        emit("command", shortcut.command);
      } else {
        emit("editorCommand", shortcut.command);
      }
    } else {
      emit("shortcut", shortcut.type);
    }
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    deactivateTable();
    (event.target as HTMLTextAreaElement).blur();
    emit("escape");
    return;
  }
  if (event.key !== "Tab") return;

  event.preventDefault();
  const direction = event.shiftKey ? -1 : 1;
  const columnCount = model.value.headers.length;
  const flatIndex = row * columnCount + column;
  let nextIndex = flatIndex + direction;
  let nextModel = model.value;
  if (nextIndex >= (model.value.rows.length + 1) * columnCount) {
    nextModel = insertVisualTableRow(model.value, model.value.rows.length);
    commit(nextModel);
  }
  nextIndex = Math.max(0, nextIndex);
  const nextRow = Math.floor(nextIndex / columnCount);
  const nextColumn = nextIndex % columnCount;
  setActiveCell(nextRow, nextColumn);
  void focusCell(nextRow, nextColumn, true);
}

function handleCellPaste(row: number, column: number, event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text/plain") ?? "";
  if (!text.includes("\t") && !/\r?\n/.test(text.trim())) return;
  event.preventDefault();

  const matrix = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .split("\n")
    .filter((line, index, lines) => line || index < lines.length - 1)
    .map((line) => line.split("\t"));
  const requiredRows = Math.max(model.value.rows.length, row + matrix.length - 1);
  const requiredColumns = Math.max(model.value.headers.length, column + Math.max(...matrix.map((line) => line.length)));
  let next = resizeVisualTable(model.value, requiredRows, requiredColumns);
  matrix.forEach((line, rowOffset) => {
    line.forEach((value, columnOffset) => {
      next = updateVisualTableCell(next, row + rowOffset, column + columnOffset, value);
    });
  });
  commit(next);
}

function insertRow(position: "above" | "below") {
  menuVisible.value = false;
  const bodyRow = activeCell.value.row - 1;
  const target = activeCell.value.row === 0
    ? 0
    : position === "above" ? bodyRow : bodyRow + 1;
  commit(insertVisualTableRow(model.value, target));
  setActiveCell(target + 1, activeCell.value.column);
  void focusCell(target + 1, activeCell.value.column);
}

function removeRow() {
  menuVisible.value = false;
  if (activeCell.value.row === 0) return;
  const bodyRow = activeCell.value.row - 1;
  commit(deleteVisualTableRow(model.value, bodyRow));
  setActiveCell(Math.min(activeCell.value.row, model.value.rows.length), activeCell.value.column);
  void focusCell(activeCell.value.row, activeCell.value.column);
}

function moveRow(direction: "up" | "down") {
  menuVisible.value = false;
  if (activeCell.value.row === 0) return;
  const bodyRow = activeCell.value.row - 1;
  const next = moveVisualTableRow(model.value, bodyRow, direction);
  if (next === model.value) return;
  commit(next);
  setActiveCell(activeCell.value.row + (direction === "up" ? -1 : 1), activeCell.value.column);
  void focusCell(activeCell.value.row, activeCell.value.column);
}

function insertColumn(position: "left" | "right") {
  menuVisible.value = false;
  const target = activeCell.value.column + (position === "right" ? 1 : 0);
  commit(insertVisualTableColumn(model.value, target));
  setActiveCell(activeCell.value.row, target);
  void focusCell(activeCell.value.row, target);
}

function removeColumn() {
  menuVisible.value = false;
  const target = activeCell.value.column;
  commit(deleteVisualTableColumn(model.value, target));
  setActiveCell(activeCell.value.row, Math.min(target, model.value.headers.length - 2));
  void focusCell(activeCell.value.row, activeCell.value.column);
}

function moveColumn(direction: "left" | "right") {
  menuVisible.value = false;
  const current = activeCell.value.column;
  const next = moveVisualTableColumn(model.value, current, direction);
  if (next === model.value) return;
  commit(next);
  setActiveCell(activeCell.value.row, activeCell.value.column + (direction === "left" ? -1 : 1));
  void focusCell(activeCell.value.row, activeCell.value.column);
}

function alignColumn(alignment: TableAlignment) {
  commit(alignVisualTableColumn(model.value, activeCell.value.column, alignment));
  void focusCell(activeCell.value.row, activeCell.value.column);
}

function runCommand(command: EditorCommand, payload?: string): VisualTableCommandResult {
  const wrappers: Partial<Record<EditorCommand, [string, string]>> = {
    bold: ["**", "**"],
    italic: ["*", "*"],
    underline: ["<u>", "</u>"],
    strike: ["~~", "~~"],
    inlineCode: ["`", "`"],
    inlineMath: ["$", "$"],
    highlight: ["==", "=="],
    superscript: ["^", "^"],
    subscript: ["~", "~"],
  };
  const wrapper = wrappers[command];
  if (wrapper) {
    wrapActiveCellSelection(wrapper[0], wrapper[1]);
    return "handled";
  }

  if (command === "link") {
    wrapActiveCellSelection("[", "](" + (payload || "https://") + ")");
    return "handled";
  }

  switch (command) {
    case "copy":
    case "copyMarkdown":
      void copyTableSelection("markdown");
      return "handled";
    case "copyHtml":
      void copyTableSelection("html");
      return "handled";
    case "copyPlainText":
      void copyTableSelection("plain");
      return "handled";
    case "cut":
      void cutTableSelection();
      return "handled";
    case "paste":
    case "pastePlainText":
      void pasteIntoSavedSelection();
      return "handled";
    case "selectAll":
    case "selectTableCell":
      selectTablePart("cell");
      return "handled";
    case "selectTableRow":
      selectTablePart("row");
      return "handled";
    case "selectTableColumn":
      selectTablePart("column");
      return "handled";
    case "selectTable":
      selectTablePart("table");
      return "handled";
    case "clearFormat":
      clearTableSelectionFormat();
      return "handled";
    case "openLink":
      openLinkInActiveCell();
      return "handled";
  }

  const handlers: Partial<Record<EditorCommand, () => void>> = {
    addTableRow: () => insertRow("below"),
    addTableColumn: () => insertColumn("right"),
    addTableRowAbove: () => insertRow("above"),
    addTableRowBelow: () => insertRow("below"),
    addTableColumnLeft: () => insertColumn("left"),
    addTableColumnRight: () => insertColumn("right"),
    moveTableRowUp: () => moveRow("up"),
    moveTableRowDown: () => moveRow("down"),
    moveTableColumnLeft: () => moveColumn("left"),
    moveTableColumnRight: () => moveColumn("right"),
    deleteTableRow: removeRow,
    deleteTableColumn: removeColumn,
    deleteTable: () => emit("delete"),
    alignLeft: () => alignColumn("left"),
    alignCenter: () => alignColumn("center"),
    alignRight: () => alignColumn("right"),
  };
  const handler = handlers[command];
  if (!handler) return "unsupported";
  handler();
  return "handled";
}

function focusActiveTextarea(selectAll = false): HTMLTextAreaElement | null {
  const { row, column } = activeCell.value;
  const textarea = rootRef.value?.querySelector<HTMLTextAreaElement>(
    `textarea[data-table-row="${row}"][data-table-column="${column}"]`,
  ) ?? null;
  textarea?.focus();
  if (textarea && selectAll) {
    textarea.setSelectionRange(0, textarea.value.length);
    savedSelection.value = {
      row,
      column,
      start: 0,
      end: textarea.value.length,
      scope: selectionScope.value,
    };
  }
  return textarea;
}

function getCommandSelection(): SavedCellSelection {
  const { row, column } = activeCell.value;
  const textarea = rootRef.value?.querySelector<HTMLTextAreaElement>(
    `textarea[data-table-row="${row}"][data-table-column="${column}"]`,
  );
  const source = getCell(model.value, row, column);
  const start = textarea?.selectionStart ?? savedSelection.value.start;
  const end = textarea?.selectionEnd ?? savedSelection.value.end;
  return {
    row,
    column,
    start: Math.max(0, Math.min(start, source.length)),
    end: Math.max(0, Math.min(end, source.length)),
    scope: selectionScope.value,
  };
}

function selectTablePart(scope: Exclude<TableSelectionScope, "text">) {
  selectionScope.value = scope;
  if (scope === "cell") {
    focusActiveTextarea(true);
  } else {
    rootRef.value?.focus();
    selectionScope.value = scope;
    savedSelection.value = { ...getCommandSelection(), scope };
  }
  const selection = getCommandSelection();
  savedSelection.value = { ...selection, scope };
  emit("selection", getSelectionMarkdown({ ...selection, scope }));
}

async function copyTableSelection(format: "markdown" | "html" | "plain") {
  const selection = getCommandSelection();
  const markdown = getSelectionMarkdown(selection);
  if (!markdown) return;
  if (format === "html") {
    await writeClipboardHtml(getSelectionHtml(selection), markdown);
    return;
  }
  const text = format === "plain" ? getSelectionPlainText(selection) : markdown;
  await writeClipboardText(text);
}

async function cutTableSelection() {
  const selection = getCommandSelection();
  const markdown = getSelectionMarkdown(selection);
  if (!markdown || !await writeClipboardText(markdown)) return;
  deleteTableSelection(selection);
}

async function pasteIntoSavedSelection() {
  const selection = getCommandSelection();
  try {
    const text = await navigator.clipboard.readText();
    if (!mounted) return;
    replaceSavedCellSelection(selection, text);
  } catch {
    restoreNativeSelection(selection);
    if (typeof document.execCommand === "function") document.execCommand("paste");
  }
}

function replaceSavedCellSelection(selection: SavedCellSelection, insert: string) {
  const source = getCell(model.value, selection.row, selection.column);
  const start = Math.max(0, Math.min(selection.start, source.length));
  const end = Math.max(start, Math.min(selection.end, source.length));
  const nextValue = `${source.slice(0, start)}${insert}${source.slice(end)}`;
  commit(updateVisualTableCell(model.value, selection.row, selection.column, nextValue));
  const caret = start + insert.replace(/\r?\n/g, "<br>").trim().length;
  savedSelection.value = {
    row: selection.row,
    column: selection.column,
    start: caret,
    end: caret,
    scope: "text",
  };
  selectionScope.value = "text";
  void restoreSavedSelection(savedSelection.value);
}

function deleteTableSelection(selection: SavedCellSelection) {
  if (selection.scope === "table") {
    emit("delete");
    return;
  }
  if (selection.scope === "row") {
    if (selection.row === 0) {
      let next = model.value;
      next.headers.forEach((_, column) => {
        next = updateVisualTableCell(next, 0, column, "");
      });
      commit(next);
    } else {
      removeRow();
    }
    return;
  }
  if (selection.scope === "column") {
    if (model.value.headers.length > 2) {
      removeColumn();
    } else {
      let next = updateVisualTableCell(model.value, 0, selection.column, "");
      model.value.rows.forEach((_, row) => {
        next = updateVisualTableCell(next, row + 1, selection.column, "");
      });
      commit(next);
    }
    return;
  }
  replaceSavedCellSelection(selection, "");
}

function clearTableSelectionFormat() {
  const selection = getCommandSelection();
  if (selection.scope === "text" || selection.scope === "cell") {
    const source = getCell(model.value, selection.row, selection.column);
    const result = clearMarkdownFormatting({
      value: source,
      selectionStart: selection.start,
      selectionEnd: selection.end,
    });
    commit(updateVisualTableCell(model.value, selection.row, selection.column, result.value));
    savedSelection.value = {
      ...selection,
      start: result.selectionStart,
      end: result.selectionEnd,
      scope: "text",
    };
    selectionScope.value = "text";
    void restoreSavedSelection(savedSelection.value);
    return;
  }

  let next = model.value;
  for (let row = 0; row <= model.value.rows.length; row += 1) {
    for (let column = 0; column < model.value.headers.length; column += 1) {
      if (!selectionContainsCell(selection, row, column)) continue;
      const source = getCell(next, row, column);
      const result = clearMarkdownFormatting({
        value: source,
        selectionStart: 0,
        selectionEnd: source.length,
      });
      next = updateVisualTableCell(next, row, column, result.value);
    }
  }
  commit(next);
}

function openLinkInActiveCell() {
  const selection = getCommandSelection();
  const source = getCell(model.value, selection.row, selection.column);
  const link = findMarkdownLinkAtCursor(source, selection.start, selection.end)
    ?? findMarkdownLinkAtCursor(source, selection.start, selection.start);
  if (link) emit("openLink", link.href);
}

function getSelectionMarkdown(selection: SavedCellSelection): string {
  if (selection.scope === "table") return props.source;
  if (selection.scope === "row") {
    return serializeVisualTable(model.value).split(/\r?\n/)[selection.row === 0 ? 0 : selection.row + 1] ?? "";
  }
  if (selection.scope === "column") {
    return [model.value.headers[selection.column], ...model.value.rows.map((row) => row[selection.column] ?? "")].join("\n");
  }
  const source = getCell(model.value, selection.row, selection.column);
  return source.slice(Math.min(selection.start, selection.end), Math.max(selection.start, selection.end));
}

function getSelectionPlainText(selection: SavedCellSelection): string {
  if (selection.scope === "table") {
    return [model.value.headers, ...model.value.rows].map((row) => row.join("\t")).join("\n");
  }
  if (selection.scope === "row") {
    return (selection.row === 0 ? model.value.headers : model.value.rows[selection.row - 1] ?? []).join("\t");
  }
  if (selection.scope === "column") {
    return [model.value.headers[selection.column], ...model.value.rows.map((row) => row[selection.column] ?? "")].join("\n");
  }
  return getPlainTextFromMarkdownSelection(getSelectionMarkdown(selection));
}

function getSelectionHtml(selection: SavedCellSelection): string {
  if (selection.scope === "table") return renderMarkdown(props.source, renderOptions());
  if (selection.scope === "row") {
    const cells = selection.row === 0 ? model.value.headers : model.value.rows[selection.row - 1] ?? [];
    const tag = selection.row === 0 ? "th" : "td";
    return `<table><tbody><tr>${cells.map((cell) => `<${tag}>${renderCell(cell)}</${tag}>`).join("")}</tr></tbody></table>`;
  }
  if (selection.scope === "column") {
    const cells = [model.value.headers[selection.column], ...model.value.rows.map((row) => row[selection.column] ?? "")];
    return `<table><tbody>${cells.map((cell, index) => `<tr><${index === 0 ? "th" : "td"}>${renderCell(cell)}</${index === 0 ? "th" : "td"}></tr>`).join("")}</tbody></table>`;
  }
  return renderMarkdown(getSelectionMarkdown(selection), renderOptions()).trim();
}

function renderOptions() {
  return {
    basePath: props.filePath,
    documentSource: props.documentSource,
    outline: props.outline,
    settings: props.settings,
  };
}

function selectionContainsCell(selection: SavedCellSelection, row: number, column: number): boolean {
  if (selection.scope === "table") return true;
  if (selection.scope === "row") return selection.row === row;
  if (selection.scope === "column") return selection.column === column;
  return selection.row === row && selection.column === column;
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const temporary = document.createElement("textarea");
    temporary.value = text;
    temporary.style.position = "fixed";
    temporary.style.opacity = "0";
    document.body.append(temporary);
    temporary.select();
    const copied = typeof document.execCommand === "function" && document.execCommand("copy");
    temporary.remove();
    return copied;
  }
}

async function writeClipboardHtml(html: string, text: string) {
  try {
    const ClipboardItemCtor = globalThis.ClipboardItem;
    if (!ClipboardItemCtor || !navigator.clipboard.write) {
      await writeClipboardText(html);
      return;
    }
    await navigator.clipboard.write([new ClipboardItemCtor({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
  } catch {
    await writeClipboardText(html);
  }
}

function restoreNativeSelection(selection: SavedCellSelection) {
  const textarea = focusActiveTextarea();
  if (!textarea) return;
  textarea.setSelectionRange(selection.start, selection.end);
}

async function restoreSavedSelection(selection: SavedCellSelection) {
  await nextTick();
  if (!mounted || activeCell.value.row !== selection.row || activeCell.value.column !== selection.column) return;
  const textarea = focusActiveTextarea();
  textarea?.setSelectionRange(selection.start, selection.end);
}

function wrapActiveCellSelection(before: string, after: string) {
  const selection = getCommandSelection();
  const { row, column } = selection;
  const selector = 'textarea[data-table-row="' + row + '"][data-table-column="' + column + '"]';
  const source = getCell(model.value, row, column);
  const start = selection.start;
  const end = selection.end;
  const selected = source.slice(start, end);
  const nextValue = source.slice(0, start) + before + selected + after + source.slice(end);
  commit(updateVisualTableCell(model.value, row, column, nextValue));
  void nextTick(async () => {
    await focusCell(row, column);
    const nextTextarea = rootRef.value?.querySelector<HTMLTextAreaElement>(selector);
    nextTextarea?.setSelectionRange(start + before.length, end + before.length);
    savedSelection.value = {
      row,
      column,
      start: start + before.length,
      end: end + before.length,
      scope: "text",
    };
  });
}
function renderCell(source: string) {
  const html = renderMarkdown(source || " ", renderOptions());
  return html.replace(/^\s*<p>/, "").replace(/<\/p>\s*$/, "");
}

function commit(next: VisualTableModel, history: "input" | "command" = "command", inputGroup?: string) {
  emit("update", serializeVisualTable(next), history, inputGroup);
}

async function focusCell(row: number, column: number, selectAll = false) {
  await nextTick();
  const selector = `textarea[data-table-row="${row}"][data-table-column="${column}"]`;
  const textarea = rootRef.value?.querySelector<HTMLTextAreaElement>(selector) ?? null;
  textarea?.focus();
  if (textarea) {
    const start = selectAll ? 0 : textarea.value.length;
    textarea.setSelectionRange(start, textarea.value.length);
    savedSelection.value = {
      row,
      column,
      start,
      end: textarea.value.length,
      scope: selectAll ? "cell" : "text",
    };
    selectionScope.value = selectAll ? "cell" : "text";
    resizeCell(textarea);
  }
}

function resizeCell(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(26, textarea.scrollHeight)}px`;
}

function handleFocusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement;
  const next = event.relatedTarget;
  if (next instanceof Node && root.contains(next)) return;
  window.setTimeout(() => {
    if (root.contains(document.activeElement) || isToolbarTarget(document.activeElement)) return;
    deactivateTable();
  }, 0);
}

function isToolbarTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".app-toolbar"));
}

function deactivateTable() {
  if (!focusedWithin.value) return;
  inputSession += 1;
  focusedWithin.value = false;
  menuVisible.value = false;
  emit("blur");
}

function getCell(table: VisualTableModel, row: number, column: number) {
  return row === 0 ? table.headers[column] ?? "" : table.rows[row - 1]?.[column] ?? "";
}

function emptyTable(): VisualTableModel {
  return {
    headers: ["", ""],
    rows: [["", ""]],
    alignments: ["left", "left"],
    leadingPipe: true,
    trailingPipe: true,
    lineEnding: "\n",
    trailingEnding: "",
  };
}

defineExpose({ runCommand });
</script>

<style scoped>
.visual-table-editor {
  position: relative;
  margin: 0 0.5rem;
  padding: 0.35rem 0;
}

.table-tools {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.28rem;
  min-height: 28px;
  margin-bottom: 0.2rem;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 1px;
  border-left: 1px solid var(--border);
  padding-left: 0.25rem;
}

.table-primary-tools {
  border-left: 0;
  padding-left: 0;
}

.table-tools button {
  position: relative;
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.table-tools button:hover,
.table-tools button.selected {
  background: var(--hover);
  color: var(--text);
}

th.table-part-selected,
td.table-part-selected {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.table-tools button:disabled {
  cursor: default;
  opacity: 0.35;
}

.table-tools button svg {
  width: 15px;
  height: 15px;
}

.table-tools button svg + svg {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 9px;
  height: 9px;
  padding: 1px;
  background: var(--panel);
}

.table-danger-tools {
  margin-left: auto;
}

.table-more-menu {
  position: absolute;
  top: 30px;
  right: 26px;
  z-index: 20;
  display: grid;
  width: 168px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.28rem;
}

.table-more-menu button {
  display: block;
  width: 100%;
  height: 29px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  font-size: 0.78rem;
  justify-content: flex-start;
  padding: 0 0.5rem;
  text-align: left;
}

.menu-separator {
  height: 1px;
  background: var(--border);
  margin: 0.22rem 0.35rem;
}

.table-scroll {
  overflow-x: auto;
  width: 100%;
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

th,
td {
  position: relative;
  min-width: 7rem;
  border: 1px solid var(--border);
  color: var(--text-main);
  cursor: text;
  padding: 0;
  vertical-align: top;
}

th {
  background: var(--panel-subtle);
  font-weight: 600;
}

th:hover,
td:hover {
  background: var(--hover);
}

.cell-rendered {
  min-height: 2.25rem;
  padding: 0.5rem 0.72rem;
  word-break: break-word;
}

.cell-rendered :deep(p) {
  margin: 0;
}

textarea {
  display: block;
  width: 100%;
  min-height: 2.25rem;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--text-main);
  font: inherit;
  line-height: 1.5;
  outline: 0;
  overflow: hidden;
  padding: 0.5rem 0.72rem;
  resize: none;
  text-align: inherit;
  caret-color: var(--accent-strong);
}
</style>

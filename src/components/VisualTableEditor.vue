<template>
  <div
    ref="rootRef"
    class="visual-table-editor"
    :class="{ active: focusedWithin, 'is-readonly': readonly }"
    :tabindex="readonly ? undefined : -1"
    @mousedown="handleTableOuterSurfaceMouseDown"
    @mousedown.capture="handleTablePointerDownCapture"
    @pointerdown.capture="handleTablePointerDownCapture"
    @contextmenu.capture="handlePendingTableContextMenu"
    @contextmenu="handleTableOuterSurfaceContextMenu"
    @focusin="activateTable"
    @focusout="handleFocusOut"
  >
    <div v-if="focusedWithin" class="table-tools" role="toolbar" aria-label="表格工具">
      <span class="tool-group table-primary-tools">
        <button
          type="button"
          title="调整表格大小"
          :class="{ selected: resizeVisible }"
          @click.stop="toggleResizePopover"
        ><Table2 /></button>
        <button type="button" title="左对齐" :class="{ selected: activeAlignment === 'left' }" @click="alignColumn('left')"><AlignLeft /></button>
        <button type="button" title="居中对齐" :class="{ selected: activeAlignment === 'center' }" @click="alignColumn('center')"><AlignCenter /></button>
        <button type="button" title="右对齐" :class="{ selected: activeAlignment === 'right' }" @click="alignColumn('right')"><AlignRight /></button>
      </span>
      <span class="tool-group table-danger-tools">
        <button
          type="button"
          title="更多表格操作"
          :class="{ selected: menuVisible }"
          @click.stop="toggleMoreMenu"
        ><MoreVertical /></button>
        <button type="button" title="删除表格" @click="emit('delete')"><Trash2 /></button>
      </span>

      <div
        v-if="resizeVisible"
        class="table-resize-popover"
        role="dialog"
        aria-label="调整表格大小"
        @mousedown.stop
        @click.stop
      >
        <div
          class="table-size-grid"
          role="grid"
          aria-label="选择表格列数和数据行数"
          @mouseleave="resetResizePreview"
        >
          <button
            v-for="cell in resizeGridCells"
            :key="`${cell.columns}:${cell.rows}`"
            type="button"
            class="table-size-cell"
            :class="{
              'is-current': cell.columns <= model.headers.length && cell.rows <= model.rows.length,
              'is-preview': cell.columns <= resizePreview.columns && cell.rows <= resizePreview.rows,
            }"
            :aria-label="`${cell.columns} 列 ${cell.rows} 数据行`"
            :data-size-columns="cell.columns"
            :data-size-rows="cell.rows"
            @mouseenter="previewTableSize(cell.rows, cell.columns)"
            @focus="previewTableSize(cell.rows, cell.columns)"
            @click="applyTableSize(cell.rows, cell.columns)"
          />
        </div>

        <form class="table-size-inputs" aria-label="输入表格大小" @submit.prevent="applyTableSizeInputs">
          <input
            v-model="resizeColumnsInput"
            type="number"
            min="1"
            max="40"
            inputmode="numeric"
            aria-label="列数"
            @input="previewInputTableSize"
          >
          <span aria-hidden="true">x</span>
          <input
            v-model="resizeRowsInput"
            type="number"
            min="1"
            max="99"
            inputmode="numeric"
            aria-label="数据行数"
            @input="previewInputTableSize"
          >
          <button type="submit" title="应用表格大小" aria-label="应用表格大小"><Check /></button>
        </form>
      </div>

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
        <button
          type="button"
          role="menuitem"
          :disabled="activeCell.row === 0 || model.rows.length <= 1"
          @click="removeRow"
        >删除当前行</button>
        <button type="button" role="menuitem" :disabled="model.headers.length <= 1" @click="removeColumn">删除当前列</button>
      </div>
    </div>

    <div class="table-scroll">
      <table
        @mousedown="handleTableSurfaceMouseDown"
        @contextmenu="handleTableSurfaceContextMenu"
      >
        <thead>
          <tr>
            <th
              v-for="(cell, column) in model.headers"
              :key="`header-${column}`"
              :style="{ textAlign: model.alignments[column] }"
              :data-table-row="0"
              :data-table-column="column"
              :class="{
                'table-part-selected': isSelectedPart(0, column),
                'table-drag-source': isTableDragSource('column', column),
                'table-drag-target': isTableDragTarget('column', column),
              }"
              :aria-selected="isSelectedPart(0, column)"
              @mousedown="handleCellMouseDown(0, column, $event)"
              @click="handleCellClick(0, column, $event)"
              @contextmenu.stop="openTableContextMenu(0, column, $event)"
              @dragover.prevent.stop="setTableDragTarget('column', column)"
              @drop.prevent.stop="dropTablePart('column', column)"
            >
              <button
                v-if="!readonly"
                type="button"
                class="table-column-drag-handle"
                title="拖动调整列顺序"
                :aria-label="`拖动第 ${column + 1} 列`"
                :data-column-drag-index="column"
                draggable="true"
                @mousedown.stop
                @click.stop.prevent="selectCell(0, column)"
                @dragstart.stop="startTableDrag('column', column, $event)"
                @dragend.stop="endTableDrag"
              ><GripHorizontal /></button>
              <div class="table-cell-content">
                <div
                  class="cell-rendered"
                  :class="{ 'is-editing-placeholder': isActiveCell(0, column) }"
                  :aria-hidden="isActiveCell(0, column) ? 'true' : undefined"
                  v-html="renderCell(0, column)"
                />
                <TableCellInlineEditor
                  v-if="isActiveCell(0, column)"
                  :ref="(instance) => setCellEditorRef(0, column, instance)"
                  :value="cell"
                  :document-source="documentSource"
                  :row="0"
                  :column="column"
                  :file-path="filePath"
                  :source-offset="getCellDocumentOffset(0, column)"
                  :outline="outline"
                  :settings="settings"
                  :asset-resolver="assetResolver"
                  :readonly="readonly"
                  aria-label="表头单元格"
                  @composition-start="handleCellCompositionStart"
                  @composition-end="handleCellCompositionEnd"
                  @update="(value, selection, userEvent) => updateCell(0, column, value, selection, userEvent)"
                  @keydown="handleCellKeydown(0, column, $event)"
                  @double-click="handleCellDoubleClick(0, column, $event)"
                  @paste="handleCellPaste(0, column, $event)"
                  @selection="captureCellSelection(0, column, $event)"
                  @history="emit('command', $event)"
                  @blur="handleCellBlur(0, column)"
                  @open-link="emit('openLink', $event)"
                />
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in model.rows"
            :key="`row-${rowIndex}`"
            :class="{
              'table-drag-source': isTableDragSource('row', rowIndex),
              'table-drag-target': isTableDragTarget('row', rowIndex),
            }"
            @dragover.prevent.stop="setTableDragTarget('row', rowIndex)"
            @drop.prevent.stop="dropTablePart('row', rowIndex)"
          >
            <td
              v-for="(cell, column) in row"
              :key="`cell-${rowIndex}-${column}`"
              :style="{ textAlign: model.alignments[column] }"
              :data-table-row="rowIndex + 1"
              :data-table-column="column"
              :class="{ 'table-part-selected': isSelectedPart(rowIndex + 1, column) }"
              :aria-selected="isSelectedPart(rowIndex + 1, column)"
              @mousedown="handleCellMouseDown(rowIndex + 1, column, $event)"
              @click="handleCellClick(rowIndex + 1, column, $event)"
              @contextmenu.stop="openTableContextMenu(rowIndex + 1, column, $event)"
            >
              <button
                v-if="column === 0 && !readonly"
                type="button"
                class="table-row-drag-handle"
                title="拖动调整行顺序"
                :aria-label="`拖动第 ${rowIndex + 1} 数据行`"
                :data-row-drag-index="rowIndex"
                draggable="true"
                @mousedown.stop
                @click.stop.prevent="selectCell(rowIndex + 1, 0)"
                @dragstart.stop="startTableDrag('row', rowIndex, $event)"
                @dragend.stop="endTableDrag"
              ><GripVertical /></button>
              <div class="table-cell-content">
                <div
                  class="cell-rendered"
                  :class="{ 'is-editing-placeholder': isActiveCell(rowIndex + 1, column) }"
                  :aria-hidden="isActiveCell(rowIndex + 1, column) ? 'true' : undefined"
                  v-html="renderCell(rowIndex + 1, column)"
                />
                <TableCellInlineEditor
                  v-if="isActiveCell(rowIndex + 1, column)"
                  :ref="(instance) => setCellEditorRef(rowIndex + 1, column, instance)"
                  :value="cell"
                  :document-source="documentSource"
                  :row="rowIndex + 1"
                  :column="column"
                  :file-path="filePath"
                  :source-offset="getCellDocumentOffset(rowIndex + 1, column)"
                  :outline="outline"
                  :settings="settings"
                  :asset-resolver="assetResolver"
                  :readonly="readonly"
                  aria-label="表格单元格"
                  @composition-start="handleCellCompositionStart"
                  @composition-end="handleCellCompositionEnd"
                  @update="(value, selection, userEvent) => updateCell(rowIndex + 1, column, value, selection, userEvent)"
                  @keydown="handleCellKeydown(rowIndex + 1, column, $event)"
                  @double-click="handleCellDoubleClick(rowIndex + 1, column, $event)"
                  @paste="handleCellPaste(rowIndex + 1, column, $event)"
                  @selection="captureCellSelection(rowIndex + 1, column, $event)"
                  @history="emit('command', $event)"
                  @blur="handleCellBlur(rowIndex + 1, column)"
                  @open-link="emit('openLink', $event)"
                />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="tableContextMenu"
      class="table-context-menu"
      :style="{ left: `${tableContextMenu.x}px`, top: `${tableContextMenu.y}px` }"
      role="menu"
      aria-label="表格单元格菜单"
      @mousedown.stop
      @click.stop
      @contextmenu.prevent
      @keydown="handleTableContextMenuKeydown"
    >
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        @mousedown.prevent
        @click="runTableContextMenuAction('insertRowAbove')"
      >
        <ArrowUpToLine />
        <span>上方插入行</span>
      </button>
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        @mousedown.prevent
        @click="runTableContextMenuAction('insertRowBelow')"
      >
        <ArrowDownToLine />
        <span>下方插入行</span>
      </button>
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        :disabled="!canMoveRowUp"
        @mousedown.prevent
        @click="runTableContextMenuAction('moveRowUp')"
      >
        <ArrowUp />
        <span>上移{{ selectedRowLabel }}</span>
      </button>
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        :disabled="!canMoveRowDown"
        @mousedown.prevent
        @click="runTableContextMenuAction('moveRowDown')"
      >
        <ArrowDown />
        <span>下移{{ selectedRowLabel }}</span>
      </button>
      <button
        type="button"
        class="table-context-menu-item is-danger"
        role="menuitem"
        :disabled="activeCell.row === 0 || model.rows.length <= 1"
        @mousedown.prevent
        @click="runTableContextMenuAction('deleteRow')"
      >
        <Rows3 />
        <span>删除当前行</span>
      </button>
      <span class="table-context-menu-separator" role="separator" />
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        @mousedown.prevent
        @click="runTableContextMenuAction('insertColumnLeft')"
      >
        <ArrowLeftToLine />
        <span>左侧插入列</span>
      </button>
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        @mousedown.prevent
        @click="runTableContextMenuAction('insertColumnRight')"
      >
        <ArrowRightToLine />
        <span>右侧插入列</span>
      </button>
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        :disabled="!canMoveColumnLeft"
        @mousedown.prevent
        @click="runTableContextMenuAction('moveColumnLeft')"
      >
        <ArrowLeft />
        <span>左移{{ selectedColumnLabel }}</span>
      </button>
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        :disabled="!canMoveColumnRight"
        @mousedown.prevent
        @click="runTableContextMenuAction('moveColumnRight')"
      >
        <ArrowRight />
        <span>右移{{ selectedColumnLabel }}</span>
      </button>
      <button
        type="button"
        class="table-context-menu-item is-danger"
        role="menuitem"
        :disabled="model.headers.length <= 1"
        @mousedown.prevent
        @click="runTableContextMenuAction('deleteColumn')"
      >
        <Columns3 />
        <span>删除当前列</span>
      </button>
      <span class="table-context-menu-separator" role="separator" />
      <button
        type="button"
        class="table-context-menu-item"
        role="menuitem"
        @mousedown.prevent
        @click="runTableContextMenuAction('copyTable')"
      >
        <Copy />
        <span>复制整张 Markdown 表</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  ArrowUp,
  ArrowUpToLine,
  Check,
  Columns3,
  Copy,
  GripHorizontal,
  GripVertical,
  MoreVertical,
  Rows3,
  Table2,
  Trash2,
} from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from "vue";
import TableCellInlineEditor from "@/components/TableCellInlineEditor.vue";
import {
  renderMarkdown,
  renderMarkdownInline,
  renderMarkdownTableCells,
} from "@/utils/markdown";
import { sanitizeMarkdownHtml } from "@/utils/sanitizeMarkdownHtml";
import { prepareRenderedImages } from "@/utils/imageRendering";
import { resolveLocalAsset } from "@/services/desktop";
import {
  clearMarkdownFormatting,
  getPlainTextFromMarkdownSelection,
  selectCurrentWord,
} from "@/utils/editorCommands";
import { clampEditorContextMenuPosition } from "@/utils/editorContextMenu";
import { findMarkdownLinkAtCursor } from "@/utils/markdownLinks";
import { shouldOpenPreviewLink } from "@/utils/previewLinks";
import { mapRenderedTextOffsetToSource } from "@/utils/renderedTextOffset";
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
import type {
  TableCellEditorSelection,
  TableCellEditorUserEvent,
  TableCellInlineEditorHandle,
} from "@/utils/tableCellInlineEditor";

type VisualTableCommandResult = "handled" | "unsupported";
type TableSelectionScope = "text" | "cell" | "row" | "column" | "table";
type TableDragKind = "row" | "column";
type TableContextMenuAction =
  | "insertRowAbove"
  | "insertRowBelow"
  | "moveRowUp"
  | "moveRowDown"
  | "deleteRow"
  | "insertColumnLeft"
  | "insertColumnRight"
  | "moveColumnLeft"
  | "moveColumnRight"
  | "deleteColumn"
  | "copyTable";

interface SavedCellSelection {
  row: number;
  column: number;
  start: number;
  end: number;
  scope: TableSelectionScope;
  direction?: "forward" | "backward" | "none";
}

interface TableSelectionSnapshot {
  source: string;
  table: VisualTableModel;
  editorValue: string;
}

interface CellPointerPlacement {
  clientX: number;
  clientY: number;
  sourceOffset: number | null;
  selectionAnchor: number | null;
}

interface TableCellHit {
  element: HTMLTableCellElement;
  row: number;
  column: number;
}

interface ExternalTablePointerCandidate {
  distance: number;
  pending: boolean;
}

interface GraphemeSegment {
  index: number;
  segment: string;
}

interface GraphemeSegmenter {
  segment: (value: string) => Iterable<GraphemeSegment>;
}

type GraphemeSegmenterConstructor = new (
  locales?: string | string[],
  options?: { granularity: "grapheme" },
) => GraphemeSegmenter;

const combiningMarkPattern = /\p{Mark}/u;
const TABLE_POINTER_HIT_TOLERANCE = 3;
const props = withDefaults(defineProps<{
  source: string;
  documentSource: string;
  filePath?: string;
  sourceOffset?: number;
  outline: OutlineItem[];
  settings: EditorSettings;
  assetResolver?: (path: string) => string;
  readonly?: boolean;
}>(), {
  readonly: false,
});

const emit = defineEmits<{
  update: [
    value: string,
    history: "input" | "command",
    inputGroup?: string,
    userEvent?: "input.type.compose.start" | "input.type.compose",
  ];
  delete: [];
  focus: [];
  blur: [];
  command: [command: "undo" | "redo"];
  editorCommand: [command: EditorCommand];
  shortcut: [action: "save" | "saveAs" | "open"];
  selection: [text: string, selectionStart: number, selectionEnd: number, selectionHead: number];
  openLink: [href: string];
  escape: [];
  exitDown: [sourceLength: number];
}>();

const rootRef = ref<HTMLElement | null>(null);
const cellEditorRefs = new Map<string, TableCellInlineEditorHandle>();
const focusedWithin = ref(false);
const menuVisible = ref(false);
const tableContextMenu = ref<{ x: number; y: number } | null>(null);
const resizeVisible = ref(false);
const resizeRowsInput = ref("1");
const resizeColumnsInput = ref("1");
const resizePreview = ref({ rows: 1, columns: 1 });
const tableDrag = ref<{ kind: TableDragKind; index: number } | null>(null);
const tableDragTarget = ref<{ kind: TableDragKind; index: number } | null>(null);
const activeCell = ref({ row: 0, column: 0 });
const selectionScope = ref<TableSelectionScope>("text");
const savedSelection = ref<SavedCellSelection>({ row: 0, column: 0, start: 0, end: 0, scope: "text" });
let inputSession = 0;
let cellCompositionActive = false;
let cellCompositionEnding = false;
let firstCellCompositionInput = false;
let cellCompositionEndTimer: number | null = null;
let stopCellPointerSelection: (() => void) | null = null;
let pendingTableContextPointer: {
  row: number;
  column: number;
  clientX: number;
  clientY: number;
} | null = null;
let pendingTableContextPointerTimer: number | null = null;
let mounted = true;

function getCellEditorKey(row: number, column: number): string {
  return row + ":" + column;
}

function setCellEditorRef(row: number, column: number, instance: unknown) {
  const key = getCellEditorKey(row, column);
  if (instance && typeof instance === "object" && "getValue" in instance) {
    cellEditorRefs.set(key, instance as TableCellInlineEditorHandle);
  } else {
    cellEditorRefs.delete(key);
  }
}

function getCellEditor(row: number, column: number): TableCellInlineEditorHandle | null {
  return cellEditorRefs.get(getCellEditorKey(row, column)) ?? null;
}

function toSavedCellSelection(
  row: number,
  column: number,
  selection: TableCellEditorSelection,
  scope: TableSelectionScope = "text",
): SavedCellSelection {
  return {
    row,
    column,
    start: Math.min(selection.anchor, selection.head),
    end: Math.max(selection.anchor, selection.head),
    scope,
    direction: selection.anchor === selection.head
      ? "none"
      : selection.head < selection.anchor
        ? "backward"
        : "forward",
  };
}

function toCellEditorSelection(selection: SavedCellSelection): TableCellEditorSelection {
  return selection.direction === "backward"
    ? { anchor: selection.end, head: selection.start }
    : { anchor: selection.start, head: selection.end };
}

const parsedModel = computed(() => parseVisualTable(props.source));
const model = computed(() => {
  const parsed = parsedModel.value ?? emptyTable();
  return parsed.rows.length > 0 ? parsed : resizeVisualTable(parsed, 1, parsed.headers.length);
});
const renderedCells = computed(() => (
  renderMarkdownTableCells(props.source, renderOptions(), props.sourceOffset)
));
const activeAlignment = computed(() => model.value.alignments[activeCell.value.column] ?? "left");
const selectedRowLabel = computed(() => selectionScope.value === "row" ? "选中行" : "当前行");
const selectedColumnLabel = computed(() => selectionScope.value === "column" ? "选中列" : "当前列");
const canMoveRowUp = computed(() => activeCell.value.row > 1);
const canMoveRowDown = computed(() => (
  activeCell.value.row > 0 && activeCell.value.row < model.value.rows.length
));
const canMoveColumnLeft = computed(() => activeCell.value.column > 0);
const canMoveColumnRight = computed(() => activeCell.value.column < model.value.headers.length - 1);
const resizeGridCells = Array.from({ length: 10 }, (_row, rowIndex) => (
  Array.from({ length: 6 }, (_column, columnIndex) => ({
    rows: rowIndex + 1,
    columns: columnIndex + 1,
  }))
)).flat();

onMounted(() => {
  document.addEventListener("mousedown", handleDocumentMouseDown);
  document.addEventListener("focusin", handleDocumentFocusIn);
  if (rootRef.value) prepareRenderedImages(rootRef.value, props.source, undefined, props.documentSource);
});
onUpdated(() => {
  if (rootRef.value) {
    prepareRenderedImages(rootRef.value, props.source, undefined, props.documentSource);
  }
});

onBeforeUnmount(() => {
  mounted = false;
  cellEditorRefs.clear();
  stopCellPointerSelection?.();
  clearPendingTableContextPointer();
  resetCellCompositionState();
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

watch(
  () => props.readonly,
  (readonly) => { if (readonly) deactivateTable(); },
);

function toggleResizePopover() {
  if (props.readonly) return;
  closeTableContextMenu(false);
  resizeVisible.value = !resizeVisible.value;
  menuVisible.value = false;
  if (resizeVisible.value) resetResizePreview();
}

function toggleMoreMenu() {
  if (props.readonly) return;
  closeTableContextMenu(false);
  menuVisible.value = !menuVisible.value;
  resizeVisible.value = false;
}

function resetResizePreview() {
  const rows = model.value.rows.length;
  const columns = model.value.headers.length;
  resizeRowsInput.value = String(rows);
  resizeColumnsInput.value = String(columns);
  resizePreview.value = { rows, columns };
}

function previewTableSize(rows: number, columns: number) {
  const nextRows = clampTableSize(rows, 99);
  const nextColumns = clampTableSize(columns, 40);
  resizeRowsInput.value = String(nextRows);
  resizeColumnsInput.value = String(nextColumns);
  resizePreview.value = { rows: nextRows, columns: nextColumns };
}

function previewInputTableSize() {
  resizePreview.value = {
    rows: readTableSizeInput(resizeRowsInput.value, model.value.rows.length, 99),
    columns: readTableSizeInput(resizeColumnsInput.value, model.value.headers.length, 40),
  };
}

function applyTableSizeInputs() {
  applyTableSize(
    readTableSizeInput(resizeRowsInput.value, model.value.rows.length, 99),
    readTableSizeInput(resizeColumnsInput.value, model.value.headers.length, 40),
  );
}

function applyTableSize(rows: number, columns: number) {
  const nextRows = clampTableSize(rows, 99);
  const nextColumns = clampTableSize(columns, 40);
  resizeVisible.value = false;
  if (nextRows === model.value.rows.length && nextColumns === model.value.headers.length) return;

  commit(resizeVisualTable(model.value, nextRows, nextColumns));
  const nextRow = Math.min(activeCell.value.row, nextRows);
  const nextColumn = Math.min(activeCell.value.column, nextColumns - 1);
  setActiveCell(nextRow, nextColumn);
  void focusCell(nextRow, nextColumn);
}

function readTableSizeInput(value: string, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? clampTableSize(parsed, maximum) : fallback;
}

function clampTableSize(value: number, maximum: number): number {
  return Math.min(maximum, Math.max(1, Math.round(value)));
}

function openTableContextMenu(row: number, column: number, event: MouseEvent) {
  if (props.readonly) return;
  const pendingPointer = getPendingTableContextPointer(event);
  clearPendingTableContextPointer();
  if (pendingPointer) {
    row = pendingPointer.row;
    column = pendingPointer.column;
  }
  event.preventDefault();
  event.stopPropagation();
  if (!focusedWithin.value) activateTable();

  const preserveSelection = isSelectedPart(row, column);
  const preservedScope = selectionScope.value;
  setActiveCell(row, column);
  const value = getCell(model.value, row, column);
  if (preserveSelection) {
    selectionScope.value = preservedScope;
    savedSelection.value = { row, column, start: 0, end: value.length, scope: preservedScope };
  } else {
    selectionScope.value = "cell";
    savedSelection.value = { row, column, start: 0, end: value.length, scope: "cell" };
    emitTableSelection(savedSelection.value);
  }
  menuVisible.value = false;
  resizeVisible.value = false;
  endTableDrag();
  tableContextMenu.value = clampEditorContextMenuPosition(
    event.clientX,
    event.clientY,
    window.innerWidth,
    window.innerHeight,
    7,
  );
  void nextTick(() => getTableContextMenuItems()[0]?.focus());
}

function getTableContextMenuItems(): HTMLButtonElement[] {
  return Array.from(
    rootRef.value?.querySelectorAll<HTMLButtonElement>(
      ".table-context-menu [role='menuitem']:not(:disabled)",
    ) ?? [],
  );
}

function closeTableContextMenu(restoreFocus: boolean) {
  if (!tableContextMenu.value) return;
  const selection = restoreFocus ? getCommandSelection() : null;
  tableContextMenu.value = null;
  if (selection) {
    savedSelection.value = selection;
    selectionScope.value = selection.scope;
    if (["row", "column", "table"].includes(selection.scope)) {
      void nextTick(() => {
        rootRef.value?.focus();
        savedSelection.value = selection;
        selectionScope.value = selection.scope;
      });
    } else {
      void restoreSavedSelection(selection);
    }
  }
}

function runTableContextMenuAction(action: TableContextMenuAction) {
  const selection = getCommandSelection();
  closeTableContextMenu(false);
  if (action === "insertRowAbove") insertRow("above");
  else if (action === "insertRowBelow") insertRow("below");
  else if (action === "moveRowUp") moveRow("up", selection);
  else if (action === "moveRowDown") moveRow("down", selection);
  else if (action === "deleteRow") removeRow();
  else if (action === "insertColumnLeft") insertColumn("left");
  else if (action === "insertColumnRight") insertColumn("right");
  else if (action === "moveColumnLeft") moveColumn("left", selection);
  else if (action === "moveColumnRight") moveColumn("right", selection);
  else if (action === "deleteColumn") removeColumn();
  else void copyWholeMarkdownTable();
}

function handleTableContextMenuKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeTableContextMenu(true);
    return;
  }

  const items = getTableContextMenuItems();
  if (items.length === 0) return;
  const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
  let nextIndex = currentIndex;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
  else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = items.length - 1;
  else return;
  event.preventDefault();
  event.stopPropagation();
  items[nextIndex]?.focus();
}

function handleCellMouseDown(row: number, column: number, event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const cell = event.currentTarget instanceof HTMLTableCellElement ? event.currentTarget : null;
  if (props.readonly) return;
  if (event.button === 2) return;
  if (cell && shouldResolveTableCellByPointer(target) && !isPointerInsideTableCell(cell, event)) return;
  if (target?.closest(".table-cell-inline-editor")) return;
  const anchor = target?.closest<HTMLAnchorElement>("a[href]");
  if (anchor && (event.button !== 0 || shouldOpenPreviewLink(event))) {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  const pointerPlacement = selectCell(row, column, event);
  if (event.button === 0 && pointerPlacement) {
    beginInactiveCellPointerSelection(row, column, pointerPlacement);
  }
}

function clearPendingTableContextPointer() {
  pendingTableContextPointer = null;
  if (pendingTableContextPointerTimer === null) return;
  window.clearTimeout(pendingTableContextPointerTimer);
  pendingTableContextPointerTimer = null;
}

function getPendingTableContextPointer(event: MouseEvent) {
  const pendingPointer = pendingTableContextPointer;
  if (!pendingPointer) return null;
  return Math.hypot(
    pendingPointer.clientX - event.clientX,
    pendingPointer.clientY - event.clientY,
  ) <= 4
    ? pendingPointer
    : null;
}

function beginPendingTableContextPointer(event: MouseEvent, hit: TableCellHit) {
  if (event.type === "mousedown" && getPendingTableContextPointer(event)) return;
  clearPendingTableContextPointer();
  pendingTableContextPointer = {
    row: hit.row,
    column: hit.column,
    clientX: event.clientX,
    clientY: event.clientY,
  };
  pendingTableContextPointerTimer = window.setTimeout(() => {
    pendingTableContextPointerTimer = null;
    pendingTableContextPointer = null;
    const root = rootRef.value;
    if (!root || root.contains(document.activeElement) || isToolbarTarget(document.activeElement)) return;
    deactivateTable();
  }, 1000);
}

function handlePendingTableContextMenu(event: MouseEvent) {
  const pendingPointer = getPendingTableContextPointer(event);
  if (!pendingPointer) return;
  openTableContextMenu(pendingPointer.row, pendingPointer.column, event);
}

function handleTablePointerDownCapture(event: MouseEvent) {
  if (props.readonly || event.button !== 2) return;
  const root = rootRef.value;
  const table = root?.querySelector<HTMLTableElement>("table");
  if (!root || !table) return;

  const target = event.target instanceof Element ? event.target : null;
  if (
    !(target && table.contains(target))
    && getTablePointerDistance(table, event) > TABLE_POINTER_HIT_TOLERANCE
  ) return;

  const hit = getTableCellHitAtPointer(table, event);
  if (!hit) return;
  event.preventDefault();
  beginPendingTableContextPointer(event, hit);
}

function handleTableSurfaceMouseDown(event: MouseEvent) {
  if (props.readonly || event.button === 2) return;
  const table = event.currentTarget instanceof HTMLTableElement ? event.currentTarget : null;
  if (!table || getDirectTableCellHit(table, event.target, event)) return;
  const hit = getTableCellHitAtPointer(table, event);
  if (!hit) return;

  event.preventDefault();
  const pointerPlacement = selectCell(hit.row, hit.column, event, hit.element);
  if (event.button === 0 && pointerPlacement) {
    beginInactiveCellPointerSelection(hit.row, hit.column, pointerPlacement);
  }
}

function handleTableSurfaceContextMenu(event: MouseEvent) {
  if (props.readonly) return;
  const table = event.currentTarget instanceof HTMLTableElement ? event.currentTarget : null;
  if (!table || getDirectTableCellHit(table, event.target, event)) return;
  const hit = getTableCellHitAtPointer(table, event);
  if (hit) openTableContextMenu(hit.row, hit.column, event);
}

function getOuterTablePointerHit(
  event: MouseEvent,
  external = false,
): { table: HTMLTableElement; hit: TableCellHit } | null {
  if (event.defaultPrevented || props.readonly) return null;
  const target = event.target instanceof Element ? event.target : null;
  const root = rootRef.value;
  if (!target || !root) return null;
  if (external) {
    if (root.contains(target)) return null;
  } else {
    if (!root.contains(target)) return null;
    const interactiveTarget = target.closest(
      "table, .table-context-menu, button, input, textarea, [contenteditable='true']",
    );
    if (interactiveTarget && root.contains(interactiveTarget)) return null;
    if (!target.closest(".visual-table-editor, .table-scroll, .table-tools")) return null;
  }

  const table = root.querySelector<HTMLTableElement>("table");
  if (!table) return null;
  if (getTablePointerDistance(table, event) > TABLE_POINTER_HIT_TOLERANCE) return null;

  const hit = getTableCellHitAtPointer(table, event);
  return hit ? { table, hit } : null;
}

function handleTableOuterSurfaceMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  const pointerHit = getOuterTablePointerHit(event);
  if (!pointerHit) return;
  event.preventDefault();
  const pointerPlacement = selectCell(pointerHit.hit.row, pointerHit.hit.column, event, pointerHit.hit.element);
  if (pointerPlacement) beginInactiveCellPointerSelection(
    pointerHit.hit.row,
    pointerHit.hit.column,
    pointerPlacement,
  );
}

function handleTableOuterSurfaceContextMenu(event: MouseEvent) {
  const pointerHit = getOuterTablePointerHit(event);
  if (!pointerHit) return;
  openTableContextMenu(pointerHit.hit.row, pointerHit.hit.column, event);
}
type ExternalTablePointerEventType = "mousedown" | "contextmenu";

function getTablePointerDistance(table: HTMLTableElement, event: MouseEvent): number {
  const rect = table.getBoundingClientRect();
  const horizontalDistance = event.clientX < rect.left
    ? rect.left - event.clientX
    : event.clientX > rect.right ? event.clientX - rect.right : 0;
  const verticalDistance = event.clientY < rect.top
    ? rect.top - event.clientY
    : event.clientY > rect.bottom ? event.clientY - rect.bottom : 0;
  return Math.hypot(horizontalDistance, verticalDistance);
}

function getExternalPointerCandidate(
  event: MouseEvent,
  type: ExternalTablePointerEventType,
): ExternalTablePointerCandidate | null {
  if (event.defaultPrevented || props.readonly) return null;
  const target = event.target instanceof Element ? event.target : null;
  const root = rootRef.value;
  if (!target || !root || root.contains(target)) return null;
  if (type === "contextmenu" && getPendingTableContextPointer(event)) {
    return { distance: 0, pending: true };
  }

  const table = root.querySelector<HTMLTableElement>("table");
  if (!table) return null;
  const distance = getTablePointerDistance(table, event);
  return distance <= TABLE_POINTER_HIT_TOLERANCE
    ? { distance, pending: false }
    : null;
}

function handleExternalPointerEvent(
  event: MouseEvent,
  type: ExternalTablePointerEventType,
): boolean {
  if (type === "contextmenu") {
    const pendingPointer = getPendingTableContextPointer(event);
    if (pendingPointer) {
      openTableContextMenu(pendingPointer.row, pendingPointer.column, event);
      return true;
    }
  }

  const pointerHit = getOuterTablePointerHit(event, true);
  if (!pointerHit) return false;
  if (type === "contextmenu") {
    openTableContextMenu(pointerHit.hit.row, pointerHit.hit.column, event);
    return true;
  }
  if (event.button !== 0) return false;

  event.preventDefault();
  const pointerPlacement = selectCell(pointerHit.hit.row, pointerHit.hit.column, event, pointerHit.hit.element);
  if (pointerPlacement) {
    beginInactiveCellPointerSelection(pointerHit.hit.row, pointerHit.hit.column, pointerPlacement);
  }
  return true;
}


function handleCellClick(row: number, column: number, event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return;
  event.preventDefault();
  event.stopPropagation();
  if (props.readonly || shouldOpenPreviewLink(event)) {
    emit("openLink", anchor.getAttribute("href") ?? "");
  } else if (!isActiveCell(row, column)) {
    selectCell(row, column, event);
  }
}

function activateTable() {
  if (props.readonly) return;
  focusedWithin.value = true;
  emit("focus");
}

function handleDocumentMouseDown(event: MouseEvent) {
  const target = event.target;
  if (
    tableContextMenu.value
    && !(target instanceof Element && target.closest(".table-context-menu"))
  ) {
    closeTableContextMenu(false);
  }
  if (!focusedWithin.value || !(target instanceof Node) || rootRef.value?.contains(target)) return;
  if (isToolbarTarget(target)) return;
  deactivateTable();
}

function handleDocumentFocusIn(event: FocusEvent) {
  const target = event.target;
  if (!focusedWithin.value || !(target instanceof Node) || rootRef.value?.contains(target)) return;
  closeTableContextMenu(false);
  if (pendingTableContextPointer !== null) return;
  if (isToolbarTarget(target)) return;
  deactivateTable();
}

function selectCell(
  row: number,
  column: number,
  event?: MouseEvent,
  cell?: HTMLTableCellElement,
): CellPointerPlacement | null {
  if (props.readonly) return null;
  const previousSelection = getCommandSelection();
  const pointerPlacement = event
    ? getCellPointerPlacement(row, column, event, previousSelection, cell)
    : null;
  setActiveCell(row, column);
  selectionScope.value = "text";
  focusedWithin.value = true;
  void focusCell(row, column, false, false, pointerPlacement);
  return pointerPlacement;
}

function beginInactiveCellPointerSelection(
  row: number,
  column: number,
  pointerPlacement: CellPointerPlacement,
) {
  stopCellPointerSelection?.();
  const ownerDocument = rootRef.value?.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    ownerDocument.removeEventListener("mousemove", handleMove, true);
    ownerDocument.removeEventListener("mouseup", handleUp, true);
    ownerWindow?.removeEventListener("blur", stop);
    if (stopCellPointerSelection === stop) stopCellPointerSelection = null;
  };

  const handleMove = (moveEvent: MouseEvent) => {
    if ((moveEvent.buttons & 1) === 0) {
      stop();
      return;
    }
    const editor = getCellEditor(row, column);
    if (!editor || !isActiveCell(row, column)) return;

    const boundaries = getCellTextBoundaries(editor.getValue());
    const initialCaret = snapCellTextOffset(
      pointerPlacement.sourceOffset
        ?? resolveCellEditorPointerOffset(
          editor,
          pointerPlacement.clientX,
          pointerPlacement.clientY,
          boundaries,
        ),
      boundaries,
    );
    const anchor = snapCellTextOffset(
      pointerPlacement.selectionAnchor ?? initialCaret,
      boundaries,
    );
    const head = snapCellTextOffset(
      resolveCellEditorPointerOffset(
        editor,
        moveEvent.clientX,
        moveEvent.clientY,
        boundaries,
      ),
      boundaries,
    );
    moveEvent.preventDefault();
    editor.setSelection({ anchor, head });
    selectionScope.value = "text";
    savedSelection.value = toSavedCellSelection(row, column, { anchor, head });
    emitTableSelection(savedSelection.value);
  };

  const handleUp = () => stop();
  stopCellPointerSelection = stop;
  ownerDocument.addEventListener("mousemove", handleMove, true);
  ownerDocument.addEventListener("mouseup", handleUp, true);
  ownerWindow?.addEventListener("blur", stop);
}
function getCellPointerPlacement(
  row: number,
  column: number,
  event: MouseEvent,
  previousSelection: SavedCellSelection,
  cellElement?: HTMLTableCellElement,
): CellPointerPlacement | null {
  const cell = cellElement
    ?? (event.currentTarget instanceof HTMLTableCellElement ? event.currentTarget : null);
  const rendered = cell?.querySelector<HTMLElement>(".cell-rendered") ?? null;
  const sourceOffset = rendered
    ? getRenderedCellSourceOffset(rendered, getCell(model.value, row, column), event)
    : null;
  const hasPointerCoordinates = event.detail > 0 || event.clientX !== 0 || event.clientY !== 0;
  if (sourceOffset === null && !hasPointerCoordinates) return null;

  const canExtendSelection = event.shiftKey
    && previousSelection.scope === "text"
    && previousSelection.row === row
    && previousSelection.column === column;
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    sourceOffset,
    selectionAnchor: canExtendSelection ? getSelectionAnchor(previousSelection) : null,
  };
}

function getTableCellHitAtPointer(table: HTMLTableElement, event: MouseEvent): TableCellHit | null {
  const directHit = getDirectTableCellHit(table, event.target, event);
  if (directHit) return directHit;

  const elementsAtPoint = table.ownerDocument.elementsFromPoint?.(event.clientX, event.clientY) ?? [];
  for (const element of elementsAtPoint) {
    const hit = getDirectTableCellHit(table, element, event);
    if (hit) return hit;
  }

  const target = event.target instanceof Element ? event.target : null;
  const section = target?.closest("tr, thead, tbody, tfoot");
  const searchRoot = section && table.contains(section) ? section : table;
  const candidates = Array.from(
    searchRoot.querySelectorAll<HTMLTableCellElement>("th[data-table-row], td[data-table-row]"),
  ).map((element) => ({
    hit: readTableCellHit(element),
    distance: getPointToCellDistance(element, event.clientX, event.clientY),
  })).filter((candidate): candidate is { hit: TableCellHit; distance: number } => (
    candidate.hit !== null && Number.isFinite(candidate.distance)
  ));
  candidates.sort((left, right) => left.distance - right.distance);
  return candidates[0]?.hit ?? null;
}

function getDirectTableCellHit(
  table: HTMLTableElement,
  target: EventTarget | null,
  event?: MouseEvent,
): TableCellHit | null {
  const element = target instanceof Element
    ? target.closest<HTMLTableCellElement>("th[data-table-row], td[data-table-row]")
    : null;
  if (!element || !table.contains(element)) return null;
  if (event && shouldResolveTableCellByPointer(target) && !isPointerInsideTableCell(element, event)) {
    return null;
  }
  return readTableCellHit(element);
}

function shouldResolveTableCellByPointer(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(
    ".table-cell-inline-editor, .cell-rendered code, .cell-rendered kbd",
  ));
}


function isPointerInsideTableCell(element: HTMLTableCellElement, event: MouseEvent): boolean {
  const rect = element.getBoundingClientRect();
  const target = event.target instanceof Element ? event.target : null;
  const targetRect = target?.getBoundingClientRect();
  if (!targetRect || targetRect.width <= 0 || targetRect.height <= 0) return true;

  const tableRect = element.closest("table")?.getBoundingClientRect();
  if (!tableRect || tableRect.width <= 0 || tableRect.height <= 0) return true;

  if (rect.width <= 0 || rect.height <= 0) return true;
  return event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;
}


function readTableCellHit(element: HTMLTableCellElement): TableCellHit | null {
  const row = Number.parseInt(element.dataset.tableRow ?? "", 10);
  const column = Number.parseInt(element.dataset.tableColumn ?? "", 10);
  if (!Number.isInteger(row) || !Number.isInteger(column)) return null;
  return { element, row, column };
}

function getPointToCellDistance(element: HTMLTableCellElement, clientX: number, clientY: number): number {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return Number.POSITIVE_INFINITY;
  const horizontal = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
  const vertical = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
  if (horizontal > 0 || vertical > 0) return Math.hypot(horizontal, vertical);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return -1 / (1 + Math.hypot(clientX - centerX, clientY - centerY));
}

function getSelectionAnchor(selection: SavedCellSelection): number {
  return selection.direction === "backward" ? selection.end : selection.start;
}
function emitTableSelection(
  selection: SavedCellSelection,
  snapshot?: TableSelectionSnapshot,
) {
  const source = snapshot?.source ?? props.source;
  const table = snapshot?.table ?? model.value;
  const mappedSelection = snapshot
    ? mapTableEditorSelection(selection, snapshot.editorValue, table)
    : selection;
  const sourceRange = getTableSelectionSourceRange(mappedSelection, source, table);
  emit(
    "selection",
    getSelectionMarkdown(mappedSelection, source, table),
    sourceRange.start,
    sourceRange.end,
    sourceRange.head,
  );
}

function mapTableEditorSelection(
  selection: SavedCellSelection,
  editorValue: string,
  table: VisualTableModel,
): SavedCellSelection {
  if (selection.scope !== "text" && selection.scope !== "cell") return selection;
  const cellLength = getCell(table, selection.row, selection.column).length;
  return {
    ...selection,
    start: mapTableEditorOffset(editorValue, selection.start, cellLength),
    end: mapTableEditorOffset(editorValue, selection.end, cellLength),
  };
}

function mapTableEditorOffset(editorValue: string, offset: number, cellLength: number): number {
  const clampedOffset = Math.max(0, Math.min(offset, editorValue.length));
  const normalizedValue = editorValue.replace(/\r?\n/g, "<br>");
  const normalizedPrefix = editorValue.slice(0, clampedOffset).replace(/\r?\n/g, "<br>");
  const leadingWhitespace = normalizedValue.length - normalizedValue.trimStart().length;
  return Math.max(0, Math.min(normalizedPrefix.length - leadingWhitespace, cellLength));
}

function getTableSelectionSourceRange(
  selection: SavedCellSelection,
  source = props.source,
  table = model.value,
) {
  if (selection.scope === "table") {
    return { start: 0, end: source.length, head: source.length };
  }
  const line = getTableSourceLine(selection.row, source);
  if (selection.scope === "row" && line) {
    return { start: line.from, end: line.to, head: line.to };
  }

  const cell = getTableCellSourceRange(selection.row, selection.column, source, table);
  if (!cell) return { start: 0, end: 0, head: 0 };
  const cellValue = getCell(table, selection.row, selection.column);
  const cellLength = cellValue.length;
  const localStart = selection.scope === "column"
    ? 0
    : Math.max(0, Math.min(selection.start, selection.end, cellLength));
  const localEnd = selection.scope === "column"
    ? cellLength
    : Math.max(localStart, Math.min(Math.max(selection.start, selection.end), cellLength));
  const start = Math.min(
    cell.to,
    cell.from + getSerializedTableCellOffset(cellValue, localStart),
  );
  const end = Math.min(
    cell.to,
    cell.from + getSerializedTableCellOffset(cellValue, localEnd),
  );
  const head = selection.direction === "backward" ? start : end;
  return { start, end, head };
}

function getSerializedTableCellOffset(value: string, offset: number): number {
  const end = Math.max(0, Math.min(offset, value.length));
  let sourceOffset = 0;
  for (let index = 0; index < end; index += 1) {
    if (value[index] === "|" && !isEscapedTableDelimiter(value, index)) {
      sourceOffset += 1;
    }
    sourceOffset += 1;
  }
  return sourceOffset;
}

function getTableSourceLine(
  row: number,
  source = props.source,
): { text: string; from: number; to: number } | null {
  const targetLine = row === 0 ? 0 : row + 1;
  let from = 0;
  for (let index = 0; index <= targetLine; index += 1) {
    const newline = source.indexOf("\n", from);
    const rawEnd = newline < 0 ? source.length : newline;
    const to = rawEnd > from && source[rawEnd - 1] === "\r" ? rawEnd - 1 : rawEnd;
    if (index === targetLine) {
      return { text: source.slice(from, to), from, to };
    }
    if (newline < 0) return null;
    from = newline + 1;
  }
  return null;
}

function getTableCellSourceRange(
  row: number,
  column: number,
  source = props.source,
  table = model.value,
): { from: number; to: number } | null {
  const line = getTableSourceLine(row, source);
  if (!line) return null;
  let contentFrom = getTableLinePrefixLength(line.text, row, table);
  let contentTo = line.text.length;
  while (contentFrom < contentTo && /[ \t]/.test(line.text[contentFrom] ?? "")) contentFrom += 1;
  while (contentTo > contentFrom && /[ \t]/.test(line.text[contentTo - 1] ?? "")) contentTo -= 1;
  if (line.text[contentFrom] === "|") contentFrom += 1;
  if (
    contentTo > contentFrom
    && line.text[contentTo - 1] === "|"
    && !isEscapedTableDelimiter(line.text, contentTo - 1)
  ) {
    contentTo -= 1;
  }

  let cellFrom = contentFrom;
  let cellIndex = 0;
  for (let index = contentFrom; index <= contentTo; index += 1) {
    const atDelimiter = index < contentTo
      && line.text[index] === "|"
      && !isEscapedTableDelimiter(line.text, index);
    if (!atDelimiter && index < contentTo) continue;
    if (cellIndex === column) {
      let from = cellFrom;
      let to = index;
      while (from < to && /[ \t]/.test(line.text[from] ?? "")) from += 1;
      while (to > from && /[ \t]/.test(line.text[to - 1] ?? "")) to -= 1;
      return { from: line.from + from, to: line.from + to };
    }
    cellIndex += 1;
    cellFrom = index + 1;
  }
  return null;
}

function getTableLinePrefixLength(
  line: string,
  row: number,
  table: VisualTableModel,
): number {
  if (row === 0 && line.startsWith(table.linePrefix)) {
    return table.linePrefix.length;
  }
  return line.match(/^(?:(?: {0,3}>[ \t]?)+)?[ \t]*/)?.[0].length ?? 0;
}

function isEscapedTableDelimiter(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}
function getRenderedCellSourceOffset(
  rendered: HTMLElement,
  source: string,
  event: MouseEvent,
): number | null {
  const renderedOffset = getPointerRenderedTextOffset(rendered, event);
  if (renderedOffset === null) return null;
  return mapRenderedTextOffsetToSource(
    source,
    rendered.textContent ?? "",
    renderedOffset,
    "markdown-visible",
    props.settings.extensions.emoji,
  );
}

function getPointerRenderedTextOffset(root: HTMLElement, event: MouseEvent): number | null {
  const ownerDocument = root.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (
      x: number,
      y: number,
    ) => { startContainer: Node; startOffset: number } | null;
  };
  try {
    const caret = ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
    const caretOffset = caret
      ? getDomTextBoundaryOffset(root, caret.offsetNode, caret.offset)
      : null;
    if (caretOffset !== null) return caretOffset;

    const range = ownerDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
    return range
      ? getDomTextBoundaryOffset(root, range.startContainer, range.startOffset)
      : null;
  } catch {
    // 浏览器可能拒绝查询视口之外的坐标，此时改用编辑器的几何位置。
    return null;
  }
}

function getDomTextBoundaryOffset(root: HTMLElement, node: Node, offset: number): number | null {
  if (node !== root && !root.contains(node)) return null;
  let textOffset = 0;
  let resolved = false;

  const visit = (current: Node) => {
    if (resolved) return;
    if (current === node) {
      if (current.nodeType === Node.TEXT_NODE) {
        textOffset += Math.max(0, Math.min(offset, current.textContent?.length ?? 0));
      } else {
        const childLimit = Math.max(0, Math.min(offset, current.childNodes.length));
        for (let index = 0; index < childLimit; index += 1) {
          textOffset += getDomTextLength(current.childNodes[index]!);
        }
      }
      resolved = true;
      return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      textOffset += current.textContent?.length ?? 0;
      return;
    }
    current.childNodes.forEach(visit);
  };

  visit(root);
  return resolved ? textOffset : null;
}

function getDomTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  let length = 0;
  node.childNodes.forEach((child) => {
    length += getDomTextLength(child);
  });
  return length;
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

function captureCellSelection(
  row: number,
  column: number,
  selection: TableCellEditorSelection,
  snapshot?: TableSelectionSnapshot,
) {
  const editorValue = snapshot?.editorValue
    ?? getCellEditor(row, column)?.getValue()
    ?? getCell(model.value, row, column);
  const textSelection = toSavedCellSelection(row, column, selection);
  const scope = selectionScope.value === "cell"
    && textSelection.start === 0
    && textSelection.end === editorValue.length
    ? "cell"
    : "text";
  selectionScope.value = scope;
  savedSelection.value = { ...textSelection, scope };
  emitTableSelection(savedSelection.value, snapshot);
}

function handleCellDoubleClick(row: number, column: number, event: MouseEvent) {
  if (props.readonly || event.button !== 0) return;
  const editor = getCellEditor(row, column);
  if (!editor) return;
  const value = editor.getValue();
  const pointerPosition = editor.posAtCoords({ x: event.clientX, y: event.clientY });
  const selection = pointerPosition === null
    ? editor.getSelection()
    : { anchor: pointerPosition, head: pointerPosition };
  const selected = selectCurrentWord({
    value,
    selectionStart: Math.min(selection.anchor, selection.head),
    selectionEnd: Math.max(selection.anchor, selection.head),
  });
  if (selected.selectionStart === selected.selectionEnd) return;

  const boundaries = getCellTextBoundaries(value);
  const start = floorCellTextBoundary(selected.selectionStart, boundaries);
  const end = ceilCellTextBoundary(selected.selectionEnd, boundaries);
  event.preventDefault();
  event.stopPropagation();
  editor.focus({ anchor: start, head: end });
  selectionScope.value = "text";
  savedSelection.value = toSavedCellSelection(row, column, { anchor: start, head: end });
  emitTableSelection(savedSelection.value);
}

function handleCellBlur(row: number, column: number) {
  const editor = getCellEditor(row, column);
  if (editor) captureCellSelection(row, column, editor.getSelection());
  resetCellCompositionState();
  inputSession += 1;
}
function handleCellCompositionStart() {
  if (cellCompositionActive) return;
  clearCellCompositionEndTimer();
  inputSession += 1;
  cellCompositionActive = true;
  cellCompositionEnding = false;
  firstCellCompositionInput = true;
}

function handleCellCompositionEnd() {
  if (!cellCompositionActive) return;
  cellCompositionActive = false;
  cellCompositionEnding = true;
  clearCellCompositionEndTimer();
  cellCompositionEndTimer = window.setTimeout(() => {
    cellCompositionEndTimer = null;
    if (!cellCompositionEnding) return;
    cellCompositionEnding = false;
    firstCellCompositionInput = false;
    inputSession += 1;
  }, 0);
}

function clearCellCompositionEndTimer() {
  if (cellCompositionEndTimer === null) return;
  window.clearTimeout(cellCompositionEndTimer);
  cellCompositionEndTimer = null;
}

function resetCellCompositionState() {
  clearCellCompositionEndTimer();
  cellCompositionActive = false;
  cellCompositionEnding = false;
  firstCellCompositionInput = false;
}

function updateCell(
  row: number,
  column: number,
  value: string,
  selection: TableCellEditorSelection,
  editorUserEvent?: TableCellEditorUserEvent,
) {
  if (editorUserEvent && !cellCompositionActive && !cellCompositionEnding) {
    handleCellCompositionStart();
  }
  const composing = Boolean(editorUserEvent) || cellCompositionActive || cellCompositionEnding;
  const userEvent = composing
    ? firstCellCompositionInput
      ? "input.type.compose.start" as const
      : "input.type.compose" as const
    : undefined;
  const nextTable = updateVisualTableCell(model.value, row, column, value);
  const nextSource = serializeVisualTable(nextTable);
  commit(
    nextTable,
    "input",
    row + ":" + column + ":" + inputSession,
    userEvent,
  );
  if (composing) firstCellCompositionInput = false;
  captureCellSelection(row, column, selection, {
    source: nextSource,
    table: nextTable,
    editorValue: value,
  });
}
function handleCellKeydown(row: number, column: number, event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  const editor = getCellEditor(row, column);
  if (editor) captureCellSelection(row, column, editor.getSelection());
  if (handleTableCellNavigation(row, column, event)) return;
  if (handleTableStructureShortcut(row, event)) return;
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
    editor?.blur();
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

function handleTableCellNavigation(row: number, column: number, event: KeyboardEvent): boolean {
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    const direction = event.key;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(direction)) return false;
    event.preventDefault();
    event.stopPropagation();
    const selection = getCommandSelection();
    if (direction === "ArrowUp") moveRow("up", selection);
    else if (direction === "ArrowDown") moveRow("down", selection);
    else if (direction === "ArrowLeft") moveColumn("left", selection);
    else moveColumn("right", selection);
    return true;
  }

  if (
    event.key === "Enter"
    && (event.shiftKey || (!event.ctrlKey && !event.metaKey && !event.altKey))
  ) {
    event.preventDefault();
    event.stopPropagation();
    const selection = getCommandSelection();
    if (event.shiftKey) {
      replaceSavedCellSelection(selection, "<br />");
      return true;
    }
    moveToCellBelow(selection);
    return true;
  }

  if (
    event.key !== "Backspace"
    || event.ctrlKey
    || event.metaKey
    || event.altKey
    || event.shiftKey
  ) {
    return false;
  }
  const selection = getCommandSelection();
  if (selection.start !== 0 || selection.end !== 0) return false;
  if (row === 0 && column === 0 && isVisualTableEmpty(model.value)) {
    event.preventDefault();
    event.stopPropagation();
    emit("delete");
    return true;
  }
  const columnCount = model.value.headers.length;
  const previousIndex = row * columnCount + column - 1;
  if (previousIndex < 0) return false;
  event.preventDefault();
  event.stopPropagation();
  const previousRow = Math.floor(previousIndex / columnCount);
  const previousColumn = previousIndex % columnCount;
  setActiveCell(previousRow, previousColumn);
  void focusCell(previousRow, previousColumn);
  return true;
}

function moveToCellBelow(selection: SavedCellSelection) {
  const hadSelection = selection.start !== selection.end;
  let next = model.value;
  if (hadSelection) {
    const source = getCell(next, selection.row, selection.column);
    const value = `${source.slice(0, selection.start)}${source.slice(selection.end)}`;
    next = updateVisualTableCell(next, selection.row, selection.column, value);
    commit(next);
  }

  if (selection.row >= next.rows.length) {
    deactivateTable();
    emit("exitDown", serializeVisualTable(next).length);
    return;
  }
  const nextRow = selection.row + 1;
  setActiveCell(nextRow, selection.column);
  void focusCell(nextRow, selection.column, !hadSelection, hadSelection);
}

function isVisualTableEmpty(table: VisualTableModel): boolean {
  if (
    !table.headers.every((cell) => cell === "")
    || !table.rows.every((row) => row.every((cell) => cell === ""))
  ) {
    return false;
  }
  return Array.from(cellEditorRefs.values())
    .every((editor) => editor.getValue() === "");
}

function handleTableStructureShortcut(row: number, event: KeyboardEvent): boolean {
  const primaryModifier = event.ctrlKey || event.metaKey;
  if (!primaryModifier || event.altKey) return false;

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    insertRowBelowAfterDeletingSelection(getCommandSelection());
    return true;
  }

  if (event.shiftKey && (event.key === "Backspace" || event.key === "Delete")) {
    event.preventDefault();
    event.stopPropagation();
    if (row > 0) removeRow();
    return true;
  }

  return false;
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

function insertRowBelowAfterDeletingSelection(selection: SavedCellSelection) {
  menuVisible.value = false;
  let next = model.value;
  if (selection.start !== selection.end) {
    const source = getCell(next, selection.row, selection.column);
    const value = `${source.slice(0, selection.start)}${source.slice(selection.end)}`;
    next = updateVisualTableCell(next, selection.row, selection.column, value);
  }
  const bodyRow = selection.row - 1;
  const target = selection.row === 0 ? 0 : bodyRow + 1;
  next = insertVisualTableRow(next, target);
  commit(next);
  setActiveCell(target + 1, selection.column);
  void focusCell(target + 1, selection.column);
}

function removeRow() {
  menuVisible.value = false;
  if (activeCell.value.row === 0 || model.value.rows.length <= 1) return;
  const bodyRow = activeCell.value.row - 1;
  const next = deleteVisualTableRow(model.value, bodyRow);
  if (next === model.value) return;
  commit(next);
  setActiveCell(Math.min(activeCell.value.row, next.rows.length), activeCell.value.column);
  void focusCell(activeCell.value.row, activeCell.value.column);
}

function moveRow(direction: "up" | "down", selection?: SavedCellSelection) {
  menuVisible.value = false;
  if (activeCell.value.row === 0) return;
  const bodyRow = activeCell.value.row - 1;
  const next = moveVisualTableRow(model.value, bodyRow, direction);
  if (next === model.value) return;
  commit(next);
  setActiveCell(activeCell.value.row + (direction === "up" ? -1 : 1), activeCell.value.column);
  if (selection) {
    restoreMovedCellSelection(selection);
  } else {
    void focusCell(activeCell.value.row, activeCell.value.column);
  }
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
  const next = deleteVisualTableColumn(model.value, target);
  if (next === model.value) return;
  commit(next);
  setActiveCell(activeCell.value.row, Math.min(target, next.headers.length - 1));
  void focusCell(activeCell.value.row, activeCell.value.column);
}

function moveColumn(direction: "left" | "right", selection?: SavedCellSelection) {
  menuVisible.value = false;
  const current = activeCell.value.column;
  const next = moveVisualTableColumn(model.value, current, direction);
  if (next === model.value) return;
  commit(next);
  setActiveCell(activeCell.value.row, activeCell.value.column + (direction === "left" ? -1 : 1));
  if (selection) {
    restoreMovedCellSelection(selection);
  } else {
    void focusCell(activeCell.value.row, activeCell.value.column);
  }
}

function startTableDrag(kind: TableDragKind, index: number, event: DragEvent) {
  if (props.readonly) return;
  closeTableContextMenu(false);
  menuVisible.value = false;
  resizeVisible.value = false;
  tableDrag.value = { kind, index };
  tableDragTarget.value = { kind, index };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `marko-table-${kind}`);
  }
}

function setTableDragTarget(kind: TableDragKind, index: number) {
  if (tableDrag.value?.kind !== kind) return;
  tableDragTarget.value = { kind, index };
}

function dropTablePart(kind: TableDragKind, target: number) {
  const source = tableDrag.value;
  if (!source || source.kind !== kind) return;
  const sourceIndex = source.index;
  endTableDrag();
  if (sourceIndex === target) return;

  const next = kind === "row"
    ? moveVisualTableRowTo(model.value, sourceIndex, target)
    : moveVisualTableColumnTo(model.value, sourceIndex, target);
  if (next === model.value) return;

  commit(next);
  if (kind === "row") {
    setActiveCell(target + 1, activeCell.value.column);
  } else {
    setActiveCell(activeCell.value.row, target);
  }
  void focusCell(activeCell.value.row, activeCell.value.column);
}

function moveVisualTableRowTo(table: VisualTableModel, source: number, target: number): VisualTableModel {
  let next = table;
  let current = source;
  while (current < target) {
    next = moveVisualTableRow(next, current, "down");
    current += 1;
  }
  while (current > target) {
    next = moveVisualTableRow(next, current, "up");
    current -= 1;
  }
  return next;
}

function moveVisualTableColumnTo(table: VisualTableModel, source: number, target: number): VisualTableModel {
  let next = table;
  let current = source;
  while (current < target) {
    next = moveVisualTableColumn(next, current, "right");
    current += 1;
  }
  while (current > target) {
    next = moveVisualTableColumn(next, current, "left");
    current -= 1;
  }
  return next;
}

function isTableDragSource(kind: TableDragKind, index: number): boolean {
  return tableDrag.value?.kind === kind && tableDrag.value.index === index;
}

function isTableDragTarget(kind: TableDragKind, index: number): boolean {
  return tableDragTarget.value?.kind === kind && tableDragTarget.value.index === index;
}

function endTableDrag() {
  tableDrag.value = null;
  tableDragTarget.value = null;
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

function focusActiveCellEditor(selectAll = false): TableCellInlineEditorHandle | null {
  const { row, column } = activeCell.value;
  const editor = getCellEditor(row, column);
  if (!editor) return null;
  const value = editor.getValue();
  const selection = selectAll
    ? { anchor: 0, head: value.length }
    : undefined;
  editor.focus(selection);
  if (selection) {
    savedSelection.value = {
      ...toSavedCellSelection(row, column, selection),
      scope: selectionScope.value,
    };
  }
  return editor;
}

function getCommandSelection(): SavedCellSelection {
  const { row, column } = activeCell.value;
  const source = getCellEditor(row, column)?.getValue()
    ?? getCell(model.value, row, column);
  const editorSelection = getCellEditor(row, column)?.getSelection();
  const current = editorSelection
    ? toSavedCellSelection(row, column, editorSelection)
    : savedSelection.value;
  return {
    row,
    column,
    start: Math.max(0, Math.min(current.start, source.length)),
    end: Math.max(0, Math.min(current.end, source.length)),
    scope: selectionScope.value,
    direction: current.direction ?? "none",
  };
}
function selectTablePart(scope: Exclude<TableSelectionScope, "text">) {
  selectionScope.value = scope;
  if (scope === "cell") {
    focusActiveCellEditor(true);
  } else {
    rootRef.value?.focus();
    selectionScope.value = scope;
    savedSelection.value = { ...getCommandSelection(), scope };
  }
  const selection = getCommandSelection();
  savedSelection.value = { ...selection, scope };
  emitTableSelection({ ...selection, scope });
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

async function copyWholeMarkdownTable() {
  const selection = { ...getCommandSelection(), scope: "table" as const };
  await writeClipboardHtml(getSelectionHtml(selection), props.source, "markdown");
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
  const normalizedInsert = insert.replace(/\r?\n/g, "<br>");
  const nextValue = `${source.slice(0, start)}${normalizedInsert}${source.slice(end)}`;
  const nextModel = updateVisualTableCell(
    model.value,
    selection.row,
    selection.column,
    nextValue,
  );
  const normalizedValue = getCell(nextModel, selection.row, selection.column);
  const leadingTrimLength = nextValue.length - nextValue.trimStart().length;
  const caret = Math.max(
    0,
    Math.min(normalizedValue.length, start + normalizedInsert.length - leadingTrimLength),
  );
  commit(nextModel);
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
    if (model.value.headers.length > 1) {
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

function getSelectionMarkdown(
  selection: SavedCellSelection,
  source = props.source,
  table = model.value,
): string {
  if (selection.scope === "table") return source;
  if (selection.scope === "row") {
    return serializeVisualTable(table).split(/\r?\n/)[selection.row === 0 ? 0 : selection.row + 1] ?? "";
  }
  if (selection.scope === "column") {
    return [table.headers[selection.column], ...table.rows.map((row) => row[selection.column] ?? "")].join("\n");
  }
  const cell = getCell(table, selection.row, selection.column);
  return cell.slice(Math.min(selection.start, selection.end), Math.max(selection.start, selection.end));
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
    return `<table><tbody><tr>${cells.map((_cell, column) => `<${tag}>${renderCell(selection.row, column)}</${tag}>`).join("")}</tr></tbody></table>`;
  }
  if (selection.scope === "column") {
    const cells = [model.value.headers[selection.column], ...model.value.rows.map((row) => row[selection.column] ?? "")];
    return `<table><tbody>${cells.map((_cell, index) => `<tr><${index === 0 ? "th" : "td"}>${renderCell(index, selection.column)}</${index === 0 ? "th" : "td"}></tr>`).join("")}</tbody></table>`;
  }
  if (selection.scope === "cell") return renderCell(selection.row, selection.column);
  return renderMarkdownInline(getSelectionMarkdown(selection), renderOptions()).trim();
}

function renderOptions() {
  return {
    basePath: props.filePath,
    documentSource: props.documentSource,
    outline: props.outline,
    settings: props.settings,
    assetResolver: props.assetResolver ?? resolveLocalAsset,
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

async function writeClipboardHtml(
  html: string,
  text: string,
  fallback: "html" | "markdown" = "html",
) {
  try {
    const ClipboardItemCtor = globalThis.ClipboardItem;
    if (!ClipboardItemCtor || !navigator.clipboard.write) {
      await writeClipboardText(fallback === "markdown" ? text : html);
      return;
    }
    await navigator.clipboard.write([new ClipboardItemCtor({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
  } catch {
    await writeClipboardText(fallback === "markdown" ? text : html);
  }
}

function restoreNativeSelection(selection: SavedCellSelection) {
  const editor = focusActiveCellEditor();
  editor?.setSelection(toCellEditorSelection(selection));
}

async function restoreSavedSelection(selection: SavedCellSelection) {
  await nextTick();
  if (!mounted || activeCell.value.row !== selection.row || activeCell.value.column !== selection.column) return;
  const editor = focusActiveCellEditor();
  editor?.setSelection(toCellEditorSelection(selection));
}
function restoreMovedCellSelection(selection: SavedCellSelection) {
  const movedSelection = {
    ...selection,
    row: activeCell.value.row,
    column: activeCell.value.column,
  };
  savedSelection.value = movedSelection;
  selectionScope.value = movedSelection.scope;
  void restoreSavedSelection(movedSelection);
}

function wrapActiveCellSelection(before: string, after: string) {
  const selection = getCommandSelection();
  const { row, column } = selection;
  const source = getCell(model.value, row, column);
  const start = selection.start;
  const end = selection.end;
  const selected = source.slice(start, end);
  const nextValue = source.slice(0, start) + before + selected + after + source.slice(end);
  commit(updateVisualTableCell(model.value, row, column, nextValue));
  const nextSelection = {
    anchor: start + before.length,
    head: end + before.length,
  };
  void nextTick(async () => {
    await focusCell(row, column);
    getCellEditor(row, column)?.setSelection(nextSelection);
    savedSelection.value = toSavedCellSelection(row, column, nextSelection);
  });
}
function getCellDocumentOffset(row: number, column: number): number {
  const range = getTableCellSourceRange(row, column, props.source, model.value);
  return (props.sourceOffset ?? 0) + (range?.from ?? 0);
}

function renderCell(row: number, column: number) {
  const rendered = row === 0
    ? renderedCells.value.headers[column]
    : renderedCells.value.rows[row - 1]?.[column];
  return sanitizeMarkdownHtml(rendered ?? renderMarkdownInline(getCell(model.value, row, column), renderOptions()));
}

function commit(
  next: VisualTableModel,
  history: "input" | "command" = "command",
  inputGroup?: string,
  userEvent?: "input.type.compose.start" | "input.type.compose",
) {
  if (props.readonly) return;
  emit("update", serializeVisualTable(next), history, inputGroup, userEvent);
}

async function focusCell(
  row: number,
  column: number,
  selectAll = false,
  caretAtStart = false,
  pointerPlacement: CellPointerPlacement | null = null,
) {
  await nextTick();
  const editor = getCellEditor(row, column);
  if (!editor) return;
  const value = editor.getValue();
  const boundaries = getCellTextBoundaries(value);
  const pointerOffset = !pointerPlacement
    ? null
    : pointerPlacement.sourceOffset === null
      ? resolveCellEditorPointerOffset(
        editor,
        pointerPlacement.clientX,
        pointerPlacement.clientY,
        boundaries,
      )
      : snapCellTextOffset(pointerPlacement.sourceOffset, boundaries);
  const defaultHead = selectAll || caretAtStart ? 0 : value.length;
  const head = pointerOffset ?? defaultHead;
  const selectionAnchor = pointerPlacement?.selectionAnchor === null
    || pointerPlacement?.selectionAnchor === undefined
    ? null
    : snapCellTextOffset(pointerPlacement.selectionAnchor, boundaries);
  const selection: TableCellEditorSelection = {
    anchor: selectAll
      ? 0
      : selectionAnchor ?? head,
    head: selectAll
      ? value.length
      : head,
  };
  editor.focus(selection);
  savedSelection.value = {
    ...toSavedCellSelection(row, column, selection),
    scope: selectAll ? "cell" : "text",
  };
  selectionScope.value = selectAll ? "cell" : "text";
}

function resolveCellEditorPointerOffset(
  editor: TableCellInlineEditorHandle,
  clientX: number,
  clientY: number,
  boundaries: readonly number[],
): number {
  const resolved = editor.posAtCoords({ x: clientX, y: clientY });
  if (resolved !== null) return resolved;
  const rect = editor.getElement()?.getBoundingClientRect();
  if (!rect || rect.width <= 0) return boundaries[0] ?? 0;
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const boundaryIndex = Math.round(ratio * Math.max(0, boundaries.length - 1));
  return boundaries[boundaryIndex] ?? 0;
}
function getCellTextBoundaries(value: string): number[] {
  if (!value) return [0];
  const Segmenter = Reflect.get(Intl, "Segmenter") as GraphemeSegmenterConstructor | undefined;
  if (typeof Segmenter === "function") {
    try {
      const boundaries = [0];
      const segments = new Segmenter(undefined, { granularity: "grapheme" }).segment(value);
      for (const current of segments) {
        const end = Math.max(0, Math.min(value.length, current.index + current.segment.length));
        if (end > boundaries[boundaries.length - 1]!) boundaries.push(end);
      }
      if (boundaries[boundaries.length - 1] !== value.length) boundaries.push(value.length);
      return boundaries;
    } catch {
      return getFallbackCellTextBoundaries(value);
    }
  }
  return getFallbackCellTextBoundaries(value);
}

function getFallbackCellTextBoundaries(value: string): number[] {
  const boundaries = [0];
  let offset = 0;
  while (offset < value.length) {
    const firstCodePoint = value.codePointAt(offset);
    offset = advanceCellCodePoint(value, offset);

    if (firstCodePoint === 0x0d && value.codePointAt(offset) === 0x0a) {
      offset = advanceCellCodePoint(value, offset);
    } else {
      if (
        firstCodePoint !== undefined
        && isRegionalIndicator(firstCodePoint)
        && isRegionalIndicator(value.codePointAt(offset))
      ) {
        offset = advanceCellCodePoint(value, offset);
      }
      offset = consumeCellGraphemeExtenders(value, offset);
      while (value.codePointAt(offset) === 0x200d) {
        offset = advanceCellCodePoint(value, offset);
        if (offset >= value.length) break;
        offset = advanceCellCodePoint(value, offset);
        offset = consumeCellGraphemeExtenders(value, offset);
      }
    }
    if (offset > boundaries[boundaries.length - 1]!) boundaries.push(offset);
  }
  if (boundaries[boundaries.length - 1] !== value.length) boundaries.push(value.length);
  return boundaries;
}

function consumeCellGraphemeExtenders(value: string, start: number): number {
  let offset = start;
  while (offset < value.length && isCellGraphemeExtender(value.codePointAt(offset))) {
    offset = advanceCellCodePoint(value, offset);
  }
  return offset;
}

function isCellGraphemeExtender(codePoint: number | undefined): boolean {
  if (codePoint === undefined) return false;
  return combiningMarkPattern.test(String.fromCodePoint(codePoint))
    || codePoint === 0x200c
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
    || (codePoint >= 0xe0020 && codePoint <= 0xe007f)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef);
}

function isRegionalIndicator(codePoint: number | undefined): boolean {
  return codePoint !== undefined && codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
}

function advanceCellCodePoint(value: string, offset: number): number {
  const codePoint = value.codePointAt(offset);
  if (codePoint === undefined) return value.length;
  return Math.min(value.length, offset + (codePoint > 0xffff ? 2 : 1));
}

function floorCellTextBoundary(offset: number, boundaries: readonly number[]): number {
  let result = boundaries[0] ?? 0;
  for (const boundary of boundaries) {
    if (boundary > offset) break;
    result = boundary;
  }
  return result;
}

function ceilCellTextBoundary(offset: number, boundaries: readonly number[]): number {
  for (const boundary of boundaries) {
    if (boundary >= offset) return boundary;
  }
  return boundaries[boundaries.length - 1] ?? 0;
}

function snapCellTextOffset(offset: number, boundaries: readonly number[]): number {
  if (boundaries.length === 0) return 0;
  const minimum = boundaries[0] ?? 0;
  const maximum = boundaries[boundaries.length - 1] ?? minimum;
  const clamped = Math.max(minimum, Math.min(Number.isFinite(offset) ? offset : minimum, maximum));
  let closest = minimum;
  for (const boundary of boundaries) {
    if (Math.abs(boundary - clamped) < Math.abs(closest - clamped)) closest = boundary;
  }
  return closest;
}

function handleFocusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement;
  const next = event.relatedTarget;
  if (next instanceof Node && root.contains(next)) return;
  window.setTimeout(() => {
    if (root.contains(document.activeElement) || isToolbarTarget(document.activeElement)) return;
    if (pendingTableContextPointer !== null) return;
    deactivateTable();
  }, 0);
}

function isToolbarTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(".app-toolbar"));
}

function deactivateTable() {
  stopCellPointerSelection?.();
  if (!focusedWithin.value) return;
  resetCellCompositionState();
  inputSession += 1;
  focusedWithin.value = false;
  menuVisible.value = false;
  tableContextMenu.value = null;
  resizeVisible.value = false;
  endTableDrag();
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
    linePrefix: "",
    lineEnding: "\n",
    trailingEnding: "",
  };
}

defineExpose({ getExternalPointerCandidate, handleExternalPointerEvent, runCommand });
</script>

<style scoped>
.visual-table-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 1.2em 0;
}

.table-tools {
  position: absolute;
  top: 1.2em;
  right: 0;
  left: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 0.28rem;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  height: 20px;
  min-height: 20px;
  transform: translateY(-100%);
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 1px;
  border-left: 1px solid var(--border);
  padding-left: 0.25rem;
}

.table-primary-tools {
  flex: 0 0 79px;
  width: 79px;
  border-left: 0;
  padding-left: 0;
}

.table-tools button {
  position: relative;
  display: grid;
  place-items: center;
  width: 19px;
  height: 20px;
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
  width: 13px;
  height: 13px;
}

.table-tools button svg + svg {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 8px;
  height: 8px;
  padding: 1px;
  background: var(--panel);
}

.table-danger-tools {
  flex: 0 0 27px;
  width: 27px;
  border-left: 0;
  margin-left: auto;
  padding-left: 0;
}

.table-danger-tools > button {
  flex: 0 0 13px;
  width: 13px;
}

.table-resize-popover {
  position: absolute;
  top: 22px;
  left: 0;
  z-index: 21;
  width: 164px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.6rem;
}

.table-size-grid {
  display: grid;
  grid-template-columns: repeat(6, 18px);
  grid-auto-rows: 18px;
  justify-content: center;
  gap: 4px;
}

.table-tools .table-size-cell {
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: 2px;
  background: var(--panel-subtle);
  padding: 0;
}

.table-tools .table-size-cell.is-current {
  background: color-mix(in srgb, var(--accent) 18%, var(--panel));
}

.table-tools .table-size-cell.is-preview,
.table-tools .table-size-cell:hover,
.table-tools .table-size-cell:focus-visible {
  border-color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 48%, var(--panel));
  outline: 0;
}

.table-size-inputs {
  display: grid;
  grid-template-columns: 42px 12px 42px 27px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-top: 1px solid var(--border);
  margin-top: 0.6rem;
  padding-top: 0.55rem;
}

.table-size-inputs input {
  box-sizing: border-box;
  width: 42px;
  height: 27px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--panel);
  color: var(--text-main);
  font: inherit;
  text-align: center;
}

.table-size-inputs input:focus {
  border-color: var(--accent-strong);
  outline: 1px solid color-mix(in srgb, var(--accent) 28%, transparent);
}

.table-size-inputs span {
  color: var(--muted);
  font-size: 0.78rem;
  text-align: center;
}

.table-tools .table-size-inputs button {
  width: 27px;
  height: 27px;
  background: var(--accent-strong);
  color: #fff;
}

.table-tools .table-size-inputs button:hover {
  background: color-mix(in srgb, var(--accent-strong) 86%, #000);
  color: #fff;
}

.table-more-menu {
  position: absolute;
  top: 22px;
  right: 14px;
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

.table-context-menu {
  position: fixed;
  z-index: 86;
  display: grid;
  width: 236px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.28rem;
}

.table-context-menu-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 0.46rem;
  min-height: 30px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  padding: 0.3rem 0.46rem;
  text-align: left;
}

.table-context-menu-item:hover:not(:disabled),
.table-context-menu-item:focus-visible {
  background: var(--hover);
  color: var(--text);
}

.table-context-menu-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-strong) 62%, transparent);
  outline-offset: -2px;
}

.table-context-menu-item:disabled {
  cursor: default;
  opacity: 0.38;
}

.table-context-menu-item.is-danger:hover:not(:disabled),
.table-context-menu-item.is-danger:focus-visible {
  background: color-mix(in srgb, var(--danger) 12%, var(--panel));
  color: var(--danger);
}

.table-context-menu-item svg {
  width: 15px;
  height: 15px;
  color: var(--muted);
}

.table-context-menu-item.is-danger:hover:not(:disabled) svg,
.table-context-menu-item.is-danger:focus-visible svg {
  color: var(--danger);
}

.table-context-menu-item span {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-context-menu-separator {
  height: 1px;
  background: var(--border);
  margin: 0.24rem 0.32rem;
}

.table-scroll {
  box-sizing: border-box;
  padding-inline: 1px;
  order: 1;
  overflow-x: auto;
  width: 100%;
}

table {
  width: 100%;
  border-collapse: collapse;
  background: var(--panel);
  line-height: 1.6;
}

th,
td {
  position: relative;
  border: 1px solid var(--markdown-border, #dfe2e5);
  color: var(--markdown-text, #333333);
  cursor: text;
  min-width: 32px;
  padding: 6px 13px;
  vertical-align: top;
}

.table-column-drag-handle,
.table-row-drag-handle {
  position: absolute;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 12px;
  height: 20px;
  border: 0;
  border-radius: 3px;
  background: color-mix(in srgb, var(--panel) 90%, transparent);
  color: var(--muted);
  cursor: grab;
  opacity: 0;
  padding: 0;
  pointer-events: none;
  transition: opacity 120ms ease, background-color 120ms ease;
}

.table-column-drag-handle {
  top: 50%;
  right: 1px;
  transform: translateY(-50%);
}

.table-row-drag-handle {
  top: 50%;
  left: 1px;
  transform: translateY(-50%);
}

.table-column-drag-handle svg,
.table-row-drag-handle svg {
  width: 10px;
  height: 10px;
}

.visual-table-editor.active th:hover > .table-column-drag-handle,
.visual-table-editor.active tr:hover > td:first-child > .table-row-drag-handle,
.table-column-drag-handle:focus-visible,
.table-row-drag-handle:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

.table-column-drag-handle:hover,
.table-row-drag-handle:hover {
  background: var(--hover);
  color: var(--text-main);
}

.table-column-drag-handle:active,
.table-row-drag-handle:active {
  cursor: grabbing;
}

th.table-drag-source,
tr.table-drag-source > td {
  opacity: 0.48;
}

th.table-drag-target {
  box-shadow: inset 3px 0 0 var(--accent-strong);
}

tr.table-drag-target > td {
  box-shadow: inset 0 3px 0 var(--accent-strong);
}

thead,
tbody tr:nth-child(2n) {
  background: #f8f8f8;
}

:global(:root[data-theme="dark"] .visual-table-editor thead),
:global(:root[data-theme="dark"] .visual-table-editor tbody tr:nth-child(2n)),
:global(.marko-markdown-body[data-theme="dark"] .visual-table-editor thead),
:global(.marko-markdown-body[data-theme="dark"] .visual-table-editor tbody tr:nth-child(2n)) {
  background: var(--panel-subtle);
}

th {
  border-bottom: 0;
  font-weight: bold;
}

.visual-table-editor:not(.is-readonly) th:not(.table-part-selected):hover,
.visual-table-editor:not(.is-readonly) td:not(.table-part-selected):hover {
  background: color-mix(in srgb, var(--hover) 45%, transparent);
}

.table-cell-content {
  position: relative;
  display: grid;
  min-width: 0;
}

.table-cell-content > .cell-rendered,
.table-cell-content > .table-cell-inline-editor {
  grid-area: 1 / 1;
  min-width: 0;
}

.table-cell-content > .table-cell-inline-editor {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  contain: inline-size layout paint;
}

.cell-rendered {
  min-height: 1.6em;
  padding: 0;
  word-break: break-word;
}

.cell-rendered :deep(iframe) {
  pointer-events: none;
}

.cell-rendered.is-editing-placeholder {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}

.cell-rendered :deep(p) {
  margin: 0;
}

.cell-rendered :deep(code) {
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f3f4f4;
  color: inherit;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  padding: 0 2px;
}

:global(:root[data-theme="dark"]) .cell-rendered :deep(code),
:global(.marko-markdown-body[data-theme="dark"]) .cell-rendered :deep(code) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}

textarea {
  display: block;
  width: 100%;
  min-height: 1.6em;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--text-main);
  font: inherit;
  line-height: inherit;
  outline: 0;
  overflow: hidden;
  padding: 0;
  resize: none;
  text-align: inherit;
  caret-color: var(--markdown-text, #333333);
}

:deep(.marko-image-error-source),
:deep(.marko-image-reference-missing) {
  display: inline;
  padding: 0.12rem 0.32rem;
  border: 1px solid color-mix(in srgb, var(--danger) 28%, var(--border));
  border-radius: 3px;
  background: var(--danger-soft);
  color: var(--danger);
  font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 0.88em;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

:deep(.marko-image-error-source) {
  cursor: text;
}

:deep(img.marko-image-error) {
  display: none !important;
}
</style>

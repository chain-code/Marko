import { mount } from "@vue/test-utils";
import { Transaction, type TransactionSpec } from "@codemirror/state";
import { nextTick } from "vue";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EditorView } from "@codemirror/view";
import VisualTableEditor from "@/components/VisualTableEditor.vue";
import TableCellInlineEditor from "@/components/TableCellInlineEditor.vue";
import tableEditorSource from "@/components/VisualTableEditor.vue?raw";
import tableCellEditorSource from "@/components/TableCellInlineEditor.vue?raw";
import { defaultEditorSettings } from "@/utils/editorSettings";
import { parseVisualTable } from "@/utils/visualTable";
import type { TableCellInlineEditorHandle } from "@/utils/tableCellInlineEditor";

const tableSource = [
  "| 名称 | 数量 |",
  "| --- | ---: |",
  "| 第一行 | 1 |",
  "| 第二行 | 2 |",
].join("\n");
const originalCaretPositionFromPoint = Object.getOwnPropertyDescriptor(
  document,
  "caretPositionFromPoint",
);
const originalCaretRangeFromPoint = Object.getOwnPropertyDescriptor(
  document,
  "caretRangeFromPoint",
);
function blockHappyDomSelectionChange(event: Event) {
  // 真实浏览器异步派发 selectionchange，happy-dom 的同步派发会导致 CodeMirror 更新重入。
  event.stopImmediatePropagation();
}

beforeAll(() => {
  document.addEventListener("selectionchange", blockHappyDomSelectionChange, true);
});

function getEditorView(element: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(element);
  if (!view) throw new Error("未找到表格单元格 CodeMirror");
  return view;
}

function getEditorValue(element: HTMLElement): string {
  return getEditorView(element).state.doc.toString();
}

function getEditorSelection(element: HTMLElement) {
  return getEditorView(element).state.selection.main;
}
function withoutSynchronousSelectionChange<T>(callback: () => T): T {
  // happy-dom 会同步派发浏览器中异步触发的 selectionchange，需避免 CodeMirror 更新重入。
  const dispatchEvent = document.dispatchEvent.bind(document);
  const dispatchSpy = vi.spyOn(document, "dispatchEvent").mockImplementation((event) => (
    event.type === "selectionchange" ? true : dispatchEvent(event)
  ));
  try {
    return callback();
  } finally {
    dispatchSpy.mockRestore();
  }
}
async function withoutSynchronousSelectionChangeAsync<T>(callback: () => Promise<T>): Promise<T> {
  const dispatchEvent = document.dispatchEvent.bind(document);
  const dispatchSpy = vi.spyOn(document, "dispatchEvent").mockImplementation((event) => (
    event.type === "selectionchange" ? true : dispatchEvent(event)
  ));
  try {
    return await callback();
  } finally {
    dispatchSpy.mockRestore();
  }
}

function dispatchEditorTransaction(view: EditorView, spec: TransactionSpec) {
  withoutSynchronousSelectionChange(() => view.dispatch(spec));
}

function dispatchEditorDomEvent(element: HTMLElement, event: Event): boolean {
  return withoutSynchronousSelectionChange(() => element.dispatchEvent(event));
}
function dispatchDocumentEvent(event: Event): boolean {
  return withoutSynchronousSelectionChange(() => document.dispatchEvent(event));
}

function setEditorSelection(
  element: HTMLElement,
  anchor: number,
  head = anchor,
) {
  dispatchEditorTransaction(getEditorView(element), { selection: { anchor, head } });
}
function setEditorSelectionRange(
  element: HTMLElement,
  start: number,
  end: number,
  direction: "forward" | "backward" | "none" = "none",
) {
  setEditorSelection(element, direction === "backward" ? end : start, direction === "backward" ? start : end);
}

function getEditorSelectionDirection(element: HTMLElement): "forward" | "backward" | "none" {
  const selection = getEditorSelection(element);
  if (selection.empty) return "none";
  return selection.head < selection.anchor ? "backward" : "forward";
}

function replaceEditorValue(
  element: HTMLElement,
  value: string,
  anchor = value.length,
  head = anchor,
  userEvent = "input.type",
) {
  const view = getEditorView(element);
  dispatchEditorTransaction(view, {
    changes: { from: 0, to: view.state.doc.length, insert: value },
    selection: { anchor, head },
    annotations: Transaction.userEvent.of(userEvent),
  });
}
afterAll(() => {
  document.removeEventListener("selectionchange", blockHappyDomSelectionChange, true);
});

afterEach(() => {
  withoutSynchronousSelectionChange(() => document.getSelection()?.removeAllRanges());
  if (originalCaretPositionFromPoint) {
    Object.defineProperty(document, "caretPositionFromPoint", originalCaretPositionFromPoint);
  } else {
    Reflect.deleteProperty(document, "caretPositionFromPoint");
  }
  if (originalCaretRangeFromPoint) {
    Object.defineProperty(document, "caretRangeFromPoint", originalCaretRangeFromPoint);
  } else {
    Reflect.deleteProperty(document, "caretRangeFromPoint");
  }
  vi.restoreAllMocks();
});

interface TableMountOptions {
  documentSource?: string;
  sourceOffset?: number;
  filePath?: string;
  assetResolver?: (path: string) => string;
  readonly?: boolean;
  attachTo?: HTMLElement;
}

function mountTable(source = tableSource, options: TableMountOptions = {}) {
  return mount(VisualTableEditor, {
    attachTo: options.attachTo ?? document.body,
    props: {
      source,
      documentSource: options.documentSource ?? source,
      sourceOffset: options.sourceOffset,
      filePath: options.filePath,
      assetResolver: options.assetResolver,
      readonly: options.readonly ?? false,
      outline: [],
      settings: defaultEditorSettings,
    },
  });
}

function mockPointerCaret(node: Node, offset: number) {
  const caretPositionFromPoint = vi.fn(() => ({ offsetNode: node, offset }));
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: caretPositionFromPoint,
  });
  return caretPositionFromPoint;
}

function mockPointerRange(node: Node, offset: number) {
  const caretRangeFromPoint = vi.fn(() => ({ startContainer: node, startOffset: offset }));
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: caretRangeFromPoint,
  });
  return caretRangeFromPoint;
}

function dispatchCellMouseDown(
  target: Element,
  options: {
    clientX: number;
    clientY: number;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
  },
) {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    detail: 1,
    clientX: options.clientX,
    clientY: options.clientY,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
  }));
}

async function settleCellFocus() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function createDomRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
    toJSON() {
      return this;
    },
  };
}

function mockTableCellRects(
  wrapper: ReturnType<typeof mountTable>,
  left = 10,
  top = 20,
  cellWidth = 100,
  cellHeight = 30,
) {
  const table = wrapper.get<HTMLTableElement>("table").element;
  const columnCount = wrapper.findAll("thead th").length;
  const rowCount = wrapper.findAll("tbody tr").length;
  vi.spyOn(table, "getBoundingClientRect").mockReturnValue(createDomRect(
    left,
    top,
    Math.max(1, columnCount) * cellWidth,
    (1 + rowCount) * cellHeight,
  ));
  wrapper.findAll<HTMLTableCellElement>(
    "th[data-table-row], td[data-table-row]",
  ).forEach((cell) => {
    const row = Number(cell.attributes("data-table-row"));
    const column = Number(cell.attributes("data-table-column"));
    vi.spyOn(cell.element, "getBoundingClientRect").mockReturnValue(createDomRect(
      left + column * cellWidth,
      top + row * cellHeight,
      cellWidth,
      cellHeight,
    ));
  });
}

function getTableContextMenuItem(
  wrapper: ReturnType<typeof mountTable>,
  label: string,
) {
  const item = wrapper.findAll<HTMLButtonElement>(".table-context-menu [role='menuitem']")
    .find((button) => button.text() === label);
  if (!item) throw new Error(`未找到表格右键菜单项：${label}`);
  return item;
}

describe("VisualTableEditor", () => {
  it("使用接近 Typora GitHub 主题的自适应表格排版", () => {
    const styleSource = tableEditorSource.slice(tableEditorSource.indexOf("<style scoped>"));

    expect(styleSource).toMatch(/table\s*\{[\s\S]*?width:\s*100%;[\s\S]*?border-collapse:\s*collapse;/);
    expect(styleSource).not.toMatch(/table-layout:\s*fixed;/);
    expect(styleSource).not.toMatch(/min-width:\s*7rem;/);
    expect(styleSource).toMatch(/th,\s*td\s*\{[\s\S]*?border:\s*1px solid var\(--markdown-border, #dfe2e5\);[\s\S]*?padding:\s*6px 13px;/);
    expect(styleSource).toMatch(/thead,\s*tbody tr:nth-child\(2n\)\s*\{[\s\S]*?background:\s*#f8f8f8;/);
    expect(styleSource).toMatch(/\.cell-rendered\s*\{[\s\S]*?padding:\s*0;/);
    expect(styleSource).toMatch(
      /\.cell-rendered :deep\(code\)\s*\{[\s\S]*?border:\s*1px solid #e7eaed;[\s\S]*?background:\s*#f3f4f4;[\s\S]*?font-size:\s*0\.9em;[\s\S]*?padding:\s*0 2px;/,
    );
    expect(tableCellEditorSource).toMatch(/\.cm-content\)\s*\{[\s\S]*?line-height:\s*inherit;[\s\S]*?padding:\s*0;/);
    expect(tableCellEditorSource).toMatch(
      /\.cm-table-inline-code\),[\s\S]*?border:\s*1px solid #e7eaed;[\s\S]*?background:\s*#f3f4f4;[\s\S]*?font-size:\s*0\.9em;[\s\S]*?padding:\s*0 2px;/,
    );
  });

  it("激活工具栏时保持表格命中坐标稳定且不占用上一块区域", async () => {
    const styleSource = tableEditorSource.slice(tableEditorSource.indexOf("<style scoped>"));
    const rootRule = styleSource.match(/\.visual-table-editor\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const toolbarRule = styleSource.match(/\.table-tools\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const toolbarButtonRule = styleSource.match(/\.table-tools button\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const primaryToolsRule = styleSource.match(/\.table-primary-tools\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const dangerToolsRule = styleSource.match(/\.table-danger-tools\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const toolbarIconRule = styleSource.match(/\.table-tools button svg\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const resizePopoverRule = styleSource.match(/\.table-resize-popover\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const moreMenuRule = styleSource.match(/\.table-more-menu\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const tableScrollRule = styleSource.match(/\.table-scroll\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const cellContentRule = styleSource.match(/\.table-cell-content\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const cellLayersRule = styleSource.match(
      /\.table-cell-content > \.cell-rendered,\s*\.table-cell-content > \.table-cell-inline-editor\s*\{([\s\S]*?)\}/,
    )?.[1] ?? "";
    const activeEditorRule = Array.from(
      styleSource.matchAll(/\.table-cell-content > \.table-cell-inline-editor\s*\{([\s\S]*?)\}/g),
      (match) => match[1] ?? "",
    ).find((rule) => /contain:/.test(rule)) ?? "";
    const placeholderRule = styleSource.match(
      /\.cell-rendered\.is-editing-placeholder\s*\{([\s\S]*?)\}/,
    )?.[1] ?? "";

    expect(rootRule).toMatch(/position:\s*relative;/);
    expect(rootRule).toMatch(/display:\s*flex;/);
    expect(rootRule).toMatch(/flex-direction:\s*column;/);
    expect(rootRule).toMatch(/padding:\s*1\.2em 0;/);
    expect(toolbarRule).toMatch(/position:\s*absolute;/);
    expect(toolbarRule).toMatch(/top:\s*1\.2em;/);
    expect(toolbarRule).toMatch(/right:\s*0;/);
    expect(toolbarRule).toMatch(/left:\s*0;/);
    expect(toolbarRule).toMatch(/max-width:\s*100%;/);
    expect(toolbarRule).toMatch(/height:\s*20px;/);
    expect(toolbarRule).toMatch(/min-height:\s*20px;/);
    expect(toolbarRule).toMatch(/transform:\s*translateY\(-100%\);/);
    expect(toolbarRule).not.toMatch(/order:/);
    expect(toolbarRule).not.toMatch(/margin-top:/);
    expect(toolbarButtonRule).toMatch(/width:\s*19px;/);
    expect(toolbarButtonRule).toMatch(/height:\s*20px;/);
    expect(primaryToolsRule).toMatch(/flex:\s*0 0 79px;/);
    expect(primaryToolsRule).toMatch(/width:\s*79px;/);
    expect(dangerToolsRule).toMatch(/flex:\s*0 0 27px;/);
    expect(dangerToolsRule).toMatch(/width:\s*27px;/);
    expect(dangerToolsRule).toMatch(/border-left:\s*0;/);
    expect(dangerToolsRule).toMatch(/padding-left:\s*0;/);
    expect(toolbarIconRule).toMatch(/width:\s*13px;/);
    expect(toolbarIconRule).toMatch(/height:\s*13px;/);
    expect(resizePopoverRule).toMatch(/top:\s*22px;/);
    expect(moreMenuRule).toMatch(/top:\s*22px;/);
    expect(moreMenuRule).toMatch(/right:\s*14px;/);
    expect(tableScrollRule).toMatch(/order:\s*1;/);
    expect(tableScrollRule).toMatch(/box-sizing:\s*border-box;/);
    expect(tableScrollRule).toMatch(/padding-inline:\s*1px;/);
    expect(tableCellEditorSource).toMatch(
      /\.table-cell-inline-editor :deep\(\.cm-scroller\)\s*\{[\s\S]*?overflow:\s*hidden;/,
    );
    expect(styleSource).toMatch(/\.cell-rendered :deep\(iframe\)\s*\{\s*pointer-events:\s*none;/);
    expect(cellContentRule).toMatch(/position:\s*relative;/);
    expect(cellContentRule).toMatch(/display:\s*grid;/);
    expect(cellContentRule).toMatch(/min-width:\s*0;/);
    expect(cellLayersRule).toMatch(/grid-area:\s*1 \/ 1;/);
    expect(activeEditorRule).toMatch(/position:\s*absolute;/);
    expect(activeEditorRule).toMatch(/inset:\s*0;/);
    expect(activeEditorRule).toMatch(/overflow:\s*hidden;/);
    expect(activeEditorRule).toMatch(/contain:\s*inline-size layout paint;/);
    expect(placeholderRule).toMatch(/visibility:\s*hidden;/);
    expect(placeholderRule).toMatch(/pointer-events:\s*none;/);

    const wrapper = mountTable();
    const tableScroll = wrapper.get(".table-scroll").element;
    const table = wrapper.get("table").element;
    const targetCell = wrapper.get("tbody td:nth-child(2)");
    const renderedCell = targetCell.get(".cell-rendered").element;
    expect(wrapper.find(".table-tools").exists()).toBe(false);

    await targetCell.trigger("mousedown");
    await nextTick();

    expect(wrapper.find(".table-tools").exists()).toBe(true);
    expect(wrapper.findAll(".table-primary-tools > button")).toHaveLength(4);
    expect(wrapper.findAll(".table-danger-tools > button")).toHaveLength(2);
    expect(wrapper.get(".table-scroll").element).toBe(tableScroll);
    expect(wrapper.get("table").element).toBe(table);
    expect(targetCell.get(".cell-rendered").element).toBe(renderedCell);
    expect(targetCell.get(".cell-rendered").classes()).toContain("is-editing-placeholder");
    expect(targetCell.get(".cell-rendered").attributes("aria-hidden")).toBe("true");
    expect(targetCell.find(".table-cell-inline-editor").exists()).toBe(true);
    wrapper.unmount();
  });

  it("粘贴带前后空格的文本后将光标置于归一化插入内容末尾", async () => {
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const readText = vi.fn(async () => " x ");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText },
    });
    const wrapper = mountTable("| ab |\n| --- |");

    try {
      await wrapper.find("thead th").trigger("mousedown");
      await nextTick();
      const textarea = wrapper.get<HTMLDivElement>(
        '.table-cell-inline-editor[data-table-row="0"][data-table-column="0"] .cm-content',
      );
      setEditorSelectionRange(textarea.element, 1, 1);
      const editorHandle = wrapper.getComponent(TableCellInlineEditor).vm.$.exposed as unknown as TableCellInlineEditorHandle;
      const setSelection = vi.spyOn(editorHandle, "setSelection");

      expect(wrapper.vm.runCommand("pastePlainText")).toBe("handled");
      await vi.waitFor(() => expect(readText).toHaveBeenCalledOnce());
      await vi.waitFor(() => {
        expect(wrapper.emitted("update")?.at(-1)?.[0]).toContain("| a x b |");
        expect(setSelection).toHaveBeenLastCalledWith({ anchor: 4, head: 4 });
      });
    } finally {
      wrapper.unmount();
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("隐藏拖动把手不截获第一列正文指针且可见命中区留在内边距内", async () => {
    const styleSource = tableEditorSource.slice(tableEditorSource.indexOf("<style scoped>"));
    const cellRule = styleSource.match(/th,\s*td\s*\{([\s\S]*?)\}/)?.[1] ?? "";
    const handleRule = styleSource.match(
      /\.table-column-drag-handle,\s*\.table-row-drag-handle\s*\{([\s\S]*?)\}/,
    )?.[1] ?? "";
    const columnHandleRule = Array.from(
      styleSource.matchAll(/\.table-column-drag-handle\s*\{([\s\S]*?)\}/g),
      (match) => match[1] ?? "",
    ).find((rule) => /right:/.test(rule)) ?? "";
    const rowHandleRule = Array.from(
      styleSource.matchAll(/\.table-row-drag-handle\s*\{([\s\S]*?)\}/g),
      (match) => match[1] ?? "",
    ).find((rule) => /left:/.test(rule)) ?? "";
    const visibleHandleRule = styleSource.match(
      /\.visual-table-editor\.active th:hover > \.table-column-drag-handle,[\s\S]*?\{([\s\S]*?)\}/,
    )?.[1] ?? "";
    const horizontalPadding = Number(cellRule.match(/padding:\s*\d+px\s+(\d+)px;/)?.[1]);
    const handleWidth = Number(handleRule.match(/width:\s*(\d+)px;/)?.[1]);
    const columnInset = Number(columnHandleRule.match(/right:\s*(\d+)px;/)?.[1]);
    const rowInset = Number(rowHandleRule.match(/left:\s*(\d+)px;/)?.[1]);

    expect(handleRule).toMatch(/opacity:\s*0;/);
    expect(handleRule).toMatch(/pointer-events:\s*none;/);
    expect(visibleHandleRule).toMatch(/opacity:\s*1;/);
    expect(visibleHandleRule).toMatch(/pointer-events:\s*auto;/);
    expect(rowInset + handleWidth).toBeLessThanOrEqual(horizontalPadding);
    expect(columnInset + handleWidth).toBeLessThanOrEqual(horizontalPadding);

    const wrapper = mountTable(
      "| Value |\n| --- |\n| [alpha](https://example.com) |",
    );
    const anchor = wrapper.get<HTMLAnchorElement>("tbody td .cell-rendered a");
    mockPointerCaret(anchor.element.firstChild!, 0);
    dispatchCellMouseDown(anchor.element, { clientX: 100, clientY: 60 });
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 0,
    }));
    await settleCellFocus();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(document.activeElement).toBe(textarea.element);
    expect(getEditorSelection(textarea.element).from).toBe(1);
    expect(getEditorSelection(textarea.element).to).toBe(1);
    expect(wrapper.get(".table-row-drag-handle").attributes("draggable")).toBe("true");
    wrapper.unmount();
  });
  it("保持单元格编辑和表格工具栏交互", async () => {
    const wrapper = mountTable();
    expect(wrapper.find("table").exists()).toBe(true);
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    expect(wrapper.find(".table-tools").exists()).toBe(false);

    await wrapper.find("tbody td").trigger("mousedown");
    await nextTick();

    expect(wrapper.find(".table-tools").exists()).toBe(true);
    const textarea = wrapper.find<HTMLDivElement>('.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content');
    expect(textarea.isVisible()).toBe(true);

    replaceEditorValue(textarea.element, "已修改");
    await nextTick();
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toContain("| 已修改 | 1 |");
    wrapper.unmount();
  });

  it("表头首行边缘命中 tr 时仍激活对应单元格并立即输入", async () => {
    const wrapper = mountTable("| A | B |\n| --- | --- |\n|  | value |");
    mockTableCellRects(wrapper);
    const rendered = wrapper.get<HTMLElement>("thead th:nth-child(2) .cell-rendered");
    mockPointerCaret(rendered.element.firstChild!, 1);

    dispatchCellMouseDown(wrapper.get("thead tr").element, { clientX: 111, clientY: 21 });
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleCellFocus();

    const editor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="0"][data-table-column="1"] .cm-content',
    );
    expect(wrapper.find(".table-tools").exists()).toBe(true);
    expect(document.activeElement).toBe(editor.element);
    expect(getEditorSelection(editor.element).from).toBe(1);
    replaceEditorValue(editor.element, "BX", 2);
    await nextTick();
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toContain("| A | BX |");
    wrapper.unmount();
  });

  it("分隔线下方命中 table 时仍激活空白单元格并允许输入", async () => {
    const wrapper = mountTable("| A | B |\n| --- | --- |\n|  | value |");
    mockTableCellRects(wrapper);

    dispatchCellMouseDown(wrapper.get("table").element, { clientX: 12, clientY: 51 });
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleCellFocus();

    const editor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(wrapper.find(".table-tools").exists()).toBe(true);
    expect(document.activeElement).toBe(editor.element);
    expect(getEditorSelection(editor.element).from).toBe(0);
    replaceEditorValue(editor.element, "可输入", 3);
    await nextTick();
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toContain("| 可输入 | value |");
    wrapper.unmount();
  });

  it("表格边缘右键命中 table 时选中最近单元格并打开操作菜单", async () => {
    const wrapper = mountTable();
    mockTableCellRects(wrapper);
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 209,
      clientY: 81,
    });

    wrapper.get("table").element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.find(".table-tools").exists()).toBe(true);
    expect(wrapper.find(".table-context-menu").exists()).toBe(true);
    expect(wrapper.get("tbody tr:nth-child(2) td:nth-child(2)").classes()).toContain(
      "table-part-selected",
    );
    wrapper.unmount();
  });

  it("表头和正文单元格的中心、边缘及四角始终支持输入和右键菜单", async () => {
    const wrapper = mountTable("| A | B |\n| --- | --- |\n| left | right |");
    mockTableCellRects(wrapper);
    const table = wrapper.get("table").element;
    const cells = [
      { row: 0, column: 0, left: 10, top: 20 },
      { row: 0, column: 1, left: 110, top: 20 },
      { row: 1, column: 0, left: 10, top: 50 },
      { row: 1, column: 1, left: 110, top: 50 },
    ];

    for (const cell of cells) {
      const points = [
        [cell.left + 50, cell.top + 15],
        [cell.left + 1, cell.top + 15],
        [cell.left + 99, cell.top + 15],
        [cell.left + 50, cell.top + 1],
        [cell.left + 50, cell.top + 29],
        [cell.left + 1, cell.top + 1],
        [cell.left + 99, cell.top + 1],
        [cell.left + 1, cell.top + 29],
        [cell.left + 99, cell.top + 29],
      ];

      for (const [clientX, clientY] of points) {
        const mouseDown = new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          detail: 1,
          clientX,
          clientY,
        });
        table.dispatchEvent(mouseDown);
        dispatchDocumentEvent(new MouseEvent("mouseup", {
          bubbles: true,
          button: 0,
          buttons: 0,
        }));
        await settleCellFocus();

        const editor = wrapper.get<HTMLElement>(
          `.table-cell-inline-editor[data-table-row="${cell.row}"]`
          + `[data-table-column="${cell.column}"] .cm-content`,
        );
        expect(mouseDown.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(editor.element);
        expect(wrapper.find(".table-tools").exists()).toBe(true);

        const updateCount = wrapper.emitted("update")?.length ?? 0;
        const currentValue = getEditorValue(editor.element);
        replaceEditorValue(editor.element, currentValue + "!");
        await nextTick();
        expect(wrapper.emitted("update")?.length).toBe(updateCount + 1);

        dispatchDocumentEvent(new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
        }));
        await settleCellFocus();

        const contextMenu = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX,
          clientY,
        });
        table.dispatchEvent(contextMenu);
        await nextTick();

        expect(contextMenu.defaultPrevented).toBe(true);
        expect(wrapper.find(".table-context-menu").exists()).toBe(true);
        expect(wrapper.get(
          `[data-table-row="${cell.row}"][data-table-column="${cell.column}"]`,
        ).classes()).toContain("table-part-selected");

        dispatchDocumentEvent(new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
        }));
        await settleCellFocus();
      }
    }

    wrapper.unmount();
  });

  it("preserves table hit geometry before opening a context menu", async () => {
    const wrapper = mountTable([
      "| A | B |",
      "| --- | --- |",
      "| [long link](https://example.com/long/path) | value |",
    ].join("\n"));
    mockTableCellRects(wrapper);
    const target = wrapper.get<HTMLTableCellElement>("tbody td:first-child");
    const retargeted = wrapper.get<HTMLTableCellElement>("tbody td:nth-child(2)");

    dispatchCellMouseDown(target.element, { clientX: 40, clientY: 65 });
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 0,
    }));
    await settleCellFocus();

    const editor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    const pointerDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      clientX: 95,
      clientY: 65,
    });
    target.element.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor.element);

    const contextEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 95,
      clientY: 65,
    });
    retargeted.element.dispatchEvent(contextEvent);
    await nextTick();

    expect(contextEvent.defaultPrevented).toBe(true);
    expect(wrapper.find(".table-context-menu").exists()).toBe(true);
    expect(target.classes()).toContain("table-part-selected");
    wrapper.unmount();
  });

  it("routes a collapsed bottom-cell context menu back to its pointer-down cell", async () => {
    const wrapper = mountTable();
    mockTableCellRects(wrapper);
    const target = wrapper.get<HTMLTableCellElement>("tbody tr:nth-child(2) td:first-child");
    const pointerDown = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 2,
      buttons: 2,
      clientX: 95,
      clientY: 105,
    });
    target.element.dispatchEvent(pointerDown);
    expect(pointerDown.defaultPrevented).toBe(true);

    const outside = document.createElement("div");
    document.body.append(outside);
    const contextEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 95,
      clientY: 105,
    });
    outside.dispatchEvent(contextEvent);
    const tableHandle = wrapper.vm as unknown as {
      handleExternalPointerEvent: (event: MouseEvent, type: "mousedown" | "contextmenu") => boolean;
    };

    expect(tableHandle.handleExternalPointerEvent(contextEvent, "contextmenu")).toBe(true);
    await nextTick();
    expect(contextEvent.defaultPrevented).toBe(true);
    expect(wrapper.find(".table-context-menu").exists()).toBe(true);
    expect(target.classes()).toContain("table-part-selected");

    outside.remove();
    wrapper.unmount();
  });

  it("外层底边命中表格时仍能激活空白单元格并输入", async () => {
    const wrapper = mountTable(["| A | B |", "| --- | --- |", "|  | value |"].join(String.fromCharCode(10)));
    mockTableCellRects(wrapper);
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 12,
      clientY: 80,
    });
    wrapper.get(".visual-table-editor").element.dispatchEvent(event);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleCellFocus();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.find(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    ).exists()).toBe(true);
    wrapper.unmount();
  });

  it("滚动容器右边缘命中表格时仍能激活对应单元格", async () => {
    const wrapper = mountTable(["| A | B |", "| --- | --- |", "| value |  |"].join(String.fromCharCode(10)));
    mockTableCellRects(wrapper);
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 210,
      clientY: 65,
    });
    wrapper.get(".table-scroll").element.dispatchEvent(event);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleCellFocus();

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.find(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
    ).exists()).toBe(true);
    wrapper.unmount();
  });

  it("以三像素容差转发半像素边缘外侧两像素点击与右键并支持立即输入", async () => {
    const wrapper = mountTable();
    mockTableCellRects(wrapper, 10.5);
    const outsideContent = document.createElement("div");
    outsideContent.className = "cm-content";
    const outsideLine = document.createElement("div");
    outsideLine.className = "cm-line";
    outsideContent.append(outsideLine);
    document.body.append(outsideContent);
    const tableHandle = wrapper.vm as unknown as {
      getExternalPointerCandidate: (
        event: MouseEvent,
        type: "mousedown" | "contextmenu",
      ) => { distance: number; pending: boolean } | null;
      handleExternalPointerEvent: (event: MouseEvent, type: "mousedown" | "contextmenu") => boolean;
    };

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: 8,
      clientY: 65,
    });
    outsideLine.dispatchEvent(mouseDown);
    expect(tableHandle.getExternalPointerCandidate(mouseDown, "mousedown")).toEqual({
      distance: 2.5,
      pending: false,
    });
    expect(tableHandle.handleExternalPointerEvent(mouseDown, "mousedown")).toBe(true);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleCellFocus();

    const editor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    replaceEditorValue(editor.element, "left-edge");
    await nextTick();
    expect((wrapper.emitted("update") ?? []).at(-1)?.[0]).toContain("| left-edge | 1 |");

    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 8,
      clientY: 65,
    });
    outsideContent.dispatchEvent(contextMenu);
    expect(tableHandle.getExternalPointerCandidate(contextMenu, "contextmenu")).toEqual({
      distance: 2.5,
      pending: false,
    });
    expect(tableHandle.handleExternalPointerEvent(contextMenu, "contextmenu")).toBe(true);
    await nextTick();
    expect(contextMenu.defaultPrevented).toBe(true);
    expect(wrapper.find(".table-context-menu").exists()).toBe(true);

    outsideContent.remove();
    wrapper.unmount();
  });

  it("左右边缘使用对称三像素容差且不拦截三像素外的正文", () => {
    const wrapper = mountTable();
    mockTableCellRects(wrapper, 10.5);
    const outside = document.createElement("div");
    outside.className = "cm-line";
    document.body.append(outside);
    const tableHandle = wrapper.vm as unknown as {
      getExternalPointerCandidate: (
        event: MouseEvent,
        type: "mousedown" | "contextmenu",
      ) => { distance: number; pending: boolean } | null;
      handleExternalPointerEvent: (event: MouseEvent, type: "mousedown" | "contextmenu") => boolean;
    };

    const rightEdge = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 213,
      clientY: 65,
    });
    outside.dispatchEvent(rightEdge);
    expect(tableHandle.getExternalPointerCandidate(rightEdge, "mousedown")).toEqual({
      distance: 2.5,
      pending: false,
    });

    const farText = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 7.49,
      clientY: 65,
    });
    outside.dispatchEvent(farText);
    expect(tableHandle.getExternalPointerCandidate(farText, "mousedown")).toBeNull();
    expect(tableHandle.handleExternalPointerEvent(farText, "mousedown")).toBe(false);
    expect(farText.defaultPrevented).toBe(false);

    outside.remove();
    wrapper.unmount();
  });

  it("uses pointer coordinates when a child visually overflows into an adjacent cell", async () => {
    const wrapper = mountTable("| A | B |\n| --- | --- |\n| left | right |");
    mockTableCellRects(wrapper);
    const firstRendered = wrapper.get<HTMLElement>(
      "tbody td:first-child .cell-rendered",
    );
    const overflow = document.createElement("kbd");
    overflow.textContent = "overflow";
    vi.spyOn(overflow, "getBoundingClientRect").mockReturnValue(createDomRect(125, 55, 70, 20));
    firstRendered.element.append(overflow);

    dispatchCellMouseDown(overflow, { clientX: 150, clientY: 65 });
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 0,
    }));
    await settleCellFocus();

    const editor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
    );
    expect(document.activeElement).toBe(editor.element);
    replaceEditorValue(editor.element, "covered-cell");
    await nextTick();
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toContain("| left | covered-cell |");
    wrapper.unmount();
  });

  it("hits the outer table border inside a contenteditable editor host", async () => {
    const host = document.createElement("div");
    host.contentEditable = "true";
    document.body.append(host);
    const wrapper = mountTable(
      ["| A | B |", "| --- | --- |", "|  | value |"].join("\n"),
      { attachTo: host },
    );

    try {
      mockTableCellRects(wrapper);
      const pointerEvent = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        detail: 1,
        clientX: 12,
        clientY: 80,
      });
      wrapper.get(".visual-table-editor").element.dispatchEvent(pointerEvent);
      document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
      }));
      await settleCellFocus();

      expect(pointerEvent.defaultPrevented).toBe(true);
      expect(wrapper.find(".table-tools").exists()).toBe(true);
      expect(wrapper.find(
        '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      ).exists()).toBe(true);

      const contextEvent = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: true,
        clientX: 210,
        clientY: 80,
      });
      wrapper.get(".table-scroll").element.dispatchEvent(contextEvent);
      await nextTick();

      expect(contextEvent.defaultPrevented).toBe(true);
      expect(wrapper.find(".table-context-menu").exists()).toBe(true);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  it("focuses the owning cell when a row or column drag handle is clicked", async () => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[1].trigger("mousedown");
    await settleCellFocus();

    await wrapper.findAll(".table-row-drag-handle")[1].trigger("click");
    await settleCellFocus();
    const rowEditor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="2"][data-table-column="0"] .cm-content',
    );
    expect(document.activeElement).toBe(rowEditor.element);
    replaceEditorValue(rowEditor.element, "row-handle-input");
    await nextTick();
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toContain("| row-handle-input | 2 |");

    await wrapper.findAll(".table-column-drag-handle")[1].trigger("click");
    await settleCellFocus();
    const headerEditor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="0"][data-table-column="1"] .cm-content',
    );
    expect(document.activeElement).toBe(headerEditor.element);
    wrapper.unmount();
  });

  it("远离表格的外层空白点击不拦截正文输入", async () => {
    const wrapper = mountTable();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 420,
      clientY: 260,
    });
    wrapper.get(".visual-table-editor").element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.find(".table-cell-inline-editor").exists()).toBe(false);
    expect(wrapper.find(".table-tools").exists()).toBe(false);
    expect(wrapper.emitted("focus")).toBeUndefined();
    wrapper.unmount();
  });
  it("首次点击表头和普通格时按行首、中间、行尾定位光标", async () => {
    const cases = [
      {
        cellSelector: "thead th:first-child",
        textareaSelector: '.table-cell-inline-editor[data-table-row="0"][data-table-column="0"] .cm-content',
        offset: 0,
        clientX: 18,
      },
      {
        cellSelector: "tbody tr:first-child td:first-child",
        textareaSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
        offset: 1,
        clientX: 54,
      },
      {
        cellSelector: "tbody tr:nth-child(2) td:first-child",
        textareaSelector: '.table-cell-inline-editor[data-table-row="2"][data-table-column="0"] .cm-content',
        offset: 3,
        clientX: 96,
      },
    ];

    for (const current of cases) {
      const wrapper = mountTable();
      const rendered = wrapper.get<HTMLElement>(`${current.cellSelector} .cell-rendered`);
      const caretPositionFromPoint = mockPointerCaret(rendered.element.firstChild!, current.offset);

      dispatchCellMouseDown(rendered.element, { clientX: current.clientX, clientY: 24 });
      await settleCellFocus();

      const textarea = wrapper.get<HTMLDivElement>(current.textareaSelector);
      expect(caretPositionFromPoint).toHaveBeenCalledWith(current.clientX, 24);
      expect(document.activeElement).toBe(textarea.element);
      expect(getEditorSelection(textarea.element).from).toBe(current.offset);
      expect(getEditorSelection(textarea.element).to).toBe(current.offset);
      wrapper.unmount();
    }
    Reflect.deleteProperty(document, "caretPositionFromPoint");
  });

  it("首次点击后可在命中位置立即输入", async () => {
    const wrapper = mountTable();
    const rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 1);

    dispatchCellMouseDown(rendered.element, { clientX: 54, clientY: 48 });
    await settleCellFocus();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(getEditorSelection(textarea.element).from).toBe(1);
    replaceEditorValue(textarea.element, "第X一行", 2);
    setEditorSelectionRange(textarea.element, 2, 2);


    expect(wrapper.emitted("update")?.at(-1)?.[0]).toContain("| 第X一行 | 1 |");
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    wrapper.unmount();
  });

  it("emits selection and focus once for a direct cell click", async () => {
    const wrapper = mountTable();
    const rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 1);

    dispatchCellMouseDown(rendered.element, { clientX: 54, clientY: 48 });
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 0,
    }));
    await settleCellFocus();

    expect(wrapper.findAll(".table-cell-inline-editor")).toHaveLength(1);
    expect(wrapper.emitted("selection")).toHaveLength(1);
    expect(wrapper.emitted("focus")).toHaveLength(1);
    wrapper.unmount();
  });

  it("首次拖入未激活单元格时选择文本并可立即替换", async () => {
    const posAtCoords = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValue(2);
    const wrapper = mountTable("| Value |\n| --- |\n| alpha |");

    try {
      const rendered = wrapper.get<HTMLElement>(
        "tbody tr:first-child td:first-child .cell-rendered",
      );
      mockPointerCaret(rendered.element.firstChild!, 0);

      dispatchCellMouseDown(rendered.element, { clientX: 100, clientY: 60 });
      await settleCellFocus();
      const editor = wrapper.get<HTMLDivElement>(
        '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      );
      const moveEvent = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 125,
        clientY: 60,
      });
      dispatchDocumentEvent(moveEvent);
      document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
      }));

      expect(moveEvent.defaultPrevented).toBe(true);
      expect(posAtCoords).toHaveBeenCalledWith({ x: 125, y: 60 });
      expect(getEditorSelection(editor.element).from).toBe(0);
      expect(getEditorSelection(editor.element).to).toBe(2);
      expect(getEditorSelectionDirection(editor.element)).toBe("forward");
      expect(wrapper.emitted("selection")?.at(-1)?.[0]).toBe("al");

      replaceEditorValue(editor.element, "Xpha", 1);
      expect(wrapper.emitted("update")?.at(-1)?.[0]).toContain("| Xpha |");
    } finally {
      wrapper.unmount();
    }
  });

it("首次拖选渲染链接文本时保留含空格 URL", async () => {
    const posAtCoords = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValue(6);
    const linkSource = "[alpha beta](<https://example.com/a b>)";
    const wrapper = mountTable(`| Value |\n| --- |\n| ${linkSource} |`);

    try {
      const anchor = wrapper.get<HTMLAnchorElement>("tbody td .cell-rendered a");
      mockPointerCaret(anchor.element.firstChild!, 0);

      dispatchCellMouseDown(anchor.element, { clientX: 100, clientY: 60 });
      await settleCellFocus();
      const editor = wrapper.get<HTMLDivElement>(
        '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      );
      const moveEvent = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 160,
        clientY: 60,
      });
      dispatchDocumentEvent(moveEvent);
      document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
      }));
      anchor.element.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
        clientX: 160,
        clientY: 60,
      }));

      expect(moveEvent.defaultPrevented).toBe(true);
      expect(posAtCoords).toHaveBeenCalledWith({ x: 160, y: 60 });
      expect(document.activeElement).toBe(editor.element);
      expect(getEditorSelection(editor.element).from).toBe(1);
      expect(getEditorSelection(editor.element).to).toBe(6);
      expect(wrapper.emitted("selection")?.at(-1)?.[0]).toBe("alpha");
      expect(wrapper.emitted("openLink")).toBeUndefined();

      replaceEditorValue(editor.element, "[X beta](<https://example.com/a b>)", 2);
      expect(wrapper.emitted("update")?.at(-1)?.[0])
        .toContain("[X beta](<https://example.com/a b>)");
    } finally {
      wrapper.unmount();
    }
  });

it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
  ])("opens a rendered link with %s+click without starting a drag", async (_label, modifier) => {
    const wrapper = mountTable(
      "| Value |\n| --- |\n| [alpha](<https://example.com/a b>) |",
    );
    const anchor = wrapper.get<HTMLAnchorElement>("tbody td .cell-rendered a");
    mockPointerCaret(anchor.element.firstChild!, 0);

    dispatchCellMouseDown(anchor.element, {
      clientX: 100,
      clientY: 60,
      ...modifier,
    });
    await settleCellFocus();
    const moveEvent = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 180,
      clientY: 60,
    });
    dispatchDocumentEvent(moveEvent);
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 0,
    }));
    anchor.element.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 1,
      clientX: 100,
      clientY: 60,
      ...modifier,
    }));

    expect(moveEvent.defaultPrevented).toBe(false);
    expect(wrapper.emitted("selection")).toBeUndefined();
    expect(wrapper.emitted("openLink")).toEqual([[anchor.attributes("href")]]);
    expect(wrapper.find(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"]',
    ).exists()).toBe(false);
    wrapper.unmount();
  });

  it("在工具栏出现后以相同坐标物理双击选择单词", async () => {
    const source = "| Value |\n| --- |\n| alpha beta gamma |";
    const pointerPoint = { clientX: 70, clientY: 48 };
    const wrapper = mountTable(source);
    const rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 8);

    dispatchCellMouseDown(rendered.element, pointerPoint);
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      ...pointerPoint,
    }));
    await settleCellFocus();

    expect(wrapper.find(".table-tools").exists()).toBe(true);
    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(getEditorSelection(textarea.element).from).toBe(8);
    expect(getEditorSelection(textarea.element).to).toBe(8);
    const activeCaret = mockPointerCaret(textarea.get<HTMLElement>(".cm-line").element.firstChild!, 8);

    const secondMouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      detail: 2,
      ...pointerPoint,
    });
    dispatchEditorDomEvent(textarea.element, secondMouseDown);
    dispatchEditorDomEvent(textarea.element, new MouseEvent("mouseup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      detail: 2,
      ...pointerPoint,
    }));
    dispatchEditorDomEvent(textarea.element, new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
      ...pointerPoint,
    }));
    const doubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
      ...pointerPoint,
    });
    dispatchEditorDomEvent(textarea.element, doubleClick);

    expect(activeCaret).toHaveBeenCalledWith(pointerPoint.clientX, pointerPoint.clientY);
    expect(secondMouseDown.defaultPrevented).toBe(true);
    expect(doubleClick.defaultPrevented).toBe(true);
    expect(getEditorSelection(textarea.element).from).toBe(6);
    expect(getEditorSelection(textarea.element).to).toBe(10);
    expect(wrapper.emitted("selection")?.at(-1)?.[0]).toBe("beta");
    wrapper.unmount();
  });
  it("长单元格拖选仅按每个指针点查询一次 CodeMirror 几何位置", async () => {
    const value = "x".repeat(256);
    const posAtCoords = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockImplementation((point) => Math.max(0, Math.min(
        value.length,
        Math.round((point.x - 100) / 2),
      )));
    const wrapper = mountTable("| Value |\n| --- |\n| " + value + " |");

    try {
      const rendered = wrapper.get<HTMLElement>(
        "tbody tr:first-child td:first-child .cell-rendered",
      );
      mockPointerCaret(rendered.element.firstChild!, 0);

      dispatchCellMouseDown(rendered.element, { clientX: 100, clientY: 60 });
      await settleCellFocus();
      const editor = wrapper.get<HTMLDivElement>(
        '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      );
      dispatchDocumentEvent(new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 120,
        clientY: 60,
      }));
      expect(posAtCoords).toHaveBeenCalledTimes(1);

      dispatchDocumentEvent(new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 200,
        clientY: 60,
      }));
      dispatchDocumentEvent(new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 300,
        clientY: 60,
      }));
      document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
      }));

      expect(posAtCoords).toHaveBeenCalledTimes(3);
      expect(getEditorSelection(editor.element).from).toBe(0);
      expect(getEditorSelection(editor.element).to).toBe(100);
    } finally {
      wrapper.unmount();
    }
  });

it.each(["outside mousedown", "readonly switch"])(
    "stops inactive-cell drag listeners after %s",
    async (mode) => {
      const wrapper = mountTable("| Value |\n| --- |\n| alpha |");
      const rendered = wrapper.get<HTMLElement>(
        "tbody tr:first-child td:first-child .cell-rendered",
      );
      mockPointerCaret(rendered.element.firstChild!, 0);

      dispatchCellMouseDown(rendered.element, { clientX: 100, clientY: 60 });
      await settleCellFocus();
      const textarea = wrapper.get<HTMLDivElement>(
        '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      );
      if (mode === "outside mousedown") {
        document.body.dispatchEvent(new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
        }));
      } else {
        await wrapper.setProps({ readonly: true });
        await wrapper.setProps({ readonly: false });
      }

      await wrapper.get(".visual-table-editor").trigger("focusin");
      const moveEvent = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 200,
        clientY: 60,
      });
      dispatchDocumentEvent(moveEvent);
      document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
      }));

      expect(moveEvent.defaultPrevented).toBe(false);
      expect(getEditorSelection(textarea.element).from).toBe(0);
      expect(getEditorSelection(textarea.element).to).toBe(0);
      wrapper.unmount();
    },
  );

  it.each([
    { label: "Intl.Segmenter", disableSegmenter: false },
    { label: "本地回退算法", disableSegmenter: true },
  ])("使用 $label 时保持 Emoji ZWJ 和组合字符边界完整", async ({
    disableSegmenter,
  }) => {
    const value = "A\u{1F469}\u200D\u{1F4BB}e\u0301Z";
    const originalSegmenter = Object.getOwnPropertyDescriptor(Intl, "Segmenter");
    if (disableSegmenter) {
      Object.defineProperty(Intl, "Segmenter", {
        configurable: true,
        value: undefined,
      });
    }
    const posAtCoords = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockImplementation((point) => point.x < 170 ? 4 : 8);
    const wrapper = mountTable("| Value |\n| --- |\n| " + value + " |");

    try {
      const rendered = wrapper.get<HTMLElement>(
        "tbody tr:first-child td:first-child .cell-rendered",
      );
      mockPointerCaret(rendered.element.firstChild!, 3);

      dispatchCellMouseDown(rendered.element, { clientX: 130, clientY: 60 });
      await settleCellFocus();
      const editor = wrapper.get<HTMLDivElement>(
        '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      );
      expect(getEditorSelection(editor.element).from).toBe(1);
      expect(getEditorSelection(editor.element).to).toBe(1);

      dispatchDocumentEvent(new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 160,
        clientY: 60,
      }));
      expect(posAtCoords).toHaveBeenLastCalledWith({ x: 160, y: 60 });
      expect(getEditorSelection(editor.element).from).toBe(1);
      expect(getEditorSelection(editor.element).to).toBe(6);
      expect(wrapper.emitted("selection")?.at(-1)?.[0]).toBe(value.slice(1, 6));

      dispatchDocumentEvent(new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 180,
        clientY: 60,
      }));
      document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
        buttons: 0,
      }));
      expect(posAtCoords).toHaveBeenLastCalledWith({ x: 180, y: 60 });
      expect(getEditorSelection(editor.element).from).toBe(1);
      expect(getEditorSelection(editor.element).to).toBe(8);
      expect(wrapper.emitted("selection")?.at(-1)?.[0]).toBe(value.slice(1, 8));
    } finally {
      wrapper.unmount();
      if (disableSegmenter) {
        if (originalSegmenter) {
          Object.defineProperty(Intl, "Segmenter", originalSegmenter);
        } else {
          Reflect.deleteProperty(Intl, "Segmenter");
        }
      }
    }
  });

it("点击渲染后的 Markdown 文本时映射回对应源码位置", async () => {
    const source = "| **标题** |\n| --- |\n| 内容 |";
    const wrapper = mountTable(source);
    const rendered = wrapper.get<HTMLElement>("thead th .cell-rendered");
    const text = rendered.get("strong").element.firstChild!;
    mockPointerCaret(text, 1);

    dispatchCellMouseDown(rendered.element, { clientX: 42, clientY: 18 });
    await settleCellFocus();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="0"][data-table-column="0"] .cm-content',
    );
    expect(wrapper.getComponent(TableCellInlineEditor).props("value")).toBe("**标题**");
    expect(getEditorSelection(textarea.element).from).toBe(3);
    expect(getEditorSelection(textarea.element).to).toBe(3);
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    wrapper.unmount();
  });

  it("不支持 caretPositionFromPoint 时使用 WebKit caretRangeFromPoint 定位", async () => {
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    const wrapper = mountTable();
    const rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    const caretRangeFromPoint = mockPointerRange(rendered.element.firstChild!, 2);

    dispatchCellMouseDown(rendered.element, { clientX: 72, clientY: 48 });
    await settleCellFocus();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(caretRangeFromPoint).toHaveBeenCalledWith(72, 48);
    expect(getEditorSelection(textarea.element).from).toBe(2);
    expect(getEditorSelection(textarea.element).to).toBe(2);
    wrapper.unmount();
  });

  it("同一单元格重新激活时 Shift+点击从原光标扩展选区", async () => {
    const wrapper = mountTable();
    let rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 1);
    dispatchCellMouseDown(rendered.element, { clientX: 42, clientY: 48 });
    await settleCellFocus();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    textarea.element.blur();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await nextTick();

    rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 3);
    await withoutSynchronousSelectionChangeAsync(async () => {
      dispatchCellMouseDown(rendered.element, { clientX: 86, clientY: 48, shiftKey: true });
      await settleCellFocus();
    });

    const reactivated = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(getEditorSelection(reactivated.element).from).toBe(1);
    expect(getEditorSelection(reactivated.element).to).toBe(3);
    expect(getEditorSelectionDirection(reactivated.element)).toBe("forward");
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    wrapper.unmount();
  });

  it("同一单元格重新激活时 Shift+点击可向前反向扩展选区", async () => {
    const wrapper = mountTable();
    let rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 3);
    dispatchCellMouseDown(rendered.element, { clientX: 86, clientY: 48 });
    await settleCellFocus();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    textarea.element.blur();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await nextTick();

    rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 1);
    await withoutSynchronousSelectionChangeAsync(async () => {
      dispatchCellMouseDown(rendered.element, { clientX: 42, clientY: 48, shiftKey: true });
      await settleCellFocus();
    });

    const reactivated = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(getEditorSelection(reactivated.element).from).toBe(1);
    expect(getEditorSelection(reactivated.element).to).toBe(3);
    expect(getEditorSelectionDirection(reactivated.element)).toBe("backward");
    wrapper.unmount();
  });

  it("跨单元格 Shift+点击在目标格折叠光标而不制造跨控件选区", async () => {
    const wrapper = mountTable();
    let rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 1);
    dispatchCellMouseDown(rendered.element, { clientX: 42, clientY: 48 });
    await settleCellFocus();

    const firstTextarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    firstTextarea.element.blur();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await nextTick();

    rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:nth-child(2) .cell-rendered",
    );
    mockPointerCaret(rendered.element.firstChild!, 0);
    dispatchCellMouseDown(rendered.element, { clientX: 120, clientY: 48, shiftKey: true });
    await settleCellFocus();

    const target = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
    );
    expect(document.activeElement).toBe(target.element);
    expect(getEditorSelection(target.element).from).toBe(0);
    expect(getEditorSelection(target.element).to).toBe(0);
    wrapper.unmount();
  });

  it("字符命中 API 不可用时使用 CodeMirror 坐标定位", async () => {
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    const posAtCoords = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValue(2);
    const wrapper = mountTable();
    const rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );

    dispatchCellMouseDown(rendered.element, { clientX: 125, clientY: 60 });
    await settleCellFocus();

    const editor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(posAtCoords).toHaveBeenCalledWith({ x: 125, y: 60 });
    expect(getEditorSelection(editor.element).from).toBe(2);
    expect(getEditorSelection(editor.element).to).toBe(2);
    wrapper.unmount();
  });

it("CodeMirror 坐标不可用时按编辑器水平比例回退", async () => {
    Reflect.deleteProperty(document, "caretPositionFromPoint");
    Reflect.deleteProperty(document, "caretRangeFromPoint");
    const posAtCoords = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains("table-cell-inline-editor")
          ? createDomRect(100, 50, 120, 28)
          : createDomRect(0, 0, 800, 600);
      });
    const wrapper = mountTable();
    const rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );

    dispatchCellMouseDown(rendered.element, { clientX: 160, clientY: 60 });
    await settleCellFocus();

    const editor = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    expect(posAtCoords).toHaveBeenCalledWith({ x: 160, y: 60 });
    expect(getEditorSelection(editor.element).from).toBe(2);
    expect(getEditorSelection(editor.element).to).toBe(2);
    wrapper.unmount();
  });

it("只读表格点击保持预览且不进入坐标定位或编辑状态", async () => {
    const wrapper = mountTable(tableSource, { readonly: true });
    const rendered = wrapper.get<HTMLElement>(
      "tbody tr:first-child td:first-child .cell-rendered",
    );
    const caretPositionFromPoint = mockPointerCaret(rendered.element.firstChild!, 1);

    dispatchCellMouseDown(rendered.element, { clientX: 54, clientY: 48 });
    await settleCellFocus();

    expect(caretPositionFromPoint).not.toHaveBeenCalled();
    expect(wrapper.find(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"]',
    ).exists()).toBe(false);
    expect(wrapper.find(".table-tools").exists()).toBe(false);
    expect(wrapper.find(".table-row-drag-handle").exists()).toBe(false);
    expect(wrapper.emitted("focus")).toBeUndefined();
    expect(wrapper.emitted("update")).toBeUndefined();
    wrapper.unmount();
  });

  it("mounts tables whose separator cells use one hyphen", () => {
    const wrapper = mountTable("| A | B |\n| - | :-: |\n| 1 | 2 |");

    expect(wrapper.find("table").exists()).toBe(true);
    expect(wrapper.findAll("thead th")).toHaveLength(2);
    expect(wrapper.findAll("tbody td")).toHaveLength(2);
    wrapper.unmount();
  });

  it("emits one isolated history group for an IME composition", async () => {
    const wrapper = mountTable();
    await wrapper.find("tbody td").trigger("mousedown");
    await nextTick();
    const cell = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );

    await cell.trigger("compositionstart");
    replaceEditorValue(cell.element, "中", 1, 1, "input.type.compose");
    await nextTick();
    await cell.trigger("compositionend");
    replaceEditorValue(cell.element, "中文", 2, 2, "input.type.compose");
    await nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    replaceEditorValue(cell.element, "中文末");
    await nextTick();

    const updates = wrapper.emitted("update") ?? [];
    expect(updates).toHaveLength(3);
    expect(updates[0]?.[1]).toBe("input");
    expect(updates[0]?.[2]).toBe(updates[1]?.[2]);
    expect(updates[0]?.[3]).toBe("input.type.compose.start");
    expect(updates[1]?.[3]).toBe("input.type.compose");
    expect(updates[2]?.[2]).not.toBe(updates[1]?.[2]);
    expect(updates[2]?.[3]).toBeUndefined();
    wrapper.unmount();
  });

  it("按表格行内语义渲染块标记、全文脚注和本地资源", () => {
    const source = [
      "| Heading | Rule | Toc | Note | Image |",
      "| --- | --- | --- | --- | --- |",
      "| # Heading | --- | [TOC] | A[^a] | ![Logo](/assets/logo.png) |",
    ].join("\n");
    const documentSource = [
      "---",
      "typora-root-url: 'C:/website'",
      "---",
      "",
      "Before[^b]",
      "",
      "Math $x[^fake]$",
      "",
      source,
      "",
      "[^a]: Alpha note",
      "[^b]: Beta note",
      "[^fake]: Not a reference",
    ].join("\n");
    const resolver = vi.fn((path: string) => "asset://" + path);
    const wrapper = mountTable(source, {
      documentSource,
      sourceOffset: documentSource.indexOf(source),
      filePath: "C:/docs/current.md",
      assetResolver: resolver,
    });

    const rendered = wrapper.findAll(".cell-rendered");
    expect(rendered).toHaveLength(10);
    expect(wrapper.find(".cell-rendered h1").exists()).toBe(false);
    expect(wrapper.find(".cell-rendered hr").exists()).toBe(false);
    expect(wrapper.find(".cell-rendered .toc-inline").exists()).toBe(false);
    expect(wrapper.find(".cell-rendered .footnotes").exists()).toBe(false);
    expect(rendered[5].text()).toContain("# Heading");
    expect(rendered[6].text()).toContain("—");
    expect(rendered[7].text()).toContain("[TOC]");
    expect(rendered[8].get(".footnote-ref a").text()).toBe("[2]");
    expect(rendered[8].get(".footnote-ref a").attributes("href")).toBe("#fn2");
    expect(rendered[8].get(".footnote-ref a").attributes("title")).toBe("Alpha note");
    expect(rendered[9].get("img").attributes("src")).toBe("asset://C:/website/assets/logo.png");
    expect(resolver).toHaveBeenCalledWith("C:/website/assets/logo.png");
    wrapper.unmount();
  });

  it("复制行 HTML 时继续使用表格行内语义", async () => {
    const source = [
      "| Heading | Rule | Toc |",
      "| --- | --- | --- |",
      "| # Heading | --- | [TOC] |",
    ].join("\n");
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.stubGlobal("ClipboardItem", undefined);
    const wrapper = mountTable(source);

    await wrapper.find("tbody td").trigger("mousedown");
    await nextTick();
    expect(wrapper.vm.runCommand("selectTableRow")).toBe("handled");
    expect(wrapper.vm.runCommand("copyHtml")).toBe("handled");
    await Promise.resolve();

    const html = String(writeText.mock.calls.at(-1)?.[0] ?? "");
    expect(html).toContain("<table>");
    expect(html).toContain("# Heading");
    expect(html).toContain("[TOC]");
    expect(html).not.toMatch(/<h1|<hr|toc-inline|footnotes/);
    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it("支持一列表格并阻止删除最后一列", async () => {
    const source = "| 标题 |\n| --- |\n| 内容 |";
    const wrapper = mountTable(source);

    expect(wrapper.findAll("thead th")).toHaveLength(1);
    expect(wrapper.findAll("tbody td")).toHaveLength(1);
    await wrapper.find("tbody td").trigger("mousedown");
    await nextTick();
    await wrapper.get('button[title="更多表格操作"]').trigger("click");
    const deleteColumn = wrapper.findAll('button[role="menuitem"]')
      .find((button) => button.text() === "删除当前列");
    expect(deleteColumn?.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("通过 6×10 尺寸面板和数字输入调整表格大小", async () => {
    const gridWrapper = mountTable();
    await gridWrapper.find("tbody td").trigger("mousedown");
    await nextTick();
    await gridWrapper.get('button[title="调整表格大小"]').trigger("click");

    expect(gridWrapper.findAll(".table-size-cell")).toHaveLength(60);
    await gridWrapper.get('[data-size-columns="3"][data-size-rows="4"]').trigger("click");
    const gridResult = parseVisualTable(
      String(gridWrapper.emitted("update")?.at(-1)?.[0] ?? ""),
    );
    expect(gridResult?.headers).toHaveLength(3);
    expect(gridResult?.rows).toHaveLength(4);
    gridWrapper.unmount();

    const inputWrapper = mountTable();
    await inputWrapper.find("tbody td").trigger("mousedown");
    await nextTick();
    await inputWrapper.get('button[title="调整表格大小"]').trigger("click");
    await inputWrapper.get('input[aria-label="列数"]').setValue("1");
    await inputWrapper.get('input[aria-label="数据行数"]').setValue("3");
    await inputWrapper.get(".table-size-inputs").trigger("submit");

    const inputResult = parseVisualTable(
      String(inputWrapper.emitted("update")?.at(-1)?.[0] ?? ""),
    );
    expect(inputResult?.headers).toHaveLength(1);
    expect(inputResult?.rows).toHaveLength(3);
    inputWrapper.unmount();
  });

  it("通过边缘手柄拖放重排行和列", async () => {
    const rowWrapper = mountTable();
    await rowWrapper.find("tbody td").trigger("mousedown");
    await nextTick();
    await rowWrapper.get('[data-row-drag-index="0"]').trigger("dragstart");
    await rowWrapper.findAll("tbody tr")[1].trigger("dragover");
    await rowWrapper.findAll("tbody tr")[1].trigger("drop");
    expect(rowWrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "| 第二行 | 2 |",
      "| 第一行 | 1 |",
    ].join("\n"));
    rowWrapper.unmount();

    const columnWrapper = mountTable();
    await columnWrapper.find("thead th").trigger("mousedown");
    await nextTick();
    await columnWrapper.get('[data-column-drag-index="0"]').trigger("dragstart");
    await columnWrapper.findAll("thead th")[1].trigger("dragover");
    await columnWrapper.findAll("thead th")[1].trigger("drop");
    expect(columnWrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| 数量 | 名称 |",
      "| ---: | --- |",
      "| 1 | 第一行 |",
      "| 2 | 第二行 |",
    ].join("\n"));
    columnWrapper.unmount();
  });

  it("普通 Enter 在无选区时全选同列下一格", async () => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await nextTick();

    const current = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    setEditorSelectionRange(current.element, 1, 1);
    await current.trigger("keydown", { key: "Enter" });
    await nextTick();

    const next = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="2"][data-table-column="0"] .cm-content',
    );
    expect(document.activeElement).toBe(next.element);
    expect(getEditorSelection(next.element).from).toBe(0);
    expect(getEditorSelection(next.element).to).toBe(getEditorValue(next.element).length);
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("exitDown")).toBeUndefined();
    wrapper.unmount();
  });

  it("普通 Enter 先删除当前选区，再将下一格光标置于开头", async () => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await nextTick();

    const current = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    setEditorSelectionRange(current.element, 0, 2);
    await current.trigger("keydown", { key: "Enter" });
    await nextTick();

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "| 行 | 1 |",
      "| 第二行 | 2 |",
    ].join("\n"));
    const next = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="2"][data-table-column="0"] .cm-content',
    );
    expect(document.activeElement).toBe(next.element);
    expect(getEditorSelection(next.element).from).toBe(0);
    expect(getEditorSelection(next.element).to).toBe(0);
    expect(wrapper.emitted("exitDown")).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    { shortcut: "Shift+Enter", modifier: {} },
    { shortcut: "Ctrl+Shift+Enter", modifier: { ctrlKey: true } },
    { shortcut: "Cmd+Shift+Enter", modifier: { metaKey: true } },
    { shortcut: "Alt+Shift+Enter", modifier: { altKey: true } },
  ])("$shortcut 用 br 标签替换当前选区并留在原单元格", async ({ modifier }) => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await nextTick();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    setEditorSelectionRange(textarea.element, 1, 2);
    await textarea.trigger("keydown", { key: "Enter", shiftKey: true, ...modifier });
    await nextTick();

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "| 第<br />行 | 1 |",
      "| 第二行 | 2 |",
    ].join("\n"));
    expect(document.activeElement).toBe(textarea.element);
    expect(wrapper.emitted("exitDown")).toBeUndefined();
    expect(wrapper.emitted("editorCommand")).toBeUndefined();
    wrapper.unmount();
  });

  it("单元格开头 Backspace 跨到前一行末格且不修改源码", async () => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[2].trigger("mousedown");
    await nextTick();

    const current = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="2"][data-table-column="0"] .cm-content',
    );
    setEditorSelectionRange(current.element, 0, 0);
    await current.trigger("keydown", { key: "Backspace" });
    await nextTick();

    const previous = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
    );
    expect(document.activeElement).toBe(previous.element);
    expect(getEditorSelection(previous.element).from).toBe(getEditorValue(previous.element).length);
    expect(getEditorSelection(previous.element).to).toBe(getEditorValue(previous.element).length);
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("delete")).toBeUndefined();
    wrapper.unmount();
  });

  it("仅在所有表头和数据格精确为空时用首格 Backspace 删除整表", async () => {
    const emptySource = "|  |  |\n| --- | --- |\n|  |  |";
    const emptyWrapper = mountTable(emptySource);
    await emptyWrapper.findAll("thead th")[0].trigger("mousedown");
    await nextTick();

    const emptyCell = emptyWrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="0"][data-table-column="0"] .cm-content',
    );
    setEditorSelectionRange(emptyCell.element, 0, 0);
    await emptyCell.trigger("keydown", { key: "Backspace" });
    expect(emptyWrapper.emitted("delete")).toHaveLength(1);
    expect(emptyWrapper.emitted("update")).toBeUndefined();
    emptyWrapper.unmount();

    const whitespaceWrapper = mountTable(emptySource);
    await whitespaceWrapper.findAll("thead th")[0].trigger("mousedown");
    await nextTick();
    const whitespaceCell = whitespaceWrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="0"][data-table-column="0"] .cm-content',
    );
    replaceEditorValue(whitespaceCell.element, " ");
    await nextTick();
    setEditorSelectionRange(whitespaceCell.element, 0, 0);
    await whitespaceCell.trigger("keydown", { key: "Backspace" });
    expect(whitespaceWrapper.emitted("delete")).toBeUndefined();
    whitespaceWrapper.unmount();
  });

  it.each([
    {
      shortcut: "Alt+↑",
      targetIndex: 2,
      key: "ArrowUp",
      selectionStart: 1,
      selectionEnd: 2,
      focusSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      expected: [
        "| 名称 | 数量 |",
        "| --- | ---: |",
        "| 第二行 | 2 |",
        "| 第一行 | 1 |",
      ].join("\n"),
    },
    {
      shortcut: "Alt+↓",
      targetIndex: 0,
      key: "ArrowDown",
      selectionStart: 1,
      selectionEnd: 2,
      focusSelector: '.table-cell-inline-editor[data-table-row="2"][data-table-column="0"] .cm-content',
      expected: [
        "| 名称 | 数量 |",
        "| --- | ---: |",
        "| 第二行 | 2 |",
        "| 第一行 | 1 |",
      ].join("\n"),
    },
    {
      shortcut: "Alt+←",
      targetIndex: 1,
      key: "ArrowLeft",
      selectionStart: 0,
      selectionEnd: 0,
      focusSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      expected: [
        "| 数量 | 名称 |",
        "| ---: | --- |",
        "| 1 | 第一行 |",
        "| 2 | 第二行 |",
      ].join("\n"),
    },
    {
      shortcut: "Alt+→",
      targetIndex: 0,
      key: "ArrowRight",
      selectionStart: 0,
      selectionEnd: 0,
      focusSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
      expected: [
        "| 数量 | 名称 |",
        "| ---: | --- |",
        "| 1 | 第一行 |",
        "| 2 | 第二行 |",
      ].join("\n"),
    },
  ])("使用 $shortcut 移动当前行列并保持焦点", async ({
    targetIndex,
    key,
    focusSelector,
    expected,
    selectionStart,
    selectionEnd,
  }) => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[targetIndex].trigger("mousedown");
    await nextTick();
    const textarea = document.activeElement as HTMLDivElement;
    setEditorSelectionRange(textarea, selectionStart, selectionEnd);
    textarea.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      altKey: true,
      bubbles: true,
      cancelable: true,
    }));
    await nextTick();

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe(expected);
    const focused = wrapper.get<HTMLDivElement>(focusSelector);
    expect(document.activeElement).toBe(focused.element);
    expect(getEditorSelection(focused.element).from).toBe(selectionStart);
    expect(getEditorSelection(focused.element).to).toBe(selectionEnd);
    expect(wrapper.emitted("editorCommand")).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    { shortcut: "Alt+↑", targetIndex: 0, key: "ArrowUp" },
    { shortcut: "Alt+↓", targetIndex: 2, key: "ArrowDown" },
    { shortcut: "Alt+←", targetIndex: 0, key: "ArrowLeft" },
    { shortcut: "Alt+→", targetIndex: 1, key: "ArrowRight" },
  ])("在边界使用 $shortcut 时不移动行列", async ({ targetIndex, key }) => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[targetIndex].trigger("mousedown");
    await nextTick();
    const textarea = document.activeElement as HTMLDivElement;
    textarea.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      altKey: true,
      bubbles: true,
      cancelable: true,
    }));
    await nextTick();

    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("editorCommand")).toBeUndefined();
    expect(document.activeElement).toBe(textarea);
    wrapper.unmount();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
  ])("使用 %s+Enter 在当前数据行下方插入行", async (_label, modifier) => {
    const wrapper = mountTable();
    await wrapper.find("tbody td").trigger("mousedown");
    await nextTick();

    const textarea = wrapper.find<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    await textarea.trigger("keydown", { key: "Enter", ...modifier });

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "| 第一行 | 1 |",
      "|  |  |",
      "| 第二行 | 2 |",
    ].join("\n"));
    expect(wrapper.emitted("editorCommand")).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
  ])("使用 %s+Enter 时先删除当前选区再插入行", async (_label, modifier) => {
    const wrapper = mountTable();
    await wrapper.find("tbody td").trigger("mousedown");
    await nextTick();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    setEditorSelectionRange(textarea.element, 0, 2);
    await textarea.trigger("keydown", { key: "Enter", ...modifier });

    expect(wrapper.emitted("update")).toHaveLength(1);
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "| 行 | 1 |",
      "|  |  |",
      "| 第二行 | 2 |",
    ].join("\n"));
    expect(wrapper.emitted("editorCommand")).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    ["Ctrl+Shift+Backspace", { key: "Backspace", ctrlKey: true, shiftKey: true }],
    ["Cmd+Shift+Delete", { key: "Delete", metaKey: true, shiftKey: true }],
  ])("使用 %s 删除当前数据行", async (_label, shortcut) => {
    const wrapper = mountTable();
    await wrapper.find("tbody td").trigger("mousedown");
    await nextTick();

    const textarea = wrapper.find<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    await textarea.trigger("keydown", shortcut);

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "| 第二行 | 2 |",
    ].join("\n"));
    expect(wrapper.emitted("editorCommand")).toBeUndefined();
    wrapper.unmount();
  });

  it("在表头消费删除快捷键但保留表格，并允许从表头下方插入数据行", async () => {
    const wrapper = mountTable();
    await wrapper.find("thead th").trigger("mousedown");
    await nextTick();

    const textarea = wrapper.find<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="0"][data-table-column="0"] .cm-content',
    );
    await textarea.trigger("keydown", {
      key: "Backspace",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(wrapper.emitted("update")).toBeUndefined();
    expect(wrapper.emitted("editorCommand")).toBeUndefined();

    await textarea.trigger("keydown", { key: "Enter", ctrlKey: true });
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "|  |  |",
      "| 第一行 | 1 |",
      "| 第二行 | 2 |",
    ].join("\n"));
    wrapper.unmount();
  });

  it("右键当前单元格打开定位菜单并高亮对应单元格", async () => {
    const wrapper = mountTable();
    const target = wrapper.findAll("tbody td")[3];

    await target.trigger("contextmenu", { clientX: 160, clientY: 120 });
    await nextTick();

    const menu = wrapper.get(".table-context-menu");
    expect(menu.attributes("style")).toContain("left: 160px");
    expect(menu.attributes("style")).toContain("top: 120px");
    expect(menu.findAll('[role="menuitem"]').map((item) => item.text())).toEqual([
      "上方插入行",
      "下方插入行",
      "上移当前行",
      "下移当前行",
      "删除当前行",
      "左侧插入列",
      "右侧插入列",
      "左移当前列",
      "右移当前列",
      "删除当前列",
      "复制整张 Markdown 表",
    ]);
    expect(target.classes()).toContain("table-part-selected");
    expect(document.activeElement).toBe(getTableContextMenuItem(wrapper, "上方插入行").element);
    wrapper.unmount();
  });

  it.each([
    {
      scope: "单元格",
      command: "selectTableCell" as const,
      initialIndex: 0,
      contextIndex: 0,
      selectedCount: 1,
      menuLabel: "上移当前行",
    },
    {
      scope: "行",
      command: "selectTableRow" as const,
      initialIndex: 0,
      contextIndex: 1,
      selectedCount: 2,
      menuLabel: "上移选中行",
    },
    {
      scope: "列",
      command: "selectTableColumn" as const,
      initialIndex: 0,
      contextIndex: 2,
      selectedCount: 3,
      menuLabel: "左移选中列",
    },
    {
      scope: "整表",
      command: "selectTable" as const,
      initialIndex: 0,
      contextIndex: 3,
      selectedCount: 6,
      menuLabel: "左移当前列",
    },
  ])("右键命中现有$scope选择时保持选择范围", async ({
    command,
    initialIndex,
    contextIndex,
    selectedCount,
    menuLabel,
  }) => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[initialIndex].trigger("mousedown");
    await nextTick();
    expect(withoutSynchronousSelectionChange(() => wrapper.vm.runCommand(command))).toBe("handled");
    await nextTick();
    expect(wrapper.findAll(".table-part-selected")).toHaveLength(selectedCount);

    await wrapper.findAll("tbody td")[contextIndex].trigger("contextmenu", {
      clientX: 140,
      clientY: 100,
    });
    await nextTick();

    expect(wrapper.findAll(".table-part-selected")).toHaveLength(selectedCount);
    expect(getTableContextMenuItem(wrapper, menuLabel).exists()).toBe(true);
    await wrapper.get(".table-context-menu").trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(wrapper.findAll(".table-part-selected")).toHaveLength(selectedCount);
    wrapper.unmount();
  });

  it("右键位于结构选择外时切换为目标单元格", async () => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await nextTick();
    expect(wrapper.vm.runCommand("selectTableColumn")).toBe("handled");
    await nextTick();
    expect(wrapper.findAll(".table-part-selected")).toHaveLength(3);

    const outside = wrapper.findAll("tbody td")[1];
    await outside.trigger("contextmenu", { clientX: 140, clientY: 100 });
    await nextTick();

    expect(wrapper.findAll(".table-part-selected")).toHaveLength(1);
    expect(outside.classes()).toContain("table-part-selected");
    expect(getTableContextMenuItem(wrapper, "左移当前列").exists()).toBe(true);
    wrapper.unmount();
  });

  it("通过右键菜单移动选中行和选中列", async () => {
    const source = [
      "| A | B | C |",
      "| --- | :---: | ---: |",
      "| r1a | r1b | r1c |",
      "| r2a | r2b | r2c |",
      "| r3a | r3b | r3c |",
    ].join("\n");
    const rowWrapper = mountTable(source);
    await rowWrapper.findAll("tbody td")[4].trigger("mousedown");
    await nextTick();
    expect(rowWrapper.vm.runCommand("selectTableRow")).toBe("handled");
    await rowWrapper.findAll("tbody td")[3].trigger("contextmenu", {
      clientX: 120,
      clientY: 90,
    });
    await getTableContextMenuItem(rowWrapper, "上移选中行").trigger("click");
    await nextTick();

    expect(rowWrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| A | B | C |",
      "| --- | :---: | ---: |",
      "| r2a | r2b | r2c |",
      "| r1a | r1b | r1c |",
      "| r3a | r3b | r3c |",
    ].join("\n"));
    rowWrapper.unmount();

    const columnWrapper = mountTable(source);
    await columnWrapper.findAll("tbody td")[1].trigger("mousedown");
    await nextTick();
    expect(columnWrapper.vm.runCommand("selectTableColumn")).toBe("handled");
    await columnWrapper.findAll("tbody td")[4].trigger("contextmenu", {
      clientX: 120,
      clientY: 90,
    });
    await getTableContextMenuItem(columnWrapper, "左移选中列").trigger("click");
    await nextTick();

    expect(columnWrapper.emitted("update")?.at(-1)?.[0]).toBe([
      "| B | A | C |",
      "| :---: | --- | ---: |",
      "| r1b | r1a | r1c |",
      "| r2b | r2a | r2c |",
      "| r3b | r3a | r3c |",
    ].join("\n"));
    columnWrapper.unmount();
  });

  it("在右键菜单中禁用已到边界的行列移动", async () => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[0].trigger("contextmenu", {
      clientX: 120,
      clientY: 90,
    });

    expect(getTableContextMenuItem(wrapper, "上移当前行").attributes("disabled")).toBeDefined();
    expect(getTableContextMenuItem(wrapper, "下移当前行").attributes("disabled")).toBeUndefined();
    expect(getTableContextMenuItem(wrapper, "左移当前列").attributes("disabled")).toBeDefined();
    expect(getTableContextMenuItem(wrapper, "右移当前列").attributes("disabled")).toBeUndefined();

    await wrapper.findAll("tbody td")[3].trigger("contextmenu", {
      clientX: 120,
      clientY: 90,
    });

    expect(getTableContextMenuItem(wrapper, "上移当前行").attributes("disabled")).toBeUndefined();
    expect(getTableContextMenuItem(wrapper, "下移当前行").attributes("disabled")).toBeDefined();
    expect(getTableContextMenuItem(wrapper, "左移当前列").attributes("disabled")).toBeUndefined();
    expect(getTableContextMenuItem(wrapper, "右移当前列").attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("复制整张 Markdown 表时同时写入纯文本 Markdown 和 HTML", async () => {
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const clipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
    const write = vi.fn(async (_items: unknown[]) => undefined);
    const writeText = vi.fn(async (_value: string) => undefined);
    let clipboardPayload: Record<string, Blob> | undefined;
    class TestClipboardItem {
      constructor(data: Record<string, Blob>) {
        clipboardPayload = data;
      }
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText },
    });
    vi.stubGlobal("ClipboardItem", TestClipboardItem);
    const wrapper = mountTable();

    try {
      await wrapper.findAll("tbody td")[1].trigger("contextmenu", {
        clientX: 120,
        clientY: 90,
      });
      await getTableContextMenuItem(wrapper, "复制整张 Markdown 表").trigger("click");
      await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());

      expect(await clipboardPayload?.["text/plain"]?.text()).toBe(tableSource);
      expect(await clipboardPayload?.["text/html"]?.text()).toContain("<table>");

      vi.stubGlobal("ClipboardItem", undefined);
      await wrapper.findAll("tbody td")[1].trigger("contextmenu", {
        clientX: 120,
        clientY: 90,
      });
      await getTableContextMenuItem(wrapper, "复制整张 Markdown 表").trigger("click");
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(tableSource));
    } finally {
      wrapper.unmount();
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
      if (clipboardItemDescriptor) {
        Object.defineProperty(globalThis, "ClipboardItem", clipboardItemDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "ClipboardItem");
      }
    }
  });

  it.each([
    {
      label: "上方插入行",
      targetIndex: 2,
      focusSelector: '.table-cell-inline-editor[data-table-row="2"][data-table-column="0"] .cm-content',
      expected: [
        "| 名称 | 数量 |",
        "| --- | ---: |",
        "| 第一行 | 1 |",
        "|  |  |",
        "| 第二行 | 2 |",
      ].join("\n"),
    },
    {
      label: "下方插入行",
      targetIndex: 0,
      focusSelector: '.table-cell-inline-editor[data-table-row="2"][data-table-column="0"] .cm-content',
      expected: [
        "| 名称 | 数量 |",
        "| --- | ---: |",
        "| 第一行 | 1 |",
        "|  |  |",
        "| 第二行 | 2 |",
      ].join("\n"),
    },
    {
      label: "左侧插入列",
      targetIndex: 1,
      focusSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
      expected: [
        "| 名称 |  | 数量 |",
        "| --- | --- | ---: |",
        "| 第一行 |  | 1 |",
        "| 第二行 |  | 2 |",
      ].join("\n"),
    },
    {
      label: "右侧插入列",
      targetIndex: 0,
      focusSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
      expected: [
        "| 名称 |  | 数量 |",
        "| --- | --- | ---: |",
        "| 第一行 |  | 1 |",
        "| 第二行 |  | 2 |",
      ].join("\n"),
    },
  ])("通过右键菜单执行“$label”并聚焦新单元格", async ({
    label,
    targetIndex,
    focusSelector,
    expected,
  }) => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[targetIndex].trigger("contextmenu", {
      clientX: 120,
      clientY: 90,
    });
    await getTableContextMenuItem(wrapper, label).trigger("click");
    await nextTick();

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe(expected);
    expect(wrapper.find(".table-context-menu").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get(focusSelector).element);
    wrapper.unmount();
  });

  it.each([
    {
      label: "删除当前行",
      targetIndex: 1,
      focusSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
      expected: [
        "| 名称 | 数量 |",
        "| --- | ---: |",
        "| 第二行 | 2 |",
      ].join("\n"),
    },
    {
      label: "删除当前列",
      targetIndex: 0,
      focusSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
      expected: [
        "| 数量 |",
        "| ---: |",
        "| 1 |",
        "| 2 |",
      ].join("\n"),
    },
  ])("通过右键菜单执行“$label”并聚焦保留单元格", async ({
    label,
    targetIndex,
    focusSelector,
    expected,
  }) => {
    const wrapper = mountTable();
    await wrapper.findAll("tbody td")[targetIndex].trigger("contextmenu", {
      clientX: 120,
      clientY: 90,
    });
    await getTableContextMenuItem(wrapper, label).trigger("click");
    await nextTick();

    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe(expected);
    expect(wrapper.find(".table-context-menu").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get(focusSelector).element);
    wrapper.unmount();
  });

  it("禁止通过右键菜单删除最后一行、最后一列或表头行", async () => {
    const oneCellWrapper = mountTable("| 标题 |\n| --- |\n| 内容 |");
    await oneCellWrapper.find("tbody td").trigger("contextmenu", {
      clientX: 80,
      clientY: 70,
    });

    expect(getTableContextMenuItem(oneCellWrapper, "删除当前行").attributes("disabled")).toBeDefined();
    expect(getTableContextMenuItem(oneCellWrapper, "删除当前列").attributes("disabled")).toBeDefined();
    expect(oneCellWrapper.emitted("update")).toBeUndefined();
    oneCellWrapper.unmount();

    const headerWrapper = mountTable();
    await headerWrapper.find("thead th").trigger("contextmenu", {
      clientX: 80,
      clientY: 70,
    });
    expect(getTableContextMenuItem(headerWrapper, "删除当前行").attributes("disabled")).toBeDefined();
    headerWrapper.unmount();
  });

  it("支持方向键浏览，并通过 Escape 或外部点击关闭右键菜单", async () => {
    const wrapper = mountTable();
    const target = wrapper.findAll("tbody td")[3];
    await target.trigger("contextmenu", { clientX: 100, clientY: 80 });
    await nextTick();

    const firstItem = getTableContextMenuItem(wrapper, "上方插入行");
    const secondItem = getTableContextMenuItem(wrapper, "下方插入行");
    expect(document.activeElement).toBe(firstItem.element);
    await firstItem.trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement).toBe(secondItem.element);
    await secondItem.trigger("keydown", { key: "Escape" });
    await nextTick();

    expect(wrapper.find(".table-context-menu").exists()).toBe(false);
    expect(document.activeElement).toBe(
      wrapper.get('.table-cell-inline-editor[data-table-row="2"][data-table-column="1"] .cm-content').element,
    );

    await target.trigger("contextmenu", { clientX: 100, clientY: 80 });
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();
    expect(wrapper.find(".table-context-menu").exists()).toBe(false);
    wrapper.unmount();
  });

  it("普通表格按源码绝对位置上报正向和反向选区", async () => {
    const source = "| Alpha | Beta |\n| --- | --- |\n| left | right |";
    const wrapper = mountTable(source);
    await wrapper.findAll("thead th")[0].trigger("mousedown");
    await nextTick();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="0"][data-table-column="0"] .cm-content',
    );
    const sourceStart = source.indexOf("Alpha");

    setEditorSelectionRange(textarea.element, 1, 4, "forward");

    expect(wrapper.emitted("selection")?.at(-1)).toEqual([
      "lph",
      sourceStart + 1,
      sourceStart + 4,
      sourceStart + 4,
    ]);

    setEditorSelectionRange(textarea.element, 1, 4, "backward");

    expect(wrapper.emitted("selection")?.at(-1)).toEqual([
      "lph",
      sourceStart + 1,
      sourceStart + 4,
      sourceStart + 1,
    ]);
    wrapper.unmount();
  });

  it("CRLF 表格数据格选区保持实际换行宽度对应的源码偏移", async () => {
    const source = "Name | Notes\r\n--- | ---\r\nAlpha | Beta";
    const wrapper = mountTable(source);
    await wrapper.findAll("tbody td")[1].trigger("mousedown");
    await nextTick();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
    );
    setEditorSelectionRange(textarea.element, 1, 3, "forward");


    const sourceStart = source.indexOf("Beta");
    expect(wrapper.emitted("selection")?.at(-1)).toEqual([
      "et",
      sourceStart + 1,
      sourceStart + 3,
      sourceStart + 3,
    ]);
    wrapper.unmount();
  });

  it.each([
    {
      label: "引用",
      source: [
        "> | Name | Notes |",
        "> | --- | --- |",
        "> | Alpha | Beta |",
      ].join("\n"),
      cellSelector: "tbody td",
      cellIndex: 1,
      textareaSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
      cellSource: "Beta",
    },
    {
      label: "列表",
      source: [
        "- | Name | Notes |",
        "  | --- | --- |",
        "  | Alpha | Beta |",
      ].join("\n"),
      cellSelector: "thead th",
      cellIndex: 1,
      textareaSelector: '.table-cell-inline-editor[data-table-row="0"][data-table-column="1"] .cm-content',
      cellSource: "Notes",
    },
    {
      label: "紧凑嵌套引用",
      source: [
        "> > | Name | Notes |",
        "> > | --- | --- |",
        ">>| Alpha | Beta |",
      ].join("\n"),
      cellSelector: "tbody td",
      cellIndex: 1,
      textareaSelector: '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
      cellSource: "Beta",
    },
  ])("$label 容器表格排除容器前缀后映射单元格选区", async ({
    source,
    cellSelector,
    cellIndex,
    textareaSelector,
    cellSource,
  }) => {
    const wrapper = mountTable(source);
    await wrapper.findAll(cellSelector)[cellIndex].trigger("mousedown");
    await nextTick();

    const textarea = wrapper.get<HTMLDivElement>(textareaSelector);
    setEditorSelectionRange(textarea.element, 1, 3, "forward");


    const sourceStart = source.indexOf(cellSource);
    expect(wrapper.emitted("selection")?.at(-1)).toEqual([
      cellSource.slice(1, 3),
      sourceStart + 1,
      sourceStart + 3,
      sourceStart + 3,
    ]);
    wrapper.unmount();
  });

  it.each([
    {
      label: "追加字符",
      value: "abc",
      caret: 3,
      serializedCell: "abc",
      serializedOffset: 3,
    },
    {
      label: "输入未转义管道",
      value: "a|b",
      caret: 2,
      serializedCell: "a\\|b",
      serializedOffset: 3,
    },
  ])("$label 后立即按本次序列化源码上报光标偏移", async ({
    value,
    caret,
    serializedCell,
    serializedOffset,
  }) => {
    const source = "| Value |\n| --- |\n| ab |";
    const wrapper = mountTable(source);
    await wrapper.find("tbody td").trigger("mousedown");
    await nextTick();

    const textarea = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    );
    const previousSelectionCount = wrapper.emitted("selection")?.length ?? 0;
    replaceEditorValue(textarea.element, value, caret);

    const expectedSource = [
      "| Value |",
      "| --- |",
      "| " + serializedCell + " |",
    ].join("\n");
    const expectedCaret = expectedSource.indexOf(serializedCell) + serializedOffset;
    expect(wrapper.emitted("update")?.at(-1)?.[0]).toBe(expectedSource);
    expect((wrapper.emitted("selection") ?? []).slice(previousSelectionCount)).toContainEqual([
      "",
      expectedCaret,
      expectedCaret,
      expectedCaret,
    ]);
    wrapper.unmount();
  });

  it("转义管道不被当作列边界且后续列仍映射到正确源码位置", async () => {
    const source = [
      "| ID | Expr | Tail |",
      "| --- | --- | --- |",
      "| 1 | left \\| right | omega |",
    ].join("\n");
    const wrapper = mountTable(source);
    await wrapper.findAll("tbody td")[1].trigger("mousedown");
    await nextTick();

    const expression = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="1"] .cm-content',
    );
    const escapedPipeStart = "left \\| right".indexOf("\\|");
    const expressionSelectionCount = wrapper.emitted("selection")?.length ?? 0;
    setEditorSelectionRange(expression.element, escapedPipeStart, escapedPipeStart + 2, "forward");

    const sourcePipeStart = source.indexOf("\\|");
    expect((wrapper.emitted("selection") ?? []).slice(expressionSelectionCount)).toContainEqual([
      "\\|",
      sourcePipeStart,
      sourcePipeStart + 2,
      sourcePipeStart + 2,
    ]);

    await wrapper.findAll("tbody td")[2].trigger("mousedown");
    await nextTick();
    const tail = wrapper.get<HTMLDivElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="2"] .cm-content',
    );
    const tailSelectionCount = wrapper.emitted("selection")?.length ?? 0;
    setEditorSelectionRange(tail.element, 0, getEditorValue(tail.element).length, "forward");

    const tailStart = source.indexOf("omega");
    expect((wrapper.emitted("selection") ?? []).slice(tailSelectionCount)).toContainEqual([
      "omega",
      tailStart,
      tailStart + "omega".length,
      tailStart + "omega".length,
    ]);
    wrapper.unmount();
  });
});

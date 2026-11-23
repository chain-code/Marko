import { Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({ svg: "<svg></svg>", bindFunctions: vi.fn() })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

function blockSynchronousSelectionChange(event: Event) {
  event.stopImmediatePropagation();
}

beforeAll(() => {
  document.addEventListener("selectionchange", blockSynchronousSelectionChange, true);
});

afterAll(() => {
  document.removeEventListener("selectionchange", blockSynchronousSelectionChange, true);
});

function mountEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: defaultEditorSettings,
    },
  });
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
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

function mockTableGeometry(table: HTMLTableElement, left: number, top = 20) {
  const cells = Array.from(
    table.querySelectorAll<HTMLTableCellElement>("th[data-table-row], td[data-table-row]"),
  );
  const columnCount = table.querySelectorAll("thead th").length;
  const rowCount = table.querySelectorAll("tbody tr").length;
  vi.spyOn(table, "getBoundingClientRect").mockReturnValue(
    createDomRect(left, top, columnCount * 100, (rowCount + 1) * 30),
  );
  cells.forEach((cell) => {
    const row = Number(cell.dataset.tableRow);
    const column = Number(cell.dataset.tableColumn);
    vi.spyOn(cell, "getBoundingClientRect").mockReturnValue(
      createDomRect(left + column * 100, top + row * 30, 100, 30),
    );
  });
}

function findLine(wrapper: ReturnType<typeof mountEditor>, text: string): HTMLElement {
  const line = wrapper.findAll<HTMLElement>(".cm-line")
    .find((candidate) => candidate.text().includes(text));
  if (!line) throw new Error(`未找到正文行：${text}`);
  return line.element;
}

function replaceCellValue(element: HTMLElement, value: string) {
  const view = EditorView.findFromDOM(element);
  if (!view) throw new Error("未找到表格单元格编辑器");
  const dispatchEvent = document.dispatchEvent.bind(document);
  const dispatchSpy = vi.spyOn(document, "dispatchEvent").mockImplementation((event) => (
    event.type === "selectionchange" ? true : dispatchEvent(event)
  ));
  try {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: value.length },
      annotations: Transaction.userEvent.of("input.type"),
    });
  } finally {
    dispatchSpy.mockRestore();
  }
}

describe("ContinuousMarkdownEditor 表格边缘命中", () => {
  it("在半像素左边缘外侧两像素点击后立即输入，并仅打开表格右键菜单", async () => {
    const source = "before\n\n| A | B |\n| --- | --- |\n| one | two |";
    const wrapper = mountEditor(source);
    await settleUi();
    const table = wrapper.get<HTMLTableElement>("table").element;
    mockTableGeometry(table, 10.5);
    const line = findLine(wrapper, "before");

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: 8,
      clientY: 65,
    });
    line.dispatchEvent(mouseDown);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleUi();

    expect(mouseDown.defaultPrevented).toBe(true);
    const cell = wrapper.get<HTMLElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    ).element;
    expect(document.activeElement).toBe(cell);
    replaceCellValue(cell, "left-edge");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toContain("| left-edge | two |");

    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 8,
      clientY: 65,
    });
    line.dispatchEvent(contextMenu);
    await settleUi();

    expect(contextMenu.defaultPrevented).toBe(true);
    expect(wrapper.find(".table-context-menu").exists()).toBe(true);
    expect(wrapper.find(".editor-context-menu").exists()).toBe(false);
    wrapper.unmount();
  });

  it("在半像素上边缘外侧两像素点击后立即输入，并仅打开表格右键菜单", async () => {
    const source = "before\n\n| A | B |\n| --- | --- |\n| one | two |";
    const wrapper = mountEditor(source);
    await settleUi();
    const table = wrapper.get<HTMLTableElement>("table").element;
    mockTableGeometry(table, 10.5, 20.5);
    const line = findLine(wrapper, "before");

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: 60,
      clientY: 18,
    });
    line.dispatchEvent(mouseDown);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleUi();

    expect(mouseDown.defaultPrevented).toBe(true);
    const cell = wrapper.get<HTMLElement>(
      '.table-cell-inline-editor[data-table-row="0"][data-table-column="0"] .cm-content',
    ).element;
    expect(document.activeElement).toBe(cell);
    replaceCellValue(cell, "top-edge");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toContain("| top-edge | B |");

    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 60,
      clientY: 18,
    });
    line.dispatchEvent(contextMenu);
    await settleUi();

    expect(contextMenu.defaultPrevented).toBe(true);
    expect(wrapper.find(".table-context-menu").exists()).toBe(true);
    expect(wrapper.find(".editor-context-menu").exists()).toBe(false);
    wrapper.unmount();
  });

  it("两张表同时接近指针时选择几何距离更近的表格", async () => {
    const source = [
      "| First | Value |",
      "| --- | --- |",
      "| first | one |",
      "",
      "between",
      "",
      "| Second | Value |",
      "| --- | --- |",
      "| second | two |",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    const tables = wrapper.findAll<HTMLTableElement>("table");
    expect(tables).toHaveLength(2);
    mockTableGeometry(tables[0]!.element, 10.5);
    mockTableGeometry(tables[1]!.element, 212);

    findLine(wrapper, "between").dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: 211.75,
      clientY: 65,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleUi();

    const editors = wrapper.findAll<HTMLElement>(".visual-table-editor");
    expect(editors[0]!.classes()).not.toContain("active");
    expect(editors[1]!.classes()).toContain("active");
    const nearestCell = editors[1]!.get<HTMLElement>(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
    ).element;
    replaceCellValue(nearestCell, "nearest");
    await settleUi();
    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    expect(latest).toContain("| first | one |");
    expect(latest).toContain("| nearest | two |");
    wrapper.unmount();
  });

  it("三像素以上的正文右键不被表格拦截", async () => {
    const source = "| A | B |\n| --- | --- |\n| one | two |\n\nafter";
    const wrapper = mountEditor(source);
    await settleUi();
    mockTableGeometry(wrapper.get<HTMLTableElement>("table").element, 10.5);

    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 5,
      clientY: 65,
    });
    findLine(wrapper, "after").dispatchEvent(contextMenu);
    await settleUi();

    expect(contextMenu.defaultPrevented).toBe(true);
    expect(wrapper.find(".editor-context-menu").exists()).toBe(true);
    expect(wrapper.find(".table-context-menu").exists()).toBe(false);
    wrapper.unmount();
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { Transaction, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { nextTick } from "vue";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorCommand, EditorSettings } from "@/types";
import { userComplexMermaidSource } from "./mermaidFixtures";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><path d="M0 0h640v320H0z" /></svg>',
    bindFunctions: vi.fn(),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

function mountEditor(
  markdown = "# 标题\n\n正文",
  overrides: Partial<EditorSettings> = {},
  attachToDocument = true,
  readonly = false,
) {
  return mount(ContinuousMarkdownEditor, {
    ...(attachToDocument ? { attachTo: document.body } : {}),
    props: {
      modelValue: markdown,
      outline: [],
      readonly,
      settings: {
        ...defaultEditorSettings,
        ...overrides,
        extensions: { ...defaultEditorSettings.extensions, ...overrides.extensions },
      },
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

function blockHappyDomSelectionChange(event: Event) {
  // 真实浏览器异步派发 selectionchange，happy-dom 的同步派发会导致 CodeMirror 更新重入。
  event.stopImmediatePropagation();
}

beforeAll(() => {
  document.addEventListener("selectionchange", blockHappyDomSelectionChange, true);
});

afterAll(() => {
  document.removeEventListener("selectionchange", blockHappyDomSelectionChange, true);
});

function getTableCellContent(
  wrapper: ReturnType<typeof mountEditor>,
  row: number,
  column: number,
) {
  return wrapper.get<HTMLDivElement>(
    `.table-cell-inline-editor[data-table-row="${row}"][data-table-column="${column}"] .cm-content`,
  );
}

function getTableCellView(element: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(element);
  if (!view) throw new Error("未找到表格单元格 CodeMirror");
  return view;
}

function withoutSynchronousSelectionChange<T>(callback: () => T): T {
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

function dispatchTableCellTransaction(view: EditorView, spec: TransactionSpec) {
  withoutSynchronousSelectionChange(() => view.dispatch(spec));
}

function dispatchTableCellEvent(element: HTMLElement, event: Event): boolean {
  return withoutSynchronousSelectionChange(() => element.dispatchEvent(event));
}

function getTableCellValue(element: HTMLElement): string {
  return getTableCellView(element).state.doc.toString();
}

function setTableCellSelection(element: HTMLElement, anchor: number, head = anchor) {
  dispatchTableCellTransaction(getTableCellView(element), { selection: { anchor, head } });
}

function replaceTableCellValue(
  element: HTMLElement,
  value: string,
  userEvent = "input.type",
) {
  const view = getTableCellView(element);
  dispatchTableCellTransaction(view, {
    changes: { from: 0, to: view.state.doc.length, insert: value },
    selection: { anchor: value.length },
    annotations: Transaction.userEvent.of(userEvent),
  });
}

describe("ContinuousMarkdownEditor", () => {
  it("keeps front matter free of Markdown heading, code and quote classes", async () => {
    const source = [
      "---",
      "# literal",
      "    nested: value",
      "> literal",
      "---",
      "# Visible",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const frontMatterLines = wrapper.findAll(".cm-frontmatter");
    expect(frontMatterLines.length).toBeGreaterThan(0);
    expect(frontMatterLines.every((line) => (
      !line.classes("cm-heading")
      && !line.classes("cm-code")
      && !line.classes("cm-blockquote")
    ))).toBe(true);
    wrapper.unmount();
  });

  it("折叠标题后的源码空行并在光标进入时恢复可编辑高度", async () => {
    const source = "# 标题\n\n正文\n\n## 小节\n\n正文二";
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();

    const lines = wrapper.findAll(".cm-line");
    expect(lines[0]?.classes()).toEqual(expect.arrayContaining(["cm-heading", "cm-heading-1"]));
    expect(lines[1]?.classes()).toContain("cm-heading-gap");
    expect(lines[2]?.classes()).toContain("cm-paragraph");
    expect(lines[4]?.classes()).toEqual(expect.arrayContaining(["cm-heading", "cm-heading-2"]));
    expect(lines[5]?.classes()).toContain("cm-heading-gap");

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const blankOffset = "# 标题\n".length;
    await editor.selectRange(blankOffset, blankOffset);
    await wrapper.vm.$nextTick();

    const activeLines = wrapper.findAll(".cm-line");
    expect(activeLines[1]?.classes()).toEqual(expect.arrayContaining([
      "cm-heading-gap",
      "cm-active-markdown-line",
    ]));
    wrapper.unmount();

    const sourceWrapper = mountEditor(source, { sourceMode: true });
    await sourceWrapper.vm.$nextTick();
    expect(sourceWrapper.find(".cm-heading-gap").exists()).toBe(false);
    sourceWrapper.unmount();
  });

  it("折叠列表和表格边界空行并渲染更醒目的无序圆点", async () => {
    const source = [
      "task-service 不负责：",
      "",
      "- 不 fork 插件，不管理本机进程。",
      "- 不读取检材内容。",
      "",
      "| 服务 | 职责 |",
      "| --- | --- |",
      "| task-service | 调度任务 |",
    ].join("\n");
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".cm-block-gap")).toHaveLength(2);
    const markers = wrapper.findAll(".cm-bullet-list .cm-rendered-list-marker");
    expect(markers).toHaveLength(2);
    expect(markers.every((marker) => marker.text().includes("•"))).toBe(true);
    wrapper.unmount();
  });

  it("按 Typora 语义层级渲染无序列表符号和三十像素缩进", async () => {
    const flatSource = [
      "- 一级",
      " * 二级",
      "  * 三级",
      "",
      "正文",
    ].join("\n");
    const flatWrapper = mountEditor(flatSource, {}, true, true);
    await flatWrapper.vm.$nextTick();
    await settleUi();

    let flatMarkers = flatWrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    expect(flatMarkers).toHaveLength(3);
    expect(flatMarkers.every((marker) => marker.classes().includes("cm-rendered-bullet-marker"))).toBe(true);
    expect(flatMarkers.map((marker) => marker.text())).toEqual([0x2022, 0x2022, 0x2022].map((code) => String.fromCodePoint(code)));
    expect(flatMarkers.map((marker) => marker.element.style.getPropertyValue("--list-marker-width"))).toEqual([
      "1.875rem",
      "1.875rem",
      "1.875rem",
    ]);

    const flatEditor = flatWrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const flatThirdOffset = flatSource.indexOf("三级");
    await flatEditor.selectRange(flatThirdOffset, flatThirdOffset, false);
    await settleUi();
    flatMarkers = flatWrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    expect(flatMarkers.length).toBeGreaterThan(0);
    expect(flatMarkers.every((marker) => marker.text() === "•")).toBe(true);
    expect(flatMarkers.every((marker) => (
      marker.element.style.getPropertyValue("--list-marker-width") === "1.875rem"
    ))).toBe(true);
    flatWrapper.unmount();

    const nestedSource = [
      "- 一级",
      "  * 二级",
      "    * 三级",
      "",
      "正文",
    ].join("\n");
    const nestedWrapper = mountEditor(nestedSource, {}, true, true);
    await nestedWrapper.vm.$nextTick();
    await settleUi();

    let nestedMarkers = nestedWrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    expect(nestedMarkers).toHaveLength(3);
    expect(nestedMarkers.every((marker) => marker.classes().includes("cm-rendered-bullet-marker"))).toBe(true);
    expect(nestedMarkers.map((marker) => marker.text())).toEqual([0x2022, 0x25e6, 0x25aa].map((code) => String.fromCodePoint(code)));
    expect(nestedMarkers.map((marker) => marker.element.style.getPropertyValue("--list-marker-width"))).toEqual([
      "1.875rem",
      "3.75rem",
      "5.625rem",
    ]);

    const nestedEditor = nestedWrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const nestedThirdOffset = nestedSource.indexOf("三级");
    await nestedEditor.selectRange(nestedThirdOffset, nestedThirdOffset, false);
    await settleUi();
    nestedMarkers = nestedWrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    const squareMarker = nestedMarkers.find((marker) => marker.text() === "▪");
    expect(squareMarker?.element.style.getPropertyValue("--list-marker-width")).toBe("5.625rem");
    nestedWrapper.unmount();
  });

  it("不将缩进代码中的星号替换成列表符号", async () => {
    const source = "缩进代码：\n\n    * 不是列表\n\n正文";
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange(source.length, source.length);
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-list-marker")).toHaveLength(0);
    expect(wrapper.text()).toContain("* 不是列表");
    wrapper.unmount();
  });

  it("mounts one CodeMirror document and exposes file view state", async () => {
    const wrapper = mountEditor();
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".cm-editor")).toHaveLength(1);
    expect(wrapper.get(".cm-content").text()).toContain("标题");

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      restoreViewState: (state: { anchor: number; head: number; scrollTop: number }) => Promise<void>;
      getViewState: () => { anchor: number; head: number; scrollTop: number };
    };
    const scrollContainer = wrapper.element.parentElement as HTMLElement;
    scrollContainer.classList.add("editor-scroll");
    await editor.restoreViewState({ anchor: 2, head: 4, scrollTop: 120 });
    expect(editor.getViewState()).toEqual({ anchor: 2, head: 4, scrollTop: 120 });

    wrapper.unmount();
  });

  it("applies commands to the continuous document and emits the whole Markdown value", async () => {
    const wrapper = mountEditor("before\n\nafter");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      insertText: (text: string) => void;
    };

    await editor.selectRange(0, 6);
    editor.insertText("updated");

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    expect(updates.at(-1)).toEqual(["updated\n\nafter"]);
    wrapper.unmount();
  });

  it("keeps application-level replacements in the CodeMirror undo history", async () => {
    const wrapper = mountEditor("before");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      replaceDocument: (value: string) => void;
      runCommand: (command: "undo" | "redo") => void;
    };

    editor.replaceDocument("after");
    editor.runCommand("undo");
    editor.runCommand("redo");

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    expect(updates).toEqual([["after"], ["before"], ["after"]]);
    wrapper.unmount();
  });

  it("isolates explicit formatting commands into separate undo steps", async () => {
    const wrapper = mountEditor("word", { sourceMode: true }, false);
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };

    await editor.selectRange(0, 4, false);
    editor.runCommand("bold");
    await settleUi();
    editor.runCommand("italic");
    await settleUi();
    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)).toEqual(["**word**"]);
    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)).toEqual(["word"]);
    wrapper.unmount();
  });

  it("按 Typora 语义切换局部行内格式并保留折叠光标输入状态", async () => {
    const source = "A **left middle right** Z";
    const wrapper = mountEditor(source, { sourceMode: true }, false);
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };
    const middleStart = source.indexOf("middle");

    await editor.selectRange(middleStart, middleStart + "middle".length, false);
    editor.runCommand("bold");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("A **left** middle **right** Z");
    wrapper.unmount();

    const cursorWrapper = mountEditor("ab", { sourceMode: true }, false);
    await cursorWrapper.vm.$nextTick();
    const cursorEditor = cursorWrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };
    await cursorEditor.selectRange(1, 1, false);
    cursorEditor.runCommand("bold");
    await settleUi();
    expect((cursorWrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("a****b");
    cursorWrapper.unmount();
  });

  it("renders block previews without a plugin decoration crash and reveals source on click", async () => {
    const wrapper = mountEditor("paragraph\n\n```ts\nconst value = 1;\n```\n");
    await wrapper.vm.$nextTick();

    const preview = wrapper.get(".cm-special-preview-code");
    expect(preview.attributes("role")).toBe("button");
    await preview.trigger("click");
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(false);
    expect(wrapper.get(".cm-content").text()).toContain("const value = 1;");
    wrapper.unmount();
  });

  it("renders a Mermaid flowchart widget and opens its viewer on double-click", async () => {
    mermaidMock.render.mockClear();
    const source = [
      "前言",
      "",
      "```mermaid",
      userComplexMermaidSource,
      "```",
      "",
      "后言",
    ].join("\n");
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange(source.length, source.length);
    await settleUi();
    await flushPromises();
    await settleUi();

    const diagram = wrapper.get(".cm-special-preview-diagram");
    expect(diagram.find(".mermaid svg").exists()).toBe(true);
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    const renderCall = mermaidMock.render.mock.calls[0] as unknown as [string, string] | undefined;
    expect(renderCall?.[1]).toBe(userComplexMermaidSource + "\n");

    await diagram.get(".mermaid svg").trigger("dblclick");
    await nextTick();
    expect(document.body.querySelector(".diagram-viewer-overlay")).not.toBeNull();
    expect(document.body.querySelector(".diagram-viewer-content svg")).not.toBeNull();

    wrapper.unmount();
    expect(document.body.querySelector(".diagram-viewer-overlay")).toBeNull();
  });

  it("falls back to the normal code preview when Mermaid rendering is disabled", async () => {
    mermaidMock.render.mockClear();
    const wrapper = mountEditor([
      "before",
      "",
      "```mermaid",
      "flowchart LR",
      "  A --> B",
      "```",
    ].join("\n"), {
      extensions: { ...defaultEditorSettings.extensions, mermaid: false },
    });
    await settleUi();

    expect(wrapper.find(".cm-special-preview-diagram").exists()).toBe(false);
    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(true);
    expect(mermaidMock.render).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("renders all find matches and marks the active result", async () => {
    const wrapper = mountEditor("alpha beta alpha");
    await wrapper.setProps({
      findMatches: [{ index: 0, length: 5 }, { index: 11, length: 5 }],
      activeFindIndex: 1,
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll(".cm-find-match")).toHaveLength(2);
    expect(wrapper.findAll(".cm-find-match-active")).toHaveLength(1);
    wrapper.unmount();
  });

  it("does not intercept composition keys from Chinese input methods", async () => {
    const wrapper = mountEditor("正文");
    await wrapper.vm.$nextTick();
    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    const preventDefault = vi.spyOn(event, "preventDefault");
    wrapper.get(".cm-content").element.dispatchEvent(event);

    expect(preventDefault).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps tables directly editable and routes table commands to the active cell editor", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".visual-table-editor").exists()).toBe(true);

    await wrapper.get("tbody td").trigger("mousedown");
    await wrapper.vm.$nextTick();
    const cell = getTableCellContent(wrapper, 1, 0);
    replaceTableCellValue(cell.element, "changed");
    const editor = wrapper.vm as unknown as {
      runCommand: (command: "addTableRowBelow" | "undo" | "redo") => void;
    };
    const toolbarTarget = document.createElement("button");
    toolbarTarget.className = "app-toolbar";
    document.body.append(toolbarTarget);
    toolbarTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    toolbarTarget.focus();
    await settleUi();
    expect(wrapper.get(".visual-table-editor").classes()).toContain("active");
    expect(cell.element.style.display).not.toBe("none");
    editor.runCommand("addTableRowBelow");
    await settleUi();
    editor.runCommand("undo");
    await settleUi();

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    expect(updates.some(([value]) => value.includes("changed"))).toBe(true);
    expect(updates.at(-1)?.[0]).toContain("changed");
    expect(updates.at(-1)?.[0].split("\n").filter((line) => /^\|/.test(line))).toHaveLength(3);
    editor.runCommand("redo");
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]
      .split("\n").filter((line) => /^\|/.test(line))).toHaveLength(4);
    toolbarTarget.remove();
    wrapper.unmount();
  });

  it("keeps a document-first table visible and accepts the first cell input", async () => {
    const wrapper = mountEditor("| A | B |\n| --- | --- |\n| one | two |");
    await settleUi();

    expect(wrapper.find(".cm-visual-table-widget").exists()).toBe(true);
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();

    const cell = getTableCellContent(wrapper, 1, 0);
    replaceTableCellValue(cell.element, "typed");
    await settleUi();

    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toContain("| typed | two |");
    wrapper.unmount();
  });

  it("forwards outer editor pointer events at the table edge", async () => {
    const wrapper = mountEditor("| A | B |\n| --- | --- |\n| one | two |");
    await settleUi();

    const table = wrapper.get<HTMLTableElement>("table").element;
    const cells = wrapper.findAll<HTMLTableCellElement>(
      "th[data-table-row], td[data-table-row]",
    );
    vi.spyOn(table, "getBoundingClientRect").mockReturnValue(createDomRect(10, 20, 200, 60));
    cells.forEach((cell) => {
      const row = Number(cell.attributes("data-table-row"));
      const column = Number(cell.attributes("data-table-column"));
      vi.spyOn(cell.element, "getBoundingClientRect").mockReturnValue(
        createDomRect(10 + column * 100, 20 + row * 30, 100, 30),
      );
    });

    const outerContent = wrapper.get<HTMLElement>(
      ".continuous-editor-host > .cm-editor .cm-content",
    ).element;
    outerContent.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      detail: 1,
      clientX: 210.5,
      clientY: 65,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0 }));
    await settleUi();

    const cell = getTableCellContent(wrapper, 1, 1);
    replaceTableCellValue(cell.element, "right-edge");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toContain("| one | right-edge |");

    outerContent.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 210.5,
      clientY: 65,
    }));
    await settleUi();
    expect(wrapper.find(".table-context-menu").exists()).toBe(true);
    wrapper.unmount();
  });

  it("将有效的一列表格渲染为可编辑表格", async () => {
    const source = "before\n\n| H |\n| --- |\n| x |";
    const wrapper = mountEditor(source);
    await settleUi();

    expect(wrapper.find(".cm-visual-table-widget").exists()).toBe(true);
    expect(wrapper.findAll(".cm-visual-table-widget thead th")).toHaveLength(1);
    expect(wrapper.findAll(".cm-visual-table-widget tbody td")).toHaveLength(1);
    wrapper.unmount();
  });

  it("moves below a table using its updated source length", async () => {
    const source = "before\n\n| A | B |\n| --- | --- |\n| one | two |\n\nafter";
    const wrapper = mountEditor(source);
    await settleUi();
    await wrapper.findAll("tbody td")[1]!.trigger("mousedown");
    await settleUi();
    const cell = getTableCellContent(wrapper, 1, 1);
    setTableCellSelection(cell.element, 1, 3);

    dispatchTableCellEvent(cell.element, new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();

    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? source;
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number; scrollTop: number };
    };
    expect(latest).toContain("| one | t |");
    expect(editor.getViewState().anchor).toBe(latest.indexOf("after"));
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    expect(document.activeElement).toBe(wrapper.get(".cm-content").element);
    wrapper.unmount();
  });

  it.each(["", "\n", "\n\n"])("creates a paragraph below an end-of-document table", async (trailingBreak) => {
    const tableSource = "before\n\n| A | B |\n| --- | --- |\n| one | two |";
    const source = tableSource + trailingBreak;
    const wrapper = mountEditor(source);
    await settleUi();
    await wrapper.findAll("tbody td")[1]!.trigger("mousedown");
    await settleUi();
    const cell = getTableCellContent(wrapper, 1, 1);
    setTableCellSelection(cell.element, 1, 3);

    dispatchTableCellEvent(cell.element, new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    const latest = updates.at(-1)?.[0] ?? "";
    const expected = tableSource.replace("| one | two |", "| one | t |") + "\n\n";
    const editor = wrapper.vm as unknown as {
      runCommand: (command: EditorCommand) => void;
      getViewState: () => { anchor: number; head: number; scrollTop: number };
    };
    expect(latest).toBe(expected);
    expect(editor.getViewState().anchor).toBe(latest.length);
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    expect(document.activeElement).toBe(wrapper.get(".cm-content").element);

    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe(source);
    wrapper.unmount();
  });

  it("keeps edits in cells A, B, and A as three ordered undo groups", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };

    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await settleUi();
    replaceTableCellValue(getTableCellContent(wrapper, 1, 0).element, "one-a");
    await wrapper.findAll("tbody td")[1].trigger("mousedown");
    await settleUi();
    replaceTableCellValue(getTableCellContent(wrapper, 1, 1).element, "two-b");
    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await settleUi();
    replaceTableCellValue(getTableCellContent(wrapper, 1, 0).element, "one-aa");

    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("| one-a | two-b |");
    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("| one-a | two |");
    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("| one | two |");
    wrapper.unmount();
  });

  it("undoes an IME table-cell composition as one isolated edit", async () => {
    const source = "before\n\n| A | B |\n| --- | --- |\n| one | two |\n";
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();
    await wrapper.findAll("tbody td")[0].trigger("mousedown");
    await settleUi();
    const cell = () => getTableCellContent(wrapper, 1, 0);
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };

    replaceTableCellValue(cell().element, "one-a");
    dispatchTableCellEvent(cell().element, new CompositionEvent("compositionstart", {
      bubbles: true,
    }));
    replaceTableCellValue(cell().element, "one-a中", "input.type.compose");
    await new Promise((resolve) => window.setTimeout(resolve, 550));
    dispatchTableCellEvent(cell().element, new CompositionEvent("compositionend", {
      bubbles: true,
    }));
    replaceTableCellValue(cell().element, "one-a中文", "input.type.compose");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    replaceTableCellValue(cell().element, "one-a中文!");

    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toContain("| one-a中文 | two |");

    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toContain("| one-a | two |");

    editor.runCommand("undo");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe(source);
    wrapper.unmount();
  });

  it("inserts a row immediately below the header when the header is active", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("thead th").trigger("mousedown");
    await settleUi();
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };

    editor.runCommand("addTableRowBelow");
    await settleUi();
    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    const tableLines = latest.split("\n").filter((line) => /^\|/.test(line));
    expect(tableLines).toEqual(["| A | B |", "| --- | --- |", "|  |  |", "| one | two |"]);
    wrapper.unmount();
  });

  it("uses the saved table-cell selection for copy and asynchronous paste", async () => {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue("changed"),
    };
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const cell = getTableCellContent(wrapper, 1, 0);
    const cellValue = getTableCellValue(cell.element);
    setTableCellSelection(cell.element, 0, cellValue.length);
    const toolbar = document.createElement("button");
    toolbar.className = "app-toolbar";
    document.body.append(toolbar);
    toolbar.focus();
    await settleUi();
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };

    editor.runCommand("copyMarkdown");
    await settleUi();
    expect(clipboard.writeText).toHaveBeenCalledWith("one");
    editor.runCommand("pastePlainText");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("| changed | two |");

    toolbar.remove();
    wrapper.unmount();
    if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    else Reflect.deleteProperty(navigator, "clipboard");
  });

  it("returns focus to CodeMirror on table Escape and lets the next Tab leave", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const cell = getTableCellContent(wrapper, 1, 0);

    dispatchTableCellEvent(cell.element, new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    await nextTick();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    expect(document.activeElement).toBe(content);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("clears a retained table target when a toolbar menu is cancelled elsewhere", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };
    await editor.selectRange(0, 6);
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();

    const toolbar = document.createElement("button");
    toolbar.className = "app-toolbar";
    const outside = document.createElement("button");
    document.body.append(toolbar, outside);
    toolbar.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    toolbar.focus();
    await settleUi();
    outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    outside.focus();
    await settleUi();

    editor.runCommand("bold");
    await settleUi();
    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    expect(latest).toContain("**before**");
    expect(latest).toContain("| one | two |");
    toolbar.remove();
    outside.remove();
    wrapper.unmount();
  });

  it("does not apply unsupported active-table commands to the stale CodeMirror selection", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };
    await editor.selectRange(0, 6);
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const updatesBefore = wrapper.emitted("update:modelValue")?.length ?? 0;

    editor.runCommand("image");
    await nextTick();
    expect(wrapper.emitted("update:modelValue")?.length ?? 0).toBe(updatesBefore);
    expect(getTableCellValue(getTableCellContent(wrapper, 1, 0).element)).toBe("one");
    wrapper.unmount();
  });

  it("moves the caret to a deleted table and restores CodeMirror focus", async () => {
    const prefix = "before\n\n";
    const wrapper = mountEditor(`${prefix}| A | B |\n| --- | --- |\n| one | two |\n`);
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const editor = wrapper.vm as unknown as {
      runCommand: (command: EditorCommand) => void;
      insertText: (text: string) => void;
      getViewState: () => { anchor: number; head: number; scrollTop: number };
    };

    editor.runCommand("deleteTable");
    await settleUi();
    expect(wrapper.find(".visual-table-editor").exists()).toBe(false);
    expect(editor.getViewState().anchor).toBe(prefix.length);
    expect(document.activeElement).toBe(wrapper.get(".cm-content").element);
    editor.insertText("continued");
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)).toEqual([`${prefix}continued`]);
    wrapper.unmount();
  });

  it("clamps and refocuses the active cell after undo removes a new row", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    const editor = wrapper.vm as unknown as { runCommand: (command: EditorCommand) => void };
    editor.runCommand("addTableRowBelow");
    await settleUi();
    expect(document.activeElement).toBe(getTableCellContent(wrapper, 2, 0).element);

    editor.runCommand("undo");
    await settleUi();
    const active = getTableCellContent(wrapper, 1, 0);
    expect(document.activeElement).toBe(active.element);
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    replaceTableCellValue(active.element, "continued");
    await nextTick();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("continued");
    wrapper.unmount();
  });

  it("routes formatting shortcuts from a table cell to the visual table model", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| one | two |\n");
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await wrapper.vm.$nextTick();
    const cell = getTableCellContent(wrapper, 1, 0);
    setTableCellSelection(cell.element, 0, getTableCellValue(cell.element).length);
    dispatchTableCellEvent(cell.element, new KeyboardEvent("keydown", {
      key: "b",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    await wrapper.vm.$nextTick();

    const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
    expect(updates.at(-1)?.[0]).toContain("**one**");
    wrapper.unmount();
  });

  it("does not typewriter-center the stale CodeMirror selection during table input", async () => {
    const requestFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    const source = "before\n\n| A | B |\n| --- | --- |\n| one | two |\n";
    const baselineWrapper = mountEditor(source);
    await baselineWrapper.vm.$nextTick();
    await baselineWrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    requestFrame.mockClear();
    replaceTableCellValue(getTableCellContent(baselineWrapper, 1, 0).element, "baseline");
    const measurementFrames = requestFrame.mock.calls.length;
    baselineWrapper.unmount();

    requestFrame.mockClear();
    const wrapper = mountEditor(source, { typewriterMode: true, typewriterCenter: true });
    await wrapper.vm.$nextTick();
    await wrapper.get("tbody td").trigger("mousedown");
    await settleUi();
    requestFrame.mockClear();

    replaceTableCellValue(getTableCellContent(wrapper, 1, 0).element, "changed");
    expect(requestFrame).toHaveBeenCalledTimes(measurementFrames);
    wrapper.unmount();
  });

  it("lets Escape followed by Tab leave the CodeMirror tab handler", async () => {
    const wrapper = mountEditor("text");
    await wrapper.vm.$nextTick();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.focus();
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    const escapedTab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(escapedTab);
    expect(escapedTab.defaultPrevented).toBe(false);

    const regularTab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(regularTab);
    expect(regularTab.defaultPrevented).toBe(true);
    wrapper.unmount();
  });

  it("inserts a literal Tab at a paragraph cursor and removes it with Shift+Tab", async () => {
    const wrapper = mountEditor("alpha");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange(2, 2);
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("al\tpha");

    content.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("alpha");
    wrapper.unmount();
  });

  it("uses Tab to indent a list item subtree only when it has a previous sibling", async () => {
    const source = "- first\n- second\n  - child\n- third";
    const wrapper = mountEditor(source);
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange(source.indexOf("second"), source.indexOf("second"));
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("- first\n  - second\n    - child\n- third");
    wrapper.unmount();

    const firstItem = mountEditor("- first\n- second");
    await firstItem.vm.$nextTick();
    const firstEditor = firstItem.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await firstEditor.selectRange(2, 2);
    firstItem.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    expect((firstItem.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("- \tfirst\n- second");
    firstItem.unmount();
  });

  it("opens table links exactly once from click and always blocks WebView navigation", async () => {
    const wrapper = mountEditor("before\n\n| A | B |\n| --- | --- |\n| [guide](https://example.com) | two |\n");
    await wrapper.vm.$nextTick();
    const anchor = wrapper.get<HTMLAnchorElement>(".cell-rendered a").element;
    anchor.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, ctrlKey: true }));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    anchor.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(wrapper.emitted("openLinkHref")).toEqual([["https://example.com"]]);
    wrapper.unmount();
  });

  it("replaces delayed images by placeholder without changing their original order", async () => {
    const wrapper = mountEditor("start");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      reserveImageInsertion: () => string | null;
      replaceImagePlaceholder: (placeholder: string, src: string | null, alt?: string) => boolean;
      insertText: (text: string) => void;
    };
    await editor.selectRange(5, 5);
    const first = editor.reserveImageInsertion();
    const second = editor.reserveImageInsertion();
    if (!first || !second) throw new Error("编辑器未创建图片占位符");
    editor.insertText("continued");

    expect(editor.replaceImagePlaceholder(second, "assets/two.png", "two.png")).toBe(true);
    expect(editor.replaceImagePlaceholder(first, "assets/one.png", "one.png")).toBe(true);
    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    expect(latest.indexOf("![one](assets/one.png)")).toBeLessThan(latest.indexOf("![two](assets/two.png)"));
    expect(latest.indexOf("![two](assets/two.png)")).toBeLessThan(latest.indexOf("continued"));
    expect(latest).toBe("start![one](assets/one.png)![two](assets/two.png)continued");
    expect(latest).not.toContain("marko-image-");
    wrapper.unmount();
  });

  it("keeps the selected text intact when a reserved image insertion fails", async () => {
    const wrapper = mountEditor("selected");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      reserveImageInsertion: () => string | null;
      replaceImagePlaceholder: (placeholder: string, src: string | null) => boolean;
    };
    await editor.selectRange(0, 8);
    const placeholder = editor.reserveImageInsertion();
    if (!placeholder) throw new Error("编辑器未创建图片占位符");
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe(`selected${placeholder}`);

    expect(editor.replaceImagePlaceholder(placeholder, null)).toBe(true);
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)).toEqual(["selected"]);
    wrapper.unmount();
  });

  it("handles an editor image drop once and emits its placeholder before file reading", async () => {
    const wrapper = mountEditor("text");
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ filePath: "C:/notes/test.md" });
    const parent = wrapper.element.parentElement!;
    const bubbled = vi.fn();
    parent.addEventListener("drop", bubbled);
    const file = new File(["image"], "photo.png", { type: "image/png" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });

    wrapper.get(".cm-content").element.dispatchEvent(drop);
    await nextTick();

    expect(drop.defaultPrevented).toBe(true);
    expect(bubbled).not.toHaveBeenCalled();
    const request = wrapper.emitted("imageData")?.[0]?.[0] as {
      file: File;
      placeholder: string;
      kind: string;
    };
    expect(request.file).toBe(file);
    expect(request.placeholder).toContain("marko-image-");
    expect(request.kind).toBe("image");
    parent.removeEventListener("drop", bubbled);
    wrapper.unmount();
  });

  it("reserves an untitled uploaded image without waiting for document save", async () => {
    const wrapper = mountEditor("text", { uploadUrl: "https://upload.example/images" });
    await wrapper.vm.$nextTick();
    const file = new File(["image"], "photo.png", { type: "image/png" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });

    wrapper.get(".cm-content").element.dispatchEvent(drop);
    await nextTick();

    const request = wrapper.emitted("imageData")?.[0]?.[0] as { placeholder?: string };
    expect(request.placeholder).toContain("marko-image-");
    wrapper.unmount();
  });

  it("emits video and audio drops in order at the drop coordinates", async () => {
    const wrapper = mountEditor("abcd");
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ filePath: "C:/notes/test.md" });
    const position = vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(2);
    const video = new File(["video"], "demo.webm", { type: "video/webm" });
    const audio = new File(["audio"], "voice.flac", { type: "audio/flac" });
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "clientX", { value: 320 });
    Object.defineProperty(drop, "clientY", { value: 240 });
    Object.defineProperty(drop, "dataTransfer", { value: { files: [video, audio] } });

    wrapper.get(".cm-content").element.dispatchEvent(drop);
    await nextTick();

    const requests = (wrapper.emitted("imageData") ?? []).map((event) => event[0]) as Array<{
      file: File;
      kind: string;
      prefix: string;
      placeholder: string;
    }>;
    expect(requests.map(({ file, kind, prefix }) => [file.name, kind, prefix])).toEqual([
      ["demo.webm", "video", ""],
      ["voice.flac", "audio", "\n\n"],
    ]);
    expect(requests.every((request) => request.placeholder.includes("marko-image-"))).toBe(true);
    expect(position).toHaveBeenCalledWith({ x: 320, y: 240 });
    position.mockRestore();
    wrapper.unmount();
  });

  it("replaces a reserved media position inline without adding blank lines", async () => {
    const wrapper = mountEditor("abcd");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      reserveImageInsertion: () => string | null;
      replaceMediaPlaceholder: (placeholder: string, markup: string | null) => boolean;
    };
    await editor.selectRange(2, 2);
    const placeholder = editor.reserveImageInsertion();
    if (!placeholder) throw new Error("编辑器未创建媒体占位符");

    expect(editor.replaceMediaPlaceholder(
      placeholder,
      '<video src="assets/demo.mp4" controls></video>',
    )).toBe(true);
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe('ab<video src="assets/demo.mp4" controls></video>cd');
    wrapper.unmount();
  });

  it("inserts a dragged HTML image at the drop coordinates without emitting local image data", async () => {
    const wrapper = mountEditor("abcd");
    await wrapper.vm.$nextTick();
    const position = vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(2);
    const getData = vi.fn((type: string) => ({
      "text/html": '<a href="https://example.com"><img src="https://cdn.example.com/image?id=7" alt="流程图"></a>',
      "text/uri-list": "https://example.com/page",
      "text/plain": "https://example.com/page",
    })[type] ?? "");
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [], getData },
    });

    wrapper.get(".cm-content").element.dispatchEvent(drop);
    await settleUi();

    expect(drop.defaultPrevented).toBe(true);
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("ab![流程图](https://cdn.example.com/image?id=7)cd");
    expect(wrapper.emitted("imageData")).toBeUndefined();
    expect(getData).toHaveBeenCalledWith("text/html");
    position.mockRestore();
    wrapper.unmount();
  });

  it("leaves ordinary dragged text to the browser", async () => {
    const wrapper = mountEditor("text");
    await wrapper.vm.$nextTick();
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) => type === "text/plain" ? "ordinary text" : "",
      },
    });

    wrapper.get(".cm-content").element.dispatchEvent(drop);
    await nextTick();

    expect(drop.defaultPrevented).toBe(false);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("imageData")).toBeUndefined();
    wrapper.unmount();
  });

  it("navigates Emoji suggestions with the keyboard and accepts the active option", async () => {
    const prefix = "before ";
    const wrapper = mountEditor(prefix);
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      insertText: (text: string) => void;
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await editor.selectRange(prefix.length, prefix.length, false);
    editor.insertText(":thumbs");
    await settleUi();

    const content = wrapper.get<HTMLElement>(".cm-content").element;
    const options = wrapper.findAll(".emoji-option");
    expect(options).toHaveLength(2);
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    await nextTick();
    expect(options[1].attributes("aria-selected")).toBe("true");
    const emoji = options[1].findAll("span")[0]!.text();
    const shortcode = options[1].findAll("span")[1]!.text();
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await nextTick();

    const latest = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    expect(shortcode).toBe(":thumbsdown:");
    expect(latest).toBe(`${prefix}${shortcode}`);
    expect(wrapper.find(".emoji-popover").exists()).toBe(false);
    await editor.selectRange(0, 0, false);
    await settleUi();
    expect(wrapper.get(".cm-rendered-emoji").text()).toBe(emoji);
    wrapper.unmount();

    const sourceWrapper = mountEditor(latest, { sourceMode: true });
    await sourceWrapper.vm.$nextTick();
    expect(sourceWrapper.text()).toContain(shortcode);
    expect(sourceWrapper.find(".cm-rendered-emoji").exists()).toBe(false);
    sourceWrapper.unmount();
  });

  it("opens escape-triggered Emoji suggestions once and then lets Escape-Tab leave", async () => {
    const wrapper = mountEditor("text", { emojiAutocomplete: "escape" });
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as { insertText: (text: string) => void };
    editor.insertText(":w");
    await nextTick();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    expect(wrapper.find(".emoji-popover").exists()).toBe(false);

    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await nextTick();
    expect(wrapper.find(".emoji-popover").exists()).toBe(true);
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await nextTick();
    expect(wrapper.find(".emoji-popover").exists()).toBe(false);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    content.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    wrapper.unmount();
  });

  it("opens a Typora-style inline math pair from one dollar marker with Escape", async () => {
    const wrapper = mountEditor("");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      insertText: (text: string) => void;
      getViewState: () => { anchor: number; head: number };
    };
    editor.insertText("$");
    await settleUi();

    const content = wrapper.get<HTMLElement>(".cm-content").element;
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    content.dispatchEvent(escape);
    await settleUi();
    expect(escape.defaultPrevented).toBe(true);
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("$$");
    expect(editor.getViewState()).toEqual(expect.objectContaining({ anchor: 1, head: 1 }));

    editor.insertText("x+1");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("$x+1$");
    wrapper.unmount();
  });

  it("does not open inline math from Escape for conflicts or disabled editing modes", async () => {
    const cases: Array<{
      source: string;
      start: number;
      end: number;
      settings?: Partial<EditorSettings>;
    }> = [
      { source: "$x$", start: 3, end: 3 },
      { source: "$$", start: 1, end: 1 },
      { source: "$", start: 0, end: 1 },
      { source: "$", start: 1, end: 1, settings: { sourceMode: true } },
      {
        source: "$",
        start: 1,
        end: 1,
        settings: {
          extensions: { ...defaultEditorSettings.extensions, math: false },
        },
      },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source, current.settings);
      await wrapper.vm.$nextTick();
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      };
      await editor.selectRange(current.start, current.end, false);
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      wrapper.get(".cm-content").element.dispatchEvent(escape);
      await nextTick();
      expect(escape.defaultPrevented).toBe(current.start !== current.end);
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
      wrapper.unmount();
    }

    const readonlyWrapper = mountEditor("$", {}, true, true);
    await readonlyWrapper.vm.$nextTick();
    const readonlyEditor = readonlyWrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await readonlyEditor.selectRange(1, 1, false);
    const readonlyEscape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    readonlyWrapper.get(".cm-content").element.dispatchEvent(readonlyEscape);
    await nextTick();
    expect(readonlyEscape.defaultPrevented).toBe(false);
    expect(readonlyWrapper.emitted("update:modelValue")).toBeUndefined();
    readonlyWrapper.unmount();
  });

  it("opens the editor menu from the keyboard and restores focus after Escape", async () => {
    const wrapper = mountEditor("text");
    await wrapper.vm.$nextTick();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.focus();
    content.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ContextMenu",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();

    const items = wrapper.findAll<HTMLButtonElement>(".editor-context-menu [role='menuitem']");
    expect(items.length).toBeGreaterThan(2);
    expect(document.activeElement).toBe(items[0].element);
    await items[0].trigger("keydown", { key: "End" });
    expect(document.activeElement).toBe(items.at(-1)?.element);
    await items.at(-1)!.trigger("keydown", { key: "Escape" });
    await nextTick();
    expect(wrapper.find(".editor-context-menu").exists()).toBe(false);
    expect(document.activeElement).toBe(content);
    wrapper.unmount();
  });

  it("keeps rendered list markers visible on the active line", async () => {
    const wrapper = mountEditor("- first\n1. second");
    await wrapper.vm.$nextTick();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange("- first\n1. second".length, "- first\n1. second".length);
    await settleUi();

    const markers = wrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    expect(markers).toHaveLength(2);
    expect(markers[0].element.textContent).toBe("•");
    expect(markers[1].element.textContent).toBe("1.");
    expect(wrapper.get(".cm-content").text()).not.toContain("1. second");
    wrapper.unmount();
  });

  it("creates a new Markdown paragraph on Enter and keeps Shift+Enter as a soft break", async () => {
    const wrapper = mountEditor("alpha beta");
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange(5, 5);
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("alpha\n\n beta");
    wrapper.unmount();

    const softBreak = mountEditor("alpha beta");
    await settleUi();
    const softBreakEditor = softBreak.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await softBreakEditor.selectRange(5, 5);
    softBreak.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect((softBreak.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("alpha  \n beta");
    softBreak.unmount();
  });

  it("merges a visible paragraph boundary with one Backspace or Delete", async () => {
    const source = "left\n\nright";
    for (const [key, cursor] of [["Backspace", source.indexOf("right")], ["Delete", "left".length]] as const) {
      const wrapper = mountEditor(source);
      await settleUi();
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      };
      await editor.selectRange(cursor, cursor, false);
      wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      }));
      expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("leftright");
      wrapper.unmount();
    }
  });

  it("handles Typora table row shortcuts in the Markdown source editor", async () => {
    const source = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const wrapper = mountEditor(source, { sourceMode: true });
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await editor.selectRange(source.indexOf("2"), source.indexOf("2"), false);
    await settleUi();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    const inserted = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    expect(inserted).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |");
    wrapper.unmount();

    const removeWrapper = mountEditor(source, { sourceMode: true });
    await settleUi();
    const removeEditor = removeWrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await removeEditor.selectRange(source.indexOf("2"), source.indexOf("2"), false);
    await settleUi();
    removeWrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Backspace",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect((removeWrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("| A | B |\n| --- | --- |");
    removeWrapper.unmount();
  });

  it("keeps Enter, Shift+Enter, Space and Backspace literal in source mode", async () => {
    for (const shiftKey of [false, true]) {
      const wrapper = mountEditor("alphabeta", { sourceMode: true });
      await settleUi();
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      };
      await editor.selectRange(5, 5, false);
      wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey,
        bubbles: true,
        cancelable: true,
      }));
      await settleUi();
      expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
        .toBe("alpha\nbeta");
      wrapper.unmount();
    }

    const marker = mountEditor("*", { sourceMode: true });
    await settleUi();
    const markerEditor = marker.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      insertText: (text: string) => void;
    };
    await markerEditor.selectRange(1, 1, false);
    const spaceEvent = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    marker.get<HTMLElement>(".cm-content").element.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(false);
    markerEditor.insertText(" ");
    await settleUi();
    expect((marker.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("* ");
    marker.unmount();

    const boundary = mountEditor("left\n\nright", { sourceMode: true });
    await settleUi();
    const boundaryEditor = boundary.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await boundaryEditor.selectRange("left\n\n".length, "left\n\n".length, false);
    boundary.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();
    expect((boundary.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("left\nright");
    boundary.unmount();
  });

  it("keeps CodeMirror list continuation but skips Front Matter conversion in source mode", async () => {
    const list = mountEditor("- item", { sourceMode: true });
    await settleUi();
    const listEditor = list.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await listEditor.selectRange("- item".length, "- item".length, false);
    list.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();
    expect((list.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("- item\n- ");
    list.unmount();

    const frontMatter = mountEditor("---", { sourceMode: true });
    await settleUi();
    const frontMatterEditor = frontMatter.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await frontMatterEditor.selectRange(3, 3, false);
    frontMatter.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();
    expect((frontMatter.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("---\n");
    frontMatter.unmount();
  });

  it("只读状态禁止正文修改并可原地恢复编辑", async () => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      props: {
        modelValue: "只读正文",
        outline: [],
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
        readonly: true,
      },
    });
    await nextTick();

    const editor = wrapper.vm as unknown as { insertText: (text: string) => void };
    editor.insertText("不能写入");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    await wrapper.setProps({ readonly: false });
    editor.insertText("可以写入");
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("可以写入");
    wrapper.unmount();
  });
});

describe("ContinuousMarkdownEditor Typora boundary regressions", () => {
  it.each([
    { key: "Delete", marker: "---", selector: ".cm-horizontal-rule", cursor: (source: string) => source.indexOf("Before") + "Before".length },
    { key: "Backspace", marker: "---", selector: null, cursor: (source: string) => source.indexOf("After") },
    { key: "Delete", marker: "[TOC]", selector: ".cm-special-preview-toc", cursor: (source: string) => source.indexOf("Before") + "Before".length },
    { key: "Backspace", marker: "[TOC]", selector: ".cm-special-preview-toc", cursor: (source: string) => source.indexOf("After") },
  ])("handles an adjacent $marker atom with $key without deleting Markdown syntax by character", async ({
    key,
    marker,
    selector,
    cursor,
  }) => {
    const source = `Before\n\n${marker}\n\nAfter`;
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const boundary = cursor(source);

    await editor.selectRange(boundary, boundary, false);
    wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();

    if (selector) {
      const atom = wrapper.get<HTMLElement>(selector);
      expect(atom.classes()).toContain("cm-atomic-block-selected");
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
      await atom.trigger("keydown", { key });
      await settleUi();
    }
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe(marker === '---' && key === 'Backspace'
        ? 'Before\n\nAfter'
        : 'Before\n\n\n\nAfter');
    wrapper.unmount();
  });

  it("keeps list and quote prefixes when Shift+Enter replaces a selection", async () => {
    const cases = [
      ["- alpha beta", "beta", "- alpha   \n  "],
      ["- [ ] task beta", "beta", "- [ ] task   \n      "],
      ["> quote beta", "beta", "> quote   \n> "],
      ["> - item beta", "beta", "> - item   \n>   "],
    ] as const;

    for (const [source, selected, expected] of cases) {
      const wrapper = mountEditor(source);
      await settleUi();
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      };
      const start = source.indexOf(selected);
      await editor.selectRange(start, start + selected.length, false);
      wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
      expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe(expected);
      wrapper.unmount();
    }
  });

  it("formats later and cross-line selections in a multi-line Setext heading", async () => {
    const source = "First line\nSecond line\n---\n\nBody";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };
    const secondStart = source.indexOf("Second");
    await editor.selectRange(secondStart, secondStart + "Second".length, false);
    editor.runCommand("bold");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("First line\n**Second** line\n---\n\nBody");
    wrapper.unmount();

    const across = mountEditor(source);
    await settleUi();
    const acrossEditor = across.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      runCommand: (command: EditorCommand) => void;
    };
    await acrossEditor.selectRange(0, source.indexOf(" line\n---"), false);
    acrossEditor.runCommand("italic");
    await settleUi();
    expect((across.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("*First line*\n*Second* line\n---\n\nBody");
    across.unmount();
  });
});

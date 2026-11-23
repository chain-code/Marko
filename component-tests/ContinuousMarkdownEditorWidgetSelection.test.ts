import { type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import type { SelectionStats } from "@/types";
import { defaultEditorSettings } from "@/utils/editorSettings";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160"></svg>',
    bindFunctions: vi.fn(),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

let mountedWrapper: ReturnType<typeof mountEditor> | null = null;

function mountEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        extensions: { ...defaultEditorSettings.extensions },
      },
    },
  });
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function latestSelection() {
  return mountedWrapper?.emitted<SelectionStats[]>("selection")?.at(-1)?.[0];
}

function getTableCellView(wrapper: ReturnType<typeof mountEditor>): EditorView {
  const content = wrapper.get<HTMLElement>(
    '.cm-visual-table-widget .table-cell-inline-editor[data-table-row="1"][data-table-column="0"] .cm-content',
  ).element;
  const view = EditorView.findFromDOM(content);
  if (!view) throw new Error("无法获取表格单元格的 CodeMirror 实例");
  return view;
}

function dispatchEditorTransaction(view: EditorView, spec: TransactionSpec) {
  const dispatchEvent = document.dispatchEvent.bind(document);
  const dispatchSpy = vi.spyOn(document, "dispatchEvent").mockImplementation((event) => (
    event.type === "selectionchange" ? true : dispatchEvent(event)
  ));
  try {
    view.dispatch(spec);
  } finally {
    dispatchSpy.mockRestore();
  }
}

afterEach(() => {
  mountedWrapper?.unmount();
  mountedWrapper = null;
  mermaidMock.render.mockClear();
});

describe("ContinuousMarkdownEditor 小部件选区映射", () => {
  it("将表格单元格的反向选区映射到整篇文档并保留光标方向", async () => {
    const source = [
      "intro",
      "",
      "| name | qty |",
      "| --- | --- |",
      "| alpha | 1 |",
    ].join("\n");
    mountedWrapper = mountEditor(source);
    await settleUi();

    await mountedWrapper.get(".cm-visual-table-widget tbody td").trigger("mousedown");
    await settleUi();

    const view = getTableCellView(mountedWrapper);
    dispatchEditorTransaction(view, { selection: { anchor: 4, head: 1 } });
    await settleUi();

    const expectedStart = source.indexOf("alpha") + 1;
    expect(latestSelection()).toMatchObject({
      selectedText: "lph",
      selectionStart: expectedStart,
      selectionEnd: expectedStart + 3,
      cursorLine: 5,
      cursorColumn: 4,
    });
  });

  it("将流程图源码选区映射到整篇文档的实际行列", async () => {
    const source = [
      "intro",
      "",
      "```mermaid",
      "flowchart LR",
      "A --> B",
      "```",
    ].join("\n");
    mountedWrapper = mountEditor(source);
    await settleUi();

    await mountedWrapper.get(".diagram-box").trigger("mousedown", { button: 0 });
    await nextTick();

    const textarea = mountedWrapper.get<HTMLTextAreaElement>(".diagram-source-editor");
    const localStart = textarea.element.value.indexOf("A --> B");
    textarea.element.setSelectionRange(localStart, localStart + "A --> B".length);
    await textarea.trigger("select");

    const expectedStart = source.indexOf("A --> B");
    expect(latestSelection()).toMatchObject({
      selectedText: "A --> B",
      selectionStart: expectedStart,
      selectionEnd: expectedStart + "A --> B".length,
      cursorLine: 5,
      cursorColumn: 8,
    });
  });
});
import { Transaction, type TransactionSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320"><path d="M0 0h640v320H0z" /></svg>',
    bindFunctions: vi.fn(),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

const mountedEditors: Array<{ unmount: () => void }> = [];

function mountEditor(source: string, readonly = false, preserveSingleLineBreaks = false) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly,
      settings: {
        ...defaultEditorSettings,
        preserveSingleLineBreaks,
        extensions: { ...defaultEditorSettings.extensions },
      },
    },
  });
  mountedEditors.push(wrapper);
  return wrapper;
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
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

async function editFirstBodyCell(
  wrapper: ReturnType<typeof mountEditor>,
  value: string,
) {
  await wrapper.get(".cm-visual-table-widget tbody td").trigger("mousedown");
  await settleUi();
  const view = getTableCellView(wrapper);
  dispatchEditorTransaction(view, {
    changes: { from: 0, to: view.state.doc.length, insert: value },
    selection: { anchor: value.length },
    annotations: Transaction.userEvent.of("input.type"),
  });
  await settleUi();
}

afterEach(() => {
  while (mountedEditors.length > 0) mountedEditors.pop()?.unmount();
  document.querySelectorAll(".diagram-viewer-overlay").forEach((element) => element.remove());
  document.body.classList.remove("diagram-viewer-open");
  mermaidMock.render.mockClear();
});

describe("ContinuousMarkdownEditor 容器正文交互", () => {
  it("在非活动行保留列表标题字号并隐藏井号标记", async () => {
    const listWrapper = mountEditor("- # 列表标题", true);
    await settleUi();

    const listHeading = listWrapper.get(".cm-line.cm-bullet-list.cm-heading.cm-heading-1");
    expect(listHeading.classes()).not.toContain("cm-active-markdown-line");
    expect(listHeading.text()).toContain("列表标题");
    expect(listHeading.text()).not.toContain("#");

    const quoteWrapper = mountEditor("> - # 引用列表标题", true);
    await settleUi();
    const quoteHeading = quoteWrapper.get(".cm-line.cm-bullet-list.cm-heading.cm-heading-1");
    expect(quoteHeading.classes()).toEqual(expect.arrayContaining([
      "cm-blockquote",
      "cm-blockquote-depth-1",
    ]));
    expect(quoteHeading.text()).toContain("引用列表标题");
    expect(quoteHeading.text()).not.toContain("#");
  });

  it("为列表和引用惰性续行保留容器 class", async () => {
    const listWrapper = mountEditor("- item\ncontinued in list", true, true);
    await settleUi();

    const listContinuation = listWrapper.get<HTMLElement>(
      ".cm-line.cm-list-continuation.cm-list-depth-0",
    );
    expect(listContinuation.text()).toContain("continued in list");
    expect(listContinuation.element.style.getPropertyValue("--list-continuation-indent"))
      .toBe("30px");

    const quoteWrapper = mountEditor("> quote\ncontinued in quote", true, true);
    await settleUi();
    const quotedLines = quoteWrapper.findAll(".cm-line.cm-blockquote.cm-blockquote-depth-1");
    const quoteContinuation = quotedLines.find((line) => line.text().includes("continued in quote"));
    expect(quoteContinuation).toBeDefined();
    expect(quoteContinuation?.classes()).not.toContain("cm-active-markdown-line");
  });

  it("在列表容器内显示代码、数学、表格和 HTML 小部件", async () => {
    const cases = [
      {
        source: "- code\n  ```js\n  const value = 1\n  ```",
        selector: ".cm-special-preview-code.cm-preview-list-container",
      },
      {
        source: "- math\n  $$\n  x^2\n  $$",
        selector: ".cm-special-preview-math.cm-preview-list-container",
      },
      {
        source: "- table\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |",
        selector: ".cm-visual-table-widget.cm-preview-list-container",
      },
      {
        source: "- html\n  <section><p>HTML 内容</p></section>",
        selector: ".cm-special-preview-html.cm-preview-list-container",
      },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source, true);
      await settleUi();
      expect(wrapper.find(current.selector).exists(), current.selector).toBe(true);
    }
  });

  it("编辑引用表格单元格后仍为每一行保留引用前缀", async () => {
    const source = [
      "正文",
      "",
      "> | A | B |",
      "> | --- | --- |",
      "> | 1 | 2 |",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    await editFirstBodyCell(wrapper, "已修改");

    const updated = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    const tableLines = updated.split("\n").filter((line) => line.includes("|"));
    expect(tableLines).toHaveLength(3);
    expect(tableLines.every((line) => /^> \|/.test(line))).toBe(true);
    expect(tableLines[2]).toContain("已修改");
  });

  it("编辑列表缩进表格后仍保留每一行缩进", async () => {
    const source = [
      "正文",
      "",
      "- 表格",
      "  | A | B |",
      "  | --- | --- |",
      "  | 1 | 2 |",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    await editFirstBodyCell(wrapper, "已修改");

    const updated = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    const tableLines = updated.split("\n").filter((line) => line.trimStart().startsWith("|"));
    expect(updated).toContain("- 表格");
    expect(tableLines).toHaveLength(3);
    expect(tableLines.every((line) => /^ {2}\|/.test(line))).toBe(true);
    expect(tableLines[2]).toContain("已修改");
  });

  it("直接列表表格首次编辑只更新目标单元格", async () => {
    const source = [
      "- | A | B |",
      "  | --- | --- |",
      "  | 1 | 2 |",
      "",
      "后续正文",
    ].join("\n");
    const wrapper = mountEditor(source);
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await editor.selectRange(source.length, source.length, false);
    await settleUi();

    expect(wrapper.find(".cm-visual-table-widget.cm-preview-list-container").exists()).toBe(true);
    await editFirstBodyCell(wrapper, "已修改");

    const updated = (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
    expect(updated).toBe([
      "- | A | B |",
      "  | --- | --- |",
      "  | 已修改 | 2 |",
      "",
      "后续正文",
    ].join("\n"));
  });

  it("列表转引用的 Mermaid 仍可渲染并双击放大", async () => {
    const source = [
      "- > ~~~mermaid",
      "  > flowchart LR",
      "  > A --> B",
      "  > ~~~",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();
    await flushPromises();
    await settleUi();

    const diagram = wrapper.get(".cm-special-preview-diagram.cm-preview-list-container");
    expect(diagram.find(".mermaid svg").exists()).toBe(true);
    await diagram.get(".mermaid svg").trigger("dblclick");
    await nextTick();

    expect(document.body.querySelector(".diagram-viewer-overlay")).not.toBeNull();
    expect(document.body.querySelector(".diagram-viewer-content svg")).not.toBeNull();
  });

  it("列表内四列缩进的 Mermaid 围栏显示为代码而不是流程图", async () => {
    const source = [
      "- item",
      "",
      "      ~~~mermaid",
      "      flowchart LR",
      "      A --> B",
      "      ~~~",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-diagram").exists()).toBe(false);
    expect(mermaidMock.render).not.toHaveBeenCalled();
  });

  it("引用内 Mermaid 仍可双击打开大图", async () => {
    const source = [
      "正文",
      "",
      "> ```mermaid",
      "> flowchart LR",
      ">   A --> B",
      "> ```",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    await flushPromises();
    await settleUi();

    const diagram = wrapper.get(".cm-special-preview-diagram");
    expect(diagram.find(".mermaid svg").exists()).toBe(true);
    await diagram.get(".mermaid svg").trigger("dblclick");
    await nextTick();

    expect(document.body.querySelector(".diagram-viewer-overlay")).not.toBeNull();
    expect(document.body.querySelector(".diagram-viewer-content svg")).not.toBeNull();
  });
});

import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  getViewState: () => { anchor: number; head: number };
  insertText: (text: string) => void;
  selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
}

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

function editorHandle(wrapper: VueWrapper): EditorHandle {
  return wrapper.vm as unknown as EditorHandle;
}

function pressMarker(marker: Element, shiftKey = false) {
  marker.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    shiftKey,
  }));
}

function latestSource(wrapper: VueWrapper, fallback: string): string {
  const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
  return updates.at(-1)?.[0] ?? fallback;
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
});

describe("ContinuousMarkdownEditor 列表标记点击定位", () => {
  it.each([
    { source: "开头\n\n- 无序正文\n\n结尾", selector: ".cm-rendered-bullet-marker", body: "无序正文" },
    { source: "开头\n\n7. 有序正文\n\n结尾", selector: ".cm-rendered-ordered-marker", body: "有序正文" },
  ])("点击 $selector 后在正文起点立即输入", async ({ source, selector, body }) => {
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = editorHandle(wrapper);
    const contentFrom = source.indexOf(body);
    const oldCursor = contentFrom + body.length;
    await editor.selectRange(oldCursor, oldCursor, false);
    await settleUi();

    pressMarker(wrapper.get<HTMLElement>(selector).element);
    await settleUi();

    expect(editor.getViewState()).toMatchObject({
      anchor: contentFrom,
      head: contentFrom,
    });

    editor.insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, contentFrom) + "X" + source.slice(contentFrom),
    );
    wrapper.unmount();
  });

  it("有序任务序号沿用列表标记的定位、输入和 Shift 扩选", async () => {
    const source = ["开头", "", "7. [ ] 任务正文", "", "后续正文"]
      .join(String.fromCharCode(10));
    const contentFrom = source.indexOf("任务正文");
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = editorHandle(wrapper);
    await editor.selectRange(contentFrom + "任务正文".length, contentFrom + "任务正文".length, false);
    await settleUi();
    expect(wrapper.find(".cm-rendered-task-order").exists()).toBe(false);

    pressMarker(wrapper.get<HTMLElement>(".cm-rendered-task-marker").element);
    await settleUi();
    expect(editor.getViewState()).toMatchObject({
      anchor: contentFrom,
      head: contentFrom,
    });
    expect(document.activeElement).toBe(wrapper.get(".cm-content").element);

    editor.insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, contentFrom) + "X" + source.slice(contentFrom),
    );
    wrapper.unmount();

    const shiftWrapper = mountEditor(source);
    await settleUi();
    const shiftEditor = editorHandle(shiftWrapper);
    const anchor = contentFrom + "任务正文".length;
    await shiftEditor.selectRange(anchor, anchor, false);
    await settleUi();

    pressMarker(
      shiftWrapper.get<HTMLElement>(".cm-rendered-task-marker").element,
      true,
    );
    await settleUi();
    const selection = shiftEditor.getViewState();
    expect(Math.min(selection.anchor, selection.head)).toBe(contentFrom);
    expect(Math.max(selection.anchor, selection.head)).toBe(anchor);
    shiftWrapper.unmount();
  });

  it("Shift+点击列表标记从现有锚点扩展到正文起点", async () => {
    const source = "- 列表正文\n\n后续正文";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = editorHandle(wrapper);
    const anchor = source.indexOf("后续正文") + 2;
    await editor.selectRange(anchor, anchor, false);
    await settleUi();

    pressMarker(wrapper.get<HTMLElement>(".cm-rendered-bullet-marker").element, true);
    await settleUi();

    const selection = editor.getViewState();
    const contentFrom = source.indexOf("列表正文");
    expect(Math.min(selection.anchor, selection.head)).toBe(contentFrom);
    expect(Math.max(selection.anchor, selection.head)).toBe(anchor);
    wrapper.unmount();
  });
  it.each([
    { source: "- 1. item", texts: ["•", "1."] },
    { source: "1. - item", texts: ["1.", "•"] },
    { source: "- * nested", texts: ["•", "◦"] },
  ])("同一物理行递归列表为每层渲染独立标记", async ({ source, texts }) => {
    const wrapper = mountEditor(source);
    await settleUi();

    const markers = wrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    expect(markers.map((marker) => marker.text())).toEqual(texts);
    expect(markers.map((marker) => marker.element.style.getPropertyValue("--list-marker-width")))
      .toEqual(["1.875rem", "3.75rem"]);
    expect(markers[0]!.element.style.marginInlineStart).toBe("");
    expect(markers[1]!.element.style.marginInlineStart).toBe("-1.875rem");
    wrapper.unmount();
  });

  it("缩进后的紧凑星号列表从当前层级继续渲染符号", async () => {
    const wrapper = mountEditor([
      "* level-one",
      "* * level-two",
      "  * * level-three",
      "    * ",
    ].join("\n"));
    await settleUi();

    expect(wrapper.findAll<HTMLElement>(".cm-rendered-bullet-marker").map(
      (marker) => marker.attributes("data-list-depth"),
    )).toEqual(["0", "0", "1", "1", "2", "2"]);
    wrapper.unmount();
  });

  it("递归列表每个标记点击后都落到最内层正文起点", async () => {
    const source = "- 1. item";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = editorHandle(wrapper);
    const oldCursor = source.length;
    await editor.selectRange(oldCursor, oldCursor, false);
    await settleUi();

    let markers = wrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    pressMarker(markers[0]!.element);
    await settleUi();
    expect(editor.getViewState()).toMatchObject({ anchor: 5, head: 5 });

    await editor.selectRange(oldCursor, oldCursor, false);
    await settleUi();
    markers = wrapper.findAll<HTMLElement>(".cm-rendered-list-marker");
    pressMarker(markers[1]!.element);
    await settleUi();
    expect(editor.getViewState()).toMatchObject({ anchor: 5, head: 5 });

    editor.insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe("- 1. Xitem");
    wrapper.unmount();
  });
  it("递归外层有序列表沿用同一列表的连续编号", async () => {
    const wrapper = mountEditor("1. - alpha\n1. - beta");
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-ordered-marker").map((marker) => marker.text()))
      .toEqual(["1.", "2."]);
    expect(wrapper.findAll(".cm-rendered-bullet-marker").map((marker) => marker.text()))
      .toEqual(["•", "•"]);
    wrapper.unmount();
  });

  it("递归列表最内层任务保留复选框交互", async () => {
    const wrapper = mountEditor("- 1. [x] task");
    await settleUi();

    const markers = wrapper.findAll(".cm-rendered-list-marker");
    expect(markers.map((marker) => marker.classes())).toEqual([
      expect.arrayContaining(["cm-rendered-bullet-marker"]),
      expect.arrayContaining(["cm-rendered-task-marker"]),
    ]);
    expect(wrapper.get<HTMLInputElement>(".cm-rendered-task-marker input").element.checked).toBe(true);
    wrapper.unmount();
  });
});

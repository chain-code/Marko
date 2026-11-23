import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function mockPointerPosition(node: Node, offset: number) {
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn(() => ({ offsetNode: node, offset })),
  });
}

function pressPrimary(target: Element, detail = 1, shiftKey = false) {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    detail,
    shiftKey,
  }));
}

function dispatchPrimaryEvent(
  resolveTarget: () => Element,
  type: "mousedown" | "mouseup" | "click" | "dblclick",
  detail: number,
) {
  resolveTarget().dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "mousedown" ? 1 : 0,
    detail,
  }));
}

function latestSource(wrapper: VueWrapper, fallback: string): string {
  return (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? fallback;
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(document, "caretPositionFromPoint");
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor 即时指针交互", () => {
  it("Shift+按下从现有锚点正向或反向扩展渲染文本选区", async () => {
    const source = "Before `` alpha beta `` after";
    const clicked = source.indexOf("beta") + 1;

    for (const anchor of [source.indexOf("Before") + 2, source.indexOf("after") + 3]) {
      const wrapper = mountEditor(source);
      await settleUi();
      await editorHandle(wrapper).selectRange(anchor, anchor);
      await settleUi();
      wrapper.get<HTMLElement>(".cm-content").element.blur();

      const code = wrapper.get<HTMLElement>(".cm-rendered-inline-code");
      const textNode = code.element.firstChild!;
      mockPointerPosition(textNode, 7);
      pressPrimary(code.element, 1, true);
      expect(editorHandle(wrapper).getViewState()).toMatchObject({
        anchor,
        head: clicked,
      });

      await settleUi();
      const settledSelection = editorHandle(wrapper).getViewState();
      expect(Math.min(settledSelection.anchor, settledSelection.head))
        .toBe(Math.min(anchor, clicked));
      expect(Math.max(settledSelection.anchor, settledSelection.head))
        .toBe(Math.max(anchor, clicked));
      wrapper.unmount();
      document.getSelection()?.removeAllRanges();
    }
  });

  it.each([
    {
      source: 'Cursor\n\n![Block alt](assets/block.png "Block title")',
      markdown: '![Block alt](assets/block.png "Block title")',
      selector: ".cm-special-preview-image",
      replacement: "块图片替代文字",
    },
    {
      source: "Cursor\n\nBefore ![Inline alt](assets/inline.png) after",
      markdown: "![Inline alt](assets/inline.png)",
      selector: ".cm-rendered-inline-image",
      replacement: "行内图片替代文字",
    },
  ])("$selector 单击后可立即替换替代文本", async ({
    source,
    markdown,
    selector,
    replacement,
  }) => {
    const imageStart = source.indexOf(markdown);
    const altStart = imageStart + 2;
    const altEnd = source.indexOf("]", altStart);
    const wrapper = mountEditor(source);
    await settleUi();

    await wrapper.get(selector).trigger("click", { detail: 1 });
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: altStart,
      head: altEnd,
    });

    editorHandle(wrapper).insertText(replacement);
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, altStart) + replacement + source.slice(altEnd),
    );
    wrapper.unmount();
  });

  it.each([
    {
      source: 'Cursor\n\n![Block alt](assets/block.png "Block title")',
      markdown: '![Block alt](assets/block.png "Block title")',
      selector: ".cm-special-preview-image",
    },
    {
      source: "Cursor\n\nBefore ![Inline alt](assets/inline.png) after",
      markdown: "![Inline alt](assets/inline.png)",
      selector: ".cm-rendered-inline-image",
    },
  ])("$selector 真实双击序列仍选择完整图片源码", async ({
    source,
    markdown,
    selector,
  }) => {
    const imageStart = source.indexOf(markdown);
    const imageEnd = imageStart + markdown.length;
    const wrapper = mountEditor(source);
    await settleUi();

    const resolveTarget = () => {
      const preview = wrapper.find<HTMLElement>(selector);
      if (preview.exists()) return preview.element;

      const rawLine = wrapper.findAll<HTMLElement>(".cm-line")
        .find((line) => line.text().includes(markdown));
      if (!rawLine) throw new Error(`找不到图片源码行：${markdown}`);
      return rawLine.element;
    };

    dispatchPrimaryEvent(resolveTarget, "mousedown", 1);
    dispatchPrimaryEvent(resolveTarget, "mouseup", 1);
    dispatchPrimaryEvent(resolveTarget, "click", 1);
    await settleUi();
    expect(wrapper.find(selector).exists()).toBe(false);

    dispatchPrimaryEvent(resolveTarget, "mousedown", 2);
    dispatchPrimaryEvent(resolveTarget, "mouseup", 2);
    dispatchPrimaryEvent(resolveTarget, "click", 2);
    dispatchPrimaryEvent(resolveTarget, "dblclick", 2);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: imageStart,
      head: imageEnd,
    });
    wrapper.unmount();
  });
});

import { EditorView } from "@codemirror/view";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  getViewState: () => { anchor: number; head: number };
  selectRange: (anchor: number, head: number, focus?: boolean) => Promise<void>;
}

const tick = String.fromCharCode(96);

function mountEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        extensions: {
          ...defaultEditorSettings.extensions,
          html: true,
        },
      },
    },
  });
}

async function settleUi() {
  await nextTick();
  await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 0));
  await nextTick();
}

function editorHandle(wrapper: VueWrapper): EditorHandle {
  return wrapper.vm as unknown as EditorHandle;
}

function firstTextContaining(root: Node, value: string): Text {
  if (root instanceof Text && root.data.includes(value)) return root;
  for (const child of Array.from(root.childNodes)) {
    try {
      return firstTextContaining(child, value);
    } catch {
      continue;
    }
  }
  throw new Error("未找到文本节点：" + value);
}

function installPointerCaret(node: Text, offset: number) {
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn(() => ({ offsetNode: node, offset })),
  });
}

function dispatchTripleMouseDown(target: Element) {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: 80,
    clientY: 40,
    detail: 3,
  }));
}

function dispatchTripleClick(target: Element, clickTarget: Element = target) {
  dispatchTripleMouseDown(target);
  document.dispatchEvent(new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 80,
    clientY: 40,
    detail: 3,
  }));
  clickTarget.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 80,
    clientY: 40,
    detail: 3,
  }));
}

function selectedSource(wrapper: VueWrapper, source: string): string {
  const selection = editorHandle(wrapper).getViewState();
  return source.slice(
    Math.min(selection.anchor, selection.head),
    Math.max(selection.anchor, selection.head),
  );
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(document, "caretPositionFromPoint");
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor 三击渲染选区", () => {
  it("普通正文三击选择完整逻辑行且不包含行尾换行", async () => {
    const source = "Before\nPlain **alpha beta** tail\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();

    const line = wrapper.findAll<HTMLElement>(".cm-line")
      .find((candidate) => candidate.text().includes("Plain alpha beta tail"));
    expect(line).toBeDefined();
    const text = firstTextContaining(line!.element, "alpha beta");
    installPointerCaret(text, text.data.indexOf("alpha") + 2);
    vi.spyOn(EditorView.prototype, "posAndSideAtCoords").mockReturnValue({
      pos: source.indexOf("alpha") + 2,
      assoc: 1,
    });

    dispatchTripleClick(line!.element, wrapper.get<HTMLElement>(".cm-content").element);
    await settleUi();

    expect(selectedSource(wrapper, source)).toBe("Plain **alpha beta** tail");
    expect(wrapper.find(".cm-rendered-strong").exists()).toBe(true);
    expect(wrapper.get<HTMLElement>(".cm-content").text()).not.toContain("**");
    wrapper.unmount();
  });

  it.each([
    {
      name: "行内代码",
      kind: "inline-code",
      source: "Before\nInline " + tick + "alpha beta" + tick + " tail\nAfter",
      selector: ".cm-rendered-inline-code",
      renderedText: "alpha beta",
      expected: "Inline " + tick + "alpha beta" + tick + " tail",
      hiddenMarker: tick,
    },
    {
      name: "代码块",
      kind: "code-block",
      source: "Before\n\n" + tick.repeat(3) + "text\ncode alpha beta\n" + tick.repeat(3) + "\n\nAfter",
      selector: ".cm-special-preview-code code",
      renderedText: "code alpha beta",
      expected: "code alpha beta",
      hiddenMarker: tick.repeat(3),
    },
    {
      name: "HTML 块",
      kind: "html-block",
      source: "Before\n\n<div>HTML alpha beta</div>\n\nAfter",
      selector: ".cm-special-preview-html div",
      renderedText: "HTML alpha beta",
      expected: "<div>HTML alpha beta</div>",
      hiddenMarker: "<div>",
    },
    {
      name: "定义块",
      kind: "definition",
      source: "Before\n\nTerm\n: Definition alpha beta\n\nAfter",
      selector: ".cm-special-preview-definition dd",
      renderedText: "Definition alpha beta",
      expected: ": Definition alpha beta",
      hiddenMarker: ": Definition",
    },
  ])("$name 三击选择源码逻辑行且保持渲染状态", async (fixture) => {
    const wrapper = mountEditor(fixture.source);
    await settleUi();

    const target = wrapper.get<HTMLElement>(fixture.selector);
    const text = firstTextContaining(target.element, fixture.renderedText);
    installPointerCaret(text, Math.max(1, text.data.indexOf("alpha") + 2));

    dispatchTripleClick(target.element, wrapper.get<HTMLElement>(".cm-content").element);
    await settleUi();

    const selection = editorHandle(wrapper).getViewState();
    const lineFrom = fixture.source.indexOf(fixture.expected);
    expect(selectedSource(wrapper, fixture.source)).toBe(fixture.expected);
    expect(Math.min(selection.anchor, selection.head)).toBe(lineFrom);
    expect(Math.max(selection.anchor, selection.head)).toBe(lineFrom + fixture.expected.length);
    expect(wrapper.find(fixture.selector).exists()).toBe(true);
    expect(wrapper.get<HTMLElement>(".cm-content").text()).not.toContain(fixture.hiddenMarker);

    const activePosition = fixture.source.indexOf(fixture.renderedText) + 1;
    await editorHandle(wrapper).selectRange(activePosition, activePosition, false);
    await settleUi();
    const content = wrapper.get<HTMLElement>(".cm-content");
    switch (fixture.kind) {
      case "inline-code":
        expect(wrapper.find(".cm-rendered-inline-code").exists()).toBe(true);
        expect(content.text()).toContain(fixture.hiddenMarker);
        break;
      case "code-block":
        expect(wrapper.find(".cm-special-preview-code").exists()).toBe(false);
        expect(wrapper.get(".cm-code").text()).toContain(fixture.renderedText);
        break;
      case "html-block":
        expect(wrapper.find(".cm-special-preview-html").exists()).toBe(false);
        expect(wrapper.get(".cm-raw-block-html").text()).toContain(fixture.hiddenMarker);
        break;
      case "definition": {
        expect(wrapper.find(".cm-special-preview-definition").exists()).toBe(false);
        const definitionLine = wrapper.findAll(".cm-line")
          .find((line) => line.text().includes(fixture.hiddenMarker));
        expect(definitionLine).toBeDefined();
        break;
      }
    }
    wrapper.unmount();
  });
});
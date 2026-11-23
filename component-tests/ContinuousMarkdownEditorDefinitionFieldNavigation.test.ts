import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import { collectFootnoteSemantics } from "@/utils/footnoteSemantics";
import { collectReferenceDefinitionSemantics } from "@/utils/referenceDefinitionSemantics";

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

async function settle() {
  await nextTick();
  await flushPromises();
  await nextTick();
}

async function pressTab(
  content: HTMLElement,
  shiftKey = false,
  expectedPrevented = true,
) {
  content.blur();
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  content.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(expectedPrevented);
  await settle();
}

describe("ContinuousMarkdownEditor 定义字段键盘导航", () => {
  it("按 label、URL、title 顺序导航引用定义并在两端退出", async () => {
    const source = [
      "Before",
      "",
      '[Docs]: <https://example.com/docs> "Guide title"',
      "After",
    ].join("\n");
    const definition = collectReferenceDefinitionSemantics(source)[0];
    expect(definition?.title).not.toBeNull();
    if (!definition?.title) return;

    const wrapper = mountEditor(source);
    await settle();
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const content = wrapper.get<HTMLElement>(".cm-content").element;

    await wrapper.get(".cm-reference-definition-name").trigger("click");
    await settle();
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.label.from,
      head: definition.label.to,
    });

    await pressTab(content);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.url.from,
      head: definition.url.to,
    });
    await pressTab(content);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.title.from,
      head: definition.title.to,
    });
    await pressTab(content);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.to,
      head: definition.to,
    });
    await pressTab(content, false, false);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.to,
      head: definition.to,
    });

    await editor.selectRange(definition.title.from, definition.title.to, false);
    await pressTab(content, true);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.url.from,
      head: definition.url.to,
    });
    await editor.selectRange(definition.label.from, definition.label.to, false);
    await pressTab(content, true);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.from,
      head: definition.from,
    });
    await pressTab(content, true, false);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.from,
      head: definition.from,
    });
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("将脚注多段正文作为一个 content 字段且不改变大小写语义或源码", async () => {
    const source = [
      "Use[^NOTE] and again[^note].",
      "",
      "[^Note]: First paragraph.",
      "",
      "    Second paragraph.",
      "",
      "After",
    ].join("\n");
    const semantics = collectFootnoteSemantics(source);
    const definition = semantics.definitions[0];
    expect(definition).toBeDefined();
    if (!definition) return;
    expect(semantics.references.map((reference) => reference.number)).toEqual([1, 1]);
    expect(semantics.references.map((reference) => reference.id)).toEqual(["Note", "Note"]);

    const wrapper = mountEditor(source);
    await settle();
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const content = wrapper.get<HTMLElement>(".cm-content").element;

    await editor.selectRange(definition.label.from, definition.label.to, false);
    await pressTab(content);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.content.from,
      head: definition.content.to,
    });
    expect(source.slice(
      editor.getViewState().anchor,
      editor.getViewState().head,
    )).toBe("First paragraph.\n\n    Second paragraph.");

    await pressTab(content);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.to,
      head: definition.to,
    });
    await pressTab(content, false, false);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.to,
      head: definition.to,
    });

    await editor.selectRange(definition.content.from, definition.content.to, false);
    await pressTab(content, true);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.label.from,
      head: definition.label.to,
    });
    await pressTab(content, true);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.from,
      head: definition.from,
    });
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("空脚注正文经过空 content 字段后仍能退出且不插入 Tab", async () => {
    const source = "Use[^New]\n\n[^New]: ";
    const definition = collectFootnoteSemantics(source).definitions[0];
    expect(definition).toBeDefined();
    if (!definition) return;
    expect(definition.content.from).toBe(definition.content.to);

    const wrapper = mountEditor(source);
    await settle();
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const content = wrapper.get<HTMLElement>(".cm-content").element;

    await editor.selectRange(definition.label.from, definition.label.to, false);
    await pressTab(content);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.content.from,
      head: definition.content.to,
    });

    await pressTab(content);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.to,
      head: definition.to,
    });

    await pressTab(content, false, false);
    expect(editor.getViewState()).toMatchObject({
      anchor: definition.to,
      head: definition.to,
    });
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });
});

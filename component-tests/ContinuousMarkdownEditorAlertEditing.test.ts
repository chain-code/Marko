import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const source = [
  "Cursor",
  "",
  "> [!NOTE]",
  "> 第一行",
  "> 第二行",
  "> - 列表项",
  "> > 嵌套引用",
].join("\n");

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

type EditorHandle = {
  getViewState: () => { anchor: number; head: number };
  insertText: (text: string) => void;
  refreshLayout: () => void;
  selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
};

async function revealSourceText(editor: EditorHandle, text: string) {
  const offset = source.indexOf(text);
  await editor.selectRange(offset, offset, false);
  editor.refreshLayout();
  await settleUi();
}

describe("Continuous Alert 直接编辑", () => {
  it("保留卡片、图标、段落、软换行、列表和嵌套引用的行语义", async () => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settleUi();
    const editor = wrapper.vm as unknown as EditorHandle;
    await revealSourceText(editor, "第二行");

    expect(wrapper.find(".cm-special-preview-callout").exists()).toBe(false);
    expect(wrapper.find(".md-alert").exists()).toBe(false);
    expect(wrapper.get(".cm-alert-title").classes()).toContain("cm-alert-first");
    expect(wrapper.get(".cm-rendered-alert-label").text()).toBe("Note");
    expect(wrapper.get(".cm-rendered-alert-icon path").attributes("d")).not.toBe("");
    expect(wrapper.get(".cm-alert-body.cm-active-markdown-line").text()).toContain("第二行");

    await revealSourceText(editor, "列表项");
    expect(wrapper.find(".cm-alert-note .cm-rendered-bullet-marker").exists()).toBe(true);
    expect(wrapper.get(".cm-alert-body.cm-active-markdown-line").text()).toContain("列表项");

    await revealSourceText(editor, "嵌套引用");
    expect(wrapper.get(".cm-alert-last").classes()).toContain("cm-blockquote-depth-2");
    expect(wrapper.get(".cm-alert-body.cm-active-markdown-line").text()).toContain("嵌套引用");
    wrapper.unmount();
  });

  it("clicking the alert title reveals only its marker source", async () => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settleUi();
    const editor = wrapper.vm as unknown as EditorHandle;
    await revealSourceText(editor, "第二行");

    const title = wrapper.get(".cm-rendered-alert-title");
    expect(title.attributes("role")).toBe("button");
    expect(title.attributes("aria-label")).toBe("编辑 Note 提示类型");
    const kindStart = source.indexOf("NOTE");
    await title.trigger("mousedown", { button: 0, buttons: 1 });
    await title.trigger("click");
    await settleUi();
    const titleSelection = editor.getViewState();
    expect(source.slice(titleSelection.anchor, titleSelection.head)).toBe("NOTE");
    expect(wrapper.find(".cm-rendered-alert-title").exists()).toBe(false);
    expect(wrapper.get(".cm-alert-title").classes()).toContain("cm-active-markdown-line");
    expect(wrapper.find(".cm-special-preview-callout").exists()).toBe(false);
    wrapper.unmount();
  });

  it("alert body remains directly editable", async () => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settleUi();
    const editor = wrapper.vm as unknown as EditorHandle;

    const bodyStart = source.indexOf("第一行");
    await editor.selectRange(bodyStart, bodyStart + "第一行".length, false);
    await settleUi();
    expect(wrapper.get(".cm-alert-body.cm-active-markdown-line").text()).toContain("第一行");
    editor.insertText("已更新");
    await settleUi();

    const update = wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0] ?? "";
    expect(update).toContain("> 已更新");
    expect(update).toContain("> 第二行");
    await wrapper.setProps({ modelValue: update });
    await settleUi();
    expect(wrapper.find(".cm-alert-note").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-callout").exists()).toBe(false);
    wrapper.unmount();
  });
});



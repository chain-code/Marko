import { flushPromises, mount } from "@vue/test-utils";
import { EditorView } from "@codemirror/view";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

async function settle() {
  await nextTick();
  await flushPromises();
  await nextTick();
}

describe("Continuous 脚注语义预览", () => {
  it("shares labels case-insensitively and keeps the first definition id", async () => {
    const source = [
      "A[^A] B[^a] C[^missing] D[^A]",
      "",
      "[^A]: upper **bold**",
      "[^a]: lower",
    ].join("\n");
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });
    await settle();

    const references = wrapper.findAll(".cm-rendered-footnote-reference");
    expect(references).toHaveLength(4);
    expect(references.map((item) => item.text())).toEqual(["1", "1", "2", "1"]);
    expect(references.map((item) => item.attributes("title"))).toEqual([undefined, undefined, undefined, undefined]);
    expect(references.map((item) => item.attributes("data-footnote-id")))
      .toEqual(["A", "A", "missing", "A"]);
    await references[0]!.trigger("mouseenter");
    const tooltip = document.body.querySelector(".cm-footnote-tooltip");
    expect(tooltip?.textContent).toContain("upper bold");
    expect(tooltip?.querySelector("strong")?.textContent).toBe("bold");
    wrapper.unmount();
  });

  it("在正文中渲染内联脚注并显示数字标记", async () => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: "正文 ^[inline note]",
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });
    await settle();

    const reference = wrapper.get(".cm-rendered-footnote-reference");
    expect(reference.text()).toBe("1");
    expect(reference.attributes("title")).toBeUndefined();
    await reference.trigger("mouseenter");
    expect(document.body.querySelector(".cm-footnote-tooltip")?.textContent)
      .toContain("inline note");
    wrapper.unmount();
  });

  it("引用块脚注定义只渲染正文引用一次", async () => {
    const source = [
      "> Text[^note]",
      ">",
      "> [^note]: First **bold** paragraph.",
      ">",
      ">     Second paragraph.",
    ].join("\n");
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });
    await settle();

    const references = wrapper.findAll(".cm-rendered-footnote-reference");
    expect(references).toHaveLength(1);
    expect(references[0]?.text()).toBe("1");
    expect(references[0]?.attributes("title")).toBeUndefined();
    await references[0]!.trigger("mouseenter");
    expect(document.body.querySelector(".cm-footnote-tooltip strong")?.textContent)
      .toBe("bold");
    expect(wrapper.findAll(".cm-special-preview-code")).toHaveLength(0);
    wrapper.unmount();
  });

  it("jumps to definitions and exposes one backlink per repeated reference", async () => {
    const source = "Cursor\n\nFirst[^My Note] and second[^my note].\n\n[^my note]: note";
    const firstReference = source.indexOf("[^My Note]");
    const secondReference = source.indexOf("[^my note]", firstReference + 1);
    const definition = source.lastIndexOf("[^my note]:");
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settle();

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      getViewState: () => { anchor: number; head: number };
    };
    await editor.selectRange(source.indexOf("First"), source.indexOf("First"), false);
    await settle();
    const references = wrapper.findAll(".cm-rendered-footnote-reference");
    expect(references).toHaveLength(2);
    expect(references.map((item) => item.text())).toEqual(["1", "1"]);
    expect(references.map((item) => item.attributes("data-footnote-id")))
      .toEqual(["my note", "my note"]);
    expect(references.map((item) => item.attributes("data-footnote-missing")))
      .toEqual(["false", "false"]);
    await references[0]!.trigger("mouseenter");
    await settle();
    expect(document.body.querySelector(".cm-footnote-create-definition")).toBeNull();
    await references[0]!.trigger("click", { ctrlKey: true });
    await settle();
    expect(editor.getViewState()).toMatchObject({ anchor: definition, head: definition });

    const backlinks = wrapper.findAll(".cm-footnote-backlink");
    expect(backlinks).toHaveLength(2);
    await backlinks[1]!.trigger("click");
    await settle();
    expect(editor.getViewState()).toMatchObject({
      anchor: secondReference,
      head: secondReference,
    });
    wrapper.unmount();
  });

  it("keeps a newly typed missing reference when undoing its created definition", async () => {
    const source = "Cursor\n\nMissing";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settle();

    const view = EditorView.findFromDOM(wrapper.get<HTMLElement>(".cm-editor").element);
    if (!view) throw new Error("CodeMirror editor was not mounted");
    view.dispatch({
      changes: { from: view.state.doc.length, insert: "[^New Note]" },
      userEvent: "input.type",
    });
    await settle();

    const references = wrapper.findAll(".cm-rendered-footnote-reference");
    expect(references.map((item) => item.text())).toEqual(["1"]);
    expect(references.map((item) => item.attributes("data-footnote-id"))).toEqual(["New Note"]);
    const reference = references[0]!;
    expect(reference.attributes("data-footnote-missing")).toBe("true");
    await reference.trigger("mouseenter");
    const tooltip = document.body.querySelector<HTMLElement>(".cm-footnote-tooltip");
    expect(tooltip?.textContent).toContain("\u672a\u627e\u5230\u811a\u6ce8\u5b9a\u4e49");
    const createButton = tooltip?.querySelector<HTMLButtonElement>(".cm-footnote-create-definition");
    expect(createButton?.textContent).toBe("\u521b\u5efa\u5b9a\u4e49");
    createButton?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    }));
    await settle();

    const typedSource = source + "[^New Note]";
    const updated = typedSource + "\n\n[^New Note]: ";
    expect(view.state.doc.toString()).toBe(updated);
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
      runCommand: (command: "undo") => void;
    };
    expect(editor.getViewState()).toMatchObject({
      anchor: updated.length,
      head: updated.length,
    });

    editor.runCommand("undo");
    await settle();
    expect(view.state.doc.toString()).toBe(typedSource);

    editor.runCommand("undo");
    await settle();
    expect(view.state.doc.toString()).toBe(source);
    wrapper.unmount();
  });
});

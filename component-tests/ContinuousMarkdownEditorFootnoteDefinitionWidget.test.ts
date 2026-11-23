import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import { collectFootnoteSemantics } from "@/utils/footnoteSemantics";

function mountEditor(source: string, readonly = false) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly,
      settings: defaultEditorSettings,
    },
  });
}

async function settle() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function dispatchCompleteClick(target: Element) {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    detail: 1,
  }));
  target.dispatchEvent(new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    detail: 1,
  }));
  target.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    detail: 1,
  }));
}

describe("ContinuousMarkdownEditor 脚注定义结构化预览", () => {
  it("渲染 label、多段 Markdown content 和原有反向链接", async () => {
    const source = [
      "First[^Note] and second[^note].",
      "",
      "[^Note]: First **bold** paragraph.",
      "",
      "    Second [guide](https://example.com) paragraph.",
      "",
      "After",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settle();

    const widget = wrapper.get(".cm-footnote-definition-widget");
    expect(widget.attributes("data-footnote-id")).toBe("Note");
    expect(widget.get(".cm-footnote-definition-label").text()).toBe("Note");
    const content = widget.get(".cm-footnote-definition-content");
    expect(content.findAll("p").map((node) => node.text())).toEqual([
      "First bold paragraph.",
      "Second guide paragraph.",
    ]);
    expect(content.get("strong").text()).toBe("bold");
    expect(content.get("a").attributes("href")).toBe("https://example.com");
    expect(widget.findAll(".cm-footnote-backlink")).toHaveLength(2);
    expect(wrapper.text()).not.toContain("[^Note]:");
    wrapper.unmount();
  });

  it("点击 label 起点时精确定位字段源码并恢复直接编辑", async () => {
    const source = [
      "Use[^Note].",
      "",
      "[^Note]: First paragraph.",
      "",
      "    Second paragraph.",
      "",
      "After",
    ].join("\n");
    const definition = collectFootnoteSemantics(source).definitions[0];
    expect(definition).toBeDefined();
    if (!definition) return;

    const labelWrapper = mountEditor(source);
    await settle();
    const labelEditor = labelWrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    };
    dispatchCompleteClick(labelWrapper.get(".cm-footnote-definition-label").element);
    await settle();
    expect(labelEditor.getViewState()).toMatchObject({
      anchor: definition.label.from,
      head: definition.label.from,
    });
    expect(labelWrapper.find(".cm-footnote-definition-widget").exists()).toBe(false);
    expect(labelWrapper.text()).toContain("[^Note]:");
    labelWrapper.unmount();
  });

  it("点击多段 content 起点时精确定位源码并恢复直接编辑", async () => {
    const source = [
      "Use[^Note].",
      "",
      "[^Note]: First paragraph.",
      "",
      "    Second paragraph.",
      "",
      "After",
    ].join("\n");
    const definition = collectFootnoteSemantics(source).definitions[0];
    expect(definition).toBeDefined();
    if (!definition) return;
    const contentWrapper = mountEditor(source);
    await settle();
    const contentEditor = contentWrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    };
    dispatchCompleteClick(contentWrapper.get(".cm-footnote-definition-content").element);
    await settle();
    expect(contentEditor.getViewState()).toMatchObject({
      anchor: definition.content.from,
      head: definition.content.from,
    });
    expect(contentWrapper.find(".cm-footnote-definition-widget").exists()).toBe(false);
    expect(contentWrapper.text()).toContain("[^Note]:");
    contentWrapper.unmount();
  });

  it("空 content 可点击编辑，容器层级和反向跳转保持有效", async () => {
    const emptySource = "Cursor\n\n[^empty]: ";
    const emptyDefinition = collectFootnoteSemantics(emptySource).definitions[0];
    expect(emptyDefinition).toBeDefined();
    if (!emptyDefinition) return;

    const emptyWrapper = mountEditor(emptySource);
    await settle();
    const emptyContent = emptyWrapper.get(".cm-footnote-definition-content-empty");
    const emptyEditor = emptyWrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    };
    dispatchCompleteClick(emptyContent.element);
    await settle();
    expect(emptyEditor.getViewState()).toMatchObject({
      anchor: emptyDefinition.content.from,
      head: emptyDefinition.content.to,
    });
    expect(emptyWrapper.find(".cm-footnote-definition-widget").exists()).toBe(false);
    emptyWrapper.unmount();

    const nestedSource = [
      "Use[^nested].",
      "",
      "> - [^nested]: nested body",
    ].join("\n");
    const nestedWrapper = mountEditor(nestedSource);
    await settle();
    const nestedWidget = nestedWrapper.get(".cm-footnote-definition-widget");
    expect(nestedWidget.classes()).toContain("cm-preview-quote-container");
    expect(nestedWidget.classes()).toContain("cm-preview-list-container");
    expect(nestedWidget.findAll(".cm-footnote-backlink")).toHaveLength(1);

    const nestedReference = nestedSource.indexOf("[^nested]");
    await nestedWidget.get(".cm-footnote-backlink").trigger("click");
    await settle();
    const nestedEditor = nestedWrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    };
    expect(nestedEditor.getViewState()).toMatchObject({
      anchor: nestedReference,
      head: nestedReference,
    });
    nestedWrapper.unmount();
  });
});

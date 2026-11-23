import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

function mountEditor(source: string, readonly = true, preserveSingleLineBreaks = true) {
  return mount(ContinuousMarkdownEditor, {
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
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

describe("ContinuousMarkdownEditor 行内代码显示", () => {
  it("按 Typora 规则归一化反引号、填充空格和跨行内容", async () => {
    const cases = [
      { source: "`plain`", expected: "plain" },
      { source: "`` padded ``", expected: "padded" },
      { source: "``code ` value``", expected: "code ` value" },
      { source: "`line one\nline two`", expected: "line one line two" },
      { source: "``   ``", expected: "   " },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      expect(wrapper.get(".cm-rendered-inline-code").element.textContent).toBe(current.expected);
      wrapper.unmount();
    }
  });

  it("点击非活动代码跨度后展开完整 Markdown 源码并保留代码语义", async () => {
    const source = "before `` code `` after";
    const wrapper = mountEditor(source, false);
    await settleUi();

    const rendered = wrapper.get(".cm-rendered-inline-code");
    expect(rendered.text()).toBe("code");
    await rendered.trigger("click");
    await settleUi();

    expect(wrapper.get(".cm-rendered-inline-code").text()).toContain("code");
    expect(wrapper.get(".cm-content").text()).toContain("`` code ``");
    wrapper.unmount();
  });
});


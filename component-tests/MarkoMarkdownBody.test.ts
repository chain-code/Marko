import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import MarkoMarkdownBody from "@/components/MarkoMarkdownBody.vue";

describe("MarkoMarkdownBody", () => {
  it("异步加载期间只显示轻量占位，不渲染第二份正文", async () => {
    const wrapper = mount(MarkoMarkdownBody, {
      attachTo: document.body,
      props: {
        modelValue: "# 标题\n\n正文",
        readOnly: true,
      },
    });

    try {
      expect(wrapper.find(".marko-preview-surface").exists()).toBe(false);
      expect(wrapper.find(".markdown-document").exists()).toBe(false);
      await flushPromises();
      await nextTick();
      await vi.waitFor(
        () => expect(wrapper.findAll(".cm-editor")).toHaveLength(1),
        { timeout: 5_000 },
      );
      expect(wrapper.find(".marko-markdown-loading").exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("阅读与编辑模式共用同一个编辑器实例", async () => {
    const wrapper = mount(MarkoMarkdownBody, {
      attachTo: document.body,
      props: {
        modelValue: "# 标题\n\n正文",
        readOnly: true,
      },
    });
    await nextTick();
    await flushPromises();
    await nextTick();
    await vi.waitFor(() => expect(wrapper.find(".cm-editor").exists()).toBe(true));

    const editorElement = wrapper.get(".cm-editor").element;
    expect(wrapper.findAll(".cm-editor")).toHaveLength(1);
    expect(wrapper.get(".cm-content").attributes("contenteditable")).toBe("false");

    await wrapper.setProps({ readOnly: false });
    await nextTick();

    expect(wrapper.get(".cm-editor").element).toBe(editorElement);
    expect(wrapper.get(".cm-content").attributes("contenteditable")).toBe("true");

    await wrapper.setProps({ readOnly: true });
    await nextTick();
    expect(wrapper.get(".cm-editor").element).toBe(editorElement);
    expect(wrapper.findAll(".cm-editor")).toHaveLength(1);
    wrapper.unmount();
  });

  it("正文标题不变时不会重复发送目录更新", async () => {
    const wrapper = mount(MarkoMarkdownBody, {
      props: {
        modelValue: "# 标题\n\n正文",
        readOnly: true,
      },
    });
    await nextTick();

    expect(wrapper.emitted("outlineChange")).toHaveLength(1);
    await wrapper.setProps({ modelValue: "# 标题\n\n修改后的正文" });
    await nextTick();
    expect(wrapper.emitted("outlineChange")).toHaveLength(1);

    await wrapper.setProps({ modelValue: "# 新标题\n\n修改后的正文" });
    await nextTick();
    expect(wrapper.emitted("outlineChange")).toHaveLength(2);
    wrapper.unmount();
  });
});

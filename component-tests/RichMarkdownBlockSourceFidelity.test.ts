import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const source = 'alpha :poodle: "hello" -- https://example.com [Guide](https://example.com/docs)';

function mountRich() {
  return mount(RichMarkdownBlock, {
    attachTo: document.body,
    props: {
      source,
      documentSource: source,
      outline: [],
      settings: defaultEditorSettings,
    },
  });
}

describe("RichMarkdownBlock 源码保真", () => {
  it("编辑普通文本时保留未触及的 Emoji、智能标点、裸 URL 和显式链接", async () => {
    const wrapper = mountRich();
    await nextTick();
    const root = wrapper.get<HTMLElement>(".rich-markdown-block");
    const paragraph = root.get("p").element;
    const alpha = Array.from(paragraph.childNodes)
      .find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes("alpha"));
    expect(alpha).toBeDefined();
    alpha!.textContent = alpha!.textContent!.replace("alpha", "beta");

    await root.trigger("input");

    expect(wrapper.emitted<string[]>("update")?.at(-1)?.[0])
      .toBe(source.replace("alpha", "beta"));
    wrapper.unmount();
  });

  it("点击发生转换的文本片段时恢复其原始源码", async () => {
    const wrapper = mountRich();
    await nextTick();
    const emoji = wrapper.get<HTMLElement>('[data-marko-inline-markdown=":poodle:"]');

    await emoji.trigger("click");

    expect(wrapper.get(".text-markdown-source").text()).toBe(":poodle:");
    wrapper.unmount();
  });
});

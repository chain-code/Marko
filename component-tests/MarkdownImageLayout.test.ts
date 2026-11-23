import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const source = [
  "文字 ![inline](https://example.com/inline.png) 尾部",
  "",
  "![standalone](https://example.com/standalone.png)",
  "",
  "[![linked](https://example.com/linked.png)](https://example.com)",
  "",
  "![first](https://example.com/first.png) ![second](https://example.com/second.png)",
].join("\n");

describe("Markdown 图片段落布局", () => {
  it("Preview 与 Rich 仅标记独占的单张图片", async () => {
    const preview = mount(MarkdownPreview, {
      props: {
        source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    const rich = mount(RichMarkdownBlock, {
      props: {
        source,
        documentSource: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });

    await nextTick();
    await flushPromises();
    await nextTick();

    for (const wrapper of [preview, rich]) {
      expect(imageParagraph(wrapper.element, "inline").classList.contains("standalone-image-paragraph")).toBe(false);
      expect(imageParagraph(wrapper.element, "standalone").classList.contains("standalone-image-paragraph")).toBe(true);
      expect(imageParagraph(wrapper.element, "linked").classList.contains("standalone-image-paragraph")).toBe(true);
      expect(imageParagraph(wrapper.element, "first").classList.contains("standalone-image-paragraph")).toBe(false);
      expect(imageParagraph(wrapper.element, "second").classList.contains("standalone-image-paragraph")).toBe(false);
    }

    preview.unmount();
    rich.unmount();
  });

  it("renders safe GIF data URIs in Preview, Rich and Continuous", async () => {
    const dataUri = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==";
    const dataSource = `![data](${dataUri})`;
    const preview = mount(MarkdownPreview, {
      props: { source: dataSource, outline: [], settings: defaultEditorSettings },
    });
    const rich = mount(RichMarkdownBlock, {
      props: {
        source: dataSource,
        documentSource: dataSource,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    const continuous = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: dataSource,
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });

    await nextTick();
    await flushPromises();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await nextTick();

    for (const wrapper of [preview, rich, continuous]) {
      expect(wrapper.get('img[alt="data"]').attributes("src")).toBe(dataUri);
      wrapper.unmount();
    }
  });
});

function imageParagraph(root: Element, alt: string) {
  const paragraph = root.querySelector(`img[alt="${alt}"]`)?.closest("p");
  expect(paragraph).not.toBeNull();
  return paragraph as HTMLParagraphElement;
}

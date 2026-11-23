import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const source = [
  "正文脚注[^中文 NOTE]。",
  "",
  "> - [^中文 nOtE]: 第一段 **加粗** 内容。",
  ">",
  ">       第二段 [链接](https://example.com) 内容。",
].join("\r\n");

async function settleUi() {
  await nextTick();
  await flushPromises();
  await nextTick();
}

describe("Markdown 脚注悬停摘要", () => {
  it("Preview、Rich 使用纯文本摘要，Continuous 使用多段 Markdown 提示层", async () => {
    const preview = mount(MarkdownPreview, {
      props: { source, outline: [], settings: defaultEditorSettings },
    });
    const rich = mount(RichMarkdownBlock, {
      props: { source, documentSource: source, outline: [], settings: defaultEditorSettings },
    });
    const continuous = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    const summary = "第一段 加粗 内容。 第二段 链接 内容。";
    expect(preview.get(".footnote-ref a").attributes("title")).toBe(summary);
    expect(rich.get(".footnote-ref a").attributes("title")).toBe(summary);
    const continuousReference = continuous.get(".cm-rendered-footnote-reference");
    expect(continuousReference.attributes("title")).toBeUndefined();
    expect(continuousReference.attributes("data-footnote-id")).toBe("中文 nOtE");
    await continuousReference.trigger("mouseenter");
    await settleUi();
    const tooltip = document.body.querySelector<HTMLElement>(".cm-footnote-tooltip");
    expect(Array.from(tooltip?.querySelectorAll("p") ?? []).map((item) => item.textContent))
      .toEqual(["第一段 加粗 内容。", "第二段 链接 内容。"]);
    expect(tooltip?.querySelector("strong")?.textContent).toBe("加粗");
    expect(tooltip?.querySelector("a")?.textContent).toBe("链接");

    preview.unmount();
    rich.unmount();
    continuous.unmount();
  });
});

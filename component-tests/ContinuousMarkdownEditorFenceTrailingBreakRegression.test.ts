import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const fence = String.fromCharCode(96).repeat(3);

describe("ContinuousMarkdownEditor 尾随换行围栏回归", () => {
  it.each(["\n", "\r\n"])("在 %j 文档中折叠后接正文的代码围栏", async (lineBreak) => {
    const source = [fence + "ts", "alpha", fence, "", "After"].join(lineBreak);
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };

    const offset = source.indexOf("alpha");
    await editor.selectRange(offset, offset, false);
    await settleUi();

    expect(wrapper.findAll(".cm-active-raw-fence-hidden").length).toBeGreaterThanOrEqual(1);
    expect(wrapper.findAll(".cm-active-raw-content-first")).toHaveLength(1);
    expect(wrapper.findAll(".cm-active-raw-content-last")).toHaveLength(1);
    expect(wrapper.text()).not.toContain(fence);
    wrapper.unmount();
  });
});

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

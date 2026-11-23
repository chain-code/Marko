import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorCommand } from "@/types";

describe("ContinuousMarkdownEditor Alert 切换命令", () => {
  it("使用工具栏 payload 将当前段落切换为所选 Alert 类型", async () => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: "Intro",
        outline: [],
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    const editor = wrapper.vm as unknown as {
      runCommand: (command: EditorCommand, payload?: string) => void;
    };

    editor.runCommand("callout", "CAUTION");
    await nextTick();

    const update = wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0] ?? "";
    expect(update).toBe("> [!CAUTION]\n> Intro");
    expect(wrapper.get(".cm-content").text()).toContain("Intro");
    wrapper.unmount();
  });
});

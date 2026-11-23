import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import { createOutline } from "@/utils/markdown";

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function dispatchNativePaste(content: HTMLElement, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [],
      getData: (type: string) => type === "text/plain" ? text : "",
    },
  });
  content.dispatchEvent(event);
}

describe("ContinuousMarkdownEditor model synchronization", () => {
  it("stays synchronized after Ctrl+A pastes a complete Markdown document", async () => {
    const sourceMode = ref(true);
    const value = ref("old document");
    const settings = computed(() => ({
      ...defaultEditorSettings,
      sourceMode: sourceMode.value,
    }));
    const Host = defineComponent({
      setup() {
        return () => h(ContinuousMarkdownEditor, {
          modelValue: value.value,
          outline: createOutline(value.value),
          settings: settings.value,
          "onUpdate:modelValue": (nextValue: string) => {
            value.value = nextValue;
          },
        });
      },
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await settleUi();
    const editor = wrapper.findComponent(ContinuousMarkdownEditor);
    const content = editor.get<HTMLElement>(".cm-content").element;
    content.dispatchEvent(new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();

    const replacement = [
      "# Pasted title",
      "",
      "- first item",
      "- second item",
    ].join("\n");
    expect(() => dispatchNativePaste(content, replacement)).not.toThrow();
    await settleUi();
    expect(value.value).toBe(replacement);

    sourceMode.value = false;
    await settleUi();
    expect(editor.find(".cm-heading-1").exists()).toBe(true);
    expect(editor.findAll(".cm-rendered-bullet-marker")).toHaveLength(2);
    wrapper.unmount();
  });
});

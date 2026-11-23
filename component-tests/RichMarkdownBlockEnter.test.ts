import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

function mountRichBlock() {
  return mount(RichMarkdownBlock, {
    attachTo: document.body,
    props: {
      source: "alpha beta",
      documentSource: "alpha beta",
      outline: [],
      settings: defaultEditorSettings,
    },
  });
}

function mockEditingCommand(root: HTMLElement) {
  const execCommand = vi.fn((command: string) => {
    root.innerHTML = command === "insertParagraph"
      ? "<p>alpha</p><p>beta</p>"
      : "<p>alpha<br>beta</p>";
    return true;
  });
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
  return execCommand;
}

afterEach(() => {
  Reflect.deleteProperty(document, "execCommand");
  document.body.innerHTML = "";
});

describe("RichMarkdownBlock Enter 交互", () => {
  it("普通 Enter 创建新的 Markdown 段落", async () => {
    const wrapper = mountRichBlock();
    await nextTick();
    const root = wrapper.get<HTMLElement>(".rich-markdown-block");
    const execCommand = mockEditingCommand(root.element);

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    root.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("insertParagraph");
    expect(wrapper.emitted<string[]>("update")?.at(-1)).toEqual(["alpha\n\nbeta"]);
    wrapper.unmount();
  });

  it("Shift+Enter 插入单行 Markdown 硬换行", async () => {
    const wrapper = mountRichBlock();
    await nextTick();
    const root = wrapper.get<HTMLElement>(".rich-markdown-block");
    const execCommand = mockEditingCommand(root.element);

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    root.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("insertLineBreak");
    expect(wrapper.emitted<string[]>("update")?.at(-1)).toEqual(["alpha  \nbeta"]);
    wrapper.unmount();
  });
});

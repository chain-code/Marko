import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import type { EditorCommand, EditorSettings, SelectionStats } from "@/types";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  runCommand: (command: EditorCommand) => void;
  replaceDocument: (value: string) => void;
  selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

async function mountEditor(source: string, settings: Partial<EditorSettings>) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        ...settings,
        extensions: { ...defaultEditorSettings.extensions },
      },
    },
  });
  await settleUi();
  return wrapper;
}

function latestSource(wrapper: VueWrapper): string {
  return wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0] ?? "";
}

describe("ContinuousMarkdownEditor default code language", () => {
  it("inserts and selects the configured language when the third fence marker is typed", async () => {
    const wrapper = await mountEditor("``", {
      defaultCodeLanguage: "typescript",
      defaultCodeLanguageApplyTo: "markdown",
    });
    const editor = wrapper.vm as unknown as EditorHandle;
    await editor.selectRange(2, 2, false);
    wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "`",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();

    expect(latestSource(wrapper)).toBe("```typescript");
    const selection = wrapper.emitted<SelectionStats[]>("selection")?.at(-1)?.[0];
    expect(selection?.selectionStart).toBe(3);
    expect(selection?.selectionEnd).toBe(13);
    wrapper.unmount();
  });

  it("applies a fixed language only to the enabled insertion channel", async () => {
    const menuWrapper = await mountEditor("", {
      defaultCodeLanguage: "go",
      defaultCodeLanguageApplyTo: "menu",
    });
    (menuWrapper.vm as unknown as EditorHandle).runCommand("codeBlock");
    await settleUi();
    expect(latestSource(menuWrapper)).toBe("```go\n\n```\n");
    menuWrapper.unmount();

    const markdownOnly = await mountEditor("", {
      defaultCodeLanguage: "go",
      defaultCodeLanguageApplyTo: "markdown",
    });
    (markdownOnly.vm as unknown as EditorHandle).runCommand("codeBlock");
    await settleUi();
    expect(latestSource(markdownOnly)).toBe("```\n\n```\n");
    markdownOnly.unmount();
  });

  it("reuses the most recently entered code block language without inserting __LAST", async () => {
    const source = "```python\nvalue = 1\n```";
    const wrapper = await mountEditor(source, {
      defaultCodeLanguage: "__LAST",
      defaultCodeLanguageApplyTo: "both",
    });
    const editor = wrapper.vm as unknown as EditorHandle;
    const codeOffset = source.indexOf("value");
    await editor.selectRange(codeOffset, codeOffset, false);
    await settleUi();
    editor.replaceDocument("");
    await settleUi();
    editor.runCommand("codeBlock");
    await settleUi();

    expect(latestSource(wrapper)).toBe("```python\n\n```\n");
    expect(latestSource(wrapper)).not.toContain("__LAST");
    wrapper.unmount();
  });
});

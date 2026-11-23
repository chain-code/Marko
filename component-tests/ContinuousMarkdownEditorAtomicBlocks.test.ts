import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { OutlineItem } from "@/types";

async function mountEditor(source: string, outline: OutlineItem[] = []) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline,
      settings: {
        ...defaultEditorSettings,
        extensions: { ...defaultEditorSettings.extensions },
      },
    },
  });
  await settle();
  return wrapper;
}

async function settle() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function latestSource(wrapper: VueWrapper): string | undefined {
  return (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0];
}

async function pressContentKey(wrapper: VueWrapper, key: string) {
  wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  }));
  await settle();
}

describe("ContinuousMarkdownEditor atomic HR and TOC blocks", () => {
  it.each(["{:toc}", "[[_TOC_]]", "{: toc depth=3 }"])(
    "renders and deletes the Typora TOC marker %s as one atomic block",
    async (marker) => {
      const source = `Before\n${marker}\n# Intro`;
      const wrapper = await mountEditor(source, [
        { id: "intro", title: "Intro", level: 1, line: 3 },
      ]);

      const preview = wrapper.get<HTMLElement>(".cm-special-preview-toc");
      expect(preview.text()).toContain("Intro");
      await preview.trigger("click");
      await settle();
      expect(preview.classes()).toContain("cm-atomic-block-selected");

      await preview.trigger("keydown", { key: "Delete" });
      await settle();
      expect(latestSource(wrapper)).toBe("Before\n\n# Intro");
      expect(wrapper.find(".cm-special-preview-toc").exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it.each(["Backspace", "Delete"])(
    "focuses a TOC block and clears it with %s without revealing source",
    async (key) => {
      const source = "Cursor\n\n[TOC]\n\n# Intro";
      const wrapper = await mountEditor(source, [
        { id: "intro", title: "Intro", level: 1, line: 5 },
      ]);

      const preview = wrapper.get<HTMLElement>(".cm-special-preview-toc");
      expect(preview.attributes("tabindex")).toBe("-1");
      await preview.trigger("click");
      await settle();
      expect(preview.classes()).toContain("cm-atomic-block-selected");
      expect(preview.attributes("aria-selected")).toBe("true");

      await preview.trigger("keydown", { key: "Enter" });
      await settle();
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
      expect(wrapper.find(".cm-special-preview-toc").exists()).toBe(true);

      await preview.trigger("keydown", { key });
      await settle();
      expect(latestSource(wrapper)).toBe("Cursor\n\n\n\n# Intro");
      expect(wrapper.find(".cm-special-preview-toc").exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it("deletes a TOC block from its hover control", async () => {
    const source = "Cursor\n\n[TOC]\n\n# Intro";
    const wrapper = await mountEditor(source, [
      { id: "intro", title: "Intro", level: 1, line: 5 },
    ]);
    const deleteButton = wrapper.get<HTMLButtonElement>(".cm-delete-toc");

    expect(deleteButton.attributes("title")).toBe("\u5220\u9664\u76ee\u5f55");
    await deleteButton.trigger("click");
    await settle();

    expect(latestSource(wrapper)).toBe("Cursor\n\n\n\n# Intro");
    expect(wrapper.find(".cm-special-preview-toc").exists()).toBe(false);
    wrapper.unmount();
  });

  it("focuses and deletes a rendered horizontal rule as one block", async () => {
    const source = "* * *\n\nAfter";
    const wrapper = await mountEditor(source);
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const after = source.indexOf("After");
    await editor.selectRange(after, after, false);
    await settle();
    const rule = wrapper.get<HTMLElement>(".cm-horizontal-rule");

    await rule.trigger("mousedown", { button: 0 });
    await settle();
    expect(rule.classes()).toContain("cm-atomic-block-selected");
    expect(rule.attributes("contenteditable")).toBe("false");

    await rule.trigger("keydown", { key: "Enter" });
    await settle();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    await rule.trigger("keydown", { key: "Delete" });
    await settle();
    expect(latestSource(wrapper)).toBe("\n\nAfter");
    wrapper.unmount();
  });

  it("moves into and out of a TOC atom with vertical arrows", async () => {
    const source = "Before\n\n[TOC]\n\nAfter";
    const wrapper = await mountEditor(source, [
      { id: "after", title: "After", level: 1, line: 5 },
    ]);
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      getViewState: () => { anchor: number; head: number };
    };

    await editor.selectRange("Before".length, "Before".length, false);
    await pressContentKey(wrapper, "ArrowDown");
    const preview = wrapper.get<HTMLElement>(".cm-special-preview-toc");
    expect(preview.classes()).toContain("cm-atomic-block-selected");

    await preview.trigger("keydown", { key: "ArrowDown" });
    await settle();
    const after = source.indexOf("After");
    expect(editor.getViewState()).toMatchObject({ anchor: after, head: after });
    wrapper.unmount();
  });

  it("removes a horizontal rule from the following paragraph start in one Backspace", async () => {
    const source = "Before\n\n---\n\nAfter";
    const wrapper = await mountEditor(source);
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      getViewState: () => { anchor: number; head: number };
    };
    const after = source.indexOf("After");

    await editor.selectRange(after, after, false);
    await pressContentKey(wrapper, "Backspace");
    expect(latestSource(wrapper)).toBe("Before\n\nAfter");
    expect(editor.getViewState()).toMatchObject({
      anchor: "Before\n\n".length,
      head: "Before\n\n".length,
    });
    wrapper.unmount();
  });
});

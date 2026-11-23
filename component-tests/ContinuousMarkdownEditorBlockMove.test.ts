import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import type { EditorSettings } from "@/types";
import { defaultEditorSettings } from "@/utils/editorSettings";

function mountEditor(
  source: string,
  overrides: Partial<EditorSettings> = {},
) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        ...overrides,
        extensions: {
          ...defaultEditorSettings.extensions,
          ...overrides.extensions,
        },
      },
    },
  });
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

async function pressAltArrow(
  wrapper: VueWrapper,
  cursor: number,
  key: "ArrowUp" | "ArrowDown",
) {
  const editor = wrapper.vm as unknown as {
    selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
  };
  await editor.selectRange(cursor, cursor, false);
  await settleUi();
  wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    altKey: true,
    bubbles: true,
    cancelable: true,
  }));
  await settleUi();
}

function latestSource(wrapper: VueWrapper): string {
  return (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
}

describe("ContinuousMarkdownEditor block movement", () => {
  it("moves a complete visual Markdown block with Alt+ArrowDown", async () => {
    const source = "First line\ncontinued\n\n## Second\n\nThird";
    const wrapper = mountEditor(source);
    await settleUi();

    await pressAltArrow(wrapper, source.indexOf("continued"), "ArrowDown");

    expect(latestSource(wrapper)).toBe("## Second\n\nFirst line\ncontinued\n\nThird");
    wrapper.unmount();
  });

  it("moves a complete visual Markdown block with Alt+ArrowUp", async () => {
    const source = "First\n\nSecond line\ncontinued\n\nThird";
    const wrapper = mountEditor(source);
    await settleUi();

    await pressAltArrow(wrapper, source.indexOf("continued"), "ArrowUp");

    expect(latestSource(wrapper)).toBe("Second line\ncontinued\n\nFirst\n\nThird");
    wrapper.unmount();
  });

  it("moves only the current YAML line inside Front Matter", async () => {
    const source = "---\ntitle: Marko\nauthor: chain-code\n---\nBody";
    const wrapper = mountEditor(source);
    await settleUi();

    await pressAltArrow(wrapper, source.indexOf("author"), "ArrowUp");

    expect(latestSource(wrapper)).toBe(
      "---\nauthor: chain-code\ntitle: Marko\n---\nBody",
    );
    wrapper.unmount();
  });

  it("moves an ATX heading without adjacent body text", async () => {
    const source = "Before\n# Heading\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();

    await pressAltArrow(wrapper, source.indexOf("Heading"), "ArrowDown");

    expect(latestSource(wrapper)).toBe("Before\nAfter\n# Heading");
    wrapper.unmount();
  });

  it("keeps Alt+ArrowDown line-based in source mode", async () => {
    const source = "First line\ncontinued\n\n## Second\n\nThird";
    const wrapper = mountEditor(source, { sourceMode: true });
    await settleUi();

    await pressAltArrow(wrapper, source.indexOf("continued"), "ArrowDown");

    expect(latestSource(wrapper)).toBe("First line\n\ncontinued\n## Second\n\nThird");
    wrapper.unmount();
  });

  it.each([
    {
      name: "code",
      source: "Before\n\n```js\none\ntwo\n```\n\nAfter",
    },
    {
      name: "math",
      source: "Before\n\n$$\none\ntwo\n$$\n\nAfter",
    },
    {
      name: "HTML",
      source: "Before\n\n<div>\none\ntwo\n</div>\n\nAfter",
    },
  ])("keeps Alt+ArrowDown line-based inside $name raw content", async ({ source }) => {
    const wrapper = mountEditor(source);
    await settleUi();

    await pressAltArrow(wrapper, source.indexOf("one"), "ArrowDown");

    expect(latestSource(wrapper)).toBe(source.replace("one\ntwo", "two\none"));
    wrapper.unmount();
  });
});

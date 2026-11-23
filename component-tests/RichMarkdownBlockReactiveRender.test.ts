import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorSettings } from "@/types";

function createSettings(overrides: Partial<EditorSettings> = {}): EditorSettings {
  return {
    ...defaultEditorSettings,
    ...overrides,
    smartQuotes: overrides.smartQuotes
      ?? overrides.smartPunctuation
      ?? defaultEditorSettings.smartQuotes,
    smartDashes: overrides.smartDashes
      ?? overrides.smartPunctuation
      ?? defaultEditorSettings.smartDashes,
    extensions: {
      ...defaultEditorSettings.extensions,
      ...overrides.extensions,
    },
  };
}

function mountBlock(source: string, settings = createSettings()) {
  return mount(RichMarkdownBlock, {
    attachTo: document.body,
    props: {
      source,
      documentSource: source,
      filePath: "C:/one/note.md",
      outline: [],
      settings,
    },
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("RichMarkdownBlock reactive rendering", () => {
  it("rerenders document, path, outline, and rendering setting dependencies", async () => {
    const referenceSource = "Read [Docs][docs].";
    const wrapper = mountBlock(referenceSource);
    await nextTick();

    expect(wrapper.find("a").exists()).toBe(false);
    await wrapper.setProps({
      documentSource: referenceSource + "\n\n[docs]: https://example.com/docs",
    });
    expect(wrapper.get("a").attributes("href")).toBe("https://example.com/docs");

    const imageSource = "![Image](assets/image.png)";
    await wrapper.setProps({
      source: imageSource,
      documentSource: imageSource,
    });
    expect(wrapper.get("img").attributes("src")).toContain("C:/one/assets/image.png");
    await wrapper.setProps({ filePath: "D:/two/note.md" });
    expect(wrapper.get("img").attributes("src")).toContain("D:/two/assets/image.png");

    await wrapper.setProps({
      source: "[TOC]",
      documentSource: "[TOC]",
      outline: [],
    });
    expect(wrapper.text()).not.toContain("Intro");
    await wrapper.setProps({
      outline: [{ id: "intro", title: "Intro", level: 1, line: 1 }],
    });
    expect(wrapper.text()).toContain("Intro");

    const plainSettings = createSettings({
      preserveSingleLineBreaks: false,
      codeLineNumbers: false,
    });
    await wrapper.setProps({
      source: "first\nsecond",
      documentSource: "first\nsecond",
      settings: plainSettings,
    });
    expect(wrapper.find("br").exists()).toBe(false);
    await wrapper.setProps({
      settings: createSettings({
        preserveSingleLineBreaks: true,
        codeLineNumbers: false,
      }),
    });
    expect(wrapper.find("br").exists()).toBe(true);

    const fence = String.fromCharCode(96).repeat(3);
    const codeSource = [fence + "text", "one", "two", fence].join("\n");
    await wrapper.setProps({
      source: codeSource,
      documentSource: codeSource,
      settings: createSettings({ codeLineNumbers: false }),
    });
    expect(wrapper.find(".code-with-line-numbers").exists()).toBe(false);
    await wrapper.setProps({
      settings: createSettings({ codeLineNumbers: true }),
    });
    expect(wrapper.find(".code-with-line-numbers").exists()).toBe(true);
    wrapper.unmount();
  });

  it("keeps a pure source echo but rerenders when another dependency changes", async () => {
    const disabled = createSettings({ smartPunctuation: false });
    const wrapper = mountBlock("plain", disabled);
    await nextTick();
    const root = wrapper.get<HTMLElement>(".rich-markdown-block");
    root.element.focus();
    root.element.innerHTML = '<p>"hello" --</p>';
    await root.trigger("input");
    const emitted = wrapper.emitted<string[]>("update")?.at(-1)?.[0];
    expect(emitted).toBe('"hello" --');

    const sentinel = document.createElement("span");
    sentinel.dataset.sentinel = "true";
    root.element.append(sentinel);
    await wrapper.setProps({ source: emitted });
    expect(root.find('[data-sentinel="true"]').exists()).toBe(true);

    await wrapper.setProps({
      settings: createSettings({ smartPunctuation: true }),
    });
    expect(root.find('[data-sentinel="true"]').exists()).toBe(false);
    expect(root.text()).not.toContain('"hello" --');
    wrapper.unmount();
  });
});

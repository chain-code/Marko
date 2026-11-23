import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import type { EditorSettings } from "@/types";
import { defaultEditorSettings } from "@/utils/editorSettings";

const fence = "`".repeat(3);
const componentSource = readFileSync(
  resolve(process.cwd(), "src/components/ContinuousMarkdownEditor.vue"),
  "utf8",
);

function styleRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return componentSource.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
}

async function mountEditor(
  source: string,
  options: { readonly?: boolean; settings?: Partial<EditorSettings> } = {},
) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly: options.readonly,
      settings: {
        ...defaultEditorSettings,
        ...options.settings,
        extensions: {
          ...defaultEditorSettings.extensions,
          ...options.settings?.extensions,
        },
      },
    },
  });
  await settleUi();
  return wrapper;
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function latestSource(wrapper: VueWrapper): string {
  return (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
}

async function chooseLanguage(wrapper: VueWrapper, query: string, identifier: string) {
  await wrapper.get(".code-fence-language-trigger").trigger("click");
  await settleUi();
  await wrapper.get<HTMLInputElement>("input[aria-label='搜索代码语言']").setValue(query);
  await settleUi();
  await wrapper.get(`[data-language='${identifier}']`).trigger("click");
  await settleUi();
}

async function activateCodeSource(wrapper: VueWrapper, source: string, needle: string) {
  const editor = wrapper.vm as unknown as {
    selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
  };
  const offset = source.indexOf(needle);
  await editor.selectRange(offset, offset, false);
  await settleUi();
}

describe("ContinuousMarkdownEditor code fence language interaction", () => {
  it("keeps the active language control outside code block layout flow", () => {
    const widgetRule = styleRule(":deep(.cm-active-code-language-widget)");
    const selectorRule = styleRule(
      ":deep(.cm-active-code-language-widget .code-fence-language-selector)",
    );
    const firstLineRule = styleRule(
      ":deep(.cm-raw-block-code.cm-active-raw-content-first)",
    );
    const lastLineRule = styleRule(
      ":deep(.cm-raw-block-code.cm-active-raw-content-last)",
    );

    expect(widgetRule).toMatch(/height:\s*0;/);
    expect(widgetRule).toMatch(/min-height:\s*0;/);
    expect(widgetRule).toMatch(/overflow:\s*visible;/);
    expect(selectorRule).toMatch(/position:\s*absolute;/);
    expect(selectorRule).toMatch(/min-height:\s*26px;/);
    expect(firstLineRule).toMatch(/padding-top:\s*8px;/);
    expect(firstLineRule).toMatch(/line-height:\s*1\.5;/);
    expect(lastLineRule).toMatch(/padding-bottom:\s*8px;/);
    expect(lastLineRule).toMatch(/line-height:\s*1\.5;/);
    expect(componentSource).not.toMatch(/line-height:\s*1\.5;\s*\n:deep\(/);
  });

  it("shows the language control only in source edit mode and records one undo step", async () => {
    const source = ["before", "", fence + "javascript", "const answer = 42;", fence].join("\n");
    const wrapper = await mountEditor(source);

    expect(wrapper.find(".code-fence-language-selector").exists()).toBe(false);
    await activateCodeSource(wrapper, source, "answer");
    expect(wrapper.get(".code-fence-language-trigger").text()).toContain("javascript");
    expect(wrapper.get<HTMLButtonElement>(".code-fence-language-trigger").element.tabIndex).toBe(0);
    await chooseLanguage(wrapper, "py", "python");
    expect(latestSource(wrapper)).toBe(source.replace(fence + "javascript", fence + "python"));
    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(false);
    expect(wrapper.find(".cm-raw-block-code").exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.get<HTMLElement>(".cm-content").element);

    wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();
    expect(latestSource(wrapper)).toBe(source);
    wrapper.unmount();
  });

  it("keeps Enter activation and selection inside the language selector", async () => {
    const source = ["before", "", fence + "javascript", "const answer = 42;", fence].join("\n");
    const wrapper = await mountEditor(source);
    await activateCodeSource(wrapper, source, "answer");
    const trigger = wrapper.get<HTMLButtonElement>(".code-fence-language-trigger");

    trigger.element.focus();
    await trigger.trigger("keydown", { key: "Enter" });
    trigger.element.click();
    await settleUi();
    expect(wrapper.find(".code-fence-language-popover").exists()).toBe(true);
    expect(wrapper.find(".cm-raw-block-code").exists()).toBe(true);

    const input = wrapper.get<HTMLInputElement>("input[aria-label='搜索代码语言']");
    await input.setValue("typ");
    await settleUi();
    await input.trigger("keydown", { key: "Enter" });
    await settleUi();

    expect(latestSource(wrapper)).toBe(source.replace(fence + "javascript", fence + "typescript"));
    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(false);
    expect(wrapper.find(".cm-raw-block-code").exists()).toBe(true);
    wrapper.unmount();
  });

  it("clears the language without changing code content or line endings", async () => {
    const source = `before\r\n\r\n${fence}rust\r\nfn main() {}\r\n${fence}`;
    const wrapper = await mountEditor(source);
    await activateCodeSource(wrapper, source, "main");
    await wrapper.get(".code-fence-language-trigger").trigger("click");
    await settleUi();
    await wrapper.get(".code-fence-language-clear").trigger("click");
    await settleUi();

    expect(latestSource(wrapper)).toBe(`before\r\n\r\n${fence}\r\nfn main() {}\r\n${fence}`);
    expect(wrapper.get(".code-fence-language-trigger").text()).toContain("代码语言");
    wrapper.unmount();
  });

  it("keeps rendered code free of editing controls in readonly mode", async () => {
    const source = ["before", "", fence + "go", "package main", fence].join("\n");
    const wrapper = await mountEditor(source, { readonly: true });

    expect(wrapper.find(".code-fence-language-selector").exists()).toBe(false);
    expect(wrapper.find(".code-fence-language-trigger").exists()).toBe(false);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("removes the active selector when readonly mode changes", async () => {
    const source = ["before", "", fence + "go", "package main", fence].join("\n");
    const wrapper = await mountEditor(source);

    expect(wrapper.find(".code-fence-language-trigger").exists()).toBe(false);
    await activateCodeSource(wrapper, source, "main");
    expect(wrapper.find(".code-fence-language-trigger").exists()).toBe(true);
    await wrapper.setProps({ readonly: true });
    await settleUi();
    expect(wrapper.find(".code-fence-language-trigger").exists()).toBe(false);
    expect(wrapper.find(".code-fence-language-static").exists()).toBe(false);

    await wrapper.setProps({ readonly: false });
    await settleUi();
    expect(wrapper.find(".code-fence-language-static").exists()).toBe(false);
    await activateCodeSource(wrapper, source, "main");
    expect(wrapper.get<HTMLButtonElement>(".code-fence-language-trigger").element.tabIndex).toBe(0);
    wrapper.unmount();
  });

  it("keeps the language entry available while the code source is active", async () => {
    const source = ["before", "", fence + "ts", "const value = 1;", fence].join("\n");
    const wrapper = await mountEditor(source);
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };

    expect(wrapper.find(".code-fence-language-trigger").exists()).toBe(false);
    const codeOffset = source.indexOf("value");
    await editor.selectRange(codeOffset, codeOffset, false);
    await settleUi();

    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(false);
    const languageWidget = wrapper.get<HTMLElement>(".cm-active-code-language-widget");
    const lastContent = wrapper.get<HTMLElement>(".cm-active-raw-content-last");
    expect(wrapper.find(".code-fence-language-trigger").exists()).toBe(true);
    expect(wrapper.find(".cm-raw-block-code").exists()).toBe(true);
    expect(
      lastContent.element.compareDocumentPosition(languageWidget.element)
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);

    await chooseLanguage(wrapper, "typ", "typescript");
    expect(latestSource(wrapper)).toBe(source.replace(fence + "ts", fence + "typescript"));
    expect(wrapper.find(".cm-active-code-language-widget").exists()).toBe(true);
    expect(wrapper.find(".cm-raw-block-code").exists()).toBe(true);
    wrapper.unmount();
  });

  it("updates quoted and list-contained fence prefixes in place", async () => {
    const cases = [
      {
        source: ["before", "", `> ${fence}js`, "> const value = 1;", `> ${fence}`].join("\n"),
        expectedOpening: `> ${fence}typescript`,
      },
      {
        source: ["- before", `  ${fence}js`, "  const value = 1;", `  ${fence}`].join("\n"),
        expectedOpening: `  ${fence}typescript`,
      },

    ];

    for (const current of cases) {
      const wrapper = await mountEditor(current.source);
      await activateCodeSource(wrapper, current.source, "value");
      await chooseLanguage(wrapper, "typ", "typescript");
      expect(latestSource(wrapper)).toContain(current.expectedOpening);
      wrapper.unmount();
    }
  });

  it("does not add a fence selector to indented code or rendered diagrams", async () => {
    const indented = await mountEditor([
      "before",
      "",
      "    ~~~mermaid",
      "    A --> B",
      "    ~~~",
    ].join("\n"));
    expect(indented.find(".cm-special-preview-code").exists()).toBe(true);
    expect(indented.find(".code-fence-language-selector").exists()).toBe(false);
    indented.unmount();

    const diagram = await mountEditor([
      "before",
      "",
      fence + "mermaid",
      "flowchart LR",
      "  A --> B",
      fence,
    ].join("\n"));
    expect(diagram.find(".cm-special-preview-diagram").exists()).toBe(true);
    expect(diagram.find(".code-fence-language-selector").exists()).toBe(false);
    diagram.unmount();
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const table = ["| A |", "| --- |", "| one |"];
const math = ["$$", "x + y", "$$"];

describe("ContinuousMarkdownEditor code spacing ownership", () => {
  it.each([
    { name: "带语言", code: ["~~~text", "code", "~~~"], hasLanguage: true },
    { name: "裸围栏", code: ["~~~", "code", "~~~"], hasLanguage: false },
  ])("在 22px 字号下为$name代码块保留较大的相邻边距", async ({ code, hasLanguage }) => {
    const cases = [
      {
        first: table,
        second: code,
        firstSelector: ".cm-visual-table-widget",
        secondSelector: ".cm-special-preview-code",
        firstAfter: false,
        secondBefore: true,
      },
      {
        first: code,
        second: table,
        firstSelector: ".cm-special-preview-code",
        secondSelector: ".cm-visual-table-widget",
        firstAfter: true,
        secondBefore: false,
      },
      {
        first: table,
        second: math,
        firstSelector: ".cm-visual-table-widget",
        secondSelector: ".cm-special-preview-math",
        firstAfter: false,
        secondBefore: true,
      },
      {
        first: math,
        second: table,
        firstSelector: ".cm-special-preview-math",
        secondSelector: ".cm-visual-table-widget",
        firstAfter: true,
        secondBefore: false,
      },
      {
        first: code,
        second: math,
        firstSelector: ".cm-special-preview-code",
        secondSelector: ".cm-special-preview-math",
        firstAfter: true,
        secondBefore: false,
      },
      {
        first: math,
        second: code,
        firstSelector: ".cm-special-preview-math",
        secondSelector: ".cm-special-preview-code",
        firstAfter: false,
        secondBefore: true,
      },
    ];

    for (const current of cases) {
      const source = [...current.first, "", ...current.second].join("\n");
      const wrapper = mountEditor(source, 22);
      await settleUi();

      expect(
        wrapper.get(current.firstSelector).classes().includes("cm-preview-collapse-after"),
        source,
      ).toBe(current.firstAfter);
      expect(
        wrapper.get(current.secondSelector).classes().includes("cm-preview-collapse-before"),
        source,
      ).toBe(current.secondBefore);
      if (current.first === code || current.second === code) {
        const languageLabel = hasLanguage ? "text" : "代码语言";
        expect(
          wrapper.find(".cm-code-language-mount").exists(),
          source + languageLabel,
        ).toBe(false);
        expect(wrapper.find(".code-fence-language-static").exists(), source)
          .toBe(false);
      }
      wrapper.unmount();
    }
  });
});

function mountEditor(source: string, fontSize: number) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly: true,
      settings: {
        ...defaultEditorSettings,
        fontSize,
        extensions: { ...defaultEditorSettings.extensions },
      },
    },
  });
}

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

async function mountEditor(source: string, readonly = false) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly,
      settings: {
        ...defaultEditorSettings,
        smartPunctuation: true,
        smartQuotes: true,
        smartDashes: true,
        extensions: {
          ...defaultEditorSettings.extensions,
          html: true,
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

function getEditor(wrapper: VueWrapper) {
  return wrapper.vm as unknown as {
    getViewState: () => { anchor: number };
    selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
  };
}

describe("ContinuousMarkdownEditor cross-line inline semantics", () => {
  it("pairs smart quotes across a soft line break", async () => {
    const source = [
      "cursor",
      "",
      'He said "first line',
      'second line" after.',
    ].join("\n");
    const wrapper = await mountEditor(source);

    expect(wrapper.findAll(".cm-rendered-smart-punctuation").map((node) => node.text()))
      .toEqual(["\u201c", "\u201d"]);
    expect(wrapper.text()).toContain("He said \u201cfirst line second line\u201d after.");
    wrapper.unmount();
  });

  it("renders paired inline HTML across soft line breaks and reveals its source", async () => {
    const html = [
      '<span class="outer">first line',
      "<strong>second line</strong>",
      "last line</span>",
    ].join("\n");
    const source = `cursor\n\nbefore ${html} after`;
    const wrapper = await mountEditor(source);
    const rendered = wrapper.get(".cm-rendered-inline-html");

    expect(rendered.text()).toContain("first line");
    expect(rendered.get("strong").text()).toBe("second line");
    expect(rendered.text()).toContain("last line");

    await rendered.get("strong").trigger("click");
    await settleUi();
    expect(getEditor(wrapper).getViewState().anchor).toBeGreaterThan(source.indexOf("<strong>"));
    expect(wrapper.find(".cm-rendered-inline-html").exists()).toBe(false);
    wrapper.unmount();
  });

  it("reveals an HTML entity on click and restores its rendered form after leaving", async () => {
    const source = "cursor\n\nbefore &amp; after";
    const wrapper = await mountEditor(source);
    const editor = getEditor(wrapper);
    const entityFrom = source.indexOf("&amp;");
    const entity = wrapper.get(".cm-rendered-entity");

    expect(entity.text()).toBe("&");
    expect(entity.attributes("role")).toBe("button");
    await entity.trigger("click");
    await settleUi();
    expect(editor.getViewState().anchor).toBe(entityFrom);
    expect(wrapper.find(".cm-rendered-entity").exists()).toBe(false);
    expect(wrapper.get(".cm-content").text()).toContain("&amp;");

    await editor.selectRange(0, 0, false);
    await settleUi();
    expect(wrapper.get(".cm-rendered-entity").text()).toBe("&");
    wrapper.unmount();
  });

  it("keeps rendered HTML entities non-interactive in readonly mode", async () => {
    const wrapper = await mountEditor("before &copy; after", true);
    const entity = wrapper.get(".cm-rendered-entity");

    expect(entity.text()).toBe("\u00a9");
    expect(entity.attributes("role")).toBeUndefined();
    await entity.trigger("click");
    await settleUi();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.get(".cm-rendered-entity").text()).toBe("\u00a9");
    wrapper.unmount();
  });
});

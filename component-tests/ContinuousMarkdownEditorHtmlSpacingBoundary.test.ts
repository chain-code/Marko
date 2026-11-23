import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

describe("ContinuousMarkdownEditor HTML spacing boundaries", () => {
  beforeEach(() => {
    mockCompactLayout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: "plain transparent container",
      html: "<div><p>paragraph</p></div>",
      before: true,
      after: true,
    },
    {
      name: "explicit zero-margin transparent container",
      html: '<div style="margin: 0"><p>paragraph</p></div>',
      before: true,
      after: true,
    },
    {
      name: "top padding",
      html: '<div style="padding-top: 4px"><p>paragraph</p></div>',
      before: false,
      after: true,
    },
    {
      name: "bottom padding",
      html: '<div style="padding-bottom: 4px"><p>paragraph</p></div>',
      before: true,
      after: false,
    },
    {
      name: "top border",
      html: '<div style="border-top: 1px solid"><p>paragraph</p></div>',
      before: false,
      after: true,
    },
    {
      name: "flex formatting context",
      html: '<div style="display: flex"><p>paragraph</p></div>',
      before: false,
      after: false,
    },
    {
      name: "grid formatting context",
      html: '<div style="display: grid"><p>paragraph</p></div>',
      before: false,
      after: false,
    },
    {
      name: "flow-root formatting context",
      html: '<div style="display: flow-root"><p>paragraph</p></div>',
      before: false,
      after: false,
    },
    {
      name: "overflow formatting context",
      html: '<div style="overflow: hidden"><p>paragraph</p></div>',
      before: false,
      after: false,
    },
    {
      name: "fixed block height",
      html: '<div style="height: 40px"><p>paragraph</p></div>',
      before: true,
      after: false,
    },
    {
      name: "fieldset default box",
      html: "<fieldset><p>paragraph</p></fieldset>",
      before: false,
      after: false,
    },
    {
      name: "asymmetric heading and video",
      html: "<section><h3>heading</h3><video></video></section>",
      before: true,
      after: false,
    },
    {
      name: "asymmetric video and heading",
      html: "<section><video></video><h3>heading</h3></section>",
      before: false,
      after: true,
    },
  ])("classifies $name without crossing a formatting boundary", async ({ html, before, after }) => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: ["Before", "", html, "", "After"].join("\n"),
        outline: [],
        readonly: true,
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    await settleUi();

    const widget = wrapper.get(".cm-special-preview-html");
    expect(widget.classes().includes("cm-html-spacing-before"), html).toBe(before);
    expect(widget.classes().includes("cm-html-spacing-after"), html).toBe(after);
    const collapseBefore = before && !html.includes("<h3>");
    expect(widget.classes().includes("cm-preview-collapse-before"), html).toBe(collapseBefore);

    const root = wrapper.element as HTMLElement;
    const afterGap = Array.from(
      root.querySelectorAll<HTMLElement>(".cm-line.cm-block-gap"),
    ).find((gap) => gap.previousElementSibling === widget.element);
    expect(afterGap, html).toBeDefined();
    expect(afterGap!.classList.contains("cm-spacing-collapsed-gap"), html).toBe(after);
    wrapper.unmount();
  });

  it.each(["\n", "\r\n"])("retains a zero-margin HTML source gap for %j", async (lineBreak) => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: ["Before", "", "<div>plain</div>", "", "After"].join(lineBreak),
        outline: [],
        readonly: true,
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    await settleUi();

    const widget = wrapper.get(".cm-special-preview-html");
    const sourceGap = widget.element.nextElementSibling;
    expect(sourceGap?.classList.contains("cm-block-gap")).toBe(true);
    expect(sourceGap?.classList.contains("cm-spacing-collapsed-gap")).toBe(false);
    expect(sourceGap?.nextElementSibling?.classList.contains("cm-paragraph")).toBe(true);
    wrapper.unmount();
  });

  it("does not add a source gap when zero-margin HTML ends the document", async () => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: "<div>plain</div>",
        outline: [],
        readonly: true,
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    await settleUi();

    const widget = wrapper.get(".cm-special-preview-html");
    expect(widget.element.nextElementSibling?.classList.contains("cm-block-gap") ?? false).toBe(false);
    wrapper.unmount();
  });
});

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function mockCompactLayout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains("cm-scroller") ? 600 : 20;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: height,
      width: 800,
      height,
      toJSON() {
        return this;
      },
    } as DOMRect;
  });
}

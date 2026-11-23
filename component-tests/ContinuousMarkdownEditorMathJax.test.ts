import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import continuousEditorSource from "@/components/ContinuousMarkdownEditor.vue?raw";
import { getContinuousMarkdownLinePresentations } from "@/utils/continuousEditor";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorSettings } from "@/types";

function createSettings(overrides: Partial<EditorSettings> = {}): EditorSettings {
  return {
    ...defaultEditorSettings,
    ...overrides,
    extensions: {
      ...defaultEditorSettings.extensions,
      ...overrides.extensions,
    },
  };
}

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function getCssRule(source: string, selector: string) {
  const selectorStart = source.indexOf(selector);
  if (selectorStart < 0) {
    throw new Error(`Missing CSS selector: ${selector}`);
  }
  const bodyStart = source.indexOf("{", selectorStart);
  const bodyEnd = source.indexOf("}", bodyStart);
  return {
    selectors: source.slice(selectorStart, bodyStart),
    body: source.slice(bodyStart + 1, bodyEnd),
  };
}

describe("ContinuousMarkdownEditor MathJax preview", () => {
  it("keeps source and a live SVG preview together for the active math block", async () => {
    const source = [
      "$$",
      "a = 1 \\label{first}",
      "$$",
      "",
      "$$",
      "b = \\eqref{first}",
      "$$",
      "",
      "After",
    ].join("\n");
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: createSettings({ autoNumberingForMath: "all" }),
      },
    });
    await settleUi();

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const firstClosing = source.indexOf("\n$$") + 1;
    await editor.selectRange(firstClosing, firstClosing, false);
    await settleUi();

    const firstMathLines = getContinuousMarkdownLinePresentations(source, firstClosing)
      .filter((line) => line.className.includes("cm-raw-block-math"))
      .slice(0, 3);
    expect(wrapper.find(".cm-math-fence.cm-active-markdown-line").exists()).toBe(true);
    expect(firstMathLines[0]?.className).toContain("cm-active-delimited-math-fence");
    expect(firstMathLines[2]?.className).toContain("cm-active-delimited-math-fence");
    expect(firstMathLines[0]?.hiddenMarker).toBeNull();
    expect(firstMathLines[2]?.hiddenMarker).toBeNull();
    expect(wrapper.get(".cm-math-fence.cm-raw-block-last").text()).toContain("$$");
    expect(wrapper.find('.md-mathjax-preview mjx-container[jax="SVG"] svg').exists()).toBe(true);
    expect(wrapper.get(".md-mathjax-preview").html()).toContain('id="mjx-eqn:first"');

    const secondClosing = source.lastIndexOf("\n$$") + 1;
    await editor.selectRange(secondClosing, secondClosing, false);
    await settleUi();

    expect(wrapper.findAll(".md-mathjax-preview")).toHaveLength(1);
    expect(wrapper.get(".md-mathjax-preview").html()).toContain('href="#mjx-eqn%3Afirst"');
    expect(wrapper.get(".md-mathjax-preview").html()).toContain('id="mjx-eqn:2"');

    await editor.selectRange(source.length, source.length, false);
    await settleUi();
    expect(wrapper.find(".md-mathjax-preview").exists()).toBe(false);
    wrapper.unmount();
  });

  it("updates the active SVG preview after editing formula source", async () => {
    const source = "$$\nx = 1\n$$";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: createSettings(),
      },
    });
    await settleUi();

    const editor = wrapper.vm as unknown as {
      insertText: (text: string) => void;
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const start = source.indexOf("x = 1");
    await editor.selectRange(start, start + "x = 1".length, false);
    editor.insertText("y = 2");
    await settleUi();

    const preview = wrapper.get(".md-mathjax-preview");
    expect(preview.find('mjx-container[jax="SVG"] svg').exists()).toBe(true);
    expect(preview.html()).toContain('data-latex="y = 2"');
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toBe("$$\ny = 2\n$$");
    wrapper.unmount();
  });

  it("renders a closed GitLab math fence as an active MathJax block", async () => {
    const source = "```math\nx^2 + y^2\n```";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: createSettings(),
      },
    });
    await settleUi();

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const formulaStart = source.indexOf("x^2");
    await editor.selectRange(formulaStart, formulaStart, false);
    await settleUi();

    const mathLines = getContinuousMarkdownLinePresentations(source, formulaStart);
    const formulaLine = wrapper.get(
      ".cm-math.cm-active-raw-content-first.cm-active-raw-content-last",
    );
    expect(mathLines[0]?.className).toContain("cm-active-raw-fence-hidden");
    expect(mathLines[2]?.className).toContain("cm-active-raw-fence-hidden");
    expect(mathLines[0]?.hiddenMarker).not.toBeNull();
    expect(mathLines[2]?.hiddenMarker).not.toBeNull();
    expect(formulaLine.text()).toContain("x^2 + y^2");

    const closingOffset = source.lastIndexOf(String.fromCharCode(96).repeat(3));
    await editor.selectRange(closingOffset, closingOffset, false);
    await settleUi();
    expect(wrapper.get(".cm-math-fence.cm-raw-block-last").classes())
      .toContain("cm-active-raw-fence-hidden");
    expect(wrapper.get(".code-fence-language-trigger").text()).toContain("math");
    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(false);
    expect(wrapper.find('.md-mathjax-preview mjx-container[jax="SVG"] svg').exists()).toBe(true);
    expect(wrapper.get(".md-mathjax-preview").html()).toContain('data-latex="x^2 + y^2"');
    wrapper.unmount();
  });

  it("keeps fenced math source and preview borders visually continuous", () => {
    const fence = String.fromCharCode(96).repeat(3);
    const cases = [
      {
        name: "single line",
        source: [fence + "math", "x + 1", fence].join("\n"),
        selection: "x + 1",
        expectedContentClasses: [
          "cm-active-raw-content-first",
          "cm-active-raw-content-last",
        ],
      },
      {
        name: "multiple lines",
        source: [fence + "math", "x + 1", "y + 2", fence].join("\n"),
        selection: "y + 2",
        expectedContentClasses: ["cm-active-raw-content-last"],
      },
      {
        name: "empty",
        source: [fence + "math", fence].join("\n"),
        selection: fence,
        expectedContentClasses: ["cm-active-raw-empty-input"],
      },
    ];

    for (const current of cases) {
      const selection = current.name === "empty"
        ? current.source.lastIndexOf(current.selection)
        : current.source.indexOf(current.selection);
      const mathLines = getContinuousMarkdownLinePresentations(current.source, selection)
        .filter((line) => line.className.includes("cm-raw-block-math"));
      const activeContent = mathLines.find((line) => (
        current.expectedContentClasses.every((className) => line.className.includes(className))
      ));
      expect(activeContent?.className, current.name).toBeTruthy();
    }

    const connectedBottom = getCssRule(
      continuousEditorSource,
      ":deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-raw-block-last.cm-active-raw-block:not(.cm-active-raw-fence-hidden))",
    );
    expect(connectedBottom.selectors).toContain(
      ".cm-raw-block-math.cm-active-raw-content-last",
    );
    expect(connectedBottom.selectors).toContain(
      ".cm-raw-block-math.cm-active-raw-empty-input",
    );
    expect(connectedBottom.body).toMatch(/border-radius:\s*0;/);
    expect(connectedBottom.body).toMatch(/inset 1px 0 var\(--raw-block-border\)/);
    expect(connectedBottom.body).toMatch(/inset -1px 0 var\(--raw-block-border\)/);
    expect(connectedBottom.body).not.toMatch(/inset 0 -1px/);

    const connectedTop = getCssRule(
      continuousEditorSource,
      ":deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-active-raw-content-first.cm-active-raw-content-last)",
    );
    expect(connectedTop.selectors).toContain(
      ".cm-raw-block-math.cm-active-raw-empty-input",
    );
    expect(connectedTop.body).toMatch(/border-radius:\s*4px 4px 0 0;/);
    expect(connectedTop.body).toMatch(/inset 0 1px var\(--raw-block-border\)/);
    expect(connectedTop.body).not.toMatch(/inset 0 -1px/);

    const preview = getCssRule(
      continuousEditorSource,
      ":deep(.cm-active-math-preview)",
    ).body;
    expect(preview).toMatch(/border:\s*1px solid var\(--border\);/);
    expect(preview).toMatch(/border-top:\s*0;/);
    expect(preview).toMatch(/border-radius:\s*0 0 4px 4px;/);
    expect(preview).toMatch(/margin-top:\s*0;/);
    expect(preview).toMatch(/margin-bottom:\s*0;/);
  });

  it("renders a Typora tagged math fence as live and atomic MathJax previews", async () => {
    const source = "$$ {chapter 1}\nx = 1\n$$ {chapter end}\n\nAfter";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: createSettings(),
      },
    });
    await settleUi();

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const closing = source.indexOf("\n$$") + 1;
    await editor.selectRange(closing, closing, false);
    await settleUi();

    expect(wrapper.find(".cm-math-fence.cm-active-markdown-line").exists()).toBe(true);
    expect(wrapper.get(".md-mathjax-preview").html()).toContain('data-latex="x = 1"');
    expect(wrapper.get(".md-mathjax-preview").html()).not.toContain("chapter 1");
    expect(wrapper.get(".md-mathjax-preview").html()).not.toContain("chapter end");

    const after = source.indexOf("After");
    await editor.selectRange(after, after, false);
    await settleUi();
    expect(wrapper.find('.cm-special-preview-math mjx-container[jax="SVG"] svg').exists()).toBe(true);
    wrapper.unmount();
  });

  it("leaves math source visible without SVG when the math extension is disabled", async () => {
    const source = "$$\nx = 1\n$$";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: createSettings({
          extensions: {
            ...defaultEditorSettings.extensions,
            math: false,
          },
        }),
      },
    });
    await settleUi();

    expect(wrapper.find(".md-mathjax-preview").exists()).toBe(false);
    expect(wrapper.find(".cm-special-preview-math").exists()).toBe(false);
    expect(wrapper.text()).toContain("x = 1");
    wrapper.unmount();
  });
});

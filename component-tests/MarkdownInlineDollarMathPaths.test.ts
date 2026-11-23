import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const source = "金额 $5 and $10，紧凑金额 $5 and$10；公式 $x=\\$5$；代码 `$code$`；[链接](https://example.com/$route$)。";

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

describe("Typora 行内美元公式规则", () => {
  it("Preview、Rich 与 Continuous 均保留金额并渲染含转义美元的公式", async () => {
    const preview = mount(MarkdownPreview, {
      props: { source, outline: [], settings: defaultEditorSettings },
    });
    const rich = mount(RichMarkdownBlock, {
      props: {
        source,
        documentSource: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    const continuous = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    expect(preview.findAll(".math-inline")).toHaveLength(1);
    expect(rich.findAll(".math-inline")).toHaveLength(1);
    expect(continuous.findAll(".cm-rendered-inline-math")).toHaveLength(1);
    const renderedMath = [
      preview.get(".math-inline"),
      rich.get(".math-inline"),
      continuous.get(".cm-rendered-inline-math"),
    ];
    for (const math of renderedMath) {
      expect(math.find('mjx-container[jax="SVG"] svg').exists()).toBe(true);
      expect(math.find("mjx-break").exists()).toBe(false);
      expect(math.findAll('mjx-container[jax="SVG"] > svg')).toHaveLength(1);
      expect(math.html()).toContain('data-latex="x=\\$5"');
    }

    for (const wrapper of [preview, rich, continuous]) {
      expect(wrapper.text()).toContain("$5 and $10");
      expect(wrapper.text()).toContain("$5 and$10");
    }

    preview.unmount();
    rich.unmount();
    continuous.unmount();
  });

  it("在链接标签、普通方括号和软换行中保持一致渲染", async () => {
    const nestedSource = [
      "[链接 $x$](https://example.com)",
      "普通 [$y$]",
      "$a +",
      "b$",
    ].join("\n");
    const preview = mount(MarkdownPreview, {
      props: { source: nestedSource, outline: [], settings: defaultEditorSettings },
    });
    const rich = mount(RichMarkdownBlock, {
      props: {
        source: nestedSource,
        documentSource: nestedSource,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    const continuous = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: nestedSource,
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    expect(preview.findAll(".math-inline")).toHaveLength(3);
    expect(rich.findAll(".math-inline")).toHaveLength(3);
    expect(continuous.findAll(".cm-rendered-inline-math")).toHaveLength(3);
    const mathNodes = [
      ...preview.findAll(".math-inline"),
      ...rich.findAll(".math-inline"),
      ...continuous.findAll(".cm-rendered-inline-math"),
    ];
    for (const math of mathNodes) {
      expect(math.find('mjx-container[jax="SVG"] svg').exists()).toBe(true);
    }

    preview.unmount();
    rich.unmount();
    continuous.unmount();
  });

  it("引用与列表软换行不会把容器前缀送入公式", async () => {
    const containedSource = [
      "> $q +",
      "r$",
      "",
      "- $l +",
      "m$",
    ].join("\n");
    const preview = mount(MarkdownPreview, {
      props: { source: containedSource, outline: [], settings: defaultEditorSettings },
    });
    const rich = mount(RichMarkdownBlock, {
      props: {
        source: containedSource,
        documentSource: containedSource,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    const continuous = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: containedSource,
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    expect(preview.findAll(".math-inline")).toHaveLength(2);
    expect(rich.findAll(".math-inline")).toHaveLength(2);
    expect(continuous.findAll(".cm-rendered-inline-math")).toHaveLength(2);
    const html = [preview.html(), rich.html(), continuous.html()].join("\n");
    expect(html).toContain('data-latex="q +\nr"');
    expect(html).toContain('data-latex="l +\nm"');
    expect(html).not.toContain('data-latex="q +\n&gt; r"');
    preview.unmount();
    rich.unmount();
    continuous.unmount();
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

describe("ContinuousMarkdownEditor 标题分隔线位置", () => {
  it("覆盖普通、容器、块组件和 Setext 标题的底部间距语义", async () => {
    const cases = [
      {
        source: "# 普通一级标题\n\n正文",
        selector: ".cm-heading-1",
        expected: [],
      },
      {
        source: "## 表格前二级标题\n\n| 列 |\n| --- |\n| 值 |",
        selector: ".cm-heading-2",
        expected: ["cm-spacing-collapse-after"],
      },
      {
        source: "# 目录前一级标题\n\n[TOC]",
        selector: ".cm-heading-1",
        expected: ["cm-spacing-collapse-after"],
      },
      {
        source: "> # 引用一级标题",
        selector: ".cm-heading-1",
        expected: ["cm-blockquote-last"],
      },
      {
        source: "- # 列表一级标题",
        selector: ".cm-heading-1",
        expected: ["cm-bullet-list"],
      },
      {
        source: "Setext 第一行\nSetext 第二行\n---\n\n正文",
        selector: ".cm-setext-heading-last",
        expected: ["cm-heading-2", "cm-setext-heading-line"],
      },
    ];

    for (const current of cases) {
      const wrapper = mount(ContinuousMarkdownEditor, {
        attachTo: document.body,
        props: {
          modelValue: current.source,
          outline: [],
          readonly: true,
          settings: {
            ...defaultEditorSettings,
            extensions: { ...defaultEditorSettings.extensions },
          },
        },
      });
      await settleUi();

      const heading = wrapper.get(current.selector);
      for (const className of [
        "cm-spacing-collapse-after",
        "cm-blockquote-last",
        "cm-bullet-list",
        "cm-setext-heading-line",
      ]) {
        expect(
          heading.classes().includes(className),
          current.source + ": " + className,
        ).toBe(current.expected.includes(className));
      }
      expect(heading.classes()).not.toContain("cm-horizontal-rule");
      wrapper.unmount();
    }
  });

  it("keeps list heading rules safe at quote and table boundaries", async () => {
    const table = ["| Column |", "| --- |", "| Value |"].join("\n");
    const listCases = [
      { marker: "-", heading: "#", listClass: "cm-bullet-list" },
      { marker: "1.", heading: "##", listClass: "cm-ordered-list" },
    ];

    for (const current of listCases) {
      const cases = [
        {
          source: `${current.marker} ${current.heading} Plain list heading`,
          expectedEdgeClass: null,
        },
        {
          source: `> ${current.marker} ${current.heading} Quoted list heading`,
          expectedEdgeClass: "cm-blockquote-last",
        },
        {
          source: `${current.marker} ${current.heading} List heading before table\n\n${table}`,
          expectedEdgeClass: "cm-spacing-collapse-after",
        },
      ];

      for (const fixture of cases) {
        const wrapper = mount(ContinuousMarkdownEditor, {
          attachTo: document.body,
          props: {
            modelValue: fixture.source,
            outline: [],
            readonly: true,
            settings: {
              ...defaultEditorSettings,
              extensions: { ...defaultEditorSettings.extensions },
            },
          },
        });
        await settleUi();

        const heading = wrapper.get(".cm-heading");
        expect(heading.classes(), fixture.source).toContain(current.listClass);
        for (const edgeClass of ["cm-blockquote-last", "cm-spacing-collapse-after"]) {
          expect(heading.classes().includes(edgeClass), `${fixture.source}: ${edgeClass}`)
            .toBe(fixture.expectedEdgeClass === edgeClass);
        }
        expect(heading.classes()).not.toContain("cm-horizontal-rule");
        wrapper.unmount();
      }
    }
  });

  it("活动与非活动 H1、H2 保持同一分隔线类", async () => {
    const source = "# 一级标题\n\n## 二级标题\n\n正文";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        readonly: false,
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };

    await editor.selectRange(2, 2, false);
    await settleUi();
    expect(wrapper.get(".cm-heading-1").classes()).toContain("cm-active-markdown-line");
    expect(wrapper.get(".cm-heading-2").classes()).not.toContain("cm-active-markdown-line");

    const secondHeading = source.indexOf("二级标题");
    await editor.selectRange(secondHeading, secondHeading, false);
    await settleUi();
    expect(wrapper.get(".cm-heading-1").classes()).not.toContain("cm-active-markdown-line");
    expect(wrapper.get(".cm-heading-2").classes()).toContain("cm-active-markdown-line");
    wrapper.unmount();
  });

  it("激活嵌套列表引用标题时保持单行标题语义", async () => {
    const source = "- > ## 嵌套标题\n\n正文";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        readonly: false,
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };

    const headingStart = source.indexOf("嵌套标题");
    await editor.selectRange(headingStart, headingStart, false);
    await settleUi();

    const heading = wrapper.get(".cm-heading-2");
    expect(heading.classes()).toContain("cm-active-markdown-line");
    expect(heading.classes()).not.toContain("cm-horizontal-rule");
    expect(heading.text()).not.toContain(">");
    expect(heading.text()).not.toContain("#");
    expect(heading.find(".cm-rendered-bullet-marker").exists()).toBe(true);
    wrapper.unmount();
  });

  it("renders raw HTML H1 and H2 through the heading-safe preview path", async () => {
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: "<h1>Raw HTML H1</h1>\n\n<h2>Raw HTML H2</h2>",
        outline: [],
        readonly: true,
        settings: {
          ...defaultEditorSettings,
          extensions: {
            ...defaultEditorSettings.extensions,
            html: true,
          },
        },
      },
    });
    await settleUi();

    expect(wrapper.findAll(".cm-special-preview-html h1")).toHaveLength(1);
    expect(wrapper.findAll(".cm-special-preview-html h2")).toHaveLength(1);
    wrapper.unmount();
  });
});

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

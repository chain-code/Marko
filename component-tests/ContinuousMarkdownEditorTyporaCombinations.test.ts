import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const mountedEditors: Array<{ unmount: () => void }> = [];

function mountEditor(source: string, readonly = false) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly,
      settings: {
        ...defaultEditorSettings,
        extensions: { ...defaultEditorSettings.extensions },
      },
    },
  });
  mountedEditors.push(wrapper);
  return wrapper;
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function createRect(height: number): DOMRect {
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
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const compact = this.classList.contains("cm-line")
      || this.classList.contains("cm-special-preview")
      || this.classList.contains("cm-visual-table-widget");
    return createRect(compact ? 24 : 600);
  });
});

afterEach(() => {
  while (mountedEditors.length > 0) mountedEditors.pop()?.unmount();
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor Typora 正文组合语义", () => {
  it("同一文档中的非标准缩进和标准嵌套列表各自保持真实层级", async () => {
    const source = [
      "- 非标准一级",
      " * 非标准二级",
      "  * 非标准三级",
      "",
      "- 标准一级",
      "  * 标准二级",
      "    * 标准三级",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    const markers = wrapper.findAll<HTMLElement>(".cm-rendered-bullet-marker");
    expect(markers.map((marker) => marker.text())).toEqual([
      "•",
      "•",
      "•",
      "•",
      "◦",
      "▪",
    ]);
    expect(markers.map((marker) => marker.element.style.getPropertyValue("--list-marker-width")))
      .toEqual([
        "1.875rem",
        "1.875rem",
        "1.875rem",
        "1.875rem",
        "3.75rem",
        "5.625rem",
      ]);
    expect(wrapper.props("modelValue")).toBe(source);
  });

  it("混合有序和无序列表时分别计算整体缩进与圆点层级", async () => {
    const source = [
      "1. 有序根项",
      "   * 无序子项",
      "     * 无序孙项",
      "",
      "- 无序根项",
      "  1. 有序子项",
      "     * 无序孙项",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    const ordered = wrapper.findAll<HTMLElement>(".cm-rendered-ordered-marker");
    expect(ordered.map((marker) => marker.text())).toEqual(["1.", "1."]);
    expect(ordered.map((marker) => marker.element.style.getPropertyValue("--list-marker-width")))
      .toEqual(["1.875rem", "3.75rem"]);

    const bullets = wrapper.findAll<HTMLElement>(".cm-rendered-bullet-marker");
    expect(bullets.map((marker) => marker.text())).toEqual(["•", "◦", "•", "◦"]);
    expect(bullets.map((marker) => marker.element.style.getPropertyValue("--list-marker-width")))
      .toEqual(["3.75rem", "5.625rem", "1.875rem", "5.625rem"]);
  });

  it("标题、正文、引用、列表、表格、代码、数学和分隔线连续出现时互不污染", async () => {
    const source = [
      "# 标题",
      "",
      "正文 **加粗**",
      "",
      "> 引用",
      "",
      "- 列表",
      "",
      "| 列 | 值 |",
      "| --- | --- |",
      "| A | 1 |",
      "",
      "```ts",
      "const value = 1;",
      "```",
      "",
      "$$",
      "x^2",
      "$$",
      "",
      "---",
      "",
      "结尾正文",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    expect(wrapper.get(".cm-heading-1").text()).toBe("标题");
    expect(wrapper.get(".cm-rendered-strong").text()).toBe("加粗");
    expect(wrapper.get(".cm-blockquote").text()).toContain("引用");
    expect(wrapper.get(".cm-rendered-bullet-marker").text()).toBe("•");
    expect(wrapper.get(".cm-visual-table-widget").text()).toContain("A");
    expect(wrapper.get(".cm-special-preview-code").text()).toContain("const value = 1;");
    expect(wrapper.find(".cm-special-preview-math").exists()).toBe(true);
    expect(wrapper.get(".cm-horizontal-rule").text()).toBe("");

    const ending = wrapper.findAll(".cm-paragraph")
      .find((line) => line.text().includes("结尾正文"));
    expect(ending).toBeDefined();
    expect(ending?.classes()).not.toEqual(expect.arrayContaining([
      "cm-blockquote",
      "cm-code",
      "cm-math",
      "cm-table",
    ]));
    expect(wrapper.props("modelValue")).toBe(source);
  });

  it("进入代码块编辑时只展开当前块并保留相邻数学与表格预览", async () => {
    const source = [
      "```ts",
      "const value = 1;",
      "```",
      "",
      "$$",
      "x^2",
      "$$",
      "",
      "| 列 | 值 |",
      "| --- | --- |",
      "| A | 1 |",
      "",
      "光标",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };

    await editor.selectRange(source.length, source.length);
    await settleUi();
    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-math").exists()).toBe(true);
    expect(wrapper.find(".cm-visual-table-widget").exists()).toBe(true);

    await wrapper.get(".cm-special-preview-code").trigger("click");
    await settleUi();
    expect(wrapper.find(".cm-special-preview-code").exists()).toBe(false);
    expect(wrapper.text()).toContain("const value = 1;");
    expect(wrapper.find(".cm-special-preview-math").exists()).toBe(true);
    expect(wrapper.find(".cm-visual-table-widget").exists()).toBe(true);
    expect(wrapper.props("modelValue")).toBe(source);
  });
  it("标题内链接、删除线和行内代码保留各自语义", async () => {
    const source = "# [链接](https://example.com) ~~删除~~ `代码`";
    const wrapper = mountEditor(source, true);
    await settleUi();

    const heading = wrapper.get(".cm-heading-1");
    expect(heading.get(".cm-rendered-link").text()).toBe("链接");
    expect(heading.get(".cm-rendered-strikethrough").text()).toBe("删除");
    expect(heading.get(".cm-rendered-inline-code").text()).toBe("代码");
  });

  it("keeps only semantic links and strikethrough decorated inside formatted headings", async () => {
    const source = "# **Strong** *Emphasis* `Code` ~~Strike~~ [Link](https://example.com)";
    const wrapper = mountEditor(source, true);
    await settleUi();

    const heading = wrapper.get(".cm-heading-1");
    expect(heading.get(".cm-rendered-strong").text()).toBe("Strong");
    expect(heading.get(".cm-rendered-emphasis").text()).toBe("Emphasis");
    expect(heading.get(".cm-rendered-inline-code").text()).toBe("Code");
    expect(heading.get(".cm-rendered-strikethrough").text()).toBe("Strike");
    expect(heading.get(".cm-rendered-link").text()).toBe("Link");
    expect(heading.findAll(".cm-rendered-strikethrough")).toHaveLength(1);
    expect(heading.classes()).not.toContain("cm-horizontal-rule");

    wrapper.unmount();
  });

  it("引用和列表中的标题、空行与分隔线保留容器语义", async () => {
    const source = [
      "> # 引用标题",
      "> 上文",
      "> ***",
      ">",
      "> 下文",
      "",
      "- ***",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    expect(wrapper.find(".cm-heading-1.cm-blockquote-first").exists()).toBe(true);
    expect(wrapper.find(".cm-horizontal-rule.cm-blockquote").exists()).toBe(true);
    expect(wrapper.find(".cm-blockquote-gap").exists()).toBe(true);
    expect(wrapper.find(".cm-blockquote-last").exists()).toBe(true);
    expect(wrapper.find(".cm-list-thematic-break").exists()).toBe(true);
    expect(wrapper.find(".cm-rendered-list-thematic-break").exists()).toBe(true);
  });
});


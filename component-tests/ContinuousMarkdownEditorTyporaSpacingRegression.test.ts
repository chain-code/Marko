import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import { getEffectiveCssRule } from "../tests/helpers/cssRules";

const previewStyle = readScopedStyle("src/components/MarkdownPreview.vue");
const richStyle = readScopedStyle("src/components/RichMarkdownBlock.vue");
const continuousStyle = readScopedStyle("src/components/ContinuousMarkdownEditor.vue");
const tableStyle = readScopedStyle("src/components/VisualTableEditor.vue");
const pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

describe("ContinuousMarkdownEditor Typora 间距回归", () => {
  it("让三条路径的代码正文与行号使用相同行高", () => {
    const fixtures = [
      {
        style: previewStyle,
        pre: ".markdown-inner :deep(pre)",
        numbers: ".markdown-inner :deep(pre.code-with-line-numbers::before)",
      },
      {
        style: richStyle,
        pre: ".rich-markdown-block :deep(pre)",
        numbers: ".rich-markdown-block :deep(pre.code-with-line-numbers::before)",
      },
      {
        style: continuousStyle,
        pre: ":deep(.cm-special-preview pre)",
        numbers: ":deep(.cm-special-preview pre.code-with-line-numbers::before)",
      },
    ];

    for (const fixture of fixtures) {
      expect(rule(fixture.style, fixture.pre)).toMatch(/line-height:\s*1\.5;/);
      expect(rule(fixture.style, fixture.numbers)).toMatch(/line-height:\s*inherit;/);
    }
  });

  it("让文档首块列表使用正常块间距", async () => {
    const wrapper = mountEditor("- 首项");
    await settleUi();

    expect(wrapper.find(".cm-document-first-list").exists()).toBe(true);
    expect(rule(continuousStyle, ":deep(.cm-document-first-list)"))
      .toMatch(/margin-top:\s*0\.8em;/);
    wrapper.unmount();
  });

  it("让独占图片与链接图片保持居中和上下块间距", async () => {
    const fixtures = [
      `![独占图片](${pixel})`,
      `[![链接图片](${pixel})](https://example.com)`,
    ];

    for (const imageSource of fixtures) {
      const wrapper = mountEditor(["上文", "", imageSource, "", "下文"].join("\n"));
      await settleUi();

      expect(wrapper.find(".cm-special-preview-image").exists()).toBe(true);
      expect(wrapper.find(".cm-special-preview-image img").exists()).toBe(true);
      wrapper.unmount();
    }

    expect(rule(continuousStyle, ":deep(.cm-special-preview-image)"))
      .toMatch(/margin:\s*0\.8em 0;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview-image img)"))
      .toMatch(/display:\s*block;[\s\S]*margin:\s*auto;/);
  });

  it("keeps only the quoted blank line spacing before a quoted list", async () => {
    const wrapper = mountEditor([
      "> quoted text",
      ">",
      "> - item",
    ].join("\n"));
    await settleUi();

    expect(wrapper.find(".cm-blockquote-gap").exists()).toBe(true);
    expect(wrapper.get(".cm-bullet-list").classes())
      .not.toContain("cm-list-block-margin-before");
    expect(rule(continuousStyle, ":deep(.cm-blockquote-gap:not(.cm-active-markdown-line))"))
      .toMatch(/height:\s*0\.8em;/);
    wrapper.unmount();
  });

  it("collapses quoted blank spacing before block widgets that own spacing", async () => {
    const fixtures = [
      {
        source: [
          "> quoted text",
          ">",
          "> | Column |",
          "> | --- |",
          "> | Value |",
        ].join("\n"),
        widgetClass: "cm-visual-table-widget",
        selector: ":deep(.cm-line.cm-spacing-collapsed-gap:not(.cm-active-markdown-line))",
        spacingStyle: tableStyle,
        spacingSelector: ".visual-table-editor",
        spacingPattern: /padding:\s*1\.2em 0;/,
      },
      {
        source: [
          "> quoted text",
          ">",
          "> ```text",
          "> code",
          "> ```",
        ].join("\n"),
        widgetClass: "cm-special-preview-code",
        selector: ":deep(.cm-line.cm-spacing-collapsed-gap:not(.cm-active-markdown-line))",
        spacingStyle: continuousStyle,
        spacingSelector: ":deep(.cm-special-preview-code)",
        spacingPattern: /padding-top:\s*15px;/,
      },
      {
        source: [
          "> quoted text",
          ">",
          "> $$",
          "> x + y",
          "> $$",
        ].join("\n"),
        widgetClass: "cm-special-preview-math",
        selector: ":deep(.cm-line.cm-spacing-collapsed-gap:not(.cm-active-markdown-line))",
        spacingStyle: continuousStyle,
        spacingSelector: ":deep(.cm-special-preview .math-block)",
        spacingPattern: /margin:\s*16px 0;/,
      },
    ];

    for (const fixture of fixtures) {
      const wrapper = mountEditor(fixture.source);
      await settleUi();

      const gap = wrapper.get<HTMLElement>(".cm-blockquote-gap");
      expect(gap.element.nextElementSibling?.classList.contains(fixture.widgetClass), fixture.widgetClass)
        .toBe(true);
      expect(rule(continuousStyle, fixture.selector)).toMatch(/height:\s*0;/);
      expect(rule(fixture.spacingStyle, fixture.spacingSelector)).toMatch(fixture.spacingPattern);
      wrapper.unmount();
    }
  });
});

function mountEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly: true,
      settings: {
        ...defaultEditorSettings,
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

function readScopedStyle(path: string): string {
  const source = readFileSync(resolve(path), "utf8");
  const match = source.match(/<style scoped>([\s\S]*?)<\/style>/);
  expect(match, `${path} 应包含 scoped 样式`).not.toBeNull();
  return match?.[1] ?? "";
}

function rule(source: string, selector: string): string {
  return getEffectiveCssRule(source, selector);
}

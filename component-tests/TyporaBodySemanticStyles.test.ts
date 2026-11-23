import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import {
  getEffectiveCssRule,
  getEffectiveMediaCssRule,
} from "../tests/helpers/cssRules";

const previewStyle = readScopedStyle("src/components/MarkdownPreview.vue");
const richStyle = readScopedStyle("src/components/RichMarkdownBlock.vue");
const continuousStyle = readScopedStyle("src/components/ContinuousMarkdownEditor.vue");
const tableCellStyle = readScopedStyle("src/components/TableCellInlineEditor.vue");

describe("Typora 正文语义样式", () => {
  it("为 Continuous 原始 HTML 提供完整块级和行内排版", async () => {
    const source = [
      '正文 <a class="inline-anchor" href="https://example.com">链接</a>、<code class="inline-code">代码</code>、<img class="inline-widget-image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">。',
      "",
      '<section class="html-style-fixture">',
      '  <p class="mixed-image-paragraph">前文<img class="mixed-image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">后文</p>',
      '  <p class="standalone-image-paragraph"><img class="standalone-image" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="></p>',
      "  <hr>",
      "  <dl><dt>术语</dt><dd>定义</dd></dl>",
      "  <video controls></video>",
      '  <audio controls></audio>',
      '  <iframe title="样式测试"></iframe>',
      "</section>",
    ].join("\n");
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        readonly: true,
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    expect(wrapper.find(".cm-rendered-inline-html .inline-anchor").exists()).toBe(true);
    expect(wrapper.find(".cm-rendered-inline-html .inline-code").exists()).toBe(true);
    expect(wrapper.find(".cm-rendered-inline-html .inline-widget-image").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-html .mixed-image").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-html .standalone-image").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-html hr").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-html dd").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-html video").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-html audio").exists()).toBe(true);
    expect(wrapper.find(".cm-special-preview-html iframe").exists()).toBe(true);
    wrapper.unmount();

    expect(rule(continuousStyle, ":deep(.cm-rendered-inline-html a)")).toMatch(/text-decoration:\s*underline;/);
    expect(rule(continuousStyle, ":deep(.cm-rendered-inline-html code)")).toMatch(/background:\s*#f3f4f4;/);
    expect(rule(continuousStyle, ":deep(.cm-rendered-inline-html img)")).toMatch(/display:\s*inline-block;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview img)")).toMatch(/display:\s*inline-block;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview-html p > img:only-child)")).toMatch(/display:\s*block;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview-html hr)")).toMatch(/height:\s*2px;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview-html dd)")).toMatch(/margin-inline-start:\s*40px;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview-html video)")).toMatch(/display:\s*block;[\s\S]*max-width:\s*100%;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview-html audio)")).toMatch(/max-width:\s*100%;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview-html iframe)")).toMatch(/width:\s*100%;[\s\S]*border:\s*0;/);
  });

  it("统一三条路径的 TOC 链接、一级字重和窄屏缩进", () => {
    const fixtures = [
      {
        style: previewStyle,
        link: ".markdown-inner :deep(.toc-inline a)",
        levelOne: ".markdown-inner :deep(.toc-inline-item.lv-1)",
        levelThree: ".markdown-inner :deep(.toc-inline-item.lv-3)",
      },
      {
        style: richStyle,
        link: ".rich-markdown-block :deep(.toc-inline a)",
        levelOne: ".rich-markdown-block :deep(.toc-inline-item.lv-1)",
        levelThree: ".rich-markdown-block :deep(.toc-inline-item.lv-3)",
      },
      {
        style: continuousStyle,
        link: ":deep(.cm-special-preview .toc-inline a)",
        levelOne: ":deep(.cm-special-preview .toc-inline-item.lv-1)",
        levelThree: ":deep(.cm-special-preview .toc-inline-item.lv-3)",
      },
    ];

    for (const fixture of fixtures) {
      expect(rule(fixture.style, fixture.link)).toMatch(/text-decoration:\s*none;/);
      expect(rule(fixture.style, fixture.levelOne)).toMatch(/font-weight:\s*700;/);
      expect(fixture.style).toContain("@media screen and (max-width: 48em)");
      expect(mediaRule(fixture.style, fixture.levelThree)).toMatch(/padding-left:\s*3\.5em;/);
    }
  });

  it("统一三条路径的脚注引用胶囊与左右间距", () => {
    const fixtures = [
      { style: previewStyle, selector: ".markdown-inner :deep(.footnote-ref)" },
      { style: richStyle, selector: ".rich-markdown-block :deep(.footnote-ref)" },
      { style: continuousStyle, selector: ":deep(.cm-rendered-footnote-reference)" },
    ];

    for (const fixture of fixtures) {
      const footnote = rule(fixture.style, fixture.selector);
      expect(footnote).toMatch(/background:\s*rgba\(238, 238, 238, 0\.7\);/);
      expect(footnote).toMatch(/margin-inline:\s*0;/);
      expect(footnote).toMatch(/padding:\s*2px 4px;/);
    }
  });

  it("统一正文各路径和表格单元格的选区，并让绘制光标继承正文颜色", () => {
    const selectionFixtures = [
      { style: previewStyle, selector: ".markdown-inner::selection" },
      { style: richStyle, selector: ".rich-markdown-block::selection" },
      { style: continuousStyle, selector: ":deep(.cm-selectionBackground)" },
      {
        style: tableCellStyle,
        selector: ".table-cell-inline-editor :deep(.cm-selectionBackground)",
      },
    ];

    for (const fixture of selectionFixtures) {
      const selection = rule(fixture.style, fixture.selector);
      expect(selection).toMatch(/background:\s*#dae3ea(?:\s*!important)?;/);
      expect(selection).toMatch(/color:\s*inherit(?:\s*!important)?;/);
    }

    expect(rule(continuousStyle, ":deep(.cm-cursor)"))
      .toMatch(/border-left-color:\s*var\(--markdown-text\);/);
    expect(rule(tableCellStyle, ".table-cell-inline-editor :deep(.cm-cursor)"))
      .toMatch(/border-left-color:\s*var\(--markdown-text, #333333\);/);
  });

  it("keeps alert icons inline across all rendered paths", () => {
    const fixtures = [
      { style: previewStyle, selector: ".markdown-inner :deep(.md-alert-title .md-alert-icon)" },
      { style: richStyle, selector: ".rich-markdown-block :deep(.md-alert-title .md-alert-icon)" },
      { style: continuousStyle, selector: ":deep(.cm-special-preview .md-alert-title .md-alert-icon)" },
    ];

    for (const fixture of fixtures) {
      expect(rule(fixture.style, fixture.selector)).toMatch(/display:\s*inline-block;/);
    }
  });

  it("恢复 Preview 和 Rich 的表格、Front Matter 与引用边缘布局", () => {
    const fixtures = [
      {
        style: previewStyle,
        table: ".markdown-inner :deep(table)",
        figure: ".markdown-inner :deep(figure.table-figure)",
        frontmatter: ".markdown-inner :deep(.frontmatter-block)",
        quoteFirst: ".markdown-inner :deep(blockquote > :first-child)",
        quoteLast: ".markdown-inner :deep(blockquote > :last-child)",
      },
      {
        style: richStyle,
        table: ".rich-markdown-block :deep(table)",
        figure: ".rich-markdown-block :deep(figure.table-figure)",
        frontmatter: ".rich-markdown-block :deep(.frontmatter-block)",
        quoteFirst: ".rich-markdown-block :deep(blockquote > :first-child)",
        quoteLast: ".rich-markdown-block :deep(blockquote > :last-child)",
      },
    ];

    for (const fixture of fixtures) {
      expect(rule(fixture.style, fixture.table)).toMatch(/width:\s*100%;/);
      expect(rule(fixture.style, fixture.figure)).toMatch(/overflow-x:\s*auto;/);
      const frontmatter = rule(fixture.style, fixture.frontmatter);
      expect(frontmatter).toMatch(/overflow-x:\s*hidden;/);
      expect(frontmatter).toMatch(/white-space:\s*pre-wrap;/);
      expect(rule(fixture.style, fixture.quoteFirst)).toMatch(/margin-top:\s*0;/);
      expect(rule(fixture.style, fixture.quoteLast)).toMatch(/margin-bottom:\s*0;/);
    }
  });

  it("关闭代码换行时只让 Continuous 代码源码行保持单行", async () => {
    const sourceRule = rule(
      continuousStyle,
      ".continuous-editor:not(.wrap-code-blocks) :deep(.cm-code)",
    );
    expect(sourceRule).toMatch(/overflow-wrap:\s*normal;/);
    expect(sourceRule).toMatch(/white-space:\s*pre;/);
    expect(sourceRule).toMatch(/word-break:\s*normal;/);
    expect(continuousStyle).not.toMatch(
      /\.continuous-editor:not\(\.wrap-code-blocks\)\s+:deep\(\.cm-line\)\s*\{/,
    );

    const source = "```text\nconst veryLongValue = '保持源码单行';\n```\n\n普通正文继续自动换行";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: { ...defaultEditorSettings, codeWrap: false },
      },
    });
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const codeOffset = source.indexOf("veryLongValue");
    await editor.selectRange(codeOffset, codeOffset);
    await settleUi();

    expect(wrapper.get(".continuous-editor").classes("wrap-code-blocks")).toBe(false);
    expect(wrapper.find(".cm-code").exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Typora cross-path layout', () => {
  it('keeps generic figures, raw pre wrapping and block margins aligned', () => {
    const fixtures = [
      {
        style: previewStyle,
        figure: '.markdown-inner :deep(figure:not(.table-figure))',
        wrappedPre: '.markdown-inner.wrap-code-blocks :deep(pre)',
      },
      {
        style: richStyle,
        figure: '.rich-markdown-block :deep(figure:not(.table-figure))',
        wrappedPre: '.rich-markdown-block.wrap-code-blocks :deep(pre)',
      },
      {
        style: continuousStyle,
        figure: ':deep(.cm-special-preview figure:not(.table-figure))',
        wrappedPre: '.wrap-code-blocks :deep(.cm-special-preview pre)',
      },
    ];

    for (const fixture of fixtures) {
      const figure = rule(fixture.style, fixture.figure);
      expect(figure).toMatch(/overflow-x:\s*auto;/);
      expect(figure).toMatch(/max-width:\s*calc\(100% \+ 16px\);/);

      const wrappedPre = rule(fixture.style, fixture.wrappedPre);
      expect(wrappedPre).toMatch(/overflow-wrap:\s*anywhere;/);
      expect(wrappedPre).toMatch(/white-space:\s*pre-wrap;/);
    }

    expect(rule(previewStyle, ".markdown-inner :deep(figure:not(.table-figure))"))
      .toMatch(/margin:\s*1\.2em 0;/);
    expect(rule(richStyle, ".rich-markdown-block :deep(figure:not(.table-figure))"))
      .toMatch(/margin:\s*1\.2em 0;/);
    expect(rule(continuousStyle, ":deep(.cm-special-preview figure:not(.table-figure))"))
      .toMatch(/margin:\s*1\.2em 0;/);

    expect(continuousStyle).not.toContain(
      ':deep(.cm-special-preview:not(.cm-special-preview-code):not(.cm-special-preview-html) > :first-child)',
    );
    expect(continuousStyle).not.toContain(
      ':deep(.cm-special-preview:not(.cm-special-preview-code):not(.cm-special-preview-html) > :last-child)',
    );
    expect(rule(continuousStyle, ':deep(.cm-special-preview pre)')).toMatch(/margin:\s*0;/);
    const continuousCodePreview = rule(continuousStyle, ':deep(.cm-special-preview-code)');
    expect(continuousCodePreview).toMatch(/padding-top:\s*15px;/);
    expect(continuousCodePreview).toMatch(/padding-bottom:\s*15px;/);
    expect(rule(continuousStyle, ':deep(.cm-special-preview-html)'))
      .toMatch(/display:\s*flow-root;/);
    expect(rule(continuousStyle, ':deep(.cm-special-preview-html pre)'))
      .toMatch(/margin:\s*15px 0;/);
    expect(continuousStyle).toMatch(
      /:deep\(\.cm-special-preview-html p\),[\s\S]{0,180}margin:\s*0\.8em 0;/,
    );
  });

  it('keeps raw media inside the reading column across rendered paths', () => {
    const fixtures = [
      {
        style: previewStyle,
        video: '.markdown-inner :deep(video)',
        audio: '.markdown-inner :deep(audio)',
        iframe: '.markdown-inner :deep(iframe)',
      },
      {
        style: richStyle,
        video: '.rich-markdown-block :deep(video)',
        audio: '.rich-markdown-block :deep(audio)',
        iframe: '.rich-markdown-block :deep(iframe)',
      },
      {
        style: continuousStyle,
        video: ':deep(.cm-special-preview-html video)',
        audio: ':deep(.cm-special-preview-html audio)',
        iframe: ':deep(.cm-special-preview-html iframe)',
      },
    ];

    for (const fixture of fixtures) {
      expect(rule(fixture.style, fixture.video)).toMatch(/display:\s*block;[\s\S]*max-width:\s*100%;/);
      expect(rule(fixture.style, fixture.audio)).toMatch(/max-width:\s*100%;/);
      expect(rule(fixture.style, fixture.iframe)).toMatch(/width:\s*100%;[\s\S]*border:\s*0;/);
    }
  });

  it('uses the same half-em paragraph spacing inside list items', () => {
    expect(rule(previewStyle, '.markdown-inner :deep(li > p)')).toMatch(/margin:\s*0\.5rem 0;/);
    expect(rule(richStyle, '.rich-markdown-block :deep(li > p)')).toMatch(/margin:\s*0\.5rem 0;/);
    expect(rule(continuousStyle, ':deep(.cm-special-preview-html li > p)')).toMatch(/margin:\s*0\.5rem 0;/);
  });

  it('positions rendered task checkboxes like Typora', () => {
    const fixtures = [
      { style: previewStyle, root: '.markdown-inner' },
      { style: richStyle, root: '.rich-markdown-block' },
    ];

    for (const fixture of fixtures) {
      expect(rule(fixture.style, fixture.root + ' :deep(li)'))
        .toMatch(/position:\s*relative;/);
      const checkbox = rule(
        fixture.style,
        fixture.root + ' :deep(.task-list-item-checkbox)',
      );
      expect(checkbox).toMatch(/position:\s*absolute;/);
      expect(checkbox).toMatch(/top:\s*0;/);
      expect(checkbox).toMatch(/left:\s*0;/);
      expect(checkbox).toMatch(/width:\s*auto;/);
      expect(checkbox).toMatch(/height:\s*auto;/);
      expect(checkbox).toMatch(/margin-left:\s*-1\.3em;/);
      expect(checkbox).toMatch(/margin-top:\s*calc\(1em - 10px\);/);
      expect(checkbox).toMatch(/border:\s*none;/);
      expect(checkbox).toMatch(/cursor:\s*pointer;/);
    }
  });

  it("preserves multiline headings and compacts nested rendered blocks", () => {
    const fixtures = [
      { style: previewStyle, root: ".markdown-inner" },
      { style: richStyle, root: ".rich-markdown-block" },
    ];

    for (const fixture of fixtures) {
      expect(rule(fixture.style, fixture.root + " :deep(h1)")).toMatch(/white-space:\s*pre-wrap;/);
      expect(rule(fixture.style, fixture.root + " :deep(blockquote blockquote)"))
        .toMatch(/padding-right:\s*0;/);
      expect(rule(fixture.style, fixture.root + " :deep(li > :first-child)"))
        .toMatch(/margin-top:\s*0;/);
    }
  });
});

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

function mediaRule(source: string, selector: string): string {
  return getEffectiveMediaCssRule(
    source,
    "screen and (max-width: 48em)",
    selector,
  );
}

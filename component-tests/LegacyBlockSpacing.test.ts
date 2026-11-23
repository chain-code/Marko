import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shallowMount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import BlockEditor from "@/components/BlockEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const blockEditorStyle = readScopedStyle("src/components/BlockEditor.vue");
const previewStyle = readScopedStyle("src/components/MarkdownPreview.vue");
const richStyle = readScopedStyle("src/components/RichMarkdownBlock.vue");
const tableStyle = readScopedStyle("src/components/VisualTableEditor.vue");

describe("legacy block editor spacing", () => {
  it("applies Typora-like spacing at the outer block boundary", async () => {
    const source = [
      "# Heading",
      "",
      "Paragraph",
      "",
      "- List",
      "",
      "> Quote",
      "",
      "| Value |",
      "| --- |",
      "| Value |",
      "",
      "```text",
      "code",
      "```",
    ].join("\n");
    const wrapper = shallowMount(BlockEditor, {
      props: {
        modelValue: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });

    const blocks = wrapper.findAll(".editor-block");
    expect(blocks.map((block) => block.classes().find((name) => name.startsWith("block-"))))
      .toEqual([
        "block-heading",
        "block-paragraph",
        "block-list",
        "block-quote",
        "block-table",
        "block-code",
      ]);
    expect(blocks[0]?.classes()).toContain("is-document-first");
    expect(blocks.at(-1)?.classes()).toContain("is-document-last");
    expect(blocks.slice(1, -1).every((block) => (
      !block.classes().includes("is-document-first")
      && !block.classes().includes("is-document-last")
    ))).toBe(true);

    const richBlocks = wrapper.findAllComponents(RichMarkdownBlock);
    const previewBlocks = wrapper.findAllComponents(MarkdownPreview);
    expect(richBlocks.length).toBeGreaterThan(0);
    expect(previewBlocks.length).toBeGreaterThan(0);
    expect(richBlocks.every((block) => block.props("embeddedBlock"))).toBe(true);
    expect(previewBlocks.every((block) => block.props("embeddedBlock"))).toBe(true);

    const codeBlock = wrapper.get(".block-code");
    expect(codeBlock.find(".block-source").exists()).toBe(false);
    await codeBlock.trigger("click");
    await nextTick();
    expect(codeBlock.classes()).toContain("active");
    expect(codeBlock.classes()).toContain("block-code");
    expect(codeBlock.classes()).toContain("is-document-last");
    expect(codeBlock.find("textarea.block-source").exists()).toBe(true);
    wrapper.unmount();

    expect(rule(blockEditorStyle, ".editor-block")).toMatch(
      /--editor-block-margin:\s*0\.8em;[\s\S]*margin:\s*var\(--editor-block-margin\) auto;/,
    );
    expect(rule(blockEditorStyle, ".editor-block.block-heading"))
      .toMatch(/--editor-block-margin:\s*1rem;/);
    expect(rule(blockEditorStyle, ".editor-block.block-code"))
      .toMatch(/--editor-block-margin:\s*15px;/);
    expect(rule(blockEditorStyle, ".editor-block.block-math"))
      .toMatch(/--editor-block-margin:\s*16px;/);
    expect(rule(blockEditorStyle, ".editor-block.is-document-first"))
      .toMatch(/margin-top:\s*0;/);
    expect(rule(blockEditorStyle, ".editor-block.is-document-last"))
      .toMatch(/margin-bottom:\s*0;/);
  });

  it("lets the outer block own spacing without duplicate child padding", () => {
    for (const fixture of [
      {
        style: previewStyle,
        root: ".markdown-inner",
        embedded: ".markdown-inner.is-block-editor-child",
        first: ".markdown-inner.is-block-editor-child :deep(> :first-child)",
        last: ".markdown-inner.is-block-editor-child :deep(> :last-child)",
      },
      {
        style: richStyle,
        root: ".rich-markdown-block",
        embedded: ".rich-markdown-block.is-block-editor-child",
        first: ".rich-markdown-block.is-block-editor-child :deep(> :first-child)",
        last: ".rich-markdown-block.is-block-editor-child :deep(> :last-child)",
      },
    ]) {
      expect(rule(fixture.style, fixture.root)).toMatch(/padding:\s*30px 30px 100px;/);
      expect(rule(fixture.style, fixture.embedded)).toMatch(/padding:\s*0;/);
      expect(rule(fixture.style, fixture.first)).toMatch(/margin-top:\s*0;/);
      expect(rule(fixture.style, fixture.last)).toMatch(/margin-bottom:\s*0;/);
    }

    expect(rule(blockEditorStyle, ".editor-block.block-table :deep(.visual-table-editor)"))
      .toMatch(/padding-block:\s*0;/);
    expect(rule(tableStyle, ".visual-table-editor")).toMatch(
      /margin:\s*0;[\s\S]*padding:\s*1\.2em 0;/,
    );
  });

  it("keeps source inputs aligned with their rendered block content", () => {
    expect(rule(blockEditorStyle, ".block-source"))
      .toMatch(/padding:\s*0\.2rem 0\.5rem;/);
    expect(blockEditorStyle).toMatch(
      /\.block-source\s*\{\s*min-height:\s*1\.7em;\s*padding-block:\s*0;/,
    );

    const renderedCell = rule(tableStyle, ".cell-rendered");
    const editableCell = rule(tableStyle, "textarea");
    expect(renderedCell).toMatch(/min-height:\s*1\.6em;[\s\S]*padding:\s*0;/);
    expect(editableCell).toMatch(
      /min-height:\s*1\.6em;[\s\S]*line-height:\s*inherit;[\s\S]*padding:\s*0;/,
    );
    expect(rule(tableStyle, "th")).toMatch(/padding:\s*6px 13px;/);
    expect(rule(tableStyle, "td")).toMatch(/padding:\s*6px 13px;/);
  });

  it("keeps standalone preview and rich editor container padding", async () => {
    const preview = shallowMount(MarkdownPreview, {
      props: {
        source: "Paragraph",
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    expect(preview.get(".markdown-inner").classes()).not.toContain("is-block-editor-child");
    await preview.setProps({ embeddedBlock: true });
    expect(preview.get(".markdown-inner").classes()).toContain("is-block-editor-child");
    preview.unmount();

    const rich = shallowMount(RichMarkdownBlock, {
      props: {
        source: "Paragraph",
        documentSource: "Paragraph",
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    expect(rich.get(".rich-markdown-block").classes()).not.toContain("is-block-editor-child");
    await rich.setProps({ embeddedBlock: true });
    expect(rich.get(".rich-markdown-block").classes()).toContain("is-block-editor-child");
    rich.unmount();
  });
});

function readScopedStyle(path: string): string {
  const source = readFileSync(resolve(path), "utf8");
  const match = source.match(/<style scoped>([\s\S]*?)<\/style>/);
  expect(match, path + " is missing a scoped style block").not.toBeNull();
  return match?.[1] ?? "";
}

function rule(source: string, selector: string): string {
  const matches = source.matchAll(/([^{}]+)\{([^{}]*)\}/g);
  for (const match of matches) {
    const selectors = (match[1] ?? "").split(",").map((item) => item.trim());
    if (selectors.includes(selector)) return match[2] ?? "";
  }
  throw new Error("Missing CSS rule: " + selector);
}

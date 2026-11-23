import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import { getEffectiveCssRule } from "../tests/helpers/cssRules";

const source = "1. [ ] 待处理\n2. [x] 已完成";
const settings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

const renderingPaths = [
  {
    name: "MarkdownPreview",
    mountComponent: () => mount(MarkdownPreview, {
      attachTo: document.body,
      props: {
        source,
        outline: [],
        settings,
      },
    }),
  },
  {
    name: "RichMarkdownBlock",
    mountComponent: () => mount(RichMarkdownBlock, {
      attachTo: document.body,
      props: {
        source,
        documentSource: source,
        outline: [],
        settings,
      },
    }),
  },
];

describe("有序任务列表渲染", () => {
  it.each(renderingPaths)("$name 保留任务复选框并使用任务项结构", async ({ mountComponent }) => {
    const wrapper = mountComponent();
    try {
      await nextTick();

      const orderedList = wrapper.get("ol.contains-task-list");
      const tasks = orderedList.findAll("li.task-list-item");
      const checkboxes = orderedList.findAll<HTMLInputElement>("input.task-list-item-checkbox");

      expect(tasks).toHaveLength(2);
      expect(checkboxes).toHaveLength(2);
      expect(checkboxes[0]?.element.checked).toBe(false);
      expect(checkboxes[1]?.element.checked).toBe(true);
      expect(tasks[0]?.text()).toContain("待处理");
      expect(tasks[1]?.text()).toContain("已完成");
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    { name: "MarkdownPreview", path: "src/components/MarkdownPreview.vue", root: ".markdown-inner" },
    { name: "RichMarkdownBlock", path: "src/components/RichMarkdownBlock.vue", root: ".rich-markdown-block" },
  ])("$name 隐藏有序任务序号并保持复选框独立定位", ({ path, root }) => {
    const style = readScopedStyle(path);
    expect(getEffectiveCssRule(style, root + " :deep(ol > .task-list-item)"))
      .toMatch(/list-style:\s*none;/);

    const checkbox = getEffectiveCssRule(style, root + " :deep(.task-list-item-checkbox)");
    expect(checkbox).toMatch(/position:\s*absolute;/);
    expect(checkbox).toMatch(/left:\s*0;/);
    expect(checkbox).toMatch(/margin-left:\s*-1\.3em;/);
  });
});

function readScopedStyle(path: string): string {
  const sourceText = readFileSync(resolve(path), "utf8");
  const match = sourceText.match(/<style scoped>([\s\S]*?)<\/style>/);
  expect(match, path + " 应包含 scoped 样式").not.toBeNull();
  return match?.[1] ?? "";
}

import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { getContinuousPreviewBlocks } from "@/utils/continuousEditor";
import { defaultEditorSettings } from "@/utils/editorSettings";
import { userComplexMermaidSource } from "./mermaidFixtures";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, _source: string) => ({
    svg: '<svg width="960" height="480" viewBox="0 0 960 480"><path d="M0 0h960v480H0z" /></svg>',
    bindFunctions: vi.fn(),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

async function settleDiagrams() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await flushPromises();
  await nextTick();
}

afterEach(() => {
  document.querySelectorAll(".diagram-viewer-overlay").forEach((element) => element.remove());
  document.body.classList.remove("diagram-viewer-open");
  mermaidMock.render.mockClear();
});

describe("ContinuousMarkdownEditor 图表挂载生命周期", () => {
  it("从源码模式返回后自动渲染复杂 Mermaid 并支持双击大图", async () => {
    const source = [
      "前言", "", "```mermaid", userComplexMermaidSource, "```", "", "后言",
    ].join("\n");
    const sourceSettings = {
      ...defaultEditorSettings,
      sourceMode: true,
      extensions: { ...defaultEditorSettings.extensions, mermaid: true },
    };
    expect(getContinuousPreviewBlocks(source).some((block) => block.kind === "diagram")).toBe(true);
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: { modelValue: source, outline: [], settings: sourceSettings },
    });
    await settleDiagrams();
    expect(wrapper.find(".cm-special-preview-diagram").exists()).toBe(false);

    const previewSettings = { ...sourceSettings, sourceMode: false };
    await wrapper.setProps({ settings: previewSettings });
    await settleDiagrams();

    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number } | null;
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    expect(editor.getViewState()).toMatchObject({ anchor: 0, head: 0 });
    expect(wrapper.get(".continuous-editor").classes()).not.toContain("is-source");
    await editor.selectRange(source.length, source.length, false);
    await settleDiagrams();
    expect({
      diagram: wrapper.find(".cm-special-preview-diagram").exists(),
      code: wrapper.find(".cm-special-preview-code").exists(),
    }).toEqual({ diagram: true, code: false });
    expect(wrapper.find(".cm-special-preview-diagram .mermaid").exists()).toBe(true);
    await vi.waitFor(() => {
      expect(wrapper.find(".cm-special-preview-diagram .mermaid svg").exists()).toBe(true);
    }, { timeout: 1000 });
    expect(wrapper.get(".cm-special-preview-diagram .mermaid").attributes("data-rendered")).toBe("true");
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    expect(mermaidMock.render.mock.calls[0]?.[1]).toBe(userComplexMermaidSource + "\n");

    vi.useFakeTimers();
    try {
      const liveDiagram = () => wrapper.get(".cm-special-preview-diagram .mermaid svg");
      await liveDiagram().trigger("mousedown", { button: 0, buttons: 1, detail: 1 });
      await liveDiagram().trigger("mouseup", { button: 0, buttons: 0, detail: 1 });
      await liveDiagram().trigger("click", { button: 0, buttons: 0, detail: 1 });
      expect(wrapper.get(".cm-special-preview-diagram .diagram-box").classes())
        .toContain("show-source");

      await liveDiagram().trigger("mousedown", { button: 0, buttons: 1, detail: 2 });
      await liveDiagram().trigger("mouseup", { button: 0, buttons: 0, detail: 2 });
      await liveDiagram().trigger("click", { button: 0, buttons: 0, detail: 2 });
      await liveDiagram().trigger("dblclick", { button: 0, buttons: 0, detail: 2 });
      await nextTick();

      expect(document.body.querySelector(".diagram-viewer-overlay")).not.toBeNull();
      expect(document.body.querySelector(".diagram-viewer-content svg")).not.toBeNull();
      vi.advanceTimersByTime(250);
      await nextTick();
      expect(wrapper.get(".cm-special-preview-diagram .diagram-box").classes())
        .not.toContain("show-source");
      const overlay = document.body.querySelector<HTMLElement>(".diagram-viewer-overlay");
      const viewerContent = overlay?.querySelector<HTMLElement>(".diagram-viewer-content");
      expect(overlay).not.toBeNull();
      expect(viewerContent?.querySelector("svg")).not.toBeNull();
      expect(viewerContent?.style.width).toBe("960px");
      expect(viewerContent?.style.height).toBe("480px");

      const zoomIn = overlay?.querySelector<HTMLButtonElement>('button[aria-label="放大大图"]');
      const zoomOut = overlay?.querySelector<HTMLButtonElement>('button[aria-label="缩小大图"]');
      const reset = overlay?.querySelector<HTMLButtonElement>('button[aria-label="重置大图大小"]');
      const close = overlay?.querySelector<HTMLButtonElement>('button[aria-label="关闭大图"]');
      expect([zoomIn, zoomOut, reset, close].every(Boolean)).toBe(true);

      zoomIn?.click();
      await nextTick();
      expect(viewerContent?.style.width).toBe("1152px");
      expect(viewerContent?.style.height).toBe("576px");

      reset?.click();
      await nextTick();
      expect(viewerContent?.style.width).toBe("960px");
      expect(viewerContent?.style.height).toBe("480px");

      zoomOut?.click();
      await nextTick();
      expect(viewerContent?.style.width).toBe("768px");
      expect(viewerContent?.style.height).toBe("384px");

      reset?.click();
      await nextTick();
      expect(viewerContent?.style.width).toBe("960px");
      expect(viewerContent?.style.height).toBe("480px");

      close?.click();
      await nextTick();
      expect(document.body.querySelector(".diagram-viewer-overlay")).toBeNull();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
    expect(document.body.querySelector(".diagram-viewer-overlay")).toBeNull();
  });

  it("commits an unreported diagram draft while destroying the widget", async () => {
    const source = [
      "```mermaid",
      "flowchart LR",
      "A --> B",
      "```",
      "",
      "后言",
    ].join("\n");
    const previewSettings = {
      ...defaultEditorSettings,
      sourceMode: false,
      extensions: { ...defaultEditorSettings.extensions, mermaid: true },
    };
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: { modelValue: source, outline: [], settings: previewSettings },
    });

    try {
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      };
      await editor.selectRange(source.length, source.length, false);
      await settleDiagrams();
      await vi.waitFor(() => {
        expect(wrapper.find(".cm-special-preview-diagram .mermaid svg").exists()).toBe(true);
      });

      await wrapper.get(".cm-special-preview-diagram .mermaid svg").trigger("click");
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      await nextTick();
      wrapper.get<HTMLTextAreaElement>(".diagram-source-editor").element.value = "flowchart TD\nA --> DRAFT";

      await wrapper.setProps({
        settings: { ...previewSettings, sourceMode: true },
      });
      await settleDiagrams();

      expect(wrapper.emitted<string[]>("update:modelValue")).toHaveLength(1);
      expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe([
        "```mermaid",
        "flowchart TD",
        "A --> DRAFT",
        "```",
        "",
        "后言",
      ].join("\n"));
    } finally {
      wrapper.unmount();
    }
  });

  it("commits the active diagram draft before the whole editor unmounts", async () => {
    const source = [
      "```mermaid",
      "flowchart LR",
      "A --> B",
      "```",
      "",
      "后言",
    ].join("\n");
    const settings = {
      ...defaultEditorSettings,
      sourceMode: false,
      extensions: { ...defaultEditorSettings.extensions, mermaid: true },
    };
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: { modelValue: source, outline: [], settings },
    });
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await editor.selectRange(source.length, source.length, false);
    await settleDiagrams();
    await vi.waitFor(() => {
      expect(wrapper.find(".cm-special-preview-diagram .mermaid svg").exists()).toBe(true);
    });
    await wrapper.get(".cm-special-preview-diagram .mermaid svg").trigger("click");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    await nextTick();
    const sourceEditor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor").element;
    sourceEditor.value = "flowchart TD\nA --> UNMOUNT";
    expect(document.activeElement).toBe(sourceEditor);

    wrapper.unmount();

    expect(wrapper.emitted<string[]>("update:modelValue")).toHaveLength(1);
    expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe([
      "```mermaid",
      "flowchart TD",
      "A --> UNMOUNT",
      "```",
      "",
      "后言",
    ].join("\n"));
  });
});

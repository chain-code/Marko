import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorSettings } from "@/types";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><path d="M0 0h200v100H0z" /></svg>',
    bindFunctions: vi.fn(),
  })),
}));

const flowchartMock = vi.hoisted(() => ({
  parse: vi.fn(() => ({
    drawSVG: vi.fn((node: HTMLElement) => {
      node.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="90" viewBox="0 0 180 90"><path d="M0 0h180v90H0z" /></svg>';
    }),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));
vi.mock("flowchart.js", () => ({ default: flowchartMock }));

const settings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

async function settlePreview() {
  await nextTick();
  await flushPromises();
  await nextTick();
  await flushPromises();
}

function mountPreview(source: string, overrides: Partial<EditorSettings> = {}) {
  return mount(MarkdownPreview, {
    attachTo: document.body,
    props: {
      source,
      outline: [],
      settings: {
        ...settings,
        ...overrides,
        extensions: { ...settings.extensions, ...overrides.extensions },
      },
    },
  });
}

describe("MarkdownPreview 图表媒体查看器", () => {
  it("renders a Mermaid flowchart and opens the SVG viewer on double-click", async () => {
    mermaidMock.render.mockClear();
    const wrapper = mountPreview([
      "```mermaid",
      "flowchart LR",
      "  A[开始] --> B[结束]",
      "```",
    ].join("\n"));
    await settlePreview();

    expect(wrapper.find(".mermaid svg").exists()).toBe(true);
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);

    const svg = wrapper.get(".mermaid svg");
    await svg.trigger("click");
    await svg.trigger("click");
    await svg.trigger("dblclick");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    await nextTick();

    const overlay = document.body.querySelector<HTMLElement>(".diagram-viewer-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay?.querySelector(".diagram-viewer-content svg")).not.toBeNull();
    expect(wrapper.find(".diagram-box.show-source").exists()).toBe(false);

    const buttons = Array.from(overlay?.querySelectorAll<HTMLButtonElement>(".diagram-viewer-tool") ?? []);
    expect(buttons).toHaveLength(4);
    await buttons[2].click();
    await nextTick();
    expect(overlay?.querySelector<HTMLElement>(".diagram-viewer-content")?.style.width).toBe("240px");

    await buttons[3].click();
    await nextTick();
    expect(document.body.querySelector(".diagram-viewer-overlay")).toBeNull();
    wrapper.unmount();
  });

  it("keeps the page locked when another inactive diagram instance is removed", async () => {
    const first = mountPreview("```mermaid\nflowchart LR\n  A --> B\n```");
    const second = mountPreview("```mermaid\nflowchart LR\n  C --> D\n```");
    await settlePreview();

    await first.get(".mermaid svg").trigger("dblclick");
    await nextTick();
    expect(document.body.classList.contains("diagram-viewer-open")).toBe(true);

    second.unmount();
    expect(document.body.classList.contains("diagram-viewer-open")).toBe(true);
    first.unmount();
    expect(document.body.classList.contains("diagram-viewer-open")).toBe(false);
  });

  it("keeps the page locked until all active diagram viewers close", async () => {
    const first = mountPreview("```mermaid\nflowchart LR\n  A --> B\n```");
    const second = mountPreview("```mermaid\nflowchart LR\n  C --> D\n```");
    await settlePreview();
    await vi.waitFor(() => {
      expect(first.find(".mermaid svg").exists()).toBe(true);
      expect(second.find(".mermaid svg").exists()).toBe(true);
    }, { timeout: 5000 });

    await first.get(".mermaid svg").trigger("dblclick");
    await second.get(".mermaid svg").trigger("dblclick");
    await nextTick();

    const overlays = Array.from(document.body.querySelectorAll<HTMLElement>(".diagram-viewer-overlay"));
    expect(overlays).toHaveLength(2);
    expect(document.body.classList.contains("diagram-viewer-open")).toBe(true);

    overlays[0].querySelector<HTMLButtonElement>('button[aria-label="关闭大图"]')?.click();
    await nextTick();
    expect(document.body.classList.contains("diagram-viewer-open")).toBe(true);

    overlays[1].querySelector<HTMLButtonElement>('button[aria-label="关闭大图"]')?.click();
    await nextTick();
    expect(document.body.classList.contains("diagram-viewer-open")).toBe(false);

    first.unmount();
    second.unmount();
  });

  it("recognizes Mermaid syntax inside a legacy flowchart fence", async () => {
    mermaidMock.render.mockClear();
    flowchartMock.parse.mockClear();
    const wrapper = mountPreview([
      "```flowchart",
      "flowchart LR",
      "  A[case-service] --> B[task-service]",
      "  subgraph NODE[执行节点]",
      "    B --> C[插件进程]",
      "  end",
      "```",
    ].join("\n"), {
      extensions: { ...settings.extensions, mermaid: false, flowchart: true },
    });
    await settlePreview();

    expect(wrapper.find(".flowchart-render svg").exists()).toBe(true);
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    expect(flowchartMock.parse).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("keeps the original flowchart.js syntax on the flowchart renderer", async () => {
    mermaidMock.render.mockClear();
    flowchartMock.parse.mockClear();
    const wrapper = mountPreview([
      "```flowchart",
      "st=>start: 开始",
      "e=>end: 结束",
      "st->e",
      "```",
    ].join("\n"));
    await settlePreview();

    expect(wrapper.find(".flowchart-render svg").exists()).toBe(true);
    expect(flowchartMock.parse).toHaveBeenCalledTimes(1);
    expect(mermaidMock.render).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

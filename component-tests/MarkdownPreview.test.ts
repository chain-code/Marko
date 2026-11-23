import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorSettings } from "@/types";

const nextTickControl = vi.hoisted(() => ({
  dropCallback: false,
}));

vi.mock("vue", async (importOriginal) => {
  const vue = await importOriginal<typeof import("vue")>();
  return {
    ...vue,
    nextTick: ((callback?: () => unknown) => {
      if (callback && nextTickControl.dropCallback) {
        nextTickControl.dropCallback = false;
        return vue.nextTick();
      }
      return callback ? vue.nextTick(callback) : vue.nextTick();
    }) as typeof vue.nextTick,
  };
});

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, _source: string) => ({
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

const sequenceLifecycleMock = vi.hoisted(() => {
  let releaseModule!: () => void;
  const moduleReady = new Promise<void>((resolve) => {
    releaseModule = resolve;
  });
  return {
    moduleReady,
    releaseModule: () => releaseModule(),
    loadStarted: vi.fn(),
    parse: vi.fn((source: string) => ({ source })),
    drawSvg: vi.fn((node: HTMLElement) => {
      node.innerHTML = '<svg data-sequence="true" viewBox="0 0 120 60"></svg>';
    }),
  };
});

vi.mock("mermaid", () => ({ default: mermaidMock }));
vi.mock("flowchart.js", () => ({ default: flowchartMock }));
vi.mock("@hackmd/js-sequence-diagrams/dist/parser/diagram.js", async () => {
  sequenceLifecycleMock.loadStarted();
  await sequenceLifecycleMock.moduleReady;
  return {
    Diagram: { parse: sequenceLifecycleMock.parse },
  };
});
vi.mock("@hackmd/js-sequence-diagrams/dist/painter/DiagramPainter.js", () => ({
  DiagramPainter: class {
    constructor(private readonly diagram: { source: string }) {}

    drawSvg(node: HTMLElement) {
      sequenceLifecycleMock.drawSvg(node);
    }
  },
}));

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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type MermaidRenderResult = Awaited<ReturnType<typeof mermaidMock.render>>;

function createMermaidResult(label: string): MermaidRenderResult {
  return {
    svg: `<svg data-result="${label}" width="200" height="100" viewBox="0 0 200 100"></svg>`,
    bindFunctions: vi.fn(),
  };
}

function mermaidFence(source: string): string {
  return ["```mermaid", source, "```"].join("\n");
}

describe("MarkdownPreview 图表媒体查看器", () => {
  it("渲染并打开含空格目标的链接和图片", async () => {
    const wrapper = mountPreview(
      '[链接](foo bar "链接标题") ![图](assets/my image.png "图片标题")',
    );
    await settlePreview();

    const link = wrapper.get("a");
    expect(link.attributes("href")).toBe("foo%20bar");
    expect(link.attributes("title")).toBe("链接标题");
    const image = wrapper.get("img");
    expect(image.attributes("src")).toContain("assets/my image.png");
    expect(image.attributes("title")).toBe("图片标题");

    await link.trigger("click", { ctrlKey: true });
    expect(wrapper.emitted<string[]>("openAnchor")?.at(-1)?.[0]).toBe("foo%20bar");
    await image.trigger("dblclick");
    await nextTick();
    expect(document.body.querySelector(".diagram-viewer-content img")).not.toBeNull();
    wrapper.unmount();
  });

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

  it("延迟复检会渲染初次微任务扫描后才出现的 Mermaid 节点", async () => {
    vi.useFakeTimers();
    mermaidMock.render.mockClear();
    const wrapper = mountPreview("正文");
    try {
      await nextTick();
      await nextTick();
      await Promise.resolve();
      expect(mermaidMock.render).not.toHaveBeenCalled();

      const node = document.createElement("div");
      node.className = "mermaid";
      node.dataset.diagramSource = "flowchart LR\n  LATE --> NODE";
      node.textContent = node.dataset.diagramSource;
      wrapper.get("article").element.appendChild(node);
      expect(node.dataset.rendered).toBeUndefined();

      await vi.runOnlyPendingTimersAsync();
      await nextTick();
      await nextTick();

      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
      expect(mermaidMock.render.mock.calls[0]?.[1]).toContain("LATE --> NODE");
      expect(node.dataset.rendered).toBe("true");
      expect(node.querySelector("svg")).not.toBeNull();
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("延迟复检会接管 queued 但未运行的丢失 nextTick", async () => {
    vi.useFakeTimers();
    nextTickControl.dropCallback = true;
    mermaidMock.render.mockClear();
    const wrapper = mountPreview(mermaidFence("flowchart LR\n  STALLED --> RECOVERED"));
    try {
      await nextTick();
      await nextTick();
      expect(mermaidMock.render).not.toHaveBeenCalled();
      expect(wrapper.get(".mermaid").attributes("data-rendered")).toBeUndefined();

      await vi.runOnlyPendingTimersAsync();
      await nextTick();
      await nextTick();

      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
      expect(mermaidMock.render.mock.calls[0]?.[1]).toContain("STALLED --> RECOVERED");
      expect(wrapper.get(".mermaid").attributes("data-rendered")).toBe("true");
      expect(wrapper.find(".mermaid svg").exists()).toBe(true);

      await vi.runOnlyPendingTimersAsync();
      await nextTick();
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    } finally {
      nextTickControl.dropCallback = false;
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it("延迟复检不会重复渲染已经成功的 Mermaid 节点", async () => {
    mermaidMock.render.mockClear();
    const wrapper = mountPreview(mermaidFence("flowchart LR\n  ONCE --> DONE"));
    await settlePreview();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await settlePreview();

    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    expect(wrapper.get(".mermaid").attributes("data-rendered")).toBe("true");
    wrapper.unmount();
  });

  it("卸载后丢弃延迟完成的 Mermaid 结果", async () => {
    mermaidMock.render.mockClear();
    const pending = createDeferred<MermaidRenderResult>();
    const staleResult = createMermaidResult("stale-unmount");
    mermaidMock.render.mockImplementationOnce(() => pending.promise);
    const wrapper = mountPreview(mermaidFence("flowchart LR\n  A --> B"));
    await vi.waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    });

    const oldNode = wrapper.get(".mermaid").element as HTMLElement;
    const oldHtml = oldNode.innerHTML;
    wrapper.unmount();
    pending.resolve(staleResult);
    await flushPromises();
    await nextTick();

    expect(oldNode.innerHTML).toBe(oldHtml);
    expect(oldNode.querySelector('[data-result="stale-unmount"]')).toBeNull();
    expect(staleResult.bindFunctions).not.toHaveBeenCalled();
  });

  it("换源后丢弃旧 Mermaid 结果并只提交新节点", async () => {
    mermaidMock.render.mockClear();
    const pending = createDeferred<MermaidRenderResult>();
    const staleResult = createMermaidResult("stale-source");
    mermaidMock.render.mockImplementationOnce(() => pending.promise);
    const wrapper = mountPreview(mermaidFence("flowchart LR\n  OLD --> A"));
    await vi.waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    });
    const oldNode = wrapper.get(".mermaid").element as HTMLElement;

    await wrapper.setProps({
      source: mermaidFence("flowchart LR\n  NEW --> B"),
    });
    await nextTick();
    await flushPromises();
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);

    pending.resolve(staleResult);
    await vi.waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
    });
    await settlePreview();

    expect(staleResult.bindFunctions).not.toHaveBeenCalled();
    expect(oldNode.querySelector('[data-result="stale-source"]')).toBeNull();
    expect(mermaidMock.render.mock.calls[1]?.[1]).toContain("NEW --> B");
    expect(wrapper.find(".mermaid svg").exists()).toBe(true);
    wrapper.unmount();
  });

  it("跨预览实例串行 Mermaid 渲染并生成唯一 ID", async () => {
    mermaidMock.render.mockClear();
    const pending = createDeferred<MermaidRenderResult>();
    mermaidMock.render.mockImplementationOnce(() => pending.promise);
    const first = mountPreview(mermaidFence("flowchart LR\n  A --> B"));
    await vi.waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    });

    const second = mountPreview(mermaidFence("flowchart LR\n  C --> D"));
    await nextTick();
    await flushPromises();
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);

    pending.resolve(createMermaidResult("first"));
    await vi.waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
    });
    await settlePreview();

    expect(mermaidMock.render.mock.calls[0]?.[0])
      .not.toBe(mermaidMock.render.mock.calls[1]?.[0]);
    expect(first.find(".mermaid svg").exists()).toBe(true);
    expect(second.find(".mermaid svg").exists()).toBe(true);
    first.unmount();
    second.unmount();
  });

  it("Mermaid 任务失败后继续执行全局队列中的下一项", async () => {
    mermaidMock.render.mockClear();
    const pending = createDeferred<MermaidRenderResult>();
    mermaidMock.render.mockImplementationOnce(() => pending.promise);
    const first = mountPreview(mermaidFence("flowchart LR\n  FAIL --> A"));
    await vi.waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    });

    const second = mountPreview(mermaidFence("flowchart LR\n  NEXT --> B"));
    await nextTick();
    await flushPromises();
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);

    pending.reject(new Error("render failed"));
    await vi.waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalledTimes(2);
    });
    await settlePreview();

    expect(first.find(".mermaid.diagram-error").exists()).toBe(true);
    expect(second.find(".mermaid svg").exists()).toBe(true);
    first.unmount();
    second.unmount();
  });

  it("Sequence 模块加载完成时不再写入已卸载节点", async () => {
    sequenceLifecycleMock.loadStarted.mockClear();
    sequenceLifecycleMock.parse.mockClear();
    sequenceLifecycleMock.drawSvg.mockClear();
    const wrapper = mountPreview([
      "```sequence",
      "Alice->Bob: Hello",
      "```",
    ].join("\n"));
    await vi.waitFor(() => {
      expect(sequenceLifecycleMock.loadStarted).toHaveBeenCalledTimes(1);
    });

    const oldNode = wrapper.get(".sequence-render").element as HTMLElement;
    const oldHtml = oldNode.innerHTML;
    wrapper.unmount();
    sequenceLifecycleMock.releaseModule();
    await flushPromises();
    await nextTick();

    expect(sequenceLifecycleMock.parse).not.toHaveBeenCalled();
    expect(sequenceLifecycleMock.drawSvg).not.toHaveBeenCalled();
    expect(oldNode.innerHTML).toBe(oldHtml);
    expect(oldNode.querySelector("svg")).toBeNull();
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
  }, 10000);

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

    await wrapper.get(".flowchart-render svg").trigger("dblclick");
    await nextTick();
    expect(document.body.querySelector(".diagram-viewer-overlay")).not.toBeNull();
    expect(document.body.querySelector(".diagram-viewer-content svg")).not.toBeNull();
    expect(wrapper.find(".flowchart-diagram.show-source").exists()).toBe(false);
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

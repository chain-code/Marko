import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import SettingsPanel from "@/components/SettingsPanel.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorSettings } from "@/types";

const sequenceMock = vi.hoisted(() => {
  return {
    parse: vi.fn((source: string) => ({ source })),
    drawSvg: vi.fn((container: HTMLElement, _options?: { theme: string }) => {
      container.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><path d="M0 0h320v160H0z" /></svg>';
    }),
  };
});

vi.mock("@hackmd/js-sequence-diagrams/dist/parser/diagram.js", () => ({
  Diagram: { parse: sequenceMock.parse },
}));
vi.mock("@hackmd/js-sequence-diagrams/dist/painter/DiagramPainter.js", () => ({
  DiagramPainter: class {
    constructor(private readonly diagram: { source: string }) {}

    drawSvg(container: HTMLElement, options?: { theme: string }) {
      sequenceMock.drawSvg(container, options);
    }
  },
}));

const sequenceSource = [
  "Alice->Bob: Hello Bob, how are you?",
  "Note right of Bob: Bob thinks",
  "Bob-->Alice: I am good thanks!",
].join("\n");
const sequenceGlobalKeys = ["$", "jQuery", "Raphael"] as const;
type SequenceGlobalKey = (typeof sequenceGlobalKeys)[number];
type SequenceGlobalSnapshot = Record<SequenceGlobalKey, PropertyDescriptor | undefined>;
let sequenceGlobalSnapshot: SequenceGlobalSnapshot | null = null;

function installHostGlobalSentinels() {
  sequenceGlobalSnapshot = Object.fromEntries(
    sequenceGlobalKeys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  ) as SequenceGlobalSnapshot;
  const sentinels: Record<SequenceGlobalKey, symbol> = {
    $: Symbol("host-$"),
    jQuery: Symbol("host-jQuery"),
    Raphael: Symbol("host-Raphael"),
  };
  Object.assign(globalThis, sentinels);
  return sentinels;
}

function restoreHostGlobals() {
  if (!sequenceGlobalSnapshot) return;
  for (const key of sequenceGlobalKeys) {
    const descriptor = sequenceGlobalSnapshot[key];
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, key);
    }
  }
  sequenceGlobalSnapshot = null;
}

function sequenceFence(prefix = "") {
  return [
    prefix + "```sequence",
    ...sequenceSource.split("\n").map((line) => prefix + line),
    prefix + "```",
  ].join("\n");
}

function createSettings(overrides: Partial<EditorSettings> = {}): EditorSettings {
  return {
    ...defaultEditorSettings,
    ...overrides,
    extensions: {
      ...defaultEditorSettings.extensions,
      ...overrides.extensions,
    },
  };
}

async function settle() {
  await nextTick();
  await flushPromises();
  await nextTick();
  await flushPromises();
}

afterEach(() => {
  document.body.querySelectorAll(".diagram-viewer-overlay").forEach((element) => element.remove());
  document.body.classList.remove("diagram-viewer-open");
  sequenceMock.parse.mockReset();
  sequenceMock.parse.mockImplementation((source: string) => ({ source }));
  sequenceMock.drawSvg.mockClear();
  restoreHostGlobals();
  vi.useRealTimers();
});

describe("Sequence legacy diagram", () => {
  it("preserves host globals, renders SVG and opens the large viewer", async () => {
    const hostGlobals = installHostGlobalSentinels();
    const wrapper = mount(MarkdownPreview, {
      attachTo: document.body,
      props: {
        source: sequenceFence(),
        outline: [],
        settings: createSettings(),
      },
    });
    await settle();

    const globals = globalThis as unknown as Record<SequenceGlobalKey, unknown>;
    expect(globals.$).toBe(hostGlobals.$);
    expect(globals.jQuery).toBe(hostGlobals.jQuery);
    expect(globals.Raphael).toBe(hostGlobals.Raphael);
    expect(sequenceMock.parse).toHaveBeenCalledWith(sequenceSource + "\n");
    expect(sequenceMock.drawSvg).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      { theme: "simple" },
    );
    expect(wrapper.find(".sequence-render svg").exists()).toBe(true);

    await wrapper.get(".sequence-render svg").trigger("dblclick");
    await nextTick();
    expect(document.body.querySelector(".diagram-viewer-content svg")).not.toBeNull();
    wrapper.unmount();
  });

  it("双击事件序列会取消单击源码切换并打开查看器", async () => {
    vi.useFakeTimers();
    const wrapper = mount(MarkdownPreview, {
      attachTo: document.body,
      props: {
        source: sequenceFence(),
        outline: [],
        settings: createSettings(),
      },
    });
    await settle();

    const svg = wrapper.get(".sequence-render svg");
    await svg.trigger("mousedown", { button: 0, detail: 1 });
    await svg.trigger("mouseup", { button: 0, detail: 1 });
    await svg.trigger("click", { button: 0, detail: 1 });
    expect(wrapper.get(".sequence-diagram").classes()).toContain("show-source");

    await svg.trigger("mousedown", { button: 0, detail: 2 });
    await svg.trigger("mouseup", { button: 0, detail: 2 });
    await svg.trigger("click", { button: 0, detail: 2 });
    await svg.trigger("dblclick", { button: 0, detail: 2 });
    await nextTick();
    vi.advanceTimersByTime(250);
    await nextTick();

    expect(wrapper.get(".sequence-diagram").classes()).not.toContain("show-source");
    expect(document.body.querySelector(".diagram-viewer-content svg")).not.toBeNull();
    wrapper.unmount();
  });

  it("focuses diagram source on first mousedown and preserves the old text cursor", async () => {
    const before = "正文旧光标";
    const after = "图表后正文";
    const source = [before, "", sequenceFence(), "", after].join("\n");
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: createSettings(),
      },
    });
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number } | null;
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const oldCursor = 2;
    await editor.selectRange(oldCursor, oldCursor);
    await settle();

    const svg = wrapper.get(".cm-special-preview-diagram .sequence-render svg");
    svg.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 1,
    }));

    const sourceEditor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor").element;
    expect(document.activeElement).toBe(sourceEditor);
    expect(wrapper.get(".sequence-diagram").classes()).toContain("show-source");

    const editedSequenceSource = sequenceSource.replace(
      "Hello Bob, how are you?",
      "Updated immediately",
    );
    sourceEditor.value = editedSequenceSource;
    sourceEditor.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    await nextTick();

    const expectedSource = source.replace(sequenceSource, editedSequenceSource);
    expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe(expectedSource);
    expect(expectedSource.startsWith(before + "\n\n")).toBe(true);
    expect(expectedSource.endsWith("\n\n" + after)).toBe(true);
    expect(editor.getViewState()).toMatchObject({ anchor: oldCursor, head: oldCursor });
    wrapper.unmount();
  });

  it("keeps source and error details visible when sequence parsing fails", async () => {
    sequenceMock.parse.mockImplementationOnce(() => {
      throw new Error("bad sequence");
    });
    const wrapper = mount(MarkdownPreview, {
      props: {
        source: sequenceFence(),
        outline: [],
        settings: createSettings(),
      },
    });
    await settle();

    const error = wrapper.get(".sequence-render.diagram-error");
    expect(error.text()).toContain("Alice->Bob");
    expect(error.text()).toContain("bad sequence");
    expect(error.find("svg").exists()).toBe(false);
    wrapper.unmount();
  });

  it("uses a normal code fence when the sequence extension is disabled", async () => {
    const wrapper = mount(MarkdownPreview, {
      props: {
        source: sequenceFence(),
        outline: [],
        settings: createSettings({
          extensions: { ...defaultEditorSettings.extensions, sequence: false },
        }),
      },
    });
    await settle();

    expect(wrapper.find(".sequence-render").exists()).toBe(false);
    expect(wrapper.get("pre code").text()).toContain("Alice->Bob");
    expect(sequenceMock.parse).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("preserves active editing, readonly, blockquote and list container behavior", async () => {
    const editableSource = sequenceFence() + "\n\n正文";
    const editable = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: editableSource,
        outline: [],
        settings: createSettings(),
      },
    });
    await settle();
    const editor = editable.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };

    expect(editable.find(".cm-special-preview-diagram").exists()).toBe(false);
    await editor.selectRange(editableSource.length, editableSource.length);
    await settle();
    expect(editable.find(".cm-special-preview-diagram .sequence-render svg").exists()).toBe(true);
    await editor.selectRange(editableSource.indexOf("Alice") + 2, editableSource.indexOf("Alice") + 2);
    await settle();
    expect(editable.find(".cm-special-preview-diagram").exists()).toBe(false);
    editable.unmount();

    for (const source of [
      sequenceFence(),
      sequenceFence("> "),
      ["- 时序图", ...sequenceFence().split("\n").map((line) => "  " + line)].join("\n"),
    ]) {
      const readonly = mount(ContinuousMarkdownEditor, {
        attachTo: document.body,
        props: {
          modelValue: source,
          outline: [],
          readonly: true,
          settings: createSettings(),
        },
      });
      await settle();
      expect(readonly.find(".cm-special-preview-diagram .sequence-render svg").exists()).toBe(true);
      readonly.unmount();
    }
  });

  it("exposes the sequence extension switch in Markdown settings", async () => {
    const wrapper = mount(SettingsPanel, {
      attachTo: document.body,
      props: { modelValue: createSettings() },
    });
    await wrapper.findAll(".settings-nav button")[2]!.trigger("click");
    await nextTick();

    const row = wrapper.findAll(".extension-row").find((item) => item.text().includes("Sequence"));
    expect(row).toBeDefined();
    await row!.get<HTMLInputElement>('input[type="checkbox"]').setValue(false);
    const updated = wrapper.emitted<EditorSettings[]>("update:modelValue")?.at(-1)?.[0];
    expect(updated?.extensions.sequence).toBe(false);
    wrapper.unmount();
  });
});

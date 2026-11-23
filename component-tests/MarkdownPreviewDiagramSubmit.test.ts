import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg viewBox="0 0 200 100"></svg>',
    bindFunctions: vi.fn(),
  })),
}));

const flowchartMock = vi.hoisted(() => ({
  parse: vi.fn(() => ({
    drawSVG: vi.fn((node: HTMLElement) => {
      node.innerHTML = '<svg viewBox="0 0 180 90"></svg>';
    }),
  })),
}));

const sequenceMock = vi.hoisted(() => ({
  parse: vi.fn((source: string) => ({ source })),
  drawSvg: vi.fn((node: HTMLElement) => {
    node.innerHTML = '<svg viewBox="0 0 160 80"></svg>';
  }),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));
vi.mock("flowchart.js", () => ({ default: flowchartMock }));
vi.mock("@hackmd/js-sequence-diagrams/dist/parser/diagram.js", () => ({
  Diagram: { parse: sequenceMock.parse },
}));
vi.mock("@hackmd/js-sequence-diagrams/dist/painter/DiagramPainter.js", () => ({
  DiagramPainter: class {
    constructor(private readonly diagram: { source: string }) {}

    drawSvg(node: HTMLElement) {
      sequenceMock.drawSvg(node);
    }
  },
}));

const diagrams = [
  {
    name: "Mermaid",
    language: "mermaid",
    body: "flowchart LR\nA --> B",
    editedBody: "flowchart TD\nA --> C\nC --> D",
    renderedSelector: ".mermaid svg",
    boxSelector: ".mermaid-diagram",
  },
  {
    name: "Flowchart",
    language: "flowchart",
    body: "st=>start: Start\ne=>end: End\nst->e",
    editedBody: "st=>start: Updated\ne=>end: End\nop=>operation: Continue\nst->op->e",
    renderedSelector: ".flowchart-render svg",
    boxSelector: ".flowchart-diagram",
  },
  {
    name: "Sequence",
    language: "sequence",
    body: "Alice->Bob: Hello",
    editedBody: "Alice->Bob: Updated\nBob->Alice: Ack",
    renderedSelector: ".sequence-render svg",
    boxSelector: ".sequence-diagram",
  },
] as const;

const submitCases = diagrams.flatMap((diagram) => [
  { ...diagram, modifier: "ctrlKey" as const, shortcut: "Ctrl+Enter" },
  { ...diagram, modifier: "metaKey" as const, shortcut: "Cmd+Enter" },
  { ...diagram, modifier: null, shortcut: "Escape" },
]);
const fence = String.fromCharCode(96).repeat(3);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("MarkdownPreview 图表源码提交快捷键", () => {
  it.each(submitCases)(
    "$name 使用 $shortcut 提交并关闭源码面板",
    async ({ language, body, editedBody, renderedSelector, boxSelector, modifier }) => {
      const source = [fence + language, body, fence].join("\n");
      const wrapper = mount(MarkdownPreview, {
        attachTo: document.body,
        props: {
          source,
          outline: [],
          settings: {
            ...defaultEditorSettings,
            extensions: { ...defaultEditorSettings.extensions },
          },
        },
      });

      try {
        await settlePreview();
        await wrapper.get(renderedSelector).trigger("mousedown", { button: 0 });
        await nextTick();

        const box = wrapper.get(boxSelector);
        const editor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor");
        expect(box.classes()).toContain("show-source");

        editor.element.focus();
        expect(document.activeElement).toBe(editor.element);
        editor.element.value = editedBody;
        editor.element.setSelectionRange(editedBody.length, editedBody.length);
        const eventInit: KeyboardEventInit = {
          key: modifier ? "Enter" : "Escape",
          bubbles: true,
          cancelable: true,
        };
        if (modifier) eventInit[modifier] = true;
        const event = new KeyboardEvent("keydown", eventInit);
        editor.element.dispatchEvent(event);
        await nextTick();

        expect(event.defaultPrevented).toBe(true);
        expect(box.classes()).not.toContain("show-source");
        expect(document.activeElement).not.toBe(editor.element);
        expect(wrapper.emitted("replaceSource")).toHaveLength(1);
        expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(
          [fence + language, editedBody, fence].join("\n"),
        );
        const expectedSelection = `${fence}${language}\n${editedBody}`.length;
        expect(
          wrapper.emitted<[{ selectionStart: number; selectionEnd: number }]>("selection")?.at(-1)?.[0],
        ).toEqual({
          selectionStart: expectedSelection,
          selectionEnd: expectedSelection,
        });
      } finally {
        wrapper.unmount();
      }
    },
  );
});

describe("MarkdownPreview 图表源码失焦提交", () => {
  it.each(diagrams)(
    "$name 失焦时提交并关闭源码面板",
    async ({ language, body, editedBody, renderedSelector, boxSelector }) => {
      const source = [fence + language, body, fence].join("\n");
      const wrapper = mount(MarkdownPreview, {
        attachTo: document.body,
        props: {
          source,
          outline: [],
          settings: {
            ...defaultEditorSettings,
            extensions: { ...defaultEditorSettings.extensions },
          },
        },
      });

      try {
        await settlePreview();
        await wrapper.get(renderedSelector).trigger("mousedown", { button: 0 });
        await nextTick();

        const editor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor");
        expect(wrapper.get(boxSelector).classes()).toContain("show-source");
        editor.element.value = editedBody;
        editor.element.setSelectionRange(editedBody.length, editedBody.length);
        editor.element.blur();
        await nextTick();

        expect(wrapper.get(boxSelector).classes()).not.toContain("show-source");
        expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(
          [fence + language, editedBody, fence].join("\n"),
        );
        expect(document.activeElement).not.toBe(editor.element);
      } finally {
        wrapper.unmount();
      }
    },
  );
});

describe("MarkdownPreview 图表双击放大", () => {
  it.each(diagrams)(
    "$name 双击已渲染图表时打开大图查看器",
    async ({ language, body, renderedSelector, boxSelector }) => {
      const wrapper = mount(MarkdownPreview, {
        attachTo: document.body,
        props: {
          source: [fence + language, body, fence].join("\n"),
          outline: [],
          settings: {
            ...defaultEditorSettings,
            extensions: { ...defaultEditorSettings.extensions },
          },
        },
      });

      try {
        await settlePreview();
        await wrapper.get(renderedSelector).trigger("dblclick");
        await nextTick();

        const overlay = document.body.querySelector<HTMLElement>(".diagram-viewer-overlay");
        expect(overlay).not.toBeNull();
        expect(overlay?.querySelector(".diagram-viewer-content svg")).not.toBeNull();
        expect(overlay?.querySelectorAll(".diagram-viewer-tool")).toHaveLength(4);
        expect(wrapper.get(boxSelector).classes()).not.toContain("show-source");
      } finally {
        wrapper.unmount();
      }
    },
  );
});

async function settlePreview() {
  await nextTick();
  await flushPromises();
  await nextTick();
  await flushPromises();
}

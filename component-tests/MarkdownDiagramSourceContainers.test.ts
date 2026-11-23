import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><path d="M0 0h200v100H0z" /></svg>',
    bindFunctions: vi.fn(),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

async function settlePreview() {
  await nextTick();
  await flushPromises();
  await nextTick();
}

describe("MarkdownPreview 容器图表源码编辑", () => {
  it("编辑引用内 Mermaid 后保留每一行的引用前缀", async () => {
    const source = "> ```mermaid\n> flowchart LR\n> A --> B\n> ```";
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
      await wrapper.get(".mermaid svg").trigger("click");
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      await nextTick();

      const editor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor");
      editor.element.value = "flowchart TD\nA --> C";
      await editor.trigger("blur");

      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(
        "> ```mermaid\n> flowchart TD\n> A --> C\n> ```",
      );
    } finally {
      wrapper.unmount();
    }
  });

  it("输入时立即同步并在父级回写后保持编辑器焦点", async () => {
    const source = "开头\n\n```mermaid\nflowchart LR\nA --> B\n```\n\n结尾";
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
      await wrapper.get(".mermaid svg").trigger("click");
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      await nextTick();

      const editor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor");
      const editorElement = editor.element;
      editorElement.value = "flowchart TD\nA --> C";
      await editor.trigger("input");

      const editedSource = "开头\n\n```mermaid\nflowchart TD\nA --> C\n```\n\n结尾";
      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(editedSource);
      expect(document.activeElement).toBe(editorElement);

      await wrapper.setProps({ source: editedSource });
      await settlePreview();
      expect(wrapper.get(".diagram-source-editor").element).toBe(editorElement);
      expect(document.activeElement).toBe(editorElement);
      expect(editorElement.value).toBe("flowchart TD\nA --> C");

      const emissionsBeforeStaleUpdate = wrapper.emitted<string[]>("replaceSource")?.length ?? 0;
      await wrapper.setProps({ source });
      await nextTick();
      expect(wrapper.emitted<string[]>("replaceSource")).toHaveLength(emissionsBeforeStaleUpdate + 1);
      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(editedSource);
      expect(wrapper.get(".diagram-source-editor").element).toBe(editorElement);
      expect(document.activeElement).toBe(editorElement);

      const externallyUpdated = "新开头\n\n```mermaid\nflowchart LR\nA --> B\n```\n\n新结尾";
      await wrapper.setProps({ source: externallyUpdated });
      await nextTick();
      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(
        "新开头\n\n```mermaid\nflowchart TD\nA --> C\n```\n\n新结尾",
      );
      expect(wrapper.get(".diagram-source-editor").element).toBe(editorElement);
      expect(document.activeElement).toBe(editorElement);
    } finally {
      wrapper.unmount();
    }
  });

  it("按 Ctrl+S 前同步当前值并允许保存快捷键继续冒泡", async () => {
    const source = "```mermaid\nflowchart LR\nA --> B\n```";
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
    let sourceObservedBySave = "";
    const handleSave = () => {
      sourceObservedBySave = wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0] ?? "";
    };
    window.addEventListener("keydown", handleSave);

    try {
      await settlePreview();
      await wrapper.get(".mermaid svg").trigger("click");
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      await nextTick();

      const editor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor");
      editor.element.value = "flowchart TD\nSAVE --> NEW";
      await editor.trigger("input");
      const emissionsBeforeSave = wrapper.emitted<string[]>("replaceSource")?.length ?? 0;
      await editor.trigger("keydown", { key: "s", ctrlKey: true });

      expect(wrapper.emitted<string[]>("replaceSource")).toHaveLength(emissionsBeforeSave + 1);
      expect(sourceObservedBySave).toBe("```mermaid\nflowchart TD\nSAVE --> NEW\n```");
    } finally {
      window.removeEventListener("keydown", handleSave);
      wrapper.unmount();
    }
  });

  it("组件卸载前提交尚未触发 input 的图表草稿", async () => {
    const source = "```mermaid\nflowchart LR\nA --> B\n```";
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

    await settlePreview();
    await wrapper.get(".mermaid svg").trigger("click");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    await nextTick();

    wrapper.get<HTMLTextAreaElement>(".diagram-source-editor").element.value = "flowchart TD\nA --> FINAL";
    wrapper.unmount();

    expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(
      "```mermaid\nflowchart TD\nA --> FINAL\n```",
    );
  });

  it("commits a draft and closes the source panel before becoming readonly", async () => {
    const source = "```mermaid\nflowchart LR\nA --> B\n```";
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
      await wrapper.get(".mermaid svg").trigger("click");
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      await nextTick();

      wrapper.get<HTMLTextAreaElement>(".diagram-source-editor").element.value = "flowchart TD\nA --> READONLY";
      await wrapper.setProps({ readonly: true });
      await nextTick();

      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(
        "```mermaid\nflowchart TD\nA --> READONLY\n```",
      );
      expect(wrapper.find(".diagram-box.show-source").exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("折叠选区按 Tab 插入制表符并上报完整 Markdown 偏移", async () => {
    const source = ["引言", "", "\x60\x60\x60mermaid", "flowchart LR", "A --> B", "\x60\x60\x60"].join("\n");
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
      await wrapper.get(".mermaid svg").trigger("mousedown", { button: 0 });
      await nextTick();

      const editor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor").element;
      const caret = editor.value.indexOf("A --> B");
      editor.setSelectionRange(caret, caret);
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(event);
      await nextTick();

      const expectedSource = [
        "引言",
        "",
        "\x60\x60\x60mermaid",
        "flowchart LR",
        "\tA --> B",
        "\x60\x60\x60",
      ].join("\n");
      const expectedCaret = expectedSource.indexOf("\tA --> B") + 1;
      expect(event.defaultPrevented).toBe(true);
      expect(editor.value).toBe("flowchart LR\n\tA --> B");
      expect(document.activeElement).toBe(editor);
      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(expectedSource);
      expect(
        wrapper.emitted<[{ selectionStart: number; selectionEnd: number }]>("selection")?.at(-1)?.[0],
      ).toEqual({
        selectionStart: expectedCaret,
        selectionEnd: expectedCaret,
      });
    } finally {
      wrapper.unmount();
    }
  });

  it("多行 Tab 和 Shift+Tab 使用代码缩进宽度并保持反向选区", async () => {
    const source = ["\x60\x60\x60mermaid", "flowchart LR", "A --> B", "\x60\x60\x60"].join("\n");
    const wrapper = mount(MarkdownPreview, {
      attachTo: document.body,
      props: {
        source,
        outline: [],
        settings: {
          ...defaultEditorSettings,
          codeIndentSize: 2,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });

    try {
      await settlePreview();
      await wrapper.get(".mermaid svg").trigger("mousedown", { button: 0 });
      await nextTick();

      const editor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor").element;
      const originalValue = editor.value;
      editor.setSelectionRange(0, originalValue.length, "backward");
      const indentEvent = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(indentEvent);
      await nextTick();

      const indentedValue = "  flowchart LR\n  A --> B";
      const indentedSource = ["\x60\x60\x60mermaid", indentedValue, "\x60\x60\x60"].join("\n");
      expect(indentEvent.defaultPrevented).toBe(true);
      expect(editor.value).toBe(indentedValue);
      expect(editor.selectionStart).toBe(2);
      expect(editor.selectionEnd).toBe(indentedValue.length);
      expect(editor.selectionDirection).toBe("backward");
      expect(document.activeElement).toBe(editor);
      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(indentedSource);
      expect(
        wrapper.emitted<[{ selectionStart: number; selectionEnd: number }]>("selection")?.at(-1)?.[0],
      ).toEqual({
        selectionStart: indentedSource.indexOf("  flowchart LR") + 2,
        selectionEnd: indentedSource.indexOf("  A --> B") + "  A --> B".length,
      });

      const outdentEvent = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      editor.dispatchEvent(outdentEvent);
      await nextTick();

      expect(outdentEvent.defaultPrevented).toBe(true);
      expect(editor.value).toBe(originalValue);
      expect(editor.selectionStart).toBe(0);
      expect(editor.selectionEnd).toBe(originalValue.length);
      expect(editor.selectionDirection).toBe("backward");
      expect(document.activeElement).toBe(editor);
      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(source);
      expect(
        wrapper.emitted<[{ selectionStart: number; selectionEnd: number }]>("selection")?.at(-1)?.[0],
      ).toEqual({
        selectionStart: source.indexOf("flowchart LR"),
        selectionEnd: source.indexOf("A --> B") + "A --> B".length,
      });
    } finally {
      wrapper.unmount();
    }
  });

  it("CRLF 引用图表选区映射到引用前缀后的完整源码位置", async () => {
    const source = [
      "> \x60\x60\x60mermaid",
      "> flowchart LR",
      "> A --> B",
      "> \x60\x60\x60",
    ].join("\r\n");
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
      await wrapper.get(".mermaid svg").trigger("mousedown", { button: 0 });
      await nextTick();

      const editor = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor").element;
      const start = editor.value.indexOf("A --> B");
      editor.setSelectionRange(start, start + "A --> B".length);
      editor.dispatchEvent(new Event("select", { bubbles: true }));
      await nextTick();

      const expectedStart = source.indexOf("A --> B");
      expect(
        wrapper.emitted<[{ selectionStart: number; selectionEnd: number }]>("selection")?.at(-1)?.[0],
      ).toEqual({
        selectionStart: expectedStart,
        selectionEnd: expectedStart + "A --> B".length,
      });
    } finally {
      wrapper.unmount();
    }
  });

  it("输入后立即按新源码上报选区并裁剪尾随换行偏移", async () => {
    const source = ["开头", "", "\x60\x60\x60mermaid", "flowchart LR", "A --> B", "\x60\x60\x60"].join("\n");
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
      await wrapper.get(".mermaid svg").trigger("mousedown", { button: 0 });
      await nextTick();

      const editorWrapper = wrapper.get<HTMLTextAreaElement>(".diagram-source-editor");
      const editor = editorWrapper.element;
      editor.value = "flowchart TD\nA --> C\n";
      editor.setSelectionRange(editor.value.length, editor.value.length);
      await editorWrapper.trigger("input");

      const expectedSource = [
        "开头",
        "",
        "\x60\x60\x60mermaid",
        "flowchart TD",
        "A --> C",
        "\x60\x60\x60",
      ].join("\n");
      const expectedCaret = expectedSource.indexOf("A --> C") + "A --> C".length;
      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(expectedSource);
      expect(
        wrapper.emitted<[{ selectionStart: number; selectionEnd: number }]>("selection")?.at(-1)?.[0],
      ).toEqual({
        selectionStart: expectedCaret,
        selectionEnd: expectedCaret,
      });
    } finally {
      wrapper.unmount();
    }
  });

  it("普通源码编辑框在选择和输入后直接上报完整源码偏移", async () => {
    const source = "前缀 ![图](missing.png) 后缀";
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
      await wrapper.get("img").trigger("click");
      await nextTick();

      const editorWrapper = wrapper.get<HTMLTextAreaElement>(".preview-source-editor");
      const editor = editorWrapper.element;
      editor.setSelectionRange(3, 9);
      await editorWrapper.trigger("select");
      expect(
        wrapper.emitted<[{ selectionStart: number; selectionEnd: number }]>("selection")?.at(-1)?.[0],
      ).toEqual({
        selectionStart: 3,
        selectionEnd: 9,
      });

      const nextSource = "新前缀 ![图](missing.png) 新后缀";
      editor.value = nextSource;
      editor.setSelectionRange(1, 8);
      await editorWrapper.trigger("input");
      expect(wrapper.emitted<string[]>("replaceSource")?.at(-1)?.[0]).toBe(nextSource);
      expect(
        wrapper.emitted<[{ selectionStart: number; selectionEnd: number }]>("selection")?.at(-1)?.[0],
      ).toEqual({
        selectionStart: 1,
        selectionEnd: 8,
      });
    } finally {
      wrapper.unmount();
    }
  });
});

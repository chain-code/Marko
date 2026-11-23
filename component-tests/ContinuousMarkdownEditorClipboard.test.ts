import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import type { EditorCommand, EditorSettings } from "@/types";
import { defaultEditorSettings } from "@/utils/editorSettings";

class TestClipboardItem {
  readonly types: string[];

  constructor(readonly data: Record<string, Blob>) {
    this.types = Object.keys(data);
  }

  async getType(type: string): Promise<Blob> {
    return this.data[type];
  }
}

type EditorHandle = {
  runCommand: (command: EditorCommand) => void;
  selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
  insertText: (text: string) => void;
};

let clipboardDescriptor: PropertyDescriptor | undefined;
let clipboardItemDescriptor: PropertyDescriptor | undefined;
let writeText: ReturnType<typeof vi.fn>;
let write: ReturnType<typeof vi.fn>;
let readText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  write = vi.fn().mockResolvedValue(undefined);
  readText = vi.fn().mockResolvedValue("");
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  clipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText, write, readText },
  });
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: TestClipboardItem,
  });
});

afterEach(() => {
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (clipboardItemDescriptor) Object.defineProperty(globalThis, "ClipboardItem", clipboardItemDescriptor);
  else Reflect.deleteProperty(globalThis, "ClipboardItem");
  document.body.innerHTML = "";
});

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

async function mountWithSelection(source: string, settings: Partial<EditorSettings> = {}) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        ...settings,
        extensions: {
          ...defaultEditorSettings.extensions,
          ...settings.extensions,
        },
      },
    },
  });
  await settleUi();
  const editor = wrapper.vm as unknown as EditorHandle;
  await editor.selectRange(0, source.length, false);
  await settleUi();
  return { wrapper, editor };
}

function lastClipboardItem(): TestClipboardItem {
  const items = write.mock.calls.at(-1)?.[0] as TestClipboardItem[] | undefined;
  expect(items).toHaveLength(1);
  return items![0];
}

function dispatchNativeCopy(content: HTMLElement) {
  const values = new Map<string, string>();
  const event = new Event("copy", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      setData: vi.fn((type: string, value: string) => values.set(type, value)),
    },
  });
  content.dispatchEvent(event);
  return { event, values };
}

function dispatchNativePaste(content: HTMLElement, text: string, html = "") {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [],
      getData: vi.fn((type: string) => type === "text/html" ? html : type === "text/plain" ? text : ""),
    },
  });
  content.dispatchEvent(event);
  return event;
}

describe("ContinuousMarkdownEditor clipboard semantics", () => {
  it("copies readable text and safe semantic HTML by default", async () => {
    const source = [
      "**bold** and [docs](https://example.com)",
      "",
      '<img src="javascript:alert(1)" onerror="alert(1)">',
    ].join("\n");
    const { wrapper, editor } = await mountWithSelection(source);

    editor.runCommand("copy");
    await settleUi();

    expect(writeText).not.toHaveBeenCalled();
    const item = lastClipboardItem();
    const plainText = await item.data["text/plain"].text();
    const html = await item.data["text/html"].text();
    expect(plainText).toContain("bold and docs");
    expect(plainText).not.toContain("**");
    expect(html).toContain("<strong>bold</strong>");
    const copied = document.createElement("template");
    copied.innerHTML = html;
    expect(copied.content.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(copied.content.querySelector("a")?.textContent).toBe("docs");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
    wrapper.unmount();
  });

  it("copies Markdown as text/plain when the preference is enabled", async () => {
    const source = "**bold**";
    const { wrapper, editor } = await mountWithSelection(source, {
      copyMarkdownAsPlainText: true,
    });

    editor.runCommand("copy");
    await settleUi();

    expect(write).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(source);
    wrapper.unmount();
  });

  it("writes semantic formats for a native Ctrl+C copy event", async () => {
    const { wrapper } = await mountWithSelection("**bold**");

    const result = dispatchNativeCopy(wrapper.get<HTMLElement>(".cm-content").element);

    expect(result.event.defaultPrevented).toBe(true);
    expect(result.values.get("text/plain")).toBe("bold");
    expect(result.values.get("text/html")).toBe("<p><strong>bold</strong></p>");
    wrapper.unmount();
  });

  it("writes Markdown only for a native copy event when configured", async () => {
    const { wrapper } = await mountWithSelection("**bold**", {
      copyMarkdownAsPlainText: true,
    });

    const result = dispatchNativeCopy(wrapper.get<HTMLElement>(".cm-content").element);

    expect(result.event.defaultPrevented).toBe(true);
    expect(result.values.get("text/plain")).toBe("**bold**");
    expect(result.values.has("text/html")).toBe(false);
    wrapper.unmount();
  });

  it("projects partial visible selections into semantic HTML and standalone Markdown", async () => {
    const cases = [
      {
        source: "left **bold** right",
        selected: "bold",
        markdown: "**bold**",
        selector: "strong",
      },
      {
        source: "left *italic* right",
        selected: "italic",
        markdown: "*italic*",
        selector: "em",
      },
      {
        source: "left ***nested*** right",
        selected: "nested",
        markdown: "***nested***",
        selector: "em strong, strong em",
      },
      {
        source: "left `code` right",
        selected: "code",
        markdown: "`code`",
        selector: "code",
      },
      {
        source: "left ==marked== right",
        selected: "marked",
        markdown: "==marked==",
        selector: "mark",
        marks: true,
      },
      {
        source: "left <u>under</u> right",
        selected: "under",
        markdown: "<u>under</u>",
        selector: "u",
      },
    ];

    for (const current of cases) {
      write.mockClear();
      writeText.mockClear();
      const { wrapper, editor } = await mountWithSelection(
        current.source,
        current.marks
          ? {
            extensions: {
              ...defaultEditorSettings.extensions,
              marks: true,
            },
          }
          : {},
      );
      const start = current.source.indexOf(current.selected);
      await editor.selectRange(start, start + current.selected.length, false);
      await settleUi();

      editor.runCommand("copy");
      await settleUi();
      const item = lastClipboardItem();
      expect(await item.data["text/plain"].text()).toBe(current.selected);
      const copied = document.createElement("template");
      copied.innerHTML = await item.data["text/html"].text();
      expect(copied.content.querySelector(current.selector)?.textContent).toBe(current.selected);

      editor.runCommand("copyMarkdown");
      await settleUi();
      expect(writeText).toHaveBeenLastCalledWith(current.markdown);
      wrapper.unmount();
    }
  });

  it("keeps a partially selected link target and the plain-text channel distinct", async () => {
    const source = "left [docs](https://example.com/guide) right";
    const { wrapper, editor } = await mountWithSelection(source);
    const start = source.indexOf("docs");
    await editor.selectRange(start, start + "docs".length, false);
    await settleUi();

    editor.runCommand("copy");
    await settleUi();
    const item = lastClipboardItem();
    expect(await item.data["text/plain"].text()).toBe("docs");
    const copied = document.createElement("template");
    copied.innerHTML = await item.data["text/html"].text();
    expect(copied.content.querySelector("a")?.textContent).toBe("docs");
    expect(copied.content.querySelector("a")?.getAttribute("href"))
      .toBe("https://example.com/guide");

    editor.runCommand("copyMarkdown");
    await settleUi();
    expect(writeText).toHaveBeenLastCalledWith("[docs](https://example.com/guide)");

    writeText.mockClear();
    editor.runCommand("copyPlainText");
    await settleUi();
    expect(writeText).toHaveBeenLastCalledWith("docs");

    const nativeCopy = dispatchNativeCopy(wrapper.get<HTMLElement>(".cm-content").element);
    expect(nativeCopy.values.get("text/plain")).toBe("docs");
    expect(nativeCopy.values.get("text/html")).toContain('href="https://example.com/guide"');
    wrapper.unmount();
  });

  it("keeps explicit Markdown and plain-text copy commands distinct", async () => {
    const source = "**bold** and *italic*";
    const { wrapper, editor } = await mountWithSelection(source);

    editor.runCommand("copyMarkdown");
    await settleUi();
    expect(writeText).toHaveBeenLastCalledWith(source);

    writeText.mockClear();
    editor.runCommand("copyPlainText");
    await settleUi();
    expect(writeText).toHaveBeenLastCalledWith("bold and italic");
    wrapper.unmount();
  });

  it("copies rendered entities, emoji and footnote numbers as plain text", async () => {
    const source = "foo_bar_baz :smile: &copy; note[^n]\n\n[^n]: detail";
    const { wrapper, editor } = await mountWithSelection(source);

    editor.runCommand("copyPlainText");
    await settleUi();

    expect(writeText).toHaveBeenLastCalledWith(
      "foo_bar_baz \u{1F604} © note[1]\ndetail",
    );
    wrapper.unmount();
  });

  it("copies HTML source as plain text and escaped source inside a pre element", async () => {
    const { wrapper, editor } = await mountWithSelection("**bold**");

    editor.runCommand("copyHtml");
    await settleUi();

    const item = lastClipboardItem();
    expect(await item.data["text/plain"].text()).toBe("<p><strong>bold</strong></p>");
    expect(await item.data["text/html"].text())
      .toBe("<pre>&lt;p&gt;&lt;strong&gt;bold&lt;/strong&gt;&lt;/p&gt;</pre>");
    wrapper.unmount();
  });

  it("falls back to text/plain when ClipboardItem is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "ClipboardItem");
    const { wrapper, editor } = await mountWithSelection("**bold**");

    editor.runCommand("copy");
    await settleUi();
    expect(writeText).toHaveBeenLastCalledWith("bold");

    writeText.mockClear();
    editor.runCommand("copyHtml");
    await settleUi();
    expect(writeText).toHaveBeenLastCalledWith("<p><strong>bold</strong></p>");
    wrapper.unmount();
  });

  it("keeps native paste between surrounding typing as an independent undo group", async () => {
    const { wrapper, editor } = await mountWithSelection("");
    editor.insertText("a");
    dispatchNativePaste(wrapper.get<HTMLElement>(".cm-content").element, "B");
    editor.insertText("c");
    await settleUi();

    editor.runCommand("undo");
    await settleUi();
    expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe("aB");
    editor.runCommand("undo");
    await settleUi();
    expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe("a");
    editor.runCommand("undo");
    await settleUi();
    expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe("");
    wrapper.unmount();
  });

  it("keeps menu paste between surrounding typing as an independent undo group", async () => {
    readText.mockResolvedValue("B");
    const { wrapper, editor } = await mountWithSelection("");
    editor.insertText("a");
    editor.runCommand("pastePlainText");
    await settleUi();
    editor.insertText("c");
    await settleUi();

    editor.runCommand("undo");
    await settleUi();
    expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe("aB");
    editor.runCommand("undo");
    await settleUi();
    expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe("a");
    editor.runCommand("undo");
    await settleUi();
    expect(wrapper.emitted<string[]>("update:modelValue")?.at(-1)?.[0]).toBe("");
    wrapper.unmount();
  });
});

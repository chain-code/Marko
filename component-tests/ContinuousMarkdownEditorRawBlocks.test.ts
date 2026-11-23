import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import type { EditorCommand, EditorSettings } from "@/types";
import { getContinuousMarkdownLinePresentations } from "@/utils/continuousEditor";
import { defaultEditorSettings } from "@/utils/editorSettings";

const fence = String.fromCharCode(96).repeat(3);

class TestClipboardItem {
  constructor(readonly data: Record<string, Blob>) {}
}

async function mountEditor(
  source: string,
  overrides: Partial<EditorSettings> = {},
) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        ...overrides,
        extensions: {
          ...defaultEditorSettings.extensions,
          ...overrides.extensions,
        },
      },
    },
  });
  await settleUi();
  return wrapper;
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

async function pressKey(
  wrapper: VueWrapper,
  selectionStart: number,
  selectionEnd: number,
  key: string,
  modifiers: KeyboardEventInit = {},
) {
  const editor = wrapper.vm as unknown as {
    selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
  };
  await editor.selectRange(selectionStart, selectionEnd, false);
  await settleUi();
  wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  }));
  await settleUi();
}

function latestSource(wrapper: VueWrapper): string {
  return (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
}

async function openKeyboardContextMenu(
  wrapper: VueWrapper,
  selectionStart: number,
  selectionEnd = selectionStart,
) {
  const editor = wrapper.vm as unknown as {
    selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
  };
  await editor.selectRange(selectionStart, selectionEnd, false);
  await settleUi();
  wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
    key: "ContextMenu",
    bubbles: true,
    cancelable: true,
  }));
  await settleUi();
}

function getContextMenuItem(wrapper: VueWrapper, label: string) {
  return wrapper.findAll<HTMLButtonElement>(".editor-context-menu [role='menuitem']")
    .find((item) => item.text().includes(label));
}

describe("ContinuousMarkdownEditor raw block keyboard behavior", () => {
  it("shows raw block tools only from visual raw content", async () => {
    const source = fence + "js\ncode\n" + fence;
    const wrapper = await mountEditor(source);

    await openKeyboardContextMenu(wrapper, source.indexOf("code"));
    expect(getContextMenuItem(wrapper, "复制代码块内容")?.exists()).toBe(true);
    expect(getContextMenuItem(wrapper, "为选中内容调整缩进")?.exists()).toBe(true);
    expect(getContextMenuItem(wrapper, "为整个代码块调整缩进")?.exists()).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settleUi();

    await openKeyboardContextMenu(wrapper, source.indexOf(fence) + 1);
    expect(getContextMenuItem(wrapper, "复制代码块内容")).toBeUndefined();
    wrapper.unmount();

    for (const current of [
      { source: "$$\nformula\n$$", cursor: "formula" },
      { source: "<div>\ncontent\n</div>", cursor: "content" },
    ]) {
      const rawWrapper = await mountEditor(current.source);
      await openKeyboardContextMenu(rawWrapper, current.source.indexOf(current.cursor));
      expect(getContextMenuItem(rawWrapper, "复制代码块内容")?.exists()).toBe(true);
      rawWrapper.unmount();
    }

    const sourceMode = await mountEditor(source, { sourceMode: true });
    await openKeyboardContextMenu(sourceMode, source.indexOf("code"));
    expect(getContextMenuItem(sourceMode, "复制代码块内容")).toBeUndefined();
    sourceMode.unmount();

    const paragraph = await mountEditor("ordinary text");
    await openKeyboardContextMenu(paragraph, 3);
    expect(getContextMenuItem(paragraph, "复制代码块内容")).toBeUndefined();
    paragraph.unmount();
  });

  it("copies raw block content without fences in plain text and escaped pre HTML", async () => {
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const clipboardItemDescriptor = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write, writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(globalThis, "ClipboardItem", {
      configurable: true,
      value: TestClipboardItem,
    });

    const content = `const html = "<tag>&";`;
    const source = `${fence}js\n${content}\n${fence}`;
    const wrapper = await mountEditor(source);
    try {
      await openKeyboardContextMenu(wrapper, source.indexOf(content));
      await getContextMenuItem(wrapper, "复制代码块内容")!.trigger("click");
      await settleUi();

      const items = write.mock.calls.at(-1)?.[0] as TestClipboardItem[];
      expect(items).toHaveLength(1);
      expect(await items[0].data["text/plain"].text()).toBe(content);
      expect(await items[0].data["text/html"].text()).toBe(
        "<pre>const html = &quot;&lt;tag&gt;&amp;&quot;;</pre>",
      );
    } finally {
      wrapper.unmount();
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
      if (clipboardItemDescriptor) Object.defineProperty(globalThis, "ClipboardItem", clipboardItemDescriptor);
      else Reflect.deleteProperty(globalThis, "ClipboardItem");
    }
  });

  it("auto-indents a selected raw range or the whole block with one undo step", async () => {
    const source = ["<div>", "<span>one</span>", "<p>two</p>", "</div>"].join("\n");
    const selected = await mountEditor(source, { codeIndentSize: 4 });
    const selectedStart = source.indexOf("<p>");
    await openKeyboardContextMenu(selected, selectedStart, selectedStart + "<p>two</p>".length);
    await getContextMenuItem(selected, "为选中内容调整缩进")!.trigger("click");
    await settleUi();
    expect(latestSource(selected)).toBe([
      "<div>",
      "<span>one</span>",
      "    <p>two</p>",
      "</div>",
    ].join("\n"));
    selected.unmount();

    const whole = await mountEditor(source, { codeIndentSize: 4 });
    const originalAnchor = source.indexOf("two");
    await openKeyboardContextMenu(whole, originalAnchor);
    await getContextMenuItem(whole, "为整个代码块调整缩进")!.trigger("click");
    await settleUi();
    const expected = [
      "<div>",
      "    <span>one</span>",
      "    <p>two</p>",
      "</div>",
    ].join("\n");
    expect(latestSource(whole)).toBe(expected);

    const editor = whole.vm as unknown as {
      getViewState: () => { anchor: number };
      runCommand: (command: EditorCommand) => void;
    };
    expect(editor.getViewState().anchor).toBe(expected.indexOf("two"));
    editor.runCommand("undo");
    await settleUi();
    expect(latestSource(whole)).toBe(source);
    whole.unmount();
  });

  it("uses the loaded code language when auto-indenting a fenced block", async () => {
    const source = [
      fence + "javascript",
      "if (true) {",
      'console.log("x");',
      "}",
      fence,
    ].join("\n");
    const wrapper = await mountEditor(source, { codeIndentSize: 4 });
    await openKeyboardContextMenu(wrapper, source.indexOf("console"));
    await getContextMenuItem(wrapper, "为整个代码块调整缩进")!.trigger("click");
    await settleUi();

    expect(latestSource(wrapper)).toBe([
      fence + "javascript",
      "if (true) {",
      '    console.log("x");',
      "}",
      fence,
    ].join("\n"));
    wrapper.unmount();
  });

  it("uses Shift+Tab auto-indent only when enabled and keeps outdent when disabled", async () => {
    const autoSource = ["<div>", "<span>x</span>", "</div>"].join("\n");
    const automatic = await mountEditor(autoSource, {
      codeIndentSize: 3,
      shiftTabAutoIndent: true,
    });
    const automaticCursor = autoSource.indexOf("span");
    await pressKey(automatic, automaticCursor, automaticCursor, "Tab", { shiftKey: true });
    expect(latestSource(automatic)).toBe(["<div>", "   <span>x</span>", "</div>"].join("\n"));
    automatic.unmount();

    const outdentSource = ["<div>", "     <span>x</span>", "</div>"].join("\n");
    const outdent = await mountEditor(outdentSource, {
      codeIndentSize: 5,
      shiftTabAutoIndent: false,
    });
    const outdentCursor = outdentSource.indexOf("span");
    await pressKey(outdent, outdentCursor, outdentCursor, "Tab", { shiftKey: true });
    expect(latestSource(outdent)).toBe(autoSource);
    outdent.unmount();
  });

  it("exits code with Ctrl Enter and closed HTML with ordinary Enter", async () => {
    const codeSource = fence + "js\ncode\n" + fence;
    const code = await mountEditor(codeSource);
    const codeEnd = codeSource.indexOf("\n" + fence);
    await pressKey(code, codeEnd, codeEnd, "Enter", { ctrlKey: true });
    expect(latestSource(code)).toBe(codeSource + "\n\n");
    code.unmount();

    const htmlSource = "<div>\ntext\n</div>";
    const html = await mountEditor(htmlSource);
    await pressKey(html, htmlSource.length, htmlSource.length, "Enter");
    expect(latestSource(html)).toBe(htmlSource + "\n\n");
    html.unmount();
  });

  it("unwraps one-line code and protects multi-line code boundaries", async () => {
    const oneLineSource = fence + "js\nalpha\n" + fence;
    const oneLine = await mountEditor(oneLineSource);
    const oneLineStart = oneLineSource.indexOf("alpha");
    await pressKey(oneLine, oneLineStart, oneLineStart, "Backspace");
    expect(latestSource(oneLine)).toBe("alpha");
    oneLine.unmount();

    const multiLineSource = fence + "js\nalpha\nbeta\n" + fence;
    const multiLine = await mountEditor(multiLineSource);
    const multiLineStart = multiLineSource.indexOf("alpha");
    await pressKey(multiLine, multiLineStart, multiLineStart, "Backspace");
    expect(multiLine.emitted("update:modelValue")).toBeUndefined();
    multiLine.unmount();
  });

  it("deletes empty math and protects non-empty math boundaries", async () => {
    const emptySource = "$$\n\n$$";
    const empty = await mountEditor(emptySource);
    const emptyCursor = emptySource.indexOf("\n") + 1;
    await pressKey(empty, emptyCursor, emptyCursor, "Backspace");
    expect(latestSource(empty)).toBe("");
    empty.unmount();

    const mathSource = "$$\nalpha\n$$";
    const math = await mountEditor(mathSource);
    const mathEnd = mathSource.indexOf("\n$$");
    await pressKey(math, mathEnd, mathEnd, "Delete");
    expect(math.emitted("update:modelValue")).toBeUndefined();
    math.unmount();
  });

  it("uses codeIndentSize independently for raw block selections", async () => {
    const source = fence + "\na\nb\n" + fence;
    const wrapper = await mountEditor(source, {
      indentSize: 4,
      codeIndentSize: 2,
    });
    const start = source.indexOf("a");
    const end = source.indexOf("b") + 1;
    await pressKey(wrapper, start, end, "Tab");
    expect(latestSource(wrapper)).toBe(fence + "\n  a\n  b\n" + fence);
    wrapper.unmount();
  });

  it("uses codeIndentSize for ordinary Enter indentation", async () => {
    const source = fence + "js\nif (true) {\n\n" + fence;
    const wrapper = await mountEditor(source, { codeIndentSize: 4 });
    const cursor = source.indexOf("{") + 1;
    await pressKey(wrapper, cursor, cursor, "Enter");
    expect(latestSource(wrapper)).toBe(fence + "js\nif (true) {\n    \n\n" + fence);
    wrapper.unmount();
  });

  it("keeps code and HTML container boundaries while their source is active", async () => {
    const codeSource = fence + "ts\nconst value = 1;\n" + fence;
    const code = await mountEditor(codeSource);
    const codeEditor = code.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const codeOffset = codeSource.indexOf("value");
    await codeEditor.selectRange(codeOffset, codeOffset, false);
    await settleUi();
    const codeLines = getContinuousMarkdownLinePresentations(codeSource, codeOffset)
      .filter((line) => line.className.includes("cm-raw-block-code"));
    expect(codeLines).toHaveLength(3);
    expect(codeLines[0]?.className).toContain("cm-raw-block-first");
    expect(codeLines[2]?.className).toContain("cm-raw-block-last");
    expect(code.find(".cm-code-fence.cm-raw-block-first").exists()).toBe(true);
    expect(code.find(".cm-code.cm-active-raw-content-last").exists()).toBe(true);
    code.unmount();

    const htmlSource = "<section>\n  <strong>body</strong>\n</section>";
    const html = await mountEditor(htmlSource);
    const htmlEditor = html.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const htmlOffset = htmlSource.indexOf("body");
    await htmlEditor.selectRange(htmlOffset, htmlOffset, false);
    await settleUi();
    const htmlLines = html.findAll(".cm-raw-block-html");
    expect(htmlLines).toHaveLength(3);
    expect(htmlLines[0]?.classes()).toContain("cm-raw-block-first");
    expect(htmlLines[2]?.classes()).toContain("cm-raw-block-last");
    html.unmount();
  });

  it("restores rendered previews after raw block keyboard exits", async () => {
    const codeSource = fence + "js\ncode\n" + fence;
    const code = await mountEditor(codeSource);
    const codeEnd = codeSource.indexOf("\n" + fence);
    await pressKey(code, codeEnd, codeEnd, "Enter", { ctrlKey: true });
    expect(latestSource(code)).toBe(codeSource + "\n\n");
    expect(code.find(".cm-special-preview-code").exists()).toBe(true);
    code.unmount();

    const htmlSource = "<div>\ntext\n</div>";
    const html = await mountEditor(htmlSource);
    await pressKey(html, htmlSource.length, htmlSource.length, "Enter");
    expect(latestSource(html)).toBe(htmlSource + "\n\n");
    expect(html.find(".cm-special-preview-html").exists()).toBe(true);
    html.unmount();
  });

  it("maps code and HTML preview clicks into raw containers and restores previews after leaving", async () => {
    const codeSource = [
      "before",
      "",
      fence + "ts",
      "const value = 1;",
      fence,
      "",
      "after",
    ].join("\n");
    const code = await mountEditor(codeSource);
    await code.get(".cm-special-preview-code .hljs-keyword").trigger("click");
    await settleUi();
    const codeEditor = code.vm as unknown as {
      getViewState: () => { anchor: number };
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    expect(codeEditor.getViewState().anchor).toBe(codeSource.indexOf("const"));
    const codeLines = getContinuousMarkdownLinePresentations(
      codeSource,
      codeSource.indexOf("const"),
    ).filter((line) => line.className.includes("cm-raw-block-code"));
    expect(codeLines).toHaveLength(3);
    expect(codeLines[0]?.className).toContain("cm-raw-block-first");
    expect(codeLines[2]?.className).toContain("cm-raw-block-last");
    expect(code.find(".cm-special-preview-code").exists()).toBe(false);

    const afterCode = codeSource.indexOf("after");
    await codeEditor.selectRange(afterCode, afterCode, false);
    await settleUi();
    expect(code.find(".cm-special-preview-code").exists()).toBe(true);
    code.unmount();

    const htmlSource = [
      "before",
      "",
      "<section>",
      "  <strong>body</strong>",
      "</section>",
      "",
      "after",
    ].join("\n");
    const html = await mountEditor(htmlSource);
    await html.get(".cm-special-preview-html strong").trigger("click");
    await settleUi();
    const htmlEditor = html.vm as unknown as {
      getViewState: () => { anchor: number };
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    expect(htmlEditor.getViewState().anchor).toBe(htmlSource.indexOf("body"));
    const htmlLines = html.findAll(".cm-raw-block-html");
    expect(htmlLines).toHaveLength(3);
    expect(htmlLines[0]?.classes()).toContain("cm-raw-block-first");
    expect(htmlLines[2]?.classes()).toContain("cm-raw-block-last");
    expect(html.find(".cm-special-preview-html").exists()).toBe(false);

    const afterHtml = htmlSource.indexOf("after");
    await htmlEditor.selectRange(afterHtml, afterHtml, false);
    await settleUi();
    expect(html.find(".cm-special-preview-html").exists()).toBe(true);
    html.unmount();
  });

  it("keeps HTML Enter indentation and raw block Shift Enter inside their containers", async () => {
    const codeSource = fence + "js\nalpha\n" + fence;
    const code = await mountEditor(codeSource);
    const codeCursor = codeSource.indexOf("alpha") + 2;
    await pressKey(code, codeCursor, codeCursor, "Enter", { shiftKey: true });
    const updatedCode = fence + "js\nal\npha\n" + fence;
    expect(latestSource(code)).toBe(updatedCode);
    const codeLines = getContinuousMarkdownLinePresentations(
      updatedCode,
      updatedCode.indexOf("pha"),
    ).filter((line) => line.className.includes("cm-raw-block-code"));
    expect(codeLines).toHaveLength(4);
    expect(codeLines[0]?.className).toContain("cm-raw-block-first");
    expect(codeLines[3]?.className).toContain("cm-raw-block-last");
    expect(code.find(".cm-special-preview-code").exists()).toBe(false);
    code.unmount();

    for (const current of [
      { modifiers: {}, expected: "<div>\nal\n    pha\n</div>" },
      { modifiers: { shiftKey: true }, expected: "<div>\nal\npha\n</div>" },
    ]) {
      const htmlSource = "<div>\nalpha\n</div>";
      const html = await mountEditor(htmlSource);
      const htmlCursor = htmlSource.indexOf("alpha") + 2;
      await pressKey(html, htmlCursor, htmlCursor, "Enter", current.modifiers);
      expect(latestSource(html)).toBe(current.expected);
      const htmlLines = html.findAll(".cm-raw-block-html");
      expect(htmlLines).toHaveLength(4);
      expect(htmlLines[0]?.classes()).toContain("cm-raw-block-first");
      expect(htmlLines[3]?.classes()).toContain("cm-raw-block-last");
      html.unmount();
    }
  });
  it("keeps tagged math Enter and Backspace atomic behavior", async () => {
    const emptySource = "$$ {tag}\n\n$$ {end}";
    const empty = await mountEditor(emptySource);
    const emptyCursor = emptySource.indexOf("\n") + 1;
    await pressKey(empty, emptyCursor, emptyCursor, "Backspace");
    expect(latestSource(empty)).toBe("");
    empty.unmount();

    const unclosedSource = "$$ {{tag}}\nalpha";
    const unclosed = await mountEditor(unclosedSource);
    await pressKey(unclosed, unclosedSource.length, unclosedSource.length, "Enter", { ctrlKey: true });
    expect(latestSource(unclosed)).toBe("$$ {{tag}}\nalpha\n$$\n\n");
    unclosed.unmount();

    const protectedSource = "$$ {tag}\nalpha\n$$ {end}";
    const protectedMath = await mountEditor(protectedSource);
    const contentStart = protectedSource.indexOf("alpha");
    await pressKey(protectedMath, contentStart, contentStart, "Backspace");
    expect(protectedMath.emitted("update:modelValue")).toBeUndefined();
    protectedMath.unmount();
  });
});

describe("ContinuousMarkdownEditor active fence presentation", () => {
  it("hides code delimiters and frames the first and last content lines", async () => {
    const sources = [
      [fence + "ts", "alpha", fence].join("\n"),
      [fence + "ts", "alpha", fence].join("\r\n"),
      ["> " + fence + "ts", "> alpha", "> " + fence].join("\n"),
      ["- " + fence + "ts", "  alpha", "  " + fence].join("\r\n"),
    ];

    for (const source of sources) {
      const wrapper = await mountEditor(source);
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      };
      const contentOffset = source.indexOf("alpha");
      await editor.selectRange(contentOffset, contentOffset, false);
      await settleUi();

      const lines = getContinuousMarkdownLinePresentations(source, contentOffset);
      const opening = lines[0]!;
      const content = lines[1]!;
      const closing = lines[2]!;
      expect(opening.className).toContain("cm-active-raw-fence-hidden");
      expect(closing.className).toContain("cm-active-raw-fence-hidden");
      expect(content.className).toContain("cm-active-raw-content-first");
      expect(content.className).toContain("cm-active-raw-content-last");
      expect(opening.hiddenMarker).not.toBeNull();
      expect(closing.hiddenMarker).not.toBeNull();
      expect(wrapper.get(".cm-code-fence.cm-raw-block-first").text()).not.toContain(fence);
      expect(wrapper.get(".cm-code.cm-active-raw-content-last").text()).toContain("alpha");
      wrapper.unmount();
    }
  });

  it("keeps a visible editable source row for empty code fences", async () => {
    const source = [fence, "", fence].join("\r\n");
    const wrapper = await mountEditor(source);
    const editor = wrapper.vm as unknown as {
      insertText: (text: string) => void;
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const emptyLine = fence.length + 1;
    await editor.selectRange(emptyLine, emptyLine, false);
    editor.insertText("x");
    await settleUi();

    const updated = [fence, "x", fence].join("\r\n");
    expect(latestSource(wrapper)).toBe(updated);
    const lines = getContinuousMarkdownLinePresentations(updated, updated.indexOf("x"));
    expect(lines[0]?.className).toContain("cm-active-raw-fence-hidden");
    expect(lines[1]?.className).toContain("cm-active-raw-content-first");
    expect(lines[1]?.className).toContain("cm-active-raw-content-last");
    expect(lines[2]?.className).toContain("cm-active-raw-fence-hidden");
    wrapper.unmount();
  });
});
describe("ContinuousMarkdownEditor raw fence closing", () => {
  it("keeps fence markers with trailing content inside the code block", async () => {
    const source = "~~~js\nalpha\n~~~oops\nbeta\n~~~";
    const wrapper = await mountEditor(source);
    const cursor = source.indexOf("beta") + "beta".length;

    await pressKey(wrapper, cursor, cursor, "Enter");
    expect(latestSource(wrapper)).toBe("~~~js\nalpha\n~~~oops\nbeta\n\n~~~");

    wrapper.unmount();
  });
});

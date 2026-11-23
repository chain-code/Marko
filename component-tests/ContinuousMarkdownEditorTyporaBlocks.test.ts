import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

async function mountEditor(source: string) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        extensions: { ...defaultEditorSettings.extensions },
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

describe("ContinuousMarkdownEditor Typora block keyboard behavior", () => {
  it("keeps Front Matter literal and exits only from its trailing empty line", async () => {
    const literalSource = "---\n- item\n---";
    const literal = await mountEditor(literalSource);
    await pressKey(literal, "---\n- item".length, "---\n- item".length, "Enter");
    expect(latestSource(literal)).toBe("---\n- item\n\n---");
    literal.unmount();

    const unwrapSource = "---\ntitle: x\n---";
    const unwrap = await mountEditor(unwrapSource);
    await pressKey(unwrap, "---\n".length, "---\n".length, "Backspace");
    expect(latestSource(unwrap)).toBe("title: x");
    unwrap.unmount();

    const exitSource = "---\ntitle: x\n\n---";
    const exit = await mountEditor(exitSource);
    const emptyLine = exitSource.indexOf("\n\n") + 1;
    await pressKey(exit, emptyLine, emptyLine, "Enter");
    expect(latestSource(exit)).toBe(exitSource + "\n");
    exit.unmount();
  });

  it("splits Setext and closing-hash ATX headings with their complete patterns", async () => {
    const cases = [
      {
        source: "AlphaBeta\n===",
        cursor: "Alpha".length,
        expected: "Alpha\n===\n\nBeta\n===",
      },
      {
        source: "## AlphaBeta ##",
        cursor: "## Alpha".length,
        expected: "## Alpha ##\n\n## Beta ##",
      },
    ];

    for (const example of cases) {
      const wrapper = await mountEditor(example.source);
      await pressKey(wrapper, example.cursor, example.cursor, "Enter");
      expect(latestSource(wrapper)).toBe(example.expected);
      wrapper.unmount();
    }
  });

  it("uses Ctrl and Cmd Enter to create a paragraph inside the current container", async () => {
    const cases = [
      {
        source: "- AlphaBeta",
        cursor: "- Alpha".length,
        modifiers: { ctrlKey: true },
        expected: "- Alpha\n\n  Beta",
      },
      {
        source: "> - AlphaBeta",
        cursor: "> - Alpha".length,
        modifiers: { metaKey: true },
        expected: "> - Alpha\n>\n>   Beta",
      },
    ];

    for (const example of cases) {
      const wrapper = await mountEditor(example.source);
      await pressKey(wrapper, example.cursor, example.cursor, "Enter", example.modifiers);
      expect(latestSource(wrapper)).toBe(example.expected);
      wrapper.unmount();
    }
  });

  it("replaces ordinary multi-line selections with Tab and outdents one quote level", async () => {
    const selectedSource = "abXX\nYYcd";
    const selected = await mountEditor(selectedSource);
    await pressKey(selected, 2, 7, "Tab");
    expect(latestSource(selected)).toBe("ab\tcd");
    selected.unmount();

    const quoteSource = "> > text";
    const quote = await mountEditor(quoteSource);
    await pressKey(quote, quoteSource.indexOf("text"), quoteSource.indexOf("text"), "Tab", {
      shiftKey: true,
    });
    expect(latestSource(quote)).toBe("> text");
    quote.unmount();
  });

  it("edits Front Matter closed by the YAML explicit end marker", async () => {
    const literalSource = "---\n- item\n...";
    const literal = await mountEditor(literalSource);
    await pressKey(literal, "---\n- item".length, "---\n- item".length, "Enter");
    expect(latestSource(literal)).toBe("---\n- item\n\n...");
    literal.unmount();

    const unwrapSource = "---\ntitle: x\n...";
    const unwrap = await mountEditor(unwrapSource);
    await pressKey(unwrap, "---\n".length, "---\n".length, "Backspace");
    expect(latestSource(unwrap)).toBe("title: x");
    unwrap.unmount();

    const exitSource = "---\ntitle: x\n\n...";
    const exit = await mountEditor(exitSource);
    const emptyLine = exitSource.indexOf("\n\n") + 1;
    await pressKey(exit, emptyLine, emptyLine, "Enter");
    expect(latestSource(exit)).toBe(exitSource + "\n");
    exit.unmount();
  });

  it("uses spaces at a Front Matter line prefix and a literal Tab inside its text", async () => {
    const prefixSource = "---\nkey\n---";
    const prefix = await mountEditor(prefixSource);
    await pressKey(prefix, "---\n".length, "---\n".length, "Tab");
    expect(latestSource(prefix)).toBe("---\n  key\n---");
    prefix.unmount();

    const middleSource = "---\nkey\n---";
    const middle = await mountEditor(middleSource);
    const cursor = middleSource.indexOf("key") + 2;
    await pressKey(middle, cursor, cursor, "Tab");
    expect(latestSource(middle)).toBe("---\nke\ty\n---");
    middle.unmount();
  });
});

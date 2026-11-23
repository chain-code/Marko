import { EditorView } from "@codemirror/view";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  getViewState: () => { anchor: number; head: number };
  insertText: (text: string) => void;
}

interface PointerFixture {
  name: string;
  source: string;
  lineText: string | null;
  position: number;
  x: number;
  word?: string;
}

const pointerFixtures: PointerFixture[] = [
  {
    name: "plain paragraph",
    source: "plain alpha beta",
    lineText: "plain alpha beta",
    position: "plain alpha beta".indexOf("beta") + 2,
    x: 170,
    word: "beta",
  },
  {
    name: "heading",
    source: "# heading alpha beta #",
    lineText: "heading alpha beta",
    position: "# heading alpha beta #".indexOf("beta") + 2,
    x: 190,
    word: "beta",
  },
  {
    name: "contained heading",
    source: "> - ## heading alpha beta ##",
    lineText: "heading alpha beta",
    position: "> - ## heading alpha beta ##".indexOf("beta") + 2,
    x: 210,
    word: "beta",
  },
  {
    name: "blockquote",
    source: "> quote alpha beta",
    lineText: "quote alpha beta",
    position: "> quote alpha beta".indexOf("beta") + 2,
    x: 180,
    word: "beta",
  },
  {
    name: "unordered list body",
    source: "- list alpha beta",
    lineText: "list alpha beta",
    position: "- list alpha beta".indexOf("beta") + 2,
    x: 180,
    word: "beta",
  },
  {
    name: "task list body",
    source: "- [ ] task alpha beta",
    lineText: "task alpha beta",
    position: "- [ ] task alpha beta".indexOf("beta") + 2,
    x: 200,
    word: "beta",
  },
  {
    name: "right of line end",
    source: "tail text",
    lineText: "tail text",
    position: "tail text".length,
    x: 900,
  },
  {
    name: "blank line",
    source: "before blank\n\nafter blank",
    lineText: null,
    position: "before blank\n".length,
    x: 220,
  },
];

function mountEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        extensions: {
          ...defaultEditorSettings.extensions,
        },
      },
    },
  });
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function editorHandle(wrapper: VueWrapper): EditorHandle {
  return wrapper.vm as unknown as EditorHandle;
}

function latestSource(wrapper: VueWrapper, fallback: string): string {
  return (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? fallback;
}

function targetLine(wrapper: VueWrapper, fixture: PointerFixture): HTMLElement {
  const lines = wrapper.findAll<HTMLElement>(".cm-line");
  const target = fixture.lineText === null
    ? lines.find((line) => line.classes().includes("cm-blank") || line.text() === "")
    : lines.find((line) => line.text().includes(fixture.lineText!));
  if (!target) throw new Error(`Target line not found: ${fixture.name}`);
  return target.element;
}

function dispatchMouse(
  target: EventTarget,
  type: "mousedown" | "mouseup" | "click" | "dblclick",
  fixture: PointerFixture,
  detail: number,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "mousedown" ? 1 : 0,
    clientX: fixture.x,
    clientY: 48,
    detail,
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchClickRound(target: Element, fixture: PointerFixture, detail: number) {
  dispatchMouse(target, "mousedown", fixture, detail);
  dispatchMouse(target, "mouseup", fixture, detail);
  dispatchMouse(target, "click", fixture, detail);
}

function dispatchDoubleClick(target: Element, fixture: PointerFixture) {
  dispatchClickRound(target, fixture, 1);
  dispatchClickRound(target, fixture, 2);
  return dispatchMouse(target, "dblclick", fixture, 2);
}

function installPointerPosition(position: number) {
  vi.spyOn(Range.prototype, "getClientRects")
    .mockReturnValue([] as unknown as DOMRectList);
  vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(position);
  vi.spyOn(EditorView.prototype, "posAndSideAtCoords").mockReturnValue({ assoc: 1, pos: position });
  vi.spyOn(document, "getSelection").mockReturnValue(null);
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor immediate typing after physical clicks", () => {
  it.each(pointerFixtures)("$name inserts at the exact single-click position", async (fixture) => {
    const wrapper = mountEditor(fixture.source);
    await settleUi();
    installPointerPosition(fixture.position);
    const target = targetLine(wrapper, fixture);

    dispatchClickRound(target, fixture, 1);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: fixture.position,
      head: fixture.position,
    });
    editorHandle(wrapper).insertText("X");
    await settleUi();

    expect(latestSource(wrapper, fixture.source)).toBe(
      fixture.source.slice(0, fixture.position)
      + "X"
      + fixture.source.slice(fixture.position),
    );
    wrapper.unmount();
  });

  it.each(pointerFixtures.filter((fixture) => fixture.word))(
    "$name replaces the exact word after a complete double-click sequence",
    async (fixture) => {
      const word = fixture.word!;
      const wordFrom = fixture.source.indexOf(word);
      const wordTo = wordFrom + word.length;
      const wrapper = mountEditor(fixture.source);
      await settleUi();
      installPointerPosition(wordFrom + 1);
      const target = targetLine(wrapper, fixture);

      const finalDoubleClick = dispatchDoubleClick(target, fixture);
      expect(finalDoubleClick.defaultPrevented).toBe(true);
      expect(editorHandle(wrapper).getViewState()).toMatchObject({
        anchor: wordFrom,
        head: wordTo,
      });
      editorHandle(wrapper).insertText("X");
      await settleUi();

      expect(latestSource(wrapper, fixture.source)).toBe(
        fixture.source.slice(0, wordFrom) + "X" + fixture.source.slice(wordTo),
      );
      wrapper.unmount();
    },
  );
});

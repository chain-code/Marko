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

interface Point {
  x: number;
  y: number;
}

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
          html: true,
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

function firstTextContaining(root: Node, value: string): Text {
  if (root.nodeType === Node.TEXT_NODE && root.textContent?.includes(value)) {
    return root as Text;
  }
  for (const child of Array.from(root.childNodes)) {
    try {
      return firstTextContaining(child, value);
    } catch {
      continue;
    }
  }
  throw new Error(`Text node not found: ${value}`);
}

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function installTextGeometry(node: Text, left = 20, top = 40, charWidth = 10) {
  const measure = function (this: Range) {
    if (this.startContainer !== node) return domRect(0, 0, 0, 0);
    return domRect(
      left + this.startOffset * charWidth,
      top,
      Math.max(charWidth, (this.endOffset - this.startOffset) * charWidth),
      16,
    );
  };
  vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(measure);
  vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
    return [measure.call(this)] as unknown as DOMRectList;
  });
}

function installCaretPosition(node: Node, offset: number) {
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn(() => ({ offsetNode: node, offset })),
  });
}

function dispatchMouse(
  target: EventTarget,
  type: "mousedown" | "mouseup",
  point: Point,
  detail = 1,
) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "mousedown" ? 1 : 0,
    clientX: point.x,
    clientY: point.y,
    detail,
  }));
}

function dispatchPhysicalClick(target: Element, point: Point, detail = 1) {
  dispatchMouse(target, "mousedown", point, detail);
  dispatchMouse(document, "mouseup", point, detail);
  target.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
    detail,
  }));
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(document, "caretPositionFromPoint");
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor single-click typing", () => {
  it("keeps the physical plain-line click position for the first insertion", async () => {
    const source = "plain alpha beta";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = wrapper.get<HTMLElement>(".cm-line");
    const text = firstTextContaining(line.element, source);
    installTextGeometry(text);
    vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation(({ x }) => (
      Math.max(0, Math.min(source.length, Math.floor((x - 20) / 10)))
    ));
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    const expected = source.indexOf("beta") + 2;
    const point = { x: 20 + expected * 10 + 1, y: 48 };

    dispatchPhysicalClick(line.element, point);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: expected,
      head: expected,
    });
    editorHandle(wrapper).insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, expected) + "X" + source.slice(expected),
    );
    wrapper.unmount();
  });

  it("uses rendered emoji geometry when Chromium reports the replacement root", async () => {
    const source = "Before :smile: after";
    const wrapper = mountEditor(source);
    await settleUi();
    const emoji = wrapper.get<HTMLElement>(".cm-rendered-emoji");
    const text = firstTextContaining(emoji.element, emoji.text());
    installTextGeometry(text, 40, 80, 8);
    vi.spyOn(emoji.element, "getBoundingClientRect").mockReturnValue(
      domRect(40, 80, 16, 16),
    );
    installCaretPosition(emoji.element, 0);
    const point = { x: 55, y: 88 };
    const expected = source.indexOf(":smile:") + ":smile:".length;

    dispatchPhysicalClick(emoji.element, point);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: expected,
      head: expected,
    });
    editorHandle(wrapper).insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, expected) + "X" + source.slice(expected),
    );
    wrapper.unmount();
  });


  it("keeps the rendered definition character after source expansion and mouseup", async () => {
    const source = "Before\n\nTerm\n: Definition alpha beta\n\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();
    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const text = firstTextContaining(definition.element, "Definition alpha beta");
    const renderedOffset = text.data.indexOf("beta") + 2;
    installTextGeometry(text, 40, 80, 8);
    installCaretPosition(text, renderedOffset);
    const point = { x: 40 + renderedOffset * 8 + 1, y: 88 };
    const expected = source.indexOf("beta") + 2;

    dispatchPhysicalClick(definition.element, point);
    expect(wrapper.find(".cm-special-preview-definition").exists()).toBe(false);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: expected,
      head: expected,
    });
    editorHandle(wrapper).insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, expected) + "X" + source.slice(expected),
    );
    wrapper.unmount();
  });

  it.each([
    {
      name: "HTML",
      source: "Before\n\n<div>HTML alpha beta</div>\n\nAfter",
      selector: ".cm-special-preview-html div",
      renderedText: "HTML alpha beta",
      rawLineText: "<div>HTML alpha beta</div>",
      blockStart: "<div>",
      blockEnd: "</div>",
    },
    {
      name: "definition",
      source: "Before\n\nTerm\n: Definition alpha beta\n\nAfter",
      selector: ".cm-special-preview-definition dd",
      renderedText: "Definition alpha beta",
      rawLineText: ": Definition alpha beta",
      blockStart: "Term",
      blockEnd: ": Definition alpha beta",
    },
  ])("preserves the rendered $name word through the final dblclick event", async (fixture) => {
    const wrapper = mountEditor(fixture.source);
    await settleUi();
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    const target = wrapper.get<HTMLElement>(fixture.selector);
    const text = firstTextContaining(target.element, fixture.renderedText);
    const renderedOffset = text.data.indexOf("beta") + 1;
    installTextGeometry(text, 40, 80, 8);
    installCaretPosition(text, renderedOffset);
    const point = { x: 40 + renderedOffset * 8 + 1, y: 88 };
    const beta = fixture.source.indexOf("beta");

    dispatchPhysicalClick(target.element, point);
    await settleUi();
    const rawLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes(fixture.rawLineText));
    expect(rawLine).toBeDefined();
    const view = EditorView.findFromDOM(wrapper.get<HTMLElement>(".cm-editor").element);
    if (!view) throw new Error("CodeMirror editor instance not found");

    dispatchPhysicalClick(rawLine!.element, point, 2);
    const finalDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
      detail: 2,
    });
    rawLine!.element.dispatchEvent(finalDoubleClick);
    if (!finalDoubleClick.defaultPrevented) {
      const blockFrom = fixture.source.indexOf(fixture.blockStart);
      const blockTo = fixture.source.indexOf(fixture.blockEnd, blockFrom)
        + fixture.blockEnd.length;
      view.dispatch({ selection: { anchor: blockFrom, head: blockTo } });
    }
    await settleUi();

    expect(finalDoubleClick.defaultPrevented).toBe(true);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: beta + "beta".length,
    });
    editorHandle(wrapper).insertText("R");
    await settleUi();
    expect(latestSource(wrapper, fixture.source)).toBe(
      fixture.source.slice(0, beta) + "R" + fixture.source.slice(beta + "beta".length),
    );
    wrapper.unmount();
  });


  it("preserves a later inline rendered word through the final dblclick event", async () => {
    const source = "Before **strong alpha** and `code sample` then ~~strike beta~~ after";
    const wrapper = mountEditor(source);
    await settleUi();
    const target = wrapper.get<HTMLElement>(".cm-rendered-strikethrough");
    const text = firstTextContaining(target.element, "strike beta");
    const renderedOffset = text.data.indexOf("beta") + 1;
    installCaretPosition(text, renderedOffset);
    const point = { x: 420, y: 48 };
    const beta = source.indexOf("beta");
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(beta + 1);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    dispatchPhysicalClick(target.element, point);
    await settleUi();
    const secondTarget = wrapper.get<HTMLElement>(".cm-rendered-strikethrough");
    const secondText = firstTextContaining(secondTarget.element, "strike beta");
    installCaretPosition(secondText, renderedOffset);
    dispatchPhysicalClick(secondTarget.element, point, 2);

    const view = EditorView.findFromDOM(wrapper.get<HTMLElement>(".cm-editor").element);
    if (!view) throw new Error("CodeMirror editor instance not found");
    const finalDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: point.x,
      clientY: point.y,
      detail: 2,
    });
    wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(finalDoubleClick);
    if (!finalDoubleClick.defaultPrevented) {
      const wrongFrom = source.indexOf("~~strike");
      view.dispatch({
        selection: {
          anchor: wrongFrom,
          head: wrongFrom + "~~strike~~".length,
        },
      });
    }
    await settleUi();

    expect(finalDoubleClick.defaultPrevented).toBe(true);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: beta + "beta".length,
    });
    editorHandle(wrapper).insertText("R");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, beta) + "R" + source.slice(beta + "beta".length),
    );
    wrapper.unmount();
  });


  it("cancels a stale native drag before positioning a rendered definition", async () => {
    const source = "Before\n\nTerm\n: Definition alpha beta\n\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();
    const view = EditorView.findFromDOM(wrapper.get<HTMLElement>(".cm-editor").element);
    if (!view) throw new Error("CodeMirror editor instance not found");
    const before = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("Before"));
    expect(before).toBeDefined();
    const beforeText = firstTextContaining(before!.element, "Before");
    installTextGeometry(beforeText);
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(2);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    dispatchMouse(before!.element, "mousedown", { x: 41, y: 48 });
    const pointerState = (view as unknown as {
      inputState: { mouseSelection: { destroy: () => void } | null };
    }).inputState;
    const staleSelection = pointerState.mouseSelection;
    expect(staleSelection).not.toBeNull();
    const destroy = vi.spyOn(staleSelection!, "destroy");

    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionText = firstTextContaining(definition.element, "Definition alpha beta");
    const renderedOffset = definitionText.data.indexOf("beta") + 2;
    installCaretPosition(definitionText, renderedOffset);
    const point = { x: 180, y: 88 };
    dispatchMouse(definition.element, "mousedown", point);

    expect(destroy).toHaveBeenCalledOnce();
    expect(pointerState.mouseSelection).toBeNull();
    dispatchMouse(document, "mouseup", point);
    await settleUi();

    const expected = source.indexOf("beta") + 2;
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: expected,
      head: expected,
    });
    wrapper.unmount();
  });
});

import { EditorView } from "@codemirror/view";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  getViewState: () => { anchor: number; head: number };
}

const mountedWrappers: VueWrapper[] = [];

function mountEditor(source: string) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        extensions: {
          ...defaultEditorSettings.extensions,
          marks: true,
        },
      },
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function editorHandle(wrapper: VueWrapper): EditorHandle {
  return wrapper.vm as unknown as EditorHandle;
}

function firstTextNode(root: Node): Text {
  let node = root;
  while (node.firstChild) node = node.firstChild;
  return node as Text;
}

function mockPointerPosition(node: Node, offset: number) {
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn(() => ({ offsetNode: node, offset })),
  });
}

function dispatchMouse(
  target: EventTarget,
  type: "mousedown" | "mouseup" | "click" | "dblclick" | "mousemove",
  detail: number,
  clientX: number,
  clientY: number,
) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "mousedown" || type === "mousemove" ? 1 : 0,
    clientX,
    clientY,
    detail,
  }));
}

function getDomTextOffset(root: Node, target: Node): number | null {
  let offset = 0;
  let found: number | null = null;
  const visit = (node: Node) => {
    if (found !== null) return;
    if (node === target) {
      found = offset;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(root);
  return found;
}

function mockRenderedLineGeometry() {
  return vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
    const line = this.startContainer.parentElement?.closest(".cm-line");
    const base = line ? getDomTextOffset(line, this.startContainer) : null;
    const left = ((base ?? 0) + this.startOffset) * 10;
    return [{
      bottom: 20,
      height: 20,
      left,
      right: left + 10,
      top: 0,
      width: 10,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }] as unknown as DOMRectList;
  });
}

afterEach(() => {
  while (mountedWrappers.length > 0) mountedWrappers.pop()?.unmount();
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(document, "caretPositionFromPoint");
  Reflect.deleteProperty(document, "caretRangeFromPoint");
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor rendered inline pointer regressions", () => {
  it.each([
    { raw: "**alpha beta**", selector: ".cm-rendered-strong" },
    { raw: "*alpha beta*", selector: ".cm-rendered-emphasis" },
    { raw: "~~alpha beta~~", selector: ".cm-rendered-strikethrough" },
    { raw: "==alpha beta==", selector: ".cm-rendered-highlight" },
  ])("keeps beta selected through the complete physical double-click sequence for $selector", async ({
    raw,
    selector,
  }) => {
    const source = `Before ${raw} after`;
    const alpha = source.indexOf("alpha");
    const beta = source.indexOf("beta");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    let sourceExpanded = false;
    vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation(() => (
      sourceExpanded ? alpha + 1 : beta + 1
    ));

    const firstTarget = wrapper.get<HTMLElement>(selector);
    const firstText = firstTextNode(firstTarget.element);
    mockPointerPosition(firstText, firstTarget.text().indexOf("beta") + 1);
    dispatchMouse(firstTarget.element, "mousedown", 1, 120, 10);
    await settleUi();
    const firstSelection = editorHandle(wrapper).getViewState();
    expect(firstSelection.anchor).toBe(firstSelection.head);
    expect(firstSelection.head).toBeGreaterThanOrEqual(beta);
    expect(firstSelection.head).toBeLessThanOrEqual(beta + "beta".length);

    const firstReleaseTarget = wrapper.get<HTMLElement>(selector);
    dispatchMouse(firstReleaseTarget.element, "mouseup", 1, 120, 10);
    await settleUi();
    dispatchMouse(wrapper.get<HTMLElement>(selector).element, "click", 1, 120, 10);
    await settleUi();
    sourceExpanded = true;

    const secondTarget = wrapper.get<HTMLElement>(selector);
    dispatchMouse(secondTarget.element, "mousedown", 2, 120, 10);
    await settleUi();
    dispatchMouse(wrapper.get<HTMLElement>(selector).element, "mouseup", 2, 120, 10);
    await settleUi();
    dispatchMouse(wrapper.get<HTMLElement>(selector).element, "click", 2, 120, 10);
    await settleUi();
    dispatchMouse(wrapper.get<HTMLElement>(selector).element, "dblclick", 2, 120, 10);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: beta + "beta".length,
    });
  });

  it.each([
    {
      source: "Before **alpha beta** after",
      selector: ".cm-rendered-strong",
    },
    {
      source: "Before [alpha beta](https://example.com) after",
      selector: ".cm-rendered-link",
    },
  ])("uses the pre-mousedown Range geometry for a same-line drag from $selector", async ({
    source,
    selector,
  }) => {
    const beta = source.indexOf("beta");
    const wrapper = mountEditor(source);
    await settleUi();

    vi.spyOn(document, "getSelection").mockReturnValue(null);
    mockRenderedLineGeometry();
    let sourceExpanded = false;
    const fallback = vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation(() => (
      sourceExpanded ? beta + 2 : beta
    ));

    const target = wrapper.get<HTMLElement>(selector);
    const targetText = firstTextNode(target.element);
    const betaInTarget = target.text().indexOf("beta");
    mockPointerPosition(targetText, betaInTarget);
    const betaInLine = wrapper.get<HTMLElement>(".cm-line").text().indexOf("beta");
    const startX = betaInLine * 10 + 1;
    const endX = (betaInLine + "beta".length) * 10 - 1;

    dispatchMouse(target.element, "mousedown", 1, startX, 10);
    await settleUi();
    sourceExpanded = true;
    fallback.mockClear();

    dispatchMouse(document, "mousemove", 1, endX, 10);
    dispatchMouse(document, "mouseup", 1, endX, 10);
    await settleUi();

    expect(fallback).not.toHaveBeenCalledWith({ x: endX, y: 10 });
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: beta + "beta".length,
    });
  });

  it.each([
    { source: "Before `alpha beta` after", selector: ".cm-rendered-inline-code" },
    { source: "Before &amp; after", selector: ".cm-rendered-entity" },
    { source: "Before :smile: after", selector: ".cm-rendered-emoji" },
    {
      source: "Before HTML after\n\n*[HTML]: Hyper Text Markup Language",
      selector: ".cm-rendered-abbreviation",
    },
    { source: "Before [alpha beta](foo bar) after", selector: ".cm-rendered-inline-link" },
    { source: "Before <span>alpha beta</span> after", selector: ".cm-rendered-inline-html" },
  ])("does not request centered scrolling on inline widget mousedown for $selector", async ({
    source,
    selector,
  }) => {
    const scrollIntoView = vi.spyOn(EditorView, "scrollIntoView");
    const wrapper = mountEditor(source);
    await settleUi();
    scrollIntoView.mockClear();

    const target = wrapper.get<HTMLElement>(selector);
    const targetText = firstTextNode(target.element);
    mockPointerPosition(targetText, Math.min(1, targetText.textContent?.length ?? 0));
    dispatchMouse(target.element, "mousedown", 1, 120, 10);

    expect(scrollIntoView.mock.calls.some(([, options]) => options?.y === "center")).toBe(false);
    dispatchMouse(document, "mouseup", 1, 120, 10);
  });
});

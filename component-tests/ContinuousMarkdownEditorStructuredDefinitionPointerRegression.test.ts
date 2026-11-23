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

interface TextGeometry {
  left: number;
  top: number;
  charWidth: number;
  height: number;
}

interface PointerCandidate {
  node: Text;
  offset: number;
  point: Point;
}

interface StructuredFieldFixture {
  name: string;
  source: string;
  selector: string;
  renderedText: string;
  clickedWord: string;
  clickedWordOffset: number;
  sourceWordFrom: number;
  rawLineText: string;
}

const mountedWrappers: VueWrapper[] = [];
const originalCaretPositionFromPoint = Object.getOwnPropertyDescriptor(
  document,
  "caretPositionFromPoint",
);
const originalCaretRangeFromPoint = Object.getOwnPropertyDescriptor(
  document,
  "caretRangeFromPoint",
);
const originalElementFromPoint = Object.getOwnPropertyDescriptor(document, "elementFromPoint");

const referenceSource = [
  "Before",
  "",
  '[Docs Label]: <https://example.com/docs path> "Guide title"',
  "",
  "After",
].join("\n");
const footnoteSource = [
  "Use[^Note].",
  "",
  "[^Note]: First **alpha beta** and [gamma delta](https://example.com).",
].join("\n");

const structuredFieldFixtures: StructuredFieldFixture[] = [
  {
    name: "reference label",
    source: referenceSource,
    selector: ".cm-reference-definition-name",
    renderedText: "Docs Label",
    clickedWord: "Label",
    clickedWordOffset: 2,
    sourceWordFrom: referenceSource.indexOf("Label"),
    rawLineText: "[Docs Label]:",
  },
  {
    name: "reference URL",
    source: referenceSource,
    selector: ".cm-reference-definition-url",
    renderedText: "https://example.com/docs path",
    clickedWord: "docs",
    clickedWordOffset: 2,
    sourceWordFrom: referenceSource.indexOf("docs path"),
    rawLineText: "[Docs Label]:",
  },
  {
    name: "reference title",
    source: referenceSource,
    selector: ".cm-reference-definition-title",
    renderedText: "Guide title",
    clickedWord: "title",
    clickedWordOffset: 2,
    sourceWordFrom: referenceSource.indexOf("title"),
    rawLineText: "[Docs Label]:",
  },
  {
    name: "footnote label",
    source: footnoteSource,
    selector: ".cm-footnote-definition-label",
    renderedText: "Note",
    clickedWord: "Note",
    clickedWordOffset: 2,
    sourceWordFrom: footnoteSource.lastIndexOf("Note"),
    rawLineText: "[^Note]:",
  },
  {
    name: "footnote content",
    source: footnoteSource,
    selector: ".cm-footnote-definition-content strong",
    renderedText: "alpha beta",
    clickedWord: "beta",
    clickedWordOffset: 2,
    sourceWordFrom: footnoteSource.indexOf("beta"),
    rawLineText: "[^Note]:",
  },
];

function mountEditor(source: string) {
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

function installRangeGeometry(entries: Array<{ node: Text; geometry: TextGeometry }>) {
  const geometries = new Map(entries.map(({ node, geometry }) => [node, geometry]));
  const measure = function (this: Range) {
    if (this.startContainer.nodeType !== Node.TEXT_NODE) return domRect(0, 0, 0, 0);
    const geometry = geometries.get(this.startContainer as Text);
    if (!geometry) return domRect(0, 0, 0, 0);
    return domRect(
      geometry.left + this.startOffset * geometry.charWidth,
      geometry.top,
      Math.max(
        geometry.charWidth,
        (this.endOffset - this.startOffset) * geometry.charWidth,
      ),
      geometry.height,
    );
  };
  vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(measure);
  vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
    return [measure.call(this)] as unknown as DOMRectList;
  });
}

function pointAt(node: Text, offset: number): Point {
  const range = document.createRange();
  range.setStart(node, offset);
  range.setEnd(node, Math.min(node.length, offset + 1));
  const rectangle = range.getBoundingClientRect();
  return {
    x: rectangle.left + 1,
    y: rectangle.top + rectangle.height / 2,
  };
}

function installPointerCandidates(candidates: PointerCandidate[]) {
  const resolve = (x: number, y: number) => {
    let closest: { candidate: PointerCandidate; distance: number } | null = null;
    for (const candidate of candidates) {
      const distance = (candidate.point.x - x) ** 2 + (candidate.point.y - y) ** 2;
      if (!closest || distance < closest.distance) closest = { candidate, distance };
    }
    return closest?.candidate ?? null;
  };
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn((x: number, y: number) => {
      const candidate = resolve(x, y);
      return candidate
        ? { offsetNode: candidate.node, offset: candidate.offset }
        : null;
    }),
  });
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: vi.fn((x: number, y: number) => {
      const candidate = resolve(x, y);
      return candidate
        ? { startContainer: candidate.node, startOffset: candidate.offset }
        : null;
    }),
  });
}

function installEditorPositionResolver(resolve: (point: Point) => number) {
  vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation((point) => resolve(point));
  vi.spyOn(EditorView.prototype, "posAndSideAtCoords").mockImplementation((point) => ({
    pos: resolve(point),
    assoc: 1,
  }));
}

function dispatchMouse(
  target: EventTarget,
  type: "mousedown" | "mouseup" | "click" | "dblclick" | "mousemove",
  point: Point,
  detail: number,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "mousedown" || type === "mousemove" ? 1 : 0,
    clientX: point.x,
    clientY: point.y,
    detail,
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchPhysicalClick(target: Element, point: Point, detail: number) {
  dispatchMouse(target, "mousedown", point, detail);
  dispatchMouse(document, "mouseup", point, detail);
  dispatchMouse(target, "click", point, detail);
}

function restoreDocumentProperty(name: "caretPositionFromPoint" | "caretRangeFromPoint" | "elementFromPoint") {
  const descriptor = name === "caretPositionFromPoint"
    ? originalCaretPositionFromPoint
    : name === "caretRangeFromPoint"
      ? originalCaretRangeFromPoint
      : originalElementFromPoint;
  if (descriptor) {
    Object.defineProperty(document, name, descriptor);
  } else {
    Reflect.deleteProperty(document, name);
  }
}

afterEach(() => {
  while (mountedWrappers.length > 0) mountedWrappers.pop()?.unmount();
  document.getSelection()?.removeAllRanges();
  restoreDocumentProperty("caretPositionFromPoint");
  restoreDocumentProperty("caretRangeFromPoint");
  restoreDocumentProperty("elementFromPoint");
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor structured definition pointer regressions", () => {
  it.each(structuredFieldFixtures)(
    "places the first $name click at the rendered character and types there",
    async (fixture) => {
      const wrapper = mountEditor(fixture.source);
      await settleUi();
      const target = wrapper.get<HTMLElement>(fixture.selector);
      const text = firstTextContaining(target.element, fixture.renderedText);
      const renderedOffset = text.data.indexOf(fixture.clickedWord)
        + fixture.clickedWordOffset;
      const expected = fixture.sourceWordFrom + fixture.clickedWordOffset;
      installRangeGeometry([{
        node: text,
        geometry: { left: 40, top: 80, charWidth: 8, height: 16 },
      }]);
      const point = pointAt(text, renderedOffset);
      installPointerCandidates([{ node: text, offset: renderedOffset, point }]);
      installEditorPositionResolver(() => expected);

      dispatchPhysicalClick(target.element, point, 1);
      await settleUi();

      expect(editorHandle(wrapper).getViewState()).toMatchObject({
        anchor: expected,
        head: expected,
      });
      editorHandle(wrapper).insertText("X");
      await settleUi();
      expect(latestSource(wrapper, fixture.source)).toBe(
        fixture.source.slice(0, expected) + "X" + fixture.source.slice(expected),
      );
    },
  );

  it.each(structuredFieldFixtures)(
    "selects the $name word through both clicks and the final dblclick",
    async (fixture) => {
      const wrapper = mountEditor(fixture.source);
      await settleUi();
      vi.spyOn(document, "getSelection").mockReturnValue(null);
      const target = wrapper.get<HTMLElement>(fixture.selector);
      const text = firstTextContaining(target.element, fixture.renderedText);
      const renderedOffset = text.data.indexOf(fixture.clickedWord)
        + fixture.clickedWordOffset;
      const clicked = fixture.sourceWordFrom + fixture.clickedWordOffset;
      installRangeGeometry([{
        node: text,
        geometry: { left: 40, top: 80, charWidth: 8, height: 16 },
      }]);
      const point = pointAt(text, renderedOffset);
      installPointerCandidates([{ node: text, offset: renderedOffset, point }]);
      installEditorPositionResolver(() => clicked);

      dispatchPhysicalClick(target.element, point, 1);
      await settleUi();
      const rawLine = wrapper.findAll<HTMLElement>(".cm-line")
        .find((line) => line.text().includes(fixture.rawLineText));
      expect(rawLine).toBeDefined();

      dispatchPhysicalClick(rawLine!.element, point, 2);
      await settleUi();
      const liveRawLine = wrapper.findAll<HTMLElement>(".cm-line")
        .find((line) => line.text().includes(fixture.rawLineText));
      expect(liveRawLine).toBeDefined();
      const finalDoubleClick = dispatchMouse(
        liveRawLine!.element,
        "dblclick",
        point,
        2,
      );
      await settleUi();

      expect(finalDoubleClick.defaultPrevented).toBe(true);
      expect(editorHandle(wrapper).getViewState()).toMatchObject({
        anchor: fixture.sourceWordFrom,
        head: fixture.sourceWordFrom + fixture.clickedWord.length,
      });
      editorHandle(wrapper).insertText("R");
      await settleUi();
      expect(latestSource(wrapper, fixture.source)).toBe(
        fixture.source.slice(0, fixture.sourceWordFrom)
          + "R"
          + fixture.source.slice(fixture.sourceWordFrom + fixture.clickedWord.length),
      );
    },
  );

  it("drags across rendered rich footnote content and replaces the precise source range", async () => {
    const wrapper = mountEditor(footnoteSource);
    await settleUi();
    const startTarget = wrapper.get<HTMLElement>(".cm-footnote-definition-content strong");
    const endTarget = wrapper.get<HTMLElement>(".cm-footnote-definition-content a");
    const startNode = firstTextContaining(startTarget.element, "alpha beta");
    const endNode = firstTextContaining(endTarget.element, "gamma delta");
    installRangeGeometry([
      {
        node: startNode,
        geometry: { left: 40, top: 80, charWidth: 8, height: 16 },
      },
      {
        node: endNode,
        geometry: { left: 180, top: 80, charWidth: 8, height: 16 },
      },
    ]);
    const startOffset = startNode.data.indexOf("alpha") + 1;
    const endOffset = endNode.data.indexOf("delta") + 2;
    const startPoint = pointAt(startNode, startOffset);
    const endPoint = pointAt(endNode, endOffset);
    installPointerCandidates([
      { node: startNode, offset: startOffset, point: startPoint },
      { node: endNode, offset: endOffset, point: endPoint },
    ]);
    const anchor = footnoteSource.indexOf("alpha") + 1;
    const head = footnoteSource.indexOf("delta") + 2;
    installEditorPositionResolver(({ x }) => (x < 160 ? anchor : head));
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn((x: number) => (
        x < 160 ? startTarget.element : endTarget.element
      )),
    });

    dispatchMouse(startTarget.element, "mousedown", startPoint, 1);
    await settleUi();
    dispatchMouse(document, "mousemove", endPoint, 1);
    dispatchMouse(document, "mouseup", endPoint, 1);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });
    editorHandle(wrapper).insertText("R");
    await settleUi();
    expect(latestSource(wrapper, footnoteSource)).toBe(
      footnoteSource.slice(0, anchor) + "R" + footnoteSource.slice(head),
    );
  });

  it("places a complete click at an empty footnote content position and types there", async () => {
    const source = "Before\n\n[^empty]: ";
    const wrapper = mountEditor(source);
    await settleUi();
    const target = wrapper.get<HTMLElement>(".cm-footnote-definition-content-empty");
    const text = firstTextContaining(target.element, "\u200b");
    installRangeGeometry([{
      node: text,
      geometry: { left: 40, top: 80, charWidth: 8, height: 16 },
    }]);
    const point = pointAt(text, 0);
    installPointerCandidates([{ node: text, offset: 0, point }]);
    installEditorPositionResolver(() => source.length);

    dispatchPhysicalClick(target.element, point, 1);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.length,
      head: source.length,
    });
    editorHandle(wrapper).insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(source + "X");
  });

  it("uses the second mousedown word when double-click coordinates cross a word boundary", async () => {
    const source = "alpha beta gamma";
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    const line = wrapper.get<HTMLElement>(".cm-line");
    const text = firstTextContaining(line.element, source);
    installRangeGeometry([{
      node: text,
      geometry: { left: 40, top: 40, charWidth: 10, height: 20 },
    }]);
    const alphaPoint = pointAt(text, source.indexOf("alpha") + 4);
    const betaPoint = pointAt(text, source.indexOf("beta") + 1);
    const alphaPosition = source.indexOf("alpha") + 4;
    const betaPosition = source.indexOf("beta") + 1;
    installPointerCandidates([
      { node: text, offset: alphaPosition, point: alphaPoint },
      { node: text, offset: betaPosition, point: betaPoint },
    ]);
    installEditorPositionResolver(({ x }) => (
      x < betaPoint.x ? alphaPosition : betaPosition
    ));

    dispatchPhysicalClick(line.element, alphaPoint, 1);
    dispatchPhysicalClick(line.element, betaPoint, 2);
    const finalDoubleClick = dispatchMouse(line.element, "dblclick", betaPoint, 2);
    await settleUi();

    const beta = source.indexOf("beta");
    expect(finalDoubleClick.defaultPrevented).toBe(true);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: beta + "beta".length,
    });
    editorHandle(wrapper).insertText("R");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe("alpha R gamma");
  });
});

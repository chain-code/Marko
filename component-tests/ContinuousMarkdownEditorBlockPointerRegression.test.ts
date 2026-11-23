import { EditorView } from "@codemirror/view";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  getViewState: () => { anchor: number; head: number };
  insertText: (text: string) => void;
  selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
}

interface Point {
  x: number;
  y: number;
}

interface TextGeometry {
  left: number;
  top: number;
  charWidth?: number;
  height?: number;
}

interface CaretCandidate {
  node: Text;
  offset: number;
  point: Point;
}

function mountEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      settings: {
        ...defaultEditorSettings,
        extensions: { ...defaultEditorSettings.extensions, html: true },
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

function firstTextContaining(root: Element, text: string): Text {
  const visit = (node: Node): Text | null => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes(text)) {
      return node as Text;
    }
    for (const child of Array.from(node.childNodes)) {
      const match = visit(child);
      if (match) return match;
    }
    return null;
  };
  const result = visit(root);
  if (!result) throw new Error(`未找到文本节点：${text}`);
  return result;
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

function installRangeGeometry(resolve: (node: Text) => TextGeometry | null) {
  const measure = function (this: Range) {
    if (this.startContainer.nodeType !== Node.TEXT_NODE) return domRect(0, 0, 0, 0);
    const node = this.startContainer as Text;
    const geometry = resolve(node);
    if (!geometry) return domRect(0, 0, 0, 0);
    const charWidth = geometry.charWidth ?? 8;
    const height = geometry.height ?? 16;
    const width = Math.max(charWidth, (this.endOffset - this.startOffset) * charWidth);
    return domRect(
      geometry.left + this.startOffset * charWidth,
      geometry.top,
      width,
      height,
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
  return { x: rectangle.left + 1, y: rectangle.top + rectangle.height / 2 };
}

function installCaretCandidates(candidates: CaretCandidate[]) {
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn((x: number, y: number) => {
      let closest: { candidate: CaretCandidate; distance: number } | null = null;
      for (const candidate of candidates) {
        const distance = (candidate.point.x - x) ** 2 + (candidate.point.y - y) ** 2;
        if (!closest || distance < closest.distance) closest = { candidate, distance };
      }
      return closest
        ? { offsetNode: closest.candidate.node, offset: closest.candidate.offset }
        : null;
    }),
  });
}

function installRawDocumentGeometry(top = 40, left = 40) {
  const lineHeight = 20;
  const charWidth = 8;
  return vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation(function (this: EditorView, { x, y }) {
    if (y < top) return 0;
    if (y >= top + this.state.doc.lines * lineHeight) return this.state.doc.length;
    const lineNumber = Math.max(
      1,
      Math.min(this.state.doc.lines, Math.floor((y - top) / lineHeight) + 1),
    );
    const line = this.state.doc.line(lineNumber);
    const column = Math.max(0, Math.min(line.length, Math.floor((x - left) / charWidth)));
    return line.from + column;
  });
}

function dispatchMouseDown(target: Element, detail: number, point: Point) {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: point.x,
    clientY: point.y,
    detail,
  }));
}

function dispatchMouseUp(target: EventTarget, detail: number, point: Point) {
  target.dispatchEvent(new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
    detail,
  }));
}

function dispatchClick(target: Element, detail: number, point: Point) {
  target.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
    detail,
  }));
}

function dispatchPhysicalClick(target: Element, detail: number, point: Point) {
  dispatchMouseDown(target, detail, point);
  dispatchMouseUp(document, detail, point);
  dispatchClick(target, detail, point);
}

function dispatchPhysicalDrag(start: Element, end: Element, from: Point, to: Point) {
  dispatchMouseDown(start, 1, from);
  end.dispatchEvent(new MouseEvent("mousemove", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: to.x,
    clientY: to.y,
  }));
  dispatchMouseUp(end, 1, to);
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(document, "caretPositionFromPoint");
  Reflect.deleteProperty(document, "elementFromPoint");
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor 块级指针物理回归", () => {
  it.each([
    {
      name: "HTML",
      source: "Before\n\n<div><strong>HTML alpha beta</strong></div>\n\nAfter",
      selector: ".cm-special-preview-html strong",
      renderedText: "HTML alpha beta",
      renderedTop: 122,
    },
    {
      name: "definition",
      source: "Before\n\nTerm\n: Definition alpha beta\n\nAfter",
      selector: ".cm-special-preview-definition dd",
      renderedText: "Definition alpha beta",
      renderedTop: 142,
    },
  ])("$name 完整物理双击在源码展开错位后仍选择原可见单词", async (fixture) => {
    const wrapper = mountEditor(fixture.source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});
    const preview = wrapper.get<HTMLElement>(fixture.selector);
    const renderedNode = firstTextContaining(preview.element, "beta");
    installRangeGeometry((node) => (
      node === renderedNode
        ? { left: 60, top: fixture.renderedTop }
        : null
    ));
    const renderedOffset = renderedNode.data.indexOf("beta") + 1;
    const originalPoint = pointAt(renderedNode, renderedOffset);
    installCaretCandidates([{ node: renderedNode, offset: renderedOffset, point: originalPoint }]);
    installRawDocumentGeometry();

    dispatchPhysicalClick(preview.element, 1, originalPoint);
    await settleUi();
    expect(wrapper.find(fixture.selector).exists()).toBe(false);

    const rawLines = wrapper.findAll<HTMLElement>(".cm-line");
    const rawLineNumber = Math.max(
      1,
      Math.min(rawLines.length, Math.floor((originalPoint.y - 40) / 20) + 1),
    );
    const secondTarget = rawLines[rawLineNumber - 1]!;
    dispatchPhysicalClick(secondTarget.element, 2, originalPoint);
    await settleUi();

    editorHandle(wrapper).insertText("Z");
    await settleUi();
    const beta = fixture.source.indexOf("beta");
    expect(latestSource(wrapper, fixture.source)).toBe(
      fixture.source.slice(0, beta) + "Z" + fixture.source.slice(beta + "beta".length),
    );
    wrapper.unmount();
  });

  it.each([
    {
      name: "code",
      source: [
        "Before alpha",
        "",
        "```text",
        "code alpha beta",
        "```",
        "",
        "After",
      ].join("\n"),
      selector: ".cm-special-preview-code code",
      renderedText: "code alpha beta",
      widgetTop: 80,
      blockMarker: "```text",
    },
    {
      name: "HTML",
      source: "Before alpha\n\n<div>HTML alpha beta</div>\n\nAfter",
      selector: ".cm-special-preview-html div",
      renderedText: "HTML alpha beta",
      widgetTop: 80,
      blockMarker: "<div>",
    },
    {
      name: "definition",
      source: "Before alpha\n\nTerm\n: Definition alpha beta\n\nAfter",
      selector: ".cm-special-preview-definition dd",
      renderedText: "Definition alpha beta",
      widgetTop: 80,
      blockMarker: "Term",
    },
  ])("普通正文物理拖入 $name 时定位到 Widget 内部字符", async (fixture) => {
    const wrapper = mountEditor(fixture.source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});
    const before = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("Before alpha"));
    expect(before).toBeDefined();
    const beforeNode = firstTextContaining(before!.element, "Before alpha");
    const preview = wrapper.get<HTMLElement>(fixture.selector);
    const renderedNode = firstTextContaining(preview.element, "beta");
    installRangeGeometry((node) => {
      if (node === beforeNode) return { left: 40, top: 40 };
      if (node === renderedNode) return { left: 60, top: fixture.widgetTop };
      return null;
    });
    const beforeOffset = beforeNode.data.indexOf("alpha") + 1;
    const renderedOffset = renderedNode.data.indexOf("beta") + 2;
    const startPoint = pointAt(beforeNode, beforeOffset);
    const endPoint = pointAt(renderedNode, renderedOffset);
    installCaretCandidates([
      { node: beforeNode, offset: beforeOffset, point: startPoint },
      { node: renderedNode, offset: renderedOffset, point: endPoint },
    ]);
    const blockFrom = fixture.source.indexOf(fixture.blockMarker);
    vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation(function (this: EditorView, { x, y }) {
      if (y >= fixture.widgetTop && y <= fixture.widgetTop + 40) return blockFrom;
      const line = this.state.doc.line(1);
      return line.from + Math.max(0, Math.min(line.length, Math.floor((x - 40) / 8)));
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn((x: number, y: number) => (
        y >= fixture.widgetTop && y <= fixture.widgetTop + 40
          ? preview.element
          : before!.element
      )),
    });
    await editorHandle(wrapper).selectRange(fixture.source.length, fixture.source.length, false);

    dispatchPhysicalDrag(before!.element, preview.element, startPoint, endPoint);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: fixture.source.indexOf("alpha") + 1,
      head: fixture.source.indexOf("beta") + 2,
    });
    wrapper.unmount();
  });

  it.each([
    {
      name: "code",
      source: [
        "Before",
        "",
        "```text",
        "code alpha beta",
        "```",
        "",
        "After charlie delta",
      ].join("\n"),
      selector: ".cm-special-preview-code code",
      renderedText: "code alpha beta",
      widgetTop: 80,
      afterTop: 200,
    },
    {
      name: "HTML",
      source: "Before\n\n<div>HTML alpha beta</div>\n\nAfter charlie delta",
      selector: ".cm-special-preview-html div",
      renderedText: "HTML alpha beta",
      widgetTop: 80,
      afterTop: 170,
    },
    {
      name: "definition",
      source: "Before\n\nTerm\n: Definition alpha beta\n\nAfter charlie delta",
      selector: ".cm-special-preview-definition dd",
      renderedText: "Definition alpha beta",
      widgetTop: 80,
      afterTop: 170,
    },
  ])("从 $name 物理拖向后文时沿用展开前坐标快照", async (fixture) => {
    const wrapper = mountEditor(fixture.source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});
    const preview = wrapper.get<HTMLElement>(fixture.selector);
    const renderedNode = firstTextContaining(preview.element, "beta");
    const after = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("After charlie delta"));
    expect(after).toBeDefined();
    const afterNode = firstTextContaining(after!.element, "After charlie delta");
    installRangeGeometry((node) => {
      if (node === renderedNode) return { left: 60, top: fixture.widgetTop };
      if (node.data.includes("After charlie delta")) {
        return {
          left: 40,
          top: document.querySelector(fixture.selector)
            ? fixture.afterTop
            : fixture.afterTop - 40,
        };
      }
      return null;
    });
    const renderedOffset = renderedNode.data.indexOf("beta") + 1;
    const afterOffset = afterNode.data.indexOf("charlie") + 3;
    const startPoint = pointAt(renderedNode, renderedOffset);
    const endPoint = pointAt(afterNode, afterOffset);
    installCaretCandidates([
      { node: renderedNode, offset: renderedOffset, point: startPoint },
      { node: afterNode, offset: afterOffset, point: endPoint },
    ]);
    installRawDocumentGeometry();

    dispatchMouseDown(preview.element, 1, startPoint);
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: endPoint.x,
      clientY: endPoint.y,
    }));
    dispatchMouseUp(document, 1, endPoint);
    await settleUi();

    const anchor = fixture.source.indexOf("beta") + 1;
    const head = fixture.source.indexOf("charlie") + 3;
    expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });
    editorHandle(wrapper).insertText("R");
    await settleUi();
    expect(latestSource(wrapper, fixture.source)).toBe(
      fixture.source.slice(0, anchor) + "R" + fixture.source.slice(head),
    );
    wrapper.unmount();
  });

  it("定义列表展开后的 mouseup 仍精确落到定义字符", async () => {
    const source = [
      "Before origin",
      "",
      "Term",
      ": Definition alpha beta",
      "",
      "After",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const before = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("Before origin"));
    expect(before).toBeDefined();
    const beforeNode = firstTextContaining(before!.element, "Before origin");
    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionNode = firstTextContaining(definition.element, "Definition alpha beta");
    let definitionMeasurements = 0;
    installRangeGeometry((node) => {
      if (node === beforeNode) return { left: 40, top: 40 };
      if (node === definitionNode) {
        definitionMeasurements += 1;
        return {
          left: definitionMeasurements <= definitionNode.length ? -400 : 60,
          top: 80,
        };
      }
      return null;
    });
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(0);

    let hitTarget: Element = definition.element;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => hitTarget),
    });
    const anchorOffset = beforeNode.data.indexOf("origin") + 2;
    dispatchMouseDown(before!.element, 1, pointAt(beforeNode, anchorOffset));
    const definitionOffset = definitionNode.data.indexOf("beta") + 2;
    const definitionPoint = {
      x: 60 + definitionOffset * 8 + 1,
      y: 88,
    };
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: definitionPoint.x,
      clientY: definitionPoint.y,
    }));
    await settleUi();

    const rawDefinitionLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes(": Definition alpha beta"));
    expect(rawDefinitionLine).toBeDefined();
    hitTarget = rawDefinitionLine!.element;
    dispatchMouseUp(document, 1, definitionPoint);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("origin") + 2,
      head: source.indexOf("beta") + 2,
    });
    wrapper.unmount();
  });

  it("从定义列表拖向后文时按展开后的当前坐标进入正文", async () => {
    const source = [
      "Before",
      "",
      "Term",
      ": Definition alpha beta",
      "",
      "After definition charlie delta",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionNode = firstTextContaining(definition.element, "Definition alpha beta");
    const after = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("After definition charlie delta"));
    expect(after).toBeDefined();
    const afterNode = firstTextContaining(after!.element, "After definition charlie delta");

    let liveAfterNode: Text | null = null;
    installRangeGeometry((node) => {
      if (node === definitionNode) return { left: 60, top: 80 };
      if (node === afterNode || node === liveAfterNode) {
        return {
          left: 40,
          top: document.querySelector(".cm-special-preview-definition") ? 180 : 120,
        };
      }
      return null;
    });
    const definitionOffset = definitionNode.data.indexOf("beta") + 2;
    const startPoint = pointAt(definitionNode, definitionOffset);
    installCaretCandidates([{ node: definitionNode, offset: definitionOffset, point: startPoint }]);
    installRawDocumentGeometry();
    const afterFrom = source.indexOf("After definition charlie delta");
    const originalPosAtDom = EditorView.prototype.posAtDOM;
    let liveAfter: HTMLElement | null = null;
    vi.spyOn(EditorView.prototype, "posAtDOM").mockImplementation(function (
      this: EditorView,
      node: Node,
      offset = 0,
    ) {
      if (node === after!.element || node === liveAfter) return afterFrom;
      if (node === afterNode || node === liveAfterNode) return afterFrom + offset;
      return originalPosAtDom.call(this, node, offset);
    });

    let hitTarget: Element = definition.element;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => hitTarget),
    });
    dispatchMouseDown(definition.element, 1, startPoint);
    await settleUi();
    liveAfter = document.createElement("div");
    liveAfter.className = "cm-line";
    liveAfterNode = document.createTextNode("After definition charlie delta");
    liveAfter.append(liveAfterNode);
    document.body.append(liveAfter);

    const afterOffset = liveAfterNode.data.indexOf("charlie") + 3;
    const endPoint = pointAt(liveAfterNode, afterOffset);
    hitTarget = liveAfter;
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: endPoint.x,
      clientY: endPoint.y,
    }));
    dispatchMouseUp(document, 1, endPoint);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("beta") + 2,
      head: source.indexOf("charlie") + 3,
    });
    wrapper.unmount();
    liveAfter.remove();
  });

  it("从后文反向拖入定义列表时沿用块级快照并保留精确端点", async () => {
    const source = [
      "Before",
      "",
      "Term",
      ": Definition alpha beta",
      "",
      "After definition charlie delta",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    const after = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("After definition charlie delta"));
    expect(after).toBeDefined();
    const afterNode = firstTextContaining(after!.element, "After definition charlie delta");
    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionNode = firstTextContaining(definition.element, "Definition alpha beta");
    installRangeGeometry((node) => {
      if (node === afterNode) return { left: 40, top: 180 };
      if (node === definitionNode) return { left: 60, top: 80 };
      return null;
    });
    const anchorOffset = afterNode.data.indexOf("charlie") + 3;
    const definitionOffset = definitionNode.data.indexOf("beta") + 2;
    const startPoint = pointAt(afterNode, anchorOffset);
    const definitionPoint = pointAt(definitionNode, definitionOffset);
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(
      source.indexOf("charlie") + 3,
    );

    let hitTarget: Element = after!.element;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => hitTarget),
    });
    dispatchMouseDown(after!.element, 1, startPoint);
    hitTarget = definition.element;
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: definitionPoint.x,
      clientY: definitionPoint.y,
    }));
    await settleUi();
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("charlie") + 3,
      head: source.indexOf("beta") + 2,
    });

    const rawDefinitionLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes(": Definition alpha beta"));
    expect(rawDefinitionLine).toBeDefined();
    hitTarget = rawDefinitionLine!.element;
    dispatchMouseUp(document, 1, definitionPoint);
    await settleUi();

    const anchor = source.indexOf("charlie") + 3;
    const head = source.indexOf("beta") + 2;
    expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });
    expect(source.slice(head, anchor)).toBe("ta\n\nAfter definition cha");
    wrapper.unmount();
  });

  it("跨 code、HTML 和 definition Widget 拖选时逐块保留精确字符端点", async () => {
    const source = [
      "Before",
      "~~~text",
      "code alpha beta",
      "~~~",
      "<pre>HTML alpha beta</pre>",
      "Term",
      ": Definition alpha beta",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});
    const view = EditorView.findFromDOM(wrapper.get<HTMLElement>(".cm-editor").element);
    if (!view) throw new Error("未找到 CodeMirror 编辑器实例");
    Object.defineProperties(view.scrollDOM, {
      clientHeight: { configurable: true, value: 5000 },
      clientWidth: { configurable: true, value: 1000 },
    });
    vi.spyOn(view.scrollDOM, "getBoundingClientRect").mockReturnValue(
      domRect(0, 0, 1000, 5000),
    );
    view.requestMeasure();
    await settleUi();


    const code = wrapper.get<HTMLElement>(".cm-special-preview-code code");
    const codeNode = firstTextContaining(code.element, "code alpha beta");
    const html = wrapper.get<HTMLElement>(".cm-special-preview-html pre");
    const htmlNode = firstTextContaining(html.element, "HTML alpha beta");
    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionNode = firstTextContaining(definition.element, "Definition alpha beta");
    installRangeGeometry((node) => {
      if (node.data.includes("code alpha beta")) return { left: 40, top: 80 };
      if (node.data.includes("HTML alpha beta")) {
        return {
          left: 60,
          top: document.querySelector(".cm-special-preview-code") ? 200 : 120,
        };
      }
      if (node.data.includes("Definition alpha beta")) {
        const codeVisible = Boolean(document.querySelector(".cm-special-preview-code"));
        const htmlVisible = Boolean(document.querySelector(".cm-special-preview-html"));
        return {
          left: 80,
          top: codeVisible ? 320 : htmlVisible ? 240 : 140,
        };
      }
      return null;
    });
    const codeOffset = codeNode.data.indexOf("beta") + 2;
    const startPoint = pointAt(codeNode, codeOffset);
    const htmlOffset = htmlNode.data.indexOf("beta") + 2;
    const htmlPoint = pointAt(htmlNode, htmlOffset);
    const definitionOffset = definitionNode.data.indexOf("beta") + 2;
    const definitionPoint = pointAt(definitionNode, definitionOffset);
    installCaretCandidates([{ node: codeNode, offset: codeOffset, point: startPoint }]);
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(0);

    let hitTarget: Element = code.element;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => hitTarget),
    });
    dispatchMouseDown(code.element, 1, startPoint);

    hitTarget = html.element;
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: htmlPoint.x,
      clientY: htmlPoint.y,
    }));
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("beta") + 2,
      head: source.indexOf("beta", source.indexOf("HTML")) + 2,
    });

    hitTarget = definition.element;
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: definitionPoint.x,
      clientY: definitionPoint.y,
    }));

    const rawDefinitionLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes(": Definition alpha beta"));
    expect(rawDefinitionLine).toBeDefined();
    hitTarget = rawDefinitionLine!.element;
    dispatchMouseUp(document, 1, definitionPoint);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("beta") + 2,
      head: source.lastIndexOf("beta") + 2,
    });
    wrapper.unmount();
  });
});

import { EditorView } from "@codemirror/view";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  getViewState: () => { anchor: number; head: number };
}

interface TextGeometry {
  left: number;
  top: number;
  charWidth?: number;
  height?: number;
}

interface PointerSelection {
  anchor: number;
  head: number;
}

interface NativePointerState {
  draggedContent: unknown;
  mouseSelection: { destroy: () => void } | null;
}

const mountedWrappers = new Set<VueWrapper>();

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
          html: true,
        },
      },
    },
  });
  mountedWrappers.add(wrapper);
  return wrapper;
}

function unmountEditor(wrapper: VueWrapper) {
  wrapper.unmount();
  mountedWrappers.delete(wrapper);
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function editorHandle(wrapper: VueWrapper): EditorHandle {
  return wrapper.vm as unknown as EditorHandle;
}

function editorView(wrapper: VueWrapper): EditorView {
  const view = EditorView.findFromDOM(wrapper.get<HTMLElement>(".cm-editor").element);
  if (!view) throw new Error("未找到 CodeMirror 编辑器实例");
  return view;
}

function nativePointerState(view: EditorView): NativePointerState {
  return (view as unknown as { inputState: NativePointerState }).inputState;
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
  throw new Error(`未找到文本节点：${value}`);
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
  const measure = function (range: Range): DOMRect | null {
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const geometry = resolve(range.startContainer as Text);
    if (!geometry) return null;
    const charWidth = geometry.charWidth ?? 10;
    const height = geometry.height ?? 16;
    return domRect(
      geometry.left + range.startOffset * charWidth,
      geometry.top,
      Math.max(charWidth, (range.endOffset - range.startOffset) * charWidth),
      height,
    );
  };
  vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
    const rectangle = measure(this);
    return (rectangle ? [rectangle] : []) as unknown as DOMRectList;
  });
  vi.spyOn(Range.prototype, "getBoundingClientRect").mockImplementation(function (this: Range) {
    return measure(this) ?? domRect(0, 0, 0, 0);
  });
}

function installCaretPosition(node: Text, offset: number) {
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn(() => ({ offsetNode: node, offset })),
  });
}

function dispatchMouse(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup",
  clientX: number,
  clientY: number,
) {
  target.dispatchEvent(new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: type === "mouseup" ? 0 : 1,
    clientX,
    clientY,
    detail: 1,
  }));
}

function pointerSelections(
  calls: readonly (readonly unknown[])[],
): PointerSelection[] {
  const selections: PointerSelection[] = [];
  for (const [argument] of calls) {
    if (!argument || typeof argument !== "object" || !("selection" in argument)) continue;
    const selection = (argument as { selection?: unknown }).selection;
    if (!selection || typeof selection !== "object") continue;
    const anchor = (selection as { anchor?: unknown }).anchor;
    const head = (selection as { head?: unknown }).head;
    if (typeof anchor === "number" && typeof head === "number") {
      selections.push({ anchor, head });
    }
  }
  return selections;
}

function preparePlainLine(wrapper: VueWrapper, source: string) {
  const line = wrapper.get<HTMLElement>(".cm-line");
  const text = firstTextContaining(line.element, source);
  installRangeGeometry((node) => (
    node === text ? { left: 0, top: 0 } : null
  ));
  vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation(({ x }) => (
    Math.max(0, Math.min(source.length, Math.floor(x / 10)))
  ));
  return line;
}

afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
  for (const wrapper of mountedWrappers) wrapper.unmount();
  mountedWrappers.clear();
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(document, "caretPositionFromPoint");
  Reflect.deleteProperty(document, "caretRangeFromPoint");
  Reflect.deleteProperty(document, "elementFromPoint");
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor 指针输入竞态回归", () => {
  it("mousemove 目标仍是起始行时按 elementFromPoint 命中的代码字符结束拖选", async () => {
    const source = [
      "Before origin",
      "",
      "```text",
      "code target value",
      "```",
      "",
      "After",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const startLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("Before origin"));
    expect(startLine).toBeDefined();
    const startNode = firstTextContaining(startLine!.element, "Before origin");
    const code = wrapper.get<HTMLElement>(".cm-special-preview-code code");
    const codeNode = firstTextContaining(code.element, "code target value");
    installRangeGeometry((node) => {
      if (node === startNode) return { left: 40, top: 40, charWidth: 8 };
      if (node === codeNode) return { left: 60, top: 80, charWidth: 8 };
      return null;
    });
    vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation(function (this: EditorView, { x, y }) {
      if (y >= 70) return source.indexOf("```text");
      const line = this.state.doc.line(1);
      return line.from + Math.max(0, Math.min(line.length, Math.floor((x - 40) / 8)));
    });
    const hitTest = vi.fn(() => code.element);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: hitTest,
    });

    const anchorOffset = startNode.data.indexOf("origin") + 2;
    const headOffset = codeNode.data.indexOf("target") + 3;
    const view = editorView(wrapper);
    dispatchMouse(startLine!.element, "mousedown", 40 + anchorOffset * 8 + 1, 48);
    expect(nativePointerState(view).mouseSelection).not.toBeNull();
    dispatchMouse(startLine!.element, "mousemove", 60 + headOffset * 8 + 1, 88);
    dispatchMouse(code.element, "mouseup", 60 + headOffset * 8 + 1, 88);
    await settleUi();

    expect(hitTest).toHaveBeenCalledWith(60 + headOffset * 8 + 1, 88);
    const expectedSelection = {
      anchor: source.indexOf("origin") + 2,
      head: source.indexOf("target") + 3,
    };
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);
    expect(nativePointerState(view)).toMatchObject({
      draggedContent: null,
      mouseSelection: null,
    });

    const dispatch = vi.spyOn(view, "dispatch");
    dispatchMouse(document, "mousemove", 41, 48);
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);
    expect(pointerSelections(dispatch.mock.calls)).toEqual([]);
  });

  it("未派发终点 mousemove 时按 mouseup 坐标命中的代码字符结束拖选", async () => {
    const source = [
      "Before origin",
      "",
      "```text",
      "code target value",
      "```",
      "",
      "After",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const startLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("Before origin"));
    expect(startLine).toBeDefined();
    const startNode = firstTextContaining(startLine!.element, "Before origin");
    const code = wrapper.get<HTMLElement>(".cm-special-preview-code code");
    const codeNode = firstTextContaining(code.element, "code target value");
    installRangeGeometry((node) => {
      if (node === startNode) return { left: 40, top: 40, charWidth: 8 };
      if (node === codeNode) return { left: 60, top: 80, charWidth: 8 };
      return null;
    });
    vi.spyOn(EditorView.prototype, "posAtCoords").mockImplementation(function (this: EditorView, { x, y }) {
      if (y >= 70) return source.indexOf("```text");
      const line = this.state.doc.line(1);
      return line.from + Math.max(0, Math.min(line.length, Math.floor((x - 40) / 8)));
    });
    const hitTest = vi.fn(() => code.element);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: hitTest,
    });

    const anchorOffset = startNode.data.indexOf("origin") + 2;
    const headOffset = codeNode.data.indexOf("target") + 3;
    const view = editorView(wrapper);
    dispatchMouse(startLine!.element, "mousedown", 40 + anchorOffset * 8 + 1, 48);
    expect(nativePointerState(view).mouseSelection).not.toBeNull();
    dispatchMouse(code.element, "mouseup", 60 + headOffset * 8 + 1, 88);
    await settleUi();

    expect(hitTest).toHaveBeenCalledWith(60 + headOffset * 8 + 1, 88);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("origin") + 2,
      head: source.indexOf("target") + 3,
    });
    expect(nativePointerState(view).mouseSelection).toBeNull();
  });

  it("mousemove 后缺少坐标的 mouseup 不覆盖最后一个 head", async () => {
    const source = "abcdef";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = preparePlainLine(wrapper, source);
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    dispatchMouse(line.element, "mousedown", 1, 8);
    dispatchMouse(line.element, "mousemove", 41, 8);
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: 0,
      head: 4,
    });
    expect(nativePointerState(view).mouseSelection).toBeNull();
  });

  it("新手势启动时销毁旧的原生 MouseSelection", async () => {
    const source = "abcdef";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = preparePlainLine(wrapper, source);
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    dispatchMouse(line.element, "mousedown", 1, 8);
    const firstSelection = nativePointerState(view).mouseSelection;
    expect(firstSelection).not.toBeNull();
    const destroy = vi.spyOn(firstSelection!, "destroy");
    dispatchMouse(line.element, "mousedown", 51, 8);

    expect(destroy).toHaveBeenCalledOnce();
    expect(nativePointerState(view).mouseSelection).not.toBe(firstSelection);
    dispatchMouse(document, "mouseup", 51, 8);
    expect(nativePointerState(view).mouseSelection).toBeNull();
  });

  it("编辑器卸载时销毁原生 MouseSelection", async () => {
    const source = "abcdef";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = preparePlainLine(wrapper, source);
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    dispatchMouse(line.element, "mousedown", 1, 8);
    const selection = nativePointerState(view).mouseSelection;
    expect(selection).not.toBeNull();
    const destroy = vi.spyOn(selection!, "destroy");
    unmountEditor(wrapper);

    expect(destroy).toHaveBeenCalledOnce();
    expect(nativePointerState(view).mouseSelection).toBeNull();
  });

  it("坐标快照在短行右侧仍落到短行末尾", async () => {
    const source = [
      "Before",
      "",
      "<div>",
      "  <span>origin</span><br>",
      "  <span>tiny</span><br>",
      "  <span>this line is deliberately much longer</span>",
      "</div>",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const preview = wrapper.get<HTMLElement>(".cm-special-preview-html");
    const codeNode = firstTextContaining(preview.element, "origin");
    const shortNode = firstTextContaining(preview.element, "tiny");
    const longNode = firstTextContaining(preview.element, "this line is deliberately much longer");
    installRangeGeometry((node) => {
      if (node === codeNode) return { left: 0, top: 20 };
      if (node === shortNode) return { left: 0, top: 100 };
      if (node === longNode) return { left: 0, top: 120 };
      return null;
    });
    installCaretPosition(codeNode, 1);

    dispatchMouse(codeNode.parentElement!, "mousedown", 11, 28);
    dispatchMouse(document, "mousemove", 200, 108);
    dispatchMouse(document, "mouseup", 200, 108);
    await nextTick();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("origin") + 1,
      head: source.indexOf("tiny") + "tiny".length,
    });
  });
  it("已有选区进入原生拖放时不被 mouseup 补偿覆盖", async () => {
    const source = "alpha beta gamma";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = preparePlainLine(wrapper, source);
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    view.dispatch({ selection: { anchor: 1, head: 5 } });

    dispatchMouse(line.element, "mousedown", 21, 8);
    expect(nativePointerState(view).mouseSelection).not.toBeNull();
    line.element.dispatchEvent(new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    }));
    expect(nativePointerState(view).draggedContent).not.toBeNull();
    dispatchMouse(document, "mouseup", 121, 8);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: 1,
      head: 5,
    });
    expect(nativePointerState(view)).toMatchObject({
      draggedContent: null,
      mouseSelection: null,
    });
  });

  it("窗口失焦不会提前中断已有选区的原生拖放", async () => {
    const source = "alpha beta gamma";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = preparePlainLine(wrapper, source);
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    view.dispatch({ selection: { anchor: 1, head: 5 } });

    dispatchMouse(line.element, "mousedown", 21, 8);
    const selection = nativePointerState(view).mouseSelection;
    expect(selection).not.toBeNull();
    const destroy = vi.spyOn(selection!, "destroy");
    line.element.dispatchEvent(new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    }));
    expect(nativePointerState(view).draggedContent).not.toBeNull();

    window.dispatchEvent(new Event("blur"));
    expect(destroy).not.toHaveBeenCalled();
    expect(nativePointerState(view).draggedContent).not.toBeNull();
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: 1,
      head: 5,
    });

    dispatchMouse(document, "mouseup", 21, 8);
    expect(destroy).toHaveBeenCalledOnce();
    expect(nativePointerState(view)).toMatchObject({
      draggedContent: null,
      mouseSelection: null,
    });
  });

  it("窗口失焦时提交最后一个有效的正文拖选位置", async () => {
    const source = "abcdef";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = preparePlainLine(wrapper, source);
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    vi.useFakeTimers();

    dispatchMouse(line.element, "mousedown", 1, 8);
    const selection = nativePointerState(view).mouseSelection;
    expect(selection).not.toBeNull();
    const destroy = vi.spyOn(selection!, "destroy");
    dispatchMouse(line.element, "mousemove", 41, 8);
    window.dispatchEvent(new Event("blur"));

    expect(destroy).toHaveBeenCalledOnce();
    expect(nativePointerState(view).mouseSelection).toBeNull();
    vi.runOnlyPendingTimers();
    await nextTick();

    const expectedSelection = { anchor: 0, head: 4 };
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);

    const dispatch = vi.spyOn(view, "dispatch");
    dispatchMouse(document, "mousemove", 51, 8);
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);
    expect(pointerSelections(dispatch.mock.calls)).toEqual([]);
  });

  it("文档变化会取消旧拖选的延迟提交", async () => {
    const source = "abcdef";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = preparePlainLine(wrapper, source);
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);
    vi.useFakeTimers();

    dispatchMouse(line.element, "mousedown", 1, 8);
    dispatchMouse(line.element, "mousemove", 51, 8);
    expect(() => view.dispatch({
      changes: { from: 0, to: source.length, insert: "x" },
    })).not.toThrow();
    vi.runOnlyPendingTimers();
    await nextTick();

    expect(view.state.doc.toString()).toBe("x");
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: 0,
      head: 0,
    });
  });

  it("离开 Widget 后不再使用已失效的块级几何缓存", async () => {
    const source = [
      "Before origin",
      "",
      "```text",
      "code target value",
      "```",
      "",
      "After charlie delta",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const startLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("Before origin"));
    const afterLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("After charlie delta"));
    expect(startLine).toBeDefined();
    expect(afterLine).toBeDefined();
    const startNode = firstTextContaining(startLine!.element, "Before origin");
    const afterNode = firstTextContaining(afterLine!.element, "After charlie delta");
    const code = wrapper.get<HTMLElement>(".cm-special-preview-code code");
    const codeNode = firstTextContaining(code.element, "code target value");
    installRangeGeometry((node) => {
      if (node === startNode) return { left: 40, top: 40, charWidth: 8 };
      if (node === codeNode) return { left: 60, top: 80, charWidth: 8 };
      if (node === afterNode) return { left: 300, top: 80, charWidth: 8 };
      return null;
    });
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(0);

    let hitTarget: Element = code.element;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => hitTarget),
    });

    const anchorOffset = startNode.data.indexOf("origin") + 2;
    const codeOffset = codeNode.data.indexOf("target") + 2;
    const afterOffset = afterNode.data.indexOf("charlie") + 3;
    dispatchMouse(
      startLine!.element,
      "mousedown",
      40 + anchorOffset * 8 + 1,
      48,
    );
    dispatchMouse(
      document,
      "mousemove",
      60 + codeOffset * 8 + 1,
      88,
    );
    hitTarget = afterLine!.element;
    dispatchMouse(
      document,
      "mousemove",
      300 + afterOffset * 8 + 1,
      88,
    );
    dispatchMouse(
      document,
      "mouseup",
      300 + afterOffset * 8 + 1,
      88,
    );
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("origin") + 2,
      head: source.indexOf("charlie") + 3,
    });
  });

  it("Widget 展开为同一源码块时继续使用展开前几何", async () => {
    const source = [
      "Before origin",
      "",
      "<div><strong>HTML alpha beta</strong></div>",
      "",
      "After",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const startLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("Before origin"));
    const rawLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("After"));
    expect(startLine).toBeDefined();
    expect(rawLine).toBeDefined();
    const startNode = firstTextContaining(startLine!.element, "Before origin");
    const rawNode = firstTextContaining(rawLine!.element, "After");
    const html = wrapper.get<HTMLElement>(".cm-special-preview-html strong");
    const htmlNode = firstTextContaining(html.element, "HTML alpha beta");
    installRangeGeometry((node) => {
      if (node === startNode) return { left: 40, top: 40, charWidth: 8 };
      if (node === htmlNode) return { left: 60, top: 80, charWidth: 8 };
      if (node === rawNode) return { left: 300, top: 80, charWidth: 8 };
      return null;
    });
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(0);
    const originalPosAtDom = EditorView.prototype.posAtDOM;
    vi.spyOn(EditorView.prototype, "posAtDOM").mockImplementation(function (
      this: EditorView,
      node: Node,
      offset = 0,
    ) {
      if (node === rawLine!.element) return source.indexOf("<div>");
      return originalPosAtDom.call(this, node, offset);
    });

    let hitTarget: Element = html.element;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => hitTarget),
    });
    const anchorOffset = startNode.data.indexOf("origin") + 2;
    const htmlOffset = htmlNode.data.indexOf("beta") + 2;
    const x = 60 + htmlOffset * 8 + 1;
    dispatchMouse(
      startLine!.element,
      "mousedown",
      40 + anchorOffset * 8 + 1,
      48,
    );
    dispatchMouse(document, "mousemove", x, 88);
    hitTarget = rawLine!.element;
    dispatchMouse(document, "mousemove", x, 88);
    dispatchMouse(document, "mouseup", x, 88);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("origin") + 2,
      head: source.indexOf("beta") + 2,
    });
  });

  it("普通正文无移动抬手后清理原生拖选监听器", async () => {
    const source = "abcdef";
    const wrapper = mountEditor(source);
    await settleUi();
    const line = preparePlainLine(wrapper, source);
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    dispatchMouse(line.element, "mousedown", 21, 8);
    expect(nativePointerState(view).mouseSelection).not.toBeNull();
    dispatchMouse(document, "mouseup", 21, 8);
    await settleUi();

    const expectedSelection = { anchor: 2, head: 2 };
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);
    expect(nativePointerState(view).mouseSelection).toBeNull();

    const dispatch = vi.spyOn(view, "dispatch");
    dispatchMouse(document, "mousemove", 51, 8);
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);
    expect(pointerSelections(dispatch.mock.calls)).toEqual([]);
  });

  it("Widget 无移动抬手后清理自定义拖选监听器", async () => {
    const source = "Before\n\nTerm\n: Definition alpha beta\n\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionNode = firstTextContaining(definition.element, "Definition alpha beta");
    installRangeGeometry((node) => (
      node === definitionNode
        ? { left: 60, top: 40, charWidth: 8 }
        : null
    ));
    const offset = definitionNode.data.indexOf("alpha") + 2;
    installCaretPosition(definitionNode, offset);
    const x = 60 + offset * 8 + 1;

    dispatchMouse(definition.element, "mousedown", x, 48);
    dispatchMouse(document, "mouseup", x, 48);
    await settleUi();

    const expectedSelection = {
      anchor: source.indexOf("alpha") + 2,
      head: source.indexOf("alpha") + 2,
    };
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);

    const view = editorView(wrapper);
    const dispatch = vi.spyOn(view, "dispatch");
    dispatchMouse(document, "mousemove", 121, 48);
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);
    expect(pointerSelections(dispatch.mock.calls)).toEqual([]);
  });

  it("Widget 拖选在窗口失焦时保留最后位置并清理监听器", async () => {
    const source = "Before\n\nTerm\n: Definition alpha beta\n\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionNode = firstTextContaining(definition.element, "Definition alpha beta");
    installRangeGeometry((node) => (
      node === definitionNode
        ? { left: 60, top: 40, charWidth: 8 }
        : null
    ));
    const anchorOffset = definitionNode.data.indexOf("alpha") + 1;
    const headOffset = definitionNode.data.indexOf("beta") + 2;
    installCaretPosition(definitionNode, anchorOffset);

    dispatchMouse(
      definition.element,
      "mousedown",
      60 + anchorOffset * 8 + 1,
      48,
    );
    dispatchMouse(document, "mousemove", 60 + headOffset * 8 + 1, 48);
    window.dispatchEvent(new Event("blur"));
    await nextTick();

    const expectedSelection = {
      anchor: source.indexOf("alpha") + 1,
      head: source.indexOf("beta") + 2,
    };
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);

    const view = editorView(wrapper);
    const dispatch = vi.spyOn(view, "dispatch");
    dispatchMouse(document, "mousemove", 61, 48);
    expect(editorHandle(wrapper).getViewState()).toMatchObject(expectedSelection);
    expect(pointerSelections(dispatch.mock.calls)).toEqual([]);
  });

  it("Widget 拖选中卸载编辑器会移除文档监听器", async () => {
    const source = "Before\n\nTerm\n: Definition alpha beta";
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionNode = firstTextContaining(definition.element, "Definition alpha beta");
    installRangeGeometry((node) => (
      node === definitionNode
        ? { left: 60, top: 40, charWidth: 8 }
        : null
    ));
    const anchorOffset = definitionNode.data.indexOf("alpha") + 1;
    installCaretPosition(definitionNode, anchorOffset);

    dispatchMouse(
      definition.element,
      "mousedown",
      60 + anchorOffset * 8 + 1,
      48,
    );
    const view = editorView(wrapper);
    const dispatch = vi.spyOn(view, "dispatch");
    unmountEditor(wrapper);
    dispatch.mockClear();

    expect(() => {
      dispatchMouse(document, "mousemove", 121, 48);
      dispatchMouse(document, "mouseup", 121, 48);
    }).not.toThrow();
    expect(pointerSelections(dispatch.mock.calls)).toEqual([]);
  });

});

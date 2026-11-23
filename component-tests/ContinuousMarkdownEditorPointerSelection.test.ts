import { EditorView } from "@codemirror/view";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  getViewState: () => { anchor: number; head: number };
  insertText: (text: string) => void;
  setCursorAtCoordinates: (x: number, y: number) => boolean;
  selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
}

function mountEditor(source: string, attachTo: HTMLElement = document.body) {
  return mount(ContinuousMarkdownEditor, {
    attachTo,
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
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function editorHandle(wrapper: VueWrapper): EditorHandle {
  return wrapper.vm as unknown as EditorHandle;
}

function placeCaret(node: Node, offset: number) {
  const selection = document.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function mockPointerCaret(node: Node, offset: number) {
  placeCaret(node, offset);
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn(() => ({ offsetNode: node, offset })),
  });
}

function mockPointerPosition(node: Node, offset: number) {
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: vi.fn(() => ({ offsetNode: node, offset })),
  });
}

function mockPointerRange(node: Node, offset: number) {
  const positionFromPoint = vi.fn(() => null);
  const rangeFromPoint = vi.fn(() => ({
    startContainer: node,
    startOffset: offset,
  }));
  Object.defineProperty(document, "caretPositionFromPoint", {
    configurable: true,
    value: positionFromPoint,
  });
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: rangeFromPoint,
  });
  return { positionFromPoint, rangeFromPoint };
}

function firstTextNode(root: Node): Node {
  let node = root;
  while (node.firstChild) node = node.firstChild;
  return node;
}

function dispatchPrimaryMouseDown(target: Element, detail = 1, shiftKey = false) {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    detail,
    shiftKey,
  }));
}

function dispatchPrimaryClick(target: Element, detail = 1) {
  dispatchPrimaryMouseDown(target, detail);
  document.dispatchEvent(new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail,
  }));
  target.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    detail,
  }));
}

function latestSource(wrapper: VueWrapper, fallback: string): string {
  const updates = wrapper.emitted<string[]>("update:modelValue") ?? [];
  return updates.at(-1)?.[0] ?? fallback;
}

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  Reflect.deleteProperty(document, "caretPositionFromPoint");
  Reflect.deleteProperty(document, "caretRangeFromPoint");
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor 鼠标选区", () => {
  it("在行内代码按下时定位并允许立即输入", async () => {
    const source = "Before `` alpha beta `` after";
    const wrapper = mountEditor(source);
    await settleUi();

    const code = wrapper.get<HTMLElement>(".cm-rendered-inline-code");
    placeCaret(code.element.firstChild!, 7);
    dispatchPrimaryMouseDown(code.element);
    await settleUi();

    const expected = source.indexOf("beta") + 1;
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

  it("在带空格目标的链接文字按下时恢复可见字符位置", async () => {
    const source = "Before [A &amp; B](foo bar) after";
    const wrapper = mountEditor(source);
    await settleUi();

    const link = wrapper.get<HTMLElement>(".cm-rendered-inline-link a");
    placeCaret(link.element.firstChild!, link.text().indexOf("&") + 1);
    dispatchPrimaryMouseDown(link.element);
    await settleUi();

    const expected = source.indexOf("&amp;") + "&amp;".length;
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: expected,
      head: expected,
    });
    wrapper.unmount();
  });

  it("可从行内代码内部开始拖选并用输入替换选区", async () => {
    const source = "Before `` alpha beta `` after";
    const wrapper = mountEditor(source);
    await settleUi();

    const anchor = source.indexOf("alpha") + 1;
    const head = source.indexOf("after") + 3;
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(head);

    const code = wrapper.get<HTMLElement>(".cm-rendered-inline-code");
    placeCaret(code.element.firstChild!, 1);
    dispatchPrimaryMouseDown(code.element);
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 640,
      clientY: 320,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });
    editorHandle(wrapper).insertText("selected");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, anchor) + "selected" + source.slice(head),
    );
    wrapper.unmount();
  });

  it("双击普通文字、行内代码、样式和链接时按可见单词选择源码", async () => {
    const codeSource = "Before \u0060\u0060 alpha beta \u0060\u0060 after";
    const codeWrapper = mountEditor(codeSource);
    await settleUi();

    const code = codeWrapper.get<HTMLElement>(".cm-rendered-inline-code");
    placeCaret(code.element.firstChild!, code.text().indexOf("beta") + 1);
    dispatchPrimaryMouseDown(code.element);
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    codeWrapper.get<HTMLElement>(".cm-content").element.blur();
    const beta = codeSource.indexOf("beta");
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValueOnce(beta + 1);
    dispatchPrimaryMouseDown(
      codeWrapper.get<HTMLElement>(".cm-rendered-inline-code").element,
      2,
    );
    await settleUi();
    expect(editorHandle(codeWrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: beta + "beta".length,
    });

    codeWrapper.unmount();
    document.getSelection()?.removeAllRanges();

    const styleCases = [
      { source: "Before alpha beta after", selector: ".cm-line" },
      { source: "Before **alpha beta** after", selector: ".cm-rendered-strong" },
      { source: "Before *alpha beta* after", selector: ".cm-rendered-emphasis" },
      { source: "Before ~~alpha beta~~ after", selector: ".cm-rendered-strikethrough" },
      { source: "Before ==alpha beta== after", selector: ".cm-rendered-highlight" },
      {
        source: "Before [alpha beta](https://example.com) after",
        selector: ".cm-rendered-link",
      },
    ];

    for (const current of styleCases) {
      const styleWrapper = mountEditor(current.source);
      await settleUi();

      const styleBeta = current.source.indexOf("beta");
      vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(styleBeta + 1);
      const styleTarget = styleWrapper.get<HTMLElement>(current.selector);
      mockPointerPosition(
        firstTextNode(styleTarget.element),
        styleTarget.text().indexOf("beta") + 1,
      );
      dispatchPrimaryMouseDown(styleTarget.element, 2);
      await settleUi();
      expect(editorHandle(styleWrapper).getViewState()).toMatchObject({
        anchor: styleBeta,
        head: styleBeta + "beta".length,
      });
      styleWrapper.unmount();
      document.getSelection()?.removeAllRanges();
    }
  });

  it("普通文字、样式文字、行尾和空行保持精确输入位置", async () => {
    const source = [
      "plain text",
      "**bold** *italic* ~~strike~~ ==mark==",
      "tail",
      "",
      "after blank",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const positions = [
      source.indexOf("plain") + 2,
      source.indexOf("bold") + 2,
      source.indexOf("italic") + 2,
      source.indexOf("strike") + 2,
      source.indexOf("mark") + 2,
      source.indexOf("tail") + "tail".length,
      source.indexOf("\n\nafter blank") + 1,
    ];

    for (const position of positions) {
      vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValueOnce(position);
      expect(editorHandle(wrapper).setCursorAtCoordinates(120, 80)).toBe(true);
      expect(editorHandle(wrapper).getViewState()).toMatchObject({
        anchor: position,
        head: position,
      });
    }

    const blank = positions.at(-1)!;
    editorHandle(wrapper).insertText("blank input");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, blank) + "blank input" + source.slice(blank),
    );
    wrapper.unmount();
  });
  it("代码块第二行按字符定位并允许立即输入", async () => {
    const fence = String.fromCharCode(96).repeat(3);
    const source = [
      "before",
      "",
      `${fence}ts`,
      "const repeat = 1;",
      "const repeat = 2;",
      fence,
    ].join("\r\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const keywords = wrapper.findAll<HTMLElement>(".cm-special-preview-code .hljs-keyword");
    expect(keywords).toHaveLength(2);
    const secondKeyword = keywords[1]!;
    mockPointerCaret(secondKeyword.element.firstChild!, 2);
    dispatchPrimaryClick(secondKeyword.element);
    await settleUi();

    const stateSource = source.replace(/\r\n/g, "\n");
    const stateExpected = stateSource.lastIndexOf("const") + 2;
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: stateExpected,
      head: stateExpected,
    });

    editorHandle(wrapper).insertText("X");
    await settleUi();
    const documentExpected = source.lastIndexOf("const") + 2;
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, documentExpected) + "X" + source.slice(documentExpected),
    );
    wrapper.unmount();
  });

  it("引用 HTML 中的实体和重复文本按可见字符定位", async () => {
    const source = [
      "before",
      "",
      "> <section title=\"alpha\">",
      ">   <strong>alpha &amp; beta</strong>",
      ">   <span>alpha beta</span>",
      "> </section>",
    ].join("\r\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const strong = wrapper.get<HTMLElement>(".cm-special-preview-html strong");
    const entityBoundary = strong.text().indexOf("&") + 1;
    mockPointerCaret(strong.element.firstChild!, entityBoundary);
    dispatchPrimaryClick(strong.element);
    await settleUi();

    const stateSource = source.replace(/\r\n/g, "\n");
    const stateExpected = stateSource.indexOf("&amp;") + "&amp;".length;
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: stateExpected,
      head: stateExpected,
    });

    editorHandle(wrapper).insertText("X");
    await settleUi();
    const documentExpected = source.indexOf("&amp;") + "&amp;".length;
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, documentExpected) + "X" + source.slice(documentExpected),
    );
    wrapper.unmount();

    const repeatedWrapper = mountEditor(source);
    await settleUi();
    const repeated = repeatedWrapper.get<HTMLElement>(".cm-special-preview-html span");
    const repeatedBoundary = repeated.text().lastIndexOf("beta") + 2;
    mockPointerCaret(repeated.element.firstChild!, repeatedBoundary);
    dispatchPrimaryClick(repeated.element);
    await settleUi();

    const repeatedStateSource = source.replace(/\r\n/g, "\n");
    const repeatedExpected = repeatedStateSource.lastIndexOf("beta") + 2;
    expect(editorHandle(repeatedWrapper).getViewState()).toMatchObject({
      anchor: repeatedExpected,
      head: repeatedExpected,
    });
    repeatedWrapper.unmount();
  });

  it("定义列表连续单击按最后位置输入并在离开后收起", async () => {
    const source = "Before\n\nTerm\n: Definition alpha beta\n\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionText = firstTextNode(definition.element);
    const firstRenderedOffset = definition.text().indexOf("alpha") + 1;
    const firstPosition = source.indexOf("alpha") + 1;
    mockPointerCaret(definitionText, firstRenderedOffset);
    dispatchPrimaryClick(definition.element);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: firstPosition,
      head: firstPosition,
    });
    expect(wrapper.find(".cm-special-preview-definition").exists()).toBe(false);

    const rawDefinition = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes(": Definition alpha beta"));
    expect(rawDefinition).toBeDefined();
    const secondPosition = source.indexOf("beta") + 2;
    vi.spyOn(Range.prototype, "getClientRects")
      .mockReturnValue([] as unknown as DOMRectList);
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(secondPosition);
    vi.spyOn(EditorView.prototype, "posAndSideAtCoords").mockReturnValue({
      pos: secondPosition,
      assoc: 1,
    });
    dispatchPrimaryClick(rawDefinition!.element);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: secondPosition,
      head: secondPosition,
    });
    editorHandle(wrapper).insertText("X");
    await settleUi();
    const updated = source.slice(0, secondPosition) + "X" + source.slice(secondPosition);
    expect(latestSource(wrapper, source)).toBe(updated);

    const after = updated.indexOf("After") + 1;
    await editorHandle(wrapper).selectRange(after, after, false);
    await settleUi();
    expect(wrapper.find(".cm-special-preview-definition").exists()).toBe(true);
    wrapper.unmount();
  });

  it("可从代码块预览开始拖选并用输入替换选区", async () => {
    const fence = String.fromCharCode(96).repeat(3);
    const source = [
      "before",
      "",
      `${fence}text`,
      "alpha beta",
      fence,
      "",
      "after block",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const anchor = source.indexOf("alpha") + 1;
    const head = source.indexOf("after") + 3;
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(head);

    const code = wrapper.get<HTMLElement>(".cm-special-preview-code code");
    placeCaret(code.element.firstChild!, 1);
    dispatchPrimaryMouseDown(code.element);
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 620,
      clientY: 300,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });
    editorHandle(wrapper).insertText("selected");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, anchor) + "selected" + source.slice(head),
    );
    wrapper.unmount();
  });

  it("代码预览首次定位后第二次按下按源码单词选中", async () => {
    const fence = String.fromCharCode(96).repeat(3);
    const source = `before\n\n${fence}text\nalpha beta\n${fence}`;
    const wrapper = mountEditor(source);
    await settleUi();

    const previewCode = wrapper.get<HTMLElement>(".cm-special-preview-code code");
    placeCaret(previewCode.element.firstChild!, previewCode.text().indexOf("beta") + 1);
    dispatchPrimaryClick(previewCode.element);
    await settleUi();

    const beta = source.indexOf("beta");
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValueOnce(beta + 1);
    const rawLine = wrapper.findAll<HTMLElement>(".cm-raw-block-code")
      .find((line) => line.text().includes("alpha beta"));
    expect(rawLine).toBeDefined();
    dispatchPrimaryMouseDown(rawLine!.element, 2);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: beta + "beta".length,
    });
    wrapper.unmount();
  });

  it("标题、列表、引用和跨行样式双击时按源码单词选择", async () => {
    const cases = [
      { source: "# heading alpha beta", selector: ".cm-heading-1", word: "beta" },
      { source: "- list alpha beta", selector: ".cm-bullet-list", word: "beta" },
      { source: "> quote alpha beta", selector: ".cm-blockquote", word: "beta" },
      { source: "Before **alpha\nbeta gamma** after", selector: ".cm-rendered-strong", word: "gamma" },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      const wordFrom = current.source.indexOf(current.word);
      vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValueOnce(wordFrom + 1);
      const targets = wrapper.findAll<HTMLElement>(current.selector);
      const target = targets.find((node) => node.text().includes(current.word));
      expect(target).toBeDefined();

      dispatchPrimaryMouseDown(target!.element, 2);
      await settleUi();

      expect(editorHandle(wrapper).getViewState()).toMatchObject({
        anchor: wordFrom,
        head: wordFrom + current.word.length,
      });
      wrapper.unmount();
      document.getSelection()?.removeAllRanges();
    }
  });

  it("失焦后首次按下空格目标链接可立即输入并支持正反向扩选", async () => {
    const source = "Before [alpha beta](foo bar) after";
    const clicked = source.indexOf("beta") + 1;

    for (const anchor of [source.indexOf("Before") + 2, source.indexOf("after") + 3]) {
      const wrapper = mountEditor(source);
      await settleUi();
      const editor = editorHandle(wrapper);
      await editor.selectRange(anchor, anchor, false);
      await settleUi();

      const link = wrapper.get<HTMLElement>(".cm-rendered-inline-link a");
      mockPointerPosition(link.element.firstChild!, link.text().indexOf("beta") + 1);
      dispatchPrimaryMouseDown(link.element, 1, true);

      expect(editor.getViewState()).toMatchObject({ anchor, head: clicked });
      wrapper.unmount();
      document.getSelection()?.removeAllRanges();
    }

    const wrapper = mountEditor(source);
    await settleUi();
    const editor = editorHandle(wrapper);
    wrapper.get<HTMLElement>(".cm-content").element.blur();
    const link = wrapper.get<HTMLElement>(".cm-rendered-inline-link a");
    mockPointerPosition(link.element.firstChild!, link.text().indexOf("beta") + 1);
    dispatchPrimaryMouseDown(link.element);

    expect(editor.getViewState()).toMatchObject({ anchor: clicked, head: clicked });
    editor.insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, clicked) + "X" + source.slice(clicked),
    );
    wrapper.unmount();
  });

  it.each([
    {
      source: "Before &amp; after",
      selector: ".cm-rendered-entity",
      raw: "&amp;",
      sourceOffset: "&amp;".length,
      renderedOffset: 1,
    },
    {
      source: ["Before HTML after", "", "*[HTML]: Abbreviation title"].join(String.fromCharCode(10)),
      selector: ".cm-rendered-abbreviation",
      raw: "HTML",
      sourceOffset: 2,
      renderedOffset: 2,
    },
    {
      source: "Before <span>alpha beta</span> after",
      selector: ".cm-rendered-inline-html",
      raw: "beta",
      sourceOffset: 1,
      renderedOffset: 7,
    },
  ])("$selector 失焦后支持正反向 Shift+按下", async ({
    source,
    selector,
    raw,
    sourceOffset,
    renderedOffset,
  }) => {
    const clicked = source.indexOf(raw) + sourceOffset;
    const anchors = [source.indexOf("Before") + 2, source.indexOf("after") + 3];

    for (const anchor of anchors) {
      const wrapper = mountEditor(source);
      await settleUi();
      await editorHandle(wrapper).selectRange(anchor, anchor);
      await settleUi();
      wrapper.get<HTMLElement>(".cm-content").element.blur();
      const focusSpy = vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

      const target = wrapper.get<HTMLElement>(selector);
      mockPointerPosition(firstTextNode(target.element), renderedOffset);
      dispatchPrimaryMouseDown(target.element, 1, true);
      expect(editorHandle(wrapper).getViewState()).toMatchObject({
        anchor,
        head: clicked,
      });

      await settleUi();
      const selection = editorHandle(wrapper).getViewState();
      expect(Math.min(selection.anchor, selection.head)).toBe(Math.min(anchor, clicked));
      expect(Math.max(selection.anchor, selection.head)).toBe(Math.max(anchor, clicked));
      expect(focusSpy).toHaveBeenCalled();
      focusSpy.mockRestore();
      wrapper.unmount();
      document.getSelection()?.removeAllRanges();
    }
  });

  it.each([
    {
      source: "Before &amp; after",
      selector: ".cm-rendered-entity",
      raw: "&amp;",
      sourceOffset: "&amp;".length,
      renderedOffset: 1,
    },
    {
      source: ["Before HTML after", "", "*[HTML]: Abbreviation title"].join(String.fromCharCode(10)),
      selector: ".cm-rendered-abbreviation",
      raw: "HTML",
      sourceOffset: 2,
      renderedOffset: 2,
    },
    {
      source: "Before <span>alpha beta</span> after",
      selector: ".cm-rendered-inline-html",
      raw: "beta",
      sourceOffset: 1,
      renderedOffset: 7,
    },
  ])("$selector 可从渲染文字开始拖选并立即替换", async ({
    source,
    selector,
    raw,
    sourceOffset,
    renderedOffset,
  }) => {
    const anchor = source.indexOf(raw) + sourceOffset;
    const head = source.indexOf("after") + 3;
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(head);

    const target = wrapper.get<HTMLElement>(selector);
    mockPointerPosition(firstTextNode(target.element), renderedOffset);
    dispatchPrimaryMouseDown(target.element);
    await settleUi();
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 640,
      clientY: 320,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });
    editorHandle(wrapper).insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, anchor) + "X" + source.slice(head),
    );
    wrapper.unmount();
  });

  it("源码展开后仍沿用首次渲染坐标完成行内 HTML 拖选", async () => {
    const source = "plain\n\n<span>alpha beta</span>";
    const wrapper = mountEditor(source);
    await settleUi();

    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      const left = this.startOffset * 10;
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
    vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValue(source.indexOf("alpha") + 2);

    const target = wrapper.get<HTMLElement>(".cm-rendered-inline-html");
    mockPointerPosition(firstTextNode(target.element), 0);
    target.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 10,
      detail: 1,
    }));
    await settleUi();

    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 99,
      clientY: 10,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    const anchor = source.indexOf("alpha");
    const head = source.indexOf("</span>");
    expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });

    editorHandle(wrapper).insertText("R");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe("plain\n\n<span>R</span>");
    wrapper.unmount();
  });
  it("拖选仅在 grapheme 边界定位 Emoji、组合字符和 ZWJ 序列", async () => {
    const source = "plain\n\n<span>A😀é👨‍👩‍👧‍👦B</span>";
    const wrapper = mountEditor(source);
    await settleUi();

    const target = wrapper.get<HTMLElement>(".cm-rendered-inline-html");
    const textNode = firstTextNode(target.element);
    const starts = [0, 1, 3, 5, 16];
    const measured: Array<[number, number]> = [];
    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      if (this.startContainer === textNode) {
        measured.push([this.startOffset, this.endOffset]);
      }
      const visualIndex = Math.max(0, starts.indexOf(this.startOffset));
      const left = visualIndex * 10;
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

    mockPointerPosition(textNode, 0);
    target.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 10,
      detail: 1,
    }));
    expect(measured).toEqual([
      [0, 1],
      [1, 3],
      [3, 5],
      [5, 16],
      [16, 17],
    ]);

    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 19,
      clientY: 10,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("A"),
      head: source.indexOf("😀") + "😀".length,
    });
    wrapper.unmount();
  });

  it("长行仅按 grapheme 数量建立拖选测量", async () => {
    const rendered = "😀".repeat(120) + "é".repeat(80);
    const source = "plain\n\n<span>" + rendered + "</span>";
    const wrapper = mountEditor(source);
    await settleUi();

    const target = wrapper.get<HTMLElement>(".cm-rendered-inline-html");
    const textNode = firstTextNode(target.element);
    let measured = 0;
    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      if (this.startContainer === textNode) measured += 1;
      return [{
        bottom: 20,
        height: 20,
        left: 0,
        right: 10,
        top: 0,
        width: 10,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }] as unknown as DOMRectList;
    });

    mockPointerPosition(textNode, 0);
    dispatchPrimaryMouseDown(target.element);
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));

    expect(measured).toBe(200);
    wrapper.unmount();
  });

  it("滚动后按滚动差修正拖选快照坐标", async () => {
    const source = "plain\n\n<span>alpha beta</span>";
    const wrapper = mountEditor(source);
    await settleUi();

    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      const left = this.startOffset * 10;
      return [{
        bottom: 120,
        height: 20,
        left,
        right: left + 10,
        top: 100,
        width: 10,
        x: left,
        y: 100,
        toJSON: () => ({}),
      }] as unknown as DOMRectList;
    });
    const fallback = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValue(source.indexOf("alpha") + 2);

    const target = wrapper.get<HTMLElement>(".cm-rendered-inline-html");
    mockPointerPosition(firstTextNode(target.element), 0);
    target.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 110,
      detail: 1,
    }));
    await settleUi();

    fallback.mockClear();
    wrapper.get<HTMLElement>(".cm-scroller").element.scrollTop = 40;
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 99,
      clientY: 70,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    expect(fallback).not.toHaveBeenCalledWith({ x: 99, y: 70 });
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("alpha"),
      head: source.indexOf("</span>"),
    });
    wrapper.unmount();
  });

  it("外层 editor-scroll 滚动后优先按祖先滚动差修正拖选坐标", async () => {
    const source = "plain\n\n<span>alpha beta</span>";
    const scrollContainer = document.createElement("div");
    scrollContainer.className = "editor-scroll";
    document.body.appendChild(scrollContainer);
    const wrapper = mountEditor(source, scrollContainer);

    try {
      await settleUi();
      vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
        const left = this.startOffset * 10;
        return [{
          bottom: 120,
          height: 20,
          left,
          right: left + 10,
          top: 100,
          width: 10,
          x: left,
          y: 100,
          toJSON: () => ({}),
        }] as unknown as DOMRectList;
      });
      const fallback = vi.spyOn(EditorView.prototype, "posAtCoords")
        .mockReturnValue(source.indexOf("alpha") + 2);

      const target = wrapper.get<HTMLElement>(".cm-rendered-inline-html");
      mockPointerPosition(firstTextNode(target.element), 0);
      target.element.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: 0,
        clientY: 110,
        detail: 1,
      }));
      await settleUi();

      fallback.mockClear();
      expect(wrapper.get<HTMLElement>(".cm-scroller").element.scrollTop).toBe(0);
      scrollContainer.scrollTop = 40;
      document.dispatchEvent(new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        buttons: 1,
        clientX: 99,
        clientY: 70,
      }));
      document.dispatchEvent(new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }));
      await settleUi();

      expect(fallback).not.toHaveBeenCalledWith({ x: 99, y: 70 });
      const anchor = source.indexOf("alpha");
      const head = source.indexOf("</span>");
      expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });

      editorHandle(wrapper).insertText("R");
      await settleUi();
      expect(latestSource(wrapper, source)).toBe("plain\n\n<span>R</span>");
    } finally {
      wrapper.unmount();
      scrollContainer.remove();
    }
  });

  it.each([
    {
      suffix: "[beta](foo bar)",
      targetSelector: ".cm-rendered-inline-link",
      targetText: "beta",
      renderedOffset: 4,
      expectedOffset: (source: string) => source.indexOf("beta") + "beta".length,
    },
    {
      suffix: "`A &amp; B`",
      targetSelector: ".cm-rendered-inline-code",
      targetText: "A &amp; B",
      renderedOffset: 7,
      expectedOffset: (source: string) => source.indexOf("&amp;") + "&amp;".length,
    },
  ])("跨 Widget 拖选按各自渲染语法映射终点 $targetSelector", async ({
    suffix,
    targetSelector,
    targetText,
    renderedOffset,
    expectedOffset,
  }) => {
    const source = `plain\n\n<span>alpha</span> ${suffix}`;
    const wrapper = mountEditor(source);
    await settleUi();

    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      const value = this.startContainer.textContent ?? "";
      const base = value === "alpha" ? 0 : value === targetText ? 60 : 50;
      const left = base + this.startOffset * 10;
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
    vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValue(source.indexOf("alpha") + 2);

    const origin = wrapper.get<HTMLElement>(".cm-rendered-inline-html");
    expect(wrapper.get<HTMLElement>(targetSelector).text()).toBe(targetText);
    mockPointerPosition(firstTextNode(origin.element), 0);
    origin.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 10,
      detail: 1,
    }));
    await settleUi();

    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 60 + renderedOffset * 10 - 1,
      clientY: 10,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: source.indexOf("alpha"),
      head: expectedOffset(source),
    });
    wrapper.unmount();
  });
  it("从右向左跨 rendered widget 拖选并立即替换反向选区", async () => {
    const source = "plain\n\n<span>alpha</span> `beta`";
    const wrapper = mountEditor(source);
    await settleUi();
    wrapper.get<HTMLElement>(".cm-content").element.blur();
    const focusSpy = vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      const value = this.startContainer.textContent ?? "";
      const base = value === "alpha" ? 0 : value === "beta" ? 60 : 50;
      const left = base + this.startOffset * 10;
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
    const fallback = vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValue(source.indexOf("beta") + 2);

    const origin = wrapper.get<HTMLElement>(".cm-rendered-inline-code");
    const destination = wrapper.get<HTMLElement>(".cm-rendered-inline-html");
    expect(origin.text()).toBe("beta");
    expect(destination.text()).toBe("alpha");
    mockPointerPosition(firstTextNode(origin.element), "beta".length);
    origin.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: 99,
      clientY: 10,
      detail: 1,
    }));
    await settleUi();

    fallback.mockClear();
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 9,
      clientY: 10,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await settleUi();

    expect(fallback).not.toHaveBeenCalledWith({ x: 9, y: 10 });
    const anchor = source.indexOf("beta") + "beta".length;
    const head = source.indexOf("alpha") + 1;
    expect(editorHandle(wrapper).getViewState()).toMatchObject({ anchor, head });

    editorHandle(wrapper).insertText("R");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, head) + "R" + source.slice(anchor),
    );
    expect(focusSpy).toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([
    { renderedOffset: 0, sourceOffset: 0 },
    { renderedOffset: 1, sourceOffset: "&amp;".length },
  ])("maps HTML entity boundaries and inserts at the clicked side", async ({ renderedOffset, sourceOffset }) => {
    const source = "Before &amp; after";
    const entityFrom = source.indexOf("&amp;");
    const expected = entityFrom + sourceOffset;
    const wrapper = mountEditor(source);
    await settleUi();

    const entity = wrapper.get<HTMLElement>(".cm-rendered-entity");
    mockPointerPosition(entity.element.firstChild!, renderedOffset);
    dispatchPrimaryClick(entity.element);
    await settleUi();

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
      source: "Before &amp; after",
      selector: ".cm-rendered-entity",
      raw: "&amp;",
      sourceOffset: "&amp;".length,
      renderedOffset: 1,
    },
    {
      source: ["Before HTML after", "", "*[HTML]: Abbreviation title"].join("\n"),
      selector: ".cm-rendered-abbreviation",
      raw: "HTML",
      sourceOffset: 2,
      renderedOffset: 2,
    },
    {
      source: "Before <span>alpha beta</span> after",
      selector: ".cm-rendered-inline-html",
      raw: "beta",
      sourceOffset: 1,
      renderedOffset: 7,
    },
  ])("$selector 通过 caretRangeFromPoint 点击定位并恢复编辑器焦点", async ({
    source,
    selector,
    raw,
    sourceOffset,
    renderedOffset,
  }) => {
    const wrapper = mountEditor(source);
    await settleUi();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    content.focus();
    content.blur();
    expect(document.activeElement).not.toBe(content);

    const target = wrapper.get<HTMLElement>(selector);
    const pointer = mockPointerRange(firstTextNode(target.element), renderedOffset);
    dispatchPrimaryClick(target.element);
    await settleUi();

    const expected = source.indexOf(raw) + sourceOffset;
    expect(pointer.positionFromPoint).toHaveBeenCalled();
    expect(pointer.rangeFromPoint).toHaveBeenCalled();
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: expected,
      head: expected,
    });
    expect(document.activeElement).toBe(content);
    wrapper.unmount();
  });

  it.each([
    {
      source: ["Before HTML after", "", "*[HTML]: Abbreviation title"].join("\n"),
      selector: ".cm-rendered-abbreviation",
      renderedOffset: 2,
      sourceOffset: 2,
      word: "HTML",
      wrongWord: "Before",
    },
    {
      source: "Before <span>alpha beta</span> after",
      selector: ".cm-rendered-inline-html",
      renderedOffset: 7,
      sourceOffset: 1,
      word: "beta",
      wrongWord: "span",
    },
  ])("$selector 完整双击序列沿用首次渲染坐标选择源码单词", async ({
    source,
    selector,
    renderedOffset,
    sourceOffset,
    word,
    wrongWord,
  }) => {
    const wrapper = mountEditor(source);
    await settleUi();
    const content = wrapper.get<HTMLElement>(".cm-content").element;
    const rendered = wrapper.get<HTMLElement>(selector);
    mockPointerRange(firstTextNode(rendered.element), renderedOffset);

    dispatchPrimaryClick(rendered.element, 1);
    await settleUi();
    const wordFrom = source.indexOf(word);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: wordFrom + sourceOffset,
      head: wordFrom + sourceOffset,
    });
    expect(wrapper.find(selector).exists()).toBe(false);

    vi.spyOn(EditorView.prototype, "posAtCoords")
      .mockReturnValueOnce(source.indexOf(wrongWord) + 1);
    const rawLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes(word));
    expect(rawLine).toBeDefined();
    dispatchPrimaryMouseDown(rawLine!.element, 2);
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
    }));
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: wordFrom,
      head: wordFrom + word.length,
    });
    expect(document.activeElement).toBe(content);
    wrapper.unmount();
  });

  it.each([
    {
      source: "Before\n\n$$\nx + 1\n$$\n\nAfter",
      content: "x + 1",
    },
    {
      source: "Before\n\n```math\nx + 1\n```\n\nAfter",
      content: "x + 1",
    },
  ])("places the first $content math input at the content start", async ({ source, content }) => {
    const contentStart = source.indexOf(content);
    const wrapper = mountEditor(source);
    await settleUi();

    const oldCursor = source.indexOf("After") + 2;
    await editorHandle(wrapper).selectRange(oldCursor, oldCursor, false);
    await settleUi();
    const math = wrapper.get<HTMLElement>(".cm-special-preview-math");
    dispatchPrimaryClick(math.element);
    await settleUi();

    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: contentStart,
      head: contentStart,
    });
    editorHandle(wrapper).insertText("X");
    await settleUi();
    expect(latestSource(wrapper, source)).toBe(
      source.slice(0, contentStart) + "X" + source.slice(contentStart),
    );
    wrapper.unmount();
  });

  it("extends a plain-text selection on Shift+double-click and preserves it after dblclick", async () => {
    const source = "alpha gap beta";
    const wrapper = mountEditor(source);
    await settleUi();

    const anchor = source.indexOf("alpha");
    const beta = source.indexOf("beta");
    await editorHandle(wrapper).selectRange(anchor, anchor, false);
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(beta + 1);
    const line = wrapper.get<HTMLElement>(".cm-line");

    dispatchPrimaryMouseDown(line.element, 2, true);
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
      shiftKey: true,
    }));
    const finalDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
      shiftKey: true,
    });
    line.element.dispatchEvent(finalDoubleClick);
    await settleUi();

    expect(finalDoubleClick.defaultPrevented).toBe(true);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor,
      head: beta + "beta".length,
    });
    wrapper.unmount();
  });

  it("extends an existing selection into a rendered definition on Shift+double-click", async () => {
    const source = "Before\n\nTerm\n: Definition alpha beta\n\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();

    const anchor = source.indexOf("Before") + 1;
    const beta = source.indexOf("beta");
    await editorHandle(wrapper).selectRange(anchor, anchor, false);
    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    const definitionText = firstTextNode(definition.element);
    mockPointerPosition(definitionText, definition.text().indexOf("beta") + 1);

    dispatchPrimaryMouseDown(definition.element, 2, true);
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
      shiftKey: true,
    }));
    const finalDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
      shiftKey: true,
    });
    wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(finalDoubleClick);
    await settleUi();

    expect(finalDoubleClick.defaultPrevented).toBe(true);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor,
      head: beta + "beta".length,
    });
    wrapper.unmount();
  });

  it("extends an inline rendered double-click by words while dragging", async () => {
    const source = "Before <span>alpha beta gamma</span> after";
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const beta = source.indexOf("beta");
    const gamma = source.indexOf("gamma");
    const inlineHtml = wrapper.get<HTMLElement>(".cm-rendered-inline-html");
    mockPointerPosition(
      firstTextNode(inlineHtml.element),
      inlineHtml.text().indexOf("beta") + 1,
    );
    dispatchPrimaryClick(inlineHtml.element, 1);
    await settleUi();
    const rawHtmlLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes("<span>alpha beta gamma</span>"));
    expect(rawHtmlLine).toBeDefined();
    dispatchPrimaryMouseDown(rawHtmlLine!.element, 2);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: beta + "beta".length,
    });
    await settleUi();
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(gamma + 1);
    vi.spyOn(EditorView.prototype, "posAndSideAtCoords").mockReturnValue({
      pos: gamma + 1,
      assoc: 1,
    });
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 80,
      clientY: 40,
      detail: 2,
    }));
    await settleUi();
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 80,
      clientY: 40,
      detail: 2,
    }));
    const finalDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 80,
      clientY: 40,
      detail: 2,
    });
    wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(finalDoubleClick);
    await settleUi();

    expect(finalDoubleClick.defaultPrevented).toBe(true);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: beta,
      head: gamma + "gamma".length,
    });
    wrapper.unmount();
  });

  it("preserves backward word-drag direction from a rendered definition", async () => {
    const source = "Before\n\nTerm\n: Definition alpha beta gamma\n\nAfter";
    const wrapper = mountEditor(source);
    await settleUi();
    vi.spyOn(EditorView.prototype, "focus").mockImplementation(() => {});

    const alpha = source.indexOf("alpha");
    const gamma = source.indexOf("gamma");
    const definition = wrapper.get<HTMLElement>(".cm-special-preview-definition dd");
    mockPointerPosition(
      firstTextNode(definition.element),
      definition.text().indexOf("gamma") + 1,
    );
    dispatchPrimaryClick(definition.element, 1);
    await settleUi();
    const rawDefinitionLine = wrapper.findAll<HTMLElement>(".cm-line")
      .find((line) => line.text().includes(": Definition alpha beta gamma"));
    expect(rawDefinitionLine).toBeDefined();

    dispatchPrimaryMouseDown(rawDefinitionLine!.element, 2);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: gamma,
      head: gamma + "gamma".length,
    });
    await settleUi();
    vi.spyOn(EditorView.prototype, "posAtCoords").mockReturnValue(alpha + 1);
    vi.spyOn(EditorView.prototype, "posAndSideAtCoords").mockReturnValue({
      pos: alpha + 1,
      assoc: 1,
    });
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 80,
      clientY: 40,
      detail: 2,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 80,
      clientY: 40,
      detail: 2,
    }));
    const finalDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 80,
      clientY: 40,
      detail: 2,
    });
    wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(finalDoubleClick);
    await settleUi();

    expect(finalDoubleClick.defaultPrevented).toBe(true);
    expect(editorHandle(wrapper).getViewState()).toMatchObject({
      anchor: gamma + "gamma".length,
      head: alpha,
    });
    wrapper.unmount();
  });
});

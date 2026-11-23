import { EditorView } from "@codemirror/view";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    svg: '<svg viewBox="0 0 120 60"><path d="M0 0h120v60H0z" /></svg>',
    bindFunctions: vi.fn(),
  })),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

interface NativePointerState {
  mouseSelection: { destroy: () => void } | null;
}

const mountedWrappers = new Set<VueWrapper>();

function mountEditor(source: string) {
  const wrapper = mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly: false,
      settings: defaultEditorSettings,
    },
  });
  mountedWrappers.add(wrapper);
  return wrapper;
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function editorView(wrapper: VueWrapper): EditorView {
  const view = EditorView.findFromDOM(wrapper.get<HTMLElement>(".cm-editor").element);
  if (!view) throw new Error("未找到 CodeMirror 编辑器实例");
  return view;
}

function nativePointerState(view: EditorView): NativePointerState {
  return (view as unknown as { inputState: NativePointerState }).inputState;
}

function dispatchMouseDown(target: EventTarget) {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: 8,
    clientY: 8,
    detail: 1,
  }));
}

afterEach(() => {
  for (const wrapper of mountedWrappers) wrapper.unmount();
  mountedWrappers.clear();
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
});

describe("ContinuousMarkdownEditor 独立 Widget 鼠标选区清理", () => {
  it.each([
    ["列表标记", "\n- 列表正文", ".cm-rendered-bullet-marker"],
    ["任务复选框", "\n- [ ] 任务正文", ".cm-rendered-task-marker input"],
    ["脚注引用", "\n脚注引用[^note]\n\n[^note]: 脚注正文", ".cm-rendered-footnote-reference"],
    ["Alert 标题", "\n> [!NOTE]\n> 提示正文", ".cm-rendered-alert-title"],
    ["脚注反向链接", "\n[^note]: 脚注正文\n\n脚注引用[^note]", ".cm-footnote-backlink"],
    ["引用定义字段", "\n[docs]: https://example.com/docs", ".cm-reference-definition-url"],
    ["visual table", "\n| A |\n| --- |\n| B |", ".cm-visual-table-widget tbody td"],
    ["code language selector", "\n```ts\nconst value = 1;\n```", ".code-fence-language-trigger"],
    ["native HTML media control", "\n<audio controls src=\"sample.mp3\"></audio>", ".cm-special-preview-html audio"],
    ["math block", "\n$$\nx^2 + y^2\n$$", ".cm-special-preview-math"],
    ["table of contents", "\n[TOC]\n\n# Heading", ".cm-special-preview-toc"],
    ["Mermaid diagram", "\n```mermaid\nflowchart LR\n  A --> B\n```", ".cm-special-preview-diagram"],
  ])("%s 的新 mousedown 销毁旧的 CodeMirror mouseSelection", async (_name, source, selector) => {
    const wrapper = mountEditor(source);
    await settleUi();
    if (_name === "code language selector") {
      await wrapper.get(".cm-special-preview-code .hljs-keyword").trigger("click");
      await settleUi();
    }
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    const pointerState = nativePointerState(view);
    let staleSelection: NonNullable<NativePointerState["mouseSelection"]>;
    if (_name === "code language selector" || _name === "visual table") {
      staleSelection = {
        destroy: vi.fn(() => { pointerState.mouseSelection = null; }),
      };
      pointerState.mouseSelection = staleSelection;
    } else {
      const startLine = wrapper.findAll<HTMLElement>(".cm-line")[0];
      expect(startLine?.classes()).toContain("cm-blank");
      dispatchMouseDown(startLine!.element);
      staleSelection = pointerState.mouseSelection!;
    }

    expect(staleSelection).not.toBeNull();
    const destroy = vi.spyOn(staleSelection, "destroy");

    dispatchMouseDown(wrapper.get<HTMLElement>(selector).element);

    expect(destroy).toHaveBeenCalledOnce();
    expect(nativePointerState(view).mouseSelection).not.toBe(staleSelection);
  });

  it("clears a stale CodeMirror mouseSelection before a body-mounted footnote tooltip handles mousedown", async () => {
    const wrapper = mountEditor("\nBody[^note]\n\n[^note]: Tooltip body");
    await settleUi();
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    await wrapper.get(".cm-rendered-footnote-reference").trigger("mouseenter");
    await settleUi();
    const tooltip = document.body.querySelector<HTMLElement>(".cm-footnote-tooltip-content");
    expect(tooltip).not.toBeNull();

    const startLine = wrapper.findAll<HTMLElement>(".cm-line")[0];
    dispatchMouseDown(startLine!.element);
    const staleSelection = nativePointerState(view).mouseSelection;
    expect(staleSelection).not.toBeNull();
    const destroy = vi.spyOn(staleSelection!, "destroy");

    dispatchMouseDown(tooltip!);

    expect(destroy).toHaveBeenCalledOnce();
    expect(nativePointerState(view).mouseSelection).not.toBe(staleSelection);
  });

  it("clears an unfinished CodeMirror mouseSelection when the window loses focus", async () => {
    const wrapper = mountEditor("\nBody");
    await settleUi();
    const view = editorView(wrapper);
    vi.spyOn(document, "getSelection").mockReturnValue(null);

    const startLine = wrapper.findAll<HTMLElement>(".cm-line")[0];
    dispatchMouseDown(startLine!.element);
    const staleSelection = nativePointerState(view).mouseSelection;
    expect(staleSelection).not.toBeNull();
    const destroy = vi.spyOn(staleSelection!, "destroy");

    window.dispatchEvent(new Event("blur"));

    expect(destroy).toHaveBeenCalledOnce();
    expect(nativePointerState(view).mouseSelection).not.toBe(staleSelection);
  });
});

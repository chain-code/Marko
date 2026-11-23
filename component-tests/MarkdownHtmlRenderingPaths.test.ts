import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorSettings } from "@/types";

const htmlSource = [
  "正文 <u>下划线内容</u> 结束",
  "",
  '<iframe title="嵌入示例" src="about:blank" srcdoc="&lt;p&gt;嵌入内容&lt;/p&gt;"></iframe>',
  "",
  '<video controls preload="metadata">',
  '  <source src="media/demo.mp4" type="video/mp4">',
  "  视频回退文本",
  "</video>",
].join("\n");

function createSettings(overrides: Partial<EditorSettings> = {}): EditorSettings {
  return {
    ...defaultEditorSettings,
    ...overrides,
    smartQuotes: overrides.smartQuotes
      ?? overrides.smartPunctuation
      ?? defaultEditorSettings.smartQuotes,
    smartDashes: overrides.smartDashes
      ?? overrides.smartPunctuation
      ?? defaultEditorSettings.smartDashes,
    extensions: {
      ...defaultEditorSettings.extensions,
      ...overrides.extensions,
    },
  };
}

function mountPreview(settings = createSettings()) {
  return mount(MarkdownPreview, {
    props: {
      source: htmlSource,
      outline: [],
      settings,
    },
  });
}

function mountRich(settings = createSettings()) {
  return mount(RichMarkdownBlock, {
    props: {
      source: htmlSource,
      documentSource: htmlSource,
      outline: [],
      settings,
    },
  });
}

function mountContinuous(
  source = htmlSource,
  settings = createSettings(),
  readonly = true,
) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly,
      settings,
    },
  });
}

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function expectHtmlMedia(root: Element, path: string) {
  const underline = root.querySelector("u");
  expect(underline?.textContent, `${path} 应渲染下划线`).toBe("下划线内容");

  const frame = root.querySelector<HTMLIFrameElement>('iframe[title="嵌入示例"]');
  expect(frame, `${path} 应渲染 iframe`).not.toBeNull();
  expect(frame?.getAttribute("srcdoc"), `${path} 应移除 srcdoc`).toBeNull();
  expect(frame?.getAttribute("src"), `${path} 应保留安全地址`).toBe("about:blank");
  expect(frame?.hasAttribute("sandbox"), `${path} 应限制 iframe 权限`).toBe(true);

  const video = root.querySelector<HTMLVideoElement>("video[controls]");
  expect(video, `${path} 应渲染 video`).not.toBeNull();
  expect(video?.getAttribute("preload"), `${path} 应保留 preload`).toBe("metadata");
  expect(video?.textContent, `${path} 应保留视频回退文本`).toContain("视频回退文本");
  expect(video?.querySelector("source")?.getAttribute("src"), `${path} 应保留视频源`).toBe("media/demo.mp4");
  expect(video?.querySelector("source")?.getAttribute("type"), `${path} 应保留视频类型`).toBe("video/mp4");
}

function getSelectedSource(wrapper: VueWrapper, source: string): string {
  const editor = wrapper.vm as unknown as {
    getViewState: () => { anchor: number; head: number } | null;
  };
  const selection = editor.getViewState();
  expect(selection).not.toBeNull();
  const from = Math.min(selection!.anchor, selection!.head);
  const to = Math.max(selection!.anchor, selection!.head);
  return source.slice(from, to);
}

describe("Markdown HTML 三条渲染路径", () => {
  it("Preview、Rich 与 Continuous 均净化 iframe 并保留下划线和视频语义", async () => {
    const wrappers = [mountPreview(), mountRich(), mountContinuous()];
    await settleUi();

    for (const [index, wrapper] of wrappers.entries()) {
      expectHtmlMedia(wrapper.element, ["Preview", "Rich", "Continuous"][index]!);
    }

    expect(wrappers[2]!.find(".cm-rendered-inline-html u").exists()).toBe(true);
    expect(wrappers[2]!.find(".cm-special-preview-html iframe").exists()).toBe(true);
    expect(wrappers[2]!.find(".cm-special-preview-html video").exists()).toBe(true);

    const continuousVideo = wrappers[2]!.get<HTMLVideoElement>("video").element;
    const pointerDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    continuousVideo.dispatchEvent(pointerDown);
    continuousVideo.dispatchEvent(click);
    expect(pointerDown.defaultPrevented).toBe(false);
    expect(click.defaultPrevented).toBe(false);

    wrappers.forEach((wrapper) => wrapper.unmount());
  });

  it("原始 HTML 图片在可编辑态选择完整源码且只读态保留默认交互", async () => {
    const cases = [
      {
        name: "行内图片",
        source: '正文 <img src="inline.png" alt="行内图片"> 结束',
        selector: ".cm-rendered-inline-html img",
        selected: '<img src="inline.png" alt="行内图片">',
      },
      {
        name: "块级图片",
        source: [
          "Cursor",
          "",
          "<figure>",
          '  <img src="block.png" alt="块级图片">',
          "</figure>",
        ].join("\n"),
        selector: ".cm-special-preview-html img",
        selected: [
          "<figure>",
          '  <img src="block.png" alt="块级图片">',
          "</figure>",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const editable = mountContinuous(testCase.source, createSettings(), false);
      await settleUi();
      const editableImage = editable.get<HTMLImageElement>(testCase.selector).element;
      editableImage.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      editableImage.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await settleUi();
      expect(getSelectedSource(editable, testCase.source), testCase.name).toBe(testCase.selected);
      editable.unmount();

      const readonly = mountContinuous(testCase.source, createSettings(), true);
      await settleUi();
      const readonlyImage = readonly.get<HTMLImageElement>(testCase.selector).element;
      const pointerDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      readonlyImage.dispatchEvent(pointerDown);
      readonlyImage.dispatchEvent(click);
      expect(pointerDown.defaultPrevented, `${testCase.name} 的只读按下事件不应被阻止`).toBe(false);
      expect(click.defaultPrevented, `${testCase.name} 的只读点击事件不应被阻止`).toBe(false);
      readonly.unmount();
    }
  });

  it("sanitizes dangerous HTML and keeps hidden blocks visible as source", async () => {
    const source = [
      "<script>window.__markoUnsafe = true</script>",
      "",
      [
        '<div id="safe" onclick="window.__clicked = true">',
        '<img src="image.png" onerror="window.__imageError = true">',
        '<a href="javascript:alert(1)">blocked</a>',
        '<iframe src="about:blank" srcdoc="<script>alert(1)</script>"></iframe>',
        '<label for="choice">Choice</label><input id="choice" type="checkbox">',
        "</div>",
      ].join(""),
    ].join("\n");
    const wrappers = [
      mount(MarkdownPreview, {
        props: { source, outline: [], settings: createSettings() },
      }),
      mount(RichMarkdownBlock, {
        props: {
          source,
          documentSource: source,
          outline: [],
          settings: createSettings(),
        },
      }),
      mountContinuous(source),
    ];
    await settleUi();

    for (const [index, wrapper] of wrappers.entries()) {
      const path = ["Preview", "Rich", "Continuous"][index];
      expect(wrapper.element.querySelector("script, style, object, embed"), path).toBeNull();
      expect(wrapper.element.querySelector("[onclick], [onerror], [srcdoc]"), path).toBeNull();
      expect(wrapper.element.querySelector('a[href^="javascript:"]'), path).toBeNull();
    }
    expect(wrappers[2]!.get(".md-raw-html-src-content").text()).toContain("<script>");
    const label = wrappers[2]!.get("label").element;
    const pointerDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    label.dispatchEvent(pointerDown);
    expect(pointerDown.defaultPrevented).toBe(false);

    wrappers.forEach((wrapper) => wrapper.unmount());
  });

  it("解析行内 HTML 正文语义并保留块级原始 HTML 正文", async () => {
    const source = [
      '<span>:smile: https://example.com "inline" -- text</span>',
      "",
      '<div>:rocket: https://example.org "block" -- text</div>',
    ].join("\n");
    const wrapper = mountContinuous(source, createSettings({ smartPunctuation: true }));
    await settleUi();

    const inline = wrapper.get(".cm-rendered-inline-html");
    expect(inline.text()).not.toContain(":smile:");
    expect(inline.find('a[href="https://example.com"]').exists()).toBe(true);
    expect(inline.text()).not.toContain('"inline"');
    expect(inline.text()).not.toContain(" -- ");

    const block = wrapper.get(".cm-special-preview-html");
    expect(block.text()).toContain(':rocket: https://example.org "block" -- text');
    expect(block.find('a[href="https://example.org"]').exists()).toBe(false);
    wrapper.unmount();

    const rawSource = [
      "<div>",
      ':rocket: https://example.org "block" -- text',
      "</div>",
    ].join("\n");
    const rawDisabled = mountContinuous(rawSource, createSettings({
      smartPunctuation: true,
      extensions: {
        ...defaultEditorSettings.extensions,
        html: false,
      },
    }));
    await settleUi();
    const rawEditor = rawDisabled.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const rawBodyOffset = rawSource.indexOf(":rocket:") + 2;
    await rawEditor.selectRange(rawBodyOffset, rawBodyOffset, false);
    await settleUi();
    expect(rawDisabled.find(".cm-special-preview-html").exists()).toBe(false);
    expect(rawDisabled.find(".cm-rendered-emoji").exists()).toBe(false);
    expect(rawDisabled.find(".cm-rendered-link").exists()).toBe(false);
    expect(rawDisabled.find(".cm-rendered-smart-punctuation").exists()).toBe(false);
    expect(rawDisabled.text()).toContain(':rocket: https://example.org "block" -- text');
    rawDisabled.unmount();
  });
});

describe("代码块自动换行开关", () => {
  it("Continuous 与 Rich 根据 codeWrap 切换样式类并保留代码内容", async () => {
    const source = "```text\nconst veryLongValue = '保持原始代码内容';\n```";
    const initialSettings = createSettings({ codeWrap: false });
    const continuous = mountContinuous(source, initialSettings);
    const rich = mount(RichMarkdownBlock, {
      props: {
        source,
        documentSource: source,
        outline: [],
        settings: initialSettings,
      },
    });
    await settleUi();

    expectCodeWrapState(continuous, ".continuous-editor", false);
    expectCodeWrapState(rich, ".rich-markdown-block", false);

    const wrappedSettings = createSettings({ codeWrap: true });
    await Promise.all([
      continuous.setProps({ settings: wrappedSettings }),
      rich.setProps({ settings: wrappedSettings }),
    ]);
    await settleUi();

    expectCodeWrapState(continuous, ".continuous-editor", true);
    expectCodeWrapState(rich, ".rich-markdown-block", true);

    continuous.unmount();
    rich.unmount();
  });
});

function expectCodeWrapState(wrapper: VueWrapper, selector: string, enabled: boolean) {
  expect(wrapper.get(selector).classes("wrap-code-blocks")).toBe(enabled);
  expect(wrapper.get("pre code").text()).toContain("保持原始代码内容");
}

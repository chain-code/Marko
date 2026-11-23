import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import RichMarkdownBlock from "@/components/RichMarkdownBlock.vue";
import VisualTableEditor from "@/components/VisualTableEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";
import { prepareRenderedImages } from "@/utils/imageRendering";

async function settleUi() {
  await nextTick();
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

describe("Markdown 图片失败状态", () => {
  it("Preview、Rich 和 Continuous 在加载失败时显示原始源码并可恢复", async () => {
    const markdown = "![broken](missing.png)";
    const continuousSource = `Cursor\n\n${markdown}`;
    const wrappers = [
      mount(MarkdownPreview, {
        props: { source: markdown, outline: [], settings: defaultEditorSettings },
      }),
      mount(RichMarkdownBlock, {
        props: {
          source: markdown,
          documentSource: markdown,
          outline: [],
          settings: defaultEditorSettings,
        },
      }),
      mount(ContinuousMarkdownEditor, {
        attachTo: document.body,
        props: {
          modelValue: continuousSource,
          outline: [],
          readonly: true,
          settings: defaultEditorSettings,
        },
      }),
    ];
    await settleUi();

    for (const wrapper of wrappers) {
      const image = wrapper.get<HTMLImageElement>('img[alt="broken"]');
      image.element.dispatchEvent(new Event("error"));
      await nextTick();
      expect(image.element.hidden).toBe(true);
      expect(image.element.dataset.markoImageState).toBe("error");
      expect(wrapper.get(".marko-image-error-source").text()).toBe(markdown);

      image.element.dispatchEvent(new Event("load"));
      await nextTick();
      expect(image.element.hidden).toBe(false);
      expect(wrapper.find(".marko-image-error-source").exists()).toBe(false);
      wrapper.unmount();
    }
  });

  it("缺失图片引用保留源码，Continuous 仍可点击编辑 alt", async () => {
    const source = "Cursor\n\n![logo][missing]";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    const missing = wrapper.get(".marko-image-reference-missing");
    expect(missing.text()).toBe("![logo][missing]");
    expect(missing.attributes("data-marko-image-state")).toBe("missing-reference");
    await missing.trigger("click");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    await settleUi();

    const state = (wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    }).getViewState();
    expect(source.slice(state.anchor, state.head)).toBe("logo");
    wrapper.unmount();
  });

  it("缺失引用不会占用后续同 alt 有效图片的源码绑定", async () => {
    const valid = "![same](ok.png)";
    const source = `![same][missing] ${valid}`;
    const wrappers = [
      mount(MarkdownPreview, {
        props: { source, outline: [], settings: defaultEditorSettings },
      }),
      mount(RichMarkdownBlock, {
        props: {
          source,
          documentSource: source,
          outline: [],
          settings: defaultEditorSettings,
        },
      }),
    ];
    await settleUi();

    for (const wrapper of wrappers) {
      const image = wrapper.get<HTMLImageElement>('img[alt="same"]');
      expect(image.element.dataset.markoImageSource).toBe(valid);
      image.element.dispatchEvent(new Event("error"));
      await nextTick();
      expect(wrapper.get(".marko-image-error-source").text()).toBe(valid);
      wrapper.unmount();
    }
  });

  it("已定义引用图片与后续同 alt 图片仍按源码顺序绑定", async () => {
    const first = "![same][ok]";
    const second = "![same](second.png)";
    const source = `${first} ${second}\n\n[ok]: first.png`;
    const wrapper = mount(MarkdownPreview, {
      props: { source, outline: [], settings: defaultEditorSettings },
    });
    await settleUi();

    expect(wrapper.findAll<HTMLImageElement>('img[alt="same"]')
      .map((image) => image.element.dataset.markoImageSource))
      .toEqual([first, second]);
    wrapper.unmount();
  });

  it("忽略 CodeMirror 内部的图片缓冲节点", () => {
    const root = document.createElement("div");
    const createRealImage = (alt: string) => {
      const image = document.createElement("img");
      image.className = "cm-widgetBuffer";
      image.setAttribute("aria-hidden", "true");
      image.src = alt + ".png";
      image.alt = alt;
      Object.defineProperty(image, "naturalWidth", { configurable: true, value: 1 });
      return image;
    };
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const buffer = document.createElement("img");
    buffer.className = "cm-widgetBuffer";
    buffer.setAttribute("aria-hidden", "true");
    const editorImage = createRealImage("editor-real");
    const renderedImage = createRealImage("real");
    editor.append(buffer, editorImage);
    root.append(editor, renderedImage);

    prepareRenderedImages(root, "![editor-real](editor.png) ![real](real.png)");

    expect(buffer.dataset.markoImageStateBound).toBeUndefined();
    expect(buffer.dataset.markoImageSource).toBeUndefined();
    expect(buffer.hidden).toBe(false);
    expect(editorImage.dataset.markoImageStateBound).toBe("true");
    expect(editorImage.dataset.markoImageState).toBe("loaded");
    expect(editorImage.dataset.markoImageSource).toBe("![editor-real](editor.png)");
    expect(editorImage.hidden).toBe(false);
    expect(renderedImage.dataset.markoImageStateBound).toBe("true");
    expect(renderedImage.dataset.markoImageState).toBe("loaded");
    expect(renderedImage.dataset.markoImageSource).toBe("![real](real.png)");
    expect(renderedImage.hidden).toBe(false);
    expect(root.querySelector(".marko-image-error-source")).toBeNull();
  });
  it("表格图片失败后显示源码，点击回到当前单元格编辑", async () => {
    const imageSource = "![cell](missing.png)";
    const source = `| 图片 |\n| --- |\n| ${imageSource} |`;
    const wrapper = mount(VisualTableEditor, {
      attachTo: document.body,
      props: {
        source,
        documentSource: source,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    const image = wrapper.get<HTMLImageElement>('tbody img[alt="cell"]');
    image.element.dispatchEvent(new Event("error"));
    await nextTick();
    const fallback = wrapper.get("tbody .marko-image-error-source");
    expect(fallback.text()).toBe(imageSource);
    await fallback.trigger("mousedown");
    await settleUi();

    const editor = wrapper.get(
      '.table-cell-inline-editor[data-table-row="1"][data-table-column="0"]',
    );
    expect(editor.isVisible()).toBe(true);
    expect(editor.get(".cm-line").text()).toBe(imageSource);
    expect(wrapper.find(".cm-widgetBuffer[data-marko-image-state-bound]").exists()).toBe(false);
    expect(wrapper.find(".cm-widgetBuffer.marko-image-error").exists()).toBe(false);
    expect(wrapper.emitted("update")).toBeUndefined();
    wrapper.unmount();
  });
  it("keeps fragmented preview reference image failures tied to Markdown source", async () => {
    const imageSource = "![preview][asset]";
    const documentSource = `Before\n\n${imageSource}\n\n[asset]: missing.png`;
    const wrapper = mount(MarkdownPreview, {
      props: {
        source: imageSource,
        documentSource,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    const image = wrapper.get<HTMLImageElement>('img[alt="preview"]');
    expect(image.element.dataset.markoImageSource).toBe(imageSource);
    image.element.dispatchEvent(new Event("error"));
    await nextTick();

    expect(wrapper.get(".marko-image-error-source").text()).toBe(imageSource);
    wrapper.unmount();
  });

  it("keeps continuous inline and block reference image failures tied to Markdown source", async () => {
    const fixtures = [
      {
        imageSource: "![inline][inline-asset]",
        modelValue: "Before ![inline][inline-asset] after\n\n[inline-asset]: inline.png",
        selector: '.cm-rendered-inline-image img[alt="inline"]',
      },
      {
        imageSource: "![block][block-asset]",
        modelValue: "![block][block-asset]\n\n[block-asset]: block.png",
        selector: '.cm-special-preview-image img[alt="block"]',
      },
    ];

    for (const fixture of fixtures) {
      const wrapper = mount(ContinuousMarkdownEditor, {
        attachTo: document.body,
        props: {
          modelValue: fixture.modelValue,
          outline: [],
          readonly: true,
          settings: defaultEditorSettings,
        },
      });
      await settleUi();

      const image = wrapper.get<HTMLImageElement>(fixture.selector);
      expect(image.element.dataset.markoImageSource).toBe(fixture.imageSource);
      image.element.dispatchEvent(new Event("error"));
      await nextTick();

      expect(wrapper.get(".marko-image-error-source").text()).toBe(fixture.imageSource);
      wrapper.unmount();
    }
  });

  it("keeps table reference image failures tied to definitions outside the table block", async () => {
    const imageSource = "![cell-reference][asset]";
    const tableSource = `| Image |\n| --- |\n| ${imageSource} |`;
    const documentSource = `Before\n\n${tableSource}\n\n[asset]: missing.png`;
    const wrapper = mount(VisualTableEditor, {
      attachTo: document.body,
      props: {
        source: tableSource,
        documentSource,
        outline: [],
        settings: defaultEditorSettings,
      },
    });
    await settleUi();

    const image = wrapper.get<HTMLImageElement>('tbody img[alt="cell-reference"]');
    expect(image.element.dataset.markoImageSource).toBe(imageSource);
    image.element.dispatchEvent(new Event("error"));
    await nextTick();

    expect(wrapper.get("tbody .marko-image-error-source").text()).toBe(imageSource);
    wrapper.unmount();
  });
});

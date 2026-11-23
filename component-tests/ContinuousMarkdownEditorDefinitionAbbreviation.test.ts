import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

function mountEditor(source: string, readonly = false, html = true) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly,
      settings: {
        ...defaultEditorSettings,
        extensions: {
          ...defaultEditorSettings.extensions,
          html,
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

function dispatchCompleteClick(target: Element) {
  target.dispatchEvent(new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: 0,
    clientY: 0,
    detail: 1,
  }));
  target.dispatchEvent(new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    detail: 1,
  }));
  target.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 0,
    clientY: 0,
    detail: 1,
  }));
}

describe("ContinuousMarkdownEditor 定义列表与缩写语义", () => {
  it("以真实 dl、dt、dd 显示多定义、宽松段落和引用内定义列表", async () => {
    const source = [
      "术语 **一**",
      ": 第一条 `定义`",
      ": 第二条定义",
      "",
      "宽松术语",
      ": 第一段",
      "",
      "    第二段",
      "",
      "> 引用术语",
      "> : 引用定义",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    const previews = wrapper.findAll(".cm-special-preview-definition");
    expect(previews).toHaveLength(3);
    expect(previews[0]!.findAll("dt").map((node) => node.text())).toEqual(["术语 一"]);
    expect(previews[0]!.findAll("dd").map((node) => node.text())).toEqual(["第一条 定义", "第二条定义"]);
    expect(previews[1]!.findAll("dd p").map((node) => node.text())).toEqual(["第一段", "第二段"]);
    expect(previews[2]!.find("blockquote dl").exists()).toBe(true);
    expect(previews[2]!.get("blockquote dd").text()).toBe("引用定义");
    wrapper.unmount();
  });

  it("点击或选区进入定义列表时恢复完整源码，只读模式始终保持语义显示", async () => {
    const source = "光标\n\n术语\n: 第一条定义\n: 第二条定义";
    const wrapper = mountEditor(source);
    await settleUi();
    expect(wrapper.find(".cm-special-preview-definition").exists()).toBe(true);

    await wrapper.get(".cm-special-preview-definition").trigger("click");
    await settleUi();
    expect(wrapper.find(".cm-special-preview-definition").exists()).toBe(false);
    expect(wrapper.text()).toContain(": 第一条定义");
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const secondDefinition = source.indexOf(": 第二条定义") + 2;
    await editor.selectRange(secondDefinition, secondDefinition);
    await settleUi();
    expect(wrapper.text()).toContain(": 第二条定义");
    wrapper.unmount();

    const readonly = mountEditor(source, true);
    await settleUi();
    await readonly.get(".cm-special-preview-definition").trigger("click");
    await settleUi();
    expect(readonly.find(".cm-special-preview-definition").exists()).toBe(true);
    readonly.unmount();
  });

  it("将链接引用定义显示为独立字段，并按点击字段选择精确源码", async () => {
    const source = [
      "Cursor",
      "",
      '[Docs Label]: <https://example.com/docs> "Docs title"',
    ].join("\n");
    const readonly = mountEditor(source, true);
    await settleUi();

    const definition = readonly.get(".cm-reference-definition");
    expect(definition.get(".cm-reference-definition-name").text()).toBe("Docs Label");
    expect(definition.get(".cm-reference-definition-url").text()).toBe("https://example.com/docs");
    expect(definition.get(".cm-reference-definition-title").text()).toBe("Docs title");
    expect(readonly.text()).not.toContain("[Docs Label]:");
    const pointerDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    definition.get(".cm-reference-definition-url").element.dispatchEvent(pointerDown);
    expect(pointerDown.defaultPrevented).toBe(false);
    readonly.unmount();

    const cases = [
      {
        selector: ".cm-reference-definition-name",
        from: source.indexOf("Docs Label"),
        to: source.indexOf("Docs Label") + "Docs Label".length,
      },
      {
        selector: ".cm-reference-definition-url",
        from: source.indexOf("https://example.com/docs"),
        to: source.indexOf("https://example.com/docs") + "https://example.com/docs".length,
      },
      {
        selector: ".cm-reference-definition-title",
        from: source.indexOf("Docs title"),
        to: source.indexOf("Docs title") + "Docs title".length,
      },
    ];

    for (const current of cases) {
      const editable = mountEditor(source);
      await settleUi();
      dispatchCompleteClick(editable.get(current.selector).element);
      await settleUi();
      const state = (editable.vm as unknown as {
        getViewState: () => { anchor: number; head: number };
      }).getViewState();
      expect(state).toMatchObject({ anchor: current.from, head: current.from });
      expect(editable.find(".cm-reference-definition").exists()).toBe(false);
      expect(editable.text()).toContain("[Docs Label]:");
      editable.unmount();
    }
  });

  it("保留下一行链接标题，并在选区离开后恢复语义显示", async () => {
    const source = [
      "Cursor",
      "",
      "[docs]: /guide",
      "  'Guide title'",
      "",
      "After",
    ].join("\r\n");
    const wrapper = mountEditor(source);
    await settleUi();

    expect(wrapper.get(".cm-reference-definition-title").text()).toBe("Guide title");
    dispatchCompleteClick(wrapper.get(".cm-reference-definition-title").element);
    await settleUi();
    expect(wrapper.find(".cm-reference-definition").exists()).toBe(false);

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const after = source.indexOf("After");
    await editor.selectRange(after, after, false);
    await settleUi();
    expect(wrapper.find(".cm-reference-definition").exists()).toBe(true);
    wrapper.unmount();
  });

  it("保留引用与列表内链接定义的容器层级", async () => {
    const source = [
      "Cursor",
      "",
      "> [quote]: /quoted.md",
      "",
      "- [listed]: /listed.md",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    const definitions = wrapper.findAll(".cm-reference-definition");
    expect(definitions).toHaveLength(2);
    expect(definitions[0]!.classes()).toContain("cm-preview-quote-container");
    expect(definitions[1]!.classes()).toContain("cm-preview-list-container");
    wrapper.unmount();
  });


  it("隐藏非活动缩写定义并用 abbr 显示正文，排除代码、链接目标、HTML 和数学", async () => {
    const source = [
      "HTML [HTML](https://HTML.example/path) `HTML` <span>HTML</span> $\\text{HTML}$",
      "",
      "*[HTML]: Hyper Text Markup Language",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    const abbreviations = wrapper.findAll("abbr.cm-rendered-abbreviation");
    expect(abbreviations).toHaveLength(2);
    expect(abbreviations.map((node) => node.text())).toEqual(["HTML", "HTML"]);
    expect(abbreviations.every((node) => node.attributes("title") === "Hyper Text Markup Language")).toBe(true);
    expect(wrapper.get(".cm-rendered-inline-code").text()).toBe("HTML");
    expect(wrapper.get(".cm-rendered-link").find("abbr.cm-rendered-abbreviation").exists()).toBe(true);
    expect(wrapper.get(".cm-rendered-inline-html").find("abbr").exists()).toBe(true);
    expect(wrapper.get(".cm-rendered-inline-math").find("abbr").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Hyper Text Markup Language");
    expect(wrapper.find(".cm-abbreviation-definition-hidden").exists()).toBe(true);
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      runCommand: (command: string) => void;
    };
    const targetOffset = source.indexOf("HTML.example") + 2;
    await editor.selectRange(targetOffset, targetOffset);
    editor.runCommand("openLink");
    expect(wrapper.emitted<string[]>("openLinkHref")?.at(-1)?.[0]).toBe("https://HTML.example/path");
    wrapper.unmount();

    const blockSource = [
      "HTML",
      "",
      "<div>",
      "HTML",
      "</div>",
      "",
      "$$",
      "\\text{HTML}",
      "$$",
      "",
      "*[HTML]: Hyper Text Markup Language",
    ].join("\n");
    const blocks = mountEditor(blockSource, true);
    await settleUi();
    const blockEditor = blocks.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const blockHtmlOffset = blockSource.indexOf("<div>") + 2;
    await blockEditor.selectRange(blockHtmlOffset, blockHtmlOffset);
    await settleUi();
    expect(blocks.get(".cm-special-preview-html").find("abbr").exists()).toBe(false);
    const blockMathOffset = blockSource.indexOf("$$") + 1;
    await blockEditor.selectRange(blockMathOffset, blockMathOffset);
    await settleUi();
    expect(blocks.get(".cm-special-preview-math").find("abbr").exists()).toBe(false);
    blocks.unmount();
  });

  it("进入缩写词或定义行时只恢复对应源码，并保持 HTML 扩展开关", async () => {
    const source = [
      "光标",
      "",
      "HTML 正文",
      "",
      "*[HTML]: Hyper Text Markup Language",
      "",
      "<span>HTML</span>",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };

    const paragraphOffset = source.indexOf("正文") + 1;
    await editor.selectRange(paragraphOffset, paragraphOffset);
    await settleUi();
    expect(wrapper.findAll("abbr.cm-rendered-abbreviation")).toHaveLength(1);

    const wordOffset = source.indexOf("HTML 正文") + 1;
    await editor.selectRange(wordOffset, wordOffset);
    await settleUi();
    expect(wrapper.find("abbr.cm-rendered-abbreviation").exists()).toBe(false);
    expect(wrapper.text()).toContain("HTML 正文");

    const definitionOffset = source.indexOf("*[HTML]") + 3;
    await editor.selectRange(definitionOffset, definitionOffset);
    await settleUi();
    expect(wrapper.find(".cm-abbreviation-definition-hidden").exists()).toBe(false);
    expect(wrapper.text()).toContain("*[HTML]: Hyper Text Markup Language");
    wrapper.unmount();

    const htmlDisabled = mountEditor([
      "HTML <span>HTML</span>",
      "",
      "*[HTML]: Hyper Text Markup Language",
      "",
      "<span>HTML</span>",
    ].join("\n"), true, false);
    await settleUi();
    expect(htmlDisabled.findAll("abbr.cm-rendered-abbreviation")).toHaveLength(3);
    const readonlyEditor = htmlDisabled.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const htmlSource = htmlDisabled.props("modelValue");
    const htmlOffset = htmlSource.indexOf("<span>") + 2;
    await readonlyEditor.selectRange(htmlOffset, htmlOffset);
    await settleUi();
    expect(htmlDisabled.text()).toContain("<span>HTML</span>");
    htmlDisabled.unmount();
  });

  it("collapses hidden abbreviation definitions to one normal paragraph gap", async () => {
    const source = [
      "before",
      "",
      "*[HTML]: Hyper Text Markup Language",
      "*[CSS]: Cascading Style Sheets",
      "",
      "after",
    ].join("\n");
    const wrapper = mountEditor(source, true);
    await settleUi();

    expect(wrapper.findAll(".cm-abbreviation-definition-hidden")).toHaveLength(1);
    expect(wrapper.findAll(".cm-block-gap")).toHaveLength(2);
    expect(wrapper.findAll(".cm-block-gap:not(.cm-block-gap-extra)")).toHaveLength(1);
    expect(wrapper.findAll(".cm-block-gap-extra")).toHaveLength(1);
    wrapper.unmount();
  });
});

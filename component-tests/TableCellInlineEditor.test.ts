import { EditorView } from "@codemirror/view";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import TableCellInlineEditor from "@/components/TableCellInlineEditor.vue";
import tableCellEditorSource from "@/components/TableCellInlineEditor.vue?raw";
import { defaultEditorSettings } from "@/utils/editorSettings";
import type { EditorSettings } from "@/types";
import type { TableCellInlineEditorHandle } from "@/utils/tableCellInlineEditor";

interface MountEditorOptions {
  documentSource?: string;
  sourceOffset?: number;
  settings?: EditorSettings;
  filePath?: string;
  assetResolver?: (path: string) => string;
}

function mountEditor(value: string, options: MountEditorOptions = {}) {
  return mount(TableCellInlineEditor, {
    attachTo: document.body,
    props: {
      value,
      documentSource: options.documentSource ?? value,
      row: 1,
      column: 0,
      sourceOffset: options.sourceOffset ?? 0,
      outline: [],
      settings: options.settings ?? defaultEditorSettings,
      filePath: options.filePath,
      assetResolver: options.assetResolver,
    },
  });
}

function getView(wrapper: ReturnType<typeof mountEditor>): EditorView {
  const content = wrapper.get<HTMLElement>(".cm-content").element;
  const view = EditorView.findFromDOM(content);
  if (!view) throw new Error("未找到表格单元格 CodeMirror");
  return view;
}

async function focusAt(wrapper: ReturnType<typeof mountEditor>, position: number) {
  (wrapper.vm as unknown as TableCellInlineEditorHandle).focus({
    anchor: position,
    head: position,
  });
  await nextTick();
  return getView(wrapper);
}

describe("TableCellInlineEditor", () => {
  it("失焦时完整渲染，聚焦后只展开光标所在的最小节点", async () => {
    const source = "**bold alpha** *italic beta* `code gamma`";
    const wrapper = mountEditor(source);
    await nextTick();

    expect(wrapper.find(".cm-table-inline-source-marker").exists()).toBe(false);
    expect(wrapper.get(".cm-table-inline-strong").text()).toBe("bold alpha");
    expect(wrapper.get(".cm-table-inline-emphasis").text()).toBe("italic beta");
    expect(wrapper.get(".cm-table-inline-widget-code").text()).toBe("code gamma");

    await focusAt(wrapper, 4);

    expect(wrapper.findAll(".cm-table-inline-source-marker").map((node) => node.text()))
      .toEqual(["**", "**"]);
    expect(wrapper.get(".cm-table-inline-strong").text()).toBe("bold alpha");
    expect(wrapper.get(".cm-table-inline-emphasis").text()).toBe("italic beta");
    expect(wrapper.get(".cm-table-inline-widget-code").text()).toBe("code gamma");
    wrapper.unmount();
  });

  it("展开行内代码时保留代码样式和两端标记", async () => {
    const wrapper = mountEditor("before `code` after");
    await nextTick();
    const beforeHost = wrapper.get(".table-cell-inline-editor").element;
    const beforeLine = wrapper.get(".cm-line").element;

    await focusAt(wrapper, 9);

    expect(wrapper.findAll(".cm-table-inline-source-marker").map((node) => node.text()))
      .toEqual(["`", "`"]);
    expect(wrapper.get(".cm-table-inline-code").text()).toBe("code");
    expect(wrapper.get(".table-cell-inline-editor").element).toBe(beforeHost);
    expect(wrapper.get(".cm-line").element).toBe(beforeLine);
    expect(tableCellEditorSource).toMatch(
      /\.cm-table-inline-code\),[\s\S]*?border:\s*1px solid #e7eaed;[\s\S]*?padding:\s*0 2px;/,
    );
    wrapper.unmount();
  });

  it("三击选择整格但继续隐藏 Markdown 标记", async () => {
    const source = "**bold** and `code`";
    const wrapper = mountEditor(source);
    const view = await focusAt(wrapper, 3);
    const content = wrapper.get<HTMLElement>(".cm-content");

    content.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 3,
    }));
    await vi.waitFor(() => {
      expect(view.state.selection.main.anchor).toBe(0);
      expect(view.state.selection.main.head).toBe(source.length);
    });

    expect(wrapper.find(".cm-table-inline-source-marker").exists()).toBe(false);
    expect(wrapper.get(".cm-table-inline-strong").text()).toBe("bold");
    expect(wrapper.get(".cm-table-inline-widget-code").text()).toBe("code");
    wrapper.unmount();
  });

  it("Ctrl+A 选择整格并保持渲染态", async () => {
    const source = "**bold** and `code`";
    const wrapper = mountEditor(source);
    const view = await focusAt(wrapper, 3);

    view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "a",
      ctrlKey: true,
    }));
    await nextTick();

    expect(view.state.selection.main.anchor).toBe(0);
    expect(view.state.selection.main.head).toBe(source.length);
    expect(wrapper.find(".cm-table-inline-source-marker").exists()).toBe(false);
    expect(wrapper.get(".cm-table-inline-strong").text()).toBe("bold");
    expect(wrapper.get(".cm-table-inline-widget-code").text()).toBe("code");
    wrapper.unmount();
  });

  it("代码、数学和 HTML 内部不生成删除线、Emoji 或自动链接伪节点", async () => {
    const code = "`~~x~~ :smile: https://x.test`";
    const math = "$~~y~~ :smile: https://y.test$";
    const html = "<span>~~z~~ :smile: https://z.test</span>";
    const source = [code, math, html].join(" ");
    const wrapper = mountEditor(source);
    await nextTick();

    await focusAt(wrapper, code.indexOf("x"));
    expect(wrapper.find(".cm-table-inline-strike").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-widget-emoji").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-link").exists()).toBe(false);
    expect(wrapper.get(".cm-table-inline-code").text()).toContain("~~x~~ :smile: https://x.test");

    await focusAt(wrapper, source.indexOf("y"));
    expect(wrapper.find(".cm-table-inline-strike").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-widget-emoji").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-link").exists()).toBe(false);

    await focusAt(wrapper, source.indexOf("z"));
    expect(wrapper.find(".cm-table-inline-strike").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-widget-emoji").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-link").exists()).toBe(false);
    wrapper.unmount();
  });

  it("数学整体覆盖内部实体、转义和换行节点", async () => {
    const entityMath = "$x &amp; y$";
    const escapeMath = "$\\{x\\}$";
    const matrixMath = "$a \\\\ b$";
    const source = [entityMath, escapeMath, matrixMath].join(" ");
    const wrapper = mountEditor(source);
    await nextTick();

    expect(wrapper.findAll(".cm-table-inline-widget-math")).toHaveLength(3);
    expect(wrapper.find(".cm-table-inline-widget-entity").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-widget-escape").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-widget-hardbreak").exists()).toBe(false);

    const entityWidget = wrapper.findAll<HTMLElement>(".cm-table-inline-widget-math")[0]!;
    entityWidget.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    }));
    await nextTick();

    expect(wrapper.findAll(".cm-table-inline-widget-math")).toHaveLength(2);
    expect(wrapper.find(".cm-table-inline-widget-entity").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-widget-escape").exists()).toBe(false);

    await focusAt(wrapper, source.indexOf("\\{") + 1);
    expect(wrapper.findAll(".cm-table-inline-widget-math")).toHaveLength(2);
    expect(wrapper.find(".cm-table-inline-widget-escape").exists()).toBe(false);

    await focusAt(wrapper, source.lastIndexOf("\\\\") + 1);
    expect(wrapper.findAll(".cm-table-inline-widget-math")).toHaveLength(2);
    expect(wrapper.find(".cm-table-inline-widget-hardbreak").exists()).toBe(false);
    wrapper.unmount();
  });

  it("行内脚注整体覆盖内部实体和转义节点", async () => {
    const first = "^[a&amp;]";
    const second = "^[a\\*]";
    const source = first + " " + second;
    const wrapper = mountEditor(source);
    await nextTick();

    expect(wrapper.findAll(".cm-table-inline-widget-footnote")).toHaveLength(2);
    expect(wrapper.find(".cm-table-inline-widget-entity").exists()).toBe(false);
    expect(wrapper.find(".cm-table-inline-widget-escape").exists()).toBe(false);
    const links = wrapper.findAll(".cm-table-inline-widget-footnote .footnote-ref a");
    expect(links.map((link) => link.text())).toEqual(["[1]", "[2]"]);
    expect(links.map((link) => link.attributes("href"))).toEqual(["#fn1", "#fn2"]);
    expect(links.map((link) => link.attributes("title"))).toEqual(["a&", "a*"]);

    wrapper.get<HTMLElement>(".cm-table-inline-widget-footnote").element.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    await nextTick();

    expect(wrapper.findAll(".cm-table-inline-widget-footnote")).toHaveLength(1);
    expect(wrapper.get(".cm-table-inline-widget-footnote .footnote-ref a").text()).toBe("[2]");
    expect(wrapper.get(".cm-table-inline-widget-footnote .footnote-ref a").attributes("title")).toBe("a*");
    expect(wrapper.find(".cm-table-inline-widget-entity").exists()).toBe(false);
    await focusAt(wrapper, source.indexOf("\\*") + 1);
    expect(wrapper.findAll(".cm-table-inline-widget-footnote")).toHaveLength(1);
    expect(wrapper.find(".cm-table-inline-widget-escape").exists()).toBe(false);
    wrapper.unmount();
  });

  it("sourceOffset 变化时按两个相同脚注的全文位置更新编号", async () => {
    const source = "^[same]";
    const documentSource = source + "\n\n" + source;
    const sourceOffset = documentSource.lastIndexOf(source);
    const wrapper = mountEditor(source, { documentSource, sourceOffset });
    await nextTick();

    expect(sourceOffset).toBeGreaterThan(0);
    const getLink = () => wrapper.get(".cm-table-inline-widget-footnote .footnote-ref a");
    expect(getLink().text()).toBe("[2]");
    expect(getLink().attributes("href")).toBe("#fn2");
    expect(getLink().attributes("title")).toBe("same");

    await wrapper.setProps({ sourceOffset: 0 });
    await nextTick();
    expect(getLink().text()).toBe("[1]");
    expect(getLink().attributes("href")).toBe("#fn1");
    expect(getLink().attributes("title")).toBe("same");
    wrapper.unmount();
  });

  it("sourceOffset 与源码不一致时不套用别处的脚注内容", async () => {
    const source = "^[second]";
    const documentSource = "^[first]\n\n" + source;
    const wrapper = mountEditor(source, { documentSource, sourceOffset: 0 });
    await nextTick();

    const link = wrapper.get(".cm-table-inline-widget-footnote .footnote-ref a");
    expect(link.text()).toBe("[1]");
    expect(link.attributes("href")).toBe("#fn1");
    expect(link.attributes("title")).toBe("second");
    wrapper.unmount();
  });

  it("未定义普通脚注和数学公式内伪脚注不推偏全文行内脚注编号", async () => {
    const source = "^[actual]";
    const documentSource = [
      "[^defined]",
      "[^missing]",
      "$^[not-a-footnote]$",
      source,
      "[^defined]: defined note",
    ].join("\n\n");
    const sourceOffset = documentSource.indexOf(source);
    const wrapper = mountEditor(source, { documentSource, sourceOffset });
    await nextTick();

    const link = wrapper.get(".cm-table-inline-widget-footnote .footnote-ref a");
    expect(link.text()).toBe("[2]");
    expect(link.attributes("href")).toBe("#fn2");
    expect(link.attributes("title")).toBe("actual");
    wrapper.unmount();
  });

  it("无文本图片和公式点击时使用源码 midpoint 定位", async () => {
    const fixtures = [
      {
        source: "![a](x.png)",
        selector: ".cm-table-inline-widget-image",
      },
      {
        source: "$x+y$",
        selector: ".cm-table-inline-widget-math",
      },
    ];

    for (const fixture of fixtures) {
      const wrapper = mountEditor(fixture.source, {
        filePath: "C:/docs/current.md",
        assetResolver: () => "https://example.com/x.png",
      });
      await nextTick();
      const widget = wrapper.get<HTMLElement>(fixture.selector);
      expect(widget.element.textContent).toBe("");

      widget.element.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      }));
      await nextTick();

      const selection = getView(wrapper).state.selection.main;
      expect(selection.anchor).toBe(Math.floor(fixture.source.length / 2));
      expect(selection.head).toBe(Math.floor(fixture.source.length / 2));
      wrapper.unmount();
    }
  });

  it("链接内图片作为整体渲染并支持修饰键打开外层链接", async () => {
    const wrapper = mountEditor("[![a](x.png)](https://example.com)");
    await nextTick();
    const widget = wrapper.get<HTMLElement>(".cm-table-inline-widget-link");
    const image = widget.get("img");
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });

    image.element.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted("openLink")).toEqual([["https://example.com"]]);
    wrapper.unmount();
  });

  it("图片真实双击序列选择完整 Markdown 源码且不拦截普通文本双击", async () => {
    const image = "![alt](x.png)";
    const source = `before ${image} after`;
    const imageStart = source.indexOf(image);
    const wrapper = mountEditor(source, {
      filePath: "C:/docs/current.md",
      assetResolver: () => "https://example.com/x.png",
    });
    await nextTick();

    wrapper.get<HTMLElement>(".cm-table-inline-widget-image").element.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
      }),
    );
    await nextTick();
    expect(wrapper.find(".cm-table-inline-widget-image").exists()).toBe(false);

    const line = wrapper.get<HTMLElement>(".cm-line");
    const secondMouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
    });
    line.element.dispatchEvent(secondMouseDown);
    const imageDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
    });
    line.element.dispatchEvent(imageDoubleClick);
    await nextTick();

    expect(secondMouseDown.defaultPrevented).toBe(true);
    expect(imageDoubleClick.defaultPrevented).toBe(true);
    expect(getView(wrapper).state.selection.main).toMatchObject({
      anchor: imageStart,
      head: imageStart + image.length,
    });
    expect(wrapper.emitted("doubleClick")).toBeUndefined();

    const plainDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
    });
    wrapper.get<HTMLElement>(".cm-line").element.dispatchEvent(plainDoubleClick);

    expect(plainDoubleClick.defaultPrevented).toBe(false);
    expect(wrapper.emitted("doubleClick")).toEqual([[plainDoubleClick]]);
    wrapper.unmount();
  });

  it("链接图片双击选择包含外层链接的完整 Markdown 源码", async () => {
    const source = "[![alt](x.png)](https://example.com)";
    const wrapper = mountEditor(source, {
      filePath: "C:/docs/current.md",
      assetResolver: () => "https://example.com/x.png",
    });
    await nextTick();

    const event = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
    });
    wrapper.get<HTMLElement>(".cm-table-inline-widget-link img").element.dispatchEvent(event);
    await nextTick();

    expect(event.defaultPrevented).toBe(true);
    expect(getView(wrapper).state.selection.main).toMatchObject({
      anchor: 0,
      head: source.length,
    });
    expect(wrapper.emitted("doubleClick")).toBeUndefined();
    wrapper.unmount();
  });

  it("Shift+点击原子节点时保留原选区锚点", async () => {
    const source = "head :smile: tail";
    const wrapper = mountEditor(source);
    const view = await focusAt(wrapper, 2);
    view.dispatch({ selection: { anchor: 2, head: 2 } });
    const widget = wrapper.get<HTMLElement>(".cm-table-inline-widget-emoji");

    widget.element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    }));
    await nextTick();

    expect(view.state.selection.main.anchor).toBe(2);
    expect(view.state.selection.main.head).toBe(source.indexOf(":smile:") + 3);
    wrapper.unmount();
  });

  it("相邻节点共享边界时同时展开光标两侧节点", async () => {
    const source = "**a****b**";
    const wrapper = mountEditor(source);
    await focusAt(wrapper, 5);
    const markers = wrapper.findAll<HTMLElement>(".cm-table-inline-source-marker");

    expect(markers).toHaveLength(4);
    expect(wrapper.get(".cm-line").text()).toBe(source);
    expect(wrapper.findAll(".cm-table-inline-strong").map((node) => node.text()))
      .toEqual(["a", "b"]);
    wrapper.unmount();
  });

  it("assetResolver 变化后重新渲染图片 widget", async () => {
    const firstResolver = vi.fn(() => "https://example.com/first.png");
    const secondResolver = vi.fn(() => "https://example.com/second.png");
    const wrapper = mountEditor("![a](x.png)", {
      filePath: "C:/docs/current.md",
      assetResolver: firstResolver,
    });
    await nextTick();

    expect(wrapper.get(".cm-table-inline-widget-image img").attributes("src")).toBe("https://example.com/first.png");
    await wrapper.setProps({ assetResolver: secondResolver });
    await vi.waitFor(() => {
      expect(wrapper.get(".cm-table-inline-widget-image img").attributes("src")).toBe("https://example.com/second.png");
    });
    expect(secondResolver).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("IME 合成期间缓存外部值并在合成结束后应用", async () => {
    const wrapper = mountEditor("原值");
    const view = await focusAt(wrapper, 2);

    view.contentDOM.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await wrapper.setProps({ value: "外部值" });
    await nextTick();
    expect(view.state.doc.toString()).toBe("原值");

    view.contentDOM.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe("外部值");
    });
    expect(wrapper.emitted("update")).toBeUndefined();
    wrapper.unmount();
  });

  it("硬换行和脚注保持行内基线语义", async () => {
    const source = "a<br>b [^n]";
    const wrapper = mountEditor(source, {
      documentSource: source + "\n\n[^n]: note",
      sourceOffset: 0,
    });
    await nextTick();

    expect(wrapper.find(".cm-table-inline-widget-html br").exists()).toBe(true);
    expect(wrapper.find(".cm-table-inline-widget-footnote .footnote-ref").exists()).toBe(true);
    expect(tableCellEditorSource).toMatch(
      /\.cm-table-inline-widget\)[\s\S]*?display:\s*inline;[\s\S]*?vertical-align:\s*baseline;/,
    );
    expect(tableCellEditorSource).toMatch(
      /\.cm-table-inline-widget-footnote \.footnote-ref\)[\s\S]*?border-radius:\s*4px;[\s\S]*?background:\s*rgba\(238, 238, 238, 0\.7\);[\s\S]*?padding:\s*2px 4px;[\s\S]*?vertical-align:\s*super;/,
    );
    expect(tableCellEditorSource).toMatch(
      /\.cm-table-inline-widget-footnote \.footnote-ref a\)[\s\S]*?color:\s*inherit;[\s\S]*?text-decoration:\s*none;/,
    );
    expect(tableCellEditorSource).toMatch(
      /data-theme="dark"[\s\S]*?\.cm-table-inline-widget-footnote \.footnote-ref\)[\s\S]*?background:\s*rgba\(255, 255, 255, 0\.12\);[\s\S]*?color:\s*var\(--text-main\);/,
    );
    wrapper.unmount();
  });

  it("长内容与图片、公式具备稳定的换行、尺寸和溢出约束", () => {
    expect(tableCellEditorSource).toMatch(/\.cm-content\)[\s\S]*?overflow-wrap:\s*anywhere;/);
    expect(tableCellEditorSource).toMatch(
      /\.cm-table-inline-widget-image\),[\s\S]*?\.cm-table-inline-widget-math\)[\s\S]*?display:\s*inline-block;[\s\S]*?max-width:\s*100%;/,
    );
    expect(tableCellEditorSource).toMatch(/\.cm-table-inline-widget img\)[\s\S]*?height:\s*auto;[\s\S]*?margin:\s*0;/);
    expect(tableCellEditorSource).toMatch(/\.cm-table-inline-widget-math\)[\s\S]*?overflow-x:\s*auto;/);
  });

  it.each([
    ["historyUndo", "undo"],
    ["historyRedo", "redo"],
  ] as const)("将 %s 路由到外层历史命令", async (inputType, command) => {
    const wrapper = mountEditor("value");
    const view = await focusAt(wrapper, 2);
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType,
    });

    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.emitted("history")).toEqual([[command]]);
    wrapper.unmount();
  });
});

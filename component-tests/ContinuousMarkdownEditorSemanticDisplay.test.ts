import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

function mountEditor(
  source: string,
  options: {
    readonly?: boolean;
    html?: boolean;
    marks?: boolean;
    preserveSingleLineBreaks?: boolean;
    emoji?: boolean;
    autoLinks?: boolean;
    smartPunctuation?: boolean;
    smartQuotes?: boolean;
    smartDashes?: boolean;
  } = {},
) {
  return mount(ContinuousMarkdownEditor, {
    attachTo: document.body,
    props: {
      modelValue: source,
      outline: [],
      readonly: options.readonly,
      settings: {
        ...defaultEditorSettings,
        smartPunctuation: options.smartPunctuation ?? defaultEditorSettings.smartPunctuation,
        smartQuotes: options.smartQuotes
          ?? options.smartPunctuation
          ?? defaultEditorSettings.smartQuotes,
        smartDashes: options.smartDashes
          ?? options.smartPunctuation
          ?? defaultEditorSettings.smartDashes,
        preserveSingleLineBreaks: options.preserveSingleLineBreaks
          ?? defaultEditorSettings.preserveSingleLineBreaks,
        extensions: {
          ...defaultEditorSettings.extensions,
          html: options.html ?? defaultEditorSettings.extensions.html,
          marks: options.marks ?? defaultEditorSettings.extensions.marks,
          emoji: options.emoji ?? defaultEditorSettings.extensions.emoji,
          autoLinks: options.autoLinks ?? defaultEditorSettings.extensions.autoLinks,
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

describe("ContinuousMarkdownEditor plus syntax regression", () => {
  it("does not render plus-only paragraphs or recursive lists as horizontal rules", async () => {
    const paragraph = mountEditor("+++\n\nBody", { readonly: true });
    await settleUi();
    expect(paragraph.find(".cm-horizontal-rule").exists()).toBe(false);
    expect(paragraph.get(".cm-paragraph").text()).toContain("+++");
    paragraph.unmount();

    const list = mountEditor("+ + +\n\nBody", { readonly: true });
    await settleUi();
    expect(list.find(".cm-horizontal-rule").exists()).toBe(false);
    expect(list.find(".cm-bullet-list").exists()).toBe(true);
    expect(list.findAll(".cm-rendered-bullet-marker")).toHaveLength(2);
    list.unmount();
  });
});

describe("ContinuousMarkdownEditor 正文语义显示", () => {
  it("将 Setext 标题显示为对应级别并仅在进入下划线时恢复源码", async () => {
    const source = "一级标题\n===\n\n正文";
    const wrapper = mountEditor(source);
    await settleUi();

    expect(wrapper.find(".cm-heading-1").exists()).toBe(true);
    expect(wrapper.findAll(".cm-setext-marker")).toHaveLength(1);
    expect(wrapper.get(".cm-setext-marker").text()).toBe("");

    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const markerOffset = source.indexOf("===");
    await editor.selectRange(markerOffset, markerOffset);
    await settleUi();

    expect(wrapper.get(".cm-setext-marker.cm-active-markdown-line").text()).toContain("===");
    wrapper.unmount();

    const secondLevel = mountEditor("二级标题\n---", { readonly: true });
    await settleUi();
    expect(secondLevel.find(".cm-heading-2").exists()).toBe(true);
    expect(secondLevel.get(".cm-setext-marker").text()).toBe("");
    secondLevel.unmount();

    for (const marker of ["=", "-"]) {
      const single = mountEditor("Title\n" + marker, { readonly: true });
      await settleUi();
      expect(single.find(".cm-setext-marker").exists()).toBe(false);
      expect(single.find(".cm-heading").exists()).toBe(false);
      single.unmount();
    }
  });

  it("水平线在光标离开时显示为细线并在进入时恢复可编辑源码", async () => {
    for (const marker of ["---", "* * *", "___"]) {
      const source = marker + "\n\n正文";
      const wrapper = mountEditor(source);
      await settleUi();
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number) => Promise<void>;
        insertText: (text: string) => void;
      };

      await editor.selectRange(source.length, source.length);
      await settleUi();
      expect(wrapper.get(".cm-horizontal-rule").text()).toBe("");

      await editor.selectRange(1, 1);
      await settleUi();
      const active = wrapper.get(".cm-horizontal-rule.cm-active-markdown-line");
      expect(active.text()).toContain(marker);

      if (marker === "---") {
        await editor.selectRange(3, 3);
        editor.insertText("-");
        await settleUi();
        expect(wrapper.get(".cm-horizontal-rule.cm-active-markdown-line").text()).toContain("----");
        expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toContain("----");
      }

      await editor.selectRange(100, 100);
      await settleUi();
      expect(wrapper.get(".cm-horizontal-rule").text()).toBe("");
      wrapper.unmount();
    }
  });

  it("列表项内的分隔线保留列表符号并在活动行恢复完整源码", async () => {
    const cases = [
      { source: "1. ---\n\n正文", markerSelector: ".cm-rendered-ordered-marker", marker: "---" },
      { source: "- ***\n\n正文", markerSelector: ".cm-rendered-bullet-marker", marker: "***" },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      const editor = wrapper.vm as unknown as {
        selectRange: (start: number, end: number) => Promise<void>;
      };

      await editor.selectRange(current.source.length, current.source.length);
      await settleUi();
      const line = wrapper.get(".cm-list-thematic-break:not(.cm-active-markdown-line)");
      expect(line.find(current.markerSelector).exists()).toBe(true);
      expect(line.find(".cm-rendered-list-thematic-break").attributes("role")).toBe("separator");
      expect(line.text()).not.toContain(current.marker);
      expect(wrapper.find(".cm-horizontal-rule").exists()).toBe(false);

      const markerFrom = current.source.indexOf(current.marker);
      await editor.selectRange(markerFrom + 1, markerFrom + 1);
      await settleUi();
      const active = wrapper.get(".cm-list-thematic-break.cm-active-markdown-line");
      expect(active.find(".cm-rendered-list-thematic-break").exists()).toBe(false);
      expect(active.find(".cm-rendered-list-marker").exists()).toBe(false);
      expect(active.text()).toContain(current.source.split("\n", 1)[0]);
      expect(wrapper.props("modelValue")).toBe(current.source);
      wrapper.unmount();
    }
  });

  it("引用内未闭合围栏结束后将引用外内容显示为普通正文", async () => {
    const cases = [
      ["> ```ts", "> const value = 1;", "引用外正文"].join("\n"),
      ["> $$", "> x^2", "引用外正文"].join("\n"),
    ];

    for (const source of cases) {
      const wrapper = mountEditor(source, { readonly: true });
      await settleUi();
      const outside = wrapper.get(".cm-paragraph");
      expect(outside.text()).toContain("引用外正文");
      expect(outside.classes()).not.toContain("cm-code");
      expect(outside.classes()).not.toContain("cm-math");
      wrapper.unmount();
    }
  });

  it("活动节点展开标记时仍保留删除线、高亮、上下标、代码和链接语义", async () => {
    const source = "~~删除~~ ==高亮== H~2~O x^2^ `代码==原样==` [链接](https://example.com) \\==转义==\n\n光标";
    const wrapper = mountEditor(source, { marks: true });
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange(source.length, source.length);
    await settleUi();

    expect(wrapper.get(".cm-rendered-strikethrough").text()).toBe("删除");
    expect(wrapper.get(".cm-rendered-highlight").text()).toBe("高亮");
    expect(wrapper.get(".cm-rendered-subscript").text()).toBe("2");
    expect(wrapper.get(".cm-rendered-superscript").text()).toBe("2");
    expect(wrapper.get(".cm-rendered-inline-code").text()).toBe("代码==原样==");
    expect(wrapper.get(".cm-rendered-link").text()).toBe("链接");
    expect(wrapper.findAll(".cm-rendered-highlight")).toHaveLength(1);

    await editor.selectRange(0, 0);
    await settleUi();
    expect(wrapper.get(".cm-rendered-strikethrough").text()).toBe("删除");
    expect(wrapper.text()).toContain("~~删除~~");
    expect(wrapper.find(".cm-rendered-highlight").exists()).toBe(true);
    expect(wrapper.get(".cm-rendered-link").text()).toBe("链接");
    wrapper.unmount();
  });

  it("renders highlights across soft line breaks without crossing protected boundaries", async () => {
    const softBreak = mountEditor("==first\nsecond==", { readonly: true, marks: true });
    await settleUi();
    expect(softBreak.findAll(".cm-rendered-highlight").map((node) => node.text()).join(""))
      .toBe("first second");
    softBreak.unmount();

    const blankBreak = mountEditor("==first\n\nsecond==", { readonly: true, marks: true });
    await settleUi();
    expect(blankBreak.find(".cm-rendered-highlight").exists()).toBe(false);
    blankBreak.unmount();

    const protectedSource = [
      "`==code==`",
      "",
      "```md",
      "==fence==",
      "```",
      "",
      '<span title="==attribute==">==body==</span>',
    ].join("\n");
    const protectedWrapper = mountEditor(protectedSource, { readonly: true, marks: true });
    await settleUi();
    expect(protectedWrapper.find(".cm-rendered-highlight").exists()).toBe(false);
    expect(protectedWrapper.findAll("mark").map((node) => node.text())).toEqual(["body"]);
    expect(protectedWrapper.get('span[title="==attribute=="]').attributes("title")).toBe("==attribute==");
    protectedWrapper.unmount();

    const triple = mountEditor("===triple===", { readonly: true, marks: true });
    await settleUi();
    expect(triple.get(".cm-rendered-highlight").text()).toBe("triple");
    expect(triple.text()).toBe("=triple=");
    triple.unmount();

    const adjacent = mountEditor("==one====two==", { readonly: true, marks: true });
    await settleUi();
    expect(adjacent.findAll(".cm-rendered-highlight").map((node) => node.text()))
      .toEqual(["one", "two"]);
    expect(adjacent.text()).toBe("onetwo");
    adjacent.unmount();

    const nestedHighlight = mountEditor("====x====", { readonly: true, marks: true });
    await settleUi();
    expect(nestedHighlight.find(".cm-rendered-highlight").exists()).toBe(true);
    expect(nestedHighlight.text()).toBe("x");
    nestedHighlight.unmount();

    const nestedSource = "==outer `code` [link](https://example.com) $x$ <u>html</u> after==";
    const nested = mountEditor(nestedSource, { readonly: true, marks: true, html: true });
    await settleUi();
    expect(nested.findAll(".cm-rendered-highlight").map((node) => node.text()).join(""))
      .toBe("outer code link  html after");
    expect(nested.get(".cm-rendered-inline-code").text()).toBe("code");
    expect(nested.get(".cm-rendered-link").text()).toBe("link");
    const inlineMath = nested.get(".cm-rendered-inline-math");
    expect(inlineMath.find('mjx-container[jax="SVG"] svg').exists()).toBe(true);
    expect(inlineMath.html()).toContain('data-latex="x"');
    expect(inlineMath.element.closest(".cm-rendered-highlight")).not.toBeNull();
    expect(nested.get(".cm-rendered-inline-html").text()).toContain("html");
    nested.unmount();
  });

  it("matches markdown-it strikethrough semantics for continuous tilde runs", async () => {
    const source = "before ~~~x~~~ after; ~~one~~~~two~~; `~~~code~~~`\n\ncursor";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await editor.selectRange(source.length, source.length);
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-strikethrough").map((node) => node.text()))
      .toEqual(["x", "one", "two"]);
    expect(wrapper.text()).toContain("before ~x~ after; onetwo");
    expect(wrapper.get(".cm-rendered-inline-code").text()).toBe("~~~code~~~");

    const x = source.indexOf("x");
    await editor.selectRange(x, x);
    await settleUi();
    expect(wrapper.text()).toContain("~~~x~~~");
    expect(wrapper.text()).toContain("onetwo");
    wrapper.unmount();

    const nested = mountEditor("before ~~~**nested**~~~ after", { readonly: true });
    await settleUi();
    const strong = nested.get(".cm-rendered-strong");
    expect(strong.text()).toBe("nested");
    expect(strong.element.closest(".cm-rendered-strikethrough")).not.toBeNull();
    expect(nested.text()).toBe("before ~nested~ after");
    nested.unmount();
  });

  it("renders inline HTML start tags split across soft lines as one protected widget", async () => {
    const source = [
      "before <span",
      'class="note" title=":smile: $x$ https://attr.example">text</span> after',
      "",
      "cursor",
    ].join("\n");
    const wrapper = mountEditor(source, {
      readonly: true,
      html: true,
      emoji: true,
      autoLinks: true,
    });
    await settleUi();

    const html = wrapper.get<HTMLElement>(".cm-rendered-inline-html .note");
    expect(html.text()).toBe("text");
    expect(html.attributes("title")).toBe(":smile: $x$ https://attr.example");
    expect(wrapper.text()).toContain("before text after");
    expect(wrapper.find(".cm-rendered-emoji").exists()).toBe(false);
    expect(wrapper.find(".cm-rendered-link").exists()).toBe(false);
    expect(wrapper.find(".cm-rendered-inline-math").exists()).toBe(false);
    expect(wrapper.text()).not.toContain('class="note"');
    wrapper.unmount();
  });

  it("renders CJK-adjacent underscore emphasis and reveals only the selected source", async () => {
    const source = "\u4E2D_em_\u6587 \u4E2D__strong__\u6587\n\ncursor";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };

    expect(wrapper.get(".cm-rendered-emphasis").text()).toBe("em");
    expect(wrapper.get(".cm-rendered-strong").text()).toBe("strong");
    expect(wrapper.text()).not.toContain("_em_");
    expect(wrapper.text()).not.toContain("__strong__");

    const emphasisOffset = source.indexOf("_em_") + 2;
    await editor.selectRange(emphasisOffset, emphasisOffset);
    await settleUi();
    expect(wrapper.get(".cm-rendered-emphasis").text()).toBe("em");
    expect(wrapper.get(".cm-rendered-strong").text()).toBe("strong");
    expect(wrapper.text()).toContain("_em_");
    expect(wrapper.text()).not.toContain("__strong__");
    wrapper.unmount();
  });

  it("reveals only the inline semantic node touched by the selection", async () => {
    const source = "**first** plain **second**";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };

    await editor.selectRange(source.indexOf("plain") + 2, source.indexOf("plain") + 2);
    await settleUi();
    expect(wrapper.findAll(".cm-rendered-strong").map((node) => node.text())).toEqual(["first", "second"]);

    const secondOffset = source.indexOf("second") + 2;
    await editor.selectRange(secondOffset, secondOffset);
    await settleUi();
    expect(wrapper.findAll(".cm-rendered-strong").map((node) => node.text())).toEqual(["first", "second"]);
    expect(wrapper.text()).toContain("**second**");
    expect(wrapper.text()).not.toContain("**first**");
    wrapper.unmount();
  });

  it("splits adjacent strong nodes and reveals both sides at their shared boundary", async () => {
    const source = "**a****b**";
    const readonly = mountEditor(source, { readonly: true });
    await settleUi();
    expect(readonly.findAll(".cm-rendered-strong").map((node) => node.text()))
      .toEqual(["a", "b"]);
    expect(readonly.get(".cm-line").text()).toBe("ab");
    readonly.unmount();

    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      insertText: (text: string) => void;
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await editor.selectRange(5, 5, false);
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-strong").map((node) => node.text()))
      .toEqual(["a", "b"]);
    expect(wrapper.get(".cm-line").text()).toBe(source);

    editor.insertText("X");
    await settleUi();
    expect((wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0])
      .toBe("**a**X**b**");
    wrapper.unmount();
  });

  it("活动行内节点仅展开自身标记并保留正文语义", async () => {
    const source = [
      "**粗体** *斜体* ~~删除~~ ==高亮== H~2~O x^2^ `代码`",
      "[行内](https://inline.example) [引用][ref] <https://auto.example>",
      "",
      "[ref]: https://reference.example",
    ].join("\n");
    const wrapper = mountEditor(source, { marks: true });
    await settleUi();
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const cases = [
      { raw: "**粗体**", text: "粗体", selector: ".cm-rendered-strong" },
      { raw: "*斜体*", text: "斜体", selector: ".cm-rendered-emphasis" },
      { raw: "~~删除~~", text: "删除", selector: ".cm-rendered-strikethrough" },
      { raw: "==高亮==", text: "高亮", selector: ".cm-rendered-highlight" },
      { raw: "~2~", text: "2", selector: ".cm-rendered-subscript" },
      { raw: "^2^", text: "2", selector: ".cm-rendered-superscript" },
      { raw: "`代码`", text: "代码", selector: ".cm-rendered-inline-code" },
      { raw: "[行内](https://inline.example)", text: "行内", selector: ".cm-rendered-link" },
      { raw: "[引用][ref]", text: "引用", selector: ".cm-rendered-link" },
      { raw: "<https://auto.example>", text: "https://auto.example", selector: ".cm-rendered-link" },
    ];

    for (const current of cases) {
      const nodeStart = source.indexOf(current.raw);
      const cursor = nodeStart + current.raw.indexOf(current.text) + Math.min(1, current.text.length);
      await editor.selectRange(cursor, cursor, false);
      await settleUi();

      expect(wrapper.findAll(current.selector).map((node) => node.text())).toContain(current.text);
      expect(wrapper.text()).toContain(current.raw);
      expect(editor.getViewState()).toEqual(expect.objectContaining({ anchor: cursor, head: cursor }));
      for (const adjacent of cases) {
        if (adjacent === current) continue;
        expect(wrapper.text()).not.toContain(adjacent.raw);
      }
    }
    wrapper.unmount();
  });

  it("消解闭合标题、转义、实体、自动链接和段落换行源码", async () => {
    const heading = mountEditor("# 闭合标题 #", { readonly: true });
    await settleUi();
    expect(heading.get(".cm-heading-1").text()).toBe("闭合标题");
    heading.unmount();

    const inline = mountEditor("转义 \\*星号，实体 &amp;，自动 <https://example.com>。", { readonly: true });
    await settleUi();
    expect(inline.text()).toContain("转义 *星号，实体 &，自动 https://example.com。");
    expect(inline.get(".cm-rendered-entity").text()).toBe("&");
    expect(inline.get(".cm-rendered-link").text()).toBe("https://example.com");
    inline.unmount();

    const softBreak = mountEditor("软换行第一行\n软换行第二行", { readonly: true });
    await settleUi();
    expect(softBreak.findAll(".cm-rendered-softbreak")).toHaveLength(1);
    expect(softBreak.text()).toContain("软换行第一行 软换行第二行");
    softBreak.unmount();

    const hardBreak = mountEditor("反斜杠强制换行\\\n强制换行下一行", { readonly: true });
    await settleUi();
    expect(hardBreak.text()).not.toContain("强制换行\\");
    expect(hardBreak.find(".cm-rendered-softbreak").exists()).toBe(false);
    hardBreak.unmount();

    const editable = mountEditor("# 闭合标题 #");
    await settleUi();
    expect(editable.get(".cm-heading-1").text()).toBe("闭合标题");
    editable.unmount();

    const preserved = mountEditor("第一行\n第二行", { preserveSingleLineBreaks: true, readonly: true });
    await settleUi();
    expect(preserved.find(".cm-rendered-softbreak").exists()).toBe(false);
    preserved.unmount();
  });

  it("活动 ATX 标题在 Home 和 End 后从可见正文边界继续编辑", async () => {
    const source = "# 标题正文 #";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
      insertText: (text: string) => void;
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const contentStart = source.indexOf("标题正文");
    await editor.selectRange(contentStart + 2, contentStart + 2);
    const content = wrapper.get<HTMLElement>(".cm-content");
    content.element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Home",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();

    expect(editor.getViewState()).toMatchObject({ anchor: contentStart, head: contentStart });
    expect(wrapper.get(".cm-heading-1").text()).toBe("标题正文");
    editor.insertText("新");
    await settleUi();
    expect((wrapper.emitted<string[]>(("update:modelValue")) ?? []).at(-1)?.[0])
      .toBe("# 新标题正文 #");
    expect(wrapper.get(".cm-heading-1").text()).toBe("新标题正文");

    const updated = "# 新标题正文 #";
    const updatedMiddle = updated.indexOf("标题正文") + 2;
    await editor.selectRange(updatedMiddle, updatedMiddle);
    content.element.dispatchEvent(new KeyboardEvent("keydown", {
      key: "End",
      bubbles: true,
      cancelable: true,
    }));
    await settleUi();
    const contentEnd = updated.lastIndexOf(" #");
    expect(editor.getViewState()).toMatchObject({ anchor: contentEnd, head: contentEnd });
    editor.insertText("末");
    await settleUi();
    expect((wrapper.emitted<string[]>(("update:modelValue")) ?? []).at(-1)?.[0])
      .toBe("# 新标题正文末 #");
    wrapper.unmount();
  });

  it("活动列表与引用标题隐藏井号但保留容器和源码位置", async () => {
    const source = [
      "- # 列表标题 #",
      "> - ## 引用列表标题 ##",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };

    const listPosition = source.indexOf("列表标题") + 1;
    await editor.selectRange(listPosition, listPosition, false);
    const listLine = wrapper.findAll<HTMLElement>(".cm-line")[0]!;
    expect(listLine.text()).toContain("列表标题");
    expect(listLine.text()).not.toContain("#");
    expect(listLine.get(".cm-rendered-bullet-marker").text()).toBe("•");
    expect(editor.getViewState()).toMatchObject({ anchor: listPosition, head: listPosition });

    const quotePosition = source.indexOf("引用列表标题") + 1;
    await editor.selectRange(quotePosition, quotePosition, false);
    const quoteLine = wrapper.findAll<HTMLElement>(".cm-line")[1]!;
    expect(quoteLine.text()).toContain("引用列表标题");
    expect(quoteLine.text()).not.toContain("#");
    expect(quoteLine.classes()).toEqual(expect.arrayContaining([
      "cm-blockquote",
      "cm-blockquote-depth-1",
    ]));
    expect(wrapper.findAll(".cm-rendered-bullet-marker").map((marker) => marker.text()))
      .toEqual(["•", "•"]);
    expect(editor.getViewState()).toMatchObject({ anchor: quotePosition, head: quotePosition });
    wrapper.unmount();
  });

  it("容器标题在 Home 和 End 后保持可见正文边界", async () => {
    const cases = [
      { source: "- # 列表标题 #", text: "列表标题" },
      { source: "> - ## 引用列表标题 ##", text: "引用列表标题" },
      { source: "- > ### 列表引用标题 ###", text: "列表引用标题" },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      const editor = wrapper.vm as unknown as {
        getViewState: () => { anchor: number; head: number };
        insertText: (text: string) => void;
        selectRange: (start: number, end: number) => Promise<void>;
      };
      const contentStart = current.source.indexOf(current.text);
      const contentEnd = current.source.lastIndexOf(" #");
      const content = wrapper.get<HTMLElement>(".cm-content");
      await editor.selectRange(contentStart + 1, contentStart + 1);
      content.element.dispatchEvent(new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
        cancelable: true,
      }));
      await settleUi();
      expect(editor.getViewState()).toMatchObject({ anchor: contentEnd, head: contentEnd });

      content.element.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
        cancelable: true,
      }));
      await settleUi();
      expect(editor.getViewState()).toMatchObject({ anchor: contentStart, head: contentStart });
      editor.insertText("新");
      await settleUi();
      expect((wrapper.emitted<string[]>(("update:modelValue")) ?? []).at(-1)?.[0]).toBe(
        current.source.slice(0, contentStart) + "新" + current.source.slice(contentStart),
      );
      expect(wrapper.get(".cm-line").text()).not.toContain("#");
      wrapper.unmount();
    }
  });

  it("空 ATX 标题显示末尾井号并保持 Home 和 End 边界", async () => {
    for (const source of ["# #", "- # #", "> # #"]) {
      const wrapper = mountEditor(source);
      await settleUi();
      const editor = wrapper.vm as unknown as {
        getViewState: () => { anchor: number; head: number };
        selectRange: (start: number, end: number) => Promise<void>;
      };
      const finalHash = source.lastIndexOf("#");
      const content = wrapper.get<HTMLElement>(".cm-content");
      await editor.selectRange(finalHash, finalHash);
      expect(content.text()).toContain("#");

      content.element.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Home",
        bubbles: true,
        cancelable: true,
      }));
      await settleUi();
      expect(editor.getViewState()).toMatchObject({ anchor: finalHash, head: finalHash });

      content.element.dispatchEvent(new KeyboardEvent("keydown", {
        key: "End",
        bubbles: true,
        cancelable: true,
      }));
      await settleUi();
      expect(editor.getViewState()).toMatchObject({ anchor: finalHash + 1, head: finalHash + 1 });
      wrapper.unmount();
    }
  });
  it("在普通段落显示 Emoji、裸链接和智能标点，并在光标进入时恢复源码", async () => {
    const source = '正文 :smile:，访问 https://example.com、www.google.com 或 dev@example.com；"hello" -- ...\n\n光标';
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      runCommand: (command: string) => void;
    };
    await editor.selectRange(source.length, source.length);
    await settleUi();

    expect(wrapper.get(".cm-rendered-emoji").text()).toBe("😄");
    expect(wrapper.findAll(".cm-rendered-link").map((link) => link.text()))
      .toEqual(["https://example.com", "www.google.com", "dev@example.com"]);
    expect(wrapper.text()).toContain("“hello” – …");
    expect(wrapper.props("modelValue")).toBe(source);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    const emojiOffset = source.indexOf(":smile:") + 2;
    await editor.selectRange(emojiOffset, emojiOffset);
    await settleUi();
    expect(wrapper.find(".cm-rendered-emoji").exists()).toBe(false);
    expect(wrapper.text()).toContain(":smile:");

    const wordOffset = source.indexOf("hello") + 2;
    await editor.selectRange(wordOffset, wordOffset);
    await settleUi();
    expect(wrapper.text()).toContain("“hello” – …");

    const quoteOffset = source.indexOf('"hello"');
    await editor.selectRange(quoteOffset, quoteOffset);
    await settleUi();
    expect(wrapper.text()).toContain('"hello”');

    const wwwOffset = source.indexOf("www.google.com") + 3;
    await editor.selectRange(wwwOffset, wwwOffset);
    editor.runCommand("openLink");
    expect(wrapper.emitted<string[]>("openLinkHref")?.at(-1)?.[0]).toBe("http://www.google.com");

    const emailOffset = source.indexOf("dev@example.com") + 3;
    await editor.selectRange(emailOffset, emailOffset);
    editor.runCommand("openLink");
    expect(wrapper.emitted<string[]>("openLinkHref")?.at(-1)?.[0]).toBe("mailto:dev@example.com");
    wrapper.unmount();
  });

  it("在 CJK 文本边界准确显示并打开裸链接", async () => {
    const source = [
      "访问https://example.com结束",
      "访问www.example.org结束",
      "邮箱dev@example.com结束",
      "abchttps://invalid.example",
      "abcwww.invalid.example",
      "",
      "光标",
    ].join(" ");
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      runCommand: (command: string) => void;
    };
    await editor.selectRange(source.length, source.length);
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-link").map((link) => link.text()))
      .toEqual(["https://example.com", "www.example.org", "dev@example.com"]);
    expect(wrapper.text()).toContain("访问https://example.com结束");
    expect(wrapper.text()).toContain("访问www.example.org结束");
    expect(wrapper.text()).toContain("邮箱dev@example.com结束");

    const urlOffset = source.indexOf("https://") + 8;
    await editor.selectRange(urlOffset, urlOffset);
    editor.runCommand("openLink");
    expect(wrapper.emitted<string[]>("openLinkHref")?.at(-1)?.[0])
      .toBe("https://example.com");
    wrapper.unmount();
  });

  it("按 Typora 规则折叠尖括号自动链接并由开关统一控制", async () => {
    const source = "<www.google.com> <https://example.com>\n\n光标";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
      runCommand: (command: string) => void;
    };
    await editor.selectRange(source.length, source.length);
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-link").map((link) => link.text()))
      .toEqual(["www.google.com", "https://example.com"]);
    expect(wrapper.text()).not.toContain("<www.google.com>");

    const wwwOffset = source.indexOf("www.google.com") + 3;
    await editor.selectRange(wwwOffset, wwwOffset);
    await settleUi();
    expect(wrapper.text()).toContain("<www.google.com>");
    editor.runCommand("openLink");
    expect(wrapper.emitted<string[]>("openLinkHref")?.at(-1)?.[0])
      .toBe("http://www.google.com");
    wrapper.unmount();

    const disabled = mountEditor(source, { autoLinks: false, readonly: true });
    await settleUi();
    expect(disabled.find(".cm-rendered-link").exists()).toBe(false);
    expect(disabled.text()).toContain("<www.google.com>");
    expect(disabled.text()).toContain("<https://example.com>");
    disabled.unmount();
  });

  it("显示完整 GitHub Emoji 词典中的短码", async () => {
    const source = "正文 :grinning: :poodle: :+1:\n\n光标";
    const wrapper = mountEditor(source, { readonly: true });
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-emoji").map((node) => node.text()))
      .toEqual(["😀", "🐩", "👍"]);
    wrapper.unmount();
  });

  it("does not render escaped Emoji shortcodes", async () => {
    const wrapper = mountEditor("\\:smile: :smile:", { readonly: true });
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-emoji")).toHaveLength(1);
    expect(wrapper.get(".cm-rendered-emoji").text()).toBe("\u{1F604}");
    expect(wrapper.text()).toContain(":smile:");
    wrapper.unmount();
  });

  it("keeps uppercase Emoji shortcodes literal like Typora", async () => {
    const wrapper = mountEditor(":SMILE: :smile:", { readonly: true });
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-emoji")).toHaveLength(1);
    expect(wrapper.text()).toContain(":SMILE:");
    wrapper.unmount();
  });

  it("controls smart quotes and smart dashes independently", async () => {
    const quotes = mountEditor('"hello" -- ...', {
      readonly: true,
      smartQuotes: true,
      smartDashes: false,
    });
    await settleUi();
    expect(quotes.text()).toContain("“hello” -- ...");
    quotes.unmount();

    const dashes = mountEditor('"hello" -- ...', {
      readonly: true,
      smartQuotes: false,
      smartDashes: true,
    });
    await settleUi();
    expect(dashes.text()).toContain('"hello" – …');
    dashes.unmount();
  });

  it("按开关显示源码，并排除代码、链接目的地、HTML 和数学内容", async () => {
    const switchSource = '正文 :smile: https://example.com "hello" -- ...';
    const switchCases = [
      { options: { emoji: false }, emoji: false, autoLinks: true, smartPunctuation: true },
      { options: { autoLinks: false }, emoji: true, autoLinks: false, smartPunctuation: true },
      { options: { smartPunctuation: false }, emoji: true, autoLinks: true, smartPunctuation: false },
      {
        options: { emoji: false, autoLinks: false, smartPunctuation: false },
        emoji: false,
        autoLinks: false,
        smartPunctuation: false,
      },
    ];
    for (const current of switchCases) {
      const wrapper = mountEditor(switchSource, { readonly: true, ...current.options });
      await settleUi();
      expect(wrapper.find(".cm-rendered-emoji").exists()).toBe(current.emoji);
      expect(wrapper.find(".cm-rendered-link").exists()).toBe(current.autoLinks);
      expect(wrapper.find(".cm-rendered-smart-punctuation").exists()).toBe(current.smartPunctuation);
      if (!current.emoji) expect(wrapper.text()).toContain(":smile:");
      if (!current.smartPunctuation) expect(wrapper.text()).toContain('"hello" -- ...');
      wrapper.unmount();
    }

    const protectedSource = [
      '外部 :smile: "引号" -- https://outside.example.com；',
      '`代码 :smile: "引号" -- https://code.example.com`；',
      '[标签](https://target.example.com/path)；',
      '<kbd>HTML :smile: "引号" -- https://html.example.com</kbd>；',
      '$\\text{:smile:--https://math.example.com}$',
    ].join("");
    const protectedWrapper = mountEditor(protectedSource, { readonly: true });
    await settleUi();
    expect(protectedWrapper.findAll(".cm-rendered-emoji")).toHaveLength(1);
    expect(protectedWrapper.findAll(".cm-rendered-link").map((link) => link.text()))
      .toEqual(["https://outside.example.com", "标签"]);
    expect(protectedWrapper.get(".cm-rendered-inline-code").text())
      .toBe('代码 :smile: "引号" -- https://code.example.com');
    expect(protectedWrapper.get(".cm-rendered-inline-html").text())
      .toBe("HTML 😄 “引号” – https://html.example.com");
    expect(protectedWrapper.get(".cm-rendered-inline-math").text()).not.toContain("😄");
    expect(protectedWrapper.text()).toContain("外部 😄 “引号” – https://outside.example.com");
    protectedWrapper.unmount();

    const fenced = mountEditor('```md\n:smile: "引号" -- https://fence.example.com\n```', { readonly: true });
    await settleUi();
    expect(fenced.find(".cm-rendered-emoji").exists()).toBe(false);
    expect(fenced.find(".cm-rendered-link").exists()).toBe(false);
    expect(fenced.find(".cm-rendered-smart-punctuation").exists()).toBe(false);
    expect(fenced.text()).toContain(':smile: "引号" -- https://fence.example.com');
    fenced.unmount();
  });

  it("依据 Typora 实测将单空格和双空格无序列表显示为三个同级实心圆", async () => {
    const source = "- 一级\n * 二级\n  * 三级";
    const wrapper = mountEditor(source);
    await settleUi();

    const markers = wrapper.findAll<HTMLElement>(".cm-rendered-bullet-marker");
    expect(markers.map((marker) => marker.text())).toEqual(["•", "•", "•"]);
    expect(markers.map((marker) => marker.element.style.getPropertyValue("--list-marker-width")))
      .toEqual(["1.875rem", "1.875rem", "1.875rem"]);
    expect(markers.map((marker) => marker.element.style.getPropertyValue("--list-marker-offset")))
      .toEqual(["0rem", "0rem", "0rem"]);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("按语法树为有序和任务列表应用三十像素层级并统一点号", async () => {
    const orderedSource = [
      "1) 根项",
      "   7) 子项",
      "      3) 孙项",
      "",
      "光标",
    ].join("\n");
    const wrapper = mountEditor(orderedSource, { readonly: true });
    await settleUi();

    const ordered = wrapper.findAll<HTMLElement>(".cm-rendered-ordered-marker");
    expect(ordered.map((marker) => marker.text())).toEqual(["1.", "7.", "3."]);
    expect(ordered.map((marker) => marker.element.style.getPropertyValue("--list-marker-width")))
      .toEqual(["1.875rem", "3.75rem", "5.625rem"]);

    wrapper.unmount();

    const taskSource = "- [ ] 任务\n  - [x] 子任务\n\n光标";
    const tasksWrapper = mountEditor(taskSource);
    await settleUi();
    const taskEditor = tasksWrapper.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    await taskEditor.selectRange(taskSource.length, taskSource.length);
    await settleUi();
    const tasks = tasksWrapper.findAll<HTMLElement>(".cm-rendered-task-marker");
    const checkboxes = tasksWrapper.findAll<HTMLInputElement>(".cm-rendered-task-marker input");
    expect(checkboxes.map((checkbox) => checkbox.element.checked)).toEqual([false, true]);
    expect(tasks.map((marker) => marker.element.style.getPropertyValue("--list-marker-width")))
      .toEqual(["1.875rem", "3.75rem"]);

    await checkboxes[0]!.setValue(true);
    expect((tasksWrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0]).toContain("- [x] 任务");
    tasksWrapper.unmount();

    const orderedTask = mountEditor("光标\n1. [ ] 有序任务");
    await settleUi();
    expect(orderedTask.find(".cm-rendered-task-marker input").exists()).toBe(true);
    orderedTask.unmount();
  });

  it("在非活动行渲染公式、行内 HTML、脚注和内嵌图片", async () => {
    const source = [
      "公式 $x^2$，按 <kbd>Ctrl</kbd>，脚注[^note]，图片 ![示例](https://example.com/a.png)。",
      "",
      "[^note]: 脚注内容",
    ].join("\n");
    const wrapper = mountEditor(source, { readonly: true });
    await settleUi();

    expect(wrapper.find('.cm-rendered-inline-math mjx-container[jax="SVG"] svg').exists()).toBe(true);
    expect(wrapper.get(".cm-rendered-inline-html kbd").text()).toBe("Ctrl");
    expect(wrapper.get(".cm-rendered-footnote-reference").text()).toBe("1");
    expect(wrapper.get(".cm-rendered-footnote-reference").attributes("title")).toBeUndefined();
    expect(wrapper.get<HTMLImageElement>(".cm-rendered-inline-image img").attributes("alt")).toBe("示例");

    wrapper.unmount();

    const editableSource = "光标\n公式 $x^2$。";
    const editable = mountEditor(editableSource);
    await settleUi();
    await editable.get(".cm-rendered-inline-math").trigger("click");
    await settleUi();
    expect(editable.find(".cm-rendered-inline-math").exists()).toBe(false);
    expect(editable.text()).toContain("$x^2$");
    const mathStart = editableSource.indexOf("$x^2$") + 1;
    const state = (editable.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    }).getViewState();
    expect(state).toMatchObject({ anchor: mathStart, head: mathStart + 3 });

    editable.unmount();
  });
  it("opens editable TOC links without revealing source", async () => {
    const source = "Cursor\n\n[TOC]\n\n# Intro";
    const wrapper = mount(ContinuousMarkdownEditor, {
      attachTo: document.body,
      props: {
        modelValue: source,
        outline: [{ id: "intro", title: "Intro", level: 1, line: 5 }],
        settings: {
          ...defaultEditorSettings,
          extensions: { ...defaultEditorSettings.extensions },
        },
      },
    });
    await settleUi();

    const preview = wrapper.get(".cm-special-preview-toc");
    await preview.get("a").trigger("click");
    await settleUi();

    expect(wrapper.emitted<string[]>("openLinkHref")?.at(-1)?.[0]).toBe("#intro");
    expect(wrapper.find(".cm-special-preview-toc").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("[TOC]");
    wrapper.unmount();
  });

  it("完整折叠、展开并打开含空格目标的链接", async () => {
    const link = '[链接](foo bar "链接标题")';
    const source = `前文 ${link} 后文\n\n光标`;
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
      runCommand: (command: string) => void;
    };
    await editor.selectRange(source.length, source.length, false);
    await settleUi();

    const rendered = wrapper.get(".cm-rendered-inline-link");
    expect(rendered.text()).toBe("链接");
    expect(rendered.get("a").attributes("href")).toBe("foo%20bar");
    expect(rendered.get("a").attributes("title")).toBe("链接标题");
    await rendered.get("a").trigger("click", { ctrlKey: true });
    expect(wrapper.emitted<string[]>("openLinkHref")?.at(-1)?.[0]).toBe("foo%20bar");

    const targetOffset = source.indexOf("foo bar") + 4;
    await editor.selectRange(targetOffset, targetOffset, false);
    await settleUi();
    expect(wrapper.find(".cm-rendered-inline-link").exists()).toBe(false);
    expect(wrapper.text()).toContain(link);

    editor.runCommand("openLink");
    expect(wrapper.emitted<string[]>("openLinkHref")?.at(-1)?.[0]).toBe("foo bar");
    wrapper.unmount();
  });

  it("selects image alt text on click and full image source on double click", async () => {
    const markdown = '![Alt *text*](assets/my image.png "Image title")';
    const source = `Cursor\n\n${markdown}`;
    const imageStart = source.indexOf("![");
    const altStart = imageStart + 2;
    const altEnd = source.indexOf("]", altStart);
    const imageEnd = source.length;

    const single = mountEditor(source);
    await settleUi();
    expect(single.get(".cm-special-preview-image img").attributes("src")).toContain("assets/my image.png");
    expect(single.get(".cm-special-preview-image img").attributes("title")).toBe("Image title");
    await single.get(".cm-special-preview-image").trigger("click", { detail: 1 });
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    await settleUi();
    const singleState = (single.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    }).getViewState();
    expect(singleState).toMatchObject({ anchor: altStart, head: altEnd });
    expect(source.slice(singleState.anchor, singleState.head)).toBe("Alt *text*");
    expect(single.find(".cm-special-preview-image").exists()).toBe(false);
    single.unmount();

    const double = mountEditor(source);
    await settleUi();
    await double.get(".cm-special-preview-image").trigger("dblclick", { detail: 2 });
    await settleUi();
    const doubleState = (double.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    }).getViewState();
    expect(doubleState).toMatchObject({ anchor: imageStart, head: imageEnd });
    expect(source.slice(doubleState.anchor, doubleState.head))
      .toBe(markdown);
    expect(double.find(".cm-special-preview-image").exists()).toBe(false);
    double.unmount();
  });


  it("只读模式保留行内语义且不允许复选框或小部件修改正文", async () => {
    const source = "公式 $x$。\n\n- [ ] 只读任务";
    const wrapper = mountEditor(source, { readonly: true });
    await settleUi();

    const checkbox = wrapper.get<HTMLInputElement>(".cm-rendered-task-marker input");
    expect(checkbox.element.disabled).toBe(true);
    expect(wrapper.find(".cm-rendered-inline-math").exists()).toBe(true);
    await wrapper.get(".cm-rendered-inline-math").trigger("click");
    await settleUi();
    expect(wrapper.find(".cm-rendered-inline-math").exists()).toBe(true);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("按 HTML 扩展开关渲染块级 HTML 并可点击恢复源码", async () => {
    const source = "光标\n\n<section><p>块 HTML</p></section>\n\n末尾";
    const wrapper = mountEditor(source);
    await settleUi();

    expect(wrapper.get(".cm-special-preview-html p").text()).toBe("块 HTML");
    await wrapper.get(".cm-special-preview-html").trigger("click");
    await settleUi();
    expect(wrapper.find(".cm-special-preview-html").exists()).toBe(false);
    expect(wrapper.text()).toContain("<section>");
    const htmlState = (wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    }).getViewState();
    expect(htmlState).toMatchObject({ anchor: source.indexOf("块 HTML") });
    wrapper.unmount();

    const disabled = mountEditor(source, { html: false });
    await settleUi();
    expect(disabled.find(".cm-special-preview-html").exists()).toBe(false);
    const disabledEditor = disabled.vm as unknown as {
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const htmlOffset = source.indexOf("<section>");
    await disabledEditor.selectRange(htmlOffset, htmlOffset);
    await settleUi();
    expect(disabled.text()).toContain("<section>");
    disabled.unmount();
  });

  it("maps rendered code clicks to the corresponding source token", async () => {
    const source = [
      "Cursor",
      "",
      "~~~ts",
      "const first = 1;",
      "const second = 2;",
      "~~~",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const keywords = wrapper.findAll(".cm-special-preview-code .hljs-keyword");
    expect(keywords).toHaveLength(2);
    await keywords[1]!.trigger("click");
    await settleUi();
    const state = (wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
    }).getViewState();
    expect(state).toMatchObject({ anchor: source.lastIndexOf("const") });
    wrapper.unmount();
  });

  it("保留提示块的行级结构并允许点击正文定位", async () => {
    const source = "Cursor\n\n> [!NOTE]\n> 提示正文";
    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      getViewState: () => { anchor: number; head: number };
      selectRange: (start: number, end: number) => Promise<void>;
    };
    const bodyStart = source.indexOf("提示正文");
    await editor.selectRange(bodyStart, bodyStart);
    await settleUi();

    expect(wrapper.find(".cm-special-preview-callout").exists()).toBe(false);
    const title = wrapper.get(".cm-alert-title");
    const body = wrapper.get(".cm-alert-body.cm-active-markdown-line");
    expect(title.classes()).toContain("cm-alert-first");
    expect(body.classes()).toContain("cm-alert-last");
    expect(wrapper.get(".cm-rendered-alert-label").text()).toBe("Note");
    expect(wrapper.get(".cm-rendered-alert-icon").attributes()).toMatchObject({
      "aria-hidden": "true",
      focusable: "false",
    });
    expect(body.text()).toContain("提示正文");

    await body.trigger("click");
    await settleUi();
    expect(editor.getViewState()).toMatchObject({ anchor: bodyStart, head: bodyStart });
    wrapper.unmount();
  });


  it("折叠 Front Matter 分隔符并保留连续内容卡片", async () => {
    const source = "---\ntitle: 文档\n---";
    const wrapper = mountEditor(source, { readonly: true });
    await settleUi();

    const delimiters = wrapper.findAll(".cm-frontmatter-delimiter");
    expect(delimiters.length).toBeGreaterThan(0);
    expect(delimiters.every((line) => line.text() === "")).toBe(true);
    expect(wrapper.find(".cm-frontmatter-content-only").exists()).toBe(true);
    wrapper.unmount();
  });

  it("preserves nested blockquote semantics and computes ordered list numbers", async () => {
    const source = [
      "> # Quoted title",
      "> - bullet",
      ">",
      "> 7. first",
      "> 1. second",
      "> 1. [ ] ordered task",
      "> > > > > deeply quoted",
    ].join("\n");
    const wrapper = mountEditor(source, { readonly: true });
    await settleUi();

    expect(wrapper.get(".cm-blockquote.cm-heading-1").text()).toBe("Quoted title");
    expect(wrapper.get(".cm-blockquote .cm-rendered-bullet-marker").text()).toBe("•");
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    const orderedOffset = source.indexOf("7. first");
    await editor.selectRange(orderedOffset, orderedOffset, false);
    await settleUi();
    expect(wrapper.findAll(".cm-blockquote .cm-rendered-ordered-marker").map((node) => node.text()))
      .toEqual(["7.", "8."]);
    const taskOffset = source.indexOf("ordered task");
    await editor.selectRange(taskOffset, taskOffset, false);
    await settleUi();
    expect(wrapper.find(".cm-rendered-task-order").exists()).toBe(false);
    expect(wrapper.find(".cm-rendered-task-marker input").exists()).toBe(true);
    await editor.selectRange(source.length, source.length, false);
    await settleUi();
    const deepQuote = wrapper.get<HTMLElement>(".cm-blockquote-depth-5");
    expect(deepQuote.element.style.getPropertyValue("--blockquote-indent")).toBe("91px");
    expect(deepQuote.element.style.getPropertyValue("--blockquote-guide-width")).toBe("76px");
    wrapper.unmount();
  });

  it("不跨不同有序列表错误续号", async () => {
    const delimiterLists = mountEditor("1. first\n7) second", { readonly: true });
    await settleUi();
    expect(delimiterLists.findAll(".cm-rendered-ordered-marker").map((node) => node.text()))
      .toEqual(["1.", "7."]);
    delimiterLists.unmount();

    const interruptedLists = mountEditor("1. first\n- bullet\n5. second", { readonly: true });
    await settleUi();
    expect(interruptedLists.findAll(".cm-rendered-ordered-marker").map((node) => node.text()))
      .toEqual(["1.", "5."]);
    interruptedLists.unmount();
  });

  it("为长有序编号和有序任务保留可扩展标记槽", async () => {
    const wrapper = mountEditor([
      "123456789. long item",
      "",
      "123456789. [ ] long task",
    ].join("\n"), { readonly: true });
    await settleUi();

    expect(wrapper.get(".cm-rendered-ordered-marker").text()).toBe("123456789.");
    const task = wrapper.get(".cm-rendered-task-marker");
    expect(task.find(".cm-rendered-task-order").exists()).toBe(false);
    expect(task.find("input").exists()).toBe(true);
    wrapper.unmount();
  });

  it("未定义引用链接保持完整源码，仅渲染已有定义", async () => {
    const source = [
      "[x] [x][] [x][missing] [known] [collapsed][] [full][target]",
      "",
      "[known]: https://example.com/known",
      "[collapsed]: https://example.com/collapsed",
      "[target]: https://example.com/target",
    ].join("\n");
    const wrapper = mountEditor(source, { readonly: true });
    await settleUi();

    expect(wrapper.findAll(".cm-rendered-link").map((node) => node.text()))
      .toEqual(["known", "collapsed", "full"]);
    expect(wrapper.text()).toContain("[x] [x][] [x][missing]");
    wrapper.unmount();
  });

  it("活动链接展开引用标签和标题时仍保留链接语义", async () => {
    const source = [
      "[full][ref] [collapsed][] [shortcut] [title](https://example.com \"Title\")",
      "",
      "[ref]: https://example.com/ref",
      "[collapsed]: https://example.com/collapsed",
      "[shortcut]: https://example.com/shortcut",
      "",
      "cursor",
    ].join("\n");
    const readonlyWrapper = mountEditor(source, { readonly: true });
    await settleUi();
    expect(readonlyWrapper.findAll(".cm-rendered-link").map((node) => node.text()))
      .toEqual(["full", "collapsed", "shortcut", "title"]);
    readonlyWrapper.unmount();

    const wrapper = mountEditor(source);
    await settleUi();
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };

    const referenceLabel = source.indexOf("[ref]", source.indexOf("[full]"));
    await editor.selectRange(referenceLabel + 1, referenceLabel + 1, false);
    await settleUi();
    expect(wrapper.text()).toContain("[full][ref]");
    expect(wrapper.findAll(".cm-rendered-link").map((node) => node.text()))
      .toEqual(["full", "collapsed", "shortcut", "title"]);

    const linkTitle = source.indexOf("\"Title\"");
    await editor.selectRange(linkTitle + 1, linkTitle + 1, false);
    await settleUi();
    expect(wrapper.text()).toContain("[title](https://example.com \"Title\")");
    expect(wrapper.findAll(".cm-rendered-link").map((node) => node.text()))
      .toEqual(["full", "collapsed", "shortcut", "title"]);
    wrapper.unmount();
  });
});


describe("ContinuousMarkdownEditor Setext \u4e0e\u65e0\u6548\u8868\u683c\u8fb9\u754c", () => {
  it("\u5c06\u591a\u884c Setext \u6807\u9898\u663e\u793a\u4e3a\u4ec5\u672b\u884c\u5e26\u5206\u9694\u7ebf\u7684\u8fde\u7eed\u6807\u9898\u7ec4", async () => {
    const source = "First line\nSecond line\n---\n\nBody";
    const wrapper = mountEditor(source);
    await settleUi();

    const headingLines = wrapper.findAll(".cm-setext-heading-line");
    expect(headingLines).toHaveLength(2);
    expect(headingLines[0]?.classes()).toContain("cm-setext-heading-first");
    expect(headingLines[0]?.classes()).not.toContain("cm-setext-heading-last");
    expect(headingLines[1]?.classes()).not.toContain("cm-setext-heading-first");
    expect(headingLines[1]?.classes()).toContain("cm-setext-heading-last");
    expect(wrapper.findAll(".cm-setext-heading-last")).toHaveLength(1);
    const editor = wrapper.vm as unknown as {
      selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
    };
    await editor.selectRange(source.indexOf("---"), source.indexOf("---"), false);
    await settleUi();
    expect(wrapper.get(".cm-setext-marker.cm-active-markdown-line").text()).toContain("---");

    wrapper.unmount();
  });

  it("\u4e0d\u5c06\u5217\u6570\u4e0d\u5339\u914d\u7684\u6e90\u7801\u66ff\u6362\u4e3a\u7a7a\u767d\u53ef\u89c6\u5316\u8868\u683c", async () => {
    const source = "A | B\n| --- | --- | --- |\ntext";
    const wrapper = mountEditor(source, { readonly: true });
    await settleUi();

    expect(wrapper.find(".cm-visual-table-widget").exists()).toBe(false);
    expect(wrapper.find(".cm-table").exists()).toBe(false);
    expect(wrapper.text()).toContain("A | B");
    expect(wrapper.text()).toContain("text");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    wrapper.unmount();
  });
});

describe("ContinuousMarkdownEditor rendered document selection", () => {
  it("keeps Markdown semantics rendered after Ctrl+A", async () => {
    const cases: Array<{
      source: string;
      selector: string;
      text?: string;
      hidden?: string;
    }> = [
      { source: "# Heading #", selector: ".cm-heading-1", text: "Heading", hidden: "#" },
      { source: "Bold **bold**.", selector: ".cm-rendered-strong", text: "bold", hidden: "**bold**" },
      { source: "```text\ncode\n```", selector: ".cm-special-preview-code" },
      { source: "$$\nx + y = z\n$$", selector: ".cm-special-preview-math" },
      { source: "<div>html</div>", selector: ".cm-special-preview-html" },
    ];

    for (const current of cases) {
      const wrapper = mountEditor(current.source);
      await settleUi();
      wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "a",
        ctrlKey: true,
      }));
      await settleUi();

      const editor = wrapper.vm as unknown as {
        getViewState: () => { anchor: number; head: number };
      };
      expect(editor.getViewState()).toMatchObject({ anchor: 0, head: current.source.length });
      expect(wrapper.find(".cm-active-markdown-line").exists()).toBe(false);
      expect(wrapper.find(current.selector).exists()).toBe(true);
      if (current.text) expect(wrapper.get(current.selector).text()).toContain(current.text);
      if (current.hidden) expect(wrapper.text()).not.toContain(current.hidden);
      wrapper.unmount();
    }
  });
});

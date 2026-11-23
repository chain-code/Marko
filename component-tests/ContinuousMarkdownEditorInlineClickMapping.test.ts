import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import { defaultEditorSettings } from "@/utils/editorSettings";

function mountEditor(source: string) {
  return mount(ContinuousMarkdownEditor, {
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
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

function placeCaret(node: Node, offset: number) {
  const selection = document.getSelection();
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function getAnchor(wrapper: VueWrapper): number {
  return (wrapper.vm as unknown as {
    getViewState: () => { anchor: number };
  }).getViewState().anchor;
}

describe("ContinuousMarkdownEditor 行内预览点击定位", () => {
  it("按行内代码中的字符位置恢复源码", async () => {
    const source = "Cursor `` alpha beta `` end";
    const wrapper = mountEditor(source);
    await settleUi();

    const code = wrapper.get(".cm-rendered-inline-code");
    placeCaret(code.element.firstChild!, 7);
    await code.trigger("click");
    await settleUi();

    expect(getAnchor(wrapper)).toBe(source.indexOf("beta") + 1);
    wrapper.unmount();
  });

  it("区分 Emoji 与智能标点的左右渲染边界", async () => {
    const emojiSource = "Cursor :smile: end";
    const emojiWrapper = mountEditor(emojiSource);
    await settleUi();
    const emoji = emojiWrapper.get<HTMLElement>(".cm-rendered-emoji");
    vi.spyOn(emoji.element, "getBoundingClientRect").mockReturnValue({
      bottom: 96,
      height: 16,
      left: 40,
      right: 56,
      top: 80,
      width: 16,
      x: 40,
      y: 80,
      toJSON: () => ({}),
    } as DOMRect);
    await emoji.trigger("click", { clientX: 55, clientY: 88 });
    await settleUi();

    expect(getAnchor(emojiWrapper)).toBe(emojiSource.indexOf(":smile:") + ":smile:".length);
    emojiWrapper.unmount();

    const punctuationSource = "Cursor -- end";
    const punctuationWrapper = mountEditor(punctuationSource);
    await settleUi();
    const punctuation = punctuationWrapper.get(".cm-rendered-smart-punctuation");
    placeCaret(punctuation.element.firstChild!, punctuation.text().length);
    await punctuation.trigger("click");
    await settleUi();

    expect(getAnchor(punctuationWrapper)).toBe(punctuationSource.indexOf("--") + 2);
    punctuationWrapper.unmount();
  });

  it("按缩写词中的字符位置恢复源码", async () => {
    const source = [
      "Cursor HTML text",
      "",
      "*[HTML]: Hyper Text Markup Language",
    ].join("\n");
    const wrapper = mountEditor(source);
    await settleUi();

    const abbreviation = wrapper.get("abbr.cm-rendered-abbreviation");
    placeCaret(abbreviation.element.firstChild!, 2);
    await abbreviation.trigger("click");
    await settleUi();

    expect(getAnchor(wrapper)).toBe(source.indexOf("HTML") + 2);
    wrapper.unmount();
  });

  it("按空格目标链接中的实体和 Emoji 可见边界恢复源码", async () => {
    const cases = [
      { raw: "&amp;", rendered: "&" },
      { raw: ":smile:", rendered: "😄" },
    ];

    for (const current of cases) {
      const source = "Cursor [A " + current.raw + " B](foo bar) end";
      const wrapper = mountEditor(source);
      await settleUi();

      const link = wrapper.get(".cm-rendered-inline-link a");
      const renderedOffset = link.text().indexOf(current.rendered) + current.rendered.length;
      placeCaret(link.element.firstChild!, renderedOffset);
      await link.trigger("click");
      await settleUi();

      expect(getAnchor(wrapper)).toBe(source.indexOf(current.raw) + current.raw.length);
      wrapper.unmount();
    }
  });

  it("按行内 HTML 的可见文本定位并跳过标签与属性", async () => {
    const source = 'Cursor <span title="span">alpha <strong>span</strong> &amp; end</span> done';
    const wrapper = mountEditor(source);
    await settleUi();

    const html = wrapper.get(".cm-rendered-inline-html");
    const strong = html.get("strong");
    placeCaret(strong.element.firstChild!, 2);
    await strong.trigger("click");
    await settleUi();

    expect(getAnchor(wrapper)).toBe(source.indexOf("span</strong>") + 2);
    wrapper.unmount();
  });
});

import { mount, type VueWrapper } from "@vue/test-utils";
import { Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { nextTick } from "vue";
import { describe, expect, it } from "vitest";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import continuousEditorSource from "@/components/ContinuousMarkdownEditor.vue?raw";
import { defaultEditorSettings } from "@/utils/editorSettings";

interface EditorHandle {
  insertText: (text: string) => void;
  selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
}

async function settleUi() {
  await nextTick();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  await nextTick();
}

async function mountEditor(source: string) {
  const wrapper = mount(ContinuousMarkdownEditor, {
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
  await settleUi();
  return wrapper;
}

function latestSource(wrapper: VueWrapper): string {
  return (wrapper.emitted<string[]>("update:modelValue") ?? []).at(-1)?.[0] ?? "";
}

async function pressKey(
  wrapper: VueWrapper,
  key: string,
  modifiers: KeyboardEventInit = {},
) {
  wrapper.get<HTMLElement>(".cm-content").element.dispatchEvent(new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  }));
  await settleUi();
}

async function dispatchRawInputText(wrapper: VueWrapper, text: string) {
  const content = wrapper.get<HTMLElement>(".cm-content").element;
  const view = EditorView.findFromDOM(content);
  if (!view) throw new Error("EditorView not found");
  const selection = view.state.selection.main;
  view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: text,
    },
    selection: {
      anchor: selection.from + text.length,
    },
    annotations: Transaction.userEvent.of("input.type"),
  });
  await settleUi();
}

it("keeps the second-level bullet ring at the Typora eight-pixel size", () => {
  expect(continuousEditorSource).toMatch(
    /\.cm-rendered-bullet-marker\[data-list-depth="1"\]\)::before\s*\{[\s\S]*?width:\s*8px;[\s\S]*?height:\s*8px;[\s\S]*?border:\s*1px solid/,
  );
});

describe("ContinuousMarkdownEditor 星号列表 Enter 交互", () => {
  it("从星号空格快捷输入开始，Enter 续写相同标记，空项再次 Enter 后退出", async () => {
    const wrapper = await mountEditor("*");
    const editor = wrapper.vm as unknown as EditorHandle;
    await editor.selectRange(1, 1, false);

    await pressKey(wrapper, " ");
    expect(latestSource(wrapper)).toBe("* ");

    editor.insertText("一级");
    await settleUi();
    await pressKey(wrapper, "Enter");
    expect(latestSource(wrapper)).toBe("* 一级\n* ");

    await pressKey(wrapper, "Enter");
    expect(latestSource(wrapper)).toBe("* 一级\n");
    wrapper.unmount();
  });

  it("嵌套与引用列表按原缩进续写，Shift+Enter 不生成新列表项", async () => {
    const cases = [
      { source: "* 一级\n  * 二级", expected: "* 一级\n  * 二级\n  * " },
      { source: "* 一级\n  * 二级\n    * 三级", expected: "* 一级\n  * 二级\n    * 三级\n    * " },
      { source: "> * 引用项", expected: "> * 引用项\n> * " },
    ];

    for (const example of cases) {
      const wrapper = await mountEditor(example.source);
      const editor = wrapper.vm as unknown as EditorHandle;
      await editor.selectRange(example.source.length, example.source.length, false);
      await pressKey(wrapper, "Enter");
      expect(latestSource(wrapper)).toBe(example.expected);
      wrapper.unmount();
    }

    const source = "* 一级";
    const softBreak = await mountEditor(source);
    const editor = softBreak.vm as unknown as EditorHandle;
    await editor.selectRange(source.length, source.length, false);
    await pressKey(softBreak, "Enter", { shiftKey: true });
    expect(latestSource(softBreak)).toBe("* 一级  \n  ");
    softBreak.unmount();
  });

  it("按一、二空格示例保留平级符号并在回车后续写星号", async () => {
    const source = "- 一级\n * 二级\n  * 三级";
    const wrapper = await mountEditor(source);
    const editor = wrapper.vm as unknown as EditorHandle;
    await editor.selectRange(source.length, source.length, false);

    await pressKey(wrapper, "Enter");

    expect(latestSource(wrapper)).toBe(`${source}\n  * `);
    expect(wrapper.findAll(".cm-rendered-bullet-marker").map((item) => item.text()))
      .toEqual(["•", "•", "•", "•"]);
    wrapper.unmount();
  });

  it("从一级连续缩进到三级后，每一层 Enter 都延续当前星号列表", async () => {
    const wrapper = await mountEditor("*");
    const editor = wrapper.vm as unknown as EditorHandle;
    await editor.selectRange(1, 1, false);

    await pressKey(wrapper, " ");
    editor.insertText("一级");
    await settleUi();
    await pressKey(wrapper, "Enter");
    await pressKey(wrapper, "Tab");
    editor.insertText("二级");
    await settleUi();
    await pressKey(wrapper, "Enter");
    await pressKey(wrapper, "Tab");
    editor.insertText("三级");
    await settleUi();
    await pressKey(wrapper, "Enter");

    expect(latestSource(wrapper)).toBe("* 一级\n  * 二级\n    * 三级\n    * ");
    expect(wrapper.findAll(".cm-line").map((line) => line.text())).toEqual([
      "•一级",
      "◦二级",
      "▪三级",
      "▪",
    ]);
    wrapper.unmount();
  });

  it("批量输入会转换为标准二三级缩进，并从当前层级继续 Enter", async () => {
    const source = "* one";
    const wrapper = await mountEditor(source);
    const editor = wrapper.vm as unknown as EditorHandle;
    await editor.selectRange(source.length, source.length);

    await pressKey(wrapper, "Enter");
    await dispatchRawInputText(wrapper, "* two");
    const second = "* one\n  * two";
    expect(latestSource(wrapper)).toBe(second);

    await pressKey(wrapper, "Enter");
    expect(latestSource(wrapper)).toBe(second + "\n  * ");
    await dispatchRawInputText(wrapper, "* three");
    const third = second + "\n    * three";
    expect(latestSource(wrapper)).toBe(third);

    await pressKey(wrapper, "Enter");
    expect(latestSource(wrapper)).toBe(third + "\n    * ");
    expect(wrapper.findAll<HTMLElement>(".cm-rendered-bullet-marker").map(
      (item) => item.attributes("data-list-depth"),
    )).toEqual(["0", "1", "2", "2"]);

    await pressKey(wrapper, "Enter");
    expect(latestSource(wrapper)).toBe(third + "\n    ");
    wrapper.unmount();
  });
  it("回车后输入星号只显示内层符号，并在下次回车续写同层", async () => {
    for (const outerMarker of ["*", "-"]) {
      const wrapper = await mountEditor(outerMarker);
      const editor = wrapper.vm as unknown as EditorHandle;
      await editor.selectRange(outerMarker.length, outerMarker.length, false);

      await pressKey(wrapper, " ");
      expect(latestSource(wrapper)).toBe(outerMarker + " ");

      editor.insertText("level-one");
      await settleUi();
      const first = outerMarker + " level-one";
      await pressKey(wrapper, "Enter");
      expect(latestSource(wrapper)).toBe(first + "\n" + outerMarker + " ");

      editor.insertText("*");
      await settleUi();
      await pressKey(wrapper, " ");
      expect(latestSource(wrapper)).toBe(first + "\n  * ");
      expect(wrapper.findAll<HTMLElement>(".cm-rendered-bullet-marker").map(
        (item) => item.attributes("data-list-depth"),
      )).toEqual(["0", "1"]);
      expect(wrapper.findAll(".cm-line").at(-1)?.text()).toBe("◦");

      editor.insertText("level-two");
      await settleUi();
      const second = first + "\n  * level-two";
      await pressKey(wrapper, "Enter");
      expect(latestSource(wrapper)).toBe(second + "\n  * ");
      expect(wrapper.findAll(".cm-line").at(-1)?.text()).toBe("◦");

      editor.insertText("*");
      await settleUi();
      await pressKey(wrapper, " ");
      expect(latestSource(wrapper)).toBe(second + "\n    * ");
      expect(wrapper.findAll<HTMLElement>(".cm-rendered-bullet-marker").map(
        (item) => item.attributes("data-list-depth"),
      )).toEqual(["0", "1", "2"]);
      expect(wrapper.findAll(".cm-line").at(-1)?.text()).toBe("▪");

      editor.insertText("level-three");
      await settleUi();
      const third = second + "\n    * level-three";
      await pressKey(wrapper, "Enter");
      expect(latestSource(wrapper)).toBe(third + "\n    * ");
      expect(wrapper.findAll<HTMLElement>(".cm-rendered-bullet-marker").map(
        (item) => item.attributes("data-list-depth"),
      )).toEqual(["0", "1", "2", "2"]);
      expect(wrapper.findAll(".cm-line").at(-1)?.text()).toBe("▪");

      await pressKey(wrapper, "Enter");
      expect(latestSource(wrapper)).toBe(third + "\n    ");
      wrapper.unmount();
    }
  });
  it("uses Tab and Shift+Tab to move bullet items one level at a time", async () => {
    for (const marker of ["*", "-"]) {
      const wrapper = await mountEditor(marker);
      const editor = wrapper.vm as unknown as EditorHandle;
      await editor.selectRange(marker.length, marker.length, false);

      await pressKey(wrapper, " ");
      editor.insertText("level-one");
      await settleUi();
      const first = marker + " level-one";
      await pressKey(wrapper, "Enter");

      await pressKey(wrapper, "Tab");
      expect(latestSource(wrapper)).toBe(first + "\n  " + marker + " ");
      editor.insertText("level-two");
      await settleUi();
      const second = first + "\n  " + marker + " level-two";
      await pressKey(wrapper, "Enter");

      await pressKey(wrapper, "Tab");
      expect(latestSource(wrapper)).toBe(second + "\n    " + marker + " ");
      await pressKey(wrapper, "Tab", { shiftKey: true });
      expect(latestSource(wrapper)).toBe(second + "\n  " + marker + " ");
      await pressKey(wrapper, "Tab", { shiftKey: true });
      expect(latestSource(wrapper)).toBe(second + "\n" + marker + " ");
      await pressKey(wrapper, "Tab", { shiftKey: true });
      expect(latestSource(wrapper)).toBe(second + "\n");
      wrapper.unmount();
    }
  });

  it("引用中输入星号会转换为标准缩进并续写内层", async () => {
    const source = "> * quoted-one\n> * ";
    const wrapper = await mountEditor(source);
    const editor = wrapper.vm as unknown as EditorHandle;
    await editor.selectRange(source.length, source.length, false);

    editor.insertText("*");
    await settleUi();
    await pressKey(wrapper, " ");
    expect(latestSource(wrapper)).toBe("> * quoted-one\n>   * ");
    expect(wrapper.findAll(".cm-line").at(-1)?.text()).toBe("◦");

    editor.insertText("quoted-two");
    await settleUi();
    const nested = "> * quoted-one\n>   * quoted-two";
    await pressKey(wrapper, "Enter");
    expect(latestSource(wrapper)).toBe(nested + "\n>   * ");

    await pressKey(wrapper, "Enter");
    expect(latestSource(wrapper)).toBe(nested + "\n>   ");
    wrapper.unmount();
  });
});

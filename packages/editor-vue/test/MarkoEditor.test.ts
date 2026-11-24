// K-1：组件的属性、事件、方法和旧版库的 MarkoMarkdownBody 相同
import { insertImageFiles } from "@marko/editor";
import type { Editor } from "@tiptap/core";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { MarkoEditor, MarkoMarkdownBody, type EditorSettings, type ImageInsertRequest, type OutlineItem } from "../src/index.ts";

let wrapper: VueWrapper | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = "";
});

function open(markdown: string, props: { readOnly?: boolean; settings?: Partial<EditorSettings>; filePath?: string } = {}) {
  wrapper = mount(MarkoEditor, { props: { modelValue: markdown, readOnly: false, ...props }, attachTo: document.body });
  return wrapper;
}

function editorOf(current: VueWrapper): Editor {
  const instance = (current.vm as unknown as { editor: () => Editor | null }).editor();
  if (!instance) throw new Error("编辑器还没建好");
  return instance;
}

function key(target: Element, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("K-1 组件", () => {
  it("旧的名字 MarkoMarkdownBody 就是这个组件", () => {
    expect(MarkoMarkdownBody).toBe(MarkoEditor);
  });

  it("显示文档；挂上以后发出大纲（行号从 1 数起）", () => {
    const current = open("# 标题\n\n正文\n\n## 第二节");
    expect(current.find("#write h1").text()).toContain("标题");
    const outlines = current.emitted("outlineChange") as OutlineItem[][][];
    expect(outlines[0][0]).toEqual([
      { id: "标题", title: "标题", level: 1, line: 1 },
      { id: "第二节", title: "第二节", level: 2, line: 5 },
    ]);
  });

  it("编辑以后 update:modelValue 发出新的原文；大纲停一会儿再更新", async () => {
    vi.useFakeTimers();
    try {
      const current = open("# A\n\ntext");
      const editor = editorOf(current);
      editor.view.dispatch(editor.state.tr.insertText("B", 2));
      expect(current.emitted("update:modelValue")?.at(-1)).toEqual(["# AB\n\ntext"]);
      expect((current.emitted("outlineChange") ?? []).length).toBe(1);
      vi.advanceTimersByTime(200);
      expect((current.emitted("outlineChange") as OutlineItem[][][]).at(-1)?.[0][0].title).toBe("AB");
    } finally {
      vi.useRealTimers();
    }
  });

  it("外面换了 modelValue（打开了别的文件）：编辑器跟着换，不再发回去", async () => {
    const current = open("first");
    await current.setProps({ modelValue: "# second" });
    expect(current.find("#write h1").text()).toContain("second");
    expect(current.emitted("update:modelValue")).toBeUndefined();
  });

  it("Ctrl+S 保存、Ctrl+Shift+S 另存为、Ctrl+O 打开；Ctrl+Shift+O 留给编辑器", () => {
    const current = open("text");
    const surface = current.find("#write").element;
    expect(key(surface, { key: "s", ctrlKey: true }).defaultPrevented).toBe(true);
    key(surface, { key: "S", ctrlKey: true, shiftKey: true });
    key(surface, { key: "o", ctrlKey: true });
    key(surface, { key: "O", ctrlKey: true, shiftKey: true });
    expect(current.emitted("save")).toHaveLength(1);
    expect(current.emitted("saveAs")).toHaveLength(1);
    expect(current.emitted("open")).toHaveLength(1);
  });

  it("插入图片：发出 imageData，宿主保存后用 replaceImagePlaceholder 换上地址；null 表示不插入了", async () => {
    const current = open("text");
    const editor = editorOf(current);
    editor.commands.setTextSelection(5);
    insertImageFiles(editor, [new File(["x"], "pic.png", { type: "image/png" })]);
    await nextTick();
    const request = (current.emitted("imageData") as ImageInsertRequest[][])[0][0];
    expect(request.name).toBe("pic.png");
    expect("file" in request && request.file.name).toBe("pic.png");
    const handle = current.vm as unknown as { replaceImagePlaceholder: (placeholder: string, source: string | null, alt?: string) => boolean };
    expect(handle.replaceImagePlaceholder("别的占位", "x.png")).toBe(false);
    expect(handle.replaceImagePlaceholder(request.placeholder!, "assets/pic.png", "示意图")).toBe(true);
    await vi.waitFor(() => expect(current.emitted("update:modelValue")?.at(-1)?.[0]).toContain("![示意图](assets/pic.png)"));

    insertImageFiles(editor, [new File(["y"], "other.png", { type: "image/png" })]);
    await nextTick();
    const second = (current.emitted("imageData") as ImageInsertRequest[][])[1][0];
    const before = current.emitted("update:modelValue")?.length ?? 0;
    expect(handle.replaceImagePlaceholder(second.placeholder!, null)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(current.emitted("update:modelValue")?.length ?? 0).toBe(before);
    expect(current.find("#write").text()).not.toContain("other.png");
  });

  it("Ctrl+单击链接：发出 openAnchor（宿主决定在浏览器里打开还是打开本地文件）", () => {
    const current = open("[x](https://example.com/a)\n\nend");
    const editor = editorOf(current);
    const view = editor.view;
    view.someProp("handleClick", (handler) => handler(view, 2, new MouseEvent("click", { ctrlKey: true })));
    expect(current.emitted("openAnchor")).toEqual([["https://example.com/a"]]);
  });

  it("K-1：本地 Markdown 文件的链接发 openLink（按文档的位置解析好的路径），同旧版库", () => {
    wrapper = mount(MarkoEditor, {
      props: { modelValue: "[x](../guide/intro%20one.md#start)\n\nend", readOnly: false, filePath: String.raw`C:\docs\drafts\current.md` },
      attachTo: document.body,
    });
    const view = editorOf(wrapper).view;
    view.someProp("handleClick", (handler) => handler(view, 2, new MouseEvent("click", { ctrlKey: true })));
    expect(wrapper.emitted("openLink")).toEqual([["C:/docs/guide/intro one.md"]]);
    expect(wrapper.emitted("openAnchor")).toBeUndefined();
  });

  it("给了 host 时用宿主的能力，不发事件", async () => {
    const openLink = vi.fn();
    const saveImage = vi.fn(async () => "marko-asset://pic.png");
    wrapper = mount(MarkoEditor, { props: { modelValue: "[x](https://e.com)\n\nend", readOnly: false, host: { openLink, saveImage } }, attachTo: document.body });
    const editor = editorOf(wrapper);
    const view = editor.view;
    view.someProp("handleClick", (handler) => handler(view, 2, new MouseEvent("click", { ctrlKey: true })));
    expect(openLink).toHaveBeenCalledWith("https://e.com");
    expect(wrapper.emitted("openAnchor")).toBeUndefined();
    insertImageFiles(editor, [new File(["x"], "pic.png", { type: "image/png" })]);
    await vi.waitFor(() => expect(saveImage).toHaveBeenCalled());
    expect(wrapper.emitted("imageData")).toBeUndefined();
  });

  it("设置：主题、字号、行宽、只读", async () => {
    const current = open("text", { readOnly: true, settings: { theme: "dark", fontSize: 18, lineWidth: 700 } });
    const section = current.find("section").element as HTMLElement;
    expect(section.dataset.theme).toBe("dark");
    expect(document.getElementById("marko-theme-dark")?.textContent).toContain('.marko-markdown-body[data-theme="dark"]');
    expect(section.style.getPropertyValue("--md-font-size")).toBe("18px");
    expect(section.style.getPropertyValue("--md-content-width")).toBe("700px");
    expect(editorOf(current).isEditable).toBe(false);
    await current.setProps({ readOnly: false });
    expect(editorOf(current).isEditable).toBe(true);
  });

  it("设置：语法开关、专注模式、编辑器的设置跟着换", async () => {
    const current = open("==mark==", { settings: { extensions: { highlight: false } as EditorSettings["extensions"] } });
    const editor = editorOf(current);
    expect(editor.storage.marko.syntax.highlight).toBe(false);
    await current.setProps({ settings: { extensions: { marks: true } as EditorSettings["extensions"], focusMode: true, indentSize: 4 } });
    expect(editor.storage.marko.syntax.highlight).toBe(true);
    expect(editor.storage.marko.focusMode).toBe(true);
    expect(editor.storage.marko.settings.indentSize).toBe(4);
  });

  it("focus、refreshLayout 可以调", () => {
    const current = open("text");
    const handle = current.vm as unknown as { focus: () => void; refreshLayout: () => void };
    expect(() => handle.focus()).not.toThrow();
    expect(() => handle.refreshLayout()).not.toThrow();
  });
});

describe("周边界面", () => {
  it("B-6 代码块的语言：光标在代码块里时显示；改了只换信息串的第一个词，围栏照旧", async () => {
    const { ElSelectV2 } = await import("element-plus");
    const source = "~~~~js {.x}\ncode\n~~~~\n\nend";
    const current = open(source);
    const editor = editorOf(current);
    expect(current.find(".marko-code-language").exists()).toBe(false);
    editor.commands.setTextSelection(3);
    await nextTick();
    expect(current.find(".marko-code-language").exists()).toBe(true);
    current.findComponent(ElSelectV2).vm.$emit("update:modelValue", "python");
    await nextTick();
    expect(current.emitted("update:modelValue")?.at(-1)).toEqual(["~~~~python {.x}\ncode\n~~~~\n\nend"]);
  });

  it("B-6 图表、公式的围栏不显示语言", async () => {
    const current = open("```mermaid\ngraph TD\n```\n\nend");
    editorOf(current).commands.setTextSelection(3);
    await nextTick();
    expect(current.find(".marko-code-language").exists()).toBe(false);
  });

  it("T-5 光标在表格里时显示工具条；按钮执行表格命令", async () => {
    const current = open("| a | b |\n| --- | --- |\n| 1 | 2 |\n\nend");
    const editor = editorOf(current);
    editor.commands.setTextSelection(3);
    await nextTick();
    const toolbar = current.find(".marko-table-toolbar");
    expect(toolbar.exists()).toBe(true);
    await toolbar.find('button[aria-label="下方插入行"]').trigger("click");
    // 新的一行（命令同旧版：格子里放「内容」）
    expect(current.emitted("update:modelValue")?.at(-1)).toEqual(["| a | b |\n| --- | --- |\n| 内容 | 内容 |\n| 1 | 2 |\n\nend"]);
    editor.commands.setTextSelection(editor.state.doc.content.size - 2);
    await nextTick();
    expect(current.find(".marko-table-toolbar").exists()).toBe(false);
  });

  it("T-1 Ctrl+T 弹出插入表格的小窗口，确定后按列数、行数插入", async () => {
    const { ElDialog } = await import("element-plus");
    const TableSizeDialog = (await import("../src/dialogs/TableSizeDialog.vue")).default;
    const current = open("text");
    editorOf(current).commands.setTextSelection(5);
    key(current.find("#write").element, { key: "t", ctrlKey: true });
    await nextTick();
    expect(current.findComponent(ElDialog).props("modelValue")).toBe(true);
    current.findComponent(TableSizeDialog).vm.$emit("confirm", 2, 3);
    await nextTick();
    expect(current.emitted("update:modelValue")?.at(-1)).toEqual(["text\n\n| 列 1 | 列 2 |\n| --- | --- |\n|  |  |\n|  |  |"]);
  });

  it("D-5、M-6 双击图片打开大图查看器", async () => {
    const current = open("![a](https://example.com/a.png)\n\nend");
    const image = current.find("#write img");
    expect(image.exists()).toBe(true);
    Object.defineProperty(image.element, "currentSrc", { value: "https://example.com/a.png" });
    await image.trigger("dblclick");
    await nextTick();
    expect(document.querySelector(".el-image-viewer__wrapper img")?.getAttribute("src")).toBe("https://example.com/a.png");
  });
});

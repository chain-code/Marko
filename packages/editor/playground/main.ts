// 编辑器的测试页（1.13 节「编辑器交互」）：只挂编辑器，不带应用界面。右边实时显示序列化出来的源码和选区。
// 地址参数：?theme=dark 换主题；?source=0 不显示源码栏；?doc=empty 空文档。Playwright 的交互测试通过 window.markoTest 操作
import "@marko/themes/base.css";
import "@marko/themes/editor.css";
import { createMarkoEditor, findStatusOf, getMarkdownWithSelection, setMarkdown, type FindStatus } from "../src/index.ts";
import sample from "./sample.md?raw";

const params = new URLSearchParams(location.search);
const theme = params.get("theme");
if (theme) await import(`../../themes/themes/${theme}.css`);
if (params.get("source") === "0") document.body.classList.add("no-source");

const element = document.querySelector<HTMLElement>("#write");
const source = document.querySelector<HTMLElement>("#source");
if (!element || !source) throw new Error("测试页缺少 #write、#source");

const editor = createMarkoEditor({ element, markdown: params.get("doc") === "empty" ? "" : sample });

/** 源码里标出选区（‸ 是光标） */
function showSource(): void {
  const { value, anchor, head } = getMarkdownWithSelection(editor);
  const from = Math.min(anchor, head);
  const to = Math.max(anchor, head);
  source!.textContent = "";
  source!.append(value.slice(0, from));
  if (from === to) {
    source!.append("‸");
  } else {
    const selected = document.createElement("mark");
    selected.textContent = value.slice(from, to);
    source!.append(selected);
  }
  source!.append(value.slice(to));
}

// 源码栏隐藏时不算（整篇序列化每次都做会拖慢测出来的按键延迟）
if (params.get("source") !== "0") {
  editor.on("transaction", showSource);
  showSource();
}
editor.commands.focus("start");

declare global {
  interface Window {
    markoTest: {
      editor: typeof editor;
      /** 换整篇；selection 是源码偏移 */
      setMarkdown(markdown: string, selection?: { anchor: number; head: number }): void;
      /** 整篇源码和选区的源码偏移 */
      read(): { value: string; anchor: number; head: number };
      /** 查找的「第 N 个，共 M 个」 */
      findStatus(): FindStatus;
    };
  }
}

window.markoTest = {
  editor,
  setMarkdown: (markdown, selection) => setMarkdown(editor, markdown, selection),
  read: () => getMarkdownWithSelection(editor),
  findStatus: () => findStatusOf(editor),
};

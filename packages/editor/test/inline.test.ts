// E-2、I 章：行内片段的装饰。看编辑区的 DOM：内容套的元素、标记什么时候隐藏、原子片段的渲染
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMarkoEditor, setMarkdown, type EditorHost } from "../src/index.ts";
import { browserHost } from "../src/host.ts";

let editor: Editor;

afterEach(() => {
  editor?.destroy();
});

function open(markdown: string, cursor?: number, host: EditorHost = browserHost): Editor {
  editor = createMarkoEditor({ host });
  setMarkdown(editor, markdown, cursor === undefined ? undefined : { anchor: cursor, head: cursor });
  return editor;
}

/** 第一个段落的 HTML */
function paragraph(): string {
  return editor.view.dom.querySelector("p")?.innerHTML ?? "";
}

/** 隐藏的标记里的文字 */
function hidden(): string[] {
  return Array.from(editor.view.dom.querySelectorAll(".md-hidden")).map((element) => element.textContent ?? "");
}

/** 显示出来的标记 */
function visibleMarks(): string[] {
  return Array.from(editor.view.dom.querySelectorAll(".md-mark:not(.md-hidden)")).map((element) => element.textContent ?? "");
}

/** 光标放到第一个文本块里的 offset 处 */
function moveTo(offset: number): void {
  const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1 + offset));
  editor.view.dispatch(tr);
}

describe("E-2 片段的展开和收起", () => {
  it("光标不在片段里：内容套上 strong，标记隐藏", () => {
    open("a **b** c\n\nnext", "a **b** c\n\n".length);
    expect(editor.view.dom.querySelector("p strong")?.textContent).toBe("b");
    expect(hidden()).toEqual(["**", "**"]);
  });

  it("光标在片段里或挨着边界：标记显示；离开后又隐藏", () => {
    open("a **b** c\n\nnext", 4);
    expect(visibleMarks()).toEqual(["**", "**"]);
    moveTo(2);
    // 挨着开始的边界也展开
    expect(visibleMarks()).toEqual(["**", "**"]);
    moveTo(0);
    expect(hidden()).toEqual(["**", "**"]);
    moveTo(7);
    expect(visibleMarks()).toEqual(["**", "**"]);
  });

  it("嵌套时光标所在的每一层都展开，别的层收起", () => {
    open("**a *b* c**", 5);
    expect(visibleMarks()).toEqual(["**", "*", "*", "**"]);
    moveTo(2);
    expect(visibleMarks()).toEqual(["**", "**"]);
    expect(hidden()).toEqual(["*", "*"]);
    expect(editor.view.dom.querySelector("strong em")?.textContent).toBe("b");
  });

  it("各种行内样式的元素同导出", () => {
    open("*i* ~~s~~ `c` <u>u</u>\n\nx", "*i* ~~s~~ `c` <u>u</u>\n\n".length);
    const html = paragraph();
    expect(html).toContain("<em>i</em>");
    expect(html).toContain("<del>s</del>");
    expect(html).toContain(`<code spellcheck="false">c</code>`);
    expect(html).toContain("<u>u</u>");
    expect(hidden()).toEqual(["*", "*", "~~", "~~", "`", "`", "<u>", "</u>"]);
  });

  it("只改动的文本块和选区新旧所在的文本块重画", () => {
    open("**a**\n\n**b**\n\n**c**", 0);
    const blocks = editor.view.dom.querySelectorAll("p");
    const third = blocks[2].innerHTML;
    // 第二段里输入：第三段的 DOM 不变（同一个元素、同样的内容）
    const second = editor.state.doc.child(1);
    const pos = 1 + editor.state.doc.child(0).nodeSize + 3;
    const tr = editor.state.tr.insertText("x", pos);
    editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, pos + 1)));
    expect(editor.state.doc.child(1).textContent).toBe("**bx**");
    expect(second.textContent).toBe("**b**");
    expect(editor.view.dom.querySelectorAll("p")[2].innerHTML).toBe(third);
    // 光标在第二段里：它展开，第一段收起
    expect(editor.view.dom.querySelectorAll("p")[1].querySelectorAll(".md-mark:not(.md-hidden)")).toHaveLength(2);
    expect(editor.view.dom.querySelectorAll("p")[0].querySelectorAll(".md-hidden")).toHaveLength(2);
  });
});

describe("链接（I-2、N-4）", () => {
  it("链接文字套 a，地址、标题在属性上；标记隐藏", () => {
    open('[x](https://example.com "t")\n\nnext', 40);
    const link = editor.view.dom.querySelector("p a");
    expect(link?.textContent).toBe("x");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.getAttribute("title")).toBe("t");
    expect(hidden()).toEqual(["[", '](https://example.com "t")']);
  });

  it("不安全的地址不给 href；引用式链接用定义的地址", () => {
    open("[x](javascript:alert(1)) [y][ref]\n\n[ref]: https://ref.example\n\nend", 60);
    const links = editor.view.dom.querySelectorAll("p a");
    expect(links[0].hasAttribute("href")).toBe(false);
    expect(links[1].getAttribute("href")).toBe("https://ref.example");
  });

  it("裸网址、自动链接", () => {
    open("see www.example.com and <mailto:a@b.c>\n\nend", 50);
    const links = editor.view.dom.querySelectorAll("p a");
    expect(links[0].getAttribute("href")).toBe("http://www.example.com");
    expect(links[1].getAttribute("href")).toBe("mailto:a@b.c");
  });

  it("Ctrl+单击打开链接，普通单击不打开", () => {
    const openLink = vi.fn();
    open("[x](https://example.com)\n\nend", 30, { ...browserHost, openLink });
    const view = editor.view;
    const click = (ctrlKey: boolean) => view.someProp("handleClick", (handler) => handler(view, 2, new MouseEvent("click", { ctrlKey })));
    expect(click(false)).toBeFalsy();
    expect(openLink).not.toHaveBeenCalled();
    expect(click(true)).toBe(true);
    expect(openLink).toHaveBeenCalledWith("https://example.com");
  });

  it("本文档里的锚点：跳到标题；百分号转义不合法时不出错，交给宿主（审查 #12）", () => {
    const openLink = vi.fn();
    open("# 100%\n\n[a](#100%) [b](#100%25)\n\nend", 0, { ...browserHost, openLink });
    const view = editor.view;
    const clickAt = (text: string) => {
      let pos = -1;
      view.state.doc.descendants((node, at) => {
        if (pos < 0 && node.isText && node.text?.includes(text)) pos = at + node.text.indexOf(text) + 1;
      });
      return view.someProp("handleClick", (handler) => handler(view, pos, new MouseEvent("click", { ctrlKey: true })));
    };
    expect(() => clickAt("[a]")).not.toThrow();
    expect(clickAt("[b]")).toBe(true);
    expect(view.state.selection.$head.parent.type.name).toBe("heading");
  });

  it("宿主解析本地图片的地址", () => {
    const resolveUrl = vi.fn((url: string) => `marko-asset://doc/${url}`);
    open("![图](a.png)\n\nend", 20, { ...browserHost, resolveUrl });
    expect(editor.view.dom.querySelector("p img")?.getAttribute("src")).toBe("marko-asset://doc/a.png");
  });
});

describe("L-1 拼写检查", () => {
  it("行内代码、网址、标记（链接地址、HTML 标签）、展开的公式源码不检查；普通文字、链接文字照常", () => {
    open(["plain `codez` <https://exampel.com/pathh> [linkk](https://exampel.com/x) <span>tagg</span> $a^2$", "", "end"].join("\n"), 0);
    moveTo(93);
    const off = (selector: string) => Array.from(editor.view.dom.querySelectorAll(selector)).map((element) => element.closest("[spellcheck]")?.getAttribute("spellcheck"));
    expect(off("p code")).toEqual(["false"]);
    expect(off("p .md-html-tag")).toEqual(["false", "false"]);
    expect(off("p .md-math-source")).toEqual(["false"]);
    const links = Array.from(editor.view.dom.querySelectorAll("p a.md-link"));
    expect(links.map((link) => [link.textContent, link.closest("[spellcheck]")?.getAttribute("spellcheck") ?? null])).toEqual([
      ["https://exampel.com/pathh", "false"],
      ["linkk", null],
    ]);
    // 链接的地址在标记里
    const address = Array.from(editor.view.dom.querySelectorAll("p .md-mark")).find((element) => element.textContent?.includes("exampel.com/x"));
    expect(address?.getAttribute("spellcheck")).toBe("false");
  });
});

describe("原子片段", () => {
  it("行内公式收起时显示渲染结果，展开时显示源码和预览", () => {
    open("x $a^2$ y\n\nend", 12);
    const rendered = editor.view.dom.querySelector("p .md-math-inline");
    expect(rendered?.querySelector("mjx-container, svg")).not.toBeNull();
    expect(hidden()).toEqual(["$a^2$"]);
    moveTo(4);
    expect(visibleMarks()).toEqual(["$", "$"]);
    expect(editor.view.dom.querySelector("p .md-math-source")?.textContent).toBe("a^2");
    expect(editor.view.dom.querySelector("p .md-math-preview")).not.toBeNull();
  });

  it("emoji、实体、脚注引用、<br> 收起时显示效果", () => {
    open("a :smile: &amp; b[^n] c<br>d\n\n[^n]: note\n\nend", 60);
    expect(editor.view.dom.querySelector("p .md-emoji")?.textContent).toBe("😄");
    expect(editor.view.dom.querySelector("p .md-entity")?.textContent).toBe("&");
    expect(editor.view.dom.querySelector("p sup.md-footnote")?.textContent).toBe("1");
    // 鼠标移上去显示的定义内容（B-11）
    expect(editor.view.dom.querySelector<HTMLElement>("p sup.md-footnote")?.dataset.tip).toBe("note");
    expect(editor.view.dom.querySelector("p br")).not.toBeNull();
    expect(hidden()).toEqual([":smile:", "&amp;", "[^n]", "<br>"]);
  });

  it("没有定义的脚注引用、不认识的 emoji 按普通文字显示", () => {
    open("a[^x] :not-an-emoji-name:\n\nend", 40);
    expect(editor.view.dom.querySelector("p sup")).toBeNull();
    expect(editor.view.dom.querySelector("p .md-emoji")).toBeNull();
    expect(hidden()).toEqual([]);
  });

  it("注释灰色显示原文；转义收起时不显示反斜杠", () => {
    open("a <!-- note --> \\*b\\*\n\nend", 40);
    expect(editor.view.dom.querySelector("p .md-comment")?.textContent).toBe("<!-- note -->");
    expect(hidden()).toEqual(["\\", "\\"]);
  });

  it("行内 HTML 过滤：去掉事件属性；不成对的标签照原样显示", () => {
    open('<span style="color: red" onclick="x()">r</span> <b>open\n\nend', 60);
    const span = editor.view.dom.querySelector("p span[style]");
    expect(span?.textContent).toBe("r");
    expect(span?.getAttribute("onclick")).toBeNull();
    expect(visibleMarks()).toEqual(["<b>"]);
  });
});

describe("缩写（B-16）", () => {
  it("正文里定义过的词加上全称", () => {
    open("The HTML spec\n\n*[HTML]: Hyper Text Markup Language\n\nend", 60);
    expect(editor.view.dom.querySelector("p abbr")?.getAttribute("data-tip")).toBe("Hyper Text Markup Language");
    expect(editor.view.dom.querySelector("p abbr")?.hasAttribute("title")).toBe(false);
  });
});

describe("N-1、N-2 查找替换", () => {
  it("在源码上找：标记字符也能找到；第 N 个，共 M 个；替换全部算一步", async () => {
    const { findStatus } = await import("../src/index.ts");
    open("**a** b **a**\n\n```\na\n```", 0);
    editor.commands.setFind({ search: "a" });
    expect(findStatus(editor.state)).toEqual({ current: 0, total: 3, invalid: false });
    editor.commands.findNext();
    expect(findStatus(editor.state).current).toBe(1);
    // 跳到收起的片段里的匹配：片段展开
    expect(visibleMarks()).toEqual(["**", "**"]);
    editor.commands.setFind({ search: "\\*\\*", regexp: true, replace: "__" });
    expect(findStatus(editor.state).total).toBe(4);
    editor.commands.replaceAll();
    expect(editor.state.doc.firstChild?.textContent).toBe("__a__ b __a__");
    editor.commands.undo();
    expect(editor.state.doc.firstChild?.textContent).toBe("**a** b **a**");
  });

  it("正则的分组引用；写错的正则", async () => {
    const { findStatus } = await import("../src/index.ts");
    open("x=1, y=2", 0);
    editor.commands.setFind({ search: "(\\w)=(\\d)", regexp: true, replace: "$2=$1" });
    editor.commands.replaceAll();
    expect(editor.state.doc.firstChild?.textContent).toBe("1=x, 2=y");
    editor.commands.setFind({ search: "(", regexp: true });
    expect(findStatus(editor.state).invalid).toBe(true);
  });

  it("代码块里的匹配画进 CodeMirror", () => {
    open("```\nfind me\n```\n\nend", 0);
    editor.commands.setFind({ search: "me" });
    expect(editor.view.dom.querySelector(".cm-content .ProseMirror-search-match")?.textContent).toBe("me");
  });

  it("边输入边跳（同旧版）：光标之后最近的匹配；接着输入留在原处；后面没有时回到第一个", async () => {
    const { findStatus } = await import("../src/index.ts");
    open("ab abc ab abc", 0);
    moveTo(5);
    editor.commands.setFind({ search: "a" });
    expect(editor.commands.findNearest()).toBe(true);
    expect(editor.state.selection.from - 1).toBe(7);
    expect(findStatus(editor.state)).toEqual({ current: 3, total: 4, invalid: false });
    // 输入成「abc」：重叠的那个还在原处
    editor.commands.setFind({ search: "abc" });
    editor.commands.findNearest();
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe("abc");
    expect(editor.state.selection.from - 1).toBe(10);
    // 选区之后没有「ab 」，也不重叠：回到第一个
    editor.commands.setFind({ search: "ab " });
    editor.commands.findNearest();
    expect(editor.state.selection.from - 1).toBe(0);
    editor.commands.setFind({ search: "zzz" });
    expect(editor.commands.findNearest()).toBe(false);
  });

  it("换了一篇（打开别的文件）：查找条件留着，新文档里的匹配照样高亮", async () => {
    const { findStatus } = await import("../src/index.ts");
    open("one two", 0);
    editor.commands.setFind({ search: "o" });
    setMarkdown(editor, "foo boo\n");
    expect(findStatus(editor.state).total).toBe(4);
    expect(editor.view.dom.querySelectorAll(".ProseMirror-search-match").length).toBe(4);
  });
});

describe("E-10 智能标点", () => {
  function smart(): string[] {
    return Array.from(editor.view.dom.querySelectorAll(".md-smart-punct")).map((element) => element.textContent ?? "");
  }

  it("直引号、破折号、省略号只改显示；代码、链接地址里不改", () => {
    open('He said "it\'s fine" -- then --- wait... `"code"` [x](a--b)\n\nend', 80);
    expect(smart()).toEqual(["“", "’", "”", "–", "—", "…"]);
    expect(editor.state.doc.firstChild?.textContent).toContain('"it\'s fine"');
  });

  it("设置关掉后不改", async () => {
    const { setSettings } = await import("../src/index.ts");
    open('"q" -- x\n\nend', 12);
    expect(smart()).toHaveLength(3);
    setSettings(editor, { smartQuotes: false, smartDashes: false });
    expect(smart()).toEqual([]);
  });
});

describe("M-1 图片", () => {
  it("单独成段的图片：段落带 md-image-only（居中）；和文字在一起的不带", () => {
    open("![a](x.png)\n\ntext ![b](y.png)\n\nend", 40);
    const paragraphs = editor.view.dom.querySelectorAll("p");
    expect(paragraphs[0].classList.contains("md-image-only")).toBe(true);
    expect(paragraphs[1].classList.contains("md-image-only")).toBe(false);
  });

  it("typora-root-url：相对路径相对它", () => {
    const resolveUrl = vi.fn((url: string) => url);
    open("---\ntypora-root-url: ../assets\n---\n\n![a](/img/x.png) ![b](https://e.com/y.png)\n\nend", 80, { ...browserHost, resolveUrl });
    const images = Array.from(editor.view.dom.querySelectorAll("p img")).map((image) => image.getAttribute("src"));
    expect(images).toEqual(["../assets/img/x.png", "https://e.com/y.png"]);
  });

  it("加载失败时显示失败状态和路径", () => {
    open("![a](missing.png)\n\nend", 30);
    const image = editor.view.dom.querySelector("p img") as HTMLImageElement;
    image.dispatchEvent(new Event("error"));
    const wrapper = editor.view.dom.querySelector("p .md-image");
    expect(wrapper?.classList.contains("md-image-failed")).toBe(true);
    expect(wrapper?.getAttribute("data-src")).toBe("missing.png");
  });
});

describe("M-2、M-7 插入媒体文件", () => {
  it("图片写 Markdown 图片；视频、音频写带控件的 HTML；别的文件不管", async () => {
    const { getMarkdown, insertImageFiles } = await import("../src/index.ts");
    const saved: string[] = [];
    const saveImage = vi.fn(async (_file: Blob, name: string) => {
      saved.push(name);
      return `assets/${name.replace(/ /g, "%20")}`;
    });
    open("", 0, { ...browserHost, saveImage });
    const files = [
      new File(["x"], "pic.png", { type: "image/png" }),
      new File(["x"], "clip 1.mp4", { type: "video/mp4" }),
      new File(["x"], "a\"b.mp3", { type: "audio/mpeg" }),
      new File(["x"], "notes.txt", { type: "text/plain" }),
    ];
    await insertImageFiles(editor, files, 1);
    expect(saved).toEqual(["pic.png", "clip 1.mp4", "a\"b.mp3"]);
    const markdown = getMarkdown(editor);
    expect(markdown).toContain("![pic](assets/pic.png)");
    expect(markdown).toContain('<video controls src="assets/clip%201.mp4"></video>');
    expect(markdown).toContain('<audio controls src="assets/a&quot;b.mp3"></audio>');
    expect(markdown).not.toContain("notes");
  });
});

describe("M-7 行内的视频、音频", () => {
  it("收起时显示过滤后的播放器，展开时显示原文", () => {
    open('看 <video src="v.mp4" controls onplay="x()"></video> 这里\n\nend', 70);
    const video = editor.view.dom.querySelector("p video");
    expect(video?.getAttribute("src")).toBe("v.mp4");
    expect(video?.hasAttribute("onplay")).toBe(false);
    moveTo(3);
    expect(editor.view.dom.querySelector("p video")).toBeNull();
    expect(visibleMarks()).toEqual(['<video src="v.mp4" controls onplay="x()">', "</video>"]);
  });
});

describe("D-2 公式编号、B-7 math 围栏", () => {
  it("开了编号：公式块、行内的 \\eqref 用整篇渲染的结果（同导出）", async () => {
    const { setSettings } = await import("../src/index.ts");
    const { documentMathResult } = await import("../src/plugins/mathDocument.ts");
    open("$$\na \\label{x}\n$$\n\nsee $\\eqref{x}$\n\n$$\nb\n$$\n\nend", 60);
    const single = editor.view.dom.querySelector(".md-math-block .md-math-container")?.innerHTML;
    setSettings(editor, { mathNumbering: "all" });
    await vi.waitFor(() => expect(documentMathResult(editor.state, editor.state.doc.child(0), 0)).toBeDefined(), { timeout: 5000 });
    const result = documentMathResult(editor.state, editor.state.doc.child(0), 0);
    const blocks = editor.view.dom.querySelectorAll(".md-math-block .md-math-container");
    expect(blocks[0].innerHTML).toBe(result?.html);
    expect(blocks[0].innerHTML).not.toBe(single);
    const inline = documentMathResult(editor.state, editor.state.doc.child(1), 4);
    expect(inline?.error).toBeNull();
    expect(editor.view.dom.querySelector("p .md-math-inline")?.innerHTML).toBe(inline?.html);
  });

  it("改了 \\eqref 所在段落里别的字：还是整篇渲染的结果，不变成 (???)（审查 #10）", async () => {
    const { setSettings } = await import("../src/index.ts");
    const { documentMathResult } = await import("../src/plugins/mathDocument.ts");
    open("$$\nx \\label{eq:a}\n$$\n\nSee $\\eqref{eq:a}$ here.\n\nend", 0);
    setSettings(editor, { mathNumbering: "all" });
    const paragraph = () => editor.state.doc.child(1);
    const offset = paragraph().textContent.indexOf("$");
    await vi.waitFor(() => expect(documentMathResult(editor.state, paragraph(), offset)).toBeDefined(), { timeout: 5000 });
    const before = documentMathResult(editor.state, paragraph(), offset);
    // 引用渲染成「(1)」（字形 31 是 1，3F 是问号）
    expect(before?.html).toContain('data-c="31"');
    expect(before?.html).not.toContain('data-c="3F"');
    expect(editor.view.dom.querySelector("p .md-math-inline")?.innerHTML).toBe(before?.html);
    // 在段落末尾输入一个字：段落换了对象，公式没变
    const end = editor.state.doc.child(0).nodeSize + paragraph().nodeSize - 1;
    editor.view.dispatch(editor.state.tr.insertText("!", end));
    await vi.waitFor(() => expect(documentMathResult(editor.state, paragraph(), offset)).toBe(before), { timeout: 5000 });
    expect(editor.view.dom.querySelector("p .md-math-inline")?.innerHTML).toBe(before?.html);
  });

  it("信息串是 math 的代码块按公式块显示；改了信息串换回代码块", () => {
    open("```math\nx^2\n```\n\nend", 20);
    expect(editor.view.dom.querySelector(".md-math-block")).not.toBeNull();
    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { ...editor.state.doc.child(0).attrs, info: "js" }));
    expect(editor.view.dom.querySelector(".md-math-block")).toBeNull();
    expect(editor.view.dom.querySelector("pre.md-fences")).not.toBeNull();
  });
});

describe("D-3、D-4 图表", () => {
  it("宿主能画图时：光标不在里面只显示图；进来时显示源码，图跟着改", async () => {
    const renderDiagram = vi.fn(async (kind: string, source: string) => ({ svg: `<svg data-kind="${kind}"><text>${source.length}</text></svg>` }));
    open("```mermaid\ngraph TD\n```\n\nend", 30, { ...browserHost, renderDiagram });
    await vi.waitFor(() => expect(editor.view.dom.querySelector(".md-diagram-panel svg")).not.toBeNull());
    expect(renderDiagram).toHaveBeenCalledWith("mermaid", "graph TD");
    expect((editor.view.dom.querySelector(".md-diagram-source") as HTMLElement).hidden).toBe(true);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)));
    expect((editor.view.dom.querySelector(".md-diagram-source") as HTMLElement).hidden).toBe(false);
    editor.view.dispatch(editor.state.tr.insertText(" A", 9));
    await vi.waitFor(() => expect(renderDiagram).toHaveBeenLastCalledWith("mermaid", "graph TD A"));
  });

  it("宿主不能画图时一直显示源码", () => {
    open("```mermaid\ngraph TD\n```\n\nend", 30);
    expect((editor.view.dom.querySelector(".md-diagram-source") as HTMLElement).hidden).toBe(false);
    expect((editor.view.dom.querySelector(".md-diagram-panel") as HTMLElement).hidden).toBe(true);
  });
});

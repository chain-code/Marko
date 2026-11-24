// 公式块（B-7）、HTML 块（B-12）、Front Matter（B-9）。
// 公式块、HTML 块：光标不在里面时只显示渲染结果；光标进来（或单击渲染结果）时上面是 CodeMirror 源码，
// 公式块下面跟着实时预览。Front Matter 总是 YAML 编辑器
import type { Extension } from "@codemirror/state";
import { isMathFenceInfo, loadMathFonts, renderMath, safeUrl, sanitizeHtml } from "@marko/render";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorHost } from "../host.ts";
import { TYPORA_CLASSES } from "./codeBlock.ts";
import { whenVisible } from "../plugins/lazy.ts";
import { documentMathResult } from "../plugins/mathDocument.ts";
import { CodeMirrorView, type CodeMirrorViewProps } from "./codeMirror.ts";

/** 有渲染结果的代码类块：源码编辑器 + 渲染结果，按选区进出切换 */
abstract class RenderedView extends CodeMirrorView {
  protected readonly source: HTMLElement;
  protected readonly rendered: HTMLElement;
  private focused = false;

  protected constructor(props: CodeMirrorViewProps, dom: HTMLElement, source: HTMLElement, rendered: HTMLElement) {
    super(props, dom, source);
    this.source = source;
    this.rendered = rendered;
    rendered.contentEditable = "false";
    // 单击渲染结果：进去编辑源码
    rendered.addEventListener("mousedown", (event) => {
      if ((event.target as Element | null)?.closest("a[href]") && (event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      this.enter();
    });
  }

  /** 子类的构造函数最后调用（这时子类的字段才初始化好）；渲染结果等进入视口附近再画（X-3） */
  protected start(): void {
    this.show(false);
    whenVisible(this.dom, () => {
      this.visible = true;
      this.render();
    });
  }

  /** 进入过视口附近（之前不画，X-3） */
  protected visible = false;

  protected override extensions(): Extension[] {
    return [TYPORA_CLASSES];
  }

  /** 画渲染结果 */
  protected abstract render(): void;

  /** 正在编辑时还显示不显示渲染结果（公式块显示实时预览，HTML 块不显示） */
  protected abstract previewWhileEditing(): boolean;

  private show(focused: boolean): void {
    this.focused = focused;
    this.dom.classList.toggle("md-editing", focused);
    this.source.hidden = !focused;
    this.rendered.hidden = focused && !this.previewWhileEditing();
  }

  protected override focusChanged(focused: boolean): void {
    if (focused !== this.focused) this.show(focused);
  }

  protected override contentChanged(): void {
    if (this.visible) this.render();
  }

  private enter(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    const { state } = this.view;
    this.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos + 1 + this.node.content.size)));
    this.show(true);
    this.code.focus();
  }
}

export class MathBlockView extends RenderedView {
  /** 画过的源码和整篇渲染的结果（都没变时不重画） */
  private painted: string | null = null;

  constructor(props: CodeMirrorViewProps) {
    const dom = document.createElement("div");
    dom.className = "md-math-block";
    const source = document.createElement("pre");
    source.className = "md-fences md-math-source-editor";
    source.spellcheck = false;
    source.setAttribute("lang", "latex");
    const rendered = document.createElement("div");
    rendered.className = "md-math-container";
    dom.append(source, rendered);
    super(props, dom, source, rendered);
    this.start();
  }

  protected languageOf(): string {
    return "latex";
  }

  protected previewWhileEditing(): boolean {
    return true;
  }

  /** 公式块，或信息串是 math 的代码块（B-7）；代码块改了信息串就换回代码块的视图 */
  protected override accepts(node: PMNode): boolean {
    return node.type.name === "mathBlock" || isMathFenceInfo(node.attrs);
  }

  protected render(): void {
    const tex = this.node.textContent;
    // D-2：有编号、引用时用整篇渲染的结果
    const documentResult = documentMathResult(this.view.state, this.node, 0);
    const key = `${tex}\u0000${documentResult?.html ?? ""}`;
    if (key === this.painted) return;
    this.painted = key;
    if (!tex.trim()) {
      this.rendered.textContent = "";
      this.rendered.classList.add("md-math-empty");
      return;
    }
    this.rendered.classList.remove("md-math-empty");
    const result = documentResult && !documentResult.pending ? documentResult : renderMath(tex, true);
    if (result.pending) {
      this.rendered.textContent = tex;
      void loadMathFonts([{ tex, display: true }]).then(() => {
        if (this.painted !== key) return;
        this.painted = null;
        this.render();
      });
      return;
    }
    this.dom.classList.toggle("md-math-error", Boolean(result.error) || !result.html);
    if (result.error || !result.html) {
      this.rendered.textContent = result.error ?? tex;
      return;
    }
    this.rendered.innerHTML = result.html;
  }
}

export class HtmlBlockView extends RenderedView {
  private paintedHtml: string | null = null;

  constructor(
    props: CodeMirrorViewProps,
    private readonly host: () => EditorHost,
  ) {
    const dom = document.createElement("div");
    dom.className = "md-html-block";
    const source = document.createElement("pre");
    source.className = "md-fences md-html-source-editor";
    source.spellcheck = false;
    source.setAttribute("lang", "html");
    const rendered = document.createElement("div");
    rendered.className = "md-html-rendered";
    dom.append(source, rendered);
    super(props, dom, source, rendered);
    this.start();
  }

  protected languageOf(): string {
    return "html";
  }

  protected previewWhileEditing(): boolean {
    return false;
  }

  protected render(): void {
    const html = this.node.textContent;
    if (html === this.paintedHtml) return;
    this.paintedHtml = html;
    // X-1：过滤后再显示（同导出）；本地资源的地址交给宿主
    this.rendered.innerHTML = sanitizeHtml(html);
    for (const element of Array.from(this.rendered.querySelectorAll<HTMLElement>("img[src], video[src], audio[src], source[src]"))) {
      const kind = element.tagName === "IMG" ? "image" : "media";
      const url = safeUrl(this.host().resolveUrl(element.getAttribute("src") ?? "", kind), kind);
      if (url === null) element.removeAttribute("src");
      else element.setAttribute("src", url);
    }
    // 注释块（B-12）：灰色显示原文
    this.dom.classList.toggle("md-html-comment", /^\s*<!--/.test(html));
    if (!this.rendered.childNodes.length && html.trim()) {
      this.rendered.textContent = html;
      this.rendered.classList.add("md-comment");
    } else {
      this.rendered.classList.remove("md-comment");
    }
  }
}

export class FrontMatterView extends CodeMirrorView {
  constructor(props: CodeMirrorViewProps) {
    const dom = document.createElement("pre");
    dom.className = "md-meta-block md-front-matter";
    dom.spellcheck = false;
    dom.setAttribute("lang", "yaml");
    super(props, dom);
  }

  protected override extensions(): Extension[] {
    return [TYPORA_CLASSES];
  }

  protected languageOf(): string {
    return "yaml";
  }
}

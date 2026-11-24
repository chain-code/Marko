// 代码块（B-6）：总是一个 CodeMirror 编辑器，按信息串的语言高亮；pre.md-fences 和 lang 属性同 Typora，主题通用。
// 图表（D-3、D-4）：宿主能画图时，光标不在里面显示图，进来时上面是源码、下面是实时的图；不能画时同代码块
import type { Extension } from "@codemirror/state";
import { EditorView as CodeView } from "@codemirror/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { isMathFenceInfo } from "@marko/render";
import { whenVisible } from "../plugins/lazy.ts";
import { CodeMirrorView, type CodeMirrorViewProps } from "./codeMirror.ts";

/** 信息串的第一个词是语言 */
export function languageOfInfo(info: unknown): string {
  return String(info ?? "").trim().split(/\s+/)[0] ?? "";
}

/** CodeMirror 的根元素带上 Typora 的类名：主题里 `.cm-s-inner .cm-keyword` 这类规则才能套上（A-3） */
export const TYPORA_CLASSES: Extension = CodeView.editorAttributes.of({ class: "CodeMirror cm-s-inner" });

export class CodeBlockView extends CodeMirrorView {
  constructor(props: CodeMirrorViewProps) {
    const dom = document.createElement("pre");
    dom.className = "md-fences";
    dom.spellcheck = false;
    super(props, dom);
    this.syncLanguage();
  }

  protected override extensions(): Extension[] {
    return [TYPORA_CLASSES];
  }

  protected languageOf(node: PMNode): string | null {
    return languageOfInfo(node.attrs.info) || null;
  }

  /** 信息串改成 math 了：换成公式块的视图 */
  protected override accepts(node: PMNode): boolean {
    return !isMathFenceInfo(node.attrs);
  }

  protected override showsLineNumbers(): boolean {
    return true;
  }

  protected override contentChanged(): void {
    this.syncLanguage();
  }

  private syncLanguage(): void {
    const language = languageOfInfo(this.node.attrs.info);
    if (language) this.dom.setAttribute("lang", language);
    else this.dom.removeAttribute("lang");
  }
}

/** 宿主画图的接口（K-2）：SVG（已经过滤）或者错误信息 */
export type DiagramPainter = (kind: string, source: string) => Promise<{ svg: string } | { error: string }>;

export class DiagramView extends CodeMirrorView {
  private readonly source: HTMLElement;
  private readonly preview: HTMLElement;
  private painted: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    props: CodeMirrorViewProps,
    private readonly paint: DiagramPainter | null,
  ) {
    const dom = document.createElement("div");
    dom.className = "md-diagram";
    const source = document.createElement("pre");
    source.className = "md-fences md-diagram-source";
    source.spellcheck = false;
    const preview = document.createElement("div");
    preview.className = "md-diagram-panel";
    preview.contentEditable = "false";
    dom.append(source, preview);
    super(props, dom, source);
    this.source = source;
    this.preview = preview;
    source.setAttribute("lang", String(props.node.attrs.kind ?? "mermaid"));
    // 单击图：进去编辑源码
    preview.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.enter();
    });
    this.focusChanged(false);
    // X-3：进入视口附近才画图
    whenVisible(dom, () => {
      this.visible = true;
      this.contentChanged();
    });
  }

  private visible = false;

  protected override extensions(): Extension[] {
    return [TYPORA_CLASSES];
  }

  /** 图表的写法没有现成的高亮 */
  protected languageOf(): string | null {
    return null;
  }

  protected override focusChanged(focused: boolean): void {
    // 不能画图时一直显示源码
    this.source.hidden = Boolean(this.paint) && !focused;
    this.preview.hidden = !this.paint;
  }

  protected override contentChanged(): void {
    if (!this.paint || !this.visible) return;
    const text = this.node.textContent;
    if (text === this.painted) return;
    // 输入时不用每个字都画一次
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.painted = text;
      const kind = String(this.node.attrs.kind ?? "mermaid");
      void this.paint?.(kind, text).then((result) => {
        if (this.node.textContent !== text) return;
        if ("svg" in result) {
          this.preview.classList.remove("md-diagram-error");
          this.preview.innerHTML = result.svg;
        } else {
          this.preview.classList.add("md-diagram-error");
          this.preview.textContent = result.error;
        }
      });
    }, this.painted === null ? 0 : 300);
  }

  private enter(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    const { state } = this.view;
    this.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, pos + 1 + this.node.content.size)));
    this.focusChanged(true);
    this.code.focus();
  }

  override destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    super.destroy();
  }
}

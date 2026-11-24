// 带界面元素的块（1.6 节 NodeView）：脚注定义的标签和回链（B-11）、目录（B-10）。
// 这些元素不可编辑（contenteditable=false）。任务的复选框、Callout 的标题是装饰（plugins/blockWidgets.ts）
import { collectOutline, normalizeLabel } from "@marko/markdown";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { inlineSyntaxKey } from "../plugins/inlineSyntax.ts";
import { toModel } from "../state.ts";

export interface BlockViewProps {
  editor: Editor;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;
}

/** 不可编辑的界面元素 */
function widget<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.contentEditable = "false";
  return element;
}

/** 把光标放到文档位置 pos 上并滚过去（目录、回链跳转） */
function jumpTo(view: EditorView, pos: number): void {
  const tr = view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))).scrollIntoView();
  view.dispatch(tr);
  view.focus();
}

// ---------------------------------------------------------------------------
// B-11：脚注定义。前面显示标签，后面每处引用一个回链（↩）

/** 文档里引用了这个脚注的位置（行内装饰算好的，plugins/inlineSyntax.ts） */
function footnoteReferences(editor: Editor, label: string): number[] {
  const state = inlineSyntaxKey.getState(editor.state);
  return state?.context.footnotes.get(normalizeLabel(label))?.positions ?? [];
}

export class FootnoteDefinitionView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: PMNode;
  private readonly name: HTMLElement;
  private readonly backlinks: HTMLElement;
  private references = -1;
  private readonly onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (transaction.docChanged) this.renderBacklinks();
  };

  constructor(private readonly props: BlockViewProps) {
    this.node = props.node;
    this.dom = document.createElement("div");
    this.dom.className = "md-def-footnote";
    this.name = widget("span", "md-def-name");
    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "md-def-content";
    this.backlinks = widget("span", "md-def-backlinks");
    this.backlinks.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const index = Number((event.target as HTMLElement).closest<HTMLElement>("[data-reference]")?.dataset.reference);
      const target = footnoteReferences(this.props.editor, this.label())[index];
      if (target !== undefined) jumpTo(this.props.view, target);
    });
    this.dom.append(this.name, this.contentDOM, this.backlinks);
    this.renderName();
    this.renderBacklinks();
    props.editor.on("transaction", this.onTransaction);
  }

  private label(): string {
    return String(this.node.attrs.label ?? "");
  }

  private renderName(): void {
    this.dom.setAttribute("data-label", this.label());
    this.name.textContent = `[^${this.label()}]:`;
  }

  private renderBacklinks(): void {
    const count = footnoteReferences(this.props.editor, this.label()).length;
    if (count === this.references) return;
    this.references = count;
    this.backlinks.replaceChildren(
      ...Array.from({ length: count }, (_, index) => {
        const link = document.createElement("a");
        link.className = "md-def-backlink";
        link.dataset.reference = String(index);
        // U+FE0E：按文字显示，不显示成 emoji
        link.textContent = count > 1 ? `↩︎${index + 1}` : "↩︎";
        return link;
      }),
    );
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    const renamed = node.attrs.label !== this.node.attrs.label;
    this.node = node;
    if (renamed) {
      this.renderName();
      this.references = -1;
      this.renderBacklinks();
    }
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    return this.name.contains(mutation.target) || this.backlinks.contains(mutation.target);
  }

  stopEvent(event: Event): boolean {
    return this.backlinks.contains(event.target as Node);
  }

  destroy(): void {
    this.props.editor.off("transaction", this.onTransaction);
  }
}

// ---------------------------------------------------------------------------
// B-10：目录。标题变了跟着重画；单击条目跳到那个标题

export class TocView implements NodeView {
  dom: HTMLElement;
  private readonly list: HTMLElement;
  private signature = "";
  private readonly onTransaction = ({ transaction }: { transaction: Transaction }) => {
    if (transaction.docChanged) this.render();
  };

  constructor(private readonly props: BlockViewProps) {
    this.dom = document.createElement("div");
    this.dom.className = "md-toc";
    this.list = document.createElement("p");
    this.list.className = "md-toc-content";
    this.list.setAttribute("role", "list");
    this.dom.append(this.list);
    this.list.addEventListener("mousedown", (event) => {
      const item = (event.target as HTMLElement).closest<HTMLElement>("[data-heading]");
      if (!item) return;
      event.preventDefault();
      const target = this.headingPositions()[Number(item.dataset.heading)];
      if (target !== undefined) jumpTo(this.props.view, target + 1);
    });
    this.render();
    props.editor.on("transaction", this.onTransaction);
  }

  /** 各个标题在文档里的位置（顺序同 collectOutline） */
  private headingPositions(): number[] {
    const positions: number[] = [];
    this.props.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") positions.push(pos);
      return !node.isTextblock;
    });
    return positions;
  }

  private render(): void {
    const outline = collectOutline(toModel(this.props.editor.state.doc), { syntax: this.props.editor.storage.marko.syntax });
    const signature = JSON.stringify(outline.map((item) => [item.level, item.title, item.id]));
    if (signature === this.signature) return;
    this.signature = signature;
    this.list.replaceChildren(
      ...outline.map((item, index) => {
        const entry = document.createElement("span");
        entry.className = `md-toc-item md-toc-h${item.level}`;
        entry.setAttribute("role", "listitem");
        entry.dataset.heading = String(index);
        const link = document.createElement("a");
        link.className = "md-toc-inner";
        if (item.id) link.setAttribute("href", `#${item.id}`);
        link.textContent = item.title;
        entry.append(link);
        return entry;
      }),
    );
  }

  update(node: PMNode): boolean {
    return node.type.name === "toc";
  }

  stopEvent(event: Event): boolean {
    return event.type === "mousedown" && Boolean((event.target as HTMLElement).closest?.("[data-heading]"));
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this.props.editor.off("transaction", this.onTransaction);
  }
}

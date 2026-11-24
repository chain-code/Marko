// 代码类的块（代码块、公式块、HTML 块、Front Matter、图表）里的 CodeMirror 6 编辑器（1.6 节 NodeView）。
// 写法同 ProseMirror 官方的 CodeMirror 例子：CodeMirror 里的改动和选区转成 ProseMirror 的事务（撤销历史只有
// ProseMirror 一条，E-6）；文档变了按差异同步回 CodeMirror。高亮用 @marko/render 的同一张类名表（cm-keyword……，
// 主题通用，B-6），语言表是 @codemirror/language-data。
// 回车、退格在块的边界上的特殊行为（Ctrl+回车跳出、开头退格变回正文……）交给编辑器的按键处理（keymap.ts），
// 普通的换行、缩进由 CodeMirror 做
import { defaultKeymap, indentLess, indentMore, indentSelection, insertNewlineAndIndent } from "@codemirror/commands";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState as CodeState, RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration as CodeDecoration,
  drawSelection,
  EditorView as CodeView,
  keymap,
  lineNumbers,
  type DecorationSet as CodeDecorationSet,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import { codeHighlighter, findLanguage } from "@marko/render";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { AllSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { Decoration, DecorationSource, EditorView, NodeView } from "@tiptap/pm/view";
import { forget } from "../plugins/lazy.ts";
import type { EditorSettings } from "../settings.ts";

/** 块内容上的装饰（查找的高亮，N-1）：ProseMirror 画不进 CodeMirror，转成 CodeMirror 的装饰 */
interface OuterRange {
  from: number;
  to: number;
  className: string;
}

const setOuterRanges = StateEffect.define<OuterRange[]>();

const outerRanges = StateField.define<CodeDecorationSet>({
  create: () => CodeDecoration.none,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setOuterRanges)) continue;
      const builder = new RangeSetBuilder<CodeDecoration>();
      for (const range of [...effect.value].sort((left, right) => left.from - right.from || left.to - right.to)) {
        if (range.to > range.from && range.to <= tr.state.doc.length) builder.add(range.from, range.to, CodeDecoration.mark({ class: range.className }));
      }
      return builder.finish();
    }
    return value.map(tr.changes);
  },
  provide: (field) => CodeView.decorations.from(field),
});

/** 编辑器里所有的 CodeMirror（设置变了要逐个重新配置） */
const views = new WeakMap<Editor, Set<CodeMirrorView>>();

/** 设置变了（S-5、S-7 的缩进宽度、行号、自动换行）：已有的代码编辑器跟着改 */
export function refreshCodeViews(editor: Editor): void {
  for (const view of views.get(editor) ?? []) view.configure();
}

export interface CodeKeys {
  /** 回车（带修饰键）：块边界上的特殊行为，处理了返回 true */
  enter(editor: Editor, modifiers: { shift?: boolean; primary?: boolean; alt?: boolean }): boolean;
  /** 退格、删除：块边界上的特殊行为（变回正文、删掉空块、开头退格不动……） */
  delete(editor: Editor, direction: "backward" | "forward"): boolean;
  /** Tab、Shift+Tab：同排版视图里的（E-5，代码里按代码缩进宽度） */
  tab(editor: Editor, outdent: boolean): boolean;
}

export interface CodeMirrorViewProps {
  editor: Editor;
  node: PMNode;
  view: EditorView;
  getPos: () => number | undefined;
  keys: CodeKeys;
}

/** 块在文档里有没有被选区「进入」：选区在它里面，或者它是节点选区 */
export function focusedIn(decorations: readonly Decoration[]): boolean {
  return decorations.some((decoration) => (decoration.spec as { focus?: boolean }).focus === true);
}

export abstract class CodeMirrorView implements NodeView {
  dom: HTMLElement;
  node: PMNode;
  readonly code: CodeView;
  protected readonly editor: Editor;
  protected readonly view: EditorView;
  protected readonly getPos: () => number | undefined;
  private readonly keys: CodeKeys;
  private updating = false;
  private readonly language = new Compartment();
  private readonly settings = new Compartment();
  private languageName: string | null = null;
  private appliedSettings = "";
  private outerKey = "";

  protected constructor(props: CodeMirrorViewProps, dom: HTMLElement, mount: HTMLElement = dom) {
    this.editor = props.editor;
    this.node = props.node;
    this.view = props.view;
    this.getPos = props.getPos;
    this.keys = props.keys;
    this.dom = dom;
    this.code = new CodeView({
      parent: mount,
      state: CodeState.create({
        doc: props.node.textContent,
        extensions: [
          keymap.of([...this.keymap(), ...defaultKeymap]),
          drawSelection(),
          syntaxHighlighting(codeHighlighter),
          this.language.of([]),
          this.settings.of(this.settingsExtensions()),
          CodeView.updateListener.of((update) => this.forwardUpdate(update)),
          CodeView.editable.of(props.view.editable),
          outerRanges,
          ...this.extensions(),
        ],
      }),
    });
    let set = views.get(this.editor);
    if (!set) views.set(this.editor, (set = new Set()));
    set.add(this);
    this.appliedSettings = JSON.stringify(this.currentSettings());
    this.loadLanguage();
  }

  /** 这个节点还归不归这种视图管（代码块改成信息串 math 时换成公式块的视图，ProseMirror 重建） */
  protected accepts(_node: PMNode): boolean {
    return true;
  }

  /** 子类加的 CodeMirror 扩展 */
  protected extensions(): Extension[] {
    return [];
  }

  /** 高亮用的语言名；null 表示纯文本 */
  protected abstract languageOf(node: PMNode): string | null;

  private currentSettings(): Pick<EditorSettings, "codeIndentSize" | "codeLineNumbers" | "codeLineWrapping"> {
    const settings = this.editor.storage.marko.settings as EditorSettings;
    return { codeIndentSize: settings.codeIndentSize, codeLineNumbers: settings.codeLineNumbers, codeLineWrapping: settings.codeLineWrapping };
  }

  /** S-7：缩进宽度、行号、自动换行 */
  private settingsExtensions(): Extension[] {
    const settings = this.currentSettings();
    const size = Math.max(1, Math.min(8, Number(settings.codeIndentSize) || 4));
    const result: Extension[] = [indentUnit.of(" ".repeat(size)), CodeState.tabSize.of(size)];
    if (settings.codeLineNumbers && this.showsLineNumbers()) result.push(lineNumbers());
    if (settings.codeLineWrapping) result.push(CodeView.lineWrapping);
    return result;
  }

  /** 行号只给代码块（公式、HTML、Front Matter 不要） */
  protected showsLineNumbers(): boolean {
    return false;
  }

  /** 设置变了时重新配置 */
  configure(): void {
    const key = JSON.stringify(this.currentSettings());
    if (key === this.appliedSettings) return;
    this.appliedSettings = key;
    this.code.dispatch({ effects: this.settings.reconfigure(this.settingsExtensions()) });
  }

  private loadLanguage(): void {
    const name = this.languageOf(this.node);
    if (name === this.languageName) return;
    this.languageName = name;
    const description = name ? findLanguage(name) : null;
    if (!description) {
      this.code.dispatch({ effects: this.language.reconfigure([]) });
      return;
    }
    void description.load().then(
      (support) => {
        // 加载期间语言又改了：用新的
        if (this.languageName !== name) return;
        this.code.dispatch({ effects: this.language.reconfigure(support) });
      },
      () => undefined,
    );
  }

  // -------------------------------------------------------------------------
  // CodeMirror → ProseMirror

  private forwardUpdate(update: ViewUpdate): void {
    if (this.updating || !this.code.hasFocus) return;
    const pos = this.getPos();
    if (pos === undefined) return;
    let offset = pos + 1;
    const { main } = update.state.selection;
    const selectionFrom = offset + main.from;
    const selectionTo = offset + main.to;
    const current = this.view.state.selection;
    if (!update.docChanged && current.from === selectionFrom && current.to === selectionTo) return;
    const tr = this.view.state.tr;
    update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
      if (text.length) tr.replaceWith(offset + fromA, offset + toA, this.view.state.schema.text(text.toString()));
      else tr.delete(offset + fromA, offset + toA);
      offset += toB - fromB - (toA - fromA);
    });
    const anchor = pos + 1 + main.anchor;
    const head = pos + 1 + main.head;
    tr.setSelection(TextSelection.create(tr.doc, anchor, head));
    this.view.dispatch(tr);
  }

  /** 选区跳到块外面去了（Ctrl+回车跳出、退格变回正文……）：焦点还给 ProseMirror */
  private returnFocusIfLeft(): void {
    const pos = this.getPos();
    const { from, to } = this.view.state.selection;
    if (pos === undefined || from < pos + 1 || to > pos + this.node.nodeSize - 1) this.view.focus();
  }

  private keymap(): KeyBinding[] {
    const special = (run: () => boolean) => () => {
      if (!run()) return false;
      this.returnFocusIfLeft();
      return true;
    };
    return [
      { key: "ArrowUp", run: () => this.maybeEscape("line", -1) },
      { key: "ArrowLeft", run: () => this.maybeEscape("char", -1) },
      { key: "ArrowDown", run: () => this.maybeEscape("line", 1) },
      { key: "ArrowRight", run: () => this.maybeEscape("char", 1) },
      { key: "Enter", run: special(() => this.keys.enter(this.editor, {})) },
      { key: "Shift-Enter", run: special(() => this.keys.enter(this.editor, { shift: true })) },
      { key: "Mod-Enter", run: special(() => this.keys.enter(this.editor, { primary: true }) || this.exitBelow()) },
      { key: "Backspace", run: special(() => this.keys.delete(this.editor, "backward")) },
      { key: "Delete", run: special(() => this.keys.delete(this.editor, "forward")) },
      { key: "Enter", run: insertNewlineAndIndent },
      // E-5、B-6：Tab、Shift+Tab 同排版视图里的（代码里插入制表符，选中几行时按代码缩进宽度整行缩进）；没处理时按 CodeMirror 的
      { key: "Tab", run: special(() => this.keys.tab(this.editor, false)) },
      // S-5「Shift+Tab 自动缩进」开着：按这种语言的规则重新缩进选中的行（同旧版）；关着时照常反缩进
      { key: "Shift-Tab", run: (view) => (this.editor.storage.marko.settings.shiftTabAutoIndent && view.state.doc.length > 0 ? indentSelection(view) : false) },
      { key: "Shift-Tab", run: special(() => this.keys.tab(this.editor, true)) },
      { key: "Tab", run: (view) => (view.state.selection.main.empty ? (view.dispatch(view.state.replaceSelection(view.state.facet(indentUnit))), true) : indentMore(view)) },
      { key: "Shift-Tab", run: indentLess },
      // E-6：撤销、重做走编辑器的历史
      { key: "Mod-z", run: () => this.editor.commands.undo() },
      { key: "Mod-Shift-z", run: () => this.editor.commands.redo() },
      { key: "Mod-y", run: () => this.editor.commands.redo() },
      // E-7：第一次全选这一块的内容，已经全选了再按选整篇
      {
        key: "Mod-a",
        run: (view) => {
          const { main } = view.state.selection;
          if (main.from === 0 && main.to === view.state.doc.length) {
            this.view.dispatch(this.view.state.tr.setSelection(new AllSelection(this.view.state.doc)));
            this.view.focus();
            return true;
          }
          view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
          return true;
        },
      },
    ];
  }

  /** Ctrl+回车没有别的行为时：在块下面开一个正文段落 */
  private exitBelow(): boolean {
    const pos = this.getPos();
    if (pos === undefined) return false;
    const after = pos + this.node.nodeSize;
    const { state } = this.view;
    const tr = state.tr.insert(after, state.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
    this.view.dispatch(tr);
    return true;
  }

  /** 方向键到了内容的边上：离开这一块（B-6：文档以它结尾时，在最后一行按 ↓ 在后面新建正文段落） */
  private maybeEscape(unit: "line" | "char", direction: -1 | 1): boolean {
    const { state } = this.code;
    const main = state.selection.main;
    if (!main.empty) return false;
    const range = unit === "line" ? state.doc.lineAt(main.head) : main;
    if (direction < 0 ? range.from > 0 : range.to < state.doc.length) return false;
    const pos = this.getPos();
    if (pos === undefined) return false;
    const target = pos + (direction < 0 ? 0 : this.node.nodeSize);
    const doc = this.view.state.doc;
    if (direction > 0 && target >= doc.content.size) {
      const tr = this.view.state.tr.insert(target, this.view.state.schema.nodes.paragraph.create());
      tr.setSelection(TextSelection.create(tr.doc, target + 1)).scrollIntoView();
      this.view.dispatch(tr);
      this.view.focus();
      return true;
    }
    const selection = Selection.near(doc.resolve(target), direction);
    this.view.dispatch(this.view.state.tr.setSelection(selection).scrollIntoView());
    this.view.focus();
    return true;
  }

  // -------------------------------------------------------------------------
  // ProseMirror → CodeMirror

  setSelection(anchor: number, head: number): void {
    this.code.focus();
    this.updating = true;
    this.code.dispatch({ selection: { anchor, head } });
    this.updating = false;
  }

  update(node: PMNode, decorations: readonly Decoration[], inner?: DecorationSource): boolean {
    if (node.type !== this.node.type || !this.accepts(node)) return false;
    this.node = node;
    this.loadLanguage();
    this.focusChanged(focusedIn(decorations));
    if (inner) this.syncOuterRanges(inner);
    if (this.updating) return true;
    const next = node.textContent;
    const current = this.code.state.doc.toString();
    if (next !== current) {
      let start = 0;
      let currentEnd = current.length;
      let nextEnd = next.length;
      while (start < currentEnd && current.charCodeAt(start) === next.charCodeAt(start)) start += 1;
      while (currentEnd > start && nextEnd > start && current.charCodeAt(currentEnd - 1) === next.charCodeAt(nextEnd - 1)) {
        currentEnd -= 1;
        nextEnd -= 1;
      }
      this.updating = true;
      this.code.dispatch({ changes: { from: start, to: currentEnd, insert: next.slice(start, nextEnd) } });
      this.updating = false;
    }
    this.contentChanged();
    return true;
  }

  /** 查找的高亮（行内装饰的类名）画进 CodeMirror；位置是相对于块内容的开头 */
  private syncOuterRanges(inner: DecorationSource): void {
    const ranges: OuterRange[] = [];
    inner.forEachSet((set) => {
      for (const decoration of set.find()) {
        const className = (decoration as unknown as { type?: { attrs?: { class?: string } } }).type?.attrs?.class;
        if (className && decoration.to > decoration.from) ranges.push({ from: decoration.from, to: decoration.to, className });
      }
    });
    const key = JSON.stringify(ranges);
    if (key === this.outerKey) return;
    this.outerKey = key;
    this.updating = true;
    this.code.dispatch({ effects: setOuterRanges.of(ranges) });
    this.updating = false;
  }

  /** 选区进入、离开这一块（公式块、HTML 块、图表据此切换源码和渲染结果） */
  protected focusChanged(_focused: boolean): void {}

  /** 内容变了（预览跟着更新） */
  protected contentChanged(): void {}

  selectNode(): void {
    this.focusChanged(true);
    this.code.focus();
  }

  deselectNode(): void {}

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    views.get(this.editor)?.delete(this);
    // 还没进过视口、等着渲染的（图表、公式、HTML 块）：从共用的观察器里取消（lazy.ts）
    forget(this.dom);
    this.code.destroy();
  }
}

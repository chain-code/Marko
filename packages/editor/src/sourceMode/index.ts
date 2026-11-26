// 源码模式（E-11）：一个 CodeMirror 6 编辑整篇 Markdown 源码（1.6 节）。
// - CodeMirror 里的每次改动马上按源码改动应用到文档上（source.ts 的 applySource，只重新解析改到的块）：
//   文档一直和源码一致，大纲、字数统计照常；撤销历史只有编辑器的那一条，跨模式连续（E-6）；
// - 文档被别处改了（撤销、菜单命令）：按差异同步回 CodeMirror；
// - 选区：进入时按源码偏移放到 CodeMirror 里，CodeMirror 的选区随时换回文档上（菜单命令按它执行），退出时换回去；
// - 高亮：Markdown 和代码块里的代码（@codemirror/language-data），类名同 Typora 的源码模式（cm-header……），主题通用；
// - 回车续写列表、引用，退格去掉标记：用 @codemirror/lang-markdown 现成的；查找替换用 @codemirror/search
import { defaultKeymap, indentLess, indentMore } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import { syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import {
  findNext as codeFindNext,
  findPrevious as codeFindPrevious,
  getSearchQuery,
  replaceAll as codeReplaceAll,
  replaceNext as codeReplaceNext,
  search,
  SearchQuery as CodeSearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { EditorSelection, EditorState as CodeState, RangeSetBuilder } from "@codemirror/state";
import {
  drawSelection,
  EditorView as CodeView,
  GutterMarker,
  gutterLineClass,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { codeHighlighter } from "@marko/render";
import type { Editor } from "@tiptap/core";
import { TextSelection, type Transaction } from "@tiptap/pm/state";
import { applySource, placeSelection, readSource, replaceSource, type SourceSnapshot } from "../source.ts";
import { offsetToPosition } from "../state.ts";
import { SKIP_RECONCILE } from "../plugins/meta.ts";
import { nearestMatch, type FindOptions, type FindStatus } from "../reused/findTypes.ts";
import { commandKey } from "../keyBindings.ts";

const controllers = new WeakMap<Editor, SourceModeView>();

/** 显示行号的行（同 Typora）：第 1 行、每 10 行、最后一行；光标所在行的行号由 cm-activeLineGutter 显示。别的行的行号是透明的 */
class ShownLineNumber extends GutterMarker {
  override elementClass = "md-line-number-shown";
}

const SHOWN_LINE_NUMBER = new ShownLineNumber();

const shownLineNumbers = gutterLineClass.compute(["doc"], (state) => {
  const builder = new RangeSetBuilder<GutterMarker>();
  const last = state.doc.lines;
  for (let number = 1; number <= last; number = number === 1 ? 10 : number + 10) {
    const { from } = state.doc.line(number);
    builder.add(from, from, SHOWN_LINE_NUMBER);
  }
  if (last !== 1 && last % 10 !== 0) {
    const { from } = state.doc.line(last);
    builder.add(from, from, SHOWN_LINE_NUMBER);
  }
  return builder.finish();
});

/** 正在用的源码模式（没打开时为 undefined） */
export function sourceModeOf(editor: Editor): SourceModeView | undefined {
  return controllers.get(editor);
}

export class SourceModeView {
  readonly code: CodeView;
  readonly dom: HTMLElement;
  private syncing = false;
  /** 文档没变时缓存的源码和位置表（选区换算用） */
  private snapshot: SourceSnapshot;
  private readonly onTransaction = ({ transaction }: { transaction: Transaction }) => this.pull(transaction);

  constructor(
    private readonly editor: Editor,
    container: HTMLElement,
  ) {
    this.snapshot = readSource(editor.state);
    this.dom = document.createElement("div");
    this.dom.className = "md-source-mode";
    // 同 Typora 的源码模式（主题按 #typora-source 写样式，A-3）
    if (!document.getElementById("typora-source")) this.dom.id = "typora-source";
    container.append(this.dom);
    const { text, anchor, head } = this.snapshot;
    const toggleKey = commandKey(this.editor.storage.marko.settings, "toggleSourceMode");
    const toggleBinding = toggleKey ? [{ key: toggleKey, run: () => (toggleSourceMode(this.editor), true) }] : [];
    this.code = new CodeView({
      parent: this.dom,
      state: CodeState.create({
        doc: text,
        selection: EditorSelection.single(anchor, head),
        extensions: [
          keymap.of([
            // 切换源码模式的键按设置（S-12；宿主让菜单管时不绑，按键交给菜单）
            ...toggleBinding,
            { key: "Mod-z", run: () => this.editor.commands.undo() },
            { key: "Mod-Shift-z", run: () => this.editor.commands.redo() },
            { key: "Mod-y", run: () => this.editor.commands.redo() },
            { key: "Tab", run: indentMore },
            { key: "Shift-Tab", run: indentLess },
            ...markdownKeymap,
            // CodeMirror 默认的 Mod+/ 是「切换注释」：源码模式里这个键留给切换源码模式（或者宿主的菜单）
            ...defaultKeymap.filter((binding) => binding.key !== "Mod-/"),
          ]),
          markdown({ codeLanguages: languages }),
          syntaxHighlighting(codeHighlighter),
          // 同 Typora：左边的行号（只显示几行，见 shownLineNumbers）、光标所在行浅灰底（样式在 themes/editor.css）
          lineNumbers(),
          shownLineNumbers,
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          search({ top: true }),
          CodeView.lineWrapping,
          CodeView.editorAttributes.of({ class: "CodeMirror cm-s-inner cm-s-typora-default" }),
          CodeView.updateListener.of((update) => {
            if (this.syncing) return;
            if (update.docChanged) this.push();
            else if (update.selectionSet) this.pushSelection();
          }),
        ],
      }),
    });
    editor.on("transaction", this.onTransaction);
    this.code.dispatch({ effects: CodeView.scrollIntoView(head, { y: "center" }) });
  }

  /** CodeMirror 改了：按源码改动应用到文档上 */
  private push(): void {
    const state = this.code.state;
    const { anchor, head } = state.selection.main;
    const text = state.doc.toString();
    const parse = { syntax: this.editor.storage.marko.syntax };
    let tr: Transaction;
    try {
      tr = applySource(this.editor.state, readSource(this.editor.state), { text, anchor, head }, parse);
    } catch (error) {
      // 按块对齐出了错（不该发生）：整篇重新解析，写的字不能丢（审查 #2）
      console.error(error);
      tr = replaceSource(this.editor.state, text, anchor, head, parse);
    }
    this.dispatch(tr);
    this.snapshot = readSource(this.editor.state);
    // 按块对齐的结果和 CodeMirror 里写的对不上（不该发生）：整篇重新解析，以写的为准，不改写用户的字（审查 #3）。
    // 改的是整篇，ProseMirror 的历史把它并进刚才那一步，撤销时一起撤
    if (this.snapshot.text !== text) {
      this.dispatch(replaceSource(this.editor.state, text, anchor, head, parse));
      this.snapshot = readSource(this.editor.state);
    }
    // 还是不一样（写法在文档里表示不了）：以文档为准
    if (this.snapshot.text !== text) this.setText(this.snapshot);
  }

  /** 把源码模式自己的改动发给编辑器（不再同步回 CodeMirror） */
  private dispatch(tr: Transaction): void {
    this.syncing = true;
    try {
      this.editor.view.dispatch(tr);
    } finally {
      this.syncing = false;
    }
  }

  /** CodeMirror 的选区换到文档上（落在块之间的空行上时取前面最近的文字，不放占位段落） */
  private pushSelection(): void {
    const { anchor, head } = this.code.state.selection.main;
    const doc = this.editor.state.doc;
    const toPos = (offset: number) => Math.max(0, Math.min(doc.content.size, offsetToPosition(this.snapshot.map, offset)));
    const selection = TextSelection.between(doc.resolve(toPos(anchor)), doc.resolve(toPos(head)));
    this.syncing = true;
    try {
      this.editor.view.dispatch(this.editor.state.tr.setSelection(selection).setMeta("addToHistory", false));
    } finally {
      this.syncing = false;
    }
  }

  /** 文档被别处改了（撤销、命令）：按差异同步回 CodeMirror，选区跟着 */
  private pull(transaction: Transaction): void {
    if (this.syncing || !transaction.docChanged) return;
    this.snapshot = readSource(this.editor.state);
    this.setText(this.snapshot);
  }

  private setText(snapshot: SourceSnapshot): void {
    const current = this.code.state.doc.toString();
    const next = snapshot.text;
    let start = 0;
    let currentEnd = current.length;
    let nextEnd = next.length;
    while (start < currentEnd && start < nextEnd && current.charCodeAt(start) === next.charCodeAt(start)) start += 1;
    while (currentEnd > start && nextEnd > start && current.charCodeAt(currentEnd - 1) === next.charCodeAt(nextEnd - 1)) {
      currentEnd -= 1;
      nextEnd -= 1;
    }
    this.syncing = true;
    try {
      this.code.dispatch({
        changes: current === next ? undefined : { from: start, to: currentEnd, insert: next.slice(start, nextEnd) },
        selection: EditorSelection.single(Math.min(snapshot.anchor, next.length), Math.min(snapshot.head, next.length)),
        scrollIntoView: true,
      });
    } finally {
      this.syncing = false;
    }
  }

  // -------------------------------------------------------------------------
  // 查找替换（N-1、N-2）：源码模式下用 CodeMirror 的

  setFind(options: FindOptions): void {
    this.code.dispatch({
      effects: setSearchQuery.of(
        new CodeSearchQuery({
          search: options.search,
          caseSensitive: options.caseSensitive ?? false,
          wholeWord: options.wholeWord ?? false,
          regexp: options.regexp ?? false,
          replace: options.replace ?? "",
        }),
      ),
    });
  }

  findNext(): boolean {
    return codeFindNext(this.code);
  }

  findPrevious(): boolean {
    return codeFindPrevious(this.code);
  }

  /** 选中选区上的或之后最近的匹配（同排版视图，findTypes.ts 的 nearestMatch） */
  findNearest(): boolean {
    const state = this.code.state;
    const query = getSearchQuery(state);
    if (!query.search || !query.valid) return false;
    const matches: { from: number; to: number }[] = [];
    const cursor = query.getCursor(state);
    for (let match = cursor.next(); !match.done; match = cursor.next()) matches.push({ from: match.value.from, to: match.value.to });
    const { from, to } = state.selection.main;
    const match = nearestMatch(matches, from, to);
    if (!match) return false;
    this.code.dispatch({
      selection: EditorSelection.single(match.from, match.to),
      effects: CodeView.scrollIntoView(match.from, { y: "center" }),
      userEvent: "select.search",
    });
    return true;
  }

  replaceNext(): boolean {
    return codeReplaceNext(this.code);
  }

  replaceAll(): boolean {
    return codeReplaceAll(this.code);
  }

  findStatus(): FindStatus {
    const query = getSearchQuery(this.code.state);
    if (!query.search) return { current: 0, total: 0, invalid: false };
    if (!query.valid) return { current: 0, total: 0, invalid: true };
    const { from, to } = this.code.state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = query.getCursor(this.code.state);
    for (let match = cursor.next(); !match.done; match = cursor.next()) {
      total += 1;
      if (match.value.from === from && match.value.to === to) current = total;
    }
    return { current, total, invalid: false };
  }

  focus(): void {
    this.code.focus();
  }

  /** 整篇换了（打开了别的文件，index.ts 的 setMarkdown）：源码跟着换 */
  reload(): void {
    this.snapshot = readSource(this.editor.state);
    this.setText(this.snapshot);
  }

  /** 关掉：选区换回文档上（落在空行上时放光标占位段落，同按源码改动的命令） */
  destroy(): void {
    this.editor.off("transaction", this.onTransaction);
    const { anchor, head } = this.code.state.selection.main;
    if (!this.editor.isDestroyed) {
      const tr = this.editor.state.tr;
      placeSelection(tr, this.editor.schema, anchor, head);
      tr.setMeta(SKIP_RECONCILE, true).setMeta("addToHistory", false).scrollIntoView();
      this.editor.view.dispatch(tr);
    }
    this.code.destroy();
    this.dom.remove();
  }
}

/**
 * Ctrl+/ 切换源码模式（E-11）。源码编辑器放在编辑区后面，编辑区先藏起来；
 * 返回切换后是不是源码模式
 */
export function toggleSourceMode(editor: Editor): boolean {
  const current = controllers.get(editor);
  const editorDom = editor.view.dom as HTMLElement;
  if (current) {
    controllers.delete(editor);
    editor.storage.marko.sourceMode = false;
    current.destroy();
    editorDom.style.display = "";
    editor.view.focus();
    return false;
  }
  const parent = editorDom.parentElement;
  if (!parent) return false;
  const view = new SourceModeView(editor, parent);
  // 放在编辑区的位置上
  parent.insertBefore(view.dom, editorDom.nextSibling);
  editorDom.style.display = "none";
  controllers.set(editor, view);
  editor.storage.marko.sourceMode = true;
  view.focus();
  return true;
}

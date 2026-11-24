// 查找替换（N-1、N-2）：用 prosemirror-search（4.4 节：现成的，不自己实现）。
// 文本块里的文字就是 Markdown 原文，所以标记字符也能找到（N-1）；跳到收起的片段里的匹配时选区进去，片段自己展开。
// 代码块等 CodeMirror 里的匹配由 NodeView 转成 CodeMirror 的高亮（nodeViews/codeMirror.ts）。
// 查找栏的界面在 editor-vue，这里只给命令和状态
import { Extension, type CommandProps, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  findNext,
  findPrev,
  getMatchHighlights,
  getSearchState,
  replaceAll,
  replaceNext,
  search,
  SearchQuery,
  setSearchState,
} from "prosemirror-search";
import { scrollParent } from "../plugins/viewModes.ts";
import { sourceModeOf } from "../sourceMode/index.ts";
import { nearestMatch, type FindOptions, type FindStatus } from "./findTypes.ts";

/** 「第 N 个，共 M 个」：源码模式下按 CodeMirror 里的 */
export function findStatusOf(editor: Editor): FindStatus {
  return sourceModeOf(editor)?.findStatus() ?? findStatus(editor.state);
}

export type { FindOptions, FindStatus } from "./findTypes.ts";

/** 所有匹配，按位置排好（高亮的装饰集合不保证顺序） */
function matchesOf(state: EditorState): { from: number; to: number }[] {
  return getMatchHighlights(state)
    .find()
    .sort((left, right) => left.from - right.from);
}

/** 「第 N 个，共 M 个」（排版视图） */
export function findStatus(state: EditorState): FindStatus {
  const query = getSearchState(state)?.query;
  if (!query?.search) return { current: 0, total: 0, invalid: false };
  if (!query.valid) return { current: 0, total: 0, invalid: true };
  const matches = matchesOf(state);
  const { from, to } = state.selection;
  const index = matches.findIndex((match) => match.from === from && match.to === to);
  return { current: index + 1, total: matches.length, invalid: false };
}

/** 换掉整篇（打开别的文件，index.ts 的 setMarkdown）时把查找条件带到新的编辑状态上：查找栏开着，新文档里的匹配照样高亮 */
export function carryFind(from: EditorState, tr: Transaction): boolean {
  const query = getSearchState(from)?.query;
  if (!query?.search) return false;
  setSearchState(tr, query);
  return true;
}

// ---------------------------------------------------------------------------
// 查找命令选中匹配后滚过去。焦点在查找栏里时编辑器没有焦点，ProseMirror 不滚（选区不归它管），这里自己滚

const revealKey = new PluginKey<number>("markoFindReveal");

function revealSelection(view: EditorView): void {
  const scroller = scrollParent(view.dom);
  let rect: { top: number; bottom: number };
  try {
    rect = view.coordsAtPos(view.state.selection.from);
  } catch {
    return;
  }
  const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
  const box = isPage ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
  if (rect.top >= box.top && rect.bottom <= box.bottom) return;
  // 放到可见区域上面三分之一处
  scroller.scrollTop += rect.top - box.top - (box.bottom - box.top) / 3;
}

function revealPlugin(): Plugin<number> {
  return new Plugin<number>({
    key: revealKey,
    state: {
      init: () => 0,
      apply: (tr, count) => (tr.getMeta(revealKey) ? count + 1 : count),
    },
    view: () => ({
      update(view, previous) {
        if (revealKey.getState(view.state) === revealKey.getState(previous) || view.hasFocus()) return;
        revealSelection(view);
      },
    }),
  });
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    markoFind: {
      /** 设置查找条件（空字符串清除高亮） */
      setFind: (options: FindOptions) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      /** 选中选区上的或之后最近的匹配（边输入查找文字边跳，N-1；见 findTypes.ts 的 nearestMatch） */
      findNearest: () => ReturnType;
      replaceNext: () => ReturnType;
      /** 全部替换算一步，一次撤销（N-2） */
      replaceAll: () => ReturnType;
    };
  }
}

/** 源码模式下交给 CodeMirror（命令自己的事务不派发），否则用 prosemirror-search 的命令 */
function inSourceMode(
  run: (source: NonNullable<ReturnType<typeof sourceModeOf>>) => boolean,
  command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean,
  reveal = true,
) {
  return ({ editor, state, tr, dispatch }: CommandProps): boolean => {
    const source = sourceModeOf(editor);
    if (!source) {
      const done = command(state, dispatch);
      // 选中了匹配：滚过去（编辑器没有焦点时也滚）
      if (done && dispatch && reveal) tr.setMeta(revealKey, true);
      return done;
    }
    tr.setMeta("preventDispatch", true);
    return dispatch ? run(source) : true;
  };
}

export const Find = Extension.create({
  name: "markoFind",
  addCommands() {
    return {
      setFind:
        (options: FindOptions) =>
        ({ editor, tr, dispatch }) => {
          const source = sourceModeOf(editor);
          if (source) {
            // 源码模式下改的是 CodeMirror（它再同步到文档上），这条命令自己的事务不要再派发
            tr.setMeta("preventDispatch", true);
            if (dispatch) source.setFind(options);
            return true;
          }
          const query = new SearchQuery({
            search: options.search,
            caseSensitive: options.caseSensitive ?? false,
            wholeWord: options.wholeWord ?? false,
            regexp: options.regexp ?? false,
            replace: options.replace ?? "",
          });
          if (dispatch) setSearchState(tr, query);
          return true;
        },
      findNext: () => inSourceMode((source) => source.findNext(), findNext),
      findPrevious: () => inSourceMode((source) => source.findPrevious(), findPrev),
      findNearest: () =>
        inSourceMode(
          (source) => source.findNearest(),
          (state, dispatch) => {
            if (!getSearchState(state)?.query.valid) return false;
            const match = nearestMatch(matchesOf(state), state.selection.from, state.selection.to);
            if (!match) return false;
            if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, match.from, match.to)).scrollIntoView());
            return true;
          },
        ),
      replaceNext: () => inSourceMode((source) => source.replaceNext(), replaceNext),
      replaceAll: () => inSourceMode((source) => source.replaceAll(), replaceAll, false),
    };
  },
  addKeyboardShortcuts() {
    return {
      // N-1：F3、Ctrl+G 下一个，Shift+F3、Ctrl+Shift+G 上一个（打开查找栏的 Ctrl+F、Ctrl+H 在应用里）
      F3: () => this.editor.commands.findNext(),
      "Mod-g": () => this.editor.commands.findNext(),
      "Shift-F3": () => this.editor.commands.findPrevious(),
      "Mod-Shift-g": () => this.editor.commands.findPrevious(),
    };
  },
  addProseMirrorPlugins() {
    return [search(), revealPlugin()];
  },
});

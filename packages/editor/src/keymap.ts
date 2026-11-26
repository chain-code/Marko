// 按键（E-5 等）：不用 Tiptap 默认的 Keymap，按第 2 章自己定。
// 大部分行为按源码改动实现（commands/*），由 source.ts 应用到文档上
import { Extension, type Editor } from "@tiptap/core";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { backspaceResult, deleteResult } from "./commands/backspace.ts";
import { cellLineBreak } from "./commands/cells.ts";
import { enterResult, type EnterModifiers } from "./commands/enter.ts";
import { runSourceCommand } from "./commands/run.ts";
import { removalOffsets } from "./source.ts";
import { cursorAt, insertAtSelection, selectionRange } from "./commands/text.ts";
import { CODE_VIEW_NODES } from "./nodeViews/index.ts";
import { INLINE_TEXTBLOCKS } from "./plugins/inlineSyntax.ts";
import { toModel } from "./state.ts";

function enter(editor: Editor, modifiers: EnterModifiers): boolean {
  // 选中了几个单元格（T-5）：不拆、不换行（浏览器默认的换行会弄乱表格）
  if (editor.state.selection instanceof CellSelection) return true;
  // T-2：单元格里 Shift+回车是 <br>
  if (modifiers.shift && !modifiers.primary && !modifiers.alt && cellLineBreak(editor)) return true;
  let codeNewline = false;
  const handled = runSourceCommand(editor, ({ source, context, settings }) => {
    const result = enterResult(source, context, settings, modifiers);
    if (result) return result;
    if (modifiers.primary || modifiers.alt) return null;
    // 代码类的块里：代码换行（续行的前缀、缩进由序列化补上）
    if (context.block?.node.type.spec.code) {
      codeNewline = true;
      return null;
    }
    // 没有特殊行为：按源码插入一个换行
    return insertAtSelection(source, source.eol);
  });
  if (handled || !codeNewline) return handled;
  return editor.commands.command(({ tr }) => {
    tr.insertText("\n");
    return true;
  });
}

/** 选中了整个分隔线、目录（节点选区）：删掉它的原文，留下一个空行（E-8） */
function deleteSelectedAtom(editor: Editor): boolean {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || !selection.node.isAtom) return false;
  return runSourceCommand(editor, ({ source }) => {
    const range = source.map.map.ranges.get(toModel(selection.node));
    if (!range) return null;
    return cursorAt(source.text.slice(0, range.start) + source.text.slice(range.end), range.start);
  });
}

/** 一个字符：CRLF、代理对算一个 */
function charLength(text: string, offset: number, direction: "backward" | "forward"): number {
  if (direction === "backward") {
    if (offset >= 2 && text.slice(offset - 2, offset) === "\r\n") return 2;
    const code = text.charCodeAt(offset - 1);
    return code >= 0xdc00 && code <= 0xdfff && offset >= 2 ? 2 : 1;
  }
  if (text.slice(offset, offset + 2) === "\r\n") return 2;
  const code = text.charCodeAt(offset);
  return code >= 0xd800 && code <= 0xdbff ? 2 : 1;
}

/**
 * 退格、删除：先看各种块边界的特殊行为；有选区时按源码删掉选区；在文本块的开头（退格）、末尾（删除）按源码删一个字符
 * （同旧版，删掉换行就并到上一块）；文本块中间交给浏览器（输入法、字形簇都由它处理）
 */
function deleteKey(editor: Editor, direction: "backward" | "forward"): boolean {
  if (deleteSelectedAtom(editor)) return true;
  return runSourceCommand(editor, ({ state, source, context, settings }) => {
    const special = direction === "backward" ? backspaceResult(state, source, context, settings) : deleteResult(state, source, context, settings);
    if (special) return special;
    // 选中了内容：删掉要删的源码（全选是整篇；到了表格、代码块内容边上的连同标记，审查 #7）
    const { from, to } = selectionRange(state.selection.empty ? source : { ...source, ...removalOffsets(state.selection, source.map) });
    if (from !== to) return cursorAt(source.text.slice(0, from) + source.text.slice(to), from);
    const { $head } = state.selection;
    const atEdge = direction === "backward" ? $head.parentOffset === 0 : $head.parentOffset === $head.parent.content.size;
    if (!atEdge || !$head.parent.isTextblock) return null;
    if (direction === "backward") {
      if (from === 0) return "consume";
      const length = charLength(source.text, from, "backward");
      return cursorAt(source.text.slice(0, from - length) + source.text.slice(from), from - length);
    }
    if (from >= source.text.length) return "consume";
    const length = charLength(source.text, from, "forward");
    return cursorAt(source.text.slice(0, from) + source.text.slice(from + length), from);
  });
}

/** 代码类的块里（CodeMirror）的回车：只做块边界上的特殊行为（Ctrl+回车跳出……），普通换行由 CodeMirror 做 */
export function enterSpecial(editor: Editor, modifiers: EnterModifiers): boolean {
  // 缩进代码块里的普通回车由 CodeMirror 换行：按源码插入的换行加缩进会在重新解析时被挪出代码块（plugins/defer.ts）
  const parent = editor.state.selection.$head.parent;
  if (!modifiers.shift && !modifiers.primary && !modifiers.alt && parent.type.name === "codeBlock" && parent.attrs.indented) return false;
  return runSourceCommand(editor, ({ source, context, settings }) => enterResult(source, context, settings, modifiers));
}

/** 代码类的块里（CodeMirror）的退格、删除：只做块边界上的特殊行为（开头退格变回正文、删掉空块……） */
export function deleteSpecial(editor: Editor, direction: "backward" | "forward"): boolean {
  return runSourceCommand(editor, ({ state, source, context, settings }) =>
    direction === "backward" ? backspaceResult(state, source, context, settings) : deleteResult(state, source, context, settings),
  );
}

/** 方向键走到文本块的边上、下一个位置在代码类的块里：把选区放进去（它的 CodeMirror 接着拿到焦点，B-6） */
function arrowIntoCode(editor: Editor, direction: "left" | "right" | "up" | "down"): boolean {
  const { state, view } = editor;
  const { $head, empty } = state.selection;
  if (!empty || $head.depth === 0 || !view.endOfTextblock(direction)) return false;
  const side = direction === "left" || direction === "up" ? -1 : 1;
  const next = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side);
  if (!CODE_VIEW_NODES.has(next.$head.parent.type.name)) return false;
  view.dispatch(state.tr.setSelection(next).scrollIntoView());
  return true;
}

const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** 从 offset 往前（-1）、往后（1）一个字（字形簇：emoji 组合、带附加符号的字母算一个） */
function graphemeStep(text: string, offset: number, direction: -1 | 1): number {
  if (!graphemes) {
    const code = text.charCodeAt(direction < 0 ? offset - 1 : offset);
    const pair = direction < 0 ? code >= 0xdc00 && code <= 0xdfff : code >= 0xd800 && code <= 0xdbff;
    return offset + direction * (pair ? 2 : 1);
  }
  // 只切光标附近的一段（长段落也快）
  const start = Math.max(0, offset - 64);
  const end = Math.min(text.length, offset + 64);
  let previous = start;
  for (const { index } of graphemes.segment(text.slice(start, end))) {
    const at = start + index;
    if (direction < 0) {
      if (at >= offset) return previous;
      previous = at;
    } else if (at > offset) {
      return at;
    }
  }
  return direction < 0 ? previous : end;
}

const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/;

/**
 * E-2：← → 按原文一个字一个字地走。浏览器自己走会跳过隐藏的标记（收起的 `**` 是 display: none），
 * 片段要挨上边界时才展开，光标就进不了右边的标记。走到文本块边上、从右到左的文字交给浏览器
 */
function stepCaret(editor: Editor, direction: -1 | 1, extend: boolean): boolean {
  const { state, view } = editor;
  const selection = state.selection;
  if (!(selection instanceof TextSelection)) return false;
  const { $head } = selection;
  if (!$head.parent.isTextblock || !INLINE_TEXTBLOCKS.has($head.parent.type.name)) return false;
  const text = $head.parent.textContent;
  if (RTL.test(text)) return false;
  if (!extend && !selection.empty) {
    const to = direction < 0 ? selection.from : selection.to;
    view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to)).scrollIntoView());
    return true;
  }
  const offset = $head.parentOffset;
  if (direction < 0 ? offset === 0 : offset === text.length) return false;
  const head = $head.start() + graphemeStep(text, offset, direction);
  const anchor = extend ? selection.anchor : head;
  // 选区的另一端在别的文本块里时交给浏览器（跨块的选区）
  if (extend && !selection.$anchor.sameParent($head)) return false;
  view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, anchor, head)).scrollIntoView());
  return true;
}

/** 「编辑 → 删除」（X-6）：同按 Delete 键（有选区时删掉选中的内容）。自己派发事务，不放进 Tiptap 的命令 */
export function deleteForward(editor: Editor): boolean {
  return deleteKey(editor, "forward");
}

export const markdownKeymap = Extension.create({
  name: "markoKeymap",
  addKeyboardShortcuts() {
    return {
      Enter: () => enter(this.editor, {}),
      "Shift-Enter": () => enter(this.editor, { shift: true }),
      "Mod-Enter": () => enter(this.editor, { primary: true }),
      "Mod-Shift-Enter": () => enter(this.editor, { primary: true, shift: true }),
      "Alt-Enter": () => enter(this.editor, { alt: true }),
      // 全选（AllSelection）：删除、输入时连同开头、结尾的分隔线、目录（浏览器自己的全选只到第一个、最后一个文字）
      "Mod-a": () => this.editor.commands.selectAll(),
      Backspace: () => deleteKey(this.editor, "backward"),
      Delete: () => deleteKey(this.editor, "forward"),
      ArrowLeft: () => arrowIntoCode(this.editor, "left") || stepCaret(this.editor, -1, false),
      ArrowRight: () => arrowIntoCode(this.editor, "right") || stepCaret(this.editor, 1, false),
      "Shift-ArrowLeft": () => stepCaret(this.editor, -1, true),
      "Shift-ArrowRight": () => stepCaret(this.editor, 1, true),
      ArrowUp: () => arrowIntoCode(this.editor, "up"),
      ArrowDown: () => arrowIntoCode(this.editor, "down"),
    };
  },
});

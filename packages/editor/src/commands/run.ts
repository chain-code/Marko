// 按源码改动的命令怎么接到编辑器上：按键里直接执行（runSourceCommand），菜单命令包成 Tiptap 的命令（sourceCommand）
import type { CommandProps, Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import type { ParseOptions } from "@marko/markdown";
import { LAST_CODE_LANGUAGE, type EditorSettings } from "../settings.ts";
import { applySource, readSource, removalOffsets, type SourceResult, type SourceSnapshot } from "../source.ts";
import { cursorContext, type CursorContext } from "./context.ts";
import { buildInlineLayout, withInlineLayout } from "./inlineLayout.ts";
import { textsOf, type EditorTexts } from "../texts.ts";

/** 命令的结果：源码改动；"consume" 表示已经处理（什么也不改）；null 表示不处理 */
export type SourceCommandResult = SourceResult | "consume" | null;

export interface SourceCommandEnv {
  state: EditorState;
  source: SourceSnapshot;
  context: CursorContext;
  settings: EditorSettings;
  /** 源码模式（E-11）：行操作按行 */
  sourceMode: boolean;
  /** 插进文档里的占位文字（K-2、L-2） */
  texts: EditorTexts;
}

export type SourceCommand = ((env: SourceCommandEnv) => SourceCommandResult) & {
  /**
   * 单元格选区（T-5）上逐格执行，每格当成选中了它的全部内容（行内样式、清除格式）。
   * 没有这个标记的命令不在单元格选区上执行：按源码改从第一格到最后一格的范围会弄坏表格
   */
  perCell?: boolean;
};

/** 标记成可以在单元格选区上逐格执行 */
export function perCell(command: SourceCommand): SourceCommand {
  command.perCell = true;
  return command;
}

interface RunOptions {
  settings: EditorSettings;
  sourceMode: boolean;
  parse: ParseOptions;
  texts: EditorTexts;
}

function optionsOf(editor: Editor): RunOptions {
  const { settings, lastCodeLanguage, sourceMode, syntax, host } = editor.storage.marko;
  // S-7 默认语言选「最近使用」：命令看到的是光标最后待过的代码块的语言
  const resolved = settings.defaultCodeLanguage === LAST_CODE_LANGUAGE ? { ...settings, defaultCodeLanguage: lastCodeLanguage } : settings;
  return { settings: resolved, sourceMode, parse: { syntax }, texts: textsOf(host) };
}

function prepare(state: EditorState, options: RunOptions): SourceCommandEnv {
  const source = readSource(state);
  return { state, source, context: cursorContext(state, source), settings: options.settings, sourceMode: options.sourceMode, texts: options.texts };
}

/** 在命令执行期间提供行内范围（移植来的旧代码要用） */
function evaluate(env: SourceCommandEnv, command: SourceCommand): SourceCommandResult {
  return withInlineLayout(buildInlineLayout(env.state.doc, env.source), () => command(env));
}

/**
 * 单元格选区上逐格执行（perCell 的命令）：每格在只有这张表的小文档里选中全部内容执行，取回这一格的新内容，
 * 再一起写进 tr。空格子不动；全部改动都是去掉（变短）时都去掉，否则只做变长的（已经加粗的格子不再加一层，同 Typora）。
 * 表格的结构变了（命令改了别的东西）时不执行
 */
function applyPerCell(state: EditorState, selection: CellSelection, command: SourceCommand, options: RunOptions, tr: Transaction): boolean {
  const $cell = selection.$anchorCell;
  const table = $cell.node(-1);
  const tablePos = $cell.before(-1);
  const doc = state.schema.topNodeType.create(state.doc.attrs, table);
  const cells: Array<{ pos: number; node: PMNode; row: number; column: number }> = [];
  selection.forEachCell((node, pos) => {
    const $pos = state.doc.resolve(pos);
    cells.push({ pos, node, row: $pos.index(-1), column: $pos.index() });
  });
  const texts = cells.map(({ node }) => node.textContent);
  const next = cells.map(({ pos, node, row, column }, index) => {
    if (!texts[index].trim()) return texts[index];
    const start = pos - tablePos + 1;
    const cellState = EditorState.create({ doc, selection: TextSelection.create(doc, start, start + node.content.size) });
    const env = prepare(cellState, options);
    const result = evaluate(env, command);
    if (!result || result === "consume") return texts[index];
    const changed = applySource(cellState, env.source, result, options.parse).doc.firstChild;
    if (!changed || changed.type !== table.type || changed.childCount !== table.childCount || changed.child(row).childCount !== table.child(row).childCount) return null;
    return changed.child(row).child(column).textContent;
  });
  if (next.some((text) => text === null)) return false;
  const removing = next.every((text, index) => text === texts[index] || (text as string).length < texts[index].length);
  let changed = false;
  cells.forEach(({ pos, node }, index) => {
    const text = next[index] as string;
    if (text === texts[index] || (!removing && text.length < texts[index].length)) return;
    const from = tr.mapping.map(pos + 1);
    const to = tr.mapping.map(pos + 1 + node.content.size);
    if (text) tr.replaceWith(from, to, state.schema.text(text));
    else tr.delete(from, to);
    changed = true;
  });
  return changed;
}

/** 按键里用：算出改动并直接应用 */
/** 删掉、换掉选中内容的命令：选区换成要删的源码（全选是整篇；到了表格、代码块内容边上的连同标记，source.ts 的 removalOffsets） */
export function replacingSelection(command: SourceCommand): SourceCommand {
  const wrapped: SourceCommand = (env) => {
    const { anchor, head } = removalOffsets(env.state.selection, env.source.map);
    return command({ ...env, source: { ...env.source, anchor, head } });
  };
  wrapped.perCell = command.perCell;
  return wrapped;
}

export function runSourceCommand(editor: Editor, command: SourceCommand): boolean {
  const options = optionsOf(editor);
  const { state } = editor;
  if (state.selection instanceof CellSelection) {
    if (!command.perCell) return false;
    const tr = state.tr;
    if (applyPerCell(state, state.selection, command, options, tr)) editor.view.dispatch(tr);
    return true;
  }
  const env = prepare(state, options);
  const result = evaluate(env, command);
  if (result === null) return false;
  if (result === "consume") return true;
  editor.view.dispatch(applySource(env.state, env.source, result, options.parse));
  return true;
}

/** 包成 Tiptap 命令：改动写进命令的事务里 */
export function sourceCommand(command: SourceCommand) {
  return () =>
    ({ editor, state, tr, dispatch }: CommandProps): boolean => {
      const options = optionsOf(editor);
      if (state.selection instanceof CellSelection) {
        if (!command.perCell) return false;
        if (dispatch) applyPerCell(state, state.selection, command, options, tr);
        return true;
      }
      const env = prepare(state, options);
      const result = evaluate(env, command);
      if (result === null) return false;
      if (result === "consume" || !dispatch) return true;
      applySource(state, env.source, result, options.parse, tr);
      return true;
    };
}

/** 旧版命令的「文本 + 选区」 */
export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function textState(source: SourceSnapshot): TextState {
  return { value: source.text, selectionStart: Math.min(source.anchor, source.head), selectionEnd: Math.max(source.anchor, source.head) };
}

export function fromTextState(result: TextState | null): SourceResult | null {
  return result ? { text: result.value, anchor: result.selectionStart, head: result.selectionEnd } : null;
}

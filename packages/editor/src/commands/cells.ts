// 表格单元格里的输入和粘贴（T-2、T-6）。单元格的文字是一行行内原文：
// - 输入的 `|` 写成 `\|`，Shift+回车插入 `<br>`（Markdown 表格的格子里不能直接换行）；
// - 粘贴表格数据（Excel、网页的表格，制表符或逗号分隔的文字）从光标所在的格开始按行列填进去，不够时加行、加列；
// - 粘贴别的文字：换行变成 `<br>`，竖线转义，插在光标处
import { blockChildren, nodeText, parse, type SyntaxOptions } from "@marko/markdown";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { pasteMarkdownContent, type PasteMarkdownPayload } from "./paste.ts";
import { runSourceCommand } from "./run.ts";
import { insertAtSelection } from "./text.ts";

const CELL_TYPES = new Set(["tableCell", "tableHeader"]);

interface CellPosition {
  table: PMNode;
  tablePos: number;
  row: number;
  column: number;
}

/** 光标（单元格选区时是它的起点）所在的格 */
export function cellAt(state: EditorState): CellPosition | null {
  const { selection } = state;
  let $cell: ResolvedPos;
  if (selection instanceof CellSelection) {
    // 选中的矩形的左上角：拖选不一定是从左上往右下（从左下拖到右上时，文档里靠前的那一格在右上，审查 #11）。
    // Markdown 表格没有合并的格子，行、列的下标直接取小的
    const { $anchorCell, $headCell } = selection;
    $cell = $anchorCell;
    return {
      table: $cell.node(-1),
      tablePos: $cell.before(-1),
      row: Math.min($anchorCell.index(-1), $headCell.index(-1)),
      column: Math.min($anchorCell.index(), $headCell.index()),
    };
  }
  const { $from } = selection;
  if (!CELL_TYPES.has($from.parent.type.name) || !selection.$to.sameParent($from)) return null;
  return { table: $from.node(-2), tablePos: $from.before(-2), row: $from.index(-2), column: $from.index(-1) };
}

/** 单元格里的一行文字：竖线转义，换行变成 `<br>` */
export function cellText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/(?<!\\)\|/g, "\\|")
    .replace(/\n/g, "<br>");
}

/** 剪贴板里是不是表格数据：按 C-3 的规则转成 Markdown，正好是一张表格时取出每格的原文 */
function pastedRows(payload: PasteMarkdownPayload, syntax: SyntaxOptions): string[][] | null {
  const converted = pasteMarkdownContent({ value: "", selectionStart: 0, selectionEnd: 0 }, payload);
  if (!converted?.value.trim()) return null;
  const blocks = blockChildren(parse(converted.value.trim(), { syntax }));
  if (blocks.length !== 1 || blocks[0].type !== "table") return null;
  return blockChildren(blocks[0]).map((row) => blockChildren(row).map((cell) => nodeText(cell)));
}

/** T-6：从 start 那一格开始填，不够时加行、加列；没改的行还是原来的节点（原文逐字节不变，T-7） */
function fillCells(state: EditorState, start: CellPosition, rows: string[][]) {
  const { table, tablePos } = start;
  const schema = state.schema;
  const height = Math.max(table.childCount, start.row + rows.length);
  const oldWidth = table.firstChild?.childCount ?? 0;
  const width = Math.max(oldWidth, start.column + Math.max(...rows.map((row) => row.length)));
  const newRows: PMNode[] = [];
  let last: { row: number; column: number; length: number } | null = null;
  for (let row = 0; row < height; row += 1) {
    const old = row < table.childCount ? table.child(row) : null;
    const type = row === 0 ? schema.nodes.tableHeader : schema.nodes.tableCell;
    const pasted = row >= start.row ? rows[row - start.row] : undefined;
    let changed = !old || width > oldWidth;
    const cells: PMNode[] = [];
    for (let column = 0; column < width; column += 1) {
      const value = pasted && column >= start.column ? pasted[column - start.column] : undefined;
      if (value !== undefined) {
        cells.push(type.create(null, value ? schema.text(value) : null));
        changed = true;
        last = { row, column, length: value.length };
      } else if (old && column < old.childCount) {
        cells.push(old.child(column));
      } else {
        cells.push(type.create(null, null));
      }
    }
    newRows.push(changed || !old ? schema.nodes.tableRow.create(old?.attrs ?? null, cells) : old);
  }
  const align = [...((table.attrs.align as Array<string | null> | null) ?? [])];
  while (align.length < width) align.push(null);
  const tr = state.tr.replaceWith(tablePos, tablePos + table.nodeSize, table.type.create({ ...table.attrs, align }, newRows));
  // 光标放在填进去的最后一格的末尾
  if (last) {
    const newTable = tr.doc.nodeAt(tablePos);
    if (newTable) {
      let pos = tablePos + 1;
      for (let row = 0; row < last.row; row += 1) pos += newTable.child(row).nodeSize;
      const rowNode = newTable.child(last.row);
      pos += 1;
      for (let column = 0; column < last.column; column += 1) pos += rowNode.child(column).nodeSize;
      tr.setSelection(TextSelection.create(tr.doc, pos + 1 + last.length));
    }
  }
  return tr;
}

/** 粘贴到单元格里（光标在格子里或选中了几个格子时）；处理了返回 true */
export function pasteIntoCells(editor: Editor, payload: PasteMarkdownPayload, plain = false): boolean {
  const start = cellAt(editor.state);
  if (!start) return false;
  const rows = plain ? null : pastedRows(payload, editor.storage.marko.syntax);
  if (rows) {
    editor.view.dispatch(fillCells(editor.state, start, rows).scrollIntoView());
    return true;
  }
  if (editor.state.selection instanceof CellSelection) return false;
  const text = payload.text ?? "";
  if (!text) return false;
  return runSourceCommand(editor, ({ source }) => insertAtSelection(source, cellText(text)));
}

/** T-2：在单元格里输入：竖线转义；不在格子里时返回 false */
export function typeInCell(editor: Editor, inserted: string): boolean {
  if (!inserted.includes("|") || !cellAt(editor.state) || editor.state.selection instanceof CellSelection) return false;
  return runSourceCommand(editor, ({ source }) => ({ ...insertAtSelection(source, cellText(inserted)), inline: true }));
}

/** T-2：单元格里 Shift+回车插入 `<br>` */
export function cellLineBreak(editor: Editor): boolean {
  if (!cellAt(editor.state) || editor.state.selection instanceof CellSelection) return false;
  return runSourceCommand(editor, ({ source }) => ({ ...insertAtSelection(source, "<br>"), inline: true }));
}

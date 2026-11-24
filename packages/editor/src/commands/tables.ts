import { DEFAULT_TEXTS, type EditorTexts } from "../texts.ts";
// 表格（T-1～T-5）：插入表格、Tab 跳格、行列的插入删除移动、对齐、选择。
// 代码移植自旧版 src/utils/editorCommands.ts（test/behavior/T.md 的基准，逐字节一致）：按源码改表格，
// 改完由 source.ts 重新解析成表格节点
/* eslint-disable */

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface TextEditResult extends TextState {}

/** 「段落 → 表格」插入的模板：三列、一行，第二列居中（同旧版） */
export function tableTemplateOf(texts: EditorTexts = DEFAULT_TEXTS): string {
  const [first, second, third] = [1, 2, 3].map((n) => texts.tableColumn(n));
  const cell = texts.tableCell;
  return `\n| ${first} | ${second} | ${third} |\n| --- | :---: | --- |\n| ${cell} | ${cell} | ${cell} |\n`;
}

export const tableTemplate = tableTemplateOf();

export function normalizeSelection(state: TextState): TextState {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd));
  const selectionEnd = Math.max(0, Math.max(state.selectionStart, state.selectionEnd));
  return {
    value: state.value,
    selectionStart,
    selectionEnd,
  };
}

export type MarkdownTableRowPosition = "above" | "below";

export type MarkdownTableColumnPosition = "left" | "right";

export type MarkdownTableRowMoveDirection = "up" | "down";

export type MarkdownTableColumnMoveDirection = "left" | "right";

export type MarkdownTableCellDirection = "next" | "previous";

export type MarkdownTableSelectionKind = "cell" | "row" | "column" | "table";

export interface TableRowFormat {
  leadingPipe: boolean;
  trailingPipe: boolean;
}

export function editMarkdownTable(state: TextState, kind: "row" | "column", texts: EditorTexts = DEFAULT_TEXTS): TextEditResult {
  return kind === "row"
    ? insertMarkdownTableRow(state, "below", texts.tableCell)
    : insertMarkdownTableColumn(state, "right", texts);
}

export function insertMarkdownTableTemplate(state: TextState, texts: EditorTexts = DEFAULT_TEXTS): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const normalizedTemplate = normalizeGeneratedLineBreaks(tableTemplateOf(texts), lineBreak);
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${normalizedTemplate}${normalized.value.slice(normalized.selectionEnd)}`;
  const firstHeader = texts.tableColumn(1);
  const headerOffset = normalizedTemplate.indexOf(firstHeader);
  const selectionStart = normalized.selectionStart + (headerOffset >= 0 ? headerOffset : normalizedTemplate.length);
  return {
    value,
    selectionStart,
    selectionEnd: selectionStart + (headerOffset >= 0 ? firstHeader.length : 0),
  };
}

export function insertMarkdownTableRow(
  state: TextState,
  position: MarkdownTableRowPosition,
  content = DEFAULT_TEXTS.tableCell,
): TextEditResult {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) {
    return insertMarkdownTableTemplate(normalized);
  }

  const lines = normalized.value.split("\n");
  const columns = splitTableRow(lines[table.start]).length;
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const rowRange = getSelectedTableBodyRowRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const columnIndex = columnRange.start;
  const rawInsertAt = rowRange
    ? position === "above" ? rowRange.start : rowRange.end + 1
    : position === "above" ? table.lineIndex : table.lineIndex + 1;
  const insertAt = Math.min(table.end + 1, Math.max(table.separator + 1, rawInsertAt));
  insertLinePreservingBreak(
    normalized.value,
    lines,
    insertAt,
    `${table.prefix}${buildTableRow(Array.from({ length: columns }, () => content), table.rowFormat)}`,
  );
  const value = lines.join("\n");
  const cellRange = getTableCellContentRange(lines[insertAt] ?? "", columnIndex, getLineStartOffset(lines, insertAt), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function insertMarkdownTableColumn(
  state: TextState,
  position: MarkdownTableColumnPosition,
  texts: EditorTexts = DEFAULT_TEXTS,
): TextEditResult {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) {
    return insertMarkdownTableTemplate(normalized);
  }

  const lines = normalized.value.split("\n");
  const headerCells = splitTableRow(lines[table.start]);
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const insertAt = position === "left" ? columnRange.start : columnRange.end + 1;

  for (let index = table.start; index <= table.end; index += 1) {
    const cells = splitTableRow(lines[index]);
    padTableCells(cells, headerCells.length, index === table.separator ? "---" : "");
    cells.splice(insertAt, 0, index === table.start ? texts.newColumn : index === table.separator ? "---" : texts.tableCell);
    lines[index] = withExistingLineEnding(lines[index], `${table.prefix}${buildTableRow(cells, table.rowFormat)}`);
  }

  const value = lines.join("\n");
  const targetLine = table.lineIndex === table.separator ? table.start : table.lineIndex;
  const cellRange = getTableCellContentRange(lines[targetLine] ?? "", insertAt, getLineStartOffset(lines, targetLine), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function deleteMarkdownTablePart(state: TextState, kind: "row" | "column"): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const columnIndex = columnRange.start;
  if (kind === "row") {
    const rowRange = getSelectedTableBodyRowRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
    if (!rowRange) return null;
    if (table.end - table.start <= 1) return null;

    lines.splice(rowRange.start, rowRange.end - rowRange.start + 1);
    const nextLine = Math.min(rowRange.start, lines.length - 1);
    const targetLine = nextLine === table.separator ? table.start : nextLine;
    const value = lines.join("\n");
    const cellRange = getTableCellContentRange(lines[targetLine] ?? "", columnIndex, getLineStartOffset(lines, targetLine), table.rowFormat);
    return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
  }

  const headerCells = splitTableRow(lines[table.start]);
  const deleteCount = columnRange.end - columnRange.start + 1;
  if (headerCells.length <= 1 || deleteCount >= headerCells.length || columnIndex < 0 || columnIndex >= headerCells.length) return null;

  for (let index = table.start; index <= table.end; index += 1) {
    const cells = splitTableRow(lines[index]);
    padTableCells(cells, headerCells.length, index === table.separator ? "---" : "");
    cells.splice(columnRange.start, deleteCount);
    lines[index] = withExistingLineEnding(lines[index], `${table.prefix}${buildTableRow(cells, table.rowFormat)}`);
  }

  const value = lines.join("\n");
  const targetLine = table.lineIndex === table.separator ? table.start : table.lineIndex;
  const targetColumn = Math.min(columnIndex, Math.max(0, splitTableRow(lines[table.start]).length - 1));
  const cellRange = getTableCellContentRange(lines[targetLine] ?? "", targetColumn, getLineStartOffset(lines, targetLine), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function moveMarkdownTableRow(
  state: TextState,
  direction: MarkdownTableRowMoveDirection,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const rowRange = getSelectedTableBodyRowRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  if (!rowRange) return null;

  const targetIndex = direction === "up" ? rowRange.start - 1 : rowRange.end + 1;
  if (targetIndex <= table.separator || targetIndex > table.end) return null;

  const lineEndings = lines.map((line) => splitCarriageReturnEnding(line).ending);
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const columnIndex = columnRange.start;
  if (direction === "up") {
    const previous = lines[targetIndex];
    const moved = lines.splice(rowRange.start, rowRange.end - rowRange.start + 1);
    lines.splice(targetIndex, 1, ...moved, previous);
  } else {
    const next = lines[targetIndex];
    const moved = lines.splice(rowRange.start, rowRange.end - rowRange.start + 1);
    lines.splice(rowRange.start, 1, next, ...moved);
  }
  restoreLineEndingsByIndex(lines, lineEndings);

  const value = lines.join("\n");
  const nextLine = direction === "up" ? rowRange.start - 1 : rowRange.start + 1;
  const cellRange = getTableCellContentRange(lines[nextLine] ?? "", columnIndex, getLineStartOffset(lines, nextLine), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function moveMarkdownTableColumn(
  state: TextState,
  direction: MarkdownTableColumnMoveDirection,
): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const headerCells = splitTableRow(lines[table.start]);
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const moveCount = columnRange.end - columnRange.start + 1;
  const targetStart = direction === "left" ? columnRange.start - 1 : columnRange.end + 1;
  if (targetStart < 0 || targetStart >= headerCells.length) return null;

  for (let index = table.start; index <= table.end; index += 1) {
    const cells = splitTableRow(lines[index]);
    padTableCells(cells, headerCells.length, index === table.separator ? "---" : "");
    if (direction === "left") {
      const previous = cells[columnRange.start - 1];
      const moved = cells.splice(columnRange.start, moveCount);
      cells.splice(columnRange.start - 1, 1, ...moved, previous);
    } else {
      const next = cells[columnRange.end + 1];
      const moved = cells.splice(columnRange.start, moveCount);
      cells.splice(columnRange.start, 1, next, ...moved);
    }
    lines[index] = withExistingLineEnding(lines[index], `${table.prefix}${buildTableRow(cells, table.rowFormat)}`);
  }

  const value = lines.join("\n");
  const targetLine = table.lineIndex === table.separator ? table.start : table.lineIndex;
  const targetColumn = direction === "left" ? columnRange.start - 1 : columnRange.start + 1;
  const cellRange = getTableCellContentRange(lines[targetLine] ?? "", targetColumn, getLineStartOffset(lines, targetLine), table.rowFormat);
  return { value, selectionStart: cellRange.start, selectionEnd: cellRange.end };
}

export function selectMarkdownTablePart(state: TextState, kind: MarkdownTableSelectionKind): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  if (kind === "table") {
    return {
      value: normalized.value,
      selectionStart: getLineStartOffset(lines, table.start),
      selectionEnd: getLineContentEndOffset(lines, table.end),
    };
  }

  if (kind === "cell") {
    const cell = getCurrentTableCellRange(normalized.value, normalized.selectionStart, normalized.selectionEnd);
    return cell ? { value: normalized.value, selectionStart: cell.start, selectionEnd: cell.end } : null;
  }

  if (kind === "row") {
    const rowRange = getSelectedTableRowRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
    return {
      value: normalized.value,
      selectionStart: getLineStartOffset(lines, rowRange.start),
      selectionEnd: getLineContentEndOffset(lines, rowRange.end),
    };
  }

  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const firstCell = getTableCellContentRange(lines[table.start] ?? "", columnRange.start, getLineStartOffset(lines, table.start), table.rowFormat);
  const lastCell = getTableCellContentRange(lines[table.end] ?? "", columnRange.end, getLineStartOffset(lines, table.end), table.rowFormat);
  return {
    value: normalized.value,
    selectionStart: firstCell.start,
    selectionEnd: lastCell.end,
  };
}

export function deleteMarkdownTable(state: TextState): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const deleteStart = getLineStartOffset(lines, table.start);
  const deleteEnd = getTableEndOffset(lines, table);
  const value = `${normalized.value.slice(0, deleteStart)}${normalized.value.slice(deleteEnd)}`;
  const cursor = Math.min(deleteStart, value.length);
  return {
    value,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

export function alignMarkdownTable(state: TextState, align: "left" | "center" | "right"): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = findTableRangeForSelection(normalized.value, normalized.selectionStart, normalized.selectionEnd);
  if (!table) return null;

  const lines = normalized.value.split("\n");
  const cells = splitTableRow(lines[table.separator]);
  const columnRange = getSelectedTableColumnRange(lines, table, normalized.selectionStart, normalized.selectionEnd);
  const headerCells = splitTableRow(lines[table.start]);
  padTableCells(cells, headerCells.length, "---");
  const marker = align === "left" ? ":---" : align === "right" ? "---:" : ":---:";
  for (let column = columnRange.start; column <= columnRange.end; column += 1) {
    cells[column] = marker;
  }
  lines[table.separator] = withExistingLineEnding(lines[table.separator], `${table.prefix}${buildTableRow(cells, table.rowFormat)}`);
  return { value: lines.join("\n"), selectionStart: normalized.selectionStart, selectionEnd: normalized.selectionEnd };
}

function padTableCells(cells: string[], length: number, filler: string): void {
  while (cells.length < length) {
    cells.push(filler);
  }
}

function restoreLineEndingsByIndex(lines: string[], endings: Array<"" | "\r">): void {
  for (let index = 0; index < lines.length; index += 1) {
    const { body } = splitCarriageReturnEnding(lines[index] ?? "");
    lines[index] = `${body}${endings[index] ?? ""}`;
  }
}

export function navigateMarkdownTableCell(
  state: TextState,
  direction: MarkdownTableCellDirection,
): TextEditResult | null {
  const table = findTableRange(state.value, state.selectionStart);
  if (!table) return null;

  const lines = state.value.split("\n");
  const headerCells = splitTableRow(lines[table.start]);
  const columnIndex = getActiveTableColumnIndex(lines, table, state.selectionStart);
  const target = findNavigableTableCell(lines, table, columnIndex, direction);
  if (!target) return normalizeSelection(state);

  const nextLines = [...lines];
  let targetLine = target.line;
  if (target.addRow) {
    targetLine = table.end + 1;
    insertLinePreservingBreak(
      state.value,
      nextLines,
      targetLine,
      `${table.prefix}${buildTableRow(Array.from({ length: headerCells.length }, () => ""), table.rowFormat)}`,
    );
  } else if (targetLine !== table.separator) {
    const cells = splitTableRow(nextLines[targetLine] ?? "");
    if (cells.length < headerCells.length) {
      nextLines[targetLine] = withExistingLineEnding(nextLines[targetLine], `${table.prefix}${buildTableRow([
        ...cells,
        ...Array.from({ length: headerCells.length - cells.length }, () => ""),
      ], table.rowFormat)}`);
    }
  }

  const value = nextLines.join("\n");
  const cellRange = getTableCellContentRange(nextLines[targetLine] ?? "", target.column, getLineStartOffset(nextLines, targetLine), table.rowFormat);
  return {
    value,
    selectionStart: cellRange.start,
    selectionEnd: cellRange.end,
  };
}

export function splitTableRow(row: string): string[] {
  let content = getTableLineContext(row).content.trim();
  if (content.startsWith("|")) {
    content = content.slice(1);
  }
  if (content.endsWith("|") && !isEscapedAt(content, content.length - 1)) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscapedAt(content, index)) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += content[index];
  }
  cells.push(current.trim());
  return cells;
}

export function buildTableRow(cells: string[], format: TableRowFormat = { leadingPipe: true, trailingPipe: true }): string {
  const tableSafeFormat = cells.length <= 1 && !format.leadingPipe && !format.trailingPipe
    ? { leadingPipe: false, trailingPipe: true }
    : format;
  const body = cells.join(" | ");
  if (tableSafeFormat.leadingPipe && tableSafeFormat.trailingPipe) return `| ${body} |`;
  if (tableSafeFormat.leadingPipe) return `| ${body}`;
  if (tableSafeFormat.trailingPipe) return `${body} |`;
  return body;
}

function parseQuotePrefix(line: string): {
  rawLength: number;
  normalized: string;
  depth: number;
  contentColumn: number;
} | null {
  const quote = readMarkdownBlockquotePrefix(line);
  if (!quote) return null;
  const leading = quote.raw.match(/^[ \t]*/)?.[0] ?? "";
  return {
    rawLength: quote.raw.length,
    normalized: `${leading}${"> ".repeat(quote.depth)}`,
    depth: quote.depth,
    contentColumn: quote.contentColumn,
  };
}

interface TableRange {
  start: number;
  end: number;
  separator: number;
  lineIndex: number;
  prefix: string;
  rowFormat: TableRowFormat;
}

interface TableCellTarget {
  line: number;
  column: number;
  addRow?: boolean;
}

interface TextRange {
  start: number;
  end: number;
}

interface IndexRange {
  start: number;
  end: number;
}

function findTableRangeForSelection(value: string, selectionStart: number, selectionEnd: number): TableRange | null {
  const tableAtStart = findTableRange(value, selectionStart);
  if (tableAtStart) return tableAtStart;

  if (selectionEnd === selectionStart) return null;
  return findTableRange(value, Math.max(selectionStart, selectionEnd - 1));
}

function getCurrentTableCellRange(value: string, selectionStart: number, selectionEnd: number): TextRange | null {
  const table = findTableRangeForSelection(value, selectionStart, selectionEnd);
  if (!table || table.lineIndex === table.separator) return null;

  const lines = value.split("\n");
  const line = lines[table.lineIndex] ?? "";
  if (!line.trim()) return null;

  const lineStart = getLineStartOffset(lines, table.lineIndex);
  const column = getActiveTableColumnIndex(lines, table, selectionStart);
  return getTableCellContentRange(line, column, lineStart, table.rowFormat);
}

function getSelectedTableBodyRowRange(
  lines: string[],
  table: TableRange,
  selectionStart: number,
  selectionEnd: number,
): IndexRange | null {
  const lineRange = getSelectedLineIndexRange(lines, selectionStart, selectionEnd);
  const start = Math.max(lineRange.start, table.separator + 1);
  const end = Math.min(lineRange.end, table.end);
  return start <= end ? { start, end } : null;
}

function getSelectedTableRowRange(
  lines: string[],
  table: TableRange,
  selectionStart: number,
  selectionEnd: number,
): IndexRange {
  const lineRange = getSelectedLineIndexRange(lines, selectionStart, selectionEnd);
  return {
    start: Math.max(lineRange.start, table.start),
    end: Math.min(lineRange.end, table.end),
  };
}

function getSelectedTableColumnRange(
  lines: string[],
  table: TableRange,
  selectionStart: number,
  selectionEnd: number,
): IndexRange {
  const headerCells = splitTableRow(lines[table.start] ?? "");
  const lastColumn = Math.max(0, headerCells.length - 1);
  const endOffset = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
  const startColumn = getTableColumnAtOffset(lines, table, selectionStart);
  const endColumn = getTableColumnAtOffset(lines, table, endOffset);

  return {
    start: Math.min(startColumn, endColumn, lastColumn),
    end: Math.min(Math.max(startColumn, endColumn), lastColumn),
  };
}

function getSelectedLineIndexRange(lines: string[], selectionStart: number, selectionEnd: number): IndexRange {
  const endOffset = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
  return {
    start: findLineIndex(lines, selectionStart),
    end: findLineIndex(lines, Math.max(selectionStart, endOffset)),
  };
}

function getTableColumnAtOffset(lines: string[], table: TableRange, offset: number): number {
  const headerCells = splitTableRow(lines[table.start] ?? "");
  const lastColumn = Math.max(0, headerCells.length - 1);
  const lineIndex = findLineIndex(lines, offset);
  if (lineIndex < table.start) return 0;
  if (lineIndex > table.end) return lastColumn;

  const line = lines[lineIndex] ?? "";
  const context = getTableLineContext(line);
  if (context.prefix !== table.prefix || !isTableRowContent(context.content)) {
    return lineIndex <= table.start ? 0 : lastColumn;
  }

  return Math.min(getTableColumnIndex(line, getCursorColumn(lines, offset), table.rowFormat), lastColumn);
}

function getTableEndOffset(lines: string[], table: TableRange): number {
  return table.end + 1 < lines.length
    ? getLineStartOffset(lines, table.end + 1)
    : getLineStartOffset(lines, table.end) + (lines[table.end]?.length ?? 0);
}

function getLineContentEndOffset(lines: string[], lineIndex: number): number {
  const line = lines[lineIndex] ?? "";
  const contentLength = line.endsWith("\r") ? line.length - 1 : line.length;
  return getLineStartOffset(lines, lineIndex) + contentLength;
}

function findTableRange(value: string, cursor: number): TableRange | null {
  const lines = value.split("\n");
  const lineIndex = findLineIndex(lines, cursor);
  const context = getTableLineContext(lines[lineIndex] ?? "");
  if (!isTableRowContent(context.content)) return null;

  let rangeStart = lineIndex;
  let rangeEnd = lineIndex;
  while (rangeStart > 0 && isTableLineInContext(lines[rangeStart - 1], context.prefix)) rangeStart -= 1;
  while (rangeEnd + 1 < lines.length && isTableLineInContext(lines[rangeEnd + 1], context.prefix)) rangeEnd += 1;

  for (let separator = rangeStart + 1; separator <= rangeEnd; separator += 1) {
    if (!isTableSeparatorContent(getTableLineContext(lines[separator]).content)) continue;

    const start = separator - 1;
    if (lineIndex < start || lineIndex > rangeEnd) continue;
      return {
        start,
        end: rangeEnd,
        separator,
        lineIndex,
        prefix: context.prefix,
        rowFormat: getTableRowFormat(getTableLineContext(lines[start] ?? "").content),
      };
  }

  return null;
}

function isTableLineInContext(line: string, prefix: string): boolean {
  const context = getTableLineContext(line);
  return context.prefix === prefix && isTableRowContent(context.content);
}

function getTableRowFormat(content: string): TableRowFormat {
  return {
    leadingPipe: /^\s*\|/.test(content),
    trailingPipe: hasTrailingTablePipe(content),
  };
}

function findLineIndex(lines: string[], cursor: number): number {
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = offset + lines[index].length;
    if (cursor <= lineEnd || index === lines.length - 1) return index;
    offset = lineEnd + 1;
  }
  return Math.max(0, lines.length - 1);
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeGeneratedLineBreaks(value: string, lineBreak: "\n" | "\r\n"): string {
  return value.replace(/\r\n|\r|\n/g, lineBreak);
}

function insertLinePreservingBreak(
  value: string,
  lines: string[],
  insertAt: number,
  line: string,
): void {
  let nextLine = line;
  if (getPreferredLineBreak(value) === "\r\n") {
    if (insertAt > 0 && lines[insertAt - 1] && !lines[insertAt - 1].endsWith("\r")) {
      lines[insertAt - 1] = `${lines[insertAt - 1]}\r`;
    }
    if (insertAt < lines.length) {
      nextLine = `${line}\r`;
    }
  }
  lines.splice(insertAt, 0, nextLine);
}

function withExistingLineEnding(existingLine: string | undefined, line: string): string {
  return existingLine?.endsWith("\r") ? `${line}\r` : line;
}

function splitCarriageReturnEnding(line: string): { body: string; ending: "" | "\r" } {
  return line.endsWith("\r")
    ? { body: line.slice(0, -1), ending: "\r" }
    : { body: line, ending: "" };
}

function getLineStartOffset(lines: string[], lineIndex: number): number {
  return lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0);
}

function getIndentWidth(value: string): number {
  return getMarkdownIndentWidth(value);
}

function getCursorColumn(lines: string[], cursor: number): number {
  const lineIndex = findLineIndex(lines, cursor);
  return cursor - getLineStartOffset(lines, lineIndex);
}

function getTableColumnIndex(line: string, cursorColumn: number, format?: TableRowFormat): number {
  const context = getTableLineContext(line);
  const contentColumn = Math.max(0, cursorColumn - context.rawPrefixLength);
  const beforeCursor = context.content.slice(0, contentColumn);
  const pipeCount = countUnescapedPipes(beforeCursor);
  const leadingPipe = format?.leadingPipe ?? /^\s*\|/.test(context.content);
  if (leadingPipe) {
    return Math.max(0, pipeCount - 1);
  }
  return Math.max(0, pipeCount);
}

function getActiveTableColumnIndex(lines: string[], table: TableRange, cursor: number): number {
  const headerCells = splitTableRow(lines[table.start]);
  const line = lines[table.lineIndex] ?? lines[table.start];
  const rawIndex = getTableColumnIndex(line, getCursorColumn(lines, cursor), table.rowFormat);
  return Math.min(Math.max(0, rawIndex), Math.max(0, headerCells.length - 1));
}

function findNavigableTableCell(
  lines: string[],
  table: TableRange,
  columnIndex: number,
  direction: MarkdownTableCellDirection,
): TableCellTarget | null {
  const columnCount = splitTableRow(lines[table.start]).length;
  const lastColumn = Math.max(0, columnCount - 1);
  const column = Math.min(Math.max(0, columnIndex), lastColumn);

  if (direction === "previous") {
    if (table.lineIndex === table.separator) {
      return { line: table.start, column: lastColumn };
    }
    if (column > 0) {
      return { line: table.lineIndex, column: column - 1 };
    }

    const previousLine = findPreviousEditableTableLine(table, table.lineIndex);
    return previousLine === null ? null : { line: previousLine, column: lastColumn };
  }

  if (table.lineIndex === table.separator) {
    const nextLine = findNextEditableTableLine(table, table.lineIndex);
    return nextLine === null ? { line: table.end + 1, column: 0, addRow: true } : { line: nextLine, column: 0 };
  }
  if (column < lastColumn) {
    return { line: table.lineIndex, column: column + 1 };
  }

  const nextLine = findNextEditableTableLine(table, table.lineIndex);
  return nextLine === null ? { line: table.end + 1, column: 0, addRow: true } : { line: nextLine, column: 0 };
}

function findNextEditableTableLine(table: TableRange, lineIndex: number): number | null {
  for (let index = lineIndex + 1; index <= table.end; index += 1) {
    if (index !== table.separator) return index;
  }
  return null;
}

function findPreviousEditableTableLine(table: TableRange, lineIndex: number): number | null {
  for (let index = lineIndex - 1; index >= table.start; index -= 1) {
    if (index !== table.separator) return index;
  }
  return null;
}

function getTableCellContentRange(line: string, columnIndex: number, lineStart: number, format?: TableRowFormat): TextRange {
  const context = getTableLineContext(line);
  const content = context.content;
  const pipes: number[] = [];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscapedAt(content, index)) {
      pipes.push(index);
    }
  }

  if (pipes.length < 1) {
    return { start: lineStart, end: lineStart };
  }

  const leadingPipe = format?.leadingPipe ?? /^\s*\|/.test(content);
  const trailingPipe = format?.trailingPipe ?? hasTrailingTablePipe(content);
  const cellCount = format
    ? getFormattedTableCellCount(pipes.length, leadingPipe, trailingPipe)
    : splitTableRow(line).length;
  const cellIndex = Math.min(Math.max(0, columnIndex), Math.max(0, cellCount - 1));
  const rawStart = leadingPipe
    ? (pipes[cellIndex] ?? -1) + 1
    : cellIndex === 0
      ? 0
      : (pipes[cellIndex - 1] ?? -1) + 1;
  const rawEnd = leadingPipe
    ? (pipes[cellIndex + 1] ?? line.length)
    : (pipes[cellIndex] ?? content.length);
  const boundedEnd = trailingPipe || rawEnd < content.length ? rawEnd : content.length;
  let start = rawStart;
  let end = boundedEnd;
  while (start < end && /\s/.test(content[start])) start += 1;
  while (end > start && /\s/.test(content[end - 1])) end -= 1;
  if (start === end) {
    const cursor = rawStart < boundedEnd && /\s/.test(content[rawStart]) ? rawStart + 1 : rawStart;
    return {
      start: lineStart + context.rawPrefixLength + cursor,
      end: lineStart + context.rawPrefixLength + cursor,
    };
  }
  return {
    start: lineStart + context.rawPrefixLength + start,
    end: lineStart + context.rawPrefixLength + end,
  };
}

function getFormattedTableCellCount(pipeCount: number, leadingPipe: boolean, trailingPipe: boolean): number {
  if (leadingPipe && trailingPipe) return Math.max(1, pipeCount - 1);
  if (leadingPipe || trailingPipe) return Math.max(1, pipeCount);
  return Math.max(1, pipeCount + 1);
}

function isTableShortcutLine(line: string): boolean {
  const trimmed = line.trim();
  return Boolean(trimmed) && countUnescapedPipes(trimmed) > 0;
}

function isTableRowContent(content: string): boolean {
  const indent = content.match(/^[ \t]*/)?.[0] ?? "";
  if (getIndentWidth(indent) >= 4) return false;
  return isTableShortcutLine(content);
}

function isTableSeparatorContent(content: string): boolean {
  const cells = splitTableRow(content);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function getTableLineContext(line: string): { content: string; prefix: string; rawPrefixLength: number } {
  const quote = parseQuotePrefix(line);
  return {
    content: quote ? line.slice(quote.rawLength) : line,
    prefix: quote?.normalized ?? "",
    rawPrefixLength: quote?.rawLength ?? 0,
  };
}

function hasTrailingTablePipe(line: string): boolean {
  const trimmedEnd = line.search(/\s*$/);
  const index = (trimmedEnd === -1 ? line.length : trimmedEnd) - 1;
  return index >= 0 && line[index] === "|" && !isEscapedAt(line, index);
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function countUnescapedPipes(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "|" && !isEscapedAt(value, index)) {
      count += 1;
    }
  }
  return count;
}



export interface MarkdownBlockquotePrefix {
  raw: string;
  depth: number;
  contentColumn: number;
}

export function getMarkdownIndentWidth(value: string): number {
  return getMarkdownColumnAfter(value);
}

export function getMarkdownColumnAfter(value: string, startColumn = 0): number {
  let column = Math.max(0, Math.trunc(startColumn));
  for (const character of value) {
    column += character === "\t" ? 4 - (column % 4) : 1;
  }
  return column;
}

export function readMarkdownBlockquotePrefix(
  line: string,
  maximumDepth: number | null = null,
): MarkdownBlockquotePrefix | null {
  let cursor = 0;
  let depth = 0;
  let column = 0;
  while (maximumDepth === null || depth < maximumDepth) {
    const marker = line.slice(cursor).match(/^([ \t]*)>/);
    if (!marker) break;
    const leadingColumn = getMarkdownColumnAfter(marker[1] ?? "", column);
    if (leadingColumn - column > 3) break;
    cursor += marker[0].length;
    column = leadingColumn + 1;
    if (line[cursor] === " " || line[cursor] === "\t") {
      column = getMarkdownColumnAfter(line[cursor], column);
      cursor += 1;
    }
    depth += 1;
  }
  return depth > 0
    ? { raw: line.slice(0, cursor), depth, contentColumn: column }
    : null;
}

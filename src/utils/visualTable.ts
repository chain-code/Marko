import { buildTableRow, splitTableRow } from "./editorCommands";

export type TableAlignment = "left" | "center" | "right";

export interface VisualTableModel {
  headers: string[];
  rows: string[][];
  alignments: TableAlignment[];
  leadingPipe: boolean;
  trailingPipe: boolean;
  lineEnding: "\n" | "\r\n";
  trailingEnding: string;
}

export function parseVisualTable(source: string): VisualTableModel | null {
  const trailingEnding = source.match(/\s*$/)?.[0] ?? "";
  const content = source.slice(0, source.length - trailingEnding.length);
  const lineEnding = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return null;

  const headers = splitTableRow(lines[0]);
  const separators = splitTableRow(lines[1]);
  if (headers.length < 2 || separators.length !== headers.length) return null;
  if (!separators.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) return null;

  const first = lines[0].trim();
  const leadingPipe = first.startsWith("|");
  const trailingPipe = hasUnescapedTrailingPipe(first);
  const rows = lines.slice(2).map((line) => padRow(splitTableRow(line), headers.length));

  return {
    headers: padRow(headers, headers.length),
    rows,
    alignments: separators.map(parseAlignment),
    leadingPipe,
    trailingPipe,
    lineEnding,
    trailingEnding,
  };
}

export function serializeVisualTable(table: VisualTableModel): string {
  const format = { leadingPipe: table.leadingPipe, trailingPipe: table.trailingPipe };
  const columnCount = Math.max(2, table.headers.length);
  const lines = [
    buildTableRow(padRow(table.headers, columnCount).map(escapeTableCell), format),
    buildTableRow(padRow(table.alignments.map(formatAlignment), columnCount), format),
    ...table.rows.map((row) => buildTableRow(padRow(row, columnCount).map(escapeTableCell), format)),
  ];
  return `${lines.join(table.lineEnding)}${table.trailingEnding}`;
}

export function resizeVisualTable(
  table: VisualTableModel,
  rows: number,
  columns: number,
): VisualTableModel {
  const rowCount = Math.max(1, Math.round(rows));
  const columnCount = Math.max(2, Math.round(columns));
  return {
    ...table,
    headers: padRow(table.headers, columnCount).slice(0, columnCount),
    alignments: padRow(table.alignments, columnCount, "left").slice(0, columnCount),
    rows: Array.from({ length: rowCount }, (_, index) => (
      padRow(table.rows[index] ?? [], columnCount).slice(0, columnCount)
    )),
  };
}

export function updateVisualTableCell(
  table: VisualTableModel,
  row: number,
  column: number,
  value: string,
): VisualTableModel {
  const next = cloneTable(table);
  if (row === 0) {
    next.headers[column] = normalizeCellValue(value);
  } else if (next.rows[row - 1]) {
    next.rows[row - 1][column] = normalizeCellValue(value);
  }
  return next;
}

export function insertVisualTableRow(table: VisualTableModel, row: number): VisualTableModel {
  const next = cloneTable(table);
  const target = Math.max(0, Math.min(next.rows.length, row));
  next.rows.splice(target, 0, Array.from({ length: next.headers.length }, () => ""));
  return next;
}

export function deleteVisualTableRow(table: VisualTableModel, row: number): VisualTableModel {
  if (table.rows.length <= 1) return table;
  const next = cloneTable(table);
  next.rows.splice(Math.max(0, Math.min(next.rows.length - 1, row)), 1);
  return next;
}

export function insertVisualTableColumn(table: VisualTableModel, column: number): VisualTableModel {
  const next = cloneTable(table);
  const target = Math.max(0, Math.min(next.headers.length, column));
  next.headers.splice(target, 0, "");
  next.alignments.splice(target, 0, "left");
  next.rows.forEach((row) => row.splice(target, 0, ""));
  return next;
}

export function deleteVisualTableColumn(table: VisualTableModel, column: number): VisualTableModel {
  if (table.headers.length <= 2) return table;
  const next = cloneTable(table);
  const target = Math.max(0, Math.min(next.headers.length - 1, column));
  next.headers.splice(target, 1);
  next.alignments.splice(target, 1);
  next.rows.forEach((row) => row.splice(target, 1));
  return next;
}

export function moveVisualTableRow(
  table: VisualTableModel,
  row: number,
  direction: "up" | "down",
): VisualTableModel {
  const target = direction === "up" ? row - 1 : row + 1;
  if (row < 0 || row >= table.rows.length || target < 0 || target >= table.rows.length) return table;
  const next = cloneTable(table);
  [next.rows[row], next.rows[target]] = [next.rows[target], next.rows[row]];
  return next;
}

export function moveVisualTableColumn(
  table: VisualTableModel,
  column: number,
  direction: "left" | "right",
): VisualTableModel {
  const target = direction === "left" ? column - 1 : column + 1;
  if (column < 0 || column >= table.headers.length || target < 0 || target >= table.headers.length) return table;
  const next = cloneTable(table);
  swap(next.headers, column, target);
  swap(next.alignments, column, target);
  next.rows.forEach((row) => swap(row, column, target));
  return next;
}

export function alignVisualTableColumn(
  table: VisualTableModel,
  column: number,
  alignment: TableAlignment,
): VisualTableModel {
  const next = cloneTable(table);
  next.alignments[Math.max(0, Math.min(next.alignments.length - 1, column))] = alignment;
  return next;
}

function cloneTable(table: VisualTableModel): VisualTableModel {
  return {
    ...table,
    headers: [...table.headers],
    rows: table.rows.map((row) => [...row]),
    alignments: [...table.alignments],
  };
}

function padRow<T>(row: T[], count: number, empty = "" as T): T[] {
  return [...row, ...Array.from({ length: Math.max(0, count - row.length) }, () => empty)];
}

function parseAlignment(separator: string): TableAlignment {
  const value = separator.trim();
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  return "left";
}

function formatAlignment(alignment: TableAlignment): string {
  if (alignment === "center") return ":---:";
  if (alignment === "right") return "---:";
  return "---";
}

function normalizeCellValue(value: string): string {
  return value.replace(/\r?\n/g, "<br>").trim();
}

function escapeTableCell(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "|" && !isEscapedAt(value, index)) output += "\\";
    output += char;
  }
  return output;
}

function hasUnescapedTrailingPipe(value: string): boolean {
  const index = value.length - 1;
  return index >= 0 && value[index] === "|" && !isEscapedAt(value, index);
}

function isEscapedAt(value: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function swap<T>(items: T[], left: number, right: number) {
  [items[left], items[right]] = [items[right], items[left]];
}

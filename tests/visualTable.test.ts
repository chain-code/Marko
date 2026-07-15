import test from "node:test";
import assert from "node:assert/strict";
import {
  alignVisualTableColumn,
  deleteVisualTableColumn,
  deleteVisualTableRow,
  insertVisualTableColumn,
  insertVisualTableRow,
  moveVisualTableColumn,
  moveVisualTableRow,
  parseVisualTable,
  resizeVisualTable,
  serializeVisualTable,
  updateVisualTableCell,
} from "../src/utils/visualTable";

test("visual table parses cells, alignment and source formatting", () => {
  const source = "Name | Status | Notes\r\n--- | :---: | ---:\r\nAda | Ready | A \\| B\r\n\r\n";
  const table = parseVisualTable(source);

  assert.ok(table);
  assert.deepEqual(table.headers, ["Name", "Status", "Notes"]);
  assert.deepEqual(table.alignments, ["left", "center", "right"]);
  assert.deepEqual(table.rows, [["Ada", "Ready", "A \\| B"]]);
  assert.equal(table.leadingPipe, false);
  assert.equal(table.trailingPipe, false);
  assert.equal(table.lineEnding, "\r\n");
  assert.equal(table.trailingEnding, "\r\n\r\n");
  assert.equal(serializeVisualTable(table), source);
});

test("visual table updates cells and escapes newly entered pipes", () => {
  const table = parseVisualTable("| A | B |\n| --- | --- |\n| 1 | 2 |");
  assert.ok(table);

  const next = updateVisualTableCell(table, 1, 1, "left | right");
  assert.equal(
    serializeVisualTable(next),
    "| A | B |\n| --- | --- |\n| 1 | left \\| right |",
  );
});

test("visual table inserts, deletes and resizes rows and columns", () => {
  const table = parseVisualTable("| A | B |\n| --- | --- |\n| 1 | 2 |");
  assert.ok(table);

  const withRow = insertVisualTableRow(table, 0);
  assert.deepEqual(withRow.rows, [["", ""], ["1", "2"]]);
  assert.deepEqual(deleteVisualTableRow(withRow, 0).rows, [["1", "2"]]);

  const withColumn = insertVisualTableColumn(table, 1);
  assert.deepEqual(withColumn.headers, ["A", "", "B"]);
  assert.deepEqual(withColumn.rows, [["1", "", "2"]]);
  assert.deepEqual(deleteVisualTableColumn(withColumn, 1).headers, ["A", "B"]);

  const resized = resizeVisualTable(table, 3, 4);
  assert.equal(resized.rows.length, 3);
  assert.equal(resized.headers.length, 4);
  assert.ok(resized.rows.every((row) => row.length === 4));
});

test("visual table moves rows and columns while retaining alignment", () => {
  const table = parseVisualTable("| A | B | C |\n| --- | :---: | ---: |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |");
  assert.ok(table);

  const movedRow = moveVisualTableRow(table, 1, "up");
  assert.deepEqual(movedRow.rows, [["4", "5", "6"], ["1", "2", "3"]]);

  const movedColumn = moveVisualTableColumn(table, 2, "left");
  assert.deepEqual(movedColumn.headers, ["A", "C", "B"]);
  assert.deepEqual(movedColumn.alignments, ["left", "right", "center"]);
  assert.deepEqual(movedColumn.rows[0], ["1", "3", "2"]);
});

test("visual table aligns the active column", () => {
  const table = parseVisualTable("| A | B |\n| --- | --- |\n| 1 | 2 |");
  assert.ok(table);

  const centered = alignVisualTableColumn(table, 1, "center");
  assert.equal(
    serializeVisualTable(centered),
    "| A | B |\n| --- | :---: |\n| 1 | 2 |",
  );
});

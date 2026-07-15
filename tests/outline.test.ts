import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCollapsibleOutlineRows,
  findOutlineItemByAnchor,
  getActiveOutlineId,
  getOutlineSelectionRange,
} from "../src/utils/outline";
import type { OutlineItem } from "../src/types";

const outline: OutlineItem[] = [
  { id: "intro", title: "Intro", level: 1, line: 1 },
  { id: "usage", title: "Usage", level: 2, line: 5 },
  { id: "api", title: "API", level: 2, line: 9 },
];

test("getActiveOutlineId returns the nearest previous heading", () => {
  assert.equal(getActiveOutlineId(outline, 0), "");
  assert.equal(getActiveOutlineId(outline, 1), "intro");
  assert.equal(getActiveOutlineId(outline, 6), "usage");
  assert.equal(getActiveOutlineId(outline, 20), "api");
});

test("getOutlineSelectionRange selects the full heading line", () => {
  const source = "# Intro\n\ntext\n\n## Usage\nbody";
  const range = getOutlineSelectionRange(source, outline[1]);

  assert.equal(source.slice(range.start, range.end), "## Usage");
});

test("findOutlineItemByAnchor resolves Typora-style heading anchors", () => {
  const items: OutlineItem[] = [
    { id: "intro", title: "Intro", level: 1, line: 1 },
    { id: "api-v2", title: "API v2", level: 2, line: 4 },
  ];

  assert.equal(findOutlineItemByAnchor(items, "#intro")?.title, "Intro");
  assert.equal(findOutlineItemByAnchor(items, "API%2Dv2")?.title, "API v2");
  assert.equal(findOutlineItemByAnchor(items, "#missing"), null);
});

test("buildCollapsibleOutlineRows hides descendants until their heading is expanded", () => {
  const items: OutlineItem[] = [
    { id: "one", title: "One", level: 1, line: 1 },
    { id: "one-a", title: "One A", level: 2, line: 2 },
    { id: "one-a-i", title: "One A I", level: 3, line: 3 },
    { id: "two", title: "Two", level: 1, line: 4 },
  ];

  const rows = buildCollapsibleOutlineRows(items, new Set(["one"]));
  assert.deepEqual(rows.map((row) => row.item.id), ["one", "two"]);
  assert.equal(rows[0].hasChildren, true);
  assert.equal(rows[0].collapsed, true);

  const expanded = buildCollapsibleOutlineRows(items, new Set());
  assert.deepEqual(expanded.map((row) => row.item.id), ["one", "one-a", "one-a-i", "two"]);
  assert.equal(expanded[1].hasChildren, true);
});

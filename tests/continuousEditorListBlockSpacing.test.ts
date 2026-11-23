import assert from "node:assert/strict";
import test from "node:test";
import { getContinuousMarkdownLinePresentations } from "../src/utils/continuousEditor";

function present(source: string) {
  return getContinuousMarkdownLinePresentations(
    source,
    source.length,
    false,
    undefined,
    false,
  );
}

test("相邻顶层列表块保留 Typora 的块间距", () => {
  const lines = present("- 一级\n * 二级\n  * 三级");

  assert.doesNotMatch(lines[0]?.className ?? "", /cm-list-block-margin-before/);
  assert.match(lines[1]?.className ?? "", /cm-list-block-margin-before/);
  assert.doesNotMatch(lines[2]?.className ?? "", /cm-list-block-margin-before/);
});

test("正文后紧邻列表时恢复列表上边距", () => {
  const lines = present("正文\n- 项目");

  assert.equal(lines[0]?.kind, "paragraph");
  assert.match(lines[1]?.className ?? "", /cm-list-block-margin-before/);
});

test("嵌套列表和标题后的列表不会叠加额外间距", () => {
  const nested = present("- 外层\n  * 内层一\n  + 内层二");
  assert.ok(nested.slice(1).every((line) => (
    !line.className.includes("cm-list-block-margin-before")
  )));

  const afterHeading = present("# 标题\n- 项目");
  assert.doesNotMatch(afterHeading[1]?.className ?? "", /cm-list-block-margin-before/);
});

test("nested unordered list to top-level ordered list keeps one compact block gap", () => {
  const lines = present([
    "- outer",
    "  - nested",
    "",
    "1. ordered",
  ].join("\n"));

  assert.equal(lines[1]?.listDepth, 1);
  assert.equal(lines[3]?.listDepth, 0);
  assert.match(lines[2]?.className ?? "", /cm-block-gap/);
  assert.doesNotMatch(lines[2]?.className ?? "", /cm-block-gap-extra/);
});

test("ordered and unordered task lists use their container kind for spacing", () => {
  const lines = present([
    "1. [ ] ordered task",
    "",
    "- [ ] unordered task",
  ].join("\n"));

  assert.equal(lines[0]?.kind, "task-list");
  assert.equal(lines[2]?.kind, "task-list");
  assert.equal(lines[0]?.listKind, "ordered-list");
  assert.equal(lines[2]?.listKind, "bullet-list");
  assert.match(lines[1]?.className ?? "", /cm-block-gap/);
});

test("a quoted blank line before a list does not stack a list margin", () => {
  const lines = present([
    "> quoted text",
    ">",
    "> - item",
  ].join("\n"));

  assert.match(lines[1]?.className ?? "", /cm-blockquote-gap/);
  assert.doesNotMatch(lines[2]?.className ?? "", /cm-list-block-margin-before/);
});

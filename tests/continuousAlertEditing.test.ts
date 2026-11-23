import assert from "node:assert/strict";
import test from "node:test";
import {
  getContinuousMarkdownLinePresentations,
  getContinuousPreviewBlocks,
} from "../src/utils/continuousEditor";

test("Alert 使用连续行语义而不是整块预览", () => {
  const source = [
    "> [!NOTE]",
    "> 正文",
    "> 第一行",
    "> 第二行",
    "> - 列表项",
    "> > 嵌套引用",
    "> [!TIP]",
    "> 第二个提示",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(
    source,
    source.length,
    false,
    undefined,
    false,
  );

  assert.deepEqual(getContinuousPreviewBlocks(source), []);
  assert.deepEqual(lines.map((line) => line.alert?.kind ?? null), [
    "note",
    "note",
    "note",
    "note",
    "note",
    "note",
    "tip",
    "tip",
  ]);
  assert.deepEqual(lines.map((line) => line.alert?.role ?? null), [
    "title",
    "body",
    "body",
    "body",
    "body",
    "body",
    "title",
    "body",
  ]);
  assert.equal(lines[0]?.alert?.first, true);
  assert.equal(lines[5]?.alert?.last, true);
  assert.equal(lines[6]?.alert?.first, true);
  assert.equal(lines[7]?.alert?.last, true);
  assert.equal(source.slice(lines[0]?.alert?.marker?.from, lines[0]?.alert?.marker?.to), "> [!NOTE]");
  assert.equal(source.slice(lines[0]?.alert?.kindRange?.from, lines[0]?.alert?.kindRange?.to), "NOTE");
  assert.equal(lines[4]?.kind, "bullet-list");
  assert.equal(lines[5]?.quoteDepth, 2);
  assert.match(lines[4]?.className ?? "", /(?:^|\s)cm-alert-note(?:\s|$)/);
  assert.match(lines[5]?.className ?? "", /(?:^|\s)cm-blockquote-depth-2(?:\s|$)/);
});

test("普通引用和未知 Alert 类型保持普通 blockquote 语义", () => {
  const source = [
    "> 普通引用",
    "",
    "> [!UNKNOWN]",
    "> 仍是普通引用",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(
    source,
    source.length,
    false,
    undefined,
    false,
  );

  assert.ok(lines.every((line) => line.alert === null));
  assert.equal(lines[0]?.kind, "blockquote");
  assert.equal(lines[2]?.kind, "blockquote");
  assert.doesNotMatch(lines[0]?.className ?? "", /(?:^|\s)cm-alert(?:\s|$)/);
});

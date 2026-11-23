import test from "node:test";
import assert from "node:assert/strict";
import { getContinuousMarkdownLinePresentations } from "../src/utils/continuousEditor";

test("连续编辑器将缩进代码行保持为代码语义并排除伪表格", () => {
  const source = [
    "    plain code",
    "    | value |",
    "    | --- |",
    "    | cell |",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(source, 0);

  assert.deepEqual(lines.map((line) => line.kind), ["code", "code", "code", "code"]);
  assert.doesNotMatch(lines[1]?.className ?? "", /cm-table/);
});

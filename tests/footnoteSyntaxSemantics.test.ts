import test from "node:test";
import assert from "node:assert/strict";
import { collectFootnoteReferenceSyntax } from "../src/utils/inlineSyntax";

test("collectFootnoteReferenceSyntax 支持嵌套内联脚注并忽略代码", () => {
  const source = "正文 ^[内层 [说明]] 和 [^note]，`^[代码]`";
  const references = collectFootnoteReferenceSyntax(source);

  assert.deepEqual(references.map((item) => [item.raw, item.inline]), [
    ["^[内层 [说明]]", true],
    ["[^note]", undefined],
  ]);
});

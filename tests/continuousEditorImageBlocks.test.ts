import assert from "node:assert/strict";
import test from "node:test";
import { getContinuousPreviewBlocks } from "../src/utils/continuousEditor";

test("连续编辑器将独占图片和链接图片识别为图片块", () => {
  const direct = "![Cover](cover.png)";
  const linked = "[![Preview](preview.png)](https://example.com)";
  const source = [direct, "", linked].join("\n");
  const blocks = getContinuousPreviewBlocks(source);

  assert.deepEqual(blocks.map((block) => block.kind), ["image", "image"]);
  assert.deepEqual(blocks.map((block) => block.source.trim()), [direct, linked]);
});

test("包含其他文字的图片链接保持为行内段落", () => {
  for (const source of [
    "前缀 ![Preview](preview.png)",
    "[文字 ![Preview](preview.png)](https://example.com)",
  ]) {
    assert.deepEqual(getContinuousPreviewBlocks(source), []);
  }
});

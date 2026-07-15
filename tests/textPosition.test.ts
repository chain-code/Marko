import test from "node:test";
import assert from "node:assert/strict";
import { getDocumentBoundaryOffset, getLineEndOffset, getLineStartOffset } from "../src/utils/textPosition";

test("getLineStartOffset resolves one-based line starts", () => {
  const source = "alpha\nbeta\r\ngamma";

  assert.equal(getLineStartOffset(source, 1), 0);
  assert.equal(getLineStartOffset(source, 2), 6);
  assert.equal(getLineStartOffset(source, 3), 12);
  assert.equal(getLineStartOffset(source, 99), source.length);
});

test("getLineEndOffset resolves line ends without newline characters", () => {
  const source = "alpha\nbeta\r\ngamma";

  assert.equal(getLineEndOffset(source, 1), 5);
  assert.equal(getLineEndOffset(source, 2), 10);
  assert.equal(getLineEndOffset(source, 3), source.length);
});

test("getDocumentBoundaryOffset resolves Typora-style document jump targets", () => {
  const source = "alpha\nbeta\r\ngamma";

  assert.equal(getDocumentBoundaryOffset(source, "start"), 0);
  assert.equal(getDocumentBoundaryOffset(source, "end"), source.length);
});

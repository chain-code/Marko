import test from "node:test";
import assert from "node:assert/strict";
import {
  isMarkdownFileLike,
  isMarkdownPathLike,
  markdownFileAccept,
  markdownFileExtensions,
} from "../src/utils/markdownFiles";

test("markdown file helpers match Typora-style markdown extensions", () => {
  for (const extension of markdownFileExtensions) {
    assert.equal(isMarkdownPathLike(`note.${extension}`), true);
    assert.equal(isMarkdownPathLike(`C:/docs/note.${extension.toUpperCase()}`), true);
    assert.equal(markdownFileAccept.includes(`.${extension}`), true);
  }

  assert.equal(isMarkdownPathLike("note.txt"), false);
  assert.equal(isMarkdownPathLike("note.md.backup"), false);
});

test("markdown file helpers accept markdown mime type without widening paths", () => {
  assert.equal(isMarkdownFileLike("untitled", "text/markdown"), true);
  assert.equal(isMarkdownFileLike("note.mkd", ""), true);
  assert.equal(isMarkdownFileLike("note.txt", "text/plain"), false);
  assert.equal(markdownFileAccept.includes("text/markdown"), true);
});

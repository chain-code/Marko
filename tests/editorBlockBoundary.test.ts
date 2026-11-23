import test from "node:test";
import assert from "node:assert/strict";
import { mergeVisibleMarkdownBlockBoundary } from "../src/utils/editorBlocks";

test("mergeVisibleMarkdownBlockBoundary merges paragraph gaps in one Backspace or Delete", () => {
  const source = "left\n\nright";

  assert.deepEqual(
    mergeVisibleMarkdownBlockBoundary({
      value: source,
      selectionStart: "left\n\n".length,
      selectionEnd: "left\n\n".length,
    }, "backward"),
    { value: "leftright", selectionStart: "left".length, selectionEnd: "left".length },
  );

  assert.deepEqual(
    mergeVisibleMarkdownBlockBoundary({
      value: source,
      selectionStart: "left".length,
      selectionEnd: "left".length,
    }, "forward"),
    { value: "leftright", selectionStart: "left".length, selectionEnd: "left".length },
  );
});

test("mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics", () => {
  const cases = [
    ["# title\n\nbody", "# titlebody"],
    ["> quote\n\nbody", "> quotebody"],
    ["- item\n\nbody", "- itembody"],
    ["- [ ] task\n\nbody", "- [ ] taskbody"],
  ] as const;

  for (const [source, expected] of cases) {
    const paragraphStart = source.indexOf("body");
    const leftEnd = source.indexOf("\n");
    assert.equal(
      mergeVisibleMarkdownBlockBoundary({
        value: source,
        selectionStart: paragraphStart,
        selectionEnd: paragraphStart,
      }, "backward")?.value,
      expected,
    );
    assert.equal(
      mergeVisibleMarkdownBlockBoundary({
        value: source,
        selectionStart: leftEnd,
        selectionEnd: leftEnd,
      }, "forward")?.value,
      expected,
    );
  }
});

test("mergeVisibleMarkdownBlockBoundary appends body text before a Setext underline", () => {
  for (const marker of ["---", "==="]) {
    const source = `Title\n${marker}\n\nbody`;
    const bodyStart = source.indexOf("body");

    assert.deepEqual(
      mergeVisibleMarkdownBlockBoundary({
        value: source,
        selectionStart: bodyStart,
        selectionEnd: bodyStart,
      }, "backward"),
      {
        value: `Titlebody\n${marker}`,
        selectionStart: "Title".length,
        selectionEnd: "Title".length,
      },
    );
  }
});

test("mergeVisibleMarkdownBlockBoundary removes every invisible blank line and preserves CRLF elsewhere", () => {
  const source = "left  \r\n \r\n\t\r\nright\r\nafter";
  const rightStart = source.indexOf("right");
  const result = mergeVisibleMarkdownBlockBoundary({
    value: source,
    selectionStart: rightStart,
    selectionEnd: rightStart,
  }, "backward");

  assert.deepEqual(result, {
    value: "leftright\r\nafter",
    selectionStart: "left".length,
    selectionEnd: "left".length,
  });
});

test("mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete", () => {
  const cases = [
    ["left\n\n# title", "lefttitle"],
    ["left\n\n> quote", "leftquote"],
    ["left\n\n- item", "leftitem"],
    ["left\n\n3. item", "leftitem"],
    ["left\n\n- [x] task", "lefttask"],
    ["left\n\n- first\n- second", "leftfirst\n- second"],
  ] as const;

  for (const [source, expected] of cases) {
    assert.deepEqual(
      mergeVisibleMarkdownBlockBoundary({
        value: source,
        selectionStart: "left".length,
        selectionEnd: "left".length,
      }, "forward"),
      { value: expected, selectionStart: "left".length, selectionEnd: "left".length },
    );
  }

  for (const source of [
    "left\n\n```text\ncode\n```",
    "left\n\n$$\nx\n$$",
    "left\n\n<div>raw</div>",
    "left\n\n| A |\n| --- |",
  ]) {
    assert.equal(mergeVisibleMarkdownBlockBoundary({
      value: source,
      selectionStart: "left".length,
      selectionEnd: "left".length,
    }, "forward"), null);
  }
});

test("mergeVisibleMarkdownBlockBoundary does not cross code fences or loose-list internals", () => {
  const code = "```text\ncode\n```\n\nbody";
  const bodyStart = code.indexOf("body");
  assert.equal(
    mergeVisibleMarkdownBlockBoundary({
      value: code,
      selectionStart: bodyStart,
      selectionEnd: bodyStart,
    }, "backward"),
    null,
  );

  const looseList = "- first\n\n  continued\n\n- second";
  const continuationStart = looseList.indexOf("  continued");
  assert.equal(
    mergeVisibleMarkdownBlockBoundary({
      value: looseList,
      selectionStart: continuationStart,
      selectionEnd: continuationStart,
    }, "backward"),
    null,
  );
});

test("mergeVisibleMarkdownBlockBoundary ignores selections and non-boundary cursors", () => {
  assert.equal(
    mergeVisibleMarkdownBlockBoundary({
      value: "left\n\nright",
      selectionStart: 0,
      selectionEnd: 4,
    }, "forward"),
    null,
  );
  assert.equal(
    mergeVisibleMarkdownBlockBoundary({
      value: "left\nright",
      selectionStart: "left".length,
      selectionEnd: "left".length,
    }, "forward"),
    null,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  collectAtomicMarkdownBlocks,
  deleteSelectedAtomicMarkdownBlock,
  findAdjacentAtomicMarkdownBlock,
  findAtomicMarkdownBlockAt,
  handleBackspaceAfterHorizontalRule,
  type AtomicMarkdownBlockRange,
} from "../src/utils/atomicBlockEditing";

function requireAtomic(
  block: AtomicMarkdownBlockRange | null,
): AtomicMarkdownBlockRange {
  assert.ok(block);
  return block;
}

test("collectAtomicMarkdownBlocks recognizes standalone rules and TOC lines", () => {
  const source = [
    "Before",
    "",
    "---",
    "",
    "* * *",
    "",
    " _ _ _   ",
    "",
    "[TOC]",
    "",
    "  [toc]  ",
  ].join("\n");
  const blocks = collectAtomicMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.kind), [
    "horizontal-rule",
    "horizontal-rule",
    "horizontal-rule",
    "toc",
    "toc",
  ]);
  assert.deepEqual(blocks.map((block) => source.slice(block.contentFrom, block.contentTo)), [
    "---",
    "* * *",
    " _ _ _   ",
    "[TOC]",
    "  [toc]  ",
  ]);
  assert.equal(source.slice(blocks[0].from, blocks[0].to), "---\n");
  assert.equal(blocks.at(-1)?.lineBreak, "");
});

test("每种 TOC 标记都支持原子查找、相邻导航和整块删除", () => {
  for (const marker of ["{:toc}", "[[_TOC_]]", "{: toc depth=3 }"]) {
    const source = `Before\n${marker}\nAfter`;
    const block = requireAtomic(findAtomicMarkdownBlockAt(source, source.indexOf(marker) + 1));
    assert.equal(block.kind, "toc", marker);
    assert.equal(findAdjacentAtomicMarkdownBlock(source, "Before".length, "forward")?.from, block.from);
    assert.equal(findAdjacentAtomicMarkdownBlock(source, source.indexOf("After"), "backward")?.from, block.from);

    const result = deleteSelectedAtomicMarkdownBlock({
      value: source,
      selectionStart: block.contentFrom,
      selectionEnd: block.contentTo,
    });
    assert.deepEqual(result, {
      value: "Before\n\nAfter",
      selectionStart: block.contentFrom,
      selectionEnd: block.contentFrom,
    }, marker);
  }
});

test("atomic block ranges preserve CRLF and expose content separately from the whole line", () => {
  const source = "Before\r\n\r\n* * *\r\n\r\nAfter";
  const block = requireAtomic(findAtomicMarkdownBlockAt(source, source.indexOf("* * *") + 2));

  assert.equal(block.kind, "horizontal-rule");
  assert.equal(source.slice(block.contentFrom, block.contentTo), "* * *");
  assert.equal(source.slice(block.from, block.to), "* * *\r\n");
  assert.equal(block.lineBreak, "\r\n");
});

test("atomic block recognition excludes Setext headings and literal blocks", () => {
  const source = [
    "---",
    "title: Document",
    "---",
    "",
    "Title",
    "---",
    "",
    "```md",
    "---",
    "[TOC]",
    "{:toc}",
    "[[_TOC_]]",
    "```",
    "",
    "$$",
    "---",
    "[TOC]",
    "$$",
    "",
    "<div>",
    "---",
    "[TOC]",
    "</div>",
    "",
    "[TOC]",
  ].join("\n");
  const blocks = collectAtomicMarkdownBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "toc");
  assert.equal(blocks[0]?.contentFrom, source.lastIndexOf("[TOC]"));
});

test("atomic block recognition rejects inline, indented-code and malformed forms", () => {
  const source = [
    "Text [TOC]",
    "    [TOC]",
    "--",
    "- * -",
    "+++",
    "+ + +",
    "    ---",
    "[TOC] trailing",
  ].join("\n");

  assert.deepEqual(collectAtomicMarkdownBlocks(source), []);
});

test("plus-only paragraph and list syntax never become atomic horizontal rules", () => {
  for (const marker of ["+++", "+ + +"]) {
    const source = "Before\n\n" + marker + "\n\nAfter";
    const markerStart = source.indexOf(marker);
    const cursor = source.indexOf("After");

    assert.equal(findAtomicMarkdownBlockAt(source, markerStart + 1), null, marker);
    assert.equal(handleBackspaceAfterHorizontalRule({
      value: source,
      selectionStart: cursor,
      selectionEnd: cursor,
    }), null, marker);
  }
});

test("findAtomicMarkdownBlockAt does not assign the following line start to the previous atom", () => {
  const source = "---\nAfter";
  const rule = requireAtomic(findAtomicMarkdownBlockAt(source, 2));

  assert.equal(rule.kind, "horizontal-rule");
  assert.equal(findAtomicMarkdownBlockAt(source, rule.contentTo)?.kind, "horizontal-rule");
  assert.equal(findAtomicMarkdownBlockAt(source, rule.to), null);
  assert.equal(findAtomicMarkdownBlockAt(source, -1), null);
  assert.equal(findAtomicMarkdownBlockAt(source, source.length + 1), null);
});

test("findAdjacentAtomicMarkdownBlock crosses only Markdown whitespace", () => {
  const source = "Before\n\n---\n\nAfter";
  const beforeEnd = "Before".length;
  const afterStart = source.indexOf("After");

  assert.equal(findAdjacentAtomicMarkdownBlock(source, beforeEnd, "forward")?.kind, "horizontal-rule");
  assert.equal(findAdjacentAtomicMarkdownBlock(source, afterStart, "backward")?.kind, "horizontal-rule");
  assert.equal(findAdjacentAtomicMarkdownBlock(source, 0, "backward"), null);
  assert.equal(findAdjacentAtomicMarkdownBlock(source, source.length, "forward"), null);

  const interrupted = "---\nmiddle\n\nAfter";
  assert.equal(
    findAdjacentAtomicMarkdownBlock(interrupted, interrupted.indexOf("After"), "backward"),
    null,
  );
});

test("deleteSelectedAtomicMarkdownBlock clears only the selected atom content", () => {
  for (const marker of ["---", "[TOC]"]) {
    const source = `Before\n\n${marker}\n\nAfter`;
    const block = requireAtomic(findAtomicMarkdownBlockAt(source, source.indexOf(marker)));
    const result = deleteSelectedAtomicMarkdownBlock({
      value: source,
      selectionStart: block.contentFrom,
      selectionEnd: block.contentTo,
    });

    assert.deepEqual(result, {
      value: "Before\n\n\n\nAfter",
      selectionStart: block.contentFrom,
      selectionEnd: block.contentFrom,
    });
  }
});

test("deleteSelectedAtomicMarkdownBlock accepts the whole line range and reversed selections", () => {
  const source = "Before\r\n\r\n[TOC]\r\n\r\nAfter";
  const block = requireAtomic(findAtomicMarkdownBlockAt(source, source.indexOf("[TOC]")));
  const result = deleteSelectedAtomicMarkdownBlock({
    value: source,
    selectionStart: block.to,
    selectionEnd: block.from,
  });

  assert.equal(result?.value, "Before\r\n\r\n\r\n\r\nAfter");
  assert.equal(result?.selectionStart, block.from);
  assert.equal(result?.selectionEnd, block.from);
});

test("deleteSelectedAtomicMarkdownBlock leaves partial and ordinary selections alone", () => {
  assert.equal(deleteSelectedAtomicMarkdownBlock({
    value: "---",
    selectionStart: 0,
    selectionEnd: 2,
  }), null);
  assert.equal(deleteSelectedAtomicMarkdownBlock({
    value: "ordinary",
    selectionStart: 0,
    selectionEnd: "ordinary".length,
  }), null);
});

test("Backspace after a horizontal rule removes it and keeps one block interval", () => {
  for (const source of [
    "Before\n\n---\n\nAfter",
    "Before\n* * *\nAfter",
    "Before\n\n\n---\n\n\nAfter",
  ]) {
    const cursor = source.indexOf("After");
    const result = handleBackspaceAfterHorizontalRule({
      value: source,
      selectionStart: cursor,
      selectionEnd: cursor,
    });

    assert.deepEqual(result, {
      value: "Before\n\nAfter",
      selectionStart: "Before\n\n".length,
      selectionEnd: "Before\n\n".length,
    });
  }
});

test("Backspace after a leading horizontal rule removes leading blank lines", () => {
  for (const source of ["---\nAfter", "* * *\nAfter", "---\n\n\nAfter", "\n\n---\n\nAfter"]) {
    const cursor = source.indexOf("After");
    const result = handleBackspaceAfterHorizontalRule({
      value: source,
      selectionStart: cursor,
      selectionEnd: cursor,
    });

    assert.deepEqual(result, {
      value: "After",
      selectionStart: 0,
      selectionEnd: 0,
    });
  }
});

test("Backspace after a horizontal rule preserves CRLF", () => {
  const source = "Before\r\n\r\n* * *\r\n\r\nAfter";
  const cursor = source.indexOf("After");
  const result = handleBackspaceAfterHorizontalRule({
    value: source,
    selectionStart: cursor,
    selectionEnd: cursor,
  });

  assert.deepEqual(result, {
    value: "Before\r\n\r\nAfter",
    selectionStart: "Before\r\n\r\n".length,
    selectionEnd: "Before\r\n\r\n".length,
  });
  assert.doesNotMatch(result?.value ?? "", /(^|[^\r])\n/);
});

test("Backspace atomic handling stays limited to the confirmed horizontal-rule case", () => {
  const toc = "Before\n\n[TOC]\n\nAfter";
  const setext = "Title\n---\n\nAfter";
  const heading = "Before\n\n---\n\n# After";
  const list = "Before\n\n---\n\n- After";

  for (const source of [toc, setext, heading, list]) {
    const cursor = source.indexOf("After");
    assert.equal(handleBackspaceAfterHorizontalRule({
      value: source,
      selectionStart: cursor,
      selectionEnd: cursor,
    }), null);
  }
});

test("Backspace atomic handling requires a collapsed selection at the paragraph start", () => {
  const source = "Before\n\n---\n\nAfter";
  const cursor = source.indexOf("After");

  assert.equal(handleBackspaceAfterHorizontalRule({
    value: source,
    selectionStart: cursor + 1,
    selectionEnd: cursor + 1,
  }), null);
  assert.equal(handleBackspaceAfterHorizontalRule({
    value: source,
    selectionStart: cursor,
    selectionEnd: cursor + 1,
  }), null);
});

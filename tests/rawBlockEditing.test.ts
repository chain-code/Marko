import test from "node:test";
import assert from "node:assert/strict";
import {
  escapeRawBlockContentAsPre,
  getRawBlockSelection,
  handleRawBlockBoundaryDelete,
  handleRawBlockEnter,
  type RawBlockSelection,
  type RawBlockTextState,
} from "../src/utils/rawBlockEditing";

test("escapeRawBlockContentAsPre creates safe clipboard HTML without changing plain content", () => {
  assert.equal(
    escapeRawBlockContentAsPre(`<tag title="'">A & B</tag>`),
    "<pre>&lt;tag title=&quot;&#39;&quot;&gt;A &amp; B&lt;/tag&gt;</pre>",
  );
});

function selection(
  value: string,
  selectionStart: number,
  selectionEnd = selectionStart,
  selectionHead = selectionEnd,
): RawBlockTextState {
  return { value, selectionStart, selectionEnd, selectionHead };
}

function requireRaw(state: RawBlockTextState): RawBlockSelection {
  const raw = getRawBlockSelection(state);
  assert.ok(raw);
  return raw;
}

test("getRawBlockSelection identifies fenced code content and syntax separately", () => {
  const source = "before\n\n```ts\nalpha\nbeta\n```\n\nafter";
  const start = source.indexOf("alpha");
  const end = source.indexOf("beta") + "beta".length;
  const raw = requireRaw(selection(source, start, end));

  assert.equal(raw.kind, "code");
  assert.equal(raw.content, "alpha\nbeta");
  assert.equal(raw.sourceContent, "alpha\nbeta");
  assert.equal(raw.contentLineCount, 2);
  assert.equal(raw.empty, false);
  assert.equal(raw.closed, true);
  assert.equal(raw.insideContent, true);
  assert.equal(raw.lineBreak, "\n");

  const syntax = requireRaw(selection(source, source.indexOf("```ts") + 1));
  assert.equal(syntax.kind, "code");
  assert.equal(syntax.insideContent, false);
  assert.equal(getRawBlockSelection(selection(source, 0, end)), null);
});

test("getRawBlockSelection preserves CRLF math ranges and selection head", () => {
  const source = "$$\r\nalpha\r\n$$";
  const start = source.indexOf("alpha");
  const end = start + "alpha".length;
  const raw = requireRaw(selection(source, start, end, start));

  assert.equal(raw.kind, "math");
  assert.equal(raw.lineBreak, "\r\n");
  assert.equal(raw.content, "alpha");
  assert.equal(raw.selectionHead, start);
  assert.equal(raw.contentStart, start);
  assert.equal(raw.contentEnd, end);
});

test("getRawBlockSelection identifies closed and unclosed HTML blocks", () => {
  const closedSource = "<div>\ntext\n</div>";
  const closed = requireRaw(selection(closedSource, closedSource.indexOf("text")));
  assert.equal(closed.kind, "html");
  assert.equal(closed.closed, true);
  assert.equal(closed.insideContent, true);

  const unclosedSource = "<div>\ntext";
  const unclosed = requireRaw(selection(unclosedSource, unclosedSource.length));
  assert.equal(unclosed.kind, "html");
  assert.equal(unclosed.closed, false);

  const comment = "<!-- open";
  assert.equal(requireRaw(selection(comment, comment.length)).closed, false);
  const closedComment = "<!-- closed -->";
  assert.equal(requireRaw(selection(closedComment, closedComment.length)).closed, true);
});

test("raw HTML content keeps literal quote and list markers", () => {
  const plain = "<div>\n> literal\n* item\n</div>";
  const plainRaw = requireRaw(selection(plain, plain.indexOf("literal")));
  assert.equal(plainRaw.kind, "html");
  assert.equal(plainRaw.content, plain);
  assert.equal(plainRaw.sourceContent, plain);
  assert.equal(plainRaw.closed, true);

  const quoted = "> <div>\r\n> > literal\r\n> * item\r\n> </div>";
  const quotedRaw = requireRaw(selection(quoted, quoted.indexOf("literal")));
  assert.equal(quotedRaw.kind, "html");
  assert.equal(quotedRaw.content, "<div>\r\n> literal\r\n* item\r\n</div>");
  assert.equal(quotedRaw.sourceContent, quoted);
  assert.equal(quotedRaw.closed, true);
});
test("getRawBlockSelection recognizes quoted raw fences", () => {
  const source = "> ```js\n> code\n> ```";
  const cursor = source.indexOf("code");
  const raw = requireRaw(selection(source, cursor));

  assert.equal(raw.kind, "code");
  assert.equal(raw.content, "code");
  assert.equal(raw.sourceContent, "> code");
  assert.equal(raw.insideContent, true);
});

test("handleRawBlockEnter exits closed code at its content end", () => {
  const source = "```js\nconst value = 1;\n```";
  const cursor = source.indexOf("\n```");
  const result = handleRawBlockEnter(selection(source, cursor), { ctrlKey: true });

  assert.deepEqual(result, {
    value: `${source}\n\n`,
    selectionStart: source.length + 2,
    selectionEnd: source.length + 2,
    selectionHead: source.length + 2,
    kind: "code",
    action: "exit",
  });
});

test("handleRawBlockEnter moves to existing content after a code block", () => {
  const source = "```js\ncode\n```\n\nafter";
  const cursor = source.indexOf("\n```");
  const result = handleRawBlockEnter(selection(source, cursor), { metaKey: true });

  assert.equal(result?.value, source);
  assert.equal(result?.selectionStart, source.indexOf("after"));
  assert.equal(result?.selectionEnd, source.indexOf("after"));
  assert.equal(result?.action, "exit");
});

test("handleRawBlockEnter keeps ordinary code Enter inside and requires no selection to exit", () => {
  const source = "```js\ncode\n```";
  const start = source.indexOf("code");
  const end = start + "code".length;

  assert.equal(handleRawBlockEnter(selection(source, end), {}), null);
  assert.equal(handleRawBlockEnter(selection(source, end), { shiftKey: true }), null);
  assert.equal(handleRawBlockEnter(selection(source, start, end), { ctrlKey: true }), null);
  const modifiedShift = handleRawBlockEnter(
    selection(source, end),
    { ctrlKey: true, shiftKey: true },
  );
  assert.equal(modifiedShift?.action, "exit");
});

test("handleRawBlockEnter closes an unclosed code fence before exiting", () => {
  const source = "```js\ncode";
  const result = handleRawBlockEnter(selection(source, source.length), { ctrlKey: true });

  assert.equal(result?.value, "```js\ncode\n```\n\n");
  assert.equal(result?.selectionStart, "```js\ncode\n```\n\n".length);
  assert.equal(result?.action, "exit");
});

test("handleRawBlockEnter follows math selection and Shift precedence", () => {
  const source = "$$\r\nalpha\r\n$$";
  const start = source.indexOf("alpha");
  const end = start + "alpha".length;
  const result = handleRawBlockEnter(selection(source, start, end, end), { ctrlKey: true });

  assert.equal(result?.value, `${source}\r\n\r\n`);
  assert.equal(result?.selectionStart, source.length + 4);
  assert.equal(result?.kind, "math");
  assert.equal(handleRawBlockEnter(selection(source, end), { ctrlKey: true, shiftKey: true }), null);
  assert.equal(handleRawBlockEnter(selection(source, start, end, start), { ctrlKey: true }), null);
});

test("handleRawBlockEnter exits closed HTML on ordinary Enter", () => {
  const source = "<div>\ntext\n</div>";
  const result = handleRawBlockEnter(selection(source, source.length));

  assert.equal(result?.value, `${source}\n\n`);
  assert.equal(result?.selectionStart, source.length + 2);
  assert.equal(result?.kind, "html");
  assert.equal(result?.action, "exit");
});

test("handleRawBlockEnter keeps unclosed or Shift-entered HTML inside", () => {
  const unclosed = "<div>\ntext";
  const closed = "<div>\ntext\n</div>";

  assert.equal(handleRawBlockEnter(selection(unclosed, unclosed.length)), null);
  assert.equal(handleRawBlockEnter(selection(closed, closed.length), { shiftKey: true }), null);

  const forced = handleRawBlockEnter(selection(unclosed, unclosed.length), { ctrlKey: true });
  assert.equal(forced?.value, `${unclosed}\n\n`);
  assert.equal(forced?.selectionStart, unclosed.length + 2);

  const modifiedShift = handleRawBlockEnter(
    selection(closed, closed.length),
    { ctrlKey: true, shiftKey: true },
  );
  assert.equal(modifiedShift?.action, "exit");
});

test("handleRawBlockEnter follows HTML selection-head semantics", () => {
  const source = "<div>text</div>";
  const start = source.indexOf("text");
  const atEnd = handleRawBlockEnter(selection(source, start, source.length, source.length));
  assert.equal(atEnd?.action, "exit");
  assert.equal(atEnd?.value, `${source}\n\n`);

  const reversed = handleRawBlockEnter(selection(source, start, source.length, start));
  assert.equal(reversed, null);
});

test("handleRawBlockBoundaryDelete removes an exactly empty code block", () => {
  const source = "```\n\n```";
  const cursor = source.indexOf("\n") + 1;

  for (const direction of ["backward", "forward"] as const) {
    assert.deepEqual(handleRawBlockBoundaryDelete(selection(source, cursor), direction), {
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
      selectionHead: 0,
      kind: "code",
      action: "delete",
    });
  }
});

test("handleRawBlockBoundaryDelete unwraps one-line code on leading Backspace", () => {
  const source = "before\n\n```js\nalpha\n```\n\nafter";
  const cursor = source.indexOf("alpha");
  const result = handleRawBlockBoundaryDelete(selection(source, cursor), "backward");

  assert.deepEqual(result, {
    value: "before\n\nalpha\n\nafter",
    selectionStart: "before\n\n".length,
    selectionEnd: "before\n\n".length,
    selectionHead: "before\n\n".length,
    kind: "code",
    action: "unwrap",
  });
});

test("handleRawBlockBoundaryDelete preserves CRLF while unwrapping code", () => {
  const source = "```js\r\nalpha\r\n```\r\n\r\nafter";
  const cursor = source.indexOf("alpha");
  const result = handleRawBlockBoundaryDelete(selection(source, cursor), "backward");

  assert.equal(result?.value, "alpha\r\n\r\nafter");
  assert.equal(result?.action, "unwrap");
  assert.doesNotMatch(result?.value ?? "", /(^|[^\r])\n/);
});

test("handleRawBlockBoundaryDelete keeps quoted code inside its quote when unwrapping", () => {
  const source = "> ```js\n> code\n> ```";
  const cursor = source.indexOf("code");
  const result = handleRawBlockBoundaryDelete(selection(source, cursor), "backward");

  assert.equal(result?.value, "> code");
  assert.equal(result?.selectionStart, 2);
  assert.equal(result?.action, "unwrap");
});

test("handleRawBlockBoundaryDelete consumes multi-line code boundaries", () => {
  const source = "```js\nalpha\nbeta\n```";
  const start = source.indexOf("alpha");
  const end = source.indexOf("\n```");

  const backspace = handleRawBlockBoundaryDelete(selection(source, start), "backward");
  assert.equal(backspace?.value, source);
  assert.equal(backspace?.action, "consume");

  const deletion = handleRawBlockBoundaryDelete(selection(source, end), "forward");
  assert.equal(deletion?.value, source);
  assert.equal(deletion?.action, "consume");
});

test("handleRawBlockBoundaryDelete deletes empty math and protects non-empty math", () => {
  const empty = "$$\n\n$$";
  const emptyCursor = empty.indexOf("\n") + 1;
  assert.equal(
    handleRawBlockBoundaryDelete(selection(empty, emptyCursor), "backward")?.action,
    "delete",
  );
  assert.equal(
    handleRawBlockBoundaryDelete(selection(empty, emptyCursor), "forward")?.value,
    "",
  );

  const source = "$$\nalpha\n$$";
  const start = source.indexOf("alpha");
  const end = source.indexOf("\n$$");
  assert.equal(
    handleRawBlockBoundaryDelete(selection(source, start), "backward")?.action,
    "consume",
  );
  assert.equal(
    handleRawBlockBoundaryDelete(selection(source, end), "forward")?.value,
    source,
  );
});

test("handleRawBlockBoundaryDelete conservatively protects HTML boundaries", () => {
  for (const source of ["<div>text</div>", "<div>\ntext\n</div>"]) {
    const start = requireRaw(selection(source, 0)).contentStart;
    const end = requireRaw(selection(source, source.length)).contentEnd;
    const backspace = handleRawBlockBoundaryDelete(selection(source, start), "backward");
    const deletion = handleRawBlockBoundaryDelete(selection(source, end), "forward");

    assert.equal(backspace?.value, source);
    assert.equal(backspace?.action, "consume");
    assert.equal(deletion?.value, source);
    assert.equal(deletion?.action, "consume");
  }
});

test("handleRawBlockBoundaryDelete leaves selections and interior edits to CodeMirror", () => {
  const source = "```js\nalpha\n```";
  const start = source.indexOf("alpha");
  const end = start + "alpha".length;

  assert.equal(handleRawBlockBoundaryDelete(selection(source, start, end), "backward"), null);
  assert.equal(handleRawBlockBoundaryDelete(selection(source, start + 1), "backward"), null);
  assert.equal(handleRawBlockBoundaryDelete(selection(source, end - 1), "forward"), null);
});

test("raw code fences only close when the marker has no trailing content", () => {
  const source = "~~~js\nalpha\n~~~oops\nbeta\n~~~";
  const cursor = source.indexOf("beta") + "beta".length;
  const raw = requireRaw(selection(source, cursor));

  assert.equal(raw.content, "alpha\n~~~oops\nbeta");
  assert.equal(raw.closed, true);
  assert.equal(raw.insideContent, true);
  assert.equal(handleRawBlockEnter(selection(source, cursor), {}), null);
});

test("tagged dollar math keeps raw block Enter and boundary deletion semantics", () => {
  const source = "$$ {chapter 1}\r\nalpha\r\n$$ {chapter end}";
  const start = source.indexOf("alpha");
  const end = start + "alpha".length;
  const raw = requireRaw(selection(source, start, end));

  assert.equal(raw.kind, "math");
  assert.equal(raw.content, "alpha");
  assert.equal(raw.lineBreak, "\r\n");
  assert.equal(
    handleRawBlockBoundaryDelete(selection(source, start), "backward")?.action,
    "consume",
  );

  const unclosed = "$$ {{tag}}\r\nalpha";
  const exited = handleRawBlockEnter(selection(unclosed, unclosed.length), { ctrlKey: true });
  assert.equal(exited?.value, "$$ {{tag}}\r\nalpha\r\n$$\r\n\r\n");
  assert.equal(exited?.action, "exit");

  const empty = "$$ {tag}\n\n$$ {end}";
  const emptyCursor = empty.indexOf("\n") + 1;
  assert.equal(handleRawBlockBoundaryDelete(selection(empty, emptyCursor), "forward")?.value, "");
});

test("raw block editing rejects invalid tagged dollar math openings", () => {
  for (const opening of ["$$ {}", "$$ {tag", "$$ {tag} ", "$$ {tag} trailing"]) {
    const source = `${opening}\nalpha`;
    assert.equal(getRawBlockSelection(selection(source, source.length)), null, opening);
  }
});

test("list-contained code unwrap keeps every container marker and literal greater-than", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const cases = [
    {
      source: [
        "10. " + fence + "js",
        "    x",
        "    " + fence + String.fromCharCode(96),
      ].join("\n"),
      content: "x",
      expected: "10. x",
      unwrapped: "10. x",
      lineBreak: "\n",
    },
    {
      source: ["- " + fence + "ts", "  x", "  " + fence].join("\r\n"),
      content: "x",
      expected: "- x",
      unwrapped: "- x",
      lineBreak: "\r\n",
    },
    {
      source: ["- outer", "  - " + fence + "js", "    x", "    " + fence].join("\n"),
      content: "x",
      expected: ["- outer", "  - x"].join("\n"),
      unwrapped: "  - x",
      lineBreak: "\n",
    },
    {
      source: ["> 10. " + fence + "js", ">     > literal", ">     " + fence].join("\r\n"),
      content: "> literal",
      expected: "> 10. > literal",
      unwrapped: "> 10. > literal",
      lineBreak: "\r\n",
    },
    {
      source: ["- " + fence + "js", "  > literal", "  " + fence].join("\n"),
      content: "> literal",
      expected: "- > literal",
      unwrapped: "- > literal",
      lineBreak: "\n",
    },
  ] as const;

  for (const entry of cases) {
    const cursor = entry.source.indexOf(entry.content);
    const raw = requireRaw(selection(entry.source, cursor));
    assert.equal(raw.contentStart, cursor, entry.source);
    assert.equal(raw.content, entry.content, entry.source);
    assert.equal(raw.unwrappedContent, entry.unwrapped, entry.source);
    assert.equal(raw.lineBreak, entry.lineBreak, entry.source);

    const result = handleRawBlockBoundaryDelete(
      selection(entry.source, cursor),
      "backward",
    );
    assert.equal(result?.value, entry.expected, entry.source);
    assert.equal(result?.selectionStart, entry.expected.indexOf(entry.content), entry.source);
    assert.equal(result?.action, "unwrap", entry.source);
  }
});

test("code fences in existing list continuations unwrap without consuming the parent item", () => {
  const fence = String.fromCharCode(96).repeat(3);
  for (const lineBreak of ["\n", "\r\n"] as const) {
    const source = [
      "10. intro",
      "",
      "    " + fence + "js",
      "    x",
      "    " + fence,
    ].join(lineBreak);
    const cursor = source.indexOf("x");
    const expected = ["10. intro", "", "    x"].join(lineBreak);
    const raw = requireRaw(selection(source, cursor));

    assert.equal(raw.blockStart, source.indexOf("    " + fence));
    assert.equal(raw.content, "x");
    assert.equal(raw.contentStart, cursor);
    assert.equal(raw.lineBreak, lineBreak);

    const result = handleRawBlockBoundaryDelete(selection(source, cursor), "backward");
    assert.equal(result?.value, expected);
    assert.equal(result?.selectionStart, expected.indexOf("x"));
    assert.equal(result?.action, "unwrap");
  }
});

test("container-only indentation is empty for code and both math fence forms", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const cases = [
    {
      source: ["* " + fence, "  ", "  " + fence].join("\n"),
      blankLine: "  ",
      lineBreak: "\n",
      expected: "",
      kind: "code",
    },
    {
      source: ["- $$", "  ", "  $$"].join("\n"),
      blankLine: "  ",
      lineBreak: "\n",
      expected: "",
      kind: "math",
    },
    {
      source: ["10. \\[", "    ", "    \\]"].join("\r\n"),
      blankLine: "    ",
      lineBreak: "\r\n",
      expected: "",
      kind: "math",
    },
    {
      source: ["> - outer", ">   - $$", ">     ", ">     $$"].join("\r\n"),
      blankLine: ">     ",
      lineBreak: "\r\n",
      expected: "> - outer\r\n",
      kind: "math",
    },
  ] as const;

  for (const entry of cases) {
    const cursor = entry.source.indexOf(
      entry.lineBreak + entry.blankLine + entry.lineBreak,
    ) + entry.lineBreak.length + entry.blankLine.length;
    const raw = requireRaw(selection(entry.source, cursor));
    assert.equal(raw.kind, entry.kind, entry.source);
    assert.equal(raw.content, "", entry.source);
    assert.equal(raw.empty, true, entry.source);
    assert.equal(raw.contentStart, cursor, entry.source);
    assert.equal(raw.contentEnd, cursor, entry.source);

    for (const direction of ["backward", "forward"] as const) {
      const result = handleRawBlockBoundaryDelete(
        selection(entry.source, cursor),
        direction,
      );
      assert.equal(result?.value, entry.expected, entry.source);
      assert.equal(result?.action, "delete", entry.source);
    }
  }
});

test("non-empty list math remains protected at both content boundaries", () => {
  const cases = [
    ["- $$\n  x\n  $$", "x"],
    ["> 10. \\[\r\n>     > literal\r\n>     \\]", "> literal"],
  ] as const;

  for (const [source, content] of cases) {
    const start = source.indexOf(content);
    const raw = requireRaw(selection(source, start));
    assert.equal(raw.content, content, source);
    assert.equal(raw.empty, false, source);

    const backward = handleRawBlockBoundaryDelete(selection(source, start), "backward");
    const forward = handleRawBlockBoundaryDelete(
      selection(source, raw.contentEnd),
      "forward",
    );
    assert.equal(backward?.value, source);
    assert.equal(backward?.action, "consume");
    assert.equal(forward?.value, source);
    assert.equal(forward?.action, "consume");
  }
});

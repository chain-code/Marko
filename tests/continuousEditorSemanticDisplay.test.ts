import test from "node:test";
import assert from "node:assert/strict";
import {
  getContinuousAtxHeadingContentRange,
  getContinuousMarkdownLinePresentations,
} from "../src/utils/continuousEditor";

test("continuous editor keeps plus-only paragraph and recursive-list semantics", () => {
  const paragraph = getContinuousMarkdownLinePresentations("+++\nBody", 4, false, undefined, false);
  assert.equal(paragraph[0]?.kind, "paragraph");
  assert.equal(paragraph[0]?.hiddenMarker, null);

  const list = getContinuousMarkdownLinePresentations("+ + +\nBody", 6, false, undefined, false);
  assert.equal(list[0]?.kind, "bullet-list");
  assert.equal(list[0]?.listDepth, 2);
  assert.equal(list[0]?.bulletDepth, 2);
  assert.equal(list[0]?.hiddenMarker, null);
  assert.doesNotMatch(list[0]?.className ?? "", /cm-horizontal-rule/);
});

test("连续编辑器将 Setext 标题文本与下划线映射为同一标题视觉", () => {
  const source = [
    "一级标题",
    "===",
    "",
    "二级标题",
    "---",
    "",
    "正文",
    "",
    "***",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.equal(lines[0]?.kind, "heading");
  assert.equal(lines[0]?.level, 1);
  assert.match(lines[0]?.className ?? "", /cm-heading-1/);
  assert.equal(lines[1]?.kind, "setext-marker");
  assert.deepEqual(lines[1]?.hiddenMarker, { from: 5, to: 8 });
  assert.match(lines[2]?.className ?? "", /cm-heading-gap/);

  assert.equal(lines[3]?.kind, "heading");
  assert.equal(lines[3]?.level, 2);
  assert.match(lines[3]?.className ?? "", /cm-heading-2/);
  assert.equal(lines[4]?.kind, "setext-marker");
  assert.match(lines[5]?.className ?? "", /cm-heading-gap/);

  assert.equal(lines[8]?.kind, "horizontal-rule");
  assert.deepEqual(lines[8]?.hiddenMarker, { from: source.lastIndexOf("***"), to: source.length });
});

test("连续编辑器识别 CommonMark 水平线并在光标进入时恢复源码", () => {
  const markers = ["---", "----", "* * *", "_ _ _", "   ***"];

  for (const marker of markers) {
    const source = marker + "\n正文";
    const inactive = getContinuousMarkdownLinePresentations(
      source,
      source.length,
      false,
      undefined,
      false,
    );
    assert.equal(inactive[0]?.kind, "horizontal-rule", marker);
    assert.deepEqual(inactive[0]?.hiddenMarker, { from: 0, to: marker.length }, marker);

    const active = getContinuousMarkdownLinePresentations(source, Math.min(1, marker.length - 1));
    assert.equal(active[0]?.kind, "horizontal-rule", marker);
    assert.match(active[0]?.className ?? "", /cm-active-markdown-line/, marker);
    assert.equal(active[0]?.hiddenMarker, null, marker);
  }
});

test("列表项内的分隔线保留列表语义并单独标记内容范围", () => {
  const cases = [
    { source: "1. ---\n\n正文", kind: "ordered-list", listKind: "ordered-list", marker: "---" },
    { source: "- ***\n\n正文", kind: "bullet-list", listKind: "bullet-list", marker: "***" },
  ] as const;

  for (const current of cases) {
    const lines = getContinuousMarkdownLinePresentations(
      current.source,
      current.source.length,
      false,
      undefined,
      false,
    );
    const markerFrom = current.source.indexOf(current.marker);
    assert.equal(lines[0]?.kind, current.kind);
    assert.equal(lines[0]?.listDepth, 0);
    assert.equal(lines[0]?.listKind, current.listKind);
    assert.match(lines[0]?.className ?? "", /(?:^|\s)cm-list-thematic-break(?:\s|$)/);
    assert.deepEqual(lines[0]?.listThematicBreak, {
      from: markerFrom,
      to: markerFrom + current.marker.length,
    });

    const active = getContinuousMarkdownLinePresentations(current.source, markerFrom + 1);
    assert.equal(active[0]?.active, true);
    assert.deepEqual(active[0]?.listThematicBreak, lines[0]?.listThematicBreak);
  }
});

test("连续编辑器保留 Setext 与水平线的 CommonMark 优先级", () => {
  const setext = getContinuousMarkdownLinePresentations(
    "Title\n   ----\nBody",
    "Title\n   ----\nBody".length,
    false,
    undefined,
    false,
  );
  assert.equal(setext[0]?.kind, "heading");
  assert.equal(setext[0]?.level, 2);
  assert.equal(setext[1]?.kind, "setext-marker");

  const thematic = getContinuousMarkdownLinePresentations(
    "Title\n- - -\nBody",
    "Title\n- - -\nBody".length,
    false,
    undefined,
    false,
  );
  assert.equal(thematic[0]?.kind, "paragraph");
  assert.equal(thematic[1]?.kind, "horizontal-rule");
});

test("列表与引用内标题同时保留容器和标题语义", () => {
  const source = "- # 一级标题\n> - ## 引用列表标题";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.equal(lines[0]?.kind, "bullet-list");
  assert.equal(lines[0]?.level, 1);
  assert.equal(lines[0]?.listDepth, 0);
  assert.match(lines[0]?.className ?? "", /cm-heading cm-heading-1/);
  assert.deepEqual(lines[0]?.innerMarkers, [{ from: 2, to: 4 }]);

  assert.equal(lines[1]?.kind, "bullet-list");
  assert.equal(lines[1]?.level, 2);
  assert.equal(lines[1]?.quoteDepth, 1);
  assert.equal(lines[1]?.listDepth, 0);
  assert.match(lines[1]?.className ?? "", /cm-blockquote/);
  assert.match(lines[1]?.className ?? "", /cm-heading-2/);
  assert.deepEqual(lines[1]?.innerMarkers, [{ from: 13, to: 16 }]);
});

test("列表和引用惰性续行继承真实容器层级", () => {
  const source = "- item\ncontinued\n\n> quote\ncontinued";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.equal(lines[1]?.listDepth, 0);
  assert.equal(lines[1]?.listKind, "bullet-list");
  assert.match(lines[1]?.className ?? "", /cm-list-continuation/);

  assert.equal(lines[4]?.kind, "blockquote");
  assert.equal(lines[4]?.quoteDepth, 1);
  assert.equal(lines[4]?.quotePrefixEnd, null);
  assert.match(lines[4]?.className ?? "", /cm-blockquote-depth-1/);
});

test("引用表格的每一行都保留表格和引用语义", () => {
  const source = "> | A | B |\n> | --- | --- |\n> | 1 | 2 |";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines.map((line) => line.kind), ["table", "table", "table"]);
  assert.deepEqual(lines.map((line) => line.quoteDepth), [1, 1, 1]);
  assert.ok(lines.every((line) => /cm-blockquote/.test(line.className)));
});

test("连续编辑器在 CRLF 文档中保持 Setext 标题偏移准确", () => {
  const source = "Title\r\n===\r\n\r\nBody";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.equal(lines[0]?.kind, "heading");
  assert.equal(lines[0]?.level, 1);
  assert.equal(lines[1]?.from, 7);
  assert.equal(lines[1]?.kind, "setext-marker");
  assert.deepEqual(lines[1]?.hiddenMarker, { from: 7, to: 10 });
});

test("连续编辑器始终隐藏 ATX 标题的前后标记", () => {
  const source = "# 标题 #\n\n## 无闭合##";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines[0]?.hiddenMarker, { from: 0, to: 2 });
  assert.deepEqual(lines[0]?.trailingMarker, { from: 4, to: 6 });
  assert.equal(lines[2]?.trailingMarker, null);

  const active = getContinuousMarkdownLinePresentations(source, 0);
  assert.deepEqual(active[0]?.hiddenMarker, { from: 0, to: 2 });
  assert.deepEqual(active[0]?.trailingMarker, { from: 4, to: 6 });
});

test("active list and quoted headings hide only ATX markers", () => {
  const source = "- # \u5217\u8868\u6807\u9898 #\n> - ## \u5f15\u7528\u5217\u8868\u6807\u9898 ##";
  const secondLineFrom = source.indexOf("> -");
  const list = getContinuousMarkdownLinePresentations(source, source.indexOf("\u5217\u8868\u6807\u9898"));
  const quoted = getContinuousMarkdownLinePresentations(source, source.indexOf("\u5f15\u7528\u5217\u8868\u6807\u9898"));
  const listClosing = source.indexOf(" #", source.indexOf("\u5217\u8868\u6807\u9898"));

  assert.equal(list[0]?.kind, "bullet-list");
  assert.equal(list[0]?.listDepth, 0);
  assert.deepEqual(list[0]?.innerMarkers, [
    { from: 2, to: 4 },
    { from: listClosing, to: listClosing + 2 },
  ]);

  assert.equal(quoted[1]?.kind, "bullet-list");
  assert.equal(quoted[1]?.quoteDepth, 1);
  assert.equal(quoted[1]?.quotePrefixEnd, 2);
  assert.equal(quoted[1]?.listDepth, 0);
  assert.deepEqual(quoted[1]?.innerMarkers, [
    {
      from: source.indexOf("##", secondLineFrom),
      to: source.indexOf("##", secondLineFrom) + 3,
    },
    {
      from: source.lastIndexOf(" ##"),
      to: source.length,
    },
  ]);
});

test("ATX 标题可见正文范围保持容器源码偏移", () => {
  const cases = [
    { source: "# 标题 #", head: 2, expected: { from: 2, to: 4 } },
    { source: "- # 列表标题 #", head: 4, expected: { from: 4, to: 8 } },
    { source: "> - ## 引用列表标题 ##", head: 7, expected: { from: 7, to: 13 } },
    { source: "- > ### 列表引用标题 ###", head: 8, expected: { from: 8, to: 14 } },
    { source: "# #", head: 2, expected: { from: 2, to: 3 } },
    { source: "- # #", head: 4, expected: { from: 4, to: 5 } },
    { source: "> # #", head: 4, expected: { from: 4, to: 5 } },
  ];

  for (const current of cases) {
    assert.deepEqual(
      getContinuousAtxHeadingContentRange(current.source, current.head),
      current.expected,
      current.source,
    );
  }
});

test("空 ATX 标题只隐藏前导标记并保留末尾井号正文", () => {
  const plain = getContinuousMarkdownLinePresentations("# #", 2)[0]!;
  assert.deepEqual(plain.hiddenMarker, { from: 0, to: 2 });
  assert.equal(plain.trailingMarker, null);

  const quoted = getContinuousMarkdownLinePresentations("> # #", 4)[0]!;
  assert.deepEqual(quoted.hiddenMarker, { from: 0, to: 4 });
  assert.equal(quoted.trailingMarker, null);

  const listed = getContinuousMarkdownLinePresentations("- # #", 4)[0]!;
  assert.deepEqual(listed.innerMarkers, [{ from: 2, to: 4 }]);
});

test("列表内引用标题在活动时隐藏 ATX 与嵌套引用标记", () => {
  const source = "- > # 标题 #";
  const active = getContinuousMarkdownLinePresentations(source, source.indexOf("标题"))[0]!;
  const inactive = getContinuousMarkdownLinePresentations(
    source,
    source.length,
    false,
    undefined,
    false,
  )[0]!;

  assert.equal(active.kind, "bullet-list");
  assert.equal(active.level, 1);
  assert.equal(active.listDepth, 0);
  assert.equal(active.quoteDepth, 1);
  assert.deepEqual(active.innerMarkers, [
    { from: 4, to: 6 },
    { from: 8, to: 10 },
    { from: 2, to: 4 },
  ]);
  assert.deepEqual(inactive.innerMarkers, [
    { from: 4, to: 6 },
    { from: 8, to: 10 },
    { from: 2, to: 4 },
  ]);
});

test("连续编辑器将无序和有序任务项统一识别为任务列表", () => {
  const source = "- [ ] 无序任务\n1) [x] 有序任务";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines.map((line) => line.kind), ["task-list", "task-list"]);
});

test("连续编辑器为 Front Matter 标记分隔符和连续内容边界", () => {
  const source = "---\ntitle: 文档\nauthor: chain-code\n---\n\n正文";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.match(lines[0]?.className ?? "", /cm-frontmatter-delimiter/);
  assert.match(lines[1]?.className ?? "", /cm-frontmatter-content-first/);
  assert.match(lines[2]?.className ?? "", /cm-frontmatter-content-last/);
  assert.match(lines[3]?.className ?? "", /cm-frontmatter-delimiter/);
  assert.deepEqual(lines[0]?.hiddenMarker, { from: 0, to: 3 });
  const closing = source.lastIndexOf("---");
  assert.deepEqual(lines[3]?.hiddenMarker, { from: closing, to: closing + 3 });
});

test("连续编辑器为单行 Front Matter 内容标记完整卡片边界", () => {
  const source = "---\ntitle: 文档\n---";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.match(lines[1]?.className ?? "", /cm-frontmatter-content-only/);
});

test("连续编辑器为脚注定义区域添加独立正文样式", () => {
  const source = "正文[^note]\n\n[^note]: 第一行\n    第二行";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);
  const footnotes = lines.filter((line) => line.kind === "footnote-definition");

  assert.equal(footnotes.length, 2);
  assert.match(footnotes[0]?.className ?? "", /cm-footnote-definition-first/);
});

test("连续编辑器为嵌套引用标记稳定的视觉层级", () => {
  const source = [
    "> 一级引用",
    "> > 二级引用",
    ">>> 三级引用",
    "> > > > 四级引用",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines.map((line) => line.kind), [
    "blockquote",
    "blockquote",
    "blockquote",
    "blockquote",
  ]);
  assert.match(lines[0]?.className ?? "", /(?:^|\s)cm-blockquote-depth-1(?:\s|$)/);
  assert.match(lines[1]?.className ?? "", /(?:^|\s)cm-blockquote-depth-2(?:\s|$)/);
  assert.match(lines[2]?.className ?? "", /(?:^|\s)cm-blockquote-depth-3(?:\s|$)/);
  assert.match(lines[3]?.className ?? "", /(?:^|\s)cm-blockquote-depth-4(?:\s|$)/);
});

test("连续编辑器在嵌套引用中保留代码和数学围栏语义", () => {
  const source = [
    "> ```ts",
    "> const value = 1;",
    "> ```",
    ">",
    "> > $$",
    "> > x^2",
    "> > $$",
    "> > > \\[",
    "> > > y^2",
    "> > > \\]",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines.map((line) => line.kind), [
    "code-fence",
    "code",
    "code-fence",
    "blockquote",
    "math-fence",
    "math",
    "math-fence",
    "math-fence",
    "math",
    "math-fence",
  ]);
  assert.deepEqual(lines.map((line) => line.quoteDepth), [1, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
  assert.match(lines[1]?.className ?? "", /(?:^|\s)cm-code(?:\s|$)/);
  assert.match(lines[1]?.className ?? "", /(?:^|\s)cm-blockquote(?:\s|$)/);
  assert.match(lines[5]?.className ?? "", /(?:^|\s)cm-blockquote-depth-2(?:\s|$)/);
  assert.deepEqual(lines[0]?.hiddenMarker, { from: lines[0]?.from, to: lines[0]?.to });
  assert.deepEqual(lines[1]?.hiddenMarker, { from: lines[1]?.from, to: (lines[1]?.from ?? 0) + 2 });
  assert.deepEqual(lines[4]?.hiddenMarker, { from: lines[4]?.from, to: lines[4]?.to });
  assert.deepEqual(lines[5]?.hiddenMarker, { from: lines[5]?.from, to: (lines[5]?.from ?? 0) + 4 });
  assert.match(lines[8]?.className ?? "", /(?:^|\s)cm-blockquote-depth-3(?:\s|$)/);
  assert.deepEqual(lines[7]?.hiddenMarker, { from: lines[7]?.from, to: lines[7]?.to });
  assert.deepEqual(lines[8]?.hiddenMarker, { from: lines[8]?.from, to: (lines[8]?.from ?? 0) + 6 });

  const active = getContinuousMarkdownLinePresentations(source, source.indexOf("x^2"));
  assert.equal(active[5]?.hiddenMarker, null);
  assert.match(active[5]?.className ?? "", /cm-active-markdown-line/);
});

test("引用内未闭合的代码和数学围栏不会污染引用外正文", () => {
  const codeSource = [
    "> ```ts",
    "> const value = 1;",
    "引用外正文",
  ].join("\n");
  const codeLines = getContinuousMarkdownLinePresentations(
    codeSource,
    codeSource.length,
    false,
    undefined,
    false,
  );
  assert.deepEqual(codeLines.map((line) => line.kind), ["code-fence", "code", "paragraph"]);
  assert.deepEqual(codeLines.map((line) => line.quoteDepth), [1, 1, 0]);

  const mathSource = [
    "> $$",
    "> x^2",
    "引用外正文",
  ].join("\n");
  const mathLines = getContinuousMarkdownLinePresentations(
    mathSource,
    mathSource.length,
    false,
    undefined,
    false,
  );
  assert.deepEqual(mathLines.map((line) => line.kind), ["math-fence", "math", "paragraph"]);
  assert.deepEqual(mathLines.map((line) => line.quoteDepth), [1, 1, 0]);

  const closedSource = [
    "> ```",
    "> code",
    "> ```",
    "引用外正文",
  ].join("\n");
  const closedLines = getContinuousMarkdownLinePresentations(
    closedSource,
    closedSource.length,
    false,
    undefined,
    false,
  );
  assert.deepEqual(closedLines.map((line) => line.kind), [
    "code-fence",
    "code",
    "code-fence",
    "paragraph",
  ]);
});

test("\u8fde\u7eed\u7f16\u8f91\u5668\u5c06\u591a\u884c Setext \u6807\u9898\u6807\u8bb0\u4e3a\u4e00\u4e2a\u9996\u5c3e\u8fde\u7eed\u5206\u7ec4", () => {
  const source = "First line\nSecond line\n---\n\nBody";
  const lines = getContinuousMarkdownLinePresentations(
    source,
    source.length,
    false,
    undefined,
    false,
  );

  assert.match(lines[0]?.className ?? "", /cm-setext-heading-line/);
  assert.match(lines[0]?.className ?? "", /cm-setext-heading-first/);
  assert.doesNotMatch(lines[0]?.className ?? "", /cm-setext-heading-last/);
  assert.match(lines[1]?.className ?? "", /cm-setext-heading-line/);
  assert.doesNotMatch(lines[1]?.className ?? "", /cm-setext-heading-first/);
  assert.match(lines[1]?.className ?? "", /cm-setext-heading-last/);
  assert.equal(lines[2]?.kind, "setext-marker");
});

test("continuous editor enforces Setext and compact table boundaries", () => {
  for (const marker of ["=", "-"]) {
    const source = "Title\n" + marker + "\nBody";
    const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);
    assert.deepEqual(lines.map((line) => line.kind), ["paragraph", "paragraph", "paragraph"], marker);
    assert.equal(lines[0]?.level, null, marker);
  }

  for (const marker of ["==", "--"]) {
    const source = "Title\n" + marker;
    const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);
    assert.deepEqual(lines.map((line) => line.kind), ["heading", "setext-marker"], marker);
  }

  const table = "| A | B |\n| - | :-: |\n| 1 | 2 |";
  assert.deepEqual(
    getContinuousMarkdownLinePresentations(table, table.length, false, undefined, false)
      .map((line) => line.kind),
    ["table", "table", "table"],
  );
});

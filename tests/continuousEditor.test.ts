import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { history, undoDepth } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import {
  continuousHistoryGroupDelay,
  getContinuousBulletMarker,
  getContinuousMarkdownLinePresentations,
  getContinuousPreviewBlocks,
  getContinuousTextChange,
  getEmojiCompletionRange,
  normalizeContinuousEditorViewState,
  openInlineMathOnEscape,
} from "../src/utils/continuousEditor";

test("无序列表按 Typora 层级使用实心圆、空心圆和方块", () => {
  assert.equal(getContinuousBulletMarker(0), "•");
  assert.equal(getContinuousBulletMarker(1), "◦");
  assert.equal(getContinuousBulletMarker(2), "▪");
  assert.equal(getContinuousBulletMarker(8), "▪");
  assert.equal(getContinuousBulletMarker(-1), "•");
  assert.equal(getContinuousBulletMarker(Number.NaN), "•");
});

test("连续编辑器按 Typora 实际解析将单空格和双空格列表保持为同级", () => {
  const source = "- 一级\n * 二级\n  * 三级";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines.map((line) => line.kind), ["bullet-list", "bullet-list", "bullet-list"]);
  assert.deepEqual(lines.map((line) => line.listDepth), [0, 0, 0]);
  assert.deepEqual(lines.map((line) => line.bulletDepth), [0, 0, 0]);

  const nestedSource = "- 一级\n  * 二级\n    * 三级";
  const nested = getContinuousMarkdownLinePresentations(
    nestedSource,
    nestedSource.length,
    false,
    undefined,
    false,
  );
  assert.deepEqual(nested.map((line) => line.listDepth), [0, 1, 2]);
  assert.deepEqual(nested.map((line) => line.bulletDepth), [0, 1, 2]);
});

test("连续编辑器按整篇 Markdown 识别实时预览行，并保持活动 ATX 标题标记隐藏", () => {
  const markdown = [
    "---",
    "title: Demo",
    "---",
    "# Heading",
    "",
    "> Quote",
    "",
    "| A | B |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "```ts",
    "const value = 1;",
    "```",
  ].join("\n");
  const headingOffset = markdown.indexOf("Heading");
  const lines = getContinuousMarkdownLinePresentations(markdown, headingOffset, true);

  assert.equal(lines[0].kind, "frontmatter");
  assert.deepEqual(lines[0].hiddenMarker, { from: 0, to: 3 });
  assert.equal(lines[3].kind, "heading");
  assert.equal(lines[3].level, 1);
  assert.deepEqual(lines[3].hiddenMarker, { from: 20, to: 22 });
  assert.match(lines[3].className, /cm-active-markdown-line/);
  assert.equal(lines[5].kind, "blockquote");
  assert.match(lines[5].className, /cm-focus-muted/);
  assert.deepEqual(lines.slice(7, 10).map((line) => line.kind), ["table", "table", "table"]);
  assert.deepEqual(lines.slice(11, 14).map((line) => line.kind), ["code-fence", "code", "code-fence"]);
});

test("引用容器保留标题、列表和任务项的内层语义", () => {
  const markdown = [
    "> # 一级标题 #",
    "> > ## 二级标题",
    "> > > - 无序项目",
    "> 1. 有序项目",
    "> - [ ] 待办项目",
    "> 普通引用",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length, false, undefined, false);

  assert.deepEqual(lines.map((line) => line.kind), [
    "heading",
    "heading",
    "bullet-list",
    "ordered-list",
    "task-list",
    "blockquote",
  ]);
  assert.deepEqual(lines.map((line) => line.quoteDepth), [1, 2, 3, 1, 1, 1]);
  assert.deepEqual(lines.map((line) => line.quotePrefixEnd), [2, 4, 6, 2, 2, 2]);
  assert.deepEqual(lines.slice(0, 2).map((line) => line.level), [1, 2]);
  assert.match(lines[0]?.className ?? "", /(?:^|\s)cm-heading(?:\s|$)/);
  assert.match(lines[0]?.className ?? "", /(?:^|\s)cm-blockquote(?:\s|$)/);
  assert.match(lines[1]?.className ?? "", /(?:^|\s)cm-blockquote-depth-2(?:\s|$)/);
  assert.deepEqual(lines[0]?.hiddenMarker, { from: lines[0]?.from, to: (lines[0]?.from ?? 0) + 4 });
  assert.match(lines[2]?.className ?? "", /(?:^|\s)cm-blockquote-depth-3(?:\s|$)/);
  assert.deepEqual(lines[2]?.hiddenMarker, { from: lines[2]?.from, to: (lines[2]?.from ?? 0) + 6 });
  assert.ok(lines[0]?.trailingMarker);

  const active = getContinuousMarkdownLinePresentations(markdown, markdown.indexOf("一级标题"));
  assert.deepEqual(active[0]?.hiddenMarker, { from: 0, to: 4 });
  assert.deepEqual(active[0]?.trailingMarker, { from: 8, to: 10 });
});

test("连续编辑器保留三层以上引用的真实视觉深度", () => {
  const source = "> 一级\n> > 二级\n> > > 三级\n> > > > 四级\n> > > > > 五级";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines.map((line) => line.quoteDepth), [1, 2, 3, 4, 5]);
  assert.match(lines[3]?.className ?? "", /(?:^|\s)cm-blockquote-depth-4(?:\s|$)/);
  assert.match(lines[4]?.className ?? "", /(?:^|\s)cm-blockquote-depth-5(?:\s|$)/);
});

test("连续编辑器标记引用首尾、嵌套边界和段落空行", () => {
  const source = [
    "正文",
    "> # 引用标题",
    "> 第一段",
    ">",
    "> 第二段",
    "> > 嵌套引用",
    ">",
    "> 尾段",
    "# 后续标题",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.match(lines[1]?.className ?? "", /cm-blockquote-first/);
  assert.match(lines[1]?.className ?? "", /cm-blockquote-margin-before/);
  assert.match(lines[3]?.className ?? "", /cm-blockquote-gap/);
  assert.match(lines[5]?.className ?? "", /cm-blockquote-first/);
  assert.match(lines[5]?.className ?? "", /cm-blockquote-last/);
  assert.match(lines[5]?.className ?? "", /cm-blockquote-margin-before/);
  assert.doesNotMatch(lines[5]?.className ?? "", /cm-blockquote-margin-after/);
  assert.match(lines[6]?.className ?? "", /cm-blockquote-gap/);
  assert.match(lines[7]?.className ?? "", /cm-blockquote-last/);
  assert.match(lines[7]?.className ?? "", /cm-blockquote-margin-after/);
});

test("引用内水平线同时保留引用容器和分隔线语义", () => {
  const source = "> 上文\n> ***\n> 下文";
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.equal(lines[1]?.kind, "horizontal-rule");
  assert.match(lines[1]?.className ?? "", /(?:^|\s)cm-horizontal-rule(?:\s|$)/);
  assert.match(lines[1]?.className ?? "", /(?:^|\s)cm-blockquote(?:\s|$)/);
  assert.equal(lines[1]?.quoteDepth, 1);
});

test("标题与普通段落的源码空行转换为对应块间距", () => {
  const markdown = "# 标题\n\n正文\n\n## 小节\n\n正文二\n\n段落一\n\n段落二";
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.equal(lines[1]?.kind, "blank");
  assert.match(lines[1]?.className ?? "", /cm-heading-gap/);
  assert.equal(lines[3]?.kind, "blank");
  assert.match(lines[3]?.className ?? "", /cm-heading-gap/);
  assert.equal(lines[5]?.kind, "blank");
  assert.match(lines[5]?.className ?? "", /cm-heading-gap/);
  assert.equal(lines[7]?.kind, "blank");
  assert.doesNotMatch(lines[7]?.className ?? "", /cm-heading-gap/);
  assert.match(lines[7]?.className ?? "", /cm-block-gap/);

  const activeGap = getContinuousMarkdownLinePresentations(markdown, "# 标题\n".length)[1]!;
  assert.equal(activeGap.active, true);
  assert.match(activeGap.className, /cm-heading-gap/);
  assert.match(activeGap.className, /cm-active-markdown-line/);
});

test("列表、表格和普通段落边界均使用紧凑块间距", () => {
  const markdown = [
    "task-service 不负责：",
    "",
    "- 不 fork 插件，不管理本机进程。",
    "- 不读取检材内容。",
    "",
    "| 服务 | 职责 |",
    "| --- | --- |",
    "| task-service | 调度任务 |",
    "",
    "第一段正文。",
    "",
    "第二段正文。",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.match(lines[1]?.className ?? "", /cm-block-gap/);
  assert.match(lines[4]?.className ?? "", /cm-block-gap/);
  assert.match(lines[8]?.className ?? "", /cm-block-gap/);
  assert.match(lines[10]?.className ?? "", /cm-block-gap/);

  const activeGap = getContinuousMarkdownLinePresentations(markdown, markdown.indexOf("\n\n") + 1)[1]!;
  assert.match(activeGap.className, /cm-block-gap/);
  assert.match(activeGap.className, /cm-active-markdown-line/);
});

test("松散列表内部空行使用列表段落间距", () => {
  const markdown = [
    "- 第一项",
    "",
    "  第一项续段",
    "",
    "- 第二项",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.match(lines[1]?.className ?? "", /cm-list-gap/);
  assert.match(lines[3]?.className ?? "", /cm-list-gap/);
  assert.doesNotMatch(lines[1]?.className ?? "", /cm-block-gap/);
  assert.doesNotMatch(lines[3]?.className ?? "", /cm-block-gap/);
});

test("CRLF 文档中的列表边界也使用紧凑块间距", () => {
  const markdown = "正文\r\n\r\n- 项目";
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.equal(lines[1]?.from, 4);
  assert.match(lines[1]?.className ?? "", /cm-block-gap/);
});

test("文档前导空行不会影响后续列表边界识别", () => {
  const markdown = "\n正文\n\n- 项目";
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.doesNotMatch(lines[0]?.className ?? "", /cm-block-gap/);
  assert.match(lines[2]?.className ?? "", /cm-block-gap/);
});

test("连续多个源码空行只保留一份正文块间距", () => {
  const markdown = "第一段\n\n\n第二段";
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.match(lines[1]?.className ?? "", /cm-block-gap/);
  assert.doesNotMatch(lines[1]?.className ?? "", /cm-block-gap-extra/);
  assert.match(lines[2]?.className ?? "", /cm-block-gap-extra/);
});

test("连续编辑器正确处理 CRLF 偏移和文档边界", () => {
  const markdown = "# One\r\n\r\n## Two";
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length + 100);

  assert.equal(lines[0].from, 0);
  assert.equal(lines[1].from, 7);
  assert.equal(lines[2].from, 9);
  assert.equal(lines[2].active, true);
});

test("连续编辑器识别带 UTF-8 BOM 的 YAML 元数据", () => {
  const markdown = "\uFEFF---\ntitle: Demo\n---\nBody";
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.equal(lines[0].kind, "frontmatter");
  assert.deepEqual(lines[0].hiddenMarker, { from: 0, to: 4 });
  assert.equal(lines[2].kind, "frontmatter");
  assert.equal(lines[3].kind, "paragraph");
});

test("front matter ignores Markdown syntax metadata on every YAML line", () => {
  const markdown = [
    "---",
    "# literal",
    "    nested: value",
    "> literal",
    "---",
    "# Visible",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length, false, undefined, false);

  assert.deepEqual(lines.slice(0, 5).map((line) => line.kind), [
    "frontmatter",
    "frontmatter",
    "frontmatter",
    "frontmatter",
    "frontmatter",
  ]);
  for (const line of lines.slice(0, 5)) {
    assert.equal(line.level, null);
    assert.equal(line.quoteDepth, 0);
    assert.equal(line.listDepth, null);
    assert.doesNotMatch(line.className, /cm-heading|cm-code|cm-blockquote/);
  }
  assert.deepEqual(lines[1]?.innerMarkers, []);
  assert.equal(lines[5]?.kind, "heading");
  assert.deepEqual(getContinuousPreviewBlocks(markdown), []);
});

test("表情补全仅匹配折叠光标前的完整短代码", () => {
  assert.deepEqual(getEmojiCompletionRange("Hello :smil", 11), {
    query: "smil",
    from: 6,
    to: 11,
  });
  assert.equal(getEmojiCompletionRange("Hello :smil", 6, 11), null);
  assert.equal(getEmojiCompletionRange("Hello: smil", 11), null);
  assert.equal(getEmojiCompletionRange("Hello \\:smil", 12), null);
  assert.deepEqual(getEmojiCompletionRange("Hello \\\\:smil", 13), {
    query: "smil",
    from: 8,
    to: 13,
  });
  const longestCode = "face_with_open_eyes_and_hand_over_mouth";
  assert.deepEqual(getEmojiCompletionRange(`:${longestCode}`, longestCode.length + 1), {
    query: longestCode,
    from: 0,
    to: longestCode.length + 1,
  });
});

test("连续编辑命令只提交最小文本变更，保留 CodeMirror 增量解析和历史记录", () => {
  assert.deepEqual(getContinuousTextChange("alpha beta gamma", "alpha strong gamma"), {
    from: 6,
    to: 10,
    insert: "strong",
  });
  assert.deepEqual(getContinuousTextChange("same", "same!"), {
    from: 4,
    to: 4,
    insert: "!",
  });
  assert.equal(getContinuousTextChange("same", "same"), null);
});

test("连续编辑器识别需要渲染为非活动 widget 的特殊块", () => {
  const markdown = [
    "![Cover](cover.png)",
    "",
    "| A | B |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "$$",
    "x^2",
    "$$",
    "",
    "```ts",
    "const value = 1;",
    "```",
    "",
    "[TOC]",
    "",
    "> [!NOTE]",
    "> Important",
  ].join("\n");

  assert.deepEqual(
    getContinuousPreviewBlocks(markdown).map((block) => block.kind),
    ["image", "table", "math", "code", "toc"],
  );
});

test("连续编辑器将 Typora 的每种独立 TOC 标记识别为目录预览块", () => {
  const source = [
    "Before",
    "[toc]",
    "{:toc}",
    "[[_TOC_]]",
    "{: toc depth=3 }",
    "After",
  ].join("\n");
  const blocks = getContinuousPreviewBlocks(source);

  assert.deepEqual(blocks.map((block) => block.kind), ["toc", "toc", "toc", "toc"]);
  assert.deepEqual(blocks.map((block) => block.source.trim()), [
    "[toc]",
    "{:toc}",
    "[[_TOC_]]",
    "{: toc depth=3 }",
  ]);

  const invalid = "    {:toc}\n{: toc\n[[_TOC_]] trailing";
  assert.equal(getContinuousPreviewBlocks(invalid).some((block) => block.kind === "toc"), false);
});

test("连续编辑器在提示块内保留列表和嵌套引用", () => {
  const note = [
    "> [!NOTE]",
    "> 提示正文",
    "> - 列表项",
    "> > 嵌套引用",
  ].join("\n");
  const source = note + "\n\n> [!TIP]\n> 第二个提示";
  assert.deepEqual(getContinuousPreviewBlocks(source), []);
});

test("连续编辑器识别列表和引用内的特殊预览块", () => {
  const source = [
    "- code",
    "  ```js",
    "  const value = 1",
    "  ```",
    "",
    "- math",
    "  $$",
    "  x^2",
    "  $$",
    "",
    "- table",
    "  | A | B |",
    "  | --- | --- |",
    "  | 1 | 2 |",
    "",
    "> <section>",
    "> HTML",
    "> </section>",
  ].join("\n");
  const blocks = getContinuousPreviewBlocks(source);

  assert.deepEqual(blocks.map((block) => block.kind), ["code", "math", "table", "html"]);
  assert.ok(blocks.every((block) => source.slice(block.from, block.to) === block.source));
  assert.match(blocks[0]?.source ?? "", /^  ```js/);
  assert.match(blocks[1]?.source ?? "", /^  \$\$/);
  assert.match(blocks[2]?.source ?? "", /^  \| A \| B \|/);
  assert.match(blocks[3]?.source ?? "", /^> <section>/);
});

test("连续编辑器将引用内 Mermaid 围栏保留为可放大的流程图", () => {
  const source = "> ```mermaid\n> flowchart LR\n> A --> B\n> ```";
  const blocks = getContinuousPreviewBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "diagram");
  assert.equal(blocks[0]?.source, source);
});

test("continuous editor supports list-to-quote diagram and math fences", () => {
  const source = [
    "- > quote",
    "",
    "- > ~~~mermaid",
    "  > flowchart LR",
    "  > A --> B",
    "  > ~~~",
    "",
    "1. > $$",
    "   > x^2",
    "   > $$",
    "",
    "- > ```math",
    "  > y^2",
    "  > ```",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(
    source,
    source.length,
    false,
    undefined,
    false,
  );
  const previews = getContinuousPreviewBlocks(source);

  assert.equal(lines[0]?.kind, "bullet-list");
  assert.equal(lines[0]?.quoteDepth, 1);
  assert.deepEqual(lines[0]?.innerMarkers, [{ from: 2, to: 4 }]);
  assert.deepEqual(lines.slice(2, 6).map((line) => line.kind), [
    "code-fence",
    "code",
    "code",
    "code-fence",
  ]);
  assert.deepEqual(lines.slice(2, 6).map((line) => line.quoteDepth), [1, 1, 1, 1]);
  assert.deepEqual(lines.slice(7, 10).map((line) => line.kind), [
    "math-fence",
    "math",
    "math-fence",
  ]);
  assert.deepEqual(lines.slice(11, 14).map((line) => line.kind), [
    "math-fence",
    "math",
    "math-fence",
  ]);
  assert.deepEqual(previews.map((block) => block.kind), ["diagram", "math", "math"]);
  assert.equal(previews[0]?.quoteDepth, 1);
  assert.equal(previews[0]?.listDepth, 0);
});

test("continuous editor keeps indented diagram fences as code", () => {
  for (const language of ["mermaid", "flowchart", "sequence"]) {
    const source = [
      "    ~~~" + language,
      "    A --> B",
      "    ~~~",
    ].join("\n");
    const blocks = getContinuousPreviewBlocks(source);

    assert.deepEqual(blocks.map((block) => block.kind), ["code"], language);
    assert.equal(blocks.some((block) => block.kind === "diagram"), false, language);
  }
});

test("连续编辑器保留直接列表表格的源码与容器层级", () => {
  const source = "- | A | B |\n  | --- | --- |\n  | 1 | 2 |";
  const blocks = getContinuousPreviewBlocks(source);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]?.kind, "table");
  assert.equal(blocks[0]?.source, source);
  assert.equal(blocks[0]?.listDepth, 0);
});

test("列表内四列缩进的图表围栏保持代码语义", () => {
  const source = [
    "- item",
    "",
    "      ~~~mermaid",
    "      flowchart LR",
    "      A --> B",
    "      ~~~",
  ].join("\n");
  const blocks = getContinuousPreviewBlocks(source);

  assert.deepEqual(blocks.map((block) => block.kind), ["code"]);
  assert.equal(blocks.some((block) => block.kind === "diagram"), false);
});

test("continuous editor accepts arbitrary-length ordered list markers", () => {
  const source = [
    "123456789. valid",
    "1234567890. paragraph",
    "1234567890. [ ] paragraph task",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines.map((line) => line.kind), [
    "ordered-list",
    "ordered-list",
    "task-list",
  ]);
});

test("continuous editor keeps loose footnote continuations out of code previews", () => {
  const source = [
    "> Text[^note]",
    ">",
    "> [^note]: First paragraph.",
    ">",
    ">     Second paragraph.",
  ].join("\n");

  assert.deepEqual(getContinuousPreviewBlocks(source), []);
});

test("连续编辑器将 Mermaid 和 Flowchart 围栏统一识别为 diagram", () => {
  const markdown = [
    "```mermaid",
    "flowchart LR",
    "  A[开始] --> B[结束]",
    "```",
    "",
    "```mmd",
    "graph TD",
    "  A --> B",
    "```",
    "",
    "```flowchart",
    "st=>start: 开始",
    "e=>end: 结束",
    "st->e",
    "```",
    "",
    "```flow",
    "st=>start: 开始",
    "e=>end: 结束",
    "st->e",
    "```",
    "",
    "```ts",
    "const value = 1;",
    "```",
  ].join("\n");

  const blocks = getContinuousPreviewBlocks(markdown);
  assert.deepEqual(blocks.map((block) => block.kind), [
    "diagram",
    "diagram",
    "diagram",
    "diagram",
    "code",
  ]);
  assert.equal(blocks[0].source.trimEnd(), "```mermaid\nflowchart LR\n  A[开始] --> B[结束]\n```");
});

test("连续编辑器显式使用 Typora 风格的三秒撤销合并窗口", () => {
  const componentSource = readFileSync(resolve("src/components/ContinuousMarkdownEditor.vue"), "utf8");
  assert.equal(continuousHistoryGroupDelay, 3000);
  assert.match(componentSource, /history\(\{ newGroupDelay: continuousHistoryGroupDelay \}\)/);
  assert.doesNotMatch(componentSource, /minimalSetup/);

  let state = EditorState.create({ extensions: [history({ newGroupDelay: continuousHistoryGroupDelay })] });
  state = appendHistoryText(state, "a", 1000);
  state = appendHistoryText(state, "b", 3500);
  assert.equal(undoDepth(state), 1);
  state = appendHistoryText(state, "c", 7001);
  assert.equal(undoDepth(state), 2);
});

test("文件视图状态恢复会限制选区和滚动边界", () => {
  assert.deepEqual(normalizeContinuousEditorViewState({
    anchor: -10,
    head: 200,
    scrollTop: Number.NaN,
  }, 80), {
    anchor: 0,
    head: 80,
    scrollTop: 0,
  });
});

test("Escape creates an inline math pair only after one unmatched dollar marker", () => {
  assert.deepEqual(openInlineMathOnEscape("$", 1), {
    value: "$$",
    selectionStart: 1,
    selectionEnd: 1,
  });
  assert.deepEqual(openInlineMathOnEscape("before $ after", 8), {
    value: "before $$ after",
    selectionStart: 8,
    selectionEnd: 8,
  });
  assert.equal(openInlineMathOnEscape("$x$", 3), null);
  assert.equal(openInlineMathOnEscape("$$", 1), null);
  assert.equal(openInlineMathOnEscape("$$", 2), null);
  assert.equal(openInlineMathOnEscape("\\$", 2), null);
  assert.equal(openInlineMathOnEscape("$", 0, 1), null);
});

test("Escape creates inline math in Chinese paragraphs without changing CRLF", () => {
  const source = "中文正文：$\r\n下一段";
  const cursor = source.indexOf("$") + 1;
  assert.deepEqual(openInlineMathOnEscape(source, cursor), {
    value: "中文正文：$$\r\n下一段",
    selectionStart: cursor,
    selectionEnd: cursor,
  });
});

test("Escape does not create inline math inside protected Markdown blocks", () => {
  const sources = [
    "```md\n价格：$\n```",
    "    价格：$",
    "$$\n价格：$\n$$",
    "<div>\n价格：$\n</div>",
    "---\ntitle: 价格 $\n---\n\n正文",
  ];

  for (const source of sources) {
    const cursor = source.startsWith("$$")
      ? source.indexOf("$", 2) + 1
      : source.indexOf("$") + 1;
    assert.equal(openInlineMathOnEscape(source, cursor), null, source);
  }
});

test("Escape does not create inline math inside Markdown code spans", () => {
  for (const source of ["`价格：$`", "``代码 ` 价格：$``", "`跨行\r\n价格：$`"]) {
    const cursor = source.lastIndexOf("$") + 1;
    assert.equal(openInlineMathOnEscape(source, cursor), null, source);
  }
});

test('list type transitions inside one parsed block use compact spacing', () => {
  const markdown = [
    '- bullet',
    '',
    '1. ordered',
    '',
    '- [ ] task',
  ].join('\n');
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.match(lines[1]?.className ?? '', /cm-block-gap/);
  assert.match(lines[3]?.className ?? '', /cm-block-gap/);
});

test('the blank line after a footnote definition remains a compact block gap', () => {
  const markdown = 'Text[^n]\n\n[^n]: note\n\nAfter';
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  assert.equal(lines[2]?.kind, 'footnote-definition');
  assert.equal(lines[3]?.kind, 'blank');
  assert.match(lines[3]?.className ?? '', /cm-block-gap/);
});

test("continuous editor classifies spaced-label container definitions", () => {
  const markdown = "Text[^中文 note]\r\n\r\n> - [^中文 note]: detail";
  const lines = getContinuousMarkdownLinePresentations(markdown, 0);

  assert.equal(lines.at(-1)?.kind, "footnote-definition");
  assert.match(lines.at(-1)?.className ?? "", /cm-footnote-definition-first/);
});


test("raw code, math, and HTML blocks preserve their editing container boundaries", () => {
  const markdown = [
    "~~~ts",
    "const value = 1;",
    "~~~",
    "",
    "<section>",
    "  <strong>body</strong>",
    "</section>",
    "",
    "$$",
    "x + y",
    "$$",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

  const code = lines.filter((line) => line.className.includes("cm-raw-block-code"));
  assert.deepEqual(code.map((line) => line.kind), ["code-fence", "code", "code-fence"]);
  assert.match(code[0]?.className ?? "", /cm-raw-block-first/);
  assert.match(code[2]?.className ?? "", /cm-raw-block-last/);

  const html = lines.filter((line) => line.className.includes("cm-raw-block-html"));
  assert.deepEqual(html.map((line) => line.kind), ["html", "html", "html"]);
  assert.match(html[0]?.className ?? "", /cm-raw-block-first/);
  assert.match(html[2]?.className ?? "", /cm-raw-block-last/);

  const math = lines.filter((line) => line.className.includes("cm-raw-block-math"));
  assert.deepEqual(math.map((line) => line.kind), ["math-fence", "math", "math-fence"]);
  assert.match(math[0]?.className ?? "", /cm-raw-block-first/);
  assert.match(math[2]?.className ?? "", /cm-raw-block-last/);
});

test("active code fences collapse both delimiters and transfer the frame to code content", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const sources = [
    [fence + "ts", "alpha", fence].join("\n"),
    [fence + "ts", "alpha", fence].join("\r\n"),
    ["> " + fence + "ts", "> alpha", "> " + fence].join("\n"),
    ["- " + fence + "ts", "  alpha", "  " + fence].join("\r\n"),
    ["10. " + fence + "ts", "    alpha", "    " + fence].join("\n"),
  ];

  for (const source of sources) {
    const lines = getContinuousMarkdownLinePresentations(source, source.indexOf("alpha"));
    const opening = lines[0]!;
    const content = lines[1]!;
    const closing = lines[2]!;

    assert.equal(opening.kind, "code-fence", source);
    assert.equal(closing.kind, "code-fence", source);
    assert.match(opening.className, /cm-active-raw-fence-hidden/, source);
    assert.match(closing.className, /cm-active-raw-fence-hidden/, source);
    assert.ok(opening.hiddenMarker, source);
    assert.ok(closing.hiddenMarker, source);
    assert.match(content.className, /cm-active-raw-content-first/, source);
    assert.match(content.className, /cm-active-raw-content-last/, source);
  }
});

test("active empty code fences keep one framed input line", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const source = [fence, "", fence].join("\r\n");
  const lines = getContinuousMarkdownLinePresentations(
    source,
    source.indexOf("\r\n") + 2,
  );

  assert.match(lines[0]?.className ?? "", /cm-active-raw-fence-hidden/);
  assert.match(lines[1]?.className ?? "", /cm-active-raw-content-first/);
  assert.match(lines[1]?.className ?? "", /cm-active-raw-content-last/);
  assert.match(lines[2]?.className ?? "", /cm-active-raw-fence-hidden/);

  const compact = [fence, fence].join("\n");
  const compactLines = getContinuousMarkdownLinePresentations(compact, compact.indexOf("\n") + 1);
  assert.match(compactLines[1]?.className ?? "", /cm-active-raw-empty-input/);
  assert.ok(compactLines[1]?.hiddenMarker);
});

test("active delimiter math reveals both delimiters in plain and contained blocks", () => {
  const sources = [
    ["$$", "x = 1", "$$"].join("\n"),
    ["\\[", "x = 1", "\\]"].join("\r\n"),
    ["> $$", "> x = 1", "> $$"].join("\n"),
    ["- $$", "  x = 1", "  $$"].join("\r\n"),
  ];

  for (const source of sources) {
    const lines = getContinuousMarkdownLinePresentations(source, source.indexOf("x = 1"));
    const fences = lines.filter((line) => line.kind === "math-fence");

    assert.equal(fences.length, 2, source);
    for (const fence of fences) {
      assert.match(fence.className, /cm-active-delimited-math-fence/, source);
      assert.equal(fence.hiddenMarker, null, source);
      assert.doesNotMatch(fence.className, /cm-active-raw-fence-hidden/, source);
    }
  }
});

test("active fenced math hides backtick delimiters and frames the formula source", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const sources = [
    [fence + "math", "x = 1", fence].join("\n"),
    ["> " + fence + "math", "> x = 1", "> " + fence].join("\r\n"),
    ["- " + fence + "math", "  x = 1", "  " + fence].join("\n"),
  ];

  for (const source of sources) {
    const lines = getContinuousMarkdownLinePresentations(source, source.indexOf("x = 1"));

    assert.match(lines[0]?.className ?? "", /cm-active-raw-fence-hidden/, source);
    assert.ok(lines[0]?.hiddenMarker, source);
    assert.match(lines[1]?.className ?? "", /cm-active-raw-content-first/, source);
    assert.match(lines[1]?.className ?? "", /cm-active-raw-content-last/, source);
    assert.match(lines[2]?.className ?? "", /cm-active-raw-fence-hidden/, source);
    assert.ok(lines[2]?.hiddenMarker, source);
  }
});
test("closed GitLab math fences use math semantics while invalid and unclosed fences stay as code", () => {
  const source = [
    "```math",
    "x^2 + y^2",
    "```",
    "",
    "```js`invalid",
    "plain",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(source, source.indexOf("x^2"));

  assert.deepEqual(lines.slice(0, 3).map((line) => line.kind), [
    "math-fence",
    "math",
    "math-fence",
  ]);
  assert.equal(lines[4]?.kind, "paragraph");
  assert.equal(lines[5]?.kind, "paragraph");

  const preview = getContinuousPreviewBlocks(source);
  assert.equal(preview[0]?.kind, "math");
  assert.equal(preview[0]?.source.trimEnd(), "```math\nx^2 + y^2\n```");

  const unclosed = "```math\nx^2";
  assert.deepEqual(
    getContinuousMarkdownLinePresentations(unclosed, unclosed.length)
      .map((line) => line.kind),
    ["code-fence", "code"],
  );
  assert.equal(getContinuousPreviewBlocks(unclosed)[0]?.kind, "code");
});

test("nested GitLab math fences keep quote and list containers", () => {
  const source = [
    "> ```math",
    "> x^2",
    "> ```",
    "",
    "- ```math",
    "  y^2",
    "  ```",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(lines.slice(0, 3).map((line) => line.kind), [
    "math-fence",
    "math",
    "math-fence",
  ]);
  assert.deepEqual(lines.slice(0, 3).map((line) => line.quoteDepth), [1, 1, 1]);
  assert.deepEqual(lines.slice(4).map((line) => line.kind), [
    "math-fence",
    "math",
    "math-fence",
  ]);
  assert.deepEqual(getContinuousPreviewBlocks(source).map((block) => block.kind), ["math", "math"]);
});

test("continuous editor closes Front Matter with the YAML explicit end marker", () => {
  for (const lineBreak of ["\n", "\r\n"] as const) {
    const source = `---${lineBreak}title: Demo${lineBreak}...${lineBreak}# Visible`;
    const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

    assert.deepEqual(lines.map((line) => line.kind), [
      "frontmatter",
      "frontmatter",
      "frontmatter",
      "heading",
    ]);
    assert.match(lines[2]?.className ?? "", /cm-frontmatter-delimiter/);
    const closing = source.indexOf("...");
    assert.deepEqual(lines[2]?.hiddenMarker, { from: closing, to: closing + 3 });
  }
});

test("continuous editor preserves tagged math inside quote and list containers", () => {
  const source = [
    "> $$ {quote tag}",
    "> q = 1",
    "> $$ {quote close}",
    "",
    "- math",
    "  $$ {{list tag}}",
    "  l = 2",
    "  $$ {list close}",
  ].join("\n");
  const previews = getContinuousPreviewBlocks(source);
  const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);

  assert.deepEqual(previews.map((block) => block.kind), ["math", "math"]);
  assert.deepEqual(previews.map((block) => block.quoteDepth), [1, 0]);
  assert.deepEqual(previews.map((block) => block.listDepth), [null, 0]);
  assert.deepEqual(lines.slice(0, 3).map((line) => line.kind), ["math-fence", "math", "math-fence"]);
  assert.deepEqual(lines.slice(5, 8).map((line) => line.kind), ["math-fence", "math", "math-fence"]);
});

test("continuous editor leaves invalid tagged math openings as ordinary text", () => {
  for (const opening of ["$$ {}", "$$ {tag", "$$ {tag} ", "$$ {tag} trailing"]) {
    const source = `${opening}\nx = 1`;
    const lines = getContinuousMarkdownLinePresentations(source, source.length, false, undefined, false);
    assert.equal(lines[0]?.kind, "paragraph", opening);
    assert.equal(getContinuousPreviewBlocks(source).some((block) => block.from === 0), false, opening);
  }
});

function appendHistoryText(state: EditorState, text: string, time: number): EditorState {
  return state.update({
    changes: { from: state.doc.length, insert: text },
    annotations: Transaction.time.of(time),
  }).state;
}

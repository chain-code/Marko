import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { history, undoDepth } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import {
  continuousHistoryGroupDelay,
  getContinuousMarkdownLinePresentations,
  getContinuousPreviewBlocks,
  getContinuousTextChange,
  getEmojiCompletionRange,
  normalizeContinuousEditorViewState,
} from "../src/utils/continuousEditor";

test("连续编辑器按整篇 Markdown 识别实时预览行，并只隐藏非活动行标记", () => {
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
  assert.equal(lines[3].hiddenMarker, null);
  assert.match(lines[3].className, /cm-active-markdown-line/);
  assert.equal(lines[5].kind, "blockquote");
  assert.match(lines[5].className, /cm-focus-muted/);
  assert.deepEqual(lines.slice(7, 10).map((line) => line.kind), ["table", "table", "table"]);
  assert.deepEqual(lines.slice(11, 14).map((line) => line.kind), ["code-fence", "code", "code-fence"]);
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

test("松散列表内部空行不会被误压缩", () => {
  const markdown = [
    "- 第一项",
    "",
    "  第一项续段",
    "",
    "- 第二项",
  ].join("\n");
  const lines = getContinuousMarkdownLinePresentations(markdown, markdown.length);

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

test("表情补全仅匹配折叠光标前的完整短代码", () => {
  assert.deepEqual(getEmojiCompletionRange("Hello :smil", 11), {
    query: "smil",
    from: 6,
    to: 11,
  });
  assert.equal(getEmojiCompletionRange("Hello :smil", 6, 11), null);
  assert.equal(getEmojiCompletionRange("Hello: smil", 11), null);
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
    ["image", "table", "math", "code", "toc", "callout"],
  );
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

function appendHistoryText(state: EditorState, text: string, time: number): EditorState {
  return state.update({
    changes: { from: state.doc.length, insert: text },
    annotations: Transaction.time.of(time),
  }).state;
}

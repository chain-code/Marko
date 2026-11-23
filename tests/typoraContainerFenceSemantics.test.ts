import test from "node:test";
import assert from "node:assert/strict";
import {
  collectMarkdownAbbreviationDefinitions,
  createOutline,
  renderMarkdown,
} from "../src/utils/markdown";
import { defaultEditorSettings } from "../src/utils/editorSettings";
import { readDollarMathBlockOpening } from "../src/utils/mathSyntax";
import { collectMathDocumentItems } from "../src/utils/mathRendering";
import {
  isMarkdownFencedMathBlock,
  splitMarkdownBlocks,
} from "../src/utils/editorBlocks";
import {
  getContinuousDiagramLanguage,
  getContinuousMarkdownLinePresentations,
  getContinuousPreviewBlocks,
} from "../src/utils/continuousEditor";
import { getRawBlockSelection } from "../src/utils/rawBlockEditing";
import {
  applyDefaultCodeLanguageOnFenceKey,
  continueMarkdownBlock,
} from "../src/utils/editorCommands";

const settings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

test("大纲与缩写只跳过严格闭合的列首 Front Matter", () => {
  for (const source of [
    "---\n# Visible\n*[HTML]: Hyper Text Markup Language",
    "  ---\n# Visible\n\n*[HTML]: Hyper Text Markup Language\n  ...",
  ]) {
    assert.deepEqual(createOutline(source).map((item) => item.title), ["Visible"]);
    assert.deepEqual(
      collectMarkdownAbbreviationDefinitions(source).map(({ label, title }) => ({ label, title })),
      [{ label: "HTML", title: "Hyper Text Markup Language" }],
    );
  }
});

test("数学围栏按 Tab stop 拒绝四列缩进", () => {
  assert.ok(readDollarMathBlockOpening("   $$"));
  for (const opening of ["\t$$", " \t$$", "  \t$$", "   \t$$"]) {
    assert.equal(readDollarMathBlockOpening(opening), null, JSON.stringify(opening));
  }
});

test("数学文档扫描支持列表项起始和引用前导空格变化", () => {
  const source = [
    "- $$",
    "  x = 1",
    "  $$",
    "",
    " > $$",
    "> y = 2",
    "> $$",
  ].join("\n");

  assert.deepEqual(
    collectMathDocumentItems(source).map(({ formula, display }) => ({ formula, display })),
    [
      { formula: "x = 1", display: true },
      { formula: "y = 2", display: true },
    ],
  );
});

test("数学扫描不会把空格加 Tab 的代码缩进识别成围栏", () => {
  for (const source of [
    " \t$$\n \tx = 1\n \t$$",
    " \t```math\n \tx = 1\n \t```",
  ]) {
    assert.deepEqual(collectMathDocumentItems(source), [], source);
  }
});

test("Markdown 渲染列表数学围栏并保护缩进的图表源码", () => {
  const mathHtml = renderMarkdown("- $$\n  x = 1\n  $$", { settings, outline: [] });
  assert.match(mathHtml, /<ul>/);
  assert.match(mathHtml, /class="math-block"/);
  assert.match(mathHtml, /data-latex="x = 1"/);

  const diagramHtml = renderMarkdown(" \t```mermaid\n \tflowchart LR\n \t```", {
    settings,
    outline: [],
  });
  assert.doesNotMatch(diagramHtml, /diagram-box|mermaid-diagram/);
  assert.match(diagramHtml, /<pre><code>/);
});

test("块与连续编辑路径保留四列缩进代码语义", () => {
  const indentedDiagram = " \t```mermaid\n \tflowchart LR\n \t```";
  assert.equal(isMarkdownFencedMathBlock(" \t```math\n \tx = 1\n \t```"), false);
  assert.equal(splitMarkdownBlocks(indentedDiagram)[0]?.type, "code");
  assert.equal(getContinuousDiagramLanguage(indentedDiagram), null);
  assert.ok(getContinuousPreviewBlocks(indentedDiagram).some((block) => block.kind === "code"));
  assert.ok(getContinuousPreviewBlocks(indentedDiagram).every((block) => block.kind !== "diagram"));

  const line = getContinuousMarkdownLinePresentations(" \t$$\n \tx = 1", 0)[0];
  assert.equal(line?.kind, "code");
});

test("连续编辑与原始块编辑支持列表数学和可变引用前导空格", () => {
  const listMath = "- $$\n  x = 1\n  $$";
  assert.ok(getContinuousPreviewBlocks(listMath).some((block) => block.kind === "math"));
  const listSelection = getRawBlockSelection({
    value: listMath,
    selectionStart: listMath.indexOf("x"),
    selectionEnd: listMath.indexOf("x"),
  });
  assert.equal(listSelection?.kind, "math");

  const quotedMath = " > $$\n> x = 1\n> $$";
  const quotedSelection = getRawBlockSelection({
    value: quotedMath,
    selectionStart: quotedMath.indexOf("x"),
    selectionEnd: quotedMath.indexOf("x"),
  });
  assert.equal(quotedSelection?.kind, "math");
  assert.equal(quotedSelection?.closed, true);
});

test("默认代码语言和 Enter 不响应四列缩进的伪围栏", () => {
  const code = " \t``";
  assert.equal(applyDefaultCodeLanguageOnFenceKey({
    value: code,
    selectionStart: code.length,
    selectionEnd: code.length,
  }, "`", "typescript"), null);

  const math = " \t$$";
  assert.equal(continueMarkdownBlock({
    value: math,
    selectionStart: math.length,
    selectionEnd: math.length,
  }), null);
});

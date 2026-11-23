import assert from "node:assert/strict";
import test from "node:test";
import {
  getGraphemeBoundaries,
  mapRenderedTextBoundariesToSource,
  mapRenderedTextOffsetToSource,
  mapUnwrappedTextOffsetToSource,
  snapTextOffsetToGraphemeBoundary,
} from "../src/utils/renderedTextOffset";

test("按 grapheme 返回 Emoji、组合字符和 ZWJ 序列边界", () => {
  const value = "A😀é👨‍👩‍👧‍👦B";

  assert.deepEqual(getGraphemeBoundaries(value), [0, 1, 3, 5, 16, 17]);
  assert.equal(snapTextOffsetToGraphemeBoundary(value, 2), 3);
  assert.equal(snapTextOffsetToGraphemeBoundary(value, 4), 5);
  assert.equal(snapTextOffsetToGraphemeBoundary(value, 8), 5);
});

test("Intl.Segmenter 不可用时合并常见 grapheme 扩展序列", () => {
  const intl = Intl as typeof Intl & { Segmenter?: unknown };
  const descriptor = Object.getOwnPropertyDescriptor(intl, "Segmenter");
  Object.defineProperty(intl, "Segmenter", {
    configurable: true,
    value: undefined,
  });
  try {
    assert.deepEqual(
      getGraphemeBoundaries("é✌️👍🏽👨‍👩‍👧‍👦"),
      [0, 2, 4, 8, 19],
    );
  } finally {
    if (descriptor) Object.defineProperty(intl, "Segmenter", descriptor);
    else Reflect.deleteProperty(intl, "Segmenter");
  }
});

test("长渲染文本一次生成完整源码边界", () => {
  const visible = "alpha ".repeat(800);
  const source = `<span>${visible}</span>`;
  const boundaries = mapRenderedTextBoundariesToSource(source, visible, "html");

  assert.equal(boundaries.length, visible.length + 1);
  assert.equal(boundaries[0], "<span>".length);
  assert.equal(boundaries[visible.length], source.indexOf("</span>"));
});

test("行内代码点击位置跳过反引号和边缘空格", () => {
  const source = "`` alpha beta ``";

  assert.equal(
    mapRenderedTextOffsetToSource(source, "alpha beta", 7),
    source.indexOf("beta") + 1,
  );
  assert.equal(
    mapRenderedTextOffsetToSource(source, "alpha beta", "alpha beta".length),
    source.indexOf("beta") + "beta".length,
  );
});

test("Emoji 和智能标点按渲染边界映射完整源码", () => {
  assert.equal(mapRenderedTextOffsetToSource(":smile:", "😄", 0), 0);
  assert.equal(mapRenderedTextOffsetToSource(":smile:", "😄", "😄".length), 7);
  assert.equal(mapRenderedTextOffsetToSource("--", "–", 0), 0);
  assert.equal(mapRenderedTextOffsetToSource("--", "–", 1), 2);
});

test("缩写正文保持逐字符点击位置", () => {
  assert.equal(mapRenderedTextOffsetToSource("HTML", "HTML", 2), 2);
});

test("isolated HTML entities map both visible boundaries to complete source boundaries", () => {
  assert.equal(mapRenderedTextOffsetToSource("&amp;", "&", 0, "markdown-visible"), 0);
  assert.equal(
    mapRenderedTextOffsetToSource("&amp;", "&", 1, "markdown-visible"),
    "&amp;".length,
  );
});

test("空格目标链接按实体和 Emoji 的完整源码边界定位", () => {
  const source = "[A &amp; B :smile: C](foo bar)";
  const rendered = "A & B 😄 C";
  const entityStart = source.indexOf("&amp;");
  const emojiStart = source.indexOf(":smile:");
  const renderedEntity = rendered.indexOf("&");
  const renderedEmoji = rendered.indexOf("😄");

  assert.equal(
    mapRenderedTextOffsetToSource(source, rendered, renderedEntity, "markdown-visible"),
    entityStart,
  );
  assert.equal(
    mapRenderedTextOffsetToSource(source, rendered, renderedEntity + 1, "markdown-visible"),
    entityStart + "&amp;".length,
  );
  assert.equal(
    mapRenderedTextOffsetToSource(source, rendered, renderedEmoji, "markdown-visible"),
    emojiStart,
  );
  assert.equal(
    mapRenderedTextOffsetToSource(source, rendered, renderedEmoji + 1, "markdown-visible"),
    emojiStart,
  );
  assert.equal(
    mapRenderedTextOffsetToSource(source, rendered, renderedEmoji + "😄".length, "markdown-visible"),
    emojiStart + ":smile:".length,
  );
});

test("行内 HTML 点击位置排除标签、属性并还原实体", () => {
  const source = '<span title="span">alpha <strong>span</strong> &amp; end</span>';
  const rendered = "alpha span & end";

  assert.equal(
    mapRenderedTextOffsetToSource(source, rendered, rendered.indexOf("span") + 2, "html"),
    source.indexOf("span</strong>") + 2,
  );
  assert.equal(
    mapRenderedTextOffsetToSource(source, rendered, rendered.indexOf("&") + 1, "html"),
    source.indexOf("&amp;") + "&amp;".length,
  );
});

test("引用和列表前缀不参与可见文本偏移", () => {
  const source = "> alpha\n>   beta\n> beta";
  const unwrapped = "alpha\n  beta\nbeta";
  const secondBeta = unwrapped.lastIndexOf("beta") + 2;

  assert.equal(
    mapUnwrappedTextOffsetToSource(source, unwrapped, secondBeta),
    source.lastIndexOf("beta") + 2,
  );
});

test("CRLF 代码内容按第二行字符边界映射回带前缀源码", () => {
  const source = "    repeat\r\n    repeat";
  const unwrapped = "repeat\r\nrepeat";
  const secondRepeat = unwrapped.lastIndexOf("repeat") + 3;

  assert.equal(
    mapUnwrappedTextOffsetToSource(source, unwrapped, secondRepeat),
    source.lastIndexOf("repeat") + 3,
  );
});
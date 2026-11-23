import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdownCodeSpanText } from "../src/utils/codeSpan";

test("renderMarkdownCodeSpanText 移除围栏并保留普通内容", () => {
  assert.equal(renderMarkdownCodeSpanText("`code`"), "code");
  assert.equal(renderMarkdownCodeSpanText("``code ` value``"), "code ` value");
});

test("renderMarkdownCodeSpanText 按 CommonMark 规则处理边缘空格", () => {
  assert.equal(renderMarkdownCodeSpanText("`` code ``"), "code");
  assert.equal(renderMarkdownCodeSpanText("``  code  ``"), " code ");
  assert.equal(renderMarkdownCodeSpanText("``   ``"), "   ");
});

test("renderMarkdownCodeSpanText 将代码跨度换行归一化为空格", () => {
  assert.equal(renderMarkdownCodeSpanText("`line one\nline two`"), "line one line two");
  assert.equal(renderMarkdownCodeSpanText("`` line one\r\nline two ``"), "line one line two");
});

test("renderMarkdownCodeSpanText 拒绝不完整或不对称围栏", () => {
  assert.equal(renderMarkdownCodeSpanText("code"), null);
  assert.equal(renderMarkdownCodeSpanText("``code`"), null);
});

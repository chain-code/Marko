import test from "node:test";
import assert from "node:assert/strict";
import { isMarkdownTocLine } from "../src/utils/tocSyntax";

test("isMarkdownTocLine 识别 Typora 支持的独立目录标记", () => {
  for (const source of [
    "[TOC]",
    "[toc]",
    "   [ToC]\t",
    "{:toc}",
    " {: toc}",
    "  {: toc depth=3 min-level=2 }",
    "[[_TOC_]]",
    "  [[_toc_]]\r\n",
  ]) {
    assert.equal(isMarkdownTocLine(source), true, source);
  }
});

test("isMarkdownTocLine 拒绝缩进代码、行内和未闭合目录标记", () => {
  for (const source of [
    "    [TOC]",
    "\t[TOC]",
    "Text [TOC]",
    "[TOC] trailing",
    "{: toc",
    "{: toc depth=3 } trailing",
    "{: topology}",
    "{:toc-depth}",
    "[[_TOC_]] trailing",
    "[[_TOC_]",
    "{: toc\ndepth=3 }",
  ]) {
    assert.equal(isMarkdownTocLine(source), false, source);
  }
});

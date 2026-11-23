import test from "node:test";
import assert from "node:assert/strict";
import { getContinuousPreviewBlocks } from "../src/utils/continuousEditor";
import {
  collectMarkdownAbbreviationDefinitions,
  collectMarkdownAbbreviations,
  getMarkdownAbbreviationMatches,
} from "../src/utils/markdown";

test("连续编辑器将普通、宽松和引用内定义列表识别为语义预览块", () => {
  const source = [
    "术语",
    ": 第一条定义",
    ": 第二条定义",
    "",
    "宽松术语",
    ": 第一段",
    "",
    "    第二段",
    "",
    "> 引用术语",
    "> : 引用定义",
  ].join("\n");
  const definitions = getContinuousPreviewBlocks(source).filter((block) => block.kind === "definition");

  assert.equal(definitions.length, 3);
  assert.match(definitions[0]?.source ?? "", /: 第二条定义/);
  assert.match(definitions[1]?.source ?? "", /第二段/);
  assert.match(definitions[2]?.source ?? "", /^> 引用术语/);
});

test("缩写定义收集保留源码范围，并忽略 Front Matter、代码和 HTML 块", () => {
  const source = [
    "---",
    "*[META]: 元数据",
    "---",
    "",
    "*[HTML]: Hyper Text Markup Language",
    "> *[CSS]: Cascading Style Sheets",
    "",
    "```md",
    "*[CODE]: 代码",
    "```",
    "",
    "<div>",
    "*[DOM]: 文档对象模型",
    "</div>",
  ].join("\n");
  const definitions = collectMarkdownAbbreviationDefinitions(source);

  assert.deepEqual(definitions.map(({ label, title }) => ({ label, title })), [
    { label: "HTML", title: "Hyper Text Markup Language" },
    { label: "CSS", title: "Cascading Style Sheets" },
  ]);
  for (const definition of definitions) {
    assert.match(source.slice(definition.from, definition.to), new RegExp(`\\*\\[${definition.label}]`));
  }
});

test("缩写匹配遵守单词边界并优先返回较长标签", () => {
  const abbreviations = collectMarkdownAbbreviations([
    "*[HTML]: Hyper Text Markup Language",
    "*[HTML5]: Hyper Text Markup Language 5",
    "*[C++]: C Plus Plus",
  ].join("\n"));
  const matches = getMarkdownAbbreviationMatches("HTML HTML5 XHTML C++ C++17", abbreviations);

  assert.deepEqual(matches.map((match) => match.label), ["HTML", "HTML5", "C++"]);
  assert.deepEqual(matches.map((match) => "HTML HTML5 XHTML C++ C++17".slice(match.start, match.end)), [
    "HTML",
    "HTML5",
    "C++",
  ]);
});

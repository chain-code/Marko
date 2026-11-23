import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  transformSequenceGrammarForBrowser,
  transformSequenceRaphaelDrawerForBrowser,
} from "../scripts/vite-sequence-grammar";

const grammarPath = resolve(
  "node_modules/@hackmd/js-sequence-diagrams/dist/parser/grammar.js",
);
const raphaelDrawerPath = resolve(
  "node_modules/@hackmd/js-sequence-diagrams/dist/painter/drawer/RaphaelDrawer.js",
);

test("Sequence grammar 浏览器转换移除 Node CLI 尾部并导出解析器", () => {
  const transformed = transformSequenceGrammarForBrowser(readFileSync(grammarPath, "utf8"));

  assert.doesNotMatch(transformed, /require\(['"](?:fs|path)['"]\)/);
  assert.doesNotMatch(transformed, /require\.main/);
  assert.match(transformed, /export const parser = grammar;/);
  assert.match(transformed, /export function parse\(\)/);
});

test("Sequence grammar 依赖结构变化时立即阻止静默构建", () => {
  const source = readFileSync(grammarPath, "utf8")
    .replace("require.main === module", "module === require.main");

  assert.throws(
    () => transformSequenceGrammarForBrowser(source),
    /Node CLI 尾部结构已变化/,
  );
});

test("Sequence Raphael 绘制器使用模块内词法依赖", () => {
  const transformed = transformSequenceRaphaelDrawerForBrowser(
    readFileSync(raphaelDrawerPath, "utf8"),
  );

  assert.match(transformed, /^import Raphael from "raphael";\r?\n/);
  assert.equal(transformed.match(/import Raphael from "raphael";/g)?.length, 1);
  assert.match(transformed, /Raphael\.fn\.line = function/);
  assert.match(transformed, /this\.paper = Raphael\(container, 300, 200\);/);
});

test("Sequence Raphael 绘制器依赖结构变化时立即阻止静默构建", () => {
  const source = readFileSync(raphaelDrawerPath, "utf8")
    .replace("Raphael.fn.line = function", "Raphael.fn.segment = function");

  assert.throws(
    () => transformSequenceRaphaelDrawerForBrowser(source),
    /Raphael 全局依赖结构已变化/,
  );
});

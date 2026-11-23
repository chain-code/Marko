import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const englishReadme = readFileSync(resolve("README.md"), "utf8");
const chineseReadme = readFileSync(resolve("README.zh-CN.md"), "utf8");
const latestReleaseUrl = "https://github.com/chain-code/Marko/releases/latest";
const showcaseAssets = [
  ".github/assets/marko-hero.webp",
  ".github/assets/marko-diagram-viewer.gif",
];

test("中英文 README 提供互相切换的语言链接", () => {
  assert.match(
    englishReadme,
    /(?:<a href="\.\/README\.zh-CN\.md">(?:<strong>)?简体中文(?:<\/strong>)?<\/a>|\[简体中文\]\(\.\/README\.zh-CN\.md\))/,
  );
  assert.match(
    chineseReadme,
    /(?:<a href="\.\/README\.md">(?:<strong>)?English(?:<\/strong>)?<\/a>|\[English\]\(\.\/README\.md\))/i,
  );
});

test("中英文 README 均指向最新 GitHub Release", () => {
  assert.ok(englishReadme.includes(latestReleaseUrl));
  assert.ok(chineseReadme.includes(latestReleaseUrl));
});

test("中英文 README 均引用主界面与图表查看演示资源", () => {
  for (const asset of showcaseAssets) {
    assert.ok(englishReadme.includes(asset), `README.md 未引用 ${asset}`);
    assert.ok(chineseReadme.includes(asset), `README.zh-CN.md 未引用 ${asset}`);
  }
});

test("中英文 README 单独介绍图表大图查看器", () => {
  assert.match(englishReadme, /^##+\s+.*diagram viewer.*$/im);
  assert.match(englishReadme, /double[- ]click[\s\S]{0,200}(?:zoom|pan)/i);
  assert.match(chineseReadme, /^##+\s+.*图表.*(?:查看|放大).*$/m);
  assert.match(chineseReadme, /双击[\s\S]{0,200}(?:缩放|拖动|平移)/);
});

test("README 演示资源存在且非空", () => {
  for (const asset of showcaseAssets) {
    const assetPath = resolve(asset);
    assert.ok(existsSync(assetPath), `${asset} 不存在`);
    assert.ok(statSync(assetPath).isFile(), `${asset} 不是文件`);
    assert.ok(statSync(assetPath).size > 0, `${asset} 为空文件`);
  }
});

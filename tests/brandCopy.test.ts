import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sampleDocumentSource = readFileSync(resolve("src/data/sampleDocument.ts"), "utf8");
const settingsPanelSource = readFileSync(resolve("src/components/SettingsPanel.vue"), "utf8");

test("面向用户的产品文案保持独立的 Marko 品牌表达", () => {
  assert.match(sampleDocumentSource, /Marko 提供所见即所得的连续编辑体验/);
  assert.doesNotMatch(sampleDocumentSource, /模拟 Typora 编辑体验/);
  assert.match(settingsPanelSource, /<small>按分钟定期写入磁盘<\/small>/);
  assert.doesNotMatch(settingsPanelSource, /与 Typora 一样按分钟定期写入磁盘/);
});

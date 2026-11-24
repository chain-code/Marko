// @marko/render/vite：js-sequence-diagrams 的浏览器兼容转换（从旧项目 tests/sequenceGrammarBrowser.test.ts 搬来）
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { transformSequenceGrammar, transformSequenceRaphaelDrawer } from "../vite/sequenceDiagrams.ts";

// jsdom 环境里 import.meta.url 不是 file: 地址；测试总是在 packages/render 下跑
const require = createRequire(join(process.cwd(), "package.json"));
const grammar = readFileSync(require.resolve("@hackmd/js-sequence-diagrams/dist/parser/grammar.js"), "utf8");
const drawer = readFileSync(require.resolve("@hackmd/js-sequence-diagrams/dist/painter/drawer/RaphaelDrawer.js"), "utf8");

describe("js-sequence-diagrams 的浏览器兼容转换", () => {
  it("grammar.js：去掉 CommonJS 命令行入口，改成 ESM 导出", () => {
    const transformed = transformSequenceGrammar(grammar);
    expect(transformed).not.toMatch(/require\(['"](?:fs|path)['"]\)/);
    expect(transformed).not.toMatch(/require\.main/);
    expect(transformed).toContain("export const parser = grammar;");
    expect(transformed).toContain("export function parse()");
  });

  it("grammar.js 结构变了就让构建失败", () => {
    expect(() => transformSequenceGrammar(grammar.replace("require.main === module", "module === require.main"))).toThrow(/grammar\.js 结尾结构变了/);
  });

  it("RaphaelDrawer.js：补上 Raphael 的 import，只补一次", () => {
    const transformed = transformSequenceRaphaelDrawer(drawer);
    expect(transformed.startsWith('import Raphael from "raphael";\n')).toBe(true);
    expect(transformed.match(/import Raphael from "raphael";/g)).toHaveLength(1);
  });

  it("RaphaelDrawer.js 结构变了就让构建失败", () => {
    expect(() => transformSequenceRaphaelDrawer(drawer.replace("Raphael.fn.line = function", "Raphael.fn.segment = function"))).toThrow(/RaphaelDrawer\.js 结构变了/);
  });
});

// 打包图表沙箱（@marko/render/sandbox）要用的 Vite 插件，从旧项目的 scripts/vite-sequence-grammar.ts 搬来。
// @hackmd/js-sequence-diagrams 是 ESM，但有两处在浏览器里跑不了：
// - parser/grammar.js 是 jison 生成的 CommonJS，末尾的命令行入口用到 require('fs')、require.main，
//   Rollup 转换后会留下裸的 require，一运行就报「require is not defined」；换成 ESM 导出。
// - painter/drawer/RaphaelDrawer.js 用的是全局变量 Raphael；补上 import，不用往 window 上挂。
// 两处都先核对原文的特征，库升级后结构变了就让构建直接失败，而不是悄悄打出坏的包。
import type { Plugin } from "vite";

const GRAMMAR_SUFFIX = "/@hackmd/js-sequence-diagrams/dist/parser/grammar.js";
const RAPHAEL_DRAWER_SUFFIX = "/@hackmd/js-sequence-diagrams/dist/painter/drawer/RaphaelDrawer.js";
const CLI_FOOTER_START = "if (typeof require !== 'undefined' && typeof exports !== 'undefined') {";
const CLI_FOOTER_SIGNALS = ["require('fs')", "require('path')", "require.main === module"];
const RAPHAEL_DRAWER_SIGNALS = ["Raphael.fn.line = function", "this.paper = Raphael(container, 300, 200);"];

/** 去掉 grammar.js 末尾的 CommonJS 命令行入口，改成 ESM 导出 */
export function transformSequenceGrammar(source: string): string {
  const footerOffset = source.indexOf(CLI_FOOTER_START);
  const unique = footerOffset >= 0 && source.indexOf(CLI_FOOTER_START, footerOffset + CLI_FOOTER_START.length) < 0;
  const footer = footerOffset >= 0 ? source.slice(footerOffset) : "";
  if (!unique || !CLI_FOOTER_SIGNALS.every((signal) => footer.includes(signal)) || !footer.trimEnd().endsWith("}")) {
    throw new Error("js-sequence-diagrams 的 grammar.js 结尾结构变了，请更新 @marko/render/vite 里的转换");
  }
  return [
    source.slice(0, footerOffset).trimEnd(),
    "export const parser = grammar;",
    "export const Parser = grammar.Parser;",
    "export function parse() { return grammar.parse.apply(grammar, arguments); }",
    "",
  ].join("\n");
}

/** 给 RaphaelDrawer.js 补上 Raphael 的 import */
export function transformSequenceRaphaelDrawer(source: string): string {
  if (!RAPHAEL_DRAWER_SIGNALS.every((signal) => source.includes(signal))) {
    throw new Error("js-sequence-diagrams 的 RaphaelDrawer.js 结构变了，请更新 @marko/render/vite 里的转换");
  }
  return `import Raphael from "raphael";\n${source}`;
}

export function sequenceDiagramsPlugin(): Plugin {
  return {
    name: "marko-sequence-diagrams",
    enforce: "pre",
    transform(source, id) {
      const path = (id.split("?", 1)[0] ?? "").replace(/\\/g, "/");
      if (path.endsWith(GRAMMAR_SUFFIX)) return { code: transformSequenceGrammar(source), map: null };
      if (path.endsWith(RAPHAEL_DRAWER_SUFFIX)) return { code: transformSequenceRaphaelDrawer(source), map: null };
      return null;
    },
  };
}

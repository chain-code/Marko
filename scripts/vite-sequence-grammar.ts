import type { Plugin } from "vite";

const sequenceGrammarSuffix = "/@hackmd/js-sequence-diagrams/dist/parser/grammar.js";
const sequenceRaphaelDrawerSuffix = "/@hackmd/js-sequence-diagrams/dist/painter/drawer/RaphaelDrawer.js";
const nodeCliFooterStart = "if (typeof require !== 'undefined' && typeof exports !== 'undefined') {";
const nodeCliFooterSignals = [
  "require('fs')",
  "require('path')",
  "require.main === module",
];
const raphaelDrawerSignals = [
  "Raphael.fn.line = function",
  "this.paper = Raphael(container, 300, 200);",
];

export function transformSequenceGrammarForBrowser(source: string): string {
  const footerOffset = source.indexOf(nodeCliFooterStart);
  const footerIsUnique = footerOffset >= 0
    && source.indexOf(nodeCliFooterStart, footerOffset + nodeCliFooterStart.length) < 0;
  const footer = footerOffset >= 0 ? source.slice(footerOffset) : "";

  if (
    !footerIsUnique
    || !nodeCliFooterSignals.every((signal) => footer.includes(signal))
    || !footer.trimEnd().endsWith("}")
  ) {
    throw new Error("Sequence grammar 的 Node CLI 尾部结构已变化，请更新浏览器兼容转换");
  }

  return [
    source.slice(0, footerOffset).trimEnd(),
    "export const parser = grammar;",
    "export const Parser = grammar.Parser;",
    "export function parse() { return grammar.parse.apply(grammar, arguments); }",
    "",
  ].join("\n");
}

export function transformSequenceRaphaelDrawerForBrowser(source: string): string {
  if (!raphaelDrawerSignals.every((signal) => source.includes(signal))) {
    throw new Error("Sequence 绘制器的 Raphael 全局依赖结构已变化，请更新浏览器兼容转换");
  }

  return `import Raphael from "raphael";\n${source}`;
}

export function sequenceGrammarBrowserPlugin(): Plugin {
  return {
    name: "sequence-diagram-browser-compat",
    enforce: "pre",
    transform(source, id) {
      const normalizedId = id.split("?", 1)[0]?.replace(/\\/g, "/") ?? "";
      if (normalizedId.endsWith(sequenceGrammarSuffix)) {
        return {
          code: transformSequenceGrammarForBrowser(source),
          map: null,
        };
      }
      if (normalizedId.endsWith(sequenceRaphaelDrawerSuffix)) {
        return {
          code: transformSequenceRaphaelDrawerForBrowser(source),
          map: null,
        };
      }
      return null;
    },
  };
}

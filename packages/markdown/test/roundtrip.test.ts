// E-1：打开后不改就保存，逐字节不变（阶段 2 验收：test/corpus/ 全部无损）
import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.ts";
import { serialize } from "../src/serialize.ts";
import { corpusCases } from "./corpus.ts";

const cases = corpusCases();

const allSyntax = { highlight: true, superscript: true, subscript: true };
const noExtensions = {
  html: false,
  toc: false,
  mermaid: false,
  flowchart: false,
  sequence: false,
  math: false,
  footnotes: false,
  callout: false,
  emoji: false,
  autolink: false,
};

describe("E-1 无损：解析后直接序列化，逐字节不变", () => {
  it.each(cases.map((testCase) => [testCase.name, testCase.source]))("%s", (_name, source) => {
    expect(serialize(parse(source))).toBe(source);
    expect(serialize(parse(source, { syntax: allSyntax }))).toBe(source);
    expect(serialize(parse(source, { syntax: noExtensions }))).toBe(source);
  });
});

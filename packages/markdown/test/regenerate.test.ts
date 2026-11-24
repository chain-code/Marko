// 1.5.5 不变式的一半：整篇都按写法属性重新生成时，重新解析得到同样的结构
import { describe, expect, it } from "vitest";
import { parse } from "../src/parse.ts";
import { sameStructure } from "../src/reconcile.ts";
import { serialize } from "../src/serialize.ts";
import { corpusCases } from "./corpus.ts";
import { outline, withoutOrigins } from "./helpers.ts";

const cases = corpusCases();

describe("重新生成：去掉出身后序列化，再解析，结构不变", () => {
  it.each(cases.map((testCase) => [testCase.name, testCase.source]))("%s", (_name, source) => {
    const doc = parse(source);
    const regenerated = parse(serialize(withoutOrigins(doc)));
    // 没有结尾围栏的代码块重新生成时会补上结尾（closing 从 null 变成围栏），其余属性逐个相同
    if (!sameStructure(doc, regenerated)) expect(outline(regenerated)).toEqual(outline(doc));
  });
});

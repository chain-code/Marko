// 规格解析器自己的测试：952 条都能读出来，各种操作都认得
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSpecs, markText, parseMarkedText, parseOperation } from "./spec.ts";

const directory = join(resolve(process.cwd(), "..", ".."), "test", "behavior");

describe("行为规格的解析", () => {
  it("读出 test/behavior 下的全部规格", () => {
    const specs = loadSpecs(directory);
    expect(specs.length).toBe(952);
    const kinds = new Map<string, number>();
    for (const spec of specs) kinds.set(spec.op.kind, (kinds.get(spec.op.kind) ?? 0) + 1);
    expect([...kinds.keys()].sort()).toEqual(["command", "input", "key", "paste"]);
  });

  it("光标、正向和反向选区、回车符", () => {
    expect(parseMarkedText("a‸b")).toEqual({ value: "ab", anchor: 1, head: 1 });
    expect(parseMarkedText("⟦ab⟧c")).toEqual({ value: "abc", anchor: 0, head: 2 });
    expect(parseMarkedText("⟧ab⟦c")).toEqual({ value: "abc", anchor: 2, head: 0 });
    expect(parseMarkedText("a␍\n‸")).toEqual({ value: "a\r\n", anchor: 3, head: 3 });
    for (const marked of ["a‸b", "⟦ab⟧c", "⟧ab⟦c", "a␍\n‸"]) expect(markText(parseMarkedText(marked))).toBe(marked);
  });

  it("各种操作", () => {
    expect(parseOperation("`Enter`（Markdown 缩进宽度 4）")).toEqual({ op: { kind: "key", key: "Enter" }, note: "Markdown 缩进宽度 4" });
    expect(parseOperation("``Ctrl+Shift+` ``").op).toEqual({ kind: "key", key: "Ctrl+Shift+`" });
    expect(parseOperation('输入 "# "').op).toEqual({ kind: "input", text: "# " });
    expect(parseOperation('命令 setImageWidth("60%")').op).toEqual({ kind: "command", name: "setImageWidth", args: ["60%"] });
    expect(parseOperation('命令 codeBlock（语言 "ts"）')).toEqual({ op: { kind: "command", name: "codeBlock", args: [] }, note: '语言 "ts"' });
    expect(parseOperation('粘贴，text = "标题\\n内容"，html = "<b>x</b>"').op).toEqual({ kind: "paste", text: "标题\n内容", html: "<b>x</b>", plain: false });
    expect(parseOperation('粘贴为纯文本，text = "a\\tb"').op).toEqual({ kind: "paste", text: "a\tb", plain: true });
  });
});

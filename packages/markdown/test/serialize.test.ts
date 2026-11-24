// E-1：改了某一块，其他块逐字节不变；改过的块沿用原来的写法，块里没改的行沿用原来的前缀。T-7：表格只重写改过的行。
// 1.5.4：新建的块用默认写法
import { describe, expect, it } from "vitest";
import { blockChildren, getOrigin, makeContainer, makeLeaf, type MdNode } from "../src/model.ts";
import { parse } from "../src/parse.ts";
import { buildSourceMap, locateSource, sourceOffset } from "../src/positions.ts";
import { applyReplacement, reconcile } from "../src/reconcile.ts";
import { serialize } from "../src/serialize.ts";
import { insertAt, nodeAt, replaceAt, withAttrs, withText, type Path } from "./edits.ts";

/** 改 path 处叶子块的文字后序列化 */
function editText(source: string, path: Path, edit: (text: string) => string): string {
  const doc = parse(source);
  const next = replaceAt(doc, path, (old) => [withText(old, edit((old.content?.[0] as { text?: string })?.text ?? ""))]);
  return serialize(next);
}

function editAttrs(source: string, path: Path, attrs: Record<string, unknown>): string {
  return serialize(replaceAt(parse(source), path, (old) => [withAttrs(old, attrs)]));
}

describe("E-1 改一处只影响那一块", () => {
  it("其他块、块之间的空行、换行符、BOM、末尾都不变", () => {
    const source = "\uFEFF# T\r\n\r\n\r\npara  one\r\n\r\n* a\r\n* b\r\n\r\n> q\r\n";
    expect(editText(source, [1], (text) => text + "!")).toBe("\uFEFF# T\r\n\r\n\r\npara  one!\r\n\r\n* a\r\n* b\r\n\r\n> q\r\n");
  });

  it("改过的块用文件里出现最多的换行符", () => {
    const source = "a\r\nb\r\n\r\nc\n";
    expect(editText(source, [0], (text) => text + "\nnew")).toBe("a\r\nb\r\nnew\r\n\r\nc\n");
  });

  it("只用 \\r 换行的文件：改引用里的一行，别的行原样", () => {
    expect(editText("> a\r>  b\r> c\r\rd", [0, 0], (text) => text.replace("c", "C"))).toBe("> a\r>  b\r> C\r\rd");
  });

  it("引用、列表里改一行，别的行的前缀（含懒惰续行、不规则的 >）不变", () => {
    expect(editText(">  one\n>two\nlazy\n> four", [0, 0], (text) => text.replace("two", "TWO"))).toBe(">  one\n>TWO\nlazy\n> four");
    expect(editText("- a\n   b\n- c", [0, 0, 0], (text) => text + "!")).toBe("- a\n   b!\n- c");
  });

  it("新加的行用这一块的规范前缀", () => {
    expect(editText("> a\n> b", [0, 0], (text) => text + "\nc")).toBe("> a\n> b\n> c");
    expect(editText("1. a\n2. b", [0, 1, 0], (text) => text + "\nc")).toBe("1. a\n2. b\n   c");
  });

  it("强调字符、链接写法是文字的一部分，原样保留", () => {
    expect(editText("__x__ _y_ [a][r]\n\n[r]: /u", [0], (text) => "z " + text)).toBe("z __x__ _y_ [a][r]\n\n[r]: /u");
  });
});

describe("E-1 改过的块沿用写法", () => {
  it("标题：ATX 的结尾 #、Setext 的下划线；改到三级以下时 Setext 换成 ATX（B-2）", () => {
    expect(editText("## Title ##", [0], () => "New")).toBe("## New ##");
    expect(editText("Title\n=====", [0], () => "New")).toBe("New\n=====");
    expect(editAttrs("Title\n=====", [0], { level: 2 })).toBe("Title\n---");
    expect(editAttrs("Title\n---", [0], { level: 3 })).toBe("### Title");
    expect(editAttrs("# Title", [0], { level: 4 })).toBe("#### Title");
  });

  it("代码块：围栏字符和长度、信息串、缩进保留；改语言只改信息串（B-6）", () => {
    expect(editText("~~~~ js  \ncode\n~~~~", [0], () => "changed")).toBe("~~~~ js  \nchanged\n~~~~");
    expect(editAttrs("```js\ncode\n```", [0], { info: "ts" })).toBe("```ts\ncode\n```");
    expect(editText("  ```\n  a\n  ```", [0], (text) => text + "\nb")).toBe("  ```\n  a\n  b\n  ```");
    expect(editText("    code\n    more", [0], (text) => text + "\nnew")).toBe("    code\n    more\n    new");
  });

  it("内容里有和围栏一样长的围栏行时，围栏自动加长", () => {
    expect(editText("```\na\n```", [0], () => "```\ninner\n```")).toBe("````\n```\ninner\n```\n````");
  });

  it("公式块：分隔符的写法保留", () => {
    expect(editText("$$ {eq}\nx\n$$ {end}", [0], () => "y")).toBe("$$ {eq}\ny\n$$ {end}");
    expect(editText("\\[\nx\n\\]", [0], () => "y")).toBe("\\[\ny\n\\]");
  });

  it("列表：符号、序号分隔符、松紧、缩进宽度保留；勾选只改方括号里的那个字符（B-5）", () => {
    expect(editText("+ a\n+ b", [0, 1, 0], () => "B")).toBe("+ a\n+ B");
    expect(editText("1) a\n\n2) b", [0, 1, 0], () => "B")).toBe("1) a\n\n2) B");
    expect(editText("-   a\n\n    more", [0, 0, 1], () => "MORE")).toBe("-   a\n\n    MORE");
    expect(editAttrs("- [ ] task", [0, 0], { checked: true })).toBe("- [x] task");
    expect(editAttrs("- [X] task", [0, 0], { checked: false })).toBe("- [ ] task");
    expect(editAttrs("- task", [0, 0], { checked: false })).toBe("- [ ] task");
  });

  it("有序列表的序号变成两位数时，续行的缩进跟着变（内容缩进由符号宽度决定）", () => {
    expect(editAttrs("9. a\n   b", [0, 0], { marker: "10." })).toBe("10. a\n    b");
  });

  it("Callout 改种类只改标记", () => {
    expect(editAttrs("> [!NOTE]\n> body", [0], { kind: "warning", marker: "[!WARNING]" })).toBe("> [!WARNING]\n> body");
  });
});

describe("T-7 表格", () => {
  const table = "| a | b |\n|:--|--:|\n|  1|2 |\n| 3 | 4 |";

  it("没改过的行逐字节不变；改过的行按表头行的写法重写", () => {
    expect(editText(table, [0, 1, 0], () => "one")).toBe("| a | b |\n|:--|--:|\n| one | 2 |\n| 3 | 4 |");
  });

  it("改了对齐只改分隔行", () => {
    expect(editAttrs(table, [0], { align: ["center", "right"] })).toBe("| a | b |\n| :---: | ---: |\n|  1|2 |\n| 3 | 4 |");
  });

  it("新加的行用表头的写法；单元格里的换行写成 <br>（T-2）", () => {
    const doc = parse("a | b\n--|--\n1 | 2");
    const row = makeContainer("tableRow", {}, [makeLeaf("tableCell", {}, "x\ny"), makeLeaf("tableCell", {}, "z")]);
    expect(serialize(insertAt(doc, [0], 2, [row]))).toBe("a | b\n--|--\n1 | 2\nx<br>y | z");
  });
});

describe("1.5.4 新建的块用默认写法", () => {
  it("块与块之间一个空行；列表用 -；引用每行 > ", () => {
    const doc: MdNode = makeContainer("doc", { eol: "\n", bom: false }, [
      makeLeaf("heading", { level: 2 }, "Title"),
      makeLeaf("paragraph", { indent: "" }, "one\ntwo"),
      makeContainer("bulletList", { tight: true }, [
        makeContainer("listItem", { checked: null }, [makeLeaf("paragraph", {}, "a")]),
        makeContainer("listItem", { checked: false }, [makeLeaf("paragraph", {}, "b")]),
      ]),
      makeContainer("orderedList", { start: 3, delimiter: ")", tight: false }, [
        makeContainer("listItem", {}, [makeLeaf("paragraph", {}, "c")]),
        makeContainer("listItem", {}, [makeLeaf("paragraph", {}, "d")]),
      ]),
      makeContainer("blockquote", {}, [makeLeaf("paragraph", {}, "q1"), makeLeaf("paragraph", {}, "q2")]),
      makeLeaf("codeBlock", { info: "js" }, "x"),
      makeLeaf("horizontalRule", {}, ""),
      makeLeaf("mathBlock", {}, "y"),
    ]);
    expect(serialize(doc)).toBe("## Title\n\none\ntwo\n\n- a\n- [ ] b\n\n3) c\n\n4) d\n\n> q1\n>\n> q2\n\n```js\nx\n```\n\n---\n\n$$\ny\n$$");
  });

  it("空段落（回车后还没输入的）不输出，前后的块照旧", () => {
    const doc = parse("a\n\n\n\nb");
    const withBlank = insertAt(doc, [], 1, [makeLeaf("paragraph", { indent: "" }, "")]);
    expect(serialize(withBlank)).toBe("a\n\n\n\nb");
  });

  it("保存时插入末尾换行（S-3）", () => {
    expect(serialize(parse("a"), { finalNewline: true })).toBe("a\n");
    expect(serialize(parse("a\r\n\r\nb"), { finalNewline: true })).toBe("a\r\n\r\nb\r\n");
    expect(serialize(parse("a\n"), { finalNewline: true })).toBe("a\n");
  });
});

describe("1.5.5 重新解析", () => {
  it("在段落下一行输入 ===，段落变成一级标题（E-4）", () => {
    let doc = parse("para\n\nnext");
    doc = replaceAt(doc, [0], (old) => [withText(old, "para\n===")]);
    const replacement = reconcile(doc, 0, 1);
    expect(replacement).not.toBeNull();
    doc = applyReplacement(doc, replacement!);
    expect(blockChildren(doc).map((node) => [node.type, node.attrs?.level])).toEqual([
      ["heading", 1],
      ["paragraph", undefined],
    ]);
    expect(serialize(doc)).toBe("para\n===\n\nnext");
  });

  it("结构没变时返回 null，不换节点", () => {
    let doc = parse("a\n\nb");
    doc = replaceAt(doc, [1], (old) => [withText(old, "b!")]);
    expect(reconcile(doc, 1, 2)).toBeNull();
  });

  it("前后没变的块保留原来的节点，只换中间的", () => {
    let doc = parse("one\n\ntwo\n\nthree");
    const [first, , third] = blockChildren(doc);
    doc = replaceAt(doc, [1], (old) => [withText(old, "- two")]);
    const replacement = reconcile(doc, 1, 2)!;
    expect([replacement.from, replacement.to, replacement.blocks.map((node) => node.type)]).toEqual([1, 2, ["bulletList"]]);
    const thirdOrigin = { ...getOrigin(third)! };
    doc = applyReplacement(doc, replacement);
    expect(blockChildren(doc)[0]).toBe(first);
    // 后面那个块要接上新的前一个兄弟：换成带新出身的副本，原来的节点和它的出身不动（旧文档、撤销记录还在用）
    expect(blockChildren(doc)[2]).not.toBe(third);
    expect(blockChildren(doc)[2].content).toBe(third.content);
    expect(getOrigin(third)).toEqual(thirdOrigin);
    expect(getOrigin(blockChildren(doc)[2])?.prevId).toBe(getOrigin(blockChildren(doc)[1])?.id);
    expect(serialize(doc)).toBe("one\n\n- two\n\nthree");
  });
});

describe("1.5.6 位置换算", () => {
  it("叶子块文字里的偏移 ↔ 源码偏移，跨容器前缀、软换行", () => {
    const doc = parse("# T\n\n> - one\n>   two\n\n| a | b |\n|---|---|\n| c | d |");
    const map = buildSourceMap(doc);
    const paragraph = nodeAt(doc, [1, 0, 0, 0]);
    expect(sourceOffset(map, paragraph, 0)).toBe(map.text.indexOf("one"));
    expect(sourceOffset(map, paragraph, 4)).toBe(map.text.indexOf("two"));
    expect(locateSource(map, map.text.indexOf("two") + 1)).toMatchObject({ path: [1, 0, 0, 0], textOffset: 5 });
    const cell = nodeAt(doc, [2, 1, 1]);
    expect(sourceOffset(map, cell, 0)).toBe(map.text.indexOf("d |"));
    expect(locateSource(map, map.text.indexOf("d |"))).toMatchObject({ path: [2, 1, 1], textOffset: 0 });
  });

  it("改过的块重新生成后也能换算", () => {
    const doc = replaceAt(parse("> a\n> b"), [0, 0], (old) => [withText(old, "a\nB\nc")]);
    const map = buildSourceMap(doc);
    expect(map.text).toBe("> a\n> B\n> c");
    expect(sourceOffset(map, nodeAt(doc, [0, 0]), 4)).toBe(map.text.indexOf("c"));
  });
});

describe("E-1 新文档的换行符（S-3「默认换行符」）", () => {
  it("没有换行时用给的换行符；有换行时用文件里出现最多的那种", () => {
    expect(parse("", { eol: "\r\n" }).attrs?.eol).toBe("\r\n");
    expect(parse("only line", { eol: "\r\n" }).attrs?.eol).toBe("\r\n");
    expect(parse("a\nb\n", { eol: "\r\n" }).attrs?.eol).toBe("\n");
    expect(parse("a\r\nb\r\n").attrs?.eol).toBe("\r\n");
    expect(parse("").attrs?.eol).toBe("\n");
  });
});

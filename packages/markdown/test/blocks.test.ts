// 扩展语法的块结构（B-7、B-9、B-10、B-11、B-13、B-14、B-16 和 B-5、D-3）。期望从 tests/markdown.test.ts、
// tests/stats.test.ts、tests/tocSyntax.test.ts 等迁来：旧测试断言的是渲染出来的 HTML，这里断言同一件事在文档模型里的样子
import { describe, expect, it } from "vitest";
import { blockChildren, isLeaf, nodeText, type MdNode } from "../src/model.ts";
import { parse } from "../src/parse.ts";
import { serialize } from "../src/serialize.ts";

/** 结构的简写：类型、文字，以及少数几个关心的属性 */
function shape(node: MdNode): unknown {
  const keep: Record<string, unknown> = {};
  for (const key of ["level", "kind", "checked", "label", "info", "open", "close", "align", "markup"]) {
    if (node.attrs && key in node.attrs) keep[key] = node.attrs[key];
  }
  const base = Object.keys(keep).length ? { type: node.type, ...keep } : { type: node.type };
  if (isLeaf(node.type)) return { ...base, text: nodeText(node) };
  return { ...base, content: blockChildren(node).map(shape) };
}

const blocks = (source: string, syntax?: Parameters<typeof parse>[1]) => blockChildren(parse(source, syntax)).map(shape);
const types = (source: string, syntax?: Parameters<typeof parse>[1]) => blockChildren(parse(source, syntax)).map((node) => node.type);

describe("B-7 公式块", () => {
  it("$$ 和 \\[ 两种写法，前面可以缩进 1～3 格", () => {
    expect(blocks("$$\n\\frac{1}{2}\n$$")).toEqual([{ type: "mathBlock", open: "$$", close: "$$", text: "\\frac{1}{2}" }]);
    expect(blocks("\\[\na=b\n\\]")).toEqual([{ type: "mathBlock", open: "\\[", close: "\\]", text: "a=b" }]);
    // 结尾围栏这一行连同缩进记下来（重新生成时照写）；内容去掉和开头围栏一样多的缩进
    expect(blocks("  $$\n  x+y\n  $$\n\n    $not_math$")).toEqual([
      { type: "mathBlock", open: "$$", close: "  $$", text: "x+y" },
      { type: "codeBlock", info: "", text: "$not_math$" },
    ]);
  });

  it("没有结尾围栏时不是公式块（同旧实现和 Typora）", () => {
    expect(types("$$\nx = 1")).toEqual(["paragraph"]);
    expect(types("text\n$$")).toEqual(["paragraph"]);
    expect(types("$$\nx\n$$\n\n$$")).toEqual(["mathBlock", "paragraph"]);
  });

  it("Typora 的带标签写法 $$ {标签}，在引用、列表里也认", () => {
    const source = [
      "$$ {root tag}",
      "x = 1",
      "$$ {root close}",
      "",
      "> $$ {{quote tag}}",
      "> y = 2",
      "> $$ {quote close}",
      "",
      "- nested math",
      "  $$ {list tag}",
      "  z = 3",
      "  $$ {list close}",
    ].join("\n");
    expect(blocks(source)).toEqual([
      { type: "mathBlock", open: "$$ {root tag}", close: "$$ {root close}", text: "x = 1" },
      { type: "blockquote", content: [{ type: "mathBlock", open: "$$ {{quote tag}}", close: "$$ {quote close}", text: "y = 2" }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            checked: null,
            content: [
              { type: "paragraph", text: "nested math" },
              { type: "mathBlock", open: "$$ {list tag}", close: "$$ {list close}", text: "z = 3" },
            ],
          },
        ],
      },
    ]);
  });

  it("不合规的标签写法不是公式块", () => {
    for (const opening of ["$$ {}", "$$ {tag", "$$ {tag} ", "$$ {tag} trailing", "$$ tag"]) {
      expect(types(`${opening}\nx = 1\n$$`), opening).not.toContain("mathBlock");
    }
  });

  it("引用里的公式块；代码块里的 $$ 不是公式", () => {
    expect(blocks("> $$\n> x+y\n> $$\n\n> > \\[\n> > a=b\n> > \\]")).toEqual([
      { type: "blockquote", content: [{ type: "mathBlock", open: "$$", close: "$$", text: "x+y" }] },
      { type: "blockquote", content: [{ type: "blockquote", content: [{ type: "mathBlock", open: "\\[", close: "\\]", text: "a=b" }] }] },
    ]);
    expect(types("```\n$$\nx\n$$\n```")).toEqual(["codeBlock"]);
    expect(blocks(">     $not_math$ and \\(raw\\)\n>\n>     beta")).toEqual([
      { type: "blockquote", content: [{ type: "codeBlock", info: "", text: "$not_math$ and \\(raw\\)\n\nbeta" }] },
    ]);
  });

  it("列表项里的多行公式，内容去掉列表的缩进", () => {
    expect(blocks("- item\n  $$\n    a \\\\\n      b\n  $$")).toEqual([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            checked: null,
            content: [
              { type: "paragraph", text: "item" },
              { type: "mathBlock", open: "$$", close: "$$", text: "  a \\\\\n    b" },
            ],
          },
        ],
      },
    ]);
  });

  it("S-8 关掉公式时 $$ 是普通段落", () => {
    expect(types("$$\nx\n$$", { syntax: { math: false } })).toEqual(["paragraph"]);
  });

  it("GitLab 的 ```math 围栏是代码块，信息串是 math（显示成公式由渲染决定，阶段 3）", () => {
    expect(blocks("```math\nx + y\n```")).toEqual([{ type: "codeBlock", info: "math", text: "x + y" }]);
  });
});

describe("D-3、D-4 图表围栏", () => {
  it("mermaid、flow、sequence 是图表；S-8 关掉的那种按普通代码块", () => {
    expect(blocks("```mermaid\ngraph TD\n```\n\n```flow\nst=>start\n```\n\n```sequence\nA->B: hi\n```")).toEqual([
      { type: "diagram", kind: "mermaid", info: "mermaid", text: "graph TD" },
      { type: "diagram", kind: "flowchart", info: "flow", text: "st=>start" },
      { type: "diagram", kind: "sequence", info: "sequence", text: "A->B: hi" },
    ]);
    expect(types("```mermaid\ngraph TD\n```", { syntax: { mermaid: false } })).toEqual(["codeBlock"]);
  });
});

describe("B-9 Front Matter", () => {
  it("只在文档开头；结尾可以是 --- 或 ...；可以是空的；带 BOM 也认", () => {
    expect(blocks("---\ntitle: Draft\n---\n\nalpha beta")).toEqual([
      { type: "frontMatter", open: "---", close: "---", text: "title: Draft" },
      { type: "paragraph", text: "alpha beta" },
    ]);
    expect(blocks("---\r\ntitle: Draft\r\n...\r\n\r\nalpha")[0]).toEqual({ type: "frontMatter", open: "---", close: "...", text: "title: Draft" });
    expect(blocks("---\n...\n\nalpha")[0]).toEqual({ type: "frontMatter", open: "---", close: "...", text: "" });
    expect(blocks("---  \r\n--- \t\r\n\r\nalpha")[0]).toEqual({ type: "frontMatter", open: "---  ", close: "--- \t", text: "" });
    expect(types("\uFEFF---\ntitle: # Hidden\n---\n\n# Real")).toEqual(["frontMatter", "heading"]);
  });

  it("不在开头的 --- 是分隔线；没有结尾时不是 Front Matter", () => {
    expect(types("alpha\n\n---\n\nbeta\n\n---\n\ngamma")).toEqual(["paragraph", "horizontalRule", "paragraph", "horizontalRule", "paragraph"]);
    expect(types("---\ntitle: x")).not.toContain("frontMatter");
  });
});

describe("B-10 目录", () => {
  it("Typora 的全部独立写法，大小写不限，缩进 1～3 格；缩进 4 格是代码", () => {
    for (const marker of ["[TOC]", "[toc]", "[ToC]", "{:toc}", "[[_TOC_]]", "{: toc depth=3 }", "  [toc]"]) {
      expect(types(marker), marker).toEqual(["toc"]);
    }
    expect(types("  [toc]\n\n    [toc]")).toEqual(["toc", "codeBlock"]);
  });

  it("不完整、后面有别的字、和别的行连在一起的都不是", () => {
    for (const marker of ["    {:toc}", "{: toc", "{: toc } trailing", "[[_TOC_]] trailing", "[TOC]\nmore", "text\n[TOC]"]) {
      expect(types(marker), marker).not.toContain("toc");
    }
  });

  it("S-8 关掉目录时是普通段落", () => {
    expect(types("[TOC]", { syntax: { toc: false } })).toEqual(["paragraph"]);
  });
});

describe("B-11 脚注定义", () => {
  it("续行缩进 4 格，或懒惰续行；后面的标题不属于它", () => {
    expect(blocks("[^1]: detail\n    continuation")).toEqual([{ type: "footnoteDefinition", label: "1", content: [{ type: "paragraph", text: "detail\ncontinuation" }] }]);
    expect(blocks("[^1]: detail\ncontinued text")).toEqual([{ type: "footnoteDefinition", label: "1", content: [{ type: "paragraph", text: "detail\ncontinued text" }] }]);
    expect(types("[^1]: detail\n# Outside heading")).toEqual(["footnoteDefinition", "heading"]);
    expect(blocks("[^1]: First.\n\n    Second paragraph.\n\nOutside.")).toEqual([
      {
        type: "footnoteDefinition",
        label: "1",
        content: [
          { type: "paragraph", text: "First." },
          { type: "paragraph", text: "Second paragraph." },
        ],
      },
      { type: "paragraph", text: "Outside." },
    ]);
  });

  it("缩进 4 格以上是代码；代码块里的不是定义", () => {
    expect(types("    [^1]: code")).toEqual(["codeBlock"]);
    expect(types("\t[^1]: code")).toEqual(["codeBlock"]);
    expect(types("```\n[^1]: Bad note\n```\n\n[^1]: Good note")).toEqual(["codeBlock", "footnoteDefinition"]);
  });

  it("标签可以有空格和中文；在引用、列表里也认", () => {
    const source = ["> - [^中文 nOtE]: Detail **bold**.", ">       Continued line."].join("\r\n");
    expect(blocks(source)).toEqual([
      {
        type: "blockquote",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                checked: null,
                content: [{ type: "footnoteDefinition", label: "中文 nOtE", content: [{ type: "paragraph", text: "Detail **bold**.\nContinued line." }] }],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("S-8 关掉脚注时 [^1]: 是链接引用定义（CommonMark）", () => {
    expect(types("[^1]: detail", { syntax: { footnotes: false } })).toEqual(["referenceDefinition"]);
  });
});

describe("B-13 Callout", () => {
  it("五种，大小写不限；标题行之后的是内容", () => {
    for (const kind of ["NOTE", "tip", "Important", "WARNING", "caution"]) {
      expect(blocks(`> [!${kind}]\n> Body`), kind).toEqual([{ type: "alert", kind: kind.toLowerCase(), content: [{ type: "paragraph", text: "Body" }] }]);
    }
    expect(blocks("> [!NOTE]\n>\n> Para\n> - item")).toEqual([
      {
        type: "alert",
        kind: "note",
        content: [
          { type: "paragraph", text: "Para" },
          { type: "bulletList", content: [{ type: "listItem", checked: null, content: [{ type: "paragraph", text: "item" }] }] },
        ],
      },
    ]);
  });

  it("标记后面还有字、不认识的种类、S-8 关掉时都是普通引用", () => {
    expect(types("> [!NOTE] title\n> Body")).toEqual(["blockquote"]);
    expect(types("> [!INFO]\n> Body")).toEqual(["blockquote"]);
    expect(types("> [!NOTE]\n> Body", { syntax: { callout: false } })).toEqual(["blockquote"]);
  });
});

describe("B-14 定义列表", () => {
  it("词条下一行 `: 说明`；一个词条可以有几条说明；说明后面紧跟的词条开始新的一组", () => {
    const source = ["Term **one**", ": Definition with [link](https://example.com)", ": Second `code`", "Another term", ": ==Marked== value", "", "Next paragraph"].join("\n");
    expect(blocks(source)).toEqual([
      {
        type: "definitionList",
        content: [
          { type: "definitionTerm", text: "Term **one**" },
          { type: "definitionDescription", content: [{ type: "paragraph", text: "Definition with [link](https://example.com)" }] },
          { type: "definitionDescription", content: [{ type: "paragraph", text: "Second `code`" }] },
          { type: "definitionTerm", text: "Another term" },
          { type: "definitionDescription", content: [{ type: "paragraph", text: "==Marked== value" }] },
        ],
      },
      { type: "paragraph", text: "Next paragraph" },
    ]);
  });

  it("说明可以有几段：空行后缩进 4 格的接着属于它", () => {
    const source = ["Term", ": First paragraph with **bold**", "", "    Second paragraph with [link](https://example.com)", "", "Next paragraph"].join("\n");
    expect(blocks(source)).toEqual([
      {
        type: "definitionList",
        content: [
          { type: "definitionTerm", text: "Term" },
          {
            type: "definitionDescription",
            content: [
              { type: "paragraph", text: "First paragraph with **bold**" },
              { type: "paragraph", text: "Second paragraph with [link](https://example.com)" },
            ],
          },
        ],
      },
      { type: "paragraph", text: "Next paragraph" },
    ]);
  });

  it("引用里也认", () => {
    expect(blocks("> Term **one**\n> : Definition with `code`\n>\n> After")).toEqual([
      {
        type: "blockquote",
        content: [
          {
            type: "definitionList",
            content: [
              { type: "definitionTerm", text: "Term **one**" },
              { type: "definitionDescription", content: [{ type: "paragraph", text: "Definition with `code`" }] },
            ],
          },
          { type: "paragraph", text: "After" },
        ],
      },
    ]);
    expect(blocks("> Term\n> : First paragraph\n>\n>     Second paragraph")).toEqual([
      {
        type: "blockquote",
        content: [
          {
            type: "definitionList",
            content: [
              { type: "definitionTerm", text: "Term" },
              {
                type: "definitionDescription",
                content: [
                  { type: "paragraph", text: "First paragraph" },
                  { type: "paragraph", text: "Second paragraph" },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("词条里可以有行内 HTML", () => {
    expect(types("<b>Term</b> here\n: def")).toEqual(["definitionList"]);
  });

  it("冒号后面没有空白、前面没有词条的都不是", () => {
    expect(types("Term\n:not a definition marker")).toEqual(["paragraph"]);
    expect(types(": orphan")).toEqual(["paragraph"]);
    expect(types("Term\n\n: after blank")).toEqual(["paragraph", "paragraph"]);
  });

  it("说明后面不缩进的行（不是词条）拆成后面的段落", () => {
    expect(types("Term\n: def\nplain line")).toEqual(["definitionList", "paragraph"]);
  });
});

describe("B-16 缩写定义", () => {
  it("段落开头连续的定义各成一块，后面的仍是段落；全称不能为空", () => {
    expect(blocks("*[HTML]: Hyper Text Markup Language\n*[CSS]: Cascading Style Sheets\nUse HTML.")).toEqual([
      { type: "abbreviationDefinition", text: "*[HTML]: Hyper Text Markup Language" },
      { type: "abbreviationDefinition", text: "*[CSS]: Cascading Style Sheets" },
      { type: "paragraph", text: "Use HTML." },
    ]);
    expect(types("*[HTML]:")).toEqual(["paragraph"]);
    expect(types("> Use HTML here.\n>\n> *[HTML]: Hyper Text Markup Language")).toEqual(["blockquote"]);
    expect(types("```\n*[HTML]: no\n```")).toEqual(["codeBlock"]);
  });
});

describe("B-15 链接引用定义", () => {
  it("缩进 1～3 格、标题在下一行都认；后面缩进 4 格的是代码", () => {
    expect(blocks(["   [docs]: https://example.com/docs", "\"Docs title\"", "", "    code after definition"].join("\n"))).toEqual([
      { type: "referenceDefinition", text: "[docs]: https://example.com/docs\n\"Docs title\"" },
      { type: "codeBlock", info: "", text: "code after definition" },
    ]);
  });

  it("HTML 块、代码块里的不是定义", () => {
    expect(types("<div>\n[x]: /url\n</div>\n\n```\n[y]: /url\n```")).toEqual(["htmlBlock", "codeBlock"]);
  });
});

describe("B-5 任务列表", () => {
  it("[ ]、[x]、[X]；有序列表的项也可以是任务；方括号后面要有空白", () => {
    expect(blocks("- [ ] todo\n- [x] done\n- [X] Done\n1. [ ] ordered\n\n- [ ]no")).toEqual([
      {
        type: "bulletList",
        content: [
          { type: "listItem", checked: false, content: [{ type: "paragraph", text: "todo" }] },
          { type: "listItem", checked: true, content: [{ type: "paragraph", text: "done" }] },
          { type: "listItem", checked: true, content: [{ type: "paragraph", text: "Done" }] },
        ],
      },
      { type: "orderedList", content: [{ type: "listItem", checked: false, content: [{ type: "paragraph", text: "ordered" }] }] },
      { type: "bulletList", content: [{ type: "listItem", checked: null, content: [{ type: "paragraph", text: "[ ]no" }] }] },
    ]);
  });
});

describe("T 表格", () => {
  it("单元格是去掉两头空白的行内原文；对齐来自分隔行；转义的竖线不拆", () => {
    expect(blocks("| Name | Age |\n| :--- | ---: |\n| Ada \\| L | 36 |\n|  | 41 |")).toEqual([
      {
        type: "table",
        align: ["left", "right"],
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", text: "Name" }, { type: "tableHeader", text: "Age" }] },
          { type: "tableRow", content: [{ type: "tableCell", text: "Ada \\| L" }, { type: "tableCell", text: "36" }] },
          { type: "tableRow", content: [{ type: "tableCell", text: "" }, { type: "tableCell", text: "41" }] },
        ],
      },
    ]);
  });

  it("没有首尾竖线的写法；引用里的表格", () => {
    expect(blocks("名称 | 值\n--- | :-:\n甲 | 1")).toEqual([
      {
        type: "table",
        align: [null, "center"],
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", text: "名称" }, { type: "tableHeader", text: "值" }] },
          { type: "tableRow", content: [{ type: "tableCell", text: "甲" }, { type: "tableCell", text: "1" }] },
        ],
      },
    ]);
    expect(types("> | a |\n> | - |\n> | 1 |")).toEqual(["blockquote"]);
  });
});

describe("和 CommonMark 不同、照 Typora 1.14.15 实测的地方（tests/editorBlocks.test.ts 迁来）", () => {
  it("Setext 下划线至少两个字符：只有一个 = 或 - 的那行是段落的续行", () => {
    expect(blocks("Title A\n=")).toEqual([{ type: "paragraph", text: "Title A\n=" }]);
    expect(blocks("Title B\n-\nBody")).toEqual([{ type: "paragraph", text: "Title B\n-\nBody" }]);
    expect(blocks("Title C\n==\n\nTitle D\n--")).toEqual([
      { type: "heading", level: 1, text: "Title C" },
      { type: "heading", level: 2, text: "Title D" },
    ]);
    // 续行之后遇到合规的下划线，整段是标题
    expect(blocks("A\n-\nB\n==")).toEqual([{ type: "heading", level: 1, text: "A\n-\nB" }]);
    expect(types("Single\n=\n\nDouble\n==")).toEqual(["paragraph", "heading"]);
  });

  it("表格可以紧跟在段落后面；表格后面不带竖线的行也是表格的一行（GFM 规范如此，旧测试这条写反了）", () => {
    expect(blocks("Before\n| Name | Status |\n| --- | --- |\n| Ada | Ready |\nAfter")).toEqual([
      { type: "paragraph", text: "Before" },
      {
        type: "table",
        align: [null, null],
        content: [
          { type: "tableRow", content: [{ type: "tableHeader", text: "Name" }, { type: "tableHeader", text: "Status" }] },
          { type: "tableRow", content: [{ type: "tableCell", text: "Ada" }, { type: "tableCell", text: "Ready" }] },
          // 每行的格数同表头：少的补空格（同 GFM 的显示），编辑器的表格要求方方正正
          { type: "tableRow", content: [{ type: "tableCell", text: "After" }, { type: "tableCell", text: "" }] },
        ],
      },
    ]);
  });

  it("表格每行的格数同表头：短行补空格，长行多出的格不算（GFM 不显示）；原文照样无损", () => {
    const source = "| a | b | c |\n|---|---|---|\n| 1 |\n| 1 | 2 | 3 | 4 |\n |  | ";
    const table = parse(source).content?.[0] as MdNode;
    const widths = blockChildren(table).map((row) => blockChildren(row).length);
    expect(widths).toEqual([3, 3, 3, 3]);
    expect(blockChildren(blockChildren(table)[2]).map((cell) => nodeText(cell))).toEqual(["1", "2", "3"]);
    expect(serialize(parse(source))).toBe(source);
  });

  it("CRLF 换行的表格也是表格（Lezer 自带的表格扩展认不出，syntax/table.ts），格子里没有 \\r", () => {
    const source = "| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n> | x | y |\r\n> |---|---|\r\n> | 3 | 4 |\r\n";
    const doc = parse(source);
    expect(blockChildren(doc).map((node) => node.type)).toEqual(["table", "blockquote"]);
    const table = blockChildren(doc)[0];
    expect(blockChildren(table).map((row) => blockChildren(row).map((cell) => nodeText(cell)))).toEqual([
      ["A", "B"],
      ["1", "2"],
    ]);
    const quoted = blockChildren(blockChildren(doc)[1])[0];
    expect(quoted.type).toBe("table");
    expect(blockChildren(blockChildren(quoted)[1]).map((cell) => nodeText(cell))).toEqual(["3", "4"]);
    expect(serialize(doc)).toBe(source);
  });

  it("CRLF 换行的文件解析出的结构和 LF 的一样（Lezer 给的每行末尾带着 \\r，自己的扩展都要不看它）", () => {
    const shape = (node: MdNode): string => {
      const children = blockChildren(node);
      return children.length ? `${node.type}[${children.map(shape).join(", ")}]` : `${node.type}(${JSON.stringify(nodeText(node))})`;
    };
    const sources = [
      "# Title\n\nPara",
      "Title\n===\n\nPara",
      "```js\ncode\n```\n\nafter",
      "$$\nx\n$$\n\n\\[\ny\n\\]",
      "$$ {tag}\nx\n$$ {end}",
      "---\ntitle: x\n---\n\nBody",
      "- [ ] task\n- [x] done",
      "> [!NOTE]\n> body",
      "[^1]: note\n    more",
      "Term\n: Definition",
      "[TOC]\n\nafter",
      "<div>\nhtml\n</div>\n\nafter",
      "| a | b |\n| --- | --- |\n| 1 | 2 |",
      "line one  \nline two",
    ];
    for (const source of sources) expect(shape(parse(source.replace(/\n/g, "\r\n"))), source).toBe(shape(parse(source)));
  });

  it("公式块可以写在列表项的第一行（`- $$`、`10. \\[`），内容可以是空的", () => {
    expect(types("- $$\n  x\n  $$")).toEqual(["bulletList"]);
    const item = (source: string) => blockChildren(blockChildren(parse(source).content?.[0] as MdNode)[0]).map((node) => node.type);
    expect(item("- $$\n  x\n  $$")).toEqual(["mathBlock"]);
    expect(item("- $$\n  \n  $$")).toEqual(["mathBlock"]);
    expect(item("10. \\[\n    \n    \\]")).toEqual(["mathBlock"]);
  });

  it("脚注定义能打断段落；连着写的定义各是各的", () => {
    expect(types("Para line\n[^c]: note")).toEqual(["paragraph", "footnoteDefinition"]);
    expect(types("[^a]: A note.\n[^b]: B note.")).toEqual(["footnoteDefinition", "footnoteDefinition"]);
  });

  it("〔已知差异〕10 位数的有序列表序号：Typora 认，这里按 CommonMark 最多 9 位", () => {
    expect(types("1234567890. ten digits")).toEqual(["paragraph"]);
    expect(types("123456789. nine digits")).toEqual(["orderedList"]);
  });
});

describe("B-12 HTML 块", () => {
  it("引用里的 `>` 空行结束第 6、7 种 HTML 块（CommonMark；Lezer 自带的解析器在这里不对）", () => {
    expect(blocks("> <section>\n> # Hidden\n> </section>\n>\n> # Visible")).toEqual([
      {
        type: "blockquote",
        content: [
          { type: "htmlBlock", text: "<section>\n# Hidden\n</section>" },
          { type: "heading", level: 1, text: "Visible" },
        ],
      },
    ]);
  });

  it("注释块单独标出来；S-8 关掉 HTML 时是普通段落", () => {
    const comment = blockChildren(parse("<!--\nnote\n-->"))[0];
    expect([comment.type, comment.attrs?.comment]).toEqual(["htmlBlock", true]);
    // Lezer 内置的「HTML 块开头能打断段落」去不掉，所以 </div> 另起一段；都按文字显示，不影响结果
    expect(types("<div>\nx\n</div>", { syntax: { html: false } })).toEqual(["paragraph", "paragraph"]);
  });
});

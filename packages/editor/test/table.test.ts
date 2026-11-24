// T-5：选择行、列、整个表格是单元格选区（prosemirror-tables），在它上面逐格加样式、清空；按源码改的命令不在它上面执行
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMarkoEditor, getMarkdown, getMarkdownWithSelection, setMarkdown } from "../src/index.ts";

const TABLE = "Intro\n\n| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n\nOutro";

let editor: Editor;

beforeEach(() => {
  editor = createMarkoEditor();
});

afterEach(() => {
  editor.destroy();
});

/** 光标放在源码里第一次出现 text 的地方（text 前面） */
function cursorBefore(markdown: string, text: string): void {
  const offset = markdown.indexOf(text);
  setMarkdown(editor, markdown, { anchor: offset, head: offset });
}

function press(key: string, options: KeyboardEventInit = {}): boolean {
  const view = editor.view;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
  return Boolean(view.someProp("handleKeyDown", (handler) => handler(view, event)));
}

function cellTexts(): string[][] {
  const rows: string[][] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "tableRow") {
      const row: string[] = [];
      node.forEach((cell) => row.push(cell.textContent));
      rows.push(row);
      return false;
    }
    return true;
  });
  return rows;
}

describe("T-5 单元格选区", () => {
  it("选择行、列、整个表格", () => {
    cursorBefore(TABLE, "5");
    expect(editor.commands.selectTableRow()).toBe(true);
    const row = editor.state.selection;
    expect(row).toBeInstanceOf(CellSelection);
    expect((row as CellSelection).isRowSelection()).toBe(true);
    expect((row as CellSelection).ranges).toHaveLength(3);

    cursorBefore(TABLE, "5");
    editor.commands.selectTableColumn();
    const column = editor.state.selection as CellSelection;
    expect(column.isColSelection()).toBe(true);
    expect(column.ranges).toHaveLength(3);
    const { value, anchor, head } = getMarkdownWithSelection(editor);
    // 读成源码时是从这一列第一格的内容到最后一格的内容
    expect(value.slice(anchor, head)).toBe("B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5");

    cursorBefore(TABLE, "5");
    editor.commands.selectTable();
    expect((editor.state.selection as CellSelection).ranges).toHaveLength(9);
  });

  it("不在表格里时不处理", () => {
    cursorBefore(TABLE, "Intro");
    expect(editor.commands.selectTableRow()).toBe(false);
    expect(editor.commands.selectTable()).toBe(false);
  });

  it("加粗逐格加；都加过了再按一次逐格去掉；已经加粗的格子不叠一层", () => {
    cursorBefore(TABLE, "5");
    editor.commands.selectTableRow();
    expect(editor.commands.bold()).toBe(true);
    expect(cellTexts()[2]).toEqual(["**4**", "**5**", "**6**"]);
    expect(editor.state.selection).toBeInstanceOf(CellSelection);
    expect(getMarkdown(editor)).toBe(TABLE.replace("| 4 | 5 | 6 |", "| **4** | **5** | **6** |"));

    editor.commands.bold();
    expect(cellTexts()[2]).toEqual(["4", "5", "6"]);
    expect(getMarkdown(editor)).toBe(TABLE);

    const mixed = TABLE.replace("| 4 | 5 | 6 |", "| **4** | 5 | 6 |");
    cursorBefore(mixed, "5");
    editor.commands.selectTableRow();
    editor.commands.bold();
    expect(cellTexts()[2]).toEqual(["**4**", "**5**", "**6**"]);
  });

  it("快捷键也逐格执行；空格子不加", () => {
    const withEmpty = TABLE.replace("| 4 | 5 | 6 |", "| 4 |  | 6 |");
    cursorBefore(withEmpty, "4");
    editor.commands.selectTableRow();
    expect(press("i", { ctrlKey: true })).toBe(true);
    expect(cellTexts()[2]).toEqual(["*4*", "", "*6*"]);
  });

  it("清除格式逐格清", () => {
    const styled = TABLE.replace("| 1 | 2 | 3 |", "| **1** | ~~2~~ | `3` |");
    cursorBefore(styled, "2");
    editor.commands.selectTableRow();
    editor.commands.clearFormat();
    expect(cellTexts()[1]).toEqual(["1", "2", "3"]);
  });

  it("按源码改的命令（标题、列表……）不在单元格选区上执行", () => {
    cursorBefore(TABLE, "5");
    editor.commands.selectTableRow();
    expect(editor.commands.heading1()).toBe(false);
    expect(editor.commands.bulletList()).toBe(false);
    expect(getMarkdown(editor)).toBe(TABLE);
  });

  it("回车不拆格子；退格清空选中的格子（prosemirror-tables）", () => {
    cursorBefore(TABLE, "5");
    editor.commands.selectTableRow();
    expect(press("Enter")).toBe(true);
    expect(getMarkdown(editor)).toBe(TABLE);
    expect(press("Backspace")).toBe(true);
    expect(cellTexts()[2]).toEqual(["", "", ""]);
    expect(cellTexts()[1]).toEqual(["1", "2", "3"]);
  });

  it("输入的文字交给 ProseMirror 换掉选区", () => {
    cursorBefore(TABLE, "5");
    editor.commands.selectTableRow();
    const view = editor.view;
    const { from, to } = view.state.selection;
    const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, "x", () => view.state.tr.insertText("x")));
    expect(handled).toBeFalsy();
  });
});

describe("选区到了表格、代码块的边上（审查 #7）", () => {
  function typeText(text: string): void {
    const view = editor.view;
    for (const char of text) {
      const { from, to } = view.state.selection;
      const deflt = () => view.state.tr.insertText(char, from, to);
      const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, char, deflt));
      if (!handled) view.dispatch(deflt());
    }
  }

  function select(markdown: string, from: number, to: number): void {
    setMarkdown(editor, markdown, { anchor: from, head: to });
  }

  it("从表格前面的第一个字选到最后一格的末尾：退格、输入都换掉整篇", () => {
    const source = "Hello\n\n| a | b |\n| - | - |\n| 1 | 2 |";
    select(source, 0, source.indexOf("2") + 1);
    press("Backspace");
    expect(getMarkdown(editor)).toBe("");
    select(source, 0, source.indexOf("2") + 1);
    typeText("x");
    expect(getMarkdown(editor)).toBe("x");
  });

  it("从表格外选到最后一格的末尾：整个表格删掉，不留 ` |`", () => {
    const source = "Hello\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nTail";
    select(source, 2, source.indexOf("2") + 1);
    press("Backspace");
    expect(getMarkdown(editor)).toBe("He\n\nTail");
  });

  it("从第一格的开头选到表格外：整个表格删掉，不留 `| `；反向选也一样", () => {
    const source = "Intro\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nTail";
    select(source, source.indexOf("a"), source.indexOf("il"));
    press("Backspace");
    expect(getMarkdown(editor)).toBe("Intro\n\nil");
    select(source, source.indexOf("il"), source.indexOf("a"));
    press("Backspace");
    expect(getMarkdown(editor)).toBe("Intro\n\nil");
  });

  it("从代码块外选到代码的末尾：结尾的围栏一起删掉", () => {
    const source = "Hello\n\n```js\ncode\n```\n\nTail";
    select(source, 2, source.indexOf("code") + 4);
    press("Backspace");
    expect(getMarkdown(editor)).toBe("He\n\nTail");
  });

  it("全选以后输入：整篇换成输入的字（不留文末空行、表格框架）", () => {
    for (const source of ["Hello\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n\n", "| a |\n| - |\n| 1 |\n\n---\n"]) {
      setMarkdown(editor, source);
      expect(press("a", { ctrlKey: true })).toBe(true);
      typeText("x");
      expect(getMarkdown(editor), JSON.stringify(source)).toBe("x");
    }
  });

  it("只选到中间的格子：表格还在", () => {
    const source = "Hello\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nTail";
    select(source, 2, source.indexOf("1") + 1);
    const before = getMarkdownWithSelection(editor);
    expect(before.head).toBe(source.indexOf("1") + 1);
  });

  it("全选命令（AllSelection）：结尾的分隔线、目录也删掉", () => {
    for (const source of ["Hello\n\n---", "Hello\n\n[TOC]"]) {
      setMarkdown(editor, source);
      // Mod-a 是全选命令（AllSelection）
      expect(press("a", { ctrlKey: true })).toBe(true);
      press("Backspace");
      expect(getMarkdown(editor), source).toBe("");
    }
  });
});

describe("节点选区读成源码", () => {
  it("选中的分隔线是它这一行的原文", () => {
    const markdown = "Before\n\n---\n\nAfter";
    const start = markdown.indexOf("---");
    setMarkdown(editor, markdown, { anchor: start, head: start + 3 });
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    const { value, anchor, head } = getMarkdownWithSelection(editor);
    expect(value.slice(anchor, head)).toBe("---");
  });
});

describe("T-2、T-6 单元格里的输入和粘贴", () => {
  const SMALL = "| A | B |\n| --- | --- |\n| 1 | 2 |";

  function typeText(text: string): void {
    const view = editor.view;
    for (const char of text) {
      const { from, to } = view.state.selection;
      const handled = view.someProp("handleTextInput", (handler) => handler(view, from, to, char, () => view.state.tr.insertText(char, from, to)));
      if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
    }
  }

  it("输入的竖线写成 \|", () => {
    cursorBefore(SMALL, "2");
    typeText("a|b");
    expect(getMarkdown(editor)).toBe("| A | B |\n| --- | --- |\n| 1 | a\\|b2 |");
    expect(cellTexts()[1]).toEqual(["1", "a\\|b2"]);
  });

  it("Shift+回车插入 <br>", () => {
    cursorBefore(SMALL, "2");
    expect(press("Enter", { shiftKey: true })).toBe(true);
    expect(getMarkdown(editor)).toBe("| A | B |\n| --- | --- |\n| 1 | <br>2 |");
  });

  it("粘贴表格数据：从这一格开始填，不够时加行、加列；没改的行原样", async () => {
    const { pasteIntoCells } = await import("../src/commands/cells.ts");
    cursorBefore(SMALL, "2");
    expect(pasteIntoCells(editor, { text: "x\ty\nz\tw" })).toBe(true);
    expect(cellTexts()).toEqual([
      ["A", "B", ""],
      ["1", "x", "y"],
      ["", "z", "w"],
    ]);
    const markdown = getMarkdown(editor);
    expect(markdown.split("\n")).toHaveLength(4);
    expect(markdown.split("\n")[2]).toBe("| 1 | x | y |");
  });

  it("从左下拖到右上选中几格再粘贴表格数据：从选中的矩形的左上角开始填", async () => {
    const { pasteIntoCells } = await import("../src/commands/cells.ts");
    setMarkdown(editor, TABLE);
    const cells: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "tableCell" || node.type.name === "tableHeader") cells.push(pos);
      return true;
    });
    // 第 3 行第 1 格（4）到第 2 行第 2 格（2）
    const doc = editor.state.doc;
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(doc, cells[6], cells[4])));
    expect(pasteIntoCells(editor, { text: "x\ty\nz\tw" })).toBe(true);
    expect(cellTexts()).toEqual([
      ["A", "B", "C"],
      ["x", "y", "3"],
      ["z", "w", "6"],
    ]);
  });

  it("粘贴别的文字：换行变成 <br>，竖线转义", async () => {
    const { pasteIntoCells } = await import("../src/commands/cells.ts");
    cursorBefore(SMALL, "2");
    expect(pasteIntoCells(editor, { text: "p|q\nr" })).toBe(true);
    expect(getMarkdown(editor)).toBe("| A | B |\n| --- | --- |\n| 1 | p\\|q<br>r2 |");
  });
});

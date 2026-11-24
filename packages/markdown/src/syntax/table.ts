// GFM 表格：照 @lezer/markdown 1.8.1 自带的 Table 扩展（MIT），改了一处：CRLF 换行的文件里每行末尾有 `\r`，
// 自带的版本认不出分隔行、把 `\r` 算进最后一格，整个表格变成段落。这里判断分隔行、算格子时不看行尾的 `\r`
import type { BlockContext, Element, LeafBlock, LeafBlockParser, Line, MarkdownConfig } from "@lezer/markdown";

/** 行尾的 `\r` 不算 */
function withoutCr(text: string): string {
  return text.endsWith("\r") ? text.slice(0, -1) : text;
}

/** 按一行表格数格子；给了 elts 时把格子、竖线的语法元素放进去 */
function parseRow(cx: BlockContext, line: string, startI = 0, elts?: Element[], offset = 0): number {
  const text = withoutCr(line);
  let count = 0;
  let first = true;
  let cellStart = -1;
  let cellEnd = -1;
  let esc = false;
  const parseCell = () => {
    elts?.push(cx.elt("TableCell", offset + cellStart, offset + cellEnd, cx.parser.parseInline(text.slice(cellStart, cellEnd), offset + cellStart)));
  };
  for (let i = startI; i < text.length; i += 1) {
    const next = text.charCodeAt(i);
    if (next === 124 && !esc) {
      if (!first || cellStart > -1) count += 1;
      first = false;
      if (elts) {
        if (cellStart > -1) parseCell();
        elts.push(cx.elt("TableDelimiter", i + offset, i + offset + 1));
      }
      cellStart = cellEnd = -1;
    } else if (esc || (next !== 32 && next !== 9)) {
      if (cellStart < 0) cellStart = i;
      cellEnd = i + 1;
    }
    esc = !esc && next === 92;
  }
  if (cellStart > -1) {
    count += 1;
    if (elts) parseCell();
  }
  return count;
}

function hasPipe(text: string, start: number): boolean {
  for (let i = start; i < text.length; i += 1) {
    const next = text.charCodeAt(i);
    if (next === 124) return true;
    if (next === 92) i += 1;
  }
  return false;
}

const DELIMITER_LINE = /^[>\s]*\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/;

class TableParser implements LeafBlockParser {
  /** null：还没看到第二行；false：不是表格；数组：是表格，已经解析的行 */
  private rows: Element[] | null | false = null;

  nextLine(cx: BlockContext, line: Line, leaf: LeafBlock): boolean {
    if (this.rows === null) {
      this.rows = false;
      const lineText = withoutCr(line.text.slice(line.pos));
      if ((line.next === 45 || line.next === 58 || line.next === 124) && DELIMITER_LINE.test(lineText)) {
        const firstRow: Element[] = [];
        const content = withoutCr(leaf.content);
        const firstCount = parseRow(cx, content, 0, firstRow, leaf.start);
        if (firstCount === parseRow(cx, lineText, 0)) {
          this.rows = [
            cx.elt("TableHeader", leaf.start, leaf.start + content.length, firstRow),
            cx.elt("TableDelimiter", cx.lineStart + line.pos, cx.lineStart + withoutCr(line.text).length),
          ];
        }
      }
    } else if (this.rows) {
      const content: Element[] = [];
      parseRow(cx, line.text, line.pos, content, cx.lineStart);
      this.rows.push(cx.elt("TableRow", cx.lineStart + line.pos, cx.lineStart + withoutCr(line.text).length, content));
    }
    return false;
  }

  finish(cx: BlockContext, leaf: LeafBlock): boolean {
    if (!this.rows) return false;
    cx.addLeafElement(leaf, cx.elt("Table", leaf.start, leaf.start + withoutCr(leaf.content).length, this.rows));
    return true;
  }
}

export const table: MarkdownConfig = {
  defineNodes: [{ name: "Table", block: true }, "TableHeader", "TableRow", "TableCell", "TableDelimiter"],
  parseBlock: [
    {
      name: "Table",
      leaf(_cx, leaf) {
        return hasPipe(leaf.content, 0) ? new TableParser() : null;
      },
      endLeaf(cx, line, leaf) {
        if (leaf.parsers.some((parser) => parser instanceof TableParser) || !hasPipe(line.text, line.basePos)) return false;
        const next = withoutCr(cx.peekLine());
        return DELIMITER_LINE.test(next) && parseRow(cx, line.text, line.basePos) === parseRow(cx, next, line.basePos);
      },
      before: "SetextHeading",
    },
  ],
};

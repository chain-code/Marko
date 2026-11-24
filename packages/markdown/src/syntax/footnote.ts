// 脚注（B-11）：引用 [^标签]，定义 [^标签]: 内容。定义是容器块：续行缩进 4 列，段落可以懒惰续行
import type { BlockContext, Line, MarkdownConfig } from "@lezer/markdown";

const OPEN_BRACKET = 91;
const CARET = 94;
const COLON = 58;

/** 脚注定义的续行缩进（Pandoc、Typora 的写法） */
export const FOOTNOTE_CONTENT_INDENT = 4;

/** 读 from 处的 `[^标签]`：标签至少一个字符，不能有 `]` 和换行；标签两边不能是空白 */
export function readFootnoteLabel(text: string, from: number): { labelFrom: number; labelTo: number; end: number } | null {
  if (text.charCodeAt(from) !== OPEN_BRACKET || text.charCodeAt(from + 1) !== CARET) return null;
  const close = text.indexOf("]", from + 2);
  if (close < 0) return null;
  const label = text.slice(from + 2, close);
  if (!label || /[\n\r[]/.test(label) || label.trim() !== label) return null;
  return { labelFrom: from + 2, labelTo: close, end: close + 1 };
}

/** 读一行开头的 `[^标签]:`，返回冒号之后的位置 */
export function readFootnoteDefinitionStart(text: string, from: number): { labelFrom: number; labelTo: number; end: number } | null {
  const label = readFootnoteLabel(text, from);
  if (!label || text.charCodeAt(label.end) !== COLON) return null;
  return { ...label, end: label.end + 1 };
}

function parseFootnoteDefinition(cx: BlockContext, line: Line): boolean | null {
  if (line.indent - line.baseIndent >= 4) return false;
  const start = readFootnoteDefinitionStart(line.text, line.pos);
  if (!start) return false;
  const after = line.text.charCodeAt(start.end);
  cx.startComposite("FootnoteDefinition", line.pos, FOOTNOTE_CONTENT_INDENT);
  cx.addElement(
    cx.elt("FootnoteMark", cx.lineStart + line.pos, cx.lineStart + start.end, [
      cx.elt("FootnoteLabel", cx.lineStart + start.labelFrom, cx.lineStart + start.labelTo),
    ]),
  );
  // 冒号后面的一个空格或制表符属于标记；内容从这之后开始
  line.moveBase(after === 32 || after === 9 ? start.end + 1 : start.end);
  return null;
}

export const footnote: MarkdownConfig = {
  defineNodes: [
    {
      name: "FootnoteDefinition",
      block: true,
      composite(_cx, line, value) {
        if (line.next < 0) return true;
        if (line.indent < line.baseIndent + value) return false;
        line.moveBaseColumn(line.baseIndent + value);
        return true;
      },
    },
    "FootnoteMark",
    "FootnoteLabel",
    "FootnoteReference",
    "FootnoteReferenceMark",
  ],
  parseBlock: [
    {
      name: "FootnoteDefinition",
      // 必须在链接引用定义之前：[^1]: 按 CommonMark 也是合法的链接引用定义
      before: "IndentedCode",
      parse: parseFootnoteDefinition,
      // 能打断段落：连着写的几条定义各是各的，后一条不会成为前一条的懒惰续行
      endLeaf: (_cx, line) => line.indent - line.baseIndent < 4 && readFootnoteDefinitionStart(line.text, line.pos) !== null,
    },
  ],
  parseInline: [
    {
      name: "FootnoteReference",
      before: "Link",
      parse(cx, next, pos) {
        if (next !== OPEN_BRACKET || cx.char(pos + 1) !== CARET) return -1;
        const label = readFootnoteLabel(cx.slice(pos, cx.end), 0);
        if (!label) return -1;
        // 定义不能打断段落：段落续行开头的 [^1]: 是引用加一个冒号
        return cx.addElement(
          cx.elt("FootnoteReference", pos, pos + label.end, [
            cx.elt("FootnoteReferenceMark", pos, pos + 2),
            cx.elt("FootnoteLabel", pos + label.labelFrom, pos + label.labelTo),
            cx.elt("FootnoteReferenceMark", pos + label.labelTo, pos + label.end),
          ]),
        );
      },
    },
  ],
};

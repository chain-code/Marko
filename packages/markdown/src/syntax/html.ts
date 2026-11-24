// HTML 块（B-12）：替换 Lezer 自带的同名解析器。Lezer 判断结束条件时用的是整行（含引用的 `>`），
// 引用里的 `>` 空行结束不了第 6、7 种 HTML 块；这里按 CommonMark 用容器前缀之后的内容判断。开始条件和 Lezer 相同
import type { BlockContext, Element, Line, MarkdownConfig } from "@lezer/markdown";
import { lineInCurrentContext } from "./math.ts";

// CRLF 换行的文件里 Lezer 给的每行末尾带着 `\r`：只有 `\r` 的行也是空行
const EMPTY_LINE = /^[ \t]*\r?$/;
const COMMENT_END = /-->/;
const PROCESSING_END = /\?>/;

const HTML_BLOCK_STYLES: Array<[RegExp, RegExp]> = [
  [/^<(?:script|pre|style|textarea)(?:\s|>|$)/i, /<\/(?:script|pre|style|textarea)>/i],
  [/^\s*<!--/, COMMENT_END],
  [/^\s*<\?/, PROCESSING_END],
  [/^\s*<![A-Z]/, />/],
  [/^\s*<!\[CDATA\[/, /\]\]>/],
  [
    /^\s*<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i,
    EMPTY_LINE,
  ],
  [/^\s*(?:<\/[a-z][\w-]*\s*>|<[a-z][\w-]*(\s+[a-z:_][\w-.]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*>)\s*$/i, EMPTY_LINE],
];

function htmlBlockType(line: Line): number {
  if (line.next !== 60) return -1;
  const rest = line.text.slice(line.pos);
  for (let i = 0; i < HTML_BLOCK_STYLES.length; i += 1) if (HTML_BLOCK_STYLES[i][0].test(rest)) return i;
  return -1;
}

function parseHtmlBlock(cx: BlockContext, line: Line): boolean {
  const type = htmlBlockType(line);
  if (type < 0) return false;
  const from = cx.lineStart + line.pos;
  const end = HTML_BLOCK_STYLES[type][1];
  const marks: Element[] = [];
  let trailing = end !== EMPTY_LINE;
  let content = line.text.slice(line.pos);
  for (;;) {
    if (end !== EMPTY_LINE && end.test(content)) break;
    if (!cx.nextLine()) {
      trailing = false;
      break;
    }
    if (!lineInCurrentContext(cx, line)) {
      trailing = false;
      break;
    }
    content = line.text.slice(line.basePos);
    // 第 6、7 种在空行处结束，空行不属于这个块
    if (end === EMPTY_LINE && EMPTY_LINE.test(content)) break;
    for (const marker of line.markers) marks.push(marker);
  }
  if (trailing) cx.nextLine();
  const name = end === COMMENT_END ? "CommentBlock" : end === PROCESSING_END ? "ProcessingInstructionBlock" : "HTMLBlock";
  cx.addElement(cx.elt(name, from, cx.prevLineEnd(), marks));
  return true;
}

export const htmlBlock: MarkdownConfig = {
  // 和 Lezer 自带的同名：configure 时原地替换，先后顺序不变
  parseBlock: [{ name: "HTMLBlock", parse: parseHtmlBlock }],
};

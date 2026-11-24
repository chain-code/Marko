// E-4：有些写法按回车（或接着输入空格）才转换，光标还在这一行末尾输入时先不转换，段落里照样是输入的字符。
// 例：输入 `---` 时不马上变成分隔线（可能还要接着输入），按回车才变（commands/enter.ts）；
// 输入 `-` 时不马上变成空列表项，输入 `- ` 才变
import { isTocMarker, type MdNode } from "@marko/markdown";
import type { EditorState } from "@tiptap/pm/state";
import { THEMATIC_BREAK, lineAt, lineStartOf, looksLikeThematicBreak } from "../commands/text.ts";
import { buildDocSourceMap, keepBlankAt, positionToOffset } from "../state.ts";

/** 段落里单独一行写成这样时等回车 */
const DEFERRED_LINES = [
  // 分隔线（也是文档开头的 Front Matter）
  /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/,
  // 代码块、图表的围栏
  /^ {0,3}(?:`{3,}[^`]*|~{3,}.*)$/,
  // 公式块
  /^ {0,3}(?:\$\$(?:[ \t]*\{[^}\r\n]*\})?[ \t]*|\\\[[ \t]*)$/,
  // 还没输入空格的列表符号、标题、引用（`> ` 带空格的已经转换了）
  /^ {0,3}(?:[-*+]|\d{1,9}[.)]|#{1,6}|>(?:[ \t]*>)*)$/,
  // Callout 的标记（引用里）
  /^\[![A-Za-z]+\][ \t]*$/,
];

/** 段落的第二行起：Setext 下划线 */
// 只有一个 `=`、`-` 的不是下划线（1.5.1 节）
const SETEXT_UNDERLINE = /^ {0,3}(?:={2,}|-{2,})[ \t]*$/;

/** 这一行（段落里的一行；continuation 表示不是段落的第一行）是要等回车才转换的写法 */
export function isDeferredLine(line: string, continuation: boolean): boolean {
  if (continuation && SETEXT_UNDERLINE.test(line)) return true;
  if (isTocMarker(line.trim())) return true;
  return DEFERRED_LINES.some((pattern) => pattern.test(line));
}

/** 自动配对补出来的右半边（E-9）：光标后面只有这些时也算在行尾（输入 `[!NOTE` 时后面那个 `]` 是配对补的） */
const PAIRED_CLOSERS = /^[\])}"'`$\uff09\u3011\u300b\u300d\u300f\u201d\u2019]*$/;

/** 光标所在的那一行源码（连同容器的标记） */
function sourceLineAt(state: EditorState): string {
  const { head } = state.selection;
  const map = buildDocSourceMap(state.doc, { keepBlank: keepBlankAt(head) });
  const text = map.map.text;
  const line = lineAt(text, positionToOffset(map, head));
  return text.slice(line.start, line.end);
}

/** 光标在段落里这一行的末尾，这一行是要等回车才转换的写法 */
export function deferConversion(state: EditorState, replaced: { from: number; to: number }, _fresh: MdNode[]): boolean {
  const { $head, $from, $to, empty } = state.selection;
  // B-6：缩进代码块最后一行的末尾回车，新的一行还空着：Markdown 里缩进代码块不能以空行结尾，
  // 重新解析会把它挪出代码块；光标在这一行上时先不解析，输入了内容就是代码块的一行
  const parent = $head.parent;
  if (parent.type.name === "codeBlock" && parent.attrs.indented && empty && parent.textContent.endsWith("\n") && $head.parentOffset === parent.content.size) {
    const top = $head.index(0);
    return top >= replaced.from && top < replaced.to;
  }
  if ($head.parent.type.name !== "paragraph") return false;
  // 有选区时（如输入围栏后选中了补上的默认语言）：选区在这一行里、到行尾为止才算
  if (!empty) {
    if ($from.parent !== $to.parent || $head.pos !== $to.pos) return false;
    const text = $from.parent.textContent;
    if (text.slice($from.parentOffset, $to.parentOffset).includes("\n")) return false;
  }
  const top = $head.index(0);
  if (top < replaced.from || top >= replaced.to) return false;
  const text = $head.parent.textContent;
  const offset = $head.parentOffset;
  const lineStart = lineStartOf(text, offset);
  const newline = text.indexOf("\n", offset);
  const lineEnd = newline < 0 ? text.length : newline;
  const line = text.slice(lineStart, lineEnd);
  // 像分隔线的一行（如空段落里按 Ctrl+B 得到的 `****`）：光标在这一行任何地方都不转换。连同外面容器的标记一起看：
  // 嵌套列表 `* * ` 里再输入 `* `，最里面一层是空的，整行 `* * * ` 却是分隔线，转换了光标就落在分隔线上（审查 #8）
  if (THEMATIC_BREAK.test(line) || looksLikeThematicBreak(sourceLineAt(state))) return true;
  if (offset !== lineEnd && !PAIRED_CLOSERS.test(line.slice(offset - lineStart))) return false;
  return isDeferredLine(line, lineStart > 0);
}


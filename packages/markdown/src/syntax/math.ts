// 公式（I-3、B-7）：行内 $…$ 和 \(…\)，公式块 $$…$$（可带 {标签}）和 \[…\]
import type { BlockContext, Element, InlineContext, Line, MarkdownConfig } from "@lezer/markdown";

const DOLLAR = 36;
const BACKSLASH = 92;
const OPEN_PAREN = 40;
const CLOSE_PAREN = 41;
const NEWLINE = 10;

export type MathFenceKind = "dollar" | "bracket";

export interface MathFence {
  kind: MathFenceKind;
  /** 围栏这一行从 from 起到内容结束（不含行尾空白）的位置 */
  end: number;
  /** `$$ {标签}` 里的标签 */
  tag: string | null;
}

// `$$`、`$$ {标签}`：标签不能为空，`}` 后面不能再有字符；`$$` 后面只有空白也算
const DOLLAR_FENCE = /^\$\$(?:[ \t]*\{([^\r\n]+)\}|[ \t]*)$/;
const BRACKET_OPEN = /^\\\[[ \t]*$/;
const BRACKET_CLOSE = /^\\\][ \t]*$/;

/** 行尾的 `\r`（CRLF 换行的文件里 Lezer 给的每行都带着它）不算 */
function withoutCr(text: string): string {
  return text.endsWith("\r") ? text.slice(0, -1) : text;
}

/** 从 from 开始读一行公式块的开头围栏；不是就返回 null */
export function readMathOpening(text: string, from: number): MathFence | null {
  const rest = withoutCr(text.slice(from));
  const dollar = DOLLAR_FENCE.exec(rest);
  if (dollar) return { kind: "dollar", end: from + rest.replace(/[ \t]+$/, "").length, tag: dollar[1] ?? null };
  if (BRACKET_OPEN.test(rest)) return { kind: "bracket", end: from + 2, tag: null };
  return null;
}

/** 从 from 开始读一行，看是不是 kind 这种公式块的结尾围栏 */
export function readMathClosing(text: string, from: number, kind: MathFenceKind): MathFence | null {
  const rest = withoutCr(text.slice(from));
  if (kind === "dollar") {
    const dollar = DOLLAR_FENCE.exec(rest);
    return dollar ? { kind, end: from + rest.replace(/[ \t]+$/, "").length, tag: dollar[1] ?? null } : null;
  }
  return BRACKET_CLOSE.test(rest) ? { kind, end: from + 2, tag: null } : null;
}

function relativeIndent(line: Line): number {
  return line.indent - line.baseIndent;
}

/**
 * 这一行是否还在当前容器里。`Line.depth` 是 Lezer 内部字段（它自己的围栏代码块也这样用），
 * 类型声明里没有，单独包一层
 */
export function lineInCurrentContext(cx: BlockContext, line: Line): boolean {
  return (line as unknown as { depth: number }).depth >= cx.depth;
}

// 公式块要有结尾围栏才算（同旧实现和 Typora：`$$` 单独一行、后面没有结尾时是普通文字）。
// Lezer 的块解析器不能往后看，所以解析前先扫一遍全文，记下哪些行后面还有同种的结尾围栏

let openable: Set<number> | null = null;

/** 行首的容器标记：引用的 `>`、列表符号（公式块可以写在列表项的第一行，如 `- $$`） */
const QUOTE_OR_SPACE = /^(?:[ \t]*(?:>|(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)))*[ \t]*/;

/** 扫一遍：后面（任何容器里）有同种结尾围栏的开头行，记下行首偏移 */
export function scanMathOpenings(text: string): Set<number> {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const result = new Set<number>();
  let dollarAfter = false;
  let bracketAfter = false;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const content = lines[index].replace(/\r$/, "").replace(QUOTE_OR_SPACE, "");
    const opening = readMathOpening(content, 0);
    if (opening && (opening.kind === "dollar" ? dollarAfter : bracketAfter)) result.add(starts[index]);
    if (readMathClosing(content, 0, "dollar")) dollarAfter = true;
    if (readMathClosing(content, 0, "bracket")) bracketAfter = true;
  }
  return result;
}

/** 在 run 期间按 text 的扫描结果决定公式块能不能开；不在 run 里时（如单独解析一条引用定义）不限制 */
export function withMathScan<T>(text: string, run: () => T): T {
  const previous = openable;
  openable = scanMathOpenings(text);
  try {
    return run();
  } finally {
    openable = previous;
  }
}

function parseMathBlock(cx: BlockContext, line: Line): boolean {
  if (relativeIndent(line) >= 4) return false;
  if (openable && !openable.has(cx.lineStart)) return false;
  const opening = readMathOpening(line.text, line.pos);
  if (!opening) return false;
  const from = cx.lineStart + line.pos;
  const marks: Element[] = [cx.elt("MathMark", from, cx.lineStart + opening.end)];
  // 和围栏代码块一样：没有结尾围栏时一直到所在容器结束
  while (cx.nextLine() && lineInCurrentContext(cx, line)) {
    for (const marker of line.markers) marks.push(marker);
    const closing = relativeIndent(line) < 4 ? readMathClosing(line.text, line.pos, opening.kind) : null;
    if (closing) {
      marks.push(cx.elt("MathMark", cx.lineStart + line.pos, cx.lineStart + closing.end));
      cx.nextLine();
      break;
    }
    if (line.basePos < line.text.length) {
      marks.push(cx.elt("MathText", cx.lineStart + line.basePos, cx.lineStart + line.text.length));
    }
  }
  cx.addElement(cx.elt("MathBlock", from, cx.prevLineEnd(), marks));
  return true;
}

export const mathBlock: MarkdownConfig = {
  defineNodes: [{ name: "MathBlock", block: true }, "MathMark", "MathText"],
  parseBlock: [
    {
      name: "MathBlock",
      before: "FencedCode",
      parse: parseMathBlock,
      // 和围栏代码块一样可以打断段落（前提是后面有结尾围栏）
      endLeaf: (cx, line) =>
        relativeIndent(line) < 4 && (!openable || openable.has(cx.lineStart)) && readMathOpening(line.text, line.pos) !== null,
    },
  ],
};

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

/** 行尾是硬换行（两个以上空格或反斜杠）时，公式不能跨到下一行 */
function endsWithHardBreak(cx: InlineContext, newline: number): boolean {
  let spaces = 0;
  for (let i = newline - 1; i >= cx.offset && cx.char(i) === 32; i -= 1) spaces += 1;
  if (spaces >= 2) return true;
  return spaces === 0 && newline - 1 >= cx.offset && cx.char(newline - 1) === BACKSLASH;
}

function parseDollarMath(cx: InlineContext, pos: number): number {
  if (cx.char(pos + 1) === DOLLAR) return -1;
  if (pos > cx.offset && cx.char(pos - 1) === DOLLAR) return -1;
  const first = cx.char(pos + 1);
  if (first < 0 || isSpace(first)) return -1;
  for (let i = pos + 1; i < cx.end; i += 1) {
    const code = cx.char(i);
    if (code === BACKSLASH) {
      i += 1;
      continue;
    }
    if (code === NEWLINE && endsWithHardBreak(cx, i)) return -1;
    if (code !== DOLLAR) continue;
    // 第一个没转义的 $ 就是结尾；它前面是空白、后面是数字时整个不算公式（$5 and $10）
    if (isSpace(cx.char(i - 1)) || isDigit(cx.char(i + 1))) return -1;
    return cx.addElement(
      cx.elt("InlineMath", pos, i + 1, [cx.elt("InlineMathMark", pos, pos + 1), cx.elt("InlineMathMark", i, i + 1)]),
    );
  }
  return -1;
}

function parseParenMath(cx: InlineContext, pos: number): number {
  for (let i = pos + 2; i < cx.end - 1; i += 1) {
    const code = cx.char(i);
    if (code !== BACKSLASH) continue;
    if (cx.char(i + 1) === CLOSE_PAREN) {
      return cx.addElement(
        cx.elt("InlineMath", pos, i + 2, [cx.elt("InlineMathMark", pos, pos + 2), cx.elt("InlineMathMark", i, i + 2)]),
      );
    }
    i += 1;
  }
  return -1;
}

export const inlineMath: MarkdownConfig = {
  defineNodes: ["InlineMath", "InlineMathMark"],
  parseInline: [
    {
      name: "InlineMath",
      // 要在反斜杠转义之前：\( 不能先被当成转义吃掉；\$ 留给转义
      before: "Escape",
      parse(cx, next, pos) {
        if (next === DOLLAR) return parseDollarMath(cx, pos);
        if (next === BACKSLASH && cx.char(pos + 1) === OPEN_PAREN) return parseParenMath(cx, pos);
        return -1;
      },
    },
  ],
};

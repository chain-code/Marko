// 按 S-8 的开关组合语法：Lezer 自带的 GFM、上标、下标，加上本目录的扩展（1.3 节）
import type { BlockContext, Line, MarkdownConfig, MarkdownExtension, MarkdownParser } from "@lezer/markdown";
import {
  Autolink,
  parser as commonmark,
  Strikethrough,
  Subscript,
  Superscript,
  TaskList,
} from "@lezer/markdown";
import { cjkEmphasis, emoji } from "./emphasis.ts";
import { footnote } from "./footnote.ts";
import { highlight } from "./highlight.ts";
import { htmlBlock } from "./html.ts";
import { inlineMath, mathBlock } from "./math.ts";
import { table } from "./table.ts";

/** S-8 里影响解析的开关 */
export interface SyntaxOptions {
  html: boolean;
  toc: boolean;
  mermaid: boolean;
  flowchart: boolean;
  sequence: boolean;
  math: boolean;
  /** 行内公式（math 打开时才看；同 Typora 单独一个开关，S-8） */
  inlineMath: boolean;
  footnotes: boolean;
  callout: boolean;
  emoji: boolean;
  highlight: boolean;
  superscript: boolean;
  subscript: boolean;
  autolink: boolean;
}

export const DEFAULT_SYNTAX: Readonly<SyntaxOptions> = Object.freeze({
  html: true,
  toc: true,
  mermaid: true,
  flowchart: true,
  sequence: true,
  math: true,
  inlineMath: true,
  footnotes: true,
  callout: true,
  emoji: true,
  highlight: false,
  superscript: false,
  subscript: false,
  autolink: true,
});

export function resolveSyntax(options?: Partial<SyntaxOptions>): SyntaxOptions {
  return { ...DEFAULT_SYNTAX, ...options };
}

// ---------------------------------------------------------------------------
// 每一行在每层容器里的内容起点。建文档模型时用它去掉容器前缀、取出每行的内容。
// 两个来源：
// 1. 块开始前：一个排在最前面的块解析器，每次尝试开始一个块时记下当前深度的起点（公开接口）；
// 2. 读入一行时：Lezer 逐层检查这一行还在不在各个容器里（引用要有 `>`、列表项要缩进够），
//    这张检查表 skipContextMarkup 是 Lezer 的内部字段，包一层记下每层的起点。
// 第 2 条依赖内部实现，所以 @lezer/markdown 锁定了版本（package.json），升级时跑测试确认

/** 行首偏移 → （容器深度 → 这一层的内容在这一行里从哪里开始） */
export type LineBases = Map<number, Map<number, number>>;

let recording: LineBases | null = null;

function record(lineStart: number, depth: number, base: number): void {
  if (!recording) return;
  let entry = recording.get(lineStart);
  if (!entry) {
    entry = new Map();
    recording.set(lineStart, entry);
  }
  entry.set(depth, base);
}

const lineBaseRecorder: MarkdownConfig = {
  parseBlock: [
    {
      name: "MarkoLineBase",
      before: "LinkReference",
      parse(cx: BlockContext, line: Line) {
        record(cx.lineStart, cx.depth - 1, line.basePos);
        return false;
      },
    },
  ],
};

type SkipHandler = (block: unknown, cx: BlockContext, line: Line) => boolean;

function instrumentContextChecks(parser: MarkdownParser): MarkdownParser {
  const internal = parser as unknown as { skipContextMarkup?: Record<number, SkipHandler> };
  const table = internal.skipContextMarkup;
  if (!table || typeof table !== "object") {
    throw new Error("@lezer/markdown 的内部结构变了（没有 skipContextMarkup），见 syntax/index.ts 的说明");
  }
  const wrapped: Record<number, SkipHandler> = {};
  for (const key of Object.keys(table)) {
    const id = Number(key);
    const handler = table[id];
    wrapped[id] = (block, cx, line) => {
      const matched = handler(block, cx, line);
      if (matched) record(cx.lineStart, (line as unknown as { depth: number }).depth, line.basePos);
      return matched;
    };
  }
  internal.skipContextMarkup = wrapped;
  return parser;
}

/** 在 run 期间记下解析出的每行起点 */
export function recordLineBases<T>(run: () => T): { result: T; bases: LineBases } {
  const previous = recording;
  const bases: LineBases = new Map();
  recording = bases;
  try {
    return { result: run(), bases };
  } finally {
    recording = previous;
  }
}

// ---------------------------------------------------------------------------

function extensionsFor(options: SyntaxOptions): MarkdownExtension[] {
  const extensions: MarkdownExtension[] = [table, TaskList, Strikethrough, cjkEmphasis];
  if (options.autolink) extensions.push(Autolink);
  if (options.math) extensions.push(mathBlock);
  if (options.math && options.inlineMath) extensions.push(inlineMath);
  if (options.footnotes) extensions.push(footnote);
  if (options.highlight) extensions.push(highlight);
  if (options.superscript) extensions.push(Superscript);
  if (options.subscript) extensions.push(Subscript);
  if (options.emoji) extensions.push(emoji);
  // HTML 关掉以后按普通文字处理（S-8）
  if (options.html) extensions.push(htmlBlock);
  else extensions.push({ remove: ["HTMLBlock", "HTMLTag"] });
  return extensions;
}

function cacheKey(options: SyntaxOptions): string {
  return JSON.stringify(Object.keys(options).sort().map((key) => [key, options[key as keyof SyntaxOptions]]));
}

const blockParsers = new Map<string, MarkdownParser>();
const inlineParsers = new Map<string, MarkdownParser>();

/** 整篇解析用的解析器（带每行起点的记录） */
export function blockParser(options: SyntaxOptions): MarkdownParser {
  const key = cacheKey(options);
  let parser = blockParsers.get(key);
  if (!parser) {
    parser = instrumentContextChecks(commonmark.configure([...extensionsFor(options), lineBaseRecorder]));
    blockParsers.set(key, parser);
  }
  return parser;
}

// 只解析行内：把块级语法都去掉，整段文字就只会是段落
const BLOCK_PARSER_NAMES = [
  "LinkReference",
  "IndentedCode",
  "FencedCode",
  "Blockquote",
  "HorizontalRule",
  "BulletList",
  "OrderedList",
  "ATXHeading",
  "HTMLBlock",
  "SetextHeading",
  "Table",
  "TaskList",
  "MathBlock",
  "FootnoteDefinition",
];

/** 文本块的行内原文 → 行内语法树（inline.ts 用） */
export function inlineParser(options: SyntaxOptions): MarkdownParser {
  const key = cacheKey(options);
  let parser = inlineParsers.get(key);
  if (!parser) {
    // remove 里写了不存在的名字时 Lezer 直接忽略
    parser = commonmark.configure([...extensionsFor(options), { remove: BLOCK_PARSER_NAMES }]);
    inlineParsers.set(key, parser);
  }
  return parser;
}

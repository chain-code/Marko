// 字数统计（V-4）：词数（英文按单词、每个汉字算一个词）、字符数（不算空白）、段落数、阅读时间。
// 都按显示出来的文字算：标记、链接地址、引用定义、Front Matter、注释不算
import { decodeHTML } from "entities";
import { inlineFragments } from "../inline.ts";
import { isTextblock, nodeText, type MdNode } from "../model.ts";
import { parse } from "../parse.ts";
import type { SyntaxOptions } from "../syntax/index.ts";
import { collectReferences, referenceChecker } from "./references.ts";
import { plainText } from "./text.ts";
import { walkBlocks } from "./walk.ts";

export interface TextStats {
  words: number;
  chars: number;
}

export interface DocumentStats extends TextStats {
  paragraphs: number;
  readingMinutes: number;
}

export interface StatsOptions {
  /** 阅读速度：每分钟多少词（S-4），默认 350 */
  readingSpeed?: number;
  syntax?: Partial<SyntaxOptions>;
}

const ENGLISH_WORD = /[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*/g;
const CJK = /[一-鿿]/g;

export function textStats(text: string): TextStats {
  const words = (text.match(ENGLISH_WORD)?.length ?? 0) + (text.match(CJK)?.length ?? 0);
  return { words, chars: text.replace(/\s/g, "").length };
}

/** HTML 块显示出来的文字：注释、script、style 不显示 */
function htmlText(node: MdNode): string {
  const text = nodeText(node);
  if (node.attrs?.comment || /^\s*<(?:script|style)\b/i.test(text)) return "";
  return decodeHTML(text.replace(/<[^>]*>/g, " "));
}

/** 一个叶子块显示出来的文字；不显示的块返回空字符串 */
export function visibleText(node: MdNode, syntax?: Partial<SyntaxOptions>, isDefined?: (label: string) => boolean): string {
  if (isTextblock(node.type)) {
    const text = nodeText(node);
    return plainText(text, inlineFragments(text, syntax, isDefined), { images: "none" });
  }
  switch (node.type) {
    case "codeBlock":
    case "diagram":
    case "mathBlock":
      return nodeText(node);
    case "htmlBlock":
      return htmlText(node);
    default:
      return "";
  }
}

/** 段落数按显示出来的块算：表格、定义列表各算一段，引用、列表只是容器 */
export function documentStats(doc: MdNode, options: StatsOptions = {}): DocumentStats {
  const parts: string[] = [];
  let paragraphs = 0;
  // 正在统计的表格或定义列表：里面有文字的块合起来算一段
  let groupPath: number[] | null = null;
  let groupCounted = false;
  const isDefined = referenceChecker(collectReferences(doc, options.syntax));
  walkBlocks(doc, ({ node, path }) => {
    if (groupPath && !(path.length > groupPath.length && groupPath.every((index, i) => path[i] === index))) groupPath = null;
    if (!groupPath && (node.type === "table" || node.type === "definitionList")) {
      groupPath = path;
      groupCounted = false;
      return;
    }
    const text = visibleText(node, options.syntax, isDefined);
    if (!text.trim()) return;
    parts.push(text);
    if (!groupPath || !groupCounted) paragraphs += 1;
    if (groupPath) groupCounted = true;
  });
  const stats = textStats(parts.join("\n"));
  const speed = options.readingSpeed && options.readingSpeed > 0 ? options.readingSpeed : 350;
  return { ...stats, paragraphs, readingMinutes: Math.max(1, Math.ceil(stats.words / speed)) };
}

/** 一段 Markdown 源码的统计（选区、源码模式用） */
export function markdownStats(markdown: string, options: StatsOptions = {}): DocumentStats & { lines: number } {
  const stats = documentStats(parse(markdown, { syntax: options.syntax }), options);
  return { ...stats, lines: markdown ? markdown.split(/\r\n|\r|\n/).length : 0 };
}

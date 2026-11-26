// 字数统计（V-4）：词数（英文按单词、每个汉字算一个词）、字符数（不算空白）、段落数、阅读时间。
// 都按显示出来的文字算：标记、链接地址、引用定义、Front Matter、注释不算
import { decodeHTML } from "entities";
import { inlineFragments } from "../inline.ts";
import { blockChildren, isTextblock, nodeText, type MdNode } from "../model.ts";
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

// ---------------------------------------------------------------------------
// 字数统计（V-4，同 Typora 1.14.17）：按每块的原文数，不按显示出来的文字

/**
 * 词数，同 Typora 字数统计里的算法：中日韩的字（U+3040～U+ABFF、U+D7A4～U+FAFF）每个算一个词；撇号连着后面的字母算在词里（it's 是一个词）；
 * 其余去掉单独成段的标点，按空白和英文标点（`.`、`-`、`/` 除外，example.com 是一个词）切开，一段算一个词。
 * 正则照 Typora 的写（字符类里的圆括号也是要切的字）
 */
export function wordCount(text: string): number {
  if (text.trim().length === 0) return 0;
  let cjk = 0;
  const rest = text
    .replace(/[\u3040-\uABFF\uD7A4-\uFAFF]/g, () => {
      cjk += 1;
      return " ";
    })
    .replace(/['’]\w+/g, "b")
    .replace(/(^|\s+)[(\u3000-\u303F)!-/:-@[-`{-~]+(\s+|$)/gm, " ");
  const parts = ["d", rest, "d"].join(" ").split(/[(\u3000-\u303F)\s!-,\\:-@[-`{-~]+/g).length;
  return cjk + parts - 2;
}

/** 文本块的原文；emoji 前后各加一个零宽空格（Typora 编辑区里 emoji 的文字就是这样，零宽空格也算一段） */
function textblockSource(node: MdNode, syntax?: Partial<SyntaxOptions>, isDefined?: (label: string) => boolean): string {
  const text = nodeText(node);
  const emoji: Array<{ from: number; to: number }> = [];
  const collect = (fragments: ReturnType<typeof inlineFragments>) => {
    for (const fragment of fragments) {
      if (fragment.type === "emoji") emoji.push(fragment);
      else collect(fragment.children);
    }
  };
  collect(inlineFragments(text, syntax, isDefined));
  let result = "";
  let last = 0;
  for (const { from, to } of emoji) {
    result += `${text.slice(last, from)}\u200b${text.slice(from, to)}\u200b`;
    last = to;
  }
  return result + text.slice(last);
}

/**
 * 参与字数统计的文字（同 Typora 的 wordCount.getText）：每个叶子块一段，用换行连起来。
 * 文本块是行内原文（警告框的第一段前面带「[!NOTE]」这种标记）；代码块带语言时是「```语言\n代码```」；
 * 公式块、HTML 块、Front Matter、链接引用定义、缩写定义是原文；目录是「toc」；脚注定义是「标签」+ 内容 +「↩」
 */
export function wordCountText(doc: MdNode, syntax?: Partial<SyntaxOptions>): string {
  const isDefined = referenceChecker(collectReferences(doc, syntax));
  const parts: string[] = [];
  const walk = (node: MdNode, alert: MdNode | null) => {
    if (isTextblock(node.type)) {
      const text = textblockSource(node, syntax, isDefined);
      // Typora 的警告框第一段里有「[!NOTE]」和换行
      parts.push(alert ? `${String(alert.attrs?.marker ?? `[!${String(alert.attrs?.kind ?? "").toUpperCase()}]`)}\n${text}` : text);
      return;
    }
    switch (node.type) {
      case "codeBlock":
      case "diagram": {
        const info = node.attrs?.indented ? "" : String(node.attrs?.info ?? "").trim();
        const code = nodeText(node);
        parts.push(info ? `\`\`\`${info}\n${code}\`\`\`` : code);
        return;
      }
      case "mathBlock":
      case "htmlBlock":
      case "frontMatter":
      case "referenceDefinition":
      case "abbreviationDefinition":
        parts.push(nodeText(node));
        return;
      case "toc":
        parts.push("toc");
        return;
      case "horizontalRule":
        parts.push("");
        return;
      case "footnoteDefinition":
        parts.push(String(node.attrs?.label ?? ""));
        blockChildren(node).forEach((child) => walk(child, null));
        parts.push("↩");
        return;
      default: {
        const children = blockChildren(node);
        children.forEach((child, index) => walk(child, node.type === "alert" && index === 0 ? node : null));
      }
    }
  };
  blockChildren(doc).forEach((child) => walk(child, null));
  return parts.map((part) => `\n${part}`).join("");
}

export interface WordCounts {
  words: number;
  /** 原文的长度（换行算一个，不算 BOM） */
  chars: number;
  /** 原文的行数 */
  lines: number;
  /** 阅读时间：词数除以阅读速度，四舍五入；0 表示不到 1 分钟 */
  minutes: number;
}

/** 原文的字符数、行数（同 Typora：按它内部的原文，换行都是 \n） */
export function sourceCounts(source: string): { chars: number; lines: number } {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return { chars: text.length, lines: (text.match(/\n/g)?.length ?? 0) + 1 };
}

/** 整篇的统计（V-4）：doc 是解析好的文档，source 是原文 */
export function wordCounts(doc: MdNode, source: string, options: StatsOptions = {}): WordCounts {
  const words = wordCount(wordCountText(doc, options.syntax));
  const speed = options.readingSpeed && options.readingSpeed > 0 ? options.readingSpeed : 382;
  return { words, ...sourceCounts(source), minutes: Math.round(words / speed) };
}

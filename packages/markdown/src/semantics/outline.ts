// 标题、锚点 id、大纲（B-2、W-4、B-10）。锚点规则照 Typora 1.14.15 的 titleToAnchor 和 fetchAnchorList
import { inlineFragments } from "../inline.ts";
import { blockChildren, isLeaf, nodeText, type MdNode } from "../model.ts";
import { lineColumn, type SourceMap } from "../positions.ts";
import type { SyntaxOptions } from "../syntax/index.ts";
import { collectReferences, referenceChecker } from "./references.ts";
import { plainText, type PlainTextOptions } from "./text.ts";

export interface OutlineItem {
  level: number;
  /** 标题显示出来的文字 */
  title: string;
  /** 锚点 id；标题没有文字时为空字符串（Typora 不给 id） */
  id: string;
  node: MdNode;
  path: number[];
  /** 标题第一行在源码里的行号（从 1 开始）；没给 map 时为 0 */
  line: number;
}

export interface OutlineOptions extends PlainTextOptions {
  syntax?: Partial<SyntaxOptions>;
  /** 给了时算出每个标题的行号 */
  map?: SourceMap;
  /** 文档里已有的 `<a name="…">` 锚点：标题的锚点和它们重名时也要编号 */
  htmlAnchors?: string[];
  /** 链接引用定义里有没有这个标签；collectOutline 不给时从文档里找 */
  isDefined?: (label: string) => boolean;
}

const PLACEHOLDER = "㌾";

/**
 * Typora 的 titleToAnchor：转小写、去两头空白；长破折号算三个、短破折号算两个、每个空白和连字符各算一个 `-`；
 * 去掉所有 Unicode 标点和 `+`、`=`（`$`、`^`、`` ` ``、`|`、`~`、`<`、`>` 这类符号保留）
 */
export function headingAnchor(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/—/g, PLACEHOLDER.repeat(3))
    .replace(/–/g, PLACEHOLDER.repeat(2))
    .replace(/[\s-]/g, PLACEHOLDER)
    .replace(/\p{P}|\+|=/gu, "")
    .replace(/㌾/g, "-");
}

/** 标题的显示文字：多行的 Setext 标题各行用空格连起来 */
export function headingTitle(node: MdNode, options: OutlineOptions = {}): string {
  const text = nodeText(node);
  return plainText(text, inlineFragments(text, options.syntax, options.isDefined), options).replace(/\s*\n\s*/g, " ").trim();
}

/**
 * 按文档顺序给锚点编号（Typora 的 fetchAnchorList）：和前面的锚点（不分大小写）重名时，第 n 个加 `-n`；
 * 第一个叫 write 的改成 write-1，免得和编辑区的 #write 冲突
 */
export function assignAnchors(titles: string[], htmlAnchors: string[] = []): string[] {
  const seen = [...htmlAnchors];
  return titles.map((title) => {
    let anchor = headingAnchor(title);
    const duplicates = seen.filter((existing) => existing.toLowerCase() === anchor).length;
    seen.push(anchor);
    if (!anchor) return "";
    if (duplicates) return `${anchor}-${duplicates + 1}`;
    if (anchor === "write") anchor += "-1";
    return anchor;
  });
}

/** 文档里所有的标题（含引用、列表、Callout、脚注里的），按文档顺序 */
export function collectHeadings(doc: MdNode): Array<{ node: MdNode; path: number[] }> {
  const result: Array<{ node: MdNode; path: number[] }> = [];
  const walk = (node: MdNode, path: number[]) => {
    if (node.type === "heading") result.push({ node, path });
    if (isLeaf(node.type)) return;
    blockChildren(node).forEach((child, index) => walk(child, [...path, index]));
  };
  walk(doc, []);
  return result;
}

export function collectOutline(doc: MdNode, options: OutlineOptions = {}): OutlineItem[] {
  const headings = collectHeadings(doc);
  const isDefined = options.isDefined ?? referenceChecker(collectReferences(doc, options.syntax));
  const titles = headings.map(({ node }) => headingTitle(node, { ...options, isDefined }));
  const ids = assignAnchors(titles, options.htmlAnchors);
  return headings.map(({ node, path }, index) => {
    const start = options.map?.byNode.get(node)?.starts[0];
    return {
      level: Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1))),
      title: titles[index],
      id: ids[index],
      node,
      path,
      line: start === undefined || !options.map ? 0 : lineColumn(options.map.text, start).line,
    };
  });
}

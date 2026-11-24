// 缩写（B-16）：定义 `*[HTML]: Hyper Text Markup Language`；文中整词出现的 HTML 加虚线下划线，提示全称
import { walkFragments, type Fragment } from "../inline.ts";
import { nodeText, type MdNode } from "../model.ts";
import { readAbbreviationDefinition } from "../syntax/blocks.ts";
import { walkBlocks } from "./walk.ts";

export interface AbbreviationInfo {
  label: string;
  title: string;
  node: MdNode;
  path: number[];
}

export interface AbbreviationMatch {
  from: number;
  to: number;
  label: string;
  title: string;
}

/** 定义按出现顺序，同名的只认第一个 */
export function collectAbbreviations(doc: MdNode): Map<string, AbbreviationInfo> {
  const result = new Map<string, AbbreviationInfo>();
  walkBlocks(doc, ({ node, path }) => {
    if (node.type !== "abbreviationDefinition") return;
    const definition = readAbbreviationDefinition(String(node.attrs?.indent ?? "") + nodeText(node));
    if (definition && !result.has(definition.label)) result.set(definition.label, { ...definition, node, path });
  });
  return result;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 代码、公式、HTML、网址和链接地址里不标缩写；链接文字里照常标 */
function excludedRanges(fragments: Fragment[]): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  walkFragments(fragments, (fragment) => {
    switch (fragment.type) {
      case "code":
      case "math":
      case "html":
      case "comment":
      case "url":
      case "autolink":
      case "image":
      case "entity":
      case "footnoteReference":
      case "emoji":
        ranges.push({ from: fragment.from, to: fragment.to });
        return;
      default:
        for (const mark of fragment.marks) ranges.push(mark);
    }
  });
  return ranges;
}

/** 一个文本块里出现的缩写（整词：前后不是字母、数字、下划线） */
export function findAbbreviations(text: string, fragments: Fragment[], abbreviations: Map<string, AbbreviationInfo>): AbbreviationMatch[] {
  if (!abbreviations.size || !text) return [];
  const excluded = excludedRanges(fragments);
  const matches: AbbreviationMatch[] = [];
  for (const abbreviation of abbreviations.values()) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(abbreviation.label)})(?=$|[^\\p{L}\\p{N}_])`, "gu");
    for (const match of text.matchAll(pattern)) {
      const from = (match.index ?? 0) + match[1].length;
      const to = from + match[2].length;
      if (excluded.some((range) => from < range.to && to > range.from)) continue;
      matches.push({ from, to, label: abbreviation.label, title: abbreviation.title });
    }
  }
  // 长的优先：重叠时只留先出现的、更长的那个
  matches.sort((left, right) => left.from - right.from || right.to - left.to);
  const result: AbbreviationMatch[] = [];
  for (const match of matches) if (!result.length || match.from >= result[result.length - 1].to) result.push(match);
  return result;
}

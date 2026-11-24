// 快速打开（F-4）的候选和排序：fzf 模糊匹配（连续命中、命中词首的分高；空格分开的几段都要匹配，同 fzf 命令行）；
// 分数一样时最近打开过的在前，再短的在前。没输入时最近打开过的在前，其余按名称
import { byLengthAsc, extendedMatch, Fzf, type FzfResultItem } from "fzf";
import type { RecentFile } from "@marko/shared";
import { basename, dirname } from "./paths.ts";
import type { WorkspaceFile } from "./composables/useWorkspace.ts";

/** 最多列这么多个（F-4） */
export const QUICK_OPEN_LIMIT = 30;

export interface QuickOpenCandidate {
  path: string;
  name: string;
  /** 显示的目录：工作区里是相对工作区的，最近文件是完整的 */
  directory: string;
  /** 最近打开的名次（0 是最近的）；没打开过是 Infinity */
  recent: number;
}

export interface QuickOpenItem extends QuickOpenCandidate {
  /** 名字、目录里命中的字的下标 */
  nameHits: number[];
  directoryHits: number[];
}

/** 匹配用的文字：目录/文件名（输入里带目录名也能找到） */
function textOf(candidate: QuickOpenCandidate): string {
  return candidate.directory ? `${candidate.directory}/${candidate.name}` : candidate.name;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** 工作区里的文件（有工作区时），否则最近文件 */
export function quickOpenCandidates(files: WorkspaceFile[] | null, recent: RecentFile[]): QuickOpenCandidate[] {
  const rank = new Map(recent.map((file, index) => [file.path, index]));
  if (files) {
    return files.map((file) => ({ path: file.path, name: file.name, directory: file.directory, recent: rank.get(file.path) ?? Infinity }));
  }
  return recent.map((file, index) => ({ path: file.path, name: basename(file.path), directory: dirname(file.path), recent: index }));
}

const byRecent = (left: FzfResultItem<QuickOpenCandidate>, right: FzfResultItem<QuickOpenCandidate>) => {
  const a = left.item.recent;
  const b = right.item.recent;
  return a === b ? 0 : a < b ? -1 : 1;
};

export function quickOpenItems(candidates: QuickOpenCandidate[], query: string): QuickOpenItem[] {
  const text = query.trim();
  if (!text) {
    return [...candidates]
      .sort((left, right) => (left.recent !== right.recent ? (left.recent < right.recent ? -1 : 1) : collator.compare(textOf(left), textOf(right))))
      .slice(0, QUICK_OPEN_LIMIT)
      .map((candidate) => ({ ...candidate, nameHits: [], directoryHits: [] }));
  }
  const fzf = new Fzf(candidates, {
    selector: textOf,
    limit: QUICK_OPEN_LIMIT,
    casing: "case-insensitive",
    match: extendedMatch,
    tiebreakers: [byRecent, byLengthAsc],
  });
  return fzf.find(text).map((result) => {
    const candidate = result.item;
    const nameStart = textOf(candidate).length - candidate.name.length;
    const hits = [...result.positions].sort((left, right) => left - right);
    return {
      ...candidate,
      nameHits: hits.filter((index) => index >= nameStart).map((index) => index - nameStart),
      directoryHits: hits.filter((index) => index < candidate.directory.length),
    };
  });
}

/** 显示用：按命中的字分段（命中的高亮） */
export function hitSegments(text: string, hits: number[]): Array<{ text: string; hit: boolean }> {
  const set = new Set(hits);
  const segments: Array<{ text: string; hit: boolean }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const hit = set.has(index);
    const last = segments[segments.length - 1];
    if (last && last.hit === hit) last.text += text[index];
    else segments.push({ text: text[index], hit });
  }
  return segments;
}

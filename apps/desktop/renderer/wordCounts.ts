// V-3、V-4：选区的统计和状态栏上的字数（同 Typora）。选区按选中的那段原文数：词数同整篇的算法、字符数是长度、行数是行数
import { getMarkdownWithSelection } from "@marko/editor";
import { sourceCounts, wordCount } from "@marko/markdown";
import type { Editor } from "@tiptap/core";
import { t } from "./i18n.ts";

export type WordCountMetric = "words" | "chars" | "lines" | "minutes";

export interface SelectionCounts {
  words: number;
  chars: number;
  lines: number;
}

/** 没有选区时是 null */
export function selectionCounts(editor: Editor): SelectionCounts | null {
  if (editor.state.selection.empty) return null;
  const { value, anchor, head } = getMarkdownWithSelection(editor);
  // 选区的位置连同开头的 BOM 一起算（同 getMarkdownWithSelection）
  const selected = value.slice(Math.min(anchor, head), Math.max(anchor, head)).replace(/^﻿/, "");
  if (!selected) return null;
  return { words: wordCount(selected), ...sourceCounts(selected) };
}

/** 单位：复数和单数（英文的 Words / Word；中文一样） */
const UNITS = {
  words: ["wordCount.words", "wordCount.word"],
  chars: ["wordCount.chars", "wordCount.char"],
  lines: ["wordCount.lines", "wordCount.line"],
  minutes: ["wordCount.minutes", "wordCount.minute"],
} as const;

export function wordCountUnit(metric: WordCountMetric, count: number): string {
  return t(UNITS[metric][count === 1 ? 1 : 0]);
}

/**
 * 状态栏上的文字（同 Typora 的 updateLabel）：「167 词」；选中的比 0 多、比全文少时「6 / 167 词」；阅读时间为 0 时「≤ 1 分钟」；
 * 数是 1 时用单数（英文的 1 Word）
 */
export function wordCountLabel(metric: WordCountMetric, total: number, selected: number | null): string {
  if (selected !== null && selected > 0 && selected < total) return `${selected} / ${total} ${wordCountUnit(metric, total)}`;
  if (metric === "minutes" && total === 0) return `${t("wordCount.lessThanOne")} ${wordCountUnit(metric, 1)}`;
  return `${total} ${wordCountUnit(metric, total)}`;
}

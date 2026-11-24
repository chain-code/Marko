// V-3、V-4：选区的字数按显示出来的文字算（同整篇：标记、链接地址、图片这些不算）——选中的那段原文按 Markdown 解析后数，行数按原文的行
import { getMarkdownWithSelection } from "@marko/editor";
import { markdownStats } from "@marko/markdown";
import type { Editor } from "@tiptap/core";

export interface SelectionStats {
  words: number;
  chars: number;
  lines: number;
}

/** 没有选区时是 null */
export function selectionStats(editor: Editor): SelectionStats | null {
  if (editor.state.selection.empty) return null;
  const { value, anchor, head } = getMarkdownWithSelection(editor);
  // 选区的位置连同开头的 BOM 一起算（同 getMarkdownWithSelection）
  const selected = value.slice(Math.min(anchor, head), Math.max(anchor, head)).replace(/^﻿/, "");
  const { words, chars, lines } = markdownStats(selected, { syntax: editor.storage.marko.syntax });
  return { words, chars, lines };
}

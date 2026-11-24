// ==高亮==（I-4）。上标、下标用 Lezer 自带的 Superscript、Subscript
import type { MarkdownConfig } from "@lezer/markdown";

const EQUALS = 61;
const HighlightDelimiter = { resolve: "Highlight", mark: "HighlightMark" };
const PUNCTUATION = /[\p{P}\p{S}]/u;

export const highlight: MarkdownConfig = {
  defineNodes: ["Highlight", "HighlightMark"],
  parseInline: [
    {
      name: "Highlight",
      after: "Emphasis",
      // 左右侧的判断同 Lezer 的删除线（GFM 的规则）
      parse(cx, next, pos) {
        if (next !== EQUALS || cx.char(pos + 1) !== EQUALS || cx.char(pos + 2) === EQUALS) return -1;
        if (pos > cx.offset && cx.char(pos - 1) === EQUALS) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const spaceBefore = /\s|^$/.test(before);
        const spaceAfter = /\s|^$/.test(after);
        const punctuationBefore = PUNCTUATION.test(before);
        const punctuationAfter = PUNCTUATION.test(after);
        return cx.addDelimiter(
          HighlightDelimiter,
          pos,
          pos + 2,
          !spaceAfter && (!punctuationAfter || spaceBefore || punctuationBefore),
          !spaceBefore && (!punctuationBefore || spaceAfter || punctuationAfter),
        );
      },
    },
  ],
};

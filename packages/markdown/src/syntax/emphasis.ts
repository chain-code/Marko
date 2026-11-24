// 强调（I-1）：替换 Lezer 自带的同名解析器。CommonMark 的左右侧规则之外，紧挨着中日韩文字时也能开、闭强调，
// 同 Typora：`中_em_文`、`这是**"引号"**。` 是强调，英文词中间的 `a_b_c` 仍然不是
import { InlineContext, type MarkdownConfig } from "@lezer/markdown";

const PUNCTUATION = /[\p{P}\p{S}]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;

export const cjkEmphasis: MarkdownConfig = {
  parseInline: [
    {
      name: "Emphasis",
      parse(cx, next, start) {
        if (next !== 95 && next !== 42) return -1;
        let pos = start + 1;
        while (cx.char(pos) === next) pos += 1;
        const before = cx.slice(start - 1, start);
        const after = cx.slice(pos, pos + 1);
        const punctuationBefore = PUNCTUATION.test(before);
        const punctuationAfter = PUNCTUATION.test(after);
        const spaceBefore = /\s|^$/.test(before);
        const spaceAfter = /\s|^$/.test(after);
        const cjkBefore = CJK.test(before);
        const cjkAfter = CJK.test(after);
        const leftFlanking = !spaceAfter && (!punctuationAfter || spaceBefore || punctuationBefore || cjkBefore);
        const rightFlanking = !spaceBefore && (!punctuationBefore || spaceAfter || punctuationAfter || cjkAfter);
        const asterisk = next === 42;
        const canOpen = leftFlanking && (asterisk || !rightFlanking || punctuationBefore || cjkBefore);
        const canClose = rightFlanking && (asterisk || !leftFlanking || punctuationAfter || cjkAfter);
        return cx.addDelimiter(asterisk ? InlineContext.emphasisAsterisk : InlineContext.emphasisUnderscore, start, pos, canOpen, canClose);
      },
    },
  ],
};

/** `:shortcode:`（I-5）：替换 Lezer 自带的，GitHub 的 shortcode 里有 `+1`、`-1` 这种带符号的 */
export const emoji: MarkdownConfig = {
  defineNodes: ["Emoji"],
  parseInline: [
    {
      name: "Emoji",
      parse(cx, next, pos) {
        if (next !== 58) return -1;
        const match = /^[a-zA-Z0-9_+-]+:/.exec(cx.slice(pos + 1, cx.end));
        if (!match) return -1;
        return cx.addElement(cx.elt("Emoji", pos, pos + 1 + match[0].length));
      },
    },
  ],
};

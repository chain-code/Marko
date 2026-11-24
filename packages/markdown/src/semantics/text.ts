// 文本块的显示文字：去掉标记、解开转义和实体（大纲标题、锚点、字数统计、脚注摘要共用）
import { decodeHTML } from "entities";
import type { Fragment } from "../inline.ts";

export interface PlainTextOptions {
  /** 图片：显示替代文字，还是不算 */
  images?: "alt" | "none";
  /** 把 `:smile:` 换成 emoji；不给时保留原文 */
  resolveEmoji?: (shortcode: string) => string | undefined;
}

/** CommonMark：行内代码两头各有一个空格（且不全是空格）时各去掉一个；换行当空格 */
function codeText(raw: string): string {
  const text = raw.replace(/\r?\n/g, " ");
  return text.length >= 2 && text.startsWith(" ") && text.endsWith(" ") && text.trim() ? text.slice(1, -1) : text;
}

function render(text: string, from: number, to: number, fragments: Fragment[], options: PlainTextOptions): string {
  let result = "";
  let cursor = from;
  for (const fragment of fragments) {
    if (fragment.to <= from || fragment.from >= to) continue;
    result += text.slice(cursor, fragment.from);
    cursor = fragment.to;
    const content = fragment.content;
    switch (fragment.type) {
      case "code":
        result += content ? codeText(text.slice(content.from, content.to)) : "";
        break;
      case "math":
        result += content ? text.slice(content.from, content.to) : "";
        break;
      case "image":
        if (options.images !== "none" && content) result += render(text, content.from, content.to, [], options);
        break;
      case "autolink":
      case "url":
        result += text.slice(fragment.url?.from ?? fragment.from, fragment.url?.to ?? fragment.to);
        break;
      case "html":
      case "comment":
        break;
      case "entity":
        result += decodeHTML(text.slice(fragment.from, fragment.to));
        break;
      case "escape":
        result += content ? text.slice(content.from, content.to) : "";
        break;
      case "hardBreak":
        result += "\n";
        break;
      case "footnoteReference":
        result += fragment.label ? text.slice(fragment.label.from, fragment.label.to) : "";
        break;
      case "emoji": {
        const raw = text.slice(fragment.from, fragment.to);
        result += options.resolveEmoji?.(raw.slice(1, -1)) ?? raw;
        break;
      }
      default:
        // 强调、链接等：只留内容
        result += content ? render(text, content.from, content.to, fragment.children, options) : "";
    }
  }
  return result + text.slice(cursor, to);
}

/** 行内原文 → 显示出来的文字（软换行保留为 "\n"） */
export function plainText(text: string, fragments: Fragment[], options: PlainTextOptions = {}): string {
  return render(text, 0, text.length, fragments, options);
}

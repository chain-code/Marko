// :shortcode: → emoji（I-5），用 GitHub 的 shortcode 表（emojibase-data）。只认小写（同 Typora）
import github from "emojibase-data/en/shortcodes/github.json";

let table: Map<string, string> | null = null;

function emojiTable(): Map<string, string> {
  if (table) return table;
  table = new Map();
  for (const [hexcode, names] of Object.entries(github as Record<string, string | string[]>)) {
    const char = hexcode
      .split("-")
      .map((code) => String.fromCodePoint(Number.parseInt(code, 16)))
      .join("");
    for (const name of Array.isArray(names) ? names : [names]) table.set(name, char);
  }
  return table;
}

/** shortcode（不含两边的冒号）对应的 emoji；不认识的返回 undefined */
export function emojiFor(shortcode: string): string | undefined {
  if (shortcode !== shortcode.toLowerCase()) return undefined;
  return emojiTable().get(shortcode);
}

/** 补全用：所有 shortcode */
export function emojiShortcodes(): string[] {
  return [...emojiTable().keys()];
}

// 查找替换的条件和状态（排版视图用 prosemirror-search，源码模式用 @codemirror/search，两边共用）

export interface FindOptions {
  /** 要找的文字（正则时是正则表达式） */
  search: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regexp?: boolean;
  /** 替换成（正则时可以用 $1 引用分组，N-2） */
  replace?: string;
}

export interface FindStatus {
  /** 当前是第几个（从 1 开始；选区不在某个匹配上时为 0） */
  current: number;
  total: number;
  /** 正则写错了 */
  invalid: boolean;
}

/**
 * 边输入查找文字边跳到的匹配（N-1，同旧版）：和选区一样的、和选区重叠的（接着输入时留在原处）、选区之后的第一个；
 * 都没有时回到第一个。matches 按位置排好
 */
export function nearestMatch<T extends { from: number; to: number }>(matches: readonly T[], from: number, to: number): T | null {
  if (!matches.length) return null;
  if (to > from) {
    const exact = matches.find((match) => match.from === from && match.to === to);
    if (exact) return exact;
    const overlapping = matches.find((match) => match.from < to && match.to > from);
    if (overlapping) return overlapping;
  }
  return matches.find((match) => match.from >= to) ?? matches[0];
}

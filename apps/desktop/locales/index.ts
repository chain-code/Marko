// 界面文字（L-2、通用规则 8）：每种语言一份 JSON（这个目录里的 *.json，文件名就是语言代码），结构和 zh-CN.json 相同。
// 主进程（@intlify/core-base）和渲染进程（vue-i18n）用同一份、同一种消息写法；加一种语言只要放一份翻译文件进来
/// <reference types="vite/types/importMeta.d.ts" />
import zhCN from "./zh-CN.json";

export type MessageSchema = typeof zhCN;

/** 中文是默认语言（0.4 第 13 条），也是缺了翻译时的后备 */
export const DEFAULT_LOCALE = "zh-CN";

const files = import.meta.glob<MessageSchema>("./*.json", { eager: true, import: "default" });

/** 语言代码 → 这种语言的全部文字 */
export const LOCALES: Record<string, MessageSchema> = Object.fromEntries(
  Object.entries(files).map(([path, messages]) => [path.replace(/^.*\/([^/]+)\.json$/, "$1"), messages]),
);

/** 有哪些语言（S-10「界面语言」的选项）：代码和这种语言自己的名字 */
export function availableLocales(): Array<{ code: string; name: string }> {
  return Object.entries(LOCALES)
    .map(([code, messages]) => ({ code, name: messages.meta.name }))
    .sort((left, right) => (left.code === DEFAULT_LOCALE ? -1 : right.code === DEFAULT_LOCALE ? 1 : left.code.localeCompare(right.code)));
}

/** 设置里的语言 → 有翻译的语言；没有的用中文 */
export function localeOf(language: string): string {
  return language in LOCALES ? language : DEFAULT_LOCALE;
}

/** "a.b.c" 这样的消息路径（以 zh-CN.json 为准）：代码里写错了路径，类型检查就报错 */
type Paths<T> = { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}` }[keyof T & string];

export type MessageKey = Paths<MessageSchema>;

/** 消息里 {name} 换成的值 */
export type MessageParams = Record<string, string | number>;

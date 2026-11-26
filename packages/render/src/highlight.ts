// 静态代码高亮（B-6、O-1）：Lezer 的语法 + CodeMirror 5 的类名（cm-keyword 等）。
// 类名同 Typora 导出的代码块，Typora 的主题能直接套（A-3）；编辑时的 CodeMirror 6 用同一张表（codeHighlighter），
// 语言表同是 @codemirror/language-data，颜色由主题给出（1.11 节）
import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import type { Parser } from "@lezer/common";
import { highlightCode, tagHighlighter, tags as t } from "@lezer/highlight";
import { escapeHtml } from "./escape.ts";

/**
 * Lezer 的记号 → CodeMirror 5 的类名。子记号没单列的跟父记号走（controlKeyword → keyword）；
 * 带修饰的（definition(variableName)）优先于不带的
 */
export const codeHighlighter = tagHighlighter([
  { tag: t.keyword, class: "cm-keyword" },
  { tag: [t.atom, t.bool, t.null, t.color], class: "cm-atom" },
  { tag: [t.number, t.unit], class: "cm-number" },
  { tag: [t.string, t.attributeValue], class: "cm-string" },
  { tag: [t.special(t.string), t.regexp, t.escape], class: "cm-string-2" },
  { tag: t.comment, class: "cm-comment" },
  { tag: [t.meta, t.macroName], class: "cm-meta" },
  { tag: t.variableName, class: "cm-variable" },
  { tag: [t.local(t.variableName), t.special(t.variableName), t.labelName], class: "cm-variable-2" },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], class: "cm-def" },
  { tag: t.standard(t.variableName), class: "cm-builtin" },
  { tag: [t.typeName, t.className, t.namespace], class: "cm-variable-3" },
  { tag: t.propertyName, class: "cm-property" },
  { tag: t.attributeName, class: "cm-attribute" },
  { tag: t.tagName, class: "cm-tag" },
  { tag: t.angleBracket, class: "cm-tag cm-bracket" },
  { tag: t.operator, class: "cm-operator" },
  // 一级、二级标题另加级别（同 Typora 的源代码模式，标题按级别放大）
  { tag: t.heading1, class: "cm-header cm-header1" },
  { tag: t.heading2, class: "cm-header cm-header2" },
  { tag: t.heading, class: "cm-header" },
  { tag: t.quote, class: "cm-quote" },
  { tag: t.list, class: "cm-variable-2" },
  { tag: [t.link, t.url], class: "cm-link" },
  { tag: t.emphasis, class: "cm-em" },
  { tag: t.strong, class: "cm-strong" },
  { tag: t.strikethrough, class: "cm-strikethrough" },
  { tag: t.monospace, class: "cm-comment" },
  { tag: t.contentSeparator, class: "cm-hr" },
  { tag: t.inserted, class: "cm-positive" },
  { tag: t.deleted, class: "cm-negative" },
  { tag: t.invalid, class: "cm-error" },
]);

const loaded = new Map<string, Parser>();
const loading = new Map<string, Promise<Parser | null>>();

/** 信息串里的语言名 → 语言（名字、别名、扩展名都认，不分大小写） */
export function findLanguage(name: string): LanguageDescription | null {
  const key = name.trim().split(/\s+/)[0] ?? "";
  if (!key) return null;
  return LanguageDescription.matchLanguageName(languages, key, false) ?? LanguageDescription.matchFilename(languages, `file.${key}`);
}

/** 语言的解析器是按需加载的；加载完以后 highlightLines 才有颜色 */
export function loadLanguage(name: string): Promise<Parser | null> {
  const description = findLanguage(name);
  if (!description) return Promise.resolve(null);
  const ready = loaded.get(description.name);
  if (ready) return Promise.resolve(ready);
  let pending = loading.get(description.name);
  if (!pending) {
    pending = description.load().then(
      (support) => {
        loaded.set(description.name, support.language.parser);
        return support.language.parser;
      },
      () => null,
    );
    loading.set(description.name, pending);
  }
  return pending;
}

/** 导出前把文档里用到的语言都加载好 */
export async function loadLanguages(names: Iterable<string>): Promise<void> {
  await Promise.all([...new Set(names)].map((name) => loadLanguage(name)));
}

/** 已经加载好的语言的解析器；没有就返回 null（这时输出不带颜色的代码，并在后台加载） */
export function loadedParser(name: string): Parser | null {
  const description = findLanguage(name);
  return description ? (loaded.get(description.name) ?? null) : null;
}

/** 代码 → 每行一段带 cm-* 类名的 HTML（行数和 code.split("\n") 一样） */
export function highlightLines(code: string, language: string): string[] {
  const parser = loadedParser(language);
  if (!parser) {
    if (language) void loadLanguage(language);
    return code.split("\n").map((line) => escapeHtml(line));
  }
  const lines = [""];
  highlightCode(
    code,
    parser.parse(code),
    codeHighlighter,
    (text, classes) => {
      lines[lines.length - 1] += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text);
    },
    () => {
      lines.push("");
    },
  );
  return lines;
}

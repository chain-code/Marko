// 对外的设置 → 编辑器（@marko/editor）的设置、语法开关（应用和组件内部用，不在库的类型声明里）
import type { EditorSettings as CoreSettings } from "@marko/editor";
import type { SyntaxOptions } from "@marko/markdown";
import type { EditorSettings, LineEnding } from "./types.ts";

/** S-3「默认换行符」：自动时跟着系统（Windows 上是 CRLF） */
export function eolOf(lineEnding: LineEnding): "\n" | "\r\n" {
  if (lineEnding === "crlf") return "\r\n";
  if (lineEnding === "lf") return "\n";
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "\r\n" : "\n";
}

/** 编辑器（@marko/editor）的设置 */
export function coreSettings(settings: EditorSettings): CoreSettings {
  return {
    defaultEol: eolOf(settings.defaultLineEnding),
    indentSize: settings.indentSize,
    codeIndentSize: settings.codeIndentSize,
    codeLineNumbers: settings.codeLineNumbers,
    codeLineWrapping: settings.codeWrap,
    shiftTabAutoIndent: settings.shiftTabAutoIndent,
    autoPair: settings.autoPair,
    emojiAutoComplete: settings.emojiAutocomplete === "automatic" ? "auto" : settings.emojiAutocomplete === "escape" ? "esc" : "off",
    copyMarkdownSource: settings.copyMarkdownAsPlainText,
    defaultCodeLanguage: settings.defaultCodeLanguage,
    defaultCodeLanguageApplyTo: settings.defaultCodeLanguageApplyTo,
    typewriterCenter: settings.typewriterCenter,
    mathNumbering: settings.autoNumberingForMath === false ? "none" : settings.autoNumberingForMath,
    preserveSingleLineBreaks: settings.preserveSingleLineBreaks,
    smartQuotes: settings.smartQuotes,
    smartDashes: settings.smartDashes,
    keyBindings: settings.keyBindings,
  };
}

/** 语法开关（S-8） */
export function coreSyntax(settings: EditorSettings): SyntaxOptions {
  const { extensions } = settings;
  return {
    html: extensions.html,
    toc: extensions.toc,
    mermaid: extensions.mermaid,
    flowchart: extensions.flowchart,
    sequence: extensions.sequence,
    math: extensions.math,
    // 行内公式：桌面应用另外给（S-8，同 Typora 默认关）；编辑器库的设置里没有这一项，跟着 math
    inlineMath: (extensions as { inlineMath?: boolean }).inlineMath ?? true,
    footnotes: extensions.footnote,
    callout: extensions.alerts,
    emoji: extensions.emoji,
    highlight: extensions.highlight,
    superscript: extensions.superscript,
    subscript: extensions.subscript,
    autolink: extensions.autoLinks,
  };
}

// 编辑器用到的设置（S 章里和编辑行为有关的）。默认值同旧版
import type { MathNumbering } from "@marko/render";

export interface EditorSettings {
  /**
   * S-12：命令的快捷键（命令名 → ProseMirror 写法的键，null 表示不处理）；不在里面的用默认的（plugins/commandKeys.ts）。
   * 桌面应用按「偏好设置 → 快捷键」给，和菜单一致
   */
  keyBindings?: Readonly<Record<string, string | null>>;
  /** S-5「Markdown 缩进宽度」：列表缩进、新列表项内容的缩进 */
  indentSize: number;
  /** S-7「代码缩进宽度」 */
  codeIndentSize: number;
  /** S-7「显示行号」 */
  codeLineNumbers: boolean;
  /** S-7「长代码自动换行」 */
  codeLineWrapping: boolean;
  /** S-5「Shift+Tab 自动缩进」 */
  shiftTabAutoIndent: boolean;
  /** S-5「自动配对」（E-9） */
  autoPair: boolean;
  /** S-5「Emoji 自动完成」（I-5）：自动触发、按 Esc 触发、关闭 */
  emojiAutoComplete: "auto" | "esc" | "off";
  /** S-5「默认复制 Markdown 源码」（C-1）：复制时纯文本是源码还是去掉标记的文字 */
  copyMarkdownSource: boolean;
  /** S-3「默认换行符」（E-1）：新文档（打开时没有换行的文档）用的换行符；有换行的文件沿用它自己的 */
  defaultEol: "\n" | "\r\n";
  /** S-7「默认语言」：新代码块的语言；空串表示不指定，LAST_CODE_LANGUAGE 表示最近使用的（光标最后待过的代码块的语言，同旧版） */
  defaultCodeLanguage: string;
  /** S-7「应用时机」：通过 Markdown 输入（E-4）、通过菜单插入时是否套用默认语言 */
  defaultCodeLanguageApplyTo: "markdown" | "menu" | "both";
  /** S-6「打字机模式保持居中」（V-2） */
  typewriterCenter: boolean;
  /** S-8「公式自动编号」（D-2）：不编号、只给 AMS 环境编号、所有公式块都编号 */
  mathNumbering: MathNumbering;
  /** S-6「保留单个换行」：只影响显示 */
  preserveSingleLineBreaks: boolean;
  /** S-6「智能引号」「智能破折号与省略号」：只影响显示（E-10） */
  smartQuotes: boolean;
  smartDashes: boolean;
}

/** S-7「默认语言」选「最近使用」时 defaultCodeLanguage 的值（旧版库的设置也用它） */
export const LAST_CODE_LANGUAGE = "__LAST";

export const DEFAULT_SETTINGS: EditorSettings = {
  indentSize: 2,
  codeIndentSize: 4,
  codeLineNumbers: false,
  codeLineWrapping: false,
  shiftTabAutoIndent: false,
  autoPair: true,
  copyMarkdownSource: false,
  defaultEol: "\n",
  emojiAutoComplete: "auto",
  defaultCodeLanguage: "",
  defaultCodeLanguageApplyTo: "markdown",
  preserveSingleLineBreaks: false,
  typewriterCenter: true,
  mathNumbering: "none",
  smartQuotes: true,
  smartDashes: true,
};

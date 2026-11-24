// 按行识别的扩展语法：目录（B-10）、Callout（B-13）、缩写定义（B-16）、定义列表（B-14）、Front Matter（B-9）。
// 这几种在 Lezer 的语法树上是段落或引用，由 parse.ts 在建文档模型时认出来

/** `[TOC]`、`[[_TOC_]]`、`{:toc}`、`{: toc depth=3 }`，大小写不限，单独一段，缩进不超过 3 */
const TOC_PATTERN = /^ {0,3}(?:\[toc\]|\[\[_toc_\]\]|\{:[ \t]*toc(?:[ \t]+[^}\r\n]*)?[ \t]*\})[ \t]*$/i;

export function isTocMarker(text: string): boolean {
  return TOC_PATTERN.test(text);
}

export const ALERT_KINDS = ["note", "tip", "important", "warning", "caution"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

const ALERT_PATTERN = /^[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;

/** 引用第一行是 `[!NOTE]` 等五种之一时返回种类（大小写不限） */
export function readAlertMarker(line: string): AlertKind | null {
  const match = ALERT_PATTERN.exec(line);
  return match ? (match[1].toLowerCase() as AlertKind) : null;
}

const ABBREVIATION_PATTERN = /^[ \t]{0,3}\*\[([^\]\n]+)\]:[ \t]*(.+?)\s*$/;

export interface AbbreviationDefinitionSyntax {
  label: string;
  title: string;
}

/** `*[HTML]: Hyper Text Markup Language`：全称不能为空 */
export function readAbbreviationDefinition(line: string): AbbreviationDefinitionSyntax | null {
  const match = ABBREVIATION_PATTERN.exec(line);
  if (!match) return null;
  const label = match[1].trim();
  const title = match[2].trim();
  return label && title ? { label, title } : null;
}

const DEFINITION_MARKER = /^[ \t]{0,3}:(?:[ \t]+|$)/;

/** 定义列表说明行开头的 `: `；返回冒号和后面空白的长度 */
export function readDefinitionMarker(line: string): number | null {
  const match = DEFINITION_MARKER.exec(line);
  return match ? match[0].length : null;
}

// 能单独成为词条的行：不是空行、不是缩进代码，也不是会开始别的块的行
const NOT_A_TERM =
  /^[ \t]{0,3}(?:#{1,6}(?:[ \t]|$)|[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|(?:-[ \t]*){3,}$|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$|\[[^\]\n]+\]:[ \t]*\S|\[\^[^\]\n]+\]:|\||>|```|~~~)/;

export function isDefinitionTermLine(line: string): boolean {
  if (!line.trim()) return false;
  if (/^(?: {4}|\t| {1,3}\t)/.test(line)) return false;
  if (readDefinitionMarker(line) !== null) return false;
  return !NOT_A_TERM.test(line);
}

/** 列宽：制表符按 4 列对齐 */
export function columnWidth(text: string, from = 0, to = text.length, startColumn = 0): number {
  let column = startColumn;
  for (let i = from; i < to; i += 1) column += text.charCodeAt(i) === 9 ? 4 - (column % 4) : 1;
  return column;
}

/** 行首空白的列宽 */
export function leadingIndent(line: string): number {
  const match = /^[ \t]*/.exec(line);
  return columnWidth(match ? match[0] : "");
}

/** 去掉行首至多 columns 列的空白；制表符跨过边界时整个去掉（同旧实现） */
export function stripIndent(line: string, columns: number): { text: string; removed: number } {
  let column = 0;
  let index = 0;
  while (index < line.length && column < columns) {
    const code = line.charCodeAt(index);
    if (code === 32) column += 1;
    else if (code === 9) column += 4 - (column % 4);
    else break;
    index += 1;
  }
  return { text: line.slice(index), removed: index };
}

const FRONT_MATTER_OPEN = /^---[ \t]*$/;
const FRONT_MATTER_CLOSE = /^(?:---|\.\.\.)[ \t]*$/;

export function isFrontMatterOpening(line: string): boolean {
  return FRONT_MATTER_OPEN.test(line);
}

export function isFrontMatterClosing(line: string): boolean {
  return FRONT_MATTER_CLOSE.test(line);
}

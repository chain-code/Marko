// 有序列表按行重新编号（B-4、E-5）：退格反缩进、Tab 缩进以后，同一个列表里的序号按层重新排。
// 「同一个列表」按行看（同样多层的引用前缀、连续的列表行和续行），只在命令改动的那一段源码上用
import { incrementNumber, indentWidth, normalizeNumber, quotePrefix } from "./text.ts";

interface ListLine {
  /** 引用前缀的原文 */
  prefix: string;
  content: string;
  /** 引用的层数（不在引用里时为 plain） */
  key: string;
}

function listLine(line: string): ListLine {
  const quote = quotePrefix(line);
  if (!quote) return { prefix: "", content: line, key: "plain" };
  return { prefix: quote.raw, content: line.slice(quote.raw.length), key: `quote:${quote.depth}` };
}

const MARKER = /^(\s*)(?:[-*+]|\d+[.)])\s+/;

/** 缩进 4 列以上的列表符号要在更浅的列表项下面才算（否则是缩进代码） */
function markerAllowed(lines: string[], index: number, key: string, indent: string): boolean {
  return indentWidth(indent) < 4 || hasParentMarker(lines, index, key, indent);
}

function hasParentMarker(lines: string[], index: number, key: string, indent: string): boolean {
  for (let i = index - 1; i >= 0; i -= 1) {
    const context = listLine(lines[i] ?? "");
    if (context.key !== key) {
      if (context.content.trim()) return false;
      continue;
    }
    const body = context.content.replace(/\r$/, "");
    if (!body.trim()) continue;
    const marker = MARKER.exec(body);
    if (marker) {
      if (!markerAllowed(lines, i, key, marker[1])) return false;
      if (indentWidth(marker[1]) <= indentWidth(indent)) return true;
      continue;
    }
    if (/^(?:[ \t]{2,}|\t)/.test(body)) continue;
    return false;
  }
  return false;
}

function isListBlockLine(lines: string[], index: number, key: string): boolean {
  const context = listLine(lines[index] ?? "");
  if (context.key !== key || !context.content.trim()) return false;
  const marker = MARKER.exec(context.content);
  if (marker) return markerAllowed(lines, index, key, marker[1]);
  const continuation = /^([ \t]{2,}|\t)\S/.exec(context.content);
  return Boolean(continuation && hasParentMarker(lines, index, key, continuation[1]));
}

function listBlockRange(lines: string[], index: number): { start: number; end: number; key: string } | null {
  const key = listLine(lines[index] ?? "").key;
  if (!isListBlockLine(lines, index, key)) return null;
  let start = index;
  let end = index;
  while (start > 0 && isListBlockLine(lines, start - 1, key)) start -= 1;
  while (end + 1 < lines.length && isListBlockLine(lines, end + 1, key)) end += 1;
  return { start, end, key };
}

function baseWidth(lines: string[], start: number, end: number, key: string): number {
  let width = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    const context = listLine(lines[index]);
    if (context.key !== key) continue;
    const match = MARKER.exec(context.content);
    if (match && markerAllowed(lines, index, key, match[1])) width = Math.min(width, indentWidth(match[1]));
  }
  return Number.isFinite(width) ? width : 0;
}

/** lineIndex 行所在的列表里，最外层第一个有序项的序号 */
export function orderedStartAt(text: string, lineIndex: number): string | null {
  const lines = text.split("\n");
  const isLine = (line: string) => Boolean(line.trim()) && (MARKER.test(line) || /^\s{2,}\S/.test(line));
  if (!isLine(lines[lineIndex] ?? "")) return null;
  let start = lineIndex;
  let end = lineIndex;
  while (start > 0 && isLine(lines[start - 1])) start -= 1;
  while (end + 1 < lines.length && isLine(lines[end + 1])) end += 1;
  let width = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    const match = MARKER.exec(lines[index]);
    if (match) width = Math.min(width, indentWidth(match[1]));
  }
  if (!Number.isFinite(width)) return null;
  for (let index = start; index <= end; index += 1) {
    const ordered = /^(\s*)(\d+)[.)]\s+/.exec(lines[index]);
    if (ordered && indentWidth(ordered[1]) === width) return normalizeNumber(ordered[2]);
  }
  return null;
}

/** lineIndex 行所在的列表里的有序项按层重新编号；最外层从 baseStart（或原来第一项的序号）开始，里层从 1 开始 */
export function renumberListAt(text: string, lineIndex: number, baseStart?: string): string {
  const lines = text.split("\n");
  const range = listBlockRange(lines, lineIndex);
  if (!range) return text;
  const base = baseWidth(lines, range.start, range.end, range.key);
  const frames: Array<{ width: number; delimiter: string; next: string }> = [];
  for (let index = range.start; index <= range.end; index += 1) {
    const context = listLine(lines[index]);
    if (context.key !== range.key) continue;
    const ordered = /^(\s*)(\d+)([.)])(\s+)/.exec(context.content);
    if (ordered) {
      const width = indentWidth(ordered[1]);
      while (frames.length > 0 && frames[frames.length - 1].width > width) frames.pop();
      const top = frames[frames.length - 1];
      if (!top || top.width !== width || top.delimiter !== ordered[3]) {
        while (frames.length > 0 && frames[frames.length - 1].width >= width) frames.pop();
        frames.push({ width, delimiter: ordered[3], next: width === base ? normalizeNumber(baseStart ?? ordered[2]) : "1" });
      }
      const frame = frames[frames.length - 1];
      lines[index] = `${context.prefix}${ordered[1]}${frame.next}${ordered[3]}${ordered[4]}${context.content.slice(ordered[0].length)}`;
      frame.next = incrementNumber(frame.next);
      continue;
    }
    const unordered = /^(\s*)[-*+]\s+/.exec(context.content);
    if (unordered) {
      const width = indentWidth(unordered[1]);
      while (frames.length > 0 && frames[frames.length - 1].width >= width) frames.pop();
      continue;
    }
    if (!context.content.trim()) {
      frames.length = 0;
      continue;
    }
    const width = indentWidth(/^\s*/.exec(context.content)?.[0] ?? "");
    while (frames.length > 0 && frames[frames.length - 1].width >= width) frames.pop();
  }
  return lines.join("\n");
}

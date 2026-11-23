import { getYamlFrontMatterRange } from "./frontMatterSyntax";

export function buildFrontMatterSnippet(now = new Date()): string {
  return `---\ntitle: 新文档\ndate: ${formatLocalDate(now)}\n---\n\n`;
}

export interface FrontMatterInsertionResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function insertFrontMatterSnippet(value: string, now = new Date()): FrontMatterInsertionResult {
  const existing = getFrontMatterRange(value);
  if (existing) {
    return {
      value,
      selectionStart: existing.start,
      selectionEnd: existing.end,
    };
  }

  const snippet = normalizeSnippetLineBreaks(buildFrontMatterSnippet(now), getPreferredLineBreak(value));
  const titleStart = snippet.indexOf("新文档");
  const bom = value.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = bom ? value.slice(bom.length) : value;
  return {
    value: `${bom}${snippet}${body}`,
    selectionStart: bom.length + titleStart,
    selectionEnd: bom.length + titleStart + "新文档".length,
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFrontMatterRange(value: string): { start: number; end: number } | null {
  const range = getYamlFrontMatterRange(value);
  return range ? { start: range.start, end: range.end } : null;
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeSnippetLineBreaks(value: string, lineBreak: "\n" | "\r\n"): string {
  return value.replace(/\r\n|\r|\n/g, lineBreak);
}

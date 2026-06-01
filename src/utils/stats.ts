import type { DocumentStats, SelectionStats } from "@/types";

export function calculateDocumentStats(markdown: string): DocumentStats {
  const plain = stripMarkdown(markdown);
  const chars = plain.replace(/\s/g, "").length;
  const englishWords = plain.match(/[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*/g)?.length ?? 0;
  const chineseChars = plain.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const paragraphs = markdown
    .split(/\n\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean).length;
  const words = englishWords + chineseChars;

  return {
    chars,
    words,
    paragraphs,
    readingMinutes: Math.max(1, Math.ceil(words / 350)),
  };
}

export function calculateSelectionStats(text: string): SelectionStats {
  if (!text) {
    return { chars: 0, words: 0, lines: 0 };
  }

  const chars = text.replace(/\s/g, "").length;
  const englishWords = text.match(/[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*/g)?.length ?? 0;
  const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;

  return {
    chars,
    words: englishWords + chineseChars,
    lines: text.split(/\r?\n/).length,
  };
}

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^---[\s\S]*?---/m, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`=[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

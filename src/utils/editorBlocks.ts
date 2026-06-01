export interface MarkdownBlock {
  index: number;
  raw: string;
  start: number;
  end: number;
  type: string;
}

interface LineInfo {
  text: string;
  start: number;
  end: number;
}

export function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  if (!markdown) {
    return [{ index: 0, raw: "", start: 0, end: 0, type: "paragraph" }];
  }

  const lines = collectLines(markdown);
  const blocks: MarkdownBlock[] = [];
  let blockStart = 0;
  let fenceMarker = "";

  for (const line of lines) {
    const trimmed = line.text.trim();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);

    if (fenceMatch) {
      if (!fenceMarker) {
        fenceMarker = fenceMatch[1][0];
      } else if (fenceMatch[1].startsWith(fenceMarker)) {
        fenceMarker = "";
      }
      continue;
    }

    if (!fenceMarker && trimmed === "") {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        blocks.push({
          index: blocks.length,
          raw,
          start: blockStart,
          end: line.start,
          type: detectBlockType(raw),
        });
      }
      blockStart = line.end;
    }
  }

  if (blockStart <= markdown.length) {
    const raw = markdown.slice(blockStart);
    if (raw.length > 0 || blocks.length === 0) {
      blocks.push({
        index: blocks.length,
        raw,
        start: blockStart,
        end: markdown.length,
        type: detectBlockType(raw),
      });
    }
  }

  return blocks;
}

export function replaceBlock(markdown: string, block: MarkdownBlock, value: string): string {
  return `${markdown.slice(0, block.start)}${value}${markdown.slice(block.end)}`;
}

export function detectBlockType(raw: string): string {
  const trimmed = raw.trimStart();
  if (/^---\s*[\r\n]/.test(trimmed)) return "frontmatter";
  if (/^#{1,6}\s/.test(trimmed)) return "heading";
  if (/^```|^~~~/.test(trimmed)) return "code";
  if (/^>\s?/.test(trimmed)) return "quote";
  if (/^[-*+]\s+\[[ xX]]\s/.test(trimmed)) return "task";
  if (/^[-*+]\s+/.test(trimmed)) return "list";
  if (/^\d+[.)]\s+/.test(trimmed)) return "list";
  if (/^\|.+\|[\r\n]+\|?[\s:|-]+\|/.test(trimmed)) return "table";
  if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) return "rule";
  return "paragraph";
}

export function indentSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
): { value: string; selectionStart: number; selectionEnd: number } {
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const lineEnd = selectionEnd === selectionStart
    ? value.indexOf("\n", selectionEnd)
    : value.indexOf("\n", selectionEnd - 1);
  const normalizedLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const before = value.slice(0, lineStart);
  const selected = value.slice(lineStart, normalizedLineEnd);
  const after = value.slice(normalizedLineEnd);
  const lines = selected.split("\n");
  let deltaStart = 0;
  let deltaEnd = 0;

  const nextLines = lines.map((line, index) => {
    if (outdent) {
      const next = line.replace(/^( {1,2}|\t)/, "");
      const removed = line.length - next.length;
      if (index === 0) deltaStart -= Math.min(removed, selectionStart - lineStart);
      deltaEnd -= removed;
      return next;
    }

    deltaEnd += 2;
    if (index === 0) deltaStart += 2;
    return `  ${line}`;
  });

  return {
    value: `${before}${nextLines.join("\n")}${after}`,
    selectionStart: Math.max(lineStart, selectionStart + deltaStart),
    selectionEnd: Math.max(lineStart, selectionEnd + deltaEnd),
  };
}

function collectLines(markdown: string): LineInfo[] {
  const lines: LineInfo[] = [];
  const matcher = /.*(?:\r?\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(markdown)) && match[0] !== "") {
    lines.push({
      text: match[0].replace(/\r?\n$/, ""),
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  return lines;
}

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
  let lineCursor = 0;
  const frontMatterEnd = getFrontMatterEndOffset(lines);

  if (frontMatterEnd > 0) {
    blocks.push({
      index: blocks.length,
      raw: markdown.slice(0, frontMatterEnd),
      start: 0,
      end: frontMatterEnd,
      type: "frontmatter",
    });
    blockStart = frontMatterEnd;
    while (lineCursor < lines.length && lines[lineCursor].end <= blockStart) {
      lineCursor += 1;
    }
  }

  for (let index = lineCursor; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.text.trim();
    const rawFence = getRawFence(line.text);
    const rawHtmlBlock = getRawHtmlBlock(line.text);

    if (isTableStartLine(lines, index)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const tableEndLine = findTableEndLine(lines, index);
      const tableEnd = lines[tableEndLine]?.end ?? line.end;
      blocks.push({
        index: blocks.length,
        raw: markdown.slice(line.start, tableEnd),
        start: line.start,
        end: tableEnd,
        type: "table",
      });
      blockStart = tableEnd;
      index = tableEndLine;
      continue;
    }

    if (isFootnoteDefinitionLine(line.text)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const footnoteEndLine = findFootnoteDefinitionEndLine(lines, index);
      const footnoteEnd = lines[footnoteEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, footnoteEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: footnoteEnd,
        type: "footnote",
      });
      blockStart = footnoteEnd;
      index = footnoteEndLine;
      continue;
    }

    if (isLinkReferenceDefinitionLine(line.text)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const referenceEndLine = findReferenceDefinitionEndLine(lines, index);
      const referenceEnd = lines[referenceEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, referenceEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: referenceEnd,
        type: "reference",
      });
      blockStart = referenceEnd;
      index = referenceEndLine;
      continue;
    }

    if (isIndentedCodeLine(line.text)) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const codeEndLine = findIndentedCodeEndLine(lines, index);
      const codeEnd = lines[codeEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, codeEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: codeEnd,
        type: "code",
      });
      blockStart = codeEnd;
      index = codeEndLine;
      continue;
    }

    if (rawFence) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const fenceEndLine = findRawFenceEndLine(lines, index, rawFence);
      const fenceEnd = lines[fenceEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, fenceEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: fenceEnd,
        type: detectBlockType(raw, line.start === 0),
      });
      blockStart = fenceEnd;
      index = fenceEndLine;
      continue;
    }

    if (rawHtmlBlock) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const htmlEndLine = findRawHtmlBlockEndLine(lines, index, rawHtmlBlock);
      const htmlEnd = lines[htmlEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, htmlEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: htmlEnd,
        type: detectBlockType(raw, line.start === 0),
      });
      blockStart = htmlEnd;
      index = htmlEndLine;
      continue;
    }

    const definitionEndLine = findDefinitionListEndLine(lines, index);
    if (definitionEndLine !== null) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const definitionEnd = lines[definitionEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, definitionEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: definitionEnd,
        type: "definition",
      });
      blockStart = definitionEnd;
      index = definitionEndLine;
      continue;
    }

    const listEndLine = findMarkdownListEndLine(lines, index);
    if (listEndLine !== null) {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        if (raw.trim()) {
          blocks.push({
            index: blocks.length,
            raw,
            start: blockStart,
            end: line.start,
            type: detectBlockType(raw, blockStart === 0),
          });
        }
      }

      const listEnd = lines[listEndLine]?.end ?? line.end;
      const raw = markdown.slice(line.start, listEnd);
      blocks.push({
        index: blocks.length,
        raw,
        start: line.start,
        end: listEnd,
        type: detectBlockType(raw, line.start === 0),
      });
      blockStart = listEnd;
      index = listEndLine;
      continue;
    }

    if (trimmed === "") {
      if (line.start > blockStart) {
        const raw = markdown.slice(blockStart, line.start);
        blocks.push({
          index: blocks.length,
          raw,
          start: blockStart,
          end: line.start,
          type: detectBlockType(raw, blockStart === 0),
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
        type: detectBlockType(raw, blockStart === 0),
      });
    }
  }

  return blocks;
}

function getFrontMatterEndOffset(lines: LineInfo[]): number {
  if ((lines[0]?.text.trim() ?? "") !== "---") return -1;

  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].text.trim() === "---") {
      return lines[index].end;
    }
  }

  return -1;
}

export function replaceBlock(markdown: string, block: MarkdownBlock, value: string): string {
  return `${markdown.slice(0, block.start)}${value}${markdown.slice(block.end)}`;
}

export function detectBlockType(raw: string, atDocumentStart = false): string {
  if (isIndentedCodeBlock(raw)) return "code";

  const trimmed = raw.trimStart();
  if (atDocumentStart && /^---\s*[\r\n][\s\S]*?[\r\n]---\s*$/.test(trimmed)) return "frontmatter";
  if (/^#{1,6}\s/.test(trimmed)) return "heading";
  if (isSetextHeadingBlock(trimmed)) return "heading";
  if (/^```|^~~~/.test(trimmed)) return "code";
  if (/^\$\$\s*(?:[\r\n]|$)/.test(trimmed)) return "math";
  if (/^\\\[\s*(?:[\r\n]|$)/.test(trimmed)) return "math";
  if (/^>\s?/.test(trimmed)) return "quote";
  if (isRawHtmlBlockStart(trimmed)) return "html";
  if (/^\[\^[^\]\s]+]:/.test(trimmed)) return "footnote";
  if (/^\[[^\]\n]+]:\s*\S/.test(trimmed)) return "reference";
  if (/^\*\[[^\]\n]+]:\s*\S/.test(trimmed)) return "abbreviation";
  if (isDefinitionListBlock(trimmed)) return "definition";
  if (/^(?:[-*+]|\d+[.)])\s+\[[ xX]]\s/.test(trimmed)) return "task";
  if (/^[-*+]\s+/.test(trimmed)) return "list";
  if (/^\d+[.)]\s+/.test(trimmed)) return "list";
  if (isTableBlock(trimmed)) return "table";
  if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) return "rule";
  return "paragraph";
}

function isIndentedCodeBlock(value: string): boolean {
  const firstContentLine = value.split(/\r?\n/).find((line) => line.trim());
  return Boolean(firstContentLine && /^(?: {4,}|\t)/.test(firstContentLine));
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}|\t)/.test(line);
}

function isFootnoteDefinitionLine(line: string): boolean {
  return /^ {0,3}\[\^[^\]\s]+]:/.test(line);
}

function findFootnoteDefinitionEndLine(lines: LineInfo[], startIndex: number): number {
  let endLine = startIndex;
  let requiresIndentedContinuation = false;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].text;
    if (!line.trim()) {
      if (hasFollowingFootnoteIndentedContinuationLine(lines, index + 1)) {
        endLine = index;
        requiresIndentedContinuation = true;
        continue;
      }
      break;
    }

    if (isFootnoteIndentedContinuationLine(line)) {
      endLine = index;
      requiresIndentedContinuation = false;
      continue;
    }

    if (!requiresIndentedContinuation && isFootnoteParagraphContinuationLine(line)) {
      endLine = index;
      continue;
    }

    break;
  }

  return endLine;
}

function hasFollowingFootnoteIndentedContinuationLine(lines: LineInfo[], startIndex: number): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!lines[index].text.trim()) continue;
    return isFootnoteIndentedContinuationLine(lines[index].text);
  }
  return false;
}

function isFootnoteIndentedContinuationLine(line: string): boolean {
  return /^(?: {4,}| {0,3}\t)/.test(line);
}

function isFootnoteParagraphContinuationLine(line: string): boolean {
  if (!line.trim()) return false;
  if (isFootnoteIndentedContinuationLine(line)) return true;
  return !isFootnoteInterruptingBlockLine(line.replace(/^ {0,3}/, ""));
}

function isFootnoteInterruptingBlockLine(content: string): boolean {
  return /^(?:#{1,6}\s|(?:[-*+]|\d+[.)])\s+|>\s?|`{3,}|~{3,}|\$\$\s*$|\\\[\s*$|(?:-{3,}|\*{3,}|_{3,})\s*$|\[\^[^\]\s]+]:|\[[^\]\n]+]:\s*\S|<!--|<\/?[A-Za-z][^>\n]*>)/.test(content);
}

function isLinkReferenceDefinitionLine(line: string): boolean {
  return /^ {0,3}\[[^\]\n]+]:\s*\S/.test(line);
}

function findReferenceDefinitionEndLine(lines: LineInfo[], startIndex: number): number {
  let endLine = startIndex;

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (index === startIndex + 1 && isReferenceTitleContinuationLine(lines[index].text)) {
      endLine = index;
      continue;
    }

    break;
  }

  return endLine;
}

function isReferenceTitleContinuationLine(line: string): boolean {
  return /^[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$/.test(line);
}

function findIndentedCodeEndLine(lines: LineInfo[], startIndex: number): number {
  let lastCodeLine = startIndex;
  let index = startIndex + 1;

  while (index < lines.length) {
    if (isIndentedCodeLine(lines[index].text)) {
      lastCodeLine = index;
      index += 1;
      continue;
    }

    if (!lines[index].text.trim() && hasFollowingIndentedCodeLine(lines, index + 1)) {
      index += 1;
      continue;
    }

    break;
  }

  return lastCodeLine;
}

function hasFollowingIndentedCodeLine(lines: LineInfo[], startIndex: number): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!lines[index].text.trim()) continue;
    return isIndentedCodeLine(lines[index].text);
  }
  return false;
}

type RawFence =
  | { kind: "code"; marker: string; key: string }
  | { kind: "math"; marker: "$$" | "\\["; key: string };

type RawHtmlBlock =
  | { kind: "untilBlank"; key: string }
  | { kind: "untilClose"; key: string; closePattern: RegExp };

function getRawFence(line: string): RawFence | null {
  const context = getRawFenceLineContext(line);
  const code = context.content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (code) return { kind: "code", marker: code[1], key: context.key };
  if (/^[ \t]{0,3}\$\$\s*$/.test(context.content)) return { kind: "math", marker: "$$", key: context.key };
  if (/^[ \t]{0,3}\\\[\s*$/.test(context.content)) return { kind: "math", marker: "\\[", key: context.key };
  return null;
}

function findRawFenceEndLine(lines: LineInfo[], startIndex: number, fence: RawFence): number {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const context = getRawFenceLineContext(lines[index].text);
    if (context.key !== fence.key) continue;

    if (fence.kind === "math" && fence.marker === "$$" && /^[ \t]{0,3}\$\$\s*$/.test(context.content)) return index;
    if (fence.kind === "math" && fence.marker === "\\[" && /^[ \t]{0,3}\\\]\s*$/.test(context.content)) return index;
    if (fence.kind === "code") {
      const closing = context.content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
      if (closing && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length) {
        return index;
      }
    }
  }
  return lines.length - 1;
}

function getRawHtmlBlock(line: string): RawHtmlBlock | null {
  const context = getRawFenceLineContext(line);
  const content = context.content;
  if (!/^[ \t]{0,3}</.test(content)) return null;
  const trimmedLine = content.trimStart();

  if (/^<!--/.test(trimmedLine)) return { kind: "untilClose", key: context.key, closePattern: /-->/ };
  if (/^<\?/.test(trimmedLine)) return { kind: "untilClose", key: context.key, closePattern: /\?>/ };
  if (/^<![A-Z]/.test(trimmedLine)) return { kind: "untilClose", key: context.key, closePattern: />/ };
  if (/^<!\[CDATA\[/.test(trimmedLine)) return { kind: "untilClose", key: context.key, closePattern: /\]\]>/ };

  const rawTag = trimmedLine.match(/^<(script|pre|style)(?=[\s>/])/i);
  if (rawTag) {
    return {
      kind: "untilClose",
      key: context.key,
      closePattern: new RegExp(`</${rawTag[1]}\\s*>`, "i"),
    };
  }

  if (isPlainRawHtmlBlock(trimmedLine)) {
    return { kind: "untilBlank", key: context.key };
  }

  return null;
}

function findRawHtmlBlockEndLine(lines: LineInfo[], startIndex: number, block: RawHtmlBlock): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getRawFenceLineContext(lines[index].text);
    if (context.key !== block.key) return Math.max(startIndex, index - 1);

    if (block.kind === "untilBlank") {
      if (index > startIndex && !context.content.trim()) return index - 1;
      continue;
    }

    if (block.closePattern.test(context.content)) return index;
  }

  return lines.length - 1;
}

function isPlainRawHtmlBlock(value: string): boolean {
  return /^<\/?(address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[\s>/])/i.test(value);
}

function isRawHtmlBlockStart(value: string): boolean {
  return /^<!--/.test(value)
    || /^<\?/.test(value)
    || /^<![A-Z]/.test(value)
    || /^<!\[CDATA\[/.test(value)
    || /^<(script|pre|style)(?=[\s>/])/i.test(value)
    || isPlainRawHtmlBlock(value);
}

function getRawFenceLineContext(line: string): { content: string; key: string } {
  const quote = getQuotePrefixInfo(line);
  return quote ? { content: line.slice(quote.raw.length), key: quote.key } : { content: line, key: "plain" };
}

function isSetextHeadingBlock(value: string): boolean {
  const lines = value.split(/\r?\n/);
  if (lines.length < 2) return false;
  const title = lines[0].trim();
  const underline = lines[1].trim();
  return Boolean(title)
    && /^(=+|-+)$/.test(underline)
    && !/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|\|)/.test(title)
    && !/^\[[^\]]+]:/.test(title);
}

function isTableBlock(value: string): boolean {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  return lines.length >= 2 && isTableRow(lines[0]) && isTableSeparator(lines[1]);
}

function isTableStartLine(lines: LineInfo[], index: number): boolean {
  return isTableRow(lines[index]?.text ?? "") && isTableSeparator(lines[index + 1]?.text ?? "");
}

function findTableEndLine(lines: LineInfo[], startIndex: number): number {
  let endLine = startIndex + 1;
  for (let index = startIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].text.trim() || !isTableRow(lines[index].text)) break;
    endLine = index;
  }
  return endLine;
}

function isDefinitionListBlock(value: string): boolean {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return false;

  for (let index = 1; index < lines.length; index += 1) {
    if (!/^[ \t]{0,3}:(?:[ \t]+|$)/.test(lines[index])) continue;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (/^[ \t]{0,3}:(?:[ \t]+|$)/.test(lines[cursor])) continue;
      return isDefinitionTermLine(lines[cursor]);
    }
  }

  return false;
}

function findDefinitionListEndLine(lines: LineInfo[], startIndex: number): number | null {
  const startContext = getDefinitionListLineContext(lines[startIndex]?.text ?? "");
  const key = startContext.key;
  if (!isDefinitionListEntryStart(lines, startIndex, key)) return null;

  let index = startIndex;
  let endLine = startIndex;

  while (index < lines.length) {
    if (!isDefinitionListEntryStart(lines, index, key)) break;

    while (index < lines.length && isDefinitionListTermLineAt(lines[index].text, key)) {
      endLine = index;
      index += 1;
    }

    while (index < lines.length) {
      if (!isDefinitionListMarkerLineAt(lines[index]?.text ?? "", key)) break;
      endLine = index;
      index += 1;

      while (index < lines.length) {
        const context = getDefinitionListLineContext(lines[index]?.text ?? "");
        if (context.key !== key) return endLine;
        if (isDefinitionListMarkerLineAt(lines[index].text, key)) break;
        if (isDefinitionListEntryStart(lines, index, key)) break;
        if (!context.content.trim()) {
          if (!hasFollowingDefinitionListBlockContinuationLine(lines, index + 1, key)) return endLine;
          endLine = index;
          index += 1;
          continue;
        }
        if (!isDefinitionListContinuationLineAt(lines[index].text, key)) return endLine;
        endLine = index;
        index += 1;
      }
    }
  }

  return endLine;
}

function findMarkdownListEndLine(lines: LineInfo[], startIndex: number): number | null {
  const startContext = getMarkdownListLineContext(lines[startIndex]?.text ?? "");
  const key = startContext.key;
  if (!isMarkdownListMarkerLineAt(lines[startIndex]?.text ?? "", key)) return null;

  let endLine = startIndex;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const context = getMarkdownListLineContext(lines[index].text);
    if (context.key !== key) {
      break;
    }

    if (isMarkdownListMarkerContent(context.content)) {
      endLine = index;
      continue;
    }

    if (!context.content.trim()) {
      if (!hasFollowingMarkdownListLine(lines, index + 1, key)) {
        break;
      }
      endLine = index;
      continue;
    }

    if (isMarkdownListContinuationContent(context.content)) {
      endLine = index;
      continue;
    }

    break;
  }

  return endLine;
}

function isDefinitionListEntryStart(lines: LineInfo[], startIndex: number, key: string): boolean {
  let index = startIndex;
  while (index < lines.length && isDefinitionListTermLineAt(lines[index].text, key)) {
    index += 1;
  }
  return index > startIndex && isDefinitionListMarkerLineAt(lines[index]?.text ?? "", key);
}

function isDefinitionListTermLineAt(line: string, key: string): boolean {
  const context = getDefinitionListLineContext(line);
  return context.key === key && isDefinitionTermLine(context.content);
}

function isDefinitionListMarkerLineAt(line: string, key: string): boolean {
  const context = getDefinitionListLineContext(line);
  return context.key === key && /^[ \t]{0,3}:(?:[ \t]+|$)/.test(context.content);
}

function isDefinitionListContinuationLineAt(line: string, key: string): boolean {
  const context = getDefinitionListLineContext(line);
  return context.key === key && /^(?:[ \t]{2,}|\t)/.test(context.content);
}

function hasFollowingDefinitionListBlockContinuationLine(lines: LineInfo[], startIndex: number, key: string): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getDefinitionListLineContext(lines[index].text);
    if (context.key !== key) return false;
    if (!context.content.trim()) continue;
    return /^(?:[ \t]{4,}|\t)/.test(context.content);
  }
  return false;
}

function getDefinitionListLineContext(line: string): { content: string; key: string } {
  return getRawFenceLineContext(line);
}

function isDefinitionTermLine(line: string): boolean {
  if (!line.trim()) return false;
  if (/^(?: {4,}|\t)/.test(line)) return false;
  if (/^[ \t]{0,3}:(?:[ \t]+|$)/.test(line)) return false;
  return !/^[ \t]{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|(?:-{3,}|\*{3,}|_{3,})\s*$|\[[^\]\n]+]:\s*\S|\[\^[^\]\s]+]:|`{3,}|~{3,}|<|\|)/.test(line);
}

function isMarkdownListMarkerLineAt(line: string, key: string): boolean {
  const context = getMarkdownListLineContext(line);
  return context.key === key && isMarkdownListMarkerContent(context.content);
}

function isMarkdownListMarkerContent(content: string): boolean {
  return /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/.test(content);
}

function isMarkdownListContinuationContent(content: string): boolean {
  return /^(?:[ \t]{2,}|\t)/.test(content);
}

function hasFollowingMarkdownListLine(lines: LineInfo[], startIndex: number, key: string): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getMarkdownListLineContext(lines[index].text);
    if (context.key !== key) return false;
    if (!context.content.trim()) continue;
    return isMarkdownListMarkerContent(context.content) || isMarkdownListContinuationContent(context.content);
  }
  return false;
}

function getMarkdownListLineContext(line: string): { content: string; key: string } {
  return getRawFenceLineContext(line);
}

function isTableRow(line: string): boolean {
  return countUnescapedPipes(line.trim()) > 0;
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  let content = line.trim();
  if (content.startsWith("|")) {
    content = content.slice(1);
  }
  if (content.endsWith("|") && !isEscapedAt(content, content.length - 1)) {
    content = content.slice(0, -1);
  }

  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "|" && !isEscapedAt(content, index)) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += content[index];
  }
  cells.push(current.trim());
  return cells;
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function countUnescapedPipes(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "|" && !isEscapedAt(value, index)) {
      count += 1;
    }
  }
  return count;
}

export function indentSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
  indentSize = 2,
): { value: string; selectionStart: number; selectionEnd: number } {
  const normalizedIndentSize = indentSize === 4 ? 4 : 2;
  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const firstLineIndex = getLineIndexAtOffset(value, lineStart);
  const lineEnd = selectionEnd === selectionStart
    ? value.indexOf("\n", selectionEnd)
    : value.indexOf("\n", selectionEnd - 1);
  const normalizedLineEnd = lineEnd === -1 ? value.length : lineEnd;
  const before = value.slice(0, lineStart);
  const selected = value.slice(lineStart, normalizedLineEnd);
  const after = value.slice(normalizedLineEnd);
  const lines = selected.split("\n");
  const transforms: IndentLineTransform[] = [];

  const nextLines = lines.map((line) => {
    const changeColumn = getIndentChangeColumn(line);
    if (outdent) {
      const prefix = line.slice(0, changeColumn);
      const rest = line.slice(changeColumn);
      const nextRest = rest.startsWith("\t")
        ? rest.slice(1)
        : rest.slice(Math.min(rest.match(/^ */)?.[0].length ?? 0, normalizedIndentSize));
      const removed = rest.length - nextRest.length;
      const nextLine = `${prefix}${nextRest}`;
      transforms.push({
        oldLength: line.length,
        newLength: nextLine.length,
        changeColumn,
        removed,
        inserted: 0,
      });
      return nextLine;
    }

    const indent = " ".repeat(normalizedIndentSize);
    const nextLine = `${line.slice(0, changeColumn)}${indent}${line.slice(changeColumn)}`;
    transforms.push({
      oldLength: line.length,
      newLength: nextLine.length,
      changeColumn,
      removed: 0,
      inserted: normalizedIndentSize,
    });
    return nextLine;
  });

  const nextValue = `${before}${nextLines.join("\n")}${after}`;
  const nextSelectionStart = lineStart + mapIndentOffset(selectionStart - lineStart, transforms);
  const nextSelectionEnd = lineStart + mapIndentOffset(selectionEnd - lineStart, transforms);
  const renumberedValue = renumberOrderedListBlockAtLine(nextValue, firstLineIndex);

  return {
    value: renumberedValue,
    selectionStart: mapOffsetAfterRenumber(nextValue, renumberedValue, nextSelectionStart),
    selectionEnd: mapOffsetAfterRenumber(nextValue, renumberedValue, nextSelectionEnd),
  };
}

interface OrderedListFrame {
  width: number;
  delimiter: string;
  next: number;
}

interface IndentLineTransform {
  oldLength: number;
  newLength: number;
  changeColumn: number;
  removed: number;
  inserted: number;
}

interface QuotePrefixInfo {
  raw: string;
  key: string;
}

interface ListLineContext {
  prefix: string;
  content: string;
  key: string;
}

export function renumberOrderedListBlockAtLine(
  value: string,
  touchedLineIndex: number,
  baseStartNumber?: number,
): string {
  const lines = value.split("\n");
  const range = findListBlockRange(lines, touchedLineIndex);
  if (!range) return value;

  const baseWidth = getListBlockBaseWidth(lines, range.start, range.end, range.key);
  const frames: OrderedListFrame[] = [];

  for (let index = range.start; index <= range.end; index += 1) {
    const context = getListLineContext(lines[index]);
    if (context.key !== range.key) continue;

    const ordered = context.content.match(/^(\s*)(\d+)([.)])(\s+)/);
    if (ordered) {
      const width = getIndentWidth(ordered[1]);
      while (frames.length > 0 && frames[frames.length - 1].width > width) {
        frames.pop();
      }
      if (
        frames.length === 0
        || frames[frames.length - 1].width !== width
        || frames[frames.length - 1].delimiter !== ordered[3]
      ) {
        while (frames.length > 0 && frames[frames.length - 1].width >= width) {
          frames.pop();
        }
        frames.push({
          width,
          delimiter: ordered[3],
          next: width === baseWidth ? (baseStartNumber ?? Number(ordered[2])) : 1,
        });
      }

      const frame = frames[frames.length - 1];
      lines[index] = `${context.prefix}${ordered[1]}${frame.next}${ordered[3]}${ordered[4]}${context.content.slice(ordered[0].length)}`;
      frame.next += 1;
      continue;
    }

    const unordered = context.content.match(/^(\s*)[-*+]\s+/);
    if (unordered) {
      const width = getIndentWidth(unordered[1]);
      while (frames.length > 0 && frames[frames.length - 1].width >= width) {
        frames.pop();
      }
      continue;
    }

    if (!context.content.trim()) {
      frames.length = 0;
      continue;
    }

    const width = getIndentWidth(context.content.match(/^\s*/)?.[0] ?? "");
    while (frames.length > 0 && frames[frames.length - 1].width >= width) {
      frames.pop();
    }
  }

  return lines.join("\n");
}

function findListBlockRange(lines: string[], touchedLineIndex: number): { start: number; end: number; key: string } | null {
  const key = getListLineContext(lines[touchedLineIndex] ?? "").key;
  if (!isListBlockLineAt(lines, touchedLineIndex, key)) return null;

  let start = touchedLineIndex;
  let end = touchedLineIndex;
  while (start > 0 && isListBlockLineAt(lines, start - 1, key)) start -= 1;
  while (end + 1 < lines.length && isListBlockLineAt(lines, end + 1, key)) end += 1;
  return { start, end, key };
}

function isListBlockLineAt(lines: string[], lineIndex: number, key: string): boolean {
  const line = lines[lineIndex] ?? "";
  const context = getListLineContext(line);
  if (context.key !== key || !context.content.trim()) return false;

  const marker = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
  if (marker) {
    return isListMarkerIndentAllowedAt(lines, lineIndex, key, marker[1]);
  }

  const continuation = context.content.match(/^([ \t]{2,}|\t)\S/);
  return Boolean(continuation && hasParentListMarkerBefore(lines, lineIndex, key, continuation[1]));
}

function getListBlockBaseWidth(lines: string[], start: number, end: number, key: string): number {
  let width = Number.POSITIVE_INFINITY;
  for (let index = start; index <= end; index += 1) {
    const context = getListLineContext(lines[index]);
    if (context.key !== key) continue;
    const match = context.content.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (match && isListMarkerIndentAllowedAt(lines, index, key, match[1])) {
      width = Math.min(width, getIndentWidth(match[1]));
    }
  }
  return Number.isFinite(width) ? width : 0;
}

function isListMarkerIndentAllowedAt(lines: string[], lineIndex: number, key: string, indent: string): boolean {
  return getIndentWidth(indent) < 4 || hasParentListMarkerBefore(lines, lineIndex, key, indent);
}

function hasParentListMarkerBefore(lines: string[], lineIndex: number, key: string, indent: string): boolean {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const context = getListLineContext(lines[index] ?? "");
    if (context.key !== key) {
      if (context.content.trim()) return false;
      continue;
    }

    const body = context.content.replace(/\r$/, "");
    if (!body.trim()) continue;

    const marker = body.match(/^(\s*)(?:[-*+]|\d+[.)])\s+/);
    if (marker) {
      return isListMarkerIndentAllowedAt(lines, index, key, marker[1])
        && isDeeperIndent(indent, marker[1]);
    }

    if (/^(?:[ \t]{2,}|\t)/.test(body)) {
      continue;
    }

    return false;
  }

  return false;
}

function isDeeperIndent(indent: string, parentIndent: string): boolean {
  return getIndentWidth(indent) > getIndentWidth(parentIndent);
}

function getIndentChangeColumn(line: string): number {
  return getQuotePrefixInfo(line)?.raw.length ?? 0;
}

function mapIndentOffset(offset: number, transforms: IndentLineTransform[]): number {
  const oldLength = getTransformedSelectionLength(transforms, "oldLength");
  const newLength = getTransformedSelectionLength(transforms, "newLength");
  if (offset > oldLength) return offset + (newLength - oldLength);

  let oldLineStart = 0;
  let newLineStart = 0;
  for (let index = 0; index < transforms.length; index += 1) {
    const transform = transforms[index];
    const oldLineEnd = oldLineStart + transform.oldLength;
    if (offset <= oldLineEnd || index === transforms.length - 1) {
      const column = Math.max(0, Math.min(transform.oldLength, offset - oldLineStart));
      return newLineStart + mapIndentColumn(column, transform);
    }
    oldLineStart = oldLineEnd + 1;
    newLineStart += transform.newLength + 1;
  }

  return Math.max(0, offset + (newLength - oldLength));
}

function getTransformedSelectionLength(
  transforms: IndentLineTransform[],
  key: "oldLength" | "newLength",
): number {
  return transforms.reduce((length, transform, index) => (
    length + transform[key] + (index > 0 ? 1 : 0)
  ), 0);
}

function mapIndentColumn(column: number, transform: IndentLineTransform): number {
  const { changeColumn, removed, inserted } = transform;
  if (removed > 0) {
    if (column <= changeColumn) return column;
    if (column <= changeColumn + removed) return changeColumn;
    return column - removed;
  }
  return column + (column >= changeColumn ? inserted : 0);
}

function getListLineContext(line: string): ListLineContext {
  const quote = getQuotePrefixInfo(line);
  if (!quote) {
    return { prefix: "", content: line, key: "plain" };
  }

  return {
    prefix: quote.raw,
    content: line.slice(quote.raw.length),
    key: quote.key,
  };
}

function getQuotePrefixInfo(line: string): QuotePrefixInfo | null {
  const match = line.match(/^(\s*(?:>[ \t]?)+)/);
  if (!match) return null;
  const leading = match[1].match(/^\s*/)?.[0] ?? "";
  const depth = match[1].match(/>/g)?.length ?? 0;
  return {
    raw: match[1],
    key: `quote:${leading.length}:${depth}`,
  };
}

function mapOffsetAfterRenumber(before: string, after: string, offset: number): number {
  if (before === after) return offset;

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const position = getLineColumnAtOffset(beforeLines, offset);
  const beforeLine = beforeLines[position.line] ?? "";
  const afterLine = afterLines[position.line] ?? "";
  let column = position.column;
  const beforeMarker = getOrderedMarkerLength(beforeLine);
  const afterMarker = getOrderedMarkerLength(afterLine);
  if (beforeMarker !== null && afterMarker !== null && column >= beforeMarker) {
    column += afterMarker - beforeMarker;
  }

  return getLineStartOffset(afterLines, position.line) + Math.min(column, afterLine.length);
}

function getOrderedMarkerLength(line: string): number | null {
  const context = getListLineContext(line);
  const marker = context.content.match(/^(\s*)(\d+)([.)])(\s+)/);
  return marker ? context.prefix.length + marker[0].length : null;
}

function getLineColumnAtOffset(lines: string[], offset: number): { line: number; column: number } {
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const lineEnd = cursor + lines[index].length;
    if (offset <= lineEnd || index === lines.length - 1) {
      return { line: index, column: Math.max(0, offset - cursor) };
    }
    cursor = lineEnd + 1;
  }
  return { line: Math.max(0, lines.length - 1), column: 0 };
}

function getLineStartOffset(lines: string[], lineIndex: number): number {
  return lines.slice(0, lineIndex).join("\n").length + (lineIndex > 0 ? 1 : 0);
}

function getLineIndexAtOffset(value: string, offset: number): number {
  return value.slice(0, offset).split("\n").length - 1;
}

function getIndentWidth(value: string): number {
  return Array.from(value).reduce((width, char) => width + (char === "\t" ? 4 : 1), 0);
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

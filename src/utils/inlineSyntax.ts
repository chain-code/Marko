import {
  readMarkdownInlineLink,
  readMarkdownReferenceLink,
  readMarkdownShortcutReferenceLink,
} from "./markdownLinks";

export interface InlineMarkdownSyntax {
  type: "link" | "image";
  start: number;
  end: number;
  raw: string;
  label: string;
}

export function collectInlineMarkdownSyntax(source: string): InlineMarkdownSyntax[] {
  const syntax: InlineMarkdownSyntax[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const open = source.indexOf("[", cursor);
    if (open < 0) break;
    const link = readMarkdownInlineLink(source, open)
      ?? readMarkdownReferenceLink(source, open)
      ?? readMarkdownShortcutReferenceLink(source, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    syntax.push(toInlineSyntax(source, link));
    if (link.imageStart === null) {
      syntax.push(...collectLinkedImages(source, link.labelStart, link.labelEnd));
    }
    cursor = link.end;
  }

  return syntax;
}

function collectLinkedImages(source: string, start: number, end: number): InlineMarkdownSyntax[] {
  const images: InlineMarkdownSyntax[] = [];
  let cursor = start;
  while (cursor < end) {
    const open = source.indexOf("[", cursor);
    if (open < 0 || open >= end) break;
    const image = readMarkdownInlineLink(source, open)
      ?? readMarkdownReferenceLink(source, open)
      ?? readMarkdownShortcutReferenceLink(source, open);
    if (!image || image.imageStart === null || image.end > end) {
      cursor = open + 1;
      continue;
    }
    images.push(toInlineSyntax(source, image));
    cursor = image.end;
  }
  return images;
}

function toInlineSyntax(
  source: string,
  link: ReturnType<typeof readMarkdownInlineLink> & {},
): InlineMarkdownSyntax {
  const start = link.imageStart ?? link.start;
  return {
    type: link.imageStart === null ? "link" : "image",
    start,
    end: link.end,
    raw: source.slice(start, link.end),
    label: link.label,
  };
}

export function renderMarkdownCodeSpanText(source: string): string | null {
  const markerLength = countLeadingBackticks(source);
  if (markerLength === 0 || countTrailingBackticks(source) !== markerLength) return null;

  let content = source
    .slice(markerLength, source.length - markerLength)
    .replace(/\r\n|\r|\n/g, " ");
  if (content.startsWith(" ") && content.endsWith(" ") && /[^ ]/.test(content)) {
    content = content.slice(1, -1);
  }
  return content;
}

function countLeadingBackticks(source: string): number {
  let count = 0;
  while (source[count] === "`") count += 1;
  return count;
}

function countTrailingBackticks(source: string): number {
  let count = 0;
  while (source[source.length - count - 1] === "`") count += 1;
  return count;
}

export function isYamlFrontMatterOpening(line: string): boolean {
  return /^\uFEFF?---[ \t]*\r?$/.test(line);
}

export function isYamlFrontMatterClosing(line: string): boolean {
  return /^(?:---|\.\.\.)[ \t]*\r?$/.test(line);
}

export interface YamlFrontMatterRange {
  start: 0;
  end: number;
  contentStart: number;
  contentEnd: number;
  closingStart: number;
}

export function getYamlFrontMatterRange(source: string): YamlFrontMatterRange | null {
  const opening = readSourceLine(source, 0);
  if (!opening || !isYamlFrontMatterOpening(opening.text) || opening.end >= source.length) {
    return null;
  }

  let cursor = opening.end;
  while (cursor <= source.length) {
    const line = readSourceLine(source, cursor);
    if (!line) break;
    if (isYamlFrontMatterClosing(line.text)) {
      return {
        start: 0,
        end: line.end,
        contentStart: opening.end,
        contentEnd: line.start,
        closingStart: line.start,
      };
    }
    if (line.end <= cursor) break;
    cursor = line.end;
  }
  return null;
}

function readSourceLine(
  source: string,
  start: number,
): { text: string; start: number; end: number } | null {
  if (start < 0 || start > source.length) return null;
  const newline = source.indexOf("\n", start);
  if (newline < 0) {
    return { text: source.slice(start), start, end: source.length };
  }
  const contentEnd = newline > start && source[newline - 1] === "\r"
    ? newline - 1
    : newline;
  return {
    text: source.slice(start, contentEnd),
    start,
    end: newline + 1,
  };
}

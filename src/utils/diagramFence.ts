const diagramFenceLanguages = new Set(["mermaid", "mmd", "flowchart", "flow", "sequence"]);

interface MarkdownLine {
  start: number;
  end: number;
  text: string;
  ending: string;
}

export function replaceDiagramFenceSource(blockSource: string, nextDiagramSource: string): string {
  const lines = collectMarkdownLines(blockSource);

  for (let openingIndex = 0; openingIndex < lines.length; openingIndex += 1) {
    const openingLine = lines[openingIndex];
    const opening = openingLine.text.match(/^((?:[ \t]{0,3}>[ \t]?)*[ \t]*)(`{3,}|~{3,})([^\r\n]*)$/);
    if (!opening) continue;

    const language = opening[3].trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!diagramFenceLanguages.has(language)) continue;

    const fenceCharacter = opening[2][0];
    const minimumFenceLength = opening[2].length;
    const quoteSignature = getQuoteSignature(opening[1]);
    const closingPattern = new RegExp(`^((?:[ \\t]{0,3}>[ \\t]?)*[ \\t]*)${escapeRegExp(fenceCharacter)}{${minimumFenceLength},}[ \\t]*$`);

    for (let closingIndex = openingIndex + 1; closingIndex < lines.length; closingIndex += 1) {
      const closingLine = lines[closingIndex];
      const closing = closingLine.text.match(closingPattern);
      if (!closing || getQuoteSignature(closing[1]) !== quoteSignature) continue;

      const lineEnding = openingLine.ending || closingLine.ending || preferredLineEnding(blockSource);
      const source = trimTrailingLineBreaks(nextDiagramSource);
      const body = source
        ? source.split(/\r\n|\r|\n/).map((line) => `${opening[1]}${line}`).join(lineEnding)
        : "";
      const replacement = `${openingLine.text}${lineEnding}${body}${body ? lineEnding : ""}${closingLine.text}`;
      return `${blockSource.slice(0, openingLine.start)}${replacement}${blockSource.slice(closingLine.end)}`;
    }
  }

  return blockSource;
}

function collectMarkdownLines(source: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (!match[0] && match.index === source.length) break;
    lines.push({
      start: match.index,
      end: match.index + match[1].length,
      text: match[1],
      ending: match[2],
    });
    if (!match[2]) break;
  }

  return lines;
}

function getQuoteSignature(prefix: string): string {
  return prefix.replace(/[^>]/g, "");
}

function preferredLineEnding(source: string): string {
  return source.includes("\r\n") ? "\r\n" : "\n";
}

function trimTrailingLineBreaks(source: string): string {
  return source.replace(/[\r\n]+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

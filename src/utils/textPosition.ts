export function getLineStartOffset(source: string, line: number): number {
  const targetLine = Math.max(1, Math.floor(line));
  if (targetLine <= 1) return 0;

  let currentLine = 1;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "\n") continue;
    currentLine += 1;
    if (currentLine === targetLine) {
      return index + 1;
    }
  }

  return source.length;
}

export function getLineEndOffset(source: string, line: number): number {
  const start = getLineStartOffset(source, line);
  const nextNewline = source.indexOf("\n", start);
  if (nextNewline < 0) return source.length;
  return source[nextNewline - 1] === "\r" ? nextNewline - 1 : nextNewline;
}

export function getDocumentBoundaryOffset(source: string, boundary: "start" | "end"): number {
  return boundary === "start" ? 0 : source.length;
}

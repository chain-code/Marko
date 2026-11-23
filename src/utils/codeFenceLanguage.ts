export interface CodeFenceInfoString {
  from: number;
  to: number;
  value: string;
  marker: string;
  indentWidth: number;
}

export function getCodeFenceInfoString(source: string): CodeFenceInfoString | null {
  const newline = source.indexOf("\n");
  const physicalLineEnd = newline < 0 ? source.length : newline;
  const lineEnd = source[physicalLineEnd - 1] === "\r"
    ? physicalLineEnd - 1
    : physicalLineEnd;
  const line = source.slice(0, lineEnd);
  const opening = line.match(
    /^((?:(?:[ \t]{0,3}>[ \t]?)+)?[ \t]*(?:(?:[-+*]|\d+[.)])[ \t]+)?)(\x60{3,}|~{3,})([^\r\n]*)$/,
  );
  if (!opening) return null;

  const prefix = opening[1] ?? "";
  const quotePrefix = prefix.match(/^(?:[ \t]{0,3}>[ \t]?)+/)?.[0] ?? "";
  const indentation = prefix
    .slice(quotePrefix.length)
    .replace(/(?:[-+*]|\d+[.)])[ \t]+$/, "");
  const marker = opening[2] ?? "";
  const from = prefix.length + marker.length;

  return {
    from,
    to: lineEnd,
    value: (opening[3] ?? "").trim(),
    marker,
    indentWidth: getIndentWidth(indentation),
  };
}

export function replaceCodeFenceInfoString(source: string, value: string): string {
  const info = getCodeFenceInfoString(source);
  if (!info) return source;
  const normalized = normalizeCodeFenceInfoString(value, info.marker);
  return source.slice(0, info.from) + normalized + source.slice(info.to);
}

export function normalizeCodeFenceInfoString(value: string, marker = ""): string {
  const normalized = value.replace(/[\r\n]+/g, " ").trim();
  return marker.startsWith("`") ? normalized.replace(/`+/g, "") : normalized;
}

function getIndentWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    width += character === "\t" ? 4 - (width % 4) : 1;
  }
  return width;
}

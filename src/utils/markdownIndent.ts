export interface MarkdownBlockquotePrefix {
  raw: string;
  depth: number;
  contentColumn: number;
}

export interface MarkdownListContainer {
  content: string;
  prefixLength: number;
  continuationIndentWidth: number;
  codeIndented: boolean;
}

export interface MarkdownContainerMarker {
  kind: "blockquote" | "bullet-list" | "ordered-list";
  from: number;
  to: number;
  markerFrom: number;
  markerTo: number;
}

export interface MarkdownContainerPrefix {
  raw: string;
  content: string;
  prefixLength: number;
  contentColumn: number;
  quoteDepth: number;
  listDepth: number;
  codeIndented: boolean;
  markers: MarkdownContainerMarker[];
}

export function getMarkdownIndentWidth(value: string): number {
  return getMarkdownColumnAfter(value);
}

export function getMarkdownColumnAfter(value: string, startColumn = 0): number {
  let column = Math.max(0, Math.trunc(startColumn));
  for (const character of value) {
    column += character === "\t" ? 4 - (column % 4) : 1;
  }
  return column;
}

export function getLeadingMarkdownIndent(value: string): string {
  return value.match(/^[ \t]*/)?.[0] ?? "";
}

export function isMarkdownCodeIndented(value: string, startColumn = 0): boolean {
  const indent = getLeadingMarkdownIndent(value);
  return getMarkdownColumnAfter(indent, startColumn) - startColumn >= 4;
}

export function readMarkdownContainerPrefix(
  value: string,
  startColumn = 0,
  maximumQuoteDepth: number | null = null,
): MarkdownContainerPrefix {
  const initialColumn = Math.max(0, Math.trunc(startColumn));
  const markers: MarkdownContainerMarker[] = [];
  let cursor = 0;
  let column = initialColumn;
  let quoteDepth = 0;
  let listDepth = 0;
  let codeIndented = false;

  for (let depth = 0; depth < 32 && cursor < value.length; depth += 1) {
    const rest = value.slice(cursor);
    const leading = rest.match(/^[ \t]*/)?.[0] ?? "";
    const leadingColumn = getMarkdownColumnAfter(leading, column);
    if (leadingColumn - column > 3) break;

    const markerFrom = cursor + leading.length;
    if (value[markerFrom] === ">") {
      if (maximumQuoteDepth !== null && quoteDepth >= maximumQuoteDepth) break;
      let markerTo = markerFrom + 1;
      let nextColumn = leadingColumn + 1;
      if (value[markerTo] === " " || value[markerTo] === "\t") {
        nextColumn = getMarkdownColumnAfter(value[markerTo]!, nextColumn);
        markerTo += 1;
      }
      markers.push({
        kind: "blockquote",
        from: cursor,
        to: markerTo,
        markerFrom,
        markerTo,
      });
      cursor = markerTo;
      column = nextColumn;
      quoteDepth += 1;
      continue;
    }

    const list = value.slice(markerFrom)
      .match(/^([-+*]|\d{1,9}[.)])([ \t]+)/);
    if (!list) break;
    const markerEndColumn = leadingColumn + list[1]!.length;
    const contentColumn = getMarkdownColumnAfter(list[2] ?? "", markerEndColumn);
    if (contentColumn - markerEndColumn > 4) {
      codeIndented = true;
      break;
    }

    const markerTo = markerFrom + list[0].length;
    markers.push({
      kind: /^\d/.test(list[1]!) ? "ordered-list" : "bullet-list",
      from: cursor,
      to: markerTo,
      markerFrom,
      markerTo,
    });
    cursor = markerTo;
    column = contentColumn;
    listDepth += 1;
  }

  return {
    raw: value.slice(0, cursor),
    content: value.slice(cursor),
    prefixLength: cursor,
    contentColumn: column,
    quoteDepth,
    listDepth,
    codeIndented,
    markers,
  };
}

export function stripMarkdownListContainerMarkers(
  value: string,
  startColumn = 0,
): MarkdownListContainer {
  let content = value;
  let prefixLength = 0;
  const initialColumn = Math.max(0, Math.trunc(startColumn));
  let column = initialColumn;
  for (let depth = 0; depth < 16; depth += 1) {
    const marker = content.match(/^([ \t]*)(?:[-+*]|\d{1,9}[.)])([ \t]+)/);
    if (!marker) break;
    const leadingColumn = getMarkdownColumnAfter(marker[1] ?? "", column);
    if (leadingColumn - column > 3) break;
    const markerTextLength = marker[0].length - (marker[1]?.length ?? 0) - (marker[2]?.length ?? 0);
    const markerEndColumn = leadingColumn + markerTextLength;
    const contentColumn = getMarkdownColumnAfter(marker[2] ?? "", markerEndColumn);
    if (contentColumn - markerEndColumn > 4) {
      return {
        content,
        prefixLength,
        continuationIndentWidth: column - initialColumn,
        codeIndented: true,
      };
    }
    content = content.slice(marker[0].length);
    prefixLength += marker[0].length;
    column = contentColumn;
  }
  return {
    content,
    prefixLength,
    continuationIndentWidth: column - initialColumn,
    codeIndented: false,
  };
}

export function stripMarkdownIndentColumns(
  value: string,
  width: number,
  startColumn = 0,
): { content: string; prefixLength: number } | null {
  const initialColumn = Math.max(0, Math.trunc(startColumn));
  const targetColumn = initialColumn + Math.max(0, Math.trunc(width));
  let column = initialColumn;
  let cursor = 0;
  while (cursor < value.length && column < targetColumn) {
    const character = value[cursor];
    if (character !== " " && character !== "\t") return null;
    const nextColumn = getMarkdownColumnAfter(character, column);
    cursor += 1;
    if (nextColumn > targetColumn) {
      return {
        content: `${" ".repeat(nextColumn - targetColumn)}${value.slice(cursor)}`,
        prefixLength: cursor,
      };
    }
    column = nextColumn;
  }
  if (column < targetColumn) return null;
  return { content: value.slice(cursor), prefixLength: cursor };
}

export function readMarkdownBlockquotePrefix(
  line: string,
  maximumDepth: number | null = null,
): MarkdownBlockquotePrefix | null {
  let cursor = 0;
  let depth = 0;
  let column = 0;
  while (maximumDepth === null || depth < maximumDepth) {
    const marker = line.slice(cursor).match(/^([ \t]*)>/);
    if (!marker) break;
    const leadingColumn = getMarkdownColumnAfter(marker[1] ?? "", column);
    if (leadingColumn - column > 3) break;
    cursor += marker[0].length;
    column = leadingColumn + 1;
    if (line[cursor] === " " || line[cursor] === "\t") {
      column = getMarkdownColumnAfter(line[cursor], column);
      cursor += 1;
    }
    depth += 1;
  }
  return depth > 0
    ? { raw: line.slice(0, cursor), depth, contentColumn: column }
    : null;
}

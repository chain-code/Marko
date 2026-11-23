const standaloneTocPattern = /^ {0,3}(?:\[toc\]|\[\[_toc_\]\]|\{:[ \t]*toc(?:[ \t]+[^}\r\n]*)?[ \t]*\})[ \t]*$/i;

export function isMarkdownTocLine(value: string): boolean {
  const line = value.endsWith("\r\n")
    ? value.slice(0, -2)
    : value.endsWith("\n") || value.endsWith("\r")
      ? value.slice(0, -1)
      : value;
  return standaloneTocPattern.test(line);
}

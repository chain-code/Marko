export const markdownFileExtensions = [
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mkdn",
  "mdwn",
  "mdtxt",
  "mdtext",
  "rmd",
] as const;

export const markdownFileAccept = [
  ...markdownFileExtensions.map((extension) => `.${extension}`),
  "text/markdown",
  "text/plain",
].join(",");

const markdownExtensionPattern = new RegExp(
  `\\.(${markdownFileExtensions.join("|")})$`,
  "i",
);

export function isMarkdownPathLike(path: string): boolean {
  return markdownExtensionPattern.test(path);
}

export function isMarkdownFileLike(name: string, mimeType = ""): boolean {
  return isMarkdownPathLike(name) || mimeType === "text/markdown";
}

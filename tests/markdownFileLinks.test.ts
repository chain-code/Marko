import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMarkdownFileLink,
  resolveDocumentRelativePath,
  resolveMarkdownFileLinkHref,
} from "../src/utils/markdownFileLinks";

test("buildMarkdownFileLink creates current-document relative links", () => {
  assert.equal(
    buildMarkdownFileLink({
      targetPath: "C:/docs/guide/intro.md",
      targetName: "intro.md",
      currentPath: "C:/docs/drafts/current.md",
    }),
    "[intro](../guide/intro.md)",
  );
});

test("buildMarkdownFileLink falls back to the workspace root for unsaved documents", () => {
  assert.equal(
    buildMarkdownFileLink({
      targetPath: "C:/docs/topics/Research Note.markdown",
      targetName: "Research Note.markdown",
      rootPath: "C:/docs",
    }),
    "[Research Note](<topics/Research Note.markdown>)",
  );
});

test("buildMarkdownFileLink escapes labels and wraps complex destinations", () => {
  assert.equal(
    buildMarkdownFileLink({
      targetPath: "C:/docs/API [v2]/Guide (final).md",
      targetName: "Guide [v2].md",
      currentPath: "C:/docs/current.md",
    }),
    "[Guide \\[v2\\]](<API [v2]/Guide (final).md>)",
  );
});

test("resolveMarkdownFileLinkHref keeps absolute paths when roots differ", () => {
  assert.equal(
    resolveMarkdownFileLinkHref({
      targetPath: "D:/archive/other.md",
      currentPath: "C:/docs/current.md",
    }),
    "D:/archive/other.md",
  );
});

test("resolveMarkdownFileLinkHref handles UNC paths on the same share", () => {
  assert.equal(
    resolveMarkdownFileLinkHref({
      targetPath: "\\\\server\\share\\docs\\intro.md",
      currentPath: "\\\\server\\share\\drafts\\current.md",
    }),
    "../docs/intro.md",
  );
});

test("resolveDocumentRelativePath copies folder paths relative to the workspace", () => {
  assert.equal(
    resolveDocumentRelativePath({
      targetPath: "C:/docs/assets/images",
      rootPath: "C:/docs",
    }),
    "assets/images",
  );
});

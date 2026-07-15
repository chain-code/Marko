import test from "node:test";
import assert from "node:assert/strict";
import { findMarkdownLinkAtCursor } from "../src/utils/markdownLinks";

test("findMarkdownLinkAtCursor reads inline links under the cursor", () => {
  const source = "read [docs](https://example.com/a(b) \"Docs\") now";

  assert.deepEqual(
    findMarkdownLinkAtCursor(source, source.indexOf("docs"), source.indexOf("docs")),
    {
      start: "read ".length,
      end: source.indexOf(" now"),
      href: "https://example.com/a(b)",
      label: "docs",
      image: false,
    },
  );
});

test("findMarkdownLinkAtCursor reads angle-wrapped image links", () => {
  const source = "look ![logo](<assets/logo large.png> \"Logo\")";

  assert.deepEqual(
    findMarkdownLinkAtCursor(source, source.indexOf("logo"), source.indexOf("logo")),
    {
      start: "look ".length,
      end: source.length,
      href: "assets/logo large.png",
      label: "logo",
      image: true,
    },
  );
});

test("findMarkdownLinkAtCursor resolves reference and shortcut links", () => {
  const reference = "read [Docs][Guide]\n\n[guide]: ../guide.md \"Guide\"";
  assert.deepEqual(
    findMarkdownLinkAtCursor(reference, reference.indexOf("Docs"), reference.indexOf("Docs")),
    {
      start: "read ".length,
      end: "read [Docs][Guide]".length,
      href: "../guide.md",
      label: "Docs",
      image: false,
    },
  );

  const shortcut = "read [Docs]\n\n[docs]: file:///C:/docs/guide.md";
  assert.equal(
    findMarkdownLinkAtCursor(shortcut, shortcut.indexOf("Docs"), shortcut.indexOf("Docs"))?.href,
    "file:///C:/docs/guide.md",
  );
});

test("findMarkdownLinkAtCursor ignores missing targets and outside cursors", () => {
  const source = "read [docs][missing] and plain text";

  assert.equal(findMarkdownLinkAtCursor(source, source.indexOf("plain"), source.indexOf("plain")), null);
  assert.equal(findMarkdownLinkAtCursor(source, source.indexOf("docs"), source.indexOf("docs")), null);
  assert.equal(findMarkdownLinkAtCursor("read [docs]()", 7, 7), null);
});

test("findMarkdownLinkAtCursor opens bare external urls", () => {
  const source = "visit https://example.com/docs?a=1#top today";
  const cursor = source.indexOf("example.com");

  assert.deepEqual(findMarkdownLinkAtCursor(source, cursor, cursor), {
    start: "visit ".length,
    end: source.indexOf(" today"),
    href: "https://example.com/docs?a=1#top",
    label: "https://example.com/docs?a=1#top",
    image: false,
  });
});

test("findMarkdownLinkAtCursor opens bare local markdown paths", () => {
  const source = "open C:\\docs\\guide.md and ./notes/today.markdown#todo";

  assert.deepEqual(
    findMarkdownLinkAtCursor(source, source.indexOf("guide"), source.indexOf("guide")),
    {
      start: "open ".length,
      end: source.indexOf(" and"),
      href: "C:\\docs\\guide.md",
      label: "C:\\docs\\guide.md",
      image: false,
    },
  );

  assert.deepEqual(
    findMarkdownLinkAtCursor(source, source.indexOf("today"), source.indexOf("today")),
    {
      start: source.indexOf("./notes"),
      end: source.length,
      href: "./notes/today.markdown#todo",
      label: "./notes/today.markdown#todo",
      image: false,
    },
  );
});

test("findMarkdownLinkAtCursor opens angle-wrapped bare links", () => {
  const source = "see <file:///C:/docs/research%20note.md> now";
  const cursor = source.indexOf("research");

  assert.deepEqual(findMarkdownLinkAtCursor(source, cursor, cursor), {
    start: "see ".length,
    end: source.indexOf(" now"),
    href: "file:///C:/docs/research%20note.md",
    label: "file:///C:/docs/research%20note.md",
    image: false,
  });
});

test("findMarkdownLinkAtCursor trims trailing punctuation from bare links", () => {
  const source = "read (https://example.com/docs).";
  const cursor = source.indexOf("docs");

  assert.deepEqual(findMarkdownLinkAtCursor(source, cursor, cursor), {
    start: "read (".length,
    end: source.length - 2,
    href: "https://example.com/docs",
    label: "https://example.com/docs",
    image: false,
  });
});

test("findMarkdownLinkAtCursor ignores unsupported bare text", () => {
  const source = "plain note.md javascript:alert(1) #heading";

  assert.equal(findMarkdownLinkAtCursor(source, source.indexOf("note"), source.indexOf("note")), null);
  assert.equal(findMarkdownLinkAtCursor(source, source.indexOf("alert"), source.indexOf("alert")), null);
  assert.equal(findMarkdownLinkAtCursor(source, source.indexOf("heading"), source.indexOf("heading")), null);
});

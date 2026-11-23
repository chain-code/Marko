import test from "node:test";
import assert from "node:assert/strict";
import {
  findMarkdownLinkAtCursor,
  parseMarkdownLinkDestination,
} from "../src/utils/markdownLinks";

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

test("findMarkdownLinkAtCursor decodes Markdown escapes and entities in inline destinations", () => {
  const escaped = String.raw`read [docs](docs/a\(b\).md)`;
  const entity = "read [query](foo&amp;bar.md)";

  assert.equal(
    findMarkdownLinkAtCursor(escaped, escaped.indexOf("docs"), escaped.indexOf("docs"))?.href,
    "docs/a(b).md",
  );
  assert.equal(
    findMarkdownLinkAtCursor(entity, entity.indexOf("query"), entity.indexOf("query"))?.href,
    "foo&bar.md",
  );
});

test("findMarkdownLinkAtCursor reads Typora destinations with unwrapped spaces", () => {
  const source = [
    'read [docs](foo bar "Docs title")',
    "and",
    "![logo](assets/my image.png 'Image title')",
  ].join(" ");
  const linkStart = source.indexOf("[docs]");
  const imageStart = source.indexOf("![logo]");

  assert.deepEqual(
    findMarkdownLinkAtCursor(source, source.indexOf("docs"), source.indexOf("docs")),
    {
      start: linkStart,
      end: source.indexOf(" and"),
      href: "foo bar",
      label: "docs",
      image: false,
    },
  );
  assert.deepEqual(
    findMarkdownLinkAtCursor(source, source.indexOf("logo"), source.indexOf("logo")),
    {
      start: imageStart,
      end: source.length,
      href: "assets/my image.png",
      label: "logo",
      image: true,
    },
  );
});

test("parseMarkdownLinkDestination separates only a complete trailing title", () => {
  assert.deepEqual(parseMarkdownLinkDestination("foo bar baz"), {
    href: "foo bar baz",
    title: null,
    angleWrapped: false,
  });
  assert.deepEqual(parseMarkdownLinkDestination('foo bar "Double title"'), {
    href: "foo bar",
    title: "Double title",
    angleWrapped: false,
  });
  assert.deepEqual(parseMarkdownLinkDestination("foo bar 'Single title'"), {
    href: "foo bar",
    title: "Single title",
    angleWrapped: false,
  });
  assert.deepEqual(parseMarkdownLinkDestination("folder/my file.md (说明)"), {
    href: "folder/my file.md",
    title: "说明",
    angleWrapped: false,
  });
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

test("findMarkdownLinkAtCursor can disable bare links without disabling Markdown links", () => {
  const source = "[Docs](https://example.com) https://example.com";
  assert.equal(
    findMarkdownLinkAtCursor(source, source.indexOf("Docs"), source.indexOf("Docs"), false)?.href,
    "https://example.com",
  );
  assert.equal(
    findMarkdownLinkAtCursor(source, source.lastIndexOf("example"), source.lastIndexOf("example"), false),
    null,
  );
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

test("findMarkdownLinkAtCursor resolves quoted and listed reference definitions", () => {
  const quoted = "read [Quote][id]\n\n> [id]: /quoted.md";
  assert.equal(
    findMarkdownLinkAtCursor(quoted, quoted.indexOf("Quote"), quoted.indexOf("Quote"))?.href,
    "/quoted.md",
  );

  const listed = "read [List][id]\n\n- [id]: /listed.md";
  assert.equal(
    findMarkdownLinkAtCursor(listed, listed.indexOf("List"), listed.indexOf("List"))?.href,
    "/listed.md",
  );
});

test("findMarkdownLinkAtCursor ignores reference definitions inside raw blocks", () => {
  const fenced = "read [Bad][id]\n\n```md\n[id]: /bad.md\n```";
  assert.equal(
    findMarkdownLinkAtCursor(fenced, fenced.indexOf("Bad"), fenced.indexOf("Bad")),
    null,
  );

  const html = "read [Bad][id]\n\n<pre>\n[id]: /bad.md\n</pre>";
  assert.equal(
    findMarkdownLinkAtCursor(html, html.indexOf("Bad"), html.indexOf("Bad")),
    null,
  );
});

test("findMarkdownLinkAtCursor accepts only parsed Markdown links and images", () => {
  const codeSpan = "`[x](/code.md)`";
  assert.equal(findMarkdownLinkAtCursor(codeSpan, codeSpan.indexOf("x"), codeSpan.indexOf("x")), null);

  const fence = "```md\n[x](/fence.md)\n```";
  assert.equal(findMarkdownLinkAtCursor(fence, fence.indexOf("x"), fence.indexOf("x")), null);

  const htmlAttribute = '<span title="[x](/attribute.md)">body</span>';
  assert.equal(
    findMarkdownLinkAtCursor(htmlAttribute, htmlAttribute.indexOf("x"), htmlAttribute.indexOf("x")),
    null,
  );

  for (const literal of [
    "`[x](foo bar)`",
    "```md\n[x](foo bar)\n```",
    '<span title="[x](foo bar)">body</span>',
  ]) {
    const cursor = literal.indexOf("x");
    assert.equal(findMarkdownLinkAtCursor(literal, cursor, cursor), null, literal);
  }

  const escapedImageMarker = "\\![x](/link.md)";
  assert.deepEqual(
    findMarkdownLinkAtCursor(
      escapedImageMarker,
      escapedImageMarker.indexOf("x"),
      escapedImageMarker.indexOf("x"),
    ),
    {
      start: escapedImageMarker.indexOf("["),
      end: escapedImageMarker.length,
      href: "/link.md",
      label: "x",
      image: false,
    },
  );

  const escapedOpenBracket = "!\\[x](/missing.md)";
  assert.equal(
    findMarkdownLinkAtCursor(
      escapedOpenBracket,
      escapedOpenBracket.indexOf("x"),
      escapedOpenBracket.indexOf("x"),
    ),
    null,
  );
});

test("findMarkdownLinkAtCursor rejects dangerous inline Markdown destinations", () => {
  for (const href of ["javascript:alert(1)", "vbscript:msgbox(1)", "data:text/html,hello"]) {
    const source = `[unsafe](${href})`;
    assert.equal(
      findMarkdownLinkAtCursor(source, source.indexOf("unsafe"), source.indexOf("unsafe")),
      null,
      href,
    );
  }

  for (const href of ["https://example.com", "file:///C:/docs/guide.md", "../guide.md"]) {
    const source = `[safe](${href})`;
    assert.equal(
      findMarkdownLinkAtCursor(source, source.indexOf("safe"), source.indexOf("safe"))?.href,
      href,
    );
  }
});

test("findMarkdownLinkAtCursor ignores bare URLs inside literal Markdown regions", () => {
  const cases = [
    "`https://example.com/code`",
    "```text\nhttps://example.com/fence\n```",
    '<span title="https://example.com/attribute">body</span>',
    "<div>\nhttps://example.com/html-block\n</div>",
    "---\nurl: https://example.com/frontmatter\n---\nBody",
    "$$\nhttps://example.com/math\n$$",
    "\\[\nhttps://example.com/bracket-math\n\\]",
  ];

  for (const source of cases) {
    const cursor = source.indexOf("example.com");
    assert.equal(findMarkdownLinkAtCursor(source, cursor, cursor), null, source);
  }

  const inlineBody = "<span>https://example.com/body</span>";
  const cursor = inlineBody.indexOf("example.com");
  assert.equal(findMarkdownLinkAtCursor(inlineBody, cursor, cursor)?.href, "https://example.com/body");
});

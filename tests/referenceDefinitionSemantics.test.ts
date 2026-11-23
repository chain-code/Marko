import test from "node:test";
import assert from "node:assert/strict";
import {
  collectReferenceDefinitionSemantics,
  normalizeMarkdownReferenceLabel,
} from "../src/utils/referenceDefinitionSemantics";

test("collectReferenceDefinitionSemantics preserves same-line fields and exact source ranges", () => {
  const source = [
    '[  Foo\tBar  ]: <https://example.com/a\\)b> "A \\"title\\""',
    "[single]: /docs/a_(b) 'Single title'",
    "[round]: relative.md (Round title)",
  ].join("\n");

  const definitions = collectReferenceDefinitionSemantics(source);

  assert.equal(definitions.length, 3);
  assert.deepEqual(
    definitions.map((definition) => ({
      label: definition.label.value,
      normalized: definition.label.normalized,
      url: definition.url.value,
      title: definition.title?.value,
    })),
    [
      {
        label: "  Foo\tBar  ",
        normalized: "FOO BAR",
        url: "https://example.com/a)b",
        title: 'A "title"',
      },
      {
        label: "single",
        normalized: "SINGLE",
        url: "/docs/a_(b)",
        title: "Single title",
      },
      {
        label: "round",
        normalized: "ROUND",
        url: "relative.md",
        title: "Round title",
      },
    ],
  );

  for (const definition of definitions) {
    assert.equal(source.slice(definition.from, definition.to), definition.raw);
    assert.equal(source.slice(definition.label.from, definition.label.to), definition.label.raw);
    assert.equal(source.slice(definition.url.from, definition.url.to), definition.url.raw);
    if (definition.title) {
      assert.equal(source.slice(definition.title.from, definition.title.to), definition.title.raw);
    }
  }
  assert.equal(definitions[0]?.url.raw, "https://example.com/a\\)b");
  assert.equal(definitions[0]?.title?.raw, 'A \\"title\\"');
});

test("collectReferenceDefinitionSemantics preserves CRLF ranges for a title on the next line", () => {
  const source = "[docs]: /docs\r\n  'Docs title'\r\nAfter";
  const definition = collectReferenceDefinitionSemantics(source)[0];

  assert.ok(definition);
  assert.equal(definition.raw, "[docs]: /docs\r\n  'Docs title'");
  assert.equal(definition.to, source.lastIndexOf("\r\n"));
  assert.equal(source.slice(definition.to, definition.to + 2), "\r\n");
  assert.equal(definition.title?.value, "Docs title");
  assert.equal(definition.title?.from, source.indexOf("Docs title"));
  assert.equal(definition.title?.to, source.indexOf("Docs title") + "Docs title".length);
});

test("collectReferenceDefinitionSemantics supports blockquote and list containers", () => {
  const source = [
    "> [quote]: /quoted.md",
    ">   \"Quote title\"",
    "- [list]: /listed.md",
    "  (List title)",
    "> - [nested]: /nested.md",
    ">   'Nested title'",
  ].join("\n");

  const definitions = collectReferenceDefinitionSemantics(source);

  assert.deepEqual(
    definitions.map((definition) => ({
      raw: definition.raw,
      label: definition.label.value,
      url: definition.url.value,
      title: definition.title?.value,
    })),
    [
      {
        raw: '> [quote]: /quoted.md\n>   "Quote title"',
        label: "quote",
        url: "/quoted.md",
        title: "Quote title",
      },
      {
        raw: "- [list]: /listed.md\n  (List title)",
        label: "list",
        url: "/listed.md",
        title: "List title",
      },
      {
        raw: "> - [nested]: /nested.md\n>   'Nested title'",
        label: "nested",
        url: "/nested.md",
        title: "Nested title",
      },
    ],
  );
  assert.equal(definitions[2]?.from, source.indexOf("> - [nested]"));
  assert.equal(definitions[2]?.label.from, source.indexOf("nested"));
});

test("collectReferenceDefinitionSemantics excludes definitions from literal blocks", () => {
  const source = [
    "---",
    "link: '[front]: /front.md'",
    "---",
    "```md",
    "[code]: /code.md",
    "```",
    "$$ {math start}",
    "[math]: /math.md",
    "$$ {math end}",
    "<div>",
    "[html]: /html.md",
    "</div>",
    "",
    "    [indented]: /code.md",
    "",
    "[visible]: /visible.md",
  ].join("\n");

  assert.deepEqual(
    collectReferenceDefinitionSemantics(source).map((definition) => definition.label.value),
    ["visible"],
  );
});

test("collectReferenceDefinitionSemantics excludes contained code and math fences", () => {
  const source = [
    "- ```md",
    "  [code]: /code.md",
    "  ```",
    "> - $$",
    ">   [math]: /math.md",
    ">   $$ {math end}",
    "- [visible]: /visible.md",
  ].join("\n");

  assert.deepEqual(
    collectReferenceDefinitionSemantics(source).map((definition) => definition.label.value),
    ["visible"],
  );
});

test("collectReferenceDefinitionSemantics rejects footnotes and malformed definitions", () => {
  const source = [
    "[^note]: footnote",
    "[missing]:",
    "[unclosed]: /url \"title",
    "[garbage]: /url title",
    "[nested[label]]: /url",
    "[valid]: /url",
  ].join("\n");

  assert.deepEqual(
    collectReferenceDefinitionSemantics(source).map((definition) => definition.label.value),
    ["valid"],
  );
});

test("collectReferenceDefinitionSemantics keeps duplicate labels in source order", () => {
  const source = "[Name]: /first\n\n[ name ]: /second";
  const definitions = collectReferenceDefinitionSemantics(source);

  assert.equal(definitions.length, 2);
  assert.deepEqual(definitions.map((definition) => definition.label.value), ["Name", " name "]);
  assert.deepEqual(definitions.map((definition) => definition.label.normalized), ["NAME", "NAME"]);
  assert.deepEqual(definitions.map((definition) => definition.url.value), ["/first", "/second"]);
  assert.equal(normalizeMarkdownReferenceLabel("  Name\tVALUE  "), "NAME VALUE");
});

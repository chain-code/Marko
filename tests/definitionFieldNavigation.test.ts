import test from "node:test";
import assert from "node:assert/strict";
import { navigateMarkdownDefinitionField } from "../src/utils/definitionFieldNavigation";
import { collectFootnoteSemantics } from "../src/utils/footnoteSemantics";
import { collectReferenceDefinitionSemantics } from "../src/utils/referenceDefinitionSemantics";

test("navigateMarkdownDefinitionField cycles reference label, URL and title", () => {
  const source = [
    "Before",
    "",
    '[Docs]: <https://example.com/docs> "Guide title"',
    "After",
  ].join("\n");
  const definition = collectReferenceDefinitionSemantics(source)[0];
  assert.ok(definition?.title);

  assert.deepEqual(
    navigateMarkdownDefinitionField(
      source,
      definition.label.from,
      definition.label.to,
    ),
    {
      definitionKind: "reference",
      field: "url",
      selectionStart: definition.url.from,
      selectionEnd: definition.url.to,
    },
  );
  assert.deepEqual(
    navigateMarkdownDefinitionField(
      source,
      definition.url.from,
      definition.url.to,
    ),
    {
      definitionKind: "reference",
      field: "title",
      selectionStart: definition.title.from,
      selectionEnd: definition.title.to,
    },
  );
  assert.deepEqual(
    navigateMarkdownDefinitionField(
      source,
      definition.title.from,
      definition.title.to,
    ),
    {
      definitionKind: "reference",
      field: null,
      selectionStart: definition.to,
      selectionEnd: definition.to,
    },
  );
  assert.equal(
    navigateMarkdownDefinitionField(
      source,
      definition.to,
      definition.to,
    ),
    null,
  );
});

test("navigateMarkdownDefinitionField reverses fields and exits before a reference", () => {
  const source = "[docs]: /guide\n  'Guide title'\nAfter";
  const definition = collectReferenceDefinitionSemantics(source)[0];
  assert.ok(definition?.title);

  const previous = navigateMarkdownDefinitionField(
    source,
    definition.title.from,
    definition.title.to,
    true,
  );
  assert.deepEqual(previous, {
    definitionKind: "reference",
    field: "url",
    selectionStart: definition.url.from,
    selectionEnd: definition.url.to,
  });
  assert.deepEqual(
    navigateMarkdownDefinitionField(
      source,
      definition.label.from,
      definition.label.to,
      true,
    ),
    {
      definitionKind: "reference",
      field: null,
      selectionStart: definition.from,
      selectionEnd: definition.from,
    },
  );
  assert.equal(
    navigateMarkdownDefinitionField(
      source,
      definition.from,
      definition.from,
      true,
    ),
    null,
  );
});

test("navigateMarkdownDefinitionField treats a multi-paragraph footnote body as one field", () => {
  const source = [
    "Use[^NOTE].",
    "",
    "[^Note]: First paragraph.",
    "",
    "    Second paragraph.",
    "",
    "After",
  ].join("\r\n");
  const semantics = collectFootnoteSemantics(source);
  const definition = semantics.definitions[0];
  assert.ok(definition);
  assert.equal(semantics.references[0]?.definition?.id, "Note");
  assert.equal(source.slice(definition.label.from, definition.label.to), "Note");
  assert.equal(
    source.slice(definition.content.from, definition.content.to),
    "First paragraph.\r\n\r\n    Second paragraph.",
  );

  assert.deepEqual(
    navigateMarkdownDefinitionField(
      source,
      definition.label.from,
      definition.label.to,
    ),
    {
      definitionKind: "footnote",
      field: "content",
      selectionStart: definition.content.from,
      selectionEnd: definition.content.to,
    },
  );
  assert.deepEqual(
    navigateMarkdownDefinitionField(
      source,
      definition.content.from,
      definition.content.to,
      true,
    ),
    {
      definitionKind: "footnote",
      field: "label",
      selectionStart: definition.label.from,
      selectionEnd: definition.label.to,
    },
  );
  assert.deepEqual(
    navigateMarkdownDefinitionField(
      source,
      definition.content.from,
      definition.content.to,
    ),
    {
      definitionKind: "footnote",
      field: null,
      selectionStart: definition.to,
      selectionEnd: definition.to,
    },
  );
});

test("navigateMarkdownDefinitionField enters from punctuation and ignores ordinary text", () => {
  const source = "Paragraph\n\n[docs]: /guide";
  const definition = collectReferenceDefinitionSemantics(source)[0];
  assert.ok(definition);

  assert.equal(navigateMarkdownDefinitionField(source, 2, 2), null);
  assert.equal(
    navigateMarkdownDefinitionField(source, definition.from, definition.from)?.field,
    "label",
  );
  assert.equal(
    navigateMarkdownDefinitionField(source, definition.to, definition.to, true)?.field,
    "url",
  );
});

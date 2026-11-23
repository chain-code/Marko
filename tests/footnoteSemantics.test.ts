import test from "node:test";
import assert from "node:assert/strict";
import {
  collectFootnoteSemantics,
  createMissingFootnoteDefinitionEdit,
  normalizeFootnoteLabelsForRender,
} from "../src/utils/footnoteSemantics";

test("collectFootnoteSemantics numbers missing, repeated and inline references in source order", () => {
  const source = [
    "First[^note], missing[^missing], repeated[^note], inline ^[**inline**], case[^Note].",
    "",
    "[^note]: **lower**",
    "[^Note]: Upper",
  ].join("\n");

  const semantics = collectFootnoteSemantics(source);

  assert.deepEqual(semantics.references.map((reference) => reference.number), [1, 2, 1, 3, 1]);
  assert.deepEqual(semantics.references.map((reference) => reference.occurrence), [1, 1, 2, 1, 3]);
  assert.deepEqual(semantics.references.map((reference) => reference.missing), [false, true, false, false, false]);
  assert.equal(semantics.references[3]?.markdown, "**inline**");
  assert.equal(semantics.definitions.find((definition) => definition.id === "note")?.markdown, "**lower**");
  assert.equal(semantics.definitions.find((definition) => definition.id === "Note")?.markdown, "Upper");
  assert.equal(semantics.references.at(-1)?.definition?.id, "note");
  assert.equal(semantics.references.at(-1)?.markdown, "**lower**");
});

test("collectFootnoteSemantics shares canonical labels while preserving display ids", () => {
  const source = [
    "First[^NOTE], second[^note], missing[^Missing], again[^missing].",
    "",
    "[^nOtE]: body",
  ].join("\n");
  const semantics = collectFootnoteSemantics(source);

  assert.deepEqual(semantics.references.map((reference) => reference.number), [1, 1, 2, 2]);
  assert.deepEqual(semantics.references.map((reference) => reference.occurrence), [1, 2, 1, 2]);
  assert.deepEqual(semantics.references.map((reference) => reference.id), [
    "nOtE",
    "nOtE",
    "Missing",
    "Missing",
  ]);
  assert.deepEqual(semantics.references.map((reference) => reference.missing), [
    false,
    false,
    true,
    true,
  ]);
  assert.equal(semantics.definitions[0]?.id, "nOtE");
  assert.deepEqual(
    semantics.definitions[0]?.references.map((reference) => reference.occurrence),
    [1, 2],
  );
});

test("collectFootnoteSemantics supports spaced Unicode labels in CRLF containers", () => {
  const source = [
    "First[^中文 Note], again[^中文 note], missing[^missing note].",
    "",
    "> - [^中文 nOtE]: container body",
    ">       continued body",
  ].join("\r\n");
  const semantics = collectFootnoteSemantics(source);

  assert.deepEqual(semantics.references.map((reference) => reference.number), [1, 1, 2]);
  assert.deepEqual(semantics.references.map((reference) => reference.missing), [false, false, true]);
  assert.deepEqual(semantics.references.map((reference) => reference.id), [
    "中文 nOtE",
    "中文 nOtE",
    "missing note",
  ]);
  assert.equal(semantics.definitions[0]?.id, "中文 nOtE");
  assert.equal(semantics.definitions[0]?.markdown, "container body\r\ncontinued body");
  assert.equal(source.slice(
    semantics.definitions[0]?.label.from,
    semantics.definitions[0]?.label.to,
  ), "中文 nOtE");
});

test("normalizeFootnoteLabelsForRender preserves literal content and normalizes containers", () => {
  const source = [
    'Use[^Note] `[^Code]` \\[^Escaped] <span title="[^Html]">x</span>',
    "",
    "> - [^QuOtEd]: body",
    "",
    "[^QUOTED]: duplicate",
    "",
    "```md",
    "Fence[^Fence]",
    "[^Fence]: literal",
    "```",
  ].join("\n");

  const normalized = normalizeFootnoteLabelsForRender(source);
  const internalId = normalized.match(/^Use\[\^([^\]]+)]/)?.[1];
  const quotedId = normalized.match(/^> - \[\^([^\]]+)]:/m)?.[1];

  assert.ok(internalId);
  assert.ok(quotedId);
  assert.doesNotMatch(internalId, /\s/);
  assert.equal(normalized.match(/^Use\[\^([^\]]+)]/)?.[1], internalId);
  assert.equal(normalized.match(/^> - \[\^([^\]]+)]:/m)?.[1], quotedId);
  assert.match(normalized, /`\[\^Code]` \\\[\^Escaped] <span title="\[\^Html]">x<\/span>/);
  assert.match(normalized, /^\[\^QUOTED]: duplicate$/m);
  assert.match(normalized, /Fence\[\^Fence]\n\[\^Fence]: literal/);
});

test("normalizeFootnoteLabelsForRender maps Unicode spaces without reserved-prefix collisions", () => {
  const reservedLooking = "marko-footnote-4e2d65870020006e006f00740065";
  const source = [
    `A[^中文 Note] B[^中文 note] C[^${reservedLooking}]`,
    "",
    "[^中文 nOtE]: first",
    `[^${reservedLooking}]: second`,
  ].join("\n");
  const normalized = normalizeFootnoteLabelsForRender(source);
  const labels = Array.from(normalized.matchAll(/\[\^([^\]]+)]/g), (match) => match[1]);

  assert.equal(normalizeFootnoteLabelsForRender(source), normalized);
  assert.equal(labels[0], labels[1]);
  assert.equal(labels[0], labels[3]);
  assert.notEqual(labels[0], labels[2]);
  assert.equal(labels[2], labels[4]);
  assert.equal(labels.every((label) => !/\s/.test(label)), true);
});

test("normalizeFootnoteLabelsForRender preserves missing spaced labels for display", () => {
  const source = "Missing[^My Missing Note] known[^Known Note]\n\n[^known note]: body";
  const normalized = normalizeFootnoteLabelsForRender(source);

  assert.match(normalized, /Missing\[\^My Missing Note]/);
  assert.doesNotMatch(normalized, /Missing\[\^marko-footnote-/);
  const knownReference = normalized.match(/known\[\^([^\]]+)]/)?.[1];
  const knownDefinition = normalized.match(/^\[\^([^\]]+)]: body$/m)?.[1];
  assert.equal(knownReference, knownDefinition);
});

test("collectFootnoteSemantics preserves Markdown bodies and reference locations for container definitions", () => {
  const source = [
    "Refs[^plain][^quoted][^listed] and again[^listed].",
    "",
    "[^plain]: **bold**",
    "    second line",
    "",
    "> [^quoted]: _quote_",
    ">     continuation",
    "",
    "- item",
    "- [^listed]: [link](https://example.com)",
    "      final line",
  ].join("\n");

  const semantics = collectFootnoteSemantics(source);
  const plain = semantics.definitions.find((definition) => definition.id === "plain");
  const quoted = semantics.definitions.find((definition) => definition.id === "quoted");
  const listed = semantics.definitions.find((definition) => definition.id === "listed");

  assert.equal(plain?.markdown, "**bold**\nsecond line");
  assert.equal(quoted?.markdown, "_quote_\ncontinuation");
  assert.equal(listed?.markdown, "[link](https://example.com)\nfinal line");
  assert.equal(source.slice(listed?.from, listed?.to), "- [^listed]: [link](https://example.com)\n      final line");
  const firstListedReference = source.indexOf("[^listed]");
  const secondListedReference = source.indexOf("[^listed]", firstListedReference + 1);
  assert.deepEqual(listed?.references.map(({ from, occurrence }) => ({ from, occurrence })), [
    { from: firstListedReference, occurrence: 1 },
    { from: secondListedReference, occurrence: 2 },
  ]);
});

test("collectFootnoteSemantics excludes the trailing CRLF from multi-paragraph definitions", () => {
  const source = [
    "Use[^note].",
    "",
    "[^note]: first paragraph",
    "",
    "    second paragraph",
    "",
    "After",
  ].join("\r\n");
  const definition = collectFootnoteSemantics(source).definitions[0];

  assert.ok(definition);
  assert.equal(
    definition.raw,
    "[^note]: first paragraph\r\n\r\n    second paragraph",
  );
  assert.equal(definition.markdown, "first paragraph\r\n\r\nsecond paragraph");
  assert.equal(source.slice(definition.from, definition.to), definition.raw);
  assert.equal(source.slice(definition.to, definition.to + 4), "\r\n\r\n");
  assert.equal(definition.content.to, definition.to);
});

test("collectFootnoteSemantics excludes references and definitions from literal blocks", () => {
  const source = [
    "---",
    "note: '[^front]'",
    "---",
    "```md",
    "Code[^code]",
    "[^code]: hidden",
    "```",
    "<div>",
    "HTML[^html]",
    "[^html]: hidden",
    "</div>",
    "",
    "Visible[^ok]",
    "",
    "[^ok]: shown",
  ].join("\n");

  const semantics = collectFootnoteSemantics(source);

  assert.deepEqual(semantics.references.map((reference) => reference.id), ["ok"]);
  assert.deepEqual(semantics.definitions.map((definition) => definition.id), ["ok"]);
});

test("collectFootnoteSemantics attaches duplicate-label references to the first definition", () => {
  const source = "Use[^same].\n\n[^same]: first\n\n[^same]: second";
  const semantics = collectFootnoteSemantics(source);

  assert.equal(semantics.definitions.length, 2);
  assert.equal(semantics.references[0]?.definition?.markdown, "first");
  assert.equal(semantics.definitions[0]?.references.length, 1);
  assert.equal(semantics.definitions[1]?.references.length, 0);
});

test("createMissingFootnoteDefinitionEdit preserves line endings and leaves one blank line", () => {
  const lf = createMissingFootnoteDefinitionEdit("Body", "note");
  assert.deepEqual(lf, {
    from: 4,
    to: 4,
    insert: "\n\n[^note]: ",
    cursor: 15,
  });

  const crlfSource = "Body\r\n";
  const crlf = createMissingFootnoteDefinitionEdit(crlfSource, "note");
  assert.equal(crlf?.insert, "\r\n[^note]: ");
  assert.equal(crlf?.cursor, crlfSource.length + (crlf?.insert.length ?? 0));

  const alreadySeparated = "Body\n\n";
  assert.equal(createMissingFootnoteDefinitionEdit(alreadySeparated, "note")?.insert, "[^note]: ");
  assert.equal(createMissingFootnoteDefinitionEdit("", "note")?.insert, "[^note]: ");
});

test("createMissingFootnoteDefinitionEdit avoids duplicate definitions and rejects invalid labels", () => {
  assert.equal(createMissingFootnoteDefinitionEdit("[^note]: body", "note"), null);
  assert.equal(createMissingFootnoteDefinitionEdit("[^Note]: body", "note"), null);
  assert.equal(createMissingFootnoteDefinitionEdit("[^note]: body", "NOTE"), null);
  assert.equal(
    createMissingFootnoteDefinitionEdit("", "中文 note")?.insert,
    "[^中文 note]: ",
  );
  assert.equal(
    createMissingFootnoteDefinitionEdit("[^中文 Note]: body", "中文 note"),
    null,
  );
  assert.throws(() => createMissingFootnoteDefinitionEdit("", ""), TypeError);
  assert.throws(() => createMissingFootnoteDefinitionEdit("", "   "), TypeError);
  assert.throws(() => createMissingFootnoteDefinitionEdit("", "bad\nlabel"), TypeError);
  assert.throws(() => createMissingFootnoteDefinitionEdit("", "bad\rlabel"), TypeError);
  assert.throws(() => createMissingFootnoteDefinitionEdit("", "bad]label"), TypeError);
});

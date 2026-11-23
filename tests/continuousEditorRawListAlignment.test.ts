import assert from "node:assert/strict";
import test from "node:test";
import { getContinuousMarkdownLinePresentations } from "../src/utils/continuousEditor";

test("active list code and math blocks use raw-block indentation classes", () => {
  const fixtures = [
    {
      source: [
        "- item",
        "  ~~~js",
        "  const value = 1",
        "  ~~~",
      ].join("\n"),
      cursorText: "const value",
      rawClass: "cm-raw-block-code",
    },
    {
      source: [
        "- item",
        "  ~~~math",
        "  x + 1",
        "  ~~~",
      ].join("\n"),
      cursorText: "x + 1",
      rawClass: "cm-raw-block-math",
    },
  ];

  for (const fixture of fixtures) {
    const cursor = fixture.source.indexOf(fixture.cursorText);
    const lines = getContinuousMarkdownLinePresentations(fixture.source, cursor);
    const rawLines = lines.filter((line) => line.className.includes(fixture.rawClass));

    assert.ok(rawLines.length > 0, fixture.rawClass);
    for (const line of rawLines) {
      assert.equal(line.listDepth, 0, fixture.rawClass);
      assert.match(line.className, /(?:^|\s)cm-list-raw-block(?:\s|$)/, fixture.rawClass);
      assert.match(line.className, /(?:^|\s)cm-list-depth-0(?:\s|$)/, fixture.rawClass);
      assert.doesNotMatch(line.className, /(?:^|\s)cm-list-continuation(?:\s|$)/, fixture.rawClass);
    }
  }
});

test("ordinary list continuation text keeps paragraph indentation semantics", () => {
  const source = "- item\n  continuation";
  const lines = getContinuousMarkdownLinePresentations(source, source.length);

  assert.match(lines[1]?.className ?? "", /(?:^|\s)cm-list-continuation(?:\s|$)/);
  assert.doesNotMatch(lines[1]?.className ?? "", /(?:^|\s)cm-list-raw-block(?:\s|$)/);
});

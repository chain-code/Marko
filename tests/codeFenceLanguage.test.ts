import assert from "node:assert/strict";
import test from "node:test";
import {
  getCodeFenceInfoString,
  normalizeCodeFenceInfoString,
  replaceCodeFenceInfoString,
} from "../src/utils/codeFenceLanguage";

const backtickFence = "`".repeat(3);

test("getCodeFenceInfoString reads plain, quoted and contained fence info strings", () => {
  const cases = [
    { source: `${backtickFence}javascript\ncode\n${backtickFence}`, value: "javascript", indentWidth: 0 },
    { source: `> ${backtickFence} TypeScript \n> code\n> ${backtickFence}`, value: "TypeScript", indentWidth: 0 },
    { source: `  ~~~python\r\n  code\r\n  ~~~`, value: "python", indentWidth: 2 },
    { source: `    ${backtickFence}text\n    literal\n    ${backtickFence}`, value: "text", indentWidth: 4 },
    {
      source: "- " + backtickFence + "go\n  code\n  " + backtickFence,
      value: "go",
      indentWidth: 0,
    },
    {
      source: "> 10. " + backtickFence + "rust\n>     code\n>     " + backtickFence,
      value: "rust",
      indentWidth: 0,
    },
  ];

  for (const current of cases) {
    const info = getCodeFenceInfoString(current.source);
    assert.ok(info, current.source);
    assert.equal(info.value, current.value, current.source);
    assert.equal(info.indentWidth, current.indentWidth, current.source);
    assert.equal(current.source.slice(info.from, info.to).trim(), current.value, current.source);
  }
});

test("replaceCodeFenceInfoString replaces or clears only the opening info string", () => {
  const source = `> ${backtickFence}javascript\r\n> const value = 1;\r\n> ${backtickFence}`;

  assert.equal(
    replaceCodeFenceInfoString(source, "python"),
    `> ${backtickFence}python\r\n> const value = 1;\r\n> ${backtickFence}`,
  );
  assert.equal(
    replaceCodeFenceInfoString(source, ""),
    `> ${backtickFence}\r\n> const value = 1;\r\n> ${backtickFence}`,
  );
});

test("normalizeCodeFenceInfoString prevents multiline or invalid backtick info strings", () => {
  assert.equal(normalizeCodeFenceInfoString("  custom-lang\nnext  "), "custom-lang next");
  assert.equal(normalizeCodeFenceInfoString("type`script", backtickFence), "typescript");
  assert.equal(normalizeCodeFenceInfoString("type`script", "~~~"), "type`script");
});

test("getCodeFenceInfoString ignores ordinary indented code without an opening marker", () => {
  assert.equal(getCodeFenceInfoString("    const value = 1;\n    return value;"), null);
});

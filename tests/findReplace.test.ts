import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findMatches,
  findInitialMatchIndex,
  findNextMatchIndex,
  getFindQueryFromSelection,
  replaceAllMatches,
  replaceMatch,
  replaceMatchAndFindNext,
  resolveFindActiveIndex,
} from "../src/utils/findReplace";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("findMatches supports case sensitivity and location metadata", () => {
  const matches = findMatches("Alpha\nalpha beta\nALPHA", "alpha", {
    caseSensitive: false,
    wholeWord: false,
  });

  assert.equal(matches.length, 3);
  assert.deepEqual(matches[1], {
    index: 6,
    length: 5,
    line: 2,
    column: 1,
    preview: "alpha beta",
    text: "alpha",
    groups: [],
    namedGroups: {},
  });

  assert.equal(
    findMatches("Alpha alpha", "Alpha", { caseSensitive: true, wholeWord: false }).length,
    1,
  );
});

test("findMatches supports whole word matching", () => {
  const matches = findMatches("cat scatter cat_1 cat", "cat", {
    caseSensitive: false,
    wholeWord: true,
  });

  assert.equal(matches.length, 2);
  assert.equal(matches[0].index, 0);
  assert.equal(matches[1].index, 18);
});

test("findMatches supports Typora-style regular expressions", () => {
  const matches = findMatches("item-12 item-7 item-x", String.raw`item-\d+`, {
    caseSensitive: false,
    wholeWord: false,
    regularExpression: true,
  });

  assert.deepEqual(matches.map((match) => match.index), [0, 8]);
  assert.deepEqual(matches.map((match) => match.length), [7, 6]);
  assert.deepEqual(findMatches("text", "[", {
    caseSensitive: false,
    wholeWord: false,
    regularExpression: true,
  }), []);
});

test("zero-width Unicode regular expressions advance across surrogate pairs", () => {
  const matches = findMatches("😀a", "(?=.)", {
    caseSensitive: true,
    wholeWord: false,
    regularExpression: true,
  });

  assert.deepEqual(matches.map((match) => match.index), [0, 2]);
});

test("findMatches treats combining marks as word characters for whole word matching", () => {
  const matches = findMatches("cafe\u0301 cafe", "cafe", {
    caseSensitive: false,
    wholeWord: true,
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].index, "cafe\u0301 ".length);
});

test("findNextMatchIndex wraps in both directions", () => {
  const matches = findMatches("one two one", "one", {
    caseSensitive: false,
    wholeWord: false,
  });

  assert.equal(findNextMatchIndex(matches, 1, 1), 1);
  assert.equal(findNextMatchIndex(matches, 99, 1), 0);
  assert.equal(findNextMatchIndex(matches, 1, -1), 0);
  assert.equal(findNextMatchIndex(matches, 0, -1), 1);
});

test("findInitialMatchIndex starts from the current cursor or selected match", () => {
  const source = "one two one three one";
  const matches = findMatches(source, "one", {
    caseSensitive: false,
    wholeWord: false,
  });

  const secondStart = source.indexOf("one", 1);
  assert.equal(findInitialMatchIndex(matches, secondStart, secondStart + "one".length), 1);
  assert.equal(findInitialMatchIndex(matches, source.indexOf("two"), source.indexOf("two")), 1);
  assert.equal(findInitialMatchIndex(matches, source.length, source.length), 0);
});

test("resolveFindActiveIndex preserves a valid active match while results refresh", () => {
  const source = "one two one three one";
  const matches = findMatches(source, "one", {
    caseSensitive: false,
    wholeWord: false,
  });

  assert.equal(resolveFindActiveIndex(matches, 0, 0, 2), 2);
});

test("resolveFindActiveIndex reanchors from the editor cursor when the query changes like Typora", () => {
  const source = "one two one three one";
  const matches = findMatches(source, "one", {
    caseSensitive: false,
    wholeWord: false,
  });
  const cursor = source.indexOf("three");

  assert.equal(resolveFindActiveIndex(matches, cursor, cursor, 0, true), 2);
});

test("replaceMatch and replaceAllMatches edit expected ranges", () => {
  const source = "one two one";
  const matches = findMatches(source, "one", {
    caseSensitive: false,
    wholeWord: false,
  });

  assert.equal(replaceMatch(source, matches[0], "1"), "1 two one");
  assert.equal(replaceAllMatches(source, matches, "1"), "1 two 1");
});

test("replaceMatchAndFindNext selects the following match after replacement", () => {
  const source = "one one one";
  const matches = findMatches(source, "one", {
    caseSensitive: false,
    wholeWord: false,
  });

  const result = replaceMatchAndFindNext(source, matches[0], "one!", "one", {
    caseSensitive: false,
    wholeWord: false,
  });

  assert.equal(result.value, "one! one one");
  assert.equal(result.activeIndex, 1);
  assert.equal(result.matches[result.activeIndex].index, 5);

  const wrapped = replaceMatchAndFindNext(result.value, result.matches[2], "1", "one", {
    caseSensitive: false,
    wholeWord: false,
  });
  assert.equal(wrapped.activeIndex, 0);
});

test("regular expression replacement expands numbered and named groups", () => {
  const source = "first:12 second:7";
  const query = String.raw`(?<name>\w+):(\d+)`;
  const options = {
    caseSensitive: true,
    wholeWord: false,
    regularExpression: true,
  };
  const matches = findMatches(source, query, options);

  assert.equal(
    replaceMatchAndFindNext(source, matches[0], "$<name>=$2", query, options).value,
    "first=12 second:7",
  );
  assert.equal(replaceAllMatches(source, matches, "$1[$2]", true), "first[12] second[7]");
});

test("getFindQueryFromSelection uses single-line selections like Typora", () => {
  assert.equal(getFindQueryFromSelection("selected text", "old"), "selected text");
  assert.equal(getFindQueryFromSelection("", "old"), "old");
  assert.equal(getFindQueryFromSelection("first\nsecond", "old"), "old");
});

test("App find panel lets Escape close from any focused control", () => {
  assert.match(appSource, /<section\s+v-if="findPanelVisible"[\s\S]*?class="find-panel"[\s\S]*?tabindex="-1"[\s\S]*?@keydown\.escape="closeFindPanel"/);
  assert.match(appSource, /function closeFindPanel\(\) \{[\s\S]*?findPanelVisible\.value = false;[\s\S]*?findReplaceVisible\.value = false;[\s\S]*?editorRef\.value\?\.focus\(\);/);
  assert.doesNotMatch(appSource, /class="find-input"[\s\S]{0,120}@keydown\.escape="closeFindPanel"/);
});

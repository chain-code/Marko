import assert from "node:assert/strict";
import test from "node:test";
import {
  lastUsedCodeLanguage,
  normalizeDefaultCodeLanguage,
  normalizeDefaultCodeLanguageApplyTo,
  resolveDefaultCodeLanguage,
} from "../src/utils/codeLanguagePreference";

test("default code language keeps empty, fixed and Typora last-used modes", () => {
  assert.equal(normalizeDefaultCodeLanguage("  "), "");
  assert.equal(normalizeDefaultCodeLanguage(" Type Script "), "Type Script");
  assert.equal(normalizeDefaultCodeLanguage("ts<script>"), "tsscript");
  assert.equal(normalizeDefaultCodeLanguage(lastUsedCodeLanguage), lastUsedCodeLanguage);
});

test("default code language application channels follow the Typora bit mask", () => {
  assert.equal(normalizeDefaultCodeLanguageApplyTo(1), "markdown");
  assert.equal(normalizeDefaultCodeLanguageApplyTo(2), "menu");
  assert.equal(normalizeDefaultCodeLanguageApplyTo(3), "both");
  assert.equal(normalizeDefaultCodeLanguageApplyTo("invalid"), "markdown");

  assert.equal(resolveDefaultCodeLanguage("ts", "markdown", "markdown"), "ts");
  assert.equal(resolveDefaultCodeLanguage("ts", "markdown", "menu"), "");
  assert.equal(resolveDefaultCodeLanguage("go", "menu", "menu"), "go");
  assert.equal(resolveDefaultCodeLanguage("go", "menu", "markdown"), "");
  assert.equal(resolveDefaultCodeLanguage("rust", "both", "markdown"), "rust");
  assert.equal(resolveDefaultCodeLanguage("rust", "both", "menu"), "rust");
});

test("last-used default resolves to the current editor language without leaking its sentinel", () => {
  assert.equal(resolveDefaultCodeLanguage(lastUsedCodeLanguage, "both", "markdown", "python"), "python");
  assert.equal(resolveDefaultCodeLanguage(lastUsedCodeLanguage, "both", "menu", ""), "");
  assert.equal(resolveDefaultCodeLanguage("", "both", "menu", "python"), "");
});

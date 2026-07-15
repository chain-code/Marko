import test from "node:test";
import assert from "node:assert/strict";
import { formatDocumentTitle } from "../src/utils/documentTitle";

test("formatDocumentTitle includes file name and dirty marker", () => {
  assert.equal(formatDocumentTitle("notes.md", false), "notes.md - Marko");
  assert.equal(formatDocumentTitle("notes.md", true), "● notes.md - Marko");
  assert.equal(formatDocumentTitle(" ", false), "未命名.md - Marko");
});

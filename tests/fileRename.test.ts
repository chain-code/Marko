import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFolderName, normalizeRenameFileName } from "../src/utils/fileRename";

test("normalizeRenameFileName keeps explicit file extensions", () => {
  assert.deepEqual(normalizeRenameFileName("plan.markdown", "old.md"), {
    ok: true,
    fileName: "plan.markdown",
  });
});

test("normalizeRenameFileName appends the current markdown extension when omitted", () => {
  assert.deepEqual(normalizeRenameFileName("plan", "old.md"), {
    ok: true,
    fileName: "plan.md",
  });
  assert.deepEqual(normalizeRenameFileName("plan", "old.markdown"), {
    ok: true,
    fileName: "plan.markdown",
  });
});

test("normalizeRenameFileName rejects empty and path-like names", () => {
  assert.equal(normalizeRenameFileName(" ", "old.md").ok, false);
  assert.equal(normalizeRenameFileName("../new.md", "old.md").ok, false);
  assert.equal(normalizeRenameFileName("nested/new.md", "old.md").ok, false);
});

test("normalizeFolderName keeps folder names without Markdown extension behavior", () => {
  assert.deepEqual(normalizeFolderName(" notes.md "), { ok: true, fileName: "notes.md" });
  assert.equal(normalizeFolderName(" ").ok, false);
  assert.equal(normalizeFolderName("../bad").ok, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  addRecentFileEntry,
  normalizeRecentFiles,
  parseRecentFiles,
  recentFilesLimit,
  replaceRecentFileEntry,
  serializeRecentFiles,
} from "../src/utils/recentFiles";

test("addRecentFileEntry adds newest files first and deduplicates like Typora", () => {
  const recent = addRecentFileEntry([
    { path: "C:/docs/old.md", name: "old.md", openedAt: 1 },
    { path: "C:/docs/current.md", name: "current.md", openedAt: 2 },
  ], "C:/docs/old.md", 3);

  assert.deepEqual(recent, [
    { path: "C:/docs/old.md", name: "old.md", openedAt: 3 },
    { path: "C:/docs/current.md", name: "current.md", openedAt: 2 },
  ]);
});

test("addRecentFileEntry trims empty paths and caps the recent list", () => {
  const many = Array.from({ length: recentFilesLimit + 4 }, (_, index) => ({
    path: `C:/docs/${index}.md`,
    name: `${index}.md`,
    openedAt: index,
  }));

  assert.equal(addRecentFileEntry(many, "C:/docs/new.md", 99).length, recentFilesLimit);
  assert.deepEqual(addRecentFileEntry(many, "   ", 99), many.slice(0, recentFilesLimit));
});

test("replaceRecentFileEntry removes the old renamed path", () => {
  assert.deepEqual(replaceRecentFileEntry([
    { path: "C:/docs/old.md", name: "old.md", openedAt: 1 },
    { path: "C:/docs/keep.md", name: "keep.md", openedAt: 2 },
  ], "C:/docs/old.md", "C:/docs/new.md", 3), [
    { path: "C:/docs/new.md", name: "new.md", openedAt: 3 },
    { path: "C:/docs/keep.md", name: "keep.md", openedAt: 2 },
  ]);
});

test("parseRecentFiles normalizes persisted recent file data", () => {
  const raw = JSON.stringify([
    { path: " C:/docs/a.md ", name: "", openedAt: 2 },
    { path: "C:/docs/a.md", name: "duplicate.md", openedAt: 1 },
    { path: "", name: "bad.md", openedAt: 1 },
    { path: "C:/docs/b.markdown", openedAt: Number.NaN },
  ]);

  assert.deepEqual(parseRecentFiles(raw), [
    { path: "C:/docs/a.md", name: "a.md", openedAt: 2 },
    { path: "C:/docs/b.markdown", name: "b.markdown", openedAt: 0 },
  ]);
  assert.deepEqual(parseRecentFiles("{bad"), []);
});

test("serializeRecentFiles keeps the same normalized shape", () => {
  const normalized = normalizeRecentFiles([
    { path: "C:/docs/a.md", name: "a.md", openedAt: 1 },
    { path: "C:/docs/a.md", name: "duplicate.md", openedAt: 2 },
  ]);

  assert.equal(serializeRecentFiles(normalized), JSON.stringify(normalized));
});

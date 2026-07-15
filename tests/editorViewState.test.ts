import assert from "node:assert/strict";
import test from "node:test";
import { createEditorViewStateCache, initialEditorViewState } from "../src/utils/editorViewState";

test("editor view state cache restores selection and scroll position per file", () => {
  const cache = createEditorViewStateCache();
  cache.remember("C:\\notes\\one.md", { anchor: 12, head: 18, scrollTop: 240 });
  cache.remember("C:\\notes\\two.md", { anchor: 4, head: 4, scrollTop: 80 });

  assert.deepEqual(cache.recall("C:/notes/one.md"), { anchor: 12, head: 18, scrollTop: 240 });
  assert.deepEqual(cache.recall("C:/notes/two.md"), { anchor: 4, head: 4, scrollTop: 80 });
  assert.deepEqual(cache.recall("C:/notes/missing.md"), null);
});

test("editor view state cache moves renamed files and removes deleted folders", () => {
  const cache = createEditorViewStateCache();
  cache.remember("C:/notes/old.md", { anchor: 8, head: 8, scrollTop: 90 });
  cache.move("C:/notes/old.md", "C:/notes/new.md");

  assert.equal(cache.recall("C:/notes/old.md"), null);
  assert.deepEqual(cache.recall("C:/notes/new.md"), { anchor: 8, head: 8, scrollTop: 90 });

  cache.remember("C:/notes/archive/a.md", { anchor: 1, head: 2, scrollTop: 3 });
  cache.remove("C:/notes/archive", true);
  assert.equal(cache.recall("C:/notes/archive/a.md"), null);
  assert.deepEqual(initialEditorViewState, { anchor: 0, head: 0, scrollTop: 0 });
});

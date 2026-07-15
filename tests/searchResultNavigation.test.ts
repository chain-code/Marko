import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("App sidebar search results jump to the selected match without clearing search state", () => {
  assert.match(appSource, /@open-search-result="openGlobalSearchResult"/);
  const handler = appSource.match(/async function openGlobalSearchResult\(result: SearchResult\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(handler, /await openSearchResult\(result\);/);
  assert.doesNotMatch(handler, /clearGlobalSearch/);
  assert.match(
    appSource,
    /async function openSearchResult\(result: SearchResult\) \{[\s\S]*?await editorRef\.value\?\.selectRange\(start, end\);\s*await editorRef\.value\?\.jumpToSelection\(\);[\s\S]*?\}/,
  );
});

test("App outline clicks jump the selected heading into view", () => {
  assert.match(appSource, /@open-outline-item="openOutlineItem"/);
  assert.match(
    appSource,
    /async function openOutlineItem\(item: OutlineItem\) \{[\s\S]*?const range = getOutlineSelectionRange\(markdown\.value, item\);[\s\S]*?await editorRef\.value\?\.selectRange\(range\.start, range\.end\);\s*await editorRef\.value\?\.jumpToSelection\(\);[\s\S]*?\}/,
  );
});

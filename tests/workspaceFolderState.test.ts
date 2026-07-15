import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("closing the workspace folder clears workspace-scoped UI state", () => {
  assert.match(appSource, /function closeWorkspaceFolder\(\) \{/);
  assert.match(appSource, /rootPath\.value = "";/);
  assert.match(appSource, /fileTree\.value = \[];/);
  assert.match(appSource, /searchQuery\.value = "";/);
  assert.match(appSource, /searchResults\.value = \[];/);
  assert.match(appSource, /closeQuickOpen\(false\);/);
});

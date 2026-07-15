import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("App removes stale recent-file entries when opening them fails", () => {
  assert.match(appSource, /const wasRecent = hasRecentPath\(path\);/);
  assert.match(appSource, /function hasRecentPath\(path: string\): boolean \{\s*return recentFiles\.value\.some\(\(item\) => isSameTreePath\(item\.path, path\)\);\s*\}/);
  assert.match(appSource, /if \(wasRecent\) \{\s*removeRecentPath\(path, false\);\s*showToast\(`\$\{formatError\(error\)\}，已从最近文件移除`, "danger"\);\s*\} else \{\s*showToast\(formatError\(error\), "danger"\);\s*\}/);
});

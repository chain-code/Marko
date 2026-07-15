import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sidebarSource = readFileSync(resolve("src/components/AppSidebar.vue"), "utf8");
const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("AppSidebar exposes Typora-style file, outline, and search tabs", () => {
  assert.match(sidebarSource, /const tabs = \[\s*\{ key: "files", label: "文件"[\s\S]*\{ key: "outline", label: "大纲"[\s\S]*\{ key: "search", label: "搜索"[\s\S]*\] as const;/);
  assert.match(sidebarSource, /role="tablist" aria-label="侧栏视图"/);
  assert.match(sidebarSource, /:aria-selected="activeTab === item\.key"/);
  assert.match(sidebarSource, /@keydown="handleTabKeydown\(\$event, item\.key\)"/);
});

test("sidebar search is controlled and exposes submit and result selection events", () => {
  assert.match(sidebarSource, /searchQuery\?: string;/);
  assert.match(sidebarSource, /searchResults\?: SearchResult\[];/);
  assert.match(sidebarSource, /"update:searchQuery": \[value: string\];/);
  assert.match(sidebarSource, /submitSearch: \[query: string\];/);
  assert.match(sidebarSource, /openSearchResult: \[result: SearchResult\];/);
  assert.match(sidebarSource, /@submit\.prevent="submitSidebarSearch"/);
  assert.match(sidebarSource, /@click="\$emit\('openSearchResult', result\)"/);
});

test("global search opens and stays in the sidebar instead of using a modal overlay", () => {
  assert.match(appSource, /:search-query="searchQuery"/);
  assert.match(appSource, /:search-results="searchResults"/);
  assert.match(appSource, /:search-pending="searchPending"/);
  assert.match(appSource, /@submit-search="runGlobalSearch"/);
  assert.match(appSource, /@open-search-result="openGlobalSearchResult"/);
  assert.match(
    appSource,
    /async function openGlobalSearchPanel\(\) \{[\s\S]*?showSidebarTab\("search"\);\s*await nextTick\(\);\s*await sidebarRef\.value\?\.focusSearch\(\);\s*\}/,
  );
  assert.doesNotMatch(appSource, /globalSearchVisible|globalSearchInputRef/);
});

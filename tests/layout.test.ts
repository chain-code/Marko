import test from "node:test";
import assert from "node:assert/strict";
import {
  activateSidebarTab,
  clampSidebarWidth,
  sidebarWidthDefault,
  sidebarWidthMax,
  sidebarWidthMin,
} from "../src/utils/layout";

test("clampSidebarWidth keeps sidebar width in a usable range", () => {
  assert.equal(clampSidebarWidth(100), sidebarWidthMin);
  assert.equal(clampSidebarWidth(999), sidebarWidthMax);
  assert.equal(clampSidebarWidth(301.6), 302);
  assert.equal(clampSidebarWidth(Number.NaN), sidebarWidthDefault);
});

test("activateSidebarTab shows the requested Typora-style sidebar panel", () => {
  assert.deepEqual(
    activateSidebarTab({ sidebarVisible: false, focusMode: true, activeTab: "files" }, "outline"),
    { sidebarVisible: true, focusMode: false, activeTab: "outline" },
  );
});

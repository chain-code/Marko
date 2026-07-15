import test from "node:test";
import assert from "node:assert/strict";
import { shouldBlockNavigation } from "../src/utils/unsavedChanges";

test("shouldBlockNavigation only blocks dirty documents", () => {
  assert.equal(shouldBlockNavigation(false), false);
  assert.equal(shouldBlockNavigation(true), true);
});

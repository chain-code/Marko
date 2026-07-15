import test from "node:test";
import assert from "node:assert/strict";
import {
  findAdjacentMenuItemIndex,
  findBoundaryMenuItemIndex,
  getNavigableMenuIndexes,
  isMenuActivationKey,
  wrapMenuIndex,
} from "../src/utils/menuNavigation";

const items = [
  { type: "action" },
  { type: "separator" },
  { type: "action", disabled: true },
  { type: "submenu" },
  { type: "action" },
];

test("menu navigation skips separators and disabled items", () => {
  assert.deepEqual(getNavigableMenuIndexes(items), [0, 3, 4]);
  assert.equal(findAdjacentMenuItemIndex(items, 0, 1), 3);
  assert.equal(findAdjacentMenuItemIndex(items, 3, -1), 0);
});

test("menu item navigation wraps in both directions", () => {
  assert.equal(findAdjacentMenuItemIndex(items, 4, 1), 0);
  assert.equal(findAdjacentMenuItemIndex(items, 0, -1), 4);
  assert.equal(findAdjacentMenuItemIndex([], 0, 1), -1);
});

test("menu item navigation resolves first and last enabled items", () => {
  assert.equal(findBoundaryMenuItemIndex(items, "first"), 0);
  assert.equal(findBoundaryMenuItemIndex(items, "last"), 4);
  assert.equal(findBoundaryMenuItemIndex([{ type: "separator" }], "first"), -1);
});

test("top-level menu navigation wraps around the menubar", () => {
  assert.equal(wrapMenuIndex(0, 7, -1), 6);
  assert.equal(wrapMenuIndex(6, 7, 1), 0);
  assert.equal(wrapMenuIndex(2, 7, 1), 3);
  assert.equal(wrapMenuIndex(0, 0, 1), -1);
});

test("Enter and Space activate focused menu items", () => {
  assert.equal(isMenuActivationKey("Enter"), true);
  assert.equal(isMenuActivationKey(" "), true);
  assert.equal(isMenuActivationKey("Spacebar"), false);
});

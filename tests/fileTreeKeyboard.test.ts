import test from "node:test";
import assert from "node:assert/strict";
import { resolveFileTreeKey } from "../src/utils/fileTreeKeyboard";

const fileState = {
  isDirectory: false,
  expanded: false,
  hasChildren: false,
  hasParent: true,
};

test("file tree maps linear navigation and activation keys", () => {
  assert.equal(resolveFileTreeKey("ArrowUp", fileState), "previous");
  assert.equal(resolveFileTreeKey("ArrowDown", fileState), "next");
  assert.equal(resolveFileTreeKey("Home", fileState), "first");
  assert.equal(resolveFileTreeKey("End", fileState), "last");
  assert.equal(resolveFileTreeKey("Enter", fileState), "activate");
  assert.equal(resolveFileTreeKey(" ", fileState), "activate");
});

test("file tree right arrow expands folders before entering their children", () => {
  assert.equal(resolveFileTreeKey("ArrowRight", {
    isDirectory: true,
    expanded: false,
    hasChildren: true,
    hasParent: false,
  }), "expand");
  assert.equal(resolveFileTreeKey("ArrowRight", {
    isDirectory: true,
    expanded: true,
    hasChildren: true,
    hasParent: false,
  }), "child");
  assert.equal(resolveFileTreeKey("ArrowRight", fileState), null);
});

test("file tree left arrow collapses folders before focusing their parent", () => {
  assert.equal(resolveFileTreeKey("ArrowLeft", {
    isDirectory: true,
    expanded: true,
    hasChildren: true,
    hasParent: true,
  }), "collapse");
  assert.equal(resolveFileTreeKey("ArrowLeft", {
    isDirectory: true,
    expanded: false,
    hasChildren: true,
    hasParent: true,
  }), "parent");
  assert.equal(resolveFileTreeKey("ArrowLeft", { ...fileState, hasParent: false }), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  clampViewerScale,
  getViewerContentSize,
  getViewerContentStyle,
  parseViewerLength,
} from "../src/utils/mediaViewer";

test("clampViewerScale rounds and clamps media zoom", () => {
  assert.equal(clampViewerScale(0.1), 0.4);
  assert.equal(clampViewerScale(3.9), 3);
  assert.equal(clampViewerScale(1.234), 1.23);
  assert.equal(clampViewerScale(Number.NaN), 1);
});

test("parseViewerLength accepts SVG pixel lengths and rejects fluid values", () => {
  assert.equal(parseViewerLength("640"), 640);
  assert.equal(parseViewerLength(" 320.5px "), 320.5);
  assert.equal(parseViewerLength(128), 128);
  assert.equal(parseViewerLength("100%"), 0);
  assert.equal(parseViewerLength("auto"), 0);
  assert.equal(parseViewerLength(-1), 0);
});

test("getViewerContentSize prefers intrinsic diagram dimensions over rendered CSS size", () => {
  assert.deepEqual(getViewerContentSize({
    viewBoxWidth: 1200,
    viewBoxHeight: 640,
    svgWidth: "640px",
    svgHeight: "320px",
    renderedWidth: 300,
    renderedHeight: 160,
  }), { width: 1200, height: 640 });
});

test("getViewerContentSize falls back from SVG attributes to image and rendered dimensions", () => {
  assert.deepEqual(getViewerContentSize({
    svgWidth: "640px",
    svgHeight: "320px",
    naturalWidth: 1920,
    naturalHeight: 1080,
    renderedWidth: 300,
    renderedHeight: 160,
  }), { width: 640, height: 320 });

  assert.deepEqual(getViewerContentSize({
    naturalWidth: 1920,
    naturalHeight: 1080,
    renderedWidth: 300,
    renderedHeight: 160,
  }), { width: 1920, height: 1080 });

  assert.deepEqual(getViewerContentSize({
    renderedWidth: 300,
    renderedHeight: 160,
  }), { width: 300, height: 160 });
});

test("getViewerContentSize keeps a usable minimum for missing or invalid dimensions", () => {
  assert.deepEqual(getViewerContentSize({
    viewBoxWidth: 0,
    viewBoxHeight: Number.NaN,
    svgWidth: "100%",
    svgHeight: "auto",
  }), { width: 1, height: 1 });
});

test("getViewerContentStyle returns stable scaled dimensions", () => {
  assert.deepEqual(getViewerContentStyle({ width: 1000, height: 500 }, 1.234), {
    width: "1230px",
    height: "615px",
  });
  assert.deepEqual(getViewerContentStyle({ width: 1000, height: 500 }, 10), {
    width: "3000px",
    height: "1500px",
  });
});

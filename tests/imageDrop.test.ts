import test from "node:test";
import assert from "node:assert/strict";
import { getDroppedImageSource } from "../src/utils/imageDrop";

test("getDroppedImageSource reads browser URI lists and plain image URLs", () => {
  assert.deepEqual(getDroppedImageSource({
    uriList: "# browser drag\nhttps://example.com/images/flow%20chart.png?size=2",
  }), {
    source: "https://example.com/images/flow%20chart.png?size=2",
    alt: "flow chart",
  });
  assert.deepEqual(getDroppedImageSource({ text: "https://example.com/cover.webp#large" }), {
    source: "https://example.com/cover.webp#large",
    alt: "cover",
  });
  assert.equal(getDroppedImageSource({ text: "https://example.com/article" }), null);
  assert.equal(getDroppedImageSource({ text: "javascript:alert(1).png" }), null);
  assert.equal(getDroppedImageSource({ text: "data:text/html,hello.png" }), null);
});

test("getDroppedImageSource prefers a structured HTML image and keeps its alt text", () => {
  const globals = globalThis as { DOMParser?: unknown };
  const previous = globals.DOMParser;
  globals.DOMParser = class {
    parseFromString() {
      return {
        querySelector: () => ({
          getAttribute: (name: string) => (
            name === "src" ? "https://cdn.example.com/content/image?id=7" : "流程图"
          ),
        }),
      };
    }
  };

  try {
    assert.deepEqual(getDroppedImageSource({
      html: '<a href="https://example.com"><img src="https://cdn.example.com/content/image?id=7" alt="流程图"></a>',
      uriList: "https://example.com/page",
    }), {
      source: "https://cdn.example.com/content/image?id=7",
      alt: "流程图",
    });
  } finally {
    globals.DOMParser = previous;
  }
});

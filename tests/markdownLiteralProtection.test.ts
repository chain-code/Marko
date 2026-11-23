import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/utils/markdown";
import { defaultEditorSettings } from "../src/utils/editorSettings";
import type { EditorSettings } from "../src/types";

const settings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

test("跨行行内代码中的脚注标记保持字面文本", () => {
  const tick = String.fromCharCode(96);
  const html = renderMarkdown([
    tick + "first",
    "[^id]",
    "last" + tick,
    "",
    "outside[^id]",
    "",
    "[^id]: detail",
  ].join("\n"), {
    settings: {
      ...settings,
      extensions: { ...settings.extensions, footnote: false },
    },
  });

  assert.match(html, /<code>first \[\^id] last<\/code>/);
  assert.doesNotMatch(html, /<code>[^<]*\\\[\\\^id]/);
  assert.doesNotMatch(html, /footnote-ref|footnotes/);
});

test("跨行行内代码中的 TOC 标记不会生成导航", () => {
  const tick = String.fromCharCode(96);
  for (const marker of ["[TOC]", "{:toc}", "[[_TOC_]]", "{: toc depth=3 }"]) {
    const html = renderMarkdown([
      tick + "first",
      marker,
      "last" + tick,
      "",
      marker,
    ].join("\n"), {
      settings,
      outline: [{ id: "intro", title: "Intro", level: 1, line: 1 }],
    });

    assert.equal(html.match(/class="toc-inline"/g)?.length, 1, marker);
    assert.match(html, new RegExp(`<code>first ${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} last<\\/code>`));
  }
});

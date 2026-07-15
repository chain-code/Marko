import test from "node:test";
import assert from "node:assert/strict";
import { buildExportHtml } from "../src/utils/exportHtml";
import { defaultEditorSettings } from "../src/utils/editorSettings";
import type { EditorSettings } from "../src/types";

const settings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

test("buildExportHtml renders a complete html document", () => {
  const html = buildExportHtml({
    title: 'A "Title"',
    markdown: "# Hello\n\nInline $x^2$.",
    outline: [],
    settings,
  });

  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>A &quot;Title&quot;<\/title>/);
  assert.match(html, /katex@0\.16\.47\/dist\/katex\.min\.css/);
  assert.match(html, /<h1/);
  assert.match(html, /Hello/);
  assert.match(html, /katex/);
  assert.doesNotMatch(html, /mermaid\.esm\.min\.mjs|flowchart\.min\.js/);
});

test("buildExportHtml preserves diagram rendering without editor source panels", () => {
  const html = buildExportHtml({
    title: "Diagrams",
    markdown: [
      "```mermaid",
      "flowchart LR",
      "  A --> B",
      "```",
      "",
      "```flowchart",
      "st=>start: Start",
      "e=>end: End",
      "st->e",
      "```",
    ].join("\n"),
    outline: [],
    settings,
  });

  assert.match(html, /class="diagram-box mermaid-diagram"/);
  assert.match(html, /class="diagram-box flowchart-diagram"/);
  assert.match(html, /\.diagram-source-panel\{display:none;\}/);
  assert.match(html, /mermaid@11\.4\.1\/dist\/mermaid\.esm\.min\.mjs/);
  assert.match(html, /mermaid\.initialize/);
  assert.match(html, /flowchart\.js@1\.18\.0\/release\/flowchart\.min\.js/);
  assert.match(html, /flowchart\.parse/);
});

test("buildExportHtml preserves definition lists like Typora", () => {
  const html = buildExportHtml({
    title: "Definitions",
    markdown: "Term\n: Definition",
    outline: [],
    settings,
  });

  assert.match(html, /<dl class="definition-list">/);
  assert.match(html, /<dt>Term<\/dt><dd>Definition<\/dd>/);
  assert.match(html, /dd\{border-left:2px solid #d8e5ff/);
});

test("buildExportHtml preserves loose definition list paragraphs like Typora", () => {
  const html = buildExportHtml({
    title: "Definitions",
    markdown: [
      "Term",
      ": First paragraph",
      "",
      "    Second paragraph",
    ].join("\n"),
    outline: [],
    settings,
  });

  assert.match(html, /<dd><p>First paragraph<\/p>\s*<p>Second paragraph<\/p><\/dd>/);
});

test("buildExportHtml preserves abbreviation definitions like Typora", () => {
  const html = buildExportHtml({
    title: "Abbreviations",
    markdown: "HTML\n\n*[HTML]: Hyper Text Markup Language",
    outline: [],
    settings,
  });

  assert.match(html, /<abbr title="Hyper Text Markup Language">HTML<\/abbr>/);
  assert.match(html, /abbr\[title]\{cursor:help/);
  assert.doesNotMatch(html, /\*\[HTML]:/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getContinuousDiagramLanguage,
  getContinuousPreviewBlocks,
} from "../src/utils/continuousEditor";
import { insertMarkdownDiagramTemplate } from "../src/utils/editorCommands";
import { defaultEditorSettings, parseEditorSettings } from "../src/utils/editorSettings";
import { buildExportHtml } from "../src/utils/exportHtml";
import { renderMarkdown } from "../src/utils/markdown";
import type { EditorSettings } from "../src/types";

const sequenceSource = [
  "Alice->Bob: Hello Bob, how are you?",
  "Note right of Bob: Bob thinks",
  "Bob-->Alice: I am good thanks!",
].join("\n");

const settings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

test("sequence fences render an independent diagram box with a stable source fallback", () => {
  const markdown = "```sequence\n" + sequenceSource + "\n```";
  const html = renderMarkdown(markdown, { settings });

  assert.match(html, /class="diagram-box sequence-diagram"/);
  assert.match(html, /class="sequence-render"/);
  assert.match(html, /class="sequence-fallback"/);
  assert.match(html, /Alice-&gt;Bob: Hello Bob, how are you\?/);

  const disabled = renderMarkdown(markdown, {
    settings: {
      ...settings,
      extensions: { ...settings.extensions, sequence: false },
    },
  });
  assert.doesNotMatch(disabled, /sequence-diagram|sequence-render/);
  assert.match(disabled, /<pre><code class="hljs">/);
  assert.match(disabled, /Alice-&gt;Bob/);
});

test("continuous preview recognizes sequence fences in plain, quoted and list containers", () => {
  const plain = "```sequence\n" + sequenceSource + "\n```";
  const quoted = plain.split("\n").map((line) => "> " + line).join("\n");
  const listed = [
    "- 时序图",
    ...plain.split("\n").map((line) => "  " + line),
  ].join("\n");

  assert.equal(getContinuousDiagramLanguage(plain), "sequence");
  const plainBlock = getContinuousPreviewBlocks(plain)[0];
  const quotedBlock = getContinuousPreviewBlocks(quoted)[0];
  const listedBlock = getContinuousPreviewBlocks(listed)[0];
  assert.equal(plainBlock?.kind, "diagram");
  assert.equal(quotedBlock?.kind, "diagram");
  assert.equal(quotedBlock?.quoteDepth, 1);
  assert.equal(listedBlock?.kind, "diagram");
  assert.equal(listedBlock?.listDepth, 0);
});

test("sequence insertion uses the Typora Alice and Bob legacy example", () => {
  const result = insertMarkdownDiagramTemplate(
    { value: "Intro", selectionStart: 5, selectionEnd: 5 },
    "sequence",
  );

  assert.equal(
    result.value,
    "Intro\n```sequence\n" + sequenceSource + "\n```\n",
  );
  assert.equal(
    result.value.slice(result.selectionStart, result.selectionEnd),
    sequenceSource,
  );
});

test("sequence is enabled by default and preserved across legacy settings migration", () => {
  assert.equal(defaultEditorSettings.extensions.sequence, true);
  assert.equal(parseEditorSettings(JSON.stringify({ extensions: { math: false } })).extensions.sequence, true);
  assert.equal(parseEditorSettings(JSON.stringify({ extensions: { sequence: false } })).extensions.sequence, false);
});

test("sequence export keeps a visible local fallback without adding a sequence CDN", () => {
  const html = buildExportHtml({
    title: "Sequence",
    markdown: "```sequence\n" + sequenceSource + "\n```",
    outline: [],
    settings,
  });

  assert.match(html, /class="diagram-box sequence-diagram"/);
  assert.match(html, /class="sequence-fallback"/);
  assert.match(html, /Alice-&gt;Bob: Hello Bob, how are you\?/);
  assert.doesNotMatch(html, /js-sequence-diagrams|@hackmd|cdn[^"'\s]*sequence/i);
});

test("toolbar and both editor command paths expose sequence insertion", () => {
  const toolbar = readFileSync(resolve("src/components/AppToolbar.vue"), "utf8");
  const continuous = readFileSync(resolve("src/components/ContinuousMarkdownEditor.vue"), "utf8");
  const block = readFileSync(resolve("src/components/BlockEditor.vue"), "utf8");

  assert.match(toolbar, /action\("Sequence 时序图",\s*Workflow,\s*\(\) => emit\("command", "sequence"\)\)/);
  assert.match(continuous, /case "sequence": return insertMarkdownDiagramTemplate\(state, "sequence"\)/);
  assert.match(block, /case "sequence":[\s\S]*insertDiagramTemplate\("sequence"\)/);
});

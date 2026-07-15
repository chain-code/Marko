import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const editorSource = readFileSync(resolve("src/components/ContinuousMarkdownEditor.vue"), "utf8");

test("Continuous editor configures the active CodeMirror content for spellcheck", () => {
  assert.match(editorSource, /EditorView\.contentAttributes\.of\(\{/);
  assert.match(editorSource, /lang: "en"/);
  assert.match(editorSource, /spellcheck: props\.settings\.spellcheck \? "true" : "false"/);
  assert.match(editorSource, /contentAttributesCompartment\.reconfigure/);
});

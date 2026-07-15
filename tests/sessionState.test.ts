import test from "node:test";
import assert from "node:assert/strict";
import {
  createLoadedEditorSession,
  createUntitledEditorSession,
  fingerprintDiskContent,
  parseEditorSession,
  prepareEditorSessionForRecovery,
  serializeEditorSession,
  type EditorSessionState,
} from "../src/utils/sessionState";

const fallback: EditorSessionState = {
  markdown: "# Demo",
  originalMarkdown: "# Demo",
  currentFilePath: "",
  currentFileName: "未命名.md",
  rootPath: "",
};

test("serializeEditorSession round trips persisted document state", () => {
  const session: EditorSessionState = {
    markdown: "# Draft\n\nChanged",
    originalMarkdown: "# Draft",
    currentFilePath: "C:/docs/draft.md",
    currentFileName: "draft.md",
    rootPath: "C:/docs",
  };

  assert.deepEqual(parseEditorSession(serializeEditorSession(session), fallback), session);
});

test("createUntitledEditorSession resets document content like Typora", () => {
  assert.deepEqual(createUntitledEditorSession("C:/docs"), {
    markdown: "",
    originalMarkdown: "",
    currentFilePath: "",
    currentFileName: "未命名.md",
    rootPath: "C:/docs",
  });
});

test("createLoadedEditorSession marks disk content as clean", () => {
  assert.deepEqual(createLoadedEditorSession("# Reloaded", "C:/docs/a.md", "a.md", "C:/docs"), {
    markdown: "# Reloaded",
    originalMarkdown: "# Reloaded",
    currentFilePath: "C:/docs/a.md",
    currentFileName: "a.md",
    rootPath: "C:/docs",
    diskBaselineFingerprint: fingerprintDiskContent("# Reloaded"),
  });
});

test("loaded and restored sessions normalize line endings for CodeMirror without becoming dirty", () => {
  const loaded = createLoadedEditorSession("first\r\nsecond\rthird", "C:/docs/a.md", "a.md");
  assert.equal(loaded.markdown, "first\nsecond\nthird");
  assert.equal(loaded.originalMarkdown, loaded.markdown);
  assert.equal(loaded.diskBaselineFingerprint, fingerprintDiskContent("first\r\nsecond\rthird"));

  const restored = parseEditorSession(JSON.stringify({
    version: 1,
    markdown: "changed\r\ntext",
    originalMarkdown: "saved\r\ntext",
    currentFilePath: "C:/docs/a.md",
    currentFileName: "a.md",
    rootPath: "C:/docs",
  }), fallback);
  assert.equal(restored.markdown, "changed\ntext");
  assert.equal(restored.originalMarkdown, "saved\ntext");
});

test("parseEditorSession falls back for invalid or unsupported data", () => {
  assert.deepEqual(parseEditorSession(null, fallback), fallback);
  assert.deepEqual(parseEditorSession("{bad json", fallback), fallback);
  assert.deepEqual(parseEditorSession(JSON.stringify({ version: 2, markdown: "x" }), fallback), fallback);
});

test("parseEditorSession fills optional fields from markdown and fallback", () => {
  const parsed = parseEditorSession(JSON.stringify({ version: 1, markdown: "# Restored" }), fallback);

  assert.deepEqual(parsed, {
    markdown: "# Restored",
    originalMarkdown: "# Restored",
    currentFilePath: "",
    currentFileName: "未命名.md",
    rootPath: "",
  });
});

test("prepareEditorSessionForRecovery discards only unsaved draft content when disabled", () => {
  const dirty: EditorSessionState = {
    markdown: "changed",
    originalMarkdown: "saved",
    currentFilePath: "C:/docs/a.md",
    currentFileName: "a.md",
    rootPath: "C:/docs",
  };

  assert.deepEqual(prepareEditorSessionForRecovery(dirty, false), {
    ...dirty,
    markdown: "saved",
  });
  assert.equal(prepareEditorSessionForRecovery(dirty, true), dirty);
});

test("detached empty drafts stay dirty without leaking marker text when recovery is disabled", () => {
  const detached: EditorSessionState = {
    markdown: "",
    originalMarkdown: "",
    currentFilePath: "",
    currentFileName: "draft.md",
    rootPath: "",
    forceDirty: true,
  };

  assert.equal(parseEditorSession(serializeEditorSession(detached), fallback).forceDirty, true);
  assert.deepEqual(prepareEditorSessionForRecovery(detached, false), {
    markdown: "",
    originalMarkdown: "",
    currentFilePath: "",
    currentFileName: "draft.md",
    rootPath: "",
  });
});

test("restoring a crashed session removes unfinished image placeholders", () => {
  const restored = parseEditorSession(JSON.stringify({
    version: 1,
    markdown: "before\n<!--marko-image-test-1-->\nafter",
    originalMarkdown: "beforeafter",
    currentFilePath: "",
    currentFileName: "draft.md",
    rootPath: "",
  }), fallback);

  assert.equal(restored.markdown, "beforeafter");
});

import test from "node:test";
import assert from "node:assert/strict";
import { shouldSaveBeforeDocumentChange } from "../src/utils/documentChange";

test("自动保存开启时文档变更前直接保存", () => {
  assert.equal(shouldSaveBeforeDocumentChange(
    { autoSave: true, saveOnFileSwitch: false },
    true,
    "C:/notes/a.md",
    true,
    false,
  ), true);
});

test("切换文件时遵循切换前保存设置", () => {
  assert.equal(shouldSaveBeforeDocumentChange(
    { autoSave: false, saveOnFileSwitch: true },
    true,
    "C:/notes/a.md",
    true,
    true,
  ), true);
  assert.equal(shouldSaveBeforeDocumentChange(
    { autoSave: false, saveOnFileSwitch: true },
    true,
    "C:/notes/a.md",
    true,
    false,
  ), false);
});

test("无本地路径或无修改时不执行静默保存", () => {
  assert.equal(shouldSaveBeforeDocumentChange(
    { autoSave: true, saveOnFileSwitch: true },
    true,
    "",
    true,
    true,
  ), false);
  assert.equal(shouldSaveBeforeDocumentChange(
    { autoSave: true, saveOnFileSwitch: true },
    false,
    "C:/notes/a.md",
    true,
    true,
  ), false);
});

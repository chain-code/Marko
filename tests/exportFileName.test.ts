import test from "node:test";
import assert from "node:assert/strict";
import { buildExportFileName } from "../src/utils/exportFileName";

test("buildExportFileName uses the current document name and requested format", () => {
  assert.equal(buildExportFileName("notes.md", "pdf"), "notes.pdf");
  assert.equal(buildExportFileName("C:/docs/report.markdown", "html"), "report.html");
});

test("buildExportFileName falls back for untitled documents", () => {
  assert.equal(buildExportFileName("", "epub"), "marko-export.epub");
});

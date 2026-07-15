import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("insertImageFile reuses the existing Tauri image asset copy flow", () => {
  assert.match(appSource, /const path = await pickImageFile\(\);/);
  assert.match(appSource, /handleImageFilePath\(path, editorRef\.value\?\.reserveImageInsertion\(\) \?\? undefined\)/);
});

test("insertImageFile reuses the browser image data insertion flow", () => {
  assert.match(appSource, /const file = await openBrowserImageFile\(\);/);
  assert.match(appSource, /file,\s*placeholder: editorRef\.value\?\.reserveImageInsertion\(\)/);
  assert.match(appSource, /await handleImageData\(\{/);
});

test("image insertion applies Typora-style copy location and URL preferences", () => {
  assert.match(appSource, /settings\.value\.imageInsertAction === "none"/);
  assert.match(appSource, /\? payload\.dataUrl\s*: await saveImageAsset/);
  assert.match(appSource, /copyImageFileAsset\(targetFilePath \|\| null, path, settings\.value\.imageInsertAction\)/);
  assert.match(appSource, /formatInsertedImageSource\([\s\S]*settings\.value\.addDotSlashToRelativeImagePath/);
});

test("asynchronous image work stays bound to a placeholder and blocks document changes", () => {
  assert.match(appSource, /replaceImagePlaceholder\(placeholder, src, payload\.name\)/);
  assert.match(appSource, /pendingImageOperations \+= 1/);
  assert.match(appSource, /function blockForPendingImages\(\)/);
  assert.match(appSource, /if \(blockForPendingImages\(\)(?: \|\| blockForPathMutation\(\))?\) return false;/);
});

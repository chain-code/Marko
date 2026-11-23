import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const appSource = readFileSync(resolve("src/App.vue"), "utf8");

test("insertImageFile saves first and reserves all Tauri media placeholders in order", () => {
  assert.match(appSource, /const paths = await pickImageFile\(\);/);
  assert.match(appSource, /if \(paths\.length === 0 \|\| !await ensureSavedDocumentForMedia\(\)\) return;/);
  assert.match(appSource, /await handleMediaFilePaths\(paths\.map/);
  assert.match(
    appSource,
    /async function handleMediaFilePaths\([\s\S]*?const requests = media\.map[\s\S]*?reserveImageInsertion\(\)[\s\S]*?for \(const request of requests\) \{[\s\S]*?await handleMediaFilePath/,
  );
});

test("insertImageFile reserves all browser image placeholders before reading in selection order", () => {
  assert.match(appSource, /const files = await openBrowserImageFile\(\);/);
  assert.match(appSource, /await handleMediaFiles\(files, "image"\);/);
  assert.match(
    appSource,
    /async function handleMediaFiles\(files: File\[\][\s\S]*?reserveImageInsertion\(\)[\s\S]*?for \(const request of requests\) \{[\s\S]*?await handleImageData\(\{/,
  );
});

test("image insertion applies Typora-style copy location and URL preferences", () => {
  assert.match(appSource, /settings\.value\.imageInsertAction === "none"/);
  assert.match(appSource, /\? payload\.dataUrl\s*: await saveImageAsset/);
  assert.match(appSource, /copyImageFileAsset\(targetFilePath \|\| null, path, settings\.value\.imageInsertAction\)/);
  assert.match(appSource, /copyMediaFileAsset\(targetFilePath \|\| null, path, settings\.value\.imageInsertAction\)/);
  assert.match(appSource, /formatInsertedImageSource\([\s\S]*settings\.value\.addDotSlashToRelativeImagePath/);
});

test("asynchronous image work stays bound to a placeholder and blocks document changes", () => {
  assert.match(appSource, /replaceMediaPlaceholder\(placeholder, markup\)/);
  assert.match(appSource, /pendingImageOperations \+= 1/);
  assert.match(appSource, /function blockForPendingImages\(\)/);
  assert.match(appSource, /if \(blockForPendingImages\(\)(?: \|\| blockForPathMutation\(\))?\) return false;/);
});

test("untitled media insertions share one save-as operation", () => {
  assert.match(appSource, /let mediaDocumentSaveInFlight: Promise<boolean> \| null = null/);
  assert.match(
    appSource,
    /async function ensureSavedDocumentForMedia\([\s\S]*?if \(!mediaDocumentSaveInFlight\)[\s\S]*?mediaDocumentSaveInFlight = saveAsFile\(\)/,
  );
  assert.match(appSource, /async function handleDroppedPaths\(drop: NativeFileDrop\)/);
  assert.match(appSource, /setCursorAtCoordinates\(position\.x, position\.y\)/);
});

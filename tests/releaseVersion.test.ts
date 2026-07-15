import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const expectedVersion = "1.1.0";
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const packageLock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8"));
const cargoManifest = readFileSync(resolve("src-tauri/Cargo.toml"), "utf8");
const cargoLock = readFileSync(resolve("src-tauri/Cargo.lock"), "utf8");
const aboutDialog = readFileSync(resolve("src/components/AboutDialog.vue"), "utf8");

test("发布版本在应用和构建清单中保持一致", () => {
  assert.equal(packageJson.version, expectedVersion);
  assert.equal(packageLock.version, expectedVersion);
  assert.equal(packageLock.packages[""].version, expectedVersion);
  assert.equal(tauriConfig.version, expectedVersion);
  assert.match(cargoManifest, /name = "marko-desktop"[\s\S]*?version = "1\.1\.0"/);
  assert.match(cargoLock, /name = "marko-desktop"[\s\S]*?version = "1\.1\.0"/);
  assert.match(aboutDialog, /版本 1\.1\.0/);
});

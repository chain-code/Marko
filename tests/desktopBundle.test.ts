import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const tauriConfig = JSON.parse(readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8"));
const windowsConfig = JSON.parse(readFileSync(resolve("src-tauri/tauri.windows.conf.json"), "utf8"));
const macosConfig = JSON.parse(readFileSync(resolve("src-tauri/tauri.macos.conf.json"), "utf8"));
const defaultCapability = JSON.parse(readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));

test("desktop bundle selects native package formats for Windows and macOS", () => {
  assert.deepEqual(windowsConfig.bundle.targets, ["nsis"]);
  assert.deepEqual(macosConfig.bundle.targets, ["app", "dmg"]);
  assert.equal(macosConfig.bundle.macOS.minimumSystemVersion, "11.0");
  assert.equal(
    packageJson.scripts["pack:mac-arm"],
    "node scripts/run-tauri.mjs build --bundles app,dmg --target aarch64-apple-darwin",
  );
});

test("desktop bundles include the project license", () => {
  assert.deepEqual(tauriConfig.bundle.resources, { "../LICENSE": "LICENSE" });
  assert.match(readFileSync(resolve("LICENSE"), "utf8"), /MIT License/);
});

test("Windows bundle registers Marko as a Markdown editor", () => {
  const associations = tauriConfig.bundle.fileAssociations;
  assert.ok(Array.isArray(associations));
  const markdownAssociation = associations.find((item: { mimeType?: string }) => item.mimeType === "text/markdown");
  assert.ok(markdownAssociation);
  assert.deepEqual(markdownAssociation.ext, [
    "md",
    "markdown",
    "mdown",
    "mkd",
    "mkdn",
    "mdwn",
    "mdtxt",
    "mdtext",
    "rmd",
  ]);
  assert.equal(markdownAssociation.role, "Editor");
});

test("Windows bundle icon assets include crisp small icon sizes", () => {
  assert.deepEqual(tauriConfig.bundle.icon, [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.icns",
    "icons/icon.ico",
  ]);
  assert.equal(tauriConfig.bundle.windows.nsis.installerIcon, "icons/icon.ico");
  assert.equal(tauriConfig.bundle.windows.nsis.uninstallerIcon, "icons/icon.ico");

  assert.deepEqual(readPngSize(resolve("src-tauri/icons/32x32.png")), { width: 32, height: 32 });
  assert.deepEqual(readPngSize(resolve("src-tauri/icons/128x128.png")), { width: 128, height: 128 });
  assert.deepEqual(readPngSize(resolve("src-tauri/icons/128x128@2x.png")), { width: 256, height: 256 });
  assert.deepEqual(readIcoSizes(resolve("src-tauri/icons/icon.ico")), [16, 24, 32, 48, 64, 128, 256]);
  assertIcnsFile(resolve("src-tauri/icons/icon.icns"));
});


test("Tauri build script watches desktop icon assets for resource rebuilds", () => {
  const buildScript = readFileSync(resolve("src-tauri/build.rs"), "utf8");
  for (const iconPath of tauriConfig.bundle.icon) {
    assert.match(buildScript, new RegExp(`cargo:rerun-if-changed=${escapeRegExp(iconPath)}`));
  }
  assert.match(buildScript, /cargo:rerun-if-changed=icons\/icon\.svg/);
});

test("desktop window permissions allow confirmed close and native fullscreen", () => {
  assert.ok(defaultCapability.permissions.includes("core:window:allow-destroy"));
  assert.ok(defaultCapability.permissions.includes("core:window:allow-set-fullscreen"));
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function readPngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("ascii", 1, 4), "PNG");
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readIcoSizes(path: string): number[] {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt16LE(0), 0);
  assert.equal(bytes.readUInt16LE(2), 1);
  const count = bytes.readUInt16LE(4);
  const sizes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = bytes[offset] === 0 ? 256 : bytes[offset];
    const height = bytes[offset + 1] === 0 ? 256 : bytes[offset + 1];
    assert.equal(width, height);
    assert.equal(bytes.readUInt16LE(offset + 6), 32);
    sizes.push(width);
  }
  return sizes.sort((left, right) => left - right);
}

function assertIcnsFile(path: string): void {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString("ascii", 0, 4), "icns");
  assert.equal(bytes.readUInt32BE(4), bytes.length);
}

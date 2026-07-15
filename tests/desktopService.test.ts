import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopSource = readFileSync(resolve("src/services/desktop.ts"), "utf8");
const tauriSource = readFileSync(resolve("src-tauri/src/main.rs"), "utf8");
const appSource = readFileSync(resolve("src/App.vue"), "utf8");
const cargoSource = readFileSync(resolve("src-tauri/Cargo.toml"), "utf8");
const tauriConfigSource = readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8");

test("desktop service exposes the reveal file in folder command", () => {
  assert.match(desktopSource, /export async function revealFileInFolder\(path: string\): Promise<void>/);
  assert.match(desktopSource, /invoke\("reveal_file_in_folder", \{ path \}\)/);
  assert.match(tauriSource, /fn reveal_file_in_folder\(path: String\) -> Result<\(\), String>/);
  assert.match(tauriSource, /reveal_file_in_folder,/);
});

test("desktop service exposes the open containing folder command", () => {
  assert.match(desktopSource, /export async function openContainingFolder\(path: string\): Promise<void>/);
  assert.match(desktopSource, /invoke\("open_containing_folder", \{ path \}\)/);
  assert.match(tauriSource, /fn open_containing_folder\(path: String\) -> Result<\(\), String>/);
  assert.match(tauriSource, /open_containing_folder,/);
});

test("desktop service exposes opening a selected folder path", () => {
  assert.match(desktopSource, /export async function openFolderPath\(path: string\): Promise<void>/);
  assert.match(desktopSource, /invoke\("open_folder_path", \{ path \}\)/);
  assert.match(tauriSource, /fn open_folder_path\(path: String\) -> Result<\(\), String>/);
  assert.match(tauriSource, /open_folder_path,/);
  assert.match(tauriSource, /fn build_open_folder_command\(path: &Path\) -> Result<RevealFileCommand, String>/);
});

test("desktop service exposes moving a file or folder to the system trash", () => {
  assert.match(desktopSource, /export async function trashPath\(path: string\): Promise<void>/);
  assert.match(desktopSource, /invoke\("trash_path", \{ path \}\)/);
  assert.match(tauriSource, /fn trash_path\(path: String\) -> Result<\(\), String>/);
  assert.match(tauriSource, /trash_path,/);
  assert.match(tauriSource, /fn build_trash_path_command\(path: &Path\) -> Result<RevealFileCommand, String>/);
});

test("desktop service exposes the rename markdown file command", () => {
  assert.match(desktopSource, /export async function renameMarkdownFile\(path: string, newName: string\): Promise<string>/);
  assert.match(desktopSource, /invoke<string>\("rename_markdown_file", \{ path, newName \}\)/);
  assert.match(tauriSource, /fn rename_markdown_file\(path: String, new_name: String\) -> Result<String, String>/);
  assert.match(tauriSource, /rename_markdown_file,/);
});

test("desktop service exposes creating a Markdown file in a workspace folder", () => {
  assert.match(desktopSource, /export async function createMarkdownFile\(folderPath: string, fileName: string\): Promise<string>/);
  assert.match(desktopSource, /invoke<string>\("create_markdown_file", \{ folderPath, fileName \}\)/);
  assert.match(tauriSource, /fn create_markdown_file\(folder_path: String, file_name: String\) -> Result<String, String>/);
  assert.match(tauriSource, /create_markdown_file,/);
});

test("desktop service exposes creating a folder in a workspace folder", () => {
  assert.match(desktopSource, /export async function createFolder\(parentPath: string, folderName: string\): Promise<string>/);
  assert.match(desktopSource, /invoke<string>\("create_folder", \{ parentPath, folderName \}\)/);
  assert.match(tauriSource, /fn create_folder\(parent_path: String, folder_name: String\) -> Result<String, String>/);
  assert.match(tauriSource, /create_folder,/);
});

test("desktop service exposes picking a local image file", () => {
  assert.match(desktopSource, /export async function pickImageFile\(\): Promise<string \| null>/);
  assert.match(desktopSource, /invoke<string \| null>\("pick_image_file"\)/);
  assert.match(desktopSource, /export function openBrowserImageFile\(\): Promise<File \| null>/);
  assert.match(tauriSource, /fn pick_image_file\(\) -> Result<Option<String>, String>/);
  assert.match(tauriSource, /pick_image_file,/);
});

test("desktop service exposes checking whether a path is a directory", () => {
  assert.match(desktopSource, /export async function isDirectoryPath\(path: string\): Promise<boolean>/);
  assert.match(desktopSource, /invoke<boolean>\("path_is_directory", \{ path \}\)/);
  assert.match(tauriSource, /fn path_is_directory\(path: String\) -> bool/);
  assert.match(tauriSource, /path_is_directory,/);
});

test("desktop service exposes the developer tools command", () => {
  assert.match(desktopSource, /export async function openDeveloperTools\(\): Promise<void>/);
  assert.match(desktopSource, /invoke\("open_devtools"\)/);
  assert.match(tauriSource, /fn open_devtools\(window: tauri::WebviewWindow\)/);
  assert.match(tauriSource, /window\.open_devtools\(\)/);
  assert.match(tauriSource, /open_devtools,/);
  assert.match(appSource, /case "openDevtools":[\s\S]*?openDeveloperTools\(\)/);
  assert.match(cargoSource, /features = \["protocol-asset", "devtools"\]/);
  assert.match(tauriConfigSource, /"devtools": true/);
});

test("desktop image commands support Typora-style target folders", () => {
  assert.match(desktopSource, /action: ImageInsertAction = "assets"/);
  assert.match(desktopSource, /invoke<string>\("save_data_url_asset", \{[\s\S]*?action,/);
  assert.match(desktopSource, /invoke<string>\("copy_image_file_asset", \{[\s\S]*?action,/);
  assert.match(tauriSource, /fn resolve_image_asset_dir\(current_path: Option<&Path>, action: &str\)/);
  assert.match(tauriSource, /"current" => parent\.to_path_buf\(\)/);
  assert.match(tauriSource, /"documentAssets" =>/);
  assert.match(tauriSource, /parent\.join\("assets"\)/);
});

test("desktop service opens Markdown files passed by the operating system", () => {
  assert.match(desktopSource, /export async function getStartupMarkdownFiles\(\): Promise<string\[]>/);
  assert.match(desktopSource, /startup_markdown_files/);
  assert.match(tauriSource, /fn startup_markdown_files\(\) -> Vec<String>/);
  assert.match(tauriSource, /std::env::args\(\)/);
  assert.match(tauriSource, /startup_markdown_files,/);
});

test("desktop export passes a document-aware default file name", () => {
  assert.match(desktopSource, /defaultFileName\?: string/);
  assert.match(desktopSource, /defaultFileName: defaultFileName \|\| null/);
  assert.match(tauriSource, /default_file_name: Option<String>/);
  assert.match(tauriSource, /normalize_export_file_name\(default_file_name, extension\)/);
});

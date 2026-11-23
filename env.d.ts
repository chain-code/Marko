/// <reference types="vite/client" />

declare module "markdown-it-footnote";
declare module "markdown-it-task-lists";
declare module "markdown-it-mark";
declare module "markdown-it-sub";
declare module "markdown-it-sup";
declare module "katex";
declare module "flowchart.js";
declare module "markdown-it-emoji/lib/data/full.mjs" {
  const definitions: Readonly<Record<string, string>>;
  export default definitions;
}

interface Window {
  __TAURI_INTERNALS__?: unknown;
}

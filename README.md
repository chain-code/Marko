<p align="center">
  <img src="./src-tauri/icons/128x128.png" width="96" height="96" alt="Marko application icon">
</p>

<h1 align="center">Marko</h1>

<p align="center">
  <strong>A modern, local-first Markdown editor built for uninterrupted writing.</strong>
</p>

<p align="center">
  Write in one continuous visual surface while keeping every document as portable, plain Markdown.
</p>

<p align="center">
  <strong>English</strong>
  ·
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/chain-code/Marko/releases/latest">
    <img src="https://img.shields.io/github/v/release/chain-code/Marko?sort=semver&style=flat-square" alt="Latest release">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/chain-code/Marko?style=flat-square" alt="MIT License">
  </a>
  <img src="https://img.shields.io/badge/tests-700%2B-16803c?style=flat-square" alt="700+ automated tests">
  <img src="https://img.shields.io/badge/Windows-10%2F11%20x64-2563eb?style=flat-square" alt="Windows 10 and 11 x64">
  <img src="https://img.shields.io/badge/macOS-11%2B%20ARM64-111827?style=flat-square" alt="macOS 11 or later on Apple Silicon">
</p>

<p align="center">
  <a href="https://github.com/chain-code/Marko/releases/latest"><strong>Download Marko 1.1.0</strong></a>
  ·
  <a href="#features">Features</a>
  ·
  <a href="#development">Build from source</a>
</p>

![Marko editing a Markdown document with a rendered Mermaid diagram](./.github/assets/marko-hero.webp)

Marko combines visual editing with the durability of plain Markdown. Formatting stays rendered while you read, and the source syntax appears where you are actively editing. Files, folders, search, tables, diagrams, math, images, and export tools live in one focused desktop workspace.

Available for Windows 10/11 x64 and Apple Silicon Macs running macOS 11 or later.

## Why Marko?

- **Stay in the document** - Write in one continuous editing surface instead of switching between source and preview panes.
- **Keep control of your files** - Work with ordinary local Markdown files, folders, search, autosave, and draft recovery.
- **Edit rich content directly** - Edit rendered tables, inspect diagrams, write MathJax math, and manage images without leaving the document.
- **Build a focused workspace** - Use the file tree, outline, quick open, focus mode, typewriter mode, and document statistics while writing.

## Diagram Viewer

Large architecture, process, and sequence diagrams quickly outgrow a document column. Marko renders Mermaid, Flowchart, and Sequence blocks inline, then lets you **double-click any rendered diagram to open a dedicated full-window viewer**.

![Double-clicking and zooming a Mermaid diagram in Marko](./.github/assets/marko-diagram-viewer.gif)

The viewer is designed for real technical documents:

- Zoom in, zoom out, or reset from the floating toolbar.
- Use `Ctrl + wheel` for continuous zoom.
- Use `+`, `-`, and `0` from the keyboard.
- Inspect diagrams from 40% to 300% without changing the Markdown source.
- Press `Esc` to return to the document immediately.

### A workflow Typora does not provide

| Diagram interaction | Marko | Typora 1.13.7 |
| --- | --- | --- |
| Inline Mermaid, Flowchart, and Sequence rendering | Yes | Yes |
| Double-click full-window diagram viewer | **Built in** | Not available |
| Dedicated zoom and reset toolbar | **Built in** | Not available |
| Viewer-specific `Ctrl + wheel` zoom | **Built in** | Not available |
| Keyboard zoom and instant `Esc` close | **Built in** | Not available |

The comparison above refers to the default desktop behavior observed in Typora 1.13.7. Marko is an independent project and is not affiliated with Typora.

## Download

Download installers, checksums, and release notes from [GitHub Releases](https://github.com/chain-code/Marko/releases/latest).

| Platform | Requirements | Release package |
| --- | --- | --- |
| Windows x64 | Windows 10 or 11 | NSIS `.exe` installer |
| macOS ARM64 | macOS 11+ on Apple Silicon | `.dmg` or `.app.zip` |

SHA-256 checksum files are published alongside the installation packages.

> [!NOTE]
> Current macOS builds are unsigned and support Apple Silicon only. On first launch, macOS may require confirmation in **System Settings > Privacy & Security**.

## Features

| Area | What Marko provides |
| --- | --- |
| Continuous visual editing | Rendered inactive content, source at the active position, cross-block selection, unified undo, and an optional full source mode |
| Markdown | Headings, quotes, links, task and definition lists, footnotes, YAML Front Matter, `[TOC]`, GitHub-style callouts, and raw HTML |
| Technical content | Syntax-highlighted code, MathJax math, Mermaid, Flowchart, Sequence diagrams, superscript, subscript, highlights, and automatic links |
| Visual tables | Direct cell editing, row and column operations, alignment, matrix paste, and `Tab` / `Shift+Tab` navigation |
| Images | Relative-path preview, drag and paste, width controls, local save strategies, upload endpoints, and a double-click large viewer |
| Files and workspaces | File tree and list views, outline, quick open, recent files, workspace search, local links, and document anchors |
| Focus and safety | Focus mode, typewriter mode, native full screen, zoom, spell checking, autosave, draft recovery, and unsaved-change confirmation |
| Statistics and export | Word and character counts, reading time, cursor and selection statistics, printing, and Pandoc-based export |

Pandoc export supports PDF, HTML, DOCX, RTF, and EPUB. It requires a local [Pandoc](https://pandoc.org/) installation; PDF export also needs a Pandoc-compatible PDF engine, commonly a LaTeX environment.

<details>
<summary><strong>Common keyboard shortcuts</strong></summary>

`Ctrl` corresponds to `Command` on macOS.

| Action | Shortcut |
| --- | --- |
| New / Open / Save | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| Save as | `Ctrl+Shift+S` |
| Quick open | `Ctrl+P` |
| Find / Replace | `Ctrl+F` / `Ctrl+H` |
| Search workspace | `Ctrl+Shift+F` |
| Source mode | `Ctrl+/` |
| Toggle sidebar | `Ctrl+Shift+L` |
| Focus / Typewriter mode | `F8` / `F9` |
| Native full screen | `F11` |
| Print | `Shift+Alt+P` |

</details>

## Development

<details>
<summary><strong>Requirements, local development, testing, and packaging</strong></summary>

### Requirements

Frontend development requires Node.js 20, 22, or 24+ and npm 10 or a compatible version.

Desktop development additionally requires Rust stable and a working `cargo` command.

Windows builds require the `x86_64-pc-windows-msvc` Rust target, Visual Studio 2022 Build Tools with the **Desktop development with C++** workload, a Windows 10/11 SDK, and Microsoft Edge WebView2 Evergreen Runtime.

Apple Silicon macOS builds require macOS 11+, Xcode Command Line Tools, and the `aarch64-apple-darwin` Rust target.

### Run locally

```bash
npm ci
npm run tauri:dev
```

`tauri:dev` starts Vite automatically and opens the desktop application.

For browser-only interface and Markdown interaction development:

```bash
npm run dev
```

Then open `http://127.0.0.1:1420`. Native filesystem, window, and desktop export features require Tauri desktop mode.

### Test

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run verify
```

The project contains more than 700 automated tests across editor logic, Markdown behavior, Vue components, desktop Rust code, and regression scenarios.

### Build

```bash
# Frontend assets
npm run build

# Desktop app for the current platform
npm run tauri:build

# Windows x64 NSIS installer
npm run pack:win

# Apple Silicon app and DMG (run on macOS)
rustup target add aarch64-apple-darwin
npm run pack:mac-arm
```

Installer output paths:

- Windows: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe`
- macOS: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/*.dmg` and `bundle/macos/*.app`

macOS packages must be built on macOS. Public distribution requires Apple Developer ID signing and notarization; local development builds do not.

</details>

<details>
<summary><strong>Technology stack</strong></summary>

- Vue 3, TypeScript, and Vite
- CodeMirror 6 and markdown-it
- highlight.js and MathJax
- Mermaid, flowchart.js, and @hackmd/js-sequence-diagrams
- Tauri 2 and Rust
- Node.js Test Runner, Vitest, Vue Test Utils, and vue-tsc

</details>

## Contributing

Issues and pull requests are welcome. When reporting a problem, include the Marko version, operating system, a minimal Markdown example, clear reproduction steps, and a screenshot or short recording when the behavior is visual.

Before submitting a pull request, run:

```bash
npm run verify
```

Please keep changes focused and add regression coverage for behavior changes. Planned and deferred work is tracked in the [roadmap](./TODO.md).

If Marko improves your writing workflow, consider starring the repository. It helps more Markdown users discover the project.

## License

Marko is available under the [MIT License](./LICENSE).

Copyright (c) 2026 chain-code.

# Marko

Marko 是基于 Vue 3、CodeMirror 6 与 Tauri 2 构建的 Markdown 桌面编辑器。项目以 Typora 1.13.7 的常用交互和布局为兼容基线，提供现代化界面、连续编辑体验与本地文件工作流。

当前支持 Windows 10/11 x64 和 Apple Silicon macOS 11+，分别提供 NSIS 与原生 `.app`/DMG 打包脚本。

## 核心特性

### 连续编辑体验

- 使用单一 CodeMirror 6 文档状态，支持跨段选择、跨块退格、统一撤销与 3 秒输入合并窗口。
- 非活动内容保持渲染状态，光标进入后显示 Markdown 源码；标题、正文、列表、表格等块间距按 Typora 的语义间距处理。
- 支持源码模式、专注模式、打字机模式、原生全屏、缩放、拼写检查和可配置行宽、字号。
- 支持查找替换、自动配对、智能标点、Emoji 补全、列表延续、Tab/Shift+Tab 缩进及常用格式快捷键。

### Markdown 与扩展语法

- 标题、段落、引用、无序/有序/任务列表、定义列表、缩写定义、链接、引用链接、图片和原始 HTML。
- 代码高亮、代码行号与换行设置、表格、脚注、YAML Front Matter、`[TOC]`、GitHub 风格 Callout。
- KaTeX 数学公式、高亮、上标、下标、自动链接及单换行保留选项。
- Mermaid 与 Flowchart 图表渲染；单击可展开或编辑源码，双击可打开大图查看器并进行缩放。
- 图片支持本地相对路径预览、宽度设置、拖拽/粘贴、双击大图查看，以及多种本地保存策略和上传接口配置。

### 表格与列表

- 可视化表格直接编辑，支持新增、删除、移动和选择行列，以及列对齐设置。
- 支持矩阵粘贴、Tab/Shift+Tab 单元格导航，并可在最后一个单元格继续追加行。
- 支持无序、有序、任务列表切换，任务状态可直接勾选。

### 文件与工作区

- 新建、打开、保存、另存为、重命名、移入回收站，以及 Markdown 文件关联启动。
- 文件树/文件列表切换、当前文档大纲、快速打开、最近文件、工作区全文搜索和当前文件定位。
- 文件切换时保存并恢复各自的选区和滚动位置；本地链接与文档锚点可直接导航。
- 未保存文档提供“保存/不保存/取消”确认；支持草稿恢复、切换文件前保存和可配置定时自动保存，默认间隔为 3 分钟。
- 支持自动/LF/CRLF 换行符和文件末尾换行设置。

### 统计与导出

- 提供字数、字符数、段落数、阅读时间、光标位置和选区统计。
- 支持打印；桌面端可通过 Pandoc 导出 PDF、HTML、DOCX、RTF 和 EPUB。

## 环境要求

前端调试需要：

- Node.js 20、22 或 24+，建议使用当前 LTS 版本。
- npm 10 或兼容版本。

Windows 桌面开发还需要：

- Rust stable 与 `x86_64-pc-windows-msvc` 工具链。
- Visual Studio 2022 Build Tools，安装“使用 C++ 的桌面开发”工作负载和 Windows 10/11 SDK。
- Microsoft Edge WebView2 Evergreen Runtime；Windows 10/11 通常已预装。
- `cargo` 可在终端中直接执行。

Apple Silicon macOS 桌面开发还需要：

- macOS 11 Big Sur 或更高版本。
- Xcode Command Line Tools，可通过 `xcode-select --install` 安装。
- Rust stable 与 `aarch64-apple-darwin` 工具链目标。
- `cargo` 可在终端中直接执行。

## 快速开始

安装锁定依赖：

```bash
npm ci
```

仅启动浏览器前端调试：

```bash
npm run dev
```

访问：

```text
http://127.0.0.1:1420
```

浏览器模式适合界面和 Markdown 交互调试；原生文件系统、窗口和桌面导出能力需要使用完整桌面模式：

```bash
npm run tauri:dev
```

`tauri:dev` 会自动启动 Vite，无需先单独运行 `npm run dev`。

## 常用快捷键

下表中的 `Ctrl` 在 macOS 上对应 `Command`。

| 操作 | 快捷键 |
| --- | --- |
| 新建 / 打开 / 保存 | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| 另存为 | `Ctrl+Shift+S` |
| 快速打开 | `Ctrl+P` |
| 查找 / 替换 | `Ctrl+F` / `Ctrl+H` |
| 工作区全文搜索 | `Ctrl+Shift+F` |
| 源码模式 | `Ctrl+/` |
| 显示或隐藏侧边栏 | `Ctrl+Shift+L` |
| 专注模式 / 打字机模式 | `F8` / `F9` |
| 打印 | `Shift+Alt+P` |

## 测试与验证

运行全部前端逻辑、类型和组件测试：

```bash
npm test
```

分项运行：

```bash
npm run test:logic
npm run test:types
npm run test:components
```

运行 Rust 测试：

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

运行完整校验，包括前端测试、Rust 测试和生产构建：

```bash
npm run verify
```

## 构建与打包

仅构建前端资源到 `dist/`：

```bash
npm run build
```

构建 Tauri 桌面应用：

```bash
npm run tauri:build
```

构建 Windows x64 NSIS 安装包：

```bash
npm run pack:win
```

Windows x64 安装包输出目录：

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
```

安装包文件名包含当前版本号，首次打包时 Tauri 可能需要联网下载 NSIS 相关工具。

在 Apple Silicon Mac 上构建 ARM64 `.app` 和 DMG：

```bash
rustup target add aarch64-apple-darwin
npm run pack:mac-arm
```

macOS ARM64 产物输出目录：

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/macos/
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/
```

macOS 产物必须在 macOS 上构建；Windows 缺少 Apple SDK 和 DMG 工具。公开分发还需要 Apple Developer ID 签名与公证，本地开发构建不需要。

## 技术栈

- Vue 3、TypeScript、Vite。
- CodeMirror 6、markdown-it、highlight.js、KaTeX。
- Mermaid、flowchart.js。
- Tauri 2、Rust。
- Node.js Test Runner、Vitest、Vue Test Utils、vue-tsc。

## 项目结构

```text
src/                 Vue 应用、组件、服务与编辑器逻辑
src/components/      编辑器、侧栏、工具栏、预览和对话框
src/utils/           Markdown 解析、编辑命令、文件与状态工具
src-tauri/           Tauri 配置、Rust 后端与桌面资源
tests/               逻辑和源码回归测试
component-tests/     Vue 组件测试
scripts/             测试与 Tauri 启动脚本
```

## 可选外部依赖

桌面端 PDF、HTML、DOCX、RTF 和 EPUB 导出均需要本机安装 [Pandoc](https://pandoc.org/)。PDF 导出还需要 Pandoc 可用的 PDF 引擎，通常是 LaTeX 环境；缺少依赖时应用会显示对应错误。

已确认暂不实现或仍待处理的 Typora 差异见 [TODO.md](./TODO.md)。

## 许可证

本项目采用 [MIT License](./LICENSE)，版权所有 (c) 2026 chain-code。

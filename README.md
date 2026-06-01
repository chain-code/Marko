# Marko

Marko 是一个基于 Vue 3 + Tauri 2 的 Markdown 桌面编辑器首版原型，目标是模拟 Typora 的单栏实时预览体验，并参考 SoloLog 的 `.md` 文档展示样式。

## 已实现能力

- 单栏块级编辑：当前块显示 Markdown 源码，失焦后恢复渲染预览。
- Markdown 渲染：标题、列表、任务列表、引用、链接、图片、代码高亮、表格、脚注、YAML Front Matter、`[TOC]`、GitHub 风格 Callout。
- 扩展语法：Mermaid、Flowchart、流程图点击放大查看、Emoji 补全、高亮、上标、下标、HTML 片段。
- 编辑辅助：撤销、重做、复制、剪切、快捷键、拼写检查、自动配对、Tab/Shift+Tab 缩进、列表延续。
- 表格与列表：插入表格、添加行列、调整对齐、切换列表和任务状态。
- 图片能力：拖拽/粘贴图片，本地 assets 保存，上传接口配置，本地相对路径预览。
- 文件导航：新建、打开、保存、另存为、打开文件夹、文件树、快速打开、当前文档大纲、全局搜索、最近文件。
- 视图与统计：源码模式、专注模式、打字机模式、全屏、缩放、字数/字符/段落/阅读时间/选区统计。
- 导出：打印、PDF/Word/RTF/EPUB Pandoc 导出入口。

## 开发

```bash
npm install
npm run dev
```

开发地址：

```text
http://127.0.0.1:1420
```

## 桌面调试

```bash
npm run tauri:dev
```

## 构建

```bash
npm run build
```

## Windows 安装包

```bash
npm run pack:win
```

产物路径：

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Marko_0.1.0_x64-setup.exe
```

## 外部依赖

Pandoc 导出 Word、RTF、EPUB、PDF 时需要本机安装 Pandoc。PDF 导出还可能需要 LaTeX 环境；如果没有安装，应用会提示具体错误。

# Marko

Marko 是一个基于 Vue 3 + Tauri 2 的 Markdown 桌面编辑器，交互与布局以 Typora 1.13.7 为基准，并使用更现代、克制的视觉设计。

## 已实现能力

- 连续文档编辑：基于 CodeMirror 6 的单一编辑状态，支持跨段选择、跨块退格与统一撤销，并在非活动内容上显示实时预览。
- Markdown 渲染：标题、列表、任务列表、引用、链接、图片、代码高亮、表格、数学公式、脚注、YAML Front Matter、`[TOC]`、GitHub 风格 Callout。
- 扩展语法：Mermaid、Flowchart、流程图点击放大查看、Emoji 补全、高亮、上标、下标、HTML 片段。
- 编辑辅助：撤销、重做、复制、剪切、查找替换、快捷键、拼写检查、自动配对、Tab/Shift+Tab 缩进、列表延续。
- 表格与列表：插入表格、添加行列、调整对齐、切换列表和任务状态。
- 图片能力：拖拽/粘贴图片，本地 assets 保存，上传接口配置，本地相对路径预览。
- 文件导航：新建、打开、保存、另存为、打开文件夹、文件树、快速打开、当前文档大纲、侧栏搜索、最近文件；切换文件时恢复各自的选区和滚动位置。
- 桌面布局：原生窗口标题栏、菜单式顶栏、文件/大纲/搜索三模式侧栏、编辑区顶部非模态查找栏和底部状态栏。
- 视图与统计：源码模式、专注模式、打字机模式、原生全屏、缩放、拼写检查、字数/字符/段落/阅读时间/选区统计。
- 文件安全：三态未保存确认（保存、不保存、取消）、3 分钟自动保存间隔和应用内重命名、删除确认对话框。
- 导出：打印、PDF/HTML/Word/RTF/EPUB Pandoc 导出入口。

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

# 端到端测试

用 Playwright 驱动 Electron 应用（docs/architecture.md 1.13 节）。阶段 1 搭起来，阶段 5、6 补全。

## 待办：从源码断言测试迁过来的交互要求

这些要求现在由读取 `App.vue`、组件源码、用正则断言代码写法的测试守着（2026-11-23 统计，共 65 条）。旧测试在阶段 7 之前保留；新代码按下表写成交互测试或端到端测试（菜单相关的写成 `main/menu.ts` 菜单模板的单元测试），不再读源码文本。

| 功能 | 要保证的事（原来的测试名） | 来源 |
|---|---|---|
| R-5 | 面向用户的产品文案保持独立的 Marko 品牌表达 | `tests/brandCopy.test.ts` |
| E-6 | 连续编辑器显式使用 Typora 风格的三秒撤销合并窗口 | `tests/continuousEditor.test.ts` |
| F-15、M-2 | native file drops keep their logical insertion coordinates | `tests/desktopService.test.ts` |
| 通用规则 6、C-1、B-6 | Continuous editor wires the custom context menu to existing editor commands | `tests/editorContextMenu.test.ts` |
| L-1 | Continuous editor configures the active CodeMirror content for spellcheck | `tests/editorLanguage.test.ts` |
| N-1 | App find panel lets Escape close from any focused control | `tests/findReplace.test.ts` |
| M-2、M-3 | insertImageFile saves first and reserves all Tauri media placeholders in order | `tests/imageFileInsert.test.ts` |
| M-2、M-3 | insertImageFile reserves all browser image placeholders before reading in selection order | `tests/imageFileInsert.test.ts` |
| M-2、M-3 | image insertion applies Typora-style copy location and URL preferences | `tests/imageFileInsert.test.ts` |
| M-2、M-3 | asynchronous image work stays bound to a placeholder and blocks document changes | `tests/imageFileInsert.test.ts` |
| M-2、M-3 | untitled media insertions share one save-as operation | `tests/imageFileInsert.test.ts` |
| F-15、W-1 | native dropped folders are loaded as the workspace folder | `tests/nativeDropFolder.test.ts` |
| F-15、W-1 | findDroppedFolderPath asks the desktop backend before treating a path as a folder | `tests/nativeDropFolder.test.ts` |
| F-15、W-1 | native dropped markdown files can seed the workspace from their parent folder | `tests/nativeDropFolder.test.ts` |
| F-4 | App quick open wires keyboard selection to the active result | `tests/quickOpen.test.ts` |
| F-4 | App quick open restores editor focus when the panel closes | `tests/quickOpen.test.ts` |
| F-3、F-5 | App removes stale recent-file entries when opening them fails | `tests/recentOpenFailure.test.ts` |
| W-4、W-5 | App sidebar search results jump to the selected match without clearing search state | `tests/searchResultNavigation.test.ts` |
| W-4、W-5 | App outline clicks jump the selected heading into view | `tests/searchResultNavigation.test.ts` |
| S-1、S-3、S-5 | SettingsPanel closes with Escape like a desktop preferences dialog | `tests/settingsPanel.test.ts` |
| S-1、S-3、S-5 | App restores editor focus after closing settings | `tests/settingsPanel.test.ts` |
| S-1、S-3、S-5 | SettingsPanel follows Typora preference categories and exposes working options | `tests/settingsPanel.test.ts` |
| S-1、S-3、S-5 | SettingsPanel exposes independent Markdown and code indentation controls | `tests/settingsPanel.test.ts` |
| S-1、S-3、S-5 | App wires automatic saving and save formatting into document navigation | `tests/settingsPanel.test.ts` |
| W-2、W-6 | AppSidebar exposes a method for scrolling the current file into view | `tests/sidebarCurrentFile.test.ts` |
| W-2、W-6 | FileTreeNode marks the current file row for sidebar locating | `tests/sidebarCurrentFile.test.ts` |
| W-2、W-6 | sidebar file rows expose Typora-style context menu actions | `tests/sidebarCurrentFile.test.ts` |
| W-2、W-3、W-7 | View menu switches Typora-style file tree, file list, and outline panels | `tests/sidebarFileModes.test.ts` |
| W-2、W-3、W-7 | AppSidebar file tab renders tree or list and switches them from the bottom toolbar | `tests/sidebarFileModes.test.ts` |
| W-2、W-3、W-7 | Locate current file always returns to the file tree view | `tests/sidebarFileModes.test.ts` |
| W-5、W-7 | AppSidebar exposes Typora-style file, outline, and search tabs | `tests/sidebarSearch.test.ts` |
| W-5、W-7 | sidebar search is controlled and exposes submit and result selection events | `tests/sidebarSearch.test.ts` |
| W-5、W-7 | global search opens and stays in the sidebar instead of using a modal overlay | `tests/sidebarSearch.test.ts` |
| 通用规则 6（菜单） | AppToolbar displays Typora Windows file shortcuts | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar lists recent files directly inside Open Recent | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | Paragraph menu displays Typora heading shortcuts without an extra submenu | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | Paragraph menu keeps Typora block and table shortcuts in their native group | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes the Typora-style open link command | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes the Typora-style copy file path command | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes the Typora-style rename file command | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes locating the current file in the sidebar tree | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes inserting a local image file | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes opening the current file folder as workspace | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes closing the current workspace folder | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes refreshing the current workspace folder | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes the Typora-style reveal file command | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes the Typora-style open containing folder command | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes the Typora-style spelling toggle | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes the Typora-style status bar toggle | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar exposes the Typora-style image width command | `tests/toolbarMenu.test.ts` |
| 通用规则 6（菜单） | AppToolbar renders second-level menu panels like Typora | `tests/toolbarSubmenus.test.ts` |
| 通用规则 6（菜单） | File menu keeps recent files and export actions inside submenus | `tests/toolbarSubmenus.test.ts` |
| 通用规则 6（菜单） | Typora-compatible menus keep only genuine nested groups in submenus | `tests/toolbarSubmenus.test.ts` |
| 通用规则 6（菜单） | Top-level menus scroll while submenus stay outside the scroll clipping area | `tests/toolbarSubmenus.test.ts` |
| E-2 | normal Markdown blocks remain rendered while they are edited inline | `tests/typoraSeamlessEditing.test.ts` |
| C-1、S-5、I-5、B-6 | editor preferences control default copy, indentation, emoji and code language behavior | `tests/typoraSeamlessEditing.test.ts` |
| T-2、T-3、T-5 | tables remain tables and expose direct cell and row-column controls | `tests/typoraSeamlessEditing.test.ts` |
| E-2、N-4 | links and images reveal Markdown source before navigation like Typora | `tests/typoraSeamlessEditing.test.ts` |
| N-4 | special rendered blocks use modifier navigation for local anchors | `tests/typoraSeamlessEditing.test.ts` |
| V-3、V-4 | Status bar exposes Typora-style word count entry points | `tests/typoraUi.test.ts` |
| E-11、W-7 | source mode temporarily hides the sidebar and restores the stored sidebar preference | `tests/typoraUi.test.ts` |
| W-1 | closing the workspace folder clears workspace-scoped UI state | `tests/workspaceFolderState.test.ts` |
| F-6、F-7、O-1 | saving refreshes the current workspace file tree when the file belongs to it | `tests/workspaceSave.test.ts` |
| F-6、F-7、O-1 | save as prefers the current workspace when the document has no folder yet | `tests/workspaceSave.test.ts` |
| F-6、F-7、O-1 | exports use the current document file name as the default output name | `tests/workspaceSave.test.ts` |

## 待办：配置和发布检查

这些测试检查 Tauri 的配置、Rust 命令、版本号和 README（共 30 条）。阶段 1 换成 Electron 后按新的配置重写：打包格式和文件关联查 electron-builder 配置，接口查 `shared` 里的 schema 和主进程的注册（1.9 节），版本号查 `package.json` 和关于窗口。

| 功能 | 要保证的事（原来的测试名） | 来源 |
|---|---|---|
| R-1、R-2、F-14 | desktop bundle selects native package formats for Windows and macOS | `tests/desktopBundle.test.ts` |
| R-1、R-2、F-14 | desktop bundles include the project license | `tests/desktopBundle.test.ts` |
| R-1、R-2、F-14 | Windows bundle registers Marko as a Markdown editor | `tests/desktopBundle.test.ts` |
| R-1、R-2、F-14 | Windows bundle icon assets include crisp small icon sizes | `tests/desktopBundle.test.ts` |
| R-1、R-2、F-14 | Tauri build script watches desktop icon assets for resource rebuilds | `tests/desktopBundle.test.ts` |
| R-1、R-2、F-14 | desktop window permissions allow confirmed close and native fullscreen | `tests/desktopBundle.test.ts` |
| 1.9 节 | desktop service exposes the reveal file in folder command | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes the open containing folder command | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes opening a selected folder path | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes moving a file or folder to the system trash | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes the rename markdown file command | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes creating a Markdown file in a workspace folder | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes creating a folder in a workspace folder | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes picking multiple local image files | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes checking whether a path is a directory | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service exposes the developer tools command | `tests/desktopService.test.ts` |
| 1.9 节 | desktop media commands support Typora-style target folders | `tests/desktopService.test.ts` |
| 1.9 节 | desktop service opens Markdown files passed by the operating system | `tests/desktopService.test.ts` |
| 1.9 节 | desktop export passes a document-aware default file name | `tests/desktopService.test.ts` |
| 阶段 7（README） | 中英文 README 提供互相切换的语言链接 | `tests/readmeShowcase.test.ts` |
| 阶段 7（README） | 中英文 README 均指向最新 GitHub Release | `tests/readmeShowcase.test.ts` |
| 阶段 7（README） | 中英文 README 均引用主界面与图表查看演示资源 | `tests/readmeShowcase.test.ts` |
| 阶段 7（README） | 中英文 README 单独介绍图表大图查看器 | `tests/readmeShowcase.test.ts` |
| R-5（版本号一致） | 发布版本在应用和构建清单中保持一致 | `tests/releaseVersion.test.ts` |
| D-4（阶段 3 图表沙箱的构建） | Sequence grammar 浏览器转换移除 Node CLI 尾部并导出解析器 | `tests/sequenceGrammarBrowser.test.ts` |
| D-4（阶段 3 图表沙箱的构建） | Sequence grammar 依赖结构变化时立即阻止静默构建 | `tests/sequenceGrammarBrowser.test.ts` |
| D-4（阶段 3 图表沙箱的构建） | Sequence Raphael 绘制器使用模块内词法依赖 | `tests/sequenceGrammarBrowser.test.ts` |
| D-4（阶段 3 图表沙箱的构建） | Sequence Raphael 绘制器依赖结构变化时立即阻止静默构建 | `tests/sequenceGrammarBrowser.test.ts` |
| A-2、X-2（字体随包） | 锁定 Open Sans v17 字体文件 | `tests/typoraFont.test.ts` |
| A-2、X-2（字体随包） | 入口统一加载 Open Sans v17 字体 | `tests/typoraFont.test.ts` |

## 不迁移的

| 功能 | 原来的测试 | 不迁移的原因 |
|---|---|---|
| B-13 | Alert 类型从工具栏 payload 传递到两种编辑器命令路径（`tests/alertCommands.test.ts`） | 新架构只有一条编辑器命令路径；插入哪种 Callout 已由行为规格 B-13 覆盖 |
| D-4 | toolbar and both editor command paths expose sequence insertion（`tests/sequenceDiagram.test.ts`） | 新架构只有一条编辑器命令路径；插入 Sequence 已由行为规格 D-4 覆盖 |
| 通用规则 6 | AppToolbar keeps a Typora-style menu-only top bar（`tests/typoraUi.test.ts`） | 重构后用系统原生菜单，不再有页面里的菜单栏 |
| — | Continuous editor uses one CodeMirror document instead of framed block editors（`tests/typoraUi.test.ts`） | 编辑器内核换成 ProseMirror（0.4 第 2 条） |
| M-6 | stores CodeMirror document references for image double click caching（`component-tests/ContinuousMarkdownEditorReadonlyWidgets.test.ts`） | 测的是旧编辑器的缓存细节；要求（只读时双击图片也能看大图）写进 M-6 的交互测试 |
| — | applies Typora-like spacing at the outer block boundary（`component-tests/LegacyBlockSpacing.test.ts`） | BlockEditor 已不再使用，阶段 7 删除 |
| — | lets the outer block own spacing without duplicate child padding（`component-tests/LegacyBlockSpacing.test.ts`） | BlockEditor 已不再使用，阶段 7 删除 |
| — | keeps source inputs aligned with their rendered block content（`component-tests/LegacyBlockSpacing.test.ts`） | BlockEditor 已不再使用，阶段 7 删除 |

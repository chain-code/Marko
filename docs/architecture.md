# 架构

本文件定义 Marko **怎么做**：技术栈、进程和分层、包与模块、文档模型、数据归属、接口、安全、目录和测试，以及每个功能落在哪些模块（第 3 章）。Marko **做什么**以 [features.md](features.md) 为准（功能编号如 `E-3` 都指它）。2026-11 从 Tauri 换到 Electron、编辑器内核换成 ProseMirror 的经过见 [重构计划.md](重构计划.md)。

使用规则：

1. 改动分层、数据归属、接口、目录时，**先改本文件**再改代码；代码和本文件不一致时以本文件为准：要么改代码，要么先改本文件。
2. 新功能先在 features.md 编号，再在本文件第 3 章落位到模块，然后才写代码。第 1 章没有位置的模块不建文件。
3. 只写现在的做法：不记改动的历史（经过见重构计划.md）。
4. 章节号沿用拆开前的重构计划.md：本文件是第 1 章（架构）和第 3 章（功能编号 → 模块），第 2 章是 features.md，「0.x 节」「4.x 节」「阶段 N」在重构计划.md。代码注释里「1.10 节」这样的引用都指本文件。

---

## 1 架构

### 1.0 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 桌面壳 | Electron 稳定版 | 版本锁定；升级大版本前跑全部测试。所有平台同一个 Chromium |
| 语言 | TypeScript（strict），ESM | 全仓库同一套 `tsconfig` 基础配置 |
| 仓库 | npm workspaces | `packages/*` 和 `apps/desktop`；包名 `@marko/*`；依赖版本锁定（`package-lock.json`）。用 npm：别人用 git 依赖安装编辑器库时不需要另装工具（K-1） |
| 结构解析 | `@lezer/markdown`（锁定精确版本） | 唯一的结构解析器（1.5 节）。GFM（表格、任务列表、删除线、自动链接）、上标、下标、Emoji 用它自带的扩展；只为它没有的写扩展：公式块和行内公式、脚注、`==高亮==`；HTML 块换成按 CommonMark 判断结束条件的同名解析器（它自带的在引用里结束不了）；目录、Callout、定义列表、缩写、Front Matter 在建文档模型时按行认（`yamlFrontmatter` 是 CodeMirror 的语言包装，接不进 Lezer 的解析器，源码模式的高亮再用它）。建模型要知道每行的容器前缀到哪里，用到它的两个内部字段（`Line.depth`、`skipContextMarkup`），所以版本锁定，升级时跑全部测试 |
| 编辑器框架 | Tiptap 3：`@tiptap/core`、`@tiptap/pm`（ProseMirror）；不用 `@tiptap/vue-3`（`editor-vue` 自己建编辑器，挂在 `#write` 上） | 扩展机制、命令、输入规则、快捷键、撤销、gapcursor、dropcursor 用它的。节点（schema）按 1.5.2 节自己定义；不用它的 StarterKit 和 Markdown 扩展（会改写格式，不是无损的） |
| 表格 | `@tiptap/extension-table`（基于 prosemirror-tables） | 增删行列、单元格选区用它的；单元格的内容是行内原文（1.5.2 节） |
| 查找替换 | `prosemirror-search`（编辑区）、`@codemirror/search`（源码模式） | 区分大小写、全词、正则、替换都是现成的 |
| 补全 | `@tiptap/suggestion` | emoji 补全的触发、候选、键盘选择（I-5） |
| 代码编辑 | CodeMirror 6、`@codemirror/language-data`（各语言的语法，有的语言来自它带的 legacy-modes）、`@codemirror/lang-yaml`（Front Matter） | 代码块、公式块、HTML 块、Front Matter 的 NodeView；源码模式。和编辑器库共用一份（npm workspaces 提升到根目录） |
| 静态高亮 | `@lezer/highlight` 的 `highlightCode` | 导出、打印、复制为 HTML；和编辑时同一套分词 |
| 公式 | MathJax 4（`@mathjax/src`、字体 `@mathjax/mathjax-newcm-font`，两个锁定同一精确版本） | 渲染成 SVG，按源码缓存；含 mhchem、physics；不常用字符的字体按需加载（D-1） |
| 图表 | Mermaid 11、flowchart.js、`@hackmd/js-sequence-diagrams` | 在隔离的沙箱页里运行，只输出 SVG（1.7 节）。后两个依赖 Raphael，只进沙箱；js-sequence-diagrams 直接用它的解析器和 `RaphaelDrawer`，不用它的 jQuery 插件，不装 jQuery；打包时要经 `@marko/render/vite` 的插件转换（1.3 节） |
| HTML 过滤 | DOMPurify | 只在 `render` 包一处调用 |
| HTML 转 Markdown | 〔待确认〕自己写的转换（`commands/paste.ts`：DOM 遍历，没有 DOM 时按正则） | 粘贴网页、Word 内容（C-3）。Turndown + `@joplin/turndown-plugin-gfm` 的默认规则和 C 章 60 多条按 Typora 定的规格（表格的合并单元格展开、代码围栏加长、`<br>`、内联样式转粗体斜体、转义）对不上，改到全过要重写大部分规则，所以用自己的转换（规格全过）。要不要换成 Turndown 由用户定 |
| 其他数据 | `emojibase-data`（GitHub 的 shortcode，I-5）、`yaml`（读 Front Matter，M-1）、`entities`（解码 HTML 实体）、`fzf`（快速打开的模糊匹配，F-4） | 锚点 id 和 GitHub 的规则不一样（B-2），按 Typora 的源码写，不用 `github-slugger` |
| 应用界面 | Vue 3 + Vite + Element Plus；图标用 `@element-plus/icons-vue` | 对话框、提示、树、下拉、表单、分割面板、图片查看器都用 Element Plus 的组件（1.3 节逐个列出），不自己写；不用 vue-router；状态放在 composables 里（每个窗口一套），不引入状态库 |
| 国际化 | vue-i18n；Element Plus 自带的语言包 | 编辑器包里的文字由宿主传入（K-2） |
| Electron 工程 | electron-vite | 主进程、预加载脚本、渲染进程的构建和开发时热更新 |
| 主进程工具 | `electron-store`（设置、最近文件、导出记录）、`electron-window-state`（窗口位置和大小）、`electron-context-menu`（原生右键菜单和拼写建议）、`write-file-atomic`（原子写入） | 1.8 节 |
| 文件监听 | `@parcel/watcher`（工作区，递归）；打开的文件用 Node 的 `fs.watch` 盯它所在的目录（不递归，F-12） | 主进程 |
| 全局搜索 | ripgrep（`@vscode/ripgrep` 随安装包） | 主进程；打包时从 asar 里解出来 |
| 编码识别 | jschardet + iconv-lite | 主进程（F-18） |
| 导出 | `webContents.printToPDF`、`print`；导出图片用 `webContents.capturePage`；Pandoc（用户自己安装） | O 章 |
| 拼写检查 | Electron 内置：Windows、Linux 用 Hunspell 词典，macOS 用系统拼写 | L-1 |
| 打包和更新 | electron-builder、electron-updater | R 章 |
| 测试 | Vitest、@vue/test-utils、Playwright（Chromium；Electron 应用用 `_electron`）、`fast-check`（随机编辑测试） | 1.13 节 |
| 依赖检查 | dependency-cruiser | 1.4 节的规则写成检查，`npm run check` 里跑 |

### 1.1 总则

1. **Markdown 文件是唯一的持久化格式。** 打开、不改、保存逐字节不变；改一处只影响那一块（E-1）。
2. **一件事只有一个来源。** 一个解析器（Lezer）、一套高亮（Lezer）、一份主题 CSS、一条渲染管线；编辑、导出、打印、复制为 HTML 都用它们。
3. **屏幕上显示的就是 Markdown 的真实含义。** 任何时刻 `parse(serialize(doc))` 都和 `doc` 结构相同（1.5.5）。
4. **依赖只朝一个方向**（1.4 节），用包边界和 dependency-cruiser 检查，循环依赖是错误。
5. **每类数据只有一个主人**（1.8 节）。文件、设置、最近文件、草稿都归主进程；渲染进程只通过预加载脚本暴露的 `window.marko` 读写。
6. **不信任文档内容**（1.10 节）。文档里的 HTML、图表、链接都按不可信内容处理；渲染进程拿不到 Node；涉及路径的接口都检查范围。
7. **编辑器不依赖桌面。** 编辑器包只通过 `EditorHost` 接口获取资源地址、打开链接、保存图片、渲染图表，可以单独在浏览器里用（K 章）。
8. **第 2 章的每个编号都能在第 3 章找到归属模块**；找不到的，要么补文档，要么不写代码。

### 1.2 进程模型

| 进程 | 做什么 | 能用什么 |
|---|---|---|
| 主进程（`apps/desktop/main`） | 窗口、原生菜单和右键菜单、文件读写和监听、工作区、全局搜索、图片和媒体、导出、拼写检查、设置和草稿的持久化、单实例和系统打开文件、自动更新 | Node、Electron 主进程 API |
| 预加载脚本（`apps/desktop/preload`） | 用 `contextBridge.exposeInMainWorld` 暴露 `window.marko`（1.9 节），不暴露 `ipcRenderer` 本身 | `contextBridge`、`ipcRenderer`、`webUtils`（由 File 取拖进来、粘贴的文件的路径） |
| 渲染进程（每个窗口一个） | 应用界面（Vue）和编辑器 | 浏览器 API 和 `window.marko`；`contextIsolation`、`sandbox` 打开，`nodeIntegration` 关闭 |
| 图表沙箱（每个窗口里一个隐藏的 iframe） | 运行 Mermaid、flowchart.js、js-sequence-diagrams，把源码变成 SVG | 只有握手时父页面交来的一个 `MessagePort`（1.10 节）。带 `sandbox="allow-scripts"`、不带 `allow-same-origin`，源是不透明的：读不到父页面，没有 `window.marko`，CSP 禁止联网 |
| 导出页（按需创建的隐藏窗口） | 加载要导出的自包含 HTML，供 `printToPDF`、`print` 使用；导出图片时主进程调 `capturePage` 截图；交给 Pandoc 的图表也在这样的窗口里截成图片（O-4） | 只有 HTML、CSS；没有预加载脚本，CSP 不允许脚本（截图表的窗口连脚本都关掉） |

### 1.3 包与模块

| 包 | 职责 | 运行在哪 |
|---|---|---|
| `@marko/shared` | 主进程和渲染进程共用的类型和 zod schema：`window.marko` 接口、事件、设置、快捷键表、最近文件、草稿 | 两边 |
| `@marko/markdown` | Lezer 扩展；语法树 → 文档模型；无损序列化；编辑后的重新解析；行内片段；语义层（大纲、锚点、脚注编号、引用解析、缩写、字数）。纯 TS，不碰 DOM | 渲染进程；Node 里的测试 |
| `@marko/render` | 文档模型 → HTML；HTML 过滤；公式 → SVG；静态代码高亮；图表渲染的接口和沙箱页；自包含导出文件 | 渲染进程 |
| `@marko/editor` | 编辑器（Tiptap 的扩展）：节点、文档 ↔ 状态、插件、命令、输入规则、快捷键、NodeView、源码模式、剪贴板；`EditorHost` 接口。Tiptap 只用到 `@tiptap/core` 这一层（加上表格、补全等扩展），不依赖 Vue | 渲染进程；可单独在浏览器里用 |
| `@marko/editor-vue` | 编辑器的 Vue 包装 `<MarkoEditor>`（对外叫 `MarkoMarkdownBody`，K-1）：自己建编辑器挂在 `#write` 上；浮在编辑区上的界面（代码语言、表格工具条……）、小窗口、查看器都用 Element Plus 的组件 | 渲染进程；对外发布（K 章） |
| `@marko/themes` | 排版基础、编辑时才有的样式、内置主题（纯 CSS）；应用界面的颜色用 Element Plus 的 CSS 变量 | 渲染进程、导出页 |
| `apps/desktop` | Electron 应用：`main/`、`preload/`、`renderer/` | — |

`packages/markdown/src/`：

```
├── index.ts               对外导出
├── syntax/                Lezer 的扩展和按行认的语法
│   ├── math.ts            行内 $…$ 和 \(…\)、公式块 $$…$$（可带 {标签}）和 \[…\]（I-3、B-7）；解析前扫一遍，有结尾围栏才开公式块
│   ├── footnote.ts        脚注引用和定义（B-11）
│   ├── highlight.ts       ==高亮==（I-4；上标、下标用 Lezer 自带的）
│   ├── html.ts            HTML 块：替换 Lezer 自带的同名解析器，按容器前缀之后的内容判断结束（B-12）
│   ├── blocks.ts          按行认的：目录（B-10）、Callout（B-13）、定义列表（B-14）、缩写定义（B-16）、Front Matter（B-9）
│   ├── emphasis.ts        替换 Lezer 自带的两个：强调（中日韩文字旁边的规则同 Typora，I-1）、Emoji（shortcode 可带 + -，I-5）
│   ├── table.ts           GFM 表格：照 Lezer 自带的改了一处——CRLF 换行的文件里也认得出分隔行（T 章）
│   └── index.ts           按 S-8 的开关组合：Lezer 自带的 GFM、Superscript、Subscript，加上本目录的扩展；记录每行在各层容器里的内容起点
├── lines.ts               行表、换行符统计、列宽（制表符按 4 列）
├── model.ts               文档模型的节点类型和写法属性（1.5.2）；出身（1.5.4）
├── parse.ts               源码 → 语法树 → 文档模型；每个块登记出身（1.5.1）
├── serialize.ts           文档模型 → 源码：没改过的块原样输出（1.5.4）
├── reconcile.ts           编辑后对受影响的块重新解析，结构变了给出替换（1.5.5）
├── inline.ts              文本块原文 → 行内片段（类型、标记位置、内容范围），装饰和渲染共用（1.5.3）
├── positions.ts           文档位置 ↔ 源码偏移、行列（1.5.6）
└── semantics/
    ├── outline.ts         标题、锚点 id、大纲（B-2、W-4、B-10）
    ├── footnotes.ts       脚注编号、回链、缺失的定义、摘要（B-11）
    ├── references.ts      链接引用定义的解析（B-15）
    ├── abbreviations.ts   缩写的定义和出现位置（B-16）
    ├── frontMatter.ts     用 yaml 读 Front Matter 里的 typora-root-url（M-1）
    ├── stats.ts           字数、字符、段落、阅读时间（V-4）
    ├── text.ts            文本块显示出来的文字（去标记、解转义和实体）
    ├── labels.ts          标签的规范化（引用定义、脚注共用）
    └── walk.ts            遍历块
```

`packages/render/src/`：

```
├── index.ts               对外导出
├── html.ts                文档模型 → HTML；结构和类名照 Typora 导出的 HTML，同编辑区（1.11 节）；导出、打印、复制为 HTML 共用
├── escape.ts              转义；链接、图片地址的协议白名单
├── sanitize.ts            DOMPurify 配置；全仓库唯一的 HTML 过滤入口（X-1）
├── diagramStyle.ts        图表 SVG 自带的 <style> 只许作用于这张图：只认沙箱起的 id，规则都在 #id 下，动画名加前缀（1.10 节）
├── math.ts                MathJax：源码 → SVG，按源码和设置缓存；编号和交叉引用按文档顺序统一处理（D-1、D-2）；导出时附上它的样式表
├── mathFonts.ts           MathJax 按需加载的 40 个字体文件，每个一个动态 import（D-1）
├── random.ts              随机串：占位的 nonce、图表请求 id、沙箱实例的前缀
├── highlight.ts           静态代码高亮：Lezer 的语法 + CodeMirror 5 的类名（cm-*，同 Typora）；这张表编辑时的 CodeMirror 也用（B-6、O-1、A-3）
├── emoji.ts               :shortcode: → emoji，用 emojibase 的 GitHub 表（I-5）
├── alertIcons.ts          Callout 标题前的图标，Octicons 里的 5 个 SVG（B-13）
├── diagrams.ts            图表渲染接口：类型 + 源码 + 主题 → SVG；结果再过滤一遍、按源码缓存（D-3、D-4）
├── sandbox/sandbox.ts     图表沙箱页的脚本（apps/desktop/renderer/sandbox.html 加载它）：三种图表库的调用、深色配色
└── exportDocument.ts      自包含 HTML：内嵌主题 CSS、预渲染的公式和图表；图片引用或内嵌（O-1）
```

`packages/render/vite/sequenceDiagrams.ts`（`@marko/render/vite`）：打包沙箱页要用的 Vite 插件，把 js-sequence-diagrams 里跑不了的两处（jison 生成的 CommonJS 结尾、全局变量 `Raphael`）转成 ESM；库的结构变了就让构建失败。

`packages/editor/src/`：

```
├── index.ts               createMarkoEditor()（Tiptap 的 Editor 装上本包的扩展）、setMarkdown / getMarkdown、setSettings、setSyntax
├── host.ts                EditorHost 接口和浏览器里的默认实现（K-2）
├── settings.ts            编辑器用到的设置（S 章里和编辑有关的）
├── keyBindings.ts         编辑器自己处理的命令快捷键的默认表，宿主在设置里改（S-12）
├── texts.ts               编辑器自己的文字：插进文档的占位（表头、链接文本……）和提示，宿主按界面语言给（K-2、L-2）
├── nodes/                 节点（schema）：名字、写法属性同 markdown 的文档模型（1.5.2）；表格用 @tiptap/extension-table 的节点
├── state.ts               文档模型 ↔ ProseMirror 文档；选区 ↔ 源码偏移
├── source.ts              按源码改动：readSource（整篇源码和选区）、applySource（只重新解析改到的块）、placeSelection（选区换回去，空行上放光标占位段落）
├── keymap.ts              回车、退格、删除、方向键（E-5、E-2 按原文一个字一个字走、进出代码块）
├── commands/              按源码改动的命令（第 2 章的大部分编辑行为按源码定义）
│   ├── run.ts             命令接到编辑器上；单元格选区上逐格执行（T-5）
│   ├── enter.ts、backspace.ts、raw.ts、lists.ts、text.ts、context.ts  回车、退格、代码类块的边界、列表序号（新写）
│   ├── inlineStyle.ts、blocks.ts、input.ts、lines.ts、format.ts、tables.ts、paste.ts  「文本 + 选区」形式的命令（结构从文档树取，inlineLayout.ts）
│   ├── tab.ts             Tab、Shift+Tab、缩进、反缩进（E-5、B-4）
│   ├── cells.ts           单元格里的输入、Shift+回车、粘贴表格数据（T-2、T-6）
│   └── extension.ts       菜单命令、快捷键、输入时的处理（E-4、E-9、B-6 默认语言）
├── plugins/
│   ├── reconcile.ts       每次事务后调 markdown 的 reconcile（1.5.5）；输入法组合期间记下改动、结束后补；事务上的 meta 在 meta.ts
│   ├── historyOrigins.ts  撤销、重做以后把出身按位置抄回来，原文逐字节回到原样（E-6、1.5.4）
│   ├── commandKeys.ts     按 keyBindings.ts 绑命令的快捷键（S-12）
│   ├── textInput.ts       直接输入的收尾：读回的选区停在刚插的字前面时（Chromium 在空段落里偶尔这样）放到字后面（E 章）
│   ├── defer.ts           要按回车、空格才转换的写法先不转换（E-4）
│   ├── inlineSyntax.ts    行内片段的装饰：标记隐藏、展开、原子片段的渲染、行内 HTML、缩写、智能标点（E-2、I 章、E-10）
│   ├── blockWidgets.ts    任务的复选框、Callout 的标题、表格的对齐（B-5、B-13、T-4）
│   ├── focus.ts           光标所在的块（md-focus），专注模式和公式块等的进出靠它
│   ├── composition.ts     输入法上屏以后的处理（E-12）
│   ├── mathDocument.ts    公式编号、整篇范围的引用（D-2）
│   ├── placeholders.ts    插入图片：保存、上传期间的占位（M-2）
│   ├── viewModes.ts       专注模式、打字机模式（V-1、V-2），Ctrl+J、Ctrl+Shift+O（N-3、N-4）
│   └── lazy.ts            公式、图表进入视口才渲染（X-3）
├── reused/                现成扩展的配置，不自己实现
│   ├── search.ts          prosemirror-search：查找替换和高亮（N-1、N-2）；查找的条件和状态在 findTypes.ts（源码模式的 @codemirror/search 也用）
│   └── emoji.ts           @tiptap/suggestion + emojibase-data：emoji 补全（I-5）
├── nodeViews/             NodeView（不依赖 Vue；代码语言、表格工具条这些界面由 editor-vue 浮在编辑区上，1.3 节 editor-vue）
│   ├── codeMirror.ts      代码类块共用的 CodeMirror 6：和文档同步、撤销走编辑器的历史、方向键进出、查找高亮
│   ├── codeBlock.ts       代码块（B-6）、图表（D-3、D-4）
│   ├── rawBlocks.ts       公式块（B-7）、HTML 块（B-12）、Front Matter（B-9）
│   └── blocks.ts          目录（B-10）、脚注定义的标签和回链（B-11）
├── clipboard/             复制、剪切（copy.ts）、粘贴（C 章）；HTML 转 Markdown 在 commands/paste.ts（见 1.0 节）
└── sourceMode/           源码模式：整篇的 CodeMirror 6，改动马上按源码改动应用到文档上（E-11）
```

`packages/editor-vue/src/`：

```
├── index.ts               对外的组件、类型（引用方式同 1.x 的库：import { MarkoMarkdownBody } from "marko"，K-1）
├── library.ts             库的入口（根目录 vite.library.config.ts 从这里构建）：带上库的样式，登记默认的图表渲染
├── internal.ts            给应用（apps/desktop）用的：对外的设置换算成编辑器的设置；不在库的入口里
├── MarkoEditor.vue        对外组件：自己建编辑器（@marko/editor 的 createMarkoEditor，挂在 #write 上）；v-model、设置、事件、方法（K-1）；双击图片、图表打开查看器（D-5、M-6）
├── types.ts               对外的类型（和 1.x 的库相同）
├── defaults.ts            对外设置的默认值和补全
├── settings.ts            对外的设置 → 编辑器的设置、语法开关
├── texts.ts               组件里的文字（K-2、L-2）：宿主按界面语言给，没给的用中文
├── theme.ts               组件自己的浅色、深色主题（K-1 的 settings.theme）
├── diagrams.ts            宿主没给画图表的能力时的默认实现：库自带的沙箱页（D-3、D-4）
├── localLinks.ts          本地 Markdown 链接解析成路径，发 openLink（K-1）
├── style.css              库的样式：排版、编辑样式、默认的浅色主题
├── MediaViewer.vue        图片和图表的大图查看：ElImageViewer（缩放上下限、Esc 关闭是现成的）；图表先转成 SVG 的 blob 地址；只补 + - 0 三个键（D-5、M-6）
├── overlays/              浮在编辑区上的界面（跟着编辑器的事务、滚动刷新，按块的 DOM 算位置：editorState.ts）
│   ├── CodeLanguage.vue   光标在代码块里时右上角的语言，可以搜索、选最近用过的（B-6）
│   ├── TableToolbar.vue   光标在表格里时上方的工具条：对齐、插入删除行列（T-4、T-5）
│   ├── CalloutKind.vue    单击 Callout 的标题选种类（B-13）
│   ├── EmojiList.vue      Emoji 补全的候选列表；候选和键盘选择是 @tiptap/suggestion 的，emojiBridge.ts 换成响应式的状态（I-5）
│   └── HoverTip.vue       脚注引用、缩写的提示框（B-11、B-16）
└── dialogs/
    └── TableSizeDialog.vue  Ctrl+T 的插入表格小窗口（ElDialog + ElInputNumber，T-1）；图片宽度直接用 ElMessageBox.prompt（M-5）
```

`packages/themes/`：

```
├── base.css               #write 下的排版：块、行内、表格、代码、公式、图表；编辑区和导出共用
├── editor.css             只在编辑时有的：展开的标记、选中、NodeView 的边框、工具条；不进导出
├── ui.css                 覆盖 Element Plus 的 CSS 变量（--el-*），让界面配色跟主题；深色用 Element Plus 自带的暗色变量
├── fonts/                 Open Sans（内置主题的正文字体，随包，Apache 2.0）
└── themes/
    ├── solo.css           SoloLog 浅色（A-1）
    └── dark.css           深色（A-1）
```

`apps/desktop/`：

```
├── main/
│   ├── index.ts           入口：单实例锁、app 生命周期、系统打开文件（命令行、second-instance、macOS 的 open-file）、拼写检查的开关和语言（F-14、F-16、L-1）
│   ├── argv.ts            命令行、系统交过来的文件：相对路径、Linux 的 file:// 地址（F-14）
│   ├── windows.ts         窗口：一个窗口一个文档、同一文件切到已有窗口、置顶、全屏；位置和大小用 electron-window-state 记住；会话；退出时挨个窗口确认（F-1～F-3、F-10、F-16、F-17、V-6、V-7）
│   ├── zoom.ts            缩放（V-5）
│   ├── menu.ts            原生应用菜单；菜单项发 menu.command 事件给当前窗口；快捷键按 S-12 的设置
│   ├── contextMenu.ts     electron-context-menu 的配置：拼写建议、加入词典是它现成的，再加上渲染进程给出的菜单项（L-1、W-6）
│   ├── ipc.ts             注册 1.9 节的接口：zod 校验参数、路径过 scope、统一错误
│   ├── scope.ts           路径白名单（1.10 节）
│   ├── protocol.ts        app://（应用页面）、marko-asset://（本地媒体）、marko-theme://（用户主题）；CSP 响应头
│   ├── permissions.ts     网页权限：默认拒绝，只放行视频全屏和应用页面写剪贴板（1.10 节）
│   ├── links.ts           交给系统浏览器的地址（N-4）
│   ├── files.ts           读写文档：编码（jschardet、iconv-lite）、BOM、换行符、原子写入（write-file-atomic）、冲突检测（E-1、F-6、F-7、F-18）
│   ├── watch.ts           监听打开的文件（F-12）
│   ├── workspace.ts       文件树、文件列表，监听工作区（W 章）
│   ├── fileOps.ts         新建、重命名、拖进来的东西分类（W-6、F-13、F-15）
│   ├── search.ts          全局搜索：调 ripgrep，结果分批推送（W-5）
│   ├── media.ts           插入的图片、视频、音频复制到哪里，文件名，写进 Markdown 的地址（M-2、M-3、M-7）
│   ├── upload.ts          图片上传（M-4）
│   ├── export.ts          导出页、printToPDF、打印、长图（capturePage）、图表截成图片、调 Pandoc、导入（O 章、F-19）
│   ├── imports.ts         导入的文档里的图片：保存时复制到文档旁边（F-19）
│   ├── drafts.ts          草稿（F-9）
│   ├── themes.ts          内置和自定义主题的列表；监听主题目录；导出用的用户主题 CSS（A 章）
│   ├── i18n.ts            主进程的文字：菜单、对话框（L-2）
│   ├── store.ts           设置、最近文件、导出记录、会话用 electron-store；上传 Token 用 safeStorage 加密（1.8 节）
│   └── updater.ts         自动更新（R-4）
├── preload/
│   └── index.ts           暴露 window.marko
├── renderer/
│   ├── index.html         应用页面（app://marko/index.html）
│   ├── main.ts            创建 Vue 应用，不随主题变的样式
│   ├── App.vue            布局和组装；菜单命令分发
│   ├── host.ts            EditorHost 的桌面实现（调 window.marko）
│   ├── appearance.ts      主题、深浅色、给编辑器的设置（A 章）
│   ├── exporting.ts       导出、打印的 HTML（O 章）；inlineFonts.ts 嵌入内置字体（O-1）；pandocDiagrams.ts 交给 Pandoc 前图表换成图片（O-4）
│   ├── diagrams.ts、sandbox.ts、sandbox.html   图表沙箱（D-3、D-4）
│   ├── quickOpen.ts       快速打开的模糊匹配（fzf）（F-4）
│   ├── selectionStats.ts  选区的字数（V-3、V-4）
│   ├── shortcuts.ts       快捷键的显示、录入，给编辑器的按键（S-12）
│   ├── paths.ts           路径计算（沙箱里没有 node:path）
│   ├── i18n.ts、editorTexts.ts、elementLocale.ts   界面语言（L-2、K-2）
│   ├── composables/
│   │   ├── useDocument.ts     文档会话：打开、保存、冲突、外部修改、草稿、关闭确认、本地链接（F 章、N-4）
│   │   ├── useWorkspace.ts    工作区和侧栏数据（W 章）
│   │   ├── useFileActions.ts  文件操作（F-13、W-6）
│   │   ├── useDropOpen.ts     拖放打开（F-15）
│   │   ├── useSettings.ts     设置的读取和订阅（S 章）
│   │   └── useDialogs.ts      确认用 ChoiceDialog（ElDialog），提示用 ElMessage，状态栏的提示（F-10、F-12）
│   └── components/            都用 Element Plus 的组件拼，不自己写基础控件
│       ├── sidebar/           SideBar（ElTabs）；FileTree、FileList 用 ElTreeV2（虚拟滚动）；OutlineTree 用 ElTree；SearchPanel（W 章）
│       ├── settings/          SettingsDialog（ElDialog + ElForm，按 settingsForm.ts 的设置项表画）、ShortcutsPanel（S 章、S-12）
│       ├── StatusBar.vue      （V-3、F-12）
│       ├── FindBar.vue        ElInput、ElButton（N-1、N-2）
│       ├── QuickOpen.vue      ElDialog + ElInput + 列表（F-4）
│       ├── RecentFiles.vue    ElDialog（F-5）
│       ├── WordCountDialog.vue ElDialog + ElDescriptions（V-4）
│       ├── ChoiceDialog.vue   几个按钮的确认框（F-6、F-10、F-12）
│       ├── AboutDialog.vue    （R-5）
│       └── DropHint.vue       拖放时的提示（F-15）
│   └── testing/fakeApi.ts     单元测试用的假 window.marko
├── locales/               zh-CN.json、en.json（L-2）
├── build/                 安装包的图标；checksums.cjs 给每个安装包写 SHA-256 校验文件（R-1）
├── scripts/check-main-bundle.mjs  构建后检查主进程的产物里没有别的外部引用（R-1）
└── electron.vite.config.ts、electron-builder.yml、tsconfig.node.json、tsconfig.web.json、vitest.config.ts  构建、打包、类型检查、单元测试的配置
```

### 1.4 允许的依赖方向

```
 shared        markdown        themes（纯 CSS）
   ▲              ▲
   │       ┌──────┴──────┐
   │     render ◄──── editor
   │       ▲             ▲
   │       └── editor-vue┘
   │              ▲
   ├── preload    │
   ├── main       │
   └──────── renderer
```

| 从 | 可以引用 | 不可以引用 |
|---|---|---|
| `shared` | zod | 仓库里任何其他包 |
| `markdown` | `@lezer/common`、`@lezer/markdown`、`yaml`、`entities` | DOM、Node 内置模块、Vue、Electron、仓库里任何其他包 |
| `render` | `markdown`、DOMPurify、MathJax、`@lezer/highlight`、`@codemirror/language`、`@codemirror/language-data`、`emojibase-data`、`@primer/octicons`；沙箱页里另有 Mermaid、flowchart.js、`@hackmd/js-sequence-diagrams`、Raphael（只在沙箱里加载） | `editor`、Vue、Electron |
| `editor` | `markdown`、`render`、`@tiptap/core`、`@tiptap/pm`、`@tiptap/extension-table`、`@tiptap/suggestion`、`prosemirror-search`、CodeMirror 6 | Vue、Electron、`apps/*` |
| `editor-vue` | `editor`、`markdown`、`render`、`themes`、Vue、Element Plus（含 `@element-plus/icons-vue`）、`@codemirror/language-data`（代码语言的列表） | Electron、`apps/*` |
| `main` | `shared`、Electron、Node、`electron-store`、`electron-window-state`、`electron-context-menu`、`electron-updater`、`write-file-atomic`、`@parcel/watcher`、ripgrep、jschardet、iconv-lite、`@intlify/core-base`（主进程的文字）、postcss、`postcss-import`、`postcss-url`（导出时内嵌用户主题） | `markdown`、`render`、`editor`、渲染进程的代码 |
| `preload` | `shared`、Electron 的 `contextBridge`、`ipcRenderer` | 其他 |
| `renderer` | `shared`（只用类型和 schema）、`editor-vue`、`editor`、`render`、`markdown`、`themes`、Vue、vue-i18n、Element Plus、`fzf` | Node 模块；Electron（只能通过 `window.marko`） |

### 1.5 文档模型

#### 1.5.1 解析

- 用 `@lezer/markdown` 加 1.3 节的扩展解析整篇；编辑后只重新解析改动的范围（1.5.5）。解析前把单独的 `\r` 换成 `\n`（长度不变，CommonMark 也算换行），`\r\n` 不动；BOM 先拿掉，记在 `doc` 上。
- Lezer 的语法树给出块的结构；每行的容器前缀到哪里由解析时的记录给出（1.0 节），据此取出文本块的每行内容、代码块的每行代码。
- 每个块记下两样东西：
  - **出身**：这一块在文件里的原文、和前一个块之间的原文（空行、这一行的容器前缀）、每行的前缀，以及所在容器的规范前缀（1.5.4）；
  - **写法**：同一种语法的选择，如列表符号（`-`、`*`、`+`）、序号分隔符（`.`、`)`）、起始序号、松紧；强调字符（`*`、`_`）；围栏字符和长度、信息串；标题是 ATX 还是 Setext、ATX 结尾的 `#`；缩进宽度。写法是节点的属性，出身不是（见 1.5.4）。
- Lezer 和 Typora、CommonMark 不一致的地方，按 Typora 1.14.15 实测改：
  - Setext 下划线只有一个 `=`、`-` 时不是标题，是段落的续行；
  - 公式块要有结尾围栏才算，结尾可以在很后面（中间隔着空行、标题也算进去）；
  - 脚注定义能打断段落，连着写的几条定义各是各的；
  - 引用里的 `>` 空行结束第 6、7 种 HTML 块（Lezer 自带的解析器不对，换掉了）；
  - 链接文字里标签没有定义的 `[x]` 是普通文字（Lezer 不知道有哪些定义，行内片段里处理，1.5.3）。
  - 已知差异：Typora 认 10 位数以上的有序列表序号，CommonMark 和这里最多 9 位。

#### 1.5.2 节点

| 节点 | Markdown | 内容 | 写法属性 |
|---|---|---|---|
| `doc` | 整篇 | 块 | 换行符（改过的块用文件里最多的那种）、BOM；文件末尾的空行在出身里 |
| `paragraph` | 段落 | 行内原文 | 第一行的缩进 |
| `heading` | 标题 | 行内原文 | 级别、ATX / Setext、`#` 后的空白、结尾的 `#`、Setext 的下划线 |
| `blockquote` | `>` 引用 | 块 | —（每行的前缀在出身里） |
| `alert` | `> [!NOTE]` 等 | 块 | 种类、`[!NOTE]` 的原文 |
| `bulletList`、`orderedList` | 列表 | 列表项 | 符号 / 起始序号和分隔符、松紧 |
| `listItem` | 列表项 | 块 | 符号原文（序号不连续时照原样）、符号前的缩进和后面的空白、任务状态（无 / 未完成 / 已完成） |
| `codeBlock` | 围栏、缩进代码 | 纯文本 | 围栏字符和长度、信息串、是否缩进代码、缩进、结尾围栏这一行 |
| `diagram` | mermaid / flow / sequence 围栏 | 纯文本 | 同 `codeBlock`，加上种类 |
| `mathBlock` | `$$…$$`、`$$ {标签}`、`\[…\]` | 纯文本 | 开头、结尾围栏这一行 |
| `htmlBlock` | HTML 块 | 纯文本 | 是不是注释 |
| `frontMatter` | 开头的 `---` YAML | 纯文本 | 开头、结尾那一行（`---` 或 `...`） |
| `toc` | `[TOC]` 等 | 无 | 原文 |
| `table`、`tableRow`、`tableHeader`、`tableCell` | GFM 表格 | 单元格是行内原文（去掉两头空白） | 每列的对齐；分隔行、每行的原文和竖线写法在出身里 |
| `horizontalRule` | `---`、`***`、`___` | 无 | 原文 |
| `footnoteDefinition` | `[^id]: …` | 块 | 标签、冒号后的空白 |
| `referenceDefinition` | `[id]: 地址 "标题"` | 纯文本 | 缩进 |
| `abbreviationDefinition` | `*[HTML]: 全称` | 纯文本 | 缩进 |
| `definitionList`、`definitionTerm`、`definitionDescription` | 定义列表 | 行内原文 / 块 | 冒号前的缩进、冒号后的写法 |

- 图片、链接、脚注引用、行内公式、行内 HTML 都在行内原文里，不是节点。
- 列表项、引用、Callout、脚注定义、定义说明里没有块时（如 `-` 单独一行），放一个空段落，光标才有地方放。空段落（还有编辑器里回车后还没输入的段落）序列化时不输出，比较结构时也不算。

#### 1.5.3 行内原文

- 文本块的内容就是这一块的行内 Markdown 原文：`**粗体**` 在文档里就是这 6 个字符；软换行是 `\n`；引用、列表的前缀不在文字里。
- `markdown/inline.ts` 把原文切成片段（类型、标记位置、内容范围、嵌套关系）。编辑器按片段加装饰（1.6 节），渲染按同样的片段输出 HTML，两边对一段原文的理解永远一致。
- 引用式链接要看文档里有没有这个标签的定义（CommonMark）：切片段时传入「有没有定义」，没定义的 `[x]` 当普通文字，外层的方括号才能组成链接（如 `[API [v2]](地址)`）。
- DOM 里的文字就是源码，所以光标位置天然对应源码位置，点击、拖选不需要换算。

#### 1.5.4 序列化

- 块没被改过时，输出它的原始片段。
- 改过的块按写法属性重新生成；这一块里没改的行沿用原来的前缀和缩进（行数没变时改过的行也沿用）；新加的行用所在容器的规范前缀（引用 `> `、列表项按内容缩进的空格、脚注和定义说明 4 个空格）。
- 新建的块用默认写法：列表 `-`、强调 `*`、加粗 `**`、围栏 ```` ``` ````、分隔线 `---`、ATX 标题；块与块之间一个空行（紧凑列表的项里能不空行时不空行，免得列表变松散）。
- 表格按行重写：没改过的行照抄；改过的行按表头行的竖线写法、两边各一个空格生成；对齐和列数没变时分隔行照抄（T-7）。
- 出身不放进节点属性（ProseMirror 拆分、复制节点时会照抄属性，拆出来的两段就会都认成原来那块），而是按节点对象登记：
  - 没改过的节点在事务前后是同一个对象，照抄原文；
  - 改了内容的节点由编辑器在事务后沿用旧节点的出身（标成「内容可能变了」），据此保留块前的空行和没改的行的前缀；内容和写法又改回原样时仍照抄原文；
  - 前一个兄弟还是原来那个（按出身的编号认）时，才沿用块前的空行；
  - 换了容器的节点（如被拖进引用）不照抄，按新容器的前缀重新生成；
  - 已经在文档里的节点，出身对象不再改：旧文档、撤销记录还共用这些节点。对齐以后后面保留的那块要接上新的前一个兄弟时，换成一个内容相同的新节点（只换外壳，里面的位置照常映射）带新出身（`markdown/reconcile.ts` 的 `Replacement.next`、editor 的 `renewOrigin`）；
  - 撤销、重做时 ProseMirror 把步骤反着做，改动边上的块是重新拼出来的新对象。编辑器按撤销记录记下每个记录开始之前的文档（不可变、大部分节点共用，几乎不占地方），撤销、重做以后结构和它相同时把各节点的出身按位置抄过来，原文逐字节回到原样（E-6，`plugins/historyOrigins.ts`）。
- 原文里没有结尾围栏的代码块、公式块：还是容器里最后一块时照旧不写结尾；新建的、后面有了别的块的补上结尾。内容里有能闭合围栏的行时围栏自动加长。

#### 1.5.5 不变式

- `parse(serialize(doc))` 和 `doc` 结构相同（不算空段落；编辑器新建的节点上没指定的写法属性不算）。
- 每次事务后，`plugins/reconcile.ts` 把改动涉及的顶层块（连同前后各一个块）序列化再解析；结构不同时用解析结果替换其中真正变了的块（前后没变的块保留原来的节点），选区按源码偏移换回去。例：在段落下一行输入 `===`，段落变成一级标题；在列表项里输入使它不再是列表项的内容，块跟着变。
- 影响不止相邻块的情况，片段要放大（`markdown/reconcile.ts`）：片段最后一块变了（没闭合的围栏、HTML 注释吞掉了后面）时往后多带；文档开头变成 `---` 时整篇重新解析（看是不是 Front Matter）；公式块的配对是全局的（1.5.1），出现没配对的 `$$` 行而后面又有能配对的行、或靠很后面的结尾才成立的公式块进了片段时，放大到文档末尾或整篇。
- 输入法组合期间不做（E-12），组合结束后补做。
- 对齐只改结构，不改原文：保留下来的容器还要原文相同（解析可能把后面的行并进容器的结尾，如引用末尾补的一行 `>`），输入了内容的光标占位段落总是换成解析出来的段落。按源码改动（命令、源码模式的输入）应用完以后，文档的源码和要的源码对不上时整篇重新解析（不该发生；随机测试里只在改得很乱的文档上偶尔出现），写的字不丢。
- 调试构建里每次事务后检查一遍整篇；随机编辑的模糊测试检查同一条（1.13 节），另外检查对齐不改原文、一步步撤销和重做逐字节回到每一步前后的原文（`test/fuzz.test.ts`），以及随机按源码改动以后源码逐字节一致（`test/applySource.test.ts`）。

#### 1.5.6 位置换算

- `markdown/positions.ts` 在文档位置和源码偏移之间换算；源码模式切换（E-11）、查找（N-1）、外部修改的合并（F-12）、状态栏的行列（V-4）、跳到搜索结果的行（W-5）都用它。
- 序列化时记下每个叶子块（含表格单元格）每行内容在源码里的起点；文本块里的偏移按行换算，跨容器前缀、软换行都对得上。

### 1.6 编辑器

- **行内装饰**（E-2）：光标在片段里或紧挨着片段边界时，片段「展开」，标记显示出来；否则标记隐藏。原子片段（行内公式、emoji、脚注引用、行内 HTML、图片、实体）收起时用 Widget 装饰显示渲染结果，原文还在文字里。片段按文本块缓存，只在这个文本块变了时重新切；光标移动只更新新旧两处片段的装饰，不重算全文。
- **块级标记**（E-3）：不在文字里，由节点渲染：标题是 `h1`～`h6`，列表是 `ul` / `ol` / `li`，任务框是复选框，引用是 `blockquote`。
- **Tiptap**：每个节点、每个插件都是一个 Tiptap 扩展；命令、输入规则、快捷键用 Tiptap 的写法。NodeView 都在编辑器包里，不依赖 Vue；要界面的地方（代码块的语言、表格工具条、Callout 种类、Emoji 列表、脚注和缩写的提示）是 `editor-vue` 浮在编辑区上的组件（`overlays/`），跟着编辑器的事务、滚动刷新，按块的 DOM 算位置，组件里直接用 Element Plus。
- **NodeView**：
  - 代码块总是一个 CodeMirror 6 编辑器（同 Typora）；
  - 公式块、HTML 块、图表不在编辑时显示渲染结果，光标进入时显示 CodeMirror 源码，公式和图表在下面实时预览；
  - Front Matter 总是 YAML 编辑器；
  - 表格用 `@tiptap/extension-table`（prosemirror-tables），单元格是普通文本块，行内规则同正文。
- **光标在原子块之间**：用 Tiptap 自带的 gapcursor，代码块、表格、公式块前后都能放光标并输入。
- **源码模式**（E-11）：一个 CodeMirror 6 视图编辑整篇源码。进入时序列化；退出时解析，只替换变了的块；选区按源码偏移换算。
- **大文档**（X-3）：公式、图表、图片进入视口附近才渲染，结果按源码缓存；装饰和语义层都只更新改动的块。
- **按源码改动**：第 2 章的大部分编辑行为（回车续写、退格去掉标记、自动转换、菜单命令……）是按 Markdown 源码定义的，所以命令拿到整篇源码和选区（`source.ts` 的 `readSource`），给出改好的源码和新选区，`applySource` 只把改到的顶层块交给 `reconcile` 重新解析、替换，选区按源码偏移换回去；光标落在不属于任何块的空行上时放一个光标占位空段落（`Origin.placeholder`），空着离开时源码不变。「文本 + 选区」形式的命令（`commands/`）找块和列表时从文档树取（`commands/inlineLayout.ts`），不逐行扫描。普通的字直接交给 ProseMirror 插入，只有可能有特殊行为的（行首写法后的空格、围栏、配对符号）才读整篇源码。
- **光标、选区的表示**：光标进不了块标记和行首的缩进（E-3）；← → 按原文一个字一个字走（浏览器自己走会跳过隐藏的标记）；按住鼠标拖选期间片段不展开也不收起（不然文字挪位，鼠标底下的字就变了）。选中分隔线、目录是节点选区；选择行、列、表格是单元格选区（prosemirror-tables），行内样式在它上面逐格执行（T-5）。
- **主题**：编辑区的 DOM 同导出的 HTML（`#write` 就是可编辑的元素；`strong`、`em`、`a`……；复选框、Callout 标题、表格对齐是装饰，`li > input`、`.md-alert > p` 这类主题规则对得上）。窗口外的顶层块 `content-visibility: auto`，输入只重排看得见的部分。

### 1.7 渲染与导出

- 一条管线：文档模型 → `render/html.ts` → HTML → 主题 CSS。编辑区里的预览（行内 Widget、NodeView 里的预览）调同一批函数（`math`、`highlight`、`diagrams`、`sanitize`）。
- 图表：编辑器把「类型 + 源码 + 主题」交给 `render/diagrams.ts`；它通过 `postMessage` 交给图表沙箱（1.2 节），沙箱返回 SVG，过滤一遍再插入，按源码缓存。图表库（Mermaid、flowchart.js、js-sequence-diagrams、Raphael）只在沙箱里加载；Raphael 经 `@marko/render/vite` 的插件改成模块引用，不挂全局变量。
- 公式：MathJax 渲染成 SVG。自动编号、`\label`、`\eqref` 需要按文档顺序统一处理，编号状态由 `render/math.ts` 按整篇管理，单个公式改动时只重排受影响的编号。
- 导出（O 章）：渲染进程用 `render/exportDocument.ts` 生成自包含 HTML，交给主进程：
  - HTML：直接写文件；
  - PDF、打印：主进程在隐藏的导出页里加载这份 HTML，再 `printToPDF`、`print`；
  - 图片：同一个导出页按整篇的高度调整窗口，用 `webContents.capturePage` 截成 PNG（最高 16,000 像素）；
  - Word 等 Pandoc 格式：渲染进程把图表块换成图片引用（`pandocDiagrams.ts`），连同图表的 SVG 交给主进程；主进程在不跑脚本的隐藏窗口里把 SVG 截成 PNG，放到 Pandoc 找得到的地方，再调用 Pandoc（O-4）。

### 1.8 数据：存在哪、谁是唯一来源

「主人」是唯一能写它的地方。`userData` 指 Electron 的 `app.getPath("userData")`。

| 数据 | 主人 | 存在哪 | 说明 |
|---|---|---|---|
| 文档 | 用户的文件系统 | `.md` 文件 | 主进程 `files.ts` 读写：`write-file-atomic` 原子写入，写之前比对磁盘内容（F-6） |
| 打开中的文档内容 | 这个窗口的渲染进程 | 编辑器状态 | 保存时序列化成源码交给主进程 |
| 设置 | 主进程 `store.ts` | `electron-store`（`userData/config.json`） | 所有窗口共用；改动由主进程广播给每个窗口（S 章）；字段用 `shared` 里的 schema 校验 |
| 上传 Token | 主进程 `store.ts` | `electron-store` 里的密文 | 用 `safeStorage` 加密；接口只返回「已填」，不返回明文（M-4） |
| 最近文件 | 主进程 | `electron-store` | 最多 20 个（F-5） |
| 草稿 | 主进程 | `userData/drafts/<草稿 id>.md` 和同名 `.json`（原路径、原文件的指纹、时间） | 渲染进程停止输入 1 秒后发给主进程，用 `write-file-atomic` 写；正常保存或选「不保存」后删除（F-9） |
| 窗口状态 | 主进程 | 位置和大小：`electron-window-state`；上次打开的窗口、文档、工作区、侧栏宽度和页签：`electron-store` | F-16、W-7 |
| 用户主题 | 主进程 `themes.ts` | `userData/themes/*.css` | A-3 |
| 导入的文档里的图片 | 主进程 `imports.ts` | `userData/imports/<编号>/` | Pandoc 提取到这里，保存时复制到文档旁边；放了 30 天以上的启动时清掉（F-19） |
| 导出记录 | 主进程 | `electron-store` | 每个文档上次导出的格式和位置（O-7） |
| 用户词典 | Electron 的 session | Electron 自己的存储 | L-1 |
| 图片和媒体 | 文档所在目录 | 按 M-3 的设置复制到的位置 | — |
| 公式、图表的渲染结果 | 渲染进程 | 内存 | 窗口关掉就没有 |

### 1.9 主进程接口

通用约定：

- 渲染进程只通过 `window.marko` 调用；每个方法对应一个 `ipcMain.handle` 通道，名字是 `marko:<模块>.<动作>`。
- 参数和返回值用 `shared` 里的 zod schema 校验，校验不过直接拒绝。
- 涉及路径的参数都过 `scope.ts`（1.10 节）。
- 出错统一返回 `{ code, message }`：`code` 是英文枚举（`not_found`、`conflict`、`out_of_scope`、`io_error`、`pandoc_missing`、`upload_failed`、`cancelled`、`invalid_argument`：参数没通过校验），`message` 是当前界面语言的说明。

| 模块 | 方法 | 功能 |
|---|---|---|
| `app` | `version()`、`platform()` | R-5 |
| `file` | `pickAndOpen()`、`open(path)`、`openLink(path, anchor)`、`openDropped(files)`、`openHere(path)`、`read(path, encoding)`、`save(request)`、`saveAs(request)` | F 章、N-4、F-15、F-18 |
| `files` | `create(directory, name)`、`createFolder(directory, name)`、`rename(path, name)`、`trash(path)` | W-6、F-13 |
| `workspace` | `pickAndOpen()`、`open(root)`、`list(root)`、`openContaining()`、`close()` | W 章 |
| `search` | `start(request)`、`cancel(id)` | W-5 |
| `media` | `pick()`、`save(request)`、`pathOf(file)`（预加载脚本由 File 算出路径，同时告诉主进程这是用户给的） | M-2～M-4、M-7 |
| `upload` | `setToken(token)`、`hasToken()` | M-4 |
| `export` | `run(request)`、`last(documentPath)`、`print(html)` | O 章 |
| `import` | `run()` | F-19 |
| `settings` | `get()`、`set(patch)` | S 章 |
| `recent` | `list()`、`remove(path)`、`clear()` | F-5 |
| `draft` | `save(request)`、`remove(id)` | F-9 |
| `window` | `setDocumentState(state)`、`newWindow()`、`close()`、`cancelClose()`、`initialDocument()`、`initialDraft()`、`initialState()`、`setLayout(layout)` | F-1～F-3、F-10、F-16、F-17、W-7 |
| `shell` | `openExternal(url)`、`showItemInFolder(path)`、`openFolder(path)`、`copyText(text)` | N-4、F-13 |
| `menu` | `popup(items)`（右键菜单：渲染进程给出这次的菜单项，主进程用 `electron-context-menu` 弹出，拼写建议是它加的） | W-6、L-1 |
| `spellcheck` | `words()`、`removeWord(word)` | S-10（用户词典） |
| `themes` | `list()`、`openFolder()`、`exportCss(file)` | A 章 |
| `update` | `install()` | R-4 |

全屏、缩放、置顶、开发者工具、检查更新、主题这些只是菜单项，主进程自己做，不经过渲染进程。

主进程 → 渲染进程的事件：

| 事件 | 什么时候发 | 功能 |
|---|---|---|
| `menu.command` | 点了原生菜单项或它的快捷键 | 第 2 章各条 |
| `window.closeRequested` | 用户关窗口；退出时挨个窗口发 | F-10、F-16 |
| `open.file` | 系统打开文件、拖到程序坞图标，选定了这个窗口 | F-14 |
| `document.jumpToAnchor` | 本地链接指向这个窗口里的文档、带 #标题 | N-4 |
| `file.changed` | 打开的文件被外部修改、删除 | F-12 |
| `file.renamed` | 在侧栏里改了这个文件的名字 | F-13 |
| `workspace.changed` | 工作区里有文件增删改 | W-2、W-3 |
| `settings.changed` | 任何窗口改了设置 | S-1 |
| `search.results`、`search.done` | 全局搜索分批返回、结束 | W-5 |
| `themes.changed` | 主题目录里的文件变了 | A-3 |
| `update.status` | 新版本下载好了；手动检查的结果 | R-4 |

### 1.10 安全

- **渲染进程**：`contextIsolation`、`sandbox` 打开，`nodeIntegration` 关闭；只有 `window.marko`；`will-navigate` 和 `setWindowOpenHandler` 拦下一切页面跳转和新窗口，链接都走 N-4。
- **网页权限**（`permissions.ts`）：Electron 默认把网页要的权限全部放行，文档里嵌的网页（iframe）就能静默拿到摄像头、麦克风、定位、剪贴板读取。这里装上权限请求和检查的处理函数，默认拒绝，只放行视频全屏和应用页面自己写剪贴板；WebHID、WebUSB 之类的设备一律不给（端到端测试里验证权限查询的结果是 denied）。
- **CSP**（`protocol.ts` 给应用页面加的响应头）：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' marko-theme:; img-src 'self' marko-asset: marko-theme: data: blob: https: http:; media-src marko-asset: blob: https: http:; font-src 'self' marko-theme: data:; connect-src 'self' marko-theme:; frame-src 'self' https:; object-src 'none'; base-uri 'none'`。上传、更新检查都由主进程发请求，渲染进程不需要联网；文档里的远程图片、嵌的网页（只许 https）和音视频照常加载（同 Typora，X-1）。
- **图表沙箱页**（`sandbox.html`）单独一套 CSP：`default-src 'none'; script-src app://marko; style-src app://marko 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'; sandbox allow-scripts`，不能联网、不能嵌页面；末尾的 `sandbox` 指令兜底，就算被当成顶层页面打开也没有任何权限。CSP 按解析出的文件定、不按请求里的写法（Windows、macOS 的文件名不分大小写，`Sandbox.html` 也是这个文件）：只有构建目录下的 `index.html` 用应用的 CSP，别的页面一律用这套。沙箱的源是不透明的（`null`），按模块加载脚本走 CORS：`app` 协议注册成 `corsEnabled`，只有 `assets/` 下的文件回 `Access-Control-Allow-Origin: null`（端到端测试里验证了三种图表都能画、沙箱碰不到父页面）。
- **本地资源**：`marko-asset://` 只返回图片、视频、音频类型的文件，其他类型一律拒绝。
- **接口**：涉及路径的调用都过 `scope.ts`。范围是用户主动打开过的：对话框选的、拖进来的、命令行和系统打开的文件，最近文件，工作区目录，以及这些文档所在目录下按 M-3 写入的资源目录。不在范围内返回 `out_of_scope`。主进程拿来用的路径都要在范围里，包括渲染进程报上来的文档状态（会话恢复、「打开所在文件夹」用它）；插入媒体时复制、上传的原文件另有一份只读的范围：对话框选的、拖进来和粘贴的（预加载脚本由 File 算出路径告诉主进程，页面交不了路径字符串）；导入图片的地址规范化以后要还在导入目录里；文档里的本地链接（N-4）是用户点的，不受范围限制，但只打开 Markdown 文件，别的文件主进程问过再交给系统。
- **文档里的 HTML**：经 `render/sanitize.ts` 过滤后插入：去掉 `<script>`、事件属性、`javascript:` 地址、`<object>`、`<embed>`、表单；`<iframe>` 只保留 `https:` 地址，并加上 `sandbox` 属性，`allow` 里只留 `autoplay`、`encrypted-media`、`fullscreen`、`picture-in-picture`（去掉来源列表）；`<video>`、`<audio>`、`<details>`、`<img>`、`<kbd>` 等常用标签保留。
- **生成的 SVG 怎么放进 HTML**：公式、图表、图标的 SVG 先用占位代替，过滤完用户的 HTML 以后再填回去。占位是私用区字符包着每次渲染随机生成的 nonce 和序号，文档里的文字冒充不了；用户的文字、属性值、原始 HTML、实体里出现的占位字符一律换成 U+FFFD（占位如果是固定写法，文档就能把公式的 SVG 拼进 iframe 的 `src`，挤掉 `sandbox` 属性）。不是解析器来的模型（ProseMirror JSON、插件）也拼不出坏 HTML：标题级别、表格对齐、起始序号、Callout 种类都先校验。
- **图表**：在沙箱里渲染，返回的 SVG 再过滤一遍，过滤后必须是一个 `<svg>` 元素（前面有文字就算失败）；导出时不管调用方过滤没过滤，再过滤一遍。Mermaid 用 `securityLevel: "strict"`。
  - 和沙箱之间（`render/diagrams.ts` 的 `SandboxFrameChannel`）：沙箱加载完发一条 ready，宿主收到第一条时用 `MessageChannel` 交给它一个端口，之后请求和回复都只走这个端口。应用页面的 CSP 要允许 `frame-src https:`（文档里嵌的视频），沙箱 iframe 因此能被（出了漏洞的图表库）导航到外面的网页；有了端口，新页面收不到后面的图表源码，也冒充不了回复。iframe 第二次触发 `load` 就是被导航走了，拆掉重建。
  - 宿主一次只发一个请求，超时（15 秒）从发出时算；超时说明沙箱卡住了，拆掉重建，后面的请求发给新的沙箱。请求 id 带每个渲染器自己的随机前缀，几个渲染器共用一个通道也认得出自己的回复。
  - Mermaid 的配色在 SVG 自带的 `<style>` 里，而 `<style>` 放进页面后对整页生效，所以过滤时检查（`diagramStyle.ts`）：SVG 的 id 必须是沙箱起的（`marko-mermaid-<沙箱实例的随机串>-<序号>`，防止被冒充成 `#write` 之类）；每条规则都在 `#id` 下，不许 `+`、`~` 跳到图外，不许嵌套规则和 `@import` 等 @ 规则（`@keyframes` 除外）；检查用的不是完整的 CSS 分词器，所以把写法圈小：不许注释、反斜杠转义、控制字符（CSS 里 `\r`、`\f` 也会结束字符串）、`<`，`url()` 只许 `url(#id)`，函数只认白名单（颜色、滤镜、变换、渐变、伪类，不加载外部资源的）；`<style>` 里不能有子元素（CSS 只认直接的文字子节点）。不合格的整段清空，图照样显示，只是没有配色。动画名是全局的，`@keyframes` 的名字和 `animation` 里的引用都加上图的 id 当前缀（Mermaid 自带的 `dash` 和 Element Plus 的同名动画会互相覆盖）。端到端测试里画了 Mermaid 常用的十几种图，样式都过得了检查。
  - Raphael 的箭头用 `<use>` 引用图里的路径，`<use>` 只许指向 `#…`。
- **外部链接**：只允许 `http:`、`https:`、`mailto:` 交给 `shell.openExternal`。
- **开发者工具**：发布版只在「帮助 → 开发者工具」（R-6）手动打开。
- **Electron Fuses**：关闭 `RunAsNode`、`EnableNodeOptionsEnvironmentVariable`、`EnableNodeCliInspectArguments`；打开 `EnableCookieEncryption`、`EnableEmbeddedAsarIntegrityValidation`、`OnlyLoadAppFromAsar`。
- 每次发布前按本节逐条检查；X-1 的回归用例（恶意 HTML、恶意图表、越权路径）在测试里固定下来。

### 1.11 主题与样式

- 编辑区的根元素是 `#write`，块和行内都是普通 HTML 元素：`h1`～`h6`、`p`、`blockquote`、`ul`、`ol`、`li`、`table`、`pre`、`code`、`img`、`a`、`strong`、`em`。导出的 HTML 结构和类名相同，所以同一份主题 CSS 两边都适用。
- 编辑时才有的东西（展开的标记、NodeView 的边框、工具条、选中的单元格）用 `md-` 开头的类名，写在 `editor.css`，不进导出。
- 主题只写 `#write` 下的排版和 `:root` 上的变量；应用界面是 Element Plus 的组件，颜色用它的 CSS 变量（`--el-*`），`ui.css` 只覆盖这些变量；深色时给 `html` 加 `dark` 类，用 Element Plus 自带的暗色变量。
- 代码高亮的颜色由主题给出，CodeMirror 编辑器和静态高亮用同一套类名：CodeMirror 5 的 `cm-keyword`、`cm-string`、`cm-def`……（`render/highlight.ts` 的 `codeHighlighter`，编辑时的 CodeMirror 6 用 `syntaxHighlighting(codeHighlighter)`）。代码块的结构也照 Typora 导出的：`pre.md-fences > div.CodeMirror.cm-s-inner > div.CodeMirror-code > pre.CodeMirror-line`，编辑时的 CodeMirror 6 在根元素和每行上加同样的类名（A-3）。
- `base.css` 整个放在 `@layer marko-base` 里：层里的规则总比不在层里的低，主题不用拼选择器优先级就能盖过它。最基本的几个变量用 Typora 的名字（`--bg-color`、`--text-color`、`--monospace`、`--select-text-bg-color`），`--md-*` 的默认值引用它们；不在层里的只有 Typora 的 `codemirror.css` 里那条行样式重置（`.CodeMirror pre.CodeMirror-line`），Typora 的主题默认它存在。
- 块与块之间不输出换行（同 Typora 的导出），只有 `#write` 的直接子元素之间换行：Typora 的样式让 `li`、`p` 保留空白，容器里多出的换行会显示成空行。
- 组件里不写死颜色、字号、字体，都用变量。

### 1.12 目录结构

```
packages/
  shared/        主进程和渲染进程共用的类型和 schema
  markdown/      解析、文档模型、序列化、语义层（纯 TS）
  render/        HTML 渲染、过滤、公式、高亮、图表沙箱、自包含导出
  editor/        编辑器：Tiptap 的扩展（不依赖 Vue）
  editor-vue/    编辑器的 Vue 包装和周边界面（对外发布）
  themes/        排版基础、编辑样式、内置主题（CSS）
apps/
  desktop/       Electron 应用：main/、preload/、renderer/
test/
  corpus/        无损语料：CommonMark、GFM 规范用例和真实文档
  behavior/      行为规格：带光标标记的 Markdown → 操作 → 期望的 Markdown
  visual/        视觉基准：固定语料在内置主题下的截图，和 Typora 的对照图
  e2e/           Playwright：Electron 应用端到端
  perf/          X-3 的性能测试：编辑器的测试页 + 本机的 Edge
scripts/         编辑器库的类型声明（build-library-types.mjs）、在打好的包上跑端到端测试（e2e-packaged.mjs）
docs/            architecture.md（本文件）、features.md（功能清单）、重构计划.md（重构的记录）
.github/
  workflows/     ci.yml（每个 PR）、release.yml（打 tag）
  release-notes/ 每个版本的发布说明
```

每个包自己的测试放在包里的 `test/`；跨包的语料和规格放在根目录的 `test/`。根目录的 `package.json` 同时是编辑器库（K-1）：`exports` 指向 `dist-lib/`，由 `prepare`（`vite.library.config.ts` + `tsconfig.library.json`）构建；共用的 TypeScript 配置在 `tsconfig.base.json`，依赖方向的检查在 `.dependency-cruiser.cjs`。

### 1.13 测试策略

| 层 | 工具 | 测什么 | 怎么隔离 |
|---|---|---|---|
| `markdown` 单元 | Vitest（node） | 每个 Lezer 扩展的解析；语料逐字节无损；不变式的随机编辑测试（`fast-check` 生成编辑序列）；语义层 | 纯函数 |
| 行为规格 | Vitest（jsdom） | `test/behavior/` 的每一条：命令、输入规则、回车、退格、Tab（格式见 `test/behavior/README.md`） | jsdom 里建一个编辑器（`createMarkoEditor`），每条规格重新放内容和选区 |
| `render` | Vitest | HTML 输出、过滤（含恶意样本）、自包含导出 | 图表沙箱用假实现 |
| 编辑器交互 | Playwright（本机的 Edge） | 点击、拖选、输入法组合、拖放、片段展开、NodeView 的焦点、gapcursor | 只加载编辑器的测试页（`packages/editor/playground`） |
| 界面组件、渲染进程 | Vitest（jsdom）+ @vue/test-utils | 编辑器组件（`MarkoEditor`）、文档会话（`useDocument`）、拖放、设置表单、快速打开、快捷键、路径、导出前的处理 | `window.marko` 用假实现（`renderer/testing/fakeApi.ts`） |
| 主进程 | Vitest（node） | 原子写入和冲突、编码、scope、监听、搜索、store、导出参数 | 临时目录 |
| 端到端 | Playwright 的 Electron 支持 | 打开、保存、外部修改、多窗口、导出、菜单、系统打开文件、越权的接口调用 | 临时的 `userData` 目录；系统对话框、外部程序换成假的；也在仓库外面打的包上跑（`npm run test:e2e:packaged`） |
| 视觉 | Playwright 截图（本机的 Edge） | `test/visual/` 的语料在两个内置主题下的渲染，和基准图比；和 Typora 的对照图人工更新 | 固定字体、窗口大小 |
| 性能 | Playwright（本机的 Edge）+ 编辑器的测试页 | X-3 的指标：打开大文档、按键到显示（`test/perf/`） | 生产构建 |

约定：

- 测试名写功能编号，如 `E-2 光标进入粗体时显示星号`。
- 不读取源码文本做断言：样式用视觉测试或 `getComputedStyle`，行为用规格和交互测试。
- `npm run check`（tsc、dependency-cruiser）、`npm test`、端到端测试（`npm run test:e2e`）和编辑器的交互测试（`npm run test:interaction`）在每个 PR 上由 CI 跑，必须通过；失败就修，不跳过、不删测试。

---

## 3 功能编号 → 模块

每条功能列出主要落点（1.3 节的文件），括号里写它在那里管什么；做法看第 2 章的要点和代码里的注释。「—」表示这一层不涉及。`renderer` 一列也包括 `editor-vue`。

### 编辑核心（E）

| 功能 | markdown | render | editor | renderer | main |
|---|---|---|---|---|---|
| E-1 无损读写 | `parse.ts`（原始片段、写法）、`serialize.ts` | — | `state.ts`、`source.ts` | `useDocument`（保存时序列化） | `files.ts`（换行符、BOM、编码） |
| E-2 行内语法 | `inline.ts` | `math.ts`、`sanitize.ts`（原子片段） | `plugins/inlineSyntax.ts`、`keymap.ts`（按原文一个字一个字走） | — | — |
| E-3 块级标记 | `model.ts` | — | `nodes/index.ts`（各节点的 schema）、`commands/backspace.ts`（开头退格） | — | — |
| E-4 自动转换 | `reconcile.ts`（Setext） | — | `commands/input.ts`、`commands/extension.ts`（行首写法、围栏）、`plugins/defer.ts`、`plugins/reconcile.ts` | — | — |
| E-5 回车、退格、Tab | — | — | `keymap.ts`、`commands/enter.ts`、`commands/backspace.ts`、`commands/lists.ts`、`commands/tab.ts` | — | — |
| E-6 撤销与重做 | `reconcile.ts` | — | Tiptap 的 UndoRedo（prosemirror-history）、`plugins/historyOrigins.ts`、`nodeViews/codeMirror.ts`（CodeMirror 的修改并进同一个事务）、`sourceMode/` | — | `menu.ts` |
| E-7 选择 | — | — | `commands/lines.ts`、`commands/extension.ts` | — | `menu.ts`、`contextMenu.ts` |
| E-8 删除与移动 | — | — | `commands/lines.ts`、`keymap.ts` | — | `menu.ts` |
| E-9 自动配对 | — | — | `commands/input.ts`（配对）、`commands/backspace.ts`（成对删）、`commands/extension.ts`；`plugins/textInput.ts`（直接输入的收尾） | — | — |
| E-10 智能标点 | `inline.ts`（哪些位置不处理） | — | `plugins/inlineSyntax.ts`（只改显示） | — | — |
| E-11 源码模式 | `positions.ts` | — | `sourceMode/` | `MarkoEditor.vue`、`App.vue` | `menu.ts` |
| E-12 输入法 | — | — | `plugins/composition.ts`、`plugins/reconcile.ts`（组合期间不对齐） | — | — |

### 块（B）

| 功能 | markdown | render | editor | renderer | main |
|---|---|---|---|---|---|
| B-1 段落与换行 | `syntax/index.ts`（GFM） | `html.ts` | `nodes/index.ts`、`commands/blocks.ts` | — | — |
| B-2 标题 | `semantics/outline.ts`（锚点 id） | `html.ts` | `nodes/index.ts`、`commands/blocks.ts`、`plugins/viewModes.ts`（跳到锚点） | — | — |
| B-3 引用 | `model.ts`（每行前缀） | `html.ts` | `nodes/index.ts`、`commands/blocks.ts` | — | — |
| B-4 列表 | `serialize.ts`（重新编号） | `html.ts` | `commands/lists.ts`、`commands/tab.ts`（缩进、反缩进） | — | — |
| B-5 任务列表 | — | `html.ts` | `plugins/blockWidgets.ts`（复选框） | — | — |
| B-6 代码块 | — | `highlight.ts` | `nodeViews/codeBlock.ts`、`nodeViews/codeMirror.ts`、`commands/raw.ts` | `overlays/CodeLanguage.vue`（选语言） | `contextMenu.ts` |
| B-7 公式块 | `syntax/math.ts` | `math.ts` | `nodeViews/rawBlocks.ts`、`commands/raw.ts` | — | — |
| B-8 分隔线 | — | `html.ts` | `nodes/index.ts`、`commands/backspace.ts` | — | — |
| B-9 Front Matter | `syntax/blocks.ts`、`semantics/frontMatter.ts` | — | `nodeViews/rawBlocks.ts` | — | — |
| B-10 目录 | `syntax/blocks.ts`、`semantics/outline.ts` | `html.ts` | `nodeViews/blocks.ts` | — | — |
| B-11 脚注 | `syntax/footnote.ts`、`semantics/footnotes.ts` | `html.ts` | `nodeViews/blocks.ts`（标签和回链）、`plugins/inlineSyntax.ts`（引用） | `overlays/HoverTip.vue` | — |
| B-12 HTML 块与注释 | `syntax/html.ts` | `sanitize.ts` | `nodeViews/rawBlocks.ts`、`commands/raw.ts`、`plugins/inlineSyntax.ts`（注释） | — | — |
| B-13 Callout | `syntax/blocks.ts` | `html.ts`、`alertIcons.ts` | `plugins/blockWidgets.ts`（标题） | `overlays/CalloutKind.vue` | — |
| B-14 定义列表 | `syntax/blocks.ts` | `html.ts` | `commands/blocks.ts` | — | — |
| B-15 链接引用定义 | `semantics/references.ts` | — | `nodes/index.ts`（代码类的节点） | — | — |
| B-16 缩写 | `syntax/blocks.ts`、`semantics/abbreviations.ts` | `html.ts` | `plugins/inlineSyntax.ts` | `overlays/HoverTip.vue` | — |
| B-17 插入段落 | — | — | `commands/extension.ts` | — | `menu.ts` |

### 行内（I）

| 功能 | markdown | render | editor | renderer | main |
|---|---|---|---|---|---|
| I-1 强调与行内代码 | `syntax/emphasis.ts`、`inline.ts` | `html.ts` | `commands/inlineStyle.ts`、`plugins/inlineSyntax.ts` | — | — |
| I-2 链接与自动链接 | `inline.ts`、`semantics/references.ts` | `html.ts` | `commands/format.ts`、`plugins/inlineSyntax.ts`（Ctrl+单击） | `host.ts`（打开） | `ipc.ts`（`file.openLink`）、`links.ts` |
| I-3 行内公式 | `syntax/math.ts` | `math.ts` | `plugins/inlineSyntax.ts`、`commands/extension.ts` | — | — |
| I-4 高亮、上标、下标 | `syntax/highlight.ts`、Lezer 自带的上标和下标 | `html.ts` | `commands/inlineStyle.ts` | — | — |
| I-5 Emoji | `syntax/emphasis.ts`（shortcode） | `emoji.ts` | `reused/emoji.ts`（@tiptap/suggestion + emojibase-data） | `overlays/EmojiList.vue`、`overlays/emojiBridge.ts` | — |
| I-6 行内 HTML、实体、转义 | `inline.ts` | `sanitize.ts` | `plugins/inlineSyntax.ts` | — | — |
| I-7 清除格式与样式范围 | `inline.ts` | — | `commands/format.ts`、`commands/extension.ts` | — | — |

### 表格（T）、图片与媒体（M）

| 功能 | markdown | render | editor | renderer | main |
|---|---|---|---|---|---|
| T-1 插入表格 | — | — | `commands/tables.ts`、`commands/extension.ts` | `dialogs/TableSizeDialog.vue`（ElDialog + ElInputNumber） | — |
| T-2 单元格编辑 | `serialize.ts`（`\|`、`<br>`） | — | `commands/cells.ts`、`keymap.ts`（Tab 跳格） | — | — |
| T-3 行与列 | — | — | `commands/tables.ts`、`commands/extension.ts` | `overlays/TableToolbar.vue` | `menu.ts` |
| T-4 对齐 | `serialize.ts`（分隔行） | `html.ts` | `plugins/blockWidgets.ts`、`commands/tables.ts` | `overlays/TableToolbar.vue` | — |
| T-5 工具条与选择 | — | — | `commands/run.ts`（单元格选区上逐格执行）、`commands/tables.ts` | `overlays/TableToolbar.vue` | — |
| T-6 粘贴表格数据 | — | — | `clipboard/index.ts`、`commands/cells.ts` | — | — |
| T-7 表格源码 | `parse.ts`、`serialize.ts` | — | `commands/cells.ts` | — | — |
| M-1 显示 | `semantics/frontMatter.ts`（`typora-root-url`） | `html.ts` | `plugins/inlineSyntax.ts`（图片 Widget） | `host.ts`（资源地址）、`exporting.ts` | `protocol.ts`（`marko-asset://`） |
| M-2 插入 | — | — | `plugins/placeholders.ts`（`insertMedia`、占位）、`commands/format.ts`、`clipboard/index.ts` | `host.ts`、`App.vue` | `media.ts`、`ipc.ts` |
| M-3 复制到哪里 | — | — | — | `host.ts` | `media.ts`、`imports.ts`、`scope.ts` |
| M-4 上传 | — | — | `plugins/placeholders.ts` | `settings/` | `upload.ts`、`store.ts`（Token） |
| M-5 宽度 | `serialize.ts` | — | `commands/format.ts` | `App.vue`（ElMessageBox.prompt） | — |
| M-6 查看大图 | — | — | — | `MediaViewer.vue`（ElImageViewer）、`MarkoEditor.vue`（双击） | — |
| M-7 视频与音频 | — | `sanitize.ts` | `plugins/inlineSyntax.ts`、`plugins/placeholders.ts` | `App.vue`、`host.ts` | `media.ts`、`protocol.ts` |

### 公式与图表（D）

| 功能 | markdown | render | editor | renderer | main |
|---|---|---|---|---|---|
| D-1 公式渲染 | — | `math.ts`、`mathFonts.ts` | `plugins/inlineSyntax.ts`、`plugins/lazy.ts`（进入视口才渲染） | — | — |
| D-2 公式编号 | — | `math.ts`（整篇的编号状态） | `plugins/mathDocument.ts` | — | — |
| D-3 Mermaid | — | `diagrams.ts`、`diagramStyle.ts`、`sandbox/` | `nodeViews/codeBlock.ts` | `diagrams.ts`（应用的沙箱页） | — |
| D-4 Flowchart 与 Sequence | — | `diagrams.ts`、`sandbox/` | `nodeViews/codeBlock.ts` | `diagrams.ts` | — |
| D-5 图表大图查看器 | — | — | — | `MediaViewer.vue`（ElImageViewer，SVG 转 blob 地址）、`MarkoEditor.vue`（双击） | — |
| D-6 渲染失败 | — | `math.ts`、`diagrams.ts` | `nodeViews/codeBlock.ts`、`nodeViews/rawBlocks.ts`、`plugins/inlineSyntax.ts` | — | — |

### 文件与窗口（F）

| 功能 | markdown | editor | renderer | main |
|---|---|---|---|---|
| F-1 新建 | — | — | `useDocument` | `windows.ts` |
| F-2 新建窗口 | — | — | — | `windows.ts`、`menu.ts` |
| F-3 打开 | — | — | `useDocument` | `windows.ts`（选窗口）、`files.ts`、`scope.ts` |
| F-4 快速打开 | — | — | `quickOpen.ts`（fzf）、`QuickOpen.vue` | `workspace.ts` |
| F-5 最近文件 | — | — | `RecentFiles.vue` | `store.ts`（electron-store）、`menu.ts` |
| F-6 保存 | `serialize.ts` | — | `useDocument` | `files.ts`（write-file-atomic、冲突检测） |
| F-7 另存为 | `semantics/outline.ts`（第一个标题） | — | `useDocument` | `files.ts` |
| F-8 自动保存 | — | — | `useDocument.ts`（自动保存） | — |
| F-9 草稿恢复 | — | — | `useDocument.ts`（草稿） | `store.ts`、`windows.ts`（启动时恢复） |
| F-10 未保存确认 | — | — | `useDialogs`、`ChoiceDialog.vue`、`useDocument` | `windows.ts`（关闭事件、退出时挨个窗口问） |
| F-11 重新载入 | `positions.ts`（保留光标） | — | `useDocument` | `files.ts` |
| F-12 外部修改 | `positions.ts`（保留光标） | — | `useDocument` | `watch.ts` |
| F-13 文件操作 | — | — | `useDocument`、ElMessageBox.prompt（重命名） | `workspace.ts`、`files.ts` |
| F-14 系统打开文件 | — | — | — | `index.ts`、`windows.ts` |
| F-15 拖放 | — | `clipboard/index.ts`（拖进编辑区的媒体） | `useDropOpen.ts`、`DropHint.vue` | `fileOps.ts`（分类）、`scope.ts` |
| F-16 关闭与退出 | — | — | `useDocument` | `index.ts`、`windows.ts`（electron-window-state）、`store.ts` |
| F-17 窗口标题 | — | — | `useDocument` | `windows.ts` |
| F-18 编码 | — | — | — | `files.ts`（jschardet、iconv-lite） |
| F-19 导入 | `parse.ts` | — | `App.vue` | `export.ts`、`imports.ts` |

### 工作区与侧栏（W）、查找与跳转（N）、视图（V）

| 功能 | markdown | editor | renderer | main |
|---|---|---|---|---|
| W-1 工作区 | — | — | `useWorkspace` | `workspace.ts`、`scope.ts` |
| W-2 文件树 | — | — | `sidebar/FileTree`（ElTreeV2） | `workspace.ts`、`watch.ts` |
| W-3 文件列表 | — | — | `sidebar/FileList`（ElTreeV2） | `workspace.ts`、`watch.ts` |
| W-4 大纲 | `semantics/outline.ts` | `index.ts`（大纲变化事件） | `sidebar/OutlineTree`（ElTree） | — |
| W-5 全局搜索 | — | — | `sidebar/SearchPanel`（ElInput + ElTreeV2） | `search.ts`（ripgrep） |
| W-6 右键菜单 | — | — | `useWorkspace` | `contextMenu.ts`（electron-context-menu）、`workspace.ts` |
| W-7 侧栏 | — | — | `App.vue`（ElSplitter）、`useSettings` | `store.ts`（宽度、页签） |
| N-1 查找 | `positions.ts` | `reused/search.ts`（prosemirror-search）；源码模式用 `@codemirror/search` | `FindBar.vue` | `menu.ts` |
| N-2 替换 | — | `reused/search.ts` | `FindBar.vue` | — |
| N-3 跳转 | — | `plugins/viewModes.ts` | — | `menu.ts` |
| N-4 链接跳转 | `semantics/outline.ts`（锚点） | `plugins/inlineSyntax.ts`（Ctrl+单击）、`plugins/viewModes.ts`（打开链接、跳到锚点） | `host.ts`、`useDocument.ts` | `ipc.ts`（`file.openLink`）、`links.ts`、`windows.ts` |
| V-1 专注模式 | — | `plugins/focus.ts`（md-focus）、`plugins/viewModes.ts` | — | `menu.ts` |
| V-2 打字机模式 | — | `plugins/viewModes.ts` | — | `menu.ts` |
| V-3 状态栏 | — | — | `StatusBar.vue` | — |
| V-4 字数统计 | `semantics/stats.ts` | `index.ts`（选区变化事件） | `WordCountDialog.vue`（ElDescriptions）、`selectionStats.ts` | — |
| V-5 缩放 | — | — | — | `zoom.ts`、`menu.ts` |
| V-6 全屏 | — | — | — | `menu.ts`（togglefullscreen） |
| V-7 窗口置顶 | — | — | — | `windows.ts`、`menu.ts` |

### 剪贴板（C）、导出与打印（O）

| 功能 | markdown | render | editor | renderer | main |
|---|---|---|---|---|---|
| C-1 复制与剪切 | `serialize.ts`（选区的 Markdown） | `html.ts` | `clipboard/copy.ts` | — | — |
| C-2 复制为 | — | `html.ts` | `clipboard/copy.ts` | — | `menu.ts` |
| C-3 粘贴 | `parse.ts` | `sanitize.ts` | `clipboard/index.ts`、`commands/paste.ts`（HTML 转 Markdown，见 1.0 节） | — | — |
| C-4 粘贴为纯文本 | — | — | `clipboard/index.ts`、`commands/paste.ts` | `App.vue` | `menu.ts`、`contextMenu.ts` |
| C-5 拖动文字 | — | — | ProseMirror 自带、Tiptap 的 dropcursor | — | — |
| O-1 导出 HTML | — | `exportDocument.ts` | — | `exporting.ts`、`inlineFonts.ts` | `export.ts` |
| O-2 导出 PDF | — | `exportDocument.ts` | — | `exporting.ts` | `export.ts`（导出页、`printToPDF`） |
| O-3 导出图片 | — | `exportDocument.ts` | — | `exporting.ts` | `export.ts`（capturePage） |
| O-4 Pandoc 格式 | — | — | — | `pandocDiagrams.ts`（图表换成图片） | `export.ts`（图表截图、调 Pandoc） |
| O-5 打印 | — | `exportDocument.ts` | — | `exporting.ts` | `export.ts`（`print`） |
| O-6 导出设置 | — | — | — | `settings/` | `store.ts` |
| O-7 按上次的设置导出 | — | — | — | `App.vue`（exportLast） | `store.ts`（导出记录） |

### 外观（A）、设置（S）、语言与拼写（L）、编辑器库（K）、发布（R）、通用要求（X）

| 功能 | 落点 |
|---|---|
| A-1 内置主题 | `themes/solo.css`、`themes/dark.css`、`ui.css`（Element Plus 变量）；`main/themes.ts`、`main/menu.ts`；`renderer/useSettings` |
| A-2 字体与宽度 | `themes/base.css` 的变量；`renderer/appearance.ts`（editorSettingsOf） |
| A-3 自定义主题 | `main/themes.ts`（列表、监听主题目录、导出用的 CSS）、`main/protocol.ts`（marko-theme://）；`renderer/appearance.ts` |
| A-4 跟随系统深浅色 | `renderer/appearance.ts`（`activeTheme`）、`App.vue`（`matchMedia` 监听 `prefers-color-scheme`，由系统、主进程的 `nativeTheme` 决定）；切换 `html.dark` |
| S-1 偏好设置 | `renderer/components/settings/`（Element Plus 表单组件）、`useSettings`；`main/store.ts`（electron-store，保存、广播） |
| S-2～S-13 | 各节对应 `renderer/components/settings/` 里的一个组件，值存在 `main/store.ts`；每项影响的功能见表里括号中的编号 |
| L-1 拼写检查 | `main/index.ts`（开关、语言）、`main/contextMenu.ts`（electron-context-menu 的拼写建议）；`editor/nodeViews/*`（代码、公式块里关掉检查）、`editor/plugins/inlineSyntax.ts`（标记、行内代码、网址、公式源码不检查） |
| L-2 界面语言 | `renderer/locales/`、vue-i18n、Element Plus 的语言包；`main/menu.ts`（菜单文字）；`editor/host.ts`（编辑器的文字） |
| K-1 对外组件 | `editor/index.ts`、`editor-vue/MarkoEditor.vue` |
| K-2 宿主接口 | `editor/host.ts`；`renderer/host.ts`（桌面实现） |
| R-1～R-3 安装包 | electron-builder 配置；`main/index.ts`（文件关联带来的启动参数） |
| R-4 自动更新 | `main/updater.ts`（electron-updater）；渲染进程里的提示（ElNotification） |
| R-5 关于 | `renderer/components/dialogs/About`（ElDialog） |
| R-6 开发者工具 | `main/menu.ts`、`main/windows.ts` |
| X-1 不可信文档 | `render/sanitize.ts`、`render/sandbox/`；`main/protocol.ts`、`scope.ts`、`ipc.ts`、`windows.ts`（安全选项） |
| X-2 离线 | 全部依赖打进安装包；`render/exportDocument.ts` 不引用外网 |
| X-3 性能 | `markdown/reconcile.ts`、增量解析；`render` 的缓存；`editor/plugins/lazy.ts`、`plugins/inlineSyntax.ts`；`renderer/useDocument.ts`（草稿、自动保存防抖）、`StatusBar.vue`（字数防抖） |
| X-4 运行平台 | electron-builder 配置 |
| X-5 数据与隐私 | `main/store.ts`；网络请求只在 `main/upload.ts`、`main/updater.ts`，拼写词典由 Electron 下载（`main/index.ts` 设语言）；渲染进程只加载文档里的远程图片、网页、音视频 |

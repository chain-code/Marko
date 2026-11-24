# 视觉测试

固定的 Markdown 语料，在两个内置主题下截图，和基准图比较（docs/architecture.md 1.13 节）。阶段 3 定第一版基准。

## 目录

| 路径 | 内容 |
|---|---|
| `corpus/*.md` | 视觉语料：每个文件一类内容，覆盖第 2 章 B、I、T、M、D 章的排版 |
| `typora/` | Typora 1.14.15 的对照截图（`typora-capture.mjs` 截的） |
| `typora-capture.mjs`、`typora-window.ps1` | 截 Typora 对照图的脚本 |
| `baseline/` | 我们的基准图：两个内置主题（`solo-*`、`dark-*`）× 31 段语料，Playwright 生成 |
| `build-html.mjs` | 把语料渲染成导出用的 HTML（`packages/render/test/visual-export.test.ts`），图表在构建好的应用的沙箱里画（`render-diagrams.mjs`） |
| `playwright.config.ts`、`render.visual.ts` | 截图、和基准图比 |
| `marko-capture.mjs`、`compare-sheet.mjs` | 临时截一批 HTML；把我们的图和 Typora 的拼成左右对照图 |

## 跑视觉测试

```
npm run test:visual                         # 构建应用 → 导出 HTML → 截图 → 和 baseline/ 比
npm run test:visual -- --update-snapshots   # 改了排版、确认新样子是对的以后，更新基准
```

- 用本机的 Edge（Playwright 的 `channel: "msedge"`），不另装浏览器；视口 1180 × 1000，和 Typora 对照图去掉侧栏后一样宽。
- 正文的拉丁字母用主题自带的 Open Sans（导出时内嵌），中文用系统字体，所以基准图和机器有关：现在的基准是 Windows 11 上生成的。CI 的 Windows 镜像上中文字体不一定一样，视觉测试先不进 CI，改排版的时候本地跑。
- 不一样时 Playwright 在 `test/visual/results/` 里留下实际的图、基准图和差异图。
- 和 Typora 左右对照：`node test/visual/compare-sheet.mjs test/visual/baseline <输出目录> solo`（`dark` 同理）。

## 第一版基准（2026-11-23，阶段 3）

逐张和 Typora 对照图比过（Typora 的图是它的编辑区，我们的是导出页；比的是结构和排版，不比主题颜色），改掉的：

- 任务列表的复选框不再变灰（不加 `disabled`，同 Typora 的导出用 `pointer-events: none`）；有序列表里的任务项保留序号；
- 列表项之间、项内段落之间同 Typora 都是 0.5rem；
- 紧挨着中文标点的强调（`**"引号"**。`）、`:+1:` 这类带符号的 emoji shortcode；
- Callout 加上 Octicons 图标，标题放在第一段开头；
- 单独成段的图片居中；
- 脚注上标显示序号（Typora 导出也是序号，编辑区才显示标签）；
- 公式块之间的间距（补上 MathJax 的样式表）；
- 图表：Mermaid 的配色（SVG 里的 `<style>` 之前被过滤掉了，节点全黑）、Raphael 的箭头（`<use>` 被过滤）、js-sequence-diagrams 的字体（换个浏览器文字出框）和深色配色。

留着的差别（和 Typora 的行为不同，是有意的，见文档里对应的条目）：

- 有序列表里的 `[ ]` Typora 不当任务项（B-4 我们当）；
- 脚注定义下一行缩进 4 格，Typora 当缩进代码块，我们当脚注的续行（B-11）；
- 行内公式、高亮、上下标 Typora 默认关着，图里是原文，我们的默认值见 S-8；
- 段落里的单个换行 Typora 编辑区显示成换行，导出页按 S-6「保留单个换行」；
- 没有定义的脚注引用：Typora 编辑区显示成上标，导出（同我们）按原文。

## Typora 对照图

2026-11-23 用本机的 Typora 1.14.15 截了 28 张：`node test/visual/typora-capture.mjs "<Typora.exe 的路径>"`。

- Typora 总是用本机的 `%APPDATA%\Typora`：不认 `--user-data-dir`，也不读 `APPDATA` 环境变量；发布版关了调试，接不上 CDP。所以：
  - 用系统的 `PrintWindow` 截窗口，不发任何按键，截完直接结束进程；
  - 只截默认设置：GitHub 主题、左侧开着大纲、行内公式和高亮、上下标都关着（这几种语法在图里是原文）；深色主题和打开扩展后的样子要改本机 Typora 的偏好，没有截；
  - 截完脚本会把这次加进 Typora「最近文件」的条目删掉；Typora 正在运行时脚本不截。
- 后台窗口翻不了页，所以每个语料按二级标题切成小段，每段单独打开、截一张，文件名 `typora/<语料名>-<段号>.png`。窗口 1360 × 1000。
- `90-marko-only.md` 是 Typora 不支持的语法，不截。
- 对照时注意：Typora 打开文件后光标在文末，最后一个块如果是公式块、代码块，会显示成编辑状态（源码 + 预览），这本身也是对照内容（B-6、B-7）。

## 待办：从源码断言测试迁过来的样式要求

这些要求现在由读取 `.vue`、`.css` 源码、用正则断言 CSS 规则的测试守着（2026-11-23 统计，共 47 条）。旧测试在阶段 7 之前保留；新代码按下表写成截图对比或 `getComputedStyle` 断言，不再读源码文本。

| 功能 | 要保证的事（原来的测试名） | 来源 |
|---|---|---|
| 1.11 节 | 连续编辑器块级 Widget 不使用外部垂直 margin 提供布局间距 | `tests/continuousEditorWidgetSpacingInvariant.test.ts` |
| 1.11 节 | HTML 与定义列表 Widget 根节点建立独立格式化上下文 | `tests/continuousEditorWidgetSpacingInvariant.test.ts` |
| B-2 | 标题分隔线保留字形安全距离 | `tests/headingRulePosition.test.ts` |
| B-2 | all rendered H1 and H2 paths keep the separator below the glyph box | `tests/headingRulePosition.test.ts` |
| M-1 | 正文图片仅在独占段落中居中 | `tests/richMarkdownBlockImageStyles.test.ts` |
| M-1 | 独占图片段落按有效 DOM 节点判定 | `tests/richMarkdownBlockImageStyles.test.ts` |
| A-1、B 章 | Typora body typography stays aligned across rendered paths | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | Typora block metrics stay aligned across rendered paths | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | 暗色主题 Front Matter 使用主题背景 | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | 连续正文路径使用同一套 Typora 排版指标 | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | Active math source and preview share one continuous container | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | Adjacent rendered blocks collapse the smaller Typora edge spacing | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | Block gaps preserve zero-margin HTML and collapse owned or quoted spacing | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | GitHub Alert title icons stay aligned across rendered paths | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | Rendered paths keep effective table, image and inline metrics aligned | `tests/typoraBodyStyles.test.ts` |
| A-1、B 章 | Rendered paths keep generic figures, wrapped pre blocks and raw block spacing aligned | `tests/typoraBodyStyles.test.ts` |
| B-2 | continuous block previews collapse renderer trailing newlines | `tests/typoraDynamicBodyStyles.test.ts` |
| B-2 | focused top-level h3 through h6 headings show Typora-style labels | `tests/typoraDynamicBodyStyles.test.ts` |
| B-2 | 标题使用整行底部分隔线并保留内部行内样式 | `tests/typoraSeamlessEditing.test.ts` |
| B-2、A-1 | 标题分隔线比表格边框更浅且使用独立主题颜色 | `tests/typoraSeamlessEditing.test.ts` |
| B-3 | 引用块使用更浅的面板背景 | `tests/typoraSeamlessEditing.test.ts` |
| B-4 | 正文块使用 Typora 风格间距且无序列表符号按层级展示 | `tests/typoraSeamlessEditing.test.ts` |
| W-7 | App uses a Typora-style single editor surface without an extra document strip | `tests/typoraUi.test.ts` |
| W-7 | AppSidebar keeps the Typora-style three-mode left rail | `tests/typoraUi.test.ts` |
| W-7 | sidebar and editor share one responsive width and one dedicated divider | `tests/typoraUi.test.ts` |
| B-6 | keeps the Typora-sized control stable and contained on narrow editors | `component-tests/CodeFenceLanguageSelector.test.ts` |
| B-6 | keeps the active language control outside code block layout flow | `component-tests/ContinuousMarkdownEditorCodeLanguage.test.ts` |
| A-1 | keeps every editor dark rule scoped below the theme root | `component-tests/ContinuousMarkdownEditorDarkThemeStyles.test.ts` |
| A-1 | preserves the dark table and pre backgrounds after scoped compilation | `component-tests/ContinuousMarkdownEditorDarkThemeStyles.test.ts` |
| B-3、B-4、B-6、M-1 | 让三条路径的代码正文与行号使用相同行高 | `component-tests/ContinuousMarkdownEditorTyporaSpacingRegression.test.ts` |
| B-3、B-4、B-6、M-1 | 让文档首块列表使用正常块间距 | `component-tests/ContinuousMarkdownEditorTyporaSpacingRegression.test.ts` |
| B-3、B-4、B-6、M-1 | 让独占图片与链接图片保持居中和上下块间距 | `component-tests/ContinuousMarkdownEditorTyporaSpacingRegression.test.ts` |
| B-3、B-4、B-6、M-1 | keeps only the quoted blank line spacing before a quoted list | `component-tests/ContinuousMarkdownEditorTyporaSpacingRegression.test.ts` |
| B-3、B-4、B-6、M-1 | collapses quoted blank spacing before block widgets that own spacing | `component-tests/ContinuousMarkdownEditorTyporaSpacingRegression.test.ts` |
| B-5 | $name 隐藏有序任务序号并保持复选框独立定位 | `component-tests/OrderedTaskListRendering.test.ts` |
| A-1、B 章、M-7 | 为 Continuous 原始 HTML 提供完整块级和行内排版 | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | 统一三条路径的 TOC 链接、一级字重和窄屏缩进 | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | 统一三条路径的脚注引用胶囊与左右间距 | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | 统一正文各路径和表格单元格的选区，并让绘制光标继承正文颜色 | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | keeps alert icons inline across all rendered paths | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | 恢复 Preview 和 Rich 的表格、Front Matter 与引用边缘布局 | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | 关闭代码换行时只让 Continuous 代码源码行保持单行 | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | keeps generic figures, raw pre wrapping and block margins aligned | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | keeps raw media inside the reading column across rendered paths | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | uses the same half-em paragraph spacing inside list items | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | positions rendered task checkboxes like Typora | `component-tests/TyporaBodySemanticStyles.test.ts` |
| A-1、B 章、M-7 | preserves multiline headings and compacts nested rendered blocks | `component-tests/TyporaBodySemanticStyles.test.ts` |

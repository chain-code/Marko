# Marko Working Agreement

> 本仓唯一的工作约定正文，Claude Code 与 Codex 共用：Claude Code 经根 `CLAUDE.md` 的 `@import` 自动加载；Codex 不展开 `@import`，由根 `AGENTS.md` 指引开工前读取本文件。修改只改这里，入口文件不复制正文。

Marko 是 Typora 的功能复刻：Electron + Vue 3 + Tiptap（ProseMirror）的桌面 Markdown 编辑器，支持 Windows、Apple Silicon 的 macOS 和 Linux；根目录同时是对外的编辑器库（K-1）。做什么以 `docs/features.md` 为准，怎么做以 `docs/architecture.md` 为准。

## 仓库

- npm workspaces（不是 pnpm）：`packages/`（shared、markdown、render、editor、editor-vue、themes）和 `apps/desktop`（main、preload、renderer）。各包的职责和目录见 `docs/architecture.md` 1.3、1.12 节。
- 文档：`docs/architecture.md`（第 1、3 章）和 `docs/features.md`（第 2 章）是活文档，只写现在的做法，不写改动的历史；`docs/重构计划.md` 是 2026-11 重构的记录，冻结，只修指向。代码注释里的「1.10 节」指 architecture.md 的节，`W-5` 这类是 features.md 的功能编号；它们被注释引用着，不重排。
- 远端：`github`（GitHub 上的 chain-code/Marko）是 `main` 跟踪的远端，CI 和发布都在这里；`origin` 是只有最早一次提交的 GitLab 镜像，不推。
- CI（`.github/workflows/ci.yml`）在每个 PR 和推到 main 的提交上跑 check、单元测试、端到端测试、交互测试；发布流程（`release.yml`）推版本号标签时打三个平台的包并发布，改了打包配置推到 main 时只打包、不发布。

## 按需参考

命中场景再读，不命中不读：

| 场景 | 读什么 |
|---|---|
| 加功能、改行为、改设计 | `docs/features.md`（功能和验收条件）、`docs/architecture.md`（第 3 章：功能落在哪些模块） |
| 改进程边界、IPC 接口、路径范围、CSP、Fuses、依赖方向、数据归属、主进程的打包 | `.harness/invariants.yaml` + `docs/architecture.md` 对应的节 |
| 测试偶发失败、CI 或发布失败、打包出问题、在 Windows 上写脚本 | `.harness/known-issues.md` |
| 要知道 Typora 怎么做 | 下面《和 Typora 对比》 |

## 做事原则

1. **尽量简单，不过度发挥**：只做当前需求要的改动，不加需求没要的抽象、配置项和可选分支；同一功能取改动最小、和仓内既有写法一致的写法。边界风险写进交付说明，不擅自扩大范围。
2. **复用开源优先**：界面用 Element Plus 的组件，编辑器、Electron、数据处理先找成熟的库；自己写之前在计划里用一句话说明现成的为什么不行（现在自己写的主要是无损的 Markdown 文档模型）。
3. **对齐 Typora**：行为以 Typora 为准，features.md 的验收条件就是按 Typora 定的；拿不准 Typora 怎么做时实际打开对比，不凭印象。
4. **文档先行**：改功能、分层、数据归属、接口、目录时，先改 `docs/features.md` / `docs/architecture.md` 再改代码（两份文档开头的「使用规则」）。文档照现有的写法：中文短句、编号的章节、功能编号下的要点就是验收条件；写进去的结论先对着代码核实，核不了的标〔待确认〕。
5. **用户纠正方向时整体重来**：用户说「实际不是 X，是 Y」时，推翻当前假设、从入口重新分析，不在原方向上继续细化。

## 决策边界

以下几类先经用户确认再动手：

- git 的 commit、push（包括推 main）；推版本号标签（会触发发布，见 `.harness/release/SKILL.md`）
- 改编辑器库的对外接口（K-1：导入路径和 API 不变）
- 改安全边界：路径范围（`scope.ts`，X-1）、CSP、Fuses、沙箱、网页权限、IPC 的校验（architecture.md 1.10 节）
- 换框架、构建或打包工具，升级 Electron 的大版本
- 签名证书、令牌这类敏感配置（GitHub 的 secrets）
- 删除、覆盖用户的文件；结束不是自己启动的进程

清单之外：

- 需求目标或范围不明、且无法从代码和文档确认时再问；条件给了以后，命名、落点、内部结构按「复用现有结构、最简单」自己定，交付时说明。
- 本地没有副作用的验证直接跑（《验证》里的命令）。失败先判断是不是这次改动引起的：是就修了再跑；不是（偶发、环境问题）就如实说明，不顺手改无关的代码。
- 默认不开子 agent，串行执行。

## Git

- 不建分支，直接在本地 `main` 上改。
- 不自动 add、commit、push，不夹带任务外的改动。用户要提交时在 `main` 上提交、推到 `github`。
- 提交信息用中文：第一行「<范围>：<做了什么>」（如「发布流程：……」「CI：……」），正文按条写原因。

## 验证

| 命令 | 跑什么 |
|---|---|
| `npm run check` | 类型检查（tsc、vue-tsc）和依赖方向（dependency-cruiser） |
| `npm test` | 各包的单元测试、行为规格、组件测试 |
| `npm run test:e2e` | 构建桌面应用，再用 Playwright 跑端到端（会开 Electron 窗口） |
| `npm run test:interaction` | 编辑器的交互测试（编辑器测试页 + 本机的 Edge） |
| `npm run test:e2e:packaged` | 在仓库外的临时目录打包，在包上跑端到端，跑完删掉 |
| `npm run test:visual` | 视觉基准：截图和基准图比 |
| `npm run verify` | check + test + 端到端 |

- 先跑覆盖这次改动的测试，交付前跑 CI 会跑的那几项（`npm run verify`、`npm run test:interaction`）。只改了文档的不用跑。
- 失败的测试修代码或修测试，不跳过、不删测试（architecture.md 1.13 节）。
- 测试不能有副作用：打印、系统对话框、原生右键菜单换成假的；不碰系统剪贴板；`shell.trashItem` 换成直接删临时目录；Pandoc 用假程序；拼写词典的读写换成假的；不连 GitHub（`MARKO_NO_UPDATE=1`）；`userData` 用临时目录。不运行 NSIS 安装程序。
- 后台跑的长任务被系统结束时如实说明，用户要求了再重跑。
- 临时文件不放进仓库：用系统的临时目录，或者仓库里 `.tmp-` 开头的目录（已忽略）。

## 和 Typora 对比

- Typora 读写的是用户真实的配置目录（Windows 上是 `%APPDATA%\Typora`）：尽量少启动；用户自己的 Typora 开着时不启动；对比完清掉它的最近文件等历史。
- 对比用的文档自己造，放在临时目录，不打开用户的文档。
- Typora 装在哪儿问用户；本机路径不写进仓库的文件。

## 隐私

仓库在 GitHub 上公开。提交的文件、截图、发给外部服务的请求里，不出现用户的邮箱、本机用户名和本机的绝对路径；截图前隐藏状态栏里的文件路径。

## 交付

- 回复、进度说明、最终总结都用中文。
- 说明做了什么、为什么这样做、跑了哪些验证（结果如实，失败附输出）、还有什么残余风险。
- 改了文件的回复，末尾列出改动的文件，附一条建议的提交信息（格式见《Git》）。
- 给用户执行的命令：每条一行、单独放一个代码块，复制即可运行；不用 `\` 或反引号续行。

## 画图

- 简单图（约 5 个节点以内、单层）在回复里用字符图或 mermaid 代码块画，不建文件。
- 复杂图写成 HTML，放在仓库里 `.tmp-` 开头的目录，回复里给可以直接点开的 `file:///` 绝对路径链接。
- 不用 claude.ai 的页面（Artifact、Claude Docs）或其他在线托管、在线渲染的页面出图。

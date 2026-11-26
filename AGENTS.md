# AGENTS.md

本仓工作约定正文在 `.harness/agent-protocol/working-agreement.md`（与 Claude Code 共用）。Codex 不展开 `@import`，所以开始任务前先完整读一遍该文件，按其中约定执行。

只在该文件里修改约定，不往本文件复制正文。

以下入口与 Claude Code 共用同一份正文，动手前先完整读对应文件：

- 用户说「发版」「发布新版本」「发 x.y.z」「打 x.y.z 的标签」「版本推送」「推版本」→ `.harness/release/SKILL.md`（改版本号、写发布说明、推 main 等 CI 和打包试跑、打标签触发发布、盯运行、核对 GitHub Release）。

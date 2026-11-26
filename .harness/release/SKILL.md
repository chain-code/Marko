---
name: release
description: 发布 Marko 的新版本：改版本号、写发布说明，推到 main 等 CI 和打包试跑通过，打版本号标签（不带 v）触发 GitHub 的发布流程，等它跑完，核对 GitHub Release 上的文件。当用户说「发版」「发布新版本」「发 x.y.z」「打 x.y.z 的标签」「版本推送」「推版本」时使用。
---

# 发布新版本

**交付结果是 GitHub Release 上的正式版本**：三个平台的安装包、校验文件、自动更新用的 `latest*.yml` 都在，`releases/latest` 指向它。推了标签不等于发布完成，要等发布流程跑完并核对。

推标签会触发发布，发出去用户就能下载、自动更新到。用户明确说了发哪个版本才做。用户要求发版，就同意了这次发布要的提交和推送：版本号、发布说明、标签，以及为了让发布跑通对工作流、打包配置的修改（汇报里逐条说明）；别的代码改动和移标签仍按工作约定《决策边界》先问。

## 发布流程做了什么

`.github/workflows/release.yml`：

- `verify-version`：根目录和 `apps/desktop` 的 `package.json` 版本一致；推标签时标签必须等于这个版本，且有 `.github/release-notes/<版本>.md`。
- `build`：Windows（`windows-latest`）、macOS（`macos-latest`，Apple Silicon）、Linux（`ubuntu-22.04`）各自 `npm ci`、打包，再检查产物齐全，macOS 上校验签名。失败时日志的最后 40 行写成标注。
- `publish`：只在推标签时跑，三个平台都成功才跑：`gh release create`，正文取发布说明，附上所有产物和 LICENSE。
- 推到 main 时，改了打包的配置（这个工作流、`.github/scripts/`、`apps/desktop/electron-builder.yml`、`apps/desktop/build/`、`apps/desktop/package.json`）也跑 `verify-version` 和 `build`，不发布。改版本号会改到 `apps/desktop/package.json`，所以版本号的提交推上去就会先试打一遍包。

## 流程

脚本都在 `.harness/release/scripts/`，完整的命令见《命令》。

| 步 | 谁做 | 做什么 |
|---|---|---|
| ① | agent | 确认起点：`main` 上没有未提交的改动，本地和 `github/main` 一致；`git tag -l` 里还没有这个版本 |
| ② | agent | 改版本号（下面的命令），写发布说明 `.github/release-notes/<版本>.md` |
| ③ | agent | 提交，推到 `github` 的 main |
| ④ | 脚本 | 等 CI 和打包试跑，两个都要成功：`watch-run.mjs ci.yml main`、`watch-run.mjs release.yml main` |
| ⑤ | agent | 在这个提交上打附注标签、推送 |
| ⑥ | 脚本 | 等发布流程跑完：`watch-run.mjs release.yml <版本>` |
| ⑦ | 脚本 | 核对 Release：`verify-release.mjs <版本>` |
| ⑧ | agent | 汇报（见《完成前检查》） |

## 命令

改版本号。只有根目录和 `apps/desktop` 带版本号，其余包都是 `0.0.0`。不要用 `npm version -w …`：它会重新安装依赖（known-issues KI-031）。

```bash
npm pkg set version=2.0.1
```

```bash
npm pkg set version=2.0.1 -w @marko/desktop
```

```bash
npm install --package-lock-only --ignore-scripts
```

改完 `git diff` 应该只有两个 `package.json` 各一行、`package-lock.json` 三行。

发布说明照上一版（`.github/release-notes/2.0.0.md`）的结构用中文写：一句话概括、要注意的（`> [!IMPORTANT]`）、主要更新、下载说明；macOS 没配签名证书时写明第一次打开要在系统设置里允许、不能自动更新。

标签是 `X.Y.Z`，不带 `v`（同已有的 `1.0.0`、`1.1.0`、`2.0.0`；工作流按 `*.*.*` 触发），用附注标签，打在推上去的那个提交上：

```bash
git tag -a 2.0.1 -m "Marko 2.0.1"
```

```bash
git push github 2.0.1
```

等运行结束、核对：

```bash
node .harness/release/scripts/watch-run.mjs release.yml 2.0.1
```

```bash
node .harness/release/scripts/verify-release.mjs 2.0.1
```

- `watch-run.mjs <工作流文件> <标签，或 main>`：找这次推送触发的运行，两分钟查一次，结束后打出每个任务的结果、失败的步骤和标注；结论不是 success 时退出码为 1。给标签时按标签找；给 `main` 时按 `github/main` 现在的提交找。
- `verify-release.mjs <版本> [--hash]`：核对 Release 不是草稿、不是预发布，文件齐全、都传完了，三个 `latest*.yml` 的版本、文件名、大小和实际文件一致，`.sha256` 的格式对，正文和仓库里的发布说明一致，`releases/latest` 指向它；有问题时退出码为 1。`--hash` 时再下载安装包核对 sha512、sha256（约 600 MB）。
- 两个脚本都用 GitHub 的公开 API，不带凭据时每小时 60 次；设了 `GITHUB_TOKEN` 环境变量就带上它。

## 失败了怎么办

- 先看 `watch-run.mjs` 打出来的标注：打包、检查失败时有日志的最后 40 行。`npm ci` 这类步骤失败只有退出码，这时请用户看日志（KI-001）。
- 偶发的（网络、排队）：请用户在 Actions 页面点 Re-run failed jobs，本机触发不了重跑。
- 要改工作流或代码的：改好、提交、推 main（改了打包配置会自动试打包），试打通过以后再发。标签已经推了的：
  1. 确认这个版本还没有 Release：`verify-release.mjs` 报「还没有 Release」。
  2. 告诉用户要把标签移到新提交上，确认后删掉远程标签、在新提交上重打、再推：

     ```bash
     git push github --delete 2.0.1
     ```

     ```bash
     git tag -d 2.0.1
     ```

     ```bash
     git tag -a 2.0.1 -m "Marko 2.0.1" <新提交>
     ```

     ```bash
     git push github 2.0.1
     ```

  已经有 Release 的版本不移标签，改发下一个版本号。
- 已经遇到过的看 `.harness/known-issues.md`：签名变量是空字符串（KI-002）、macOS 的 ad-hoc 签名（KI-003）、文件名带斜杠（KI-004）、runner 镜像下线（KI-005）。

## 完成前检查

1. 发布流程的五个任务（verify-version、三个 build、publish）都成功。
2. `verify-release.mjs` 打印「全部核对通过」。
3. 版本号的提交在 `github` 的 main 上，CI 是绿的。
4. 汇报里给出 Release 的链接、各平台的安装包，没配签名证书时说明 macOS 的限制。

## 已知限制

1. macOS 没配签名证书时是 ad-hoc 签名：第一次打开要在「系统设置 > 隐私与安全性」里允许，不能自动更新（KI-003）。要签名：在仓库的 secrets 里加 `MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`；再加 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` 就公证。工作流配了就用。
2. macOS、Linux 的包只在 CI 上打包、校验过签名，没有在真机上装过；Windows 的安装程序也不在开发机上运行（工作约定《验证》）。
3. 本机没有 GitHub 令牌：看不到日志、下不了 artifact、不能手动触发和重跑（KI-001）。

# Known Issues / 排障模式

> 按需读：测试偶发失败、CI 或发布失败、打包出问题，或者在 Windows 上写脚本时。每条是一个**模式**：现象 → 根因 → 排查/处置。
> 新增条目只记可复用的模式，不记一次性事故的经过和修复状态。

## 发布与 CI

### KI-001 看不到 GitHub Actions 的日志
- 本机没有 `gh`，也没有 GitHub 令牌：`git push` 走 SSH 能用，API 只能匿名调用（每小时 60 次）。运行、任务、步骤和标注（`check-runs/<任务 id>/annotations`）读得到；日志返回 403「Must have admin rights」，artifact 下载不了，`workflow_dispatch` 和重跑都触发不了。
- 所以失败要写成标注才看得到：CI 上的端到端测试用 Playwright 的 `github` 报告器；发布流程打包、检查失败时由 `.github/scripts/annotate-tail.mjs` 把日志的最后 40 行写成标注。`.harness/release/scripts/watch-run.mjs` 等运行结束后把它们打出来。
- 真要日志、要重跑时请用户在 Actions 页面操作（他有仓库的管理权限）。

### KI-002 macOS 打包报 `… not a file`
- 根因：`CSC_LINK` 是空字符串（工作流里没配的 secret 就是空字符串）。electron-builder 只把 `null` 当成没设，空字符串当成证书的路径，按项目目录解析，报这个目录 not a file。
- 处置：签名用的变量只在 secret 有值时 export（`release.yml` 的打包步骤），不写成 `CSC_LINK: ${{ secrets.X }}` 这样直接映射。

### KI-003 没有证书的 macOS 包在 Apple Silicon 上打不开
- 根因：electron-builder 找不到证书时整个跳过签名（它的文档写明没有自动的 ad-hoc 回退），而改 Fuses 改了 Electron 的二进制，原来的签名就失效了。
- 处置：没有证书时加 `-c.mac.identity=- -c.mac.hardenedRuntime=false`。ad-hoc 签名没有 Team ID，hardened runtime 的库校验会拒绝加载 Electron 的框架，所以不开。打完用 `codesign --verify --deep --strict` 校验整个 .app；`codesign --display --verbose=2` 里应是 `Signature=adhoc`。
- ad-hoc 签名的版本第一次打开要在「系统设置 > 隐私与安全性」里允许，也不能自动更新（Squirrel.Mac 要求新版本的签名和装着的版本对得上）。

### KI-004 deb 没有传到 Release 上
- 根因：deb 默认的文件名是 `${name}_${version}_${arch}.deb`，`${name}` 取 package.json 的 name。`@marko/desktop` 带斜杠，文件成了 `release/@marko/desktop_….deb`，上传用的 `release/*.deb` 匹配不到，也不报错。
- 处置：`electron-builder.yml` 里把 `deb.artifactName` 写成 `marko_${version}_${arch}.${ext}`。新加打包目标时，看它默认的文件名里有没有 `${name}`。

### KI-005 任务没开始就被取消：`The configuration '…' is not supported`
- 根因：GitHub 下线了那个 runner 镜像（例：`macos-14` 在 2026-11-02 下线）。只有用它的任务被取消，其余照常跑；发布任务要所有打包成功才跑，于是跳过。
- 处置：到 actions/runner-images 的 README 看现在支持的标签。macOS 用 `macos-latest`：一直指向最新的 Apple Silicon 镜像（要 arm64：npm 只装本机架构的原生子包，`electron-builder.yml` 拷的是 darwin-arm64 的）。

### KI-006 端到端测试只在 CI 上偶发失败
- CI 的机器慢，窗口不一定在前面。CI 上 Playwright 失败重试一次（报告里标成 flaky），失败的测试和行号写成标注，失败时上传 `test/e2e/results/`。
- 排查：先看标注里是哪个测试、哪一行、在等什么；本地用 `--repeat-each` 跑这个测试，再设法造出 CI 上的条件（顺序、时机）复现，不只是加重试。下面《端到端测试》是已经遇到过的。

## 端到端测试

### KI-010 列表行数的断言在 CI 上偶尔少了
- 根因：全局搜索的结果是 Element Plus 的 `ElTreeV2`（虚拟滚动），只画看得见的行；结果的先后是 ripgrep 搜完的先后（多线程，不固定）。大文件排在前面时，它展开的行把后面的文件挤出可见区，DOM 里就没有那一行。
- 处置：总数用状态里的汇总（「n 个文件中找到 m 处」）断言；要看某一行时先收起前面的或滚动到它，不假设顺序。别的虚拟列表同理。

### KI-011 `sendInputEvent` 发出去的按键没反应
- 根因：Electron 的 `sendInputEvent` 要窗口有焦点，机器忙时窗口不一定在前面。
- 处置：发之前先让窗口和 webContents 拿到焦点（见 `test/e2e/fileops.spec.ts`）。

### KI-012 跟随系统深浅色的测试在深色系统上也是浅色
- 根因：Playwright 的 `electron.launch` 默认把 `prefers-color-scheme` 模拟成浅色。
- 处置：要跟系统时用 `launchApp(args, { systemColorScheme: true })`（传 `colorScheme: null`）。别的测试保留默认的浅色，结果不受这台机器的设置影响。

### KI-013 悬停提示偶尔没出来
- 处置：照 `test/e2e/editorui.spec.ts` 的 `hoverUntil`：鼠标先移开再悬停，在 `toPass` 里重试；不按坐标悬停（那个点可能被别的元素盖住）。

### KI-014 Windows 上删测试的临时目录报 EPERM
- 根因：应用刚退出时文件还被占着（杀毒软件、索引也会占）。
- 处置：`test/e2e/app.ts` 的 `remove()` 隔 300ms 重试，最多 40 次，还删不掉只打警告，不让测试失败。

## 编辑器与 Chromium

### KI-020 空段落里快速输入时光标跑到字前面
- 根因：Chromium 在只有占位 `<br>` 的空段落里，有时把字插在 `<br>` 前面，光标留在字前面。
- 处置：`packages/editor/src/plugins/textInput.ts` 接管这种普通输入，插入后把光标放到字后面。

### KI-021 SVG 画到 canvas 上以后导不出图片
- 根因：Mermaid 的文字在 `foreignObject` 里，画进 canvas 后 canvas 被标成「被污染」，读不出像素。
- 处置：交给 Pandoc 的图表在主进程截图（`apps/desktop/main/export.ts` 的 `captureDiagrams`）：不显示、不跑脚本的窗口里只放这张 SVG，`capturePage` 截成 PNG。放大用 CSS 的 `body{zoom:2}`，不用页面缩放（页面缩放按 `file://` 的源记住，会带到别的页面）。

### KI-022 双击图片、图表打不开大图
- 根因：第一下点击展开了源码，图往下挪了，第二下点不到图上，浏览器的 dblclick 目标就不是图。
- 处置：记住第一下 mousedown 点到的东西（`packages/editor-vue/src/MarkoEditor.vue` 的 `onMouseDownCapture`，800ms 内的第二下算双击）。

## 在 Windows 上写脚本

### KI-030 `node -e`、heredoc 里的反斜杠被改坏
- 根因：PowerShell 和 Git Bash 的转义规则不同，`node -e "…"`、heredoc 里的 `\\`、`\n`、正则常被改坏。
- 处置：多行的脚本写成文件再 `node <文件>`；路径用 `/` 或 `String.raw`。

### KI-031 `npm version -w …` 把 node_modules 重装了一遍
- 根因：带 workspace 参数的 `npm version` 会按锁文件重新安装依赖，没批准的安装脚本还会跳过，本地的 node_modules 可能因此不能用。
- 处置：改版本号用 `npm pkg set version=<版本>`（根目录、`-w @marko/desktop` 各一次），再 `npm install --package-lock-only --ignore-scripts` 只改锁文件（`.harness/release/SKILL.md`）。

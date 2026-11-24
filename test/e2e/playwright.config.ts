// 端到端测试：用 Playwright 驱动 Electron 应用（1.13 节）。先 `npm run build -w @marko/desktop`
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  outputDir: "./results",
  timeout: 60_000,
  // 刚构建完第一次启动（代码缓存是冷的、杀毒软件在扫新文件）时界面出来得慢，默认的 5 秒偶尔不够
  expect: { timeout: 10_000 },
  workers: 1,
  // CI 上：失败的测试同时写成 GitHub 的标注（检查结果里直接看到是哪个测试、哪一行、什么错）；机器慢，偶发的失败重跑一次（报告里标成 flaky）
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  retries: process.env.CI ? 1 : 0,
});

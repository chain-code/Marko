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
  reporter: [["list"]],
});

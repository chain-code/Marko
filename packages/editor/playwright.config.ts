// 编辑器的交互测试（1.13 节）：Playwright 打开测试页（playground/），点击、拖选、输入法组合、拖放、NodeView 的焦点、gapcursor。
// npm run test:interaction -w @marko/editor；用本机的 Edge（channel: msedge），不另装浏览器
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/interaction",
  testMatch: "**/*.spec.ts",
  outputDir: "test/interaction/results",
  timeout: 30_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    channel: "msedge",
    baseURL: "http://127.0.0.1:5183",
    viewport: { width: 1100, height: 900 },
  },
  webServer: {
    command: "npx vite --config playground/vite.config.ts",
    url: "http://127.0.0.1:5183",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

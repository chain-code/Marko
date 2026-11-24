// 视觉测试（1.13 节）：build-html.mjs 导出的 HTML 截图，和 baseline/ 里的基准图比。
// npm run test:visual；更新基准：npm run test:visual -- --update-snapshots
// 用本机的 Edge（channel: msedge），不另装浏览器；视口 1180 × 1000（Typora 对照图的窗口 1360 宽，减去侧栏）
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.visual.ts",
  outputDir: "./results",
  snapshotPathTemplate: "{testDir}/baseline/{arg}{ext}",
  timeout: 60_000,
  reporter: [["list"]],
  expect: {
    // 抗锯齿、字体微调带来的零星像素差不算
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.2, animations: "disabled" },
  },
  use: {
    channel: "msedge",
    viewport: { width: 1180, height: 1000 },
    deviceScaleFactor: 1,
  },
});

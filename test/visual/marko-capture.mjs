// 给 packages/render/test/visual-export.test.ts 生成的 HTML 截图（阶段 3 的视觉对照）。
// 用本机的 Edge（channel: msedge），不另装浏览器；playwright-core 用根目录装的（@playwright/test 带的），
// 也可以用 PLAYWRIGHT_CORE 指定别的：
//   PLAYWRIGHT_CORE=<playwright-core 包的目录> node test/visual/marko-capture.mjs <HTML 目录> <输出目录> [宽] [高]
// 视口默认 1180 × 1000：Typora 截图的窗口是 1360 × 1000，减去左边约 180 的侧栏
import { mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

const [htmlDir, outDir, widthArg, heightArg] = process.argv.slice(2);
if (!htmlDir || !outDir) {
  console.error("用法：node test/visual/marko-capture.mjs <HTML 目录> <输出目录> [宽] [高]");
  process.exit(1);
}
const playwright = process.env.PLAYWRIGHT_CORE
  ? await import(pathToFileURL(join(process.env.PLAYWRIGHT_CORE, "index.mjs")).href)
  : await import("playwright-core");
const { chromium } = playwright.default ?? playwright;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: Number(widthArg ?? 1180), height: Number(heightArg ?? 1000) } });
const files = readdirSync(htmlDir).filter((name) => name.endsWith(".html")).sort();
for (const file of files) {
  await page.goto(pathToFileURL(join(htmlDir, file)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(outDir, `${basename(file, ".html")}.png`) });
}
await browser.close();
console.log(`截了 ${files.length} 张 → ${outDir}`);

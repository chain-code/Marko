// 视觉测试（1.13 节）：每个语料片段在两个内置主题下的渲染和基准图比。HTML 由 build-html.mjs 生成
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const htmlDir = process.env.MARKO_VISUAL_OUT ?? fileURLToPath(new URL(".out/html", import.meta.url));
const files = existsSync(htmlDir)
  ? readdirSync(htmlDir)
      .filter((name) => name.endsWith(".html"))
      .sort()
  : [];

test("有要比的页面（先跑 build-html.mjs）", () => {
  expect(files.length).toBeGreaterThan(0);
});

for (const file of files) {
  const name = file.replace(/\.html$/, "");
  test(name, async ({ page }) => {
    await page.goto(pathToFileURL(join(htmlDir, file)).href);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`${name}.png`);
  });
}

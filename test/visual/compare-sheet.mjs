// 把 Typora 对照图和 Marko 的截图左右拼成一张，方便人工比对（阶段 3 的视觉对照）。
//   PLAYWRIGHT_CORE=<playwright-core 包的目录> node test/visual/compare-sheet.mjs <Marko 截图目录> <输出目录> [主题前缀]
// Typora 的图在 test/visual/typora/；Marko 的图名是 <主题>-<语料名>-<段号>.png
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [markoDir, outDir, theme = "solo"] = process.argv.slice(2);
const playwright = process.env.PLAYWRIGHT_CORE
  ? await import(pathToFileURL(join(process.env.PLAYWRIGHT_CORE, "index.mjs")).href)
  : await import("playwright-core");
const { chromium } = playwright.default ?? playwright;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1900, height: 900 } });
const typoraDir = join(here, "typora");
let count = 0;
for (const file of readdirSync(typoraDir).filter((name) => name.endsWith(".png")).sort()) {
  const marko = join(markoDir, `${theme}-${file}`);
  if (!existsSync(marko)) continue;
  const sheet = join(outDir, `${file}.html`);
  writeFileSync(
    sheet,
    `<!doctype html><meta charset="utf-8"><style>body{margin:0;display:flex;gap:8px;background:#888}figure{margin:0;flex:1}img{width:100%;display:block}figcaption{font:14px sans-serif;color:#fff;padding:2px 6px}</style>` +
      `<figure><figcaption>Typora 1.14.15 · ${file}</figcaption><img src="${pathToFileURL(join(typoraDir, file)).href}"></figure>` +
      `<figure><figcaption>Marko · ${theme}</figcaption><img src="${pathToFileURL(marko).href}"></figure>`,
  );
  await page.goto(pathToFileURL(sheet).href);
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await page.screenshot({ path: join(outDir, file), fullPage: true });
  count += 1;
}
await browser.close();
console.log(`拼了 ${count} 张 → ${outDir}`);

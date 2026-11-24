// X-3 性能（阶段 4）：新编辑器在测试页（packages/editor/playground）里打开 10 万字文档的时间、输入和移动光标的延迟，
// 文档和测法同旧版本的基线（legacy-baseline.mjs，4.2 节）。
//
// 用法：
//   npm run playground -w @marko/editor          （另开一个终端，测试页在 http://127.0.0.1:5183）
//   node test/perf/editor-perf.mjs [地址] [结果文件]
// 用本机的 Edge（channel: msedge）
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { buildPerfDocument } from "./document.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:5183/?source=0&doc=empty";
const output = process.argv[3];

function summarize(samples) {
  if (samples.length === 0) return { count: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    count: sorted.length,
    median: Math.round(pick(0.5) * 10) / 10,
    p95: Math.round(pick(0.95) * 10) / 10,
    max: Math.round(sorted[sorted.length - 1] * 10) / 10,
    over16: sorted.filter((value) => value > 16).length,
  };
}

const documentInfo = buildPerfDocument();
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1360, height: 880 } });
await page.goto(url);
await page.waitForFunction(() => window.markoTest !== undefined);

// 打开：换整篇（解析、建文档、画出来）到下一帧
const openMs = await page.evaluate(async (text) => {
  const start = performance.now();
  window.markoTest.setMarkdown(text, { anchor: 0, head: 0 });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return Math.round(performance.now() - start);
}, documentInfo.text);

await page.evaluate(() => {
  window.__frameSamples = [];
  window.__slowEvents = [];
  document.addEventListener(
    "keydown",
    (event) => {
      const start = event.timeStamp;
      requestAnimationFrame(() => window.__frameSamples.push({ key: event.key, ms: performance.now() - start }));
    },
    true,
  );
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__slowEvents.push({ name: entry.name, duration: entry.duration, processing: entry.processingEnd - entry.processingStart });
    }
  }).observe({ type: "event", durationThreshold: 16 });
});

// 两次按键之间等一会儿，测的是单次按键的延迟，不含排队
const KEY_INTERVAL_MS = 300;
async function pressSpaced(key, times) {
  for (let index = 0; index < times; index += 1) {
    await page.keyboard.press(key);
    await page.waitForTimeout(KEY_INTERVAL_MS);
  }
}
async function typeSpaced(text) {
  for (const character of text) {
    await page.keyboard.type(character);
    await page.waitForTimeout(KEY_INTERVAL_MS);
  }
}

async function measure(label, action) {
  await page.evaluate(() => {
    window.__frameSamples = [];
    window.__slowEvents = [];
  });
  await action();
  await page.waitForTimeout(400);
  const { frames, slow } = await page.evaluate(() => ({ frames: window.__frameSamples, slow: window.__slowEvents }));
  const keyEvents = slow.filter((entry) => ["keydown", "keypress", "beforeinput", "input"].includes(entry.name));
  return {
    label,
    keyToFrame: summarize(frames.map((sample) => sample.ms)),
    slowEventDuration: summarize(keyEvents.map((entry) => entry.duration)),
  };
}

/** 光标放到第 index 个顶层块里 */
async function cursorInBlock(where) {
  await page.evaluate((position) => {
    const { editor } = window.markoTest;
    const doc = editor.state.doc;
    const index = position === "end" ? doc.childCount - 1 : Math.floor(doc.childCount / 2);
    let pos = 0;
    for (let child = 0; child < index; child += 1) pos += doc.child(child).nodeSize;
    editor.commands.setTextSelection(pos + doc.child(index).nodeSize - 1);
    editor.commands.scrollIntoView();
    editor.view.focus();
  }, where);
  await page.waitForTimeout(KEY_INTERVAL_MS);
}

const results = [];
await page.evaluate(() => {
  window.markoTest.editor.commands.focus("start");
});
results.push(await measure("PageDown ×12（从开头往下翻）", () => pressSpaced("PageDown", 12)));
await cursorInBlock("middle");
results.push(await measure("ArrowDown ×15（文档中部）", () => pressSpaced("ArrowDown", 15)));
results.push(await measure("ArrowRight ×15（文档中部）", () => pressSpaced("ArrowRight", 15)));
await cursorInBlock("middle");
results.push(await measure("输入 15 个字母（文档中部）", () => typeSpaced("abcdefghijklmno")));
await cursorInBlock("end");
results.push(await measure("输入 15 个字母（文档末尾）", () => typeSpaced("abcdefghijklmno")));
results.push(await measure("ArrowUp ×15（文档末尾）", () => pressSpaced("ArrowUp", 15)));

await browser.close();

const report = {
  url,
  browser: "Edge（headless）",
  document: { chars: documentInfo.chars, blocks: documentInfo.blocks },
  openMs,
  results,
};
const json = JSON.stringify(report, null, 2);
if (output) writeFileSync(output, json);
console.log(json);

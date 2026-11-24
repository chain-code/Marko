// 端到端（D-1、阶段 3 留下的核对）：MathJax 的字体文件各成一块、用到哪一块才加载。
// 先打开只有普通公式的文档，再在同一个窗口里打开用花体的文档：花体那一块这时才去取（要是之前就加载过，模块有缓存，就不会再取）
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-math-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test("D-1：普通的公式不加载花体、盲文这些字体块；打开用花体的文档时才加载那一块", async () => {
  writeFileSync(join(dir, "plain.md"), "# 普通\n\n$x^2 + y^2$\n");
  writeFileSync(join(dir, "fancy.md"), "# 花体\n\n$\\mathcal{A} + \\mathcal{B}$\n");
  launched = await launchApp([join(dir, "plain.md")]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write mjx-container");
  const requested: string[] = [];
  window.on("request", (request) => requested.push(request.url().replace(/^.*\//, "")));
  const chunk = (prefix: string) => requested.some((name) => new RegExp(`^${prefix}-[\\w-]{8}\\.js$`).test(name));

  // 工作区里点另一个文件：在这个窗口里换
  await app.app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, dir);
  await app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: "workspace.open" }));
  await window.getByTestId("file-tree").locator(".file-tree-item", { hasText: "fancy.md" }).click();
  await expect(window.locator("#write h1")).toHaveText("花体");
  await window.waitForSelector("#write mjx-container");
  await expect.poll(() => chunk("calligraphic"), { timeout: 15_000 }).toBe(true);
  expect(chunk("braille")).toBe(false);
  expect(chunk("cherokee")).toBe(false);
});

test("E 章：空段落开头快速输入 $，后面的字不跑到 $ 前面（Chromium 偶尔把光标留在刚插的字前面）", async () => {
  const file = join(dir, "typing.md");
  writeFileSync(file, "# Doc\n\nx\n");
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write h1");
  await window.locator("#write p").click();
  // 时序问题：修之前十来轮里总有几轮出错
  const typed: string[] = [];
  for (let round = 0; round < 12; round += 1) {
    await window.keyboard.press("Control+End");
    await window.keyboard.press("Enter");
    await window.keyboard.type(round % 2 ? "$mat" : "$x$ y");
    await window.waitForTimeout(100);
    typed.push(await window.evaluate(() => document.querySelector("#write > :last-child")?.textContent ?? ""));
  }
  expect(typed).toEqual(Array.from({ length: 12 }, (_, round) => (round % 2 ? "$mat" : "$x$ y")));
  // 保存：退出时不停在未保存确认上（不用强行结束进程）
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: "file.save" }));
  await expect.poll(() => launched!.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? "")).toBe("typing.md - Marko");
});

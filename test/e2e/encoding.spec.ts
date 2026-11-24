// 端到端（F-18）：识别编码、状态栏显示；「文件 → 以其他编码重新打开」；识别不出时状态栏提示
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import iconv from "iconv-lite";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-encoding-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menu(app: LaunchedApp, id: string, argument?: string): Promise<void> {
  await app.app.evaluate(
    ({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", command),
    argument === undefined ? { id } : { id, argument },
  );
}

test("F-18：GB18030 认得出、状态栏显示；换成 UTF-8 重新打开是乱码，换回来恢复", async () => {
  const file = join(dir, "gbk.md");
  const text = "这是一段用来识别编码的中文正文，内容要稍微长一点才能认得准。";
  writeFileSync(file, iconv.encode(`# 中文标题\n\n${text}\n`, "gb18030"));
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  await expect(window.locator("#write h1")).toHaveText("中文标题");
  await expect(window.getByTestId("status-encoding")).toHaveText("GB18030");

  // 菜单里有这一项（12 种编码）
  const encodings = await app.app.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()?.items.find((item) => item.label === "文件");
    return file?.submenu?.items.find((item) => item.label === "以其他编码重新打开")?.submenu?.items.length ?? 0;
  });
  expect(encodings).toBe(12);

  await menu(app, "file.reopenWithEncoding", "utf-8");
  await expect(window.locator("#write h1")).not.toHaveText("中文标题");
  await expect(window.getByTestId("status-encoding")).toHaveCount(0);
  await menu(app, "file.reopenWithEncoding", "gb18030");
  await expect(window.locator("#write h1")).toHaveText("中文标题");
  await expect(window.locator("#write p")).toHaveText(text);
});

test("F-18：识别不出编码时按 UTF-8 打开，状态栏提示", async () => {
  const file = join(dir, "unknown.md");
  writeFileSync(file, Buffer.from([0x23, 0x20, 0xff, 0x00, 0x9f, 0x8f, 0x0a]));
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write");
  await expect(window.getByTestId("status-encoding")).toContainText("编码识别不出");
});

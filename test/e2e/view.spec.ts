// 端到端（V 章、R-5）：字数统计、关于、缩放（所有窗口一起）、窗口置顶
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { desktopDir, launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-view-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: command }), id);
}

/** 点原生菜单里的这一项（同用户点菜单） */
async function clickMenuItem(app: LaunchedApp, label: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow, Menu }, wanted) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
      for (const item of items) {
        if (item.label === wanted) return item;
        const nested = item.submenu ? find(item.submenu.items) : null;
        if (nested) return nested;
      }
      return null;
    };
    const item = find(Menu.getApplicationMenu()?.items ?? []);
    if (!item) throw new Error(`菜单里没有「${wanted}」`);
    item.click(undefined, BrowserWindow.getAllWindows()[0]);
  }, label);
}

test("V-4、R-5：字数统计（中文一个字一个词）、光标行列；关于里有版本和许可证", async () => {
  const file = join(dir, "count.md");
  writeFileSync(file, "# 标题\n\n正文 hello world\n");
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write h1");
  await window.locator("#write p").click();
  await window.keyboard.press("End");
  await menu(launched, "view.wordCount");
  const panel = window.getByTestId("word-count-panel");
  await expect(panel).toContainText("词数6");
  await expect(panel).toContainText("字符数（不算空白）14");
  await expect(panel).toContainText("第 3 行，第 15 列");
  await window.keyboard.press("Escape");

  await menu(launched, "app.about");
  const about = window.getByTestId("about");
  // 版本号取应用自己的 package.json（发版改版本号时不用改测试）
  const { version } = JSON.parse(readFileSync(join(desktopDir, "package.json"), "utf8")) as { version: string };
  await expect(about).toContainText(`版本 ${version}`);
  await expect(about).toContainText("MIT");
});

test("V-5、V-7：缩放每次 5%，所有窗口一起、记在设置里；窗口置顶", async () => {
  launched = await launchApp();
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write");
  await window.evaluate(() => window.marko.window.newWindow());
  await expect.poll(() => app.app.windows().length).toBe(2);
  const zooms = () => app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((item) => Math.round(item.webContents.getZoomFactor() * 100)));

  await clickMenuItem(app, "放大");
  await clickMenuItem(app, "放大");
  await expect.poll(zooms).toEqual([110, 110]);
  expect(await window.evaluate(async () => (await window.marko.settings.get()).zoom)).toBe(1.1);
  await clickMenuItem(app, "实际大小");
  await expect.poll(zooms).toEqual([100, 100]);
  for (let index = 0; index < 12; index += 1) await clickMenuItem(app, "缩小");
  await expect.poll(zooms).toEqual([75, 75]);
  await clickMenuItem(app, "实际大小");

  const onTop = () => app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop());
  await clickMenuItem(app, "窗口置顶");
  await expect.poll(onTop).toBe(true);
  await clickMenuItem(app, "窗口置顶");
  await expect.poll(onTop).toBe(false);
});

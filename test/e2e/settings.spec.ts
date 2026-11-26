// 端到端（S 章）：偏好设置改了马上生效、所有窗口一起变、存在主进程里；恢复本节的默认设置
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-settings-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true });
});

test("S-1：改了马上生效，别的窗口跟着变；存在主进程；恢复本节的默认设置", async () => {
  const file = join(dir, "a.md");
  writeFileSync(file, "# 标题\n\n正文\n");
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write h1");
  // 再开一个空白窗口
  await window.evaluate(() => window.marko.window.newWindow());
  await expect.poll(() => launched!.app.windows().length).toBe(2);
  const other = launched.app.windows().find((page) => page !== window)!;
  await other.waitForSelector("#write");
  await expect(other.getByTestId("status-bar")).toBeVisible();

  await launched.app.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find((item) => item.getTitle().startsWith("a.md"));
    target?.webContents.send("marko:menu.command", { id: "app.preferences" });
  });
  const dialog = window.locator(".marko-settings");
  await expect(dialog).toBeVisible();

  // 文件：打开自动保存（下面看「恢复本节的默认设置」不动别的节）
  await expect(dialog.getByRole("tab", { name: "文件" })).toHaveAttribute("aria-selected", "true");
  await dialog.locator('[data-setting="autoSave"] input[type=checkbox]').check();
  await expect.poll(() => window.evaluate(async () => (await window.marko.settings.get()).autoSave)).toBe(true);

  // 外观 → 状态栏：关掉状态栏，两个窗口都没了
  await dialog.getByRole("tab", { name: "外观" }).click();
  await dialog.locator('[data-setting="showStatusBar"] input[type=checkbox]').uncheck();
  await expect(window.getByTestId("status-bar")).toBeHidden();
  await expect(other.getByTestId("status-bar")).toBeHidden();

  // 外观 → 字体大小 20
  const size = dialog.locator('[data-setting="fontSize"] input');
  await size.fill("20");
  await size.press("Enter");
  await expect.poll(() => window.locator("#write").evaluate((element) => getComputedStyle(element).fontSize)).toBe("20px");
  expect(await window.evaluate(async () => (await window.marko.settings.get()).fontSize)).toBe(20);

  // 恢复本节的默认设置：字体回到 16、状态栏回来；别的节（自动保存）不动
  await dialog.getByTestId("settings-reset").click();
  await expect.poll(() => window.locator("#write").evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
  await expect(window.getByTestId("status-bar")).toBeVisible();
  expect(await window.evaluate(async () => (await window.marko.settings.get()).autoSave)).toBe(true);

  // 查找（同 Typora）：没有匹配的节变淡，当前节没有匹配时跳到第一个有匹配的
  await dialog.getByTestId("settings-search").fill("自动保存");
  await expect(dialog.getByRole("tab", { name: "文件" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tab", { name: "外观" })).toHaveClass(/no-search-hit/);
  await expect(dialog.locator(".search-hit", { hasText: "自动保存" }).first()).toBeVisible();
  await dialog.getByTestId("settings-search").fill("");
  await dialog.getByRole("tab", { name: "外观" }).click();

  // 跟随系统深浅色：打开后才出现浅色、深色主题两项
  await expect(dialog.locator('[data-setting="lightTheme"]')).toHaveCount(0);
  await dialog.locator('[data-setting="followSystemTheme"] input[type=checkbox]').check();
  await expect(dialog.locator('[data-setting="lightTheme"]')).toBeVisible();
  await expect(dialog.locator('[data-setting="theme"]')).toHaveCount(0);
});

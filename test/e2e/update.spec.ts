// 端到端（R-4）：开发时运行、设了 MARKO_NO_UPDATE 的版本不检查更新（不连网）；「帮助 → 检查更新」只提示
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let launched: LaunchedApp | null = null;

test.afterEach(async () => {
  await launched?.close();
  launched = null;
});

test("R-4：这个版本不检查更新，手动检查只提示", async () => {
  launched = await launchApp([]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write");
  await app.app.evaluate(({ BrowserWindow, Menu }) => {
    const help = Menu.getApplicationMenu()?.items.find((item) => item.label.replace(/\u200b/g, "") === (process.platform === "darwin" ? "帮助" : "帮助(&H)"));
    const check = help?.submenu?.items.find((item) => item.label === "检查更新…");
    if (!check) throw new Error("帮助菜单里没有「检查更新...」");
    check.click(undefined, BrowserWindow.getAllWindows()[0]);
  });
  await expect(window.locator(".el-message")).toContainText("不检查更新");
});

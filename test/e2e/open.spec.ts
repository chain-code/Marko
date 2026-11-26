// 端到端（F 章）：快速打开（F-4）、最近文件面板（F-5）
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-open-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true });
});

async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => {
    BrowserWindow.getFocusedWindow()?.webContents.send("marko:menu.command", { id: command });
  }, id);
}

async function windowCount(app: LaunchedApp): Promise<number> {
  return app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
}

test("F-4 快速打开：工作区里模糊找；回车按 F-3 的规则打开（空白窗口里直接开，否则新窗口）", async () => {
  mkdirSync(join(dir, "notes"));
  mkdirSync(join(dir, "daily"));
  writeFileSync(join(dir, "notes", "readme.md"), "# Readme\n");
  writeFileSync(join(dir, "daily", "2026-11-24.md"), "# 日记\n\n今天\n");
  writeFileSync(join(dir, "todo.md"), "- [ ] 待办\n");
  launched = await launchApp();
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write");
  await launched.app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, dir);
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: "workspace.open" }));
  await expect(window.getByTestId("file-tree").locator(".file-tree-item")).toHaveCount(3);

  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: "file.quickOpen" }));
  const input = window.getByTestId("quick-open-input");
  await expect(input).toBeFocused();
  const list = window.getByTestId("quick-open-list");
  await expect(list.locator(".quick-open-item")).toHaveCount(3);
  await input.pressSequentially("daily 24");
  await expect(list.locator(".quick-open-item").first()).toContainText("2026-11-24.md");
  // 命中的字高亮：名字里的「24」、目录里的「daily」
  await expect(list.locator(".quick-open-item.active mark")).toHaveText(["24", "daily"]);
  await input.press("Enter");
  await expect(window.locator("#write h1")).toHaveText("日记");
  expect(await windowCount(launched)).toBe(1);

  // 这个窗口已经有文档了：新开窗口。同上面一样等输入框拿到焦点再打字、等选中的是 todo.md 再回车
  // （上一次关的时候对话框的内容有关闭动画，完了才销毁：打得太早的字会丢，回车就打开了列表第一个、已经开着的文件）
  await menu(launched, "file.quickOpen");
  await expect(input).toBeFocused();
  await input.pressSequentially("todo");
  await input.press("ArrowDown");
  await input.press("ArrowUp");
  await expect(list.locator(".quick-open-item.active")).toContainText("todo.md");
  await input.press("Enter");
  await expect.poll(() => windowCount(launched!)).toBe(2);
  await expect(window.locator("#write h1")).toHaveText("日记");
});

test("F-5 最近文件面板：列出、搜索、移除、打开", async () => {
  const first = join(dir, "first.md");
  const second = join(dir, "second.md");
  writeFileSync(first, "first\n");
  writeFileSync(second, "second\n");
  launched = await launchApp([first]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write p");
  // 第二个文件用「打开」（对话框换成直接返回它）：按 F-3 在新窗口里打开，两个都进了最近文件
  await launched.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
  }, second);
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: "file.open" }));
  await expect.poll(() => windowCount(launched!)).toBe(2);

  await launched.app.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows().find((item) => item.getTitle().startsWith("first"));
    target?.webContents.send("marko:menu.command", { id: "file.showRecent" });
  });
  const list = window.getByTestId("recent-list");
  await expect(list.locator(".recent-name")).toHaveText(["second.md", "first.md"]);
  await window.getByTestId("recent-filter").fill("sec");
  await expect(list.locator(".recent-name")).toHaveText(["second.md"]);
  await list.getByRole("button", { name: "从最近文件移除 second.md" }).click();
  await expect(list.locator(".recent-name")).toHaveCount(0);
  await window.getByTestId("recent-filter").fill("");
  await expect(list.locator(".recent-name")).toHaveText(["first.md"]);
  // 打开：这个文件就在这个窗口里，切到它（不新开）
  await list.locator(".recent-main").first().click();
  await expect(list).toBeHidden();
  expect(await windowCount(launched)).toBe(2);
});

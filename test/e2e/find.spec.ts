// 端到端（N 章切片 3）：查找栏、替换
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-find-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true });
});

async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: command });
  }, id);
}

/**
 * 主进程往窗口里发按键：和真的按键一样，网页没处理的键再交给菜单的快捷键。
 * Playwright 的 keyboard.press 走调试协议，网页没处理的键不再交给菜单，测不到菜单快捷键
 */
async function pressKey(app: LaunchedApp, keyCode: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, code) => {
    // sendInputEvent 要窗口有焦点（Electron 的文档）：机器忙的时候窗口不一定在前面
    const target = BrowserWindow.getAllWindows()[0];
    target?.focus();
    target?.webContents.focus();
    const contents = target?.webContents;
    contents?.sendInputEvent({ type: "keyDown", keyCode: code });
    contents?.sendInputEvent({ type: "keyUp", keyCode: code });
  }, keyCode);
}

test("N-1、N-2：边输入边找、上一个下一个、滚到匹配；F3 只走一次；关掉后 F3 重新打开；全部替换一步撤销", async () => {
  const file = join(dir, "find.md");
  writeFileSync(file, `apple banana apple\n\n${"filler line\n\n".repeat(80)}cherry apple end\n`);
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write p");
  const app = launched;

  await menu(app, "find.open");
  const bar = window.getByTestId("find-bar");
  const input = window.getByTestId("find-input");
  const status = window.getByTestId("find-status");
  await expect(input).toBeFocused();
  await input.pressSequentially("apple");
  await expect(status).toHaveText("第 1 个，共 3 个");
  await expect(window.locator("#write .ProseMirror-search-match, #write .ProseMirror-active-search-match")).toHaveCount(3);
  await input.press("Enter");
  await expect(status).toHaveText("第 2 个，共 3 个");
  await input.press("F3");
  await expect(status).toHaveText("第 3 个，共 3 个");
  // 第三个在很下面：滚过去了（焦点在查找框里，编辑器自己不滚）
  const top = await window.locator("#write .ProseMirror-active-search-match").evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBeGreaterThan(0);
  expect(top).toBeLessThan(await window.evaluate(() => window.innerHeight));
  await input.press("Shift+Enter");
  await expect(status).toHaveText("第 2 个，共 3 个");

  // 焦点在编辑器里按 F3：编辑器处理了，菜单的 F3 不会再走一次（走两次会绕回第 1 个）
  await window.locator("#write").evaluate((element) => (element as HTMLElement).focus());
  await pressKey(app, "F3");
  await expect(status).toHaveText("第 3 个，共 3 个");
  await window.waitForTimeout(300);
  await expect(status).toHaveText("第 3 个，共 3 个");

  // Esc 关掉：高亮去掉
  await input.focus();
  await input.press("Escape");
  await expect(bar).toBeHidden();
  await expect(window.locator("#write .ProseMirror-search-match, #write .ProseMirror-active-search-match")).toHaveCount(0);
  // 关着时按 F3（编辑器里没有查找条件，走到菜单）：重新打开，上次的文字还在
  await pressKey(app, "F3");
  await expect(bar).toBeVisible();
  await expect(input).toHaveValue("apple");
  await expect(status).toContainText("共 3 个");

  // 全部替换：一步撤销
  await menu(app, "find.replace");
  await window.getByTestId("replace-input").fill("pear");
  await window.getByTestId("replace-all").click();
  await expect(status).toHaveText("没有找到");
  await expect(window.locator("#write p").first()).toHaveText("pear banana pear");
  await menu(app, "editor.undo");
  await expect(window.locator("#write p").first()).toHaveText("apple banana apple");
  await expect(window.locator("#write p").last()).toHaveText("cherry apple end");
});

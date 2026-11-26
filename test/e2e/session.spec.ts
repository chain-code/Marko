// 端到端（F-16、W-7）：再次启动时恢复上次的窗口、文档、工作区、侧栏；选「新建空白文档」时不恢复
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-session-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: command }), id);
}

async function windowTitles(app: LaunchedApp): Promise<string[]> {
  return app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.getTitle()).sort());
}

test("F-16：「启动时」选了恢复上次的窗口：退出后再启动，恢复文档、工作区和侧栏页签；关掉最后一个窗口也算", async () => {
  mkdirSync(join(dir, "notes"));
  const file = join(dir, "notes", "a.md");
  writeFileSync(file, "# A\n\ntext\n");
  writeFileSync(join(dir, "notes", "b.md"), "# B\n");
  launched = await launchApp([file]);
  const userData = launched.userData;
  let window = await launched.app.firstWindow();
  await window.waitForSelector("#write h1");
  // 「启动时」默认新建空白文档（同 Typora，S-3）
  await window.evaluate(() => window.marko.settings.set({ startup: "restore" }));
  await launched.app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, join(dir, "notes"));
  await menu(launched, "workspace.open");
  await expect(window.getByTestId("file-tree").locator(".file-tree-item")).toHaveText(["a.md", "b.md"]);
  await menu(launched, "view.outline");
  await expect(window.getByTestId("outline")).toBeVisible();
  // 侧栏的变化 300ms 后报给主进程，主进程再停 500ms 写会话
  await window.waitForTimeout(1_200);
  await launched.quit();

  launched = await launchApp([], { userData });
  window = await launched.app.firstWindow();
  await expect(window.locator("#write h1")).toHaveText("A");
  await expect.poll(() => windowTitles(launched!)).toEqual(["a.md - Marko"]);
  await expect(window.getByTestId("outline")).toBeVisible();
  await menu(launched, "view.fileTree");
  await expect(window.getByTestId("file-tree").locator(".file-tree-item")).toHaveText(["a.md", "b.md"]);

  // 关掉最后一个窗口（不是退出）：下次照样恢复它
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await launched.quit().catch(() => undefined);
  launched = await launchApp([], { userData });
  window = await launched.app.firstWindow();
  await expect(window.locator("#write h1")).toHaveText("A");
});

test("S-3「启动时：新建空白文档」：不恢复上次的窗口", async () => {
  const file = join(dir, "a.md");
  writeFileSync(file, "# A\n");
  launched = await launchApp([file]);
  const userData = launched.userData;
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write h1");
  await window.evaluate(() => window.marko.settings.set({ startup: "blank" }));
  await launched.quit();

  launched = await launchApp([], { userData });
  const restored = await launched.app.firstWindow();
  await restored.waitForSelector("#write");
  await expect.poll(() => windowTitles(launched!)).toEqual(["未命名.md - Marko"]);
});

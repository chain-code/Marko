// 端到端（W-1、W-2、W-5、S-4、V-3、V-4，阶段 5 核对补上的）：工作区子菜单、文件树的展开保持和键盘、在文件树中定位、
// 搜索一个文件太多时的提示、新窗口的默认侧栏、选区字数按显示的文字算、点字数打开字数统计
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-ws-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: command }), id);
}

async function title(app: LaunchedApp): Promise<string> {
  return app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? "");
}

const items = (window: Page) => window.getByTestId("file-tree").locator(".file-tree-item");

test("W-1：打开所在文件夹为工作区、关闭工作区；新窗口沿用工作区", async () => {
  writeFileSync(join(dir, "a.md"), "# A\n");
  writeFileSync(join(dir, "b.md"), "# B\n");
  launched = await launchApp([join(dir, "a.md")]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  await menu(app, "workspace.openContaining");
  await expect(items(window)).toHaveText(["a.md", "b.md"]);

  // 从这个窗口开的新窗口沿用工作区
  await window.evaluate(() => window.marko.window.newWindow());
  await expect.poll(() => app.app.windows().length).toBe(2);
  const other = app.app.windows().find((page) => page !== window)!;
  await other.waitForSelector("#write");
  await expect(items(other)).toHaveText(["a.md", "b.md"]);

  // 有两个窗口了：发给原来那个
  await app.app.evaluate(({ BrowserWindow }) => {
    const first = BrowserWindow.getAllWindows().find((item) => item.getTitle().startsWith("a.md"));
    first?.webContents.send("marko:menu.command", { id: "workspace.close" });
  });
  await expect(window.getByTestId("sidebar")).toContainText("还没有打开文件夹");
  await expect(items(other)).toHaveText(["a.md", "b.md"]);
});

test("W-2：工作区刷新后展开的文件夹不收起；键盘 ↓ 回车打开；在文件树中定位", async () => {
  mkdirSync(join(dir, "notes", "deep"), { recursive: true });
  writeFileSync(join(dir, "notes", "deep", "x.md"), "# X\n");
  writeFileSync(join(dir, "notes", "n.md"), "# N\n");
  writeFileSync(join(dir, "top.md"), "# Top\n");
  launched = await launchApp([join(dir, "top.md")]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  await menu(app, "workspace.openContaining");
  await expect(items(window)).toHaveText(["notes", "top.md"]);

  // 展开 notes；外面新建一个文件（主进程监听，侧栏刷新）以后 notes 还开着
  await items(window).filter({ hasText: "notes" }).click();
  await expect(items(window)).toHaveText(["notes", "deep", "n.md", "top.md"]);
  writeFileSync(join(dir, "new.md"), "# New\n");
  await expect(items(window)).toHaveText(["notes", "deep", "n.md", "new.md", "top.md"]);

  // 键盘：停在 notes 上，↓ ↓ 到 n.md，回车打开
  await items(window).filter({ hasText: "deep" }).click();
  await expect(items(window)).toHaveText(["notes", "deep", "x.md", "n.md", "new.md", "top.md"]);
  await window.keyboard.press("ArrowDown");
  await window.keyboard.press("ArrowDown");
  await window.keyboard.press("Enter");
  await expect.poll(() => title(app)).toBe("n.md - Marko");
  // 回车打开以后焦点还在文件树上（接着用键盘）
  await expect(window.getByTestId("file-tree")).toBeFocused();
  await window.keyboard.press("ArrowLeft");
  await window.keyboard.press("ArrowLeft");
  await expect(items(window)).toHaveText(["notes", "new.md", "top.md"]);

  // 再打开 notes：里面的 deep 记着是开的
  await items(window).filter({ hasText: "notes" }).click();
  await expect(items(window)).toHaveText(["notes", "deep", "x.md", "n.md", "new.md", "top.md"]);

  // 在文件树中定位：打开 deep/x.md，用键盘一路收起（← 回上一层、← 收起），再定位——展开到它、高亮
  await items(window).filter({ hasText: "x.md" }).click();
  await expect.poll(() => title(app)).toBe("x.md - Marko");
  for (let press = 0; press < 4; press += 1) await window.keyboard.press("ArrowLeft");
  await expect(items(window)).toHaveText(["notes", "new.md", "top.md"]);
  await menu(app, "view.revealInTree");
  await expect(items(window)).toHaveText(["notes", "deep", "x.md", "n.md", "new.md", "top.md"]);
  await expect(window.getByTestId("file-tree").locator(".is-current .file-tree-item")).toHaveText("x.md");
});

test("W-5：一个文件匹配超过 200 行时标出只列了前面的", async () => {
  writeFileSync(join(dir, "many.md"), Array.from({ length: 250 }, (_, index) => `needle ${index}`).join("\n"));
  writeFileSync(join(dir, "few.md"), "needle\n");
  launched = await launchApp([join(dir, "few.md")]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write p");
  await menu(app, "workspace.openContaining");
  // 打开工作区会切到文件页签：开好了再切到搜索
  await expect(items(window)).toHaveText(["few.md", "many.md"]);
  await menu(app, "view.search");
  const input = window.getByTestId("search-input");
  await input.fill("needle");
  await input.press("Enter");
  const counts = window.getByTestId("search-panel").locator(".search-file-count");
  await expect(counts).toHaveCount(2);
  await expect(window.getByTestId("search-panel").locator(".search-file", { hasText: "many.md" }).locator(".search-file-count")).toHaveText("200+");
  await expect(window.getByTestId("search-panel").locator(".search-file", { hasText: "few.md" }).locator(".search-file-count")).toHaveText("1");
});

test("S-4：新窗口的侧栏按「默认侧栏」；V-3、V-4：选区字数不算标记，点字数打开字数统计", async () => {
  const file = join(dir, "doc.md");
  writeFileSync(file, "word **bold** [docs](https://example.com/a/b)\n");
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write p");
  await window.evaluate(() => window.marko.settings.set({ defaultSidebarTab: "outline", alwaysShowWordCount: true }));
  await menu(app, "view.search");
  await window.evaluate(() => window.marko.window.newWindow());
  await expect.poll(() => app.app.windows().length).toBe(2);
  const other = app.app.windows().find((page) => page !== window)!;
  await other.waitForSelector("#write");
  await expect(other.getByTestId("sidebar").locator(".el-tabs__item.is-active")).toHaveText("大纲");

  // 全选：word、bold、docs 三个词（** 和网址不算）
  await window.locator("#write p").click();
  await window.keyboard.press("Control+KeyA");
  await expect(window.getByTestId("word-count")).toHaveText("已选 3 词");
  await window.getByTestId("word-count").click();
  const dialog = window.locator(".marko-word-count");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("3 词");
});

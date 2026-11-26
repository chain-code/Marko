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
  // 新窗口的页签按「默认侧栏」（默认大纲，同 Typora）：切到文件页签看
  await other.locator('.sidebar-tab[data-tab="files"]').click();
  await expect(items(other)).toHaveText(["a.md", "b.md"]);

  // 有两个窗口了：发给原来那个
  await app.app.evaluate(({ BrowserWindow }) => {
    const first = BrowserWindow.getAllWindows().find((item) => item.getTitle().startsWith("a.md"));
    first?.webContents.send("marko:menu.command", { id: "workspace.close" });
  });
  await expect(window.getByTestId("sidebar")).toContainText("没有打开的文件夹");
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
  // 结果列表是虚拟滚动的，只画看得见的行；文件的先后是 ripgrep 搜完的先后。many.md 在前面时，它展开的 200 行
  // 把 few.md 挤到看不见的地方：两个文件都搜到了按状态里的汇总看，收起 many.md 以后再看 few.md 那一行
  await expect(window.getByTestId("search-status")).toHaveText("2 个文件中找到 201 处");
  const file = (name: string) => window.getByTestId("search-panel").locator(".search-file", { hasText: name });
  await expect(file("many.md").locator(".search-file-count")).toHaveText("200+");
  await file("many.md").click();
  await expect(file("few.md").locator(".search-file-count")).toHaveText("1");
});

test("S-4：新窗口的侧栏按「默认侧栏」；V-3、V-4：有选区时状态栏是「选中的 / 全文的」，点字数打开字数统计", async () => {
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
  await expect(other.getByTestId("sidebar").locator(".sidebar-tab.is-active")).toHaveText("大纲");

  // 同 Typora 按原文数：word、bold、docs、https、//example.com/a/b 五个词（. 和 / 不切开）
  await expect(window.getByTestId("word-count")).toHaveText("5 词");
  // 全选：选中的就是全文，只显示全文的
  await window.locator("#write p").click();
  await window.keyboard.press("Control+KeyA");
  await expect(window.getByTestId("word-count")).toHaveText("5 词");
  // 选中一个词：「选中的 / 全文的」
  await window.locator("#write p").dblclick({ position: { x: 8, y: 8 } });
  await expect(window.getByTestId("word-count")).toHaveText("1 / 5 词");
  await window.getByTestId("word-count").click();
  const panel = window.getByTestId("word-count-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("总计");
  await expect(panel).toContainText("选中部分");
});

test("W-1：没有主动打开文件夹时侧栏显示当前文件所在的文件夹；打开子文件夹里的文件不换，另存到别处跟着换", async () => {
  mkdirSync(join(dir, "notes", "sub"), { recursive: true });
  mkdirSync(join(dir, "other"));
  writeFileSync(join(dir, "notes", "a.md"), "# A\n");
  writeFileSync(join(dir, "notes", "sub", "b.md"), "# B\n");
  launched = await launchApp([join(dir, "notes", "a.md")]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  await menu(app, "view.fileTree");
  const tree = window.getByTestId("file-tree");
  await expect(tree.locator(".file-tree-root")).toHaveText("notes");
  await expect(items(window)).toHaveText(["sub", "a.md"]);

  // 子文件夹里的文件：侧栏的根不换
  await items(window).filter({ hasText: "sub" }).click();
  await items(window).filter({ hasText: "b.md" }).click();
  await expect(window.locator("#write h1")).toHaveText("B");
  await expect(tree.locator(".file-tree-root")).toHaveText("notes");

  // 另存到别的文件夹：跟着换成那个文件夹
  await app.app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, join(dir, "other", "c.md"));
  await menu(app, "file.saveAs");
  await expect.poll(() => title(app)).toBe("c.md - Marko");
  await expect(tree.locator(".file-tree-root")).toHaveText("other");
  await expect(items(window)).toHaveText(["c.md"]);
});

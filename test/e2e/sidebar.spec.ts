// 端到端（W 章切片 2）：大纲、工作区的文件树和文件列表、监听增删
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-side-"));
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

test("W-4 大纲：按标题生成；点标题跳过去，光标所在的标题高亮", async () => {
  const file = join(dir, "doc.md");
  writeFileSync(file, `# 第一章\n\n${"正文。\n\n".repeat(40)}## 第一节\n\n${"内容。\n\n".repeat(40)}# 第二章\n\n结尾\n`);
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write h1");
  await menu(launched, "view.outline");
  const outline = window.getByTestId("outline");
  await expect(outline.locator(".el-tree-node__label")).toHaveText(["第一章", "第一节", "第二章"]);
  await outline.locator(".el-tree-node__label", { hasText: "第一节" }).click();
  await expect(outline.locator(".is-current > .el-tree-node__content")).toContainText("第一节");
  const top = await window.locator("#write h2", { hasText: "第一节" }).evaluate((element) => element.getBoundingClientRect().top);
  // 滚到顶上
  expect(top).toBeLessThan(120);
});

test("W-1～W-3 打开文件夹：文件树、文件列表；点文件打开；文件夹里新建文件后自动刷新", async () => {
  mkdirSync(join(dir, "notes"));
  writeFileSync(join(dir, "notes", "a.md"), "# A\n");
  writeFileSync(join(dir, "2.md"), "two\n");
  writeFileSync(join(dir, "10.md"), "ten\n");
  launched = await launchApp();
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write");
  // 选文件夹的对话框换成直接返回这个目录
  await launched.app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, dir);
  await menu(launched, "workspace.open");
  const tree = window.getByTestId("file-tree");
  await expect(tree.locator(".file-tree-item")).toHaveText(["notes", "2.md", "10.md"]);
  await tree.locator(".file-tree-item", { hasText: "2.md" }).click();
  await expect(window.locator("#write p")).toHaveText("two");
  // 再点别的文件：在这个窗口里换（不是新开窗口，F-8）
  await tree.locator(".file-tree-item", { hasText: "10.md" }).click();
  await expect(window.locator("#write p")).toHaveText("ten");
  expect(await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await menu(launched, "view.fileList");
  const list = window.getByTestId("file-list");
  await expect(list.locator(".file-list-name")).toHaveText(["a.md", "2.md", "10.md"]);
  await expect(list.locator(".file-list-item.current")).toContainText("10.md");
  writeFileSync(join(dir, "new.md"), "new\n");
  await expect(list.locator(".file-list-name")).toContainText(["new.md"]);
});

test("W-5 全局搜索：边输入边搜、按文件分组；点结果在这个窗口里打开并选中；有改动时先保存（S-3 默认）", async () => {
  mkdirSync(join(dir, "notes"));
  mkdirSync(join(dir, "node_modules"));
  writeFileSync(join(dir, "notes", "a.md"), "# A\n\nfind the needle here\n");
  writeFileSync(join(dir, "b.md"), "needle at start\n\nsecond needle\n");
  writeFileSync(join(dir, "node_modules", "x.md"), "needle\n");
  launched = await launchApp();
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write");
  await launched.app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
  }, dir);
  await menu(launched, "workspace.open");
  await expect(window.getByTestId("file-tree").locator(".file-tree-item")).toHaveText(["notes", "b.md"]);

  await menu(launched, "view.search");
  const input = window.getByTestId("search-input");
  await expect(input).toBeFocused();
  await input.pressSequentially("needle");
  const status = window.getByTestId("search-status");
  await expect(status).toHaveText("2 个文件中找到 3 处");
  const panel = window.getByTestId("search-panel");
  await expect(panel.locator(".search-hit")).toHaveCount(3);

  // 点 b.md 第 3 行的结果：这个窗口是空白新文档，在这里打开，选中那个词
  await panel.locator(".search-line", { hasText: "second needle" }).click();
  await expect(window.locator("#write p").last()).toHaveText("second needle");
  await expect.poll(() => window.evaluate(() => document.getSelection()?.toString())).toBe("needle");
  await expect(window.getByTestId("word-count")).toHaveText("已选 1 词");

  // 改一下，再点 a.md 的结果：先保存 b.md（切换文件时自动保存，默认开），再换
  await window.keyboard.type("NEW");
  await panel.locator(".search-line", { hasText: "find the needle here" }).click();
  await expect(window.locator("#write h1")).toHaveText("A");
  await expect(window.locator("#write p")).toHaveText("find the needle here");
  await expect.poll(() => readFileSync(join(dir, "b.md"), "utf8")).toBe("needle at start\n\nsecond NEW\n");
  await expect.poll(() => window.evaluate(() => document.getSelection()?.toString())).toBe("needle");
  await expect(window.getByTestId("word-count")).toHaveText("已选 1 词");
  // 选区收起来：整篇的字数（A、find、the、needle、here）
  await window.keyboard.press("End");
  await expect(window.getByTestId("word-count")).toHaveText("5 词");

  // 正则写错了
  await panel.getByRole("button", { name: "正则表达式" }).click();
  await input.fill("(");
  await input.press("Enter");
  await expect(status).toHaveText("正则写错了");
});

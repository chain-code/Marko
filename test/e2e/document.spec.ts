// 端到端（F 章切片 1）：打开、编辑、保存、冲突、未保存确认、本地图片
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

/** 1×1 的 PNG */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-doc-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true });
});

/** 主进程发菜单命令（同点菜单项、按菜单的快捷键） */
async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: command });
  }, id);
}

async function windowTitle(app: LaunchedApp): Promise<string> {
  return app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? "");
}

async function openWith(file: string): Promise<Page> {
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write");
  return window;
}

test("F-3、F-6、F-17：命令行带的文件在窗口里打开；编辑后文件名后面带 •，保存后写回、去掉 •", async () => {
  const file = join(dir, "笔记.md");
  writeFileSync(file, "# 标题\n\n正文\n");
  const window = await openWith(file);
  await expect(window.locator("#write h1")).toContainText("标题");
  await expect.poll(() => windowTitle(launched!)).toBe("笔记.md - Marko");
  await expect(window.getByTestId("status-bar")).toContainText(file);
  // 字数（V-3）：打开的文档的，不是空白新文档的
  await expect(window.getByTestId("word-count")).toHaveText("4 词");
  await window.locator("#write p").click();
  await window.keyboard.press("End");
  await window.keyboard.type("XY");
  await expect.poll(() => windowTitle(launched!)).toBe("笔记.md• - Marko");
  await menu(launched!, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toBe("# 标题\n\n正文XY\n");
  await expect.poll(() => windowTitle(launched!)).toBe("笔记.md - Marko");
});

test("F-6：文件被别的程序改过，保存时提示冲突；选「载入磁盘上的版本」", async () => {
  const file = join(dir, "a.md");
  writeFileSync(file, "one\n");
  const window = await openWith(file);
  await window.locator("#write p").click();
  await window.keyboard.press("End");
  await window.keyboard.type("!");
  writeFileSync(file, "theirs\n");
  await menu(launched!, "file.save");
  const dialog = window.locator(".el-dialog");
  await expect(dialog).toContainText("文件已被其他程序修改");
  await dialog.locator('[data-choice="reload"]').click();
  await expect(window.locator("#write p")).toHaveText("theirs");
  expect(readFileSync(file, "utf8")).toBe("theirs\n");
});

test("F-10：有没保存的改动时关窗口先问（同 Typora 的确认框）；选「放弃更改」关掉，文件不变", async () => {
  const file = join(dir, "b.md");
  writeFileSync(file, "keep\n");
  const window = await openWith(file);
  await window.locator("#write p").click();
  await window.keyboard.type("changed ");
  const closed = launched!.app.waitForEvent("close");
  await launched!.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  const dialog = window.locator(".el-dialog");
  await expect(dialog).toContainText("是否保存更改");
  // 点了以后窗口马上关掉，点击本身可能等不到返回（页面已关闭）：不看点击的结果，看窗口关没关
  await Promise.all([closed, dialog.locator('[data-choice="discard"]').click().catch(() => undefined)]);
  expect(readFileSync(file, "utf8")).toBe("keep\n");
});

test("F-10：退出时挨个窗口问；一个窗口选了取消，后面的不问、不关；都确认了才退出", async () => {
  const first = join(dir, "first.md");
  const second = join(dir, "second.md");
  writeFileSync(first, "one\n");
  writeFileSync(second, "two\n");
  launched = await launchApp([first, second]);
  const app = launched.app;
  await expect.poll(() => app.windows().length).toBe(2);
  // 按开的先后：先问 first.md 的窗口（等两个窗口都载入了文档再认）
  const pages = app.windows();
  const texts = () => Promise.all(pages.map((page) => page.evaluate(() => document.querySelector("#write p")?.textContent ?? "")));
  await expect.poll(async () => (await texts()).sort()).toEqual(["one", "two"]);
  const [one, two] = (await texts())[0] === "one" ? [pages[0]!, pages[1]!] : [pages[1]!, pages[0]!];
  for (const page of [one, two]) {
    await page.locator("#write p").click();
    await page.keyboard.type("changed ");
  }
  const quit = () => app.evaluate(({ app: electronApp }) => electronApp.quit());

  await quit();
  await expect(one.locator(".el-dialog")).toContainText("是否保存更改");
  // 第二个窗口还没问
  await one.waitForTimeout(300);
  await expect(two.locator(".el-dialog")).toHaveCount(0);
  await one.locator('.el-dialog [data-choice="cancel"]').click();
  // 取消了：两个窗口都在，第二个窗口也没问
  await one.waitForTimeout(500);
  expect(app.windows().length).toBe(2);
  await expect(two.locator(".el-dialog")).toHaveCount(0);

  // 再退出：第一个选不保存、关掉以后才问第二个，第二个也不保存——退出
  const exited = app.waitForEvent("close");
  await quit();
  // 点了窗口就关（同上）：不看点击的结果，看后面
  await one.locator('.el-dialog [data-choice="discard"]').click().catch(() => undefined);
  await expect(two.locator(".el-dialog")).toContainText("是否保存更改");
  await Promise.all([exited, two.locator('.el-dialog [data-choice="discard"]').click().catch(() => undefined)]);
  expect(readFileSync(first, "utf8")).toBe("one\n");
  expect(readFileSync(second, "utf8")).toBe("two\n");
});

test("M-1：相对路径的本地图片经 marko-asset:// 显示", async () => {
  writeFileSync(join(dir, "pic.png"), PIXEL);
  const file = join(dir, "c.md");
  writeFileSync(file, "![图](pic.png)\n\nend\n");
  const window = await openWith(file);
  const image = window.locator("#write img").first();
  await expect(image).toHaveAttribute("src", /^marko-asset:\/\/local\//);
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1);
});

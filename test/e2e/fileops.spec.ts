// 端到端（W-6、F-13、L-1、C-4）：侧栏右键菜单——新建、改名、移到回收站；编辑菜单的命令作用在有焦点的地方。
// 原生右键菜单换成直接选指定的项（不在屏幕上弹真的菜单）；移到回收站换成直接删（不往系统回收站里放东西）
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-ops-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menu(app: LaunchedApp, id: string, argument?: string): Promise<void> {
  await app.app.evaluate(
    ({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", command),
    argument === undefined ? { id } : { id, argument },
  );
}

/** 下一个弹出的原生菜单直接选这一项 */
async function chooseFromNextMenu(app: LaunchedApp, label: string): Promise<void> {
  await app.app.evaluate(({ Menu }, wanted) => {
    const original = Menu.prototype.popup;
    Menu.prototype.popup = function popup(this: Electron.Menu, options?: Electron.PopupOptions) {
      Menu.prototype.popup = original;
      const item = this.items.find((entry) => entry.label === wanted);
      if (!item) throw new Error(`菜单里没有「${wanted}」`);
      item.click();
      options?.callback?.();
    };
  }, label);
}

async function title(app: LaunchedApp): Promise<string> {
  return app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? "");
}

test("W-6、F-13：新建 Markdown 文件、改名（打开着的跟着改路径）、移到回收站（打开着的标出已删除）", async () => {
  writeFileSync(join(dir, "a.md"), "# A\n");
  writeFileSync(join(dir, "b.md"), "# B\n");
  launched = await launchApp([join(dir, "a.md")]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  await app.app.evaluate(({ dialog, shell }, folder) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [folder] })) as typeof dialog.showOpenDialog;
    const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
    shell.trashItem = async (path: string) => fs.rmSync(path, { recursive: true, force: true });
  }, dir);
  await menu(app, "workspace.open");
  const tree = window.getByTestId("file-tree");
  await expect(tree.locator(".file-tree-item")).toHaveText(["a.md", "b.md"]);
  const prompt = window.locator(".el-message-box");

  // 工作区根目录上右键：新建 Markdown 文件，建好在这个窗口里打开
  await chooseFromNextMenu(app, "新建 Markdown 文件...");
  await window.getByTestId("file-tree").locator(".file-tree-root").click({ button: "right" });
  await prompt.locator("input").fill("notes");
  await prompt.getByRole("button", { name: "确定" }).click();
  await expect.poll(() => title(app)).toBe("notes.md - Marko");
  expect(existsSync(join(dir, "notes.md"))).toBe(true);
  await expect(tree.locator(".file-tree-item")).toHaveText(["a.md", "b.md", "notes.md"]);

  // 没打开的文件改名
  await chooseFromNextMenu(app, "重命名...");
  await tree.locator(".file-tree-item", { hasText: "b.md" }).click({ button: "right" });
  await expect(prompt.locator("input")).toHaveValue("b");
  await prompt.locator("input").fill("c");
  await prompt.getByRole("button", { name: "确定" }).click();
  await expect(tree.locator(".file-tree-item")).toHaveText(["a.md", "c.md", "notes.md"]);
  expect(readFileSync(join(dir, "c.md"), "utf8")).toBe("# B\n");

  // 打开着的文件改名：窗口跟着编辑新路径，不当作被删除
  await tree.locator(".file-tree-item", { hasText: "c.md" }).click();
  await expect.poll(() => title(app)).toBe("c.md - Marko");
  await chooseFromNextMenu(app, "重命名...");
  await tree.locator(".file-tree-item", { hasText: "c.md" }).click({ button: "right" });
  await prompt.locator("input").fill("d");
  await prompt.getByRole("button", { name: "确定" }).click();
  await expect.poll(() => title(app)).toBe("d.md - Marko");
  await window.waitForTimeout(500);
  expect(await title(app)).toBe("d.md - Marko");

  // 移到回收站（先确认）：打开着的文件标出「已删除」，内容还在
  await chooseFromNextMenu(app, "移到回收站...");
  await tree.locator(".file-tree-item", { hasText: "d.md" }).click({ button: "right" });
  await window.locator('.el-dialog [data-choice="trash"]').click();
  await expect.poll(() => existsSync(join(dir, "d.md"))).toBe(false);
  await expect.poll(() => title(app)).toBe("d.md（已删除） - Marko");
  await expect(window.locator("#write h1")).toHaveText("B");
});

test("C-4、编辑菜单：粘贴为纯文本原样插入；焦点在查找框里时全选只选查找框的字", async () => {
  const file = join(dir, "p.md");
  writeFileSync(file, "start\n");
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write p");
  await window.locator("#write p").click();
  await window.keyboard.press("End");
  await menu(app, "editor.pastePlainText", " **x**");
  await expect(window.locator("#write p")).toContainText("start");
  await menu(app, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toBe("start **x**\n");

  await menu(app, "find.open");
  const input = window.getByTestId("find-input");
  await input.pressSequentially("abc");
  // 主进程发按键：网页没处理的才会走菜单的快捷键
  await app.app.evaluate(({ BrowserWindow }) => {
    // sendInputEvent 要窗口有焦点（Electron 的文档）：机器忙的时候窗口不一定在前面
    const target = BrowserWindow.getAllWindows()[0];
    target?.focus();
    target?.webContents.focus();
    const contents = target?.webContents;
    contents?.sendInputEvent({ type: "keyDown", keyCode: "A", modifiers: ["control"] });
    contents?.sendInputEvent({ type: "keyUp", keyCode: "A", modifiers: ["control"] });
  });
  await expect.poll(() => input.evaluate((element) => [(element as HTMLInputElement).selectionStart, (element as HTMLInputElement).selectionEnd])).toEqual([0, 3]);
  // 编辑区没有被全选：关掉查找栏后输入，原来的字还在
  await input.press("Escape");
  await window.keyboard.type("Z");
  await menu(app, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toContain("start");
});

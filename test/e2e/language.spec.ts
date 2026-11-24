// 端到端（L-2、S-10）：在偏好设置里换界面语言，不用重启：原生菜单、对话框、状态栏、编辑器插进文档的占位都跟着换
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-language-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menuTitles(app: LaunchedApp): Promise<string[]> {
  return app.app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.map((item) => item.label) ?? []);
}

async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: command }), id);
}

test("L-2：换成 English 马上生效（菜单、界面、编辑器的占位），换回中文也一样", async () => {
  const file = join(dir, "doc.md");
  writeFileSync(file, "# Title\n\n");
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  const titles = await menuTitles(app);
  expect(titles).toContain("文件");

  // 偏好设置 → 语言与拼写 → 界面语言选 English
  await menu(app, "app.preferences");
  const dialog = window.locator(".marko-settings");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "语言与拼写" }).click();
  await dialog.locator('[data-setting="language"] .el-select').click();
  await window.locator(".el-select-dropdown__item", { hasText: "English" }).click();

  await expect.poll(() => menuTitles(app)).toEqual(expect.arrayContaining(["File", "Edit", "Paragraph", "Format", "View", "Themes", "Help"]));
  await expect(dialog.locator(".el-dialog__title")).toHaveText("Preferences");
  await expect(dialog.getByRole("tab", { name: "Language & Spelling" })).toBeVisible();
  await expect(window.locator("html")).toHaveAttribute("lang", "en");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(window.getByTestId("word-count")).toHaveText(/^\d+ words$/);

  // 编辑器插进文档的占位：插入表格的小窗口、表头
  await window.locator("#write h1").click();
  await menu(app, "table.insert");
  // 偏好设置（快捷键表里也有「Insert Table...」）关了以后还在页面里：排除它
  const sizeDialog = window.locator(".el-dialog:not(.marko-settings)", { hasText: "Insert Table" });
  await expect(sizeDialog).toBeVisible();
  await sizeDialog.getByRole("button", { name: "OK" }).click();
  await expect(window.locator("#write table th").first()).toHaveText("Column 1");
  await menu(app, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toContain("| Column 1 | Column 2 | Column 3 |");

  // 存进了设置；换回中文
  expect(await window.evaluate(async () => (await window.marko.settings.get()).language)).toBe("en");
  await window.evaluate(() => window.marko.settings.set({ language: "zh-CN" }));
  await expect.poll(() => menuTitles(app)).toContain("文件");
  // 插入表格后选中了表头：显示的是选区的字数
  await expect(window.getByTestId("word-count")).toHaveText(/^已选 \d+ 词$/);
});

test("S-10 用户词典：列出加入过的词，点 × 删掉", async () => {
  const file = join(dir, "doc.md");
  writeFileSync(file, "# Title\n");
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  // Windows 10 以上、macOS 上增删词会写进系统的词典：测试换成假的，不碰用户机器上的词典
  await app.app.evaluate(({ session }) => {
    const words = new Set(["zzword", "markoish"]);
    const target = session.defaultSession as unknown as Record<string, unknown>;
    target.listWordsInSpellCheckerDictionary = async () => [...words];
    target.removeWordFromSpellCheckerDictionary = (word: string) => words.delete(word);
  });
  await menu(app, "app.preferences");
  const dialog = window.locator(".marko-settings");
  await dialog.getByRole("tab", { name: "语言与拼写" }).click();
  const dictionary = dialog.getByTestId("settings-dictionary");
  await expect(dictionary.locator(".el-tag")).toHaveText(["markoish", "zzword"]);
  await dictionary.locator(".el-tag", { hasText: "zzword" }).locator(".el-tag__close").click();
  await expect(dictionary.locator(".el-tag")).toHaveText(["markoish"]);
});

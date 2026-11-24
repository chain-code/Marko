// 端到端（通用规则 6）：「段落」「格式」菜单的命令作用到编辑器
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-menus-"));
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

test("段落、格式菜单：标题、Callout（带参数）、Front Matter、插入表格的小窗口、设置图片宽度", async () => {
  const file = join(dir, "menus.md");
  // 1×1 的 PNG：图片要能显示出来才点得到
  writeFileSync(join(dir, "p.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64"));
  writeFileSync(file, "line\n\nnote\n\n![pic](p.png)\n");
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write p");

  await window.locator("#write p", { hasText: "line" }).click();
  await menu(app, "heading2");
  await expect(window.locator("#write h2")).toHaveText("line");

  await window.locator("#write p", { hasText: "note" }).click();
  await menu(app, "callout", "TIP");

  await menu(app, "frontMatter");

  await menu(app, "table.insert");
  const tableDialog = window.locator(".el-dialog", { hasText: "插入表格" });
  await expect(tableDialog).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(tableDialog).toBeHidden();

  // 光标放到图片那一行（图片前面），设置宽度
  await window.locator("#write img").first().click();
  await menu(app, "image.setWidth");
  const prompt = window.locator(".el-message-box");
  await expect(prompt).toBeVisible();
  await prompt.locator("input").fill("300");
  await prompt.getByRole("button", { name: "确定" }).click();

  await menu(app, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toMatch(/^---\ntitle: 新文档\ndate: [\d-]+\n---\n/);
  const saved = readFileSync(file, "utf8");
  expect(saved).toContain("## line");
  expect(saved).toMatch(/> \[!TIP\]/);
  expect(saved).toMatch(/<img[^>]*300px/);
});

// 端到端（F 章切片 5）：外部修改（F-12）、草稿恢复（F-9）
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-recovery-"));
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

async function windowTitle(app: LaunchedApp): Promise<string> {
  return app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? "");
}

test("F-12：没改过时自动重新载入；改过时问，保留我的改动以后保存不再报冲突；文件删了标题标出「已删除」", async () => {
  const file = join(dir, "a.md");
  writeFileSync(file, "one\n");
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write p");

  writeFileSync(file, "two\n");
  await expect(window.locator("#write p")).toHaveText("two");
  await expect(window.getByTestId("status-notice")).toContainText("已重新载入");

  await window.locator("#write p").click();
  await window.keyboard.press("End");
  await window.keyboard.type("!");
  writeFileSync(file, "three\n");
  const dialog = window.locator(".el-dialog");
  await expect(dialog).toContainText("文件已在外部修改");
  await dialog.locator('[data-choice="keep"]').click();
  await expect(window.locator("#write p")).toHaveText("two!");
  await menu(launched, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toBe("two!\n");
  await expect(window.locator(".el-dialog:visible")).toHaveCount(0);
  // 自己保存的不算外部修改：内容不变，没有新的提示
  await window.waitForTimeout(600);
  await expect(window.locator(".el-dialog:visible")).toHaveCount(0);

  unlinkSync(file);
  await expect.poll(() => windowTitle(launched!)).toBe("a.md（已删除） - Marko");
  await expect(window.locator("#write p")).toHaveText("two!");
});

test("F-9：异常退出以后再启动，按草稿恢复没保存的改动；保存以后草稿删掉", async () => {
  const file = join(dir, "b.md");
  writeFileSync(file, "base\n");
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write p");
  await window.locator("#write p").click();
  await window.keyboard.press("End");
  await window.keyboard.type("EDIT");
  const drafts = join(launched.userData, "drafts");
  // 停止输入 1 秒后写草稿（.md 和 .json）
  await expect.poll(() => (existsSync(drafts) ? readdirSync(drafts).length : 0)).toBe(2);

  const userData = launched.userData;
  await launched.crash();
  launched = await launchApp([], { userData });
  const restored = await launched.app.firstWindow();
  await expect(restored.locator("#write p")).toHaveText("baseEDIT");
  await expect.poll(() => windowTitle(launched!)).toBe("● b.md - Marko");
  await expect(restored.locator(".el-message").last()).toContainText("已从草稿恢复");
  expect(readFileSync(file, "utf8")).toBe("base\n");

  await menu(launched, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toBe("baseEDIT\n");
  await expect.poll(() => readdirSync(drafts).length).toBe(0);
});

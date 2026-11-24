// 端到端（S-12）：在偏好设置里改快捷键——菜单、编辑区跟着变；撞了先问；编辑器自己在用的不给；
// 视图模式的键（F8）走菜单，和设置是同一份状态
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-shortcuts-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: command }), id);
}

/** 菜单里这一项现在的快捷键（没有是 null） */
async function accelerator(app: LaunchedApp, label: string): Promise<string | null> {
  return app.app.evaluate(({ Menu }, wanted) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
      for (const item of items) {
        if (item.label === wanted) return item;
        const nested = item.submenu ? find(item.submenu.items) : null;
        if (nested) return nested;
      }
      return null;
    };
    return find(Menu.getApplicationMenu()?.items ?? [])?.accelerator ?? null;
  }, label);
}

test("S-12：改加粗的快捷键，菜单和编辑区跟着变；撞了先问；保留的键不给；F8 走菜单", async () => {
  const file = join(dir, "doc.md");
  writeFileSync(file, "alpha beta\n");
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write p");
  expect(await accelerator(app, "加粗")).toBe("CmdOrCtrl+B");
  // 开发者工具用 Shift+F12（Ctrl+Shift+I 是插入图片）
  expect(await accelerator(app, "开发者工具")).toBe("Shift+F12");

  await menu(app, "app.preferences");
  const dialog = window.locator(".marko-settings");
  await dialog.getByRole("tab", { name: "快捷键" }).click();
  const bold = dialog.locator('[data-shortcut="bold"] input');
  await expect(bold).toHaveValue("Ctrl+B");
  await bold.click();
  await expect(bold).toHaveValue("请按下快捷键…");
  await window.keyboard.press("Control+Alt+KeyB");
  await expect(bold).toHaveValue("Ctrl+Alt+B");
  await expect.poll(() => accelerator(app, "加粗")).toBe("CmdOrCtrl+Alt+B");

  // 撞了：把斜体的 Ctrl+I 给下划线——先问，改给它以后斜体没有快捷键了
  const underline = dialog.locator('[data-shortcut="underline"] input');
  await underline.click();
  await window.keyboard.press("Control+KeyI");
  const confirm = window.locator(".el-message-box");
  await expect(confirm).toContainText("斜体");
  await confirm.getByRole("button", { name: "改给它" }).click();
  await expect(underline).toHaveValue("Ctrl+I");
  await expect(dialog.locator('[data-shortcut="italic"] input')).toHaveValue("");
  await expect.poll(() => accelerator(app, "斜体")).toBeNull();

  // 编辑器自己在用的键（Ctrl+L 选中行）不给
  await dialog.locator('[data-shortcut="highlight"] input').click();
  await window.keyboard.press("Control+KeyL");
  await expect(window.locator(".el-message--error")).toContainText("编辑器自己在用");
  await expect(dialog.locator('[data-shortcut="highlight"] input')).toHaveValue("");
  await dialog.getByRole("button", { name: "完成" }).click();
  await expect(dialog).toBeHidden();

  // 编辑区：Ctrl+Alt+B 加粗；Ctrl+B 不再加粗
  await window.locator("#write p").click();
  await window.keyboard.press("Home");
  await window.keyboard.press("Control+KeyD");
  await window.keyboard.press("Control+Alt+KeyB");
  await window.keyboard.press("End");
  await window.keyboard.press("Control+KeyD");
  await window.keyboard.press("Control+KeyB");
  await menu(app, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toBe("**alpha** beta\n");

  // F8 在编辑区里也走菜单：设置里的专注模式跟着变（主进程发的按键才会走菜单的快捷键）
  await window.locator("#write p").click();
  // sendInputEvent 要窗口有焦点（Electron 的文档）：全部测试一起跑、机器忙的时候窗口不一定在前面，先给它焦点
  await app.app.evaluate(({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0];
    target?.focus();
    target?.webContents.focus();
    target?.webContents.sendInputEvent({ type: "keyDown", keyCode: "F8" });
    target?.webContents.sendInputEvent({ type: "keyUp", keyCode: "F8" });
  });
  await expect.poll(() => window.evaluate(async () => (await window.marko.settings.get()).focusMode)).toBe(true);
});

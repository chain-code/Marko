// 端到端（I-5、B-13、B-11、B-16）：编辑区里 Element Plus 的几个浮层——Emoji 补全列表、Callout 种类选择、脚注和缩写的提示框
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-editorui-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function save(app: LaunchedApp): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: "file.save" }));
}

test("I-5 Emoji 补全：输入 :smi 弹出列表，↓ 选下一个、回车写进去", async () => {
  const file = join(dir, "emoji.md");
  writeFileSync(file, "start\n");
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write p");
  await window.locator("#write p").click();
  await window.keyboard.press("End");
  await window.keyboard.type(" :smi");
  const list = window.getByTestId("emoji-list");
  await expect(list).toBeVisible();
  const options = list.locator(".marko-emoji-option");
  await expect(options.first()).toHaveText(/:smile:/);
  await expect(options.first()).toHaveClass(/is-selected/);
  await window.keyboard.press("ArrowDown");
  await expect(options.nth(1)).toHaveClass(/is-selected/);
  const second = (await options.nth(1).locator(".marko-emoji-name").textContent()) ?? "";
  await window.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await save(launched);
  await expect.poll(() => readFileSync(file, "utf8")).toBe(`start ${second}\n`);
});

test("B-13 单击 Callout 的标题选种类；B-11、B-16 鼠标停在脚注引用、缩写上显示提示", async () => {
  const file = join(dir, "callout.md");
  writeFileSync(file, "> [!NOTE]\n> hello\n\nThe HTML spec[^1]\n\n[^1]: footnote text\n\n*[HTML]: Hyper Text Markup Language\n");
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  await window.waitForSelector("#write .md-alert-title");

  await window.locator("#write .md-alert-title").click();
  const kinds = window.getByTestId("callout-kinds");
  await expect(kinds).toBeVisible();
  await expect(kinds.locator(".el-dropdown-menu__item")).toHaveCount(5);
  await kinds.locator(".el-dropdown-menu__item", { hasText: "Warning" }).click();
  await expect(window.locator("#write .md-alert-title")).toHaveText("Warning");
  await save(launched);
  await expect.poll(() => readFileSync(file, "utf8")).toContain("> [!WARNING]\n> hello\n");

  // 鼠标移上去只动一次：赶上编辑器正好重画这个元素时收不到 mouseover（机器忙的时候）。没出来就先移开、再移上去
  const tip = window.locator(".marko-hover-tip");
  const hoverUntil = async (target: ReturnType<typeof window.locator>, text: string) => {
    await expect(async () => {
      await window.mouse.move(0, 0);
      await target.hover();
      await expect(tip).toHaveText(text, { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  };
  // 脚注引用：显示定义的内容
  await hoverUntil(window.locator("#write sup.md-footnote"), "footnote text");
  // 缩写：显示全称；浏览器自己的 title 提示没有（只有一个提示框）
  await window.mouse.move(0, 0);
  await expect(tip).toBeHidden();
  const abbr = window.locator("#write abbr").first();
  await expect(abbr).not.toHaveAttribute("title", /.*/);
  await hoverUntil(abbr, "Hyper Text Markup Language");
});

test("D-5、M-6：真的双击（不是直接发 dblclick）画好的图表、图片打开大图查看器；第一下选中这一块、源码展开把图挤开也照样打开", async () => {
  // 图要有一定大小（1×1 的图点不中）
  writeFileSync(join(dir, "pic.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="#3b82f6"/></svg>`);
  const file = join(dir, "viewer.md");
  const fence = "```";
  writeFileSync(file, ["# Viewer", "", `${fence}mermaid`, "graph LR", "  A --> B", fence, "", "text ![pic](pic.svg) more", "", "end", ""].join("\n"));
  launched = await launchApp([file]);
  const window = await launched.app.firstWindow();
  const diagram = window.locator("#write .md-diagram-panel svg").first();
  await expect(diagram).toBeVisible({ timeout: 20_000 });
  const viewer = window.locator(".el-image-viewer__wrapper");

  await diagram.dblclick();
  await expect(viewer).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(viewer).toBeHidden();

  const image = window.locator("#write img").first();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(80);
  await image.dblclick();
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("img")).toHaveAttribute("src", /pic\.svg/);
  await window.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
});

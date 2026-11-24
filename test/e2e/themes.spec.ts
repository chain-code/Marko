// 端到端（A 章）：主题菜单——内置主题、用户主题目录里的（放进去就出现，不用重启）、user.css 加在后面；导出用同一份主题
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-themes-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menuLabels(app: LaunchedApp, top: string): Promise<string[]> {
  return app.app.evaluate(({ Menu }, label) => {
    const menu = Menu.getApplicationMenu()?.items.find((item) => item.label === label);
    return menu?.submenu?.items.map((item) => item.label) ?? [];
  }, top);
}

async function clickMenuItem(app: LaunchedApp, label: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow, Menu }, wanted) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
      for (const item of items) {
        if (item.label === wanted) return item;
        const nested = item.submenu ? find(item.submenu.items) : null;
        if (nested) return nested;
      }
      return null;
    };
    const item = find(Menu.getApplicationMenu()?.items ?? []);
    if (!item) throw new Error(`菜单里没有「${wanted}」`);
    item.click(undefined, BrowserWindow.getAllWindows()[0]);
  }, label);
}

test("A-1、A-3：内置主题；用户主题放进主题目录就出现在菜单里，选了马上生效；user.css 加在后面；导出带上同一份样式", async () => {
  const file = join(dir, "doc.md");
  writeFileSync(file, "# 标题\n\n正文\n\n## 小节\n");
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  const isDark = () => window.evaluate(() => document.documentElement.classList.contains("dark"));

  await clickMenuItem(app, "SoloLog 深色");
  await expect.poll(isDark).toBe(true);
  await clickMenuItem(app, "SoloLog 浅色");
  await expect.poll(isDark).toBe(false);

  const themes = join(app.userData, "themes");
  expect(existsSync(themes)).toBe(true);
  // Typora 主题的写法：@import 自己目录里的子样式表、按相对路径引用字体（A-3）
  mkdirSync(join(themes, "night-ish"));
  writeFileSync(join(themes, "night-ish", "sub.css"), "#write h2 { color: rgb(4, 5, 6); }\n");
  writeFileSync(join(themes, "night-ish", "font.woff2"), Buffer.from([1, 2, 3, 4]));
  writeFileSync(
    join(themes, "night-ish.css"),
    '@import "night-ish/sub.css";\n@font-face { font-family: NightIsh; src: url("night-ish/font.woff2"); }\n#write { background: rgb(20, 20, 20); color: rgb(1, 2, 3); }\n',
  );
  await expect.poll(() => menuLabels(app, "主题")).toContain("night-ish");
  await clickMenuItem(app, "night-ish");
  await expect.poll(() => window.evaluate(() => getComputedStyle(document.querySelector("#write")!).color)).toBe("rgb(1, 2, 3)");
  // 底色是深的：按深色主题（Element Plus、编辑器跟着）
  await expect.poll(isDark).toBe(true);
  // @import 的子样式表按主题文件所在的目录找到了
  await expect.poll(() => window.evaluate(() => getComputedStyle(document.querySelector("#write h2")!).color)).toBe("rgb(4, 5, 6)");

  writeFileSync(join(themes, "user.css"), "#write h1 { color: rgb(200, 0, 0); }\n");
  await expect.poll(() => window.evaluate(() => getComputedStyle(document.querySelector("#write h1")!).color)).toBe("rgb(200, 0, 0)");

  const target = join(dir, "doc.html");
  await app.app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, target);
  await app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: "export", argument: "html" }));
  await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true);
  const html = readFileSync(target, "utf8");
  expect(html).toContain("rgb(1, 2, 3)");
  expect(html).toContain("rgb(200, 0, 0)");
  // 导出的文件离开主题目录也一样：子样式表展开了，字体内嵌
  expect(html).toContain("rgb(4, 5, 6)");
  expect(html).toContain("data:font/woff2;base64,AQIDBA==");
  expect(html).toContain('class="dark"');
});

test("A-4：跟随系统深浅色——开着时系统换成深色就用深色主题，换回浅色用浅色主题；关着时不跟", async () => {
  const file = join(dir, "doc.md");
  writeFileSync(file, "# 标题\n");
  // 不让 Playwright 模拟浅色：页面的 prefers-color-scheme 跟着主进程的 nativeTheme（同真的系统切换）
  launched = await launchApp([file], { systemColorScheme: true });
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write h1");
  const isDark = () => window.evaluate(() => document.documentElement.classList.contains("dark"));
  const system = (source: "light" | "dark") =>
    app.app.evaluate(({ nativeTheme }, value) => {
      nativeTheme.themeSource = value;
    }, source);

  await system("light");
  await window.evaluate(() => window.marko.settings.set({ followSystemTheme: true, lightTheme: "solo", darkTheme: "dark" }));
  await expect.poll(isDark).toBe(false);
  await system("dark");
  await expect.poll(isDark).toBe(true);
  await system("light");
  await expect.poll(isDark).toBe(false);

  await window.evaluate(() => window.marko.settings.set({ followSystemTheme: false, theme: "solo" }));
  await system("dark");
  await window.waitForTimeout(300);
  expect(await isDark()).toBe(false);
});

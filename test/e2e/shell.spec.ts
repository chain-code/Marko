import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { desktopDir, launchApp } from "./app.ts";

test("应用能启动：空白新文档、预加载接口、Element Plus 可用", async () => {
  const launched = await launchApp();
  try {
    const window = await launched.app.firstWindow();
    await window.waitForSelector("#write");
    // 窗口标题（F-17）
    await expect.poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle())).toBe("未命名.md - Marko");
    // 版本号取应用自己的 package.json（发版改版本号时不用改测试）
    const { version } = JSON.parse(readFileSync(join(desktopDir, "package.json"), "utf8")) as { version: string };
    expect(await window.evaluate(() => window.marko.app.version())).toBe(version);
    await expect(window.getByTestId("status-bar")).toContainText("尚未保存到磁盘");
    // Element Plus 的变量（ui.css、组件样式）加载了
    const primary = await window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--el-color-primary").trim());
    expect(primary).not.toBe("");
    // 渲染进程拿不到 Node（1.10 节）
    const nodeVisible = await window.evaluate(() => typeof (globalThis as { process?: unknown }).process !== "undefined");
    expect(nodeVisible).toBe(false);
  } finally {
    await launched.close();
  }
});

test("1.10：应用页面带 CSP 响应头，新窗口被拦下", async () => {
  const launched = await launchApp();
  try {
    const window = await launched.app.firstWindow();
    const csp = await window.evaluate(async () => (await fetch(location.href)).headers.get("content-security-policy"));
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    // 用不交给系统浏览器的地址：网址会被拦下后交给系统浏览器打开（N-4），测试里不该真的打开浏览器
    const opened = await window.evaluate(() => window.open("file:///C:/Windows/notepad.exe") !== null);
    expect(opened).toBe(false);
    expect(launched.app.windows()).toHaveLength(1);
  } finally {
    await launched.close();
  }
});

test("1.10：摄像头、麦克风、定位、剪贴板读取、通知的权限一律不给（Electron 默认全给）", async () => {
  const launched = await launchApp();
  try {
    const window = await launched.app.firstWindow();
    await window.waitForLoadState("domcontentloaded");
    const states = await window.evaluate(async () => {
      const names = ["camera", "microphone", "geolocation", "clipboard-read", "notifications", "midi"];
      const result: Record<string, string> = {};
      for (const name of names) {
        try {
          result[name] = (await navigator.permissions.query({ name } as unknown as PermissionDescriptor)).state;
        } catch (error) {
          result[name] = `不支持：${String(error)}`;
        }
      }
      return result;
    });
    for (const [name, state] of Object.entries(states)) expect(state, name).not.toBe("granted");
    expect(states.camera).toBe("denied");
    expect(states.geolocation).toBe("denied");
  } finally {
    await launched.close();
  }
});

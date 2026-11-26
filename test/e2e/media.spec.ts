// 端到端（M 章）：插入本地图片、视频（复制到 ./assets）；粘贴截图；新文档先保存
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

/** 1×1 的 PNG */
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-media-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function menu(app: LaunchedApp, id: string): Promise<void> {
  await app.app.evaluate(({ BrowserWindow }, command) => BrowserWindow.getAllWindows()[0]?.webContents.send("marko:menu.command", { id: command }), id);
}

/** 粘贴一张截图（剪贴板里只有图片内容，没有文件路径） */
async function pasteScreenshot(window: Page): Promise<void> {
  await window.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "image.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    document.querySelector("#write")!.dispatchEvent(event);
  }, PIXEL);
}

test("M-2、M-3、M-7：插入本地图片和视频复制到 ./assets；粘贴的截图按时间起名存进去", async () => {
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "pic.png"), Buffer.from(PIXEL, "base64"));
  writeFileSync(join(dir, "src", "clip.mp4"), "not really a video");
  const file = join(dir, "doc.md");
  writeFileSync(file, "start\n");
  launched = await launchApp([file]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write p");
  await window.evaluate(() => window.marko.settings.set({ imageInsertAction: "assets" }));
  await window.locator("#write p").click();
  await window.keyboard.press("End");

  await app.app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as typeof dialog.showOpenDialog;
  }, [join(dir, "src", "pic.png"), join(dir, "src", "clip.mp4")]);
  await menu(app, "image.insertLocal");
  await expect(window.locator("#write img:not(.ProseMirror-separator)")).toHaveCount(1);
  await expect(window.locator("#write img:not(.ProseMirror-separator)")).toHaveAttribute("src", /^marko-asset:\/\/local\/.*assets\/pic\.png$/);

  await pasteScreenshot(window);
  await expect(window.locator("#write img:not(.ProseMirror-separator)")).toHaveCount(2);

  await menu(app, "file.save");
  await expect.poll(() => readFileSync(file, "utf8")).toContain("![pic](assets/pic.png)");
  const saved = readFileSync(file, "utf8");
  expect(saved).toContain('<video controls src="assets/clip.mp4"></video>');
  expect(saved).toMatch(/!\[image\]\(assets\/image-\d{17}\.png\)/);
  expect(existsSync(join(dir, "assets", "pic.png"))).toBe(true);
  expect(existsSync(join(dir, "assets", "clip.mp4"))).toBe(true);
  // 光标离开视频那段 HTML 以后显示成播放器（M-7）
  await window.keyboard.press("Home");
  await expect(window.locator("#write video")).toHaveCount(1);
});

test("M-4：配了上传接口时粘贴的截图先上传，用返回的网址；Token 加密保存、放在请求头里", async () => {
  const received: Array<{ authorization?: string; size: number }> = [];
  const server = createServer((request, response) => {
    let size = 0;
    request.on("data", (chunk: Buffer) => (size += chunk.length));
    request.on("end", () => {
      received.push({ authorization: request.headers.authorization, size });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ url: "https://cdn.example/uploaded.png" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    const file = join(dir, "up.md");
    writeFileSync(file, "x\n");
    launched = await launchApp([file]);
    const app = launched;
    const window = await app.app.firstWindow();
    await window.waitForSelector("#write p");
    await window.evaluate(async (endpoint) => {
      await window.marko.settings.set({ uploadMethod: "api", uploadUrl: endpoint });
      await window.marko.upload.setToken("secret-token-123");
    }, `http://127.0.0.1:${port}/upload`);
    expect(await window.evaluate(() => window.marko.upload.hasToken())).toBe(true);
    // 存的是密文
    expect(readFileSync(join(app.userData, "config.json"), "utf8")).not.toContain("secret-token-123");

    await window.locator("#write p").click();
    await window.keyboard.press("End");
    await pasteScreenshot(window);
    // 上传完才插入
    await expect(window.locator("#write img:not(.ProseMirror-separator)")).toHaveAttribute("src", "https://cdn.example/uploaded.png");
    await menu(app, "file.save");
    await expect.poll(() => readFileSync(file, "utf8")).toContain("![image](https://cdn.example/uploaded.png)");
    expect(received).toHaveLength(1);
    expect(received[0].authorization).toBe("secret-token-123");
    expect(received[0].size).toBeGreaterThan(60);
    // 上传了就不再复制到 ./assets
    expect(existsSync(join(dir, "assets"))).toBe(false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("M-3：新文档里粘贴截图先要保存；保存以后图片存在文档旁边的 ./assets", async () => {
  const target = join(dir, "new.md");
  launched = await launchApp();
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write");
  await app.app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, target);
  await window.locator("#write").click();
  await pasteScreenshot(window);
  await expect(window.locator("#write img:not(.ProseMirror-separator)")).toHaveCount(1);
  await expect.poll(() => existsSync(join(dir, "assets"))).toBe(true);
  await menu(app, "file.save");
  await expect.poll(() => (existsSync(target) ? readFileSync(target, "utf8") : "")).toMatch(/!\[image\]\(assets\/image-\d{17}\.png\)/);
});

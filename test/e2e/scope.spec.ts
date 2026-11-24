// 端到端（X-1、1.10 节）：接口这一层的越权路径。页面里的脚本（比如过滤出了漏洞）只能调 window.marko，
// 这里就从页面直接调它，冒充被攻破的页面：给的路径不在用户打开过的范围里时一律拒绝，也不能借别的接口把路径放进范围。
// N-4：用户点的本地链接不受范围限制，但只打开 Markdown 文件；别的文件主进程先问
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-scope-"));
  for (const folder of ["docs", "secret", "pictures", "other"]) mkdirSync(join(dir, folder));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

async function windowTitles(app: LaunchedApp): Promise<string[]> {
  return app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((window) => window.getTitle()));
}

/** 页面里调 window.marko（结果里只留 ok 和错误码） */
async function call(window: Page, script: string, argument: unknown): Promise<unknown> {
  return window.evaluate(
    async ({ body, value }) => {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const result = await new Function("marko", "value", `return (async () => { ${body} })();`)((window as unknown as { marko: unknown }).marko, value);
      return result && typeof result === "object" && "ok" in result ? (result.ok ? { ok: true, value: result.value } : { ok: false, code: result.error.code }) : result;
    },
    { body: script, value: argument },
  );
}

test("X-1：页面给的路径不在范围里一律拒绝；文档状态里的路径不能把别的目录放进范围", async () => {
  const doc = join(dir, "docs", "doc.md");
  writeFileSync(doc, "# Doc\n");
  const secret = join(dir, "secret", "secret.md");
  writeFileSync(secret, "# Secret\n");
  launched = await launchApp([doc]);
  const window = await launched.app.firstWindow();
  await expect(window.locator("#write h1")).toHaveText("Doc");

  const outOfScope = { ok: false, code: "out_of_scope" };
  expect(await call(window, "return marko.file.open(value)", secret)).toEqual(outOfScope);
  expect(await call(window, "return marko.file.openHere(value)", secret)).toEqual(outOfScope);
  expect(await call(window, "return marko.file.read(value)", secret)).toEqual(outOfScope);
  expect(await call(window, "return marko.file.save({ path: value, content: 'x', encoding: 'utf-8', bom: false, expectedHash: null })", secret)).toEqual(outOfScope);
  expect(await call(window, "return marko.workspace.open(value)", join(dir, "secret"))).toEqual(outOfScope);
  expect(readFileSync(secret, "utf8")).toBe("# Secret\n");

  // 文档状态说自己打开的是 secret.md：不收（不在范围里），「打开所在文件夹」还是这个文档的文件夹
  await call(window, "return marko.window.setDocumentState({ path: value, title: 'secret.md', edited: false, pristine: false, hash: null })", secret);
  const workspace = (await call(window, "return marko.workspace.openContaining()", null)) as { ok: boolean; value: { root: string } | null };
  expect(workspace.ok).toBe(true);
  expect(workspace.value?.root.toLowerCase()).toBe(join(dir, "docs").toLowerCase());
  expect(await call(window, "return marko.file.read(value)", secret)).toEqual(outOfScope);
});

test("X-1：插入媒体的原文件只收选的、拖进来的；页面编的路径不复制、不上传", async () => {
  const doc = join(dir, "docs", "doc.md");
  writeFileSync(doc, "# Doc\n");
  const photo = join(dir, "pictures", "photo.png");
  const other = join(dir, "pictures", "other.png");
  writeFileSync(photo, PNG);
  writeFileSync(other, PNG);
  launched = await launchApp([doc]);
  const window = await launched.app.firstWindow();
  await expect(window.locator("#write h1")).toHaveText("Doc");

  // 编的路径
  const forged = { documentPath: doc, sourcePath: other, name: "other.png" };
  expect(await call(window, "return marko.media.save(value)", forged)).toEqual({ ok: false, code: "out_of_scope" });

  // 系统给的文件（文件选择框，同拖进来的）：预加载脚本由 File 算出路径，可以插入
  await window.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.id = "e2e-files";
    input.style.display = "none";
    document.body.append(input);
  });
  await window.locator("#e2e-files").setInputFiles([photo]);
  const saved = await window.evaluate(async (documentPath) => {
    const marko = (window as unknown as { marko: { media: { pathOf(file: File): Promise<string>; save(request: unknown): Promise<{ ok: boolean; value?: { url: string } }> } } }).marko;
    const file = (document.getElementById("e2e-files") as HTMLInputElement).files![0]!;
    const sourcePath = await marko.media.pathOf(file);
    return marko.media.save({ documentPath, sourcePath, name: "photo.png" });
  }, doc);
  expect(saved.ok).toBe(true);
  // 拖进来过的那张可以，别的照样不行
  expect(await call(window, "return marko.media.save(value)", forged)).toEqual({ ok: false, code: "out_of_scope" });
  expect(existsSync(join(dir, "docs", "assets", "other.png"))).toBe(false);
});

test("N-4：本地链接打开范围外的 Markdown 文件并跳到 #标题；别的文件先问，取消了不打开", async () => {
  const doc = join(dir, "docs", "doc.md");
  writeFileSync(doc, "# Doc\n\n[去另一篇](../other/target.md#第二节)\n\n[附件](../other/file.pdf)\n");
  const filler = Array.from({ length: 60 }, (_, index) => `第 ${index + 1} 段。`).join("\n\n");
  writeFileSync(join(dir, "other", "target.md"), `# 第一节\n\n${filler}\n\n# 第二节\n\n到了。\n`);
  writeFileSync(join(dir, "other", "file.pdf"), "%PDF-1.4\n");
  launched = await launchApp([doc]);
  const app = launched;
  const window = await app.app.firstWindow();
  await expect(window.locator("#write h1")).toHaveText("Doc");
  // 不真的打开系统程序：记下主进程问了什么、打开了什么
  await app.app.evaluate(({ dialog, shell }) => {
    const record = globalThis as unknown as { asked: string[]; opened: string[]; answer: number };
    record.asked = [];
    record.opened = [];
    record.answer = 1;
    dialog.showMessageBox = (async (...args: unknown[]) => {
      const options = args.find((argument) => argument && typeof argument === "object" && "message" in (argument as object)) as { detail?: string };
      record.asked.push(options.detail ?? "");
      return { response: record.answer, checkboxChecked: false };
    }) as typeof dialog.showMessageBox;
    shell.openPath = (async (path: string) => {
      record.opened.push(path);
      return "";
    }) as typeof shell.openPath;
  });

  await window.locator("#write").getByText("去另一篇").click({ modifiers: ["Control"] });
  await expect.poll(() => windowTitles(app)).toContain("target.md - Marko");
  // 这个窗口有文档（不是空白的）：新开了一个窗口
  const opened = app.app.windows().find((page) => page !== window)!;
  await expect(opened.locator("#write h1").first()).toHaveText("第一节");
  // 光标在「第二节」这个标题上
  await expect.poll(() => opened.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest("h1")?.textContent ?? "")).toBe("第二节");

  // 别的文件：主进程问（显示完整路径），取消了不打开
  await window.locator("#write").getByText("附件").click({ modifiers: ["Control"] });
  await expect.poll(() => app.app.evaluate(() => (globalThis as unknown as { asked: string[] }).asked)).toEqual([join(dir, "other", "file.pdf")]);
  expect(await app.app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).toEqual([]);
  // 选「打开」才交给系统
  await app.app.evaluate(() => {
    (globalThis as unknown as { answer: number }).answer = 0;
  });
  await window.locator("#write").getByText("附件").click({ modifiers: ["Control"] });
  await expect.poll(() => app.app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).toEqual([join(dir, "other", "file.pdf")]);
});

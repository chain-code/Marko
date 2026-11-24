// 端到端（F-15）：把 Markdown 文件拖到窗口上打开；拖动时显示「松开以打开」。
// 拖进来的文件要有系统给的路径：先用文件选择框（setInputFiles）拿到系统的文件，再放进拖放事件里
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { launchApp, type LaunchedApp } from "./app.ts";

let dir: string;
let launched: LaunchedApp | null = null;

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "marko-drop-"));
});

test.afterEach(async () => {
  await launched?.close();
  launched = null;
  rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

/** 拿到系统里这些文件的 File（放在一个藏起来的文件选择框里） */
async function systemFiles(window: Page, paths: string[]): Promise<void> {
  await window.evaluate(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.id = "e2e-files";
    input.style.display = "none";
    document.body.append(input);
  });
  await window.locator("#e2e-files").setInputFiles(paths);
}

/** 在 selector 的元素上发一个带这些文件的拖放事件 */
async function dragFiles(window: Page, selector: string, type: "dragover" | "drop"): Promise<void> {
  await window.evaluate(
    ({ selector: target, type: eventType }) => {
      const input = document.getElementById("e2e-files") as HTMLInputElement;
      const transfer = new DataTransfer();
      for (const file of input.files ?? []) transfer.items.add(file);
      const element = document.querySelector(target)!;
      const box = element.getBoundingClientRect();
      element.dispatchEvent(
        new DragEvent(eventType, { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: box.left + 10, clientY: box.top + 10 }),
      );
    },
    { selector, type },
  );
}

async function title(app: LaunchedApp): Promise<string> {
  return app.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getTitle() ?? "");
}

test("F-15：拖 Markdown 文件到空白窗口上，提示「松开以打开」，松开就在这个窗口里打开", async () => {
  const file = join(dir, "dropped.md");
  writeFileSync(file, "# Dropped\n");
  launched = await launchApp([]);
  const app = launched;
  const window = await app.app.firstWindow();
  await window.waitForSelector("#write");
  await systemFiles(window, [file]);

  await dragFiles(window, "#write", "dragover");
  await expect(window.getByTestId("drop-hint")).toHaveText("松开以打开");
  await dragFiles(window, "#write", "drop");
  await expect(window.getByTestId("drop-hint")).toBeHidden();
  await expect(window.locator("#write h1")).toHaveText("Dropped");
  await expect.poll(() => title(app)).toBe("dropped.md - Marko");

  // 网页自己造的文件没有路径：什么都不打开，也不报错
  await window.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["# Fake"], "fake.md"));
    document.querySelector("#write")!.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await window.waitForTimeout(500);
  await expect(window.locator(".el-message--error")).toHaveCount(0);
  expect(await title(app)).toBe("dropped.md - Marko");
  expect(app.app.windows()).toHaveLength(1);
});

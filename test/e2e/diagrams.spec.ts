// D-3、D-4、D-6、1.2 节：图表沙箱。测试页在应用窗口里扮演宿主（同 @marko/render 的 SandboxFrameChannel）：
// 建 sandbox="allow-scripts" 的 iframe，等它发 ready，交给它一个 MessagePort，请求和回复都走端口
import { expect, test, type Page } from "@playwright/test";
import { scopeDiagramCss } from "../../packages/render/src/diagramStyle.ts";
import { launchApp } from "./app.ts";

interface Reply {
  id: string;
  svg?: string;
  error?: string;
}

/** 在应用页面里建沙箱 iframe、握手；端口放在 window.__sandboxPort 上 */
async function openSandbox(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const frame = document.createElement("iframe");
    frame.id = "diagram-sandbox";
    frame.setAttribute("sandbox", "allow-scripts");
    frame.style.cssText = "position:absolute;left:-10000px;top:0;width:1000px;height:800px;border:0";
    const ready = new Promise<void>((resolve) => {
      window.addEventListener("message", (event) => {
        if (event.source === frame.contentWindow && (event.data as { type?: string })?.type === "ready") resolve();
      });
    });
    frame.src = new URL("sandbox.html", location.href).href;
    document.body.append(frame);
    await ready;
    const { port1, port2 } = new MessageChannel();
    frame.contentWindow?.postMessage({ type: "connect" }, "*", [port2]);
    (window as unknown as { __sandboxPort: MessagePort }).__sandboxPort = port1;
  });
}

/** 经端口发一批请求，按顺序等回复（一次一个，同宿主） */
async function ask(page: Page, requests: Array<{ kind: string; source: string; theme: string }>): Promise<Reply[]> {
  return page.evaluate(async (list) => {
    const port = (window as unknown as { __sandboxPort: MessagePort }).__sandboxPort;
    const replies: Reply[] = [];
    for (const [index, request] of list.entries()) {
      const id = `e2e-${index + 1}`;
      replies.push(
        await new Promise<Reply>((resolve) => {
          port.onmessage = (event) => {
            if ((event.data as Reply).id === id) resolve(event.data as Reply);
          };
          port.postMessage({ id, ...request });
        }),
      );
    }
    return replies;
  }, requests);
}

test("图表沙箱：Mermaid、flowchart.js、js-sequence-diagrams 都能画；语法错误回错误信息", async () => {
  const { app, close } = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await openSandbox(page);
    const results = await ask(page, [
      { kind: "mermaid", source: "graph TD\n  A[开始] --> B[结束]", theme: "light" },
      { kind: "flowchart", source: "st=>start: Start\ne=>end: End\nst->e", theme: "light" },
      { kind: "sequence", source: "Alice->Bob: Hello", theme: "light" },
      { kind: "mermaid", source: "sequenceDiagram\n  Alice->>Bob: 你好", theme: "dark" },
      { kind: "mermaid", source: "graph TD\n  A -->", theme: "light" },
      { kind: "sequence", source: "Alice->Bob: Hello", theme: "dark" },
    ]);
    expect(results[0].svg).toMatch(/^<svg[\s\S]*开始[\s\S]*<\/svg>$/);
    expect(results[1].svg).toMatch(/^<svg[\s\S]*Start[\s\S]*<\/svg>$/);
    expect(results[2].svg).toMatch(/^<svg[\s\S]*Alice[\s\S]*<\/svg>$/);
    expect(results[3].svg).toMatch(/^<svg[\s\S]*你好[\s\S]*<\/svg>$/);
    expect(results[4].svg).toBeUndefined();
    expect(results[4].error).toBeTruthy();
    // 深色主题的时序图不能还是黑线黑字；箭头（marker 里的 <use>）在
    expect(results[5].svg).toMatch(/^<svg[\s\S]*Alice[\s\S]*<\/svg>$/);
    expect(results[5].svg).not.toMatch(/(?:fill|stroke)="#000000"/);
    expect(results[2].svg).toMatch(/<marker[\s\S]*<use /);
    // Mermaid 的 id 是「marko-mermaid-<沙箱实例的随机串>-<序号>」，<style> 按它限定范围（diagramStyle.ts）
    const ids = [results[0], results[3]].map((result) => /^<svg[^>]* id="([^"]+)"/.exec(result.svg ?? "")?.[1]);
    expect(ids[0]).toMatch(/^marko-mermaid-[0-9a-f]{8}-\d+$/);
    expect(ids[1]).not.toBe(ids[0]);
  } finally {
    await close();
  }
});

test("D-3 Mermaid 常用的几种图都能画，样式都过得了宿主的范围检查", async () => {
  const { app, close } = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await openSandbox(page);
    const sources = [
      "classDiagram\n  Animal <|-- Duck\n  Animal : +int age",
      "stateDiagram-v2\n  [*] --> 草稿\n  草稿 --> 已发布\n  已发布 --> [*]",
      "gantt\n  title 计划\n  dateFormat YYYY-MM-DD\n  section 阶段\n  设计 :a1, 2026-01-01, 7d\n  实现 :after a1, 14d",
      'pie title 占比\n  "甲" : 40\n  "乙" : 60',
      "erDiagram\n  USER ||--o{ ORDER : places",
      "journey\n  title 一天\n  section 上午\n    写文档: 5: 我",
      "gitGraph\n  commit\n  branch dev\n  commit\n  checkout main\n  merge dev",
      "mindmap\n  root((Marko))\n    编辑\n    导出",
      "timeline\n  title 历史\n  2024 : 立项\n  2025 : 发布",
      "quadrantChart\n  title 象限\n  x-axis 低 --> 高\n  y-axis 低 --> 高\n  A: [0.3, 0.6]",
      "flowchart LR\n  A e1@--> B\n  e1@{ animate: true }",
    ];
    const results = await ask(
      page,
      sources.map((source, index) => ({ kind: "mermaid", source, theme: index % 2 ? "dark" : "light" })),
    );
    for (const [index, result] of results.entries()) {
      expect(result.error, sources[index]).toBeUndefined();
      expect(result.svg, sources[index]).toMatch(/^<svg[\s\S]*<style>[\s\S]*<\/svg>$/);
      // 宿主过滤时会检查 <style> 只作用于这张图（diagramStyle.ts）；真实的 Mermaid 输出必须过得去，否则配色会被清空
      const id = /^<svg[^>]* id="([^"]+)"/.exec(result.svg ?? "")?.[1] ?? "";
      for (const [, css] of (result.svg ?? "").matchAll(/<style>([\s\S]*?)<\/style>/g)) {
        expect(scopeDiagramCss(css, id), sources[index]).not.toBeNull();
      }
    }
  } finally {
    await close();
  }
});

test("1.2 节：沙箱只认第一条 connect 交来的端口；直接发到窗口上的请求、第二个端口上的请求都不理", async () => {
  const { app, close } = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await openSandbox(page);
    const ignored = await page.evaluate(async () => {
      const frame = document.getElementById("diagram-sandbox") as HTMLIFrameElement;
      const request = { kind: "mermaid", source: "graph TD\n  A --> B", theme: "light" };
      let replied = false;
      window.addEventListener("message", (event) => {
        if (event.source === frame.contentWindow && (event.data as { id?: string })?.id) replied = true;
      });
      frame.contentWindow?.postMessage({ id: "window-1", ...request }, "*");
      const second = new MessageChannel();
      second.port1.onmessage = () => {
        replied = true;
      };
      frame.contentWindow?.postMessage({ type: "connect" }, "*", [second.port2]);
      second.port1.postMessage({ id: "second-1", ...request });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return !replied;
    });
    expect(ignored).toBe(true);
    // 正经端口照常工作
    const [reply] = await ask(page, [{ kind: "mermaid", source: "graph TD\n  A --> B", theme: "light" }]);
    expect(reply.svg).toMatch(/^<svg/);
  } finally {
    await close();
  }
});

test("1.2 节：沙箱是不透明源，碰不到父页面，也没有 window.marko", async () => {
  const { app, close } = await launchApp();
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await openSandbox(page);
    const sandbox = page.frames().find((frame) => frame.url().endsWith("/sandbox.html"));
    expect(sandbox).toBeDefined();
    const inside = await sandbox!.evaluate(() => {
      let parent = "readable";
      try {
        void window.parent.document.body;
      } catch {
        parent = "blocked";
      }
      return { origin: window.origin, marko: typeof (window as { marko?: unknown }).marko, parent };
    });
    expect(inside).toEqual({ origin: "null", marko: "undefined", parent: "blocked" });
    // 反过来，父页面也读不到沙箱的文档
    const outside = await page.evaluate(() => {
      const frame = document.getElementById("diagram-sandbox") as HTMLIFrameElement;
      try {
        return frame.contentDocument === null ? "blocked" : "readable";
      } catch {
        return "blocked";
      }
    });
    expect(outside).toBe("blocked");
  } finally {
    await close();
  }
});

test("D-3、D-4：文档里的图表在编辑区里画出来（应用自己的沙箱页）；语法错了显示错误", async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "marko-diagram-"));
  const file = join(dir, "d.md");
  writeFileSync(file, "```mermaid\ngraph TD\n  A-->B\n```\n\n```sequence\nAlice->Bob: Hi\n```\n\n```mermaid\nnot a diagram ((\n```\n\nend\n");
  const { app, close } = await launchApp([file]);
  try {
    const window = await app.firstWindow();
    await window.waitForSelector("#write p");
    const panels = window.locator("#write .md-diagram-panel");
    await expect(panels.nth(0).locator("svg").first()).toBeVisible({ timeout: 20_000 });
    await expect(panels.nth(1).locator("svg").first()).toBeVisible({ timeout: 20_000 });
    // 画不出来：显示图表库给的错误信息（D-6）
    await expect(panels.nth(2)).toHaveClass(/md-diagram-error/, { timeout: 20_000 });
    await expect(panels.nth(2)).toContainText("No diagram type detected");
  } finally {
    await close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});

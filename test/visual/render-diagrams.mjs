// 视觉对照用（阶段 3）：在构建好的应用里用真的图表沙箱，把 visual-export 记下的图表请求画成 SVG。
// 先 npm run build -w @marko/desktop；一般由 build-html.mjs 调用：
//   node test/visual/render-diagrams.mjs <视觉输出目录>
// 读 <目录>/diagram-requests.json，写 <目录>/diagrams.json（键是「主题\n种类\n源码」，值是沙箱的回复 { svg } 或 { error }）。
// 测试页扮演宿主：和 @marko/render 的 SandboxFrameChannel 一样，等沙箱 ready，交给它一个 MessagePort，请求一次一个
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";

/** 一张图最多等这么久 */
const TIMEOUT_MS = 30_000;

const [dir] = process.argv.slice(2);
if (!dir) {
  console.error("用法：node test/visual/render-diagrams.mjs <视觉输出目录>");
  process.exit(1);
}
const requests = JSON.parse(readFileSync(join(dir, "diagram-requests.json"), "utf8"));
// 末尾不能带分隔符（同 test/e2e/app.ts）
const desktop = fileURLToPath(new URL("../../apps/desktop", import.meta.url));
const userData = mkdtempSync(join(tmpdir(), "marko-visual-"));
const app = await electron.launch({ args: [desktop, `--user-data-dir=${userData}`], cwd: desktop });
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  const replies = await page.evaluate(
    async ({ list, timeoutMs }) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.style.cssText = "position:absolute;left:-10000px;top:0;width:1000px;height:800px;border:0";
      const ready = new Promise((resolve) => {
        window.addEventListener("message", (event) => {
          if (event.source === frame.contentWindow && event.data?.type === "ready") resolve();
        });
      });
      frame.src = new URL("sandbox.html", location.href).href;
      document.body.append(frame);
      await ready;
      const { port1, port2 } = new MessageChannel();
      frame.contentWindow.postMessage({ type: "connect" }, "*", [port2]);
      const results = [];
      for (const [index, request] of list.entries()) {
        const id = `visual-${index + 1}`;
        results.push(
          await new Promise((resolve) => {
            const timer = setTimeout(() => resolve({ id, error: "超时" }), timeoutMs);
            port1.onmessage = (event) => {
              if (event.data?.id !== id) return;
              clearTimeout(timer);
              resolve(event.data);
            };
            port1.postMessage({ id, kind: request.kind, source: request.source, theme: request.theme });
          }),
        );
      }
      return results;
    },
    { list: requests, timeoutMs: TIMEOUT_MS },
  );
  const rendered = {};
  requests.forEach((request, index) => {
    const { svg, error } = replies[index];
    rendered[`${request.theme}\n${request.kind}\n${request.source}`] = svg === undefined ? { error } : { svg };
  });
  writeFileSync(join(dir, "diagrams.json"), JSON.stringify(rendered, null, 2));
  const failed = replies.filter((reply) => reply.svg === undefined).length;
  console.log(`画了 ${requests.length} 张图（失败 ${failed} 张）→ ${join(dir, "diagrams.json")}`);
} finally {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}

// 视觉测试的第一步（1.13 节）：把 test/visual/corpus 渲染成 HTML，图表用构建好的应用里的沙箱画。
//   1. packages/render 的 visual-export 测试导出 HTML，记下要画的图表；
//   2. render-diagrams.mjs 启动应用，在沙箱里画；
//   3. 再导出一遍，这次图表是 SVG。
// 用法：node test/visual/build-html.mjs [输出目录]，默认 test/visual/.out/html。要先 npm run build -w @marko/desktop
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const out = resolve(process.argv[2] ?? join(repo, "test", "visual", ".out", "html"));
// 输出目录里放一个标记文件：只清空自己建的目录，传错路径也不会删掉别的东西
const MARKER = ".marko-visual-out";

if (!existsSync(join(repo, "apps", "desktop", "out", "renderer", "sandbox.html"))) {
  console.error("应用还没构建：先 npm run build -w @marko/desktop");
  process.exit(1);
}

if (existsSync(out)) {
  if (!existsSync(join(out, MARKER)) && readdirSync(out).length > 0) {
    console.error(`${out} 不是视觉测试的输出目录（没有 ${MARKER}），不清空它`);
    process.exit(1);
  }
  rmSync(out, { recursive: true, force: true });
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, MARKER), "test/visual/build-html.mjs 的输出目录，可以整个删掉\n");

// 直接用 node 跑，不经过 shell：路径里有空格也没事
function runNode(script, args, options) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const vitest = join(dirname(createRequire(import.meta.url).resolve("vitest/package.json")), "vitest.mjs");

function exportHtml() {
  runNode(vitest, ["run", "test/visual-export.test.ts"], {
    cwd: join(repo, "packages", "render"),
    env: { ...process.env, MARKO_VISUAL_OUT: out },
  });
}

exportHtml();
if (existsSync(join(out, "diagram-requests.json"))) {
  runNode(join(repo, "test", "visual", "render-diagrams.mjs"), [out], { cwd: repo });
  exportHtml();
}
if (existsSync(join(out, "diagram-requests.json"))) {
  console.error("还有图表没画出来，见 diagram-requests.json");
  process.exit(1);
}
console.log(`HTML → ${out}`);

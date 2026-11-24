// R-1：在打好的应用上跑端到端测试（npm run test:e2e:packaged [-- Playwright 的参数]）。
// 包打在仓库外面的临时目录里：放在仓库里时 Node 会往上找到工作区的 node_modules，安装包里缺的模块查不出来。
// 正式安装包的 Fuses 不许 --inspect（Playwright 连不上主进程），测试用的包只放开这一项；跑完删掉
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const desktop = join(repo, "apps", "desktop");
const out = mkdtempSync(join(tmpdir(), "marko-packaged-"));

function executableIn(directory) {
  if (process.platform === "win32") return join(directory, "win-unpacked", "Marko.exe");
  if (process.platform === "darwin") return join(directory, `mac-${process.arch}`, "Marko.app", "Contents", "MacOS", "Marko");
  return join(directory, "linux-unpacked", "marko");
}

const run = (command, options = {}) => execSync(command, { stdio: "inherit", cwd: repo, ...options });

try {
  run("npm run build -w @marko/desktop");
  run(`npx electron-builder --dir --publish never -c.electronFuses.enableNodeCliInspectArguments=true "-c.directories.output=${out}"`, { cwd: desktop });
  const extra = process.argv.slice(2).map((argument) => JSON.stringify(argument)).join(" ");
  run(`npx playwright test -c test/e2e/playwright.config.ts ${extra}`, { env: { ...process.env, MARKO_E2E_EXECUTABLE: executableIn(out) } });
} finally {
  rmSync(out, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}

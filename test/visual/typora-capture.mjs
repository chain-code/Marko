// 用本机的 Typora 截视觉对照图（阶段 0，test/visual/README.md）。
// 后台窗口翻不了页，所以把每个语料按二级标题切成小段，每段单独打开、截一张（typora-window.ps1）。
//
// 注意：Typora 总是用本机的 %APPDATA%\Typora（不认 --user-data-dir，也不读 APPDATA 环境变量），
// 所以只截默认设置，不改它的偏好；截完把本次加进「最近文件」的条目删掉。Typora 正在运行时不截。
//
// 用法：node test/visual/typora-capture.mjs [Typora.exe 的路径] [只截某个语料名的前缀]
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const typoraExe = process.argv[2] ?? "C:\\软件安装\\Typora\\Typora.exe";
const only = process.argv[3];
const corpusDir = join(here, "corpus");
const outDir = join(here, "typora");
const historyFile = join(process.env.APPDATA ?? "", "Typora", "history.data");
mkdirSync(outDir, { recursive: true });

/** 按「## 」切段；第一段带上文档标题；有 Front Matter 的文件不切。 */
export function splitIntoChunks(text) {
  if (text.startsWith("---")) return [text];
  const lines = text.split("\n");
  const chunks = [];
  let current = [];
  let inFence = false;
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^## /.test(line) && current.some((item) => item.trim())) {
      chunks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.some((item) => item.trim())) chunks.push(current.join("\n"));
  return chunks;
}

function typoraRunning() {
  const output = execFileSync("tasklist", ["/FI", "IMAGENAME eq Typora.exe", "/NH"], { encoding: "utf8" });
  return /Typora\.exe/i.test(output);
}

/** 删掉「最近文件」里本次截图加进去的条目（路径在临时切段目录里）。 */
function cleanHistory(workDir) {
  if (!existsSync(historyFile) || typoraRunning()) return 0;
  const data = JSON.parse(Buffer.from(readFileSync(historyFile, "utf8").trim(), "hex").toString("utf8"));
  const before = data.recentDocument?.length ?? 0;
  const prefix = basename(workDir).toLowerCase();
  data.recentDocument = (data.recentDocument ?? []).filter((entry) => !String(entry.path).toLowerCase().includes(prefix));
  writeFileSync(historyFile, Buffer.from(JSON.stringify(data), "utf8").toString("hex"), "utf8");
  return before - data.recentDocument.length;
}

if (typoraRunning()) {
  console.error("Typora 正在运行：先关掉它再截图（截图要用 Typora 的默认配置，并在截完后清理最近文件）");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "marko-typora-chunks-"));
cpSync(join(corpusDir, "assets"), join(work, "assets"), { recursive: true });
const files = readdirSync(corpusDir)
  .filter((name) => name.endsWith(".md") && !name.startsWith("90-"))
  .filter((name) => !only || name.startsWith(only))
  .sort();

const results = [];
try {
  for (const file of files) {
    const name = basename(file, ".md");
    const chunks = splitIntoChunks(readFileSync(join(corpusDir, file), "utf8"));
    chunks.forEach((chunk, index) => {
      const chunkName = `${name}-${String(index + 1).padStart(2, "0")}`;
      const chunkFile = join(work, `${chunkName}.md`);
      writeFileSync(chunkFile, chunk, "utf8");
      const output = join(outDir, `${chunkName}.png`);
      const stdout = execFileSync("powershell", [
        "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", join(here, "typora-window.ps1"),
        "-Exe", typoraExe, "-File", chunkFile, "-Out", output,
      ], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      results.push(`${chunkName}: ${stdout.trim().split("\n").pop()}`);
    });
  }
} finally {
  const removed = cleanHistory(work);
  results.push(`从 Typora 的最近文件里删掉本次加进去的 ${removed} 条`);
  rmSync(work, { recursive: true, force: true });
}
console.log(results.join("\n"));

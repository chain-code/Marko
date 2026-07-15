import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), ".tmp-tests");

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

execFileSync(
  process.execPath,
  [join("node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.test.json"],
  { stdio: "inherit" },
);

writeFileSync(join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }), "utf8");

const testFiles = collectTestFiles(join(outDir, "tests"));
execFileSync(process.execPath, ["--test", ...testFiles], { stdio: "inherit" });

function collectTestFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(path);
    }
    return entry.name.endsWith(".test.js") ? [path] : [];
  });
}

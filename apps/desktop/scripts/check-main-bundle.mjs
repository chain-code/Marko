// 构建以后检查主进程的产物（R-1）：安装包里不带 node_modules，除了 Electron、Node 自带的模块和这两个原生依赖
// （electron-builder.yml 单独带上的），产物里不能再引用别的包——有的话装好的应用一启动就找不到模块。
// 只靠「哪些依赖要打进去」的名单容易漏（@intlify/core-base 就漏过：在仓库里跑没事，Node 会往上找到工作区的 node_modules）
import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const ALLOWED = new Set(["electron", "@parcel/watcher", "@vscode/ripgrep"]);
const bundle = fileURLToPath(new URL("../out/main/index.js", import.meta.url));
const source = readFileSync(bundle, "utf8");

// rollup 把外部引用都写成行首的 import 声明（CommonJS 里 require 外部的也转成这个）；动态的是 import("…")。
// 只认这两种、只认合法的模块名：字符串里写着的 require("…")（ajv 生成代码用的）不算
const NAME = "[@\\w./-]+";
const specifiers = new Set();
for (const pattern of [new RegExp(`^import\\s[^;]*?\\bfrom\\s*"(${NAME})"`, "gm"), new RegExp(`^import\\s*"(${NAME})"`, "gm"), new RegExp(`\\bimport\\(\\s*"(${NAME})"\\s*\\)`, "g")]) {
  for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
}

const builtins = new Set(builtinModules);
const unexpected = [...specifiers].filter((name) => {
  if (name.startsWith("node:") || name.startsWith(".") || builtins.has(name) || builtins.has(name.split("/")[0])) return false;
  const packageName = name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];
  return !ALLOWED.has(packageName);
});

if (unexpected.length) {
  console.error(`主进程的产物引用了不会带进安装包的模块：${unexpected.join("、")}\n要么打进产物（electron.vite.config.ts），要么在 electron-builder.yml 里带上并加进这里的名单`);
  process.exit(1);
}
console.log(`主进程的产物：外部引用只有 ${[...specifiers].filter((name) => !name.startsWith(".")).length} 个 Electron、Node 自带的模块和原生依赖`);

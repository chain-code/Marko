// 库的类型声明（K-1）：vue-tsc 生成到 dist-lib/.types 以后，只留对外的几个文件放到 dist-lib，删掉临时目录。
// 对外的声明只能引用 vue 和这几个文件自己（内部的包不发布，装库的项目里没有）；引用了别的就报错
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const generated = join(root, "dist-lib", ".types", "editor-vue", "src");
const output = join(root, "dist-lib");
const PUBLIC = ["library", "index", "MarkoEditor.vue", "defaults", "types"];

const problems = [];
for (const name of PUBLIC) {
  const source = join(generated, `${name}.d.ts`);
  if (!existsSync(source)) {
    problems.push(`没有生成 ${name}.d.ts`);
    continue;
  }
  let text = readFileSync(source, "utf8")
    // 样式是构建产物里的 marko-editor.css（入口已经引用），声明里不要
    .replace(/^import "\.\/style\.css";\r?\n/m, "")
    // ".ts" 结尾的相对引用换成 ".js"：各种 moduleResolution 都能找到对应的 .d.ts
    .replace(/(from\s+["']\.\/[^"']+)\.ts(["'])/g, "$1.js$2");
  for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith(".") && specifier !== "vue") problems.push(`${name}.d.ts 引用了 ${specifier}`);
  }
  if (name === "library") text = `// marko 库的类型声明（K-1）：import { MarkoMarkdownBody } from "marko"\n${text}`;
  writeFileSync(join(output, `${name}.d.ts`), text);
}
rmSync(join(output, ".types"), { recursive: true, force: true });
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`库的类型声明：${PUBLIC.map((name) => `${name}.d.ts`).join("、")}`);

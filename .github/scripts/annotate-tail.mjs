// 把一个日志文件的最后几十行写成一条 GitHub 标注（工作流命令 ::error / ::notice）。
// 标注直接显示在运行结果的页面上，公开的 API 也读得到；运行日志要有仓库的管理权限才能下载。
// 用法：node .github/scripts/annotate-tail.mjs <日志文件> <标题> [error|notice，默认 error] [行数，默认 40]
// 日志文件不存在时什么也不做（失败发生在写日志之前的步骤里）
import { existsSync, readFileSync } from "node:fs";

const [file, title, level = "error", count = "40"] = process.argv.slice(2);
if (!file || !existsSync(file)) process.exit(0);

const lines = readFileSync(file, "utf8")
  .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "") // 终端颜色
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .slice(-Number(count));

// 工作流命令的转义：消息里的 %、回车、换行；属性（title）里再加上 : 和 ,
const escapeData = (text) => text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (text) => escapeData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");

console.log(`::${level} title=${escapeProperty(title ?? "失败")}::${escapeData(lines.join("\n"))}`);

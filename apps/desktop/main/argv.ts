// F-14：命令行、系统交过来的文件（第一次启动时带的、再次运行时交给已经在运行的这个）
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 参数里的文件：相对路径按启动时的目录；file:// 地址也认（Linux 上 .desktop 文件写的是 %U，文件管理器交过来的是地址）；
 * 选项（- 开头）、不存在的、文件夹不算
 */
export function filesIn(argv: readonly string[], workingDirectory: string): string[] {
  const paths: string[] = [];
  for (const value of argv) {
    if (!value || value.startsWith("-")) continue;
    let path: string;
    try {
      path = /^file:\/\//i.test(value) ? fileURLToPath(value) : resolve(workingDirectory, value);
    } catch {
      continue;
    }
    try {
      if (existsSync(path) && statSync(path).isFile()) paths.push(path);
    } catch {
      // 读不了：不算
    }
  }
  return paths;
}

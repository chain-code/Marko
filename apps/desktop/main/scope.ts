// 路径白名单（1.10 节）：渲染进程给的路径只能是用户主动打开过的——对话框选的、拖进来的、命令行和系统打开的文件，
// 最近文件，工作区目录，以及这些文档所在目录下按 M-3 写入的资源目录。不在范围内的调用返回 out_of_scope
import { resolve, sep } from "node:path";

/** 比较用的形式：绝对路径；Windows、macOS 的文件系统不分大小写 */
function keyOf(path: string): string {
  const absolute = resolve(path);
  return process.platform === "linux" ? absolute : absolute.toLowerCase();
}

export class Scope {
  private readonly files = new Set<string>();
  private readonly directories = new Set<string>();

  /** 用户打开过的文件 */
  allowFile(path: string): void {
    this.files.add(keyOf(path));
  }

  /** 工作区、资源目录：里面的文件都可以 */
  allowDirectory(path: string): void {
    this.directories.add(keyOf(path));
  }

  has(path: string): boolean {
    if (!path) return false;
    const key = keyOf(path);
    if (this.files.has(key)) return true;
    for (const directory of this.directories) {
      if (key === directory || key.startsWith(directory.endsWith(sep) ? directory : directory + sep)) return true;
    }
    return false;
  }
}

/** 整个应用共用一份（所有窗口打开过的都算） */
export const scope = new Scope();

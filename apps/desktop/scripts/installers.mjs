// 打包（npm run dist）的前后两步：打包前清掉 release/，旧版本的安装包不留着；打包后把这次的安装包和免安装的程序
// 拷到仓库根目录的「安装包」文件夹，里面只有最新的一份，好找。CI 发版也走这两步，上传的还是 release/ 里的
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = fileURLToPath(new URL("..", import.meta.url));
const release = join(desktop, "release");
const target = join(desktop, "..", "..", "安装包");
const { version } = JSON.parse(readFileSync(join(desktop, "package.json"), "utf8"));
/** 安装包：Windows 的 exe、macOS 的 dmg、Linux 的 AppImage 和 deb（zip、blockmap、yml 是自动更新用的，不拷） */
const INSTALLER = /\.(exe|dmg|AppImage|deb)$/;
/** 免安装的程序：win-unpacked、linux-unpacked 整个目录（exe 离不开同目录的运行库和资源）；macOS 的程序在 dmg 里 */
const UNPACKED = /^(.+)-unpacked$/;

const mode = process.argv[2];
if (mode === "clean") rmSync(release, { recursive: true, force: true });
else if (mode === "collect") {
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  for (const name of readdirSync(release)) {
    const unpacked = UNPACKED.exec(name);
    if (INSTALLER.test(name)) copyFileSync(join(release, name), join(target, name));
    else if (unpacked) cpSync(join(release, name), join(target, `Marko-${version}-${unpacked[1]}-免安装`), { recursive: true });
  }
  console.log(`安装包：${target}`);
} else throw new Error(`用法：node scripts/installers.mjs clean | collect（收到的是 ${mode}）`);

// 端到端测试的公共函数：用临时的 userData 目录启动构建好的应用
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, type ElectronApplication } from "@playwright/test";

// 末尾不能带分隔符：Windows 拼命令行时「\"」会把引号转义掉，后面的参数就粘在一起了
export const desktopDir = fileURLToPath(new URL("../../apps/desktop", import.meta.url));

export interface LaunchedApp {
  app: ElectronApplication;
  userData: string;
  close(): Promise<void>;
  /** 模拟崩溃、断电：直接结束进程，不走关窗口的确认，userData 留着（F-9 草稿恢复） */
  crash(): Promise<void>;
  /** 正常退出（同用户退出），userData 留着（F-16 下次启动恢复） */
  quit(): Promise<void>;
}

/** 结束这次测试启动的应用（连同它的子进程：渲染进程、GPU 进程），等它退出 */
async function kill(app: ElectronApplication): Promise<void> {
  const child = app.process();
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  if (process.platform === "win32" && child.pid) {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      child.kill("SIGKILL");
    }
  } else child.kill("SIGKILL");
  await exited;
  // 子进程放开 userData 里的文件（单实例锁、缓存）要一点时间
  await new Promise((resolve) => setTimeout(resolve, 500));
}

/**
 * 删临时目录：子进程刚退出时文件可能还占着，重试几次（最多十来秒）。还删不掉（杀毒软件、索引服务占着）时只提示，
 * 不算测试失败——测的东西已经测完了，留下的只是系统临时目录里的一个文件夹
 */
function remove(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 40, retryDelay: 300 });
  } catch (error) {
    console.warn(`临时目录没删掉（${error instanceof Error ? error.message : String(error)}）：${path}`);
  }
}

/**
 * 打好的应用（R-1：核对安装包里的东西都在）：设了 MARKO_E2E_EXECUTABLE 就启动它，不启动开发目录里的。
 * 正式安装包的 Fuses 不许 --inspect（Playwright 连不上主进程），测试用的包另打一份放开这一项
 */
const packagedExecutable = process.env.MARKO_E2E_EXECUTABLE;

/**
 * userData：沿用上一次的（重新启动），不给时新建一个临时的。
 * systemColorScheme：页面的 prefers-color-scheme 跟着系统（nativeTheme）；不给时 Playwright 固定模拟成浅色（结果不受这台机器的设置影响）
 */
export async function launchApp(args: string[] = [], options: { userData?: string; systemColorScheme?: boolean } = {}): Promise<LaunchedApp> {
  const userData = options.userData ?? mkdtempSync(join(tmpdir(), "marko-e2e-"));
  const colorScheme = options.systemColorScheme ? { colorScheme: null } : {};
  const app = await electron.launch(
    packagedExecutable
      ? // 打好的包会检查更新：测试里不要（不连 GitHub）
        { executablePath: packagedExecutable, args: [`--user-data-dir=${userData}`, ...args], env: { ...process.env, MARKO_NO_UPDATE: "1" }, ...colorScheme }
      : {
          ...colorScheme,
          // 传应用目录（不是 out/main/index.js），这样 app.getVersion() 读的是应用自己的 package.json
          args: [desktopDir, `--user-data-dir=${userData}`, ...args],
          cwd: desktopDir,
        },
  );
  let closed = false;
  return {
    app,
    userData,
    async close() {
      if (!closed) {
        // 测试结束时还有没保存的改动：退出会停在未保存确认上（F-10），等 5 秒还没退就直接结束
        const quit = app.close().then(() => true);
        const timedOut = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5_000));
        if (!(await Promise.race([quit, timedOut]))) await kill(app);
      }
      closed = true;
      remove(userData);
    },
    async crash() {
      await kill(app);
      closed = true;
    },
    async quit() {
      await app.close();
      closed = true;
      // 子进程放开 userData 里的单实例锁
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
  };
}

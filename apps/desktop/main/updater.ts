// R-4：自动更新（electron-updater，更新源是 GitHub Releases）。只在安装好的版本里：启动后过一会儿检查（S-13「自动检查更新」可以关），
// 有新版本就在后台下载，下载完告诉窗口「重启以更新」；「帮助 → 检查更新」手动检查，结果告诉当前窗口。
// 开发时运行、设了 MARKO_NO_UPDATE（测试、管理员不想要自动更新）时不检查，手动检查只提示不检查
import type { UpdateStatus } from "@marko/shared";

/** electron-updater 的 autoUpdater 用到的那几样（测试换成假的） */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates(): Promise<{ isUpdateAvailable: boolean; updateInfo: { version: string } } | null>;
  quitAndInstall(): void;
  on(event: "update-downloaded", listener: (info: { version: string }) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
}

export interface UpdateService {
  /** manual：用户点的「检查更新」——没有新版本、出错也要告诉用户；自动检查只在下载好以后说 */
  check(manual: boolean): Promise<void>;
  /** 用户点了「重启以更新」 */
  install(): void;
}

/**
 * updater 是 null：这个版本不检查更新（开发时运行、MARKO_NO_UPDATE）。
 * closeAll：装之前先挨个窗口确认、关掉（F-10），都关掉了再装——安装程序会结束还在运行的应用，不能让它关掉开着的确认框
 */
export function createUpdateService(
  updater: UpdaterLike | null,
  currentVersion: string,
  notify: (status: UpdateStatus) => void,
  closeAll: (then: () => void) => void = (then) => then(),
): UpdateService {
  let downloaded: string | null = null;
  let checking = false;
  if (updater) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on("update-downloaded", (info) => {
      downloaded = info.version;
      notify({ kind: "downloaded", version: info.version });
    });
    // 后台下载出错：不打扰用户（下次启动再试）；手动检查的错误在 check 里报
    updater.on("error", () => undefined);
  }
  return {
    async check(manual) {
      if (!updater) {
        if (manual) notify({ kind: "disabled", version: currentVersion });
        return;
      }
      if (downloaded) {
        if (manual) notify({ kind: "downloaded", version: downloaded });
        return;
      }
      if (checking) return;
      checking = true;
      try {
        const result = await updater.checkForUpdates();
        if (!manual) return;
        if (result?.isUpdateAvailable) notify({ kind: "available", version: result.updateInfo.version });
        else notify({ kind: "none", version: currentVersion });
      } catch (error) {
        if (manual) notify({ kind: "error", version: currentVersion, message: error instanceof Error ? error.message : String(error) });
      } finally {
        checking = false;
      }
    },
    install() {
      if (updater && downloaded) closeAll(() => updater.quitAndInstall());
    },
  };
}

/** 应用里只有一个（启动时建好），菜单、接口用它 */
let active: UpdateService | null = null;

/** 启动时：记下服务；设置里开着「自动检查更新」时过一会儿检查（不拖慢启动） */
export function startUpdates(service: UpdateService, autoCheck: boolean, delay = 10_000): void {
  active = service;
  if (autoCheck) setTimeout(() => void service.check(false), delay).unref?.();
}

/** 「帮助 → 检查更新」 */
export function checkForUpdatesNow(): void {
  void active?.check(true);
}

export function installUpdate(): void {
  active?.install();
}

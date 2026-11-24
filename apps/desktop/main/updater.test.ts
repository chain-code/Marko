// R-4：自动更新——自动检查只在下载好以后说；手动检查没有新版本、出错都说；没下载好不装；这个版本不检查时手动检查只提示
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "@marko/shared";
import { createUpdateService, type UpdaterLike } from "./updater.ts";

class FakeUpdater extends EventEmitter implements UpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  result: { isUpdateAvailable: boolean; updateInfo: { version: string } } | null = null;
  failure: Error | null = null;
  quitAndInstall = vi.fn();
  async checkForUpdates() {
    if (this.failure) throw this.failure;
    return this.result;
  }
}

function setup(updater: FakeUpdater | null) {
  const statuses: UpdateStatus[] = [];
  const service = createUpdateService(updater, "2.0.0", (status) => statuses.push(status));
  return { service, statuses };
}

describe("R-4 自动更新", () => {
  it("后台下载；自动检查不说话，下载好了才说「重启以更新」；点了才装", async () => {
    const updater = new FakeUpdater();
    const { service, statuses } = setup(updater);
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    updater.result = { isUpdateAvailable: true, updateInfo: { version: "2.1.0" } };
    await service.check(false);
    expect(statuses).toEqual([]);
    service.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit("update-downloaded", { version: "2.1.0" });
    expect(statuses).toEqual([{ kind: "downloaded", version: "2.1.0" }]);
    service.install();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("手动检查：有新版本（正在下载）、已经是最新的、出错都告诉用户；后台的错误不打扰", async () => {
    const updater = new FakeUpdater();
    const { service, statuses } = setup(updater);
    updater.result = { isUpdateAvailable: true, updateInfo: { version: "2.1.0" } };
    await service.check(true);
    updater.result = { isUpdateAvailable: false, updateInfo: { version: "2.0.0" } };
    await service.check(true);
    updater.failure = new Error("net::ERR_INTERNET_DISCONNECTED");
    await service.check(true);
    await service.check(false);
    updater.emit("error", new Error("后台下载失败"));
    expect(statuses).toEqual([
      { kind: "available", version: "2.1.0" },
      { kind: "none", version: "2.0.0" },
      { kind: "error", version: "2.0.0", message: "net::ERR_INTERNET_DISCONNECTED" },
    ]);
  });

  it("装之前先挨个窗口确认、关掉（F-10），都关掉了才交给安装程序；取消了不装", () => {
    const updater = new FakeUpdater();
    let pending: (() => void) | null = null;
    const service = createUpdateService(updater, "2.0.0", () => undefined, (then) => {
      pending = then;
    });
    updater.emit("update-downloaded", { version: "2.1.0" });
    service.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    pending!();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it("这个版本不检查更新（开发时运行）：手动检查只提示", async () => {
    const { service, statuses } = setup(null);
    await service.check(false);
    await service.check(true);
    service.install();
    expect(statuses).toEqual([{ kind: "disabled", version: "2.0.0" }]);
  });
});

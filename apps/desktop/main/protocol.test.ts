import { describe, expect, it } from "vitest";
import { appResponseHeaders, CONTENT_SECURITY_POLICY, resolveAppFile, SANDBOX_CONTENT_SECURITY_POLICY } from "./protocol.ts";
import { isPermissionAllowed } from "./permissions.ts";
import { isAllowedExternalUrl } from "./links.ts";

const root = process.platform === "win32" ? "C:\\app\\out\\renderer" : "/app/out/renderer";

describe("1.10 app:// 协议", () => {
  it("把路径映射到渲染进程的构建目录", () => {
    expect(resolveAppFile(root, "app://marko/index.html")).toMatch(/renderer[\\/]index\.html$/);
    expect(resolveAppFile(root, "app://marko/assets/index-abc.js")).toMatch(/renderer[\\/]assets[\\/]index-abc\.js$/);
    expect(resolveAppFile(root, "app://marko/")).toMatch(/renderer[\\/]index\.html$/);
  });

  it("越出构建目录、就是构建目录本身、换了主机名的请求一律不给", () => {
    const inside = root + (process.platform === "win32" ? "\\" : "/");
    // URL 解析会先规整掉 ../ 和 %2e%2e；编码过的斜杠、反斜杠要靠我们自己挡
    for (const url of [
      "app://marko/../../secret.txt",
      "app://marko/%2e%2e/%2e%2e/secret.txt",
      "app://marko/%5C..%5C..%5Csecret.txt",
      "app://marko/..%2F..%2Fsecret.txt",
    ]) {
      const file = resolveAppFile(root, url);
      expect(file === null || file.startsWith(inside), url).toBe(true);
    }
    expect(resolveAppFile(root, "app://marko/..%2F..%2Fsecret.txt")).toBeNull();
    expect(resolveAppFile(root, "app://marko/x%2F..")).toBeNull();
    expect(resolveAppFile(root, "app://other/index.html")).toBeNull();
    // 坏的百分号编码不抛异常，按 404
    expect(resolveAppFile(root, "app://marko/%E0%A4%A")).toBeNull();
  });

  it("CSP 不允许内联脚本和插件", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-eval");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
  });

  const headersFor = (url: string) => appResponseHeaders(root, resolveAppFile(root, url) as string);

  it("1.2 节图表沙箱页：单独的 CSP，不能联网、不能嵌页面，自带 sandbox 指令", () => {
    const csp = headersFor("app://marko/sandbox.html")["Content-Security-Policy"];
    expect(csp).toBe(SANDBOX_CONTENT_SECURITY_POLICY);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("sandbox allow-scripts");
    expect(csp).not.toMatch(/connect-src|frame-src|unsafe-eval|allow-same-origin/);
    expect(headersFor("app://marko/index.html")["Content-Security-Policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(headersFor("app://marko/")["Content-Security-Policy"]).toBe(CONTENT_SECURITY_POLICY);
  });

  it("CSP 按解析出的文件定，不按请求里的写法：换大小写、绕一圈的路径照样是沙箱的那套", () => {
    for (const url of ["app://marko/Sandbox.html", "app://marko/x%2F..%2Fsandbox.html", "app://marko/assets/..%2Fsandbox.html", "app://marko/other.html"]) {
      expect(headersFor(url)["Content-Security-Policy"], url).toBe(SANDBOX_CONTENT_SECURITY_POLICY);
    }
    expect(headersFor("app://marko/INDEX.HTML")["Content-Security-Policy"]).toBe(CONTENT_SECURITY_POLICY);
  });

  it("只有 assets/ 下的文件对不透明源（沙箱 iframe）放行 CORS", () => {
    expect(headersFor("app://marko/assets/sandbox-abc.js")["Access-Control-Allow-Origin"]).toBe("null");
    expect(headersFor("app://marko/Assets/sandbox-abc.js")["Access-Control-Allow-Origin"]).toBe("null");
    for (const url of ["app://marko/index.html", "app://marko/sandbox.html", "app://marko/"]) {
      expect(headersFor(url)["Access-Control-Allow-Origin"], url).toBeUndefined();
    }
    expect(headersFor("app://marko/index.html")["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("1.10 外部链接", () => {
  it("只交给系统浏览器 http、https、mailto", () => {
    expect(isAllowedExternalUrl("https://example.com")).toBe(true);
    expect(isAllowedExternalUrl("mailto:a@b.c")).toBe(true);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("file:///C:/Windows/System32/calc.exe")).toBe(false);
  });
});

describe("1.10 权限", () => {
  it("只放行视频全屏和应用页面自己写剪贴板；摄像头、麦克风、定位、剪贴板读取、通知一律拒绝", () => {
    expect(isPermissionAllowed("fullscreen", "https://www.youtube.com/embed/x")).toBe(true);
    expect(isPermissionAllowed("clipboard-sanitized-write", "app://marko/index.html")).toBe(true);
    expect(isPermissionAllowed("clipboard-sanitized-write", "app://marko")).toBe(true);
    expect(isPermissionAllowed("clipboard-sanitized-write", "https://evil.example/")).toBe(false);
    for (const permission of ["media", "geolocation", "clipboard-read", "notifications", "midi", "midiSysex", "pointerLock", "openExternal", "hid", "serial", "usb", "unknown"]) {
      expect(isPermissionAllowed(permission, "app://marko/index.html"), permission).toBe(false);
      expect(isPermissionAllowed(permission, "https://evil.example/"), permission).toBe(false);
    }
  });
});

describe("M-1 marko-asset:// 协议", () => {
  it("本地路径和地址互相换算；盘符、空格、中文照样", async () => {
    const { assetPath, assetUrl } = await import("./protocol.ts");
    const windows = String.raw`C:\文档\my notes\图 1.png`;
    const posix = "/home/user/my notes/图 1.png";
    const path = process.platform === "win32" ? windows : posix;
    const url = assetUrl(path);
    expect(url.startsWith("marko-asset://local/")).toBe(true);
    expect(assetPath(url)).toBe(path);
  });

  it("只给图片、视频、音频；别的类型、不是这个形式的地址一律拒绝", async () => {
    const { assetPath, assetUrl } = await import("./protocol.ts");
    const base = process.platform === "win32" ? String.raw`C:\docs` + "\\" : "/docs/";
    expect(assetPath(assetUrl(`${base}a.mp4`))).not.toBeNull();
    expect(assetPath(assetUrl(`${base}secret.txt`))).toBeNull();
    expect(assetPath(assetUrl(`${base}a.md`))).toBeNull();
    expect(assetPath("marko-asset://other/a.png")).toBeNull();
    expect(assetPath("marko-asset://local/relative.png")).toBeNull();
    expect(assetPath("app://marko/a.png")).toBeNull();
  });
});

describe("A-3 marko-theme:// 协议", () => {
  it("只给主题目录里的样式、字体、图片；跑出目录的、别的文件不给", async () => {
    const { themeFilePath } = await import("./protocol.ts");
    const { join } = await import("node:path");
    const root = join("C:", "Users", "u", "AppData", "Marko", "themes");
    expect(themeFilePath(root, "marko-theme://local/github.css?v=3")).toBe(join(root, "github.css"));
    expect(themeFilePath(root, "marko-theme://local/github/fonts/a%20b.woff2")).toBe(join(root, "github", "fonts", "a b.woff2"));
    expect(themeFilePath(root, "marko-theme://local/../config.json")).toBeNull();
    // 地址解析时 %2E%2E 这样的段就被去掉了，落在目录里面
    expect(themeFilePath(root, "marko-theme://local/%2E%2E/%2E%2E/secret.css")).toBe(join(root, "secret.css"));
    // 转义的斜杠解析时不动，解码以后才是 ..：要拦住
    expect(themeFilePath(root, "marko-theme://local/a%2F..%2F..%2Fsecret.css")).toBeNull();
    expect(themeFilePath(root, "marko-theme://local/notes.md")).toBeNull();
    expect(themeFilePath(root, "marko-theme://other/github.css")).toBeNull();
    expect(themeFilePath(root, "marko-theme://local/%E0%A4%A.css")).toBeNull();
  });
});

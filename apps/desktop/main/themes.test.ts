// A-3：导出用的主题样式——@import 的子样式表展开，按相对路径引用的字体转成 data URI；只给主题目录里的 .css
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportThemeCss } from "./themes.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "marko-themes-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("A-3 导出用的主题样式", () => {
  it("展开 @import、字体转成 data URI；网上的地址不动", async () => {
    mkdirSync(join(root, "night"));
    writeFileSync(join(root, "night", "sub.css"), "#write blockquote { color: rgb(9, 8, 7); }\n");
    writeFileSync(join(root, "night", "font.woff2"), Buffer.from([1, 2, 3, 4]));
    writeFileSync(
      join(root, "night.css"),
      '@import "night/sub.css";\n@font-face { font-family: Night; src: url("night/font.woff2") format("woff2"); }\n#write { background: url(https://example.com/a.png); }\n',
    );
    const css = await exportThemeCss("night.css", root);
    expect(css).toContain("color: rgb(9, 8, 7)");
    expect(css).not.toContain("@import");
    expect(css).toContain("data:font/woff2;base64,AQIDBA==");
    expect(css).toContain("https://example.com/a.png");
  });

  it("只给主题目录里的 .css", async () => {
    writeFileSync(join(root, "notes.md"), "x");
    await expect(exportThemeCss("../secret.css", root)).rejects.toThrow();
    await expect(exportThemeCss("notes.md", root)).rejects.toThrow();
  });
});

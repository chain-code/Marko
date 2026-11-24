// O-1：导出的 CSS 里应用自己的字体换成 data URI
import { describe, expect, it, vi } from "vitest";
import { inlineFonts } from "./inlineFonts.ts";

describe("O-1 导出时嵌入内置字体", () => {
  it("同一来源的字体（绝对、相对地址）换成 data URI，同一个只取一次；data:、别的来源、取不到的不动", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("missing.woff2") ? new Response(null, { status: 404 }) : new Response(new Uint8Array([0, 1, 2, 250, 255]), { status: 200 }),
    );
    const css = [
      `@font-face { src: url("app://marko/assets/open-sans-regular-6XO8l1DM.woff2") format("woff2"); }`,
      `@font-face { src: url(assets/open-sans-italic.woff2); }`,
      `@font-face { src: url('app://marko/assets/open-sans-regular-6XO8l1DM.woff2'); }`,
      `@font-face { src: url("data:font/woff2;base64,AAAA"); }`,
      `@font-face { src: url("https://fonts.example.com/x.woff2"); }`,
      `@font-face { src: url("app://marko/assets/missing.woff2"); }`,
      `body { background: url("app://marko/assets/bg.png"); }`,
    ].join("\n");
    const result = await inlineFonts(css, "app://marko/index.html", fetcher);
    const data = "data:font/woff2;base64,AAEC+v8=";
    expect(result.split("\n")).toEqual([
      `@font-face { src: url("${data}") format("woff2"); }`,
      `@font-face { src: url("${data}"); }`,
      `@font-face { src: url("${data}"); }`,
      `@font-face { src: url("data:font/woff2;base64,AAAA"); }`,
      `@font-face { src: url("https://fonts.example.com/x.woff2"); }`,
      `@font-face { src: url("app://marko/assets/missing.woff2"); }`,
      `body { background: url("app://marko/assets/bg.png"); }`,
    ]);
    expect(fetcher.mock.calls.map(([url]) => url).sort()).toEqual([
      "app://marko/assets/missing.woff2",
      "app://marko/assets/open-sans-italic.woff2",
      "app://marko/assets/open-sans-regular-6XO8l1DM.woff2",
    ]);
  });
});

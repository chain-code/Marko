import { describe, expect, it } from "vitest";
import { CHANNELS, channel, isMarkoError } from "../src/index.ts";

describe("主进程接口（1.9 节）", () => {
  it("通道名是 marko:<模块>.<动作>", () => {
    expect(channel("file", "save")).toBe("marko:file.save");
    expect(CHANNELS.appVersion).toBe("marko:app.version");
  });

  it("只认识枚举里的错误码", () => {
    expect(isMarkoError({ code: "conflict", message: "文件已被其他程序修改" })).toBe(true);
    expect(isMarkoError({ code: "boom", message: "x" })).toBe(false);
    expect(isMarkoError(null)).toBe(false);
  });
});

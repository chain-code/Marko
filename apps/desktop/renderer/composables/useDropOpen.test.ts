// F-15：拖动时的提示
import { describe, expect, it } from "vitest";
import { dropHintOf } from "./useDropOpen.ts";

describe("F-15 拖动时的提示", () => {
  it("全是图片、视频、音频且在编辑区上是「插入」，别的是「打开」；不是文件不管", () => {
    const image = { kind: "file", type: "image/png" };
    const markdown = { kind: "file", type: "" };
    expect(dropHintOf(["Files"], [image], true)).toBe("insert");
    expect(dropHintOf(["Files"], [image, { kind: "file", type: "video/mp4" }], true)).toBe("insert");
    expect(dropHintOf(["Files"], [image], false)).toBe("open");
    expect(dropHintOf(["Files"], [image, markdown], true)).toBe("open");
    expect(dropHintOf(["Files"], [markdown], true)).toBe("open");
    expect(dropHintOf(["text/plain"], [{ kind: "string", type: "text/plain" }], true)).toBeNull();
  });
});

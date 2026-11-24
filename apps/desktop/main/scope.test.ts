// 路径白名单（1.10 节）
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Scope } from "./scope.ts";

describe("范围", () => {
  it("打开过的文件、工作区里的文件在范围里；别处的、只是前缀相同的目录不在", () => {
    const scope = new Scope();
    const base = resolve("/tmp/marko-scope");
    scope.allowFile(join(base, "a.md"));
    scope.allowDirectory(join(base, "work"));
    expect(scope.has(join(base, "a.md"))).toBe(true);
    expect(scope.has(join(base, "work", "deep", "b.md"))).toBe(true);
    expect(scope.has(join(base, "work"))).toBe(true);
    expect(scope.has(join(base, "workshop", "c.md"))).toBe(false);
    expect(scope.has(join(base, "b.md"))).toBe(false);
    expect(scope.has(join(base, "work", "..", "secret.md"))).toBe(false);
    expect(scope.has("")).toBe(false);
  });

  it("Windows、macOS 不分大小写", () => {
    if (process.platform === "linux") return;
    const scope = new Scope();
    scope.allowFile(resolve("/tmp/Marko/A.md"));
    expect(scope.has(resolve("/tmp/marko/a.md"))).toBe(true);
  });
});

import mermaid from "mermaid";
import { describe, expect, it } from "vitest";
import { userComplexMermaidSource } from "./mermaidFixtures";

describe("Mermaid 真实语法回归", () => {
  it("使用 Mermaid 解析器接受用户提供的完整复杂流程图", async () => {
    const result = await mermaid.parse(userComplexMermaidSource);

    expect(result.diagramType).toMatch(/^flowchart/);
    expect(userComplexMermaidSource).toContain('DB[("集中式 tasks")]');
  });
});

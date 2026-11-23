import { describe, expect, it } from "vitest";

describe("Sequence grammar 浏览器运行时", () => {
  it("加载真实依赖并解析参与者与消息", async () => {
    const { Diagram } = await import(
      "@hackmd/js-sequence-diagrams/dist/parser/diagram.js"
    );
    const diagram = Diagram.parse([
      "Alice->Bob: Hello",
      "Bob-->Alice: Done",
    ].join("\n"));

    expect(diagram.actors.map((actor) => actor.name)).toEqual(["Alice", "Bob"]);
    expect(diagram.signals).toHaveLength(2);
    expect(diagram.signals.map((signal) => signal.message)).toEqual(["Hello", "Done"]);
  });

  it("加载真实绘制器时不依赖或创建全局 Raphael", async () => {
    const previousRaphael = Object.getOwnPropertyDescriptor(globalThis, "Raphael");
    Reflect.deleteProperty(globalThis, "Raphael");

    try {
      const { DiagramPainter } = await import(
        "@hackmd/js-sequence-diagrams/dist/painter/DiagramPainter.js"
      );

      expect(DiagramPainter).toBeTypeOf("function");
      expect(Object.prototype.hasOwnProperty.call(globalThis, "Raphael")).toBe(false);
    } finally {
      if (previousRaphael) {
        Object.defineProperty(globalThis, "Raphael", previousRaphael);
      } else {
        Reflect.deleteProperty(globalThis, "Raphael");
      }
    }
  });
});

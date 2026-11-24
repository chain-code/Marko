// 1.5.4、1.5.6 节：文档模型 ↔ ProseMirror 文档；选区 ↔ 源码偏移
import { parse, sameStructure } from "@marko/markdown";
import { describe, expect, it } from "vitest";
import { buildDocSourceMap, keepBlankAt, offsetToPosition, parseToProseMirror, positionToOffset, serializeDoc, toModel, toProseMirror } from "../src/state.ts";
import { corpusCases, schema } from "./helpers.ts";

describe("模型 ↔ ProseMirror", () => {
  const cases = corpusCases();

  it("无损语料经过 ProseMirror 文档再序列化，逐字节不变", () => {
    expect(cases.length).toBeGreaterThan(1300);
    const failures = cases.filter((item) => serializeDoc(parseToProseMirror(schema, item.source)) !== item.source).map((item) => item.name);
    expect(failures).toEqual([]);
  });

  it("转回来的模型和原来的结构相同；同一个节点对象转出同一个模型对象", () => {
    for (const item of cases.slice(0, 200)) {
      const model = parse(item.source);
      const doc = toProseMirror(schema, model);
      expect(sameStructure(toModel(doc), model), item.name).toBe(true);
      expect(toModel(doc)).toBe(toModel(doc));
    }
  });

  it("空文档里放一个空段落，序列化出来还是空的", () => {
    const doc = parseToProseMirror(schema, "");
    expect(doc.childCount).toBe(1);
    expect(doc.firstChild?.type.name).toBe("paragraph");
    expect(serializeDoc(doc)).toBe("");
  });
});

describe("选区 ↔ 源码偏移", () => {
  it("文本块里每个位置都能换成源码偏移再换回来", () => {
    const source = "# Title\n\n> quote **b**\n> - item\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nlet a;\n```\n";
    const doc = parseToProseMirror(schema, source);
    const map = buildDocSourceMap(doc);
    expect(map.map.text).toBe(source);
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true;
      for (let offset = 0; offset <= node.content.size; offset += 1) {
        const position = pos + 1 + offset;
        expect(offsetToPosition(map, positionToOffset(map, position))).toBe(position);
      }
      return false;
    });
    // 源码里的字符和文档里的字符对得上
    const at = source.indexOf("item");
    expect(doc.textBetween(offsetToPosition(map, at), offsetToPosition(map, at + 4))).toBe("item");
  });

  it("光标在空段落里时，这个空段落也输出（有它的位置）", () => {
    const doc = parseToProseMirror(schema, "a\n\nb");
    const withBlank = doc.copy(doc.content.addToEnd(schema.nodes.paragraph.create()));
    const end = withBlank.content.size - 1;
    const map = buildDocSourceMap(withBlank, { keepBlank: keepBlankAt(end) });
    expect(map.map.text).toBe("a\n\nb\n\n");
    expect(positionToOffset(map, end)).toBe(6);
    expect(buildDocSourceMap(withBlank).map.text).toBe("a\n\nb");
  });
});

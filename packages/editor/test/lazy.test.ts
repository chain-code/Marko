// X-3 进入视口附近才渲染（plugins/lazy.ts）：还没进过视口就销毁了的公式块、行内公式要从共用的观察器里取消，
// 否则观察器一直引用着它们，整篇重画、换文档以后也释放不掉。代码审查 #14 的回归测试
import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMarkoEditor, setMarkdown } from "../src/index.ts";

/** 假的 IntersectionObserver：每个实例记下自己正在观察的元素，从来不报「进入视口」（CodeMirror 自己也用它） */
class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  constructor() {
    FakeObserver.instances.push(this);
  }
  observe(element: Element): void {
    this.targets.add(element);
  }
  unobserve(element: Element): void {
    this.targets.delete(element);
  }
  disconnect(): void {
    this.targets.clear();
  }
  /** 所有实例正在观察的元素 */
  static get observed(): Set<Element> {
    return new Set(FakeObserver.instances.flatMap((instance) => [...instance.targets]));
  }
}

let editor: Editor;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  editor?.destroy();
  vi.unstubAllGlobals();
});

describe("还没进过视口就销毁的", () => {
  it("公式块、行内公式：换了文档以后不再观察", () => {
    editor = createMarkoEditor();
    const source = "$$\nx^2\n$$\n\na $y$ b\n\nend";
    setMarkdown(editor, source, { anchor: source.length, head: source.length });
    const observed = [...FakeObserver.observed];
    expect(observed.some((element) => element.closest(".md-math-block"))).toBe(true);
    expect(observed.some((element) => element.classList.contains("md-math-inline"))).toBe(true);
    setMarkdown(editor, "plain");
    expect([...FakeObserver.observed].filter((element) => observed.includes(element))).toEqual([]);
  });

  it("删掉行内公式所在的段落：它的部件不再观察", () => {
    editor = createMarkoEditor();
    const source = "a $y$ b\n\nend";
    setMarkdown(editor, source, { anchor: source.length, head: source.length });
    const inline = [...FakeObserver.observed].filter((element) => element.classList.contains("md-math-inline"));
    expect(inline).toHaveLength(1);
    const paragraph = editor.state.doc.child(0);
    editor.view.dispatch(editor.state.tr.delete(0, paragraph.nodeSize));
    expect(FakeObserver.observed.has(inline[0])).toBe(false);
  });
});

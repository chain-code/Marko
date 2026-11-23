import { vi } from "vitest";

class TestResizeObserver implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

// 真实浏览器异步派发 selectionchange，happy-dom 的同步派发会导致 CodeMirror 更新重入。
document.addEventListener("selectionchange", (event) => {
  event.stopImmediatePropagation();
}, true);
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: TestResizeObserver,
});

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value() {
    const height = this.classList.contains("cm-scroller") ? 600 : 20;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: height,
      width: 800,
      height,
      toJSON() {
        return this;
      },
    };
  },
});

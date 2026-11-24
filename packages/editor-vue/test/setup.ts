// jsdom 没有排版：Range 上量位置的接口不存在。挂到页面上的 CodeMirror（源码模式、代码块）在下一帧量位置时要用，
// 没有就在测试结束后抛出未捕获的异常。这里给空的结果（没有排版，位置都是 0）
const emptyRect = (): DOMRect =>
  ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;

if (typeof Range !== "undefined") {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = function getClientRects(): DOMRectList {
      const rects: DOMRect[] = [];
      return Object.assign(rects, { item: (index: number) => rects[index] ?? null }) as unknown as DOMRectList;
    };
  }
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = emptyRect;
}

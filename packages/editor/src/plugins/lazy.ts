// 大文档（X-3）：公式、图表进入视口附近才渲染（1.6 节）。图片用浏览器自己的 loading="lazy"。
// 没有 IntersectionObserver 的环境（测试用的 jsdom）马上渲染

/** 提前这么多开始渲染，滚到时已经画好 */
const MARGIN = "800px 0px";

let observer: IntersectionObserver | null = null;
const pending = new WeakMap<Element, () => void>();
/** 还在等的元素上的标记：外层元素销毁时找出里面还在等的（forgetWithin） */
const WAITING = "data-marko-lazy";

function sharedObserver(): IntersectionObserver | null {
  if (observer) return observer;
  if (typeof IntersectionObserver === "undefined") return null;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const render = pending.get(entry.target);
        observer?.unobserve(entry.target);
        pending.delete(entry.target);
        entry.target.removeAttribute(WAITING);
        render?.();
      }
    },
    { rootMargin: MARGIN },
  );
  return observer;
}

/** element 进入视口附近时调用 render（只调一次）；再次调用时换成新的 render */
export function whenVisible(element: Element, render: () => void): void {
  const shared = sharedObserver();
  if (!shared) {
    render();
    return;
  }
  pending.set(element, render);
  element.setAttribute(WAITING, "");
  shared.observe(element);
}

/** 不再需要渲染（节点没了）。观察器一直引用着还没进过视口的元素，不取消的话销毁了也释放不掉（审查 #14） */
export function forget(element: Element): void {
  if (!pending.has(element)) return;
  pending.delete(element);
  element.removeAttribute(WAITING);
  observer?.unobserve(element);
}

/** root 和它里面还在等的元素都不再需要渲染（行内部件销毁时） */
export function forgetWithin(root: Node): void {
  if (!(root instanceof Element)) return;
  forget(root);
  for (const element of root.querySelectorAll(`[${WAITING}]`)) forget(element);
}

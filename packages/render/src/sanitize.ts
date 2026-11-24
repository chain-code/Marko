// 全仓库唯一的 HTML 过滤入口（1.10 节、X-1）：文档里的 HTML、图表返回的 SVG 都经过这里
import DOMPurify, { type Config } from "dompurify";
import { scopeDiagramCss } from "./diagramStyle.ts";

type Purifier = ReturnType<typeof DOMPurify>;

let purifier: Purifier | null = null;
/** 正在过滤图表 SVG：这时才放行 <style>，并检查它只作用于这张图 */
let sanitizingDiagram = false;

// 不给 allow-popups：嵌入的页面不经点击就能一直开浏览器窗口（主进程把新窗口的外部链接交给系统浏览器，审查 #13）
const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-presentation";
/**
 * iframe 的 allow 只留这几样（视频嵌入要用的）；摄像头、麦克风、定位、剪贴板读取之类一律去掉，
 * 写了来源列表（`camera *`）的也只留能力名。主进程另外把权限请求都拒掉（main/permissions.ts）
 */
const IFRAME_FEATURES = new Set(["autoplay", "encrypted-media", "fullscreen", "picture-in-picture"]);
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp|avif);/i;

const HTML_CONFIG: Config = {
  ADD_TAGS: ["iframe"],
  ADD_ATTR: ["target", "allow", "allowfullscreen", "frameborder", "controls", "autoplay", "loop", "muted", "playsinline", "poster", "preload", "align", "referrerpolicy"],
  FORBID_TAGS: ["style", "form", "input", "button", "select", "textarea", "option", "object", "embed", "applet", "base", "meta", "link", "noscript", "frame", "frameset"],
  FORBID_ATTR: ["srcdoc", "formaction", "action"],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|marko-asset|file):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

const SVG_CONFIG: Config = {
  USE_PROFILES: { svg: true, svgFilters: true, html: true },
  // <use>：Raphael（flowchart.js、js-sequence-diagrams）的箭头是 marker 里引用的路径；地址只许指向图里的 #id（钩子里检查）
  ADD_TAGS: ["foreignObject", "use"],
  // Mermaid 的节点文字放在 foreignObject 里的 HTML 中，要声明它是 HTML 嵌入点才保留
  HTML_INTEGRATION_POINTS: { foreignobject: true },
  // <style> 是 Mermaid 的配色，保留，但由下面的钩子检查范围（diagramStyle.ts）
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select"],
  ALLOW_DATA_ATTR: false,
};

/** 节点所在的最外层 <svg> 的 id */
function rootSvgId(node: Node): string {
  let id = "";
  for (let current: Node | null = node.parentNode; current; current = current.parentNode) {
    if ((current as Element).localName === "svg") id = (current as Element).getAttribute("id") ?? "";
  }
  return id;
}

function getPurifier(): Purifier {
  if (purifier) return purifier;
  if (typeof window === "undefined") throw new Error("HTML 过滤需要 DOM（渲染进程或测试里的 jsdom）");
  purifier = DOMPurify(window);
  purifier.addHook("uponSanitizeElement", (node, data) => {
    // 文档里的 HTML 不许有 <style>（HTML_CONFIG 里禁掉了）；图表 SVG 里的只留限定在这张图里的。
    // CSS 只认 <style> 直接的文字子节点，textContent 却把子元素里的字也算上，两者不一致就能钻空子：有子元素的整个清空
    if (data.tagName !== "style" || !sanitizingDiagram) return;
    const element = node as Element;
    const css = element.childElementCount === 0 ? scopeDiagramCss(element.textContent ?? "", rootSvgId(element)) : null;
    element.textContent = css ?? "";
  });
  purifier.addHook("afterSanitizeAttributes", (node) => {
    const element = node as Element;
    if (element.tagName === "IFRAME") {
      // 只留 https 的 iframe，放进沙箱（1.10 节）
      const src = element.getAttribute("src") ?? "";
      if (!/^https:\/\//i.test(src.trim())) {
        element.remove();
        return;
      }
      element.setAttribute("sandbox", IFRAME_SANDBOX);
      element.setAttribute("referrerpolicy", "no-referrer");
      const allow = element.getAttribute("allow");
      if (allow !== null) {
        const features = allow
          .split(";")
          .map((item) => item.trim().split(/\s+/)[0]?.toLowerCase() ?? "")
          .filter((name) => IFRAME_FEATURES.has(name));
        if (features.length) element.setAttribute("allow", [...new Set(features)].join("; "));
        else element.removeAttribute("allow");
      }
    }
    if (element.tagName === "A" && element.getAttribute("target")) element.setAttribute("rel", "noopener noreferrer");
    // 样式里的 fixed、absolute、sticky 定位：文档里的 HTML 能跳出编辑区盖住整个界面（冒充程序的界面），去掉（审查 #13）
    const style = (element as HTMLElement).style as CSSStyleDeclaration | undefined;
    if (style && element.hasAttribute("style") && /^(?:fixed|absolute|sticky)$/i.test(style.position.trim())) {
      style.removeProperty("position");
      if (!style.length) element.removeAttribute("style");
    }
    // <use> 只能引用同一张图里的元素，不能拉外部文件
    if (element.localName === "use") {
      for (const name of ["href", "xlink:href"]) {
        const value = element.getAttribute(name);
        if (value !== null && !value.trim().startsWith("#")) element.removeAttribute(name);
      }
    }
    // data: 地址只给图片用的常见位图
    for (const name of ["src", "href", "poster", "xlink:href"]) {
      const value = element.getAttribute(name);
      if (value && /^\s*data:/i.test(value) && !(element.tagName === "IMG" && name === "src" && SAFE_DATA_IMAGE.test(value.trim()))) {
        element.removeAttribute(name);
      }
    }
  });
  return purifier;
}

/** 文档里的 HTML（HTML 块、行内 HTML 拼起来的整段） */
export function sanitizeHtml(html: string): string {
  return getPurifier().sanitize(html, HTML_CONFIG) as unknown as string;
}

/** 图表沙箱返回的 SVG：去掉脚本、事件、外链；<style> 只留作用范围限定在这张图里的 */
export function sanitizeSvg(svg: string): string {
  sanitizingDiagram = true;
  try {
    return getPurifier().sanitize(svg, SVG_CONFIG) as unknown as string;
  } finally {
    sanitizingDiagram = false;
  }
}

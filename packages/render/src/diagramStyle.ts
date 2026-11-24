// 图表 SVG 里的 <style>（1.2 节、D-3）。Mermaid 把配色写在 SVG 自带的 <style> 里，规则都限定在这张图的 #id 下；
// 但 <style> 放进页面后对整个页面生效，所以宿主过滤时逐条检查：只认沙箱起的 id，规则只能作用到这张图里面，
// 不能加载外部资源。检查不过的整段清空：图照样显示，只是没有配色。
//
// 这里不是完整的 CSS 分词器，所以先把检查能讲清楚的写法圈小：反斜杠转义、注释、控制字符（\r、\f 在 CSS 里也算换行，
// 会提前结束字符串）、`<` 一律不收；url() 只许 url(#id)；字符串里不能有换行和引号；函数只认白名单里的
// （颜色、滤镜、变换、渐变、伪类）。Mermaid 11 实际生成的样式都在这个范围里（端到端测试里画了常用的十几种图）。

/** 沙箱给 Mermaid 起的 id 的前缀；后面是沙箱实例的随机串和序号 */
const ID_PREFIX = "marko-mermaid-";
const ID_PATTERN = /^marko-mermaid-[0-9a-f]{8}-\d+$/;

/** 沙箱用：每个沙箱实例一个随机串，重建后序号从头数也不会和缓存里旧图的 id 撞上 */
export function diagramId(instance: string, serial: number): string {
  return `${ID_PREFIX}${instance}-${serial}`;
}

/** 允许的 CSS 函数：不加载外部资源的颜色、滤镜、变换、渐变、计算，和选择器里的伪类 */
const FUNCTIONS = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch", "color-mix", "var", "calc", "min", "max", "clamp",
  "drop-shadow", "brightness", "contrast", "grayscale", "saturate", "opacity", "blur", "invert", "sepia", "hue-rotate",
  "translate", "translatex", "translatey", "rotate", "scale", "scalex", "scaley", "skew", "skewx", "skewy", "matrix",
  "cubic-bezier", "steps", "linear-gradient", "radial-gradient", "repeating-linear-gradient", "repeating-radial-gradient",
  "url", "not", "is", "where", "has", "nth-child", "nth-of-type", "nth-last-child", "nth-last-of-type", "lang", "dir",
]);

/** 按括号外的逗号切开选择器列表 */
function splitSelectors(selectors: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of selectors) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

/** 选择器只能选中这张图本身或它里面的元素：以 #id 开头，括号外不用 + ~ 跳到图外面的兄弟元素 */
function scopedSelector(selector: string, id: string): boolean {
  if (!selector.startsWith(`#${id}`)) return false;
  const rest = selector.slice(id.length + 1);
  // #id 后面紧跟着名字字符（CSS 的名字里可以有非 ASCII 字符），就是另一个 id 了
  if (/^[\w\u0080-￿-]/.test(rest)) return false;
  return !/[+~]/.test(rest.replace(/\([^()]*\)/g, ""));
}

/** 结构：顶层只有限定在 #id 下的规则和 @keyframes；规则里不嵌套。返回 @keyframes 的名字，不合格返回 null */
function checkStructure(text: string, id: string): string[] | null {
  const keyframes: string[] = [];
  let depth = 0;
  let inKeyframes = false;
  let head = "";
  for (const char of text) {
    if (char === "{") {
      if (depth === 0) {
        const selector = head.trim();
        const frames = /^@(?:-webkit-)?keyframes\s+([\w-]+)$/.exec(selector);
        if (frames) {
          inKeyframes = true;
          keyframes.push(frames[1]);
        } else if (!splitSelectors(selector).every((part) => scopedSelector(part, id))) {
          return null;
        }
      } else if (!(inKeyframes && depth === 1)) {
        // 只有 @keyframes 里能再套一层；CSS 嵌套、@media 之类都不认
        return null;
      }
      depth += 1;
      head = "";
    } else if (char === "}") {
      depth -= 1;
      if (depth < 0) return null;
      if (depth === 0) inKeyframes = false;
      head = "";
    } else if (char === ";" && depth === 0) {
      // 顶层语句：@import、@charset……
      return null;
    } else {
      head += char;
    }
  }
  return depth === 0 && !head.trim() ? keyframes : null;
}

const escapeForRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * css 只作用于 id 这张图时，返回改好的样式（@keyframes 的名字加上图的 id 当前缀：动画名是全局的，
 * Mermaid 的 dash 会和应用界面里的同名动画互相覆盖）；不合格返回 null
 */
export function scopeDiagramCss(css: string, id: string): string | null {
  if (!ID_PATTERN.test(id)) return null;
  if (/[\\<\u0000-\u0008\u000b-\u001f\u007f]|\/\*/.test(css)) return null;
  // 图里的引用 url(#id) 先换掉，剩下的 url( 都不收（含没加引号、带引号的各种写法）
  let text = css.replace(/url\(\s*#[\w-]+\s*\)/gi, "url()");
  if (/url\(\s*[^)\s]/i.test(text)) return null;
  // 字符串：不跨行；去掉以后不能再有引号
  text = text.replace(/"[^"\n]*"|'[^'\n]*'/g, '""');
  if (/["']/.test(text.replace(/""/g, ""))) return null;
  for (const [, name] of text.matchAll(/([a-z][\w-]*)\(/gi)) {
    if (!FUNCTIONS.has(name.toLowerCase())) return null;
  }
  const keyframes = checkStructure(text, id);
  if (!keyframes) return null;
  if (!keyframes.length) return css;
  // 动画名加前缀：@keyframes 那一行，和 animation、animation-name 的值里
  const names = new RegExp(`(?<![\\w-])(${keyframes.map(escapeForRegExp).join("|")})(?![\\w-])`, "g");
  return css
    .replace(/(@(?:-webkit-)?keyframes\s+)([\w-]+)/g, (_match: string, at: string, name: string) => `${at}${id}-${name}`)
    .replace(/(animation(?:-name)?\s*:)([^;{}]*)/gi, (_match: string, property: string, value: string) => property + value.replace(names, `${id}-$1`));
}

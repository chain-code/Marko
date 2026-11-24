// 组件自己的主题（K-1 的 settings.theme）：浅色是默认的（库的样式里），深色只作用于 data-theme="dark" 的组件。
// 主题文件（@marko/themes）的变量写在 :root 上，整页只能有一个；这里把深色主题的 :root 换成组件的选择器，第一次用到时加进页面
import darkTheme from "@marko/themes/themes/dark.css?inline";

const SCOPE = '.marko-markdown-body[data-theme="dark"]';
const STYLE_ID = "marko-theme-dark";

/** 深色主题限定在组件里（同一页可以有浅色、深色的几个编辑器） */
export function ensureDarkTheme(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = darkTheme.replace(/:root\b/g, SCOPE);
  document.head.append(style);
}

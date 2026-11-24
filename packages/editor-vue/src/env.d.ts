// Vite 的导入：.vue 单文件组件、?inline 的 CSS（文字）
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module "*.css?inline" {
  const css: string;
  export default css;
}

/** 图表沙箱页（库构建时生成：图表库内联成一个 HTML，见根目录的 vite.library.config.ts） */
declare module "virtual:marko-diagram-sandbox" {
  const html: string;
  export default html;
}

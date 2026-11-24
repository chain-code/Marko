/// <reference types="vite/client" />
import type { MarkoApi } from "@marko/shared";

declare global {
  interface Window {
    /** 预加载脚本暴露的主进程接口（1.9 节） */
    marko: MarkoApi;
  }
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

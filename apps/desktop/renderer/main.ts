// 渲染进程入口：Vue 应用、i18n、样式（1.3、1.11 节）。主题文件按设置换（appearance.ts），这里是不随主题变的部分
import "@marko/themes/base.css";
import "@marko/themes/editor.css";
import "@marko/themes/ui.css";
import "element-plus/es/components/message/style/css";
import "element-plus/es/components/message-box/style/css";
import { createApp } from "vue";
import App from "./App.vue";
import { i18n } from "./i18n.ts";

createApp(App).use(i18n).mount("#app");

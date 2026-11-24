// 本包的组件测试（1.13 节）；不继承根目录给旧组件测试用的配置
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ["test/**/*.test.ts"],
    // 编辑器（ProseMirror、CodeMirror）的测试都在 jsdom 里跑（同 @marko/editor）
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    // 主题文件按 ?inline 读成文字（theme.ts）：测试里也要处理 CSS
    css: { include: [/\.css(?:\?|$)/] },
    // Element Plus 的组件样式（style/css）里引用 .css：交给 Vite 处理，不让 Node 直接加载
    server: { deps: { inline: [/element-plus/] } },
  },
});

// 主进程、预加载脚本、渲染进程的构建（1.0 节：electron-vite）。目录按 1.3 节：main/、preload/、renderer/
import { fileURLToPath } from "node:url";
import { sequenceDiagramsPlugin } from "@marko/render/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";
import AutoImport from "unplugin-auto-import/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import Components from "unplugin-vue-components/vite";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * postcss-url 按模式动态 require 处理模块（require(`../type/${mode}`)），打包工具跟不过去，打进主进程以后导出主题时报错（A-3）：
 * 构建时换成四个静态的 require。这一行变了（升级以后）就让构建失败，不要悄悄坏在运行时
 */
function postcssUrlStaticRequire(): Plugin {
  const dynamic = "return require(`../type/${mode}`);";
  return {
    name: "marko:postcss-url-static-require",
    enforce: "pre",
    transform(code, id) {
      if (!/postcss-url[\\/]src[\\/]lib[\\/]decl-processor\.js$/.test(id)) return null;
      if (!code.includes(dynamic)) throw new Error("postcss-url 的 decl-processor.js 变了：检查 postcssUrlStaticRequire 的替换还对不对");
      return code.replace(dynamic, "return { rebase: require('../type/rebase'), inline: require('../type/inline'), copy: require('../type/copy'), custom: require('../type/custom') }[mode];");
    },
  };
}

export default defineConfig({
  main: {
    build: {
      // 依赖全部打进产物：安装包里不带 node_modules（electron-builder.yml）。只有原生模块（@parcel/watcher）、
      // 带可执行文件的（@vscode/ripgrep）保持外部引用，打包时单独带上。构建完由 scripts/check-main-bundle.mjs 检查没有别的外部引用
      externalizeDeps: false,
      rollupOptions: { input: { index: here("./main/index.ts") }, external: ["@parcel/watcher", "@vscode/ripgrep"] },
    },
    plugins: [postcssUrlStaticRequire()],
  },
  preload: {
    build: {
      externalizeDeps: { exclude: ["@marko/shared"] },
      rollupOptions: {
        input: { index: here("./preload/index.ts") },
        // sandbox 打开时预加载脚本只能是 CommonJS（1.10 节）
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: here("./renderer"),
    // sandbox.html 是图表沙箱（1.2 节）：只在 sandbox="allow-scripts" 的 iframe 里加载
    build: { rollupOptions: { input: { index: here("./renderer/index.html"), sandbox: here("./renderer/sandbox.html") } } },
    // 依赖预构建不走插件的 transform，js-sequence-diagrams 要排除在外，开发时插件才转换得到它
    optimizeDeps: { exclude: ["@hackmd/js-sequence-diagrams"] },
    plugins: [
      // 图表沙箱里 js-sequence-diagrams 的浏览器兼容转换
      sequenceDiagramsPlugin(),
      vue(),
      // Element Plus 按需引入（0.4 第 14 条）
      AutoImport({ resolvers: [ElementPlusResolver()], dts: false }),
      Components({ resolvers: [ElementPlusResolver()], dts: false }),
    ],
  },
});

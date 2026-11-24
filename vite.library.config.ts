// 编辑器库（K-1）：根目录 package.json 导出的 marko、marko/style.css，由 prepare 构建（同用 git 依赖安装时的流程）。
// 内容是 @marko/editor-vue：内部的包（@marko/*）一起打进产物，第三方依赖保持外部引用（装库的项目自己装，版本见根目录的 dependencies）
import { fileURLToPath, URL } from "node:url";
import { sequenceDiagramsPlugin } from "@marko/render/vite";
import vue from "@vitejs/plugin-vue";
import { build, defineConfig, type Plugin, type Rollup } from "vite";

const SANDBOX_MODULE = "virtual:marko-diagram-sandbox";

/**
 * 库自带的图表沙箱页（editor-vue 的 library.ts）：@marko/render 的沙箱入口连同图表库（Mermaid、flowchart.js、
 * js-sequence-diagrams）打成一个内联脚本的 HTML，作为一段文字放进库里，用到时才加载（单独的块）。
 * 装库的项目不用另外拷贝文件
 */
function diagramSandboxPage(): Plugin {
  return {
    name: "marko-diagram-sandbox-page",
    resolveId: (id) => (id === SANDBOX_MODULE ? `\0${SANDBOX_MODULE}` : null),
    async load(id) {
      if (id !== `\0${SANDBOX_MODULE}`) return null;
      const result = (await build({
        configFile: false,
        logLevel: "warn",
        plugins: [sequenceDiagramsPlugin()],
        build: {
          write: false,
          minify: true,
          lib: { entry: fileURLToPath(new URL("./packages/render/src/sandbox/sandbox.ts", import.meta.url)), formats: ["iife"], name: "MarkoDiagramSandbox" },
          rollupOptions: { output: { inlineDynamicImports: true } },
        },
      })) as Rollup.RollupOutput[];
      const chunk = result[0].output.find((item): item is Rollup.OutputChunk => item.type === "chunk");
      if (!chunk) throw new Error("图表沙箱没有构建出脚本");
      // 脚本里的 </script> 会提前结束内联的 <script>
      const script = chunk.code.replace(/<\/script/gi, "<\\/script");
      const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>diagram sandbox</title></head><body><script>${script}</script></body></html>`;
      return `export default ${JSON.stringify(html)};`;
    },
  };
}

/** 外部引用：第三方的包（不是相对路径、不是内部包；带 ?raw、?inline 这些的是资源，打进去） */
function isExternalDependency(id: string, importer: string | undefined): boolean {
  // 入口本身
  if (importer === undefined) return false;
  if (id.startsWith(".") || id.startsWith("/") || id.startsWith("\0") || /^[a-zA-Z]:[\\/]/.test(id)) return false;
  if (id.startsWith("@marko/") || id.includes("?") || id.startsWith("virtual:")) return false;
  return true;
}

/** 入口里先引用样式：只写 import { MarkoMarkdownBody } from "marko" 也有样式（同旧版库） */
function injectLibraryStyles() {
  return {
    name: "inject-marko-library-styles",
    renderChunk(code: string, chunk: { isEntry: boolean }) {
      if (!chunk.isEntry) return null;
      return { code: `import "./marko-editor.css";\n${code}`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [vue(), diagramSandboxPage(), injectLibraryStyles()],
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./packages/editor-vue/src/library.ts", import.meta.url)),
      formats: ["es"],
      fileName: "marko-editor",
      cssFileName: "marko-editor",
    },
    rollupOptions: {
      external: isExternalDependency,
    },
  },
});

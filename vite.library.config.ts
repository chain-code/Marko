import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { sequenceGrammarBrowserPlugin } from "./scripts/vite-sequence-grammar";

const externalPackages = new Set([
  "codemirror",
  "flowchart.js",
  "lucide-vue-next",
  "mermaid",
  "vue",
]);

function isExternalDependency(id: string) {
  return externalPackages.has(id)
    || id.startsWith("@codemirror/")
    || id === "markdown-it"
    || id.startsWith("markdown-it-")
    || id === "highlight.js"
    || id.startsWith("highlight.js/")
    || id === "katex"
    || id.startsWith("katex/");
}

function injectLibraryStyles() {
  return {
    name: "inject-marko-library-styles",
    renderChunk(code: string, chunk: { isEntry: boolean }) {
      if (!chunk.isEntry) return null;
      return {
        code: `import "./marko-editor.css";\n${code}`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [sequenceGrammarBrowserPlugin(), vue(), injectLibraryStyles()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-lib",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./src/library.ts", import.meta.url)),
      formats: ["es"],
      fileName: "marko-editor",
      cssFileName: "marko-editor",
    },
    rollupOptions: {
      external: isExternalDependency,
    },
  },
});

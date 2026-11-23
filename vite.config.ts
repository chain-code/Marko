import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { sequenceGrammarBrowserPlugin } from "./scripts/vite-sequence-grammar";

export default defineConfig({
  plugins: [sequenceGrammarBrowserPlugin(), vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ["@hackmd/js-sequence-diagrams"],
  },
  clearScreen: false,
});

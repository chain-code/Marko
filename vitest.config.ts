import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";
import { sequenceGrammarBrowserPlugin } from "./scripts/vite-sequence-grammar";

export default defineConfig({
  plugins: [sequenceGrammarBrowserPlugin(), vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["component-tests/**/*.test.ts"],
    setupFiles: ["./component-tests/setup.ts"],
    restoreMocks: true,
    fileParallelism: false,
  },
});

// 编辑器测试页：npm run playground -w @marko/editor（http://127.0.0.1:5183）
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // 只听 127.0.0.1：Node 把 localhost 解析成 ::1 时浏览器连不上
  server: { host: "127.0.0.1", port: 5183, strictPort: true },
  build: { target: "es2022" },
  esbuild: { target: "es2022" },
});

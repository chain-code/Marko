// 本包的单元测试（1.13 节）；不继承根目录给旧组件测试用的配置
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    // jsdom 缺的排版接口（CodeMirror 量位置用）
    setupFiles: ["test/setup.ts"],
  },
});

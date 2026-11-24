// 本包的单元测试（1.13 节）；不继承根目录给旧组件测试用的配置
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["main/**/*.test.ts", "renderer/**/*.test.ts"],
    environment: "node",
  },
});

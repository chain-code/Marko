// Vite / Vitest 的 `?raw` 导入：文件内容是字符串（构建时由打包工具处理）
declare module "*?raw" {
  const content: string;
  export default content;
}

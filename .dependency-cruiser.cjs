// 依赖方向的检查（docs/architecture.md 1.4 节）。`npm run check` 里跑；只管新代码（packages/、apps/）。
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "循环依赖是错误（1.1 节第 4 条）",
      from: {},
      to: { circular: true },
    },
    {
      name: "shared-is-leaf",
      severity: "error",
      comment: "shared 不引用仓库里任何其他包",
      from: { path: "^packages/shared/" },
      to: { path: "^(packages/(?!shared/)|apps/)" },
    },
    {
      name: "markdown-is-leaf",
      severity: "error",
      comment: "markdown 是纯 TS：不引用 DOM 库、Vue、Electron、仓库里其他包",
      from: { path: "^packages/markdown/" },
      to: { path: "^(packages/(?!markdown/)|apps/|node_modules/(vue|electron|element-plus|@tiptap|prosemirror-)[^/]*/)" },
    },
    {
      name: "markdown-no-node",
      severity: "error",
      comment: "markdown 的源码要在渲染进程里跑：不用 Node 内置模块（测试可以用）",
      from: { path: "^packages/markdown/src/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "render-boundaries",
      severity: "error",
      comment: "render 只能用 markdown；不碰 editor、Vue、Electron",
      from: { path: "^packages/render/" },
      to: { path: "^(packages/(editor|editor-vue|shared)/|apps/|node_modules/(vue|electron|element-plus|@tiptap)[^/]*/)" },
    },
    {
      name: "editor-boundaries",
      severity: "error",
      comment: "editor 不依赖 Vue、Electron、应用",
      from: { path: "^packages/editor/" },
      to: { path: "^(packages/(editor-vue|shared)/|apps/|node_modules/(vue|electron|element-plus|@tiptap/vue-3)[^/]*/)" },
    },
    {
      name: "editor-vue-boundaries",
      severity: "error",
      comment: "editor-vue 不依赖 Electron、应用",
      from: { path: "^packages/editor-vue/" },
      to: { path: "^(packages/shared/|apps/|node_modules/electron/)" },
    },
    {
      name: "main-boundaries",
      severity: "error",
      comment: "主进程不引用 markdown、render、editor 和渲染进程的代码",
      from: { path: "^apps/desktop/main/" },
      to: { path: "^(packages/(markdown|render|editor|editor-vue|themes)/|apps/desktop/(renderer|preload)/)" },
    },
    {
      name: "preload-boundaries",
      severity: "error",
      comment: "预加载脚本只用 shared 和 Electron 的 contextBridge、ipcRenderer",
      from: { path: "^apps/desktop/preload/" },
      to: { path: "^(packages/(?!shared/)|apps/desktop/(main|renderer)/)" },
    },
    {
      name: "renderer-no-electron",
      severity: "error",
      comment: "渲染进程不直接用 Electron",
      from: { path: "^apps/desktop/renderer/" },
      to: { path: "^(node_modules/electron/|apps/desktop/(main|preload)/)" },
    },
    {
      name: "renderer-no-core-modules",
      severity: "error",
      comment: "渲染进程不用 Node 内置模块",
      from: { path: "^apps/desktop/renderer/" },
      to: { dependencyTypes: ["core"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|out|dist|release)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".vue", ".json"],
    },
  },
};

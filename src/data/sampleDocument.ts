export const sampleDocument = `---
title: Marko 首版文档
tags:
  - markdown
  - desktop
---

# Marko

> [!NOTE]
> 这是一个模拟 Typora 编辑体验的首版 Markdown 桌面编辑器，文档展示风格参考 SoloLog。

[TOC]

## 核心体验

点击任意段落会进入源码编辑状态，光标离开后会恢复为渲染视图。工具栏提供常用格式、表格、列表、图表、导出和视图切换。

- **加粗**、*斜体*、~~删除线~~、\`行内代码\`
- [链接](https://typora.io)
- ==高亮==、H~2~O、x^2^
- 任务项可在预览区直接勾选

- [ ] 设计单栏编辑体验
- [x] 接入 Markdown 渲染

## 表格

| 功能 | 状态 | 说明 |
| --- | :---: | --- |
| 文件打开 | 已接入 | 支持桌面端选择文件 |
| Mermaid | 已接入 | 使用代码块渲染 |
| Pandoc | 可调用 | 依赖本机安装 Pandoc |

## 代码块

\`\`\`ts
const title = "Marko";
console.log(title);
\`\`\`

## Mermaid

\`\`\`mermaid
flowchart LR
  A[编辑 Markdown] --> B[实时预览]
  B --> C[桌面打包]
\`\`\`

## Flowchart

\`\`\`flowchart
st=>start: 开始
op=>operation: 编写文档
cond=>condition: 是否保存?
e=>end: 结束
st->op->cond
cond(yes)->e
cond(no)->op
\`\`\`

## 脚注

这是一条脚注示例。[^marko]

[^marko]: Marko 首版将外部导出能力封装为 Pandoc 调用。
`;

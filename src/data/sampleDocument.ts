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

正文可在排版结果中直接修改，格式命令会作用于当前选区。表格支持单元格编辑、Tab 导航以及行列操作。

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

## 数学公式

行内公式示例：$E = mc^2$。

$$
\int_0^1 x^2 dx = \frac{1}{3}
$$

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

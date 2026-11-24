---
title: 编辑器测试页
tags: [marko, 测试]
---

[TOC]

# 周报：Marko 2.0 重构

本周把编辑器换成了 **Tiptap**，文字就是 *Markdown 原文*，标记在光标离开后 ~~消失~~ 隐藏。行内代码 `npm test`、链接 [Typora](https://typora.io "Typora 官网")、裸网址 www.example.com、自动链接 <https://github.com>。

公式：质能方程 $E = mc^2$，求和 $\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$。Emoji :tada: :+1:，实体 &copy; &amp;，转义 \*不是斜体\*，<kbd>Ctrl</kbd>+<kbd>B</kbd> 加粗，<u>下划线</u>，<span style="color: #c00">红字</span>。

脚注引用[^perf]，引用式链接[文档][docs]，注释 <!-- 这里是注释 --> 在编辑区灰显。

## 进度

| 阶段 | 内容 | 状态 |
| --- | :---: | ---: |
| 2 | markdown 包 | **已做** |
| 3 | render 包和主题 | 已做 |
| 4 | editor 包 | 进行中 |

- [x] 行为规格 899 条
- [ ] 行内装饰
  - 标记隐藏
  - 原子片段的渲染
- [ ] NodeView

1. 第一步
2. 第二步
   继续写第二步

> 引用里的 **粗体** 和 `代码`
>
> 第二段

> [!NOTE]
> 提示：Callout 的内容。

## 代码

```ts
export function hello(name: string): string {
  return `你好，${name}`;
}
```

$$
\int_0^1 x^2 \, dx = \frac{1}{3}
$$

---

术语
: 定义的说明

*[HTML]: Hyper Text Markup Language

HTML 是缩写。

[docs]: https://example.com/docs "参考文档"

[^perf]: 打开 10 万字的文档要在 1.5 秒以内。

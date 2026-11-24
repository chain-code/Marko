# 系统设计图

```mermaid
flowchart TD
  User[用户] -->|打开文件| App(Marko)
  App --> Parse{解析}
  Parse -->|成功| Render[渲染]
  Parse -->|失败| Error[显示原文]
```

```mermaid
sequenceDiagram
  autonumber
  participant R as 渲染进程
  participant M as 主进程
  R->>M: file.save(path, content)
  M-->>R: ok
```

```mermaid
gantt
  title 重构排期
  dateFormat YYYY-MM-DD
  section 阶段
  骨架 :a1, 2026-11-24, 3d
  解析 :after a1, 10d
```

```mermaid
classDiagram
  class Document {
    +blocks: Block[]
    +serialize() string
  }
  Document --> Block
```

```flow
st=>start: 开始
op=>operation: 读取文件
cond=>condition: 是 Markdown？
e=>end: 打开
st->op->cond
cond(yes)->e
cond(no)->op
```

```sequence
Title: 保存
Editor->Main: save
Main-->Editor: done
```

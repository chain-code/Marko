# 图表

## Mermaid 流程图

```mermaid
flowchart LR
  A[打开文件] --> B{有改动吗}
  B -- 有 --> C[保存]
  B -- 没有 --> D[关闭]
  C --> D
```

## Mermaid 时序图

```mermaid
sequenceDiagram
  participant 用户
  participant Marko
  用户->>Marko: 打开文档
  Marko-->>用户: 显示排版结果
```

## Flowchart

```flow
st=>start: 开始
op=>operation: 处理
cond=>condition: 成功？
e=>end: 结束
st->op->cond
cond(yes)->e
cond(no)->op
```

## Sequence

```sequence
Alice->Bob: Hello Bob, how are you?
Note right of Bob: Bob thinks
Bob-->Alice: I am good thanks!
```

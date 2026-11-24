# 公式与图表（D）的行为规格

格式见同目录的 [README](README.md)。
本文件由 `legacy/extract.mjs` 从旧代码的逻辑测试生成（2026-11-23），之后手工维护。

### D-4 insertMarkdownDiagramTemplate inserts editable diagram fences · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownDiagramTemplate inserts editable diagram fences -->

```before
Intro‸
```

操作：命令 mermaid

````after
Intro
```mermaid
⟦flowchart LR
  A[开始] --> B[结束]⟧
```

````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownDiagramTemplate","args":[{"$state":{}},"mermaid"]} -->

### D-4 insertMarkdownDiagramTemplate inserts editable diagram fences · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownDiagramTemplate inserts editable diagram fences -->

```before
‸
```

操作：命令 flowchart

````after
```flowchart
⟦st=>start: 开始
e=>end: 结束
st->e⟧
```

````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownDiagramTemplate","args":[{"$state":{}},"flowchart"]} -->

### D-4 insertMarkdownDiagramTemplate preserves CRLF line endings

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownDiagramTemplate preserves CRLF line endings -->

```before
Intro␍
‸Outro
```

操作：命令 mermaid

````after
Intro␍
```mermaid␍
⟦flowchart LR␍
  A[开始] --> B[结束]⟧␍
```␍
Outro
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownDiagramTemplate","args":[{"$state":{}},"mermaid"]} -->

### D-4 sequence insertion uses the Typora Alice and Bob legacy example

<!-- 来源：tests/sequenceDiagram.test.ts › sequence insertion uses the Typora Alice and Bob legacy example -->

```before
Intro‸
```

操作：命令 sequence

````after
Intro
```sequence
⟦Alice->Bob: Hello Bob, how are you?
Note right of Bob: Bob thinks
Bob-->Alice: I am good thanks!⟧
```

````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownDiagramTemplate","args":[{"$state":{}},"sequence"]} -->

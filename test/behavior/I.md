# 行内（I）的行为规格

格式见同目录的 [README](README.md)。
本文件由 `legacy/extract.mjs` 从旧代码的逻辑测试生成（2026-11-23），之后手工维护。

### I-1 wrapMarkdownSelection wraps selection and keeps text selected

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection wraps selection and keeps text selected -->

```before
hello ⟦world⟧
```

操作：`Ctrl+B`

```after
hello **⟦world⟧**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"**","**"]} -->

### I-1 wrapMarkdownSelection toggles matching inline wrappers off · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection toggles matching inline wrappers off -->

```before
hello ⟦**world**⟧
```

操作：`Ctrl+B`

```after
hello ⟦world⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"**","**"]} -->

### I-1 wrapMarkdownSelection toggles matching inline wrappers off · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection toggles matching inline wrappers off -->

```before
⟦`code`⟧
```

操作：``Ctrl+Shift+` ``

```after
⟦code⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"`","`"]} -->

### I-1 wrapMarkdownSelection toggles matching inline wrappers off · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection toggles matching inline wrappers off -->

<!-- 阶段 4 改：Ctrl+B 是开关（toggleMarkdownInlineStyle）：空段落里放一对空标记；旧规格测的是带占位文字的 wrapMarkdownSelection，菜单和快捷键都不走它 -->

```before
‸
```

操作：`Ctrl+B`

```after
**‸**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"**","**","bold"]} -->

### I-1 wrapMarkdownSelection toggles wrappers around the selected text off · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection toggles wrappers around the selected text off -->

```before
hello **⟦world⟧**
```

操作：`Ctrl+B`

```after
hello ⟦world⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"**","**"]} -->

### I-1 wrapMarkdownSelection toggles wrappers around the selected text off · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection toggles wrappers around the selected text off -->

```before
`⟦code⟧`
```

操作：``Ctrl+Shift+` ``

```after
⟦code⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"`","`"]} -->

### I-1 wrapMarkdownSelection toggles wrappers around the selected text off · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection toggles wrappers around the selected text off -->

```before
<u>⟦text⟧</u>
```

操作：`Ctrl+U`

```after
⟦text⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"<u>","</u>"]} -->

### I-1 wrapMarkdownSelection uses longer code spans for selected backticks like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection uses longer code spans for selected backticks like Typora -->

```before
⟦run `cmd`⟧ now
```

操作：``Ctrl+Shift+` ``

```after
`` ⟦run `cmd`⟧ `` now
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"`","`"]} -->

### I-1 wrapMarkdownSelection uses longer code spans for selected backticks like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection uses longer code spans for selected backticks like Typora -->

```before
⟦a`b⟧
```

操作：``Ctrl+Shift+` ``

```after
``⟦a`b⟧``
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"`","`"]} -->

### I-1 wrapMarkdownSelection uses longer code spans for selected backticks like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection uses longer code spans for selected backticks like Typora -->

```before
``⟦a`b⟧``
```

操作：``Ctrl+Shift+` ``

```after
⟦a`b⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"`","`"]} -->

### I-1 wrapMarkdownSelection uses longer code spans for selected backticks like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › wrapMarkdownSelection uses longer code spans for selected backticks like Typora -->

```before
`` ⟦`cmd`⟧ ``
```

操作：``Ctrl+Shift+` ``

```after
⟦`cmd`⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapMarkdownSelection","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle applies every supported Typora inline style · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle applies every supported Typora inline style -->

```before
before ⟦target⟧ after
```

操作：`Ctrl+B`

```after
before **⟦target⟧** after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle applies every supported Typora inline style · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle applies every supported Typora inline style -->

```before
before ⟦target⟧ after
```

操作：`Ctrl+I`

```after
before *⟦target⟧* after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle applies every supported Typora inline style · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle applies every supported Typora inline style -->

```before
before ⟦target⟧ after
```

操作：`Alt+Shift+5`

```after
before ~~⟦target⟧~~ after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~~","~~"]} -->

### I-1 toggleMarkdownInlineStyle applies every supported Typora inline style · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle applies every supported Typora inline style -->

```before
before ⟦target⟧ after
```

操作：`Ctrl+U`

```after
before <u>⟦target⟧</u> after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"<u>","</u>"]} -->

### I-1 toggleMarkdownInlineStyle applies every supported Typora inline style · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle applies every supported Typora inline style -->

```before
before ⟦target⟧ after
```

操作：``Ctrl+Shift+` ``

```after
before `⟦target⟧` after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle removes every supported inline style · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes every supported inline style -->

```before
**⟦target⟧**
```

操作：`Ctrl+B`

```after
⟦target⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle removes every supported inline style · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes every supported inline style -->

```before
*⟦target⟧*
```

操作：`Ctrl+I`

```after
⟦target⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle removes every supported inline style · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes every supported inline style -->

```before
~~⟦target⟧~~
```

操作：`Alt+Shift+5`

```after
⟦target⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~~","~~"]} -->

### I-1 toggleMarkdownInlineStyle removes every supported inline style · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes every supported inline style -->

```before
<u>⟦target⟧</u>
```

操作：`Ctrl+U`

```after
⟦target⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"<u>","</u>"]} -->

### I-1 toggleMarkdownInlineStyle removes every supported inline style · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes every supported inline style -->

```before
`⟦target⟧`
```

操作：``Ctrl+Shift+` ``

```after
⟦target⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle removes semantic bold and italic aliases · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes semantic bold and italic aliases -->

```before
A __⟦bold⟧__ word
```

操作：`Ctrl+B`

```after
A ⟦bold⟧ word
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle removes semantic bold and italic aliases · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes semantic bold and italic aliases -->

```before
A _⟦slanted⟧_ word
```

操作：`Ctrl+I`

```after
A ⟦slanted⟧ word
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle removes only the selected part of a formatted range · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes only the selected part of a formatted range -->

```before
**left ⟦middle⟧ right**
```

操作：`Ctrl+B`

```after
**left** ⟦middle⟧ **right**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle removes only the selected part of a formatted range · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes only the selected part of a formatted range -->

```before
⟦**left middle right**⟧
```

操作：`Ctrl+B`

```after
⟦left middle right⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle merges partial and separate matching ranges · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle merges partial and separate matching ranges -->

```before
**⟦ready** plain⟧
```

操作：`Ctrl+B`

```after
**⟦ready plain⟧**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle merges partial and separate matching ranges · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle merges partial and separate matching ranges -->

```before
⟦start **middle** and **last**⟧
```

操作：`Ctrl+B`

```after
**⟦start middle and last⟧**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle formats paragraphs and headings with separate wrappers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle formats paragraphs and headings with separate wrappers -->

```before
⟦first paragraph

second paragraph⟧
```

操作：`Ctrl+B`

```after
**⟦first paragraph**

**second paragraph⟧**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle formats table cells without wrapping table syntax

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle formats table cells without wrapping table syntax -->

```before
⟦| A | B |
| --- | --- |
| x | y |⟧
```

操作：`Ctrl+B`

```after
| **⟦A** | **B** |
| --- | --- |
| **x** | **y⟧** |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a‸b
```

操作：`Ctrl+B`

```after
a**‸**b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a**‸**b
```

操作：`Ctrl+B`

```after
a‸b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a‸b
```

操作：`Ctrl+I`

```after
a*‸*b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a*‸*b
```

操作：`Ctrl+I`

```after
a‸b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a‸b
```

操作：`Alt+Shift+5`

```after
a~~‸~~b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~~","~~"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a~~‸~~b
```

操作：`Alt+Shift+5`

```after
a‸b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~~","~~"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 13 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a‸b
```

操作：`Ctrl+U`

```after
a<u>‸</u>b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"<u>","</u>"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 14 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a<u>‸</u>b
```

操作：`Ctrl+U`

```after
a‸b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"<u>","</u>"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 15 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a‸b
```

操作：``Ctrl+Shift+` ``

```after
a`‸`b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 16 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a`‸`b
```

操作：``Ctrl+Shift+` ``

```after
a‸b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
**ab‸cd**
```

操作：`Ctrl+B`

```after
**ab**‸**cd**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
**ab**‸**cd**
```

操作：`Ctrl+B`

```after
**ab‸cd**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
*ab‸cd*
```

操作：`Ctrl+I`

```after
*ab*‸*cd*
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
*ab*‸*cd*
```

操作：`Ctrl+I`

```after
*ab‸cd*
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
~~ab‸cd~~
```

操作：`Alt+Shift+5`

```after
~~ab~~‸~~cd~~
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~~","~~"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
~~ab~~‸~~cd~~
```

操作：`Alt+Shift+5`

```after
~~ab‸cd~~
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~~","~~"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 13 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
<u>ab‸cd</u>
```

操作：`Ctrl+U`

```after
<u>ab</u>‸<u>cd</u>
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"<u>","</u>"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 14 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
<u>ab</u>‸<u>cd</u>
```

操作：`Ctrl+U`

```after
<u>ab‸cd</u>
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"<u>","</u>"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 15 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
`ab‸cd`
```

操作：``Ctrl+Shift+` ``

```after
`ab`‸`cd`
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 16 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
`ab`‸`cd`
```

操作：``Ctrl+Shift+` ``

```after
`ab‸cd`
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle moves across an existing style boundary reversibly · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle moves across an existing style boundary reversibly -->

```before
**‸bold**
```

操作：`Ctrl+B`

```after
‸**bold**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle moves across an existing style boundary reversibly · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle moves across an existing style boundary reversibly -->

```before
‸**bold**
```

操作：`Ctrl+B`

```after
**‸bold**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle chooses a safe code span marker for literal backticks · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle chooses a safe code span marker for literal backticks -->

```before
⟦a`b⟧
```

操作：``Ctrl+Shift+` ``

```after
``⟦a`b⟧``
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle chooses a safe code span marker for literal backticks · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle chooses a safe code span marker for literal backticks -->

```before
⟦`⟧
```

操作：``Ctrl+Shift+` ``

```after
`` ⟦`⟧ ``
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle chooses a safe code span marker for literal backticks · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle chooses a safe code span marker for literal backticks -->

```before
`` ⟦`⟧ ``
```

操作：``Ctrl+Shift+` ``

```after
⟦`⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"`","`"]} -->

### I-1 toggleMarkdownInlineStyle never edits through another style marker · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle never edits through another style marker -->

```before
⟦snake_case⟧
```

操作：`Ctrl+I`

```after
*⟦snake_case⟧*
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle never edits through another style marker · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle never edits through another style marker -->

```before
⟦`code`⟧
```

操作：`Ctrl+B`

```after
**⟦`code`⟧**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle never edits through another style marker · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle never edits through another style marker -->

```before
**⟦bold⟧**
```

操作：`Ctrl+I`

```after
**_⟦bold⟧_**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle never edits through another style marker · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle never edits through another style marker -->

```before
**_⟦bold⟧_**
```

操作：`Ctrl+I`

```after
**⟦bold⟧**
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-1 toggleMarkdownInlineStyle formats every Setext heading line without changing its underline · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle formats every Setext heading line without changing its underline -->

```before
First line
⟦Second⟧ line
---
```

操作：`Ctrl+B`

```after
First line
**⟦Second⟧** line
---
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"**","**"]} -->

### I-1 toggleMarkdownInlineStyle formats every Setext heading line without changing its underline · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle formats every Setext heading line without changing its underline -->

```before
⟦First line
Second⟧ line
---
```

操作：`Ctrl+I`

```after
*⟦First line*
*Second⟧* line
---
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"*","*"]} -->

### I-2 insertMarkdownLinkSelection creates editable links like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownLinkSelection creates editable links like Typora -->

```before
read ⟦docs⟧
```

操作：命令 link

```after
read [docs](⟦https://example.com⟧)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownLinkSelection","args":[{"$state":{}}]} -->

### I-2 insertMarkdownLinkSelection creates editable links like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownLinkSelection creates editable links like Typora -->

```before
‸
```

操作：命令 link

```after
[链接文本](⟦https://example.com⟧)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownLinkSelection","args":[{"$state":{}}]} -->

### I-2 insertMarkdownLinkSelection creates editable links like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownLinkSelection creates editable links like Typora -->

```before
see ⟦API [v2]⟧
```

操作：命令 link

```after
see [API \[v2\]](⟦https://example.com⟧)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownLinkSelection","args":[{"$state":{}}]} -->

### I-2 insertMarkdownLinkSelection focuses existing inline link destinations like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownLinkSelection focuses existing inline link destinations like Typora -->

```before
read [⟦docs⟧](https://old.example/a(b) "Docs") now
```

操作：命令 link

```after
read [docs](⟦https://old.example/a(b) "Docs"⟧) now
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownLinkSelection","args":[{"$state":{}}]} -->

### I-2 insertMarkdownLinkSelection focuses existing inline link destinations like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownLinkSelection focuses existing inline link destinations like Typora -->

```before
look ![⟦logo⟧](old.png)
```

操作：命令 link

```after
look [![logo](old.png)](⟦https://example.com⟧)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownLinkSelection","args":[{"$state":{}}]} -->

### I-4 toggleMarkdownInlineStyle applies every supported Typora inline style · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle applies every supported Typora inline style -->

```before
before ⟦target⟧ after
```

操作：命令 highlight

```after
before ==⟦target⟧== after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"==","=="]} -->

### I-4 toggleMarkdownInlineStyle applies every supported Typora inline style · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle applies every supported Typora inline style -->

```before
before ⟦target⟧ after
```

操作：命令 superscript

```after
before ^⟦target⟧^ after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"^","^"]} -->

### I-4 toggleMarkdownInlineStyle applies every supported Typora inline style · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle applies every supported Typora inline style -->

```before
before ⟦target⟧ after
```

操作：命令 subscript

```after
before ~⟦target⟧~ after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~","~"]} -->

### I-4 toggleMarkdownInlineStyle removes every supported inline style · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes every supported inline style -->

```before
==⟦target⟧==
```

操作：命令 highlight

```after
⟦target⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"==","=="]} -->

### I-4 toggleMarkdownInlineStyle removes every supported inline style · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes every supported inline style -->

```before
^⟦target⟧^
```

操作：命令 superscript

```after
⟦target⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"^","^"]} -->

### I-4 toggleMarkdownInlineStyle removes every supported inline style · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle removes every supported inline style -->

```before
~⟦target⟧~
```

操作：命令 subscript

```after
⟦target⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~","~"]} -->

### I-4 toggleMarkdownInlineStyle formats paragraphs and headings with separate wrappers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle formats paragraphs and headings with separate wrappers -->

```before
⟦# Title␍
␍
Body⟧
```

操作：命令 highlight

```after
# ==⟦Title==␍
␍
==Body⟧==
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"==","=="]} -->

### I-4 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a‸b
```

操作：命令 highlight

```after
a==‸==b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"==","=="]} -->

### I-4 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a==‸==b
```

操作：命令 highlight

```after
a‸b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"==","=="]} -->

### I-4 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 9 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a‸b
```

操作：命令 superscript

```after
a^‸^b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"^","^"]} -->

### I-4 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 10 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a^‸^b
```

操作：命令 superscript

```after
a‸b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"^","^"]} -->

### I-4 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 11 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a‸b
```

操作：命令 subscript

```after
a~‸~b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~","~"]} -->

### I-4 toggleMarkdownInlineStyle creates reversible empty typing ranges · 第 12 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle creates reversible empty typing ranges -->

```before
a~‸~b
```

操作：命令 subscript

```after
a‸b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~","~"]} -->

### I-4 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
==ab‸cd==
```

操作：命令 highlight

```after
==ab==‸==cd==
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"==","=="]} -->

### I-4 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
==ab==‸==cd==
```

操作：命令 highlight

```after
==ab‸cd==
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"==","=="]} -->

### I-4 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 9 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
^ab‸cd^
```

操作：命令 superscript

```after
^ab^‸^cd^
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"^","^"]} -->

### I-4 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 10 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
^ab^‸^cd^
```

操作：命令 superscript

```after
^ab‸cd^
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"^","^"]} -->

### I-4 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 11 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
~ab‸cd~
```

操作：命令 subscript

```after
~ab~‸~cd~
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~","~"]} -->

### I-4 toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position · 第 12 步

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle cuts out and restores an unformatted cursor position -->

```before
~ab~‸~cd~
```

操作：命令 subscript

```after
~ab‸cd~
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"~","~"]} -->

### I-4 toggleMarkdownInlineStyle rejects destructive or ambiguous ranges

<!-- 来源：tests/editorCommands.test.ts › toggleMarkdownInlineStyle rejects destructive or ambiguous ranges -->

```before
⟦two\ words⟧
```

操作：命令 superscript

```after
^⟦two\ words⟧^
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleMarkdownInlineStyle","args":[{"$state":{}},"^","^"]} -->

### I-7 deleteCurrentStyleScope deletes the current style range like Typora

<!-- 来源：tests/editorCommands.test.ts › deleteCurrentStyleScope deletes the current style range like Typora -->

```before
Keep **b‸old** text
```

操作：命令 deleteStyleScope

```after
Keep **‸** text
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteCurrentStyleScope","args":[{"$state":{}}]} -->

### I-7 selectCurrentStyleScope selects styled text or table cells like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentStyleScope selects styled text or table cells like Typora -->

```before
plain **‸bold text** and [docs](https://example.com)
```

操作：命令 selectStyleScope

```after
plain **⟦bold text⟧** and [docs](https://example.com)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentStyleScope","args":[{"$state":{}}]} -->

### I-7 selectCurrentStyleScope selects styled text or table cells like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentStyleScope selects styled text or table cells like Typora -->

```before
plain **bold text** and [docs](‸https://example.com)
```

操作：命令 selectStyleScope

```after
plain **bold text** and [docs](⟦https://example.com⟧)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentStyleScope","args":[{"$state":{}}]} -->

### I-7 selectCurrentStyleScope selects styled text or table cells like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentStyleScope selects styled text or table cells like Typora -->

```before
| A | B |
| --- | --- |
| one | ‸two |

```

操作：命令 selectStyleScope

```after
| A | B |
| --- | --- |
| one | ⟦two⟧ |

```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentStyleScope","args":[{"$state":{}}]} -->

### I-7 task conversion and formatting recognize ten-digit ordered prefixes · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › task conversion and formatting recognize ten-digit ordered prefixes -->

```before
⟦123456789. **item**⟧
```

操作：命令 clearFormat

```after
⟦item⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 task conversion and formatting recognize ten-digit ordered prefixes · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › task conversion and formatting recognize ten-digit ordered prefixes -->

```before
⟦1234567890. **item**⟧
```

操作：命令 clearFormat

```after
⟦item⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes styles whose markers are outside the selection · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes styles whose markers are outside the selection -->

```before
before **left ⟦middle⟧ right** after
```

操作：命令 clearFormat

```after
before **left** ⟦middle⟧ **right** after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes styles whose markers are outside the selection · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes styles whose markers are outside the selection -->

```before
before *left ⟦middle⟧ right* after
```

操作：命令 clearFormat

```after
before *left* ⟦middle⟧ *right* after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes styles whose markers are outside the selection · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes styles whose markers are outside the selection -->

```before
before ==left ⟦middle⟧ right== after
```

操作：命令 clearFormat

```after
before ==left== ⟦middle⟧ ==right== after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes styles whose markers are outside the selection · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes styles whose markers are outside the selection -->

```before
before <u>left ⟦middle⟧ right</u> after
```

操作：命令 clearFormat

```after
before <u>left</u> ⟦middle⟧ <u>right</u> after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes styles whose markers are outside the selection · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes styles whose markers are outside the selection -->

```before
before <strong>left ⟦middle⟧ right</strong> after
```

操作：命令 clearFormat

```after
before <strong>left</strong> ⟦middle⟧ <strong>right</strong> after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes styles whose markers are outside the selection · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes styles whose markers are outside the selection -->

```before
before `left ⟦middle⟧ right` after
```

操作：命令 clearFormat

```after
before `left` ⟦middle⟧ `right` after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes only the selected portion of an inline link

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes only the selected portion of an inline link -->

```before
before [left ⟦middle⟧ right](https://example.com) after
```

操作：命令 clearFormat

```after
before [left](https://example.com) ⟦middle⟧ [right](https://example.com) after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting preserves unresolved reference syntax as literal text

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting preserves unresolved reference syntax as literal text -->

```before
before [left ⟦middle⟧ right][missing] after
```

操作：命令 clearFormat

```after
before [left ⟦middle⟧ right][missing] after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes inline wrappers from selection

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes inline wrappers from selection -->

```before
before ⟦**bold** and [link](https://example.com)⟧
```

操作：命令 clearFormat

```after
before ⟦bold and link⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes multi-backtick code spans

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes multi-backtick code spans -->

```before
before ⟦``npm `test` command``⟧
```

操作：命令 clearFormat

```after
before ⟦npm `test` command⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes padded code span markers like Typora

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes padded code span markers like Typora -->

```before
⟦`` `cmd` `` and ``a`b``⟧
```

操作：命令 clearFormat

```after
⟦`cmd` and a`b⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes inline math wrappers like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes inline math wrappers like Typora -->

```before
before ⟦$a^2 + b^2$ and \(c+d\)⟧
```

操作：命令 clearFormat

```after
before ⟦a^2 + b^2 and c+d⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes inline math wrappers like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes inline math wrappers like Typora -->

```before
calc $a^‸2 + b^2$
```

操作：命令 clearFormat

```after
calc a^‸2 + b^2
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes reference and automatic link wrappers

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes reference and automatic link wrappers -->

```before
⟦![Logo][logo] [docs][d] <https://example.com>⟧
```

操作：命令 clearFormat

```after
⟦Logo docs https://example.com⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting keeps custom and local autolink text like Typora

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting keeps custom and local autolink text like Typora -->

```before
⟦<obsidian://open?vault=docs> <file:///C:/docs/a.md> <C:/docs/a.md> <javascript:alert(1)>⟧
```

操作：命令 clearFormat

```after
⟦obsidian://open?vault=docs file:///C:/docs/a.md C:/docs/a.md <javascript:alert(1)>⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes inline HTML wrappers like Typora

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes inline HTML wrappers like Typora -->

```before
⟦<strong>Bold</strong> <a href="https://example.com">Docs</a><br><code>x</code> <kbd>Ctrl</kbd> <samp>ok</samp> <var>n</var> <ins>new</ins> <span style="font-weight: 700"><em>plain</em></span> <font color="red">old</font> <!-- note --> <https://example.com>⟧
```

操作：命令 clearFormat

```after
⟦Bold Docs x Ctrl ok n new plain old note https://example.com⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes complex link wrappers like Typora

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes complex link wrappers like Typora -->

```before
⟦**[API [v2]](<https://example.com/a(b)> "Docs")** and ![Logo [dark]][logo-ref]⟧
```

操作：命令 clearFormat

```after
⟦API [v2] and Logo [dark]⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes one cross-line formatting range structurally

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes one cross-line formatting range structurally -->

```before
⟦foo_bar_baz and **bold␍
text** and ==mark␍
text== plus `code␍
span` and <u>HTML␍
span</u>␍
$$␍
x_1 + y_2␍
$$␍
after⟧
```

操作：命令 clearFormat

```after
⟦foo_bar_baz and bold␍
text and mark␍
text plus code span and HTML␍
span␍
x_1 + y_2␍
after⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block markers from full-line selections · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block markers from full-line selections -->

```before
⟦- **bold**
> [link](https://example.com)
1. [x] Task
: Definition
[^1]: detail⟧
```

操作：命令 clearFormat

```after
⟦bold
link
Task
Definition
detail⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block markers from full-line selections · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block markers from full-line selections -->

```before
⟦> # **Title**
> - [x] ~~Task~~
> : Definition⟧
```

操作：命令 clearFormat

```after
⟦Title
Task
Definition⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting preserves CRLF while removing block markers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting preserves CRLF while removing block markers -->

```before
⟦> # **Title**␍
> - [x] ~~Task~~␍
[^1]: [detail](https://example.com)⟧
```

操作：命令 clearFormat

```after
⟦Title␍
Task␍
detail⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting preserves CRLF while removing block markers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting preserves CRLF while removing block markers -->

```before
before␍
> ## **Ti‸tle**␍
after
```

操作：命令 clearFormat

```after
before␍
Ti‸tle␍
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block marker from current line · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block marker from current line -->

```before
## *‸*Title**
```

操作：命令 clearFormat

```after
‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block marker from current line · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block marker from current line -->

```before
### ‸Title ###
```

操作：命令 clearFormat

```after
‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block marker from current line · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block marker from current line -->

```before
# ‸C#
```

操作：命令 clearFormat

```after
‸C#
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block marker from current line · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block marker from current line -->

```before
> # ‸**Title**
```

操作：命令 clearFormat

```after
‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block marker from current line · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block marker from current line -->

```before
: ‸**Definition**
```

操作：命令 clearFormat

```after
‸Definition
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block marker from current line · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block marker from current line -->

```before
[^1]: ‸**detail**
```

操作：命令 clearFormat

```after
‸detail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting removes block marker from current line · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting removes block marker from current line -->

```before
paragraph
    - ‸**code**
```

操作：命令 clearFormat

```after
paragraph
    - ‸code
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting keeps the cursor with visible text like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting keeps the cursor with visible text like Typora -->

```before
## **Ti‸tle**
```

操作：命令 clearFormat

```after
Ti‸tle
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting keeps the cursor with visible text like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting keeps the cursor with visible text like Typora -->

```before
> [Do‸cs](https://example.com)
```

操作：命令 clearFormat

```after
Do‸cs
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting keeps the cursor with visible text like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting keeps the cursor with visible text like Typora -->

```before
- `` `c‸md` ``
```

操作：命令 clearFormat

```after
`c‸md`
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting converts Setext heading to plain text · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting converts Setext heading to plain text -->

```before
**‸Title**
---
body
```

操作：命令 clearFormat

```after
‸Title
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting converts Setext heading to plain text · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting converts Setext heading to plain text -->

```before
> **Ti‸tle**
> ---
body
```

操作：命令 clearFormat

```after
Ti‸tle
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting preserves CRLF when converting Setext headings

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting preserves CRLF when converting Setext headings -->

```before
**Ti‸tle**␍
---␍
body
```

操作：命令 clearFormat

```after
Ti‸tle␍
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting keeps the cursor in Setext heading text like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting keeps the cursor in Setext heading text like Typora -->

```before
**Ti‸tle**
---
body
```

操作：命令 clearFormat

```after
Ti‸tle
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

### I-7 clearMarkdownFormatting keeps the cursor in Setext heading text like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › clearMarkdownFormatting keeps the cursor in Setext heading text like Typora -->

```before
> [Do‸cs](https://example.com)
> ---
body
```

操作：命令 clearFormat

```after
Do‸cs
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"clearMarkdownFormatting","args":[{"$state":{}}]} -->

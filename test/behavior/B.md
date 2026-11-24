# 块（B）的行为规格

格式见同目录的 [README](README.md)。
本文件由 `legacy/extract.mjs` 从旧代码的逻辑测试生成（2026-11-23），之后手工维护。

### B-1 setParagraphText removes heading markers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes heading markers -->

```before
### ‸Title
```

操作：命令 paragraph

```after
‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes heading markers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes heading markers -->

```before
### ‸Title ###
```

操作：命令 paragraph

```after
‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes heading markers · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes heading markers -->

```before
# ‸C#
```

操作：命令 paragraph

```after
‸C#
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes ATX closing markers from multi-line selections

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes ATX closing markers from multi-line selections -->

```before
⟦### Title ###
## C#⟧
```

操作：命令 paragraph

```after
⟦Title
C#⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText converts Setext headings to plain text · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText converts Setext headings to plain text -->

```before
Ti‸tle
---
body
```

操作：命令 paragraph

```after
Ti‸tle
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText converts Setext headings to plain text · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText converts Setext headings to plain text -->

```before
Title
==‸=
```

操作：命令 paragraph

```after
Title‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText converts Setext headings to plain text · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText converts Setext headings to plain text -->

```before
> Ti‸tle
> ---
body
```

操作：命令 paragraph

```after
Ti‸tle
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText preserves CRLF when converting Setext headings

<!-- 来源：tests/editorCommands.test.ts › setParagraphText preserves CRLF when converting Setext headings -->

```before
Ti‸tle␍
---␍
body
```

操作：命令 paragraph

```after
Ti‸tle␍
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
> ‸Quote
```

操作：命令 paragraph

```after
‸Quote
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
- [x] ‸Task
```

操作：命令 paragraph

```after
‸Task
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
1. ‸Item
```

操作：命令 paragraph

```after
‸Item
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
1. [x] ‸Task
```

操作：命令 paragraph

```after
‸Task
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
> 1. [ ] ‸Task
```

操作：命令 paragraph

```after
‸Task
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
: ‸Definition
```

操作：命令 paragraph

```after
‸Definition
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
[^1]: ‸detail
```

操作：命令 paragraph

```after
‸detail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
> [^1]: ‸detail
```

操作：命令 paragraph

```after
‸detail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText removes quote and list block markers · 第 9 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText removes quote and list block markers -->

```before
paragraph
    - ‸code
```

操作：命令 paragraph

```after
paragraph
    - ‸code
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText keeps the cursor with paragraph text like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText keeps the cursor with paragraph text like Typora -->

```before
> - [x] alpha‸ beta
```

操作：命令 paragraph

```after
alpha‸ beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText keeps the cursor with paragraph text like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setParagraphText keeps the cursor with paragraph text like Typora -->

```before
> al⟦pha
> 1. [ ] be⟧ta
```

操作：命令 paragraph

```after
al⟦pha
be⟧ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-1 setParagraphText preserves CRLF when clearing ordinary block markers

<!-- 来源：tests/editorCommands.test.ts › setParagraphText preserves CRLF when clearing ordinary block markers -->

```before
> # al⟦pha␍
> - be⟧ta
```

操作：命令 paragraph

```after
al⟦pha␍
be⟧ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setParagraphText","args":[{"$state":{}}]} -->

### B-2 setHeadingLevel replaces an existing heading marker · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel replaces an existing heading marker -->

```before
‸## Title
```

操作：命令 heading1

```after
# ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel replaces an existing heading marker · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel replaces an existing heading marker -->

```before
  ‸Title
```

操作：命令 heading2

```after
## ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},2]} -->

### B-2 setHeadingLevel replaces an existing heading marker · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel replaces an existing heading marker -->

```before
  ###‸ Title
```

操作：命令 heading1

```after
# ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel replaces an existing heading marker · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel replaces an existing heading marker -->

```before
‸
```

操作：命令 heading2

```after
## ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},2]} -->

### B-2 setHeadingLevel applies headings inside blockquotes like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel applies headings inside blockquotes like Typora -->

```before
> ⟦Quote⟧
```

操作：命令 heading1

```after
> # ⟦Quote⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel applies headings inside blockquotes like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel applies headings inside blockquotes like Typora -->

```before
>⟦Quote⟧
```

操作：命令 heading2

```after
> ## ⟦Quote⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},2]} -->

### B-2 setHeadingLevel applies headings inside blockquotes like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel applies headings inside blockquotes like Typora -->

```before
> ### ⟦Title⟧ ###
```

操作：命令 heading2

```after
> ## ⟦Title⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},2]} -->

### B-2 setHeadingLevel applies headings inside blockquotes like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel applies headings inside blockquotes like Typora -->

```before
> ‸
```

操作：命令 heading1

```after
> # ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel converts Setext headings without leaving underline markers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel converts Setext headings without leaving underline markers -->

```before
‸Title
---
body
```

操作：命令 heading1

```after
# ⟦Title⟧
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel converts Setext headings without leaving underline markers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel converts Setext headings without leaving underline markers -->

```before
Title
‸===
```

操作：命令 heading2

```after
## ⟦Title⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},2]} -->

### B-2 setHeadingLevel converts Setext headings without leaving underline markers · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel converts Setext headings without leaving underline markers -->

```before
> Qu‸oted
> ---
body
```

操作：命令 heading2

```after
> ## ⟦Quoted⟧
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},2]} -->

### B-2 setHeadingLevel converts Setext headings without leaving underline markers · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel converts Setext headings without leaving underline markers -->

```before
‸>> Nested
>> ===
```

操作：命令 heading1

```after
> > # ⟦Nested⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel leaves single-character Setext markers in the paragraph · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel leaves single-character Setext markers in the paragraph -->

```before
‸Title
=
body
```

操作：命令 heading1

```after
# ‸Title
=
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel leaves single-character Setext markers in the paragraph · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel leaves single-character Setext markers in the paragraph -->

```before
‸Title
-
body
```

操作：命令 heading1

```after
# ‸Title
-
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel preserves CRLF when converting Setext headings

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel preserves CRLF when converting Setext headings -->

```before
‸Title␍
---␍
body
```

操作：命令 heading1

```after
# ⟦Title⟧␍
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},1]} -->

### B-2 setHeadingLevel preserves CRLF when formatting ordinary lines

<!-- 来源：tests/editorCommands.test.ts › setHeadingLevel preserves CRLF when formatting ordinary lines -->

```before
al⟦pha␍
be⟧ta
```

操作：命令 heading2

```after
## al⟦pha␍
## be⟧ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setHeadingLevel","args":[{"$state":{}},2]} -->

### B-2 adjustHeadingLevel increases and decreases heading levels like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › adjustHeadingLevel increases and decreases heading levels like Typora -->

```before
### ‸Title
```

操作：命令 increaseHeading

```after
## ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"adjustHeadingLevel","args":[{"$state":{}},"increase"]} -->

### B-2 adjustHeadingLevel increases and decreases heading levels like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › adjustHeadingLevel increases and decreases heading levels like Typora -->

```before
### ‸Title
```

操作：命令 decreaseHeading

```after
#### ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"adjustHeadingLevel","args":[{"$state":{}},"decrease"]} -->

### B-2 adjustHeadingLevel increases and decreases heading levels like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › adjustHeadingLevel increases and decreases heading levels like Typora -->

```before
# ‸Title
```

操作：命令 decreaseHeading

```after
‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"adjustHeadingLevel","args":[{"$state":{}},"decrease"]} -->

### B-2 adjustHeadingLevel increases and decreases heading levels like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › adjustHeadingLevel increases and decreases heading levels like Typora -->

```before
‸Title
```

操作：命令 increaseHeading

```after
###### ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"adjustHeadingLevel","args":[{"$state":{}},"increase"]} -->

### B-2 adjustHeadingLevel increases and decreases heading levels like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › adjustHeadingLevel increases and decreases heading levels like Typora -->

```before
‸Title
```

操作：命令 decreaseHeading

```after
‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"adjustHeadingLevel","args":[{"$state":{}},"decrease"]} -->

### B-2 adjustHeadingLevel handles Setext and quoted headings like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › adjustHeadingLevel handles Setext and quoted headings like Typora -->

```before
‸Title
---
body
```

操作：命令 increaseHeading

```after
# ⟦Title⟧
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"adjustHeadingLevel","args":[{"$state":{}},"increase"]} -->

### B-2 adjustHeadingLevel handles Setext and quoted headings like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › adjustHeadingLevel handles Setext and quoted headings like Typora -->

```before
‸Title
===
body
```

操作：命令 decreaseHeading

```after
‸Title
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"adjustHeadingLevel","args":[{"$state":{}},"decrease"]} -->

### B-2 adjustHeadingLevel handles Setext and quoted headings like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › adjustHeadingLevel handles Setext and quoted headings like Typora -->

```before
> ### Q‸uote
```

操作：命令 increaseHeading

```after
> ## Q‸uote
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"adjustHeadingLevel","args":[{"$state":{}},"increase"]} -->

### B-3 prefixMarkdownLines applies blockquote to each selected non-empty line

<!-- 来源：tests/editorCommands.test.ts › prefixMarkdownLines applies blockquote to each selected non-empty line -->

```before
⟦alpha
beta⟧

next
```

操作：命令 prefixLines("> ")

```after
> ⟦alpha
> beta⟧

next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"prefixMarkdownLines","args":[{"$state":{}},"> "]} -->

### B-3 prefixMarkdownLines preserves CRLF line endings like Typora

<!-- 来源：tests/editorCommands.test.ts › prefixMarkdownLines preserves CRLF line endings like Typora -->

```before
⟦alpha␍
beta⟧␍
␍
next
```

操作：命令 prefixLines("> ")

```after
> ⟦alpha␍
> beta⟧␍
␍
next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"prefixMarkdownLines","args":[{"$state":{}},"> "]} -->

### B-3 formatMarkdownLines toggles blockquote without duplicating markers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles blockquote without duplicating markers -->

```before
⟦alpha
beta⟧
```

操作：命令 blockquote

```after
> ⟦alpha
> beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"blockquote"]} -->

### B-3 formatMarkdownLines toggles blockquote without duplicating markers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles blockquote without duplicating markers -->

```before
⟦> alpha
> beta⟧
```

操作：命令 blockquote

```after
⟦alpha
beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"blockquote"]} -->

### B-3 formatMarkdownLines toggles blockquote without duplicating markers · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles blockquote without duplicating markers -->

<!-- 阶段 4 改：编辑器里选区进不了块标记（列表符号、引用的 `>`）：选中整行就是从内容开头选起；改出来的文字相同 -->

```before
- ⟦alpha⟧
```

操作：命令 blockquote

```after
> - ⟦alpha⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"blockquote"]} -->

### B-3 formatMarkdownLines toggles blockquote without duplicating markers · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles blockquote without duplicating markers -->

<!-- 阶段 4 改：编辑器里选区进不了块标记（列表符号、引用的 `>`）：选中整行就是从内容开头选起；改出来的文字相同 -->

```before
> - ⟦alpha⟧
```

操作：命令 blockquote

```after
- ⟦alpha⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"blockquote"]} -->

### B-3 formatMarkdownLines toggles blockquote without duplicating markers · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles blockquote without duplicating markers -->

```before
‸
```

操作：命令 blockquote

```after
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"blockquote"]} -->

### B-3 formatMarkdownLines toggles blockquote without duplicating markers · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles blockquote without duplicating markers -->

```before
> ‸
```

操作：命令 blockquote

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"blockquote"]} -->

### B-3 formatMarkdownLines keeps the cursor with paragraph text like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines keeps the cursor with paragraph text like Typora -->

```before
alpha⟦ beta⟧
```

操作：命令 blockquote

```after
> alpha⟦ beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"blockquote"]} -->

### B-3 formatMarkdownLines preserves CRLF when toggling blockquote and list formats · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines preserves CRLF when toggling blockquote and list formats -->

```before
al⟦pha␍
be⟧ta
```

操作：命令 blockquote

```after
> al⟦pha␍
> be⟧ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"blockquote"]} -->

### B-4 prefixNumberedMarkdownLines preserves CRLF and skips blank lines like Typora

<!-- 来源：tests/editorCommands.test.ts › prefixNumberedMarkdownLines preserves CRLF and skips blank lines like Typora -->

```before
⟦alpha␍
␍
beta⟧
```

操作：命令 prefixNumberedLines

```after
1. ⟦alpha␍
␍
2. beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"prefixNumberedMarkdownLines","args":[{"$state":{}}]} -->

### B-4 formatMarkdownLines keeps the cursor with paragraph text like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines keeps the cursor with paragraph text like Typora -->

```before
alpha be‸ta
```

操作：命令 bulletList

```after
- alpha be‸ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines keeps the cursor with paragraph text like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines keeps the cursor with paragraph text like Typora -->

```before
- alpha‸ beta
```

操作：命令 orderedList

```after
1. alpha‸ beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"ordered"]} -->

### B-4 formatMarkdownLines keeps the cursor with paragraph text like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines keeps the cursor with paragraph text like Typora -->

```before
- alpha‸ beta
```

操作：命令 bulletList

```after
alpha‸ beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines converts between list types · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦- alpha
- beta⟧
```

操作：命令 orderedList

```after
1. ⟦alpha
2. beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"ordered"]} -->

### B-4 formatMarkdownLines converts between list types · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦# Title⟧
```

操作：命令 bulletList

```after
- ⟦Title⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines converts between list types · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦### Title ###⟧
```

操作：命令 bulletList

```after
- ⟦Title⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines converts between list types · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦# C#⟧
```

操作：命令 bulletList

```after
- ⟦C#⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines converts between list types · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦> alpha
> beta⟧
```

操作：命令 bulletList

```after
> - ⟦alpha
> - beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines converts between list types · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦> - alpha
> - beta⟧
```

操作：命令 orderedList

```after
> 1. ⟦alpha
> 2. beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"ordered"]} -->

### B-4 formatMarkdownLines converts between list types · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦: Definition⟧
```

操作：命令 bulletList

```after
- ⟦Definition⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines converts between list types · 第 12 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
‸
```

操作：命令 bulletList

```after
- ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines converts between list types · 第 13 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
‸
```

操作：命令 orderedList

```after
1. ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"ordered"]} -->

### B-4 formatMarkdownLines converts between list types · 第 15 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
> ‸
```

操作：命令 bulletList

```after
> - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines toggles the same list type back to paragraph · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles the same list type back to paragraph -->

```before
⟦- alpha
- beta⟧
```

操作：命令 bulletList

```after
⟦alpha
beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines toggles the same list type back to paragraph · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles the same list type back to paragraph -->

```before
⟦1. alpha
2. beta⟧
```

操作：命令 orderedList

```after
⟦alpha
beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"ordered"]} -->

### B-4 formatMarkdownLines toggles the same list type back to paragraph · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles the same list type back to paragraph -->

```before
⟦> - alpha
> - beta⟧
```

操作：命令 bulletList

```after
> ⟦alpha
> beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines toggles the same list type back to paragraph · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles the same list type back to paragraph -->

```before
⟦    - code⟧
```

操作：命令 bulletList

```after
    - ⟦- code⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-4 formatMarkdownLines preserves CRLF when toggling blockquote and list formats · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines preserves CRLF when toggling blockquote and list formats -->

```before
- al⟦pha␍
- be⟧ta
```

操作：命令 orderedList

```after
1. al⟦pha␍
2. be⟧ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"ordered"]} -->

### B-4 formatMarkdownLines strips CRLF heading markers when converting to lists

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines strips CRLF heading markers when converting to lists -->

```before
⟦# Alpha␍
### Beta ###⟧
```

操作：命令 bulletList

```after
- ⟦Alpha␍
- Beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"bullet"]} -->

### B-5 task conversion and formatting recognize ten-digit ordered prefixes · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › task conversion and formatting recognize ten-digit ordered prefixes -->

```before
123456789. item‸
```

操作：命令 toggleTask

```after
123456789. [ ] item‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 task conversion and formatting recognize ten-digit ordered prefixes · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › task conversion and formatting recognize ten-digit ordered prefixes -->

```before
1234567890. item‸
```

操作：命令 toggleTask

```after
1234567890. [ ] item‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 task conversion and formatting recognize ten-digit ordered prefixes · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › task conversion and formatting recognize ten-digit ordered prefixes -->

```before
⟦123456789. [x] done
plain⟧
```

操作：命令 taskList

```after
- [x] ⟦done
- [ ] plain⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 task conversion and formatting recognize ten-digit ordered prefixes · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › task conversion and formatting recognize ten-digit ordered prefixes -->

```before
⟦1234567890. [x] done
plain⟧
```

操作：命令 taskList

```after
- [x] ⟦done
- [ ] plain⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 toggleTaskAtSelection toggles existing tasks or creates a task item · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection toggles existing tasks or creates a task item -->

<!-- 阶段 4 改：编辑器里光标进不了任务框：光标在任务内容开头；切换的结果相同 -->

```before
- [ ] ‸item
```

操作：命令 toggleTask

```after
- [x] ‸item
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection toggles existing tasks or creates a task item · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection toggles existing tasks or creates a task item -->

```before
‸plain
```

操作：命令 toggleTask

```after
- [ ] ‸plain
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection toggles existing tasks or creates a task item · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection toggles existing tasks or creates a task item -->

```before
- ‸item
```

操作：命令 toggleTask

```after
- [ ] ‸item
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection toggles existing tasks or creates a task item · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection toggles existing tasks or creates a task item -->

```before
1. ‸item
```

操作：命令 toggleTask

```after
1. [ ] ‸item
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection toggles existing tasks or creates a task item · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection toggles existing tasks or creates a task item -->

```before
> - ‸item
```

操作：命令 toggleTask

```after
> - [ ] ‸item
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection toggles existing tasks or creates a task item · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection toggles existing tasks or creates a task item -->

```before
> ‸note
```

操作：命令 toggleTask

```after
> - [ ] ‸note
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection toggles existing tasks or creates a task item · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection toggles existing tasks or creates a task item -->

```before
‸plain [x] marker
```

操作：命令 toggleTask

```after
- [ ] ‸plain [x] marker
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection toggles existing tasks or creates a task item · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection toggles existing tasks or creates a task item -->

```before
- ‸item [x] marker
```

操作：命令 toggleTask

```after
- [ ] ‸item [x] marker
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection applies to selected lines like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection applies to selected lines like Typora -->

<!-- 阶段 4 改：编辑器里选区进不了块标记：选中整行就是从内容开头选起；改出来的文字相同 -->

```before
- [ ] ⟦one
- [x] two
plain⟧
```

操作：命令 toggleTask

```after
- [x] ⟦one
- [ ] two
- [ ] plain⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection applies to selected lines like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection applies to selected lines like Typora -->

<!-- 阶段 4 改：编辑器里选区进不了块标记：选中整行就是从内容开头选起；改出来的文字相同 -->

```before
> ⟦note
> - [ ] task

1. item⟧
```

操作：命令 toggleTask

```after
> - [ ] ⟦note
> - [x] task

1. [ ] item⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection keeps the cursor with item text like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection keeps the cursor with item text like Typora -->

```before
alpha‸ beta
```

操作：命令 toggleTask

```after
- [ ] alpha‸ beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection keeps the cursor with item text like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection keeps the cursor with item text like Typora -->

```before
- alpha‸ beta
```

操作：命令 toggleTask

```after
- [ ] alpha‸ beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection keeps the cursor with item text like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection keeps the cursor with item text like Typora -->

```before
1. alpha‸ beta
```

操作：命令 toggleTask

```after
1. [ ] alpha‸ beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection keeps the cursor with item text like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection keeps the cursor with item text like Typora -->

```before
> alpha‸ beta
```

操作：命令 toggleTask

```after
> - [ ] alpha‸ beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection keeps the cursor with item text like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection keeps the cursor with item text like Typora -->

```before
al⟦pha
> 1. be⟧ta
```

操作：命令 toggleTask

```after
- [ ] al⟦pha
> 1. [ ] be⟧ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection keeps the cursor with item text like Typora · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection keeps the cursor with item text like Typora -->

```before
- [ ] al⟦pha⟧
```

操作：命令 toggleTask

```after
- [x] al⟦pha⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection preserves CRLF while toggling existing tasks · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection preserves CRLF while toggling existing tasks -->

```before
- [ ] ta‸sk␍
- [x] done
```

操作：命令 toggleTask

```after
- [x] ta‸sk␍
- [x] done
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 toggleTaskAtSelection preserves CRLF while toggling existing tasks · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › toggleTaskAtSelection preserves CRLF while toggling existing tasks -->

```before
plain␍
> qu‸oted
```

操作：命令 toggleTask

```after
plain␍
> - [ ] qu‸oted
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"toggleTaskAtSelection","args":[{"$state":{}}]} -->

### B-5 formatMarkdownLines keeps the cursor with paragraph text like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines keeps the cursor with paragraph text like Typora -->

```before
> - al‸pha
```

操作：命令 taskList

```after
> - [ ] al‸pha
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 formatMarkdownLines converts between list types · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦1. alpha
2. beta⟧
```

操作：命令 taskList

```after
- [ ] ⟦alpha
- [ ] beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 formatMarkdownLines converts between list types · 第 9 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
⟦[^1]: detail⟧
```

操作：命令 taskList

```after
- [ ] ⟦detail⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 formatMarkdownLines converts between list types · 第 14 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
‸
```

操作：命令 taskList

```after
- [ ] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 formatMarkdownLines keeps checked tasks when applying task list to mixed lines · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines keeps checked tasks when applying task list to mixed lines -->

```before
⟦- [x] done
plain⟧
```

操作：命令 taskList

```after
- [x] ⟦done
- [ ] plain⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 formatMarkdownLines keeps checked tasks when applying task list to mixed lines · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines keeps checked tasks when applying task list to mixed lines -->

```before
⟦> 1. [X] quoted
> plain⟧
```

操作：命令 taskList

```after
> - [x] ⟦quoted
> - [ ] plain⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 formatMarkdownLines toggles the same list type back to paragraph · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles the same list type back to paragraph -->

```before
⟦- [x] done
- [ ] todo⟧
```

操作：命令 taskList

```after
⟦done
todo⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 formatMarkdownLines toggles the same list type back to paragraph · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles the same list type back to paragraph -->

```before
⟦> - [x] done
> - [ ] todo⟧
```

操作：命令 taskList

```after
> ⟦done
> todo⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-5 formatMarkdownLines preserves CRLF when toggling blockquote and list formats · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines preserves CRLF when toggling blockquote and list formats -->

```before
⟦> - [x] done␍
> - [ ] todo⟧
```

操作：命令 taskList

```after
> ⟦done␍
> todo⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"task"]} -->

### B-6 formatMarkdownCodeBlock wraps selection or inserts an empty focused block · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock wraps selection or inserts an empty focused block -->

```before
before
⟦const x = 1;⟧
after
```

操作：命令 codeBlock（语言 "ts"）

````after
before
```ts
⟦const x = 1;⟧
```
after
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}},"ts"]} -->

### B-6 formatMarkdownCodeBlock wraps selection or inserts an empty focused block · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock wraps selection or inserts an empty focused block -->

```before
‸
```

操作：命令 codeBlock（语言 "ts"）

````after
```ts
‸
```

````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}},"ts"]} -->

### B-6 formatMarkdownCodeBlock wraps selection or inserts an empty focused block · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock wraps selection or inserts an empty focused block -->

```before
‸
```

操作：命令 codeBlock

````after
```
‸
```

````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}}]} -->

### B-6 formatMarkdownCodeBlock wraps selection or inserts an empty focused block · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock wraps selection or inserts an empty focused block -->

````before
⟦alpha
```
beta⟧
````

操作：命令 codeBlock（语言 "md"）

`````after
````md
⟦alpha
```
beta⟧
````

`````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}},"md"]} -->

### B-6 applyDefaultCodeLanguageOnFenceKey inserts and selects a Typora-style default language · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › applyDefaultCodeLanguageOnFenceKey inserts and selects a Typora-style default language -->

```before
``‸
```

操作：输入 "`"（默认代码语言 "typescript"）

````after
```⟦typescript⟧
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyDefaultCodeLanguageOnFenceKey","args":[{"$state":{}},"`","typescript"]} -->

### B-6 applyDefaultCodeLanguageOnFenceKey inserts and selects a Typora-style default language · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › applyDefaultCodeLanguageOnFenceKey inserts and selects a Typora-style default language -->

```before
> ~~‸␍
next
```

操作：输入 "~"（默认代码语言 "rust"）

```after
> ~~~⟦rust⟧␍
next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyDefaultCodeLanguageOnFenceKey","args":[{"$state":{}},"~","rust"]} -->

### B-6 formatMarkdownCodeBlock preserves CRLF line endings in generated fences

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock preserves CRLF line endings in generated fences -->

```before
before␍
⟦const x = 1;⟧␍
after
```

操作：命令 codeBlock（语言 "ts"）

````after
before␍
```ts␍
⟦const x = 1;⟧␍
```␍
after
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}},"ts"]} -->

### B-6 formatMarkdownCodeBlock toggles closed code fences back to text like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock toggles closed code fences back to text like Typora -->

````before
before
```ts
const ‸x = 1;
```
after
````

操作：命令 codeBlock

```after
before
const ‸x = 1;
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}}]} -->

### B-6 formatMarkdownCodeBlock toggles closed code fences back to text like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock toggles closed code fences back to text like Typora -->

<!-- 阶段 4 改：编辑器里选区进不了代码块的围栏：选中整个代码块就是选中它的内容；去掉围栏后选区还是那段代码 -->

````before
before
```ts
⟦const x = 1;⟧
```
after
````

操作：命令 codeBlock

```after
before
⟦const x = 1;⟧
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}}]} -->

### B-6 formatMarkdownCodeBlock toggles closed code fences back to text like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock toggles closed code fences back to text like Typora -->

````before
```ts␍
const ‸x = 1;␍
```␍
after
````

操作：命令 codeBlock

```after
const ‸x = 1;␍
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}}]} -->

### B-6 formatMarkdownCodeBlock toggles closed code fences back to text like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownCodeBlock toggles closed code fences back to text like Typora -->

````before
before
```ts
const x = 1;
```
‸after
````

操作：命令 codeBlock

````after
before
```ts
const x = 1;
```
```
‸
```
after
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownCodeBlock","args":[{"$state":{}}]} -->

### B-6 handleRawBlockEnter exits closed code at its content end

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter exits closed code at its content end -->

````before
```js
const value = 1;‸
```
````

操作：`Ctrl+Enter`

````after
```js
const value = 1;
```

‸
````

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":22}},{"ctrlKey":true}],"expectExtras":{"selectionHead":28,"kind":"code","action":"exit"}} -->

### B-6 handleRawBlockEnter moves to existing content after a code block

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter moves to existing content after a code block -->

````before
```js
code‸
```

after
````

操作：`Ctrl+Enter`

````after
```js
code
```

‸after
````

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":10}},{"metaKey":true}],"expectExtras":{"selectionHead":16,"kind":"code","action":"exit"}} -->

### B-6 handleRawBlockEnter keeps ordinary code Enter inside and requires no selection to exit

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter keeps ordinary code Enter inside and requires no selection to exit -->

````before
```js
code‸
```
````

操作：`Ctrl+Shift+Enter`

````after
```js
code
```

‸
````

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":10}},{"ctrlKey":true,"shiftKey":true}],"expectExtras":{"selectionHead":16,"kind":"code","action":"exit"}} -->

### B-6 handleRawBlockEnter closes an unclosed code fence before exiting

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter closes an unclosed code fence before exiting -->

````before
```js
code‸
````

操作：`Ctrl+Enter`

````after
```js
code
```

‸
````

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":10}},{"ctrlKey":true}],"expectExtras":{"selectionHead":16,"kind":"code","action":"exit"}} -->

### B-6 handleRawBlockBoundaryDelete removes an exactly empty code block · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete removes an exactly empty code block -->

````before
```
‸
```
````

操作：`Backspace`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":4}},"backward"],"expectExtras":{"selectionHead":0,"kind":"code","action":"delete"}} -->

### B-6 handleRawBlockBoundaryDelete removes an exactly empty code block · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete removes an exactly empty code block -->

````before
```
‸
```
````

操作：`Delete`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":4}},"forward"],"expectExtras":{"selectionHead":0,"kind":"code","action":"delete"}} -->

### B-6 handleRawBlockBoundaryDelete unwraps one-line code on leading Backspace

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete unwraps one-line code on leading Backspace -->

````before
before

```js
‸alpha
```

after
````

操作：`Backspace`

```after
before

‸alpha

after
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":14}},"backward"],"expectExtras":{"selectionHead":8,"kind":"code","action":"unwrap"}} -->

### B-6 handleRawBlockBoundaryDelete preserves CRLF while unwrapping code

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete preserves CRLF while unwrapping code -->

````before
```js␍
‸alpha␍
```␍
␍
after
````

操作：`Backspace`

```after
‸alpha␍
␍
after
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":7}},"backward"],"expectExtras":{"selectionHead":0,"kind":"code","action":"unwrap"}} -->

### B-6 handleRawBlockBoundaryDelete keeps quoted code inside its quote when unwrapping

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete keeps quoted code inside its quote when unwrapping -->

````before
> ```js
> ‸code
> ```
````

操作：`Backspace`

```after
> ‸code
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":10}},"backward"],"expectExtras":{"selectionHead":2,"kind":"code","action":"unwrap"}} -->

### B-6 handleRawBlockBoundaryDelete consumes multi-line code boundaries · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete consumes multi-line code boundaries -->

````before
```js
‸alpha
beta
```
````

操作：`Backspace`

````after
```js
‸alpha
beta
```
````

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":6}},"backward"],"expectExtras":{"selectionHead":6,"kind":"code","action":"consume"}} -->

### B-6 handleRawBlockBoundaryDelete consumes multi-line code boundaries · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete consumes multi-line code boundaries -->

````before
```js
alpha
beta‸
```
````

操作：`Delete`

````after
```js
alpha
beta‸
```
````

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":16}},"forward"],"expectExtras":{"selectionHead":16,"kind":"code","action":"consume"}} -->

### B-6 list-contained code unwrap keeps every container marker and literal greater-than · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › list-contained code unwrap keeps every container marker and literal greater-than -->

`````before
10. ```js
    ‸x
    ````
`````

操作：`Backspace`

```after
10. ‸x
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":14}},"backward"],"expectExtras":{"selectionHead":4,"kind":"code","action":"unwrap"}} -->

### B-6 list-contained code unwrap keeps every container marker and literal greater-than · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › list-contained code unwrap keeps every container marker and literal greater-than -->

````before
- ```ts␍
  ‸x␍
  ```
````

操作：`Backspace`

```after
- ‸x
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":11}},"backward"],"expectExtras":{"selectionHead":2,"kind":"code","action":"unwrap"}} -->

### B-6 list-contained code unwrap keeps every container marker and literal greater-than · 第 3 步

<!-- 来源：tests/rawBlockEditing.test.ts › list-contained code unwrap keeps every container marker and literal greater-than -->

````before
- outer
  - ```js
    ‸x
    ```
````

操作：`Backspace`

```after
- outer
  - ‸x
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":22}},"backward"],"expectExtras":{"selectionHead":12,"kind":"code","action":"unwrap"}} -->

### B-6 list-contained code unwrap keeps every container marker and literal greater-than · 第 4 步

<!-- 来源：tests/rawBlockEditing.test.ts › list-contained code unwrap keeps every container marker and literal greater-than -->

<!-- 阶段 4 改：代码块退格变回正文后 `> literal` 是引用：光标在引用的内容开头（进不了 `>`） -->

````before
> 10. ```js␍
>     ‸> literal␍
>     ```
````

操作：`Backspace`

```after
> 10. > ‸literal
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":19}},"backward"],"expectExtras":{"selectionHead":6,"kind":"code","action":"unwrap"}} -->

### B-6 list-contained code unwrap keeps every container marker and literal greater-than · 第 5 步

<!-- 来源：tests/rawBlockEditing.test.ts › list-contained code unwrap keeps every container marker and literal greater-than -->

<!-- 阶段 4 改：代码块退格变回正文后 `> literal` 是引用：光标在引用的内容开头（进不了 `>`） -->

````before
- ```js
  ‸> literal
  ```
````

操作：`Backspace`

```after
- > ‸literal
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":10}},"backward"],"expectExtras":{"selectionHead":2,"kind":"code","action":"unwrap"}} -->

### B-6 code fences in existing list continuations unwrap without consuming the parent item · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › code fences in existing list continuations unwrap without consuming the parent item -->

````before
10. intro

    ```js
    ‸x
    ```
````

操作：`Backspace`

```after
10. intro

    ‸x
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":25}},"backward"],"expectExtras":{"selectionHead":15,"kind":"code","action":"unwrap"}} -->

### B-6 code fences in existing list continuations unwrap without consuming the parent item · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › code fences in existing list continuations unwrap without consuming the parent item -->

````before
10. intro␍
␍
    ```js␍
    ‸x␍
    ```
````

操作：`Backspace`

```after
10. intro␍
␍
    ‸x
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":28}},"backward"],"expectExtras":{"selectionHead":17,"kind":"code","action":"unwrap"}} -->

### B-6 container-only indentation is empty for code and both math fence forms · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › container-only indentation is empty for code and both math fence forms -->

````before
* ```
  ‸
  ```
````

操作：`Backspace`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":8}},"backward"],"expectExtras":{"selectionHead":0,"kind":"code","action":"delete"}} -->

### B-6 container-only indentation is empty for code and both math fence forms · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › container-only indentation is empty for code and both math fence forms -->

````before
* ```
  ‸
  ```
````

操作：`Delete`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":8}},"forward"],"expectExtras":{"selectionHead":0,"kind":"code","action":"delete"}} -->

### B-6 引用后的 Tab stop 按绝对列补全围栏 · 第 4 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 引用后的 Tab stop 按绝对列补全围栏 -->

```before
> 	``‸
```

操作：输入 "`"（默认代码语言 "typescript"）

````after
> 	```⟦typescript⟧
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyDefaultCodeLanguageOnFenceKey","args":[{"$state":{}},"`","typescript"]} -->

### B-7 formatMarkdownMathBlock wraps selection or inserts a formula placeholder · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownMathBlock wraps selection or inserts a formula placeholder -->

```before
before
⟦x+y⟧
after
```

操作：命令 mathBlock

```after
before
$$
⟦x+y⟧
$$
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownMathBlock","args":[{"$state":{}}]} -->

### B-7 formatMarkdownMathBlock wraps selection or inserts a formula placeholder · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownMathBlock wraps selection or inserts a formula placeholder -->

```before
‸
```

操作：命令 mathBlock

```after
$$
⟦a^2 + b^2 = c^2⟧
$$

```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownMathBlock","args":[{"$state":{}}]} -->

### B-7 formatMarkdownMathBlock preserves CRLF line endings in generated fences

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownMathBlock preserves CRLF line endings in generated fences -->

```before
before␍
⟦after⟧
```

操作：命令 mathBlock

```after
before␍
$$␍
⟦after⟧␍
$$␍

```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownMathBlock","args":[{"$state":{}}]} -->

### B-7 formatMarkdownMathBlock toggles closed math fences back to text like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownMathBlock toggles closed math fences back to text like Typora -->

```before
before
$$
x‸+y
$$
after
```

操作：命令 mathBlock

```after
before
x‸+y
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownMathBlock","args":[{"$state":{}}]} -->

### B-7 formatMarkdownMathBlock toggles closed math fences back to text like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownMathBlock toggles closed math fences back to text like Typora -->

```before
before
\[
x‸+y
\]
after
```

操作：命令 mathBlock

```after
before
x‸+y
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownMathBlock","args":[{"$state":{}}]} -->

### B-7 handleRawBlockEnter follows math selection and Shift precedence

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter follows math selection and Shift precedence -->

```before
$$␍
⟦alpha⟧␍
$$
```

操作：`Ctrl+Enter`

```after
$$␍
alpha␍
$$␍
␍
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":9}},{"ctrlKey":true}],"expectExtras":{"selectionHead":17,"kind":"math","action":"exit"}} -->

### B-7 handleRawBlockBoundaryDelete deletes empty math and protects non-empty math · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete deletes empty math and protects non-empty math -->

```before
$$
‸
$$
```

操作：`Backspace`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":3}},"backward"],"expectExtras":{"selectionHead":0,"kind":"math","action":"delete"}} -->

### B-7 handleRawBlockBoundaryDelete deletes empty math and protects non-empty math · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete deletes empty math and protects non-empty math -->

```before
$$
‸
$$
```

操作：`Delete`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":3}},"forward"],"expectExtras":{"selectionHead":0,"kind":"math","action":"delete"}} -->

### B-7 handleRawBlockBoundaryDelete deletes empty math and protects non-empty math · 第 3 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete deletes empty math and protects non-empty math -->

```before
$$
‸alpha
$$
```

操作：`Backspace`

```after
$$
‸alpha
$$
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":3}},"backward"],"expectExtras":{"selectionHead":3,"kind":"math","action":"consume"}} -->

### B-7 handleRawBlockBoundaryDelete deletes empty math and protects non-empty math · 第 4 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete deletes empty math and protects non-empty math -->

```before
$$
alpha‸
$$
```

操作：`Delete`

```after
$$
alpha‸
$$
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":8}},"forward"],"expectExtras":{"selectionHead":8,"kind":"math","action":"consume"}} -->

### B-7 tagged dollar math keeps raw block Enter and boundary deletion semantics · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › tagged dollar math keeps raw block Enter and boundary deletion semantics -->

```before
$$ {chapter 1}␍
‸alpha␍
$$ {chapter end}
```

操作：`Backspace`

```after
$$ {chapter 1}␍
‸alpha␍
$$ {chapter end}
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":16}},"backward"],"expectExtras":{"selectionHead":16,"kind":"math","action":"consume"}} -->

### B-7 tagged dollar math keeps raw block Enter and boundary deletion semantics · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › tagged dollar math keeps raw block Enter and boundary deletion semantics -->

<!-- 阶段 4 改：没有结尾围栏的 `$$` 不是公式块，是普通段落（同 Typora，1.5.1 节）；段落里 Ctrl+回车什么也不做 -->

```before
$$ {{tag}}␍
alpha‸
```

操作：`Ctrl+Enter`

```after
$$ {{tag}}␍
alpha‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":17}},{"ctrlKey":true}],"expectExtras":{"selectionHead":25,"kind":"math","action":"exit"}} -->

### B-7 tagged dollar math keeps raw block Enter and boundary deletion semantics · 第 3 步

<!-- 来源：tests/rawBlockEditing.test.ts › tagged dollar math keeps raw block Enter and boundary deletion semantics -->

```before
$$ {tag}
‸
$$ {end}
```

操作：`Delete`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":9}},"forward"],"expectExtras":{"selectionHead":0,"kind":"math","action":"delete"}} -->

### B-7 container-only indentation is empty for code and both math fence forms · 第 3 步

<!-- 来源：tests/rawBlockEditing.test.ts › container-only indentation is empty for code and both math fence forms -->

```before
- $$
  ‸
  $$
```

操作：`Backspace`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":7}},"backward"],"expectExtras":{"selectionHead":0,"kind":"math","action":"delete"}} -->

### B-7 container-only indentation is empty for code and both math fence forms · 第 4 步

<!-- 来源：tests/rawBlockEditing.test.ts › container-only indentation is empty for code and both math fence forms -->

```before
- $$
  ‸
  $$
```

操作：`Delete`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":7}},"forward"],"expectExtras":{"selectionHead":0,"kind":"math","action":"delete"}} -->

### B-7 container-only indentation is empty for code and both math fence forms · 第 5 步

<!-- 来源：tests/rawBlockEditing.test.ts › container-only indentation is empty for code and both math fence forms -->

```before
10. \[␍
    ‸␍
    \]
```

操作：`Backspace`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":12}},"backward"],"expectExtras":{"selectionHead":0,"kind":"math","action":"delete"}} -->

### B-7 container-only indentation is empty for code and both math fence forms · 第 6 步

<!-- 来源：tests/rawBlockEditing.test.ts › container-only indentation is empty for code and both math fence forms -->

```before
10. \[␍
    ‸␍
    \]
```

操作：`Delete`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":12}},"forward"],"expectExtras":{"selectionHead":0,"kind":"math","action":"delete"}} -->

### B-7 container-only indentation is empty for code and both math fence forms · 第 7 步

<!-- 来源：tests/rawBlockEditing.test.ts › container-only indentation is empty for code and both math fence forms -->

```before
> - outer␍
>   - $$␍
>     ‸␍
>     $$
```

操作：`Backspace`

```after
> - outer␍
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":27}},"backward"],"expectExtras":{"selectionHead":11,"kind":"math","action":"delete"}} -->

### B-7 container-only indentation is empty for code and both math fence forms · 第 8 步

<!-- 来源：tests/rawBlockEditing.test.ts › container-only indentation is empty for code and both math fence forms -->

```before
> - outer␍
>   - $$␍
>     ‸␍
>     $$
```

操作：`Delete`

```after
> - outer␍
‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":27}},"forward"],"expectExtras":{"selectionHead":11,"kind":"math","action":"delete"}} -->

### B-7 non-empty list math remains protected at both content boundaries · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › non-empty list math remains protected at both content boundaries -->

```before
- $$
  ‸x
  $$
```

操作：`Backspace`

```after
- $$
  ‸x
  $$
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":7}},"backward"],"expectExtras":{"selectionHead":7,"kind":"math","action":"consume"}} -->

### B-7 non-empty list math remains protected at both content boundaries · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › non-empty list math remains protected at both content boundaries -->

```before
- $$
  x‸
  $$
```

操作：`Delete`

```after
- $$
  x‸
  $$
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":8}},"forward"],"expectExtras":{"selectionHead":8,"kind":"math","action":"consume"}} -->

### B-7 non-empty list math remains protected at both content boundaries · 第 3 步

<!-- 来源：tests/rawBlockEditing.test.ts › non-empty list math remains protected at both content boundaries -->

```before
> 10. \[␍
>     ‸> literal␍
>     \]
```

操作：`Backspace`

```after
> 10. \[␍
>     ‸> literal␍
>     \]
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":16}},"backward"],"expectExtras":{"selectionHead":16,"kind":"math","action":"consume"}} -->

### B-7 non-empty list math remains protected at both content boundaries · 第 4 步

<!-- 来源：tests/rawBlockEditing.test.ts › non-empty list math remains protected at both content boundaries -->

```before
> 10. \[␍
>     > literal‸␍
>     \]
```

操作：`Delete`

```after
> 10. \[␍
>     > literal‸␍
>     \]
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":25}},"forward"],"expectExtras":{"selectionHead":25,"kind":"math","action":"consume"}} -->

### B-8 Backspace after a horizontal rule removes it and keeps one block interval · 第 1 步

<!-- 来源：tests/atomicBlockEditing.test.ts › Backspace after a horizontal rule removes it and keeps one block interval -->

```before
Before

---

‸After
```

操作：`Backspace`

```after
Before

‸After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"handleBackspaceAfterHorizontalRule","args":[{"$state":{}}]} -->

### B-8 Backspace after a horizontal rule removes it and keeps one block interval · 第 2 步

<!-- 来源：tests/atomicBlockEditing.test.ts › Backspace after a horizontal rule removes it and keeps one block interval -->

```before
Before
* * *
‸After
```

操作：`Backspace`

```after
Before

‸After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"handleBackspaceAfterHorizontalRule","args":[{"$state":{}}]} -->

### B-8 Backspace after a horizontal rule removes it and keeps one block interval · 第 3 步

<!-- 来源：tests/atomicBlockEditing.test.ts › Backspace after a horizontal rule removes it and keeps one block interval -->

```before
Before


---


‸After
```

操作：`Backspace`

```after
Before

‸After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"handleBackspaceAfterHorizontalRule","args":[{"$state":{}}]} -->

### B-8 Backspace after a leading horizontal rule removes leading blank lines · 第 1 步

<!-- 来源：tests/atomicBlockEditing.test.ts › Backspace after a leading horizontal rule removes leading blank lines -->

```before
---
‸After
```

操作：`Backspace`

```after
‸After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"handleBackspaceAfterHorizontalRule","args":[{"$state":{}}]} -->

### B-8 Backspace after a leading horizontal rule removes leading blank lines · 第 2 步

<!-- 来源：tests/atomicBlockEditing.test.ts › Backspace after a leading horizontal rule removes leading blank lines -->

```before
* * *
‸After
```

操作：`Backspace`

```after
‸After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"handleBackspaceAfterHorizontalRule","args":[{"$state":{}}]} -->

### B-8 Backspace after a leading horizontal rule removes leading blank lines · 第 3 步

<!-- 来源：tests/atomicBlockEditing.test.ts › Backspace after a leading horizontal rule removes leading blank lines -->

```before
---


‸After
```

操作：`Backspace`

```after
‸After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"handleBackspaceAfterHorizontalRule","args":[{"$state":{}}]} -->

### B-8 Backspace after a leading horizontal rule removes leading blank lines · 第 4 步

<!-- 来源：tests/atomicBlockEditing.test.ts › Backspace after a leading horizontal rule removes leading blank lines -->

```before


---

‸After
```

操作：`Backspace`

```after
‸After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"handleBackspaceAfterHorizontalRule","args":[{"$state":{}}]} -->

### B-8 Backspace after a horizontal rule preserves CRLF

<!-- 来源：tests/atomicBlockEditing.test.ts › Backspace after a horizontal rule preserves CRLF -->

```before
Before␍
␍
* * *␍
␍
‸After
```

操作：`Backspace`

```after
Before␍
␍
‸After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"handleBackspaceAfterHorizontalRule","args":[{"$state":{}}]} -->

### B-8 insertMarkdownHorizontalRule inserts a standalone rule block like Typora

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownHorizontalRule inserts a standalone rule block like Typora -->

```before
Intro‸
```

操作：命令 hr

```after
Intro

---
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownHorizontalRule","args":[{"$state":{}}]} -->

### B-8 insertMarkdownHorizontalRule avoids extra blank lines around existing blocks

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownHorizontalRule avoids extra blank lines around existing blocks -->

```before
Intro

‸Outro
```

操作：命令 hr

```after
Intro

---
‸
Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownHorizontalRule","args":[{"$state":{}}]} -->

### B-8 insertMarkdownHorizontalRule preserves CRLF line endings

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownHorizontalRule preserves CRLF line endings -->

```before
Intro␍
‸Outro
```

操作：命令 hr

```after
Intro␍
␍
---␍
‸␍
Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownHorizontalRule","args":[{"$state":{}}]} -->

### B-9 editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line -->

```before
---
title: x
‸
---
Body
```

操作：`Enter`

```after
---
title: x

---
‸
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownFrontMatterOnEnter","args":[{"$state":{}}]} -->

### B-9 editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line -->

```before
---
title: x
‸
---
```

操作：`Enter`

```after
---
title: x

---
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownFrontMatterOnEnter","args":[{"$state":{}}]} -->

### B-9 editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line -->

```before
---
title: x
‸
---
```

操作：`Ctrl+Enter`

```after
---
title: x

‸
---
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownFrontMatterOnEnter","args":[{"$state":{}},{"primary":true}]} -->

### B-9 editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line -->

```before
---
title: x
‸
---
```

操作：`Shift+Enter`

```after
---
title: x

‸
---
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownFrontMatterOnEnter","args":[{"$state":{}},{"shift":true}]} -->

### B-9 editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownFrontMatterOnEnter inserts literal line breaks and exits from the trailing empty line -->

```before
---
title: x
‸
---
```

操作：`Alt+Enter`

```after
---
title: x

‸
---
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownFrontMatterOnEnter","args":[{"$state":{}},{"alt":true}]} -->

### B-9 editMarkdownFrontMatterOnEnter deletes selections first and preserves CRLF · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownFrontMatterOnEnter deletes selections first and preserves CRLF -->

```before
---␍
title: ⟦remove⟧␍
␍
---
```

操作：`Enter`

```after
---␍
title: ␍
‸␍
␍
---
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownFrontMatterOnEnter","args":[{"$state":{}}]} -->

### B-9 editMarkdownFrontMatterOnEnter deletes selections first and preserves CRLF · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownFrontMatterOnEnter deletes selections first and preserves CRLF -->

```before
---␍
title: x␍
‸␍
---␍
Body
```

操作：`Enter`

```after
---␍
title: x␍
␍
---␍
‸␍
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownFrontMatterOnEnter","args":[{"$state":{}}]} -->

### B-9 Front Matter editing supports the YAML explicit end marker with CRLF · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › Front Matter editing supports the YAML explicit end marker with CRLF -->

```before
---␍
title: x␍
‸␍
...␍
After
```

操作：`Enter`

```after
---␍
title: x␍
␍
...␍
‸␍
After
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownFrontMatterOnEnter","args":[{"$state":{}}]} -->

### B-10 insertMarkdownTocTemplate inserts a standalone TOC block like Typora

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownTocTemplate inserts a standalone TOC block like Typora -->

```before
Intro‸
```

操作：命令 toc

```after
Intro

[TOC]
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTocTemplate","args":[{"$state":{}}]} -->

### B-10 insertMarkdownTocTemplate preserves CRLF line endings

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownTocTemplate preserves CRLF line endings -->

```before
Intro␍
‸Outro
```

操作：命令 toc

```after
Intro␍
␍
[TOC]␍
‸␍
Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTocTemplate","args":[{"$state":{}}]} -->

### B-11 insertMarkdownFootnoteTemplate inserts a reference and selects the definition body like Typora

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownFootnoteTemplate inserts a reference and selects the definition body like Typora -->

```before
Text‸
```

操作：命令 footnote

```after
Text[^1]

[^1]: ⟦脚注内容⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownFootnoteTemplate","args":[{"$state":{}}]} -->

### B-11 insertMarkdownFootnoteTemplate uses selected text as the footnote body

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownFootnoteTemplate uses selected text as the footnote body -->

```before
Text ⟦note⟧
```

操作：命令 footnote

```after
Text [^1]

[^1]: ⟦note⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownFootnoteTemplate","args":[{"$state":{}}]} -->

### B-11 insertMarkdownFootnoteTemplate skips existing numeric footnote ids

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownFootnoteTemplate skips existing numeric footnote ids -->

```before
Text‸[^1]

[^1]: old
```

操作：命令 footnote

```after
Text[^2][^1]

[^1]: old

[^2]: ⟦脚注内容⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownFootnoteTemplate","args":[{"$state":{}}]} -->

### B-11 insertMarkdownFootnoteTemplate preserves CRLF line endings

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownFootnoteTemplate preserves CRLF line endings -->

```before
Intro‸␍
Outro
```

操作：命令 footnote

```after
Intro[^1]␍
Outro␍
␍
[^1]: ⟦脚注内容⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownFootnoteTemplate","args":[{"$state":{}}]} -->

### B-12 wrapHtmlCommentSelection toggles Typora-style inline comments · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › wrapHtmlCommentSelection toggles Typora-style inline comments -->

```before
keep ⟦note⟧
```

操作：命令 comment

```after
keep <!-- ⟦note⟧ -->
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapHtmlCommentSelection","args":[{"$state":{}}]} -->

### B-12 wrapHtmlCommentSelection toggles Typora-style inline comments · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › wrapHtmlCommentSelection toggles Typora-style inline comments -->

```before
keep <!-- ⟦note⟧ -->
```

操作：命令 comment

```after
keep ⟦note⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapHtmlCommentSelection","args":[{"$state":{}}]} -->

### B-12 wrapHtmlCommentSelection toggles Typora-style inline comments · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › wrapHtmlCommentSelection toggles Typora-style inline comments -->

```before
‸
```

操作：命令 comment

```after
<!-- ⟦注释文本⟧ -->
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"wrapHtmlCommentSelection","args":[{"$state":{}}]} -->

### B-12 handleRawBlockEnter exits closed HTML on ordinary Enter

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter exits closed HTML on ordinary Enter -->

```before
<div>
text
</div>‸
```

操作：`Enter`

```after
<div>
text
</div>

‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":17}}],"expectExtras":{"selectionHead":19,"kind":"html","action":"exit"}} -->

### B-12 handleRawBlockEnter keeps unclosed or Shift-entered HTML inside · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter keeps unclosed or Shift-entered HTML inside -->

```before
<div>
text‸
```

操作：`Ctrl+Enter`

```after
<div>
text

‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":10}},{"ctrlKey":true}],"expectExtras":{"selectionHead":12,"kind":"html","action":"exit"}} -->

### B-12 handleRawBlockEnter keeps unclosed or Shift-entered HTML inside · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter keeps unclosed or Shift-entered HTML inside -->

```before
<div>
text
</div>‸
```

操作：`Ctrl+Shift+Enter`

```after
<div>
text
</div>

‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":17}},{"ctrlKey":true,"shiftKey":true}],"expectExtras":{"selectionHead":19,"kind":"html","action":"exit"}} -->

### B-12 handleRawBlockEnter follows HTML selection-head semantics

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockEnter follows HTML selection-head semantics -->

```before
<div>⟦text</div>⟧
```

操作：`Enter`

```after
<div>text</div>

‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockEnter","args":[{"$state":{"selectionHead":15}}],"expectExtras":{"selectionHead":17,"kind":"html","action":"exit"}} -->

### B-12 handleRawBlockBoundaryDelete conservatively protects HTML boundaries · 第 1 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete conservatively protects HTML boundaries -->

```before
‸<div>text</div>
```

操作：`Backspace`

```after
‸<div>text</div>
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":0}},"backward"],"expectExtras":{"selectionHead":0,"kind":"html","action":"consume"}} -->

### B-12 handleRawBlockBoundaryDelete conservatively protects HTML boundaries · 第 2 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete conservatively protects HTML boundaries -->

```before
<div>text</div>‸
```

操作：`Delete`

```after
<div>text</div>‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":15}},"forward"],"expectExtras":{"selectionHead":15,"kind":"html","action":"consume"}} -->

### B-12 handleRawBlockBoundaryDelete conservatively protects HTML boundaries · 第 3 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete conservatively protects HTML boundaries -->

```before
‸<div>
text
</div>
```

操作：`Backspace`

```after
‸<div>
text
</div>
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":0}},"backward"],"expectExtras":{"selectionHead":0,"kind":"html","action":"consume"}} -->

### B-12 handleRawBlockBoundaryDelete conservatively protects HTML boundaries · 第 4 步

<!-- 来源：tests/rawBlockEditing.test.ts › handleRawBlockBoundaryDelete conservatively protects HTML boundaries -->

```before
<div>
text
</div>‸
```

操作：`Delete`

```after
<div>
text
</div>‸
```

<!-- 旧代码：{"module":"src/utils/rawBlockEditing","fn":"handleRawBlockBoundaryDelete","args":[{"$state":{"selectionHead":17}},"forward"],"expectExtras":{"selectionHead":17,"kind":"html","action":"consume"}} -->

### B-13 insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert · 第 1 步

<!-- 来源：tests/alertCommands.test.ts › insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert -->

```before
Intro‸
```

操作：命令 callout("note")

```after
> [!NOTE]
> Intro‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"note"]} -->

### B-13 insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert · 第 2 步

<!-- 来源：tests/alertCommands.test.ts › insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert -->

```before
Intro‸
```

操作：命令 callout("tip")

```after
> [!TIP]
> Intro‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"tip"]} -->

### B-13 insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert · 第 3 步

<!-- 来源：tests/alertCommands.test.ts › insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert -->

```before
Intro‸
```

操作：命令 callout("important")

```after
> [!IMPORTANT]
> Intro‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"important"]} -->

### B-13 insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert · 第 4 步

<!-- 来源：tests/alertCommands.test.ts › insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert -->

```before
Intro‸
```

操作：命令 callout("warning")

```after
> [!WARNING]
> Intro‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"warning"]} -->

### B-13 insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert · 第 5 步

<!-- 来源：tests/alertCommands.test.ts › insertMarkdownCalloutTemplate 将当前段落切换为五种 Typora Alert -->

```before
Intro‸
```

操作：命令 callout("caution")

```after
> [!CAUTION]
> Intro‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"caution"]} -->

### B-13 Alert 对无效类型回退到 NOTE 并保留 CRLF

<!-- 来源：tests/alertCommands.test.ts › Alert 对无效类型回退到 NOTE 并保留 CRLF -->

```before
Intro␍
‸
```

操作：命令 callout("unknown")

```after
> [!NOTE]␍
> Intro␍
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"unknown"]} -->

### B-13 Alert 将选中的多个段落转换为一个连续引用块

<!-- 来源：tests/alertCommands.test.ts › Alert 将选中的多个段落转换为一个连续引用块 -->

```before
⟦Alpha

Beta⟧
```

操作：命令 callout("TIP")

```after
> [!TIP]
> ⟦Alpha
> 
> Beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"TIP"]} -->

### B-13 Alert 可切换类型，并在再次选择同类型时还原普通段落 · 第 1 步

<!-- 来源：tests/alertCommands.test.ts › Alert 可切换类型，并在再次选择同类型时还原普通段落 -->

```before
> [!NOTE]
> Al‸pha
>
> Beta
```

操作：命令 callout("WARNING")

```after
> [!WARNING]
> Al‸pha
>
> Beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"WARNING"]} -->

### B-13 Alert 可切换类型，并在再次选择同类型时还原普通段落 · 第 2 步

<!-- 来源：tests/alertCommands.test.ts › Alert 可切换类型，并在再次选择同类型时还原普通段落 -->

```before
> [!WARNING]
> Al‸pha
>
> Beta
```

操作：命令 callout("WARNING")

```after
Al‸pha

Beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"WARNING"]} -->

### B-13 Alert 将已有普通引用升级为提示而不增加引用层级

<!-- 来源：tests/alertCommands.test.ts › Alert 将已有普通引用升级为提示而不增加引用层级 -->

<!-- 阶段 4 改：编辑器里选区进不了引用的 `>`：选中整块就是从内容开头选起；改出来的文字相同 -->

```before
> ⟦Alpha
> Beta⟧
```

操作：命令 callout("IMPORTANT")

```after
> [!IMPORTANT]
> ⟦Alpha
> Beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}},"IMPORTANT"]} -->

### B-13 insertMarkdownCalloutTemplate converts the current paragraph like Typora

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownCalloutTemplate converts the current paragraph like Typora -->

```before
Intro‸
```

操作：命令 callout

```after
> [!NOTE]
> Intro‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}}]} -->

### B-13 insertMarkdownCalloutTemplate preserves CRLF line endings

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownCalloutTemplate preserves CRLF line endings -->

```before
Intro␍
‸
```

操作：命令 callout

```after
> [!NOTE]␍
> Intro␍
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownCalloutTemplate","args":[{"$state":{}}]} -->

### B-14 formatMarkdownLines converts between list types · 第 10 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
Term
⟦Definition⟧
```

操作：命令 definitionList

```after
Term
: ⟦Definition⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"definition"]} -->

### B-14 formatMarkdownLines converts between list types · 第 11 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
> Term
⟦> Definition⟧
```

操作：命令 definitionList

```after
> Term
> : ⟦Definition⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"definition"]} -->

### B-14 formatMarkdownLines converts between list types · 第 16 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines converts between list types -->

```before
‸
```

操作：命令 definitionList

```after
: ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"definition"]} -->

### B-14 formatMarkdownLines toggles the same list type back to paragraph · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles the same list type back to paragraph -->

```before
⟦: Definition
: Second⟧
```

操作：命令 definitionList

```after
⟦Definition
Second⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"definition"]} -->

### B-14 formatMarkdownLines toggles the same list type back to paragraph · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines toggles the same list type back to paragraph -->

```before
⟦> : Definition⟧
```

操作：命令 definitionList

```after
> ⟦Definition⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"definition"]} -->

### B-14 formatMarkdownLines preserves CRLF when toggling blockquote and list formats · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › formatMarkdownLines preserves CRLF when toggling blockquote and list formats -->

```before
Term␍
⟦Definition⟧
```

操作：命令 definitionList

```after
Term␍
: ⟦Definition⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"formatMarkdownLines","args":[{"$state":{}},"definition"]} -->

### B-4 indentSelection renumbers ordered list siblings after indenting an item

<!-- 来源：tests/editorBlocks.test.ts › indentSelection renumbers ordered list siblings after indenting an item -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
1. one
2. ‸two
3. three
```

操作：命令 indentLines

```after
1. one
  1. ‸two
2. three
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### B-4 indentSelection renumbers ordered list siblings after outdenting an item

<!-- 来源：tests/editorBlocks.test.ts › indentSelection renumbers ordered list siblings after outdenting an item -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
1. one
  1. ‸two
2. three
```

操作：命令 outdentLines

```after
1. one
2. ‸two
3. three
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### B-4 indentSelection preserves ordered list start while renumbering nested groups

<!-- 来源：tests/editorBlocks.test.ts › indentSelection preserves ordered list start while renumbering nested groups -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
9. nine
10. ‸ten
11. eleven
```

操作：命令 indentLines

```after
9. nine
  1. ‸ten
10. eleven
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### B-4 indentSelection does not renumber four-space ordered code outside lists like Typora

<!-- 来源：tests/editorBlocks.test.ts › indentSelection does not renumber four-space ordered code outside lists like Typora -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
paragraph
    ‸3. code
    10. code
```

操作：命令 indentLines

```after
paragraph
      ‸3. code
    10. code
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### B-4 indentSelection still renumbers four-space nested ordered lists inside parent lists

<!-- 来源：tests/editorBlocks.test.ts › indentSelection still renumbers four-space nested ordered lists inside parent lists -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
- parent
    3. child
    4. ‸next
```

操作：命令 indentLines

```after
- parent
    1. child
      1. ‸next
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### B-4 indentSelection indents quoted ordered list items inside the blockquote

<!-- 来源：tests/editorBlocks.test.ts › indentSelection indents quoted ordered list items inside the blockquote -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> 1. one
> 2. ‸two
> 3. three
```

操作：命令 indentLines

```after
> 1. one
>   1. ‸two
> 2. three
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### B-4 indentSelection outdents quoted ordered list items and renumbers siblings

<!-- 来源：tests/editorBlocks.test.ts › indentSelection outdents quoted ordered list items and renumbers siblings -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> 1. one
>   1. ‸two
> 2. three
```

操作：命令 outdentLines

```after
> 1. one
> 2. ‸two
> 3. three
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### B-4 indentSelection maps the cursor after quoted ordered list renumbering changes width

<!-- 来源：tests/editorBlocks.test.ts › indentSelection maps the cursor after quoted ordered list renumbering changes width -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> 9. nine
>   1. ‸ten
> 10. eleven
```

操作：命令 outdentLines

```after
> 9. nine
> 10. ‸ten
> 11. eleven
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### B-4 indentSelection keeps quoted task list markers inside the quote while indenting selections

<!-- 来源：tests/editorBlocks.test.ts › indentSelection keeps quoted task list markers inside the quote while indenting selections -->

<!-- 阶段 4 改：编辑器里选区进不了块标记（引用的 `>`、列表符号、任务框）：选中整行就是从内容开头选起；改出来的文字相同 -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> - [ ] ⟦first
> - [x] second⟧
```

操作：命令 indentLines

```after
>   - [ ] ⟦first
>   - [x] second⟧
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### B-4 indentSelection keeps a line-start cursor collapsed before quoted list indentation

<!-- 来源：tests/editorBlocks.test.ts › indentSelection keeps a line-start cursor collapsed before quoted list indentation -->

<!-- 阶段 4 改：编辑器里光标进不了块标记：行首的光标在内容开头；改出来的文字相同 -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> - ‸item
```

操作：命令 indentLines

```after
>   - ‸item
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### B-4 indentSelection outdents quoted task list items inside the blockquote

<!-- 来源：tests/editorBlocks.test.ts › indentSelection outdents quoted task list items inside the blockquote -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
>   - [ ] ‸task
```

操作：命令 outdentLines

```after
> - [ ] ‸task
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### B-4 indentSelection supports Typora-style four-space indentation preference · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › indentSelection supports Typora-style four-space indentation preference -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
⟦alpha
beta⟧
```

操作：命令 indentLines（Markdown 缩进宽度 4）

```after
    ⟦alpha
    beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},false,4]} -->

### B-4 indentSelection supports Typora-style four-space indentation preference · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › indentSelection supports Typora-style four-space indentation preference -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
⟦    alpha
    beta⟧
```

操作：命令 outdentLines（Markdown 缩进宽度 4）

```after
⟦alpha
beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"indentSelection","args":[{"$text":true},{"$start":true},{"$end":true},true,4]} -->

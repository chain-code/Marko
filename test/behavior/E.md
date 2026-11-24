# 编辑核心（E）的行为规格

格式见同目录的 [README](README.md)。
本文件由 `legacy/extract.mjs` 从旧代码的逻辑测试生成（2026-11-23），之后手工维护。

### E-1 insertMarkdownAtSelection preserves CRLF for generated toolbar snippets

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownAtSelection preserves CRLF for generated toolbar snippets -->

```before
before‸␍
after
```

操作：命令 insertText("\n---\n")

```after
before␍
---␍
‸␍
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownAtSelection","args":[{"$state":{}},"\n---\n"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary merges paragraph gaps in one Backspace or Delete · 第 1 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary merges paragraph gaps in one Backspace or Delete -->

```before
left

‸right
```

操作：`Backspace`

```after
left‸right
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"backward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary merges paragraph gaps in one Backspace or Delete · 第 2 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary merges paragraph gaps in one Backspace or Delete -->

```before
left‸

right
```

操作：`Delete`

```after
left‸right
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics · 第 1 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics -->

```before
# title

‸body
```

操作：`Backspace`

```after
# title‸body
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"backward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics · 第 2 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics -->

```before
# title‸

body
```

操作：`Delete`

```after
# title‸body
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics · 第 3 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics -->

```before
> quote

‸body
```

操作：`Backspace`

```after
> quote‸body
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"backward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics · 第 4 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics -->

```before
> quote‸

body
```

操作：`Delete`

```after
> quote‸body
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics · 第 5 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics -->

```before
- item

‸body
```

操作：`Backspace`

```after
- item‸body
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"backward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics · 第 6 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics -->

```before
- item‸

body
```

操作：`Delete`

```after
- item‸body
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics · 第 7 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics -->

```before
- [ ] task

‸body
```

操作：`Backspace`

```after
- [ ] task‸body
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"backward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics · 第 8 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary preserves the left heading, quote, or list semantics -->

```before
- [ ] task‸

body
```

操作：`Delete`

```after
- [ ] task‸body
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary appends body text before a Setext underline · 第 1 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary appends body text before a Setext underline -->

```before
Title
---

‸body
```

操作：`Backspace`

```after
Title‸body
---
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"backward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary appends body text before a Setext underline · 第 2 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary appends body text before a Setext underline -->

```before
Title
===

‸body
```

操作：`Backspace`

```after
Title‸body
===
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"backward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary removes every invisible blank line and preserves CRLF elsewhere

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary removes every invisible blank line and preserves CRLF elsewhere -->

```before
left  ␍
 ␍
	␍
‸right␍
after
```

操作：`Backspace`

```after
left‸right␍
after
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"backward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete · 第 1 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete -->

```before
left‸

# title
```

操作：`Delete`

```after
left‸title
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete · 第 2 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete -->

```before
left‸

> quote
```

操作：`Delete`

```after
left‸quote
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete · 第 3 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete -->

```before
left‸

- item
```

操作：`Delete`

```after
left‸item
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete · 第 4 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete -->

```before
left‸

3. item
```

操作：`Delete`

```after
left‸item
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete · 第 5 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete -->

```before
left‸

- [x] task
```

操作：`Delete`

```after
left‸task
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete · 第 6 步

<!-- 来源：tests/editorBlockBoundary.test.ts › mergeVisibleMarkdownBlockBoundary strips the first semantic marker on forward Delete -->

```before
left‸

- first
- second
```

操作：`Delete`

```after
left‸first
- second
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"mergeVisibleMarkdownBlockBoundary","args":[{"$state":{}},"forward"]} -->

### E-3 markdown block shortcuts treat heavily indented fence markers as code text like Typora · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › markdown block shortcuts treat heavily indented fence markers as code text like Typora -->

```before
    $$
# ‸title
```

操作：`Backspace`

```after
    $$
‸title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 Front Matter protects YAML shortcuts and unwraps only at the absolute content start

<!-- 来源：tests/editorCommands.test.ts › Front Matter protects YAML shortcuts and unwraps only at the absolute content start -->

<!-- 阶段 4 改：退格去掉 Front Matter 后光标在 `- item` 的内容开头（编辑器里光标进不了列表符号） -->

```before
---
‸- item
# title
---
Body
```

操作：`Backspace`

```after
- ‸item
# title
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes complete heading patterns · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes complete heading patterns -->

```before
## ‸Alpha ##
```

操作：`Backspace`

```after
‸Alpha
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes complete heading patterns · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes complete heading patterns -->

```before
‸Alpha
===
Body
```

操作：`Backspace`

```after
‸Alpha
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes complete heading patterns · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes complete heading patterns -->

```before
before
‸Alpha
===
Body
```

操作：`Backspace`

```after
before
‸Alpha
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
### ‸Title
```

操作：`Backspace`

```after
‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
  ## ‸Title
```

操作：`Backspace`

```after
  ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
> ‸Quote
```

操作：`Backspace`

```after
‸Quote
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
> > ‸Quote
```

操作：`Backspace`

```after
> ‸Quote
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
> ### ‸Title
```

操作：`Backspace`

```after
> ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
>> ## ‸Title
```

操作：`Backspace`

```after
> > ‸Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
Title
‸---
body
```

操作：`Backspace`

```after
Title‸
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
> Title
‸> ---
body
```

操作：`Backspace`

```after
> Title‸
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 9 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
Title
‸===
```

操作：`Backspace`

```after
Title‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 10 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
Title␍
‸---␍
body
```

操作：`Backspace`

```after
Title‸␍
body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 11 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

<!-- 阶段 4 改：前面没有术语的 `: 说明` 不是定义列表，是普通段落（同 Typora、CommonMark）：退格删一个字符 -->

```before
: ‸Definition
```

操作：`Backspace`

```after
:‸Definition
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 12 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

<!-- 阶段 4 改：前面没有术语的 `: 说明` 不是定义列表，是普通段落（同 Typora、CommonMark）：退格删一个字符 -->

```before
  : ‸Definition
```

操作：`Backspace`

```after
  :‸Definition
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 13 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

<!-- 阶段 4 改：前面没有术语的 `: 说明` 不是定义列表，是普通段落（同 Typora、CommonMark）：退格删一个字符 -->

```before
> : ‸Definition
```

操作：`Backspace`

```after
> :‸Definition
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 14 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
[^1]: ‸detail
```

操作：`Backspace`

```after
‸detail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 15 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
   [^1]: ‸detail
```

操作：`Backspace`

```after
   ‸detail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 16 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
> [^1]: ‸detail
```

操作：`Backspace`

```after
> ‸detail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 17 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
Term
: Definition
  ‸continuation
```

操作：`Backspace`

```after
Term
: Definition
‸continuation
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 18 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
> Term
> : Definition
>   ‸continuation
```

操作：`Backspace`

```after
> Term
> : Definition
> ‸continuation
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 19 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
[^1]: detail
    ‸continuation
```

操作：`Backspace`

```after
[^1]: detail
‸continuation
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 20 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
> [^1]: detail
>     ‸continuation
```

操作：`Backspace`

```after
> [^1]: detail
> ‸continuation
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 21 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
- item
  ‸continuation
```

操作：`Backspace`

```after
- item
‸continuation
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora · 第 22 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace removes heading and quote markers like Typora -->

```before
> - item
>   ‸continuation
```

操作：`Backspace`

```after
> - item
> ‸continuation
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace preserves CRLF for block markers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace preserves CRLF for block markers -->

```before
before␍
### ‸Title␍
after
```

操作：`Backspace`

```after
before␍
‸Title␍
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace preserves CRLF for block markers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace preserves CRLF for block markers -->

```before
before␍
> ‸Quote␍
after
```

操作：`Backspace`

```after
before␍
‸Quote␍
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace preserves CRLF for block markers · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace preserves CRLF for block markers -->

```before
Term␍
: Definition␍
  ‸continuation
```

操作：`Backspace`

```after
Term␍
: Definition␍
‸continuation
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 unwrapMarkdownBlockOnBackspace preserves CRLF for block markers · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › unwrapMarkdownBlockOnBackspace preserves CRLF for block markers -->

```before
- item␍
  ‸continuation
```

操作：`Backspace`

```after
- item␍
‸continuation
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-3 Front Matter editing supports the YAML explicit end marker with CRLF · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › Front Matter editing supports the YAML explicit end marker with CRLF -->

```before
---␍
‸title: x␍
...␍
After
```

操作：`Backspace`

```after
‸title: x␍
After
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"unwrapMarkdownBlockOnBackspace","args":[{"$state":{}}]} -->

### E-4 星号无序列表保留输入标记并在 Enter 后续写同格式 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表保留输入标记并在 Enter 后续写同格式 -->

```before
*‸
```

操作：输入 " "

```after
* ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 空列表项输入星号空格时转换为只含内层标记的标准缩进 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项输入星号空格时转换为只含内层标记的标准缩进 -->

```before
* level-one
* *‸
```

操作：输入 " "

```after
* level-one
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}},2]} -->

### E-4 空列表项输入星号空格时转换为只含内层标记的标准缩进 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项输入星号空格时转换为只含内层标记的标准缩进 -->

```before
- level-one
- *‸
```

操作：输入 " "

```after
- level-one
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}},2]} -->

### E-4 空列表项输入星号空格时转换为只含内层标记的标准缩进 · 第 3 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项输入星号空格时转换为只含内层标记的标准缩进 -->

```before
* level-one
  * level-two
  * *‸
```

操作：输入 " "

```after
* level-one
  * level-two
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}},2]} -->

### E-4 空列表项输入星号空格时转换为只含内层标记的标准缩进 · 第 4 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项输入星号空格时转换为只含内层标记的标准缩进 -->

```before
> * quoted-one
> * *‸
```

操作：输入 " "

```after
> * quoted-one
>   * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}},2]} -->

### E-4 空列表项输入星号空格时转换为只含内层标记的标准缩进 · 第 5 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项输入星号空格时转换为只含内层标记的标准缩进 -->

```before
* level-one␍
* *‸
```

操作：输入 " "

```after
* level-one␍
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}},2]} -->

### E-4 空列表项输入星号空格时转换为只含内层标记的标准缩进 · 第 6 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项输入星号空格时转换为只含内层标记的标准缩进 -->

```before
* level-one
* *‸
```

操作：输入 " "（Markdown 缩进宽度 4）

```after
* level-one
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}},4]} -->

### E-4 批量输入星号嵌套项时同样转换为标准缩进 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 批量输入星号嵌套项时同样转换为标准缩进 -->

```before
* level-one
* *‸
```

操作：输入 " "

```after
* level-one
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownTextInputShortcut","args":[{"$state":{}}," "]} -->

### E-4 批量输入星号嵌套项时同样转换为标准缩进 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 批量输入星号嵌套项时同样转换为标准缩进 -->

```before
* level-one
  * level-two
  * *‸
```

操作：输入 " "

```after
* level-one
  * level-two
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownTextInputShortcut","args":[{"$state":{}}," "]} -->

### E-4 批量输入星号嵌套项时同样转换为标准缩进 · 第 3 步

<!-- 来源：tests/asteriskListEnter.test.ts › 批量输入星号嵌套项时同样转换为标准缩进 -->

```before
* level-one
* ‸
```

操作：输入 "* "

```after
* level-one
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownTextInputShortcut","args":[{"$state":{}},"* "]} -->

### E-4 批量输入星号嵌套项时同样转换为标准缩进 · 第 4 步

<!-- 来源：tests/asteriskListEnter.test.ts › 批量输入星号嵌套项时同样转换为标准缩进 -->

```before
* level-one
  * level-two
  * ‸
```

操作：输入 "* "

```after
* level-one
  * level-two
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownTextInputShortcut","args":[{"$state":{}},"* "]} -->

### E-4 批量输入星号嵌套项时同样转换为标准缩进 · 第 5 步

<!-- 来源：tests/asteriskListEnter.test.ts › 批量输入星号嵌套项时同样转换为标准缩进 -->

```before
- level-one
- ‸
```

操作：输入 "* level-two"

```after
- level-one
  * level-two‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownTextInputShortcut","args":[{"$state":{}},"* level-two"]} -->

### E-4 批量输入星号嵌套项时同样转换为标准缩进 · 第 6 步

<!-- 来源：tests/asteriskListEnter.test.ts › 批量输入星号嵌套项时同样转换为标准缩进 -->

```before
* level-one
  * level-two
  * ‸
```

操作：输入 "* level-three"

```after
* level-one
  * level-two
    * level-three‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownTextInputShortcut","args":[{"$state":{}},"* level-three"]} -->

### E-4 输入后的空格修正会将交互生成的紧凑标记转换为标准缩进 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 输入后的空格修正会将交互生成的紧凑标记转换为标准缩进 -->

```before
* level-one
* * ‸
```

操作：命令 applyMarkdownSpaceShortcutAfterInput（空格已经输入之后的修正）

```after
* level-one
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcutAfterInput","args":[{"$state":{}}]} -->

### E-4 输入后的空格修正会将交互生成的紧凑标记转换为标准缩进 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 输入后的空格修正会将交互生成的紧凑标记转换为标准缩进 -->

```before
* level-one
  * level-two
  * * ‸
```

操作：命令 applyMarkdownSpaceShortcutAfterInput（空格已经输入之后的修正）

```after
* level-one
  * level-two
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcutAfterInput","args":[{"$state":{}}]} -->

### E-4 输入后的空格修正会将交互生成的紧凑标记转换为标准缩进 · 第 3 步

<!-- 来源：tests/asteriskListEnter.test.ts › 输入后的空格修正会将交互生成的紧凑标记转换为标准缩进 -->

```before
> - quoted-one
> - * ‸
```

操作：命令 applyMarkdownSpaceShortcutAfterInput（空格已经输入之后的修正）

```after
> - quoted-one
>   * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcutAfterInput","args":[{"$state":{}}]} -->

### E-4 ordered list commands support arbitrary-length marker digits · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

```before
123456789.‸
```

操作：输入 " "

```after
123456789. ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 ordered list commands support arbitrary-length marker digits · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

```before
1234567890.‸
```

操作：输入 " "

```after
1234567890. ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 markdown list commands keep four-space nested list markers inside parent lists · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › markdown list commands keep four-space nested list markers inside parent lists -->

```before
- parent
    -‸
```

操作：输入 " "

```after
- parent
    - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 markdown block shortcuts treat heavily indented fence markers as code text like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › markdown block shortcuts treat heavily indented fence markers as code text like Typora -->

````before
    ```
#‸
````

操作：输入 " "

````after
    ```
# ‸
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
  >‸
```

操作：输入 " "

```after
  > ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
[]‸
```

操作：输入 " "

```after
- [ ] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
[x]‸
```

操作：输入 " "

```after
- [x] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
[ ]‸
```

操作：输入 " "

```after
- [ ] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
[X]‸
```

操作：输入 " "

```after
- [x] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
- [x]‸
```

操作：输入 " "

```after
- [x] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
1. [x]‸
```

操作：输入 " "

```after
1. [x] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
1) [X]‸
```

操作：输入 " "

```after
1) [x] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 9 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
---‸
```

操作：输入 " "

```after
---
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 10 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
***‸
```

操作：输入 " "

```after
***
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes Typora-style line markers · 第 11 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes Typora-style line markers -->

```before
___‸
```

操作：输入 " "

```after
___
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes markers inside blockquotes · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes markers inside blockquotes -->

```before
> *‸
```

操作：输入 " "

```after
> * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes markers inside blockquotes · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes markers inside blockquotes -->

```before
>>‸
```

操作：输入 " "

```after
> > ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes markers inside blockquotes · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes markers inside blockquotes -->

```before
> >‸
```

操作：输入 " "

```after
> > ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes markers inside blockquotes · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes markers inside blockquotes -->

```before
>	*‸
```

操作：输入 " "

```after
> * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes markers inside blockquotes · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes markers inside blockquotes -->

```before
> []‸
```

操作：输入 " "

```after
> - [ ] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes markers inside blockquotes · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes markers inside blockquotes -->

```before
> [x]‸
```

操作：输入 " "

```after
> - [x] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes markers inside blockquotes · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes markers inside blockquotes -->

```before
>   []‸
```

操作：输入 " "

```after
>   - [ ] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut normalizes markers inside blockquotes · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut normalizes markers inside blockquotes -->

```before
> 1. [x]‸
```

操作：输入 " "

```after
> 1. [x] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut preserves CRLF for generated horizontal rules · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut preserves CRLF for generated horizontal rules -->

```before
before␍
---‸
```

操作：输入 " "

```after
before␍
---␍
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut preserves CRLF for generated horizontal rules · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut preserves CRLF for generated horizontal rules -->

```before
before␍
> ---‸
```

操作：输入 " "

```after
before␍
> ---␍
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-4 applyMarkdownSpaceShortcut preserves CRLF for generated horizontal rules · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › applyMarkdownSpaceShortcut preserves CRLF for generated horizontal rules -->

```before
+++‸
```

操作：输入 " "

```after
+++
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyMarkdownSpaceShortcut","args":[{"$state":{}}]} -->

### E-5 星号无序列表保留输入标记并在 Enter 后续写同格式 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表保留输入标记并在 Enter 后续写同格式 -->

```before
* 一级‸
```

操作：`Enter`

```after
* 一级
* ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表保留输入标记并在 Enter 后续写同格式 · 第 3 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表保留输入标记并在 Enter 后续写同格式 -->

```before
* 一级
  * 二级‸
```

操作：`Enter`

```after
* 一级
  * 二级
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表保留输入标记并在 Enter 后续写同格式 · 第 4 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表保留输入标记并在 Enter 后续写同格式 -->

```before
* 一级
  * 二级
    * 三级‸
```

操作：`Enter`

```after
* 一级
  * 二级
    * 三级
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表保留输入标记并在 Enter 后续写同格式 · 第 5 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表保留输入标记并在 Enter 后续写同格式 -->

```before
- 一级
 * 二级‸
```

操作：`Enter`

```after
- 一级
 * 二级
 * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表保留输入标记并在 Enter 后续写同格式 · 第 6 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表保留输入标记并在 Enter 后续写同格式 -->

```before
- 一级
 * 二级
  * 三级‸
```

操作：`Enter`

```after
- 一级
 * 二级
  * 三级
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表保留输入标记并在 Enter 后续写同格式 · 第 7 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表保留输入标记并在 Enter 后续写同格式 -->

```before
> * 引用项‸
```

操作：`Enter`

```after
> * 引用项
> * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 已有紧凑嵌套源码仍能从最内层续写 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 已有紧凑嵌套源码仍能从最内层续写 -->

```before
* level-one
* * level-two‸
```

操作：`Enter`

```after
* level-one
* * level-two
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}},2]} -->

### E-5 已有紧凑嵌套源码仍能从最内层续写 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 已有紧凑嵌套源码仍能从最内层续写 -->

```before
* level-one
* * level-two
  * * level-three‸
```

操作：`Enter`

```after
* level-one
* * level-two
  * * level-three
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}},2]} -->

### E-5 已有紧凑嵌套源码仍能从最内层续写 · 第 3 步

<!-- 来源：tests/asteriskListEnter.test.ts › 已有紧凑嵌套源码仍能从最内层续写 -->

```before
- level-one
- * level-two‸
```

操作：`Enter`

```after
- level-one
- * level-two
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}},2]} -->

### E-5 已有紧凑嵌套源码仍能从最内层续写 · 第 4 步

<!-- 来源：tests/asteriskListEnter.test.ts › 已有紧凑嵌套源码仍能从最内层续写 -->

```before
* level-one
* * [x] complete‸
```

操作：`Enter`

```after
* level-one
* * [x] complete
  * [ ] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}},2]} -->

### E-5 已有紧凑嵌套源码仍能从最内层续写 · 第 5 步

<!-- 来源：tests/asteriskListEnter.test.ts › 已有紧凑嵌套源码仍能从最内层续写 -->

```before
> * quoted-one
> * * quoted-two‸
```

操作：`Enter`

```after
> * quoted-one
> * * quoted-two
>   * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}},2]} -->

### E-5 已有紧凑嵌套源码仍能从最内层续写 · 第 6 步

<!-- 来源：tests/asteriskListEnter.test.ts › 已有紧凑嵌套源码仍能从最内层续写 -->

```before
* level-one␍
* * level-two‸
```

操作：`Enter`

```after
* level-one␍
* * level-two␍
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}},2]} -->

### E-5 已有紧凑嵌套源码仍能从最内层续写 · 第 7 步

<!-- 来源：tests/asteriskListEnter.test.ts › 已有紧凑嵌套源码仍能从最内层续写 -->

```before
* level-one
* * level-two‸
```

操作：`Enter`（Markdown 缩进宽度 4）

```after
* level-one
* * level-two
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}},4]} -->

### E-5 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 -->

```before
* level-one
  * level-two‸
```

操作：`Enter`

```after
* level-one
  * level-two
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 -->

```before
* level-one
  * level-two
  * ‸
```

操作：`Enter`

```after
* level-one
  * level-two
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 · 第 3 步

<!-- 来源：tests/asteriskListEnter.test.ts › 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 -->

```before
* level-one
  * level-two
    * level-three‸
```

操作：`Enter`

```after
* level-one
  * level-two
    * level-three
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 · 第 4 步

<!-- 来源：tests/asteriskListEnter.test.ts › 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 -->

```before
* level-one
  * level-two
    * level-three
    * ‸
```

操作：`Enter`

```after
* level-one
  * level-two
    * level-three
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 · 第 5 步

<!-- 来源：tests/asteriskListEnter.test.ts › 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 -->

```before
- level-one
  - level-two‸
```

操作：`Enter`

```after
- level-one
  - level-two
  - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 · 第 6 步

<!-- 来源：tests/asteriskListEnter.test.ts › 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 -->

```before
- level-one
  - level-two
  - ‸
```

操作：`Enter`

```after
- level-one
  - level-two
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 · 第 7 步

<!-- 来源：tests/asteriskListEnter.test.ts › 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 -->

```before
- level-one
  - level-two
    - level-three‸
```

操作：`Enter`

```after
- level-one
  - level-two
    - level-three
    - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 · 第 8 步

<!-- 来源：tests/asteriskListEnter.test.ts › 嵌套列表 Enter 续写当前层级，空项一次退出并保留缩进 -->

```before
- level-one
  - level-two
    - level-three
    - ‸
```

操作：`Enter`

```after
- level-one
  - level-two
    - level-three
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 引用内嵌套列表 Enter 续写标记，空项保留当前缩进 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 引用内嵌套列表 Enter 续写标记，空项保留当前缩进 -->

```before
> - level-one
>   - level-two‸
```

操作：`Enter`

```after
> - level-one
>   - level-two
>   - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 引用内嵌套列表 Enter 续写标记，空项保留当前缩进 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 引用内嵌套列表 Enter 续写标记，空项保留当前缩进 -->

```before
> - level-one
>   - level-two
>   - ‸
```

操作：`Enter`

```after
> - level-one
>   - level-two
>   ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表空项退出且 Shift+Enter 只创建软换行 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表空项退出且 Shift+Enter 只创建软换行 -->

```before
* ‸
```

操作：`Enter`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表空项退出且 Shift+Enter 只创建软换行 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表空项退出且 Shift+Enter 只创建软换行 -->

```before
* 一级
  * ‸
```

操作：`Enter`

```after
* 一级
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表空项退出且 Shift+Enter 只创建软换行 · 第 3 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表空项退出且 Shift+Enter 只创建软换行 -->

```before
> * ‸
```

操作：`Enter`

```after
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 星号无序列表空项退出且 Shift+Enter 只创建软换行 · 第 4 步

<!-- 来源：tests/asteriskListEnter.test.ts › 星号无序列表空项退出且 Shift+Enter 只创建软换行 -->

```before
* 一级‸
```

操作：`Shift+Enter`

```after
* 一级  
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 空列表项在标记前按 Enter 也会退出并保留当前缩进 · 第 1 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项在标记前按 Enter 也会退出并保留当前缩进 -->

```before
* root
  * child
    ‸* 
```

操作：`Enter`

```after
* root
  * child
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 空列表项在标记前按 Enter 也会退出并保留当前缩进 · 第 2 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项在标记前按 Enter 也会退出并保留当前缩进 -->

```before
> * root
>   * child
>     ‸* 
```

操作：`Enter`

```after
> * root
>   * child
>     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 空列表项在标记前按 Enter 也会退出并保留当前缩进 · 第 3 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项在标记前按 Enter 也会退出并保留当前缩进 -->

```before
- [ ] root
  ‸- [ ] 
```

操作：`Enter`

```after
- [ ] root
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 空列表项在标记前按 Enter 也会退出并保留当前缩进 · 第 4 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项在标记前按 Enter 也会退出并保留当前缩进 -->

<!-- 阶段 4 改：`  1. child` 下面的 `    1. ` 是段落的续行（空列表项不能打断段落，CommonMark），不是空列表项：回车续写这一行的缩进 -->

```before
1. root
  1. child
    ‸1. 
```

操作：`Enter`

```after
1. root
  1. child
    
    ‸1. 
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 空列表项在标记前按 Enter 也会退出并保留当前缩进 · 第 5 步

<!-- 来源：tests/asteriskListEnter.test.ts › 空列表项在标记前按 Enter 也会退出并保留当前缩进 -->

```before
* root␍
  * child␍
    ‸* ␍
tail
```

操作：`Enter`

```after
* root␍
  * child␍
    ‸␍
tail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak inserts a Markdown hard line break · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak inserts a Markdown hard line break -->

```before
alpha‸
```

操作：`Shift+Enter`

```after
alpha  
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak inserts a Markdown hard line break · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak inserts a Markdown hard line break -->

```before
alpha⟦ beta⟧
```

操作：`Shift+Enter`

```after
alpha  
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps list and quote continuation indentation · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps list and quote continuation indentation -->

```before
- item‸
```

操作：`Shift+Enter`

```after
- item  
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps list and quote continuation indentation · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps list and quote continuation indentation -->

```before
1. item‸
```

操作：`Shift+Enter`

```after
1. item  
   ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps list and quote continuation indentation · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps list and quote continuation indentation -->

```before
- [ ] item‸
```

操作：`Shift+Enter`

```after
- [ ] item  
      ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps list and quote continuation indentation · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps list and quote continuation indentation -->

```before
> quote‸
```

操作：`Shift+Enter`

```after
> quote  
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps list and quote continuation indentation · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps list and quote continuation indentation -->

```before
> - item‸
```

操作：`Shift+Enter`

```after
> - item  
>   ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps list and quote continuation indentation · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps list and quote continuation indentation -->

```before
- item
  continuation‸
```

操作：`Shift+Enter`

```after
- item
  continuation  
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps list and quote continuation indentation · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps list and quote continuation indentation -->

```before
> - item
>   continuation‸
```

操作：`Shift+Enter`

```after
> - item
>   continuation  
>   ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora -->

```before
paragraph
    - item‸
```

操作：`Shift+Enter`

```after
paragraph
    - item  
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora -->

```before
- parent
    - child‸
```

操作：`Shift+Enter`

```after
- parent
    - child  
      ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora -->

```before
> paragraph
>     - item‸
```

操作：`Shift+Enter`

```after
> paragraph
>     - item  
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak treats four-space list markers outside lists as code like Typora -->

```before
> - parent
>     - child‸
```

操作：`Shift+Enter`

```after
> - parent
>     - child  
>       ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora -->

```before
Term
: Definition‸
```

操作：`Shift+Enter`

```after
Term
: Definition  
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora -->

```before
Term
: Definition
    continuation‸
```

操作：`Shift+Enter`

```after
Term
: Definition
    continuation  
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora -->

```before
> Term
> : Definition‸
```

操作：`Shift+Enter`

```after
> Term
> : Definition  
>   ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora -->

```before
[^1]: detail‸
```

操作：`Shift+Enter`

```after
[^1]: detail  
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora -->

```before
[^1]: detail
    continuation‸
```

操作：`Shift+Enter`

```after
[^1]: detail
    continuation  
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak keeps definition and footnote continuation indentation like Typora -->

```before
paragraph
  code‸
```

操作：`Shift+Enter`

```after
paragraph
  code  
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak inserts plain newlines inside raw fences · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak inserts plain newlines inside raw fences -->

````before
```ts
const x = 1‸
````

操作：`Shift+Enter`

````after
```ts
const x = 1
‸
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak inserts plain newlines inside raw fences · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak inserts plain newlines inside raw fences -->

<!-- 阶段 4 改：没有结尾围栏的 `$$` 不是公式块，是普通段落（同 Typora，1.5.1 节）：Shift+回车是段落里的硬换行 -->

```before
$$
a+b‸
```

操作：`Shift+Enter`

```after
$$
a+b  
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak inserts plain newlines inside raw HTML blocks like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak inserts plain newlines inside raw HTML blocks like Typora -->

```before
<div>
alpha‸
```

操作：`Shift+Enter`

```after
<div>
alpha
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak inserts plain newlines inside raw HTML blocks like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak inserts plain newlines inside raw HTML blocks like Typora -->

```before
> <section>
> alpha‸
```

操作：`Shift+Enter`

```after
> <section>
> alpha
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak replaces raw block selections with plain line breaks · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak replaces raw block selections with plain line breaks -->

````before
```ts
alpha ⟦beta⟧
```
````

操作：`Shift+Enter`

````after
```ts
alpha 
‸
```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak replaces raw block selections with plain line breaks · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak replaces raw block selections with plain line breaks -->

```before
<div>␍
alpha ⟦beta⟧␍
</div>
```

操作：`Shift+Enter`

```after
<div>␍
alpha ␍
‸␍
</div>
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak preserves CRLF line endings like Typora

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak preserves CRLF line endings like Typora -->

```before
alpha␍
- item‸
```

操作：`Shift+Enter`

```after
alpha␍
- item  ␍
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList continues bullet, ordered, and task list markers · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList continues bullet, ordered, and task list markers -->

```before
- item‸
```

操作：`Enter`

```after
- item
- ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList continues bullet, ordered, and task list markers · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList continues bullet, ordered, and task list markers -->

```before
9. item‸
```

操作：`Enter`

```after
9. item
10. ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList continues bullet, ordered, and task list markers · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList continues bullet, ordered, and task list markers -->

```before
- [x] done‸
```

操作：`Enter`

```after
- [x] done
- [ ] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

```before
123456789. item‸
```

操作：`Enter`

```after
123456789. item
123456790. ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

```before
123456789. item‸
```

操作：`Enter`

```after
123456789. item
123456790. ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

<!-- 阶段 4 改：10 位数以上的序号不是有序列表（CommonMark 最多 9 位，1.5.1 节的已知差异），是普通段落 -->

```before
1234567890. item‸
```

操作：`Enter`

```after
1234567890. item
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

<!-- 阶段 4 改：10 位数以上的序号不是有序列表（CommonMark 最多 9 位，1.5.1 节的已知差异），是普通段落 -->

```before
1234567890. item‸
```

操作：`Enter`

```after
1234567890. item
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

```before
  123456789. ‸child
```

操作：`Backspace`

```after
123456789. ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

<!-- 阶段 4 改：10 位数以上的序号不是有序列表（CommonMark 最多 9 位，1.5.1 节的已知差异），是普通段落：退格删一个字符 -->

```before
  1234567890. ‸child
```

操作：`Backspace`

```after
  1234567890.‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 9 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

```before
123456789. item‸
```

操作：`Shift+Enter`

```after
123456789. item  
           ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 10 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

<!-- 阶段 4 改：10 位数以上的序号不是有序列表（CommonMark 最多 9 位，1.5.1 节的已知差异），是普通段落 -->

```before
1234567890. item‸
```

操作：`Shift+Enter`

```after
1234567890. item  
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 ordered list commands support arbitrary-length marker digits · 第 11 步

<!-- 来源：tests/editorCommands.test.ts › ordered list commands support arbitrary-length marker digits -->

<!-- 阶段 4 改：10 位数以上的序号不是有序列表（CommonMark 最多 9 位，1.5.1 节的已知差异），是普通段落 -->

```before
999999999999999999999999999999. item‸
```

操作：`Enter`

```after
999999999999999999999999999999. item
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList renumbers following ordered list items · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList renumbers following ordered list items -->

```before
1. one‸
2. two
3. three
```

操作：`Enter`

```after
1. one
2. ‸
3. two
4. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList renumbers following ordered list items · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList renumbers following ordered list items -->

```before
9. nine‸
10. ten
```

操作：`Enter`

```after
9. nine
10. ‸
11. ten
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList preserves CRLF while renumbering like Typora

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList preserves CRLF while renumbering like Typora -->

```before
1. one‸␍
2. two␍
3. three
```

操作：`Enter`

```after
1. one␍
2. ‸␍
3. two␍
4. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList renumbers ordered lists across nested child items

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList renumbers ordered lists across nested child items -->

```before
1. one‸
   1. child
2. two
```

操作：`Enter`

```after
1. one
2. ‸
   1. child
3. two
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList removes an empty list marker

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList removes an empty list marker -->

```before
- ‸
```

操作：`Enter`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList 保留 Typora 紧凑星号嵌套并续写最内层 · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList 保留 Typora 紧凑星号嵌套并续写最内层 -->

```before
* one
* * two‸
```

操作：`Enter`

```after
* one
* * two
  * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList 保留 Typora 紧凑星号嵌套并续写最内层 · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList 保留 Typora 紧凑星号嵌套并续写最内层 -->

```before
* one
* * two
  * * three‸
```

操作：`Enter`

```after
* one
* * two
  * * three
    * ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList 的空二三级项一次退出并保留当前缩进 · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList 的空二三级项一次退出并保留当前缩进 -->

```before
* one
* * ‸
```

操作：`Enter`

```after
* one
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList 的空二三级项一次退出并保留当前缩进 · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList 的空二三级项一次退出并保留当前缩进 -->

```before
* one
* * two
  * * ‸
```

操作：`Enter`

```after
* one
* * two
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList 删除空嵌套标记并保留 Typora 缩进 · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList 删除空嵌套标记并保留 Typora 缩进 -->

```before
  - ‸
```

操作：`Enter`

```after
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList 删除空嵌套标记并保留 Typora 缩进 · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList 删除空嵌套标记并保留 Typora 缩进 -->

```before
- parent
	- [x] ‸
```

操作：`Enter`

```after
- parent
	‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList 删除空嵌套标记并保留 Typora 缩进 · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList 删除空嵌套标记并保留 Typora 缩进 -->

```before
1. parent
    3. ‸
```

操作：`Enter`

```after
1. parent
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList 删除空嵌套标记并保留 Typora 缩进 · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList 删除空嵌套标记并保留 Typora 缩进 -->

```before
9. nine
  1. ‸
10. ten
```

操作：`Enter`

```after
9. nine
  ‸
10. ten
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 list Enter and Backspace honor two- and four-space indentation settings · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › list Enter and Backspace honor two- and four-space indentation settings -->

```before
- parent
    - ‸
```

操作：`Enter`

```after
- parent
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}},2]} -->

### E-5 list Enter and Backspace honor two- and four-space indentation settings · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › list Enter and Backspace honor two- and four-space indentation settings -->

```before
- parent
    - ‸
```

操作：`Enter`（Markdown 缩进宽度 4）

```after
- parent
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}},4]} -->

### E-5 list Enter and Backspace honor two- and four-space indentation settings · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › list Enter and Backspace honor two- and four-space indentation settings -->

```before
> - parent
>     - ‸
```

操作：`Enter`（Markdown 缩进宽度 4）

```after
> - parent
>     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}},4]} -->

### E-5 list Enter and Backspace honor two- and four-space indentation settings · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › list Enter and Backspace honor two- and four-space indentation settings -->

```before
- parent
    - ‸child
```

操作：`Backspace`

```after
- parent
  - ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}},2]} -->

### E-5 list Enter and Backspace honor two- and four-space indentation settings · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › list Enter and Backspace honor two- and four-space indentation settings -->

```before
- parent
    - ‸child
```

操作：`Backspace`（Markdown 缩进宽度 4）

```after
- parent
- ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}},4]} -->

### E-5 list Enter and Backspace honor two- and four-space indentation settings · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › list Enter and Backspace honor two- and four-space indentation settings -->

```before
> - parent
>     - ‸child
```

操作：`Backspace`（Markdown 缩进宽度 4）

```after
> - parent
> - ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}},4]} -->

### E-5 markdown list commands treat four-space list markers outside lists as code like Typora

<!-- 来源：tests/editorCommands.test.ts › markdown list commands treat four-space list markers outside lists as code like Typora -->

```before
> paragraph
>     - item‸
```

操作：`Enter`

```after
> paragraph
>     - item
>     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 markdown list commands keep four-space nested list markers inside parent lists · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › markdown list commands keep four-space nested list markers inside parent lists -->

```before
- parent
    - child‸
```

操作：`Enter`

```after
- parent
    - child
    - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 markdown list commands keep four-space nested list markers inside parent lists · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › markdown list commands keep four-space nested list markers inside parent lists -->

```before
- parent
    - ‸child
```

操作：`Backspace`

```after
- parent
  - ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 markdown list commands keep four-space nested list markers inside parent lists · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › markdown list commands keep four-space nested list markers inside parent lists -->

```before
> - parent
>     - child‸
```

操作：`Enter`

```after
> - parent
>     - child
>     - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 markdown list commands keep four-space nested list markers inside parent lists · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › markdown list commands keep four-space nested list markers inside parent lists -->

```before
> - parent
>     - ‸child
```

操作：`Backspace`

```after
> - parent
>   - ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList splits when the cursor is before item text · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList splits when the cursor is before item text -->

```before
- ‸item
```

操作：`Enter`

```after
- 
- ‸item
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList splits when the cursor is before item text · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList splits when the cursor is before item text -->

```before
1. ‸one
2. two
```

操作：`Enter`

```after
1. 
2. ‸one
3. two
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList renumbers after exiting an empty ordered list item

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList renumbers after exiting an empty ordered list item -->

```before
1. one
2. ‸
3. three
```

操作：`Enter`

```after
1. one
‸
2. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownList keeps nested children while renumbering after exiting an empty item

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownList keeps nested children while renumbering after exiting an empty item -->

```before
1. one
2. ‸
   1. child
3. three
```

操作：`Enter`

```after
1. one
‸
   1. child
2. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownList","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
- before ⟦SELECT ⟧after
```

操作：`Enter`

```after
- before 
- ‸after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
> before ⟦SELECT ⟧after
```

操作：`Enter`

```after
> before 
> ‸after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
> - before ⟦SELECT ⟧after
```

操作：`Enter`

```after
> - before 
> - ‸after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
- [x] before ⟦SELECT ⟧after
```

操作：`Enter`

```after
- [x] before 
- [ ] ‸after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
3. before ⟦SELECT ⟧after
4. tail
```

操作：`Enter`

```after
3. before 
4. ‸after
5. tail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
- first ⟦SELECT
- REMOVE ⟧second
- tail
```

操作：`Enter`

```after
- first 
- ‸second
- tail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
3. first ⟦SELECT
4. REMOVE ⟧second
5. tail
```

操作：`Enter`

```after
3. first 
4. ‸second
5. tail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
> - [x] first ⟦SELECT
> - [ ] REMOVE ⟧second
```

操作：`Enter`

```after
> - [x] first 
> - [ ] ‸second
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock deletes same-item selections before continuing lists and quotes · 第 9 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock deletes same-item selections before continuing lists and quotes -->

```before
- ⟦first

- second⟧
```

操作：`Enter`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits blockquotes · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits blockquotes -->

```before
> quote‸
```

操作：`Enter`

```after
> quote
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits blockquotes · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits blockquotes -->

```before
> ‸
```

操作：`Enter`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits blockquotes · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits blockquotes -->

```before
> ‸quote
```

操作：`Enter`

```after
> 
> ‸quote
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits blockquotes · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits blockquotes -->

```before
> > ‸
```

操作：`Enter`

```after
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues lists inside blockquotes like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues lists inside blockquotes like Typora -->

```before
> - item‸
```

操作：`Enter`

```after
> - item
> - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues lists inside blockquotes like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues lists inside blockquotes like Typora -->

```before
>	- item‸
```

操作：`Enter`

```after
>	- item
> - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues lists inside blockquotes like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues lists inside blockquotes like Typora -->

```before
> - [x] done‸
```

操作：`Enter`

```after
> - [x] done
> - [ ] ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock exits empty quoted list items and renumbers ordered siblings · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock exits empty quoted list items and renumbers ordered siblings -->

```before
> - ‸
```

操作：`Enter`

```after
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock exits empty quoted list items and renumbers ordered siblings · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock exits empty quoted list items and renumbers ordered siblings -->

```before
> 1. one
> 2. ‸
> 3. three
```

操作：`Enter`

```after
> 1. one
> ‸
> 2. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock exits empty quoted list items and renumbers ordered siblings · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock exits empty quoted list items and renumbers ordered siblings -->

```before
> 9. nine
>   1. ‸
> 10. ten
```

操作：`Enter`

```after
> 9. nine
>   ‸
> 10. ten
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock preserves CRLF in quoted ordered lists like Typora

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock preserves CRLF in quoted ordered lists like Typora -->

```before
> 1. one‸␍
> 2. two
```

操作：`Enter`

```after
> 1. one␍
> 2. ‸␍
> 3. two
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits list continuation lines like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits list continuation lines like Typora -->

```before
- item
  continuation‸
```

操作：`Enter`

```after
- item
  continuation
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits list continuation lines like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits list continuation lines like Typora -->

```before
- item
  ‸
```

操作：`Enter`

```after
- item
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits list continuation lines like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits list continuation lines like Typora -->

```before
- item
  1. nested
     continuation‸
```

操作：`Enter`

```after
- item
  1. nested
     continuation
     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock preserves CRLF in list continuation lines like Typora

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock preserves CRLF in list continuation lines like Typora -->

```before
- item␍
  continuation‸
```

操作：`Enter`

```after
- item␍
  continuation␍
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted list continuation lines like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted list continuation lines like Typora -->

```before
> - item
>   continuation‸
```

操作：`Enter`

```after
> - item
>   continuation
>   ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted list continuation lines like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted list continuation lines like Typora -->

```before
> - item
>   ‸
```

操作：`Enter`

```after
> - item
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues definition list markers like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues definition list markers like Typora -->

```before
Term
: Definition‸
```

操作：`Enter`

```after
Term
: Definition
: ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues definition list markers like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues definition list markers like Typora -->

```before
Term
: ‸Definition
```

操作：`Enter`

```after
Term
: 
: ‸Definition
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues definition list markers like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues definition list markers like Typora -->

```before
Term
: ‸
```

操作：`Enter`

```after
Term
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted definition list markers like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted definition list markers like Typora -->

```before
> Term
> : Definition‸
```

操作：`Enter`

```after
> Term
> : Definition
> : ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted definition list markers like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted definition list markers like Typora -->

```before
> Term
> : ‸
```

操作：`Enter`

```after
> Term
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits definition continuation lines like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits definition continuation lines like Typora -->

```before
Term
: Definition
  continuation‸
```

操作：`Enter`

```after
Term
: Definition
  continuation
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits definition continuation lines like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits definition continuation lines like Typora -->

```before
Term
: Definition

    continuation‸
```

操作：`Enter`

```after
Term
: Definition

    continuation
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits definition continuation lines like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits definition continuation lines like Typora -->

```before
Term
: Definition
  ‸
```

操作：`Enter`

```after
Term
: Definition
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted definition continuation lines like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted definition continuation lines like Typora -->

```before
> Term
> : Definition
>   more‸
```

操作：`Enter`

```after
> Term
> : Definition
>   more
>   ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted definition continuation lines like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted definition continuation lines like Typora -->

```before
> Term
> : Definition
>   ‸
```

操作：`Enter`

```after
> Term
> : Definition
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues footnote definitions like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues footnote definitions like Typora -->

```before
[^1]: detail‸
```

操作：`Enter`

```after
[^1]: detail
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues footnote definitions like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues footnote definitions like Typora -->

```before
[^1]: ‸detail
```

操作：`Enter`

```after
[^1]: 
    ‸detail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues footnote definitions like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues footnote definitions like Typora -->

```before
[^1]:‸
```

操作：`Enter`

```after
[^1]:
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues footnote definitions like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues footnote definitions like Typora -->

```before
[^中文 note]: detail‸
```

操作：`Enter`

```after
[^中文 note]: detail
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits footnote continuation lines like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits footnote continuation lines like Typora -->

```before
[^1]: detail
    continuation‸
```

操作：`Enter`

```after
[^1]: detail
    continuation
    ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues and exits footnote continuation lines like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues and exits footnote continuation lines like Typora -->

```before
[^1]: detail
    ‸
```

操作：`Enter`

```after
[^1]: detail
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted footnote definitions like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted footnote definitions like Typora -->

```before
> [^1]: detail‸
```

操作：`Enter`

```after
> [^1]: detail
>     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted footnote definitions like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted footnote definitions like Typora -->

```before
> [^1]: detail
>     more‸
```

操作：`Enter`

```after
> [^1]: detail
>     more
>     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock continues quoted footnote definitions like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock continues quoted footnote definitions like Typora -->

```before
> [^1]: detail
>     ‸
```

操作：`Enter`

```after
> [^1]: detail
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock renumbers compact quoted ordered lists · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock renumbers compact quoted ordered lists -->

```before
>1. one‸
>2. two
```

操作：`Enter`

```after
>1. one
> 2. ‸
> 3. two
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock renumbers compact quoted ordered lists · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock renumbers compact quoted ordered lists -->

```before
>1. one
>2. ‸
>3. three
```

操作：`Enter`

```after
>1. one
> ‸
> 2. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock exits empty headings · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock exits empty headings -->

```before
# ‸
```

操作：`Enter`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock exits empty headings · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock exits empty headings -->

```before
before
  ###   ‸
after
```

操作：`Enter`

```after
before
  ‸
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock exits empty headings · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock exits empty headings -->

```before
> # ‸
```

操作：`Enter`

```after
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock exits empty headings · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock exits empty headings -->

```before
> > ###   ‸
```

操作：`Enter`

```after
> > ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock closes newly opened code fences · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock closes newly opened code fences -->

````before
```ts‸
````

操作：`Enter`

````after
```ts
‸
```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock closes newly opened code fences · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock closes newly opened code fences -->

````before
> ```ts‸
````

操作：`Enter`

````after
> ```ts
> ‸
> ```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock preserves CRLF when closing code fences

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock preserves CRLF when closing code fences -->

````before
before␍
```ts‸
````

操作：`Enter`

````after
before␍
```ts␍
‸␍
```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 markdown block shortcuts treat heavily indented fence markers as code text like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › markdown block shortcuts treat heavily indented fence markers as code text like Typora -->

```before
>     $$‸
```

操作：`Enter`

```after
>     $$
>     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 markdown block shortcuts treat heavily indented fence markers as code text like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › markdown block shortcuts treat heavily indented fence markers as code text like Typora -->

```before
>     \[‸
```

操作：`Enter`

```after
>     \[
>     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 markdown block shortcuts treat heavily indented fence markers as code text like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › markdown block shortcuts treat heavily indented fence markers as code text like Typora -->

````before
    ```
- item‸
````

操作：`Enter`

````after
    ```
- item
- ‸
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 markdown block shortcuts treat heavily indented fence markers as code text like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › markdown block shortcuts treat heavily indented fence markers as code text like Typora -->

````before
    ```
- ‸item
````

操作：`Backspace`

````after
    ```
‸item
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock does not apply markdown block rules inside raw HTML blocks like Typora

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock does not apply markdown block rules inside raw HTML blocks like Typora -->

```before
<script>
- hidden
</script>
- item‸
```

操作：`Enter`

```after
<script>
- hidden
</script>
- item
- ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter creates Typora-style paragraphs and preserves line endings · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter creates Typora-style paragraphs and preserves line endings -->

<!-- 阶段 4 改：段落开头的空格是缩进（不在文字里）：拆段后光标在内容开头 -->

```before
alpha‸ beta
```

操作：`Enter`

```after
alpha

 ‸beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter creates Typora-style paragraphs and preserves line endings · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter creates Typora-style paragraphs and preserves line endings -->

```before
alpha␍
be‸ta
```

操作：`Enter`

```after
alpha␍
be␍
␍
‸ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter keeps a heading intact when Enter is pressed before its text · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter keeps a heading intact when Enter is pressed before its text -->

```before
before

# ‸Title
```

操作：`Enter`

```after
before

‸

# Title
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter keeps a heading intact when Enter is pressed before its text · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter keeps a heading intact when Enter is pressed before its text -->

```before
# Ti‸tle
```

操作：`Enter`

```after
# Ti

# ‸tle
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter keeps a heading intact when Enter is pressed before its text · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter keeps a heading intact when Enter is pressed before its text -->

```before
# Title‸
```

操作：`Enter`

```after
# Title

‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter copies complete ATX heading patterns · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter copies complete ATX heading patterns -->

```before
## Alpha‸Beta ##
```

操作：`Enter`

```after
## Alpha ##

## ‸Beta ##
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter copies complete ATX heading patterns · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter copies complete ATX heading patterns -->

```before
## ‸Alpha ##
```

操作：`Enter`

```after
‸

## Alpha ##
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter copies complete ATX heading patterns · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter copies complete ATX heading patterns -->

```before
## Alpha‸ ##
```

操作：`Enter`

```after
## Alpha ##

‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter copies complete ATX heading patterns · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter copies complete ATX heading patterns -->

```before
> ## Alpha‸Beta ##
```

操作：`Enter`

```after
> ## Alpha ##
>
> ## ‸Beta ##
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter copies Setext patterns with quotes and CRLF · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter copies Setext patterns with quotes and CRLF -->

```before
Alpha‸Beta
===
```

操作：`Enter`

```after
Alpha
===

‸Beta
===
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownParagraphOnEnter copies Setext patterns with quotes and CRLF · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownParagraphOnEnter copies Setext patterns with quotes and CRLF -->

```before
> Alpha‸Beta␍
> ===
```

操作：`Enter`

```after
> Alpha␍
> ===␍
>␍
> ‸Beta␍
> ===
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownParagraphOnEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container -->

```before
- Alpha‸Beta
```

操作：`Ctrl+Enter`

```after
- Alpha

  ‸Beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownContainerParagraphOnPrimaryEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container -->

```before
12) Alpha‸Beta
```

操作：`Ctrl+Enter`

```after
12) Alpha

    ‸Beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownContainerParagraphOnPrimaryEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container -->

```before
- [x] Alpha‸Beta
```

操作：`Ctrl+Enter`

```after
- [x] Alpha

      ‸Beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownContainerParagraphOnPrimaryEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container -->

```before
> Alpha‸Beta
```

操作：`Ctrl+Enter`

```after
> Alpha
>
> ‸Beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownContainerParagraphOnPrimaryEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container -->

```before
> - Alpha‸Beta
```

操作：`Ctrl+Enter`

```after
> - Alpha
>
>   ‸Beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownContainerParagraphOnPrimaryEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownContainerParagraphOnPrimaryEnter keeps the current container -->

```before
- ‸
```

操作：`Ctrl+Enter`

```after
- 

  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownContainerParagraphOnPrimaryEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownContainerParagraphOnPrimaryEnter deletes selections and preserves CRLF · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownContainerParagraphOnPrimaryEnter deletes selections and preserves CRLF -->

```before
> - Alpha⟦REMOVE ⟧Beta
```

操作：`Ctrl+Enter`

```after
> - Alpha
>
>   ‸Beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownContainerParagraphOnPrimaryEnter","args":[{"$state":{}}]} -->

### E-5 splitMarkdownContainerParagraphOnPrimaryEnter deletes selections and preserves CRLF · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › splitMarkdownContainerParagraphOnPrimaryEnter deletes selections and preserves CRLF -->

```before
1. Alpha‸Beta␍
2. Tail
```

操作：`Ctrl+Enter`

```after
1. Alpha␍
␍
   ‸Beta␍
2. Tail
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"splitMarkdownContainerParagraphOnPrimaryEnter","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock closes newly opened math fences · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock closes newly opened math fences -->

```before
$$‸
```

操作：`Enter`

```after
$$
‸
$$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock closes newly opened math fences · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock closes newly opened math fences -->

```before
> $$‸
```

操作：`Enter`

```after
> $$
> ‸
> $$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock closes newly opened math fences · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock closes newly opened math fences -->

```before
\[‸
```

操作：`Enter`

```after
\[
‸
\]
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock closes newly opened math fences · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock closes newly opened math fences -->

```before
> \[‸
```

操作：`Enter`

```after
> \[
> ‸
> \]
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock preserves CRLF when closing math fences

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock preserves CRLF when closing math fences -->

```before
before␍
$$‸
```

操作：`Enter`

```after
before␍
$$␍
‸␍
$$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock turns a pipe header into a table · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock turns a pipe header into a table -->

```before
| Name | Age |‸
```

操作：`Enter`

```after
| Name | Age |
| --- | --- |
| ‸ |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock turns a pipe header into a table · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock turns a pipe header into a table -->

```before
   Name | Age‸
```

操作：`Enter`

```after
| Name | Age |
| --- | --- |
| ‸ |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock turns a pipe header into a table · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock turns a pipe header into a table -->

```before
> Name | Age‸
```

操作：`Enter`

```after
> | Name | Age |
> | --- | --- |
> | ‸ |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock turns an explicit single-column pipe header into a table

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock turns an explicit single-column pipe header into a table -->

```before
| 标题 |‸
```

操作：`Enter`

```after
| 标题 |
| --- |
| ‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock treats four-space pipe lines as code instead of table shortcuts like Typora

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock treats four-space pipe lines as code instead of table shortcuts like Typora -->

```before
> paragraph
>     Name | Age‸
```

操作：`Enter`

```after
> paragraph
>     Name | Age
>     ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock preserves CRLF when turning a pipe header into a table

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock preserves CRLF when turning a pipe header into a table -->

```before
Intro␍
| Name | Age |‸
```

操作：`Enter`

```after
Intro␍
| Name | Age |␍
| --- | --- |␍
| ‸ |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock normalizes a bare pipe header into a table

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock normalizes a bare pipe header into a table -->

```before
Name | Age‸
```

操作：`Enter`

```after
| Name | Age |
| --- | --- |
| ‸ |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock inserts a body row from an existing table header or separator · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock inserts a body row from an existing table header or separator -->

```before
| Name | Age |‸
| --- | --- |
| Ada | 36 |
```

操作：`Enter`

```after
| Name | Age |
| --- | --- |
|  | ‸ |
| Ada | 36 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock inserts a body row from an existing table header or separator · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock inserts a body row from an existing table header or separator -->

```before
| Name | Age |
| --- | --- |‸
| Ada | 36 |
```

操作：`Enter`

```after
| Name | Age |
| --- | --- |
|  | ‸ |
| Ada | 36 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock creates the first body row for a header-only table

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock creates the first body row for a header-only table -->

```before
| Name | ‸Age |
| --- | --- |
```

操作：`Enter`

```after
| Name | Age |
| --- | --- |
|  | ‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock inserts a table row below the current body row · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock inserts a table row below the current body row -->

```before
| A | B | C |
| --- | --- | --- |
| 1 | ‸2 | 3 |
| 4 | 5 | 6 |
```

操作：`Enter`

```after
| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
|  | ‸ |  |
| 4 | 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock inserts a table row below the current body row · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock inserts a table row below the current body row -->

```before
> | A | B | C |
> | --- | --- | --- |
> | 1 | ‸2 | 3 |
> | 4 | 5 | 6 |
```

操作：`Enter`

```after
> | A | B | C |
> | --- | --- | --- |
> | 1 | 2 | 3 |
> |  | ‸ |  |
> | 4 | 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock preserves CRLF when inserting a table row

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock preserves CRLF when inserting a table row -->

```before
| A | B |␍
| --- | --- |␍
| 1 | ‸2 |␍
| 3 | 4 |
```

操作：`Enter`

```after
| A | B |␍
| --- | --- |␍
| 1 | 2 |␍
|  | ‸ |␍
| 3 | 4 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock preserves tables without outer pipes

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock preserves tables without outer pipes -->

```before
A | B
--- | ---
1 | ‸2
```

操作：`Enter`

```after
A | B
--- | ---
1 | 2
 | ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock appends a table row from the last body row

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock appends a table row from the last body row -->

```before
| A | B |
| --- | --- |
| 1 | 2 |‸
```

操作：`Enter`

```after
| A | B |
| --- | --- |
| 1 | 2 |
|  | ‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock creates Front Matter from a document-start dash marker · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock creates Front Matter from a document-start dash marker -->

```before
---‸
```

操作：`Enter`

```after
---
‸
---
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock creates Front Matter from a document-start dash marker · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock creates Front Matter from a document-start dash marker -->

```before
﻿---‸
```

操作：`Enter`

```after
﻿---
‸
---
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock creates Front Matter from a document-start dash marker · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock creates Front Matter from a document-start dash marker -->

```before
---‸␍
Body
```

操作：`Enter`

```after
---␍
‸␍
---␍
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock completes horizontal rule marker lines · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock completes horizontal rule marker lines -->

```before
before
---‸
```

操作：`Enter`

```after
before
---
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock completes horizontal rule marker lines · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock completes horizontal rule marker lines -->

```before
***‸
```

操作：`Enter`

```after
***
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock completes horizontal rule marker lines · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock completes horizontal rule marker lines -->

```before
___‸
```

操作：`Enter`

```after
___
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 continueMarkdownBlock completes horizontal rule marker lines · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › continueMarkdownBlock completes horizontal rule marker lines -->

```before
+++‸
```

操作：`Enter`

```after
+++
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace lifts or unwraps list items like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace lifts or unwraps list items like Typora -->

```before
  - ‸child
```

操作：`Backspace`

```after
- ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace lifts or unwraps list items like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace lifts or unwraps list items like Typora -->

```before
  2. ‸child
```

操作：`Backspace`

```after
2. ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace lifts or unwraps list items like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace lifts or unwraps list items like Typora -->

```before
9. nine
  1. ‸child
10. ten
```

操作：`Backspace`

```after
9. nine
10. ‸child
11. ten
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace lifts or unwraps list items like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace lifts or unwraps list items like Typora -->

```before
- parent
	- [ ] ‸task
```

操作：`Backspace`

```after
- parent
- [ ] ‸task
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace lifts or unwraps list items like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace lifts or unwraps list items like Typora -->

```before
- ‸child
```

操作：`Backspace`

```after
‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace lifts or unwraps list items like Typora · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace lifts or unwraps list items like Typora -->

```before
1. ‸child
```

操作：`Backspace`

```after
‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace lifts or unwraps list items like Typora · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace lifts or unwraps list items like Typora -->

```before
1. one
2. ‸two
3. three
```

操作：`Backspace`

```after
1. one
‸two
2. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace lifts or unwraps list items like Typora · 第 8 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace lifts or unwraps list items like Typora -->

```before
- [ ] ‸task
```

操作：`Backspace`

```after
‸task
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace handles quoted list items like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace handles quoted list items like Typora -->

```before
> - ‸child
```

操作：`Backspace`

```after
> ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace handles quoted list items like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace handles quoted list items like Typora -->

```before
>   - ‸child
```

操作：`Backspace`

```after
> - ‸child
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace handles quoted list items like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace handles quoted list items like Typora -->

```before
> 1. one
> 2. ‸two
> 3. three
```

操作：`Backspace`

```after
> 1. one
> ‸two
> 2. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace handles quoted list items like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace handles quoted list items like Typora -->

```before
> 9. nine
>   1. ‸child
> 10. ten
```

操作：`Backspace`

```after
> 9. nine
> 10. ‸child
> 11. ten
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace preserves CRLF line endings like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace preserves CRLF line endings like Typora -->

```before
parent␍
  - ‸child␍
next
```

操作：`Backspace`

```after
parent␍
- ‸child␍
next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 outdentMarkdownListOnBackspace preserves CRLF line endings like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › outdentMarkdownListOnBackspace preserves CRLF line endings like Typora -->

```before
parent␍
> - ‸child␍
next
```

操作：`Backspace`

```after
parent␍
> ‸child␍
next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"outdentMarkdownListOnBackspace","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak preserves container prefixes when replacing selections · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak preserves container prefixes when replacing selections -->

```before
- alpha ⟦beta⟧
```

操作：`Shift+Enter`

```after
- alpha   
  ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak preserves container prefixes when replacing selections · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak preserves container prefixes when replacing selections -->

```before
- [ ] task ⟦beta⟧
```

操作：`Shift+Enter`

```after
- [ ] task   
      ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak preserves container prefixes when replacing selections · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak preserves container prefixes when replacing selections -->

```before
> quote ⟦beta⟧
```

操作：`Shift+Enter`

```after
> quote   
> ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 insertMarkdownSoftBreak preserves container prefixes when replacing selections · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownSoftBreak preserves container prefixes when replacing selections -->

```before
> - item ⟦beta⟧
```

操作：`Shift+Enter`

```after
> - item   
>   ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownSoftBreak","args":[{"$state":{}}]} -->

### E-5 tagged dollar math supports Enter and protects raw editing semantics · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › tagged dollar math supports Enter and protects raw editing semantics -->

```before
$$ {chapter 1}‸
```

操作：`Enter`

```after
$$ {chapter 1}
‸
$$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 tagged dollar math supports Enter and protects raw editing semantics · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › tagged dollar math supports Enter and protects raw editing semantics -->

```before
> $$ {{quote}}‸
```

操作：`Enter`

```after
> $$ {{quote}}
> ‸
> $$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 tagged dollar math supports Enter and protects raw editing semantics · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › tagged dollar math supports Enter and protects raw editing semantics -->

```before
$$ {one}‸
$$ {two} 
```

操作：`Enter`

```after
$$ {one}
‸
$$
$$ {two} 
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 tagged dollar math supports Enter and protects raw editing semantics · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › tagged dollar math supports Enter and protects raw editing semantics -->

```before
$$ {one}‸␍
    $$ {two}
```

操作：`Enter`

```after
$$ {one}␍
‸␍
$$␍
    $$ {two}
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 tagged dollar math supports Enter and protects raw editing semantics · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › tagged dollar math supports Enter and protects raw editing semantics -->

```before
$$ {one}‸
	$$ {two}
```

操作：`Enter`

```after
$$ {one}
‸
$$
	$$ {two}
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 tagged dollar math Enter preserves CRLF and rejects invalid openings

<!-- 来源：tests/editorCommands.test.ts › tagged dollar math Enter preserves CRLF and rejects invalid openings -->

```before
Before␍
$$ {tag}‸
```

操作：`Enter`

```after
Before␍
$$ {tag}␍
‸␍
$$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 反引号围栏信息字符串包含反引号时不进入原始块

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 反引号围栏信息字符串包含反引号时不进入原始块 -->

````before
```js`bad
- item‸
````

操作：`Enter`

````after
```js`bad
- item
- ‸
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 波浪线围栏允许信息字符串包含反引号

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 波浪线围栏允许信息字符串包含反引号 -->

```before
~~~js`valid‸
```

操作：`Enter`

```after
~~~js`valid
‸
~~~
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 代码围栏闭合行只允许尾随空白

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 代码围栏闭合行只允许尾随空白 -->

````before
```js
code
``` 	
- item‸
````

操作：`Enter`

````after
```js
code
``` 	
- item
- ‸
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 三列缩进内的引用围栏仍会自动补全

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 三列缩进内的引用围栏仍会自动补全 -->

````before
   > ```‸
````

操作：`Enter`

````after
   > ```
   > ‸
   > ```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 多位有序列表围栏闭合后恢复正文块 Enter 语义 · 第 1 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 多位有序列表围栏闭合后恢复正文块 Enter 语义 -->

```before
10. $$
    x = 1
    $$
- item‸
```

操作：`Enter`

```after
10. $$
    x = 1
    $$
- item
- ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 多位有序列表围栏闭合后恢复正文块 Enter 语义 · 第 2 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 多位有序列表围栏闭合后恢复正文块 Enter 语义 -->

````before
123456789. ```md
           code
           ```
- item‸
````

操作：`Enter`

````after
123456789. ```md
           code
           ```
- item
- ‸
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 多位有序列表围栏闭合后恢复正文块 Enter 语义 · 第 3 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 多位有序列表围栏闭合后恢复正文块 Enter 语义 -->

```before
> 10. $$
>     x = 1
>     $$
> - item‸
```

操作：`Enter`

```after
> 10. $$
>     x = 1
>     $$
> - item
> - ‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 列表与引用中的未闭合围栏不会污染容器外正文 · 第 1 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 列表与引用中的未闭合围栏不会污染容器外正文 -->

````before
10. ```md
    code
- item‸
````

操作：`Enter`

````after
10. ```md
    code
- item
- ‸
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 列表与引用中的未闭合围栏不会污染容器外正文 · 第 2 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 列表与引用中的未闭合围栏不会污染容器外正文 -->

````before
> ```md
> code
- item‸
````

操作：`Enter`

````after
> ```md
> code
- item
- ‸
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 引用后的 Tab stop 按绝对列补全围栏 · 第 1 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 引用后的 Tab stop 按绝对列补全围栏 -->

````before
> 	```‸
````

操作：`Enter`

````after
> 	```
> 	‸
> 	```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 引用后的 Tab stop 按绝对列补全围栏 · 第 2 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 引用后的 Tab stop 按绝对列补全围栏 -->

```before
>  	$$‸
```

操作：`Enter`

```after
>  	$$
>  	‸
>  	$$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 引用后的 Tab stop 按绝对列补全围栏 · 第 3 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 引用后的 Tab stop 按绝对列补全围栏 -->

```before
> 	\[‸
```

操作：`Enter`

```after
> 	\[
> 	‸
> 	\]
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 容器外的新围栏不会被容器内未闭合状态拦截 · 第 1 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 容器外的新围栏不会被容器内未闭合状态拦截 -->

````before
10. ```md
    code
```‸
````

操作：`Enter`

````after
10. ```md
    code
```
‸
```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 容器外的新围栏不会被容器内未闭合状态拦截 · 第 2 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 容器外的新围栏不会被容器内未闭合状态拦截 -->

````before
> ```md
> code
```‸
````

操作：`Enter`

````after
> ```md
> code
```
‸
```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 容器外的新围栏不会被容器内未闭合状态拦截 · 第 3 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 容器外的新围栏不会被容器内未闭合状态拦截 -->

```before
10. $$
    x
$$‸
```

操作：`Enter`

```after
10. $$
    x
$$
‸
$$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 容器外的新围栏不会被容器内未闭合状态拦截 · 第 4 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 容器外的新围栏不会被容器内未闭合状态拦截 -->

```before
> $$
> x
$$‸
```

操作：`Enter`

```after
> $$
> x
$$
‸
$$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 容器外的新围栏不会被容器内未闭合状态拦截 · 第 5 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 容器外的新围栏不会被容器内未闭合状态拦截 -->

```before
10. \[
    x
\[‸
```

操作：`Enter`

```after
10. \[
    x
\[
‸
\]
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 容器外的新围栏不会被容器内未闭合状态拦截 · 第 6 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 容器外的新围栏不会被容器内未闭合状态拦截 -->

```before
> \[
> x
\[‸
```

操作：`Enter`

```after
> \[
> x
\[
‸
\]
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 已有围栏闭合行使用严格且容器无关的缩进判断 · 第 1 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 已有围栏闭合行使用严格且容器无关的缩进判断 -->

````before
```md‸
``` trailing
````

操作：`Enter`

````after
```md
‸
```
``` trailing
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 已有围栏闭合行使用严格且容器无关的缩进判断 · 第 2 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 已有围栏闭合行使用严格且容器无关的缩进判断 -->

```before
$$‸
$$ trailing
```

操作：`Enter`

```after
$$
‸
$$
$$ trailing
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-5 已有围栏闭合行使用严格且容器无关的缩进判断 · 第 3 步

<!-- 来源：tests/typoraFenceCommandSemantics.test.ts › 已有围栏闭合行使用严格且容器无关的缩进判断 -->

```before
\[‸
\] trailing
```

操作：`Enter`

```after
\[
‸
\]
\] trailing
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"continueMarkdownBlock","args":[{"$state":{}}]} -->

### E-7 selectCurrentLine expands the selection to full content lines · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentLine expands the selection to full content lines -->

```before
alpha
be‸ta
gamma
```

操作：命令 selectLine

```after
alpha
⟦beta⟧
gamma
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentLine","args":[{"$state":{}}]} -->

### E-7 selectCurrentLine expands the selection to full content lines · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentLine expands the selection to full content lines -->

```before
alpha
be⟦ta
ga⟧mma
```

操作：命令 selectLine

```after
alpha
⟦beta
gamma⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentLine","args":[{"$state":{}}]} -->

### E-7 selectCurrentParagraph expands through adjacent non-empty lines

<!-- 来源：tests/editorCommands.test.ts › selectCurrentParagraph expands through adjacent non-empty lines -->

```before
one
 ‸two

three
```

操作：命令 selectParagraph

```after
⟦one
 two⟧

three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentParagraph","args":[{"$state":{}}]} -->

### E-7 selectCurrentWord selects the word around the cursor like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentWord selects the word around the cursor like Typora -->

```before
alpha be‸ta_gamma 中文42.
```

操作：命令 selectWord

```after
alpha ⟦beta_gamma⟧ 中文42.
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentWord","args":[{"$state":{}}]} -->

### E-7 selectCurrentWord selects the word around the cursor like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentWord selects the word around the cursor like Typora -->

```before
alpha‸ beta
```

操作：命令 selectWord

```after
⟦alpha⟧ beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentWord","args":[{"$state":{}}]} -->

### E-7 selectCurrentWord selects the word around the cursor like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentWord selects the word around the cursor like Typora -->

```before
alpha ‸beta
```

操作：命令 selectWord

```after
alpha ⟦beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentWord","args":[{"$state":{}}]} -->

### E-7 selectCurrentSentence selects the sentence around the cursor like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentSentence selects the sentence around the cursor like Typora -->

```before
First sentence. ‸Second sentence! 第三句？ Next
```

操作：命令 selectSentence

```after
First sentence. ⟦Second sentence!⟧ 第三句？ Next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentSentence","args":[{"$state":{}}]} -->

### E-7 selectCurrentSentence selects the sentence around the cursor like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentSentence selects the sentence around the cursor like Typora -->

```before
First sentence. Second sentence! 第‸三句？ Next
```

操作：命令 selectSentence

```after
First sentence. Second sentence! ⟦第三句？⟧ Next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentSentence","args":[{"$state":{}}]} -->

### E-7 selectCurrentSentence selects the sentence around the cursor like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › selectCurrentSentence selects the sentence around the cursor like Typora -->

```before
⟦First⟧ sentence. Second sentence! 第三句？ Next
```

操作：命令 selectSentence

```after
⟦First⟧ sentence. Second sentence! 第三句？ Next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectCurrentSentence","args":[{"$state":{}}]} -->

### E-8 每种 TOC 标记都支持原子查找、相邻导航和整块删除 · 第 1 步

<!-- 来源：tests/atomicBlockEditing.test.ts › 每种 TOC 标记都支持原子查找、相邻导航和整块删除 -->

```before
Before
⟦{:toc}⟧
After
```

操作：`Backspace`（选中了整块）

```after
Before
‸
After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"deleteSelectedAtomicMarkdownBlock","args":[{"$state":{}}]} -->

### E-8 每种 TOC 标记都支持原子查找、相邻导航和整块删除 · 第 2 步

<!-- 来源：tests/atomicBlockEditing.test.ts › 每种 TOC 标记都支持原子查找、相邻导航和整块删除 -->

```before
Before
⟦[[_TOC_]]⟧
After
```

操作：`Backspace`（选中了整块）

```after
Before
‸
After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"deleteSelectedAtomicMarkdownBlock","args":[{"$state":{}}]} -->

### E-8 每种 TOC 标记都支持原子查找、相邻导航和整块删除 · 第 3 步

<!-- 来源：tests/atomicBlockEditing.test.ts › 每种 TOC 标记都支持原子查找、相邻导航和整块删除 -->

```before
Before
⟦{: toc depth=3 }⟧
After
```

操作：`Backspace`（选中了整块）

```after
Before
‸
After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"deleteSelectedAtomicMarkdownBlock","args":[{"$state":{}}]} -->

### E-8 deleteSelectedAtomicMarkdownBlock clears only the selected atom content · 第 1 步

<!-- 来源：tests/atomicBlockEditing.test.ts › deleteSelectedAtomicMarkdownBlock clears only the selected atom content -->

```before
Before

⟦---⟧

After
```

操作：`Backspace`（选中了整块）

```after
Before

‸

After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"deleteSelectedAtomicMarkdownBlock","args":[{"$state":{}}]} -->

### E-8 deleteSelectedAtomicMarkdownBlock clears only the selected atom content · 第 2 步

<!-- 来源：tests/atomicBlockEditing.test.ts › deleteSelectedAtomicMarkdownBlock clears only the selected atom content -->

```before
Before

⟦[TOC]⟧

After
```

操作：`Backspace`（选中了整块）

```after
Before

‸

After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"deleteSelectedAtomicMarkdownBlock","args":[{"$state":{}}]} -->

### E-8 deleteSelectedAtomicMarkdownBlock accepts the whole line range and reversed selections

<!-- 来源：tests/atomicBlockEditing.test.ts › deleteSelectedAtomicMarkdownBlock accepts the whole line range and reversed selections -->

```before
Before␍
␍
⟧[TOC]␍
⟦␍
After
```

操作：`Backspace`（选中了整块）

```after
Before␍
␍
‸␍
␍
After
```

<!-- 旧代码：{"module":"src/utils/atomicBlockEditing","fn":"deleteSelectedAtomicMarkdownBlock","args":[{"$state":{}}]} -->

### E-8 deleteCurrentWord deletes selected text or the word around the cursor like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › deleteCurrentWord deletes selected text or the word around the cursor like Typora -->

```before
alpha be‸ta_gamma 中文42.
```

操作：命令 deleteWord

```after
alpha ‸ 中文42.
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteCurrentWord","args":[{"$state":{}}]} -->

### E-8 deleteCurrentWord deletes selected text or the word around the cursor like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › deleteCurrentWord deletes selected text or the word around the cursor like Typora -->

<!-- 阶段 4 改：段落开头的空格是缩进（不在文字里）：删掉第一个词后光标在内容开头 -->

```before
⟦alpha⟧ beta
```

操作：命令 deleteWord

```after
 ‸beta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteCurrentWord","args":[{"$state":{}}]} -->

### E-8 deleteCurrentSentence deletes the sentence around the cursor like Typora

<!-- 来源：tests/editorCommands.test.ts › deleteCurrentSentence deletes the sentence around the cursor like Typora -->

```before
First sentence. ‸Second sentence! Third.
```

操作：命令 deleteSentence

```after
First sentence. ‸ Third.
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteCurrentSentence","args":[{"$state":{}}]} -->

### E-8 deleteCurrentParagraph deletes the current paragraph like Typora

<!-- 来源：tests/editorCommands.test.ts › deleteCurrentParagraph deletes the current paragraph like Typora -->

```before
Intro

Middle line one
Middle ‸line two

Outro
```

操作：命令 deleteParagraph

```after
Intro

‸

Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteCurrentParagraph","args":[{"$state":{}}]} -->

### E-8 duplicateMarkdownLines duplicates the current or selected lines below · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › duplicateMarkdownLines duplicates the current or selected lines below -->

```before
alpha
b‸eta
```

操作：命令 duplicateLine

```after
alpha
beta
b‸eta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"duplicateMarkdownLines","args":[{"$state":{}}]} -->

### E-8 duplicateMarkdownLines duplicates the current or selected lines below · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › duplicateMarkdownLines duplicates the current or selected lines below -->

```before
⟦a
b⟧
c
```

操作：命令 duplicateLine

```after
a
b
⟦a
b⟧
c
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"duplicateMarkdownLines","args":[{"$state":{}}]} -->

### E-8 duplicateMarkdownLines preserves CRLF line endings at the document end like Typora

<!-- 来源：tests/editorCommands.test.ts › duplicateMarkdownLines preserves CRLF line endings at the document end like Typora -->

```before
alpha␍
be‸ta
```

操作：命令 duplicateLine

```after
alpha␍
beta␍
be‸ta
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"duplicateMarkdownLines","args":[{"$state":{}}]} -->

### E-8 deleteMarkdownLines deletes the current or selected lines · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › deleteMarkdownLines deletes the current or selected lines -->

```before
alpha
be‸ta
gamma
```

操作：命令 deleteLine

```after
alpha
‸gamma
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownLines","args":[{"$state":{}}]} -->

### E-8 deleteMarkdownLines deletes the current or selected lines · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › deleteMarkdownLines deletes the current or selected lines -->

```before
al⟦pha
beta⟧
gamma
```

操作：命令 deleteLine

```after
‸gamma
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownLines","args":[{"$state":{}}]} -->

### E-8 deleteMarkdownLines preserves CRLF line endings

<!-- 来源：tests/editorCommands.test.ts › deleteMarkdownLines preserves CRLF line endings -->

```before
alpha␍
be‸ta␍
gamma
```

操作：命令 deleteLine

```after
alpha␍
‸gamma
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownLines","args":[{"$state":{}}]} -->

### E-8 duplicateMarkdownLines renumbers ordered list items like Typora

<!-- 来源：tests/editorCommands.test.ts › duplicateMarkdownLines renumbers ordered list items like Typora -->

```before
1. one
2. ‸two
3. three
```

操作：命令 duplicateLine

```after
1. one
2. two
3. ‸two
4. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"duplicateMarkdownLines","args":[{"$state":{}}]} -->

### E-8 duplicateMarkdownLines does not renumber four-space ordered code outside lists like Typora

<!-- 来源：tests/editorCommands.test.ts › duplicateMarkdownLines does not renumber four-space ordered code outside lists like Typora -->

```before
paragraph
    ‸3. code
    10. code
```

操作：命令 duplicateLine

```after
paragraph
    3. code
    ‸3. code
    10. code
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"duplicateMarkdownLines","args":[{"$state":{}}]} -->

### E-8 moveMarkdownLines moves current or selected lines up and down · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines moves current or selected lines up and down -->

```before
a
‸b
c
```

操作：命令 moveLineUp（源码模式）

```after
‸b
a
c
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownLines moves current or selected lines up and down · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines moves current or selected lines up and down -->

```before
a
⟦b⟧
c
```

操作：命令 moveLineDown（源码模式）

```after
a
c
⟦b⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"down"]} -->

### E-8 moveMarkdownLines moves current or selected lines up and down · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines moves current or selected lines up and down -->

```before
‸a
b
```

操作：命令 moveLineUp（源码模式）

```after
‸a
b
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownLines preserves CRLF line endings like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines preserves CRLF line endings like Typora -->

```before
a␍
b‸␍
c
```

操作：命令 moveLineUp（源码模式）

```after
b‸␍
a␍
c
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownLines preserves CRLF line endings like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines preserves CRLF line endings like Typora -->

```before
a␍
b‸␍
c
```

操作：命令 moveLineDown（源码模式）

```after
a␍
c␍
b‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"down"]} -->

### E-8 moveMarkdownBlocks moves complete rich-text paragraphs and syntax blocks · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks moves complete rich-text paragraphs and syntax blocks -->

```before
First line
‸continued

## Second

Third
```

操作：命令 moveLineDown

```after
## Second

First line
‸continued

Third
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"down"]} -->

### E-8 moveMarkdownBlocks moves complete rich-text paragraphs and syntax blocks · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks moves complete rich-text paragraphs and syntax blocks -->

```before
## Second

First line
‸continued

Third
```

操作：命令 moveLineUp

```after
First line
‸continued

## Second

Third
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 -->

```before
---␍
title: Marko␍
⟦author⟧: chain-code␍
version: 1␍
...␍
Body
```

操作：命令 moveLineUp

```after
---␍
⟦author⟧: chain-code␍
title: Marko␍
version: 1␍
...␍
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 -->

```before
---
notes: |
  9. nine
  ‸10. ten
---
Body
```

操作：命令 moveLineUp

```after
---
notes: |
  ‸10. ten
  9. nine
---
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 -->

```before
---␍
‸title: Marko␍
author: chain-code␍
version: 1␍
...␍
Body
```

操作：命令 moveLineUp

```after
---␍
‸title: Marko␍
author: chain-code␍
version: 1␍
...␍
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 -->

```before
---␍
title: Marko␍
author: chain-code␍
‸version: 1␍
...␍
Body
```

操作：命令 moveLineDown

```after
---␍
title: Marko␍
author: chain-code␍
‸version: 1␍
...␍
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"down"]} -->

### E-8 moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 -->

<!-- 阶段 4 改：编辑器里光标进不了 Front Matter 的 `---` 那一行：before 换成第一行 YAML 的开头，下移照常 -->

```before
---␍
‸title: Marko␍
author: chain-code␍
version: 1␍
...␍
Body
```

操作：命令 moveLineDown

```after
---␍
author: chain-code␍
‸title: Marko␍
version: 1␍
...␍
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"down"]} -->

### E-8 moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 · 第 6 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 -->

<!-- 阶段 4 改：编辑器里光标进不了 Front Matter 的 `...` 那一行：before 换成最后一行 YAML 的末尾，上移照常 -->

```before
---␍
title: Marko␍
author: chain-code␍
version: 1‸␍
...␍
Body
```

操作：命令 moveLineUp

```after
---␍
title: Marko␍
version: 1‸␍
author: chain-code␍
...␍
Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 · 第 7 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks 在 Front Matter 内按 YAML 行移动并固定分隔栏 -->

```before
---␍
title: Marko␍
author: chain-code␍
version: 1␍
...␍
‸Body
```

操作：命令 moveLineUp

```after
---␍
title: Marko␍
author: chain-code␍
version: 1␍
...␍
‸Body
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownBlocks 只移动无空行相邻的 ATX 标题

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks 只移动无空行相邻的 ATX 标题 -->

```before
Before
# ‸Heading
After
```

操作：命令 moveLineDown

```after
Before
After
# ‸Heading
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"down"]} -->

### E-8 moveMarkdownBlocks moves and renumbers sibling list items

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks moves and renumbers sibling list items -->

```before
1. one
2. ‸two
3. three
```

操作：命令 moveLineUp

```after
1. ‸two
2. one
3. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownBlocks climbs out of a list at its boundary

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks climbs out of a list at its boundary -->

```before
Before

- ‸one
- two

After
```

操作：命令 moveLineUp

```after
- ‸one
- two

Before

After
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownBlocks preserves CRLF block separators

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownBlocks preserves CRLF block separators -->

```before
One␍
␍
‸Two␍
␍
Three
```

操作：命令 moveLineDown

```after
One␍
␍
Three␍
␍
‸Two
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"down"]} -->

### E-8 moveMarkdownLines renumbers ordered list items like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines renumbers ordered list items like Typora -->

```before
1. one
2. ‸two
3. three
```

操作：命令 moveLineDown（源码模式）

```after
1. one
2. three
3. ‸two
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"down"]} -->

### E-8 moveMarkdownLines renumbers ordered list items like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines renumbers ordered list items like Typora -->

```before
1. one
2. ‸two
3. three
```

操作：命令 moveLineUp（源码模式）

```after
1. ‸two
2. one
3. three
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownLines renumbers ordered list items like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines renumbers ordered list items like Typora -->

```before
9. nine
10. ‸ten
11. eleven
```

操作：命令 moveLineUp（源码模式）

```after
9. ‸ten
10. nine
11. eleven
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"up"]} -->

### E-8 list moves preserve selections across ordered marker width changes · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › list moves preserve selections across ordered marker width changes -->

```before
9. nine
10. ⟦ten⟧
11. eleven
```

操作：命令 moveLineUp（源码模式）

```after
9. ⟦ten⟧
10. nine
11. eleven
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"up"]} -->

### E-8 list moves preserve selections across ordered marker width changes · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › list moves preserve selections across ordered marker width changes -->

```before
99. ninety-nine␍
100. ⟦hundred⟧␍
101. next
```

操作：命令 moveLineUp

```after
99. ⟦hundred⟧␍
100. ninety-nine␍
101. next
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownBlocks","args":[{"$state":{}},"up"]} -->

### E-8 moveMarkdownLines does not renumber four-space ordered code outside lists like Typora

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownLines does not renumber four-space ordered code outside lists like Typora -->

```before
paragraph
    3. code
    ‸10. code
```

操作：命令 moveLineUp（源码模式）

```after
paragraph
    ‸10. code
    3. code
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownLines","args":[{"$state":{}},"up"]} -->

### E-9 auto pair inserts pairs, skips existing closing char, and removes pairs on backspace · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › auto pair inserts pairs, skips existing closing char, and removes pairs on backspace -->

```before
a⟦b⟧c
```

操作：输入 "("

```after
a(⟦b⟧)c
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"("]} -->

### E-9 auto pair inserts pairs, skips existing closing char, and removes pairs on backspace · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › auto pair inserts pairs, skips existing closing char, and removes pairs on backspace -->

```before
(‸)
```

操作：输入 ")"

```after
()‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},")"]} -->

### E-9 auto pair inserts pairs, skips existing closing char, and removes pairs on backspace · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › auto pair inserts pairs, skips existing closing char, and removes pairs on backspace -->

```before
(‸)
```

操作：`Backspace`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"removeAutoPairOnBackspace","args":[{"$state":{}}]} -->

### E-9 auto pair inserts pairs, skips existing closing char, and removes pairs on backspace · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › auto pair inserts pairs, skips existing closing char, and removes pairs on backspace -->

```before
⟦math⟧
```

操作：输入 "$"

```after
$⟦math⟧$
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"$"]} -->

### E-9 auto pair inserts pairs, skips existing closing char, and removes pairs on backspace · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › auto pair inserts pairs, skips existing closing char, and removes pairs on backspace -->

```before
$‸$
```

操作：`Backspace`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"removeAutoPairOnBackspace","args":[{"$state":{}}]} -->

### E-9 auto pair supports full-width brackets and Chinese quotes like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › auto pair supports full-width brackets and Chinese quotes like Typora -->

```before
⟦标题⟧
```

操作：输入 "《"

```after
《⟦标题⟧》
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"《"]} -->

### E-9 auto pair supports full-width brackets and Chinese quotes like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › auto pair supports full-width brackets and Chinese quotes like Typora -->

```before
‸中文
```

操作：输入 "“"

```after
“‸”中文
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"“"]} -->

### E-9 auto pair supports full-width brackets and Chinese quotes like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › auto pair supports full-width brackets and Chinese quotes like Typora -->

```before
（‸）
```

操作：输入 "）"

```after
（）‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"）"]} -->

### E-9 auto pair supports full-width brackets and Chinese quotes like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › auto pair supports full-width brackets and Chinese quotes like Typora -->

```before
「‸」
```

操作：`Backspace`

```after
‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"removeAutoPairOnBackspace","args":[{"$state":{}}]} -->

### E-9 applyAutoPair leaves apostrophes inside words for contractions

<!-- 来源：tests/editorCommands.test.ts › applyAutoPair leaves apostrophes inside words for contractions -->

```before
say ‸
```

操作：输入 "'"

```after
say '‸'
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"'"]} -->

### E-9 applyAutoPair wraps selected markdown markers without blocking list shortcuts · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › applyAutoPair wraps selected markdown markers without blocking list shortcuts -->

```before
⟦word⟧
```

操作：输入 "*"

```after
*⟦word⟧*
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"*"]} -->

### E-9 applyAutoPair wraps selected markdown markers without blocking list shortcuts · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › applyAutoPair wraps selected markdown markers without blocking list shortcuts -->

```before
⟦word⟧
```

操作：输入 "_"

```after
_⟦word⟧_
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"_"]} -->

### E-9 applyAutoPair wraps selected markdown markers without blocking list shortcuts · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › applyAutoPair wraps selected markdown markers without blocking list shortcuts -->

```before
H⟦2⟧O
```

操作：输入 "~"

```after
H~⟦2⟧~O
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"~"]} -->

### E-9 applyAutoPair lets code fence backticks continue after skipping the closing pair · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › applyAutoPair lets code fence backticks continue after skipping the closing pair -->

```before
‸
```

操作：输入 "`"

```after
`‸`
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"`"]} -->

### E-9 applyAutoPair lets code fence backticks continue after skipping the closing pair · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › applyAutoPair lets code fence backticks continue after skipping the closing pair -->

```before
`‸`
```

操作：输入 "`"

```after
``‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"applyAutoPair","args":[{"$state":{}},"`"]} -->

### E-5 applyContextualMarkdownTab inserts and removes one indent layer at a collapsed cursor · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab inserts and removes one indent layer at a collapsed cursor -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
al‸pha
```

操作：`Tab`（Markdown 缩进宽度 4）

```after
al	‸pha
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4]} -->

### E-5 applyContextualMarkdownTab inserts and removes one indent layer at a collapsed cursor · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab inserts and removes one indent layer at a collapsed cursor -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
al	‸pha
```

操作：`Shift+Tab`（Markdown 缩进宽度 4）

```after
al‸pha
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true,4]} -->

### E-5 applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

````before
```md
- ‸code that resembles a list
```
````

操作：`Tab`

````after
```md
- 	‸code that resembles a list
```
````

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,2,4]} -->

### E-5 applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

````before
```md
    co‸de
```
````

操作：`Shift+Tab`

````after
```md
co‸de
```
````

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true,2,4]} -->

### E-5 applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts · 第 3 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

````before
```md
code  ‸value
```
````

操作：`Shift+Tab`

````after
```md
code  ‸value
```
````

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true,2,4]} -->

### E-5 applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts · 第 4 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab uses literal tabs at raw-block cursors and outdents line starts -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
    ‸const value = 1;
```

操作：`Shift+Tab`

```after
‸const value = 1;
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true,2,4]} -->

### E-5 applyContextualMarkdownTab does not nest a list item without a previous sibling · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab does not nest a list item without a previous sibling -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
- ‸first
- second
```

操作：`Tab`

```after
- 	‸first
- second
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### E-5 applyContextualMarkdownTab does not nest a list item without a previous sibling · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab does not nest a list item without a previous sibling -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
- parent
  - ‸first child
```

操作：`Tab`

```after
- parent
  - 	‸first child
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### E-5 applyContextualMarkdownTab indents the current list item and its subtree

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab indents the current list item and its subtree -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
- first
- ‸second
  - child
- third
```

操作：`Tab`

```after
- first
  - ‸second
    - child
- third
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### E-5 applyContextualMarkdownTab outdents the current list item and its subtree

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab outdents the current list item and its subtree -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
- parent
  - ‸child
    1. grandchild
  - sibling
```

操作：`Shift+Tab`

```after
- parent
- ‸child
  1. grandchild
  - sibling
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 applyContextualMarkdownTab outdents a valid third-level sibling by one list level

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab outdents a valid third-level sibling by one list level -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
- parent
  - child
    - first
    - ‸second
```

操作：`Shift+Tab`

```after
- parent
  - child
    - first
  - ‸second
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 applyContextualMarkdownTab keeps standalone four-space marker text as indented code

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab keeps standalone four-space marker text as indented code -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
    - ‸code
```

操作：`Shift+Tab`

```after
- ‸code
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true,2,4]} -->

### E-5 applyContextualMarkdownTab preserves CRLF while indenting a quoted list subtree

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab preserves CRLF while indenting a quoted list subtree -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> - first␍
> - ‸second␍
>   - child
```

操作：`Tab`

```after
> - first␍
>   - ‸second␍
>     - child
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### E-5 applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
---
‸key:
---
```

操作：`Tab`

```after
---
  ‸key:
---
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,2,4]} -->

### E-5 applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
---
‸key:
---
```

操作：`Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

```after
---
    ‸key:
---
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4,2]} -->

### E-5 applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior · 第 3 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
---
ke‸y:
---
```

操作：`Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

```after
---
ke	‸y:
---
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4,2]} -->

### E-5 applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior · 第 4 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
---
⟦key:⟧
---
```

操作：`Shift+Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

```after
---
⟦key:⟧
---
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true,4,2]} -->

### E-5 applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior · 第 5 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab follows Front Matter Tab and Shift+Tab behavior -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
---
key:
‸---
```

操作：`Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

```after
---
key:
	‸---
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4,2]} -->

### E-5 applyContextualMarkdownTab replaces ordinary selections with one literal tab · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab replaces ordinary selections with one literal tab -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
⟦alpha␍
beta⟧
```

操作：`Tab`

```after
	‸
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### E-5 applyContextualMarkdownTab replaces ordinary selections with one literal tab · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab replaces ordinary selections with one literal tab -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
ab⟦XX
YY⟧cd
```

操作：`Tab`

```after
ab	‸cd
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### E-5 applyContextualMarkdownTab keeps list and indented-code selections on line indentation · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab keeps list and indented-code selections on line indentation -->

<!-- 阶段 4 改：编辑器里选区进不了列表符号：选中整行就是从内容开头选起；改出来的文字相同 -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
- ⟦one
- two⟧
```

操作：`Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

```after
    - ⟦one
    - two⟧
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4,2]} -->

### E-5 applyContextualMarkdownTab keeps list and indented-code selections on line indentation · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab keeps list and indented-code selections on line indentation -->

<!-- 阶段 4 改：缩进代码块的缩进不在文字里：选中整块就是从代码开头选起；改出来的文字相同 -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
    ⟦alpha
    beta⟧
```

操作：`Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

```after
      ⟦alpha
      beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4,2]} -->

### E-5 applyContextualMarkdownTab uses code indentation for fenced, math, and HTML selections · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab uses code indentation for fenced, math, and HTML selections -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

````before
```js
⟦alpha
beta⟧
```
````

操作：`Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

````after
```js
  ⟦alpha
  beta⟧
```
````

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4,2]} -->

### E-5 applyContextualMarkdownTab uses code indentation for fenced, math, and HTML selections · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab uses code indentation for fenced, math, and HTML selections -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
$$
⟦alpha
beta⟧
$$
```

操作：`Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

```after
$$
  ⟦alpha
  beta⟧
$$
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4,2]} -->

### E-5 applyContextualMarkdownTab uses code indentation for fenced, math, and HTML selections · 第 3 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab uses code indentation for fenced, math, and HTML selections -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
<div>
⟦alpha
beta⟧
</div>
```

操作：`Tab`（Markdown 缩进宽度 4，代码缩进宽度 2）

```after
<div>
  ⟦alpha
  beta⟧
</div>
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,4,2]} -->

### E-5 applyContextualMarkdownTab preserves every supported code indentation width · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab preserves every supported code indentation width -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

````before
```js
⟦alpha
beta⟧
```
````

操作：`Tab`（代码缩进宽度 2）

````after
```js
  ⟦alpha
  beta⟧
```
````

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,2,2]} -->

### E-5 applyContextualMarkdownTab preserves every supported code indentation width · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab preserves every supported code indentation width -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

````before
```js
⟦alpha
beta⟧
```
````

操作：`Tab`（代码缩进宽度 3）

````after
```js
   ⟦alpha
   beta⟧
```
````

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,2,3]} -->

### E-5 applyContextualMarkdownTab preserves every supported code indentation width · 第 3 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab preserves every supported code indentation width -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

````before
```js
⟦alpha
beta⟧
```
````

操作：`Tab`

````after
```js
    ⟦alpha
    beta⟧
```
````

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,2,4]} -->

### E-5 applyContextualMarkdownTab preserves every supported code indentation width · 第 4 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab preserves every supported code indentation width -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

````before
```js
⟦alpha
beta⟧
```
````

操作：`Tab`（代码缩进宽度 5）

````after
```js
     ⟦alpha
     beta⟧
```
````

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false,2,5]} -->

### E-5 applyContextualMarkdownTab removes one quote level and prioritizes list outdent · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab removes one quote level and prioritizes list outdent -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> ‸text
```

操作：`Shift+Tab`

```after
‸text
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 applyContextualMarkdownTab removes one quote level and prioritizes list outdent · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab removes one quote level and prioritizes list outdent -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> > ‸text
```

操作：`Shift+Tab`

```after
> ‸text
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 applyContextualMarkdownTab removes one quote level and prioritizes list outdent · 第 3 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab removes one quote level and prioritizes list outdent -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
- ‸item
```

操作：`Shift+Tab`

```after
‸item
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 applyContextualMarkdownTab removes one quote level and prioritizes list outdent · 第 4 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab removes one quote level and prioritizes list outdent -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> - ‸item
```

操作：`Shift+Tab`

```after
> ‸item
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 applyContextualMarkdownTab outdents only the selected quote paragraph

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab outdents only the selected quote paragraph -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> before
>
> sel‸ected
>
> after
```

操作：`Shift+Tab`

```after
> before

sel‸ected

> after
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 applyContextualMarkdownTab maps quote selections and preserves CRLF · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab maps quote selections and preserves CRLF -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
> a⟦lpha␍
> be⟧ta
```

操作：`Shift+Tab`

```after
a⟦lpha␍
be⟧ta
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 applyContextualMarkdownTab maps quote selections and preserves CRLF · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › applyContextualMarkdownTab maps quote selections and preserves CRLF -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
⟦> alpha␍
> beta⟧
```

操作：`Shift+Tab`

```after
⟦alpha␍
beta⟧
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 ordered list editing accepts arbitrary-length marker digits · 第 1 步

<!-- 来源：tests/editorBlocks.test.ts › ordered list editing accepts arbitrary-length marker digits -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
1. parent
123456789. ‸child
```

操作：`Tab`

```after
1. parent
  1. ‸child
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### E-5 ordered list editing accepts arbitrary-length marker digits · 第 2 步

<!-- 来源：tests/editorBlocks.test.ts › ordered list editing accepts arbitrary-length marker digits -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
1. parent
  1. ‸child
```

操作：`Shift+Tab`

```after
1. parent
2. ‸child
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

### E-5 ordered list editing accepts arbitrary-length marker digits · 第 3 步

<!-- 来源：tests/editorBlocks.test.ts › ordered list editing accepts arbitrary-length marker digits -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
1234567890. child‸
```

操作：`Tab`

```after
1234567890. child	‸
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},false]} -->

### E-5 ordered list editing accepts arbitrary-length marker digits · 第 4 步

<!-- 来源：tests/editorBlocks.test.ts › ordered list editing accepts arbitrary-length marker digits -->

<!-- 阶段 4 补：旧的提取漏掉了参数是「文本, 起点, 终点」的函数 -->

```before
  ‸1234567890. child
```

操作：`Shift+Tab`

```after
‸1234567890. child
```

<!-- 旧代码：{"module":"src/utils/editorBlocks","fn":"applyContextualMarkdownTab","args":[{"$text":true},{"$start":true},{"$end":true},true]} -->

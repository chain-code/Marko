# 剪贴板（C）的行为规格

格式见同目录的 [README](README.md)。
本文件由 `legacy/extract.mjs` 从旧代码的逻辑测试生成（2026-11-23），之后手工维护。

### C-3 pasteMarkdownText turns a pasted URL over selected text into a link

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText turns a pasted URL over selected text into a link -->

```before
read ⟦docs⟧
```

操作：粘贴，text = "https://example.com/docs"

```after
read ⟦[docs](https://example.com/docs)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://example.com/docs"]} -->

### C-3 pasteMarkdownText links local and custom protocol destinations like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText links local and custom protocol destinations like Typora -->

```before
open ⟦note⟧
```

操作：粘贴，text = "file:///C:/docs/My%20Note.md"

```after
open ⟦[note](file:///C:/docs/My%20Note.md)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"file:///C:/docs/My%20Note.md"]} -->

### C-3 pasteMarkdownText links local and custom protocol destinations like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText links local and custom protocol destinations like Typora -->

```before
open ⟦note⟧
```

操作：粘贴，text = "C:\\docs\\My Note.md"

```after
open ⟦[note](<C:\docs\My Note.md>)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"C:\\docs\\My Note.md"]} -->

### C-3 pasteMarkdownText links local and custom protocol destinations like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText links local and custom protocol destinations like Typora -->

```before
open ⟦vault⟧
```

操作：粘贴，text = "obsidian://open?vault=docs"

```after
open ⟦[vault](obsidian://open?vault=docs)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"obsidian://open?vault=docs"]} -->

### C-3 pasteMarkdownText updates an existing markdown link target · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates an existing markdown link target -->

```before
read [⟦docs⟧](https://old.example)
```

操作：粘贴，text = "https://new.example"

```after
read ⟦[docs](https://new.example)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example"]} -->

### C-3 pasteMarkdownText updates an existing markdown link target · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates an existing markdown link target -->

```before
read ⟦[docs](https://old.example)⟧
```

操作：粘贴，text = "https://new.example"

```after
read ⟦[docs](https://new.example)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example"]} -->

### C-3 pasteMarkdownText updates image targets when alt text is selected like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates image targets when alt text is selected like Typora -->

```before
look ![⟦logo⟧](old.png) now
```

操作：粘贴，text = "https://cdn.example/logo.png"

```after
look !⟦[logo](https://cdn.example/logo.png)⟧ now
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://cdn.example/logo.png"]} -->

### C-3 pasteMarkdownText updates image targets when alt text is selected like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates image targets when alt text is selected like Typora -->

```before
look ![⟦logo⟧][old-ref] now
```

操作：粘贴，text = "C:\\assets\\logo 2.png"

```after
look !⟦[logo](<C:\assets\logo 2.png>)⟧ now
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"C:\\assets\\logo 2.png"]} -->

### C-3 pasteMarkdownText wraps complex link destinations like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText wraps complex link destinations like Typora -->

```before
read ⟦docs⟧
```

操作：粘贴，text = "https://example.com/a(b)"

```after
read ⟦[docs](<https://example.com/a(b)>)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://example.com/a(b)"]} -->

### C-3 pasteMarkdownText wraps complex link destinations like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText wraps complex link destinations like Typora -->

```before
read [⟦docs⟧](https://old.example)
```

操作：粘贴，text = "https://example.com/a(b)"

```after
read ⟦[docs](<https://example.com/a(b)>)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://example.com/a(b)"]} -->

### C-3 pasteMarkdownText updates links with parenthesized destinations like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates links with parenthesized destinations like Typora -->

```before
read [⟦docs⟧](<https://old.example/a(b)> "Old title") now
```

操作：粘贴，text = "https://new.example/a(b)"

```after
read ⟦[docs](<https://new.example/a(b)>)⟧ now
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example/a(b)"]} -->

### C-3 pasteMarkdownText updates links with parenthesized destinations like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates links with parenthesized destinations like Typora -->

```before
⟦![logo](<assets/a(b).png>)⟧
```

操作：粘贴，text = "https://cdn.example/a(b).png"

```after
!⟦[logo](<https://cdn.example/a(b).png>)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://cdn.example/a(b).png"]} -->

### C-3 pasteMarkdownText updates links with nested or escaped labels like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates links with nested or escaped labels like Typora -->

```before
read [⟦API [v2] docs⟧](https://old.example) now
```

操作：粘贴，text = "https://new.example"

```after
read ⟦[API [v2] docs](https://new.example)⟧ now
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example"]} -->

### C-3 pasteMarkdownText updates links with nested or escaped labels like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates links with nested or escaped labels like Typora -->

```before
see ⟦[API \[v2\] docs](https://old.example)⟧
```

操作：粘贴，text = "https://new.example/a(b)"

```after
see ⟦[API \[v2\] docs](<https://new.example/a(b)>)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example/a(b)"]} -->

### C-3 pasteMarkdownText updates links with nested or escaped labels like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates links with nested or escaped labels like Typora -->

```before
![⟦chart [wide]⟧](assets/chart.png)
```

操作：粘贴，text = "https://cdn.example/chart.png"

```after
!⟦[chart [wide]](https://cdn.example/chart.png)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://cdn.example/chart.png"]} -->

### C-3 pasteMarkdownText updates reference images with nested labels like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates reference images with nested labels like Typora -->

```before
read [⟦API [v2]⟧][docs]
```

操作：粘贴，text = "https://new.example"

```after
read ⟦[API [v2]](https://new.example)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example"]} -->

### C-3 pasteMarkdownText updates reference images with nested labels like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates reference images with nested labels like Typora -->

```before
⟦![logo [dark]][logo-ref]⟧
```

操作：粘贴，text = "https://cdn.example/logo.png"

```after
!⟦[logo [dark]](https://cdn.example/logo.png)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://cdn.example/logo.png"]} -->

### C-3 pasteMarkdownText updates reference links and replaces selected URLs · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates reference links and replaces selected URLs -->

```before
read [⟦docs⟧][d]
```

操作：粘贴，text = "https://new.example"

```after
read ⟦[docs](https://new.example)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example"]} -->

### C-3 pasteMarkdownText updates reference links and replaces selected URLs · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates reference links and replaces selected URLs -->

```before
go ⟦https://old.example⟧ now
```

操作：粘贴，text = "https://new.example"

```after
go ⟦https://new.example⟧ now
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example"]} -->

### C-3 pasteMarkdownText updates reference links and replaces selected URLs · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates reference links and replaces selected URLs -->

```before
go ⟦<https://old.example>⟧
```

操作：粘贴，text = "https://new.example"

```after
go ⟦<https://new.example>⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"https://new.example"]} -->

### C-3 pasteMarkdownText updates reference links and replaces selected URLs · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText updates reference links and replaces selected URLs -->

```before
go ⟦<obsidian://open?vault=old>⟧
```

操作：粘贴，text = "file:///C:/docs/new.md"

```after
go ⟦<file:///C:/docs/new.md>⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"file:///C:/docs/new.md"]} -->

### C-3 pasteMarkdownText converts tabular clipboard text into a Markdown table

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText converts tabular clipboard text into a Markdown table -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
before‸
after
```

操作：粘贴，text = "Name\tAge\nAda\t36\nBob\t41"

```after
before
| Name | Age |
| --- | --- |
| Ada | 36 |
| Bob | 41‸ |
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"Name\tAge\nAda\t36\nBob\t41"]} -->

### C-3 pasteMarkdownText pads and escapes pasted table cells

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText pads and escapes pasted table cells -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
‸
```

操作：粘贴，text = "A\tB\tC\n1\t2\nx|y\t z  z \t3"

```after
| A | B | C |
| --- | --- | --- |
| 1 | 2 |  |
| x\|y | z z | 3‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"A\tB\tC\n1\t2\nx|y\t z  z \t3"]} -->

### C-3 pasteMarkdownText preserves quoted multiline table cells like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText preserves quoted multiline table cells like Typora -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
‸
```

操作：粘贴，text = "Name\tNotes\nAda\t\"Line one\nLine \"\"two\"\"\"\nBob\t\"keeps\tinside\""

```after
| Name | Notes |
| --- | --- |
| Ada | Line one Line "two" |
| Bob | keeps inside‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"Name\tNotes\nAda\t\"Line one\nLine \"\"two\"\"\"\nBob\t\"keeps\tinside\""]} -->

### C-3 pasteMarkdownText converts multiline CSV clipboard text into a Markdown table

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownText converts multiline CSV clipboard text into a Markdown table -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
‸
```

操作：粘贴，text = "Name,Notes\nAda,\"Line one\nLine \"\"two\"\"\"\nBob,\"keeps, comma\""

```after
| Name | Notes |
| --- | --- |
| Ada | Line one Line "two" |
| Bob | keeps, comma‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownText","args":[{"$state":{}},"Name,Notes\nAda,\"Line one\nLine \"\"two\"\"\"\nBob,\"keeps, comma\""]} -->

### C-3 pasteMarkdownContent converts pasted HTML tables into Markdown tables

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent converts pasted HTML tables into Markdown tables -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
before‸
after
```

操作：粘贴，text = "Name\tAge\tCity\nAda\t36\tLondon"，html = "<table><tr><th>Name</th><th style=\"text-align: right\">Age</th><th align=\"center\">City</th></tr><tr><td>Ada</td><td>36</td><td>London</td></tr><tr><td>x|y&nbsp;</td><td colspan=\"2\">wide &amp; tall</td></tr></table>"

```after
before
| Name | Age | City |
| --- | ---: | :---: |
| Ada | 36 | London |
| x\|y | wide & tall | ‸ |
after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<table><tr><th>Name</th><th style=\"text-align: right\">Age</th><th align=\"center\">City</th></tr><tr><td>Ada</td><td>36</td><td>London</td></tr><tr><td>x|y&nbsp;</td><td colspan=\"2\">wide &amp; tall</td></tr></table>","text":"Name\tAge\tCity\nAda\t36\tLondon"}]} -->

### C-3 pasteMarkdownContent converts single-column HTML tables through fallback and DOM paths · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent converts single-column HTML tables through fallback and DOM paths -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
‸
```

操作：粘贴，text = "标题\n内容"，html = "<table><tr><th>标题</th></tr><tr><td>内容</td></tr></table>"

```after
| 标题 |
| --- |
| 内容‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<table><tr><th>标题</th></tr><tr><td>内容</td></tr></table>","text":"标题\n内容"}]} -->

### C-3 pasteMarkdownContent converts single-column HTML tables through fallback and DOM paths · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent converts single-column HTML tables through fallback and DOM paths -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
‸
```

操作：粘贴，html = "<table><tr><th>标题</th></tr><tr><td>内容</td></tr></table>"

```after
| 标题 |
| --- |
| 内容‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<table><tr><th>标题</th></tr><tr><td>内容</td></tr></table>"}]} -->

### C-3 pasteMarkdownContent expands rowspan HTML table cells like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent expands rowspan HTML table cells like Typora -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
‸
```

操作：粘贴，html = "<table><tr><th>Group</th><th>Item</th></tr><tr><td rowspan=\"2\">A</td><td>One</td></tr><tr><td>Two</td></tr><tr><td>B</td><td>Three</td></tr></table>"

```after
| Group | Item |
| --- | --- |
| A | One |
|  | Two |
| B | Three‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<table><tr><th>Group</th><th>Item</th></tr><tr><td rowspan=\"2\">A</td><td>One</td></tr><tr><td>Two</td></tr><tr><td>B</td><td>Three</td></tr></table>"}]} -->

### C-3 pasteMarkdownContent keeps DOM table cell line breaks separated like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent keeps DOM table cell line breaks separated like Typora -->

<!-- 阶段 4 改：粘贴表格后光标在最后一格的末尾（编辑器里光标进不了竖线后面） -->

```before
‸
```

操作：粘贴，html = "<table><tr><th>Name</th><th>Notes</th></tr><tr><td>Ada</td><td>Line one<br>Line two</td></tr></table>"

```after
| Name | Notes |
| --- | --- |
| Ada | Line one Line two‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<table><tr><th>Name</th><th>Notes</th></tr><tr><td>Ada</td><td>Line one<br>Line two</td></tr></table>"}]} -->

### C-3 pasteMarkdownContent preserves surrounding blocks when HTML contains a table

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves surrounding blocks when HTML contains a table -->

```before
‸
```

操作：粘贴，text = "Intro text\nA\tB\n1\t2\nAfter"，html = "<p>Intro <strong>text</strong></p><table><tr><th>A</th><th style=\"text-align: right\">B</th></tr><tr><td>1</td><td>2</td></tr></table><p>After</p>"

```after
Intro **text**

| A | B |
| --- | ---: |
| 1 | 2 |

After‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p>Intro <strong>text</strong></p><table><tr><th>A</th><th style=\"text-align: right\">B</th></tr><tr><td>1</td><td>2</td></tr></table><p>After</p>","text":"Intro text\nA\tB\n1\t2\nAfter"}]} -->

### C-3 pasteMarkdownContent converts rich HTML fragments into Markdown

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent converts rich HTML fragments into Markdown -->

```before
‸
```

操作：粘贴，text = "Heading\nParagraph with bold docs and code.\nFirst\nSecond item\nQuote"，html = "<!--StartFragment--><h2>Heading</h2><p>Paragraph with <strong>bold</strong> <a href=\"https://example.com/a\">docs</a> and <code>code</code>.</p><ul><li>First</li><li>Second <em>item</em></li></ul><blockquote><p>Quote</p></blockquote><p><img src=\"assets/logo.png\" alt=\"Logo\" title=\"Logo title\"></p><!--EndFragment-->"

```after
## Heading

Paragraph with **bold** [docs](https://example.com/a) and `code`.

- First
- Second *item*

> Quote

![Logo](assets/logo.png "Logo title")‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<!--StartFragment--\u003e<h2>Heading</h2><p>Paragraph with <strong>bold</strong> <a href=\"https://example.com/a\">docs</a> and <code>code</code>.</p><ul><li>First</li><li>Second <em>item</em></li></ul><blockquote><p>Quote</p></blockquote><p><img src=\"assets/logo.png\" alt=\"Logo\" title=\"Logo title\"></p><!--EndFragment--\u003e","text":"Heading\nParagraph with bold docs and code.\nFirst\nSecond item\nQuote"}]} -->

### C-3 pasteMarkdownContent keeps inline rich HTML inside the current paragraph · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent keeps inline rich HTML inside the current paragraph -->

```before
Before ‸ after
```

操作：粘贴，text = "bold and italic"，html = "<!--StartFragment--><strong>bold</strong> and <em>italic</em><!--EndFragment-->"

```after
Before **bold** and *italic*‸ after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<!--StartFragment--\u003e<strong>bold</strong> and <em>italic</em><!--EndFragment--\u003e","text":"bold and italic"}]} -->

### C-3 pasteMarkdownContent keeps inline rich HTML inside the current paragraph · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent keeps inline rich HTML inside the current paragraph -->

```before
Before ⟦old⟧ after
```

操作：粘贴，text = "x"，html = "<code>x</code>"

```after
Before `x`‸ after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<code>x</code>","text":"x"}]} -->

### C-3 pasteMarkdownContent preserves nested inline HTML formatting like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves nested inline HTML formatting like Typora -->

```before
‸
```

操作：粘贴，html = "<p>Nested <strong><em>both</em></strong>, <del><em>gone</em></del>, <mark><strong>mark</strong></mark>, <span style=\"font-weight: 700\"><em>style</em></span>.</p>"

```after
Nested ***both***, ~~*gone*~~, ==**mark**==, ***style***.‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p>Nested <strong><em>both</em></strong>, <del><em>gone</em></del>, <mark><strong>mark</strong></mark>, <span style=\"font-weight: 700\"><em>style</em></span>.</p>"}]} -->

### C-3 pasteMarkdownContent converts HTML keyboard and sample tags like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent converts HTML keyboard and sample tags like Typora -->

```before
‸
```

操作：粘贴，html = "<p>Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy <var>x</var>, see <samp>ok</samp>, and <ins>insert</ins>.</p>"

```after
Press `Ctrl`+`C` to copy *x*, see `ok`, and <u>insert</u>.‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p>Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy <var>x</var>, see <samp>ok</samp>, and <ins>insert</ins>.</p>"}]} -->

### C-3 pasteMarkdownContent preserves styled inline HTML like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves styled inline HTML like Typora -->

```before
‸
```

操作：粘贴，text = "bold italic gone under mark 2 n"，html = "<p><span style=\"font-weight: 700\">bold</span> <span style=\"font-style: italic\">italic</span> <span style=\"text-decoration: line-through\">gone</span> <span style=\"text-decoration-line: underline\">under</span> <span style=\"background-color: yellow\">mark</span> <span style=\"vertical-align: super\">2</span> <span style=\"vertical-align: sub\">n</span></p>"

```after
**bold** *italic* ~~gone~~ <u>under</u> ==mark== ^2^ ~n~‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><span style=\"font-weight: 700\">bold</span> <span style=\"font-style: italic\">italic</span> <span style=\"text-decoration: line-through\">gone</span> <span style=\"text-decoration-line: underline\">under</span> <span style=\"background-color: yellow\">mark</span> <span style=\"vertical-align: super\">2</span> <span style=\"vertical-align: sub\">n</span></p>","text":"bold italic gone under mark 2 n"}]} -->

### C-3 pasteMarkdownContent converts HTML definition lists into editable definition lists like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent converts HTML definition lists into editable definition lists like Typora -->

```before
‸
```

操作：粘贴，html = "<dl><dt><strong>Term</strong></dt><dd>First definition</dd><dd><p>Second <em>detail</em></p><p>Extra</p></dd><dt>Next</dt><dd><a href=\"https://example.com/docs\">Docs</a></dd></dl>"

```after
**Term**
: First definition
: Second *detail*

    Extra
Next
: [Docs](https://example.com/docs)‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<dl><dt><strong>Term</strong></dt><dd>First definition</dd><dd><p>Second <em>detail</em></p><p>Extra</p></dd><dt>Next</dt><dd><a href=\"https://example.com/docs\">Docs</a></dd></dl>"}]} -->

### C-3 pasteMarkdownContent drops unsafe HTML link hrefs and keeps local links

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent drops unsafe HTML link hrefs and keeps local links -->

```before
‸
```

操作：粘贴，text = "bad vault file"，html = "<p><a href=\"javascript:alert(1)\">bad</a> <a href=\"obsidian://open?vault=docs\">vault</a> <a href=\"file:///C:/docs/a.md\">file</a></p>"

```after
bad [vault](obsidian://open?vault=docs) [file](file:///C:/docs/a.md)‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><a href=\"javascript:alert(1)\">bad</a> <a href=\"obsidian://open?vault=docs\">vault</a> <a href=\"file:///C:/docs/a.md\">file</a></p>","text":"bad vault file"}]} -->

### C-3 pasteMarkdownContent preserves HTML link titles like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves HTML link titles like Typora -->

```before
‸
```

操作：粘贴，html = "<p><a href=\"https://example.com/a(b)\" title=\"Docs &quot;API&quot;\">docs</a></p>"

```after
[docs](<https://example.com/a(b)> "Docs \"API\"")‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><a href=\"https://example.com/a(b)\" title=\"Docs &quot;API&quot;\">docs</a></p>"}]} -->

### C-3 pasteMarkdownContent escapes bracketed HTML link labels like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent escapes bracketed HTML link labels like Typora -->

```before
‸
```

操作：粘贴，html = "<p><a href=\"https://example.com/docs\">API [v2]</a></p>"

```after
[API \[v2\]](https://example.com/docs)‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><a href=\"https://example.com/docs\">API [v2]</a></p>"}]} -->

### C-3 pasteMarkdownContent drops unsafe HTML image sources and keeps local images

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent drops unsafe HTML image sources and keeps local images -->

```before
‸
```

操作：粘贴，html = "<p><img src=\"javascript:alert(1)\" alt=\"Bad\"> <img src=\"data:text/html,hi\" alt=\"Text\"> <img src=\"file:///C:/docs/logo one.png\" alt=\"Logo\"> <img src=\"data:image/png;base64,abc\" alt=\"Inline\"></p>"

```after
Bad Text ![Logo](<file:///C:/docs/logo one.png>) ![Inline](data:image/png;base64,abc)‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><img src=\"javascript:alert(1)\" alt=\"Bad\"> <img src=\"data:text/html,hi\" alt=\"Text\"> <img src=\"file:///C:/docs/logo one.png\" alt=\"Logo\"> <img src=\"data:image/png;base64,abc\" alt=\"Inline\"></p>"}]} -->

### C-3 pasteMarkdownContent preserves bracketed image alt text like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves bracketed image alt text like Typora -->

```before
‸
```

操作：粘贴，html = "<p><img src=\"assets/chart.png\" alt=\"Chart [wide]\"></p>"

```after
![Chart \[wide\]](assets/chart.png)‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><img src=\"assets/chart.png\" alt=\"Chart [wide]\"></p>"}]} -->

### C-3 pasteMarkdownContent preserves pasted HTML image dimensions like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves pasted HTML image dimensions like Typora -->

```before
‸
```

操作：粘贴，html = "<p><img src=\"assets/logo.png\" alt=\"Logo\" title=\"Logo title\" width=\"320\" height=\"180\"></p>"

```after
<img src="assets/logo.png" alt="Logo" width="320" height="180" title="Logo title">‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><img src=\"assets/logo.png\" alt=\"Logo\" title=\"Logo title\" width=\"320\" height=\"180\"></p>"}]} -->

### C-3 pasteMarkdownContent preserves pasted HTML image dimensions like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves pasted HTML image dimensions like Typora -->

```before
‸
```

操作：粘贴，html = "<p><img src=\"assets/logo.png\" alt=\"Logo\" style=\"width: 50%; height: auto\"></p>"

```after
<img src="assets/logo.png" alt="Logo" width="50%">‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><img src=\"assets/logo.png\" alt=\"Logo\" style=\"width: 50%; height: auto\"></p>"}]} -->

### C-3 pasteMarkdownContent preserves linked HTML images like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves linked HTML images like Typora -->

```before
‸
```

操作：粘贴，html = "<p><a href=\"https://example.com/full\"><img src=\"assets/photo.png\" alt=\"Preview\"></a></p>"

```after
[![Preview](assets/photo.png)](https://example.com/full)‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><a href=\"https://example.com/full\"><img src=\"assets/photo.png\" alt=\"Preview\"></a></p>"}]} -->

### C-3 pasteMarkdownContent preserves linked HTML image dimensions like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves linked HTML image dimensions like Typora -->

```before
‸
```

操作：粘贴，html = "<p><a href=\"https://example.com/full\" title=\"Open large\"><img src=\"assets/photo.png\" alt=\"Preview\" width=\"320\"></a></p>"

```after
<a href="https://example.com/full" title="Open large"><img src="assets/photo.png" alt="Preview" width="320"></a>‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><a href=\"https://example.com/full\" title=\"Open large\"><img src=\"assets/photo.png\" alt=\"Preview\" width=\"320\"></a></p>"}]} -->

### C-3 pasteMarkdownContent preserves linked HTML image dimensions like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves linked HTML image dimensions like Typora -->

```before
‸
```

操作：粘贴，html = "<p><a href=\"https://example.com/full\"><img src=\"assets/photo.png\" alt=\"Preview\" style=\"width: 50%; height: auto\"></a></p>"

```after
<a href="https://example.com/full"><img src="assets/photo.png" alt="Preview" width="50%"></a>‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p><a href=\"https://example.com/full\"><img src=\"assets/photo.png\" alt=\"Preview\" style=\"width: 50%; height: auto\"></a></p>"}]} -->

### C-3 pasteMarkdownContent separates HTML figure captions from images like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent separates HTML figure captions from images like Typora -->

```before
‸
```

操作：粘贴，text = "Figure 1. Caption"，html = "<figure><img src=\"assets/photo.png\" alt=\"Photo\"><figcaption><strong>Figure 1.</strong> Caption</figcaption></figure>"

```after
![Photo](assets/photo.png)

**Figure 1.** Caption‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<figure><img src=\"assets/photo.png\" alt=\"Photo\"><figcaption><strong>Figure 1.</strong> Caption</figcaption></figure>","text":"Figure 1. Caption"}]} -->

### C-3 pasteMarkdownContent preserves HTML paragraphs and line breaks

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves HTML paragraphs and line breaks -->

```before
‸
```

操作：粘贴，text = "Line one\nLine two\nNext"，html = "<p>Line one<br>Line two</p><p>Next</p>"

```after
Line one  
Line two

Next‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p>Line one<br>Line two</p><p>Next</p>","text":"Line one\nLine two\nNext"}]} -->

### C-3 pasteMarkdownContent preserves surrounding CRLF line endings for generated blocks

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves surrounding CRLF line endings for generated blocks -->

```before
Intro␍
‸Outro
```

操作：粘贴，html = "<p>Alpha</p><p>Beta</p>"

```after
Intro␍
Alpha␍
␍
Beta‸␍
Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p>Alpha</p><p>Beta</p>"}]} -->

### C-3 pasteMarkdownContent preserves multi-paragraph HTML blockquotes like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves multi-paragraph HTML blockquotes like Typora -->

```before
‸
```

操作：粘贴，text = "Quote one\nQuote two\nPoint"，html = "<blockquote><p>Quote <strong>one</strong></p><p>Quote two</p><ul><li>Point</li></ul></blockquote>"

```after
> Quote **one**
>
> Quote two
>
> - Point‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<blockquote><p>Quote <strong>one</strong></p><p>Quote two</p><ul><li>Point</li></ul></blockquote>","text":"Quote one\nQuote two\nPoint"}]} -->

### C-3 pasteMarkdownContent preserves nested HTML blockquotes like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves nested HTML blockquotes like Typora -->

```before
‸
```

操作：粘贴，html = "<blockquote><p>Outer</p><blockquote><p>Inner</p></blockquote><p>After</p></blockquote>"

```after
> Outer
>
> > Inner
>
> After‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<blockquote><p>Outer</p><blockquote><p>Inner</p></blockquote><p>After</p></blockquote>"}]} -->

### C-3 pasteMarkdownContent preserves nested HTML list levels and ordered starts

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves nested HTML list levels and ordered starts -->

```before
‸
```

操作：粘贴，text = "Third\nChild\nBold child\nSeventh\nNested one\nNested five\nEighth"，html = "<ol start=\"3\"><li>Third<ul><li>Child</li><li><strong>Bold child</strong></li></ul></li><li value=\"7\">Seventh<ol><li>Nested one</li><li value=\"5\">Nested five</li></ol></li><li>Eighth</li></ol>"

```after
3. Third
  - Child
  - **Bold child**
7. Seventh
  1. Nested one
  5. Nested five
8. Eighth‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<ol start=\"3\"><li>Third<ul><li>Child</li><li><strong>Bold child</strong></li></ul></li><li value=\"7\">Seventh<ol><li>Nested one</li><li value=\"5\">Nested five</li></ol></li><li>Eighth</li></ol>","text":"Third\nChild\nBold child\nSeventh\nNested one\nNested five\nEighth"}]} -->

### C-3 pasteMarkdownContent preserves multi-paragraph HTML list items like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves multi-paragraph HTML list items like Typora -->

```before
‸
```

操作：粘贴，text = "First paragraph\nSecond paragraph\nChild\nDone\nTask detail\nNinth\nOrdered detail"，html = "<ul><li><p>First <strong>paragraph</strong></p><p>Second paragraph</p><ul><li>Child</li></ul></li><li><input type=\"checkbox\" checked><p>Done</p><p>Task detail</p></li></ul><ol start=\"9\"><li><p>Ninth</p><p>Ordered detail</p></li></ol>"

```after
- First **paragraph**

  Second paragraph
  - Child
- [x] Done

      Task detail

9. Ninth

   Ordered detail‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<ul><li><p>First <strong>paragraph</strong></p><p>Second paragraph</p><ul><li>Child</li></ul></li><li><input type=\"checkbox\" checked><p>Done</p><p>Task detail</p></li></ul><ol start=\"9\"><li><p>Ninth</p><p>Ordered detail</p></li></ol>","text":"First paragraph\nSecond paragraph\nChild\nDone\nTask detail\nNinth\nOrdered detail"}]} -->

### C-3 pasteMarkdownContent preserves reversed HTML ordered list numbering like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves reversed HTML ordered list numbering like Typora -->

```before
‸
```

操作：粘贴，text = "Five\nFour\nTwo\nOne\nSecond\nFirst"，html = "<ol reversed start=\"5\"><li>Five</li><li>Four</li><li value=\"2\">Two</li><li>One</li></ol><ol reversed><li>Second</li><li>First</li></ol>"

```after
5. Five
4. Four
2. Two
1. One

2. Second
1. First‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<ol reversed start=\"5\"><li>Five</li><li>Four</li><li value=\"2\">Two</li><li>One</li></ol><ol reversed><li>Second</li><li>First</li></ol>","text":"Five\nFour\nTwo\nOne\nSecond\nFirst"}]} -->

### C-3 pasteMarkdownContent preserves HTML task list checkbox states

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves HTML task list checkbox states -->

```before
‸
```

操作：粘贴，text = "Done\nTodo\nOrdered done"，html = "<ul><li><input type=\"checkbox\" checked> Done</li><li><input type=\"checkbox\"> Todo</li></ul><ol start=\"3\"><li><input type=\"checkbox\" checked=\"checked\"> Ordered done</li></ol>"

```after
- [x] Done
- [ ] Todo

3. [x] Ordered done‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<ul><li><input type=\"checkbox\" checked> Done</li><li><input type=\"checkbox\"> Todo</li></ul><ol start=\"3\"><li><input type=\"checkbox\" checked=\"checked\"> Ordered done</li></ol>","text":"Done\nTodo\nOrdered done"}]} -->

### C-3 pasteMarkdownContent uses a longer code fence when pasted code contains backticks

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent uses a longer code fence when pasted code contains backticks -->

<!-- 阶段 4 改：粘贴代码块后光标在最后一行代码的末尾（编辑器里光标进不了结尾围栏后面） -->

```before
‸
```

操作：粘贴，text = "alpha\n```\nbeta"，html = "<pre><code>alpha\n```\nbeta</code></pre>"

`````after
````
alpha
```
beta‸
````
`````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<pre><code>alpha\n```\nbeta</code></pre>","text":"alpha\n```\nbeta"}]} -->

### C-3 pasteMarkdownContent preserves pasted HTML code language like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves pasted HTML code language like Typora -->

<!-- 阶段 4 改：粘贴代码块后光标在最后一行代码的末尾（编辑器里光标进不了结尾围栏后面） -->

```before
‸
```

操作：粘贴，text = "const answer = 42;"，html = "<pre><code class=\"hljs language-js\">const answer = 42;</code></pre>"

````after
```js
const answer = 42;‸
```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<pre><code class=\"hljs language-js\">const answer = 42;</code></pre>","text":"const answer = 42;"}]} -->

### C-3 pasteMarkdownContent preserves pasted HTML code language like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves pasted HTML code language like Typora -->

<!-- 阶段 4 改：粘贴代码块后光标在最后一行代码的末尾（编辑器里光标进不了结尾围栏后面） -->

```before
‸
```

操作：粘贴，text = "print(\"hi\")"，html = "<pre class=\"language-python\"><code>print(\"hi\")</code></pre>"

````after
```python
print("hi")‸
```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<pre class=\"language-python\"><code>print(\"hi\")</code></pre>","text":"print(\"hi\")"}]} -->

### C-3 pasteMarkdownContent preserves HTML code line breaks like Typora

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent preserves HTML code line breaks like Typora -->

<!-- 阶段 4 改：粘贴代码块后光标在最后一行代码的末尾（编辑器里光标进不了结尾围栏后面） -->

```before
‸
```

操作：粘贴，text = "alpha\n  beta"，html = "<pre><code class=\"language-js\">alpha<br>&nbsp;&nbsp;beta</code></pre>"

````after
```js
alpha
  beta‸
```
````

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<pre><code class=\"language-js\">alpha<br>&nbsp;&nbsp;beta</code></pre>","text":"alpha\n  beta"}]} -->

### C-3 pasteMarkdownContent falls back to plain text paste handling

<!-- 来源：tests/editorCommands.test.ts › pasteMarkdownContent falls back to plain text paste handling -->

```before
read ⟦docs⟧
```

操作：粘贴，text = "https://example.com/docs"，html = "<p>https://example.com/docs</p>"

```after
read ⟦[docs](https://example.com/docs)⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pasteMarkdownContent","args":[{"$state":{}},{"html":"<p>https://example.com/docs</p>","text":"https://example.com/docs"}]} -->

### C-4 pastePlainMarkdownText inserts clipboard text without smart Markdown conversion like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › pastePlainMarkdownText inserts clipboard text without smart Markdown conversion like Typora -->

```before
read ⟦docs⟧
```

操作：粘贴为纯文本，text = "https://example.com/docs"

```after
read https://example.com/docs‸
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pastePlainMarkdownText","args":[{"$state":{}},"https://example.com/docs"]} -->

### C-4 pastePlainMarkdownText inserts clipboard text without smart Markdown conversion like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › pastePlainMarkdownText inserts clipboard text without smart Markdown conversion like Typora -->

```before
before␍
‸after
```

操作：粘贴为纯文本，text = "Name\tAge\nAda\t36"

```after
before␍
Name	Age␍
Ada	36‸after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"pastePlainMarkdownText","args":[{"$state":{}},"Name\tAge\nAda\t36"]} -->

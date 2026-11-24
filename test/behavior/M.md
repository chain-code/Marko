# 图片与媒体（M）的行为规格

格式见同目录的 [README](README.md)。
本文件由 `legacy/extract.mjs` 从旧代码的逻辑测试生成（2026-11-23），之后手工维护。

### M-2 insertMarkdownImageSelection creates editable images like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownImageSelection creates editable images like Typora -->

```before
⟦logo⟧
```

操作：命令 image

```after
![logo](⟦image-path⟧)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownImageSelection","args":[{"$state":{}}]} -->

### M-2 insertMarkdownImageSelection creates editable images like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownImageSelection creates editable images like Typora -->

```before
‸
```

操作：命令 image

```after
![图片描述](⟦image-path⟧)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownImageSelection","args":[{"$state":{}}]} -->

### M-2 insertMarkdownImageSelection creates editable images like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownImageSelection creates editable images like Typora -->

```before
⟦chart [wide]⟧
```

操作：命令 image

```after
![chart \[wide\]](⟦image-path⟧)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownImageSelection","args":[{"$state":{}}]} -->

### M-2 insertMarkdownImageSelection focuses existing image destinations like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownImageSelection focuses existing image destinations like Typora -->

```before
look ![⟦logo⟧](assets/a(b).png "Logo") now
```

操作：命令 image

```after
look ![logo](⟦assets/a(b).png "Logo"⟧) now
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownImageSelection","args":[{"$state":{}}]} -->

### M-2 insertMarkdownImageSelection focuses existing image destinations like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownImageSelection focuses existing image destinations like Typora -->

```before
read [⟦docs⟧](https://example.com)
```

操作：命令 image

```after
read [![docs](⟦image-path⟧)](https://example.com)
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownImageSelection","args":[{"$state":{}}]} -->

### M-5 setImageWidthInLine converts markdown image to sized html image

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine converts markdown image to sized html image -->

```before
‸![logo](assets/logo.png)
```

操作：命令 setImageWidth("480")

```after
⟦<img src="assets/logo.png" alt="logo" width="480px">⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"480"]} -->

### M-5 setImageWidthInLine preserves markdown image title

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine preserves markdown image title -->

```before
‸![logo](<assets/logo large.png> "Logo title")
```

操作：命令 setImageWidth("480")

```after
⟦<img src="assets/logo large.png" alt="logo" width="480px" title="Logo title">⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"480"]} -->

### M-5 setImageWidthInLine preserves an unwrapped image path with spaces

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine preserves an unwrapped image path with spaces -->

```before
‸![logo](assets/my image.png "Image title")
```

操作：命令 setImageWidth("480")

```after
⟦<img src="assets/my image.png" alt="logo" width="480px" title="Image title">⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"480"]} -->

### M-5 setImageWidthInLine handles parenthesized image destinations like Typora

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine handles parenthesized image destinations like Typora -->

```before
before ![logo](assets/‸a(b).png) after
```

操作：命令 setImageWidth("60%")

```after
before ⟦<img src="assets/a(b).png" alt="logo" width="60%">⟧ after
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"60%"]} -->

### M-5 setImageWidthInLine updates the image under the cursor when a line has multiple images

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine updates the image under the cursor when a line has multiple images -->

```before
![one](one.png) and ![two](<assets/‸two(a).png> (Two title))
```

操作：命令 setImageWidth("320")

```after
![one](one.png) and ⟦<img src="assets/two(a).png" alt="two" width="320px" title="Two title">⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"320"]} -->

### M-5 setImageWidthInLine updates existing html image width · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine updates existing html image width -->

```before
<img ‸src="assets/logo.png" alt="logo">
```

操作：命令 setImageWidth("60%")

```after
⟦<img src="assets/logo.png" alt="logo" width="60%">⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"60%"]} -->

### M-5 setImageWidthInLine updates existing html image width · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine updates existing html image width -->

```before
<img ‸src="assets/logo.png" width="320px" alt="logo" />
```

操作：命令 setImageWidth("480")

```after
⟦<img src="assets/logo.png" width="480px" alt="logo" />⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"480"]} -->

### M-5 setImageWidthInLine updates the html image under the cursor like Typora

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine updates the html image under the cursor like Typora -->

```before
<img src="one.png" width="120px"> and <img src="‸two.png" alt="two">
```

操作：命令 setImageWidth("320")

```after
<img src="one.png" width="120px"> and ⟦<img src="two.png" alt="two" width="320px">⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"320"]} -->

### M-5 setImageWidthInLine does not edit an earlier html image when the cursor is on a markdown image

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine does not edit an earlier html image when the cursor is on a markdown image -->

```before
<img src="one.png"> and ![two](‸two.png)
```

操作：命令 setImageWidth("50%")

```after
<img src="one.png"> and ⟦<img src="two.png" alt="two" width="50%">⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"50%"]} -->

### M-5 setImageWidthInLine escapes generated html image attributes

<!-- 来源：tests/editorCommands.test.ts › setImageWidthInLine escapes generated html image attributes -->

```before
‸![a "logo"](assets/a&b.png)
```

操作：命令 setImageWidth("480\"")

```after
⟦<img src="assets/a&amp;b.png" alt="a &quot;logo&quot;" width="480&quot;">⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"setImageWidthInLine","args":[{"$state":{}},"480\""]} -->

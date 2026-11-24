# 表格（T）的行为规格

格式见同目录的 [README](README.md)。
本文件由 `legacy/extract.mjs` 从旧代码的逻辑测试生成（2026-11-23），之后手工维护。

### T-1 insertMarkdownTableTemplate selects the first header cell like Typora

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownTableTemplate selects the first header cell like Typora -->

```before
Intro‸
```

操作：命令 table

```after
Intro
| ⟦列 1⟧ | 列 2 | 列 3 |
| --- | :---: | --- |
| 内容 | 内容 | 内容 |

```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableTemplate","args":[{"$state":{}}]} -->

### T-2 navigateMarkdownTableCell moves across table cells like Typora tab navigation · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell moves across table cells like Typora tab navigation -->

```before
| A | B |
| --- | --- |
| ‸1 | 2 |
```

操作：`Tab`

```after
| A | B |
| --- | --- |
| 1 | ⟦2⟧ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell moves across table cells like Typora tab navigation · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell moves across table cells like Typora tab navigation -->

```before
| A | ‸B |
| --- | --- |
| 1 | 2 |
```

操作：`Tab`

```after
| A | B |
| --- | --- |
| ⟦1⟧ | 2 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell moves across table cells like Typora tab navigation · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell moves across table cells like Typora tab navigation -->

```before
| A | B |
| --- | --- |
| ‸1 | 2 |
```

操作：`Shift+Tab`

```after
| A | ⟦B⟧ |
| --- | --- |
| 1 | 2 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"previous"]} -->

### T-2 navigateMarkdownTableCell moves across table cells like Typora tab navigation · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell moves across table cells like Typora tab navigation -->

```before
| A | B |
| - | :-: |
| ‸1 | 2 |
```

操作：`Tab`

```after
| A | B |
| - | :-: |
| 1 | ⟦2⟧ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell appends a row from the last cell · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell appends a row from the last cell -->

```before
| A | B |
| --- | --- |
| 1 | ‸2 |
```

操作：`Tab`

```after
| A | B |
| --- | --- |
| 1 | 2 |
| ‸ |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell appends a row from the last cell · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell appends a row from the last cell -->

```before
> | A | B |
> | --- | --- |
> | 1 | ‸2 |
```

操作：`Tab`

```after
> | A | B |
> | --- | --- |
> | 1 | 2 |
> | ‸ |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell pads uneven body rows before selecting missing cells

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell pads uneven body rows before selecting missing cells -->

```before
| A | B | C |
| --- | --- | --- |
| 1 | ⟦2⟧ |
```

操作：`Tab`

```after
| A | B | C |
| --- | --- | --- |
| 1 | 2 | ‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell ignores escaped pipes when locating the active column

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell ignores escaped pipes when locating the active column -->

```before
| A | B |
| --- | --- |
| x\|‸y | z |
```

操作：`Tab`

```after
| A | B |
| --- | --- |
| x\|y | ⟦z⟧ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell supports tables without outer pipes · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell supports tables without outer pipes -->

```before
A | B
--- | ---
‸1 | 2
```

操作：`Tab`

```after
A | B
--- | ---
1 | ⟦2⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell supports tables without outer pipes · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell supports tables without outer pipes -->

```before
A | B
--- | ---
‸1 | 2
```

操作：`Shift+Tab`

```after
A | ⟦B⟧
--- | ---
1 | 2
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"previous"]} -->

### T-2 table editing preserves tables without outer pipes like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves tables without outer pipes like Typora -->

<!-- 阶段 4 改：没有两头竖线的表格里新加的空行 ` |  | ` 开头的竖线算行首竖线，第一格在竖线后面 -->

```before
A | B | C
--- | :---: | ---:
1 | 2 | ‸3
```

操作：`Tab`

```after
A | B | C
--- | :---: | ---:
1 | 2 | 3
 | ‸ | 
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell preserves CRLF when padding and appending rows · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell preserves CRLF when padding and appending rows -->

```before
| A | B | C |␍
| --- | --- | --- |␍
| 1 | ⟦2⟧ |␍
| 3 | 4 | 5 |
```

操作：`Tab`

```after
| A | B | C |␍
| --- | --- | --- |␍
| 1 | 2 | ‸ |␍
| 3 | 4 | 5 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-2 navigateMarkdownTableCell preserves CRLF when padding and appending rows · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › navigateMarkdownTableCell preserves CRLF when padding and appending rows -->

```before
| A | B |␍
| --- | --- |␍
| 1 | ‸2 |
```

操作：`Tab`

```after
| A | B |␍
| --- | --- |␍
| 1 | 2 |␍
| ‸ |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"navigateMarkdownTableCell","args":[{"$state":{}},"next"]} -->

### T-3 editMarkdownTable adds rows and columns to the table under cursor · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownTable adds rows and columns to the table under cursor -->

```before
| A | B |
| --- | --- |
| 1 | 2 |‸
```

操作：命令 addTableRow

```after
| A | B |
| --- | --- |
| 1 | 2 |
| 内容 | ⟦内容⟧ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownTable","args":[{"$state":{}},"row"]} -->

### T-3 editMarkdownTable adds rows and columns to the table under cursor · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › editMarkdownTable adds rows and columns to the table under cursor -->

```before
| ‸A | B |
| --- | --- |
| 1 | 2 |
```

操作：命令 addTableColumn

```after
| A | ⟦新列⟧ | B |
| --- | --- | --- |
| 1 | 内容 | 2 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownTable","args":[{"$state":{}},"column"]} -->

### T-3 editMarkdownTable inserts a CRLF table template in CRLF documents

<!-- 来源：tests/editorCommands.test.ts › editMarkdownTable inserts a CRLF table template in CRLF documents -->

```before
Intro␍
‸
```

操作：命令 addTableRow

```after
Intro␍
␍
| ⟦列 1⟧ | 列 2 | 列 3 |␍
| --- | :---: | --- |␍
| 内容 | 内容 | 内容 |␍

```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"editMarkdownTable","args":[{"$state":{}},"row"]} -->

### T-3 insertMarkdownTableRow inserts above or below the current row · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownTableRow inserts above or below the current row -->

```before
| A | B |
| --- | --- |
| 1 | 2 |
| 3 | ‸4 |
```

操作：命令 addTableRowAbove

```after
| A | B |
| --- | --- |
| 1 | 2 |
| 内容 | ⟦内容⟧ |
| 3 | 4 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableRow","args":[{"$state":{}},"above"]} -->

### T-3 insertMarkdownTableRow inserts above or below the current row · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownTableRow inserts above or below the current row -->

```before
| A | B |
| --- | --- |
| ‸1 | 2 |
| 3 | 4 |
```

操作：命令 addTableRowBelow

```after
| A | B |
| --- | --- |
| 1 | 2 |
| ⟦内容⟧ | 内容 |
| 3 | 4 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableRow","args":[{"$state":{}},"below"]} -->

### T-3 insertMarkdownTableRow can create an empty row for the Typora table shortcut

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownTableRow can create an empty row for the Typora table shortcut -->

<!-- 阶段 4 改：插空行是 Ctrl+回车（Typora 的快捷键）；菜单的「下方插入行」填「内容」 -->

```before
| A | B |
| --- | --- |
| 1 | ‸2 |
```

操作：`Ctrl+Enter`

```after
| A | B |
| --- | --- |
| 1 | 2 |
|  | ‸ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableRow","args":[{"$state":{}},"below",""]} -->

### T-3 insertMarkdownTableColumn inserts left or right of the current column · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownTableColumn inserts left or right of the current column -->

```before
| A | ‸B | C |
| --- | :---: | ---: |
| 1 | 2 | 3 |
```

操作：命令 addTableColumnLeft

```after
| A | ⟦新列⟧ | B | C |
| --- | --- | :---: | ---: |
| 1 | 内容 | 2 | 3 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableColumn","args":[{"$state":{}},"left"]} -->

### T-3 insertMarkdownTableColumn inserts left or right of the current column · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › insertMarkdownTableColumn inserts left or right of the current column -->

```before
| A | ‸B | C |
| --- | :---: | ---: |
| 1 | 2 | 3 |
```

操作：命令 addTableColumnRight

```after
| A | B | ⟦新列⟧ | C |
| --- | :---: | --- | ---: |
| 1 | 2 | 内容 | 3 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableColumn","args":[{"$state":{}},"right"]} -->

### T-3 table row commands respect multi-row selections like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › table row commands respect multi-row selections like Typora -->

```before
| A | B |
| --- | --- |
| ⟦1 | 2 |
| 3 | 4⟧ |
| 5 | 6 |
```

操作：命令 addTableRowAbove

```after
| A | B |
| --- | --- |
| ⟦内容⟧ | 内容 |
| 1 | 2 |
| 3 | 4 |
| 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableRow","args":[{"$state":{}},"above"]} -->

### T-3 table row commands respect multi-row selections like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › table row commands respect multi-row selections like Typora -->

```before
| A | B |
| --- | --- |
| ⟦1 | 2 |
| 3 | 4⟧ |
| 5 | 6 |
```

操作：命令 addTableRowBelow

```after
| A | B |
| --- | --- |
| 1 | 2 |
| 3 | 4 |
| ⟦内容⟧ | 内容 |
| 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableRow","args":[{"$state":{}},"below"]} -->

### T-3 table row commands respect multi-row selections like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › table row commands respect multi-row selections like Typora -->

```before
| A | B |
| --- | --- |
| ⟦1 | 2 |
| 3 | 4⟧ |
| 5 | 6 |
```

操作：命令 deleteTableRow

```after
| A | B |
| --- | --- |
| ⟦5⟧ | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"row"]} -->

### T-3 table column commands respect multi-column selections like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › table column commands respect multi-column selections like Typora -->

```before
| A | ⟦B | C⟧ | D |
| --- | :---: | ---: | --- |
| 1 | 2 | 3 | 4 |
```

操作：命令 addTableColumnLeft

```after
| A | ⟦新列⟧ | B | C | D |
| --- | --- | :---: | ---: | --- |
| 1 | 内容 | 2 | 3 | 4 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableColumn","args":[{"$state":{}},"left"]} -->

### T-3 table column commands respect multi-column selections like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › table column commands respect multi-column selections like Typora -->

```before
| A | ⟦B | C⟧ | D |
| --- | :---: | ---: | --- |
| 1 | 2 | 3 | 4 |
```

操作：命令 addTableColumnRight

```after
| A | B | C | ⟦新列⟧ | D |
| --- | :---: | ---: | --- | --- |
| 1 | 2 | 3 | 内容 | 4 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableColumn","args":[{"$state":{}},"right"]} -->

### T-3 table column commands respect multi-column selections like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › table column commands respect multi-column selections like Typora -->

```before
| A | ⟦B | C⟧ | D |
| --- | :---: | ---: | --- |
| 1 | 2 | 3 | 4 |
```

操作：命令 deleteTableColumn

```after
| A | ⟦D⟧ |
| --- | --- |
| 1 | 4 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-3 table editing repairs short separator rows like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › table editing repairs short separator rows like Typora -->

```before
| A | ‸B | C |
| --- |
| 1 | 2 | 3 |
```

操作：命令 addTableColumnRight

```after
| A | B | ⟦新列⟧ | C |
| --- | --- | --- | --- |
| 1 | 2 | 内容 | 3 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableColumn","args":[{"$state":{}},"right"]} -->

### T-3 table editing repairs short separator rows like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › table editing repairs short separator rows like Typora -->

```before
| A | ‸B | C |
| --- |
| 1 | 2 | 3 |
```

操作：命令 deleteTableColumn

```after
| A | ⟦C⟧ |
| --- | --- |
| 1 | 3 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-3 table editing preserves tables without outer pipes like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves tables without outer pipes like Typora -->

```before
A | B | C
--- | :---: | ---:
1 | ‸2 | 3
```

操作：命令 addTableRowBelow

```after
A | B | C
--- | :---: | ---:
1 | 2 | 3
内容 | ⟦内容⟧ | 内容
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableRow","args":[{"$state":{}},"below"]} -->

### T-3 table editing preserves tables without outer pipes like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves tables without outer pipes like Typora -->

```before
A | ‸B | C
--- | :---: | ---:
1 | 2 | 3
```

操作：命令 addTableColumnRight

```after
A | B | ⟦新列⟧ | C
--- | :---: | --- | ---:
1 | 2 | 内容 | 3
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableColumn","args":[{"$state":{}},"right"]} -->

### T-3 table editing preserves tables without outer pipes like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves tables without outer pipes like Typora -->

```before
A | ‸B | C
--- | :---: | ---:
1 | 2 | 3
```

操作：命令 deleteTableColumn

```after
A | ⟦C⟧
--- | ---:
1 | 3
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-3 table editing commands preserve CRLF line endings like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › table editing commands preserve CRLF line endings like Typora -->

```before
| A | B | C |␍
| --- | :---: | ---: |␍
| 1 | 2 | 3 |␍
| 4 | ‸5 | 6 |
```

操作：命令 addTableRowAbove

```after
| A | B | C |␍
| --- | :---: | ---: |␍
| 1 | 2 | 3 |␍
| 内容 | ⟦内容⟧ | 内容 |␍
| 4 | 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableRow","args":[{"$state":{}},"above"]} -->

### T-3 table editing commands preserve CRLF line endings like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › table editing commands preserve CRLF line endings like Typora -->

```before
| A | ‸B | C |␍
| --- | :---: | ---: |␍
| 1 | 2 | 3 |␍
| 4 | 5 | 6 |
```

操作：命令 addTableColumnRight

```after
| A | B | ⟦新列⟧ | C |␍
| --- | :---: | --- | ---: |␍
| 1 | 2 | 内容 | 3 |␍
| 4 | 5 | 内容 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableColumn","args":[{"$state":{}},"right"]} -->

### T-3 table editing commands preserve CRLF line endings like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › table editing commands preserve CRLF line endings like Typora -->

```before
| A | ‸B | C |␍
| --- | :---: | ---: |␍
| 1 | 2 | 3 |␍
| 4 | 5 | 6 |
```

操作：命令 deleteTableColumn

```after
| A | ⟦C⟧ |␍
| --- | ---: |␍
| 1 | 3 |␍
| 4 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-3 deleteMarkdownTablePart deletes the current table row

<!-- 来源：tests/editorCommands.test.ts › deleteMarkdownTablePart deletes the current table row -->

```before
| A | B |
| --- | --- |
| 1 | ‸2 |
| 3 | 4 |
```

操作：命令 deleteTableRow

```after
| A | B |
| --- | --- |
| 3 | ⟦4⟧ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"row"]} -->

### T-3 deleteMarkdownTablePart deletes the current table column

<!-- 来源：tests/editorCommands.test.ts › deleteMarkdownTablePart deletes the current table column -->

```before
| A | ‸B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
```

操作：命令 deleteTableColumn

```after
| A | ⟦C⟧ |
| --- | --- |
| 1 | 3 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-3 moveMarkdownTableRow moves body rows without crossing the separator · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownTableRow moves body rows without crossing the separator -->

```before
| A | B |
| --- | --- |
| 1 | 2 |
| 3 | ‸4 |
| 5 | 6 |
```

操作：命令 moveTableRowUp

```after
| A | B |
| --- | --- |
| 3 | ⟦4⟧ |
| 1 | 2 |
| 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownTableRow","args":[{"$state":{}},"up"]} -->

### T-3 moveMarkdownTableRow moves body rows without crossing the separator · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownTableRow moves body rows without crossing the separator -->

```before
| A | B |
| --- | --- |
| 1 | ‸2 |
| 3 | 4 |
| 5 | 6 |
```

操作：命令 moveTableRowDown

```after
| A | B |
| --- | --- |
| 3 | 4 |
| 1 | ⟦2⟧ |
| 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownTableRow","args":[{"$state":{}},"down"]} -->

### T-3 moveMarkdownTableRow moves selected row blocks and preserves CRLF

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownTableRow moves selected row blocks and preserves CRLF -->

```before
| A | B |␍
| --- | --- |␍
| 1 | 2 |␍
⟦| 3 | 4 |␍
⟧| 5 | 6 |
```

操作：命令 moveTableRowDown

```after
| A | B |␍
| --- | --- |␍
| 1 | 2 |␍
| 5 | 6 |␍
| ⟦3⟧ | 4 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownTableRow","args":[{"$state":{}},"down"]} -->

### T-3 moveMarkdownTableColumn moves table columns and keeps alignment rows · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownTableColumn moves table columns and keeps alignment rows -->

```before
| A | B | ‸C |
| --- | :---: | ---: |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
```

操作：命令 moveTableColumnLeft

```after
| A | ⟦C⟧ | B |
| --- | ---: | :---: |
| 1 | 3 | 2 |
| 4 | 6 | 5 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownTableColumn","args":[{"$state":{}},"left"]} -->

### T-3 moveMarkdownTableColumn moves table columns and keeps alignment rows · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownTableColumn moves table columns and keeps alignment rows -->

```before
| ‸A | B | C |
| --- | :---: | ---: |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
```

操作：命令 moveTableColumnRight

```after
| B | ⟦A⟧ | C |
| :---: | --- | ---: |
| 2 | 1 | 3 |
| 5 | 4 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownTableColumn","args":[{"$state":{}},"right"]} -->

### T-3 moveMarkdownTableColumn moves selected column blocks in quoted CRLF tables

<!-- 来源：tests/editorCommands.test.ts › moveMarkdownTableColumn moves selected column blocks in quoted CRLF tables -->

```before
> | A | ⟦B | C⟧ | D |␍
> | --- | --- | --- | --- |␍
> | 1 | 2 | 3 | 4 |
```

操作：命令 moveTableColumnRight

```after
> | A | D | ⟦B⟧ | C |␍
> | --- | --- | --- | --- |␍
> | 1 | 4 | 2 | 3 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"moveMarkdownTableColumn","args":[{"$state":{}},"right"]} -->

### T-3 deleteMarkdownTable removes the current table and keeps surrounding text

<!-- 来源：tests/editorCommands.test.ts › deleteMarkdownTable removes the current table and keeps surrounding text -->

```before
Intro
| A | ‸B |
| --- | --- |
| 1 | 2 |
Outro
```

操作：命令 deleteTable

```after
Intro
‸Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTable","args":[{"$state":{}}]} -->

### T-3 deleteMarkdownTable preserves CRLF and ignores non-table pipes

<!-- 来源：tests/editorCommands.test.ts › deleteMarkdownTable preserves CRLF and ignores non-table pipes -->

```before
Intro | text␍
| A | ‸B |␍
| --- | --- |␍
| 1 | 2 |␍
Outro
```

操作：命令 deleteTable

```after
Intro | text␍
‸Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTable","args":[{"$state":{}}]} -->

### T-3 table editing keeps adjacent pipe paragraphs outside the table

<!-- 来源：tests/editorCommands.test.ts › table editing keeps adjacent pipe paragraphs outside the table -->

```before
Intro | text
| A | ‸B |
| --- | --- |
| 1 | 2 |
```

操作：命令 deleteTableColumn

```after
Intro | text
| ⟦A⟧ |
| --- |
| 1 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-3 deleteMarkdownTablePart pads uneven rows before deleting a column

<!-- 来源：tests/editorCommands.test.ts › deleteMarkdownTablePart pads uneven rows before deleting a column -->

```before
| A | ‸B | C |
| --- | --- | --- |
| 1 | 2 |
```

操作：命令 deleteTableColumn

```after
| A | ⟦C⟧ |
| --- | --- |
| 1 |  |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-3 table editing respects escaped pipe characters · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › table editing respects escaped pipe characters -->

```before
| A\|B | ‸C |
| --- | --- |
| x\|y | z |
```

操作：命令 deleteTableColumn

```after
| ⟦A\|B⟧ |
| --- |
| x\|y |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-3 table editing preserves blockquote prefixes like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves blockquote prefixes like Typora -->

```before
> | A | B | C |
> | --- | :---: | ---: |
> | 1 | 2 | 3 |
> | 4 | ‸5 | 6 |
```

操作：命令 addTableRowAbove

```after
> | A | B | C |
> | --- | :---: | ---: |
> | 1 | 2 | 3 |
> | 内容 | ⟦内容⟧ | 内容 |
> | 4 | 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableRow","args":[{"$state":{}},"above"]} -->

### T-3 table editing preserves blockquote prefixes like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves blockquote prefixes like Typora -->

```before
> | A | ‸B | C |
> | --- | :---: | ---: |
> | 1 | 2 | 3 |
> | 4 | 5 | 6 |
```

操作：命令 addTableColumnRight

```after
> | A | B | ⟦新列⟧ | C |
> | --- | :---: | --- | ---: |
> | 1 | 2 | 内容 | 3 |
> | 4 | 5 | 内容 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"insertMarkdownTableColumn","args":[{"$state":{}},"right"]} -->

### T-3 table editing preserves blockquote prefixes like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves blockquote prefixes like Typora -->

```before
> | A | B | C |
> | --- | :---: | ---: |
> | 1 | ‸2 | 3 |
> | 4 | 5 | 6 |
```

操作：命令 deleteTableRow

```after
> | A | B | C |
> | --- | :---: | ---: |
> | 4 | ⟦5⟧ | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"row"]} -->

### T-3 table editing preserves blockquote prefixes like Typora · 第 5 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves blockquote prefixes like Typora -->

```before
> | A | ‸B | C |
> | --- | :---: | ---: |
> | 1 | 2 | 3 |
> | 4 | 5 | 6 |
```

操作：命令 deleteTableColumn

```after
> | A | ⟦C⟧ |
> | --- | ---: |
> | 1 | 3 |
> | 4 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"deleteMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-4 table column commands respect multi-column selections like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › table column commands respect multi-column selections like Typora -->

```before
| A | ⟦B | C⟧ | D |
| --- | :---: | ---: | --- |
| 1 | 2 | 3 | 4 |
```

操作：命令 alignCenter

```after
| A | ⟦B | C⟧ | D |
| --- | :---: | :---: | --- |
| 1 | 2 | 3 | 4 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"alignMarkdownTable","args":[{"$state":{}},"center"]} -->

### T-4 alignMarkdownTable edits the current table column separator

<!-- 来源：tests/editorCommands.test.ts › alignMarkdownTable edits the current table column separator -->

```before
| A | ‸B |
| --- | --- |
| 1 | 2 |
```

操作：命令 alignCenter

```after
| A | ‸B |
| --- | :---: |
| 1 | 2 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"alignMarkdownTable","args":[{"$state":{}},"center"]} -->

### T-4 table editing repairs short separator rows like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › table editing repairs short separator rows like Typora -->

```before
| A | B | ‸C |
| --- |
| 1 | 2 | 3 |
```

操作：命令 alignRight

```after
| A | B | ‸C |
| --- | --- | ---: |
| 1 | 2 | 3 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"alignMarkdownTable","args":[{"$state":{}},"right"]} -->

### T-4 table editing preserves tables without outer pipes like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves tables without outer pipes like Typora -->

```before
A | B | ‸C
--- | :---: | ---:
1 | 2 | 3
```

操作：命令 alignLeft

```after
A | B | ‸C
--- | :---: | :---
1 | 2 | 3
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"alignMarkdownTable","args":[{"$state":{}},"left"]} -->

### T-4 table editing commands preserve CRLF line endings like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › table editing commands preserve CRLF line endings like Typora -->

```before
| A | B | ‸C |␍
| --- | :---: | ---: |␍
| 1 | 2 | 3 |␍
| 4 | 5 | 6 |
```

操作：命令 alignLeft

```after
| A | B | ‸C |␍
| --- | :---: | :--- |␍
| 1 | 2 | 3 |␍
| 4 | 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"alignMarkdownTable","args":[{"$state":{}},"left"]} -->

### T-4 table editing respects escaped pipe characters · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › table editing respects escaped pipe characters -->

```before
| ‸A\|B |
| --- |
| x\|y |
```

操作：命令 alignRight

```after
| ‸A\|B |
| ---: |
| x\|y |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"alignMarkdownTable","args":[{"$state":{}},"right"]} -->

### T-4 table editing preserves blockquote prefixes like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › table editing preserves blockquote prefixes like Typora -->

```before
> | A | B | ‸C |
> | --- | :---: | ---: |
> | 1 | 2 | 3 |
> | 4 | 5 | 6 |
```

操作：命令 alignLeft

```after
> | A | B | ‸C |
> | --- | :---: | :--- |
> | 1 | 2 | 3 |
> | 4 | 5 | 6 |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"alignMarkdownTable","args":[{"$state":{}},"left"]} -->

### T-5 selectMarkdownTablePart selects table cell, row, column, and table like Typora · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › selectMarkdownTablePart selects table cell, row, column, and table like Typora -->

```before
Intro
| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | ‸5 | 6 |
Outro
```

操作：命令 selectTableCell

```after
Intro
| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | ⟦5⟧ | 6 |
Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectMarkdownTablePart","args":[{"$state":{}},"cell"]} -->

### T-5 selectMarkdownTablePart selects table cell, row, column, and table like Typora · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › selectMarkdownTablePart selects table cell, row, column, and table like Typora -->

<!-- 阶段 4 改：选中表格的一行：编辑器里是这一行单元格的选区（从第一格内容到最后一格内容），不含两头的竖线 -->

```before
Intro
| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | ‸5 | 6 |
Outro
```

操作：命令 selectTableRow

```after
Intro
| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| ⟦4 | 5 | 6⟧ |
Outro
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectMarkdownTablePart","args":[{"$state":{}},"row"]} -->

### T-5 selectMarkdownTablePart selects table cell, row, column, and table like Typora · 第 3 步

<!-- 来源：tests/editorCommands.test.ts › selectMarkdownTablePart selects table cell, row, column, and table like Typora -->

<!-- 阶段 4 改：选择列是单元格选区（prosemirror-tables）：从选区两端所在的列扩到整列（B、C 两列），读成源码从第一格的内容到最后一格的内容；`Outro` 紧跟在表格最后一行下面，按 GFM 是表格的一行（只有第一格，其余补空格子），所以到这一行 -->

```before
Intro
| A | ⟦B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6⟧ |
Outro
```

操作：命令 selectTableColumn

```after
Intro
| A | ⟦B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
Outro⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectMarkdownTablePart","args":[{"$state":{}},"column"]} -->

### T-5 selectMarkdownTablePart selects table cell, row, column, and table like Typora · 第 4 步

<!-- 来源：tests/editorCommands.test.ts › selectMarkdownTablePart selects table cell, row, column, and table like Typora -->

<!-- 阶段 4 改：选中整个表格：编辑器里是全部单元格的选区（读成源码从第一格的内容到最后一格的内容）；`Outro` 紧跟在表格最后一行下面，按 GFM 是表格的一行（只有第一格，其余补空格子），所以到这一行 -->

```before
Intro
| A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | ‸5 | 6 |
Outro
```

操作：命令 selectTable

```after
Intro
| ⟦A | B | C |
| --- | --- | --- |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
Outro⟧
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectMarkdownTablePart","args":[{"$state":{}},"table"]} -->

### T-5 selectMarkdownTablePart preserves quoted and CRLF table ranges · 第 1 步

<!-- 来源：tests/editorCommands.test.ts › selectMarkdownTablePart preserves quoted and CRLF table ranges -->

<!-- 阶段 4 改：选中表格的一行：编辑器里是这一行单元格的选区（从第一格内容到最后一格内容），不含两头的竖线 -->

```before
> | A | B |␍
> | --- | --- |␍
> | 1 | 2 |␍
> | 3 | ‸4 |
```

操作：命令 selectTableRow

```after
> | A | B |␍
> | --- | --- |␍
> | 1 | 2 |␍
> | ⟦3 | 4⟧ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectMarkdownTablePart","args":[{"$state":{}},"row"]} -->

### T-5 selectMarkdownTablePart preserves quoted and CRLF table ranges · 第 2 步

<!-- 来源：tests/editorCommands.test.ts › selectMarkdownTablePart preserves quoted and CRLF table ranges -->

<!-- 阶段 4 改：选中整个表格：编辑器里是全部单元格的选区（从第一格内容到最后一格内容） -->

```before
> | A | B |␍
> | --- | --- |␍
> | 1 | 2 |␍
> | 3 | ‸4 |
```

操作：命令 selectTable

```after
> | ⟦A | B |␍
> | --- | --- |␍
> | 1 | 2 |␍
> | 3 | 4⟧ |
```

<!-- 旧代码：{"module":"src/utils/editorCommands","fn":"selectMarkdownTablePart","args":[{"$state":{}},"table"]} -->

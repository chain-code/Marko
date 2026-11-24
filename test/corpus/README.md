# 无损语料

`docs/重构计划.md` E-1 的验收语料：阶段 2 起，每个例子和每份文档都要「解析 → 序列化」逐字节不变；1.5.5 的不变式也在这些语料上做随机编辑测试。

## 文件

| 文件 | 内容 | 来源 |
|---|---|---|
| `commonmark-0.31.2.json` | CommonMark 规范的 652 个例子：`markdown`、`html`、`example`、`section` | <https://spec.commonmark.org/0.31.2/spec.json>，原样保存 |
| `gfm-0.29.json` | GitHub Flavored Markdown 规范的 672 个例子，字段同上，扩展语法的例子多一个 `extension`（`table`、`strikethrough`、`autolink`、`tagfilter`、`disabled`） | <https://raw.githubusercontent.com/github/cmark-gfm/master/test/spec.txt>，取出例子转成 JSON，例子里的 `→` 换回制表符 |
| `documents/*.md` | 仓库里的真实文档：两份 README、TODO、1.1.0 的发布说明、重构计划、内置示例文档（`src/data/sampleDocument.ts`） | 2026-11-23 的快照，逐字节复制 |
| `documents/*.md`（其余 9 份） | 造的真实文档：中文长文（`long-chinese-article`）、表格多的（`table-heavy`）、公式多的（`math-heavy`）、图表多的（`diagram-heavy`）、CRLF 和 LF 混用并带行尾空格和制表符、最后一行没有换行（`mixed-line-endings`）、带 BOM 的 CRLF（`bom-crlf`）、深层嵌套和懒惰续行（`nested-structures`）、Front Matter + Callout + HTML + 引用定义 + 缩写 + 定义列表（`technical-notes`）、各种边界写法（`edge-cases`） | 2026-11-23 造，字节精确 |

- 两份规范以 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 发布，版权归 John MacFarlane（CommonMark）和 GitHub, Inc.（GFM），这里只作测试数据，未作修改（GFM 只换了存储格式）。
- 整个目录在 `.gitattributes` 里设了 `-text`，git 不改换行符；不要用会改行尾空格、换行符的编辑器保存这里的文件。

## 增补

- 以后遇到解析、序列化出错的文档，把最小的复现放进 `documents/`。

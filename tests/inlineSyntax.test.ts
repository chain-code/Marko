import test from "node:test";
import assert from "node:assert/strict";
import {
  collectFootnoteReferenceSyntax,
  collectInlineHtmlMarkupRanges,
  collectInlineHtmlSyntax,
  collectInlineMarkdownSyntax,
  collectInlineMathSyntax,
} from "../src/utils/inlineSyntax";

test("collectInlineMarkdownSyntax keeps rendered links editable as source", () => {
  const source = "Before [docs](https://example.com) and [guide][guide].";

  assert.deepEqual(collectInlineMarkdownSyntax(source), [
    {
      type: "link",
      start: 7,
      end: 34,
      raw: "[docs](https://example.com)",
      label: "docs",
    },
    {
      type: "link",
      start: 39,
      end: 53,
      raw: "[guide][guide]",
      label: "guide",
    },
  ]);
});

test("collectInlineMarkdownSyntax includes the image marker and destination", () => {
  const source = "![Marko](assets/icon.png \"icon\")";

  assert.deepEqual(collectInlineMarkdownSyntax(source), [
    {
      type: "image",
      start: 0,
      end: source.length,
      raw: source,
      label: "Marko",
    },
  ]);
});

test("collectInlineMarkdownSyntax keeps complete Typora space destinations", () => {
  const link = '[链接](foo bar "说明")';
  const image = "![图](assets/my image.png)";
  const source = `${link} ${image}`;

  assert.deepEqual(collectInlineMarkdownSyntax(source), [
    {
      type: "link",
      start: 0,
      end: link.length,
      raw: link,
      label: "链接",
    },
    {
      type: "image",
      start: link.length + 1,
      end: source.length,
      raw: image,
      label: "图",
    },
  ]);
});

test("collectInlineMarkdownSyntax exposes an image nested inside a link", () => {
  const source = "[![Preview](assets/preview.png)](https://example.com)";
  const syntax = collectInlineMarkdownSyntax(source);

  assert.deepEqual(syntax.map((item) => ({ type: item.type, raw: item.raw })), [
    { type: "link", raw: source },
    { type: "image", raw: "![Preview](assets/preview.png)" },
  ]);
});

test("collectInlineMarkdownSyntax ignores malformed syntax", () => {
  assert.deepEqual(collectInlineMarkdownSyntax("[missing](url and plain [text"), []);
});

test("collectInlineMarkdownSyntax 忽略行内代码中的链接和图片", () => {
  const source = [
    "`[code link](https://example.com/code) ![code image](code.png)`",
    "``![double marker](double.png)``",
    "[visible link](https://example.com) ![visible image](visible.png)",
  ].join(" ");

  assert.deepEqual(collectInlineMarkdownSyntax(source).map((item) => ({ type: item.type, raw: item.raw })), [
    { type: "link", raw: "[visible link](https://example.com)" },
    { type: "image", raw: "![visible image](visible.png)" },
  ]);
});

test("collectInlineMarkdownSyntax 不把链接标签代码中的图片作为嵌套图片", () => {
  const source = "[预览 `![示例](code.png)`](https://example.com)";

  assert.deepEqual(collectInlineMarkdownSyntax(source).map((item) => ({ type: item.type, raw: item.raw })), [
    { type: "link", raw: source },
  ]);
});

test("collectInlineMathSyntax 仅识别正文公式并排除金额、转义、代码和链接目标", () => {
  const source = [
    "Price $5 and $6, math $5$ and \\(a+b\\).",
    "Money $5 and $10 or $5 and$10, escaped math $x=\\$5$.",
    "`$code$` [link](https://example.com/$path$) ![image](assets/$name$.png) \\$escaped$.",
  ].join("\n");

  assert.deepEqual(collectInlineMathSyntax(source).map((item) => item.raw), [
    "$5$",
    "\\(a+b\\)",
    "$x=\\$5$",
  ]);
});

test("collectInlineMathSyntax 识别链接标签、普通方括号和跨软换行公式", () => {
  const source = [
    "[链接 $x$](https://example.com)",
    "普通 [$y$]",
    "$a +",
    "b$",
  ].join("\n");

  assert.deepEqual(
    collectInlineMathSyntax(source, { includeLinkLabels: true }).map((item) => item.raw),
    ["$x$", "$y$", "$a +\nb$"],
  );
});

test("collectInlineMathSyntax 保留引用与列表软换行范围并清理容器前缀", () => {
  const source = [
    "> $q +",
    "> r$",
    "",
    "- $l +",
    "  m$",
  ].join("\n");
  const math = collectInlineMathSyntax(source, { includeLinkLabels: true });

  assert.deepEqual(math.map((item) => item.raw), ["$q +\n> r$", "$l +\n  m$"]);
});

test("collectFootnoteReferenceSyntax 保留重复引用并忽略定义和代码", () => {
  const source = "正文[^note]和再次引用[^note]。\n\n[^note]: 内容\n\n`[^code]`";
  const references = collectFootnoteReferenceSyntax(source);

  assert.deepEqual(references.map((item) => item.id), ["note", "note"]);
  assert.deepEqual(references.map((item) => item.raw), ["[^note]", "[^note]"]);
});

test("collectFootnoteReferenceSyntax ignores quoted definition labels", () => {
  const source = [
    "> Text[^note]",
    ">",
    "> [^note]: First",
    ">     Continued",
  ].join("\n");
  const references = collectFootnoteReferenceSyntax(source);

  assert.deepEqual(references.map((item) => item.id), ["note"]);
});

test("collectFootnoteReferenceSyntax ignores list-contained definition labels", () => {
  assert.deepEqual(collectFootnoteReferenceSyntax("- [^n]: note"), []);
  assert.deepEqual(collectFootnoteReferenceSyntax("> - [^n]: note"), []);
  assert.deepEqual(
    collectFootnoteReferenceSyntax("- text[^n]").map((item) => item.id),
    ["n"],
  );
});

test("collectFootnoteReferenceSyntax supports spaced Unicode labels and protects literals", () => {
  const source = [
    '正文[^中文 note] `[^code note]` <span title="[^html note]">内容</span>',
    "> - [^中文 note]: 定义",
  ].join("\r\n");

  assert.deepEqual(collectFootnoteReferenceSyntax(source).map(({ id, raw }) => ({ id, raw })), [
    { id: "中文 note", raw: "[^中文 note]" },
  ]);
});

test("collectInlineHtmlSyntax 识别常见行内标签和空元素", () => {
  const source = "按 <kbd>Ctrl</kbd> + <kbd>S</kbd><br> 保存。";

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [
    "<kbd>Ctrl</kbd>",
    "<kbd>S</kbd>",
    "<br>",
  ]);
});

test("collectInlineHtmlSyntax 忽略行内代码中的成对标签和空元素", () => {
  const source = [
    "`<kbd>Code</kbd><br>`",
    "``<mark>Double</mark><img src=\"code.png\">``",
    "<kbd>Visible</kbd><br>",
  ].join(" ");

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [
    "<kbd>Visible</kbd>",
    "<br>",
  ]);
});

test("collectInlineHtmlSyntax 识别带合法属性的常见成对标签", () => {
  const html = [
    "<a href=\"https://example.com?q=1&amp;x=2\" title=\"1 > 0\" data-id=42 aria-label='详情'>",
    "链接 <span class=\"outer\">外层 <span data-depth=2>内层</span> 结尾</span>",
    "</a>",
  ].join("");
  const source = `前文 ${html} 后文`;

  assert.deepEqual(collectInlineHtmlSyntax(source), [{
    type: "html",
    start: 3,
    end: 3 + html.length,
    raw: html,
  }]);
});

test("collectInlineHtmlSyntax 正确匹配同名嵌套和大小写标签", () => {
  const source = "<SPAN>外层 <span>内层</span> 结尾</span> <u>下划线</U>";

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [
    "<SPAN>外层 <span>内层</span> 结尾</span>",
    "<u>下划线</U>",
  ]);
});

test("collectInlineHtmlSyntax 识别 iframe、video、void 和自闭合标签", () => {
  const source = [
    "<iframe src=\"about:blank\" title=\"预览\"></iframe>",
    "<video src='demo.mp4' controls></video>",
    "<video controls preload=\"metadata\"><source src='demo.mp4'>视频回退文本</video>",
    "<input type=checkbox checked>",
    "<source src='demo.mp4'>",
    "<custom-view data-label=\"a > b\"/>",
  ].join(" ");

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [
    "<iframe src=\"about:blank\" title=\"预览\"></iframe>",
    "<video src='demo.mp4' controls></video>",
    "<video controls preload=\"metadata\"><source src='demo.mp4'>视频回退文本</video>",
    "<input type=checkbox checked>",
    "<source src='demo.mp4'>",
    "<custom-view data-label=\"a > b\"/>",
  ]);
});

test("collectInlineHtmlSyntax 识别注释且不重复返回其中的标签", () => {
  const comment = "<!-- 隐藏 <span>内容</span> -->";
  const multilineComment = "<!-- 多行\n<img src=\"hidden.png\">\n内容 -->";
  const crossBoundaryComment = "<!-- 多行\n<span> --> 正文 </span>";
  const source = `${comment} <mark>显示</mark>\n${multilineComment}\n${crossBoundaryComment}`;

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [
    comment,
    "<mark>显示</mark>",
    multilineComment,
    "<!-- 多行\n<span> -->",
  ]);
});

test("collectInlineHtmlSyntax 忽略非法属性、自动链接和转义标签", () => {
  const source = [
    "<https://example.com>",
    "<user@example.com>",
    "<span bad=>内容</span>",
    "<span title=\"未闭合>内容</span>",
    "\\<kbd>转义</kbd>",
  ].join(" ");

  assert.deepEqual(collectInlineHtmlSyntax(source), []);
});

test("collectInlineHtmlSyntax 忽略多行及不同长度代码跨度中的 HTML", () => {
  const source = [
    "``代码",
    "<iframe src=\"about:blank\"></iframe>",
    "``",
    "`外层 `` <u>代码</u> `` 结尾` <u>显示</u>",
  ].join("\n");

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [
    "<u>显示</u>",
  ]);
});

test("collectInlineHtmlSyntax 对嵌套元素仅返回最外层完整片段", () => {
  const source = "<span>文字<br><!-- 注释 --><strong>加粗</strong></span>";

  assert.deepEqual(collectInlineHtmlSyntax(source).map((item) => item.raw), [source]);
});

test("collectInlineHtmlMarkupRanges 仅保护标签 markup", () => {
  const source = '<span title="$attr$ [^n] [x](/attr.md)">$body$ [^n] [x](/body.md)</span>';
  assert.deepEqual(
    collectInlineHtmlMarkupRanges(source).map((range) => source.slice(range.start, range.end)),
    ['<span title="$attr$ [^n] [x](/attr.md)">', "</span>"],
  );
  assert.deepEqual(collectInlineMathSyntax(source).map((item) => item.raw), ["$body$"]);
  assert.deepEqual(collectFootnoteReferenceSyntax(source).map((item) => item.raw), ["[^n]"]);
  assert.deepEqual(collectInlineMarkdownSyntax(source).map((item) => item.raw), ["[^n]", "[x](/body.md)"]);
});

test("collectInlineHtmlMarkupRanges 忽略代码跨度和转义标签", () => {
  const source = '`<b title="$code$">` \\<i>$escaped$</i> <u>$body$</u>';
  assert.deepEqual(
    collectInlineHtmlMarkupRanges(source).map((range) => source.slice(range.start, range.end)),
    ["</i>", "<u>", "</u>"],
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  createOutline,
  getEmojiShortcodeMatches,
  getEmojiSuggestions,
  getMarkdownAutoLinkMatches,
  getMarkdownFootnoteSummary,
  hasMarkdownFootnoteDefinition,
  renderMarkdown,
  renderMarkdownInline,
  renderMarkdownTableCells,
  renderSmartPunctuationText,
} from "../src/utils/markdown";
import { defaultEditorSettings } from "../src/utils/editorSettings";
import type { EditorSettings } from "../src/types";

const settings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

test("renderMarkdown renders inline and block math with MathJax SVG", () => {
  const html = renderMarkdown("Inline $a^2+b^2=c^2$.\n\n$$\n\\frac{1}{2}\n$$", {
    settings,
  });

  assert.match(html, /math-inline/);
  assert.match(html, /math-block/);
  assert.match(html, /<mjx-container class="MathJax" jax="SVG"/);
});

test("renderMarkdown renders Typora tagged math fences in root, quote and list containers", () => {
  const source = [
    "$$ {root tag}",
    "x = 1",
    "$$ {root close}",
    "",
    "> $$ {{quote tag}}",
    "> y = 2",
    "> $$ {quote close}",
    "",
    "- nested math",
    "  $$ {list tag}",
    "  z = 3",
    "  $$ {list close}",
  ].join("\n");
  const html = renderMarkdown(source, { settings });

  assert.equal(html.match(/class="math-block"/g)?.length, 3);
  assert.equal(html.match(/<mjx-container class="MathJax" jax="SVG"/g)?.length, 3);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<ul>/);
  assert.doesNotMatch(html, /root tag|root close|quote tag|quote close|list tag|list close/);
});

test("renderMarkdown preserves invalid tagged math openings as text", () => {
  for (const opening of ["$$ {}", "$$ {tag", "$$ {tag} ", "$$ {tag} trailing", "$$ tag"]) {
    const html = renderMarkdown(`${opening}\nx = 1\n$$`, { settings });
    assert.doesNotMatch(html, /class="math-block"|<mjx-container/, opening);
  }
});

test("renderMarkdown displays closed GitLab math fences like Typora", () => {
  const source = [
    "```math",
    "\\mathbf{V}_1 \\times \\mathbf{V}_2 = x^2 + y^2",
    "```",
    "",
    "> ~~~MATH",
    "> q = 2",
    "> ~~~",
    "",
    "- item",
    "  ```math",
    "  r = 3",
    "  ```",
  ].join("\n");
  const html = renderMarkdown(source, { settings });

  assert.equal(html.match(/math-block/g)?.length, 3);
  assert.equal(html.match(/<mjx-container class="MathJax" jax="SVG"/g)?.length, 3);
  assert.doesNotMatch(html, /language-math|<pre><code/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<ul>/);
});

test("renderMarkdown keeps GitLab math fences as code when math is disabled or unclosed", () => {
  const disabled = renderMarkdown("```math\nx + y\n```", {
    settings: {
      ...settings,
      extensions: { ...settings.extensions, math: false },
    },
  });
  const unclosed = renderMarkdown("```math\nx + y", { settings });

  assert.doesNotMatch(disabled, /math-block|<mjx-container/);
  assert.match(disabled, /<pre><code class="hljs(?: language-math)?">x \+ y/);
  assert.doesNotMatch(unclosed, /math-block|<mjx-container/);
  assert.match(unclosed, /<pre><code class="hljs(?: language-math)?">x \+ y/);
});

test("renderMarkdown applies code line number preference", () => {
  const enabled = renderMarkdown("```ts\nconst a = 1;\nconst b = 2;\n```", {
    settings: { ...settings, codeLineNumbers: true },
  });
  const disabled = renderMarkdown("```ts\nconst a = 1;\n```", { settings });

  assert.match(enabled, /<pre class="code-with-line-numbers" data-line-numbers="1&#10;2">/);
  assert.doesNotMatch(disabled, /code-with-line-numbers/);
});

test("renderMarkdown applies auto-link, smart punctuation and line break preferences", () => {
  const disabled = {
    ...settings,
    smartPunctuation: false,
    smartQuotes: false,
    smartDashes: false,
    preserveSingleLineBreaks: false,
    extensions: { ...settings.extensions, autoLinks: false },
  };
  const enabled = {
    ...settings,
    smartPunctuation: true,
    smartQuotes: true,
    smartDashes: true,
    preserveSingleLineBreaks: true,
    extensions: { ...settings.extensions, autoLinks: true },
  };

  const plain = renderMarkdown('"hello" -- https://example.com\nnext', { settings: disabled });
  const rich = renderMarkdown('"hello" -- https://example.com\nnext', { settings: enabled });
  assert.doesNotMatch(plain, /href="https:\/\/example\.com"/);
  assert.doesNotMatch(plain, /<br>/);
  assert.match(rich, /href="https:\/\/example\.com"/);
  assert.match(rich, /<br>/);
  assert.match(rich, /“hello”/);
});

test("renderMarkdown folds Typora angle autolinks and honors the auto-link switch", () => {
  const source = [
    "<www.google.com>",
    "<https://example.com/path>",
    "<C:/docs/a.md>",
    "<obsidian://open?vault=docs>",
    "<javascript:alert(1)>",
  ].join(" ");
  const enabled = renderMarkdown(source, {
    settings,
    preserveSourceTokens: true,
  });
  const disabled = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: { ...settings.extensions, autoLinks: false },
    },
  });

  assert.match(enabled, /href="http:\/\/www\.google\.com"/);
  assert.match(enabled, /data-marko-inline-markdown="&lt;www\.google\.com&gt;"/);
  assert.match(enabled, /href="https:\/\/example\.com\/path"/);
  assert.match(enabled, /href="C:\/docs\/a\.md"/);
  assert.match(enabled, /href="obsidian:\/\/open\?vault=docs"/);
  assert.doesNotMatch(enabled, /href="javascript:/);
  assert.match(enabled, />www\.google\.com<\/a>/);

  assert.doesNotMatch(disabled, /<a /);
  assert.match(disabled, /&lt;www\.google\.com&gt;/);
  assert.match(disabled, /&lt;https:\/\/example\.com\/path&gt;/);
});

test("getMarkdownAutoLinkMatches includes angle markers in the reveal range", () => {
  const source = "前 <www.google.com> 后";
  const match = getMarkdownAutoLinkMatches(source)[0];

  assert.deepEqual(match, {
    start: 2,
    end: 18,
    textStart: 3,
    textEnd: 17,
    text: "www.google.com",
    href: "http://www.google.com",
  });
});

test("renderMarkdown accepts Typora links and images with unwrapped space destinations", () => {
  const source = '[链接](foo bar "链接标题") ![图](assets/my image.png \'图片标题\')';
  const block = renderMarkdown(source, { settings });
  const inline = renderMarkdownInline(source, { settings });

  for (const html of [block, inline]) {
    assert.match(html, /<a href="foo%20bar" title="链接标题">链接<\/a>/);
    assert.match(
      html,
      /<img src="assets\/my image\.png" alt="图" title="图片标题"[^>]*>/,
    );
  }
});

test("Typora space destinations stay literal inside code and HTML markup", () => {
  const literalSources = [
    "`[x](foo bar)`",
    [
      "```md",
      "[x](foo bar)",
      "```",
    ].join("\n"),
  ];

  for (const source of literalSources) {
    const html = renderMarkdown(source, { settings });
    assert.doesNotMatch(html, /href="foo%20bar"/);
    assert.match(html, /foo bar/);
  }

  const htmlAttribute = renderMarkdown('<span title="[x](foo bar)">body</span>', { settings });
  assert.doesNotMatch(htmlAttribute, /href="foo%20bar"/);
  assert.match(htmlAttribute, /title="\[x\]\(foo bar\)"/);
});

test("renderMarkdown supports CJK-adjacent underscore emphasis like Typora", () => {
  const source = "\u4E2D_em_\u6587 \u4E2D__strong__\u6587 a_b_c a__b__c";
  const html = renderMarkdown(source, { settings });

  assert.ok(html.includes("\u4E2D<em>em</em>\u6587"));
  assert.ok(html.includes("\u4E2D<strong>strong</strong>\u6587"));
  assert.match(html, /a_b_c a__b__c/);

  const protectedHtml = renderMarkdown('`\u4E2D_code_\u6587` <span title="\u4E2D_attr_\u6587">body</span>', { settings });
  assert.doesNotMatch(protectedHtml, /<em>|<strong>/);
  assert.ok(protectedHtml.includes("<code>\u4E2D_code_\u6587</code>"));
  assert.ok(protectedHtml.includes('title="\u4E2D_attr_\u6587"'));
});

test("Typora bare auto-links allow CJK boundaries without swallowing suffix text", () => {
  const source = [
    "访问https://example.com结束",
    "访问www.example.org结束",
    "邮箱dev@example.com结束",
    "abchttps://invalid.example",
    "abcwww.invalid.example",
  ].join(" ");
  const matches = getMarkdownAutoLinkMatches(source);

  assert.deepEqual(matches.map((match) => match.text), [
    "https://example.com",
    "www.example.org",
    "dev@example.com",
  ]);
  assert.deepEqual(matches.map((match) => source.slice(match.start, match.end)), [
    "https://example.com",
    "www.example.org",
    "dev@example.com",
  ]);

  const html = renderMarkdown(source, { settings });
  assert.match(html, />https:\/\/example\.com<\/a>结束/);
  assert.match(html, />www\.example\.org<\/a>结束/);
  assert.match(html, />dev@example\.com<\/a>结束/);
  assert.doesNotMatch(html, /href="abchttps:/);
  assert.doesNotMatch(html, /href="http:\/\/abcwww/);
});

test("Typora bare auto-links exclude surrounding inline style markers", () => {
  const source = [
    "*https://em.example*",
    "**https://strong.example**",
    "_https://underscore.example_",
    "~~https://strike.example~~",
    "==https://mark.example==",
  ].join(" ");
  const matches = getMarkdownAutoLinkMatches(source);

  assert.deepEqual(matches.map((match) => match.text), [
    "https://em.example",
    "https://strong.example",
    "https://underscore.example",
    "https://strike.example",
    "https://mark.example",
  ]);
  assert.ok(matches.every((match) => !/[*_~=]$/.test(match.href)));

  const html = renderMarkdown(source, { settings });
  assert.doesNotMatch(html, /href="[^"]*[*_~=]/);
});

test("Typora bare auto-links exclude fuzzy domains and FTP", () => {
  const source = "example.com ftp://example.com www.example.technology https://example.com dev@example.com";
  const matches = getMarkdownAutoLinkMatches(source);
  assert.deepEqual(matches.map((match) => match.text), [
    "www.example.technology",
    "https://example.com",
    "dev@example.com",
  ]);

  const html = renderMarkdown(source, { settings });
  assert.doesNotMatch(html, /href="http:\/\/example\.com"/);
  assert.doesNotMatch(html, /href="ftp:\/\/example\.com"/);
  assert.match(html, /href="http:\/\/www\.example\.technology"/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /href="mailto:dev@example\.com"/);
});

test("renderMarkdown wraps Markdown tables in Typora table figures", () => {
  const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  const compact = "| A | B |\n| - | :-: |\n| 1 | 2 |";
  const plain = renderMarkdown(table, { settings });
  const compactHtml = renderMarkdown(compact, { settings });
  const quoted = renderMarkdown(table.split("\n").map((line) => `> ${line}`).join("\n"), { settings });
  const rawHtml = renderMarkdown("<table><tr><td>raw</td></tr></table>", { settings });

  assert.match(plain, /<figure class="table-figure"><table>/);
  assert.match(compactHtml, /<figure class="table-figure"><table>/);
  assert.match(compactHtml, /text-align:center/);
  assert.match(plain, /<\/table>\s*<\/figure>/);
  assert.match(quoted, /<blockquote>\s*<figure class="table-figure"><table>/);
  assert.doesNotMatch(rawHtml, /table-figure/);
});

test("renderMarkdown preserves plus paragraph and list semantics", () => {
  const paragraph = renderMarkdown("+++", { settings });
  const quotedList = renderMarkdown("> + + +", { settings });
  const listBody = renderMarkdown("- item\n  +++", { settings });

  for (const html of [paragraph, quotedList, listBody]) {
    assert.doesNotMatch(html, /<hr>/);
  }
  assert.match(paragraph, /<p>\+\+\+<\/p>/);
  assert.match(quotedList, /<blockquote>\s*<ul>[\s\S]*<ul>[\s\S]*<ul>/);
  assert.match(listBody, /<li>item\s*\+\+\+<\/li>/);
});

test("renderMarkdown and outline reject single-character Setext underlines", () => {
  for (const marker of ["=", "-"]) {
    const html = renderMarkdown("Title\n" + marker, { settings });
    assert.doesNotMatch(html, /<h[12]/, marker);
    assert.match(html, /<p>Title\s*[=-]<\/p>/, marker);
  }

  assert.match(renderMarkdown("Title\n==", { settings }), /<h1[^>]*>Title<\/h1>/);
  assert.match(renderMarkdown("Subtitle\n--", { settings }), /<h2[^>]*>Subtitle<\/h2>/);
  assert.deepEqual(
    createOutline("Single\n=\n\nDouble\n==").map((item) => item.title),
    ["Double"],
  );
});

test("renderMarkdownTableCells keeps block-only markers inline while preserving inline Markdown", () => {
  const table = [
    "| Heading | Rule | Toc | Inline |",
    "| --- | --- | --- | --- |",
    "| # Heading | --- | [TOC] | **bold** :smile: $x$ [Docs][docs] |",
  ].join("\n");
  const documentSource = table + "\n\n[docs]: https://example.com/docs";
  const rendered = renderMarkdownTableCells(table, {
    settings,
    documentSource,
    outline: [{ id: "intro", title: "Intro", level: 1, line: 1 }],
  }, 0);
  const row = rendered.rows[0];

  assert.equal(rendered.headers.length, 4);
  assert.doesNotMatch(row.join(""), /<h1|<hr|toc-inline|<blockquote|<ul/);
  assert.match(row[0], /# Heading/);
  assert.match(row[1], /—/);
  assert.match(row[2], /\[TOC]/);
  assert.match(row[3], /<strong>bold<\/strong>/);
  assert.match(row[3], /😄/);
  assert.match(row[3], /math-inline/);
  assert.match(row[3], /href="https:\/\/example\.com\/docs"/);

  const inline = renderMarkdownInline("# Heading\n---\n[TOC]", {
    settings,
    documentSource,
    outline: [{ id: "intro", title: "Intro", level: 1, line: 1 }],
  });
  assert.doesNotMatch(inline, /<h1|<hr|toc-inline/);
  assert.match(inline, /# Heading/);
});

test("renderMarkdownTableCells inherits global footnote ids without rendering footnote tails", () => {
  const table = [
    "| Alpha | Beta | Again |",
    "| --- | --- | --- |",
    "| A[^a] | B[^b] | B again[^b] |",
  ].join("\n");
  const documentSource = [
    "Before[^b]",
    "",
    "Math $x[^fake]$",
    "",
    table,
    "",
    "[^a]: Alpha note",
    "[^b]: Beta note",
    "[^fake]: Not a real reference",
  ].join("\n");
  const rendered = renderMarkdownTableCells(table, {
    settings,
    documentSource,
  }, documentSource.indexOf(table));
  const row = rendered.rows[0];

  assert.match(row[0], /href="#fn2"/);
  assert.match(row[0], />\[2]<\/a>/);
  assert.match(row[1], /href="#fn1"/);
  assert.match(row[2], /href="#fn1"/);
  assert.match(row[0], /title="Alpha note"/);
  assert.match(row[1], /title="Beta note"/);
  assert.doesNotMatch(row.join(""), /footnotes-sep|class="footnotes"|footnote-item/);
});

test("renderMarkdown keeps repeated footnote text on the first visible number", () => {
  const html = renderMarkdown(
    "A[^same] B[^same] C[^same]\n\n[^same]: repeated",
    { settings },
  );

  assert.equal(html.match(/>\[1]<\/a>/g)?.length, 3);
  assert.doesNotMatch(html, /\[1:1]|\[1:2]/);
  assert.equal(html.match(/class="footnote-item"/g)?.length, 1);
});

test("renderMarkdown shares footnotes across label casing while preserving summaries", () => {
  const source = "A[^NOTE] B[^note]\n\n[^nOtE]: Case **body**\n\n[^NOTE]: Wrong body";
  const html = renderMarkdown(source, { settings });

  assert.equal(html.match(/>\[1]<\/a>/g)?.length, 2);
  assert.equal(html.match(/class="footnote-item"/g)?.length, 1);
  assert.match(html, /title="Case body"/);
  assert.doesNotMatch(html, /Wrong body/);
  assert.equal(hasMarkdownFootnoteDefinition(source, "NOTE"), true);
  assert.equal(getMarkdownFootnoteSummary(source, "note"), "Case body");
});

test("renderMarkdown renders spaced Unicode labels across CRLF quote-list containers", () => {
  const source = [
    "First[^中文 Note] and again[^中文 note].",
    "",
    "> - [^中文 nOtE]: Detail **bold**.",
    ">       Continued line.",
  ].join("\r\n");
  const html = renderMarkdown(source, { settings });
  const fragmentHtml = renderMarkdown("First[^中文 Note] and again[^中文 note].", {
    settings,
    documentSource: source,
  });

  assert.equal(html.match(/class="footnote-ref"/g)?.length, 2);
  assert.equal(html.match(/>\[1]<\/a>/g)?.length, 2);
  assert.equal(html.match(/class="footnote-item"/g)?.length, 1);
  assert.match(html, /title="Detail bold\. Continued line\."/);
  assert.match(html, /Detail <strong>bold<\/strong>\./);
  assert.equal(fragmentHtml.match(/class="footnote-ref"/g)?.length, 2);
  assert.match(fragmentHtml, /title="Detail bold\. Continued line\."/);
  assert.equal(hasMarkdownFootnoteDefinition(source, "中文 NOTE"), true);
  assert.equal(getMarkdownFootnoteSummary(source, "中文 note"), "Detail bold. Continued line.");
});

test("renderMarkdown keeps spaced labels distinct from internal-prefix-looking labels", () => {
  const reservedLooking = "marko-footnote-006d00790020006e006f00740065";
  const source = [
    `First[^my note] Second[^${reservedLooking}]`,
    "",
    "[^my note]: Spaced body",
    `[^${reservedLooking}]: Reserved body`,
  ].join("\n");
  const html = renderMarkdown(source, { settings });

  assert.equal(html.match(/class="footnote-item"/g)?.length, 2);
  assert.match(html, />\[1]<\/a>/);
  assert.match(html, />\[2]<\/a>/);
  assert.match(html, /title="Spaced body"/);
  assert.match(html, /title="Reserved body"/);
});

test("renderMarkdown protects spaced footnote syntax in code and HTML literals", () => {
  const source = [
    'Visible[^real note] `[^code note]` <span title="[^attr note]">text</span>',
    "",
    "<div>",
    "Block[^html note]",
    "[^html note]: hidden body",
    "</div>",
    "",
    "[^real note]: visible body",
  ].join("\n");
  const html = renderMarkdown(source, { settings });

  assert.equal(html.match(/class="footnote-ref"/g)?.length, 1);
  assert.equal(html.match(/class="footnote-item"/g)?.length, 1);
  assert.match(html, /<code>\[\^code note]<\/code>/);
  assert.match(html, /title="\[\^attr note]"/);
  assert.match(html, /Block\[\^html note]/);
  assert.doesNotMatch(html, /hidden body<\/p>/);
});

test("renderMarkdown keeps missing spaced labels visible without leaking internal ids", () => {
  const html = renderMarkdown("Missing[^My Missing Note].", { settings });

  assert.match(html, /Missing\[\^My Missing Note]\./);
  assert.doesNotMatch(html, /marko-footnote-/);
  assert.doesNotMatch(html, /footnote-ref/);
});

test("renderMarkdownTableCells resolves Typora root assets through the supplied resolver", () => {
  const table = [
    "| Image | Media |",
    "| --- | --- |",
    '| ![Logo](/assets/logo.png) | <video poster="/assets/cover.jpg"></video> |',
  ].join("\n");
  const documentSource = [
    "---",
    "typora-root-url: 'C:/website'",
    "---",
    "",
    table,
  ].join("\n");
  const rendered = renderMarkdownTableCells(table, {
    settings,
    documentSource,
    basePath: "C:/docs/current.md",
    assetResolver: (path) => "asset://" + path,
  }, documentSource.indexOf(table));
  const row = rendered.rows[0];

  assert.match(row[0], /src="asset:\/\/C:\/website\/assets\/logo\.png"/);
  assert.match(row[1], /poster="asset:\/\/C:\/website\/assets\/cover\.jpg"/);
});

test("renderMarkdown 按 Typora 规则区分同级与嵌套无序列表", () => {
  const flat = renderMarkdown("- 一级\n * 二级\n  * 三级", { settings });
  const nested = renderMarkdown("- 一级\n  * 二级\n    * 三级", { settings });

  assert.equal(flat.match(/<ul>/g)?.length, 2);
  assert.doesNotMatch(flat, /<li>一级\s*<ul>/);
  assert.equal(nested.match(/<ul>/g)?.length, 3);
  assert.match(nested, /<li>一级\s*<ul>\s*<li>二级\s*<ul>\s*<li>三级<\/li>/);
});

test("renderMarkdown supports Typora-style bracket math delimiters", () => {
  const html = renderMarkdown("Inline \\(a+b\\).\n\n\\[\n\\frac{1}{2}\n\\]", {
    settings,
  });

  assert.match(html, /math-inline/);
  assert.match(html, /math-block/);
  assert.match(html, /<mjx-container class="MathJax" jax="SVG"/);
});

test("renderMarkdown keeps math delimiters when math extension is disabled", () => {
  const html = renderMarkdown("Inline $x+y$ and \\(a+b\\).\n\n\\[\na=b\n\\]", {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        math: false,
      },
    },
  });

  assert.doesNotMatch(html, /MathJax|mjx-container/);
  assert.match(html, /\$x\+y\$/);
  assert.match(html, /\\\(a\+b\\\)/);
  assert.match(html, /\\\[\na=b\n\\\]/);
});

test("renderMarkdown does not render math inside fenced code", () => {
  const html = renderMarkdown("```md\n$x$\n```", { settings });

  assert.doesNotMatch(html, /math-inline/);
  assert.match(html, /\$x\$/);
});

test("renderMarkdown does not render math inside raw or generated html code like Typora", () => {
  const html = renderMarkdown([
    "<pre>$x$</pre>",
    "",
    "<code>$y$</code> and $z$.",
    "",
    "Term",
    ": `$a$` and <code>$b$</code>",
  ].join("\n"), { settings });

  assert.equal(html.match(/math-inline/g)?.length, 1);
  assert.match(html, /<pre>\$x\$<\/pre>/);
  assert.match(html, /<code>\$y\$<\/code> and <span class="math-inline"/);
  assert.match(html, /<dd><code>\$a\$<\/code> and <code>\$b\$<\/code><\/dd>/);
});

test("renderMarkdown 不改写链接、图片和引用定义目标中的数学定界符", () => {
  const html = renderMarkdown([
    "[内联链接](https://example.com/$route$)",
    "",
    "![流程图](assets/$diagram$.png)",
    "",
    "[短目标](<asset>) ![短图片](<logo>)",
    "",
    "[引用链接][docs]",
    "[短引用][short]",
    "",
    "[docs]: https://example.com/$reference$ \"标题 $literal$\"",
    "[short]: <guide>",
    "",
    "正文 $x+y$ 与 \\(a+b\\)，代码 `$code$`。",
  ].join("\n"), { settings });

  assert.match(html, /href="https:\/\/example\.com\/\$route\$"/);
  assert.match(html, /src="assets\/\$diagram\$\.png"/);
  assert.match(html, /href="asset"[^>]*>短目标<\/a> <img src="logo"/);
  assert.match(html, /href="https:\/\/example\.com\/\$reference\$" title="标题 \$literal\$"/);
  assert.match(html, /href="guide"[^>]*>短引用<\/a>/);
  assert.equal(html.match(/math-inline/g)?.length, 2);
  assert.match(html, /<code>\$code\$<\/code>/);
});

test("renderMarkdown 只渲染原始 HTML 标签之间的正文数学，不改写媒体属性", () => {
  const html = renderMarkdown([
    '<iframe src="https://example.com/embed/$frame$" srcdoc="<p>$document$</p>">回退 $inside$</iframe>',
    "",
    '<video poster="media/$poster$.jpg">视频 $video$<source src="media/$clip$.mp4" type="video/mp4"></video>',
    "",
    '<span data-formula="$attribute$">正文 $visible$</span>',
  ].join("\n"), { settings });

  assert.match(html, /src="https:\/\/example\.com\/embed\/\$frame\$"/);
  assert.match(html, /srcdoc="<p>\$document\$<\/p>"/);
  assert.match(html, /poster="media\/\$poster\$\.jpg"/);
  assert.match(html, /<source src="media\/\$clip\$\.mp4" type="video\/mp4">/);
  assert.match(html, /data-formula="\$attribute\$"/);
  assert.equal(html.match(/math-inline/g)?.length, 3);
});

test("renderMarkdown does not render math inside quoted fenced code", () => {
  const html = renderMarkdown("> ```md\n> $x$ and \\(y\\)\n> ```", { settings });

  assert.doesNotMatch(html, /math-inline/);
  assert.match(html, /\$x\$ and \\\(y\\\)/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<pre><code/);
});

test("renderMarkdown supports quoted block math like Typora", () => {
  const html = renderMarkdown("> $$\n> x+y\n> $$\n\n> > \\[\n> > a=b\n> > \\]", { settings });

  assert.equal(html.match(/math-block/g)?.length, 2);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<mjx-container class="MathJax" jax="SVG"/);
  assert.doesNotMatch(html, /<p>\$\$/);
  assert.doesNotMatch(html, /\\\[/);
});

test("renderMarkdown supports lightly indented block math without touching indented code", () => {
  const html = renderMarkdown("  $$\n  x+y\n  $$\n\n    $not_math$", { settings });

  assert.equal(html.match(/math-block/g)?.length, 1);
  assert.doesNotMatch(html, /math-inline/);
  assert.match(html, /<pre><code>\$not_math\$/);
});

test("renderMarkdown keeps document numbering for multiline math nested in lists", () => {
  const first = "$$\ny = 0\n$$";
  const listMath = [
    "  $$",
    "    a \\\\",
    "      b",
    "  $$",
  ].join("\n");
  const documentSource = `${first}\n\n- item\n${listMath}`;
  const html = renderMarkdown(listMath, {
    documentSource,
    sourceOffset: documentSource.indexOf(listMath),
    settings: { ...settings, autoNumberingForMath: "all" },
  });

  assert.match(html, /id="mjx-eqn:2"/);
  assert.doesNotMatch(html, /id="mjx-eqn:1"/);
});

test("renderMarkdown does not render math inside quoted indented code", () => {
  const html = renderMarkdown(">     $not_math$ and \\(raw\\)\n>\n>     beta", { settings });

  assert.doesNotMatch(html, /math-inline/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<pre><code>\$not_math\$ and \\\(raw\\\)/);
});

test('renderMarkdown protects code fences nested directly in list containers', () => {
  const sources = [
    [
      '- ~~~md',
      '  $x$',
      '  ~~~',
    ].join(String.fromCharCode(10)),
    [
      '> - ~~~md',
      '>   $y$',
      '>   ~~~',
    ].join(String.fromCharCode(10)),
  ];

  for (const source of sources) {
    const html = renderMarkdown(source, { settings });
    assert.doesNotMatch(html, /math-inline/);
    assert.match(html, /\$[xy]\$/);
  }
});

test('renderMarkdown keeps five-space list code out of math preprocessing', () => {
  const sources = [
    [
      '-     ~~~md',
      '      $x$',
      '      ~~~',
    ].join(String.fromCharCode(10)),
    [
      '> -     ~~~md',
      '>       $y$',
      '>       ~~~',
    ].join(String.fromCharCode(10)),
  ];

  for (const source of sources) {
    const html = renderMarkdown(source, { settings });
    assert.doesNotMatch(html, /math-inline/);
    assert.match(html, /<pre><code>~~~md\n\$[xy]\$\n~~~\n<\/code><\/pre>/);
  }
});

test('renderMarkdown keeps five-space list code protected when math is disabled', () => {
  const mathDisabledSettings: EditorSettings = {
    ...settings,
    extensions: { ...settings.extensions, math: false },
  };
  const sources = [
    '-     ~~~md\n      $x$\n      ~~~',
    '> -     ~~~md\n>       $y$\n>       ~~~',
  ];

  for (const source of sources) {
    const html = renderMarkdown(source, { settings: mathDisabledSettings });
    assert.doesNotMatch(html, /math-inline|MathJax|mjx-container/);
    assert.match(html, /<pre><code>~~~md\n\$[xy]\$\n~~~\n<\/code><\/pre>/);
  }
});

test("renderMarkdown protects code fences closed with longer markers", () => {
  const html = renderMarkdown("````md\n$x$\n`````", { settings });

  assert.doesNotMatch(html, /math-inline/);
  assert.match(html, /\$x\$/);
});

test("renderMarkdown avoids treating spaced dollar text as inline math", () => {
  const html = renderMarkdown([
    "Price $5 and $10 or $5 and$10.",
    "Math $5$ and $x + y$ and escaped dollar $x=\\$5$.",
  ].join("\n"), { settings });

  assert.equal(html.match(/math-inline/g)?.length, 3);
  assert.match(html, /\$5 and \$10 or \$5 and\$10/);
  assert.match(html, /data-latex="x=\\\$5"/);
  assert.match(html, /<mjx-container class="MathJax" jax="SVG"/);
});

test("renderMarkdown respects the marks extension toggle", () => {
  const source = "==mark== ^up^ H~2~O";
  const enabled = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: { ...settings.extensions, marks: true },
    },
  });
  assert.match(enabled, /<mark>mark<\/mark>/);
  assert.match(enabled, /<sup>up<\/sup>/);
  assert.match(enabled, /H<sub>2<\/sub>O/);

  const disabledSettings: EditorSettings = {
    ...settings,
    extensions: {
      ...settings.extensions,
      marks: false,
    },
  };
  const disabled = renderMarkdown(source, { settings: disabledSettings });
  assert.doesNotMatch(disabled, /<mark>|<sup>|<sub>/);
  assert.match(disabled, /==mark== \^up\^ H~2~O/);

  const alert = renderMarkdown("> [!NOTE]\n> ==mark==", { settings: disabledSettings });
  assert.doesNotMatch(alert, /<mark>/);
  assert.match(alert, /==mark==/);
});

test("renderMarkdown controls highlight, superscript and subscript independently", () => {
  const source = "==mark== ^up^ H~2~O";
  const highlightOnly = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        marks: false,
        highlight: true,
        superscript: false,
        subscript: false,
      },
    },
  });
  assert.match(highlightOnly, /<mark>mark<\/mark>/);
  assert.doesNotMatch(highlightOnly, /<sup>|<sub>/);

  const scriptsOnly = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        marks: false,
        highlight: false,
        superscript: true,
        subscript: true,
      },
    },
  });
  assert.doesNotMatch(scriptsOnly, /<mark>/);
  assert.match(scriptsOnly, /<sup>up<\/sup>/);
  assert.match(scriptsOnly, /H<sub>2<\/sub>O/);
});

test("renderMarkdown replaces only lowercase emoji shortcodes like Typora", () => {
  const html = renderMarkdown(":SMILE: :grinning: :poodle: :+1: :unknown:", { settings });
  assert.match(html, /:SMILE:/);
  assert.equal(html.match(/\u{1F604}/gu)?.length ?? 0, 0);
  assert.equal(html.match(/\u{1F600}/gu)?.length, 1);
  assert.equal(html.match(/\u{1F429}/gu)?.length, 1);
  assert.equal(html.match(/\u{1F44D}/gu)?.length, 1);
  assert.match(html, /:unknown:/);

  const escaped = renderMarkdown("\\:smile: :smile:", { settings });
  assert.match(escaped, /:smile:/);
  assert.equal(escaped.match(/\u{1F604}/gu)?.length, 1);

  const disabled = renderMarkdown(":smile:", {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        emoji: false,
      },
    },
  });
  assert.match(disabled, /:smile:/);

  assert.deepEqual(getEmojiSuggestions("pood"), [{ code: "poodle", value: "🐩" }]);
  assert.deepEqual(getEmojiSuggestions("+"), [{ code: "+1", value: "👍" }]);
});

test("Markdown 正文助手复用 Emoji、linkify 和 typographer 语义", () => {
  assert.deepEqual(getEmojiShortcodeMatches(":SMILE: :unknown: :poodle:"), [
    { start: 18, end: 26, source: ":poodle:", value: "🐩" },
  ]);
  assert.deepEqual(getEmojiShortcodeMatches("\\:joy:"), []);
  assert.deepEqual(
    getMarkdownAutoLinkMatches("https://example.com www.google.com dev@example.com").map((match) => ({
      text: match.text,
      href: match.href,
    })),
    [
      { text: "https://example.com", href: "https://example.com" },
      { text: "www.google.com", href: "http://www.google.com" },
      { text: "dev@example.com", href: "mailto:dev@example.com" },
    ],
  );
  assert.equal(
    renderSmartPunctuationText('"hello" -- --- ... (c) (r) (tm) +- !!!!'),
    "“hello” – — … (c) (r) (tm) +- !!!!",
  );
  assert.equal(
    renderSmartPunctuationText('"hello" -- ...', { quotes: false, dashes: true }),
    '"hello" – …',
  );
  assert.equal(
    renderSmartPunctuationText('"hello" -- ...', { quotes: true, dashes: false }),
    '“hello” -- ...',
  );
});

test("bare email auto-links use Typora's finite TLD list", () => {
  const matches = getMarkdownAutoLinkMatches([
    "one@example.com",
    "two@example.co.uk",
    "three@example.dev",
    "four@example.invalid",
  ].join(" "));

  assert.deepEqual(matches.map((match) => match.text), [
    "one@example.com",
    "two@example.co.uk",
  ]);
});

test("renderMarkdown 为 Rich 编辑保留 Emoji、智能标点和自动链接源码", () => {
  const html = renderMarkdown(':poodle: "hello" -- https://example.com <i@typora.io>', {
    settings,
    preserveSourceTokens: true,
  });

  assert.match(html, /data-marko-inline-markdown=":poodle:"[^>]*>🐩<\/span>/);
  assert.equal(html.match(/data-marko-inline-markdown="&quot;"/g)?.length, 2);
  assert.match(html, /data-marko-inline-markdown="--"/);
  assert.match(html, /data-marko-inline-markdown="https:\/\/example\.com"/);
  assert.match(html, /data-marko-inline-markdown="&lt;i@typora\.io&gt;"/);
});

test("renderMarkdown 只在正文文本替换 Emoji，不改写代码和链接目的地", () => {
  const html = renderMarkdown([
    "正文 :poodle:",
    "",
    "`:smile:` [标签 :rocket:](https://example.com/:smile:)",
    "",
    "```md",
    ":smile:",
    "```",
  ].join("\n"), { settings });

  assert.equal(html.match(/🐩/g)?.length, 1);
  assert.match(html, /<code>:smile:<\/code>/);
  assert.match(html, /<code class="hljs language-md">:smile:\n<\/code>/);
  assert.match(html, /href="https:\/\/example\.com\/:smile:"/);
  assert.match(html, />标签 🚀<\/a>/);

  const math = renderMarkdown("数学 $\\text{:smile:}$", { settings });
  assert.doesNotMatch(math, /😄/);
  assert.match(math, /:smile:/);
});

test("renderMarkdown respects the html extension toggle without double escaping", () => {
  const source = "<b>raw</b>";
  const enabled = renderMarkdown(source, { settings });
  assert.match(enabled, /<b>raw<\/b>/);

  const disabled = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
  });
  assert.doesNotMatch(disabled, /<b>raw<\/b>/);
  assert.doesNotMatch(disabled, /&amp;lt;b&amp;gt;/);
  assert.match(disabled, /&lt;b&gt;raw&lt;\/b&gt;/);
});

test("renderMarkdown keeps Markdown in disabled inline HTML text but protects tag markup", () => {
  const source = '<span title="$attr$ [^n] ==attr==">$body$ [^n] ==body==</span>\n\n[^n]: Note';
  const html = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
        marks: true,
      },
    },
  });

  assert.equal(html.match(/class="math-inline"/g)?.length, 1);
  assert.equal(html.match(/class="footnote-ref"/g)?.length, 1);
  assert.equal(html.match(/<mark>/g)?.length, 1);
  assert.doesNotMatch(html, /<span title=/);
  assert.match(html, /&lt;span title=&quot;/);
});

test("renderMarkdown keeps disabled raw HTML blocks from parsing inner Markdown like Typora", () => {
  const html = renderMarkdown([
    "<div>",
    "# Hidden",
    "$x$ ==mark== [link](https://example.com)",
    "</div>",
    "# Still hidden",
    "",
    "# Visible",
  ].join("\n"), {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
  });

  assert.equal(html.match(/<h1/g)?.length, 1);
  assert.match(html, /id="visible"/);
  assert.doesNotMatch(html, /id="hidden"|id="still-hidden"/);
  assert.doesNotMatch(html, /math-inline|<mark>|<a href/);
  assert.match(html, /&lt;div/);
  assert.match(html, /# Hidden/);
});

test("renderMarkdown resumes Markdown after disabled closed raw HTML blocks like Typora", () => {
  const html = renderMarkdown([
    "<script>",
    "# Hidden",
    "</script>",
    "# Visible",
  ].join("\n"), {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
  });

  assert.equal(html.match(/<h1/g)?.length, 1);
  assert.match(html, /id="visible"/);
  assert.doesNotMatch(html, /id="hidden"/);
  assert.match(html, /&lt;script/);
});

test("renderMarkdown keeps textarea contents outside Markdown preprocessing", () => {
  const source = [
    "*[API]: Application Programming Interface",
    "",
    "<textarea>",
    "# Hidden",
    "",
    "API",
    "Term",
    ": Definition",
    "</textarea>",
    "# Visible",
  ].join("\n");
  const enabled = renderMarkdown(source, { settings });
  const disabled = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
  });

  const textarea = enabled.match(/<textarea>[\s\S]*?<\/textarea>/)?.[0] ?? "";
  assert.match(textarea, /# Hidden/);
  assert.match(textarea, /API/);
  assert.doesNotMatch(textarea, /<h1|<abbr|<dl/);
  assert.equal(enabled.match(/<h1/g)?.length, 1);
  assert.equal(disabled.match(/<h1/g)?.length, 1);
  assert.doesNotMatch(disabled, /id="hidden"|<abbr|<dl/);
  assert.match(disabled, /&lt;textarea&gt;/);
});

test("renderMarkdown resolves raw html image sources like Typora", () => {
  const html = renderMarkdown(
    '![File](file:///C:/docs/file.png)\n\n<img src="assets/logo one.png" alt="Logo"><span><img src=\'https://example.com/logo.png\'></span><img src=data:image/png;base64,abc><img src="file:///C:/docs/raw.png">',
    {
      settings,
      basePath: "C:/docs/current.md",
      assetResolver: (path) => `asset://${path}`,
    },
  );

  assert.match(html, /<img src="asset:\/\/C:\/docs\/assets\/logo one\.png" alt="Logo">/);
  assert.match(html, /<img src='https:\/\/example\.com\/logo\.png'>/);
  assert.match(html, /<img src="data:image\/png;base64,abc">/);
  assert.match(html, /<img src="file:\/\/\/C:\/docs\/file\.png" alt="File"/);
  assert.match(html, /<img src="file:\/\/\/C:\/docs\/raw\.png">/);

  const disabled = renderMarkdown('<img src="assets/logo.png">', {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
    basePath: "C:/docs/current.md",
    assetResolver: (path) => `asset://${path}`,
  });
  assert.match(disabled, /&lt;img src=&quot;assets\/logo\.png&quot;&gt;/);
  assert.doesNotMatch(disabled, /asset:\/\//);
});

test("renderMarkdown applies typora-root-url to root-relative Markdown images", () => {
  const documentSource = [
    "---",
    "typora-root-url: 'C:/website'",
    "---",
    "",
    "![Logo](/assets/logo.png)",
  ].join("\n");
  const full = renderMarkdown(documentSource, {
    settings,
    basePath: "C:/docs/current.md",
    assetResolver: (path) => `asset://${path}`,
  });
  const block = renderMarkdown("![Logo](/assets/logo.png)", {
    settings,
    documentSource,
    basePath: "C:/docs/current.md",
    assetResolver: (path) => `asset://${path}`,
  });

  assert.match(full, /src="asset:\/\/C:\/website\/assets\/logo\.png"/);
  assert.match(block, /src="asset:\/\/C:\/website\/assets\/logo\.png"/);
});

test("renderMarkdown resolves local HTML video, audio, source and poster assets", () => {
  const html = renderMarkdown([
    '<video src="media/demo.mp4" poster="../images/cover.jpg" controls>',
    "  <source src='media/demo.webm' type='video/webm'>",
    "</video>",
    '<audio src="media/demo.mp3" controls></audio>',
    '<video src="https://example.com/remote.mp4" poster="data:image/png;base64,abc"></video>',
  ].join("\n"), {
    settings,
    basePath: "C:/docs/chapter/current.md",
    assetResolver: (path) => `asset://${path}`,
  });

  assert.match(html, /src="asset:\/\/C:\/docs\/chapter\/media\/demo\.mp4"/);
  assert.match(html, /poster="asset:\/\/C:\/docs\/images\/cover\.jpg"/);
  assert.match(html, /src='asset:\/\/C:\/docs\/chapter\/media\/demo\.webm'/);
  assert.match(html, /src="asset:\/\/C:\/docs\/chapter\/media\/demo\.mp3"/);
  assert.match(html, /src="https:\/\/example\.com\/remote\.mp4"/);
  assert.match(html, /poster="data:image\/png;base64,abc"/);

  const disabled = renderMarkdown('<video src="media/demo.mp4"></video>', {
    settings: {
      ...settings,
      extensions: { ...settings.extensions, html: false },
    },
    basePath: "C:/docs/current.md",
    assetResolver: (path) => `asset://${path}`,
  });
  assert.match(disabled, /&lt;video src=&quot;media\/demo\.mp4&quot;&gt;/);
  assert.doesNotMatch(disabled, /asset:\/\//);
});

test("renderMarkdown resolves local track sources and preserves remote tracks", () => {
  const resolvedPaths: string[] = [];
  const html = renderMarkdown([
    "<video controls>",
    '  <track src="captions/zh.vtt" kind="subtitles" srclang="zh">',
    "  <track src='../captions/en.vtt' kind='captions' srclang='en'>",
    '  <track src="https://example.com/captions/remote.vtt" kind="subtitles">',
    "</video>",
  ].join("\n"), {
    settings,
    basePath: "C:/docs/chapter/current.md",
    assetResolver: (path) => {
      resolvedPaths.push(path);
      return "asset://" + path;
    },
  });

  assert.ok(html.includes('src="asset://C:/docs/chapter/captions/zh.vtt"'));
  assert.ok(html.includes("src='asset://C:/docs/captions/en.vtt'"));
  assert.ok(html.includes('src="https://example.com/captions/remote.vtt"'));
  assert.deepEqual(resolvedPaths, [
    "C:/docs/chapter/captions/zh.vtt",
    "C:/docs/captions/en.vtt",
  ]);
});

test("renderMarkdown closes self-closing media before following body content", () => {
  const source = [
    '<video src="./demo.mp4" />',
    "",
    '<audio src="./demo.mp3" />',
    "",
    '<iframe src="https://example.com/embed" />',
    "",
    "After",
  ].join("\n");
  const html = renderMarkdown(source, { settings });

  assert.match(html, /<video[^>]*><\/video>/);
  assert.match(html, /<audio[^>]*><\/audio>/);
  assert.match(html, /<iframe[^>]*><\/iframe>/);
  assert.match(html, /<p>After<\/p>/);
  assert.doesNotMatch(html, /<video[^>]*>[^]*After[^]*<\/video>/);
});

test("renderMarkdown resolves Windows and UNC image paths like Typora", () => {
  const html = renderMarkdown(
    '<img src="..\\assets\\logo one.png"><img src="\\\\server\\share\\fig.png"><img src="%5C%5Cserver%5Cshare%5Cencoded.png">',
    {
      settings,
      basePath: "C:/docs/chapter/current.md",
      assetResolver: (path) => `asset://${path}`,
    },
  );

  assert.match(html, /<img src="asset:\/\/C:\/docs\/assets\/logo one\.png">/);
  assert.match(html, /<img src="asset:\/\/\/\/server\/share\/fig\.png">/);
  assert.match(html, /<img src="asset:\/\/\/\/server\/share\/encoded\.png">/);
});

test("renderMarkdown preserves the POSIX root for relative image paths on macOS", () => {
  const html = renderMarkdown('<img src="../assets/logo.png">', {
    settings,
    basePath: "/Users/marko/Documents/notes/current.md",
    assetResolver: (path) => `asset://${path}`,
  });

  assert.match(html, /<img src="asset:\/\/\/Users\/marko\/Documents\/assets\/logo\.png">/);
});

test("renderMarkdown blocks unsafe raw html image sources", () => {
  const html = renderMarkdown(
    '<img src="javascript:alert(1)" alt="Bad"><img src="data:text/html,hi"><img src="data:image/svg+xml;base64,PHN2Zz4="><img src="data:image/png;base64,abc">',
    { settings },
  );

  assert.doesNotMatch(html, /javascript:alert/);
  assert.doesNotMatch(html, /data:text\/html/);
  assert.doesNotMatch(html, /data:image\/svg\+xml/);
  assert.match(html, /<img src="" alt="Bad">/);
  assert.match(html, /<img src="">/);
  assert.match(html, /<img src="data:image\/png;base64,abc">/);
});

test("renderMarkdown allows only safe raster image data URIs", () => {
  const html = renderMarkdown([
    "![gif](data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==)",
    "![png](data:image/png;base64,iVBORw0KGgo=)",
    "![jpeg](data:image/jpeg;base64,/9j/4AAQSkZJRg==)",
    "![webp](data:image/webp;base64,UklGRg==)",
    "![svg](data:image/svg+xml;base64,PHN2Zz4=)",
    "![text](data:text/plain;base64,dGV4dA==)",
    "![script](javascript:alert(1))",
  ].join("\n\n"), { settings });

  for (const kind of ["gif", "png", "jpeg", "webp"]) {
    assert.match(html, new RegExp(`<img src="data:image/${kind};base64,[^"]+" alt="${kind}"[^>]*>`));
  }
  for (const kind of ["svg", "text", "script"]) {
    assert.doesNotMatch(html, new RegExp(`<img[^>]+alt="${kind}"`));
  }
});

test("renderMarkdown opens external links outside the editor surface", () => {
  const html = renderMarkdown(
    "[docs](https://example.com/docs) [local](#intro) [relative](notes.md) [file](file:///C:/docs/notes.md)",
    { settings },
  );

  assert.match(html, /href="https:\/\/example\.com\/docs"[^>]*target="_blank"/);
  assert.match(html, /href="https:\/\/example\.com\/docs"[^>]*rel="noopener noreferrer"/);
  assert.match(html, /<a href="#intro">local<\/a>/);
  assert.match(html, /<a href="notes\.md">relative<\/a>/);
  assert.match(html, /<a href="file:\/\/\/C:\/docs\/notes\.md">file<\/a>/);
});

test("renderMarkdown resolves reference links from the full document like Typora", () => {
  const html = renderMarkdown(
    "Read [Docs][docs], [Guide][], and ![Logo][logo].",
    {
      settings,
      documentSource: [
        "Read [Docs][docs], [Guide][], and ![Logo][logo].",
        "",
        "[docs]: https://example.com/docs",
        "[Guide]: guide.md",
        "[logo]: <assets/logo one.png> \"Logo title\"",
      ].join("\n"),
      basePath: "C:/docs/current.md",
      assetResolver: (path) => `asset://${path}`,
    },
  );

  assert.match(html, /<a href="https:\/\/example\.com\/docs"[^>]*>Docs<\/a>/);
  assert.match(html, /<a href="guide\.md">Guide<\/a>/);
  assert.match(html, /<img src="asset:\/\/C:\/docs\/assets\/logo one\.png" alt="Logo" title="Logo title"/);
});

test("renderMarkdown resolves lightly indented reference links from the full document like Typora", () => {
  const html = renderMarkdown(
    "Read [Docs][docs].",
    {
      settings,
      documentSource: [
        "Read [Docs][docs].",
        "",
        "   [docs]: https://example.com/docs",
      ].join("\n"),
    },
  );

  assert.match(html, /<a href="https:\/\/example\.com\/docs"[^>]*>Docs<\/a>/);
});

test("renderMarkdown preserves reference titles from the full document like Typora", () => {
  const html = renderMarkdown(
    "Read [Docs][docs].",
    {
      settings,
      documentSource: [
        "Read [Docs][docs].",
        "",
        "[docs]: https://example.com/docs",
        "  \"Docs title\"",
      ].join("\n"),
    },
  );

  assert.match(html, /<a href="https:\/\/example\.com\/docs" title="Docs title"[^>]*>Docs<\/a>/);
});

test("renderMarkdown normalizes quoted and listed reference definitions for fragments", () => {
  const documentSource = [
    "Read [Quote][quote] and [List][list].",
    "",
    "> [quote]: /quote.md",
    '>   "Quote title"',
    "",
    "- [list]: /list.md",
    '  "List title"',
  ].join("\n");
  const html = renderMarkdown("Read [Quote][quote] and [List][list].", {
    settings,
    documentSource,
  });

  assert.match(html, /href="\/quote\.md" title="Quote title"[^>]*>Quote<\/a>/);
  assert.match(html, /href="\/list\.md" title="List title"[^>]*>List<\/a>/);
  assert.doesNotMatch(html, /<blockquote|<ul>/);
});

test("renderMarkdown excludes indented code after referenced link definitions like Typora", () => {
  const html = renderMarkdown(
    "Read [Docs][docs].",
    {
      settings,
      documentSource: [
        "Read [Docs][docs].",
        "",
        "[docs]: https://example.com/docs",
        "    code after definition",
      ].join("\n"),
    },
  );

  assert.match(html, /<a href="https:\/\/example\.com\/docs"[^>]*>Docs<\/a>/);
  assert.doesNotMatch(html, /<pre><code>code after definition/);
});

test("renderMarkdown preserves heavily indented reference titles like Typora", () => {
  const html = renderMarkdown(
    "Read [Docs][docs].",
    {
      settings,
      documentSource: [
        "Read [Docs][docs].",
        "",
        "[docs]: https://example.com/docs",
        "     \"Docs title\"",
      ].join("\n"),
    },
  );

  assert.match(html, /<a href="https:\/\/example\.com\/docs" title="Docs title"[^>]*>Docs<\/a>/);
});

test("renderMarkdown ignores reference definitions inside raw blocks like Typora", () => {
  const fenced = renderMarkdown("Read [Docs][docs].", {
    settings,
    documentSource: [
      "Read [Docs][docs].",
      "",
      "```",
      "[docs]: https://bad.example/docs",
      "```",
      "",
      "[docs]: https://good.example/docs",
    ].join("\n"),
  });

  assert.match(fenced, /<a href="https:\/\/good\.example\/docs"[^>]*>Docs<\/a>/);
  assert.doesNotMatch(fenced, /bad\.example/);

  const htmlBlock = renderMarkdown("Read [Docs][docs].", {
    settings,
    documentSource: [
      "Read [Docs][docs].",
      "",
      "<div>",
      "[docs]: https://bad.example/docs",
      "</div>",
      "",
      "[docs]: https://good.example/docs",
    ].join("\n"),
  });

  assert.match(htmlBlock, /<a href="https:\/\/good\.example\/docs"[^>]*>Docs<\/a>/);
  assert.doesNotMatch(htmlBlock, /bad\.example/);
});

test("renderMarkdown applies preview link behavior to raw html anchors", () => {
  const html = renderMarkdown(
    [
      '<a href="https://example.com/docs">docs</a>',
      "<a href='obsidian://open?vault=docs'>vault</a>",
      '<a href="#intro">anchor</a>',
      '<a href="notes.md">relative</a>',
      '<a href="file:///C:/docs/notes.md">file</a>',
      '<a href="javascript:alert(1)">blocked</a>',
      '<a href="https://example.com/old" target="_self" rel="opener">replace</a>',
    ].join(" "),
    { settings },
  );

  assert.match(html, /<a href="https:\/\/example\.com\/docs" target="_blank" rel="noopener noreferrer">docs<\/a>/);
  assert.match(html, /<a href='obsidian:\/\/open\?vault=docs' target="_blank" rel="noopener noreferrer">vault<\/a>/);
  assert.match(html, /<a href="#intro">anchor<\/a>/);
  assert.match(html, /<a href="notes\.md">relative<\/a>/);
  assert.match(html, /<a href="file:\/\/\/C:\/docs\/notes\.md">file<\/a>/);
  assert.match(html, /<a href="javascript:alert\(1\)">blocked<\/a>/);
  assert.match(html, /<a href="https:\/\/example\.com\/old" target="_blank" rel="noopener noreferrer">replace<\/a>/);

  const disabled = renderMarkdown('<a href="https://example.com/docs">docs</a>', {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
  });
  assert.match(disabled, /&lt;a href=&quot;https:\/\/example\.com\/docs&quot;&gt;docs&lt;\/a&gt;/);
  assert.doesNotMatch(disabled, /target="_blank"/);
});

test("renderMarkdown keeps generated TOC and alerts when raw html is disabled", () => {
  const htmlDisabledSettings: EditorSettings = {
    ...settings,
    extensions: {
      ...settings.extensions,
      html: false,
    },
  };
  const toc = renderMarkdown("[TOC]", {
    settings: htmlDisabledSettings,
    outline: [
      { id: "intro", title: "Intro", level: 1, line: 1 },
      { id: "details", title: "Details", level: 2, line: 2 },
      { id: "deep", title: "Deep", level: 6, line: 3 },
    ],
  });

  assert.match(toc, /<nav class="toc-inline">/);
  assert.match(toc, /toc-inline-item lv-1/);
  assert.match(toc, /toc-inline-item lv-2/);
  assert.match(toc, /toc-inline-item lv-6/);
  assert.doesNotMatch(toc, /&lt;nav/);

  const alert = renderMarkdown("> [!NOTE]\n> <b>raw</b>", {
    settings: htmlDisabledSettings,
  });

  assert.match(alert, /<div class="md-alert md-alert-note">/);
  assert.match(alert, /&lt;b&gt;raw&lt;\/b&gt;/);
  assert.doesNotMatch(alert, /<b>raw<\/b>/);
});

test("renderMarkdown renders all Typora alert titles with decorative inline icons", () => {
  const alertKinds = [
    ["NOTE", "note", "Note"],
    ["TIP", "tip", "Tip"],
    ["IMPORTANT", "important", "Important"],
    ["WARNING", "warning", "Warning"],
    ["CAUTION", "caution", "Caution"],
  ] as const;
  const source = alertKinds.map(([marker, _kind, label], index) => {
    const lines = ["> [!" + marker + "]", "> " + label + " body"];
    if (index === 0) lines.push("> - list item", "> > nested quote");
    return lines.join("\n");
  }).join("\n\n");
  const html = renderMarkdown(source, { settings });

  assert.equal(html.split('class="md-alert md-alert-').length - 1, alertKinds.length);
  assert.equal(html.split('class="md-alert-icon"').length - 1, alertKinds.length);

  for (let index = 0; index < alertKinds.length; index += 1) {
    const [_marker, kind, label] = alertKinds[index];
    const start = html.indexOf('<div class="md-alert md-alert-' + kind + '">');
    const nextKind = alertKinds[index + 1]?.[1];
    const end = nextKind
      ? html.indexOf('<div class="md-alert md-alert-' + nextKind + '">', start)
      : html.length;
    assert.ok(start >= 0, kind);
    const block = html.slice(start, end);

    assert.ok(block.includes('class="md-alert-title md-alert-text md-alert-text-' + kind + '"'), kind);
    assert.ok(block.includes('aria-hidden="true" focusable="false"'), kind);
    assert.ok(block.includes("<path d=") && block.includes("</path>"), kind);
    assert.ok(block.includes('<span class="md-alert-text-container">' + label + "</span>"), kind);
  }

  const noteEnd = html.indexOf('<div class="md-alert md-alert-tip">');
  const noteBlock = html.slice(0, noteEnd);
  assert.ok(noteBlock.includes("<ul>"));
  assert.ok(noteBlock.includes("<blockquote>"));
});

test("renderMarkdown supports abbreviation definitions like Typora", () => {
  const html = renderMarkdown([
    "Use HTML and HTML5 with `HTML`.",
    "",
    "*[HTML]: Hyper Text \"Markup\" Language",
  ].join("\n"), { settings });

  assert.match(html, /Use <abbr title="Hyper Text &quot;Markup&quot; Language">HTML<\/abbr> and HTML5 with <code>HTML<\/code>\./);
  assert.doesNotMatch(html, /\*\[HTML]:/);
});

test("renderMarkdown resolves abbreviation definitions from the full document like Typora", () => {
  const html = renderMarkdown("HTML appears in this block.", {
    settings,
    documentSource: [
      "HTML appears in this block.",
      "",
      "*[HTML]: Hyper Text Markup Language",
    ].join("\n"),
  });

  assert.match(html, /<abbr title="Hyper Text Markup Language">HTML<\/abbr> appears/);
});

test("renderMarkdown supports quoted abbreviation definitions like Typora", () => {
  const html = renderMarkdown("> Use HTML here.\n> *[HTML]: Hyper Text Markup Language", { settings });

  assert.match(html, /<blockquote>/);
  assert.match(html, /Use <abbr title="Hyper Text Markup Language">HTML<\/abbr> here\./);
  assert.doesNotMatch(html, /\*\[HTML]:/);
});

test("renderMarkdown ignores abbreviation definitions inside code blocks like Typora", () => {
  const html = renderMarkdown([
    "HTML stays plain.",
    "",
    "```",
    "*[HTML]: Hidden title",
    "```",
  ].join("\n"), { settings });

  assert.doesNotMatch(html, /<abbr/);
  assert.match(html, /HTML stays plain/);
  assert.match(html, /\*\[HTML]: Hidden title/);
});

test("renderMarkdown keeps generated abbreviations when raw html is disabled", () => {
  const html = renderMarkdown("HTML <b>HTML</b>\n\n*[HTML]: Hyper Text", {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
  });

  assert.match(html, /<abbr title="Hyper Text">HTML<\/abbr>/);
  assert.match(html, /&lt;b&gt;<abbr title="Hyper Text">HTML<\/abbr>&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>/);
});

test("renderMarkdown does not rewrite link or image destinations with abbreviations", () => {
  const html = renderMarkdown([
    "Read [HTML](https://HTML.example/path) and see ![HTML](assets/HTML.png).",
    "",
    "*[HTML]: Hyper Text Markup Language",
  ].join("\n"), { settings });

  assert.match(html, /<a href="https:\/\/HTML\.example\/path"[^>]*><abbr title="Hyper Text Markup Language">HTML<\/abbr><\/a>/);
  assert.match(html, /<img src="assets\/HTML\.png" alt="HTML"[^>]*>/);
  assert.doesNotMatch(html, /href="[^"]*abbr/);
  assert.doesNotMatch(html, /src="[^"]*abbr/);
});

test("renderMarkdown does not rewrite reference definition targets with abbreviations", () => {
  const html = renderMarkdown([
    "Read [HTML][docs].",
    "",
    "[docs]: https://HTML.example/path \"HTML title\"",
    "*[HTML]: Hyper Text Markup Language",
  ].join("\n"), { settings });

  assert.match(html, /<a href="https:\/\/HTML\.example\/path" title="HTML title"[^>]*><abbr title="Hyper Text Markup Language">HTML<\/abbr><\/a>/);
  assert.doesNotMatch(html, /href="[^"]*abbr/);
});

test("renderMarkdown preserves collapsed and shortcut reference links with abbreviations", () => {
  const html = renderMarkdown([
    "Read [HTML][] and [HTML].",
    "",
    "[HTML]: https://HTML.example/path",
    "*[HTML]: Hyper Text Markup Language",
  ].join("\n"), { settings });

  assert.match(html, /<a href="https:\/\/HTML\.example\/path"[^>]*><abbr title="Hyper Text Markup Language">HTML<\/abbr><\/a> and <a href="https:\/\/HTML\.example\/path"[^>]*><abbr title="Hyper Text Markup Language">HTML<\/abbr><\/a>/);
  assert.doesNotMatch(html, /href="[^"]*abbr/);
});

test("renderMarkdown supports definition lists like Typora", () => {
  const html = renderMarkdown([
    "Term **one**",
    ": Definition with [link](https://example.com)",
    ": Second `code`",
    "Another term",
    ": ==Marked== value",
    "",
    "Next paragraph",
  ].join("\n"), {
    settings: {
      ...settings,
      extensions: { ...settings.extensions, marks: true },
    },
  });

  assert.match(html, /<dl class="definition-list">/);
  assert.match(html, /<dt>Term <strong>one<\/strong><\/dt>/);
  assert.match(html, /<dd>Definition with <a href="https:\/\/example\.com"[^>]*>link<\/a><\/dd>/);
  assert.match(html, /<dd>Second <code>code<\/code><\/dd>/);
  assert.match(html, /<dt>Another term<\/dt>/);
  assert.match(html, /<dd><mark>Marked<\/mark> value<\/dd>/);
  assert.match(html, /<p>Next paragraph<\/p>/);
});

test("renderMarkdown supports multi-paragraph definition list items like Typora", () => {
  const html = renderMarkdown([
    "Term",
    ": First paragraph with **bold**",
    "",
    "    Second paragraph with [link](https://example.com)",
    "",
    "Next paragraph",
  ].join("\n"), { settings });

  assert.match(html, /<dl class="definition-list">/);
  assert.match(html, /<dt>Term<\/dt>/);
  assert.match(html, /<dd><p>First paragraph with <strong>bold<\/strong><\/p>\s*<p>Second paragraph with <a href="https:\/\/example\.com"[^>]*>link<\/a><\/p><\/dd>/);
  assert.match(html, /<p>Next paragraph<\/p>/);
});

test("renderMarkdown keeps loose definition list raw html escaped when html is disabled", () => {
  const html = renderMarkdown([
    "Term",
    ": <b>raw</b>",
    "",
    "    Second **paragraph**",
  ].join("\n"), {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
  });

  assert.match(html, /<dd><p>&lt;b&gt;raw&lt;\/b&gt;<\/p>\s*<p>Second <strong>paragraph<\/strong><\/p><\/dd>/);
  assert.doesNotMatch(html, /<b>raw<\/b>/);
});

test("renderMarkdown keeps generated definition lists when raw html is disabled", () => {
  const html = renderMarkdown("Term\n: <b>raw</b> and **bold**", {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        html: false,
      },
    },
  });

  assert.match(html, /<dl class="definition-list">/);
  assert.match(html, /<dd>&lt;b&gt;raw&lt;\/b&gt; and <strong>bold<\/strong><\/dd>/);
  assert.doesNotMatch(html, /<b>raw<\/b>/);
});

test("renderMarkdown supports definition lists inside blockquotes like Typora", () => {
  const html = renderMarkdown("> Term **one**\n> : Definition with `code`\n>\n> After", { settings });

  assert.match(html, /<blockquote>/);
  assert.match(html, /<dl class="definition-list">/);
  assert.match(html, /<dt>Term <strong>one<\/strong><\/dt>/);
  assert.match(html, /<dd>Definition with <code>code<\/code><\/dd>/);
  assert.match(html, /<p>After<\/p>/);
});

test("renderMarkdown supports loose definition lists inside blockquotes like Typora", () => {
  const html = renderMarkdown("> Term\n> : First paragraph\n>\n>     Second paragraph", { settings });

  assert.match(html, /<blockquote>/);
  assert.match(html, /<dl class="definition-list">/);
  assert.match(html, /<dd><p>First paragraph<\/p>\s*<p>Second paragraph<\/p><\/dd>/);
});

test("renderMarkdown supports lightly indented TOC blocks like Typora", () => {
  const toc = renderMarkdown("  [toc]\n\n    [toc]", {
    settings,
    outline: [{ id: "intro", title: "Intro", level: 1, line: 1 }],
  });

  assert.match(toc, /<nav class="toc-inline">/);
  assert.equal(toc.match(/<nav class="toc-inline">/g)?.length, 1);
  assert.match(toc, /<pre><code>\[toc\]\n<\/code><\/pre>/);
});

test("renderMarkdown 支持 Typora 的全部独立 TOC 标记并拒绝不完整形式", () => {
  const outline = [{ id: "intro", title: "Intro", level: 1, line: 1 }];
  for (const marker of ["[ToC]", "{:toc}", "[[_TOC_]]", "{: toc depth=3 }"]) {
    const html = renderMarkdown(marker, { settings, outline });
    assert.equal(html.match(/<nav class="toc-inline">/g)?.length, 1, marker);
    assert.match(html, /href="#intro"/, marker);
  }

  for (const marker of ["    {:toc}", "{: toc", "{: toc } trailing", "[[_TOC_]] trailing"]) {
    const html = renderMarkdown(marker, { settings, outline });
    assert.doesNotMatch(html, /toc-inline/, marker);
  }
});

test('renderMarkdown keeps Mermaid shortcodes out of literal blocks', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const literalSources = [
    [fence + 'md', '{{< mermaid >}}', 'flowchart LR', 'A --> B', '{{< /mermaid >}}', fence].join('\n'),
    ['    {{< mermaid >}}', '    flowchart LR', '    A --> B', '    {{< /mermaid >}}'].join('\n'),
    ['<pre>', '{{< mermaid >}}', 'flowchart LR', 'A --> B', '{{< /mermaid >}}', '</pre>'].join('\n'),
  ];

  for (const source of literalSources) {
    const html = renderMarkdown(source, { settings });
    assert.doesNotMatch(html, /mermaid-diagram/);
    assert.match(html, /\{\{(?:&lt;|<)\s*mermaid/);
  }

  const rendered = renderMarkdown(
    ['{{< mermaid >}}', 'flowchart LR', 'A --> B', '{{< /mermaid >}}'].join('\n'),
    { settings },
  );
  assert.equal(rendered.match(/mermaid-diagram/g)?.length, 1);
  assert.match(rendered, /data-diagram-source=[^>]*flowchart LR/);
});

test('renderMarkdown converts Mermaid shortcode before other extensions preprocess its body', () => {
  const shortcode = [
    '{{< mermaid >}}',
    '[TOC]',
    '> [!NOTE]',
    '> body',
    'flowchart LR',
    'A[^id] --> B',
    '{{< /mermaid >}}',
  ].join('\n');
  const html = renderMarkdown(shortcode, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        footnote: false,
      },
    },
    outline: [{ id: 'intro', title: 'Intro', level: 1, line: 1 }],
  });

  assert.equal(html.match(/mermaid-diagram/g)?.length, 1);
  assert.doesNotMatch(html, /toc-inline|md-alert-note|footnote-ref/);
  assert.match(html, /data-diagram-source=[^>]*\[TOC\]/);
  assert.match(html, /data-diagram-source=[^>]*\[\^id\]/);
  assert.doesNotMatch(html, /data-diagram-source=[^>]*\\\[\\\^id\]/);
});

test("renderMarkdown respects the footnote extension toggle", () => {
  const source = "note[^1]\n\n[^1]: detail";
  const enabled = renderMarkdown(source, { settings });
  assert.match(enabled, /footnote-ref/);
  assert.match(enabled, /footnotes/);
  assert.match(enabled, /title="detail"/);

  const disabled = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        footnote: false,
      },
    },
  });
  assert.doesNotMatch(disabled, /footnote-ref|footnotes/);
  assert.match(disabled, /\[\^1]/);
});

test("脚注引用提供包含多段内容的 Typora 风格悬停摘要", () => {
  const source = [
    "note[^long]",
    "",
    "[^long]: First **bold** paragraph.",
    "",
    "    Second [linked](https://example.com) paragraph.",
  ].join("\n");
  const summary = "First bold paragraph. Second linked paragraph.";
  const html = renderMarkdown(source, { settings });

  assert.equal(getMarkdownFootnoteSummary(source, "long"), summary);
  assert.match(html, new RegExp(`class="footnote-ref"><a title="${summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
});

test('脚注悬停摘要移除引用块标记', () => {
  const source = [
    '> Text[^note]',
    '>',
    '> [^note]: First **bold** paragraph.',
    '>     Second [linked](https://example.com) paragraph.',
  ].join(String.fromCharCode(10));
  const html = renderMarkdown(source, { settings });

  assert.equal(getMarkdownFootnoteSummary(source, 'note'), 'First bold paragraph. Second linked paragraph.');
  assert.match(html, /title="First bold paragraph[.] Second linked paragraph[.]"/);
});

test('嵌套引用脚注摘要保留正文和续行内容', () => {
  const source = [
    '> > Text[^note]',
    '> >',
    '> > [^note]: First paragraph.',
    '> >     Second paragraph.',
  ].join(String.fromCharCode(10));
  const html = renderMarkdown(source, { settings });

  assert.equal(getMarkdownFootnoteSummary(source, 'note'), 'First paragraph. Second paragraph.');
  assert.match(html, /title="First paragraph[.] Second paragraph[.]"/);
  assert.equal(html.match(/class="footnote-ref"/g)?.length, 1);
});

test("renderMarkdown keeps standalone footnote definition blocks editable", () => {
  const html = renderMarkdown("[^1]: detail\n    continuation", { settings });

  assert.match(html, /footnote-definition-block/);
  assert.match(html, /\[\^1]: detail/);
  assert.match(html, /continuation/);
});

test("renderMarkdown keeps standalone footnote paragraph continuations editable like Typora", () => {
  const html = renderMarkdown("[^1]: detail\ncontinued text", { settings });

  assert.match(html, /footnote-definition-block/);
  assert.match(html, /continued text/);
});

test("renderMarkdown treats heavily indented footnote-looking blocks as code like Typora", () => {
  const spaces = renderMarkdown("    [^1]: code", { settings });
  assert.doesNotMatch(spaces, /footnote-definition-block/);
  assert.match(spaces, /<pre><code/);
  assert.match(spaces, /\[\^1]: code/);

  const tab = renderMarkdown("\t[^1]: code", { settings });
  assert.doesNotMatch(tab, /footnote-definition-block/);
  assert.match(tab, /<pre><code/);
  assert.match(tab, /\[\^1]: code/);
});

test("renderMarkdown normalizes quoted and listed footnotes for fragments", () => {
  const documentSource = [
    "Text[^quote] and [^list].",
    "",
    "> [^quote]: Quote first.",
    ">     Quote second.",
    "",
    "- [^list]: List first.",
    "",
    "      List second.",
  ].join("\n");
  const html = renderMarkdown("Text[^quote] and [^list].", {
    settings,
    documentSource,
  });

  assert.equal(html.match(/class="footnote-ref"/g)?.length, 2);
  assert.match(html, /Quote first\./);
  assert.match(html, /Quote second\./);
  assert.match(html, /List first\./);
  assert.match(html, /List second\./);
  assert.doesNotMatch(html, /<blockquote|<ul>/);
  assert.equal(hasMarkdownFootnoteDefinition("- [^list]: List detail.", "list"), true);
  assert.equal(getMarkdownFootnoteSummary(documentSource, "list"), "List first. List second.");
});

test("renderMarkdown renders documents that start with footnotes like Typora", () => {
  const source = "[^1]: detail\n\nText with note[^1].";
  const html = renderMarkdown(source, { settings });

  assert.doesNotMatch(html, /footnote-definition-block/);
  assert.match(html, /Text with note/);
  assert.match(html, /footnote-ref/);
  assert.match(html, /footnotes/);
});

test("renderMarkdown resolves lightly indented footnotes from the full document like Typora", () => {
  const html = renderMarkdown("Text with note[^1].", {
    settings,
    documentSource: [
      "Text with note[^1].",
      "",
      "   [^1]: detail",
    ].join("\n"),
  });

  assert.match(html, /footnote-ref/);
  assert.match(html, /footnotes/);
  assert.match(html, /detail/);
});

test("renderMarkdown resolves plain footnote continuation lines from the full document like Typora", () => {
  const html = renderMarkdown("Text with note[^1].", {
    settings,
    documentSource: [
      "Text with note[^1].",
      "",
      "[^1]: detail",
      "continued text",
    ].join("\n"),
  });

  assert.match(html, /detail\s+continued text/);
});

test("renderMarkdown ignores footnote definitions inside code fences like Typora", () => {
  const html = renderMarkdown("Text with note[^1].", {
    settings,
    documentSource: [
      "Text with note[^1].",
      "",
      "```",
      "[^1]: Bad note",
      "```",
      "",
      "[^1]: Good note",
    ].join("\n"),
  });

  assert.match(html, /Good note/);
  assert.doesNotMatch(html, /Bad note/);
});

test("renderMarkdown excludes interrupting blocks after footnote definitions like Typora", () => {
  const html = renderMarkdown("Text with note[^1].", {
    settings,
    documentSource: [
      "Text with note[^1].",
      "",
      "[^1]: detail",
      "# Outside heading",
    ].join("\n"),
  });

  assert.match(html, /detail/);
  assert.doesNotMatch(html, /<h1/);
  assert.doesNotMatch(html, /Outside heading/);
});

test("createOutline ignores headings inside code fences and front matter", () => {
  const outline = createOutline("---\ntitle: # no\n---\n\n# Real\n\n```md\n# Hidden\n```\n\n## Child");

  assert.deepEqual(outline.map((item) => item.title), ["Real", "Child"]);
});

test("createOutline does not treat five-space list content as a fenced block", () => {
  const outline = createOutline([
    "-     ~~~md",
    "      # Hidden in indented code",
    "      ~~~",
    "> -     ~~~md",
    ">       ## Hidden in quoted indented code",
    ">       ~~~",
    "# Visible",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Visible"]);
});

test("renderMarkdown and outline treat UTF-8 BOM front matter like Typora", () => {
  const source = "\uFEFF---\ntitle: # Hidden\n---\n\n# Real";
  const html = renderMarkdown(source, { settings });
  const outline = createOutline(source);

  assert.match(html, /frontmatter-block/);
  assert.match(html, /<code>title: # Hidden<\/code>/);
  assert.doesNotMatch(html, /<code>---/);
  assert.doesNotMatch(html, /<h1[^>]*>\s*title:/);
  assert.deepEqual(outline.map((item) => item.title), ["Real"]);
});

test("createOutline ignores headings inside indented code blocks", () => {
  const outline = createOutline([
    "    # Hidden",
    "    Hidden Setext",
    "    ---",
    "",
    "# Visible",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Visible"]);
});

test("createOutline ignores headings inside math fences", () => {
  const outline = createOutline([
    "# Real",
    "",
    "$$",
    "# Hidden",
    "x = y",
    "$$",
    "",
    "\\[",
    "## Also Hidden",
    "\\]",
    "",
    "## Child",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Real", "Child"]);
});

test("createOutline ignores headings inside raw HTML blocks like Typora", () => {
  const outline = createOutline([
    "<div>",
    "# Hidden",
    "</div>",
    "# Still hidden",
    "",
    "# Visible",
    "<script>",
    "# Script hidden",
    "</script>",
    "## After script",
    "<!--",
    "### Comment hidden",
    "-->",
    "### After comment",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Visible", "After script", "After comment"]);
});

test("createOutline ends quoted raw HTML blocks on blank quote lines like Typora", () => {
  const outline = createOutline([
    "> <section>",
    "> # Hidden",
    "> </section>",
    "> # Still hidden",
    ">",
    "> # Quoted visible",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Quoted visible"]);
});

test("createOutline includes setext headings like Typora", () => {
  const outline = createOutline([
    "Title *One*",
    "===",
    "",
    "Subtitle [Link](https://example.com)",
    "---",
    "",
    "---",
    "",
    "# ATX",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Title One", "Subtitle Link", "ATX"]);
  assert.deepEqual(outline.map((item) => item.level), [1, 2, 1]);
  assert.deepEqual(outline.map((item) => item.line), [1, 4, 9]);
});

test("createOutline combines multiline Setext headings and uses the first source line", () => {
  const outline = createOutline([
    "First *line*",
    "Second [line](https://example.com)",
    "---",
    "",
    "> Quoted first",
    "> quoted second",
    "> ===",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), [
    "First line Second line",
    "Quoted first quoted second",
  ]);
  assert.deepEqual(outline.map((item) => item.level), [2, 1]);
  assert.deepEqual(outline.map((item) => item.line), [1, 5]);
});

test("createOutline ignores headings inside textarea blocks with blank lines", () => {
  const outline = createOutline([
    "<textarea>",
    "# Hidden",
    "",
    "Hidden Setext",
    "---",
    "</textarea>",
    "# Visible",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Visible"]);
});

test("createOutline includes headings inside blockquotes like Typora", () => {
  const outline = createOutline([
    "> # Quoted **Head**",
    "> text",
    "> > ## Nested [Link](https://example.com)",
    "# Plain",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Quoted Head", "Nested Link", "Plain"]);
  assert.deepEqual(outline.map((item) => item.level), [1, 2, 1]);
  assert.deepEqual(outline.map((item) => item.line), [1, 3, 4]);
});

test("createOutline includes quoted Setext headings and ignores quoted fences", () => {
  const outline = createOutline([
    "> Quoted *Setext*",
    "> ---",
    "",
    "> ```md",
    "> # Hidden",
    "> ```",
    "",
    "> # Visible",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["Quoted Setext", "Visible"]);
  assert.deepEqual(outline.map((item) => item.level), [2, 1]);
  assert.deepEqual(outline.map((item) => item.line), [1, 8]);
});

test("createOutline strips reference links, images, and html from heading text", () => {
  const outline = createOutline([
    "# Title [Ref][id] ![Logo][logo] <small>raw</small>",
    "",
    "![Alt](logo.png) [Inline](https://example.com)",
    "---",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), [
    "Title Ref Logo raw",
    "Alt Inline",
  ]);
});

test("createOutline strips complex link wrappers like Typora", () => {
  const outline = createOutline([
    "# [API [v2]](<https://example.com/a(b)> \"Docs\")",
    "",
    "![Logo [dark]][logo-ref]",
    "---",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), ["API [v2]", "Logo [dark]"]);
  assert.deepEqual(outline.map((item) => item.id), ["api-v2", "logo-dark"]);
});

test("createOutline keeps automatic link text like Typora", () => {
  const outline = createOutline("# Visit <https://example.com/docs>");

  assert.equal(outline[0].title, "Visit https://example.com/docs");
  assert.equal(outline[0].id, "visit-httpsexamplecomdocs");
});

test("createOutline keeps custom and local autolink text like Typora", () => {
  const outline = createOutline([
    "# Open <obsidian://open?vault=docs>",
    "## File <file:///C:/docs/a.md>",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), [
    "Open obsidian://open?vault=docs",
    "File file:///C:/docs/a.md",
  ]);
  assert.deepEqual(outline.map((item) => item.id), [
    "open-obsidianopenvaultdocs",
    "file-filecdocsamd",
  ]);
});

test("createOutline strips multi-backtick code span markers", () => {
  const outline = createOutline("# ``npm `test` command``");

  assert.equal(outline[0].title, "npm `test` command");
});

test("createOutline strips padded code span markers like Typora", () => {
  const outline = createOutline("# `` `cmd` ``");

  assert.equal(outline[0].title, "`cmd`");
  assert.equal(outline[0].id, "cmd");
});

test("createOutline preserves literal heading punctuation like Typora", () => {
  const outline = createOutline([
    "# C# Guide = v2",
    "",
    "## ==Marked== H~2~O x^2^",
    "",
    "# C#",
    "",
    "## Title###",
    "",
    "### Title ###",
  ].join("\n"));

  assert.deepEqual(outline.map((item) => item.title), [
    "C# Guide = v2",
    "Marked H2O x2",
    "C#",
    "Title###",
    "Title",
  ]);
});

test("createOutline unescapes backslash-escaped heading text like Typora", () => {
  const source = "# \\*Literal\\* \\[brackets\\] C\\#";
  const outline = createOutline(source);
  const html = renderMarkdown(source, { settings, outline });

  assert.equal(outline[0].title, "*Literal* [brackets] C#");
  assert.equal(outline[0].id, "literal-brackets-c");
  assert.match(html, /<h1 id="literal-brackets-c"[^>]*>/);
});

test("createOutline decodes heading entities to match rendered heading ids", () => {
  const source = [
    "# AT&amp;T &lt;API&gt;",
    "",
    "## Escaped \\&amp; literal",
  ].join("\n");
  const outline = createOutline(source);
  const html = renderMarkdown(source, { settings, outline });

  assert.deepEqual(outline.map((item) => ({ title: item.title, id: item.id })), [
    { title: "AT&T <API>", id: "att-api" },
    { title: "Escaped &amp; literal", id: "escaped-amp-literal" },
  ]);
  assert.ok(html.includes('id="att-api"'));
  assert.ok(html.includes('id="escaped-amp-literal"'));
});

test("createOutline includes ATX headings nested in list items", () => {
  const source = [
    "- # Root",
    "  - ## Nested",
    "1. ### Ordered",
    "",
    "> - #### Quoted list",
    "",
    "```md",
    "- # Hidden",
    "```",
    "-     # Indented code",
    "1234567890. # Large ordered",
  ].join("\n");
  const outline = createOutline(source);
  const html = renderMarkdown(source, { settings, outline });

  assert.deepEqual(outline.map((item) => ({ title: item.title, level: item.level, line: item.line })), [
    { title: "Root", level: 1, line: 1 },
    { title: "Nested", level: 2, line: 2 },
    { title: "Ordered", level: 3, line: 3 },
    { title: "Quoted list", level: 4, line: 5 },
    { title: "Large ordered", level: 1, line: 11 },
  ]);
  assert.match(html, /<h1 id="root"[^>]*>Root<\/h1>/);
  assert.match(html, /<h2 id="nested"[^>]*>Nested<\/h2>/);
  assert.match(html, /<h3 id="ordered"[^>]*>Ordered<\/h3>/);
  assert.match(html, /<h4 id="quoted-list"[^>]*>Quoted list<\/h4>/);
  assert.match(html, /<h1 id="large-ordered"[^>]*>Large ordered<\/h1>/);
  assert.doesNotMatch(html, /id="hidden"|id="indented-code"/);
});

test("renderMarkdown heading ids stay consistent with duplicate outline ids", () => {
  const source = "> # Same\n\n# Same";
  const outline = createOutline(source);
  const html = renderMarkdown(source, { settings, outline });

  assert.deepEqual(outline.map((item) => item.id), ["same", "same-1"]);
  assert.match(html, /<h1 id="same"[^>]*>/);
  assert.match(html, /<h1 id="same-1"[^>]*>/);
});

test("renderMarkdown keeps HTML markup literal when footnotes are disabled", () => {
  const source = '<span data-note="[^attr]">body[^body]</span><!-- [^comment] -->';

  const enabled = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        footnote: false,
        html: true,
      },
    },
  });
  assert.match(enabled, /data-note="\[\^attr]"/);
  assert.match(enabled, /<!-- \[\^comment] -->/);
  assert.doesNotMatch(enabled, /footnote-ref|\\\[\^attr]|\\\[\^comment]/);

  const disabled = renderMarkdown(source, {
    settings: {
      ...settings,
      extensions: {
        ...settings.extensions,
        footnote: false,
        html: false,
      },
    },
  });
  assert.match(disabled, /&lt;span data-note=&quot;\[\^attr]&quot;&gt;/);
  assert.match(disabled, /&lt;!-- \[\^comment] --&gt;/);
  assert.doesNotMatch(disabled, /footnote-ref|\\\[\^attr]|\\\[\^comment]/);
});

test("renderMarkdown normalizes contained definitions in a complete document", () => {
  const source = [
    "Read [Quote][quote] and [List][list]. Notes[^quote-note] and [^list-note].",
    "",
    "> [quote]: /quote.md",
    '>   "Quote title"',
    "",
    "- [list]: /list.md",
    '  "List title"',
    "",
    "> [^quote-note]: Quote first.",
    ">     Quote second.",
    "",
    "- [^list-note]: List first.",
    "",
    "      List second.",
  ].join("\n");
  const html = renderMarkdown(source, { settings });

  assert.match(html, /href="\/quote\.md" title="Quote title"[^>]*>Quote<\/a>/);
  assert.match(html, /href="\/list\.md" title="List title"[^>]*>List<\/a>/);
  assert.equal(html.match(/class="footnote-ref"/g)?.length, 2);
  assert.match(html, /Quote first\./);
  assert.match(html, /Quote second\./);
  assert.match(html, /List first\./);
  assert.match(html, /List second\./);
  assert.doesNotMatch(html, /<blockquote|<ul>/);
});

test("renderMarkdown leaves contained definition lookalikes in literal blocks", () => {
  const fence = String.fromCharCode(96).repeat(3);
  const source = [
    "Read [Docs][docs].",
    "",
    fence,
    "> [docs]: https://bad.example/fence",
    fence,
    "",
    "<div>",
    "- [docs]: https://bad.example/html",
    "</div>",
    "",
    "[docs]: https://good.example/docs",
  ].join("\n");
  const html = renderMarkdown(source, { settings });

  assert.match(html, /href="https:\/\/good\.example\/docs"[^>]*>Docs<\/a>/);
  assert.match(html, /bad\.example\/fence/);
  assert.match(html, /bad\.example\/html/);
});

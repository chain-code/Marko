// 1.7、1.11 节：文档模型 → HTML。结构和类名照 Typora 导出的 HTML
import { parse } from "@marko/markdown";
import { beforeAll, describe, expect, it } from "vitest";
import { loadLanguages } from "../src/highlight.ts";
import { diagramKey, mathItemsOf, renderHtml, type RenderOptions } from "../src/html.ts";
import { loadMathFonts } from "../src/math.ts";

const html = (source: string, options: RenderOptions = {}) => renderHtml(parse(source, { syntax: options.syntax }), options);

beforeAll(async () => {
  await loadLanguages(["js", "python"]);
});

describe("块", () => {
  it("标题带 Typora 规则的锚点 id；段落、分隔线", () => {
    expect(html("# Hello World\n\ntext\n\n---")).toBe('<h1 id="hello-world">Hello World</h1>\n<p>text</p>\n<hr>');
  });

  it("引用和 Callout（同 Typora 的导出：图标和标题在第一段开头，换行接正文）", () => {
    const icon = (output: string) => output.replace(/<svg[\s\S]*?<\/svg>/, "<svg/>");
    expect(html("> quote")).toBe("<blockquote><p>quote</p></blockquote>");
    expect(icon(html("> [!WARNING]\n> careful"))).toBe(
      '<div class="md-alert md-alert-warning warning"><p><span class="md-alert-text md-alert-text-warning"><svg/>Warning</span><br>careful</p></div>',
    );
    // 第一块不是段落时标题单独成段
    expect(icon(html("> [!TIP]\n> - item"))).toBe(
      '<div class="md-alert md-alert-tip tip"><p><span class="md-alert-text md-alert-text-tip"><svg/>Tip</span></p><ul><li><p>item</p></li></ul></div>',
    );
    // 图标是 Octicons 的 SVG，1em 大小，读屏软件跳过
    expect(html("> [!NOTE]\n> x")).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" aria-hidden="true" viewBox="0 0 16 16"><path d="M0 8a8 8 0 1 1 16 0');
  });

  it("列表、有序列表的起始序号、任务列表", () => {
    expect(html("- a\n- b")).toBe("<ul><li><p>a</p></li><li><p>b</p></li></ul>");
    expect(html("3. a")).toBe('<ol start="3"><li><p>a</p></li></ol>');
    expect(html("- [x] done\n- [ ] todo")).toBe(
      '<ul><li class="md-task-list-item task-list-item task-list-done"><input type="checkbox" checked><p>done</p></li><li class="md-task-list-item task-list-item task-list-not-done"><input type="checkbox"><p>todo</p></li></ul>',
    );
  });

  it("容器里的块之间不加换行（导出页的 li 是 pre-wrap，换行会显示成空行）；顶层的块之间换行", () => {
    expect(html("- a\n\n  b\n  - c\n\n> d\n>\n> e")).toBe("<ul><li><p>a</p><p>b</p><ul><li><p>c</p></li></ul></li></ul>\n<blockquote><p>d</p><p>e</p></blockquote>");
  });

  it("单独成段的图片居中（M-1，同 Typora）；和文字在一起的不算", () => {
    expect(html("![a](p.png)")).toBe('<p><span class="md-image"><img src="p.png" alt="a" referrerpolicy="no-referrer"></span></p>');
    expect(html("text ![a](p.png)")).toBe('<p>text <img src="p.png" alt="a" referrerpolicy="no-referrer"></p>');
  });

  it("代码块：结构同 Typora 导出（CodeMirror 的 DOM），按语言高亮，类名是 CodeMirror 5 的 cm-*（A-3）", () => {
    const output = html("```js\nconst a = 1;\n```");
    expect(output).toMatch(/^<pre class="md-fences" spellcheck="false" lang="js"><div class="CodeMirror cm-s-inner" lang="js"><div class="CodeMirror-code" role="presentation"><pre class="CodeMirror-line" role="presentation"><span role="presentation">/);
    expect(output).toContain('<span class="cm-keyword">const</span> <span class="cm-def">a</span>');
    expect(html("```\n<b>raw</b>\n```")).toBe(
      '<pre class="md-fences" spellcheck="false"><div class="CodeMirror cm-s-inner"><div class="CodeMirror-code" role="presentation"><pre class="CodeMirror-line" role="presentation"><span role="presentation">&lt;b&gt;raw&lt;/b&gt;</span></pre></div></div></pre>',
    );
  });

  it("每行一个 pre.CodeMirror-line，空行放零宽空格（同 CodeMirror）；显示行号时加类名，序号由 CSS 生成", () => {
    expect(html("```\na\n\nb\n```", { codeLineNumbers: true })).toBe(
      '<pre class="md-fences md-fences-with-lineno" spellcheck="false"><div class="CodeMirror cm-s-inner"><div class="CodeMirror-code" role="presentation">' +
        '<pre class="CodeMirror-line" role="presentation"><span role="presentation">a</span></pre>' +
        '<pre class="CodeMirror-line" role="presentation"><span role="presentation"><span cm-text="">​</span></span></pre>' +
        '<pre class="CodeMirror-line" role="presentation"><span role="presentation">b</span></pre></div></div></pre>',
    );
  });

  it("「HTML（不含样式）」：代码块是语义化的 <pre><code>，不带高亮（同 Typora）", () => {
    expect(html("```js\nconst a = 1;\n```", { noStyle: true })).toBe('<pre><code class="language-js" lang="js">const a = 1;</code></pre>');
  });

  it("代码里混进占位用的私用区字符时不会被当成占位", () => {
    expect(html("$x$\n\n```\n0\n```")).toContain("�0�");
  });

  it("表格：figure.table-figure，对齐写在单元格上，缺的单元格补空的", () => {
    expect(html("| a | b |\n|:-|-:|\n| 1 |")).toBe(
      '<figure class="table-figure"><table><thead><tr><th style="text-align:left">a</th><th style="text-align:right">b</th></tr></thead><tbody><tr><td style="text-align:left">1</td><td style="text-align:right"></td></tr></tbody></table></figure>',
    );
  });

  it("目录按标题生成", () => {
    expect(html("[TOC]\n\n# One\n\n## Two")).toBe(
      '<div class="md-toc"><p class="md-toc-content" role="list"><span role="listitem" class="md-toc-item md-toc-h1"><a class="md-toc-inner" href="#one">One</a></span><span role="listitem" class="md-toc-item md-toc-h2"><a class="md-toc-inner" href="#two">Two</a></span></p></div>\n<h1 id="one">One</h1>\n<h2 id="two">Two</h2>',
    );
  });

  it("定义列表：只有一段的说明不包 <p>，多段的包", () => {
    expect(html("Term\n: one\n: two")).toBe('<dl class="definition-list"><dt>Term</dt><dd>one</dd><dd>two</dd></dl>');
    expect(html("Term\n: First\n\n    Second")).toBe('<dl class="definition-list"><dt>Term</dt><dd><p>First</p><p>Second</p></dd></dl>');
  });

  it("Front Matter、链接引用定义、缩写定义、HTML 注释不输出", () => {
    expect(html("---\na: 1\n---\n\n[r]: /u\n\n*[A]: Abbr\n\n<!-- c -->\n\nend")).toBe("<p>end</p>");
  });
});

describe("行内", () => {
  it("强调、代码、删除线、链接、自动链接、硬换行", () => {
    expect(html("**b** *i* `c` ~~d~~ [l](http://x \"T\") <https://y> a  \nb")).toBe(
      '<p><strong>b</strong> <em>i</em> <code>c</code> <del>d</del> <a href="http://x" title="T">l</a> <a href="https://y">https://y</a> a<br>\nb</p>',
    );
  });

  it("引用式链接按定义解析；没有定义的方括号照原样", () => {
    expect(html("[a][r] [b]\n\n[r]: /url 'T'")).toBe('<p><a href="/url" title="T">a</a> [b]</p>');
  });

  it("图片：替代文字去掉标记，地址交给 resolveUrl", () => {
    expect(html("![a *b*](pic.png)", { resolveUrl: (url) => `marko-asset://x/${url}` })).toBe(
      '<p><span class="md-image"><img src="marko-asset://x/pic.png" alt="a b" referrerpolicy="no-referrer"></span></p>',
    );
  });

  it("高亮、上下标打开时输出 mark、sup、sub；emoji 换成字符", () => {
    expect(html("==h== ^s^ ~b~ :smile:", { syntax: { highlight: true, superscript: true, subscript: true } })).toBe(
      '<p><mark>h</mark> <sup>s</sup> <sub>b</sub> <span class="md-emoji">😄</span></p>',
    );
    expect(html(":Smile: :not_an_emoji:")).toBe("<p>:Smile: :not_an_emoji:</p>");
  });

  it("缩写加 abbr；智能标点只在文字里换（E-10）", () => {
    expect(html('Use HTML "now" -- ok... `"code"`\n\n*[HTML]: Hyper Text', { smartQuotes: true, smartDashes: true })).toBe(
      '<p>Use <abbr title="Hyper Text">HTML</abbr> \u201Cnow\u201D \u2013 ok\u2026 <code>&quot;code&quot;</code></p>',
    );
  });

  it("软换行默认原样，S-6 保留单个换行时是 <br>", () => {
    expect(html("a\nb")).toBe("<p>a\nb</p>");
    expect(html("a\nb", { preserveLineBreaks: true })).toBe("<p>a<br>\nb</p>");
  });
});

describe("B-11 脚注", () => {
  it("同 Typora 的导出：引用显示按第一次出现排的序号，文末按序号列出，每处引用一个回链", () => {
    // id 照 Typora 导出：第一处 ref-footnote-1，同一脚注之后的 ref-footnote-1-1
    expect(html("A[^n] B[^m] C[^n].\n\n[^m]: M note.\n[^n]: N note.")).toBe(
      '<p>A<sup class="md-footnote"><a href="#dfref-footnote-1" id="ref-footnote-1">1</a></sup> B<sup class="md-footnote"><a href="#dfref-footnote-2" id="ref-footnote-2">2</a></sup> C<sup class="md-footnote"><a href="#dfref-footnote-1" id="ref-footnote-1-1">1</a></sup>.</p>\n' +
        '<div class="footnotes-area"><hr><div class="footnote-line" id="dfref-footnote-1"><span class="md-fn-count">1</span> N note. <a href="#ref-footnote-1" class="reversefootnote">\u21A9\uFE0E</a> <a href="#ref-footnote-1-1" class="reversefootnote">\u21A9\uFE0E</a></div><div class="footnote-line" id="dfref-footnote-2"><span class="md-fn-count">2</span> M note. <a href="#ref-footnote-2" class="reversefootnote">\u21A9\uFE0E</a></div></div>',
    );
  });

  it("没有定义的引用按原文显示", () => {
    expect(html("Missing[^My Note].")).toBe("<p>Missing[^My Note].</p>");
  });
});

describe("D-1、D-2 公式", () => {
  it("行内公式和公式块渲染成 SVG", () => {
    const output = html("Inline $a^2$.\n\n$$\n\\frac{1}{2}\n$$");
    expect(output).toMatch(/<span class="md-math-inline" data-latex="a\^2"><mjx-container class="MathJax" jax="SVG"/);
    expect(output).toMatch(/<div class="md-math-block" data-latex="\\frac\{1\}\{2\}"><div class="md-math-container"><mjx-container/);
  });

  it("```math 围栏显示成公式（GitLab 写法）", () => {
    expect(html("```math\nx\n```")).toContain('<div class="md-math-block"');
  });

  it("所有公式块都编号时，\\eqref 能引用后面的公式，编号按文档顺序", () => {
    const output = html("$$\na\n$$\n\nSee $\\eqref{eq:b}$.\n\n$$\nb \\label{eq:b}\n$$", { mathNumbering: "all" });
    // SVG 里数字是字形：data-c 是字符编码，(1) 是 28 31 29
    const glyphs = (part: string) => (part.match(/data-c="([0-9A-F]+)"/g) ?? []).map((match) => String.fromCodePoint(Number.parseInt(match.slice(8, -1), 16))).join("");
    const [first, reference, second] = output.split("\n");
    expect(glyphs(first)).toContain("(1)");
    expect(reference).toContain('href="#mjx-eqn%3Aeq%3Ab"');
    expect(glyphs(reference)).toContain("(2)");
    expect(glyphs(second)).toContain("(2)");
  });

  it("D-1 化学式（mhchem）和 physics 宏包", () => {
    const output = html("$\\ce{H2O}$ 和 $\\ket{\\psi}$、$\\dv{f}{x}$");
    expect(output).not.toContain("md-math-error");
    expect(output.match(/<mjx-container/g)).toHaveLength(3);
  });

  it("D-2 默认不编号；只给 AMS 环境编号时 equation 有号、普通公式块没有；\\tag 自定义编号", async () => {
    const glyphs = (part: string) => (part.match(/data-c="([0-9A-F]+)"/g) ?? []).map((match) => String.fromCodePoint(Number.parseInt(match.slice(8, -1), 16))).join("");
    const source = "$$\na\n$$\n\n$$\n\\begin{equation}b\\end{equation}\n$$\n\n$$\nc \\tag{★}\n$$";
    // ★ 在按需加载的字体里（D-1）
    await loadMathFonts(mathItemsOf(parse(source)));
    const [plain, ams, tagged] = html(source).split("\n");
    expect(glyphs(plain)).not.toContain("(1)");
    expect(glyphs(ams)).not.toContain("(1)");
    expect(glyphs(tagged)).toContain("(★)");
    const numbered = html(source, { mathNumbering: "ams" }).split("\n");
    expect(glyphs(numbered[0])).not.toContain("(1)");
    expect(glyphs(numbered[1])).toContain("(1)");
    expect(glyphs(numbered[2])).toContain("(★)");
  });

  it("D-6 源码有错时显示源码和错误信息", () => {
    const output = html("$$\n\\frac{1}{2\n$$");
    expect(output).toMatch(/^<div class="md-math-block md-math-error"><pre>\\frac\{1\}\{2<\/pre><p class="md-math-error-message">.+<\/p><\/div>$/);
  });

  it("关掉公式时 $ 是普通字符", () => {
    expect(html("$x$", { syntax: { math: false } })).toBe("<p>$x$</p>");
  });
});

describe("D-3、D-4 图表", () => {
  it("有预先渲染好的 SVG 时放进 md-diagram-panel，没有时按代码块输出（做上记号，等着渲染）", () => {
    const source = "```mermaid\ngraph TD\n```";
    expect(html(source)).toBe(
      '<pre class="md-fences md-diagram-source" spellcheck="false" lang="mermaid" data-diagram="mermaid"><div class="CodeMirror cm-s-inner" lang="mermaid"><div class="CodeMirror-code" role="presentation"><pre class="CodeMirror-line" role="presentation"><span role="presentation">graph TD</span></pre></div></div></pre>',
    );
    const diagrams = new Map([[diagramKey("mermaid", "graph TD"), "<svg><g></g></svg>"]]);
    expect(html(source, { diagrams })).toBe('<div class="md-diagram-panel" lang="mermaid"><div class="md-diagram-panel-preview"><svg><g></g></svg></div></div>');
    // 「HTML（不含样式）」里图表也是代码（同 Typora）
    expect(html(source, { diagrams, noStyle: true })).toBe('<pre><code class="language-mermaid" lang="mermaid">graph TD</code></pre>');
  });

  it("S-8 关掉某种图表后按普通代码块显示", () => {
    const sources = { mermaid: "```mermaid\ngraph TD\n```", flowchart: "```flow\nst=>start: A\n```", sequence: "```sequence\nA->B: x\n```" };
    for (const [kind, source] of Object.entries(sources)) {
      expect(html(source)).toContain(`data-diagram="${kind}"`);
      const off = html(source, { syntax: { [kind]: false } });
      expect(off).toMatch(/^<pre class="md-fences" spellcheck="false"/);
      expect(off).not.toContain("data-diagram");
    }
  });
});

describe("X-1 占位（slot）和属性值", () => {
  // 公式、图表的 SVG 先用占位代替，最后再填回去；文档里的文字不能冒充占位
  const OPEN = String.fromCharCode(0xe000);
  const CLOSE = String.fromCharCode(0xe001);
  const parseHtml = (markup: string) => {
    const container = document.createElement("div");
    container.innerHTML = markup;
    return container;
  };

  it("原始 HTML 的属性里写占位字符：iframe 照样带着 sandbox，SVG 不会拼进属性", () => {
    for (const markdown of [`$x$\n\n<iframe src="https://evil.example/${OPEN}0${CLOSE}"></iframe>`, `$x$ <iframe src="https://evil.example/${OPEN}0${CLOSE}"></iframe>`]) {
      const frame = parseHtml(html(markdown)).querySelector("iframe");
      expect(frame?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin allow-presentation");
      expect(frame?.getAttribute("src")).not.toContain("mjx");
    }
  });

  it("实体写出占位字符也不行", () => {
    const output = html("$x$ <b>b</b> &#xE000;0&#xE001; &#57344;0&#57345;");
    expect(output.match(/<mjx-container/g)).toHaveLength(1);
  });

  it("链接、图片的地址和标题里的占位字符去掉", () => {
    const output = html(`$x$ [l](https://a.example/${OPEN}0${CLOSE} "t${OPEN}0${CLOSE}") ![a${OPEN}0${CLOSE}](p${OPEN}0${CLOSE}.png)`);
    const container = parseHtml(output);
    expect(container.querySelector("a")?.getAttribute("href")).not.toContain("<");
    expect(container.querySelector("img")?.getAttribute("src")).not.toContain("<");
    expect(output.match(/<mjx-container/g)).toHaveLength(1);
  });

  it("段落里有行内 HTML 时，行内公式的 data-latex 还在（整个公式放在占位里，不过 DOMPurify）", () => {
    expect(html("$x$ <b>b</b>")).toContain('data-latex="x"');
  });

  it("不是解析器来的模型（ProseMirror JSON、插件）：属性值校验，拼不出坏 HTML", () => {
    const render = (node: object) => renderHtml({ type: "doc", content: [node] } as never);
    const table = render({
      type: "table",
      attrs: { align: ['left" onmouseover="alert(1)'] },
      content: [{ type: "tableRow", content: [{ type: "tableHeader", content: [{ type: "text", text: "a" }] }] }],
    });
    expect(table).toBe('<figure class="table-figure"><table><thead><tr><th>a</th></tr></thead></table></figure>');
    expect(render({ type: "heading", attrs: { level: "x" }, content: [{ type: "text", text: "t" }] })).toBe('<h1 id="t">t</h1>');
    expect(render({ type: "alert", attrs: { kind: "constructor" }, content: [] })).toContain('class="md-alert md-alert-note note"');
    expect(render({ type: "orderedList", attrs: { start: "1 onclick=x" }, content: [] })).toBe("<ol></ol>");
  });
});

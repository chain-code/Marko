import test from "node:test";
import assert from "node:assert/strict";
import { createOutline, getEmojiSuggestions, renderMarkdown } from "../src/utils/markdown";
import { defaultEditorSettings } from "../src/utils/editorSettings";
import type { EditorSettings } from "../src/types";

const settings: EditorSettings = {
  ...defaultEditorSettings,
  extensions: { ...defaultEditorSettings.extensions },
};

test("renderMarkdown renders inline and block math with KaTeX", () => {
  const html = renderMarkdown("Inline $a^2+b^2=c^2$.\n\n$$\n\\frac{1}{2}\n$$", {
    settings,
  });

  assert.match(html, /math-inline/);
  assert.match(html, /math-block/);
  assert.match(html, /katex/);
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
    preserveSingleLineBreaks: false,
    extensions: { ...settings.extensions, autoLinks: false },
  };
  const enabled = {
    ...settings,
    smartPunctuation: true,
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

test("renderMarkdown supports Typora-style bracket math delimiters", () => {
  const html = renderMarkdown("Inline \\(a+b\\).\n\n\\[\n\\frac{1}{2}\n\\]", {
    settings,
  });

  assert.match(html, /math-inline/);
  assert.match(html, /math-block/);
  assert.match(html, /katex/);
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

  assert.doesNotMatch(html, /katex/);
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
  assert.match(html, /katex/);
  assert.doesNotMatch(html, /<p>\$\$/);
  assert.doesNotMatch(html, /\\\[/);
});

test("renderMarkdown supports lightly indented block math without touching indented code", () => {
  const html = renderMarkdown("  $$\n  x+y\n  $$\n\n    $not_math$", { settings });

  assert.equal(html.match(/math-block/g)?.length, 1);
  assert.doesNotMatch(html, /math-inline/);
  assert.match(html, /<pre><code>\$not_math\$/);
});

test("renderMarkdown does not render math inside quoted indented code", () => {
  const html = renderMarkdown(">     $not_math$ and \\(raw\\)\n>\n>     beta", { settings });

  assert.doesNotMatch(html, /math-inline/);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<pre><code>\$not_math\$ and \\\(raw\\\)/);
});

test("renderMarkdown protects code fences closed with longer markers", () => {
  const html = renderMarkdown("````md\n$x$\n`````", { settings });

  assert.doesNotMatch(html, /math-inline/);
  assert.match(html, /\$x\$/);
});

test("renderMarkdown avoids treating spaced dollar text as inline math", () => {
  const html = renderMarkdown("Price $5 and $6, math $5$ and $x + y$.", { settings });

  assert.equal(html.match(/math-inline/g)?.length, 2);
  assert.match(html, /\$5 and \$6/);
  assert.match(html, /katex/);
});

test("renderMarkdown respects the marks extension toggle", () => {
  const source = "==mark== ^up^ H~2~O";
  const enabled = renderMarkdown(source, { settings });
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

test("renderMarkdown replaces emoji shortcodes case-insensitively", () => {
  const html = renderMarkdown(":SMILE: :rocket: :unknown:", { settings });
  assert.match(html, /😄 🚀 :unknown:/);

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

  assert.deepEqual(getEmojiSuggestions("RO"), [{ code: "rocket", value: "🚀" }]);
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

test("renderMarkdown blocks unsafe raw html image sources", () => {
  const html = renderMarkdown(
    '<img src="javascript:alert(1)" alt="Bad"><img src="data:text/html,hi"><img src="data:image/png;base64,abc">',
    { settings },
  );

  assert.doesNotMatch(html, /javascript:alert/);
  assert.doesNotMatch(html, /data:text\/html/);
  assert.match(html, /<img src="" alt="Bad">/);
  assert.match(html, /<img src="">/);
  assert.match(html, /<img src="data:image\/png;base64,abc">/);
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
    outline: [{ id: "intro", title: "Intro", level: 1, line: 1 }],
  });

  assert.match(toc, /<nav class="toc-inline">/);
  assert.doesNotMatch(toc, /&lt;nav/);

  const alert = renderMarkdown("> [!NOTE]\n> <b>raw</b>", {
    settings: htmlDisabledSettings,
  });

  assert.match(alert, /<div class="md-alert md-alert-note">/);
  assert.match(alert, /&lt;b&gt;raw&lt;\/b&gt;/);
  assert.doesNotMatch(alert, /<b>raw<\/b>/);
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
  ].join("\n"), { settings });

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
  assert.match(toc, /\n {4}\[toc]/);
});

test("renderMarkdown respects the footnote extension toggle", () => {
  const source = "note[^1]\n\n[^1]: detail";
  const enabled = renderMarkdown(source, { settings });
  assert.match(enabled, /footnote-ref/);
  assert.match(enabled, /footnotes/);

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

test("renderMarkdown and outline treat UTF-8 BOM front matter like Typora", () => {
  const source = "\uFEFF---\ntitle: # Hidden\n---\n\n# Real";
  const html = renderMarkdown(source, { settings });
  const outline = createOutline(source);

  assert.match(html, /frontmatter-block/);
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

test("renderMarkdown heading ids stay consistent with duplicate outline ids", () => {
  const source = "> # Same\n\n# Same";
  const outline = createOutline(source);
  const html = renderMarkdown(source, { settings, outline });

  assert.deepEqual(outline.map((item) => item.id), ["same", "same-1"]);
  assert.match(html, /<h1 id="same"[^>]*>/);
  assert.match(html, /<h1 id="same-1"[^>]*>/);
});

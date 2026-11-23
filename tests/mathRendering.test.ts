import test from "node:test";
import assert from "node:assert/strict";
import {
  MATH_DOCUMENT_CACHE_LIMIT,
  clearMathRenderingCache,
  collectMathDocumentItems,
  getMathRenderingDiagnostics,
  getMathRenderingCacheSize,
  renderMathJaxFragments,
} from "../src/utils/mathRendering";
import type { MathAutoNumbering } from "../src/types";

test("collectMathDocumentItems scans block and inline math without editor module dependencies", () => {
  const source = [
    "---",
    "title: $frontMatter$",
    "---",
    "",
    "```md",
    "$fenced$",
    "```",
    "",
    "    $indented$",
    "",
    "<pre>",
    "$htmlCode$",
    "</pre>",
    "",
    "> $$ {quoted close}",
    "> q = 1 \\label{quoted}",
    "> $$",
    "",
    "- math block",
    "  \\[",
    "  l = 2",
    "  \\]",
    "",
    "Inline $x + y$ and \\(z + 1\\), code `$hidden$`.",
  ].join("\r\n");

  const items = collectMathDocumentItems(source);

  assert.deepEqual(items.map((item) => ({ formula: item.formula, display: item.display })), [
    { formula: "q = 1 \\label{quoted}", display: true },
    { formula: "l = 2", display: true },
    { formula: "x + y", display: false },
    { formula: "z + 1", display: false },
  ]);
  for (const item of items) {
    assert.ok(item.from >= 0 && item.to > item.from);
  }
});

test("collectMathDocumentItems only protects strict document-start Front Matter", () => {
  assert.deepEqual(
    collectMathDocumentItems("  ---\n$visible$\n  ---")
      .map((item) => ({ formula: item.formula, display: item.display })),
    [{ formula: "visible", display: false }],
  );

  assert.deepEqual(
    collectMathDocumentItems("\uFEFF---\r\nhidden: $front$\r\n...\r\n$body$")
      .map((item) => ({ formula: item.formula, display: item.display })),
    [{ formula: "body", display: false }],
  );
});

test("collectMathDocumentItems supports tagged fences and YAML explicit end markers", () => {
  const source = [
    "---",
    "hidden: $front$",
    "...",
    "> $$ {quoted tag}",
    "> q = 1",
    "> $$",
    "",
    "- math",
    "  $$ {{list tag}}",
    "  l = 2",
    "  $$ {list close}",
  ].join("\r\n");
  const items = collectMathDocumentItems(source);

  assert.deepEqual(items.map((item) => ({ formula: item.formula, display: item.display })), [
    { formula: "q = 1", display: true },
    { formula: "l = 2", display: true },
  ]);
});

test("collectMathDocumentItems rejects invalid tagged dollar openings", () => {
  for (const opening of ["$$ {}", "$$ {tag", "$$ {tag} ", "$$ {tag} trailing"]) {
    assert.deepEqual(collectMathDocumentItems(`${opening}\nx = 1\n$$`), [], opening);
  }
});

test("collectMathDocumentItems includes closed GitLab math fences and excludes ordinary code", () => {
  const source = [
    "```math",
    "a = 1",
    "```",
    "",
    "> ```MATH",
    "> b = 2",
    "> ```",
    "",
    "- item",
    "  ~~~math",
    "  c = 3",
    "  ~~~",
    "",
    "```ts",
    "$hidden$",
    "```",
  ].join("\n");

  assert.deepEqual(
    collectMathDocumentItems(source).map((item) => ({ formula: item.formula, display: item.display })),
    [
      { formula: "a = 1", display: true },
      { formula: "b = 2", display: true },
      { formula: "c = 3", display: true },
    ],
  );
});

test("renderMathJaxFragments emits inline SVG without a runtime stylesheet", () => {
  clearMathRenderingCache();
  const source = "Inline $x^2 + y^2$";
  const [html] = renderMathJaxFragments(
    [{ formula: "x^2 + y^2", display: false }],
    { documentSource: source, source, autoNumbering: false },
  );

  assert.match(html, /^<mjx-container class="MathJax" jax="SVG"/);
  assert.match(html, /<svg\b/);
  assert.match(html, /<defs>/);
  assert.equal(html.match(/<svg\b/g)?.length, 1);
  assert.doesNotMatch(html, /<mjx-break\b/);
  assert.doesNotMatch(html, /class="katex"|katex\.min\.css/);
});

test("math auto-numbering supports false, ams and all", () => {
  const plain = "$$\na = 1\n$$\n\n$$\nb = 2\n$$";
  const ams = "$$\n\\begin{equation}a = 1\\label{a}\\end{equation}\n$$";

  const render = (source: string, mode: MathAutoNumbering) => {
    clearMathRenderingCache();
    const items = collectMathDocumentItems(source);
    return renderMathJaxFragments(items, {
      documentSource: source,
      source,
      autoNumbering: mode,
    });
  };

  assert.ok(render(plain, false).every((html) => !html.includes('id="mjx-eqn:')));
  assert.ok(render(plain, "ams").every((html) => !html.includes('id="mjx-eqn:')));

  const all = render(plain, "all");
  assert.match(all[0]!, /id="mjx-eqn:1"/);
  assert.match(all[1]!, /id="mjx-eqn:2"/);

  const [amsHtml] = render(ams, "ams");
  assert.match(amsHtml!, /id="mjx-eqn:a"/);
});

test("manual tags remain available while automatic numbering is disabled", () => {
  const source = [
    "$$",
    "a = 1 \\tag{A} \\label{manual}",
    "$$",
    "",
    "$$",
    "b = \\eqref{manual}",
    "$$",
  ].join("\n");
  const html = renderMathJaxFragments(collectMathDocumentItems(source), {
    documentSource: source,
    source,
    autoNumbering: false,
  });

  assert.match(html[0]!, /id="mjx-eqn:manual"/);
  assert.match(html[1]!, /href="#mjx-eqn%3Amanual"/);
});

test("labels without manual tags stay unnumbered when automatic numbering is disabled", () => {
  const source = [
    "$$",
    "a = 1 \\label{plain}",
    "$$",
    "",
    "$$",
    "b = \\eqref{plain}",
    "$$",
  ].join("\n");
  const html = renderMathJaxFragments(collectMathDocumentItems(source), {
    documentSource: source,
    source,
    autoNumbering: false,
  });

  assert.doesNotMatch(html[0]!, /id="mjx-eqn:plain"/);
  assert.doesNotMatch(html[1]!, /href="#mjx-eqn%3Aplain"/);
});

test("forward ref and eqref resolve labels from later math blocks", () => {
  const source = [
    "$$",
    "x = \\ref{later}, y = \\eqref{later}",
    "$$",
    "",
    "$$",
    "z = 3 \\label{later}",
    "$$",
  ].join("\n");
  const html = renderMathJaxFragments(collectMathDocumentItems(source), {
    documentSource: source,
    source,
    autoNumbering: "all",
  });

  assert.equal(html[0]!.match(/href="#mjx-eqn%3Alater"/g)?.length, 2);
  assert.doesNotMatch(html[0]!, /\?\?\?/);
  assert.match(html[1]!, /id="mjx-eqn:later"/);
});

test("equations keep their own label while resolving another equation reference", () => {
  const source = [
    "$$",
    "a = 1 \\label{first}",
    "$$",
    "",
    "$$",
    "b = \\eqref{first} \\label{second}",
    "$$",
    "",
    "$$",
    "c = \\eqref{second}",
    "$$",
  ].join("\n");
  const html = renderMathJaxFragments(collectMathDocumentItems(source), {
    documentSource: source,
    source,
    autoNumbering: "all",
  });

  assert.match(html[1]!, /id="mjx-eqn:second"/);
  assert.match(html[1]!, /href="#mjx-eqn%3Afirst"/);
  assert.match(html[2]!, /href="#mjx-eqn%3Asecond"/);
});

test("math references inside Markdown link labels use document labels", () => {
  const reference = "See [equation $\\eqref{target}$](https://example.com).";
  const source = [
    "$$",
    "x = 1 \\label{target}",
    "$$",
    "",
    reference,
  ].join("\n");
  const items = collectMathDocumentItems(source);
  assert.deepEqual(items.map((item) => item.formula), [
    "x = 1 \\label{target}",
    "\\eqref{target}",
  ]);

  const [html] = renderMathJaxFragments(
    [{ formula: "\\eqref{target}", display: false }],
    {
      documentSource: source,
      source: reference,
      sourceOffset: source.indexOf(reference),
      autoNumbering: "all",
    },
  );
  assert.match(html, /href="#mjx-eqn%3Atarget"/);
});

test("math collection includes link labels, plain brackets and soft line breaks", () => {
  const source = [
    "[linked $x$](https://example.com)",
    "plain [$y$]",
    "$a +",
    "b$",
  ].join("\n");

  assert.deepEqual(collectMathDocumentItems(source).map((item) => item.formula), [
    "x",
    "y",
    "a +\nb",
  ]);
});

test("math collection removes quote and list prefixes from soft-line formulas", () => {
  const source = [
    "> $q +",
    "> r$",
    "",
    "- $l +",
    "  m$",
  ].join("\n");

  assert.deepEqual(collectMathDocumentItems(source).map((item) => item.formula), [
    "q +\nr",
    "l +\nm",
  ]);
});

test("sourceOffset selects the correct duplicate formula number", () => {
  const block = "$$\nx = 1\n$$";
  const source = `${block}\n\n${block}`;
  const secondOffset = source.lastIndexOf(block);
  const [html] = renderMathJaxFragments(
    [{ formula: "x = 1", display: true }],
    {
      documentSource: source,
      source: block,
      sourceOffset: secondOffset,
      autoNumbering: "all",
    },
  );

  assert.match(html, /id="mjx-eqn:2"/);
  assert.doesNotMatch(html, /id="mjx-eqn:1"/);
});

test("document updates do not reuse stale labels or numbering", () => {
  clearMathRenderingCache();
  const first = "$$\na = 1 \\label{old}\n$$\n\n$$\nb = \\eqref{old}\n$$";
  const updated = "$$\na = 1\n$$\n\n$$\nb = \\eqref{old}\n$$";

  const firstHtml = renderMathJaxFragments(collectMathDocumentItems(first), {
    documentSource: first,
    source: first,
    autoNumbering: "all",
  });
  const updatedHtml = renderMathJaxFragments(collectMathDocumentItems(updated), {
    documentSource: updated,
    source: updated,
    autoNumbering: "all",
  });

  assert.match(firstHtml[1]!, /href="#mjx-eqn%3Aold"/);
  assert.doesNotMatch(updatedHtml[1]!, /href="#mjx-eqn%3Aold"/);
  assert.match(updatedHtml[0]!, /id="mjx-eqn:1"/);
  assert.match(updatedHtml[1]!, /id="mjx-eqn:2"/);
});

test("math cache reuses unchanged formulas after surrounding prose changes", () => {
  clearMathRenderingCache();
  const first = "Before\n\n$$\nx = 1\n$$";
  const updated = "Longer prose before\n\n$$\nx = 1\n$$";

  renderMathJaxFragments(collectMathDocumentItems(first), {
    documentSource: first,
    source: first,
    autoNumbering: "all",
  });
  renderMathJaxFragments(collectMathDocumentItems(updated), {
    documentSource: updated,
    source: updated,
    autoNumbering: "all",
  });

  assert.deepEqual(getMathRenderingDiagnostics(), {
    fullBatchRenderCount: 1,
    incrementalFragmentRenderCount: 0,
  });
});

test("math cache incrementally rerenders a safe changed formula", () => {
  clearMathRenderingCache();
  const first = Array.from({ length: 40 }, (_item, index) => `$$\nx_${index} = ${index}\n$$`).join("\n\n");
  const updated = first.replace("x_20 = 20", "y_20 = 21");

  renderMathJaxFragments(collectMathDocumentItems(first), {
    documentSource: first,
    source: first,
    autoNumbering: "all",
  });
  const html = renderMathJaxFragments(collectMathDocumentItems(updated), {
    documentSource: updated,
    source: updated,
    autoNumbering: "all",
  });

  assert.match(html[20]!, /data-latex="y_20 = 21"/);
  assert.match(html[39]!, /id="mjx-eqn:40"/);
  assert.deepEqual(getMathRenderingDiagnostics(), {
    fullBatchRenderCount: 1,
    incrementalFragmentRenderCount: 1,
  });
});

test("math cache never reuses rendered HTML across numbering modes", () => {
  clearMathRenderingCache();
  const plain = "$$\nx = 1\n$$\n\n$$\ny = 2\n$$";
  const numbered = plain.replace("x = 1", "x = 3");
  const ams = numbered.replace("y = 2", "y = 4");

  const plainHtml = renderMathJaxFragments(collectMathDocumentItems(plain), {
    documentSource: plain,
    source: plain,
    autoNumbering: false,
  });
  const numberedHtml = renderMathJaxFragments(collectMathDocumentItems(numbered), {
    documentSource: numbered,
    source: numbered,
    autoNumbering: "all",
  });
  const amsHtml = renderMathJaxFragments(collectMathDocumentItems(ams), {
    documentSource: ams,
    source: ams,
    autoNumbering: "ams",
  });

  assert.ok(plainHtml.every((html) => !html.includes('id="mjx-eqn:')));
  assert.match(numberedHtml[0]!, /id="mjx-eqn:1"/);
  assert.match(numberedHtml[1]!, /id="mjx-eqn:2"/);
  assert.ok(amsHtml.every((html) => !html.includes('id="mjx-eqn:')));
  assert.deepEqual(getMathRenderingDiagnostics(), {
    fullBatchRenderCount: 3,
    incrementalFragmentRenderCount: 0,
  });
});

test("math document cache remains bounded", () => {
  clearMathRenderingCache();
  for (let index = 0; index < MATH_DOCUMENT_CACHE_LIMIT + 4; index += 1) {
    const source = `$$\nx = ${index}\n$$`;
    renderMathJaxFragments(collectMathDocumentItems(source), {
      documentSource: source,
      source,
      autoNumbering: "all",
    });
  }

  assert.equal(getMathRenderingCacheSize(), MATH_DOCUMENT_CACHE_LIMIT);
});

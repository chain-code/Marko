import assert from "node:assert/strict";
import test from "node:test";
import {
  collectCjkUnderscoreEmphasis,
  collectHighlightSyntax,
  collectStrikethroughSyntax,
} from "../src/utils/inlineStyleSyntax";

test("collectCjkUnderscoreEmphasis recognizes CJK-adjacent underscore styles", () => {
  const source = "\u4E2D_em_\u6587 \u4E2D__strong__\u6587 \u4E2D_left_ text text _right_\u6587";
  const syntax = collectCjkUnderscoreEmphasis(source);

  assert.deepEqual(
    syntax.map((item) => ({
      kind: item.kind,
      raw: source.slice(item.start, item.end),
      content: source.slice(item.contentStart, item.contentEnd),
    })),
    [
      { kind: "emphasis", raw: "_em_", content: "em" },
      { kind: "strong", raw: "__strong__", content: "strong" },
      { kind: "emphasis", raw: "_left_", content: "left" },
      { kind: "emphasis", raw: "_right_", content: "right" },
    ],
  );
});

test("collectCjkUnderscoreEmphasis leaves ASCII intraword and escaped markers literal", () => {
  assert.deepEqual(
    collectCjkUnderscoreEmphasis("a_b_c a__b__c \u4E2D\\_escaped_\u6587 ___triple___"),
    [],
  );
});

test("collectHighlightSyntax matches ordinary and Typora triple-equals highlights", () => {
  const source = "==plain== ===triple===";
  const syntax = collectHighlightSyntax(source);

  assert.deepEqual(
    syntax.map((item) => ({
      raw: source.slice(item.from, item.to),
      content: source.slice(item.contentFrom, item.contentTo),
    })),
    [
      { raw: "==plain==", content: "plain" },
      { raw: "==triple==", content: "triple" },
    ],
  );
  assert.equal(source[syntax[1]!.from - 1], "=");
  assert.equal(source[syntax[1]!.to], "=");
});

test("collectHighlightSyntax skips protected delimiters without discarding an outer highlight", () => {
  const source = "==outer `==code==` after==";
  const codeFrom = source.indexOf("`");
  const codeTo = source.lastIndexOf("`") + 1;
  const syntax = collectHighlightSyntax(source, 0, [{ from: codeFrom, to: codeTo }]);

  assert.equal(syntax.length, 1);
  assert.equal(source.slice(syntax[0]!.contentFrom, syntax[0]!.contentTo), "outer `==code==` after");
  assert.deepEqual(
    collectHighlightSyntax("`==code==`", 0, [{ from: 0, to: "`==code==`".length }]),
    [],
  );
});

test("collectHighlightSyntax matches adjacent and nested delimiter pairs like markdown-it-mark", () => {
  const adjacent = "==one====two==";
  assert.deepEqual(
    collectHighlightSyntax(adjacent).map((item) => ({
      raw: adjacent.slice(item.from, item.to),
      content: adjacent.slice(item.contentFrom, item.contentTo),
    })),
    [
      { raw: "==one==", content: "one" },
      { raw: "==two==", content: "two" },
    ],
  );

  const nested = "====x====";
  assert.deepEqual(collectHighlightSyntax(nested), [
    { from: 0, to: 9, contentFrom: 2, contentTo: 7 },
    { from: 2, to: 7, contentFrom: 4, contentTo: 5 },
  ]);
});

test("collectStrikethroughSyntax preserves odd outer markers and pairs adjacent runs", () => {
  const odd = "before ~~~x~~~ after";
  const oddSyntax = collectStrikethroughSyntax(odd);
  assert.deepEqual(oddSyntax, [{
    from: odd.indexOf("~~~") + 1,
    to: odd.lastIndexOf("~~~") + 2,
    contentFrom: odd.indexOf("x"),
    contentTo: odd.indexOf("x") + 1,
  }]);
  assert.equal(odd.slice(oddSyntax[0]!.from - 1, oddSyntax[0]!.to + 1), "~~~x~~~");
  assert.equal(odd.slice(oddSyntax[0]!.contentFrom, oddSyntax[0]!.contentTo), "x");

  const adjacent = "~~one~~~~two~~";
  assert.deepEqual(
    collectStrikethroughSyntax(adjacent).map((item) => ({
      raw: adjacent.slice(item.from, item.to),
      content: adjacent.slice(item.contentFrom, item.contentTo),
    })),
    [
      { raw: "~~one~~", content: "one" },
      { raw: "~~two~~", content: "two" },
    ],
  );
});

test("paired inline styles leave one escaped marker literal before a valid pair", () => {
  const highlight = "\\===x===";
  assert.deepEqual(
    collectHighlightSyntax(highlight).map((item) => ({
      raw: highlight.slice(item.from, item.to),
      content: highlight.slice(item.contentFrom, item.contentTo),
    })),
    [{ raw: "==x==", content: "x" }],
  );

  const strike = "before \\~~~x~~~ after";
  const syntax = collectStrikethroughSyntax(strike);
  assert.equal(strike.slice(syntax[0]!.contentFrom, syntax[0]!.contentTo), "x");
  assert.equal(strike.slice(syntax[0]!.from, syntax[0]!.to), "~~x~~");
});

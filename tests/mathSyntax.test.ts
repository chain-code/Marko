import assert from "node:assert/strict";
import test from "node:test";
import {
  isDollarMathBlockClosing,
  readDollarMathBlockOpening,
  readInlineDollarMath,
} from "../src/utils/mathSyntax";

test("tagged dollar math fence lines follow Typora opening and closing rules", () => {
  for (const line of ["$$", "$$ {close}", "$$ { }", "$$ {{nested}}", "$$ {a}{b}"]) {
    assert.ok(readDollarMathBlockOpening(line), line);
    assert.equal(isDollarMathBlockClosing(line), true, line);
  }

  for (const line of ["$$ {}", "$$ {tag", "$$ {tag} ", "$$ {tag} trailing", "$$ tag"]) {
    assert.equal(readDollarMathBlockOpening(line), null, line);
    assert.equal(isDollarMathBlockClosing(line), false, line);
  }
});

test("readInlineDollarMath accepts LF and CRLF soft line breaks", () => {
  for (const source of ["$a +\nb$", "$a +\r\nb$"]) {
    const match = readInlineDollarMath(source, 0);
    assert.ok(match, source);
    assert.equal(match.raw, source);
    assert.equal(match.formula, source.slice(1, -1));
  }
});

test("readInlineDollarMath stops at hard breaks, blank lines and block starts", () => {
  for (const source of [
    "$a  \nb$",
    "$a\\\nb$",
    "$a\n\nb$",
    "$a\n# heading\nb$",
    "$a\n- item\nb$",
  ]) {
    assert.equal(readInlineDollarMath(source, 0), null, source);
  }
});

test("readInlineDollarMath removes quote and list continuation prefixes", () => {
  const cases = [
    { source: "> $q +\n> r$", formula: "q +\nr" },
    { source: "- $l +\n  m$", formula: "l +\nm" },
    { source: "> - $n +\n>   o$", formula: "n +\no" },
    { source: "> $lazyQuote +\nnext$", formula: "lazyQuote +\nnext" },
    { source: "- $lazyList +\nnext$", formula: "lazyList +\nnext" },
  ];
  for (const current of cases) {
    const start = current.source.indexOf("$");
    const match = readInlineDollarMath(current.source, start);
    assert.ok(match, current.source);
    assert.equal(match.formula, current.formula, current.source);
    assert.equal(match.raw, current.source.slice(start), current.source);
  }
});

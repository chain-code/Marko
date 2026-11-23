import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixtures = [
  {
    name: "MarkdownPreview",
    root: ".markdown-inner",
    source: readFileSync(resolve("src/components/MarkdownPreview.vue"), "utf8"),
  },
  {
    name: "RichMarkdownBlock",
    root: ".rich-markdown-block",
    source: readFileSync(resolve("src/components/RichMarkdownBlock.vue"), "utf8"),
  },
];

test("正文图片仅在独占段落中居中", () => {
  for (const fixture of fixtures) {
    const match = fixture.source.match(
      new RegExp(`${escapeRegExp(fixture.root)} :deep\\(img\\)\\s*\\{([^}]*)\\}`),
    );
    assert.ok(match, `${fixture.name} should define rendered image metrics`);

    const imageRule = match[1] ?? "";
    assert.match(imageRule, /display:\s*inline-block;/, fixture.name);
    assert.match(imageRule, /max-width:\s*100%;/, fixture.name);
    assert.doesNotMatch(imageRule, /height:\s*auto;/, fixture.name);
    assert.match(imageRule, /margin:\s*0;/, fixture.name);

    const automaticHeight = fixture.source.match(
      new RegExp(
        escapeRegExp(fixture.root) + " :deep\\(img:not\\(\\[height\\]\\)\\)\\s*\\{([^}]*)\\}",
      ),
    );
    assert.ok(automaticHeight, fixture.name + " should preserve explicit image heights");
    assert.match(automaticHeight[1] ?? "", /height:\s*auto;/, fixture.name);
    assert.match(imageRule, /vertical-align:\s*middle;/, fixture.name);
    assert.match(imageRule, /border-radius:\s*0;/, fixture.name);

    const standaloneSelector = new RegExp(
      `${escapeRegExp(`${fixture.root} :deep(.standalone-image-paragraph > img),`)}\\s*`
        + `${escapeRegExp(`${fixture.root} :deep(.standalone-image-paragraph > a > img)`)}\\s*\\{([^}]*)\\}`,
    );
    const standaloneMatch = fixture.source.match(standaloneSelector);
    assert.ok(standaloneMatch, `${fixture.name} should distinguish standalone and linked images`);
    assert.match(standaloneMatch[1] ?? "", /display:\s*block;/, fixture.name);
    assert.match(standaloneMatch[1] ?? "", /margin:\s*auto;/, fixture.name);
  }
});

test("独占图片段落按有效 DOM 节点判定", () => {
  for (const fixture of fixtures) {
    assert.match(
      fixture.source,
      /paragraph\.classList\.toggle\("standalone-image-paragraph", isStandaloneImageParagraph\(paragraph\)\)/,
      fixture.name,
    );
    assert.match(
      fixture.source,
      /node\.nodeType === Node\.TEXT_NODE[\s\S]{0,80}node\.textContent\?\.trim\(\)/,
      fixture.name,
    );
    assert.match(fixture.source, /if \(child\.matches\("img"\)\) return true;/, fixture.name);
    assert.match(fixture.source, /if \(!child\.matches\("a\[href\]"\)\) return false;/, fixture.name);
    assert.match(
      fixture.source,
      /linkedChildren\.length === 1[\s\S]{0,80}linkedChildren\[0\] instanceof HTMLImageElement/,
      fixture.name,
    );
  }
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

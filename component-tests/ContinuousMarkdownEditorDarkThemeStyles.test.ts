import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileStyle, parse } from "@vue/compiler-sfc";
import { describe, expect, it } from "vitest";

const filename = resolve(process.cwd(), "src/components/ContinuousMarkdownEditor.vue");
const componentSource = readFileSync(filename, "utf8");
const descriptor = parse(componentSource, { filename }).descriptor;
const scopedStyles = descriptor.styles.filter((style) => style.scoped);
const compiledResults = scopedStyles.map((style) => compileStyle({
  filename,
  id: "data-v-dark-theme-test",
  source: style.content,
  scoped: true,
}));
const compiledCss = compiledResults.map((result) => result.code).join("\n");
const darkEditorPrefix = ':root[data-theme="dark"] .continuous-editor ';
const standaloneDarkEditorPrefix = '.marko-markdown-body[data-theme="dark"] .continuous-editor ';

describe("ContinuousMarkdownEditor compiled dark theme selectors", () => {
  it("keeps every editor dark rule scoped below the theme root", () => {
    expect(scopedStyles).toHaveLength(1);
    expect(compiledResults.flatMap((result) => result.errors)).toEqual([]);
    expect(componentSource).not.toContain(':global([data-theme="dark"]) :deep');
    expect(componentSource).not.toContain(
      ':global(:root[data-theme="dark"]) .continuous-editor :deep',
    );

    const targets = [
      ".cm-rendered-inline-code",
      ".cm-rendered-inline-html kbd",
      ".cm-special-preview-html kbd",
      ".cm-rendered-inline-html code",
      ".cm-special-preview-html code",
      ".cm-rendered-footnote-reference",

      ".cm-frontmatter",
      ".cm-special-preview table tr:nth-child(2n)",
      ".cm-special-preview thead",
      ".cm-special-preview pre",
    ];
    for (const target of targets) {
      expect(compiledCss).toContain(darkEditorPrefix + target);
      expect(compiledCss).toContain(standaloneDarkEditorPrefix + target);
    }
    expect(compiledCss).not.toMatch(/:root\[data-theme="dark"\]\s*\{/);
  });

  it("preserves the dark table and pre backgrounds after scoped compilation", () => {
    const escapedPrefix = darkEditorPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(compiledCss).toMatch(new RegExp(
      escapedPrefix
        + "\\.cm-special-preview table tr:nth-child\\(2n\\),[\\s\\S]*?"
        + "\\{[^}]*background:\\s*var\\(--panel-subtle\\);",
    ));
    expect(compiledCss).toMatch(new RegExp(
      escapedPrefix
        + "\\.cm-special-preview pre,[\\s\\S]*?\\{[^}]*background:\\s*#111820;",
    ));
  });
});
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import katex from "katex";
import type { EditorSettings, OutlineItem } from "@/types";
import { replaceMarkdownLinkSyntax } from "./markdownLinks";
import { getPreviewLinkAction, isExternalPreviewHref } from "./previewLinks";

export interface RenderOptions {
  basePath?: string;
  documentSource?: string;
  outline?: OutlineItem[];
  settings: EditorSettings;
  assetResolver?: (path: string) => string;
}

const emojiMap: Record<string, string> = {
  smile: "😄",
  joy: "😂",
  wink: "😉",
  heart: "❤️",
  thumbsup: "👍",
  warning: "⚠️",
  fire: "🔥",
  rocket: "🚀",
  check: "✅",
  x: "❌",
  note: "📝",
  bulb: "💡",
};

const alertLabels: Record<string, string> = {
  note: "NOTE",
  tip: "TIP",
  important: "IMPORTANT",
  warning: "WARNING",
  caution: "CAUTION",
};

const markdownRenderers = new Map<string, MarkdownIt>();

export function renderMarkdown(source: string, options: RenderOptions): string {
  const parts = splitFrontMatter(source);
  if (options.settings.extensions.footnote && isFootnoteDefinitionBlock(parts.body)) {
    return `<div class="footnote-definition-block">${escapeHtml(parts.body.trim())}</div>`;
  }

  const footnoteBody = options.settings.extensions.footnote
    ? appendReferencedFootnotes(parts.body, options.documentSource ?? source)
    : parts.body;
  const referenceBody = appendReferencedLinkDefinitions(footnoteBody, options.documentSource ?? source);
  const body = prepareMarkdown(referenceBody, options);
  const renderedBody = getMarkdownRenderer(options.settings).render(body, options);

  if (!parts.frontMatter) {
    return renderedBody;
  }

  return [
    `<pre class="frontmatter-block"><code>${escapeHtml(parts.frontMatter.trim())}</code></pre>`,
    renderedBody,
  ].join("\n");
}

export function createOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const seen = new Map<string, number>();
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;
  let inFrontMatter = false;
  const lines = markdown.split(/\r?\n/);

  const addItem = (rawTitle: string, level: number, line: number) => {
    const title = stripInlineMarkdown(rawTitle);
    const baseId = slugifyHeading(title);
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    items.push({
      id: count === 0 ? baseId : `${baseId}-${count}`,
      title,
      level,
      line,
    });
  };

  lines.forEach((line, index) => {
    const context = getOutlineLineContext(line);
    if (index === 0 && context.quoteKey === "plain" && context.trimmed === "---") {
      inFrontMatter = true;
      return;
    }
    if (inFrontMatter) {
      if (context.quoteKey === "plain" && context.trimmed === "---") inFrontMatter = false;
      return;
    }

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      return;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
        return;
      }
      activeHtmlBlock = null;
    }

    if (isIndentedCodeLine(context.content)) return;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      return;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      return;
    }

    const setext = context.trimmed.match(/^(=+|-+)\s*$/);
    if (setext && index > 0) {
      const previous = getOutlineLineContext(lines[index - 1] ?? "");
      if (
        previous.quoteKey === context.quoteKey
        && !isIndentedCodeLine(previous.content)
        && isSetextHeadingText(previous.trimmed)
      ) {
        addItem(previous.trimmed, setext[1][0] === "=" ? 1 : 2, index);
      }
      return;
    }

    const match = context.content.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*$/);
    if (!match) return;

    addItem(stripAtxClosingMarker(match[2]), match[1].length, index + 1);
  });

  return items;
}

export function getEmojiSuggestions(query: string): Array<{ code: string; value: string }> {
  const normalized = query.toLowerCase();
  return Object.entries(emojiMap)
    .filter(([code]) => code.startsWith(normalized))
    .slice(0, 8)
    .map(([code, value]) => ({ code, value }));
}

type OutlineFence =
  | { kind: "code"; marker: string }
  | { kind: "math"; marker: "$$" | "\\[" };

type OutlineHtmlBlock =
  | { kind: "untilBlank"; quoteKey: string }
  | { kind: "untilClose"; quoteKey: string; closePattern: RegExp };

interface OutlineLineContext {
  content: string;
  trimmed: string;
  quoteKey: string;
  prefix: string;
}

interface DefinitionListEntry {
  terms: string[];
  definitions: DefinitionListDefinition[];
}

interface DefinitionListDefinition {
  lines: string[];
  loose: boolean;
}

interface MarkdownAbbreviation {
  label: string;
  title: string;
}

function getOutlineLineContext(line: string): OutlineLineContext {
  let cursor = line.match(/^\s{0,3}/)?.[0].length ?? 0;
  let depth = 0;

  while (line[cursor] === ">") {
    depth += 1;
    cursor += 1;
    if (line[cursor] === " " || line[cursor] === "\t") {
      cursor += 1;
    }
  }

  const content = depth > 0 ? line.slice(cursor) : line;
  const leading = line.slice(0, Math.min(cursor, line.length)).match(/^\s*/)?.[0] ?? "";
  return {
    content,
    trimmed: content.trim(),
    quoteKey: depth > 0 ? `${leading.length}:${depth}` : "plain",
    prefix: depth > 0 ? line.slice(0, cursor) : "",
  };
}

function getOutlineFenceOpen(content: string): OutlineFence | null {
  const code = content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (code) return { kind: "code", marker: code[1] };
  if (/^[ \t]{0,3}\$\$\s*$/.test(content)) return { kind: "math", marker: "$$" };
  if (/^[ \t]{0,3}\\\[\s*$/.test(content)) return { kind: "math", marker: "\\[" };
  return null;
}

function isOutlineFenceClose(content: string, fence: OutlineFence): boolean {
  if (fence.kind === "math") {
    return fence.marker === "$$" ? /^[ \t]{0,3}\$\$\s*$/.test(content) : /^[ \t]{0,3}\\\]\s*$/.test(content);
  }

  const closing = content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  return Boolean(closing && closing[1][0] === fence.marker[0] && closing[1].length >= fence.marker.length);
}

function getOutlineHtmlBlockOpen(content: string, quoteKey: string): OutlineHtmlBlock | null {
  if (!/^[ \t]{0,3}</.test(content)) return null;
  const line = content.trimStart();

  if (/^<!--/.test(line)) return { kind: "untilClose", quoteKey, closePattern: /-->/ };
  if (/^<\?/.test(line)) return { kind: "untilClose", quoteKey, closePattern: /\?>/ };
  if (/^<![A-Z]/.test(line)) return { kind: "untilClose", quoteKey, closePattern: />/ };
  if (/^<!\[CDATA\[/.test(line)) return { kind: "untilClose", quoteKey, closePattern: /\]\]>/ };

  const rawTag = line.match(/^<(script|pre|style)(?=[\s>/])/i);
  if (rawTag) {
    return {
      kind: "untilClose",
      quoteKey,
      closePattern: new RegExp(`</${rawTag[1]}\\s*>`, "i"),
    };
  }

  if (/^<\/?(address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[\s>/])/i.test(line)) {
    return { kind: "untilBlank", quoteKey };
  }

  return null;
}

function isOutlineHtmlBlockClose(content: string, block: OutlineHtmlBlock): boolean {
  if (block.kind === "untilBlank") return !content.trim();
  return block.closePattern.test(content);
}

function prepareMarkdown(source: string, options: RenderOptions): string {
  let next = source;
  const protectedHtml: string[] = [];
  const protectHtml = (html: string) => {
    const token = `@@MARKO_HTML_${protectedHtml.length}@@`;
    protectedHtml.push(html);
    return token;
  };

  if (!options.settings.extensions.footnote) {
    next = escapeFootnoteSyntax(next);
  }
  if (options.settings.extensions.alerts) {
    next = renderAlerts(next, options, protectHtml);
  }
  if (options.settings.extensions.toc) {
    next = next.replace(/^[ \t]{0,3}\[TOC]\s*$/gim, () => protectHtml(renderToc(options.outline ?? [])));
  }
  if (options.settings.extensions.emoji) {
    next = next.replace(/:([a-z0-9_+-]+):/gi, (match, code: string) => emojiMap[code.toLowerCase()] ?? match);
  }
  next = renderAbbreviations(next, options, protectHtml);
  next = renderDefinitionLists(next, options, protectHtml);
  if (options.settings.extensions.mermaid) {
    next = next.replace(
      /^\s*\{\{<\s*mermaid(?:\s+[^>]*)?>\}\}\s*\r?\n([\s\S]*?)^\s*\{\{<\s*\/mermaid\s*>\}\}\s*$/gim,
      (_match, diagram: string) => `\n\`\`\`mermaid\n${diagram.trim()}\n\`\`\`\n`,
    );
  }
  if (!options.settings.extensions.html) {
    next = escapeDisabledRawHtml(next);
  }
  next = restoreProtectedHtml(next, protectedHtml);
  if (options.settings.extensions.math) {
    next = renderMath(next);
  } else {
    next = preserveMathDelimiters(next);
  }
  return next;
}

function createMarkdownRenderer(settings: EditorSettings): MarkdownIt {
  const renderer = new MarkdownIt({
    html: true,
    linkify: settings.extensions.autoLinks,
    typographer: settings.smartPunctuation,
    breaks: settings.preserveSingleLineBreaks,
    highlight(code, language) {
      const normalized = language?.trim().toLowerCase();
      if (normalized && hljs.getLanguage(normalized)) {
        const highlighted = hljs.highlight(code, {
          language: normalized,
          ignoreIllegals: true,
        }).value;
        return `<pre><code class="hljs language-${escapeHtml(normalized)}">${highlighted}</code></pre>`;
      }

      return `<pre><code class="hljs">${escapeHtml(code)}</code></pre>`;
    },
  })
    .use(anchor, {
      slugify: slugifyHeading,
      permalink: false,
    })
    .use(taskLists, {
      enabled: true,
      label: true,
    });

  if (settings.extensions.footnote) {
    renderer.use(footnote);
  }

  if (settings.extensions.marks) {
    renderer.use(mark).use(sub).use(sup);
  }

  const defaultValidateLink = renderer.validateLink.bind(renderer);
  renderer.validateLink = (url) => (/^\s*file:/i.test(url) ? true : defaultValidateLink(url));

  const defaultLinkOpenRenderer = renderer.renderer.rules.link_open
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  renderer.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const href = token.attrGet("href");
    if (isExternalPreviewHref(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return defaultLinkOpenRenderer(tokens, index, options, env, self);
  };

  const defaultImageRenderer = renderer.renderer.rules.image
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  renderer.renderer.rules.image = (tokens, index, options, env: RenderOptions, self) => {
    const token = tokens[index];
    const source = token.attrGet("src");
    if (source) {
      token.attrSet("src", resolveAssetSource(source, env));
    }
    if (token.attrIndex("referrerpolicy") < 0) {
      token.attrSet("referrerpolicy", "no-referrer");
    }
    token.attrJoin("loading", "lazy");
    return defaultImageRenderer(tokens, index, options, env, self);
  };

  const defaultHtmlInlineRenderer = renderer.renderer.rules.html_inline
    ?? ((tokens, index) => tokens[index].content);
  renderer.renderer.rules.html_inline = (tokens, index, options, env: RenderOptions, self) => {
    return renderHtmlTokenWithResolvedAssets(tokens, index, options, env, self, defaultHtmlInlineRenderer);
  };

  const defaultHtmlBlockRenderer = renderer.renderer.rules.html_block
    ?? ((tokens, index) => tokens[index].content);
  renderer.renderer.rules.html_block = (tokens, index, options, env: RenderOptions, self) => {
    return renderHtmlTokenWithResolvedAssets(tokens, index, options, env, self, defaultHtmlBlockRenderer);
  };

  const defaultFenceRenderer = renderer.renderer.rules.fence
    ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  renderer.renderer.rules.fence = (tokens, index, options, env: RenderOptions, self) => {
    const token = tokens[index];
    const language = getFenceLanguage(token.info);

    if (env.settings.extensions.mermaid && (language === "mermaid" || language === "mmd")) {
      return renderDiagramBlock("mermaid-diagram", "Mermaid", `<div class="mermaid" data-diagram-source="${escapeAttribute(token.content)}">${escapeHtml(token.content)}</div>`, token.content);
    }

    if (env.settings.extensions.flowchart && (language === "flowchart" || language === "flow")) {
      return renderDiagramBlock("flowchart-diagram", "Flowchart", `<div class="flowchart-render" data-diagram-source="${escapeAttribute(token.content)}"></div>`, token.content);
    }

    const rendered = defaultFenceRenderer(tokens, index, options, env, self);
    return env.settings.codeLineNumbers ? addFenceLineNumbers(rendered, token.content) : rendered;
  };

  return renderer;
}

function renderHtmlTokenWithResolvedAssets(
  tokens: any[],
  index: number,
  options: unknown,
  env: RenderOptions,
  self: unknown,
  render: (tokens: any[], index: number, options: any, env: RenderOptions, self: any) => string,
): string {
  const token = tokens[index];
  const original = token.content;
  token.content = resolveRawHtmlLinks(resolveRawHtmlImageSources(original, env));
  const rendered = render(tokens, index, options, env, self);
  token.content = original;
  return rendered;
}

function getMarkdownRenderer(settings: EditorSettings): MarkdownIt {
  const key = [
    settings.extensions.marks,
    settings.extensions.footnote,
    settings.extensions.autoLinks,
    settings.smartPunctuation,
    settings.preserveSingleLineBreaks,
  ].map(Number).join("");
  const cached = markdownRenderers.get(key);
  if (cached) return cached;
  const renderer = createMarkdownRenderer(settings);
  markdownRenderers.set(key, renderer);
  return renderer;
}

function addFenceLineNumbers(rendered: string, content: string): string {
  const normalized = content.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const count = Math.max(1, normalized.split("\n").length);
  const lineNumbers = Array.from({ length: count }, (_item, index) => index + 1).join("\n");
  if (/<pre\s+class="/.test(rendered)) {
    return rendered.replace(
      /<pre\s+class="([^"]*)"/,
      `<pre class="$1 code-with-line-numbers" data-line-numbers="${escapeAttribute(lineNumbers)}"`,
    );
  }
  return rendered.replace(
    /<pre(?=[\s>])/,
    `<pre class="code-with-line-numbers" data-line-numbers="${escapeAttribute(lineNumbers)}"`,
  );
}

function renderMath(source: string): string {
  const protectedParts: string[] = [];
  const protect = (value: string) => {
    const token = `@@MARKO_PROTECTED_${protectedParts.length}@@`;
    protectedParts.push(value);
    return token;
  };

  let next = protectIndentedCodeBlocks(protectFencedMarkdownBlocks(source, protect), protect)
    .replace(/(`+)([^`\n]|`(?!`))*?\1/g, (match) => protect(match));

  next = protectHtmlCodeLikeBlocks(next, protect);

  next = renderQuotedMathBlocks(next);

  next = next.replace(/(^|\n)([ \t]{0,3})\$\$\s*\n?([\s\S]*?)\n?[ \t]{0,3}\$\$(?=\n|$)/g, (_match, lead: string, indent: string, formula: string) => {
    const rendered = renderKatex(formula.trim(), true);
    return `${lead}${indent}<div class="math-block">${rendered}</div>`;
  });

  next = next.replace(/(^|\n)([ \t]{0,3})\\\[\s*\n?([\s\S]*?)\n?[ \t]{0,3}\\\](?=\n|$)/g, (_match, lead: string, indent: string, formula: string) => {
    const rendered = renderKatex(formula.trim(), true);
    return `${lead}${indent}<div class="math-block">${rendered}</div>`;
  });

  next = next.replace(/(^|[^\\])\\\(([^\n]+?)\\\)/g, (_match, lead: string, formula: string) => {
    const normalized = formula.trim();
    if (!normalized) return `${lead}\\(${formula}\\)`;
    return `${lead}<span class="math-inline">${renderKatex(normalized, false)}</span>`;
  });

  next = next.replace(/(^|[^\\$])\$([^\s\n$](?:[^\n$]*?[^\s\n$])?)\$(?!\$)/g, (_match, lead: string, formula: string) => {
    const normalized = formula.trim();
    if (!normalized) return `${lead}$${formula}$`;
    return `${lead}<span class="math-inline">${renderKatex(normalized, false)}</span>`;
  });

  return protectedParts.reduce(
    (value, part, index) => value.replace(`@@MARKO_PROTECTED_${index}@@`, part),
    next,
  );
}

function protectHtmlCodeLikeBlocks(source: string, protect: (value: string) => string): string {
  return source.replace(
    /<(pre|code|kbd|samp|script|style|textarea)\b[\s\S]*?<\/\1>/gi,
    (match) => protect(match),
  );
}

type QuotedMathFence =
  | { marker: "$$"; prefix: string; key: string }
  | { marker: "\\["; prefix: string; key: string };

interface QuotedMathLineContext {
  prefix: string;
  content: string;
  trimmed: string;
  key: string;
}

function renderQuotedMathBlocks(source: string): string {
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = getQuotedMathFenceOpen(lines[index]);
    if (!opening) {
      output.push(lines[index]);
      continue;
    }

    const formulaLines: string[] = [];
    let closingIndex = -1;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const context = getQuotedMathLineContext(lines[cursor]);
      if (!context || context.key !== opening.key) break;
      if (isQuotedMathFenceClose(context, opening)) {
        closingIndex = cursor;
        break;
      }
      formulaLines.push(context.content);
    }

    if (closingIndex < 0) {
      output.push(lines[index]);
      continue;
    }

    output.push(`${opening.prefix}<div class="math-block">${renderKatex(formulaLines.join("\n").trim(), true)}</div>`);
    index = closingIndex;
  }

  return output.join("\n");
}

function getQuotedMathFenceOpen(line: string): QuotedMathFence | null {
  const context = getQuotedMathLineContext(line);
  if (!context) return null;
  if (/^\$\$\s*$/.test(context.trimmed)) {
    return { marker: "$$", prefix: context.prefix, key: context.key };
  }
  if (/^\\\[\s*$/.test(context.trimmed)) {
    return { marker: "\\[", prefix: context.prefix, key: context.key };
  }
  return null;
}

function isQuotedMathFenceClose(context: QuotedMathLineContext, fence: QuotedMathFence): boolean {
  return fence.marker === "$$" ? /^\$\$\s*$/.test(context.trimmed) : /^\\\]\s*$/.test(context.trimmed);
}

function getQuotedMathLineContext(line: string): QuotedMathLineContext | null {
  const leading = line.match(/^\s{0,3}/)?.[0] ?? "";
  let cursor = leading.length;
  let depth = 0;
  let prefix = leading;

  while (line[cursor] === ">") {
    depth += 1;
    prefix += "> ";
    cursor += 1;
    if (line[cursor] === " " || line[cursor] === "\t") {
      cursor += 1;
    }
  }

  if (depth === 0) return null;

  const content = line.slice(cursor);
  return {
    prefix,
    content,
    trimmed: content.trim(),
    key: `${leading.length}:${depth}`,
  };
}

function preserveMathDelimiters(source: string): string {
  const protectedParts: string[] = [];
  const protect = (value: string) => {
    const token = `@@MARKO_PROTECTED_${protectedParts.length}@@`;
    protectedParts.push(value);
    return token;
  };

  const next = protectIndentedCodeBlocks(protectFencedMarkdownBlocks(source, protect), protect)
    .replace(/(`+)([^`\n]|`(?!`))*?\1/g, (match) => protect(match))
    .replace(/(^|\n)([ \t]{0,3})\\\[([\s\S]*?)\\\](?=\n|$)/g, (_match, lead: string, indent: string, formula: string) => (
      `${lead}${indent}&#92;[${formula}&#92;]`
    ))
    .replace(/(^|[^\\])\\\(([^\n]+?)\\\)/g, (_match, lead: string, formula: string) => (
      `${lead}&#92;(${formula}&#92;)`
    ));

  return protectedParts.reduce(
    (value, part, index) => value.replace(`@@MARKO_PROTECTED_${index}@@`, part),
    next,
  );
}

function protectFencedMarkdownBlocks(source: string, protect: (value: string) => string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const openingLine = stripCarriageReturn(lines[index]);
    const opening = getProtectedFenceOpen(openingLine);
    if (!opening) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const marker = opening.marker;
    const markerChar = marker[0];
    const markerLength = marker.length;
    const block = [lines[index]];
    index += 1;

    while (index < lines.length) {
      const line = stripCarriageReturn(lines[index]);
      block.push(lines[index]);
      index += 1;
      const closing = getProtectedFenceClose(line, opening.quoteKey);
      if (closing && closing[0] === markerChar && closing.length >= markerLength) {
        break;
      }
    }

    output.push(protect(block.join("\n")));
  }

  return output.join("\n");
}

function protectIndentedCodeBlocks(source: string, protect: (value: string) => string): string {
  const lines = source.split("\n");
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const key = getIndentedCodeLineKey(lines[index]);
    if (!key) {
      output.push(lines[index]);
      index += 1;
      continue;
    }

    const block: string[] = [];
    while (
      index < lines.length
      && (getIndentedCodeLineKey(lines[index]) === key || (block.length > 0 && isBlankLineInQuoteContext(lines[index], key)))
    ) {
      block.push(lines[index]);
      index += 1;
    }
    output.push(protect(block.join("\n")));
  }

  return output.join("\n");
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4,}|\t)/.test(line);
}

function getIndentedCodeLineKey(line: string): string | null {
  const context = getOutlineLineContext(line);
  const content = context.quoteKey === "plain" ? line : context.content;
  return isIndentedCodeLine(content) ? context.quoteKey : null;
}

function isBlankLineInQuoteContext(line: string, key: string): boolean {
  const context = getOutlineLineContext(line);
  return context.quoteKey === key && !context.content.trim();
}

function getProtectedFenceOpen(line: string): { marker: string; quoteKey: string } | null {
  const context = getOutlineLineContext(line);
  const content = context.quoteKey === "plain" ? line : context.content;
  const opening = content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  return opening ? { marker: opening[1], quoteKey: context.quoteKey } : null;
}

function getProtectedFenceClose(line: string, quoteKey: string): string | null {
  const context = getOutlineLineContext(line);
  if (context.quoteKey !== quoteKey) return null;
  const content = context.quoteKey === "plain" ? line : context.content;
  const closing = content.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);
  return closing?.[1] ?? null;
}

function stripCarriageReturn(value: string): string {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}

function renderKatex(formula: string, displayMode: boolean): string {
  return katex.renderToString(formula, {
    displayMode,
    throwOnError: false,
    strict: false,
    trust: false,
  });
}

function escapeFootnoteSyntax(source: string): string {
  return source.replace(/(^|[^\\])\[\^([^\]\s]+)]/g, (_match, lead: string, id: string) => `${lead}\\[\\^${id}]`);
}

function renderAlerts(source: string, options: RenderOptions, protectHtml: (html: string) => string): string {
  const lines = source.split(/\r?\n/);
  const rendered: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const marker = lines[index].match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)]\s*$/i);
    if (!marker) {
      rendered.push(lines[index]);
      index += 1;
      continue;
    }

    const kind = marker[1].toLowerCase();
    const body: string[] = [];
    index += 1;
    while (index < lines.length && /^>\s?/.test(lines[index])) {
      body.push(lines[index].replace(/^>\s?/, ""));
      index += 1;
    }

    const preparedBody = prepareMarkdown(body.join("\n"), options);
    const html = getMarkdownRenderer(options.settings).render(preparedBody, options);
    rendered.push(protectHtml(
      `<div class="md-alert md-alert-${kind}"><p class="md-alert-title">${alertLabels[kind]}</p>${html}</div>`,
    ));
  }

  return rendered.join("\n");
}

function restoreProtectedHtml(source: string, protectedHtml: string[]): string {
  let next = source;
  let changed = true;

  while (changed) {
    changed = false;
    protectedHtml.forEach((html, index) => {
      const token = `@@MARKO_HTML_${index}@@`;
      if (!next.includes(token)) return;
      next = next.split(token).join(html);
      changed = true;
    });
  }

  return next;
}

function renderToc(outline: OutlineItem[]): string {
  if (outline.length === 0) {
    return `<div class="toc-inline toc-empty">暂无目录</div>`;
  }

  const items = outline
    .map((item) => {
      const level = Math.max(1, item.level - 1);
      return `<li class="toc-inline-item lv-${level}"><a href="#${escapeAttribute(item.id)}">${escapeHtml(item.title)}</a></li>`;
    })
    .join("");

  return `<nav class="toc-inline"><ul>${items}</ul></nav>`;
}

function renderAbbreviations(
  source: string,
  options: RenderOptions,
  protectHtml: (html: string) => string,
): string {
  const abbreviations = collectMarkdownAbbreviations(options.documentSource ?? source);
  if (abbreviations.length === 0) return source;
  const referenceLabels = collectReferenceDefinitionLabels(options.documentSource ?? source);

  const lines = source.split("\n");
  const rendered: string[] = [];
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (const line of lines) {
    const cleanLine = stripCarriageReturn(line);
    const carriageReturn = cleanLine.length === line.length ? "" : "\r";
    const context = getOutlineLineContext(cleanLine);

    if (activeFence) {
      rendered.push(line);
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      rendered.push(line);
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      rendered.push(line);
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      rendered.push(line);
      continue;
    }

    if (isMarkdownAbbreviationDefinitionLine(context.content)) {
      rendered.push(`${context.prefix}${carriageReturn}`);
      continue;
    }

    if (isMarkdownLinkReferenceDefinitionLine(context.content)) {
      rendered.push(line);
      continue;
    }

    rendered.push(`${context.prefix}${renderAbbreviationsInLine(context.content, abbreviations, protectHtml, referenceLabels)}${carriageReturn}`);
  }

  return rendered.join("\n");
}

function collectReferenceDefinitionLabels(source: string): Set<string> {
  const labels = new Set<string>();
  const lines = source.split(/\r?\n/);
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (const line of lines) {
    const context = getOutlineLineContext(line);

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    if (isIndentedCodeLine(context.content)) continue;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      continue;
    }

    const match = context.content.match(/^[ \t]{0,3}\[([^\]\n]+)]:[ \t]*\S/);
    if (!match || match[1].startsWith("^")) continue;
    labels.add(normalizeReferenceLabel(match[1]));
  }

  return labels;
}

function collectMarkdownAbbreviations(source: string): MarkdownAbbreviation[] {
  const seen = new Map<string, MarkdownAbbreviation>();
  const lines = source.split(/\r?\n/);
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (const line of lines) {
    const context = getOutlineLineContext(line);

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    if (isIndentedCodeLine(context.content)) continue;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      continue;
    }

    const match = context.content.match(/^[ \t]{0,3}\*\[([^\]\n]+)]:[ \t]*(.+?)\s*$/);
    if (!match) continue;
    const label = match[1].trim();
    const title = match[2].trim();
    if (!label || !title) continue;
    seen.set(label, { label, title });
  }

  return Array.from(seen.values()).sort((left, right) => right.label.length - left.label.length);
}

function isMarkdownAbbreviationDefinitionLine(line: string): boolean {
  return /^[ \t]{0,3}\*\[[^\]\n]+]:[ \t]*\S/.test(line);
}

function isMarkdownLinkReferenceDefinitionLine(line: string): boolean {
  return /^[ \t]{0,3}\[[^\]\n]+]:[ \t]*\S/.test(line) && !/^[ \t]{0,3}\[\^[^\]\s]+]:/.test(line);
}

function renderAbbreviationsInLine(
  line: string,
  abbreviations: MarkdownAbbreviation[],
  protectHtml: (html: string) => string,
  referenceLabels: Set<string>,
): string {
  const protectedLine = protectInlineAbbreviationSkips(line, referenceLabels);
  let next = protectedLine.value;

  for (const abbreviation of abbreviations) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(abbreviation.label)})(?=$|[^\\p{L}\\p{N}_])`, "gu");
    next = next.replace(pattern, (_match, lead: string, label: string) => (
      `${lead}${protectHtml(`<abbr title="${escapeAttribute(abbreviation.title)}">${escapeHtml(label)}</abbr>`)}`
    ));
  }

  return restoreProtectedInlineAbbreviationSkips(next, protectedLine.segments);
}

function protectInlineAbbreviationSkips(value: string, referenceLabels: Set<string>): { value: string; segments: string[] } {
  const segments: string[] = [];
  const protect = (segment: string) => {
    const token = `@@MARKO_ABBR_SKIP_${segments.length}@@`;
    segments.push(segment);
    return token;
  };

  const inlineProtected = value
      .replace(/(`+)([^`\n]|`(?!`))*?\1/g, (match) => protect(match))
      .replace(/<[^>\n]+>/g, (match) => protect(match));
  const shortcutProtected = protectShortcutReferenceLinks(inlineProtected, protect, referenceLabels);

  return {
    value: protectMarkdownLinkTargets(shortcutProtected, protect, referenceLabels),
    segments,
  };
}

function protectMarkdownLinkTargets(
  value: string,
  protect: (segment: string) => string,
  referenceLabels: Set<string>,
): string {
  return replaceMarkdownLinkSyntax(value, (link) => {
    if (link.imageStart !== null) {
      return protect(value.slice(link.imageStart, link.end));
    }

    const label = value.slice(link.start, link.labelEnd + 1);
    const rawTarget = value.slice(link.labelEnd + 1, link.end);
    const target = rawTarget === "[]" && referenceLabels.has(normalizeReferenceLabel(link.label))
      ? `[${link.label}]`
      : rawTarget;
    return `${label}${protect(target)}`;
  });
}

function protectShortcutReferenceLinks(
  value: string,
  protect: (segment: string) => string,
  referenceLabels: Set<string>,
): string {
  let result = "";
  let cursor = 0;

  while (cursor < value.length) {
    const open = value.indexOf("[", cursor);
    if (open < 0) {
      result += value.slice(cursor);
      break;
    }

    const close = findReferenceLabelEnd(value, open + 1);
    if (close < 0) {
      result += value.slice(cursor);
      break;
    }

    const next = value[close + 1];
    const label = value.slice(open + 1, close);
    const imageStart = value[open - 1] === "!" ? open - 1 : null;
    const normalized = normalizeReferenceLabel(label);
    if ((next === "(" || next === "[") || !referenceLabels.has(normalized)) {
      result += value.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    const start = imageStart ?? open;
    result += value.slice(cursor, start);
    if (imageStart !== null) {
      result += protect(value.slice(imageStart, close + 1));
    } else {
      result += `${value.slice(open, close + 1)}${protect(`[${label}]`)}`;
    }
    cursor = close + 1;
  }

  return result;
}

function restoreProtectedInlineAbbreviationSkips(value: string, segments: string[]): string {
  return value.replace(/@@MARKO_ABBR_SKIP_(\d+)@@/g, (match, index: string) => segments[Number(index)] ?? match);
}

function renderDefinitionLists(
  source: string,
  options: RenderOptions,
  protectHtml: (html: string) => string,
): string {
  const lines = source.split("\n");
  const rendered: string[] = [];
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;
  let index = 0;

  while (index < lines.length) {
    const cleanLine = stripCarriageReturn(lines[index]);
    const carriageReturn = cleanLine.length === lines[index].length ? "" : "\r";
    const context = getOutlineLineContext(cleanLine);

    if (activeFence) {
      rendered.push(lines[index]);
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      index += 1;
      continue;
    }

    if (activeHtmlBlock) {
      rendered.push(lines[index]);
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      index += 1;
      continue;
    }

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      rendered.push(lines[index]);
      index += 1;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      rendered.push(lines[index]);
      index += 1;
      continue;
    }

    const definitionList = readDefinitionList(lines, index);
    if (!definitionList) {
      rendered.push(lines[index]);
      index += 1;
      continue;
    }

    const html = renderDefinitionListHtml(definitionList.entries, options);
    const prefixedHtml = definitionList.prefix ? html.replace(/\n/g, `\n${definitionList.prefix}`) : html;
    rendered.push(`${definitionList.prefix}${protectHtml(prefixedHtml)}${carriageReturn}`);
    index = definitionList.nextIndex;
  }

  return rendered.join("\n");
}

function readDefinitionList(
  lines: string[],
  startIndex: number,
): { entries: DefinitionListEntry[]; nextIndex: number; prefix: string } | null {
  const firstContext = getDefinitionLineContext(lines[startIndex] ?? "");
  const quoteKey = firstContext.quoteKey;
  const prefix = firstContext.prefix;
  const entries: DefinitionListEntry[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const termStart = index;
    const terms: string[] = [];

    while (index < lines.length && isDefinitionTermLine(lines[index], quoteKey)) {
      terms.push(getDefinitionLineContext(lines[index]).content.trim());
      index += 1;
      if (index >= lines.length || isDefinitionMarkerLine(lines[index], quoteKey)) break;
    }

    if (terms.length === 0 || !isDefinitionMarkerLine(lines[index] ?? "", quoteKey)) {
      return entries.length > 0 ? { entries, nextIndex: termStart, prefix } : null;
    }

    const definitions: DefinitionListDefinition[] = [];
    while (index < lines.length) {
      const marker = readDefinitionMarkerFromLine(lines[index], quoteKey);
      if (!marker) break;
      const definitionLines = [marker.content.trim()];
      let loose = false;
      index += 1;

      while (index < lines.length) {
        const continuation = getDefinitionLineContext(lines[index]);
        if (continuation.quoteKey !== quoteKey) break;
        if (!continuation.content.trim()) {
          if (!hasFollowingDefinitionBlockContinuationLine(lines, index + 1, quoteKey)) break;
          definitionLines.push("");
          loose = true;
          index += 1;
          continue;
        }
        if (isDefinitionMarkerLine(lines[index], quoteKey)) break;
        if (isDefinitionEntryStart(lines, index, quoteKey)) break;
        if (!isDefinitionContinuationLine(lines[index], quoteKey)) break;
        definitionLines.push(stripDefinitionContinuationIndent(lines[index], quoteKey));
        index += 1;
      }

      definitions.push({ lines: definitionLines, loose });
    }

    entries.push({ terms, definitions });

    if (!isDefinitionEntryStart(lines, index, quoteKey)) {
      break;
    }
  }

  return entries.length > 0 ? { entries, nextIndex: index, prefix } : null;
}

function getDefinitionLineContext(line: string): OutlineLineContext {
  return getOutlineLineContext(stripCarriageReturn(line));
}

function isDefinitionEntryStart(lines: string[], index: number, quoteKey: string): boolean {
  if (!isDefinitionTermLine(lines[index] ?? "", quoteKey)) return false;
  let cursor = index;
  while (cursor < lines.length && isDefinitionTermLine(lines[cursor], quoteKey)) {
    cursor += 1;
  }
  return isDefinitionMarkerLine(lines[cursor] ?? "", quoteKey);
}

function isDefinitionTermLine(line: string, quoteKey: string): boolean {
  const context = getDefinitionLineContext(line);
  if (context.quoteKey !== quoteKey) return false;
  if (!context.trimmed) return false;
  if (isIndentedCodeLine(context.content)) return false;
  if (readDefinitionMarker(context.content)) return false;
  if (getOutlineFenceOpen(context.content)) return false;
  if (getOutlineHtmlBlockOpen(context.content, context.quoteKey)) return false;
  if (/^[ \t]{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|(?:-{3,}|\*{3,}|_{3,})\s*$|\[[^\]\n]+]:\s*\S|\[\^[^\]\s]+]:|\|)/.test(context.content)) {
    return false;
  }
  return true;
}

function isDefinitionMarkerLine(line: string, quoteKey: string): boolean {
  return readDefinitionMarkerFromLine(line, quoteKey) !== null;
}

function readDefinitionMarkerFromLine(line: string, quoteKey: string): { content: string } | null {
  const context = getDefinitionLineContext(line);
  if (context.quoteKey !== quoteKey) return null;
  return readDefinitionMarker(context.content);
}

function readDefinitionMarker(line: string): { content: string } | null {
  const match = line.match(/^[ \t]{0,3}:(?:[ \t]+(.*)|$)/);
  return match ? { content: match[1] ?? "" } : null;
}

function isDefinitionContinuationLine(line: string, quoteKey: string): boolean {
  const context = getDefinitionLineContext(line);
  return context.quoteKey === quoteKey && /^(?:[ \t]{2,}|\t)/.test(context.content);
}

function hasFollowingDefinitionBlockContinuationLine(lines: string[], startIndex: number, quoteKey: string): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    const context = getDefinitionLineContext(lines[index]);
    if (context.quoteKey !== quoteKey) return false;
    if (!context.content.trim()) continue;
    return isDefinitionBlockContinuationLine(lines[index], quoteKey);
  }
  return false;
}

function isDefinitionBlockContinuationLine(line: string, quoteKey: string): boolean {
  const context = getDefinitionLineContext(line);
  return context.quoteKey === quoteKey && /^(?:[ \t]{4,}|\t)/.test(context.content);
}

function stripDefinitionContinuationIndent(line: string, quoteKey: string): string {
  const context = getDefinitionLineContext(line);
  if (context.quoteKey !== quoteKey) return "";
  return context.content.replace(/^(?: {2,4}|\t)/, "").trimEnd();
}

function renderDefinitionListHtml(entries: DefinitionListEntry[], options: RenderOptions): string {
  const items = entries.flatMap((entry) => [
    ...entry.terms.map((term) => `<dt>${renderDefinitionInlineMarkdown(term, options)}</dt>`),
    ...entry.definitions.map((definition) => `<dd>${renderDefinitionMarkdown(definition, options)}</dd>`),
  ]);
  return `<dl class="definition-list">${items.join("")}</dl>`;
}

function renderDefinitionMarkdown(definition: DefinitionListDefinition, options: RenderOptions): string {
  const source = definition.loose
    ? definition.lines.join("\n").trim()
    : definition.lines.join(" ").trim();
  if (!definition.loose && !isDefinitionBlockMarkdown(source)) {
    return renderDefinitionInlineMarkdown(source, options);
  }

  const prepared = options.settings.extensions.html ? source : escapeDisabledRawHtml(source);
  return getMarkdownRenderer(options.settings).render(prepared, options).trim();
}

function renderDefinitionInlineMarkdown(value: string, options: RenderOptions): string {
  const source = options.settings.extensions.html ? value : escapeDisabledRawHtml(value);
  return getMarkdownRenderer(options.settings).renderInline(source, options);
}

function isDefinitionBlockMarkdown(value: string): boolean {
  return /(^|\n)\s{0,3}(?:#{1,6}\s|[-*+]\s+|\d+[.)]\s+|>\s?|`{3,}|~{3,}|\$\$\s*$|\\\[\s*$|(?:-{3,}|\*{3,}|_{3,})\s*$|\|)/.test(value);
}

function renderDiagramBlock(className: string, title: string, diagramHtml: string, source: string): string {
  const sourceCode = escapeHtml(source.trimEnd());
  const rows = Math.min(18, Math.max(5, sourceCode.split("\n").length + 1));
  return [
    `<div class="diagram-box ${className}">`,
    diagramHtml,
    `<div class="diagram-source-panel" aria-label="${escapeAttribute(title)} 底层数据">`,
    `<div class="diagram-source-title">${escapeHtml(title)} 底层数据</div>`,
    `<textarea class="diagram-source-editor" spellcheck="false" rows="${rows}">${sourceCode}</textarea>`,
    "</div>",
    "</div>\n",
  ].join("");
}

function splitFrontMatter(source: string): { frontMatter: string; body: string } {
  const match = source.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { frontMatter: "", body: source };
  }

  return {
    frontMatter: match[0],
    body: source.slice(match[0].length),
  };
}

function appendReferencedFootnotes(source: string, documentSource: string): string {
  const ids = Array.from(source.matchAll(/\[\^([^\]\s]+)]/g))
    .map((match) => match[1])
    .filter((value, index, values) => values.indexOf(value) === index);

  if (ids.length === 0) {
    return source;
  }

  const definitions = ids
    .filter((id) => !hasFootnoteDefinition(source, id))
    .map((id) => findFootnoteDefinition(documentSource, id))
    .filter(Boolean);

  if (definitions.length === 0) {
    return source;
  }

  return `${source.trimEnd()}\n\n${definitions.join("\n\n")}`;
}

function appendReferencedLinkDefinitions(source: string, documentSource: string): string {
  const labels = collectReferenceLinkLabels(source)
    .filter((label, index, values) => values.indexOf(label) === index)
    .filter((label) => !hasReferenceDefinition(source, label));

  if (labels.length === 0) {
    return source;
  }

  const definitions = labels
    .map((label) => findReferenceDefinition(documentSource, label))
    .filter(Boolean);

  if (definitions.length === 0) {
    return source;
  }

  return `${source.trimEnd()}\n\n${definitions.join("\n\n")}`;
}

function collectReferenceLinkLabels(source: string): string[] {
  const labels: string[] = [];

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "[" || isEscapedAt(source, index)) continue;

    const closeLabel = findReferenceLabelEnd(source, index + 1);
    if (closeLabel < 0) continue;

    const label = source.slice(index + 1, closeLabel);
    if (!isReferenceLinkLabel(label)) {
      index = closeLabel;
      continue;
    }

    const next = source[closeLabel + 1];
    if (next === "(") {
      index = closeLabel;
      continue;
    }

    if (next === "[") {
      const closeReference = findReferenceLabelEnd(source, closeLabel + 2);
      if (closeReference < 0) {
        index = closeLabel;
        continue;
      }

      const referenceLabel = source.slice(closeLabel + 2, closeReference);
      if (referenceLabel.trim()) {
        labels.push(normalizeReferenceLabel(referenceLabel));
      } else {
        labels.push(normalizeReferenceLabel(label));
      }
      index = closeReference;
      continue;
    }

    labels.push(normalizeReferenceLabel(label));
    index = closeLabel;
  }

  return labels;
}

function findReferenceDefinition(source: string, label: string): string {
  const normalizedLabel = normalizeReferenceLabel(label);
  const lines = source.split(/\r?\n/);
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const context = getOutlineLineContext(lines[index]);

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    if (isIndentedCodeLine(context.content)) continue;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      continue;
    }

    const match = context.content.match(/^[ \t]{0,3}\[([^\]\n]+)]:[ \t]*\S/);
    if (!match || match[1].startsWith("^")) continue;
    if (normalizeReferenceLabel(match[1]) !== normalizedLabel) continue;

    const collected = [lines[index]];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (cursor === index + 1 && isReferenceTitleContinuationLine(lines[cursor])) {
        collected.push(lines[cursor]);
        continue;
      }
      break;
    }
    return collected.join("\n").trimEnd();
  }

  return "";
}

function isReferenceTitleContinuationLine(line: string): boolean {
  return /^[ \t]*(?:"[^"]*"|'[^']*'|\([^)]*\))\s*$/.test(line);
}

function hasReferenceDefinition(source: string, label: string): boolean {
  return Boolean(findReferenceDefinition(source, label));
}

function isReferenceLinkLabel(label: string): boolean {
  const trimmed = label.trim();
  return Boolean(trimmed) && !trimmed.startsWith("^");
}

function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function findReferenceLabelEnd(source: string, start: number): number {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (isEscapedAt(source, index)) continue;
    if (source[index] === "[") {
      depth += 1;
      continue;
    }
    if (source[index] === "]") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function findFootnoteDefinition(source: string, id: string): string {
  const lines = source.split(/\r?\n/);
  const startPattern = new RegExp(`^ {0,3}\\[\\^${escapeRegExp(id)}]:`);
  const start = findFootnoteDefinitionLineIndex(lines, startPattern);
  if (start < 0) return "";

  const collected = [lines[start]];
  let requiresIndentedContinuation = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      if (hasFollowingFootnoteIndentedContinuationLine(lines, index + 1)) {
        collected.push(line);
        requiresIndentedContinuation = true;
        continue;
      }
      break;
    }

    if (isFootnoteIndentedContinuationLine(line)) {
      collected.push(line);
      requiresIndentedContinuation = false;
      continue;
    }

    if (!requiresIndentedContinuation && isFootnoteParagraphContinuationLine(line)) {
      collected.push(line);
      continue;
    }

    break;
  }

  return collected.join("\n").trimEnd();
}

function hasFootnoteDefinition(source: string, id: string): boolean {
  return Boolean(findFootnoteDefinition(source, id));
}

function findFootnoteDefinitionLineIndex(lines: string[], startPattern: RegExp): number {
  let activeFence: OutlineFence | null = null;
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const context = getOutlineLineContext(lines[index]);

    if (activeFence) {
      if (isOutlineFenceClose(context.content, activeFence)) {
        activeFence = null;
      }
      continue;
    }

    if (activeHtmlBlock) {
      if (context.quoteKey === activeHtmlBlock.quoteKey) {
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
      } else {
        activeHtmlBlock = null;
      }
      continue;
    }

    if (isIndentedCodeLine(context.content)) continue;

    const fence = getOutlineFenceOpen(context.content);
    if (fence) {
      activeFence = fence;
      continue;
    }

    const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
    if (htmlBlock) {
      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      continue;
    }

    if (startPattern.test(context.content)) return index;
  }

  return -1;
}

function isFootnoteDefinitionBlock(source: string): boolean {
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const firstContent = lines.findIndex((line) => line.trim());
  if (firstContent < 0 || !/^ {0,3}\[\^[^\]]+]:/.test(lines[firstContent] ?? "")) {
    return false;
  }

  let requiresIndentedContinuation = false;
  for (let index = firstContent + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      if (hasFollowingFootnoteIndentedContinuationLine(lines, index + 1)) {
        requiresIndentedContinuation = true;
        continue;
      }
      return lines.slice(index + 1).every((rest) => !rest.trim());
    }

    if (isFootnoteIndentedContinuationLine(line)) {
      requiresIndentedContinuation = false;
      continue;
    }

    if (!requiresIndentedContinuation && isFootnoteParagraphContinuationLine(line)) {
      continue;
    }

    return false;
  }

  return true;
}

function hasFollowingFootnoteIndentedContinuationLine(lines: string[], startIndex: number): boolean {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    return isFootnoteIndentedContinuationLine(lines[index]);
  }
  return false;
}

function isFootnoteIndentedContinuationLine(line: string): boolean {
  return /^(?: {4,}| {0,3}\t)/.test(line);
}

function isFootnoteParagraphContinuationLine(line: string): boolean {
  if (!line.trim()) return false;
  if (isFootnoteIndentedContinuationLine(line)) return true;
  return !isFootnoteInterruptingBlockLine(line.replace(/^ {0,3}/, ""));
}

function isFootnoteInterruptingBlockLine(content: string): boolean {
  return /^(?:#{1,6}\s|(?:[-*+]|\d+[.)])\s+|>\s?|`{3,}|~{3,}|\$\$\s*$|\\\[\s*$|(?:-{3,}|\*{3,}|_{3,})\s*$|\[\^[^\]\s]+]:|\[[^\]\n]+]:\s*\S|<!--|<\/?[A-Za-z][^>\n]*>)/.test(content);
}

function resolveAssetSource(source: string, options: RenderOptions): string {
  const normalized = source.trim();
  if (!isSafeImageSource(normalized)) {
    return "";
  }

  if (isPassthroughImageSource(normalized)) {
    return normalized;
  }

  const resolved = resolvePathLike(normalized, options.basePath);
  return options.assetResolver?.(resolved) ?? resolved;
}

function isSafeImageSource(source: string): boolean {
  if (!source) return false;
  if (/^data:/i.test(source)) return /^data:image\//i.test(source);
  return getPreviewLinkAction(source) !== "blocked";
}

function isPassthroughImageSource(source: string): boolean {
  if (/^data:image\//i.test(source)) return true;
  if (/^(https?:|blob:|#|file:)/i.test(source) || source.startsWith("//")) return true;
  return !isWindowsAbsolutePath(source) && /^[a-z][a-z0-9+.-]*:/i.test(source);
}

function resolveRawHtmlImageSources(html: string, options: RenderOptions): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => (
    tag.replace(/(\ssrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i, (
      _match,
      prefix: string,
      doubleQuoted: string | undefined,
      singleQuoted: string | undefined,
      bare: string | undefined,
    ) => {
      const source = decodeHtmlAttribute(doubleQuoted ?? singleQuoted ?? bare ?? "");
      const quote = singleQuoted === undefined ? "\"" : "'";
      return `${prefix}${quote}${escapeAttribute(resolveAssetSource(source, options))}${quote}`;
    })
  ));
}

function resolveRawHtmlLinks(html: string): string {
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    const href = getHtmlAttributeValue(tag, "href");
    if (getPreviewLinkAction(href) !== "external") {
      return tag;
    }

    return setHtmlAttribute(
      setHtmlAttribute(tag, "target", "_blank"),
      "rel",
      "noopener noreferrer",
    );
  });
}

function getHtmlAttributeValue(tag: string, name: string): string | null {
  const attributeValuePattern = "(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>`]+))";
  const pattern = new RegExp(
    `\\s${escapeRegExp(name)}\\s*=\\s*${attributeValuePattern}`,
    "i",
  );
  const match = tag.match(pattern);
  if (!match) return null;
  return decodeHtmlAttribute(match[1] ?? match[2] ?? match[3] ?? "");
}

function setHtmlAttribute(tag: string, name: string, value: string): string {
  const escapedName = escapeRegExp(name);
  const attributeValuePattern = "(?:\"[^\"]*\"|'[^']*'|[^\\s\"'=<>`]+)";
  const pattern = new RegExp(
    `(\\s${escapedName}\\s*=\\s*)${attributeValuePattern}`,
    "i",
  );
  const replacement = `$1"${escapeAttribute(value)}"`;
  if (pattern.test(tag)) {
    return tag.replace(pattern, replacement);
  }

  const closing = tag.match(/\s*\/?>$/)?.[0] ?? ">";
  return `${tag.slice(0, tag.length - closing.length)} ${name}="${escapeAttribute(value)}"${closing}`;
}

function resolvePathLike(source: string, basePath?: string): string {
  const normalizedSource = normalizePathSeparators(source);
  if (!basePath || isAbsolutePath(normalizedSource)) {
    return normalizedSource;
  }

  const normalizedBase = basePath.replace(/\\/g, "/");
  const baseDir = normalizedBase.includes("/")
    ? normalizedBase.slice(0, normalizedBase.lastIndexOf("/"))
    : "";
  const stack = `${baseDir}/${normalizedSource}`.split("/");
  const result: string[] = [];

  for (const part of stack) {
    if (!part || part === ".") continue;
    if (part === "..") {
      result.pop();
      continue;
    }
    result.push(part);
  }

  if (/^[A-Za-z]:$/.test(result[0])) {
    return `${result[0]}/${result.slice(1).join("/")}`;
  }

  return result.join("/");
}

function isAbsolutePath(source: string): boolean {
  return isWindowsAbsolutePath(source) || source.startsWith("/") || /^\\\\[^\\]/.test(source);
}

function isWindowsAbsolutePath(source: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(source) || /^[A-Za-z]:%5[cC]/.test(source);
}

function normalizePathSeparators(source: string): string {
  return decodePathLikeSource(source).replace(/%5[cC]/g, "/").replace(/\\/g, "/");
}

function decodePathLikeSource(source: string): string {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}

function getFenceLanguage(info: string): string {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function isSetextHeadingText(value: string): boolean {
  return Boolean(value)
    && !/^(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|```|~~~|\|)/.test(value)
    && !/^\[[^\]]+]:/.test(value);
}

function stripInlineMarkdown(value: string): string {
  const escaped = protectMarkdownEscapes(value);
  const stripped = replaceMarkdownLinkSyntax(escaped.value, (link) => link.label)
    .replace(/(`+)([\s\S]*?)\1/g, (_match, _marker: string, content: string) => stripCodeSpanPadding(content))
    .replace(/<([^<>\s]+)>/g, (_match, href: string) => (
      isRenderedAutolink(href) ? href : ""
    ))
    .replace(/<[^>\n]+>/g, "")
    .replace(/(\*\*|__)([\s\S]*?)\1/g, "$2")
    .replace(/(\*|_)([^*_]+?)\1/g, "$2")
    .replace(/~~([\s\S]*?)~~/g, "$1")
    .replace(/==([\s\S]*?)==/g, "$1")
    .replace(/\^([^^]+)\^/g, "$1")
    .replace(/~([^~]+)~/g, "$1")
    .trim();
  return restoreMarkdownEscapes(stripped, escaped.segments);
}

function stripCodeSpanPadding(content: string): string {
  if (content.startsWith(" ") && content.endsWith(" ") && content.trim()) {
    return content.slice(1, -1);
  }
  return content;
}

function protectMarkdownEscapes(value: string): { value: string; segments: string[] } {
  const segments: string[] = [];
  return {
    value: value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, (_match, char: string) => {
      const token = `MARKOESCAPED${segments.length}TOKEN`;
      segments.push(char);
      return token;
    }),
    segments,
  };
}

function restoreMarkdownEscapes(value: string, segments: string[]): string {
  return value.replace(/MARKOESCAPED(\d+)TOKEN/g, (match, index: string) => segments[Number(index)] ?? match);
}

function isRenderedAutolink(href: string): boolean {
  const action = getPreviewLinkAction(href);
  return action === "external" || action === "local";
}

function stripAtxClosingMarker(value: string): string {
  return value.replace(/\s+#+\s*$/, "").trim();
}

function slugifyHeading(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=[\]{}\\|;:'",.<>/?]/g, "")
    .replace(/\s+/g, "-");
  return slug || "heading";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeDisabledRawHtml(value: string): string {
  const lines = value.split("\n");
  let activeHtmlBlock: OutlineHtmlBlock | null = null;

  return lines
    .map((line) => {
      const cleanLine = stripCarriageReturn(line);
      const carriageReturn = cleanLine.length === line.length ? "" : "\r";
      const context = getOutlineLineContext(cleanLine);

      if (activeHtmlBlock && context.quoteKey !== activeHtmlBlock.quoteKey) {
        activeHtmlBlock = null;
      }

      if (activeHtmlBlock) {
        const escaped = `${context.prefix}${escapeDisabledRawHtmlBlockContent(context.content)}${carriageReturn}`;
        if (isOutlineHtmlBlockClose(context.content, activeHtmlBlock)) {
          activeHtmlBlock = null;
        }
        return escaped;
      }

      const htmlBlock = getOutlineHtmlBlockOpen(context.content, context.quoteKey);
      if (!htmlBlock) {
        return `${escapeHtml(cleanLine).replace(/&lt;\/?[A-Za-z][^\n]*?&gt;/g, maskEscapedHtmlTagLinks)}${carriageReturn}`;
      }

      if (!isOutlineHtmlBlockClose(context.content, htmlBlock)) {
        activeHtmlBlock = htmlBlock;
      }
      return `${context.prefix}${escapeDisabledRawHtmlBlockContent(context.content)}${carriageReturn}`;
    })
    .join("\n");
}

function maskEscapedHtmlTagLinks(tag: string): string {
  return tag
    .replace(/\b([a-z][a-z0-9+.-]*):\/\//gi, "$1&#58;//")
    .replace(/\bmailto:/gi, "mailto&#58;")
    .replace(/([^\s"'<>;&]+)@([^\s"'<>;&]+)/g, "$1&#64;$2");
}

function escapeDisabledRawHtmlBlockContent(value: string): string {
  return restoreDisabledMarkdownSyntaxTokens(
    escapeHtml(maskDisabledMarkdownSyntax(value)),
  );
}

function maskDisabledMarkdownSyntax(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+\-.!|$~=^:>@]/g, (char) => (
    `@@MARKO_MD_${char.charCodeAt(0)}@@`
  ));
}

function restoreDisabledMarkdownSyntaxTokens(value: string): string {
  return value.replace(/@@MARKO_MD_(\d+)@@/g, (_match, code: string) => `&#${code};`);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, "&#10;");
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import type { EditorSettings, OutlineItem } from "@/types";

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

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
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
  .use(footnote)
  .use(taskLists, {
    enabled: true,
    label: true,
  })
  .use(mark)
  .use(sub)
  .use(sup);

const defaultImageRenderer = md.renderer.rules.image
  ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
md.renderer.rules.image = (tokens, index, options, env: RenderOptions, self) => {
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

const defaultFenceRenderer = md.renderer.rules.fence
  ?? ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
md.renderer.rules.fence = (tokens, index, options, env: RenderOptions, self) => {
  const token = tokens[index];
  const language = getFenceLanguage(token.info);

  if (env.settings.extensions.mermaid && (language === "mermaid" || language === "mmd")) {
    return renderDiagramBlock("mermaid-diagram", "Mermaid", `<div class="mermaid" data-diagram-source="${escapeAttribute(token.content)}">${escapeHtml(token.content)}</div>`, token.content);
  }

  if (env.settings.extensions.flowchart && (language === "flowchart" || language === "flow")) {
    return renderDiagramBlock("flowchart-diagram", "Flowchart", `<div class="flowchart-render" data-diagram-source="${escapeAttribute(token.content)}"></div>`, token.content);
  }

  return defaultFenceRenderer(tokens, index, options, env, self);
};

export function renderMarkdown(source: string, options: RenderOptions): string {
  const parts = splitFrontMatter(source);
  if (options.settings.extensions.footnote && isFootnoteDefinitionBlock(parts.body)) {
    return `<div class="footnote-definition-block">${escapeHtml(parts.body.trim())}</div>`;
  }

  const footnoteBody = options.settings.extensions.footnote
    ? appendReferencedFootnotes(parts.body, options.documentSource ?? source)
    : parts.body;
  const body = prepareMarkdown(footnoteBody, options);
  const renderedBody = md.render(body, options);

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
  let inFence = false;
  let inFrontMatter = false;

  markdown.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (index === 0 && trimmed === "---") {
      inFrontMatter = true;
      return;
    }
    if (inFrontMatter) {
      if (trimmed === "---") inFrontMatter = false;
      return;
    }
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) return;

    const title = stripInlineMarkdown(match[2]);
    const baseId = slugifyHeading(title);
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    items.push({
      id: count === 0 ? baseId : `${baseId}-${count}`,
      title,
      level: match[1].length,
      line: index + 1,
    });
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

function prepareMarkdown(source: string, options: RenderOptions): string {
  let next = source;
  if (options.settings.extensions.alerts) {
    next = renderAlerts(next, options);
  }
  if (options.settings.extensions.toc) {
    next = next.replace(/^\[TOC]\s*$/gim, renderToc(options.outline ?? []));
  }
  if (options.settings.extensions.emoji) {
    next = next.replace(/:([a-z0-9_+-]+):/gi, (match, code: string) => emojiMap[code] ?? match);
  }
  if (options.settings.extensions.mermaid) {
    next = next.replace(
      /^\s*\{\{<\s*mermaid(?:\s+[^>]*)?>\}\}\s*\r?\n([\s\S]*?)^\s*\{\{<\s*\/mermaid\s*>\}\}\s*$/gim,
      (_match, diagram: string) => `\n\`\`\`mermaid\n${diagram.trim()}\n\`\`\`\n`,
    );
  }
  if (!options.settings.extensions.html) {
    next = escapeHtml(next);
  }
  return next;
}

function renderAlerts(source: string, options: RenderOptions): string {
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

    const html = md.render(body.join("\n"), options);
    rendered.push(
      `<div class="md-alert md-alert-${kind}"><p class="md-alert-title">${alertLabels[kind]}</p>${html}</div>`,
    );
  }

  return rendered.join("\n");
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
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
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
    .filter((id) => !new RegExp(`^\\[\\^${escapeRegExp(id)}]:`, "m").test(source))
    .map((id) => findFootnoteDefinition(documentSource, id))
    .filter(Boolean);

  if (definitions.length === 0) {
    return source;
  }

  return `${source.trimEnd()}\n\n${definitions.join("\n\n")}`;
}

function findFootnoteDefinition(source: string, id: string): string {
  const lines = source.split(/\r?\n/);
  const startPattern = new RegExp(`^\\[\\^${escapeRegExp(id)}]:`);
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start < 0) return "";

  const collected = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") {
      collected.push(line);
      continue;
    }
    if (/^( {2,}|\t)/.test(line)) {
      collected.push(line);
      continue;
    }
    break;
  }

  return collected.join("\n").trimEnd();
}

function isFootnoteDefinitionBlock(source: string): boolean {
  return /^\s*\[\^[^\]]+]:/.test(source);
}

function resolveAssetSource(source: string, options: RenderOptions): string {
  if (/^(https?:|data:|blob:|#|mailto:)/i.test(source)) {
    return source;
  }

  const resolved = resolvePathLike(source, options.basePath);
  return options.assetResolver?.(resolved) ?? resolved;
}

function resolvePathLike(source: string, basePath?: string): string {
  if (!basePath || isAbsolutePath(source)) {
    return source;
  }

  const normalizedBase = basePath.replace(/\\/g, "/");
  const baseDir = normalizedBase.includes("/")
    ? normalizedBase.slice(0, normalizedBase.lastIndexOf("/"))
    : "";
  const stack = `${baseDir}/${source}`.split("/");
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
  return /^[A-Za-z]:[\\/]/.test(source) || source.startsWith("/");
}

function getFenceLanguage(info: string): string {
  return info.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_~=#]/g, "")
    .trim();
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

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, "&#10;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

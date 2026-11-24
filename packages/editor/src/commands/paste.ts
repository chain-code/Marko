// 粘贴（C-3、C-4）：HTML 转 Markdown（列表、表格、代码、链接、图片、强调……按 Typora 的粘贴结果）、
// 制表符分隔的文字转成表格、选中文字时粘贴网址变成链接。
// 代码移植自旧版 src/utils/editorCommands.ts（test/behavior/C.md 的基准，逐字节一致）。
// 没换成 Turndown：它的默认规则和这 60 多条规格对不上，换的话要重写大部分规则
/* eslint-disable */

export interface TextState {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface TextEditResult extends TextState {}

export interface PasteMarkdownPayload {
  text?: string;
  html?: string;
}

interface PastedInlineSemanticStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mark?: boolean;
  underline?: boolean;
  sub?: boolean;
  sup?: boolean;
}

interface PastedDefinitionListEntry {
  term: string;
  definitions: string[];
}

export function normalizeSelection(state: TextState): TextState {
  const selectionStart = Math.max(0, Math.min(state.selectionStart, state.selectionEnd));
  const selectionEnd = Math.max(0, Math.max(state.selectionStart, state.selectionEnd));
  return {
    value: state.value,
    selectionStart,
    selectionEnd,
  };
}

export function insertMarkdownAtSelection(state: TextState, text: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const normalizedText = normalizeGeneratedLineBreaks(text, getPreferredLineBreak(normalized.value));
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${normalizedText}${normalized.value.slice(normalized.selectionEnd)}`;
  const cursor = normalized.selectionStart + normalizedText.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function pastePlainMarkdownText(state: TextState, text: string): TextEditResult {
  return insertMarkdownAtSelection(state, text);
}

function insertMarkdownBlockAtSelection(state: TextState, block: string): TextEditResult {
  const normalized = normalizeSelection(state);
  const lineBreak = getPreferredLineBreak(normalized.value);
  const before = normalized.value.slice(0, normalized.selectionStart);
  const after = normalized.value.slice(normalized.selectionEnd);
  const normalizedBlock = normalizeGeneratedLineBreaks(block, lineBreak);
  const leadingBreak = before && !before.endsWith("\n") ? lineBreak : "";
  const trailingBreak = after && !startsWithLineBreak(after) ? lineBreak : "";
  const value = `${before}${leadingBreak}${normalizedBlock}${trailingBreak}${after}`;
  const cursor = before.length + leadingBreak.length + normalizedBlock.length;
  return { value, selectionStart: cursor, selectionEnd: cursor };
}

export function pasteMarkdownContent(state: TextState, payload: PasteMarkdownPayload): TextEditResult | null {
  const normalized = normalizeSelection(state);
  if (
    payload.text
    && normalized.selectionStart !== normalized.selectionEnd
    && isLikelyUrl(payload.text.trim())
  ) {
    const linkedSelection = pasteMarkdownText(normalized, payload.text);
    if (linkedSelection) return linkedSelection;
  }

  const richMarkdown = payload.html ? buildMarkdownFromHtml(payload.html) : null;
  if (richMarkdown) {
    return payload.html && isInlineRichHtmlForMarkdown(payload.html)
      ? insertMarkdownAtSelection(normalized, richMarkdown)
      : insertMarkdownBlockAtSelection(normalized, richMarkdown);
  }

  const table = payload.html ? buildMarkdownTableFromHtml(payload.html) : null;
  if (table) {
    return insertMarkdownBlockAtSelection(normalized, table);
  }

  return payload.text ? pasteMarkdownText(normalized, payload.text) : null;
}

export function pasteMarkdownText(state: TextState, text: string): TextEditResult | null {
  const normalized = normalizeSelection(state);
  const table = buildMarkdownTableFromTabularText(text);
  if (table) {
    return insertMarkdownBlockAtSelection(normalized, table);
  }

  const selected = normalized.value.slice(normalized.selectionStart, normalized.selectionEnd);
  const pasted = text.trim();
  if (!selected || !isLikelyUrl(pasted)) return null;

  if (isLikelyUrl(selected.trim())) {
    const value = `${normalized.value.slice(0, normalized.selectionStart)}${pasted}${normalized.value.slice(normalized.selectionEnd)}`;
    return {
      value,
      selectionStart: normalized.selectionStart,
      selectionEnd: normalized.selectionStart + pasted.length,
    };
  }

  const automaticLink = selected.match(/^<([^>\s]+)>$/);
  if (automaticLink && isLikelyUrl(automaticLink[1])) {
    const link = `<${pasted}>`;
    const value = `${normalized.value.slice(0, normalized.selectionStart)}${link}${normalized.value.slice(normalized.selectionEnd)}`;
    return {
      value,
      selectionStart: normalized.selectionStart,
      selectionEnd: normalized.selectionStart + link.length,
    };
  }

  const existingLink = findSelectedMarkdownLink(normalized, selected);
  if (existingLink) {
    const link = `[${existingLink.label}](${formatMarkdownLinkDestination(pasted)})`;
    const value = `${normalized.value.slice(0, existingLink.start)}${link}${normalized.value.slice(existingLink.end)}`;
    return {
      value,
      selectionStart: existingLink.start,
      selectionEnd: existingLink.start + link.length,
    };
  }

  const link = `[${selected}](${formatMarkdownLinkDestination(pasted)})`;
  const value = `${normalized.value.slice(0, normalized.selectionStart)}${link}${normalized.value.slice(normalized.selectionEnd)}`;
  return {
    value,
    selectionStart: normalized.selectionStart,
    selectionEnd: normalized.selectionStart + link.length,
  };
}

function findSelectedMarkdownLink(state: TextState, selected: string): { start: number; end: number; label: string } | null {
  let cursor = 0;
  while (cursor < state.value.length) {
    const open = state.value.indexOf("[", cursor);
    if (open < 0) break;
    const link = readMarkdownInlineLink(state.value, open) ?? readMarkdownReferenceLink(state.value, open);
    if (!link) {
      cursor = open + 1;
      continue;
    }

    if (
      (state.selectionStart === link.start && state.selectionEnd === link.end)
      || (link.imageStart !== null && state.selectionStart === link.imageStart && state.selectionEnd === link.end)
      || (state.selectionStart === link.labelStart && state.selectionEnd === link.labelEnd)
    ) {
      return { start: link.start, end: link.end, label: link.label };
    }
    cursor = link.end;
  }

  return null;
}

export interface TableRowFormat {
  leadingPipe: boolean;
  trailingPipe: boolean;
}

export function buildTableRow(cells: string[], format: TableRowFormat = { leadingPipe: true, trailingPipe: true }): string {
  const tableSafeFormat = cells.length <= 1 && !format.leadingPipe && !format.trailingPipe
    ? { leadingPipe: false, trailingPipe: true }
    : format;
  const body = cells.join(" | ");
  if (tableSafeFormat.leadingPipe && tableSafeFormat.trailingPipe) return `| ${body} |`;
  if (tableSafeFormat.leadingPipe) return `| ${body}`;
  if (tableSafeFormat.trailingPipe) return `${body} |`;
  return body;
}

function buildMarkdownTableFromTabularText(text: string): string | null {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const delimiter = getPastedTableDelimiter(normalized);
  if (!delimiter) return null;

  const rows = parseDelimitedTableRows(normalized, delimiter)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => row.map(normalizePastedTableCell));
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || columnCount < 2) return null;

  const paddedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: columnCount - row.length }, () => ""),
  ]);
  const header = paddedRows[0];
  const body = paddedRows.slice(1);
  return [
    buildTableRow(header),
    buildTableRow(Array.from({ length: columnCount }, () => "---")),
    ...body.map((row) => buildTableRow(row)),
  ].join("\n");
}

function getPastedTableDelimiter(text: string): "\t" | "," | null {
  if (text.includes("\t")) return "\t";
  if (!text.includes(",") || !text.includes("\n")) return null;

  const rows = parseDelimitedTableRows(text, ",").filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return null;
  return rows.every((row) => row.length >= 2) ? "," : null;
}

function parseDelimitedTableRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuote = false;
  let atCellStart = true;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuote) {
      if (char === "\"") {
        if (text[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          inQuote = false;
          atCellStart = false;
        }
        continue;
      }
      cell += char;
      continue;
    }

    if (atCellStart && char === "\"") {
      inQuote = true;
      atCellStart = false;
      continue;
    }

    if (char === delimiter) {
      row.push(cell);
      cell = "";
      atCellStart = true;
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      atCellStart = true;
      continue;
    }

    cell += char;
    if (!/\s/.test(char)) {
      atCellStart = false;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function buildMarkdownFromHtml(html: string): string | null {
  if (!isRichHtmlForMarkdown(html)) return null;
  const fragment = extractHtmlFragment(html);
  const domMarkdown = buildMarkdownFromDom(fragment);
  const markdown = domMarkdown || buildMarkdownFromHtmlFallback(fragment);
  const normalized = normalizePastedMarkdownBlock(markdown ?? "");
  return normalized || null;
}

function isRichHtmlForMarkdown(html: string): boolean {
  return /<(h[1-6]|p|div|br|a|strong|b|em|i|ul|ol|li|dl|dt|dd|blockquote|pre|code|kbd|samp|var|img|figure|figcaption|hr|table|del|s|strike|mark|u|ins|sub|sup|span|font)\b/i.test(html);
}

function isInlineRichHtmlForMarkdown(html: string): boolean {
  const fragment = extractHtmlFragment(html);
  return !/<(?:address|article|aside|blockquote|body|div|dl|dt|dd|figure|figcaption|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|ul)\b/i.test(fragment);
}

function extractHtmlFragment(html: string): string {
  const fragment = html.match(/<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/i);
  if (fragment) return fragment[1];
  return html;
}

function buildMarkdownFromDom(html: string): string | null {
  const Parser = (globalThis as {
    DOMParser?: new () => { parseFromString(source: string, type: string): any };
  }).DOMParser;
  if (!Parser) return null;

  const document = new Parser().parseFromString(html, "text/html");
  const root = document.body ?? document;
  return renderDomBlockChildren(root);
}

/** 行内的元素：连着的几个（和它们之间的文字）合成一段（旧版在 Node 里测试，没有 DOM，走的是正则那一路，没发现） */
const INLINE_TAGS = new Set(["a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "del", "dfn", "em", "font", "i", "img", "ins", "kbd", "mark", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "u", "var", "wbr"]);

function isDomInline(node: any): boolean {
  if (node.nodeType === 3) return true;
  return node.nodeType === 1 && INLINE_TAGS.has(String(node.tagName ?? "").toLowerCase());
}

function renderDomBlockChildren(node: any): string {
  const blocks: string[] = [];
  let inline: any[] = [];
  const flush = () => {
    if (!inline.length) return;
    const text = normalizeInlineMarkdown(inline.map((child) => (child.nodeType === 3 ? String(child.textContent ?? "") : renderDomInline(child))).join(""));
    if (text) blocks.push(text);
    inline = [];
  };
  for (const child of Array.from(node.childNodes ?? []) as any[]) {
    if (isDomInline(child)) {
      inline.push(child);
      continue;
    }
    flush();
    const block = renderDomBlock(child, 0);
    if (block) blocks.push(block);
  }
  flush();
  return normalizePastedMarkdownBlock(blocks.join("\n\n"));
}

function renderDomBlock(node: any, depth: number): string {
  if (node.nodeType === 3) {
    return normalizeInlineMarkdown(String(node.textContent ?? ""));
  }
  if (node.nodeType !== 1) return "";

  const tag = String(node.tagName ?? "").toLowerCase();
  if (["script", "style", "meta", "link", "title"].includes(tag)) return "";

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    const text = normalizeInlineMarkdown(renderDomInlineChildren(node));
    return text ? `${"#".repeat(level)} ${text}` : "";
  }

  if (tag === "ul" || tag === "ol") {
    return renderDomList(node, tag === "ol", depth);
  }

  if (tag === "dl") {
    return renderDomDefinitionList(node, depth);
  }

  if (tag === "blockquote") {
    return prefixMarkdownQuote(renderDomBlockChildren(node));
  }

  if (tag === "pre") {
    return renderCodeFence(getDomCodeText(node), getDomCodeLanguage(node));
  }

  if (tag === "hr") {
    return "---";
  }

  if (tag === "table") {
    return buildMarkdownTableFromParsedRows(parseDomTableElement(node)) ?? "";
  }

  if (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "figure" || tag === "figcaption" || tag === "main" || tag === "body" || tag === "dt" || tag === "dd") {
    return renderDomBlockChildrenOrInline(node, depth);
  }

  if (tag === "br") {
    return "";
  }

  return normalizeInlineMarkdown(renderDomInline(node));
}

function renderDomBlockChildrenOrInline(node: any, depth: number): string {
  const children = Array.from(node.childNodes ?? []) as any[];
  const hasBlockChild = children.some((child) => (
    child.nodeType === 1
    && isPastedHtmlBlockTag(String(child.tagName ?? ""))
  ));
  if (hasBlockChild) {
    return normalizePastedMarkdownBlock(
      children
        .map((child) => renderDomBlock(child, depth))
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  return normalizeInlineMarkdownPreservingBreaks(renderDomInlineChildren(node));
}

function isPastedHtmlBlockTag(tag: string): boolean {
  return /^(h[1-6]|ul|ol|dl|dt|dd|blockquote|pre|hr|table|p|div|section|article|figure|figcaption)$/i.test(tag);
}

function renderDomList(list: any, ordered: boolean, depth: number): string {
  const items = (Array.from(list.children ?? []) as any[])
    .filter((child) => String(child.tagName ?? "").toLowerCase() === "li");
  const reversed = ordered && isDomReversedList(list);
  let number = getPositiveHtmlInteger(list.getAttribute?.("start")) ?? (reversed ? items.length : 1);

  return items
    .map((item) => {
      if (ordered) {
        number = getPositiveHtmlInteger(item.getAttribute?.("value")) ?? number;
      }
      const marker = ordered ? `${number}.` : "-";
      if (ordered) number += reversed ? -1 : 1;
      return renderDomListItem(item, marker, depth);
    })
    .filter(Boolean)
    .join("\n");
}

function renderDomListItem(item: any, marker: string, depth: number): string {
  const nested: string[] = [];
  const inlineParts: string[] = [];
  const contentBlocks: string[] = [];
  const nestedCheckbox = item.querySelector?.("input[type='checkbox']");
  let taskMarker = nestedCheckbox
    ? (isDomCheckedInput(nestedCheckbox) ? "[x] " : "[ ] ")
    : "";
  const flushInlineParts = () => {
    const content = normalizeInlineMarkdown(inlineParts.join(""));
    inlineParts.length = 0;
    if (content) contentBlocks.push(content);
  };

  for (const child of Array.from(item.childNodes ?? []) as any[]) {
    const tag = child.nodeType === 1 ? String(child.tagName ?? "").toLowerCase() : "";
    if (!taskMarker && isDomCheckboxInput(child)) {
      taskMarker = isDomCheckedInput(child) ? "[x] " : "[ ] ";
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      flushInlineParts();
      nested.push(renderDomList(child, tag === "ol", depth + 1));
      continue;
    }
    if (["p", "div"].includes(tag)) {
      flushInlineParts();
      const content = renderDomBlockChildrenOrInline(child, depth);
      if (content) contentBlocks.push(content);
      continue;
    }
    if (isPastedHtmlBlockTag(tag)) {
      flushInlineParts();
      const content = renderDomBlock(child, depth);
      if (content) contentBlocks.push(content);
      continue;
    }
    inlineParts.push(renderDomInline(child));
  }
  flushInlineParts();

  return renderMarkdownListItem(marker, taskMarker, contentBlocks, nested, depth);
}

function renderMarkdownListItem(
  marker: string,
  taskMarker: string,
  contentBlocks: string[],
  nested: string[],
  depth: number,
): string {
  const prefix = `${"  ".repeat(depth)}${marker} ${taskMarker}`;
  const continuationIndent = " ".repeat(prefix.length);
  const blocks = contentBlocks.map(normalizePastedMarkdownBlock).filter(Boolean);
  const firstBlock = blocks[0] ?? "";
  const firstLines = firstBlock.split("\n");
  const head = firstBlock
    ? [
      `${prefix}${firstLines[0]}`.trimEnd(),
      ...firstLines.slice(1).map((line) => `${continuationIndent}${line}`.trimEnd()),
    ].join("\n")
    : prefix.trimEnd();

  return [
    head,
    ...blocks.slice(1).map((block) => `\n${indentPastedMarkdownBlock(block, continuationIndent)}`),
    ...nested.filter(Boolean),
  ]
    .filter(Boolean)
    .join("\n");
}

function renderDomDefinitionList(list: any, depth: number): string {
  const entries: PastedDefinitionListEntry[] = [];
  let active: PastedDefinitionListEntry | null = null;

  for (const child of Array.from(list.children ?? list.childNodes ?? []) as any[]) {
    const tag = child.nodeType === 1 ? String(child.tagName ?? "").toLowerCase() : "";
    if (tag === "dt") {
      const term = renderDomBlockChildrenOrInline(child, depth);
      active = { term, definitions: [] };
      entries.push(active);
      continue;
    }

    if (tag === "dd") {
      const definition = renderDomBlockChildrenOrInline(child, depth + 1);
      if (!active) {
        active = { term: "", definitions: [] };
        entries.push(active);
      }
      if (definition) active.definitions.push(definition);
    }
  }

  return renderDefinitionListEntries(entries, depth);
}

function renderDefinitionListEntries(entries: PastedDefinitionListEntry[], depth: number): string {
  return entries
    .map((entry) => {
      const term = normalizePastedMarkdownBlock(entry.term);
      const definitions = entry.definitions
        .map((definition) => normalizePastedMarkdownBlock(definition))
        .filter(Boolean);

      if (!term) {
        return definitions
          .map((definition) => renderMarkdownListItem("-", "", [definition], [], depth + 1))
          .join("\n");
      }

      return [
        renderDefinitionListTerm(term, depth),
        ...definitions.map((definition) => renderDefinitionListDefinition(definition, depth)),
      ].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n");
}

function renderDefinitionListTerm(term: string, depth: number): string {
  const indent = "  ".repeat(depth);
  return term
    .split("\n")
    .map((line) => `${indent}${line}`.trimEnd())
    .join("\n");
}

function renderDefinitionListDefinition(definition: string, depth: number): string {
  const indent = "  ".repeat(depth);
  const lines = definition.split("\n");
  const firstLine = lines[0] ?? "";
  const continuationIndent = `${indent}    `;

  return [
    `${indent}: ${firstLine}`.trimEnd(),
    ...lines.slice(1).map((line) => (line ? `${continuationIndent}${line}`.trimEnd() : "")),
  ].join("\n");
}

function indentPastedMarkdownBlock(block: string, indent: string): string {
  return block
    .split("\n")
    .map((line) => (line ? `${indent}${line}` : line))
    .join("\n");
}

function renderDomInlineChildren(node: any): string {
  return (Array.from(node.childNodes ?? []) as any[])
    .map((child) => renderDomInline(child))
    .join("");
}

function applyPastedInlineStyles(
  markdown: string,
  style: string,
  semantic: PastedInlineSemanticStyle = {},
): string {
  const normalizedStyle = style.trim();
  if (!normalizedStyle) return markdown;

  let next = markdown;
  if (!semantic.bold && isBoldCssStyle(normalizedStyle)) next = `**${next}**`;
  if (!semantic.italic && hasCssKeyword(normalizedStyle, "font-style", ["italic", "oblique"])) next = `*${next}*`;
  if (!semantic.strike && hasCssDecoration(normalizedStyle, "line-through")) next = `~~${next}~~`;
  if (!semantic.underline && hasCssDecoration(normalizedStyle, "underline")) next = `<u>${next}</u>`;
  if (!semantic.mark && hasHighlightCssStyle(normalizedStyle)) next = `==${next}==`;

  const verticalAlign = getCssDeclaration(normalizedStyle, "vertical-align");
  if (!semantic.sup && /^super\b/i.test(verticalAlign)) return `^${next}^`;
  if (!semantic.sub && /^sub\b/i.test(verticalAlign)) return `~${next}~`;
  return next;
}

function isBoldCssStyle(style: string): boolean {
  const fontWeight = getCssDeclaration(style, "font-weight").toLowerCase();
  if (!fontWeight) return false;
  if (/\b(bold|bolder)\b/.test(fontWeight)) return true;
  const numeric = Number.parseInt(fontWeight, 10);
  return Number.isFinite(numeric) && numeric >= 600;
}

function hasCssDecoration(style: string, keyword: string): boolean {
  const value = style.toLowerCase();
  return !/\bnone\b/.test(value) && value.includes(keyword);
}

function hasHighlightCssStyle(style: string): boolean {
  const value = [
    getCssDeclaration(style, "background"),
    getCssDeclaration(style, "background-color"),
    getCssDeclaration(style, "mso-highlight"),
  ].join(" ").trim().toLowerCase();
  return Boolean(value) && !/\b(none|transparent|initial|inherit|unset)\b/.test(value);
}

function hasCssKeyword(style: string, property: string, keywords: string[]): boolean {
  const value = getCssDeclaration(style, property).toLowerCase();
  return keywords.some((keyword) => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(value));
}

function getCssDeclaration(style: string, property: string): string {
  const target = property.toLowerCase();
  return style
    .split(";")
    .map((part) => part.trim())
    .map((part) => {
      const separator = part.indexOf(":");
      return separator >= 0
        ? { name: part.slice(0, separator).trim().toLowerCase(), value: part.slice(separator + 1).trim() }
        : null;
    })
    .find((part) => part?.name === target)?.value ?? "";
}

function renderDomInline(node: any): string {
  if (node.nodeType === 3) {
    return normalizeHtmlText(String(node.textContent ?? ""));
  }
  if (node.nodeType !== 1) return "";

  if (node.getAttribute?.("data-marko-syntax-preview") === "true") return "";
  if (node.hasAttribute?.("data-marko-inline-source")) {
    return normalizeHtmlText(String(node.textContent ?? ""));
  }
  if (node.hasAttribute?.("data-marko-inline-markdown")) {
    return String(node.getAttribute?.("data-marko-inline-markdown") ?? "");
  }

  const tag = String(node.tagName ?? "").toLowerCase();
  if (["script", "style", "meta", "link", "title"].includes(tag)) return "";
  if (tag === "br") return "  \n";
  if (tag === "img") {
    return renderPastedMarkdownImage(
      node.getAttribute?.("src") ?? "",
      node.getAttribute?.("alt") ?? "",
      node.getAttribute?.("title") ?? "",
      node.getAttribute?.("width") ?? "",
      node.getAttribute?.("height") ?? "",
      node.getAttribute?.("style") ?? "",
    );
  }

  const content = normalizeInlineMarkdown(renderDomInlineChildren(node));
  if (!content) return "";
  const style = String(node.getAttribute?.("style") ?? "");
  const styled = (markdown: string, semantic: PastedInlineSemanticStyle = {}) => (
    applyPastedInlineStyles(markdown, style, semantic)
  );

  switch (tag) {
    case "strong":
    case "b":
      return styled(`**${content}**`, { bold: true });
    case "em":
    case "i":
      return styled(`*${content}*`, { italic: true });
    case "code":
    case "kbd":
    case "samp":
      return formatInlineCode(content);
    case "var":
      return styled(`*${content}*`, { italic: true });
    case "del":
    case "s":
    case "strike":
      return styled(`~~${content}~~`, { strike: true });
    case "mark":
      return styled(`==${content}==`, { mark: true });
    case "u":
    case "ins":
      return styled(`<u>${content}</u>`, { underline: true });
    case "sub":
      return styled(`~${content}~`, { sub: true });
    case "sup":
      return styled(`^${content}^`, { sup: true });
    case "a": {
      const href = String(node.getAttribute?.("href") ?? "").trim();
      const title = String(node.getAttribute?.("title") ?? "");
      return styled(formatPastedMarkdownLink(content, href, title));
    }
    default:
      return styled(content);
  }
}

function parseDomTableElement(table: any): ParsedTableRow[] {
  return expandSpannedTableRows(
    (Array.from(table.querySelectorAll?.("tr") ?? []) as any[])
      .map((row) => parseDomTableCells(row)),
  );
}

function buildMarkdownFromHtmlFallback(html: string): string | null {
  const protectedMarkdown: string[] = [];
  const protectMarkdown = (markdown: string) => {
    const token = `@@MARKO_PASTED_MD_${protectedMarkdown.length}@@`;
    protectedMarkdown.push(markdown);
    return token;
  };
  let next = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");

  next = next.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (_match, preAttrs: string, code: string) => `\n\n${protectMarkdown(renderCodeFence(htmlToCodeText(code), getHtmlCodeLanguage(code, preAttrs)))}\n\n`);
  next = next.replace(/<table\b[\s\S]*?<\/table>/gi, (table: string) => `\n\n${protectMarkdown(buildMarkdownTableFromHtmlFallback(table) ?? htmlToPlainText(table))}\n\n`);
  next = next.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => protectMarkdown(renderPastedMarkdownImage(
    getHtmlAttribute(attrs, "src"),
    getHtmlAttribute(attrs, "alt"),
    getHtmlAttribute(attrs, "title"),
    getHtmlAttribute(attrs, "width"),
    getHtmlAttribute(attrs, "height"),
    getHtmlAttribute(attrs, "style"),
  )));
  next = next.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs: string, body: string) => {
    const label = normalizeInlineMarkdown(htmlToPlainText(convertInlineHtmlFallback(body)));
    const href = getHtmlAttribute(attrs, "href");
    const restoredLabel = restoreProtectedPastedMarkdown(label, protectedMarkdown);
    return protectMarkdown(formatPastedMarkdownLink(restoredLabel || href, href, getHtmlAttribute(attrs, "title")));
  });
  next = convertInlineHtmlFallback(next);
  next = next.replace(/<u>([\s\S]*?)<\/u>/gi, (_match, body: string) => protectMarkdown(`<u>${body}</u>`));
  next = next.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, body: string) => `\n\n${"#".repeat(Number(level))} ${normalizeInlineMarkdown(htmlToPlainText(body))}\n\n`);
  next = replaceHtmlBlockquotesFallback(next);
  next = replaceHtmlDefinitionListsFallback(next);
  next = replaceHtmlListsFallback(next);
  next = next
    .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
    .replace(/<figcaption\b[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<\/(?:p|div|section|article|figure|figcaption|main)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  return normalizePastedMarkdownBlock(decodeHtmlEntities(restoreProtectedPastedMarkdown(next, protectedMarkdown)));
}

function restoreProtectedPastedMarkdown(value: string, segments: string[]): string {
  let next = value;
  for (let pass = 0; pass <= segments.length; pass += 1) {
    const before = next;
    segments.forEach((segment, index) => {
      next = next.split(`@@MARKO_PASTED_MD_${index}@@`).join(segment);
    });
    if (next === before) break;
  }
  return next;
}

function convertInlineHtmlFallback(html: string): string {
  let next = html;
  let changed = true;
  while (changed) {
    const before = next;
    next = convertInlineHtmlFallbackPass(next);
    changed = before !== next;
  }
  return next;
}

function convertInlineHtmlFallbackPass(html: string): string {
  return html
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => `**${formatInlineHtmlFallbackBody(body)}**`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => `*${formatInlineHtmlFallbackBody(body)}*`)
    .replace(/<(code|kbd|samp)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => formatInlineCode(htmlToPlainText(body)))
    .replace(/<var\b[^>]*>([\s\S]*?)<\/var>/gi, (_match, body: string) => `*${formatInlineHtmlFallbackBody(body)}*`)
    .replace(/<(del|s|strike)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => `~~${formatInlineHtmlFallbackBody(body)}~~`)
    .replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, (_match, body: string) => `==${formatInlineHtmlFallbackBody(body)}==`)
    .replace(/<(u|ins)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, body: string) => `<u>${formatInlineHtmlFallbackBody(body)}</u>`)
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_match, body: string) => `~${formatInlineHtmlFallbackBody(body)}~`)
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_match, body: string) => `^${formatInlineHtmlFallbackBody(body)}^`)
    .replace(/<(span|font)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_match, _tag: string, attrs: string, body: string) => {
      const content = formatInlineHtmlFallbackBody(body);
      return applyPastedInlineStyles(content, getHtmlAttribute(attrs, "style"));
    });
}

function formatInlineHtmlFallbackBody(body: string): string {
  return normalizeInlineMarkdown(htmlToPlainText(convertInlineHtmlFallback(body)));
}

function replaceHtmlBlockquotesFallback(html: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < html.length) {
    const match = findNextHtmlBlockquoteStart(html, cursor);
    if (!match) {
      result += html.slice(cursor);
      break;
    }

    result += html.slice(cursor, match.index);
    const end = findMatchingHtmlBlockquoteEnd(html, match.index);
    if (!end) {
      result += match.raw;
      cursor = match.index + match.raw.length;
      continue;
    }

    const body = html.slice(match.index + match.raw.length, end.contentEnd);
    const content = buildMarkdownFromHtmlFallback(body) ?? htmlToPlainText(body);
    result += `\n\n${prefixMarkdownQuote(normalizePastedMarkdownBlock(content))}\n\n`;
    cursor = end.end;
  }

  return result;
}

function findNextHtmlBlockquoteStart(html: string, cursor: number): { index: number; raw: string } | null {
  const blockquotePattern = /<blockquote\b[^>]*>/gi;
  blockquotePattern.lastIndex = cursor;
  const match = blockquotePattern.exec(html);
  if (!match) return null;
  return { index: match.index, raw: match[0] };
}

function findMatchingHtmlBlockquoteEnd(html: string, startIndex: number): { contentEnd: number; end: number } | null {
  const tokenPattern = /<\/?blockquote\b[^>]*>/gi;
  tokenPattern.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        return { contentEnd: match.index, end: match.index + match[0].length };
      }
      continue;
    }

    depth += 1;
  }

  return null;
}

function replaceHtmlDefinitionListsFallback(html: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < html.length) {
    const match = findNextHtmlDefinitionListStart(html, cursor);
    if (!match) {
      result += html.slice(cursor);
      break;
    }

    result += html.slice(cursor, match.index);
    const end = findMatchingHtmlDefinitionListEnd(html, match.index);
    if (!end) {
      result += match.raw;
      cursor = match.index + match.raw.length;
      continue;
    }

    result += `\n\n${renderHtmlDefinitionListFallback(html.slice(match.index + match.raw.length, end.contentEnd), 0)}\n\n`;
    cursor = end.end;
  }

  return result;
}

function renderHtmlDefinitionListFallback(body: string, depth: number): string {
  return renderDefinitionListEntries(parseHtmlDefinitionListEntries(body), depth);
}

function parseHtmlDefinitionListEntries(body: string): PastedDefinitionListEntry[] {
  const entries: PastedDefinitionListEntry[] = [];
  const termPattern = /<(dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let active: PastedDefinitionListEntry | null = null;
  let match: RegExpExecArray | null;

  while ((match = termPattern.exec(body))) {
    const tag = match[1].toLowerCase();
    const content = getHtmlDefinitionContentBlocks(match[2]).join("\n\n");
    if (tag === "dt") {
      active = { term: content, definitions: [] };
      entries.push(active);
      continue;
    }

    if (!active) {
      active = { term: "", definitions: [] };
      entries.push(active);
    }
    if (content) active.definitions.push(content);
  }

  return entries;
}

function getHtmlDefinitionContentBlocks(html: string): string[] {
  const blockText = replaceHtmlListsFallback(convertInlineHtmlFallback(html))
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<(p|div|section|article)\b[^>]*>/gi, "\n\n")
    .replace(/<\/(p|div|section|article)>/gi, "\n\n")
    .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(blockText)
    .split(/\n[ \t]*\n+/)
    .map(normalizePastedMarkdownBlock)
    .filter(Boolean);
}

function findNextHtmlDefinitionListStart(html: string, cursor: number): { index: number; raw: string } | null {
  const listPattern = /<dl\b[^>]*>/gi;
  listPattern.lastIndex = cursor;
  const match = listPattern.exec(html);
  if (!match) return null;
  return { index: match.index, raw: match[0] };
}

function findMatchingHtmlDefinitionListEnd(html: string, startIndex: number): { contentEnd: number; end: number } | null {
  const tokenPattern = /<\/?dl\b[^>]*>/gi;
  tokenPattern.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        return { contentEnd: match.index, end: match.index + match[0].length };
      }
      continue;
    }

    depth += 1;
  }

  return null;
}

function replaceHtmlListsFallback(html: string): string {
  let result = "";
  let cursor = 0;

  while (cursor < html.length) {
    const match = findNextHtmlListStart(html, cursor);
    if (!match) {
      result += html.slice(cursor);
      break;
    }

    result += html.slice(cursor, match.index);
    const end = findMatchingHtmlListEnd(html, match.index);
    if (!end) {
      result += match.raw;
      cursor = match.index + match.raw.length;
      continue;
    }

    const body = html.slice(match.index + match.raw.length, end.contentEnd);
    result += `\n\n${renderHtmlListFallback(
      body,
      match.tag === "ol",
      getHtmlListStart(match.attrs),
      hasHtmlBooleanAttribute(match.attrs, "reversed"),
      0,
    )}\n\n`;
    cursor = end.end;
  }

  return result;
}

function renderHtmlListFallback(
  body: string,
  ordered: boolean,
  start: number | null = null,
  reversed = false,
  depth = 0,
): string {
  const items = parseHtmlListItems(body);
  let number = start ?? (ordered && reversed ? items.length : 1);
  return items
    .map((item) => {
      if (ordered) {
        number = getPositiveHtmlInteger(getHtmlAttribute(item.attrs, "value")) ?? number;
      }
      const marker = ordered ? `${number}.` : "-";
      if (ordered) number += reversed ? -1 : 1;
      return renderHtmlListItemFallback(item.body, marker, depth);
    })
    .filter(Boolean)
    .join("\n");
}

function renderHtmlListItemFallback(body: string, marker: string, depth: number): string {
  const extracted = extractNestedHtmlListsFallback(body, depth + 1);
  const task = extractHtmlTaskMarker(extracted.content);
  const contentBlocks = getHtmlListItemContentBlocks(task.html);
  return renderMarkdownListItem(marker, task.marker, contentBlocks, extracted.lists, depth);
}

function extractHtmlTaskMarker(html: string): { html: string; marker: string } {
  const checkbox = html.match(/<input\b([^>]*)>/i);
  if (!checkbox || !/\btype\s*=\s*("checkbox"|'checkbox'|checkbox)/i.test(checkbox[1])) {
    return { html, marker: "" };
  }

  const marker = /\bchecked(?:\s*=\s*(?:"checked"|'checked'|checked|""|''))?\b/i.test(checkbox[1]) ? "[x] " : "[ ] ";
  const nextHtml = `${html.slice(0, checkbox.index)}${html.slice((checkbox.index ?? 0) + checkbox[0].length)}`;
  return { html: nextHtml, marker };
}

function extractNestedHtmlListsFallback(body: string, depth: number): { content: string; lists: string[] } {
  let content = "";
  const lists: string[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const match = findNextHtmlListStart(body, cursor);
    if (!match) {
      content += body.slice(cursor);
      break;
    }

    content += body.slice(cursor, match.index);
    const end = findMatchingHtmlListEnd(body, match.index);
    if (!end) {
      content += match.raw;
      cursor = match.index + match.raw.length;
      continue;
    }

    const listBody = body.slice(match.index + match.raw.length, end.contentEnd);
    lists.push(renderHtmlListFallback(
      listBody,
      match.tag === "ol",
      getHtmlListStart(match.attrs),
      hasHtmlBooleanAttribute(match.attrs, "reversed"),
      depth,
    ));
    cursor = end.end;
  }

  return { content, lists: lists.filter(Boolean) };
}

function getHtmlListItemContentBlocks(html: string): string[] {
  const blockText = html
    .replace(/<br\s*\/?>/gi, "  \n")
    .replace(/<(p|div|section|article)\b[^>]*>/gi, "\n\n")
    .replace(/<\/(p|div|section|article)>/gi, "\n\n")
    .replace(/<hr\b[^>]*>/gi, "\n\n---\n\n")
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(blockText)
    .split(/\n[ \t]*\n+/)
    .map(normalizePastedMarkdownBlock)
    .filter(Boolean);
}

function parseHtmlListItems(body: string): Array<{ attrs: string; body: string }> {
  const items: Array<{ attrs: string; body: string }> = [];
  const itemPattern = /<li\b([^>]*)>/gi;
  let cursor = 0;

  while (cursor < body.length) {
    itemPattern.lastIndex = cursor;
    const match = itemPattern.exec(body);
    if (!match) break;

    const contentStart = match.index + match[0].length;
    const end = findHtmlListItemEnd(body, contentStart);
    items.push({
      attrs: match[1] ?? "",
      body: body.slice(contentStart, end.contentEnd),
    });
    cursor = end.end;
  }

  return items;
}

function findHtmlListItemEnd(body: string, start: number): { contentEnd: number; end: number } {
  const tokenPattern = /<\/?(ul|ol|li)\b[^>]*>/gi;
  tokenPattern.lastIndex = start;
  let nestedListDepth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(body))) {
    const tag = match[1].toLowerCase();
    const closing = /^<\//.test(match[0]);
    if (tag === "ul" || tag === "ol") {
      nestedListDepth += closing ? -1 : 1;
      nestedListDepth = Math.max(0, nestedListDepth);
      continue;
    }

    if (tag === "li" && closing && nestedListDepth === 0) {
      return { contentEnd: match.index, end: match.index + match[0].length };
    }
  }

  return { contentEnd: body.length, end: body.length };
}

function findNextHtmlListStart(html: string, cursor: number): { index: number; raw: string; tag: string; attrs: string } | null {
  const listPattern = /<(ul|ol)\b([^>]*)>/gi;
  listPattern.lastIndex = cursor;
  const match = listPattern.exec(html);
  if (!match) return null;
  return {
    index: match.index,
    raw: match[0],
    tag: match[1].toLowerCase(),
    attrs: match[2] ?? "",
  };
}

function findMatchingHtmlListEnd(html: string, startIndex: number): { contentEnd: number; end: number } | null {
  const tokenPattern = /<\/?(ul|ol)\b[^>]*>/gi;
  tokenPattern.lastIndex = startIndex;
  let depth = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html))) {
    if (/^<\//.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        return { contentEnd: match.index, end: match.index + match[0].length };
      }
      continue;
    }

    depth += 1;
  }

  return null;
}

function getHtmlListStart(attrs: string): number | null {
  return getPositiveHtmlInteger(getHtmlAttribute(attrs, "start"));
}

function hasHtmlBooleanAttribute(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${escapeRegExp(name)}(?:\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+))?(?=\\s|$)`, "i").test(attrs);
}

function getPositiveHtmlInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function isDomReversedList(list: any): boolean {
  return Boolean(list.reversed || list.hasAttribute?.("reversed"));
}

function isDomCheckboxInput(node: any): boolean {
  if (node?.nodeType !== 1 || String(node.tagName ?? "").toLowerCase() !== "input") return false;
  return String(node.getAttribute?.("type") ?? node.type ?? "").toLowerCase() === "checkbox";
}

function isDomCheckedInput(node: any): boolean {
  return Boolean(node.checked || node.hasAttribute?.("checked"));
}

function getDomCodeLanguage(node: any): string {
  const code = node.querySelector?.("code") ?? node;
  const attrLanguage = code.getAttribute?.("data-language") || code.getAttribute?.("lang");
  const classLanguage = getCodeLanguageFromClassName(String(code.getAttribute?.("class") ?? code.className ?? ""));
  const preLanguage = node === code
    ? ""
    : node.getAttribute?.("data-language") || node.getAttribute?.("lang") || getCodeLanguageFromClassName(String(node.getAttribute?.("class") ?? node.className ?? ""));
  return normalizePastedCodeLanguage(attrLanguage || classLanguage || preLanguage);
}

function getDomCodeText(node: any): string {
  const code = node.querySelector?.("code") ?? node;
  const html = code.innerHTML ?? node.innerHTML;
  if (html !== undefined && html !== null) return htmlToCodeText(String(html));
  return String(code.textContent ?? node.textContent ?? "");
}

function getHtmlCodeLanguage(html: string, preAttrs = ""): string {
  const code = html.match(/<code\b([^>]*)>/i);
  const attrs = code?.[1] ?? "";
  return normalizePastedCodeLanguage(
    getHtmlAttribute(attrs, "data-language")
    || getHtmlAttribute(attrs, "lang")
    || getCodeLanguageFromClassName(getHtmlAttribute(attrs, "class"))
    || getHtmlAttribute(preAttrs, "data-language")
    || getHtmlAttribute(preAttrs, "lang")
    || getCodeLanguageFromClassName(getHtmlAttribute(preAttrs, "class")),
  );
}

function getCodeLanguageFromClassName(className: string): string {
  const token = className
    .split(/\s+/)
    .find((item) => /^(?:language|lang)-[A-Za-z0-9_+.-]+$/i.test(item));
  return token?.replace(/^(?:language|lang)-/i, "") ?? "";
}

function normalizePastedCodeLanguage(language: unknown): string {
  const value = String(language ?? "").trim().replace(/^\.*/, "");
  return /^[A-Za-z0-9_+.-]+$/.test(value) ? value : "";
}

function htmlToCodeText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, ""));
}

function renderCodeFence(code: string, language = ""): string {
  const content = decodeHtmlEntities(code).replace(/^\n+|\n+$/g, "");
  const fence = getCodeFenceMarker(content);
  return `${fence}${language}\n${content}\n${fence}`;
}

function getCodeFenceMarker(content: string): string {
  const longest = content.match(/`+/g)?.reduce((length, run) => Math.max(length, run.length), 0) ?? 0;
  return "`".repeat(Math.max(3, longest + 1));
}

function renderMarkdownImage(source: string, alt: string, title: string): string {
  const src = source.trim();
  if (!src) return "";
  if (!isSafePastedImageSource(src)) return normalizeInlineMarkdown(alt);
  const titlePart = title.trim() ? ` "${title.trim().replace(/"/g, "\\\"")}"` : "";
  return `![${formatMarkdownImageAlt(alt)}](${formatMarkdownLinkDestination(src)}${titlePart})`;
}

function formatMarkdownImageAlt(alt: string): string {
  return alt
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function renderPastedMarkdownImage(
  source: string,
  alt: string,
  title: string,
  width = "",
  height = "",
  style = "",
): string {
  const src = decodeHtmlEntities(source.trim());
  if (!src) return "";
  if (!isSafePastedImageSource(src)) return normalizeInlineMarkdown(alt);

  const dimensions = getPastedImageDimensions(width, height, style);
  if (!dimensions.width && !dimensions.height) {
    return renderMarkdownImage(src, alt, title);
  }

  const attrs = [
    `src="${escapeAttribute(src)}"`,
    `alt="${escapeAttribute(alt.trim())}"`,
  ];
  if (dimensions.width) attrs.push(`width="${escapeAttribute(dimensions.width)}"`);
  if (dimensions.height) attrs.push(`height="${escapeAttribute(dimensions.height)}"`);
  if (title.trim()) attrs.push(`title="${escapeAttribute(title.trim())}"`);
  return `<img ${attrs.join(" ")}>`;
}

function getPastedImageDimensions(width: string, height: string, style: string): { width: string; height: string } {
  return {
    width: normalizePastedImageDimension(width) || normalizePastedImageDimension(getCssDeclaration(style, "width")),
    height: normalizePastedImageDimension(height) || normalizePastedImageDimension(getCssDeclaration(style, "height")),
  };
}

function normalizePastedImageDimension(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /^auto$/i.test(trimmed)) return "";
  return /^\d+(?:\.\d+)?(?:px|em|rem|%|vw|vh|vmin|vmax)?$/i.test(trimmed) ? trimmed : "";
}

function formatPastedMarkdownLink(label: string, href: string, title = ""): string {
  const text = label.trim();
  const destination = href.trim();
  if (!destination || getPreviewLinkAction(destination) === "blocked") return text;
  if (isPastedHtmlImageMarkup(text)) {
    return renderPastedHtmlImageLink(text, destination, title);
  }
  const linkLabel = text || destination;
  const formattedLabel = isPastedMarkdownImageMarkup(linkLabel)
    ? linkLabel
    : formatMarkdownLinkLabel(linkLabel);
  return `[${formattedLabel}](${formatMarkdownLinkDestination(destination)}${formatMarkdownLinkTitle(title)})`;
}

function isPastedHtmlImageMarkup(value: string): boolean {
  return /^<img\b[^>]*>$/i.test(value.trim());
}

function isPastedMarkdownImageMarkup(value: string): boolean {
  const trimmed = value.trim();
  const link = readMarkdownInlineLink(trimmed, 1);
  return Boolean(link && link.imageStart === 0 && link.end === trimmed.length);
}

function renderPastedHtmlImageLink(image: string, href: string, title: string): string {
  const attrs = [`href="${escapeAttribute(decodeHtmlEntities(href.trim()))}"`];
  if (title.trim()) attrs.push(`title="${escapeAttribute(title.trim())}"`);
  return `<a ${attrs.join(" ")}>${image.trim()}</a>`;
}

function formatMarkdownLinkLabel(label: string): string {
  return label
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function formatMarkdownLinkTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "";
  return ` "${trimmed.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function isSafePastedImageSource(source: string): boolean {
  const decoded = decodeHtmlEntities(source.trim());
  if (!decoded) return false;
  if (/^data:/i.test(decoded)) return /^data:image\//i.test(decoded);
  return getPreviewLinkAction(decoded) !== "blocked";
}

function prefixMarkdownQuote(markdown: string): string {
  return normalizePastedMarkdownBlock(markdown)
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function formatInlineCode(value: string): string {
  const code = value.replace(/\s+/g, " ").trim();
  return code.includes("`") ? `\`\` ${code} \`\`` : `\`${code}\``;
}

function formatMarkdownLinkDestination(value: string): string {
  const decoded = decodeHtmlEntities(value.trim());
  return /[\s()]/.test(decoded) ? `<${decoded.replace(/>/g, "%3E")}>` : decoded;
}

function normalizeHtmlText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ");
}

function normalizeInlineMarkdown(value: string): string {
  return value.replace(/[ \t\r\n]+/g, " ").trim();
}

function normalizeInlineMarkdownPreservingBreaks(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeInlineMarkdown(line))
    .join("  \n")
    .trim();
}

function normalizePastedMarkdownBlock(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(trimPastedLineEnd)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimPastedLineEnd(line: string): string {
  return line.endsWith("  ") ? `${line.trimEnd()}  ` : line.replace(/[ \t]+$/g, "");
}

function getHtmlAttribute(attrs: string, name: string): string {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, "i");
  const match = attrs.match(pattern);
  if (!match) return "";
  return decodeHtmlEntities(match[1].replace(/^["']|["']$/g, ""));
}

function buildMarkdownTableFromHtml(html: string): string | null {
  if (!/<table[\s>]/i.test(html)) return null;
  return buildMarkdownTableFromDom(html) ?? buildMarkdownTableFromHtmlFallback(html);
}

function buildMarkdownTableFromDom(html: string): string | null {
  const Parser = (globalThis as {
    DOMParser?: new () => { parseFromString(source: string, type: string): any };
  }).DOMParser;
  if (!Parser) return null;

  const document = new Parser().parseFromString(html, "text/html");
  const table = document.querySelector?.("table");
  if (!table) return null;

  const rows = Array.from(table.querySelectorAll?.("tr") ?? []) as any[];
  const parsed = expandSpannedTableRows(rows.map((row) => parseDomTableCells(row)));
  return buildMarkdownTableFromParsedRows(parsed);
}

function buildMarkdownTableFromHtmlFallback(html: string): string | null {
  const table = html.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  if (!table) return null;

  return buildMarkdownTableFromParsedRows(expandSpannedTableRows(
    Array.from(table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi), (match) => parseHtmlTableCells(match[1])),
  ));
}

type TableAlignment = "" | "left" | "center" | "right";

interface ParsedTableRow {
  cells: string[];
  alignments: TableAlignment[];
}

interface ParsedTableCell {
  text: string;
  alignment: TableAlignment;
  colspan: number;
  rowspan: number;
}

function parseDomTableCells(row: any): ParsedTableCell[] {
  const cells: ParsedTableCell[] = [];
  for (const cell of Array.from(row.querySelectorAll?.("th,td") ?? []) as any[]) {
    cells.push({
      text: getDomTableCellText(cell),
      alignment: getDomTableCellAlignment(cell),
      colspan: getTableCellSpan(cell.getAttribute?.("colspan") ?? cell.colSpan),
      rowspan: getTableCellSpan(cell.getAttribute?.("rowspan") ?? cell.rowSpan),
    });
  }
  return cells;
}

function getDomTableCellText(cell: any): string {
  const html = cell.innerHTML;
  const text = html === undefined || html === null
    ? String(cell.textContent ?? "")
    : htmlToPlainText(String(html));
  return normalizePastedTableCell(text);
}

function parseHtmlTableCells(rowHtml: string): ParsedTableCell[] {
  const cells: ParsedTableCell[] = [];
  const cellPattern = /<t([hd])\b([^>]*)>([\s\S]*?)<\/t\1>/gi;
  let cellMatch: RegExpExecArray | null;
  while ((cellMatch = cellPattern.exec(rowHtml))) {
    const attrs = cellMatch[2];
    cells.push({
      text: normalizePastedTableCell(htmlToPlainText(cellMatch[3])),
      alignment: getHtmlTableCellAlignment(attrs),
      colspan: getTableCellSpan(attrs.match(/\bcolspan\s*=\s*["']?(\d+)/i)?.[1]),
      rowspan: getTableCellSpan(attrs.match(/\browspan\s*=\s*["']?(\d+)/i)?.[1]),
    });
  }
  return cells;
}

function expandSpannedTableRows(rows: ParsedTableCell[][]): ParsedTableRow[] {
  const expanded: ParsedTableRow[] = [];
  const rowspans: Array<{ remaining: number; alignment: TableAlignment } | undefined> = [];

  for (const row of rows) {
    const cells: string[] = [];
    const alignments: TableAlignment[] = [];
    let column = 0;

    const consumeRowspans = () => {
      while (rowspans[column]?.remaining) {
        const span = rowspans[column];
        cells.push("");
        alignments.push(span?.alignment ?? "");
        if (span) {
          span.remaining -= 1;
          if (span.remaining <= 0) rowspans[column] = undefined;
        }
        column += 1;
      }
    };

    for (const cell of row) {
      consumeRowspans();
      const colspan = Math.max(1, cell.colspan);
      for (let offset = 0; offset < colspan; offset += 1) {
        cells.push(offset === 0 ? cell.text : "");
        alignments.push(offset === 0 ? cell.alignment : "");
        if (cell.rowspan > 1) {
          rowspans[column + offset] = {
            remaining: cell.rowspan - 1,
            alignment: offset === 0 ? cell.alignment : "",
          };
        }
      }
      column += colspan;
    }
    consumeRowspans();
    if (cells.length > 0) expanded.push({ cells, alignments });
  }

  return expanded;
}

function buildMarkdownTableFromParsedRows(rows: ParsedTableRow[]): string | null {
  const columnCount = Math.max(0, ...rows.map((row) => row.cells.length));
  if (rows.length === 0 || columnCount < 1) return null;

  const paddedRows = rows.map((row) => ({
    cells: [
      ...row.cells,
      ...Array.from({ length: columnCount - row.cells.length }, () => ""),
    ],
    alignments: [
      ...row.alignments,
      ...Array.from({ length: columnCount - row.alignments.length }, () => "" as TableAlignment),
    ],
  }));
  const alignments = Array.from({ length: columnCount }, (_item, index) => (
    paddedRows.find((row) => row.alignments[index])?.alignments[index] ?? ""
  ));

  return [
    buildTableRow(paddedRows[0].cells),
    buildTableRow(alignments.map(formatTableSeparatorCell)),
    ...paddedRows.slice(1).map((row) => buildTableRow(row.cells)),
  ].join("\n");
}

function getTableCellSpan(value: unknown): number {
  const span = Number(value);
  return Number.isFinite(span) && span > 1 ? Math.floor(span) : 1;
}

function getDomTableCellAlignment(cell: any): TableAlignment {
  const attr = cell.getAttribute?.("align");
  const style = cell.getAttribute?.("style");
  const textAlign = cell.style?.textAlign;
  return normalizeTableAlignment(String(attr || textAlign || style || ""));
}

function getHtmlTableCellAlignment(attrs: string): TableAlignment {
  const align = attrs.match(/\balign\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "";
  const styleAlign = attrs.match(/text-align\s*:\s*([^;"']+)/i)?.[1] ?? "";
  return normalizeTableAlignment(align || styleAlign);
}

function normalizeTableAlignment(value: string): TableAlignment {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("center")) return "center";
  if (normalized.includes("right")) return "right";
  if (normalized.includes("left")) return "left";
  return "";
}

function formatTableSeparatorCell(alignment: TableAlignment): string {
  switch (alignment) {
    case "left":
      return ":---";
    case "center":
      return ":---:";
    case "right":
      return "---:";
    default:
      return "---";
  }
}

function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|li|tr)>/gi, " ")
    .replace(/<[^>]+>/g, ""));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizePastedTableCell(value: string): string {
  return value
    .trim()
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ");
}

function getPreferredLineBreak(value: string): "\n" | "\r\n" {
  return value.includes("\r\n") ? "\r\n" : "\n";
}

function startsWithLineBreak(value: string): boolean {
  return value.startsWith("\n") || value.startsWith("\r");
}

function normalizeGeneratedLineBreaks(value: string, lineBreak: "\n" | "\r\n"): string {
  return value.replace(/\r\n|\r|\n/g, lineBreak);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isLikelyUrl(value: string): boolean {
  const action = getPreviewLinkAction(value);
  if (action === "external") return !/[\s<>]/.test(value);
  if (action === "local") return !/[\r\n<>]/.test(value);
  return false;
}



export type PreviewLinkAction = "none" | "anchor" | "relative" | "local" | "external" | "blocked";

const blockedProtocols = new Set(["javascript:", "vbscript:", "data:"]);

export function getPreviewLinkAction(rawHref: string | null | undefined): PreviewLinkAction {
  const href = rawHref?.trim() ?? "";
  if (!href) return "none";
  if (href.startsWith("#")) return "anchor";
  if (href.startsWith("//")) return "external";
  if (isWindowsAbsoluteHref(href) || isWindowsUncHref(href)) return "local";

  const protocol = href.match(/^([a-z][a-z0-9+.-]*:)/i)?.[1].toLowerCase();
  if (!protocol) return "relative";
  if (protocol === "file:") return "local";
  if (blockedProtocols.has(protocol)) return "blocked";
  return "external";
}

function isWindowsAbsoluteHref(href: string): boolean {
  return /^[A-Za-z]:(?:[\\/]|%5[cC]|\/)/.test(href);
}

function isWindowsUncHref(href: string): boolean {
  return /^(?:\\\\|%5[cC]%5[cC])[^\\/]/.test(href);
}



export interface MarkdownLinkRange {
  start: number;
  end: number;
  labelStart: number;
  labelEnd: number;
  destinationStart: number | null;
  destinationEnd: number | null;
  referenceLabel: string | null;
  imageStart: number | null;
  label: string;
}

export function readMarkdownInlineLink(value: string, openBracket: number): MarkdownLinkRange | null {
  const closeBracket = findMarkdownLinkLabelEnd(value, openBracket + 1);
  if (closeBracket < 0 || value[closeBracket + 1] !== "(") return null;

  const end = findMarkdownLinkDestinationEnd(value, closeBracket + 2);
  if (end < 0) return null;

  return {
    start: openBracket,
    end,
    labelStart: openBracket + 1,
    labelEnd: closeBracket,
    destinationStart: closeBracket + 2,
    destinationEnd: end - 1,
    referenceLabel: null,
    imageStart: value[openBracket - 1] === "!" && !isEscapedAt(value, openBracket - 1)
      ? openBracket - 1
      : null,
    label: value.slice(openBracket + 1, closeBracket),
  };
}

export function readMarkdownReferenceLink(value: string, openBracket: number): MarkdownLinkRange | null {
  const closeBracket = findMarkdownLinkLabelEnd(value, openBracket + 1);
  if (closeBracket < 0 || value[closeBracket + 1] !== "[") return null;

  const closeReference = findMarkdownLinkLabelEnd(value, closeBracket + 2);
  if (closeReference < 0) return null;

  return {
    start: openBracket,
    end: closeReference + 1,
    labelStart: openBracket + 1,
    labelEnd: closeBracket,
    destinationStart: null,
    destinationEnd: null,
    referenceLabel: value.slice(closeBracket + 2, closeReference),
    imageStart: value[openBracket - 1] === "!" && !isEscapedAt(value, openBracket - 1)
      ? openBracket - 1
      : null,
    label: value.slice(openBracket + 1, closeBracket),
  };
}

function findMarkdownLinkLabelEnd(value: string, start: number): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (isEscapedAt(value, index)) continue;
    if (char === "[") {
      depth += 1;
      continue;
    }
    if (char === "]") {
      if (depth === 0) return index;
      depth -= 1;
    }
  }
  return -1;
}

function findMarkdownLinkDestinationEnd(value: string, start: number): number {
  let depth = 0;
  let inAngle = false;
  let quote: "\"" | "'" | null = null;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (isEscapedAt(value, index)) continue;

    if (inAngle) {
      if (char === ">") inAngle = false;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }

    if (char === "<") {
      inAngle = true;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      if (depth === 0) return index + 1;
      depth -= 1;
    }
  }

  return -1;
}

function isEscapedAt(value: string, index: number): boolean {
  let count = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    count += 1;
  }
  return count % 2 === 1;
}

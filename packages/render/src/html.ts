// 文档模型 → HTML（1.7、1.11 节）：导出、打印、复制为 HTML 共用一条管线。
// 结构和类名照 Typora 导出的 HTML（table-figure、md-alert、md-fences、md-toc、footnotes-area……），
// 这样同一份主题 CSS 在编辑区和导出里都适用，Typora 的社区主题大多也能直接用（A-3）
import {
  blockChildren,
  collectAbbreviations,
  collectFootnotes,
  collectOutline,
  collectReferences,
  findAbbreviations,
  inlineFragments,
  isBlankParagraph,
  isTextblock,
  nodeText,
  normalizeLabel,
  plainText,
  referenceChecker,
  resolveReference,
  resolveSyntax,
  unescapeMarkdown,
  walkFragments,
  type AbbreviationInfo,
  type Fragment,
  type FootnoteDefinitionInfo,
  type MdNode,
  type ReferenceDefinitionInfo,
  type SyntaxOptions,
  type TableAlign,
} from "@marko/markdown";
import { ALERT_ICONS, ALERT_TITLES } from "./alertIcons.ts";
import { emojiFor } from "./emoji.ts";
import { escapeAttribute, escapeHtml, safeUrl } from "./escape.ts";
import { highlightLines } from "./highlight.ts";
import { renderMathDocument, type MathItem, type MathNumbering, type MathResult } from "./math.ts";
import { randomHex } from "./random.ts";
import { sanitizeHtml } from "./sanitize.ts";

export interface RenderOptions {
  syntax?: Partial<SyntaxOptions>;
  /** S-8「公式自动编号」 */
  mathNumbering?: MathNumbering;
  /** 本地路径换成能加载的地址（编辑时 marko-asset://，导出时相对导出位置）；不给时原样 */
  resolveUrl?: (url: string, kind: "image" | "link") => string;
  /** 预先渲染好的图表 SVG，键是 diagramKey(种类, 源码)；没有的按代码块输出 */
  diagrams?: ReadonlyMap<string, string>;
  /** 渲染失败的图表的错误信息（D-6），键同上 */
  diagramErrors?: ReadonlyMap<string, string>;
  /** S-6「智能引号」「智能破折号与省略号」 */
  smartQuotes?: boolean;
  smartDashes?: boolean;
  /** S-6「保留单个换行」：软换行输出成 <br> */
  preserveLineBreaks?: boolean;
  /** S-7「显示行号」 */
  codeLineNumbers?: boolean;
  /** O-1「HTML（不含样式）」：代码块是语义化的 <pre><code>，不带高亮（同 Typora） */
  noStyle?: boolean;
}

export function diagramKey(kind: string, source: string): string {
  return `${kind}\n${source}`;
}

// 公式、图表的 SVG 不经过 HTML 过滤（MathJax 的 <mjx-container> 会被去掉）：先放占位，过滤以后再换回来
/** 占位：私用区字符包着每次渲染随机生成的 nonce 和序号；文档里的文字既写不出这样的占位，也猜不到 nonce */
const SLOT_OPEN = "\uE000";
const SLOT_CLOSE = "\uE001";

interface State {
  options: RenderOptions;
  syntax: SyntaxOptions;
  references: Map<string, ReferenceDefinitionInfo>;
  isDefined: (label: string) => boolean;
  abbreviations: Map<string, AbbreviationInfo>;
  footnotes: Map<string, FootnoteDefinitionInfo>;
  /** 同一个脚注第几次被引用（回链的 id） */
  footnoteOccurrences: Map<string, number>;
  headingIds: Map<MdNode, string>;
  outline: Array<{ level: number; title: string; id: string }>;
  fragments: Map<MdNode, Fragment[]>;
  math: Map<MdNode, Map<number, MathResult>>;
  slots: string[];
  /** 这次渲染的随机串（占位里带着它） */
  nonce: string;
}

function fragmentsOf(node: MdNode, state: State): Fragment[] {
  let fragments = state.fragments.get(node);
  if (!fragments) {
    fragments = inlineFragments(nodeText(node), state.options.syntax, state.isDefined);
    state.fragments.set(node, fragments);
  }
  return fragments;
}

function slot(state: State, html: string): string {
  state.slots.push(html);
  return `${SLOT_OPEN}${state.nonce}:${state.slots.length - 1}${SLOT_CLOSE}`;
}

function fillSlots(html: string, state: State): string {
  const pattern = new RegExp(`${SLOT_OPEN}${state.nonce}:(\\d+)${SLOT_CLOSE}`, "g");
  return html.replace(pattern, (_match, index: string) => state.slots[Number(index)] ?? "");
}

/** 用户的文字里不能混进占位用的字符（fillSlots 会把它们当成占位） */
function withoutSlotMarks(text: string): string {
  return text.replace(/[\uE000\uE001]/g, "\uFFFD");
}

function escapeText(text: string): string {
  return escapeHtml(withoutSlotMarks(text));
}

/** 属性值：去掉占位字符再转义 */
function attr(value: string): string {
  return escapeAttribute(withoutSlotMarks(value));
}

/** 实体原样输出；数字实体落在占位用的私用区字符上时换成 U+FFFD */
function safeEntity(entity: string): string {
  const numeric = /^&#(x[0-9a-f]+|\d+);$/i.exec(entity);
  if (!numeric) return entity;
  const code = numeric[1][0].toLowerCase() === "x" ? Number.parseInt(numeric[1].slice(1), 16) : Number.parseInt(numeric[1], 10);
  return code === 0xe000 || code === 0xe001 ? "&#xFFFD;" : entity;
}

// ---------------------------------------------------------------------------
// 公式：整篇按文档顺序一起渲染（编号、引用），再按节点和位置取用

function isMathFence(node: MdNode, state: State): boolean {
  return (
    state.syntax.math &&
    node.type === "codeBlock" &&
    !node.attrs?.indented &&
    node.attrs?.closing !== null &&
    String(node.attrs?.info ?? "").split(/\s+/)[0].toLowerCase() === "math"
  );
}

/** 文档里的公式，按文档顺序；owners 是每个公式所在的节点和在节点文字里的位置 */
function mathOccurrences(doc: MdNode, state: State): { items: MathItem[]; owners: Array<{ node: MdNode; offset: number }> } {
  const items: MathItem[] = [];
  const owners: Array<{ node: MdNode; offset: number }> = [];
  const walk = (node: MdNode) => {
    if (node.type === "mathBlock" || isMathFence(node, state)) {
      items.push({ tex: nodeText(node), display: true });
      owners.push({ node, offset: 0 });
      return;
    }
    if (isTextblock(node.type)) {
      const text = nodeText(node);
      walkFragments(fragmentsOf(node, state), (fragment) => {
        if (fragment.type !== "math" || !fragment.content) return;
        items.push({ tex: text.slice(fragment.content.from, fragment.content.to), display: false });
        owners.push({ node, offset: fragment.from });
      });
      return;
    }
    for (const child of blockChildren(node)) walk(child);
  };
  walk(doc);
  return { items, owners };
}

/** 文档里所有的公式：导出前用它把要用的字体加载好（loadMathFonts） */
export function mathItemsOf(doc: MdNode, options: RenderOptions = {}): MathItem[] {
  const state = createState(doc, options);
  return state.syntax.math ? mathOccurrences(doc, state).items : [];
}

/**
 * 文档里每个公式和它所在的块（行内公式是文本块和片段在块里的位置，公式块的位置是 0），顺序同整篇渲染（renderMathDocument）。
 * 编辑器按它把整篇渲染的结果（编号、\eqref）对到每个公式上（D-2）
 */
export function mathOccurrencesOf(doc: MdNode, options: RenderOptions = {}): Array<{ node: MdNode; offset: number; item: MathItem }> {
  const state = createState(doc, options);
  if (!state.syntax.math) return [];
  const { items, owners } = mathOccurrences(doc, state);
  return owners.map((owner, index) => ({ ...owner, item: items[index] }));
}

/** 信息串是 math、闭合了的围栏代码块（GitLab 的写法）按公式块渲染（B-7）；条件同 isMathFence */
export function isMathFenceInfo(attrs: { indented?: unknown; closing?: unknown; info?: unknown } | null | undefined): boolean {
  return !attrs?.indented && attrs?.closing !== null && String(attrs?.info ?? "").trim().split(/\s+/)[0]?.toLowerCase() === "math";
}

function collectMath(doc: MdNode, state: State): void {
  const { items, owners } = mathOccurrences(doc, state);
  const results = renderMathDocument(items, state.options.mathNumbering ?? "none");
  owners.forEach((owner, index) => {
    let byOffset = state.math.get(owner.node);
    if (!byOffset) {
      byOffset = new Map();
      state.math.set(owner.node, byOffset);
    }
    byOffset.set(owner.offset, results[index]);
  });
}

/** 公式渲染失败时显示的原因（D-6） */
function mathError(result: MathResult | undefined): string {
  if (result?.pending) return "公式用到的字体还没加载";
  return result?.error ?? "";
}

// ---------------------------------------------------------------------------
// 行内

function smartPunctuation(html: string, state: State): string {
  let result = html;
  if (state.options.smartDashes) result = result.replace(/---/g, "—").replace(/--/g, "–").replace(/\.\.\./g, "…");
  if (state.options.smartQuotes) {
    result = result
      .replace(/(^|[\s(\[{—–-])&quot;/g, "$1“")
      .replace(/&quot;/g, "”")
      .replace(/(^|[\s(\[{—–-])'/g, "$1‘")
      .replace(/'/g, "’");
  }
  return result;
}

/** 一段普通文字：缩写、转义、智能标点、软换行 */
function renderPlain(text: string, from: number, to: number, abbreviations: Array<{ from: number; to: number; title: string }>, state: State): string {
  if (from >= to) return "";
  let html = "";
  let cursor = from;
  const emit = (end: number) => {
    if (end <= cursor) return;
    let piece = smartPunctuation(escapeText(text.slice(cursor, end)), state);
    piece = piece.replace(/[ \t]*\n[ \t]*/g, state.options.preserveLineBreaks ? "<br>\n" : "\n");
    html += piece;
    cursor = end;
  };
  for (const match of abbreviations) {
    if (match.to <= from || match.from >= to) continue;
    emit(match.from);
    html += `<abbr title="${attr(match.title)}">${escapeText(text.slice(match.from, match.to))}</abbr>`;
    cursor = match.to;
  }
  emit(to);
  return html;
}

function codeSpanText(raw: string): string {
  const text = raw.replace(/\r?\n/g, " ");
  return text.length >= 2 && text.startsWith(" ") && text.endsWith(" ") && text.trim() ? text.slice(1, -1) : text;
}

/** 链接地址：去掉尖括号，解开转义和实体，本地路径交给 resolveUrl */
function linkTarget(raw: string, kind: "image" | "link", state: State): string | null {
  let url = raw.trim();
  if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
  url = unescapeMarkdown(url);
  const resolved = state.options.resolveUrl ? state.options.resolveUrl(url, kind) : url;
  return safeUrl(resolved, kind === "image" ? "image" : "link");
}

function titleOf(text: string, fragment: Fragment): string | null {
  if (!fragment.title) return null;
  return unescapeMarkdown(text.slice(fragment.title.from + 1, fragment.title.to - 1));
}

function renderFragment(text: string, fragment: Fragment, node: MdNode, abbreviations: Array<{ from: number; to: number; title: string }>, state: State): string {
  const content = fragment.content;
  const inner = () => (content ? renderInlineRange(text, content.from, content.to, fragment.children, node, abbreviations, state) : "");
  switch (fragment.type) {
    case "emphasis":
      return `<em>${inner()}</em>`;
    case "strong":
      return `<strong>${inner()}</strong>`;
    case "strikethrough":
      return `<del>${inner()}</del>`;
    case "highlight":
      return `<mark>${inner()}</mark>`;
    case "superscript":
      return `<sup>${inner()}</sup>`;
    case "subscript":
      return `<sub>${inner()}</sub>`;
    case "code":
      return `<code>${escapeText(codeSpanText(content ? text.slice(content.from, content.to) : ""))}</code>`;
    case "link": {
      let url: string | null = null;
      let title: string | null = null;
      if (fragment.url) {
        url = linkTarget(text.slice(fragment.url.from, fragment.url.to), "link", state);
        title = titleOf(text, fragment);
      } else {
        const definition = resolveReference(text, fragment, state.references);
        if (definition) {
          url = linkTarget(definition.url, "link", state);
          title = definition.title;
        }
      }
      const attributes = (url !== null ? ` href="${attr(url)}"` : "") + (title ? ` title="${attr(title)}"` : "");
      return `<a${attributes}>${inner()}</a>`;
    }
    case "image": {
      let url: string | null = null;
      let title: string | null = null;
      if (fragment.url) {
        url = linkTarget(text.slice(fragment.url.from, fragment.url.to), "image", state);
        title = titleOf(text, fragment);
      } else {
        const definition = resolveReference(text, fragment, state.references);
        if (definition) {
          url = linkTarget(definition.url, "image", state);
          title = definition.title;
        }
      }
      const alt = content ? plainText(text.slice(content.from, content.to), inlineFragments(text.slice(content.from, content.to), state.options.syntax, state.isDefined)) : "";
      return `<img${url !== null ? ` src="${attr(url)}"` : ""} alt="${attr(alt)}"${title ? ` title="${attr(title)}"` : ""} referrerpolicy="no-referrer">`;
    }
    case "autolink":
    case "url": {
      const raw = text.slice(fragment.url?.from ?? fragment.from, fragment.url?.to ?? fragment.to);
      const href = /^[^\s@<>]+@[^\s@<>]+$/.test(raw) && !/^[a-z][a-z0-9+.-]*:/i.test(raw) ? `mailto:${raw}` : /^www\./i.test(raw) ? `http://${raw}` : raw;
      const url = linkTarget(href, "link", state);
      return `<a${url !== null ? ` href="${attr(url)}"` : ""}>${escapeText(raw)}</a>`;
    }
    case "html":
      // 原样拼进去，整个文本块再统一过滤（开始标签和结束标签是分开的两个片段）
      return withoutSlotMarks(text.slice(fragment.from, fragment.to));
    case "comment":
      return "";
    case "entity":
      return safeEntity(text.slice(fragment.from, fragment.to));
    case "escape":
      return content ? escapeText(text.slice(content.from, content.to)) : "";
    case "hardBreak":
      return "<br>\n";
    case "math": {
      const result = state.math.get(node)?.get(fragment.from);
      const source = content ? text.slice(content.from, content.to) : "";
      if (!result || result.error || !result.html) {
        return `<span class="md-math-inline md-math-error" title="${attr(mathError(result))}">${escapeText(text.slice(fragment.from, fragment.to))}</span>`;
      }
      // 整个放进占位：段落里有原始 HTML 时整段要过 DOMPurify，它会去掉 data-latex
      return slot(state, `<span class="md-math-inline" data-latex="${attr(source)}">${result.html}</span>`);
    }
    case "footnoteReference": {
      const label = fragment.label ? text.slice(fragment.label.from, fragment.label.to) : "";
      const definition = state.footnotes.get(normalizeLabel(label));
      if (!definition || definition.number === null) return escapeText(text.slice(fragment.from, fragment.to));
      const occurrence = (state.footnoteOccurrences.get(definition.key) ?? 0) + 1;
      state.footnoteOccurrences.set(definition.key, occurrence);
      // 同 Typora 的导出（B-11）：上标是按第一次出现排的序号（它的编辑区里才显示标签）
      return `<sup class="md-footnote"><a href="#dfref-footnote-${definition.number}" id="${footnoteReferenceId(definition.number, occurrence)}">${definition.number}</a></sup>`;
    }
    case "emoji": {
      const raw = text.slice(fragment.from, fragment.to);
      const emoji = state.syntax.emoji ? emojiFor(raw.slice(1, -1)) : undefined;
      return emoji ? `<span class="md-emoji">${emoji}</span>` : escapeText(raw);
    }
    default:
      return escapeText(text.slice(fragment.from, fragment.to));
  }
}

function renderInlineRange(
  text: string,
  from: number,
  to: number,
  fragments: Fragment[],
  node: MdNode,
  abbreviations: Array<{ from: number; to: number; title: string }>,
  state: State,
): string {
  let html = "";
  let cursor = from;
  for (const fragment of fragments) {
    if (fragment.to <= from || fragment.from >= to) continue;
    html += renderPlain(text, cursor, fragment.from, abbreviations, state);
    html += renderFragment(text, fragment, node, abbreviations, state);
    cursor = fragment.to;
  }
  return html + renderPlain(text, cursor, to, abbreviations, state);
}

function hasRawHtml(fragments: Fragment[]): boolean {
  let found = false;
  walkFragments(fragments, (fragment) => {
    if (fragment.type === "html") found = true;
  });
  return found;
}

/** 文本块的行内 HTML；含原始 HTML 时整块过滤一遍（X-1） */
function renderInline(node: MdNode, state: State): string {
  const text = nodeText(node);
  const fragments = fragmentsOf(node, state);
  const abbreviations = findAbbreviations(text, fragments, state.abbreviations);
  const html = renderInlineRange(text, 0, text.length, fragments, node, abbreviations, state);
  return hasRawHtml(fragments) ? sanitizeHtml(html) : html;
}

// ---------------------------------------------------------------------------
// 块

function languageOf(node: MdNode): string {
  return String(node.attrs?.info ?? "").split(/\s+/)[0] ?? "";
}

/** CodeMirror 给空行放的零宽空格，空行才有高度 */
const EMPTY_LINE = '<span cm-text="">​</span>';

/** 代码块；diagram 是还没渲染的图表的种类，按代码输出并做上记号 */
function renderCode(node: MdNode, state: State, diagram?: string): string {
  const language = node.attrs?.indented ? "" : languageOf(node);
  const code = withoutSlotMarks(nodeText(node));
  const lang = language ? ` lang="${attr(language)}"` : "";
  if (state.options.noStyle) {
    const codeClass = language ? ` class="language-${attr(language.toLowerCase())}"` : "";
    return `<pre><code${codeClass}${lang}>${escapeHtml(code)}</code></pre>`;
  }
  // 结构和类名同 Typora 导出的代码块（CodeMirror 的 DOM），Typora 的主题能直接套（A-3）
  const lines = highlightLines(code, language)
    .map((line) => `<pre class="CodeMirror-line" role="presentation"><span role="presentation">${line || EMPTY_LINE}</span></pre>`)
    .join("");
  const classes = ["md-fences"];
  if (state.options.codeLineNumbers) classes.push("md-fences-with-lineno");
  if (diagram !== undefined) classes.push("md-diagram-source");
  const marker = diagram !== undefined ? ` data-diagram="${attr(diagram)}"` : "";
  return `<pre class="${classes.join(" ")}" spellcheck="false"${lang}${marker}><div class="CodeMirror cm-s-inner"${lang}><div class="CodeMirror-code" role="presentation">${lines}</div></div></pre>`;
}

function renderMathBlock(node: MdNode, state: State): string {
  const result = state.math.get(node)?.get(0);
  const source = nodeText(node);
  if (!result || result.error || !result.html) {
    return `<div class="md-math-block md-math-error"><pre>${escapeText(source)}</pre><p class="md-math-error-message">${escapeText(mathError(result))}</p></div>`;
  }
  return `<div class="md-math-block" data-latex="${attr(source)}"><div class="md-math-container">${slot(state, result.html)}</div></div>`;
}

function renderDiagram(node: MdNode, state: State): string {
  const kind = String(node.attrs?.kind ?? "");
  // 「HTML（不含样式）」里图表也是代码（同 Typora）
  if (state.options.noStyle) return renderCode(node, state);
  const key = diagramKey(kind, nodeText(node));
  const error = state.options.diagramErrors?.get(key);
  if (error !== undefined) {
    return `<div class="md-diagram-panel md-diagram-error" lang="${attr(languageOf(node))}"><pre>${escapeText(nodeText(node))}</pre><p class="md-diagram-error-message">${escapeText(error)}</p></div>`;
  }
  const svg = state.options.diagrams?.get(key);
  if (svg === undefined) return renderCode(node, state, kind);
  return `<div class="md-diagram-panel" lang="${attr(languageOf(node))}"><div class="md-diagram-panel-preview">${slot(state, svg)}</div></div>`;
}

function renderToc(state: State): string {
  const items = state.outline
    .filter((item) => item.id)
    .map(
      (item) =>
        `<span role="listitem" class="md-toc-item md-toc-h${item.level}"><a class="md-toc-inner" href="#${attr(item.id)}">${escapeText(item.title)}</a></span>`,
    )
    .join("");
  return `<div class="md-toc"><p class="md-toc-content" role="list">${items}</p></div>`;
}

function renderTable(node: MdNode, state: State): string {
  const requested = node.attrs?.align;
  const align: TableAlign[] = (Array.isArray(requested) ? requested : []).map((value) => (value === "left" || value === "center" || value === "right" ? value : null));
  const rows = blockChildren(node);
  const columns = Math.max(blockChildren(rows[0] ?? { type: "tableRow" }).length, 1);
  const cell = (tag: string, cellNode: MdNode | undefined, column: number) => {
    const style = align[column] ? ` style="text-align:${align[column]}"` : "";
    return `<${tag}${style}>${cellNode ? renderInline(cellNode, state) : ""}</${tag}>`;
  };
  const row = (rowNode: MdNode, tag: string) => {
    const cells = blockChildren(rowNode);
    return `<tr>${Array.from({ length: columns }, (_, column) => cell(tag, cells[column], column)).join("")}</tr>`;
  };
  const [header, ...body] = rows;
  return (
    `<figure class="table-figure"><table>` +
    (header ? `<thead>${row(header, "th")}</thead>` : "") +
    (body.length ? `<tbody>${body.map((rowNode) => row(rowNode, "td")).join("")}</tbody>` : "") +
    `</table></figure>`
  );
}

/** 只有一个段落的列表项说明、脚注内容：直接放行内内容 */
function onlyParagraph(node: MdNode): MdNode | null {
  const children = blockChildren(node).filter((child) => !isBlankParagraph(child));
  return children.length === 1 && children[0].type === "paragraph" ? children[0] : null;
}

function renderBlock(node: MdNode, state: State): string {
  switch (node.type) {
    case "paragraph": {
      if (isBlankParagraph(node)) return "";
      // 单独成段的图片同 Typora 的导出包一层 <span class="md-image">，主题靠它居中（M-1）
      const fragments = fragmentsOf(node, state);
      const text = nodeText(node);
      const lone = fragments.length === 1 && fragments[0].type === "image" && !text.slice(0, fragments[0].from).trim() && !text.slice(fragments[0].to).trim();
      return lone ? `<p><span class="md-image">${renderInline(node, state).trim()}</span></p>` : `<p>${renderInline(node, state)}</p>`;
    }
    case "heading": {
      const requested = Number(node.attrs?.level);
      const level = Number.isInteger(requested) ? Math.min(6, Math.max(1, requested)) : 1;
      const id = state.headingIds.get(node);
      return `<h${level}${id ? ` id="${attr(id)}"` : ""}>${renderInline(node, state)}</h${level}>`;
    }
    case "blockquote":
      return `<blockquote>${renderBlocks(blockChildren(node), state)}</blockquote>`;
    case "alert": {
      const requested = String(node.attrs?.kind ?? "note");
      const kind = Object.hasOwn(ALERT_TITLES, requested) ? requested : "note";
      // 同 Typora 的导出：标题（图标 + 名称）放在第一段开头，换行后接正文；第一块不是段落时单独成段
      const title = `<span class="md-alert-text md-alert-text-${kind}">${slot(state, ALERT_ICONS[kind])}${ALERT_TITLES[kind]}</span>`;
      const children = blockChildren(node);
      const first = children[0];
      const merged = first?.type === "paragraph" && !isBlankParagraph(first);
      const opening = merged ? `<p>${title}<br>${renderInline(first, state)}</p>` : `<p>${title}</p>`;
      return `<div class="md-alert md-alert-${kind} ${kind}">${opening}${renderBlocks(merged ? children.slice(1) : children, state)}</div>`;
    }
    case "bulletList":
      return `<ul>${renderBlocks(blockChildren(node), state)}</ul>`;
    case "orderedList": {
      const requested = Number(node.attrs?.start ?? 1);
      const start = Number.isSafeInteger(requested) && requested >= 0 ? requested : 1;
      return `<ol${start !== 1 ? ` start="${start}"` : ""}>${renderBlocks(blockChildren(node), state)}</ol>`;
    }
    case "listItem": {
      const checked = node.attrs?.checked;
      if (checked === null || checked === undefined) return `<li>${renderBlocks(blockChildren(node), state)}</li>`;
      const done = checked === true;
      // 同 Typora 导出：复选框不禁用（导出的文件里勾一下不影响什么）
      return `<li class="md-task-list-item task-list-item task-list-${done ? "done" : "not-done"}"><input type="checkbox"${done ? " checked" : ""}>${renderBlocks(blockChildren(node), state)}</li>`;
    }
    case "codeBlock":
      return isMathFence(node, state) ? renderMathBlock(node, state) : renderCode(node, state);
    case "diagram":
      return renderDiagram(node, state);
    case "mathBlock":
      return renderMathBlock(node, state);
    case "htmlBlock":
      return node.attrs?.comment ? "" : sanitizeHtml(withoutSlotMarks(nodeText(node)));
    case "toc":
      return renderToc(state);
    case "table":
      return renderTable(node, state);
    case "horizontalRule":
      return "<hr>";
    case "definitionList":
      return `<dl class="definition-list">${blockChildren(node)
        .map((child) => {
          if (child.type === "definitionTerm") return `<dt>${renderInline(child, state)}</dt>`;
          const single = onlyParagraph(child);
          return `<dd>${single ? renderInline(single, state) : renderBlocks(blockChildren(child), state)}</dd>`;
        })
        .join("")}</dl>`;
    // 不在原位置输出：Front Matter、脚注定义（集中到文末）、链接引用定义、缩写定义
    case "frontMatter":
    case "footnoteDefinition":
    case "referenceDefinition":
    case "abbreviationDefinition":
      return "";
    default:
      return "";
  }
}

/**
 * 块之间不加换行（同 Typora 的导出）：导出页的 li、p 是 white-space: pre-wrap（Typora 的 base.css），
 * 容器里多出的换行会显示成空行。只有顶层（#write 的子元素）之间换行，方便看导出的源码
 */
function renderBlocks(nodes: MdNode[], state: State, separator = ""): string {
  return nodes
    .map((node) => renderBlock(node, state))
    .filter((html) => html !== "")
    .join(separator);
}

/** 同 Typora 的导出：第一处引用 ref-footnote-1，同一脚注之后的 ref-footnote-1-1、ref-footnote-1-2…… */
function footnoteReferenceId(number: number, occurrence: number): string {
  return occurrence === 1 ? `ref-footnote-${number}` : `ref-footnote-${number}-${occurrence - 1}`;
}

function renderFootnotes(state: State): string {
  const ordered = [...state.footnotes.values()].flatMap((definition) => (definition.number === null ? [] : [{ ...definition, number: definition.number }]));
  if (!ordered.length) return "";
  ordered.sort((left, right) => left.number - right.number);
  const lines = ordered.map((definition) => {
    const single = onlyParagraph(definition.node);
    const content = single ? renderInline(single, state) : renderBlocks(blockChildren(definition.node), state);
    const occurrences = state.footnoteOccurrences.get(definition.key) ?? 0;
    const backlinks = Array.from(
      { length: occurrences },
      (_, index) => ` <a href="#${footnoteReferenceId(definition.number, index + 1)}" class="reversefootnote">↩︎</a>`,
    ).join("");
    return `<div class="footnote-line" id="dfref-footnote-${definition.number}"><span class="md-fn-count">${definition.number}</span> ${content}${backlinks}</div>`;
  });
  return `<div class="footnotes-area"><hr>${lines.join("")}</div>`;
}

function createState(doc: MdNode, options: RenderOptions): State {
  const syntax = resolveSyntax(options.syntax);
  const references = collectReferences(doc, syntax);
  const isDefined = referenceChecker(references);
  const outline = collectOutline(doc, { syntax, isDefined });
  const footnotes = collectFootnotes(doc, syntax);
  return {
    options,
    syntax,
    references,
    isDefined,
    abbreviations: collectAbbreviations(doc),
    footnotes: footnotes.definitions,
    footnoteOccurrences: new Map(),
    headingIds: new Map(outline.map((item) => [item.node, item.id])),
    outline: outline.map((item) => ({ level: item.level, title: item.title, id: item.id })),
    fragments: new Map(),
    math: new Map(),
    slots: [],
    nonce: randomHex(8),
  };
}

/** 整篇 → `#write` 里面的 HTML（文末带脚注） */
export function renderHtml(doc: MdNode, options: RenderOptions = {}): string {
  const state = createState(doc, options);
  if (state.syntax.math) collectMath(doc, state);
  const body = renderBlocks(blockChildren(doc), state, "\n");
  const footnotes = state.syntax.footnotes ? renderFootnotes(state) : "";
  return fillSlots(body + (footnotes ? `\n${footnotes}` : ""), state);
}

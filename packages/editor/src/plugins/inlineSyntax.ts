// E-2、I 章：行内片段的装饰（1.6 节）。文本块里的文字就是 Markdown 原文，这里按 @marko/markdown 切出的片段
// 加装饰：内容套上同导出一样的元素（strong、em、a……，主题按元素名写样式，A-3），标记（`**`、`](地址)`）
// 光标不在片段里也不挨着它的边界时隐藏；原子片段（行内公式、图片、emoji、脚注引用、实体、`<br>`）收起时
// 原文隐藏、显示渲染结果，展开时显示原文，公式和图片在后面跟一个预览。
// 片段按文本块缓存（节点对象不变就不重新切）；每次事务只重画改动的文本块和选区两端新旧所在的文本块（X-3）。
// 输入法组合期间不重画（E-12），组合结束后补上
import {
  collectAbbreviations,
  collectReferences,
  findAbbreviations,
  inlineFragments,
  normalizeLabel,
  plainText,
  readFrontMatter,
  referenceChecker,
  resolveReference,
  resolveSyntax,
  unescapeMarkdown,
  walkFragments,
  type AbbreviationInfo,
  type Fragment,
  type FragmentType,
  type Range,
  type ReferenceDefinitionInfo,
  type SyntaxOptions,
} from "@marko/markdown";
import { emojiFor, loadMathFonts, renderMath, safeUrl, sanitizeHtml, type MathResult } from "@marko/render";
import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { browserHost, type EditorHost } from "../host.ts";
import { toModel } from "../state.ts";
import { forgetWithin, whenVisible } from "./lazy.ts";
import { documentMathResult } from "./mathDocument.ts";
import { RECONCILE, REDRAW_BLOCKS, REFRESH_INLINE } from "./meta.ts";

/** 有行内片段的文本块（代码、公式、HTML 块和定义类的块是原样的文字） */
export const INLINE_TEXTBLOCKS = new Set(["paragraph", "heading", "tableCell", "tableHeader", "definitionTerm"]);

export { REFRESH_INLINE } from "./meta.ts";

/**
 * 按住鼠标（拖选、拖放）期间片段不展开也不收起：不然选区的一端经过片段时标记冒出来，文字挪位，
 * 鼠标底下的字就变了。松开以后再按选区展开（值：true 按下、false 松开）
 */
const FREEZE_INLINE = "markoFreezeInline";

/** 内容套的元素，同导出的 HTML（@marko/render 的 html.ts） */
const ELEMENTS: Partial<Record<FragmentType, string>> = {
  emphasis: "em",
  strong: "strong",
  strikethrough: "del",
  highlight: "mark",
  superscript: "sup",
  subscript: "sub",
  code: "code",
};

const VOID_TAGS = new Set(["area", "br", "col", "embed", "hr", "img", "input", "source", "track", "wbr"]);

/** 成对时把中间的文字套成这个元素（I-6：收起时显示过滤后的效果） */
/** 成对的媒体标签（M-7、B-12）：整段当原子片段，收起时显示过滤后的播放器（iframe 只留 https: 的，进沙箱，sanitize.ts） */
const MEDIA_TAGS = new Set(["video", "audio", "iframe"]);

const WRAPPING_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "big",
  "cite",
  "code",
  "del",
  "dfn",
  "em",
  "font",
  "i",
  "ins",
  "kbd",
  "mark",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "time",
  "tt",
  "u",
  "var",
]);

// ---------------------------------------------------------------------------
// 整篇的上下文：引用定义（决定 `[文字][标签]` 是不是链接）、脚注编号、缩写

interface FootnoteInfo {
  number: number;
  /** 每处引用在文档里的位置（脚注定义的回链用，nodeViews/blocks.ts） */
  positions: number[];
  /** 定义的内容（鼠标移到引用上时显示，B-11）：原文，太长的截断 */
  text: string;
}

/** 提示框里最多显示多少字 */
const TIP_LIMIT = 300;

function tipText(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TIP_LIMIT ? `${flat.slice(0, TIP_LIMIT)}…` : flat;
}

interface InlineContext {
  syntax: SyntaxOptions;
  references: Map<string, ReferenceDefinitionInfo>;
  isDefined: (label: string) => boolean;
  abbreviations: Map<string, AbbreviationInfo>;
  footnotes: Map<string, FootnoteInfo>;
  /** Front Matter 的 typora-root-url：图片的相对路径相对它（M-1） */
  rootUrl: string | null;
  /** D-2：公式在整篇渲染里的结果（有编号、引用时；没有时单独渲染） */
  mathResult: (node: PMNode, offset: number) => MathResult | undefined;
  /** E-10：智能引号、智能破折号与省略号（只改显示） */
  smartQuotes: boolean;
  smartDashes: boolean;
  /** 切片段用到的：语法开关、有哪些引用定义。变了要重新切 */
  parseKey: string;
  /** 画装饰用到的：引用的地址和标题、脚注编号、缩写、图片的根目录、智能标点。变了要整篇重画 */
  renderKey: string;
}

/** 画装饰要用的设置（E-10） */
export interface InlineDisplaySettings {
  smartQuotes: boolean;
  smartDashes: boolean;
}

const rootUrlCache = new WeakMap<PMNode, string | null>();

/** Front Matter 的 typora-root-url（按节点缓存，YAML 不用每次都解析） */
function rootUrlOf(doc: PMNode): string | null {
  const first = doc.firstChild;
  if (!first || first.type.name !== "frontMatter") return null;
  if (rootUrlCache.has(first)) return rootUrlCache.get(first) ?? null;
  const root = readFrontMatter(toModel(doc))?.rootUrl ?? null;
  rootUrlCache.set(first, root);
  return root;
}

const fragmentCache = new WeakMap<PMNode, { key: string; fragments: Fragment[] }>();

function fragmentsOf(node: PMNode, context: Pick<InlineContext, "syntax" | "isDefined" | "parseKey">): Fragment[] {
  const cached = fragmentCache.get(node);
  if (cached && cached.key === context.parseKey) return cached.fragments;
  const fragments = inlineFragments(node.textContent, context.syntax, context.isDefined);
  fragmentCache.set(node, { key: context.parseKey, fragments });
  return fragments;
}

/** 脚注按第一次被引用的顺序编号（同 @marko/markdown 的 collectFootnotes，片段用缓存） */
function numberFootnotes(doc: PMNode, context: Pick<InlineContext, "syntax" | "isDefined" | "parseKey">): Map<string, FootnoteInfo> {
  const defined = new Map<string, string>();
  doc.descendants((node) => {
    if (node.type.name !== "footnoteDefinition") return !node.isTextblock;
    const key = normalizeLabel(String(node.attrs.label ?? ""));
    // 同一个标签定义了几次时用第一个（同解析）
    if (!defined.has(key)) defined.set(key, tipText(node.textBetween(0, node.content.size, " ", " ")));
    return false;
  });
  const numbers = new Map<string, FootnoteInfo>();
  if (!defined.size) return numbers;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textContent;
    if (!INLINE_TEXTBLOCKS.has(node.type.name) || !text.includes("[^")) return false;
    walkFragments(fragmentsOf(node, context), (fragment) => {
      if (fragment.type !== "footnoteReference" || !fragment.label) return;
      const key = normalizeLabel(text.slice(fragment.label.from, fragment.label.to));
      if (!defined.has(key)) return;
      let info = numbers.get(key);
      if (!info) numbers.set(key, (info = { number: numbers.size + 1, positions: [], text: defined.get(key) ?? "" }));
      info.positions.push(pos + 1 + fragment.from);
    });
    return false;
  });
  return numbers;
}

function buildContext(state: EditorState, syntax: SyntaxOptions, display: InlineDisplaySettings): InlineContext {
  const doc = state.doc;
  const model = toModel(doc);
  const references = collectReferences(model, syntax);
  const isDefined = referenceChecker(references);
  const parseKey = `${JSON.stringify(syntax)}\u0000${[...references.keys()].sort().join("\u0000")}`;
  const partial = { syntax, isDefined, parseKey };
  const abbreviations = collectAbbreviations(model);
  const footnotes = numberFootnotes(doc, partial);
  const rootUrl = rootUrlOf(doc);
  const renderKey = JSON.stringify([
    [...references].map(([key, value]) => [key, value.url, value.title]),
    [...abbreviations].map(([key, value]) => [key, value.title]),
    [...footnotes].map(([key, value]) => [key, value.number, value.text]),
    rootUrl,
    display.smartQuotes,
    display.smartDashes,
  ]);
  const mathResult = (node: PMNode, offset: number) => documentMathResult(state, node, offset);
  return { ...partial, references, abbreviations, footnotes, rootUrl, mathResult, smartQuotes: display.smartQuotes, smartDashes: display.smartDashes, renderKey };
}

// ---------------------------------------------------------------------------
// 一个文本块的装饰

/** 有 typora-root-url 时，图片的相对路径（不带协议、不是 // 开头）相对它（M-1，同 Typora：`/a.png` 也算相对根目录） */
export function withRootUrl(url: string, root: string | null): string {
  if (!root || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") || url.startsWith("#")) return url;
  return `${root.replace(/[\\/]+$/, "")}/${url.replace(/^[\\/]+/, "").replace(/^\.\//, "")}`;
}

/** 链接、图片的地址：去掉尖括号，解开转义，本地路径交给宿主；不安全的协议不给地址 */
function target(raw: string, kind: "link" | "image", host: EditorHost, root: string | null = null): string | null {
  let url = raw.trim();
  if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
  url = unescapeMarkdown(url);
  if (kind === "image") url = withRootUrl(url, root);
  return safeUrl(host.resolveUrl(url, kind), kind);
}

function titleOf(text: string, fragment: Fragment): string | null {
  if (!fragment.title) return null;
  return unescapeMarkdown(text.slice(fragment.title.from + 1, fragment.title.to - 1));
}

/** 链接、图片的地址和标题（引用式的找定义） */
function linkInfo(text: string, fragment: Fragment, kind: "link" | "image", context: InlineContext, host: EditorHost): { url: string | null; title: string | null } {
  if (fragment.url) return { url: target(text.slice(fragment.url.from, fragment.url.to), kind, host, context.rootUrl), title: titleOf(text, fragment) };
  const definition = resolveReference(text, fragment, context.references);
  return definition ? { url: target(definition.url, kind, host, context.rootUrl), title: definition.title } : { url: null, title: null };
}

/** 自动链接、裸网址的地址（同导出：邮箱加 mailto:，www. 开头的加 http://） */
function autolinkUrl(raw: string, host: EditorHost): string | null {
  const href = /^[^\s@<>]+@[^\s@<>]+$/.test(raw) && !/^[a-z][a-z0-9+.-]*:/i.test(raw) ? `mailto:${raw}` : /^www\./i.test(raw) ? `http://${raw}` : raw;
  return target(href, "link", host);
}

interface HtmlTag {
  fragment: Fragment;
  name: string;
  closing: boolean;
  /** `<br>`、`<img …>`、`<x/>` */
  single: boolean;
  raw: string;
}

const TAG = /^<\s*(\/)?\s*([A-Za-z][\w-]*)\b[^>]*?(\/)?\s*>$/s;

/** 行内 HTML 的标签：成对的（开始、结束）和单个的 */
function htmlTags(fragments: Fragment[], text: string): { pairs: Array<{ open: HtmlTag; close: HtmlTag }>; singles: HtmlTag[] } {
  const tags: HtmlTag[] = [];
  walkFragments(fragments, (fragment) => {
    if (fragment.type !== "html") return;
    const raw = text.slice(fragment.from, fragment.to);
    const match = TAG.exec(raw);
    if (!match) {
      tags.push({ fragment, name: "", closing: false, single: true, raw });
      return;
    }
    const name = match[2].toLowerCase();
    tags.push({ fragment, name, closing: Boolean(match[1]), single: !match[1] && (VOID_TAGS.has(name) || Boolean(match[3])), raw });
  });
  const pairs: Array<{ open: HtmlTag; close: HtmlTag }> = [];
  const singles: HtmlTag[] = [];
  const stack: HtmlTag[] = [];
  for (const tag of tags) {
    if (tag.single || !(WRAPPING_TAGS.has(tag.name) || MEDIA_TAGS.has(tag.name))) {
      singles.push(tag);
    } else if (!tag.closing) {
      stack.push(tag);
    } else {
      const index = stack.map((open) => open.name).lastIndexOf(tag.name);
      if (index < 0) {
        singles.push(tag);
        continue;
      }
      // 中间没有配上的开始标签按单个的显示
      singles.push(...stack.splice(index + 1));
      pairs.push({ open: stack.pop() as HtmlTag, close: tag });
    }
  }
  singles.push(...stack);
  return { pairs, singles };
}

const sanitizedCache = new Map<string, Element | null>();

/** 标签过滤后的元素（DOMPurify，同导出）；被整个去掉时为 null */
function sanitizedElement(raw: string, name: string, single: boolean): Element | null {
  const key = `${name}\u0000${raw}`;
  if (sanitizedCache.has(key)) return sanitizedCache.get(key) ?? null;
  const template = document.createElement("template");
  template.innerHTML = sanitizeHtml(single ? raw : `${raw}</${name}>`);
  const element = template.content.firstElementChild;
  const result = element && element.tagName.toLowerCase() === name ? element : null;
  if (sanitizedCache.size > 500) sanitizedCache.clear();
  sanitizedCache.set(key, result);
  return result;
}

function attributesOf(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) attrs[attribute.name] = attribute.value;
  return attrs;
}

function decodeEntity(raw: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = raw;
  return textarea.value;
}

/** documentResult：整篇渲染里这个公式的结果（D-2，有编号、引用时）；没有时单独渲染 */
function mathElement(tex: string, preview: boolean, documentResult?: MathResult): HTMLElement {
  const span = document.createElement("span");
  span.className = preview ? "md-math-inline md-math-preview" : "md-math-inline";
  span.setAttribute("data-latex", tex);
  const paint = () => {
    const result = documentResult && !documentResult.pending ? documentResult : renderMath(tex, false);
    if (result.pending) {
      span.textContent = tex;
      // 缺字体：加载完再画一次
      void loadMathFonts([{ tex, display: false }]).then(() => {
        const again = renderMath(tex, false);
        if (!again.pending) paint();
      });
      return;
    }
    if (result.error || !result.html) {
      span.classList.add("md-math-error");
      span.title = result.error ?? "";
      span.textContent = `$${tex}$`;
      return;
    }
    span.innerHTML = result.html;
  };
  // X-3：进入视口附近才渲染（预览马上要看，直接画）
  span.textContent = `$${tex}$`;
  if (preview) paint();
  else whenVisible(span, paint);
  return span;
}

function imageElement(url: string | null, alt: string, title: string | null, preview: boolean, source: string): HTMLElement {
  const wrapper = document.createElement("span");
  wrapper.className = preview ? "md-image md-image-preview" : "md-image";
  wrapper.dataset.src = source;
  const image = document.createElement("img");
  // M-1：加载失败时显示失败状态和路径（单击进去可以改路径）
  const fail = () => {
    wrapper.classList.add("md-image-failed");
    wrapper.title = source;
  };
  image.addEventListener("error", fail);
  if (url !== null) image.src = url;
  else fail();
  image.alt = alt;
  if (title) image.title = title;
  image.referrerPolicy = "no-referrer";
  // X-3：窗口外的图片晚点再加载
  image.loading = "lazy";
  wrapper.append(image);
  return wrapper;
}

/** E-10：直引号、`--`、`---`、`...` 显示成什么（文件里还是原来的字符） */
function smartPunctuation(text: string, fragments: Fragment[], context: InlineContext): Array<{ from: number; to: number; char: string }> {
  if (!context.smartQuotes && !context.smartDashes) return [];
  // 代码、公式、网址、HTML 这些原样的片段，和标记（链接地址也在标记里）不处理
  const skip: Range[] = [];
  walkFragments(fragments, (fragment) => {
    if (["code", "math", "url", "autolink", "html", "comment", "entity", "escape", "emoji", "footnoteReference", "hardBreak"].includes(fragment.type)) skip.push(fragment);
    else skip.push(...fragment.marks);
  });
  const skipped = (from: number, to: number) => skip.some((range) => from < range.to && to > range.from);
  const result: Array<{ from: number; to: number; char: string }> = [];
  const pattern = context.smartQuotes && context.smartDashes ? /---|--|\.\.\.|["']/g : context.smartQuotes ? /["']/g : /---|--|\.\.\./g;
  for (const match of text.matchAll(pattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (skipped(from, to)) continue;
    let char: string;
    if (match[0] === "---") char = "—";
    else if (match[0] === "--") char = "–";
    else if (match[0] === "...") char = "…";
    else {
      // 开头、空白或左括号后面的是左引号，其余是右引号（词里的撇号也是右单引号）
      const before = from > 0 ? text[from - 1] : "";
      const opening = !before || /[\s([{<—–“‘-]/.test(before);
      char = match[0] === '"' ? (opening ? "“" : "”") : opening ? "‘" : "’";
    }
    result.push({ from, to, char });
  }
  return result;
}

/**
 * 脚注引用的上标（B-11）：编辑区里显示标签（同 Typora 的编辑区；导出时是序号）；单击跳到定义（所在的编辑器：Tiptap 把它挂在编辑区根元素的 editor 上）；
 * 定义的内容放在 data-tip（鼠标移上去时组件用提示框显示）
 */
function footnoteElement(label: string, key: string, tip: string): HTMLElement {
  const element = textElement("sup", "md-footnote", label);
  if (tip) element.dataset.tip = tip;
  element.addEventListener("mousedown", (event) => {
    const root = (event.currentTarget as HTMLElement).closest(".ProseMirror") as (HTMLElement & { editor?: { view: EditorView } }) | null;
    const view = root?.editor?.view;
    if (!view) return;
    let target: number | null = null;
    view.state.doc.descendants((node, pos) => {
      if (target !== null) return false;
      if (node.type.name === "footnoteDefinition" && normalizeLabel(String(node.attrs.label ?? "")) === key) {
        target = pos + 1;
        return false;
      }
      return !node.isTextblock;
    });
    if (target === null) return;
    event.preventDefault();
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(target))).scrollIntoView());
    view.focus();
  });
  return element;
}

function textElement(tag: string, className: string, text: string, title?: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  if (title) element.title = title;
  return element;
}

/** 文本块 node（位置 pos）的装饰；focus 是选区落在这个文本块里的偏移（展开这些位置上的片段） */
function blockDecorations(node: PMNode, pos: number, focus: number[], context: InlineContext, host: EditorHost): Decoration[] {
  const text = node.textContent;
  if (!text) return [];
  const start = pos + 1;
  const fragments = fragmentsOf(node, context);
  const result: Decoration[] = [];
  const open = (from: number, to: number) => focus.some((offset) => offset >= from && offset <= to);
  const wrap = (range: Range | null | undefined, attrs: Record<string, string>) => {
    if (range && range.to > range.from) result.push(Decoration.inline(start + range.from, start + range.to, attrs));
  };
  // L-1：标记（链接、图片的地址，HTML 标签……）、行内代码、网址、公式的源码不做拼写检查
  const mark = (range: Range, visible: boolean, extra = "") => wrap(range, { class: `md-mark${extra}${visible ? "" : " md-hidden"}`, spellcheck: "false" });
  const widget = (offset: number, key: string, render: () => HTMLElement) =>
    // 部件里还没进过视口、等着渲染的公式：部件销毁时从共用的观察器里取消（lazy.ts）
    result.push(Decoration.widget(start + offset, render, { key, side: 1, ignoreSelection: true, destroy: forgetWithin }));
  /** 原子片段：收起时原文隐藏、显示 render 的结果；展开时显示原文（标记灰显），preview 时后面跟一个预览 */
  const atom = (fragment: Fragment, key: string, render: (preview: boolean) => HTMLElement, preview: boolean, showContent = false) => {
    if (open(fragment.from, fragment.to)) {
      if (showContent && fragment.content) {
        for (const range of fragment.marks) mark(range, true);
      } else {
        mark(fragment, true);
      }
      if (preview) widget(fragment.to, `${key}\u0000preview`, () => render(true));
      return;
    }
    wrap(fragment, { class: "md-hidden" });
    widget(fragment.from, key, () => render(false));
  };

  const visit = (fragment: Fragment) => {
    const visible = open(fragment.from, fragment.to);
    const element = ELEMENTS[fragment.type];
    switch (fragment.type) {
      case "emphasis":
      case "strong":
      case "strikethrough":
      case "highlight":
      case "superscript":
      case "subscript":
      case "code":
        wrap(fragment.content, fragment.type === "code" ? { nodeName: "code", spellcheck: "false" } : { nodeName: element as string });
        for (const range of fragment.marks) mark(range, visible);
        break;
      case "link": {
        const { url, title } = linkInfo(text, fragment, "link", context, host);
        const attrs: Record<string, string> = { nodeName: "a", class: "md-link" };
        if (url !== null) attrs.href = url;
        if (title) attrs.title = title;
        wrap(fragment.content, attrs);
        for (const range of fragment.marks) mark(range, visible);
        break;
      }
      case "autolink":
      case "url": {
        const raw = text.slice(fragment.url?.from ?? fragment.from, fragment.url?.to ?? fragment.to);
        const url = autolinkUrl(raw, host);
        wrap(fragment.content, url !== null ? { nodeName: "a", class: "md-link", href: url, spellcheck: "false" } : { nodeName: "a", class: "md-link", spellcheck: "false" });
        for (const range of fragment.marks) mark(range, visible);
        break;
      }
      case "escape":
        for (const range of fragment.marks) mark(range, visible);
        break;
      case "hardBreak": {
        // 换行本身留着（显示成换行），只藏行尾的两个空格或反斜杠
        const end = text[fragment.to - 1] === "\n" ? fragment.to - 1 : fragment.to;
        if (text[end - 1] === "\r") mark({ from: fragment.from, to: end - 1 }, visible);
        else mark({ from: fragment.from, to: end }, visible);
        break;
      }
      case "comment":
        // B-12：注释在编辑区灰色显示原文
        wrap(fragment, { class: "md-comment" });
        break;
      case "math": {
        const tex = fragment.content ? text.slice(fragment.content.from, fragment.content.to) : "";
        const documentResult = context.mathResult(node, fragment.from);
        atom(fragment, `math\u0000${tex}\u0000${documentResult?.html ?? ""}`, (preview) => mathElement(tex, preview, documentResult), true, true);
        if (visible) wrap(fragment.content, { class: "md-math-source", spellcheck: "false" });
        break;
      }
      case "image": {
        const { url, title } = linkInfo(text, fragment, "image", context, host);
        const altSource = fragment.content ? text.slice(fragment.content.from, fragment.content.to) : "";
        const alt = plainText(altSource, inlineFragments(altSource, context.syntax, context.isDefined));
        const source = fragment.url ? unescapeMarkdown(text.slice(fragment.url.from, fragment.url.to)) : "";
        atom(fragment, `image\u0000${url}\u0000${alt}\u0000${title}`, (preview) => imageElement(url, alt, title, preview, source), true, true);
        break;
      }
      case "footnoteReference": {
        const label = fragment.label ? text.slice(fragment.label.from, fragment.label.to) : "";
        const info = context.footnotes.get(normalizeLabel(label));
        // 没有定义的按普通文字显示（B-11）
        // B-11：单击上标跳到脚注定义
        const key = normalizeLabel(label);
        if (info) atom(fragment, `footnote\u0000${label}\u0000${info.text}`, () => footnoteElement(label, key, info.text), false);
        break;
      }
      case "emoji": {
        const raw = text.slice(fragment.from, fragment.to);
        const emoji = context.syntax.emoji ? emojiFor(raw.slice(1, -1)) : undefined;
        if (emoji) atom(fragment, `emoji\u0000${emoji}`, () => textElement("span", "md-emoji", emoji, raw), false);
        break;
      }
      case "entity": {
        const raw = text.slice(fragment.from, fragment.to);
        const char = decodeEntity(raw);
        if (char !== raw) atom(fragment, `entity\u0000${raw}`, () => textElement("span", "md-entity", char), false);
        break;
      }
      default:
        break;
    }
    for (const child of fragment.children) visit(child);
  };
  for (const fragment of fragments) visit(fragment);

  // 行内 HTML（I-6）：成对的标签收起时隐藏、中间的文字套上过滤后的元素；`<br>`、`<img>` 收起时显示效果；其余的照原样灰显
  const { pairs, singles } = htmlTags(fragments, text);
  for (const { open: openTag, close } of pairs) {
    const visible = open(openTag.fragment.from, close.fragment.to);
    if (MEDIA_TAGS.has(openTag.name)) {
      // 整段（开始标签到结束标签）过滤后显示；展开时显示原文
      const whole = { from: openTag.fragment.from, to: close.fragment.to };
      const raw = text.slice(whole.from, whole.to);
      const template = document.createElement("template");
      template.innerHTML = sanitizeHtml(raw);
      const media = template.content.firstElementChild;
      if (!media || visible) {
        mark(openTag.fragment, true, " md-html-tag");
        mark(close.fragment, true, " md-html-tag");
        continue;
      }
      for (const element of [media, ...Array.from(media.querySelectorAll("[src]"))]) {
        const src = element.getAttribute("src");
        if (src === null) continue;
        const url = safeUrl(host.resolveUrl(src, "media"), "media");
        if (url === null) element.removeAttribute("src");
        else element.setAttribute("src", url);
      }
      wrap(whole, { class: "md-hidden" });
      widget(whole.from, `media\u0000${raw}`, () => media.cloneNode(true) as HTMLElement);
      continue;
    }
    const element = sanitizedElement(openTag.raw, openTag.name, false);
    if (element) wrap({ from: openTag.fragment.to, to: close.fragment.from }, { nodeName: openTag.name, ...attributesOf(element) });
    mark(openTag.fragment, visible || !element, " md-html-tag");
    mark(close.fragment, visible || !element, " md-html-tag");
  }
  for (const tag of singles) {
    const element = tag.single && (tag.name === "br" || tag.name === "img") ? sanitizedElement(tag.raw, tag.name, true) : null;
    if (!element) {
      mark(tag.fragment, true, " md-html-tag");
      continue;
    }
    const render = () => {
      const copy = element.cloneNode(true) as HTMLElement;
      if (copy instanceof HTMLImageElement) {
        const src = copy.getAttribute("src");
        if (src !== null) {
          const url = target(src, "image", host, context.rootUrl);
          if (url === null) copy.removeAttribute("src");
          else copy.setAttribute("src", url);
        }
      }
      return copy;
    };
    atom(tag.fragment, `html\u0000${tag.raw}`, render, tag.name === "img");
  }

  // 缩写（B-16）：正文里的词加上全称的提示（data-tip：组件用提示框显示；不用 title，免得浏览器再出一个）
  if (context.abbreviations.size) {
    for (const match of findAbbreviations(text, fragments, context.abbreviations)) {
      wrap(match, { nodeName: "abbr", "data-tip": match.title });
    }
  }

  // E-10：智能标点只改显示：原来的字符藏起来，显示替换后的
  for (const punctuation of smartPunctuation(text, fragments, context)) {
    wrap(punctuation, { class: "md-hidden" });
    widget(punctuation.from, `smart\u0000${punctuation.char}`, () => textElement("span", "md-smart-punct", punctuation.char));
  }

  // M-1：单独成段的图片按块显示、居中（同主题里 `p > .md-image:only-child` 的规则；这里段落里还有藏起来的原文）
  if (node.type.name === "paragraph" && fragments.length === 1 && fragments[0].type === "image" && !text.slice(0, fragments[0].from).trim() && !text.slice(fragments[0].to).trim()) {
    result.push(Decoration.node(pos, pos + node.nodeSize, { class: "md-image-only" }));
  }
  return result;
}

// ---------------------------------------------------------------------------
// 插件

export interface InlineSyntaxOptions {
  syntax: () => SyntaxOptions;
  host: () => EditorHost;
  /** 智能标点的设置（E-10） */
  display: () => InlineDisplaySettings;
  /** 打开链接（N-4：`#标题` 在文档里跳，别的交给宿主） */
  openLink: (url: string) => void;
}

interface InlineSyntaxState {
  decorations: DecorationSet;
  context: InlineContext;
  /** 上一次有展开的文本块（选区两端所在的），位置是节点前面 */
  focused: number[];
  /** 输入法组合期间改过、还没重画的文本块 */
  pending: number[];
  /** 按住鼠标期间（FREEZE_INLINE） */
  frozen: boolean;
}

export const inlineSyntaxKey = new PluginKey<InlineSyntaxState>("markoInlineSyntax");

/** 选区两端落在哪些有行内片段的文本块里：文本块位置 → 块里的偏移 */
function focusOf(state: EditorState): Map<number, number[]> {
  const focus = new Map<number, number[]>();
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return focus;
  for (const $pos of [selection.$anchor, selection.$head]) {
    if (!$pos.parent.isTextblock || !INLINE_TEXTBLOCKS.has($pos.parent.type.name)) continue;
    const pos = $pos.before();
    const offsets = focus.get(pos) ?? [];
    if (!offsets.includes($pos.parentOffset)) offsets.push($pos.parentOffset);
    focus.set(pos, offsets);
  }
  return focus;
}

function buildAll(doc: PMNode, context: InlineContext, focus: Map<number, number[]>, host: EditorHost): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (INLINE_TEXTBLOCKS.has(node.type.name)) decorations.push(...blockDecorations(node, pos, focus.get(pos) ?? [], context, host));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** 文档位置 pos 所在（或紧跟在后面）的文本块的位置 */
function textblockAt(doc: PMNode, pos: number): number | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const $pos = doc.resolve(pos);
  if ($pos.parent.isTextblock) return $pos.before();
  const after = $pos.nodeAfter;
  return after?.isTextblock ? pos : null;
}

/** 事务改动过的范围（最后的文档上） */
function changedRanges(tr: Transaction): Range[] {
  const ranges: Range[] = [];
  tr.mapping.maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push({ from: rest.map(newStart, -1), to: rest.map(newEnd, 1) });
    });
  });
  return ranges;
}

export function inlineSyntaxPlugin(options: InlineSyntaxOptions): Plugin<InlineSyntaxState> {
  const redraw = (state: InlineSyntaxState, doc: PMNode, blocks: Iterable<number>, focus: Map<number, number[]>, host: EditorHost): DecorationSet => {
    let decorations = state.decorations;
    for (const pos of new Set(blocks)) {
      const node = doc.nodeAt(pos);
      if (!node?.isTextblock || !INLINE_TEXTBLOCKS.has(node.type.name)) continue;
      const from = pos + 1;
      const to = pos + node.nodeSize - 1;
      decorations = decorations.remove(decorations.find(from, to));
      decorations = decorations.add(doc, blockDecorations(node, pos, focus.get(pos) ?? [], state.context, host));
    }
    return decorations;
  };
  return new Plugin<InlineSyntaxState>({
    key: inlineSyntaxKey,
    state: {
      init(_config, state) {
        const context = buildContext(state, options.syntax(), options.display());
        const focus = focusOf(state);
        return { decorations: buildAll(state.doc, context, focus, options.host()), context, focused: [...focus.keys()], pending: [], frozen: false };
      },
      apply(tr, value, _oldState, newState) {
        const host = options.host();
        const focus = focusOf(newState);
        const composing = tr.getMeta("composition") !== undefined;
        const freeze = tr.getMeta(FREEZE_INLINE) as boolean | undefined;
        if (tr.getMeta(REFRESH_INLINE)) {
          const context = buildContext(newState, options.syntax(), options.display());
          return { decorations: buildAll(newState.doc, context, focus, host), context, focused: [...focus.keys()], pending: [], frozen: false };
        }
        if (freeze === true) return { ...value, decorations: value.decorations.map(tr.mapping, newState.doc), frozen: true };
        const extra = (tr.getMeta(REDRAW_BLOCKS) as number[] | undefined) ?? [];
        if (!tr.docChanged && !tr.selectionSet && !tr.getMeta(RECONCILE) && freeze === undefined && !extra.length) return value;
        // 按住鼠标期间只是选区变了：不展开、不收起
        if (value.frozen && freeze === undefined && !tr.docChanged) return value;
        let context = value.context;
        // 公式的整篇渲染结果对回了换过对象的块（plugins/mathDocument.ts）：结果从新的状态里取
        if (extra.length) context = { ...context, mathResult: (node, offset) => documentMathResult(newState, node, offset) };
        if (tr.docChanged) {
          const next = buildContext(newState, options.syntax(), options.display());
          // 引用定义、脚注编号、缩写变了：别处的片段也受影响，整篇重画
          if (next.parseKey !== context.parseKey || next.renderKey !== context.renderKey) {
            return { decorations: buildAll(newState.doc, next, focus, host), context: next, focused: [...focus.keys()], pending: [], frozen: value.frozen && freeze !== false };
          }
          context = next;
        }
        const mapPositions = (positions: number[]) =>
          positions.map((pos) => textblockAt(newState.doc, tr.mapping.map(pos, 1))).filter((pos): pos is number => pos !== null);
        const changed: number[] = [];
        if (tr.docChanged) {
          for (const range of changedRanges(tr)) {
            const at = textblockAt(newState.doc, range.from);
            if (at !== null) changed.push(at);
            newState.doc.nodesBetween(range.from, range.to, (node, pos) => {
              if (!node.isTextblock) return true;
              changed.push(pos);
              return false;
            });
          }
        }
        const mapped = { ...value, context, decorations: value.decorations.map(tr.mapping, newState.doc) };
        if (composing) {
          // 组合期间只跟着映射，改过的块记下来，结束后再画（E-12）
          return { ...mapped, focused: mapPositions(value.focused), pending: [...mapPositions(value.pending), ...changed] };
        }
        const blocks = [...changed, ...extra, ...mapPositions(value.pending), ...mapPositions(value.focused), ...focus.keys()];
        return { ...mapped, decorations: redraw(mapped, newState.doc, blocks, focus, host), focused: [...focus.keys()], pending: [], frozen: value.frozen && freeze !== false };
      },
    },
    props: {
      decorations(state) {
        return inlineSyntaxKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
      handleDOMEvents: {
        // 编辑区里的链接不让浏览器自己打开（Ctrl+单击由 handleClick 交给宿主，N-4；不然会打开两次）
        click(_view, event) {
          if ((event.target as Element | null)?.closest?.("a[href]")) event.preventDefault();
          return false;
        },
        auxclick(_view, event) {
          if ((event.target as Element | null)?.closest?.("a[href]")) event.preventDefault();
          return false;
        },
        mousedown(view, event) {
          if (event.button !== 0) return false;
          view.dispatch(view.state.tr.setMeta(FREEZE_INLINE, true).setMeta("addToHistory", false));
          // 拖放结束时没有 mouseup，只有 drop、dragend
          let done = false;
          const release = () => {
            if (done) return;
            done = true;
            for (const type of ["mouseup", "dragend", "drop"]) window.removeEventListener(type, release);
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(FREEZE_INLINE, false).setMeta("addToHistory", false));
          };
          for (const type of ["mouseup", "dragend", "drop"]) window.addEventListener(type, release);
          return false;
        },
      },
      // N-4：Ctrl+单击（macOS 上 ⌘+单击）打开链接
      handleClick(view: EditorView, pos: number, event: MouseEvent) {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const url = linkAt(view.state, pos, options.host());
        if (!url) return false;
        options.openLink(url);
        return true;
      },
    },
  });
}

/** 文档位置 pos 上的链接地址（链接、自动链接、裸网址；Ctrl+单击、Ctrl+Shift+O 打开，N-4） */
export function linkAt(state: EditorState, pos: number, host: EditorHost): string | null {
  const $pos = state.doc.resolve(pos);
  const node = $pos.parent;
  if (!node.isTextblock || !INLINE_TEXTBLOCKS.has(node.type.name)) return null;
  const plugin = inlineSyntaxKey.getState(state);
  if (!plugin) return null;
  const text = node.textContent;
  const offset = $pos.parentOffset;
  let found: string | null = null;
  walkFragments(fragmentsOf(node, plugin.context), (fragment) => {
    if (found !== null || offset < fragment.from || offset > fragment.to) return;
    if (fragment.type === "link") found = linkInfo(text, fragment, "link", plugin.context, host).url;
    else if (fragment.type === "autolink" || fragment.type === "url") {
      found = autolinkUrl(text.slice(fragment.url?.from ?? fragment.from, fragment.url?.to ?? fragment.to), host);
    }
  });
  return found;
}

/** Tiptap 扩展：语法开关、宿主由编辑器给 */
export const InlineSyntax = Extension.create<InlineSyntaxOptions>({
  name: "markoInlineSyntax",
  addOptions: () => ({
    syntax: () => resolveSyntax({}),
    host: () => browserHost,
    display: () => ({ smartQuotes: false, smartDashes: false }),
    openLink: (url: string) => browserHost.openLink(url),
  }),
  addProseMirrorPlugins() {
    return [inlineSyntaxPlugin(this.options)];
  },
});

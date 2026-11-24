// 行内片段（1.5.3 节）：文本块的行内原文 → 片段（类型、标记位置、内容范围、嵌套）。
// 编辑器按片段加装饰（标记隐藏、展开、原子片段的渲染），渲染按同样的片段输出 HTML，两边对一段原文的理解一致
import type { SyntaxNode } from "@lezer/common";
import { inlineParser, resolveSyntax, type SyntaxOptions } from "./syntax/index.ts";

export type FragmentType =
  | "emphasis"
  | "strong"
  | "strikethrough"
  | "highlight"
  | "superscript"
  | "subscript"
  | "code"
  | "link"
  | "image"
  | "autolink"
  | "url"
  | "html"
  | "comment"
  | "entity"
  | "escape"
  | "hardBreak"
  | "math"
  | "footnoteReference"
  | "emoji";

export interface Range {
  from: number;
  to: number;
}

export interface Fragment extends Range {
  type: FragmentType;
  /** 标记的位置（收起时隐藏）：`**`、`[`、`](地址)` 等 */
  marks: Range[];
  /** 内容的位置：粗体里的文字、链接文字、代码、公式源码；没有内容的片段为 null */
  content: Range | null;
  /** 收起时整个用渲染结果代替显示（2.0 节「原子片段」） */
  atomic: boolean;
  /** 内容里嵌套的片段 */
  children: Fragment[];
  /** 链接、图片、自动链接的地址 */
  url?: Range;
  /** 链接、图片的标题 */
  title?: Range;
  /** 引用式链接 `[文字][标签]` 的标签（不含方括号）；`[文字][]` 和 `[文字]` 时是文字本身；脚注引用的标签 */
  label?: Range;
}

const SIMPLE: Record<string, { type: FragmentType; mark: string }> = {
  Emphasis: { type: "emphasis", mark: "EmphasisMark" },
  StrongEmphasis: { type: "strong", mark: "EmphasisMark" },
  Strikethrough: { type: "strikethrough", mark: "StrikethroughMark" },
  Highlight: { type: "highlight", mark: "HighlightMark" },
  Superscript: { type: "superscript", mark: "SuperscriptMark" },
  Subscript: { type: "subscript", mark: "SubscriptMark" },
  InlineCode: { type: "code", mark: "CodeMark" },
  InlineMath: { type: "math", mark: "InlineMathMark" },
};

const ATOMS: Record<string, FragmentType> = {
  HTMLTag: "html",
  Comment: "comment",
  ProcessingInstruction: "html",
  Entity: "entity",
  HardBreak: "hardBreak",
  Emoji: "emoji",
  URL: "url",
};

function childList(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) result.push(child);
  return result;
}

function range(node: SyntaxNode): Range {
  return { from: node.from, to: node.to };
}

function convertChildren(nodes: SyntaxNode[], text: string): Fragment[] {
  const result: Fragment[] = [];
  for (const node of nodes) {
    const fragment = convert(node, text);
    if (fragment) result.push(fragment);
  }
  return result;
}

function convertLink(node: SyntaxNode, text: string, image: boolean): Fragment {
  const parts = childList(node);
  const marks = parts.filter((part) => part.name === "LinkMark");
  const open = marks[0];
  const close = marks.find((mark) => text.slice(mark.from, mark.to) === "]");
  const content = open && close ? { from: open.to, to: close.from } : null;
  const inner = content ? parts.filter((part) => part.from >= content.from && part.to <= content.to && part.name !== "LinkMark") : [];
  const url = parts.find((part) => part.name === "URL");
  const title = parts.find((part) => part.name === "LinkTitle");
  const labelNode = parts.find((part) => part.name === "LinkLabel");
  const fragment: Fragment = {
    type: image ? "image" : "link",
    from: node.from,
    to: node.to,
    marks: [],
    content,
    atomic: image,
    children: image ? [] : convertChildren(inner, text),
  };
  // 文字之外的部分都是标记：`[`、`](地址 "标题")`、`][标签]`
  if (content) {
    fragment.marks.push({ from: node.from, to: content.from }, { from: content.to, to: node.to });
  } else {
    fragment.marks.push(range(node));
  }
  if (url) fragment.url = range(url);
  if (title) fragment.title = range(title);
  if (labelNode) {
    const label = { from: labelNode.from + 1, to: labelNode.to - 1 };
    fragment.label = label.to > label.from ? label : content ?? undefined;
  } else if (!url && content && !text.slice(content.to).startsWith("](")) {
    // 简写的引用 `[文字]`
    fragment.label = content;
  }
  return fragment;
}

function convert(node: SyntaxNode, text: string): Fragment | null {
  const simple = SIMPLE[node.name];
  if (simple) {
    const parts = childList(node);
    const marks = parts.filter((part) => part.name === simple.mark);
    const first = marks[0];
    const last = marks[marks.length - 1];
    const content = first && last && last !== first ? { from: first.to, to: last.from } : null;
    const inner = content ? parts.filter((part) => part.name !== simple.mark && part.from >= content.from && part.to <= content.to) : [];
    const literal = simple.type === "code" || simple.type === "math";
    return {
      type: simple.type,
      from: node.from,
      to: node.to,
      marks: marks.map(range),
      content,
      atomic: simple.type === "math",
      children: literal ? [] : convertChildren(inner, text),
    };
  }
  switch (node.name) {
    case "Link":
      return convertLink(node, text, false);
    case "Image":
      return convertLink(node, text, true);
    case "Autolink": {
      const url = childList(node).find((part) => part.name === "URL");
      return {
        type: "autolink",
        from: node.from,
        to: node.to,
        marks: [
          { from: node.from, to: node.from + 1 },
          { from: node.to - 1, to: node.to },
        ],
        content: { from: node.from + 1, to: node.to - 1 },
        atomic: false,
        children: [],
        url: url ? range(url) : { from: node.from + 1, to: node.to - 1 },
      };
    }
    case "Escape":
      return {
        type: "escape",
        from: node.from,
        to: node.to,
        marks: [{ from: node.from, to: node.from + 1 }],
        content: { from: node.from + 1, to: node.to },
        atomic: false,
        children: [],
      };
    case "FootnoteReference": {
      const label = childList(node).find((part) => part.name === "FootnoteLabel");
      return {
        type: "footnoteReference",
        from: node.from,
        to: node.to,
        marks: [range(node)],
        content: null,
        atomic: true,
        children: [],
        label: label ? range(label) : undefined,
      };
    }
    default: {
      const type = ATOMS[node.name];
      if (!type) return null;
      return {
        type,
        from: node.from,
        to: node.to,
        marks: type === "url" ? [] : [range(node)],
        content: type === "url" ? range(node) : null,
        atomic: type !== "url" && type !== "hardBreak",
        children: [],
        ...(type === "url" ? { url: range(node) } : {}),
      };
    }
  }
}

function parseFragments(text: string, syntax: SyntaxOptions): Fragment[] {
  const tree = inlineParser(syntax).parse(text);
  const fragments: Fragment[] = [];
  for (let block = tree.topNode.firstChild; block; block = block.nextSibling) {
    fragments.push(...convertChildren(childList(block), text));
  }
  return fragments;
}

/** 引用式的链接、图片（没有地址，靠标签找定义） */
function undefinedReferences(fragments: Fragment[], text: string, isDefined: (label: string) => boolean): Fragment[] {
  const result: Fragment[] = [];
  walkFragments(fragments, (fragment) => {
    if ((fragment.type === "link" || fragment.type === "image") && !fragment.url && fragment.label) {
      if (!isDefined(text.slice(fragment.label.from, fragment.label.to))) result.push(fragment);
    }
  });
  return result;
}

/**
 * 文本块原文的行内片段（按位置排序，嵌套的在 children 里）。
 * 给了 isDefined 时，标签没有定义的引用式链接按 CommonMark 是普通文字：把它的方括号换成同样长度的 `{` `}` 再解析，
 * 外层的方括号才能组成链接（如 `[API [v2]](地址)`）。Lezer 不知道文档里有哪些定义，没给时都当成链接
 */
export function inlineFragments(text: string, syntax?: Partial<SyntaxOptions>, isDefined?: (label: string) => boolean): Fragment[] {
  if (!text) return [];
  const options = resolveSyntax(syntax);
  let masked = text;
  for (let round = 0; ; round += 1) {
    const fragments = parseFragments(masked, options);
    const unresolved = isDefined && round < 16 ? undefinedReferences(fragments, text, isDefined) : [];
    if (!unresolved.length) return fragments;
    const chars = [...masked];
    // 按码元替换：方括号都是单个码元，长度不变
    let next = "";
    let offset = 0;
    for (const char of chars) {
      const inMark = unresolved.some((fragment) => fragment.marks.some((mark) => offset >= mark.from && offset < mark.to));
      next += inMark && char === "[" ? "{" : inMark && char === "]" ? "}" : char;
      offset += char.length;
    }
    masked = next;
  }
}

/** 按位置依次访问所有片段（含嵌套的） */
export function walkFragments(fragments: Fragment[], visit: (fragment: Fragment, depth: number) => void, depth = 0): void {
  for (const fragment of fragments) {
    visit(fragment, depth);
    walkFragments(fragment.children, visit, depth + 1);
  }
}

/** 包含 position 的各层片段，从外到内（E-2：光标所在的每一层都展开） */
export function fragmentsAt(fragments: Fragment[], position: number): Fragment[] {
  const result: Fragment[] = [];
  let level = fragments;
  for (;;) {
    const hit = level.find((fragment) => fragment.from <= position && position <= fragment.to);
    if (!hit) return result;
    result.push(hit);
    level = hit.children;
  }
}

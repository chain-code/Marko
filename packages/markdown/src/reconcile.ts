// 不变式（1.5.5 节）：编辑后把受影响的顶层块（连同前后各一个）序列化再解析；
// 结构和现在不同时给出替换，让文档的结构总是和它的 Markdown 重新解析的结果一致
import { blockChildren, getOrigin, inheritOrigin, isBlankParagraph, isContainer, isLeaf, nodeText, setOrigin, type MdNode, type Origin } from "./model.ts";
import { parse, type ParseOptions } from "./parse.ts";
import { serializeRange } from "./serialize.ts";
import { isFrontMatterOpening } from "./syntax/blocks.ts";
import { readMathClosing, readMathOpening } from "./syntax/math.ts";

/**
 * 公式块的配对是全局的（Typora：`$$` 后面任何地方有结尾就算，见 syntax/math.ts）。
 * 文本块里有一行像开头围栏、而它后面还有能当结尾的行时，说明配对变了，局部重新解析不够
 */
function mathPairingStale(doc: MdNode): boolean {
  const leaves: MdNode[] = [];
  const walk = (node: MdNode) => {
    if (isLeaf(node.type)) leaves.push(node);
    else for (const child of blockChildren(node)) walk(child);
  };
  walk(doc);
  let dollarAfter = false;
  let bracketAfter = false;
  for (let index = leaves.length - 1; index >= 0; index -= 1) {
    const leaf = leaves[index];
    if (leaf.type === "mathBlock") {
      const open = String(leaf.attrs?.open ?? "").trim();
      const bracket = open.startsWith("\\[");
      // 容器结束时没闭合的公式块靠后面某处的结尾才成立；后面已经没有结尾了，重新解析就不是公式块
      if (leaf.attrs?.close === null && !(bracket ? bracketAfter : dollarAfter)) return true;
      if (readMathClosing(open, 0, "dollar")) dollarAfter = true;
      if (leaf.attrs?.close !== null && bracket) bracketAfter = true;
      continue;
    }
    if (!isTextblockLike(leaf)) continue;
    const lines = nodeText(leaf).split("\n");
    for (let line = lines.length - 1; line >= 0; line -= 1) {
      const content = lines[line].replace(/^ {0,3}/, "");
      const opening = readMathOpening(content, 0);
      if (opening && (opening.kind === "dollar" ? dollarAfter : bracketAfter)) return true;
      if (readMathClosing(content, 0, "dollar")) dollarAfter = true;
      if (readMathClosing(content, 0, "bracket")) bracketAfter = true;
    }
  }
  return false;
}

function containsUnclosedMath(node: MdNode): boolean {
  if (node.type === "mathBlock") return node.attrs?.close === null;
  return !isLeaf(node.type) && blockChildren(node).some(containsUnclosedMath);
}

function isTextblockLike(node: MdNode): boolean {
  return node.type === "paragraph" || node.type === "heading" || node.type === "definitionTerm";
}

export interface Replacement {
  /** 替换文档的第 from 到 to（不含）个顶层块 */
  from: number;
  to: number;
  blocks: MdNode[];
  /** 文档末尾的空行也变了（被没闭合的块吞进去了）时，新的末尾 */
  tail?: string;
  /**
   * 替换范围后面第一个保留下来的块要换的出身（接上新的前一个兄弟；块前空行用这次解析的）。下标是替换前的。
   * 原来那个节点的出身不改（旧文档、撤销记录还在用它），调用方把这个块换成带新出身的副本
   */
  next?: { index: number; origin: Origin };
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameValue(value, right[index]));
  }
  return false;
}

function visible(nodes: MdNode[]): MdNode[] {
  return nodes.filter((node) => !isBlankParagraph(node));
}

/**
 * 这些写法属性为 null 时表示「没指定」（编辑器新建的节点、没有结尾围栏的块补上结尾），序列化时按默认写法生成，
 * 比较结构时不算不同。别的属性的 null 有含义（如 checked 为 null 是「不是任务」），照常比较
 */
const UNSPECIFIED_WHEN_NULL = new Set(["marker", "spacing", "indent", "openSpacing", "closing", "underline", "fence", "open", "close", "bullet", "delimiter"]);

/** 结构相同：类型、文字、写法属性都相同；current 里的空段落不算（序列化时不输出） */
export function sameStructure(current: MdNode, fresh: MdNode): boolean {
  if (current.type !== fresh.type) return false;
  const keys = new Set([...Object.keys(current.attrs ?? {}), ...Object.keys(fresh.attrs ?? {})]);
  for (const key of keys) {
    const value = current.attrs?.[key];
    if ((value === null || value === undefined) && UNSPECIFIED_WHEN_NULL.has(key)) continue;
    if (!sameValue(value ?? null, fresh.attrs?.[key] ?? null)) return false;
  }
  if (isLeaf(current.type)) return nodeText(current) === nodeText(fresh);
  const left = visible(blockChildren(current));
  const right = visible(blockChildren(fresh));
  return left.length === right.length && left.every((child, index) => sameStructure(child, right[index]));
}

/** 像公式块围栏的行：源码改动里有这样的行时，配对可能变到很远，整篇重新解析 */
const MATH_FENCE_LINE = /^[ \t>]*(?:\$\$|\\\[|\\\])/m;

/**
 * 文档的第 from 到 to（不含）个顶层块改过以后调用。返回 null 表示结构没变；
 * 否则返回要替换的那几个块（尽量少：前后没变的块不替换，保留原来的节点）。
 *
 * text：编辑器按源码改动时（editor 包的命令）给出这几块的新源码，从第 from 块的块前空行开始；
 * to 是文档末尾时包括末尾的空行。这时这几块一定换成新解析的（块前空行、写法可能变了，结构比较看不出来）
 */
export function reconcile(doc: MdNode, from: number, to: number, options: ParseOptions = {}, text?: string): Replacement | null {
  const blocks = blockChildren(doc);
  const docTailText = getOrigin(doc)?.tail ?? "";
  let start = Math.max(0, from - 1);
  let end = Math.min(blocks.length, Math.max(to, from) + 1);
  /** 第 start 到 end 块的源码（到了文档末尾时带上末尾的空行：没闭合的围栏会把它们也算进内容） */
  const sourceOf = (rangeStart: number, rangeEnd: number): string => {
    const atEnd = rangeEnd === blocks.length;
    if (text === undefined) return serializeRange(doc, rangeStart, rangeEnd, true, atEnd ? docTailText : undefined);
    return (
      serializeRange(doc, rangeStart, from) +
      text +
      (to < blocks.length ? serializeRange(doc, to, rangeEnd, true, atEnd ? docTailText : undefined) : "")
    );
  };
  // 文档开头变成了 `---`：结尾的 `---` 可能在很后面，要整篇重新解析才知道是不是 Front Matter
  const firstShown = blocks.findIndex((block) => !isBlankParagraph(block));
  if (text !== undefined) {
    if (start === 0 && isFrontMatterOpening(sourceOf(0, end).split(/\r\n|\r|\n/)[0])) end = blocks.length;
  } else if (
    start === 0 &&
    firstShown >= 0 &&
    blocks[firstShown].type !== "frontMatter" &&
    isFrontMatterOpening(serializeRange(doc, 0, firstShown + 1).split(/\r\n|\r|\n/)[0])
  ) {
    end = blocks.length;
  }
  if (options.syntax?.math !== false) {
    if ((text !== undefined && MATH_FENCE_LINE.test(text)) || mathPairingStale(doc)) {
      start = 0;
      end = blocks.length;
    } else if (blocks.slice(start, end).some(containsUnclosedMath)) {
      // 片段里有靠后面的结尾才成立的公式块：把结尾也带进来
      end = blocks.length;
    }
  }
  if (text !== undefined) {
    start = Math.min(start, from);
    end = Math.max(end, to);
  }
  let slice: MdNode[];
  let shown: number[];
  let fresh: MdNode[];
  let docTail: string | undefined;
  let parsed!: MdNode;
  for (;;) {
    slice = blocks.slice(start, end);
    shown = slice.flatMap((block, index) => (isBlankParagraph(block) ? [] : [index]));
    const atEnd = end === blocks.length;
    parsed = parse(sourceOf(start, end), { ...options, frontMatter: start === 0 });
    fresh = blockChildren(parsed);
    docTail = atEnd ? (getOrigin(parsed)?.tail ?? "") : undefined;
    // 片段的最后一块变了（没闭合的围栏、HTML 注释吞掉了后面的内容），往后多带一块再看
    const last = shown.length ? slice[shown[shown.length - 1]] : undefined;
    const freshLast = fresh[fresh.length - 1];
    if (end < blocks.length && last && (!freshLast || !sameStructure(last, freshLast))) {
      end += 1;
      continue;
    }
    break;
  }

  const current = shown.map((index) => slice[index]);
  // 按源码改动时，改动的那几块（含其中的空段落）一定换掉：前后保留的块只能在它们外面
  const keepBefore = text === undefined ? current.length : shown.filter((index) => start + index < from).length;
  const keepAfter = text === undefined ? current.length : shown.filter((index) => start + index >= to).length;
  /**
   * 能保留原来的节点：结构相同；容器还要原文相同。解析可能把后面的行并进了容器的结尾（如引用末尾补了一行 `>`），
   * 结构比较看不出来，保留旧节点这一行就丢了
   */
  const keeps = (currentIndex: number, freshIndex: number): boolean => {
    const block = current[currentIndex];
    if (!sameStructure(block, fresh[freshIndex])) return false;
    // 输入了内容的光标占位段落：它的块前空行是从后面那段空行里切出来的（Origin.placeholder），后面那段（如文末空行）
    // 换成这次解析的以后就切了两遍。换成解析出来的普通段落
    if (getOrigin(block)?.placeholder) return false;
    if (!isContainer(block.type)) return true;
    const at = start + shown[currentIndex];
    return serializeRange(doc, at, at + 1, false) === serializeRange(parsed, freshIndex, freshIndex + 1, false);
  };
  let head = 0;
  while (head < keepBefore && head < current.length && head < fresh.length && keeps(head, head)) head += 1;
  const currentTail = docTailText;
  if (text === undefined && head === current.length && head === fresh.length && (docTail === undefined || docTail === currentTail)) return null;
  let tail = 0;
  while (
    tail < keepAfter &&
    tail < current.length - head &&
    tail < fresh.length - head &&
    keeps(current.length - 1 - tail, fresh.length - 1 - tail)
  ) {
    tail += 1;
  }
  // 换算回 slice 里的下标：前后保留的块之间的空段落一起换掉
  let replaceFrom = start + (head > 0 ? shown[head - 1] + 1 : 0);
  let replaceTo = start + (tail > 0 ? shown[current.length - tail] : slice.length);
  if (text !== undefined) {
    replaceFrom = Math.min(replaceFrom, from);
    replaceTo = Math.max(replaceTo, to);
  }
  const middle = fresh.slice(head, fresh.length - tail);

  // 新块接上原来的前一个兄弟；后面保留的那个块改认新的前一个兄弟，块前空行用这次序列化的
  let previous: MdNode | null = null;
  for (let index = replaceFrom - 1; index >= 0 && !previous; index -= 1) if (!isBlankParagraph(blocks[index])) previous = blocks[index];
  const previousId = previous ? (getOrigin(previous)?.id ?? -1) : 0;
  let lastId = previousId;
  middle.forEach((block, index) => {
    const origin = getOrigin(block);
    if (!origin) return;
    if (index === 0) origin.prevId = previousId;
    lastId = origin.id;
  });
  let nextIndex = -1;
  for (let index = replaceTo; index < blocks.length && nextIndex < 0; index += 1) if (!isBlankParagraph(blocks[index])) nextIndex = index;
  const nextOrigin = nextIndex >= 0 ? getOrigin(blocks[nextIndex]) : undefined;
  let renewed: Replacement["next"];
  if (nextOrigin) {
    const before = tail > 0 ? getOrigin(fresh[fresh.length - tail])?.before : undefined;
    // 出身对象是旧文档共用的（撤销靠它恢复原文，E-6），不能就地改：给这个块一个新出身，由调用方换上
    if (nextOrigin.prevId !== lastId || (before !== undefined && before !== nextOrigin.before)) {
      renewed = { index: nextIndex, origin: { ...nextOrigin, prevId: lastId, ...(before !== undefined ? { before } : {}) } };
    }
  }
  return {
    from: replaceFrom,
    to: replaceTo,
    blocks: middle,
    ...(docTail !== undefined && docTail !== currentTail ? { tail: docTail } : {}),
    ...(renewed ? { next: renewed } : {}),
  };
}

/** 把替换应用到文档上，返回新文档（文档节点沿用原来的出身；后面那个块要换出身时换成一个副本，原来的节点不动） */
export function applyReplacement(doc: MdNode, replacement: Replacement): MdNode {
  const blocks = blockChildren(doc);
  const content = [...blocks.slice(0, replacement.from), ...replacement.blocks, ...blocks.slice(replacement.to)];
  if (replacement.next) {
    const index = replacement.next.index - replacement.to + replacement.from + replacement.blocks.length;
    const copy: MdNode = { ...content[index] };
    setOrigin(copy, replacement.next.origin);
    content[index] = copy;
  }
  const next: MdNode = { ...doc, content };
  inheritOrigin(next, doc);
  const origin = getOrigin(next);
  if (replacement.tail !== undefined && origin) origin.tail = replacement.tail;
  return next;
}

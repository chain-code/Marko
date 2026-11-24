// 按源码改动（第 2 章的大部分编辑行为是按 Markdown 源码定义的：回车续写列表符号、退格去掉块标记……）。
// 命令拿到整篇源码和选区（readSource），给出改好的源码和新选区；applySource 把改动涉及的顶层块交给
// @marko/markdown 的 reconcile 按新源码重新解析、替换，选区按源码偏移换回去（1.5.5、1.5.6 节）。
// 光标落在不属于任何块的空行上时（如退出列表后留下的空行），在那里放一个光标占位空段落（Origin.placeholder）：
// 它还空着时序列化出来正好是那一行，输入了内容就是一个新段落
import { getOrigin, inheritOrigin, isBlankParagraph, placeholderOrigin, reconcile, setOrigin, type ParseOptions } from "@marko/markdown";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { AllSelection, NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { CellSelection, cellAround } from "@tiptap/pm/tables";
import { Transform } from "@tiptap/pm/transform";
import { lineAt, lineStartOf, looksLikeThematicBreak, type SourceResult, type SourceState } from "./commands/text.ts";

export type { SourceResult, SourceState } from "./commands/text.ts";
import { SKIP_RECONCILE } from "./plugins/meta.ts";
import { buildDocSourceMap, keepBlankAt, parseToProseMirror, positionToOffset, renewOrigin, toModel, toProseMirror, type DocSourceMap } from "./state.ts";

export interface SourceSnapshot extends SourceState {
  map: DocSourceMap;
}

/** 整篇源码和选区；光标所在的空段落也输出（它有位置） */
export function readSource(state: EditorState): SourceSnapshot {
  const { anchor, head } = state.selection;
  const map = buildDocSourceMap(state.doc, { keepBlank: keepBlankAt(anchor, head) });
  return { text: map.map.text, ...selectionOffsets(state.selection, map), eol: String(state.doc.attrs.eol ?? "\n"), map };
}

/**
 * 选区两端的源码偏移。节点选区（分隔线、目录）是这个块的原文；单元格选区（T-5）从第一个格的内容到最后一个格的内容
 * （按文档顺序，反向的照反向）。命令按源码改单元格选区会弄坏表格，run.ts 只让认单元格的命令在它上面执行
 */
export function selectionOffsets(selection: EditorState["selection"], map: DocSourceMap): { anchor: number; head: number } {
  if (selection instanceof NodeSelection) {
    const range = map.map.ranges.get(toModel(selection.node));
    if (range) return { anchor: range.start, head: range.end };
  }
  if (selection instanceof CellSelection) {
    const forward = selection.$anchorCell.pos <= selection.$headCell.pos;
    const cellEdge = (cellPos: number, atEnd: boolean) => {
      const cell = selection.$anchorCell.doc.nodeAt(cellPos);
      return positionToOffset(map, cellPos + 1 + (atEnd && cell ? cell.content.size : 0));
    };
    return { anchor: cellEdge(selection.$anchorCell.pos, !forward), head: cellEdge(selection.$headCell.pos, forward) };
  }
  return { anchor: positionToOffset(map, selection.anchor), head: positionToOffset(map, selection.head) };
}

/**
 * 删掉、换掉选中的内容时要删的源码（退格、剪切、粘贴、在跨块的选区上输入）。命令看到的选区（selectionOffsets）只到文字为止，
 * 删的时候还要连同标记（审查 #7）：
 * - 全选（AllSelection，Mod-a）：整篇，连同开头、结尾的分隔线、目录；
 * - 一头在表格、代码块这类块的内容边上、另一头在块外面：这个块整个删掉，不留行尾的 ` |`、结尾的围栏
 */
export function removalOffsets(selection: EditorState["selection"], map: DocSourceMap): { anchor: number; head: number } {
  const offsets = selectionOffsets(selection, map);
  const length = map.map.text.length;
  if (selection instanceof AllSelection) return selection.anchor <= selection.head ? { anchor: 0, head: length } : { anchor: length, head: 0 };
  if (selection.empty || selection instanceof NodeSelection || selection instanceof CellSelection) return offsets;
  const forward = selection.anchor <= selection.head;
  const from = Math.min(forward ? offsets.anchor : offsets.head, closedBlockEdge(map, selection, "start") ?? Infinity);
  const to = Math.max(forward ? offsets.head : offsets.anchor, closedBlockEdge(map, selection, "end") ?? -Infinity);
  return forward ? { anchor: from, head: to } : { anchor: to, head: from };
}

/** 源码里内容后面（前面）还有标记的块：表格行尾的 ` |`、代码块和公式块的围栏、HTML 块、Front Matter 的分隔栏 */
const CLOSED_BLOCKS = new Set(["table", "codeBlock", "mathBlock", "htmlBlock", "frontMatter"]);

/**
 * 选区的一头（side）在这种块的内容边上、另一头在块外面：这个块整个选中，返回它（最外层那个）在源码里的起点或终点。
 * 否则删掉选中的内容时留下 ` |`、结尾围栏（审查 #7）
 */
function closedBlockEdge(map: DocSourceMap, selection: EditorState["selection"], side: "start" | "end"): number | null {
  const doc = selection.$anchor.doc;
  const { from, to } = selection;
  const $pos = side === "end" ? selection.$to : selection.$from;
  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    if (!CLOSED_BLOCKS.has(node.type.name)) continue;
    const start = $pos.before(depth);
    const end = $pos.after(depth);
    const outside = side === "end" ? from < start : to > end;
    // 这一头和块的内容边之间没有别的内容（空的格子不算）
    const atEdge = side === "end" ? doc.textBetween(to, end - 1, "", "x") === "" : doc.textBetween(start + 1, from, "", "x") === "";
    if (!outside || !atEdge) continue;
    const range = map.map.ranges.get(toModel(node));
    if (range) return side === "end" ? range.end : range.start;
  }
  return null;
}

/** 两段文字相同的开头、结尾的长度（不重叠；不从 \r\n 中间切开） */
function commonEnds(left: string, right: string): { prefix: number; suffix: number } {
  const limit = Math.min(left.length, right.length);
  let prefix = 0;
  while (prefix < limit && left.charCodeAt(prefix) === right.charCodeAt(prefix)) prefix += 1;
  if (prefix > 0 && left[prefix - 1] === "\r") prefix -= 1;
  let suffix = 0;
  while (suffix < limit - prefix && left.charCodeAt(left.length - 1 - suffix) === right.charCodeAt(right.length - 1 - suffix)) suffix += 1;
  if (suffix > 0 && left[left.length - suffix] === "\n" && left[left.length - suffix - 1] === "\r") suffix -= 1;
  return { prefix, suffix };
}

/** 文档换了以后带上原来的出身（文末空行等在上面） */
function carryDocOrigin(tr: Transaction, origin: ReturnType<typeof getOrigin>): void {
  setOrigin(tr.doc, origin);
}

/**
 * 把源码改动应用到文档上：改动涉及的顶层块按新源码重新解析、替换，选区换回去。
 * 返回的事务带 SKIP_RECONCILE（已经对齐过了）
 */
export function applySource(state: EditorState, before: SourceSnapshot, result: SourceResult, parse: ParseOptions = {}, into?: Transaction): Transaction {
  // into：Tiptap 命令给的事务（从同一个状态开始，还没有步骤）
  const tr = into ?? state.tr;
  const docOrigin = getOrigin(state.doc);
  if (before.text !== result.text) {
    const doc = state.doc;
    const map = before.map.map;
    const { prefix, suffix } = commonEnds(before.text, result.text);
    const changeFrom = prefix;
    const changeTo = before.text.length - suffix;
    // 行内命令只改了一个文本块里某一行的文字：直接改这个文本块，结构交给对齐插件（它会按 E-4 暂缓转换）
    const inserted = result.text.slice(changeFrom, result.text.length - suffix);
    // 光标在段落里、那一行（连同容器的标记）改完像分隔线：也先只改文字，转不转换交给对齐插件（E-4：分隔线按回车才转换。
    // 例：嵌套列表 `* * *` 后面输入空格，按块重新解析会变成分隔线，光标落在分隔线上，下一个字把它换掉）
    const headLine = lineAt(result.text, result.head);
    const inParagraph = state.selection.$head.parent.type.name === "paragraph";
    const textOnly = result.inline || (inParagraph && looksLikeThematicBreak(result.text.slice(headLine.start, headLine.end)));
    if (textOnly && !/[\r\n]/.test(inserted) && !/[\r\n]/.test(before.text.slice(changeFrom, changeTo))) {
      const target = lineEditTarget(before.map, changeFrom, changeTo);
      // 先在副本上试：改完的文本块序列化出来要正好是新源码（续行的前缀、列表符号前后的空格可能不一样）。
      // 用单独的 Transform（Tiptap 命令里 state.tr 就是命令自己的事务）
      const trial = target ? new Transform(state.doc) : null;
      if (trial && target) {
        if (inserted) trial.replaceWith(target.from, target.to, state.schema.text(inserted));
        else trial.delete(target.from, target.to);
        // 新对象带上出身（真正的事务由对齐插件的 inheritOrigins 带上）：外层容器原样，文本块标成内容改过
        const $old = state.doc.resolve(target.from);
        const $new = trial.doc.resolve(target.from);
        for (let depth = 0; depth < $old.depth; depth += 1) setOrigin($new.node(depth), getOrigin($old.node(depth)));
        inheritOrigin($new.parent, $old.parent);
        const keep = lineEditTarget(before.map, before.head, before.head);
        const text = buildDocSourceMap(trial.doc, { keepBlank: keep ? keepBlankAt(trial.mapping.map(keep.from)) : undefined }).map.text;
        if (text === result.text) {
          if (inserted) tr.insertText(inserted, target.from, target.to);
          else tr.delete(target.from, target.to);
          carryDocOrigin(tr, docOrigin);
          placeSelection(tr, state.schema, result.anchor, result.head);
          return tr;
        }
      }
    }
    const ranges: Array<{ gapStart: number; start: number; end: number } | null> = [];
    doc.forEach((child) => ranges.push(map.ranges.get(toModel(child)) ?? null));
    const count = doc.childCount;
    // 改动碰到的顶层块（含块前空行；正好在边界上的两块都算）
    let from = -1;
    let to = -1;
    ranges.forEach((range, index) => {
      if (!range || range.gapStart > changeTo || range.end < changeFrom) return;
      if (from < 0) from = index;
      to = index + 1;
    });
    let lastShown = count - 1;
    while (lastShown >= 0 && !ranges[lastShown]) lastShown -= 1;
    if (from < 0) {
      // 只改了文档末尾的空行，或文档里没有输出的块
      from = Math.max(0, lastShown);
      to = count;
    }
    // 到了最后一个输出的块：连同后面的空段落和文末空行一起
    if (to > lastShown) to = count;
    const docStart = 0;
    /** 第 index 块前面最近一个输出的块的结尾（没有时是文档开头） */
    const endBefore = (index: number): number => {
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        const range = ranges[previous];
        if (range) return range.end;
      }
      return docStart;
    };
    /** 从第 index 块开始重新解析时窗口的起点：它的块前空行开头；它不输出时是前面最近一个输出的块的结尾 */
    const windowStartOf = (index: number): number => ranges[index]?.gapStart ?? endBefore(index);
    // 改动在第一个碰到的块的块前空行前面（例：光标占位段落在文末空行后面，文末空行不属于任何块，删掉占位那一行
    // 会删到文末空行）：往前多带几块，到文档开头为止
    let windowStart = windowStartOf(from);
    while (changeFrom < windowStart && from > 0) {
      from -= 1;
      windowStart = windowStartOf(from);
    }
    if (changeFrom < windowStart) windowStart = docStart;
    // 窗口到了文档末尾：新解析出来的文末空行要换掉原来的，窗口得包住整段文末空行。光标占位段落在文末空行后面时
    // 它的块前空行里没有文末空行（例：空文档里连按两次回车，第一个换行就丢了），从前面最近一个输出的块的结尾算起
    if (to === count) windowStart = Math.min(windowStart, endBefore(from));
    const oldEnd = to === count ? before.text.length : (ranges[to - 1]?.end ?? windowStart);
    if (changeFrom < windowStart || changeTo > oldEnd) throw new Error(`源码改动超出了顶层块的范围：改动 ${changeFrom}～${changeTo}，范围 ${windowStart}～${oldEnd}`);
    const windowText = result.text.slice(windowStart, oldEnd + (result.text.length - before.text.length));
    const replacement = reconcile(toModel(doc), from, to, parse, windowText);
    if (replacement) {
      const starts: number[] = [];
      doc.forEach((_child, offset) => starts.push(offset));
      const fromPos = starts[replacement.from] ?? doc.content.size;
      const toPos = replacement.to < count ? starts[replacement.to] : doc.content.size;
      const blocks = replacement.blocks.map((block) => toProseMirror(state.schema, block));
      if (blocks.length || fromPos !== toPos) tr.replaceWith(fromPos, toPos, blocks);
      if (replacement.next) renewOrigin(tr, tr.mapping.map(starts[replacement.next.index]), replacement.next.origin);
      // 出身对象是旧文档共用的（撤销还要用），换文末空行时复制一份
      if (docOrigin && replacement.tail !== undefined) carryDocOrigin(tr, { ...docOrigin, tail: replacement.tail });
      else carryDocOrigin(tr, docOrigin);
      // 文档里一块都不剩时放一个空段落（ProseMirror 要求至少一块）
      if (tr.doc.childCount === 0) {
        const origin = getOrigin(tr.doc);
        tr.insert(0, state.schema.nodes.paragraph.create());
        carryDocOrigin(tr, origin);
      }
    }
  }
  placeSelection(tr, state.schema, result.anchor, result.head);
  // 按块对齐的结果和要的源码对不上（不该发生；随机测试在改得很乱的文档上偶尔丢一个空行）：整篇按新源码重新解析，
  // 接在同一个事务里（撤销时一起撤），写的字不能丢
  if (before.text !== result.text && sourceOf(tr) !== result.text) {
    const fresh = parseToProseMirror(state.schema, result.text, parse);
    tr.replaceWith(0, tr.doc.content.size, fresh.content);
    carryDocOrigin(tr, getOrigin(fresh));
    placeSelection(tr, state.schema, result.anchor, result.head);
  }
  tr.setMeta(SKIP_RECONCILE, true);
  return tr;
}

/** 事务改完以后文档的源码（光标所在的空段落也输出，同 readSource） */
function sourceOf(tr: Transaction): string {
  const { anchor, head } = tr.selection;
  return buildDocSourceMap(tr.doc, { keepBlank: keepBlankAt(anchor, head) }).map.text;
}

/**
 * 整篇按新源码重新解析（源码模式里按块对齐出了错、或结果和写的对不上时的退路：用户写的字不能丢）。
 * 文档节点的属性（BOM、换行符）不变；返回的事务带 SKIP_RECONCILE
 */
export function replaceSource(state: EditorState, text: string, anchor: number, head: number, parse: ParseOptions = {}): Transaction {
  const fresh = parseToProseMirror(state.schema, text, parse);
  const tr = state.tr.replaceWith(0, state.doc.content.size, fresh.content);
  carryDocOrigin(tr, getOrigin(fresh));
  placeSelection(tr, state.schema, anchor, head);
  tr.setMeta(SKIP_RECONCILE, true);
  return tr;
}

/** 源码范围 [from, to) 在某个文本块的同一行内容里时，对应的文档位置 */
function lineEditTarget(source: DocSourceMap, from: number, to: number): { from: number; to: number } | null {
  for (const block of source.blocks) {
    const leaf = source.map.byNode.get(block.model);
    if (!leaf) continue;
    let textOffset = 0;
    for (let line = 0; line < leaf.lines.length; line += 1) {
      const start = leaf.starts[line];
      const end = start + leaf.lines[line].length;
      if (from >= start && to <= end) {
        const base = block.pos + 1 + textOffset;
        return { from: base + (from - start), to: base + (to - start) };
      }
      textOffset += leaf.lines[line].length + 1;
    }
  }
  return null;
}

/** 源码偏移对应的文档位置放上选区；光标落在空行上时放一个光标占位空段落 */
export function placeSelection(tr: Transaction, schema: Schema, anchor: number, head: number, options: { cells?: boolean } = {}): void {
  const map = buildDocSourceMap(tr.doc);
  // 选区正好是分隔线、目录这一行（或连同行尾的换行）：选中这个块
  if (anchor !== head) {
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    const text = map.map.text;
    let atom: number | null = null;
    tr.doc.descendants((node, pos) => {
      if (atom !== null) return false;
      if (!node.isAtom || !node.isBlock) return true;
      const range = map.map.ranges.get(toModel(node));
      if (!range) return false;
      const lineStart = lineStartOf(text, range.start);
      const lineEnd = text.startsWith("\r\n", range.end) ? range.end + 2 : text[range.end] === "\n" ? range.end + 1 : range.end;
      if ((from === range.start && to === range.end) || (from === lineStart && to === lineEnd)) atom = pos;
      return false;
    });
    if (atom !== null) {
      tr.setSelection(NodeSelection.create(tr.doc, atom));
      return;
    }
  }
  const headSlot = findSlot(tr.doc, map, head);
  const anchorSlot = anchor === head ? headSlot : findSlot(tr.doc, map, anchor);
  // 原来是单元格选区（T-5）：两端还在同一张表的格子里时还是单元格选区
  if (options.cells && anchorSlot.kind === "text" && headSlot.kind === "text") {
    const $anchorCell = cellAround(tr.doc.resolve(anchorSlot.pos));
    const $headCell = cellAround(tr.doc.resolve(headSlot.pos));
    if ($anchorCell && $headCell && $anchorCell.start(-1) === $headCell.start(-1)) {
      tr.setSelection(new CellSelection($anchorCell, $headCell));
      return;
    }
  }
  // 选区的另一端落在空行上时取靠选区里面最近的文字（不为它放占位段落）
  let anchorPos =
    anchorSlot.kind === "text"
      ? anchorSlot.pos
      : anchor === head
        ? null
        : TextSelection.near(tr.doc.resolve(Math.min(anchorSlot.insertAt, tr.doc.content.size)), anchor < head ? 1 : -1).head;
  let headPos: number;
  if (headSlot.kind === "gap") {
    const before = tr.doc;
    const paragraph = schema.nodes.paragraph.create();
    setOrigin(paragraph, placeholderOrigin(headSlot.prevId, headSlot.before));
    if (headSlot.replace) tr.replaceWith(headSlot.insertAt, headSlot.insertAt + headSlot.replace, paragraph);
    else tr.insert(headSlot.insertAt, paragraph);
    // 插入点外面的各层容器都换成了新对象：出身原样带过去（多了一个空段落不影响它们的原文）
    const $old = before.resolve(headSlot.insertAt);
    const $new = tr.doc.resolve(headSlot.insertAt);
    for (let depth = 0; depth <= $old.depth; depth += 1) setOrigin($new.node(depth), getOrigin($old.node(depth)));
    headPos = headSlot.insertAt + 1;
    if (anchorPos !== null) anchorPos = tr.mapping.maps[tr.mapping.maps.length - 1].map(anchorPos, anchorPos <= headSlot.insertAt ? -1 : 1);
  } else {
    headPos = headSlot.pos;
  }
  tr.setSelection(TextSelection.between(tr.doc.resolve(anchorPos ?? headPos), tr.doc.resolve(headPos)));
}

interface TextSlot {
  kind: "text";
  pos: number;
}

interface GapSlot {
  kind: "gap";
  /** 占位段落插在这里 */
  insertAt: number;
  /** 这里原来有一个没输出的空段落（它的大小）：换成占位段落 */
  replace: number;
  prevId: number;
  before: string;
}

type Slot = TextSlot | GapSlot;

/** 能直接放段落的容器 */
const PARAGRAPH_HOLDERS = new Set(["doc", "blockquote", "alert", "listItem", "footnoteDefinition", "definitionDescription"]);

interface ChildInfo {
  node: PMNode;
  pos: number;
  range: { gapStart: number; start: number; end: number } | null;
}

/**
 * 源码偏移落在哪儿：文本块里（kind "text"），或者某个容器里两块之间、最后一块之后的空白里
 * （kind "gap"：占位段落插在哪、它的前一个兄弟和它的 before）
 */
function findSlot(doc: PMNode, source: DocSourceMap, offset: number): Slot {
  const { map } = source;
  const text = map.text;

  const childrenOf = (container: PMNode, contentPos: number): ChildInfo[] => {
    const children: ChildInfo[] = [];
    container.forEach((child, offsetInParent) => children.push({ node: child, pos: contentPos + offsetInParent, range: map.ranges.get(toModel(child)) ?? null }));
    return children;
  };

  // 光标这一行在光标前面的部分（容器前缀、缩进）：空行属于哪个容器看它
  const linePrefix = text.slice(lineStartOf(text, offset), offset).replace(/\r$/, "");
  const quoteOf = (value: string) => /^(?:[ \t]*>[ \t]?)*/.exec(value)?.[0] ?? "";
  const depthOf = (value: string) => (quoteOf(value).match(/>/g) ?? []).length;
  /**
   * 这一行写的是 node 的续行（同旧版的判断）：引用要有同样多层的 `>`；列表项、定义说明的续行比符号多缩进两列以上，
   * 脚注定义的续行缩进 4 列（或有 Tab）
   */
  const continues = (node: PMNode, range: { start: number }): boolean => {
    const inner = map.inner.get(toModel(node))?.prefix;
    if (inner === undefined) return false;
    if (linePrefix.startsWith(inner)) return true;
    if (depthOf(inner) !== depthOf(linePrefix)) return false;
    const rest = linePrefix.slice(quoteOf(linePrefix).length);
    const width = columnWidth(rest);
    switch (node.type.name) {
      case "blockquote":
      case "alert":
        return linePrefix.trimEnd() === inner.trimEnd();
      case "listItem": {
        const headLine = text.slice(lineStartOf(text, range.start), range.start);
        const markerColumn = columnWidth(headLine.slice(quoteOf(headLine).length)) + columnWidth(String(node.attrs.indent ?? ""));
        return width >= markerColumn + 2;
      }
      case "definitionDescription":
        return width >= 2;
      case "footnoteDefinition":
        return width >= 4 || rest.includes("\t");
      default:
        return false;
    }
  };

  /** 容器内容的起点（列表符号、脚注标签这些开头之后） */
  const contentStartOf = (node: PMNode, fallback: number): number => map.inner.get(toModel(node))?.contentStart ?? fallback;

  /** 容器里第 index 个子块的位置（index 等于子块数时是容器内容的末尾） */
  const gap = (container: PMNode, children: ChildInfo[], index: number, contentPos: number, contentStart: number): Slot => {
    let previous: ChildInfo | null = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (children[i].range) {
        previous = children[i];
        break;
      }
    }
    // 前一块是容器、这一行写着它的续行前缀：空行在它里面（如 `- item` 下一行的两个空格）
    if (previous?.range && !previous.node.isTextblock && !previous.node.isAtom) {
      let target: ChildInfo | null = previous;
      // 列表、定义列表看最后一项（定义列表的最后一块是定义说明时）
      if (["bulletList", "orderedList", "definitionList"].includes(previous.node.type.name)) {
        target = childrenOf(previous.node, previous.pos + 1).filter((child) => child.range).pop() ?? null;
      }
      if (target?.range && continues(target.node, target.range)) {
        const inner = childrenOf(target.node, target.pos + 1);
        return gap(target.node, inner, inner.length, target.pos + 1, contentStartOf(target.node, target.range.start));
      }
    }
    const insertAt = index < children.length ? children[index].pos : contentPos + container.content.size;
    const from = previous?.range ? previous.range.end : contentStart;
    const before = text.slice(from, Math.max(from, offset));
    // 容器第一块前面、和它在同一行（列表符号、引用的 `>` 这些开头里）：落到第一个文本块的开头，不另放占位段落。
    // 只有第一块从下一行开始、光标在符号那一行上时（如 `2. ` 下一行才是内容）才是空行
    if (!previous && container.type.name !== "doc") {
      const first = children.find((child) => child.range);
      if (first?.range && !text.slice(offset, first.range.start).includes("\n")) return { kind: "text", pos: firstText(doc, first.pos) };
    }
    // 别的子块之间也一样：光标在某一行的容器前缀里（`> `、续行的缩进），同一行后面就是下一块，落到下一块的开头。
    // 不放占位段落：它在前缀前面，输入、粘贴的字会插进前缀里，把后面的块弄坏（审查 #5）。表格的行、格另外处理
    if (container.type.name !== "table" && container.type.name !== "tableRow") {
      const next = children.slice(index).find((child) => child.range);
      if (next?.range && offset < next.range.start && !text.slice(offset, next.range.start).includes("\n")) return { kind: "text", pos: firstText(doc, next.pos) };
    }
    if (PARAGRAPH_HOLDERS.has(container.type.name)) {
      // 紧挨着的没输出的空段落（空容器里的、以前放的占位段落）：换成新的占位段落，不另加一个
      const blank = children.slice(previous ? children.indexOf(previous) + 1 : 0, index + 1).find((child) => !child.range && isBlankParagraph(toModel(child.node)));
      if (blank) return { kind: "gap", insertAt: blank.pos, replace: blank.node.nodeSize, prevId: previous ? (getOrigin(previous.node)?.id ?? -1) : 0, before };
      return { kind: "gap", insertAt, replace: 0, prevId: previous ? (getOrigin(previous.node)?.id ?? -1) : 0, before };
    }
    // 列表里两项之间、最后一项之后：放进前一项的末尾
    if ((container.type.name === "bulletList" || container.type.name === "orderedList") && previous?.range) {
      const item = previous.node;
      const itemChildren = childrenOf(item, previous.pos + 1);
      return gap(item, itemChildren, itemChildren.length, previous.pos + 1, contentStartOf(item, previous.range.start));
    }
    // 表格行里单元格之间（竖线、空白）：竖线前面的算前一格的末尾，后面的算后一格的开头
    if (container.type.name === "tableRow") {
      const next = children.slice(index).find((child) => child.range) ?? null;
      const endOf = (cell: ChildInfo) => cell.pos + cell.node.nodeSize - 1;
      if (!previous) return { kind: "text", pos: next ? next.pos + 1 : nearestText(doc, insertAt) };
      if (!next || !text.slice(previous.range?.end ?? 0, offset).includes("|")) return { kind: "text", pos: endOf(previous) };
      return { kind: "text", pos: next.pos + 1 };
    }
    // 表格某一行行首的前缀里（`> ` 这些）：落在这一行的第一格
    const nextRow = index < children.length ? children.slice(index).find((child) => child.range) : undefined;
    if (container.type.name === "table" && nextRow?.range && !text.slice(offset, nextRow.range.start).includes("\n")) {
      return { kind: "text", pos: firstText(doc, nextRow.pos + 1) };
    }
    // 表格的分隔行：落在上一行（表头）同一列的格里
    if (container.type.name === "table" && previous) {
      const cells = childrenOf(previous.node, previous.pos + 1).filter((child) => child.range);
      const line = text.slice(lineStartOf(text, offset), offset);
      const content = line.replace(/^[ \t]*(?:>[ \t]?)*/, "");
      const pipes = (content.match(/(?<!\\)\|/g) ?? []).length;
      const column = Math.min(Math.max(0, content.trimStart().startsWith("|") ? pipes - 1 : pipes), cells.length - 1);
      const cell = cells[column];
      if (cell) return { kind: "text", pos: cell.pos + cell.node.nodeSize - 1 };
    }
    return { kind: "text", pos: nearestText(doc, Math.max(0, insertAt - 1)) };
  };

  const visit = (container: PMNode, contentPos: number, containerStart: number): Slot => {
    const children = childrenOf(container, contentPos);
    const firstRanged = children.find((child) => child.range);
    // 空容器（`- `、`> `、空文档）里解析时放的空段落：光标就放在它里面（它输出时正好在容器开头）
    if (!firstRanged) {
      const blank = children.find((child) => child.node.isTextblock);
      if (blank) return { kind: "text", pos: blank.pos + 1 };
    }
    const contentStart = firstRanged?.range ? firstRanged.range.gapStart : containerStart;
    for (let index = 0; index < children.length; index += 1) {
      const { node, pos, range } = children[index];
      if (!range) continue;
      if (offset < range.start) return gap(container, children, index, contentPos, contentStart);
      if (offset > range.end) continue;
      if (node.isTextblock) return { kind: "text", pos: textPosition(source, node, pos, offset) };
      if (node.isAtom || node.isLeaf) return { kind: "text", pos: nearestText(doc, pos) };
      return visit(node, pos + 1, range.start);
    }
    return gap(container, children, children.length, contentPos, contentStart);
  };

  return visit(doc, 0, 0);
}

/** 一段空白占几列（Tab 按 4 列对齐） */
function columnWidth(value: string): number {
  let column = 0;
  for (const character of value) column += character === "\t" ? 4 - (column % 4) : 1;
  return column;
}

/** 文本块里源码偏移对应的位置 */
function textPosition(source: DocSourceMap, node: PMNode, pos: number, offset: number): number {
  const leaf = source.map.byNode.get(toModel(node));
  if (!leaf) return pos + 1;
  let textOffset = 0;
  for (let line = 0; line < leaf.lines.length; line += 1) {
    const start = leaf.starts[line];
    const length = leaf.lines[line].length;
    if (offset < start) break;
    if (offset <= start + length || line === leaf.lines.length - 1) {
      textOffset += Math.min(Math.max(0, offset - start), length);
      break;
    }
    textOffset += length + 1;
  }
  return pos + 1 + Math.min(textOffset, node.content.size);
}

/** pos 处的块里第一个能放光标的地方 */
function firstText(doc: PMNode, pos: number): number {
  const $pos = doc.resolve(Math.max(0, Math.min(pos + 1, doc.content.size)));
  return TextSelection.near($pos, 1).head;
}

/** pos 附近能放光标的地方 */
function nearestText(doc: PMNode, pos: number): number {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  return TextSelection.near($pos, -1).head;
}

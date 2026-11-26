// 编辑器的命令（菜单、快捷键、编辑器库的 API 都调它们）：名字同旧版的 EditorCommand（K-1 保持不变），
// 行为按源码定义（test/behavior/），实现在 commands/ 各文件里
import { Extension, type CommandProps, type Editor } from "@tiptap/core";
import { AllSelection, Plugin, TextSelection, type EditorState } from "@tiptap/pm/state";
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables";
import type { EditorSettings } from "../settings.ts";
import type { SourceResult } from "../source.ts";
import {
  adjustHeadingLevel,
  applyDefaultCodeLanguageOnFenceKey,
  formatMarkdownCodeBlock,
  formatMarkdownLines,
  formatMarkdownMathBlock,
  insertMarkdownAtSelection,
  insertMarkdownCalloutTemplate,
  insertMarkdownDiagramTemplate,
  insertMarkdownFootnoteTemplate,
  insertMarkdownHorizontalRule,
  insertMarkdownTocTemplate,
  prefixMarkdownLines,
  prefixNumberedMarkdownLines,
  setHeadingLevel,
  setParagraphText,
  setTaskStateAtSelection,
  toggleTaskAtSelection,
} from "./blocks.ts";
import {
  clearMarkdownFormatting,
  deleteCurrentStyleScope,
  insertMarkdownImageSelection,
  insertMarkdownLinkSelection,
  selectCurrentStyleScope,
  setImageWidthInLine,
  wrapHtmlCommentSelection,
} from "./format.ts";
import { toggleMarkdownInlineStyle, wrapMarkdownSelection } from "./inlineStyle.ts";
import {
  deleteCurrentParagraph,
  deleteCurrentSentence,
  deleteCurrentWord,
  deleteMarkdownLines,
  duplicateMarkdownLines,
  moveMarkdownBlocks,
  moveMarkdownLines,
  selectCurrentLine,
  selectCurrentParagraph,
  selectCurrentSentence,
  selectCurrentWord,
} from "./lines.ts";
import { applyAutoPair, applyMarkdownSpaceShortcutAfterInput, applyMarkdownTextInputShortcut } from "./input.ts";
import { selectionClipboard } from "../clipboard/copy.ts";
import { typeInCell } from "./cells.ts";
import { applyContextualMarkdownTab, indentSelection } from "./tab.ts";
import { pasteMarkdownContent, type PasteMarkdownPayload } from "./paste.ts";
import {
  alignMarkdownTable,
  deleteMarkdownTable,
  deleteMarkdownTablePart,
  editMarkdownTable,
  insertMarkdownTableColumn,
  insertMarkdownTableRow,
  insertMarkdownTableTemplate,
  moveMarkdownTableColumn,
  moveMarkdownTableRow,
  navigateMarkdownTableCell,
  selectMarkdownTablePart,
} from "./tables.ts";
import { fromTextState, perCell, replacingSelection, runSourceCommand, sourceCommand, textState, type SourceCommand, type TextState } from "./run.ts";
import { insertAtSelection, lineStartOf } from "./text.ts";
import { toModel } from "../state.ts";
import { DEFAULT_TEXTS, type EditorTexts } from "../texts.ts";

/** 旧版「文本 + 选区 → 文本 + 选区」的命令接成按源码改动的命令 */
function text(run: (state: TextState, settings: EditorSettings, texts: EditorTexts) => TextState | null): SourceCommand {
  return ({ source, settings, texts }) => fromTextState(run(textState(source), settings, texts));
}

/** E-9 自动配对会处理的字符：左半边、右半边（跳过）、有选区时包起来的 */
const PAIR_OPENERS = new Set(["(", "[", "{", '"', "'", "`", "$", "（", "【", "《", "「", "『", "“", "‘"]);
const PAIR_CLOSERS = new Set([")", "]", "}", '"', "'", "`", "$", "）", "】", "》", "」", "』", "”", "’"]);
const WRAP_ONLY = new Set(["*", "_", "~"]);

/**
 * 输入的这几个字可能有特殊行为（E-4 行首写法后的空格、B-6 围栏的默认语言、E-9 自动配对）：
 * 只有这时才读整篇源码按源码算；普通的字直接交给 ProseMirror 插入（每个字都读整篇太慢，X-3）
 */
function inputMayNeedSource(state: EditorState, inserted: string, settings: EditorSettings): boolean {
  const { $head, empty } = state.selection;
  if (inserted === "`" || inserted === "~") return true;
  if (inserted.includes(" ")) {
    if (!empty) return false;
    const text = $head.parent.textContent;
    const lineBefore = text.slice(text.lastIndexOf("\n", $head.parentOffset - 1) + 1, $head.parentOffset);
    // 行首写法是几个短记号（`#`、`-`、`1.`、`>`、`[ ]`、`* *`、`- [ ]`、`[^1]:`……）：这一行到光标为止很短
    // 光标前面这一行在文本块里是空的：源码里光标前面全是块标记（空列表项里输入 `* `……），也按源码算
    const trimmed = lineBefore.trim();
    return trimmed.length <= 24 && trimmed.split(/[ \t]+/).length <= 4;
  }
  if (!settings.autoPair || [...inserted].length !== 1) return false;
  if (PAIR_OPENERS.has(inserted)) return true;
  if (!empty && WRAP_ONLY.has(inserted)) return true;
  return PAIR_CLOSERS.has(inserted) && empty && $head.parent.textContent.startsWith(inserted, $head.parentOffset);
}

/** E-5：Tab、Shift+Tab（表格以外）：列表项缩进、反缩进，引用里反缩进，Front Matter、代码里插入缩进，别处插入制表符 */
export function contextualTab(editor: Editor, outdent: boolean): boolean {
  return runSourceCommand(
    editor,
    text((state, settings) => applyContextualMarkdownTab(state.value, state.selectionStart, state.selectionEnd, outdent, settings.indentSize, settings.codeIndentSize)),
  );
}

/** 行内的改动（source.ts 可以直接改文本块） */
function inline(command: SourceCommand): SourceCommand {
  return (env) => {
    const result = command(env);
    return result && result !== "consume" ? { ...result, inline: true } : result;
  };
}

/** 行内样式的开关：选区包起来或去掉，光标处放一对空标记 */
function inlineStyle(before: string, after: string): SourceCommand {
  return perCell(inline(text((state) => {
    // 行内代码有选区时（同 Typora）：选区里有反引号就用更长的反引号包起来，里面的反引号照样是文字
    if (before === "`" && state.selectionStart !== state.selectionEnd) return wrapMarkdownSelection(state, "`", "`");
    return toggleMarkdownInlineStyle(state, before, after);
  })));
}

/** S-7「默认语言」：apply 是插入的途径（通过 Markdown 输入、通过菜单） */
export function defaultCodeLanguage(settings: EditorSettings, via: "markdown" | "menu"): string {
  const applies = settings.defaultCodeLanguageApplyTo === "both" || settings.defaultCodeLanguageApplyTo === via;
  return applies ? settings.defaultCodeLanguage : "";
}

const STYLES = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  underline: ["<u>", "</u>"],
  strike: ["~~", "~~"],
  inlineCode: ["`", "`"],
  highlight: ["==", "=="],
  superscript: ["^", "^"],
  subscript: ["~", "~"],
} as const;

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 「段落 → YAML Front Matter」（同旧版）：文档开头插入，选中标题方便直接改；已经有了就选中里面的内容（两条 `---` 之间）。
 * exists：文档的第一个块就是 Front Matter（按解析结果，不自己猜）
 */
export function insertFrontMatter(state: TextState, exists: boolean, now = new Date(), title = DEFAULT_TEXTS.frontMatterTitle): TextState {
  const { value } = state;
  if (exists) {
    const start = value.indexOf("\n") + 1;
    const closing = /\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/.exec(value.slice(start));
    return { value, selectionStart: start, selectionEnd: closing ? start + closing.index : value.length };
  }
  const eol = value.includes("\r\n") ? "\r\n" : "\n";
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const snippet = ["---", `title: ${title}`, `date: ${date}`, "---", "", ""].join(eol);
  const at = snippet.indexOf(`title: ${title}`) + "title: ".length;
  return { value: snippet + value, selectionStart: at, selectionEnd: at + title.length };
}

/** 没有参数的命令 */
const SIMPLE: Record<string, SourceCommand> = {
  paragraph: text((state) => setParagraphText(state)),
  increaseHeading: text((state) => adjustHeadingLevel(state, "increase")),
  decreaseHeading: text((state) => adjustHeadingLevel(state, "decrease")),
  blockquote: text((state) => formatMarkdownLines(state, "blockquote")),
  bulletList: text((state) => formatMarkdownLines(state, "bullet")),
  orderedList: text((state) => formatMarkdownLines(state, "ordered")),
  taskList: text((state) => formatMarkdownLines(state, "task")),
  definitionList: text((state) => formatMarkdownLines(state, "definition")),
  toggleTask: text((state) => toggleTaskAtSelection(state)),
  markTaskDone: text((state) => setTaskStateAtSelection(state, true)),
  markTaskUndone: text((state) => setTaskStateAtSelection(state, false)),
  hr: text((state) => insertMarkdownHorizontalRule(state)),
  codeBlock: text((state, settings) => formatMarkdownCodeBlock(state, defaultCodeLanguage(settings, "menu"))),
  mathBlock: text((state) => formatMarkdownMathBlock(state)),
  toc: text((state) => insertMarkdownTocTemplate(state)),
  frontMatter: ({ state, source, texts }) =>
    fromTextState(insertFrontMatter(textState(source), state.doc.firstChild?.type.name === "frontMatter", new Date(), texts.frontMatterTitle)),
  footnote: text((state, _settings, texts) => insertMarkdownFootnoteTemplate(state, texts)),
  mermaid: text((state, _settings, texts) => insertMarkdownDiagramTemplate(state, "mermaid", texts)),
  flowchart: text((state, _settings, texts) => insertMarkdownDiagramTemplate(state, "flowchart", texts)),
  sequence: text((state, _settings, texts) => insertMarkdownDiagramTemplate(state, "sequence", texts)),
  prefixNumberedLines: text((state) => prefixNumberedMarkdownLines(state)),
  // E-4：空格已经插进去以后再修正（输入法上屏的空格不经过按键）
  applyMarkdownSpaceShortcutAfterInput: text((state, settings) => applyMarkdownSpaceShortcutAfterInput(state, settings.indentSize)),
  // T 章：表格
  table: text((state, _settings, texts) => insertMarkdownTableTemplate(state, texts)),
  addTableRow: text((state, _settings, texts) => editMarkdownTable(state, "row", texts)),
  addTableColumn: text((state, _settings, texts) => editMarkdownTable(state, "column", texts)),
  addTableRowAbove: text((state, _settings, texts) => insertMarkdownTableRow(state, "above", texts.tableCell)),
  addTableRowBelow: text((state, _settings, texts) => insertMarkdownTableRow(state, "below", texts.tableCell)),
  addTableColumnLeft: text((state, _settings, texts) => insertMarkdownTableColumn(state, "left", texts)),
  addTableColumnRight: text((state, _settings, texts) => insertMarkdownTableColumn(state, "right", texts)),
  moveTableRowUp: text((state) => moveMarkdownTableRow(state, "up")),
  moveTableRowDown: text((state) => moveMarkdownTableRow(state, "down")),
  moveTableColumnLeft: text((state) => moveMarkdownTableColumn(state, "left")),
  moveTableColumnRight: text((state) => moveMarkdownTableColumn(state, "right")),
  selectTableCell: text((state) => selectMarkdownTablePart(state, "cell")),
  deleteTableRow: text((state) => deleteMarkdownTablePart(state, "row")),
  deleteTableColumn: text((state) => deleteMarkdownTablePart(state, "column")),
  deleteTable: text((state) => deleteMarkdownTable(state)),
  alignLeft: text((state) => alignMarkdownTable(state, "left")),
  alignCenter: text((state) => alignMarkdownTable(state, "center")),
  alignRight: text((state) => alignMarkdownTable(state, "right")),
  // E-7、E-8：选择、删除、行操作
  selectLine: text((state) => selectCurrentLine(state)),
  selectParagraph: text((state) => selectCurrentParagraph(state)),
  selectSentence: text((state) => selectCurrentSentence(state)),
  selectWord: text((state) => selectCurrentWord(state)),
  deleteWord: text((state) => deleteCurrentWord(state)),
  deleteSentence: text((state) => deleteCurrentSentence(state)),
  deleteParagraph: text((state) => deleteCurrentParagraph(state)),
  duplicateLine: text((state) => duplicateMarkdownLines(state)),
  deleteLine: text((state) => deleteMarkdownLines(state)),
  moveLineUp: moveContent("up"),
  moveLineDown: moveContent("down"),
  // I-7、I-2、M-2：清除格式、样式范围、链接、图片、注释
  clearFormat: perCell(({ source }) => {
    const state = textState(source);
    // 选区从某个文本块的内容开头开始（前面只有引用的 `>`、列表符号这些块标记）：当成从行首选起，块标记一起清掉。
    // 编辑器里光标进不了块标记，选中整块就是从内容开头选起
    if (state.selectionStart !== state.selectionEnd) {
      const lineStart = lineStartOf(source.text, state.selectionStart);
      const atContentStart = source.map.blocks.some(({ model }) => source.map.map.byNode.get(model)?.starts.includes(state.selectionStart));
      if (lineStart < state.selectionStart && atContentStart) state.selectionStart = lineStart;
    }
    return fromTextState(clearMarkdownFormatting(state));
  }),
  selectStyleScope: text((state) => selectCurrentStyleScope(state)),
  deleteStyleScope: text((state) => deleteCurrentStyleScope(state)),
  comment: text((state, _settings, texts) => wrapHtmlCommentSelection(state, texts.commentText)),
  link: text((state, _settings, texts) => insertMarkdownLinkSelection(state, texts.linkText)),
  // I-3：行内公式。有选区时包成 `$…$`（已经包着的去掉），没有选区时插入一对 `$`、光标放中间
  inlineMath: inline(
    text((state) => {
      const { value, selectionStart: from, selectionEnd: to } = state;
      if (from === to) return { value: `${value.slice(0, from)}$$${value.slice(to)}`, selectionStart: from + 1, selectionEnd: from + 1 };
      const selected = value.slice(from, to);
      if (selected.length >= 2 && selected.startsWith("$") && selected.endsWith("$")) {
        return { value: value.slice(0, from) + selected.slice(1, -1) + value.slice(to), selectionStart: from, selectionEnd: to - 2 };
      }
      if (value[from - 1] === "$" && value[to] === "$") {
        return { value: value.slice(0, from - 1) + selected + value.slice(to + 1), selectionStart: from - 1, selectionEnd: to - 1 };
      }
      return { value: `${value.slice(0, from)}$${selected}$${value.slice(to)}`, selectionStart: from + 1, selectionEnd: to + 1 };
    }),
  ),
  // B-17：在当前块（列表、引用、表格里时是最外层的块）的上方、下方插入一个空段落
  insertParagraphAbove: insertParagraph("above"),
  insertParagraphBelow: insertParagraph("below"),
  // B-15：「段落 → 链接引用」
  linkReference: insertLinkReference(),
  // B-4：缩进、反缩进（列表项连同子项一层，有序列表重新编号）
  indentLines: text((state, settings) => indentSelection(state.value, state.selectionStart, state.selectionEnd, false, settings.indentSize)),
  outdentLines: text((state, settings) => indentSelection(state.value, state.selectionStart, state.selectionEnd, true, settings.indentSize)),
  image: text((state, _settings, texts) => insertMarkdownImageSelection(state, texts.imageAlt)),
};

/**
 * T-5：选择行、列、整个表格是单元格选区（prosemirror-tables），复制、清空、粘贴、逐格加样式都按格。
 * 从光标、选区两端所在的格子（已经是单元格选区时从它的两端）扩到整行、整列、整个表格
 */
function selectCells(kind: "row" | "column" | "table") {
  return () =>
    ({ state, tr, dispatch }: CommandProps): boolean => {
      const { selection } = state;
      const $anchor = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$anchor);
      const $head = selection instanceof CellSelection ? selection.$headCell : cellAround(selection.$head);
      if (!$anchor || !$head || $anchor.start(-1) !== $head.start(-1)) return false;
      let next: CellSelection;
      if (kind === "row") next = CellSelection.rowSelection($anchor, $head);
      else if (kind === "column") next = CellSelection.colSelection($anchor, $head);
      else {
        const map = TableMap.get($anchor.node(-1));
        const start = $anchor.start(-1);
        next = CellSelection.create(state.doc, start + map.map[0], start + map.map[map.map.length - 1]);
      }
      if (dispatch) tr.setSelection(next);
      return true;
    };
}

/**
 * B-17：光标放到最外层的块前面、后面的一个空行上（那里放光标占位段落，空着离开时源码不变，source.ts）；
 * 没有空行时补一个换行
 */
function insertParagraph(side: "above" | "below"): SourceCommand {
  return ({ state, source }) => {
    const { $from } = state.selection;
    const top = $from.depth > 0 ? $from.node(1) : $from.nodeAfter;
    const range = top ? source.map.map.ranges.get(toModel(top)) : undefined;
    if (!range) return null;
    const { text, eol } = source;
    const at = (offset: number, insert = "") => ({ text: text.slice(0, offset) + insert + text.slice(offset), anchor: offset, head: offset });
    if (side === "below") {
      // 后面紧跟着一个空行：光标放到这个空行上
      const blank = /^(\r?\n)[ \t]*\r?\n/.exec(text.slice(range.end));
      if (blank) return at(range.end + blank[1].length);
      if (range.end >= text.length) return { text: text + eol + eol, anchor: text.length + eol.length * 2, head: text.length + eol.length * 2 };
      return at(range.end + (text.startsWith("\r\n", range.end) ? 2 : 1), eol);
    }
    const lineStart = lineStartOf(text, range.start);
    if (lineStart === 0) return at(0, eol);
    // 前面紧挨着一个空行：光标放到这个空行上
    const blank = /\r?\n[ \t]*\r?\n$/.exec(text.slice(0, lineStart));
    if (blank) return at(lineStart - blank[0].length + blank[0].indexOf("\n") + 1);
    return at(lineStart, eol);
  };
}

/**
 * B-15「段落 → 链接引用」（同 Typora）：在当前块（列表、引用、表格里时是最外层的块）后面另起一块 `[]: `，光标放进方括号。
 * 前后都隔一个空行（定义不能打断段落）；写好标签和地址以后按 Markdown 重新解析成链接引用定义
 */
function insertLinkReference(): SourceCommand {
  return ({ state, source }) => {
    const { $from } = state.selection;
    const top = $from.depth > 0 ? $from.node(1) : $from.nodeAfter;
    const range = top ? source.map.map.ranges.get(toModel(top)) : undefined;
    const { text, eol } = source;
    const at = range ? range.end : text.length;
    const rest = text.slice(at);
    const blankAfter = rest.trim() === "" || /^\r?\n[ \t]*\r?\n/.test(rest);
    const before = at === 0 ? "" : eol + eol;
    const insertion = `${before}[]: ${blankAfter ? "" : eol}`;
    const cursor = at + before.length + 1;
    return { text: text.slice(0, at) + insertion + rest, anchor: cursor, head: cursor };
  };
}

/** T-1：插入列数 × 行数（含表头）的表格；空段落里换掉它，否则插在最外层的块后面，选中第一个表头 */
function insertTable(columns: number, rows: number): SourceCommand {
  return ({ state, source, texts }) => {
    const width = Math.max(1, Math.min(64, Math.floor(columns) || 3));
    const height = Math.max(2, Math.min(1000, Math.floor(rows) || 2));
    const { text, eol } = source;
    const header = `| ${Array.from({ length: width }, (_, index) => texts.tableColumn(index + 1)).join(" | ")} |`;
    const delimiter = `| ${Array<string>(width).fill("---").join(" | ")} |`;
    const body = Array.from({ length: height - 1 }, () => `| ${Array<string>(width).fill("").join(" | ")} |`);
    const table = [header, delimiter, ...body].join(eol);
    const first = texts.tableColumn(1);
    const { $from } = state.selection;
    if ($from.parent.isTextblock && $from.parent.content.size === 0 && $from.parent.type.name === "paragraph") {
      const at = Math.min(source.anchor, source.head);
      const offset = at + header.indexOf(first);
      return { text: text.slice(0, at) + table + text.slice(at), anchor: offset, head: offset + first.length };
    }
    const top = $from.depth > 0 ? $from.node(1) : $from.nodeAfter;
    const range = top ? source.map.map.ranges.get(toModel(top)) : undefined;
    const at = range ? range.end : text.length;
    const insertion = `${eol}${eol}${table}`;
    const offset = at + eol.length * 2 + header.indexOf(first);
    return { text: text.slice(0, at) + insertion + text.slice(at), anchor: offset, head: offset + first.length };
  };
}

/** E-8：排版视图里按块移动（列表项按项），代码块、公式块里和源码模式里按行 */
function moveContent(direction: "up" | "down"): SourceCommand {
  return (env) => {
    const state = textState(env.source);
    // Front Matter 按 YAML 行移动、分隔栏不动（moveMarkdownBlocks 里处理）
    const type = env.context.block?.node.type.name ?? "";
    const byLine = env.sourceMode || ["codeBlock", "diagram", "mathBlock", "htmlBlock"].includes(type);
    return fromTextState(byLine ? moveMarkdownLines(state, direction) : moveMarkdownBlocks(state, direction));
  };
}
for (const name of Object.keys(STYLES) as Array<keyof typeof STYLES>) {
  const [before, after] = STYLES[name];
  SIMPLE[name] = inlineStyle(before, after);
}
for (let level = 1; level <= 6; level += 1) SIMPLE[`heading${level}`] = text((state) => setHeadingLevel(state, level as HeadingLevel));

type SimpleName =
  | keyof typeof STYLES
  | "paragraph"
  | "increaseHeading"
  | "decreaseHeading"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "blockquote"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "definitionList"
  | "toggleTask"
  | "markTaskDone"
  | "markTaskUndone"
  | "linkReference"
  | "hr"
  | "codeBlock"
  | "mathBlock"
  | "toc"
  | "frontMatter"
  | "footnote"
  | "mermaid"
  | "flowchart"
  | "sequence"
  | "prefixNumberedLines"
  | "applyMarkdownSpaceShortcutAfterInput"
  | "table"
  | "addTableRow"
  | "addTableColumn"
  | "addTableRowAbove"
  | "addTableRowBelow"
  | "addTableColumnLeft"
  | "addTableColumnRight"
  | "moveTableRowUp"
  | "moveTableRowDown"
  | "moveTableColumnLeft"
  | "moveTableColumnRight"
  | "selectTableCell"
  | "selectTableRow"
  | "selectTableColumn"
  | "selectTable"
  | "deleteTableRow"
  | "deleteTableColumn"
  | "deleteTable"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "selectLine"
  | "selectParagraph"
  | "selectSentence"
  | "selectWord"
  | "deleteWord"
  | "deleteSentence"
  | "deleteParagraph"
  | "duplicateLine"
  | "deleteLine"
  | "moveLineUp"
  | "moveLineDown"
  | "clearFormat"
  | "selectStyleScope"
  | "deleteStyleScope"
  | "comment"
  | "link"
  | "image"
  | "insertParagraphAbove"
  | "insertParagraphBelow"
  | "inlineMath"
  | "indentLines"
  | "outdentLines";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    marko: { [name in SimpleName]: () => ReturnType } & {
      callout: (kind?: string) => ReturnType;
      prefixLines: (prefix: string) => ReturnType;
      insertText: (value: string) => ReturnType;
      /** M-5：图片宽度（像素或百分比） */
      setImageWidth: (width: string) => ReturnType;
      /** 粘贴为纯文本（C-4） */
      pastePlainText: (value: string) => ReturnType;
      /** 粘贴（C-3）：剪贴板里的纯文字和 HTML */
      pasteContent: (payload: PasteMarkdownPayload) => ReturnType;
      /** T-1：插入表格（列数，行数含表头；Tiptap 表格扩展自己的 insertTable 不写 Markdown，不用它） */
      insertTableOfSize: (columns: number, rows: number) => ReturnType;
      /** C-2「复制为」：Markdown、HTML 源码、纯文本，写进系统剪贴板的纯文本 */
      copyAs: (kind: "markdown" | "html" | "text") => ReturnType;
    };
  }
}

export const MarkoCommands = Extension.create({
  name: "markoCommands",
  addCommands() {
    const commands: Record<string, (...args: never[]) => ReturnType<ReturnType<typeof sourceCommand>>> = {};
    for (const [name, command] of Object.entries(SIMPLE)) commands[name] = sourceCommand(command);
    return {
      ...commands,
      selectTableRow: selectCells("row"),
      selectTableColumn: selectCells("column"),
      selectTable: selectCells("table"),
      callout: (kind?: string) => sourceCommand(text((state) => insertMarkdownCalloutTemplate(state, kind)))(),
      prefixLines: (prefix: string) => sourceCommand(text((state) => prefixMarkdownLines(state, prefix)))(),
      insertText: (value: string) => sourceCommand(text((state) => insertMarkdownAtSelection(state, value)))(),
      setImageWidth: (width: string) => sourceCommand(text((state) => (width ? setImageWidthInLine(state, width) : null)))(),
      pastePlainText: (value: string) => sourceCommand(text((state) => insertMarkdownAtSelection(state, value)))(),
      insertTableOfSize: (columns: number, rows: number) => sourceCommand(insertTable(columns, rows))(),
      copyAs:
        (kind: "markdown" | "html" | "text") =>
        ({ editor, state }) => {
          if (state.selection.empty) return false;
          const content = selectionClipboard(state, editor.storage.marko.syntax, editor.storage.marko.host, editor.storage.marko.settings);
          const value = kind === "markdown" ? content.markdown : kind === "html" ? content.html : content.text;
          void globalThis.navigator?.clipboard?.writeText(value);
          return true;
        },
      // 粘贴换掉选中的内容：全选时是整篇，到了表格、代码块内容边上的连同标记（审查 #7）
      pasteContent: (payload: PasteMarkdownPayload) =>
        sourceCommand(
          replacingSelection(text((state) => {
            const result = pasteMarkdownContent(state, payload);
            // 没有特殊处理：按纯文字插入
            return result ?? (payload.text ? insertMarkdownAtSelection(state, payload.text) : null);
          })),
        )(),
    };
  },
  addKeyboardShortcuts() {
    const run = (name: string) => () => (this.editor.commands as unknown as Record<string, () => boolean>)[name]();
    // 加粗、标题、列表这些命令的快捷键在 plugins/commandKeys.ts（可以改，S-12）；这里是编辑器只用的、固定的
    return {
      "Mod-l": run("selectLine"),
      "Mod-d": run("selectWord"),
      "Mod-Shift-d": run("deleteWord"),
      "Mod-Shift-Backspace": run("deleteLine"),
      "Mod-e": run("selectStyleScope"),
      "Alt-ArrowUp": run("moveLineUp"),
      "Alt-ArrowDown": run("moveLineDown"),
      // T-2：表格里 Tab、Shift+Tab 到下一格、上一格（最后一格 Tab 加一行）
      // T-2：表格里到下一格、上一格（最后一格 Tab 加一行）；别处按 E-5（列表缩进、引用反缩进、插入制表符）
      Tab: () => runSourceCommand(this.editor, text((state) => navigateMarkdownTableCell(state, "next"))) || contextualTab(this.editor, false),
      "Shift-Tab": () => runSourceCommand(this.editor, text((state) => navigateMarkdownTableCell(state, "previous"))) || contextualTab(this.editor, true),
      // T-3：表格里左移、右移列（上移、下移行是 Alt+↑ / Alt+↓，在 moveLineUp / moveLineDown 里按行）
      "Alt-ArrowLeft": () => runSourceCommand(this.editor, text((state) => moveMarkdownTableColumn(state, "left"))),
      "Alt-ArrowRight": () => runSourceCommand(this.editor, text((state) => moveMarkdownTableColumn(state, "right"))),
      // C-2：复制为 Markdown
      "Mod-Shift-c": () => this.editor.commands.copyAs("markdown"),
      // T-3：表格里 Ctrl+回车在下面插一行（光标在单元格里时）
      "Mod-Enter": () =>
        runSourceCommand(this.editor, text((state) => (selectMarkdownTablePart(state, "cell") ? insertMarkdownTableRow(state, "below", "") : null))),
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handleTextInput(view, from, to, inserted) {
            const { selection } = view.state;
            const all = selection instanceof AllSelection;
            // 输入法组合期间不处理（E-12）；选中了块（分隔线）、单元格时由 ProseMirror 换掉选区
            if (view.composing || (!all && !(selection instanceof TextSelection))) return false;
            // 换掉的不是选区（输入法上屏换掉组合的文字、自动更正）：交给 ProseMirror，上屏后的处理在 plugins/composition.ts
            if (from !== selection.from || to !== selection.to) return false;
            // T-2：单元格里输入的竖线转义
            if (!all && typeInCell(editor, inserted)) return true;
            // 全选、选区跨了文本块以后输入：按源码换掉选中的部分（全选是整篇）。ProseMirror 直接换会留下表格的框架、
            // 代码块的围栏、文末的空行这些（审查 #7）
            const crossBlock = all || (!selection.empty && !selection.$from.sameParent(selection.$to));
            // 大多数字符没有特殊行为：不用读整篇源码，交给 ProseMirror 直接插入（X-3）
            if (!crossBlock && !inputMayNeedSource(view.state, inserted, editor.storage.marko.settings)) return false;
            if (crossBlock) return runSourceCommand(editor, replacingSelection(({ source }) => insertAtSelection(source, inserted)));
            return runSourceCommand(editor, ({ source, settings }) => {
              const state = textState(source);
              const asInline = (result: TextState | null) => (result ? { ...(fromTextState(result) as SourceResult), inline: true } : null);
              // B-6：输入围栏的第三个 ``` ` ``` 或 `~` 时补上默认语言并选中它（S-7「通过 Markdown 输入」）
              if (inserted === "`" || inserted === "~") {
                const language = defaultCodeLanguage(settings, "markdown");
                const fence = language ? applyDefaultCodeLanguageOnFenceKey(state, inserted, language) : null;
                if (fence) return asInline(fence);
              }
              // E-4：行首写法后面的空格（改的是块）
              if (inserted.includes(" ")) {
                const shortcut = applyMarkdownTextInputShortcut(state, inserted, settings.indentSize);
                if (shortcut) return fromTextState(shortcut);
              }
              // E-9：自动配对
              if (settings.autoPair && [...inserted].length === 1) return asInline(applyAutoPair(state, inserted));
              return null;
            });
          },
        },
      }),
    ];
  },
});

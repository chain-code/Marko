// 编辑器（1.6 节）：Tiptap 的 Editor 加上本包的扩展。不依赖 Vue（editor-vue 包再包一层）
import { resolveSyntax, type SyntaxOptions } from "@marko/markdown";
import { Editor, Extension } from "@tiptap/core";
import { Dropcursor, Gapcursor, UndoRedo } from "@tiptap/extensions";
import { EditorState, Plugin } from "@tiptap/pm/state";
import { MarkoClipboard } from "./clipboard/index.ts";
import { contextualTab, MarkoCommands } from "./commands/extension.ts";
import { browserHost, type EditorHost } from "./host.ts";
import { deleteSpecial, enterSpecial, markdownKeymap } from "./keymap.ts";
import { refreshCodeViews, withNodeViews } from "./nodeViews/index.ts";
import { BlockWidgets } from "./plugins/blockWidgets.ts";
import { Composition } from "./plugins/composition.ts";
import { TextInput } from "./plugins/textInput.ts";
import { FocusedBlock } from "./plugins/focus.ts";
import { MathDocument } from "./plugins/mathDocument.ts";
import { EmojiSuggestion, type EmojiRenderer } from "./reused/emoji.ts";
import { CommandKeys } from "./plugins/commandKeys.ts";
import { carryFind, Find } from "./reused/search.ts";
import { Placeholders } from "./plugins/placeholders.ts";
import { centerSelection, openLink, ViewModes } from "./plugins/viewModes.ts";
import { markdownNodes } from "./nodes/index.ts";
import { deferConversion } from "./plugins/defer.ts";
import { InlineSyntax, REFRESH_INLINE } from "./plugins/inlineSyntax.ts";
import { Reconcile, SKIP_RECONCILE } from "./plugins/reconcile.ts";
import { placeSelection, readSource } from "./source.ts";
import { sourceModeOf } from "./sourceMode/index.ts";
import { DEFAULT_SETTINGS, type EditorSettings } from "./settings.ts";
import { parseToProseMirror, serializeDoc } from "./state.ts";

export { DEFAULT_SETTINGS, LAST_CODE_LANGUAGE, type EditorSettings } from "./settings.ts";
export { browserHost, type EditorHost, type ResourceKind } from "./host.ts";
export { DEFAULT_TEXTS, textsOf, type EditorTexts, type MediaTextKind } from "./texts.ts";
export { COMMAND_KEYS, commandKey } from "./keyBindings.ts";
export { linkAt, REFRESH_INLINE, withRootUrl } from "./plugins/inlineSyntax.ts";
export { insertImageFiles, insertMedia, markdownUrl, mediaKindOf, type MediaInsert, type MediaKind } from "./plugins/placeholders.ts";
export { centerSelection, jumpToAnchor, openLink } from "./plugins/viewModes.ts";
// X-6「编辑 → 删除」
export { deleteForward } from "./keymap.ts";
// 代码块等 CodeMirror 按设置重新配置、重新量尺寸（容器变了大小、显示出来以后）
export { refreshCodeViews } from "./nodeViews/index.ts";
export { findStatus, findStatusOf, type FindOptions, type FindStatus } from "./reused/search.ts";
export { sourceModeOf, toggleSourceMode, type SourceModeView } from "./sourceMode/index.ts";
export { defaultEmojiRenderer, emojiItems, EmojiSuggestion, type EmojiItem, type EmojiRenderer } from "./reused/emoji.ts";
export { buildDocSourceMap, keepBlankAt, offsetToPosition, parseToProseMirror, positionToOffset, serializeDoc, toModel, toProseMirror } from "./state.ts";

export interface MarkoEditorOptions {
  /** 编辑区的元素（它本身变成可编辑的）；不给时建一个不挂到页面上的 div（测试、无界面使用） */
  element?: HTMLElement;
  markdown?: string;
  syntax?: Partial<SyntaxOptions>;
  settings?: Partial<EditorSettings>;
  editable?: boolean;
  /** 外部能力（K-2）；不给时用浏览器里的默认实现 */
  host?: EditorHost;
  /** Emoji 补全列表的界面（I-5）；不给时用不依赖框架的默认实现 */
  emojiRenderer?: EmojiRenderer;
}

/** 编辑器的设置和语法开关，扩展里用 editor.storage.marko 取 */
export interface MarkoStorage {
  settings: EditorSettings;
  syntax: SyntaxOptions;
  /** 源码模式（E-11） */
  sourceMode: boolean;
  host: EditorHost;
  /** 专注模式（V-1）、打字机模式（V-2） */
  focusMode: boolean;
  typewriterMode: boolean;
  /** 光标最后待过的代码块的语言：S-7 默认语言选「最近使用」时用它 */
  lastCodeLanguage: string;
}

declare module "@tiptap/core" {
  interface Storage {
    marko: MarkoStorage;
  }
}

/** 编辑器的设置和语法开关 */
const MarkoState = Extension.create<object, MarkoStorage>({
  name: "marko",
  addStorage: () => ({
    settings: { ...DEFAULT_SETTINGS },
    syntax: resolveSyntax({}),
    sourceMode: false,
    host: browserHost,
    focusMode: false,
    typewriterMode: false,
    lastCodeLanguage: "",
  }),
  addProseMirrorPlugins() {
    const storage = this.storage;
    // S-7「最近使用」：记下光标所在代码块的语言（信息串的第一个词）
    return [
      new Plugin({
        view: () => ({
          update(view) {
            const block = view.state.selection.$head.parent;
            if (block.type.name !== "codeBlock") return;
            const language = String(block.attrs.info ?? "").trim().split(/\s+/)[0];
            if (language) storage.lastCodeLanguage = language;
          },
        }),
      }),
    ];
  },
});

export function createMarkoEditor(options: MarkoEditorOptions = {}): Editor {
  let editor: Editor | undefined;
  const parseOptions = () => ({ syntax: editor?.storage.marko.syntax ?? resolveSyntax({}) });
  editor = new Editor({
    // 编辑区就是这个元素本身（Typora 的 #write 就是可编辑的那个元素，主题按它写样式）
    element: { mount: options.element ?? document.createElement("div") },
    editable: options.editable ?? true,
    // 按键行为按第 2 章自己实现（keymap.ts），不用 Tiptap 默认的
    enableCoreExtensions: { keymap: false },
    extensions: [
      // 代码类的块是 CodeMirror（1.6 节）；块边界上的回车、退格还是按第 2 章（keymap.ts）
      ...withNodeViews(markdownNodes, { keys: { enter: enterSpecial, delete: deleteSpecial, tab: contextualTab }, host: (current) => current.storage.marko.host }),
      MarkoState,
      Reconcile.configure({ parse: parseOptions, defer: deferConversion }),
      // 编辑器构造时就要建插件的状态，那时 editor 还没赋值：先用默认的，setMarkdown 时再按设置重建
      InlineSyntax.configure({
        syntax: () => editor?.storage.marko.syntax ?? resolveSyntax({}),
        host: () => editor?.storage.marko.host ?? browserHost,
        display: () => {
          const settings = editor?.storage.marko.settings ?? DEFAULT_SETTINGS;
          return { smartQuotes: settings.smartQuotes, smartDashes: settings.smartDashes };
        },
        openLink: (url) => {
          if (editor) openLink(editor, url);
        },
      }),
      // E-6：连续输入合并成一步，停顿 3 秒以上另起一步
      UndoRedo.configure({ newGroupDelay: 3000 }),
      Gapcursor,
      FocusedBlock,
      MathDocument,
      BlockWidgets,
      Dropcursor,
      markdownKeymap,
      MarkoCommands,
      MarkoClipboard,
      Find,
      Composition,
      TextInput,
      options.emojiRenderer ? EmojiSuggestion.configure({ render: options.emojiRenderer }) : EmojiSuggestion,
      Placeholders,
      ViewModes,
      CommandKeys,
    ],
  });
  editor.storage.marko.settings = { ...DEFAULT_SETTINGS, ...options.settings };
  editor.storage.marko.syntax = resolveSyntax(options.syntax ?? {});
  editor.storage.marko.host = options.host ?? browserHost;
  setMarkdown(editor, options.markdown ?? "");
  return editor;
}

/**
 * 换掉整篇（打开文件）：新的编辑状态，撤销历史清空。selection 是原文（含开头的 BOM）里的偏移，落在空行上时那里放一个光标占位段落
 */
export function setMarkdown(editor: Editor, markdown: string, selection?: { anchor: number; head: number }): void {
  // 没有换行的文档（新文档）用设置里的默认换行符（E-1）
  const doc = parseToProseMirror(editor.schema, markdown, { syntax: editor.storage.marko.syntax, eol: editor.storage.marko.settings.defaultEol });
  let state = EditorState.create({ doc, plugins: editor.state.plugins });
  const tr = state.tr;
  if (selection) {
    // 编辑器内部的源码不带 BOM（state.ts 的 buildDocSourceMap）
    const bom = doc.attrs.bom ? 1 : 0;
    placeSelection(tr, editor.schema, Math.max(0, selection.anchor - bom), Math.max(0, selection.head - bom));
  }
  // 查找栏开着时打开了别的文件：查找条件留着（N-1）
  const carried = carryFind(editor.state, tr);
  if (selection || carried) {
    tr.setMeta(SKIP_RECONCILE, true).setMeta("addToHistory", false);
    state = state.apply(tr);
  }
  editor.view.updateState(state);
  // 源码模式下打开别的文件：源码编辑器跟着换（E-11）
  sourceModeOf(editor)?.reload();
}

/**
 * 按原文（含开头的 BOM）里的偏移设置选区，焦点放进编辑器，选区滚到中间：点全局搜索的结果（W-5）。
 * 偏移落在空行上时同 setMarkdown，那里放一个光标占位段落
 */
export function selectSource(editor: Editor, anchor: number, head = anchor): void {
  const bom = editor.state.doc.attrs.bom ? 1 : 0;
  const tr = editor.state.tr;
  placeSelection(tr, editor.schema, Math.max(0, anchor - bom), Math.max(0, head - bom));
  tr.setMeta(SKIP_RECONCILE, true).setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  editor.view.focus();
  centerSelection(editor.view);
}

/** 整篇的 Markdown */
export function getMarkdown(editor: Editor): string {
  return serializeDoc(editor.state.doc);
}

/**
 * 整篇的 Markdown 和选区在原文（含开头的 BOM）里的偏移（选区所在的空段落也输出）。节点选区是这个块的原文，
 * 单元格选区从第一格的内容到最后一格的内容（同命令看到的，source.ts）
 */
export function getMarkdownWithSelection(editor: Editor): { value: string; anchor: number; head: number } {
  const { text, anchor, head } = readSource(editor.state);
  // 命令看到的源码不带 BOM，对外按文件内容带上
  const bom = editor.state.doc.attrs.bom ? "\uFEFF" : "";
  return { value: bom + text, anchor: anchor + bom.length, head: head + bom.length };
}

/** 改语法开关（S-8）：之后的解析按新的开关，行内装饰整篇重画（文档里已有的块不重新解析，重新打开时才按新开关） */
export function setSyntax(editor: Editor, syntax: Partial<SyntaxOptions>): void {
  editor.storage.marko.syntax = resolveSyntax(syntax);
  editor.view.dispatch(editor.state.tr.setMeta(REFRESH_INLINE, true).setMeta("addToHistory", false));
}

/** 改设置（S 章里和编辑有关的）：之后的编辑按新设置；代码块的缩进、行号、自动换行马上跟着改 */
export function setSettings(editor: Editor, settings: Partial<EditorSettings>): void {
  editor.storage.marko.settings = { ...editor.storage.marko.settings, ...settings };
  refreshCodeViews(editor);
  // 智能标点（E-10）这类只改显示的设置：行内装饰整篇重画
  editor.view.dispatch(editor.state.tr.setMeta(REFRESH_INLINE, true).setMeta("addToHistory", false));
}

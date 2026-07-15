<template>
  <section
    ref="surfaceRef"
    class="continuous-editor"
    :class="{
      'is-source': settings.sourceMode,
      'is-focus': settings.focusMode,
      'is-typewriter': settings.typewriterMode,
    }"
    :style="editorStyle"
    @dragover.prevent
  >
    <div ref="hostRef" class="continuous-editor-host" />

    <div
      v-if="emojiSuggestions.length > 0"
      class="emoji-popover"
      :style="emojiPopoverStyle"
      role="listbox"
      aria-label="Emoji 补全"
    >
      <button
        v-for="(item, index) in emojiSuggestions"
        :id="`emoji-option-${index}`"
        :key="item.code"
        type="button"
        class="emoji-option"
        :class="{ active: index === emojiActiveIndex }"
        role="option"
        :aria-selected="index === emojiActiveIndex"
        tabindex="-1"
        @mouseenter="emojiActiveIndex = index"
        @mousedown.prevent="applyEmoji(item.value)"
      >
        <span>{{ item.value }}</span>
        <span>:{{ item.code }}:</span>
      </button>
    </div>

    <div
      v-if="contextMenu"
      class="editor-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      role="menu"
      aria-label="编辑菜单"
      @click.stop
      @contextmenu.prevent
      @keydown="handleEditorContextMenuKeydown"
    >
      <template v-for="(item, index) in contextMenu.items" :key="`editor-context-${index}`">
        <div v-if="item.type === 'separator'" class="context-menu-separator" />
        <button
          v-else
          type="button"
          class="context-menu-item"
          role="menuitem"
          @mousedown.prevent
          @click="runEditorContextMenuCommand(item.command)"
        >
          <component :is="contextActionIcon(item.command)" />
          <span>{{ item.label }}</span>
          <small v-if="item.shortcut">{{ item.shortcut }}</small>
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, isolateHistory, redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultHighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import {
  Compartment,
  EditorState,
  Prec,
  Transaction,
  type Extension,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightSpecialChars,
  keymap,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  Bold,
  ClipboardPaste,
  Code,
  Copy,
  Italic,
  Link,
  Redo2,
  RemoveFormatting,
  Scissors,
  TextSelect,
  Undo2,
} from "lucide-vue-next";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
  type App as VueApplication,
} from "vue";
import { resolveLocalAsset } from "@/services/desktop";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import VisualTableEditor from "@/components/VisualTableEditor.vue";
import { indentSelection } from "@/utils/editorBlocks";
import {
  alignMarkdownTable,
  adjustHeadingLevel,
  applyAutoPair,
  applyMarkdownSpaceShortcut,
  clearMarkdownFormatting,
  continueMarkdownBlock,
  deleteCurrentParagraph,
  deleteCurrentSentence,
  deleteCurrentStyleScope,
  deleteCurrentWord,
  deleteMarkdownLines,
  deleteMarkdownTable,
  deleteMarkdownTablePart,
  duplicateMarkdownLines,
  editMarkdownTable,
  formatMarkdownCodeBlock,
  formatMarkdownLines,
  formatMarkdownMathBlock,
  getPlainTextFromMarkdownSelection,
  getSelectedMarkdownHtml,
  insertMarkdownAtSelection,
  insertMarkdownCalloutTemplate,
  insertMarkdownDiagramTemplate,
  insertMarkdownFootnoteTemplate,
  insertMarkdownHorizontalRule,
  insertMarkdownImageSelection,
  insertMarkdownLinkSelection,
  insertMarkdownSoftBreak,
  insertMarkdownTableColumn,
  insertMarkdownTableRow,
  insertMarkdownTableTemplate,
  insertMarkdownTocTemplate,
  moveMarkdownLines,
  moveMarkdownTableColumn,
  moveMarkdownTableRow,
  navigateMarkdownTableCell,
  outdentMarkdownListOnBackspace,
  pasteMarkdownContent,
  pastePlainMarkdownText,
  removeAutoPairOnBackspace,
  selectCurrentLine,
  selectCurrentParagraph,
  selectCurrentSentence,
  selectCurrentStyleScope,
  selectCurrentWord,
  selectMarkdownTablePart,
  setHeadingLevel,
  setImageWidthInLine,
  setParagraphText,
  toggleTaskAtSelection,
  unwrapMarkdownBlockOnBackspace,
  wrapHtmlCommentSelection,
  wrapMarkdownSelection,
  type TextEditResult,
  type TextState,
} from "@/utils/editorCommands";
import {
  clampEditorContextMenuPosition,
  editorContextMenuItems,
  type EditorContextMenuItem,
} from "@/utils/editorContextMenu";
import {
  continuousHistoryGroupDelay,
  getContinuousDiagramLanguage,
  getContinuousMarkdownLinePresentations,
  getContinuousPreviewBlocks,
  getContinuousTextChange,
  getEmojiCompletionRange,
  normalizeContinuousEditorViewState,
  type ContinuousEditorViewState,
  type ContinuousPreviewBlock,
  type ContinuousPreviewBlockKind,
  type EmojiCompletionRange,
} from "@/utils/continuousEditor";
import { splitMarkdownBlocks } from "@/utils/editorBlocks";
import { getKeyboardShortcutPlatform, resolveEditorShortcut } from "@/utils/keyboardShortcuts";
import { getEmojiSuggestions, renderMarkdown } from "@/utils/markdown";
import { findMarkdownLinkAtCursor } from "@/utils/markdownLinks";
import { shouldOpenPreviewLink } from "@/utils/previewLinks";
import { insertFrontMatterSnippet } from "@/utils/snippets";
import { calculateSelectionStats } from "@/utils/stats";
import { getLineStartOffset } from "@/utils/textPosition";
import type {
  EditorCommand,
  EditorSettings,
  ImageInsertRequest,
  OutlineItem,
  SelectionStats,
} from "@/types";

const props = defineProps<{
  modelValue: string;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
  findMatches?: Array<{ index: number; length: number }>;
  activeFindIndex?: number;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
  saveAs: [];
  open: [];
  selection: [stats: SelectionStats];
  imageData: [payload: ImageInsertRequest];
  openLink: [path: string];
  openLinkHref: [href: string];
  missingLink: [];
  requestSourceSelection: [start: number, end: number];
}>();

const surfaceRef = ref<HTMLElement | null>(null);
const hostRef = ref<HTMLElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const emojiQuery = ref("");
const emojiRange = ref<EmojiCompletionRange | null>(null);
const emojiActiveIndex = ref(0);
const emojiPopoverStyle = ref<Record<string, string>>({});
const contextMenu = ref<{ items: EditorContextMenuItem[]; x: number; y: number } | null>(null);
const previewCompartment = new Compartment();
const contentAttributesCompartment = new Compartment();
const findDecorationsCompartment = new Compartment();
let activeTableEditor: VisualTableEditorHandle | null = null;
const tableWidgetMounts = new WeakMap<HTMLElement, TableWidgetMount>();
const diagramWidgetMounts = new WeakMap<HTMLElement, DiagramWidgetMount>();
const widgetResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();
let typewriterFrame = 0;
let restoringViewState = false;
let allowNextTabFocus = false;
let imagePlaceholderSequence = 0;
let contextMenuReturnFocus: HTMLElement | null = null;

const emojiSuggestions = computed(() => (emojiQuery.value ? getEmojiSuggestions(emojiQuery.value) : []));
const editorStyle = computed(() => ({
  "--reading-max-width": `${props.settings.lineWidth}px`,
  "--editor-font-size": `${props.settings.fontSize}px`,
  "--editor-tab-size": String(props.settings.indentSize),
}));

const contextActionIcons: Partial<Record<EditorCommand, unknown>> = {
  undo: Undo2,
  redo: Redo2,
  cut: Scissors,
  copy: Copy,
  paste: ClipboardPaste,
  pastePlainText: ClipboardPaste,
  copyMarkdown: Copy,
  copyHtml: Copy,
  copyPlainText: Copy,
  selectAll: TextSelect,
  link: Link,
  openLink: Link,
  bold: Bold,
  italic: Italic,
  inlineCode: Code,
  clearFormat: RemoveFormatting,
};

onMounted(() => {
  if (!hostRef.value) return;
  editorView.value = new EditorView({
    parent: hostRef.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        highlightSpecialChars(),
        history({ newGroupDelay: continuousHistoryGroupDelay }),
        drawSelection(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown({ codeLanguages: languages }),
        EditorView.lineWrapping,
        previewCompartment.of(createLivePreviewExtension()),
        contentAttributesCompartment.of(createContentAttributesExtension()),
        findDecorationsCompartment.of(createFindDecorationsExtension()),
        Prec.high(EditorView.domEventHandlers({
          keydown: handleEditorKeydown,
          paste: handlePaste,
          drop: handleDrop,
          mousedown: handleEditorMouseDown,
          contextmenu: openEditorContextMenu,
        })),
        EditorView.updateListener.of(handleEditorUpdate),
      ],
    }),
  });
  emitSelection(editorView.value);
  window.addEventListener("click", handleWindowClick);
  window.addEventListener("keydown", handleWindowKeydown);
});

onBeforeUnmount(() => {
  if (typewriterFrame) window.cancelAnimationFrame(typewriterFrame);
  window.removeEventListener("click", handleWindowClick);
  window.removeEventListener("keydown", handleWindowKeydown);
  editorView.value?.destroy();
  editorView.value = null;
});

watch(
  () => props.modelValue,
  (value) => {
    const view = editorView.value;
    if (!view || view.state.doc.toString() === value) return;
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: {
        anchor: Math.min(selection.anchor, value.length),
        head: Math.min(selection.head, value.length),
      },
      annotations: Transaction.addToHistory.of(false),
    });
  },
);

watch(
  [() => props.filePath, () => props.outline, () => props.settings],
  () => {
    editorView.value?.dispatch({
      effects: previewCompartment.reconfigure(createLivePreviewExtension()),
    });
  },
  { deep: true },
);

watch(
  () => props.settings.spellcheck,
  () => {
    editorView.value?.dispatch({
      effects: contentAttributesCompartment.reconfigure(createContentAttributesExtension()),
    });
  },
);

watch(
  [() => props.findMatches, () => props.activeFindIndex],
  () => {
    editorView.value?.dispatch({
      effects: findDecorationsCompartment.reconfigure(createFindDecorationsExtension()),
    });
  },
  { deep: true },
);

function createContentAttributesExtension(): Extension {
  return EditorView.contentAttributes.of({
    lang: "en",
    spellcheck: props.settings.spellcheck ? "true" : "false",
  });
}

function createFindDecorationsExtension(): Extension {
  const docLength = editorView.value?.state.doc.length ?? props.modelValue.length;
  const ranges = (props.findMatches ?? []).flatMap((match, index) => {
    const from = clampOffset(match.index, docLength);
    const to = clampOffset(match.index + match.length, docLength);
    if (to <= from) return [];
    return [Decoration.mark({
      class: index === props.activeFindIndex ? "cm-find-match cm-find-match-active" : "cm-find-match",
    }).range(from, to)];
  });
  return EditorView.decorations.of(Decoration.set(ranges, true));
}

function createLivePreviewExtension(): Extension {
  if (props.settings.sourceMode) return [];
  const focusMode = props.settings.focusMode;
  return EditorView.decorations.compute(
    ["doc", "selection"],
    (state) => buildLivePreviewDecorations(state, focusMode),
  );
}

function buildLivePreviewDecorations(state: EditorState, focusMode: boolean): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const source = state.doc.toString();
  const markdownBlocks = splitMarkdownBlocks(source);
  const previewBlocks = getContinuousPreviewBlocks(source, markdownBlocks)
    .filter((block) => !selectionIntersectsBlock(state, block));
  const presentations = getContinuousMarkdownLinePresentations(
    source,
    state.selection.main.head,
    focusMode,
    markdownBlocks,
  );

  for (const line of presentations) {
    if (rangeInsidePreviewBlock(line.from, line.to, previewBlocks)) continue;
    ranges.push(Decoration.line({ attributes: { class: line.className } }).range(line.from));
    const listMarker = line.active ? null : getRenderedListMarker(source.slice(line.from, line.to), line.kind);
    if (listMarker) {
      ranges.push(Decoration.replace({ widget: new RenderedListMarkerWidget(listMarker.text) }).range(
        line.from + listMarker.from,
        line.from + listMarker.to,
      ));
    } else if (line.hiddenMarker && line.hiddenMarker.to > line.hiddenMarker.from) {
      ranges.push(Decoration.replace({}).range(line.hiddenMarker.from, line.hiddenMarker.to));
    }
  }
  addInlinePreviewDecorations(state, ranges, previewBlocks);
  for (const block of previewBlocks) {
    if (block.to <= block.from) continue;
    ranges.push(Decoration.replace({
      block: true,
      widget: createSpecialPreviewWidget(block, source),
    }).range(block.from, block.to));
  }
  return Decoration.set(ranges, true);
}

function getRenderedListMarker(
  line: string,
  kind: ContinuousPreviewBlockKind | string,
): { from: number; to: number; text: string } | null {
  if (kind === "bullet-list") {
    const match = line.match(/^(\s*)[-+*]\s+/);
    return match ? { from: 0, to: match[0].length, text: `${match[1]}• ` } : null;
  }
  if (kind === "ordered-list") {
    const match = line.match(/^(\s*)(\d+)([.)])\s+/);
    return match ? { from: 0, to: match[0].length, text: `${match[1]}${match[2]}${match[3]} ` } : null;
  }
  if (kind === "task-list") {
    const match = line.match(/^(\s*)[-+*]\s+\[([ xX])\]\s+/);
    return match
      ? { from: 0, to: match[0].length, text: `${match[1]}${match[2].toLowerCase() === "x" ? "☑" : "☐"} ` }
      : null;
  }
  return null;
}

function addInlinePreviewDecorations(
  state: EditorState,
  ranges: Range<Decoration>[],
  previewBlocks: ContinuousPreviewBlock[],
) {
  const activeLine = state.doc.lineAt(state.selection.main.head);
  syntaxTree(state).iterate({
    enter(node) {
      if (rangeInsidePreviewBlock(node.from, node.to, previewBlocks)) return false;
      if (node.from >= activeLine.from && node.to <= activeLine.to) return false;
      const parentName = node.node.parent?.name ?? "";
      if (
        node.name === "EmphasisMark"
        || node.name === "CodeMark"
        || node.name === "StrikethroughMark"
        || (node.name === "LinkMark" && parentName === "Link")
        || (node.name === "URL" && parentName === "Link")
      ) {
        ranges.push(Decoration.replace({}).range(node.from, node.to));
      }
      return undefined;
    },
  });
}

function selectionIntersectsBlock(state: EditorState, block: ContinuousPreviewBlock): boolean {
  const selection = state.selection.main;
  if (selection.empty) return selection.head >= block.from && selection.head < block.to;
  return selection.from < block.to && selection.to > block.from;
}

function rangeInsidePreviewBlock(from: number, to: number, blocks: ContinuousPreviewBlock[]): boolean {
  return blocks.some((block) => from >= block.from && Math.max(from, to) <= block.to);
}

function createSpecialPreviewWidget(block: ContinuousPreviewBlock, documentSource: string): WidgetType {
  if (block.kind === "table") {
    return new VisualTableBlockWidget(block, documentSource);
  }
  if (block.kind === "diagram" && isDiagramPreviewEnabled(block.source)) {
    return new DiagramBlockWidget(block, documentSource);
  }
  const html = renderMarkdown(block.source, {
    basePath: props.filePath,
    documentSource,
    outline: props.outline,
    settings: props.settings,
    assetResolver: resolveLocalAsset,
  });
  const renderedKind = block.kind === "diagram" ? "code" : block.kind;
  return new RenderedMarkdownBlockWidget(html, block.from, block.to, renderedKind);
}

function isDiagramPreviewEnabled(source: string): boolean {
  const language = getContinuousDiagramLanguage(source);
  return language ? props.settings.extensions[language] : false;
}

interface VisualTableEditorHandle {
  runCommand: (command: EditorCommand, payload?: string) => VisualTableCommandResult;
}

type VisualTableCommandResult = "handled" | "unsupported";
type ActiveTableCommandResult = VisualTableCommandResult | "inactive";

interface TableWidgetState {
  source: string;
  documentSource: string;
  from: number;
  to: number;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
}

interface TableWidgetMount {
  app: VueApplication;
  state: TableWidgetState;
  handle: VisualTableEditorHandle | null;
  lastInputGroup: string | null;
}

interface DiagramWidgetState {
  source: string;
  documentSource: string;
  from: number;
  to: number;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
}

interface DiagramWidgetMount {
  app: VueApplication;
  state: DiagramWidgetState;
}

class RenderedListMarkerWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof RenderedListMarkerWidget && other.text === this.text;
  }

  toDOM(): HTMLElement {
    const marker = document.createElement("span");
    marker.className = "cm-rendered-list-marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = this.text;
    return marker;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class VisualTableBlockWidget extends WidgetType {
  constructor(
    private readonly block: ContinuousPreviewBlock,
    private readonly documentSource: string,
    private readonly filePath = props.filePath,
    private readonly outline = props.outline,
    private readonly settings = props.settings,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof VisualTableBlockWidget
      && other.block.from === this.block.from
      && other.block.to === this.block.to
      && other.block.source === this.block.source
      && other.documentSource === this.documentSource
      && other.filePath === this.filePath
      && other.outline === this.outline
      && other.settings === this.settings;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-visual-table-widget";
    const state = reactive<TableWidgetState>({
      source: this.block.source,
      documentSource: this.documentSource,
      from: this.block.from,
      to: this.block.to,
      filePath: this.filePath,
      outline: this.outline,
      settings: this.settings,
    });
    const mounted: TableWidgetMount = {
      app: null as unknown as VueApplication,
      state,
      handle: null,
      lastInputGroup: null,
    };
    const rootComponent = defineComponent({
      render: () => h(VisualTableEditor, {
        ref: (handle: unknown) => {
          mounted.handle = handle as VisualTableEditorHandle | null;
        },
        source: state.source,
        documentSource: state.documentSource,
        filePath: state.filePath,
        outline: state.outline,
        settings: state.settings,
        onUpdate: (value: string, history: "input" | "command", inputGroup?: string) => {
          replaceTableWidgetSource(view, state, value, history, inputGroup, mounted);
        },
        onDelete: () => replaceTableWidgetSource(view, state, "", "command", undefined, mounted),
        onFocus: () => {
          activeTableEditor = mounted.handle;
        },
        onBlur: () => {
          if (activeTableEditor === mounted.handle) activeTableEditor = null;
        },
        onEscape: () => {
          mounted.lastInputGroup = null;
          if (activeTableEditor === mounted.handle) activeTableEditor = null;
          allowNextTabFocus = true;
          view.focus();
        },
        onCommand: (command: "undo" | "redo") => {
          mounted.lastInputGroup = null;
          if (command === "undo") undo(view);
          else redo(view);
        },
        onEditorCommand: (command: EditorCommand) => runCommand(command),
        onShortcut: (action: "save" | "saveAs" | "open") => {
          if (action === "save") emit("save");
          else if (action === "saveAs") emit("saveAs");
          else emit("open");
        },
        onSelection: (selectedText: string) => {
          emit("selection", calculateSelectionStats(
            selectedText,
            state.documentSource,
            state.from,
            state.from,
            state.from,
          ));
        },
        onOpenLink: (href: string) => emit("openLinkHref", href),
      }),
    });
    mounted.app = createApp(rootComponent);
    tableWidgetMounts.set(root, mounted);
    mounted.app.mount(root);
    observeWidgetSize(root, view);
    void nextTick(() => view.requestMeasure());
    return root;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const mounted = tableWidgetMounts.get(dom);
    if (!mounted) return false;
    mounted.state.source = this.block.source;
    mounted.state.documentSource = this.documentSource;
    mounted.state.from = this.block.from;
    mounted.state.to = this.block.to;
    mounted.state.filePath = this.filePath;
    mounted.state.outline = this.outline;
    mounted.state.settings = this.settings;
    void nextTick(() => view.requestMeasure());
    return true;
  }

  destroy(dom: HTMLElement) {
    const mounted = tableWidgetMounts.get(dom);
    if (!mounted) return;
    if (activeTableEditor === mounted.handle) activeTableEditor = null;
    disconnectWidgetSizeObserver(dom);
    mounted.app.unmount();
    tableWidgetMounts.delete(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class DiagramBlockWidget extends WidgetType {
  constructor(
    private readonly block: ContinuousPreviewBlock,
    private readonly documentSource: string,
    private readonly filePath = props.filePath,
    private readonly outline = props.outline,
    private readonly settings = props.settings,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof DiagramBlockWidget
      && other.block.from === this.block.from
      && other.block.to === this.block.to
      && other.block.source === this.block.source
      && other.documentSource === this.documentSource
      && other.filePath === this.filePath
      && other.outline === this.outline
      && other.settings === this.settings;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-special-preview cm-special-preview-diagram";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "流程图预览");
    const state = reactive<DiagramWidgetState>({
      source: this.block.source,
      documentSource: this.documentSource,
      from: this.block.from,
      to: this.block.to,
      filePath: this.filePath,
      outline: this.outline,
      settings: this.settings,
    });
    const mounted: DiagramWidgetMount = {
      app: null as unknown as VueApplication,
      state,
    };
    const rootComponent = defineComponent({
      render: () => h(MarkdownPreview, {
        source: state.source,
        documentSource: state.documentSource,
        basePath: state.filePath,
        outline: state.outline,
        settings: state.settings,
        onReplaceSource: (value: string) => replaceDiagramWidgetSource(view, state, value),
        onOpenLink: (path: string) => emit("openLink", path),
        onOpenAnchor: (href: string) => emit("openLinkHref", href),
      }),
    });
    mounted.app = createApp(rootComponent);
    diagramWidgetMounts.set(root, mounted);
    mounted.app.mount(root);
    observeWidgetSize(root, view);
    void nextTick(() => view.requestMeasure());
    return root;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const mounted = diagramWidgetMounts.get(dom);
    if (!mounted) return false;
    mounted.state.source = this.block.source;
    mounted.state.documentSource = this.documentSource;
    mounted.state.from = this.block.from;
    mounted.state.to = this.block.to;
    mounted.state.filePath = this.filePath;
    mounted.state.outline = this.outline;
    mounted.state.settings = this.settings;
    void nextTick(() => view.requestMeasure());
    return true;
  }

  destroy(dom: HTMLElement) {
    const mounted = diagramWidgetMounts.get(dom);
    if (!mounted) return;
    disconnectWidgetSizeObserver(dom);
    mounted.app.unmount();
    diagramWidgetMounts.delete(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function replaceDiagramWidgetSource(view: EditorView, state: DiagramWidgetState, value: string) {
  const from = clampOffset(state.from, view.state.doc.length);
  const to = clampOffset(state.to, view.state.doc.length);
  if (view.state.sliceDoc(from, to) === value) return;
  state.source = value;
  view.dispatch({ changes: { from, to, insert: value } });
}

function replaceTableWidgetSource(
  view: EditorView,
  state: TableWidgetState,
  value: string,
  history: "input" | "command",
  inputGroup: string | undefined,
  mounted: TableWidgetMount,
) {
  const from = clampOffset(state.from, view.state.doc.length);
  const to = clampOffset(state.to, view.state.doc.length);
  const nextInputGroup = history === "input" ? inputGroup ?? "cell" : null;
  const shouldIsolate = history === "command" || mounted.lastInputGroup !== nextInputGroup;
  mounted.lastInputGroup = nextInputGroup;
  if (!value) {
    if (activeTableEditor === mounted.handle) activeTableEditor = null;
    view.dispatch({
      changes: { from, to, insert: "" },
      selection: { anchor: from },
      effects: EditorView.scrollIntoView(from, { y: "center" }),
      annotations: isolateHistory.of("full"),
    });
    restoreEditorFocus(view);
    return;
  }
  view.dispatch({
    changes: { from, to, insert: value },
    annotations: shouldIsolate
      ? isolateHistory.of(history === "command" ? "full" : "before")
      : undefined,
  });
}

class RenderedMarkdownBlockWidget extends WidgetType {
  constructor(
    private readonly html: string,
    private readonly from: number,
    private readonly to: number,
    private readonly kind: ContinuousPreviewBlockKind,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof RenderedMarkdownBlockWidget
      && other.html === this.html
      && other.from === this.from
      && other.to === this.to
      && other.kind === this.kind;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = `cm-special-preview cm-special-preview-${this.kind}`;
    root.setAttribute("role", "button");
    root.setAttribute("aria-label", `${getPreviewBlockLabel(this.kind)}，按回车编辑源码`);
    root.tabIndex = 0;
    root.innerHTML = this.html;
    root.querySelectorAll<HTMLElement>("a, button, input, textarea, select").forEach((element) => {
      element.tabIndex = -1;
    });
    root.addEventListener("mousedown", (event) => event.preventDefault());
    root.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (anchor && shouldOpenPreviewLink(event)) {
        emit("openLinkHref", anchor.getAttribute("href") ?? "");
        return;
      }
      revealPreviewBlock(view, this.from);
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      revealPreviewBlock(view, this.from);
    });
    observeWidgetSize(root, view);
    root.querySelectorAll("img").forEach((image) => {
      image.addEventListener("load", () => view.requestMeasure(), { once: true });
    });
    return root;
  }

  destroy(dom: HTMLElement) {
    disconnectWidgetSizeObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function revealPreviewBlock(view: EditorView, offset: number) {
  view.dispatch({
    selection: { anchor: offset },
    effects: EditorView.scrollIntoView(offset, { y: "center" }),
  });
  view.focus();
}

function getPreviewBlockLabel(kind: ContinuousPreviewBlockKind): string {
  const labels: Record<ContinuousPreviewBlockKind, string> = {
    diagram: "流程图",
    image: "图片",
    table: "表格",
    math: "数学公式",
    code: "代码块",
    toc: "目录",
    callout: "提示块",
  };
  return labels[kind];
}

function observeWidgetSize(root: HTMLElement, view: EditorView) {
  if (typeof ResizeObserver === "undefined") return;
  const observer = new ResizeObserver(() => view.requestMeasure());
  observer.observe(root);
  widgetResizeObservers.set(root, observer);
}

function disconnectWidgetSizeObserver(root: HTMLElement) {
  widgetResizeObservers.get(root)?.disconnect();
  widgetResizeObservers.delete(root);
}

function handleEditorUpdate(update: ViewUpdate) {
  if (update.docChanged) {
    emit("update:modelValue", update.state.doc.toString());
  }
  if (update.docChanged || update.selectionSet) {
    emitSelection(update.view);
    refreshEmojiState(update.view);
    if (
      !restoringViewState
      && !activeTableEditor
      && props.settings.typewriterMode
      && props.settings.typewriterCenter
    ) {
      queueTypewriterCenter();
    }
  }
  if (update.viewportChanged && emojiRange.value) {
    updateEmojiPopoverPosition(update.view, emojiRange.value);
  }
}

function handleEditorKeydown(event: KeyboardEvent, view: EditorView): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    event.preventDefault();
    openEditorContextMenuAtCursor(view);
    return true;
  }
  if (emojiSuggestions.value.length > 0 && handleEmojiKeydown(event)) return true;
  if (event.key === "Tab" && allowNextTabFocus) {
    allowNextTabFocus = false;
    return false;
  }
  if (event.key !== "Escape" && !isModifierKey(event.key)) allowNextTabFocus = false;
  const shortcut = resolveEditorShortcut(event, getKeyboardShortcutPlatform());
  if (shortcut) {
    event.preventDefault();
    runShortcut(shortcut);
    return true;
  }

  if (event.key === "Escape" && props.settings.emojiAutocomplete === "escape") {
    if (refreshEmojiState(view, true)) {
      event.preventDefault();
      return true;
    }
  }

  if (event.key === "Escape") {
    clearEmojiSuggestions();
    allowNextTabFocus = true;
    return false;
  }

  const state = currentTextState(view);
  if (event.key === "Tab") {
    event.preventDefault();
    const tableNavigation = navigateMarkdownTableCell(state, event.shiftKey ? "previous" : "next");
    if (tableNavigation) {
      dispatchTextEdit(tableNavigation, view);
    } else {
      const result = indentSelection(
        state.value,
        state.selectionStart,
        state.selectionEnd,
        event.shiftKey,
        props.settings.indentSize,
      );
      dispatchTextEdit(result, view);
    }
    return true;
  }

  if (event.key === "Enter" && event.shiftKey) {
    event.preventDefault();
    dispatchTextEdit(insertMarkdownSoftBreak(state), view);
    return true;
  }

  if (event.key === "Enter") {
    const result = continueMarkdownBlock(state);
    if (result) {
      event.preventDefault();
      dispatchTextEdit(result, view);
      return true;
    }
  }

  if (event.key === " ") {
    const result = applyMarkdownSpaceShortcut(state);
    if (result) {
      event.preventDefault();
      dispatchTextEdit(result, view);
      return true;
    }
  }

  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Backspace") {
    const outdentResult = outdentMarkdownListOnBackspace(state);
    if (outdentResult) {
      event.preventDefault();
      dispatchTextEdit(outdentResult, view);
      return true;
    }
    const unwrapResult = unwrapMarkdownBlockOnBackspace(state);
    if (unwrapResult) {
      event.preventDefault();
      dispatchTextEdit(unwrapResult, view);
      return true;
    }
  }

  if (props.settings.autoPair && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const result = event.key === "Backspace"
      ? removeAutoPairOnBackspace(state)
      : applyAutoPair(state, event.key);
    if (result) {
      event.preventDefault();
      dispatchTextEdit(result, view);
      return true;
    }
  }
  return false;
}

function isModifierKey(key: string): boolean {
  return key === "Alt" || key === "Control" || key === "Meta" || key === "Shift";
}

function runShortcut(shortcut: ReturnType<typeof resolveEditorShortcut>) {
  if (!shortcut) return;
  switch (shortcut.type) {
    case "save":
      emit("save");
      break;
    case "saveAs":
      emit("saveAs");
      break;
    case "open":
      emit("open");
      break;
    case "command":
      runCommand(shortcut.command);
      break;
  }
}

function runCommand(command: EditorCommand, payload?: string) {
  const view = editorView.value;
  if (!view) return;
  if (command === "undo") {
    const shouldRestoreFocus = !view.hasFocus && !activeTableEditor;
    undo(view);
    if (shouldRestoreFocus) restoreEditorFocus(view);
    return;
  }
  if (command === "redo") {
    const shouldRestoreFocus = !view.hasFocus && !activeTableEditor;
    redo(view);
    if (shouldRestoreFocus) restoreEditorFocus(view);
    return;
  }
  const tableResult = runActiveTableCommand(command, payload);
  if (tableResult !== "inactive") return;

  switch (command) {
    case "copy":
      view.focus();
      if (props.settings.copyMarkdownAsPlainText) {
        void copyMarkdownSource();
      } else {
        document.execCommand("copy");
      }
      return;
    case "cut":
      view.focus();
      document.execCommand("cut");
      return;
    case "paste":
      view.focus();
      void pasteFromClipboard(false);
      return;
    case "pastePlainText":
      view.focus();
      void pasteFromClipboard(true);
      return;
    case "copyMarkdown":
      void copyMarkdownSource();
      return;
    case "copyHtml":
      void copyHtmlSource();
      return;
    case "copyPlainText":
      void copyPlainTextSource();
      return;
    case "openLink":
      openCurrentLink();
      return;
    case "selectAll":
      void selectRange(0, view.state.doc.length);
      return;
    case "goToDocumentStart":
      void selectAndJump(0);
      return;
    case "goToDocumentEnd":
      void selectAndJump(view.state.doc.length);
      return;
  }

  const result = resolveTextCommand(command, payload, currentTextState(view));
  if (result) {
    const shouldRestoreFocus = !view.hasFocus;
    dispatchTextEdit(result, view, "command");
    if (shouldRestoreFocus) restoreEditorFocus(view);
  }
}

function restoreEditorFocus(view: EditorView) {
  window.setTimeout(() => {
    if (editorView.value === view && !activeTableEditor) view.focus();
  }, 0);
}

function runActiveTableCommand(command: EditorCommand, payload?: string): ActiveTableCommandResult {
  if (!activeTableEditor) return "inactive";
  return activeTableEditor.runCommand(command, payload);
}

function resolveTextCommand(command: EditorCommand, payload: string | undefined, state: TextState): TextEditResult | null {
  switch (command) {
    case "paragraph": return setParagraphText(state);
    case "increaseHeading": return adjustHeadingLevel(state, "increase");
    case "decreaseHeading": return adjustHeadingLevel(state, "decrease");
    case "heading1": return setHeadingLevel(state, 1);
    case "heading2": return setHeadingLevel(state, 2);
    case "heading3": return setHeadingLevel(state, 3);
    case "heading4": return setHeadingLevel(state, 4);
    case "heading5": return setHeadingLevel(state, 5);
    case "heading6": return setHeadingLevel(state, 6);
    case "selectLine": return selectCurrentLine(state);
    case "selectParagraph": return selectCurrentParagraph(state);
    case "selectSentence": return selectCurrentSentence(state);
    case "selectWord": return selectCurrentWord(state);
    case "selectStyleScope": return selectCurrentStyleScope(state);
    case "deleteWord": return deleteCurrentWord(state);
    case "deleteSentence": return deleteCurrentSentence(state);
    case "deleteParagraph": return deleteCurrentParagraph(state);
    case "deleteStyleScope": return deleteCurrentStyleScope(state);
    case "duplicateLine": return duplicateMarkdownLines(state);
    case "deleteLine": return deleteMarkdownLines(state);
    case "moveLineUp": return moveMarkdownLines(state, "up");
    case "moveLineDown": return moveMarkdownLines(state, "down");
    case "indent": return indentCommand(state, false);
    case "outdent": return indentCommand(state, true);
    case "bold": return wrapMarkdownSelection(state, "**", "**", "加粗文本");
    case "italic": return wrapMarkdownSelection(state, "*", "*", "斜体文本");
    case "underline": return wrapMarkdownSelection(state, "<u>", "</u>", "下划线文本");
    case "strike": return wrapMarkdownSelection(state, "~~", "~~", "删除线文本");
    case "inlineCode": return wrapMarkdownSelection(state, "`", "`", "code");
    case "inlineMath": return wrapMarkdownSelection(state, "$", "$", "a^2 + b^2 = c^2");
    case "mathBlock": return formatMarkdownMathBlock(state);
    case "footnote": return insertMarkdownFootnoteTemplate(state);
    case "highlight": return wrapMarkdownSelection(state, "==", "==", "高亮文本");
    case "superscript": return wrapMarkdownSelection(state, "^", "^", "上标");
    case "subscript": return wrapMarkdownSelection(state, "~", "~", "下标");
    case "comment": return wrapHtmlCommentSelection(state);
    case "clearFormat": return clearMarkdownFormatting(state);
    case "link": return insertMarkdownLinkSelection(state, "链接文本");
    case "image": return insertMarkdownImageSelection(state, "图片描述");
    case "blockquote": return formatMarkdownLines(state, "blockquote");
    case "bulletList": return formatMarkdownLines(state, "bullet");
    case "orderedList": return formatMarkdownLines(state, "ordered");
    case "taskList": return formatMarkdownLines(state, "task");
    case "definitionList": return formatMarkdownLines(state, "definition");
    case "toggleTask": return toggleTaskAtSelection(state);
    case "hr": return insertMarkdownHorizontalRule(state);
    case "codeBlock": return formatMarkdownCodeBlock(state, props.settings.defaultCodeLanguage);
    case "table": return insertMarkdownTableTemplate(state);
    case "addTableRow": return editMarkdownTable(state, "row");
    case "addTableColumn": return editMarkdownTable(state, "column");
    case "addTableRowAbove": return insertMarkdownTableRow(state, "above");
    case "addTableRowBelow": return insertMarkdownTableRow(state, "below");
    case "addTableColumnLeft": return insertMarkdownTableColumn(state, "left");
    case "addTableColumnRight": return insertMarkdownTableColumn(state, "right");
    case "moveTableRowUp": return moveMarkdownTableRow(state, "up");
    case "moveTableRowDown": return moveMarkdownTableRow(state, "down");
    case "moveTableColumnLeft": return moveMarkdownTableColumn(state, "left");
    case "moveTableColumnRight": return moveMarkdownTableColumn(state, "right");
    case "selectTableCell": return selectMarkdownTablePart(state, "cell");
    case "selectTableRow": return selectMarkdownTablePart(state, "row");
    case "selectTableColumn": return selectMarkdownTablePart(state, "column");
    case "selectTable": return selectMarkdownTablePart(state, "table");
    case "deleteTableRow": return deleteMarkdownTablePart(state, "row");
    case "deleteTableColumn": return deleteMarkdownTablePart(state, "column");
    case "deleteTable": return deleteMarkdownTable(state);
    case "alignLeft": return alignMarkdownTable(state, "left");
    case "alignCenter": return alignMarkdownTable(state, "center");
    case "alignRight": return alignMarkdownTable(state, "right");
    case "toc": return insertMarkdownTocTemplate(state);
    case "frontmatter": return insertFrontMatterSnippet(state.value);
    case "callout": return insertMarkdownCalloutTemplate(state);
    case "mermaid": return insertMarkdownDiagramTemplate(state, "mermaid");
    case "flowchart": return insertMarkdownDiagramTemplate(state, "flowchart");
    case "setImageWidth": return setImageWidth(state, payload);
    default: return null;
  }
}

function indentCommand(state: TextState, outdent: boolean): TextEditResult {
  return indentSelection(
    state.value,
    state.selectionStart,
    state.selectionEnd,
    outdent,
    props.settings.indentSize,
  );
}

function setImageWidth(state: TextState, payload?: string): TextEditResult | null {
  return payload ? setImageWidthInLine(state, payload) : null;
}

function currentTextState(view = editorView.value): TextState {
  if (!view) return { value: "", selectionStart: 0, selectionEnd: 0 };
  const selection = view.state.selection.main;
  return {
    value: view.state.doc.toString(),
    selectionStart: selection.from,
    selectionEnd: selection.to,
  };
}

function dispatchTextEdit(
  result: TextEditResult,
  view = editorView.value,
  historyKind: "input" | "command" = "input",
) {
  if (!view) return;
  const currentValue = view.state.doc.toString();
  const selectionStart = clampOffset(result.selectionStart, result.value.length);
  const selectionEnd = clampOffset(result.selectionEnd, result.value.length);
  if (result.value === currentValue) {
    view.dispatch({ selection: { anchor: selectionStart, head: selectionEnd } });
    return;
  }
  const change = getContinuousTextChange(currentValue, result.value);
  if (!change) return;
  view.dispatch({
    changes: change,
    selection: { anchor: selectionStart, head: selectionEnd },
    scrollIntoView: false,
    annotations: historyKind === "command" ? isolateHistory.of("full") : undefined,
  });
}

function replaceDocument(value: string) {
  const view = editorView.value;
  if (!view || view.state.doc.toString() === value) return;
  const selection = view.state.selection.main;
  const change = getContinuousTextChange(view.state.doc.toString(), value);
  if (!change) return;
  view.dispatch({
    changes: change,
    selection: {
      anchor: clampOffset(selection.anchor, value.length),
      head: clampOffset(selection.head, value.length),
    },
    annotations: isolateHistory.of("full"),
  });
}

function insertImageMarkdown(src: string, alt = "图片") {
  insertText(`\n![${alt.replace(/[[\]]/g, "")}](${src})\n`);
}

function reserveImageInsertion(): string | null {
  const view = editorView.value;
  if (!view) return null;
  const placeholder = `\n<!--marko-image-${Date.now().toString(36)}-${++imagePlaceholderSequence}-->\n`;
  const position = view.state.selection.main.to;
  view.dispatch({
    changes: { from: position, insert: placeholder },
    selection: { anchor: position + placeholder.length },
    annotations: isolateHistory.of("full"),
  });
  return placeholder;
}

function replaceImagePlaceholder(
  placeholder: string,
  src: string | null,
  alt = "图片",
): boolean {
  const view = editorView.value;
  if (!view) return false;
  const source = view.state.doc.toString();
  const from = source.indexOf(placeholder);
  if (from < 0) return false;
  const insert = src === null ? "" : `\n![${alt.replace(/[[\]]/g, "")}](${src})\n`;
  view.dispatch({
    changes: { from, to: from + placeholder.length, insert },
    annotations: Transaction.addToHistory.of(false),
  });
  return true;
}

function insertText(text: string) {
  const view = editorView.value;
  if (!view) return;
  dispatchTextEdit(insertMarkdownAtSelection(currentTextState(view), text), view, "command");
}

async function selectRange(start: number, end: number, focus = true) {
  await nextTick();
  const view = editorView.value;
  if (!view) return;
  const anchor = clampOffset(start, view.state.doc.length);
  const head = clampOffset(end, view.state.doc.length);
  view.dispatch({
    selection: { anchor, head },
    effects: EditorView.scrollIntoView(head, { y: "center" }),
  });
  if (focus) view.focus();
}

async function jumpToSelection() {
  await nextTick();
  const view = editorView.value;
  if (!view) return;
  view.focus();
  view.dispatch({
    effects: EditorView.scrollIntoView(view.state.selection.main, { y: "center" }),
  });
}

async function jumpToLine(line: number) {
  const view = editorView.value;
  if (!view) return;
  const offset = getLineStartOffset(view.state.doc.toString(), line);
  await selectRange(offset, offset);
  await jumpToSelection();
}

async function selectAndJump(offset: number) {
  await selectRange(offset, offset);
  await jumpToSelection();
}

function getViewState(): ContinuousEditorViewState | null {
  const view = editorView.value;
  if (!view) return null;
  const selection = view.state.selection.main;
  return {
    anchor: selection.anchor,
    head: selection.head,
    scrollTop: getEditorScrollContainer()?.scrollTop ?? 0,
  };
}

async function restoreViewState(state: ContinuousEditorViewState | null | undefined) {
  if (!state) return;
  await nextTick();
  const view = editorView.value;
  if (!view) return;
  const restored = normalizeContinuousEditorViewState(state, view.state.doc.length);
  restoringViewState = true;
  try {
    view.dispatch({
      selection: {
        anchor: restored.anchor,
        head: restored.head,
      },
    });
  } finally {
    restoringViewState = false;
  }
  await nextTick();
  const scrollContainer = getEditorScrollContainer();
  if (scrollContainer) {
    scrollContainer.scrollTop = restored.scrollTop;
  }
}

function getEditorScrollContainer(): HTMLElement | null {
  return surfaceRef.value?.closest<HTMLElement>(".editor-scroll") ?? null;
}

defineExpose({
  runCommand,
  insertImageMarkdown,
  reserveImageInsertion,
  replaceImagePlaceholder,
  insertText,
  replaceDocument,
  selectRange,
  jumpToSelection,
  jumpToLine,
  getViewState,
  restoreViewState,
  focus() {
    editorView.value?.focus();
  },
});

function emitSelection(view: EditorView) {
  const selection = view.state.selection.main;
  const source = view.state.doc.toString();
  const selected = source.slice(selection.from, selection.to);
  emit(
    "selection",
    calculateSelectionStats(selected, source, selection.head, selection.from, selection.to),
  );
}

function refreshEmojiState(view: EditorView, force = false): boolean {
  if (
    props.settings.emojiAutocomplete === "off"
    || (props.settings.emojiAutocomplete === "escape" && !force)
  ) {
    clearEmojiSuggestions();
    return false;
  }
  const selection = view.state.selection.main;
  const range = getEmojiCompletionRange(view.state.doc.toString(), selection.from, selection.to);
  const nextQuery = range?.query ?? "";
  if (emojiQuery.value !== nextQuery) emojiActiveIndex.value = 0;
  emojiRange.value = range;
  emojiQuery.value = nextQuery;
  if (range) updateEmojiPopoverPosition(view, range);
  return Boolean(range);
}

function applyEmoji(value: string) {
  const view = editorView.value;
  const range = emojiRange.value;
  if (!view || !range) return;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: value },
    selection: { anchor: range.from + value.length },
  });
  clearEmojiSuggestions();
  view.focus();
}

function handleEmojiKeydown(event: KeyboardEvent): boolean {
  const suggestions = emojiSuggestions.value;
  if (suggestions.length === 0) return false;
  let nextIndex = emojiActiveIndex.value;
  if (event.key === "ArrowDown") nextIndex = (nextIndex + 1) % suggestions.length;
  else if (event.key === "ArrowUp") nextIndex = (nextIndex - 1 + suggestions.length) % suggestions.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = suggestions.length - 1;
  else if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    applyEmoji(suggestions[Math.min(nextIndex, suggestions.length - 1)]!.value);
    return true;
  } else if (event.key === "Escape") {
    event.preventDefault();
    clearEmojiSuggestions();
    allowNextTabFocus = true;
    return true;
  } else return false;

  event.preventDefault();
  emojiActiveIndex.value = nextIndex;
  return true;
}

function clearEmojiSuggestions() {
  emojiQuery.value = "";
  emojiRange.value = null;
  emojiActiveIndex.value = 0;
}

function updateEmojiPopoverPosition(view: EditorView, range: EmojiCompletionRange) {
  const surface = surfaceRef.value;
  const coordinates = view.coordsAtPos(range.to);
  if (!surface || !coordinates) return;
  const bounds = surface.getBoundingClientRect();
  const width = Math.min(280, Math.max(180, bounds.width - 16));
  const left = Math.max(8, Math.min(coordinates.left - bounds.left, bounds.width - width - 8));
  const estimatedHeight = 270;
  const top = coordinates.bottom + estimatedHeight <= window.innerHeight
    ? coordinates.bottom - bounds.top + 6
    : Math.max(8, coordinates.top - bounds.top - estimatedHeight - 6);
  emojiPopoverStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
  };
}

function queueTypewriterCenter() {
  if (typewriterFrame) window.cancelAnimationFrame(typewriterFrame);
  typewriterFrame = window.requestAnimationFrame(() => {
    typewriterFrame = 0;
    const view = editorView.value;
    if (!view || activeTableEditor) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center" }),
    });
  });
}

function handleEditorMouseDown(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position === null) return false;
  const link = findMarkdownLinkAtCursor(view.state.doc.toString(), position, position);
  if (!link) return false;
  event.preventDefault();
  emit("openLinkHref", link.href);
  return true;
}

function openCurrentLink() {
  const view = editorView.value;
  if (!view) return;
  const selection = view.state.selection.main;
  const link = findMarkdownLinkAtCursor(view.state.doc.toString(), selection.from, selection.to);
  if (!link) {
    emit("missingLink");
    return;
  }
  emit("openLinkHref", link.href);
}

function openEditorContextMenu(event: MouseEvent, view: EditorView): boolean {
  event.preventDefault();
  openEditorContextMenuAt(event.clientX, event.clientY, view);
  return true;
}

function openEditorContextMenuAtCursor(view: EditorView) {
  const coordinates = view.coordsAtPos(view.state.selection.main.head);
  const bounds = surfaceRef.value?.getBoundingClientRect();
  openEditorContextMenuAt(
    coordinates?.left ?? (bounds?.left ?? 0) + 16,
    coordinates?.bottom ?? (bounds?.top ?? 0) + 16,
    view,
  );
}

function openEditorContextMenuAt(x: number, y: number, view: EditorView) {
  const position = clampEditorContextMenuPosition(
    x,
    y,
    window.innerWidth,
    window.innerHeight,
    editorContextMenuItems.length,
  );
  contextMenuReturnFocus = view.contentDOM;
  contextMenu.value = { items: editorContextMenuItems, ...position };
  nextTick(() => getEditorContextMenuItems()[0]?.focus());
}

function getEditorContextMenuItems(): HTMLButtonElement[] {
  return Array.from(
    surfaceRef.value?.querySelectorAll<HTMLButtonElement>(".editor-context-menu [role='menuitem']") ?? [],
  );
}

function closeEditorContextMenu(restoreFocus = false) {
  const returnFocus = contextMenuReturnFocus;
  contextMenu.value = null;
  contextMenuReturnFocus = null;
  if (restoreFocus) nextTick(() => returnFocus?.focus());
}

function handleEditorContextMenuKeydown(event: KeyboardEvent) {
  const items = getEditorContextMenuItems();
  if (items.length === 0) return;
  const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
  let nextIndex = currentIndex;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % items.length;
  else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = items.length - 1;
  else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeEditorContextMenu(true);
    return;
  } else return;
  event.preventDefault();
  items[nextIndex]?.focus();
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && contextMenu.value) {
    event.preventDefault();
    closeEditorContextMenu(true);
  }
}

function handleWindowClick() {
  closeEditorContextMenu(false);
}

function runEditorContextMenuCommand(command: EditorCommand) {
  closeEditorContextMenu(false);
  runCommand(command);
}

function contextActionIcon(command: EditorCommand): unknown {
  return contextActionIcons[command] ?? Copy;
}

function handlePaste(event: ClipboardEvent, view: EditorView): boolean {
  const imageFiles = Array.from(event.clipboardData?.files ?? []).filter((item) => item.type.startsWith("image/"));
  if (imageFiles.length > 0) {
    event.preventDefault();
    for (const file of imageFiles) void emitImageFile(file, "paste");
    return true;
  }

  const text = event.clipboardData?.getData("text/plain") ?? "";
  const html = event.clipboardData?.getData("text/html") ?? "";
  if (!text && !html) return false;
  const result = pasteMarkdownContent(currentTextState(view), { text, html });
  if (!result) return false;
  event.preventDefault();
  dispatchTextEdit(result, view);
  return true;
}

function handleDrop(event: DragEvent, view: EditorView): boolean {
  const files = Array.from(event.dataTransfer?.files ?? []).filter((item) => item.type.startsWith("image/"));
  if (files.length === 0) return false;
  event.preventDefault();
  event.stopPropagation();
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position !== null) view.dispatch({ selection: { anchor: position } });
  for (const file of files) void emitImageFile(file, "drop");
  return true;
}

async function emitImageFile(file: File, source: "paste" | "drop") {
  const placeholder = reserveImageInsertion();
  if (!placeholder) return;
  emit("imageData", {
    name: file.name || `${source}-${Date.now()}.png`,
    file,
    placeholder,
  });
}

async function copyMarkdownSource() {
  const selected = getSelectedSource();
  if (!selected) return;
  try {
    await navigator.clipboard.writeText(selected);
  } catch {
    document.execCommand("copy");
  }
}

async function copyPlainTextSource() {
  const selected = getSelectedSource();
  if (!selected) return;
  try {
    await navigator.clipboard.writeText(getPlainTextFromMarkdownSelection(selected));
  } catch {
    document.execCommand("copy");
  }
}

async function copyHtmlSource() {
  const view = editorView.value;
  if (!view) return;
  const state = currentTextState(view);
  const selected = state.value.slice(state.selectionStart, state.selectionEnd);
  if (!selected) return;
  const html = getSelectedMarkdownHtml(
    true,
    state.value,
    state.value,
    0,
    state.selectionStart,
    state.selectionEnd,
    props.settings,
    props.filePath,
  );
  try {
    if (globalThis.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([selected], { type: "text/plain" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(html);
    }
  } catch {
    document.execCommand("copy");
  }
}

function getSelectedSource(): string {
  const view = editorView.value;
  if (!view) return "";
  const selection = view.state.selection.main;
  return view.state.sliceDoc(selection.from, selection.to);
}

async function pasteFromClipboard(plainText: boolean) {
  const view = editorView.value;
  if (!view) return;
  try {
    const payload = plainText ? { text: await navigator.clipboard.readText() } : await readClipboardTextPayload();
    const result = plainText
      ? pastePlainMarkdownText(currentTextState(view), payload.text ?? "")
      : pasteMarkdownContent(currentTextState(view), payload);
    if (result) dispatchTextEdit(result, view);
  } catch {
    document.execCommand("paste");
  }
}

async function readClipboardTextPayload(): Promise<{ text: string; html?: string }> {
  if (!navigator.clipboard.read) return { text: await navigator.clipboard.readText() };
  let text = "";
  let html = "";
  for (const item of await navigator.clipboard.read()) {
    if (item.types.includes("text/plain")) text = await (await item.getType("text/plain")).text();
    if (item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
  }
  return { text, html };
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.trunc(offset), length));
}
</script>

<style scoped>
.continuous-editor {
  position: relative;
  width: 100%;
  min-height: 100%;
  padding: 2.2rem 1.2rem 5rem;
}

.continuous-editor-host {
  width: 100%;
  max-width: var(--reading-max-width);
  min-height: calc(100vh - 140px);
  margin: 0 auto;
}

:deep(.cm-editor) {
  min-height: calc(100vh - 140px);
  background: transparent;
  color: var(--text-main);
  font-size: var(--editor-font-size);
}

:deep(.cm-editor.cm-focused) {
  outline: none;
}

:deep(.cm-scroller) {
  overflow: visible;
  font-family: Roboto, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.72;
  tab-size: var(--editor-tab-size, 2);
}

.is-source :deep(.cm-scroller) {
  font-family: "JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  line-height: 1.7;
}

:deep(.cm-content) {
  min-height: calc(100vh - 140px);
  padding: 0;
  caret-color: var(--text-main);
}

:deep(.cm-line) {
  min-height: 1.72em;
  border-left: 3px solid transparent;
  padding: 0.12rem 0.5rem;
  letter-spacing: 0;
  transition: color 0.12s ease, opacity 0.12s ease, background-color 0.12s ease;
}

:deep(.cm-line.cm-heading-gap:not(.cm-active-markdown-line)) {
  min-height: 1px;
  height: 1px;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 1px;
}

:deep(.cm-line.cm-block-gap:not(.cm-active-markdown-line)) {
  min-height: 0.35em;
  height: 0.35em;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0.35em;
}

:deep(.cm-line.cm-block-gap.cm-block-gap-extra:not(.cm-active-markdown-line)) {
  min-height: 1px;
  height: 1px;
  line-height: 1px;
}

:deep(.cm-activeLine) {
  background: rgba(59, 130, 246, 0.025);
}

:deep(.cm-find-match) {
  border-radius: 2px;
  background: color-mix(in srgb, #facc15 38%, transparent);
}

:deep(.cm-find-match-active) {
  box-shadow: inset 0 -2px 0 var(--accent-strong);
}

:deep(.cm-heading) {
  color: var(--text);
  font-weight: 650;
}

:deep(.cm-heading span) {
  text-decoration: none;
}

:deep(.cm-heading-1),
:deep(.cm-heading-2) {
  position: relative;
}

:deep(.cm-heading-1)::after,
:deep(.cm-heading-2)::after {
  position: absolute;
  inset-inline: 0;
  bottom: 4px;
  border-bottom: 1px solid var(--heading-rule);
  content: "";
  pointer-events: none;
}

:deep(.cm-heading-1) {
  font-size: 2rem;
  line-height: 1.28;
  padding-top: 0.82em;
  padding-bottom: 0.32em;
}

:deep(.cm-heading-1)::after {
  bottom: 5px;
}

:deep(.cm-heading-2) {
  font-size: 1.55rem;
  line-height: 1.34;
  padding-top: 0.68em;
  padding-bottom: 0.25em;
}

:deep(.cm-heading-3) {
  font-size: 1.28rem;
  line-height: 1.42;
  padding-top: 0.5em;
  padding-bottom: 0.18em;
}

:deep(.cm-heading-4),
:deep(.cm-heading-5),
:deep(.cm-heading-6) {
  font-size: 1.06rem;
  line-height: 1.5;
  padding-top: 0.36em;
  padding-bottom: 0.12em;
}

:deep(.cm-blockquote) {
  border-left-color: var(--border);
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  color: var(--muted);
  padding-left: 0.9rem;
}

:deep(.cm-code),
:deep(.cm-code-fence) {
  background: var(--panel-subtle);
  font-family: "JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, monospace;
  font-size: 0.9em;
  line-height: 1.62;
}

:deep(.cm-code-fence) {
  color: var(--muted);
}

:deep(.cm-math),
:deep(.cm-math-fence) {
  background: color-mix(in srgb, var(--accent-soft) 38%, transparent);
  font-family: "Cambria Math", "STIX Two Math", serif;
  text-align: center;
}

:deep(.cm-table) {
  border-bottom: 1px solid var(--border);
  font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 0.88em;
}

:deep(.cm-horizontal-rule) {
  min-height: 1px;
  border-top: 1px solid var(--border-strong);
  margin: 1.2rem 0.5rem;
  padding: 0;
}

:deep(.cm-frontmatter) {
  background: var(--panel-subtle);
  color: var(--muted);
  font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 0.88em;
}

:deep(.cm-focus-muted) {
  opacity: 0.28;
}

:deep(.cm-active-markdown-line) {
  opacity: 1;
}

:deep(.cm-special-preview) {
  display: block;
  width: 100%;
  margin: 0;
  color: var(--text-main);
  cursor: text;
  font-family: Roboto, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: var(--editor-font-size);
  line-height: 1.65;
  padding: 0.12rem 0.5rem;
}

:deep(.cm-special-preview:focus-visible) {
  outline: 2px solid rgba(59, 130, 246, 0.35);
  outline-offset: 2px;
}

:deep(.cm-special-preview > :first-child) {
  margin-top: 0;
}

:deep(.cm-special-preview > :last-child) {
  margin-bottom: 0;
}

:deep(.cm-special-preview img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  border-radius: 6px;
}

:deep(.cm-special-preview table) {
  display: table;
  width: 100%;
  border-collapse: collapse;
  background: var(--panel);
}

:deep(.cm-special-preview th),
:deep(.cm-special-preview td) {
  border: 1px solid var(--border);
  padding: 0.48rem 0.7rem;
  text-align: left;
}

:deep(.cm-special-preview th) {
  background: var(--panel-subtle);
  font-weight: 600;
}

:deep(.cm-special-preview pre) {
  overflow-x: auto;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-subtle);
  padding: 0.9rem 1rem;
}

:deep(.cm-special-preview pre code) {
  border: 0;
  background: transparent;
  font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
  font-size: 0.88em;
  padding: 0;
}

:deep(.cm-special-preview pre.code-with-line-numbers) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 0.8rem;
}

:deep(.cm-special-preview pre.code-with-line-numbers::before) {
  content: attr(data-line-numbers);
  border-right: 1px solid var(--border);
  color: var(--muted);
  font-family: "JetBrains Mono", Consolas, monospace;
  padding-right: 0.65rem;
  text-align: right;
  white-space: pre;
  user-select: none;
}

:deep(.cm-special-preview .math-block) {
  overflow-x: auto;
  background: color-mix(in srgb, var(--accent-soft) 38%, transparent);
  padding: 0.8rem 0.5rem;
  text-align: center;
}

:deep(.cm-special-preview .toc-inline),
:deep(.cm-special-preview .md-alert) {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-subtle);
  padding: 0.7rem 0.9rem;
}

:deep(.cm-special-preview .toc-inline ul) {
  margin: 0;
  padding-left: 1.2rem;
}

:deep(.cm-special-preview .toc-inline-item) {
  margin: 0.2rem 0;
}

:deep(.cm-special-preview .md-alert) {
  border-left: 4px solid var(--accent);
}

:deep(.cm-special-preview .diagram-source-panel) {
  display: none;
}

:deep(.cm-special-preview .mermaid),
:deep(.cm-special-preview .flowchart-render) {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-subtle);
  font-family: "JetBrains Mono", Consolas, monospace;
  padding: 0.9rem 1rem;
  white-space: pre;
}

:deep(.cm-special-preview-diagram .markdown-inner) {
  max-width: none;
  padding: 0;
}

:deep(.cm-special-preview-diagram .mermaid),
:deep(.cm-special-preview-diagram .flowchart-render) {
  overflow-x: auto;
  border: 0;
  background: transparent;
  font-family: inherit;
  padding: 0;
  white-space: normal;
}

:deep(.cm-special-preview-diagram .mermaid svg),
:deep(.cm-special-preview-diagram .flowchart-render svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

:deep(.cm-selectionBackground),
:deep(.cm-content ::selection) {
  background: rgba(59, 130, 246, 0.24) !important;
}

:deep(.cm-rendered-list-marker) {
  display: inline-block;
  color: var(--muted);
  white-space: pre;
}

:deep(.cm-bullet-list .cm-rendered-list-marker) {
  color: var(--text-main);
  font-size: 1.2em;
  font-weight: 650;
  line-height: 1;
}

.emoji-popover {
  position: absolute;
  z-index: 12;
  display: grid;
  gap: 0.25rem;
  max-height: min(270px, calc(100vh - 2rem));
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.35rem;
}

.emoji-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  min-height: 30px;
  border-radius: 4px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  padding: 0.42rem 0.55rem;
}

.emoji-option:hover,
.emoji-option.active {
  background: var(--accent-soft);
}

.emoji-option span:last-child {
  color: var(--muted);
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 0.78rem;
}

.editor-context-menu {
  position: fixed;
  z-index: 85;
  display: grid;
  width: 236px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.28rem;
}

.context-menu-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.46rem;
  min-height: 30px;
  border-radius: 4px;
  background: transparent;
  color: var(--text-main);
  cursor: pointer;
  font-size: 0.78rem;
  padding: 0.3rem 0.46rem;
  text-align: left;
}

.context-menu-item:hover,
.context-menu-item:focus-visible {
  background: var(--hover);
  color: var(--text);
}

.context-menu-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-strong) 62%, transparent);
  outline-offset: -2px;
}

.context-menu-item svg {
  width: 15px;
  height: 15px;
  color: var(--muted);
}

.context-menu-item span {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-menu-item small {
  color: var(--muted);
  font-size: 0.68rem;
  white-space: nowrap;
}

.context-menu-separator {
  height: 1px;
  background: var(--border);
  margin: 0.24rem 0.32rem;
}

@media print {
  .continuous-editor {
    padding: 0;
  }

  .continuous-editor-host,
  :deep(.cm-editor),
  :deep(.cm-content) {
    max-width: none;
    min-height: 0;
  }

  .emoji-popover,
  .editor-context-menu {
    display: none;
  }
}
</style>

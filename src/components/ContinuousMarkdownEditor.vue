<template>
  <section
    ref="surfaceRef"
    class="continuous-editor"
    :class="{
      'is-source': settings.sourceMode,
      'is-focus': settings.focusMode,
      'is-typewriter': settings.typewriterMode,
      'is-readonly': readonly,
      'is-default-width': settings.lineWidth === 860,
      'wrap-code-blocks': settings.codeWrap,
    }"
    :style="editorStyle"
    @mousedown.capture="handleEditorSurfaceMouseDownCapture"
    @contextmenu.capture="handleEditorSurfaceContextMenuCapture"
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
        @mousedown.prevent="applyEmoji(item.code)"
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
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { defaultHighlightStyle, indentRange, indentUnit, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
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
  type MouseSelectionStyle,
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
import CodeFenceLanguageSelector from "@/components/CodeFenceLanguageSelector.vue";
import MarkdownPreview from "@/components/MarkdownPreview.vue";
import VisualTableEditor from "@/components/VisualTableEditor.vue";
import {
  deleteSelectedAtomicMarkdownBlock,
  findAdjacentAtomicMarkdownBlock,
  findAtomicMarkdownBlockAt,
  handleBackspaceAfterHorizontalRule,
  type AtomicMarkdownBlockRange,
} from "@/utils/atomicBlockEditing";
import {
  applyContextualMarkdownTab,
  indentSelection,
  isMarkdownListItemAtOffset,
  mergeVisibleMarkdownBlockBoundary,
} from "@/utils/editorBlocks";
import {
  alignMarkdownTable,
  adjustHeadingLevel,
  applyDefaultCodeLanguageOnFenceKey,
  applyAutoPair,
  applyMarkdownSpaceShortcut,
  applyMarkdownTextInputShortcut,
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
  editMarkdownFrontMatterOnEnter,
  editMarkdownTable,
  formatMarkdownCodeBlock,
  formatMarkdownLines,
  formatMarkdownMathBlock,
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
  moveMarkdownBlocks,
  moveMarkdownLines,
  moveMarkdownTableColumn,
  moveMarkdownTableRow,
  navigateMarkdownTableCell,
  outdentMarkdownListOnBackspace,
  pasteMarkdownContent,
  pastePlainMarkdownText,
  projectMarkdownSelectionSemantics,
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
  splitMarkdownContainerParagraphOnPrimaryEnter,
  splitMarkdownParagraphOnEnter,
  toggleMarkdownInlineStyle,
  toggleTaskAtSelection,
  unwrapMarkdownBlockOnBackspace,
  wrapHtmlCommentSelection,
  wrapMarkdownSelection,
  type TextEditResult,
  type TextState,
} from "@/utils/editorCommands";
import {
  clampEditorContextMenuPosition,
  getEditorContextMenuItems as buildEditorContextMenuItems,
  isRawBlockContextMenuCommand,
  type EditorContextMenuCommand,
  type EditorContextMenuItem,
} from "@/utils/editorContextMenu";
import { navigateMarkdownDefinitionField } from "@/utils/definitionFieldNavigation";
import {
  continuousHistoryGroupDelay,
  getContinuousAtxHeadingContentRange,
  getContinuousBulletMarker,
  getContinuousDiagramLanguage,
  getContinuousMarkdownLinePresentations,
  getContinuousPreviewBlocks,
  getContinuousTextChange,
  getEmojiCompletionRange,
  normalizeContinuousEditorViewState,
  openInlineMathOnEscape,
  type ContinuousEditorViewState,
  type ContinuousMarkdownSyntaxTree,
  type ContinuousPreviewBlock,
  type ContinuousPreviewBlockKind,
  type EmojiCompletionRange,
} from "@/utils/continuousEditor";
import { splitMarkdownBlocks } from "@/utils/editorBlocks";
import {
  collectFootnoteSemantics,
  createMissingFootnoteDefinitionEdit,
  type FootnoteDefinitionSemantics,
  type FootnoteDocumentSemantics,
  type FootnoteReferenceLocation,
} from "@/utils/footnoteSemantics";
import {
  collectReferenceDefinitionSemantics,
  normalizeMarkdownReferenceLabel,
  type ReferenceDefinitionSemantics,
  type ReferenceDefinitionSourceValue,
} from "@/utils/referenceDefinitionSemantics";
import {
  collectInlineHtmlMarkupRanges,
  collectInlineHtmlSyntax,
  collectInlineMarkdownSyntax,
  collectInlineMathSyntax,
} from "@/utils/inlineSyntax";
import {
  collectCjkUnderscoreEmphasis,
  collectHighlightSyntax,
  collectStrikethroughSyntax,
  type StrikethroughSyntax,
} from "@/utils/inlineStyleSyntax";
import { collectInlineTextReplacementRanges } from "@/utils/inlineTextReplacement";
import { getKeyboardShortcutPlatform, resolveEditorShortcut } from "@/utils/keyboardShortcuts";
import { getDroppedImageSource } from "@/utils/imageDrop";
import {
  buildLocalMediaMarkup,
  getLocalMediaKind,
  type LocalMediaKind,
} from "@/utils/localMedia";
import {
  hasInlineMarkExtensions,
  isHighlightExtensionEnabled,
  isSubscriptExtensionEnabled,
  isSuperscriptExtensionEnabled,
} from "@/utils/editorSettings";
import {
  isMissingReferenceImageSource,
  getImageFromErrorFallback,
  prepareRenderedImages,
} from "@/utils/imageRendering";
import { renderMarkdownCodeSpanText } from "@/utils/codeSpan";
import {
  getCodeFenceInfoString,
  normalizeCodeFenceInfoString,
  type CodeFenceInfoString,
} from "@/utils/codeFenceLanguage";
import {
  resolveDefaultCodeLanguage,
  type DefaultCodeLanguageChannel,
} from "@/utils/codeLanguagePreference";
import {
  collectMarkdownAbbreviationDefinitions,
  collectMarkdownAbbreviations,
  getEmojiShortcodeMatches,
  getEmojiSuggestions,
  getMarkdownAbbreviationMatches,
  getMarkdownAutoLinkMatches,
  getMarkdownAlertPresentation,
  renderMarkdown,
  renderSmartPunctuationText,
  type MarkdownAbbreviation,
  type MarkdownAbbreviationDefinition,
  type MarkdownAbbreviationMatch,
  type MarkdownAutoLinkMatch,
} from "@/utils/markdown";
import {
  findMarkdownLinkAtCursor,
  isUnwrappedMarkdownLinkDestinationWithSpaces,
  readMarkdownInlineLink,
  readMarkdownReferenceLink,
  readMarkdownShortcutReferenceLink,
} from "@/utils/markdownLinks";
import { shouldOpenPreviewLink } from "@/utils/previewLinks";
import {
  getMarkdownIndentWidth,
  readMarkdownContainerPrefix,
} from "@/utils/markdownIndent";
import {
  incrementOrderedListNumber,
  normalizeOrderedListNumber,
} from "@/utils/orderedListNumber";
import {
  getGraphemeBoundaries,
  mapRenderedTextBoundariesToSource,
  mapRenderedTextOffsetToSource,
  mapUnwrappedTextOffsetToSource,
  snapTextOffsetToGraphemeBoundary,
  type RenderedSourceSyntax,
} from "@/utils/renderedTextOffset";
import { sanitizeMarkdownHtml } from "@/utils/sanitizeMarkdownHtml";
import {
  escapeRawBlockContentAsPre,
  getRawBlockSelection,
  handleRawBlockBoundaryDelete,
  handleRawBlockEnter,
  type RawBlockSelection,
} from "@/utils/rawBlockEditing";
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

const props = withDefaults(defineProps<{
  modelValue: string;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
  readonly?: boolean;
  findMatches?: Array<{ index: number; length: number }>;
  activeFindIndex?: number;
}>(), {
  readonly: false,
});

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
const contextMenu = ref<{
  items: EditorContextMenuItem<EditorContextMenuCommand>[];
  rawBlock: RawBlockSelection | null;
  x: number;
  y: number;
} | null>(null);
const previewCompartment = new Compartment();
const contentAttributesCompartment = new Compartment();
const findDecorationsCompartment = new Compartment();
const editabilityCompartment = new Compartment();
const codeIndentationCompartment = new Compartment();
const allowReadonlyDocumentUpdate = Annotation.define<boolean>();
const setRenderedTripleClickSelection = StateEffect.define<EditorSelection | null>();
const renderedTripleClickSelectionField = StateField.define<EditorSelection | null>({
  create: () => null,
  update(value, transaction) {
    if (transaction.docChanged) return null;
    for (const effect of transaction.effects) {
      if (effect.is(setRenderedTripleClickSelection)) return effect.value;
    }
    return value && !transaction.newSelection.eq(value) ? null : value;
  },
});
let previewDocumentCache: {
  source: string;
  tree: ContinuousMarkdownSyntaxTree;
  markdownBlocks: ReturnType<typeof splitMarkdownBlocks>;
  previewBlocks: ContinuousPreviewBlock[];
  abbreviationDefinitions: MarkdownAbbreviationDefinition[];
  abbreviations: MarkdownAbbreviation[];
  referenceDefinitions: ReferenceDefinitionSemantics[];
} | null = null;
const specialPreviewWidgetCache = new Map<string, WidgetType>();
interface RenderedMarkdownWidgetState {
  kind: ContinuousPreviewBlockKind;
  from: number;
  to: number;
  source: string;
}

const renderedMarkdownWidgetRoots = new Map<HTMLElement, RenderedMarkdownWidgetState>();
let activeTableEditor: VisualTableEditorHandle | null = null;
const tableWidgetMounts = new WeakMap<HTMLElement, TableWidgetMount>();
const tableWidgetRoots = new Set<HTMLElement>();
const diagramWidgetMounts = new WeakMap<HTMLElement, DiagramWidgetMount>();
let diagramWidgetDestroyDepth = 0;
const codeLanguageWidgetMounts = new WeakMap<HTMLElement, VueApplication>();
const lastCodeLanguage = ref("");
const widgetResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();
const recentImageClicks = new WeakMap<EditorView, {
  document: EditorState["doc"];
  from: number;
  to: number;
}>();
const recentRenderedTextClicks = new WeakMap<EditorView, {
  document: EditorState["doc"];
  from: number;
  to: number;
  useCachedWordOnSecondPress: boolean;
}>();
const pendingRenderedTextDoubleClicks = new WeakMap<EditorView, {
  document: EditorState["doc"];
  selection: EditorSelection;
}>();
const pendingRenderedTextTripleClicks = new WeakMap<EditorView, {
  document: EditorState["doc"];
  selection: EditorSelection;
}>();
const footnoteTooltipMounts = new WeakMap<HTMLElement, {
  tooltip: HTMLElement;
  hideTimer: number | null;
}>();
let footnoteTooltipSequence = 0;
let typewriterFrame = 0;
let restoringViewState = false;
let allowNextTabFocus = false;
let imagePlaceholderSequence = 0;
let contextMenuReturnFocus: HTMLElement | null = null;
let stopPointerSelectionTracking: (() => void) | null = null;
let stopEditorLinePointerFinalizer: (() => void) | null = null;
let editorLinePointerGesture = 0;
let focusedAtomicBlock: {
  block: AtomicMarkdownBlockRange;
  dom: HTMLElement;
} | null = null;

const emojiSuggestions = computed(() => (emojiQuery.value ? getEmojiSuggestions(emojiQuery.value) : []));
const editorStyle = computed(() => ({
  "--reading-max-width": `${props.settings.lineWidth}px`,
  "--editor-font-size": `${props.settings.fontSize}px`,
  "--editor-tab-size": String(props.settings.codeIndentSize),
}));

function resetPointerGestureTracking() {
  stopPointerSelectionTracking?.();
  stopEditorLinePointerFinalizer?.();
  const view = editorView.value;
  if (view) stopNativeEditorMouseSelection(view);
  editorLinePointerGesture += 1;
}

function forwardExternalTablePointerEvent(
  event: MouseEvent,
  type: "mousedown" | "contextmenu",
): boolean {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return false;
  if (Array.from(tableWidgetRoots).some((root) => root.contains(target))) return false;

  const candidates: Array<{
    root: HTMLElement;
    mounted: TableWidgetMount;
    candidate: ExternalTablePointerCandidate;
  }> = [];
  for (const root of tableWidgetRoots) {
    const mounted = tableWidgetMounts.get(root);
    const candidate = mounted?.handle?.getExternalPointerCandidate(event, type);
    if (mounted && candidate) candidates.push({ root, mounted, candidate });
  }
  candidates.sort((left, right) => {
    if (left.candidate.pending !== right.candidate.pending) {
      return left.candidate.pending ? -1 : 1;
    }
    const distance = left.candidate.distance - right.candidate.distance;
    if (distance !== 0) return distance;
    const position = left.root.compareDocumentPosition(right.root);
    if (!(position & Node.DOCUMENT_POSITION_DISCONNECTED)) {
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    }
    return left.mounted.state.from - right.mounted.state.from;
  });

  const selected = candidates[0]?.mounted.handle;
  if (!selected?.handleExternalPointerEvent(event, type)) return false;
  event.stopPropagation();
  return true;
}

function handleEditorSurfaceMouseDownCapture(event: MouseEvent) {
  if (event.button === 0) resetPointerGestureTracking();
  forwardExternalTablePointerEvent(event, "mousedown");
}

function handleEditorSurfaceContextMenuCapture(event: MouseEvent) {
  forwardExternalTablePointerEvent(event, "contextmenu");
}

interface NativeEditorPointerState {
  inputState?: {
    draggedContent?: unknown;
    mouseSelection?: {
      destroy: () => void;
    } | null;
  };
}

function stopNativeEditorMouseSelection(view: EditorView) {
  const pointerState = (view as unknown as NativeEditorPointerState).inputState;
  if (!pointerState || pointerState.draggedContent != null) return;
  pointerState.mouseSelection?.destroy();
}

function handleEditorWindowBlur() {
  const view = editorView.value;
  if (view) stopNativeEditorMouseSelection(view);
}

const contextActionIcons: Partial<Record<EditorContextMenuCommand, unknown>> = {
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
  copyRawBlockContent: Copy,
  indentRawBlockSelection: Code,
  indentRawBlockAll: Code,
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
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        EditorView.lineWrapping,
        Prec.high(EditorView.mouseSelectionStyle.of(createEditorMouseSelectionStyle)),
        Prec.high(EditorView.inputHandler.of(handleMarkdownTextInput)),
        editabilityCompartment.of(createEditabilityExtension()),
        codeIndentationCompartment.of(createCodeIndentationExtension()),
        renderedTripleClickSelectionField,
        previewCompartment.of(createLivePreviewExtension()),
        contentAttributesCompartment.of(createContentAttributesExtension()),
        findDecorationsCompartment.of(createFindDecorationsExtension()),
        Prec.high(EditorView.domEventHandlers({
          keydown: handleEditorKeydown,
          copy: handleCopy,
          paste: handlePaste,
          drop: handleDrop,
          mousedown: handleEditorMouseDown,
          contextmenu: openEditorContextMenu,
        })),
        EditorView.updateListener.of(handleEditorUpdate),
      ],
    }),
  });
  editorView.value.dom.addEventListener("click", handleEditorCapturedClick, true);
  editorView.value.dom.addEventListener("dblclick", handleEditorCapturedDoubleClick, true);
  rememberCodeLanguageAtSelection(editorView.value);
  emitSelection(editorView.value);
  window.addEventListener("click", handleWindowClick);
  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("blur", handleEditorWindowBlur);
});

onBeforeUnmount(() => {
  hostRef.value
    ?.querySelectorAll<HTMLTextAreaElement>(".diagram-box.show-source .diagram-source-editor")
    .forEach((editor) => editor.dispatchEvent(new FocusEvent("blur", { bubbles: true })));
  if (typewriterFrame) window.cancelAnimationFrame(typewriterFrame);
  resetPointerGestureTracking();
  window.removeEventListener("click", handleWindowClick);
  window.removeEventListener("keydown", handleWindowKeydown);
  window.removeEventListener("blur", handleEditorWindowBlur);
  editorView.value?.dom.removeEventListener("click", handleEditorCapturedClick, true);
  tableWidgetRoots.clear();
  editorView.value?.dom.removeEventListener("dblclick", handleEditorCapturedDoubleClick, true);
  editorView.value?.destroy();
  editorView.value = null;
});

watch(
  () => props.modelValue,
  (value) => {
    const view = editorView.value;
    if (
      !view
      || view.state.doc.sliceString(0, view.state.doc.length, getDocumentLineBreak(value)) === value
    ) return;
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: {
        anchor: Math.min(selection.anchor, value.length),
        head: Math.min(selection.head, value.length),
      },
      annotations: [
        Transaction.addToHistory.of(false),
        allowReadonlyDocumentUpdate.of(true),
      ],
    });
  },
  { flush: "post" },
);

const outlineSignature = computed(() => props.outline
  .map((item) => `${item.level}:${item.line}:${item.id}:${item.title}`)
  .join("\n"));

watch(
  [() => props.filePath, outlineSignature, () => props.settings],
  () => {
    specialPreviewWidgetCache.clear();
    editorView.value?.dispatch({
      effects: previewCompartment.reconfigure(createLivePreviewExtension()),
    });
  },
  { deep: true, flush: "post" },
);

watch(
  () => props.readonly,
  () => {
    const view = editorView.value;
    if (view) {
      specialPreviewWidgetCache.clear();
      const effects = [
        editabilityCompartment.reconfigure(createEditabilityExtension()),
        previewCompartment.reconfigure(createLivePreviewExtension()),
      ];
      view.dispatch({ effects });
    }
    renderedMarkdownWidgetRoots.forEach((widget, root) => {
      syncRenderedMarkdownBlockInteraction(root, widget.kind, props.readonly);
    });
  },
  { flush: "post" },
);

watch(
  () => props.settings.spellcheck,
  () => {
    editorView.value?.dispatch({
      effects: contentAttributesCompartment.reconfigure(createContentAttributesExtension()),
    });
  },
  { flush: "post" },
);

watch(
  () => props.settings.codeIndentSize,
  () => {
    editorView.value?.dispatch({
      effects: codeIndentationCompartment.reconfigure(createCodeIndentationExtension()),
    });
  },
  { flush: "post" },
);

watch(
  [() => props.findMatches, () => props.activeFindIndex],
  () => {
    editorView.value?.dispatch({
      effects: findDecorationsCompartment.reconfigure(createFindDecorationsExtension()),
    });
  },
  { deep: true, flush: "post" },
);

function createContentAttributesExtension(): Extension {
  return EditorView.contentAttributes.of({
    lang: "en",
    spellcheck: props.settings.spellcheck ? "true" : "false",
  });
}

function createCodeIndentationExtension(): Extension {
  return indentUnit.of(" ".repeat(props.settings.codeIndentSize));
}


function createEditabilityExtension(): Extension {
  return [
    EditorState.readOnly.of(props.readonly),
    EditorView.editable.of(!props.readonly),
    EditorState.transactionFilter.of((transaction) => {
      if (
        props.readonly
        && transaction.docChanged
        && !transaction.annotation(allowReadonlyDocumentUpdate)
      ) {
        return [];
      }
      return transaction;
    }),
  ];
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
    ["doc", "selection", renderedTripleClickSelectionField],
    (state) => buildLivePreviewDecorations(state, focusMode),
  );
}

function buildLivePreviewDecorations(state: EditorState, focusMode: boolean): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const inlineMarkerRanges: Array<{ from: number; to: number }> = [];
  const source = state.doc.toString();
  const tree = syntaxTree(state);
  const cachedDocument = getCachedPreviewDocument(source);
  const allPreviewBlocks = cachedDocument.previewBlocks;
  const abbreviationDefinitions = cachedDocument.abbreviationDefinitions;
  const referenceDefinitions = cachedDocument.referenceDefinitions;
  const hiddenAbbreviationDefinitions = abbreviationDefinitions.filter((definition) => (
    props.readonly || !selectionTouchesRange(state, definition.from, definition.to)
  ));
  const semanticReferenceDefinitions = referenceDefinitions.filter((definition) => (
    props.readonly || !selectionTouchesRange(state, definition.from, definition.to)
  ));
  const footnotes = props.settings.extensions.footnote
    ? collectFootnoteSemantics(source)
    : null;
  const semanticFootnoteDefinitions = footnotes?.definitions.filter((definition) => (
    props.readonly || !selectionTouchesRange(state, definition.from, definition.to)
  )) ?? [];
  const inlineProtectedBlocks = [
    ...allPreviewBlocks,
    ...abbreviationDefinitions,
    ...referenceDefinitions,
    ...(footnotes?.definitions ?? []),
    ...cachedDocument.markdownBlocks.filter((block) => (
      ["code", "math", "table", "html", "frontmatter"].includes(block.type)
    )).map((block) => ({ from: block.start, to: block.end })),
  ];
  const activeCodeBlocks = props.readonly
    ? []
    : allPreviewBlocks.filter((block) => (
      block.kind === "code" && selectionIntersectsBlock(state, block)
    ));
  const activeMathBlocks = props.readonly || !props.settings.extensions.math
    ? []
    : allPreviewBlocks.filter((block) => (
      block.kind === "math" && selectionIntersectsBlock(state, block)
    ));
  const previewBlocks = allPreviewBlocks
    .filter((block) => block.kind !== "html" || props.settings.extensions.html)
    .filter((block) => block.kind !== "math" || props.settings.extensions.math)
    .filter((block) => (
      block.kind === "table"
      || props.readonly
      || !selectionIntersectsBlock(state, block)
    ));
  const presentations = getContinuousMarkdownLinePresentations(
    source,
    state.selection.main.head,
    focusMode,
    cachedDocument.markdownBlocks,
    !props.readonly && !keepsRenderedPreviewForSelection(state),
    cachedDocument.tree,
    allPreviewBlocks,
  );
  const hiddenSoftBreakNewlines = getHiddenSoftBreakNewlines(
    state,
    inlineProtectedBlocks,
    presentations,
  );
  markHiddenAbbreviationGapPresentations(state, presentations, hiddenAbbreviationDefinitions);
  const previewWidgetSpacings = preparePreviewWidgetSpacings(
    previewBlocks,
    presentations,
    source,
  );
  const orderedCounters = new Map<string, string>();
  let blockCursor = 0;
  let previousBlockIndex = -1;

  for (const definition of hiddenAbbreviationDefinitions) {
    const line = state.doc.lineAt(definition.from);
    ranges.push(Decoration.line({
      attributes: { class: "cm-abbreviation-definition-hidden" },
    }).range(line.from));
    if (definition.to > definition.from) {
      ranges.push(Decoration.replace({}).range(definition.from, definition.to));
    }
  }

  for (const definition of semanticReferenceDefinitions) {
    const line = state.doc.lineAt(definition.from);
    const presentation = presentations[line.number - 1];
    const container = getDefinitionContainerPresentation(
      source,
      definition.from,
      definition.label.from,
      1,
    );
    ranges.push(Decoration.replace({
      block: true,
      widget: new ReferenceDefinitionWidget(
        definition,
        Math.max(presentation?.quoteDepth ?? 0, container.quoteDepth),
        presentation?.listDepth ?? container.listDepth,
        hasFollowingDefinitionGap(source, definition.to),
      ),
    }).range(definition.from, getDefinitionDecorationTo(source, definition.to)));
  }

  for (const definition of semanticFootnoteDefinitions) {
    const line = state.doc.lineAt(definition.from);
    const presentation = presentations[line.number - 1];
    const container = getDefinitionContainerPresentation(
      source,
      definition.from,
      definition.label.from,
      2,
    );
    ranges.push(Decoration.replace({
      block: true,
      widget: new FootnoteDefinitionWidget(
        definition,
        Math.max(presentation?.quoteDepth ?? 0, container.quoteDepth),
        presentation?.listDepth ?? container.listDepth,
        hasFollowingDefinitionGap(source, definition.to),
      ),
    }).range(definition.from, getDefinitionDecorationTo(source, definition.to)));
  }

  for (const line of presentations) {
    if (rangeInsidePreviewPresentation(line.from, line.to, previewBlocks)) continue;
    if (rangeInsidePreviewBlock(line.from, line.to, hiddenAbbreviationDefinitions)) continue;
    if (rangeInsidePreviewBlock(line.from, line.to, semanticReferenceDefinitions)) continue;
    if (rangeInsideSemanticDefinition(line.from, line.to, semanticFootnoteDefinitions)) continue;
    if (!hiddenSoftBreakNewlines.has(line.from - 1)) {
      const attributes: Record<string, string> = { class: line.className };
      if (line.kind === "horizontal-rule" && !line.active) {
        attributes.contenteditable = "false";
        attributes.tabindex = "-1";
        attributes.role = "separator";
        attributes["aria-label"] = "\u5206\u9694\u7ebf";
      }
      const styleVariables: string[] = [];
      if (line.quoteDepth > 0) {
        styleVariables.push(
          `--blockquote-indent:${line.quoteDepth * 15 + Math.max(0, line.quoteDepth - 1) * 4}px`,
          `--blockquote-guide-width:${Math.max(0, line.quoteDepth - 1) * 19}px`,
        );
      }
      if (
        line.listDepth !== null
        && ["paragraph", "blockquote", "heading"].includes(line.kind)
      ) {
        styleVariables.push(`--list-continuation-indent:${(line.listDepth + 1) * 30}px`);
      }
      if (
        line.listDepth !== null
        && line.className.includes("cm-list-raw-block")
      ) {
        styleVariables.push(`--raw-list-indent:${(line.listDepth + 1) * 30}px`);
      }
      if (
        (line.level !== null || line.kind === "horizontal-rule" || line.listThematicBreak)
        && (line.quoteDepth > 0 || line.listDepth !== null)
      ) {
        const contentOffsets = ["0px"];
        if (line.quoteDepth > 0) contentOffsets.push("var(--blockquote-indent, 15px)");
        if (line.listDepth !== null) contentOffsets.push(`${(line.listDepth + 1) * 30}px`);
        styleVariables.push(`--container-content-start:calc(${contentOffsets.join(" + ")})`);
      }
      if (styleVariables.length > 0) attributes.style = styleVariables.join(";");
      ranges.push(Decoration.line({ attributes }).range(line.from));
    }
    const lineSource = source.slice(line.from, line.to);
    const listContext = ["bullet-list", "ordered-list", "task-list"].includes(line.kind)
      ? getMarkdownListContext(state, line.from, lineSource, line.quotePrefixEnd)
      : { depth: null, bulletDepth: null, orderedListIdentity: null };
    while (
      blockCursor < cachedDocument.markdownBlocks.length - 1
      && line.from >= cachedDocument.markdownBlocks[blockCursor]!.end
    ) {
      blockCursor += 1;
    }
    const currentBlock = cachedDocument.markdownBlocks[blockCursor];
    if (currentBlock?.index !== previousBlockIndex) {
      orderedCounters.clear();
      previousBlockIndex = currentBlock?.index ?? -1;
    }
    const listMarkers = line.kind === "horizontal-rule"
      || (line.active && line.listThematicBreak)
      ? []
      : getRenderedListMarkers(
        state,
        line.from,
        lineSource,
        line.kind,
        listContext.depth ?? line.listDepth,
        listContext.bulletDepth ?? line.bulletDepth,
        line.quotePrefixEnd,
        listContext,
        orderedCounters,
      );
    const alertMarker = !line.active ? line.alert?.marker ?? null : null;
    if (alertMarker && line.alert?.kindRange) {
      inlineMarkerRanges.push(alertMarker);
      ranges.push(Decoration.replace({
        widget: new RenderedAlertTitleWidget(
          line.alert.kind,
          line.alert.kindRange.from,
          line.alert.kindRange.to,
        ),
      }).range(alertMarker.from, alertMarker.to));
    } else if (listMarkers.length > 0) {
      const innermostContentFrom = line.from + listMarkers[listMarkers.length - 1]!.to;
      for (const listMarker of listMarkers) {
        inlineMarkerRanges.push({
          from: line.from + listMarker.from,
          to: line.from + listMarker.to,
        });
        ranges.push(Decoration.replace({
          widget: new RenderedListMarkerWidget(
            listMarker.text,
            listMarker.kind,
            listMarker.depth,
            listMarker.checked,
            listMarker.checkboxFrom === null ? null : line.from + listMarker.checkboxFrom,
            innermostContentFrom,
            Boolean(listMarker.overlapPrevious),
          ),
        }).range(
          line.from + listMarker.from,
          line.from + listMarker.to,
        ));
      }
    } else if (line.hiddenMarker && line.hiddenMarker.to > line.hiddenMarker.from) {
      inlineMarkerRanges.push({ from: line.hiddenMarker.from, to: line.hiddenMarker.to });
      ranges.push(Decoration.replace({}).range(line.hiddenMarker.from, line.hiddenMarker.to));
    }
    if (
      !line.active
      && line.listThematicBreak
      && line.listThematicBreak.to > line.listThematicBreak.from
    ) {
      inlineMarkerRanges.push(line.listThematicBreak);
      ranges.push(Decoration.replace({
        widget: new RenderedListThematicBreakWidget(),
      }).range(line.listThematicBreak.from, line.listThematicBreak.to));
    }
    for (const marker of line.innerMarkers) {
      if (marker.to <= marker.from) continue;
      inlineMarkerRanges.push(marker);
      ranges.push(Decoration.replace({}).range(marker.from, marker.to));
    }
    if (line.trailingMarker && line.trailingMarker.to > line.trailingMarker.from) {
      inlineMarkerRanges.push({ from: line.trailingMarker.from, to: line.trailingMarker.to });
      ranges.push(Decoration.replace({}).range(line.trailingMarker.from, line.trailingMarker.to));
    }
  }
  hiddenSoftBreakNewlines.forEach((newline) => {
    ranges.push(Decoration.replace({ widget: new SoftBreakWidget() }).range(newline, newline + 1));
  });
  const inlineWidgetRanges = addInlineWidgetDecorations(
    state, ranges, inlineProtectedBlocks, source, footnotes,
  );
  if (footnotes) addFootnoteBacklinkDecorations(ranges, footnotes, semanticFootnoteDefinitions);
  addInlinePreviewDecorations(state, ranges, inlineProtectedBlocks, inlineWidgetRanges);
  addPlainTextSemanticDecorations(
    state,
    ranges,
    inlineProtectedBlocks,
    [...inlineMarkerRanges, ...inlineWidgetRanges],
    cachedDocument.abbreviations,
  );
  for (const [index, block] of previewBlocks.entries()) {
    if (block.to <= block.from) continue;
    const decorationTo = getPreviewDecorationTo(block, source);
    if (decorationTo <= block.from) continue;
    const spacing = previewWidgetSpacings[index]
      ?? { collapseBefore: false, collapseAfter: false };
    ranges.push(Decoration.replace({
      block: true,
      widget: getCachedSpecialPreviewWidget(block, source, spacing),
    }).range(block.from, decorationTo));
  }
  const activeFenceLanguageBlocks = [
    ...activeCodeBlocks,
    ...activeMathBlocks,
  ].filter((block) => getCodeFenceInfoString(block.source));
  for (const block of activeFenceLanguageBlocks) {
    if (block.to <= block.from) continue;
    ranges.push(Decoration.widget({
      block: true,
      side: -1,
      widget: new ActiveCodeLanguageWidget(
        block.source,
        block.from,
        block.quoteDepth,
        block.listDepth,
      ),
    }).range(block.to));
  }
  for (const block of activeMathBlocks) {
    if (block.to <= block.from) continue;
    ranges.push(Decoration.widget({
      block: true,
      side: 1,
      widget: createActiveMathPreviewWidget(block, source),
    }).range(block.to));
  }
  return Decoration.set(ranges, true);
}

function getDefinitionContainerPresentation(
  source: string,
  definitionFrom: number,
  labelFrom: number,
  markerLength: number,
): { quoteDepth: number; listDepth: number | null } {
  const labelMarker = Math.max(definitionFrom, labelFrom - markerLength);
  const prefix = source.slice(definitionFrom, labelMarker);
  const quotePrefix = prefix.match(/^ {0,3}(?:>[ \t]?)+/)?.[0] ?? "";
  const quoteDepth = quotePrefix.match(/>/g)?.length ?? 0;
  let remaining = prefix.slice(quotePrefix.length);
  let listDepth = -1;

  for (let depth = 0; depth < 16; depth += 1) {
    const marker = remaining.match(/^[ \t]{0,3}(?:[-+*]|\d+[.)])[ \t]+/);
    if (!marker) break;
    listDepth += 1;
    remaining = remaining.slice(marker[0].length);
  }

  return {
    quoteDepth,
    listDepth: listDepth >= 0 ? listDepth : null,
  };
}

function getDefinitionDecorationTo(source: string, definitionTo: number): number {
  if (source.slice(definitionTo, definitionTo + 2) === "\r\n") return definitionTo + 2;
  return source[definitionTo] === "\n" ? definitionTo + 1 : definitionTo;
}

function hasFollowingDefinitionGap(source: string, definitionTo: number): boolean {
  return /^(?:\r\n|\n)[ \t]*(?:\r\n|\n)/.test(source.slice(definitionTo));
}


function markHiddenAbbreviationGapPresentations(
  state: EditorState,
  presentations: ReturnType<typeof getContinuousMarkdownLinePresentations>,
  hiddenDefinitions: Array<{ from: number }>,
) {
  const hiddenLines = new Set(hiddenDefinitions.map((definition) => (
    state.doc.lineAt(definition.from).number - 1
  )));
  const visited = new Set<number>();

  for (const definitionLine of hiddenLines) {
    if (visited.has(definitionLine)) continue;
    let start = definitionLine;
    let end = definitionLine;
    while (
      start > 0
      && (hiddenLines.has(start - 1) || presentations[start - 1]?.kind === "blank")
    ) start -= 1;
    while (
      end + 1 < presentations.length
      && (hiddenLines.has(end + 1) || presentations[end + 1]?.kind === "blank")
    ) end += 1;

    for (let index = start; index <= end; index += 1) {
      if (hiddenLines.has(index)) visited.add(index);
    }
    if (start === 0 || end + 1 >= presentations.length) continue;

    const gaps = presentations.slice(start, end + 1).filter((presentation) => (
      presentation.kind === "blank" && presentation.className.includes("cm-block-gap")
    ));
    for (const gap of gaps.slice(1)) {
      if (!gap.className.includes("cm-block-gap-extra")) {
        gap.className += " cm-block-gap-extra";
      }
    }
  }
}

function getHiddenSoftBreakNewlines(
  state: EditorState,
  protectedBlocks: Array<{ from: number; to: number }>,
  presentations: ReturnType<typeof getContinuousMarkdownLinePresentations>,
): Set<number> {
  const result = new Set<number>();
  if (props.settings.preserveSingleLineBreaks) return result;

  const source = state.doc.toString();
  const tree = syntaxTree(state);
  const hardBreakNewlines = new Set<number>();
  const inlineCodeRanges: Array<{ from: number; to: number }> = [];
  const activeLine = props.readonly || keepsRenderedPreviewForSelection(state)
    ? null
    : state.doc.lineAt(state.selection.main.head);
  tree.iterate({
    enter(node) {
      if (node.name === "HardBreak" && source[node.to - 1] === "\n") {
        hardBreakNewlines.add(node.to - 1);
      }
      if (node.name === "InlineCode") {
        inlineCodeRanges.push({ from: node.from, to: node.to });
      }
    },
  });
  tree.iterate({
    enter(node) {
      if (node.name !== "Paragraph") return undefined;
      if (rangeInsidePreviewBlock(node.from, node.to, protectedBlocks)) return false;

      let newline = source.indexOf("\n", node.from);
      while (newline >= 0 && newline < node.to) {
        const touchesActiveLine = activeLine
          && newline >= activeLine.from - 1
          && newline <= activeLine.to;
        const insideInlineCode = inlineCodeRanges.some((range) => (
          newline >= range.from && newline < range.to
        ));
        const lineNumber = state.doc.lineAt(newline).number;
        const crossesQuoteBoundary = presentations[lineNumber - 1]?.quoteDepth
          !== presentations[lineNumber]?.quoteDepth;
        if (
          !touchesActiveLine
          && !hardBreakNewlines.has(newline)
          && !insideInlineCode
          && !crossesQuoteBoundary
        ) {
          result.add(newline);
        }
        newline = source.indexOf("\n", newline + 1);
      }
      return false;
    },
  });
  return result;
}

function getCachedPreviewDocument(source: string) {
  if (previewDocumentCache?.source === source) return previewDocumentCache;
  const markdownBlocks = splitMarkdownBlocks(source);
  const tree = markdownLanguage.parser.parse(source);
  const abbreviationDefinitions = collectMarkdownAbbreviationDefinitions(source);
  previewDocumentCache = {
    source,
    tree,
    markdownBlocks,
    previewBlocks: getContinuousPreviewBlocks(source, markdownBlocks, tree),
    abbreviationDefinitions,
    abbreviations: collectMarkdownAbbreviations(source, abbreviationDefinitions),
    referenceDefinitions: collectReferenceDefinitionSemantics(source),
  };
  specialPreviewWidgetCache.clear();
  return previewDocumentCache;
}

interface PreviewWidgetSpacing {
  collapseBefore: boolean;
  collapseAfter: boolean;
}


function previewBlocksAreAdjacent(
  left: ContinuousPreviewBlock,
  right: ContinuousPreviewBlock,
  source: string,
): boolean {
  if (left.to > right.from) return false;
  return source.slice(left.to, right.from)
    .split(/\r?\n/)
    .every((line) => /^[ \t]*(?:>[ \t]*)*$/.test(line));
}

type ContinuousLinePresentation = ReturnType<typeof getContinuousMarkdownLinePresentations>[number];

interface PreviewWidgetEdgeSpacing {
  before: number;
  after: number;
}

interface PresentationSpacingBoundary {
  presentation: ContinuousLinePresentation | null;
  presentationSpacing: number;
  gaps: ContinuousLinePresentation[];
  gapSpacing: number;
  size: number;
}

function preparePreviewWidgetSpacings(
  blocks: readonly ContinuousPreviewBlock[],
  presentations: ContinuousLinePresentation[],
  source: string,
): PreviewWidgetSpacing[] {
  const edgeSpacings = blocks.map((block) => getPreviewWidgetEdgeSpacing(block, source));
  const result = blocks.map((): PreviewWidgetSpacing => ({
    collapseBefore: false,
    collapseAfter: false,
  }));

  for (let index = 0; index < blocks.length - 1; index += 1) {
    const left = blocks[index];
    const right = blocks[index + 1];
    if (!left || !right || !previewBlocksAreAdjacent(left, right, source)) continue;
    const leftSpacing = edgeSpacings[index]?.after ?? 0;
    const rightSpacing = edgeSpacings[index + 1]?.before ?? 0;
    if (leftSpacing >= rightSpacing) result[index + 1]!.collapseBefore = true;
    else result[index]!.collapseAfter = true;
    markPreviewGapPresentations(presentations, left, right);
  }

  blocks.forEach((block, index) => {
    const spacing = result[index];
    const edgeSpacing = edgeSpacings[index];
    if (!spacing || !edgeSpacing) return;

    const before = findAdjacentPresentationSpacingBoundary(
      presentations,
      blocks,
      block,
      "before",
    );
    if (before && before.size > 0 && edgeSpacing.before > 0) {
      if (before.size >= edgeSpacing.before) {
        spacing.collapseBefore = true;
        retainPresentationSpacingBoundary(before, "after");
      } else {
        collapsePresentationSpacingBoundary(before, "after");
      }
    }

    const after = findAdjacentPresentationSpacingBoundary(
      presentations,
      blocks,
      block,
      "after",
    );
    if (after && after.size > 0 && edgeSpacing.after > 0) {
      if (edgeSpacing.after >= after.size) {
        collapsePresentationSpacingBoundary(after, "before");
      } else {
        spacing.collapseAfter = true;
        retainPresentationSpacingBoundary(after, "before");
      }
    }
  });

  collapseAdjacentPresentationSpacing(presentations, blocks);
  return result;
}

function getPreviewWidgetEdgeSpacing(
  block: ContinuousPreviewBlock,
  documentSource: string,
): PreviewWidgetEdgeSpacing {
  if (block.kind === "html") {
    return {
      before: getHtmlPreviewEdgeSpacing(block, documentSource, "before"),
      after: getHtmlPreviewEdgeSpacing(block, documentSource, "after"),
    };
  }

  const relativeSpacing = props.settings.fontSize * 0.8;
  const tableSpacing = props.settings.fontSize * 1.2;
  switch (block.kind) {
    case "toc":
      return { before: 20, after: 20 };
    case "math":
      return { before: 16, after: 16 };
    case "code":
    case "diagram":
      return { before: 15, after: 15 };
    case "table":
      return { before: tableSpacing, after: tableSpacing };
    case "image":
    case "definition":
      return { before: relativeSpacing, after: relativeSpacing };
  }
}

function getHtmlPreviewEdgeSpacing(
  block: ContinuousPreviewBlock,
  documentSource: string,
  edge: "before" | "after",
): number {
  const probe = document.createElement("div");
  probe.innerHTML = sanitizeMarkdownHtml(renderMarkdown(block.source, {
    basePath: props.filePath,
    documentSource,
    outline: props.outline,
    settings: props.settings,
    assetResolver: resolveLocalAsset,
  }));
  unwrapSyntheticHtmlVideoParagraph(probe);
  return findHtmlSpacingBoundary(probe, edge)?.spacing ?? 0;
}

function findAdjacentPresentationSpacingBoundary(
  presentations: ContinuousLinePresentation[],
  blocks: readonly ContinuousPreviewBlock[],
  block: ContinuousPreviewBlock,
  direction: "before" | "after",
): PresentationSpacingBoundary | null {
  const blockLines = presentations
    .map((presentation, index) => ({ index, presentation }))
    .filter(({ presentation }) => presentation.from >= block.from && presentation.from < block.to);
  if (blockLines.length === 0) return null;

  let cursor = direction === "before"
    ? blockLines[0]!.index - 1
    : blockLines.at(-1)!.index + 1;
  const step = direction === "before" ? -1 : 1;
  const gaps: ContinuousLinePresentation[] = [];

  while (cursor >= 0 && cursor < presentations.length) {
    const presentation = presentations[cursor];
    if (!presentation) break;
    if (blocks.some((candidate) => (
      candidate !== block
      && presentation.from >= candidate.from
      && presentation.from < candidate.to
    ))) return null;
    if (isPresentationSpacingGap(presentation)) {
      gaps.push(presentation);
      cursor += step;
      continue;
    }
    if (direction === "before" && presentation.kind === "setext-marker") {
      cursor += step;
      continue;
    }
    return createPresentationSpacingBoundary(presentation, gaps, direction);
  }

  return gaps.length > 0
    ? createPresentationSpacingBoundary(null, gaps, direction)
    : null;
}

function createPresentationSpacingBoundary(
  presentation: ContinuousLinePresentation | null,
  gaps: ContinuousLinePresentation[],
  direction: "before" | "after",
): PresentationSpacingBoundary {
  const edge = direction === "before" ? "after" : "before";
  const presentationSpacing = presentation
    ? getPresentationEdgeSpacing(presentation, edge)
    : 0;
  const gapSpacing = gaps.reduce(
    (largest, gap) => Math.max(largest, getPresentationGapSpacing(gap)),
    0,
  );
  return {
    presentation,
    presentationSpacing,
    gaps,
    gapSpacing,
    size: Math.max(presentationSpacing, gapSpacing),
  };
}

function getPresentationEdgeSpacing(
  presentation: ContinuousLinePresentation,
  edge: "before" | "after",
): number {
  const classes = presentation.className;
  if (presentation.kind === "horizontal-rule") return 16;
  if (presentation.kind === "heading" || classes.split(/\s+/).includes("cm-heading")) {
    const quoteEdge = edge === "before" ? "cm-blockquote-first" : "cm-blockquote-last";
    if (!classes.includes(quoteEdge)) return 16;
  }
  if (
    edge === "before"
    && (
      classes.includes("cm-blockquote-margin-before")
      || classes.includes("cm-list-block-margin-before")
      || classes.includes("cm-document-first-list")
    )
  ) return props.settings.fontSize * 0.8;
  if (edge === "after" && classes.includes("cm-blockquote-margin-after")) {
    return props.settings.fontSize * 0.8;
  }
  return 0;
}

function getPresentationGapSpacing(presentation: ContinuousLinePresentation): number {
  const classes = presentation.className;
  if (classes.includes("cm-heading-gap") || classes.includes("cm-block-gap-extra")) return 1;
  if (classes.includes("cm-list-gap")) return 8;
  if (classes.includes("cm-block-gap") || classes.includes("cm-blockquote-gap")) {
    return props.settings.fontSize * 0.8;
  }
  return 0;
}

function isPresentationSpacingGap(presentation: ContinuousLinePresentation): boolean {
  return presentation.kind === "blank"
    || presentation.className.includes("cm-blockquote-gap")
    || presentation.className.includes("cm-list-gap");
}

function retainPresentationSpacingBoundary(
  boundary: PresentationSpacingBoundary,
  edge: "before" | "after",
) {
  if (boundary.presentationSpacing >= boundary.gapSpacing) {
    boundary.gaps.forEach(markCollapsedSpacingGap);
    return;
  }
  if (boundary.presentation && boundary.presentationSpacing > 0) {
    markCollapsedPresentationEdge(boundary.presentation, edge);
  }
}

function collapsePresentationSpacingBoundary(
  boundary: PresentationSpacingBoundary,
  edge: "before" | "after",
) {
  if (boundary.presentation && boundary.presentationSpacing > 0) {
    markCollapsedPresentationEdge(boundary.presentation, edge);
  }
  boundary.gaps.forEach(markCollapsedSpacingGap);
}

function markPreviewGapPresentations(
  presentations: ContinuousLinePresentation[],
  left: ContinuousPreviewBlock,
  right: ContinuousPreviewBlock,
) {
  presentations
    .filter((presentation) => (
      isPresentationSpacingGap(presentation)
      && presentation.from >= left.to
      && presentation.from <= right.from
    ))
    .forEach(markCollapsedSpacingGap);
}

function collapseAdjacentPresentationSpacing(
  presentations: ContinuousLinePresentation[],
  blocks: readonly ContinuousPreviewBlock[],
) {
  for (let index = 0; index < presentations.length; index += 1) {
    const left = presentations[index];
    if (!left || blocks.some((block) => left.from >= block.from && left.from < block.to)) continue;
    const leftSpacing = getPresentationEdgeSpacing(left, "after");
    if (leftSpacing <= 0) continue;

    const gaps: ContinuousLinePresentation[] = [];
    let cursor = index + 1;
    while (
      cursor < presentations.length
      && presentations[cursor]
      && isPresentationSpacingGap(presentations[cursor]!)
    ) {
      gaps.push(presentations[cursor]!);
      cursor += 1;
    }
    const right = presentations[cursor];
    if (
      !right
      || blocks.some((block) => right.from >= block.from && right.from < block.to)
      || (left.kind === "heading" && right.kind === "heading")
    ) continue;
    const rightSpacing = getPresentationEdgeSpacing(right, "before");
    if (rightSpacing <= 0) continue;
    const gapSpacing = gaps.reduce(
      (largest, gap) => Math.max(largest, getPresentationGapSpacing(gap)),
      0,
    );
    const largest = Math.max(leftSpacing, gapSpacing, rightSpacing);
    if (leftSpacing === largest) {
      gaps.forEach(markCollapsedSpacingGap);
      markCollapsedPresentationEdge(right, "before");
    } else if (gapSpacing === largest) {
      markCollapsedPresentationEdge(left, "after");
      markCollapsedPresentationEdge(right, "before");
    } else {
      markCollapsedPresentationEdge(left, "after");
      gaps.forEach(markCollapsedSpacingGap);
    }
  }
}

function markCollapsedSpacingGap(presentation: ContinuousLinePresentation) {
  addPresentationClass(presentation, "cm-spacing-collapsed-gap");
}

function markCollapsedPresentationEdge(
  presentation: ContinuousLinePresentation,
  edge: "before" | "after",
) {
  addPresentationClass(presentation, `cm-spacing-collapse-${edge}`);
}

function addPresentationClass(presentation: ContinuousLinePresentation, className: string) {
  if (!presentation.className.includes(className)) presentation.className += ` ${className}`;
}
function applyPreviewWidgetSpacing(root: HTMLElement, spacing: PreviewWidgetSpacing) {
  if (spacing.collapseBefore) root.classList.add("cm-preview-collapse-before");
  if (spacing.collapseAfter) root.classList.add("cm-preview-collapse-after");
}

const htmlSpacingBoundaryTags = new Set([
  "BLOCKQUOTE",
  "DL",
  "DIR",
  "MENU",
  "FIGURE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "OL",
  "P",
  "PRE",
  "TABLE",
  "UL",
]);

const htmlTransparentBoundaryTags = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "CENTER",
  "FORM",
  "SEARCH",
  "DIV",
  "FOOTER",
  "HEADER",
  "MAIN",
  "NAV",
  "SECTION",
]);

function unwrapSyntheticHtmlVideoParagraph(root: HTMLElement) {
  const paragraph = root.firstElementChild;
  if (!paragraph || paragraph.tagName !== "P" || root.childElementCount !== 1) return;
  const paragraphNodes = Array.from(paragraph.childNodes);
  const elements = paragraphNodes.filter((node): node is Element => node instanceof Element);
  if (
    elements.length !== 1
    || elements[0]?.tagName !== "VIDEO"
    || paragraphNodes.some((node) => (
      node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())
    ))
  ) return;

  root.replaceChildren(...paragraphNodes);
}

interface HtmlSpacingBoundary {
  element: HTMLElement;
  spacing: number;
}

function applyHtmlWidgetSpacingOwnership(root: HTMLElement) {
  for (const edge of ["before", "after"] as const) {
    const boundary = findHtmlSpacingBoundary(root, edge);
    if (!boundary || boundary.spacing <= 0) continue;
    root.classList.add(`cm-html-spacing-${edge}`);
    boundary.element.classList.add(`cm-html-spacing-boundary-${edge}`);
  }
}

function findHtmlSpacingBoundary(
  root: HTMLElement,
  edge: "before" | "after",
): HtmlSpacingBoundary | null {
  let container: Element = root;
  for (let depth = 0; depth < 16; depth += 1) {
    const nodes = edge === "before"
      ? Array.from(container.childNodes)
      : Array.from(container.childNodes).reverse();
    const boundary = nodes.find((node) => (
      node instanceof Element
      || (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()))
    ));
    if (!(boundary instanceof HTMLElement)) return null;
    const spacing = getHtmlBoundarySpacing(boundary, edge);
    if (spacing !== null) return { element: boundary, spacing };
    if (!canTraverseHtmlSpacingContainer(boundary, edge)) return null;
    container = boundary;
  }
  return null;
}

function getHtmlBoundarySpacing(
  boundary: HTMLElement,
  edge: "before" | "after",
): number | null {
  const inlineMargin = edge === "before"
    ? boundary.style.marginTop || boundary.style.marginBlockStart
    : boundary.style.marginBottom || boundary.style.marginBlockEnd;
  if (inlineMargin) {
    const spacing = parseHtmlSpacingSize(inlineMargin);
    if (spacing > 0 || !htmlTransparentBoundaryTags.has(boundary.tagName)) return spacing;
  }
  if (boundary.classList.contains("diagram-box")) return 15;
  if (boundary.classList.contains("math-block")) return 16;
  if (boundary.classList.contains("md-alert")) return edge === "after" ? 16 : 0;

  if (boundary.tagName === "FIGURE") return props.settings.fontSize * 1.2;
  const relativeSpacing = props.settings.fontSize * 0.8;
  if (["H1", "H2", "H3", "H4", "H5", "H6", "HR"].includes(boundary.tagName)) {
    return 16;
  }
  if (boundary.tagName === "PRE") return 15;
  if (["DIR", "MENU"].includes(boundary.tagName)) return props.settings.fontSize;
  if (htmlSpacingBoundaryTags.has(boundary.tagName)) return relativeSpacing;
  return null;
}

function canTraverseHtmlSpacingContainer(
  container: HTMLElement,
  edge: "before" | "after",
): boolean {
  if (!htmlTransparentBoundaryTags.has(container.tagName)) return false;
  const style = container.style;
  const display = style.display.trim().toLowerCase();
  if (display === "contents") return true;
  if (display && display !== "block") return false;

  const position = style.position.trim().toLowerCase();
  if (position === "absolute" || position === "fixed") return false;
  const floatValue = style.cssFloat.trim().toLowerCase();
  if (floatValue && floatValue !== "none") return false;

  const overflowValues = [style.overflow, style.overflowX, style.overflowY]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (overflowValues.some((value) => value !== "visible" && value !== "clip")) return false;

  const containment = style.contain.trim().toLowerCase().split(/s+/);
  if (containment.some((value) => ["layout", "paint", "content", "strict"].includes(value))) {
    return false;
  }
  const contentVisibility = style.contentVisibility.trim().toLowerCase();
  if (contentVisibility === "auto" || contentVisibility === "hidden") return false;
  if (style.columnCount && !["auto", "1"].includes(style.columnCount.trim().toLowerCase())) {
    return false;
  }
  if (style.columnWidth && style.columnWidth.trim().toLowerCase() !== "auto") return false;

  const padding = edge === "before"
    ? style.paddingTop || style.paddingBlockStart
    : style.paddingBottom || style.paddingBlockEnd;
  if (padding && parseHtmlSpacingSize(padding) !== 0) return false;

  const borderStyle = edge === "before"
    ? style.borderTopStyle || style.borderBlockStartStyle
    : style.borderBottomStyle || style.borderBlockEndStyle;
  const borderWidth = edge === "before"
    ? style.borderTopWidth || style.borderBlockStartWidth
    : style.borderBottomWidth || style.borderBlockEndWidth;
  if (
    borderStyle
    && !["none", "hidden"].includes(borderStyle.trim().toLowerCase())
    && (!borderWidth || parseHtmlSpacingSize(borderWidth) !== 0)
  ) return false;

  if (edge === "after") {
    const height = style.height.trim().toLowerCase();
    if (height && height !== "auto") return false;
    const minHeight = (style.minHeight || style.minBlockSize).trim().toLowerCase();
    if (minHeight && minHeight !== "auto" && parseHtmlSpacingSize(minHeight) !== 0) {
      return false;
    }
  }
  return true;
}

function parseHtmlSpacingSize(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (/^[+-]?0(?:[a-z]+|%)?$/.test(normalized)) return 0;
  const numeric = normalized.match(/^([+]?(?:\d+(?:\.\d+)?|\.\d+))(px|em|rem)?$/);
  if (!numeric) return Number.MAX_SAFE_INTEGER;
  const amount = Number(numeric[1]);
  if (!Number.isFinite(amount)) return Number.MAX_SAFE_INTEGER;
  if (numeric[2] === "em") return amount * props.settings.fontSize;
  if (numeric[2] === "rem") return amount * 16;
  return amount;
}
function getCachedSpecialPreviewWidget(
  block: ContinuousPreviewBlock,
  documentSource: string,
  spacing: PreviewWidgetSpacing,
): WidgetType {
  const cacheKey = [
    block.kind,
    block.from,
    block.to,
    Number(spacing.collapseBefore),
    Number(spacing.collapseAfter),
  ].join(":");
  const cachedWidget = specialPreviewWidgetCache.get(cacheKey);
  if (cachedWidget) return cachedWidget;
  const widget = createSpecialPreviewWidget(block, documentSource, spacing);
  specialPreviewWidgetCache.set(cacheKey, widget);
  return widget;
}

interface RenderedListMarker {
  from: number;
  to: number;
  text: string;
  kind: "bullet" | "ordered" | "task";
  depth: number;
  checked: boolean | null;
  checkboxFrom: number | null;
  overlapPrevious?: boolean;
}

function getRenderedListMarkers(
  state: EditorState,
  lineFrom: number,
  line: string,
  kind: ContinuousPreviewBlockKind | string,
  listDepth: number | null,
  bulletDepth: number | null,
  quotePrefixEnd: number | null,
  listContext: MarkdownListContext,
  counters: Map<string, string>,
): RenderedListMarker[] {
  const prefix = readMarkdownContainerPrefix(line);
  const containerListMarkers = prefix.markers.filter((marker) => marker.kind !== "blockquote");
  if (containerListMarkers.length <= 1) {
    const orderedNumber = getSequentialOrderedListNumber(
      line,
      kind,
      quotePrefixEnd,
      listContext,
      counters,
    );
    const marker = getRenderedListMarker(
      line,
      kind,
      listDepth,
      bulletDepth,
      quotePrefixEnd,
      orderedNumber,
    );
    return marker ? [marker] : [];
  }

  const resolvedListDepth = listDepth ?? containerListMarkers.length - 1;
  const firstListMarker = containerListMarkers[0]!;
  const markerIndent = line.slice(firstListMarker.from, firstListMarker.markerFrom);
  const normalizedIndentSize = props.settings.indentSize === 4 ? 4 : 2;
  const sourceBaseListDepth = Math.floor(
    getMarkdownIndentWidth(markerIndent) / normalizedIndentSize,
  );
  const baseListDepth = Math.max(
    0,
    sourceBaseListDepth,
    resolvedListDepth - containerListMarkers.length + 1,
  );
  const bulletMarkers = containerListMarkers.filter((marker) => marker.kind === "bullet-list");
  const resolvedBulletDepth = bulletDepth ?? bulletMarkers.length - 1;
  const orderedAncestorDepth = Math.max(0, resolvedListDepth - resolvedBulletDepth);
  const sourceBaseBulletDepth = Math.max(0, baseListDepth - orderedAncestorDepth);
  const baseBulletDepth = Math.max(
    0,
    sourceBaseBulletDepth,
    resolvedBulletDepth - bulletMarkers.length + 1,
  );
  const firstListMarkerIndex = prefix.markers.indexOf(containerListMarkers[0]!);
  const includesLeadingQuotes = firstListMarkerIndex > 0
    && prefix.markers
      .slice(0, firstListMarkerIndex)
      .every((marker) => marker.kind === "blockquote");
  let bulletIndex = 0;

  return containerListMarkers.map((containerMarker, index) => {
    const markerToken = line
      .slice(containerMarker.markerFrom, containerMarker.markerTo)
      .trim();
    const orderedToken = markerToken.match(/^(\d+)[.)]$/);
    const orderedNumber = orderedToken
      ? getSequentialContainerOrderedListNumber(
        state,
        lineFrom,
        containerMarker.markerFrom,
        orderedToken[1],
        counters,
      )
      : null;
    const checkbox = index === containerListMarkers.length - 1
      ? line.slice(containerMarker.to).match(/^\[([ xX])\]\s+/)
      : null;
    const isTask = Boolean(checkbox);
    const currentBulletDepth = baseBulletDepth + bulletIndex;
    if (containerMarker.kind === "bullet-list") bulletIndex += 1;

    return {
      from: index === 0 && includesLeadingQuotes ? 0 : containerMarker.from,
      to: containerMarker.to + (checkbox?.[0].length ?? 0),
      text: containerMarker.kind === "ordered-list"
        ? (orderedNumber ?? normalizeOrderedListNumber(orderedToken?.[1] ?? "1")) + "."
        : isTask
          ? ""
          : getContinuousBulletMarker(currentBulletDepth),
      kind: isTask
        ? "task"
        : containerMarker.kind === "ordered-list"
          ? "ordered"
          : "bullet",
      depth: baseListDepth + index,
      checked: checkbox ? checkbox[1].toLowerCase() === "x" : null,
      checkboxFrom: checkbox ? containerMarker.to + 1 : null,
      overlapPrevious: index > 0,
    };
  });
}

function getSequentialContainerOrderedListNumber(
  state: EditorState,
  lineFrom: number,
  markerFrom: number,
  sourceNumber: string,
  counters: Map<string, string>,
): string {
  let node = syntaxTree(state).resolveInner(lineFrom + markerFrom, 1);
  while (node.name !== "OrderedList") {
    const parent = node.parent;
    if (!parent) break;
    node = parent;
  }
  const normalized = normalizeOrderedListNumber(sourceNumber);
  if (node.name !== "OrderedList") return normalized;

  const key = node.from + ":" + node.to;
  const displayNumber = counters.has(key)
    ? incrementOrderedListNumber(counters.get(key) ?? normalized)
    : normalized;
  counters.set(key, displayNumber);
  return displayNumber;
}

function getRenderedListMarker(
  line: string,
  kind: ContinuousPreviewBlockKind | string,
  listDepth: number | null,
  bulletDepth: number | null,
  quotePrefixEnd: number | null,
  orderedNumber: string | null,
): {
  from: number;
  to: number;
  text: string;
  kind: "bullet" | "ordered" | "task";
  depth: number;
  checked: boolean | null;
  checkboxFrom: number | null;
} | null {
  const contentOffset = quotePrefixEnd ?? 0;
  const content = line.slice(contentOffset);
  if (kind === "bullet-list") {
    if (listDepth === null) return null;
    const match = content.match(/^(\s*)[-+*]\s+/);
    return match
      ? {
        from: 0,
        to: contentOffset + match[0].length,
        text: getContinuousBulletMarker(bulletDepth ?? 0),
        kind: "bullet",
        depth: listDepth,
        checked: null,
        checkboxFrom: null,
      }
      : null;
  }
  if (kind === "ordered-list") {
    if (listDepth === null) return null;
    const match = content.match(/^(\s*)(\d+)([.)])\s+/);
    return match
      ? {
        from: 0,
        to: contentOffset + match[0].length,
        text: `${orderedNumber ?? normalizeOrderedListNumber(match[2])}.`,
        kind: "ordered",
        depth: listDepth,
        checked: null,
        checkboxFrom: null,
      }
      : null;
  }
  if (kind === "task-list") {
    if (listDepth === null) return null;
    const match = content.match(/^(\s*)(?:([-+*])|(\d+)[.)])\s+\[([ xX])\]\s+/);
    const checkboxIndex = match?.[0].indexOf("[") ?? -1;
    return match
      ? {
        from: 0,
        to: contentOffset + match[0].length,
        text: match[3] ? `${orderedNumber ?? normalizeOrderedListNumber(match[3])}.` : "",
        kind: "task",
        depth: listDepth,
        checked: match[4].toLowerCase() === "x",
        checkboxFrom: checkboxIndex >= 0 ? contentOffset + checkboxIndex + 1 : null,
      }
      : null;
  }
  return null;
}

function getSequentialOrderedListNumber(
  line: string,
  kind: ContinuousPreviewBlockKind | string,
  quotePrefixEnd: number | null,
  listContext: MarkdownListContext,
  counters: Map<string, string>,
): string | null {
  if (listContext.depth === null || !["ordered-list", "task-list"].includes(kind)) return null;
  const content = line.slice(quotePrefixEnd ?? 0);
  const marker = content.match(/^[ \t]*(\d+)[.)]\s+/);
  if (!marker || !listContext.orderedListIdentity) return null;

  const key = listContext.orderedListIdentity;
  const sourceNumber = normalizeOrderedListNumber(marker[1]);
  const displayNumber = counters.has(key)
    ? incrementOrderedListNumber(counters.get(key) ?? sourceNumber)
    : sourceNumber;
  counters.set(key, displayNumber);
  return displayNumber;
}

interface MarkdownListContext {
  depth: number | null;
  bulletDepth: number | null;
  orderedListIdentity: string | null;
}

function getMarkdownListContext(
  state: EditorState,
  lineFrom: number,
  line: string,
  quotePrefixEnd: number | null,
): MarkdownListContext {
  const contentOffset = quotePrefixEnd ?? 0;
  const marker = line.slice(contentOffset).match(/^([ \t]*)([-+*]|\d+[.)])\s+/);
  if (!marker) return { depth: null, bulletDepth: null, orderedListIdentity: null };

  const markerFrom = lineFrom + contentOffset + marker[1].length;
  let node = syntaxTree(state).resolveInner(markerFrom, 1);
  let listDepth = 0;
  let bulletListDepth = 0;
  let orderedListIdentity: string | null = null;
  while (true) {
    if (node.name === "BulletList" || node.name === "OrderedList") {
      listDepth += 1;
      if (node.name === "BulletList") bulletListDepth += 1;
      if (node.name === "OrderedList" && orderedListIdentity === null) {
        orderedListIdentity = `${node.from}:${node.to}`;
      }
    }
    const parent = node.parent;
    if (!parent) break;
    node = parent;
  }

  const orderedMarker = marker[2].match(/^(\d+)([.)])$/);
  const parserRecognizesCurrentList = !orderedMarker
    || (orderedMarker[1].length <= 9 && orderedListIdentity !== null);
  if (parserRecognizesCurrentList) {
    return {
      depth: listDepth > 0 ? listDepth - 1 : null,
      bulletDepth: bulletListDepth > 0 ? bulletListDepth - 1 : null,
      orderedListIdentity,
    };
  }

  return {
    depth: listDepth,
    bulletDepth: bulletListDepth > 0 ? bulletListDepth - 1 : null,
    orderedListIdentity: getFallbackOrderedListIdentity(
      state,
      lineFrom,
      line.slice(0, contentOffset),
      marker[1],
      orderedMarker[2],
    ),
  };
}

function getFallbackOrderedListIdentity(
  state: EditorState,
  lineFrom: number,
  quotePrefix: string,
  indent: string,
  delimiter: string,
): string {
  const currentLine = state.doc.lineAt(lineFrom);
  const quoteKey = getOrderedListQuoteKey(quotePrefix);
  const indentWidth = getOrderedListIndentWidth(indent);
  let runFrom = lineFrom;

  for (let lineNumber = currentLine.number - 1; lineNumber >= 1; lineNumber -= 1) {
    const previous = state.doc.line(lineNumber);
    const context = getOrderedListLineContext(previous.text);
    if (context.quoteKey !== quoteKey) break;
    if (!context.content.trim()) continue;

    const marker = context.content.match(/^([ \t]*)([-+*]|\d+[.)])\s+/);
    if (!marker) {
      if (getOrderedListIndentWidth(context.content.match(/^[ \t]*/)?.[0] ?? "") <= indentWidth) break;
      continue;
    }

    const markerWidth = getOrderedListIndentWidth(marker[1]);
    if (markerWidth > indentWidth) continue;
    if (markerWidth < indentWidth) break;

    const ordered = marker[2].match(/^(\d+)([.)])$/);
    if (!ordered || ordered[2] !== delimiter) break;
    runFrom = previous.from;
  }

  return `fallback:${quoteKey}:${indentWidth}:${delimiter}:${runFrom}`;
}

function getOrderedListLineContext(line: string): { content: string; quoteKey: string } {
  const quote = line.match(/^( {0,3}(?:>[ \t]?)+)/)?.[0] ?? "";
  return {
    content: line.slice(quote.length),
    quoteKey: getOrderedListQuoteKey(quote),
  };
}

function getOrderedListQuoteKey(prefix: string): string {
  const leading = prefix.match(/^ */)?.[0].length ?? 0;
  const depth = prefix.match(/>/g)?.length ?? 0;
  return `${leading}:${depth}`;
}

function getOrderedListIndentWidth(value: string): number {
  let width = 0;
  for (const character of value) {
    width += character === "\t" ? 4 - (width % 4) : 1;
  }
  return width;
}

interface InlineWidgetCandidate {
  from: number;
  to: number;
  priority: number;
  widget: WidgetType;
}

function addInlineWidgetDecorations(
  state: EditorState,
  ranges: Range<Decoration>[],
  protectedBlocks: Array<{ from: number; to: number }>,
  source: string,
  footnotes: FootnoteDocumentSemantics | null,
): Array<{ from: number; to: number }> {
  const candidates: InlineWidgetCandidate[] = [];
  const inlineSyntax = collectInlineMarkdownSyntax(source);
  const links = inlineSyntax.filter((item) => item.type === "link");
  const seenImages = new Set<string>();

  for (const image of inlineSyntax.filter((item) => item.type === "image")) {
    const outerLink = links
      .filter((link) => link.start <= image.start && link.end >= image.end)
      .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
    const from = outerLink?.start ?? image.start;
    const to = outerLink?.end ?? image.end;
    const key = `${from}:${to}`;
    if (seenImages.has(key)) continue;
    seenImages.add(key);
    candidates.push({
      from,
      to,
      priority: 4,
      widget: new InlineRenderedMarkdownWidget(source.slice(from, to), source, from, "image"),
    });
  }

  for (const link of links) {
    const parsed = readMarkdownInlineLink(source, link.start);
    if (!parsed || !isUnwrappedMarkdownLinkDestinationWithSpaces(source, parsed)) continue;
    candidates.push({
      from: link.start,
      to: link.end,
      priority: 0,
      widget: new InlineRenderedMarkdownWidget(
        link.raw,
        source,
        link.start,
        "link",
      ),
    });
  }

  if (props.settings.extensions.html) {
    for (const html of collectInlineHtmlSyntax(source)) {
      candidates.push({
        from: html.start,
        to: html.end,
        priority: 3,
        widget: new InlineRenderedMarkdownWidget(html.raw, source, html.start, "html"),
      });
    }
  }

  if (footnotes) {
    for (const footnote of footnotes.references) {
      candidates.push({
        from: footnote.from,
        to: footnote.to,
        priority: 2,
        widget: new FootnoteReferenceWidget(
          footnote.number,
          footnote.id,
          footnote.markdown,
          footnote.from,
          footnote.definition?.from ?? null,
          footnote.missing,
          source,
        ),
      });
    }
  }

  if (props.settings.extensions.math) {
    for (const math of collectInlineMathSyntax(source, { includeLinkLabels: true })) {
      candidates.push({
        from: math.start,
        to: math.end,
        priority: 1,
        widget: new InlineRenderedMarkdownWidget(math.raw, source, math.start, "math"),
      });
    }
  }

  candidates.sort((left, right) => (
    left.from - right.from
    || right.priority - left.priority
    || (right.to - right.from) - (left.to - left.from)
  ));

  const occupied: Array<{ from: number; to: number }> = [];
  for (const candidate of candidates) {
    if (candidate.to <= candidate.from) continue;
    if (protectedBlocks.some((block) => rangesIntersect(candidate.from, candidate.to, block.from, block.to))) continue;
    if (occupied.some((range) => rangesIntersect(candidate.from, candidate.to, range.from, range.to))) continue;
    occupied.push({ from: candidate.from, to: candidate.to });
    if (!props.readonly && selectionTouchesRange(state, candidate.from, candidate.to)) continue;
    ranges.push(Decoration.replace({ widget: candidate.widget }).range(candidate.from, candidate.to));
  }
  return occupied;
}

function addFootnoteBacklinkDecorations(
  ranges: Range<Decoration>[],
  footnotes: FootnoteDocumentSemantics,
  renderedDefinitions: readonly FootnoteDefinitionSemantics[],
) {
  const renderedDefinitionOffsets = new Set(
    renderedDefinitions.map((definition) => definition.from),
  );
  for (const definition of footnotes.definitions) {
    if (definition.references.length === 0) continue;
    if (renderedDefinitionOffsets.has(definition.from)) continue;
    ranges.push(Decoration.widget({
      widget: new FootnoteBacklinksWidget(definition.id, definition.references),
      side: 1,
    }).range(definition.to));
  }
}

function addInlinePreviewDecorations(
  state: EditorState,
  ranges: Range<Decoration>[],
  previewBlocks: Array<{ from: number; to: number }>,
  inlineWidgetRanges: Array<{ from: number; to: number }>,
) {
  const source = state.doc.toString();
  const referenceLabels = new Set(
    getCachedPreviewDocument(source).referenceDefinitions.map((definition) => (
      definition.label.normalized
    )),
  );
  const highlightBlockedRanges: Array<{ from: number; to: number }> = [
    ...inlineWidgetRanges,
    ...collectInlineHtmlMarkupRanges(source).map((range) => ({ from: range.start, to: range.end })),
  ];
  const tree = syntaxTree(state);
  tree.iterate({
    enter(node) {
      if (node.name === "InlineCode" || node.name === "URL") {
        highlightBlockedRanges.push({ from: node.from, to: node.to });
      }
      return undefined;
    },
  });
  const strikethroughOverrides = collectStrikethroughOverrides(
    state,
    previewBlocks,
    highlightBlockedRanges,
  );
  const splitAdjacentStrongParentRanges = new Set<string>();
  tree.iterate({
    enter(node) {
      if (node.name === "Autolink" && !props.settings.extensions.autoLinks) return false;
      if (
        node.name === "Link"
        && !isResolvedMarkdownLinkNode(source, node.from, node.to, referenceLabels)
      ) {
        return false;
      }
      if (rangeInsidePreviewBlock(node.from, node.to, previewBlocks)) return false;
      if (inlineWidgetRanges.some((range) => node.from >= range.from && node.to <= range.to)) return false;
      const adjacentStrongSegments = node.name === "StrongEmphasis"
        ? getAdjacentStrongSegments(source, node.node)
        : null;
      if (adjacentStrongSegments) {
        splitAdjacentStrongParentRanges.add(node.from + ":" + node.to);
        for (const segment of adjacentStrongSegments) {
          const active = !props.readonly
            && selectionTouchesRange(state, segment.from, segment.to);
          if (!active) {
            ranges.push(Decoration.replace({}).range(segment.from, segment.contentFrom));
          }
          ranges.push(Decoration.mark({ class: "cm-rendered-strong" }).range(
            segment.contentFrom,
            segment.contentTo,
          ));
          if (!active) {
            ranges.push(Decoration.replace({}).range(segment.contentTo, segment.to));
          }
        }
        return undefined;
      }
      const overridesStrikethrough = node.name === "Strikethrough"
        && strikethroughOverrides.some((syntax) => rangesIntersect(
          node.from,
          node.to,
          syntax.from,
          syntax.to,
        ));
      const renderedClass = overridesStrikethrough
        ? null
        : getRenderedInlineClass(node.name);
      const activeRenderedNode = Boolean(
        !props.readonly
        && renderedClass
        && selectionTouchesRange(state, node.from, node.to)
      );
      if (
        !overridesStrikethrough
        && !props.readonly
        && !renderedClass
        && isRevealableInlineNode(node.name)
        && selectionTouchesRange(state, node.from, node.to)
      ) {
        return false;
      }
      const parent = node.node.parent;
      const parentName = parent?.name ?? "";
      if (
        node.name === "EmphasisMark"
        && parent
        && splitAdjacentStrongParentRanges.has(parent.from + ":" + parent.to)
      ) {
        return false;
      }
      const parentOverridesStrikethrough = parentName === "Strikethrough"
        && parent !== null
        && strikethroughOverrides.some((syntax) => rangesIntersect(
          parent.from,
          parent.to,
          syntax.from,
          syntax.to,
        ));
      const activeRenderedParent = Boolean(
        !props.readonly
        && parent
        && getRenderedInlineClass(parent.name)
        && selectionTouchesRange(state, parent.from, parent.to)
      );
      if (node.name === "InlineCode") {
        if (activeRenderedNode) {
          const content = getRenderedInlineContentRange(node.node);
          if (content.to > content.from) {
            ranges.push(Decoration.mark({
              class: "cm-rendered-inline-code",
            }).range(content.from, content.to));
          }
          return false;
        }
        const markdownSource = source.slice(node.from, node.to);
        const value = renderMarkdownCodeSpanText(markdownSource);
        if (value !== null) {
          ranges.push(Decoration.replace({
            widget: new InlineTextReplacementWidget(
              markdownSource,
              value,
              node.from,
              "cm-rendered-inline-code",
            ),
          }).range(node.from, node.to));
        }
        return false;
      }

      if (node.name === "Escape") {
        let ancestor = node.node.parent;
        let insideUrl = false;
        while (ancestor) {
          if (ancestor.name === "URL") {
            insideUrl = true;
            break;
          }
          ancestor = ancestor.parent;
        }
        if (!insideUrl && node.to > node.from + 1) {
          ranges.push(Decoration.replace({}).range(node.from, node.from + 1));
        }
        return false;
      }

      if (node.name === "Entity") {
        const active = !props.readonly && selectionTouchesRange(state, node.from, node.to);
        if (!active) {
          ranges.push(Decoration.replace({
            widget: new DecodedEntityWidget(source.slice(node.from, node.to), node.from),
          }).range(node.from, node.to));
        }
        return false;
      }

      if (node.name === "HardBreak") {
        const markerTo = source[node.to - 1] === "\n" ? node.to - 1 : node.to;
        const touchesSelection = !props.readonly && selectionTouchesRange(state, node.from, markerTo);
        if (!touchesSelection && markerTo > node.from) {
          ranges.push(Decoration.replace({}).range(node.from, markerTo));
        }
        return false;
      }

      const renderedRange = activeRenderedNode
        ? getRenderedInlineContentRange(node.node)
        : { from: node.from, to: node.to };
      if (renderedClass && renderedRange.to > renderedRange.from) {
        ranges.push(Decoration.mark({ class: renderedClass }).range(
          renderedRange.from,
          renderedRange.to,
        ));
      }

      if (
        !activeRenderedParent
        && (
          node.name === "EmphasisMark"
          || node.name === "CodeMark"
          || (node.name === "StrikethroughMark" && !parentOverridesStrikethrough)
          || (isSubscriptExtensionEnabled(props.settings.extensions) && node.name === "SubscriptMark")
          || (isSuperscriptExtensionEnabled(props.settings.extensions) && node.name === "SuperscriptMark")
          || (node.name === "LinkMark" && (parentName === "Link" || parentName === "Autolink"))
          || (node.name === "URL" && parentName === "Link")
          || (node.name === "LinkLabel" && parentName === "Link")
        )
      ) {
        ranges.push(Decoration.replace({}).range(node.from, node.to));
      }
      if (node.name === "LinkTitle" && parentName === "Link" && !activeRenderedParent) {
        let titleFrom = node.from;
        while (titleFrom > (node.node.parent?.from ?? node.from) && /\s/.test(source[titleFrom - 1] ?? "")) {
          titleFrom -= 1;
        }
        ranges.push(Decoration.replace({}).range(titleFrom, node.to));
      }
      return undefined;
    },
  });
  addStrikethroughOverrideDecorations(state, ranges, strikethroughOverrides);
  addCjkUnderscoreEmphasisDecorations(state, ranges, previewBlocks, highlightBlockedRanges);
  if (isHighlightExtensionEnabled(props.settings.extensions)) {
    addHighlightPreviewDecorations(state, ranges, previewBlocks, highlightBlockedRanges);
  }
}

interface InlineTextReplacement {
  from: number;
  to: number;
  source: string;
  value: string;
  className: string;
}

interface CachedPlainTextLineSemantics {
  from: number;
  to: number;
  abbreviations: MarkdownAbbreviationMatch[];
  emoji: InlineTextReplacement[];
  autoLinks: MarkdownAutoLinkMatch[];
  smartPunctuation: Omit<InlineTextReplacement, "className">[];
}

let plainTextSemanticCache: {
  source: string;
  emoji: boolean;
  smartQuotes: boolean;
  smartDashes: boolean;
  lines: CachedPlainTextLineSemantics[];
} | null = null;

function addPlainTextSemanticDecorations(
  state: EditorState,
  ranges: Range<Decoration>[],
  protectedBlocks: Array<{ from: number; to: number }>,
  occupiedRanges: Array<{ from: number; to: number }>,
  abbreviations: readonly MarkdownAbbreviation[],
) {
  if (
    abbreviations.length === 0
    && !props.settings.extensions.emoji
    && !props.settings.extensions.autoLinks
    && !props.settings.smartQuotes
    && !props.settings.smartDashes
  ) {
    return;
  }
  const source = state.doc.toString();
  const { text, autoLink } = collectPlainTextProtectedRanges(state, protectedBlocks, occupiedRanges);
  const lineSemantics = getCachedPlainTextSemantics(state, source, abbreviations);

  for (const line of lineSemantics) {
    if (rangeInsidePreviewBlock(line.from, line.to, protectedBlocks)) continue;
    const detectedLinks = line.autoLinks;
    const textProtectedRanges = [
      ...text,
      ...detectedLinks.map((match) => ({ from: match.start, to: match.end })),
    ];
    const renderedAbbreviations: Array<{ from: number; to: number }> = [];

    for (const abbreviation of line.abbreviations) {
      if (renderedAbbreviations.some((range) => (
        rangesIntersect(abbreviation.start, abbreviation.end, range.from, range.to)
      ))) {
        continue;
      }
      if (addAbbreviationDecoration(state, ranges, abbreviation, textProtectedRanges)) {
        renderedAbbreviations.push({ from: abbreviation.start, to: abbreviation.end });
      }
    }
    const replacementProtectedRanges = [...textProtectedRanges, ...renderedAbbreviations];

    if (props.settings.extensions.emoji) {
      for (const emoji of line.emoji) {
        addInlineTextReplacement(state, ranges, emoji, replacementProtectedRanges);
      }
    }

    if (props.settings.smartQuotes || props.settings.smartDashes) {
      for (const replacement of line.smartPunctuation) {
        addInlineTextReplacement(state, ranges, {
          ...replacement,
          className: "cm-rendered-smart-punctuation",
        }, replacementProtectedRanges);
      }
    }

    if (!props.settings.extensions.autoLinks) continue;
    for (const link of detectedLinks) {
      if (autoLink.some((range) => rangesIntersect(link.start, link.end, range.from, range.to))) continue;
      if (renderedAbbreviations.some((range) => rangesIntersect(link.start, link.end, range.from, range.to))) continue;
      const active = !props.readonly && selectionTouchesRange(state, link.start, link.end);
      if (!active && link.textStart > link.start) {
        ranges.push(Decoration.replace({}).range(link.start, link.textStart));
      }
      ranges.push(Decoration.mark({ class: "cm-rendered-link" }).range(link.textStart, link.textEnd));
      if (!active && link.textEnd < link.end) {
        ranges.push(Decoration.replace({}).range(link.textEnd, link.end));
      }
    }
  }
}

function getCachedPlainTextSemantics(
  state: EditorState,
  source: string,
  abbreviations: readonly MarkdownAbbreviation[],
): CachedPlainTextLineSemantics[] {
  const emojiEnabled = props.settings.extensions.emoji;
  const smartQuotesEnabled = props.settings.smartQuotes;
  const smartDashesEnabled = props.settings.smartDashes;
  const smartPunctuationEnabled = smartQuotesEnabled || smartDashesEnabled;
  if (
    plainTextSemanticCache?.source === source
    && plainTextSemanticCache.emoji === emojiEnabled
    && plainTextSemanticCache.smartQuotes === smartQuotesEnabled
    && plainTextSemanticCache.smartDashes === smartDashesEnabled
  ) {
    return plainTextSemanticCache.lines;
  }

  const smartPunctuationByLine = smartPunctuationEnabled
    ? collectSmartPunctuationByLine(state, source)
    : new Map<number, Omit<InlineTextReplacement, "className">[]>();
  const lines: CachedPlainTextLineSemantics[] = [];
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const autoLinks = getMarkdownAutoLinkMatches(line.text).map((match) => ({
      ...match,
      start: line.from + match.start,
      end: line.from + match.end,
      textStart: line.from + match.textStart,
      textEnd: line.from + match.textEnd,
    }));
    lines.push({
      from: line.from,
      to: line.to,
      abbreviations: getMarkdownAbbreviationMatches(line.text, abbreviations).map((match) => ({
        ...match,
        start: line.from + match.start,
        end: line.from + match.end,
      })),
      autoLinks,
      emoji: emojiEnabled
        ? getEmojiShortcodeMatches(line.text).map((emoji) => ({
          from: line.from + emoji.start,
          to: line.from + emoji.end,
          source: emoji.source,
          value: emoji.value,
          className: "cm-rendered-emoji",
        }))
        : [],
      smartPunctuation: smartPunctuationByLine.get(lineNumber) ?? [],
    });
  }
  plainTextSemanticCache = {
    source,
    emoji: emojiEnabled,
    smartQuotes: smartQuotesEnabled,
    smartDashes: smartDashesEnabled,
    lines,
  };
  return lines;
}

function collectSmartPunctuationByLine(
  state: EditorState,
  source: string,
): Map<number, Omit<InlineTextReplacement, "className">[]> {
  const result = new Map<number, Omit<InlineTextReplacement, "className">[]>();
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    result.set(lineNumber, collectInlineTextReplacementRanges(
      line.text,
      renderSmartPunctuationText(line.text, {
        quotes: props.settings.smartQuotes,
        dashes: props.settings.smartDashes,
      }),
      line.from,
    ));
  }

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Paragraph") return undefined;
      const paragraphSource = source.slice(node.from, node.to);
      if (!paragraphSource.includes("\n")) return false;

      const firstLine = state.doc.lineAt(node.from).number;
      const lastLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
      for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
        result.set(lineNumber, []);
      }

      const normalizedSource = paragraphSource.replace(/\r\n/g, "\n");
      const normalizedRendered = renderSmartPunctuationText(normalizedSource, {
        quotes: props.settings.smartQuotes,
        dashes: props.settings.smartDashes,
      });
      const rendered = paragraphSource.includes("\r\n")
        ? normalizedRendered.replace(/\n/g, "\r\n")
        : normalizedRendered;
      for (const replacement of collectInlineTextReplacementRanges(
        paragraphSource,
        rendered,
        node.from,
      )) {
        const lineNumber = state.doc.lineAt(replacement.from).number;
        result.get(lineNumber)?.push(replacement);
      }
      return false;
    },
  });
  return result;
}

function addAbbreviationDecoration(
  state: EditorState,
  ranges: Range<Decoration>[],
  abbreviation: MarkdownAbbreviationMatch,
  protectedRanges: Array<{ from: number; to: number }>,
): boolean {
  if (abbreviation.end <= abbreviation.start) return false;
  if (!props.readonly && selectionTouchesRange(state, abbreviation.start, abbreviation.end)) return false;
  if (protectedRanges.some((range) => (
    rangesIntersect(abbreviation.start, abbreviation.end, range.from, range.to)
  ))) {
    return false;
  }
  ranges.push(Decoration.replace({
    widget: new AbbreviationWidget(
      abbreviation.label,
      abbreviation.title,
      abbreviation.start,
    ),
  }).range(abbreviation.start, abbreviation.end));
  return true;
}

function collectPlainTextProtectedRanges(
  state: EditorState,
  protectedBlocks: Array<{ from: number; to: number }>,
  occupiedRanges: Array<{ from: number; to: number }>,
): {
  text: Array<{ from: number; to: number }>;
  autoLink: Array<{ from: number; to: number }>;
} {
  const source = state.doc.toString();
  const inlineSpecialRanges = [
    ...collectInlineHtmlMarkupRanges(source).map((item) => ({ from: item.start, to: item.end })),
    ...collectInlineMathSyntax(source, { includeLinkLabels: true })
      .map((item) => ({ from: item.start, to: item.end })),
    ...collectInlineMarkdownSyntax(source)
      .filter((item) => item.type === "image")
      .map((item) => ({ from: item.start, to: item.end })),
  ];
  const text = [...protectedBlocks, ...occupiedRanges, ...inlineSpecialRanges];
  const autoLink = [...protectedBlocks, ...occupiedRanges, ...inlineSpecialRanges];

  syntaxTree(state).iterate({
    enter(node) {
      if (["InlineCode", "Autolink", "URL", "LinkTitle", "Escape", "Entity"].includes(node.name)) {
        text.push({ from: node.from, to: node.to });
      }
      if (["InlineCode", "Autolink", "Link", "Image"].includes(node.name)) {
        autoLink.push({ from: node.from, to: node.to });
      }
      return undefined;
    },
  });

  return { text, autoLink };
}

function addInlineTextReplacement(
  state: EditorState,
  ranges: Range<Decoration>[],
  replacement: InlineTextReplacement,
  protectedRanges: Array<{ from: number; to: number }>,
) {
  if (replacement.to <= replacement.from || replacement.source === replacement.value) return;
  if (!props.readonly && selectionTouchesRange(state, replacement.from, replacement.to)) return;
  if (protectedRanges.some((range) => rangesIntersect(replacement.from, replacement.to, range.from, range.to))) {
    return;
  }
  ranges.push(Decoration.replace({
    widget: new InlineTextReplacementWidget(
      replacement.source,
      replacement.value,
      replacement.from,
      replacement.className,
    ),
  }).range(replacement.from, replacement.to));
}

function isResolvedMarkdownLinkNode(
  source: string,
  from: number,
  to: number,
  referenceLabels: ReadonlySet<string>,
): boolean {
  const inline = readMarkdownInlineLink(source, from);
  if (inline?.end === to) return true;

  const reference = readMarkdownReferenceLink(source, from)
    ?? readMarkdownShortcutReferenceLink(source, from);
  if (!reference || reference.end !== to) return true;

  const label = reference.referenceLabel || reference.label;
  return referenceLabels.has(normalizeMarkdownReferenceLabel(label));
}

function isRevealableInlineNode(nodeName: string): boolean {
  return Boolean(getRenderedInlineClass(nodeName))
    || nodeName === "Escape"
    || nodeName === "Entity"
    || nodeName === "HardBreak";
}

function getRenderedInlineClass(nodeName: string): string | null {
  if (nodeName === "StrongEmphasis") return "cm-rendered-strong";
  if (nodeName === "Emphasis") return "cm-rendered-emphasis";
  if (nodeName === "Strikethrough") return "cm-rendered-strikethrough";
  if (nodeName === "InlineCode") return "cm-rendered-inline-code";
  if (nodeName === "Link" || nodeName === "Autolink") return "cm-rendered-link";
  if (isSubscriptExtensionEnabled(props.settings.extensions) && nodeName === "Subscript") return "cm-rendered-subscript";
  if (isSuperscriptExtensionEnabled(props.settings.extensions) && nodeName === "Superscript") return "cm-rendered-superscript";
  return null;
}

type ContinuousSyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

function getRenderedInlineContentRange(
  node: ContinuousSyntaxNode,
): { from: number; to: number } {
  const children: ContinuousSyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child);
  }

  if (node.name === "Autolink") {
    const url = children.find((child) => child.name === "URL");
    return url ? { from: url.from, to: url.to } : { from: node.from, to: node.to };
  }

  if (node.name === "Link") {
    const markers = children.filter((child) => child.name === "LinkMark");
    return markers.length >= 2
      ? { from: markers[0]!.to, to: markers[1]!.from }
      : { from: node.from, to: node.to };
  }

  const markerNames: Partial<Record<string, string>> = {
    StrongEmphasis: "EmphasisMark",
    Emphasis: "EmphasisMark",
    Strikethrough: "StrikethroughMark",
    InlineCode: "CodeMark",
    Subscript: "SubscriptMark",
    Superscript: "SuperscriptMark",
  };
  const markerName = markerNames[node.name];
  const markers = markerName
    ? children.filter((child) => child.name === markerName)
    : [];
  return markers.length >= 2
    ? { from: markers[0]!.to, to: markers.at(-1)!.from }
    : { from: node.from, to: node.to };
}

interface AdjacentStrongSegment {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
}

function getAdjacentStrongSegments(
  source: string,
  node: ContinuousSyntaxNode,
): AdjacentStrongSegment[] | null {
  const content = getRenderedInlineContentRange(node);
  const marker = source.slice(node.from, content.from);
  if (
    (marker !== "**" && marker !== "__")
    || source.slice(content.to, node.to) !== marker
  ) {
    return null;
  }

  const delimiter = marker + marker;
  const boundaries: number[] = [];
  let searchFrom = content.from;
  while (searchFrom < content.to) {
    const boundary = source.indexOf(delimiter, searchFrom);
    if (boundary < 0 || boundary + delimiter.length > content.to) break;
    boundaries.push(boundary);
    searchFrom = boundary + delimiter.length;
  }
  if (boundaries.length === 0) return null;

  let segmentFrom = node.from;
  const valid = boundaries.every((boundary) => {
    const hasContent = boundary > segmentFrom + marker.length;
    segmentFrom = boundary + marker.length;
    return hasContent;
  }) && content.to > segmentFrom + marker.length;
  if (!valid) return null;

  const segments: AdjacentStrongSegment[] = [];
  segmentFrom = node.from;
  for (const boundary of boundaries) {
    const segmentTo = boundary + marker.length;
    segments.push({
      from: segmentFrom,
      to: segmentTo,
      contentFrom: segmentFrom + marker.length,
      contentTo: boundary,
    });
    segmentFrom = segmentTo;
  }
  segments.push({
    from: segmentFrom,
    to: node.to,
    contentFrom: segmentFrom + marker.length,
    contentTo: content.to,
  });
  return segments;
}

function addCjkUnderscoreEmphasisDecorations(
  state: EditorState,
  ranges: Range<Decoration>[],
  previewBlocks: Array<{ from: number; to: number }>,
  blockedRanges: Array<{ from: number; to: number }>,
) {
  const source = state.doc.toString();
  for (const syntax of collectCjkUnderscoreEmphasis(source)) {
    if (rangeInsidePreviewBlock(syntax.start, syntax.end, previewBlocks)) continue;
    if (blockedRanges.some((range) => rangesIntersect(syntax.start, syntax.end, range.from, range.to))) continue;

    const active = !props.readonly && selectionTouchesRange(state, syntax.start, syntax.end);
    if (!active) {
      ranges.push(Decoration.replace({}).range(syntax.start, syntax.contentStart));
    }
    ranges.push(Decoration.mark({
      class: syntax.kind === "strong" ? "cm-rendered-strong" : "cm-rendered-emphasis",
    }).range(syntax.contentStart, syntax.contentEnd));
    if (!active) {
      ranges.push(Decoration.replace({}).range(syntax.contentEnd, syntax.end));
    }
  }
}

function addHighlightPreviewDecorations(
  state: EditorState,
  ranges: Range<Decoration>[],
  previewBlocks: Array<{ from: number; to: number }>,
  blockedRanges: Array<{ from: number; to: number }>,
) {
  const source = state.doc.toString();
  const semanticRanges = getInlineStyleSemanticRanges(state);

  const seen = new Set<string>();
  for (const semanticRange of semanticRanges) {
    if (rangeInsidePreviewBlock(semanticRange.from, semanticRange.to, previewBlocks)) continue;

    for (const highlight of collectHighlightSyntax(
      source.slice(semanticRange.from, semanticRange.to),
      semanticRange.from,
      blockedRanges,
    )) {
      const key = `${highlight.from}:${highlight.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const active = !props.readonly
        && selectionTouchesRange(state, highlight.from, highlight.to);
      if (!active) {
        ranges.push(Decoration.replace({}).range(highlight.from, highlight.contentFrom));
      }
      ranges.push(Decoration.mark({ class: "cm-rendered-highlight" }).range(
        highlight.contentFrom,
        highlight.contentTo,
      ));
      if (!active) {
        ranges.push(Decoration.replace({}).range(highlight.contentTo, highlight.to));
      }
    }
  }
}

function getInlineStyleSemanticRanges(
  state: EditorState,
): Array<{ from: number; to: number }> {
  const semanticRanges: Array<{ from: number; to: number }> = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name === "Paragraph"
        || /^ATXHeading[1-6]$/.test(node.name)
        || /^SetextHeading[12]$/.test(node.name)
        || node.name === "TableCell"
      ) {
        semanticRanges.push({ from: node.from, to: node.to });
        return false;
      }
      return undefined;
    },
  });

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (!semanticRanges.some((range) => rangesIntersect(line.from, line.to, range.from, range.to))) {
      semanticRanges.push({ from: line.from, to: line.to });
    }
  }

  return semanticRanges;
}

function collectStrikethroughOverrides(
  state: EditorState,
  previewBlocks: Array<{ from: number; to: number }>,
  blockedRanges: Array<{ from: number; to: number }>,
): StrikethroughSyntax[] {
  const source = state.doc.toString();
  const result: StrikethroughSyntax[] = [];
  const seen = new Set<string>();

  for (const semanticRange of getInlineStyleSemanticRanges(state)) {
    if (rangeInsidePreviewBlock(semanticRange.from, semanticRange.to, previewBlocks)) continue;
    for (const syntax of collectStrikethroughSyntax(
      source.slice(semanticRange.from, semanticRange.to),
      semanticRange.from,
      blockedRanges,
    )) {
      if (!usesExtendedStrikethroughRun(source, syntax)) continue;
      const key = `${syntax.from}:${syntax.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(syntax);
    }
  }

  return result;
}

function usesExtendedStrikethroughRun(
  source: string,
  syntax: StrikethroughSyntax,
): boolean {
  return getMarkerRunLength(source, syntax.from, "~") > 2
    || getMarkerRunLength(source, syntax.to - 1, "~") > 2;
}

function getMarkerRunLength(source: string, index: number, marker: string): number {
  let from = index;
  let to = index + 1;
  while (source[from - 1] === marker) from -= 1;
  while (source[to] === marker) to += 1;
  return to - from;
}

function addStrikethroughOverrideDecorations(
  state: EditorState,
  ranges: Range<Decoration>[],
  syntax: readonly StrikethroughSyntax[],
) {
  for (const item of syntax) {
    const active = !props.readonly && selectionTouchesRange(state, item.from, item.to);
    if (!active) {
      ranges.push(Decoration.replace({}).range(item.from, item.contentFrom));
    }
    ranges.push(Decoration.mark({ class: "cm-rendered-strikethrough" }).range(
      item.contentFrom,
      item.contentTo,
    ));
    if (!active) {
      ranges.push(Decoration.replace({}).range(item.contentTo, item.to));
    }
  }
}

function rangesIntersect(from: number, to: number, otherFrom: number, otherTo: number): boolean {
  return from < otherTo && to > otherFrom;
}

function selectionTouchesRange(state: EditorState, from: number, to: number): boolean {
  if (keepsRenderedPreviewForSelection(state)) return false;
  return state.selection.ranges.some((selection) => (
    selection.empty
      ? selection.head >= from && selection.head <= to
      : rangesIntersect(from, to, selection.from, selection.to)
  ));
}

function selectionIntersectsBlock(state: EditorState, block: ContinuousPreviewBlock): boolean {
  if (keepsRenderedPreviewForSelection(state)) return false;
  const selection = state.selection.main;
  if (selection.empty) return selection.head >= block.from && selection.head < block.to;
  return selection.from < block.to && selection.to > block.from;
}

function keepsRenderedPreviewForSelection(state: EditorState): boolean {
  const selection = state.field(renderedTripleClickSelectionField, false);
  return selection?.eq(state.selection) ?? false;
}

function getPreviewDecorationTo(block: ContinuousPreviewBlock, source: string): number {
  if (
    block.to >= source.length
    || (block.kind !== "html" && !/^[ \t]{0,3}>/.test(source.slice(block.to)))
  ) {
    return block.to;
  }
  if (source.slice(Math.max(block.from, block.to - 2), block.to) === "\r\n") {
    return block.to - 2;
  }
  return source[block.to - 1] === "\n" ? block.to - 1 : block.to;
}

function rangeInsidePreviewBlock(from: number, to: number, blocks: Array<{ from: number; to: number }>): boolean {
  return blocks.some((block) => from >= block.from && Math.max(from, to) <= block.to);
}

function rangeInsidePreviewPresentation(
  from: number,
  to: number,
  blocks: Array<{ from: number; to: number }>,
): boolean {
  return blocks.some((block) => (
    from >= block.from
    && (to > from ? to <= block.to : from < block.to)
  ));
}

function rangeInsideSemanticDefinition(
  from: number,
  to: number,
  definitions: Array<{ from: number; to: number }>,
): boolean {
  return definitions.some((definition) => (
    from >= definition.from
    && (to > from ? to <= definition.to : from < definition.to)
  ));
}

function createSpecialPreviewWidget(
  block: ContinuousPreviewBlock,
  documentSource: string,
  spacing: PreviewWidgetSpacing,
): WidgetType {
  if (block.kind === "table") {
    return new VisualTableBlockWidget(block, documentSource, spacing);
  }
  if (block.kind === "diagram" && isDiagramPreviewEnabled(block.source)) {
    return new DiagramBlockWidget(block, documentSource, spacing);
  }
  const html = renderMarkdown(block.source, {
    basePath: props.filePath,
    documentSource,
    sourceOffset: block.kind === "math" ? block.from : undefined,
    outline: props.outline,
    settings: props.settings,
    assetResolver: resolveLocalAsset,
  });
  const renderedKind = block.kind === "diagram" ? "code" : block.kind;
  return new RenderedMarkdownBlockWidget(
    html,
    block.source,
    documentSource,
    block.from,
    block.to,
    renderedKind,
    block.quoteDepth,
    block.listDepth,
    spacing,
  );
}

function createActiveMathPreviewWidget(
  block: ContinuousPreviewBlock,
  documentSource: string,
): WidgetType {
  const html = renderMarkdown(block.source, {
    basePath: props.filePath,
    documentSource,
    sourceOffset: block.from,
    outline: props.outline,
    settings: props.settings,
    assetResolver: resolveLocalAsset,
  });
  return new ActiveMathPreviewWidget(
    html,
    block.quoteDepth,
    block.listDepth,
  );
}

function isDiagramPreviewEnabled(source: string): boolean {
  const language = getContinuousDiagramLanguage(source);
  return language ? props.settings.extensions[language] : false;
}

interface ExternalTablePointerCandidate {
  distance: number;
  pending: boolean;
}

interface VisualTableEditorHandle {
  runCommand: (command: EditorCommand, payload?: string) => VisualTableCommandResult;
  getExternalPointerCandidate: (
    event: MouseEvent,
    type: "mousedown" | "contextmenu",
  ) => ExternalTablePointerCandidate | null;
  handleExternalPointerEvent: (event: MouseEvent, type: "mousedown" | "contextmenu") => boolean;
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
  readonly: boolean;
}

interface TableWidgetMount {
  app: VueApplication;
  state: TableWidgetState;
  handle: VisualTableEditorHandle | null;
  lastInputGroup: string | null;
  joinExitToLastUpdate: boolean;
}

interface DiagramWidgetState {
  source: string;
  documentSource: string;
  from: number;
  to: number;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
  readonly: boolean;
}

interface DiagramWidgetMount {
  app: VueApplication;
  state: DiagramWidgetState;
}

class SoftBreakWidget extends WidgetType {
  eq(other: WidgetType): boolean {
    return other instanceof SoftBreakWidget;
  }

  toDOM(): HTMLElement {
    const space = document.createElement("span");
    space.className = "cm-rendered-softbreak";
    space.textContent = " ";
    return space;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class InlineTextReplacementWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly source: string,
    private readonly value: string,
    private readonly from: number,
    private readonly className: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof InlineTextReplacementWidget
      && other.source === this.source
      && other.value === this.value
      && other.from === this.from
      && other.className === this.className
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const replacement = document.createElement("span");
    replacement.className = this.className;
    replacement.textContent = this.value;
    replacement.dataset.markdownSource = this.source;
    replacement.dataset.markdownSyntax = "markdown";
    if (!this.isReadonly) {
      replacement.setAttribute("role", "button");
      replacement.setAttribute("aria-description", "点击编辑源码");
      replacement.addEventListener("mousedown", (event) => {
        beginInlineRenderedTextPointerSelection(
          view,
          replacement,
          this.from,
          this.source,
          "markdown",
          event,
        );
      });
      replacement.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        revealInlineRenderedTextSource(
          view,
          replacement,
          this.from,
          this.source,
          "markdown",
          event,
        );
      });
    }
    return replacement;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class AbbreviationWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly label: string,
    private readonly title: string,
    private readonly from: number,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof AbbreviationWidget
      && other.label === this.label
      && other.title === this.title
      && other.from === this.from
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const abbreviation = document.createElement("abbr");
    abbreviation.className = "cm-rendered-abbreviation";
    abbreviation.textContent = this.label;
    abbreviation.title = this.title;
    abbreviation.dataset.markdownSource = this.label;
    abbreviation.dataset.markdownSyntax = "markdown";
    if (!this.isReadonly) {
      abbreviation.setAttribute("role", "button");
      abbreviation.setAttribute("aria-description", "点击编辑源码");
      abbreviation.addEventListener("mousedown", (event) => {
        beginInlineRenderedTextPointerSelection(
          view,
          abbreviation,
          this.from,
          this.label,
          "markdown",
          event,
        );
      });
      abbreviation.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        revealInlineRenderedTextSource(
          view,
          abbreviation,
          this.from,
          this.label,
          "markdown",
          event,
        );
      });
    }
    return abbreviation;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class ReferenceDefinitionWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly definition: ReferenceDefinitionSemantics,
    private readonly quoteDepth: number,
    private readonly listDepth: number | null,
    private readonly hasFollowingGap: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof ReferenceDefinitionWidget
      && other.definition.from === this.definition.from
      && other.definition.to === this.definition.to
      && other.definition.raw === this.definition.raw
      && other.quoteDepth === this.quoteDepth
      && other.listDepth === this.listDepth
      && other.hasFollowingGap === this.hasFollowingGap
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-reference-definition";
    if (this.hasFollowingGap) root.classList.add("cm-definition-following-gap");
    applyPreviewContainerPresentation(root, {
      quoteDepth: this.quoteDepth,
      listDepth: this.listDepth,
    }, true);
    root.dataset.markdownSource = this.definition.raw;
    root.setAttribute("role", this.isReadonly ? "region" : "group");
    root.setAttribute("aria-label", "链接引用定义");

    const appendField = (
      field: ReferenceDefinitionSourceValue,
      className: string,
      label: string,
    ) => {
      const element = document.createElement("span");
      element.className = `cm-reference-definition-field ${className}`;
      element.textContent = field.value || "\u200b";
      element.dataset.markdownSource = field.raw;
      element.dataset.markdownSyntax = "markdown-visible";
      element.dataset.markdownFrom = String(field.from);
      element.setAttribute("aria-label", label);
      let pointerHandled = false;
      if (!this.isReadonly) {
        element.setAttribute("role", "button");
        element.setAttribute("aria-description", "点击编辑源码");
        element.addEventListener("mousedown", (event) => {
          if (event.button === 0) pointerHandled = true;
          beginStructuredDefinitionFieldPointerSelection(
            view,
            element,
            field.from,
            field.to,
            event,
          );
        });
        element.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pointerHandled) {
            pointerHandled = false;
            return;
          }
          revealStructuredDefinitionRange(view, field.from, field.to);
        });
      }
      root.append(element);
    };

    const appendSeparator = () => {
      const separator = document.createElement("span");
      separator.className = "cm-reference-definition-separator";
      separator.setAttribute("aria-hidden", "true");
      root.append(separator);
    };

    appendField(this.definition.label, "cm-reference-definition-name", "引用名称");
    appendSeparator();
    appendField(this.definition.url, "cm-reference-definition-url", "链接地址");
    if (this.definition.title) {
      appendSeparator();
      appendField(this.definition.title, "cm-reference-definition-title", "链接标题");
    }
    return root;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class FootnoteDefinitionWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly definition: FootnoteDefinitionSemantics,
    private readonly quoteDepth: number,
    private readonly listDepth: number | null,
    private readonly hasFollowingGap: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof FootnoteDefinitionWidget
      && other.definition.from === this.definition.from
      && other.definition.to === this.definition.to
      && other.definition.raw === this.definition.raw
      && sameFootnoteReferences(other.definition.references, this.definition.references)
      && other.quoteDepth === this.quoteDepth
      && other.listDepth === this.listDepth
      && other.hasFollowingGap === this.hasFollowingGap
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-footnote-definition-widget";
    if (this.hasFollowingGap) root.classList.add("cm-definition-following-gap");
    root.dataset.markdownSource = this.definition.raw;
    root.dataset.footnoteId = this.definition.id;
    root.setAttribute("role", this.isReadonly ? "region" : "group");
    root.setAttribute("aria-label", "脚注定义");
    applyPreviewContainerPresentation(root, {
      quoteDepth: this.quoteDepth,
      listDepth: this.listDepth,
    }, true);

    const label = document.createElement("span");
    label.className = "cm-footnote-definition-field cm-footnote-definition-label";
    label.textContent = this.definition.id || "\u200b";
    label.dataset.markdownSource = this.definition.label.raw;
    label.dataset.markdownSyntax = "markdown-visible";
    label.dataset.markdownFrom = String(this.definition.label.from);
    label.setAttribute("aria-label", "脚注名称");
    this.bindFieldSelection(label, view, this.definition.label.from, this.definition.label.to);

    const separator = document.createElement("span");
    separator.className = "cm-footnote-definition-separator";
    separator.setAttribute("aria-hidden", "true");

    const content = document.createElement("div");
    content.className = "cm-footnote-definition-field cm-footnote-definition-content";
    content.dataset.markdownSource = this.definition.content.raw;
    content.dataset.markdownSyntax = "markdown";
    content.dataset.markdownFrom = String(this.definition.content.from);
    content.setAttribute("aria-label", "脚注内容");
    if (this.definition.markdown) {
      content.innerHTML = sanitizeMarkdownHtml(renderMarkdown(this.definition.markdown, {
        basePath: props.filePath,
        documentSource: view.state.doc.toString(),
        sourceOffset: this.definition.content.from,
        outline: props.outline,
        settings: props.settings,
        assetResolver: resolveLocalAsset,
      }));
    } else {
      content.classList.add("cm-footnote-definition-content-empty");
      content.textContent = "\u200b";
    }
    this.bindContentSelection(content, view);

    root.append(label, separator, content);
    if (this.definition.references.length > 0) {
      root.append(createFootnoteBacklinksElement(
        view,
        this.definition.id,
        this.definition.references,
      ));
    }
    prepareRenderedImages(root, this.definition.markdown, () => view.requestMeasure(), view.state.doc.toString());
    observeWidgetSize(root, view);
    return root;
  }

  destroy(dom: HTMLElement) {
    disconnectWidgetSizeObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }

  private bindFieldSelection(
    field: HTMLElement,
    view: EditorView,
    from: number,
    to: number,
  ) {
    if (this.isReadonly) return;
    let pointerHandled = false;
    field.setAttribute("role", "button");
    field.setAttribute("aria-description", "点击编辑源码");
    field.addEventListener("mousedown", (event) => {
      if (event.button === 0) pointerHandled = true;
      beginStructuredDefinitionFieldPointerSelection(view, field, from, to, event);
    });
    field.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (pointerHandled) {
        pointerHandled = false;
        return;
      }
      revealStructuredDefinitionRange(view, from, to);
    });
  }

  private bindContentSelection(content: HTMLElement, view: EditorView) {
    let pointerHandled = false;
    if (!this.isReadonly) {
      content.setAttribute("role", "button");
      content.setAttribute("aria-description", "点击编辑源码");
      content.addEventListener("mousedown", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const anchor = target?.closest<HTMLAnchorElement>("a[href]");
        if (anchor && shouldOpenPreviewLink(event)) {
          resetPointerGestureTracking();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.button === 0) pointerHandled = true;
        beginStructuredDefinitionFieldPointerSelection(
          view,
          content,
          this.definition.content.from,
          this.definition.content.to,
          event,
        );
      });
    }
    content.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (anchor && (this.isReadonly || shouldOpenPreviewLink(event))) {
        event.preventDefault();
        event.stopPropagation();
        emit("openLinkHref", anchor.getAttribute("href") ?? "");
        return;
      }
      if (this.isReadonly) return;
      event.preventDefault();
      event.stopPropagation();
      if (pointerHandled) {
        pointerHandled = false;
        return;
      }
      revealStructuredDefinitionRange(
        view,
        this.definition.content.from,
        this.definition.content.to,
      );
    });
  }
}

class DecodedEntityWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly source: string,
    private readonly from: number,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof DecodedEntityWidget
      && other.source === this.source
      && other.from === this.from
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const entity = document.createElement("span");
    entity.className = "cm-rendered-entity";
    entity.innerHTML = this.source;
    entity.dataset.markdownSource = this.source;
    entity.dataset.markdownSyntax = "markdown-visible";
    if (!this.isReadonly) {
      entity.setAttribute("role", "button");
      entity.setAttribute("aria-description", "\u70b9\u51fb\u7f16\u8f91\u6e90\u7801");
      entity.addEventListener("mousedown", (event) => {
        beginInlineRenderedTextPointerSelection(
          view,
          entity,
          this.from,
          this.source,
          "markdown-visible",
          event,
        );
      });
      entity.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        revealInlineRenderedTextSource(
          view,
          entity,
          this.from,
          this.source,
          "markdown-visible",
          event,
        );
      });
    }
    return entity;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class InlineRenderedMarkdownWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly source: string,
    private readonly documentSource: string,
    private readonly from: number,
    private readonly kind: "image" | "link" | "math" | "html",
    private readonly filePath = props.filePath,
    private readonly outline = props.outline,
    private readonly settings = props.settings,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof InlineRenderedMarkdownWidget
      && other.source === this.source
      && other.documentSource === this.documentSource
      && other.from === this.from
      && other.kind === this.kind
      && other.filePath === this.filePath
      && other.outline === this.outline
      && other.settings === this.settings
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("span");
    root.className = `cm-rendered-inline-widget cm-rendered-inline-${this.kind}`;
    if (this.kind === "html" || this.kind === "link") {
      root.dataset.markdownSource = this.source;
      root.dataset.markdownSyntax = this.kind === "html" ? "html" : "markdown-visible";
    }
    const template = document.createElement("template");
    template.innerHTML = sanitizeMarkdownHtml(renderMarkdown(this.source, {
      basePath: this.filePath,
      documentSource: this.documentSource,
      sourceOffset: this.kind === "math" ? this.from : undefined,
      outline: this.outline,
      settings: this.settings,
      assetResolver: resolveLocalAsset,
    }));

    if (this.kind === "image") {
      const image = template.content.querySelector<HTMLImageElement>("img");
      const linkedImage = image?.closest<HTMLAnchorElement>("a[href]");
      const content = linkedImage ?? image;
      if (content) root.append(content);
      else {
        root.textContent = this.source;
        if (isMissingReferenceImageSource(this.source)) {
          root.classList.add("marko-image-reference-missing");
          root.dataset.markoImageState = "missing-reference";
          root.setAttribute("aria-invalid", "true");
          root.setAttribute("title", "未找到图片引用定义");
        }
      }
      root.setAttribute("aria-label", image?.alt || "图片");
    } else if (this.kind === "link") {
      const anchor = template.content.querySelector<HTMLAnchorElement>("a[href]");
      if (anchor) root.append(anchor);
      else root.textContent = this.source;
      root.setAttribute("aria-label", anchor?.textContent || "链接");
    } else if (this.kind === "math") {
      const math = template.content.querySelector<HTMLElement>(".math-inline");
      if (math) root.append(math);
      else root.textContent = this.source;
      root.setAttribute("aria-label", "行内公式");
    } else {
      const paragraph = template.content.querySelector("p");
      if (paragraph) {
        while (paragraph.firstChild) root.append(paragraph.firstChild);
      } else if (template.content.hasChildNodes()) {
        root.append(template.content);
      } else {
        root.textContent = this.source;
      }
      root.setAttribute("aria-label", "行内 HTML");
    }

    if (!this.isReadonly) {
      root.setAttribute("role", "button");
      root.setAttribute("aria-description", "点击编辑源码");
    }
    root.addEventListener("mousedown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (this.kind === "html" && isNativeInteractiveHtmlTarget(target)) {
        event.stopPropagation();
        return;
      }
      if (this.isReadonly) return;
      const htmlImage = this.kind === "html"
        ? target?.closest<HTMLImageElement>("img")
          ?? getImageFromErrorFallback(target)
        : null;
      const targetAnchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (
        (this.kind === "link" && !shouldOpenPreviewLink(event))
        || (
          this.kind === "html"
          && !htmlImage
          && (!targetAnchor || !shouldOpenPreviewLink(event))
        )
      ) {
        beginInlineRenderedTextPointerSelection(
          view,
          root,
          this.from,
          this.source,
          this.kind === "html" ? "html" : "markdown-visible",
          event,
        );
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    });
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]")
        ?? root.querySelector<HTMLAnchorElement>("a[href]");
      if (anchor && (this.isReadonly || shouldOpenPreviewLink(event))) {
        event.preventDefault();
        event.stopPropagation();
        emit("openLinkHref", anchor.getAttribute("href") ?? "");
        return;
      }
      const htmlImage = this.kind === "html"
        ? target?.closest<HTMLImageElement>("img")
          ?? getImageFromErrorFallback(target)
        : null;
      if (htmlImage && !this.isReadonly) {
        event.preventDefault();
        event.stopPropagation();
        revealPreviewRange(view, this.from, this.from + this.source.length);
        return;
      }
      if (this.kind === "html" && isNativeInteractiveHtmlTarget(target)) {
        event.stopPropagation();
        return;
      }
      if (this.isReadonly) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.kind === "image" && !this.isReadonly) {
        if (event.detail > 1) return;
        recentImageClicks.set(view, {
          document: view.state.doc,
          from: this.from,
          to: this.from + this.source.length,
        });
        revealInlineImageAlt(view, this.from, this.source);
        return;
      }
      if (!this.isReadonly) {
        if (this.kind === "math") revealInlineMathSource(view, this.from, this.source);
        else if (this.kind === "html" || this.kind === "link") {
          revealInlineRenderedTextSource(
            view,
            root,
            this.from,
            this.source,
            this.kind === "html" ? "html" : "markdown-visible",
            event,
          );
        }
      }
    });
    root.addEventListener("dblclick", (event) => {
      if (this.kind !== "image" || this.isReadonly) return;
      recentImageClicks.delete(view);
      event.preventDefault();
      event.stopPropagation();
      revealPreviewRange(view, this.from, this.from + this.source.length);
    });
    if (this.kind === "image" || this.kind === "html") {
      prepareRenderedImages(root, this.source, () => view.requestMeasure(), this.documentSource);
    }
    observeWidgetSize(root, view);
    return root;
  }

  destroy(dom: HTMLElement) {
    disconnectWidgetSizeObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function isNativeInteractiveHtmlTarget(target: Element | null): boolean {
  return Boolean(target?.closest("video, audio, input, button, select, textarea, label, details, summary"));
}

class FootnoteReferenceWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly number: number,
    private readonly id: string,
    private readonly markdown: string,
    private readonly from: number,
    private readonly definitionFrom: number | null,
    private readonly missing: boolean,
    private readonly documentSource: string,
    private readonly filePath = props.filePath,
    private readonly outline = props.outline,
    private readonly settings = props.settings,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof FootnoteReferenceWidget
      && other.number === this.number
      && other.id === this.id
      && other.markdown === this.markdown
      && other.from === this.from
      && other.definitionFrom === this.definitionFrom
      && other.missing === this.missing
      && other.documentSource === this.documentSource
      && other.filePath === this.filePath
      && other.outline === this.outline
      && other.settings === this.settings
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const footnote = document.createElement("sup");
    footnote.className = "cm-rendered-footnote-reference";
    footnote.textContent = String(this.number);
    footnote.setAttribute(
      "aria-label",
      this.missing
        ? `\u811a\u6ce8 ${this.number}\uff0c\u672a\u5b9a\u4e49`
        : `\u811a\u6ce8 ${this.number}`,
    );
    footnote.dataset.footnoteId = this.id;
    footnote.dataset.footnoteMissing = String(this.missing);
    if (!this.isReadonly) {
      footnote.setAttribute("role", "button");
      footnote.setAttribute("aria-description", "\u70b9\u51fb\u7f16\u8f91\u6e90\u7801");
    }
    const showTooltip = () => showFootnoteTooltip(footnote, view, {
      id: this.id,
      markdown: this.markdown,
      missing: this.missing,
      documentSource: this.documentSource,
      filePath: this.filePath,
      outline: this.outline,
      settings: this.settings,
      readonly: this.isReadonly,
    });
    footnote.addEventListener("mouseenter", showTooltip);
    footnote.addEventListener("focus", showTooltip);
    footnote.addEventListener("mouseleave", () => scheduleFootnoteTooltipHide(footnote));
    footnote.addEventListener("blur", () => scheduleFootnoteTooltipHide(footnote));
    footnote.addEventListener("mousedown", (event) => {
      if (!this.isReadonly && event.button === 0) resetPointerGestureTracking();
      event.preventDefault();
      event.stopPropagation();
    });
    footnote.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if ((event.ctrlKey || event.metaKey) && this.definitionFrom !== null) {
        revealPreviewBlock(view, this.definitionFrom);
        return;
      }
      if (!this.isReadonly) revealPreviewBlock(view, this.from);
    });
    return footnote;
  }

  destroy(dom: HTMLElement) {
    removeFootnoteTooltip(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

interface FootnoteTooltipOptions {
  id: string;
  markdown: string;
  missing: boolean;
  documentSource: string;
  filePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
  readonly: boolean;
}

function showFootnoteTooltip(
  footnote: HTMLElement,
  view: EditorView,
  options: FootnoteTooltipOptions,
) {
  const existing = footnoteTooltipMounts.get(footnote);
  if (existing) {
    if (existing.hideTimer !== null) window.clearTimeout(existing.hideTimer);
    existing.hideTimer = null;
    return;
  }

  const tooltip = document.createElement("div");
  tooltip.id = `cm-footnote-tooltip-${footnoteTooltipSequence += 1}`;
  tooltip.className = "cm-footnote-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.addEventListener("mousedown", handleEditorSurfaceMouseDownCapture, true);
  const content = document.createElement("div");
  content.className = "cm-footnote-tooltip-content";
  if (options.markdown) {
    content.innerHTML = sanitizeMarkdownHtml(renderMarkdown(options.markdown, {
      basePath: options.filePath,
      documentSource: options.documentSource,
      outline: options.outline,
      settings: options.settings,
      assetResolver: resolveLocalAsset,
    }));
  } else {
    content.textContent = options.missing
      ? "\u672a\u627e\u5230\u811a\u6ce8\u5b9a\u4e49"
      : "\u7a7a\u811a\u6ce8";
  }
  tooltip.append(content);

  if (options.missing && !options.readonly) {
    const createButton = document.createElement("button");
    createButton.type = "button";
    createButton.className = "cm-footnote-create-definition";
    createButton.textContent = "\u521b\u5efa\u5b9a\u4e49";
    createButton.addEventListener("mousedown", (event) => event.preventDefault());
    createButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      createMissingFootnoteDefinition(view, options.id);
      removeFootnoteTooltip(footnote);
    });
    tooltip.append(createButton);
  }

  tooltip.addEventListener("mouseenter", () => {
    const mounted = footnoteTooltipMounts.get(footnote);
    if (!mounted) return;
    if (mounted.hideTimer !== null) window.clearTimeout(mounted.hideTimer);
    mounted.hideTimer = null;
  });
  tooltip.addEventListener("mouseleave", () => scheduleFootnoteTooltipHide(footnote));
  tooltip.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    event.preventDefault();
    emit("openLinkHref", anchor.getAttribute("href") ?? "");
  });

  document.body.append(tooltip);
  footnote.setAttribute("aria-describedby", tooltip.id);
  footnoteTooltipMounts.set(footnote, { tooltip, hideTimer: null });
  positionFootnoteTooltip(footnote, tooltip);
}

function positionFootnoteTooltip(footnote: HTMLElement, tooltip: HTMLElement) {
  const rect = footnote.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - tooltip.offsetWidth - margin);
  const left = Math.min(maxLeft, Math.max(margin, rect.left));
  const below = rect.bottom + 7;
  const above = rect.top - tooltip.offsetHeight - 7;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${below + tooltip.offsetHeight > window.innerHeight && above >= margin ? above : below}px`;
}

function scheduleFootnoteTooltipHide(footnote: HTMLElement) {
  const mounted = footnoteTooltipMounts.get(footnote);
  if (!mounted) return;
  if (mounted.hideTimer !== null) window.clearTimeout(mounted.hideTimer);
  mounted.hideTimer = window.setTimeout(() => removeFootnoteTooltip(footnote), 120);
}

function removeFootnoteTooltip(footnote: HTMLElement) {
  const mounted = footnoteTooltipMounts.get(footnote);
  if (!mounted) return;
  if (mounted.hideTimer !== null) window.clearTimeout(mounted.hideTimer);
  mounted.tooltip.remove();
  footnote.removeAttribute("aria-describedby");
  footnoteTooltipMounts.delete(footnote);
}

function createMissingFootnoteDefinition(view: EditorView, id: string) {
  const edit = createMissingFootnoteDefinitionEdit(view.state.doc.toString(), id);
  if (!edit) return;
  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: { anchor: edit.cursor },
    effects: EditorView.scrollIntoView(edit.cursor, { y: "center" }),
    annotations: isolateHistory.of("full"),
  });
  queueMicrotask(() => view.focus());
}

class FootnoteBacklinksWidget extends WidgetType {
  constructor(
    private readonly id: string,
    private readonly references: FootnoteReferenceLocation[],
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof FootnoteBacklinksWidget
      && other.id === this.id
      && sameFootnoteReferences(other.references, this.references);
  }

  toDOM(view: EditorView): HTMLElement {
    return createFootnoteBacklinksElement(view, this.id, this.references);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function sameFootnoteReferences(
  left: readonly FootnoteReferenceLocation[],
  right: readonly FootnoteReferenceLocation[],
): boolean {
  return left.length === right.length
    && left.every((reference, index) => {
      const current = right[index];
      return current?.from === reference.from
        && current.to === reference.to
        && current.occurrence === reference.occurrence;
    });
}

function createFootnoteBacklinksElement(
  view: EditorView,
  id: string,
  references: readonly FootnoteReferenceLocation[],
): HTMLElement {
  const backlinks = document.createElement("span");
  backlinks.className = "cm-footnote-backlinks";
  backlinks.dataset.footnoteId = id;
  backlinks.setAttribute("contenteditable", "false");
  for (const reference of references) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-footnote-backlink";
    button.textContent = "\u21a9";
    button.tabIndex = -1;
    button.setAttribute(
      "aria-label",
      `\u8fd4\u56de\u811a\u6ce8\u5f15\u7528 ${reference.occurrence}`,
    );
    button.addEventListener("mousedown", (event) => {
      if (event.button === 0) resetPointerGestureTracking();
      event.preventDefault();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      revealPreviewBlock(view, reference.from);
    });
    backlinks.append(button);
  }
  return backlinks;
}

class RenderedAlertTitleWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly kind: string,
    private readonly kindFrom: number,
    private readonly kindTo: number,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof RenderedAlertTitleWidget
      && other.kind === this.kind
      && other.kindFrom === this.kindFrom
      && other.kindTo === this.kindTo
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("span");
    root.className = `cm-rendered-alert-title cm-rendered-alert-title-${this.kind}`;
    root.setAttribute("contenteditable", "false");
    const presentation = getMarkdownAlertPresentation(this.kind);
    if (!presentation) {
      root.textContent = this.kind.toUpperCase();
      return root;
    }

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("cm-rendered-alert-icon");
    icon.setAttribute("viewBox", "0 0 16 16");
    icon.setAttribute("width", "16");
    icon.setAttribute("height", "16");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", presentation.iconPath);
    icon.append(path);

    const label = document.createElement("span");
    label.className = "cm-rendered-alert-label";
    label.textContent = presentation.label;
    root.append(icon, label);

    if (!this.isReadonly) {
      root.setAttribute("role", "button");
      root.setAttribute("aria-label", `\u7f16\u8f91 ${presentation.label} \u63d0\u793a\u7c7b\u578b`);
      root.tabIndex = -1;
      root.addEventListener("mousedown", (event) => {
        if (event.button === 0) resetPointerGestureTracking();
        event.preventDefault();
        event.stopPropagation();
      });
      root.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        queueMicrotask(() => {
          if (editorView.value !== view) return;
          revealPreviewRange(view, this.kindFrom, this.kindTo);
        });
      });
    }
    return root;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class RenderedListThematicBreakWidget extends WidgetType {
  eq(other: WidgetType): boolean {
    return other instanceof RenderedListThematicBreakWidget;
  }

  toDOM(): HTMLElement {
    const separator = document.createElement("span");
    separator.className = "cm-rendered-list-thematic-break";
    separator.setAttribute("contenteditable", "false");
    separator.setAttribute("role", "separator");
    separator.setAttribute("aria-label", "分隔线");
    return separator;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class RenderedListMarkerWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly text: string,
    private readonly kind: "bullet" | "ordered" | "task",
    private readonly depth: number,
    private readonly checked: boolean | null,
    private readonly checkboxFrom: number | null,
    private readonly contentFrom: number,
    private readonly overlapPrevious: boolean,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof RenderedListMarkerWidget
      && other.text === this.text
      && other.kind === this.kind
      && other.depth === this.depth
      && other.checked === this.checked
      && other.checkboxFrom === this.checkboxFrom
      && other.contentFrom === this.contentFrom
      && other.overlapPrevious === this.overlapPrevious
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const marker = document.createElement("span");
    marker.className = `cm-rendered-list-marker cm-rendered-${this.kind}-marker`;
    if (this.kind === "bullet") {
      marker.dataset.listDepth = this.text === "◦" ? "1" : this.text === "▪" ? "2" : "0";
    }
    marker.style.setProperty("--list-marker-offset", `${this.depth * 1.875}rem`);
    marker.style.setProperty("--list-marker-width", `${(this.depth + 1) * 1.875}rem`);
    if (this.overlapPrevious) {
      marker.style.marginInlineStart = `-${this.depth * 1.875}rem`;
    }
    if (this.kind === "task") {

      marker.addEventListener("mousedown", (event) => {
        if (this.isReadonly || event.button !== 0) return;
        resetPointerGestureTracking();
        event.preventDefault();
        event.stopPropagation();
        const contentFrom = clampOffset(this.contentFrom, view.state.doc.length);
        const anchor = event.shiftKey
          ? view.state.selection.main.anchor
          : contentFrom;
        view.dispatch({
          selection: { anchor, head: contentFrom },
          effects: EditorView.scrollIntoView(contentFrom),
        });
        queueMicrotask(() => view.focus());
      });
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(this.checked);
      checkbox.disabled = this.isReadonly;
      checkbox.setAttribute("aria-label", checkbox.checked ? "标记任务为未完成" : "标记任务为已完成");
      checkbox.addEventListener("mousedown", (event) => {
        if (!this.isReadonly && event.button === 0) resetPointerGestureTracking();
        event.stopPropagation();
      });
      checkbox.addEventListener("change", () => {
        if (this.isReadonly || this.checkboxFrom === null) return;
        view.dispatch({
          changes: {
            from: this.checkboxFrom,
            to: this.checkboxFrom + 1,
            insert: checkbox.checked ? "x" : " ",
          },
        });
        view.focus();
      });
      marker.append(checkbox);
    } else {
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = this.text;
      marker.addEventListener("mousedown", (event) => {
        if (this.isReadonly || event.button !== 0) return;
        resetPointerGestureTracking();
        event.preventDefault();
        event.stopPropagation();
        const contentFrom = clampOffset(this.contentFrom, view.state.doc.length);
        const anchor = event.shiftKey
          ? view.state.selection.main.anchor
          : contentFrom;
        view.dispatch({
          selection: { anchor, head: contentFrom },
          effects: EditorView.scrollIntoView(contentFrom),
        });
        queueMicrotask(() => view.focus());
      });
    }
    return marker;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class VisualTableBlockWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly block: ContinuousPreviewBlock,
    private readonly documentSource: string,
    private readonly spacing: PreviewWidgetSpacing,
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
      && other.settings === this.settings
      && other.spacing.collapseBefore === this.spacing.collapseBefore
      && other.spacing.collapseAfter === this.spacing.collapseAfter
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-visual-table-widget";
    applyPreviewWidgetSpacing(root, this.spacing);
    applyPreviewContainerPresentation(root, this.block);
    const state = reactive<TableWidgetState>({
      source: this.block.source,
      documentSource: this.documentSource,
      from: this.block.from,
      to: this.block.to,
      filePath: this.filePath,
      outline: this.outline,
      settings: this.settings,
      readonly: this.isReadonly,
    });
    const mounted: TableWidgetMount = {
      app: null as unknown as VueApplication,
      state,
      handle: null,
      lastInputGroup: null,
      joinExitToLastUpdate: false,
    };
    const rootComponent = defineComponent({
      render: () => h(VisualTableEditor, {
        ref: (handle: unknown) => {
          mounted.handle = handle as VisualTableEditorHandle | null;
        },
        source: state.source,
        documentSource: state.documentSource,
        filePath: state.filePath,
        sourceOffset: state.from,
        outline: state.outline,
        settings: state.settings,
        readonly: state.readonly,
        onUpdate: (
          value: string,
          history: "input" | "command",
          inputGroup?: string,
          userEvent?: "input.type.compose.start" | "input.type.compose",
        ) => {
          mounted.joinExitToLastUpdate = true;
          queueMicrotask(() => {
            mounted.joinExitToLastUpdate = false;
          });
          replaceTableWidgetSource(view, state, value, history, inputGroup, userEvent, mounted);
        },
        onDelete: () => replaceTableWidgetSource(
          view,
          state,
          "",
          "command",
          undefined,
          undefined,
          mounted,
        ),
        onExitDown: (sourceLength: number) => {
          moveAfterTableWidget(view, state, sourceLength, mounted);
        },
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
        onSelection: (
          selectedText: string,
          selectionStart: number,
          selectionEnd: number,
          selectionHead: number,
        ) => {
          const documentSource = view.state.doc.toString();
          const absoluteStart = clampOffset(state.from + selectionStart, documentSource.length);
          const absoluteEnd = clampOffset(state.from + selectionEnd, documentSource.length);
          const absoluteHead = clampOffset(state.from + selectionHead, documentSource.length);
          emit("selection", calculateSelectionStats(
            selectedText,
            documentSource,
            absoluteHead,
            absoluteStart,
            absoluteEnd,
          ));
        },
        onOpenLink: (href: string) => emit("openLinkHref", href),
      }),
    });
    tableWidgetRoots.add(root);
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
    mounted.state.readonly = this.isReadonly;
    void nextTick(() => view.requestMeasure());
    return true;
  }

  destroy(dom: HTMLElement) {
    const mounted = tableWidgetMounts.get(dom);
    tableWidgetRoots.delete(dom);
    if (!mounted) return;
    if (activeTableEditor === mounted.handle) activeTableEditor = null;
    disconnectWidgetSizeObserver(dom);
    tableWidgetMounts.delete(dom);
    mounted.app.unmount();
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class DiagramBlockWidget extends WidgetType {
  private readonly isReadonly = props.readonly;
  constructor(
    private readonly block: ContinuousPreviewBlock,
    private readonly documentSource: string,
    private readonly spacing: PreviewWidgetSpacing,
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
      && other.settings === this.settings
      && other.spacing.collapseBefore === this.spacing.collapseBefore
      && other.spacing.collapseAfter === this.spacing.collapseAfter
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-special-preview cm-special-preview-diagram";
    applyPreviewWidgetSpacing(root, this.spacing);
    applyPreviewContainerPresentation(root, this.block, false);
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
      readonly: this.isReadonly,
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
        readonly: state.readonly,
        onReplaceSource: (value: string) => replaceDiagramWidgetSource(view, state, value),
        onSelection: (selection: { selectionStart: number; selectionEnd: number }) => {
          const documentSource = view.state.doc.toString();
          const absoluteStart = clampOffset(state.from + selection.selectionStart, documentSource.length);
          const absoluteEnd = clampOffset(state.from + selection.selectionEnd, documentSource.length);
          emit("selection", calculateSelectionStats(
            documentSource.slice(absoluteStart, absoluteEnd),
            documentSource,
            absoluteEnd,
            absoluteStart,
            absoluteEnd,
          ));
        },
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
    mounted.state.readonly = this.isReadonly;
    void nextTick(() => view.requestMeasure());
    return true;
  }

  destroy(dom: HTMLElement) {
    const mounted = diagramWidgetMounts.get(dom);
    if (!mounted) return;
    disconnectWidgetSizeObserver(dom);
    diagramWidgetMounts.delete(dom);
    diagramWidgetDestroyDepth += 1;
    try {
      mounted.app.unmount();
    } finally {
      diagramWidgetDestroyDepth -= 1;
    }
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function replaceDiagramWidgetSource(view: EditorView, state: DiagramWidgetState, value: string) {
  const expectedSource = state.source;
  if (diagramWidgetDestroyDepth > 0) {
    queueMicrotask(() => {
      if (editorView.value !== view) return;
      applyDiagramWidgetSourceReplacement(view, state, value, expectedSource);
    });
    return;
  }

  applyDiagramWidgetSourceReplacement(view, state, value, expectedSource);
}

function applyDiagramWidgetSourceReplacement(
  view: EditorView,
  state: DiagramWidgetState,
  value: string,
  expectedSource: string,
) {
  const range = findDiagramWidgetSourceRange(view, state, value, expectedSource);
  if (!range) return;
  if (view.state.sliceDoc(range.from, range.to) === value) {
    state.source = value;
    return;
  }
  state.source = value;
  view.dispatch({ changes: { from: range.from, to: range.to, insert: value } });
}

function findDiagramWidgetSourceRange(
  view: EditorView,
  state: DiagramWidgetState,
  value: string,
  expectedSource: string,
): { from: number; to: number } | null {
  const from = clampOffset(state.from, view.state.doc.length);
  const to = clampOffset(state.to, view.state.doc.length);
  const currentSource = view.state.sliceDoc(from, to);
  if (currentSource === expectedSource || currentSource === value) return { from, to };
  if (!expectedSource) return null;

  const documentSource = view.state.doc.toString();
  const relocatedFrom = documentSource.indexOf(expectedSource);
  if (
    relocatedFrom < 0
    || documentSource.indexOf(expectedSource, relocatedFrom + 1) >= 0
  ) {
    return null;
  }
  return { from: relocatedFrom, to: relocatedFrom + expectedSource.length };
}

function replaceTableWidgetSource(
  view: EditorView,
  state: TableWidgetState,
  value: string,
  history: "input" | "command",
  inputGroup: string | undefined,
  userEvent: "input.type.compose.start" | "input.type.compose" | undefined,
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
    annotations: [
      ...(shouldIsolate
        ? [isolateHistory.of(history === "command" ? "full" : "before")]
        : []),
      ...(userEvent ? [Transaction.userEvent.of(userEvent)] : []),
    ],
  });
}

function moveAfterTableWidget(
  view: EditorView,
  state: TableWidgetState,
  sourceLength: number,
  mounted: TableWidgetMount,
) {
  mounted.lastInputGroup = null;
  const joinLastUpdate = mounted.joinExitToLastUpdate;
  mounted.joinExitToLastUpdate = false;
  if (activeTableEditor === mounted.handle) activeTableEditor = null;
  const source = view.state.doc.toString();
  const tableEnd = clampOffset(state.from + sourceLength, source.length);
  const followingSource = source.slice(tableEnd);
  const nextContentOffset = followingSource.search(/[^\r\n]/);
  if (nextContentOffset >= 0) {
    const target = tableEnd + nextContentOffset;
    view.dispatch({
      selection: { anchor: target },
      effects: EditorView.scrollIntoView(target, { y: "center" }),
    });
    restoreEditorFocus(view);
    return;
  }

  const tableSource = source.slice(clampOffset(state.from, tableEnd), tableEnd);
  const tableTrailingBreaks = tableSource.match(/(?:\r\n|\r|\n)+$/)?.[0] ?? "";
  const existingBreaks = (tableTrailingBreaks.match(/\r\n|\r|\n/g)?.length ?? 0)
    + (followingSource.match(/\r\n|\r|\n/g)?.length ?? 0);
  const insertion = view.state.lineBreak.repeat(Math.max(0, 2 - existingBreaks));
  const target = source.length + insertion.length;
  if (insertion) {
    view.dispatch({
      changes: { from: source.length, insert: insertion },
      selection: { anchor: target },
      effects: EditorView.scrollIntoView(target, { y: "center" }),
      annotations: joinLastUpdate
        ? Transaction.userEvent.of("input.type.compose")
        : isolateHistory.of("full"),
    });
  } else {
    view.dispatch({
      selection: { anchor: target },
      effects: EditorView.scrollIntoView(target, { y: "center" }),
    });
  }
  restoreEditorFocus(view);
}

class ActiveCodeLanguageWidget extends WidgetType {
  constructor(
    private readonly source: string,
    private readonly from: number,
    private readonly quoteDepth = 0,
    private readonly listDepth: number | null = null,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof ActiveCodeLanguageWidget
      && other.source === this.source
      && other.from === this.from
      && other.quoteDepth === this.quoteDepth
      && other.listDepth === this.listDepth;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-active-code-language-widget";
    applyPreviewContainerPresentation(root, {
      quoteDepth: this.quoteDepth,
      listDepth: this.listDepth,
    }, false);
    mountCodeFenceLanguageSelector(
      root,
      view,
      this.source,
      this.from,
      this.listDepth,
    );
    return root;
  }

  destroy(dom: HTMLElement) {
    const languageMount = codeLanguageWidgetMounts.get(dom);
    if (!languageMount) return;
    codeLanguageWidgetMounts.delete(dom);
    languageMount.unmount();
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class ActiveMathPreviewWidget extends WidgetType {
  constructor(
    private readonly html: string,
    private readonly quoteDepth = 0,
    private readonly listDepth: number | null = null,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof ActiveMathPreviewWidget
      && other.html === this.html
      && other.quoteDepth === this.quoteDepth
      && other.listDepth === this.listDepth;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = "cm-special-preview cm-active-math-preview md-mathjax-preview";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "\u6570\u5b66\u516c\u5f0f\u5b9e\u65f6\u9884\u89c8");
    applyPreviewContainerPresentation(root, {
      quoteDepth: this.quoteDepth,
      listDepth: this.listDepth,
    }, false);
    root.innerHTML = sanitizeMarkdownHtml(this.html);
    observeWidgetSize(root, view);
    return root;
  }

  destroy(dom: HTMLElement) {
    disconnectWidgetSizeObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class RenderedMarkdownBlockWidget extends WidgetType {
  constructor(
    private readonly html: string,
    private readonly source: string,
    private readonly documentSource: string,
    private readonly from: number,
    private readonly to: number,
    private readonly kind: ContinuousPreviewBlockKind,
    private readonly quoteDepth = 0,
    private readonly listDepth: number | null = null,
    private readonly spacing: PreviewWidgetSpacing = {
      collapseBefore: false,
      collapseAfter: false,
    },
    private readonly isReadonly = props.readonly,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof RenderedMarkdownBlockWidget
      && other.html === this.html
      && other.source === this.source
      && other.documentSource === this.documentSource
      && other.from === this.from
      && other.to === this.to
      && other.kind === this.kind
      && other.quoteDepth === this.quoteDepth
      && other.listDepth === this.listDepth
      && other.spacing.collapseBefore === this.spacing.collapseBefore
      && other.spacing.collapseAfter === this.spacing.collapseAfter
      && other.isReadonly === this.isReadonly;
  }

  toDOM(view: EditorView): HTMLElement {
    const root = document.createElement("div");
    root.className = `cm-special-preview cm-special-preview-${this.kind}`;
    applyPreviewWidgetSpacing(root, this.spacing);
    applyPreviewContainerPresentation(root, {
      quoteDepth: this.quoteDepth,
      listDepth: this.listDepth,
    }, false);
    syncRenderedMarkdownBlockInteraction(root, this.kind, this.isReadonly);
    const sanitizedHtml = sanitizeMarkdownHtml(this.html);
    if (this.kind === "html" && !sanitizedHtml.trim()) {
      const source = document.createElement("pre");
      source.className = "md-raw-html-src-content";
      source.textContent = this.source;
      root.append(source);
    } else {
      root.innerHTML = sanitizedHtml;
    }
    if (this.kind === "html") {
      unwrapSyntheticHtmlVideoParagraph(root);
      applyHtmlWidgetSpacingOwnership(root);
    }
    if (this.kind === "image" && !root.querySelector("img") && isMissingReferenceImageSource(this.source)) {
      root.classList.add("marko-image-reference-missing");
      root.dataset.markoImageState = "missing-reference";
      root.setAttribute("aria-invalid", "true");
      root.setAttribute("title", "\u672a\u627e\u5230\u56fe\u7247\u5f15\u7528\u5b9a\u4e49");
    }
    if (this.kind === "toc") {
      root.dataset.atomicFrom = String(this.from);
      root.dataset.atomicKind = "toc";
      if (!this.isReadonly) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "cm-delete-toc";
        deleteButton.textContent = "\u00d7";
        deleteButton.title = "\u5220\u9664\u76ee\u5f55";
        deleteButton.setAttribute("aria-label", "\u5220\u9664\u76ee\u5f55");
        deleteButton.addEventListener("mousedown", (event) => {
          if (event.button === 0) resetPointerGestureTracking();
          event.preventDefault();
          event.stopPropagation();
        });
        deleteButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const block = findAtomicMarkdownBlockAt(view.state.doc.toString(), this.from);
          if (block) deleteAtomicMarkdownBlock(view, block);
        });
        root.append(deleteButton);
      }
    }
    const nestedFocusSelector = this.kind === "html" ? "a" : "a, button, input, textarea, select";
    root.querySelectorAll<HTMLElement>(nestedFocusSelector).forEach((element) => {
      if (element.closest(".code-fence-language-selector")) return;
      element.tabIndex = -1;
    });
    let renderedPointerHandled = false;
    root.addEventListener("mousedown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (this.kind === "html" && isNativeInteractiveHtmlTarget(target)) {
        event.stopPropagation();
        return;
      }
      if (target?.closest("a[href]") && shouldOpenPreviewLink(event)) {
        event.stopPropagation();
        return;
      }
      if (this.isReadonly) return;
      if (this.kind === "code" || this.kind === "html" || this.kind === "definition") {
        renderedPointerHandled = event.button === 0;
        beginRenderedMarkdownPointerSelection(
          view,
          root,
          this.from,
          this.source,
          this.kind,
          event,
        );
        return;
      }
      event.preventDefault();
    });
    root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (anchor && (this.kind === "toc" || this.isReadonly || shouldOpenPreviewLink(event))) {
        event.preventDefault();
        event.stopPropagation();
        emit("openLinkHref", anchor.getAttribute("href") ?? "");
        return;
      }
      const htmlImage = this.kind === "html"
        ? target?.closest<HTMLImageElement>("img")
          ?? getImageFromErrorFallback(target)
        : null;
      if (htmlImage && !this.isReadonly) {
        event.preventDefault();
        event.stopPropagation();
        revealPreviewRange(view, this.from, this.to);
        return;
      }
      if (this.kind === "html" && isNativeInteractiveHtmlTarget(target)) {
        event.stopPropagation();
        return;
      }
      if (this.isReadonly) return;
      event.preventDefault();
      event.stopPropagation();
      if (this.kind === "image" && !this.isReadonly) {
        if (event.detail > 1) return;
        recentImageClicks.set(view, {
          document: view.state.doc,
          from: this.from,
          to: this.to,
        });
        revealInlineImageAlt(view, this.from, this.source);
        return;
      }
      if (this.kind === "toc" && !this.isReadonly) {
        const block = findAtomicMarkdownBlockAt(view.state.doc.toString(), this.from);
        if (block) {
          focusAtomicMarkdownBlock(view, block, root);
          return;
        }
      }
      if (this.isReadonly) return;
      if (renderedPointerHandled) {
        renderedPointerHandled = false;
        return;
      }
      revealRenderedMarkdownSource(
        view,
        root,
        this.from,
        this.source,
        this.kind,
        event,
      );
    });
    root.addEventListener("dblclick", (event) => {
      if (this.kind !== "image" || this.isReadonly) return;
      recentImageClicks.delete(view);
      event.preventDefault();
      event.stopPropagation();
      revealPreviewRange(view, this.from, this.to);
    });
    root.addEventListener("keydown", (event) => {
      if (this.isReadonly) return;
      if (this.kind === "toc") {
        const block = findAtomicMarkdownBlockAt(view.state.doc.toString(), this.from);
        if (!block) return;
        if (!focusedAtomicBlock || focusedAtomicBlock.dom !== root) {
          focusAtomicMarkdownBlock(view, block, root);
        }
        if (handleFocusedAtomicBlockKeydown(event, view)) return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      revealPreviewBlock(view, this.from);
    });
    renderedMarkdownWidgetRoots.set(root, {
      kind: this.kind,
      from: this.from,
      to: this.to,
      source: this.source,
    });
    observeWidgetSize(root, view);
    if (this.kind === "image" || this.kind === "html") {
      prepareRenderedImages(root, this.source, () => view.requestMeasure(), this.documentSource);
    }
    return root;
  }

  destroy(dom: HTMLElement) {
    const languageMount = codeLanguageWidgetMounts.get(dom);
    if (languageMount) {
      codeLanguageWidgetMounts.delete(dom);
      languageMount.unmount();
    }
    if (focusedAtomicBlock?.dom === dom) clearFocusedAtomicBlock();
    renderedMarkdownWidgetRoots.delete(dom);
    disconnectWidgetSizeObserver(dom);
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function mountCodeFenceLanguageSelector(
  root: HTMLElement,
  view: EditorView,
  source: string,
  blockFrom: number,
  listDepth: number | null,
) {
  const info = getCodeFenceInfoString(source);
  if (!info || (listDepth === null && info.indentWidth > 3)) return;

  const mountPoint = document.createElement("div");
  mountPoint.className = "cm-code-language-mount";
  root.append(mountPoint);
  const app = createApp(CodeFenceLanguageSelector, {
    value: info.value,
    sourceOffset: blockFrom,
    onSelect: (value: string) => replaceCodeFenceLanguage(view, blockFrom, info, value),
  });
  codeLanguageWidgetMounts.set(root, app);
  app.mount(mountPoint);
}

function replaceCodeFenceLanguage(
  view: EditorView,
  blockFrom: number,
  info: CodeFenceInfoString,
  value: string,
) {
  if (props.readonly) return;
  const normalized = normalizeCodeFenceInfoString(value, info.marker);
  lastCodeLanguage.value = normalized;
  const from = blockFrom + info.from;
  const to = blockFrom + info.to;
  if (view.state.doc.sliceString(from, to) === normalized) {
    restoreEditorFocus(view);
    return;
  }
  view.dispatch({
    changes: { from, to, insert: normalized },
    annotations: [
      Transaction.userEvent.of("input"),
      isolateHistory.of("full"),
    ],
  });
  restoreEditorFocus(view);
}

function syncRenderedMarkdownBlockInteraction(
  root: HTMLElement,
  kind: ContinuousPreviewBlockKind,
  readonly: boolean,
) {
  root.setAttribute("role", readonly ? "region" : kind === "toc" ? "group" : "button");
  root.setAttribute(
    "aria-label",
    readonly || kind === "toc"
      ? getPreviewBlockLabel(kind)
      : `${getPreviewBlockLabel(kind)}，按回车编辑源码`,
  );
  root.tabIndex = -1;
}

function focusAtomicMarkdownBlock(
  _view: EditorView,
  block: AtomicMarkdownBlockRange,
  dom: HTMLElement,
) {
  clearFocusedAtomicBlock();
  focusedAtomicBlock = { block, dom };
  dom.classList.add("cm-atomic-block-selected");
  dom.setAttribute("aria-selected", "true");
  dom.tabIndex = -1;
  dom.focus({ preventScroll: true });
}

function clearFocusedAtomicBlock() {
  if (!focusedAtomicBlock) return;
  focusedAtomicBlock.dom.classList.remove("cm-atomic-block-selected");
  focusedAtomicBlock.dom.removeAttribute("aria-selected");
  focusedAtomicBlock = null;
}

function handleFocusedAtomicBlockKeydown(
  event: KeyboardEvent,
  view: EditorView,
): boolean {
  const focused = focusedAtomicBlock;
  if (!focused) return false;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    event.stopPropagation();
    deleteAtomicMarkdownBlock(view, focused.block);
    return true;
  }
  const direction = event.key === "ArrowUp" || event.key === "ArrowLeft"
    ? "backward"
    : event.key === "ArrowDown" || event.key === "ArrowRight"
      ? "forward"
      : null;
  if (!direction) return false;
  event.preventDefault();
  event.stopPropagation();
  const target = getAtomicBlockExitOffset(
    view.state.doc.toString(),
    focused.block,
    direction,
  );
  clearFocusedAtomicBlock();
  view.dispatch({
    selection: { anchor: target },
    effects: EditorView.scrollIntoView(target, { y: "center" }),
  });
  queueMicrotask(() => view.focus());
  return true;
}

function deleteAtomicMarkdownBlock(
  view: EditorView,
  block: AtomicMarkdownBlockRange,
) {
  const result = deleteSelectedAtomicMarkdownBlock({
    value: view.state.doc.toString(),
    selectionStart: block.contentFrom,
    selectionEnd: block.contentTo,
  });
  clearFocusedAtomicBlock();
  if (!result) return;
  dispatchTextEdit(result, view);
  queueMicrotask(() => view.focus());
}

function getAtomicBlockExitOffset(
  source: string,
  block: AtomicMarkdownBlockRange,
  direction: "backward" | "forward",
): number {
  let target = direction === "backward" ? block.from : block.to;
  if (direction === "backward") {
    while (target > 0 && /[ \t\r\n]/.test(source[target - 1] ?? "")) target -= 1;
  } else {
    while (target < source.length && /[ \t\r\n]/.test(source[target] ?? "")) target += 1;
  }
  return target;
}

function getAtomicMarkdownBlockDom(
  view: EditorView,
  block: AtomicMarkdownBlockRange,
): HTMLElement | null {
  if (block.kind === "toc") {
    return view.dom.querySelector<HTMLElement>(
      `[data-atomic-kind="toc"][data-atomic-from="${block.contentFrom}"]`,
    );
  }
  const location = view.domAtPos(block.contentFrom);
  const element = location.node instanceof HTMLElement
    ? location.node
    : location.node.parentElement;
  return element?.closest<HTMLElement>(".cm-horizontal-rule") ?? null;
}

function revealRenderedMarkdownSource(
  view: EditorView,
  root: HTMLElement,
  blockFrom: number,
  source: string,
  kind: ContinuousPreviewBlockKind,
  event: MouseEvent,
) {
  const sourceOffset = getRenderedMarkdownSourceOffset(root, source, kind, event);
  revealPreviewBlock(view, blockFrom + sourceOffset);
}

function beginRenderedMarkdownPointerSelection(
  view: EditorView,
  root: HTMLElement,
  blockFrom: number,
  source: string,
  kind: ContinuousPreviewBlockKind,
  event: MouseEvent,
) {
  if (event.button !== 0) return;
  resetPointerGestureTracking();
  if (props.readonly) return;
  const sourceOffset = getRenderedMarkdownSourceOffset(root, source, kind, event);
  const position = blockFrom + sourceOffset;
  const resolvePointerPosition = createRenderedMarkdownPointerResolver(
    view,
    root,
    blockFrom,
    blockFrom + source.length,
  );
  if (selectOrRememberRenderedWord(
    view,
    event,
    position,
    blockFrom,
    blockFrom + source.length,
    (pointerEvent) => resolvePointerPosition(
      pointerEvent.clientX,
      pointerEvent.clientY,
      pointerEvent.target,
    ),
  )) {
    return;
  }
  beginRenderedTextPointerSelection(view, event, position, resolvePointerPosition);
}

function getRenderedMarkdownSourceOffset(
  root: HTMLElement,
  source: string,
  kind: ContinuousPreviewBlockKind,
  event: MouseEvent,
): number {
  const target = event.target instanceof Element ? event.target : null;
  const textRoot = kind === "code"
    ? target?.closest<HTMLElement>("pre code")
      ?? root.querySelector<HTMLElement>("pre code")
      ?? root
    : root;
  const renderedText = textRoot.textContent ?? "";
  const renderedOffset = getPointerRenderedTextOffset(textRoot, event);
  const boundaries = getRenderedMarkdownSourceBoundaries(source, renderedText, kind);
  return boundaries[renderedOffset] ?? boundaries.at(-1) ?? source.length;
}

function getRenderedMarkdownSourceBoundaries(
  source: string,
  renderedText: string,
  kind: ContinuousPreviewBlockKind,
): number[] {
  if (kind === "code" || kind === "math" || kind === "html") {
    const raw = getRawBlockSelection({
      value: source,
      selectionStart: 0,
      selectionEnd: 0,
    });
    if (raw && (raw.kind === kind || (kind === "math" && raw.kind === "code"))) {
      const contentBoundaries = mapRenderedTextBoundariesToSource(
        raw.content,
        renderedText,
        kind === "html" ? "html" : "markdown",
        props.settings.extensions.emoji,
      );
      const sourceContentFrom = source.lastIndexOf(
        raw.sourceContent,
        Math.max(0, raw.contentStart),
      );
      if (sourceContentFrom >= 0) {
        return contentBoundaries.map((contentOffset) => (
          sourceContentFrom + mapUnwrappedTextOffsetToSource(
            raw.sourceContent,
            raw.content,
            contentOffset,
          )
        ));
      }
    }
  }

  return mapRenderedTextBoundariesToSource(
    source,
    renderedText,
    kind === "html" ? "html" : "markdown",
    props.settings.extensions.emoji,
  );
}

function beginStructuredDefinitionFieldPointerSelection(
  view: EditorView,
  root: HTMLElement,
  sourceFrom: number,
  sourceTo: number,
  event: MouseEvent,
) {
  if (event.button !== 0) return;
  resetPointerGestureTracking();
  if (props.readonly) return;

  const fieldFrom = clampOffset(sourceFrom, view.state.doc.length);
  const fieldTo = Math.max(fieldFrom, clampOffset(sourceTo, view.state.doc.length));
  const source = root.dataset.markdownSource ?? view.state.doc.sliceString(fieldFrom, fieldTo);
  const syntax = (root.dataset.markdownSyntax ?? "markdown-visible") as RenderedSourceSyntax;
  const renderedText = root.textContent === "\u200b" ? "" : root.textContent ?? "";
  const resolvePointerPosition = createRenderedPointerResolver(view, root, "root");
  const fallbackOffset = renderedText
    ? mapRenderedTextOffsetToSource(
      source,
      renderedText,
      getPointerRenderedTextOffset(root, event),
      syntax,
      props.settings.extensions.emoji,
    )
    : 0;
  const fallbackPosition = Math.max(
    fieldFrom,
    Math.min(fieldTo, fieldFrom + fallbackOffset),
  );
  const resolvedPosition = resolvePointerPosition?.(event.clientX, event.clientY);
  const position = resolvedPosition === null || resolvedPosition === undefined
    ? fallbackPosition
    : Math.max(fieldFrom, Math.min(fieldTo, resolvedPosition));
  const resolveFieldPointerPosition = (pointerEvent: MouseEvent) => {
    const resolved = resolvePointerPosition?.(
      pointerEvent.clientX,
      pointerEvent.clientY,
    );
    return resolved === null || resolved === undefined
      ? position
      : Math.max(fieldFrom, Math.min(fieldTo, resolved));
  };

  if (selectOrRememberRenderedWord(
    view,
    event,
    position,
    fieldFrom,
    fieldTo,
    resolveFieldPointerPosition,
  )) {
    return;
  }
  beginRenderedTextPointerSelection(
    view,
    event,
    position,
    (clientX, clientY) => {
      const resolved = resolvePointerPosition?.(clientX, clientY);
      return resolved === null || resolved === undefined
        ? position
        : Math.max(fieldFrom, Math.min(fieldTo, resolved));
    },
  );
}

function revealInlineRenderedTextSource(
  view: EditorView,
  root: HTMLElement,
  sourceFrom: number,
  source: string,
  syntax: RenderedSourceSyntax,
  event: MouseEvent,
) {
  const renderedText = root.textContent ?? "";
  const renderedOffset = getPointerRenderedTextOffset(root, event);
  const sourceOffset = mapRenderedTextOffsetToSource(
    source,
    renderedText,
    renderedOffset,
    syntax,
    props.settings.extensions.emoji,
  );
  revealPreviewBlock(view, sourceFrom + sourceOffset);
}

function beginInlineRenderedTextPointerSelection(
  view: EditorView,
  root: HTMLElement,
  sourceFrom: number,
  source: string,
  syntax: RenderedSourceSyntax,
  event: MouseEvent,
) {
  if (event.button !== 0) return;
  resetPointerGestureTracking();
  if (props.readonly) return;
  const renderedText = root.textContent ?? "";
  const resolvePointerPosition = createRenderedPointerResolver(view, root, "line");
  let position = root.classList.contains("cm-rendered-emoji")
    ? resolvePointerPosition?.(event.clientX, event.clientY) ?? null
    : null;
  if (position === null) {
    const renderedOffset = getPointerRenderedTextOffset(root, event);
    const sourceOffset = mapRenderedTextOffsetToSource(
      source,
      renderedText,
      renderedOffset,
      syntax,
      props.settings.extensions.emoji,
    );
    position = sourceFrom + sourceOffset;
  }
  if (selectOrRememberRenderedWord(
    view,
    event,
    position,
    sourceFrom,
    sourceFrom + source.length,
    (pointerEvent) => resolvePointerPosition?.(
      pointerEvent.clientX,
      pointerEvent.clientY,
    ) ?? null,
  )) {
    return;
  }
  beginRenderedTextPointerSelection(
    view,
    event,
    position,
    resolvePointerPosition,
  );
}

function selectOrRememberRenderedWord(
  view: EditorView,
  event: MouseEvent,
  position: number,
  sourceFrom: number,
  sourceTo: number,
  resolvePointerPosition?: (event: MouseEvent) => number | null,
): boolean {
  if (event.detail >= 3) {
    recentRenderedTextClicks.delete(view);
    pendingRenderedTextDoubleClicks.delete(view);
    beginRenderedLinePointerSelection(view, event, position);
    return true;
  }
  const word = view.state.wordAt(position);
  const visibleWord = word && word.from >= sourceFrom && word.to <= sourceTo
    ? word
    : null;
  if (event.detail === 2 && visibleWord) {
    recentRenderedTextClicks.delete(view);
    beginRenderedWordPointerSelection(
      view,
      event,
      visibleWord,
      resolvePointerPosition,
    );
    return true;
  }
  if (event.detail <= 1) {
    pendingRenderedTextDoubleClicks.delete(view);
    pendingRenderedTextTripleClicks.delete(view);
  }
  if (event.detail <= 1 && !event.shiftKey && visibleWord) {
    recentRenderedTextClicks.set(view, {
      document: view.state.doc,
      from: visibleWord.from,
      to: visibleWord.to,
      useCachedWordOnSecondPress: true,
    });
  } else if (event.detail <= 1) {
    recentRenderedTextClicks.delete(view);
  }
  return false;
}

function beginRenderedLinePointerSelection(
  view: EditorView,
  event: MouseEvent,
  position: number,
) {
  if (props.readonly || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const document = view.state.doc;
  const line = document.lineAt(clampOffset(position, document.length));
  const range = EditorSelection.range(line.from, line.to);
  const selection = event.shiftKey
    ? view.state.selection.replaceRange(
      view.state.selection.main.extend(range.from, range.to, range.assoc),
    )
    : EditorSelection.create([range]);
  pendingRenderedTextTripleClicks.set(view, { document, selection });
  view.dispatch({
    selection,
    effects: [
      EditorView.scrollIntoView(selection.main.head),
      setRenderedTripleClickSelection.of(selection),
    ],
    userEvent: "select.pointer",
  });
  if (!view.hasFocus) restoreEditorFocus(view);
}

function beginRenderedWordPointerSelection(
  view: EditorView,
  event: MouseEvent,
  startWord: { from: number; to: number },
  resolvePointerPosition?: (event: MouseEvent) => number | null,
) {
  if (props.readonly || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();

  const startSelection = view.state.selection;
  const gestureDocument = view.state.doc;
  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  let stopped = false;
  let handledPointerMove = false;

  const buildSelection = (word: { from: number; to: number }): EditorSelection => {
    let range = EditorSelection.range(word.from, word.to);
    if (
      !event.shiftKey
      && (word.from !== startWord.from || word.to !== startWord.to)
    ) {
      const from = Math.min(startWord.from, word.from);
      const to = Math.max(startWord.to, word.to);
      range = word.from < startWord.from
        ? EditorSelection.range(to, from, range.assoc)
        : EditorSelection.range(from, to, range.assoc);
    }
    if (event.shiftKey) {
      return startSelection.replaceRange(
        startSelection.main.extend(range.from, range.to, range.assoc),
      );
    }
    return EditorSelection.create([range]);
  };

  const commitSelection = (selection: EditorSelection) => {
    if (
      stopped
      || editorView.value !== view
      || view.state.doc !== gestureDocument
    ) return;
    pendingRenderedTextDoubleClicks.set(view, {
      document: gestureDocument,
      selection,
    });
    view.dispatch({
      selection,
      effects: EditorView.scrollIntoView(selection.main.head),
      userEvent: "select.pointer",
    });
  };

  const resolveWord = (pointerEvent: MouseEvent) => {
    const position = resolvePointerPosition?.(pointerEvent)
      ?? view.posAtCoords({
        x: pointerEvent.clientX,
        y: pointerEvent.clientY,
      });
    if (position === null) return null;
    const clamped = clampOffset(position, view.state.doc.length);
    return view.state.wordAt(clamped) ?? { from: clamped, to: clamped };
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    ownerDocument.removeEventListener("mousemove", handleMove, true);
    ownerDocument.removeEventListener("mouseup", handleUp, true);
    ownerWindow?.removeEventListener("blur", stop);
    if (stopPointerSelectionTracking === stop) {
      stopPointerSelectionTracking = null;
    }
  };

  const handleMove = (moveEvent: MouseEvent) => {
    if ((moveEvent.buttons & 1) === 0) {
      stop();
      return;
    }
    const word = resolveWord(moveEvent);
    if (!word) return;
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    handledPointerMove = true;
    commitSelection(buildSelection(word));
  };

  const handleUp = (upEvent: MouseEvent) => {
    const movedSinceMouseDown = handledPointerMove
      || upEvent.clientX !== event.clientX
      || upEvent.clientY !== event.clientY;
    if (movedSinceMouseDown) {
      const word = resolveWord(upEvent);
      if (word) {
        handledPointerMove = true;
        commitSelection(buildSelection(word));
      }
    }
    if (handledPointerMove) {
      upEvent.preventDefault();
      upEvent.stopPropagation();
    }
    stop();
  };

  stopPointerSelectionTracking?.();
  stopPointerSelectionTracking = stop;
  ownerDocument.addEventListener("mousemove", handleMove, true);
  ownerDocument.addEventListener("mouseup", handleUp, true);
  ownerWindow?.addEventListener("blur", stop);
  commitSelection(buildSelection(startWord));
  if (!view.hasFocus) restoreEditorFocus(view);
}

function beginRenderedTextPointerSelection(
  view: EditorView,
  event: MouseEvent,
  sourceAnchor: number,
  resolvePointerPosition?: (
    clientX: number,
    clientY: number,
    target: EventTarget | null,
  ) => number | null,
  initializeSelection = true,
  allowCoordinateFallback = true,
  deferPointerMoves = false,
) {
  if (props.readonly || event.button !== 0) return;
  if (initializeSelection) {
    event.preventDefault();
    event.stopPropagation();
  }

  const head = clampOffset(sourceAnchor, view.state.doc.length);
  const anchor = event.shiftKey
    ? view.state.selection.main.anchor
    : head;
  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const timerWindow = ownerWindow ?? window;
  const gestureDocument = view.state.doc;
  let stopped = false;
  let handledPointerMove = false;
  let pendingMoveTimer: number | null = null;
  let pendingMoveHead: number | null = null;

  const dispatchSelection = (selectionHead: number) => {
    if (
      stopped
      || editorView.value !== view
      || view.state.doc !== gestureDocument
    ) return;
    const nextHead = clampOffset(selectionHead, view.state.doc.length);
    const nextAnchor = clampOffset(anchor, view.state.doc.length);
    view.dispatch({
      selection: { anchor: nextAnchor, head: nextHead },
      effects: EditorView.scrollIntoView(nextHead),
    });
  };

  const clearPendingMove = () => {
    if (pendingMoveTimer !== null) timerWindow.clearTimeout(pendingMoveTimer);
    pendingMoveTimer = null;
    pendingMoveHead = null;
  };

  const flushPendingMove = () => {
    if (pendingMoveTimer !== null) timerWindow.clearTimeout(pendingMoveTimer);
    pendingMoveTimer = null;
    const nextHead = pendingMoveHead;
    pendingMoveHead = null;
    if (nextHead !== null) dispatchSelection(nextHead);
  };

  const stop = (flushMove = false) => {
    if (stopped) return;
    if (flushMove) flushPendingMove();
    else clearPendingMove();
    stopped = true;
    ownerDocument.removeEventListener("mousemove", handleMove, true);
    ownerDocument.removeEventListener("mouseup", handleUp, true);
    ownerWindow?.removeEventListener("blur", handleBlur);
    if (stopPointerSelectionTracking === stop) {
      stopPointerSelectionTracking = null;
    }
  };
  const resolvePointerHead = (pointerEvent: MouseEvent) => (
    resolvePointerPosition?.(
      pointerEvent.clientX,
      pointerEvent.clientY,
      pointerEvent.target,
    ) ?? (allowCoordinateFallback
      ? view.posAtCoords({
          x: pointerEvent.clientX,
          y: pointerEvent.clientY,
        })
      : null)
  );

  const handleMove = (moveEvent: MouseEvent) => {
    if ((moveEvent.buttons & 1) === 0) {
      stop(true);
      return;
    }
    const head = resolvePointerHead(moveEvent);
    if (head === null) return;
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    handledPointerMove = true;
    if (!deferPointerMoves) {
      dispatchSelection(head);
      return;
    }
    pendingMoveHead = head;
    if (pendingMoveTimer !== null) return;
    pendingMoveTimer = timerWindow.setTimeout(() => {
      pendingMoveTimer = null;
      const nextHead = pendingMoveHead;
      pendingMoveHead = null;
      if (nextHead !== null) dispatchSelection(nextHead);
    }, 0);
  };

  const handleUp = (upEvent: MouseEvent) => {
    const movedSinceMouseDown = handledPointerMove
      || upEvent.clientX !== event.clientX
      || upEvent.clientY !== event.clientY;
    const hasMouseUpCoordinates = upEvent.clientX !== 0 || upEvent.clientY !== 0;
    if (movedSinceMouseDown && (!handledPointerMove || hasMouseUpCoordinates)) {
      const finalHead = resolvePointerHead(upEvent);
      if (finalHead !== null) {
        handledPointerMove = true;
        pendingMoveHead = finalHead;
      }
    }
    if (handledPointerMove) {
      upEvent.preventDefault();
      upEvent.stopPropagation();
    }
    stop(true);
  };
  const handleBlur = () => stop(true);

  stopPointerSelectionTracking?.();
  stopPointerSelectionTracking = stop;
  ownerDocument.addEventListener("mousemove", handleMove, true);
  ownerDocument.addEventListener("mouseup", handleUp, true);
  ownerWindow?.addEventListener("blur", handleBlur);
  if (!initializeSelection) return;
  if (event.shiftKey) {
    view.dispatch({
      selection: { anchor, head },
    });
    if (!view.hasFocus) restoreEditorFocus(view);
    return;
  }
  view.dispatch({ selection: { anchor, head } });
  if (!view.hasFocus) restoreEditorFocus(view);
}

type RenderedPointerResolverScope = "line" | "content" | "root";

function createRenderedPointerResolver(
  view: EditorView,
  root: HTMLElement,
  scope: RenderedPointerResolverScope,
): ((clientX: number, clientY: number) => number | null) | undefined {
  if (typeof root.ownerDocument.createRange !== "function") return undefined;
  const container = scope === "line"
    ? root.closest<HTMLElement>(".cm-line")
    : scope === "content"
      ? view.contentDOM
      : root;
  if (!container) return undefined;

  const textNodes: Text[] = [];
  const collectTextNodes = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
      return;
    }
    node.childNodes.forEach(collectTextNodes);
  };
  collectTextNodes(container);

  const blockBoundaries = new Map<HTMLElement, {
    boundaries: number[];
    textRoot: HTMLElement;
  }>();
  const widgetBoundaries = new Map<HTMLElement, number[]>();
  const resolveBoundary = (node: Text, offset: number): number | null => {
    const parent = node.parentElement;
    const blockRoot = parent?.closest<HTMLElement>(".cm-special-preview");
    if (blockRoot) {
      const block = renderedMarkdownWidgetRoots.get(blockRoot);
      if (!block || !["code", "html", "definition"].includes(block.kind)) return null;
      let cached = blockBoundaries.get(blockRoot);
      if (!cached) {
        const textRoot = block.kind === "code"
          ? blockRoot.querySelector<HTMLElement>("pre code") ?? blockRoot
          : blockRoot;
        cached = {
          boundaries: getRenderedMarkdownSourceBoundaries(
            block.source,
            textRoot.textContent ?? "",
            block.kind,
          ).map((boundary) => block.from + boundary),
          textRoot,
        };
        blockBoundaries.set(blockRoot, cached);
      }
      if (!cached.textRoot.contains(node)) return null;
      const renderedOffset = getDomTextBoundaryOffset(cached.textRoot, node, offset);
      return renderedOffset === null
        ? null
        : cached.boundaries[renderedOffset] ?? block.to;
    }

    const widget = parent?.closest<HTMLElement>(
      "[data-markdown-source][data-markdown-syntax]",
    );
    if (widget && container.contains(widget)) {
      let boundaries = widgetBoundaries.get(widget);
      if (!boundaries) {
        const widgetSource = widget.dataset.markdownSource ?? "";
        const widgetText = widget.textContent ?? "";
        const explicitWidgetFrom = Number(widget.dataset.markdownFrom);
        let widgetFrom: number;
        if (widget.dataset.markdownFrom !== undefined && Number.isFinite(explicitWidgetFrom)) {
          widgetFrom = clampOffset(explicitWidgetFrom, view.state.doc.length);
        } else {
          try {
            widgetFrom = view.posAtDOM(widget, 0);
          } catch {
            return null;
          }
        }
        const widgetSyntax = widget.dataset.markdownSyntax as RenderedSourceSyntax;
        boundaries = mapRenderedTextBoundariesToSource(
          widgetSource,
          widgetText,
          widgetSyntax,
          props.settings.extensions.emoji,
        ).map((boundary) => widgetFrom + boundary);
        widgetBoundaries.set(widget, boundaries);
      }
      const renderedOffset = getDomTextBoundaryOffset(widget, node, offset);
      return renderedOffset === null
        ? null
        : boundaries[renderedOffset] ?? boundaries.at(-1) ?? null;
    }

    if (parent?.closest(
      ".cm-visual-table-widget, .cm-footnote-definition-widget, .cm-reference-definition",
    )) {
      return null;
    }

    try {
      return view.posAtDOM(node, offset);
    } catch {
      return null;
    }
  };
  const trimTrailingHtmlSyntax = (
    node: Text,
    before: number,
    after: number,
  ): number => {
    if (after <= before) return after;
    const blockRoot = node.parentElement?.closest<HTMLElement>(".cm-special-preview");
    const block = blockRoot ? renderedMarkdownWidgetRoots.get(blockRoot) : null;
    if (!block || block.kind !== "html") return after;
    const relativeFrom = clampOffset(before - block.from, block.source.length);
    const relativeTo = clampOffset(after - block.from, block.source.length);
    const sourceSlice = block.source.slice(relativeFrom, relativeTo);
    const tagStart = sourceSlice.indexOf("<");
    if (tagStart <= 0) return after;
    const visibleSource = sourceSlice.slice(0, tagStart);
    const entity = visibleSource.match(
      /^&(?:#[xX][\dA-Fa-f]+|#\d+|[A-Za-z][\w]+);/,
    );
    if (entity) return before + entity[0].length;
    const firstBoundary = getGraphemeBoundaries(visibleSource)[1];
    return firstBoundary === undefined
      ? after
      : Math.min(after, before + firstBoundary);
  };

  const graphemes: Array<{
    before: number;
    after: number;
    left: number;
    right: number;
    top: number;
    bottom: number;
  }> = [];
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const node of textNodes) {
    const boundaries = getGraphemeBoundaries(node.textContent ?? "");
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const from = boundaries[index]!;
      const to = boundaries[index + 1]!;
      const before = resolveBoundary(node, from);
      const mappedAfter = resolveBoundary(node, to);
      if (before === null || mappedAfter === null) continue;
      const after = trimTrailingHtmlSyntax(node, before, mappedAfter);
      const range = root.ownerDocument.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      const rectangles = typeof range.getClientRects === "function"
        ? Array.from(range.getClientRects())
        : [range.getBoundingClientRect()];
      for (const rectangle of rectangles) {
        if (rectangle.width === 0 && rectangle.height === 0) continue;
        graphemes.push({
          before,
          after,
          left: rectangle.left,
          right: rectangle.right,
          top: rectangle.top,
          bottom: rectangle.bottom,
        });
        top = Math.min(top, rectangle.top);
        bottom = Math.max(bottom, rectangle.bottom);
      }
    }
  }
  if (graphemes.length === 0) return undefined;

  const scrollContainer = getEditorScrollContainer() ?? view.scrollDOM;
  const initialScrollLeft = scrollContainer.scrollLeft;
  const initialScrollTop = scrollContainer.scrollTop;
  return (clientX: number, clientY: number) => {
    const adjustedX = clientX + scrollContainer.scrollLeft - initialScrollLeft;
    const adjustedY = clientY + scrollContainer.scrollTop - initialScrollTop;
    if (adjustedY < top - 4 || adjustedY > bottom + 4) return null;
    let best: {
      horizontalDistance: number;
      position: number;
      verticalDistance: number;
    } | null = null;
    for (const grapheme of graphemes) {
      const horizontalDistance = adjustedX < grapheme.left
        ? grapheme.left - adjustedX
        : adjustedX > grapheme.right
          ? adjustedX - grapheme.right
          : 0;
      const verticalDistance = adjustedY < grapheme.top
        ? grapheme.top - adjustedY
        : adjustedY > grapheme.bottom
          ? adjustedY - grapheme.bottom
          : 0;
      const position = adjustedX <= grapheme.left + (grapheme.right - grapheme.left) / 2
        ? grapheme.before
        : grapheme.after;
      if (
        !best
        || verticalDistance < best.verticalDistance - 0.5
        || (
          Math.abs(verticalDistance - best.verticalDistance) <= 0.5
          && horizontalDistance < best.horizontalDistance
        )
      ) {
        best = { horizontalDistance, position, verticalDistance };
      }
    }
    return best?.position ?? null;
  };
}

function createRenderedMarkdownPointerResolver(
  view: EditorView,
  initialBlockRoot: HTMLElement,
  initialBlockFrom: number,
  initialBlockTo: number,
): (
  clientX: number,
  clientY: number,
  target: EventTarget | null,
) => number | null {
  const ownerDocument = initialBlockRoot.ownerDocument;
  const contentResolver = createRenderedPointerResolver(
    view,
    initialBlockRoot,
    "content",
  );
  let blockRoot: HTMLElement | null = initialBlockRoot;
  let blockResolver = createRenderedPointerResolver(view, initialBlockRoot, "root");
  let blockRange: { from: number; to: number } | null = {
    from: initialBlockFrom,
    to: initialBlockTo,
  };
  let lineRoot: HTMLElement | null = null;
  let lineResolver: ((clientX: number, clientY: number) => number | null) | undefined;

  return (clientX, clientY, target) => {
    const pointerElement = ownerDocument.elementFromPoint?.(clientX, clientY)
      ?? (target instanceof Element ? target : null);
    const nextBlockRoot = pointerElement?.closest<HTMLElement>(".cm-special-preview") ?? null;
    const block = nextBlockRoot ? renderedMarkdownWidgetRoots.get(nextBlockRoot) : null;
    if (nextBlockRoot && block && ["code", "html", "definition"].includes(block.kind)) {
      if (nextBlockRoot !== blockRoot) {
        blockRoot = nextBlockRoot;
        blockResolver = createRenderedPointerResolver(view, nextBlockRoot, "root");
      }
      blockRange = { from: block.from, to: block.to };
      const blockPosition = blockResolver?.(clientX, clientY);
      if (blockPosition !== null && blockPosition !== undefined) return blockPosition;
    }

    const nextLineRoot = pointerElement?.closest<HTMLElement>(".cm-line") ?? null;
    const excludedTarget = pointerElement?.closest(
      ".cm-special-preview, .cm-visual-table-widget, "
      + ".cm-footnote-definition-widget, .cm-reference-definition",
    );
    let pointerInsideCachedBlock = false;
    if (blockRange && nextLineRoot && !excludedTarget) {
      try {
        const linePosition = view.posAtDOM(nextLineRoot, 0);
        pointerInsideCachedBlock = linePosition >= blockRange.from
          && linePosition < blockRange.to;
      } catch {
        pointerInsideCachedBlock = false;
      }
    }
    if (pointerElement && nextBlockRoot !== blockRoot && !pointerInsideCachedBlock) {
      blockRoot = null;
      blockResolver = undefined;
      blockRange = null;
    }
    if (pointerInsideCachedBlock) {
      const cachedBlockPosition = blockResolver?.(clientX, clientY);
      if (cachedBlockPosition !== null && cachedBlockPosition !== undefined) {
        return cachedBlockPosition;
      }
    }

    if (nextLineRoot && !excludedTarget) {
      if (nextLineRoot !== lineRoot) {
        lineRoot = nextLineRoot;
        lineResolver = createRenderedPointerResolver(view, nextLineRoot, "line");
      }
      const linePosition = lineResolver?.(clientX, clientY);
      if (linePosition !== null && linePosition !== undefined) return linePosition;
    }

    const cachedBlockPosition = blockResolver?.(clientX, clientY);
    if (cachedBlockPosition !== null && cachedBlockPosition !== undefined) {
      return cachedBlockPosition;
    }
    const cachedContentPosition = contentResolver?.(clientX, clientY);
    if (cachedContentPosition !== null && cachedContentPosition !== undefined) {
      return cachedContentPosition;
    }
    return view.posAtCoords({ x: clientX, y: clientY });
  };
}

function getPointerRenderedTextOffset(root: HTMLElement, event: MouseEvent): number {
  const ownerDocument = root.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (
      x: number,
      y: number,
    ) => { startContainer: Node; startOffset: number } | null;
  };
  const renderedText = root.textContent ?? "";
  const preferMeasuredOffset = root.classList.contains("cm-rendered-emoji");
  const normalizeOffset = (offset: number) => (
    snapTextOffsetToGraphemeBoundary(renderedText, offset)
  );
  try {
    if (preferMeasuredOffset) {
      const graphemeBoundaries = getGraphemeBoundaries(renderedText);
      const bounds = root.getBoundingClientRect();
      if (graphemeBoundaries.length === 2 && bounds.width > 0) {
        return event.clientX <= bounds.left + bounds.width / 2
          ? graphemeBoundaries[0]!
          : graphemeBoundaries[1]!;
      }
      const measuredOffset = getMeasuredRenderedTextOffset(
        root,
        event.clientX,
        event.clientY,
      );
      if (measuredOffset !== null) return normalizeOffset(measuredOffset);
    }
    const caret = ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
    const caretOffset = caret
      ? getDomTextBoundaryOffset(root, caret.offsetNode, caret.offset)
      : null;
    if (caretOffset !== null) return normalizeOffset(caretOffset);

    const caretRange = ownerDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
    const rangeOffset = caretRange
      ? getDomTextBoundaryOffset(root, caretRange.startContainer, caretRange.startOffset)
      : null;
    if (rangeOffset !== null) return normalizeOffset(rangeOffset);

    if (!preferMeasuredOffset) {
      const measuredOffset = getMeasuredRenderedTextOffset(
        root,
        event.clientX,
        event.clientY,
      );
      if (measuredOffset !== null) return normalizeOffset(measuredOffset);
    }
  } catch {
    // 浏览器可能拒绝查询视口之外的坐标，继续使用当前选区。
  }

  const selection = ownerDocument.getSelection();
  if (selection?.focusNode) {
    const selectionOffset = getDomTextBoundaryOffset(
      root,
      selection.focusNode,
      selection.focusOffset,
    );
    if (selectionOffset !== null) return normalizeOffset(selectionOffset);
  }

  const target = event.target instanceof Element ? event.target : null;
  return normalizeOffset(getRenderedTargetTextOffset(root, target));
}

function getMeasuredRenderedTextOffset(
  root: HTMLElement,
  clientX: number,
  clientY: number,
): number | null {
  if (typeof root.ownerDocument.createRange !== "function") return null;
  const textNodes: Text[] = [];
  const collectTextNodes = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
      return;
    }
    node.childNodes.forEach(collectTextNodes);
  };
  collectTextNodes(root);

  let baseOffset = 0;
  let best: {
    horizontalDistance: number;
    offset: number;
    verticalDistance: number;
  } | null = null;
  for (const node of textNodes) {
    const value = node.textContent ?? "";
    const boundaries = getGraphemeBoundaries(value);
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const from = boundaries[index]!;
      const to = boundaries[index + 1]!;
      const range = root.ownerDocument.createRange();
      range.setStart(node, from);
      range.setEnd(node, to);
      const rectangles = typeof range.getClientRects === "function"
        ? Array.from(range.getClientRects())
        : [range.getBoundingClientRect()];
      for (const rectangle of rectangles) {
        if (rectangle.width === 0 && rectangle.height === 0) continue;
        const horizontalDistance = clientX < rectangle.left
          ? rectangle.left - clientX
          : clientX > rectangle.right
            ? clientX - rectangle.right
            : 0;
        const verticalDistance = clientY < rectangle.top
          ? rectangle.top - clientY
          : clientY > rectangle.bottom
            ? clientY - rectangle.bottom
            : 0;
        const graphemeOffset = clientX <= rectangle.left + rectangle.width / 2
          ? from
          : to;
        if (
          !best
          || verticalDistance < best.verticalDistance - 0.5
          || (
            Math.abs(verticalDistance - best.verticalDistance) <= 0.5
            && horizontalDistance < best.horizontalDistance
          )
        ) {
          best = {
            horizontalDistance,
            offset: baseOffset + graphemeOffset,
            verticalDistance,
          };
        }
      }
    }
    baseOffset += value.length;
  }
  return best?.offset ?? null;
}

function getDomTextBoundaryOffset(
  root: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  if (node !== root && !root.contains(node)) return null;
  let textOffset = 0;
  let resolved = false;

  const visit = (current: Node) => {
    if (resolved) return;
    if (current === node) {
      if (current.nodeType === Node.TEXT_NODE) {
        textOffset += Math.max(0, Math.min(offset, current.textContent?.length ?? 0));
      } else {
        const childLimit = Math.max(0, Math.min(offset, current.childNodes.length));
        for (let index = 0; index < childLimit; index += 1) {
          textOffset += getDomTextLength(current.childNodes[index]!);
        }
      }
      resolved = true;
      return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      textOffset += current.textContent?.length ?? 0;
      return;
    }
    current.childNodes.forEach(visit);
  };

  visit(root);
  return resolved ? textOffset : null;
}

function getDomTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  let length = 0;
  node.childNodes.forEach((child) => {
    length += getDomTextLength(child);
  });
  return length;
}

function getRenderedTargetTextOffset(root: HTMLElement, target: Element | null): number {
  if (!target || target === root || !root.contains(target)) return 0;
  const parent = target.parentNode;
  if (!parent) return 0;
  const targetIndex = Array.prototype.indexOf.call(parent.childNodes, target) as number;
  return getDomTextBoundaryOffset(root, parent, Math.max(0, targetIndex)) ?? 0;
}


function applyPreviewContainerPresentation(
  root: HTMLElement,
  block: Pick<ContinuousPreviewBlock, "quoteDepth" | "listDepth">,
  includeQuote = true,
) {
  const quoteDepth = block.quoteDepth ?? 0;
  const listDepth = block.listDepth ?? null;
  if (quoteDepth <= 0 && listDepth === null) return;
  root.classList.add("cm-preview-container");
  if (includeQuote && quoteDepth > 0) {
    root.classList.add("cm-preview-quote-container");
    root.style.setProperty(
      "--preview-quote-indent",
      `${quoteDepth * 15 + Math.max(0, quoteDepth - 1) * 4}px`,
    );
    root.style.setProperty("--preview-quote-end", quoteDepth === 1 ? "15px" : "0px");
    root.style.setProperty(
      "--preview-quote-guide-width",
      `${Math.max(0, quoteDepth - 1) * 19}px`,
    );
  }
  if (listDepth !== null) {
    root.classList.add("cm-preview-list-container");
    root.style.setProperty("--preview-list-indent", `${(listDepth + 1) * 30}px`);
  }
}

function revealPreviewBlock(view: EditorView, offset: number) {
  view.dispatch({
    selection: { anchor: offset },
    effects: EditorView.scrollIntoView(offset, { y: "center" }),
  });
  if (!view.hasFocus) restoreEditorFocus(view);
}

function revealInlineMathSource(view: EditorView, offset: number, source: string) {
  const delimiterLength = source.startsWith("\\(") && source.endsWith("\\)") ? 2 : 1;
  revealPreviewRange(
    view,
    offset + delimiterLength,
    offset + source.length - delimiterLength,
  );
}

function revealInlineImageAlt(view: EditorView, offset: number, source: string) {
  const openBracket = source.indexOf("[");
  const image = openBracket >= 0
    ? readMarkdownInlineLink(source, openBracket)
      ?? readMarkdownReferenceLink(source, openBracket)
      ?? readMarkdownShortcutReferenceLink(source, openBracket)
    : null;
  if (!image || image.imageStart === null) {
    revealPreviewBlock(view, offset);
    return;
  }
  revealPreviewRange(view, offset + image.labelStart, offset + image.labelEnd);
}

function revealPreviewRange(view: EditorView, anchorOffset: number, headOffset: number) {
  const anchor = clampOffset(anchorOffset, view.state.doc.length);
  const head = clampOffset(headOffset, view.state.doc.length);
  view.dispatch({
    selection: { anchor, head },
    effects: EditorView.scrollIntoView(head, { y: "center" }),
  });
  if (!view.hasFocus) restoreEditorFocus(view);
}


function revealStructuredDefinitionRange(
  view: EditorView,
  anchorOffset: number,
  headOffset: number,
) {
  const anchor = clampOffset(anchorOffset, view.state.doc.length);
  const head = clampOffset(headOffset, view.state.doc.length);
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
  });
  queueMicrotask(() => {
    if (editorView.value !== view) return;
    view.dispatch({
      selection: { anchor, head },
      effects: EditorView.scrollIntoView(head, { y: "center" }),
    });
    window.setTimeout(() => {
      if (editorView.value === view) view.focus();
    }, 0);
  });
}

function getPreviewBlockLabel(kind: ContinuousPreviewBlockKind): string {
  const labels: Record<ContinuousPreviewBlockKind, string> = {
    diagram: "流程图",
    image: "图片",
    table: "表格",
    math: "数学公式",
    code: "代码块",
    toc: "目录",
    html: "HTML",
    definition: "定义列表",
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
  const markdownInputCorrection = getMarkdownTextInputCorrection(update);
  if (markdownInputCorrection) {
    const document = update.state.doc;
    queueMicrotask(() => {
      if (editorView.value !== update.view || update.view.state.doc !== document) return;
      dispatchTextEdit(markdownInputCorrection, update.view);
    });
    return;
  }

  if (update.docChanged) {
    resetPointerGestureTracking();
    clearFocusedAtomicBlock();
    emit(
      "update:modelValue",
      update.state.doc.sliceString(
        0,
        update.state.doc.length,
        getDocumentLineBreak(props.modelValue),
      ),
    );
  }
  if (update.docChanged || update.selectionSet) {
    rememberCodeLanguageAtSelection(update.view);
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

function handleMarkdownTextInput(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): boolean {
  if (props.readonly || props.settings.sourceMode) return false;
  const result = applyMarkdownTextInputShortcut({
    value: view.state.doc.toString(),
    selectionStart: from,
    selectionEnd: to,
  }, text, props.settings.indentSize);
  if (!result) return false;
  dispatchTextEdit(result, view);
  return true;
}

function getMarkdownTextInputCorrection(update: ViewUpdate): TextEditResult | null {
  if (
    props.readonly
    || props.settings.sourceMode
    || !update.docChanged
    || update.transactions.length !== 1
  ) return null;

  const transaction = update.transactions[0]!;
  const userEvent = transaction.annotation(Transaction.userEvent);
  if (
    (userEvent !== undefined && !transaction.isUserEvent("input.type"))
    || transaction.annotation(Transaction.addToHistory) === false
    || transaction.annotation(allowReadonlyDocumentUpdate) === true
    || transaction.annotation(isolateHistory) !== undefined
    || update.state.selection.ranges.length !== 1
  ) return null;

  const selection = update.state.selection.main;
  if (!selection.empty) return null;
  const inputChanges: Array<{
    from: number;
    to: number;
    toAfter: number;
    text: string;
  }> = [];
  transaction.changes.iterChanges((fromA, toA, _fromB, toB, inserted) => {
    inputChanges.push({
      from: fromA,
      to: toA,
      toAfter: toB,
      text: inserted.sliceString(0, inserted.length),
    });
  });
  if (inputChanges.length !== 1) return null;
  const inputChange = inputChanges[0]!;
  if (inputChange.toAfter !== selection.head) return null;

  const value = update.state.doc.toString();
  const result = applyMarkdownTextInputShortcut({
    value: transaction.startState.doc.toString(),
    selectionStart: inputChange.from,
    selectionEnd: inputChange.to,
  }, inputChange.text, props.settings.indentSize);
  if (!result) return null;
  return (
    result.value === value
    && result.selectionStart === selection.from
    && result.selectionEnd === selection.to
  ) ? null : result;
}

function moveToAtxHeadingVisibleBoundary(event: KeyboardEvent, view: EditorView): boolean {
  if (
    props.settings.sourceMode
    || (event.key !== "Home" && event.key !== "End")
    || event.ctrlKey
    || event.metaKey
    || event.altKey
  ) return false;

  const selection = view.state.selection.main;
  const range = getContinuousAtxHeadingContentRange(
    view.state.doc.toString(),
    selection.head,
    syntaxTree(view.state),
  );
  if (!range) return false;

  const head = event.key === "Home" ? range.from : range.to;
  const anchor = event.shiftKey ? selection.anchor : head;
  event.preventDefault();
  view.dispatch({ selection: EditorSelection.single(anchor, head), scrollIntoView: true });
  return true;
}

function handleEditorKeydown(event: KeyboardEvent, view: EditorView): boolean {
  if (event.isComposing || event.keyCode === 229) return false;
  if (props.readonly) return false;
  const eventTarget = event.target instanceof Node ? event.target : null;
  if (
    focusedAtomicBlock
    && eventTarget
    && focusedAtomicBlock.dom.contains(eventTarget)
  ) return handleFocusedAtomicBlockKeydown(event, view);
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
  const state = currentTextState(view);
  const primaryModifier = event.ctrlKey || event.metaKey;
  if (moveToAtxHeadingVisibleBoundary(event, view)) return true;
  if (
    !props.settings.sourceMode
    && !primaryModifier
    && !event.altKey
    && !event.shiftKey
    && (event.key === "`" || event.key === "~")
  ) {
    const language = getDefaultCodeLanguage("markdown");
    const result = applyDefaultCodeLanguageOnFenceKey(state, event.key, language);
    if (result) {
      event.preventDefault();
      lastCodeLanguage.value = language;
      dispatchTextEdit(result, view);
      return true;
    }
  }
  if (
    !props.settings.sourceMode
    && !primaryModifier
    && !event.altKey
    && !event.shiftKey
    && state.selectionStart === state.selectionEnd
    && (event.key === "ArrowUp" || event.key === "ArrowDown")
  ) {
    const direction = event.key === "ArrowUp" ? "backward" : "forward";
    const block = findAdjacentAtomicMarkdownBlock(state.value, state.selectionStart, direction);
    const dom = block ? getAtomicMarkdownBlockDom(view, block) : null;
    if (block && dom) {
      event.preventDefault();
      focusAtomicMarkdownBlock(view, block, dom);
      return true;
    }
  }
  if (primaryModifier && !event.altKey) {
    const tableResult = event.key === "Enter" && !event.shiftKey
      && selectMarkdownTablePart(state, "cell")
      ? insertMarkdownTableRow(state, "below", "")
      : (event.key === "Backspace" || event.key === "Delete") && event.shiftKey
        ? deleteMarkdownTablePart(state, "row")
        : null;
    if (tableResult) {
      event.preventDefault();
      dispatchTextEdit(tableResult, view);
      return true;
    }
  }
  if (
    !props.settings.sourceMode
    && event.key === "Enter"
    && !event.altKey
  ) {
    const rawResult = handleRawBlockEnter({
      ...state,
      selectionHead: view.state.selection.main.head,
    }, {
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    });
    if (rawResult) {
      event.preventDefault();
      dispatchTextEdit(rawResult, view);
      return true;
    }
  }

  if (
    !props.settings.sourceMode
    && event.key === "Enter"
  ) {
    const frontMatterResult = editMarkdownFrontMatterOnEnter(state, {
      primary: primaryModifier,
      shift: event.shiftKey,
      alt: event.altKey,
    });
    if (frontMatterResult) {
      event.preventDefault();
      dispatchTextEdit(frontMatterResult, view);
      return true;
    }
  }

  if (
    !props.settings.sourceMode
    && event.key === "Enter"
    && primaryModifier
    && !event.shiftKey
    && !event.altKey
  ) {
    const containerResult = splitMarkdownContainerParagraphOnPrimaryEnter(state);
    if (containerResult) {
      event.preventDefault();
      dispatchTextEdit(containerResult, view);
      return true;
    }
  }

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

  if (
    event.key === "Escape"
    && !props.settings.sourceMode
    && props.settings.extensions.math
  ) {
    const result = openInlineMathOnEscape(state.value, state.selectionStart, state.selectionEnd);
    if (result) {
      event.preventDefault();
      allowNextTabFocus = false;
      dispatchTextEdit(result, view);
      return true;
    }
  }

  if (event.key === "Escape") {
    clearEmojiSuggestions();
    allowNextTabFocus = true;
    return false;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    if (
      event.shiftKey
      && props.settings.shiftTabAutoIndent
      && !props.settings.sourceMode
      && !isMarkdownListItemAtOffset(state.value, state.selectionStart)
    ) {
      const rawBlock = getRawBlockSelection({
        ...state,
        selectionHead: view.state.selection.main.head,
      });
      if (rawBlock?.insideContent) {
        autoIndentRawBlock(view, rawBlock, "selection");
        return true;
      }
    }
    if (!props.settings.sourceMode) {
      const definitionNavigation = navigateMarkdownDefinitionField(
        state.value,
        state.selectionStart,
        state.selectionEnd,
        event.shiftKey,
      );
      if (definitionNavigation) {
        allowNextTabFocus = definitionNavigation.field === null;
        queueMicrotask(() => {
          if (editorView.value !== view) return;
          dispatchTextEdit({
            value: state.value,
            selectionStart: definitionNavigation.selectionStart,
            selectionEnd: definitionNavigation.selectionEnd,
          }, view);
        });
        return true;
      }
    }
    const tableNavigation = navigateMarkdownTableCell(state, event.shiftKey ? "previous" : "next");
    if (tableNavigation) {
      dispatchTextEdit(tableNavigation, view);
    } else {
      const result = applyContextualMarkdownTab(
        state.value,
        state.selectionStart,
        state.selectionEnd,
        event.shiftKey,
        props.settings.indentSize,
        props.settings.codeIndentSize,
      );
      dispatchTextEdit(result, view);
    }
    return true;
  }

  if (!props.settings.sourceMode && event.key === "Enter" && event.shiftKey) {
    event.preventDefault();
    dispatchTextEdit(insertMarkdownSoftBreak(state), view);
    return true;
  }

  if (!props.settings.sourceMode && event.key === "Enter") {
    const result = continueMarkdownBlock(state, props.settings.indentSize) ?? splitMarkdownParagraphOnEnter(state);
    if (result) {
      event.preventDefault();
      dispatchTextEdit(result, view);
      return true;
    }
  }

  if (!props.settings.sourceMode && event.key === " ") {
    const result = applyMarkdownSpaceShortcut(state, props.settings.indentSize);
    if (result) {
      event.preventDefault();
      dispatchTextEdit(result, view);
      return true;
    }
  }

  if (
    !props.settings.sourceMode
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && (event.key === "Backspace" || event.key === "Delete")
  ) {
    const atomicDirection = event.key === "Backspace" ? "backward" : "forward";
    const adjacentAtomicBlock = state.selectionStart === state.selectionEnd
      ? findAdjacentAtomicMarkdownBlock(state.value, state.selectionStart, atomicDirection)
      : null;
    if (event.key === "Backspace") {
      const horizontalRuleResult = handleBackspaceAfterHorizontalRule(state);
      if (horizontalRuleResult) {
        event.preventDefault();
        dispatchTextEdit(horizontalRuleResult, view);
        return true;
      }
    }
    const adjacentAtomicDom = adjacentAtomicBlock
      ? getAtomicMarkdownBlockDom(view, adjacentAtomicBlock)
      : null;
    if (adjacentAtomicBlock) {
      event.preventDefault();
      if (adjacentAtomicDom) {
        focusAtomicMarkdownBlock(view, adjacentAtomicBlock, adjacentAtomicDom);
      } else {
        deleteAtomicMarkdownBlock(view, adjacentAtomicBlock);
      }
      return true;
    }

    const rawDeleteResult = handleRawBlockBoundaryDelete(
      {
        ...state,
        selectionHead: view.state.selection.main.head,
      },
      event.key === "Backspace" ? "backward" : "forward",
    );
    if (rawDeleteResult) {
      event.preventDefault();
      dispatchTextEdit(rawDeleteResult, view);
      return true;
    }

    if (event.key === "Backspace") {
      const outdentResult = outdentMarkdownListOnBackspace(state, props.settings.indentSize);
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
    const mergedBoundary = mergeVisibleMarkdownBlockBoundary(
      state,
      event.key === "Backspace" ? "backward" : "forward",
    );
    if (mergedBoundary) {
      event.preventDefault();
      dispatchTextEdit(mergedBoundary, view);
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
  if (
    props.readonly
    && ![
      "copy",
      "copyMarkdown",
      "copyHtml",
      "copyPlainText",
      "openLink",
      "selectAll",
      "goToDocumentStart",
      "goToDocumentEnd",
    ].includes(command)
  ) {
    return;
  }
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
        void copySemanticSelection();
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
      selectRenderedDocument(view);
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
    case "moveLineUp": return moveMarkdownContent(state, "up");
    case "moveLineDown": return moveMarkdownContent(state, "down");
    case "indent": return indentCommand(state, false);
    case "outdent": return indentCommand(state, true);
    case "bold": return toggleMarkdownInlineStyle(state, "**", "**");
    case "italic": return toggleMarkdownInlineStyle(state, "*", "*");
    case "underline": return toggleMarkdownInlineStyle(state, "<u>", "</u>");
    case "strike": return toggleMarkdownInlineStyle(state, "~~", "~~");
    case "inlineCode": return toggleMarkdownInlineStyle(state, "`", "`");
    case "inlineMath": return wrapMarkdownSelection(state, "$", "$", "a^2 + b^2 = c^2");
    case "mathBlock": return formatMarkdownMathBlock(state);
    case "footnote": return insertMarkdownFootnoteTemplate(state);
    case "highlight": return toggleMarkdownInlineStyle(state, "==", "==");
    case "superscript": return toggleMarkdownInlineStyle(state, "^", "^");
    case "subscript": return toggleMarkdownInlineStyle(state, "~", "~");
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
    case "codeBlock": return formatMarkdownCodeBlock(state, getDefaultCodeLanguage("menu"));
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
    case "callout": return insertMarkdownCalloutTemplate(state, payload);
    case "mermaid": return insertMarkdownDiagramTemplate(state, "mermaid");
    case "flowchart": return insertMarkdownDiagramTemplate(state, "flowchart");
    case "sequence": return insertMarkdownDiagramTemplate(state, "sequence");
    case "setImageWidth": return setImageWidth(state, payload);
    default: return null;
  }
}

function moveMarkdownContent(
  state: TextState,
  direction: "up" | "down",
): TextEditResult {
  if (props.settings.sourceMode) return moveMarkdownLines(state, direction);
  const rawBlock = getRawBlockSelection(state);
  return rawBlock?.insideContent
    ? moveMarkdownLines(state, direction)
    : moveMarkdownBlocks(state, direction);
}

function getDefaultCodeLanguage(channel: DefaultCodeLanguageChannel): string {
  return resolveDefaultCodeLanguage(
    props.settings.defaultCodeLanguage,
    props.settings.defaultCodeLanguageApplyTo,
    channel,
    lastCodeLanguage.value,
  );
}

function rememberCodeLanguageAtSelection(view: EditorView) {
  const state = currentTextState(view);
  const selection = view.state.selection.main;
  const raw = getRawBlockSelection({
    ...state,
    selectionHead: selection.head,
  });
  if (!raw || raw.kind !== "code") return;
  const info = getCodeFenceInfoString(state.value.slice(raw.blockStart, raw.blockEnd));
  if (info) lastCodeLanguage.value = info.value;
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
  historyKind: "input" | "command" | "paste" = "input",
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
    annotations: historyKind === "input"
      ? undefined
      : [
        isolateHistory.of("full"),
        ...(historyKind === "paste"
          ? [Transaction.userEvent.of("input.paste")]
          : []),
      ],
  });
}

function replaceDocument(value: string) {
  const view = editorView.value;
  if (!view || props.readonly || view.state.doc.toString() === value) return;
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
  insertText(buildLocalMediaMarkup("image", src, alt));
}

function reserveImageInsertion(): string | null {
  const view = editorView.value;
  if (!view || props.readonly) return null;
  const placeholder = `<!--marko-image-${Date.now().toString(36)}-${++imagePlaceholderSequence}-->`;
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
  return replaceMediaPlaceholder(
    placeholder,
    src === null ? null : buildLocalMediaMarkup("image", src, alt),
  );
}

function replaceMediaPlaceholder(placeholder: string, markup: string | null): boolean {
  const view = editorView.value;
  if (!view) return false;
  const source = view.state.doc.toString();
  const from = source.indexOf(placeholder);
  if (from < 0) return false;
  view.dispatch({
    changes: { from, to: from + placeholder.length, insert: markup ?? "" },
    annotations: [
      Transaction.addToHistory.of(false),
      allowReadonlyDocumentUpdate.of(true),
    ],
  });
  return true;
}

function setCursorAtCoordinates(x: number, y: number): boolean {
  const view = editorView.value;
  if (!view || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const position = view.posAtCoords({ x, y });
  if (position === null) return false;
  view.dispatch({ selection: { anchor: position } });
  return true;
}

function insertText(text: string) {
  const view = editorView.value;
  if (!view || props.readonly) return;
  dispatchTextEdit(insertMarkdownAtSelection(currentTextState(view), text), view, "command");
}

function selectRenderedDocument(view: EditorView) {
  const selection = EditorSelection.single(0, view.state.doc.length);
  view.dispatch({
    selection,
    effects: setRenderedTripleClickSelection.of(selection),
  });
  view.focus();
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
  if (focus) {
    await nextTick();
    view.focus();
  }
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
  replaceMediaPlaceholder,
  setCursorAtCoordinates,
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
  refreshLayout() {
    editorView.value?.requestMeasure();
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

function applyEmoji(code: string) {
  const view = editorView.value;
  const range = emojiRange.value;
  if (!view || !range) return;
  const shortcode = `:${code}:`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: shortcode },
    selection: { anchor: range.from + shortcode.length },
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
    applyEmoji(suggestions[Math.min(nextIndex, suggestions.length - 1)]!.code);
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

function selectEditorLineAtPointer(
  event: MouseEvent,
  view: EditorView,
  target: Element | null,
): boolean {
  const line = target?.closest<HTMLElement>(".cm-line") ?? null;
  if (
    props.readonly
    || event.ctrlKey
    || event.metaKey
    || !line
    || target?.closest(
      ".cm-special-preview, .cm-visual-table-widget, "
      + ".cm-footnote-definition-widget, .cm-reference-definition",
    )
  ) {
    return false;
  }
  const position = createEditorLinePointerResolver(view, line)(event).pos;
  beginRenderedLinePointerSelection(view, event, position);
  return true;
}

function selectEditorWordAtPointer(
  event: MouseEvent,
  view: EditorView,
  target: Element | null,
): boolean {
  const line = target?.closest<HTMLElement>(".cm-line") ?? null;
  if (
    props.readonly
    || event.ctrlKey
    || event.metaKey
    || !line
    || target?.closest(".cm-special-preview, .cm-visual-table-widget")
  ) {
    return false;
  }
  const position = view.posAtCoords({
    x: event.clientX,
    y: event.clientY,
  });
  const word = position === null ? null : view.state.wordAt(position);
  if (!word) return false;
  const resolvePointerPosition = createEditorLinePointerResolver(view, line);
  beginRenderedWordPointerSelection(
    view,
    event,
    word,
    (pointerEvent) => resolvePointerPosition(pointerEvent).pos,
  );
  return true;
}

interface EditorPointerPosition {
  assoc: -1 | 1;
  pos: number;
}

type EditorPointerResolver = (event: MouseEvent) => EditorPointerPosition;

function createEditorLinePointerResolver(
  view: EditorView,
  startLine: HTMLElement,
): EditorPointerResolver {
  let lineRoot: HTMLElement | null = startLine;
  let lineResolver = createRenderedPointerResolver(view, startLine, "line");
  let blockRoot: HTMLElement | null = null;
  let blockResolver: ((clientX: number, clientY: number) => number | null) | undefined;
  let blockRange: { from: number; to: number } | null = null;
  let contentResolver: ((clientX: number, clientY: number) => number | null) | undefined;

  return (event: MouseEvent) => {
    const clientX = event.clientX;
    const clientY = event.clientY;
    const pointerElement = startLine.ownerDocument.elementFromPoint?.(clientX, clientY)
      ?? (event.target instanceof Element ? event.target : null);
    const nextBlockRoot = pointerElement?.closest<HTMLElement>(".cm-special-preview") ?? null;
    const block = nextBlockRoot ? renderedMarkdownWidgetRoots.get(nextBlockRoot) : null;
    if (nextBlockRoot && block && ["code", "html", "definition"].includes(block.kind)) {
      contentResolver ??= createRenderedPointerResolver(view, view.contentDOM, "content");
      if (nextBlockRoot !== blockRoot) {
        blockRoot = nextBlockRoot;
        blockResolver = createRenderedPointerResolver(view, nextBlockRoot, "root");
      }
      blockRange = { from: block.from, to: block.to };
      const blockPosition = blockResolver?.(clientX, clientY);
      if (blockPosition !== null && blockPosition !== undefined) {
        return { assoc: 1, pos: blockPosition };
      }
    }

    const nextLineRoot = pointerElement?.closest<HTMLElement>(".cm-line") ?? null;
    const excludedTarget = pointerElement?.closest(
      ".cm-special-preview, .cm-visual-table-widget, "
      + ".cm-footnote-definition-widget, .cm-reference-definition",
    );
    let pointerInsideCachedBlock = false;
    if (blockRange && nextLineRoot && !excludedTarget) {
      try {
        const linePosition = view.posAtDOM(nextLineRoot, 0);
        pointerInsideCachedBlock = linePosition >= blockRange.from
          && linePosition < blockRange.to;
      } catch {
        pointerInsideCachedBlock = false;
      }
    }
    if (pointerElement && nextBlockRoot !== blockRoot && !pointerInsideCachedBlock) {
      blockRoot = null;
      blockResolver = undefined;
      blockRange = null;
    }
    // Widget 展开后优先沿用当前块快照，避免旧整页布局覆盖精确字符位置。
    if (pointerInsideCachedBlock) {
      const cachedBlockPosition = blockResolver?.(clientX, clientY);
      if (cachedBlockPosition !== null && cachedBlockPosition !== undefined) {
        return { assoc: 1, pos: cachedBlockPosition };
      }
    }


    if (nextLineRoot && !excludedTarget) {
      if (nextLineRoot !== lineRoot) {
        lineRoot = nextLineRoot;
        lineResolver = createRenderedPointerResolver(view, nextLineRoot, "line");
      }
      const linePosition = lineResolver?.(clientX, clientY);
      if (linePosition !== null && linePosition !== undefined) {
        return { assoc: 1, pos: linePosition };
      }
    }

    const cachedBlockPosition = blockResolver?.(clientX, clientY);
    if (cachedBlockPosition !== null && cachedBlockPosition !== undefined) {
      return { assoc: 1, pos: cachedBlockPosition };
    }

    const cachedContentPosition = contentResolver?.(clientX, clientY);
    if (cachedContentPosition !== null && cachedContentPosition !== undefined) {
      return { assoc: 1, pos: cachedContentPosition };
    }

    const cachedLinePosition = lineResolver?.(clientX, clientY);
    if (cachedLinePosition !== null && cachedLinePosition !== undefined) {
      return { assoc: 1, pos: cachedLinePosition };
    }

    return view.posAndSideAtCoords({ x: clientX, y: clientY }, false);
  };
}

function createEditorMouseSelectionStyle(
  view: EditorView,
  event: MouseEvent,
): MouseSelectionStyle | null {
  if (
    event.button !== 0
    || event.detail > 1
    || event.ctrlKey
    || event.metaKey
  ) return null;
  const target = event.target instanceof Element ? event.target : null;
  const line = target?.closest<HTMLElement>(".cm-line") ?? null;
  const excludedTarget = target?.closest(
    ".cm-special-preview, .cm-visual-table-widget, "
    + ".cm-footnote-definition-widget, .cm-reference-definition",
  );
  if (!line || excludedTarget) return null;

  const gesture = editorLinePointerGesture;
  let resolvePointerPosition = createEditorLinePointerResolver(view, line);
  let start = resolvePointerPosition(event);
  let startSelection = view.state.selection;
  const startsInsidePrimarySelection = !startSelection.main.empty
    && start.pos >= startSelection.main.from
    && start.pos <= startSelection.main.to;
  let gestureDocument = view.state.doc;
  let handledMove = false;
  let lastPosition = start;
  let lastExtend = event.shiftKey;
  let lastMultiple = false;
  let cancelled = false;
  const ownerDocument = view.dom.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const timerWindow = ownerWindow ?? window;
  let pendingSelectionTimer: number | null = null;
  let pendingSelection: EditorSelection | null = null;

  const buildSelection = (
    current: EditorPointerPosition,
    extend: boolean,
    multiple: boolean,
  ): EditorSelection => {
    let range = EditorSelection.cursor(current.pos, current.assoc);
    if (start.pos !== current.pos && !extend) {
      range = EditorSelection.range(
        start.pos,
        current.pos,
        undefined,
        undefined,
        current.assoc,
      );
    }
    if (extend) {
      return startSelection.replaceRange(
        startSelection.main.extend(range.from, range.to, range.assoc),
      );
    }
    if (multiple) return startSelection.addRange(range);
    return EditorSelection.create([range]);
  };

  const clearPendingSelection = () => {
    if (pendingSelectionTimer !== null) timerWindow.clearTimeout(pendingSelectionTimer);
    pendingSelectionTimer = null;
    pendingSelection = null;
  };
  const sameDirectedSelection = (left: EditorSelection, right: EditorSelection) => (
    left.eq(right)
    && left.ranges.every((range, index) => (
      range.anchor === right.ranges[index]?.anchor
      && range.head === right.ranges[index]?.head
    ))
  );
  const scheduleSelection = (selection: EditorSelection) => {
    pendingSelection = selection;
    if (pendingSelectionTimer !== null) return;
    pendingSelectionTimer = timerWindow.setTimeout(() => {
      pendingSelectionTimer = null;
      const nextSelection = pendingSelection;
      pendingSelection = null;
      if (
        !nextSelection
        || cancelled
        || gesture !== editorLinePointerGesture
        || editorView.value !== view
        || view.state.doc !== gestureDocument
        || sameDirectedSelection(nextSelection, view.state.selection)
      ) return;
      view.dispatch({
        selection: nextSelection,
        userEvent: "select.pointer",
      });
    }, 0);
  };

  const detachFinalizer = () => {
    ownerDocument.removeEventListener("mousemove", handleFinalMove, true);
    ownerDocument.removeEventListener("mouseup", handleFinalUp, true);
    ownerWindow?.removeEventListener("blur", handleFinalBlur);
    if (stopEditorLinePointerFinalizer === cancelFinalizer) {
      stopEditorLinePointerFinalizer = null;
    }
  };
  const cancelFinalizer = () => {
    cancelled = true;
    clearPendingSelection();
    detachFinalizer();
  };
  const finishFinalizer = (selection: EditorSelection | null) => {
    clearPendingSelection();
    detachFinalizer();
    if (selection) scheduleSelection(selection);
  };
  const handleFinalMove = (moveEvent: MouseEvent) => {
    if ((moveEvent.buttons & 1) !== 0) return;
    finishFinalizer(pendingSelection);
  };
  const handleFinalBlur = () => finishFinalizer(pendingSelection);
  const handleFinalUp = (upEvent: MouseEvent) => {
    const movedSinceMouseDown = handledMove
      || upEvent.clientX !== event.clientX
      || upEvent.clientY !== event.clientY;
    const hasMouseUpCoordinates = upEvent.clientX !== 0 || upEvent.clientY !== 0;
    let finalSelection: EditorSelection | null = null;
    if (movedSinceMouseDown && (!handledMove || hasMouseUpCoordinates)) {
      const finalPosition = resolvePointerPosition(upEvent);
      if (
        finalPosition.pos !== lastPosition.pos
        || finalPosition.assoc !== lastPosition.assoc
      ) {
        finalSelection = buildSelection(finalPosition, lastExtend, lastMultiple);
      }
    }
    const selectionToCommit = finalSelection ?? pendingSelection
      ?? (handledMove ? view.state.selection : null);
    finishFinalizer(selectionToCommit);
  };

  if (!startsInsidePrimarySelection) {
    stopEditorLinePointerFinalizer = cancelFinalizer;
    ownerDocument.addEventListener("mousemove", handleFinalMove, true);
    ownerDocument.addEventListener("mouseup", handleFinalUp, true);
    ownerWindow?.addEventListener("blur", handleFinalBlur);
  }

  return {
    get(currentEvent, extend, multiple) {
      const current = resolvePointerPosition(currentEvent);
      lastPosition = current;
      lastExtend = extend;
      lastMultiple = multiple;
      const selection = buildSelection(current, extend, multiple);
      if (currentEvent.type !== "mousemove") return selection;
      handledMove = true;
      scheduleSelection(selection);
      return view.state.selection;
    },
    update(update) {
      if (!update.docChanged) return;
      start = {
        ...start,
        pos: update.changes.mapPos(start.pos, start.assoc),
      };
      lastPosition = {
        ...lastPosition,
        pos: update.changes.mapPos(lastPosition.pos, lastPosition.assoc),
      };
      startSelection = startSelection.map(update.changes);
      gestureDocument = update.state.doc;
      resolvePointerPosition = (currentEvent) => view.posAndSideAtCoords(
        { x: currentEvent.clientX, y: currentEvent.clientY },
        false,
      );
    },
  };
}

function handleEditorCapturedClick(event: Event) {
  if (!(event instanceof MouseEvent)) return;
  const view = editorView.value;
  if (!view) return;
  const pendingTripleClick = pendingRenderedTextTripleClicks.get(view);
  if (!pendingTripleClick) return;
  pendingRenderedTextTripleClicks.delete(view);
  if (props.readonly || pendingTripleClick.document !== view.state.doc) return;
  event.preventDefault();
  event.stopPropagation();
  view.dispatch({
    selection: pendingTripleClick.selection,
    effects: [
      EditorView.scrollIntoView(pendingTripleClick.selection.main.head),
      setRenderedTripleClickSelection.of(pendingTripleClick.selection),
    ],
    userEvent: "select.pointer",
  });
  queueMicrotask(() => view.focus());
}

function handleEditorCapturedDoubleClick(event: Event) {
  if (!(event instanceof MouseEvent)) return;
  const view = editorView.value;
  if (view) handleEditorDoubleClick(event, view);
}

function handleEditorDoubleClick(event: MouseEvent, view: EditorView): boolean {
  const pendingDoubleClick = pendingRenderedTextDoubleClicks.get(view);
  if (!pendingDoubleClick) return false;
  pendingRenderedTextDoubleClicks.delete(view);
  if (props.readonly || pendingDoubleClick.document !== view.state.doc) return false;
  event.preventDefault();
  event.stopPropagation();
  view.dispatch({
    selection: pendingDoubleClick.selection,
    effects: EditorView.scrollIntoView(pendingDoubleClick.selection.main.head),
    userEvent: "select.pointer",
  });
  queueMicrotask(() => view.focus());
  return true;
}


function handleEditorMouseDown(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0) return false;
  resetPointerGestureTracking();
  const target = event.target instanceof Element ? event.target : null;
  const recentRenderedTextClick = recentRenderedTextClicks.get(view);
  if (
    event.detail === 2
    && recentRenderedTextClick
  ) {
    recentRenderedTextClicks.delete(view);
    pendingRenderedTextDoubleClicks.delete(view);
    if (!props.readonly && recentRenderedTextClick.document === view.state.doc) {
      const line = target?.closest<HTMLElement>(".cm-line") ?? null;
      const resolvePointerPosition = line
        ? createEditorLinePointerResolver(view, line)
        : null;
      let startWord: { from: number; to: number } = recentRenderedTextClick;
      if (!recentRenderedTextClick.useCachedWordOnSecondPress) {
        const position = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });
        if (position !== null) {
          const clamped = clampOffset(position, view.state.doc.length);
          startWord = view.state.wordAt(clamped) ?? { from: clamped, to: clamped };
        }
      }
      beginRenderedWordPointerSelection(
        view,
        event,
        startWord,
        resolvePointerPosition
          ? (pointerEvent) => resolvePointerPosition(pointerEvent).pos
          : undefined,
      );
      return true;
    }
  } else if (event.detail <= 1) {
    recentRenderedTextClicks.delete(view);
    pendingRenderedTextDoubleClicks.delete(view);
    pendingRenderedTextTripleClicks.delete(view);
  }
  const recentImageClick = recentImageClicks.get(view);
  if (event.detail >= 2 && recentImageClick) {
    recentImageClicks.delete(view);
    if (!props.readonly && recentImageClick.document === view.state.doc) {
      event.preventDefault();
      event.stopPropagation();
      revealPreviewRange(view, recentImageClick.from, recentImageClick.to);
      return true;
    }
  } else if (event.detail <= 1) {
    recentImageClicks.delete(view);
  }
  if (event.detail >= 3 && selectEditorLineAtPointer(event, view, target)) {
    return true;
  }
  if (event.detail === 2 && selectEditorWordAtPointer(event, view, target)) {
    return true;
  }
  const horizontalRule = target?.closest<HTMLElement>(
    ".cm-horizontal-rule:not(.cm-active-markdown-line)",
  );
  if (horizontalRule && !props.readonly) {
    const position = view.posAtDOM(horizontalRule, 0);
    const block = findAtomicMarkdownBlockAt(view.state.doc.toString(), position);
    if (block?.kind === "horizontal-rule") {
      event.preventDefault();
      event.stopPropagation();
      queueMicrotask(() => focusAtomicMarkdownBlock(view, block, horizontalRule));
      return true;
    }
  }
  clearFocusedAtomicBlock();
  if (!event.ctrlKey && !event.metaKey) {
    const line = target?.closest<HTMLElement>(".cm-line") ?? null;
    const excludedTarget = target?.closest(
      ".cm-special-preview, .cm-visual-table-widget, "
      + ".cm-footnote-definition-widget, .cm-reference-definition",
    );
    if (line && !excludedTarget) {
      const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (event.detail === 1 && !event.shiftKey && position !== null) {
        const word = view.state.wordAt(position);
        if (word) {
          const useCachedWordOnSecondPress = Boolean(target?.closest(
            ".cm-rendered-strong, .cm-rendered-emphasis, "
            + ".cm-rendered-strikethrough, .cm-rendered-highlight, "
            + ".cm-rendered-subscript, .cm-rendered-superscript, "
            + ".cm-rendered-inline-code, .cm-rendered-link",
          ));
          recentRenderedTextClicks.set(view, {
            document: view.state.doc,
            from: word.from,
            to: word.to,
            useCachedWordOnSecondPress,
          });
        }
      }
    }
    return false;
  }
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position === null) return false;
  const source = view.state.doc.toString();
  const link = findMarkdownAutoLinkAtSelection(view.state, position, position)
    ?? findMarkdownLinkAtCursor(
      source,
      position,
      position,
      props.settings.extensions.autoLinks,
    );
  if (!link) return false;
  event.preventDefault();
  emit("openLinkHref", link.href);
  return true;
}

function openCurrentLink() {
  const view = editorView.value;
  if (!view) return;
  const selection = view.state.selection.main;
  const source = view.state.doc.toString();
  const link = findMarkdownAutoLinkAtSelection(view.state, selection.from, selection.to)
    ?? findMarkdownLinkAtCursor(
      source,
      selection.from,
      selection.to,
      props.settings.extensions.autoLinks,
    );
  if (!link) {
    emit("missingLink");
    return;
  }
  emit("openLinkHref", link.href);
}

function findMarkdownAutoLinkAtSelection(
  state: EditorState,
  selectionStart: number,
  selectionEnd: number,
): MarkdownAutoLinkMatch | null {
  if (!props.settings.extensions.autoLinks) return null;
  const source = state.doc.toString();
  const from = Math.min(selectionStart, selectionEnd);
  const to = Math.max(selectionStart, selectionEnd);
  const lineStart = source.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const nextLineBreak = source.indexOf("\n", to);
  const lineEnd = nextLineBreak < 0 ? source.length : nextLineBreak;
  if (to > lineEnd) return null;

  const cachedDocument = getCachedPreviewDocument(source);
  const protectedBlocks = cachedDocument.markdownBlocks
    .filter((block) => ["code", "math", "table", "html", "frontmatter"].includes(block.type))
    .map((block) => ({ from: block.start, to: block.end }));
  const protectedRanges = collectPlainTextProtectedRanges(state, protectedBlocks, []).autoLink;

  for (const match of getMarkdownAutoLinkMatches(source.slice(lineStart, lineEnd))) {
    const start = lineStart + match.start;
    const end = lineStart + match.end;
    if (protectedRanges.some((range) => rangesIntersect(start, end, range.from, range.to))) continue;
    const inside = from === to
      ? from >= start && from <= end
      : from >= start && to <= end;
    if (inside) {
      return {
        ...match,
        start,
        end,
        textStart: lineStart + match.textStart,
        textEnd: lineStart + match.textEnd,
      };
    }
  }
  return null;
}

function openEditorContextMenu(event: MouseEvent, view: EditorView): boolean {
  if (props.readonly) return false;
  event.preventDefault();
  const targetPosition = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (targetPosition !== null) selectContextMenuTarget(view, targetPosition);
  const target = event.target instanceof Element ? event.target : null;
  const rawSourceTarget = Boolean(target?.closest(
    ".cm-raw-block-code, .cm-raw-block-math, .cm-raw-block-html",
  ));
  openEditorContextMenuAt(event.clientX, event.clientY, view, targetPosition, rawSourceTarget);
  return true;
}

function openEditorContextMenuAtCursor(view: EditorView) {
  const coordinates = view.coordsAtPos(view.state.selection.main.head);
  const bounds = surfaceRef.value?.getBoundingClientRect();
  openEditorContextMenuAt(
    coordinates?.left ?? (bounds?.left ?? 0) + 16,
    coordinates?.bottom ?? (bounds?.top ?? 0) + 16,
    view,
    view.state.selection.main.head,
    true,
  );
}

function openEditorContextMenuAt(
  x: number,
  y: number,
  view: EditorView,
  targetPosition: number | null,
  allowRawBlockTools: boolean,
) {
  const rawBlock = allowRawBlockTools && !props.settings.sourceMode
    ? getRawBlockContext(view, targetPosition)
    : null;
  const items = buildEditorContextMenuItems(Boolean(rawBlock));
  const position = clampEditorContextMenuPosition(
    x,
    y,
    window.innerWidth,
    window.innerHeight,
    items.length,
  );
  contextMenuReturnFocus = view.contentDOM;
  contextMenu.value = { items, rawBlock, ...position };
  nextTick(() => getEditorContextMenuItems()[0]?.focus());
}

function selectContextMenuTarget(view: EditorView, targetPosition: number) {
  const selection = view.state.selection.main;
  if (targetPosition >= selection.from && targetPosition <= selection.to) return;
  view.dispatch({ selection: { anchor: targetPosition } });
}

function getRawBlockContext(view: EditorView, targetPosition: number | null): RawBlockSelection | null {
  const selection = view.state.selection.main;
  const target = targetPosition ?? selection.head;
  const useSelection = target >= selection.from && target <= selection.to;
  const rawBlock = getRawBlockSelection({
    value: view.state.doc.toString(),
    selectionStart: useSelection ? selection.from : target,
    selectionEnd: useSelection ? selection.to : target,
    selectionHead: useSelection ? selection.head : target,
  });
  return rawBlock?.insideContent ? rawBlock : null;
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

function handleWindowClick(event: MouseEvent) {
  closeEditorContextMenu(false);
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".cm-atomic-block-selected")) {
    clearFocusedAtomicBlock();
  }
}

function runEditorContextMenuCommand(command: EditorContextMenuCommand) {
  const rawBlock = contextMenu.value?.rawBlock ?? null;
  closeEditorContextMenu(false);
  if (isRawBlockContextMenuCommand(command)) {
    runRawBlockContextMenuCommand(command, rawBlock);
    return;
  }
  runCommand(command);
}

function contextActionIcon(command: EditorContextMenuCommand): unknown {
  return contextActionIcons[command] ?? Copy;
}

function runRawBlockContextMenuCommand(
  command: EditorContextMenuCommand,
  rawBlock: RawBlockSelection | null,
) {
  const view = editorView.value;
  if (!view || !rawBlock || !isRawBlockContextMenuCommand(command)) return;
  if (command === "copyRawBlockContent") {
    void copyRawBlockContent(rawBlock.content);
    return;
  }
  autoIndentRawBlock(
    view,
    rawBlock,
    command === "indentRawBlockAll" ? "all" : "selection",
  );
}

function autoIndentRawBlock(
  view: EditorView,
  rawBlock: RawBlockSelection,
  scope: "selection" | "all",
) {
  if (rawBlock.empty) {
    restoreEditorFocus(view);
    return;
  }
  let from = scope === "all" ? rawBlock.contentStart : rawBlock.selectionStart;
  let to = scope === "all" ? rawBlock.contentEnd : rawBlock.selectionEnd;
  from = Math.max(rawBlock.contentStart, Math.min(from, rawBlock.contentEnd));
  to = Math.max(from, Math.min(to, rawBlock.contentEnd));
  if (to > from && view.state.doc.lineAt(to).from === to) to -= 1;

  const changes = indentRange(view.state, from, to);
  if (changes.empty) {
    restoreEditorFocus(view);
    return;
  }
  view.dispatch({
    changes,
    selection: view.state.selection.map(changes),
    annotations: [
      Transaction.userEvent.of("input.indent"),
      isolateHistory.of("full"),
    ],
  });
  restoreEditorFocus(view);
}

async function copyRawBlockContent(content: string) {
  try {
    await writeClipboardFormats(content, escapeRawBlockContentAsPre(content));
  } catch {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      document.execCommand("copy");
    }
  }
}

function handleCopy(event: ClipboardEvent, view: EditorView): boolean {
  const projection = getClipboardSelectionProjection(view);
  if (!projection.source || !event.clipboardData) return false;
  if (props.settings.copyMarkdownAsPlainText) {
    event.clipboardData.setData("text/plain", projection.markdown);
  } else {
    const html = renderClipboardSelectionHtml(projection.markdown, view.state.doc.toString());
    event.clipboardData.setData("text/plain", projection.plainText);
    event.clipboardData.setData("text/html", html);
  }
  event.preventDefault();
  return true;
}

function handlePaste(event: ClipboardEvent, view: EditorView): boolean {
  if (props.readonly) return false;
  const mediaFiles = getSupportedMediaFiles(event.clipboardData?.files ?? []);
  if (mediaFiles.length > 0) {
    event.preventDefault();
    mediaFiles.forEach(({ file, kind }, index) => {
      emitMediaFile(file, "paste", kind, index > 0 ? "\n\n" : "");
    });
    return true;
  }

  const text = event.clipboardData?.getData("text/plain") ?? "";
  const html = event.clipboardData?.getData("text/html") ?? "";
  if (!text && !html) return false;
  const result = pasteMarkdownContent(currentTextState(view), { text, html });
  if (!result) return false;
  event.preventDefault();
  dispatchTextEdit(result, view, "paste");
  return true;
}

function handleDrop(event: DragEvent, view: EditorView): boolean {
  if (props.readonly) return false;
  const transfer = event.dataTransfer;
  const transferredFiles = Array.from(transfer?.files ?? []);
  const mediaFiles = getSupportedMediaFiles(transferredFiles);
  if (mediaFiles.length > 0) {
    event.preventDefault();
    event.stopPropagation();
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position !== null) view.dispatch({ selection: { anchor: position } });
    mediaFiles.forEach(({ file, kind }, index) => {
      emitMediaFile(file, "drop", kind, index > 0 ? "\n\n" : "");
    });
    return true;
  }
  if (transferredFiles.length > 0 || !transfer) return false;

  const dropped = getDroppedImageSource({
    html: transfer.getData("text/html"),
    uriList: transfer.getData("text/uri-list"),
    text: transfer.getData("text/plain"),
  });
  if (!dropped) return false;

  event.preventDefault();
  event.stopPropagation();
  const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (position !== null) view.dispatch({ selection: { anchor: position } });
  dispatchTextEdit(
    insertMarkdownImageSelection(currentTextState(view), dropped.alt, dropped.source),
    view,
  );
  return true;
}

function emitMediaFile(
  file: File,
  source: "paste" | "drop",
  kind: LocalMediaKind,
  prefix: string,
) {
  const uploadsImage = kind === "image" && Boolean(props.settings.uploadUrl.trim());
  const needsDocumentSave = !props.filePath
    && props.settings.imageInsertAction !== "none"
    && !uploadsImage;
  const placeholder = needsDocumentSave ? undefined : reserveImageInsertion() ?? undefined;
  if (!needsDocumentSave && !placeholder) return;
  emit("imageData", {
    name: file.name || `${source}-${Date.now()}.${kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3"}`,
    file,
    placeholder,
    kind,
    prefix,
  });
}

function getSupportedMediaFiles(files: ArrayLike<File> | Iterable<File>) {
  return Array.from(files).flatMap((file) => {
    const kind = getLocalMediaKind(file.name, file.type);
    return kind ? [{ file, kind }] : [];
  });
}

async function copyMarkdownSource() {
  const view = editorView.value;
  if (!view) return;
  const projection = getClipboardSelectionProjection(view);
  if (!projection.source) return;
  try {
    await navigator.clipboard.writeText(projection.markdown);
  } catch {
    document.execCommand("copy");
  }
}

async function copyPlainTextSource() {
  const view = editorView.value;
  if (!view) return;
  const projection = getClipboardSelectionProjection(view);
  if (!projection.source) return;
  try {
    await navigator.clipboard.writeText(projection.plainText);
  } catch {
    document.execCommand("copy");
  }
}

async function copySemanticSelection() {
  const view = editorView.value;
  if (!view) return;
  const projection = getClipboardSelectionProjection(view);
  if (!projection.source) return;
  const html = renderClipboardSelectionHtml(projection.markdown, view.state.doc.toString());
  try {
    await writeClipboardFormats(projection.plainText, html);
  } catch {
    document.execCommand("copy");
  }
}

async function copyHtmlSource() {
  const view = editorView.value;
  if (!view) return;
  const projection = getClipboardSelectionProjection(view);
  if (!projection.source) return;
  const html = renderClipboardSelectionHtml(projection.markdown, view.state.doc.toString());
  try {
    await writeClipboardFormats(html, wrapHtmlSourceForClipboard(html));
  } catch {
    document.execCommand("copy");
  }
}

async function writeClipboardFormats(plainText: string, html: string) {
  const ClipboardItemCtor = globalThis.ClipboardItem;
  if (!ClipboardItemCtor || !navigator.clipboard.write) {
    await navigator.clipboard.writeText(plainText);
    return;
  }
  await navigator.clipboard.write([
    new ClipboardItemCtor({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([plainText], { type: "text/plain" }),
    }),
  ]);
}

function wrapHtmlSourceForClipboard(html: string): string {
  const pre = document.createElement("pre");
  pre.textContent = html;
  return pre.outerHTML;
}

function getClipboardSelectionProjection(view: EditorView) {
  const selection = view.state.selection.main;
  return projectMarkdownSelectionSemantics(
    view.state.doc.toString(),
    selection.from,
    selection.to,
    {
      preserveInlineSemantics: !props.settings.sourceMode,
      includeHtml: props.settings.extensions.html,
      includeMarks: hasInlineMarkExtensions(props.settings.extensions),
      includeHighlight: isHighlightExtensionEnabled(props.settings.extensions),
      includeSuperscript: isSuperscriptExtensionEnabled(props.settings.extensions),
      includeSubscript: isSubscriptExtensionEnabled(props.settings.extensions),
    },
  );
}

function renderClipboardSelectionHtml(markdown: string, documentSource: string): string {
  return sanitizeMarkdownHtml(renderMarkdown(markdown, {
    settings: props.settings,
    documentSource,
    basePath: props.filePath,
  }).trim());
}

async function pasteFromClipboard(plainText: boolean) {
  const view = editorView.value;
  if (!view) return;
  try {
    const payload = plainText ? { text: await navigator.clipboard.readText() } : await readClipboardTextPayload();
    const result = plainText
      ? pastePlainMarkdownText(currentTextState(view), payload.text ?? "")
      : pasteMarkdownContent(currentTextState(view), payload);
    if (result) dispatchTextEdit(result, view, "paste");
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

function getDocumentLineBreak(value: string): string {
  if (value.includes("\r\n")) return "\r\n";
  if (value.includes("\r")) return "\r";
  return "\n";
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.trunc(offset), length));
}
</script>

<style scoped>
.continuous-editor {
  --markdown-text: #333333;
  --markdown-muted: #777777;
  --markdown-border: #dfe2e5;
  --markdown-heading-char: #dddddd;
  --markdown-heading-rule: #eeeeee;
  --markdown-horizontal-rule: #e7e7e7;
  --markdown-link: #4183c4;
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  padding: 0;
  color: var(--markdown-text);
  text-rendering: auto;
}

:global(:root[data-theme="dark"] .continuous-editor),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor) {
  --markdown-text: var(--text-main);
  --markdown-muted: var(--muted);
  --markdown-border: var(--border);
  --markdown-heading-char: var(--border-strong);
  --markdown-heading-rule: var(--heading-rule);
  --markdown-horizontal-rule: var(--heading-rule);
  --markdown-link: var(--accent-strong);
}

.continuous-editor-host {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--reading-max-width);
  min-height: calc(100vh - 140px);
  margin: 0 auto;
}

:deep(.cm-editor) {
  box-sizing: border-box;
  min-height: calc(100vh - 140px);
  background: transparent;
  color: var(--markdown-text);
  font-size: var(--editor-font-size);
}

:deep(.cm-editor.cm-focused) {
  outline: none;
}

:deep(.cm-scroller) {
  overflow: visible;
  font-family: "Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, "Segoe UI Emoji", "SF Pro", sans-serif;
  line-height: 1.6;
  tab-size: var(--editor-tab-size, 2);
}

.is-source :deep(.cm-scroller) {
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  line-height: 1.7;
}

:deep(.cm-content) {
  box-sizing: border-box;
  min-height: calc(100vh - 140px);
  padding: 30px 30px 100px;
  caret-color: var(--markdown-text);
}

:deep(.cm-cursor) {
  border-left-color: var(--markdown-text);
}

:deep(.cm-line) {
  min-height: 1.6em;
  border: 0;
  padding: 0;
  letter-spacing: 0;
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
  min-height: 0.8em;
  height: 0.8em;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0.8em;
}

:deep(.cm-line.cm-block-gap.cm-block-gap-extra:not(.cm-active-markdown-line)) {
  min-height: 1px;
  height: 1px;
  line-height: 1px;
}

:deep(.cm-line.cm-spacing-collapsed-gap:not(.cm-active-markdown-line)) {
  min-height: 0;
  height: 0;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0;
}

:deep(.cm-line.cm-heading-gap.cm-active-markdown-line) {
  min-height: 1px;
  height: 1px;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 1px;
}

:deep(.cm-line.cm-block-gap.cm-active-markdown-line:not(.cm-block-gap-extra)) {
  min-height: 0.8em;
  height: 0.8em;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0.8em;
}

:deep(.cm-line.cm-block-gap.cm-block-gap-extra.cm-active-markdown-line) {
  min-height: 1px;
  height: 1px;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 1px;
}

:deep(.cm-line.cm-spacing-collapsed-gap.cm-active-markdown-line) {
  min-height: 0;
  height: 0;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0;
}

:deep(.cm-line.cm-block-gap:not(.cm-active-markdown-line):has(+ .cm-horizontal-rule)),
:deep(.cm-horizontal-rule + .cm-line.cm-block-gap:not(.cm-active-markdown-line)),
:deep(.cm-line.cm-blockquote-gap:not(.cm-active-markdown-line):has(+ .cm-horizontal-rule)),
:deep(.cm-horizontal-rule + .cm-line.cm-blockquote-gap:not(.cm-active-markdown-line)) {
  min-height: 0;
  height: 0;
  line-height: 0;
}

:deep(.cm-line.cm-block-gap.cm-active-markdown-line:has(+ .cm-horizontal-rule)),
:deep(.cm-horizontal-rule + .cm-line.cm-block-gap.cm-active-markdown-line),
:deep(.cm-line.cm-blockquote-gap.cm-active-markdown-line:has(+ .cm-horizontal-rule)),
:deep(.cm-horizontal-rule + .cm-line.cm-blockquote-gap.cm-active-markdown-line) {
  min-height: 0;
  height: 0;
  line-height: 0;
}

:deep(.cm-blockquote-margin-after:has(+ .cm-horizontal-rule)) {
  margin-bottom: 0;
}

:deep(.cm-horizontal-rule + .cm-blockquote-margin-before) {
  margin-top: 0;
}

:deep(.cm-line:not(.cm-raw-block):not(.cm-active-markdown-line):has(+ .cm-active-math-preview)) {
  min-height: 0;
  height: 0;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0;
}

:deep(.cm-line:not(.cm-raw-block).cm-active-markdown-line:has(+ .cm-active-math-preview)) {
  min-height: 0;
  height: 0;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0;
}

:deep(.cm-setext-marker:not(.cm-active-markdown-line)) {
  min-height: 0;
  height: 0;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0;
}

:deep(.cm-setext-marker.cm-active-markdown-line) {
  color: var(--muted);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
}

:deep(.cm-abbreviation-definition-hidden) {
  min-height: 0;
  height: 0;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0;
}

:deep(.cm-reference-definition) {
  box-sizing: border-box;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.35rem 0.65rem;
  min-width: 0;
  width: 100%;
  padding: 0.2rem 0.5rem;
  color: var(--text);
  line-height: 1.65;
}

:deep(.cm-reference-definition-field) {
  min-width: 0;
  overflow-wrap: anywhere;
}

:deep(.cm-reference-definition-field[role="button"]) {
  cursor: text;
}

:deep(.cm-reference-definition-field[role="button"]:hover) {
  color: var(--accent-strong);
}

:deep(.cm-reference-definition-name) {
  flex: 0 1 auto;
  font-weight: 600;
}

:deep(.cm-reference-definition-url) {
  flex: 1 1 18rem;
  color: var(--accent-strong);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.92em;
}

:deep(.cm-reference-definition-title) {
  flex: 1 1 10rem;
  color: var(--muted);
}

:deep(.cm-reference-definition-separator) {
  align-self: stretch;
  width: 1px;
  min-height: 1.1em;
  background: color-mix(in srgb, var(--border) 58%, transparent);
}

:deep(.cm-footnote-definition-widget) {
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: fit-content(30%) 1px minmax(0, 1fr) auto;
  align-items: start;
  gap: 0 0.65rem;
  min-width: 0;
  width: 100%;
  margin: 0;
  padding: calc(1.6em + 1px) 0.5rem 0.2rem;
  color: var(--muted);
  font-size: 0.9em;
  line-height: 1.65;
}

:deep(.cm-footnote-definition-widget::before) {
  position: absolute;
  top: 1em;
  right: 0;
  left: 0;
  height: 1px;
  background: var(--heading-rule);
  content: "";
}

:deep(.cm-footnote-definition-field) {
  min-width: 0;
  overflow-wrap: anywhere;
}

:deep(.cm-footnote-definition-field[role="button"]) {
  cursor: text;
}

:deep(.cm-footnote-definition-field[role="button"]:hover) {
  color: var(--accent-strong);
}

:deep(.cm-footnote-definition-label) {
  color: var(--accent-strong);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.92em;
  font-weight: 600;
}

:deep(.cm-footnote-definition-separator) {
  align-self: stretch;
  width: 1px;
  min-height: 1.25em;
  background: color-mix(in srgb, var(--heading-rule) 72%, transparent);
}

:deep(.cm-footnote-definition-content) {
  min-height: 1.65em;
  color: var(--text-main);
}

:deep(.cm-footnote-definition-content > :first-child) {
  margin-top: 0;
}

:deep(.cm-footnote-definition-content > :last-child) {
  margin-bottom: 0;
}

:deep(.cm-footnote-definition-content p) {
  margin: 0;
}

:deep(.cm-footnote-definition-content p + p) {
  margin-top: 0.55em;
}

:deep(.cm-footnote-definition-widget > .cm-footnote-backlinks) {
  align-self: start;
  margin-top: 0.12em;
  margin-inline-start: 0;
}

:deep(.cm-definition-following-gap) {
  padding-bottom: calc(0.2rem + 0.8em);
}

:deep(.cm-activeLine) {
  background: transparent;
}

.is-source :deep(.cm-line.cm-activeLine),
.is-source :deep(.cm-line.cm-active-markdown-line) {
  background: rgba(204, 204, 204, 0.2) !important;
}

.is-source :deep(.cm-cursor) {
  border-right: 0;
  border-left: 3px solid #e4629a;
}

:deep(.cm-find-match) {
  border-radius: 2px;
  background: color-mix(in srgb, #facc15 38%, transparent);
}

:deep(.cm-heading.cm-setext-heading-line) {
  padding-top: 0;
  padding-bottom: 0;
}

:deep(.cm-heading.cm-setext-heading-first) {
  padding-top: 1rem;
}

:deep(.cm-heading.cm-setext-heading-last) {
  --heading-block-padding-bottom: 1rem;
  padding-bottom: var(--heading-block-padding-bottom);
}

:deep(.cm-find-match-active) {
  box-shadow: inset 0 -2px 0 var(--accent-strong);
}

:deep(.cm-heading) {
  --heading-block-padding-bottom: 1rem;
  --heading-rule-text-gap: 0.125em;
  --heading-rule-bottom-offset: calc(var(--heading-block-padding-bottom) - var(--heading-rule-text-gap));
  position: relative;
  color: var(--markdown-text);
  font-weight: 700;
  padding: 1rem 0 var(--heading-block-padding-bottom);
}

:deep(.cm-heading-3.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before,
:deep(.cm-heading-4.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before,
:deep(.cm-heading-5.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before,
:deep(.cm-heading-6.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before {
  position: absolute;
  inset-inline-start: -1.5625rem;
  top: calc(1rem + var(--heading-focus-label-offset));
  border: 1px solid currentColor;
  border-radius: 3px;
  color: var(--markdown-heading-char);
  font-family: "Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 9px;
  font-weight: 400;
  line-height: normal;
  padding: 0 2px;
  pointer-events: none;
}

:deep(.cm-heading-3.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation)) {
  --heading-focus-label-offset: 0.375rem;
}

:deep(.cm-heading-4.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation)),
:deep(.cm-heading-5.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation)),
:deep(.cm-heading-6.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation)) {
  --heading-focus-label-offset: 0.285714286rem;
}

:deep(.cm-heading.cm-active-markdown-line.cm-spacing-collapse-before)::before {
  top: var(--heading-focus-label-offset);
}

:deep(.cm-heading-3.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before {
  content: "h3";
}

:deep(.cm-heading-4.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before {
  content: "h4";
}

:deep(.cm-heading-5.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before {
  content: "h5";
}

:deep(.cm-heading-6.cm-active-markdown-line:not(.cm-blockquote):not(.cm-list-continuation))::before {
  content: "h6";
}

:deep(.cm-heading.cm-spacing-collapse-before) {
  padding-top: 0;
}

:deep(.cm-heading.cm-spacing-collapse-after) {
  --heading-block-padding-bottom: var(--heading-rule-text-gap);
  --heading-rule-bottom-offset: 0;
  padding-bottom: var(--heading-block-padding-bottom);
}

:deep(.cm-blockquote-margin-before.cm-spacing-collapse-before),
:deep(.cm-list-block-margin-before.cm-spacing-collapse-before),
:deep(.cm-document-first-list.cm-spacing-collapse-before) {
  margin-top: 0;
}

:deep(.cm-blockquote-margin-after.cm-spacing-collapse-after) {
  margin-bottom: 0;
}

:deep(.cm-heading + .cm-heading) {
  padding-top: 0;
}

:deep(.cm-heading + .cm-heading-gap + .cm-heading),
:deep(.cm-setext-marker + .cm-heading-gap + .cm-heading) {
  padding-top: 0;
}


:deep(.cm-heading span:not(.cm-rendered-strikethrough):not(.cm-rendered-link)) {
  text-decoration: none;
}
:deep(.cm-rendered-strong) {
  font-weight: 700;
}

:deep(.cm-rendered-emphasis) {
  font-style: italic;
}

:deep(.cm-rendered-strikethrough) {
  text-decoration: line-through;
}

:deep(.cm-rendered-highlight) {
  background: #ffff00;
  color: #000000;
}

:deep(.cm-rendered-subscript),
:deep(.cm-rendered-superscript) {
  position: relative;
  font-size: 0.78em;
  line-height: 0;
}

:deep(.cm-rendered-subscript) {
  bottom: -0.24em;
}

:deep(.cm-rendered-superscript) {
  top: -0.38em;
}

:deep(.cm-rendered-inline-code) {
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f3f4f4;
  color: inherit;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  padding: 0 2px;
}

:deep(.cm-heading .cm-rendered-inline-code) {
  font-size: inherit;
}

:global(:root[data-theme="dark"] .continuous-editor .cm-rendered-inline-code),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-rendered-inline-code) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}

:deep(.cm-rendered-link) {
  color: var(--markdown-link);
  text-decoration: underline;
}

:deep(.cm-rendered-inline-link a),
:deep(.cm-rendered-inline-html a),
:deep(.cm-special-preview-html a) {
  color: var(--markdown-link);
  text-decoration: underline;
}

:deep(.cm-rendered-abbreviation) {
  cursor: help;
  text-decoration: underline dotted;
}

:deep(.cm-rendered-abbreviation[role="button"]) {
  cursor: text;
}

:deep(.cm-rendered-emoji),
:deep(.cm-rendered-smart-punctuation) {
  display: inline;
  color: inherit;
  font: inherit;
}

:deep(.cm-rendered-emoji[role="button"]),
:deep(.cm-rendered-smart-punctuation[role="button"]) {
  cursor: text;
}

:deep(.cm-rendered-inline-widget) {
  display: inline-block;
  max-width: 100%;
  vertical-align: middle;
}

:deep(.cm-rendered-inline-widget[role="button"]) {
  cursor: pointer;
}

:deep(.cm-rendered-inline-image a),
:deep(.cm-rendered-inline-image img) {
  display: inline-block;
  max-width: 100%;
  height: auto;
  margin: 0;
  vertical-align: middle;
}

:deep(.cm-rendered-inline-image img) {
  border-radius: 0;
}

:deep(.cm-rendered-inline-html img) {
  display: inline-block;
  max-width: 100%;
  border-radius: 0;
  margin: 0;
  vertical-align: middle;
}

:deep(.cm-rendered-inline-html img:not([height])) {
  height: auto;
}

:deep(.cm-rendered-inline-math) {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  font-size: 0.95em;
  vertical-align: -0.08em;
}

:deep(.cm-rendered-inline-math .math-inline) {
  display: inline-block;
}

:deep(.cm-rendered-inline-html kbd),
:deep(.cm-special-preview-html kbd) {
  border: 1px solid #adb3b9;
  border-radius: 3px;
  background: #ffffff;
  box-shadow: 0 1px 0 rgba(12, 13, 14, 0.2), 0 0 0 2px #ffffff inset;
  color: #242729;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.8em;
  margin: 0 0.1em;
  padding: 0.1em 0.6em;
  white-space: nowrap;
  vertical-align: middle;
}

:deep(.cm-rendered-inline-html code),
:deep(.cm-rendered-inline-html tt),
:deep(.cm-special-preview-html code),
:deep(.cm-special-preview-html tt) {
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f3f4f4;
  color: inherit;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  padding: 0 2px;
}

:global(:root[data-theme="dark"] .continuous-editor .cm-rendered-inline-html kbd),
:global(:root[data-theme="dark"] .continuous-editor .cm-special-preview-html kbd),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-rendered-inline-html kbd),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-special-preview-html kbd) {
  border-color: var(--border-strong);
  background: var(--panel-subtle);
  box-shadow: none;
  color: var(--text-main);
}

:global(:root[data-theme="dark"] .continuous-editor .cm-rendered-inline-html code),
:global(:root[data-theme="dark"] .continuous-editor .cm-rendered-inline-html tt),
:global(:root[data-theme="dark"] .continuous-editor .cm-special-preview-html code),
:global(:root[data-theme="dark"] .continuous-editor .cm-special-preview-html tt),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-rendered-inline-html code),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-rendered-inline-html tt),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-special-preview-html code),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-special-preview-html tt) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}

:deep(.md-raw-html-src-content) {
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--panel-subtle);
  color: var(--text-main);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.88em;
  line-height: 1.55;
  margin: 0;
  overflow-wrap: anywhere;
  padding: 10px 12px;
  white-space: pre-wrap;
}

:deep(.cm-rendered-footnote-reference) {
  display: initial;
  border-radius: 4px;
  background: rgba(238, 238, 238, 0.7);
  color: #555555;
  line-height: 1;
  margin-inline: 0;
  padding: 2px 4px;
  vertical-align: super;
}

:deep(.cm-rendered-footnote-reference[role="button"]) {
  cursor: pointer;
}

:global(:root[data-theme="dark"] .continuous-editor .cm-rendered-footnote-reference),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-rendered-footnote-reference) {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-main);
}

:deep(.cm-rendered-footnote-reference[data-footnote-missing="true"]) {
  outline: 1px dashed color-mix(in srgb, var(--muted) 65%, transparent);
  outline-offset: 1px;
}

:deep(.cm-footnote-backlinks) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-inline-start: 0.45em;
  vertical-align: baseline;
}

:deep(.cm-footnote-backlink) {
  width: 1.4em;
  height: 1.4em;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  line-height: 1;
  padding: 0;
}

:deep(.cm-footnote-backlink:hover) {
  background: var(--panel-subtle);
}

:global(.cm-footnote-tooltip) {
  position: fixed;
  z-index: 1400;
  display: grid;
  max-width: min(360px, calc(100vw - 16px));
  border: 1px solid rgba(30, 41, 59, 0.16);
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
  color: #20242a;
  font-size: 13px;
  gap: 8px;
  line-height: 1.55;
  padding: 9px 11px;
}

:global(.cm-footnote-tooltip-content p + p) {
  margin-top: 0.45em;
}

:global(.cm-footnote-tooltip-content) {
  min-width: 0;
  overflow-wrap: anywhere;
}

:global(.cm-footnote-tooltip-content p) {
  margin: 0;
}

:global(.cm-footnote-tooltip-content code) {
  border-radius: 3px;
  background: #f0f2f4;
  padding: 1px 3px;
}

:global(.cm-footnote-tooltip-content a) {
  color: #2878bd;
}

:global(.cm-footnote-create-definition) {
  justify-self: start;
  border: 1px solid rgba(40, 120, 189, 0.35);
  border-radius: 4px;
  background: #f7fbff;
  color: #246da8;
  cursor: pointer;
  font: inherit;
  padding: 3px 7px;
}

:global(.cm-footnote-create-definition:hover) {
  background: #edf6fd;
}

:global([data-theme="dark"] .cm-footnote-tooltip) {
  border-color: rgba(255, 255, 255, 0.16);
  background: #20262e;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  color: #e7edf4;
}

:global([data-theme="dark"] .cm-footnote-tooltip-content code) {
  background: #2b333d;
}

:deep(.cm-heading-1),
:deep(.cm-heading-2) {
  position: relative;
}

:deep(.cm-heading-1:not(.cm-setext-heading-line))::after,
:deep(.cm-heading-2:not(.cm-setext-heading-line))::after,
:deep(.cm-setext-heading-last)::after {
  position: absolute;
  inset-inline: 0;
  inset-inline-start: var(--container-content-start, 0);
  inset-inline-end: var(--container-content-end, 0);
  bottom: var(--heading-rule-bottom-offset);
  border-bottom: 1px solid var(--markdown-heading-rule);
  content: "";
  pointer-events: none;
}

:deep(.cm-heading-1) {
  font-size: 2.25em;
  line-height: 1.2;
}

:deep(.cm-heading-2) {
  font-size: 1.75em;
  line-height: 1.225;
}

:deep(.cm-heading-3) {
  font-size: 1.5em;
  line-height: 1.43;
}

:deep(.cm-heading-4) {
  font-size: 1.25em;
  line-height: 1.4;
}

:deep(.cm-heading-5),
:deep(.cm-heading-6) {
  font-size: 1em;
  line-height: 1.4;
}

:deep(.cm-heading-6) {
  color: var(--markdown-muted);
}

:deep(.cm-blockquote) {
  --container-content-end: 0;
  position: relative;
  border-left: 4px solid var(--markdown-border);
  background-color: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  background-image: repeating-linear-gradient(
    to right,
    transparent 0 15px,
    var(--markdown-border) 15px 19px
  );
  background-position: 0 0;
  background-repeat: no-repeat;
  background-size: var(--blockquote-guide-width, 0) 100%;
  color: var(--markdown-muted);
  padding-left: var(--blockquote-indent, 15px);
  padding-right: 0;
}

:deep(.cm-blockquote-depth-1) {
  --container-content-end: 15px;
  padding-right: 15px;
}

:deep(.cm-blockquote-margin-before) {
  margin-top: 0.8em;
}

:deep(.cm-blockquote-margin-after) {
  margin-bottom: 0.8em;
}

:deep(.cm-blockquote-gap:not(.cm-active-markdown-line)) {
  min-height: 0.8em;
  height: 0.8em;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0.8em;
}

:deep(.cm-blockquote-gap.cm-active-markdown-line) {
  min-height: 0.8em;
  height: 0.8em;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0.8em;
}

:deep(.cm-list-gap:not(.cm-active-markdown-line)) {
  min-height: 0.5rem;
  height: 0.5rem;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0.5rem;
}

:deep(.cm-list-gap.cm-active-markdown-line) {
  min-height: 0.5rem;
  height: 0.5rem;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 0.5rem;
}

:deep(.cm-document-first-block.cm-paragraph),
:deep(.cm-document-first-block.cm-blockquote) {
  margin-top: 0.8em;
}

:deep(.cm-document-last-block.cm-paragraph),
:deep(.cm-document-last-block.cm-blockquote) {
  margin-bottom: 0.8em;
}

:deep(.cm-document-first-list) {
  margin-top: 0.8em;
}

:deep(.cm-list-block-margin-before) {
  margin-top: 0.8em;
}

:deep(.cm-heading.cm-blockquote-first) {
  padding-top: 0;
}

:deep(.cm-heading.cm-blockquote-last) {
  --heading-block-padding-bottom: var(--heading-rule-text-gap);
  --heading-rule-bottom-offset: 0;
  padding-bottom: var(--heading-block-padding-bottom);
}

:deep(.cm-alert) {
  --alert-color: #0969da;
  box-sizing: border-box;
  border-left: 4px solid var(--alert-color);
  border-radius: 0;
  background-color: transparent;
  color: var(--markdown-text);
  padding-right: 1em;
  padding-left: 1em;
}

:deep(.cm-alert-first) {
  border-top-right-radius: 0;
}

:deep(.cm-alert-last) {
  border-bottom-right-radius: 0;
  margin-bottom: 16px;
}

:deep(.cm-alert-title) {
  color: var(--alert-color);
  font-weight: 700;
}

:deep(.cm-alert-tip) {
  --alert-color: #1f883d;
}

:deep(.cm-alert-important) {
  --alert-color: #8250df;
}

:deep(.cm-alert-warning) {
  --alert-color: #9a6700;
}

:deep(.cm-alert-caution) {
  --alert-color: #cf222e;
}

:deep(.cm-rendered-alert-title) {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: var(--alert-color);
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.4;
  vertical-align: middle;
}

:deep(.cm-rendered-alert-title[role="button"]) {
  cursor: text;
}

:deep(.cm-rendered-alert-icon) {
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
  fill: currentColor;
  overflow: visible;
}
:deep(.cm-list-continuation) {
  padding-left: var(--list-continuation-indent, 30px);
}

:deep(.cm-blockquote.cm-list-continuation) {
  padding-left: calc(
    var(--blockquote-indent, 15px)
    + var(--list-continuation-indent, 30px)
  );
}

:deep(.cm-code),
:deep(.cm-code-fence) {
  background-color: var(--panel-subtle);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  line-height: 1.5;
}

:deep(.cm-code-fence) {
  color: var(--muted);
}

:deep(.cm-active-code-language-widget) {
  position: relative;
  z-index: 4;
  height: 0;
  min-height: 0;
  overflow: visible;
}

:deep(.cm-active-code-language-widget .code-fence-language-selector) {
  position: absolute;
  right: 0;
  bottom: 4px;
  min-height: 26px;
  margin: 0 4px;
}

.continuous-editor:not(.wrap-code-blocks) :deep(.cm-code) {
  overflow-wrap: normal;
  white-space: pre;
  word-break: normal;
}
:deep(.cm-list-raw-block) {
  box-sizing: border-box;
  width: calc(100% - var(--raw-list-indent, 30px));
  margin-left: var(--raw-list-indent, 30px);
}


:deep(.cm-math),
:deep(.cm-math-fence) {
  background-color: var(--panel-subtle);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 1em;
  line-height: 1.6;
  text-align: left;
}

:deep(.cm-raw-block) {
  --raw-block-border: var(--border);
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border);
}

:deep(.cm-raw-block-html) {
  background-color: var(--panel-subtle);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  line-height: 1.45;
}

:deep(.cm-raw-block-math) {
  --raw-block-border: var(--border);
}

:deep(.cm-active-raw-block.cm-raw-block-code),
:deep(.cm-active-raw-block.cm-raw-block-math) {
  box-sizing: border-box;
  padding-right: calc(var(--container-content-end, 0px) + 8px);
  padding-left: calc(var(--blockquote-indent, 0px) + 8px);
}

:deep(.cm-raw-block-first) {
  border-radius: 4px 4px 0 0;
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border),
    inset 0 1px var(--raw-block-border);
  padding-top: 0.28rem;
}

:deep(.cm-raw-block-last) {
  border-radius: 0 0 4px 4px;
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border),
    inset 0 -1px var(--raw-block-border);
  padding-bottom: 0.28rem;
}

:deep(.cm-raw-block-first.cm-raw-block-last) {
  border-radius: 4px;
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border),
    inset 0 1px var(--raw-block-border),
    inset 0 -1px var(--raw-block-border);
}

:deep(.cm-active-raw-fence-hidden:not(.cm-active-raw-empty-input)) {
  height: 0;
  min-height: 0;
  overflow: hidden;
  padding-top: 0;
  padding-bottom: 0;
  border-radius: 0;
  box-shadow: none;
  line-height: 0;
}

:deep(.cm-active-raw-content-first) {
  border-radius: 4px 4px 0 0;
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border),
    inset 0 1px var(--raw-block-border);
  padding-top: 0.28rem;
}

:deep(.cm-active-raw-content-last) {
  border-radius: 0 0 4px 4px;
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border),
    inset 0 -1px var(--raw-block-border);
  padding-bottom: 0.28rem;
}

:deep(.cm-active-raw-content-first.cm-active-raw-content-last),
:deep(.cm-active-raw-empty-input) {
  min-height: 1.6em;
  border-radius: 4px;
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border),
    inset 0 1px var(--raw-block-border),
    inset 0 -1px var(--raw-block-border);
  padding-top: 0.28rem;
  padding-bottom: 0.28rem;
  line-height: 1.6;
}

:deep(.cm-raw-block-code.cm-active-raw-content-first) {
  padding-top: 8px;
  line-height: 1.5;
}

:deep(.cm-raw-block-code.cm-active-raw-content-last) {
  padding-bottom: 8px;
  line-height: 1.5;
}

:deep(.cm-raw-block-code.cm-active-raw-empty-input) {
  min-height: 1.5em;
  padding-top: 8px;
  padding-bottom: 8px;
  line-height: 1.5;
}

:deep(.cm-table) {
  border-bottom: 1px solid var(--markdown-border);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.88em;
}

:deep(.cm-horizontal-rule:not(.cm-active-markdown-line)) {
  position: relative;
  min-height: 34px;
  height: 34px;
  overflow: hidden;
  line-height: 34px;
}

:deep(.cm-horizontal-rule:not(.cm-active-markdown-line):not(.cm-list-thematic-break))::after {
  position: absolute;
  inset-inline: 0;
  inset-inline-start: var(--container-content-start, 0);
  top: 16px;
  height: 2px;
  background: var(--markdown-horizontal-rule);
  content: "";
  pointer-events: none;
}
:deep(.cm-horizontal-rule.cm-spacing-collapse-before:not(.cm-active-markdown-line)),
:deep(.cm-horizontal-rule.cm-spacing-collapse-after:not(.cm-active-markdown-line)) {
  min-height: 18px;
  height: 18px;
  line-height: 18px;
}

:deep(.cm-horizontal-rule.cm-spacing-collapse-before:not(.cm-active-markdown-line):not(.cm-list-thematic-break))::after {
  top: 0;
}

:deep(.cm-horizontal-rule.cm-spacing-collapse-before.cm-spacing-collapse-after:not(.cm-active-markdown-line)) {
  min-height: 2px;
  height: 2px;
  line-height: 2px;
}


:deep(.cm-horizontal-rule.cm-active-markdown-line) {
  box-sizing: border-box;
  min-height: 1.6em;
  height: auto;
  overflow: visible;
  color: var(--muted);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  line-height: inherit;
  margin: 0;
}

:deep(.cm-frontmatter) {
  background: #f7f7f7;
  color: var(--muted);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.85em;
  line-height: 1.45;
  padding-right: 1rem;
  padding-left: 1rem;
}

:deep(.cm-frontmatter-delimiter:not(.cm-active-markdown-line)) {
  min-height: 0;
  height: 0;
  overflow: hidden;
  padding: 0;
  line-height: 0;
}

:deep(.cm-frontmatter-content-first) {
  border-radius: 3px 3px 0 0;
  padding-top: 1rem;
}

:deep(.cm-frontmatter-content-last) {
  border-radius: 0 0 3px 3px;
  padding-bottom: 1rem;
}

:deep(.cm-frontmatter-content-only) {
  border-radius: 3px;
  padding-top: 1rem;
  padding-bottom: 1rem;
}

:global(:root[data-theme="dark"] .continuous-editor .cm-frontmatter),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-frontmatter) {
  background: var(--panel-subtle);
}

:deep(.cm-footnote-definition) {
  color: var(--muted);
  font-size: 0.9em;
  opacity: 0.8;
}

:deep(.cm-footnote-definition-first) {
  border-top: 1px solid var(--heading-rule);
  margin-top: 1em;
  padding-top: 0.6em;
}

:deep(.cm-focus-muted) {
  opacity: 0.28;
}

:deep(.cm-active-markdown-line) {
  opacity: 1;
}

:deep(.cm-special-preview) {
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  color: var(--markdown-text);
  cursor: text;
  font-family: "Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, "Segoe UI Emoji", "SF Pro", sans-serif;
  font-size: var(--editor-font-size);
  line-height: 1.6;
  padding: 0;
  white-space: normal;
}

:deep(.cm-special-preview-code) {
  padding-top: 15px;
  padding-bottom: 15px;
  white-space: normal;
}

:deep(.cm-special-preview-definition) {
  display: flow-root;
}

:deep(.cm-special-preview-html) {
  display: flow-root;
}

:deep(.cm-preview-collapse-before.cm-special-preview-code) {
  padding-top: 0;
}

:deep(.cm-preview-collapse-after.cm-special-preview-code) {
  padding-bottom: 0;
}

:deep(.cm-preview-collapse-before.cm-visual-table-widget .visual-table-editor) {
  padding-top: 1px;
}

:deep(.cm-preview-collapse-before.cm-visual-table-widget .table-tools) {
  top: 1px;
}

:deep(.cm-preview-collapse-after.cm-visual-table-widget .visual-table-editor) {
  padding-bottom: 0;
}

:deep(.cm-preview-collapse-before.cm-special-preview-math .math-block) {
  margin-top: 0;
}

:deep(.cm-preview-collapse-after.cm-special-preview-math .math-block) {
  margin-bottom: 0;
}

:deep(.cm-preview-collapse-before.cm-special-preview-diagram .diagram-box) {
  margin-top: 0;
}

:deep(.cm-preview-collapse-after.cm-special-preview-diagram .diagram-box) {
  margin-bottom: 0;
}

:deep(.cm-preview-collapse-before.cm-special-preview-image) {
  margin-top: 0;
}

:deep(.cm-preview-collapse-after.cm-special-preview-image) {
  margin-bottom: 0;
}

:deep(.cm-preview-collapse-before.cm-special-preview-html .cm-html-spacing-boundary-before) {
  margin-top: 0 !important;
  margin-block-start: 0 !important;
}

:deep(.cm-preview-collapse-after.cm-special-preview-html .cm-html-spacing-boundary-after) {
  margin-bottom: 0 !important;
  margin-block-end: 0 !important;
}

:deep(.cm-preview-collapse-before.cm-special-preview-definition > :first-child) {
  margin-top: 0;
}

:deep(.cm-preview-collapse-after.cm-special-preview-definition > :last-child) {
  margin-bottom: 0;
}

:deep(.cm-preview-collapse-before.cm-special-preview-toc .toc-inline) {
  margin-top: 0;
}

:deep(.cm-preview-collapse-after.cm-special-preview-toc .toc-inline) {
  padding-bottom: 0;
}

:deep(.cm-preview-container) {
  box-sizing: border-box;
}

:deep(.cm-preview-list-container) {
  width: calc(100% - var(--preview-list-indent, 30px));
  margin-left: var(--preview-list-indent, 30px);
}

:deep(.cm-preview-quote-container) {
  border-left: 4px solid var(--markdown-border);
  background-color: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  background-image: repeating-linear-gradient(
    to right,
    transparent 0 15px,
    var(--markdown-border) 15px 19px
  );
  background-position: 0 0;
  background-repeat: no-repeat;
  background-size: var(--preview-quote-guide-width, 0) 100%;
  padding-left: var(--preview-quote-indent, 15px);
  padding-right: var(--preview-quote-end, 0);
}

:deep(.cm-special-preview:focus-visible) {
  outline: none;
}

:deep(.cm-special-preview-definition dl) {
  margin: 0.8em 0;
}

:deep(.cm-special-preview-definition dt) {
  color: inherit;
  font-weight: 400;
  margin: 0;
}

:deep(.cm-special-preview-definition dd) {
  border: 0;
  color: inherit;
  margin: 0 0 0 40px;
  padding: 0;
}

:deep(.cm-special-preview-definition dd > p) {
  margin: 0.5rem 0;
}

:deep(.cm-special-preview-definition blockquote) {
  border-left: 4px solid var(--markdown-border);
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  color: var(--markdown-muted);
  margin: 0.8em 0;
  padding: 0 15px;
}

:deep(.cm-special-preview:not(.cm-special-preview-definition) > blockquote) {
  border-left: 4px solid var(--markdown-border);
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  color: var(--markdown-muted);
  margin: 0.8em 0;
  padding: 0 15px;
}

:deep(.cm-special-preview:not(.cm-special-preview-definition) > blockquote > :first-child) {
  margin-top: 0;
}

:deep(.cm-special-preview:not(.cm-special-preview-definition) > blockquote > :last-child) {
  margin-bottom: 0;
}

:deep(.cm-special-preview-html p),
:deep(.cm-special-preview-html ul),
:deep(.cm-special-preview-html ol),
:deep(.cm-special-preview-html dl),
:deep(.cm-special-preview-html blockquote) {
  margin: 0.8em 0;
}

:deep(.cm-special-preview-html ul),
:deep(.cm-special-preview-html ol) {
  padding-left: 30px;
}

:deep(.cm-special-preview-html ul:first-child),
:deep(.cm-special-preview-html ol:first-child) {
  margin-top: 0;
}

:deep(.cm-special-preview-html ul:last-child),
:deep(.cm-special-preview-html ol:last-child) {
  margin-bottom: 0;
}

:deep(.cm-special-preview-html li > p),
:deep(.cm-special-preview-html td p) {
  margin: 0.5rem 0;
}

:deep(.cm-special-preview-html h1),
:deep(.cm-special-preview-html h2),
:deep(.cm-special-preview-html h3),
:deep(.cm-special-preview-html h4),
:deep(.cm-special-preview-html h5),
:deep(.cm-special-preview-html h6) {
  margin: 1rem 0;
  font-weight: 700;
  line-height: 1.4;
  white-space: pre-wrap;
}

:deep(.cm-special-preview-html h1) {
  border-bottom: 1px solid var(--markdown-heading-rule);
  padding-bottom: 0.125em;
  font-size: 2.25em;
  line-height: 1.2;
}

:deep(.cm-special-preview-html h2) {
  border-bottom: 1px solid var(--markdown-heading-rule);
  padding-bottom: 0.125em;
  font-size: 1.75em;
  line-height: 1.225;
}

:deep(.cm-special-preview-html h3) {
  font-size: 1.5em;
  line-height: 1.43;
}

:deep(.cm-special-preview-html h4) {
  font-size: 1.25em;
}

:deep(.cm-special-preview-html h5),
:deep(.cm-special-preview-html h6) {
  font-size: 1em;
}

:deep(.cm-special-preview-html h6) {
  color: var(--markdown-muted);
}

:deep(.cm-special-preview-html h1 code),
:deep(.cm-special-preview-html h2 code),
:deep(.cm-special-preview-html h3 code),
:deep(.cm-special-preview-html h4 code),
:deep(.cm-special-preview-html h5 code),
:deep(.cm-special-preview-html h6 code) {
  font-size: inherit;
}

:deep(.cm-special-preview-html h1 tt),
:deep(.cm-special-preview-html h2 tt),
:deep(.cm-special-preview-html h3 tt),
:deep(.cm-special-preview-html h4 tt),
:deep(.cm-special-preview-html h5 tt),
:deep(.cm-special-preview-html h6 tt) {
  font-size: inherit;
}

:deep(.cm-special-preview-html blockquote) {
  border-left: 4px solid var(--markdown-border);
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  color: var(--markdown-muted);
  padding: 0 15px;
}

:deep(.cm-special-preview blockquote blockquote) {
  padding-right: 0;
}

:deep(.cm-special-preview li > :first-child) {
  margin-top: 0;
}

:deep(.cm-special-preview li > figure:last-child) {
  margin-bottom: 0.5rem;
}

:deep(.cm-special-preview-html dd) {
  margin-inline-start: 40px;
}

:deep(.cm-special-preview img) {
  display: inline-block;
  max-width: 100%;
  margin: 0;
  border-radius: 0;
  vertical-align: middle;
}

:deep(.cm-special-preview img:not([height])) {
  height: auto;
}

:deep(.cm-special-preview-image) {
  margin: 0.8em 0;
}

:deep(.cm-special-preview-image img),
:deep(.cm-special-preview-html p > img:only-child),
:deep(.cm-special-preview-html p > a:only-child > img:only-child) {
  display: block;
  margin: auto;
}

:deep(.cm-special-preview-html hr) {
  box-sizing: content-box;
  height: 2px;
  overflow: hidden;
  border: 0;
  background: var(--markdown-horizontal-rule);
  margin: 16px 0;
  padding: 0;
}

:deep(.cm-special-preview-html video) {
  display: block;
  max-width: 100%;
  margin: 0 auto;
}

:deep(.cm-special-preview-html audio) {
  max-width: 100%;
}

:deep(.cm-special-preview-html iframe) {
  width: 100%;
  max-width: 100%;
  border: 0;
  margin: 0 auto;
}

:deep(.cm-special-preview table) {
  display: table;
  width: 100%;
  border-collapse: collapse;
  background: var(--panel);
  margin: 0.8em 0;
  word-break: initial;
}

:deep(.cm-special-preview figure.table-figure) {
  overflow-x: auto;
  max-width: calc(100% + 16px);
  margin: 1.2em 0;
  padding: 0;
}

:deep(.cm-special-preview figure:not(.table-figure)) {
  overflow-x: auto;
  max-width: calc(100% + 16px);
  margin: 1.2em 0;
}

:deep(.cm-special-preview figure.table-figure > table) {
  margin: 0;
}

:deep(.cm-special-preview table tr:nth-child(2n)),
:deep(.cm-special-preview thead) {
  background: #f8f8f8;
}

:global(:root[data-theme="dark"] .continuous-editor .cm-special-preview table tr:nth-child(2n)),
:global(:root[data-theme="dark"] .continuous-editor .cm-special-preview thead),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-special-preview table tr:nth-child(2n)),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-special-preview thead) {
  background: var(--panel-subtle);
}

:deep(.cm-special-preview th),
:deep(.cm-special-preview td) {
  border: 1px solid var(--markdown-border);
  min-width: 32px;
  padding: 6px 13px;
  text-align: left;
}

:deep(.cm-special-preview th) {
  border-bottom: 0;
  font-weight: 700;
}

:deep(.cm-special-preview pre) {
  overflow-x: auto;
  margin: 0;
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f8f8f8;
  font-size: 0.9em;
  line-height: 1.5;
  padding: 8px 4px 6px;
}

:deep(.cm-special-preview-html pre) {
  margin: 15px 0;
}

:global(:root[data-theme="dark"] .continuous-editor .cm-special-preview pre),
:global(.marko-markdown-body[data-theme="dark"] .continuous-editor .cm-special-preview pre) {
  border-color: var(--border);
  background: #111820;
}

:deep(.cm-special-preview pre code) {
  border: 0;
  background: transparent;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: inherit;
  padding: 0;
}

.wrap-code-blocks :deep(.cm-special-preview pre) {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

:deep(.cm-special-preview pre.code-with-line-numbers) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 0.85rem;
}

:deep(.cm-special-preview pre.code-with-line-numbers::before) {
  content: attr(data-line-numbers);
  border-right: 1px solid var(--border);
  color: var(--muted);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  line-height: inherit;
  padding-right: 0.72rem;
  text-align: right;
  white-space: pre;
  user-select: none;
}

:deep(.cm-special-preview .math-block) {
  overflow-x: auto;
  margin: 16px 0;
  padding: 0;
  text-align: center;
}

:deep(.cm-special-preview mjx-container[jax="SVG"]),
:deep(.cm-rendered-inline-math mjx-container[jax="SVG"]) {
  color: currentColor;
  max-width: 100%;
}

:deep(.cm-special-preview mjx-container[jax="SVG"] svg),
:deep(.cm-rendered-inline-math mjx-container[jax="SVG"] svg) {
  max-width: 100%;
}

:deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-raw-block-last.cm-active-raw-block:not(.cm-active-raw-fence-hidden)),
:deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-active-raw-content-last),
:deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-active-raw-empty-input) {
  border-radius: 0;
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border);
}

:deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-active-raw-content-first.cm-active-raw-content-last),
:deep(.cm-content:has(.cm-active-math-preview) .cm-raw-block-math.cm-active-raw-empty-input) {
  border-radius: 4px 4px 0 0;
  box-shadow:
    inset 1px 0 var(--raw-block-border),
    inset -1px 0 var(--raw-block-border),
    inset 0 1px var(--raw-block-border);
}

:deep(.cm-active-math-preview) {
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-top: 0;
  border-radius: 0 0 4px 4px;
  background: var(--panel);
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0.85em;
  padding-bottom: 0.85em;
}

:deep(.cm-active-math-preview .math-block) {
  margin: 0;
}

:deep(.cm-special-preview-toc) {
  position: relative;
}

:deep(.cm-delete-toc) {
  position: absolute;
  top: 2px;
  right: 2px;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 20px;
  line-height: 1;
  opacity: 0;
  padding: 0;
  transition: opacity 120ms ease, background-color 120ms ease, border-color 120ms ease;
}

:deep(.cm-special-preview-toc:hover .cm-delete-toc),
:deep(.cm-special-preview-toc:focus .cm-delete-toc),
:deep(.cm-special-preview-toc.cm-atomic-block-selected .cm-delete-toc) {
  opacity: 1;
}

:deep(.cm-delete-toc:hover) {
  border-color: var(--border);
  background: var(--panel-subtle);
  color: var(--text-main);
}

:deep(.cm-special-preview .toc-inline) {
  border: 0;
  background: transparent;
  font-size: 0.9em;
  margin: 20px 0 0;
  min-height: 3.58rem;
  padding: 0 0 20px;
}

:deep(.cm-horizontal-rule:not(.cm-active-markdown-line)) {
  cursor: default;
}

:deep(.cm-horizontal-rule.cm-atomic-block-selected) {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent);
}

:deep(.cm-special-preview-toc.cm-atomic-block-selected) {
  outline: 2px solid color-mix(in srgb, var(--accent) 58%, transparent);
  outline-offset: 3px;
}

:deep(.cm-atomic-block-selected) {
  caret-color: transparent;
}

:deep(.cm-special-preview .toc-inline ul) {
  margin: 0;
  padding-left: 0;
}

:deep(.cm-special-preview .toc-inline-item) {
  list-style: none;
  margin: 0;
}

:deep(.cm-special-preview .toc-inline a) {
  text-decoration: none;
}

:deep(.cm-special-preview .toc-inline a:hover) {
  text-decoration: underline;
}

:deep(.cm-special-preview .toc-inline-item.lv-1) {
  font-weight: 700;
}

:deep(.cm-special-preview .toc-inline-item.lv-2) {
  padding-left: 2em;
}

:deep(.cm-special-preview .toc-inline-item.lv-3) {
  padding-left: 4em;
}

:deep(.cm-special-preview .toc-inline-item.lv-4) {
  padding-left: 6em;
}

:deep(.cm-special-preview .toc-inline-item.lv-5) {
  padding-left: 8em;
}

:deep(.cm-special-preview .toc-inline-item.lv-6) {
  padding-left: 10em;
}

@media screen and (max-width: 48em) {
  :deep(.cm-special-preview .toc-inline-item.lv-3) {
    padding-left: 3.5em;
  }

  :deep(.cm-special-preview .toc-inline-item.lv-4) {
    padding-left: 5em;
  }

  :deep(.cm-special-preview .toc-inline-item.lv-5) {
    padding-left: 6.5em;
  }

  :deep(.cm-special-preview .toc-inline-item.lv-6) {
    padding-left: 8em;
  }
}

:deep(.cm-special-preview .md-alert) {
  border: 0;
  border-left: 4px solid #0969da;
  border-radius: 0;
  background: transparent;
  margin: 0 0 16px;
  padding: 0 1em;
}

:deep(.cm-special-preview .md-alert > p:not(.md-alert-title)),
:deep(.cm-special-preview .md-alert > ul),
:deep(.cm-special-preview .md-alert > ol) {
  margin: 0.8em 0;
}

:deep(.cm-special-preview .md-alert > ul),
:deep(.cm-special-preview .md-alert > ol) {
  padding-left: 30px;
}

:deep(.cm-special-preview .md-alert-title) {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0;
  padding: 0;
}

:deep(.cm-special-preview .md-alert-title .md-alert-icon) {
  display: inline-block;
  width: 1em;
  height: 1em;
  fill: currentColor;
  margin-right: 1ch;
  overflow: visible;
  position: relative;
  top: 0.125em;
}

:deep(.cm-special-preview .md-alert-tip) {
  border-left-color: #1f883d;
}

:deep(.cm-special-preview .md-alert-note .md-alert-title) {
  color: #0969da;
}

:deep(.cm-special-preview .md-alert-tip .md-alert-title) {
  color: #1f883d;
}

:deep(.cm-special-preview .md-alert-important) {
  border-left-color: #8250df;
}

:deep(.cm-special-preview .md-alert-important .md-alert-title) {
  color: #8250df;
}

:deep(.cm-special-preview .md-alert-warning) {
  border-left-color: #9a6700;
}

:deep(.cm-special-preview .md-alert-warning .md-alert-title) {
  color: #9a6700;
}

:deep(.cm-special-preview .md-alert-caution) {
  border-left-color: #cf222e;
}

:deep(.cm-special-preview .md-alert-caution .md-alert-title) {
  color: #cf222e;
}

:deep(.cm-special-preview .diagram-source-panel) {
  display: none;
}

:deep(.cm-special-preview .mermaid),
:deep(.cm-special-preview .flowchart-render),
:deep(.cm-special-preview .sequence-render) {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-subtle);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  padding: 0.9rem 1rem;
  white-space: pre;
}

:deep(.cm-special-preview-diagram .markdown-inner) {
  max-width: none;
  padding: 0;
}

:deep(.cm-special-preview-diagram .mermaid),
:deep(.cm-special-preview-diagram .flowchart-render),
:deep(.cm-special-preview-diagram .sequence-render) {
  overflow-x: auto;
  border: 0;
  background: transparent;
  font-family: inherit;
  padding: 0;
  white-space: normal;
}

:deep(.cm-special-preview-diagram .mermaid svg),
:deep(.cm-special-preview-diagram .flowchart-render svg),
:deep(.cm-special-preview-diagram .sequence-render svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

:deep(.cm-selectionBackground),
:deep(.cm-content ::selection) {
  background: #dae3ea !important;
  color: inherit !important;
}

:deep(.cm-list-thematic-break:not(.cm-active-markdown-line)) {
  display: flex;
  align-items: center;
  min-height: 34px;
  height: 34px;
}

:deep(.cm-list-thematic-break:not(.cm-horizontal-rule):not(.cm-active-markdown-line)) {
  align-items: flex-start;
  min-height: 18px;
  height: 18px;
  line-height: 2px;
}

:deep(.cm-rendered-list-thematic-break) {
  display: inline-block;
  flex: 1 1 auto;
  min-width: 2rem;
  height: 2px;
  margin-right: 0.5rem;
  background: var(--markdown-horizontal-rule);
  pointer-events: none;
}

:deep(.cm-bullet-list),
:deep(.cm-ordered-list),
:deep(.cm-task-list) {
  --heading-block-padding-bottom: 0.5rem;
  padding-bottom: var(--heading-block-padding-bottom);
}

:deep(.cm-heading.cm-bullet-list.cm-spacing-collapse-after),
:deep(.cm-heading.cm-ordered-list.cm-spacing-collapse-after),
:deep(.cm-heading.cm-task-list.cm-spacing-collapse-after),
:deep(.cm-heading.cm-bullet-list.cm-blockquote-last),
:deep(.cm-heading.cm-ordered-list.cm-blockquote-last),
:deep(.cm-heading.cm-task-list.cm-blockquote-last) {
  --heading-block-padding-bottom: var(--heading-rule-text-gap);
  --heading-rule-bottom-offset: 0;
  padding-bottom: var(--heading-block-padding-bottom);
}

:deep(.cm-rendered-list-marker) {
  display: inline-grid;
  box-sizing: border-box;
  width: var(--list-marker-width);
  padding-inline-start: var(--list-marker-offset);
  color: var(--markdown-text);
  line-height: 1;
  white-space: pre;
}

:deep(.cm-rendered-bullet-marker) {
  color: var(--markdown-text);
  font-size: 1.2em;
  font-weight: 650;
  line-height: 1;
}
:deep(.cm-rendered-bullet-marker) {
  color: transparent;
  font-size: 0;
  line-height: 0;
  vertical-align: middle;
}

:deep(.cm-rendered-bullet-marker)::before {
  display: block;
  box-sizing: border-box;
  width: 6px;
  height: 6px;
  align-self: center;
  justify-self: center;
  transform: translateY(1px);
  border-radius: 50%;
  background: var(--markdown-text);
  content: "";
}

:deep(.cm-rendered-bullet-marker[data-list-depth="1"])::before {
  width: 8px;
  height: 8px;
  border: 1px solid var(--markdown-text);
  background: transparent;
}

:deep(.cm-rendered-bullet-marker[data-list-depth="2"])::before {
  border-radius: 0;
}

:deep(.cm-rendered-bullet-marker) {
  width: var(--list-marker-width);
  padding-inline-start: var(--list-marker-offset);
  place-items: center;
}

:deep(.cm-rendered-ordered-marker) {
  justify-items: end;
  padding-inline-end: 0.35rem;
  font-variant-numeric: tabular-nums;
}

:deep(.cm-rendered-ordered-marker) {
  width: auto;
  min-width: var(--list-marker-width);
}

:deep(.cm-rendered-task-marker) {
  place-items: center;
}

:deep(.cm-rendered-task-marker input) {
  width: auto;
  height: auto;
  margin: 0;
  accent-color: var(--accent-strong);
  cursor: pointer;
}

.is-readonly :deep(.cm-rendered-task-marker input) {
  cursor: default;
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
  font-family: "Lucida Console", Consolas, "Courier", monospace;
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

@media only screen and (min-width: 1400px) {
  .continuous-editor.is-default-width .continuous-editor-host {
    max-width: 1024px;
  }
}

@media only screen and (min-width: 1800px) {
  .continuous-editor.is-default-width .continuous-editor-host {
    max-width: 1200px;
  }
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

  :deep(.cm-content) {
    padding: 0;
  }

  .emoji-popover,
  .editor-context-menu {
    display: none;
  }
}

:deep(.marko-image-error-source),
:deep(.marko-image-reference-missing) {
  display: inline;
  padding: 0.12rem 0.32rem;
  border: 1px solid color-mix(in srgb, var(--danger) 28%, var(--border));
  border-radius: 3px;
  background: var(--danger-soft);
  color: var(--danger);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.88em;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

:deep(.marko-image-error-source) {
  cursor: text;
}

:deep(img.marko-image-error) {
  display: none !important;
}
</style>

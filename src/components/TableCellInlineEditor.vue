<template>
  <div
    ref="hostRef"
    class="table-cell-inline-editor"
    :data-table-row="row"
    :data-table-column="column"
  />
</template>

<script setup lang="ts">
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  StateEffect,
  StateField,
  Transaction,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  keymap,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { resolveLocalAsset } from "@/services/desktop";
import {
  collectFootnoteReferenceSyntax,
  collectInlineHtmlSyntax,
  collectInlineMarkdownSyntax,
  collectInlineMathSyntax,
} from "@/utils/inlineSyntax";
import {
  collectCjkUnderscoreEmphasis,
  collectHighlightSyntax,
  collectStrikethroughSyntax,
} from "@/utils/inlineStyleSyntax";
import { collectInlineTextReplacementRanges } from "@/utils/inlineTextReplacement";
import {
  collectMarkdownAbbreviationDefinitions,
  collectMarkdownAbbreviations,
  getEmojiShortcodeMatches,
  getMarkdownAbbreviationMatches,
  getMarkdownAutoLinkMatches,
  renderMarkdownInline,
  renderSmartPunctuationText,
} from "@/utils/markdown";
import { renderMarkdownCodeSpanText } from "@/utils/codeSpan";
import {
  isHighlightExtensionEnabled,
  isSubscriptExtensionEnabled,
  isSuperscriptExtensionEnabled,
} from "@/utils/editorSettings";
import { mapRenderedTextOffsetToSource } from "@/utils/renderedTextOffset";
import { sanitizeMarkdownHtml } from "@/utils/sanitizeMarkdownHtml";
import { shouldOpenPreviewLink } from "@/utils/previewLinks";
import type { EditorSettings, OutlineItem } from "@/types";
import type {
  TableCellEditorSelection,
  TableCellEditorUserEvent,
} from "@/utils/tableCellInlineEditor";

type InlineNodeKind =
  | "strong"
  | "emphasis"
  | "strike"
  | "highlight"
  | "code"
  | "link"
  | "subscript"
  | "superscript"
  | "image"
  | "math"
  | "html"
  | "footnote"
  | "emoji"
  | "entity"
  | "escape"
  | "hardbreak"
  | "abbreviation"
  | "smart";

interface InlineSemanticNode {
  key: string;
  kind: InlineNodeKind;
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  markerRanges: Array<{ from: number; to: number }>;
  className?: string;
  atomic?: boolean;
  html?: string;
  text?: string;
  syntax?: "markdown" | "markdown-visible" | "html";
  priority?: number;
}

const props = withDefaults(defineProps<{
  value: string;
  documentSource: string;
  row: number;
  column: number;
  filePath?: string;
  sourceOffset?: number;
  outline: OutlineItem[];
  settings: EditorSettings;
  assetResolver?: (path: string) => string;
  readonly?: boolean;
}>(), {
  readonly: false,
});

const emit = defineEmits<{
  update: [
    value: string,
    selection: TableCellEditorSelection,
    userEvent?: TableCellEditorUserEvent,
  ];
  selection: [selection: TableCellEditorSelection];
  keydown: [event: KeyboardEvent];
  doubleClick: [event: MouseEvent];
  paste: [event: ClipboardEvent];
  compositionStart: [];
  compositionEnd: [];
  history: [command: "undo" | "redo"];
  focus: [];
  blur: [];
  openLink: [href: string];
}>();

const hostRef = ref<HTMLElement | null>(null);
const previewCompartment = new Compartment();
const readonlyCompartment = new Compartment();
const contentAttributesCompartment = new Compartment();
const externalUpdate = Annotation.define<boolean>();
const setRenderedWholeCellSelection = StateEffect.define<boolean>();
const setEditorFocused = StateEffect.define<boolean>();
const editorFocused = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setEditorFocused)) return effect.value;
    }
    return value;
  },
});
const renderedWholeCellSelection = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setRenderedWholeCellSelection)) return effect.value;
    }
    return transaction.selection ? false : value;
  },
});
let view: EditorView | null = null;
let compositionActive = false;
let pendingExternalValue: string | null = null;
let pendingExternalFlushTimer: number | null = null;
let recentRenderedImageClick: RenderedImageClick | null = null;
let pendingRenderedImageDoubleClick: RenderedImageClick | null = null;

interface RenderedImageClick {
  document: EditorState["doc"];
  from: number;
  to: number;
}

onMounted(() => {
  if (!hostRef.value) return;
  view = new EditorView({
    parent: hostRef.value,
    state: EditorState.create({
      doc: props.value,
      extensions: [
        drawSelection(),
        renderedWholeCellSelection,
        editorFocused,
        EditorView.focusChangeEffect.of((_state, focusing) => setEditorFocused.of(focusing)),
        markdown({ base: markdownLanguage }),
        EditorView.lineWrapping,
        readonlyCompartment.of(createReadonlyExtension()),
        contentAttributesCompartment.of(createContentAttributesExtension()),
        previewCompartment.of(createPreviewExtension()),
        Prec.high(keymap.of([{
          key: "Mod-a",
          run: selectRenderedWholeCell,
        }])),
        Prec.high(EditorView.domEventHandlers({
          beforeinput: handleBeforeInput,
          keydown: handleKeydown,
          dblclick: handleDoubleClick,
          paste: handlePaste,
          compositionstart: () => {
            compositionActive = true;
            emit("compositionStart");
            return false;
          },
          compositionend: () => {
            compositionActive = false;
            emit("compositionEnd");
            schedulePendingExternalValueFlush();
            return false;
          },
          focus: () => {
            emit("focus");
            return false;
          },
          blur: () => {
            emitSelection();
            emit("blur");
            return false;
          },
          mousedown: handleMouseDown,
        })),
        EditorView.updateListener.of(handleUpdate),
      ],
    }),
  });
});

onBeforeUnmount(() => {
  if (pendingExternalFlushTimer !== null) {
    window.clearTimeout(pendingExternalFlushTimer);
    pendingExternalFlushTimer = null;
  }
  view?.destroy();
  view = null;
});

watch(
  () => props.value,
  (value) => {
    if (!view) return;
    if (view.state.doc.toString() === value) {
      pendingExternalValue = null;
      return;
    }
    if (compositionActive || view.composing) {
      pendingExternalValue = value;
      return;
    }
    applyExternalValue(value);
  },
  { flush: "post" },
);

watch(
  [
    () => props.documentSource,
    () => props.filePath,
    () => props.sourceOffset,
    () => props.outline,
    () => props.settings,
    () => props.assetResolver,
  ],
  () => {
    view?.dispatch({
      effects: [
        previewCompartment.reconfigure(createPreviewExtension()),
        contentAttributesCompartment.reconfigure(createContentAttributesExtension()),
      ],
    });
  },
  { deep: true, flush: "post" },
);

watch(
  () => props.readonly,
  () => {
    view?.dispatch({
      effects: readonlyCompartment.reconfigure(createReadonlyExtension()),
    });
  },
  { flush: "post" },
);

function flushPendingExternalValue() {
  if (!view || compositionActive || view.composing || pendingExternalValue === null) return;
  const value = pendingExternalValue;
  pendingExternalValue = null;
  if (props.value === value && view.state.doc.toString() !== value) {
    applyExternalValue(value);
  }
}

function schedulePendingExternalValueFlush(attempt = 0) {
  if (pendingExternalFlushTimer !== null) window.clearTimeout(pendingExternalFlushTimer);
  pendingExternalFlushTimer = window.setTimeout(() => {
    pendingExternalFlushTimer = null;
    if (!view || pendingExternalValue === null) return;
    if (compositionActive || view.composing) {
      if (attempt < 8) schedulePendingExternalValueFlush(attempt + 1);
      return;
    }
    flushPendingExternalValue();
  }, 0);
}

function applyExternalValue(value: string) {
  if (!view || view.state.doc.toString() === value) return;
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    selection: {
      anchor: Math.min(selection.anchor, value.length),
      head: Math.min(selection.head, value.length),
    },
    annotations: [
      externalUpdate.of(true),
      Transaction.addToHistory.of(false),
    ],
  });
}

function createReadonlyExtension() {
  return [
    EditorState.readOnly.of(props.readonly),
    EditorView.editable.of(!props.readonly),
  ];
}

function createContentAttributesExtension() {
  return EditorView.contentAttributes.of({
    spellcheck: props.settings.spellcheck ? "true" : "false",
    lang: "zh-CN",
  });
}

function createPreviewExtension() {
  return EditorView.decorations.compute(
    ["doc", "selection", renderedWholeCellSelection, editorFocused],
    (state) => buildInlineDecorations(state),
  );
}

function handleUpdate(update: ViewUpdate) {
  const changedByParent = update.transactions.some((transaction) => (
    transaction.annotation(externalUpdate)
  ));
  if (update.docChanged && !changedByParent) {
    emit(
      "update",
      update.state.doc.toString(),
      getSelection(update.state),
      getCompositionUserEvent(update),
    );
  }
  if (update.selectionSet || update.docChanged) {
    emit("selection", getSelection(update.state));
  }
  if (pendingExternalValue !== null && !compositionActive && !update.view.composing) {
    schedulePendingExternalValueFlush();
  }
}

function getCompositionUserEvent(update: ViewUpdate): TableCellEditorUserEvent | undefined {
  const annotation = update.transactions
    .map((transaction) => transaction.annotation(Transaction.userEvent))
    .find((value) => Boolean(value));
  return annotation?.includes("compose") ? "input.type.compose" : undefined;
}

function handleBeforeInput(event: InputEvent): boolean {
  if (event.inputType !== "historyUndo" && event.inputType !== "historyRedo") return false;
  event.preventDefault();
  event.stopPropagation();
  emit("history", event.inputType === "historyUndo" ? "undo" : "redo");
  return true;
}

function handleKeydown(event: KeyboardEvent): boolean {
  emit("keydown", event);
  return event.defaultPrevented;
}

function handlePaste(event: ClipboardEvent): boolean {
  emit("paste", event);
  return event.defaultPrevented;
}

function handleDoubleClick(event: MouseEvent): boolean {
  const editor = view;
  const pending = pendingRenderedImageDoubleClick;
  pendingRenderedImageDoubleClick = null;
  if (editor && pending?.document === editor.state.doc && !props.readonly) {
    event.preventDefault();
    event.stopPropagation();
    selectRenderedImageSource(editor, pending);
    return true;
  }
  emit("doubleClick", event);
  return event.defaultPrevented;
}

function handleMouseDown(event: MouseEvent): boolean {
  if (event.button !== 0) return false;
  const editor = view;
  const recentImage = recentRenderedImageClick;
  if (event.detail >= 2 && editor && recentImage) {
    recentRenderedImageClick = null;
    if (!props.readonly && recentImage.document === editor.state.doc) {
      event.preventDefault();
      event.stopPropagation();
      pendingRenderedImageDoubleClick = recentImage;
      selectRenderedImageSource(editor, recentImage);
      return true;
    }
  } else if (event.detail <= 1) {
    recentRenderedImageClick = null;
    pendingRenderedImageDoubleClick = null;
  }
  if (event.detail >= 3 && view) {
    event.preventDefault();
    event.stopPropagation();
    scheduleRenderedWholeCellSelection(view);
    return true;
  }
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest<HTMLElement>("[data-table-inline-href]");
  const href = link?.dataset.tableInlineHref;
  if (!href || !shouldOpenPreviewLink(event)) return false;
  event.preventDefault();
  event.stopPropagation();
  emit("openLink", href);
  return true;
}

function selectRenderedWholeCell(editor: EditorView): boolean {
  editor.dispatch({
    selection: EditorSelection.single(0, editor.state.doc.length),
    effects: setRenderedWholeCellSelection.of(true),
    userEvent: "select.pointer",
  });
  return true;
}

function getSelection(state = view?.state): TableCellEditorSelection {
  const selection = state?.selection.main;
  return {
    anchor: selection?.anchor ?? 0,
    head: selection?.head ?? 0,
  };
}

function emitSelection() {
  if (view) emit("selection", getSelection(view.state));
}

function setEditorSelection(selection: TableCellEditorSelection) {
  if (!view) return;
  const length = view.state.doc.length;
  const anchor = clamp(selection.anchor, 0, length);
  const head = clamp(selection.head, 0, length);
  view.dispatch({
    selection: EditorSelection.single(anchor, head),
    effects: EditorView.scrollIntoView(head),
  });
}

function focusEditor(selection?: TableCellEditorSelection) {
  if (!view) return;
  if (selection) setEditorSelection(selection);
  if (!view.state.field(editorFocused)) {
    view.dispatch({ effects: setEditorFocused.of(true) });
  }
  view.focus();
}

function replaceSelection(text: string) {
  if (!view || props.readonly) return;
  const selection = view.state.selection.main;
  const normalized = text.replace(/\r?\n/g, "<br>");
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: normalized },
    selection: { anchor: selection.from + normalized.length },
    annotations: Transaction.userEvent.of("input"),
  });
  view.focus();
}

defineExpose({
  focus: focusEditor,
  blur: () => {
    if (!view) return;
    if (view.state.field(editorFocused)) {
      view.dispatch({ effects: setEditorFocused.of(false) });
    }
    view.contentDOM.blur();
  },
  getValue: () => view?.state.doc.toString() ?? props.value,
  getSelection: () => getSelection(),
  setSelection: setEditorSelection,
  replaceSelection,
  posAtCoords: resolveEditorPositionAtPoint,
  getElement: () => hostRef.value,
});

function resolveEditorPositionAtPoint(point: { x: number; y: number }): number | null {
  const editor = view;
  if (!editor) return null;
  const ownerDocument = editor.contentDOM.ownerDocument as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (
      x: number,
      y: number,
    ) => { startContainer: Node; startOffset: number } | null;
  };
  const resolveDomPosition = (node: Node, offset: number): number | null => {
    if (node !== editor.contentDOM && !editor.contentDOM.contains(node)) return null;
    try {
      return clamp(editor.posAtDOM(node, offset), 0, editor.state.doc.length);
    } catch {
      return null;
    }
  };

  try {
    const caret = ownerDocument.caretPositionFromPoint?.(point.x, point.y);
    if (caret) {
      const position = resolveDomPosition(caret.offsetNode, caret.offset);
      if (position !== null) return position;
    }
    const range = ownerDocument.caretRangeFromPoint?.(point.x, point.y);
    if (range) {
      const position = resolveDomPosition(range.startContainer, range.startOffset);
      if (position !== null) return position;
    }
  } catch {
    return editor.posAtCoords(point);
  }
  return editor.posAtCoords(point);
}

function buildInlineDecorations(state: EditorState): DecorationSet {
  const source = state.doc.toString();
  const nodes = collectInlineSemanticNodes(state, source);
  const wholeCellSelected = state.selection.ranges.some((selection) => (
    !selection.empty
    && selection.from === 0
    && selection.to === state.doc.length
  ));
  const activeKeys = !state.field(editorFocused)
    || state.field(renderedWholeCellSelection)
    || wholeCellSelected
    ? new Set<string>()
    : resolveActiveNodeKeys(nodes, state.selection.ranges);
  const activeNodes = nodes.filter((node) => activeKeys.has(node.key));

  const replacements = selectAtomicReplacements(nodes, activeKeys, activeNodes);
  const ranges: Range<Decoration>[] = [];

  for (const node of nodes) {
    const active = activeKeys.has(node.key);
    const containsActiveNode = activeNodes.some((activeNode) => (
      activeNode.key !== node.key
      && activeNode.from >= node.from
      && activeNode.to <= node.to
    ));
    if (
      (node.atomic && !active && !containsActiveNode)
      || isInsideReplacement(node.from, node.to, replacements)
    ) {
      continue;
    }
    if (node.className && node.contentTo > node.contentFrom) {
      ranges.push(Decoration.mark({
        class: node.className,
        attributes: node.kind === "link"
          ? getLinkAttributes(source.slice(node.from, node.to), node.from)
          : undefined,
      }).range(node.contentFrom, node.contentTo));
    }
    for (const marker of node.markerRanges) {
      if (marker.to <= marker.from) continue;
      ranges.push(
        active
          ? Decoration.mark({ class: "cm-table-inline-source-marker" }).range(marker.from, marker.to)
          : Decoration.replace({}).range(marker.from, marker.to),
      );
    }
  }

  for (const node of replacements) {
    ranges.push(Decoration.replace({
      widget: new RenderedInlineWidget(node, source.slice(node.from, node.to)),
    }).range(node.from, node.to));
  }

  return Decoration.set(ranges, true);
}

function collectInlineSemanticNodes(
  state: EditorState,
  source: string,
): InlineSemanticNode[] {
  const nodes = new Map<string, InlineSemanticNode>();
  const add = (node: InlineSemanticNode) => {
    if (node.to <= node.from) return;
    const existing = nodes.get(node.key);
    if (!existing || (node.priority ?? 0) > (existing.priority ?? 0)) {
      nodes.set(node.key, node);
    }
  };

  syntaxTree(state).iterate({
    enter(reference) {
      const syntax = reference.node;
      const className = getInlineClass(syntax.name);
      if (className) {
        const content = getNodeContentRange(syntax);
        const markers = getNodeMarkerRanges(syntax, content);
        if (syntax.name === "InlineCode") {
          add({
            key: makeKey("code", syntax.from, syntax.to),
            kind: "code",
            from: syntax.from,
            to: syntax.to,
            contentFrom: content.from,
            contentTo: content.to,
            markerRanges: markers,
            className,
            atomic: true,
            text: renderMarkdownCodeSpanText(source.slice(syntax.from, syntax.to))
              ?? source.slice(content.from, content.to),
            syntax: "markdown-visible",
            priority: 60,
          });
          return false;
        }
        if (syntax.name === "Link" || syntax.name === "Autolink") {
          const html = renderInlineFragment(source.slice(syntax.from, syntax.to), syntax.from);
          if (!getFirstHref(html)) return false;
        }
        add({
          key: makeKey(nodeKindFromSyntaxName(syntax.name), syntax.from, syntax.to),
          kind: nodeKindFromSyntaxName(syntax.name),
          from: syntax.from,
          to: syntax.to,
          contentFrom: content.from,
          contentTo: content.to,
          markerRanges: markers,
          className,
          priority: 20,
        });
        return undefined;
      }

      if (syntax.name === "Image") {
        addAtomicNode(add, "image", syntax.from, syntax.to, source, 90);
        return false;
      }
      if (syntax.name === "Entity") {
        addAtomicNode(add, "entity", syntax.from, syntax.to, source, 70);
        return false;
      }
      if (syntax.name === "Escape") {
        addAtomicNode(add, "escape", syntax.from, syntax.to, source, 70);
        return false;
      }
      if (syntax.name === "HardBreak") {
        addAtomicNode(add, "hardbreak", syntax.from, syntax.to, source, 80);
        return false;
      }
      return undefined;
    },
  });

  splitAdjacentStrongNodes(nodes, add, source);

  if (props.settings.extensions.html) {
    for (const syntax of collectInlineHtmlSyntax(source)) {
      addAtomicNode(add, "html", syntax.start, syntax.end, source, 100, "html");
    }
  }

  if (props.settings.extensions.math) {
    for (const syntax of collectInlineMathSyntax(source, { includeLinkLabels: true })) {
      if (isContainedByAtomicKind(nodes, syntax.start, syntax.end, ["code", "html"])) continue;
      addAtomicNode(add, "math", syntax.start, syntax.end, source, 85);
    }
  }

  if (props.settings.extensions.footnote) {
    for (const syntax of collectFootnoteReferenceSyntax(source)) {
      if (
        isContainedByAtomicKind(
          nodes,
          syntax.start,
          syntax.end,
          ["code", "html", "math"],
        )
      ) {
        continue;
      }
      addAtomicNode(add, "footnote", syntax.start, syntax.end, source, 88);
    }
  }

  pruneNodesContainedByAtomicNodes(nodes);
  const baseProtectedRanges = getProtectedNodeRanges(nodes);
  const autoLinks = props.settings.extensions.autoLinks
    ? getMarkdownAutoLinkMatches(source).filter((link) => (
      !hasContainingKind(nodes, link.start, link.end, "link")
      && !intersectsRanges(link.start, link.end, baseProtectedRanges)
    ))
    : [];
  const protectedRanges = [
    ...baseProtectedRanges,
    ...autoLinks.map((link) => ({ from: link.start, to: link.end })),
  ];
  if (isHighlightExtensionEnabled(props.settings.extensions)) {
    for (const syntax of collectHighlightSyntax(source, 0, protectedRanges)) {
      addStyleNode(add, "highlight", syntax.from, syntax.to, syntax.contentFrom, syntax.contentTo);
    }
  }

  for (const syntax of collectStrikethroughSyntax(source, 0, protectedRanges)) {
    if (hasExactRange(nodes, syntax.from, syntax.to)) continue;
    addStyleNode(add, "strike", syntax.from, syntax.to, syntax.contentFrom, syntax.contentTo);
  }

  for (const syntax of collectCjkUnderscoreEmphasis(source)) {
    if (
      hasExactRange(nodes, syntax.start, syntax.end)
      || intersectsRanges(syntax.start, syntax.end, protectedRanges)
    ) {
      continue;
    }
    addStyleNode(
      add,
      syntax.kind,
      syntax.start,
      syntax.end,
      syntax.contentStart,
      syntax.contentEnd,
    );
  }

  if (props.settings.extensions.emoji) {
    for (const emoji of getEmojiShortcodeMatches(source)) {
      if (intersectsRanges(emoji.start, emoji.end, protectedRanges)) continue;
      add({
        key: makeKey("emoji", emoji.start, emoji.end),
        kind: "emoji",
        from: emoji.start,
        to: emoji.end,
        contentFrom: emoji.start,
        contentTo: emoji.end,
        markerRanges: [],
        atomic: true,
        text: emoji.value,
        syntax: "markdown-visible",
        priority: 75,
      });
    }
  }

  const abbreviations = collectMarkdownAbbreviations(
    props.documentSource,
    collectMarkdownAbbreviationDefinitions(props.documentSource),
  );
  for (const match of getMarkdownAbbreviationMatches(source, abbreviations)) {
    if (intersectsRanges(match.start, match.end, protectedRanges)) continue;
    addAtomicNode(add, "abbreviation", match.start, match.end, source, 65);
  }

  if (props.settings.extensions.autoLinks) {
    for (const link of autoLinks) {
      add({
        key: makeKey("link", link.start, link.end),
        kind: "link",
        from: link.start,
        to: link.end,
        contentFrom: link.textStart,
        contentTo: link.textEnd,
        markerRanges: [
          { from: link.start, to: link.textStart },
          { from: link.textEnd, to: link.end },
        ],
        className: "cm-table-inline-link",
        priority: 18,
      });
    }
  }

  for (const syntax of collectInlineMarkdownSyntax(source)) {
    if (
      syntax.type !== "image"
      || hasExactRange(nodes, syntax.start, syntax.end)
      || intersectsRanges(syntax.start, syntax.end, protectedRanges)
    ) {
      continue;
    }
    addAtomicNode(add, "image", syntax.start, syntax.end, source, 90);
  }

  if (props.settings.smartQuotes || props.settings.smartDashes) {
    const rendered = renderSmartPunctuationText(source, {
      quotes: props.settings.smartQuotes,
      dashes: props.settings.smartDashes,
    });
    for (const replacement of collectInlineTextReplacementRanges(source, rendered)) {
      if (Array.from(nodes.values()).some((node) => rangesIntersect(
        replacement.from,
        replacement.to,
        node.from,
        node.to,
      ))) {
        continue;
      }
      add({
        key: makeKey("smart", replacement.from, replacement.to),
        kind: "smart",
        from: replacement.from,
        to: replacement.to,
        contentFrom: replacement.from,
        contentTo: replacement.to,
        markerRanges: [],
        atomic: true,
        text: replacement.value,
        syntax: "markdown-visible",
        priority: 55,
      });
    }
  }

  promoteLinksContainingAtomicNodes(nodes, add, source);
  pruneNodesContainedByAtomicNodes(nodes);
  return Array.from(nodes.values()).sort((left, right) => (
    left.from - right.from
    || right.to - left.to
    || (right.priority ?? 0) - (left.priority ?? 0)
  ));
}

function splitAdjacentStrongNodes(
  nodes: Map<string, InlineSemanticNode>,
  add: (node: InlineSemanticNode) => void,
  source: string,
) {
  for (const node of Array.from(nodes.values())) {
    if (node.kind !== "strong") continue;
    const marker = source.slice(node.from, node.contentFrom);
    if (
      (marker !== "**" && marker !== "__")
      || source.slice(node.contentTo, node.to) !== marker
    ) {
      continue;
    }

    const delimiter = marker + marker;
    const boundaries: number[] = [];
    let searchFrom = node.contentFrom;
    while (searchFrom < node.contentTo) {
      const boundary = source.indexOf(delimiter, searchFrom);
      if (boundary < 0 || boundary + delimiter.length > node.contentTo) break;
      boundaries.push(boundary);
      searchFrom = boundary + delimiter.length;
    }
    if (boundaries.length === 0) continue;

    let segmentFrom = node.from;
    const valid = boundaries.every((boundary) => {
      const hasContent = boundary > segmentFrom + marker.length;
      segmentFrom = boundary + marker.length;
      return hasContent;
    }) && node.contentTo > segmentFrom + marker.length;
    if (!valid) continue;

    nodes.delete(node.key);
    segmentFrom = node.from;
    for (const boundary of boundaries) {
      const segmentTo = boundary + marker.length;
      addStyleNode(
        add,
        "strong",
        segmentFrom,
        segmentTo,
        segmentFrom + marker.length,
        boundary,
      );
      segmentFrom = segmentTo;
    }
    addStyleNode(
      add,
      "strong",
      segmentFrom,
      node.to,
      segmentFrom + marker.length,
      node.contentTo,
    );
  }
}

function addStyleNode(
  add: (node: InlineSemanticNode) => void,
  kind: "strong" | "emphasis" | "strike" | "highlight",
  from: number,
  to: number,
  contentFrom: number,
  contentTo: number,
) {
  add({
    key: makeKey(kind, from, to),
    kind,
    from,
    to,
    contentFrom,
    contentTo,
    markerRanges: [
      { from, to: contentFrom },
      { from: contentTo, to },
    ],
    className: getClassForKind(kind),
    priority: 25,
  });
}

function addAtomicNode(
  add: (node: InlineSemanticNode) => void,
  kind: Extract<InlineNodeKind, "image" | "math" | "html" | "footnote" | "entity" | "escape" | "hardbreak" | "abbreviation">,
  from: number,
  to: number,
  source: string,
  priority: number,
  syntax: "markdown" | "markdown-visible" | "html" = "markdown-visible",
) {
  add({
    key: makeKey(kind, from, to),
    kind,
    from,
    to,
    contentFrom: from,
    contentTo: to,
    markerRanges: [],
    atomic: true,
    html: renderInlineFragment(source.slice(from, to), from),
    syntax,
    priority,
  });
}

function getInlineClass(name: string): string | null {
  if (name === "StrongEmphasis") return "cm-table-inline-strong";
  if (name === "Emphasis") return "cm-table-inline-emphasis";
  if (name === "Strikethrough") return "cm-table-inline-strike";
  if (name === "InlineCode") return "cm-table-inline-code";
  if (name === "Link" || name === "Autolink") return "cm-table-inline-link";
  if (name === "Subscript" && isSubscriptExtensionEnabled(props.settings.extensions)) {
    return "cm-table-inline-subscript";
  }
  if (name === "Superscript" && isSuperscriptExtensionEnabled(props.settings.extensions)) {
    return "cm-table-inline-superscript";
  }
  return null;
}

function nodeKindFromSyntaxName(name: string): InlineNodeKind {
  if (name === "StrongEmphasis") return "strong";
  if (name === "Emphasis") return "emphasis";
  if (name === "Strikethrough") return "strike";
  if (name === "InlineCode") return "code";
  if (name === "Subscript") return "subscript";
  if (name === "Superscript") return "superscript";
  return "link";
}

function getClassForKind(kind: InlineNodeKind): string {
  if (kind === "strong") return "cm-table-inline-strong";
  if (kind === "emphasis") return "cm-table-inline-emphasis";
  if (kind === "strike") return "cm-table-inline-strike";
  if (kind === "highlight") return "cm-table-inline-highlight";
  if (kind === "code") return "cm-table-inline-code";
  if (kind === "subscript") return "cm-table-inline-subscript";
  if (kind === "superscript") return "cm-table-inline-superscript";
  return "cm-table-inline-link";
}

type InlineSyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

function getNodeContentRange(node: InlineSyntaxNode): { from: number; to: number } {
  const children = getNodeChildren(node);
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
  const markerNames: Record<string, string> = {
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
    ? { from: markers[0]!.to, to: markers[markers.length - 1]!.from }
    : { from: node.from, to: node.to };
}

function getNodeMarkerRanges(
  node: InlineSyntaxNode,
  content: { from: number; to: number },
): Array<{ from: number; to: number }> {
  return [
    { from: node.from, to: content.from },
    { from: content.to, to: node.to },
  ];
}

function getNodeChildren(node: InlineSyntaxNode): InlineSyntaxNode[] {
  const children: InlineSyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
  return children;
}

function resolveActiveNodeKeys(
  nodes: readonly InlineSemanticNode[],
  selections: readonly { from: number; to: number; empty: boolean; head: number; assoc?: number }[],
): Set<string> {
  const result = new Set<string>();
  for (const selection of selections) {
    const touched = selection.empty
      ? getCursorTouchedNodes(nodes, selection.head, selection.assoc ?? 0)
      : nodes.filter((node) => rangesIntersect(
        selection.from,
        selection.to,
        node.from,
        node.to,
      ));
    if (touched.length === 0) continue;
    const smallest = touched.filter((candidate) => !touched.some((other) => (
      other.key !== candidate.key
      && other.from >= candidate.from
      && other.to <= candidate.to
      && other.to - other.from < candidate.to - candidate.from
      && (
        selection.empty
          ? selection.head >= other.from && selection.head <= other.to
          : rangesIntersect(selection.from, selection.to, other.from, other.to)
      )
    )));
    for (const node of smallest) result.add(node.key);
  }
  return result;
}

function getCursorTouchedNodes(
  nodes: readonly InlineSemanticNode[],
  position: number,
  assoc: number,
): InlineSemanticNode[] {
  const interior = nodes.filter((node) => position > node.from && position < node.to);
  const starting = nodes.filter((node) => position === node.from && position < node.to);
  const ending = nodes.filter((node) => position === node.to && position > node.from);
  const boundary = assoc < 0
    ? ending
    : assoc > 0
      ? starting
      : [...ending, ...starting];
  return Array.from(new Map(
    [...interior, ...boundary].map((node) => [node.key, node]),
  ).values());
}

function selectAtomicReplacements(
  nodes: readonly InlineSemanticNode[],
  activeKeys: ReadonlySet<string>,
  activeNodes: readonly InlineSemanticNode[],
): InlineSemanticNode[] {
  const candidates = nodes
    .filter((node) => (
      node.atomic
      && !activeKeys.has(node.key)
      && !activeNodes.some((active) => rangesIntersect(node.from, node.to, active.from, active.to))
    ))
    .sort((left, right) => (
      left.from - right.from
      || right.to - left.to
      || (right.priority ?? 0) - (left.priority ?? 0)
    ));
  const selected: InlineSemanticNode[] = [];
  for (const candidate of candidates) {
    if (selected.some((node) => rangesIntersect(candidate.from, candidate.to, node.from, node.to))) {
      continue;
    }
    selected.push(candidate);
  }
  return selected;
}

function isInsideReplacement(
  from: number,
  to: number,
  replacements: readonly InlineSemanticNode[],
): boolean {
  return replacements.some((node) => from >= node.from && to <= node.to);
}

function getLinkAttributes(fragment: string, nodeOffset = 0): Record<string, string> | undefined {
  const html = renderInlineFragment(fragment, nodeOffset);
  const href = getFirstHref(html);
  return href ? { "data-table-inline-href": href } : undefined;
}

function getFirstHref(html: string): string | null {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.querySelector("a[href]")?.getAttribute("href") ?? null;
}

function renderInlineFragment(fragment: string, nodeOffset = 0): string {
  return sanitizeMarkdownHtml(renderMarkdownInline(fragment, {
    basePath: props.filePath,
    documentSource: props.documentSource,
    sourceOffset: (props.sourceOffset ?? 0) + nodeOffset,
    outline: props.outline,
    settings: props.settings,
    assetResolver: props.assetResolver ?? resolveLocalAsset,
  }));
}

function getProtectedNodeRanges(
  nodes: ReadonlyMap<string, InlineSemanticNode>,
): Array<{ from: number; to: number }> {
  return Array.from(nodes.values()).flatMap((node) => {
    if (node.atomic) return [{ from: node.from, to: node.to }];
    if (node.kind === "link") return node.markerRanges;
    return [];
  });
}

function isContainedByAtomicKind(
  nodes: ReadonlyMap<string, InlineSemanticNode>,
  from: number,
  to: number,
  kinds: readonly InlineNodeKind[],
): boolean {
  return Array.from(nodes.values()).some((node) => (
    node.atomic
    && kinds.includes(node.kind)
    && from >= node.from
    && to <= node.to
  ));
}

function pruneNodesContainedByAtomicNodes(nodes: Map<string, InlineSemanticNode>) {
  const atomicNodes = Array.from(nodes.values()).filter((node) => node.atomic);
  for (const [key, node] of nodes) {
    const container = atomicNodes.find((candidate) => (
      candidate.key !== node.key
      && candidate.from <= node.from
      && candidate.to >= node.to
      && (
        candidate.from < node.from
        || candidate.to > node.to
        || (candidate.priority ?? 0) > (node.priority ?? 0)
      )
    ));
    if (container) nodes.delete(key);
  }
}

function intersectsRanges(
  from: number,
  to: number,
  ranges: readonly { from: number; to: number }[],
): boolean {
  return ranges.some((range) => rangesIntersect(from, to, range.from, range.to));
}

function promoteLinksContainingAtomicNodes(
  nodes: ReadonlyMap<string, InlineSemanticNode>,
  add: (node: InlineSemanticNode) => void,
  source: string,
) {
  const snapshot = Array.from(nodes.values());
  for (const link of snapshot) {
    if (link.kind !== "link" || link.atomic) continue;
    const containsAtomicNode = snapshot.some((node) => (
      node.atomic
      && node.key !== link.key
      && node.from >= link.contentFrom
      && node.to <= link.contentTo
    ));
    if (!containsAtomicNode) continue;
    add({
      ...link,
      atomic: true,
      html: renderInlineFragment(source.slice(link.from, link.to), link.from),
      syntax: "markdown-visible",
      priority: 110,
    });
  }
}

function hasExactRange(
  nodes: ReadonlyMap<string, InlineSemanticNode>,
  from: number,
  to: number,
): boolean {
  return Array.from(nodes.values()).some((node) => node.from === from && node.to === to);
}

function hasContainingKind(
  nodes: ReadonlyMap<string, InlineSemanticNode>,
  from: number,
  to: number,
  kind: InlineNodeKind,
): boolean {
  return Array.from(nodes.values()).some((node) => (
    node.kind === kind && from >= node.from && to <= node.to
  ));
}

function makeKey(kind: InlineNodeKind, from: number, to: number): string {
  return kind + ":" + from + ":" + to;
}

class RenderedInlineWidget extends WidgetType {
  constructor(
    private readonly node: InlineSemanticNode,
    private readonly source: string,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof RenderedInlineWidget
      && other.node.key === this.node.key
      && other.source === this.source
      && other.node.html === this.node.html
      && other.node.text === this.node.text;
  }

  toDOM(editor: EditorView): HTMLElement {
    const root = document.createElement("span");
    root.className = "cm-table-inline-widget cm-table-inline-widget-" + this.node.kind;
    root.dataset.markdownSource = this.source;
    if (this.node.text !== undefined) {
      root.textContent = this.node.text;
    } else {
      root.innerHTML = this.node.html ?? renderInlineFragment(this.source, this.node.from);
    }
    if (!root.hasChildNodes()) root.textContent = this.source;
    const href = root.querySelector("a[href]")?.getAttribute("href");
    if (href) root.dataset.tableInlineHref = href;
    root.setAttribute("contenteditable", "false");
    const isRenderedImage = this.node.kind === "image"
      || (this.node.kind === "link" && root.querySelector("img") !== null);

    root.addEventListener("mousedown", (event) => {
      if (props.readonly || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (anchor && shouldOpenPreviewLink(event)) {
        event.preventDefault();
        event.stopPropagation();
        emit("openLink", anchor.getAttribute("href") ?? "");
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (isRenderedImage && event.detail >= 2) {
        recentRenderedImageClick = null;
        pendingRenderedImageDoubleClick = {
          document: editor.state.doc,
          from: this.node.from,
          to: this.node.to,
        };
        selectRenderedImageSource(editor, pendingRenderedImageDoubleClick);
        return;
      }
      if (event.detail <= 1) {
        pendingRenderedImageDoubleClick = null;
        recentRenderedImageClick = isRenderedImage
          ? {
              document: editor.state.doc,
              from: this.node.from,
              to: this.node.to,
            }
          : null;
      }
      if (event.detail >= 3) {
        scheduleRenderedWholeCellSelection(editor);
        return;
      }
      const renderedOffset = getPointerRenderedOffset(root, event);
      const localOffset = renderedOffset === null
        ? Math.min(this.source.length, Math.max(0, Math.floor(this.source.length / 2)))
        : mapRenderedTextOffsetToSource(
          this.source,
          root.textContent ?? "",
          renderedOffset,
          this.node.syntax ?? "markdown-visible",
          props.settings.extensions.emoji,
        );
      const position = clamp(this.node.from + localOffset, this.node.from, this.node.to);
      const selectionAnchor = event.shiftKey ? editor.state.selection.main.anchor : position;
      nextTick(() => {
        if (view !== editor) return;
        editor.dispatch({
          selection: { anchor: selectionAnchor, head: position },
          effects: [
            EditorView.scrollIntoView(position),
            setEditorFocused.of(true),
          ],
        });
        editor.focus();
      });
    });
    root.addEventListener("dblclick", (event) => {
      if (!isRenderedImage || props.readonly) return;
      event.preventDefault();
      event.stopPropagation();
      recentRenderedImageClick = null;
      pendingRenderedImageDoubleClick = null;
      selectRenderedImageSource(editor, {
        document: editor.state.doc,
        from: this.node.from,
        to: this.node.to,
      });
    });

    return root;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function selectRenderedImageSource(editor: EditorView, image: RenderedImageClick) {
  editor.dispatch({
    selection: EditorSelection.single(image.from, image.to),
    effects: [
      EditorView.scrollIntoView(image.to),
      setEditorFocused.of(true),
    ],
    userEvent: "select.pointer",
  });
  queueMicrotask(() => {
    if (view === editor) editor.focus();
  });
}

function scheduleRenderedWholeCellSelection(editor: EditorView) {
  if (view === editor) selectRenderedWholeCell(editor);
}

function getPointerRenderedOffset(root: HTMLElement, event: MouseEvent): number | null {
  if (getNodeTextLength(root) === 0) return null;
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
  try {
    const caret = ownerDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (caret) return getDomTextOffset(root, caret.offsetNode, caret.offset);
    const range = ownerDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
    return range ? getDomTextOffset(root, range.startContainer, range.startOffset) : null;
  } catch {
    return null;
  }
}

function getDomTextOffset(root: HTMLElement, target: Node, targetOffset: number): number | null {
  if (target !== root && !root.contains(target)) return null;
  let offset = 0;
  let resolved = false;
  const visit = (node: Node) => {
    if (resolved) return;
    if (node === target) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += clamp(targetOffset, 0, node.textContent?.length ?? 0);
      } else {
        const childLimit = clamp(targetOffset, 0, node.childNodes.length);
        for (let index = 0; index < childLimit; index += 1) {
          offset += getNodeTextLength(node.childNodes[index]!);
        }
      }
      resolved = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return;
    }
    node.childNodes.forEach(visit);
  };
  visit(root);
  return resolved ? offset : null;
}

function getNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  let length = 0;
  node.childNodes.forEach((child) => {
    length += getNodeTextLength(child);
  });
  return length;
}

function rangesIntersect(from: number, to: number, otherFrom: number, otherTo: number): boolean {
  return from < otherTo && to > otherFrom;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}
</script>

<style scoped>
.table-cell-inline-editor {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 1.6em;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-align: inherit;
}

.table-cell-inline-editor :deep(.cm-editor) {
  width: 100%;
  min-width: 0;
  min-height: 1.6em;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-align: inherit;
}

.table-cell-inline-editor :deep(.cm-editor.cm-focused) {
  outline: 0;
}

.table-cell-inline-editor :deep(.cm-scroller) {
  overflow: hidden;
  min-height: 1.6em;
  font: inherit;
  line-height: inherit;
}

.table-cell-inline-editor :deep(.cm-content) {
  min-height: 1.6em;
  padding: 0;
  caret-color: var(--markdown-text, #333333);
  font: inherit;
  line-height: inherit;
  text-align: inherit;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.table-cell-inline-editor :deep(.cm-line) {
  min-height: 1.6em;
  padding: 0;
}

.table-cell-inline-editor :deep(.cm-cursor) {
  border-left-color: var(--markdown-text, #333333);
}

.table-cell-inline-editor :deep(.cm-selectionBackground),
.table-cell-inline-editor :deep(.cm-content ::selection) {
  background: #dae3ea !important;
  color: inherit !important;
}

.table-cell-inline-editor :deep(.cm-table-inline-source-marker) {
  color: #c7c5c5;
}

.table-cell-inline-editor :deep(.cm-table-inline-strong),
.table-cell-inline-editor :deep(.cm-table-inline-widget-strong strong) {
  font-weight: 700;
}

.table-cell-inline-editor :deep(.cm-table-inline-emphasis),
.table-cell-inline-editor :deep(.cm-table-inline-widget-emphasis em) {
  font-style: italic;
}

.table-cell-inline-editor :deep(.cm-table-inline-strike),
.table-cell-inline-editor :deep(.cm-table-inline-widget-strike del) {
  text-decoration: line-through;
}

.table-cell-inline-editor :deep(.cm-table-inline-highlight),
.table-cell-inline-editor :deep(mark) {
  background: #ffff00;
  color: #000000;
}

.table-cell-inline-editor :deep(.cm-table-inline-code),
.table-cell-inline-editor :deep(.cm-table-inline-widget-code) {
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f3f4f4;
  color: inherit;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  padding: 0 2px;
}

.table-cell-inline-editor :deep(.cm-table-inline-link),
.table-cell-inline-editor :deep(.cm-table-inline-widget a) {
  color: var(--markdown-link, #4183c4);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.table-cell-inline-editor :deep(.cm-table-inline-subscript),
.table-cell-inline-editor :deep(.cm-table-inline-superscript) {
  position: relative;
  font-size: 0.78em;
  line-height: 0;
}

.table-cell-inline-editor :deep(.cm-table-inline-subscript) {
  bottom: -0.24em;
}

.table-cell-inline-editor :deep(.cm-table-inline-superscript) {
  top: -0.38em;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget) {
  display: inline;
  color: inherit;
  white-space: normal;
  vertical-align: baseline;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget-image),
.table-cell-inline-editor :deep(.cm-table-inline-widget-math) {
  display: inline-block;
  max-width: 100%;
  vertical-align: middle;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget img) {
  display: inline-block;
  max-width: 100%;
  height: auto;
  margin: 0;
  vertical-align: middle;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget-math) {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  font-size: 0.95em;
  vertical-align: -0.08em;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget-math mjx-container[jax="SVG"]),
.table-cell-inline-editor :deep(.cm-table-inline-widget-math mjx-container[jax="SVG"] svg) {
  max-width: 100%;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget-abbreviation abbr) {
  cursor: help;
  text-decoration: underline dotted;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget-footnote .footnote-ref) {
  display: initial;
  border-radius: 4px;
  background: rgba(238, 238, 238, 0.7);
  color: #555555;
  line-height: 1;
  margin-inline: 0;
  padding: 2px 4px;
  vertical-align: super;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget-footnote .footnote-ref a) {
  color: inherit;
  text-decoration: none;
}

.table-cell-inline-editor :deep(.cm-table-inline-widget-html kbd) {
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

.table-cell-inline-editor :deep(.cm-table-inline-widget-html code) {
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f3f4f4;
  color: inherit;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  padding: 0 2px;
}

:global(:root[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-highlight),
:global(.marko-markdown-body[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-highlight) {
  background: #ffff00;
  color: #000000;
}

:global(:root[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-code),
:global(:root[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-widget-code),
:global(.marko-markdown-body[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-code),
:global(.marko-markdown-body[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-widget-code) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}

:global(:root[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-widget-footnote .footnote-ref),
:global(.marko-markdown-body[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-widget-footnote .footnote-ref) {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-main);
}

:global(:root[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-widget-html kbd),
:global(.marko-markdown-body[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-widget-html kbd) {
  border-color: var(--border-strong);
  background: var(--panel-subtle);
  box-shadow: none;
  color: var(--text-main);
}

:global(:root[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-widget-html code),
:global(.marko-markdown-body[data-theme="dark"]) .table-cell-inline-editor :deep(.cm-table-inline-widget-html code) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}
</style>


<template>
  <article
    ref="rootRef"
    class="markdown markdown-inner"
    :class="{
      'is-block-editor-child': embeddedBlock,
      'wrap-code-blocks': settings.codeWrap,
    }"
    :style="previewStyle"
    v-html="html"
    @mousedown="handleMouseDown"
    @click.stop="handleClick"
    @click.capture="handleSourceEditorSelection"
    @dblclick="handleDoubleClick"
    @input.capture="handleSourceEditorInput"
    @keydown.capture="handleSourceEditorKeydown"
    @blur.capture="handleSourceEditorBlur"
    @select.capture="handleSourceEditorSelection"
    @keyup.capture="handleSourceEditorSelection"
    @mouseup.capture="handleSourceEditorSelection"
  />

  <textarea
    v-if="sourceVisible"
    ref="sourceEditorRef"
    class="preview-source-editor"
    :value="source"
    :spellcheck="settings.spellcheck"
    aria-label="Markdown 源码"
    @click.stop="handleBlockSourceSelection"
    @input="handleBlockSourceInput"
    @keydown="handleBlockSourceKeydown"
    @blur="hideSourceEditor"
    @select="handleBlockSourceSelection"
    @keyup="handleBlockSourceSelection"
    @mouseup="handleBlockSourceSelection"
  />

  <Teleport to="body">
    <div
      v-if="diagramViewerVisible"
      class="diagram-viewer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="大图查看"
      @click.self="closeDiagramViewer"
    >
      <div class="diagram-viewer-toolbar">
        <span class="diagram-viewer-tool-wrap" data-tip="缩小">
          <button
            type="button"
            class="diagram-viewer-tool"
            aria-label="缩小大图"
            :disabled="diagramViewerScale <= diagramViewerMinScale"
            @click="zoomDiagramViewer(-0.2)"
          >
            <Minus />
          </button>
        </span>

        <span class="diagram-viewer-tool-wrap" data-tip="重置">
          <button
            type="button"
            class="diagram-viewer-tool"
            aria-label="重置大图大小"
            @click="resetDiagramViewerZoom"
          >
            <RotateCcw />
          </button>
        </span>

        <span class="diagram-viewer-tool-wrap" data-tip="放大">
          <button
            type="button"
            class="diagram-viewer-tool"
            aria-label="放大大图"
            :disabled="diagramViewerScale >= diagramViewerMaxScale"
            @click="zoomDiagramViewer(0.2)"
          >
            <Plus />
          </button>
        </span>

        <span class="diagram-viewer-tool-wrap" data-tip="关闭">
          <button
            type="button"
            class="diagram-viewer-tool"
            aria-label="关闭大图"
            @click="closeDiagramViewer"
          >
            <X />
          </button>
        </span>
      </div>

      <div class="diagram-viewer-stage" @wheel.ctrl.prevent="handleDiagramViewerWheel">
        <div
          ref="diagramViewerContentRef"
          class="diagram-viewer-content"
          :style="diagramViewerContentStyle"
          v-html="diagramViewerHtml"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { MermaidConfig } from "mermaid";
import { Minus, Plus, RotateCcw, X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, shallowRef, watch } from "vue";
import { replaceDiagramFenceSource } from "@/utils/diagramFence";
import { indentSelection } from "@/utils/editorBlocks";
import { renderMarkdown } from "@/utils/markdown";
import { prepareRenderedImages } from "@/utils/imageRendering";
import {
  enqueueMermaidRender,
  loadSharedMermaid,
  nextMermaidRenderId,
} from "@/utils/mermaidRenderQueue";
import { sanitizeMarkdownHtml } from "@/utils/sanitizeMarkdownHtml";
import {
  acquireViewerBodyLock,
  clampViewerScale,
  getViewerContentSize,
  getViewerContentStyle,
  releaseViewerBodyLock,
} from "@/utils/mediaViewer";
import { getPreviewLinkAction, resolveLocalMarkdownHref, shouldOpenPreviewLink } from "@/utils/previewLinks";
import { resolveLocalAsset } from "@/services/desktop";
import type { EditorSettings, OutlineItem } from "@/types";

const props = withDefaults(defineProps<{
  source: string;
  documentSource?: string;
  sourceOffset?: number;
  basePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
  readonly?: boolean;
  embeddedBlock?: boolean;
}>(), {
  readonly: false,
  embeddedBlock: false,
});

const emit = defineEmits<{
  toggleTask: [order: number];
  replaceSource: [value: string];
  selection: [selection: MarkdownPreviewSelection];
  openLink: [path: string];
  openAnchor: [href: string];
}>();

const rootRef = ref<HTMLElement | null>(null);
const sourceEditorRef = ref<HTMLTextAreaElement | null>(null);
const sourceVisible = ref(false);
const diagramViewerVisible = ref(false);
const diagramViewerHtml = ref("");
const diagramViewerScale = ref(1);
const diagramViewerBaseWidth = ref(0);
const diagramViewerBaseHeight = ref(0);
const diagramViewerContentRef = ref<HTMLElement | null>(null);
const diagramViewerMinScale = 0.4;
const diagramViewerMaxScale = 3;
const viewerLockOwner = Symbol("markdown-preview-viewer");
const diagramFenceLanguages = new Set(["mermaid", "mmd", "flowchart", "flow", "sequence"]);

interface DiagramSourceEditState {
  editor: HTMLTextAreaElement;
  frozenHtml: string;
  value: string;
  lastEmittedSource: string;
}

interface MarkdownPreviewSelection {
  selectionStart: number;
  selectionEnd: number;
}

interface MarkdownSourceLine {
  start: number;
  end: number;
  text: string;
  ending: string;
}

interface DiagramSourceLocation {
  openingPrefix: string;
  quoteSignature: string;
  bodyStart: number;
  closingStart: number;
  bodyLines: MarkdownSourceLine[];
}

interface DiagramMouseDownState {
  element: HTMLElement;
  wasOpen: boolean;
}

const diagramSourceEdit = shallowRef<DiagramSourceEditState | null>(null);
let diagramMouseDownState: DiagramMouseDownState | null = null;

const html = computed(() => {
  if (diagramSourceEdit.value) return diagramSourceEdit.value.frozenHtml;
  return sanitizeMarkdownHtml(renderMarkdown(props.source, {
    basePath: props.basePath,
    documentSource: props.documentSource,
    sourceOffset: props.sourceOffset,
    outline: props.outline,
    settings: props.settings,
    assetResolver: resolveLocalAsset,
  }));
});

const previewStyle = computed(() => ({
  fontSize: `${props.settings.fontSize}px`,
}));

const diagramViewerContentStyle = computed(() => {
  if (diagramViewerBaseWidth.value <= 0 || diagramViewerBaseHeight.value <= 0) {
    return {};
  }

  return getViewerContentStyle({
    width: diagramViewerBaseWidth.value,
    height: diagramViewerBaseHeight.value,
  }, diagramViewerScale.value, diagramViewerMinScale, diagramViewerMaxScale);
});

onMounted(() => {
  previewUnmounted = false;
  scheduleDiagramRender();
});
onUpdated(scheduleDiagramRender);
onBeforeUnmount(() => {
  flushDiagramSourceEdit();
  previewUnmounted = true;
  diagramRenderRequested = false;
  diagramRenderQueued = false;
  diagramDelayedCheckPending = false;
  window.clearTimeout(diagramRenderTimer);
  clearDiagramClickTimer();
  diagramMouseDownState = null;
  window.removeEventListener("keydown", handleWindowKeydown);
  releaseViewerBodyLock(viewerLockOwner);
});

watch(diagramViewerVisible, (visible) => {
  if (visible) {
    window.addEventListener("keydown", handleWindowKeydown);
    acquireViewerBodyLock(viewerLockOwner);
    return;
  }

  window.removeEventListener("keydown", handleWindowKeydown);
  releaseViewerBodyLock(viewerLockOwner);
});

watch(
  () => props.readonly,
  (readonly) => {
    if (!readonly) return;
    clearDiagramClickTimer();
    diagramMouseDownState = null;
    flushDiagramSourceEdit();
    diagramSourceEdit.value = null;
    sourceVisible.value = false;
    rootRef.value?.querySelectorAll(".diagram-box.show-source")
      .forEach((element) => element.classList.remove("show-source"));
  },
);

watch(
  () => props.source,
  (source) => {
    const edit = diagramSourceEdit.value;
    if (!edit) return;
    edit.value = edit.editor.value;
    if (source === edit.lastEmittedSource) return;
    emitDiagramSource(edit, source, true);
  },
);

watch(
  [
    () => props.source,
    () => props.settings.extensions.mermaid,
    () => props.settings.extensions.flowchart,
    () => props.settings.extensions.sequence,
  ],
  scheduleDiagramRender,
  { flush: "post" },
);

function handleMouseDown(event: MouseEvent) {
  diagramMouseDownState = null;
  if (event.button !== 0) return;

  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".diagram-source-panel")) {
    event.stopPropagation();
    return;
  }

  const diagramElement = target?.closest<HTMLElement>(".diagram-box");
  if (!diagramElement || !rootRef.value?.contains(diagramElement) || props.readonly) return;

  event.preventDefault();
  event.stopPropagation();
  const wasOpen = diagramElement.classList.contains("show-source");
  diagramMouseDownState = { element: diagramElement, wasOpen };
  if (!wasOpen) openDiagramSource(diagramElement);
}

function handleClick(event: MouseEvent) {
  const mouseDownState = diagramMouseDownState;
  diagramMouseDownState = null;
  const target = event.target as HTMLElement | null;
  if (target?.closest(".diagram-source-panel")) {
    event.stopPropagation();
    return;
  }

  const checkbox = target?.closest<HTMLInputElement>("input.task-list-item-checkbox");
  if (checkbox && rootRef.value) {
    event.preventDefault();
    event.stopPropagation();
    if (props.readonly) return;
    const boxes = Array.from(rootRef.value.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox"));
    const order = boxes.indexOf(checkbox);
    if (order >= 0) {
      emit("toggleTask", order);
    }
    return;
  }

  const imageElement = target?.closest<HTMLImageElement>("img");
  if (imageElement && rootRef.value?.contains(imageElement)) {
    if (props.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    showSourceEditor();
    return;
  }

  const anchorElement = target?.closest<HTMLAnchorElement>("a[href]");
  if (anchorElement && rootRef.value?.contains(anchorElement)) {
    const href = anchorElement.getAttribute("href");
    const action = getPreviewLinkAction(href);
    if (action === "blocked") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!props.readonly && !shouldOpenPreviewLink(event)) {
      event.preventDefault();
      event.stopPropagation();
      showSourceEditor();
      return;
    }
    if (action === "anchor" && href) {
      event.preventDefault();
      event.stopPropagation();
      if (!openLocalPreviewAnchor(href)) emit("openAnchor", href);
      return;
    }
    if (action === "external") {
      event.preventDefault();
      event.stopPropagation();
      if (href) emit("openAnchor", href);
      return;
    }
    const markdownPath = resolveLocalMarkdownHref(href, props.basePath);
    if (markdownPath) {
      event.preventDefault();
      event.stopPropagation();
      emit("openLink", markdownPath);
      return;
    }
    if ((action === "relative" || action === "local") && href) {
      event.preventDefault();
      event.stopPropagation();
      emit("openAnchor", href);
      return;
    }
  }

  const diagramElement = target?.closest<HTMLElement>(".diagram-box");
  if (diagramElement && rootRef.value?.contains(diagramElement)) {
    if (props.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    clearDiagramClickTimer();
    if (mouseDownState?.element === diagramElement && !mouseDownState.wasOpen) return;
    if (!diagramElement.classList.contains("show-source")) {
      openDiagramSource(diagramElement);
      return;
    }
    diagramClickTimer = window.setTimeout(() => {
      diagramClickTimer = 0;
      closeDiagramSource(diagramElement);
    }, 180);
    return;
  }

  showSourceEditor();
}

function handleDoubleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".diagram-source-panel")) {
    event.stopPropagation();
    return;
  }

  const imageElement = target?.closest<HTMLImageElement>("img");
  if (imageElement && rootRef.value?.contains(imageElement)) {
    openImageViewer(imageElement);
    return;
  }

  const diagramElement = target?.closest<HTMLElement>(".diagram-box");
  if (!diagramElement || !rootRef.value?.contains(diagramElement)) {
    return;
  }

  clearDiagramClickTimer();
  diagramMouseDownState = null;
  closeDiagramSource(diagramElement);
  openDiagramViewer(event, diagramElement);
}

function showSourceEditor() {
  if (props.readonly) return;
  sourceVisible.value = true;
  void nextTick(() => {
    const editor = sourceEditorRef.value;
    if (!editor) return;
    editor.style.height = "auto";
    editor.style.height = `${Math.max(32, editor.scrollHeight + 2)}px`;
    editor.focus();
    emitBlockSourceSelection(editor);
  });
}

function hideSourceEditor() {
  window.setTimeout(() => {
    if (document.activeElement !== sourceEditorRef.value) sourceVisible.value = false;
  }, 80);
}

function handleBlockSourceInput(event: Event) {
  if (props.readonly) return;
  const editor = event.target as HTMLTextAreaElement;
  emit("replaceSource", editor.value);
  emitBlockSourceSelection(editor);
  editor.style.height = "auto";
  editor.style.height = `${Math.max(32, editor.scrollHeight + 2)}px`;
}

function handleBlockSourceSelection(event: Event) {
  const editor = event.target instanceof HTMLTextAreaElement ? event.target : null;
  if (!editor || props.readonly) return;
  emitBlockSourceSelection(editor);
}

function emitBlockSourceSelection(editor: HTMLTextAreaElement) {
  emit("selection", {
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd,
  });
}

function handleBlockSourceKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
    event.preventDefault();
    if (event.target instanceof HTMLTextAreaElement) {
      emitBlockSourceSelection(event.target);
    }
    sourceVisible.value = false;
  }
}

function openDiagramSource(diagramElement: HTMLElement) {
  if (props.readonly) return;
  const frozenHtml = html.value;
  diagramElement.classList.add("show-source");
  const editor = diagramElement.querySelector<HTMLTextAreaElement>(".diagram-source-editor");
  if (!editor) {
    diagramElement.classList.remove("show-source");
    return;
  }
  if (diagramSourceEdit.value?.editor !== editor) {
    diagramSourceEdit.value = {
      editor,
      frozenHtml,
      value: editor.value,
      lastEmittedSource: props.source,
    };
  }
  editor.focus();
  emitDiagramSourceSelection(editor);
  void nextTick(() => {
    if (diagramSourceEdit.value?.editor === editor && document.activeElement !== editor) {
      editor.focus();
    }
  });
}

function closeDiagramSource(diagramElement: HTMLElement) {
  if (!diagramElement.classList.contains("show-source")) return;
  const editor = diagramElement.querySelector<HTMLTextAreaElement>(".diagram-source-editor");
  if (editor) {
    commitDiagramSource(editor);
    emitDiagramSourceSelection(editor);
    editor.blur();
  }
  diagramElement.classList.remove("show-source");
  releaseDiagramSourceEdit(editor);
}

function clearDiagramClickTimer() {
  window.clearTimeout(diagramClickTimer);
  diagramClickTimer = 0;
}

function handleSourceEditorInput(event: Event) {
  const editor = event.target instanceof HTMLTextAreaElement
    ? event.target.closest<HTMLTextAreaElement>(".diagram-source-editor")
    : null;
  if (!editor || props.readonly) return;
  commitDiagramSource(editor);
  emitDiagramSourceSelection(editor);
}

function handleSourceEditorSelection(event: Event) {
  const editor = event.target instanceof HTMLTextAreaElement
    ? event.target.closest<HTMLTextAreaElement>(".diagram-source-editor")
    : null;
  if (!editor || props.readonly) return;
  emitDiagramSourceSelection(editor);
}

function handleSourceEditorBlur(event: FocusEvent) {
  const editor = event.target instanceof HTMLTextAreaElement
    ? event.target.closest<HTMLTextAreaElement>(".diagram-source-editor")
    : null;
  if (editor) {
    commitDiagramSource(editor);
    emitDiagramSourceSelection(editor);
    editor.closest<HTMLElement>(".diagram-box")?.classList.remove("show-source");
    releaseDiagramSourceEdit(editor);
  }
}

function handleSourceEditorKeydown(event: KeyboardEvent) {
  const editor = event.target instanceof HTMLTextAreaElement
    ? event.target.closest<HTMLTextAreaElement>(".diagram-source-editor")
    : null;
  if (!editor) {
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    commitDiagramSource(editor, true);
    emitDiagramSourceSelection(editor);
    return;
  }

  if (
    event.key === "Tab"
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
  ) {
    event.preventDefault();
    event.stopPropagation();
    const selectionStart = editor.selectionStart;
    const selectionEnd = editor.selectionEnd;
    const direction = editor.selectionDirection;
    const result = !event.shiftKey && selectionStart === selectionEnd
      ? {
          value: `${editor.value.slice(0, selectionStart)}\t${editor.value.slice(selectionEnd)}`,
          selectionStart: selectionStart + 1,
          selectionEnd: selectionStart + 1,
        }
      : indentSelection(
          editor.value,
          selectionStart,
          selectionEnd,
          event.shiftKey,
          props.settings.codeIndentSize,
        );
    editor.value = result.value;
    editor.setSelectionRange(result.selectionStart, result.selectionEnd, direction);
    commitDiagramSource(editor);
    emitDiagramSourceSelection(editor);
    editor.focus();
    return;
  }

  event.stopPropagation();
  if (
    event.key === "Escape"
    || ((event.ctrlKey || event.metaKey) && event.key === "Enter")
  ) {
    event.preventDefault();
    const diagramElement = editor.closest<HTMLElement>(".diagram-box");
    if (diagramElement) {
      closeDiagramSource(diagramElement);
    } else {
      commitDiagramSource(editor);
      emitDiagramSourceSelection(editor);
      editor.blur();
    }
  }
}

function commitDiagramSource(editor: HTMLTextAreaElement, force = false) {
  const edit = diagramSourceEdit.value;
  if (props.readonly && edit?.editor !== editor) return;
  if (!edit || edit.editor !== editor) {
    const next = replaceDiagramFenceSource(props.source, editor.value);
    if (next !== props.source) emit("replaceSource", next);
    return;
  }

  edit.value = editor.value;
  emitDiagramSource(edit, props.source, force);
}

function emitDiagramSource(edit: DiagramSourceEditState, source: string, force = false) {
  const next = replaceDiagramFenceSource(source, edit.value);
  if (next === source) {
    const changedFromLastEmission = next !== edit.lastEmittedSource;
    edit.lastEmittedSource = source;
    if (changedFromLastEmission) emit("replaceSource", next);
    return;
  }
  if (!force && next === edit.lastEmittedSource) return;
  edit.lastEmittedSource = next;
  emit("replaceSource", next);
}

function emitDiagramSourceSelection(editor: HTMLTextAreaElement) {
  const edit = diagramSourceEdit.value;
  const source = edit?.editor === editor ? edit.lastEmittedSource : props.source;
  const selectionStart = mapDiagramEditorOffset(source, editor.value, editor.selectionStart);
  const selectionEnd = mapDiagramEditorOffset(source, editor.value, editor.selectionEnd);
  emit("selection", {
    selectionStart: Math.min(selectionStart, selectionEnd),
    selectionEnd: Math.max(selectionStart, selectionEnd),
  });
}

function mapDiagramEditorOffset(source: string, editorValue: string, offset: number): number {
  const location = findDiagramSourceLocation(source);
  const normalizedValue = editorValue.replace(/[\r\n]+$/, "");
  const normalizedOffset = Math.max(0, Math.min(offset, normalizedValue.length));
  if (!location) return Math.min(normalizedOffset, source.length);

  const position = getTextLinePosition(normalizedValue, normalizedOffset);
  const line = location.bodyLines[position.lineIndex];
  if (!line) {
    return location.bodyLines.length === 0 ? location.bodyStart : location.closingStart;
  }

  const contentStart = getDiagramBodyContentStart(line, location);
  return Math.min(line.end, contentStart + position.column);
}

function getTextLinePosition(value: string, offset: number): { lineIndex: number; column: number } {
  const endingPattern = /\r\n|\r|\n/g;
  let lineIndex = 0;
  let lineStart = 0;
  let match: RegExpExecArray | null;

  while ((match = endingPattern.exec(value)) !== null) {
    const endingEnd = match.index + match[0].length;
    if (endingEnd > offset) break;
    lineIndex += 1;
    lineStart = endingEnd;
  }

  return {
    lineIndex,
    column: Math.max(0, offset - lineStart),
  };
}

function findDiagramSourceLocation(source: string): DiagramSourceLocation | null {
  const lines = collectMarkdownSourceLines(source);

  for (let openingIndex = 0; openingIndex < lines.length; openingIndex += 1) {
    const openingLine = lines[openingIndex];
    const opening = openingLine.text.match(/^((?:[ \t]{0,3}>[ \t]?)*[ \t]*)(`{3,}|~{3,})([^\r\n]*)$/);
    if (!opening) continue;

    const language = opening[3].trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!diagramFenceLanguages.has(language)) continue;

    const fenceCharacter = opening[2][0];
    if (!fenceCharacter) continue;
    const quoteSignature = getDiagramQuoteSignature(opening[1]);
    const closingPattern = new RegExp(
      `^((?:[ \\t]{0,3}>[ \\t]?)*[ \\t]*)${fenceCharacter}{${opening[2].length},}[ \\t]*$`,
    );

    for (let closingIndex = openingIndex + 1; closingIndex < lines.length; closingIndex += 1) {
      const closingLine = lines[closingIndex];
      const closing = closingLine.text.match(closingPattern);
      if (!closing || getDiagramQuoteSignature(closing[1]) !== quoteSignature) continue;

      return {
        openingPrefix: opening[1],
        quoteSignature,
        bodyStart: openingLine.end + openingLine.ending.length,
        closingStart: closingLine.start,
        bodyLines: lines.slice(openingIndex + 1, closingIndex),
      };
    }
  }

  return null;
}

function collectMarkdownSourceLines(source: string): MarkdownSourceLine[] {
  const lines: MarkdownSourceLine[] = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (!match[0] && match.index === source.length) break;
    lines.push({
      start: match.index,
      end: match.index + match[1].length,
      text: match[1],
      ending: match[2],
    });
    if (!match[2]) break;
  }

  return lines;
}

function getDiagramBodyContentStart(
  line: MarkdownSourceLine,
  location: DiagramSourceLocation,
): number {
  if (line.text.startsWith(location.openingPrefix)) {
    return line.start + location.openingPrefix.length;
  }
  if (!location.quoteSignature) return line.start;

  const prefix = line.text.match(/^((?:[ \t]{0,3}>[ \t]?)*[ \t]*)/);
  if (!prefix || getDiagramQuoteSignature(prefix[1]) !== location.quoteSignature) {
    return line.start;
  }
  return line.start + prefix[1].length;
}

function getDiagramQuoteSignature(prefix: string): string {
  return prefix.replace(/[^>]/g, "");
}

function flushDiagramSourceEdit() {
  const edit = diagramSourceEdit.value;
  if (!edit) return;
  edit.value = edit.editor.value;
  emitDiagramSource(edit, props.source);
}

function releaseDiagramSourceEdit(editor: HTMLTextAreaElement | null) {
  const edit = diagramSourceEdit.value;
  if (!edit || (editor && edit.editor !== editor)) return;
  void nextTick(() => {
    if (diagramSourceEdit.value === edit) diagramSourceEdit.value = null;
  });
}

function openDiagramViewer(event: MouseEvent, diagramElement: HTMLElement) {
  const diagramBody = diagramElement.querySelector<HTMLElement>(".mermaid, .flowchart-render, .sequence-render");
  if (!diagramBody || diagramBody.classList.contains("diagram-error")) {
    return;
  }

  const renderedSvg = diagramBody.querySelector<SVGElement>("svg");
  if (!renderedSvg) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  resetDiagramViewerZoom();
  diagramViewerHtml.value = renderedSvg.outerHTML;
  diagramViewerVisible.value = true;
  void nextTick(updateDiagramViewerBaseSize);
}

function openImageViewer(imageElement: HTMLImageElement) {
  const source = imageElement.currentSrc || imageElement.src;
  if (!source) return;

  resetDiagramViewerZoom();
  diagramViewerHtml.value = `<img src="${escapeAttribute(source)}" alt="${escapeAttribute(imageElement.alt || "")}">`;
  diagramViewerVisible.value = true;
  void nextTick(updateDiagramViewerBaseSize);
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function openLocalPreviewAnchor(href: string) {
  const id = decodePreviewAnchor(href);
  if (!id) return false;
  const editor = rootRef.value?.closest(".block-editor");
  const target = Array.from(editor?.querySelectorAll<HTMLElement>("[id]") ?? [])
    .find((element) => element.id === id);
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

function decodePreviewAnchor(href: string) {
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}

function closeDiagramViewer() {
  diagramViewerVisible.value = false;
  diagramViewerHtml.value = "";
  diagramViewerScale.value = 1;
  diagramViewerBaseWidth.value = 0;
  diagramViewerBaseHeight.value = 0;
}

function zoomDiagramViewer(delta: number) {
  diagramViewerScale.value = clampDiagramViewerScale(diagramViewerScale.value + delta);
}

function resetDiagramViewerZoom() {
  diagramViewerScale.value = 1;
}

function handleDiagramViewerWheel(event: WheelEvent) {
  zoomDiagramViewer(event.deltaY > 0 ? -0.15 : 0.15);
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!diagramViewerVisible.value) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeDiagramViewer();
    return;
  }

  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomDiagramViewer(0.2);
    return;
  }

  if (event.key === "-") {
    event.preventDefault();
    zoomDiagramViewer(-0.2);
    return;
  }

  if (event.key === "0") {
    event.preventDefault();
    resetDiagramViewerZoom();
  }
}

function updateDiagramViewerBaseSize() {
  const svg = diagramViewerContentRef.value?.querySelector<SVGSVGElement>("svg");
  const image = diagramViewerContentRef.value?.querySelector<HTMLImageElement>("img");
  if (!svg && !image) {
    diagramViewerBaseWidth.value = 0;
    diagramViewerBaseHeight.value = 0;
    return;
  }

  const renderedRect = (svg ?? image)?.getBoundingClientRect();
  const viewBox = svg?.viewBox.baseVal;
  const size = getViewerContentSize({
    viewBoxWidth: viewBox?.width,
    viewBoxHeight: viewBox?.height,
    svgWidth: svg?.getAttribute("width"),
    svgHeight: svg?.getAttribute("height"),
    naturalWidth: image?.naturalWidth,
    naturalHeight: image?.naturalHeight,
    renderedWidth: renderedRect?.width,
    renderedHeight: renderedRect?.height,
  });
  diagramViewerBaseWidth.value = size.width;
  diagramViewerBaseHeight.value = size.height;
}

function clampDiagramViewerScale(value: number) {
  return clampViewerScale(value, diagramViewerMinScale, diagramViewerMaxScale);
}

function scheduleDiagramRender() {
  if (previewUnmounted) return;
  diagramRenderRequested = true;
  scheduleDelayedDiagramCheck();
  if (diagramRenderQueued || diagramRenderRunning) return;

  diagramRenderQueued = true;
  void nextTick(() => {
    diagramRenderQueued = false;
    if (previewUnmounted) return;
    void flushDiagramRenderQueue();
  });
}

function scheduleDelayedDiagramCheck() {
  if (diagramRenderTimer || diagramDelayedCheckPending || previewUnmounted) return;
  diagramRenderTimer = window.setTimeout(() => {
    diagramRenderTimer = 0;
    if (previewUnmounted) return;
    if (diagramRenderRunning) {
      diagramDelayedCheckPending = true;
      return;
    }
    if (diagramRenderQueued) {
      diagramRenderQueued = false;
    }
    flushPendingDiagramNodes();
  }, 0);
}

function flushPendingDiagramNodes() {
  if (previewUnmounted || !hasPendingDiagramNodes()) return;
  diagramRenderRequested = true;
  void flushDiagramRenderQueue();
}

function hasPendingDiagramNodes(): boolean {
  return Boolean(rootRef.value?.querySelector([
    ".mermaid:not([data-rendered='true'])",
    ".flowchart-render:not([data-rendered='true'])",
    ".sequence-render:not([data-rendered='true'])",
  ].join(", ")));
}

async function flushDiagramRenderQueue() {
  if (previewUnmounted || diagramRenderRunning) return;
  diagramRenderRunning = true;
  try {
    while (diagramRenderRequested && !previewUnmounted) {
      diagramRenderRequested = false;
      try {
        await renderDiagrams();
      } catch (error) {
        console.error("图表渲染调度失败", error);
      }
    }
  } finally {
    diagramRenderRunning = false;
    if (diagramDelayedCheckPending) {
      diagramDelayedCheckPending = false;
      flushPendingDiagramNodes();
    }
  }
}

async function renderDiagrams() {
  await nextTick();
  const root = rootRef.value;
  if (!root || previewUnmounted) return;
  annotateStandaloneImageParagraphs(root);
  prepareRenderedImages(
    root,
    props.source,
    undefined,
    props.documentSource ?? props.source,
  );
  await Promise.all([
    renderMermaidBlocks(root),
    renderFlowchartBlocks(root),
    renderSequenceBlocks(root),
  ]);
}

function annotateStandaloneImageParagraphs(root: HTMLElement) {
  root.querySelectorAll<HTMLParagraphElement>("p").forEach((paragraph) => {
    paragraph.classList.toggle("standalone-image-paragraph", isStandaloneImageParagraph(paragraph));
  });
}

function isStandaloneImageParagraph(paragraph: HTMLParagraphElement) {
  const children = meaningfulChildNodes(paragraph);
  if (children.length !== 1) return false;

  const child = children[0];
  if (!(child instanceof HTMLElement)) return false;
  if (child.matches("img")) return true;
  if (!child.matches("a[href]")) return false;

  const linkedChildren = meaningfulChildNodes(child);
  return linkedChildren.length === 1
    && linkedChildren[0] instanceof HTMLImageElement;
}

function meaningfulChildNodes(element: Element) {
  return Array.from(element.childNodes).filter((node) => {
    if (node.nodeType === Node.TEXT_NODE) return Boolean(node.textContent?.trim());
    return node.nodeType === Node.ELEMENT_NODE;
  });
}

const mermaidConfig = {
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  flowchart: {
    htmlLabels: true,
  },
  themeVariables: {
    fontFamily: `"Inter", "Segoe UI", sans-serif`,
    primaryColor: "#eff6ff",
    primaryTextColor: "#1f2937",
    primaryBorderColor: "#93b5f6",
    lineColor: "#5b6f91",
    secondaryColor: "#f8fbff",
    tertiaryColor: "#eef4ff",
  },
} satisfies MermaidConfig;

let sequenceApiPromise: Promise<{
  Diagram: typeof import("@hackmd/js-sequence-diagrams/dist/parser/diagram.js").Diagram;
  DiagramPainter: typeof import("@hackmd/js-sequence-diagrams/dist/painter/DiagramPainter.js").DiagramPainter;
}> | null = null;
let diagramClickTimer = 0;
let diagramRenderTimer = 0;
let diagramRenderQueued = false;
let diagramRenderRunning = false;
let diagramRenderRequested = false;
let diagramDelayedCheckPending = false;
let previewUnmounted = false;

async function loadSequenceDiagram() {
  if (sequenceApiPromise) return sequenceApiPromise;
  sequenceApiPromise = (async () => {
    const [{ Diagram }, { DiagramPainter }] = await Promise.all([
      import("@hackmd/js-sequence-diagrams/dist/parser/diagram.js"),
      import("@hackmd/js-sequence-diagrams/dist/painter/DiagramPainter.js"),
    ]);
    return { Diagram, DiagramPainter };
  })();
  return sequenceApiPromise;
}

async function renderMermaidBlocks(root: HTMLElement) {
  if (!props.settings.extensions.mermaid) return;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".mermaid:not([data-rendered='true'])"));
  if (nodes.length === 0) return;

  const mermaid = await loadSharedMermaid(mermaidConfig);
  for (const node of nodes) {
    if (!isCurrentDiagramNode(root, node)) continue;
    const source = node.dataset.diagramSource || node.textContent || "";
    node.dataset.rendered = "true";
    node.dataset.diagramSource = source;
    node.classList.add("diagram-loading");

    try {
      const rendered = await enqueueMermaidRender(async () => {
        if (!isCurrentDiagramSource(root, node, source)) return null;
        return mermaid.render(nextMermaidRenderId(), source);
      });
      if (!rendered || !isCurrentDiagramSource(root, node, source)) continue;
      const { svg, bindFunctions } = rendered;
      node.innerHTML = svg;
      bindFunctions?.(node);
      node.classList.remove("diagram-loading");
    } catch (error) {
      if (!isCurrentDiagramSource(root, node, source)) continue;
      node.classList.remove("diagram-loading");
      node.classList.add("diagram-error");
      node.innerHTML = `<p>流程图渲染失败，请检查 Mermaid 语法。</p><pre>${escapeHtml(String(error))}</pre>`;
    }
  }
}

async function renderFlowchartBlocks(root: HTMLElement) {
  if (!props.settings.extensions.flowchart) return;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".flowchart-render:not([data-rendered='true'])"));
  if (nodes.length === 0) return;

  const mermaidNodes = nodes.filter((node) => isMermaidFlowchartSource(node.dataset.diagramSource || ""));
  const flowchartNodes = nodes.filter((node) => !mermaidNodes.includes(node));

  if (mermaidNodes.length > 0) {
    const mermaid = await loadSharedMermaid(mermaidConfig);
    for (const node of mermaidNodes) {
      if (!isCurrentDiagramNode(root, node)) continue;
      const source = node.dataset.diagramSource || "";
      node.dataset.rendered = "true";
      node.dataset.diagramSource = source;
      node.classList.add("diagram-loading");
      try {
        const rendered = await enqueueMermaidRender(async () => {
          if (!isCurrentDiagramSource(root, node, source)) return null;
          return mermaid.render(nextMermaidRenderId(), source);
        });
        if (!rendered || !isCurrentDiagramSource(root, node, source)) continue;
        const { svg, bindFunctions } = rendered;
        node.innerHTML = svg;
        bindFunctions?.(node);
        node.classList.remove("diagram-loading");
      } catch (error) {
        if (!isCurrentDiagramSource(root, node, source)) continue;
        node.classList.remove("diagram-loading");
        node.classList.add("diagram-error");
        node.innerHTML = `<p>流程图渲染失败，请检查 Mermaid 语法。</p><pre>${escapeHtml(String(error))}</pre>`;
      }
    }
  }

  if (flowchartNodes.length === 0) return;
  const module = await import("flowchart.js");
  const flowchart = module.default ?? module;

  for (const node of flowchartNodes) {
    if (!isCurrentDiagramNode(root, node)) continue;
    const source = node.dataset.diagramSource || "";
    node.dataset.rendered = "true";
    try {
      const chart = flowchart.parse(source);
      node.innerHTML = "";
      chart.drawSVG(node, {
        "line-width": 2,
        "line-length": 44,
        "text-margin": 10,
        "font-size": 14,
        "font-color": "#1f2937",
        "line-color": "#5b6f91",
        "element-color": "#93b5f6",
        fill: "#eff6ff",
        "yes-text": "是",
        "no-text": "否",
      });
    } catch (error) {
      node.classList.add("diagram-error");
      node.innerHTML = `<p>Flowchart 渲染失败，请检查语法。</p><pre>${escapeHtml(String(error))}</pre>`;
    }
  }
}

async function renderSequenceBlocks(root: HTMLElement) {
  if (!props.settings.extensions.sequence) return;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".sequence-render:not([data-rendered='true'])"));
  if (nodes.length === 0) return;

  let sequence: Awaited<ReturnType<typeof loadSequenceDiagram>>;
  try {
    sequence = await loadSequenceDiagram();
  } catch (error) {
    nodes.forEach((node) => {
      if (!isCurrentDiagramNode(root, node)) return;
      const source = node.dataset.diagramSource || node.textContent || "";
      renderSequenceError(node, source, error);
    });
    return;
  }

  for (const node of nodes) {
    if (!isCurrentDiagramNode(root, node)) continue;
    const source = node.dataset.diagramSource || node.textContent || "";
    node.dataset.rendered = "true";
    node.dataset.diagramSource = source;
    node.classList.add("diagram-loading");
    try {
      const diagram = sequence.Diagram.parse(source);
      node.innerHTML = "";
      new sequence.DiagramPainter(diagram).drawSvg(node, { theme: "simple" });
      if (!node.querySelector("svg")) throw new Error("Sequence 渲染器未生成 SVG");
      node.classList.remove("diagram-loading", "diagram-error");
    } catch (error) {
      renderSequenceError(node, source, error);
    }
  }
}

function isCurrentDiagramNode(root: HTMLElement, node: HTMLElement): boolean {
  return !previewUnmounted
    && rootRef.value === root
    && root.contains(node);
}

function isCurrentDiagramSource(root: HTMLElement, node: HTMLElement, source: string): boolean {
  return isCurrentDiagramNode(root, node)
    && node.dataset.diagramSource === source;
}

function renderSequenceError(node: HTMLElement, source: string, error: unknown) {
  node.dataset.rendered = "true";
  node.dataset.diagramSource = source;
  node.classList.remove("diagram-loading");
  node.classList.add("diagram-error");
  node.innerHTML = [
    "<p>Sequence 时序图渲染失败，请检查语法。</p>",
    `<pre>${escapeHtml(source)}</pre>`,
    `<pre>${escapeHtml(String(error))}</pre>`,
  ].join("");
}

function isMermaidFlowchartSource(source: string): boolean {
  return /^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/im.test(source)
    || /^\s*subgraph(?:\s+|$)/im.test(source);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
</script>

<style scoped>
.markdown {
  font-family: "Open Sans", "Clear Sans", "Helvetica Neue", Helvetica, Arial, "Segoe UI Emoji", "SF Pro", sans-serif;
  line-height: 1.6;
}

.markdown-inner {
  --markdown-text: #333333;
  --markdown-muted: #777777;
  --markdown-border: #dfe2e5;
  --markdown-heading-rule: #eeeeee;
  --markdown-horizontal-rule: #e7e7e7;
  --markdown-link: #4183c4;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--reading-max-width);
  margin: 0 auto;
  padding: 30px 30px 100px;
  color: var(--markdown-text);
  text-rendering: auto;
  word-break: normal;
  word-wrap: break-word;
}

:global([data-theme="dark"] .markdown-inner) {
  --markdown-text: var(--text-main);
  --markdown-muted: var(--muted);
  --markdown-border: var(--border);
  --markdown-heading-rule: var(--heading-rule);
  --markdown-horizontal-rule: var(--heading-rule);
  --markdown-link: var(--accent-strong);
}

.markdown-inner.is-block-editor-child {
  padding: 0;
}
.preview-source-editor {
  display: block;
  width: 100%;
  max-width: var(--reading-max-width);
  min-height: 2rem;
  margin: 0.25rem auto 0.45rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.82rem;
  line-height: 1.55;
  outline: none;
  overflow: hidden;
  padding: 0.2rem 0.5rem;
  resize: none;
}

.preview-source-editor:focus {
  color: var(--text-main);
}

.markdown-inner.is-block-editor-child :deep(> :first-child) {
  margin-top: 0;
}

.markdown-inner.is-block-editor-child :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-inner :deep(h1),
.markdown-inner :deep(h2),
.markdown-inner :deep(h3),
.markdown-inner :deep(h4),
.markdown-inner :deep(h5),
.markdown-inner :deep(h6) {
  margin: 1rem 0;
  font-weight: 700;
  line-height: 1.4;
  scroll-margin-top: 1.2rem;
  white-space: pre-wrap;
}

.markdown-inner :deep(h1) {
  border-bottom: 1px solid var(--markdown-heading-rule);
  padding-bottom: 0.125em;
  font-size: 2.25em;
  line-height: 1.2;
}

.markdown-inner :deep(h2) {
  border-bottom: 1px solid var(--markdown-heading-rule);
  padding-bottom: 0.125em;
  font-size: 1.75em;
  line-height: 1.225;
}

.markdown-inner :deep(h3) {
  font-size: 1.5em;
  line-height: 1.43;
}

.markdown-inner :deep(h4) {
  font-size: 1.25em;
}

.markdown-inner :deep(h5),
.markdown-inner :deep(h6) {
  font-size: 1em;
}

.markdown-inner :deep(h6) {
  color: var(--markdown-muted);
}

.markdown-inner :deep(h1 code),
.markdown-inner :deep(h2 code),
.markdown-inner :deep(h3 code),
.markdown-inner :deep(h4 code),
.markdown-inner :deep(h5 code),
.markdown-inner :deep(h6 code) {
  font-size: inherit;
}

.markdown-inner :deep(h1 tt),
.markdown-inner :deep(h2 tt),
.markdown-inner :deep(h3 tt),
.markdown-inner :deep(h4 tt),
.markdown-inner :deep(h5 tt),
.markdown-inner :deep(h6 tt) {
  font-size: inherit;
}

.markdown-inner :deep(p),
.markdown-inner :deep(li) {
  color: var(--markdown-text);
}

.markdown-inner :deep(p) {
  margin: 0.8em 0;
}

.markdown-inner :deep(ul),
.markdown-inner :deep(ol) {
  color: var(--markdown-text);
  margin: 0.8em 0;
  padding-inline-start: 1.875rem;
}

.markdown-inner :deep(ul:first-child),
.markdown-inner :deep(ol:first-child) {
  margin-top: 0;
}

.markdown-inner :deep(ul:last-child),
.markdown-inner :deep(ol:last-child) {
  margin-bottom: 0;
}

.markdown-inner:not(.is-block-editor-child) :deep(> ul:first-child),
.markdown-inner:not(.is-block-editor-child) :deep(> ol:first-child) {
  margin-top: 0.8em;
}

.markdown-inner :deep(li) {
  margin: 0;
  padding-inline-start: 0;
  position: relative;
}

.markdown-inner :deep(ul) {
  list-style-type: disc;
}

.markdown-inner :deep(ul ul) {
  list-style-type: circle;
}

.markdown-inner :deep(ul ul ul) {
  list-style-type: square;
}

.markdown-inner :deep(ul > li)::marker {
  color: var(--markdown-text);
  font-size: 1.2em;
  font-weight: 650;
}

.markdown-inner :deep(li > ul),
.markdown-inner :deep(li > ol) {
  margin: 0;
}

.markdown-inner :deep(li > :first-child) {
  margin-top: 0;
}

.markdown-inner :deep(li > figure:last-child) {
  margin-bottom: 0.5rem;
}

.markdown-inner :deep(li > p),
.markdown-inner :deep(td p) {
  margin: 0.5rem 0;
  padding-inline-start: 0;
}

.markdown-inner :deep(dl) {
  margin: 0.8em 0;
}

.markdown-inner :deep(dt) {
  color: inherit;
  font-weight: 400;
  margin: 0;
}

.markdown-inner :deep(dd) {
  border: 0;
  color: inherit;
  margin: 0 0 0 40px;
  padding: 0;
}

.markdown-inner :deep(a) {
  color: var(--markdown-link);
}

.markdown-inner :deep(abbr[title]) {
  cursor: help;
  text-decoration: underline dotted;

}

.markdown-inner :deep(kbd) {
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

:global([data-theme="dark"] .markdown-inner kbd) {
  border-color: var(--border-strong);
  background: var(--panel-subtle);
  box-shadow: none;
  color: var(--text-main);
}

.markdown-inner :deep(code),
.markdown-inner :deep(tt) {
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f3f4f4;
  color: inherit;
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.9em;
  padding: 0 2px;
}

:global([data-theme="dark"] .markdown-inner code),
:global([data-theme="dark"] .markdown-inner tt) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}

.markdown-inner :deep(pre) {
  overflow-x: auto;
  border: 1px solid #e7eaed;
  border-radius: 3px;
  background: #f8f8f8;
  margin: 15px 0;
  padding: 8px 4px 6px;
  font-size: 0.9em;
  line-height: 1.5;
}

:global([data-theme="dark"] .markdown-inner pre) {
  border-color: var(--border);
  background: #111820;
}

.markdown-inner :deep(pre code) {
  border: 0;
  background: transparent;
  font-size: inherit;
  padding: 0;
}

.markdown-inner :deep(pre.code-with-line-numbers) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 0.85rem;
}

.markdown-inner :deep(pre.code-with-line-numbers::before) {
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

.markdown-inner.wrap-code-blocks :deep(pre) {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.markdown-inner :deep(blockquote) {
  border-left: 4px solid var(--markdown-border);
  border-radius: 0;
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  color: var(--markdown-muted);
  margin: 0.8em 0;
  padding: 0 15px;
}

.markdown-inner :deep(blockquote blockquote) {
  padding-right: 0;
}

.markdown-inner :deep(blockquote p),
.markdown-inner :deep(blockquote li) {
  color: inherit;
  padding-inline-start: 0;
}

.markdown-inner :deep(blockquote > :first-child) {
  margin-top: 0;
}

.markdown-inner :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

:global([data-theme="dark"] .markdown-inner blockquote) {
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
}

.markdown-inner :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.8em 0;
  padding: 0;
  word-break: initial;
}

.markdown-inner :deep(figure.table-figure) {
  overflow-x: auto;
  max-width: calc(100% + 16px);
  margin: 1.2em 0;
  padding: 0;
}

.markdown-inner :deep(figure:not(.table-figure)) {
  overflow-x: auto;
  max-width: calc(100% + 16px);
  margin: 1.2em 0;
}

.markdown-inner :deep(figure.table-figure > table) {
  margin: 0;
}

.markdown-inner :deep(table tr) {
  border: 1px solid var(--markdown-border);
  margin: 0;
  padding: 0;
}

.markdown-inner :deep(table tr:nth-child(2n)),
.markdown-inner :deep(thead) {
  background: #f8f8f8;
}

.markdown-inner :deep(th) {
  border: 1px solid var(--markdown-border);
  border-bottom: 0;
  font-weight: 700;
  margin: 0;
  padding: 6px 13px;
  text-align: left;
}

.markdown-inner :deep(td) {
  border: 1px solid var(--markdown-border);
  min-width: 32px;
  margin: 0;
  padding: 6px 13px;
}

:global([data-theme="dark"] .markdown-inner table tr:nth-child(2n)),
:global([data-theme="dark"] .markdown-inner thead) {
  background: var(--panel-subtle);
}

.markdown-inner :deep(img) {
  display: inline-block;
  max-width: 100%;
  border-radius: 0;
  margin: 0;
  vertical-align: middle;
}

.markdown-inner :deep(img:not([height])) {
  height: auto;
}

.markdown-inner :deep(video) {
  display: block;
  max-width: 100%;
  margin: 0 auto;
}

.markdown-inner :deep(audio) {
  max-width: 100%;
}

.markdown-inner :deep(iframe) {
  width: 100%;
  max-width: 100%;
  border: 0;
  margin: 0 auto;
}

.markdown-inner :deep(.standalone-image-paragraph > img),
.markdown-inner :deep(.standalone-image-paragraph > a > img) {
  display: block;
  margin: auto;
}

.markdown-inner :deep(hr) {
  box-sizing: content-box;
  height: 2px;
  overflow: hidden;
  border: 0;
  background: var(--markdown-horizontal-rule);
  margin: 16px 0;
  padding: 0;
}

.markdown-inner :deep(.frontmatter-block) {
  overflow-x: hidden;
  border: 0;
  border-radius: 3px;
  background: #f7f7f7;
  color: var(--muted);
  font-size: 0.85em;
  line-height: 1.45;
  margin-top: 0;
  min-height: 0.8rem;
  padding: 1rem;
  white-space: pre-wrap;
}

:global([data-theme="dark"] .markdown-inner .frontmatter-block) {
  background: var(--panel-subtle);
}

.markdown-inner :deep(.toc-inline) {
  border: 0;
  background: transparent;
  font-size: 0.9em;
  margin: 20px 0 0;
  min-height: 3.58rem;
  padding: 0 0 20px;
}

.markdown-inner :deep(.toc-inline ul) {
  margin: 0;
  padding-left: 0;
}

.markdown-inner :deep(.toc-inline-item) {
  list-style: none;
  margin: 0;
}

.markdown-inner :deep(.toc-inline a) {
  text-decoration: none;
}

.markdown-inner :deep(.toc-inline a:hover) {
  text-decoration: underline;
}

.markdown-inner :deep(.toc-inline-item.lv-1) {
  font-weight: 700;
}

.markdown-inner :deep(.toc-inline-item.lv-2) {
  padding-left: 2em;
}

.markdown-inner :deep(.toc-inline-item.lv-3) {
  padding-left: 4em;
}

.markdown-inner :deep(.toc-inline-item.lv-4) {
  padding-left: 6em;
}

.markdown-inner :deep(.toc-inline-item.lv-5) {
  padding-left: 8em;
}

.markdown-inner :deep(.toc-inline-item.lv-6) {
  padding-left: 10em;
}

@media screen and (max-width: 48em) {
  .markdown-inner :deep(.toc-inline-item.lv-3) {
    padding-left: 3.5em;
  }

  .markdown-inner :deep(.toc-inline-item.lv-4) {
    padding-left: 5em;
  }

  .markdown-inner :deep(.toc-inline-item.lv-5) {
    padding-left: 6.5em;
  }

  .markdown-inner :deep(.toc-inline-item.lv-6) {
    padding-left: 8em;
  }
}

.markdown-inner :deep(.md-alert) {
  border: 0;
  border-left: 4px solid #0969da;
  border-radius: 0;
  background: transparent;
  color: inherit;
  margin: 0 0 16px;
  padding: 0 1em;
}

.markdown-inner :deep(.md-alert-title) {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0;
  padding: 0;
}

.markdown-inner :deep(.md-alert-title .md-alert-icon) {
  display: inline-block;
  width: 1em;
  height: 1em;
  fill: currentColor;
  margin-right: 1ch;
  overflow: visible;
  position: relative;
  top: 0.125em;
}

.markdown-inner :deep(.md-alert-note) {
  border-left-color: #0969da;
}

.markdown-inner :deep(.md-alert-note .md-alert-title) {
  color: #0969da;
}

.markdown-inner :deep(.md-alert-tip) {
  border-left-color: #1f883d;
}

.markdown-inner :deep(.md-alert-tip .md-alert-title) {
  color: #1f883d;
}

.markdown-inner :deep(.md-alert-important) {
  border-left-color: #8250df;
}

.markdown-inner :deep(.md-alert-important .md-alert-title) {
  color: #8250df;
}

.markdown-inner :deep(.md-alert-warning) {
  border-left-color: #9a6700;
}

.markdown-inner :deep(.md-alert-warning .md-alert-title) {
  color: #9a6700;
}

.markdown-inner :deep(.md-alert-caution) {
  border-left-color: #cf222e;
}

.markdown-inner :deep(.md-alert-caution .md-alert-title) {
  color: #cf222e;
}

.markdown-inner :deep(ul > .task-list-item),
.markdown-inner :deep(ol > .task-list-item) {
  list-style: none;
}

.markdown-inner::selection,
.markdown-inner :deep(::selection) {
  background: #dae3ea;
  color: inherit;
}

.markdown-inner :deep(.task-list-item-checkbox) {
  position: absolute;
  top: 0;
  left: 0;
  width: auto;
  height: auto;
  margin-left: -1.3em;
  margin-top: calc(1em - 10px);
  border: none;
  cursor: pointer;
}

.markdown-inner :deep(.diagram-box) {
  overflow-x: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  cursor: pointer;
  margin: 15px 0;
  padding: 0;
}

:global([data-theme="dark"] .markdown-inner .diagram-box) {
  border-color: transparent;
  background: transparent;
}

.markdown-inner :deep(.mermaid),
.markdown-inner :deep(.flowchart-render),
.markdown-inner :deep(.sequence-render) {
  min-width: 0;
  text-align: center;
}

.markdown-inner :deep(.mermaid svg),
.markdown-inner :deep(.flowchart-render svg),
.markdown-inner :deep(.sequence-render svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.markdown-inner :deep(.sequence-fallback) {
  margin: 0;
  text-align: left;
  white-space: pre-wrap;
}

.markdown-inner :deep(.diagram-error) {
  color: var(--danger);
  text-align: left;
}

.markdown-inner :deep(.diagram-source-panel) {
  display: none;
  margin-top: 0.85rem;
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
}

.markdown-inner :deep(.diagram-box.show-source .diagram-source-panel) {
  display: block;
}

.markdown-inner :deep(.diagram-source-title) {
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 650;
  margin-bottom: 0.45rem;
}

.markdown-inner :deep(.diagram-source-editor) {
  display: block;
  width: 100%;
  min-height: 140px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-subtle);
  color: var(--text-main);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.82rem;
  line-height: 1.55;
  padding: 0.7rem 0.75rem;
  resize: vertical;
  tab-size: 2;
  white-space: pre;
}

.markdown-inner :deep(.diagram-source-editor:focus) {
  border-color: var(--border-strong);
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}

.markdown-inner :deep(.footnotes) {
  color: var(--muted);
  font-size: 0.9em;
  margin: 1em 0;
  opacity: 0.8;
  padding: 0;
}

.markdown-inner :deep(.footnote-ref) {
  display: initial;
  border-radius: 4px;
  background: rgba(238, 238, 238, 0.7);
  color: #555555;
  cursor: pointer;
  margin-inline: 0;
  padding: 2px 4px;
}

.markdown-inner :deep(.footnote-ref a),
.markdown-inner :deep(.footnote-ref a:hover) {
  color: inherit;
  text-decoration: inherit;
  text-transform: inherit;
}

:global([data-theme="dark"] .markdown-inner .footnote-ref) {
  background: rgba(255, 255, 255, 0.12);
  color: var(--text-main);
}

.markdown-inner :deep(.math-inline) {
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  font-size: 0.95em;
  vertical-align: -0.08em;
}

.markdown-inner :deep(.math-block) {
  overflow-x: auto;
  margin: 16px 0;
  padding: 0;
  text-align: center;
}

.markdown-inner :deep(.math-inline mjx-container[jax="SVG"]),
.markdown-inner :deep(.math-block mjx-container[jax="SVG"]) {
  color: currentColor;
  max-width: 100%;
}

.markdown-inner :deep(.math-inline mjx-container[jax="SVG"] svg),
.markdown-inner :deep(.math-block mjx-container[jax="SVG"] svg) {
  max-width: 100%;
}

.markdown-inner :deep(.footnote-definition-block) {
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: var(--panel-subtle);
  color: var(--muted);
  font-family: "Lucida Console", Consolas, "Courier", monospace;
  font-size: 0.86em;
  margin: 0.8rem 0;
  padding: 0.7rem 0.85rem;
  white-space: pre-wrap;
}

:global(body.diagram-viewer-open) {
  overflow: hidden;
}

.diagram-viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 0.7rem;
  background: rgba(15, 23, 42, 0.92);
  padding: 0.75rem;
}

.diagram-viewer-toolbar {
  display: inline-flex;
  align-items: center;
  justify-self: end;
  gap: 0.45rem;
  min-width: 0;
}

.diagram-viewer-tool-wrap {
  position: relative;
  display: inline-flex;
}

.diagram-viewer-tool-wrap::after {
  position: absolute;
  right: 50%;
  bottom: -2.15rem;
  transform: translateX(50%);
  z-index: 2;
  content: attr(data-tip);
  pointer-events: none;
  opacity: 0;
  white-space: nowrap;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 7px;
  background: rgba(15, 23, 42, 0.94);
  color: #f8fafc;
  font-size: 0.72rem;
  line-height: 1;
  padding: 0.4rem 0.5rem;
  transition:
    opacity 0.14s ease,
    transform 0.14s ease;
}

.diagram-viewer-tool-wrap:hover::after {
  opacity: 1;
  transform: translateX(50%) translateY(2px);
}

.diagram-viewer-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.35rem;
  height: 2.35rem;
  border: 1px solid rgba(203, 213, 225, 0.38);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.94);
  color: #1f2937;
  cursor: pointer;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;
}

.diagram-viewer-tool:hover:not(:disabled) {
  border-color: rgba(147, 181, 246, 0.78);
  background: #fff;
  transform: translateY(-1px);
}

.diagram-viewer-tool:focus-visible {
  outline: 2px solid rgba(147, 197, 253, 0.72);
  outline-offset: 2px;
}

.diagram-viewer-tool:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.diagram-viewer-tool svg {
  width: 1.16rem;
  height: 1.16rem;
}

.diagram-viewer-stage {
  min-height: 0;
  overflow: auto;
  border: 1px solid rgba(203, 213, 225, 0.34);
  border-radius: 8px;
  background: #f8fafc;
  padding: 1.2rem;
}

.diagram-viewer-content {
  display: inline-block;
  min-width: max-content;
  min-height: max-content;
}

.diagram-viewer-content :deep(svg) {
  display: block;
  width: 100%;
  max-width: none !important;
  height: 100%;
  margin: 0 auto;
}

.diagram-viewer-content :deep(img) {
  display: block;
  width: 100%;
  max-width: none !important;
  height: 100%;
  object-fit: contain;
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

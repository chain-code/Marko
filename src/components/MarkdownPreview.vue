<template>
  <article
    ref="rootRef"
    class="markdown markdown-inner"
    :class="{ 'wrap-code-blocks': settings.codeWrap }"
    :style="previewStyle"
    v-html="html"
    @click.stop="handleClick"
    @dblclick="handleDoubleClick"
    @keydown.capture="handleSourceEditorKeydown"
    @blur.capture="handleSourceEditorBlur"
  />

  <textarea
    v-if="sourceVisible"
    ref="sourceEditorRef"
    class="preview-source-editor"
    :value="source"
    :spellcheck="settings.spellcheck"
    aria-label="Markdown 源码"
    @click.stop
    @input="handleBlockSourceInput"
    @keydown="handleBlockSourceKeydown"
    @blur="hideSourceEditor"
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
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from "vue";
import { renderMarkdown } from "@/utils/markdown";
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

const props = defineProps<{
  source: string;
  documentSource?: string;
  basePath?: string;
  outline: OutlineItem[];
  settings: EditorSettings;
}>();

const emit = defineEmits<{
  toggleTask: [order: number];
  replaceSource: [value: string];
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

const html = computed(() =>
  renderMarkdown(props.source, {
    basePath: props.basePath,
    documentSource: props.documentSource,
    outline: props.outline,
    settings: props.settings,
    assetResolver: resolveLocalAsset,
  }),
);

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

onMounted(renderDiagrams);
onUpdated(renderDiagrams);
onBeforeUnmount(() => {
  window.clearTimeout(diagramClickTimer);
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

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest(".diagram-source-panel")) {
    event.stopPropagation();
    return;
  }

  const checkbox = target?.closest<HTMLInputElement>("input.task-list-item-checkbox");
  if (checkbox && rootRef.value) {
    event.preventDefault();
    event.stopPropagation();
    const boxes = Array.from(rootRef.value.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox"));
    const order = boxes.indexOf(checkbox);
    if (order >= 0) {
      emit("toggleTask", order);
    }
    return;
  }

  const imageElement = target?.closest<HTMLImageElement>("img");
  if (imageElement && rootRef.value?.contains(imageElement)) {
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
    if (!shouldOpenPreviewLink(event)) {
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
    event.preventDefault();
    event.stopPropagation();
    window.clearTimeout(diagramClickTimer);
    diagramClickTimer = window.setTimeout(() => {
      toggleDiagramSource(diagramElement);
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

  window.clearTimeout(diagramClickTimer);
  openDiagramViewer(event, diagramElement);
}

function showSourceEditor() {
  sourceVisible.value = true;
  void nextTick(() => {
    const editor = sourceEditorRef.value;
    if (!editor) return;
    editor.style.height = "auto";
    editor.style.height = `${Math.max(32, editor.scrollHeight + 2)}px`;
    editor.focus();
  });
}

function hideSourceEditor() {
  window.setTimeout(() => {
    if (document.activeElement !== sourceEditorRef.value) sourceVisible.value = false;
  }, 80);
}

function handleBlockSourceInput(event: Event) {
  const editor = event.target as HTMLTextAreaElement;
  emit("replaceSource", editor.value);
  editor.style.height = "auto";
  editor.style.height = `${Math.max(32, editor.scrollHeight + 2)}px`;
}

function handleBlockSourceKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
    event.preventDefault();
    sourceVisible.value = false;
  }
}

function toggleDiagramSource(diagramElement: HTMLElement) {
  diagramElement.classList.toggle("show-source");
  if (diagramElement.classList.contains("show-source")) {
    void nextTick(() => {
      const editor = diagramElement.querySelector<HTMLTextAreaElement>(".diagram-source-editor");
      editor?.focus();
    });
  }
}

function handleSourceEditorBlur(event: FocusEvent) {
  const editor = event.target instanceof HTMLTextAreaElement
    ? event.target.closest<HTMLTextAreaElement>(".diagram-source-editor")
    : null;
  if (editor) {
    commitDiagramSource(editor);
  }
}

function handleSourceEditorKeydown(event: KeyboardEvent) {
  const editor = event.target instanceof HTMLTextAreaElement
    ? event.target.closest<HTMLTextAreaElement>(".diagram-source-editor")
    : null;
  if (!editor) {
    return;
  }

  event.stopPropagation();
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    commitDiagramSource(editor);
    editor.blur();
  }
}

function commitDiagramSource(editor: HTMLTextAreaElement) {
  const next = replaceDiagramFenceSource(props.source, editor.value);
  if (next !== props.source) {
    emit("replaceSource", next);
  }
}

function replaceDiagramFenceSource(blockSource: string, nextDiagramSource: string): string {
  const fence = blockSource.match(/(^|\n)(```+|~~~+)([^\n]*)\r?\n([\s\S]*?)\r?\n\2(?=\s*$|\n)/);
  if (!fence) {
    return blockSource;
  }

  const language = fence[3].trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!["mermaid", "mmd", "flowchart", "flow"].includes(language)) {
    return blockSource;
  }

  const prefix = `${fence[1]}${fence[2]}${fence[3]}\n`;
  const replacement = `${prefix}${nextDiagramSource.replace(/\s+$/, "")}\n${fence[2]}`;
  return `${blockSource.slice(0, fence.index)}${replacement}${blockSource.slice((fence.index ?? 0) + fence[0].length)}`;
}

function openDiagramViewer(event: MouseEvent, diagramElement: HTMLElement) {
  const diagramBody = diagramElement.querySelector<HTMLElement>(".mermaid, .flowchart-render");
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

async function renderDiagrams() {
  await nextTick();
  if (!rootRef.value) return;
  await Promise.all([renderMermaidBlocks(rootRef.value), renderFlowchartBlocks(rootRef.value)]);
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

let mermaidApi: typeof import("mermaid").default | null = null;
let diagramSequence = 0;
let diagramClickTimer = 0;

async function loadMermaid() {
  if (mermaidApi) return mermaidApi;
  const module = await import("mermaid");
  mermaidApi = module.default;
  mermaidApi.initialize(mermaidConfig);
  return mermaidApi;
}

async function renderMermaidBlocks(root: HTMLElement) {
  if (!props.settings.extensions.mermaid) return;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(".mermaid:not([data-rendered='true'])"));
  if (nodes.length === 0) return;

  const mermaid = await loadMermaid();
  for (const node of nodes) {
    const source = node.dataset.diagramSource || node.textContent || "";
    node.dataset.rendered = "true";
    node.dataset.diagramSource = source;
    node.classList.add("diagram-loading");

    try {
      const id = `marko-mermaid-${Date.now()}-${++diagramSequence}`;
      const { svg, bindFunctions } = await mermaid.render(id, source);
      node.innerHTML = svg;
      bindFunctions?.(node);
      node.classList.remove("diagram-loading");
    } catch (error) {
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
    const mermaid = await loadMermaid();
    for (const node of mermaidNodes) {
      const source = node.dataset.diagramSource || "";
      node.dataset.rendered = "true";
      node.classList.add("diagram-loading");
      try {
        const id = `marko-mermaid-${Date.now()}-${++diagramSequence}`;
        const { svg, bindFunctions } = await mermaid.render(id, source);
        node.innerHTML = svg;
        bindFunctions?.(node);
        node.classList.remove("diagram-loading");
      } catch (error) {
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
  line-height: 1.74;
}

.markdown-inner {
  width: 100%;
  max-width: var(--reading-max-width);
  margin: 0 auto;
  padding: 0.2rem 0.5rem 0.35rem;
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
  font-family: "JetBrains Mono", Consolas, monospace;
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

.markdown-inner :deep(> :first-child) {
  margin-top: 0;
}

.markdown-inner :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-inner :deep(h1),
.markdown-inner :deep(h2),
.markdown-inner :deep(h3),
.markdown-inner :deep(h4),
.markdown-inner :deep(h5),
.markdown-inner :deep(h6) {
  line-height: 1.24;
  font-weight: 620;
  scroll-margin-top: 1.2rem;
}

.markdown-inner :deep(h1) {
  border-bottom: 1px solid var(--heading-rule);
  font-size: 2.05rem;
  margin: 0 0 1.15rem;
  padding-bottom: 0.55rem;
}

.markdown-inner :deep(h2) {
  border-bottom: 1px solid var(--heading-rule);
  font-size: 1.35rem;
  margin-top: 2.05rem;
  margin-bottom: 0.86rem;
}

.markdown-inner :deep(h3) {
  font-size: 1.16rem;
  margin-top: 1.55rem;
  margin-bottom: 0.65rem;
  padding-left: 0.9rem;
}

.markdown-inner :deep(h4),
.markdown-inner :deep(h5),
.markdown-inner :deep(h6) {
  color: #31415b;
  font-size: 1.02rem;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  padding-left: 1.2rem;
}

:root[data-theme="dark"] .markdown-inner :deep(h4),
:root[data-theme="dark"] .markdown-inner :deep(h5),
:root[data-theme="dark"] .markdown-inner :deep(h6) {
  color: var(--text);
}

.markdown-inner :deep(p),
.markdown-inner :deep(li) {
  color: var(--text-main);
}

.markdown-inner :deep(p) {
  margin: 0.8em 0;
  padding-inline-start: 0.48rem;
  word-break: break-word;
}

.markdown-inner :deep(h1 + p),
.markdown-inner :deep(h2 + p),
.markdown-inner :deep(h3 + p),
.markdown-inner :deep(h4 + p) {
  padding-inline-start: 0.22rem;
}

.markdown-inner :deep(ul),
.markdown-inner :deep(ol) {
  color: var(--text-main);
  margin: 0.8em 0;
  padding-inline-start: 1.875rem;
}

.markdown-inner :deep(li) {
  margin: 0;
  padding-inline-start: 0.1rem;
}

.markdown-inner :deep(ul > li)::marker {
  color: var(--text-main);
  font-size: 1.2em;
  font-weight: 650;
}

.markdown-inner :deep(li > ul),
.markdown-inner :deep(li > ol) {
  margin: 0;
}

.markdown-inner :deep(li > p),
.markdown-inner :deep(blockquote p),
.markdown-inner :deep(td p) {
  margin: 0.45rem 0;
  padding-inline-start: 0;
}

.markdown-inner :deep(dl) {
  margin: 1rem 0;
  padding-inline-start: 0.5rem;
}

.markdown-inner :deep(dt) {
  color: var(--text);
  font-weight: 650;
  margin-top: 0.8rem;
}

.markdown-inner :deep(dd) {
  border-left: 2px solid #d8e5ff;
  color: var(--text-main);
  margin: 0.28rem 0 0.56rem 0.85rem;
  padding-left: 0.75rem;
}

.markdown-inner :deep(a) {
  color: var(--accent-strong);
  text-decoration: underline;
  text-decoration-color: rgba(37, 99, 235, 0.35);
  text-underline-offset: 0.16rem;
}

.markdown-inner :deep(a:hover) {
  text-decoration-color: rgba(37, 99, 235, 0.6);
}

.markdown-inner :deep(abbr[title]) {
  cursor: help;
  text-decoration: underline dotted rgba(37, 99, 235, 0.55);
  text-underline-offset: 0.16rem;
}

.markdown-inner :deep(code) {
  border: 1px solid #dbe3f0;
  border-radius: 6px;
  background: #f5f8fd;
  color: #223046;
  padding: 0.08rem 0.35rem;
  font-size: 0.86em;
}

:root[data-theme="dark"] .markdown-inner :deep(code) {
  border-color: var(--border);
  background: #202833;
  color: #e5edf8;
}

.markdown-inner :deep(pre) {
  overflow-x: auto;
  border: 1px solid #dbe3f0;
  border-radius: 8px;
  background: #f8fbff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
  margin: 1.08rem 0;
  padding: 1rem;
}

:root[data-theme="dark"] .markdown-inner :deep(pre) {
  border-color: var(--border);
  background: #111820;
}

.markdown-inner :deep(pre code) {
  border: 0;
  background: transparent;
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
  font-family: "JetBrains Mono", Consolas, monospace;
  line-height: 1.5;
  padding-right: 0.72rem;
  text-align: right;
  white-space: pre;
  user-select: none;
}

.markdown-inner.wrap-code-blocks :deep(pre code) {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.markdown-inner :deep(blockquote) {
  border-left: 3px solid var(--border);
  border-radius: 0 8px 8px 0;
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
  margin: 1.05rem 0;
  padding: 0.75rem 1rem;
}

:root[data-theme="dark"] .markdown-inner :deep(blockquote) {
  background: color-mix(in srgb, var(--panel-subtle) 40%, var(--panel));
}

.markdown-inner :deep(table) {
  display: block;
  overflow-x: auto;
  width: 100%;
  border-collapse: collapse;
  margin: 0.8em 0;
}

.markdown-inner :deep(th) {
  text-align: left;
  font-weight: 600;
}

.markdown-inner :deep(th),
.markdown-inner :deep(td) {
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
}

.markdown-inner :deep(thead th) {
  background: #f7f9fc;
}

:root[data-theme="dark"] .markdown-inner :deep(thead th) {
  background: #1c2632;
}

.markdown-inner :deep(img) {
  display: block;
  max-width: 100%;
  border-radius: 8px;
  margin: 1rem auto;
}

.markdown-inner :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 1.1rem 0;
}

.markdown-inner :deep(.frontmatter-block) {
  border-color: #d9e4f5;
  background: #f7fbff;
  color: var(--muted);
}

.markdown-inner :deep(.toc-inline) {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-subtle);
  margin: 1rem 0;
  padding: 0.75rem 1rem;
}

.markdown-inner :deep(.toc-inline ul) {
  margin: 0;
  padding-left: 1rem;
}

.markdown-inner :deep(.toc-inline-item) {
  list-style: none;
  margin: 0.28rem 0;
}

.markdown-inner :deep(.toc-inline-item.lv-2) {
  padding-left: 1rem;
}

.markdown-inner :deep(.toc-inline-item.lv-3),
.markdown-inner :deep(.toc-inline-item.lv-4),
.markdown-inner :deep(.toc-inline-item.lv-5) {
  padding-left: 2rem;
}

.markdown-inner :deep(.md-alert) {
  border: 1px solid var(--border);
  border-left-width: 4px;
  border-radius: 8px;
  background: var(--panel-subtle);
  margin: 1.05rem 0;
  padding: 0.75rem 1rem;
}

.markdown-inner :deep(.md-alert-title) {
  color: var(--text);
  font-size: 0.84rem;
  font-weight: 700;
  margin: 0 0 0.45rem;
  padding: 0;
}

.markdown-inner :deep(.md-alert-note),
.markdown-inner :deep(.md-alert-tip) {
  border-left-color: var(--accent);
}

.markdown-inner :deep(.md-alert-warning),
.markdown-inner :deep(.md-alert-caution) {
  border-left-color: var(--warning);
  background: var(--warning-soft);
}

.markdown-inner :deep(.md-alert-important) {
  border-left-color: var(--danger);
  background: var(--danger-soft);
}

.markdown-inner :deep(.task-list-item) {
  list-style: none;
}

.markdown-inner :deep(.task-list-item-checkbox) {
  width: 1rem;
  height: 1rem;
  margin: 0 0.48rem 0 -1.35rem;
  vertical-align: -0.16rem;
  cursor: pointer;
}

.markdown-inner :deep(.diagram-box) {
  overflow-x: auto;
  border: 1px solid #dbe3f0;
  border-radius: 8px;
  background: #fbfdff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  cursor: pointer;
  margin: 1.08rem 0;
  padding: 1rem;
}

:root[data-theme="dark"] .markdown-inner :deep(.diagram-box) {
  border-color: var(--border);
  background: #111820;
}

.markdown-inner :deep(.mermaid),
.markdown-inner :deep(.flowchart-render) {
  min-width: 0;
  text-align: center;
}

.markdown-inner :deep(.mermaid svg),
.markdown-inner :deep(.flowchart-render svg) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
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
  font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
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
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.9em;
  margin-top: 2rem;
  padding-top: 1rem;
}

.markdown-inner :deep(.math-inline) {
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  vertical-align: -0.08em;
}

.markdown-inner :deep(.math-block) {
  overflow-x: auto;
  margin: 1.05rem 0;
  padding: 0.35rem 0;
  text-align: center;
}

.markdown-inner :deep(.footnote-definition-block) {
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: var(--panel-subtle);
  color: var(--muted);
  font-family: "JetBrains Mono", Consolas, monospace;
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
</style>

<template>
  <section
    ref="root"
    class="marko-markdown-body"
    :data-theme="resolved.theme"
    :style="surfaceStyle"
    @keydown="onKeydown"
    @keydown.capture="onKeydownCapture"
    @mousedown.capture="onMouseDownCapture"
    @dblclick="onDoubleClick"
  >
    <!-- 编辑区就是这个元素本身；Typora 的主题按 #write 写样式（A-3） -->
    <div id="write" ref="write" class="marko-editor-surface" :spellcheck="resolved.spellcheck" />
    <!-- 浮在编辑区上的界面：代码块的语言（B-6）、表格工具条（T-5） -->
    <CodeLanguage :editor="editor" :container="root" :placeholder="texts.codeLanguage" />
    <TableToolbar :editor="editor" :container="root" />
    <TableSizeDialog v-model:open="tableDialog" @confirm="insertTable" @closed="focus" />
    <MediaViewer ref="viewer" />
    <!-- I-5 Emoji 补全的列表、B-13 Callout 的种类、B-11/B-16 脚注和缩写的提示框 -->
    <EmojiList :state="emoji.state" />
    <CalloutKind :editor="editor" :container="root" />
    <HoverTip :container="root" />
  </section>
</template>

<script setup lang="ts">
// 编辑器组件（K-1）：对外的属性、事件、方法和旧版库的 MarkoMarkdownBody 相同。
// 编辑器本身是 @marko/editor（Tiptap）；这里管设置换算、v-model、大纲、保存和打开的快捷键、图片的插入请求
import {
  buildDocSourceMap,
  createMarkoEditor,
  getMarkdown,
  mediaKindOf,
  refreshCodeViews,
  setMarkdown,
  setSettings,
  setSyntax,
  sourceModeOf,
  toggleSourceMode,
  toModel,
  type EditorHost,
} from "@marko/editor";
import { collectOutline } from "@marko/markdown";
import type { Editor } from "@tiptap/core";
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from "vue";
import { resolveSettings } from "./defaults.ts";
import { defaultDiagramRenderer } from "./diagrams.ts";
import TableSizeDialog from "./dialogs/TableSizeDialog.vue";
import { mergeTexts, TEXTS } from "./texts.ts";
import { resolveLocalMarkdownHref } from "./localLinks.ts";
import MediaViewer from "./MediaViewer.vue";
import CodeLanguage from "./overlays/CodeLanguage.vue";
import TableToolbar from "./overlays/TableToolbar.vue";
import CalloutKind from "./overlays/CalloutKind.vue";
import EmojiList from "./overlays/EmojiList.vue";
import HoverTip from "./overlays/HoverTip.vue";
import { createEmojiBridge } from "./overlays/emojiBridge.ts";
import { coreSettings, coreSyntax } from "./settings.ts";
import { ensureDarkTheme } from "./theme.ts";
import type { EditorSettings, ImageInsertRequest, MarkoEditorHost, MarkoMarkdownBodyHandle, OutlineItem } from "./types.ts";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    readOnly?: boolean;
    filePath?: string;
    settings?: Partial<EditorSettings>;
    /**
     * 外部能力（K-2，可选）：桌面应用给本地资源的地址、保存图片、画图表这些。
     * 不给的那几项用默认的：链接、图片发事件（openAnchor、imageData）给宿主处理
     */
    host?: Partial<MarkoEditorHost>;
  }>(),
  { readOnly: true, filePath: "", settings: () => ({}), host: undefined },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
  saveAs: [];
  open: [];
  imageData: [payload: ImageInsertRequest];
  openLink: [path: string];
  openAnchor: [href: string];
  outlineChange: [outline: OutlineItem[]];
}>();

const resolved = computed(() => resolveSettings(props.settings));
const surfaceStyle = computed(() => ({
  "--md-font-size": `${resolved.value.fontSize}px`,
  "--md-content-width": `${resolved.value.lineWidth}px`,
  zoom: resolved.value.zoom === 1 ? undefined : String(resolved.value.zoom),
}));

const root = ref<HTMLElement | null>(null);
const write = ref<HTMLElement | null>(null);
const editor = shallowRef<Editor | null>(null);
/** 编辑器里现在的原文（自己发出去的 v-model 值）：modelValue 变成别的时才是外面换了文档 */
let current = props.modelValue;

// ---------------------------------------------------------------------------
// 宿主

/** 等宿主保存的图片：imageData 发出去的占位 → 编辑器在等的结果 */
const pendingImages = new Map<string, (result: { url: string; alt?: string } | null) => void>();
let imageCounter = 0;

function requestImage(file: Blob, name: string): Promise<{ url: string; alt?: string } | null> {
  return new Promise((resolve) => {
    imageCounter += 1;
    const placeholder = `marko-image-${Date.now()}-${imageCounter}`;
    pendingImages.set(placeholder, resolve);
    const payload = file instanceof File ? file : new File([file], name, { type: file.type });
    // 视频、音频（M-7）也走这里：kind 告诉宿主是哪种
    emit("imageData", { name, file: payload, placeholder, kind: mediaKindOf(payload.type) ?? "image" });
  });
}

/** Emoji 补全的列表（I-5）：编辑器核心的候选、键盘处理 + Element Plus 的弹出框 */
const emoji = createEmojiBridge();

/** 组件里的文字（K-2、L-2）：宿主给的补上默认的；浮层、小窗口 inject 这一份 */
const texts = computed(() => mergeTexts(props.host?.texts));
provide(TEXTS, texts);

const host: EditorHost = {
  resolveUrl: (url, kind) => props.host?.resolveUrl?.(url, kind) ?? url,
  openLink: (url) => {
    if (props.host?.openLink) {
      props.host.openLink(url);
      return;
    }
    // K-1：同旧版库——本地的 Markdown 文件发 openLink（按文档的位置解析好的路径），别的链接发 openAnchor
    const path = resolveLocalMarkdownHref(url, props.filePath || undefined);
    if (path) emit("openLink", path);
    else emit("openAnchor", url);
  },
  saveImage: (file, name) => (props.host?.saveImage ? props.host.saveImage(file, name) : requestImage(file, name)),
  // 有没有画图表的能力看宿主给没给（编辑器用到时才读）；没给时用库自带的沙箱（diagrams.ts），按组件的主题画
  get renderDiagram() {
    if (props.host?.renderDiagram) return props.host.renderDiagram;
    const fallback = defaultDiagramRenderer();
    return fallback
      ? (kind: string, source: string) => fallback(kind, source, resolved.value.theme === "dark" ? "dark" : "light", texts.value.diagramUnsupported)
      : undefined;
  },
  // 命令插进文档的占位（表头、链接文本……）：编辑器用到时现取
  get texts() {
    return texts.value;
  },
  reportError: (message) => {
    if (props.host?.reportError) props.host.reportError(message);
    else console.error(message);
  },
};

// ---------------------------------------------------------------------------
// 大纲（旧版同样的节奏：只读时马上算，编辑时停 160 毫秒再算）

let outlineSignature = "";
let outlineTimer: ReturnType<typeof setTimeout> | undefined;

function computeOutline(instance: Editor): OutlineItem[] {
  const doc = instance.state.doc;
  const { map } = buildDocSourceMap(doc);
  return collectOutline(toModel(doc), { syntax: instance.storage.marko.syntax, map }).map(({ id, title, level, line }) => ({ id, title, level, line }));
}

function updateOutline(force = false): void {
  clearTimeout(outlineTimer);
  outlineTimer = undefined;
  const instance = editor.value;
  if (!instance) return;
  const outline = computeOutline(instance);
  const signature = outline.map((item) => `${item.level}:${item.line}:${item.id}:${item.title}`).join("\n");
  if (signature === outlineSignature && !force) return;
  outlineSignature = signature;
  emit("outlineChange", outline);
}

function scheduleOutline(): void {
  clearTimeout(outlineTimer);
  if (props.readOnly) updateOutline();
  else outlineTimer = setTimeout(() => updateOutline(), 160);
}

// ---------------------------------------------------------------------------
// 设置

function applyModes(instance: Editor, settings: EditorSettings): void {
  if (instance.storage.marko.focusMode !== settings.focusMode) instance.commands.toggleFocusMode();
  if (instance.storage.marko.typewriterMode !== settings.typewriterMode) instance.commands.toggleTypewriterMode();
  if (Boolean(sourceModeOf(instance)) !== settings.sourceMode) toggleSourceMode(instance);
}

watch(resolved, (next, previous) => {
  const instance = editor.value;
  if (next.theme === "dark") ensureDarkTheme();
  if (!instance) return;
  setSettings(instance, coreSettings(next));
  const syntax = coreSyntax(next);
  if (JSON.stringify(syntax) !== JSON.stringify(coreSyntax(previous))) setSyntax(instance, syntax);
  applyModes(instance, next);
});

watch(
  () => props.readOnly,
  (readOnly) => {
    editor.value?.setEditable(!readOnly);
    if (readOnly) updateOutline();
  },
);

watch(
  () => props.modelValue,
  (value) => {
    const instance = editor.value;
    if (!instance || value === current) return;
    // 外面换了文档（打开了别的文件）
    current = value;
    setMarkdown(instance, value);
    scheduleOutline();
  },
);

// ---------------------------------------------------------------------------
// 插入表格的小窗口（T-1）、大图查看器（D-5、M-6）

const tableDialog = ref(false);
const viewer = ref<InstanceType<typeof MediaViewer> | null>(null);

function insertTable(columns: number, rows: number): void {
  editor.value?.commands.insertTableOfSize(columns, rows);
}

function focus(): void {
  editor.value?.commands.focus();
}

/** 编辑器自己的快捷键之前：Ctrl+T 弹出插入表格的小窗口（编辑器里的 Ctrl+T 直接插固定的模板） */
function onKeydownCapture(event: KeyboardEvent): void {
  const primary = isMac ? event.metaKey : event.ctrlKey;
  if (!primary || event.altKey || event.shiftKey || event.key.toLowerCase() !== "t") return;
  const instance = editor.value;
  if (!instance?.isEditable || sourceModeOf(instance)) return;
  event.preventDefault();
  event.stopPropagation();
  tableDialog.value = true;
}

/** 两下之间最长多久算双击（系统的双击间隔一般是 500 毫秒） */
const DOUBLE_CLICK_MS = 800;

/** 这个位置上的图：画好的图表（所在的图表块）或图片的地址 */
function mediaAt(target: Element | null): { diagram: Element } | { image: string } | null {
  const panel = target?.closest(".md-diagram-panel");
  if (panel?.querySelector("svg")) return { diagram: panel.closest(".md-diagram") ?? panel };
  const image = target?.closest("img");
  if (image instanceof HTMLImageElement && image.closest("#write") && image.currentSrc) return { image: image.currentSrc };
  return null;
}

/**
 * 双击时第一下按在哪张图上。第一下按下就选中了这一块：图表块在上面展开源码、图片的 Markdown 标记展开，图往下、往右挪，
 * 第二下就落在源码、文字上了——按第一下的算。第一下按在源码、文字上的双击照常是选词
 */
let pressed: { media: { diagram: Element } | { image: string }; time: number } | null = null;

function onMouseDownCapture(event: MouseEvent): void {
  // 双击的第二下（detail 是 2）不换
  if (event.detail > 1) return;
  const media = mediaAt(event.target as Element | null);
  pressed = media ? { media, time: event.timeStamp } : null;
}

/** 双击图片、画好的图表：大图查看器（D-5、M-6） */
function onDoubleClick(event: MouseEvent): void {
  const recent = pressed && event.timeStamp - pressed.time < DOUBLE_CLICK_MS ? pressed.media : null;
  pressed = null;
  const media = mediaAt(event.target as Element | null) ?? recent;
  if (!media) return;
  if ("image" in media) {
    event.preventDefault();
    viewer.value?.show(media.image);
    return;
  }
  const diagram = media.diagram.isConnected ? media.diagram.querySelector(".md-diagram-panel svg") ?? media.diagram.querySelector("svg") : null;
  if (!(diagram instanceof SVGSVGElement)) return;
  event.preventDefault();
  viewer.value?.show(diagram);
}

// ---------------------------------------------------------------------------
// 快捷键：保存、另存为、打开交给宿主

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function onKeydown(event: KeyboardEvent): void {
  const primary = isMac ? event.metaKey : event.ctrlKey;
  if (!primary || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === "s") {
    event.preventDefault();
    if (event.shiftKey) emit("saveAs");
    else emit("save");
  } else if (key === "o" && !event.shiftKey) {
    // Ctrl+Shift+O 是编辑器的「打开链接」（N-4）
    event.preventDefault();
    emit("open");
  }
}

// ---------------------------------------------------------------------------

onMounted(() => {
  if (resolved.value.theme === "dark") ensureDarkTheme();
  const instance = createMarkoEditor({
    element: write.value ?? undefined,
    markdown: props.modelValue,
    settings: coreSettings(resolved.value),
    syntax: coreSyntax(resolved.value),
    editable: !props.readOnly,
    host,
    emojiRenderer: emoji.render,
  });
  editor.value = instance;
  applyModes(instance, resolved.value);
  instance.on("update", () => {
    const markdown = getMarkdown(instance);
    if (markdown === current) return;
    current = markdown;
    emit("update:modelValue", markdown);
    scheduleOutline();
  });
  updateOutline(true);
});

onBeforeUnmount(() => {
  clearTimeout(outlineTimer);
  // 还在等宿主保存的图片：不插入了
  for (const resolve of pendingImages.values()) resolve(null);
  pendingImages.clear();
  editor.value?.destroy();
  editor.value = null;
});

// editor：编辑器实例（应用界面用；类型声明里是 unknown，不暴露编辑器内部的类型）；
// showTableDialog：「段落 → 表格 → 插入表格」（同 Ctrl+T，T-1）
defineExpose<MarkoMarkdownBodyHandle & { editor: () => unknown; showTableDialog: () => void }>({
  showTableDialog() {
    const instance = editor.value;
    if (instance?.isEditable && !sourceModeOf(instance)) tableDialog.value = true;
  },
  replaceImagePlaceholder(placeholder, source, alt) {
    const resolve = pendingImages.get(placeholder);
    if (!resolve) return false;
    pendingImages.delete(placeholder);
    resolve(source === null ? null : { url: source, alt });
    return true;
  },
  focus() {
    editor.value?.commands.focus();
  },
  refreshLayout() {
    if (editor.value) refreshCodeViews(editor.value);
  },
  editor: (): unknown => editor.value,
});
</script>

<style>
.marko-markdown-body {
  position: relative;
  box-sizing: border-box;
  height: 100%;
  overflow: auto;
  background: var(--md-background, #fff);
}
</style>

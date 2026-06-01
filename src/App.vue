<template>
  <div
    class="app-shell"
    :class="{ 'focus-layout': effectiveSettings.focusMode, 'is-dragging': dragActive }"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleAppDrop"
  >
    <AppToolbar
      :dirty="dirty"
      :source-mode="effectiveSettings.sourceMode"
      :focus-mode="effectiveSettings.focusMode"
      :typewriter-mode="effectiveSettings.typewriterMode"
      :zoom="settings.zoom"
      :theme="settings.theme"
      @new-file="newFile"
      @open-file="openFile"
      @open-folder="openFolder"
      @save="saveFile"
      @save-as="saveAsFile"
      @command="executeCommand"
      @toggle-source="patchSettings({ sourceMode: !settings.sourceMode })"
      @toggle-focus="patchSettings({ focusMode: !settings.focusMode })"
      @toggle-typewriter="patchSettings({ typewriterMode: !settings.typewriterMode })"
      @zoom="changeZoom"
      @fullscreen="toggleFullscreen"
      @settings="settingsVisible = true"
      @export="exportDocument"
      @print="printDocument"
      @set-theme="patchSettings({ theme: $event })"
    />

    <main class="workspace">
      <AppSidebar
        v-if="!effectiveSettings.focusMode"
        :tree="fileTree"
        :current-path="currentFilePath"
        :root-path="rootPath"
        :outline="outline"
        :recent-files="recentFiles"
        :search-results="searchResults"
        :search-query="searchQuery"
        @open-folder="openFolder"
        @open-file="openFileByPath"
        @quick-open="quickOpenVisible = true"
        @search="runGlobalSearch"
      />

      <section class="editor-pane">
        <div class="document-strip">
          <div class="document-title">
            <FileText />
            <span>{{ currentFileName }}</span>
            <strong v-if="dirty">未保存</strong>
          </div>
          <div class="document-meta">
            <span>{{ stats.words }} 词</span>
            <span>{{ stats.chars }} 字符</span>
            <span>{{ stats.readingMinutes }} 分钟</span>
          </div>
        </div>

        <div class="editor-scroll">
          <BlockEditor
            ref="editorRef"
            v-model="markdown"
            :file-path="currentFilePath"
            :outline="outline"
            :settings="effectiveSettings"
            @save="saveFile"
            @open="openFile"
            @selection="selectionStats = $event"
            @image-data="handleImageData"
          />
        </div>

        <footer class="status-bar">
          <span>{{ statusText }}</span>
          <span>段落 {{ stats.paragraphs }}</span>
          <span>选区 {{ selectionStats.words }} 词 / {{ selectionStats.chars }} 字符</span>
          <span>{{ effectiveSettings.sourceMode ? "源码模式" : "实时预览" }}</span>
        </footer>
      </section>
    </main>

    <div v-if="quickOpenVisible" class="quick-mask" @mousedown.self="quickOpenVisible = false">
      <section class="quick-panel">
        <input
          ref="quickInputRef"
          v-model="quickQuery"
          class="quick-input"
          placeholder="输入文件名快速打开"
          @keydown.escape="quickOpenVisible = false"
          @keydown.enter="openQuickResult(filteredQuickFiles[0]?.path)"
        />
        <div class="quick-list">
          <button
            v-for="file in filteredQuickFiles"
            :key="file.path"
            type="button"
            class="quick-row"
            @click="openQuickResult(file.path)"
          >
            <FileText />
            <span>{{ file.name }}</span>
            <small>{{ file.path }}</small>
          </button>
          <p v-if="filteredQuickFiles.length === 0" class="empty-text">没有匹配文件</p>
        </div>
      </section>
    </div>

    <div v-if="dragActive" class="drag-hint">
      <span>{{ dragHint }}</span>
    </div>

    <SettingsPanel
      v-if="settingsVisible"
      v-model="settings"
      @close="settingsVisible = false"
    />

    <div v-if="toast" class="toast" :class="toastTone">{{ toast }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { FileText } from "lucide-vue-next";
import AppSidebar from "@/components/AppSidebar.vue";
import AppToolbar from "@/components/AppToolbar.vue";
import BlockEditor from "@/components/BlockEditor.vue";
import SettingsPanel from "@/components/SettingsPanel.vue";
import { sampleDocument } from "@/data/sampleDocument";
import {
  copyImageFileAsset,
  exportWithPandoc,
  isTauriRuntime,
  listMarkdownFolder,
  listenNativeFileDrops,
  openBrowserMarkdownFile,
  pickFolder,
  pickMarkdownFile,
  readTextFile,
  saveImageAsset,
  saveMarkdownAs,
  searchMarkdownFiles,
  writeTextFile,
} from "@/services/desktop";
import { createOutline } from "@/utils/markdown";
import { calculateDocumentStats } from "@/utils/stats";
import type {
  EditorCommand,
  EditorSettings,
  ExportFormat,
  FileEntry,
  ImagePayload,
  RecentFile,
  SearchResult,
  SelectionStats,
} from "@/types";

interface BlockEditorHandle {
  runCommand: (command: EditorCommand, payload?: string) => void;
  insertImageMarkdown: (src: string, alt?: string) => void;
  insertText: (text: string) => void;
  focus: () => void;
}

const settingsKey = "marko.editor.settings";
const recentKey = "marko.recent.files";

const editorRef = ref<BlockEditorHandle | null>(null);
const quickInputRef = ref<HTMLInputElement | null>(null);
const markdown = ref(sampleDocument);
const originalMarkdown = ref(sampleDocument);
const currentFilePath = ref("");
const currentFileName = ref("未命名.md");
const rootPath = ref("");
const fileTree = ref<FileEntry[]>([]);
const recentFiles = ref<RecentFile[]>(loadRecentFiles());
const searchQuery = ref("");
const searchResults = ref<SearchResult[]>([]);
const selectionStats = ref<SelectionStats>({ chars: 0, words: 0, lines: 0 });
const settings = ref<EditorSettings>(loadSettings());
const settingsVisible = ref(false);
const quickOpenVisible = ref(false);
const quickQuery = ref("");
const toast = ref("");
const toastTone = ref<"info" | "danger" | "success">("info");
const dragActive = ref(false);
const dragHint = ref("拖入 Markdown 文件打开，拖入图片插入");
let toastTimer = 0;
let dragDepth = 0;
let unlistenNativeDrop: (() => void) | null = null;

const dirty = computed(() => markdown.value !== originalMarkdown.value);
const outline = computed(() => createOutline(markdown.value));
const stats = computed(() => calculateDocumentStats(markdown.value));
const effectiveSettings = computed<EditorSettings>(() => ({
  ...settings.value,
  fontSize: Math.round(settings.value.fontSize * settings.value.zoom),
}));

const statusText = computed(() => {
  if (currentFilePath.value) return currentFilePath.value;
  return isTauriRuntime() ? "尚未保存到磁盘" : "浏览器预览模式";
});

const quickFiles = computed(() => {
  const fromTree = flattenFileTree(fileTree.value);
  if (fromTree.length > 0) return fromTree;
  return recentFiles.value.map((item) => ({ name: item.name, path: item.path }));
});

const filteredQuickFiles = computed(() => {
  const keyword = quickQuery.value.trim().toLowerCase();
  if (!keyword) return quickFiles.value.slice(0, 30);
  return quickFiles.value
    .filter((file) => `${file.name} ${file.path}`.toLowerCase().includes(keyword))
    .slice(0, 30);
});

watch(
  settings,
  (value) => {
    localStorage.setItem(settingsKey, JSON.stringify(value));
    document.documentElement.dataset.theme = value.theme === "dark" ? "dark" : "solo";
  },
  { deep: true, immediate: true },
);

watch(quickOpenVisible, async (visible) => {
  if (!visible) return;
  quickQuery.value = "";
  await nextTick();
  quickInputRef.value?.focus();
});

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown);
  void setupNativeFileDrop();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleGlobalKeydown);
  unlistenNativeDrop?.();
  window.clearTimeout(toastTimer);
});

async function newFile() {
  if (!confirmDiscard()) return;
  markdown.value = "# 未命名文档\n\n";
  originalMarkdown.value = markdown.value;
  currentFilePath.value = "";
  currentFileName.value = "未命名.md";
  selectionStats.value = { chars: 0, words: 0, lines: 0 };
  showToast("已新建文档", "success");
}

async function openFile() {
  if (!confirmDiscard()) return;

  try {
    if (isTauriRuntime()) {
      const path = await pickMarkdownFile();
      if (path) await openFileByPath(path, false);
      return;
    }

    const file = await openBrowserMarkdownFile();
    if (!file) return;
    markdown.value = file.content;
    originalMarkdown.value = file.content;
    currentFilePath.value = "";
    currentFileName.value = file.name;
    showToast("已打开浏览器文件", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function openFileByPath(path: string, ask = true) {
  if (ask && !confirmDiscard()) return;

  try {
    const content = await readTextFile(path);
    markdown.value = content;
    originalMarkdown.value = content;
    currentFilePath.value = path;
    currentFileName.value = basename(path);
    addRecentFile(path);
    showToast(`已打开 ${basename(path)}`, "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function openDroppedMarkdownFile(file: File) {
  if (!confirmDiscard()) return;

  try {
    const content = await file.text();
    markdown.value = content;
    originalMarkdown.value = content;
    currentFilePath.value = "";
    currentFileName.value = file.name;
    showToast(`已打开 ${file.name}`, "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function saveFile() {
  try {
    if (!currentFilePath.value || !isTauriRuntime()) {
      await saveAsFile();
      return;
    }
    await writeTextFile(currentFilePath.value, markdown.value);
    originalMarkdown.value = markdown.value;
    addRecentFile(currentFilePath.value);
    showToast("已保存", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function saveAsFile() {
  try {
    const path = await saveMarkdownAs(markdown.value, dirname(currentFilePath.value));
    if (path) {
      currentFilePath.value = path;
      currentFileName.value = basename(path);
      originalMarkdown.value = markdown.value;
      addRecentFile(path);
      showToast(`已保存为 ${basename(path)}`, "success");
    } else if (!isTauriRuntime()) {
      originalMarkdown.value = markdown.value;
      showToast("已下载 Markdown 文件", "success");
    }
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function openFolder() {
  try {
    const selected = await pickFolder();
    if (!selected) return;
    rootPath.value = selected;
    fileTree.value = await listMarkdownFolder(selected);
    showToast("已加载文件夹", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function runGlobalSearch(query: string) {
  searchQuery.value = query;
  const normalized = query.trim();
  if (!normalized) {
    searchResults.value = [];
    return;
  }

  try {
    if (rootPath.value && isTauriRuntime()) {
      searchResults.value = await searchMarkdownFiles(rootPath.value, normalized);
      return;
    }

    const lines = markdown.value.split(/\r?\n/);
    searchResults.value = lines
      .map((line, index) => ({ path: currentFileName.value, line: index + 1, snippet: line.trim() }))
      .filter((item) => item.snippet.toLowerCase().includes(normalized.toLowerCase()))
      .slice(0, 80);
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

function executeCommand(command: EditorCommand) {
  editorRef.value?.runCommand(command);
}

async function handleImageData(payload: ImagePayload) {
  try {
    const uploaded = await uploadImageIfConfigured(payload);
    const src = uploaded || (await saveImageAsset(currentFilePath.value || null, payload.name, payload.dataUrl));
    editorRef.value?.insertImageMarkdown(src, payload.name);
    showToast(uploaded ? "图片已上传并插入" : "图片已插入", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function handleImageFilePath(path: string) {
  try {
    const src = await copyImageFileAsset(currentFilePath.value || null, path);
    editorRef.value?.insertImageMarkdown(src, basename(path));
    showToast("图片已插入", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function handleImageFiles(files: File[]) {
  for (const file of files) {
    await handleImageData({
      name: file.name || `drop-${Date.now()}.png`,
      dataUrl: await fileToDataUrl(file),
    });
  }
}

async function setupNativeFileDrop() {
  try {
    unlistenNativeDrop = await listenNativeFileDrops(handleDroppedPaths);
  } catch (error) {
    console.warn("注册桌面拖拽事件失败", error);
  }
}

async function handleDroppedPaths(paths: string[]) {
  dragActive.value = false;
  dragDepth = 0;

  const markdownPath = paths.find(isMarkdownPath);
  if (markdownPath) {
    await openFileByPath(markdownPath);
    return;
  }

  const imagePaths = paths.filter(isImagePath);
  if (imagePaths.length === 0) return;
  for (const path of imagePaths) {
    await handleImageFilePath(path);
  }
}

function handleDragEnter(event: DragEvent) {
  dragDepth += 1;
  dragActive.value = true;
  dragHint.value = getDragHint(event.dataTransfer);
}

function handleDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    dragActive.value = false;
  }
}

async function handleAppDrop(event: DragEvent) {
  dragActive.value = false;
  dragDepth = 0;

  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;

  const markdownFile = files.find(isMarkdownFile);
  if (markdownFile) {
    await openDroppedMarkdownFile(markdownFile);
    return;
  }

  const imageFiles = files.filter((file) => file.type.startsWith("image/") || isImagePath(file.name));
  if (imageFiles.length > 0) {
    await handleImageFiles(imageFiles);
  }
}

async function uploadImageIfConfigured(payload: ImagePayload): Promise<string> {
  if (!settings.value.uploadUrl.trim()) return "";

  const blob = await (await fetch(payload.dataUrl)).blob();
  const form = new FormData();
  form.append("file", blob, payload.name);
  const response = await fetch(settings.value.uploadUrl.trim(), {
    method: "POST",
    headers: settings.value.uploadToken.trim()
      ? { Authorization: settings.value.uploadToken.trim() }
      : undefined,
    body: form,
  });

  if (!response.ok) {
    throw new Error(`图片上传失败：HTTP ${response.status}`);
  }

  const text = await response.text();
  try {
    const json = JSON.parse(text) as { url?: string; link?: string; data?: { url?: string } };
    return json.url || json.link || json.data?.url || text.trim();
  } catch {
    return text.trim();
  }
}

async function exportDocument(format: ExportFormat) {
  try {
    const output = await exportWithPandoc(markdown.value, currentFilePath.value || null, format);
    if (output) {
      showToast(`已导出 ${output}`, "success");
    } else if (format === "pdf") {
      showToast("已打开打印窗口，可另存为 PDF", "info");
    }
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

function printDocument() {
  window.print();
}

function changeZoom(delta: number) {
  const next = Math.min(1.5, Math.max(0.75, Number((settings.value.zoom + delta).toFixed(2))));
  patchSettings({ zoom: next });
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
    return;
  }
  void document.documentElement.requestFullscreen();
}

function patchSettings(patch: Partial<EditorSettings>) {
  settings.value = {
    ...settings.value,
    ...patch,
  };
}

function openQuickResult(path?: string) {
  if (!path) return;
  quickOpenVisible.value = false;
  void openFileByPath(path);
}

function getDragHint(dataTransfer: DataTransfer | null): string {
  const files = Array.from(dataTransfer?.items ?? []);
  if (files.some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
    return "松开后插入图片";
  }
  return "松开后打开 Markdown 文件或插入图片";
}

function isMarkdownFile(file: File): boolean {
  return /(\.md|\.markdown|\.mdown)$/i.test(file.name) || file.type === "text/markdown";
}

function isMarkdownPath(path: string): boolean {
  return /(\.md|\.markdown|\.mdown)$/i.test(path);
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(path);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) return;

  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "p") {
    event.preventDefault();
    quickOpenVisible.value = true;
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "n") {
    event.preventDefault();
    void newFile();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "o") {
    event.preventDefault();
    void openFile();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && key === "s") {
    event.preventDefault();
    void saveFile();
    return;
  }
  if (event.key === "F11") {
    event.preventDefault();
    toggleFullscreen();
  }
}

function confirmDiscard(): boolean {
  if (!dirty.value) return true;
  return window.confirm("当前文档有未保存修改，是否继续？");
}

function addRecentFile(path: string) {
  const item = {
    path,
    name: basename(path),
    openedAt: Date.now(),
  };
  recentFiles.value = [item, ...recentFiles.value.filter((recent) => recent.path !== path)].slice(0, 20);
  localStorage.setItem(recentKey, JSON.stringify(recentFiles.value));
}

function flattenFileTree(entries: FileEntry[]): Array<{ name: string; path: string }> {
  const result: Array<{ name: string; path: string }> = [];
  for (const entry of entries) {
    if (entry.isDir) {
      result.push(...flattenFileTree(entry.children));
    } else {
      result.push({ name: entry.name, path: entry.path });
    }
  }
  return result;
}

function loadSettings(): EditorSettings {
  const defaults: EditorSettings = {
    theme: "solo",
    fontSize: 16,
    lineWidth: 820,
    zoom: 1,
    spellcheck: true,
    sourceMode: false,
    focusMode: false,
    typewriterMode: false,
    autoPair: true,
    uploadUrl: "",
    uploadToken: "",
    extensions: {
      html: true,
      toc: true,
      mermaid: true,
      flowchart: true,
      footnote: true,
      alerts: true,
      emoji: true,
      marks: true,
    },
  };

  try {
    const stored = localStorage.getItem(settingsKey);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<EditorSettings>;
    return {
      ...defaults,
      ...parsed,
      extensions: {
        ...defaults.extensions,
        ...parsed.extensions,
      },
    };
  } catch {
    return defaults;
  }
}

function loadRecentFiles(): RecentFile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(recentKey) || "[]") as RecentFile[];
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function showToast(message: string, tone: "info" | "danger" | "success" = "info") {
  toast.value = message;
  toastTone.value = tone;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.value = "";
  }, 3600);
}

function basename(path: string): string {
  if (!path) return "未命名.md";
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

function dirname(path: string): string {
  if (!path) return "";
  const normalized = path.replace(/\\/g, "/");
  return normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  background: var(--panel);
  color: var(--text);
}

.workspace {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 0;
}

.focus-layout .workspace {
  grid-template-columns: minmax(0, 1fr);
}

.editor-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--panel);
}

.document-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 34px;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  padding: 0.32rem 0.72rem;
}

.document-title {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.document-title svg {
  width: 15px;
  height: 15px;
  color: var(--muted);
}

.document-title span {
  overflow: hidden;
  color: var(--text);
  font-size: 0.82rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-title strong {
  border-radius: 5px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.08rem 0.34rem;
}

.document-meta {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--muted);
  font-size: 0.74rem;
  white-space: nowrap;
}

.editor-scroll {
  min-height: 0;
  background: var(--panel);
  overflow: auto;
}

.status-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 0.9rem;
  min-height: 26px;
  border-top: 1px solid var(--border);
  background: var(--panel-subtle);
  color: var(--muted);
  font-size: 0.72rem;
  padding: 0.28rem 0.72rem;
}

.status-bar span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  align-items: start;
  justify-items: center;
  background: rgba(15, 23, 42, 0.32);
  padding-top: 12vh;
}

.quick-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(720px, calc(100vw - 2rem));
  max-height: min(580px, calc(100vh - 4rem));
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.quick-input {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font-size: 1rem;
  padding: 0.78rem 0.9rem;
}

.quick-input:focus {
  outline: none;
}

.quick-list {
  min-height: 0;
  overflow: auto;
  padding: 0.35rem;
}

.quick-row {
  display: grid;
  grid-template-columns: auto minmax(0, 180px) minmax(0, 1fr);
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  padding: 0.46rem 0.58rem;
  text-align: left;
}

.quick-row:hover {
  background: var(--accent-soft);
}

.quick-row svg {
  width: 16px;
  height: 16px;
  color: var(--muted);
}

.quick-row span,
.quick-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-row small {
  color: var(--muted);
  font-size: 0.76rem;
}

.empty-text {
  color: var(--muted);
  font-size: 0.86rem;
  padding: 0.8rem;
}

.toast {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 90;
  max-width: min(460px, calc(100vw - 2rem));
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
  color: var(--text);
  font-size: 0.86rem;
  padding: 0.72rem 0.85rem;
}

.toast.success {
  border-color: rgba(21, 128, 61, 0.24);
  background: var(--success-soft);
  color: var(--success);
}

.toast.danger {
  border-color: rgba(220, 38, 38, 0.24);
  background: var(--danger-soft);
  color: var(--danger);
}

.drag-hint {
  position: fixed;
  inset: 34px 0 0;
  z-index: 120;
  display: grid;
  place-items: center;
  pointer-events: none;
  background: rgba(37, 99, 235, 0.08);
  outline: 2px dashed rgba(37, 99, 235, 0.42);
  outline-offset: -12px;
}

.drag-hint span {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  color: var(--text);
  font-size: 0.9rem;
  padding: 0.72rem 0.95rem;
}

@media (max-width: 900px) {
  .document-meta {
    display: none;
  }

  .status-bar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .status-bar span:nth-child(3),
  .status-bar span:nth-child(4) {
    display: none;
  }
}

@media print {
  .app-shell {
    display: block;
    height: auto;
    background: #ffffff;
  }

  .workspace {
    display: block;
  }

.document-strip,
.status-bar {
  display: none;
}

  .editor-scroll {
    overflow: visible;
  }
}
</style>

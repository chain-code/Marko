<template>
  <div
    class="app-shell"
    :class="{ 'focus-layout': settings.focusMode, 'is-dragging': dragActive }"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleAppDrop"
  >
    <AppToolbar
      :source-mode="settings.sourceMode"
      :focus-mode="settings.focusMode"
      :typewriter-mode="settings.typewriterMode"
      :sidebar-visible="sidebarVisible"
      :sidebar-active-tab="sidebarActiveTab"
      :file-panel-mode="filePanelMode"
      :has-local-file="Boolean(currentFilePath) && isTauriRuntime()"
      :has-workspace="Boolean(rootPath)"
      :theme="settings.theme"
      :spellcheck="settings.spellcheck"
      :status-bar-visible="settings.showStatusBar"
      :recent-files="recentFiles"
      @new-file="newFile"
      @open-file="openFile"
      @open-folder="openFolder"
      @open-current-folder-workspace="openCurrentFolderWorkspace"
      @close-workspace-folder="closeWorkspaceFolder"
      @refresh-workspace-folder="refreshWorkspaceFolder"
      @quick-open="openQuickOpen"
      @close-file="closeFile"
      @reload-file="reloadFile"
      @rename-file="renameCurrentFile"
      @copy-file-path="copyCurrentFilePath"
      @reveal-file="revealCurrentFile"
      @open-containing-folder="openCurrentContainingFolder"
      @show-recent-files="openRecentFilesPanel"
      @open-recent-file="openRecentFile"
      @clear-recent-files="clearRecentFiles"
      @save="saveFile"
      @save-as="saveAsFile"
      @insert-image-file="insertImageFile"
      @command="executeCommand"
      @find="openFindPanel(false)"
      @find-next="navigateFindShortcut(1)"
      @find-previous="navigateFindShortcut(-1)"
      @replace="openFindPanel(true)"
      @jump-to-selection="editorRef?.jumpToSelection()"
      @locate-current-file="locateCurrentFileInTree"
      @toggle-sidebar="sidebarVisible = !sidebarVisible"
      @show-sidebar-tab="showSidebarTab"
      @show-file-view="showFileView"
      @global-search="openGlobalSearchPanel"
      @toggle-source="patchSettings({ sourceMode: !settings.sourceMode })"
      @toggle-focus="patchSettings({ focusMode: !settings.focusMode })"
      @toggle-typewriter="patchSettings({ typewriterMode: !settings.typewriterMode })"
      @toggle-spellcheck="patchSettings({ spellcheck: !settings.spellcheck })"
      @toggle-status-bar="patchSettings({ showStatusBar: !settings.showStatusBar })"
      @show-word-count="openWordCountPanel"
      @zoom="changeZoom"
      @reset-zoom="resetZoom"
      @fullscreen="toggleFullscreen"
      @settings="openSettingsPanel"
      @show-about="openAboutDialog"
      @export="exportDocument"
      @print="printDocument"
      @set-theme="patchSettings({ theme: $event })"
    />

    <main
      class="workspace"
      :class="{ 'no-sidebar': !sidebarLayoutVisible }"
      :style="workspaceStyle"
    >
      <AppSidebar
        v-if="sidebarLayoutVisible"
        ref="sidebarRef"
        :active-tab="sidebarActiveTab"
        :file-mode="filePanelMode"
        :tree="fileTree"
        :current-path="currentFilePath"
        :root-path="rootPath"
        :outline="outline"
        :active-outline-id="activeOutlineId"
        :collapsible-outline="settings.collapsibleOutline"
        :native-file-actions="isTauriRuntime()"
        :search-query="searchQuery"
        :search-results="searchResults"
        :search-pending="searchPending"
        @open-folder="openFolder"
        @new-workspace-file="createMarkdownFileInFolder"
        @new-workspace-folder="createFolderInWorkspace"
        @open-file="openFileByPath"
        @open-outline-item="openOutlineItem"
        @quick-open="openQuickOpen"
        @submit-search="runGlobalSearch"
        @open-search-result="openGlobalSearchResult"
        @file-context-action="runSidebarFileContextAction"
        @update:active-tab="sidebarActiveTab = $event"
        @update:file-mode="filePanelMode = $event"
        @update:search-query="searchQuery = $event"
      />
      <div
        v-if="sidebarLayoutVisible"
        class="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        title="调整侧边栏宽度"
        @pointerdown="startSidebarResize"
      />

      <section class="editor-pane">
        <div class="editor-scroll">
          <ContinuousMarkdownEditor
            ref="editorRef"
            :model-value="markdown"
            :file-path="currentFilePath"
            :outline="outline"
            :settings="effectiveSettings"
            :find-matches="findPanelVisible ? currentFindMatches : []"
            :active-find-index="findActiveIndex"
            @update:model-value="updateMarkdown"
            @save="saveFile"
            @save-as="saveAsFile"
            @open="openFile"
            @selection="selectionStats = $event"
            @image-data="handleImageData"
            @open-link="openLinkedMarkdownFile"
            @open-link-href="openCurrentMarkdownLink"
            @missing-link="showToast('光标不在可打开的链接上', 'info')"
            @request-source-selection="selectSourceRange"
          />
        </div>

        <footer v-if="settings.showStatusBar" class="status-bar">
          <div class="status-controls status-controls-left">
            <button
              type="button"
              class="status-icon"
              :class="{ active: sidebarLayoutVisible }"
              title="显示或隐藏侧边栏 Ctrl+Shift+L"
              @click="sidebarVisible = !sidebarVisible"
            >
              <PanelLeft />
            </button>
            <button
              type="button"
              class="status-icon"
              :class="{ active: settings.sourceMode }"
              title="切换源代码模式 Ctrl+/"
              @click="patchSettings({ sourceMode: !settings.sourceMode })"
            >
              <Code2 />
            </button>
            <button
              type="button"
              class="status-icon"
              :class="{ active: settings.focusMode }"
              title="切换专注模式 F8"
              @click="patchSettings({ focusMode: !settings.focusMode })"
            >
              <Focus />
            </button>
            <button
              type="button"
              class="status-icon"
              :class="{ active: settings.typewriterMode }"
              title="切换打字机模式 F9"
              @click="patchSettings({ typewriterMode: !settings.typewriterMode })"
            >
              <TextCursorInput />
            </button>
          </div>
          <span class="status-path" :title="currentFileName">
            {{ dirty ? "未保存 · " : "" }}{{ statusText }}
          </span>
          <div class="status-controls status-controls-right">
            <button
              type="button"
              class="status-icon"
              :class="{ active: settings.spellcheck }"
              title="切换拼写检查"
              @click="patchSettings({ spellcheck: !settings.spellcheck })"
            >
              <SpellCheck2 />
            </button>
            <button
              v-if="settings.alwaysShowWordCount"
              type="button"
              class="status-item"
              title="打开字数统计"
              @click="openWordCountPanel"
            >
              {{ stats.words }} 词
            </button>
          </div>
        </footer>
      </section>
    </main>

    <div v-if="quickOpenVisible" class="quick-mask" @mousedown.self="closeQuickOpen()">
      <section class="quick-panel">
        <input
          ref="quickInputRef"
          v-model="quickQuery"
          class="quick-input"
          placeholder="输入文件名快速打开"
          @keydown="handleQuickOpenKeydown"
        />
        <div ref="quickListRef" class="quick-list">
          <button
            v-for="(file, index) in filteredQuickFiles"
            :key="file.path"
            type="button"
            class="quick-row"
            :class="{ active: index === quickActiveIndex }"
            :data-quick-index="index"
            @mouseenter="quickActiveIndex = index"
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

    <div v-if="recentPanelVisible" class="quick-mask" @mousedown.self="closeRecentFilesPanel">
      <section ref="recentPanelRef" class="quick-panel recent-panel" role="dialog" aria-label="最近文件" tabindex="-1" @keydown.escape="closeRecentFilesPanel">
        <header class="recent-panel-header">
          <span>最近文件</span>
          <button
            type="button"
            class="recent-clear"
            title="清空最近文件"
            :disabled="recentFiles.length === 0"
            @click="clearRecentFiles"
          >
            <Trash2 />
          </button>
        </header>
        <div class="quick-list">
          <button
            v-for="file in recentFiles"
            :key="file.path"
            type="button"
            class="quick-row recent-row"
            @click="openRecentFile(file.path)"
            @contextmenu.prevent.stop="openRecentContextMenu(file, $event)"
          >
            <FileText />
            <span>{{ file.name }}</span>
            <small>{{ file.path }}</small>
          </button>
          <p v-if="recentFiles.length === 0" class="empty-text">暂无最近打开文件</p>
        </div>
        <div
          v-if="recentContextMenu"
          class="recent-context-menu"
          :style="{ left: `${recentContextMenu.x}px`, top: `${recentContextMenu.y}px` }"
          role="menu"
          @click.stop
        >
          <button type="button" role="menuitem" @click="runRecentContextAction('openFile')"><FileText /><span>打开</span></button>
          <button type="button" role="menuitem" @click="runRecentContextAction('copyPath')"><Copy /><span>复制文件路径</span></button>
          <button type="button" role="menuitem" @click="runRecentContextAction('revealFile')"><FolderOpen /><span>在资源管理器中显示</span></button>
          <button type="button" role="menuitem" class="danger" @click="runRecentContextAction('removeRecent')"><Trash2 /><span>从列表中移除</span></button>
        </div>
      </section>
    </div>

    <div v-if="dragActive" class="drag-hint">
      <span>{{ dragHint }}</span>
    </div>

    <section
      v-if="findPanelVisible"
      class="find-panel"
      role="dialog"
      aria-label="查找与替换"
      tabindex="-1"
      @keydown.escape="closeFindPanel"
    >
      <div class="find-row">
        <input
          ref="findInputRef"
          v-model="findQuery"
          class="find-input"
          placeholder="查找"
          @keydown.enter.prevent="goToFindMatch($event.shiftKey ? -1 : 1)"
        />
        <span class="find-count">
          {{ currentFindMatches.length === 0 ? "0/0" : `${findActiveIndex + 1}/${currentFindMatches.length}` }}
        </span>
        <button type="button" class="find-icon" title="上一个" @click="goToFindMatch(-1)">
          <ChevronUp />
        </button>
        <button type="button" class="find-icon" title="下一个" @click="goToFindMatch(1)">
          <ChevronDown />
        </button>
        <button
          type="button"
          class="find-toggle"
          :class="{ active: findCaseSensitive }"
          title="区分大小写"
          @click="findCaseSensitive = !findCaseSensitive"
        >
          <CaseSensitive />
        </button>
        <button
          type="button"
          class="find-toggle"
          :class="{ active: findWholeWord }"
          title="全词匹配"
          @click="findWholeWord = !findWholeWord"
        >
          <WholeWord />
        </button>
        <button
          type="button"
          class="find-toggle"
          :class="{ active: findRegularExpression }"
          title="正则表达式"
          @click="findRegularExpression = !findRegularExpression"
        >
          <Regex />
        </button>
        <button
          type="button"
          class="find-toggle"
          :class="{ active: findReplaceVisible }"
          title="替换"
          @click="findReplaceVisible = !findReplaceVisible"
        >
          <Replace />
        </button>
        <button type="button" class="find-icon" title="关闭" @click="closeFindPanel">
          <X />
        </button>
      </div>

      <div v-if="findReplaceVisible" class="find-row replace-row">
        <input
          v-model="replaceQuery"
          class="find-input"
          placeholder="替换为"
          @keydown.enter.prevent="replaceCurrentMatch"
        />
        <button type="button" class="find-action" @click="replaceCurrentMatch">替换</button>
        <button type="button" class="find-action" @click="replaceEveryMatch">全部</button>
      </div>
    </section>

    <SettingsPanel
      v-if="settingsVisible"
      v-model="settings"
      @close="closeSettingsPanel"
    />

    <div v-if="wordCountVisible" class="stats-layer" @mousedown.self="closeWordCountPanel">
      <section
        ref="wordCountPanelRef"
        class="stats-panel"
        role="dialog"
        aria-modal="false"
        aria-label="字数统计"
        tabindex="-1"
        @keydown.escape="closeWordCountPanel"
      >
        <header class="stats-header">
          <div class="stats-title">
            <FileText />
            <h2>字数统计</h2>
          </div>
          <button type="button" class="stats-close" title="关闭" @click="closeWordCountPanel">
            <X />
          </button>
        </header>

        <div class="stats-body">
          <section class="stats-section">
            <h3>文档</h3>
            <dl class="stats-grid">
              <div v-for="item in wordCountDetails.document" :key="item.label" class="stats-row">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
                <span>{{ item.unit }}</span>
              </div>
            </dl>
          </section>

          <section class="stats-section">
            <h3>选区</h3>
            <dl class="stats-grid">
              <div v-for="item in wordCountDetails.selection" :key="item.label" class="stats-row">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
                <span>{{ item.unit }}</span>
              </div>
            </dl>
          </section>

          <section class="stats-section">
            <h3>光标</h3>
            <dl class="stats-grid">
              <div v-for="item in wordCountDetails.position" :key="item.label" class="stats-row">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
                <span>{{ item.unit }}</span>
              </div>
            </dl>
          </section>
        </div>

        <footer class="stats-footer">{{ currentFileName }}</footer>
      </section>
    </div>

    <UnsavedChangesDialog
      v-if="unsavedDialogVisible"
      :file-name="currentFileName"
      :busy="unsavedDialogBusy"
      @save="saveFromUnsavedDialog"
      @discard="resolveUnsavedDialog('discard')"
      @cancel="resolveUnsavedDialog('cancel')"
    />

    <TextInputDialog
      v-if="textInputDialog"
      :title="textInputDialog.title"
      :message="textInputDialog.message"
      :initial-value="textInputDialog.initialValue"
      :placeholder="textInputDialog.placeholder"
      :confirm-label="textInputDialog.confirmLabel"
      @confirm="resolveTextInputDialog($event)"
      @cancel="resolveTextInputDialog(null)"
    />

    <ConfirmActionDialog
      v-if="confirmActionDialog"
      :title="confirmActionDialog.title"
      :message="confirmActionDialog.message"
      :confirm-label="confirmActionDialog.confirmLabel"
      @confirm="resolveConfirmActionDialog(true)"
      @cancel="resolveConfirmActionDialog(false)"
    />

    <AboutDialog v-if="aboutVisible" @close="closeAboutDialog" />

    <div v-if="toast" class="toast" :class="toastTone">{{ toast }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  FileText,
  Focus,
  FolderOpen,
  PanelLeft,
  Regex,
  Replace,
  SpellCheck2,
  TextCursorInput,
  Trash2,
  WholeWord,
  X,
} from "lucide-vue-next";
import AppSidebar from "@/components/AppSidebar.vue";
import AppToolbar from "@/components/AppToolbar.vue";
import AboutDialog from "@/components/AboutDialog.vue";
import ConfirmActionDialog from "@/components/ConfirmActionDialog.vue";
import ContinuousMarkdownEditor from "@/components/ContinuousMarkdownEditor.vue";
import SettingsPanel from "@/components/SettingsPanel.vue";
import TextInputDialog from "@/components/TextInputDialog.vue";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog.vue";
import { sampleDocument } from "@/data/sampleDocument";
import { formatDocumentTitle } from "@/utils/documentTitle";
import { buildExportHtml } from "@/utils/exportHtml";
import { buildExportFileName } from "@/utils/exportFileName";
import { isPathInsideTreeRoot, isSameTreePath } from "@/utils/fileTree";
import { resolveGlobalShortcut } from "@/utils/globalShortcuts";
import { clampSidebarContextMenuPosition } from "@/utils/sidebarContextMenu";
import {
  shouldSaveBeforeDocumentChange,
  type UnsavedChangesDecision,
} from "@/utils/documentChange";
import { activateSidebarTab, clampSidebarWidth, sidebarWidthDefault } from "@/utils/layout";
import { isMarkdownFileLike, isMarkdownPathLike } from "@/utils/markdownFiles";
import { normalizeFolderName, normalizeRenameFileName } from "@/utils/fileRename";
import { buildMarkdownFileLink, resolveDocumentRelativePath } from "@/utils/markdownFileLinks";
import { findOutlineItemByAnchor, getActiveOutlineId, getOutlineSelectionRange } from "@/utils/outline";
import { getPreviewHrefAnchor, getPreviewLinkAction, resolveLocalMarkdownHref } from "@/utils/previewLinks";
import { clampQuickOpenIndex, moveQuickOpenIndex } from "@/utils/quickOpen";
import {
  createEditorViewStateCache,
  initialEditorViewState,
} from "@/utils/editorViewState";
import type { ContinuousEditorViewState } from "@/utils/continuousEditor";
import { addRecentFileEntry, parseRecentFiles, replaceRecentFileEntry, serializeRecentFiles } from "@/utils/recentFiles";
import {
  createLoadedEditorSession,
  createUntitledEditorSession,
  fingerprintDiskContent,
  parseEditorSession,
  prepareEditorSessionForRecovery,
  serializeEditorSession,
  normalizeEditorMarkdown,
  type EditorSessionState,
} from "@/utils/sessionState";
import { getLineEndOffset, getLineStartOffset } from "@/utils/textPosition";
import { shouldBlockNavigation } from "@/utils/unsavedChanges";
import {
  formatInsertedImageSource,
  parseEditorSettings,
  prepareMarkdownForSave,
  shouldAutoSaveDocument,
} from "@/utils/editorSettings";
import {
  buildLocalMediaMarkup,
  getLocalMediaKind,
} from "@/utils/localMedia";
import {
  copyImageFileAsset,
  copyMediaFileAsset,
  createFolder,
  createMarkdownFile,
  destroyCurrentWindow,
  exportWithPandoc,
  getStartupMarkdownFiles,
  isDirectoryPath,
  isTauriRuntime,
  listMarkdownFolder,
  listenNativeFileDrops,
  listenWindowCloseRequested,
  openContainingFolder,
  openDeveloperTools,
  openFolderPath,
  openBrowserMarkdownFile,
  openBrowserImageFile,
  pickFolder,
  pickImageFile,
  pickMarkdownFile,
  readTextFile,
  revealFileInFolder,
  renameMarkdownFile,
  saveImageAsset,
  saveMarkdownAs,
  searchMarkdownFiles,
  trashPath,
  toggleNativeFullscreen,
  type NativeFileDrop,
  writeTextFile,
} from "@/services/desktop";
import { createOutline } from "@/utils/markdown";
import {
  findMatches,
  findInitialMatchIndex,
  findNextMatchIndex,
  getFindQueryFromSelection,
  replaceAllMatches,
  replaceMatchAndFindNext,
  resolveFindActiveIndex,
  type FindMatch,
} from "@/utils/findReplace";
import { calculateDocumentStats, formatWordCountDetails } from "@/utils/stats";
import type {
  EditorCommand,
  EditorSettings,
  ExportFormat,
  FileEntry,
  FilePanelMode,
  ImageInsertRequest,
  ImagePayload,
  LocalMediaKind,
  OutlineItem,
  RecentFile,
  SearchResult,
  SelectionStats,
  SidebarFileContextAction,
  SidebarFileContextTarget,
  SidebarTab,
} from "@/types";

interface ContinuousEditorHandle {
  runCommand: (command: EditorCommand, payload?: string) => void;
  insertImageMarkdown: (src: string, alt?: string) => void;
  reserveImageInsertion: () => string | null;
  replaceImagePlaceholder: (placeholder: string, src: string | null, alt?: string) => boolean;
  replaceMediaPlaceholder: (placeholder: string, markup: string | null) => boolean;
  setCursorAtCoordinates: (x: number, y: number) => boolean;
  insertText: (text: string) => void;
  replaceDocument: (value: string) => void;
  selectRange: (start: number, end: number, focus?: boolean) => Promise<void>;
  jumpToSelection: () => Promise<void>;
  jumpToLine: (line: number) => Promise<void>;
  getViewState: () => ContinuousEditorViewState | null;
  restoreViewState: (state: ContinuousEditorViewState | null | undefined) => Promise<void>;
  focus: () => void;
}

interface AppSidebarHandle {
  scrollCurrentFileIntoView: () => Promise<void>;
  showFiles: () => void;
  showOutline: () => void;
  showSearch: () => void;
  focusSearch: () => Promise<void>;
}

interface TextInputDialogState {
  title: string;
  message: string;
  initialValue: string;
  placeholder: string;
  confirmLabel: string;
}

interface ConfirmActionDialogState {
  title: string;
  message: string;
  confirmLabel: string;
}

interface DocumentRevisionGuard {
  path: string;
  revision: number;
  originalMarkdown: string;
  diskBaselinePath: string;
  diskBaselineContent: string | null;
  diskBaselineFingerprint: string | null;
  forceDirty: boolean;
}

const settingsKey = "marko.editor.settings";
const recentKey = "marko.recent.files";
const sidebarKey = "marko.sidebar.visible";
const sidebarWidthKey = "marko.sidebar.width";
const filePanelModeKey = "marko.sidebar.filePanelMode";
const sessionKey = "marko.editor.session";
const defaultSession: EditorSessionState = createLoadedEditorSession(sampleDocument, "", "未命名.md");
const initialSettings = loadSettings();
const initialSession = loadEditorSession(initialSettings.recoverUnsavedDrafts);

const editorRef = ref<ContinuousEditorHandle | null>(null);
const sidebarRef = ref<AppSidebarHandle | null>(null);
const quickInputRef = ref<HTMLInputElement | null>(null);
const quickListRef = ref<HTMLElement | null>(null);
const markdown = ref(initialSession.markdown);
const originalMarkdown = ref(initialSession.originalMarkdown);
const forceDirty = ref(initialSession.forceDirty ?? false);
const currentFilePath = ref(initialSession.currentFilePath);
const currentFileName = ref(initialSession.currentFileName);
const rootPath = ref(initialSession.rootPath);
const fileTree = ref<FileEntry[]>([]);
const recentFiles = ref<RecentFile[]>(loadRecentFiles());
const searchQuery = ref("");
const searchResults = ref<SearchResult[]>([]);
const searchPending = ref(false);
const selectionStats = ref<SelectionStats>({
  selectedText: "",
  selectionStart: 0,
  selectionEnd: 0,
  chars: 0,
  words: 0,
  lines: 0,
  cursorLine: 1,
  cursorColumn: 1,
});
const settings = ref<EditorSettings>(initialSettings);
const sidebarVisible = ref(loadSidebarVisible());
const sidebarActiveTab = ref<SidebarTab>(settings.value.defaultSidebarTab);
const filePanelMode = ref<FilePanelMode>(loadFilePanelMode());
const sidebarWidth = ref(loadSidebarWidth());
const settingsVisible = ref(false);
const wordCountVisible = ref(false);
const wordCountPanelRef = ref<HTMLElement | null>(null);
const unsavedDialogVisible = ref(false);
const unsavedDialogBusy = ref(false);
const textInputDialog = ref<TextInputDialogState | null>(null);
const confirmActionDialog = ref<ConfirmActionDialogState | null>(null);
const aboutVisible = ref(false);
const quickOpenVisible = ref(false);
const quickQuery = ref("");
const quickActiveIndex = ref(0);
const recentPanelVisible = ref(false);
const recentPanelRef = ref<HTMLElement | null>(null);
const recentContextMenu = ref<{ target: SidebarFileContextTarget; x: number; y: number } | null>(null);
const findPanelVisible = ref(false);
const findReplaceVisible = ref(false);
const findInputRef = ref<HTMLInputElement | null>(null);
const findQuery = ref("");
const replaceQuery = ref("");
const findCaseSensitive = ref(false);
const findWholeWord = ref(false);
const findRegularExpression = ref(false);
const findActiveIndex = ref(-1);
const toast = ref("");
const toastTone = ref<"info" | "danger" | "success">("info");
const dragActive = ref(false);
const dragHint = ref("拖入 Markdown 文件打开，拖入图片插入");
let toastTimer = 0;
let autoSaveTimer = 0;
let autoSaveScheduleKey = "";
let saveInFlight: Promise<void> | null = null;
let mediaDocumentSaveInFlight: Promise<boolean> | null = null;
let dragDepth = 0;
let unlistenNativeDrop: (() => void) | null = null;
let unlistenWindowClose: (() => void) | null = null;
let sidebarResizeCleanup: (() => void) | null = null;
let pendingUnsavedResolver: ((decision: UnsavedChangesDecision) => void) | null = null;
let pendingTextInputResolver: ((value: string | null) => void) | null = null;
let pendingConfirmActionResolver: ((value: boolean) => void) | null = null;
let nativeCloseInProgress = false;
let openFileRequestId = 0;
let searchRequestId = 0;
let workspaceRequestId = 0;
let workspaceRefreshRequestId = 0;
let documentRevision = 0;
let documentSessionGeneration = 0;
let diskBaselinePath = initialSession.currentFilePath;
let diskBaselineContent: string | null = null;
let diskBaselineFingerprint: string | null = initialSession.diskBaselineFingerprint ?? null;
let pendingImageOperations = 0;
let pathMutationInFlight = 0;
const editorViewStates = createEditorViewStateCache();

const dirty = computed(() => forceDirty.value || markdown.value !== originalMarkdown.value);
const outline = computed(() => createOutline(markdown.value));
const activeOutlineId = computed(() => getActiveOutlineId(outline.value, selectionStats.value.cursorLine));
const stats = computed(() => calculateDocumentStats(markdown.value, settings.value.readingSpeed));
const wordCountDetails = computed(() => formatWordCountDetails(stats.value, selectionStats.value));
const blockingDialogVisible = computed(() => Boolean(
  unsavedDialogVisible.value
  || textInputDialog.value
  || confirmActionDialog.value
  || settingsVisible.value
  || aboutVisible.value,
));
const effectiveSettings = computed<EditorSettings>(() => ({
  ...settings.value,
  fontSize: Math.round(settings.value.fontSize * settings.value.zoom),
}));
const sidebarLayoutVisible = computed(() => (
  sidebarVisible.value && !settings.value.focusMode && !settings.value.sourceMode
));
const workspaceStyle = computed(() => ({
  "--sidebar-width": `${sidebarWidth.value}px`,
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
const activeQuickFile = computed(() => filteredQuickFiles.value[quickActiveIndex.value] ?? null);
const currentFindMatches = computed(() => findMatches(markdown.value, findQuery.value, {
  caseSensitive: findCaseSensitive.value,
  wholeWord: findWholeWord.value,
  regularExpression: findRegularExpression.value,
}));
const currentFindMatch = computed<FindMatch | null>(() => {
  if (findActiveIndex.value < 0) return null;
  return currentFindMatches.value[findActiveIndex.value] ?? null;
});

watch(
  settings,
  (value) => {
    localStorage.setItem(settingsKey, JSON.stringify(value));
    document.documentElement.dataset.theme = value.theme === "dark" ? "dark" : "solo";
  },
  { deep: true, immediate: true },
);

watch(
  [markdown, currentFilePath, () => settings.value.autoSave, () => settings.value.autoSaveIntervalMinutes],
  () => {
    scheduleAutoSave();
  },
);

watch(sidebarVisible, (value) => {
  localStorage.setItem(sidebarKey, JSON.stringify(value));
});

watch(sidebarWidth, (value) => {
  localStorage.setItem(sidebarWidthKey, JSON.stringify(value));
});

watch(filePanelMode, (value) => {
  localStorage.setItem(filePanelModeKey, JSON.stringify(value));
});

watch([markdown, originalMarkdown, forceDirty, currentFilePath, currentFileName, rootPath, () => settings.value.recoverUnsavedDrafts], () => {
  persistEditorSessionState();
});

function persistEditorSessionState() {
  try {
    localStorage.setItem(sessionKey, serializeEditorSession(prepareEditorSessionForRecovery({
      markdown: markdown.value,
      originalMarkdown: originalMarkdown.value,
      currentFilePath: currentFilePath.value,
      currentFileName: currentFileName.value,
      rootPath: rootPath.value,
      forceDirty: forceDirty.value,
      ...(isSameTreePath(diskBaselinePath, currentFilePath.value) && diskBaselineFingerprint
        ? { diskBaselineFingerprint }
        : {}),
    }, settings.value.recoverUnsavedDrafts)));
  } catch (error) {
    console.warn("保存恢复会话失败", error);
  }
}

watch(quickOpenVisible, async (visible) => {
  if (!visible) return;
  quickQuery.value = "";
  quickActiveIndex.value = 0;
  await nextTick();
  quickInputRef.value?.focus();
});

watch(quickQuery, () => {
  quickActiveIndex.value = 0;
});

watch(recentPanelVisible, async (visible) => {
  if (!visible) return;
  await nextTick();
  recentPanelRef.value?.focus();
});

watch(filteredQuickFiles, async (files) => {
  quickActiveIndex.value = clampQuickOpenIndex(quickActiveIndex.value, files.length);
  await nextTick();
  scrollActiveQuickResultIntoView();
});

watch(findPanelVisible, async (visible) => {
  if (!visible) return;
  await nextTick();
  findInputRef.value?.focus();
  findInputRef.value?.select();
});

watch(wordCountVisible, async (visible) => {
  if (!visible) return;
  await nextTick();
  wordCountPanelRef.value?.focus();
});

watch(currentFindMatches, (matches) => {
  findActiveIndex.value = resolveFindActiveIndex(
    matches,
    selectionStats.value.selectionStart,
    selectionStats.value.selectionEnd,
    findActiveIndex.value,
  );
});

watch([findQuery, findCaseSensitive, findWholeWord, findRegularExpression], async () => {
  if (!findPanelVisible.value) return;
  findActiveIndex.value = resolveFindActiveIndex(
    currentFindMatches.value,
    selectionStats.value.selectionStart,
    selectionStats.value.selectionEnd,
    -1,
    true,
  );
  await nextTick();
  await selectCurrentFindMatch();
});

watch([currentFileName, dirty], () => {
  document.title = formatDocumentTitle(currentFileName.value, dirty.value);
}, { immediate: true });

onMounted(() => {
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);
  void restoreWorkspaceFolder();
  void openStartupMarkdownFile().finally(scheduleAutoSave);
  void setupNativeFileDrop();
  void setupNativeWindowClose();
});

onBeforeUnmount(() => {
  cleanupSidebarResize();
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  unlistenNativeDrop?.();
  unlistenWindowClose?.();
  pendingUnsavedResolver?.("cancel");
  pendingTextInputResolver?.(null);
  pendingConfirmActionResolver?.(false);
  window.clearTimeout(toastTimer);
  clearAutoSaveTimer();
});

async function newFile() {
  if (!await confirmDocumentChange()) return;
  applyEditorSession(createUntitledEditorSession(rootPath.value));
  showToast("已新建空白文档", "success");
}

async function closeFile() {
  if (!await confirmDocumentChange()) return;
  applyEditorSession(createUntitledEditorSession(rootPath.value));
  showToast("已关闭当前文档", "success");
}

async function openFile() {
  try {
    if (isTauriRuntime()) {
      const path = await pickMarkdownFile();
      if (path) await openFileByPath(path);
      return;
    }

    const file = await openBrowserMarkdownFile();
    if (!file) return;
    if (!await confirmDocumentChange(true)) return;
    applyEditorSession(createLoadedEditorSession(file.content, "", file.name, rootPath.value));
    showToast("已打开浏览器文件", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function openFileByPath(path: string, ask = true): Promise<boolean> {
  if (ask && !await confirmDocumentChange(true)) return false;

  const requestId = ++openFileRequestId;
  const documentGuard = captureDocumentRevision();
  const wasRecent = hasRecentPath(path);
  try {
    const content = await readTextFile(path);
    if (requestId !== openFileRequestId) return false;
    if (!isDocumentRevisionCurrent(documentGuard)) {
      showToast("当前文档已发生变化，已取消打开文件", "info");
      return false;
    }
    applyEditorSession(createLoadedEditorSession(content, path, basename(path), rootPath.value), content);
    addRecentFile(path);
    showToast(`已打开 ${basename(path)}`, "success");
    return true;
  } catch (error) {
    if (requestId !== openFileRequestId) return false;
    if (wasRecent) {
      removeRecentPath(path, false);
      showToast(`${formatError(error)}，已从最近文件移除`, "danger");
    } else {
      showToast(formatError(error), "danger");
    }
    return false;
  }
}

async function openStartupMarkdownFile() {
  if (!isTauriRuntime()) return;

  try {
    await refreshInitialSessionFromDisk();
    const [path] = await getStartupMarkdownFiles();
    if (path) {
      await openFileByPath(path);
    }
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function refreshInitialSessionFromDisk() {
  const path = initialSession.currentFilePath;
  if (!path) return;
  const documentGuard = captureDocumentRevision();

  try {
    const content = await readTextFile(path);
    if (!isDocumentRevisionCurrent(documentGuard)) return;
    const diskSession = createLoadedEditorSession(content, path, basename(path), rootPath.value);
    const recoveredDraft = initialSession.markdown !== initialSession.originalMarkdown;
    if (!recoveredDraft) {
      applyEditorSession(diskSession, content);
      return;
    }
    const storedDiskBaseline = initialSession.diskBaselineFingerprint;
    const normalizedDiskContent = normalizeEditorMarkdown(content);
    const expectedSavedContent = normalizeEditorMarkdown(prepareMarkdownForSave(
      initialSession.originalMarkdown,
      settings.value.defaultLineEnding,
      settings.value.insertFinalNewline,
    ));
    const diskMatchesBaseline = typeof storedDiskBaseline === "string"
      ? fingerprintDiskContent(content) === storedDiskBaseline
      : normalizedDiskContent === initialSession.originalMarkdown
        || normalizedDiskContent === expectedSavedContent;
    if (!diskMatchesBaseline) {
      detachInitialSessionAsRecoveredDraft("检测到原文件已被外部修改，恢复稿已作为未保存文档打开");
      return;
    }
    setDiskBaseline(path, content);
  } catch (error) {
    if (isDocumentRevisionCurrent(documentGuard)) {
      detachInitialSessionAsRecoveredDraft(`原文件无法读取，已作为未保存文档恢复：${formatError(error)}`);
    }
  }
}

function detachInitialSessionAsRecoveredDraft(message: string) {
  applyEditorSession({
    markdown: initialSession.markdown,
    originalMarkdown: initialSession.markdown,
    currentFilePath: "",
    currentFileName: initialSession.currentFileName,
    rootPath: rootPath.value,
    forceDirty: true,
  });
  showToast(message, "danger");
}

async function openDroppedMarkdownFile(file: File) {
  try {
    const content = await file.text();
    if (!await confirmDocumentChange(true)) return;
    applyEditorSession(createLoadedEditorSession(content, "", file.name, rootPath.value));
    showToast(`已打开 ${file.name}`, "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function reloadFile() {
  if (!currentFilePath.value || !isTauriRuntime()) {
    showToast("当前文档还没有可重新载入的本地文件", "info");
    return;
  }
  if (!await confirmDocumentChange()) return;

  const requestId = ++openFileRequestId;
  const documentGuard = captureDocumentRevision();
  try {
    const path = documentGuard.path;
    const content = await readTextFile(path);
    if (requestId !== openFileRequestId) return;
    if (!isDocumentRevisionCurrent(documentGuard)) {
      showToast("当前文档已发生变化，已取消重新载入", "info");
      return;
    }
    applyEditorSession(createLoadedEditorSession(content, path, basename(path), rootPath.value), content);
    addRecentFile(path);
    showToast(`已重新载入 ${basename(path)}`, "success");
  } catch (error) {
    if (requestId !== openFileRequestId || !isDocumentRevisionCurrent(documentGuard)) return;
    showToast(formatError(error), "danger");
  }
}

async function renameCurrentFile() {
  if (blockForPendingImages()) return;
  if (!currentFilePath.value || !isTauriRuntime()) {
    showToast("当前文档还没有可重命名的本地文件", "info");
    return;
  }

  await renameFilePath(currentFilePath.value, currentFileName.value);
}

async function renameFilePath(path: string, currentName = basename(path)) {
  if (isSameTreePath(path, currentFilePath.value) && blockForPendingImages()) return;
  if (!path || !isTauriRuntime()) {
    showToast("此文件无法重命名", "info");
    return;
  }

  const input = await requestTextInput({
    title: "重命名文件",
    message: "输入新的文件名",
    initialValue: currentName,
    placeholder: "文件名.md",
    confirmLabel: "重命名",
  });
  if (input === null) return;

  const normalized = normalizeRenameFileName(input, currentName);
  if (!normalized.ok) {
    showToast(normalized.message, "info");
    return;
  }

  if (normalized.fileName === currentName) {
    showToast("文件名未变化", "info");
    return;
  }

  const renamesCurrentFile = isSameTreePath(path, currentFilePath.value);
  if (renamesCurrentFile && saveInFlight) {
    try {
      await saveInFlight;
    } catch (error) {
      showToast(`保存尚未完成，已取消重命名：${formatError(error)}`, "danger");
      return;
    }
    if (!isSameTreePath(path, currentFilePath.value)) {
      showToast("当前文档已变化，已取消重命名", "info");
      return;
    }
  }
  if (renamesCurrentFile) {
    clearAutoSaveTimer();
    pathMutationInFlight += 1;
  }
  try {
    const oldPath = path;
    const nextPath = await renameMarkdownFile(oldPath, normalized.fileName);
    if (oldPath === currentFilePath.value) {
      rememberCurrentEditorViewState();
      currentFilePath.value = nextPath;
      currentFileName.value = basename(nextPath);
      documentRevision += 1;
      moveDiskBaseline(oldPath, nextPath);
      editorViewStates.move(oldPath, nextPath);
    }
    replaceRecentFile(oldPath, nextPath);
    await refreshWorkspaceFileTreeForPath(nextPath);
    showToast(`已重命名为 ${basename(nextPath)}`, "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  } finally {
    if (renamesCurrentFile) {
      pathMutationInFlight = Math.max(0, pathMutationInFlight - 1);
      scheduleAutoSave();
    }
  }
}

async function copyCurrentFilePath() {
  if (!currentFilePath.value || !isTauriRuntime()) {
    showToast("当前文档还没有可复制的本地路径", "info");
    return;
  }

  await copyPathToClipboard(currentFilePath.value);
}

async function copyPathToClipboard(path: string) {
  if (!path) {
    showToast("没有可复制的路径", "info");
    return;
  }

  try {
    await navigator.clipboard.writeText(path);
    showToast("已复制文件路径", "success");
  } catch {
    showToast("无法访问剪贴板", "danger");
  }
}

async function copyTextToClipboard(text: string, successMessage: string, emptyMessage: string) {
  if (!text) {
    showToast(emptyMessage, "info");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage, "success");
  } catch {
    showToast("无法访问剪贴板", "danger");
  }
}

async function revealCurrentFile() {
  if (!currentFilePath.value || !isTauriRuntime()) {
    showToast("当前文档还没有可定位的本地文件", "info");
    return;
  }

  await revealFilePath(currentFilePath.value);
}

async function revealFilePath(path: string) {
  if (!path || !isTauriRuntime()) {
    showToast("此文件无法在资源管理器中显示", "info");
    return;
  }

  try {
    await revealFileInFolder(path);
    showToast("已在文件管理器中显示", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function openCurrentContainingFolder() {
  if (!currentFilePath.value || !isTauriRuntime()) {
    showToast("当前文档还没有可打开的本地文件夹", "info");
    return;
  }

  await openContainingFolderPath(currentFilePath.value);
}

async function openContainingFolderPath(path: string) {
  if (!path || !isTauriRuntime()) {
    showToast("此文件没有可打开的本地文件夹", "info");
    return;
  }

  try {
    await openContainingFolder(path);
    showToast("已打开所在文件夹", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function saveFile(): Promise<boolean> {
  if (blockForPendingImages() || blockForPathMutation()) return false;
  try {
    if (!currentFilePath.value || !isTauriRuntime()) {
      return await saveAsFile();
    }
    await persistCurrentFile();
    await refreshWorkspaceFileTreeForPath(currentFilePath.value);
    const fullySaved = !dirty.value;
    showToast(
      fullySaved ? "已保存" : "已保存当前快照，仍有未保存更改",
      fullySaved ? "success" : "info",
    );
    return fullySaved;
  } catch (error) {
    showToast(formatError(error), "danger");
    return false;
  }
}

async function saveAsFile(): Promise<boolean> {
  if (blockForPendingImages() || blockForPathMutation()) return false;
  try {
    const source = markdown.value;
    const documentGuard = captureDocumentRevision();
    const content = prepareMarkdownForSave(
      source,
      settings.value.defaultLineEnding,
      settings.value.insertFinalNewline,
    );
    const path = await saveMarkdownAs(content, getSaveDefaultDir());
    if (path) {
      if (!isDocumentRevisionCurrent(documentGuard)) {
        addRecentFile(path);
        await refreshWorkspaceFileTreeForPath(path);
        showToast(`已保存快照 ${basename(path)}，当前文档仍有未保存更改`, "info");
        return false;
      }
      const viewState = editorRef.value?.getViewState();
      currentFilePath.value = path;
      currentFileName.value = basename(path);
      documentRevision += 1;
      documentSessionGeneration += 1;
      setDiskBaseline(path, content);
      editorViewStates.remember(path, viewState);
      originalMarkdown.value = source;
      forceDirty.value = false;
      addRecentFile(path);
      await refreshWorkspaceFileTreeForPath(path);
      showToast(`已保存为 ${basename(path)}`, "success");
      return true;
    } else if (!isTauriRuntime()) {
      const fullySaved = isDocumentRevisionCurrent(documentGuard);
      if (fullySaved) {
        originalMarkdown.value = source;
        forceDirty.value = false;
      }
      showToast(
        fullySaved ? "已下载 Markdown 文件" : "已下载当前快照，文档仍有未保存更改",
        fullySaved ? "success" : "info",
      );
      return fullySaved;
    }
    return false;
  } catch (error) {
    showToast(formatError(error), "danger");
    return false;
  }
}

async function openFolder() {
  try {
    const selected = await pickFolder();
    if (!selected) return;
    await loadWorkspaceFolder(selected, "已加载文件夹");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function openCurrentFolderWorkspace() {
  if (!currentFilePath.value || !isTauriRuntime()) {
    showToast("当前文档还没有可打开的本地文件夹", "info");
    return;
  }

  try {
    await loadWorkspaceFolder(dirname(currentFilePath.value), "已将所在文件夹作为工作区打开");
    showSidebarTab("files");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function runSidebarFileContextAction(
  action: SidebarFileContextAction,
  target: SidebarFileContextTarget,
) {
  switch (action) {
    case "openFile":
      if (!target.isDir) {
        await openFileByPath(target.path);
      }
      break;
    case "newFileInFolder":
      if (target.isDir) {
        await createMarkdownFileInFolder(target.path);
      }
      break;
    case "newFolderInFolder":
      if (target.isDir) {
        await createFolderInWorkspace(target.path);
      }
      break;
    case "refreshFolder":
      if (target.isDir) {
        await refreshSidebarFolder(target.path);
      }
      break;
    case "renameFile":
      if (!target.isDir) {
        await renameFilePath(target.path, target.name);
      }
      break;
    case "copyName":
      await copyTextToClipboard(target.name || basename(target.path), "已复制名称", "没有可复制的名称");
      break;
    case "copyMarkdownLink":
      if (!target.isDir) {
        await copyTextToClipboard(
          buildMarkdownFileLink({
            targetPath: target.path,
            targetName: target.name,
            currentPath: currentFilePath.value || undefined,
            rootPath: rootPath.value || undefined,
          }),
          "已复制 Markdown 链接",
          "没有可复制的文件链接",
        );
      }
      break;
    case "copyRelativePath":
      await copyTextToClipboard(
        resolveDocumentRelativePath({
          targetPath: target.path,
          currentPath: currentFilePath.value || undefined,
          rootPath: rootPath.value || undefined,
        }),
        "已复制相对路径",
        "没有可复制的路径",
      );
      break;
    case "copyPath":
      await copyPathToClipboard(target.path);
      break;
    case "revealFile":
      await revealFilePath(target.path);
      break;
    case "openContainingFolder":
      await openContainingFolderPath(target.path);
      break;
    case "openFolderPath":
      await openFolderInExplorer(target.path);
      break;
    case "openAsWorkspace":
      if (target.isDir) {
        await loadWorkspaceFolder(target.path, "已将文件夹作为工作区打开");
        showSidebarTab("files");
      }
      break;
    case "deletePath":
      await moveSidebarTargetToTrash(target);
      break;
    case "removeRecent":
      removeRecentPath(target.path, false);
      showToast("已从最近文件移除", "success");
      break;
    default:
      break;
  }
}

async function createMarkdownFileInFolder(folderPath: string) {
  if (!folderPath || !isTauriRuntime()) {
    showToast("当前没有可新建文件的工作区文件夹", "info");
    return;
  }
  if (!await confirmDocumentChange(true)) return;

  const input = await requestTextInput({
    title: "新建文件",
    message: "输入 Markdown 文件名",
    initialValue: "未命名.md",
    placeholder: "文件名.md",
    confirmLabel: "新建",
  });
  if (input === null) return;

  const normalized = normalizeRenameFileName(input, "未命名.md");
  if (!normalized.ok) {
    showToast(normalized.message, "info");
    return;
  }

  const requestId = ++openFileRequestId;
  const documentGuard = captureDocumentRevision();
  const workspaceVersion = workspaceRequestId;
  const workspacePath = rootPath.value;
  try {
    const path = await createMarkdownFile(folderPath, normalized.fileName);
    if (
      requestId !== openFileRequestId
      || !isDocumentRevisionCurrent(documentGuard)
      || workspaceVersion !== workspaceRequestId
      || !isSameTreePath(workspacePath, rootPath.value)
    ) {
      await refreshWorkspaceFileTreeForPath(path);
      showToast(`已新建 ${basename(path)}，当前文档或工作区已变化，未自动打开`, "info");
      return;
    }
    applyEditorSession(createLoadedEditorSession("", path, basename(path), rootPath.value), "");
    addRecentFile(path);
    await refreshWorkspaceFileTreeForPath(path);
    showToast(`已新建 ${basename(path)}`, "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function createFolderInWorkspace(parentPath: string) {
  if (!parentPath || !isTauriRuntime()) {
    showToast("当前没有可新建文件夹的工作区文件夹", "info");
    return;
  }

  const input = await requestTextInput({
    title: "新建文件夹",
    message: "输入文件夹名称",
    initialValue: "新建文件夹",
    placeholder: "文件夹名称",
    confirmLabel: "新建",
  });
  if (input === null) return;

  const normalized = normalizeFolderName(input);
  if (!normalized.ok) {
    showToast(normalized.message, "info");
    return;
  }

  try {
    const path = await createFolder(parentPath, normalized.fileName);
    await refreshWorkspaceFileTreeForPath(path);
    showToast(`已新建文件夹 ${basename(path)}`, "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function refreshSidebarFolder(path: string) {
  if (!rootPath.value || !isTauriRuntime()) {
    showToast("当前没有可刷新的工作区文件夹", "info");
    return;
  }

  await refreshWorkspaceFileTreeForPath(path);
  showToast("已刷新文件夹", "success");
}

async function moveSidebarTargetToTrash(target: SidebarFileContextTarget) {
  if (!target.path || !isTauriRuntime()) {
    showToast("此项目无法移到回收站", "info");
    return;
  }

  const kind = target.isDir ? "文件夹" : "文件";
  const closesCurrentFile = target.isDir
    ? isPathInsideTreeRoot(currentFilePath.value, target.path)
    : isSameTreePath(currentFilePath.value, target.path);
  if (!await requestConfirmation({
    title: `将${kind}移到回收站`,
    message: `确定要将${kind}“${target.name}”移到回收站吗？可以稍后从回收站恢复。`,
    confirmLabel: "移到回收站",
  })) return;
  if (closesCurrentFile && !await confirmDocumentChange()) return;

  const requestId = closesCurrentFile ? ++openFileRequestId : openFileRequestId;
  const documentGuard = closesCurrentFile ? captureDocumentRevision() : null;
  let preservedAsDraft = false;
  try {
    await trashPath(target.path);
    const affectsCurrentFile = target.isDir
      ? isPathInsideTreeRoot(currentFilePath.value, target.path)
      : isSameTreePath(currentFilePath.value, target.path);
    if (closesCurrentFile
      && requestId === openFileRequestId
      && documentGuard
      && isDocumentRevisionCurrent(documentGuard)) {
      applyEditorSession(createUntitledEditorSession(rootPath.value));
    } else if (affectsCurrentFile) {
      applyEditorSession(createDetachedDraftSession(
        markdown.value,
        currentFileName.value,
        originalMarkdown.value,
      ));
      preservedAsDraft = true;
    }
    editorViewStates.remove(target.path, target.isDir);
    removeRecentPath(target.path, target.isDir);
    await refreshWorkspaceFileTreeForPath(target.path);
    showToast(
      preservedAsDraft ? "文件已移到回收站，后续编辑已保留为未保存文档" : `已将${kind}移到回收站`,
      preservedAsDraft ? "info" : "success",
    );
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function openFolderInExplorer(path: string) {
  if (!path || !isTauriRuntime()) {
    showToast("此文件夹无法在资源管理器中打开", "info");
    return;
  }

  try {
    await openFolderPath(path);
    showToast("已打开文件夹", "success");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

function closeWorkspaceFolder() {
  if (!rootPath.value) {
    showToast("当前没有打开的工作区文件夹", "info");
    return;
  }

  workspaceRequestId += 1;
  rootPath.value = "";
  fileTree.value = [];
  clearGlobalSearch();
  recentPanelVisible.value = false;
  closeQuickOpen(false);
  showToast("已关闭工作区文件夹", "success");
}

async function refreshWorkspaceFolder() {
  if (!rootPath.value || !isTauriRuntime()) {
    showToast("当前没有可刷新的工作区文件夹", "info");
    return;
  }

  try {
    await loadWorkspaceFolder(rootPath.value, "已刷新工作区文件夹");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function loadWorkspaceFolder(path: string, message: string) {
  const requestId = ++workspaceRequestId;
  const changedWorkspace = !isSameTreePath(rootPath.value, path);
  const entries = await listMarkdownFolder(path);
  if (requestId !== workspaceRequestId) return;
  rootPath.value = path;
  fileTree.value = entries;
  if (changedWorkspace) clearGlobalSearch();
  showToast(message, "success");
}

async function restoreWorkspaceFolder() {
  if (!rootPath.value || !isTauriRuntime()) return;

  const path = rootPath.value;
  const requestId = ++workspaceRequestId;
  try {
    const entries = await listMarkdownFolder(path);
    if (requestId === workspaceRequestId && isSameTreePath(rootPath.value, path)) {
      fileTree.value = entries;
    }
  } catch (error) {
    console.warn("恢复工作目录失败", error);
  }
}

function getSaveDefaultDir(): string {
  return dirname(currentFilePath.value) || rootPath.value;
}

async function refreshWorkspaceFileTreeForPath(path: string) {
  if (!rootPath.value || !isTauriRuntime() || !isPathInsideTreeRoot(path, rootPath.value)) return;

  const workspaceVersion = workspaceRequestId;
  const requestId = ++workspaceRefreshRequestId;
  const workspacePath = rootPath.value;
  try {
    const entries = await listMarkdownFolder(workspacePath);
    if (
      workspaceVersion === workspaceRequestId
      && requestId === workspaceRefreshRequestId
      && isSameTreePath(rootPath.value, workspacePath)
    ) {
      fileTree.value = entries;
    }
  } catch (error) {
    console.warn("刷新工作区文件树失败", error);
  }
}

async function runGlobalSearch(query: string) {
  recentPanelVisible.value = false;
  searchQuery.value = query;
  const requestId = ++searchRequestId;
  const normalized = query.trim();
  if (!normalized) {
    searchResults.value = [];
    searchPending.value = false;
    return;
  }

  searchPending.value = true;
  try {
    if (rootPath.value && isTauriRuntime()) {
      const searchRoot = rootPath.value;
      const results = await searchMarkdownFiles(searchRoot, normalized);
      if (
        requestId === searchRequestId
        && searchQuery.value === query
        && isSameTreePath(rootPath.value, searchRoot)
      ) {
        searchResults.value = results;
      }
      return;
    }

    const lines = markdown.value.split(/\r?\n/);
    const results = lines
      .map((line, index) => ({ path: currentFileName.value, line: index + 1, snippet: line.trim() }))
      .filter((item) => item.snippet.toLowerCase().includes(normalized.toLowerCase()))
      .slice(0, 80);
    if (requestId === searchRequestId && searchQuery.value === query) {
      searchResults.value = results;
    }
  } catch (error) {
    if (requestId === searchRequestId) showToast(formatError(error), "danger");
  } finally {
    if (requestId === searchRequestId) searchPending.value = false;
  }
}

function clearGlobalSearch() {
  searchRequestId += 1;
  searchQuery.value = "";
  searchResults.value = [];
  searchPending.value = false;
}

async function openSearchResult(result: SearchResult) {
  if (result.path !== currentFilePath.value && result.path !== currentFileName.value) {
    const opened = await openFileByPath(result.path);
    if (!opened) return;
  }

  await nextTick();
  const start = getLineStartOffset(markdown.value, result.line);
  const end = getLineEndOffset(markdown.value, result.line);
  await editorRef.value?.selectRange(start, end);
  await editorRef.value?.jumpToSelection();
}

async function openOutlineItem(item: OutlineItem) {
  await nextTick();
  const range = getOutlineSelectionRange(markdown.value, item);
  await editorRef.value?.selectRange(range.start, range.end);
  await editorRef.value?.jumpToSelection();
}

async function selectSourceRange(start: number, end: number) {
  if (!settings.value.sourceMode) {
    patchSettings({ sourceMode: true });
    await nextTick();
  }
  await editorRef.value?.selectRange(start, end);
}

async function openLinkedMarkdownFile(path: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    showToast("浏览器预览模式无法直接打开本地相对链接", "info");
    return false;
  }
  return openFileByPath(path);
}

async function openCurrentMarkdownLink(href: string) {
  const action = getPreviewLinkAction(href);
  if (action === "blocked" || action === "none") {
    showToast("此链接无法打开", "info");
    return;
  }

  const markdownPath = resolveLocalMarkdownHref(href, currentFilePath.value || undefined);
  if (markdownPath) {
    const opened = await openLinkedMarkdownFile(markdownPath);
    const anchor = getPreviewHrefAnchor(href);
    if (opened && anchor) {
      await nextTick();
      await openDocumentAnchor(anchor);
    }
    return;
  }

  if (action === "anchor") {
    await openDocumentAnchor(href);
    return;
  }

  if (action === "relative" || action === "local") {
    showToast("当前链接不是可直接打开的 Markdown 文件", "info");
    return;
  }

  openExternalLink(href);
}

async function openDocumentAnchor(href: string) {
  const item = findOutlineItemByAnchor(outline.value, href);
  if (!item) {
    showToast("未找到对应标题", "info");
    return;
  }

  await openOutlineItem(item);
}

function openExternalLink(href: string) {
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (opened) {
    opened.opener = null;
    showToast("已打开链接", "success");
  } else {
    showToast("浏览器阻止了链接打开", "info");
  }
}

async function executeCommand(command: EditorCommand, payload?: string) {
  if (command === "setImageWidth") {
    const width = await requestTextInput({
      title: "设置图片宽度",
      message: "输入像素值或百分比",
      initialValue: "480",
      placeholder: "例如 480 或 60%",
      confirmLabel: "应用",
    });
    if (width) editorRef.value?.runCommand(command, width);
    return;
  }
  editorRef.value?.runCommand(command, payload);
}

async function locateCurrentFileInTree() {
  filePanelMode.value = "tree";
  if (!currentFilePath.value) {
    showToast("当前文档还没有可定位的本地文件", "info");
    return;
  }

  showSidebarTab("files");
  await nextTick();
  await sidebarRef.value?.scrollCurrentFileIntoView();
}

function updateMarkdown(value: string) {
  if (value === markdown.value) return;
  markdown.value = value;
  documentRevision += 1;
}

function captureDocumentRevision(): DocumentRevisionGuard {
  return {
    path: currentFilePath.value,
    revision: documentRevision,
    originalMarkdown: originalMarkdown.value,
    diskBaselinePath,
    diskBaselineContent,
    diskBaselineFingerprint,
    forceDirty: forceDirty.value,
  };
}

function isDocumentRevisionCurrent(guard: DocumentRevisionGuard): boolean {
  return guard.revision === documentRevision
    && guard.path === currentFilePath.value
    && guard.originalMarkdown === originalMarkdown.value
    && guard.diskBaselinePath === diskBaselinePath
    && guard.diskBaselineContent === diskBaselineContent
    && guard.diskBaselineFingerprint === diskBaselineFingerprint
    && guard.forceDirty === forceDirty.value;
}

function applyEditorSession(session: EditorSessionState, diskContent: string | null = null) {
  openFileRequestId += 1;
  documentRevision += 1;
  documentSessionGeneration += 1;
  clearAutoSaveTimer();
  rememberCurrentEditorViewState();
  markdown.value = session.markdown;
  originalMarkdown.value = session.originalMarkdown;
  forceDirty.value = session.forceDirty ?? false;
  currentFilePath.value = session.currentFilePath;
  currentFileName.value = session.currentFileName;
  rootPath.value = session.rootPath;
  setDiskBaseline(
    session.currentFilePath,
    diskContent,
    diskContent === null ? session.diskBaselineFingerprint ?? null : undefined,
  );
  selectionStats.value = {
    selectedText: "",
    selectionStart: 0,
    selectionEnd: 0,
    chars: 0,
    words: 0,
    lines: 0,
    cursorLine: 1,
    cursorColumn: 1,
  };
  const viewState = editorViewStates.recall(session.currentFilePath) ?? initialEditorViewState;
  nextTick(() => editorRef.value?.restoreViewState(viewState));
}

function rememberCurrentEditorViewState() {
  editorViewStates.remember(currentFilePath.value, editorRef.value?.getViewState());
}

function setDiskBaseline(
  path: string,
  content: string | null,
  fingerprint = content === null ? null : fingerprintDiskContent(content),
) {
  diskBaselinePath = path;
  diskBaselineContent = path && content !== null ? content : null;
  diskBaselineFingerprint = path ? fingerprint : null;
  persistEditorSessionState();
}

function moveDiskBaseline(oldPath: string, newPath: string) {
  if (!isSameTreePath(diskBaselinePath, oldPath) || diskBaselineFingerprint === null) return;
  diskBaselinePath = newPath;
  persistEditorSessionState();
}

function getDiskBaseline(path: string): string | null {
  return isSameTreePath(diskBaselinePath, path) ? diskBaselineContent : null;
}

function createDetachedDraftSession(
  markdownValue: string,
  fileName: string,
  _preferredBaseline: string,
): EditorSessionState {
  return {
    markdown: markdownValue,
    originalMarkdown: markdownValue,
    currentFilePath: "",
    currentFileName: fileName,
    rootPath: rootPath.value,
    forceDirty: true,
  };
}

async function handleImageData(request: ImageInsertRequest) {
  const kind = request.kind ?? "image";
  let placeholder = request.placeholder;
  if (requiresSavedDocumentForMedia(kind, true)) {
    if (placeholder) editorRef.value?.replaceMediaPlaceholder(placeholder, null);
    placeholder = undefined;
    if (!await ensureSavedDocumentForMedia(kind, true)) return;
  }
  placeholder ??= editorRef.value?.reserveImageInsertion() ?? undefined;
  if (!placeholder) {
    showToast("编辑器尚未就绪，无法插入媒体", "danger");
    return;
  }
  pendingImageOperations += 1;
  try {
    const payload: ImagePayload = "file" in request
      ? { name: request.name, dataUrl: await fileToDataUrl(request.file) }
      : { name: request.name, dataUrl: request.dataUrl };
    const targetFilePath = currentFilePath.value;
    const uploaded = kind === "image" ? await uploadImageIfConfigured(payload) : "";
    const saved = uploaded || (settings.value.imageInsertAction === "none"
      ? payload.dataUrl
      : await saveImageAsset(
        targetFilePath || null,
        payload.name,
        payload.dataUrl,
        settings.value.imageInsertAction,
      ));
    const src = formatInsertedImageSource(
      saved,
      settings.value.escapeImageUrls,
      settings.value.addDotSlashToRelativeImagePath,
    );
    const markup = `${request.prefix ?? ""}${buildLocalMediaMarkup(kind, src, payload.name)}`;
    const inserted = editorRef.value?.replaceMediaPlaceholder(placeholder, markup);
    showToast(
      inserted
        ? uploaded ? "图片已上传并插入" : "媒体已插入"
        : "媒体插入位置已被移除，未插入媒体",
      inserted ? "success" : "info",
    );
  } catch (error) {
    editorRef.value?.replaceMediaPlaceholder(placeholder, null);
    showToast(formatError(error), "danger");
  } finally {
    pendingImageOperations = Math.max(0, pendingImageOperations - 1);
    if (pendingImageOperations === 0) scheduleAutoSave();
  }
}

async function handleMediaFilePath(
  path: string,
  kind: LocalMediaKind,
  placeholder?: string,
  prefix = "",
) {
  const insertionPlaceholder = placeholder ?? editorRef.value?.reserveImageInsertion();
  if (!insertionPlaceholder) {
    showToast("编辑器尚未就绪，无法插入媒体", "danger");
    return;
  }
  pendingImageOperations += 1;
  try {
    const targetFilePath = currentFilePath.value;
    const saved = settings.value.imageInsertAction === "none"
      ? path
      : kind === "image"
        ? await copyImageFileAsset(targetFilePath || null, path, settings.value.imageInsertAction)
        : await copyMediaFileAsset(targetFilePath || null, path, settings.value.imageInsertAction);
    const src = formatInsertedImageSource(
      saved,
      settings.value.escapeImageUrls,
      settings.value.addDotSlashToRelativeImagePath,
    );
    const markup = `${prefix}${buildLocalMediaMarkup(kind, src, basename(path))}`;
    const inserted = editorRef.value?.replaceMediaPlaceholder(insertionPlaceholder, markup);
    showToast(inserted ? "媒体已插入" : "媒体插入位置已被移除，未插入媒体", inserted ? "success" : "info");
  } catch (error) {
    editorRef.value?.replaceMediaPlaceholder(insertionPlaceholder, null);
    showToast(formatError(error), "danger");
  } finally {
    pendingImageOperations = Math.max(0, pendingImageOperations - 1);
    if (pendingImageOperations === 0) scheduleAutoSave();
  }
}

async function insertImageFile() {
  try {
    if (isTauriRuntime()) {
      const paths = await pickImageFile();
      if (paths.length === 0 || !await ensureSavedDocumentForMedia()) return;
      await handleMediaFilePaths(paths.map((path) => ({ path, kind: "image" })));
      return;
    }

    const files = await openBrowserImageFile();
    await handleMediaFiles(files, "image");
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

async function handleMediaFilePaths(
  media: Array<{ path: string; kind: LocalMediaKind }>,
) {
  const requests = media.map((item, index) => ({
    ...item,
    prefix: index > 0 ? "\n\n" : "",
    placeholder: editorRef.value?.reserveImageInsertion() ?? undefined,
  }));
  for (const request of requests) {
    await handleMediaFilePath(
      request.path,
      request.kind,
      request.placeholder,
      request.prefix,
    );
  }
}

async function handleMediaFiles(files: File[], fallbackPrefix = "drop") {
  const supported = files.flatMap((file) => {
    const kind = getLocalMediaKind(file.name, file.type);
    return kind ? [{ file, kind }] : [];
  });
  const requests = supported.map((item, index) => ({
      ...item,
      prefix: index > 0 ? "\n\n" : "",
      placeholder: editorRef.value?.reserveImageInsertion() ?? undefined,
  }));
  for (const request of requests) {
    const { file, kind, placeholder, prefix } = request;
    await handleImageData({
      name: file.name || `${fallbackPrefix}-${Date.now()}.${getDefaultMediaExtension(kind)}`,
      file,
      kind,
      prefix,
      placeholder,
    });
  }
}

function requiresSavedDocumentForMedia(
  kind: LocalMediaKind = "image",
  canUploadImage = false,
): boolean {
  if (kind === "image" && canUploadImage && settings.value.uploadUrl.trim()) return false;
  return isTauriRuntime()
    && settings.value.imageInsertAction !== "none"
    && !currentFilePath.value;
}

async function ensureSavedDocumentForMedia(
  kind: LocalMediaKind = "image",
  canUploadImage = false,
): Promise<boolean> {
  if (!requiresSavedDocumentForMedia(kind, canUploadImage)) return true;
  if (!mediaDocumentSaveInFlight) {
    mediaDocumentSaveInFlight = saveAsFile()
      .then((saved) => {
        const ready = saved && Boolean(currentFilePath.value);
        if (!ready) showToast("文档尚未保存，已取消插入本地媒体", "info");
        return ready;
      })
      .finally(() => {
        mediaDocumentSaveInFlight = null;
      });
  }
  return mediaDocumentSaveInFlight;
}

function getDefaultMediaExtension(kind: LocalMediaKind): string {
  if (kind === "video") return "mp4";
  if (kind === "audio") return "mp3";
  return "png";
}

async function setupNativeFileDrop() {
  try {
    unlistenNativeDrop = await listenNativeFileDrops(handleDroppedPaths);
  } catch (error) {
    console.warn("注册桌面拖拽事件失败", error);
  }
}

async function setupNativeWindowClose() {
  try {
    unlistenWindowClose = await listenWindowCloseRequested(handleNativeWindowClose);
  } catch (error) {
    console.warn("注册桌面窗口关闭事件失败", error);
  }
}

async function handleNativeWindowClose() {
  if (nativeCloseInProgress) return;
  nativeCloseInProgress = true;
  try {
    if (await confirmDocumentChange()) {
      await destroyCurrentWindow();
    }
  } catch (error) {
    showToast(`关闭窗口失败：${formatError(error)}`, "danger");
  } finally {
    nativeCloseInProgress = false;
  }
}

async function handleDroppedPaths(drop: NativeFileDrop) {
  dragActive.value = false;
  dragDepth = 0;
  const { paths, position } = drop;

  const folderPath = await findDroppedFolderPath(paths);
  if (folderPath) {
    await loadWorkspaceFolder(folderPath, "已加载拖入的文件夹");
    showSidebarTab("files");
    return;
  }

  const markdownPath = paths.find(isMarkdownPath);
  if (markdownPath) {
    const opened = await openFileByPath(markdownPath);
    if (opened && !rootPath.value) {
      await loadWorkspaceFolder(dirname(markdownPath), "已将拖入文件所在文件夹作为工作区打开");
      showSidebarTab("files");
    }
    return;
  }

  const media = paths.flatMap((path) => {
    const kind = getLocalMediaKind(path);
    return kind ? [{ path, kind }] : [];
  });
  if (media.length === 0) return;
  editorRef.value?.setCursorAtCoordinates(position.x, position.y);
  if (!await ensureSavedDocumentForMedia()) return;
  await handleMediaFilePaths(media);
}

async function findDroppedFolderPath(paths: string[]): Promise<string | null> {
  if (!isTauriRuntime()) return null;

  for (const path of paths) {
    if (await isDirectoryPath(path)) {
      return path;
    }
  }
  return null;
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

  const media = files.flatMap((file) => {
    const kind = getLocalMediaKind(file.name, file.type);
    return kind ? [{ file, kind }] : [];
  });
  if (media.length === 0) return;
  editorRef.value?.setCursorAtCoordinates(event.clientX, event.clientY);
  const saveRequiredBy = media.find(({ kind }) => requiresSavedDocumentForMedia(kind, true));
  if (saveRequiredBy && !await ensureSavedDocumentForMedia(saveRequiredBy.kind, true)) return;
  await handleMediaFiles(media.map(({ file }) => file));
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
    if (format === "html" && !isTauriRuntime()) {
      downloadHtmlExport();
      showToast("已导出 HTML 文件", "success");
      return;
    }

    const output = await exportWithPandoc(
      markdown.value,
      currentFilePath.value || null,
      format,
      buildExportFileName(currentFileName.value, format),
    );
    if (output) {
      showToast(`已导出 ${output}`, "success");
    } else if (format === "pdf") {
      showToast("已打开打印窗口，可另存为 PDF", "info");
    }
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

function downloadHtmlExport() {
  const html = buildExportHtml({
    title: currentFileName.value.replace(/\.[^.]+$/, ""),
    markdown: markdown.value,
    outline: outline.value,
    settings: effectiveSettings.value,
    basePath: currentFilePath.value || undefined,
  });
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildExportFileName(currentFileName.value, "html");
  link.click();
  URL.revokeObjectURL(url);
}

function printDocument() {
  window.print();
}

function changeZoom(delta: number) {
  const next = Math.min(1.5, Math.max(0.75, Number((settings.value.zoom + delta).toFixed(2))));
  patchSettings({ zoom: next });
}

function resetZoom() {
  patchSettings({ zoom: 1 });
}

async function toggleFullscreen() {
  try {
    await toggleNativeFullscreen();
  } catch (error) {
    showToast(formatError(error), "danger");
  }
}

function patchSettings(patch: Partial<EditorSettings>) {
  settings.value = {
    ...settings.value,
    ...patch,
  };
}

function startSidebarResize(event: PointerEvent) {
  event.preventDefault();
  cleanupSidebarResize();
  const startX = event.clientX;
  const startWidth = sidebarWidth.value;

  const handleMove = (moveEvent: PointerEvent) => {
    sidebarWidth.value = clampSidebarWidth(startWidth + moveEvent.clientX - startX);
  };
  const cleanup = () => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", cleanup);
    window.removeEventListener("pointercancel", cleanup);
    document.body.classList.remove("is-resizing-sidebar");
    if (sidebarResizeCleanup === cleanup) sidebarResizeCleanup = null;
  };

  sidebarResizeCleanup = cleanup;
  document.body.classList.add("is-resizing-sidebar");
  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", cleanup, { once: true });
  window.addEventListener("pointercancel", cleanup, { once: true });
}

function cleanupSidebarResize() {
  sidebarResizeCleanup?.();
}

function openQuickOpen() {
  quickOpenVisible.value = true;
  recentPanelVisible.value = false;
  wordCountVisible.value = false;
  settingsVisible.value = false;
  aboutVisible.value = false;
}

function closeQuickOpen(restoreEditorFocus = true) {
  quickOpenVisible.value = false;
  quickQuery.value = "";
  quickActiveIndex.value = 0;
  if (!restoreEditorFocus) return;
  nextTick(() => {
    editorRef.value?.focus();
  });
}

function openQuickResult(path?: string) {
  if (!path) return;
  closeQuickOpen();
  void openFileByPath(path);
}

function handleQuickOpenKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case "Escape":
      event.preventDefault();
      closeQuickOpen();
      break;
    case "Enter":
      event.preventDefault();
      openQuickResult(activeQuickFile.value?.path);
      break;
    case "ArrowDown":
      event.preventDefault();
      moveQuickSelection(1);
      break;
    case "ArrowUp":
      event.preventDefault();
      moveQuickSelection(-1);
      break;
    case "Home":
      event.preventDefault();
      quickActiveIndex.value = 0;
      void nextTick(scrollActiveQuickResultIntoView);
      break;
    case "End":
      event.preventDefault();
      quickActiveIndex.value = clampQuickOpenIndex(filteredQuickFiles.value.length - 1, filteredQuickFiles.value.length);
      void nextTick(scrollActiveQuickResultIntoView);
      break;
    default:
      break;
  }
}

function moveQuickSelection(delta: number) {
  quickActiveIndex.value = moveQuickOpenIndex(quickActiveIndex.value, filteredQuickFiles.value.length, delta);
  void nextTick(scrollActiveQuickResultIntoView);
}

function scrollActiveQuickResultIntoView() {
  const row = quickListRef.value?.querySelector<HTMLElement>(`[data-quick-index="${quickActiveIndex.value}"]`);
  row?.scrollIntoView({ block: "nearest" });
}

async function openFindPanel(showReplace = false) {
  quickOpenVisible.value = false;
  recentPanelVisible.value = false;
  wordCountVisible.value = false;
  settingsVisible.value = false;
  aboutVisible.value = false;
  const wasVisible = findPanelVisible.value;
  const nextQuery = getFindQueryFromSelection(selectionStats.value.selectedText, findQuery.value);
  const queryChanged = nextQuery !== findQuery.value;
  if (nextQuery !== findQuery.value) {
    findQuery.value = nextQuery;
    findActiveIndex.value = -1;
  }
  findPanelVisible.value = true;
  findReplaceVisible.value = showReplace || findReplaceVisible.value;
  await nextTick();
  if (currentFindMatches.value.length > 0 && (!wasVisible || queryChanged || findActiveIndex.value < 0)) {
    findActiveIndex.value = findInitialMatchIndex(
      currentFindMatches.value,
      selectionStats.value.selectionStart,
      selectionStats.value.selectionEnd,
    );
  }
}

function closeFindPanel() {
  findPanelVisible.value = false;
  findReplaceVisible.value = false;
  findActiveIndex.value = -1;
  nextTick(() => {
    editorRef.value?.focus();
  });
}

function openWordCountPanel() {
  quickOpenVisible.value = false;
  recentPanelVisible.value = false;
  settingsVisible.value = false;
  aboutVisible.value = false;
  wordCountVisible.value = true;
}

function closeWordCountPanel() {
  wordCountVisible.value = false;
  nextTick(() => {
    editorRef.value?.focus();
  });
}

function openSettingsPanel() {
  quickOpenVisible.value = false;
  recentPanelVisible.value = false;
  wordCountVisible.value = false;
  findPanelVisible.value = false;
  findReplaceVisible.value = false;
  aboutVisible.value = false;
  settingsVisible.value = true;
}

function closeSettingsPanel() {
  settingsVisible.value = false;
  nextTick(() => {
    editorRef.value?.focus();
  });
}

async function goToFindMatch(direction: 1 | -1 = 1) {
  const matches = currentFindMatches.value;
  if (matches.length === 0) return;

  const current = currentFindMatch.value;
  const cursor = current ? current.index + (direction > 0 ? current.length : 0) : 0;
  findActiveIndex.value = findNextMatchIndex(matches, cursor, direction);
  await selectCurrentFindMatch();
}

async function navigateFindShortcut(direction: 1 | -1) {
  if (!findQuery.value) {
    await openFindPanel(false);
    return;
  }

  if (!findPanelVisible.value) {
    findPanelVisible.value = true;
    await nextTick();
  }

  const matches = currentFindMatches.value;
  if (matches.length === 0) return;

  if (findActiveIndex.value < 0 || findActiveIndex.value >= matches.length) {
    findActiveIndex.value = direction > 0 ? 0 : matches.length - 1;
    await selectCurrentFindMatch();
    return;
  }

  await goToFindMatch(direction);
}

async function openGlobalSearchPanel() {
  recentPanelVisible.value = false;
  quickOpenVisible.value = false;
  wordCountVisible.value = false;
  settingsVisible.value = false;
  aboutVisible.value = false;
  showSidebarTab("search");
  await nextTick();
  await sidebarRef.value?.focusSearch();
}

function showFileView(mode: FilePanelMode) {
  filePanelMode.value = mode;
  showSidebarTab("files");
}

function showSidebarTab(tab: SidebarTab) {
  const next = activateSidebarTab({
    sidebarVisible: sidebarVisible.value,
    focusMode: settings.value.focusMode,
    activeTab: sidebarActiveTab.value,
  }, tab);
  sidebarVisible.value = next.sidebarVisible;
  sidebarActiveTab.value = next.activeTab;
  if (settings.value.focusMode !== next.focusMode) {
    patchSettings({ focusMode: next.focusMode });
  }
}

function openRecentFilesPanel() {
  recentPanelVisible.value = true;
  recentContextMenu.value = null;
  quickOpenVisible.value = false;
  wordCountVisible.value = false;
  settingsVisible.value = false;
  aboutVisible.value = false;
}

function openAboutDialog() {
  quickOpenVisible.value = false;
  recentPanelVisible.value = false;
  wordCountVisible.value = false;
  settingsVisible.value = false;
  findPanelVisible.value = false;
  findReplaceVisible.value = false;
  aboutVisible.value = true;
}

function closeAboutDialog() {
  aboutVisible.value = false;
  nextTick(() => editorRef.value?.focus());
}

function closeRecentFilesPanel() {
  recentPanelVisible.value = false;
  recentContextMenu.value = null;
  nextTick(() => {
    editorRef.value?.focus();
  });
}

function openRecentFile(path: string) {
  closeRecentFilesPanel();
  void openFileByPath(path);
}

function openRecentContextMenu(file: RecentFile, event: MouseEvent) {
  const position = clampSidebarContextMenuPosition(
    event.clientX,
    event.clientY,
    window.innerWidth,
    window.innerHeight,
    4,
  );
  recentContextMenu.value = {
    target: {
      path: file.path,
      name: file.name,
      isDir: false,
      source: "recent",
    },
    ...position,
  };
}

async function runRecentContextAction(action: SidebarFileContextAction) {
  const menu = recentContextMenu.value;
  recentContextMenu.value = null;
  if (!menu) return;
  if (action === "openFile") closeRecentFilesPanel();
  await runSidebarFileContextAction(action, menu.target);
}

async function openGlobalSearchResult(result: SearchResult) {
  await openSearchResult(result);
}

async function selectCurrentFindMatch() {
  const match = currentFindMatch.value;
  if (!match) return;
  await editorRef.value?.selectRange(match.index, match.index + match.length, false);
}

async function replaceCurrentMatch() {
  const match = currentFindMatch.value;
  if (!match) return;

  const result = replaceMatchAndFindNext(
    markdown.value,
    match,
    replaceQuery.value,
    findQuery.value,
    {
      caseSensitive: findCaseSensitive.value,
      wholeWord: findWholeWord.value,
      regularExpression: findRegularExpression.value,
    },
  );
  editorRef.value?.replaceDocument(result.value);
  await nextTick();
  findActiveIndex.value = result.activeIndex;
  await selectCurrentFindMatch();
}

async function replaceEveryMatch() {
  const matches = currentFindMatches.value;
  if (matches.length === 0) return;

  editorRef.value?.replaceDocument(replaceAllMatches(
    markdown.value,
    matches,
    replaceQuery.value,
    findRegularExpression.value,
  ));
  findActiveIndex.value = -1;
  showToast(`已替换 ${matches.length} 处`, "success");
  await nextTick();
}

function getDragHint(dataTransfer: DataTransfer | null): string {
  const files = Array.from(dataTransfer?.items ?? []);
  if (files.some((item) => (
    item.kind === "file"
    && /^(?:image|video|audio)\//.test(item.type)
  ))) {
    return "松开后插入媒体";
  }
  return "松开后打开 Markdown 文件或插入媒体";
}

function isMarkdownFile(file: File): boolean {
  return isMarkdownFileLike(file.name, file.type);
}

function isMarkdownPath(path: string): boolean {
  return isMarkdownPathLike(path);
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

  const action = resolveGlobalShortcut(event);
  if (!action) return;

  event.preventDefault();
  if (blockingDialogVisible.value) return;
  switch (action) {
    case "newFile":
      void newFile();
      break;
    case "openFile":
      void openFile();
      break;
    case "closeFile":
      void closeFile();
      break;
    case "reloadFile":
      void reloadFile();
      break;
    case "quickOpen":
      openQuickOpen();
      break;
    case "save":
      void saveFile();
      break;
    case "saveAs":
      void saveAsFile();
      break;
    case "find":
      void openFindPanel(false);
      break;
    case "findNext":
      void navigateFindShortcut(1);
      break;
    case "findPrevious":
      void navigateFindShortcut(-1);
      break;
    case "jumpToSelection":
      void editorRef.value?.jumpToSelection();
      break;
    case "globalSearch":
      void openGlobalSearchPanel();
      break;
    case "replace":
      void openFindPanel(true);
      break;
    case "print":
      printDocument();
      break;
    case "zoomIn":
      changeZoom(0.05);
      break;
    case "zoomOut":
      changeZoom(-0.05);
      break;
    case "resetZoom":
      resetZoom();
      break;
    case "toggleSidebar":
      sidebarVisible.value = !sidebarVisible.value;
      break;
    case "showOutline":
      showSidebarTab("outline");
      break;
    case "showFileList":
      showFileView("list");
      break;
    case "showFileTree":
      showFileView("tree");
      break;
    case "toggleSource":
      patchSettings({ sourceMode: !settings.value.sourceMode });
      break;
    case "toggleFocus":
      patchSettings({ focusMode: !settings.value.focusMode });
      break;
    case "toggleTypewriter":
      patchSettings({ typewriterMode: !settings.value.typewriterMode });
      break;
    case "settings":
      openSettingsPanel();
      break;
    case "fullscreen":
      toggleFullscreen();
      break;
    case "openDevtools":
      void openDeveloperTools();
      break;
    default:
      break;
  }
}

async function confirmDocumentChange(switchingFile = false): Promise<boolean> {
  if (blockForPendingImages() || blockForPathMutation()) return false;
  clearAutoSaveTimer();
  if (!dirty.value) return true;

  if (shouldSaveBeforeDocumentChange(
    settings.value,
    dirty.value,
    currentFilePath.value,
    isTauriRuntime(),
    switchingFile,
  )) {
    try {
      await persistCurrentFile();
      return !dirty.value;
    } catch (error) {
      showToast(`自动保存失败：${formatError(error)}`, "danger");
      return false;
    }
  }

  const decision = await requestUnsavedDecision();
  if (decision === "cancel") {
    scheduleAutoSave();
    return false;
  }
  return true;
}

function requestUnsavedDecision(): Promise<UnsavedChangesDecision> {
  if (pendingUnsavedResolver) {
    pendingUnsavedResolver("cancel");
  }
  unsavedDialogBusy.value = false;
  unsavedDialogVisible.value = true;
  return new Promise((resolve) => {
    pendingUnsavedResolver = resolve;
  });
}

function resolveUnsavedDialog(decision: UnsavedChangesDecision) {
  if (unsavedDialogBusy.value) return;
  const resolve = pendingUnsavedResolver;
  pendingUnsavedResolver = null;
  unsavedDialogVisible.value = false;
  resolve?.(decision);
}

async function saveFromUnsavedDialog() {
  if (unsavedDialogBusy.value) return;
  unsavedDialogBusy.value = true;
  const saved = await saveFile();
  unsavedDialogBusy.value = false;
  if (saved) {
    resolveUnsavedDialog("save");
  }
}

function requestTextInput(options: TextInputDialogState): Promise<string | null> {
  pendingTextInputResolver?.(null);
  textInputDialog.value = options;
  return new Promise((resolve) => {
    pendingTextInputResolver = resolve;
  });
}

function resolveTextInputDialog(value: string | null) {
  const resolve = pendingTextInputResolver;
  pendingTextInputResolver = null;
  textInputDialog.value = null;
  resolve?.(value);
}

function requestConfirmation(options: ConfirmActionDialogState): Promise<boolean> {
  pendingConfirmActionResolver?.(false);
  confirmActionDialog.value = options;
  return new Promise((resolve) => {
    pendingConfirmActionResolver = resolve;
  });
}

function resolveConfirmActionDialog(value: boolean) {
  const resolve = pendingConfirmActionResolver;
  pendingConfirmActionResolver = null;
  confirmActionDialog.value = null;
  resolve?.(value);
}

function scheduleAutoSave() {
  if (pendingImageOperations > 0) {
    clearAutoSaveTimer();
    return;
  }
  if (!shouldAutoSaveDocument(settings.value, dirty.value, currentFilePath.value, isTauriRuntime())) {
    clearAutoSaveTimer();
    return;
  }

  const scheduleKey = `${currentFilePath.value}\u0000${settings.value.autoSaveIntervalMinutes}`;
  if (autoSaveTimer && autoSaveScheduleKey === scheduleKey) return;
  clearAutoSaveTimer();
  autoSaveScheduleKey = scheduleKey;

  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = 0;
    autoSaveScheduleKey = "";
    if (!shouldAutoSaveDocument(settings.value, dirty.value, currentFilePath.value, isTauriRuntime())) return;
    void persistCurrentFile().catch((error) => {
      showToast(`自动保存失败：${formatError(error)}`, "danger");
    });
  }, settings.value.autoSaveIntervalMinutes * 60_000);
}

function clearAutoSaveTimer() {
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = 0;
  autoSaveScheduleKey = "";
}

async function persistCurrentFile(): Promise<void> {
  if (pendingImageOperations > 0) {
    throw new Error("图片仍在处理中，请稍候再保存");
  }
  if (pathMutationInFlight > 0) {
    throw new Error("文件路径正在变更，请稍候再保存");
  }
  if (saveInFlight) {
    await saveInFlight;
    if (!dirty.value) return;
  }

  const path = currentFilePath.value;
  const source = markdown.value;
  const savedBaseline = originalMarkdown.value;
  const documentGuard = captureDocumentRevision();
  const sessionGeneration = documentSessionGeneration;
  const lineEnding = settings.value.defaultLineEnding;
  const insertFinalNewline = settings.value.insertFinalNewline;
  if (!path || !isTauriRuntime()) return;

  const task = (async () => {
    const expectedContent = await resolveExpectedDiskContent(
      path,
      savedBaseline,
      documentGuard.diskBaselineFingerprint,
      lineEnding,
      insertFinalNewline,
    );
    if (!isDocumentRevisionCurrent(documentGuard)) {
      throw new Error("文档在准备保存时发生变化，已取消本次保存");
    }
    setDiskBaseline(path, expectedContent);
    const content = prepareMarkdownForSave(
      source,
      lineEnding,
      insertFinalNewline,
    );
    await writeTextFile(path, content, expectedContent);
    if (
      documentSessionGeneration === sessionGeneration
      && isSameTreePath(currentFilePath.value, path)
    ) {
      setDiskBaseline(path, content);
      originalMarkdown.value = source;
      forceDirty.value = false;
    }
    addRecentFile(path);
  })();
  saveInFlight = task;
  try {
    await task;
  } finally {
    if (saveInFlight === task) {
      saveInFlight = null;
    }
    scheduleAutoSave();
  }
}

function blockForPendingImages(): boolean {
  if (pendingImageOperations === 0) return false;
  showToast("图片仍在处理中，请稍候", "info");
  return true;
}

function blockForPathMutation(): boolean {
  if (pathMutationInFlight === 0) return false;
  showToast("文件路径正在变更，请稍候", "info");
  return true;
}

async function resolveExpectedDiskContent(
  path: string,
  savedBaseline: string,
  expectedFingerprint: string | null,
  lineEnding: EditorSettings["defaultLineEnding"],
  insertFinalNewline: boolean,
): Promise<string> {
  const baseline = getDiskBaseline(path);
  if (baseline !== null) return baseline;

  const diskContent = await readTextFile(path);
  if (currentFilePath.value !== path) {
    throw new Error("当前文档已变化，已取消保存");
  }
  const normalizedDiskContent = normalizeEditorMarkdown(diskContent);
  const expectedSavedContent = normalizeEditorMarkdown(prepareMarkdownForSave(
    savedBaseline,
    lineEnding,
    insertFinalNewline,
  ));
  const diskMatchesBaseline = expectedFingerprint
    ? fingerprintDiskContent(diskContent) === expectedFingerprint
    : normalizedDiskContent === savedBaseline || normalizedDiskContent === expectedSavedContent;
  if (!diskMatchesBaseline) {
    throw new Error("文件已被外部修改。请重新载入文件，或使用另存为保留当前内容");
  }
  return diskContent;
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!shouldBlockNavigation(dirty.value)) return;
  event.preventDefault();
  event.returnValue = "";
}

function addRecentFile(path: string) {
  if (!settings.value.recordRecentFiles) return;
  recentFiles.value = addRecentFileEntry(recentFiles.value, path);
  localStorage.setItem(recentKey, serializeRecentFiles(recentFiles.value));
}

function replaceRecentFile(oldPath: string, newPath: string) {
  recentFiles.value = replaceRecentFileEntry(recentFiles.value, oldPath, newPath);
  localStorage.setItem(recentKey, serializeRecentFiles(recentFiles.value));
}

function hasRecentPath(path: string): boolean {
  return recentFiles.value.some((item) => isSameTreePath(item.path, path));
}

function removeRecentPath(path: string, includeChildren = false) {
  recentFiles.value = recentFiles.value.filter((item) => {
    if (includeChildren) {
      return !isPathInsideTreeRoot(item.path, path);
    }
    return !isSameTreePath(item.path, path);
  });
  localStorage.setItem(recentKey, serializeRecentFiles(recentFiles.value));
}

function clearRecentFiles() {
  recentFiles.value = [];
  localStorage.setItem(recentKey, serializeRecentFiles(recentFiles.value));
  showToast("已清空最近文件", "success");
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

function loadEditorSession(recoverUnsavedDrafts = true): EditorSessionState {
  try {
    return prepareEditorSessionForRecovery(
      parseEditorSession(localStorage.getItem(sessionKey), defaultSession),
      recoverUnsavedDrafts,
    );
  } catch {
    return defaultSession;
  }
}

function loadSettings(): EditorSettings {
  return parseEditorSettings(localStorage.getItem(settingsKey));
}

function loadRecentFiles(): RecentFile[] {
  return parseRecentFiles(localStorage.getItem(recentKey));
}

function loadSidebarVisible(): boolean {
  try {
    const stored = localStorage.getItem(sidebarKey);
    return stored === null ? true : JSON.parse(stored) !== false;
  } catch {
    return true;
  }
}

function loadSidebarWidth(): number {
  try {
    const stored = localStorage.getItem(sidebarWidthKey);
    return stored === null ? sidebarWidthDefault : clampSidebarWidth(JSON.parse(stored));
  } catch {
    return sidebarWidthDefault;
  }
}

function loadFilePanelMode(): FilePanelMode {
  try {
    return JSON.parse(localStorage.getItem(filePanelModeKey) || '"tree"') === "list" ? "list" : "tree";
  } catch {
    return "tree";
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
  grid-template-rows: auto auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  background: var(--panel);
  color: var(--text);
}

.workspace {
  --sidebar-layout-width: var(--sidebar-width, 260px);
  display: grid;
  grid-row: 3;
  grid-template-columns: var(--sidebar-layout-width) 1px minmax(0, 1fr);
  min-height: 0;
}

.focus-layout .workspace {
  grid-template-columns: minmax(0, 1fr);
}

.workspace.no-sidebar {
  grid-template-columns: minmax(0, 1fr);
}

.sidebar-resizer {
  position: relative;
  width: 1px;
  min-width: 1px;
  background: var(--sidebar-divider);
  cursor: col-resize;
}

.sidebar-resizer::before {
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  left: -3px;
  content: "";
  cursor: col-resize;
}

.sidebar-resizer:hover {
  background-color: var(--border-strong);
}

:global(body.is-resizing-sidebar) {
  cursor: col-resize;
  user-select: none;
}

.editor-pane {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  background: var(--panel);
}


.editor-scroll {
  min-height: 0;
  background: var(--panel);
  overflow: auto;
}

.status-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
  min-height: 30px;
  border-top: 1px solid var(--border);
  background: var(--panel-subtle);
  color: var(--muted);
  font-size: 0.72rem;
  padding: 0 0.42rem;
}

.status-controls {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.status-controls-right {
  justify-content: flex-end;
}

.status-path {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 22px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  padding: 0 0.34rem;
  white-space: nowrap;
}

.status-item:hover,
.status-item.active {
  background: var(--hover);
  color: var(--text);
}

.status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.status-icon:hover,
.status-icon.active {
  background: var(--hover);
  color: var(--accent-strong);
}

.status-icon svg {
  width: 14px;
  height: 14px;
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

.recent-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.recent-clear:hover:not(:disabled) {
  background: var(--hover);
  color: var(--text);
}

.recent-clear svg {
  width: 16px;
  height: 16px;
}

.recent-panel {
  width: min(640px, calc(100vw - 2rem));
}

.recent-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 42px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-subtle);
  color: var(--text);
  font-size: 0.86rem;
  font-weight: 650;
  padding: 0 0.75rem 0 0.9rem;
}

.recent-clear {
  width: 30px;
  height: 30px;
  border-radius: 5px;
}

.recent-clear:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.recent-context-menu {
  position: fixed;
  z-index: 76;
  display: grid;
  width: 218px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow);
  padding: 0.28rem;
}

.recent-context-menu button {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
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

.recent-context-menu button:hover {
  background: var(--hover);
}

.recent-context-menu button.danger {
  color: var(--danger);
}

.recent-context-menu svg {
  width: 15px;
  height: 15px;
}

.recent-row {
  grid-template-columns: 16px minmax(0, 170px) minmax(0, 1fr);
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

.quick-row:hover,
.quick-row.active {
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

.find-panel {
  position: relative;
  grid-row: 2;
  z-index: 65;
  display: grid;
  gap: 0.35rem;
  width: 100%;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.06);
  padding: 0.34rem 0.5rem;
}

.find-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto auto auto auto auto auto;
  align-items: center;
  gap: 0.28rem;
}

.replace-row {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.find-input {
  width: 100%;
  height: 30px;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-subtle);
  color: var(--text);
  font-size: 0.8rem;
  padding: 0 0.52rem;
}

.find-input:focus {
  border-color: var(--border-strong);
  outline: none;
}

.find-count {
  min-width: 54px;
  color: var(--muted);
  font-size: 0.74rem;
  text-align: center;
}

.find-icon,
.find-toggle,
.find-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.find-icon,
.find-toggle {
  width: 30px;
}

.find-action {
  border: 1px solid var(--border);
  color: var(--text-main);
  font-size: 0.76rem;
  padding: 0 0.58rem;
  white-space: nowrap;
}

.find-icon:hover,
.find-toggle:hover,
.find-action:hover,
.find-toggle.active {
  background: var(--hover);
  color: var(--text);
}

.find-toggle.active {
  box-shadow: inset 0 0 0 1px var(--border-strong);
}

.find-icon svg,
.find-toggle svg {
  width: 15px;
  height: 15px;
}

.stats-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.stats-panel {
  position: absolute;
  right: 8px;
  bottom: 34px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(360px, calc(100vw - 1rem));
  max-height: min(520px, calc(100vh - 4rem));
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel);
  box-shadow: var(--shadow);
  color: var(--text);
  overflow: hidden;
}

.stats-panel:focus {
  outline: none;
}

.stats-header,
.stats-footer {
  border-color: var(--border);
  background: var(--panel-subtle);
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--border);
  padding: 0.7rem 0.82rem;
}

.stats-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.stats-title svg,
.stats-close svg {
  width: 16px;
  height: 16px;
}

.stats-title svg {
  color: var(--muted);
}

.stats-title h2 {
  margin: 0;
  color: var(--text);
  font-size: 0.96rem;
}

.stats-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.stats-close:hover {
  background: var(--hover);
  color: var(--text);
}

.stats-body {
  display: grid;
  gap: 0.75rem;
  min-height: 0;
  overflow: auto;
  padding: 0.82rem;
}

.stats-section {
  display: grid;
  gap: 0.45rem;
}

.stats-section h3 {
  margin: 0;
  color: var(--muted);
  font-size: 0.74rem;
  font-weight: 650;
}

.stats-grid {
  display: grid;
  gap: 1px;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--border);
}

.stats-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(72px, auto) 48px;
  align-items: center;
  gap: 0.6rem;
  min-height: 36px;
  background: var(--panel);
  padding: 0.42rem 0.62rem;
}

.stats-row dt {
  overflow: hidden;
  color: var(--text-main);
  font-size: 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stats-row dd {
  margin: 0;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-size: 0.92rem;
  font-weight: 650;
  text-align: right;
}

.stats-row span {
  color: var(--muted);
  font-size: 0.76rem;
  white-space: nowrap;
}

.stats-footer {
  overflow: hidden;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.74rem;
  padding: 0.58rem 0.82rem;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  .workspace {
    --sidebar-layout-width: min(var(--sidebar-width, 260px), 72vw);
  }

  .status-bar {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
}

@media (max-width: 520px) {
  .stats-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .stats-row span {
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

.status-bar,
.stats-layer {
  display: none;
}

  .editor-scroll {
    overflow: visible;
  }
}
</style>

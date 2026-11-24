<template>
  <ElConfigProvider :locale="elementLocale">
    <div class="marko-app">
      <ElSplitter class="marko-app-main" @resize-end="rememberSidebarWidth">
        <ElSplitterPanel v-if="sidebarVisible" v-model:size="sidebarWidth" :min="160" :max="600">
          <SideBar
            ref="sideBar"
            v-model:tab="sidebarTab"
            v-model:file-view="fileView"
            :api="api"
            :workspace="workspace"
            :files="workspaceFiles"
            :current-path="path"
            :outline="outline"
            :current-heading="currentHeading"
            :collapsible-outline="settings.collapsibleOutline"
            @open-folder="workspaceState.pickAndOpen()"
            @open-file="(target) => session.switchTo(target)"
            @open-match="openMatch"
            @select-heading="jumpToHeading"
            @contextmenu="(entry) => fileActions.showContextMenu(entry, entry.kind === 'folder' || fileView === 'tree' ? 'tree' : 'list')"
          />
        </ElSplitterPanel>
        <ElSplitterPanel>
          <div class="marko-app-document">
            <FindBar ref="findBar" :editor="editorInstance" :visible="findMode !== null" :mode="findMode ?? 'find'" :content="content" @close="findMode = null" />
            <MarkoEditor
              ref="editorView"
              v-model="content"
              class="marko-app-editor"
              :read-only="false"
              :file-path="path ?? ''"
              :settings="editorSettings"
              :host="host"
              @save="run('file.save')"
              @save-as="run('file.saveAs')"
              @open="run('file.open')"
              @outline-change="(items) => (outline = items)"
            />
            <StatusBar
              v-if="settings.showStatusBar"
              :editor="editorInstance"
              :path="path"
              :content="content"
              :encoding="session.encoding.value"
              :uncertain-encoding="session.uncertainEncoding.value"
              :notice="dialogs.notice.value"
              :show-word-count="settings.alwaysShowWordCount"
              @open-word-count="run('view.wordCount')"
            />
          </div>
        </ElSplitterPanel>
      </ElSplitter>
      <ChoiceDialog ref="choiceDialog" />
      <DropHint :hint="dropHint" />
      <QuickOpen v-model:visible="quickOpenVisible" :workspace="workspace !== null" :files="workspaceFiles" :recent="recentFiles" @open="(target) => session.openPath(target)" />
      <RecentFiles
        v-model:visible="recentVisible"
        :api="api"
        @open="(target) => session.openPath(target, { fromRecent: true })"
        @contextmenu="(target) => fileActions.showContextMenu({ kind: 'file', path: target }, 'recent')"
      />
      <WordCountDialog v-model:visible="wordCountVisible" :editor="editorInstance" :reading-speed="settings.readingSpeed" />
      <AboutDialog v-model:visible="aboutVisible" :load-version="() => api.app.version()" @open-homepage="(url) => api.shell.openExternal(url)" />
      <SettingsDialog v-model:visible="settingsVisible" :settings="settings" :themes="themes?.themes ?? []" :token-set="uploadTokenSet"
        :words="dictionaryWords"
        @change="(patch) => updateSettings(patch)"
        @token="setUploadToken"
        @remove-word="removeDictionaryWord"
      />
    </div>
  </ElConfigProvider>
</template>

<script setup lang="ts">
// 应用界面：布局和组装，不放业务（1.3 节）。菜单命令（menu.command）在这里分给文档会话、编辑器
import { getMarkdownWithSelection, insertMedia, jumpToAnchor, linkAt, openLink, selectSource, toModel, type MediaInsert } from "@marko/editor";
import { MarkoEditor, type OutlineItem } from "@marko/editor-vue";
import type { Editor } from "@tiptap/core";
import {
  EVENTS,
  EXPORT_FORMATS,
  exportUsesHtml,
  mediaKindOfPath,
  type ExportFormat,
  type ExportRequest,
  type MenuCommand,
  type RecentFile,
  type SearchMatch,
  type ThemeList,
  type UpdateStatus,
} from "@marko/shared";
import { ElMessageBox } from "element-plus";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { activeTheme, applyTheme, editorSettingsOf, exportTheme, themeDark } from "./appearance.ts";
import ChoiceDialog from "./components/ChoiceDialog.vue";
import DropHint from "./components/DropHint.vue";
import { useDropOpen } from "./composables/useDropOpen.ts";
import SideBar, { type FileView, type SidebarTab } from "./components/sidebar/SideBar.vue";
import FindBar from "./components/FindBar.vue";
import QuickOpen from "./components/QuickOpen.vue";
import RecentFiles from "./components/RecentFiles.vue";
import SettingsDialog from "./components/settings/SettingsDialog.vue";
import WordCountDialog from "./components/WordCountDialog.vue";
import AboutDialog from "./components/AboutDialog.vue";
import StatusBar from "./components/StatusBar.vue";
import { useWorkspace } from "./composables/useWorkspace.ts";
import { useFileActions } from "./composables/useFileActions.ts";
import { useDialogs } from "./composables/useDialogs.ts";
import { suggestedName, useDocument, type ViewKeeper } from "./composables/useDocument.ts";
import { renderExportHtml } from "./exporting.ts";
import { renderDiagram } from "./diagrams.ts";
import { measureSvg, replaceDiagrams } from "./pandocDiagrams.ts";
import { useSettings } from "./composables/useSettings.ts";
import { createHost, createMediaSaver, type HostOptions } from "./host.ts";
import { basename } from "./paths.ts";
import { i18n, setLocale, t } from "./i18n.ts";
import { defaultElementLocale, elementLocaleOf } from "./elementLocale.ts";

const api = window.marko;

const choiceDialog = ref<InstanceType<typeof ChoiceDialog> | null>(null);
// 状态栏的提示（F-12）：状态栏关着时弹出来（settings 在下面定义，用的时候已经有了）
const dialogs = useDialogs(choiceDialog, () => settings.value.showStatusBar);
const { settings, update: updateSettings, ready: settingsReady } = useSettings(api);
// L-2：界面语言跟着设置，换了马上生效（不用重启）。Element Plus 自带的文字（空列表、关闭按钮的提示）跟着换；
// 它没有的语言用英文
watch(() => settings.value.language, setLocale, { immediate: true });
const elementLocale = shallowRef(defaultElementLocale);
watch(
  () => i18n.global.locale.value,
  async (code) => {
    elementLocale.value = await elementLocaleOf(code);
  },
  { immediate: true },
);
// 重新载入（F-11、F-12）时保留光标和滚动位置：载入前记下选区在原文里的偏移和滚动位置，载入后放回去
const viewKeeper: ViewKeeper = {
  capture() {
    const instance = editor();
    if (!instance) return undefined;
    const { anchor, head } = getMarkdownWithSelection(instance);
    const scroller = instance.view.dom.closest<HTMLElement>(".marko-markdown-body");
    return { anchor, head, scrollTop: scroller?.scrollTop ?? 0 };
  },
  restore(snapshot) {
    const { anchor, head, scrollTop } = snapshot as { anchor: number; head: number; scrollTop: number };
    void nextTick(() => {
      const instance = editor();
      if (!instance) return;
      const length = content.value.length;
      selectSource(instance, Math.min(anchor, length), Math.min(head, length));
      const scroller = instance.view.dom.closest<HTMLElement>(".marko-markdown-body");
      if (scroller) scroller.scrollTop = scrollTop;
    });
  },
  jumpTo(anchor) {
    pendingAnchor = anchor;
    void nextTick(jumpWhenReady);
  },
};
/** N-4：要跳的标题。新窗口里载入文档时编辑器可能还没建好，建好再跳 */
let pendingAnchor: string | null = null;
function jumpWhenReady(): void {
  const instance = editor();
  if (!instance || pendingAnchor === null) return;
  const anchor = pendingAnchor;
  pendingAnchor = null;
  jumpToAnchor(instance, anchor);
}
const session = useDocument(api, dialogs, () => settings.value, viewKeeper);
const { content, path } = session;

const editorView = ref<{ editor: () => unknown; focus: () => void; showTableDialog: () => void } | null>(null);
const editorInstance = shallowRef<Editor | null>(null);
watch(editorView, (view) => {
  editorInstance.value = (view?.editor() as Editor | null) ?? null;
});
watch(editorInstance, (instance, previous) => {
  if (instance) void nextTick(jumpWhenReady);
  previous?.off("selectionUpdate", updateCurrentHeading);
  previous?.off("update", updateCurrentHeading);
  instance?.on("selectionUpdate", updateCurrentHeading);
  instance?.on("update", updateCurrentHeading);
});

/** 源码模式只在这个窗口里（E-11） */
const sourceMode = ref(false);

// 查找栏（N-1、N-2）：打开时换上编辑器里选中的文字（只取一行的；焦点在查找栏里再按 Ctrl+F 时不取）
const findMode = ref<"find" | "replace" | null>(null);
const findBar = ref<InstanceType<typeof FindBar> | null>(null);

function selectedLine(): string | undefined {
  const instance = editor();
  if (!instance || (findMode.value && findBar.value?.hasFocus())) return undefined;
  const { from, to, empty } = instance.state.selection;
  if (empty) return undefined;
  const text = instance.state.doc.textBetween(from, to, "\n");
  return text.includes("\n") ? undefined : text;
}

function openFind(mode: "find" | "replace"): void {
  const text = selectedLine();
  // 替换行显示着时按 Ctrl+F 不收起它（同旧版）
  findMode.value = mode === "replace" || findMode.value === "replace" ? "replace" : "find";
  findBar.value?.open(text);
}

// 侧栏（W-7）：显示与否、页签、宽度（宽度在会话恢复 F-16 的切片里记到主进程）
const workspaceState = useWorkspace(api, (message) => dialogs.error(message));

// 侧栏的右键菜单（W-6）、文件操作（F-13）
const fileActions = useFileActions(api, {
  documentPath: () => path.value,
  workspaceRoot: () => workspaceState.workspace.value?.root ?? null,
  openHere: (target) => session.switchTo(target),
  openWorkspace: (root) => workspaceState.open(root),
  refreshWorkspace: () => workspaceState.refresh(),
  removeRecent: async (target) => {
    await api.recent.remove(target);
    // 最近文件面板开着：重新打开一次刷新列表
    if (recentVisible.value) {
      recentVisible.value = false;
      await nextTick();
      recentVisible.value = true;
    }
  },
  confirmTrash: (name) => dialogs.confirmTrash(name),
  info: (message) => dialogs.info(message),
  error: (message) => dialogs.error(message),
});

/** 焦点在输入框里（不是编辑区） */
function focusedInput(): HTMLInputElement | HTMLTextAreaElement | null {
  const active = document.activeElement;
  return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
}
const { workspace, files: workspaceFiles } = workspaceState;
const sidebarVisible = ref(true);
const sidebarTab = ref<SidebarTab>("files");

// F-15：拖到窗口上的文件夹作为工作区打开（侧栏切到文件），Markdown 文件按 F-3 打开
const { hint: dropHint } = useDropOpen(api, {
  editorRoot: () => document.querySelector<HTMLElement>(".marko-markdown-body"),
  onResult(result) {
    if (!result.ok) {
      session.applyTarget(result);
      return;
    }
    if (result.value.workspace) {
      workspaceState.workspace.value = result.value.workspace;
      sidebarVisible.value = true;
      sidebarTab.value = "files";
    }
    if (result.value.document) session.applyTarget({ ok: true, value: result.value.document });
  },
});
const fileView = ref<FileView>("tree");
const sidebarWidth = ref<number | string>(260);
const sideBar = ref<InstanceType<typeof SideBar> | null>(null);

// 字数统计（V-4）、关于（R-5）
const wordCountVisible = ref(false);
const aboutVisible = ref(false);

// 偏好设置（S-1）；上传 Token 只知道有没有填（M-4）
const settingsVisible = ref(false);
const uploadTokenSet = ref(false);
/** S-10 用户词典里的词：打开偏好设置时读一次 */
const dictionaryWords = ref<string[]>([]);
/** R-4：自动更新的消息。下载好了问要不要重启；手动检查的结果提示一下 */
async function showUpdateStatus(status: UpdateStatus): Promise<void> {
  if (status.kind === "downloaded") {
    try {
      await ElMessageBox.confirm(t("update.downloaded", { version: status.version }), t("update.title"), {
        confirmButtonText: t("update.restart"),
        cancelButtonText: t("update.later"),
        type: "info",
      });
    } catch {
      return;
    }
    // 关窗口前照常问没保存的改动（F-10）
    await api.update.install();
    return;
  }
  if (status.kind === "error") dialogs.error(t("update.failed", { message: status.message ?? "" }));
  else dialogs.info(t(`update.${status.kind}`, { version: status.version }));
}

async function openSettings(): Promise<void> {
  [uploadTokenSet.value, dictionaryWords.value] = await Promise.all([api.upload.hasToken(), api.spellcheck.words()]);
  settingsVisible.value = true;
}
async function removeDictionaryWord(word: string): Promise<void> {
  await api.spellcheck.removeWord(word);
  dictionaryWords.value = await api.spellcheck.words();
}
async function setUploadToken(token: string | null): Promise<void> {
  const result = await api.upload.setToken(token);
  if (!result.ok) dialogs.error(result.error.message);
  uploadTokenSet.value = await api.upload.hasToken();
  if (result.ok) dialogs.info(token ? t("upload.tokenSaved") : t("upload.tokenCleared"));
}

// 快速打开（F-4）、最近文件面板（F-5）
const quickOpenVisible = ref(false);
const recentVisible = ref(false);
const recentFiles = ref<RecentFile[]>([]);
async function openQuickOpen(): Promise<void> {
  recentFiles.value = await api.recent.list();
  quickOpenVisible.value = true;
}

// 侧栏（W-7）变了告诉主进程：下次启动恢复（F-16）、新窗口沿用。开始时的侧栏放好以前不报
let layoutReady = false;
let layoutTimer: ReturnType<typeof setTimeout> | undefined;
function reportLayout(): void {
  if (!layoutReady) return;
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    const width = typeof sidebarWidth.value === "number" ? sidebarWidth.value : Number.parseInt(String(sidebarWidth.value), 10);
    void api.window.setLayout({
      sidebarVisible: sidebarVisible.value,
      sidebarWidth: Math.min(1_000, Math.max(120, Math.round(Number.isFinite(width) ? width : 260))),
      sidebarTab: sidebarTab.value,
      fileView: fileView.value,
    });
  }, 300);
}
watch([sidebarVisible, sidebarTab, fileView], reportLayout);
/** 拖动侧栏边缘结束（ElSplitter 的 resize-end） */
function rememberSidebarWidth(): void {
  reportLayout();
}

/** 原文里第 line 行（从 1 开始）开头的偏移；没有这一行时是 null */
function lineOffset(text: string, line: number): number | null {
  let offset = 0;
  for (let current = 1; current < line; current += 1) {
    const next = text.indexOf("\n", offset);
    if (next === -1) return null;
    offset = next + 1;
  }
  return offset;
}

/** 点全局搜索的一条结果（W-5）：在这个窗口里换成那个文件（F-8、F-10），选中那一处 */
async function openMatch(target: string, match: SearchMatch): Promise<void> {
  if (!(await session.switchTo(target))) return;
  await nextTick();
  const instance = editor();
  if (!instance) return;
  // ripgrep 的行、列不算开头的 BOM
  const bom = content.value.startsWith("﻿") ? 1 : 0;
  const text = content.value.slice(bom);
  const start = lineOffset(text, match.line);
  if (start === null) return;
  const from = Math.min(text.length, start + match.column);
  const to = Math.min(text.length, from + match.length);
  selectSource(instance, bom + from, bom + to);
}

// 大纲（W-4）：编辑器发来的标题；光标所在的标题（光标前面最近的一个）
const outline = ref<OutlineItem[]>([]);
const currentHeading = ref<number | null>(null);

function headingPositions(): number[] {
  const positions: number[] = [];
  editor()?.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading") positions.push(pos);
    return !node.isTextblock;
  });
  return positions;
}

function updateCurrentHeading(): void {
  const instance = editor();
  if (!instance) return;
  const head = instance.state.selection.head;
  const positions = headingPositions();
  let index: number | null = null;
  positions.forEach((pos, i) => {
    if (pos < head) index = i;
  });
  currentHeading.value = index;
}

/** 点大纲里的标题：光标放到这个标题，滚过去 */
function jumpToHeading(index: number): void {
  const instance = editor();
  const pos = headingPositions()[index];
  if (!instance || pos === undefined) return;
  instance.chain().setTextSelection(pos + 1).focus().run();
  // 标题滚到顶上（同 Typora），不只是滚到能看见
  const dom = instance.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "start" });
}

const systemDark = ref(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
const theme = computed(() => activeTheme(settings.value, systemDark.value));
/** 内置主题和用户主题目录里的（A-3）；目录里的文件变了主进程通知 */
const themes = shallowRef<ThemeList | null>(null);
watch([theme, themes], () => applyTheme(theme.value, themes.value), { immediate: true });

const editorSettings = computed(() => editorSettingsOf(settings.value, themeDark.value, sourceMode.value));

const hostOptions: HostOptions = {
  documentPath: () => path.value,
  // M-3：新文档插入要复制的媒体前先保存（另存为），取消就不插入
  saveFirst: async () => ((await session.save()) ? path.value : null),
  insertAction: () => settings.value.imageInsertAction,
  diagramTheme: () => (editorSettings.value.theme === "dark" ? "dark" : "light"),
  openLocal: (target, anchor) => void session.openLink(target, anchor),
  reportError: (message) => dialogs.error(message),
};
const media = createMediaSaver(api, hostOptions);
const host = createHost(api, hostOptions, media);

/** 「格式 → 图片 → 插入本地图片...」（M-2、M-7）：选图片、视频、音频，按 M-3 复制后插到光标处 */
async function insertLocalMedia(): Promise<void> {
  const instance = editor();
  if (!instance) return;
  const items: MediaInsert[] = [];
  for (const target of await api.media.pick()) {
    const kind = mediaKindOfPath(target);
    if (kind) items.push({ name: basename(target), kind, save: () => media.savePath(target) });
  }
  if (items.length) await insertMedia(instance, items);
}

function editor(): Editor | null {
  return editorInstance.value;
}

/** 菜单命令：应用的动作，其余当编辑器命令的名字 */
function run(id: string, argument?: string): void {
  switch (id) {
    case "file.new":
      void session.newDocument();
      return;
    case "file.open":
      void session.pickAndOpen();
      return;
    case "file.openRecent":
      if (argument) void session.openPath(argument, { fromRecent: true });
      return;
    case "file.quickOpen":
      void openQuickOpen();
      return;
    case "file.showRecent":
      recentVisible.value = true;
      return;
    case "app.preferences":
      void openSettings();
      return;
    case "view.wordCount":
      wordCountVisible.value = true;
      return;
    case "app.about":
      aboutVisible.value = true;
      return;
    case "file.save":
      void session.save();
      return;
    case "file.saveAs":
      void session.saveAs();
      return;
    case "file.reload":
      void session.reload();
      return;
    case "file.reopenWithEncoding":
      if (argument) void session.reopenWithEncoding(argument);
      return;
    // 编辑菜单：焦点在输入框里（查找栏、搜索框……）时作用在输入框上，否则在编辑器上
    case "editor.undo":
    case "editor.redo":
      if (focusedInput()) document.execCommand(id === "editor.undo" ? "undo" : "redo");
      else if (id === "editor.undo") editor()?.commands.undo();
      else editor()?.commands.redo();
      return;
    case "editor.selectAll": {
      const input = focusedInput();
      if (input) input.select();
      else editor()?.commands.selectAll();
      return;
    }
    // C-4：主进程读好剪贴板里的纯文本交过来
    case "editor.pastePlainText":
      if (!argument) return;
      if (focusedInput()) document.execCommand("insertText", false, argument);
      else editor()?.commands.pastePlainText(argument);
      return;
    // F-13：「文件 → 文件操作」
    case "file.rename":
    case "file.copyPath":
    case "file.reveal":
    case "file.openFolder":
      void fileActions.currentFileAction(id.slice("file.".length) as "rename" | "copyPath" | "reveal" | "openFolder");
      return;
    case "view.sourceMode":
      sourceMode.value = !sourceMode.value;
      return;
    case "view.focusMode":
      void updateSettings({ focusMode: !settings.value.focusMode });
      return;
    case "view.typewriterMode":
      void updateSettings({ typewriterMode: !settings.value.typewriterMode });
      return;
    case "view.sidebar":
      sidebarVisible.value = !sidebarVisible.value;
      return;
    case "view.outline":
      sidebarVisible.value = true;
      sidebarTab.value = "outline";
      return;
    case "view.fileTree":
    case "view.fileList":
      sidebarVisible.value = true;
      sidebarTab.value = "files";
      fileView.value = id === "view.fileTree" ? "tree" : "list";
      return;
    case "find.open":
      openFind("find");
      return;
    case "find.replace":
      openFind("replace");
      return;
    // 查找栏开着时 F3 由编辑器、查找栏自己处理；关着时（编辑器里没有查找条件）才走到菜单这里：打开查找栏
    case "find.next":
    case "find.previous":
      if (!findMode.value) openFind("find");
      else if (id === "find.next") findBar.value?.next();
      else findBar.value?.previous();
      return;
    case "view.search":
      sidebarVisible.value = true;
      void nextTick(() => sideBar.value?.focusSearch());
      return;
    case "workspace.open":
      void workspaceState.pickAndOpen();
      return;
    // W-1：「文件 → 工作区」
    case "workspace.openContaining":
      if (!path.value) dialogs.info(t("files.notSaved"));
      else
        void workspaceState.openContaining().then((opened) => {
          if (!opened) return;
          sidebarVisible.value = true;
          sidebarTab.value = "files";
        });
      return;
    // W-2：在文件树里展开到当前文件
    case "view.revealInTree": {
      const target = path.value;
      if (!target) {
        dialogs.info(t("files.notSaved"));
        return;
      }
      sidebarVisible.value = true;
      sidebarTab.value = "files";
      fileView.value = "tree";
      void nextTick()
        .then(() => sideBar.value?.revealInTree(target))
        .then((found) => {
          if (!found) dialogs.info(t("sidebar.notInWorkspace"));
        });
      return;
    }
    case "workspace.refresh":
      void workspaceState.refresh();
      return;
    case "workspace.close":
      void workspaceState.close();
      return;
    // 「段落 → 表格 → 插入表格...」：同 Ctrl+T 的小窗口（T-1）
    case "table.insert":
      editorView.value?.showTableDialog();
      return;
    case "image.setWidth":
      void askImageWidth();
      return;
    case "image.insertLocal":
      void insertLocalMedia();
      return;
    case "export":
      if (argument && (EXPORT_FORMATS as readonly string[]).includes(argument)) void exportAs(argument as ExportFormat);
      return;
    case "export.last":
      void exportLast();
      return;
    case "file.print":
      void printDocument();
      return;
    case "file.import":
      void importDocument();
      return;
    // 「格式 → 打开链接」：光标所在的链接（同 Ctrl+Shift+O，N-4）
    case "editor.openLink": {
      const instance = editor();
      const url = instance ? linkAt(instance.state, instance.state.selection.head, instance.storage.marko.host) : null;
      if (instance && url) openLink(instance, url);
      return;
    }
    default: {
      // 其余是编辑器命令的名字（「段落」「格式」菜单）；带参数的（Callout 的种类）一起给
      const command = (editor()?.commands as unknown as Record<string, ((argument?: string) => boolean) | undefined>)?.[id];
      if (command) command(argument);
    }
  }
}

// ---------------------------------------------------------------------------
// 导出、打印（O 章）、导入（F-19）

/** 导出的标题：文件名去掉扩展名，新文档用第一个标题 */
function exportTitle(): string {
  const name = path.value ? basename(path.value) : suggestedName(content.value);
  return name.replace(/\.[^.]+$/, "");
}

function exportHtml(instance: Editor, plain: boolean): Promise<string> {
  const readThemeCss = async (file: string) => {
    const result = await api.themes.exportCss(file);
    return result.ok ? result.value : "";
  };
  return exportTheme(theme.value, themes.value, readThemeCss).then((style) =>
    renderExportHtml(instance, { title: exportTitle(), documentPath: path.value, css: style.css, dark: style.dark, settings: settings.value, plain }),
  );
}

async function exportAs(format: ExportFormat, options: { path?: string } = {}): Promise<void> {
  const instance = editor();
  if (!instance) return;
  const request: ExportRequest = { format, title: exportTitle(), documentPath: path.value, ...(options.path ? { path: options.path } : {}) };
  try {
    if (exportUsesHtml(format)) request.html = await exportHtml(instance, format === "htmlPlain");
    else {
      // Pandoc 的格式用 Markdown 原文（不带 BOM），图表先画成图片（O-4）
      const tools = { render: (kind: string, source: string) => renderDiagram(kind, source, "light"), size: measureSvg };
      const { markdown, diagrams } = await replaceDiagrams(toModel(instance.state.doc), tools, crypto.randomUUID().slice(0, 8));
      request.markdown = markdown;
      if (diagrams.length) request.diagrams = diagrams;
    }
  } catch (error) {
    dialogs.error(t("export.failed", { message: error instanceof Error ? error.message : String(error) }));
    return;
  }
  const result = await api.export.run(request);
  if (!result.ok) dialogs.error(t("export.failed", { message: result.error.message }));
  else if (result.value) dialogs.info(t("export.done", { path: result.value.path }));
}

/** O-7：按这个文档上次的格式和位置直接导出 */
async function exportLast(): Promise<void> {
  const last = path.value ? await api.export.last(path.value) : null;
  if (!last) dialogs.info(t("export.noLast"));
  else await exportAs(last.format, { path: last.path });
}

/** O-5：打印排好版的文档（不是编辑界面） */
async function printDocument(): Promise<void> {
  const instance = editor();
  if (!instance) return;
  const result = await api.export.print(await exportHtml(instance, false));
  if (!result.ok) dialogs.error(t("export.printFailed", { message: result.error.message }));
}

/** F-19：Pandoc 转成 Markdown，在新窗口里打开 */
async function importDocument(): Promise<void> {
  const result = await api.import.run();
  if (!result.ok) dialogs.error(t("export.importFailed", { message: result.error.message }));
}

/** 「格式 → 图片 → 设置图片宽度...」（M-5）：数字按 px，也可以带单位（50%、20em） */
async function askImageWidth(): Promise<void> {
  const instance = editor();
  if (!instance) return;
  let width: string;
  try {
    const result = await ElMessageBox.prompt(t("image.widthMessage"), t("image.widthTitle"), {
      confirmButtonText: t("common.ok"),
      cancelButtonText: t("common.cancel"),
      inputPattern: /^\s*\d+(?:\.\d+)?\s*(?:px|%|em|rem|vw)?\s*$/i,
      inputErrorMessage: t("image.widthInvalid"),
    });
    width = result.value.trim();
  } catch {
    return;
  }
  instance.commands.focus();
  if (!instance.commands.setImageWidth(width)) dialogs.info(t("image.noImage"));
}

let offMenu: () => void = () => {};
let offScheme: (() => void) | null = null;
let offThemes: () => void = () => {};
let offUpdate: () => void = () => {};

onMounted(async () => {
  offMenu = api.on(EVENTS.menuCommand, (command: MenuCommand) => run(command.id, command.argument));
  offThemes = api.on(EVENTS.themesChanged, (list) => (themes.value = list));
  offUpdate = api.on(EVENTS.updateStatus, (status) => void showUpdateStatus(status));
  void api.themes.list().then((list) => (themes.value = list));
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (media) {
    const listener = (event: MediaQueryListEvent) => (systemDark.value = event.matches);
    media.addEventListener("change", listener);
    offScheme = () => media.removeEventListener("change", listener);
  }
  // 侧栏、工作区（F-16 恢复的；从别的窗口开的沿用它的，W-1、W-7）。没有记下的侧栏时页签按 S-4「默认侧栏」
  const state = await api.window.initialState();
  if (state.layout) {
    sidebarVisible.value = state.layout.sidebarVisible;
    sidebarWidth.value = state.layout.sidebarWidth;
    sidebarTab.value = state.layout.sidebarTab;
    fileView.value = state.layout.fileView;
  } else {
    await settingsReady;
    sidebarTab.value = settings.value.defaultSidebarTab;
  }
  layoutReady = true;
  if (state.workspace) void workspaceState.open(state.workspace);
  // 异常退出以后按草稿开的窗口：恢复草稿（F-9）；否则是要显示的文档（F-3、F-14）
  const draft = await api.window.initialDraft();
  if (draft) await session.restoreDraft(draft);
  else {
    const initial = await api.window.initialDocument();
    if (initial) session.load(initial);
  }
});

onBeforeUnmount(() => {
  offMenu();
  offThemes();
  offUpdate();
  offScheme?.();
});
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  background: var(--md-background, #fff);
}

.marko-app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.marko-app-main {
  flex: 1;
  min-height: 0;
}

.marko-app-document {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.marko-app-editor {
  flex: 1;
  min-height: 0;
}
</style>

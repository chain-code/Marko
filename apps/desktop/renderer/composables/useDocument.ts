// 一个窗口里的文档会话（F 章）：路径、编辑器里的原文、打开（上次保存）时的原文、编码、磁盘上内容的指纹。
// 有没有改过 = 原文和上次保存的不一样；保存前主进程比对指纹（F-6）；关窗口前问（F-10）；标题栏跟着状态（F-17）；
// 自动保存（F-8）；草稿（F-9）；文件被别的程序改了、删了（F-12）
import {
  EVENTS,
  type FileChange,
  type MarkoApi,
  type MarkoError,
  type OpenTarget,
  type OpenedDocument,
  type RecoveredDraft,
  type Result,
  type SavedFile,
  type Settings,
} from "@marko/shared";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { basename } from "../paths.ts";
import { t } from "../i18n.ts";

export type UnsavedChoice = "save" | "discard" | "cancel";
export type ConflictChoice = "overwrite" | "reload" | "saveAs" | "cancel";
export type ExternalChangeChoice = "keep" | "reload";
export type DraftChoice = "draft" | "disk";

/** 要用户决定的地方（界面在 App.vue 里用 Element Plus 实现；测试里换成假的） */
export interface DocumentDialogs {
  /** 未保存确认（F-10） */
  confirmUnsaved(title: string): Promise<UnsavedChoice>;
  /** 保存时发现文件被别的程序改过（F-6） */
  resolveConflict(title: string): Promise<ConflictChoice>;
  /** 有没保存的改动时文件在外部被修改了（F-12）：保留我的改动，或载入磁盘上的版本 */
  resolveExternalChange(title: string): Promise<ExternalChangeChoice>;
  /** 恢复草稿时原文件在这期间被改过（F-9）：用草稿，或用磁盘上的版本 */
  resolveDraftConflict(title: string): Promise<DraftChoice>;
  /** 打开最近文件失败：要不要从列表里去掉（F-3） */
  confirmRemoveRecent(path: string, message: string): Promise<boolean>;
  error(message: string): void;
  info(message: string): void;
  /** 状态栏提示一下（F-12 自动重新载入以后）；状态栏关着时弹提示 */
  status(message: string): void;
}

/** 重新载入时保留光标和滚动位置（F-11、F-12）：界面给，记下编辑器的状态，载入以后放回去 */
export interface ViewKeeper {
  capture(): unknown;
  restore(snapshot: unknown): void;
  /** N-4：跳到锚点（解码后的）相同的标题；载入的文档带锚点时、本地链接指向这个窗口的文档时 */
  jumpTo?(anchor: string): void;
}

/** 停止输入多久写一次草稿（F-9） */
const DRAFT_DELAY = 1_000;

/** 新文档另存时建议的文件名：第一个标题，没有时「未命名.md」（F-7） */
export function suggestedName(markdown: string): string {
  const heading = /^ {0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(markdown)?.[1] ?? /^(.+)\r?\n {0,3}(?:=+|-+)[ \t]*$/m.exec(markdown)?.[1];
  const name = heading?.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return name ? `${name}.md` : t("app.untitledFile");
}

/** 保存时补末尾换行（S-3），换行符同文件里用的 */
function withFinalNewline(content: string): string {
  if (!content || /[\r\n]$/.test(content)) return content;
  return content + (content.includes("\r\n") ? "\r\n" : "\n");
}

/** 草稿编号（F-9）：主进程只收字母、数字、连字符 */
function newDraftId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function useDocument(api: MarkoApi, dialogs: DocumentDialogs, settings: () => Settings, view: ViewKeeper | null = null) {
  const path = ref<string | null>(null);
  /** 编辑器里的原文（v-model） */
  const content = ref("");
  /** 打开、上次保存时的原文 */
  const savedContent = ref("");
  const encoding = ref("utf-8");
  const bom = ref(false);
  /** 磁盘上内容的指纹（新文档、文件被删了是 null） */
  const hash = ref<string | null>(null);
  /** 文件被删除、改名了（F-12）：内容保留，保存时按另存为 */
  const deleted = ref(false);
  /** 识别不出编码、按 UTF-8 读的（F-18：状态栏提示） */
  const uncertainEncoding = ref(false);
  const saving = ref(false);
  /** 这个窗口的草稿编号（F-9） */
  let draftId = newDraftId();
  let draftWritten = false;

  const edited = computed(() => content.value !== savedContent.value);
  const title = computed(() => {
    const name = path.value ? basename(path.value) : t("app.untitledFile");
    return deleted.value ? t("document.deletedTitle", { title: name }) : name;
  });
  /** 没改过的空白新文档：F-3 可以直接在这个窗口里打开别的文件 */
  const pristine = computed(() => path.value === null && content.value === "");

  watch(
    [path, title, edited, pristine, hash],
    () => {
      void api.window.setDocumentState({ path: path.value, title: title.value, edited: edited.value, pristine: pristine.value, hash: hash.value });
    },
    { immediate: true },
  );

  function load(document: OpenedDocument): void {
    path.value = document.path;
    encoding.value = document.encoding;
    bom.value = document.bom;
    hash.value = document.hash;
    deleted.value = false;
    savedContent.value = document.content;
    content.value = document.content;
    uncertainEncoding.value = document.uncertainEncoding === true;
    if (document.anchor) view?.jumpTo?.(document.anchor);
  }

  function reportFailure(action: "save" | "saveAs" | "reload" | "open", error: MarkoError): void {
    dialogs.error(t("document.failed", { action: t(`document.action.${action}`), message: error.message }));
  }

  function forDisk(text: string): string {
    return settings().insertFinalNewline ? withFinalNewline(text) : text;
  }

  // -------------------------------------------------------------------------
  // 草稿（F-9）：停止输入 1 秒后把没保存的内容交给主进程；没有改动了（保存了、换了文件）就删掉

  let draftTimer: ReturnType<typeof setTimeout> | undefined;

  async function removeDraft(): Promise<void> {
    clearTimeout(draftTimer);
    if (!draftWritten) return;
    draftWritten = false;
    await api.draft.remove(draftId);
  }

  function writeDraft(): void {
    if (!edited.value || !settings().recoverUnsavedDrafts) {
      void removeDraft();
      return;
    }
    draftWritten = true;
    void api.draft.save({ id: draftId, path: path.value, content: content.value, encoding: encoding.value, bom: bom.value, hash: hash.value });
  }

  watch([content, edited], () => {
    clearTimeout(draftTimer);
    if (edited.value) draftTimer = setTimeout(writeDraft, DRAFT_DELAY);
    else void removeDraft();
  });

  // -------------------------------------------------------------------------
  // 保存（F-6、F-7）

  /**
   * 保存时主进程改写了地址（F-19：导入的图片复制到了文档旁边）：编辑器里的内容照着改（保住光标和滚动位置）；
   * 返回改写后的 snapshot（存下去的就是它）
   */
  function rewritten(snapshot: string, replaced: SavedFile["replaced"]): string {
    if (!replaced?.length) return snapshot;
    const apply = (text: string) => [...replaced].sort((left, right) => right.from.length - left.from.length).reduce((result, { from, to }) => result.split(from).join(to), text);
    const kept = view?.capture();
    content.value = apply(content.value);
    if (kept !== undefined) view?.restore(kept);
    return apply(snapshot);
  }

  async function saveAs(): Promise<boolean> {
    const snapshot = content.value;
    saving.value = true;
    try {
      const result = await api.file.saveAs({
        content: forDisk(snapshot),
        encoding: encoding.value,
        bom: bom.value,
        suggestedName: path.value ? basename(path.value) : suggestedName(snapshot),
        defaultPath: path.value,
      });
      if (!result.ok) {
        reportFailure("saveAs", result.error);
        return false;
      }
      if (!result.value) return false;
      path.value = result.value.path;
      hash.value = result.value.hash;
      deleted.value = false;
      uncertainEncoding.value = false;
      savedContent.value = rewritten(snapshot, result.value.replaced);
      if (!edited.value) await removeDraft();
      return true;
    } finally {
      saving.value = false;
    }
  }

  async function writeTo(expectedHash: string | null): Promise<Result<SavedFile>> {
    return api.file.save({ path: path.value!, content: forDisk(content.value), encoding: encoding.value, bom: bom.value, expectedHash });
  }

  /** quiet：自动保存（F-8）——文件被别的程序改过时不弹窗、不覆盖（由 F-12 的提示处理） */
  async function save(options: { quiet?: boolean } = {}): Promise<boolean> {
    // 文件在外部被修改、正在问用户：等选完（F-12）
    await externalChange;
    // 新文档、文件被删了：另存为（F-12）
    if (!path.value || deleted.value) return options.quiet ? false : saveAs();
    const snapshot = content.value;
    saving.value = true;
    try {
      let result = await writeTo(hash.value);
      if (!result.ok && result.error.code === "conflict") {
        if (options.quiet) return false;
        const choice = await dialogs.resolveConflict(title.value);
        if (choice === "saveAs") return await saveAs();
        if (choice === "reload") {
          await readFromDisk();
          return false;
        }
        if (choice !== "overwrite") return false;
        result = await writeTo(null);
      }
      if (!result.ok) {
        if (!options.quiet) reportFailure("save", result.error);
        return false;
      }
      hash.value = result.value.hash;
      // 按现在的编码写下去了（F-18）
      uncertainEncoding.value = false;
      savedContent.value = rewritten(snapshot, result.value.replaced);
      if (!edited.value) await removeDraft();
      return true;
    } finally {
      saving.value = false;
    }
  }

  /** 从磁盘重新读（F-11、F-12）：光标和滚动位置尽量保留 */
  async function readFromDisk(withEncoding?: string): Promise<boolean> {
    if (!path.value) return false;
    const result = await api.file.read(path.value, withEncoding);
    if (!result.ok) {
      reportFailure("reload", result.error);
      return false;
    }
    const snapshot = view?.capture();
    load(result.value);
    if (snapshot !== undefined) view?.restore(snapshot);
    return true;
  }

  /** 有没保存的改动时先问（F-10）；返回 false 表示用户取消了 */
  async function settleChanges(): Promise<boolean> {
    if (!edited.value) return true;
    const choice = await dialogs.confirmUnsaved(title.value);
    if (choice === "save") return save();
    if (choice === "discard") {
      await removeDraft();
      return true;
    }
    return false;
  }

  /** 重新载入（F-11） */
  async function reload(): Promise<void> {
    if (!path.value || !(await settleChanges())) return;
    await readFromDisk();
  }

  /** 以其他编码重新打开（F-18）：有没保存的改动时同重新载入先问 */
  async function reopenWithEncoding(target: string): Promise<void> {
    if (!path.value) {
      dialogs.info(t("files.notSaved"));
      return;
    }
    if (!(await settleChanges())) return;
    await readFromDisk(target);
  }

  // -------------------------------------------------------------------------
  // 自动保存（F-8）：保存过的文档有了改动以后，过「自动保存间隔」保存一次（一直在改也按间隔存，不是停下来才存）

  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;

  function scheduleAutoSave(): void {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = undefined;
    const current = settings();
    if (!current.autoSave || !path.value || deleted.value || !edited.value) return;
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = undefined;
      if (edited.value && !saving.value) void save({ quiet: true }).then(() => scheduleAutoSave());
      else scheduleAutoSave();
    }, current.autoSaveIntervalMinutes * 60_000);
  }

  // 只看「有没有改动」，不看内容：一直在输入时不会重新计时
  watch(() => [edited.value, path.value, deleted.value, settings().autoSave, settings().autoSaveIntervalMinutes], scheduleAutoSave);

  // -------------------------------------------------------------------------
  // 文件在外部被修改、删除（F-12）

  /** 正在处理的外部修改：保存要等它处理完（不然用的还是旧的指纹，会报冲突） */
  let externalChange: Promise<void> = Promise.resolve();

  function handleExternalChange(change: FileChange): Promise<void> {
    const run = externalChange.then(() => applyExternalChange(change));
    externalChange = run.catch(() => undefined);
    return run;
  }

  async function applyExternalChange(change: FileChange): Promise<void> {
    if (change.path !== path.value) return;
    if (change.deleted) {
      deleted.value = true;
      hash.value = null;
      return;
    }
    deleted.value = false;
    if (!edited.value) {
      if (await readFromDisk()) dialogs.status(t("document.reloaded", { name: title.value }));
      return;
    }
    const choice = await dialogs.resolveExternalChange(title.value);
    if (choice === "reload") {
      await readFromDisk();
      await removeDraft();
      return;
    }
    // 保留我的改动：记下磁盘上现在的指纹，之后保存时覆盖它（不再提示冲突）
    hash.value = change.hash;
  }

  // -------------------------------------------------------------------------
  // 恢复草稿（F-9）

  async function restoreDraft(draft: RecoveredDraft): Promise<void> {
    draftId = draft.id;
    draftWritten = true;
    const name = draft.path ? basename(draft.path) : t("app.untitledFile");
    if (draft.disk && draft.diskChanged && (await dialogs.resolveDraftConflict(name)) === "disk") {
      load(draft.disk);
      await removeDraft();
      return;
    }
    path.value = draft.path;
    encoding.value = draft.encoding;
    bom.value = draft.bom;
    hash.value = draft.disk?.hash ?? null;
    deleted.value = !!draft.path && !draft.disk;
    savedContent.value = draft.disk?.content ?? "";
    content.value = draft.content;
    dialogs.info(draft.importedFrom ? t("document.imported", { name: draft.importedFrom }) : t("document.draftRestored", { name }));
  }

  // -------------------------------------------------------------------------
  // 打开（F-3）

  function applyTarget(result: Result<OpenTarget | null>): void {
    if (!result.ok) {
      reportFailure("open", result.error);
      return;
    }
    if (result.value?.target === "here") load(result.value.document);
  }

  /** 选文件打开（F-3） */
  async function pickAndOpen(): Promise<void> {
    applyTarget(await api.file.pickAndOpen());
  }

  /** N-4：文档里的本地链接（Markdown 按 F-3 打开再跳到标题；别的交给主进程） */
  async function openLink(target: string, anchor?: string): Promise<void> {
    const result = await api.file.openLink(target, anchor);
    if (result.ok && result.value?.target === "current") {
      if (anchor) view?.jumpTo?.(anchor);
      return;
    }
    applyTarget(result);
  }

  /** 按 F-3 的规则打开（最近文件、快速打开）；从最近文件打开失败时问要不要从列表里去掉 */
  async function openPath(target: string, options: { fromRecent?: boolean } = {}): Promise<void> {
    const result = await api.file.open(target);
    if (!result.ok && options.fromRecent && (result.error.code === "not_found" || result.error.code === "io_error")) {
      if (await dialogs.confirmRemoveRecent(target, result.error.message)) await api.recent.remove(target);
      return;
    }
    applyTarget(result);
  }

  /**
   * 在这个窗口里换成别的文件（侧栏的文件树、文件列表、搜索结果）：已经在别的窗口里打开时切过去；
   * 有没保存的改动时，S-3「切换文件时自动保存」打开、文档又有路径就先保存（F-8），否则问（F-10）。
   * 返回这个窗口里现在是不是这个文件
   */
  async function switchTo(target: string): Promise<boolean> {
    const result = await api.file.openHere(target);
    if (!result.ok) {
      reportFailure("open", result.error);
      return false;
    }
    if (result.value.target === "current") return true;
    if (result.value.target !== "here") return false;
    const settled = edited.value && path.value && !deleted.value && settings().saveOnFileSwitch ? await save() : await settleChanges();
    if (!settled) return false;
    load(result.value.document);
    return true;
  }

  /** 新建（F-1）：当前就是没改过的空白新文档时不动，否则新开一个窗口 */
  async function newDocument(): Promise<void> {
    if (!pristine.value) await api.window.newWindow();
  }

  /** 关窗口、退出（F-10、F-16）：确认过了（保存了或选了不保存）就删掉草稿再关 */
  async function handleCloseRequest(): Promise<void> {
    if (await settleChanges()) {
      await removeDraft();
      await api.window.close();
    } else await api.window.cancelClose();
  }

  const offClose = api.on(EVENTS.closeRequested, () => void handleCloseRequest());
  const offOpen = api.on(EVENTS.openFile, (document) => load(document));
  const offJump = api.on(EVENTS.jumpToAnchor, (anchor) => view?.jumpTo?.(anchor));
  const offChanged = api.on(EVENTS.fileChanged, (change) => void handleExternalChange(change));
  // F-13：在侧栏里改了名：接着编辑新路径（内容、指纹不变）
  const offRenamed = api.on(EVENTS.fileRenamed, ({ from, to }) => {
    if (path.value === from) {
      path.value = to;
      deleted.value = false;
    }
  });
  onBeforeUnmount(() => {
    offClose();
    offOpen();
    offJump();
    offChanged();
    offRenamed();
    clearTimeout(draftTimer);
    clearTimeout(autoSaveTimer);
  });

  return {
    path,
    content,
    encoding,
    edited,
    deleted,
    title,
    pristine,
    saving,
    load,
    applyTarget,
    reopenWithEncoding,
    uncertainEncoding,
    save,
    saveAs,
    reload,
    pickAndOpen,
    openPath,
    openLink,
    switchTo,
    newDocument,
    restoreDraft,
    handleCloseRequest,
    handleExternalChange,
  };
}

export type DocumentSession = ReturnType<typeof useDocument>;

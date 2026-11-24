// 确认、提示（1.3 节 useDialogs）：几个按钮的用 ChoiceDialog（ElDialog），提示用 ElMessage
import { ElMessage } from "element-plus";
import { ref, type Ref } from "vue";
import type ChoiceDialog from "../components/ChoiceDialog.vue";
import { t } from "../i18n.ts";
import type { ConflictChoice, DocumentDialogs, DraftChoice, ExternalChangeChoice, UnsavedChoice } from "./useDocument.ts";

type ChoiceDialogInstance = InstanceType<typeof ChoiceDialog>;

/** 状态栏上的提示停多久 */
const NOTICE_TIME = 5_000;

/** statusBarShown：状态栏开着没有（关着时状态栏的提示改成弹出来） */
export function useDialogs(
  dialog: Ref<ChoiceDialogInstance | null>,
  statusBarShown: () => boolean = () => true,
): DocumentDialogs & { confirmTrash(name: string): Promise<boolean>; notice: Ref<string | null> } {
  const notice = ref<string | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const choose = async (title: string, message: string, choices: Parameters<ChoiceDialogInstance["choose"]>[2], cancelValue: string) =>
    dialog.value ? dialog.value.choose(title, message, choices, cancelValue) : cancelValue;
  return {
    async confirmUnsaved(title) {
      return (await choose(t("app.name"), t("confirm.unsaved", { title }), [
        { label: t("common.save"), value: "save", primary: true },
        { label: t("common.dontSave"), value: "discard", danger: true },
        { label: t("common.cancel"), value: "cancel" },
      ], "cancel")) as UnsavedChoice;
    },
    async resolveConflict(title) {
      return (await choose(t("confirm.conflict.title"), t("confirm.conflict.message", { title }), [
        { label: t("confirm.conflict.overwrite"), value: "overwrite", danger: true },
        { label: t("confirm.conflict.reload"), value: "reload" },
        { label: t("common.saveAs"), value: "saveAs", primary: true },
        { label: t("common.cancel"), value: "cancel" },
      ], "cancel")) as ConflictChoice;
    },
    async resolveExternalChange(title) {
      return (await choose(t("confirm.externalChange.title"), t("confirm.externalChange.message", { title }), [
        { label: t("confirm.externalChange.keep"), value: "keep", primary: true },
        { label: t("confirm.externalChange.reload"), value: "reload", danger: true },
      ], "keep")) as ExternalChangeChoice;
    },
    async resolveDraftConflict(title) {
      return (await choose(t("confirm.draftConflict.title"), t("confirm.draftConflict.message", { title }), [
        { label: t("confirm.draftConflict.draft"), value: "draft", primary: true },
        { label: t("confirm.draftConflict.disk"), value: "disk" },
      ], "draft")) as DraftChoice;
    },
    async confirmTrash(name: string) {
      return (await choose(t("confirm.trash.title"), t("confirm.trash.message", { name }), [
        { label: t("confirm.trash.title"), value: "trash", danger: true },
        { label: t("common.cancel"), value: "cancel" },
      ], "cancel")) === "trash";
    },
    async confirmRemoveRecent(path, message) {
      return (await choose(t("confirm.recentMissing.title"), t("confirm.recentMissing.message", { message, path }), [
        { label: t("confirm.recentMissing.remove"), value: "remove", primary: true },
        { label: t("confirm.recentMissing.keep"), value: "keep" },
      ], "keep")) === "remove";
    },
    error(message) {
      ElMessage({ type: "error", message, grouping: true });
    },
    info(message) {
      ElMessage({ type: "info", message, grouping: true });
    },
    status(message) {
      if (!statusBarShown()) {
        ElMessage({ type: "info", message, grouping: true });
        return;
      }
      notice.value = message;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        notice.value = null;
      }, NOTICE_TIME);
    },
    notice,
  };
}

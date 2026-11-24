<template>
  <div class="settings-shortcuts" data-testid="settings-shortcuts">
    <div class="shortcuts-head">
      <ElInput v-model="filter" size="small" clearable class="shortcuts-filter" :placeholder="t('settings.shortcuts.filter')" />
      <span class="shortcuts-hint">{{ t("settings.hint.keyBindings") }}</span>
    </div>
    <template v-for="group in groups" :key="group.id">
      <div class="shortcuts-group">{{ group.label }}</div>
      <div v-for="item in group.items" :key="item.id" class="shortcuts-row" :data-shortcut="item.id">
        <span class="shortcuts-label">{{ labelOf(item) }}</span>
        <ElInput
          :model-value="recording === item.id ? t('settings.shortcuts.recording') : displayOf(item)"
          readonly
          size="small"
          class="shortcuts-key"
          :class="{ 'is-recording': recording === item.id }"
          :disabled="item.fixed"
          :placeholder="t('settings.shortcuts.none')"
          :title="item.fixed ? t('settings.shortcuts.fixed') : ''"
          @focus="recording = item.id"
          @blur="recording = recording === item.id ? null : recording"
          @keydown="(event: Event | KeyboardEvent) => record(item, event as KeyboardEvent)"
        />
        <ElButton v-if="changed(item)" link size="small" class="shortcuts-reset" @click="reset(item)">{{ t("settings.shortcuts.reset") }}</ElButton>
        <span v-else class="shortcuts-reset" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// S-12：所有菜单命令和快捷键。点右边的框再按下新的快捷键（退格清除、Esc 取消）；和别的命令撞了先问；
// 编辑器自己在用的、不能改的命令占着的不给。改过的才存（设置的 keyBindings），恢复默认就是去掉这一条
import { SHORTCUTS, shortcutConflict, shortcutOf, type ShortcutEntry, type ShortcutGroup } from "@marko/shared";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, ref } from "vue";
import { fileManagerName, t, tryT } from "../../i18n.ts";
import { acceleratorFromEvent, displayShortcut, isMacPlatform } from "../../shortcuts.ts";

const props = defineProps<{ bindings: Readonly<Record<string, string>> }>();
const emit = defineEmits<{ change: [bindings: Record<string, string>] }>();

const mac = isMacPlatform();
const filter = ref("");
/** 正在录哪一项的快捷键 */
const recording = ref<string | null>(null);

const GROUPS: Array<[ShortcutGroup, string]> = [
  ["file", "menu.file.title"],
  ["edit", "menu.edit.title"],
  ["paragraph", "menu.paragraph.title"],
  ["format", "menu.format.title"],
  ["view", "menu.view.title"],
  ["help", "menu.help.title"],
];

function labelOf(item: ShortcutEntry): string {
  const label = tryT(item.label, { manager: fileManagerName() }) ?? item.label;
  return item.detail ? t("settings.shortcuts.detail", { label, detail: item.detail }) : label;
}

function shortcutOfItem(item: ShortcutEntry, bindings = props.bindings): string {
  return shortcutOf(item, bindings, mac);
}

function displayOf(item: ShortcutEntry): string {
  return displayShortcut(shortcutOfItem(item), mac);
}

function changed(item: ShortcutEntry): boolean {
  return !item.fixed && Object.hasOwn(props.bindings, item.id);
}

const groups = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  const matches = (item: ShortcutEntry) => !needle || labelOf(item).toLowerCase().includes(needle) || displayOf(item).toLowerCase().includes(needle);
  return GROUPS.map(([id, label]) => ({ id, label: tryT(label) ?? id, items: SHORTCUTS.filter((item) => item.group === id && matches(item)) })).filter(
    (group) => group.items.length,
  );
});

/** 给 item 这个快捷键（""：不要快捷键）；和默认的一样时去掉这一条 */
function assign(item: ShortcutEntry, shortcut: string, extra: Record<string, string> = {}): void {
  const next: Record<string, string> = { ...props.bindings, ...extra };
  const fallback = shortcutOf(item, {}, mac);
  if (shortcut === fallback) delete next[item.id];
  else next[item.id] = shortcut;
  emit("change", next);
}

/** 用 shortcut 之前看撞没撞：编辑器在用的、不能改的命令占着的不给；别的命令占着的问要不要改过来 */
async function take(item: ShortcutEntry, shortcut: string): Promise<void> {
  const conflict = shortcut ? shortcutConflict(shortcut, item.id, props.bindings, mac) : null;
  const key = displayShortcut(shortcut, mac);
  if (conflict === "reserved") {
    ElMessage({ type: "error", message: t("settings.shortcuts.reserved", { key }), grouping: true });
    return;
  }
  if (conflict && conflict.fixed) {
    ElMessage({ type: "error", message: t("settings.shortcuts.fixedConflict", { key, other: labelOf(conflict) }), grouping: true });
    return;
  }
  if (conflict) {
    try {
      await ElMessageBox.confirm(t("settings.shortcuts.conflict", { key, other: labelOf(conflict), name: labelOf(item) }), t("settings.shortcuts.conflictTitle"), {
        confirmButtonText: t("settings.shortcuts.reassign"),
        cancelButtonText: t("common.cancel"),
        type: "warning",
      });
    } catch {
      return;
    }
    // 原来那一项不要快捷键了
    assign(item, shortcut, { [conflict.id]: "" });
    return;
  }
  assign(item, shortcut);
}

function record(item: ShortcutEntry, event: KeyboardEvent): void {
  if (item.fixed) return;
  // 录快捷键时按键都归这里：不让对话框按 Esc 关掉、不让菜单的快捷键生效
  event.preventDefault();
  event.stopPropagation();
  const target = event.target as HTMLElement | null;
  if (event.key === "Escape") {
    target?.blur();
    return;
  }
  const plain = !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
  if (plain && (event.key === "Backspace" || event.key === "Delete")) {
    target?.blur();
    void take(item, "");
    return;
  }
  const shortcut = acceleratorFromEvent(event, mac);
  if (!shortcut) return;
  target?.blur();
  void take(item, shortcut);
}

/** 恢复默认：默认的键现在给了别的命令时同样先问 */
function reset(item: ShortcutEntry): void {
  const fallback = shortcutOf(item, {}, mac);
  if (!fallback) {
    assign(item, "");
    return;
  }
  void take(item, fallback);
}
</script>

<style>
.settings-shortcuts {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 16px;
}

.settings-shortcuts .shortcuts-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.settings-shortcuts .shortcuts-filter {
  max-width: 280px;
}

.settings-shortcuts .shortcuts-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.settings-shortcuts .shortcuts-group {
  margin: 10px 0 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
}

.settings-shortcuts .shortcuts-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
}

.settings-shortcuts .shortcuts-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-shortcuts .shortcuts-key {
  flex: none;
  width: 170px;
}

.settings-shortcuts .shortcuts-key.is-recording .el-input__wrapper {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}

.settings-shortcuts .shortcuts-key input {
  cursor: pointer;
  text-align: center;
}

.settings-shortcuts .shortcuts-reset {
  flex: none;
  width: 64px;
}
</style>

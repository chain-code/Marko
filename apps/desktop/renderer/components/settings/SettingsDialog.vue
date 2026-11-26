<template>
  <!-- 样子同 Typora 的偏好设置：盖住整个窗口的一页，上面一条标题和关闭按钮，左边查找框和分节，右边这一节的设置项按组排 -->
  <div
    v-if="visible"
    ref="root"
    class="marko-settings"
    role="dialog"
    aria-modal="true"
    :aria-label="t('settings.title')"
    tabindex="-1"
    data-testid="settings"
    @keydown.esc="onEscape"
  >
    <header class="settings-header">
      <h2 class="settings-title">{{ t("settings.title") }}</h2>
      <span class="settings-close" role="button" :aria-label="t('common.close')" data-testid="settings-close" @click="close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 5.5 L18.5 18.5 M18.5 5.5 L5.5 18.5" /></svg>
      </span>
    </header>
    <div class="settings-body">
      <div class="settings-nav">
        <input v-model="query" class="settings-search" type="search" :placeholder="t('settings.search')" spellcheck="false" data-testid="settings-search" />
        <div role="tablist" aria-orientation="vertical" data-testid="settings-tabs">
          <span
            v-for="section in SECTIONS"
            :key="section.id"
            class="settings-nav-item"
            :class="{ active: section.id === active, 'no-search-hit': searching && !sectionMatches(section, query) }"
            role="tab"
            :aria-selected="section.id === active"
            @click="active = section.id"
            >{{ sectionLabel(section) }}</span
          >
        </div>
      </div>
      <div ref="pane" class="settings-pane">
        <div v-if="searching && !anyMatch" class="settings-empty">{{ t("settings.noResults", { query: query.trim() }) }}</div>
        <div v-else class="settings-content" :data-section="current.id">
          <h3 class="settings-section-title">{{ sectionLabel(current) }}</h3>
          <div v-for="group in current.groups" :key="group.id" class="settings-group" :data-group="group.id">
            <h5 v-if="!group.untitled" class="settings-group-title">
              <span class="settings-group-name" :class="{ 'search-hit': searching && matches(groupLabel(group), query) }">{{ groupLabel(group) }}</span>
              <span v-if="groupHint(group)" class="settings-group-hint">{{ groupHint(group) }}</span>
            </h5>
            <template v-for="field in group.fields" :key="field.key">
              <!-- S-12：快捷键整节一张表 -->
              <ShortcutsPanel v-if="field.kind === 'shortcuts'" :bindings="settings.keyBindings" @change="(value: Record<string, string>) => change(field.key, value)" />
              <div v-else-if="!field.visible || field.visible(settings)" class="settings-row" :class="[`is-${field.kind}`, { 'has-help': !!fieldHint(field) }]" :data-setting="field.key">
                <label v-if="field.kind === 'check'" class="settings-check" :class="{ 'search-hit': searching && fieldMatches(field, query) }">
                  <input type="checkbox" :checked="valueOf(settings, field.key) as boolean" @change="(event) => change(field.key, (event.target as HTMLInputElement).checked)" />
                  <span>{{ fieldLabel(field) }}</span>
                </label>
                <button v-else-if="field.kind === 'button'" type="button" class="settings-button" :class="{ 'search-hit': searching && fieldMatches(field, query) }" :data-action="field.key" @click="emit('action', field.key as SettingsAction)">
                  {{ fieldLabel(field) }}
                </button>
                <template v-else>
                  <span v-if="field.labelled" class="settings-label" :class="{ 'search-hit': searching && fieldMatches(field, query) }">{{ fieldLabel(field) }}</span>
                  <div class="settings-control">
                    <select
                      v-if="field.kind === 'select'"
                      class="settings-select"
                      :aria-label="fieldLabel(field)"
                      :value="optionIndex(field)"
                      @change="(event) => change(field.key, field.options![Number((event.target as HTMLSelectElement).value)])"
                    >
                      <option v-for="(option, index) in field.options" :key="String(option)" :value="index">{{ optionLabel(field, option) }}</option>
                    </select>
                    <select
                      v-else-if="field.kind === 'theme'"
                      class="settings-select"
                      :aria-label="fieldLabel(field)"
                      :value="valueOf(settings, field.key) as string"
                      @change="(event) => change(field.key, (event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="theme in themes" :key="theme.id" :value="theme.id">{{ themeName(theme) }}</option>
                    </select>
                    <div v-else-if="field.kind === 'radio'" class="settings-radios" role="radiogroup" :aria-label="fieldLabel(field)">
                      <label v-for="option in field.options" :key="String(option)" class="settings-radio">
                        <input type="radio" :name="field.key" :checked="valueOf(settings, field.key) === option" @change="change(field.key, option)" />
                        <span>{{ optionLabel(field, option) }}</span>
                      </label>
                    </div>
                    <template v-else-if="field.kind === 'number'">
                      <input
                        type="number"
                        class="settings-number"
                        :aria-label="fieldLabel(field)"
                        :value="valueOf(settings, field.key) as number"
                        :min="field.min"
                        :max="field.max"
                        :step="field.step"
                        @change="(event) => changeNumber(field, event.target as HTMLInputElement)"
                      />
                      <span v-if="fieldUnit(field)" class="settings-unit">{{ fieldUnit(field) }}</span>
                    </template>
                    <input
                      v-else-if="field.kind === 'text'"
                      v-model="drafts[field.key]"
                      type="text"
                      class="settings-text"
                      :aria-label="fieldLabel(field)"
                      :placeholder="tryT(`settings.placeholder.${field.key}`) ?? ''"
                      spellcheck="false"
                      @change="change(field.key, drafts[field.key])"
                    />
                    <ElSelect
                      v-else-if="field.kind === 'multi'"
                      :model-value="valueOf(settings, field.key) as string[]"
                      class="settings-multi"
                      size="small"
                      multiple
                      :aria-label="fieldLabel(field)"
                      @update:model-value="(value: string[]) => value.length && change(field.key, value)"
                    >
                      <ElOption v-for="option in field.options" :key="String(option)" :value="option" :label="optionLabel(field, option)" />
                    </ElSelect>
                    <div v-else-if="field.kind === 'token'" class="settings-token">
                      <input
                        v-model="tokenDraft"
                        type="password"
                        class="settings-text"
                        data-testid="settings-token"
                        :aria-label="fieldLabel(field)"
                        :placeholder="tokenSet ? t('settings.token.set') : t('settings.token.unset')"
                        @change="tokenDraft.trim() && emit('token', tokenDraft.trim())"
                      />
                      <button v-if="tokenSet" type="button" class="settings-button" @click="emit('token', null)">{{ t("common.clear") }}</button>
                    </div>
                    <div v-else-if="field.kind === 'codeLanguage'" class="settings-code-language">
                      <select v-model="codeMode" class="settings-select" :aria-label="fieldLabel(field)" @change="changeCodeMode(codeMode)">
                        <option value="none">{{ t("settings.codeLanguage.none") }}</option>
                        <option value="last">{{ t("settings.codeLanguage.last") }}</option>
                        <option value="fixed">{{ t("settings.codeLanguage.fixed") }}</option>
                      </select>
                      <ElSelect
                        v-if="codeMode === 'fixed'"
                        :model-value="fixedLanguage"
                        class="settings-multi"
                        size="small"
                        filterable
                        allow-create
                        default-first-option
                        :placeholder="t('settings.codeLanguage.placeholder')"
                        @update:model-value="changeFixedLanguage"
                      >
                        <ElOption v-for="language in CODE_LANGUAGES" :key="language" :value="language" :label="language" />
                      </ElSelect>
                    </div>
                    <div v-else-if="field.kind === 'dictionary'" class="settings-dictionary" data-testid="settings-dictionary">
                      <span class="settings-dictionary-title">{{ fieldLabel(field) }}</span>
                      <ElTag v-for="word in words" :key="word" size="small" closable disable-transitions @close="emit('removeWord', word)">{{ word }}</ElTag>
                      <span v-if="!words.length" class="settings-unit">{{ t("settings.dictionary.empty") }}</span>
                    </div>
                  </div>
                </template>
                <!-- 说明：右边一个「?」，鼠标移上去显示（Typora 的「?」是打开帮助文档的链接） -->
                <span v-if="fieldHint(field)" class="settings-help" :title="fieldHint(field)!" role="img" :aria-label="fieldHint(field)!">
                  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M6.2 6.3 Q6.2 4.6 8 4.6 Q9.8 4.6 9.8 6.2 Q9.8 7.3 8.6 7.8 Q8 8.1 8 8.9 V9.6" /><circle cx="8" cy="11.6" r="0.6" class="settings-help-dot" /></svg>
                </span>
              </div>
            </template>
          </div>
          <!-- 每节最后：恢复本节的默认设置（Marko 多的） -->
          <div v-if="current.id !== 'shortcuts'" class="settings-group settings-reset">
            <div class="settings-row">
              <button type="button" class="settings-button" data-testid="settings-reset" @click="resetSection">{{ t("settings.resetSection") }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 偏好设置（S-1）：样子同 Typora，改了马上生效（交给主进程保存，主进程广播给所有窗口）。下拉框、勾选框、单选框、按钮用原生的
// （Typora 就是原生控件，Element Plus 的样子对不上）；多选、可输入的下拉框、词典的词还用 Element Plus
import { LAST_CODE_LANGUAGE } from "@marko/editor";
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch, type ThemeInfo } from "@marko/shared";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { t, tryT } from "../../i18n.ts";
import {
  fieldHint,
  fieldLabel,
  fieldMatches,
  fieldUnit,
  groupHint,
  groupLabel,
  matches,
  optionLabel,
  patchOf,
  SECTIONS,
  sectionLabel,
  sectionMatches,
  valueOf,
  type Field,
  type SettingsAction,
} from "./settingsForm.ts";
import ShortcutsPanel from "./ShortcutsPanel.vue";

/** words：用户词典里的词（S-10）；section：打开时先显示的一节（「导出 → 导出设置…」是 export，X-6） */
const props = defineProps<{ visible: boolean; settings: Settings; tokenSet: boolean; themes: ThemeInfo[]; words: string[]; section?: string | null }>();
const emit = defineEmits<{
  "update:visible": [visible: boolean];
  change: [patch: SettingsPatch];
  token: [token: string | null];
  removeWord: [word: string];
  action: [action: SettingsAction];
}>();

/** 固定语言里常用的（也可以输入别的） */
const CODE_LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "bash",
  "powershell",
  "sql",
  "json",
  "yaml",
  "toml",
  "xml",
  "html",
  "css",
  "markdown",
  "diff",
];

/** 内置主题的名字跟着界面语言；用户主题是文件名 */
function themeName(theme: ThemeInfo): string {
  return theme.builtIn ? t(`themes.${theme.id as "solo" | "dark"}`) : theme.name;
}

const root = ref<HTMLElement | null>(null);
const pane = ref<HTMLElement | null>(null);
const active = ref(SECTIONS[0].id);
const current = computed(() => SECTIONS.find((section) => section.id === active.value) ?? SECTIONS[0]);
/** 查找框（同 Typora）：没有匹配的分节变淡，当前分节没有匹配时跳到第一个有匹配的；匹配的组名、设置项黄底 */
const query = ref("");
const searching = computed(() => query.value.trim() !== "");
const anyMatch = computed(() => SECTIONS.some((section) => sectionMatches(section, query.value)));
watch(query, () => {
  if (!searching.value || sectionMatches(current.value, query.value)) return;
  const first = SECTIONS.find((section) => sectionMatches(section, query.value));
  if (first) active.value = first.id;
});
// 换节时回到顶上
watch(active, () => void nextTick(() => pane.value?.scrollTo({ top: 0 })));

/** 文字输入的设置：输入时先放在这里，回车或离开输入框时再保存 */
const drafts = reactive<Record<string, string>>({});
const codeMode = ref<"none" | "last" | "fixed">("none");
/** 新的 Token：存好以后清空（主进程那边只说有没有） */
const tokenDraft = ref("");
watch(
  () => props.tokenSet,
  () => (tokenDraft.value = ""),
);
const fixedLanguage = ref("");

function onOpen(): void {
  if (props.section && SECTIONS.some((section) => section.id === props.section)) active.value = props.section;
  query.value = "";
  for (const field of SECTIONS.flatMap((section) => section.groups.flatMap((group) => group.fields))) {
    if (field.kind === "text") drafts[field.key] = String(valueOf(props.settings, field.key) ?? "");
  }
  const language = props.settings.defaultCodeLanguage;
  codeMode.value = language === "" ? "none" : language === LAST_CODE_LANGUAGE ? "last" : "fixed";
  fixedLanguage.value = codeMode.value === "fixed" ? language : "";
  // 焦点放到这一页上（Esc 关掉）
  void nextTick(() => root.value?.focus({ preventScroll: true }));
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) onOpen();
  },
  { immediate: true },
);

function close(): void {
  emit("update:visible", false);
}

/** Esc 关掉（同 Typora）；在快捷键的框里按 Esc 是取消录入，不关 */
function onEscape(event: KeyboardEvent): void {
  if (event.defaultPrevented || (event.target as HTMLElement | null)?.closest("[data-shortcut], .el-select, .el-message-box")) return;
  close();
}

/** 下拉框选中的是第几个选项（选项的值有数字、true/false，下拉框里统一用序号） */
function optionIndex(field: Field): number {
  const value = valueOf(props.settings, field.key);
  return Math.max(0, field.options?.findIndex((option) => option === value) ?? 0);
}

function change(key: string, value: unknown): void {
  emit("change", patchOf(key, value));
}

/** 数字：超出范围的拉回范围里，不是数字的不改 */
function changeNumber(field: Field, input: HTMLInputElement): void {
  const value = Number(input.value);
  if (input.value.trim() === "" || !Number.isFinite(value)) {
    input.value = String(valueOf(props.settings, field.key));
    return;
  }
  const clamped = Math.min(field.max ?? value, Math.max(field.min ?? value, value));
  const rounded = field.step && field.step < 1 ? Math.round(clamped * 10) / 10 : Math.round(clamped);
  input.value = String(rounded);
  change(field.key, rounded);
}

function changeCodeMode(mode: "none" | "last" | "fixed"): void {
  if (mode === "none") change("defaultCodeLanguage", "");
  else if (mode === "last") change("defaultCodeLanguage", LAST_CODE_LANGUAGE);
  else if (fixedLanguage.value) change("defaultCodeLanguage", fixedLanguage.value);
}

function changeFixedLanguage(language: string): void {
  // 只要语言名（信息串的第一个词），去掉围栏里不能有的字
  const name = language.trim().split(/\s+/)[0]?.replace(/[`~]/g, "") ?? "";
  fixedLanguage.value = name;
  if (name) change("defaultCodeLanguage", name);
}

/** 这一节的设置都恢复成默认值 */
function resetSection(): void {
  const patch: SettingsPatch = {};
  for (const field of current.value.groups.flatMap((group) => group.fields)) {
    // Token、词典、按钮不是设置项，恢复默认不动它们
    if (field.kind === "token" || field.kind === "dictionary" || field.kind === "button") continue;
    const part = patchOf(field.key, valueOf(DEFAULT_SETTINGS, field.key));
    Object.assign(patch, part, part.extensions ? { extensions: { ...patch.extensions, ...part.extensions } } : {});
    if (field.kind === "text") drafts[field.key] = String(valueOf(DEFAULT_SETTINGS, field.key) ?? "");
    if (field.kind === "codeLanguage") {
      codeMode.value = "none";
      fixedLanguage.value = "";
    }
  }
  emit("change", patch);
}
</script>

<style>
/* 同 Typora 的偏好设置（setting.html）：标题栏 56px 白底，下面 #fafafa；左边 35px 起 200px 宽的查找框和分节，右边内容左边空 60px */
.marko-settings {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  flex-direction: column;
  outline: none;
  background: var(--app-settings-background, #fafafa);
  color: var(--app-text, #333);
  font-family: -apple-system, "Segoe UI", "Helvetica Neue", Helvetica, "Microsoft YaHei", sans-serif;
  font-size: 13px;
  line-height: 1.6;
}

.marko-settings .settings-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  background: var(--app-settings-header, #fff);
  box-shadow:
    0 1px 0 rgba(12, 13, 14, 0.08),
    0 1px 3px rgba(12, 13, 14, 0.06);
}

.marko-settings .settings-title {
  margin: 0 0 0 35px;
  font-size: 16px;
  font-weight: 400;
  line-height: 56px;
}

/* 关闭：右边一条竖线隔开，× 24px */
.marko-settings .settings-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 62px;
  height: 26px;
  border-left: 1px solid var(--app-border, #ccc);
  cursor: pointer;
}

.marko-settings .settings-close svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
}

.marko-settings .settings-close:hover svg {
  opacity: 0.7;
}

.marko-settings .settings-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.marko-settings .settings-nav {
  flex: none;
  box-sizing: border-box;
  width: 235px;
  padding: 60px 0 0 35px;
}

.marko-settings .settings-search {
  box-sizing: border-box;
  width: 200px;
  height: 26px;
  margin-bottom: 18px;
  padding: 5px 10px;
  border: 1px solid var(--app-input-border, rgba(136, 136, 136, 0.7));
  border-radius: 1px;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
}

.marko-settings .settings-search:focus {
  border-color: var(--app-accent, #428bca);
}

.marko-settings .settings-nav-item {
  display: block;
  box-sizing: border-box;
  width: 200px;
  margin: 2px 0;
  padding: 6px 8px 6px 11px;
  border-radius: 2px;
  line-height: 20.8px;
  cursor: default;
}

.marko-settings .settings-nav-item.active {
  background: var(--app-settings-nav-active, #999);
  color: #fff;
}

.marko-settings .settings-nav-item.no-search-hit {
  opacity: 0.5;
}

.marko-settings .settings-pane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.marko-settings .settings-empty {
  margin-top: 30vh;
  text-align: center;
}

.marko-settings .settings-content {
  margin-left: 60px;
  padding: 0 60px 64px 0;
}

.marko-settings .settings-section-title {
  margin: 56px 0 28px;
  font-size: 24px;
  font-weight: 500;
  line-height: 1.43;
}

.marko-settings .settings-group {
  margin-bottom: 12px;
}

.marko-settings .settings-group-title {
  margin: 24px 0 4px;
  font-size: 13px;
  font-weight: 700;
  line-height: 20px;
}

.marko-settings .settings-group-name {
  margin-right: 12px;
}

.marko-settings .settings-group-hint {
  font-size: 12px;
  font-weight: 400;
}

.marko-settings .search-hit {
  background: rgba(255, 235, 59, 0.48);
}

.marko-settings .settings-row {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 29px;
  padding: 0 0 0 16px;
  line-height: 26px;
}

/* 下拉框、输入框右边有「?」时让出位置（勾选框的字短，同 Typora 不让） */
.marko-settings .settings-row.has-help:not(.is-check) {
  padding-right: 24px;
}

.marko-settings .settings-label {
  flex: none;
  min-width: 40%;
  padding-right: 8px;
}

.marko-settings .settings-control {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.marko-settings .is-select:not(:has(.settings-label)) .settings-control,
.marko-settings .is-text:not(:has(.settings-label)) .settings-control,
.marko-settings .is-theme:not(:has(.settings-label)) .settings-control {
  flex: none;
  width: 95%;
}

.marko-settings .settings-check,
.marko-settings .settings-radio {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.marko-settings .settings-check input,
.marko-settings .settings-radio input {
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--app-system-accent, auto);
}

.marko-settings .settings-radios {
  display: flex;
  flex: 1;
}

.marko-settings .settings-radio {
  flex: 1;
}

.marko-settings .settings-select {
  width: 100%;
  height: 20px;
  margin: 4px 0;
  font-size: 0.9em;
}

.marko-settings .settings-text {
  box-sizing: border-box;
  width: 100%;
  height: 24px;
  margin: 2px 0;
  padding: 1px 4px;
  border: 1px solid var(--app-input-border, #767676);
  border-radius: 2px;
  outline: none;
  background: var(--app-panel, #fff);
  color: inherit;
  font: inherit;
}

.marko-settings .settings-text:focus,
.marko-settings .settings-number:focus {
  border-color: var(--app-accent, #428bca);
}

.marko-settings .settings-number {
  box-sizing: border-box;
  width: 60px;
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--app-input-border, #767676);
  border-radius: 2px;
  outline: none;
  background: var(--app-panel, #fff);
  color: inherit;
  font: inherit;
}

/* 按钮同 Typora 的 btn-default：灰边、透明底 */
.marko-settings .settings-button {
  margin: 4px 0;
  padding: 6px 12px;
  border: 1px solid var(--app-input-border, #bbb);
  border-radius: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.9em;
  line-height: 1.4;
  cursor: pointer;
}

.marko-settings .settings-button:hover {
  background: var(--app-item-hover, rgba(0, 0, 0, 0.05));
}

.marko-settings .settings-multi {
  width: 100%;
}

.marko-settings .settings-token,
.marko-settings .settings-code-language {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.marko-settings .settings-code-language .settings-select {
  width: auto;
}

.marko-settings .settings-code-language .settings-multi {
  width: 180px;
}

.marko-settings .settings-dictionary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.marko-settings .settings-dictionary-title {
  min-width: 40%;
}

.marko-settings .settings-unit {
  opacity: 0.8;
}

/* 说明的「?」：右边对齐 */
.marko-settings .settings-help {
  position: absolute;
  top: 6px;
  right: 0;
  display: inline-flex;
  width: 16px;
  height: 16px;
  cursor: help;
}

.marko-settings .settings-help svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.3;
}

.marko-settings .settings-help .settings-help-dot {
  fill: currentColor;
}

.marko-settings .settings-reset {
  margin-top: 32px;
}
</style>

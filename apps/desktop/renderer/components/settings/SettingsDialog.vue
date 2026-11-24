<template>
  <ElDialog
    :model-value="visible"
    class="marko-settings"
    :title="t('settings.title')"
    width="800px"
    top="8vh"
    @update:model-value="(value: boolean) => emit('update:visible', value)"
    @open="onOpen"
  >
    <ElTabs v-model="active" tab-position="left" class="settings-tabs" data-testid="settings-tabs">
      <ElTabPane v-for="section in SECTIONS" :key="section.id" :label="sectionLabel(section)" :name="section.id">
        <ElScrollbar max-height="62vh">
          <ElForm label-position="left" label-width="190px" class="settings-form" :data-section="section.id" @submit.prevent>
            <template v-for="field in section.fields" :key="field.key">
              <!-- S-12：快捷键整节一张表，不用左边的标签栏 -->
              <ShortcutsPanel v-if="field.kind === 'shortcuts'" :bindings="settings.keyBindings" @change="(value: Record<string, string>) => change(field.key, value)" />
              <ElFormItem v-else-if="!field.visible || field.visible(settings)" :label="fieldLabel(field)" :data-setting="field.key">
                <div class="settings-control">
                  <ElSwitch v-if="field.kind === 'switch'" :model-value="valueOf(settings, field.key) as boolean" @update:model-value="(value: string | number | boolean) => change(field.key, value)" />
                  <ElSelect
                    v-else-if="field.kind === 'select'"
                    :model-value="valueOf(settings, field.key) as string"
                    class="settings-select"
                    @update:model-value="(value: unknown) => change(field.key, value)"
                  >
                    <ElOption v-for="option in field.options" :key="String(option)" :value="option" :label="optionLabel(field, option)" />
                  </ElSelect>
                  <ElSelect
                    v-else-if="field.kind === 'theme'"
                    :model-value="valueOf(settings, field.key) as string"
                    class="settings-select"
                    @update:model-value="(value: unknown) => change(field.key, value)"
                  >
                    <ElOption v-for="theme in themes" :key="theme.id" :value="theme.id" :label="themeName(theme)" />
                  </ElSelect>
                  <ElSelect
                    v-else-if="field.kind === 'multi'"
                    :model-value="valueOf(settings, field.key) as string[]"
                    class="settings-select"
                    multiple
                    @update:model-value="(value: string[]) => value.length && change(field.key, value)"
                  >
                    <ElOption v-for="option in field.options" :key="String(option)" :value="option" :label="optionLabel(field, option)" />
                  </ElSelect>
                  <ElInputNumber
                    v-else-if="field.kind === 'number'"
                    :model-value="valueOf(settings, field.key) as number"
                    :min="field.min"
                    :max="field.max"
                    :step="field.step"
                    controls-position="right"
                    @change="(value: number | undefined) => value !== undefined && change(field.key, value)"
                  />
                  <ElRadioGroup v-else-if="field.kind === 'radio'" :model-value="valueOf(settings, field.key) as string" @update:model-value="(value: unknown) => change(field.key, value)">
                    <ElRadio v-for="option in field.options" :key="String(option)" :value="option as string">{{ optionLabel(field, option) }}</ElRadio>
                  </ElRadioGroup>
                  <ElInput
                    v-else-if="field.kind === 'text'"
                    v-model="drafts[field.key]"
                    class="settings-text"
                    @change="(value: string) => change(field.key, value)"
                  />
                  <div v-else-if="field.kind === 'token'" class="settings-token">
                    <ElInput
                      v-model="tokenDraft"
                      type="password"
                      show-password
                      class="settings-text"
                      data-testid="settings-token"
                      :placeholder="tokenSet ? t('settings.token.set') : t('settings.token.unset')"
                      @change="(value: string) => value.trim() && emit('token', value.trim())"
                    />
                    <ElButton v-if="tokenSet" link type="danger" @click="emit('token', null)">{{ t("common.clear") }}</ElButton>
                  </div>
                  <div v-else-if="field.kind === 'codeLanguage'" class="settings-code-language">
                    <ElSelect v-model="codeMode" class="settings-select" @update:model-value="changeCodeMode">
                      <ElOption value="none" :label="t('settings.codeLanguage.none')" />
                      <ElOption value="last" :label="t('settings.codeLanguage.last')" />
                      <ElOption value="fixed" :label="t('settings.codeLanguage.fixed')" />
                    </ElSelect>
                    <ElSelect
                      v-if="codeMode === 'fixed'"
                      :model-value="fixedLanguage"
                      class="settings-select"
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
                    <ElTag v-for="word in words" :key="word" closable disable-transitions @close="emit('removeWord', word)">{{ word }}</ElTag>
                    <span v-if="!words.length" class="settings-hint">{{ t("settings.dictionary.empty") }}</span>
                  </div>
                  <div v-if="fieldHint(field)" class="settings-hint">{{ fieldHint(field) }}</div>
                </div>
              </ElFormItem>
            </template>
          </ElForm>
        </ElScrollbar>
      </ElTabPane>
    </ElTabs>
    <template #footer>
      <ElButton data-testid="settings-reset" @click="resetSection">{{ t("settings.resetSection") }}</ElButton>
      <ElButton type="primary" @click="emit('update:visible', false)">{{ t("common.done") }}</ElButton>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
// 偏好设置（S-1）：左边分节，右边是设置项；改了马上生效（交给主进程保存，主进程广播给所有窗口）
import { LAST_CODE_LANGUAGE } from "@marko/editor";
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch, type ThemeInfo } from "@marko/shared";
import { reactive, ref, watch } from "vue";
import { t } from "../../i18n.ts";
import { fieldHint, fieldLabel, optionLabel, patchOf, SECTIONS, sectionLabel, valueOf } from "./settingsForm.ts";
import ShortcutsPanel from "./ShortcutsPanel.vue";

/** words：用户词典里的词（S-10） */
const props = defineProps<{ visible: boolean; settings: Settings; tokenSet: boolean; themes: ThemeInfo[]; words: string[] }>();
const emit = defineEmits<{
  "update:visible": [visible: boolean];
  change: [patch: SettingsPatch];
  token: [token: string | null];
  removeWord: [word: string];
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

const active = ref(SECTIONS[0].id);
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
  for (const section of SECTIONS) {
    for (const field of section.fields) if (field.kind === "text") drafts[field.key] = String(valueOf(props.settings, field.key) ?? "");
  }
  const language = props.settings.defaultCodeLanguage;
  codeMode.value = language === "" ? "none" : language === LAST_CODE_LANGUAGE ? "last" : "fixed";
  fixedLanguage.value = codeMode.value === "fixed" ? language : "";
}

function change(key: string, value: unknown): void {
  emit("change", patchOf(key, value));
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
  const section = SECTIONS.find((item) => item.id === active.value);
  if (!section) return;
  const patch: SettingsPatch = {};
  for (const field of section.fields) {
    // Token 不是设置项（加密另存），恢复默认不动它
    if (field.kind === "token") continue;
    const part = patchOf(field.key, valueOf(DEFAULT_SETTINGS, field.key));
    Object.assign(patch, part, part.extensions ? { extensions: { ...patch.extensions, ...part.extensions } } : {});
    if (field.kind === "text") drafts[field.key] = String(valueOf(DEFAULT_SETTINGS, field.key) ?? "");
  }
  emit("change", patch);
  if (section.fields.some((field) => field.kind === "codeLanguage")) {
    codeMode.value = "none";
    fixedLanguage.value = "";
  }
}
</script>

<style>
.marko-settings .el-dialog__body {
  padding-top: 4px;
}

.marko-settings .settings-tabs {
  min-height: 420px;
}

/* 左边的分节名左对齐 */
.marko-settings .el-tabs--left .el-tabs__item.is-left {
  justify-content: flex-start;
  min-width: 150px;
}

.marko-settings .settings-form {
  padding-right: 16px;
}

.marko-settings .el-form-item {
  margin-bottom: 14px;
}

/* 设置项的名字长了（英文）就换行，这一行跟着变高，不压到下一项上（L-2） */
.marko-settings .el-form-item__label {
  height: auto;
  padding-top: 6px;
  padding-bottom: 6px;
  line-height: 20px;
}

.marko-settings .settings-control {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
}

.marko-settings .settings-select,
.marko-settings .settings-text {
  width: 280px;
}

.marko-settings .settings-token {
  display: flex;
  align-items: center;
  gap: 8px;
}

.marko-settings .settings-dictionary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 420px;
}

.marko-settings .settings-code-language {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.marko-settings .settings-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>

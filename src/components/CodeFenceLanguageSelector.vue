<template>
  <div
    ref="rootRef"
    class="code-fence-language-selector"
    :class="{ 'is-open': open }"
    @mousedown.stop
    @click.stop
    @dblclick.stop
    @keydown.stop
  >
    <button
      ref="triggerRef"
      type="button"
      class="code-fence-language-trigger"
      :class="{ 'has-language': Boolean(value) }"
      :aria-expanded="open"
      aria-haspopup="dialog"
      :title="value ? `代码语言：${value}` : '设置代码语言'"
      @mousedown.prevent
      @click="toggle"
    >
      <Code :size="13" :stroke-width="1.8" aria-hidden="true" />
      <span>{{ displayValue }}</span>
      <ChevronDown :size="13" :stroke-width="1.8" aria-hidden="true" />
    </button>

    <div
      v-if="open"
      class="code-fence-language-popover"
      role="dialog"
      aria-label="选择代码语言"
    >
      <label class="code-fence-language-search">
        <Search :size="14" :stroke-width="1.8" aria-hidden="true" />
        <input
          ref="inputRef"
          v-model="query"
          type="text"
          autocomplete="off"
          spellcheck="false"
          aria-label="搜索代码语言"
          :aria-activedescendant="activeOptionId"
          placeholder="搜索或输入语言"
          @input="activeIndex = 0"
          @keydown="handleInputKeydown"
        >
      </label>

      <div class="code-fence-language-options" role="listbox" aria-label="代码语言候选">
        <button
          v-for="(option, index) in filteredOptions"
          :id="optionId(index)"
          :key="option.identifier"
          type="button"
          class="code-fence-language-option"
          :class="{ active: index === activeIndex }"
          role="option"
          :aria-selected="option.identifier === value"
          :data-language="option.identifier"
          @mouseenter="activeIndex = index"
          @mousedown.prevent
          @click="select(option.identifier)"
        >
          <Check
            :size="14"
            :stroke-width="2"
            :class="{ visible: option.identifier === value }"
            aria-hidden="true"
          />
          <span class="code-fence-language-option-label">{{ option.label }}</span>
          <small v-if="option.label.toLowerCase() !== option.identifier.toLowerCase()">
            {{ option.identifier }}
          </small>
        </button>
      </div>

      <button
        v-if="value"
        type="button"
        class="code-fence-language-clear"
        @mousedown.prevent
        @click="select('')"
      >
        <X :size="14" :stroke-width="1.8" aria-hidden="true" />
        <span>清除语言</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { languages } from "@codemirror/language-data";
import { Check, ChevronDown, Code, Search, X } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { normalizeCodeFenceInfoString } from "@/utils/codeFenceLanguage";

interface CodeFenceLanguageOption {
  identifier: string;
  label: string;
  terms: string[];
}

const props = defineProps<{
  value: string;
  sourceOffset: number;
}>();

const emit = defineEmits<{
  select: [value: string];
}>();

const languageOptions = createLanguageOptions();
const rootRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const open = ref(false);
const query = ref("");
const activeIndex = ref(0);
const displayValue = computed(() => props.value || "代码语言");
const filteredOptions = computed(() => filterLanguageOptions(query.value));
const activeOptionId = computed(() => (
  filteredOptions.value.length > 0 ? optionId(activeIndex.value) : undefined
));

watch(filteredOptions, (options) => {
  activeIndex.value = Math.min(activeIndex.value, Math.max(0, options.length - 1));
});

onMounted(() => {
  window.addEventListener("pointerdown", handleOutsidePointerDown, true);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
});

function toggle() {
  if (open.value) {
    close(false);
    return;
  }
  open.value = true;
  query.value = props.value;
  activeIndex.value = 0;
  void nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
}

function close(restoreTrigger = false) {
  open.value = false;
  if (restoreTrigger) void nextTick(() => triggerRef.value?.focus());
}

function select(value: string) {
  const normalized = normalizeCodeFenceInfoString(value);
  open.value = false;
  emit("select", normalized);
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const length = filteredOptions.value.length;
    if (!length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    activeIndex.value = (activeIndex.value + direction + length) % length;
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  const option = filteredOptions.value[activeIndex.value];
  if (option) select(option.identifier);
}

function handleOutsidePointerDown(event: PointerEvent) {
  if (!open.value || rootRef.value?.contains(event.target as Node)) return;
  close(false);
}

function optionId(index: number): string {
  return `code-fence-language-${props.sourceOffset}-option-${index}`;
}

function filterLanguageOptions(value: string): CodeFenceLanguageOption[] {
  const normalized = normalizeCodeFenceInfoString(value).toLowerCase();
  if (!normalized) return languageOptions.slice(0, 12);

  const matches = languageOptions
    .map((option) => ({ option, score: getMatchScore(option, normalized) }))
    .filter((entry) => entry.score < 4)
    .sort((left, right) => left.score - right.score || left.option.label.localeCompare(right.option.label, "en"))
    .slice(0, 12)
    .map((entry) => entry.option);
  if (matches.length > 0) return matches;

  return [{
    identifier: normalizeCodeFenceInfoString(value),
    label: `使用“${normalizeCodeFenceInfoString(value)}”`,
    terms: [],
  }];
}

function getMatchScore(option: CodeFenceLanguageOption, queryValue: string): number {
  if (option.identifier.toLowerCase() === queryValue) return 0;
  if (option.terms.some((term) => term === queryValue)) return 0;
  if (option.terms.some((term) => term.startsWith(queryValue))) return 1;
  if (option.terms.some((term) => term.includes(queryValue))) return 2;
  return 4;
}

function createLanguageOptions(): CodeFenceLanguageOption[] {
  const supplements: CodeFenceLanguageOption[] = [
    { identifier: "text", label: "Plain Text", terms: ["text", "plain", "plaintext", "txt"] },
    { identifier: "mermaid", label: "Mermaid", terms: ["mermaid", "mmd", "diagram"] },
    { identifier: "flowchart", label: "Flowchart", terms: ["flowchart", "flow", "diagram"] },
    { identifier: "sequence", label: "Sequence", terms: ["sequence", "diagram"] },
  ];
  const result = new Map<string, CodeFenceLanguageOption>();

  for (const language of languages) {
    const aliases = language.alias ?? [];
    const identifier = (aliases.at(-1) ?? language.extensions[0] ?? language.name)
      .trim()
      .toLowerCase();
    const terms = [language.name, identifier, ...aliases, ...language.extensions]
      .map((term) => term.toLowerCase());
    result.set(identifier, { identifier, label: language.name, terms: [...new Set(terms)] });
  }
  for (const option of supplements) result.set(option.identifier, option);

  return [...result.values()].sort((left, right) => left.label.localeCompare(right.label, "en"));
}
</script>

<style scoped>
.code-fence-language-selector {
  position: relative;
  z-index: 5;
  display: flex;
  min-width: 0;
  min-height: 26px;
  justify-content: flex-end;
  margin: -13px 4px 3px;
  pointer-events: none;
}

.code-fence-language-trigger {
  display: inline-flex;
  box-sizing: border-box;
  width: 180px;
  min-width: 0;
  max-width: 100%;
  height: 26px;
  align-items: center;
  gap: 5px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  line-height: 1;
  padding: 0 7px;
  pointer-events: auto;
}

.code-fence-language-trigger {
  cursor: pointer;
}

.code-fence-language-trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-fence-language-trigger:hover,
.code-fence-language-trigger:focus-visible,
.is-open .code-fence-language-trigger {
  border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
  background: var(--panel);
  color: var(--text-main);
  outline: none;
}

.code-fence-language-trigger:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}


.code-fence-language-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 5px);
  display: grid;
  width: min(288px, calc(100vw - 32px));
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 86%, transparent);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
  color: var(--text-main);
  pointer-events: auto;
}

.code-fence-language-search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  padding: 7px 9px;
}

.code-fence-language-search input {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text-main);
  font: inherit;
  font-size: 12px;
  letter-spacing: 0;
  outline: 0;
  padding: 0;
}

.code-fence-language-search input::placeholder {
  color: var(--muted);
}

.code-fence-language-options {
  max-height: 224px;
  overflow-y: auto;
  padding: 4px;
}

.code-fence-language-option,
.code-fence-language-clear {
  display: grid;
  width: 100%;
  align-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  letter-spacing: 0;
  text-align: left;
}

.code-fence-language-option {
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 7px;
  min-height: 30px;
  font-size: 12px;
  padding: 4px 7px;
}

.code-fence-language-option:hover,
.code-fence-language-option.active {
  background: var(--panel-subtle);
}

.code-fence-language-option > svg:not(.visible) {
  visibility: hidden;
}

.code-fence-language-option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-fence-language-option small {
  color: var(--muted);
  font-size: 10px;
}

.code-fence-language-clear {
  grid-template-columns: auto 1fr;
  gap: 7px;
  min-height: 32px;
  border-top: 1px solid var(--border);
  border-radius: 0;
  color: var(--muted);
  font-size: 12px;
  padding: 6px 11px;
}

.code-fence-language-clear:hover,
.code-fence-language-clear:focus-visible {
  background: var(--panel-subtle);
  color: var(--text-main);
  outline: none;
}

@media (max-width: 520px) {
  .code-fence-language-popover {
    right: -4px;
  }
}
</style>

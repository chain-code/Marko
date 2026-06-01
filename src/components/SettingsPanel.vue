<template>
  <div class="settings-mask" @mousedown.self="$emit('close')">
    <section class="settings-panel" role="dialog" aria-modal="true">
      <header class="settings-header">
        <div>
          <p>设置</p>
          <h2>编辑与 Markdown 扩展</h2>
        </div>
        <button type="button" class="icon-button" title="关闭" @click="$emit('close')">
          <X />
        </button>
      </header>

      <div class="settings-body">
        <label class="setting-row">
          <span>
            <strong>主题</strong>
            <small>SoloLog 浅色或深色模式</small>
          </span>
          <select class="field" :value="modelValue.theme" @change="update('theme', selectValue($event))">
            <option value="solo">SoloLog</option>
            <option value="dark">深色</option>
          </select>
        </label>

        <label class="setting-row">
          <span>
            <strong>字号</strong>
            <small>{{ modelValue.fontSize }}px</small>
          </span>
          <input
            type="range"
            min="13"
            max="22"
            :value="modelValue.fontSize"
            @input="update('fontSize', numberValue($event))"
          />
        </label>

        <label class="setting-row">
          <span>
            <strong>行宽</strong>
            <small>{{ modelValue.lineWidth }}px</small>
          </span>
          <input
            type="range"
            min="640"
            max="1080"
            step="20"
            :value="modelValue.lineWidth"
            @input="update('lineWidth', numberValue($event))"
          />
        </label>

        <label class="setting-row compact">
          <span>
            <strong>拼写检查</strong>
            <small>使用系统 WebView 拼写检查</small>
          </span>
          <input
            type="checkbox"
            :checked="modelValue.spellcheck"
            @change="update('spellcheck', checkedValue($event))"
          />
        </label>

        <label class="setting-row compact">
          <span>
            <strong>自动配对符号</strong>
            <small>括号、引号和反引号自动闭合</small>
          </span>
          <input
            type="checkbox"
            :checked="modelValue.autoPair"
            @change="update('autoPair', checkedValue($event))"
          />
        </label>

        <div class="settings-section">
          <h3>Markdown 扩展</h3>
          <div class="extension-grid">
            <label v-for="item in extensionItems" :key="item.key" class="check-card">
              <input
                type="checkbox"
                :checked="modelValue.extensions[item.key]"
                @change="updateExtension(item.key, checkedValue($event))"
              />
              <span>{{ item.label }}</span>
            </label>
          </div>
        </div>

        <div class="settings-section">
          <h3>图片上传</h3>
          <label class="stack-field">
            <span>上传接口</span>
            <input
              class="field"
              :value="modelValue.uploadUrl"
              placeholder="https://example.com/upload"
              @input="update('uploadUrl', inputValue($event))"
            />
          </label>
          <label class="stack-field">
            <span>Token</span>
            <input
              class="field"
              :value="modelValue.uploadToken"
              placeholder="Bearer token"
              @input="update('uploadToken', inputValue($event))"
            />
          </label>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { X } from "lucide-vue-next";
import type { EditorSettings, MarkdownExtensionSettings } from "@/types";

const props = defineProps<{
  modelValue: EditorSettings;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: EditorSettings];
  close: [];
}>();

const extensionItems: Array<{ key: keyof MarkdownExtensionSettings; label: string }> = [
  { key: "html", label: "HTML" },
  { key: "toc", label: "目录" },
  { key: "mermaid", label: "Mermaid" },
  { key: "flowchart", label: "Flowchart" },
  { key: "footnote", label: "脚注" },
  { key: "alerts", label: "Callout" },
  { key: "emoji", label: "Emoji" },
  { key: "marks", label: "高亮/上下标" },
];

function update<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) {
  emit("update:modelValue", {
    ...props.modelValue,
    [key]: value,
  });
}

function updateExtension(key: keyof MarkdownExtensionSettings, value: boolean) {
  emit("update:modelValue", {
    ...props.modelValue,
    extensions: {
      ...props.modelValue.extensions,
      [key]: value,
    },
  });
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

function selectValue(event: Event): EditorSettings["theme"] {
  return (event.target as HTMLSelectElement).value as EditorSettings["theme"];
}

function numberValue(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
}

function checkedValue(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}
</script>

<style scoped>
.settings-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  background: rgba(15, 23, 42, 0.42);
  padding: 1rem;
}

.settings-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(680px, 100%);
  max-height: min(760px, calc(100vh - 2rem));
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--border);
  padding: 1rem 1.1rem;
}

.settings-header p {
  color: var(--muted);
  font-size: 0.78rem;
}

.settings-header h2 {
  font-size: 1.05rem;
  font-weight: 650;
}

.settings-body {
  display: grid;
  gap: 0.85rem;
  min-height: 0;
  overflow: auto;
  padding: 1rem 1.1rem 1.2rem;
}

.setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: center;
  gap: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-subtle);
  padding: 0.75rem;
}

.setting-row.compact {
  grid-template-columns: minmax(0, 1fr) auto;
}

.setting-row span,
.stack-field {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
}

.setting-row strong,
.settings-section h3 {
  color: var(--text);
  font-size: 0.92rem;
  font-weight: 650;
}

.setting-row small,
.stack-field span {
  color: var(--muted);
  font-size: 0.78rem;
}

.settings-section {
  display: grid;
  gap: 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-subtle);
  padding: 0.85rem;
}

.extension-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
}

.check-card {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--panel);
  color: var(--text-main);
  padding: 0.48rem 0.55rem;
}

.check-card span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .setting-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .extension-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
